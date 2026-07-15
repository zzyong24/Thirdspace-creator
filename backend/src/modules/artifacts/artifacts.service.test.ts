import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createArtifactRepository } from "./artifacts.repository";
import {
  createArtifactsService,
  type ArtifactsService,
} from "./artifacts.service";
import { OwnershipError, ConflictError } from "./artifacts.errors";

// Step 3 — service unit tests over a real pglite repo. The service threads
// ctx.userId into a user-scoped repo via repoFor(ctx) and enforces the append-only
// version invariants (data-model §9 rules 6–7; SPEC §18):
//   1. createVersion appends + re-points; the prior version row is byte-identical.
//   2. restoreVersion creates a NEW version (max+1), never re-points to the old id.
//   3. createVersion with createdByType 'ai' + aiTaskId records candidate
//      provenance (the AI-adopt seam).
//   4. createRelation rejects a target the ctx.userId does not own (OwnershipError).
//   5. replaceStructuredContent refuses a version id that is not the artifact's
//      current one (immutable-plan guard, ConflictError).

const NOW = "2026-06-21T03:00:00.000Z";
// [T-332 S2] strict 门下 ctx 必带号。
const ctxA: RequestContext = {
  userId: "user-a",
  requestId: "req-a",
  source: "user",
  accountId: "acct-a",
};
const ctxB: RequestContext = {
  userId: "user-b",
  requestId: "req-b",
  source: "user",
  accountId: "acct-b",
};

function makeService(db: Db): ArtifactsService {
  let seq = 0;
  return createArtifactsService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
  });
}

let db: Db;
let service: ArtifactsService;

beforeEach(async () => {
  ({ db } = await createDb());
  service = makeService(db);
});

async function seedArtifact(ctx: RequestContext) {
  return service.createArtifact(ctx, {
    projectId: "project-1",
    title: "脚本",
    artifactType: "master_script",
    stage: "script",
  });
}

describe("artifacts.service — append-only versioning", () => {
  it("createVersion appends + re-points; the prior version row is unchanged", async () => {
    const artifact = await seedArtifact(ctxA);
    const beforeVersions = await service.listVersions(ctxA, artifact.id);
    const v1 = beforeVersions[0]!;

    const v2 = await service.createVersion(ctxA, artifact.id, {
      contentText: "第二版",
      changeSummary: "edit",
    });
    expect(v2.versionNumber).toBe(2);

    const reread = await service.getArtifact(ctxA, artifact.id);
    expect(reread.currentVersionId).toBe(v2.id);

    // The prior version row is byte-identical after the append.
    const afterVersions = await service.listVersions(ctxA, artifact.id);
    expect(afterVersions[0]).toEqual(v1);
  });

  it("restoreVersion creates a NEW version (max+1), not a re-point to the old id", async () => {
    const artifact = await seedArtifact(ctxA);
    const v1Id = artifact.currentVersionId!;
    await service.createVersion(ctxA, artifact.id, {
      contentText: "第二版",
      changeSummary: "edit",
    });

    const restored = await service.restoreVersion(ctxA, artifact.id, v1Id);
    expect(restored.currentVersionId).not.toBe(v1Id);

    const versions = await service.listVersions(ctxA, artifact.id);
    expect(versions).toHaveLength(3);
    expect(versions[2]!.versionNumber).toBe(3);
  });

  it("createVersion with createdByType 'ai' + aiTaskId records candidate provenance", async () => {
    const artifact = await seedArtifact(ctxA);
    const v = await service.createVersion(ctxA, artifact.id, {
      contentText: "AI 候选",
      changeSummary: "ai draft",
      createdByType: "ai",
      aiTaskId: "ai-task-9",
    });
    expect(v.createdByType).toBe("ai");
    expect(v.aiTaskId).toBe("ai-task-9");

    // The candidate is promoted to current (AI-adopt path, SPEC §18).
    const reread = await service.getArtifact(ctxA, artifact.id);
    expect(reread.currentVersionId).toBe(v.id);
  });
});

