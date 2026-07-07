import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { createRequire } from 'module';
import type { ProjectAnalysis } from '../scanner/project-analyzer.js';
import { getProvider, type AIMessage } from '../ai/provider.js';
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
  ownerName: string
): Promise<string> {
  if (!useAI) {
    return generateTemplateEntry(analysis);
  }

  const spin = spinner('Generating resume entry with AI...').start();
  try {
    const provider = getProvider();
    const prompt = buildResumePrompt(analysis, ownerName);

    const messages: AIMessage[] = [
      { role: 'system', content: 'You are a professional resume writer specializing in technical resumes for software engineers.' },
      { role: 'user', content: prompt },
    ];

    const response = await provider.generate(messages, { temperature: 0.6, maxTokens: 800 });
    let entry = response.content.trim();

    // Strip markdown fencing if present
    entry = entry.replace(/^```(?:latex|tex)?\n?/i, '').replace(/\n?```$/i, '').trim();

    spin.succeed('Resume entry generated');
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
    // Try importing — if already installed it loads immediately
    const mod = await import('node-latex');
    return mod.default ?? mod;
  } catch {
    // Not installed — try to install it on the fly
    try {
      logger.dimmed('Installing node-latex for PDF compilation...');
      const { execSync } = await import('child_process');
      execSync('npm install -g node-latex --silent', { stdio: 'ignore' });
      const mod = await import('node-latex');
      return mod.default ?? mod;
    } catch {
      return null;
    }
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

function buildResumePrompt(analysis: ProjectAnalysis, ownerName: string): string {
  const techStack = [...analysis.languages, ...analysis.frameworks, ...analysis.libraries].join(', ');
  const displayName = analysis.displayName || analysis.name;

  const featureList = [...new Set([...analysis.codeFeatures, ...analysis.features])]
    .slice(0, 8)
    .join(', ') || 'Core functionality';

  const routesSummary = analysis.apiRoutes.length > 0
    ? `API routes: ${analysis.apiRoutes.slice(0, 8).join(', ')}`
    : '';

  const scale = [
    analysis.pageCount > 0 ? `${analysis.pageCount} pages/screens` : '',
    analysis.componentCount > 0 ? `${analysis.componentCount} components` : '',
  ].filter(Boolean).join(', ');

  return `Generate a LaTeX resume project entry for ${ownerName}'s technical resume.

PROJECT DETAILS:
- Display Name: ${displayName}
- Package/Folder Name: ${analysis.name}
- Description: ${analysis.description || 'A software project'}
- Tech Stack: ${techStack}
- Architecture: ${analysis.architecture}
- Features detected from source code: ${featureList}
${routesSummary ? `- ${routesSummary}` : ''}
${scale ? `- Scale: ${scale}` : ''}
${analysis.database.length > 0 ? `- Database: ${analysis.database.join(', ')}` : ''}
${analysis.deployment.length > 0 ? `- Deployment: ${analysis.deployment.join(', ')}` : ''}
${analysis.cicd.length > 0 ? `- CI/CD: ${analysis.cicd.join(', ')}` : ''}

INSTRUCTIONS:
1. Use EXACTLY this LaTeX structure:
   \\resumeProjectHeading
       {\\textbf{${displayName}} $|$ \\emph{Category/Type}}{}
       \\resumeItemListStart
         \\resumeItem{Bullet 1}
         \\resumeItem{Bullet 2}
         \\resumeItem{Bullet 3}
         \\resumeItem{\\textbf{Tech Stack:} technologies}
       \\resumeItemListEnd

2. Use "${displayName}" as the project name in \\textbf{} — NOT the package name "${analysis.name}".
3. Write 3-5 bullet points using strong action verbs (Built, Developed, Engineered, Implemented, Designed).
4. Reference the actual features found in the code — be specific (e.g. mention barcode scanning, PDF export, etc.).
5. Include scale details (pages, components, routes) if meaningful.
6. Last bullet MUST be: \\textbf{Tech Stack:} [full list]
7. Return ONLY the LaTeX block — no explanation, no markdown fences.`;
}

function generateTemplateEntry(analysis: ProjectAnalysis): string {
  const displayName = analysis.displayName || analysis.name;
  const techStack = [...analysis.languages, ...analysis.frameworks, ...analysis.libraries]
    .slice(0, 10)
    .join(', ');

  const projectType = analysis.frameworks.length > 0
    ? `${analysis.frameworks[0]} Project`
    : analysis.languages[0]
    ? `${analysis.languages[0]} Project`
    : 'Software Project';

  const bullets: string[] = [];

  // Bullet 1: what was built using display name
  if (analysis.description) {
    bullets.push(`Built ${displayName} — ${analysis.description.toLowerCase()}.`);
  } else {
    bullets.push(`Developed ${displayName}, a ${analysis.architecture.toLowerCase()} application.`);
  }

  // Bullet 2: specific code features if available
  if (analysis.codeFeatures.length > 0) {
    bullets.push(`Implemented ${analysis.codeFeatures.slice(0, 3).join(', ').toLowerCase()}.`);
  } else if (analysis.features.length > 0) {
    bullets.push(`Implemented ${analysis.features[0].toLowerCase()}.`);
  } else if (analysis.database.length > 0) {
    bullets.push(`Designed system architecture with ${analysis.database[0]} database integration.`);
  } else {
    bullets.push(`Engineered modular ${analysis.architecture.toLowerCase()} with focus on maintainability.`);
  }

  // Bullet 3: scale if meaningful
  if (analysis.pageCount > 0 || analysis.componentCount > 0) {
    const parts = [];
    if (analysis.pageCount > 0) parts.push(`${analysis.pageCount} pages`);
    if (analysis.componentCount > 0) parts.push(`${analysis.componentCount} components`);
    bullets.push(`Built ${parts.join(' and ')} with full routing and state management.`);
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
