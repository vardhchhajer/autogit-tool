import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getCommitPlan, stageCommitPlan, addRemote } from '../dist/services/git-service.js';
import { runPublishWorkflow, remoteWebUrl } from '../dist/services/publish-workflow.js';

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf-8' }).trim();
}

function repo(t) {
  const root = mkdtempSync(join(tmpdir(), 'autogit-git-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init');
  git(root, 'config', 'user.name', 'AutoGit Test');
  git(root, 'config', 'user.email', 'test@example.com');
  writeFileSync(join(root, 'tracked.txt'), 'original\n');
  git(root, 'add', 'tracked.txt');
  git(root, 'commit', '-m', 'initial');
  return root;
}

test('commit plan preserves partial staging and stages only other changes', async t => {
  const root = repo(t);
  writeFileSync(join(root, 'tracked.txt'), 'first version\n');
  git(root, 'add', 'tracked.txt');
  writeFileSync(join(root, 'tracked.txt'), 'second version\n');
  writeFileSync(join(root, 'new.txt'), 'new file\n');

  const plan = await getCommitPlan(root);
  assert.deepEqual(plan.staged, ['tracked.txt']);
  assert.deepEqual(plan.toStage, ['new.txt']);
  assert.deepEqual(plan.preservedUnstaged, ['tracked.txt']);
  await stageCommitPlan(root, plan);
  assert.match(git(root, 'show', ':tracked.txt'), /first version/);
  assert.match(git(root, 'diff', '--', 'tracked.txt'), /second version/);
});

test('commit plan flags likely credentials even when already staged', async t => {
  const root = repo(t);
  writeFileSync(join(root, '.env.production'), 'TOKEN=secret\n');
  git(root, 'add', '-f', '.env.production');
  const plan = await getCommitPlan(root);
  assert.deepEqual(plan.sensitive, ['.env.production']);
});

test('existing origin cannot be replaced', async t => {
  const root = repo(t);
  git(root, 'remote', 'add', 'origin', 'https://github.com/example/original.git');
  await assert.rejects(addRemote(root, 'https://github.com/example/other.git'), /already exists/);
  assert.equal(git(root, 'remote', 'get-url', 'origin'), 'https://github.com/example/original.git');
});

test('publishes to existing local origin without GitHub credentials', async t => {
  const root = repo(t);
  const bare = join(root, 'remote.git');
  mkdirSync(bare);
  git(bare, 'init', '--bare');
  git(root, 'remote', 'add', 'origin', bare);
  const result = await runPublishWorkflow(root, { name: 'sample', languages: [] }, { yes: true });
  assert.equal(result.published, true);
  assert.ok(git(bare, 'show-ref', '--heads'));
});

test('failed push rejects and keeps the local commit', async t => {
  const root = repo(t);
  git(root, 'remote', 'add', 'origin', join(root, 'missing-remote.git'));
  const head = git(root, 'rev-parse', 'HEAD');
  await assert.rejects(runPublishWorkflow(root, { name: 'sample', languages: [] }, { yes: true }));
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
});

test('repository URL follows the actual remote', () => {
  assert.equal(remoteWebUrl('git@github.com:team/project.git'), 'https://github.com/team/project');
  assert.equal(remoteWebUrl('https://gitlab.com/team/project.git'), 'https://gitlab.com/team/project');
  assert.equal(remoteWebUrl('C:\\local\\repo.git'), undefined);
});
