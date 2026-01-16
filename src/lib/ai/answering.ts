import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import type { SearchResult } from '../retrieval/search.js';

export interface AnswerWithCitations {
  answer: string;
  citations: Citation[];
  mode: 'internal' | 'customer';
  canCiteForCustomer: boolean;
}

export interface Citation {
  source_id: string;
  content: string;
  author?: string | undefined;
  timestamp?: Date | undefined;
  permalink?: string | undefined;
  is_customer_safe: boolean;
}

function cleanInvalidCitations(text: string, maxValidCitation: number): string {
  if (maxValidCitation === 0) {
    // Remove all citations if no valid sources
    return text.replace(/\[\d+\]/g, '');
  }

  // Remove any citation number greater than maxValidCitation
  return text.replace(/\[(\d+)\]/g, (match, num) => {
    const citationNum = parseInt(num, 10);
    if (citationNum > maxValidCitation) {
      return ''; // Remove invalid citation
    }
    return match; // Keep valid citation
  });
}

export async function generateAnswerWithCitations(
  query: string,
  searchResults: SearchResult[],
  mode: 'internal' | 'customer' = 'internal',
): Promise<AnswerWithCitations> {
  // If NO search results at all, return early
  if (searchResults.length === 0) {
    return {
      answer:
        "I don't have enough information in the knowledge base to answer this question. Please try rephrasing your question or check if the information has been added to the system.",
      citations: [],
      mode,
      canCiteForCustomer: false,
    };
  }

  // Filter results based on mode
  const relevantResults =
    mode === 'customer' ? searchResults.filter((r) => r.is_customer_safe) : searchResults;

  // Check if we have customer-safe sources
  const hasCustomerSafeSources = searchResults.some((r) => r.is_customer_safe);

  // If customer mode and no safe sources, return early
  if (mode === 'customer' && relevantResults.length === 0) {
    return {
      answer:
        "I found some information, but it's marked as internal-only and cannot be shared with customers. Please consider creating an approved knowledge article or contact the internal team for this information.",
      citations: [],
      mode,
      canCiteForCustomer: false,
    };
  }

  // PRE-FILTER: Check if context is actually relevant to the question
  const relevanceContext = relevantResults
    .slice(0, 10) // Check top 10 results
    .map((r, i) => `[${i + 1}] ${r.content.substring(0, 500)}`)
    .join('\n\n');

  const { text: relevanceCheck } = await generateText({
    model: openai('gpt-4o-mini'),
    prompt: `Question: ${query}

Available context snippets:
${relevanceContext}

Task: Determine if ANY of these context snippets contain information that could help answer the question.

Respond with ONLY "YES" or "NO".

YES = At least one snippet contains relevant information to answer this specific question
NO = None of the snippets are relevant to answering this specific question

Answer:`,
    temperature: 0,
  });

  const isRelevant = relevanceCheck.trim().toUpperCase().includes('YES');

  if (!isRelevant) {
    return {
      answer: "I don't have enough information in the knowledge base to answer this question.",
      citations: [],
      mode,
      canCiteForCustomer: false,
    };
  }

  // Build context from search results with clear numbering
  const context = relevantResults
    .map((r, i) => `[Source ${i + 1}]\n${r.content}`)
    .join('\n\n---\n\n');

  const systemPrompt =
    mode === 'customer'
      ? `You are a helpful assistant answering customer questions. 
       
CRITICAL RULES:
- Use ONLY the provided context to answer
- First determine: Does the context actually contain information relevant to this specific question?
- If the context is about completely different topics, respond with: "I don't have enough information in the knowledge base to answer this."
- NEVER make up information or provide answers not in the context
- NEVER answer questions about unrelated topics found in the context
- Only cite sources that directly answer the question asked
- Only cite sources that are marked as customer-safe
- Be professional and helpful
- If unsure or if context is irrelevant, say "I don't have enough information in the knowledge base to answer this"`
      : `You are a helpful assistant answering internal team questions.

CRITICAL RULES:
- Use ONLY the provided context to answer
- First determine: Does the context actually contain information relevant to this specific question?
- If the context is about completely different topics, respond with: "I don't have enough information in the knowledge base to answer this."
- NEVER make up information or provide answers not in the context
- NEVER answer questions about unrelated topics found in the context
- Only cite sources that directly answer the question asked
- You can cite any source provided
- If unsure or if context is irrelevant, say "I don't have enough information in the knowledge base to answer this"`;

  const userPrompt = `You have access to ${relevantResults.length} source(s) from the knowledge base.

Context from knowledge base:
${context}

Question: ${query}

CITATION RULES - READ CAREFULLY:
1. You have EXACTLY ${relevantResults.length} source(s) available
2. Valid citation numbers are ONLY: ${Array.from({ length: relevantResults.length }, (_, i) => `[${i + 1}]`).join(', ')}
3. DO NOT use citation numbers that don't exist (like [${relevantResults.length + 1}] or higher)
4. You MUST cite sources using [1], [2], [3], etc. when you use information from them
5. If you use information from multiple sources, cite ALL of them (e.g., "Deployments happen during business hours [1]. We also use automated rollbacks [2].")
6. Place citation numbers immediately after the statements they support
7. If a statement is supported by multiple sources, list all: [1][2]
8. ONLY use citations that actually exist in the available sources

Answer Guidelines:
- Based ONLY on the context above, provide a clear answer
- If the context doesn't contain information to answer this specific question, respond with: "I don't have enough information in the knowledge base to answer this."
- CITE EVERY source you use
- DO NOT invent citation numbers

Remember: You can ONLY use citations [1] through [${relevantResults.length}]. Any citation number outside this range is INVALID.`;

  const { text: rawAnswer } = await generateText({
    model: openai('gpt-4o-mini'),
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.1,
  });

  const cleanedAnswer = cleanInvalidCitations(rawAnswer, relevantResults.length);

  // Parse which citations
  const usedCitationIndices = new Set<number>();
  const citationRegex = /\[(\d+)\]/g;
  let match;

  while ((match = citationRegex.exec(cleanedAnswer)) !== null) {
    const citationIndex = parseInt(match[1] ?? '', 10);
    if (citationIndex > 0 && citationIndex <= relevantResults.length) {
      usedCitationIndices.add(citationIndex - 1); // Convert to 0-based index
    }
  }

  // Create citations array ONLY for citations that were actually used AND exist
  const citations: Citation[] = Array.from(usedCitationIndices)
    .sort((a, b) => a - b)
    .map((index) => relevantResults[index])
    .filter((result): result is SearchResult => result !== undefined)
    .map((result) => ({
      source_id: result.source_id,
      content: result.content,
      author: result.author,
      timestamp: result.timestamp,
      permalink: result.permalink,
      is_customer_safe: result.is_customer_safe,
    }));

  return {
    answer: cleanedAnswer.trim(),
    citations,
    mode,
    canCiteForCustomer: mode === 'customer' ? hasCustomerSafeSources : true,
  };
}
