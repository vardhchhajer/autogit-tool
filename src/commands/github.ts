import chalk from 'chalk';
import inquirer from 'inquirer';
import { scanProject } from '../scanner/file-scanner.js';
import { analyzeProject } from '../scanner/project-analyzer.js';
import { createRepo, getAuthenticatedUser, repoExists, generateTopics, isGitHubConfigured } from '../services/github-service.js';
import { addRemote, getGitStatus } from '../services/git-service.js';
import { loadConfig } from '../config/manager.js';
import { logger } from '../utils/logger.js';
import { resolveProjectDirectory } from '../utils/project-root.js';

export async function cmdGithub(opts: { create?: boolean; private?: boolean; public?: boolean }): Promise<void> {
  const rootDir = resolveProjectDirectory().root;

  logger.header('GitHub');

  const status = await getGitStatus(rootDir);
  if (!status.isRepo) throw new Error('Not a Git repository. Run "autogit init" first.');
  if (status.hasRemote) {
    logger.info(`Using existing origin: ${status.remoteUrl}`);
    return;
  }

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
  const isPrivate = opts.private === true || (opts.public !== true && loadConfig().defaults?.visibility !== 'public');
  const repo = await createRepo({
    name: analysis.name,
    description: analysis.description || `${analysis.languages[0] || ''} project`,
    isPrivate,
    topics,
  });

  await addRemote(rootDir, repo.cloneUrl);
  logger.success(`Created: ${chalk.underline(repo.htmlUrl)}`);
  logger.info(`Topics: ${topics.join(', ')}`);
}
