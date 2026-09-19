import chalk from 'chalk';
import inquirer from 'inquirer';
import { IMAGE_PROVIDER_DEFAULT_MODELS, loadConfig, saveConfig, type AutoGitConfig, type AIProviderName, type ImageProviderName } from '../config/manager.js';
import { getConfigPath } from '../utils/platform.js';
import { listProviders, getProvider, isOAuthAgentProvider } from '../ai/provider.js';
import { logger, spinner } from '../utils/logger.js';

// Keys that hold API secrets — masked in display
const SECRET_PATHS = [
  'github.token',
  'ai.openaiKey',
  'ai.anthropicKey',
  'ai.geminiKey',
  'ai.openrouterKey',
  'ai.mistralKey',
  'ai.groqKey',
  'ai.deepseekKey',
  'ai.perplexityKey',
  'ai.togetherKey',
  'ai.cohereKey',
  'ai.xaiKey',
  'ai.azureOpenAIKey',
  'ai.cerebrasKey',
  'ai.deepinfraKey',
  'ai.huggingfaceKey',
  'ai.fireworksKey',
  'ai.imageKey',
];

// Non-secret fields (shown as plain text, never masked)
const NON_SECRET_KEYS = new Set<keyof NonNullable<AutoGitConfig['ai']>>([
  'ollamaEndpoint',
  'azureOpenAIEndpoint',
  'azureOpenAIDeployment',
  'azureOpenAIApiVersion',
  'customEndpoint',
  'customModelName',
  'imageProvider',
  'imageModel',
  'imageEndpoint',
  'provider',
  'model',
  'models',
]);

const PROVIDER_FIELDS: Record<
  AIProviderName,
  Array<{ label: string; key: keyof NonNullable<AutoGitConfig['ai']>; hint?: string }>
