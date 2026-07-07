import { resolve } from 'path';
import chalk from 'chalk';
import Table from 'cli-table3';
import { scanProject } from '../scanner/file-scanner.js';
import { analyzeProject } from '../scanner/project-analyzer.js';
import { generateInsights } from '../services/insights.js';
import { logger } from '../utils/logger.js';

export async function cmdAnalyze(opts: { ai?: boolean }): Promise<void> {
  const rootDir = resolve(process.cwd());

  logger.header('Project Analysis');

  const scan = scanProject(rootDir);
  const analysis = await analyzeProject(rootDir, scan);
  const useAI = opts.ai !== false;

  // Display project info
  const infoTable = new Table({
    style: { head: ['cyan'] },
  });

  infoTable.push(
    { 'Project': analysis.name },
    { 'Languages': analysis.languages.join(', ') || 'None detected' },
    { 'Frameworks': analysis.frameworks.join(', ') || 'None detected' },
    { 'Package Manager': analysis.packageManager || 'None' },
    { 'Build System': analysis.buildSystem || 'None' },
    { 'Architecture': analysis.architecture },
    { 'Test Framework': analysis.testFramework || 'None' },
    { 'Files': `${scan.totalFiles}` },
    { 'License': analysis.license || 'None' },
  );

  console.log(infoTable.toString());
  logger.blank();

  // Generate insights
  const insights = await generateInsights(analysis, scan, useAI);

  // Scores table
  logger.header('Scores');
  const scoreTable = new Table({
    head: ['Area', 'Score', 'Assessment'],
    style: { head: ['cyan'] },
  });

  scoreTable.push(
    ['Documentation', formatScore(insights.documentationScore.score), insights.documentationScore.reason],
    ['Code Quality', formatScore(insights.codeQualityScore.score), insights.codeQualityScore.reason],
    ['Maintainability', formatScore(insights.maintainabilityScore.score), insights.maintainabilityScore.reason],
  );

  console.log(scoreTable.toString());

  // Suggestions
  if (insights.suggestions.length > 0) {
    logger.blank();
    logger.header('Suggestions');
    for (const s of insights.suggestions) {
      logger.step(s);
    }
  }

  // Security
  if (insights.securityObservations.length > 0) {
    logger.blank();
    logger.header('Security Observations');
    for (const s of insights.securityObservations) {
      logger.warn(s);
    }
  }

  // Missing docs
  if (insights.missingDocumentation.length > 0) {
    logger.blank();
    logger.header('Missing Documentation');
    for (const d of insights.missingDocumentation) {
      logger.dimmed(`  • ${d}`);
    }
  }
}

function formatScore(score: number): string {
  if (score >= 8) return chalk.green(`${score}/10`);
  if (score >= 5) return chalk.yellow(`${score}/10`);
  return chalk.red(`${score}/10`);
}
