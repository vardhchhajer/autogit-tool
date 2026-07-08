import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { createRequire } from 'module';
import type { ProjectAnalysis } from '../scanner/project-analyzer.js';
import { getProvider, type AIMessage } from '../ai/provider.js';
import { resumePromptWithCode } from '../ai/prompts.js';
import { buildCodeSummary } from '../ai/code-reader.js';
import { logger, spinner } from '../utils/logger.js';

// createRequire is needed to use CJS modules (node-latex, stream) inside ESM
const _require = createRequire(import.meta.url);

export interface ResumeConfig {
  path: string;
  ownerName: string;
  ownerEmail: string;
}

export interface ResumeUpdateResult {
  updated: boolean;
  newEntry: string;
  backupPath?: string;
}

/**
 * Generate a LaTeX project entry from project analysis.
 * Returns the full \resumeProjectHeading + \resumeItemListStart/End block.
 */
export async function generateLatexProjectEntry(
  analysis: ProjectAnalysis,
  useAI: boolean,
  ownerName: string,
  scan?: import('../scanner/file-scanner.js').ScanResult,
  rootDir?: string
): Promise<string> {
  if (!useAI) {
    return generateTemplateEntry(analysis);
  }

  const spin = spinner('Reading project files and generating resume entry...').start();
  try {
    const provider = getProvider();

    // Build code summary from actual source files
    let prompt: string;
    if (scan) {
      const dir = rootDir || process.cwd();
      const code = await buildCodeSummary(dir, scan);
      spin.text = `Analyzing ${code.filesRead} source file(s) (${Math.round(code.charCount / 1000)}k chars)...`;
      prompt = resumePromptWithCode(analysis, code, ownerName);
    } else {
      // Fallback to metadata-only prompt if no scan available
      prompt = buildFallbackResumePrompt(analysis, ownerName);
    }

    const messages: AIMessage[] = [
      {
        role: 'system',
        content: 'You are a professional resume writer. You read source code carefully and write precise, technical resume bullets based on what the code actually does.',
      },
      { role: 'user', content: prompt },
    ];

    const response = await provider.generate(messages, { temperature: 0.4, maxTokens: 2000 });
    let entry = response.content.trim();

    // Strip any markdown fencing
    entry = entry.replace(/^```(?:latex|tex)?\n?/i, '').replace(/\n?```$/i, '').trim();

    spin.succeed('Resume entry generated from source code analysis');
    return entry;
  } catch (error: any) {
    spin.fail('AI generation failed');
    logger.warn(`Falling back to template: ${error.message}`);
    return generateTemplateEntry(analysis);
  }
}

/**
 * Update a LaTeX resume by inserting a new project entry into the Projects section.
 * Creates a backup before modifying.
 */
