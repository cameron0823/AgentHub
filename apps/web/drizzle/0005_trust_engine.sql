-- Trust engine tables: encrypted credential vault, per-agent policies, tamper-evident audit log

CREATE TABLE IF NOT EXISTS agent_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tool TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  key_hint VARCHAR(8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_credentials_user_idx ON agent_credentials (user_id);
CREATE INDEX IF NOT EXISTS agent_credentials_agent_idx ON agent_credentials (agent_id);
CREATE INDEX IF NOT EXISTS agent_credentials_tool_idx ON agent_credentials (user_id, tool);

CREATE TABLE IF NOT EXISTS trust_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  allowed_tools JSONB NOT NULL DEFAULT '[]',
  max_tokens_per_day INTEGER,
  max_requests_per_minute INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, agent_id)
);

CREATE INDEX IF NOT EXISTS trust_policies_agent_idx ON trust_policies (agent_id);

CREATE TABLE IF NOT EXISTS credential_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  credential_id UUID REFERENCES agent_credentials(id) ON DELETE SET NULL,
  tool TEXT NOT NULL,
  key_hint VARCHAR(8),
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'denied', 'error')),
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS credential_audit_log_user_idx ON credential_audit_log (user_id);
CREATE INDEX IF NOT EXISTS credential_audit_log_agent_idx ON credential_audit_log (agent_id);
CREATE INDEX IF NOT EXISTS credential_audit_log_created_idx ON credential_audit_log (created_at DESC);
