-- T-1020: preserve imported Douyin Publication identity without manufacturing a
-- second Project or claiming that a legacy import proves a complete catalog.
CREATE TABLE IF NOT EXISTS platform_collection_migration_conflicts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT,
  platform TEXT NOT NULL,
  external_id TEXT,
  publication_id TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  detected_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS platform_collection_migration_conflicts_publication_ux
  ON platform_collection_migration_conflicts(publication_id, reason_code);
--> statement-breakpoint
INSERT INTO platform_collection_migration_conflicts
  (id, user_id, account_id, platform, external_id, publication_id, reason_code, detected_at)
SELECT 'pcm-' || md5(p.id || ':account'), p.user_id, p.account_id, p.platform,
  p.external_id, p.id, 'ACCOUNT_IDENTITY_UNVERIFIED', p.updated_at
FROM publications p
LEFT JOIN platform_accounts a ON a.id = p.account_id AND a.user_id = p.user_id
  AND a.platform = p.platform AND a.status = 'active'
WHERE p.platform = 'douyin' AND p.external_id IS NOT NULL AND a.id IS NULL
ON CONFLICT (publication_id, reason_code) DO NOTHING;
--> statement-breakpoint
INSERT INTO platform_collection_migration_conflicts
  (id, user_id, account_id, platform, external_id, publication_id, reason_code, detected_at)
SELECT 'pcm-' || md5(p.id || ':project'), p.user_id, p.account_id, p.platform,
  p.external_id, p.id, 'PROJECT_ACCOUNT_MISMATCH', p.updated_at
FROM publications p
JOIN content_outputs o ON o.id = p.content_output_id
JOIN projects pr ON pr.id = o.project_id
WHERE p.platform = 'douyin' AND p.external_id IS NOT NULL
  AND (pr.user_id <> p.user_id OR pr.account_id <> p.account_id)
ON CONFLICT (publication_id, reason_code) DO NOTHING;
--> statement-breakpoint
INSERT INTO platform_works
  (id, user_id, account_id, platform, external_id, kind, published_at,
   visibility, visibility_source, visibility_priority, visibility_observed_at,
   source, observed_at, ingested_at, catalog_generation, publication_id,
   legacy_project_id, legacy_publication_id, outbound_frozen_at)
SELECT 'pw-legacy-' || md5(p.user_id || ':' || p.account_id || ':' || p.platform || ':' || p.external_id),
  p.user_id, p.account_id, p.platform, p.external_id, 'video', p.published_at,
  CASE WHEN p.removed_at IS NOT NULL THEN 'removed'
       WHEN p.hidden_at IS NOT NULL THEN 'hidden' ELSE 'unknown' END,
  'legacy-publication',
  CASE WHEN p.removed_at IS NOT NULL OR p.hidden_at IS NOT NULL THEN 50 ELSE 0 END,
  p.updated_at, 'legacy-publication', p.updated_at, p.updated_at, 0, p.id,
  CASE WHEN pr.user_id = p.user_id AND pr.account_id = p.account_id
       THEN pr.id ELSE NULL END,
  p.id, p.updated_at
FROM publications p
JOIN platform_accounts a ON a.id = p.account_id AND a.user_id = p.user_id
  AND a.platform = p.platform AND a.status = 'active'
LEFT JOIN content_outputs o ON o.id = p.content_output_id
LEFT JOIN projects pr ON pr.id = o.project_id
WHERE p.platform = 'douyin' AND p.external_id IS NOT NULL
  AND (pr.id IS NULL OR (pr.user_id = p.user_id AND pr.account_id = p.account_id))
ON CONFLICT (user_id, account_id, platform, external_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO platform_catalogs (account_id, user_id, platform, generation, completed_at, work_count)
SELECT a.id, a.user_id, a.platform, 0, NULL, COUNT(w.id)::integer
FROM platform_accounts a
JOIN platform_works w ON w.account_id = a.id AND w.user_id = a.user_id
  AND w.platform = a.platform AND w.catalog_generation = 0
WHERE a.platform = 'douyin'
GROUP BY a.id, a.user_id, a.platform
ON CONFLICT (account_id) DO NOTHING;
--> statement-breakpoint
-- The legacy Analytics store retains real historical values. Copy only numeric
-- count facts whose publication, snapshot, account and user all agree. Missing
-- fields stay missing; a real zero stays zero. This does not certify freshness.
INSERT INTO platform_work_metric_snapshots
  (id, user_id, account_id, platform, metric_key, value, availability, unit,
   metric_window, window_key, source, source_snapshot_key,
   source_snapshot_key_index, captured_at, observed_at, ingested_at, platform_work_id)
SELECT 'pwm-legacy-' || md5(s.id || ':' || m.metric_key),
  s.user_id, s.account_id, w.platform, m.metric_key,
  (s.raw_metrics ->> m.raw_key)::double precision, 'available', 'count',
  '{"kind":"lifetime"}'::jsonb, 'lifetime', 'legacy-analytics:' || s.source,
  s.id, s.id, s.captured_at, s.captured_at, s.created_at, w.id
FROM metric_snapshots s
JOIN publications p ON p.id = s.publication_id AND p.user_id = s.user_id
  AND p.account_id = s.account_id
JOIN platform_works w ON w.legacy_publication_id = p.id AND w.user_id = s.user_id
  AND w.account_id = s.account_id AND w.platform = 'douyin'
CROSS JOIN LATERAL (VALUES
  (CASE WHEN s.raw_metrics ? 'views' THEN 'views' ELSE 'plays' END, 'play_count'),
  ('likes', 'like_count'), ('comments', 'comment_count'),
  ('shares', 'share_count'), ('favorites', 'favorite_count')
) AS m(raw_key, metric_key)
WHERE s.raw_metrics ? m.raw_key
  AND jsonb_typeof(s.raw_metrics -> m.raw_key) = 'number'
  AND (s.raw_metrics ->> m.raw_key)::double precision >= 0
ON CONFLICT (id) DO NOTHING;
