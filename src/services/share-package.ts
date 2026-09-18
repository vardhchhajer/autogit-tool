import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ProjectAnalysis } from '../scanner/project-analyzer.js';
import type { ScanResult } from '../scanner/file-scanner.js';
import type { SocialContent } from './social-generator.js';
import { collectShowcaseFacts, generateShowcase } from './showcase.js';
import { saveShowcaseCards } from './showcase-cards.js';
import { getConfigDir } from '../utils/platform.js';

export interface SharePackageResult { directory: string; post: string; cards: string[] }

export async function createSharePackage(
  root: string, scan: ScanResult, analysis: ProjectAnalysis, content: SocialContent,
  useAI: boolean, publishedUrl?: string,
): Promise<SharePackageResult> {
  const base = collectShowcaseFacts(root, scan, analysis);
  const showcase = await generateShowcase(base, useAI);
  const link = publishedUrl || '[ADD_PROJECT_URL]';
  const post = showcase.post.replace(/\[PROJECT_LINK\]/g, link);
  const slug = analysis.name.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '') || 'project';
  const directory = join(getConfigDir(), 'social', slug, `share-${Date.now()}`);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'linkedin.txt'), post + '\n', 'utf8');
  writeFileSync(join(directory, 'x.txt'), content.twitter.replace(/\[GITHUB_LINK\]/g, link) + '\n', 'utf8');
  writeFileSync(join(directory, 'devto.md'), content.devto.replace(/\[GITHUB_LINK\]/g, link) + '\n', 'utf8');
  writeFileSync(join(directory, 'evidence.json'), JSON.stringify({ project: showcase.name, kind: showcase.kind, facts: showcase.facts, publishedUrl: publishedUrl || null }, null, 2) + '\n', 'utf8');
  const cards = await saveShowcaseCards(showcase, directory);
  return { directory, post, cards: cards.png };
}
