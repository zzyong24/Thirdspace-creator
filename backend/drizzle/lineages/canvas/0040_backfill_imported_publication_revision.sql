-- =====================================================================================
-- [B-02] 存量 publications 的 current_revision_id 为 NULL 会毒化 contract 解析。
--
-- 背景:导入发布(createImportedPublication,日拉调用)旧实现落 current_revision_id=NULL,
-- transport 再用 "" 占位伪装。但 contract 的 publicationResource.currentRevisionId 是非空 id
-- (z.string().min(1)),client 对 envelope 做 Zod parse —— 正常日拉一条作品后 list/detail 会整
-- 体解析失败。代码侧已改为原子补铸 revision-1(currentRevisionId 恒非空)并删掉 "" 伪装,但
-- 装机版真实库里遗留的 NULL 行仍会让读回失败,故本迁移回填。
--
-- 幂等 & 安全:只动 current_revision_id IS NULL 的行;有 revision 的复用最高号 revision,没有的
-- 原子补铸 revision-1(空标题,与 register/create auto-mint 同语义)。NOT EXISTS/IS NULL 守卫
-- 保证可重跑;不动任何已正常挂 revision 的行。
-- =====================================================================================

-- ① 为 current_revision_id 为 NULL 且完全没有 revision 的 publication 补铸 revision-1(空标题)。
INSERT INTO publication_revisions (
  id, user_id, publication_id, revision_number, title, description,
  cover_asset_id, category, series, platform_tags, platform_settings, created_at
)
SELECT
  'rev_b02_' || p.id,
  p.user_id,
  p.id,
  1,
  '',
  '',
  NULL,
  '',
  '',
  '[]'::jsonb,
  '{}'::jsonb,
  p.created_at
FROM publications p
WHERE p.current_revision_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM publication_revisions r WHERE r.publication_id = p.id
  );
--> statement-breakpoint
-- ② 把每条 current_revision_id 为 NULL 的 publication 指向它自己最高号的 revision
--    (①刚补铸的,或极端情况下既有的),使 currentRevisionId 恒为真实 id。
UPDATE publications p
SET current_revision_id = (
  SELECT r.id
  FROM publication_revisions r
  WHERE r.publication_id = p.id
  ORDER BY r.revision_number DESC
  LIMIT 1
)
WHERE p.current_revision_id IS NULL
  AND EXISTS (
    SELECT 1 FROM publication_revisions r WHERE r.publication_id = p.id
  );
