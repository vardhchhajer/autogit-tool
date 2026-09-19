import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { getAIConfig, getAIModel, loadConfig, type AIProviderName } from '../config/manager.js';
import { listProviders } from '../ai/provider.js';
import { ensureBragRuntime } from './brag-runtime.js';
import { delimiter, join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import { buildAgentPromptLaunch } from './coding-agent.js';

const run = promisify(execFile);

export type BragAgent = 'codex' | 'claude-code' | 'antigravity' | 'opencode';
export type BragAgentPreference = 'automatic' | BragAgent;

const AGENTS: Record<BragAgent, { command: string; packageName?: string }> = {
  codex: { command: 'codex', packageName: '@openai/codex' },
  'claude-code': { command: 'claude', packageName: '@anthropic-ai/claude-code' },
  antigravity: { command: 'agy' },
  opencode: { command: 'opencode', packageName: 'opencode-ai' },
};

function installerEnv(): NodeJS.ProcessEnv {
  const allowed = [
    'PATH', 'Path', 'PATHEXT', 'ComSpec', 'SystemRoot', 'WINDIR', 'USERPROFILE', 'HOME',
    'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'TMPDIR', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME',
    'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'NODE_EXTRA_CA_CERTS', 'npm_config_prefix',
    'npm_config_registry',
  ];
  return Object.fromEntries(allowed.filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]));
}

function agentEnv(): NodeJS.ProcessEnv {
  const env = installerEnv();
  for (const name of ['TERM', 'COLORTERM', 'FORCE_COLOR', 'NO_COLOR', 'LANG', 'LC_ALL', 'CI']) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  return env;
}

export function selectBragAgent(provider: AIProviderName, preferred: BragAgentPreference = 'automatic'): BragAgent {
  if (preferred !== 'automatic') return preferred;
  if (provider === 'codex' || provider === 'claude-code' || provider === 'antigravity') return provider;
  if (provider === 'openai') return 'codex';
  if (provider === 'anthropic') return 'claude-code';
  return 'opencode';
}

export function agentPackageName(agent: BragAgent): string {
  return AGENTS[agent].packageName || 'Google Antigravity CLI';
}

export function bragSkillInstallCommand(agent: BragAgent, platform: NodeJS.Platform): { executable: string; args: string[] } {
  const args = [
    '--yes', 'skills', 'add', 'https://github.com/latent-spaces/brag',
    '--skill', 'brag', '--global', '--agent', agent, '--copy', '--yes',
  ];
  return platform === 'win32'
    ? { executable: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', 'npx.cmd', ...args] }
    : { executable: 'npx', args };
}

async function executablePath(command: string): Promise<string | null> {
  try {
    const finder = process.platform === 'win32' ? 'where.exe' : 'which';
    const result = await run(finder, [command], { timeout: 10_000, windowsHide: true });
    return result.stdout.split(/\r?\n/).map(line => line.trim()).find(Boolean) || null;
  } catch { return null; }
}

async function agentExecutablePath(agent: BragAgent): Promise<string | null> {
  const discovered = await executablePath(AGENTS[agent].command);
  if (discovered || agent !== 'antigravity') return discovered;
  const installed = process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA || homedir(), 'agy', 'bin', 'agy.exe')
    : join(homedir(), '.local', 'bin', 'agy');
  return existsSync(installed) ? installed : null;
}

export async function ensureBragAgent(agent: BragAgent, pathPrefix = ''): Promise<void> {
  if (await agentExecutablePath(agent)) return;
  const env = installerEnv();
  if (pathPrefix) env.PATH = `${pathPrefix}${delimiter}${env.Path || env.PATH || ''}`;
  if (process.platform === 'win32' && pathPrefix) env.Path = env.PATH;
  if (agent === 'antigravity') {
    const executable = process.platform === 'win32' ? 'powershell.exe' : '/bin/sh';
    const args = process.platform === 'win32'
      ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://antigravity.google/cli/install.ps1 | iex']
      : ['-c', 'curl -fsSL https://antigravity.google/cli/install.sh | bash'];
    await run(executable, args, { timeout: 240_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024, env });
  } else {
    const packageName = AGENTS[agent].packageName!;
    const executable = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
    const args = process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npm.cmd', 'install', '--global', packageName]
      : ['install', '--global', packageName];
    await run(executable, args, { timeout: 240_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024, env });
  }
  if (!(await agentExecutablePath(agent))) {
    throw new Error(`${agentPackageName(agent)} installed, but ${AGENTS[agent].command} is not available. Restart your terminal and run autogit setup again.`);
  }
}

export async function installBragSkill(agent: BragAgent, pathPrefix = ''): Promise<void> {
  const command = bragSkillInstallCommand(agent, process.platform);
  const env = installerEnv();
  if (pathPrefix) env.PATH = `${pathPrefix}${delimiter}${env.Path || env.PATH || ''}`;
  if (process.platform === 'win32' && pathPrefix) env.Path = env.PATH;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await run(command.executable, command.args,
        { timeout: 180_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024, env });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1_500));
    }
  }
  throw lastError;
}

export interface BragLaunch {
  agent: BragAgent;
  executable: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  input?: string;
}

