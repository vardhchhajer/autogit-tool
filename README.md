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
8. Saves a share package with a sourced LinkedIn post, text drafts, evidence, and three PNG cards; offers a Brag video when its optional setup is installed

The share package is saved under `~/.autogit/social/<project>/`. LinkedIn publishing and image upload still require your review. Destructive or public-facing Git actions require confirmation; pass `--yes` to skip prompts.

The main run creates three evidence cards automatically, including for CLI, API, and library projects. A real screenshot is optional and only applies when a web app is currently reachable at an HTTP(S) URL; leave the URL blank to skip it. Conceptual artwork is available with `autogit --promo-image` when an image provider is configured.

---

## Installation

```bash
npm install -g autogit-tool
```

**npm page:** https://www.npmjs.com/package/autogit-tool

**Requirements:** Node.js 18+, Git

On the first interactive `autogit` run, setup asks for **Default** (preselected) or **Customize**, a text AI provider, a separate image provider, and whether to include Brag (**Yes** preselected). **Codex**, **Claude Code**, and **Antigravity** use their own browser sign-in and subscription quota for text generation. Images can use OpenAI, Gemini, xAI, Together AI, or a custom OpenAI-compatible image endpoint. Rerun the wizard with `autogit setup`. npm does not reliably expose interactive package-install prompts, so the questions appear on first launch, not while `npm install` is running. Non-interactive runs and `--yes` skip the wizard.

The optional Brag step installs the selected agent and its skill globally. Run `autogit brag` from a project folder to start the video workflow. Codex, Claude Code, and Antigravity use their own cached OAuth sessions; AutoGit never passes them an API key. OpenCode receives only the selected provider credential for that one process and does not store it in OpenCode settings. During opted-in setup, AutoGit installs Node 22 and FFmpeg into its user-data folder if needed; Brag uses `npx hyperframes` to fetch its renderer on first use. The managed FFmpeg binary is a third-party GPL-licensed component. The image-card showcase works without those video tools. Azure OpenAI is not yet mapped to the OpenCode runner.

---

## Quick start

```bash
# 1. Go to any project folder
cd my-project

# 2. First run opens the Default/Customize and AI setup wizard
autogit setup

# 3. Set up your GitHub token (first time only)
autogit login

# 4. Run
autogit
```

---

## AI Providers

AutoGit supports API providers plus three OAuth-backed coding-agent providers. Configure via `autogit config` or environment variables.

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
| **Cerebras** | `CEREBRAS_API_KEY` | `gpt-oss-120b` | — |
| **DeepInfra** | `DEEPINFRA_API_KEY` | `deepseek-ai/DeepSeek-V3.2` | — |
| **Hugging Face Inference** | `HUGGINGFACE_API_KEY` or `HF_TOKEN` | `openai/gpt-oss-120b:fastest` | ✔ Limited |
| **Fireworks AI** | `FIREWORKS_API_KEY` | `accounts/fireworks/models/llama-v3p1-8b-instruct` | — |
| **Codex** | ChatGPT browser sign-in | ChatGPT subscription | subscription quota |
| **Claude Code** | Claude browser sign-in | Claude subscription | subscription quota |
| **Antigravity** | Google browser sign-in | Google account subscription | account quota |
| **Custom OpenAI-compatible** | `CUSTOM_API_KEY` | your model | — |

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

### Custom endpoint

Choose **custom** in `autogit config` to use any service that implements the OpenAI chat-completions API. Enter its base endpoint, model name, and API key. The key is optional for local servers such as LM Studio, LocalAI, vLLM, and llama.cpp. The same endpoint, model, and key are passed to OpenCode for the optional Brag workflow; credentials are not saved in OpenCode.

### Image providers

Image generation is configured separately, so Codex, Claude Code, or Antigravity can remain your text provider while another API creates artwork.

| Provider | Credential | Default image model |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | `gpt-image-1.5` |
| Google Gemini | `GEMINI_API_KEY` | `gemini-3.1-flash-image` |
| xAI | `XAI_API_KEY` | `grok-imagine-image-2.0` |
| Together AI | `TOGETHER_API_KEY` | `black-forest-labs/FLUX.2-dev` |
| Custom OpenAI-compatible | `AUTOGIT_IMAGE_API_KEY` | user supplied |