> = {
  openai:       [{ label: 'OpenAI API Key',        key: 'openaiKey',      hint: 'OPENAI_API_KEY' }],
  anthropic:    [{ label: 'Anthropic API Key',      key: 'anthropicKey',   hint: 'ANTHROPIC_API_KEY' }],
  gemini:       [{ label: 'Google Gemini API Key',  key: 'geminiKey',      hint: 'GEMINI_API_KEY' }],
  ollama:       [{ label: 'Ollama endpoint',        key: 'ollamaEndpoint', hint: 'OLLAMA_ENDPOINT' }],
  openrouter:   [{ label: 'OpenRouter API Key',     key: 'openrouterKey',  hint: 'OPENROUTER_API_KEY' }],
  mistral:      [{ label: 'Mistral API Key',        key: 'mistralKey',     hint: 'MISTRAL_API_KEY' }],
  groq:         [{ label: 'Groq API Key',           key: 'groqKey',        hint: 'GROQ_API_KEY' }],
  deepseek:     [{ label: 'DeepSeek API Key',       key: 'deepseekKey',    hint: 'DEEPSEEK_API_KEY' }],
  perplexity:   [{ label: 'Perplexity API Key',     key: 'perplexityKey',  hint: 'PERPLEXITY_API_KEY' }],
  together:     [{ label: 'Together AI API Key',    key: 'togetherKey',    hint: 'TOGETHER_API_KEY' }],
  cohere:       [{ label: 'Cohere API Key',         key: 'cohereKey',      hint: 'COHERE_API_KEY' }],
  xai:          [{ label: 'xAI API Key',            key: 'xaiKey',         hint: 'XAI_API_KEY' }],
  'azure-openai': [
    { label: 'Azure OpenAI API Key',                            key: 'azureOpenAIKey',        hint: 'AZURE_OPENAI_KEY' },
    { label: 'Azure endpoint (https://RESOURCE.openai.azure.com)', key: 'azureOpenAIEndpoint', hint: 'AZURE_OPENAI_ENDPOINT' },
    { label: 'Deployment name',                                 key: 'azureOpenAIDeployment', hint: 'AZURE_OPENAI_DEPLOYMENT' },
    { label: 'API version',                                     key: 'azureOpenAIApiVersion', hint: 'AZURE_OPENAI_API_VERSION' },
  ],
  nvidia: [
    { label: 'NVIDIA NIM API Key (from build.nvidia.com)', key: 'nvidiaKey', hint: 'NVIDIA_API_KEY' },
  ],
  cerebras:    [{ label: 'Cerebras API Key', key: 'cerebrasKey', hint: 'CEREBRAS_API_KEY' }],
  deepinfra:   [{ label: 'DeepInfra API Key', key: 'deepinfraKey', hint: 'DEEPINFRA_API_KEY' }],
  huggingface: [{ label: 'Hugging Face token', key: 'huggingfaceKey', hint: 'HUGGINGFACE_API_KEY or HF_TOKEN' }],
  fireworks:   [{ label: 'Fireworks API Key', key: 'fireworksKey', hint: 'FIREWORKS_API_KEY' }],
  codex: [],
  'claude-code': [],
  antigravity: [],
  custom: [
    { label: 'API endpoint  (e.g. http://localhost:1234/v1 or https://myapi.com/v1)', key: 'customEndpoint', hint: 'CUSTOM_API_ENDPOINT' },
    { label: 'API key  (leave blank for local servers with no auth)',                  key: 'customKey',      hint: 'CUSTOM_API_KEY' },
    { label: 'Model name  (sent in request body)',                                     key: 'customModelName',hint: 'CUSTOM_MODEL_NAME' },
  ],
};

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function cmdConfig(opts: {
  set?: string;
  get?: string;
  list?: boolean;
  test?: boolean;
  debug?: boolean;
}): Promise<void> {
  logger.header('AutoGit Configuration');
  logger.dimmed(`Config file: ${getConfigPath()}`);
  logger.blank();

  if (opts.debug) { debugConfig(); return; }
  if (opts.list) { displayConfig(); return; }
  if (opts.test) { await testCurrentProvider(); return; }

  if (opts.get) {
    const value = getNestedValue(loadConfig(), opts.get);
    value !== undefined
      ? console.log(`${opts.get} = ${JSON.stringify(value)}`)
      : logger.dimmed(`${opts.get} is not set`);
    return;
  }

  if (opts.set) {
    const eqIdx = opts.set.indexOf('=');
    if (eqIdx === -1) {
      logger.error('Use format: --set key=value  (e.g. --set defaults.visibility=public)');
      return;
    }
    const key = opts.set.slice(0, eqIdx).trim();
    const value = opts.set.slice(eqIdx + 1).trim();
    const config = loadConfig();
    setNestedValue(config, key, value);
    saveConfig(config);
    logger.success(`Set ${key} = ${value}`);
    return;
  }

  await interactiveConfig();
}

// ─── Interactive wizard ───────────────────────────────────────────────────────

async function interactiveConfig(): Promise<void> {
  const { section } = await inquirer.prompt([{
    type: 'list',
    name: 'section',
    message: 'What would you like to configure?',
    choices: [
      { name: 'AI Provider & Keys', value: 'ai' },
      { name: 'Image Provider',     value: 'image' },
      { name: 'GitHub Token',       value: 'github' },
      { name: 'Defaults',           value: 'defaults' },
      { name: 'View current config',value: 'view' },
    ],
  }]);

  if (section === 'view')     { displayConfig(); return; }
  if (section === 'ai')       { await configureAI(); return; }
  if (section === 'image')    { await configureImageProvider(); return; }
  if (section === 'github')   { await configureGitHub(); return; }
  if (section === 'defaults') { await configureDefaults(); return; }
}

