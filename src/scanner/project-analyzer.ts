import { existsSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { type ScanResult, type FileEntry, readFileContent, findFile } from './file-scanner.js';

export interface ProjectAnalysis {
  name: string;
  displayName: string;        // Human-readable name from frontend (e.g. "HealthBridge")
  languages: string[];
  frameworks: string[];
  libraries: string[];
  packageManager: string | null;
  buildSystem: string | null;
  testFramework: string | null;
  entryPoints: string[];
  features: string[];
  codeFeatures: string[];     // Features extracted from actual source code
  architecture: string;
  database: string[];
  apis: string[];
  apiRoutes: string[];        // Actual route paths found in source
  envVars: string[];
  deployment: string[];
  license: string | null;
  cicd: string[];
  hasGit: boolean;
  hasReadme: boolean;
  readmePath: string | null;
  description: string | null;
  version: string | null;
  pageCount: number;          // Number of pages/screens detected
  componentCount: number;     // Number of UI components detected
}

export async function analyzeProject(rootDir: string, scan: ScanResult): Promise<ProjectAnalysis> {
  const analysis: ProjectAnalysis = {
    name: basename(rootDir),
    displayName: '',
    languages: [],
    frameworks: [],
    libraries: [],
    packageManager: null,
    buildSystem: null,
    testFramework: null,
    entryPoints: [],
    features: [],
    codeFeatures: [],
    architecture: 'unknown',
    database: [],
    apis: [],
    apiRoutes: [],
    envVars: [],
    deployment: [],
    license: null,
    cicd: [],
    hasGit: existsSync(join(rootDir, '.git')),
    hasReadme: false,
    readmePath: null,
    description: null,
    version: null,
    pageCount: 0,
    componentCount: 0,
  };

  // Detect README
  const readmeFile = scan.files.find(f =>
    /^readme(\.(md|txt|rst))?$/i.test(f.name)
  );
  if (readmeFile) {
    analysis.hasReadme = true;
    analysis.readmePath = readmeFile.path;
  }

  // Detect languages
  detectLanguages(scan, analysis);

  // Detect package managers and frameworks
  detectNodeProject(rootDir, scan, analysis);
  await detectPythonProject(rootDir, scan, analysis);
  detectRustProject(rootDir, scan, analysis);
  detectGoProject(rootDir, scan, analysis);
  detectJavaProject(rootDir, scan, analysis);
  detectDotNetProject(rootDir, scan, analysis);

  // Deep code analysis — reads actual source files
  await deepCodeAnalysis(rootDir, scan, analysis);

  // Detect CI/CD
  detectCICD(rootDir, scan, analysis);

  // Detect deployment
  detectDeployment(rootDir, scan, analysis);

  // Detect databases
  detectDatabases(rootDir, scan, analysis);

  // Detect APIs
  detectAPIs(scan, analysis);

  // Detect environment variables
  detectEnvVars(rootDir, scan, analysis);

  // Detect license
  detectLicense(rootDir, scan, analysis);

  // Detect architecture
  detectArchitecture(scan, analysis);

  // Detect test framework
  detectTestFramework(rootDir, scan, analysis);

  // Resolve display name — human-readable name extracted from frontend/source
  await resolveDisplayName(rootDir, scan, analysis);

  // Post-process: libraries should not appear in frameworks list
  const libOnlyNames = ['Pandas', 'NumPy', 'SciPy', 'Plotly'];
  for (const lib of libOnlyNames) {
    const idx = analysis.frameworks.indexOf(lib);
    if (idx !== -1) {
      analysis.frameworks.splice(idx, 1);
      if (!analysis.libraries.includes(lib)) analysis.libraries.push(lib);
    }
  }
  analysis.libraries = [...new Set(analysis.libraries)];
  analysis.frameworks = [...new Set(analysis.frameworks)];

  return analysis;
}

function detectLanguages(scan: ScanResult, analysis: ProjectAnalysis): void {
  const extMap: Record<string, string> = {
    '.ts': 'TypeScript', '.tsx': 'TypeScript',
    '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript',
    '.py': 'Python',
    '.rs': 'Rust',
    '.go': 'Go',
    '.java': 'Java', '.kt': 'Kotlin',
    '.cs': 'C#',
    '.rb': 'Ruby',
    '.php': 'PHP',
    '.swift': 'Swift',
    '.c': 'C', '.h': 'C',
    '.cpp': 'C++', '.hpp': 'C++', '.cc': 'C++',
    '.dart': 'Dart',
    '.ex': 'Elixir', '.exs': 'Elixir',
    '.scala': 'Scala',
    '.vue': 'Vue',
    '.svelte': 'Svelte',
  };

  const langCounts = new Map<string, number>();
  for (const file of scan.files) {
    const lang = extMap[file.extension];
    if (lang) {
      langCounts.set(lang, (langCounts.get(lang) || 0) + 1);
    }
  }

  analysis.languages = [...langCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang);
}

function detectNodeProject(rootDir: string, scan: ScanResult, analysis: ProjectAnalysis): void {
  const pkgPath = join(rootDir, 'package.json');
  if (!existsSync(pkgPath)) return;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    analysis.name = pkg.name || analysis.name;
    analysis.description = pkg.description || null;
    analysis.version = pkg.version || null;

    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    // Package manager
    if (existsSync(join(rootDir, 'pnpm-lock.yaml'))) {
      analysis.packageManager = 'pnpm';
    } else if (existsSync(join(rootDir, 'yarn.lock'))) {
      analysis.packageManager = 'yarn';
    } else if (existsSync(join(rootDir, 'bun.lockb'))) {
      analysis.packageManager = 'bun';
    } else {
      analysis.packageManager = 'npm';
    }

    // Frameworks
    const frameworkMap: Record<string, string> = {
      'react': 'React', 'next': 'Next.js', 'nuxt': 'Nuxt',
      'vue': 'Vue', 'angular': 'Angular', 'svelte': 'Svelte',
      'express': 'Express', 'fastify': 'Fastify', 'koa': 'Koa',
      'nestjs': 'NestJS', '@nestjs/core': 'NestJS',
      'gatsby': 'Gatsby', 'remix': 'Remix', 'astro': 'Astro',
      'electron': 'Electron', 'react-native': 'React Native',
      'hono': 'Hono', 'elysia': 'Elysia',
    };

    for (const [dep, framework] of Object.entries(frameworkMap)) {
      if (allDeps[dep]) {
        analysis.frameworks.push(framework);
      }
    }

    // Libraries
    const importantLibs = [
      'tailwindcss', 'prisma', 'drizzle-orm', 'typeorm', 'sequelize',
      'mongoose', 'redis', 'socket.io', 'graphql', 'trpc',
      'zod', 'joi', 'yup', 'axios', 'jest', 'vitest', 'mocha',
      'cypress', 'playwright', 'storybook', 'webpack', 'vite',
      'esbuild', 'turbo', 'lerna', 'docker', 'kubernetes',
    ];

    for (const lib of importantLibs) {
      if (allDeps[lib] || allDeps[`@${lib}`]) {
        analysis.libraries.push(lib);
      }
    }

    // Build system
    if (allDeps['vite']) analysis.buildSystem = 'Vite';
    else if (allDeps['webpack']) analysis.buildSystem = 'Webpack';
    else if (allDeps['esbuild']) analysis.buildSystem = 'esbuild';
    else if (allDeps['turbo'] || existsSync(join(rootDir, 'turbo.json'))) analysis.buildSystem = 'Turborepo';
    else if (pkg.scripts?.build) analysis.buildSystem = 'npm scripts';

    // Entry points
    if (pkg.main) analysis.entryPoints.push(pkg.main);
    if (pkg.module) analysis.entryPoints.push(pkg.module);

  } catch {
    // Invalid package.json
  }
}

