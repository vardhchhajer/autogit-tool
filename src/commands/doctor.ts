import chalk from 'chalk';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { getConfigPath } from '../utils/platform.js';
import { getGitHubToken, getAIConfig } from '../config/manager.js';
import { logger } from '../utils/logger.js';

interface Check {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

export async function cmdDoctor(): Promise<void> {
  logger.header('AutoGit Doctor');
  logger.dimmed('Checking setup and dependencies...');
  logger.blank();

  const checks: Check[] = [];

  // Check Git
  checks.push(checkCommand('git', 'Git'));

  // Check Node.js
  checks.push(checkCommand('node', 'Node.js'));

  // Check GitHub CLI
  checks.push(checkCommand('gh', 'GitHub CLI (optional)'));

  // Check config file
  checks.push({
    name: 'Config file',
    status: existsSync(getConfigPath()) ? 'pass' : 'warn',
    message: existsSync(getConfigPath()) ? 'Found at ~/.autogit/config.json' : 'Not created yet (run "autogit config")',
  });

  // Check GitHub token
  const ghToken = getGitHubToken();
  checks.push({
    name: 'GitHub token',
    status: ghToken ? 'pass' : 'warn',
    message: ghToken ? 'Configured' : 'Not set (run "autogit login" or set GITHUB_TOKEN)',
  });

  // Check AI provider
  const aiConfig = getAIConfig();
  const hasAnyAI = !!(aiConfig.openaiKey || aiConfig.anthropicKey || aiConfig.geminiKey || aiConfig.openrouterKey);
  checks.push({
    name: 'AI provider',
    status: hasAnyAI ? 'pass' : 'warn',
    message: hasAnyAI ? `Configured: ${aiConfig.provider}` : 'Not configured (set API key for AI features)',
  });

  // Display results
  for (const check of checks) {
    const icon = check.status === 'pass' ? chalk.green('✔') :
                 check.status === 'warn' ? chalk.yellow('⚠') :
                 chalk.red('✖');
    console.log(`${icon} ${chalk.bold(check.name)}: ${check.message}`);
  }

  const failures = checks.filter(c => c.status === 'fail');
  const warnings = checks.filter(c => c.status === 'warn');

  logger.blank();
  if (failures.length === 0) {
    logger.success('All required checks passed!');
  } else {
    logger.error(`${failures.length} check(s) failed. Fix these before using AutoGit.`);
  }
  if (warnings.length > 0) {
    logger.dimmed(`${warnings.length} optional check(s) need attention for full functionality.`);
  }
}

function checkCommand(cmd: string, name: string): Check {
  try {
    const version = execSync(`${cmd} --version`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const shortVersion = version.split('\n')[0].slice(0, 50);
    return { name, status: 'pass', message: shortVersion };
  } catch {
    return { name, status: cmd === 'gh' ? 'warn' : 'fail', message: 'Not found' };
  }
}