export async function configureAI(): Promise<void> {
  const config = loadConfig();
  config.ai = config.ai ?? {};
  const previousProvider = config.ai.provider;
  if (config.ai.model && previousProvider) {
    config.ai.models = { ...config.ai.models, [previousProvider]: config.ai.model };
    delete config.ai.model;
  }

  const providers = listProviders();
  const choices = providers.map(p => {
    const badge = p.configured ? chalk.green('● configured') : chalk.gray('○ not set');
    return {
      name: `${p.name.padEnd(14)} ${badge}  ${chalk.dim('default: ' + p.defaultModel)}`,
      value: p.name as AIProviderName,
    };
  });

  const { provider } = await inquirer.prompt<{ provider: AIProviderName }>([{
    type: 'list',
    name: 'provider',
    message: 'Select AI provider:',
    choices,
    default: config.ai.provider,
  }]);

  config.ai.provider = provider;

  logger.blank();
  logger.dimmed('Paste your key and press Enter. The value is stored in ~/.autogit/config.json');
  logger.blank();

  // ── Collect + sanitise credentials ──────────────────────────────────────
  const fields = PROVIDER_FIELDS[provider];
  for (const field of fields) {
    const isSecret = !NON_SECRET_KEYS.has(field.key);
    const currentRaw = (config.ai as any)[field.key] as string | undefined;

    // Build a hint line showing the last 4 chars of an existing secret
    if (currentRaw && isSecret) {
      logger.dimmed(`  current: ***${currentRaw.slice(-4)}  (press Enter to keep)`);
    }

    const defaultDisplay = isSecret
      ? undefined
      : (currentRaw ?? (field.key === 'ollamaEndpoint' ? 'http://localhost:11434' : ''));

    const { raw } = await inquirer.prompt<{ raw: string }>([{
      type: 'input',
      name: 'raw',
      message: `${field.label}${field.hint ? chalk.dim(`  [env: ${field.hint}]`) : ''}:`,
      default: defaultDisplay,
    }]);

    // ❶ Sanitize: trim + remove ALL invisible/non-printable characters
    const value = sanitizeKey(raw);

    // ❷ Empty + existing = keep existing
    if (!value && currentRaw) continue;

    // ❸ Save only if non-empty
    if (value) {
      (config.ai as any)[field.key] = value;
      if (isSecret) {
        logger.dimmed(`  saved: ***${value.slice(-4)}`);
      }
    }
  }

  if (!isOAuthAgentProvider(provider)) {
    logger.blank();
    const { customModel } = await inquirer.prompt<{ customModel: string }>([{
      type: 'input',
      name: 'customModel',
      message: `Override model ${chalk.dim('(leave blank to use provider default)')}:`,
      default: config.ai.models?.[provider] ?? '',
    }]);

    const trimmedModel = customModel.trim();
    config.ai.models = config.ai.models ?? {};
    if (trimmedModel) config.ai.models[provider] = trimmedModel;
    else delete config.ai.models[provider];
  }

  saveConfig(config);
  logger.success(`Provider set to "${provider}" — config saved`);
  logger.blank();

  if (isOAuthAgentProvider(provider)) {
    logger.dimmed('This provider uses its own browser sign-in and subscription quota. AutoGit setup installs it and opens its sign-in on first use.');
    return;
  }

  // ── Verify the key immediately ───────────────────────────────────────────
  await testCurrentProvider();
}

