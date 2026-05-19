CREATE TABLE IF NOT EXISTS "agent_task_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "description" text,
  "title" text NOT NULL,
  "prompt" text NOT NULL,
  "variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "subtasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "default_priority" integer DEFAULT 0 NOT NULL,
  "default_max_retries" integer DEFAULT 2 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "agent_tasks" ADD COLUMN IF NOT EXISTS "parent_task_id" uuid REFERENCES "agent_tasks"("id") ON DELETE CASCADE;
ALTER TABLE "agent_tasks" ADD COLUMN IF NOT EXISTS "template_id" uuid REFERENCES "agent_task_templates"("id") ON DELETE SET NULL;
ALTER TABLE "agent_tasks" ADD COLUMN IF NOT EXISTS "assigned_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "agent_tasks" ADD COLUMN IF NOT EXISTS "assigned_at" timestamp DEFAULT now() NOT NULL;
ALTER TABLE "agent_tasks" ADD COLUMN IF NOT EXISTS "reassigned_at" timestamp;
ALTER TABLE "agent_tasks" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;

CREATE TABLE IF NOT EXISTS "agent_task_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL REFERENCES "agent_tasks"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
  "author_type" text DEFAULT 'human' NOT NULL,
  "body" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "agent_tasks_user_created_idx" ON "agent_tasks" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "agent_tasks_user_status_created_idx" ON "agent_tasks" ("user_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "agent_tasks_parent_idx" ON "agent_tasks" ("parent_task_id");
CREATE INDEX IF NOT EXISTS "agent_tasks_agent_idx" ON "agent_tasks" ("agent_id");
CREATE INDEX IF NOT EXISTS "agent_task_comments_task_created_idx" ON "agent_task_comments" ("task_id", "created_at");
CREATE INDEX IF NOT EXISTS "agent_task_templates_user_name_idx" ON "agent_task_templates" ("user_id", "name");
