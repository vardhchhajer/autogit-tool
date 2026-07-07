# AutoGit

[![npm version](https://img.shields.io/npm/v/autogit-tool.svg)](https://www.npmjs.com/package/autogit-tool)
[![npm downloads](https://img.shields.io/npm/dm/autogit-tool.svg)](https://www.npmjs.com/package/autogit-tool)
[![license](https://img.shields.io/npm/l/autogit-tool.svg)](https://github.com/vardhchhajer/autogit-tool/blob/master/LICENSE)
[![node](https://img.shields.io/node/v/autogit-tool.svg)](https://www.npmjs.com/package/autogit-tool)

> Run `autogit` in any project folder. It reads your code, writes your docs, commits, pushes to GitHub, updates your resume, and generates your LinkedIn post — in one command.

```bash
npm install -g autogit-tool
autogit
```

---

## What it does

When you run `autogit` inside a project directory it:

1. Scans the codebase and detects languages, frameworks, databases, CI/CD, deployment config
2. Generates or improves your README
3. Creates `PROJECT_SUMMARY.md`, `ARCHITECTURE.md`, and `CONTRIBUTING.md` if missing
4. Generates a commit message using AI (Conventional Commits format)
5. Stages, commits, and pushes to GitHub — creating the repository if it doesn't exist
6. Updates your LaTeX resume with an AI-written project entry
7. Generates a LinkedIn post, X (Twitter) post, DEV.to draft, and resume bullet

Everything is previewed and requires confirmation before writing. Pass `--yes` to skip all prompts.

---

## Installation

```bash
npm install -g autogit-tool
```

**npm page:** https://www.npmjs.com/package/autogit-tool

**Requirements:** Node.js 18+, Git

---

## Quick start

```bash
# 1. Go to any project folder
cd my-project

# 2. Set up your GitHub token (first time only)
autogit login

# 3. Set up your AI provider (first time only)
autogit config

# 4. Run
autogit
```

---

## AI Providers

AutoGit supports 13 AI providers. Configure via `autogit config` or environment variables.

| Provider | Env Variable | Default Model | Free Tier |
|---|---|---|---|
| **Groq** | `GROQ_API_KEY` | `llama-3.3-70b-versatile` | ✔ Yes |
| **OpenAI** | `OPENAI_API_KEY` | `gpt-4o-mini` | ✘ No |
| **Anthropic** | `ANTHROPIC_API_KEY` | `claude-sonnet-4-20250514` | ✘ No |
| **Google Gemini** | `GEMINI_API_KEY` | `gemini-1.5-flash` | ✔ Yes |
| **Mistral** | `MISTRAL_API_KEY` | `mistral-large-latest` | ✔ Limited |
| **DeepSeek** | `DEEPSEEK_API_KEY` | `deepseek-chat` | ✔ Limited |
| **Perplexity** | `PERPLEXITY_API_KEY` | `llama-3.1-sonar-large-128k-online` | ✘ No |
| **Together AI** | `TOGETHER_API_KEY` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | ✔ Limited |
| **Cohere** | `COHERE_API_KEY` | `command-r-plus-08-2024` | ✔ Limited |
| **xAI (Grok)** | `XAI_API_KEY` | `grok-3-fast-beta` | ✘ No |
| **OpenRouter** | `OPENROUTER_API_KEY` | `anthropic/claude-sonnet-4-20250514` | ✔ Free models |
| **Ollama** | `OLLAMA_ENDPOINT` | `llama3.1` | ✔ Local |
| **Azure OpenAI** | `AZURE_OPENAI_KEY` | your deployment | — |
| **NVIDIA NIM** | `NVIDIA_API_KEY` | `meta/llama-3.3-70b-instruct` | ✔ Free credits |
| **Custom** | `CUSTOM_API_KEY` | your model | — |

**Recommended for free usage:** [Groq](https://console.groq.com) — fastest free API, no credit card required. [NVIDIA NIM](https://build.nvidia.com) also provides free credits on signup.

### Configure interactively

```bash
autogit config
# → AI Provider & Keys → select provider → paste key
```

### Configure via environment variable

```powershell
# PowerShell
$env:AUTOGIT_AI_PROVIDER = "groq"
$env:GROQ_API_KEY = "gsk_your_key_here"
```

```bash
# Bash / Zsh
export AUTOGIT_AI_PROVIDER=groq
export GROQ_API_KEY=gsk_your_key_here
```

```cmd
# Windows CMD
set AUTOGIT_AI_PROVIDER=groq
set GROQ_API_KEY=gsk_your_key_here
```

### Verify your key

```bash
autogit config --test
```

---

## GitHub Authentication

```bash
autogit login
```

The login wizard will:
- Auto-import your token if the [GitHub CLI](https://cli.github.com) is installed and authenticated
- Otherwise prompt you to paste a Personal Access Token

**Create a token:** https://github.com/settings/tokens/new
Required scopes: `repo`, `read:user`

You can also set it via environment variable:

```bash
export GITHUB_TOKEN=github_pat_your_token_here
```

**Troubleshooting bad credentials:**

```bash
autogit login --check   # shows which token source is active and verifies it
```

If `GITHUB_TOKEN` is set in your environment and invalid, clear it:

```powershell
# PowerShell — current session only
Remove-Item Env:GITHUB_TOKEN

# PowerShell — permanent (removes from Windows user environment)
[System.Environment]::SetEnvironmentVariable("GITHUB_TOKEN", $null, "User")
```

---

## Resume Auto-Update

AutoGit can automatically add a project entry to your LaTeX resume every time you run `autogit`.

### Setup (one time)

```bash
autogit resume --setup
```

Point it at your `.tex` resume file. AutoGit will:
- Detect your `\section{Projects}` block
- Insert an AI-generated `\resumeProjectHeading` entry at the top
- Create a timestamped `.backup-<timestamp>.tex` before writing
- Offer to copy the updated file to `~/Documents/resume/`

### Usage

```bash
autogit resume               # update resume for current project
autogit resume --no-ai       # use template bullets instead of AI
autogit resume --show        # check configured path
autogit resume --setup       # reconfigure
```

The resume step runs automatically in the main pipeline. Skip it with:

```bash
autogit --skip-resume
```

---

## All Commands

| Command | Description |
|---|---|
| `autogit` | Full pipeline: scan → docs → resume → commit → push → social |
| `autogit init` | Initialize Git and generate `.gitignore` |
| `autogit docs` | Generate `PROJECT_SUMMARY.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md` |
| `autogit readme` | Generate or update README only |
| `autogit publish` | Commit and push to GitHub |
| `autogit github` | Create GitHub repository |
| `autogit linkedin` | Generate all social content (short/medium/long LinkedIn, Twitter, DEV.to, resume bullet) |
| `autogit release` | Create a GitHub release with tag and notes |
| `autogit resume` | Update LaTeX resume with current project |
| `autogit analyze` | Project score card: documentation, code quality, maintainability |
| `autogit doctor` | Check that Git, Node.js, GitHub token, and AI keys are all working |
| `autogit config` | Interactive configuration wizard |
| `autogit login` | Authenticate with GitHub |

---

## All Flags

| Flag | Description |
|---|---|
| `--yes` | Skip all confirmation prompts |
| `--dry-run` | Preview all changes without writing anything |
| `--verbose` | Show detailed output |
| `--quiet` | Suppress non-essential output |
| `--private` | Create private GitHub repository |
| `--public` | Create public GitHub repository |
| `--skip-readme` | Skip README generation |
| `--skip-github` | Skip GitHub operations |
| `--skip-linkedin` | Skip social content generation |
| `--skip-resume` | Skip resume auto-update |
| `--no-ai` | Use templates instead of AI for all generation |
| `--regenerate` | Force-regenerate existing documentation files |

---

## Configuration

Settings are stored in `~/.autogit/config.json`.

```bash
autogit config             # interactive wizard
autogit config --list      # view current config (secrets masked)
autogit config --debug     # show which env vars and config keys are active
autogit config --test      # verify active AI provider key with a live call
autogit config --set ai.provider=groq   # set a single value
autogit config --get ai.provider        # read a single value
```

### Full config structure

```json
{
  "github": {
    "token": "github_pat_..."
  },
  "ai": {
    "provider": "groq",
    "model": "",
    "groqKey": "gsk_..."
  },
  "defaults": {
    "visibility": "public",
    "branch": "main",
    "license": "MIT",
    "commitStyle": "conventional",
    "autoConfirm": false,
    "linkedinStyle": "professional"
  },
  "resume": {
    "path": "/Users/you/Documents/resume/resume.tex",
    "ownerName": "Your Name",
    "ownerEmail": "you@email.com",
    "enabled": true
  }
}
```

---

## Project Detection

AutoGit auto-detects the following without any configuration:

**Languages:** TypeScript, JavaScript, Python, Rust, Go, Java, Kotlin, C#, PHP, Ruby, Swift, C/C++, Dart, Elixir, Scala

**Frameworks:** React, Next.js, Vue, Nuxt, Angular, Svelte, Express, Fastify, NestJS, Django, Flask, FastAPI, Spring Boot, Actix, Axum, Gin, Echo and more

**Databases:** PostgreSQL, MySQL, MongoDB, Redis, SQLite, DynamoDB, Supabase, Firebase

**Deployment:** Docker, Vercel, Netlify, Fly.io, Render, Heroku, AWS SAM, Terraform, Serverless Framework

**CI/CD:** GitHub Actions, GitLab CI, CircleCI, Jenkins, Travis CI, Azure Pipelines

Ignored directories: `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `vendor`, `target`, `__pycache__` and more

---

## Dry Run

Preview everything before it runs:

```bash
autogit --dry-run
```

Shows what would be changed without touching any file, making any commit, or calling GitHub.

---

## Use Without AI

Every feature has a template fallback. Run with `--no-ai` to skip all API calls:

```bash
autogit --no-ai
```

README, docs, commit messages, resume entries, and social posts are all generated from templates based on the project analysis. Quality is lower but it works offline with no API keys.

---

## Contributing

Pull requests are welcome.

```bash
git clone https://github.com/vardhchhajer/autogit-tool.git
cd autogit-tool
npm install
npm run build        # compile TypeScript → dist/
npm link             # install autogit globally from this local folder
```

**Development scripts:**

| Script | What it does |
|---|---|
| `npm run build` | Compile TypeScript to `dist/` (required before running) |
| `npm run dev` | Watch mode — recompiles automatically on every file save |
| `npm start` | Run the CLI directly via `node dist/cli.js` |
| `npm run lint` | Run ESLint across `src/` |
| `npm link` | Register `autogit` as a global command pointing at this local build |
| `npm publish --access public` | Publish a new version to npm |

**Project structure:**

```
src/
├── cli.ts                    # Entry point — all commands registered here
├── commands/                 # One file per subcommand
├── config/manager.ts         # Config file + env var resolution
├── scanner/                  # File scanner + project analyzer
├── ai/                       # Provider abstraction + prompts
├── services/                 # readme, docs, git, github, resume, social, insights
├── pipeline/main-pipeline.ts # Orchestrates the full autogit flow
└── utils/                    # Logger, platform helpers
```

---

## License

MIT © [Vardh Chhajer](https://github.com/vardhchhajer)

---

**npm:** https://www.npmjs.com/package/autogit-tool
**GitHub:** https://github.com/vardhchhajer/autogit-tool
