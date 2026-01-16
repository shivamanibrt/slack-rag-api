import express from 'express';
import type { Request, Response } from 'express';
import { searchKnowledge } from '../lib/retrieval/search.js';
import { hybridSearch } from '../lib/retrieval/hybridSearch.js';
import { generateAnswerWithCitations } from '../lib/ai/answering.js';

const router = express.Router();

interface AskQuestionBody {
  question: string;
  mode?: 'internal' | 'customer';
  limit?: number;
  useHybrid?: boolean;
  minSimilarity?: number;
}

interface SearchQueryBody {
  query: string;
  limit?: number;
  customerSafeOnly?: boolean;
  channelId?: string;
  useHybrid?: boolean;
  minSimilarity?: number;
}

// Ask a question
router.post('/ask', async (req: Request<{}, {}, AskQuestionBody>, res: Response) => {
  try {
    const {
      question,
      mode = 'internal',
      limit = 5,
      useHybrid = true,
      minSimilarity = 0.2,
    } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    if (mode !== 'internal' && mode !== 'customer') {
      return res.status(400).json({ error: 'Mode must be "internal" or "customer"' });
    }

    // Choose search method
    const searchFn = useHybrid ? hybridSearch : searchKnowledge;
    const results = await searchFn(question, {
      limit,
      customerSafeOnly: mode === 'customer',
      minSimilarity,
    });

    const answer = await generateAnswerWithCitations(question, results, mode);

    res.json({
      question,
      answer: answer.answer,
      mode: answer.mode,
      searchMethod: useHybrid ? 'hybrid' : 'vector',
      canCiteForCustomer: answer.canCiteForCustomer,
      citations: answer.citations.map((cite, i) => ({
        index: i + 1,
        source_id: cite.source_id,
        content: cite.content,
        author: cite.author,
        timestamp: cite.timestamp,
        permalink: cite.permalink,
        is_customer_safe: cite.is_customer_safe,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process question' });
  }
});

// Search only
router.post('/search', async (req: Request<{}, {}, SearchQueryBody>, res: Response) => {
  try {
    const {
      query,
      limit = 10,
      customerSafeOnly = false,
      useHybrid = true,
      minSimilarity = 0.2,
    } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const searchFn = useHybrid ? hybridSearch : searchKnowledge;
    const results = await searchFn(query, {
      limit,
      customerSafeOnly,
      minSimilarity,
    });

    res.json({
      query,
      searchMethod: useHybrid ? 'hybrid' : 'vector',
      resultsCount: results.length,
      minSimilarity,
      results: results.map((r) => ({
        id: r.id,
        source_id: r.source_id,
        content: r.content,
        similarity: r.similarity,
        author: r.author,
        timestamp: r.timestamp,
        permalink: r.permalink,
        is_customer_safe: r.is_customer_safe,
        is_source_of_truth: r.is_source_of_truth,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to search' });
  }
});

export default router;
