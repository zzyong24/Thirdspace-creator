-- =====================================================================================
-- T-147 P5 桌面激活授权 —— activation_state 表(一机一码激活态本地持久层)。
--
-- 目的:桌面壳(Tauri)启动时的激活门需要在本地记住「已激活」状态(machineId、加密激活码、
--   到期时刻、最后在线校验时刻),接的是已上线的 activation-manager(license.aitongban.cloud)
--   一机一码 TIME 型年卡。web/dev 不触发激活门,但表本身建出来无害(不写即空)。
--
-- 形状(全局单行,PK 恒 'singleton',非 user-scoped —— 激活按机器不按用户):
--   - id                    TEXT PK,恒 'singleton'。
--   - machine_id            TEXT,本机硬件指纹(activate 上报的 machineId)。
--   - code                  TEXT,激活码**密文**(enc:v1: 前缀;复用 P2 secret-crypto,不明文落库)。
--   - license_mode          TEXT,'TIME'(只接入时间型)。
--   - project_key           TEXT,activation-manager 项目标识(默认 'test')。
--   - expires_at            TEXT,到期 ISO;NULL = 永久。
--   - activated_at          TEXT,首次激活成功 ISO。
--   - last_online_check_at  TEXT,最后一次在线 status 成功 ISO(离线宽限窗基准)。
--
-- additive、幂等、可回滚:
--   - CREATE TABLE IF NOT EXISTS —— 重复 migrate 不炸;旧库/web 库建出空表无副作用。
--   - 无外键(全局单行,不 REFERENCES users)—— 激活态独立于用户身份。
--   - 回滚 = DROP TABLE activation_state(无下游依赖)。
--   - **reset 保留**:reset-db.ts 的 PRESERVE Set 已加入 activation_state(清库不清激活态)。
-- =====================================================================================

CREATE TABLE IF NOT EXISTS activation_state (
  id TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL,
  code TEXT NOT NULL,
  license_mode TEXT NOT NULL,
  project_key TEXT NOT NULL,
  expires_at TEXT,
  activated_at TEXT NOT NULL,
  last_online_check_at TEXT NOT NULL
);
