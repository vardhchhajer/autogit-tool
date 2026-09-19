import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureProjectScreenshot, generatePromotionalArtwork } from '../dist/services/social-images.js';

test('screenshot capture rejects non-web URLs', async () => {
  await assert.rejects(captureProjectScreenshot('file:///secret', 'unused.png'), /http:\/\//);
});

test('captures a real local web page when a desktop browser is installed', async t => {
  const root = mkdtempSync(join(tmpdir(), 'autogit-image-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const server = createServer((_, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<html><body style="background:#e23252"><h1>AutoGit capture test</h1></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  const output = join(root, 'capture.png');
  try {
    await captureProjectScreenshot(`http://127.0.0.1:${address.port}`, output);
  } catch (error) {
    if (/No Chrome, Edge, or Chromium/.test(error.message)) return t.skip('No desktop browser installed');
    throw error;
  }
  assert.deepEqual([...readFileSync(output).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(statSync(output).size > 1000);
});

test('artwork uses the selected OpenAI provider without a live API call', async t => {
  const root = mkdtempSync(join(tmpdir(), 'autogit-art-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const originalProvider = process.env.AUTOGIT_AI_PROVIDER;
  const originalImageProvider = process.env.AUTOGIT_IMAGE_PROVIDER;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalImageModel = process.env.AUTOGIT_IMAGE_MODEL;
  const originalFetch = globalThis.fetch;
  process.env.AUTOGIT_AI_PROVIDER = 'openai';
  process.env.AUTOGIT_IMAGE_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.AUTOGIT_IMAGE_MODEL = 'gpt-image-1.5';
  t.after(() => {
    if (originalProvider === undefined) delete process.env.AUTOGIT_AI_PROVIDER;
    else process.env.AUTOGIT_AI_PROVIDER = originalProvider;
    if (originalImageProvider === undefined) delete process.env.AUTOGIT_IMAGE_PROVIDER;
    else process.env.AUTOGIT_IMAGE_PROVIDER = originalImageProvider;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalImageModel === undefined) delete process.env.AUTOGIT_IMAGE_MODEL;
    else process.env.AUTOGIT_IMAGE_MODEL = originalImageModel;
    globalThis.fetch = originalFetch;
  });
  let request;
  globalThis.fetch = async (_, options) => {
    request = JSON.parse(options.body);
    return { ok: true, json: async () => ({ data: [{ b64_json: Buffer.from('image-data').toString('base64') }] }) };
  };
  const output = join(root, 'art.png');
  await generatePromotionalArtwork({ name: 'Sample', displayName: 'Sample', description: 'A test tool', languages: ['TypeScript'], frameworks: [] }, output);
  assert.equal(request.model, 'gpt-image-1.5');
  assert.match(request.prompt, /not a screenshot/);
  assert.equal(readFileSync(output, 'utf-8'), 'image-data');
});

test('artwork supports Gemini image generation', async t => {
  const root = mkdtempSync(join(tmpdir(), 'autogit-gemini-art-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const prior = {
    provider: process.env.AUTOGIT_IMAGE_PROVIDER,
    key: process.env.GEMINI_API_KEY,
    model: process.env.AUTOGIT_IMAGE_MODEL,
  };
  const originalFetch = globalThis.fetch;
  process.env.AUTOGIT_IMAGE_PROVIDER = 'gemini';
  process.env.GEMINI_API_KEY = 'gemini-test-key';
  process.env.AUTOGIT_IMAGE_MODEL = 'gemini-test-image';
  t.after(() => {
    prior.provider === undefined ? delete process.env.AUTOGIT_IMAGE_PROVIDER : process.env.AUTOGIT_IMAGE_PROVIDER = prior.provider;
    prior.key === undefined ? delete process.env.GEMINI_API_KEY : process.env.GEMINI_API_KEY = prior.key;
    prior.model === undefined ? delete process.env.AUTOGIT_IMAGE_MODEL : process.env.AUTOGIT_IMAGE_MODEL = prior.model;
    globalThis.fetch = originalFetch;
  });
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, headers: options.headers, body: JSON.parse(options.body) };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from('gemini-image').toString('base64') } }] } }] }) };
  };
  const output = join(root, 'art.png');
  await generatePromotionalArtwork({ name: 'Sample', displayName: 'Sample', description: '', languages: [], frameworks: [] }, output);
  assert.match(String(request.url), /gemini-test-image:generateContent$/);
  assert.equal(request.headers['x-goog-api-key'], 'gemini-test-key');
  assert.deepEqual(request.body.generationConfig.responseModalities, ['TEXT', 'IMAGE']);
  assert.equal(readFileSync(output, 'utf8'), 'gemini-image');
});

