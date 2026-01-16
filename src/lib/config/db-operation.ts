import { pool } from './db-client.js';

export interface KnowledgeChunk {
  content: string;
  embedding?: number[];
  source_type: string;
  source_id: string;
  channel_id?: string | undefined;
  thread_ts?: string | undefined;
  author?: string | undefined;
  timestamp?: Date | undefined;
  permalink?: string | undefined;
  is_source_of_truth?: boolean;
  is_customer_safe?: boolean;
  metadata?: Record<string, any>;
}

export async function insertChunk(chunk: KnowledgeChunk) {
  const query = `
    INSERT INTO knowledge_chunks (
      content, embedding, source_type, source_id, channel_id, 
      thread_ts, author, timestamp, permalink, is_source_of_truth, 
      is_customer_safe, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id
  `;

  const values = [
    chunk.content,
    chunk.embedding ? JSON.stringify(chunk.embedding) : null,
    chunk.source_type,
    chunk.source_id,
    chunk.channel_id || null,
    chunk.thread_ts || null,
    chunk.author || null,
    chunk.timestamp || null,
    chunk.permalink || null,
    chunk.is_source_of_truth || false,
    chunk.is_customer_safe || false,
    chunk.metadata ? JSON.stringify(chunk.metadata) : null,
  ];

  try {
    const result = await pool.query(query, values);
    return result.rows[0].id;
  } catch (error) {
    console.error('Error inserting chunk:', error);
    throw error;
  }
}
