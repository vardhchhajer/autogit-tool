#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { setLogLevel } from './utils/logger.js';
import { runMainPipeline } from './pipeline/main-pipeline.js';
import { cmdInit } from './commands/init.js';
import { cmdDocs } from './commands/docs.js';
import { cmdReadme } from './commands/readme.js';
import { cmdPublish } from './commands/publish.js';
import { cmdGithub } from './commands/github.js';
import { cmdLinkedin } from './commands/linkedin.js';
import { cmdRelease } from './commands/release.js';
import { cmdAnalyze } from './commands/analyze.js';
import { cmdDoctor } from './commands/doctor.js';
import { cmdConfig } from './commands/config.js';
import { cmdLogin } from './commands/login.js';
import { cmdResume } from './commands/resume.js';
import { createRequire } from 'module';
import { registerOctokitReset } from './config/manager.js';
import { resetOctokitCache } from './services/github-service.js';

const _require = createRequire(import.meta.url);
const pkg = _require('../package.json') as { version: string };

// Wire Octokit cache reset whenever config is saved
registerOctokitReset(resetOctokitCache);

const program = new Command();

program
  .name('autogit')
  .version(pkg.version)
  .description('Automate project documentation, GitHub publishing, and social media content generation')
  .option('--yes', 'Skip all confirmation prompts')
  .option('--dry-run', 'Preview changes without applying them')
  .option('--verbose', 'Show detailed output')
  .option('--quiet', 'Suppress non-essential output')
  .option('--private', 'Create private GitHub repository')
  .option('--public', 'Create public GitHub repository')
  .option('--skip-readme', 'Skip README generation')
  .option('--skip-linkedin', 'Skip LinkedIn post generation')
  .option('--skip-github', 'Skip GitHub operations')
  .option('--skip-resume', 'Skip resume auto-update')
  .option('--no-ai', 'Disable AI-powered generation')
  .option('--force', 'Force overwrite existing files')
  .option('--regenerate', 'Regenerate existing documentation')
  .action(async (opts) => {
    setupLogLevel(opts);
    try {
      await runMainPipeline({
        yes: opts.yes,
        dryRun: opts.dryRun,
        skipReadme: opts.skipReadme,
        skipLinkedin: opts.skipLinkedin,
        skipGithub: opts.skipGithub,
        skipResume: opts.skipResume,
        noAI: !opts.ai,
        force: opts.force,
        regenerate: opts.regenerate,
        private: opts.private,
        public: opts.public,
      });
    } catch (error: any) {
      handleError(error);
    }
  });

program
  .command('init')
  .description('Initialize AutoGit in the current project')
  .action(async () => {
    try { await cmdInit(); } catch (e: any) { handleError(e); }
  });

program
  .command('docs')
  .description('Generate project documentation')
  .option('--regenerate', 'Regenerate existing docs')
  .option('--no-ai', 'Disable AI generation')
  .action(async (opts) => {
    try { await cmdDocs(opts); } catch (e: any) { handleError(e); }
  });

program
  .command('readme')
  .description('Generate or update README')
  .option('--regenerate', 'Force regenerate README')
  .option('--no-ai', 'Disable AI generation')
  .action(async (opts) => {
    try { await cmdReadme(opts); } catch (e: any) { handleError(e); }
  });

program
  .command('publish')
  .description('Commit and push to GitHub')
  .option('--yes', 'Skip confirmations')
  .option('--private', 'Create private repository')
  .action(async (opts) => {
    try { await cmdPublish(opts); } catch (e: any) { handleError(e); }
  });

program
  .command('github')
  .description('GitHub repository operations')
  .option('--create', 'Create repository')
  .option('--private', 'Private repository')
  .action(async (opts) => {
    try { await cmdGithub(opts); } catch (e: any) { handleError(e); }
  });

program
  .command('linkedin')
  .description('Generate LinkedIn posts')
  .option('--no-ai', 'Use template generation')
  .action(async (opts) => {
    try { await cmdLinkedin(opts); } catch (e: any) { handleError(e); }
  });

program
  .command('release')
  .description('Create a GitHub release')
  .option('--tag <tag>', 'Release tag')
  .option('--draft', 'Create as draft')
  .action(async (opts) => {
    try { await cmdRelease(opts); } catch (e: any) { handleError(e); }
  });

program
  .command('analyze')
  .description('Analyze project and show insights')
  .option('--no-ai', 'Static analysis only')
  .action(async (opts) => {
    try { await cmdAnalyze(opts); } catch (e: any) { handleError(e); }
  });

program
  .command('doctor')
  .description('Check AutoGit setup and dependencies')
  .action(async () => {
    try { await cmdDoctor(); } catch (e: any) { handleError(e); }
  });

program
  .command('config')
  .description('Manage AutoGit configuration')
  .option('--set <key=value>', 'Set a configuration value')
  .option('--get <key>', 'Get a configuration value')
  .option('--list', 'List all configuration')
  .option('--test', 'Verify the active AI provider key works')
  .option('--debug', 'Show stored key details for troubleshooting')
  .action(async (opts) => {
    try { await cmdConfig(opts); } catch (e: any) { handleError(e); }
  });

program
  .command('resume')
  .description('Update your LaTeX resume with the current project')
  .option('--setup', 'Configure resume file path and owner info')
  .option('--show', 'Show current resume configuration')
  .option('--no-ai', 'Use template instead of AI for bullet generation')
  .action(async (opts) => {
    try { await cmdResume(opts); } catch (e: any) { handleError(e); }
  });

program
  .command('login')
  .description('Authenticate with GitHub')
  .option('--check', 'Show which token source is active and verify it')
  .action(async () => {
    try { await cmdLogin(); } catch (e: any) { handleError(e); }
  });

function setupLogLevel(opts: any): void {
  if (opts.verbose) setLogLevel('verbose');
  else if (opts.quiet) setLogLevel('quiet');
}

function handleError(error: Error): void {
  console.error(chalk.red(`\n✖ Error: ${error.message}`));
  if (process.env.AUTOGIT_DEBUG) {
    console.error(error.stack);
  }
  process.exit(1);
}

program.parse();
