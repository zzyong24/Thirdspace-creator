-- =====================================================================================
-- [T-372 L2] activation_state 安全门展示副本三列(SPEC §13 数据模型变更)。
--
-- 背景:激活校验决策链迁到 Rust 壳层(src-tauri/src/license.rs),放行权威 = Rust 独占写的
-- `<appDataDir>/.license` 加密快照;本表仍由 sidecar backend 独占写(BR-01),但降级为
-- **展示副本**——Rust 放行后经 loopback RPC(/api/v1/local/license-sync)把最新安全态同步
-- 进来,供设置页「激活状态」面板展示。门控判定不读这三列。
--
-- 三列 additive(IF NOT EXISTS 幂等,可重跑;不动存量行):
--   last_seen_at   TEXT     防回拨单调递增 last-seen(ISO UTC;真值在 Rust 双冗余点)
--   grace_seconds  INTEGER  服务端按码型下发的离线宽限秒数(内测 86400 / 买断 2592000)
--   revoked        INTEGER  签名响应的吊销标志(0/1),DEFAULT 0
-- =====================================================================================

ALTER TABLE activation_state ADD COLUMN IF NOT EXISTS last_seen_at TEXT;
--> statement-breakpoint
ALTER TABLE activation_state ADD COLUMN IF NOT EXISTS grace_seconds INTEGER;
--> statement-breakpoint
ALTER TABLE activation_state ADD COLUMN IF NOT EXISTS revoked INTEGER DEFAULT 0;
