ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "headers" text;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "last_health_status" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "last_health_checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "last_tool_count" integer;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "last_error" text;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "tool_schema_snapshot" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "tool_schema_fingerprint" text;
