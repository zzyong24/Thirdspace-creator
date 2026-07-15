import { pgTable, text, boolean, jsonb } from "drizzle-orm/pg-core";

// [T-235c] 指定抖音收藏夹采集(收藏夹跟拍信号源,SPEC 2026-07-11 daily-topic-autopilot 追加)。
//
// 定位:用户在抖音建专门收藏夹(如「选题库」),把想跟拍的对标视频收进去;在选题中心
//   「信号源→收藏夹」**按夹名登记**要采集的指定夹。定时 job(sourceKind=favorites)每天:
//   拉本人收藏夹列表 → 按 name 精确匹配登记夹(回填 collects_id)→ 拉夹内视频 → 幂等落
//   favorites_items 台账 → 限量(≤3/run)进候选池(source=favorites)。**只采登记的指定夹,
//   不碰其他收藏**(隐私红线)。
//
// ① favorites_folders:登记的收藏夹(列模式同 trend_sources:user/account-scoped + enabled
//    开关 + 幂等唯一键)。身份键:name(同 user 同名幂等更新不新建 —— 登记时用户只知道夹名,
//    collects_id 首采匹配回填)。last_synced_at:最近一次成功匹配+采集时刻(诊断/展示)。
// ② favorites_items:夹内视频台账(采集去重锚 + 进池流转)。身份键:aweme_id(同 user 同
//    视频只记一次 —— 跨夹收藏同视频也不重复进池)。status:pending(待进池)| promoted
//    (已进池,candidate_id 溯源)。**限量进池**防灌库:collector 每 run 只 promote ≤3 条。
//
// Ownership:user_id NOT NULL(写时从 ctx.userId stamp);account_id nullable(按号隔离,T-201)。
// canonical 定义落 shared infra(@creatoros/backend)—— 迁移 0038 建表,db.ts schema 并入,
//   模块 favorites.db-schema.ts 再 re-export(ONE source of truth,同 trend-sources)。

export const favoritesFolders = pgTable("favorites_folders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // 所有权边界
  accountId: text("account_id").notNull(), // [T-201] 按号隔离;nullable 稳定终态
  name: text("name").notNull(), // 收藏夹名(幂等锚:同 user 同名唯一;须与抖音收藏夹同名)
  collectsId: text("collects_id"), // 抖音 collects_id_str(首采按名匹配回填;未匹配 NULL)
  note: text("note"), // 备注(可选,如「只收对标爆款」)
  enabled: boolean("enabled").notNull().default(true), // 采集开关(停采不删)
  lastSyncedAt: text("last_synced_at"), // 最近一次成功匹配+采集时刻(未采过 NULL)
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const favoritesItems = pgTable("favorites_items", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // 所有权边界
  accountId: text("account_id").notNull(), // [T-201] 按号隔离;nullable 稳定终态
  folderId: text("folder_id").notNull(), // soft FK → favorites_folders.id(夹删后台账保留溯源)
  awemeId: text("aweme_id").notNull(), // 幂等锚:同 user 同视频只记一次
  title: text("title").notNull().default(""), // 视频 desc 截 80(展示/进池标题)
  authorNickname: text("author_nickname").notNull().default(""),
  url: text("url").notNull().default(""), // https://www.douyin.com/video/<awemeId>
  status: text("status").notNull().default("pending"), // pending | promoted
  candidateId: text("candidate_id"), // promoted 后回填(soft FK → candidates.id,溯源)
  // [T-235d-distill] 收藏夹蒸馏链落点(迁移 0039,additive)。**origin 隔离铁律**:他人收藏作品
  //   逐字稿落在**本行**,永不建 imported project / artifact(否则污染 imported/reconstructed
  //   origin 隔离)。见 favorites-distill-runner.ts。
  transcript: text("transcript"), // 他人作品逐字稿(独立落点,非 project artifact);NULL=未转写
  // 蒸馏链状态:NULL(未入链)| knowledge(判为知识,atoms 待确认门采纳)| topic(判为纯选题,
  //   已有跟拍候选无额外动作)| skip(无沉淀价值/图集)| failed(带 error)。
  distillStatus: text("distill_status"),
  // 蒸馏产物:{ reason?, atoms?, suggestedTags?, error? }。knowledge verdict 存 atoms(**确认门
  //   候选**,AI 只产候选、人采纳才 knowledge.create,铁律②);jsonb 免迁移扩展(同 candidates.card)。
  distillResult: jsonb("distill_result").notNull().default({}),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Raw DDL(参考/文档用;实际建表经版本化迁移 0038,同 trend-sources)。IF NOT EXISTS 幂等。
export const FAVORITES_DDL = `
CREATE TABLE IF NOT EXISTS favorites_folders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  collects_id TEXT,
  note TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- [T-326 DATA-H02] 唯一键含账号维度(迁移 0041;NULLS NOT DISTINCT 让未选号的 NULL 桶也幂等)。
CREATE UNIQUE INDEX IF NOT EXISTS ux_favorites_folders_identity_v2 ON favorites_folders (user_id, account_id, name) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS ix_favorites_folders_user_account ON favorites_folders (user_id, account_id);
CREATE TABLE IF NOT EXISTS favorites_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  aweme_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  author_nickname TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  candidate_id TEXT,
  transcript TEXT,
  distill_status TEXT,
  distill_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- [T-326 DATA-H02] 唯一键含账号维度(迁移 0041)。
CREATE UNIQUE INDEX IF NOT EXISTS ux_favorites_items_identity_v2 ON favorites_items (user_id, account_id, aweme_id) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS ix_favorites_items_user_account ON favorites_items (user_id, account_id);
-- [T-235d-distill] 蒸馏链批取/确认门读面索引(迁移 0039)。
CREATE INDEX IF NOT EXISTS ix_favorites_items_distill ON favorites_items (user_id, distill_status);
`;
