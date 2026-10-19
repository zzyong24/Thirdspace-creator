-- T-146 切片 b · 用户上传素材主权:material_links 加项目内优先级 priority。
-- 用户裁决②(二元自动):用户第一手素材 = 'high',AI 找的二手 = 'normal'。派生规则在 SERVICE
-- 层(addedByType='user'→high / 'ai'→normal;显式传值可覆盖),枚举 service 校验(gate minor
-- 驳回加 DB CHECK:本仓枚举一律 service 层校验)。DEFAULT 'normal' 兜住直插/存量行(存量都留
-- normal,不改历史语义)。additive、幂等(IF NOT EXISTS),不动存量数据。
ALTER TABLE material_links ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';
