-- 每次领取生成新的随机执行凭证；历史无凭证租约保持原流程，不伪造可用 Worker 引用。
ALTER TABLE execution_tasks ADD COLUMN IF NOT EXISTS fence_token TEXT;
