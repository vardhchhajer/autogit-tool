import { existsSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { createRequire } from 'module';
import { getProvider, type AIMessage } from '../ai/provider.js';
import { pdfToLatexPrompt } from '../ai/prompts.js';
import { logger, spinner } from '../utils/logger.js';

const _require = createRequire(import.meta.url);

export interface ConversionResult {
  latex: string;
  outputPath: string;
}

/**
 * Extract text from a PDF file using pdf-parse
 */
export async function extractPDFText(pdfPath: string): Promise<string> {
  if (!existsSync(pdfPath)) {
    throw new Error(`PDF not found: ${pdfPath}`);
  }

  const { readFileSync } = await import('fs');

  try {
    const { PDFParse } = await import('pdf-parse');
    const buffer = readFileSync(pdfPath);
    const parser = new PDFParse({ data: buffer });
    let text: string;
    try {
      const data = await parser.getText();
      text = data.text.trim();
    } finally {
      await parser.destroy();
    }

    if (!text || text.length < 50) {
      throw new Error('PDF appears to be empty or image-only (scanned PDF). Text extraction requires a text-based PDF.');
    }

    return text;
  } catch (e: any) {
    if (e.message.includes('empty') || e.message.includes('image-only')) throw e;
    throw new Error(`Failed to read PDF: ${e.message}`);
  }
}

/**
 * Convert extracted PDF text into a LaTeX resume using AI
 */
export async function convertPDFToLatex(
  pdfPath: string,
  ownerInfo: { name?: string; email?: string; website?: string }
): Promise<ConversionResult> {

  // Step 1: Extract text
  const extractSpin = spinner('Extracting text from PDF...').start();
  let resumeText: string;
  try {
    resumeText = await extractPDFText(pdfPath);
    extractSpin.succeed(`Extracted ${resumeText.length.toLocaleString()} characters from PDF`);
  } catch (e: any) {
    extractSpin.fail(`PDF extraction failed: ${e.message}`);
    throw e;
  }

  logger.verbose('--- Extracted text preview ---');
  logger.verbose(resumeText.slice(0, 500));
  logger.verbose('---');

  // Step 2: Send to AI
  const aiSpin = spinner('Converting to LaTeX with AI...').start();
  try {
    const provider = getProvider();
    const prompt = pdfToLatexPrompt(resumeText, ownerInfo);

    const messages: AIMessage[] = [
      {
        role: 'system',
        content: 'You are a LaTeX expert. You convert resume content into clean, compilable LaTeX using the exact template structure provided. You never add markdown fences or explanations — only LaTeX source code.',
      },
      { role: 'user', content: prompt },
    ];

    const response = await provider.generate(messages, {
      temperature: 0.2,   // Low temperature for accurate conversion
      maxTokens: 8192,
    });

    let latex = response.content.trim();

    // Strip any accidental markdown fences
    latex = latex
      .replace(/^```(?:latex|tex)?\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim();

    // Validate it looks like LaTeX
    if (!latex.includes('\\documentclass') || !latex.includes('\\end{document}')) {
      throw new Error('AI returned invalid LaTeX — missing \\documentclass or \\end{document}');
    }

    aiSpin.succeed('LaTeX conversion complete');

    // Step 3: Save output
    const outputPath = determineOutputPath(pdfPath);
    writeFileSync(outputPath, latex, 'utf-8');

    return { latex, outputPath };
  } catch (e: any) {
    aiSpin.fail(`AI conversion failed: ${e.message}`);
    throw e;
  }
}

function determineOutputPath(pdfPath: string): string {
  const dir = pdfPath.replace(/[/\\][^/\\]+$/, '');
  const baseName = pdfPath.split(/[/\\]/).pop()!.replace(/\.pdf$/i, '');
  const candidate = join(dir, `${baseName}.tex`);
  try {
    const { accessSync, constants } = _require('fs');
    accessSync(dir, constants.W_OK);
    return candidate;
  } catch {
    return join(homedir(), '.autogit', `${baseName}.tex`);
  }
}
