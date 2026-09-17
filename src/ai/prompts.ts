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

  return `You are a senior software engineer writing resume bullets for ${ownerName}. Your task is to read the source code below and write resume bullets that are SPECIFIC, TECHNICAL, and IMPRESSIVE — matching the quality of the examples below.

QUALITY EXAMPLES (these are the style and depth you must match):

Example 1 — ERP system:
\\resumeItem{Engineered a robust SQL Server-to-Cloud sync engine using \\texttt{pyodbc} and \\texttt{FastAPI} that performs real-time data extraction of sales orders, invoices, and ledger masters with read-only transaction isolation level settings.}
\\resumeItem{Implemented a complex financial outstanding calculation engine that replicates \\texttt{PROC\\_OUTSTANDING} logic, accurately reconciling bill-wise receivables by aggregating \\texttt{PARTYDETAIL} bills against \\texttt{ADJMASTER} receipts and unallocated \\texttt{TRAN\\_DETAIL} credits.}

Example 2 — CLI tool:
\\resumeItem{Engineered a recursive project scanner using \\texttt{readdirSync} and \\texttt{statSync} to perform deep dependency analysis, identifying build systems, test frameworks, and environment variables across multi-directory architectures.}
\\resumeItem{Developed a robust Git automation service using \\texttt{simple-git} that performs intelligent staging, generates conventional commit messages via diff analysis, and manages remote repository synchronization via the GitHub API.}

Example 3 — Inventory system:
\\resumeItem{Developed TSPL thermal printer integration (TSC TTP-244 Pro) via Windows Print Spooler (\\texttt{pywin32}), generating Code 39 barcodes across a 3-column label grid with sub-millimeter alignment calibration.}
\\resumeItem{Engineered a global barcode scanner intercept using injected JavaScript that detects rapid keystroke patterns ($<$500ms) to distinguish scanner input from human typing, auto-redirecting to the usage page with pre-filled data.}

---
NOW READ THIS SOURCE CODE CAREFULLY:

${code.content}

---
PROJECT: ${displayName}
TECH STACK: ${techStack}

WRITE THE RESUME ENTRY following these rules:
1. Name ACTUAL functions, classes, algorithms, and data structures from the code (wrap in \\texttt{})
2. Include numbers and specifics where visible (e.g. table counts, threshold values, timing constraints)
3. Explain the WHY or technical challenge — not just what was built
4. Use strong past-tense verbs: Engineered, Implemented, Developed, Designed, Built
5. Each bullet should be 1-2 sentences, dense with technical detail

REQUIRED FORMAT:
\\resumeProjectHeading
    {\\textbf{${displayName}} $|$ \\emph{[category reflecting what the code does]}}{}
    \\resumeItemListStart
      \\resumeItem{[most impressive/complex core feature]}
      \\resumeItem{[second major feature or technical decision]}
      \\resumeItem{[third feature — could be UI, data handling, or integration]}
      \\resumeItem{\\textbf{Tech Stack:} ${techStack}}
    \\resumeItemListEnd

Return ONLY the LaTeX block. No explanation, no markdown fences, no commentary.`;
}

/** Convert a plain-text resume extracted from PDF into a professional LaTeX file */
export function pdfToLatexPrompt(resumeText: string, ownerInfo: {
  name?: string;
  email?: string;
  website?: string;
}): string {
  const templatePreamble = `%-------------------------
% Resume in LaTeX
%-------------------------
\\documentclass[letterpaper,11pt]{article}
\\usepackage{latexsym}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage{marvosym}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{verbatim}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage[english]{babel}
\\usepackage{tabularx}
\\usepackage{geometry}
\\geometry{letterpaper,top=0.5in,bottom=0.5in,left=0.55in,right=0.55in}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyfoot{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}
\\urlstyle{same}
\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}
\\titleformat{\\section}{\\vspace{-4pt}\\scshape\\raggedright\\large}{}{0em}{}[\\color{black}\\titlerule \\vspace{-5pt}]
\\newcommand{\\resumeItem}[1]{\\item\\small{{#1 \\vspace{-2pt}}}}
\\newcommand{\\resumeSubheading}[4]{
  \\vspace{-2pt}\\item
    \\begin{tabular*}{0.97\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
      \\textbf{#1} & #2 \\\\
      \\textit{\\small#3} & \\textit{\\small #4} \\\\
    \\end{tabular*}\\vspace{-7pt}}
\\newcommand{\\resumeProjectHeading}[2]{
    \\item
    \\begin{tabular*}{0.97\\textwidth}{l@{\\extracolsep{\\fill}}r}
      \\small#1 & #2 \\\\
    \\end{tabular*}\\vspace{-7pt}}
\\newcommand{\\resumeSubItem}[1]{\\resumeItem{#1}\\vspace{-4pt}}
\\renewcommand\\labelitemii{$\\vcenter{\\hbox{\\tiny$\\bullet$}}$}
\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0.15in, label={}]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{-5pt}}`;

  const name = ownerInfo.name || 'Your Name';
  const email = ownerInfo.email || 'email@example.com';
  const website = ownerInfo.website || '';

  return `You are a LaTeX expert. Convert the resume text below into a professional LaTeX resume using the exact template structure provided.

RESUME TEXT (extracted from PDF):
---
${resumeText}
---

TEMPLATE PREAMBLE TO USE (copy this exactly):
${templatePreamble}

INSTRUCTIONS:
1. Use the template preamble above verbatim — do not change any \\newcommand or package definitions.
2. For the heading section use:
   \\begin{center}
       {\\Huge \\scshape ${name}} \\\\ \\vspace{4pt}
       \\small
       \\href{mailto:${email}}{\\underline{${email}}} $|$
       \\href{https://linkedin.com/in/...}{\\underline{linkedin.com/in/...}} $|$
       \\href{https://github.com/...}{\\underline{github.com/...}}${website ? ` $|$\n       \\href{https://${website}}{\\underline{${website}}}` : ''}
   \\end{center}
3. Fill in the actual LinkedIn/GitHub/website URLs from the resume text if present.
4. Map each section from the PDF to the correct LaTeX environment:
   - Work experience → \\resumeSubheading{Company}{Location}{Title}{Dates} + \\resumeItemListStart/End
   - Education → \\resumeSubheading{Institution}{Location}{Degree}{Dates}
   - Projects → \\resumeProjectHeading{\\textbf{Name} $|$ \\emph{Type}}{} + \\resumeItemListStart/End
   - Skills → \\begin{itemize} with \\textbf{Category}{: items} rows
5. Preserve ALL content from the PDF — do not skip any section, job, project, or skill.
6. For project bullets: keep them technical and specific. Use \\texttt{} for function names, libraries, and technical terms.
7. End with \\end{document}.

Return ONLY the complete LaTeX source code, nothing else. No explanation, no markdown fences.`;
}