export async function configureImageProvider(): Promise<void> {
  const config = loadConfig();
  config.ai = config.ai ?? {};
  const supportedTextProvider = ['antigravity', 'openai', 'gemini', 'xai', 'together'].includes(config.ai.provider || '')
    ? config.ai.provider as ImageProviderName
    : 'none';
  const previousProvider = config.ai.imageProvider || supportedTextProvider;
  const keyFields: Partial<Record<ImageProviderName, keyof NonNullable<AutoGitConfig['ai']>>> = {
    openai: 'openaiKey', gemini: 'geminiKey', xai: 'xaiKey', together: 'togetherKey', custom: 'imageKey',
  };
  const labels: Record<ImageProviderName, string> = {
    none: 'None (use generated evidence cards only)',
    antigravity: 'Antigravity (Google sign-in, free quota)',
    openai: 'OpenAI', gemini: 'Google Gemini', xai: 'xAI', together: 'Together AI',
    custom: 'Custom OpenAI-compatible image API',
  };
  const choices = (Object.keys(labels) as ImageProviderName[]).map(provider => {
    if (provider === 'none') return { name: labels[provider], value: provider };
    const key = keyFields[provider];
    const configured = provider === 'antigravity' || (provider === 'custom'
      ? !!config.ai?.imageEndpoint
      : !!(key && config.ai?.[key]));
    return { name: `${labels[provider]} ${configured ? chalk.green('● configured') : chalk.gray('○ not set')}`, value: provider };
  });
  const { provider } = await inquirer.prompt<{ provider: ImageProviderName }>([{
    type: 'list', name: 'provider', message: 'Select image provider:', choices,
    default: config.ai.imageProvider || supportedTextProvider,
  }]);
  config.ai.imageProvider = provider;
  if (provider === 'none') {
    saveConfig(config);
    logger.success('Image generation disabled; evidence cards remain available.');
    return;
  }
  if (provider === 'antigravity') {
    delete config.ai.imageModel;
    saveConfig(config);
    logger.success('Image provider set to "antigravity". AutoGit setup will install it; sign in with Google on first use.');
    return;
  }

  const keyField = keyFields[provider]!;
  const currentKey = config.ai[keyField] as string | undefined;
  if (currentKey) logger.dimmed(`  current key: ***${currentKey.slice(-4)}  (press Enter to keep)`);
  const { rawKey } = await inquirer.prompt<{ rawKey: string }>([{
    type: 'input', name: 'rawKey', message: `${labels[provider]} image API key:`,
  }]);
  const key = sanitizeKey(rawKey);
  if (key) (config.ai as any)[keyField] = key;

  if (provider === 'custom') {
    const { endpoint } = await inquirer.prompt<{ endpoint: string }>([{
      type: 'input', name: 'endpoint', message: 'Image API base endpoint:',
      default: config.ai.imageEndpoint || '',
      validate: value => !!value.trim() || 'Endpoint is required',
    }]);
    config.ai.imageEndpoint = endpoint.trim();
  }

  const defaultModel = provider === 'custom' ? '' : IMAGE_PROVIDER_DEFAULT_MODELS[provider];
  const { model } = await inquirer.prompt<{ model: string }>([{
    type: 'input', name: 'model', message: 'Image model:',
    default: provider === previousProvider ? config.ai.imageModel || defaultModel : defaultModel,
    validate: value => !!value.trim() || 'Model is required',
  }]);
  config.ai.imageModel = model.trim();
  saveConfig(config);
  logger.success(`Image provider set to "${provider}"`);
}

async function configureGitHub(): Promise<void> {
  const config = loadConfig();
  logger.blank();
  logger.dimmed('Create a token at: https://github.com/settings/tokens');
  logger.dimmed('Required scopes: repo, read:user');
  logger.blank();

  const { raw } = await inquirer.prompt<{ raw: string }>([{
    type: 'input',
    name: 'raw',
    message: 'GitHub Personal Access Token:',
  }]);

  // Always sanitize
  const token = sanitizeKey(raw);
  if (!token) { logger.dimmed('No changes made.'); return; }

  config.github = config.github ?? {};
  config.github.token = token;
  saveConfig(config);

  logger.dimmed(`  saved: ***${token.slice(-4)}`);
  logger.blank();

  // Verify immediately
  const spin = spinner('Verifying with GitHub...').start();
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const user = (await res.json()) as any;
      spin.succeed(`Authenticated as ${chalk.bold(user.login)}`);
    } else {
      const body = (await res.json()) as any;
      spin.fail(`GitHub rejected the token: ${body.message ?? res.status}`);
      logger.dimmed('Double-check the token has the correct scopes (repo, read:user).');
    }
  } catch (e: any) {
    spin.fail(`Network error: ${e.message}`);
  }
}

