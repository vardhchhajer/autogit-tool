import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import { pathToFileURL } from 'url';

export type LogLevel = 'verbose' | 'normal' | 'quiet';

let currentLevel: LogLevel = 'normal';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

export const logger = {
  brand(version?: string): void {
    if (currentLevel === 'quiet') return;
    const logo = [
      '   ___         __       _______ __',
      '  / _ | __ __ / /____  / ___(_) /_',
      ' / __ |/ // // __/ _ \\/ (_ / / __/',
      '/_/ |_|\\_,_/ \\__/\\___/\\___/_/\\__/',
    ];
    console.log();
    console.log(chalk.cyan.bold(logo.join('\n')));
    console.log(chalk.gray(`  Ship the project, not the busywork${version ? `  v${version}` : ''}`));
    console.log();
  },

  info(msg: string): void {
    if (currentLevel === 'quiet') return;
    console.log(chalk.blue('ℹ') + ' ' + msg);
  },

  success(msg: string): void {
    if (currentLevel === 'quiet') return;
    console.log(chalk.green('✔') + ' ' + msg);
  },

  warn(msg: string): void {
    console.log(chalk.yellow('⚠') + ' ' + chalk.yellow(msg));
  },

  error(msg: string): void {
    console.error(chalk.red('✖') + ' ' + chalk.red(msg));
  },

  step(msg: string): void {
    if (currentLevel === 'quiet') return;
    console.log(chalk.cyan('→') + ' ' + msg);
  },

  verbose(msg: string): void {
    if (currentLevel !== 'verbose') return;
    console.log(chalk.gray('  ' + msg));
  },

  blank(): void {
    if (currentLevel === 'quiet') return;
    console.log();
  },

  header(msg: string): void {
    if (currentLevel === 'quiet') return;
    console.log();
    console.log(chalk.bold.white(msg));
    console.log(chalk.gray('─'.repeat(Math.min(msg.length + 4, 60))));
  },

  dimmed(msg: string): void {
    if (currentLevel === 'quiet') return;
    console.log(chalk.gray(msg));
  },

  highlight(msg: string): void {
    if (currentLevel === 'quiet') return;
    console.log(chalk.bold.cyan(msg));
  },

  path(label: string, path: string): void {
    if (currentLevel === 'quiet') return;
    const display = chalk.cyan.underline(path);
    const linked = process.stdout.isTTY
      ? `\u001B]8;;${pathToFileURL(path).href}\u0007${display}\u001B]8;;\u0007`
      : path;
    console.log(`${chalk.blue('ℹ')} ${label}: ${linked}`);
  },

  box(title: string, content: string): void {
    if (currentLevel === 'quiet') return;
    const lines = content.split('\n');
    const maxLen = Math.max(title.length, ...lines.map(l => l.length));
    const border = '─'.repeat(maxLen + 2);
    console.log();
    console.log(chalk.gray(`┌${border}┐`));
    console.log(chalk.gray('│ ') + chalk.bold.white(title.padEnd(maxLen)) + chalk.gray(' │'));
    console.log(chalk.gray(`├${border}┤`));
    for (const line of lines) {
      console.log(chalk.gray('│ ') + line.padEnd(maxLen) + chalk.gray(' │'));
    }
    console.log(chalk.gray(`└${border}┘`));
  }
};

export function spinner(text: string): Ora {
  if (currentLevel === 'quiet') {
    return ora({ text, isSilent: true });
  }
  return ora({ text, color: 'cyan' });
}
