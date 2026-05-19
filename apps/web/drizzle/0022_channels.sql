CREATE TABLE IF NOT EXISTS "channel_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "agent_id" uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  "provider" text NOT NULL,
  "name" text NOT NULL,
  "external_team_id" text,
  "external_channel_id" text,
  "verification_secret_encrypted" text NOT NULL,
  "verification_secret_iv" text NOT NULL,
  "verification_secret_auth_tag" text NOT NULL,
  "verification_secret_hint" varchar(8),
  "is_enabled" boolean NOT NULL DEFAULT true,
  "allowed_tools" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "dm_policy" text DEFAULT 'paired-only' NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "channel_accounts_provider_check" CHECK ("provider" IN ('discord', 'slack')),
  CONSTRAINT "channel_accounts_dm_policy_check" CHECK ("dm_policy" IN ('disabled', 'paired-only', 'open'))
);

CREATE TABLE IF NOT EXISTS "channel_sender_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "channel_account_id" uuid NOT NULL REFERENCES channel_accounts(id) ON DELETE CASCADE,
  "external_sender_id" text NOT NULL,
  "display_name" text,
  "is_paired" boolean NOT NULL DEFAULT false,
  "allowed_tools" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "channel_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "channel_account_id" uuid REFERENCES channel_accounts(id) ON DELETE SET NULL,
  "user_id" uuid REFERENCES users(id) ON DELETE SET NULL,
  "agent_id" uuid REFERENCES agents(id) ON DELETE SET NULL,
  "provider" text NOT NULL,
  "external_sender_id" text,
  "external_channel_id" text,
  "event_type" text NOT NULL,
  "outcome" text NOT NULL,
  "reason" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "channel_audit_provider_check" CHECK ("provider" IN ('discord', 'slack')),
  CONSTRAINT "channel_audit_outcome_check" CHECK ("outcome" IN ('success', 'denied', 'error'))
);

CREATE INDEX IF NOT EXISTS "channel_accounts_user_provider_idx"
  ON "channel_accounts"("user_id", "provider");

CREATE INDEX IF NOT EXISTS "channel_accounts_agent_idx"
  ON "channel_accounts"("agent_id");

CREATE INDEX IF NOT EXISTS "channel_accounts_external_idx"
  ON "channel_accounts"("provider", "external_team_id", "external_channel_id");

CREATE UNIQUE INDEX IF NOT EXISTS "channel_sender_policy_channel_sender_idx"
  ON "channel_sender_policies"("channel_account_id", "external_sender_id");

CREATE INDEX IF NOT EXISTS "channel_sender_policy_channel_idx"
  ON "channel_sender_policies"("channel_account_id");

CREATE INDEX IF NOT EXISTS "channel_audit_account_created_idx"
  ON "channel_audit_log"("channel_account_id", "created_at");

CREATE INDEX IF NOT EXISTS "channel_audit_user_created_idx"
  ON "channel_audit_log"("user_id", "created_at");

CREATE INDEX IF NOT EXISTS "channel_audit_agent_created_idx"
  ON "channel_audit_log"("agent_id", "created_at");
