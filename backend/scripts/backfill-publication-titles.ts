// 一次性回填(T-034):把「导入的抖音作品」(external_id=aweme_id、故意无 revision)的**真实标题**
// 落到一条 revision 上并置为 current —— 这样 publishing.getRecentPublicationsWithTitle 读到的
// title 从空变真,创作者后台明细导出(self.detail)的按-title 匹配才能命中该作品、指标才落库。
//
// 断裂背景(诊断 T-033a / T-034):DB 里 douyin 作品分裂成两组互斥集合:
//   ① 有 external_id 的(采集导入)→ 其可读 title 空(标题挂在 content_output/project,
//      createImportedPublication 故意不建 revision);
//   ② 有 title 的(seed 数据 dy-pub-*)→ 无 external_id。
// 明细落库链按归一 title 匹配 publication(xlsx 无 aweme_id),又要 external_id → 两组对不上 →
// 0 匹配 → metric_snapshots 恒 0。本脚本把①组的真实标题(取 content_output.title,即导入时
// 落的完整 caption)回填成一条 current revision,让①组既有 external_id 又有可读 title。
//
// **只回填①组(有 external_id 且当前 revision title 为空)**;不碰 seed 组(dy-pub-*,无
// external_id)。幂等:已有非空 current revision title 的 publication 跳过(重复跑不重复建)。
//
// 用法:
//   pnpm --filter @creatoros/backend backfill:pub-titles [-- <userId>]
//   或 tsx backend/scripts/backfill-publication-titles.ts [<userId>]
// 参数:
//   argv[0] userId(默认 "user-zyongzhu",即 canonical 用户;imported 作品的 owner)。

import type { RequestContext } from "@creatoros/contract";
import { createRuntimeDb } from "../src/db";
import { createProjectRepository } from "../src/modules/projects";
import { createPublishingRepository } from "../src/modules/publishing";

const USER_ID = process.argv[2] ?? "user-zyongzhu";
const PLATFORM = "douyin";

const url =
  process.env.DATABASE_URL ??
  "postgresql://creatoros:creatoros@localhost:5432/creatoros";

async function main(): Promise<void> {
  const masked = url.replace(/:\/\/([^:]+):[^@]+@/, "://$1:***@");
  console.log(
    `[backfill-pub-titles] userId=${USER_ID} platform=${PLATFORM} db=${masked}`,
  );

  const { db, pool } = await createRuntimeDb({ connectionString: url });

  // 确定性 deps(单进程、递增 id / 单一时钟)——一次性回填不需要真随机。
  const counters = new Map<string, number>();
  const deps = {
    now: () => new Date().toISOString(),
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-bft-${n}`;
    },
    userId: USER_ID,
  };

  const ctx: RequestContext = {
    userId: USER_ID,
    requestId: "backfill-pub-titles",
    source: "user",
  };

  const pubRepo = createPublishingRepository(db, deps);
  const projectsRepo = createProjectRepository(db);

  // 拉全量 publications(user-scoped),只处理 douyin + 有 external_id 的导入作品。
  const pubs = await pubRepo.listPublicationsForUser({ limit: 5000, offset: 0 });
  const targets = pubs.filter(
    (p) =>
      p.platform === PLATFORM &&
      typeof p.externalId === "string" &&
      p.externalId.trim() !== "",
  );
  console.log(
    `[backfill-pub-titles] douyin 导入作品(有 external_id)共 ${targets.length} 条`,
  );

  let filled = 0;
  let skippedHasTitle = 0;
  let skippedNoOutputTitle = 0;
  let failed = 0;

  for (const p of targets) {
    // 已有非空 current revision title → 幂等跳过。
    if (p.currentRevisionId) {
      try {
        const cur = await pubRepo.getCurrentRevision(p.id);
        if (cur && (cur.title ?? "").trim() !== "") {
          skippedHasTitle++;
          continue;
        }
      } catch {
        // 取当前 revision 失败(数据异常)→ 落到下面重建一条。
      }
    }

    // 真实标题来源:content_output.title(导入时把完整 caption 落在这里)。
    let title = "";
    try {
      const out = await projectsRepo.getOutput(ctx, p.contentOutputId);
      title = (out.title ?? "").trim();
    } catch (err) {
      failed++;
      console.warn(
        `[backfill-pub-titles] 跳过 ${p.id}(${p.externalId}):读作品标题失败 ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      continue;
    }
    if (title === "") {
      skippedNoOutputTitle++;
      console.warn(
        `[backfill-pub-titles] 跳过 ${p.id}(${p.externalId}):content_output 标题为空`,
      );
      continue;
    }

    try {
      const rev = await pubRepo.createRevision(p.id, {
        title,
        description: "",
      });
      await pubRepo.setCurrentRevision(p.id, rev.id);
      filled++;
    } catch (err) {
      failed++;
      console.warn(
        `[backfill-pub-titles] 失败 ${p.id}(${p.externalId}):建 revision ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  console.log(
    `[backfill-pub-titles] 完成 —— 回填 ${filled} / 已有标题跳过 ${skippedHasTitle} / 作品标题空跳过 ${skippedNoOutputTitle} / 失败 ${failed}`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error("[backfill-pub-titles] 失败:", err);
  process.exitCode = 1;
});
