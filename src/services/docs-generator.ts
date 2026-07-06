import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ProjectAnalysis } from '../scanner/project-analyzer.js';
import type { ScanResult } from '../scanner/file-scanner.js';
import { getProvider, type AIMessage } from '../ai/provider.js';
import { projectSummaryPrompt, architectureDocPrompt } from '../ai/prompts.js';
import { logger, spinner } from '../utils/logger.js';

export interface DocFile {
  name: string;
  path: string;
  content: string;
  exists: boolean;
}

export async function generateDocs(
  rootDir: string,
  analysis: ProjectAnalysis,
  scan: ScanResult,
  useAI: boolean,
  regenerate = false
): Promise<DocFile[]> {
  const docs: DocFile[] = [];

  // PROJECT_SUMMARY.md
  const summaryPath = join(rootDir, 'PROJECT_SUMMARY.md');
  if (!existsSync(summaryPath) || regenerate) {
    const content = useAI
      ? await generateWithAI('project summary', projectSummaryPrompt(analysis))
      : generateTemplateSummary(analysis);
    if (content) {
      docs.push({ name: 'PROJECT_SUMMARY.md', path: summaryPath, content, exists: existsSync(summaryPath) });
    }
  }

  // ARCHITECTURE.md
  const archPath = join(rootDir, 'ARCHITECTURE.md');
  if (!existsSync(archPath) || regenerate) {
    const folderStructure = buildFolderStructure(scan);
    const content = useAI
      ? await generateWithAI('architecture doc', architectureDocPrompt(analysis, folderStructure))
      : generateTemplateArchitecture(analysis, folderStructure);
    if (content) {
      docs.push({ name: 'ARCHITECTURE.md', path: archPath, content, exists: existsSync(archPath) });
    }
  }

  // CONTRIBUTING.md
  const contribPath = join(rootDir, 'CONTRIBUTING.md');
  if (!existsSync(contribPath) || regenerate) {
    const content = generateContributing(analysis);
    docs.push({ name: 'CONTRIBUTING.md', path: contribPath, content, exists: existsSync(contribPath) });
  }

  return docs;
}

export function writeDocs(docs: DocFile[]): void {
  for (const doc of docs) {
    writeFileSync(doc.path, doc.content, 'utf-8');
  }
}

async function generateWithAI(docType: string, prompt: string): Promise<string | null> {
  const spin = spinner(`Generating ${docType} with AI...`).start();
  try {
    const provider = getProvider();
    const messages: AIMessage[] = [
      { role: 'system', content: 'You are a technical documentation expert. Generate clean, professional Markdown documentation.' },
      { role: 'user', content: prompt },
    ];

    const response = await provider.generate(messages, { temperature: 0.5 });
    let content = response.content.trim();

    // Strip markdown fencing
    if (content.startsWith('```markdown') || content.startsWith('```md')) {
      content = content.replace(/^```(?:markdown|md)\n?/, '').replace(/\n?```$/, '');
    } else if (content.startsWith('```')) {
      content = content.slice(3).replace(/\n?```$/, '');
    }

    spin.succeed(`${docType} generated`);
    return content.trim();
  } catch (error: any) {
    spin.fail(`Failed to generate ${docType}: ${error.message}`);
    return null;
  }
}

function buildFolderStructure(scan: ScanResult, maxDepth = 3): string {
  const lines: string[] = [];
  const topDirs = scan.directories.filter(d => !d.includes('/') || d.split('/').length <= maxDepth);

  for (const dir of topDirs.slice(0, 30)) {
    const depth = dir.split('/').length - 1;
    const indent = '  '.repeat(depth);
    const name = dir.split('/').pop() || dir;
    lines.push(`${indent}├── ${name}/`);
  }

  return lines.join('\n') || 'No directories detected';
}

function generateTemplateSummary(analysis: ProjectAnalysis): string {
  return `# Project Summary

## Overview

${analysis.name} is a ${analysis.languages[0] || 'software'} project${analysis.frameworks.length ? ` built with ${analysis.frameworks.join(', ')}` : ''}.

${analysis.description || ''}

## Key Technologies

${[...analysis.languages, ...analysis.frameworks, ...analysis.libraries].map(t => `- ${t}`).join('\n')}

## Architecture

${analysis.architecture}

## Build & Development

- **Package Manager:** ${analysis.packageManager || 'N/A'}
- **Build System:** ${analysis.buildSystem || 'N/A'}
- **Test Framework:** ${analysis.testFramework || 'N/A'}

${analysis.deployment.length ? `## Deployment\n\n${analysis.deployment.map(d => `- ${d}`).join('\n')}` : ''}
`;
}

function generateTemplateArchitecture(analysis: ProjectAnalysis, folderStructure: string): string {
  return `# Architecture

## Overview

This document describes the high-level architecture of ${analysis.name}.

## Project Structure

\`\`\`
${folderStructure}
\`\`\`

## Technology Stack

| Layer | Technology |
|-------|-----------|
${analysis.languages.length ? `| Language | ${analysis.languages.join(', ')} |` : ''}
${analysis.frameworks.length ? `| Framework | ${analysis.frameworks.join(', ')} |` : ''}
${analysis.database.length ? `| Database | ${analysis.database.join(', ')} |` : ''}
${analysis.deployment.length ? `| Deployment | ${analysis.deployment.join(', ')} |` : ''}

## Architecture Pattern

${analysis.architecture}

## Data Flow

*Document your application's data flow here.*
`;
}

function generateContributing(analysis: ProjectAnalysis): string {
  const pm = analysis.packageManager || 'npm';
  const installCmd = pm === 'yarn' ? 'yarn' : pm === 'pnpm' ? 'pnpm install' : `${pm} install`;

  return `# Contributing

Thank you for your interest in contributing to ${analysis.name}!

## Getting Started

1. Fork the repository
2. Clone your fork: \`git clone https://github.com/YOUR_USERNAME/${analysis.name}.git\`
3. Create a branch: \`git checkout -b feature/your-feature\`
4. Install dependencies: \`${installCmd}\`
5. Make your changes
6. Run tests${analysis.testFramework ? ` (\`${pm === 'yarn' ? 'yarn test' : `${pm} test`}\`)` : ''}
7. Commit your changes following [Conventional Commits](https://www.conventionalcommits.org/)
8. Push to your fork: \`git push origin feature/your-feature\`
9. Open a Pull Request

## Code Style

- Follow the existing code style and conventions
- Write meaningful commit messages
- Add tests for new features
- Update documentation when needed

## Reporting Issues

- Use GitHub Issues to report bugs
- Include reproduction steps
- Provide environment details

## License

By contributing, you agree that your contributions will be licensed under the project's ${analysis.license || 'existing'} license.
`;
}
