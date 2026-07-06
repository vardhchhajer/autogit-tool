import { platform, homedir } from 'os';
import { join } from 'path';

export function isWindows(): boolean {
  return platform() === 'win32';
}

export function isMacOS(): boolean {
  return platform() === 'darwin';
}

export function isLinux(): boolean {
  return platform() === 'linux';
}

export function getConfigDir(): string {
  return join(homedir(), '.autogit');
}

export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

export function getShell(): string {
  if (isWindows()) {
    return process.env.COMSPEC || 'cmd.exe';
  }
  return process.env.SHELL || '/bin/sh';
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}
