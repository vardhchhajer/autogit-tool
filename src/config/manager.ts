import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getConfigDir, getConfigPath } from '../utils/platform.js';

// ─── Load ~/.autogit/.env on startup ─────────────────────────────────────────
// Keys stored here OVERRIDE system environment variables so a stale
// GROQ_API_KEY / GITHUB_TOKEN set in Windows never beats the saved config.
function loadAutogitDotEnv(): void {
  const envPath = join(getConfigDir(), '.env');
  if (!existsSync(envPath)) return;
  try {
    const lines = readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (key && val) process.env[key] = val;
    }
  } catch { /* non-fatal */ }
}

loadAutogitDotEnv();

// ─── Octokit cache reset (avoid circular import) ──────────────────────────────
let _resetOctokit: (() => void) | null = null;
export function registerOctokitReset(fn: () => void): void {
  _resetOctokit = fn;
}

export type AIProviderName =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'ollama'
  | 'openrouter'
  | 'mistral'
  | 'groq'
  | 'deepseek'
  | 'perplexity'
  | 'together'
  | 'cohere'
  | 'xai'
  | 'azure-openai'
  | 'nvidia'
  | 'cerebras'
  | 'deepinfra'
  | 'huggingface'
  | 'fireworks'
  | 'codex'
  | 'claude-code'
  | 'antigravity'
  | 'custom';

export type ImageProviderName = 'none' | 'antigravity' | 'openai' | 'gemini' | 'xai' | 'together' | 'custom';

export const IMAGE_PROVIDER_DEFAULT_MODELS: Record<Exclude<ImageProviderName, 'none' | 'custom' | 'antigravity'>, string> = {
  openai: 'gpt-image-1.5',
  gemini: 'gemini-3.1-flash-image',
  xai: 'grok-imagine-image-2.0',
  together: 'black-forest-labs/FLUX.2-dev',
};

export interface AutoGitConfig {
  setup?: {
    completed?: boolean;
    brag?: 'installed' | 'skipped' | 'failed';
    agent?: 'codex' | 'claude-code' | 'antigravity' | 'opencode';
  };
  github?: {
    token?: string;
  };
  ai?: {
    provider?: AIProviderName;
    model?: string;
    models?: Partial<Record<AIProviderName, string>>;
    imageProvider?: ImageProviderName;
    imageModel?: string;
    imageKey?: string;
    imageEndpoint?: string;
    // Original 5
    openaiKey?: string;
    anthropicKey?: string;
    geminiKey?: string;
    ollamaEndpoint?: string;
    openrouterKey?: string;
    // New providers
    mistralKey?: string;
    groqKey?: string;
    deepseekKey?: string;
    perplexityKey?: string;
    togetherKey?: string;
    cohereKey?: string;
    xaiKey?: string;
    // Azure OpenAI — needs extra fields
    azureOpenAIKey?: string;
    azureOpenAIEndpoint?: string;
    azureOpenAIDeployment?: string;
    azureOpenAIApiVersion?: string;
    // NVIDIA NIM
    nvidiaKey?: string;
    // OpenAI-compatible hosted providers
    cerebrasKey?: string;
    deepinfraKey?: string;
    huggingfaceKey?: string;
    fireworksKey?: string;
    // Custom OpenAI-compatible endpoint
    customKey?: string;
    customEndpoint?: string;    // e.g. http://localhost:8080/v1
    customModelName?: string;   // model to send in the request body
  };
  defaults?: {
    visibility?: 'public' | 'private';
    branch?: string;
    license?: string;
    commitStyle?: 'conventional' | 'simple';
    autoConfirm?: boolean;
    linkedinStyle?: 'professional' | 'casual' | 'technical';
  };
  resume?: {
    enabled?: boolean;
    path?: string;        // path to .tex file
    ownerName?: string;
    ownerEmail?: string;
  };
}

let cachedConfig: AutoGitConfig | null = null;

export function loadConfig(): AutoGitConfig {
  if (cachedConfig) return cachedConfig;

  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    cachedConfig = {};
    return cachedConfig;
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    cachedConfig = JSON.parse(raw) as AutoGitConfig;
    return cachedConfig;
  } catch {
    cachedConfig = {};
    return cachedConfig;
  }
}

