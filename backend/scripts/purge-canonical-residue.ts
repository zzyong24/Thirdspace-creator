// 一次性存量清理(T-139):把 T-135「退役 canonical seed」之前每次启动灌进 dev 库的
// canonical 假数据(Zyong Zhu 人设 / 假金句 / 假素材 / 假选题 / 假账号 / settings 预设 …)
// 从用户真实数据库里精确删掉,**只按 canonical id 集合删**,绝不碰用户真实数据。
//
// 背景:seed 是 onConflictDoNothing —— T-135 退役了 seed 代码,却不删已灌进去的行。
// 新库开箱空了,但老的 dev 库(DATABASE_URL 的 Postgres,或 PGLITE_DATA_DIR 落盘库)里
// 这些 canonical 残留还在,得靠这个一次性脚本清干净。
//
// ─────────────────────────────────────────────────────────────────────────────
// 安全第一(硬约束):
//   1. **dry-run 是默认**(不传参数 = dry-run)。dry-run 下只 SELECT,按类打印
//      「要删的行数 + 每类前几条 id/title 摘要」,让你肉眼核对确认这些确实是假数据。
//      **dry-run 绝不删任何东西。**
//   2. **--apply 才真删**,且整批包在**一个事务**里(全成功 or 全回滚)。
//   3. 每个 DELETE 都按**精确 id 集合**(WHERE id IN (...)),不用宽泛前缀。
//      删 knowledge 额外加 `id NOT LIKE 'dy-%'` 二次防护(护抖音真实金句)。
//   4. **白名单硬保护**(见下方 WHITELIST 注释):projects 全表 / knowledge dy-* /
//      review_rules / rubric-canonical + rubricver / AI 骨架 ai-model-*/ai-agent-* /
//      users + sessions —— 一律不碰(靠「只按 canonical 精确 id 删」天然排除)。
//
// ─────────────────────────────────────────────────────────────────────────────
// 用法:
//   dry-run(默认,只看不删):
//     pnpm --filter @creatoros/backend exec tsx scripts/purge-canonical-residue.ts
//   真删(显式 --apply,事务):
//     pnpm --filter @creatoros/backend exec tsx scripts/purge-canonical-residue.ts -- --apply
//
//   连库同 backend 其它脚本:DATABASE_URL(真 Postgres,用户当前 dev)优先;否则
//   PGLITE_DATA_DIR(落盘 PGlite);都没有则 createConfiguredDb 走本地默认落盘目录。
//   走的是共享 db 工厂 createConfiguredDb(与 app 运行时同一条 driver 选择逻辑)。

import {
  createConfiguredDb,
  knowledgeItems,
  knowledgeRevisions,
  knowledgeRelations,
  assets,
  assetFiles,
  learnings,
  learningApplications,
  modelConfigurations,
  agentConfigurations,
  externalSources,
  creatorProfiles,
  positioningStatements,
  candidates,
  platformAccounts,
  calibrationRuleSuggestions,
  type Db,
} from "@creatoros/backend";
import { and, inArray, notLike, type SQL } from "drizzle-orm";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";

// ─── canonical id 集合(单一真值)───────────────────────────────────────────────
// 来源标注(主 agent 复核用):
//   [fixtures] = frontend/src/fixtures/canonical.ts 的对应数组的 id(逐条核对过)。
//   [git]      = T-135 提交 aa82731 从 persistence-client.ts 删掉的硬编码 seed id
//                (不在 canonicalDataset,是内联在 seed 编排里的 —— git show aa82731 翻出)。

// knowledge(假金句)—— [fixtures] knowledgeItems(5)/ knowledgeRevisions(3)/ relations(1)。
// ⚠️ 全部 knowledge-* 前缀,无一 dy-;删 knowledge 仍强制加 NOT LIKE 'dy-%' 二次防护。
const KNOWLEDGE_ITEM_IDS = [
  "knowledge-arc-dia-research",
  "knowledge-local-memory-trend",
  "knowledge-hook-formula",
  "knowledge-publish-checklist",
  "knowledge-creator-interview-01",
];
const KNOWLEDGE_REVISION_IDS = [
  "krevision-arc-dia-research",
  "krevision-local-memory-trend",
  "krevision-hook-formula",
];
const KNOWLEDGE_RELATION_IDS = ["krel-local-memory-arc"];

// assets(假素材)—— [fixtures] assets(6)/ assetFiles(6)。
const ASSET_IDS = [
  "asset-poster-ainativebrowser",
  "asset-broll-1",
  "asset-broll-2",
  "asset-audio-1",
  "asset-doc-1",
  "asset-podcast-ep01",
];
const ASSET_FILE_IDS = [
  "afile-poster-ainativebrowser",
  "afile-broll-1",
  "afile-broll-2",
  "afile-audio-1",
  "afile-doc-1",
  "afile-podcast-ep01",
];

