ALTER TABLE mcp_servers
  ADD COLUMN IF NOT EXISTS governance_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS governance_policy JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS mcp_servers_governance_enabled_idx ON mcp_servers (governance_enabled);
