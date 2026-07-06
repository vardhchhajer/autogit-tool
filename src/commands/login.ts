import chalk from 'chalk';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import { loadConfig, saveConfig } from '../config/manager.js';
import { logger } from '../utils/logger.js';

export async function cmdLogin(): Promise<void> {
  logger.header('GitHub Authentication');

  // Check if gh CLI is available and authenticated
  const ghAuth = checkGhCli();

  const { method } = await inquirer.prompt([{
    type: 'list',
    name: 'method',
    message: 'How would you like to authenticate?',
    choices: [
      ...(ghAuth ? [{ name: `Use GitHub CLI (logged in as ${ghAuth})`, value: 'gh' }] : []),
      { name: 'Personal Access Token', value: 'pat' },
      { name: 'Environment variable (GITHUB_TOKEN)', value: 'env' },
    ],
  }]);

  if (method === 'gh') {
    // Get token from gh CLI
    try {
      const token = execSync('gh auth token', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      const config = loadConfig();
      config.github = config.github || {};
      config.github.token = token;
      saveConfig(config);
      logger.success(`Authenticated via GitHub CLI as ${chalk.bold(ghAuth)}`);
    } catch {
      logger.error('Failed to get token from GitHub CLI');
    }
    return;
  }

  if (method === 'pat') {
    logger.blank();
    logger.info('Create a token at: https://github.com/settings/tokens');
    logger.dimmed('Required scopes: repo, read:user');
    logger.blank();

    const { token } = await inquirer.prompt([{
      type: 'input',
      name: 'token',
      message: 'GitHub Personal Access Token (paste and press Enter):',
      validate: (v: string) => v.length > 0 || 'Token is required',
    }]);

    const config = loadConfig();
    config.github = config.github || {};
    config.github.token = token;
    saveConfig(config);

    // Verify token
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json() as any;
        logger.success(`Authenticated as ${chalk.bold(data.login)}`);
      } else {
        logger.warn('Token saved but verification failed. Please check the token.');
      }
    } catch {
      logger.warn('Token saved but could not verify (network error)');
    }
    return;
  }

  if (method === 'env') {
    logger.blank();
    logger.info('Set the GITHUB_TOKEN environment variable:');
    logger.blank();
    logger.dimmed('  # Bash/Zsh');
    logger.dimmed('  export GITHUB_TOKEN="your_token_here"');
    logger.blank();
    logger.dimmed('  # PowerShell');
    logger.dimmed('  $env:GITHUB_TOKEN = "your_token_here"');
    logger.blank();
    logger.dimmed('  # Windows CMD');
    logger.dimmed('  set GITHUB_TOKEN=your_token_here');
    logger.blank();

    if (process.env.GITHUB_TOKEN) {
      logger.success('GITHUB_TOKEN is already set in your environment');
    } else {
      logger.warn('GITHUB_TOKEN is not currently set');
    }
  }
}

function checkGhCli(): string | null {
  try {
    const status = execSync('gh auth status 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const match = status.match(/Logged in to github\.com account (\S+)/);
    if (match) return match[1];

    // Try alternative format
    const userOutput = execSync('gh api user --jq .login', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    return userOutput || null;
  } catch {
    return null;
  }
}
