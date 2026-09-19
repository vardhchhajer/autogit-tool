import { getAIConfig, getAIModel } from '../config/manager.js';
import { runAgentPrompt } from '../services/coding-agent.js';


export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  content: string;
  provider: string;
  model: string;
}

export interface AIProvider {
  name: string;
  generate(messages: AIMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<AIResponse>;
  isConfigured(): boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 60_000; // 60s — accommodates slow providers like NVIDIA NIM

/** fetch() with an AbortController timeout */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** POST to an OpenAI-compatible endpoint with timeout + one retry on 5xx */
async function openAICompatPost(
  url: string,
  apiKey: string,
  model: string,
  messages: AIMessage[],
  options?: { temperature?: number; maxTokens?: number },
  extraHeaders: Record<string, string> = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<string> {
  const body = JSON.stringify({
    model,
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 4096,
  });

  const init: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body,
  };

  let response = await fetchWithTimeout(url, init, timeoutMs);

  // Retry once on 504/503 (common with NVIDIA NIM cold starts)
  if (response.status === 504 || response.status === 503) {
    await new Promise(r => setTimeout(r, 3000)); // wait 3s before retry
    response = await fetchWithTimeout(url, init, timeoutMs);
  }

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`HTTP ${response.status}: ${err}`);
  }

  const data = (await response.json()) as any;
  return data.choices[0].message.content as string;
}

// ─── Original providers ──────────────────────────────────────────────────────

class OpenAIProvider implements AIProvider {
  name = 'openai';
  isConfigured() { return !!getAIConfig().openaiKey; }

  async generate(messages: AIMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<AIResponse> {
    const cfg = getAIConfig();
    const model = getAIModel('openai', 'gpt-4o-mini')!;
    const content = await openAICompatPost(
      'https://api.openai.com/v1/chat/completions',
      cfg.openaiKey!,
      model,
      messages,
      options
    );
    return { content, provider: 'openai', model };
  }
}

class AnthropicProvider implements AIProvider {
  name = 'anthropic';
  isConfigured() { return !!getAIConfig().anthropicKey; }

  async generate(messages: AIMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<AIResponse> {
    const cfg = getAIConfig();
    const model = getAIModel('anthropic', 'claude-sonnet-4-20250514')!;

    const systemMsg = messages.find(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.anthropicKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: options?.maxTokens ?? 4096,
        system: systemMsg?.content,
        messages: userMessages.map(m => ({ role: m.role, content: m.content })),
        temperature: options?.temperature ?? 0.7,
      }),
    });

    if (!response.ok) throw new Error(`Anthropic ${response.status}: ${await response.text()}`);
    const data = (await response.json()) as any;
    return { content: data.content[0].text, provider: 'anthropic', model };
  }
}

class GeminiProvider implements AIProvider {
  name = 'gemini';
  isConfigured() { return !!getAIConfig().geminiKey; }

  async generate(messages: AIMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<AIResponse> {
    const cfg = getAIConfig();
    const model = getAIModel('gemini', 'gemini-3.8-flash')!;

    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

    const systemInstruction = messages.find(m => m.role === 'system');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction.content }] } : undefined,
          generationConfig: {
            temperature: options?.temperature ?? 0.7,
            maxOutputTokens: options?.maxTokens ?? 4096,
          },
        }),
      }
    );

    if (!response.ok) throw new Error(`Gemini ${response.status}: ${await response.text()}`);
    const data = (await response.json()) as any;
    const content = data.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('').trim();
    if (!content) {
      const reason = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || 'empty response';
      throw new Error(`Gemini returned no text (${reason})`);
    }
    return { content, provider: 'gemini', model };
  }
}

class OllamaProvider implements AIProvider {
  name = 'ollama';
  isConfigured() { return true; } // local — always available

