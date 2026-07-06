import { resolve } from 'path';
import { existsSync } from 'fs';
import inquirer from 'inquirer';
import { scanProject } from '../scanner/file-scanner.js';
import { analyzeProject } from '../scanner/project-analyzer.js';
import { getGitStatus, initGit, generateGitignore } from '../services/git-service.js';
import { logger } from '../utils/logger.js';

export async function cmdInit(): Promise<void> {
  const rootDir = resolve(process.cwd());

  logger.header('AutoGit Init');

  const scan = scanProject(rootDir);
  const analysis = analyzeProject(rootDir, scan);
  const gitStatus = await getGitStatus(rootDir);

  if (gitStatus.isRepo) {
    logger.info('Git repository already initialized');
  } else {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: 'Initialize Git repository?',
      default: true,
    }]);

    if (confirm) {
      await initGit(rootDir);
    }
  }

  // Generate .gitignore
  if (!existsSync(resolve(rootDir, '.gitignore'))) {
    await generateGitignore(rootDir, analysis);
  } else {
    logger.info('.gitignore already exists');
  }

  logger.blank();
  logger.success('Project initialized! Run "autogit" to generate docs and publish.');
}
