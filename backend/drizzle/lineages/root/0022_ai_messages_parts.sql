-- T-128 Copilot 卡片持久化:ai_messages 加 parts(落库的 useChat UIMessage parts,含 text +
-- tool-result 部件)。刷新后会话恢复据它重建 message.parts → 复用 ai-copilot-content 现有候选卡/
-- 素材卡/审核报告卡渲染分支(此前只存 content 纯文本,tool-result 卡在存那刻就丢 → 刷新即消失)。
-- NOT NULL DEFAULT '[]':存量行 backfill 空数组(前端 toUIMessages 回落 content 文本气泡,向后兼容)。
-- additive、幂等(IF NOT EXISTS),不动存量数据。
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS parts JSONB NOT NULL DEFAULT '[]'::jsonb;
