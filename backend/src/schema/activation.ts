import { pgTable, text } from "drizzle-orm/pg-core";

// T-147 P5 桌面激活授权 —— 一机一码激活态本地持久层(接 activation-manager 在线服务)。
//
// 设计(见 docs/superpowers/specs/2026-07-06-p5-activation-gate-design.md §4.3):
//   - **全局单行**(非 user-scoped):激活按「机器」而非「用户」——单机一机一号,PK 恒 'singleton'
//     (参照 skill_config_overrides 的非 ctx 过滤模式,不带 user_id)。
//   - `code` 列**加密存**(复用 P2 secret-crypto 的 encryptSecret,enc:v1: 前缀 + AES-256-GCM;
//     同一 master key,无新基础设施)—— 激活码是敏感凭证,不明文落库。
//   - 时间戳走 ISO-8601 TEXT(照 storage_configs / skill_config_overrides 惯例,非 timestamptz)。
//   - **reset 保留**:activation_state 加进 reset-db.ts 的 PRESERVE Set(像 AI key 一样清库不清激活态,
//     否则每次测试要重激活)。
export const activationState = pgTable("activation_state", {
  // 恒 'singleton' —— 全局单行。多机部署各自本地库,一库一行。
  id: text("id").primaryKey(),
  // 本机硬件指纹(activate 时上报给 activation-manager 的 machineId,一机一码绑定键)。
  machineId: text("machine_id").notNull(),
  // 激活码原文的**密文**(enc:v1: 前缀;复用 secret-crypto.encryptSecret)。重验/展示时解密。
  code: text("code").notNull(),
  // 授权模型:CreatorOS 只用 'TIME'(时间型年卡);COUNT 不接入。
  licenseMode: text("license_mode").notNull(),
  // 接入的 activation-manager 项目标识(默认 'test')。
  projectKey: text("project_key").notNull(),
  // 到期时刻 ISO;null = 永久卡。本地过期判定 + 展示。
  expiresAt: text("expires_at"),
  // 首次激活成功时刻 ISO。
  activatedAt: text("activated_at").notNull(),
  // 最后一次**在线**校验(status)成功时刻 ISO —— 离线宽限窗从这里算(now - lastOnlineCheckAt)。
  lastOnlineCheckAt: text("last_online_check_at").notNull(),
});

export type ActivationStateRow = typeof activationState.$inferSelect;
