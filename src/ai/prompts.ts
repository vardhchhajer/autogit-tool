import type { ProjectAnalysis } from '../scanner/project-analyzer.js';

export function buildProjectContext(analysis: ProjectAnalysis): string {
  return `
Project: ${analysis.name}
${analysis.description ? `Description: ${analysis.description}` : ''}
${analysis.version ? `Version: ${analysis.version}` : ''}

Languages: ${analysis.languages.join(', ') || 'None detected'}
Frameworks: ${analysis.frameworks.join(', ') || 'None detected'}
Libraries: ${analysis.libraries.join(', ') || 'None detected'}
Package Manager: ${analysis.packageManager || 'Unknown'}
Build System: ${analysis.buildSystem || 'Unknown'}
Architecture: ${analysis.architecture}
Database: ${analysis.database.join(', ') || 'None detected'}
Test Framework: ${analysis.testFramework || 'None detected'}
Deployment: ${analysis.deployment.join(', ') || 'None detected'}
CI/CD: ${analysis.cicd.join(', ') || 'None'}
License: ${analysis.license || 'None'}
APIs: ${analysis.apis.length > 0 ? analysis.apis.join(', ') : 'None detected'}
Environment Variables: ${analysis.envVars.length > 0 ? analysis.envVars.join(', ') : 'None detected'}
`.trim();
}

export function readmeGenerationPrompt(analysis: ProjectAnalysis, existingReadme?: string): string {
  const context = buildProjectContext(analysis);

  if (existingReadme) {
    return `You are a technical documentation expert. Improve the following README for the project described below.

PROJECT CONTEXT:
${context}

EXISTING README:
${existingReadme}

INSTRUCTIONS:
- Preserve all existing custom content, badges, images, and links.
- Improve formatting and structure.
- Fill in missing sections: Features, Installation (with clear clone/install/run steps), Configuration (if env vars), Usage, Contributing.
- Update outdated information based on the project context.
- Do NOT invent features not supported by the project context.
- Do NOT overwrite custom sections the user has written.
- Use professional Markdown formatting.
- Return ONLY the improved README content, no explanations.`;
  }

  return `You are a technical documentation expert. Generate a professional README.md for the following project.

PROJECT CONTEXT:
${context}

INSTRUCTIONS:
- Include these sections in order: Title, Description, Features, Tech Stack, Installation, Configuration (if env vars exist), Usage, API Documentation (if APIs detected), Contributing, License.
- Installation: Show clear step-by-step commands (clone → cd → install dependencies → run).
- Usage: Include the main command to run the project (npm start, cargo run, python main.py, etc.).
- Configuration: If environment variables exist, show a .env example.
- Only include sections relevant to this project based on the context above.
- Do NOT invent features, APIs, or capabilities not mentioned in the project context.
- Use professional Markdown formatting with proper headings, code blocks, and lists.
- Make the README informative, concise, and developer-friendly.
- Return ONLY the README content, no explanations or preamble.`;
}

export function commitMessagePrompt(changes: string): string {
  return `Generate a concise git commit message following Conventional Commits format for these changes:

${changes}

Rules:
- Use format: type(scope): description
- Types: feat, fix, docs, refactor, chore, style, test, build, ci, perf
- Keep the first line under 72 characters.
- Be specific about what changed.
- Return ONLY the commit message, nothing else.`;
}

export function linkedinPostPrompt(analysis: ProjectAnalysis, style: 'short' | 'medium' | 'long'): string {
  const context = buildProjectContext(analysis);

  const lengthGuide = {
    short: '3-5 sentences, punchy and direct',
    medium: '1-2 paragraphs, balanced detail',
    long: '3-4 paragraphs, detailed narrative',
  };

  return `Generate a professional LinkedIn post announcing the project described below.

PROJECT CONTEXT:
${context}

STYLE: ${style} (${lengthGuide[style]})

INCLUDE:
- Attention-grabbing opening hook
- What problem the project solves
- Key features/technologies
- A development highlight or lesson learned
- [GITHUB_LINK] placeholder for the repo URL
- Call to action
- 3-5 relevant hashtags at the end

Return ONLY the LinkedIn post text, no explanations.`;
}

export function twitterPostPrompt(analysis: ProjectAnalysis): string {
  const context = buildProjectContext(analysis);

  return `Generate a concise X (Twitter) post (max 280 characters) announcing this project:

PROJECT CONTEXT:
${context}

Include:
- What it does in one line
- 1-2 key technologies
- [GITHUB_LINK] placeholder
- 2-3 hashtags

Return ONLY the tweet text, no explanations.`;
}

export function projectSummaryPrompt(analysis: ProjectAnalysis): string {
  const context = buildProjectContext(analysis);

  return `Generate a PROJECT_SUMMARY.md for the following project. This should be a concise technical overview for developers.

PROJECT CONTEXT:
${context}

Include:
- Overview (2-3 sentences)
- Key Technologies
- Architecture overview
- Main features
- Development setup (brief)
- Key design decisions (inferred from tech stack)

Return ONLY the Markdown content.`;
}

export function architectureDocPrompt(analysis: ProjectAnalysis, folderStructure: string): string {
  const context = buildProjectContext(analysis);

  return `Generate an ARCHITECTURE.md for the following project.

PROJECT CONTEXT:
${context}

FOLDER STRUCTURE:
${folderStructure}

Include:
- High-level architecture diagram (text-based)
- Component descriptions
- Data flow
- Key patterns used
- Technology choices and rationale

Return ONLY the Markdown content.`;
}

export function insightsPrompt(analysis: ProjectAnalysis): string {
  const context = buildProjectContext(analysis);

  return `Analyze the following project and provide insights. Score each area from 1-10 and provide brief explanations.

PROJECT CONTEXT:
${context}

Provide JSON output with this structure:
{
  "documentation_score": { "score": 0, "reason": "" },
  "code_quality_score": { "score": 0, "reason": "" },
  "maintainability_score": { "score": 0, "reason": "" },
  "suggestions": [""],
  "performance_recommendations": [""],
  "security_observations": [""],
  "missing_tests": [""],
  "missing_documentation": [""],
  "todo_summary": [""]
}

Be honest and constructive. Return ONLY valid JSON.`;
}