async function detectPythonProject(rootDir: string, scan: ScanResult, analysis: ProjectAnalysis): Promise<void> {
  const hasPyproject    = existsSync(join(rootDir, 'pyproject.toml'));
  const hasSetupPy      = existsSync(join(rootDir, 'setup.py'));
  const hasRequirements = existsSync(join(rootDir, 'requirements.txt'));
  const hasPipfile      = existsSync(join(rootDir, 'Pipfile'));
  const hasPoetry       = existsSync(join(rootDir, 'poetry.lock'));
  const hasPyFiles      = scan.files.some(f => f.extension === '.py');

  if (!hasPyproject && !hasSetupPy && !hasRequirements && !hasPipfile && !hasPyFiles) return;

  if (hasPyproject || hasSetupPy || hasRequirements || hasPipfile) {
    if (hasPoetry)         analysis.packageManager = 'poetry';
    else if (hasPipfile)   analysis.packageManager = 'pipenv';
    else if (hasPyproject) analysis.packageManager = 'pip (pyproject.toml)';
    else                   analysis.packageManager = 'pip';
  }

  let deps = '';
  if (hasRequirements) deps = readFileContent(join(rootDir, 'requirements.txt')) || '';

  const pyFrameworks: Record<string, string> = {
    'django': 'Django', 'flask': 'Flask', 'fastapi': 'FastAPI',
    'streamlit': 'Streamlit', 'pytorch': 'PyTorch', 'tensorflow': 'TensorFlow',
    'pandas': 'Pandas', 'numpy': 'NumPy', 'scipy': 'SciPy',
    'celery': 'Celery', 'scrapy': 'Scrapy',
  };

  for (const [dep, framework] of Object.entries(pyFrameworks)) {
    if (deps.toLowerCase().includes(dep)) analysis.frameworks.push(framework);
  }

  if (findFile(scan, 'manage.py') && !analysis.frameworks.includes('Django')) {
    analysis.frameworks.push('Django');
  }

  const libMap: Record<string, string> = {
    'pandas': 'Pandas', 'numpy': 'NumPy', 'plotly': 'Plotly',
    'reportlab': 'ReportLab', 'openpyxl': 'openpyxl', 'PIL': 'Pillow',
    'sqlalchemy': 'SQLAlchemy', 'pymongo': 'PyMongo', 'redis': 'Redis',
  };

  const { readFileSync } = await import('fs');
  const pySourceFiles = scan.files.filter(f => f.extension === '.py').slice(0, 10);
  for (const file of pySourceFiles) {
    let content: string;
    try {
      content = readFileSync(file.path, 'latin1').slice(0, 5000);
    } catch { continue; }
    for (const [dep, framework] of Object.entries(pyFrameworks)) {
      if ((content.includes(`import ${dep}`) || content.includes(`from ${dep}`)) &&
          !analysis.frameworks.includes(framework)) {
        analysis.frameworks.push(framework);
      }
    }
    for (const [dep, lib] of Object.entries(libMap)) {
      if ((content.includes(`import ${dep}`) || content.includes(`from ${dep}`)) &&
          !analysis.libraries.includes(lib)) {
        analysis.libraries.push(lib);
      }
    }
  }
}
function detectRustProject(rootDir: string, scan: ScanResult, analysis: ProjectAnalysis): void {
  const cargoPath = join(rootDir, 'Cargo.toml');
  if (!existsSync(cargoPath)) return;

  analysis.packageManager = 'cargo';
  analysis.buildSystem = 'Cargo';

  const content = readFileContent(cargoPath) || '';
  if (content.includes('actix')) analysis.frameworks.push('Actix');
  if (content.includes('axum')) analysis.frameworks.push('Axum');
  if (content.includes('rocket')) analysis.frameworks.push('Rocket');
  if (content.includes('tokio')) analysis.libraries.push('Tokio');
  if (content.includes('serde')) analysis.libraries.push('Serde');

  const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
  if (nameMatch) analysis.name = nameMatch[1];

  const versionMatch = content.match(/version\s*=\s*"([^"]+)"/);
  if (versionMatch) analysis.version = versionMatch[1];
}

