import { resolve } from 'path';
import chalk from 'chalk';
import { scanProject } from '../scanner/file-scanner.js';
import { analyzeProject } from '../scanner/project-analyzer.js';
import { generateSocialContent } from '../services/social-generator.js';
import { logger } from '../utils/logger.js';

export async function cmdLinkedin(opts: { ai?: boolean }): Promise<void> {
  const rootDir = resolve(process.cwd());

  logger.header('Social Media Content');

  const scan = scanProject(rootDir);
  const analysis = await analyzeProject(rootDir, scan);
  const useAI = opts.ai !== false;

  const content = await generateSocialContent(analysis, useAI);

  // LinkedIn posts
  logger.blank();
  logger.header('LinkedIn Post — Short');
  console.log(content.linkedin.short);

  logger.blank();
  logger.header('LinkedIn Post — Medium');
  console.log(content.linkedin.medium);

  logger.blank();
  logger.header('LinkedIn Post — Long');
  console.log(content.linkedin.long);

  // Twitter
  logger.blank();
  logger.header('X (Twitter) Post');
  console.log(content.twitter);

  // DEV.to
  logger.blank();
  logger.header('DEV.to Article Draft');
  console.log(content.devto);

  // Resume
  logger.blank();
  logger.header('Resume Bullet Point');
  console.log(content.resumeBullet);

  // Portfolio
  logger.blank();
  logger.header('Portfolio Description');
  console.log(content.portfolioDescription);

  logger.blank();
  logger.dimmed('Copy any version above and customize as needed.');
}
