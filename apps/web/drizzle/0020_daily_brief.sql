CREATE TABLE IF NOT EXISTS daily_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generated_for_date text NOT NULL,
  generated_by text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'ready',
  title text NOT NULL,
  summary text NOT NULL,
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_window_start timestamp NOT NULL,
  source_window_end timestamp NOT NULL,
  scheduled_for timestamp,
  generated_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS daily_briefs_user_generated_idx
  ON daily_briefs(user_id, generated_at);

CREATE INDEX IF NOT EXISTS daily_briefs_user_date_idx
  ON daily_briefs(user_id, generated_for_date);
