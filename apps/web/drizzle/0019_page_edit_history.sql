ALTER TABLE pages ADD COLUMN IF NOT EXISTS current_version integer DEFAULT 1 NOT NULL;

CREATE TABLE IF NOT EXISTS page_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  source_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  version_number integer NOT NULL,
  title text NOT NULL,
  markdown text NOT NULL,
  lexical_state jsonb DEFAULT '{}'::jsonb NOT NULL,
  plain_text text DEFAULT '' NOT NULL,
  source_type text DEFAULT 'human' NOT NULL,
  diff_summary jsonb DEFAULT '{}'::jsonb NOT NULL,
  retention_expires_at timestamp,
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS page_versions_page_version_idx ON page_versions (page_id, version_number);
CREATE INDEX IF NOT EXISTS page_versions_user_idx ON page_versions (user_id);