// learnings(假方法论)—— [fixtures] learnings(3)。
// learningApplications(2)从未被 seed(pre-T-135 无 seedLearningApplications 调用),
// 存量库里预计 0 行;仍列进删除集防御(命中 0 无害,若某处灌过则一并清)。
const LEARNING_IDS = [
  "learning-arc-research",
  "learning-hook-15s",
  "learning-failure-screenshot",
];
const LEARNING_APPLICATION_IDS = [
  "lapplied-arc-ainativebrowser",
  "lapplied-hook-ainativebrowser",
];

// settings 的 canonical model/agent 预设(假配置)。
// [主 agent 裁决 2026-07-05] user_preferences **不删**:它按 user_id 一行 per user,canonical
//   seed 那行 user_id=user-zyongzhu 与真实用户同 id;用户可能改过主题/密度等 UI 偏好(那行即
//   用户真实设置),删了丢设置得不偿失。偏好设置不算「假内容展示」,保留无害。故从删除集移除。
// ⚠️ modelConfigurations / agentConfigurations 的 canonical seed id 是 model-* / agent-*,
//    **不是** AI 骨架的 ai-model-* / ai-agent-*(那批是 buildAiModelConfigs/buildAiAgentConfigs
//    另灌的,id 形如 ai-model-<user>-<capability>,保留)。按精确 id 删,天然只命中 canonical。
const MODEL_CONFIG_IDS = ["model-script", "model-research"];
const AGENT_CONFIG_IDS = ["agent-research-copilot"];

// external_sources(假来源)。
//   [git] src-mock-canonical / src-douyin-canonical —— T-135 内联 seed 的两条(确被 seed 过)。
//   [fixtures] extsource-bilibili-metrics —— 在 canonicalDataset.externalSources,但 pre-T-135
//     的 seedExternalSources 只灌了上面两条内联对象、没灌这条 fixture 数组 → 存量库预计 0 行;
//     仍列进删除集防御(命中 0 无害)。
const EXTERNAL_SOURCE_IDS = [
  "src-mock-canonical",
  "src-douyin-canonical",
  "extsource-bilibili-metrics",
];

// positioning(假身份定位:Zyong Zhu「把前沿 AI 论文工程化的硬核创作者」)。
//   [git] profile-canonical(CreatorProfile)+ posstmt-canonical-1/2(两版 statement)。
const CREATOR_PROFILE_IDS = ["profile-canonical"];
const POSITIONING_STATEMENT_IDS = ["posstmt-canonical-1", "posstmt-canonical-2"];

// candidates(假选题:cand-canonical-1/2/3「用 RAG 把内部文档变成问答助手」等)。
//   [git] cand-canonical-1 / cand-canonical-2 / cand-canonical-3。
const CANDIDATE_IDS = [
  "cand-canonical-1",
  "cand-canonical-2",
  "cand-canonical-3",
];

// platform_accounts(假账号:acct-canonical-douyin「@抖音创作者」)。
//   [git] acct-canonical-douyin。
const PLATFORM_ACCOUNT_IDS = ["acct-canonical-douyin"];

// calibration_rule_suggestions(假复盘回流建议,引用被删的 learning-hook-15s)。
//   [git] calibsug-canonical-1。
const CALIBRATION_RULE_SUGGESTION_IDS = ["calibsug-canonical-1"];

// ─── WHITELIST(绝对不删,靠「只按上面精确 canonical id 删」天然排除)────────────────
//   • projects 全表(71 imported 真作品 + 运行时建的)—— 本脚本根本不 touch projects 表。
//   • knowledge dy-*(抖音真实金句)—— 删 knowledge 额外加 NOT LIKE 'dy-%' 二次防护。
//   • review_rules(违禁词 rrule-seed-*)—— 本脚本不 touch 该表。
//   • rubric-canonical + rubricver-canonical-1(校准默认 rubric)—— 不 touch rubrics/rubric_versions。
//   • AI 骨架 ai-model-* / ai-agent-*(model/agent catalog)—— canonical settings 用 model-*/agent-*
//     精确 id,与 ai-* 前缀不重叠,天然不误删。
//   • users(user-zyongzhu)+ sessions —— 本脚本不 touch 这两表。

// 一「类」删除单元:表 + 该表要删的 id 集合 + 摘要用列(id / 可选 title|name)+ 额外 WHERE 守卫。
interface PurgeSpec {
  label: string; // 人读的类名(打印用)
  table: PgTable;
  idColumn: PgColumn; // 精确匹配用的主键列(多数是 id;user_preferences 用 user_id)
  ids: string[];
  // 摘要打印用的第二列(title/name),没有则只打 id。
  summaryColumn?: PgColumn;
  // 额外的硬防护条件(如 knowledge 的 NOT LIKE 'dy-%');与 inArray(ids) AND 到一起。
  extraGuard?: SQL;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const mode = apply ? "APPLY(真删,事务)" : "DRY-RUN(默认,只看不删)";