Run `autogit setup` or choose **Image Provider** in `autogit config`. Environment overrides are `AUTOGIT_IMAGE_PROVIDER`, `AUTOGIT_IMAGE_MODEL`, `AUTOGIT_IMAGE_ENDPOINT`, and `AUTOGIT_IMAGE_API_KEY`.

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
autogit resume --show        # check configured path
autogit resume --setup       # reconfigure
autogit resume --file resume.tex         # use an existing LaTeX file
autogit resume --from-pdf resume.pdf     # convert a text-based PDF to LaTeX
```

PDF conversion extracts text locally, sends the extracted resume content to your configured AI provider, and writes a `.tex` file beside the PDF when that location is writable. Scanned, image-only PDFs require OCR first. Review the generated LaTeX before using it.

The resume step runs automatically in the main pipeline. Skip it with:

```bash
autogit --skip-resume
```

---

## All Commands

| Command | Description |
|---|---|
| `autogit` | Full pipeline: scan → docs → resume → commit → push → share package, with optional Brag video |
| `autogit init` | Initialize Git and generate `.gitignore` |
| `autogit docs` | Generate `PROJECT_SUMMARY.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md` |
| `autogit readme` | Generate or update README only |
| `autogit publish` | Commit and push to GitHub |
| `autogit github` | Create GitHub repository |
| `autogit linkedin` | Generate all social content (short/medium/long LinkedIn, Twitter, DEV.to, resume bullet) |
| `autogit setup` | Configure defaults, text and image providers, and optional Brag |
| `autogit brag` | Run Brag video creation with the matched coding agent |
| `autogit showcase` | Create a sourced project post and three LinkedIn-ready PNG cards |
| `autogit release` | Create a GitHub release with tag and notes |
| `autogit resume` | Update LaTeX resume with current project |
| `autogit analyze` | Project score card: documentation, code quality, maintainability |
| `autogit doctor` | Check that Git, Node.js, GitHub token, and AI keys are all working |
| `autogit config` | Interactive configuration wizard |
| `autogit login` | Authenticate with GitHub |

---

## Publishing Safely

Before committing, AutoGit shows files already staged, files it plans to stage, the current branch, and the `origin` remote. Partially staged files keep their staged version; their remaining edits stay unstaged. Obvious credential files such as `.env` and private keys stop the commit. A failed push returns an error, while the local commit remains available to retry.

If `origin` exists, AutoGit pushes there without changing its URL or requiring a GitHub API token. If there is no remote, AutoGit can create a new repository; new repositories are private by default unless `--public` or a saved public visibility default is specified. If a same-named repository already exists, AutoGit asks you to set `origin` yourself so it cannot choose the wrong destination. `--yes` skips prompts but does not bypass the credential-file check.

---

## LinkedIn Images

For any project, including a CLI, API, library, or data project, run `autogit showcase`. It detects the project type, uses traceable project facts, and saves a post, three PNG cards, editable SVG versions, and an `evidence.json` file under `~/.autogit/social/<project>/showcase-<timestamp>/`. Review the draft before sharing. It never runs project commands or invents terminal output, performance results, or a UI screenshot. The PNG renderer is included in AutoGit's npm dependencies; no coding agent, browser, FFmpeg, or Hyperframes installation is required. Showcase generation requires the configured AI provider. Videos are not generated by this command.

Run `autogit linkedin` and choose a real screenshot, conceptual promotional artwork, or both. Images are saved under AutoGit's user data directory and must be uploaded in LinkedIn's composer; opening the share dialog does not attach local image files.

```bash
autogit linkedin --screenshot-url http://localhost:3000
autogit linkedin --promo-image
autogit linkedin --showcase-cards
autogit linkedin --screenshot-url http://localhost:3000 --promo-image "minimal product illustration"
```

Screenshots capture a running web app using Chrome, Edge, or Chromium installed on the computer. Promotional artwork uses the separately configured OpenAI, Gemini, xAI, Together AI, or custom image provider. Artwork is conceptual and should not be presented as a screenshot of the app.

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

### Project-aware README generation

With an AI provider configured, `autogit readme` inspects the current project in several steps. It can search the project file list and read relevant source and configuration files before drafting. AutoGit shows the proposed README or a diff and asks before writing. No separate coding-agent program is required; the feature uses AutoGit's existing AI provider configuration.

Sensitive files such as `.env`, private keys, and lockfiles are excluded from this inspection. If AI generation fails or no provider is configured, the command exits with an error and does not write a README.

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
| `npm test` | Build and run the README agent tests |
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
