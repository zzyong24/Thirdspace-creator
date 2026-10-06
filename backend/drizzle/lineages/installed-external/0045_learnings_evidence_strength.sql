-- =====================================================================================
-- [T-284c G3-A] 复刻闭环补链 —— 复盘经验「真实数据背书才自动晋级」。
--
-- 背景:learnings candidate→validated 此前唯一入口是人工裁决(evaluateLearning),getSuggestions
-- 只读 validated → 人不点=复盘/归因对生成影响 0。原「confidenceScore≥0.7 自动晋级」经核实空转
-- (新 learning confidenceScore 恒 0),作废。改用「真实证据强度」判据:
--   · review.insights 的 learning:来自一条**已发布 + 有真实 metric_snapshots** 的作品复盘 → grounded。
--   · attribution 的 learning:有**逐字稿依据 + ≥N 条真实指标**(attribution 本就只在有指标+有逐字稿
--     作品跑,故其 learning 天然 grounded)→ grounded。
-- grounded → capture 时直接 validated(自动进生成);无真实数据背书(纯 AI 推断)→ 留 candidate 人工裁决。
-- 守宪法②:第一道采纳门不动;只对第二道 candidate→validated 闸,用「客观真实数据背书」替代「AI 自评置信度」。
--
-- 一列 additive(learnings,IF NOT EXISTS 幂等,可重跑;不动存量表/列/行):
--   evidence_strength —— 'grounded'(真实数据背书) | NULL(无背书,留候选人工裁决)。派生列,capture 时算。
-- =====================================================================================

ALTER TABLE learnings ADD COLUMN IF NOT EXISTS evidence_strength TEXT;
