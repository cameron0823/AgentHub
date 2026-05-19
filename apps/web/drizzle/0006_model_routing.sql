ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "route_strategy" text DEFAULT 'fixed' NOT NULL;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "fallback_model_ids" jsonb DEFAULT '[]'::jsonb;
