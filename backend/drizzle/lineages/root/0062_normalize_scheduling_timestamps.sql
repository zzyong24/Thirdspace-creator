-- T-601：0059/0060 曾以 CURRENT_TIMESTAMP::TEXT 写入 PostgreSQL 文本时刻，
-- 语义是真实 UTC 时刻，但不符合 API 约定的 ISO 形状，导致自动化列表整页校验失败。
--
-- 只修复这类可识别的 PostgreSQL timestamptz 文本；其它未知脏值不猜、不覆盖，
-- 继续由契约显式暴露。
UPDATE scheduled_job
SET updated_at = TO_CHAR(
  updated_at::TIMESTAMPTZ AT TIME ZONE 'UTC',
  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
)
WHERE updated_at ~
  '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?[+-][0-9]{2}(:?[0-9]{2})?$';
