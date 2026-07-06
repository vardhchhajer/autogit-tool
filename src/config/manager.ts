import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { getConfigDir, getConfigPath } from '../utils/platform.js';

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
  | 'azure-openai';

export interface AutoGitConfig {
  github?: {
    token?: string;
  };
  ai?: {
    provider?: AIProviderName;
    model?: string;
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
    azureOpenAIEndpoint?: string;   // e.g. https://MY-RESOURCE.openai.azure.com
    azureOpenAIDeployment?: string; // deployment/model name in Azure
    azureOpenAIApiVersion?: string; // e.g. 2024-02-01
  };
  defaults?: {
    visibility?: 'public' | 'private';
    branch?: string;
    license?: string;
    commitStyle?: 'conventional' | 'simple';
    autoConfirm?: boolean;
    linkedinStyle?: 'professional' | 'casual' | 'technical';
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
  };
}
