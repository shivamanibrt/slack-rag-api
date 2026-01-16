import { classifyMessage } from '../lib/processors/classifier.js';
import { describe, test, expect } from '@jest/globals';

describe('Message Classifier', () => {
  test('should skip short messages', async () => {
    const result = await classifyMessage('ok');
    expect(result.shouldIndex).toBe(false);
    expect(result.reason).toContain('short');
  });

  test('should index knowledge messages', async () => {
    const result = await classifyMessage('How do we deploy to production?');
    expect(result.shouldIndex).toBe(true);
  });

  test('should detect source of truth', async () => {
    const result = await classifyMessage('We decided to use PostgreSQL for our database');
    expect(result.shouldIndex).toBe(true);
    expect(result.isSourceOfTruth).toBe(true);
  });

  test('should skip system messages', async () => {
    const result = await classifyMessage('has joined the channel');
    expect(result.shouldIndex).toBe(false);
    expect(result.reason).toContain('System');
  });

  // EDGE CASES BELOW
  test('should handle empty strings', async () => {
    const result = await classifyMessage('');
    expect(result.shouldIndex).toBe(false);
  });

  test('should handle whitespace only', async () => {
    const result = await classifyMessage('   ');
    expect(result.shouldIndex).toBe(false);
  });

  test('should detect multiple source of truth patterns', async () => {
    const result = await classifyMessage('We agreed that the final decision is to use React');
    expect(result.isSourceOfTruth).toBe(true);
  });

  test('should index technical discussions', async () => {
    const result = await classifyMessage(
      'This is a detailed explanation of our project architecture using microservices with PostgreSQL and Redis for caching',
    );
    expect(result.shouldIndex).toBe(true);
  });

  test('should detect questions with different formats', async () => {
    const result = await classifyMessage("What's the best way to handle authentication?");
    expect(result.shouldIndex).toBe(true);
  });

  test('should skip casual messages', async () => {
    const result = await classifyMessage('Thanks!');
    expect(result.shouldIndex).toBe(false);
  });

  test('should index bug reports', async () => {
    const result = await classifyMessage("Bug: Login form doesn't validate email properly");
    expect(result.shouldIndex).toBe(true);
  });
});
