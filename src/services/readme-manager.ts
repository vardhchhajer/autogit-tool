import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createPatch } from 'diff';
import chalk from 'chalk';
import type { ProjectAnalysis } from '../scanner/project-analyzer.js';
import { getProvider, type AIMessage } from '../ai/provider.js';
import { readmeGenerationPrompt } from '../ai/prompts.js';
import { logger, spinner } from '../utils/logger.js';

export interface ReadmeResult {
  content: string;
  isNew: boolean;
  diff: string | null;
  path: string;
}

export async function generateReadme(
  rootDir: string,
  analysis: ProjectAnalysis,
  useAI: boolean
): Promise<ReadmeResult> {
  const readmePath = analysis.readmePath || join(rootDir, 'README.md');
  const existingContent = existsSync(readmePath) ? readFileSync(readmePath, 'utf-8') : null;

  let newContent: string;

  if (useAI) {
    const spin = spinner('Generating README with AI...').start();
    try {
      const provider = getProvider();
      const prompt = readmeGenerationPrompt(analysis, existingContent || undefined);

      const messages: AIMessage[] = [
        { role: 'system', content: 'You are a professional technical documentation writer.' },
        { role: 'user', content: prompt },
      ];

      const response = await provider.generate(messages, { temperature: 0.5 });
      newContent = response.content.trim();

      // Clean up any markdown fencing the AI might have added
      if (newContent.startsWith('```markdown')) {
        newContent = newContent.slice('```markdown'.length);
      }
      if (newContent.startsWith('```md')) {
        newContent = newContent.slice('```md'.length);
      }
      if (newContent.startsWith('```')) {
        newContent = newContent.slice(3);
      }
      if (newContent.endsWith('```')) {
        newContent = newContent.slice(0, -3);
      }
      newContent = newContent.trim();

      spin.succeed('README generated with AI');
    } catch (error: any) {
      spin.fail('AI generation failed');
      logger.warn(`Falling back to template: ${error.message}`);
      newContent = generateTemplateReadme(analysis);
    }
  } else {
    newContent = generateTemplateReadme(analysis);
  }

  // Generate diff
  let diff: string | null = null;
  if (existingContent) {
    diff = createPatch('README.md', existingContent, newContent, 'existing', 'proposed');
  }

  return {
    content: newContent,
    isNew: !existingContent,
    diff,
    path: readmePath,
  };
}

export function writeReadme(result: ReadmeResult): void {
  writeFileSync(result.path, result.content, 'utf-8');
}

export function displayDiff(diff: string): void {
  const lines = diff.split('\n');
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      console.log(chalk.green(line));
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      console.log(chalk.red(line));
    } else if (line.startsWith('@@')) {
      console.log(chalk.cyan(line));
    } else {
      console.log(chalk.gray(line));
    }
  }
}

function generateTemplateReadme(analysis: ProjectAnalysis): string {
  const sections: string[] = [];

  // Title
  sections.push(`# ${analysis.name}\n`);

  // Description
  if (analysis.description) {
    sections.push(`${analysis.description}\n`);
  }

  // Tech Stack
  const techStack: string[] = [];
  if (analysis.languages.length) techStack.push(...analysis.languages);
  if (analysis.frameworks.length) techStack.push(...analysis.frameworks);
  if (techStack.length) {
    sections.push(`## Tech Stack\n`);
    sections.push(techStack.map(t => `- ${t}`).join('\n') + '\n');
  }

  // Features
  if (analysis.features.length) {
    sections.push(`## Features\n`);
    sections.push(analysis.features.map(f => `- ${f}`).join('\n') + '\n');
  }

  // Installation
  sections.push(`## Installation\n`);
  if (analysis.packageManager === 'npm' || analysis.packageManager === 'yarn' || analysis.packageManager === 'pnpm' || analysis.packageManager === 'bun') {
    const pm = analysis.packageManager;
    sections.push('```bash');
    sections.push(`# Clone the repository`);
    sections.push(`git clone https://github.com/USERNAME/${analysis.name}.git`);
    sections.push(`cd ${analysis.name}`);
    sections.push('');
    sections.push(`# Install dependencies`);
    sections.push(`${pm} install`);
    sections.push('```\n');
  } else if (analysis.packageManager === 'cargo') {
    sections.push('```bash');
    sections.push(`git clone https://github.com/USERNAME/${analysis.name}.git`);
    sections.push(`cd ${analysis.name}`);
    sections.push(`cargo build --release`);
    sections.push('```\n');
  } else if (analysis.packageManager?.includes('pip')) {
    sections.push('```bash');
    sections.push(`git clone https://github.com/USERNAME/${analysis.name}.git`);
    sections.push(`cd ${analysis.name}`);
    sections.push(`pip install -r requirements.txt`);
    sections.push('```\n');
  } else {
    sections.push('```bash');
    sections.push(`git clone https://github.com/USERNAME/${analysis.name}.git`);
    sections.push(`cd ${analysis.name}`);
    sections.push('```\n');
  }

  // Environment Variables
  if (analysis.envVars.length) {
    sections.push(`## Environment Variables\n`);
    sections.push('Create a `.env` file in the root directory:\n');
    sections.push('```env');
    for (const v of analysis.envVars) {
      sections.push(`${v}=`);
    }
    sections.push('```\n');
  }

  // Usage
  sections.push(`## Usage\n`);
  if (analysis.packageManager === 'npm') {
    sections.push('```bash\nnpm start\n```\n');
  } else if (analysis.packageManager === 'yarn') {
    sections.push('```bash\nyarn start\n```\n');
  } else if (analysis.packageManager === 'cargo') {
    sections.push('```bash\ncargo run\n```\n');
  } else if (analysis.packageManager?.includes('pip')) {
    sections.push('```bash\npython main.py\n```\n');
  }

  // License
  if (analysis.license) {
    sections.push(`## License\n`);
    sections.push(`This project is licensed under the ${analysis.license} License.\n`);
  }

  return sections.join('\n');
}
