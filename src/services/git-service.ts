import simpleGit, { type StatusResult } from 'simple-git';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ProjectAnalysis } from '../scanner/project-analyzer.js';
import { getProvider, type AIMessage } from '../ai/provider.js';
import { commitMessagePrompt } from '../ai/prompts.js';
import { logger, spinner } from '../utils/logger.js';

export interface GitStatus {
  isRepo: boolean;
  branch: string;
  hasRemote: boolean;
  remoteUrl: string | null;
  isDirty: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

export interface CommitPlan {
  branch: string | null;
  remoteUrl: string | null;
  staged: string[];
  toStage: string[];
  preservedUnstaged: string[];
  sensitive: string[];
}

function looksSensitive(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').toLowerCase();
  const name = normalized.split('/').pop() || '';
  if (/^\.env(?:\.|$)/.test(name) && !/\.(example|sample|template)$/.test(name)) return true;
  return /(^|\/)(\.npmrc|\.pypirc|credentials(?:\.json)?|secrets?(?:\.json)?|id_rsa|id_ed25519)$/.test(normalized) ||
    /\.(pem|p12|pfx|key)$/.test(name);
}

export async function getCommitPlan(rootDir: string): Promise<CommitPlan> {
  const git = simpleGit(rootDir);
  const status = await git.status();
  const remotes = await git.getRemotes(true);
  const origin = remotes.find(remote => remote.name === 'origin');
  const staged = status.files.filter(file => file.index !== ' ' && file.index !== '?')
    .map(file => file.path);
  const toStage = status.files.filter(file => file.index === '?' ||
    (file.index === ' ' && file.working_dir !== ' '))
    .map(file => file.path);
  const preservedUnstaged = status.files.filter(file =>
    file.index !== ' ' && file.index !== '?' && file.working_dir !== ' '
  ).map(file => file.path);
  return {
    branch: status.current,
    remoteUrl: origin?.refs.push || null,
    staged,
    toStage,
    preservedUnstaged,
    sensitive: [...new Set([...staged, ...toStage].filter(looksSensitive))],
  };
}

export async function stageCommitPlan(rootDir: string, plan: CommitPlan): Promise<void> {
  if (plan.toStage.length === 0) return;
  await simpleGit(rootDir).raw(['add', '-A', '--', ...plan.toStage]);
}

export async function getStagedSummary(rootDir: string): Promise<string> {
  return simpleGit(rootDir).diff(['--cached', '--stat']);
}

export async function getGitStatus(rootDir: string): Promise<GitStatus> {
  const git = simpleGit(rootDir);

  try {
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return {
        isRepo: false,
        branch: '',
        hasRemote: false,
        remoteUrl: null,
        isDirty: false,
        staged: [],
        unstaged: [],
        untracked: [],
      };
    }

    const status: StatusResult = await git.status();
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');

    return {
      isRepo: true,
      branch: status.current || 'main',
      hasRemote: !!origin,
      remoteUrl: origin?.refs?.push || null,
      isDirty: !status.isClean(),
      staged: status.staged,
      unstaged: status.modified,
      untracked: status.not_added,
    };
  } catch {
    return {
      isRepo: false,
      branch: '',
      hasRemote: false,
      remoteUrl: null,
      isDirty: false,
      staged: [],
      unstaged: [],
      untracked: [],
    };
  }
}

export async function initGit(rootDir: string): Promise<void> {
  const git = simpleGit(rootDir);
  await git.init();
  logger.success('Initialized Git repository');
}

