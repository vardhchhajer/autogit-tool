import chalk from 'chalk';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import { loadConfig, saveConfig } from '../config/manager.js';
import { logger, spinner } from '../utils/logger.js';

export async function cmdLogin(): Promise<void> {
  logger.header('GitHub Authentication');

  // --check: diagnose where the current token comes from
  if (process.argv.includes('--check')) {
    await checkTokenSources();
    return;
  }

  // Detect bad env var upfront and guide through the fix interactively
  const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const envVarName = process.env.GITHUB_TOKEN ? 'GITHUB_TOKEN' : process.env.GH_TOKEN ? 'GH_TOKEN' : null;

  if (envVarName && envToken) {
    const spin = spinner(`Checking ${envVarName} env var...`).start();
    const valid = await isTokenValid(envToken);
    if (valid) {
      spin.succeed(`${envVarName} is already valid — you're good to go!`);
      const user = await getGitHubUser(envToken);
      if (user) logger.success(`Authenticated as ${chalk.bold(user)}`);
      return;
    }
    spin.fail(`${envVarName} env var is set but rejected by GitHub (bad/expired token)`);
    logger.blank();
    logger.warn(`This env var overrides everything — fixing it now.`);
    logger.blank();
    await fixBadEnvVar(envVarName);
    return;
  }

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

async function fixBadEnvVar(envVarName: string): Promise<void> {
  logger.info('Step 1 of 2 — Get a valid GitHub token');
  logger.blank();
  logger.dimmed('Create one at: https://github.com/settings/tokens/new');
  logger.dimmed('Required scopes: repo, read:user');
  logger.blank();

  let token = '';
  while (true) {
    const { raw } = await inquirer.prompt([{
      type: 'input',
      name: 'raw',
      message: 'Paste your new GitHub token:',
      validate: (v: string) => v.trim().length > 0 || 'Cannot be empty',
    }]);

    token = sanitize(raw);
    const spin = spinner('Verifying...').start();
    const valid = await isTokenValid(token);
    if (valid) {
      const user = await getGitHubUser(token);
      spin.succeed(`Valid! Authenticated as ${chalk.bold(user ?? 'unknown')}`);
      break;
    }
    spin.fail('GitHub still rejected that token. Check the token and try again.');
  }

  // Save to config file
  const config = loadConfig();
  config.github = config.github ?? {};
  config.github.token = token;
  saveConfig(config);
  logger.success('Token saved to ~/.autogit/config.json');
  logger.blank();

  // Step 2 — Fix the env var in the current process AND print commands
  logger.info('Step 2 of 2 — Fix the environment variable');
  logger.blank();
  logger.dimmed(`${envVarName} is still set to the bad value in your shell.`);
  logger.dimmed('Run ONE of these in your terminal right now:');
  logger.blank();
  console.log(chalk.bold('  PowerShell:'));
  console.log(chalk.cyan(`  $env:${envVarName} = "${token}"`));
  logger.blank();
  console.log(chalk.bold('  CMD:'));
  console.log(chalk.cyan(`  set ${envVarName}=${token}`));
  logger.blank();
  logger.dimmed('Or to permanently remove it from Windows:');
  console.log(chalk.cyan(`  [System.Environment]::SetEnvironmentVariable("${envVarName}", $null, "User")`));
  logger.blank();
  logger.success('After running that command, autogit will work in all future terminals.');
}

async function checkTokenSources(): Promise<void> {
  logger.header('Token source diagnosis');
  logger.blank();

  const sources: Array<{ label: string; token: string | undefined; source: string }> = [
    { label: 'GITHUB_TOKEN env var', token: process.env.GITHUB_TOKEN,  source: 'env' },
    { label: 'GH_TOKEN env var',     token: process.env.GH_TOKEN,       source: 'env' },
    { label: '~/.autogit/config.json', token: loadConfig().github?.token, source: 'file' },
  ];

  let activeToken: string | undefined;
  let activeLabel = '';

  for (const s of sources) {
    if (s.token) {
      const preview = s.token.length > 8
        ? `${s.token.slice(0, 4)}***${s.token.slice(-4)}`
        : '(too short)';
      const isActive = !activeToken;
      const marker = isActive ? chalk.cyan(' ← ACTIVE (this is what AutoGit uses)') : '';
      console.log(`  ${chalk.green('✔')} ${s.label.padEnd(26)} ${chalk.dim(`[${s.token.length} chars]`)} ${preview}${marker}`);
      if (isActive) { activeToken = s.token; activeLabel = s.label; }
    } else {
      console.log(`  ${chalk.gray('○')} ${s.label.padEnd(26)} ${chalk.gray('(not set)')}`);
    }
  }

  logger.blank();

  if (!activeToken) {
    logger.warn('No GitHub token found anywhere. Run "autogit login" to set one.');
    return;
  }

  logger.info(`Active token source: ${chalk.bold(activeLabel)}`);
  logger.blank();

  // Verify the active token
  await verifyToken(activeToken);

  // If the active token is an env var and it's bad, tell the user exactly how to fix it
  if (activeLabel.includes('env')) {
    logger.blank();
    logger.warn(`The bad token is coming from the ${chalk.bold(activeLabel)} environment variable.`);
    logger.dimmed('Even if you run "autogit login", the env var will override it.');
    logger.blank();
    logger.info('To fix — unset the bad env var in your current terminal:');
    logger.blank();
    console.log(chalk.bold('  PowerShell:'));
    console.log(chalk.cyan('    Remove-Item Env:GITHUB_TOKEN'));
    logger.blank();
    console.log(chalk.bold('  CMD:'));
    console.log(chalk.cyan('    set GITHUB_TOKEN='));
    logger.blank();
    logger.dimmed('Then run "autogit login" to save a fresh token.');
  }
}

async function verifyToken(token: string): Promise<void> {
  const spin = spinner('Verifying with GitHub...').start();
  const res = await rawGitHubFetch(token);

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
}

async function isTokenValid(token: string): Promise<boolean> {
  try {
    const res = await rawGitHubFetch(token);
    return res.ok;
  } catch {
    return false;
  }
}

async function getGitHubUser(token: string): Promise<string | null> {
  try {
    const res = await rawGitHubFetch(token);
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    return data.login ?? null;
  } catch {
    return null;
  }
}

async function rawGitHubFetch(token: string): Promise<Response> {
  return fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'autogit-tool',
    },
  });
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
