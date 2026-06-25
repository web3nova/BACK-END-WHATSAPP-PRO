-- Add a unique index on messages.externalId for non-null values.
-- Run this against your Postgres database when ready. Be careful: CREATE INDEX CONCURRENTLY
-- cannot be run inside a transaction. Use psql or a DB admin tool.

CREATE UNIQUE INDEX CONCURRENTLY idx_messages_externalId_unique ON messages (externalId) WHERE externalId IS NOT NULL;
