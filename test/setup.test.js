import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRunFirstSetup } from '../dist/commands/setup.js';
import { agentPackageName, bragSkillInstallCommand, buildBragLaunch, selectBragAgent } from '../dist/services/brag-agent.js';

test('noninteractive runs never start the setup wizard', () => {
  assert.equal(shouldRunFirstSetup(false), false);
});

test('Brag agent follows the selected provider', () => {
  assert.equal(selectBragAgent('openai'), 'codex');
  assert.equal(selectBragAgent('anthropic'), 'claude-code');
  assert.equal(selectBragAgent('groq'), 'opencode');
  assert.equal(selectBragAgent('custom'), 'opencode');
  assert.equal(selectBragAgent('groq', 'antigravity'), 'antigravity');
  assert.equal(agentPackageName('opencode'), 'opencode-ai');
});

test('Brag installation targets the chosen agent globally and copies files on Windows', () => {
  const win = bragSkillInstallCommand('opencode', 'win32');
  assert.match(win.executable.toLowerCase(), /cmd\.exe$/);
  assert.deepEqual(win.args.slice(0, 5), ['/d', '/s', '/c', 'npx.cmd', '--yes']);
  assert.ok(win.args.includes('--global'));
  assert.ok(win.args.includes('--copy'));
  assert.deepEqual(win.args.slice(win.args.indexOf('--agent'), win.args.indexOf('--agent') + 2), ['--agent', 'opencode']);
  const linux = bragSkillInstallCommand('claude-code', 'linux');
  assert.equal(linux.executable, 'npx');
});