export function buildBragLaunch(provider: AIProviderName, prompt: string, preferred: BragAgentPreference = 'automatic'): BragLaunch {
  const ai = getAIConfig();
  const agent = selectBragAgent(provider, preferred);
  const env = agentEnv();
  // Native agents use their own saved OAuth session, not AutoGit API credentials.
  if (agent === 'codex' || agent === 'claude-code') {
    const launch = buildAgentPromptLaunch(agent, prompt, '10m');
    return { agent, executable: launch.executable, args: launch.args, input: launch.input, env };
  }
  if (agent === 'antigravity') {
    return { agent, executable: 'agy', args: ['-p', prompt, '--print-timeout', '10m'], env };
  }
  const keyFields: Partial<Record<AIProviderName, [string, string | undefined]>> = {
    openai: ['OPENAI_API_KEY', ai.openaiKey],
    anthropic: ['ANTHROPIC_API_KEY', ai.anthropicKey],
    gemini: ['GEMINI_API_KEY', ai.geminiKey],
    openrouter: ['OPENROUTER_API_KEY', ai.openrouterKey],
    mistral: ['MISTRAL_API_KEY', ai.mistralKey],
    groq: ['GROQ_API_KEY', ai.groqKey],
    deepseek: ['DEEPSEEK_API_KEY', ai.deepseekKey],
    perplexity: ['PERPLEXITY_API_KEY', ai.perplexityKey],
    together: ['TOGETHER_API_KEY', ai.togetherKey],
    cohere: ['COHERE_API_KEY', ai.cohereKey],
    xai: ['XAI_API_KEY', ai.xaiKey],
    nvidia: ['NVIDIA_API_KEY', ai.nvidiaKey],
    cerebras: ['CEREBRAS_API_KEY', ai.cerebrasKey],
    deepinfra: ['DEEPINFRA_API_KEY', ai.deepinfraKey],
    huggingface: ['HUGGINGFACE_API_KEY', ai.huggingfaceKey],
    fireworks: ['FIREWORKS_API_KEY', ai.fireworksKey],
    custom: ['AUTOGIT_BRAG_API_KEY', ai.customKey],
    'azure-openai': ['AZURE_OPENAI_API_KEY', ai.azureOpenAIKey],
  };
  const credential = keyFields[provider];
  if (credential && !credential[1] && provider !== 'custom') throw new Error(`No ${provider} credential is configured. Run autogit config.`);
  if (credential) env[credential[0]] = credential[1] || '';

  const defaultModel = listProviders().find(item => item.name === provider)?.defaultModel;
  const model = provider === 'custom'
    ? ai.customModelName || getAIModel(provider, defaultModel)
    : getAIModel(provider, defaultModel);
  if (!model || model.startsWith('(')) throw new Error(`Configure a model for ${provider} before using Brag.`);
  if (!/^[a-zA-Z0-9_./:@-]+$/.test(model)) throw new Error('The selected model ID contains unsupported characters.');
  let providerId: string = provider === 'gemini' ? 'google' : provider;
  let config: Record<string, unknown> = { model: `${providerId}/${model}` };
  if (provider === 'ollama') {
    const baseURL = `${ai.ollamaEndpoint.replace(/\/(?:v1)?\/?$/, '')}/v1`;
    config = { ...config, provider: { ollama: { npm: '@ai-sdk/openai-compatible', name: 'Ollama', options: { baseURL }, models: { [model]: { name: model } } } } };
  } else if (provider === 'custom') {
    if (!ai.customEndpoint) throw new Error('Configure the custom API endpoint before using Brag.');
    providerId = 'autogit-custom';
    const options: Record<string, string> = { baseURL: ai.customEndpoint };
    if (ai.customKey) options.apiKey = '{env:AUTOGIT_BRAG_API_KEY}';
    config = { model: `${providerId}/${model}`, provider: { [providerId]: { npm: '@ai-sdk/openai-compatible', name: 'AutoGit custom provider', options, models: { [model]: { name: model } } } } };
  } else if (provider === 'azure-openai') {
    throw new Error('Automatic Azure OpenAI mapping to OpenCode is not yet supported. Choose another provider for Brag.');
  } else if (credential) {
    config = { ...config, provider: { [providerId]: { options: { apiKey: `{env:${credential[0]}}` } } } };
  }
  env.OPENCODE_CONFIG_CONTENT = JSON.stringify(config);
  return { agent, executable: 'opencode', args: ['run', '--model', `${providerId}/${model}`, prompt], env };
}

export async function runBragInProject(root: string): Promise<void> {
  const config = loadConfig();
  const provider = config.ai?.provider || getAIConfig().provider;
  const agent = config.setup?.agent || selectBragAgent(provider);
  if (config.setup?.brag !== 'installed' || config.setup.agent !== agent) {
    throw new Error(`Brag is not installed for ${agent}. Run autogit setup first.`);
  }
  const prompt = 'Use the installed brag skill to inspect this project and produce its launch video and share copy. Do not invent features, results, or UI that the project does not have. For a CLI, API, library, or data project, show real commands, requests, usage, or verified results instead of a fake app screenshot. Do not modify project source files.';
  const launch = buildBragLaunch(provider, prompt, agent);
  const runtime = await ensureBragRuntime();
  const inheritedPath = launch.env.Path || launch.env.PATH || '';
  launch.env.PATH = `${runtime.pathPrefix}${delimiter}${inheritedPath}`;
  if (process.platform === 'win32') launch.env.Path = launch.env.PATH;
  const path = await agentExecutablePath(launch.agent);
  if (!path) throw new Error(`${launch.agent} is not on PATH. Run autogit setup again.`);
  const isBatch = process.platform === 'win32' && /\.(cmd|bat)$/i.test(path);
  const executable = isBatch ? (process.env.ComSpec || 'cmd.exe') : path;
  const args = isBatch ? ['/d', '/s', '/c', path, ...launch.args] : launch.args;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: root,
      env: launch.env,
      stdio: launch.input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${launch.agent} exited with code ${code}`)));
    if (launch.input !== undefined) child.stdin?.end(launch.input);
  });
}
