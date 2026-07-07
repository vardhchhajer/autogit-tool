import { resolve, join } from 'path';
import { existsSync } from 'fs';
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
import { logger, spinner } from '../utils/logger.js';

export interface ResumeCommandOpts {
  ai?: boolean;
  setup?: boolean;
  show?: boolean;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function cmdResume(opts: ResumeCommandOpts): Promise<void> {
  if (opts.setup) { await setupResume(); return; }
  if (opts.show)  { showResumeConfig(); return; }
  await runResumeUpdate(resolve(process.cwd()), opts.ai !== false, true);
}

// ─── Called from the main pipeline ───────────────────────────────────────────

export async function runResumeUpdate(
  projectDir: string,
  useAI: boolean,
  interactive: boolean
): Promise<void> {
  const config = loadConfig();
  const resumeCfg = config.resume;

  // If resume isn't configured yet, offer to set it up interactively
  if (!resumeCfg?.path || !existsSync(resumeCfg.path)) {
    if (!interactive) return; // skip silently during non-interactive pipeline
    logger.blank();
    logger.info('Resume file not configured.');
    const { setup } = await inquirer.prompt<{ setup: boolean }>([{
      type: 'confirm',
      name: 'setup',
      message: 'Set up resume auto-update now?',
      default: true,
    }]);
    if (!setup) return;
    await setupResume();

    // Re-load after setup
    const updated = loadConfig();
    if (!updated.resume?.path) return;
  }

  const finalConfig = loadConfig();
  const resumePath = finalConfig.resume!.path!;
  const ownerName  = finalConfig.resume?.ownerName  || 'Developer';

  // Analyse the current project
  const scan    = scanProject(projectDir);
  const analysis = await analyzeProject(projectDir, scan);

  logger.header('Resume Update');
  logger.info(`Project: ${chalk.bold(analysis.name)}`);
  logger.info(`Resume:  ${chalk.dim(resumePath)}`);
  logger.blank();

  // Generate the LaTeX entry
  const entry = await generateLatexProjectEntry(analysis, useAI, ownerName);

  // Preview the entry
  logger.blank();
  logger.header('Generated resume entry preview');
  console.log(chalk.dim('─'.repeat(60)));
  console.log(entry);
  console.log(chalk.dim('─'.repeat(60)));
  logger.blank();

  // Confirm before writing
  if (interactive) {
    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([{
      type: 'confirm',
      name: 'confirm',
      message: 'Add this entry to your resume?',
      default: true,
    }]);
    if (!confirm) {
      logger.dimmed('Resume update skipped.');
      return;
    }
  }

  // Write to resume
  try {
    const result = updateLatexResume(resumePath, entry);
    logger.success(`Resume updated (backup: ${chalk.dim(result.backupPath!.split(/[/\\]/).pop())})`);
  } catch (e: any) {
    logger.error(`Failed to update resume: ${e.message}`);
    return;
  }

  // Ask about PDF export
  if (interactive) {
    const docsDir = join(homedir(), 'Documents', 'resume');
    const { exportPDF } = await inquirer.prompt<{ exportPDF: boolean }>([{
      type: 'confirm',
      name: 'exportPDF',
      message: `Export updated resume to ${chalk.cyan(docsDir)}?`,
      default: true,
    }]);

    if (exportPDF) {
      await handlePDFExport(resumePath, docsDir);
    }
  }
}

// ─── Setup wizard ─────────────────────────────────────────────────────────────

async function setupResume(): Promise<void> {
  logger.header('Resume Setup');
  logger.blank();
  logger.dimmed('AutoGit will automatically add a project entry to your resume each time you run autogit.');
  logger.blank();

  const config = loadConfig();

  // Find existing .tex files in common locations as suggestions
  const suggestions = findTexFiles();

  let resumePath: string;

  if (suggestions.length > 0) {
    const { choice } = await inquirer.prompt<{ choice: string }>([{
      type: 'list',
      name: 'choice',
      message: 'Select your resume .tex file:',
      choices: [
        ...suggestions.map(p => ({ name: p, value: p })),
        { name: 'Enter path manually', value: '__manual__' },
      ],
    }]);
    resumePath = choice === '__manual__' ? await askResumePath() : choice;
  } else {
    resumePath = await askResumePath();
  }

  if (!existsSync(resumePath)) {
    logger.error(`File not found: ${resumePath}`);
    return;
  }

  const { ownerName } = await inquirer.prompt<{ ownerName: string }>([{
    type: 'input',
    name: 'ownerName',
    message: 'Your full name (for resume bullets):',
    default: config.resume?.ownerName || 'Vardh Chhajer',
  }]);

  const { ownerEmail } = await inquirer.prompt<{ ownerEmail: string }>([{
    type: 'input',
    name: 'ownerEmail',
    message: 'Your email:',
    default: config.resume?.ownerEmail || 'chhajervardh@gmail.com',
  }]);

  const { enabled } = await inquirer.prompt<{ enabled: boolean }>([{
    type: 'confirm',
    name: 'enabled',
    message: 'Auto-update resume every time you run autogit?',
    default: true,
  }]);

  config.resume = { path: resumePath, ownerName, ownerEmail, enabled };
  saveConfig(config);

  logger.blank();
  logger.success('Resume configured!');
  logger.dimmed(`  File:  ${resumePath}`);
  logger.dimmed(`  Name:  ${ownerName}`);
  logger.dimmed(`  Auto:  ${enabled ? 'yes — updates on every autogit run' : 'no — run "autogit resume" manually'}`);
}

async function askResumePath(): Promise<string> {
  const { raw } = await inquirer.prompt<{ raw: string }>([{
    type: 'input',
    name: 'raw',
    message: 'Path to your resume .tex file:',
    validate: (v: string) => {
      const p = v.trim();
      if (!p) return 'Path cannot be empty';
      if (!p.toLowerCase().endsWith('.tex')) return 'File must be a .tex file';
      return true;
    },
  }]);
  return raw.trim();
}

function showResumeConfig(): void {
  const config = loadConfig();
  const r = config.resume;

  logger.header('Resume Configuration');
  logger.blank();

  if (!r?.path) {
    logger.warn('Resume not configured. Run "autogit resume --setup" to set it up.');
    return;
  }

  logger.info(`Path:    ${r.path}`);
  logger.info(`Exists:  ${existsSync(r.path) ? chalk.green('yes') : chalk.red('no — file not found!')}`);
  logger.info(`Name:    ${r.ownerName || '(not set)'}`);
  logger.info(`Email:   ${r.ownerEmail || '(not set)'}`);
  logger.info(`Auto:    ${r.enabled !== false ? chalk.green('enabled') : chalk.gray('disabled')}`);
}

// ─── PDF export ───────────────────────────────────────────────────────────────

async function handlePDFExport(texPath: string, docsDir: string): Promise<void> {
  const spin = spinner('Exporting resume...').start();
  const result = await exportResumePDF(texPath);

  if (result.exported && result.pdfPath) {
    spin.succeed(`PDF exported to: ${chalk.cyan(result.pdfPath)}`);
  } else if (result.texCopied) {
    spin.warn(`Resume .tex copied to ${chalk.cyan(docsDir)}`);
    logger.dimmed('PDF compilation unavailable — install TeX Live, MiKTeX, or pdflatex to compile.');
    logger.dimmed(`To compile manually: pdflatex "${texPath}"`);
  } else {
    spin.fail('Export failed');
  }
}

// ─── Helper: find .tex files in common locations ──────────────────────────────

function findTexFiles(): string[] {
  const candidates = [
    join(homedir(), 'resume.tex'),
    join(homedir(), 'Resume.tex'),
    join(homedir(), 'Documents', 'resume.tex'),
    join(homedir(), 'Documents', 'Resume.tex'),
    join(homedir(), 'Desktop', 'resume.tex'),
    join(homedir(), 'Desktop', 'Resume.tex'),
    join(homedir(), 'Documents', 'resume', 'resume.tex'),
  ];
  return candidates.filter(p => existsSync(p));
}