export function updateLatexResume(
  resumePath: string,
  newProjectEntry: string
): ResumeUpdateResult {
  if (!existsSync(resumePath)) {
    throw new Error(`Resume file not found: ${resumePath}`);
  }

  const content = readFileSync(resumePath, 'utf-8');

  // Find the Projects section
  const projectsSectionMatch = content.match(/\\section\{Projects\}([\s\S]*?)(?=\\section\{|\\end\{document\})/i);
  if (!projectsSectionMatch) {
    throw new Error('Could not find \\section{Projects} in resume');
  }

  const projectsSection = projectsSectionMatch[0];
  const projectsStart = projectsSectionMatch.index!;

  // Find the \resumeSubHeadingListStart after Projects section
  const listStartMatch = projectsSection.match(/\\resumeSubHeadingListStart/);
  if (!listStartMatch) {
    throw new Error('Could not find \\resumeSubHeadingListStart in Projects section');
  }

  // Insert the new entry right after \resumeSubHeadingListStart
  const insertPos = projectsStart + listStartMatch.index! + listStartMatch[0].length;
  const updatedContent = 
    content.slice(0, insertPos) +
    '\n\n' + newProjectEntry +
    content.slice(insertPos);

  // Create backup
  const backupPath = resumePath.replace(/\.tex$/i, `.backup-${Date.now()}.tex`);
  writeFileSync(backupPath, content, 'utf-8');

  // Write updated resume
  writeFileSync(resumePath, updatedContent, 'utf-8');

  return {
    updated: true,
    newEntry: newProjectEntry,
    backupPath,
  };
}

/**
 * Export resume to ~/Documents/resume/.
 * Tries node-latex first (npm package, no system install needed).
 * Falls back to copying the .tex file if PDF compilation fails.
 */
export async function exportResumePDF(texPath: string): Promise<{ exported: boolean; pdfPath?: string; texCopied?: boolean }> {
  const docsDir = join(homedir(), 'Documents', 'resume');
  if (!existsSync(docsDir)) {
    mkdirSync(docsDir, { recursive: true });
  }

  const texFilename = texPath.split(/[/\\]/).pop()!;
  const pdfFilename = texFilename.replace(/\.tex$/i, '.pdf');
  const destTex = join(docsDir, texFilename);
  const destPDF = join(docsDir, pdfFilename);

  // Always copy the .tex file
  try {
    const { copyFileSync } = await import('fs');
    copyFileSync(texPath, destTex);
  } catch {
    // non-fatal
  }

  // Try PDF via node-latex (pure npm, no system LaTeX required)
  try {
    const nodeLaTeX = await importNodeLatex();
    if (nodeLaTeX) {
      const texSource = readFileSync(texPath, 'utf-8');
      const pdf = await compileWithNodeLatex(nodeLaTeX, texSource, texPath);
      writeFileSync(destPDF, pdf);
      return { exported: true, pdfPath: destPDF, texCopied: true };
    }
  } catch {
    // node-latex failed, try system pdflatex
  }

  // Fallback: system pdflatex
  try {
    const { execSync } = await import('child_process');
    execSync('pdflatex --version', { stdio: 'ignore' });

    const texDir = dirname(texPath);
    const texBasename = texFilename.replace(/\.tex$/i, '');
    execSync(`pdflatex -interaction=nonstopmode -output-directory "${docsDir}" "${texBasename}.tex"`, {
      cwd: texDir,
      stdio: 'ignore',
    });

    if (existsSync(destPDF)) {
      return { exported: true, pdfPath: destPDF, texCopied: true };
    }
  } catch {
    // pdflatex not available
  }

  // .tex was copied, PDF compilation not available
  return { exported: false, texCopied: true };
}

async function importNodeLatex(): Promise<any | null> {
  try {
    const mod = await import('node-latex');
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

function compileWithNodeLatex(latex: any, source: string, texPath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Use _require (CJS-compat) to load stream inside ESM
    const { Readable } = _require('stream');
    const input = Readable.from([source]);
    const options = { inputs: dirname(texPath) };
    const output = latex(input, options);
    const chunks: Buffer[] = [];
    output.on('data', (chunk: Buffer) => chunks.push(chunk));
    output.on('end', () => resolve(Buffer.concat(chunks)));
    output.on('error', reject);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildFallbackResumePrompt(analysis: ProjectAnalysis, ownerName: string): string {
  const techStack = [...analysis.languages, ...analysis.frameworks, ...analysis.libraries].join(', ');
  const displayName = analysis.displayName || analysis.name;
  const ctx = (analysis as any)._codeContext as {
    functions: string[];
    docstrings: string[];
    uiSections: string[];
    description: string | null;
  } | undefined;

  const featureList = [...new Set([...analysis.codeFeatures, ...analysis.features])]
    .slice(0, 10).join(', ') || 'Core functionality';

  const routesSummary = analysis.apiRoutes.length > 0
    ? `API routes: ${analysis.apiRoutes.slice(0, 8).join(', ')}`
    : '';

  const scale = [
    analysis.pageCount > 0 ? `${analysis.pageCount} pages/screens` : '',
    analysis.componentCount > 0 ? `${analysis.componentCount} components` : '',
  ].filter(Boolean).join(', ');

  const functionsSection = ctx?.functions?.length
    ? `Functions/modules: ${ctx.functions.slice(0, 12).join(', ')}`
    : '';

  const docstringSection = ctx?.docstrings?.length
    ? `Code documentation:\n${ctx.docstrings.slice(0, 3).map(d => `  - ${d}`).join('\n')}`
    : '';

  const uiSection = ctx?.uiSections?.length
    ? `UI sections/tabs: ${ctx.uiSections.join(', ')}`
    : '';

  return `Generate a LaTeX resume project entry for ${ownerName}'s technical resume.

PROJECT DETAILS:
- Display Name: ${displayName}
- Description: ${analysis.description || ctx?.description || 'A software project'}
- Tech Stack: ${techStack}
- Architecture: ${analysis.architecture}
- Features detected from source code: ${featureList}
${routesSummary ? `- ${routesSummary}` : ''}
${scale ? `- Scale: ${scale}` : ''}
${functionsSection ? `- ${functionsSection}` : ''}
${uiSection ? `- ${uiSection}` : ''}
${docstringSection ? `\n${docstringSection}` : ''}
${analysis.database.length > 0 ? `- Database: ${analysis.database.join(', ')}` : ''}
${analysis.deployment.length > 0 ? `- Deployment: ${analysis.deployment.join(', ')}` : ''}

INSTRUCTIONS:
1. Use EXACTLY this LaTeX structure:
   \\resumeProjectHeading
       {\\textbf{${displayName}} $|$ \\emph{Category}}{}
       \\resumeItemListStart
         \\resumeItem{Bullet 1}
         \\resumeItem{Bullet 2}
         \\resumeItem{Bullet 3}
         \\resumeItem{\\textbf{Tech Stack:} technologies}
       \\resumeItemListEnd

2. The project name in \\textbf{} MUST be "${displayName}".
3. Write 3-5 specific bullets using strong action verbs.
4. Reference the ACTUAL functions, features, and UI sections from the code — be concrete and technical.
5. If docstrings describe the algorithm, mention it (e.g. "longation calculation", "shortage formula").
6. Last bullet MUST be: \\textbf{Tech Stack:} [full list]
7. Return ONLY the LaTeX block — no explanation, no markdown fences.`;
}

function generateTemplateEntry(analysis: ProjectAnalysis): string {
  const displayName = analysis.displayName || analysis.name;
  const techStack = [...analysis.languages, ...analysis.frameworks, ...analysis.libraries]
    .filter(Boolean).slice(0, 10).join(', ');

  const projectType = analysis.frameworks.length > 0
    ? `${analysis.frameworks[0]} Project`
    : analysis.languages[0]
    ? `${analysis.languages[0]} Project`
    : 'Software Project';

  const ctx = (analysis as any)._codeContext as {
    functions: string[];
    docstrings: string[];
    uiSections: string[];
    description: string | null;
  } | undefined;

  const bullets: string[] = [];

  // Bullet 1: what was built — use display name and description
  const desc = analysis.description || ctx?.description;
  if (desc && !desc.match(/^(initialize|helper|utility)/i)) {
    // Capitalize first letter, end with period
    const cleaned = desc.charAt(0).toUpperCase() + desc.slice(1).replace(/\.?$/, '.');
    bullets.push(`Built ${displayName} — ${cleaned}`);
  } else if (ctx?.functions && ctx.functions.length > 0) {
    const mainFuncs = ctx.functions.filter(f => !['init_state','load_reports','save_reports'].includes(f));
    bullets.push(`Developed ${displayName} implementing ${mainFuncs.slice(0,3).join(', ')} logic.`);
  } else {
    bullets.push(`Developed ${displayName}, a ${analysis.architecture.toLowerCase()} application.`);
  }

  // Bullet 2: specific code features
  if (analysis.codeFeatures.length > 0) {
    bullets.push(`Implemented ${analysis.codeFeatures.slice(0, 4).join(', ').toLowerCase()}.`);
  } else if (analysis.database.length > 0) {
    bullets.push(`Designed system with ${analysis.database[0]} database integration.`);
  }

  // Bullet 3: UI sections if available
  if (ctx?.uiSections && ctx.uiSections.length > 0) {
    const sections = ctx.uiSections.filter(s => s && s.length > 3).slice(0, 4).join(', ');
    bullets.push(`Built interactive UI with sections: ${sections}.`);
  } else if (analysis.pageCount > 0 || analysis.componentCount > 0) {
    const parts: string[] = [];
    if (analysis.pageCount > 0) parts.push(`${analysis.pageCount} pages`);
    if (analysis.componentCount > 0) parts.push(`${analysis.componentCount} components`);
    bullets.push(`Structured application with ${parts.join(' and ')}.`);
  }

  // Tech stack bullet
  bullets.push(`\\textbf{Tech Stack:} ${techStack}.`);

  const bulletItems = bullets.map(b => `        \\resumeItem{${b}}`).join('\n');

  return `      \\resumeProjectHeading
          {\\textbf{${displayName}} $|$ \\emph{${projectType}}}{}
          \\resumeItemListStart
${bulletItems}
          \\resumeItemListEnd`;
}