function detectGoProject(rootDir: string, scan: ScanResult, analysis: ProjectAnalysis): void {
  const goModPath = join(rootDir, 'go.mod');
  if (!existsSync(goModPath)) return;

  analysis.packageManager = 'go modules';
  analysis.buildSystem = 'go build';

  const content = readFileContent(goModPath) || '';
  if (content.includes('gin-gonic')) analysis.frameworks.push('Gin');
  if (content.includes('echo')) analysis.frameworks.push('Echo');
  if (content.includes('fiber')) analysis.frameworks.push('Fiber');
  if (content.includes('gorm')) analysis.libraries.push('GORM');
}

function detectJavaProject(rootDir: string, scan: ScanResult, analysis: ProjectAnalysis): void {
  if (existsSync(join(rootDir, 'pom.xml'))) {
    analysis.packageManager = 'Maven';
    analysis.buildSystem = 'Maven';

    const content = readFileContent(join(rootDir, 'pom.xml')) || '';
    if (content.includes('spring-boot')) analysis.frameworks.push('Spring Boot');
    if (content.includes('quarkus')) analysis.frameworks.push('Quarkus');
  } else if (existsSync(join(rootDir, 'build.gradle')) || existsSync(join(rootDir, 'build.gradle.kts'))) {
    analysis.packageManager = 'Gradle';
    analysis.buildSystem = 'Gradle';
  }
}

