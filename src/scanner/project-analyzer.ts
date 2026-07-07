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

export function analyzeProject(rootDir: string, scan: ScanResult): ProjectAnalysis {
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
  detectPythonProject(rootDir, scan, analysis);
  detectRustProject(rootDir, scan, analysis);
  detectGoProject(rootDir, scan, analysis);
  detectJavaProject(rootDir, scan, analysis);
  detectDotNetProject(rootDir, scan, analysis);

  // Deep code analysis — reads actual source files
  deepCodeAnalysis(rootDir, scan, analysis);

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
  resolveDisplayName(rootDir, scan, analysis);

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

function detectPythonProject(rootDir: string, scan: ScanResult, analysis: ProjectAnalysis): void {
  const hasPyproject = existsSync(join(rootDir, 'pyproject.toml'));
  const hasSetupPy = existsSync(join(rootDir, 'setup.py'));
  const hasRequirements = existsSync(join(rootDir, 'requirements.txt'));
  const hasPipfile = existsSync(join(rootDir, 'Pipfile'));
  const hasPoetry = existsSync(join(rootDir, 'poetry.lock'));

  if (!hasPyproject && !hasSetupPy && !hasRequirements && !hasPipfile) return;

  if (hasPoetry) analysis.packageManager = 'poetry';
  else if (hasPipfile) analysis.packageManager = 'pipenv';
  else if (hasPyproject) analysis.packageManager = 'pip (pyproject.toml)';
  else analysis.packageManager = 'pip';

  // Read requirements to detect frameworks
  let deps = '';
  if (hasRequirements) {
    deps = readFileContent(join(rootDir, 'requirements.txt')) || '';
  }

  const pyFrameworks: Record<string, string> = {
    'django': 'Django', 'flask': 'Flask', 'fastapi': 'FastAPI',
    'streamlit': 'Streamlit', 'pytorch': 'PyTorch', 'tensorflow': 'TensorFlow',
    'pandas': 'Pandas', 'numpy': 'NumPy', 'scipy': 'SciPy',
    'celery': 'Celery', 'scrapy': 'Scrapy',
  };

  for (const [dep, framework] of Object.entries(pyFrameworks)) {
    if (deps.toLowerCase().includes(dep)) {
      analysis.frameworks.push(framework);
    }
  }

  // Check for manage.py (Django)
  if (findFile(scan, 'manage.py')) {
    if (!analysis.frameworks.includes('Django')) {
      analysis.frameworks.push('Django');
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

/**
 * Read actual source files to extract:
 * - Routes / API endpoints
 * - Page and component counts
 * - Concrete features (auth, file upload, payment, etc.)
 */
function deepCodeAnalysis(rootDir: string, scan: ScanResult, analysis: ProjectAnalysis): void {
  const sourceExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.cs', '.java', '.kt'];
  const sourceFiles = scan.files
    .filter(f => sourceExts.includes(f.extension))
    .slice(0, 60); // cap to keep things fast

  // Count pages and components
  const pageFiles = scan.files.filter(f =>
    f.relativePath.match(/\/(pages|app|views|screens)\/.*\.(tsx?|jsx?|py|vue|svelte)$/i)
  );
  const componentFiles = scan.files.filter(f =>
    f.relativePath.match(/\/components?\/.*\.(tsx?|jsx?|vue|svelte)$/i)
  );
  analysis.pageCount = pageFiles.length;
  analysis.componentCount = componentFiles.length;

  // Feature detection patterns — search across source files
  const featurePatterns: Array<{ pattern: RegExp; feature: string }> = [
    { pattern: /auth|login|signin|signup|jwt|oauth|passport/i,    feature: 'Authentication' },
    { pattern: /upload|multer|formdata|file.*upload/i,             feature: 'File Upload' },
    { pattern: /stripe|payment|checkout|billing/i,                 feature: 'Payment Integration' },
    { pattern: /socket\.io|websocket|ws\s*=|realtime/i,            feature: 'Real-time (WebSocket)' },
    { pattern: /email|nodemailer|sendgrid|mailgun|smtp/i,          feature: 'Email Notifications' },
    { pattern: /notification|push.*notif|fcm|apns/i,               feature: 'Push Notifications' },
    { pattern: /chart|graph|d3\.|recharts|plotly/i,                feature: 'Data Visualization' },
    { pattern: /pdf|puppeteer|reportlab|fpdf/i,                    feature: 'PDF Generation' },
    { pattern: /cron|schedule|celery|bull|agenda/i,                feature: 'Background Jobs' },
    { pattern: /cache|redis\.set|memcache/i,                       feature: 'Caching' },
    { pattern: /search|elasticsearch|algolia|whoosh/i,             feature: 'Search' },
    { pattern: /map|leaflet|mapbox|google.*maps/i,                 feature: 'Maps Integration' },
    { pattern: /ai|openai|anthropic|gemini|llm|langchain/i,        feature: 'AI Integration' },
    { pattern: /barcode|qrcode|scanner/i,                          feature: 'Barcode/QR Scanner' },
    { pattern: /dashboard|analytics|metric/i,                      feature: 'Analytics Dashboard' },
    { pattern: /crud|create.*read.*update.*delete/i,               feature: 'CRUD Operations' },
    { pattern: /export|csv|xlsx|excel/i,                           feature: 'Data Export' },
    { pattern: /import|migration|seed/i,                           feature: 'Data Import/Migration' },
    { pattern: /role|permission|rbac|acl/i,                        feature: 'Role-based Access Control' },
    { pattern: /encrypt|decrypt|crypto|aes|rsa/i,                  feature: 'Encryption' },
    { pattern: /sms|twilio|vonage/i,                               feature: 'SMS Integration' },
    { pattern: /speech|whisper|tts|stt/i,                          feature: 'Speech Processing' },
    { pattern: /blockchain|solana|ethereum|web3/i,                  feature: 'Blockchain' },
    { pattern: /docker|container|kubernetes/i,                      feature: 'Containerization' },
    { pattern: /thermal.*print|tspl|zpl|label.*print/i,            feature: 'Label Printing' },
  ];

  const foundFeatures = new Set<string>();
  const routes: string[] = [];

  // Route extraction patterns
  const routePatterns = [
    /(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`](\/[^'"` ]*)/gi,
    /@(?:Get|Post|Put|Delete|Patch)\s*\(\s*['"`](\/[^'"` ]*)/gi,
    /path\s*=\s*['"`](\/[^'"` ]+)/gi,
    /url_prefix\s*=\s*['"`](\/[^'"` ]+)/gi,
  ];

  for (const file of sourceFiles) {
    const content = readFileContent(file.path, 30000);
    if (!content) continue;

    // Feature detection
    for (const { pattern, feature } of featurePatterns) {
      if (pattern.test(content)) foundFeatures.add(feature);
    }

    // Route extraction
    for (const routePattern of routePatterns) {
      const matches = [...content.matchAll(routePattern)];
      for (const match of matches.slice(0, 5)) {
        const route = match[2] || match[1];
        if (route && route.length > 1 && !routes.includes(route)) {
          routes.push(route);
        }
      }
    }
  }

  analysis.codeFeatures = [...foundFeatures];
  analysis.apiRoutes = routes.slice(0, 20);

  // Merge code features into main features list (deduplicated)
  const allFeatures = new Set([...analysis.features, ...analysis.codeFeatures]);
  analysis.features = [...allFeatures];
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
function resolveDisplayName(rootDir: string, scan: ScanResult, analysis: ProjectAnalysis): void {
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
    const content = readFileContent(file.path, 10000) || '';
    const titleMatch =
      content.match(/st\.title\s*\(\s*["']([^"']+)["']/i) ||
      content.match(/page_title\s*=\s*["']([^"']+)["']/i);
    if (titleMatch) {
      analysis.displayName = titleMatch[1].trim();
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