export async function configureDefaults(): Promise<void> {
  const config = loadConfig();
  config.defaults = config.defaults ?? {};

  const answers = await inquirer.prompt([
    {
      type: 'list',   name: 'visibility',
      message: 'Default repository visibility:',
      choices: ['public', 'private'],
      default: config.defaults.visibility ?? 'public',
    },
    {
      type: 'input',  name: 'branch',
      message: 'Default branch name:',
      default: config.defaults.branch ?? 'main',
    },
    {
      type: 'list',   name: 'commitStyle',
      message: 'Commit message style:',
      choices: [
        { name: 'Conventional Commits  (feat: / fix: / docs: …)', value: 'conventional' },
        { name: 'Simple one-liner',                                value: 'simple' },
      ],
      default: config.defaults.commitStyle ?? 'conventional',
    },
    {
      type: 'list',   name: 'linkedinStyle',
      message: 'LinkedIn post tone:',
      choices: ['professional', 'casual', 'technical'],
      default: config.defaults.linkedinStyle ?? 'professional',
    },
    {
      type: 'list',   name: 'license',
      message: 'Default license:',
      choices: ['MIT', 'Apache-2.0', 'GPL-3.0', 'BSD-3-Clause', 'ISC', 'None'],
      default: config.defaults.license ?? 'MIT',
    },
    {
      type: 'confirm', name: 'autoConfirm',
      message: 'Auto-confirm all prompts (same as --yes flag)?',
      default: config.defaults.autoConfirm ?? false,
    },
  ]);

  config.defaults = { ...config.defaults, ...answers };
  saveConfig(config);
  logger.success('Defaults saved');
}

// ─── Key verification ─────────────────────────────────────────────────────────

async function testCurrentProvider(): Promise<void> {
  const config = loadConfig();
  const ai = config.ai ?? {};
  const providerName = ai.provider || 'openai';

  logger.info(`Testing provider: ${chalk.bold(providerName)}, model: ${chalk.bold(ai.models?.[providerName] || ai.model || '(default)')}`);
  logger.blank();

  const spin = spinner('Sending test request...').start();
  try {
    const provider = getProvider();
    await provider.generate(
      [{ role: 'user', content: 'Reply with the single word: ok' }],
      { maxTokens: 10, temperature: 0 }
    );
    spin.succeed(`Key is valid — ${chalk.bold(providerName)} is working ✔`);
  } catch (e: any) {
    spin.fail(`Failed: ${e.message}`);
    logger.blank();
    logger.warn('Diagnostic steps:');
    logger.dimmed(`  1. Run "autogit config --debug" to inspect the stored key`);
    logger.dimmed(`  2. Confirm the active provider matches your key`);
    logger.dimmed(`     e.g. a Groq key won't work if provider is set to "openai"`);
    logger.dimmed(`  3. Re-enter the key: autogit config  →  AI Provider & Keys`);
    logger.dimmed(`  4. Or set via env var to bypass the config file:`);
    logger.blank();
    logger.dimmed(`     Windows CMD:`);
    logger.dimmed(`       set AUTOGIT_AI_PROVIDER=${providerName}`);
    logger.dimmed(`       set <YOUR_PROVIDER_KEY>=sk-...`);
    logger.blank();
    logger.dimmed(`     PowerShell:`);
    logger.dimmed(`       $env:AUTOGIT_AI_PROVIDER="${providerName}"`);
    logger.dimmed(`       $env:GROQ_API_KEY="gsk_..."`);
  }
}

// ─── Display ──────────────────────────────────────────────────────────────────

function displayConfig(): void {
  const config = loadConfig();
  const masked = JSON.parse(JSON.stringify(config)) as AutoGitConfig;

  for (const path of SECRET_PATHS) {
    const keys = path.split('.');
    const parent = keys.slice(0, -1).reduce<any>((o, k) => o?.[k], masked);
    const last = keys.at(-1)!;
    if (parent && typeof parent[last] === 'string' && parent[last].length > 4) {
      parent[last] = '***' + (parent[last] as string).slice(-4);
    }
  }

  logger.blank();
  logger.header('Current configuration');
  console.log(JSON.stringify(masked, null, 2));
  logger.blank();

  const providers = listProviders();
  logger.header('AI Provider status');
  for (const p of providers) {
    const active = (masked.ai?.provider === p.name) ? chalk.cyan(' ← active') : '';
    const icon = p.configured ? chalk.green('✔') : chalk.gray('○');
    console.log(`  ${icon}  ${p.name.padEnd(14)} ${chalk.dim(p.defaultModel)}${active}`);
  }
  logger.blank();
}