function detectDotNetProject(rootDir: string, scan: ScanResult, analysis: ProjectAnalysis): void {
  const csprojFiles = scan.files.filter(f => f.extension === '.csproj');
  if (csprojFiles.length === 0) return;

  analysis.packageManager = 'NuGet';
  analysis.buildSystem = 'dotnet';

  for (const file of csprojFiles) {
    const content = readFileContent(file.path) || '';
    if (content.includes('Microsoft.AspNetCore')) analysis.frameworks.push('ASP.NET Core');
    if (content.includes('Blazor')) analysis.frameworks.push('Blazor');
  }
}

function detectCICD(rootDir: string, scan: ScanResult, analysis: ProjectAnalysis): void {
  if (existsSync(join(rootDir, '.github', 'workflows'))) analysis.cicd.push('GitHub Actions');
  if (existsSync(join(rootDir, '.gitlab-ci.yml'))) analysis.cicd.push('GitLab CI');
  if (existsSync(join(rootDir, 'Jenkinsfile'))) analysis.cicd.push('Jenkins');
  if (existsSync(join(rootDir, '.circleci'))) analysis.cicd.push('CircleCI');
  if (existsSync(join(rootDir, '.travis.yml'))) analysis.cicd.push('Travis CI');
  if (existsSync(join(rootDir, 'azure-pipelines.yml'))) analysis.cicd.push('Azure Pipelines');
  if (existsSync(join(rootDir, 'bitbucket-pipelines.yml'))) analysis.cicd.push('Bitbucket Pipelines');
}

function detectDeployment(rootDir: string, scan: ScanResult, analysis: ProjectAnalysis): void {
  if (existsSync(join(rootDir, 'Dockerfile')) || existsSync(join(rootDir, 'docker-compose.yml'))) {
    analysis.deployment.push('Docker');
  }
  if (existsSync(join(rootDir, 'vercel.json')) || existsSync(join(rootDir, '.vercel'))) {
    analysis.deployment.push('Vercel');
  }
  if (existsSync(join(rootDir, 'netlify.toml'))) analysis.deployment.push('Netlify');
  if (existsSync(join(rootDir, 'fly.toml'))) analysis.deployment.push('Fly.io');
  if (existsSync(join(rootDir, 'render.yaml'))) analysis.deployment.push('Render');
  if (existsSync(join(rootDir, 'Procfile'))) analysis.deployment.push('Heroku');
  if (scan.files.some(f => f.name.includes('terraform'))) analysis.deployment.push('Terraform');
  if (existsSync(join(rootDir, 'serverless.yml'))) analysis.deployment.push('Serverless Framework');
  if (existsSync(join(rootDir, 'sam.yaml')) || existsSync(join(rootDir, 'template.yaml'))) {
    analysis.deployment.push('AWS SAM');
  }
}

function detectDatabases(rootDir: string, scan: ScanResult, analysis: ProjectAnalysis): void {
  // Only scan config/source files — explicitly skip .env to avoid reading secrets
  const allContent = scan.files
    .filter(f =>
      ['.json', '.toml', '.yaml', '.yml', '.ts', '.js', '.py'].includes(f.extension) &&
      !f.name.startsWith('.env') &&
      !f.relativePath.includes('.env')
    )
    .slice(0, 30)
    .map(f => readFileContent(f.path, 10000) || '')
    .join('\n')
    .toLowerCase();

  if (allContent.includes('postgres') || allContent.includes('pg_')) analysis.database.push('PostgreSQL');
  if (allContent.includes('mysql') || allContent.includes('mariadb')) analysis.database.push('MySQL');
  if (allContent.includes('mongodb') || allContent.includes('mongoose')) analysis.database.push('MongoDB');
  if (allContent.includes('redis')) analysis.database.push('Redis');
  if (allContent.includes('sqlite')) analysis.database.push('SQLite');
  if (allContent.includes('dynamodb')) analysis.database.push('DynamoDB');
  if (allContent.includes('supabase')) analysis.database.push('Supabase');
  if (allContent.includes('firebase') || allContent.includes('firestore')) analysis.database.push('Firebase');
}

