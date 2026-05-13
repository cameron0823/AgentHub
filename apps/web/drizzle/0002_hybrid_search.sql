-- Enable trigram extension for pg_trgm similarity search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add generated tsvector column for full-text search
ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- GIN index for full-text search
CREATE INDEX IF NOT EXISTS doc_chunks_tsv_idx
  ON document_chunks USING GIN (content_tsv);

-- GIN index for trigram similarity (used by pg_trgm operators)
CREATE INDEX IF NOT EXISTS doc_chunks_trgm_idx
  ON document_chunks USING GIN (content gin_trgm_ops);
