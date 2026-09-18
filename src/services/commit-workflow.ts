import chalk from 'chalk';
import inquirer from 'inquirer';
import {
  commit, generateCommitMessage, getCommitPlan, getStagedSummary, stageCommitPlan,
} from './git-service.js';
import { logger } from '../utils/logger.js';

export async function runCommitWorkflow(rootDir: string, yes: boolean, useAI: boolean): Promise<boolean> {
  const plan = await getCommitPlan(rootDir);
  logger.info(`Branch: ${plan.branch || '(not yet named)'}`);
  logger.info(`Remote: ${plan.remoteUrl || '(none)'}`);
  logger.info(`Already staged: ${plan.staged.length} file(s)`);
  for (const file of plan.staged) logger.dimmed(`  staged  ${file}`);
  logger.info(`To stage: ${plan.toStage.length} file(s)`);
  for (const file of plan.toStage) logger.dimmed(`  add     ${file}`);
  for (const file of plan.preservedUnstaged) {
    logger.dimmed(`  left unstaged (partial staging preserved)  ${file}`);
  }

  if (plan.sensitive.length > 0) {
    throw new Error(`Likely sensitive file(s) would be committed: ${plan.sensitive.join(', ')}. Remove them from the commit first.`);
  }
  if (plan.staged.length === 0 && plan.toStage.length === 0) {
    logger.dimmed('Nothing to commit');
    return true;
  }

  if (!yes) {
    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([{
      type: 'confirm', name: 'confirm', message: 'Stage the listed files for this commit?', default: true,
    }]);
    if (!confirm) return false;
  }

  await stageCommitPlan(rootDir, plan);
  const summary = await getStagedSummary(rootDir);
  if (summary) logger.info(`Commit contents:\n${summary}`);
  let message = await generateCommitMessage(rootDir, useAI);
  if (!yes) {
    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([{
      type: 'confirm', name: 'confirm', message: `Commit with message "${message}"?`, default: true,
    }]);
    if (!confirm) {
      logger.dimmed('Commit cancelled. Newly staged files remain staged for your review.');
      return false;
    }
    const { edit } = await inquirer.prompt<{ edit: boolean }>([{
      type: 'confirm', name: 'edit', message: 'Edit commit message?', default: false,
    }]);
    if (edit) {
      const answer = await inquirer.prompt<{ message: string }>([{
        type: 'input', name: 'message', message: 'Commit message:', default: message,
      }]);
      message = answer.message;
    }
  }
  const committed = await commit(rootDir, message);
  if (committed) logger.success(`Committed: ${chalk.cyan(message)}`);
  return committed;
}
