import { getAIConfig } from '../config/manager.js';

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

/** OpenAI-compatible chat completions — used by OpenAI, Groq, DeepSeek,
 *  Perplexity, Together AI, xAI and OpenRouter (they all share the same shape). */
async function openAICompatPost(
  url: string,
  apiKey: string,
  model: string,
  messages: AIMessage[],
  options?: { temperature?: number; maxTokens?: number },
  extraHeaders: Record<string, string> = {}
): Promise<string> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
    }),
  });

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
    const model = cfg.model || 'gpt-4o-mini';
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
    const model = cfg.model || 'claude-sonnet-4-20250514';

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
    const model = cfg.model || 'gemini-1.5-flash';

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
    return { content: data.candidates[0].content.parts[0].text, provider: 'gemini', model };
  }
}

class OllamaProvider implements AIProvider {
  name = 'ollama';
  isConfigured() { return true; } // local — always available

  async generate(messages: AIMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<AIResponse> {
    const cfg = getAIConfig();
    const model = cfg.model || 'llama3.1';

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
    const model = cfg.model || 'anthropic/claude-sonnet-4-20250514';
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
    const model = cfg.model || 'mistral-large-latest';
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
    const model = cfg.model || 'llama-3.3-70b-versatile';
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
    const model = cfg.model || 'deepseek-chat';
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
    const model = cfg.model || 'llama-3.1-sonar-large-128k-online';
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
    const model = cfg.model || 'meta-llama/Llama-3.3-70B-Instruct-Turbo';
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
    const model = cfg.model || 'command-r-plus-08-2024';

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
    const model = cfg.model || 'grok-3-fast-beta';
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
// NVIDIA NIM uses an OpenAI-compatible API hosted at integrate.api.nvidia.com

class NvidiaProvider implements AIProvider {
  name = 'nvidia';
  isConfigured() { return !!getAIConfig().nvidiaKey; }

  async generate(messages: AIMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<AIResponse> {
    const cfg = getAIConfig();
    // Default to the most capable free model on NVIDIA NIM
    const model = cfg.model || 'meta/llama-3.3-70b-instruct';
    const content = await openAICompatPost(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      cfg.nvidiaKey!,
      model,
      messages,
      options
    );
    return { content, provider: 'nvidia', model };
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
    const model = cfg.customModelName || cfg.model || 'default';

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
    gemini:         'gemini-1.5-flash',
    ollama:         'llama3.1',
    openrouter:     'anthropic/claude-sonnet-4-20250514',
    mistral:        'mistral-large-latest',
    groq:           'llama-3.3-70b-versatile',
    deepseek:       'deepseek-chat',
    perplexity:     'llama-3.1-sonar-large-128k-online',
    together:       'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    cohere:         'command-r-plus-08-2024',
    xai:            'grok-3-fast-beta',
    'azure-openai': '(your deployment name)',
    nvidia:         'meta/llama-3.3-70b-instruct',
    custom:         '(your model name)',
  };

  return Object.entries(providers).map(([name, p]) => ({
    name,
    configured: p.isConfigured(),
    defaultModel: defaults[name] ?? '',
  }));
}
