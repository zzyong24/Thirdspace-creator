// 一次性回填:把用户已提取好的抖音逐字稿(默认「月明水清深」~30 条)按 aweme_id 绑到
// 已导入的 imported 作品,灌进 script 阶段。仿 backend/scripts/migrate.ts 风格:tsx 直接跑,
// 连真 Postgres via DATABASE_URL(默认本地 docker-compose db)。**只读逐字稿源目录**;
// 对 DB 只做 ensureTranscriptArtifact 的幂等写(重复跑不会重复建)。
//
// 用法:
//   pnpm --filter @creatoros/backend backfill:transcripts [-- <蒸馏目录名> <userId>]
//   或 tsx backend/scripts/backfill-transcripts.ts [<蒸馏目录名>] [<userId>]
// 参数:
//   argv[0] 蒸馏目录名(默认 "月明水清深");在 <VAULT>/01-收件箱/蒸馏/<目录名>/ 下找
//           _transcribed.json 索引。可用 CREATOROS_VAULT 覆盖 vault 根(默认
//           /Users/zyongzhu/ThirdSpace)。
//   argv[1] userId(默认 "user-zyongzhu",即 canonical 用户;imported 作品的 owner)。
//
// 数据源形状(SPEC §5.4):
//   索引 _transcribed.json:{ "transcribed": { "<aweme_id>": { "status":"ok", "path":"...", "chars":N } } }
//   正文 <path>(相对索引目录或绝对):<aweme_id>/<aweme_id>.md,frontmatter 头 + `---` + 正文。
//   取 `---` 之后的正文作 transcript(extractTranscriptBody 负责)。

import { readFileSync } from "node:fs";
import { isAbsolute, join, resolve, dirname } from "node:path";
import type { RequestContext } from "@creatoros/contract";
import { createRuntimeDb } from "../src/db";
import {
  createProjectRepository,
  ensureTranscriptArtifact,
  extractTranscriptBody,
  type TranscriptArtifactPorts,
} from "../src/modules/projects";
import {
  createArtifactsService,
  createArtifactRepository,
} from "../src/modules/artifacts";

const VAULT_ROOT = process.env.CREATOROS_VAULT ?? "/Users/zyongzhu/ThirdSpace";
const DISTILL_DIR = process.argv[2] ?? "月明水清深";
const USER_ID = process.argv[3] ?? "user-zyongzhu";
const PLATFORM = "douyin";

const url =
  process.env.DATABASE_URL ??
  "postgresql://creatoros:creatoros@localhost:5432/creatoros";

interface TranscribedEntry {
  status?: string;
  path?: string;
  chars?: number;
}
interface TranscribedIndex {
  transcribed?: Record<string, TranscribedEntry>;
}

function readIndex(indexPath: string): TranscribedIndex {
  const raw = readFileSync(indexPath, "utf8");
  return JSON.parse(raw) as TranscribedIndex;
}

// 把索引里的 path(可能相对索引所在目录、可能绝对)解析成绝对文件路径。
function resolveMdPath(entryPath: string, indexDir: string): string {
  return isAbsolute(entryPath) ? entryPath : resolve(indexDir, entryPath);
}

