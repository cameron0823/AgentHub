-- Add embedding column to memory entries for semantic search
ALTER TABLE memory_entries
  ADD COLUMN IF NOT EXISTS embedding vector(768);

-- HNSW index for fast cosine similarity search on memory entries
CREATE INDEX IF NOT EXISTS memory_entries_embedding_idx
  ON memory_entries USING hnsw (embedding vector_cosine_ops);
