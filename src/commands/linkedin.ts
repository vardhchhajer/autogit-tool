import { join } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { scanProject } from '../scanner/file-scanner.js';
import { analyzeProject } from '../scanner/project-analyzer.js';
import { generateSocialContent, openLinkedInShare, openTwitterShare, copyToClipboard } from '../services/social-generator.js';
import { captureProjectScreenshot, defaultSocialImagePath, generatePromotionalArtwork } from '../services/social-images.js';
import { collectShowcaseFacts } from '../services/showcase.js';
import { saveShowcaseCards } from '../services/showcase-cards.js';
import { getConfigDir } from '../utils/platform.js';
import { getGitStatus } from '../services/git-service.js';
import { remoteWebUrl } from '../services/publish-workflow.js';
import { logger } from '../utils/logger.js';
import { resolveProjectDirectory } from '../utils/project-root.js';

export async function cmdLinkedin(opts: { screenshotUrl?: string; promoImage?: boolean | string; showcaseCards?: boolean }): Promise<void> {
  const projectDirectory = resolveProjectDirectory();
  const rootDir = projectDirectory.root;

  logger.header('Social Media Content');
  if (projectDirectory.discovered) logger.info(`Using project folder: ${rootDir}`);

  const scan = scanProject(rootDir);
  const analysis = await analyzeProject(rootDir, scan);
  const content = await generateSocialContent(analysis, true);

  // Replace GitHub link placeholder
  const gitStatus = await getGitStatus(rootDir);
  const repoUrl = gitStatus.remoteUrl ? remoteWebUrl(gitStatus.remoteUrl) : undefined;
  const linkText = repoUrl || '[ADD_PROJECT_URL]';
  const shortPost  = content.linkedin.short.replace(/\[GITHUB_LINK\]/g, linkText);
  const mediumPost = content.linkedin.medium.replace(/\[GITHUB_LINK\]/g, linkText);
  const longPost   = content.linkedin.long.replace(/\[GITHUB_LINK\]/g, linkText);
  const tweetText  = content.twitter.replace(/\[GITHUB_LINK\]/g, linkText);

  // Show all versions
  logger.blank();
  logger.header('LinkedIn Post — Short');
  console.log(shortPost);

  logger.blank();
  logger.header('LinkedIn Post — Medium');
  console.log(mediumPost);

  logger.blank();
  logger.header('LinkedIn Post — Long');
  console.log(longPost);

  logger.blank();
  logger.header('X (Twitter) Post');
  console.log(tweetText);

  logger.blank();
  logger.header('DEV.to Article Draft');
  console.log(content.devto);

  logger.blank();
  logger.header('Resume Bullet Point');
  console.log(content.resumeBullet);

  logger.blank();
  logger.header('Portfolio Description');
  console.log(content.portfolioDescription);

  logger.blank();

  let screenshotUrl = opts.screenshotUrl;
  let promoImage = opts.promoImage;
  let showcaseCards = opts.showcaseCards;
  if (!screenshotUrl && !promoImage && !showcaseCards) {
    const answer = await inquirer.prompt<{ imageChoice: string }>([{
      type: 'list', name: 'imageChoice', message: 'Create an image for this post?',
      choices: [
        { name: 'No image', value: 'none' },
        { name: 'Real web-app screenshot (requires a running URL)', value: 'screenshot' },
        { name: 'Conceptual promotional artwork', value: 'artwork' },
        { name: 'Project evidence cards (works for CLI/API/library too)', value: 'cards' },
        { name: 'Both', value: 'both' },
      ], default: 'none',
    }]);
    if (answer.imageChoice === 'screenshot' || answer.imageChoice === 'both') {
      const urlAnswer = await inquirer.prompt<{ url: string }>([{
        type: 'input', name: 'url', message: 'Running app URL (leave blank to skip):',
        validate: value => !value.trim() || /^https?:\/\//i.test(value) || 'Enter an http:// or https:// URL, or leave blank',
      }]);
      screenshotUrl = urlAnswer.url.trim() || undefined;
    }
    if (answer.imageChoice === 'artwork' || answer.imageChoice === 'both') promoImage = true;
    if (answer.imageChoice === 'cards') showcaseCards = true;
  }

  if (screenshotUrl) {
    try {
      const path = defaultSocialImagePath(analysis, 'screenshot');
      await captureProjectScreenshot(screenshotUrl, path);
      logger.success(`Screenshot saved: ${path}`);
    } catch (error: any) {
      logger.warn(`Screenshot unavailable: ${error.message}`);
    }
  }
  if (promoImage) {
    const path = defaultSocialImagePath(analysis, 'artwork');
    await generatePromotionalArtwork(analysis, path, typeof promoImage === 'string' ? promoImage : undefined);
    logger.success(`Promotional artwork saved: ${path}`);
  }
  if (showcaseCards) {
    const base = collectShowcaseFacts(rootDir, scan, analysis);
    const slug = analysis.name.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '') || 'project';
    const directory = join(getConfigDir(), 'social', slug, `cards-${Date.now()}`);
    const cards = await saveShowcaseCards({ ...base, post: '' }, directory);
    logger.success(`${cards.png.length} evidence cards saved: ${directory}`);
  }
  if (screenshotUrl || promoImage || showcaseCards) logger.dimmed('Upload the saved image manually when composing your LinkedIn post.');

  // Ask which version to copy + open
  const { version } = await inquirer.prompt<{ version: string }>([{
    type: 'list',
    name: 'version',
    message: 'Which LinkedIn post version do you want to copy to clipboard?',
    choices: [
      { name: 'Short',  value: 'short'  },
      { name: 'Medium', value: 'medium' },
      { name: 'Long',   value: 'long'   },
      { name: 'Skip',   value: 'skip'   },
    ],
    default: 'medium',
  }]);

  if (version !== 'skip') {
    const postMap: Record<string, string> = { short: shortPost, medium: mediumPost, long: longPost };
    const chosen = postMap[version];
    const copied = await copyToClipboard(chosen);
    if (copied) {
      logger.success(`${version.charAt(0).toUpperCase() + version.slice(1)} post copied to clipboard ✔`);
    } else {
      logger.warn('Could not copy to clipboard automatically — copy it manually above');
    }

    const { openBrowser } = await inquirer.prompt<{ openBrowser: boolean }>([{
      type: 'confirm',
      name: 'openBrowser',
      message: 'Open LinkedIn share dialog in browser?',
      default: true,
    }]);
    if (openBrowser && repoUrl) await openLinkedInShare(repoUrl);
    else if (openBrowser) logger.warn('No repository URL found. Add a project URL to the post before sharing.');
  }

  // Twitter
  const { copyTweet } = await inquirer.prompt<{ copyTweet: boolean }>([{
    type: 'confirm',
    name: 'copyTweet',
    message: 'Copy X (Twitter) post to clipboard and open compose window?',
    default: false,
  }]);
  if (copyTweet) {
    const copied = await copyToClipboard(tweetText);
    if (copied) logger.success('Tweet copied to clipboard ✔');
    await openTwitterShare(tweetText, repoUrl || '');
  }
}