  async generate(messages: AIMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<AIResponse> {
    const cfg = getAIConfig();
    const model = getAIModel('ollama', 'llama3.1')!;

    const response = await fetch(`${cfg.ollamaEndpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: { temperature: options?.temperature ?? 0.7, num_predict: options?.maxTokens ?? 4096 },
      }),
    });

    if (!response.ok) throw new Error(`Ollama ${response.status}: ${await response.text()}`);
    const data = (await response.json()) as any;
    return { content: data.message.content, provider: 'ollama', model };
  }
}

class OpenRouterProvider implements AIProvider {
  name = 'openrouter';
  isConfigured() { return !!getAIConfig().openrouterKey; }

  async generate(messages: AIMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<AIResponse> {
    const cfg = getAIConfig();
    const model = getAIModel('openrouter', 'anthropic/claude-sonnet-4-20250514')!;
    const content = await openAICompatPost(
      'https://openrouter.ai/api/v1/chat/completions',
      cfg.openrouterKey!,
      model,
      messages,
      options
    );
    return { content, provider: 'openrouter', model };
  }
}

// ─── New providers ───────────────────────────────────────────────────────────

class MistralProvider implements AIProvider {
  name = 'mistral';
  isConfigured() { return !!getAIConfig().mistralKey; }

  async generate(messages: AIMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<AIResponse> {
    const cfg = getAIConfig();
    const model = getAIModel('mistral', 'mistral-large-latest')!;
    const content = await openAICompatPost(
      'https://api.mistral.ai/v1/chat/completions',
      cfg.mistralKey!,
      model,
      messages,
      options
    );
    return { content, provider: 'mistral', model };
  }
}

class GroqProvider implements AIProvider {
  name = 'groq';
  isConfigured() { return !!getAIConfig().groqKey; }

  async generate(messages: AIMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<AIResponse> {
    const cfg = getAIConfig();
    // Groq's fastest capable model as default
    const model = getAIModel('groq', 'openai/gpt-oss-120b')!;
    const content = await openAICompatPost(
      'https://api.groq.com/openai/v1/chat/completions',
      cfg.groqKey!,
      model,
      messages,
      options
    );
    return { content, provider: 'groq', model };
  }
}

class DeepSeekProvider implements AIProvider {
  name = 'deepseek';
  isConfigured() { return !!getAIConfig().deepseekKey; }

  async generate(messages: AIMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<AIResponse> {
    const cfg = getAIConfig();
    const model = getAIModel('deepseek', 'deepseek-chat')!;
    const content = await openAICompatPost(
      'https://api.deepseek.com/v1/chat/completions',
      cfg.deepseekKey!,
      model,
      messages,
      options
    );
    return { content, provider: 'deepseek', model };
  }
}

class PerplexityProvider implements AIProvider {
  name = 'perplexity';
  isConfigured() { return !!getAIConfig().perplexityKey; }

  async generate(messages: AIMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<AIResponse> {
    const cfg = getAIConfig();
    const model = getAIModel('perplexity', 'sonar')!;
    const content = await openAICompatPost(
      'https://api.perplexity.ai/chat/completions',
      cfg.perplexityKey!,
      model,
      messages,
      options
    );
    return { content, provider: 'perplexity', model };
  }
}

class TogetherProvider implements AIProvider {
  name = 'together';
  isConfigured() { return !!getAIConfig().togetherKey; }

  async generate(messages: AIMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<AIResponse> {
    const cfg = getAIConfig();
    const model = getAIModel('together', 'meta-llama/Llama-3.3-70B-Instruct-Turbo')!;
    const content = await openAICompatPost(
      'https://api.together.xyz/v1/chat/completions',
      cfg.togetherKey!,
      model,
      messages,
      options
    );
    return { content, provider: 'together', model };
  }
}

class CohereProvider implements AIProvider {
  name = 'cohere';
  isConfigured() { return !!getAIConfig().cohereKey; }

  async generate(messages: AIMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<AIResponse> {
    const cfg = getAIConfig();
    const model = getAIModel('cohere', 'command-r-plus-08-2024')!;

    // Cohere uses a different request shape: system + chat_history + message
    const systemMsg = messages.find(m => m.role === 'system');
    const history = messages
      .filter(m => m.role !== 'system')
      .slice(0, -1)  // all but the last
      .map(m => ({ role: m.role === 'assistant' ? 'CHATBOT' : 'USER', message: m.content }));
    const lastMsg = messages.filter(m => m.role !== 'system').at(-1);

    const response = await fetch('https://api.cohere.com/v1/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.cohereKey}`,
      },
      body: JSON.stringify({
        model,
        message: lastMsg?.content ?? '',
        preamble: systemMsg?.content,
        chat_history: history,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 4096,
      }),
    });

    if (!response.ok) throw new Error(`Cohere ${response.status}: ${await response.text()}`);
    const data = (await response.json()) as any;
    return { content: data.text, provider: 'cohere', model };
  }
}

class XAIProvider implements AIProvider {
  name = 'xai';
  isConfigured() { return !!getAIConfig().xaiKey; }

