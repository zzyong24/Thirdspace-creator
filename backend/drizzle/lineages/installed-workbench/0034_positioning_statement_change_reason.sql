-- =====================================================================================
-- [T-231⑥] 定位陈述「修改原因」落库 —— 前端表单已收集但静默丢弃(幽灵字段),现补全链:
-- contract body(changeReason)→ transport → service → repository → 本列。
--
-- positioning_statements.change_reason:这次为什么开新版本(团队留痕,回看历史决策)。
-- additive、幂等;存量行 ''(历史版本没有记录过原因,空串诚实表示"未填")。
-- 行仍不可变(append-only 版本链不变,本列只在 INSERT 时写入)。
-- =====================================================================================

ALTER TABLE positioning_statements ADD COLUMN IF NOT EXISTS change_reason TEXT NOT NULL DEFAULT '';
