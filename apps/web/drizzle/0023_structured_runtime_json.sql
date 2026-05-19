ALTER TABLE mcp_servers
  ALTER COLUMN args TYPE jsonb USING
    CASE
      WHEN args IS NULL OR trim(args) = '' THEN '[]'::jsonb
      WHEN left(trim(args), 1) = '[' THEN args::jsonb
      ELSE to_jsonb(regexp_split_to_array(trim(args), '[[:space:]]+'))
    END,
  ALTER COLUMN args SET DEFAULT '[]'::jsonb,
  ALTER COLUMN args SET NOT NULL;

ALTER TABLE mcp_servers
  ALTER COLUMN env TYPE jsonb USING
    CASE
      WHEN env IS NULL OR trim(env) = '' THEN '{}'::jsonb
      ELSE env::jsonb
    END,
  ALTER COLUMN env SET DEFAULT '{}'::jsonb,
  ALTER COLUMN env SET NOT NULL;

ALTER TABLE mcp_servers
  ALTER COLUMN headers TYPE jsonb USING
    CASE
      WHEN headers IS NULL OR trim(headers) = '' THEN '{}'::jsonb
      ELSE headers::jsonb
    END,
  ALTER COLUMN headers SET DEFAULT '{}'::jsonb,
  ALTER COLUMN headers SET NOT NULL;

ALTER TABLE agent_tasks
  ALTER COLUMN depends_on TYPE jsonb USING
    CASE
      WHEN depends_on IS NULL OR trim(depends_on) = '' THEN '[]'::jsonb
      ELSE depends_on::jsonb
    END,
  ALTER COLUMN depends_on SET DEFAULT '[]'::jsonb,
  ALTER COLUMN depends_on SET NOT NULL;
