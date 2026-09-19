import { join, basename } from 'path';
import { existsSync, writeFileSync, readdirSync, statSync } from 'fs';
import { homedir } from 'os';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { scanProject } from '../scanner/file-scanner.js';
import { analyzeProject } from '../scanner/project-analyzer.js';
import { loadConfig, saveConfig } from '../config/manager.js';
import {
  generateLatexProjectEntry,
  updateLatexResume,
  exportResumePDF,
} from '../services/resume-manager.js';
import { convertPDFToLatex } from '../services/pdf-to-latex.js';
import { logger, spinner } from '../utils/logger.js';
import { resolveProjectDirectory } from '../utils/project-root.js';

export interface ResumeCommandOpts {
  ai?: boolean;
  setup?: boolean;
  show?: boolean;
  file?: string;
  fromPdf?: string;    // --from-pdf <path>: convert PDF resume → .tex
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function cmdResume(opts: ResumeCommandOpts): Promise<void> {
  if (opts.show)  { showResumeConfig(); return; }

  // --from-pdf: convert an existing PDF resume to LaTeX
  if (opts.fromPdf) {
    await convertFromPDF(opts.fromPdf.trim());
    return;
  }

  // --file shortcut
  if (opts.file) {
    await setResumeFile(opts.file.trim());
    return;
  }

  if (opts.setup) { await setupResume(); return; }

  // If resume not configured at all, auto-enter setup
  const config = loadConfig();
  if (!config.resume?.path || !existsSync(config.resume.path)) {
    logger.blank();
    logger.info('No resume configured yet.');
    await setupResume();
    const updated = loadConfig();
    if (!updated.resume?.path) return;
  }

  await runResumeUpdate(resolveProjectDirectory().root, opts.ai !== false, true);
}

// ─── PDF to LaTeX converter ───────────────────────────────────────────────────

async function convertFromPDF(pdfPath: string): Promise<void> {
  // Strip surrounding quotes (drag-and-drop on Windows adds them)
  const cleanPath = pdfPath.replace(/^["']|["']$/g, '');

  if (!existsSync(cleanPath)) {
    logger.error(`PDF not found: ${cleanPath}`);
    logger.dimmed('Usage: autogit resume --from-pdf "C:\\path\\to\\resume.pdf"');
    return;
  }

  if (!cleanPath.toLowerCase().endsWith('.pdf')) {
    logger.error('File must be a .pdf');
    return;
  }

  logger.header('PDF → LaTeX Resume Conversion');
  logger.blank();
  logger.info(`Source: ${chalk.cyan(cleanPath)}`);
  logger.blank();

  const config = loadConfig();

  const { name } = await inquirer.prompt<{ name: string }>([{
    type: 'input',
    name: 'name',
    message: 'Your full name (for the LaTeX heading):',
    default: config.resume?.ownerName || '',
  }]);

  const { email } = await inquirer.prompt<{ email: string }>([{
    type: 'input',
    name: 'email',
    message: 'Your email:',
    default: config.resume?.ownerEmail || '',
  }]);

  const { website } = await inquirer.prompt<{ website: string }>([{
    type: 'input',
    name: 'website',
    message: 'Your website (optional, e.g. vardh.me):',
    default: '',
  }]);

  logger.blank();

  try {
    const result = await convertPDFToLatex(cleanPath, {
      name: name.trim(),
      email: email.trim(),
      website: website.trim(),
    });

    logger.blank();
    logger.success(`LaTeX resume saved to: ${chalk.cyan(result.outputPath)}`);
    logger.blank();

    // Ask if they want to use this as their autogit resume
    const { useIt } = await inquirer.prompt<{ useIt: boolean }>([{
      type: 'confirm',
      name: 'useIt',
      message: 'Use this .tex file as your autogit resume (for auto project entries)?',
      default: true,
    }]);

    if (useIt) {
      config.resume = {
        path: result.outputPath,
        ownerName: name.trim(),
        ownerEmail: email.trim(),
        enabled: config.resume?.enabled ?? true,
      };
      saveConfig(config);
      logger.success('Resume configured! Run "autogit resume" in any project to add entries.');
    }

    logger.blank();
    logger.info('Next steps:');
    logger.dimmed(`  1. Open the file: ${result.outputPath}`);
    logger.dimmed('  2. Review and adjust the content');
    logger.dimmed('  3. Compile with: pdflatex ' + basename(result.outputPath));
    logger.dimmed('  4. Or upload to Overleaf: https://overleaf.com');

  } catch (e: any) {
    logger.error(`Conversion failed: ${e.message}`);
    if (e.message.includes('image-only') || e.message.includes('scanned')) {
      logger.blank();
      logger.info('Your PDF appears to be a scanned image. Options:');
      logger.dimmed('  • Use a text-based PDF (export from Word, Google Docs, etc.)');
      logger.dimmed('  • Run OCR first using Adobe Acrobat or an online tool');
    }
  }
}

// ─── Quick file setter (--file flag) ─────────────────────────────────────────

async function setResumeFile(filePath: string): Promise<void> {
  if (!filePath.toLowerCase().endsWith('.tex')) {
    logger.error('File must be a .tex file');
    return;
  }
  if (!existsSync(filePath)) {
    logger.error(`File not found: ${filePath}`);
    return;
  }
  const config = loadConfig();
  config.resume = {
    ...config.resume,
    path: filePath,
    ownerName: config.resume?.ownerName || 'Developer',
    ownerEmail: config.resume?.ownerEmail || '',
    enabled: config.resume?.enabled ?? true,
  };
  saveConfig(config);
  logger.success(`Resume set to: ${chalk.cyan(filePath)}`);
  logger.dimmed('Run "autogit resume" in a project folder to generate an entry.');
}

// ─── Called from the main pipeline ───────────────────────────────────────────

export async function runResumeUpdate(
  projectDir: string,
  useAI: boolean,
  interactive: boolean,
  existingScan?: import('../scanner/file-scanner.js').ScanResult
): Promise<void> {
  const config = loadConfig();
  const resumeCfg = config.resume;

  if (!resumeCfg?.path || !existsSync(resumeCfg.path)) {
    if (!interactive) return;
    logger.blank();
    logger.warn('Resume file not found or not configured.');
    const { setup } = await inquirer.prompt<{ setup: boolean }>([{
      type: 'confirm',
      name: 'setup',
      message: 'Set up your resume now?',
      default: true,
    }]);
    if (!setup) return;
    await setupResume();
    const updated = loadConfig();
    if (!updated.resume?.path) return;
  }

  const finalConfig = loadConfig();
  const resumePath = finalConfig.resume!.path!;
  const ownerName  = finalConfig.resume?.ownerName || 'Developer';

  const scan     = existingScan ?? scanProject(projectDir);
  const analysis = await analyzeProject(projectDir, scan);

  logger.header('Resume Update');
  logger.info(`Project: ${chalk.bold(analysis.displayName || analysis.name)}`);
  logger.info(`Resume:  ${chalk.dim(resumePath)}`);
  logger.blank();

  const entry = await generateLatexProjectEntry(analysis, useAI, ownerName, scan, projectDir);

  // Preview
  logger.blank();
  logger.header('Generated entry');
  console.log(chalk.dim('─'.repeat(60)));
  console.log(entry);
  console.log(chalk.dim('─'.repeat(60)));
  logger.blank();

  if (interactive) {
    const { action } = await inquirer.prompt<{ action: string }>([{
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: 'Add to resume',            value: 'add' },
        { name: 'Regenerate entry',         value: 'regen' },
        { name: 'Regenerate without AI',    value: 'regen_noai' },
        { name: 'Skip',                     value: 'skip' },
      ],
      default: 'add',
    }]);

    if (action === 'skip') { logger.dimmed('Skipped.'); return; }

    if (action === 'regen' || action === 'regen_noai') {
      const regenEntry = await generateLatexProjectEntry(
        analysis, action === 'regen', ownerName, scan, projectDir
      );
      console.log(chalk.dim('─'.repeat(60)));
      console.log(regenEntry);
      console.log(chalk.dim('─'.repeat(60)));
      logger.blank();
      const { confirmRegen } = await inquirer.prompt<{ confirmRegen: boolean }>([{
        type: 'confirm', name: 'confirmRegen', message: 'Add this entry?', default: true,
      }]);
      if (!confirmRegen) { logger.dimmed('Skipped.'); return; }
      try {
        const result = updateLatexResume(resumePath, regenEntry);
        logger.success(`Resume updated (backup: ${chalk.dim(basename(result.backupPath!))})`);
      } catch (e: any) { logger.error(`Failed: ${e.message}`); return; }
      await askPDFExport(resumePath);
      return;
    }
  }

  try {
    const result = updateLatexResume(resumePath, entry);
    logger.success(`Resume updated (backup: ${chalk.dim(basename(result.backupPath!))})`);
  } catch (e: any) {
    logger.error(`Failed to update resume: ${e.message}`);
    return;
  }

  if (interactive) await askPDFExport(resumePath);
}

// ─── Setup wizard ─────────────────────────────────────────────────────────────

async function setupResume(): Promise<void> {
  logger.header('Resume Setup');
  logger.blank();
  logger.info('AutoGit will add a project entry to your resume every time you run autogit.');
  logger.blank();

  const config = loadConfig();
  const suggestions = findTexFiles();

  // How they want to provide their resume
  const choices: Array<{ name: string; value: string }> = [];
  if (suggestions.length > 0) {
    choices.push(...suggestions.map(p => ({ name: `Use: ${p}`, value: `file:${p}` })));
  }
  choices.push(
    { name: 'Enter a file path manually',      value: 'path'  },
    { name: 'Paste LaTeX content directly',    value: 'paste' },
    { name: 'Convert from PDF resume',         value: 'pdf'   },
  );

  const { method } = await inquirer.prompt<{ method: string }>([{
    type: 'list',
    name: 'method',
    message: 'How would you like to provide your resume?',
    choices,
  }]);

  let resumePath: string;

  if (method.startsWith('file:')) {
    // Auto-detected file
    resumePath = method.slice(5);

  } else if (method === 'path') {
    // Manual path entry — support drag-and-drop (Windows wraps in quotes)
    const { raw } = await inquirer.prompt<{ raw: string }>([{
      type: 'input',
      name: 'raw',
      message: 'Paste or type the full path to your .tex file:',
      validate: (v: string) => {
        const p = v.trim().replace(/^["']|["']$/g, '');
        if (!p) return 'Path cannot be empty';
        if (!p.toLowerCase().endsWith('.tex')) return 'File must be a .tex file';
        return true;
      },
    }]);
    resumePath = raw.trim().replace(/^["']|["']$/g, '');
    if (!existsSync(resumePath)) {
      logger.error(`File not found: ${resumePath}`);
      return;
    }

  } else if (method === 'pdf') {
    // Convert PDF to LaTeX
    const { pdfRaw } = await inquirer.prompt<{ pdfRaw: string }>([{
      type: 'input',
      name: 'pdfRaw',
      message: 'Path to your PDF resume:',
      validate: (v: string) => {
        const p = v.trim().replace(/^["']|["']$/g, '');
        if (!p) return 'Path cannot be empty';
        if (!p.toLowerCase().endsWith('.pdf')) return 'File must be a .pdf';
        if (!existsSync(p)) return `File not found: ${p}`;
        return true;
      },
    }]);
    const pdfPath = pdfRaw.trim().replace(/^["']|["']$/g, '');
    try {
      const result = await convertPDFToLatex(pdfPath, {
        name: config.resume?.ownerName || '',
        email: config.resume?.ownerEmail || '',
        website: '',
      });
      resumePath = result.outputPath;
      logger.success(`LaTeX resume created: ${chalk.cyan(resumePath)}`);
    } catch (e: any) {
      logger.error(`PDF conversion failed: ${e.message}`);
      return;
    }

  } else {
    logger.blank();
    logger.info('Paste your full LaTeX resume content below.');
    logger.dimmed('When done, type END on a new line and press Enter.');
    logger.blank();

    const lines: string[] = [];
    const rl = await import('readline');
    const iface = rl.createInterface({ input: process.stdin, output: process.stdout });

    await new Promise<void>(res => {
      iface.on('line', (line) => {
        if (line.trim() === 'END') { iface.close(); res(); }
        else lines.push(line);
      });
    });

    const content = lines.join('\n');
    if (!content.includes('\\begin{document}')) {
      logger.error('Content does not look like a valid LaTeX file (missing \\begin{document})');
      return;
    }

    // Save to ~/.autogit/resume.tex
    const savePath = join(homedir(), '.autogit', 'resume.tex');
    writeFileSync(savePath, content, 'utf-8');
    resumePath = savePath;
    logger.success(`Resume saved to: ${chalk.cyan(savePath)}`);
  }

  logger.blank();

  const { ownerName } = await inquirer.prompt<{ ownerName: string }>([{
    type: 'input',
    name: 'ownerName',
    message: 'Your full name:',
    default: config.resume?.ownerName || '',
  }]);

  const { ownerEmail } = await inquirer.prompt<{ ownerEmail: string }>([{
    type: 'input',
    name: 'ownerEmail',
    message: 'Your email:',
    default: config.resume?.ownerEmail || '',
  }]);

  const { enabled } = await inquirer.prompt<{ enabled: boolean }>([{
    type: 'confirm',
    name: 'enabled',
    message: 'Auto-update resume on every autogit run?',
    default: true,
  }]);

  config.resume = { path: resumePath, ownerName, ownerEmail, enabled };
  saveConfig(config);

  logger.blank();
  logger.success('Resume configured!');
  logger.dimmed(`  File:  ${resumePath}`);
  logger.dimmed(`  Name:  ${ownerName}`);
  logger.dimmed(`  Auto:  ${enabled ? 'yes' : 'no — run "autogit resume" manually'}`);
  logger.blank();
  logger.dimmed('Tip: to change the file later, run: autogit resume --file /path/to/resume.tex');
}

function showResumeConfig(): void {
  const config = loadConfig();
  const r = config.resume;

  logger.header('Resume Configuration');
  logger.blank();

  if (!r?.path) {
    logger.warn('Not configured. Run: autogit resume --setup');
    return;
  }

  const exists = existsSync(r.path);
  logger.info(`Path:    ${r.path}`);
  logger.info(`Exists:  ${exists ? chalk.green('yes') : chalk.red('no — file not found!')}`);
  logger.info(`Name:    ${r.ownerName || '(not set)'}`);
  logger.info(`Email:   ${r.ownerEmail || '(not set)'}`);
  logger.info(`Auto:    ${r.enabled !== false ? chalk.green('enabled') : chalk.gray('disabled')}`);
  logger.blank();
  logger.dimmed('Commands:');
  logger.dimmed('  autogit resume              — update resume for current project');
  logger.dimmed('  autogit resume --setup      — change resume file or settings');
  logger.dimmed('  autogit resume --file <path>— quickly set a new .tex file');
}

async function askPDFExport(resumePath: string): Promise<void> {
  const docsDir = join(homedir(), 'Documents', 'resume');
  const { exportPDF } = await inquirer.prompt<{ exportPDF: boolean }>([{
    type: 'confirm',
    name: 'exportPDF',
    message: `Copy updated resume to ${chalk.cyan(docsDir)}?`,
    default: true,
  }]);
  if (!exportPDF) return;

  const spin = spinner('Exporting...').start();
  const result = await exportResumePDF(resumePath);

  if (result.exported && result.pdfPath) {
    spin.succeed(`PDF exported to: ${chalk.cyan(result.pdfPath)}`);
  } else if (result.texCopied) {
    spin.warn(`Resume .tex copied to ${chalk.cyan(docsDir)}`);
    logger.dimmed('pdflatex not found — install TeX Live or MiKTeX to compile to PDF.');
  } else {
    spin.fail('Export failed');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findTexFiles(): string[] {
  const candidates = [
    join(homedir(), 'resume.tex'),
    join(homedir(), 'Resume.tex'),
    join(homedir(), 'Documents', 'resume.tex'),
    join(homedir(), 'Documents', 'Resume.tex'),
    join(homedir(), 'Desktop', 'resume.tex'),
    join(homedir(), 'Desktop', 'Resume.tex'),
    join(homedir(), 'Documents', 'resume', 'resume.tex'),
    join(homedir(), '.autogit', 'resume.tex'),
  ];
  // Also scan Desktop and Documents for any .tex files (one level deep)
  for (const dir of [join(homedir(), 'Desktop'), join(homedir(), 'Documents')]) {
    try {
      for (const f of readdirSync(dir)) {
        if (f.toLowerCase().endsWith('.tex')) {
          const full = join(dir, f);
          if (!candidates.includes(full) && statSync(full).isFile()) candidates.push(full);
        }
      }
    } catch { /* directory not accessible */ }
  }
  return candidates.filter(p => existsSync(p));
}
