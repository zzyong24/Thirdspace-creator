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
  "channel_model_credentials", // 渠道 service Key(本机密文;重置后免重复填写)
  "agent_configurations", // AI agent 路由配置
  "storage_configs", // 对象存储配置(blob 路由可用)
  // [T-513] 只迁回账号增量覆盖；旧全局 skill_config_overrides 明确不迁移、不回灌。
  "account_skill_overlays",
  // 账号增量历史同属用户资产；保留后仍由联合 owner tuple 隔离。
  "account_skill_overlay_versions",
  "activation_state", // T-147 P5 一机一码激活态(清库不清激活,免每次重激活)
];

/** Set 形态(reset-db.ts 的 wipe 过滤用)。 */
export const PRESERVE_TABLE_SET: ReadonlySet<string> = new Set(PRESERVE_TABLES);
