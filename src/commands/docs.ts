import { resolve } from 'path';
import { scanProject } from '../scanner/file-scanner.js';
import { analyzeProject } from '../scanner/project-analyzer.js';
import { generateDocs, writeDocs } from '../services/docs-generator.js';
import { logger } from '../utils/logger.js';

export async function cmdDocs(opts: { ai?: boolean; regenerate?: boolean }): Promise<void> {
  const rootDir = resolve(process.cwd());

  logger.header('Generate Documentation');

  const scan = scanProject(rootDir);
  const analysis = analyzeProject(rootDir, scan);
  const useAI = opts.ai !== false;

  const docs = await generateDocs(rootDir, analysis, scan, useAI, opts.regenerate);

  if (docs.length === 0) {
    logger.info('All documentation files already exist. Use --regenerate to update.');
    return;
  }

  writeDocs(docs);

  for (const doc of docs) {
    logger.success(`${doc.exists ? 'Updated' : 'Created'}: ${doc.name}`);
  }
}
