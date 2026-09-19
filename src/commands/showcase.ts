import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { scanProject } from '../scanner/file-scanner.js';
import { analyzeProject } from '../scanner/project-analyzer.js';
import { collectShowcaseFacts, generateShowcase } from '../services/showcase.js';
import { saveShowcaseCards } from '../services/showcase-cards.js';
import { getGitStatus } from '../services/git-service.js';
import { remoteWebUrl } from '../services/publish-workflow.js';
import { getConfigDir } from '../utils/platform.js';
import { logger } from '../utils/logger.js';
import { resolveProjectDirectory } from '../utils/project-root.js';

export async function cmdShowcase(): Promise<void> {
  const root = resolveProjectDirectory().root;
  logger.header('Project Showcase');
  const scan = scanProject(root);
  const analysis = await analyzeProject(root, scan);
  const base = collectShowcaseFacts(root, scan, analysis);
  const showcase = await generateShowcase(base, true);
  const git = await getGitStatus(root);
  const link = git.remoteUrl ? remoteWebUrl(git.remoteUrl) : undefined;
  const post = showcase.post.replace(/\[PROJECT_LINK\]/g, link || '[ADD_PROJECT_URL]');
  const slug = analysis.name.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '') || 'project';
  const directory = join(getConfigDir(), 'social', slug, `showcase-${Date.now()}`);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'post.txt'), post + '\n', 'utf8');
  writeFileSync(join(directory, 'evidence.json'), JSON.stringify({ project: showcase.name, kind: showcase.kind, facts: showcase.facts }, null, 2) + '\n', 'utf8');
  const cards = await saveShowcaseCards(showcase, directory);
  logger.success(`Showcase saved: ${directory}`);
  logger.dimmed(`Project type: ${showcase.kind}; ${showcase.facts.length} sourced facts`);
  logger.success(`${cards.png.length} PNG cards are ready to upload.`);
  logger.blank();
  console.log(post);
  logger.blank();
  logger.dimmed('Review the post and cards before publishing. No project command was run and no result was fabricated.');
}