function detectAPIs(scan: ScanResult, analysis: ProjectAnalysis): void {
  const routePatterns = [
    /app\.(get|post|put|delete|patch)\s*\(/,
    /router\.(get|post|put|delete|patch)\s*\(/,
    /@(Get|Post|Put|Delete|Patch)\(/,
    /path\s*\(\s*["']/,
  ];

  const apiFiles = scan.files.filter(f =>
    f.relativePath.includes('route') ||
    f.relativePath.includes('api') ||
    f.relativePath.includes('controller') ||
    f.relativePath.includes('endpoint')
  );

  for (const file of apiFiles.slice(0, 20)) {
    const content = readFileContent(file.path, 50000);
    if (!content) continue;

    for (const pattern of routePatterns) {
      const matches = content.match(new RegExp(pattern, 'g'));
      if (matches) {
        analysis.apis.push(file.relativePath);
        break;
      }
    }
  }

  if (scan.files.some(f => f.name === 'openapi.yaml' || f.name === 'swagger.json')) {
    analysis.features.push('OpenAPI/Swagger');
  }
  if (scan.files.some(f => f.extension === '.graphql' || f.name.includes('schema.graphql'))) {
    analysis.features.push('GraphQL');
  }
}

function detectEnvVars(rootDir: string, scan: ScanResult, analysis: ProjectAnalysis): void {
  const envFiles = ['.env.example', '.env.sample', '.env.template', '.env.local'];

  for (const envFile of envFiles) {
    const envPath = join(rootDir, envFile);
    const content = readFileContent(envPath);
    if (content) {
      const vars = content.split('\n')
        .filter(line => line.includes('=') && !line.startsWith('#'))
        .map(line => line.split('=')[0].trim())
        .filter(v => v.length > 0);
      analysis.envVars.push(...vars);
    }
  }

  // Also check .env if it exists — extract ONLY key names, never values
  if (analysis.envVars.length === 0) {
    const envContent = readFileContent(join(rootDir, '.env'));
    if (envContent) {
      const vars = envContent.split('\n')
        .filter(line => line.includes('=') && !line.startsWith('#') && !line.startsWith('//'))
        .map(line => line.split('=')[0].trim())
        .filter(v => v.length > 0 && /^[A-Z0-9_]+$/i.test(v)); // only valid env var names
      analysis.envVars.push(...vars);
    }
  }

  // Deduplicate
  analysis.envVars = [...new Set(analysis.envVars)];
}

function detectLicense(rootDir: string, scan: ScanResult, analysis: ProjectAnalysis): void {
  const licenseFile = scan.files.find(f =>
    /^license(\.md|\.txt)?$/i.test(f.name)
  );

  if (licenseFile) {
    const content = readFileContent(licenseFile.path, 5000) || '';
    if (content.includes('MIT')) analysis.license = 'MIT';
    else if (content.includes('Apache')) analysis.license = 'Apache-2.0';
    else if (content.includes('GNU GENERAL PUBLIC')) analysis.license = 'GPL-3.0';
    else if (content.includes('BSD')) analysis.license = 'BSD';
    else if (content.includes('ISC')) analysis.license = 'ISC';
    else analysis.license = 'Other';
  }
}

function detectArchitecture(scan: ScanResult, analysis: ProjectAnalysis): void {
  const dirs = scan.directories.map(d => d.toLowerCase());

  if (dirs.some(d => d.includes('microservice'))) {
    analysis.architecture = 'Microservices';
  } else if (dirs.some(d => d.includes('packages/') || d.includes('apps/'))) {
    analysis.architecture = 'Monorepo';
  } else if (dirs.some(d => d.includes('src/components')) && dirs.some(d => d.includes('src/pages') || d.includes('src/app'))) {
    analysis.architecture = 'Component-based SPA';
  } else if (dirs.some(d => d.includes('controllers')) && dirs.some(d => d.includes('models'))) {
    analysis.architecture = 'MVC';
  } else if (dirs.some(d => d.includes('domain')) && dirs.some(d => d.includes('application'))) {
    analysis.architecture = 'Clean Architecture';
  } else if (analysis.frameworks.length > 0) {
    analysis.architecture = 'Framework-based';
  } else {
    analysis.architecture = 'Single module';
  }
}

function detectTestFramework(rootDir: string, scan: ScanResult, analysis: ProjectAnalysis): void {
  const testFiles = scan.files.filter(f =>
    f.name.includes('.test.') || f.name.includes('.spec.') || f.name.includes('_test.')
  );

  if (analysis.libraries.includes('jest') || findFile(scan, 'jest.config.ts') || findFile(scan, 'jest.config.js')) {
    analysis.testFramework = 'Jest';
  } else if (analysis.libraries.includes('vitest') || findFile(scan, 'vitest.config.ts')) {
    analysis.testFramework = 'Vitest';
  } else if (analysis.libraries.includes('mocha')) {
    analysis.testFramework = 'Mocha';
  } else if (findFile(scan, 'pytest.ini') || findFile(scan, 'conftest.py')) {
    analysis.testFramework = 'Pytest';
  } else if (testFiles.length > 0) {
    analysis.testFramework = 'Unknown';
  }
}

// ─── Deep code analysis ───────────────────────────────────────────────────────

export interface CodeContext {
  functions: string[];
  docstrings: string[];
  uiSections: string[];
  tabNames: string[];
  description: string | null;
}

/**
 * Read source files thoroughly to extract:
 * - Function names and docstrings
 * - UI section names and tabs
 * - Routes / API endpoints
 * - Concrete features
 */
async function deepCodeAnalysis(rootDir: string, scan: ScanResult, analysis: ProjectAnalysis): Promise<void> {
  const sourceExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.cs', '.java', '.kt'];
  const sourceFiles = scan.files
    .filter(f => sourceExts.includes(f.extension))
    .slice(0, 60);

  // Count pages and components
  analysis.pageCount = scan.files.filter(f =>
    f.relativePath.match(/\/(pages|app|views|screens)\/.*\.(tsx?|jsx?|py|vue|svelte)$/i)
  ).length;
  analysis.componentCount = scan.files.filter(f =>
    f.relativePath.match(/\/components?\/.*\.(tsx?|jsx?|vue|svelte)$/i)
  ).length;

  const featurePatterns: Array<{ pattern: RegExp; feature: string }> = [
    { pattern: /\b(?:auth|login|signin|signup)\b|jwt\.sign|passport\.use|oauth/i,            feature: 'Authentication' },
    { pattern: /file_uploader|st\.file_uploader|multer|formdata|FileUpload|file.*upload/i,    feature: 'File Upload' },
    { pattern: /stripe|payment|checkout|billing/i,                                             feature: 'Payment Integration' },
    { pattern: /socket\.io|new WebSocket|websocket\.connect|\.on\(['"]message/i,               feature: 'Real-time (WebSocket)' },
    { pattern: /nodemailer|sendgrid|mailgun|smtplib|smtp\.send/i,                              feature: 'Email Notifications' },
    { pattern: /push_notification|fcm|apns|firebase.*message/i,                                feature: 'Push Notifications' },
    { pattern: /plotly\.|recharts|d3\.select|Chart\.js|st\.plotly_chart|st\.bar_chart/i,       feature: 'Data Visualization' },
    { pattern: /reportlab|pdfkit|puppeteer.*pdf|fpdf|SimpleDocTemplate/i,                      feature: 'PDF Generation' },
    { pattern: /celery|bull\.Queue|agenda\.every|crontab|schedule\.every/i,                    feature: 'Background Jobs' },
    { pattern: /redis\.set|memcache|\.cache\(|cache\.get/i,                                    feature: 'Caching' },
    { pattern: /elasticsearch|algolia|whoosh\.index|solr/i,                                    feature: 'Search' },
    { pattern: /leaflet\.|mapbox|google\.maps|folium\.Map/i,                                   feature: 'Maps Integration' },
    { pattern: /openai\.|anthropic\.|gemini\.|langchain|LLM\(|ChatOpenAI/i,                    feature: 'AI Integration' },
    { pattern: /barcode|qrcode|cv2\.QRCode|scanner\.decode/i,                                  feature: 'Barcode/QR Scanner' },
    { pattern: /st\.metric|st\.dataframe|plotly.*dashboard|analytics.*dashboard/i,             feature: 'Analytics Dashboard' },
    { pattern: /\.create\(|\.update\(|\.delete\(|\.findOne\(|session\.add|session\.delete/i,   feature: 'CRUD Operations' },
    { pattern: /to_csv|\.to_excel|csv\.writer|st\.download_button/i,                           feature: 'Data Export' },
    { pattern: /pd\.read_excel|pd\.read_csv|openpyxl\.load|xlrd\.open/i,                       feature: 'Data Import' },
    { pattern: /\brole\b.*permission|rbac|acl\.|@roles_required/i,                             feature: 'Role-based Access Control' },
    { pattern: /AES\.encrypt|RSA\.|Fernet\(|crypto\.createCipher/i,                            feature: 'Encryption' },
    { pattern: /twilio\.|vonage\.|nexmo\.|sms\.send/i,                                         feature: 'SMS Integration' },
    { pattern: /whisper\.|SpeechRecognition|pyttsx|text.to.speech/i,                           feature: 'Speech Processing' },
    { pattern: /solana|ethereum|web3\.eth|@solana\/web3/i,                                     feature: 'Blockchain' },
    { pattern: /FROM python:|FROM node:|docker-compose|DockerFile/i,                           feature: 'Containerization' },
    { pattern: /tspl|ZPL\.|TSC.*TTP|pywin32.*print/i,                                         feature: 'Label Printing' },
    { pattern: /json\.dump|json\.load|save_report|load_report/i,                               feature: 'Report Persistence' },
    { pattern: /st\.tabs?\s*\(\[/i,                                                             feature: 'Multi-tab Interface' },
    { pattern: /st\.sidebar/i,                                                                  feature: 'Sidebar Navigation' },
    { pattern: /st\.data_editor|st\.dataframe/i,                                               feature: 'Interactive Data Tables' },
  ];

  const foundFeatures = new Set<string>();
  const routes: string[] = [];
  const allFunctions: string[] = [];
  const allDocstrings: string[] = [];
  const allUISections: string[] = [];
  let inferredDescription: string | null = null;

  const routePatterns = [
    /(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`](\/[^'"` ]*)/gi,
    /@(?:Get|Post|Put|Delete|Patch)\s*\(\s*['"`](\/[^'"` ]*)/gi,
    /path\s*=\s*['"`](\/[^'"` ]+)/gi,
  ];

  const { readFileSync: _readFileSync } = await import('fs');

  for (const file of sourceFiles) {
    // Always use latin1 — handles emoji, special chars in Python files
    let content: string;
    try {
      content = _readFileSync(file.path, 'latin1');
    } catch { continue; }

    // Feature detection (full file)
    for (const { pattern, feature } of featurePatterns) {
      if (pattern.test(content)) foundFeatures.add(feature);
    }

    // Route extraction
    for (const routePattern of routePatterns) {
      for (const match of [...content.matchAll(routePattern)].slice(0, 5)) {
        const route = match[2] || match[1];
        if (route && route.length > 1 && !routes.includes(route)) routes.push(route);
      }
    }

    // Python-specific deep extraction
    if (file.extension === '.py') {
      // Function names
      const funcs = [...content.matchAll(/^def ([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gm)]
        .map(m => m[1])
        .filter(n => !n.startsWith('_'));
      allFunctions.push(...funcs);

      // Docstrings — first triple-quoted string after def
      const docMatches = [...content.matchAll(/def [^\n]+\n\s+"""([\s\S]*?)"""/gm)]
        .map(m => m[1].replace(/\s+/g, ' ').trim())
        .filter(d => d.length > 20 && d.length < 300);
      allDocstrings.push(...docMatches.slice(0, 5));

      // UI section labels — strip emoji and non-ASCII, keep only readable text
      const sectionMatches = [
        ...content.matchAll(/section-hdr['">\s]*>(.*?)<\/div>/gi),
        ...content.matchAll(/st\.markdown\s*\(\s*["']#+\s*([^"'\n#\\]+)/gi),
        ...content.matchAll(/st\.header\s*\(\s*["']([^"']+)["']/gi),
        ...content.matchAll(/st\.subheader\s*\(\s*["']([^"']+)["']/gi),
      ].map(m => m[1]
          .trim()
          .replace(/<[^>]+>/g, '')       // strip HTML tags
          .replace(/[^\x20-\x7E]/g, '')  // strip non-ASCII (emoji etc.)
          .replace(/\\n.*/,'')
          .trim()
        )
        .filter(s => s.length > 3 && s.length < 60);
      allUISections.push(...sectionMatches.slice(0, 8));

      // Tab names — strip non-ASCII
      const tabMatch = content.match(/st\.tabs\s*\(\s*\[([^\]]+)\]/);
      if (tabMatch) {
        const tabs = tabMatch[1]
          .replace(/[^\x20-\x7E,'"]/g, '') // strip non-ASCII
          .replace(/['"]/g, '')
          .split(',')
          .map(t => t.trim())
          .filter(Boolean);
        allUISections.push(...tabs);
      }

      // Use the most meaningful docstring as description
      if (!inferredDescription && docMatches.length > 0) {
        // Skip generic/trivial docstrings
        const skipPhrases = /^(initialize|helper|utility|wrapper|create a|simple|basic)/i;
        const mainDoc = docMatches.find(d => !skipPhrases.test(d) && d.length > 30);
        inferredDescription = (mainDoc || docMatches[0]).trim();
      }

      // Fallback: extract from st.markdown hero text
      if (!inferredDescription) {
        const heroMatch = content.match(/hero-subtitle['">\s]*>(.*?)<\/div>/i);
        if (heroMatch) inferredDescription = heroMatch[1].trim();
      }
    }

    // TypeScript/JavaScript: extract JSDoc and component names
    if (['.ts', '.tsx', '.js', '.jsx'].includes(file.extension)) {
      const jsdocMatches = [...content.matchAll(/\/\*\*\s*([\s\S]*?)\*\//gm)]
        .map(m => m[1].replace(/\s*\*\s?/g, ' ').trim())
        .filter(d => d.length > 20 && d.length < 300);
      allDocstrings.push(...jsdocMatches.slice(0, 3));

      if (!inferredDescription && jsdocMatches.length > 0) {
        inferredDescription = jsdocMatches[0];
      }
    }
  }

  analysis.codeFeatures = [...foundFeatures];
  analysis.apiRoutes = routes.slice(0, 20);
  analysis.features = [...new Set([...analysis.features, ...analysis.codeFeatures])];

  // Store rich context for AI prompts
  (analysis as any)._codeContext = {
    functions: [...new Set(allFunctions)].slice(0, 15),
    docstrings: allDocstrings,
    uiSections: [...new Set(allUISections)].slice(0, 10),
    description: inferredDescription,
  } as CodeContext;

  // Use inferred description if none found
  if (!analysis.description && inferredDescription) {
    analysis.description = inferredDescription;
  }
}

/**
 * Extract a human-readable display name from:
 * 1. HTML <title> tag in index.html / public/index.html
 * 2. App component title (document.title, st.title, etc.)
 * 3. README first heading
 * 4. package.json "displayName" field
 * 5. Streamlit st.title / st.set_page_config
 * 6. Falls back to prettifying the folder/package name
 */
async function resolveDisplayName(rootDir: string, scan: ScanResult, analysis: ProjectAnalysis): Promise<void> {
  // 1. package.json displayName field
  const pkgPath = join(rootDir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.displayName) {
        analysis.displayName = pkg.displayName;
        return;
      }
    } catch { /* ignore */ }
  }

  // 2. HTML <title> in index.html variants
  const htmlFiles = scan.files.filter(f =>
    f.name === 'index.html' || f.relativePath.includes('public/index.html')
  );
  for (const file of htmlFiles) {
    const content = readFileContent(file.path, 5000) || '';
    const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      const title = titleMatch[1].trim();
      // Skip generic titles
      if (title && !title.match(/^(react app|vite app|my app|app|index|untitled)$/i)) {
        analysis.displayName = title;
        return;
      }
    }
  }

  // 3. Streamlit st.title() or st.set_page_config(page_title=...)
  const pyFiles = scan.files.filter(f => f.extension === '.py').slice(0, 15);
  for (const file of pyFiles) {
    // Use latin1 to handle files with emoji/special chars that break UTF-8
    let content = '';
    try {
      const { readFileSync } = await import('fs');
      content = readFileSync(file.path, 'latin1').slice(0, 10000);
    } catch {
      content = readFileContent(file.path, 10000) || '';
    }
    const pageConfigMatch = content.match(/page_title\s*=\s*["']([^"']+)["']/i);
    const stTitleMatch = content.match(/st\.title\s*\(\s*["']([^"']+)["']/i);
    const match = pageConfigMatch || stTitleMatch;
    if (match) {
      analysis.displayName = match[1].trim();
      return;
    }
  }

  // 4. document.title = "..." in JS/TS files
  const jsFiles = scan.files
    .filter(f => ['.ts', '.tsx', '.js', '.jsx'].includes(f.extension))
    .slice(0, 20);
  for (const file of jsFiles) {
    const content = readFileContent(file.path, 10000) || '';
    const titleMatch = content.match(/document\.title\s*=\s*["']([^"']+)["']/i);
    if (titleMatch) {
      analysis.displayName = titleMatch[1].trim();
      return;
    }
  }

  // 5. README first H1
  if (analysis.readmePath) {
    const readme = readFileContent(analysis.readmePath, 3000) || '';
    const h1Match = readme.match(/^#\s+(.+)$/m);
    if (h1Match) {
      const title = h1Match[1].trim().replace(/[*_`]/g, '');
      if (title && !title.match(/^(readme|documentation|project)$/i)) {
        analysis.displayName = title;
        return;
      }
    }
  }

  // 6. Prettify the package/folder name as last resort
  // e.g. "my-cool-app" → "My Cool App", "healthbridge" → "Healthbridge"
  const raw = analysis.name || basename(rootDir);
  analysis.displayName = raw
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase → words
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}
