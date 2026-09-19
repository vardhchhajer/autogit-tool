import chalk from 'chalk';
import inquirer from 'inquirer';
import { scanProject } from '../scanner/file-scanner.js';
import { analyzeProject, type ProjectAnalysis } from '../scanner/project-analyzer.js';
import { generateReadme, writeReadme, displayDiff, type ReadmeResult } from '../services/readme-manager.js';
import { generateDocs, writeDocs, type DocFile } from '../services/docs-generator.js';
import { getGitStatus, initGit, generateGitignore, getCommitPlan } from '../services/git-service.js';
import { runCommitWorkflow } from '../services/commit-workflow.js';
import { runPublishWorkflow } from '../services/publish-workflow.js';
import { generateSocialContent, openLinkedInShare, openTwitterShare, copyToClipboard } from '../services/social-generator.js';
import { runResumeUpdate } from '../commands/resume.js';
import { loadConfig } from '../config/manager.js';
import { createSharePackage } from '../services/share-package.js';
import { runBragInProject, selectBragAgent } from '../services/brag-agent.js';
import { captureProjectScreenshot, generatePromotionalArtwork, isImageGenerationConfigured } from '../services/social-images.js';
import { join } from 'path';
import { logger, spinner } from '../utils/logger.js';
import { resolveProjectDirectory } from '../utils/project-root.js';

export interface PipelineOptions {
  yes?: boolean;
  dryRun?: boolean;
  skipReadme?: boolean;
  skipLinkedin?: boolean;
  skipGithub?: boolean;
  skipResume?: boolean;
  force?: boolean;
  regenerate?: boolean;
  private?: boolean;
  public?: boolean;
  screenshotUrl?: string;
  promoImage?: boolean;
}

