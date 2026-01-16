import 'dotenv/config';
import { dbConnection } from '../src/lib/config/db-client.js';
import { insertChunk } from '../src/lib/config/db-operation.js';
import { slackConnection } from '../src/lib/config/slack-client.js';
import {
  fetchChannelHistory,
  fetchThreadReplies,
  fetchUserInfo,
} from '../src/lib/services/slack-service.js';
import { chunkMessages } from '../src/lib/processors/chunker.js';
import { classifyMessage } from '../src/lib/processors/classifier.js';
import { isCustomerSafe } from '../src/lib/processors/customerSafeDetector.js';
import { generateEmbedding } from '../src/lib/ai/embeddings.js';

async function ingestSlackData() {
  await dbConnection();
  await slackConnection();

  const channelId = process.env.SLACK_CHANNEL_ID!;
  const messageLimit = parseInt(process.env.INGEST_LIMIT || '50');

  const messages = await fetchChannelHistory(channelId, messageLimit);

  // Fetch all thread replies first
  const allMessages = [...messages];
  for (const message of messages) {
    if (message.reply_count && message.reply_count > 0) {
      const replies = await fetchThreadReplies(channelId, message.ts);
      allMessages.push(...replies);
    }
  }

  // Use thread-aware chunking to preserve context
  const chunks = chunkMessages(allMessages);

  let processedCount = 0;
  let skippedCount = 0;

  const userCache = new Map<string, string>();

  for (const [index, messageChunk] of chunks.entries()) {
    try {
      if (!messageChunk.content || messageChunk.content.trim().length === 0) {
        skippedCount++;
        continue;
      }

      const classification = await classifyMessage(messageChunk.content);

      if (!classification.shouldIndex) {
        skippedCount++;
        continue;
      }

      const customerSafe = await isCustomerSafe(messageChunk.content);
      const embedding = await generateEmbedding(messageChunk.content);

      const firstMsg = messageChunk.messages[0];

      let authorName = firstMsg.user;
      if (!userCache.has(firstMsg.user)) {
        const userInfo = await fetchUserInfo(firstMsg.user);
        authorName = userInfo?.real_name || firstMsg.user;
        userCache.set(firstMsg.user, authorName);
      } else {
        authorName = userCache.get(firstMsg.user)!;
      }

      const knowledgeChunk = {
        content: messageChunk.content,
        embedding: embedding,
        source_type: 'slack',
        source_id: firstMsg.ts,
        channel_id: channelId,
        thread_ts: messageChunk.threadTs,
        author: authorName,
        timestamp: new Date(parseFloat(firstMsg.ts) * 1000),
        permalink: firstMsg.permalink,
        is_source_of_truth: classification.isSourceOfTruth,
        is_customer_safe: customerSafe,
        metadata: {
          message_count: messageChunk.messages.length,
          is_thread: messageChunk.isThread,
          classification: classification.reason,
        },
      };

      await insertChunk(knowledgeChunk);
      processedCount++;
    } catch (error) {
      console.error(`Error processing chunk:`, error);
    }
  }

  process.exit(0);
}

ingestSlackData().catch((error) => {
  console.error('Error in ingestion:', error);
  process.exit(1);
});
