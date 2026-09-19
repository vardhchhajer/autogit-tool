import { existsSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const PROJECT_MARKERS = [
  'package.json', 'pyproject.toml', 'requirements.txt', 'Cargo.toml', 'go.mod',
  'pom.xml', 'build.gradle', 'build.gradle.kts', 'composer.json', 'Gemfile',
];

function hasProjectMarker(directory: string): boolean {
  return PROJECT_MARKERS.some(marker => existsSync(join(directory, marker)));
}

export interface ProjectDirectory {
  root: string;
  discovered: boolean;
}

export function resolveProjectDirectory(startDirectory = process.cwd()): ProjectDirectory {
  const start = resolve(startDirectory);
  if (hasProjectMarker(start)) return { root: start, discovered: false };

  let children: string[] = [];
  try {
    children = readdirSync(start)
      .map(name => join(start, name))
      .filter(path => {
        try { return statSync(path).isDirectory() && hasProjectMarker(path); }
        catch { return false; }
      });
  } catch { /* keep the requested directory */ }

  return children.length === 1
    ? { root: children[0], discovered: true }
    : { root: start, discovered: false };
}
