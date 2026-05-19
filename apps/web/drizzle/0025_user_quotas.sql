CREATE TABLE IF NOT EXISTS user_quotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  messages_sent integer NOT NULL DEFAULT 0,
  tokens_used integer NOT NULL DEFAULT 0,
  storage_used integer NOT NULL DEFAULT 0,
  api_calls integer NOT NULL DEFAULT 0,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'team', 'enterprise')),
  max_messages integer NOT NULL DEFAULT 100,
  max_tokens integer NOT NULL DEFAULT 1000000,
  max_storage integer NOT NULL DEFAULT 1073741824,
  max_api_calls integer NOT NULL DEFAULT 5000,
  reset_at timestamp NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_quotas_user_idx ON user_quotas (user_id);
CREATE INDEX IF NOT EXISTS user_quotas_reset_idx ON user_quotas (reset_at);
