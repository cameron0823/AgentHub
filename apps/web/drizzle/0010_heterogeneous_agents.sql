CREATE TABLE IF NOT EXISTS heterogeneous_agent_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL DEFAULT 'generic',
  command TEXT NOT NULL,
  args JSONB NOT NULL DEFAULT '[]',
  working_directory TEXT,
  env JSONB NOT NULL DEFAULT '{}',
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS heterogeneous_profiles_user_idx ON heterogeneous_agent_profiles (user_id);

CREATE TABLE IF NOT EXISTS heterogeneous_agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES heterogeneous_agent_profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  input TEXT NOT NULL,
  output TEXT,
  error TEXT,
  exit_code INTEGER,
  metadata JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS heterogeneous_runs_profile_idx ON heterogeneous_agent_runs (profile_id);
CREATE INDEX IF NOT EXISTS heterogeneous_runs_user_idx ON heterogeneous_agent_runs (user_id);
