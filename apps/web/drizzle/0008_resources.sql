CREATE TABLE IF NOT EXISTS resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'image_generation',
  uri TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/png',
  prompt TEXT,
  revised_prompt TEXT,
  provider_id TEXT,
  model TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS resources_user_idx ON resources (user_id);
CREATE INDEX IF NOT EXISTS resources_session_idx ON resources (session_id);
CREATE INDEX IF NOT EXISTS resources_source_message_idx ON resources (source_message_id);
