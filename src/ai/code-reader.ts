import { existsSync } from 'fs';
import { join } from 'path';
import type { ScanResult } from '../scanner/file-scanner.js';

export interface CodeSummary {
  /** Concatenated content of source files, cleaned and truncated for the AI */
  content: string;
  /** Total source files read */
  filesRead: number;
  /** Total characters sent */
  charCount: number;
}

const IGNORED_PATTERNS = [
  /node_modules/i, /\.git/i, /dist\//i, /build\//i, /__pycache__/i,
  /\.min\.js$/i, /\.map$/i, /\.lock$/i, /package-lock\.json$/i,
];

const SOURCE_EXTS = new Set([
  '.py', '.ts', '.tsx', '.js', '.jsx', '.go', '.rs', '.java',
  '.kt', '.cs', '.rb', '.php', '.swift', '.c', '.cpp', '.h',
  '.vue', '.svelte', '.ex', '.exs',
]);

const MAX_TOTAL_CHARS = 80_000;   // ~20k tokens — enough for the AI to understand the codebase
const MAX_FILE_CHARS  = 60_000;   // single large file cap

/**
 * Read source files and build a compact content string for the AI.
 * Strategy:
 *  1. Read all source files, largest-first (main app files tend to be bigger)
 *  2. For each file strip comments-only lines, blank runs, and CSS/HTML style blocks
 *  3. Concatenate with file headers until the token budget is used up
 */
export async function buildCodeSummary(
  rootDir: string,
  scan: ScanResult
): Promise<CodeSummary> {  const { readFileSync } = await import('fs');

  const sourceFiles = scan.files
    .filter(f =>
      SOURCE_EXTS.has(f.extension) &&
      !IGNORED_PATTERNS.some(p => p.test(f.relativePath))
    )
    .sort((a, b) => b.size - a.size); // largest first — usually the main files

  const parts: string[] = [];
  let totalChars = 0;
  let filesRead = 0;

  for (const file of sourceFiles) {
    if (totalChars >= MAX_TOTAL_CHARS) break;

    let raw: string;
    try {
      // latin1 handles emoji/special chars in Python files without throwing
      raw = readFileSync(file.path, 'latin1');
    } catch { continue; }

    // Strip non-ASCII to make content clean for the AI
    let content = raw.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');

    // Strip large CSS style blocks (common in Streamlit apps)
    content = content.replace(/st\.markdown\s*\(\s*"""[\s\S]*?"""\s*,\s*unsafe_allow_html=True\)/g,
      '# [CSS/HTML block removed for brevity]');

    // Condense runs of blank lines to single blank
    content = content.replace(/\n{3,}/g, '\n\n');

    // Cap individual file
    if (content.length > MAX_FILE_CHARS) {
      content = content.slice(0, MAX_FILE_CHARS) + '\n# ... [truncated]';
    }

    const remaining = MAX_TOTAL_CHARS - totalChars;
    if (content.length > remaining) {
      content = content.slice(0, remaining) + '\n# ... [truncated]';
    }

    parts.push(`\n${'─'.repeat(60)}\n# FILE: ${file.relativePath}\n${'─'.repeat(60)}\n${content}`);
    totalChars += content.length;
    filesRead++;
  }

  return {
    content: parts.join('\n'),
    filesRead,
    charCount: totalChars,
  };
}
