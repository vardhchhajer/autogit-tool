import type { ProjectAnalysis } from '../scanner/project-analyzer.js';
import type { ScanResult } from '../scanner/file-scanner.js';
import { getProvider, type AIMessage } from '../ai/provider.js';
import { insightsPrompt } from '../ai/prompts.js';
import { logger, spinner } from '../utils/logger.js';

export interface ProjectInsights {
  documentationScore: { score: number; reason: string };
  codeQualityScore: { score: number; reason: string };
  maintainabilityScore: { score: number; reason: string };
  suggestions: string[];
  performanceRecommendations: string[];
  securityObservations: string[];
  missingTests: string[];
  missingDocumentation: string[];
  todoSummary: string[];
}

export async function generateInsights(
  analysis: ProjectAnalysis,
  scan: ScanResult,
  useAI: boolean
): Promise<ProjectInsights> {
  if (useAI) {
    const spin = spinner('Analyzing project insights...').start();
    try {
      const provider = getProvider();
      const prompt = insightsPrompt(analysis);

      const messages: AIMessage[] = [
        { role: 'system', content: 'You are a senior software engineer providing constructive project analysis. Always return valid JSON.' },
        { role: 'user', content: prompt },
      ];

      const response = await provider.generate(messages, { temperature: 0.3 });
      let content = response.content.trim();

      // Strip markdown fencing
      if (content.startsWith('```json')) {
        content = content.slice(7);
      } else if (content.startsWith('```')) {
        content = content.slice(3);
      }
      if (content.endsWith('```')) {
        content = content.slice(0, -3);
      }

      const data = JSON.parse(content.trim());
      spin.succeed('Project insights generated');

      return {
        documentationScore: data.documentation_score || { score: 5, reason: 'Unable to assess' },
        codeQualityScore: data.code_quality_score || { score: 5, reason: 'Unable to assess' },
        maintainabilityScore: data.maintainability_score || { score: 5, reason: 'Unable to assess' },
        suggestions: data.suggestions || [],
        performanceRecommendations: data.performance_recommendations || [],
        securityObservations: data.security_observations || [],
        missingTests: data.missing_tests || [],
        missingDocumentation: data.missing_documentation || [],
        todoSummary: data.todo_summary || [],
      };
    } catch (error: any) {
      spin.fail('AI insights generation failed');
      logger.warn(`Using static analysis: ${error.message}`);
    }
  }

  // Static analysis fallback
  return generateStaticInsights(analysis, scan);
}

function generateStaticInsights(analysis: ProjectAnalysis, scan: ScanResult): ProjectInsights {
  const insights: ProjectInsights = {
    documentationScore: { score: 0, reason: '' },
    codeQualityScore: { score: 0, reason: '' },
    maintainabilityScore: { score: 0, reason: '' },
    suggestions: [],
    performanceRecommendations: [],
    securityObservations: [],
    missingTests: [],
    missingDocumentation: [],
    todoSummary: [],
  };

  // Documentation score
  let docScore = 0;
  if (analysis.hasReadme) docScore += 3;
  if (scan.files.some(f => f.name === 'CONTRIBUTING.md')) docScore += 2;
  if (scan.files.some(f => f.name === 'CHANGELOG.md')) docScore += 2;
  if (analysis.license) docScore += 1;
  if (analysis.envVars.length > 0) docScore += 1;
  if (scan.files.some(f => f.name.includes('API'))) docScore += 1;
  insights.documentationScore = {
    score: Math.min(docScore, 10),
    reason: docScore >= 7 ? 'Well documented' : docScore >= 4 ? 'Basic documentation present' : 'Needs more documentation',
  };

  // Code quality score (based on tooling)
  let qualityScore = 5; // base
  if (analysis.testFramework) qualityScore += 2;
  if (analysis.cicd.length > 0) qualityScore += 1;
  if (scan.files.some(f => f.name.includes('lint') || f.name.includes('eslint') || f.name.includes('prettier'))) qualityScore += 1;
  if (scan.files.some(f => f.name.includes('.editorconfig'))) qualityScore += 1;
  insights.codeQualityScore = {
    score: Math.min(qualityScore, 10),
    reason: qualityScore >= 8 ? 'Strong quality tooling' : qualityScore >= 5 ? 'Adequate' : 'Consider adding linting and tests',
  };

  // Maintainability
  let maintScore = 5;
  if (analysis.architecture !== 'unknown') maintScore += 1;
  if (scan.directories.length > 3) maintScore += 1; // structured project
  if (analysis.buildSystem) maintScore += 1;
  const avgFileSize = scan.totalSize / Math.max(scan.totalFiles, 1);
  if (avgFileSize < 10000) maintScore += 1; // small files
  if (analysis.languages.length <= 3) maintScore += 1; // focused tech stack
  insights.maintainabilityScore = {
    score: Math.min(maintScore, 10),
    reason: maintScore >= 8 ? 'Highly maintainable' : maintScore >= 5 ? 'Moderate maintainability' : 'Consider restructuring',
  };

  // Suggestions
  if (!analysis.hasReadme) insights.suggestions.push('Add a README.md');
  if (!analysis.testFramework) insights.suggestions.push('Add a testing framework');
  if (analysis.cicd.length === 0) insights.suggestions.push('Set up CI/CD pipeline');
  if (!analysis.license) insights.suggestions.push('Add a LICENSE file');
  if (analysis.envVars.length > 0 && !scan.files.some(f => f.name === '.env.example')) {
    insights.suggestions.push('Add .env.example for environment variable documentation');
  }

  // Missing documentation
  if (!analysis.hasReadme) insights.missingDocumentation.push('README.md');
  if (!scan.files.some(f => f.name === 'CONTRIBUTING.md')) insights.missingDocumentation.push('CONTRIBUTING.md');
  if (!scan.files.some(f => f.name === 'CHANGELOG.md')) insights.missingDocumentation.push('CHANGELOG.md');
  if (analysis.apis.length > 0 && !scan.files.some(f => f.name.includes('API'))) {
    insights.missingDocumentation.push('API documentation');
  }

  // Security
  if (scan.files.some(f => f.name === '.env')) {
    insights.securityObservations.push('Ensure .env is in .gitignore');
  }
  if (!scan.files.some(f => f.name === '.gitignore')) {
    insights.securityObservations.push('Add .gitignore to prevent committing sensitive files');
  }

  return insights;
}
