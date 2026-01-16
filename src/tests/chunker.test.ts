import { chunkMessages } from '../lib/processors/chunker.js';
import { describe, test, expect } from '@jest/globals';
import type { SlackMessage } from '../lib/services/slack-service.js';

describe('Message Chunker', () => {
  // Helper to create mock Slack messages
  const createMockMessage = (text: string, ts: string, threadTs?: string): SlackMessage => ({
    text,
    user: 'U123',
    ts,
    thread_ts: threadTs,
    permalink: `https://slack.com/${ts}`,
  });

  test('should group thread messages together', () => {
    const messages: SlackMessage[] = [
      createMockMessage('Thread starter message', '1000.000'),
      createMockMessage('First reply', '1001.000', '1000.000'),
      createMockMessage('Second reply', '1002.000', '1000.000'),
      createMockMessage('Third reply', '1003.000', '1000.000'),
    ];

    const chunks = chunkMessages(messages);

    // Should have 1 thread chunk (containing only replies) + 1 standalone (starter)
    const threadChunks = chunks.filter((c) => c.isThread);
    expect(threadChunks.length).toBe(1);

    const threadChunk = threadChunks[0];
    expect(threadChunk.messages.length).toBe(3); // Only the 3 replies
    expect(threadChunk.threadTs).toBe('1000.000');
    expect(threadChunk.content).toContain('First reply');
  });

  test('should keep standalone messages separate', () => {
    const messages: SlackMessage[] = [
      createMockMessage('Standalone message 1', '1000.000'),
      createMockMessage('Standalone message 2', '1001.000'),
      createMockMessage('Standalone message 3', '1002.000'),
    ];

    const chunks = chunkMessages(messages);

    // Should have 3 standalone chunks
    expect(chunks.length).toBe(3);

    chunks.forEach((chunk) => {
      expect(chunk.isThread).toBe(false);
      expect(chunk.messages.length).toBe(1);
      expect(chunk.threadTs).toBeUndefined();
    });
  });

  test('should handle mixed threads and standalone messages', () => {
    const messages: SlackMessage[] = [
      createMockMessage('Standalone 1', '1000.000'),
      createMockMessage('Thread start', '1001.000'),
      createMockMessage('Thread reply 1', '1002.000', '1001.000'),
      createMockMessage('Standalone 2', '1003.000'),
      createMockMessage('Thread reply 2', '1004.000', '1001.000'),
    ];

    const chunks = chunkMessages(messages);

    // Should have 4 chunks total: 3 standalone (including thread starter) + 1 thread (replies)
    expect(chunks.length).toBe(4);

    const threadChunks = chunks.filter((c) => c.isThread);
    const standaloneChunks = chunks.filter((c) => !c.isThread);

    expect(threadChunks.length).toBe(1);
    expect(standaloneChunks.length).toBe(3);

    // Thread should contain 2 messages (only the 2 replies)
    const threadChunk = threadChunks[0];
    expect(threadChunk.messages.length).toBe(2);
  });

  test('should handle multiple separate threads', () => {
    const messages: SlackMessage[] = [
      createMockMessage('Thread 1 start', '1000.000'),
      createMockMessage('Thread 1 reply', '1001.000', '1000.000'),
      createMockMessage('Thread 2 start', '1002.000'),
      createMockMessage('Thread 2 reply', '1003.000', '1002.000'),
    ];

    const chunks = chunkMessages(messages);

    // Should have 2 thread chunks + 2 standalone (the starters)
    const threadChunks = chunks.filter((c) => c.isThread);
    expect(threadChunks.length).toBe(2);

    // Each thread should have 1 message (only the reply)
    threadChunks.forEach((chunk) => {
      expect(chunk.messages.length).toBe(1);
    });

    // Threads should have different thread_ts
    expect(threadChunks[0].threadTs).not.toBe(threadChunks[1].threadTs);
  });

  test('should combine thread messages with separator', () => {
    const messages: SlackMessage[] = [
      createMockMessage('First message', '1000.000'),
      createMockMessage('Second message', '1001.000', '1000.000'),
      createMockMessage('Third message', '1002.000', '1000.000'),
    ];

    const chunks = chunkMessages(messages);

    const threadChunk = chunks.find((c) => c.isThread);
    expect(threadChunk).toBeDefined();

    // Content should be separated by '---' (only replies are in thread)
    expect(threadChunk!.content).toContain('---');
    expect(threadChunk!.content).toContain('Second message');
    expect(threadChunk!.content).toContain('Third message');
  });

  test('should handle empty message array', () => {
    const messages: SlackMessage[] = [];
    const chunks = chunkMessages(messages);

    expect(chunks.length).toBe(0);
  });

  test('should preserve message metadata in chunks', () => {
    const messages: SlackMessage[] = [createMockMessage('Test message', '1000.000')];

    const chunks = chunkMessages(messages);

    expect(chunks.length).toBe(1);
    expect(chunks[0].messages[0].ts).toBe('1000.000');
    expect(chunks[0].messages[0].user).toBe('U123');
    expect(chunks[0].messages[0].permalink).toBe('https://slack.com/1000.000');
  });

  test('thread chunk should use first message timestamp as thread_ts', () => {
    const messages: SlackMessage[] = [
      createMockMessage('Original', '1000.000'),
      createMockMessage('Reply 1', '1001.000', '1000.000'),
      createMockMessage('Reply 2', '1002.000', '1000.000'),
    ];

    const chunks = chunkMessages(messages);
    const threadChunk = chunks.find((c) => c.isThread);

    expect(threadChunk?.threadTs).toBe('1000.000');
  });

  test('should handle long threads correctly', () => {
    const messages: SlackMessage[] = [
      createMockMessage('Thread start', '1000.000'),
      ...Array.from({ length: 50 }, (_, i) =>
        createMockMessage(`Reply ${i + 1}`, `${1001 + i}.000`, '1000.000'),
      ),
    ];

    const chunks = chunkMessages(messages);

    const threadChunk = chunks.find((c) => c.isThread);
    expect(threadChunk).toBeDefined();
    expect(threadChunk!.messages.length).toBe(50); // Only the 50 replies
    expect(threadChunk!.isThread).toBe(true);
  });
});
