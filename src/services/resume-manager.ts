import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { ProjectAnalysis } from '../scanner/project-analyzer.js';
import { getProvider, type AIMessage } from '../ai/provider.js';
import { logger, spinner } from '../utils/logger.js';

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
 * Export resume PDF (if pdflatex is available) to ~/Documents/resume/
 */
export async function exportResumePDF(texPath: string): Promise<{ exported: boolean; pdfPath?: string }> {
  const docsDir = join(homedir(), 'Documents', 'resume');
  if (!existsSync(docsDir)) {
    mkdirSync(docsDir, { recursive: true });
  }

  // Check if pdflatex is available
  try {
    const { execSync } = await import('child_process');
    execSync('pdflatex --version', { stdio: 'ignore' });
  } catch {
    return { exported: false };
  }

  // Compile LaTeX to PDF in the resume directory
  const texDir = dirname(texPath);
  const texBasename = texPath.split(/[/\\]/).pop()!.replace(/\.tex$/i, '');

  try {
    const { execSync } = await import('child_process');
    // Run pdflatex twice (for proper references)
    execSync(`pdflatex -interaction=nonstopmode "${texBasename}.tex"`, {
      cwd: texDir,
      stdio: 'ignore',
    });
    execSync(`pdflatex -interaction=nonstopmode "${texBasename}.tex"`, {
      cwd: texDir,
      stdio: 'ignore',
    });

    // Copy PDF to Documents/resume
    const generatedPDF = join(texDir, `${texBasename}.pdf`);
    if (existsSync(generatedPDF)) {
      const destPDF = join(docsDir, `${texBasename}.pdf`);
      const fs = await import('fs');
      fs.copyFileSync(generatedPDF, destPDF);
      return { exported: true, pdfPath: destPDF };
    }
  } catch {
    return { exported: false };
  }

  return { exported: false };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildResumePrompt(analysis: ProjectAnalysis, ownerName: string): string {
  const techStack = [...analysis.languages, ...analysis.frameworks, ...analysis.libraries].join(', ');
  const features = analysis.features.length > 0 ? analysis.features.slice(0, 5).join('; ') : 'Core functionality implemented';

  return `Generate a LaTeX resume project entry for ${ownerName}'s technical resume.

PROJECT DETAILS:
- Name: ${analysis.name}
- Tech Stack: ${techStack}
- Architecture: ${analysis.architecture}
- Description: ${analysis.description || 'A software project'}
- Key Features: ${features}
${analysis.database.length > 0 ? `- Database: ${analysis.database.join(', ')}` : ''}
${analysis.deployment.length > 0 ? `- Deployment: ${analysis.deployment.join(', ')}` : ''}

INSTRUCTIONS:
1. Use this LaTeX structure:
   \\resumeProjectHeading
       {\\textbf{Project Name} $|$ \\emph{Category/Type}}{}
       \\resumeItemListStart
         \\resumeItem{Bullet point 1}
         \\resumeItem{Bullet point 2}
         \\resumeItem{Bullet point 3}
         \\resumeItem{\\textbf{Tech Stack:} technologies used}
       \\resumeItemListEnd

2. Write 3-4 bullet points using strong action verbs (Built, Developed, Engineered, Implemented, Designed).
3. Focus on: what was built, technical depth, impact/scale, architectural decisions.
4. Last bullet should be: \\textbf{Tech Stack:} [list all technologies]
5. Keep bullets concise but technical (1-2 lines each).
6. Do NOT add extra commentary or explanations — return ONLY the LaTeX code.

Generate the entry now:`;
}

function generateTemplateEntry(analysis: ProjectAnalysis): string {
  const techStack = [...analysis.languages, ...analysis.frameworks, ...analysis.libraries]
    .slice(0, 10)
    .join(', ');

  const projectType = analysis.frameworks.length > 0
    ? `${analysis.frameworks[0]} Project`
    : analysis.languages[0]
    ? `${analysis.languages[0]} Project`
    : 'Software Project';

  const bullets: string[] = [];

  // Bullet 1: What was built
  if (analysis.description) {
    bullets.push(`Built ${analysis.name} — ${analysis.description.toLowerCase()}.`);
  } else {
    bullets.push(`Developed ${analysis.name}, a ${analysis.architecture.toLowerCase()} application.`);
  }

  // Bullet 2: Technical detail (architecture or key feature)
  if (analysis.features.length > 0) {
    bullets.push(`Implemented ${analysis.features[0].toLowerCase()}.`);
  } else if (analysis.database.length > 0) {
    bullets.push(`Designed system architecture with ${analysis.database[0]} database integration.`);
  } else {
    bullets.push(`Engineered modular ${analysis.architecture.toLowerCase()} with focus on maintainability.`);
  }

  // Bullet 3: Tech stack
  bullets.push(`\\textbf{Tech Stack:} ${techStack}.`);

  const bulletItems = bullets.map(b => `        \\resumeItem{${b}}`).join('\n');

  return `      \\resumeProjectHeading
          {\\textbf{${analysis.name}} $|$ \\emph{${projectType}}}{}
          \\resumeItemListStart
${bulletItems}
          \\resumeItemListEnd`;
}
