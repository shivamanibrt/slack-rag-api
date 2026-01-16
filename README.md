# Slack Knowledge System

A RAG (Retrieval-Augmented Generation) system that ingests Slack conversations, extracts knowledge, and provides intelligent Q&A with citations while maintaining customer-safe boundaries.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Key Concepts](#key-concepts)
- [Setup & Installation](#setup--installation)
- [Usage](#usage)
- [API Endpoints](#api-endpoints)
- [Testing](#testing)
- [Design Decisions & Tradeoffs](#design-decisions--tradeoffs)
- [Next Steps](#next-steps)

---

## Overview

This system solves the problem of **knowledge fragmentation** in team communication tools. It:

1. **Ingests** Slack conversations (channels, threads, messages)
2. **Classifies** which messages contain valuable knowledge
3. **Detects** authoritative "source of truth" statements
4. **Stores** knowledge in a searchable vector database
5. **Answers** questions with proper citations
6. **Enforces** customer-safe citation policies

---

## Architecture

```mermaid
graph TD
    A[Slack API] -->|Fetch Messages| B[Ingestion Pipeline]
    B --> C[Thread-Aware Chunker]
    C --> D[Classifier]
    D --> E{Worth Indexing?}
    E -->|Yes| F[Customer Safety Detector]
    E -->|No| G[Skip]
    F --> H[Generate Embeddings]
    H --> I[(PostgreSQL + pgvector)]

    J[User Question] --> K[Hybrid Search]
    K --> I
    I --> L[Vector + Keyword Results]
    L --> M[Answer Generator]
    M --> N{Mode?}
    N -->|Internal| O[Cite All Sources]
    N -->|Customer| P[Filter Customer-Safe Only]
    O --> Q[Response with Citations]
    P --> Q
```

**Components:**

1. **Ingestion**: Fetches Slack data via API
2. **Processing**: Chunks, classifies, detects customer-safety
3. **Storage**: PostgreSQL with pgvector for embeddings
4. **Retrieval**: Hybrid search (vector + full-text)
5. **Q&A**: LLM-powered answers with filtered citations

---

## Key Concepts

### 1. **Source of Truth**

**Definition**: Messages that represent final decisions, official answers, or confirmed solutions.

**Examples:**

- ✅ "We decided to use PostgreSQL for the database"
- ✅ "The official deployment process is documented here..."
- ✅ "The bug was fixed in PR #123"

**Not Source of Truth:**

- ❌ "What if we tried using MongoDB?"
- ❌ "I think we should consider..."
- ❌ "Thanks!"

**Detection Method**: LLM-based classification looking for decision keywords ("decided", "solution is", "final answer", "we're going with").

---

### 2. **Knowledge Worth Indexing**

**Definition**: Messages that contain information useful for future reference.

**We Index:**

- ✅ Questions and answers
- ✅ Technical explanations
- ✅ Bug reports and solutions
- ✅ Procedures and documentation
- ✅ Source-of-truth statements

**We Skip:**

- ❌ Greetings ("thanks", "ok", "lol")
- ❌ System messages ("joined the channel")
- ❌ Very short messages (< 10 chars)
- ❌ Pure social chat

**Detection Method**: LLM classifier + heuristic filters (length, system patterns).

---

### 3. **Customer-Safe Citation Policy**

**Problem**: Internal discussions shouldn't be exposed to external customers.

**Solution**: Two-mode system:

#### **Internal Mode**

- Can cite ANY source
- Shows all internal discussions, decisions, debugging notes
- Used by team members

#### **Customer Mode**

- **Only cites customer-safe sources**
- Filters out internal discussions
- If no customer-safe sources exist:
  - Returns: "Information is internal-only, cannot be shared"
  - Suggests creating approved documentation

**Implementation:**

```typescript
// Each chunk has a flag
is_customer_safe: boolean;

// Customer mode filters at retrieval
if (mode === 'customer') {
  results = results.filter((r) => r.is_customer_safe);
}
```

---

### 4. **Handling Contradictions & Updates**

**Current Approach**: Last-write-wins

- Newer messages are ranked higher in search (timestamp boost)
- Source-of-truth messages get priority
- Users see most recent information first

**Limitations**:

- No explicit contradiction detection
- Old information isn't automatically deprecated

**Future Enhancement**:

- Detect conflicting statements
- Mark outdated information
- Version tracking for decisions

---

## Setup & Installation

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ with pgvector extension
- Slack Bot Token with permissions: `channels:history`, `channels:read`, `users:read`
- OpenAI API Key

### 1. Clone Repository

```bash
git clone <your-repo-url>
cd slack-knowledge-system/api
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Database Setup

```bash
# Create database
createdb slack_knowledge

# Run schema
psql -d slack_knowledge -f schema.sql
```

### 4. Environment Variables

Create `.env` file:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=slack_knowledge
DB_USER=your_user
DB_PASSWORD=your_password

# Slack
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_CHANNEL_ID=C1234567890

# OpenAI
OPENAI_API_KEY=sk-your-key

# Ingestion
INGEST_LIMIT=100

# Server
PORT=3000
```

### 5. Run Ingestion

```bash
npm run ingest
```

This will:

- Connect to Slack
- Fetch messages from configured channel
- Classify and process them
- Store in database with embeddings

### 6. Start API Server

```bash
npm run dev
```

Server runs on `http://localhost:3000`

---

## Usage

### Ask a Question (Internal Mode)

```bash
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{
    "question": "How do we deploy to production?",
    "mode": "internal",
    "limit": 5
  }'
```

**Response:**

```json
{
  "question": "How do we deploy to production?",
  "answer": "We deploy to production using automated CI/CD pipelines [1]. The process is documented in our runbook [2].",
  "mode": "internal",
  "citations": [
    {
      "index": 1,
      "source_id": "1234.5678",
      "content": "Our deployment uses GitHub Actions...",
      "author": "John Doe",
      "timestamp": "2024-01-15T10:30:00Z",
      "permalink": "https://slack.com/...",
      "is_customer_safe": false
    }
  ]
}
```

### Ask a Question (Customer Mode)

```bash
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What are your API rate limits?",
    "mode": "customer"
  }'
```

Only customer-safe sources will be cited.

### Search Only (No Answer)

```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "authentication",
    "limit": 10,
    "customerSafeOnly": true
  }'
```

---

## API Endpoints

### `POST /api/ask`

Ask a question and get an answer with citations.

**Body:**

```json
{
  "question": "string (required)",
  "mode": "internal | customer (default: internal)",
  "limit": "number (default: 5)",
  "useHybrid": "boolean (default: true)",
  "minSimilarity": "number (default: 0.3)"
}
```

### `POST /api/search`

Search knowledge base without generating an answer.

**Body:**

```json
{
  "query": "string (required)",
  "limit": "number (default: 10)",
  "customerSafeOnly": "boolean (default: false)",
  "channelId": "string (optional)",
  "useHybrid": "boolean (default: true)",
  "minSimilarity": "number (default: 0.3)"
}
```

### `GET /health`

Health check endpoint.

---

## Testing

We use Jest for testing critical components:

- **Classification Logic** (`classifier.test.ts`): Validates message filtering rules
- **Thread-Aware Chunking** (`chunker.test.ts`): Ensures threads stay grouped as context
- **Citation Filtering Policy** (`citation-policy.test.ts`): Verifies customer-safe citation enforcement

```bash
npm test
```

**Testing Philosophy**: We use mock data for unit tests to avoid API costs and ensure reproducibility. End-to-end validation with real Slack data is done via the ingestion script.

**Results**: 27 tests across 3 suites, all passing ✅

---

## Design Decisions & Tradeoffs

### 1. **Thread-Aware Chunking**

**Decision**: Group thread replies together, keep starters separate.

**Why**:

- Preserves conversation context
- Thread replies often reference the starter
- Better semantic coherence

**Tradeoff**: Thread starters are standalone chunks, might lose some context.

---

### 2. **Hybrid Search (Vector + Full-Text)**

**Decision**: Use both pgvector and PostgreSQL full-text search, combine with Reciprocal Rank Fusion.

**Why**:

- Vector search: Great for semantic similarity ("deploy" finds "deployment")
- Full-text: Great for exact keyword matches ("bug #123")
- RRF: Balances both approaches

**Tradeoff**: Slower than vector-only (2 queries), but better recall.

---

### 3. **LLM-Based Classification**

**Decision**: Use GPT-4o-mini to classify messages.

**Why**:

- More accurate than keyword rules
- Adapts to different writing styles
- Can detect nuanced "source of truth" patterns

**Tradeoff**:

- Costs ~$0.0001 per message
- Slower than rule-based
- Requires API key

**Mitigation**: Pre-filter with heuristics (length, system messages) to reduce LLM calls by ~40%.

---

### 4. **Customer-Safe Detection**

**Decision**: Separate LLM classification for customer safety.

**Why**:

- Different concern than "knowledge worth indexing"
- Needs context awareness (internal jargon, debugging details)

**Alternative Considered**: Manual tagging (rejected - too slow, error-prone).

---

### 5. **Last-Write-Wins for Contradictions**

**Decision**: No explicit contradiction detection yet.

**Why**:

- Simpler to implement
- Timestamp-based relevance works for most cases
- 80/20 rule: handles common scenarios

**Known Limitation**: Old information can persist.

**Future**: Build contradiction detector, mark deprecated info.

---

### 6. **PostgreSQL vs Dedicated Vector DB**

**Decision**: Use PostgreSQL with pgvector instead of Pinecone/Weaviate.

**Why**:

- One database for everything (simpler ops)
- pgvector is mature and fast enough
- Full-text search built-in
- No additional hosting costs

**Tradeoff**: Dedicated vector DBs have more features (filtering, sharding), but not needed at this scale.

---

## Next Steps

### Immediate Improvements

1. **Incremental Sync**
   - Track last ingested timestamp
   - Only fetch new messages
   - Update changed threads

2. **Relevance Feedback**
   - Let users rate answers
   - Use feedback to improve search ranking
   - Retrain classification models

3. **Better Contradiction Handling**
   - Detect conflicting statements
   - Show warning: "Newer info available"
   - Version-track decisions

### Future Features

4. **Multi-Source Support**
   - Add Linear/Jira connector
   - Unify search across platforms
   - Cross-reference (Slack discussion → Jira ticket)

5. **UI Dashboard**
   - Web interface for asking questions
   - Browse knowledge base
   - Admin panel for managing customer-safe flags

6. **Evaluation Harness**
   - Test set of Q&A pairs
   - Measure retrieval accuracy (recall@k)
   - Track citation precision

7. **Reranking**
   - Add cross-encoder reranker after retrieval
   - Improve top-5 relevance
   - Use cohere-rerank or custom model

---

## AI Usage Note

This project was built with assistance from Claude (Anthropic). AI was used for:

- Boilerplate code generation (Express routes, DB queries)
- Test case scaffolding
- Documentation structure

**Manually validated/modified:**

- All business logic (classification, chunking, citation filtering)
- Search algorithms (hybrid search, RRF)
- Database schema design
- API design and error handling

---

## License

MIT

---

## Questions?

For issues or questions, please open a GitHub issue or contact the maintainer.
