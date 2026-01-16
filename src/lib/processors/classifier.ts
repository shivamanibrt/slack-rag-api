import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

export interface ClassificationResult {
  shouldIndex: boolean;
  reason: string;
  isSourceOfTruth: boolean;
}

export async function classifyMessage(content: string): Promise<ClassificationResult> {
  // Quick filters to avoid API calls for obvious cases
  if (!content || content.trim().length < 10) {
    return {
      shouldIndex: false,
      reason: 'Message too short',
      isSourceOfTruth: false,
    };
  }

  // System message patterns (no API call needed)
  const systemPatterns = [
    /has joined the channel/i,
    /has left the channel/i,
    /set the channel/i,
    /uploaded a file/i,
  ];

  if (systemPatterns.some((p) => p.test(content))) {
    return {
      shouldIndex: false,
      reason: 'System message',
      isSourceOfTruth: false,
    };
  }

  try {
    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      prompt: `Analyze this Slack message and classify it for a knowledge base.

Message: "${content}"

Determine:
1. Should this be indexed? (YES/NO)
   - Index if: questions, answers, solutions, decisions, procedures, bug reports, documentation
   - Skip if: greetings ("thanks", "lol", "ok"), casual chat, very short messages

2. Is this a "source of truth"? (YES/NO)
   - Source of truth = final decisions, official answers, confirmed solutions
   - Examples: "We decided to...", "The solution is...", "Official policy is..."
   - NOT source of truth = questions, brainstorming, opinions, discussions

Reply in this exact format:
SHOULD_INDEX: YES/NO
SOURCE_OF_TRUTH: YES/NO
REASON: brief explanation

Your classification:`,
    });

    const lines = text.split('\n');
    const shouldIndexLine = lines.find((l) => l.startsWith('SHOULD_INDEX:'));
    const sourceOfTruthLine = lines.find((l) => l.startsWith('SOURCE_OF_TRUTH:'));
    const reasonLine = lines.find((l) => l.startsWith('REASON:'));

    const shouldIndex = shouldIndexLine?.includes('YES') || false;
    const isSourceOfTruth = sourceOfTruthLine?.includes('YES') || false;
    const reason = reasonLine?.replace('REASON:', '').trim() || 'AI classification';

    return {
      shouldIndex,
      reason,
      isSourceOfTruth,
    };
  } catch (error) {
    console.error('Error classifying message, using fallback:', error);

    return {
      shouldIndex: content.length >= 20,
      reason: 'Fallback classification (AI error)',
      isSourceOfTruth: false,
    };
  }
}
