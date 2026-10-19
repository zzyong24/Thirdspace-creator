-- T-610：人工采纳经验直接进入知识库，并以同账号 title+insight 稳定去重。
ALTER TABLE learnings
  ADD COLUMN IF NOT EXISTS content_fingerprint TEXT;
--> statement-breakpoint

-- 旧版通过 learnings.create 的人工作品没有 source 标记，但满足：
--   无 review/project/grounded 锚、不是 edit_delta，也不是自动归因尾注。
-- 这些行已经经过用户“采纳/存为经验”确认，迁移后直接成为知识库可见经验。
UPDATE learnings
SET
  validation_status = 'validated',
  confidence_score = GREATEST(confidence_score, 40),
  updated_at = GREATEST(updated_at, created_at)
WHERE validation_status = 'candidate'
  AND review_id IS NULL
  AND project_id IS NULL
  AND evidence_strength IS NULL
  AND learning_type <> 'edit_delta'
  AND insight NOT LIKE '%(来源:归因 attributionId=%';
--> statement-breakpoint

-- 同用户/账号内按 trim(title)+分隔符+trim(insight) 归一。优先保留 validated，
-- 其次保留最早创建的记录；其他行标 discarded 而不物理删除，避免破坏既有引用。
WITH ranked AS (
  SELECT
    id,
    md5(btrim(title) || chr(31) || btrim(insight)) AS fingerprint,
    row_number() OVER (
      PARTITION BY
        user_id,
        account_id,
        md5(btrim(title) || chr(31) || btrim(insight))
      ORDER BY
        CASE WHEN validation_status = 'validated' THEN 0 ELSE 1 END,
        created_at,
        id
    ) AS position
  FROM learnings
  WHERE validation_status <> 'discarded'
)
UPDATE learnings AS target
SET
  validation_status = 'discarded',
  content_fingerprint = NULL
FROM ranked
WHERE target.id = ranked.id
  AND ranked.position > 1;
--> statement-breakpoint

WITH active AS (
  SELECT
    id,
    md5(btrim(title) || chr(31) || btrim(insight)) AS fingerprint
  FROM learnings
  WHERE validation_status <> 'discarded'
)
UPDATE learnings AS target
SET content_fingerprint = active.fingerprint
FROM active
WHERE target.id = active.id;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS ux_learnings_active_content_fingerprint
  ON learnings (user_id, account_id, content_fingerprint)
  WHERE validation_status <> 'discarded'
    AND content_fingerprint IS NOT NULL;
