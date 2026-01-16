import type { SlackMessage } from '../services/slack-service.js';

export interface MessageChunk {
  content: string;
  messages: SlackMessage[];
  isThread: boolean;
  threadTs?: string;
}

export function chunkMessages(messages: SlackMessage[]): MessageChunk[] {
  const chunks: MessageChunk[] = [];
  const threadsMap = new Map<string, SlackMessage[]>();
  const standaloneMessages: SlackMessage[] = [];

  // Group messages by thread
  for (const msg of messages) {
    if (msg.thread_ts) {
      // This is a thread reply
      if (!threadsMap.has(msg.thread_ts)) {
        threadsMap.set(msg.thread_ts, []);
      }
      threadsMap.get(msg.thread_ts)!.push(msg);
    } else {
      standaloneMessages.push(msg);
    }
  }

  // Create chunks from threads (keep context together)
  for (const [threadTs, threadMessages] of threadsMap) {
    const combinedContent = threadMessages.map((m) => m.text).join('\n---\n');

    chunks.push({
      content: combinedContent,
      messages: threadMessages,
      isThread: true,
      threadTs,
    });
  }

  // Create chunks from standalone messages
  for (const msg of standaloneMessages) {
    chunks.push({
      content: msg.text,
      messages: [msg],
      isThread: false,
    });
  }

  console.log(
    `Created ${chunks.length} chunks (${threadsMap.size} threads, ${standaloneMessages.length} standalone)`,
  );

  return chunks;
}
