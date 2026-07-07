import { resolve } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { scanProject } from '../scanner/file-scanner.js';
import { analyzeProject } from '../scanner/project-analyzer.js';
import { createRepo, getAuthenticatedUser, repoExists, generateTopics, isGitHubConfigured } from '../services/github-service.js';
import { addRemote } from '../services/git-service.js';
import { logger } from '../utils/logger.js';

export async function cmdGithub(opts: { create?: boolean; private?: boolean }): Promise<void> {
  const rootDir = resolve(process.cwd());

  logger.header('GitHub');

  if (!isGitHubConfigured()) {
    logger.error('GitHub not configured. Run "autogit login" or set GITHUB_TOKEN');
    return;
  }

  const user = await getAuthenticatedUser();
  logger.info(`Authenticated as: ${chalk.bold(user.login)}`);

  const scan = scanProject(rootDir);
  const analysis = await analyzeProject(rootDir, scan);

  const exists = await repoExists(user.login, analysis.name);

  if (exists) {
    logger.info(`Repository exists: ${chalk.underline(`https://github.com/${user.login}/${analysis.name}`)}`);
    return;
  }

  if (!opts.create) {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Create repository "${analysis.name}"?`,
      default: true,
    }]);
    if (!confirm) return;
  }

  const topics = generateTopics(analysis);
  const repo = await createRepo({
    name: analysis.name,
    description: analysis.description || `${analysis.languages[0] || ''} project`,
    isPrivate: opts.private ?? false,
    topics,
  });

  await addRemote(rootDir, repo.cloneUrl);
  logger.success(`Created: ${chalk.underline(repo.htmlUrl)}`);
  logger.info(`Topics: ${topics.join(', ')}`);
}
