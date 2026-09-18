import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Resvg } from '@resvg/resvg-js';
import type { Showcase } from './showcase.js';
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
const clean = (value: string) => value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();

function lines(value: string, max = 42): string[] {
  const words = clean(value).split(' ').flatMap(word => word.length > max ? word.match(new RegExp(`.{1,${max}}`, 'g')) || [] : [word]);
  const result: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && `${line} ${word}`.length > max) { result.push(line); line = ''; }
    line = line ? `${line} ${word}` : word;
  }
  if (line) result.push(line);
  return result.slice(0, 3);
}

export function showcaseCardSvg(showcase: Showcase, index: number): string {
  const fact = showcase.facts[index];
  const title = index === 0 ? showcase.name : index === 1 ? 'What it does' : 'Built from the project';
  const body = index === 0 ? `${showcase.kind.toUpperCase()} PROJECT` : fact?.text || showcase.facts[0].text;
  const source = index === 0 ? 'PROJECT SHOWCASE' : `SOURCE: ${fact?.source || showcase.facts[0].source}`;
  const titleLines = lines(title, 27);
  const bodyLines = lines(body);
  const titleText = titleLines.map((line, i) => `<text x="78" y="${208 + i * 66}" font-family="Arial,sans-serif" font-size="54" font-weight="700" fill="#f8f8f5">${escape(line)}</text>`).join('');
  const bodyText = bodyLines.map((line, i) => `<text x="78" y="${410 + i * 42}" font-family="Arial,sans-serif" font-size="32" fill="#d5e8e4">${escape(line)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#152c2a"/><rect x="0" y="0" width="18" height="675" fill="#f4bf62"/><text x="78" y="89" font-family="Arial,sans-serif" font-size="21" font-weight="700" fill="#f4bf62">${escape(source)}</text>${titleText}<rect x="78" y="350" width="130" height="5" fill="#f4bf62"/>${bodyText}<text x="78" y="622" font-family="Arial,sans-serif" font-size="18" fill="#b2c8c3">${index + 1} / 3</text></svg>`;
}

export async function saveShowcaseCards(showcase: Showcase, directory: string): Promise<{ svg: string[]; png: string[] }> {
  mkdirSync(directory, { recursive: true });
  const svg: string[] = [];
  const png: string[] = [];
  for (let i = 0; i < 3; i++) {
    const source = join(directory, `card-${i + 1}.svg`);
    const markup = showcaseCardSvg(showcase, i);
    writeFileSync(source, markup, 'utf8');
    svg.push(source);
    const output = join(directory, `card-${i + 1}.png`);
    writeFileSync(output, new Resvg(markup).render().asPng());
    png.push(output);
  }
  return { svg, png };
}
