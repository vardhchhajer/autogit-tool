import { scanProject } from '../scanner/file-scanner.js';
import { analyzeProject } from '../scanner/project-analyzer.js';
import { getGitStatus } from '../services/git-service.js';
import { runCommitWorkflow } from '../services/commit-workflow.js';
import { runPublishWorkflow } from '../services/publish-workflow.js';
import { logger } from '../utils/logger.js';
import { resolveProjectDirectory } from '../utils/project-root.js';

export async function cmdPublish(opts: { yes?: boolean; private?: boolean }): Promise<void> {
  const rootDir = resolveProjectDirectory().root;
  logger.header('Publish to GitHub');
  const status = await getGitStatus(rootDir);
  if (!status.isRepo) throw new Error('Not a Git repository. Run "autogit init" first.');

  const scan = scanProject(rootDir);
  const analysis = await analyzeProject(rootDir, scan);
  const canPublish = await runCommitWorkflow(rootDir, opts.yes === true, true);
  if (!canPublish) {
    logger.dimmed('Publish cancelled');
    return;
  }
  const result = await runPublishWorkflow(rootDir, analysis, opts);
  if (result.published) logger.success(`Published${result.url ? `: ${result.url}` : ' to origin'}`);
  else logger.warn('Local commit is ready; no push was made.');
}