  const configured = await createConfiguredDb();
  const { db, driver, dispose } = configured;
  const target =
    driver.kind === "postgres"
      ? (driver.target ?? "").replace(/:\/\/([^:]+):[^@]+@/, "://$1:***@")
      : (driver.target ?? "(memory)");
  console.log(
    `[purge-canonical-residue] mode=${mode} driver=${driver.kind} target=${target}`,
  );

  // 每一类:表 + 精确 id 集合 + 摘要列 + 额外守卫。删除顺序把「子表」排前(revisions/
  // relations/files/applications/statements 先于其 items/assets/learnings/profiles),
  // 让即便有 FK 也不留悬挂(本仓模块化单体 schema 无跨表 DB FK,顺序主要为可读)。
  const specs: PurgeSpec[] = [
    // knowledge —— 子表先:revisions / relations,再 items。三者都加 dy-* 二次防护。
    {
      label: "knowledge_revisions (canonical 金句 revision)",
      table: knowledgeRevisions,
      idColumn: knowledgeRevisions.id,
      ids: KNOWLEDGE_REVISION_IDS,
      extraGuard: notLike(knowledgeRevisions.id, "dy-%"),
    },
    {
      label: "knowledge_relations (canonical 金句 relation)",
      table: knowledgeRelations,
      idColumn: knowledgeRelations.id,
      ids: KNOWLEDGE_RELATION_IDS,
      extraGuard: notLike(knowledgeRelations.id, "dy-%"),
    },
    {
      label: "knowledge_items (canonical 假金句)",
      table: knowledgeItems,
      idColumn: knowledgeItems.id,
      ids: KNOWLEDGE_ITEM_IDS,
      summaryColumn: knowledgeItems.title,
      extraGuard: notLike(knowledgeItems.id, "dy-%"),
    },
    // assets —— files 先,再 assets。
    {
      label: "asset_files (canonical 假素材文件)",
      table: assetFiles,
      idColumn: assetFiles.id,
      ids: ASSET_FILE_IDS,
    },
    {
      label: "assets (canonical 假素材)",
      table: assets,
      idColumn: assets.id,
      ids: ASSET_IDS,
      summaryColumn: assets.name,
    },
    // learnings —— applications 先(存量预计 0),再 learnings。
    {
      label: "learning_applications (canonical，存量预计 0)",
      table: learningApplications,
      idColumn: learningApplications.id,
      ids: LEARNING_APPLICATION_IDS,
    },
    {
      label: "learnings (canonical 假方法论)",
      table: learnings,
      idColumn: learnings.id,
      ids: LEARNING_IDS,
      summaryColumn: learnings.title,
    },
    // settings 的 canonical model/agent 预设(user_preferences 不删，见上方裁决注)。
    {
      label: "model_configurations (canonical settings，非 AI 骨架)",
      table: modelConfigurations,
      idColumn: modelConfigurations.id,
      ids: MODEL_CONFIG_IDS,
      summaryColumn: modelConfigurations.modelName,
    },
    {
      label: "agent_configurations (canonical settings，非 AI 骨架)",
      table: agentConfigurations,
      idColumn: agentConfigurations.id,
      ids: AGENT_CONFIG_IDS,
      summaryColumn: agentConfigurations.name,
    },
    // external_sources。
    {
      label: "external_sources (canonical 假来源)",
      table: externalSources,
      idColumn: externalSources.id,
      ids: EXTERNAL_SOURCE_IDS,
      summaryColumn: externalSources.name,
    },
    // positioning —— statements 先，再 profile。
    {
      label: "positioning_statements (canonical 假定位版本)",
      table: positioningStatements,
      idColumn: positioningStatements.id,
      ids: POSITIONING_STATEMENT_IDS,
      summaryColumn: positioningStatements.oneLiner,
    },
    {
      label: "creator_profiles (canonical 假身份定位)",
      table: creatorProfiles,
      idColumn: creatorProfiles.id,
      ids: CREATOR_PROFILE_IDS,
      summaryColumn: creatorProfiles.persona,
    },
    // candidates。
    {
      label: "candidates (canonical 假选题)",
      table: candidates,
      idColumn: candidates.id,
      ids: CANDIDATE_IDS,
      summaryColumn: candidates.title,
    },
    // platform_accounts。
    {
      label: "platform_accounts (canonical 假账号)",
      table: platformAccounts,
      idColumn: platformAccounts.id,
      ids: PLATFORM_ACCOUNT_IDS,
      summaryColumn: platformAccounts.accountHandle,
    },
    // calibration_rule_suggestions。
    {
      label: "calibration_rule_suggestions (canonical 假回流建议)",
      table: calibrationRuleSuggestions,
      idColumn: calibrationRuleSuggestions.id,
      ids: CALIBRATION_RULE_SUGGESTION_IDS,
      summaryColumn: calibrationRuleSuggestions.rationale,
    },
  ];

