import { existsSync, mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { ProjectAnalysis } from '../scanner/project-analyzer.js';
import { getImageConfig } from '../config/manager.js';
import { getConfigDir } from '../utils/platform.js';

const run = promisify(execFile);

function browserPaths(): string[] {
  if (process.platform === 'win32') {
    return [
      join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
      join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
      join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
      join(process.env.LOCALAPPDATA || '', 'Microsoft/Edge/Application/msedge.exe'),
    ];
  }
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }
  return ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
}

export function defaultSocialImagePath(analysis: ProjectAnalysis, kind: 'screenshot' | 'artwork'): string {
  const slug = analysis.name.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '') || 'project';
  return join(getConfigDir(), 'social', slug, `${kind}-${Date.now()}.png`);
}

export async function captureProjectScreenshot(url: string, outputPath: string): Promise<void> {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Screenshot URL must start with http:// or https://');
  }
  const browser = browserPaths().find(existsSync);
  if (!browser) throw new Error('No Chrome, Edge, or Chromium browser was found for screenshot capture');
  mkdirSync(dirname(outputPath), { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'autogit-browser-'));
  try {
    await run(browser, [
      '--headless', '--disable-gpu', '--disable-software-rasterizer',
      '--hide-scrollbars', '--no-first-run',
      `--user-data-dir=${profile}`, '--window-size=1200,630',
      `--screenshot=${outputPath}`, url,
    ], { timeout: 45_000, windowsHide: true, maxBuffer: 1024 * 1024 });
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
  if (!existsSync(outputPath)) throw new Error('Browser exited without creating a screenshot');
}

export async function generatePromotionalArtwork(
  analysis: ProjectAnalysis,
  outputPath: string,
  direction?: string
): Promise<void> {
  const cfg = getImageConfig();
  if (cfg.provider === 'none') throw new Error('No image provider is configured. Run autogit setup or autogit config.');
  if (!cfg.model) throw new Error(`No image model is configured for ${cfg.provider}`);
  if (!cfg.key && cfg.provider !== 'custom') throw new Error(`No API key is configured for the ${cfg.provider} image provider`);
  if (cfg.provider === 'custom' && !cfg.endpoint) throw new Error('No custom image endpoint is configured');
  const prompt = `Create a clean promotional image for a developer project, suitable for a LinkedIn post. This is conceptual artwork, not a screenshot or a claim about the real interface. Do not draw fake UI, text, logos, or badges. Project: ${analysis.displayName || analysis.name}. Description: ${analysis.description || 'software project'}. Technologies: ${[...analysis.languages, ...analysis.frameworks].slice(0, 6).join(', ')}. Art direction: ${direction || 'clear, contemporary editorial illustration with a simple composition'}.`;
  const request = imageRequest(cfg.provider, cfg.model, prompt, cfg.key, cfg.endpoint);
  const response = await fetch(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Image generation failed (HTTP ${response.status}): ${(await response.text()).slice(0, 300)}`);
  const data = await response.json() as any;
  const part = cfg.provider === 'gemini'
    ? data.candidates?.[0]?.content?.parts?.find((item: any) => item.inlineData?.data)
    : undefined;
  const base64 = part?.inlineData?.data || data.data?.[0]?.b64_json;
  let image = base64 ? Buffer.from(base64, 'base64') : undefined;
  const imageUrl = data.data?.[0]?.url;
  if (!image && imageUrl) {
    const download = await fetch(imageUrl, { headers: { 'User-Agent': 'autogit-tool' }, signal: AbortSignal.timeout(60_000) });
    if (!download.ok) throw new Error(`Image download failed (HTTP ${download.status})`);
    image = Buffer.from(await download.arrayBuffer());
  }
  if (!image) throw new Error('Image provider returned no image data');
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, image);
}

export function isImageGenerationConfigured(): boolean {
  const cfg = getImageConfig();
  return cfg.provider !== 'none' && !!cfg.model && (cfg.provider === 'custom' ? !!cfg.endpoint : !!cfg.key);
}

function imageRequest(provider: string, model: string, prompt: string, key?: string, endpoint?: string) {
  if (provider === 'gemini') {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key! },
      body: { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } },
    };
  }

  const urls: Record<string, string> = {
    openai: 'https://api.openai.com/v1/images/generations',
    xai: 'https://api.x.ai/v1/images/generations',
    together: 'https://api.together.xyz/v1/images/generations',
  };
  const base = endpoint?.replace(/\/$/, '');
  const url = urls[provider] || (base?.endsWith('/images/generations') ? base : `${base}/images/generations`);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  const body: Record<string, unknown> = { model, prompt };
  if (provider === 'openai') Object.assign(body, { size: '1536x1024', output_format: 'png' });
  else if (provider === 'together') Object.assign(body, { width: 1344, height: 768, steps: 20, response_format: 'base64' });
  else body.response_format = 'b64_json';
  return { url, headers, body };
}
