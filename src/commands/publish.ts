import { resolve } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { scanProject } from '../scanner/file-scanner.js';
import { analyzeProject } from '../scanner/project-analyzer.js';
import { getGitStatus, stageAll, generateCommitMessage, commit, push, addRemote } from '../services/git-service.js';
import { createRepo, getAuthenticatedUser, repoExists, generateTopics, isGitHubConfigured } from '../services/github-service.js';
import { logger, spinner } from '../utils/logger.js';

export async function cmdPublish(opts: { yes?: boolean; private?: boolean }): Promise<void> {
  const rootDir = resolve(process.cwd());

  logger.header('Publish to GitHub');

  const scan = scanProject(rootDir);
  const analysis = await analyzeProject(rootDir, scan);
  const status = await getGitStatus(rootDir);

  if (!status.isRepo) {
    logger.error('Not a Git repository. Run "autogit init" first.');
    return;
  }

  // Stage and commit
  await stageAll(rootDir);
  const commitMsg = await generateCommitMessage(rootDir, true);

  if (!opts.yes) {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Commit with message: "${commitMsg}"?`,
      default: true,
    }]);
    if (!confirm) return;
  }

  await commit(rootDir, commitMsg);
  logger.success(`Committed: ${commitMsg}`);

  // GitHub
  if (!isGitHubConfigured()) {
    logger.warn('GitHub not configured. Run "autogit login"');
    return;
  }

  const user = await getAuthenticatedUser();

  if (!status.hasRemote) {
    const exists = await repoExists(user.login, analysis.name);
    if (!exists) {
      const topics = generateTopics(analysis);
      const repo = await createRepo({
        name: analysis.name,
        description: analysis.description || '',
        isPrivate: opts.private ?? false,
        topics,
      });
      await addRemote(rootDir, repo.cloneUrl);
      logger.success(`Created: ${chalk.underline(repo.htmlUrl)}`);
    }
  }

  const pushSpin = spinner('Pushing...').start();
  await push(rootDir);
  pushSpin.succeed('Pushed to GitHub');
}
