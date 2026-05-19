ALTER TABLE automations ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE automations ADD COLUMN IF NOT EXISTS max_executions INTEGER;
ALTER TABLE automations ADD COLUMN IF NOT EXISTS execution_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE automations ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
ALTER TABLE automations ADD COLUMN IF NOT EXISTS pause_reason TEXT;
ALTER TABLE automations ADD COLUMN IF NOT EXISTS notification_webhook_url TEXT;

ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS notification_status TEXT NOT NULL DEFAULT 'skipped';
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS notification_error TEXT;

CREATE INDEX IF NOT EXISTS automation_runs_session_idx ON automation_runs (session_id);
