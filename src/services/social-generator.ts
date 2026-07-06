import type { ProjectAnalysis } from '../scanner/project-analyzer.js';
import { getProvider, type AIMessage } from '../ai/provider.js';
import { linkedinPostPrompt, twitterPostPrompt } from '../ai/prompts.js';
import { logger, spinner } from '../utils/logger.js';

export interface SocialContent {
  linkedin: {
    short: string;
    medium: string;
    long: string;
  };
  twitter: string;
  devto: string;
  resumeBullet: string;
  portfolioDescription: string;
}

export async function generateSocialContent(
  analysis: ProjectAnalysis,
  useAI: boolean
): Promise<SocialContent> {
  if (!useAI) {
    return generateTemplateSocialContent(analysis);
  }

  const spin = spinner('Generating social media content...').start();

  try {
    const provider = getProvider();

    // Generate LinkedIn posts (3 versions)
    const [shortPost, mediumPost, longPost, tweet] = await Promise.all([
      generateSingle(provider, linkedinPostPrompt(analysis, 'short')),
      generateSingle(provider, linkedinPostPrompt(analysis, 'medium')),
      generateSingle(provider, linkedinPostPrompt(analysis, 'long')),
      generateSingle(provider, twitterPostPrompt(analysis)),
    ]);

    // Generate additional content
    const devto = await generateSingle(provider, devtoPrompt(analysis));
    const resumeBullet = await generateSingle(provider, resumePrompt(analysis));
    const portfolioDesc = await generateSingle(provider, portfolioPrompt(analysis));

    spin.succeed('Social media content generated');

    return {
      linkedin: {
        short: shortPost,
        medium: mediumPost,
        long: longPost,
      },
      twitter: tweet,
      devto,
      resumeBullet,
      portfolioDescription: portfolioDesc,
    };
  } catch (error: any) {
    spin.fail('Social content generation failed');
    logger.warn(`Falling back to templates: ${error.message}`);
    return generateTemplateSocialContent(analysis);
  }
}

async function generateSingle(provider: any, prompt: string): Promise<string> {
  const messages: AIMessage[] = [
    { role: 'system', content: 'You are a professional content writer for developers.' },
    { role: 'user', content: prompt },
  ];

  const response = await provider.generate(messages, { temperature: 0.8, maxTokens: 2000 });
  return response.content.trim();
}

function devtoPrompt(analysis: ProjectAnalysis): string {
  return `Write a brief DEV.to article draft (title + intro paragraph) announcing this project:

Project: ${analysis.name}
Tech: ${[...analysis.languages, ...analysis.frameworks].join(', ')}
${analysis.description || ''}

Include a catchy title, engaging intro, and mention to include code examples. Return title on first line, then content.`;
}

function resumePrompt(analysis: ProjectAnalysis): string {
  return `Write a single resume bullet point for this project:

Project: ${analysis.name}
Tech: ${[...analysis.languages, ...analysis.frameworks].join(', ')}
${analysis.description || ''}

Format: "Developed/Built/Created [what] using [tech] that [impact/result]"
Return ONLY the bullet point.`;
}

function portfolioPrompt(analysis: ProjectAnalysis): string {
  return `Write a 2-3 sentence portfolio description for this project:

Project: ${analysis.name}
Tech: ${[...analysis.languages, ...analysis.frameworks].join(', ')}
${analysis.description || ''}

Be concise and professional. Return ONLY the description.`;
}

function generateTemplateSocialContent(analysis: ProjectAnalysis): SocialContent {
  const techList = [...analysis.languages, ...analysis.frameworks].join(', ');
  const name = analysis.name;
  const desc = analysis.description || `A ${analysis.languages[0] || ''} project`;

  return {
    linkedin: {
      short: `🚀 Just shipped ${name}! ${desc}. Built with ${techList}. Check it out: [GITHUB_LINK]\n\n#${analysis.languages[0] || 'coding'} #opensource #development`,
      medium: `🚀 Excited to share my latest project: ${name}\n\n${desc}\n\nBuilt with: ${techList}\n\nKey highlights:\n${analysis.features.slice(0, 3).map(f => `• ${f}`).join('\n') || '• Clean architecture\n• Well documented'}\n\nCheck it out: [GITHUB_LINK]\n\nFeedback welcome! 🙏\n\n#${analysis.languages[0] || 'coding'} #opensource #softwaredevelopment`,
      long: `🚀 Excited to announce the release of ${name}!\n\n${desc}\n\n🛠️ Tech Stack: ${techList}\n\nWhat it does:\n${analysis.features.slice(0, 5).map(f => `• ${f}`).join('\n') || '• Solves real-world problems\n• Clean, maintainable code'}\n\nThis project taught me a lot about ${analysis.frameworks[0] || analysis.languages[0] || 'software development'} and building production-quality software.\n\nI'd love to hear your thoughts and feedback. Star it if you find it useful! ⭐\n\n🔗 [GITHUB_LINK]\n\n#${analysis.languages[0] || 'coding'} #opensource #softwaredevelopment #programming`,
    },
    twitter: `🚀 Just released ${name} - ${desc}. Built with ${techList}. [GITHUB_LINK] #${analysis.languages[0] || 'coding'} #opensource`,
    devto: `# Introducing ${name}\n\n${desc}\n\nBuilt with ${techList}.\n\n## Getting Started\n\n*Add installation and usage instructions here.*`,
    resumeBullet: `Developed ${name} using ${techList}${analysis.description ? `, ${analysis.description.toLowerCase()}` : ''}`,
    portfolioDescription: `${name} - ${desc}. Built with ${techList}.`,
  };
}