export function saveConfig(config: AutoGitConfig): void {
  const configDir = getConfigDir();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
  cachedConfig = config;
  // Write ~/.autogit/.env so API keys override any stale system env vars
  writeDotEnv(config);
  // Reset Octokit if the GitHub token changed
  _resetOctokit?.();
}

/** Writes all saved API keys to ~/.autogit/.env
 *  This file is loaded at startup and overrides system environment variables,
 *  preventing stale Windows env vars (GROQ_API_KEY etc.) from breaking things. */
function writeDotEnv(config: AutoGitConfig): void {
  const envPath = join(getConfigDir(), '.env');
  const ai = config.ai ?? {};
  const lines: string[] = [
    '# AutoGit API keys — auto-generated, do not edit manually',
    '# This file overrides system environment variables on every autogit run',
    '',
  ];

  const keyMap: Array<[string, string | undefined]> = [
    ['OPENAI_API_KEY',        ai.openaiKey],
    ['ANTHROPIC_API_KEY',     ai.anthropicKey],
    ['GEMINI_API_KEY',        ai.geminiKey],
    ['OLLAMA_ENDPOINT',       ai.ollamaEndpoint],
    ['OPENROUTER_API_KEY',    ai.openrouterKey],
    ['MISTRAL_API_KEY',       ai.mistralKey],
    ['GROQ_API_KEY',          ai.groqKey],
    ['DEEPSEEK_API_KEY',      ai.deepseekKey],
    ['PERPLEXITY_API_KEY',    ai.perplexityKey],
    ['TOGETHER_API_KEY',      ai.togetherKey],
    ['COHERE_API_KEY',        ai.cohereKey],
    ['XAI_API_KEY',           ai.xaiKey],
    ['AZURE_OPENAI_KEY',      ai.azureOpenAIKey],
    ['NVIDIA_API_KEY',        ai.nvidiaKey],
    ['CEREBRAS_API_KEY',      ai.cerebrasKey],
    ['DEEPINFRA_API_KEY',     ai.deepinfraKey],
    ['HUGGINGFACE_API_KEY',   ai.huggingfaceKey],
    ['FIREWORKS_API_KEY',     ai.fireworksKey],
    ['CUSTOM_API_KEY',        ai.customKey],
    ['CUSTOM_API_ENDPOINT',   ai.customEndpoint],
    ['CUSTOM_MODEL_NAME',     ai.customModelName],
    ['AUTOGIT_IMAGE_API_KEY', ai.imageKey],
    ['AUTOGIT_IMAGE_ENDPOINT', ai.imageEndpoint],
    ['GITHUB_TOKEN',          config.github?.token],
  ];

  for (const [name, val] of keyMap) {
    if (val) lines.push(`${name}=${val}`);
  }

  writeFileSync(envPath, lines.join('\n') + '\n', 'utf-8');
}

export function getConfigValue<K extends keyof AutoGitConfig>(
  section: K
): AutoGitConfig[K] | undefined {
  return loadConfig()[section];
}

export function setConfigValue<K extends keyof AutoGitConfig>(
  section: K,
  value: AutoGitConfig[K]
): void {
  const config = loadConfig();
  config[section] = value;
  saveConfig(config);
}

export function getGitHubToken(): string | undefined {
  return (
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    loadConfig().github?.token
  );
}

