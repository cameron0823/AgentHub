-- Resource type is stored as TEXT in 0008_resources.sql; this migration adds
-- a source index for sandbox output lookups while TypeScript schema widens
-- resources.type to image/file/chart/document.
CREATE INDEX IF NOT EXISTS resources_source_idx ON resources (source);
