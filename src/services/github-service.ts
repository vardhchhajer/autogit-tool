import { Octokit } from 'octokit';
import { getGitHubToken } from '../config/manager.js';
import { logger } from '../utils/logger.js';

export interface RepoInfo {
  name: string;
  fullName: string;
  description: string;
  url: string;
  htmlUrl: string;
  cloneUrl: string;
  sshUrl: string;
  private: boolean;
  defaultBranch: string;
}

export interface CreateRepoOptions {
  name: string;
  description?: string;
  isPrivate?: boolean;
  topics?: string[];
  homepage?: string;
}

let octokitInstance: Octokit | null = null;

function getOctokit(): Octokit {
  if (octokitInstance) return octokitInstance;

  const token = getGitHubToken();
  if (!token) {
    throw new Error(
      'GitHub token not found. Set GITHUB_TOKEN environment variable, ' +
      'run "autogit login", or configure via "autogit config".'
    );
  }

  octokitInstance = new Octokit({ auth: token });
  return octokitInstance;
}

export async function getAuthenticatedUser(): Promise<{ login: string; name: string | null }> {
  const octokit = getOctokit();
  const { data } = await octokit.rest.users.getAuthenticated();
  return { login: data.login, name: data.name };
}

export async function repoExists(owner: string, repo: string): Promise<boolean> {
  const octokit = getOctokit();
  try {
    await octokit.rest.repos.get({ owner, repo });
    return true;
  } catch (error: any) {
    if (error.status === 404) return false;
    throw error;
  }
}

export async function createRepo(options: CreateRepoOptions): Promise<RepoInfo> {
  const octokit = getOctokit();

  const { data } = await octokit.rest.repos.createForAuthenticatedUser({
    name: options.name,
    description: options.description || '',
    private: options.isPrivate ?? false,
    auto_init: false,
  });

  // Set topics if provided
  if (options.topics && options.topics.length > 0) {
    const user = await getAuthenticatedUser();
    await octokit.rest.repos.replaceAllTopics({
      owner: user.login,
      repo: options.name,
      names: options.topics.slice(0, 20), // GitHub limit
    });
  }

  return {
    name: data.name,
    fullName: data.full_name,
    description: data.description || '',
    url: data.url,
    htmlUrl: data.html_url,
    cloneUrl: data.clone_url,
    sshUrl: data.ssh_url,
    private: data.private,
    defaultBranch: data.default_branch,
  };
}

export async function getRepo(owner: string, repo: string): Promise<RepoInfo> {
  const octokit = getOctokit();
  const { data } = await octokit.rest.repos.get({ owner, repo });

  return {
    name: data.name,
    fullName: data.full_name,
    description: data.description || '',
    url: data.url,
    htmlUrl: data.html_url,
    cloneUrl: data.clone_url,
    sshUrl: data.ssh_url,
    private: data.private,
    defaultBranch: data.default_branch,
  };
}

export async function updateRepo(
  owner: string,
  repo: string,
  updates: { description?: string; homepage?: string; topics?: string[] }
): Promise<void> {
  const octokit = getOctokit();

  if (updates.description || updates.homepage) {
    await octokit.rest.repos.update({
      owner,
      repo,
      description: updates.description,
      homepage: updates.homepage,
    });
  }

  if (updates.topics) {
    await octokit.rest.repos.replaceAllTopics({
      owner,
      repo,
      names: updates.topics.slice(0, 20),
    });
  }
}

export async function createRelease(
  owner: string,
  repo: string,
  options: {
    tag: string;
    name: string;
    body: string;
    draft?: boolean;
    prerelease?: boolean;
  }
): Promise<{ htmlUrl: string }> {
  const octokit = getOctokit();

  const { data } = await octokit.rest.repos.createRelease({
    owner,
    repo,
    tag_name: options.tag,
    name: options.name,
    body: options.body,
    draft: options.draft ?? false,
    prerelease: options.prerelease ?? false,
  });

  return { htmlUrl: data.html_url };
}

export function generateTopics(analysis: any): string[] {
  const topics: string[] = [];

  // Add languages (lowercase)
  for (const lang of analysis.languages.slice(0, 5)) {
    topics.push(lang.toLowerCase().replace(/[^a-z0-9-]/g, ''));
  }

  // Add frameworks
  for (const fw of analysis.frameworks.slice(0, 5)) {
    const normalized = fw.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    if (normalized.length <= 35) topics.push(normalized);
  }

  // Deduplicate and limit
  return [...new Set(topics)].slice(0, 15);
}

export function isGitHubConfigured(): boolean {
  return !!getGitHubToken();
}
