CREATE TABLE IF NOT EXISTS agent_signal_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generated_for_date text NOT NULL,
  generated_by text NOT NULL DEFAULT 'schedule',
  status text NOT NULL DEFAULT 'completed',
  policy_version text NOT NULL,
  summary text NOT NULL,
  source_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamp NOT NULL,
  completed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_signal_review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES agent_signal_reviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  task_id uuid REFERENCES agent_tasks(id) ON DELETE SET NULL,
  skill_id uuid REFERENCES installed_skills(id) ON DELETE SET NULL,
  severity text NOT NULL DEFAULT 'info',
  category text NOT NULL,
  title text NOT NULL,
  recommendation text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_signal_reviews_user_generated_idx
  ON agent_signal_reviews(user_id, created_at);

CREATE INDEX IF NOT EXISTS agent_signal_reviews_user_date_idx
  ON agent_signal_reviews(user_id, generated_for_date);

CREATE INDEX IF NOT EXISTS agent_signal_items_review_idx
  ON agent_signal_review_items(review_id);

CREATE INDEX IF NOT EXISTS agent_signal_items_user_idx
  ON agent_signal_review_items(user_id, created_at);

CREATE INDEX IF NOT EXISTS agent_signal_items_agent_idx
  ON agent_signal_review_items(agent_id);

CREATE INDEX IF NOT EXISTS agent_signal_items_task_idx
  ON agent_signal_review_items(task_id);

CREATE INDEX IF NOT EXISTS agent_signal_items_skill_idx
  ON agent_signal_review_items(skill_id);
