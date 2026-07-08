import type { ScanResult } from '../scanner/file-scanner.js';
import { getAIConfig } from '../config/manager.js';

export interface CodeSummary {
  content: string;
  filesRead: number;
  charCount: number;
}

const IGNORED_PATTERNS = [
  /node_modules/i, /\.git/i, /dist\//i, /build\//i, /__pycache__/i,
  /\.min\.js$/i, /\.map$/i, /\.lock$/i, /package-lock\.json$/i,
];

const SOURCE_EXTS = new Set([
  '.py', '.ts', '.tsx', '.js', '.jsx', '.go', '.rs', '.java',
  '.kt', '.cs', '.rb', '.php', '.swift', '.vue', '.svelte',
]);

// Generous providers (Gemini, OpenAI, Anthropic, etc.) get full content
// Conservative providers (Groq free tier) get reduced content
const GENEROUS_PROVIDERS = new Set(['gemini', 'openai', 'anthropic', 'openrouter', 'mistral', 'deepseek', 'azure-openai', 'xai']);

function getTokenBudget(): { maxTotal: number; maxFile: number } {
  const cfg = getAIConfig();
  const isGenerous = GENEROUS_PROVIDERS.has(cfg.provider as string);
  return isGenerous
    ? { maxTotal: 160_000, maxFile: 120_000 }  // ~40k tokens — Gemini handles 1M/day
    : { maxTotal: 22_000,  maxFile: 18_000 };   // ~5k tokens — Groq 12k TPM safe
}

/**
 * Build a smart code summary — extracts meaningful logic, strips boilerplate.
 *
 * For Python: keeps imports, constants, and each function with its docstring
 *   + first 30 lines of body. Skips pure UI rendering functions.
 * For JS/TS: keeps imports, type definitions, and exported functions.
 * Result stays under ~7k tokens so it works on Groq free tier.
 */
export async function buildCodeSummary(
  rootDir: string,
  scan: ScanResult
): Promise<CodeSummary> {
  const { readFileSync } = await import('fs');

  const { maxTotal, maxFile } = getTokenBudget();

  const sourceFiles = scan.files
    .filter(f =>
      SOURCE_EXTS.has(f.extension) &&
      !IGNORED_PATTERNS.some(p => p.test(f.relativePath))
    )
    .sort((a, b) => b.size - a.size);

  const parts: string[] = [];
  let totalChars = 0;
  let filesRead = 0;

  for (const file of sourceFiles) {
    if (totalChars >= maxTotal) break;

    let raw: string;
    try {
      raw = readFileSync(file.path, 'latin1');
    } catch { continue; }

    raw = raw.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');

    // Strip Streamlit CSS/HTML style blocks
    raw = raw
      .replace(/st\.markdown\s*\(\s*f?"""[\s\S]*?"""\s*,\s*unsafe_allow_html=True\)/g, '# [style block]')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\n{3,}/g, '\n\n');

    let content: string;
    if (file.extension === '.py') {
      content = extractPythonCore(raw, maxTotal);
    } else if (['.ts', '.tsx', '.js', '.jsx'].includes(file.extension)) {
      content = extractJSCore(raw);
    } else {
      content = raw.slice(0, 6000);
    }

    const remaining = maxTotal - totalChars;
    if (content.length > remaining) content = content.slice(0, remaining) + '\n# [truncated]';
    if (content.length > maxFile) content = content.slice(0, maxFile) + '\n# [truncated]';
    if (!content.trim()) continue;

    parts.push(`\n${'─'.repeat(50)}\n# FILE: ${file.relativePath}\n${'─'.repeat(50)}\n${content}`);
    totalChars += content.length;
    filesRead++;
  }

  return { content: parts.join('\n'), filesRead, charCount: totalChars };
}

/**
 * Python: imports + constants + each function (docstring + first 30 body lines)
 * Skips functions that are >40% st.markdown/HTML rendering calls.
 */
function extractPythonCore(raw: string, maxTotal: number): string {
  // For generous providers (Gemini etc.) — return the full cleaned file
  if (maxTotal > 50_000) {
    return raw;
  }
  const lines = raw.split('\n');
  const out: string[] = [];

  // Imports
  const imports = lines.filter(l => l.match(/^(?:import|from)\s+\w/)).slice(0, 20);
  if (imports.length) { out.push('# Imports:', ...imports, ''); }

  // Module-level constants
  const constants = lines
    .filter(l => l.match(/^[A-Z_]{2,}\s*=/) || l.match(/^[a-z_]+\s*=\s*["'\d\[\{]/))
    .slice(0, 8);
  if (constants.length) { out.push('# Constants:', ...constants, ''); }

  // Functions
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const funcMatch = line.match(/^(async\s+)?def ([a-zA-Z_]\w*)\s*\(/);

    if (!funcMatch) { i++; continue; }

    const funcLines: string[] = [line];
    i++;

    let bodyLines = 0;
    let docDone = false;
    let inDoc = false;
    let docChar = '';

    while (i < lines.length) {
      const bl = lines[i];
      if (bl.match(/^(async\s+)?def |^class /)) break;

      funcLines.push(bl);
      i++;

      // Track docstring end
      if (!docDone) {
        if (!inDoc && (bl.trimStart().startsWith('"""') || bl.trimStart().startsWith("'''"))) {
          inDoc = true;
          docChar = bl.includes('"""') ? '"""' : "'''";
          if ((bl.split(docChar).length - 1) >= 2) { inDoc = false; docDone = true; }
        } else if (inDoc && bl.includes(docChar)) {
          inDoc = false; docDone = true;
        }
      } else {
        bodyLines++;
        if (bodyLines > 30) {
          funcLines.push('    # [body continues...]');
          while (i < lines.length && !lines[i].match(/^(async\s+)?def |^class /)) i++;
          break;
        }
      }
    }

    // Skip pure UI rendering functions
    const uiLines = funcLines.filter(l =>
      l.includes('st.markdown') || l.includes('unsafe_allow_html') || l.includes('html_block')
    ).length;
    if (uiLines > funcLines.length * 0.4 && funcLines.length > 10) {
      out.push(`# [UI rendering function ${funcMatch[2]}() skipped]`, '');
      continue;
    }

    out.push(...funcLines, '');
  }

  return out.join('\n');
}

/**
 * JS/TS: imports + type definitions + exported functions (first 25 lines each)
 */
function extractJSCore(raw: string): string {
  const lines = raw.split('\n');
  const out: string[] = [];

  const imports = lines.filter(l => l.match(/^import\s/)).slice(0, 20);
  if (imports.length) { out.push(...imports, ''); }

  const types = lines
    .filter(l => l.match(/^(?:export\s+)?(?:interface|type|enum)\s/))
    .slice(0, 15);
  if (types.length) { out.push('// Types:', ...types, ''); }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const isExport =
      line.match(/^export\s+(?:async\s+)?function\s/) ||
      line.match(/^export\s+(?:default\s+)?class\s/) ||
      line.match(/^export\s+const\s+\w+\s*=\s*(?:async\s+)?\(/) ||
      line.match(/^(?:async\s+)?function\s+[A-Z]/);

    if (!isExport) { i++; continue; }

    const block = [line];
    i++;
    let depth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    let bodyLines = 0;

    while (i < lines.length && bodyLines < 25) {
      const bl = lines[i];
      depth += (bl.match(/\{/g) || []).length - (bl.match(/\}/g) || []).length;
      block.push(bl);
      i++;
      bodyLines++;
      if (depth <= 0) break;
    }

    if (depth > 0) block.push('  // [truncated]');
    out.push(...block, '');
  }

  return out.join('\n');
}