  // 组一条 WHERE:inArray(idColumn, ids) [AND extraGuard]。
  const whereFor = (s: PurgeSpec): SQL => {
    const inClause = inArray(s.idColumn, s.ids);
    // ids 非空时 inArray 一定有值;为稳妥仍在下面用 length 守卫（空集合跳过整类）。
    return s.extraGuard
      ? (and(inClause, s.extraGuard) as SQL)
      : (inClause as SQL);
  };

  // ── Phase 1：SELECT 逐类点数 + 摘要(dry-run / apply 都先做这步)───────────────
  let grandTotal = 0;
  const perSpecMatched: number[] = [];
  console.log(
    "\n──────── 将删的 canonical 残留(按类点数 + 摘要,逐类精确 id 匹配)────────",
  );
  for (const s of specs) {
    if (s.ids.length === 0) {
      perSpecMatched.push(0);
      console.log(`\n· ${s.label}\n    (无 id，跳过)`);
      continue;
    }
    // 选出 id + 可选摘要列做点数与摘要。
    const rows = (await db
      .select(
        s.summaryColumn
          ? { id: s.idColumn, summary: s.summaryColumn }
          : { id: s.idColumn },
      )
      .from(s.table)
      .where(whereFor(s))) as Array<{ id: string; summary?: unknown }>;

    perSpecMatched.push(rows.length);
    grandTotal += rows.length;

    console.log(`\n· ${s.label}`);
    console.log(`    候选 id 集合 ${s.ids.length} 个 → 库内命中 ${rows.length} 行`);
    const preview = rows.slice(0, 5);
    for (const r of preview) {
      const sm =
        r.summary === undefined || r.summary === null
          ? ""
          : ` — ${String(r.summary).slice(0, 40)}`;
      console.log(`      · ${r.id}${sm}`);
    }
    if (rows.length > preview.length) {
      console.log(`      … 及另外 ${rows.length - preview.length} 行`);
    }
  }

  console.log(
    `\n──────── 合计将删 ${grandTotal} 行(跨 ${specs.length} 类)────────`,
  );
  console.log(
    "白名单已保护:projects 全表 / knowledge dy-* / review_rules / rubric-canonical+rubricver / " +
      "AI 骨架 ai-model-*·ai-agent-* / users+sessions —— 本脚本均未触及。",
  );

  if (!apply) {
    console.log(
      "\n[DRY-RUN] 未删除任何行。核对以上确为 canonical 假数据后,加 `-- --apply` 真删(事务)。",
    );
    await dispose();
    return;
  }

  // ── Phase 2：--apply → 一个事务里逐类 DELETE(全成功 or 全回滚)──────────────
  if (grandTotal === 0) {
    console.log("\n[APPLY] 命中 0 行,无需删除。");
    await dispose();
    return;
  }
  console.log(`\n[APPLY] 开始事务删除 ${grandTotal} 行 …`);
  let deletedTotal = 0;
  await db.transaction(async (tx) => {
    for (let i = 0; i < specs.length; i++) {
      const s = specs[i]!;
      if (s.ids.length === 0 || perSpecMatched[i] === 0) continue;
      const res = await tx.delete(s.table).where(whereFor(s));
      // 实删行数:node-postgres 返回 { rowCount };pglite 返回 { affectedRows }。
      // 两 driver 形状不同,统一经 unknown 探测两字段;都拿不到则回退 Phase 1 点数。
      const raw = res as unknown as {
        rowCount?: number;
        affectedRows?: number;
      };
      const n =
        typeof raw.rowCount === "number"
          ? raw.rowCount
          : typeof raw.affectedRows === "number"
            ? raw.affectedRows
            : perSpecMatched[i]!;
      deletedTotal += n;
      console.log(`    · ${s.label} → 删 ${n} 行`);
    }
  });
  console.log(
    `\n[APPLY] 事务提交完成,实删 ${deletedTotal} 行(预期 ${grandTotal})。`,
  );
  await dispose();
}

main().catch((err) => {
  console.error("[purge-canonical-residue] 失败:", err);
  process.exitCode = 1;
});

// 类型出口给 tsc 用(避免 Db 未使用告警;脚本本身不导出运行时符号)。
export type { Db };