  async generate(messages: AIMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<AIResponse> {
    const cfg = getAIConfig();
    const model = getAIModel('xai', 'grok-4.6')!;
    // xAI's API is OpenAI-compatible
    const content = await openAICompatPost(
      'https://api.x.ai/v1/chat/completions',
      cfg.xaiKey!,
      model,
      messages,
      options
    );
    return { content, provider: 'xai', model };
  }
}

class AzureOpenAIProvider implements AIProvider {
  name = 'azure-openai';
  isConfigured() {
    const cfg = getAIConfig();
    return !!(cfg.azureOpenAIKey && cfg.azureOpenAIEndpoint && cfg.azureOpenAIDeployment);
  }

  async generate(messages: AIMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<AIResponse> {
    const cfg = getAIConfig();
    const deployment = cfg.azureOpenAIDeployment!;
    const apiVersion = cfg.azureOpenAIApiVersion!;
    const endpoint = cfg.azureOpenAIEndpoint!.replace(/\/$/, '');
    const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': cfg.azureOpenAIKey!,
      },
      body: JSON.stringify({
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 4096,
      }),
    });

    if (!response.ok) throw new Error(`Azure OpenAI ${response.status}: ${await response.text()}`);
    const data = (await response.json()) as any;
    return { content: data.choices[0].message.content, provider: 'azure-openai', model: deployment };
  }
}

// ─── NVIDIA NIM ──────────────────────────────────────────────────────────────

class NvidiaProvider implements AIProvider {
  name = 'nvidia';
  isConfigured() { return !!getAIConfig().nvidiaKey; }

  async generate(messages: AIMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<AIResponse> {
    const cfg = getAIConfig();
    const model = getAIModel('nvidia', 'nvidia/nemotron-3-super-120b-a12b')!;
    // NVIDIA NIM cold starts can take 90-120s on free tier — use a longer timeout
    const content = await openAICompatPost(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      cfg.nvidiaKey!,
      model,
      messages,
      options,
      {},
      120_000  // 2 minutes
    );
    return { content, provider: 'nvidia', model };
  }
}

class HostedOpenAICompatibleProvider implements AIProvider {
  constructor(
    public name: string,
    private readonly endpoint: string,
    private readonly defaultModel: string,
    private readonly getKey: () => string | undefined,
  ) {}

  isConfigured() { return !!this.getKey(); }

  async generate(messages: AIMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<AIResponse> {
    const cfg = getAIConfig();
    const model = getAIModel(this.name as any, this.defaultModel)!;
    const content = await openAICompatPost(this.endpoint, this.getKey()!, model, messages, options);
    return { content, provider: this.name, model };
  }
}

const OAUTH_AGENT_PROVIDERS = new Set(['codex', 'claude-code', 'antigravity']);
export function isOAuthAgentProvider(name: string): boolean { return OAUTH_AGENT_PROVIDERS.has(name); }

class OAuthAgentProvider implements AIProvider {
  constructor(public name: 'codex' | 'claude-code' | 'antigravity') {}

  isConfigured() { return true; }

  async generate(messages: AIMessage[]): Promise<AIResponse> {
    const instruction = [
      'You are AutoGit\'s text-generation backend.',
      'Do not create, edit, delete, stage, commit, push, or run project commands.',
      'Return only the requested final text, with no explanation of your process.',
      ...messages.map(message => `${message.role.toUpperCase()}:\n${message.content}`),
    ].join('\n\n');
    const env = { ...process.env };
    if (this.name === 'codex') { delete env.OPENAI_API_KEY; delete env.CODEX_API_KEY; }
    if (this.name === 'claude-code') delete env.ANTHROPIC_API_KEY;
    if (this.name === 'antigravity') delete env.GEMINI_API_KEY;
    try {
      const content = await runAgentPrompt(this.name, instruction, {
        cwd: process.cwd(), env, timeoutMs: 360_000, maxBuffer: 4 * 1024 * 1024,
      });
      if (!content) throw new Error(`${this.name} returned no text`);
      return { content, provider: this.name, model: 'subscription' };
    } catch (error: any) {
      if (error.code === 'ENOENT') throw new Error(`${this.name} is not installed. Run autogit setup to install and sign in.`);
      throw new Error(`${this.name} OAuth generation failed: ${error.stderr?.trim() || error.message}`);
    }
  }
}

// ─── Custom OpenAI-compatible endpoint ───────────────────────────────────────
// Works with any server that speaks the OpenAI chat completions format:
// LM Studio, Jan, LocalAI, vLLM, llama.cpp server, text-generation-webui, etc.

class CustomProvider implements AIProvider {
  name = 'custom';

  isConfigured() {
    const cfg = getAIConfig();
    return !!(cfg.customEndpoint);  // endpoint is the only required field
  }

