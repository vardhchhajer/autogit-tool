import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { scanProject } from '../dist/scanner/file-scanner.js';
import { analyzeProject } from '../dist/scanner/project-analyzer.js';
import { createSharePackage } from '../dist/services/share-package.js';

test('main-run share package saves sourced post and cards with verified URL only', async () => {
  const root = mkdtempSync(join(tmpdir(), 'autogit-share-'));
  const oldUserProfile = process.env.USERPROFILE;
  const oldHome = process.env.HOME;
  try {
    process.env.USERPROFILE = root;
    process.env.HOME = root;
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'demo-cli', description: 'A demo command', bin: { demo: './cli.js' } }));
    writeFileSync(join(root, 'cli.js'), 'console.log("ready")');
    const scan = scanProject(root);
    const analysis = await analyzeProject(root, scan);
    const content = { linkedin: { short: '', medium: '', long: '' }, twitter: 'Try it: [GITHUB_LINK]', devto: 'Read [GITHUB_LINK]', resumeBullet: '', portfolioDescription: '' };
    const result = await createSharePackage(root, scan, analysis, content, false, 'https://github.com/example/demo-cli');
    assert.match(result.post, /Command: demo/);
    assert.match(readFileSync(join(result.directory, 'linkedin.txt'), 'utf8'), /https:\/\/github.com\/example\/demo-cli/);
    assert.match(readFileSync(join(result.directory, 'x.txt'), 'utf8'), /https:\/\/github.com\/example\/demo-cli/);
    assert.equal(result.cards.length, 3);
    assert.equal(JSON.parse(readFileSync(join(result.directory, 'evidence.json'), 'utf8')).kind, 'cli');
  } finally {
    oldUserProfile === undefined ? delete process.env.USERPROFILE : process.env.USERPROFILE = oldUserProfile;
    oldHome === undefined ? delete process.env.HOME : process.env.HOME = oldHome;
    rmSync(root, { recursive: true, force: true });
  }
});

test('main command dry-run previews the share package without writing it', () => {
  const root = mkdtempSync(join(tmpdir(), 'autogit-main-dry-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'demo', description: 'A demo project' }));
    const run = spawnSync(process.execPath, [join(process.cwd(), 'dist', 'cli.js'), '--dry-run', '--no-ai', '--skip-resume'], {
      cwd: root, encoding: 'utf8', timeout: 30000,
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Would create a share package/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
