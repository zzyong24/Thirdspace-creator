-- 保持迁移内的查重与唯一索引使用同一工作区键，并阻止写入在两步之间制造重复。
LOCK TABLE intelligence_items IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM intelligence_items
    WHERE external_id IS NOT NULL AND (group_id IS NOT NULL OR account_id IS NOT NULL)
    GROUP BY user_id, COALESCE(group_id, 'grp_legacy_' || account_id), platform, external_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'EVERYINFRA_DUPLICATE_PLATFORM_EXTERNAL_ID';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE integration_credentials ADD COLUMN options jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE intelligence_items ADD COLUMN capture_channel text NOT NULL DEFAULT 'legacy-douyin-cdp';
--> statement-breakpoint
-- 原生网页、图文等旧雷达条目共享此表。旧取流只识别抖音视频。
ALTER TABLE intelligence_items ADD CONSTRAINT intelligence_items_capture_channel_check CHECK (
  (capture_channel = 'everyinfra' AND platform IN ('douyin', 'xiaohongshu', 'wechatVideo'))
  OR (capture_channel = 'legacy-douyin-cdp' AND (platform NOT IN ('xiaohongshu', 'wechatVideo') OR type <> 'video'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX intelligence_items_platform_external_ux
  ON intelligence_items (user_id, COALESCE(group_id, 'grp_legacy_' || account_id), platform, external_id)
  WHERE external_id IS NOT NULL;