describe("artifacts.service — ownership", () => {
  it("getArtifact for another user's artifact throws OwnershipError", async () => {
    const owned = await seedArtifact(ctxB);
    await expect(service.getArtifact(ctxA, owned.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });

  it("createRelation rejects a target the ctx.userId does not own", async () => {
    const a = await seedArtifact(ctxA);
    const bTarget = await seedArtifact(ctxB);
    await expect(
      service.createRelation(ctxA, a.id, {
        targetArtifactId: bTarget.id,
        relationType: "references",
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });
});

describe("artifacts.service — structured-content guard", () => {
  it("replaceStructuredContent runs against the current version", async () => {
    const artifact = await seedArtifact(ctxA);
    await expect(
      service.replaceStructuredContent(ctxA, artifact.id, artifact.currentVersionId!, {
        scriptSections: [
          { sectionType: "hook", title: "钩子", content: "...", position: 0 },
        ],
      }),
    ).resolves.toBeUndefined();
  });

  it("replaceStructuredContent refuses a stale (non-current) version id (ConflictError)", async () => {
    const artifact = await seedArtifact(ctxA);
    const staleVersionId = artifact.currentVersionId!;
    // Mint a new current version → the old id is now stale.
    await service.createVersion(ctxA, artifact.id, {
      contentText: "第二版",
      changeSummary: "edit",
    });
    await expect(
      service.replaceStructuredContent(ctxA, artifact.id, staleVersionId, {
        scriptSections: [
          { sectionType: "hook", title: "钩子", content: "...", position: 0 },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

// [T-183] 改稿 delta 捕捉埋点。仅当「前一版 AI 产出 → 新版用户手改 + 脚本 artifact」时,
// 调 recordEditDelta seam(before=前版正文, after=新版正文);其余组合不误触。
describe("artifacts.service — 改稿 delta 捕捉埋点 (recordEditDelta seam)", () => {
  type Call = {
    projectId: string;
    artifactId: string;
    before: string;
    after: string;
  };

  function makeServiceWithSpy(db: Db): {
    service: ArtifactsService;
    calls: Call[];
  } {
    let seq = 0;
    const calls: Call[] = [];
    const service = createArtifactsService({
      db,
      now: () => NOW,
      nextId: (prefix: string) => `${prefix}-${++seq}`,
      recordEditDelta: async (_ctx, input) => {
        calls.push(input as Call);
      },
    });
    return { service, calls };
  }

  async function seedScript(svc: ArtifactsService, ctx: RequestContext) {
    return svc.createArtifact(ctx, {
      projectId: "project-1",
      title: "脚本",
      artifactType: "output_script",
      stage: "script",
    });
  }

  it("AI 版 → 用户改版 (脚本) → 触发一条 delta,before/after 正确", async () => {
    const { db } = await createDb();
    const { service: svc, calls } = makeServiceWithSpy(db);
    const artifact = await seedScript(svc, ctxA);
    // 前一版 = AI 产出。
    await svc.createVersion(ctxA, artifact.id, {
      contentText: "AI 产出的脚本正文",
      createdByType: "ai",
      aiTaskId: "task-1",
    });
    expect(calls).toHaveLength(0); // AI 落版本本身不触发(前版是 user 初稿)。
    // 新版 = 用户手改(transport 默认 createdByType 'user',这里省略)。
    await svc.createVersion(ctxA, artifact.id, { contentText: "用户改后的正文" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.before).toBe("AI 产出的脚本正文");
    expect(calls[0]!.after).toBe("用户改后的正文");
    expect(calls[0]!.projectId).toBe("project-1");
    expect(calls[0]!.artifactId).toBe(artifact.id);
  });

  it("纯用户版 → 用户版 → 不触发(前版非 AI)", async () => {
    const { db } = await createDb();
    const { service: svc, calls } = makeServiceWithSpy(db);
    const artifact = await seedScript(svc, ctxA);
    await svc.createVersion(ctxA, artifact.id, { contentText: "用户稿 A" });
    await svc.createVersion(ctxA, artifact.id, { contentText: "用户稿 B" });
    expect(calls).toHaveLength(0);
  });

  it("非脚本 artifact 即使 AI→用户 也不触发(埋点限脚本改稿)", async () => {
    const { db } = await createDb();
    const { service: svc, calls } = makeServiceWithSpy(db);
    const artifact = await svc.createArtifact(ctxA, {
      projectId: "project-1",
      title: "选题树",
      artifactType: "thesis_tree",
      stage: "planning",
    });
    await svc.createVersion(ctxA, artifact.id, {
      contentText: "AI 选题",
      createdByType: "ai",
    });
    await svc.createVersion(ctxA, artifact.id, { contentText: "用户改选题" });
    expect(calls).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// [T-332 S2] 账号全域隔离:未选号引导态 + 双号 strict 隔离(ISO-02/08)
// ─────────────────────────────────────────────────────────────────────────────

import { AccountRequiredError } from "@creatoros/backend";

describe("[T-332 S2] artifacts 按号隔离:未选号禁读写 + 双号零交叉", () => {
  const ctxNoAccount: RequestContext = {
    userId: "user-a",
    requestId: "req-none",
    source: "user",
  };
  const ctxAcct1: RequestContext = {
    userId: "user-a",
    requestId: "req-a1",
    source: "user",
    accountId: "acct-1",
  };
  const ctxAcct2: RequestContext = {
    userId: "user-a",
    requestId: "req-a2",
    source: "user",
    accountId: "acct-2",
  };

  it("未选号 ctx:创建/读取入口全部 AccountRequiredError(SPEC §4.2 引导态)", async () => {
    await expect(seedArtifact(ctxNoAccount)).rejects.toBeInstanceOf(
      AccountRequiredError,
    );
    await expect(
      service.listProjectArtifacts(ctxNoAccount, "project-1"),
    ).rejects.toBeInstanceOf(AccountRequiredError);
    await expect(
      service.getArtifact(ctxNoAccount, "artifact-x"),
    ).rejects.toBeInstanceOf(AccountRequiredError);
  });

  it("双号隔离:同项目下各建稿,list 零交叉,by-id 跨号 404,版本链承父锚", async () => {
    const a1 = await service.createArtifact(ctxAcct1, {
      projectId: "proj-shared",
      title: "号1稿",
      artifactType: "master_script",
      stage: "script",
    });
    const a2 = await service.createArtifact(ctxAcct2, {
      projectId: "proj-shared",
      title: "号2稿",
      artifactType: "master_script",
      stage: "script",
    });
    expect(
      (await service.listProjectArtifacts(ctxAcct1, "proj-shared")).map((x) => x.id),
    ).toEqual([a1.id]);
    expect(
      (await service.listProjectArtifacts(ctxAcct2, "proj-shared")).map((x) => x.id),
    ).toEqual([a2.id]);
    // §4.5 by-id 门:跨号读与未知 id 同语义。
    await expect(service.getArtifact(ctxAcct2, a1.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    // 子表(versions)父锚继承:跨号 listVersions 同样 404。
    await expect(service.listVersions(ctxAcct2, a1.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    // 跨号 createVersion(写路径)同样被父锚门挡住。
    await expect(
      service.createVersion(ctxAcct2, a1.id, { contentText: "越号改稿" }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });
});
