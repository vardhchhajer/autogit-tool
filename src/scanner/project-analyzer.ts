import { existsSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { type ScanResult, type FileEntry, readFileContent, findFile } from './file-scanner.js';

export interface ProjectAnalysis {
  name: string;
  languages: string[];
  frameworks: string[];
  libraries: string[];
  packageManager: string | null;
  buildSystem: string | null;
  testFramework: string | null;
  entryPoints: string[];
  features: string[];
  architecture: string;
  database: string[];
  apis: string[];
  envVars: string[];
  deployment: string[];
  license: string | null;
  cicd: string[];
  hasGit: boolean;
  hasReadme: boolean;
  readmePath: string | null;
  description: string | null;
  version: string | null;
}

export function analyzeProject(rootDir: string, scan: ScanResult): ProjectAnalysis {
  const analysis: ProjectAnalysis = {
    name: basename(rootDir),
    languages: [],
    frameworks: [],
    libraries: [],
    packageManager: null,
    buildSystem: null,
    testFramework: null,
    entryPoints: [],
    features: [],
    architecture: 'unknown',
    database: [],
    apis: [],
    envVars: [],
    deployment: [],
    license: null,
    cicd: [],
    hasGit: existsSync(join(rootDir, '.git')),
    hasReadme: false,
    readmePath: null,
    description: null,
    version: null,
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
  const allContent = scan.files
    .filter(f => ['.json', '.toml', '.yaml', '.yml', '.env', '.ts', '.js', '.py'].includes(f.extension))
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

  // Also check .env if it exists (just get keys, not values)
  const envContent = readFileContent(join(rootDir, '.env'));
  if (envContent && analysis.envVars.length === 0) {
    const vars = envContent.split('\n')
      .filter(line => line.includes('=') && !line.startsWith('#'))
      .map(line => line.split('=')[0].trim())
      .filter(v => v.length > 0);
    analysis.envVars.push(...vars);
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
  const testDirs = scan.directories.filter(d =>
    d.includes('test') || d.includes('spec') || d.includes('__tests__')
  );
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
