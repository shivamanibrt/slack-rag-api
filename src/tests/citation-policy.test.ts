import { generateAnswerWithCitations } from '../lib/ai/answering.js';
import { describe, test, expect } from '@jest/globals';
import type { SearchResult } from '../lib/retrieval/search.js';

describe('Citation Policy', () => {
  // Helper to create mock search results
  const createMockResult = (
    id: number,
    content: string,
    isCustomerSafe: boolean,
  ): SearchResult => ({
    id,
    content,
    source_type: 'slack',
    source_id: `msg_${id}`,
    channel_id: 'C123',
    author: 'Test User',
    timestamp: new Date(),
    permalink: `https://slack.com/msg_${id}`,
    is_source_of_truth: false,
    is_customer_safe: isCustomerSafe,
    similarity: 0.9,
  });

  test('internal mode should accept all sources', async () => {
    const mockResults = [
      createMockResult(1, 'Internal discussion about the bug fix', false),
      createMockResult(2, 'Public documentation about the feature', true),
    ];

    const result = await generateAnswerWithCitations(
      'How do we fix the bug?',
      mockResults,
      'internal',
    );

    // Internal mode can cite both internal and customer-safe sources
    expect(result.mode).toBe('internal');
    expect(result.canCiteForCustomer).toBe(true);
  });

  test('customer mode should only use customer-safe sources', async () => {
    const mockResults = [
      createMockResult(1, 'Internal team discussion', false),
      createMockResult(2, 'Official support article', true),
      createMockResult(3, 'Customer-facing documentation', true),
    ];

    const result = await generateAnswerWithCitations(
      'How does this feature work?',
      mockResults,
      'customer',
    );

    // All citations should be customer-safe
    result.citations.forEach((cite) => {
      expect(cite.is_customer_safe).toBe(true);
    });

    expect(result.mode).toBe('customer');
  });

  test('customer mode with no safe sources returns appropriate message', async () => {
    const mockResults = [
      createMockResult(1, 'Internal only discussion', false),
      createMockResult(2, 'Team planning notes', false),
    ];

    const result = await generateAnswerWithCitations(
      'What is the deployment process?',
      mockResults,
      'customer',
    );

    // Should return message about internal-only content
    expect(result.answer).toContain('internal-only');
    expect(result.citations.length).toBe(0);
    expect(result.canCiteForCustomer).toBe(false);
  });

  test('customer mode with mixed sources filters correctly', async () => {
    const mockResults = [
      createMockResult(1, 'Internal debugging notes', false),
      createMockResult(2, 'Public help article about authentication', true),
      createMockResult(3, 'Team slack discussion', false),
      createMockResult(4, 'Official API documentation', true),
    ];

    const result = await generateAnswerWithCitations(
      'How does authentication work?',
      mockResults,
      'customer',
    );

    // Should only have citations from customer-safe sources (2 and 4)
    result.citations.forEach((cite) => {
      expect(cite.is_customer_safe).toBe(true);
      expect([2, 4]).toContain(cite.source_id === 'msg_2' ? 2 : 4);
    });

    expect(result.canCiteForCustomer).toBe(true);
  });

  test('handles empty search results gracefully', async () => {
    const result = await generateAnswerWithCitations('What is the answer?', [], 'internal');

    expect(result.answer).toContain("don't have enough information");
    expect(result.citations.length).toBe(0);
  });

  test('citation numbers should be valid and sequential', async () => {
    const mockResults = [
      createMockResult(1, 'First piece of information', true),
      createMockResult(2, 'Second piece of information', true),
      createMockResult(3, 'Third piece of information', true),
    ];

    const result = await generateAnswerWithCitations(
      'Tell me about the process',
      mockResults,
      'internal',
    );

    // Extract citation numbers from answer
    const citationMatches = result.answer.match(/\[(\d+)\]/g);

    if (citationMatches) {
      citationMatches.forEach((match) => {
        const num = parseInt(match.replace(/\[|\]/g, ''));
        // Citation numbers should be within valid range
        expect(num).toBeGreaterThanOrEqual(1);
        expect(num).toBeLessThanOrEqual(mockResults.length);
      });
    }
  });

  test('invalid citations are cleaned from answer', async () => {
    const mockResults = [createMockResult(1, 'Only one source available', true)];

    const result = await generateAnswerWithCitations(
      'What is the answer?',
      mockResults,
      'internal',
    );

    // Answer should not contain citations beyond [1]
    expect(result.answer).not.toMatch(/\[2\]/);
    expect(result.answer).not.toMatch(/\[3\]/);
    expect(result.answer).not.toMatch(/\[4\]/);
  });
});
