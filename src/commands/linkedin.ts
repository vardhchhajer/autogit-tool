import { resolve } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { scanProject } from '../scanner/file-scanner.js';
import { analyzeProject } from '../scanner/project-analyzer.js';
import { generateSocialContent, openLinkedInShare, openTwitterShare, copyToClipboard } from '../services/social-generator.js';
import { logger } from '../utils/logger.js';

export async function cmdLinkedin(opts: { ai?: boolean }): Promise<void> {
  const rootDir = resolve(process.cwd());

  logger.header('Social Media Content');

  const scan = scanProject(rootDir);
  const analysis = await analyzeProject(rootDir, scan);
  const useAI = opts.ai !== false;

  const content = await generateSocialContent(analysis, useAI);

  // Replace GitHub link placeholder
  const repoUrl = `https://github.com/vardhchhajer/${analysis.name}`;
  const shortPost  = content.linkedin.short.replace(/\[GITHUB_LINK\]/g, repoUrl);
  const mediumPost = content.linkedin.medium.replace(/\[GITHUB_LINK\]/g, repoUrl);
  const longPost   = content.linkedin.long.replace(/\[GITHUB_LINK\]/g, repoUrl);
  const tweetText  = content.twitter.replace(/\[GITHUB_LINK\]/g, repoUrl);

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
    if (openBrowser) await openLinkedInShare(repoUrl);
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
    await openTwitterShare(tweetText, repoUrl);
  }
}
