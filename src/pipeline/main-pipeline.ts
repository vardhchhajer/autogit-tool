import { resolve } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { scanProject } from '../scanner/file-scanner.js';
import { analyzeProject, type ProjectAnalysis } from '../scanner/project-analyzer.js';
import { generateReadme, writeReadme, displayDiff, type ReadmeResult } from '../services/readme-manager.js';
import { generateDocs, writeDocs, type DocFile } from '../services/docs-generator.js';
import { getGitStatus, initGit, generateGitignore, stageAll, generateCommitMessage, commit, push, addRemote } from '../services/git-service.js';
import { createRepo, getAuthenticatedUser, repoExists, generateTopics, isGitHubConfigured } from '../services/github-service.js';
import { generateSocialContent, openLinkedInShare, openTwitterShare } from '../services/social-generator.js';
import { runResumeUpdate } from '../commands/resume.js';
import { loadConfig } from '../config/manager.js';
import { logger, spinner } from '../utils/logger.js';

export interface PipelineOptions {
  yes?: boolean;
  dryRun?: boolean;
  skipReadme?: boolean;
  skipLinkedin?: boolean;
  skipGithub?: boolean;
  skipResume?: boolean;
  noAI?: boolean;
  force?: boolean;
  regenerate?: boolean;
  private?: boolean;
  public?: boolean;
}

export async function runMainPipeline(options: PipelineOptions): Promise<void> {
  const rootDir = resolve(process.cwd());

  logger.header('AutoGit');
  logger.dimmed(`Analyzing: ${rootDir}`);
  logger.blank();

  // Step 1: Scan project
  const scanSpin = spinner('Scanning project...').start();
  const scan = scanProject(rootDir);
  scanSpin.succeed(`Scanned ${scan.totalFiles} files in ${scan.directories.length} directories`);

  if (scan.totalFiles === 0) {
    logger.warn('No files found in this directory. Is this the right project folder?');
    return;
  }

  // Step 2: Analyze project
  const analyzeSpin = spinner('Analyzing project...').start();
  const analysis = await analyzeProject(rootDir, scan);
  analyzeSpin.succeed(formatAnalysisSummary(analysis));

  logger.blank();
  displayProjectInfo(analysis);
  logger.blank();

  const useAI = !options.noAI;
  let resolvedRepoUrl: string | undefined;

  // Step 3: README
  let readmeResult: ReadmeResult | null = null;
  if (!options.skipReadme) {
    readmeResult = await handleReadme(rootDir, analysis, useAI, options);
  }

  // Step 4: Additional documentation
  const docs = await handleDocs(rootDir, analysis, scan, useAI, options);

  // Step 5: Resume auto-update — runs AFTER git init but BEFORE commit
  // so the updated resume can be included in the same commit
  if (!options.skipResume && !options.dryRun) {
    await handleResume(rootDir, useAI, options);
  } else if (options.dryRun) {
    logger.dimmed('[dry-run] Would update resume (if configured)');
  }

  // Step 6: Git operations
  await handleGit(rootDir, analysis, readmeResult, docs, useAI, options);

  // Step 7: GitHub
  if (!options.skipGithub) {
    resolvedRepoUrl = await handleGitHub(rootDir, analysis, options);
  }

  // Step 7: Social content
  if (!options.skipLinkedin) {
    await handleSocialContent(analysis, useAI, options, resolvedRepoUrl);
  }

  logger.blank();
  logger.success(chalk.bold('Done! Your project is documented and published. 🎉'));
}

function formatAnalysisSummary(analysis: ProjectAnalysis): string {
  const parts: string[] = [];
  if (analysis.languages.length) parts.push(analysis.languages.slice(0, 2).join(' + '));
  if (analysis.frameworks.length) parts.push(analysis.frameworks[0]);
  return parts.length > 0 ? `Detected: ${parts.join(' / ')}` : 'Project analyzed';
}

function displayProjectInfo(analysis: ProjectAnalysis): void {
  logger.info(`Project: ${chalk.bold(analysis.displayName || analysis.name)}`);
  if (analysis.displayName && analysis.displayName !== analysis.name) {
    logger.dimmed(`  (package: ${analysis.name})`);
  }
  if (analysis.languages.length) logger.info(`Languages: ${analysis.languages.join(', ')}`);
  if (analysis.frameworks.length) logger.info(`Frameworks: ${analysis.frameworks.join(', ')}`);
  if (analysis.packageManager) logger.info(`Package Manager: ${analysis.packageManager}`);
  if (analysis.architecture !== 'unknown') logger.info(`Architecture: ${analysis.architecture}`);
  if (analysis.codeFeatures.length > 0) {
    logger.info(`Features: ${analysis.codeFeatures.slice(0, 5).join(', ')}`);
  }
}

