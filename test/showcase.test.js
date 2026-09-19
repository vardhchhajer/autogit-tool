import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { scanProject } from '../dist/scanner/file-scanner.js';
import { analyzeProject } from '../dist/scanner/project-analyzer.js';
import { collectShowcaseFacts } from '../dist/services/showcase.js';
import { showcaseCardSvg, saveShowcaseCards } from '../dist/services/showcase-cards.js';

test('CLI showcase uses actual package command and never implies a GUI', async () => {
  const root = mkdtempSync(join(tmpdir(), 'autogit-showcase-test-'));
  try {
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'test-cli', description: 'A useful command line tool', bin: { demo: './dist/cli.js' } }));
    writeFileSync(join(root, 'src', 'cli.js'), 'console.log("hello")');
    const scan = scanProject(root);
    const analysis = await analyzeProject(root, scan);
    const base = collectShowcaseFacts(root, scan, analysis);
    assert.equal(base.kind, 'cli');
    assert.ok(base.facts.some(f => f.text === 'Command: demo' && f.source === 'package.json'));
    const card = showcaseCardSvg({ ...base, post: '' }, 1);
    assert.match(card, /SOURCE: package.json/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('showcase SVG escapes project-supplied text', () => {
  const svg = showcaseCardSvg({ kind: 'api', name: '<unsafe>', facts: [{ text: 'A & B', source: 'source' }], post: '' }, 0);
  assert.match(svg, /&lt;unsafe&gt;/);
  assert.doesNotMatch(svg, /<unsafe>/);
});

test('showcase cards render PNG without a browser', async () => {
  const root = mkdtempSync(join(tmpdir(), 'autogit-showcase-cards-'));
  try {
    const cards = await saveShowcaseCards({ kind: 'cli', name: 'Test CLI', facts: [{ text: 'Command: demo', source: 'package.json' }], post: '' }, root);
    assert.equal(cards.png.length, 3);
    const { readFileSync } = await import('node:fs');
    assert.deepEqual([...readFileSync(cards.png[0]).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('showcase rejects the removed --no-ai option', () => {
  const root = mkdtempSync(join(tmpdir(), 'autogit-showcase-cli-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'offline-cli', description: 'A local CLI', bin: { offline: './cli.js' } }));
    writeFileSync(join(root, 'cli.js'), 'console.log("ready")');
    const result = spawnSync(process.execPath, [join(process.cwd(), 'dist', 'cli.js'), 'showcase', '--no-ai'], {
      cwd: root, encoding: 'utf8', env: { ...process.env, USERPROFILE: root }, timeout: 30000,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unknown option '--no-ai'/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('AI-enabled showcase exits with an error instead of using a template', () => {
  const root = mkdtempSync(join(tmpdir(), 'autogit-showcase-ai-failure-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'strict-ai-cli', bin: { strict: './cli.js' } }));
    writeFileSync(join(root, 'cli.js'), 'console.log("ready")');
    const result = spawnSync(process.execPath, [join(process.cwd(), 'dist', 'cli.js'), 'showcase'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, USERPROFILE: root, AUTOGIT_AI_PROVIDER: 'unavailable-test-provider' },
      timeout: 30000,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Showcase AI generation failed: Unknown provider/);
    assert.doesNotMatch(result.stdout, /Introducing Strict Ai Cli/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