export async function runMainPipeline(options: PipelineOptions): Promise<void> {
  const projectDirectory = resolveProjectDirectory();
  const rootDir = projectDirectory.root;

  logger.header('AutoGit');
  if (projectDirectory.discovered) logger.info(`Using project folder: ${rootDir}`);
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

  const useAI = true;
  let resolvedRepoUrl: string | undefined;
  let published = false;

  // Step 3: README
  let readmeResult: ReadmeResult | null = null;
  if (!options.skipReadme) {
    readmeResult = await handleReadme(rootDir, analysis, useAI, options, scan);
  }

  // Step 4: Additional documentation
  await handleDocs(rootDir, analysis, scan, useAI, options);

  // Step 5: Resume auto-update — runs AFTER git init but BEFORE commit
  // so the updated resume can be included in the same commit
  if (!options.skipResume && !options.dryRun) {
    await handleResume(rootDir, useAI, options, scan);
  } else if (options.dryRun) {
    logger.dimmed('[dry-run] Would update resume (if configured)');
  }

  // Step 6: Git operations
  const canPublish = await handleGit(rootDir, analysis, useAI, options);

  // Step 7: GitHub
  if (!options.skipGithub && canPublish) {
    const result = await runPublishWorkflow(rootDir, analysis, options);
    resolvedRepoUrl = result.url;
    published = result.published;
  }

  // Step 7: Social content
  if (!options.skipLinkedin) {
    await handleSocialContent(rootDir, scan, analysis, useAI, options, published ? resolvedRepoUrl : undefined);
  }

  logger.blank();
  logger.success(chalk.bold(published ? 'Done! Your project was published.' : 'Done! Local project work finished; no push was made.'));
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
  options: PipelineOptions,
  scan: import('../scanner/file-scanner.js').ScanResult
): Promise<ReadmeResult | null> {
  const result = await generateReadme(rootDir, analysis, useAI, scan);

  if (result.isNew) {
    logger.info('No README found. Generated new README.md');
    if (!options.yes && !options.dryRun) {
      logger.blank();
      console.log(result.content);
      logger.blank();
      const { confirm } = await inquirer.prompt([{
        type: 'confirm', name: 'confirm', message: 'Create README.md?', default: true,
      }]);
      if (!confirm) return null;
    }
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

  if (!result.isNew && !result.diff) {
    logger.dimmed('README is already up to date');
    return result;
  }

  if (!options.dryRun) {
    await writeReadme(result);
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
  useAI: boolean,
  options: PipelineOptions
): Promise<boolean> {
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

  if (options.dryRun) {
    if (status.isRepo) {
      const plan = await getCommitPlan(rootDir);
      logger.dimmed(`[dry-run] Branch: ${plan.branch || '(not yet named)'}, origin: ${plan.remoteUrl || '(none)'}`);
      logger.dimmed(`[dry-run] Already staged: ${plan.staged.join(', ') || '(none)'}`);
      logger.dimmed(`[dry-run] Would stage: ${plan.toStage.join(', ') || '(none)'}`);
      if (plan.sensitive.length) logger.warn(`[dry-run] Sensitive files detected: ${plan.sensitive.join(', ')}`);
    } else {
      logger.dimmed('[dry-run] Would stage the generated project files and commit them');
    }
    return true;
  }
  return runCommitWorkflow(rootDir, options.yes === true, useAI);
}

async function handleSocialContent(
  rootDir: string,
  scan: import('../scanner/file-scanner.js').ScanResult,
  analysis: ProjectAnalysis,
  useAI: boolean,
  options: PipelineOptions,
  repoUrl?: string
): Promise<void> {
  const content = await generateSocialContent(analysis, useAI);

  // Replace placeholder with real repo URL if we have it
  const url = repoUrl;
  let linkedinText = content.linkedin.medium.replace(/\[GITHUB_LINK\]/g, url || '[ADD_PROJECT_URL]');
  const tweetText = content.twitter.replace(/\[GITHUB_LINK\]/g, url || '[ADD_PROJECT_URL]');

  let shareDirectory: string | undefined;
  if (options.dryRun) {
    logger.dimmed('[dry-run] Would create a share package with sourced post, drafts, and three PNG cards');
  } else {
    try {
      const share = await createSharePackage(rootDir, scan, analysis, content, useAI, url);
      shareDirectory = share.directory;
      linkedinText = share.post;
      logger.success(`Share package saved: ${share.directory}`);
      logger.dimmed(`${share.cards.length} PNG cards and sourced post are ready for review.`);
    } catch (error: any) {
      logger.warn(`Share package could not be saved: ${error.message}`);
    }
  }

  let screenshotUrl = options.screenshotUrl;
  let promoImage = options.promoImage === true;
  if (!options.yes && !options.dryRun && !screenshotUrl && !promoImage && shareDirectory) {
    const artworkAvailable = isImageGenerationConfigured();
    const answer = await inquirer.prompt<{ media: string }>([{
      type: 'list', name: 'media', message: 'Add optional media?',
      choices: [
        { name: 'No additional media', value: 'none' },
        { name: 'Real web-app screenshot (requires a running URL)', value: 'screenshot' },
        ...(artworkAvailable ? [
          { name: 'Conceptual artwork', value: 'artwork' },
          { name: 'Screenshot and artwork', value: 'both' },
        ] : []),
      ], default: 'none',
    }]);
    if (answer.media === 'screenshot' || answer.media === 'both') {
      const urlAnswer = await inquirer.prompt<{ url: string }>([{
        type: 'input', name: 'url', message: 'Running app URL (leave blank to skip):',
        validate: value => !value.trim() || /^https?:\/\//i.test(value) || 'Enter an http:// or https:// URL, or leave blank',
      }]);
      screenshotUrl = urlAnswer.url.trim() || undefined;
    }
    promoImage = answer.media === 'artwork' || answer.media === 'both';
  }
  if (options.dryRun) {
    if (screenshotUrl) logger.dimmed(`[dry-run] Would capture screenshot from ${screenshotUrl}`);
    if (promoImage) logger.dimmed('[dry-run] Would generate promotional artwork');
  } else if (shareDirectory) {
    if (screenshotUrl) {
      try {
        const path = join(shareDirectory, 'screenshot.png');
        await captureProjectScreenshot(screenshotUrl, path);
        logger.success(`Screenshot saved: ${path}`);
      } catch (error: any) { logger.warn(`Screenshot unavailable: ${error.message}`); }
    }
    if (promoImage) {
      const path = join(shareDirectory, 'artwork.png');
      await generatePromotionalArtwork(analysis, path);
      logger.success(`Artwork saved: ${path}`);
    }
  }

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
    if (openLinkedIn && url) {
      // Auto-copy the post text to clipboard so user can paste immediately
      const copied = await copyToClipboard(linkedinText);
      await openLinkedInShare(url);
      if (copied) {
        logger.success('LinkedIn post copied to clipboard — just paste it into the share dialog');
      }
    } else if (openLinkedIn) {
      logger.warn('No repository URL found. Add a project URL before sharing.');
    }

    const { openTwitter } = await inquirer.prompt([{
      type: 'confirm',
      name: 'openTwitter',
      message: 'Open X (Twitter) compose window in browser?',
      default: true,
    }]);
    if (openTwitter) {
      await openTwitterShare(tweetText, url || '');
    }
  }

  if (!options.dryRun) {
    const config = loadConfig();
    const agent = config.setup?.agent || selectBragAgent(config.ai?.provider || 'openai');
    if (config.setup?.brag === 'installed' && config.setup.agent === agent) {
      let createVideo = options.yes === true;
      if (!options.yes) {
        const answer = await inquirer.prompt<{ createVideo: boolean }>([{
          type: 'confirm', name: 'createVideo', message: 'Create a Brag video for this project?', default: false,
        }]);
        createVideo = answer.createVideo;
      }
      if (createVideo) {
        await runBragInProject(rootDir);
      }
    }
  }

  logger.dimmed('Review the saved post and media before publishing on LinkedIn.');
}

async function handleResume(
  rootDir: string,
  useAI: boolean,
  options: PipelineOptions,
  scan?: import('../scanner/file-scanner.js').ScanResult
): Promise<void> {
  const config = loadConfig();

  if (!config.resume?.path) {
    if (!options.yes) {
      await runResumeUpdate(rootDir, useAI, true, scan);
    }
    return;
  }

  if (config.resume.enabled === false) {
    logger.dimmed('Resume auto-update disabled (run "autogit resume" to update manually)');
    return;
  }

  await runResumeUpdate(rootDir, useAI, !options.yes, scan);
}
