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
//   2. restoreVersion re-points to an existing immutable version and never
//      manufactures a duplicate revision; repeating it is idempotent.
//   3. createVersion with createdByType 'ai' + aiTaskId records candidate
//      provenance (the AI-adopt seam).
//   4. createRelation rejects a target the ctx.userId does not own (OwnershipError).
//   5. replaceStructuredContent refuses a version id that is not the artifact's
//      current one (immutable-plan guard, ConflictError).
//   6. applyScriptPatch re-reads the current immutable version and appends one
//      new version whose only changed section is the explicitly anchored target.

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

  it("restoreVersion points currentVersionId at the selected immutable version without appending", async () => {
    const artifact = await seedArtifact(ctxA);
    const v1Id = artifact.currentVersionId!;
    await service.createVersion(ctxA, artifact.id, {
      contentText: "第二版",
      changeSummary: "edit",
    });

    const restored = await service.restoreVersion(ctxA, artifact.id, v1Id);
    expect(restored.currentVersionId).toBe(v1Id);

    const versions = await service.listVersions(ctxA, artifact.id);
    expect(versions).toHaveLength(2);
  });

  it("restoreVersion does not append another version when the target snapshot is already current", async () => {
    const artifact = await seedArtifact(ctxA);
    const v1Id = artifact.currentVersionId!;
    await service.createVersion(ctxA, artifact.id, {
      contentText: "第二版",
      changeSummary: "edit",
    });

    const firstRestore = await service.restoreVersion(ctxA, artifact.id, v1Id);
    const secondRestore = await service.restoreVersion(ctxA, artifact.id, v1Id);

    expect(secondRestore.currentVersionId).toBe(firstRestore.currentVersionId);
    expect(await service.listVersions(ctxA, artifact.id)).toHaveLength(2);
  });

  it("[T-833] 局部改稿撤销发现后续版本时拒绝覆盖", async () => {
    const artifact = await seedArtifact(ctxA);
    const sourceId = artifact.currentVersionId!;
    const patchVersion = await service.createVersion(ctxA, artifact.id, {
      contentText: "局部改稿版",
      changeSummary: "局部改稿",
    });
    await service.createVersion(ctxA, artifact.id, {
      contentText: "后续用户编辑",
      changeSummary: "继续修改",
    });

    await expect(
      service.restoreVersion(
        ctxA,
        artifact.id,
        sourceId,
        patchVersion.id,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await service.getArtifact(ctxA, artifact.id)).currentVersionId).not.toBe(
      sourceId,
    );
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

  it("applyScriptPatch changes only the anchored section and appends one immutable version", async () => {
    const artifact = await seedArtifact(ctxA);
    const source = await service.createVersion(ctxA, artifact.id, {
      contentText: "原文一\n\n原文二",
      contentData: {
        html: "<p>过期渲染缓存</p>",
        sections: [
          { id: "section-1", heading: "第一段", body: "原文一", visual: "画面一" },
          { id: "section-2", heading: "第二段", body: "原文二", visual: "画面二" },
        ],
      },
      changeSummary: "建立结构化稿面",
    });
    const beforeVersions = await service.listVersions(ctxA, artifact.id);

    const patched = await service.applyScriptPatch(ctxA, artifact.id, {
      expectedVersionId: source.id,
      sectionId: "section-2",
      expectedOriginalText: "原文二",
      replacementText: "只改后的原文二",
      changeSummary: "局部改写第二段",
    });

    expect(patched.versionNumber).toBe(source.versionNumber + 1);
    const patchedData = patched.contentData as {
      html?: unknown;
      sections?: unknown[];
    };
    expect(patchedData.html).toBeUndefined();
    expect(patchedData.sections).toEqual([
      { id: "section-1", heading: "第一段", body: "原文一", visual: "画面一" },
      { id: "section-2", heading: "第二段", body: "只改后的原文二", visual: "画面二" },
    ]);
    expect(patched.contentText).toContain("原文一");
    expect(patched.contentText).toContain("只改后的原文二");

    const afterVersions = await service.listVersions(ctxA, artifact.id);
    expect(afterVersions).toHaveLength(beforeVersions.length + 1);
    expect(afterVersions.find((row) => row.id === source.id)).toEqual(source);
    expect((await service.getArtifact(ctxA, artifact.id)).currentVersionId).toBe(
      patched.id,
    );
  });

  it("[T-833] 同一旧稿生成的多张候选可按未变化段落顺序全部采纳", async () => {
    const artifact = await seedArtifact(ctxA);
    const source = await service.createVersion(ctxA, artifact.id, {
      contentText: "原文一\n\n原文二",
      contentData: {
        sections: [
          { id: "section-1", body: "原文一" },
          { id: "section-2", body: "原文二" },
        ],
      },
      changeSummary: "建立两段稿面",
    });

    const first = await service.applyScriptPatch(ctxA, artifact.id, {
      expectedVersionId: source.id,
      sectionId: "section-1",
      expectedOriginalText: "原文一",
      replacementText: "修改一",
    });
    const second = await service.applyScriptPatch(ctxA, artifact.id, {
      expectedVersionId: source.id,
      sectionId: "section-2",
      expectedOriginalText: "原文二",
      replacementText: "修改二",
    });

    expect(first.id).not.toBe(second.id);
    expect(first.previousVersionId).toBe(source.id);
    expect(second.previousVersionId).toBe(first.id);
    expect((second.contentData as { sections: unknown[] }).sections).toEqual([
      { id: "section-1", body: "修改一" },
      { id: "section-2", body: "修改二" },
    ]);
    expect(second.contentText).toContain("修改一");
    expect(second.contentText).toContain("修改二");
  });

  it("[T-833] 旧候选重放时保留最新稿的其他改动", async () => {
    const artifact = await seedArtifact(ctxA);
    const source = await service.createVersion(ctxA, artifact.id, {
      contentText: "原文一\n\n原文二",
      contentData: {
        sections: [
          { id: "section-1", body: "原文一" },
          { id: "section-2", body: "原文二" },
        ],
      },
      changeSummary: "建立两段稿面",
    });
    await service.createVersion(ctxA, artifact.id, {
      contentText: "用户手改一\n\n原文二",
      contentData: {
        sections: [
          { id: "section-1", body: "用户手改一" },
          { id: "section-2", body: "原文二" },
        ],
      },
      changeSummary: "用户修改第一段",
    });

    const patched = await service.applyScriptPatch(ctxA, artifact.id, {
      expectedVersionId: source.id,
      sectionId: "section-2",
      expectedOriginalText: "原文二",
      replacementText: "候选修改二",
    });

    expect((patched.contentData as { sections: unknown[] }).sections).toEqual([
      { id: "section-1", body: "用户手改一" },
      { id: "section-2", body: "候选修改二" },
    ]);
  });

  it("[T-732] createVersion 为脚本的无 ID 段落持久化稳定锚点", async () => {
    const artifact = await seedArtifact(ctxA);

    const created = await service.createVersion(ctxA, artifact.id, {
      contentText: "第一段\n\n第二段",
      contentData: {
        sections: [
          { heading: "第一段", body: "正文一" },
          { heading: "第二段", body: "正文二" },
        ],
      },
      changeSummary: "AI 整稿",
      createdByType: "ai",
    });

    const createdData = created.contentData as { sections?: unknown[] };
    expect(createdData.sections).toEqual([
      { id: "script-saved-0", heading: "第一段", body: "正文一" },
      { id: "script-saved-1", heading: "第二段", body: "正文二" },
    ]);
  });

  it("[T-732] 存量无 ID 脚本可按兼容锚点只改目标段，并在新版本中自愈 ID", async () => {
    const artifact = await seedArtifact(ctxA);
    let legacySeq = 0;
    const legacyRepo = createArtifactRepository(db, {
      userId: ctxA.userId,
      accountId: "acct-a",
      now: () => NOW,
      nextId: (prefix) => `${prefix}-legacy-${++legacySeq}`,
    });
    const legacy = await legacyRepo.createVersion(artifact.id, {
      contentText: "第一段\n\n第二段",
      contentData: {
        sections: [
          { heading: "第一段", body: "正文一" },
          { heading: "第二段", body: "正文二" },
        ],
      },
      changeSummary: "历史 AI 整稿",
      createdByType: "ai",
    });

    const patched = await service.applyScriptPatch(ctxA, artifact.id, {
      expectedVersionId: legacy.id,
      sectionId: "script-saved-1",
      expectedOriginalText: "正文二",
      replacementText: "只改后的正文二",
    });

    const healedData = patched.contentData as { sections?: unknown[] };
    expect(healedData.sections).toEqual([
      { id: "script-saved-0", heading: "第一段", body: "正文一" },
      {
        id: "script-saved-1",
        heading: "第二段",
        body: "只改后的正文二",
      },
    ]);
  });

  it("applyScriptPatch refuses a stale version anchor", async () => {
    const artifact = await seedArtifact(ctxA);
    const source = await service.createVersion(ctxA, artifact.id, {
      contentText: "原文",
      contentData: { sections: [{ id: "section-1", body: "原文" }] },
      changeSummary: "建立稿面",
    });
    await service.createVersion(ctxA, artifact.id, {
      contentText: "更新后的整稿",
      contentData: { sections: [{ id: "section-1", body: "更新后的整稿" }] },
      changeSummary: "并发更新",
    });

    await expect(
      service.applyScriptPatch(ctxA, artifact.id, {
        expectedVersionId: source.id,
        sectionId: "section-1",
        expectedOriginalText: "原文",
        replacementText: "局部改写",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("applyScriptPatch refuses an original-text mismatch", async () => {
    const artifact = await seedArtifact(ctxA);
    const source = await service.createVersion(ctxA, artifact.id, {
      contentText: "原文",
      contentData: { sections: [{ id: "section-1", body: "原文" }] },
      changeSummary: "建立稿面",
    });

    await expect(
      service.applyScriptPatch(ctxA, artifact.id, {
        expectedVersionId: source.id,
        sectionId: "section-1",
        expectedOriginalText: "浏览器里的旧文本",
        replacementText: "局部改写",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("[T-812/T-819] applyScriptPatch 拒绝 no-op，不新增版本", async () => {
    const artifact = await seedArtifact(ctxA);
    const source = await service.createVersion(ctxA, artifact.id, {
      contentText: "原文保持不变",
      contentData: {
        sections: [{ id: "section-1", body: "原文保持不变" }],
      },
      changeSummary: "建立稿面",
    });
    const before = await service.listVersions(ctxA, artifact.id);
    await expect(
      service.applyScriptPatch(ctxA, artifact.id, {
        expectedVersionId: source.id,
        sectionId: "section-1",
        expectedOriginalText: "原文保持不变",
        replacementText: "  原文保持不变  ",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await service.listVersions(ctxA, artifact.id)).toHaveLength(
      before.length,
    );
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