  async generate(messages: AIMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<AIResponse> {
    const cfg = getAIConfig();
    const endpoint = cfg.customEndpoint!.replace(/\/$/, '');
    const model = cfg.customModelName || getAIModel('custom', 'default')!;

    // Build URL — support both bare base URL and full path
    const url = endpoint.endsWith('/chat/completions')
      ? endpoint
      : `${endpoint}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // API key is optional for local servers
    if (cfg.customKey) {
      headers['Authorization'] = `Bearer ${cfg.customKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 4096,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Custom API HTTP ${response.status}: ${err}`);
    }

    const data = (await response.json()) as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Custom API returned empty response');

    return { content, provider: 'custom', model };
  }
}

// ─── Registry ────────────────────────────────────────────────────────────────

const providers: Record<string, AIProvider> = {
  openai:         new OpenAIProvider(),
  anthropic:      new AnthropicProvider(),
  gemini:         new GeminiProvider(),
  ollama:         new OllamaProvider(),
  openrouter:     new OpenRouterProvider(),
  mistral:        new MistralProvider(),
  groq:           new GroqProvider(),
  deepseek:       new DeepSeekProvider(),
  perplexity:     new PerplexityProvider(),
  together:       new TogetherProvider(),
  cohere:         new CohereProvider(),
  xai:            new XAIProvider(),
  'azure-openai': new AzureOpenAIProvider(),
  nvidia:         new NvidiaProvider(),
  cerebras:       new HostedOpenAICompatibleProvider('cerebras', 'https://api.cerebras.ai/v1/chat/completions', 'gpt-oss-120b', () => getAIConfig().cerebrasKey),
  deepinfra:      new HostedOpenAICompatibleProvider('deepinfra', 'https://api.deepinfra.com/v1/openai/chat/completions', 'deepseek-ai/DeepSeek-V3.2', () => getAIConfig().deepinfraKey),
  huggingface:    new HostedOpenAICompatibleProvider('huggingface', 'https://router.huggingface.co/v1/chat/completions', 'openai/gpt-oss-120b:fastest', () => getAIConfig().huggingfaceKey),
  fireworks:      new HostedOpenAICompatibleProvider('fireworks', 'https://api.fireworks.ai/inference/v1/chat/completions', 'accounts/fireworks/models/llama-v3p1-8b-instruct', () => getAIConfig().fireworksKey),
  codex:          new OAuthAgentProvider('codex'),
  'claude-code':  new OAuthAgentProvider('claude-code'),
  antigravity:    new OAuthAgentProvider('antigravity'),
  custom:         new CustomProvider(),
};

export function getProvider(name?: string): AIProvider {
  const cfg = getAIConfig();
  const providerName = name || cfg.provider;
  const provider = providers[providerName];

  if (!provider) {
    throw new Error(
      `Unknown provider: "${providerName}". Available: ${Object.keys(providers).join(', ')}`
    );
  }
  if (!provider.isConfigured()) {
    throw new Error(
      `Provider "${providerName}" is not configured. ` +
      `Run "autogit config" or set the matching environment variable.`
    );
  }
  return provider;
}

export function listProviders(): { name: string; configured: boolean; defaultModel: string }[] {
  const defaults: Record<string, string> = {
    openai:         'gpt-4o-mini',
    anthropic:      'claude-sonnet-4-20250514',
    gemini:         'gemini-3.8-flash',
    ollama:         'llama3.1',
    openrouter:     'anthropic/claude-sonnet-4-20250514',
    mistral:        'mistral-large-latest',
    groq:           'openai/gpt-oss-120b',
    deepseek:       'deepseek-chat',
    perplexity:     'sonar',
    together:       'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    cohere:         'command-r-plus-08-2024',
    xai:            'grok-4.6',
    'azure-openai': '(your deployment name)',
    nvidia:         'nvidia/nemotron-3-super-120b-a12b',
    cerebras:       'gpt-oss-120b',
    deepinfra:      'deepseek-ai/DeepSeek-V3.2',
    huggingface:    'openai/gpt-oss-120b:fastest',
    fireworks:      'accounts/fireworks/models/llama-v3p1-8b-instruct',
    codex:          'ChatGPT subscription',
    'claude-code':  'Claude subscription',
    antigravity:    'Google account subscription',
    custom:         '(your model name)',
  };

  return Object.entries(providers).map(([name, p]) => ({
    name,
    configured: p.isConfigured(),
    defaultModel: defaults[name] ?? '',
  }));
}
