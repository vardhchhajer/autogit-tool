import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { delimiter, join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';

const run = promisify(execFile);

export type CodingAgent = 'codex' | 'claude-code' | 'antigravity';

const COMMANDS: Record<CodingAgent, string> = {
  codex: 'codex',
  'claude-code': 'claude',
  antigravity: 'agy',
};

export interface AgentPromptLaunch {
  executable: string;
  args: string[];
  input: string;
  output: 'text' | 'antigravity-stream';
}

export function buildAgentPromptLaunch(agent: CodingAgent, prompt: string, timeout = '5m'): AgentPromptLaunch {
  if (agent === 'codex') return { executable: 'codex', args: ['exec', '-'], input: prompt, output: 'text' };
  if (agent === 'claude-code') return { executable: 'claude', args: ['-p'], input: prompt, output: 'text' };
  return {
    executable: 'agy',
    args: ['--input-format', 'stream-json', '--output-format', 'stream-json', '--print-timeout', timeout],
    input: `${JSON.stringify({ event: 'user', message: { content: prompt } })}\n`,
    output: 'antigravity-stream',
  };
}

function parseAgentOutput(launch: AgentPromptLaunch, stdout: string): string {
  if (launch.output === 'text') return stdout.trim();
  const events = stdout.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const result = [...events].reverse().find(event => event.event === 'result')?.result;
  if (!result) throw new Error('antigravity returned no result event');
  if (result.status !== 'SUCCESS') throw new Error(result.error || `antigravity finished with status ${result.status}`);
  return String(result.response || '').trim();
}

export async function resolveAgentExecutable(agent: CodingAgent, pathPrefix = ''): Promise<string | null> {
  const env = { ...process.env };
  if (pathPrefix) {
    env.PATH = `${pathPrefix}${delimiter}${env.Path || env.PATH || ''}`;
    if (process.platform === 'win32') env.Path = env.PATH;
  }
  try {
    const finder = process.platform === 'win32' ? 'where.exe' : 'which';
    const result = await run(finder, [COMMANDS[agent]], { timeout: 10_000, windowsHide: true, env });
    const paths = result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const native = paths.find(path => !/\.(cmd|bat)$/i.test(path));
    return native || paths[0] || null;
  } catch {
    if (agent !== 'antigravity') return null;
    const installed = process.platform === 'win32'
      ? join(process.env.LOCALAPPDATA || homedir(), 'agy', 'bin', 'agy.exe')
      : join(homedir(), '.local', 'bin', 'agy');
    return existsSync(installed) ? installed : null;
  }
}

export async function runAgentPrompt(
  agent: CodingAgent,
  prompt: string,
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs?: number; maxBuffer?: number },
): Promise<string> {
  const executablePath = await resolveAgentExecutable(agent);
  if (!executablePath) {
    const error = new Error(`${agent} is not installed. Run autogit setup to install and sign in.`) as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    throw error;
  }

  const launch = buildAgentPromptLaunch(agent, prompt);
  const isBatch = process.platform === 'win32' && /\.(cmd|bat)$/i.test(executablePath);
  const executable = isBatch ? (process.env.ComSpec || 'cmd.exe') : executablePath;
  const args = isBatch ? ['/d', '/s', '/c', executablePath, ...launch.args] : launch.args;
  const maxBuffer = options.maxBuffer ?? 4 * 1024 * 1024;

  return await new Promise<string>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputSize = 0;
    let settled = false;
    const timer = setTimeout(() => {
      child.kill();
      if (!settled) reject(new Error(`${agent} timed out after ${options.timeoutMs ?? 360_000}ms`));
      settled = true;
    }, options.timeoutMs ?? 360_000);

    child.stdout.on('data', chunk => {
      outputSize += chunk.length;
      if (outputSize <= maxBuffer) stdout.push(chunk);
      else child.kill();
    });
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.once('error', error => {
      clearTimeout(timer);
      if (!settled) reject(error);
      settled = true;
    });
    child.once('exit', code => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (outputSize > maxBuffer) return reject(new Error(`${agent} output exceeded ${maxBuffer} bytes`));
      const errorText = Buffer.concat(stderr).toString('utf8').trim();
      if (code !== 0) return reject(new Error(errorText || `${agent} exited with code ${code}`));
      try { resolve(parseAgentOutput(launch, Buffer.concat(stdout).toString('utf8'))); }
      catch (error) { reject(error); }
    });
    child.stdin.end(launch.input);
  });
}
