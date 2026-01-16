import { pool } from '../config/db-client.js';
import { generateEmbedding } from '../ai/embeddings.js';

export interface SearchResult {
  id: number;
  content: string;
  source_type: string;
  source_id: string;
  channel_id?: string;
  author?: string;
  timestamp?: Date;
  permalink?: string;
  is_source_of_truth: boolean;
  is_customer_safe: boolean;
  metadata?: any;
  similarity: number;
}

export interface SearchOptions {
  limit?: number;
  customerSafeOnly?: boolean;
  sourceOfTruthOnly?: boolean;
  channelId?: string;
  minSimilarity?: number;
}

export async function searchKnowledge(
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const {
    limit = 5,
    customerSafeOnly = false,
    sourceOfTruthOnly = false,
    channelId,
    minSimilarity = 0.3,
  } = options;

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);

  // Build the SQL query with filters
  let sql = `
    SELECT 
      id, content, source_type, source_id, channel_id, author, 
      timestamp, permalink, is_source_of_truth, is_customer_safe, metadata,
      1 - (embedding <=> $1::vector) as similarity
    FROM knowledge_chunks
    WHERE embedding IS NOT NULL
  `;

  const params: any[] = [JSON.stringify(queryEmbedding)];
  let paramIndex = 2;

  if (customerSafeOnly) {
    sql += ` AND is_customer_safe = true`;
  }

  if (sourceOfTruthOnly) {
    sql += ` AND is_source_of_truth = true`;
  }

  if (channelId) {
    sql += ` AND channel_id = $${paramIndex}`;
    params.push(channelId);
    paramIndex++;
  }

  sql += `
    ORDER BY embedding <=> $1::vector
    LIMIT $${paramIndex}
  `;
  params.push(limit * 2); // Fetch extra for filtering

  try {
    const result = await pool.query(sql, params);

    // Filter by minimum similarity
    const filtered = result.rows.filter((row: SearchResult) => {
      const similarity = row.similarity || 0;
      return similarity >= minSimilarity;
    });

    // Return only up to limit
    const finalResults = filtered.slice(0, limit);

    return finalResults as SearchResult[];
  } catch (error) {
    throw error;
  }
}
