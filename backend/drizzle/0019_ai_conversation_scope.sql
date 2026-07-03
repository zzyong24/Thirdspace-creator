-- T-096a 会话作用域契约(SPEC docs/superpowers/specs/2026-07-03-chat-session-scope-contract.md §1.3/§1.6):
-- ① ai_conversations 加 scope 列 —— 会话归属命名(服务端一等公民),文法:
--      'global' | 'project:<projectId>' | 'surface:<name>'(| 'surface:<name>:<entityId>' 扩展位,本期不启用)
--    DEFAULT 'global' 先兜底全部存量(增列即全部有值,NOT NULL 安全)。
-- ② 复合索引 (user_id, scope, updated_at) —— 背 listConversations 的按 scope 过滤 + 「该入口最近会话」
--    服务端兜底恢复(scope 内 updatedAt 最新一条)。
-- ③ 幂等 backfill:有项目归属的存量会话(稿面右栏产生的)归 project:<id> 桶;其余存量一次性归 global
--    (DB 里无从考据浮层来源,诚实取舍 —— 旧会话仍可从全局入口历史找到,不假装能还原来源)。
--    WHERE scope = 'global' 使重复执行为 no-op(幂等,§3 矩阵 #8)。
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'global';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_scope ON ai_conversations (user_id, scope, updated_at);
--> statement-breakpoint
UPDATE ai_conversations SET scope = 'project:' || project_id WHERE project_id IS NOT NULL AND scope = 'global';
