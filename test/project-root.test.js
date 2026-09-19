import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { resolveProjectDirectory } from '../dist/utils/project-root.js';
import { scanProject } from '../dist/scanner/file-scanner.js';
import { analyzeProject } from '../dist/scanner/project-analyzer.js';

test('single nested project is selected from a wrapper folder', () => {
  const wrapper = mkdtempSync(join(tmpdir(), 'autogit-wrapper-'));
  const project = join(wrapper, 'actual-project');
  mkdirSync(project);
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'actual-project' }));
  assert.deepEqual(resolveProjectDirectory(wrapper), { root: project, discovered: true });
});

test('single project is found through nested wrapper folders', () => {
  const wrapper = mkdtempSync(join(tmpdir(), 'autogit-deep-wrapper-'));
  mkdirSync(join(wrapper, '.git'));
  const project = join(wrapper, 'source', 'project');
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, 'app.csproj'), '<Project />');
  assert.deepEqual(resolveProjectDirectory(wrapper), { root: project, discovered: true });
});

test('home directory is never accepted as a project', () => {
  assert.throws(() => resolveProjectDirectory(process.platform === 'win32' ? process.env.USERPROFILE : process.env.HOME), /home directory/);
});

test('current project root is kept when it has a manifest', () => {
  const project = mkdtempSync(join(tmpdir(), 'autogit-project-'));
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'current-project' }));
  mkdirSync(join(project, 'nested'));
  writeFileSync(join(project, 'nested', 'package.json'), JSON.stringify({ name: 'nested' }));
  assert.deepEqual(resolveProjectDirectory(project), { root: project, discovered: false });
});

test('feature detector definitions do not become detected project features', async () => {
  const project = mkdtempSync(join(tmpdir(), 'autogit-detector-'));
  const scanner = join(project, 'src', 'scanner');
  mkdirSync(scanner, { recursive: true });
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'detector-test' }));
  writeFileSync(join(scanner, 'project-analyzer.ts'), `
    const featurePatterns = [
      { pattern: /barcode|qrcode/i, feature: 'Barcode/QR Scanner' },
      { pattern: /tspl|ZPL\\./i, feature: 'Label Printing' },
    ];
  `);
  const scan = scanProject(project);
  const analysis = await analyzeProject(project, scan);
  assert.equal(analysis.codeFeatures.includes('Barcode/QR Scanner'), false);
  assert.equal(analysis.codeFeatures.includes('Label Printing'), false);
});
