-- =====================================================================================
-- T-165 skill_config_overrides 版本历史 —— skill_config_override_versions 表(快照 + 一键回滚)。
--
-- 目的:skill_config_overrides 每次 putSkillConfigOverride upsert 只覆盖当前行(version++),
--   丢失历史。本表在每次 upsert 后追加一条**本次生效配置的快照**,让「A/B 试新 prompt 配置失败」
--   能一键回滚到任一历史版本(rollbackSkillConfigOverride 取快照重新 put = 回滚也留新审计版本)。
--
-- 形状(独立表,无外键 —— override 行删了历史仍可查/回滚;非 user-scoped,同 skill_config_overrides):
--   - id                TEXT PK,deps.nextId("skover") 生成。
--   - override_id       TEXT NOT NULL,= skill_config_overrides.id(哪个 skill)。
--   - version           TEXT,同步那次 upsert 的审计版本号(putSkillConfigOverride 的 nextVersion)。
--   - system/template   TEXT,该版本的 prompt 系统词/模板快照。
--   - tools/required_facets/output_schema  JSONB,该版本的工具白名单/必需 facet/输出契约快照。
--   - updated_by        TEXT,该版本由谁写。
--   - created_at        TEXT NOT NULL,记录时刻 ISO(与 override.updated_at 同值,单列便于按记录序排)。
--
-- additive、幂等、可回滚:
--   - CREATE TABLE IF NOT EXISTS —— 重复 migrate 不炸;旧库建出空表无副作用。
--   - 无外键(不 REFERENCES skill_config_overrides)—— 历史独立于当前行生命周期。
--   - 回滚本迁移 = DROP TABLE skill_config_override_versions(无下游依赖)。
--   - reset:内容表,reset-db.ts 默认清(非 PRESERVE);skill_config_overrides 本身也不在 PRESERVE。
-- =====================================================================================

CREATE TABLE IF NOT EXISTS skill_config_override_versions (
  id TEXT PRIMARY KEY,
  override_id TEXT NOT NULL,
  version TEXT,
  system TEXT,
  template TEXT,
  tools JSONB,
  required_facets JSONB,
  output_schema JSONB,
  updated_by TEXT,
  created_at TEXT NOT NULL
);
