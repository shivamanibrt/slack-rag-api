import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

export async function isCustomerSafe(content: string): Promise<boolean> {
  try {
    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      prompt: `Analyze this message and determine if it's safe to show to customers (external users) or if it's internal-only discussion.

Message: "${content}"

Reply with ONLY "CUSTOMER_SAFE" or "INTERNAL_ONLY"

CUSTOMER_SAFE = Official documentation, public information, help articles, support contact info
INTERNAL_ONLY = Team discussions, internal decisions, debugging notes, planning, casual chat

Your answer:`,
    });

    const result = text.trim().toUpperCase();
    return result === 'CUSTOMER_SAFE';
  } catch (error) {
    console.error('Error detecting customer-safe, defaulting to internal:', error);
    return false;
  }
}
