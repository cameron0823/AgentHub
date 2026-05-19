CREATE TABLE IF NOT EXISTS installed_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  version TEXT NOT NULL DEFAULT '1.0.0',
  author TEXT,
  license TEXT,
  source TEXT NOT NULL DEFAULT 'local',
  source_url TEXT,
  skill_markdown TEXT NOT NULL,
  manifest JSONB NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{}',
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS installed_skills_user_slug_idx ON installed_skills (user_id, slug);
CREATE INDEX IF NOT EXISTS installed_skills_user_idx ON installed_skills (user_id);

CREATE TABLE IF NOT EXISTS skill_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES installed_skills(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'text/markdown',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS skill_resources_skill_path_idx ON skill_resources (skill_id, path);
CREATE INDEX IF NOT EXISTS skill_resources_user_idx ON skill_resources (user_id);
