CREATE TABLE IF NOT EXISTS "a2a_communities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workspace_id" uuid REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "agent_group_id" uuid REFERENCES "agent_groups"("id") ON DELETE SET NULL,
  "shared_memory_knowledge_base_id" uuid REFERENCES "knowledge_bases"("id") ON DELETE SET NULL,
  "shared_memory_enabled" boolean DEFAULT true NOT NULL,
  "access_control" jsonb DEFAULT '{"visibility":"private"}'::jsonb NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "a2a_communities_user_idx" ON "a2a_communities" ("user_id");
CREATE INDEX IF NOT EXISTS "a2a_communities_workspace_idx" ON "a2a_communities" ("workspace_id");
CREATE UNIQUE INDEX IF NOT EXISTS "a2a_communities_user_name_idx" ON "a2a_communities" ("user_id", "name");

CREATE TABLE IF NOT EXISTS "a2a_peers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workspace_id" uuid REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "community_id" uuid REFERENCES "a2a_communities"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "endpoint" text NOT NULL,
  "framework" text DEFAULT 'a2a' NOT NULL,
  "agent_card" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "auth_scheme" text DEFAULT 'none' NOT NULL,
  "discovery_source" text DEFAULT 'manual' NOT NULL,
  "status" text DEFAULT 'unknown' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_seen_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "a2a_peers_user_idx" ON "a2a_peers" ("user_id");
CREATE INDEX IF NOT EXISTS "a2a_peers_community_idx" ON "a2a_peers" ("community_id");
CREATE INDEX IF NOT EXISTS "a2a_peers_status_idx" ON "a2a_peers" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "a2a_peers_user_endpoint_idx" ON "a2a_peers" ("user_id", "endpoint");

CREATE TABLE IF NOT EXISTS "a2a_community_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "community_id" uuid NOT NULL REFERENCES "a2a_communities"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "agent_id" uuid REFERENCES "agents"("id") ON DELETE CASCADE,
  "peer_id" uuid REFERENCES "a2a_peers"("id") ON DELETE CASCADE,
  "role" text DEFAULT 'worker' NOT NULL,
  "permissions" jsonb DEFAULT '["delegate"]'::jsonb NOT NULL,
  "joined_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "a2a_community_members_community_idx" ON "a2a_community_members" ("community_id");
CREATE INDEX IF NOT EXISTS "a2a_community_members_user_idx" ON "a2a_community_members" ("user_id");
CREATE INDEX IF NOT EXISTS "a2a_community_members_agent_idx" ON "a2a_community_members" ("agent_id");
CREATE INDEX IF NOT EXISTS "a2a_community_members_peer_idx" ON "a2a_community_members" ("peer_id");
CREATE UNIQUE INDEX IF NOT EXISTS "a2a_community_members_community_agent_idx" ON "a2a_community_members" ("community_id", "agent_id");
CREATE UNIQUE INDEX IF NOT EXISTS "a2a_community_members_community_peer_idx" ON "a2a_community_members" ("community_id", "peer_id");