test('artwork supports Antigravity subscription image generation', async t => {
  const root = mkdtempSync(join(tmpdir(), 'autogit-antigravity-art-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const originalProvider = process.env.AUTOGIT_IMAGE_PROVIDER;
  process.env.AUTOGIT_IMAGE_PROVIDER = 'antigravity';
  t.after(() => originalProvider === undefined
    ? delete process.env.AUTOGIT_IMAGE_PROVIDER
    : process.env.AUTOGIT_IMAGE_PROVIDER = originalProvider);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  let options;
  const runner = async (agent, prompt, receivedOptions) => {
    assert.equal(agent, 'antigravity');
    assert.match(prompt, /built-in image generation tool/);
    options = receivedOptions;
    const filename = JSON.parse(prompt.match(/directly as ("[^"]+")/)[1]);
    writeFileSync(join(receivedOptions.cwd, filename), png);
    return 'done';
  };
  const output = join(root, 'art.png');
  await generatePromotionalArtwork({ name: 'Sample', displayName: 'Sample', description: '', languages: [], frameworks: [] }, output, undefined, runner);
  assert.equal(options.acceptEdits, true);
  assert.equal(options.env.GEMINI_API_KEY, undefined);
  assert.deepEqual(readFileSync(output), png);
});

test('artwork supports xAI, Together, and custom image APIs', async t => {
  const root = mkdtempSync(join(tmpdir(), 'autogit-image-providers-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const names = ['AUTOGIT_IMAGE_PROVIDER', 'AUTOGIT_IMAGE_MODEL', 'AUTOGIT_IMAGE_ENDPOINT', 'AUTOGIT_IMAGE_API_KEY', 'XAI_API_KEY', 'TOGETHER_API_KEY'];
  const prior = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  t.after(() => {
    for (const name of names) prior[name] === undefined ? delete process.env[name] : process.env[name] = prior[name];
    globalThis.fetch = originalFetch;
  });
  const cases = [
    { provider: 'xai', keyName: 'XAI_API_KEY', key: 'xai-key', url: 'https://api.x.ai/v1/images/generations', format: 'b64_json' },
    { provider: 'together', keyName: 'TOGETHER_API_KEY', key: 'together-key', url: 'https://api.together.xyz/v1/images/generations', format: 'base64' },
    { provider: 'custom', keyName: 'AUTOGIT_IMAGE_API_KEY', key: 'custom-key', url: 'https://images.example/v1/images/generations', format: 'b64_json', endpoint: 'https://images.example/v1', imageUrl: 'https://images.example/result.png' },
  ];
  for (const item of cases) {
    process.env.AUTOGIT_IMAGE_PROVIDER = item.provider;
    process.env.AUTOGIT_IMAGE_MODEL = `${item.provider}-image-model`;
    process.env[item.keyName] = item.key;
    if (item.endpoint) process.env.AUTOGIT_IMAGE_ENDPOINT = item.endpoint;
    else delete process.env.AUTOGIT_IMAGE_ENDPOINT;
    let request;
    globalThis.fetch = async (url, options) => {
      if (url === item.imageUrl) return { ok: true, arrayBuffer: async () => Buffer.from(`${item.provider}-image`) };
      request = { url, headers: options.headers, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ data: [item.imageUrl
        ? { url: item.imageUrl }
        : { b64_json: Buffer.from(`${item.provider}-image`).toString('base64') }] }) };
    };
    const output = join(root, `${item.provider}.png`);
    await generatePromotionalArtwork({ name: 'Sample', displayName: 'Sample', description: '', languages: [], frameworks: [] }, output);
    assert.equal(request.url, item.url);
    assert.equal(request.headers.Authorization, `Bearer ${item.key}`);
    assert.equal(request.body.response_format, item.format);
    assert.equal(readFileSync(output, 'utf8'), `${item.provider}-image`);
  }
});