async function handleReadme(
  rootDir: string,
  analysis: ProjectAnalysis,
  useAI: boolean,
  options: PipelineOptions
): Promise<ReadmeResult | null> {
  const result = await generateReadme(rootDir, analysis, useAI);

  if (result.isNew) {
    logger.info('No README found. Generated new README.md');
  } else if (result.diff) {
    logger.info('README improvements found');

    if (!options.yes && !options.dryRun) {
      logger.blank();
      logger.dimmed('Proposed changes:');
      displayDiff(result.diff);
      logger.blank();

      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Update README?',
        default: true,
      }]);

      if (!confirm) {
        logger.dimmed('README update skipped');
        return null;
      }
    }
  }

  if (!options.dryRun) {
    writeReadme(result);
    logger.success('README updated');
  } else {
    logger.dimmed('[dry-run] Would update README');
  }

  return result;
}

async function handleDocs(
  rootDir: string,
  analysis: ProjectAnalysis,
  scan: any,
  useAI: boolean,
  options: PipelineOptions
): Promise<DocFile[]> {
  const docs = await generateDocs(rootDir, analysis, scan, useAI, options.regenerate);

  if (docs.length === 0) {
    logger.dimmed('No additional documentation needed');
    return [];
  }

  if (!options.yes && !options.dryRun) {
    logger.blank();
    logger.info(`Will create ${docs.length} documentation file(s):`);
    for (const doc of docs) {
      logger.dimmed(`  ${doc.exists ? '(update)' : '(new)'} ${doc.name}`);
    }

    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: 'Generate documentation files?',
      default: true,
    }]);

    if (!confirm) {
      logger.dimmed('Documentation generation skipped');
      return [];
    }
  }

  if (!options.dryRun) {
    writeDocs(docs);
    logger.success(`Generated ${docs.length} documentation file(s)`);
  } else {
    logger.dimmed(`[dry-run] Would generate ${docs.length} documentation file(s)`);
  }

  return docs;
}

async function handleGit(
  rootDir: string,
  analysis: ProjectAnalysis,
  readmeResult: ReadmeResult | null,
  docs: DocFile[],
  useAI: boolean,
  options: PipelineOptions
): Promise<void> {
  const status = await getGitStatus(rootDir);

  // Initialize git if needed
  if (!status.isRepo) {
    if (!options.dryRun) {
      await initGit(rootDir);
      await generateGitignore(rootDir, analysis);
    } else {
      logger.dimmed('[dry-run] Would initialize Git repository');
    }
  }

  // Stage changes
  if (options.dryRun) {
    logger.dimmed('[dry-run] Would stage and commit changes');
    return;
  }

  await stageAll(rootDir);

  // Generate commit message
  let commitMsg = await generateCommitMessage(rootDir, useAI);

  if (!options.yes) {
    logger.blank();
    logger.info(`Commit message: ${chalk.cyan(commitMsg)}`);
    const { editCommit } = await inquirer.prompt([{
      type: 'confirm',
      name: 'editCommit',
      message: 'Edit commit message?',
      default: false,
    }]);

    if (editCommit) {
      const { newMsg } = await inquirer.prompt([{
        type: 'input',
        name: 'newMsg',
        message: 'Commit message:',
        default: commitMsg,
      }]);
      commitMsg = newMsg;
    }
  }

  await commit(rootDir, commitMsg);
  logger.success(`Committed: ${commitMsg}`);
}

