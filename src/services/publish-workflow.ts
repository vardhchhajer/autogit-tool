import chalk from 'chalk';
import inquirer from 'inquirer';
import type { ProjectAnalysis } from '../scanner/project-analyzer.js';
import { addRemote, getGitStatus, push } from './git-service.js';
import { createRepo, getAuthenticatedUser, repoExists, generateTopics, isGitHubConfigured } from './github-service.js';
import { logger, spinner } from '../utils/logger.js';
import { loadConfig } from '../config/manager.js';

export interface PublishOptions {
  yes?: boolean;
  dryRun?: boolean;
  private?: boolean;
  public?: boolean;
}

export interface PublishResult {
  published: boolean;
  url?: string;
}

export function remoteWebUrl(remoteUrl: string): string | undefined {
  const ssh = remoteUrl.match(/^git@([^:]+):(.+?)(?:\.git)?$/i);
  if (ssh) return `https://${ssh[1]}/${ssh[2].replace(/\.git$/, '')}`;
  try {
    const url = new URL(remoteUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return undefined;
    url.username = '';
    url.password = '';
    url.pathname = url.pathname.replace(/\.git$/, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

export async function runPublishWorkflow(
  rootDir: string,
  analysis: ProjectAnalysis,
  options: PublishOptions
): Promise<PublishResult> {
  const status = await getGitStatus(rootDir);
  if (!status.isRepo && options.dryRun) {
    logger.dimmed('[dry-run] Would initialize Git, then create or use origin and push the new commit');
    return { published: false };
  }
  if (!status.isRepo) throw new Error('Not a Git repository');
  let url = status.remoteUrl ? remoteWebUrl(status.remoteUrl) : undefined;

  if (options.dryRun) {
    logger.dimmed(status.hasRemote
      ? `[dry-run] Would push ${status.branch} to existing origin: ${status.remoteUrl}`
      : '[dry-run] No origin remote; repository creation would require confirmation');
    return { published: false, url };
  }

  if (status.hasRemote) {
    logger.info(`Using existing origin: ${status.remoteUrl}`);
  } else {
    if (!isGitHubConfigured()) {
      logger.warn('No origin remote or GitHub token. Commit saved locally; run "autogit login" to publish.');
      return { published: false };
    }
    const user = await getAuthenticatedUser();
    const repoName = analysis.name;
    if (await repoExists(user.login, repoName)) {
      logger.warn(`Repository ${user.login}/${repoName} already exists. Set origin yourself to choose the correct destination; no remote was changed.`);
      return { published: false };
    }
    const configuredVisibility = loadConfig().defaults?.visibility;
    let isPrivate = options.private === true || (options.public !== true && configuredVisibility !== 'public');
    if (!options.yes && options.private === undefined && options.public === undefined) {
      const answer = await inquirer.prompt<{ visibility: string }>([{
        type: 'list', name: 'visibility', message: `Visibility for ${user.login}/${repoName}:`,
        choices: [
          { name: 'Private', value: 'private' },
          { name: 'Public', value: 'public' },
        ],
        default: isPrivate ? 'private' : 'public',
      }]);
      isPrivate = answer.visibility === 'private';
    }
    if (!options.yes) {
      const answer = await inquirer.prompt<{ confirm: boolean }>([{
        type: 'confirm', name: 'confirm',
        message: `Create ${isPrivate ? 'private' : 'public'} repository ${user.login}/${repoName}?`,
        default: false,
      }]);
      if (!answer.confirm) return { published: false };
    }
    const repo = await createRepo({
      name: repoName,
      description: analysis.description || '',
      isPrivate,
      topics: generateTopics(analysis),
    });
    await addRemote(rootDir, repo.cloneUrl);
    url = repo.htmlUrl;
    logger.success(`Created repository: ${chalk.underline(url)}`);
  }

  const pushSpin = spinner('Pushing to origin...').start();
  try {
    await push(rootDir);
    pushSpin.succeed('Pushed to origin');
    return { published: true, url };
  } catch (error: any) {
    pushSpin.fail(`Push failed: ${error.message}`);
    throw error;
  }
}
