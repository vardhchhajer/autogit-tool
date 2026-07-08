import { resolve } from 'path';
import inquirer from 'inquirer';
import { scanProject } from '../scanner/file-scanner.js';
import { analyzeProject } from '../scanner/project-analyzer.js';
import { generateReadme, writeReadme, displayDiff } from '../services/readme-manager.js';
import { logger } from '../utils/logger.js';

export async function cmdReadme(opts: { ai?: boolean; regenerate?: boolean }): Promise<void> {
  const rootDir = resolve(process.cwd());

  logger.header('README Generator');

  const scan    = scanProject(rootDir);
  const analysis = await analyzeProject(rootDir, scan);
  const useAI = opts.ai !== false;

  const result = await generateReadme(rootDir, analysis, useAI, scan);

  if (result.diff) {
    logger.blank();
    displayDiff(result.diff);
    logger.blank();

    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: 'Apply changes?',
      default: true,
    }]);

    if (!confirm) {
      logger.dimmed('Cancelled');
      return;
    }
  }

  await writeReadme(result);
  logger.success(result.isNew ? 'README.md created' : 'README.md updated');
}
