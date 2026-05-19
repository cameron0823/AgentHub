ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "voice_provider" text NOT NULL DEFAULT 'browser';
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "voice_id" text NOT NULL DEFAULT 'alloy';
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "voice_speed" real NOT NULL DEFAULT 1;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "stt_provider" text NOT NULL DEFAULT 'browser';
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "hands_free_voice" boolean NOT NULL DEFAULT false;
