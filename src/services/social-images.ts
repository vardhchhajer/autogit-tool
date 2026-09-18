import { existsSync, mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { ProjectAnalysis } from '../scanner/project-analyzer.js';
import { getAIConfig } from '../config/manager.js';
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
  const cfg = getAIConfig();
  if (cfg.provider !== 'openai' || !cfg.openaiKey) {
    throw new Error('Promotional artwork requires OpenAI selected and configured in autogit config');
  }
  const prompt = `Create a clean promotional image for a developer project, suitable for a LinkedIn post. This is conceptual artwork, not a screenshot or a claim about the real interface. Do not draw fake UI, text, logos, or badges. Project: ${analysis.displayName || analysis.name}. Description: ${analysis.description || 'software project'}. Technologies: ${[...analysis.languages, ...analysis.frameworks].slice(0, 6).join(', ')}. Art direction: ${direction || 'clear, contemporary editorial illustration with a simple composition'}.`;
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: cfg.imageModel || 'gpt-image-1.5', prompt, size: '1536x1024', output_format: 'png' }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Image generation failed (HTTP ${response.status}): ${(await response.text()).slice(0, 300)}`);
  const data = await response.json() as { data?: Array<{ b64_json?: string }> };
  const base64 = data.data?.[0]?.b64_json;
  if (!base64) throw new Error('Image provider returned no image data');
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, Buffer.from(base64, 'base64'));
}
