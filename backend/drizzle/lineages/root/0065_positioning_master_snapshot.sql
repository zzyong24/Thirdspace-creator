-- T-632：定位陈述历史补充完整母版快照。
-- 旧行保持 NULL，不能用当前 profile 批量猜测历史；第一次重置前由服务以真实当前值只写一次。
ALTER TABLE positioning_statements
  ADD COLUMN IF NOT EXISTS master_snapshot JSONB;
