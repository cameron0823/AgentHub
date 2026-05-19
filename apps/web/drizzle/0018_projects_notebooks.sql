CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS project_agents (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY (project_id, agent_id)
);

CREATE TABLE IF NOT EXISTS project_chats (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  created_at timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY (project_id, session_id)
);

CREATE TABLE IF NOT EXISTS project_pages (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  created_at timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY (project_id, page_id)
);

CREATE TABLE IF NOT EXISTS project_knowledge_bases (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  created_at timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY (project_id, knowledge_base_id)
);

CREATE TABLE IF NOT EXISTS project_tasks (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  created_at timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY (project_id, task_id)
);

CREATE TABLE IF NOT EXISTS project_resources (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  created_at timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY (project_id, resource_id)
);

CREATE TABLE IF NOT EXISTS project_automations (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  created_at timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY (project_id, automation_id)
);

CREATE TABLE IF NOT EXISTS project_notebook_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  source_type text DEFAULT 'note' NOT NULL,
  source_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS projects_user_updated_idx ON projects (user_id, updated_at);
CREATE INDEX IF NOT EXISTS project_agents_agent_idx ON project_agents (agent_id);
CREATE INDEX IF NOT EXISTS project_chats_session_idx ON project_chats (session_id);
CREATE INDEX IF NOT EXISTS project_pages_page_idx ON project_pages (page_id);
CREATE INDEX IF NOT EXISTS project_kbs_kb_idx ON project_knowledge_bases (knowledge_base_id);
CREATE INDEX IF NOT EXISTS project_tasks_task_idx ON project_tasks (task_id);
CREATE INDEX IF NOT EXISTS project_resources_resource_idx ON project_resources (resource_id);
CREATE INDEX IF NOT EXISTS project_automations_automation_idx ON project_automations (automation_id);
CREATE INDEX IF NOT EXISTS project_notebook_docs_project_idx ON project_notebook_documents (project_id, updated_at);
CREATE INDEX IF NOT EXISTS project_notebook_docs_user_idx ON project_notebook_documents (user_id);
