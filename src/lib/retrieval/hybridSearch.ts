import { pool } from '../config/db-client.js';
import { generateEmbedding } from '../ai/embeddings.js';
import type { SearchResult, SearchOptions } from './search.js';

/**
 * Reciprocal Rank Fusion algorithm to combine vector and keyword search results
 * Updates the similarity score to the RRF combined score
 */

// RRF takes both the vector results and keyword results (each already ranked), assigns a new score to each result based on its position, merges scores for results that appear in both lists, ensures uniqueness, and returns a single ranked list of results. if k is high it gets more creativity
function reciprocalRankFusion(
  vectorResults: SearchResult[],
  keywordResults: SearchResult[],
  k: number = 60,
): SearchResult[] {
  const scoresMap = new Map<number, { result: SearchResult; score: number }>();

  // Add vector search scores
  vectorResults.forEach((result, index) => {
    const rrfScore = 1 / (k + index + 1);
    scoresMap.set(result.id, {
      result: { ...result, similarity: rrfScore },
      score: rrfScore,
    });
  });

  // Add keyword search scores
  keywordResults.forEach((result, index) => {
    const rrfScore = 1 / (k + index + 1);
    const existing = scoresMap.get(result.id);
    if (existing) {
      const combinedScore = existing.score + rrfScore;
      existing.score = combinedScore;
      existing.result = { ...existing.result, similarity: combinedScore };
    } else {
      scoresMap.set(result.id, {
        result: { ...result, similarity: rrfScore },
        score: rrfScore,
      });
    }
  });

  // Sort by combined RRF score
  const sorted = Array.from(scoresMap.values()).sort((a, b) => b.score - a.score);

  // NORMALIZE scores to 0-1 range
  const maxScore = sorted[0]?.score || 1;
  return sorted.map((item) => ({
    ...item.result,
    similarity: item.result.similarity / maxScore, // Normalize
  }));
}

export async function hybridSearch(
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const { limit = 10, customerSafeOnly = false, channelId, minSimilarity = 0.3 } = options;

  // 1. Vector search
  const queryEmbedding = await generateEmbedding(query);

  let vectorSql = `
    SELECT 
      id, content, source_type, source_id, channel_id, author, 
      timestamp, permalink, is_source_of_truth, is_customer_safe, metadata,
      1 - (embedding <=> $1::vector) as similarity
    FROM knowledge_chunks
    WHERE embedding IS NOT NULL
  `;

  // pass query embedding sring to pass to Postgres vector as it expects string
  const vectorParams: any[] = [JSON.stringify(queryEmbedding)];
  let paramIndex = 2;

  if (customerSafeOnly) {
    vectorSql += ` AND is_customer_safe = true`;
  }

  if (channelId) {
    vectorSql += ` AND channel_id = $${paramIndex}`;
    vectorParams.push(channelId);
    paramIndex++;
  }

  vectorSql += `
    ORDER BY embedding <=> $1::vector
    LIMIT $${paramIndex}
  `;
  vectorParams.push(limit * 2); // Fetch 2x for fusion

  // 2. Keyword (Full-Text) search
  let keywordSql = `
    SELECT 
      id, content, source_type, source_id, channel_id, author, 
      timestamp, permalink, is_source_of_truth, is_customer_safe, metadata,
      ts_rank(content_tsv, plainto_tsquery('english', $1)) as similarity
    FROM knowledge_chunks
    WHERE content_tsv @@ plainto_tsquery('english', $1)
  `;

  const keywordParams: any[] = [query];
  paramIndex = 2;

  if (customerSafeOnly) {
    keywordSql += ` AND is_customer_safe = true`;
  }

  if (channelId) {
    keywordSql += ` AND channel_id = $${paramIndex}`;
    keywordParams.push(channelId);
    paramIndex++;
  }

  keywordSql += `
    ORDER BY similarity DESC
    LIMIT $${paramIndex}
  `;
  keywordParams.push(limit * 2);

  try {
    // Run both searches in parallel
    const [vectorResult, keywordResult] = await Promise.all([
      pool.query(vectorSql, vectorParams),
      pool.query(keywordSql, keywordParams),
    ]);

    // Merge using RRF (this now updates similarity scores to RRF scores)
    const merged = reciprocalRankFusion(
      vectorResult.rows as SearchResult[],
      keywordResult.rows as SearchResult[],
    );

    // Filter by minimum similarity threshold (now using RRF scores)
    const filtered = merged.filter((result) => {
      const similarity = result.similarity || 0;
      return similarity >= minSimilarity;
    });

    // Return only up to limit
    const finalResults = filtered.slice(0, limit);

    return finalResults;
  } catch (error) {
    throw error;
  }
}
