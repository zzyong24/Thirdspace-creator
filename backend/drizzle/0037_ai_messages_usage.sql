-- =====================================================================================
-- [T-239e] 用量可见 —— ai_messages 落每轮 assistant 回复的 token 用量(商用信任,SPEC
--   2026-07-11 director-agent-hardening §2-S5)。
--
-- 新列(全部 nullable,additive):
--   input_tokens  / output_tokens —— streamText totalUsage 的 inputTokens/outputTokens;
--   cached_tokens —— usage.inputTokenDetails.cacheReadTokens(命中缓存的输入 token);
--   model_key     —— 本轮实际用的模型 id(ModelSpec.model;fallback 接管轮记 fallback 模型)。
--
-- 语义:只有 assistant 行带用量(route onFinish 落);user 行/存量老行恒 NULL —— 读侧与
-- 前端会话成本角标按 NULL 兼容(不计入累计、不崩)。中断轮(aborted)已完成步的用量照落。
--
-- additive only:IF NOT EXISTS 幂等,可重跑;不回填存量(老消息无用量数据,诚实 NULL)。
-- =====================================================================================

ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS input_tokens INTEGER;--> statement-breakpoint
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS output_tokens INTEGER;--> statement-breakpoint
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS cached_tokens INTEGER;--> statement-breakpoint
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS model_key TEXT;
