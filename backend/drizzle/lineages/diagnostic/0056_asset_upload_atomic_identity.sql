ALTER TABLE asset_uploads ADD COLUMN IF NOT EXISTS account_id TEXT;
--> statement-breakpoint
ALTER TABLE asset_uploads ADD COLUMN IF NOT EXISTS asset_id TEXT;
--> statement-breakpoint
ALTER TABLE asset_uploads ADD COLUMN IF NOT EXISTS completed_asset_file_id TEXT;
--> statement-breakpoint

-- 老上传凭证没有账号归属，不能安全续用。保留审计行但放进不可登录的隔离账号，
-- 同时补一个确定性的稳定 asset id；新凭证从创建起写入真实账号与 asset id。
UPDATE asset_uploads
SET account_id = '__legacy__'
WHERE account_id IS NULL;
--> statement-breakpoint
UPDATE asset_uploads
SET asset_id = 'asset-legacy-' || id
WHERE asset_id IS NULL;
--> statement-breakpoint

ALTER TABLE asset_uploads ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE asset_uploads ALTER COLUMN asset_id SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS asset_uploads_owner_ix
  ON asset_uploads(user_id, account_id);