async function main(): Promise<void> {
  const indexPath = join(
    VAULT_ROOT,
    "01-收件箱",
    "蒸馏",
    DISTILL_DIR,
    "_transcribed.json",
  );
  const indexDir = dirname(indexPath);
  const masked = url.replace(/:\/\/([^:]+):[^@]+@/, "://$1:***@");
  console.log(
    `[backfill-transcripts] vault=${VAULT_ROOT} 目录=${DISTILL_DIR} userId=${USER_ID} db=${masked}`,
  );

  const index = readIndex(indexPath);
  const transcribed = index.transcribed ?? {};
  const awemeIds = Object.keys(transcribed);
  console.log(`[backfill-transcripts] 索引载入 ${awemeIds.length} 条逐字稿`);

  const { db, pool } = await createRuntimeDb({ connectionString: url });

  // 确定性 deps(单进程、递增 id / 单一时钟)。回填一次性跑,不需要真随机。
  const counters = new Map<string, number>();
  const deps = {
    now: () => new Date().toISOString(),
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-bf-${n}`;
    },
  };

  const projectsRepo = createProjectRepository(db);
  const artifactsService = createArtifactsService({ db, ...deps });
  // 脚本层可直连 repo 取版本行的 content_data(service 不暴露 getVersion;跨模块运行时
  // 调用方才受"只走 service"约束,一次性回填脚本不受此限)。user-baked repo。
  const artifactsRepo = createArtifactRepository(db, { ...deps, userId: USER_ID });

  const ctx: RequestContext = {
    userId: USER_ID,
    requestId: "backfill-transcripts",
    source: "user",
  };

  // 把真 service/repo 适配到 helper 的窄端口(同 composition root 的接法)。
  const ports: TranscriptArtifactPorts = {
    findImportedProjectByAwemeId: async (c, awemeId) => {
      const project = await projectsRepo.findImportedByRef(c, {
        platform: PLATFORM,
        externalId: awemeId,
      });
      return project?.id ?? null;
    },
    listProjectArtifacts: async (c, projectId) => {
      const rows = await artifactsService.listProjectArtifacts(c, projectId);
      return rows.map((r) => ({
        id: r.id,
        artifactType: r.artifactType,
        currentVersionId: r.currentVersionId,
      }));
    },
    getVersionContentData: async (_c, versionId) => {
      const version = await artifactsRepo.getVersion(versionId);
      return (version.contentData ?? null) as Record<string, unknown> | null;
    },
    createScriptArtifact: async (c, input) =>
      artifactsService.createArtifact(c, input),
    createArtifactVersion: async (c, artifactId, input) =>
      artifactsService.createVersion(c, artifactId, input),
    warn: (m) => console.warn(m),
  };

  let bound = 0;
  let skipped = 0;
  const skippedDetail: Record<string, number> = {};
  const bump = (key: string) => {
    skippedDetail[key] = (skippedDetail[key] ?? 0) + 1;
  };

  for (const awemeId of awemeIds) {
    const entry = transcribed[awemeId]!;
    if (entry.status && entry.status !== "ok") {
      skipped++;
      bump("status-not-ok");
      continue;
    }
    if (!entry.path) {
      skipped++;
      bump("no-path");
      console.warn(`[backfill-transcripts] 跳过 ${awemeId}:索引条目缺 path`);
      continue;
    }
    let body: string;
    try {
      const mdPath = resolveMdPath(entry.path, indexDir);
      const raw = readFileSync(mdPath, "utf8");
      body = extractTranscriptBody(raw);
    } catch (err) {
      skipped++;
      bump("read-md-failed");
      console.warn(
        `[backfill-transcripts] 跳过 ${awemeId}:读取正文失败 ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      continue;
    }
    if (body.trim() === "") {
      skipped++;
      bump("empty-body");
      console.warn(`[backfill-transcripts] 跳过 ${awemeId}:正文为空`);
      continue;
    }

    const result = await ensureTranscriptArtifact(
      ctx,
      { awemeId, transcript: body, source: "transcribed" },
      ports,
    );
    if (result.status === "bound") {
      bound++;
    } else {
      skipped++;
      bump(result.reason);
    }
  }

  console.log(
    `[backfill-transcripts] 完成 —— 绑定 ${bound} / 跳过 ${skipped}(已存在或无对应作品)`,
  );
  if (Object.keys(skippedDetail).length > 0) {
    console.log(
      `[backfill-transcripts] 跳过明细:${JSON.stringify(skippedDetail)}`,
    );
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[backfill-transcripts] 失败:", err);
  process.exitCode = 1;
});
