-- LLM-generated titles and ranked conversation search.
-- AgentHub's local desktop runtime is PostgreSQL-backed, so this provides the
-- FTS5-style local search path through Postgres full-text expression indexes.
CREATE INDEX IF NOT EXISTS chat_sessions_title_fts_idx
ON chat_sessions USING GIN (to_tsvector('english', coalesce(title, '')));

CREATE INDEX IF NOT EXISTS messages_content_fts_idx
ON messages USING GIN (to_tsvector('english', coalesce(content, '')));

CREATE INDEX IF NOT EXISTS messages_session_created_idx
ON messages (session_id, created_at DESC);
