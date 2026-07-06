import { resolve } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { scanProject } from '../scanner/file-scanner.js';
import { analyzeProject } from '../scanner/project-analyzer.js';
import { getAuthenticatedUser, createRelease, repoExists, isGitHubConfigured } from '../services/github-service.js';
import { logger } from '../utils/logger.js';

export async function cmdRelease(opts: { tag?: string; draft?: boolean }): Promise<void> {
  const rootDir = resolve(process.cwd());

  logger.header('Create Release');

  if (!isGitHubConfigured()) {
    logger.error('GitHub not configured. Run "autogit login"');
    return;
  }

  const scan = scanProject(rootDir);
  const analysis = analyzeProject(rootDir, scan);
  const user = await getAuthenticatedUser();
  const repoName = analysis.name;

  const exists = await repoExists(user.login, repoName);
  if (!exists) {
    logger.error(`Repository "${user.login}/${repoName}" not found. Run "autogit publish" first.`);
    return;
  }

  // Determine version tag
  let tag = opts.tag;
  if (!tag) {
    const defaultTag = analysis.version ? `v${analysis.version}` : 'v1.0.0';
    const { inputTag } = await inquirer.prompt([{
      type: 'input',
      name: 'inputTag',
      message: 'Release tag:',
      default: defaultTag,
    }]);
    tag = inputTag;
  }

  const { title } = await inquirer.prompt([{
    type: 'input',
    name: 'title',
    message: 'Release title:',
    default: `Release ${tag}`,
  }]);

  const { notes } = await inquirer.prompt([{
    type: 'editor',
    name: 'notes',
    message: 'Release notes (opens editor):',
    default: `## What's New\n\n- Initial release\n\n## Full Changelog\n\nhttps://github.com/${user.login}/${repoName}/commits/${tag}`,
  }]);

  const release = await createRelease(user.login, repoName, {
    tag: tag!,
    name: title,
    body: notes,
    draft: opts.draft,
  });

  logger.success(`Release created: ${chalk.underline(release.htmlUrl)}`);
}
