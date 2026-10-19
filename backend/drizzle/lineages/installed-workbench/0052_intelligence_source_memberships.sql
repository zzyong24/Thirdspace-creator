CREATE TABLE IF NOT EXISTS intelligence_source_collection_memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_intelligence_source_collection_membership
  ON intelligence_source_collection_memberships
    (user_id, account_id, source_id, collection_id);
--> statement-breakpoint
INSERT INTO intelligence_source_collection_memberships (
  id,
  user_id,
  account_id,
  source_id,
  collection_id,
  created_at
)
SELECT
  'membership:' || source.id || ':' || source.collection_id,
  source.user_id,
  source.account_id,
  source.id,
  source.collection_id,
  source.created_at
FROM intelligence_sources AS source
WHERE source.collection_id IS NOT NULL
ON CONFLICT (user_id, account_id, source_id, collection_id) DO NOTHING;