export function getAIConfig() {
  const config = loadConfig();
  const ai = config.ai ?? {};

  return {
    // Active provider + model
    provider: (process.env.AUTOGIT_AI_PROVIDER || ai.provider || 'openai') as AIProviderName,
    model: process.env.AUTOGIT_AI_MODEL || ai.model,
    models: ai.models || {},
    imageModel: process.env.AUTOGIT_IMAGE_MODEL || ai.imageModel,

    // Original providers
    openaiKey:      process.env.OPENAI_API_KEY       || ai.openaiKey,
    anthropicKey:   process.env.ANTHROPIC_API_KEY    || ai.anthropicKey,
    geminiKey:      process.env.GEMINI_API_KEY        || ai.geminiKey,
    ollamaEndpoint: process.env.OLLAMA_ENDPOINT       || ai.ollamaEndpoint || 'http://localhost:11434',
    openrouterKey:  process.env.OPENROUTER_API_KEY    || ai.openrouterKey,

    // New providers
    mistralKey:     process.env.MISTRAL_API_KEY       || ai.mistralKey,
    groqKey:        process.env.GROQ_API_KEY          || ai.groqKey,
    deepseekKey:    process.env.DEEPSEEK_API_KEY      || ai.deepseekKey,
    perplexityKey:  process.env.PERPLEXITY_API_KEY    || ai.perplexityKey,
    togetherKey:    process.env.TOGETHER_API_KEY      || ai.togetherKey,
    cohereKey:      process.env.COHERE_API_KEY        || ai.cohereKey,
    xaiKey:         process.env.XAI_API_KEY           || ai.xaiKey,

    // Azure OpenAI
    azureOpenAIKey:        process.env.AZURE_OPENAI_KEY        || ai.azureOpenAIKey,
    azureOpenAIEndpoint:   process.env.AZURE_OPENAI_ENDPOINT   || ai.azureOpenAIEndpoint,
    azureOpenAIDeployment: process.env.AZURE_OPENAI_DEPLOYMENT || ai.azureOpenAIDeployment,
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION|| ai.azureOpenAIApiVersion || '2024-02-01',

    // NVIDIA NIM
    nvidiaKey:      process.env.NVIDIA_API_KEY  || ai.nvidiaKey,
    cerebrasKey:    process.env.CEREBRAS_API_KEY || ai.cerebrasKey,
    deepinfraKey:   process.env.DEEPINFRA_API_KEY || ai.deepinfraKey,
    huggingfaceKey: process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || ai.huggingfaceKey,
    fireworksKey:   process.env.FIREWORKS_API_KEY || ai.fireworksKey,

    // Custom OpenAI-compatible endpoint
    customKey:       process.env.CUSTOM_API_KEY      || ai.customKey,
    customEndpoint:  process.env.CUSTOM_API_ENDPOINT || ai.customEndpoint,
    customModelName: process.env.CUSTOM_MODEL_NAME   || ai.customModelName,
  };
}

export function getImageConfig() {
  const ai = loadConfig().ai ?? {};
  const textProvider = (process.env.AUTOGIT_AI_PROVIDER || ai.provider || 'openai') as AIProviderName;
  const reusableProvider = ['antigravity', 'openai', 'gemini', 'xai', 'together'].includes(textProvider)
    ? textProvider as Exclude<ImageProviderName, 'none' | 'custom'>
    : 'none';
  const configuredProvider = ai.imageProvider || reusableProvider;
  const provider = (process.env.AUTOGIT_IMAGE_PROVIDER || configuredProvider) as ImageProviderName;
  const providerKeys: Partial<Record<ImageProviderName, string | undefined>> = {
    openai: process.env.OPENAI_API_KEY || ai.openaiKey,
    gemini: process.env.GEMINI_API_KEY || ai.geminiKey,
    xai: process.env.XAI_API_KEY || ai.xaiKey,
    together: process.env.TOGETHER_API_KEY || ai.togetherKey,
    custom: process.env.AUTOGIT_IMAGE_API_KEY || ai.imageKey,
  };
  return {
    provider,
    model: provider === 'antigravity' ? 'Nano Banana' : process.env.AUTOGIT_IMAGE_MODEL ||
      (provider === configuredProvider ? ai.imageModel : undefined) ||
      (provider !== 'none' && provider !== 'custom' ? IMAGE_PROVIDER_DEFAULT_MODELS[provider] : undefined),
    key: providerKeys[provider],
    endpoint: process.env.AUTOGIT_IMAGE_ENDPOINT || ai.imageEndpoint,
  };
}

export function getAIModel(provider: AIProviderName, fallback?: string): string | undefined {
  const config = loadConfig();
  const ai = config.ai ?? {};
  const activeProvider = (process.env.AUTOGIT_AI_PROVIDER || ai.provider || 'openai') as AIProviderName;
  if (process.env.AUTOGIT_AI_MODEL) return process.env.AUTOGIT_AI_MODEL;
  return ai.models?.[provider] || (provider === activeProvider ? ai.model : undefined) || fallback;
}
