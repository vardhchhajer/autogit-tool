import inquirer from 'inquirer';
import { getAIConfig, loadConfig, saveConfig } from '../config/manager.js';
import { configureAI, configureDefaults, configureImageProvider } from './config.js';
import { logger, spinner } from '../utils/logger.js';
import { buildBragLaunch, ensureBragAgent, installBragSkill, selectBragAgent, type BragAgentPreference } from '../services/brag-agent.js';
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

  logger.blank();
  logger.header('AI Provider');
  await configureAI();

  logger.blank();
  logger.header('Image Provider');
  await configureImageProvider();

  const configuredAI = loadConfig().ai;
  const provider = configuredAI?.provider || getAIConfig().provider;
  const imageProvider = configuredAI?.imageProvider;
  const { includeBrag } = await inquirer.prompt<{ includeBrag: boolean }>([{
    type: 'confirm', name: 'includeBrag',
    message: 'Install Brag for this provider?',
    default: true,
  }]);

  let preferredAgent: BragAgentPreference = 'automatic';
  if (includeBrag && !['codex', 'claude-code', 'antigravity'].includes(provider)) {
    const answer = await inquirer.prompt<{ agent: BragAgentPreference }>([{
      type: 'list', name: 'agent', message: 'Coding agent for Brag:',
      choices: [
        { name: 'Automatic (Codex for OpenAI, Claude Code for Anthropic, OpenCode otherwise)', value: 'automatic' },
        { name: 'Codex (ChatGPT subscription sign-in)', value: 'codex' },
        { name: 'Claude Code (Claude subscription sign-in)', value: 'claude-code' },
        { name: 'Antigravity (Google account sign-in)', value: 'antigravity' },
        { name: 'OpenCode (selected API provider)', value: 'opencode' },
      ], default: 'automatic',
    }]);
    preferredAgent = answer.agent;
  }

  let brag: 'installed' | 'skipped' | 'failed' = 'skipped';
  let agent: ReturnType<typeof selectBragAgent> | undefined;
  if (imageProvider === 'antigravity' && provider !== 'antigravity') {
    const imageSpin = spinner('Setting up Antigravity image generation...').start();
    try {
      await ensureBragAgent('antigravity');
      imageSpin.succeed('Antigravity image generation is ready');
      logger.dimmed('Sign in with Google on first use.');
    } catch (error: any) {
      imageSpin.fail('Antigravity image setup failed');
      logger.warn(`Antigravity image setup failed: ${error.message}`);
      logger.dimmed('Run autogit setup to retry later.');
    }
  }
  if (includeBrag || ['codex', 'claude-code', 'antigravity'].includes(provider)) {
    agent = selectBragAgent(provider, preferredAgent);
    logger.info(`Setting up ${agent}${includeBrag ? ' and Brag' : ''}...`);
    try {
      if (includeBrag) buildBragLaunch(provider, 'Verify provider configuration', agent);
      const runtimeSpin = spinner('Preparing Brag runtime...').start();
      let runtime;
      try {
        runtime = await ensureBragRuntime();
        runtimeSpin.succeed('Brag runtime ready');
      } catch (error) {
        runtimeSpin.fail('Brag runtime setup failed');
        throw error;
      }
      const agentSpin = spinner(`Checking ${agent}...`).start();
      try {
        await ensureBragAgent(agent, runtime.pathPrefix);
        agentSpin.succeed(`${agent} ready`);
      } catch (error) {
        agentSpin.fail(`${agent} setup failed`);
        throw error;
      }
      if (includeBrag) {
        const skillSpin = spinner('Installing Brag skill...').start();
        try {
          await installBragSkill(agent, runtime.pathPrefix);
          skillSpin.succeed('Brag skill installed');
        } catch (error) {
          skillSpin.fail('Brag skill installation failed');
          throw error;
        }
        brag = 'installed';
        logger.success(`Brag skill and ${agent} are installed.`);
      } else logger.success(`${agent} is installed.`);
      if (agent !== 'opencode') logger.dimmed(`On first use, sign in to ${agent} in the browser to use its subscription quota.`);
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
