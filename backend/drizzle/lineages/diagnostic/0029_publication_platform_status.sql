-- =====================================================================================
-- T-033 [Feature] 发布/项目列表默认只显示已通过(平台侧 status 同步)——
-- publications 加 platform_status 承载位,detail ingest 把「审核状态」列(「已通过」/「仅自己可见」/
-- 「私密」等)落进这里,list 默认按 status 过滤(已通过 + NULL 视为可见,向后兼容)。
--
-- 形状(text,nullable):
--   - 抖音端原始审核状态字符串(导出 .xlsx 「审核状态」列原值,留原字符串不归一,过滤端按
--     exact-match '已通过' 判定 —— 平台字面量稳,其他字面量(审核中/未通过)诚实标"未通过")。
--   - 与 hidden_at 正交:hidden 来自"作者主动设私密",status 来自"平台审核态"。两者可能都为
--     真(私密作品通常已通过审核;若作品被平台下架则 status 也异常)—— list 默认两道都过才显示,
--     单一条件都不显。
--
-- additive、幂等、可回滚:
--   - ADD COLUMN IF NOT EXISTS,nullable,无 DEFAULT —— 旧 run / 旧客户端读到 NULL 不崩(向后兼容)。
--   - 无外键 —— 平台字段本地缓存,只读不写。
--   - 回滚 = 列设回 NULL / DROP COLUMN(无数据依赖)。
--   - reset 保留:reset-db.ts 的 PRESERVE Set 已加入 publications(清库不清数据)。
-- =====================================================================================

ALTER TABLE publications ADD COLUMN IF NOT EXISTS platform_status TEXT;
