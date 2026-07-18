// [T-363] 「清库/重置时保留的 user 级资产表」**单一真值清单**。
//
// 两个消费方(勿再各自复制一份清单,防漂移):
//   1. backend/scripts/reset-db.ts —— dev 清库脚本:TRUNCATE 时跳过这些表(表级保留);
//   2. backend/src/workspace-restore.ts —— 产品「重置工作区」(T-332 S5,Rust 整目录归档)
//      之后的首次启动:从归档库把这些表迁回新库(归档绕过了表级保留,靠迁回补齐语义)。
//
// 收录标准:纯身份 + 配置 =「模型是租的,skill 是用户的」铁律里属于**用户**的那部分,
// 与内容数据(项目/素材/发布/采集…)无关,清库/重置后仍应直接可用。
export const PRESERVE_TABLES: readonly string[] = [
  "users", // 登录身份(user_id 归属一致性的根)
  "sessions", // 保持登录态(免重登)
  "user_preferences", // 用户偏好/设置
  "model_configurations", // AI 模型 + key(免每次重配;key 密文列一并保留)
  "agent_configurations", // AI agent 路由配置
  "storage_configs", // 对象存储配置(blob 路由可用)
  "skill_config_overrides", // 技能/prompt 覆盖配置(「skill 是用户的」)
  // [T-363] 技能覆盖的版本历史(T-165 一键回滚链)。skill 定制资产的一部分:
  // 只留当前值不留历史 = 回滚能力随清库蒸发,故一并保留。
  "skill_config_override_versions",
  "activation_state", // T-147 P5 一机一码激活态(清库不清激活,免每次重激活)
];

/** Set 形态(reset-db.ts 的 wipe 过滤用)。 */
export const PRESERVE_TABLE_SET: ReadonlySet<string> = new Set(PRESERVE_TABLES);