test('OpenCode receives only the chosen provider key and model', () => {
  const prior = { GROQ_API_KEY: process.env.GROQ_API_KEY, OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN, AUTOGIT_AI_MODEL: process.env.AUTOGIT_AI_MODEL };
  try {
    process.env.GROQ_API_KEY = 'test-groq-secret';
    process.env.OPENAI_API_KEY = 'other-provider-secret';
    process.env.GITHUB_TOKEN = 'git-secret';
    process.env.AUTOGIT_AI_MODEL = 'llama-3.3-70b-versatile';
    const launch = buildBragLaunch('groq', 'Make a video');
    assert.equal(launch.agent, 'opencode');
    assert.equal(launch.env.GROQ_API_KEY, 'test-groq-secret');
    assert.equal(launch.env.OPENAI_API_KEY, undefined);
    assert.equal(launch.env.GITHUB_TOKEN, undefined);
    assert.equal(launch.env.AUTOGIT_AI_MODEL, undefined);
    assert.equal(launch.args[2], 'groq/llama-3.3-70b-versatile');
    assert.doesNotMatch(launch.env.OPENCODE_CONFIG_CONTENT, /test-groq-secret/);
  } finally {
    for (const [key, value] of Object.entries(prior)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

test('Codex and Claude Code use their subscription sessions rather than API keys', () => {
  const prior = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };
  try {
    process.env.OPENAI_API_KEY = 'openai-test-key';
    process.env.ANTHROPIC_API_KEY = 'anthropic-test-key';
    const codex = buildBragLaunch('openai', 'Make a video');
    assert.equal(codex.executable, 'codex');
    assert.equal(codex.env.CODEX_API_KEY, undefined);
    assert.equal(codex.env.OPENAI_API_KEY, undefined);
    assert.equal(codex.env.ANTHROPIC_API_KEY, undefined);
    const claude = buildBragLaunch('anthropic', 'Make a video');
    assert.equal(claude.executable, 'claude');
    assert.equal(claude.env.ANTHROPIC_API_KEY, undefined);
    assert.equal(claude.env.OPENAI_API_KEY, undefined);
  } finally {
    for (const [key, value] of Object.entries(prior)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

test('Antigravity uses its own OAuth session in headless prompt mode', () => {
  const launch = buildBragLaunch('gemini', 'Make a video', 'antigravity');
  assert.equal(launch.agent, 'antigravity');
  assert.equal(launch.executable, 'agy');
  assert.deepEqual(launch.args.slice(0, 2), ['-p', 'Make a video']);
  assert.equal(launch.env.GEMINI_API_KEY, undefined);
});

test('local Ollama maps to OpenCode without an API key', () => {
  const prior = { AUTOGIT_AI_MODEL: process.env.AUTOGIT_AI_MODEL, OLLAMA_ENDPOINT: process.env.OLLAMA_ENDPOINT };
  try {
    process.env.AUTOGIT_AI_MODEL = 'qwen2.5-coder:7b';
    process.env.OLLAMA_ENDPOINT = 'http://127.0.0.1:11434/v1';
    const launch = buildBragLaunch('ollama', 'Make a video');
    assert.equal(launch.agent, 'opencode');
    assert.equal(launch.args[2], 'ollama/qwen2.5-coder:7b');
    const config = JSON.parse(launch.env.OPENCODE_CONFIG_CONTENT);
    assert.equal(config.provider.ollama.options.baseURL, 'http://127.0.0.1:11434/v1');
  } finally {
    for (const [key, value] of Object.entries(prior)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

test('Gemini uses the Google provider ID in OpenCode', () => {
  const prior = { GEMINI_API_KEY: process.env.GEMINI_API_KEY, AUTOGIT_AI_MODEL: process.env.AUTOGIT_AI_MODEL };
  try {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.AUTOGIT_AI_MODEL = 'gemini-2.5-flash';
    const launch = buildBragLaunch('gemini', 'Make a video');
    assert.equal(launch.args[2], 'google/gemini-2.5-flash');
    assert.equal(JSON.parse(launch.env.OPENCODE_CONFIG_CONTENT).provider.google.options.apiKey, '{env:GEMINI_API_KEY}');
  } finally {
    for (const [key, value] of Object.entries(prior)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

test('additional hosted providers use their selected key without exposing others', () => {
  const prior = { CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY, OPENAI_API_KEY: process.env.OPENAI_API_KEY, AUTOGIT_AI_MODEL: process.env.AUTOGIT_AI_MODEL };
  try {
    process.env.CEREBRAS_API_KEY = 'test-cerebras-key';
    process.env.OPENAI_API_KEY = 'unrelated-key';
    process.env.AUTOGIT_AI_MODEL = 'gpt-oss-120b';
    const launch = buildBragLaunch('cerebras', 'Make a video');
    assert.equal(launch.args[2], 'cerebras/gpt-oss-120b');
    assert.equal(launch.env.CEREBRAS_API_KEY, 'test-cerebras-key');
    assert.equal(launch.env.OPENAI_API_KEY, undefined);
  } finally {
    for (const [key, value] of Object.entries(prior)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

test('custom provider passes endpoint, model, and API key only when configured', () => {
  const prior = { CUSTOM_API_ENDPOINT: process.env.CUSTOM_API_ENDPOINT, CUSTOM_API_KEY: process.env.CUSTOM_API_KEY, CUSTOM_MODEL_NAME: process.env.CUSTOM_MODEL_NAME };
  try {
    process.env.CUSTOM_API_ENDPOINT = 'https://llm.example.test/v1';
    process.env.CUSTOM_API_KEY = 'custom-test-key';
    process.env.CUSTOM_MODEL_NAME = 'project-coder';
    const launch = buildBragLaunch('custom', 'Make a video');
    const config = JSON.parse(launch.env.OPENCODE_CONFIG_CONTENT);
    assert.equal(launch.args[2], 'autogit-custom/project-coder');
    assert.equal(launch.env.AUTOGIT_BRAG_API_KEY, 'custom-test-key');
    assert.equal(config.provider['autogit-custom'].options.baseURL, 'https://llm.example.test/v1');
    assert.equal(config.provider['autogit-custom'].options.apiKey, '{env:AUTOGIT_BRAG_API_KEY}');
  } finally {
    for (const [key, value] of Object.entries(prior)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});
