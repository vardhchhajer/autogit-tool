import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanProject } from '../dist/scanner/file-scanner.js';
import { analyzeProject } from '../dist/scanner/project-analyzer.js';
import { generateAgentReadme } from '../dist/ai/readme-agent.js';
import { generateReadme } from '../dist/services/readme-manager.js';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'autogit-readme-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'sample-tool', scripts: { start: 'node src/app.js' } }));
  writeFileSync(join(root, 'src', 'app.js'), 'export function greet(name) { return `Hello ${name}`; }\n');
  writeFileSync(join(root, 'README.md'), '# Sample Tool\n\n[Custom guide](https://example.com/guide)\n');
  writeFileSync(join(root, '.env'), 'SECRET_TOKEN=private-value\n');
  return root;
}

test('agent reads selected files before drafting and excludes secret files', async t => {
  const root = fixture(t);
  const scan = scanProject(root);
  const analysis = await analyzeProject(root, scan);
  const seen = [];
  const replies = [
    '<read_files>\nREADME.md\npackage.json\n.env\n</read_files>',
    '<read_files>\nsrc/app.js\n</read_files>',
    '<final_readme>\n# Sample Tool\n\n[Custom guide](https://example.com/guide)\n\nRun `npm start`.\n</final_readme>',
  ];
  const provider = {
    name: 'mock',
    isConfigured: () => true,
    generate: async messages => {
      seen.push(messages.map(message => message.content).join('\n'));
      return { content: replies.shift(), provider: 'mock', model: 'mock' };
    },
  };
  const result = await generateAgentReadme(analysis, scan, '# Sample Tool', provider);
  assert.match(result, /npm start/);
  assert.match(seen[1], /FILE: README.md/);
  assert.match(seen[2], /FILE: src\/app.js/);
  assert.ok(seen.every(prompt => !prompt.includes('private-value')));
  assert.ok(seen.every(prompt => !prompt.includes('FILE: .env')));
});

test('agent rejects a draft that skips the existing README', async t => {
  const root = fixture(t);
  const scan = scanProject(root);
  const analysis = await analyzeProject(root, scan);
  const replies = [
    '<read_files>\npackage.json\n</read_files>',
    '<final_readme>\n# Sample Tool\n</final_readme>',
  ];
  const provider = {
    name: 'mock',
    isConfigured: () => true,
    generate: async () => ({ content: replies.shift(), provider: 'mock', model: 'mock' }),
  };
  await assert.rejects(generateAgentReadme(analysis, scan, '# Sample Tool', provider), /existing README/);
});

test('agent can search the project file list before requesting source', async t => {
  const root = fixture(t);
  const scan = scanProject(root);
  const analysis = await analyzeProject(root, scan);
  const replies = [
    '<search_files>app.js</search_files>',
    '<read_files>\nREADME.md\nsrc/app.js\n</read_files>',
    '<final_readme>\n# Sample Tool\n\n[Custom guide](https://example.com/guide)\n</final_readme>',
  ];
  const seen = [];
  const provider = {
    name: 'mock',
    isConfigured: () => true,
    generate: async messages => {
      seen.push(messages.at(-1).content);
      return { content: replies.shift(), provider: 'mock', model: 'mock' };
    },
  };
  await generateAgentReadme(analysis, scan, '# Sample Tool', provider);
  assert.match(seen[1], /src\/app.js/);
});

test('existing README stays unchanged when no usable AI provider is configured', async t => {
  const root = fixture(t);
  const scan = scanProject(root);
  const analysis = await analyzeProject(root, scan);
  const previous = process.env.AUTOGIT_AI_PROVIDER;
  process.env.AUTOGIT_AI_PROVIDER = 'unavailable-test-provider';
  t.after(() => {
    if (previous === undefined) delete process.env.AUTOGIT_AI_PROVIDER;
    else process.env.AUTOGIT_AI_PROVIDER = previous;
  });
  const result = await generateReadme(root, analysis, true, scan);
  assert.equal(result.content, '# Sample Tool\n\n[Custom guide](https://example.com/guide)\n');
  assert.equal(result.diff, null);
});

test('README manager rejects a draft that drops an existing link', async t => {
  const root = fixture(t);
  const scan = scanProject(root);
  const analysis = await analyzeProject(root, scan);
  const replies = [
    '<read_files>\nREADME.md\npackage.json\n</read_files>',
    '<final_readme>\n# Sample Tool\n\nRun `npm start`.\n</final_readme>',
  ];
  const provider = {
    name: 'mock',
    isConfigured: () => true,
    generate: async () => ({ content: replies.shift(), provider: 'mock', model: 'mock' }),
  };
  const result = await generateReadme(root, analysis, true, scan, provider);
  assert.equal(result.diff, null);
  assert.match(result.content, /Custom guide/);
});

test('README manager returns a diff for a valid inspected draft', async t => {
  const root = fixture(t);
  const scan = scanProject(root);
  const analysis = await analyzeProject(root, scan);
  const replies = [
    '<read_files>\nREADME.md\npackage.json\n</read_files>',
    '<final_readme>\n# Sample Tool\n\n[Custom guide](https://example.com/guide)\n\nRun `npm start`.\n</final_readme>',
  ];
  const provider = {
    name: 'mock',
    isConfigured: () => true,
    generate: async () => ({ content: replies.shift(), provider: 'mock', model: 'mock' }),
  };
  const result = await generateReadme(root, analysis, true, scan, provider);
  assert.match(result.diff, /Run `npm start`/);
});
