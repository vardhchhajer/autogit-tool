import { runBragInProject } from '../services/brag-agent.js';
import { logger } from '../utils/logger.js';
import { resolveProjectDirectory } from '../utils/project-root.js';

export async function cmdBrag(): Promise<void> {
  logger.header('Brag Video');
  logger.dimmed('The coding agent may create a brag-output folder in this project. Review its files before publishing.');
  await runBragInProject(resolveProjectDirectory().root);
  logger.success('Brag video workflow finished.');
}
