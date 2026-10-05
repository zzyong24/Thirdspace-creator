ALTER TABLE artifact_versions ADD COLUMN IF NOT EXISTS adoption_key TEXT;
--> statement-breakpoint
ALTER TABLE artifact_versions ADD COLUMN IF NOT EXISTS adoption_source_digest TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS artifact_versions_adoption_ux ON artifact_versions(artifact_id, adoption_key);
