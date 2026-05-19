CREATE TABLE IF NOT EXISTS pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  source_session_id uuid REFERENCES chat_sessions(id) ON DELETE SET NULL,
  source_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  title text NOT NULL,
  markdown text DEFAULT '' NOT NULL,
  lexical_state jsonb DEFAULT '{}'::jsonb NOT NULL,
  plain_text text DEFAULT '' NOT NULL,
  last_edited_by text DEFAULT 'human' NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS page_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  author_type text DEFAULT 'human' NOT NULL,
  selection_start integer,
  selection_end integer,
  quoted_text text,
  body text NOT NULL,
  is_resolved boolean DEFAULT false NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS page_agent_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  source_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  instruction text NOT NULL,
  action text DEFAULT 'append' NOT NULL,
  selection_start integer,
  selection_end integer,
  before_markdown text NOT NULL,
  after_markdown text NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS pages_user_updated_idx ON pages (user_id, updated_at);
CREATE INDEX IF NOT EXISTS pages_source_session_idx ON pages (source_session_id);
CREATE INDEX IF NOT EXISTS pages_source_message_idx ON pages (source_message_id);
CREATE INDEX IF NOT EXISTS page_comments_page_idx ON page_comments (page_id);
CREATE INDEX IF NOT EXISTS page_comments_user_idx ON page_comments (user_id);
CREATE INDEX IF NOT EXISTS page_agent_edits_page_idx ON page_agent_edits (page_id);
CREATE INDEX IF NOT EXISTS page_agent_edits_user_idx ON page_agent_edits (user_id);
