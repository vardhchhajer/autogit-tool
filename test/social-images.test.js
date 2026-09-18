import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
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
  const originalKey = process.env.OPENAI_API_KEY;
  const originalImageModel = process.env.AUTOGIT_IMAGE_MODEL;
  const originalFetch = globalThis.fetch;
  process.env.AUTOGIT_AI_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.AUTOGIT_IMAGE_MODEL = 'gpt-image-1.5';
  t.after(() => {
    if (originalProvider === undefined) delete process.env.AUTOGIT_AI_PROVIDER;
    else process.env.AUTOGIT_AI_PROVIDER = originalProvider;
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