export async function generateGitignore(rootDir: string, analysis: ProjectAnalysis): Promise<void> {
  const gitignorePath = join(rootDir, '.gitignore');
  if (existsSync(gitignorePath)) return;

  const entries: string[] = [
    '# Dependencies',
  ];

  if (analysis.packageManager === 'npm' || analysis.packageManager === 'yarn' || analysis.packageManager === 'pnpm' || analysis.packageManager === 'bun') {
    entries.push('node_modules/');
  }
  if (analysis.languages.includes('Python')) {
    entries.push('__pycache__/', '*.pyc', '.venv/', 'venv/');
  }
  if (analysis.languages.includes('Rust')) {
    entries.push('target/');
  }
  if (analysis.languages.includes('Go')) {
    entries.push('vendor/');
  }
  if (analysis.languages.includes('Java') || analysis.languages.includes('Kotlin')) {
    entries.push('build/', '.gradle/', '*.class');
  }
  if (analysis.languages.includes('C#')) {
    entries.push('bin/', 'obj/', '*.user', '*.suo');
  }

  entries.push(
    '',
    '# Build output',
    'dist/',
    'build/',
    'out/',
    '',
    '# Environment',
    '.env',
    '.env.local',
    '.env.*.local',
    '',
    '# IDE',
    '.idea/',
    '.vscode/',
    '*.swp',
    '*.swo',
    '.DS_Store',
    'Thumbs.db',
    '',
    '# Testing',
    'coverage/',
    '',
    '# Logs',
    '*.log',
    'npm-debug.log*',
  );

  writeFileSync(gitignorePath, entries.join('\n') + '\n', 'utf-8');
  logger.success('Generated .gitignore');
}

export async function stageAll(rootDir: string): Promise<void> {
  const git = simpleGit(rootDir);
  await git.add('.');
}

export async function stageFiles(rootDir: string, files: string[]): Promise<void> {
  const git = simpleGit(rootDir);
  await git.add(files);
}

export async function generateCommitMessage(rootDir: string, useAI: boolean): Promise<string> {
  const git = simpleGit(rootDir);

  // Get diff summary for commit message
  const diff = await git.diff(['--cached', '--stat']);

  if (!diff) {
    return 'docs: update project documentation';
  }

  if (!useAI) {
    // Generate a simple conventional commit
    if (diff.includes('README')) return 'docs: update README';
    if (diff.includes('package.json')) return 'chore: update dependencies';
    return 'docs: update project documentation';
  }

  try {
    const provider = getProvider();
    const prompt = commitMessagePrompt(diff);

    const messages: AIMessage[] = [
      { role: 'system', content: 'You generate concise, conventional git commit messages.' },
      { role: 'user', content: prompt },
    ];

    const response = await provider.generate(messages, { temperature: 0.3, maxTokens: 100 });
    let msg = response.content.trim();

    // Clean up any quotes or backticks
    msg = msg.replace(/^["'`]+|["'`]+$/g, '');
    // Take only first line
    msg = msg.split('\n')[0].trim();

    return msg || 'docs: update project documentation';
  } catch {
    return 'docs: update project documentation';
  }
}

export async function commit(rootDir: string, message: string): Promise<boolean> {
  const git = simpleGit(rootDir);
  const status = await git.status();

  // Nothing staged — skip commit silently instead of throwing
  if (status.staged.length === 0) {
    logger.dimmed('Nothing to commit — working tree clean');
    return false;
  }

  await git.commit(message);
  return true;
}

export async function push(rootDir: string, branch?: string): Promise<void> {
  const git = simpleGit(rootDir);
  const status = await git.status();
  const currentBranch = branch || status.current;
  if (!currentBranch) throw new Error('Cannot push from a detached HEAD or unnamed branch');

  try {
    await git.push('origin', currentBranch, ['--set-upstream']);
  } catch (error: any) {
    // If push fails, it might be because branch doesn't exist on remote
    if (error.message?.includes('has no upstream')) {
      await git.push(['--set-upstream', 'origin', currentBranch]);
    } else {
      throw error;
    }
  }
}

export async function addRemote(rootDir: string, url: string): Promise<void> {
  const git = simpleGit(rootDir);
  const remotes = await git.getRemotes();

  if (remotes.some(r => r.name === 'origin')) {
    throw new Error('Origin remote already exists; refusing to replace it');
  } else {
    await git.addRemote('origin', url);
  }
}

export async function getCurrentBranch(rootDir: string): Promise<string> {
  const git = simpleGit(rootDir);
  const status = await git.status();
  return status.current || 'main';
}
