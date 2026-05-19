ALTER TABLE "credential_audit_log"
  ADD COLUMN IF NOT EXISTS "previous_hash" TEXT NOT NULL DEFAULT repeat('0', 64),
  ADD COLUMN IF NOT EXISTS "entry_hash" TEXT NOT NULL DEFAULT repeat('0', 64);

CREATE INDEX IF NOT EXISTS "credential_audit_log_entry_hash_idx" ON "credential_audit_log" ("entry_hash");
CREATE INDEX IF NOT EXISTS "credential_audit_log_user_hash_chain_idx" ON "credential_audit_log" ("user_id", "created_at", "entry_hash");