function debugConfig(): void {
  const config = loadConfig();
  const ai = config.ai ?? {};

  logger.header('Debug info');
  logger.blank();

  logger.info(`Active provider: ${chalk.bold(ai.provider || '(not set, defaults to openai)')}`);
  const providerModel = ai.provider ? ai.models?.[ai.provider] : undefined;
  logger.info(`Model override:  ${providerModel || ai.model || '(using provider default)'}`);
  logger.blank();

  // Show ENV VARS that are set — these override the config file
  const envVars: Array<[string, string | undefined]> = [
    ['AUTOGIT_AI_PROVIDER', process.env['AUTOGIT_AI_PROVIDER']],
    ['AUTOGIT_AI_MODEL',    process.env['AUTOGIT_AI_MODEL']],
    ['OPENAI_API_KEY',      process.env['OPENAI_API_KEY']],
    ['ANTHROPIC_API_KEY',   process.env['ANTHROPIC_API_KEY']],
    ['GEMINI_API_KEY',      process.env['GEMINI_API_KEY']],
    ['OPENROUTER_API_KEY',  process.env['OPENROUTER_API_KEY']],
    ['MISTRAL_API_KEY',     process.env['MISTRAL_API_KEY']],
    ['GROQ_API_KEY',        process.env['GROQ_API_KEY']],
    ['DEEPSEEK_API_KEY',    process.env['DEEPSEEK_API_KEY']],
    ['PERPLEXITY_API_KEY',  process.env['PERPLEXITY_API_KEY']],
    ['TOGETHER_API_KEY',    process.env['TOGETHER_API_KEY']],
    ['COHERE_API_KEY',      process.env['COHERE_API_KEY']],
    ['XAI_API_KEY',         process.env['XAI_API_KEY']],
    ['NVIDIA_API_KEY',    process.env['NVIDIA_API_KEY']],
    ['CUSTOM_API_KEY',    process.env['CUSTOM_API_KEY']],
    ['CUSTOM_API_ENDPOINT', process.env['CUSTOM_API_ENDPOINT']],
  ];

  const setEnvVars = envVars.filter(([, v]) => v);
  if (setEnvVars.length > 0) {
    logger.header('Environment variables (these OVERRIDE the config file)');
    for (const [name, val] of setEnvVars) {
      const preview = val!.length > 8 ? `${val!.slice(0, 4)}***${val!.slice(-4)}` : '***';
      const hasInvisible = /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/.test(val!);
      const warn = hasInvisible ? chalk.red(' ⚠ invisible chars!') : '';
      console.log(`  ${chalk.yellow('!')} ${name.padEnd(22)} ${chalk.cyan(`[${val!.length} chars]`)} ${chalk.dim(preview)}${warn}`);
    }
    logger.blank();
    logger.warn('Env vars take priority over ~/.autogit/config.json');
    logger.dimmed('To use the config file value instead, unset the env var:');
    logger.dimmed('  PowerShell: Remove-Item Env:GROQ_API_KEY');
    logger.dimmed('  CMD:        set GROQ_API_KEY=');
  } else {
    logger.dimmed('No AI-related environment variables are set — config file is used.');
  }

  logger.blank();

  // Config file keys
  const keyMap: Array<[string, string | undefined]> = [
    ['openaiKey',      ai.openaiKey],
    ['anthropicKey',   ai.anthropicKey],
    ['geminiKey',      ai.geminiKey],
    ['openrouterKey',  ai.openrouterKey],
    ['mistralKey',     ai.mistralKey],
    ['groqKey',        ai.groqKey],
    ['deepseekKey',    ai.deepseekKey],
    ['perplexityKey',  ai.perplexityKey],
    ['togetherKey',    ai.togetherKey],
    ['cohereKey',      ai.cohereKey],
    ['xaiKey',         ai.xaiKey],
    ['azureOpenAIKey', ai.azureOpenAIKey],
    ['nvidiaKey',      ai.nvidiaKey],
    ['cerebrasKey',    ai.cerebrasKey],
    ['deepinfraKey',   ai.deepinfraKey],
    ['huggingfaceKey', ai.huggingfaceKey],
    ['fireworksKey',   ai.fireworksKey],
    ['customKey',      ai.customKey],
  ];

  logger.header('Config file keys (~/.autogit/config.json)');
  for (const [name, key] of keyMap) {
    if (!key) {
      console.log(chalk.gray(`  ${name.padEnd(18)} (not set)`));
      continue;
    }
    const len = key.length;
    const preview = len > 8 ? `${key.slice(0, 4)}***${key.slice(-4)}` : `${key.slice(0, 2)}***`;
    const hasInvisible = /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/.test(key);
    const warning = hasInvisible ? chalk.red(' ⚠ contains invisible chars!') : '';
    console.log(`  ${chalk.green('✔')} ${name.padEnd(18)} ${chalk.cyan(`[${len} chars]`)} ${chalk.dim(preview)}${warning}`);
  }

  logger.blank();

  // Show what value will ACTUALLY be used at runtime
  logger.header('Effective values (what AutoGit actually uses)');
  const groqEnv   = process.env.GROQ_API_KEY;
  const activeProvider = process.env.AUTOGIT_AI_PROVIDER || ai.provider || 'openai';
  const activeKey: Record<string, string | undefined> = {
    groq:       groqEnv        || ai.groqKey,
    openai:     process.env.OPENAI_API_KEY      || ai.openaiKey,
    anthropic:  process.env.ANTHROPIC_API_KEY   || ai.anthropicKey,
    gemini:     process.env.GEMINI_API_KEY       || ai.geminiKey,
    openrouter: process.env.OPENROUTER_API_KEY   || ai.openrouterKey,
    mistral:    process.env.MISTRAL_API_KEY      || ai.mistralKey,
    deepseek:   process.env.DEEPSEEK_API_KEY     || ai.deepseekKey,
    perplexity: process.env.PERPLEXITY_API_KEY   || ai.perplexityKey,
    together:   process.env.TOGETHER_API_KEY     || ai.togetherKey,
    cohere:     process.env.COHERE_API_KEY       || ai.cohereKey,
    xai:        process.env.XAI_API_KEY          || ai.xaiKey,
    nvidia:     process.env.NVIDIA_API_KEY       || ai.nvidiaKey,
    cerebras:   process.env.CEREBRAS_API_KEY     || ai.cerebrasKey,
    deepinfra:  process.env.DEEPINFRA_API_KEY    || ai.deepinfraKey,
    huggingface: process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || ai.huggingfaceKey,
    fireworks:  process.env.FIREWORKS_API_KEY    || ai.fireworksKey,
    custom:     process.env.CUSTOM_API_KEY       || ai.customKey,
  };
  const usedKey = activeKey[activeProvider];
  const usedPreview = usedKey
    ? (usedKey.length > 8 ? `${usedKey.slice(0, 4)}***${usedKey.slice(-4)}` : '***')
    : '(none)';

  console.log(`  Provider: ${chalk.bold(activeProvider)}`);
  console.log(`  Key:      ${chalk.cyan(`[${usedKey?.length ?? 0} chars]`)} ${chalk.dim(usedPreview)}`);
  logger.blank();
  logger.dimmed('Run "autogit config --test" to verify this key with a live API call.');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Remove ALL non-printable and zero-width characters, then trim.
 *  Catches: tabs, newlines, carriage returns, zero-width spaces, BOM, etc. */
function sanitizeKey(raw: string): string {
  return raw
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '') // strip invisible
    .trim();                                                           // strip whitespace edges
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

function setNestedValue(obj: any, path: string, value: string): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  const target = keys.reduce((o, k) => { if (!o[k]) o[k] = {}; return o[k]; }, obj);
  target[last] = value;
}
