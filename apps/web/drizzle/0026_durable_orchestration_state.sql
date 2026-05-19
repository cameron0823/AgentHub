CREATE TABLE IF NOT EXISTS "graph_checkpoints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "graph_id" text NOT NULL,
  "thread_id" text NOT NULL,
  "node_id" text NOT NULL,
  "phase" text NOT NULL,
  "state" jsonb NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "graph_checkpoints_graph_idx" ON "graph_checkpoints" ("graph_id");
CREATE INDEX IF NOT EXISTS "graph_checkpoints_thread_idx" ON "graph_checkpoints" ("thread_id");
CREATE INDEX IF NOT EXISTS "graph_checkpoints_thread_created_idx" ON "graph_checkpoints" ("thread_id", "created_at");

CREATE TABLE IF NOT EXISTS "graph_thread_states" (
  "thread_id" text PRIMARY KEY NOT NULL,
  "graph_id" text,
  "paused" boolean DEFAULT false NOT NULL,
  "pause_reason" jsonb,
  "latest_checkpoint_id" uuid REFERENCES "graph_checkpoints"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "graph_thread_states_graph_idx" ON "graph_thread_states" ("graph_id");
CREATE INDEX IF NOT EXISTS "graph_thread_states_paused_idx" ON "graph_thread_states" ("paused");

CREATE TABLE IF NOT EXISTS "dead_letter_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "queue_name" text NOT NULL,
  "job_id" text NOT NULL,
  "graph_id" text,
  "thread_id" text,
  "failed_node" text,
  "error_message" text NOT NULL,
  "final_state" jsonb,
  "checkpoint_id" uuid REFERENCES "graph_checkpoints"("id") ON DELETE SET NULL,
  "failure_category" text DEFAULT 'unknown' NOT NULL,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "dead_letter_entries_queue_idx" ON "dead_letter_entries" ("queue_name");
CREATE INDEX IF NOT EXISTS "dead_letter_entries_thread_idx" ON "dead_letter_entries" ("thread_id");
CREATE INDEX IF NOT EXISTS "dead_letter_entries_category_idx" ON "dead_letter_entries" ("failure_category");
