import { existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';

const PROJECT_MARKERS = [
  'package.json', 'pyproject.toml', 'requirements.txt', 'Cargo.toml', 'go.mod',
  'pom.xml', 'build.gradle', 'build.gradle.kts', 'composer.json', 'Gemfile',
  'CMakeLists.txt', 'Makefile', 'pubspec.yaml', 'mix.exs', 'deno.json', 'index.html',
];

function hasProjectMarker(directory: string): boolean {
  if (PROJECT_MARKERS.some(marker => existsSync(join(directory, marker)))) return true;
  try { return readdirSync(directory).some(name => /\.(sln|csproj|fsproj|vbproj)$/i.test(name)); }
  catch { return false; }
}

function findProjects(directory: string, depth: number): string[] {
  if (hasProjectMarker(directory)) return [directory];
  if (depth === 0) return [];
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && !['node_modules', 'vendor', 'dist', 'build'].includes(entry.name))
      .flatMap(entry => findProjects(join(directory, entry.name), depth - 1));
  } catch { return []; }
}

export interface ProjectDirectory {
  root: string;
  discovered: boolean;
}

export function resolveProjectDirectory(startDirectory = process.cwd()): ProjectDirectory {
  const start = resolve(startDirectory);
  if (start.toLowerCase() === resolve(homedir()).toLowerCase()) {
    throw new Error('Refusing to use your home directory as a project. Run autogit from the project folder or a wrapper containing one project.');
  }
  if (hasProjectMarker(start)) return { root: start, discovered: false };

  const children = findProjects(start, 3).filter(path => path !== start);

  return children.length === 1
    ? { root: children[0], discovered: true }
    : { root: start, discovered: false };
}
