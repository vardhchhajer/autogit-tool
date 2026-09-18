import { existsSync, mkdirSync } from 'fs';
import { createRequire } from 'module';
import { delimiter, dirname, join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getConfigDir } from '../utils/platform.js';

const run = promisify(execFile);

function runtimeDirectory(): string {
  return join(getConfigDir(), 'brag-runtime');
}

function managedNodePath(directory: string): string {
  return join(directory, 'node_modules', 'node', 'bin', process.platform === 'win32' ? 'node.exe' : 'node');
}

function managedFfmpegPath(directory: string): string | null {
  try {
    const requireFromRuntime = createRequire(join(directory, 'package.json'));
    const path = requireFromRuntime('ffmpeg-static') as string | null;
    return path && existsSync(path) ? path : null;
  } catch { return null; }
}

async function installedPath(command: string): Promise<string | null> {
  try {
    const finder = process.platform === 'win32' ? 'where.exe' : 'which';
    const { stdout } = await run(finder, [command], { timeout: 10_000, windowsHide: true });
    return stdout.split(/\r?\n/).map(line => line.trim()).find(Boolean) || null;
  } catch { return null; }
}

export interface BragRuntime { pathPrefix: string; nodePath: string; ffmpegPath: string }

export async function ensureBragRuntime(): Promise<BragRuntime> {
  const directory = runtimeDirectory();
  const hasSystemNode = Number(process.versions.node.split('.')[0]) >= 22;
  let nodePath = hasSystemNode ? process.execPath : managedNodePath(directory);
  let ffmpegPath = await installedPath('ffmpeg') || managedFfmpegPath(directory);

  if (!existsSync(nodePath) || !ffmpegPath) {
    mkdirSync(directory, { recursive: true });
    // npm --no-save can prune an earlier package, so always request the full managed set.
    const packages = [
      ...(!hasSystemNode ? ['node@22'] : []),
      ...(!(await installedPath('ffmpeg')) ? ['ffmpeg-static'] : []),
    ];
    const env: NodeJS.ProcessEnv = {};
    for (const name of ['PATH', 'Path', 'PATHEXT', 'ComSpec', 'SystemRoot', 'WINDIR', 'USERPROFILE', 'HOME', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'TMPDIR', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'NODE_EXTRA_CA_CERTS', 'npm_config_registry']) {
      if (process.env[name] !== undefined) env[name] = process.env[name];
    }
    const executable = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
    const args = process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npm.cmd', 'install', '--prefix', directory, '--no-save', '--no-audit', '--no-fund', ...packages]
      : ['install', '--prefix', directory, '--no-save', '--no-audit', '--no-fund', ...packages];
    await run(executable, args, { env, timeout: 300_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
    nodePath = hasSystemNode ? process.execPath : managedNodePath(directory);
    ffmpegPath = await installedPath('ffmpeg') || managedFfmpegPath(directory);
  }

  if (!existsSync(nodePath)) throw new Error('AutoGit could not install the Node 22 runtime for Brag.');
  if (!ffmpegPath) throw new Error('AutoGit could not install FFmpeg for Brag.');
  const { stdout } = await run(nodePath, ['--version'], { timeout: 10_000, windowsHide: true });
  if (Number(stdout.trim().replace(/^v/, '').split('.')[0]) < 22) throw new Error('Brag needs Node 22 or newer.');
  return { nodePath, ffmpegPath, pathPrefix: [dirname(nodePath), dirname(ffmpegPath)].join(delimiter) };
}
