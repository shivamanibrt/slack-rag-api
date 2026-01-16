-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Main knowledge chunks table
CREATE TABLE knowledge_chunks (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    embedding vector(1536),
    source_type VARCHAR(50) NOT NULL,
    source_id VARCHAR(255) NOT NULL,
    channel_id VARCHAR(255),
    thread_ts VARCHAR(255),
    author VARCHAR(255),
    timestamp TIMESTAMP,
    permalink TEXT,
    is_source_of_truth BOOLEAN DEFAULT FALSE,
    is_customer_safe BOOLEAN DEFAULT FALSE,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Full-text search column (required for hybrid search)
ALTER TABLE knowledge_chunks 
ADD COLUMN content_tsv tsvector
GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- Vector similarity index
CREATE INDEX idx_embedding_ivfflat 
ON knowledge_chunks 
USING ivfflat (embedding vector_cosine_ops);

-- Full-text search index (required for hybrid search)
CREATE INDEX idx_content_tsv 
ON knowledge_chunks 
USING GIN (content_tsv);

-- Filter indexes
CREATE INDEX idx_customer_safe ON knowledge_chunks (is_customer_safe);
CREATE INDEX idx_source_type ON knowledge_chunks (source_type);
CREATE INDEX idx_channel_id ON knowledge_chunks (channel_id);