import chalk from 'chalk';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import { loadConfig, saveConfig } from '../config/manager.js';
import { logger, spinner } from '../utils/logger.js';

export async function cmdLogin(): Promise<void> {
  logger.header('GitHub Authentication');

  const ghUser = checkGhCli();

  // If gh CLI is already authenticated, just grab the token silently — no prompt needed
  if (ghUser) {
    logger.info(`GitHub CLI is logged in as ${chalk.bold(ghUser)}`);
    const spin = spinner('Importing token from GitHub CLI...').start();
    try {
      const token = execSync('gh auth token', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      if (!token) throw new Error('gh auth token returned empty string');

      const config = loadConfig();
      config.github = config.github ?? {};
      config.github.token = token;
      saveConfig(config);
      spin.succeed(`Token saved (***${token.slice(-4)})`);

      await verifyToken(token);
      return;
    } catch (e: any) {
      spin.fail(`Could not read token from GitHub CLI: ${e.message}`);
      logger.dimmed('Falling back to manual entry...');
      logger.blank();
    }
  }

  const { method } = await inquirer.prompt([{
    type: 'list',
    name: 'method',
    message: 'How would you like to authenticate?',
    choices: [
      { name: 'Personal Access Token (classic or fine-grained)', value: 'pat' },
      { name: 'Show environment variable instructions',           value: 'env' },
    ],
  }]);

  if (method === 'pat') {
    logger.blank();
    logger.info('Create a token at:');
    logger.dimmed('  Classic token (easiest):   https://github.com/settings/tokens/new');
    logger.dimmed('  Required scopes: repo, read:user');
    logger.blank();

    const { raw } = await inquirer.prompt([{
      type: 'input',
      name: 'raw',
      message: 'Paste your GitHub token:',
      validate: (v: string) => v.trim().length > 0 || 'Token cannot be empty',
    }]);

    // Sanitize — strip invisible chars + trim
    const token = sanitize(raw);
    if (!token) { logger.error('Token was empty after sanitizing'); return; }

    const config = loadConfig();
    config.github = config.github ?? {};
    config.github.token = token;
    saveConfig(config);
    logger.dimmed(`Saved token (***${token.slice(-4)})`);

    await verifyToken(token);
    return;
  }

  // env instructions
  logger.blank();
  logger.header('Set GITHUB_TOKEN in your shell');
  logger.blank();
  console.log(chalk.bold('PowerShell:'));
  console.log(chalk.cyan('  $env:GITHUB_TOKEN = "github_pat_YOUR_TOKEN_HERE"'));
  logger.blank();
  console.log(chalk.bold('CMD:'));
  console.log(chalk.cyan('  set GITHUB_TOKEN=github_pat_YOUR_TOKEN_HERE'));
  logger.blank();
  console.log(chalk.bold('Bash / Zsh:'));
  console.log(chalk.cyan('  export GITHUB_TOKEN="github_pat_YOUR_TOKEN_HERE"'));
  logger.blank();
  logger.dimmed('AutoGit checks GITHUB_TOKEN and GH_TOKEN automatically.');

  if (process.env.GITHUB_TOKEN) {
    logger.success('GITHUB_TOKEN is already set in the current environment');
  } else {
    logger.warn('GITHUB_TOKEN is not set in the current environment');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function verifyToken(token: string): Promise<void> {
  const spin = spinner('Verifying with GitHub...').start();
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'autogit-cli',
      },
    });

    if (res.ok) {
      const user = (await res.json()) as any;
      spin.succeed(`Authenticated as ${chalk.bold(user.login)} ✔`);
      return;
    }

    const body = (await res.json()) as any;
    spin.fail(`GitHub rejected the token (HTTP ${res.status})`);
    logger.blank();

    if (res.status === 401) {
      logger.warn('401 Bad credentials — common causes:');
      logger.dimmed('  • Token was copied incorrectly (missing chars, extra spaces)');
      logger.dimmed('  • Token has been revoked or expired');
      logger.dimmed('  • Token is a fine-grained token missing "repo" permission');
      logger.blank();
      logger.dimmed('Fix:');
      logger.dimmed('  1. Go to https://github.com/settings/tokens');
      logger.dimmed('  2. Delete the old token and create a new one');
      logger.dimmed('  3. Scopes needed: repo, read:user');
      logger.dimmed('  4. Run "autogit login" again and paste the new token');
    } else {
      logger.warn(`GitHub error: ${body?.message ?? res.statusText}`);
    }
  } catch (e: any) {
    spin.fail(`Network error while verifying: ${e.message}`);
  }
}

function checkGhCli(): string | null {
  try {
    // Try the most reliable method first
    const login = execSync('gh api user --jq .login', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return login || null;
  } catch {
    try {
      const status = execSync('gh auth status', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const match = status.match(/Logged in to github\.com(?:\s+as\s+account\s+|\s+account\s+)(\S+)/);
      return match?.[1] ?? null;
    } catch {
      return null;
    }
  }
}

function sanitize(raw: string): string {
  return raw
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '')
    .trim();
}
