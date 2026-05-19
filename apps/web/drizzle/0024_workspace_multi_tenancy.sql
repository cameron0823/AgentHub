CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo text,
  metadata jsonb NOT NULL DEFAULT '{"plan":"free","features":[]}'::jsonb,
  default_locale text NOT NULL DEFAULT 'en-US',
  default_model text,
  system_prompt text,
  brand_color varchar(7) NOT NULL DEFAULT '#1890ff',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  deleted_at timestamp
);

CREATE INDEX IF NOT EXISTS workspaces_deleted_idx ON workspaces (deleted_at);

CREATE TABLE IF NOT EXISTS workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  joined_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_members_workspace_user_idx ON workspace_members (workspace_id, user_id);
CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON workspace_members (user_id);

CREATE TABLE IF NOT EXISTS workspace_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
  token text NOT NULL UNIQUE,
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamp NOT NULL,
  accepted_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_invitations_workspace_idx ON workspace_invitations (workspace_id);
CREATE INDEX IF NOT EXISTS workspace_invitations_email_idx ON workspace_invitations (email);

ALTER TABLE agents ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE agent_groups ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE installed_skills ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE memory_entries ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE knowledge_bases ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE files ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE provider_credentials ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE prompt_library ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE automations ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE agent_task_templates ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE heterogeneous_agent_profiles ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS agents_workspace_idx ON agents (workspace_id);
CREATE INDEX IF NOT EXISTS agent_groups_workspace_idx ON agent_groups (workspace_id);
CREATE INDEX IF NOT EXISTS chat_sessions_workspace_idx ON chat_sessions (workspace_id);
CREATE INDEX IF NOT EXISTS resources_workspace_idx ON resources (workspace_id);
CREATE INDEX IF NOT EXISTS pages_workspace_idx ON pages (workspace_id);
CREATE INDEX IF NOT EXISTS projects_workspace_idx ON projects (workspace_id);
CREATE INDEX IF NOT EXISTS installed_skills_workspace_idx ON installed_skills (workspace_id);
CREATE INDEX IF NOT EXISTS memory_entries_workspace_idx ON memory_entries (workspace_id);
CREATE INDEX IF NOT EXISTS knowledge_bases_workspace_idx ON knowledge_bases (workspace_id);
CREATE INDEX IF NOT EXISTS documents_workspace_idx ON documents (workspace_id);
CREATE INDEX IF NOT EXISTS files_workspace_idx ON files (workspace_id);
CREATE INDEX IF NOT EXISTS settings_workspace_idx ON settings (workspace_id);
CREATE INDEX IF NOT EXISTS provider_credentials_workspace_idx ON provider_credentials (workspace_id);
CREATE INDEX IF NOT EXISTS mcp_servers_workspace_idx ON mcp_servers (workspace_id);
CREATE INDEX IF NOT EXISTS prompt_library_workspace_idx ON prompt_library (workspace_id);
CREATE INDEX IF NOT EXISTS automations_workspace_idx ON automations (workspace_id);
CREATE INDEX IF NOT EXISTS agent_task_templates_workspace_idx ON agent_task_templates (workspace_id);
CREATE INDEX IF NOT EXISTS agent_tasks_workspace_idx ON agent_tasks (workspace_id);
CREATE INDEX IF NOT EXISTS heterogeneous_agent_profiles_workspace_idx ON heterogeneous_agent_profiles (workspace_id);
