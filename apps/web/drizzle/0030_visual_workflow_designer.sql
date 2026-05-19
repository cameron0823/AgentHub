ALTER TABLE automations
ADD COLUMN IF NOT EXISTS workflow_definition jsonb NOT NULL DEFAULT '{"version":"1","entryNodeId":"trigger","nodes":[],"edges":[]}'::jsonb;
