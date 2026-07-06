import { readdirSync, statSync, readFileSync } from 'fs';
import { join, extname, basename } from 'path';

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage',
  '.next', '.cache', 'vendor', 'target', 'obj', 'bin',
  '__pycache__', '.venv', 'venv', '.env', '.idea', '.vscode',
  '.angular', '.svelte-kit', '.nuxt', '.output', '.turbo',
  'bower_components', '.gradle', '.mvn', 'packages',
]);

const IGNORED_FILES = new Set([
  '.DS_Store', 'Thumbs.db', '.gitkeep',
]);

export interface FileEntry {
  path: string;
  relativePath: string;
  name: string;
  extension: string;
  size: number;
  isDirectory: boolean;
}

export interface ScanResult {
  root: string;
  files: FileEntry[];
  directories: string[];
  totalFiles: number;
  totalSize: number;
}

export function scanProject(rootDir: string, maxDepth = 6): ScanResult {
  const files: FileEntry[] = [];
  const directories: string[] = [];
  let totalSize = 0;

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (IGNORED_FILES.has(entry)) continue;
      if (entry.startsWith('.') && IGNORED_DIRS.has(entry)) continue;

      const fullPath = join(dir, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      const relativePath = fullPath.slice(rootDir.length + 1).replace(/\\/g, '/');

      if (stat.isDirectory()) {
        if (IGNORED_DIRS.has(entry)) continue;
        directories.push(relativePath);
        walk(fullPath, depth + 1);
      } else {
        const fileEntry: FileEntry = {
          path: fullPath,
          relativePath,
          name: basename(entry),
          extension: extname(entry).toLowerCase(),
          size: stat.size,
          isDirectory: false,
        };
        files.push(fileEntry);
        totalSize += stat.size;
      }
    }
  }

  walk(rootDir, 0);

  return {
    root: rootDir,
    files,
    directories,
    totalFiles: files.length,
    totalSize,
  };
}

export function readFileContent(filePath: string, maxSize = 100_000): string | null {
  try {
    const stat = statSync(filePath);
    if (stat.size > maxSize) return null;
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export function getFilesByExtension(scan: ScanResult, ext: string): FileEntry[] {
  return scan.files.filter(f => f.extension === ext);
}

export function findFile(scan: ScanResult, name: string): FileEntry | undefined {
  return scan.files.find(f => f.name.toLowerCase() === name.toLowerCase());
}

export function findFiles(scan: ScanResult, pattern: RegExp): FileEntry[] {
  return scan.files.filter(f => pattern.test(f.name));
}
