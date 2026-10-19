-- T-1020: external works are scoped by CreatorOS user and platform account.
-- The repository lookup must be deployed with this migration. Once two accounts
-- have the same external ID, rollback keeps the new key and switches old UI reads;
-- the old global index cannot be reconstructed without losing valid rows.
DROP INDEX IF EXISTS publications_external_ux;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS publications_external_account_ux
  ON publications(user_id, account_id, platform, external_id)
  WHERE external_id IS NOT NULL;
