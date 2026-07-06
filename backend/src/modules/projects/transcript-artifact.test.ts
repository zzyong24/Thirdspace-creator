import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createProjectRepository } from "./projects.repository";
import {
  createProjectsService,
  type ProjectsService,
} from "./projects.service";
import {
  createArtifactsService,
  createArtifactRepository,
  type ArtifactsService,
} from "../artifacts";
import {
  ensureTranscriptArtifact,
  extractTranscriptBody,
  type TranscriptArtifactPorts,
} from "./transcript-artifact";

// T-030-D3(SPEC §4.3 + §5.4)—— ensureTranscriptArtifact 的确定性单测:真 pglite +
// 真 projects/artifacts service 适配到 helper 端口(不碰用户真 PG、不读真 .md)。
// 覆盖:①绑定建 script artifact + contentData;②同 awemeId 幂等不重复建;③无对应
// imported 作品 → skipped 不抛;④frontmatter 正文解析。

const NOW = "2026-07-01T00:00:00.000Z";
const ctx: RequestContext = {
  userId: "user-zyongzhu",
  requestId: "req-1",
  source: "user",
};
const PLATFORM = "douyin";

function deterministicDeps() {
  const counters = new Map<string, number>();
  return {
    now: () => NOW,
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${n}`;
    },
  };
}

interface Wired {
  projectsService: ProjectsService;
  artifactsService: ArtifactsService;
  ports: TranscriptArtifactPorts;
  warnings: string[];
}

function wire(db: Db): Wired {
  const deps = deterministicDeps();
  const projectsRepo = createProjectRepository(db);
  const projectsService = createProjectsService(projectsRepo, deps);
  const artifactsService = createArtifactsService({ db, ...deps });
  const artifactsRepo = createArtifactRepository(db, {
    ...deps,
    userId: ctx.userId,
    accountId: ctx.accountId ?? null, // [T-136 切片 b]
  });
  const warnings: string[] = [];

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
    warn: (m) => warnings.push(m),
  };

  return { projectsService, artifactsService, ports, warnings };
}

let db: Db;

beforeEach(async () => {
  ({ db } = await createDb());
});

describe("ensureTranscriptArtifact — 绑定 imported 作品", () => {
  it("给一个 externalId=awemeX 的 imported 作品 + transcript → 建出 script artifact,contentData 含 transcript/source/awemeId", async () => {
    const { projectsService, artifactsService, ports } = wire(db);
    // 建一个 imported 作品(externalId = "aweme-x")。
    const imported = await projectsService.ensureImportedProject(ctx, {
      title: "AI 工作流四步法",
      platform: PLATFORM,
      externalId: "aweme-x",
    });

    const result = await ensureTranscriptArtifact(
      ctx,
      { awemeId: "aweme-x", transcript: "这是逐字稿正文", source: "transcribed" },
      ports,
    );

    expect(result.status).toBe("bound");
    if (result.status !== "bound") throw new Error("unreachable");
    expect(result.projectId).toBe(imported.projectId);
    expect(result.awemeId).toBe("aweme-x");

    // artifact 绑到该 imported 作品,type=script、stage=script。
    const artifacts = await artifactsService.listProjectArtifacts(
      ctx,
      imported.projectId,
    );
    expect(artifacts).toHaveLength(1);
    const artifact = artifacts[0]!;
    expect(artifact.id).toBe(result.artifactId);
    expect(artifact.artifactType).toBe("output_script");
    expect(artifact.stage).toBe("script");

    // 当前版本 content_data 含 transcript/source/awemeId(灌进 script 阶段的事实)。
    const versions = await artifactsService.listVersions(ctx, artifact.id);
    const current = versions.find((v) => v.id === artifact.currentVersionId)!;
    expect(current.contentData).toMatchObject({
      transcript: "这是逐字稿正文",
      source: "transcribed",
      awemeId: "aweme-x",
    });
    expect(current.contentText).toBe("这是逐字稿正文");
  });

  it("幂等:同 awemeId 再调一次 → 不重复建(跳过 already-exists)", async () => {
    const { projectsService, artifactsService, ports } = wire(db);
    const imported = await projectsService.ensureImportedProject(ctx, {
      title: "知识库不该只是文件夹",
      platform: PLATFORM,
      externalId: "aweme-y",
    });

    const first = await ensureTranscriptArtifact(
      ctx,
      { awemeId: "aweme-y", transcript: "第一次正文" },
      ports,
    );
    expect(first.status).toBe("bound");

    const second = await ensureTranscriptArtifact(
      ctx,
      { awemeId: "aweme-y", transcript: "第二次正文(不该覆盖/重复)" },
      ports,
    );
    expect(second.status).toBe("skipped");
    if (second.status !== "skipped") throw new Error("unreachable");
    expect(second.reason).toBe("already-exists");

    // 仍只有一个 script artifact(未重复建)。
    const artifacts = await artifactsService.listProjectArtifacts(
      ctx,
      imported.projectId,
    );
    const scripts = artifacts.filter((a) => a.artifactType === "output_script");
    expect(scripts).toHaveLength(1);
  });

  it("无对应 imported 作品(awemeId 不匹配任何作品)→ 跳过、不抛、返回 skipped(no-imported-project)+ 记 warn", async () => {
    const { projectsService, ports, warnings } = wire(db);
    // 建一个 externalId=aweme-x 的 imported 作品,但用一个不匹配的 awemeId 调 helper。
    await projectsService.ensureImportedProject(ctx, {
      title: "存在但不匹配",
      platform: PLATFORM,
      externalId: "aweme-x",
    });

    const result = await ensureTranscriptArtifact(
      ctx,
      { awemeId: "aweme-does-not-exist", transcript: "孤儿逐字稿" },
      ports,
    );

    expect(result.status).toBe("skipped");
    if (result.status !== "skipped") throw new Error("unreachable");
    expect(result.reason).toBe("no-imported-project");
    expect(result.awemeId).toBe("aweme-does-not-exist");
    // 记了 warn(不抛)。
    expect(warnings.some((w) => w.includes("aweme-does-not-exist"))).toBe(true);
  });
});

describe("extractTranscriptBody — frontmatter 解析(SPEC §5.4)", () => {
  it("有 `# 标题` + `- 元信息` + `---` → 抽出 `---` 之后的正文", () => {
    const raw = "# 我的标题\n- 作者:x\n- 时长:3:20\n---\n正文第一句。\n正文第二句。";
    expect(extractTranscriptBody(raw)).toBe("正文第一句。\n正文第二句。");
  });

  it("无 `---` → 去掉开头的 markdown 头(标题 + 列表元信息 + 空行),留正文", () => {
    const raw = "# 标题\n- 作者:x\n\n这是正文开头。\n下一行。";
    expect(extractTranscriptBody(raw)).toBe("这是正文开头。\n下一行。");
  });

  it("兼容 CRLF 换行 + 取第一个 `---` 之后(正文内含 `---` 不受影响)", () => {
    const raw = "# 标题\r\n- 作者:x\r\n---\r\n第一段。\r\n---\r\n第二段。";
    expect(extractTranscriptBody(raw)).toBe("第一段。\n---\n第二段。");
  });
});
