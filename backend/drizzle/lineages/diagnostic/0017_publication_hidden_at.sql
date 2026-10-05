-- T-073 作品列表过滤已隐藏作品:publications 加平台侧可见性承载位。
-- 非空 = 该作品在抖音端「仅自己可见/已隐藏」的同步时刻(采集明细导出「审核状态」列驱动);
-- null = 可见。与 removed_at(平台已删)语义正交:hidden 可恢复可见。
ALTER TABLE publications ADD COLUMN IF NOT EXISTS hidden_at TEXT;
