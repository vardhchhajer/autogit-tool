import type { ProjectAnalysis } from '../scanner/project-analyzer.js';
import type { CodeSummary } from './code-reader.js';

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

/** README generation with actual source code content */
export function readmeGenerationPromptWithCode(
  analysis: ProjectAnalysis,
  code: CodeSummary,
  existingReadme?: string
): string {
  const context = buildProjectContext(analysis);
  const displayName = analysis.displayName || analysis.name;

  const codeSection = `SOURCE CODE (${code.filesRead} file${code.filesRead !== 1 ? 's' : ''}, ${code.charCount.toLocaleString()} chars read):
${code.content}`;

  if (existingReadme) {
    return `You are a senior technical writer. Read EVERY LINE of the source code below, then rewrite the README to accurately describe what this project actually does.

${codeSection}

---
METADATA: ${context}

EXISTING README:
${existingReadme}

REQUIREMENTS — the README must:
1. Title: Use "${displayName}" (not the folder name)
2. Description: 2-3 sentences describing the REAL purpose based on the code — what problem it solves, who uses it
3. Features: Bullet list of CONCRETE features visible in the code (functions, UI sections, calculations, integrations)
4. Tech Stack: Every library imported in the source files
5. Installation: Exact commands including dependencies visible in imports
6. Usage: Step-by-step based on actual entry points seen in the code
7. Preserve any badges, links, or custom content already in the README

Do NOT use vague phrases like "manages data" or "provides functionality".
Be specific: name the actual algorithms, calculations, integrations, and UI sections you see.
Return ONLY the README markdown, no explanations.`;
  }

  return `You are a senior technical writer. Read EVERY LINE of the source code below, then write a professional README that accurately describes what this project does.

${codeSection}

---
METADATA: ${context}

REQUIREMENTS — the README must:
1. Title: Use "${displayName}"
2. Description (2-3 sentences): What does this software actually DO? What problem does it solve? Be specific.
3. Features: Bullet list of REAL features from the code — name actual functions, algorithms, UI components, data flows
4. Tech Stack: Every library found in import statements
5. Installation: Exact commands based on what you see in the code
6. Usage: Step-by-step instructions based on actual entry points and UI flow visible in the code
7. How It Works (optional): If there's interesting logic (formulas, algorithms), briefly explain it
8. Contributing section

Rules:
- Name the actual algorithms and calculations you see (e.g. "longation percentage calculation")
- Reference real UI sections, tabs, and input fields seen in the code
- Do NOT invent features not in the code
- Do NOT use generic placeholder text
Return ONLY the README markdown, nothing else.`;
}

/** Resume entry generation with actual source code content */
export function resumePromptWithCode(
  analysis: ProjectAnalysis,
  code: CodeSummary,
  ownerName: string
): string {
  const displayName = analysis.displayName || analysis.name;
  const techStack = [...analysis.languages, ...analysis.frameworks, ...analysis.libraries]
    .filter(Boolean).join(', ');

  return `You are a senior software engineer writing resume bullets for ${ownerName}. Read the FULL source code below line by line. Understand the exact algorithms, data structures, integrations, and UI flows. Then write a LaTeX resume entry that is specific to THIS codebase — not generic.

SOURCE CODE:
${code.content}

---
PROJECT NAME: ${displayName}
TECH STACK: ${techStack}

CRITICAL RULES:
- Every bullet must reference something SPECIFIC from the code above
- Name actual functions (e.g. calculate_shortage, build_pdf_report), algorithms (e.g. "8-step assorted/unassorted matching"), data structures, or integrations
- Never write generic bullets like "Developed an application" or "Implemented features"
- Use strong past-tense verbs: Engineered, Built, Implemented, Designed, Developed
- Be technical — this resume targets software engineering roles

REQUIRED LaTeX FORMAT (use exactly):
\\resumeProjectHeading
    {\\textbf{${displayName}} $|$ \\emph{[Category based on what the code does]}}{}
    \\resumeItemListStart
      \\resumeItem{[specific technical bullet about the core algorithm or main feature]}
      \\resumeItem{[specific bullet about a secondary feature, UI, or integration]}
      \\resumeItem{[specific bullet about data handling, storage, or output]}
      \\resumeItem{\\textbf{Tech Stack:} ${techStack}}
    \\resumeItemListEnd

Write 3-5 \\resumeItem bullets. The last one must be the Tech Stack line.
Return ONLY the LaTeX block. No commentary, no markdown fences, no explanation.`;
}