async function handleGitHub(
  rootDir: string,
  analysis: ProjectAnalysis,
  options: PipelineOptions
): Promise<string | undefined> {
  if (!isGitHubConfigured()) {
    logger.warn('GitHub not configured. Run "autogit login" or set GITHUB_TOKEN');
    return undefined;
  }

  await getGitStatus(rootDir); // ensure git is initialised before pushing

  try {
    const user = await getAuthenticatedUser();
    logger.info(`Authenticated as ${chalk.bold(user.login)}`);

    const repoName = analysis.name;
    const exists = await repoExists(user.login, repoName);
    let repoHtmlUrl = `https://github.com/${user.login}/${repoName}`;

    if (!exists) {
      // Ask about visibility if not already specified via flags
      let isPrivate: boolean;
      if (options.private !== undefined || options.public !== undefined) {
        isPrivate = options.private ?? !(options.public ?? false);
      } else if (options.yes) {
        isPrivate = false; // default to public when --yes
      } else {
        logger.blank();
        const { visibility } = await inquirer.prompt<{ visibility: string }>([{
          type: 'list',
          name: 'visibility',
          message: `Repository visibility for "${repoName}":`,
          choices: [
            { name: 'Public  (anyone can see it)', value: 'public' },
            { name: 'Private (only you can see it)', value: 'private' },
          ],
          default: 'public',
        }]);
        isPrivate = visibility === 'private';
      }

      if (!options.yes) {
        logger.blank();
        logger.info(`Will create ${isPrivate ? 'private' : 'public'} repository: ${user.login}/${repoName}`);
        const { confirm } = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirm',
          message: 'Create GitHub repository?',
          default: true,
        }]);

        if (!confirm) {
          logger.dimmed('GitHub repository creation skipped');
          return undefined;
        }
      }

      if (!options.dryRun) {
        const topics = generateTopics(analysis);
        const repo = await createRepo({
          name: repoName,
          description: analysis.description || `${analysis.languages[0] || ''} project`,
          isPrivate,
          topics,
        });

        await addRemote(rootDir, repo.cloneUrl);
        repoHtmlUrl = repo.htmlUrl;
        logger.success(`Created repository: ${chalk.underline(repo.htmlUrl)}`);
      } else {
        logger.dimmed(`[dry-run] Would create repository: ${user.login}/${repoName}`);
      }
    } else {
      logger.info(`Repository exists: ${chalk.underline(repoHtmlUrl)}`);
    }

    // Push
    if (!options.dryRun) {
      const pushSpin = spinner('Pushing to GitHub...').start();
      try {
        await push(rootDir);
        pushSpin.succeed('Pushed to GitHub');
      } catch (error: any) {
        pushSpin.fail(`Push failed: ${error.message}`);
      }
    }

    return repoHtmlUrl;
  } catch (error: any) {
    logger.error(`GitHub error: ${error.message}`);
    return undefined;
  }
}

async function handleSocialContent(
  analysis: ProjectAnalysis,
  useAI: boolean,
  options: PipelineOptions,
  repoUrl?: string
): Promise<void> {
  const content = await generateSocialContent(analysis, useAI);

  // Replace placeholder with real repo URL if we have it
  const url = repoUrl || `https://github.com/${analysis.name}`;
  const linkedinText = content.linkedin.medium.replace(/\[GITHUB_LINK\]/g, url);
  const tweetText = content.twitter.replace(/\[GITHUB_LINK\]/g, url);

  logger.blank();
  logger.header('LinkedIn Post (Medium)');
  console.log(linkedinText);
  logger.blank();
  logger.header('X (Twitter) Post');
  console.log(tweetText);
  logger.blank();

  if (!options.yes && !options.dryRun) {
    const { openLinkedIn } = await inquirer.prompt([{
      type: 'confirm',
      name: 'openLinkedIn',
      message: 'Open LinkedIn share dialog in browser?',
      default: true,
    }]);
    if (openLinkedIn) {
      await openLinkedInShare(url);
    }

    const { openTwitter } = await inquirer.prompt([{
      type: 'confirm',
      name: 'openTwitter',
      message: 'Open X (Twitter) compose window in browser?',
      default: true,
    }]);
    if (openTwitter) {
      await openTwitterShare(tweetText, url);
    }
  }

  logger.dimmed('Tip: Use "autogit linkedin" to see all versions (short/medium/long)');
}

async function handleResume(
  rootDir: string,
  useAI: boolean,
  options: PipelineOptions
): Promise<void> {
  const config = loadConfig();

  // Skip silently if resume not configured and --yes is set (non-interactive mode)
  if (!config.resume?.path) {
    if (!options.yes) {
      // Offer setup only in interactive mode
      await runResumeUpdate(rootDir, useAI, true);
    }
    return;
  }

  // Skip if resume auto-update is explicitly disabled in config
  if (config.resume.enabled === false) {
    logger.dimmed('Resume auto-update disabled (run "autogit resume" to update manually)');
    return;
  }

  // Run resume update — interactive unless --yes
  await runResumeUpdate(rootDir, useAI, !options.yes);
}
