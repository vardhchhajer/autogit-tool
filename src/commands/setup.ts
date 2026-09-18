import inquirer from 'inquirer';
import { getAIConfig, loadConfig, saveConfig } from '../config/manager.js';
import { configureAI, configureDefaults } from './config.js';
import { logger } from '../utils/logger.js';
import { buildBragLaunch, ensureBragAgent, installBragSkill, selectBragAgent } from '../services/brag-agent.js';
import { ensureBragRuntime } from '../services/brag-runtime.js';

export function shouldRunFirstSetup(interactive: boolean): boolean {
  return interactive && loadConfig().setup?.completed !== true;
}

export async function cmdSetup(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Setup needs an interactive terminal. Run autogit setup in a terminal.');
  }

  logger.header('AutoGit Setup');
  const { mode } = await inquirer.prompt<{ mode: 'default' | 'custom' }>([{
    type: 'list', name: 'mode', message: 'How would you like to set up AutoGit?',
    choices: [
      { name: 'Default setup (recommended)', value: 'default' },
      { name: 'Customize settings', value: 'custom' },
    ], default: 'default',
  }]);

  if (mode === 'custom') await configureDefaults();

  const { includeBrag } = await inquirer.prompt<{ includeBrag: boolean }>([{
    type: 'confirm', name: 'includeBrag',
    message: 'Install Brag and a coding agent matched to your AI provider?',
    default: true,
  }]);

  logger.blank();
  logger.header('AI Provider');
  await configureAI();

  let brag: 'installed' | 'skipped' | 'failed' = 'skipped';
  let agent: ReturnType<typeof selectBragAgent> | undefined;
  if (includeBrag) {
    const provider = loadConfig().ai?.provider || getAIConfig().provider;
    agent = selectBragAgent(provider);
    logger.info(`Setting up Brag with ${agent}...`);
    try {
      buildBragLaunch(provider, 'Verify provider configuration');
      const runtime = await ensureBragRuntime();
      await ensureBragAgent(agent, runtime.pathPrefix);
      await installBragSkill(agent, runtime.pathPrefix);
      brag = 'installed';
      logger.success(`Brag skill and ${agent} are installed.`);
      logger.dimmed('Video rendering uses Hyperframes, which may download its renderer on first use.');
    } catch (error: any) {
      brag = 'failed';
      logger.warn(`Brag setup failed: ${error.message}`);
      logger.dimmed('AutoGit remains available. Run autogit setup to retry later.');
    }
  }
  const config = loadConfig();
  config.setup = { completed: true, brag, agent };
  saveConfig(config);
  logger.success('Setup complete.');
}
