import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createPositioningService,
  type PositioningProjectsPort,
  type PositioningService,
} from "./positioning.service";
import {
  ProfileRequiredError,
  GateSubjectError,
  StatementValidationError,
} from "./positioning.errors";

// Positioning service test (Task 3) — fake now/nextId, pglite db, stubbed
// ProjectsPort. Covers: upsertProfile idempotency; append-only version chain (v2
// leaves v1 byte-identical; the service exposes NO update/delete); 3-keyword guard;
// ProfileRequiredError; deterministic advisory gate (same input → same score, twice;
// non-mutating); AI-formalize tagging (created_by_type:"ai" + ai_task_id, no
// parallel candidate machine); page DTO empty-state. Deterministic clock/ids (no
// Date.now / Math.random).

const NOW = "2026-06-21T00:00:00.000Z";
const ctx: RequestContext = { userId: "user-a", requestId: "r1", source: "user", accountId: "acct-a" }; // [T-332 S2] strict 门下 ctx 必带号

function makeProjectsPort(
  subject: { title: string; brief: string } = { title: "AI 论文精读", brief: "把最新论文做成代码" },
): PositioningProjectsPort & { getProjectSubject: ReturnType<typeof vi.fn> } {
  return {
    getProjectSubject: vi.fn(async () => subject),
  };
}

function makeService(
  db: Db,
  projects: PositioningProjectsPort,
  tag = "a",
): PositioningService {
  let seq = 0;
  return createPositioningService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
    projects,
  });
}

const PROFILE_INPUT = {
  persona: "硬核科普",
  field: "AI 工程",
  audience: "一线开发者",
  differentiation: "论文到代码",
  capabilities: ["拆解", "演示"],
};

describe("positioning service", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("upsertProfile inserts then updates the same row (one profile per user)", async () => {
    const service = makeService(db, makeProjectsPort());
    const first = await service.upsertProfile(ctx, PROFILE_INPUT);
    expect(first.field).toBe("AI 工程");
    const second = await service.upsertProfile(ctx, {
      ...PROFILE_INPUT,
      field: "AI 应用",
    });
    expect(second.id).toBe(first.id); // same row, no duplicate
    expect(second.field).toBe("AI 应用");
    const center = await service.getPositioningCenter(ctx);
    expect(center.history).toHaveLength(0);
    expect(center.profile!.id).toBe(first.id);
  });

  it("[T-521] 旧动态 statusNote 清理按账号隔离、幂等，并只审计 hash 不泄露原文", async () => {
    const audit = vi.fn(async () => undefined);
    let seq = 0;
    const service = createPositioningService({
      db,
      now: () => NOW,
      nextId: (prefix) => `${prefix}-cleanup-${++seq}`,
      projects: makeProjectsPort(),
      auditLegacyStatusNoteCleanup: audit,
    });
    const ctxAcc1: RequestContext = { ...ctx, accountId: "acc-1" };
    const ctxAcc2: RequestContext = { ...ctx, accountId: "acc-2" };
    await service.upsertProfile(ctxAcc1, {
      ...PROFILE_INPUT,
      facets: { statusNote: "49 条稿子压在 review，一直未发布" },
    });
    await service.upsertProfile(ctxAcc2, {
      ...PROFILE_INPUT,
      facets: { statusNote: "稳定更新中" },
    });

    const first = await service.cleanupLegacyDynamicStatusNote(ctxAcc1);
    const second = await service.cleanupLegacyDynamicStatusNote(ctxAcc1);

    expect(first.outcome).toBe("cleared");
    expect(first.previousValueHash).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toEqual({
      outcome: "already_clean",
      previousValueHash: null,
    });
    expect((await service.getProfile(ctxAcc1))!.facets.statusNote).toBe("");
    expect((await service.getProfile(ctxAcc2))!.facets.statusNote).toBe("稳定更新中");
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "positioning.legacy_status_note.cleaned",
        userId: ctx.userId,
        accountId: "acc-1",
        previousValueHash: first.previousValueHash,
      }),
    );
    expect(JSON.stringify(audit.mock.calls)).not.toContain("49 条稿子");
  });

  it("[T-521] 非动态状态说明不被自动改写成另一条静态计数", async () => {
    const service = makeService(db, makeProjectsPort());
    await service.upsertProfile(ctx, {
      ...PROFILE_INPUT,
      facets: { statusNote: "稳定更新中" },
    });

    await expect(service.cleanupLegacyDynamicStatusNote(ctx)).resolves.toEqual({
      outcome: "not_dynamic",
      previousValueHash: null,
    });
    expect((await service.getProfile(ctx))!.facets.statusNote).toBe("稳定更新中");

    await service.upsertProfile(ctx, {
      ...PROFILE_INPUT,
      facets: { statusNote: "2026 年发布规划按周推进" },
    });
    await expect(service.cleanupLegacyDynamicStatusNote(ctx)).resolves.toEqual({
      outcome: "not_dynamic",
      previousValueHash: null,
    });
    expect((await service.getProfile(ctx))!.facets.statusNote).toBe(
      "2026 年发布规划按周推进",
    );

    await service.upsertProfile(ctx, {
      ...PROFILE_INPUT,
      facets: { statusNote: "2026 年发布规划：每月发布 4 条视频" },
    });
    await expect(service.cleanupLegacyDynamicStatusNote(ctx)).resolves.toEqual({
      outcome: "not_dynamic",
      previousValueHash: null,
    });
    expect((await service.getProfile(ctx))!.facets.statusNote).toBe(
      "2026 年发布规划：每月发布 4 条视频",
    );
  });

  it("[T-521] AI 上下文共用的 getPositioningCenter 会自动执行一次旧动态计数清理", async () => {
    const audit = vi.fn(async () => undefined);
    let seq = 0;
    const service = createPositioningService({
      db,
      now: () => NOW,
      nextId: (prefix) => `${prefix}-center-cleanup-${++seq}`,
      projects: makeProjectsPort(),
      auditLegacyStatusNoteCleanup: audit,
    });
    await service.upsertProfile(ctx, {
      ...PROFILE_INPUT,
      facets: { statusNote: "49 条 review 稿件未发布" },
    });

    const center = await service.getPositioningCenter(ctx);

    expect(center.profile!.facets.statusNote).toBe("");
    expect(audit).toHaveBeenCalledTimes(1);
    await service.getPositioningCenter(ctx);
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it("createStatementVersion requires a profile first (ProfileRequiredError)", async () => {
    const service = makeService(db, makeProjectsPort());
    await expect(
      service.createStatementVersion(ctx, {
        oneLiner: "x",
        keywords: ["a", "b", "c"],
        productAnchorIds: [],
      }),
    ).rejects.toBeInstanceOf(ProfileRequiredError);
  });

  it("append-only version chain: v2 is version 2 and leaves v1 byte-identical", async () => {
    const service = makeService(db, makeProjectsPort());
    await service.upsertProfile(ctx, PROFILE_INPUT);
    const v1 = await service.createStatementVersion(ctx, {
      oneLiner: "v1 文案",
      keywords: ["论文", "代码", "工程化"],
      productAnchorIds: ["product-1"],
    });
    expect(v1.versionNumber).toBe(1);
    const v2 = await service.createStatementVersion(ctx, {
      oneLiner: "v2 文案",
      keywords: ["论文", "生产级", "工程化"],
      productAnchorIds: ["product-1", "product-2"],
    });
    expect(v2.versionNumber).toBe(2);
    // re-read v1 — unchanged.
    const reread = await service.getStatement(ctx, v1.id);
    expect(reread).toEqual(v1);
    // No update/delete method exposed (immutability, mirrors Artifacts).
    expect(
      (service as unknown as Record<string, unknown>).updateStatement,
    ).toBeUndefined();
    expect(
      (service as unknown as Record<string, unknown>).deleteStatement,
    ).toBeUndefined();
  });

  it("[T-231⑥] changeReason 落库:传了存 trim 后原文,不传存 ''(留痕不丢)", async () => {
    const service = makeService(db, makeProjectsPort());
    await service.upsertProfile(ctx, PROFILE_INPUT);
    const withReason = await service.createStatementVersion(ctx, {
      oneLiner: "v1 文案",
      keywords: ["论文", "代码", "工程化"],
      productAnchorIds: [],
      changeReason: "  受众从泛开发者收窄到 AI 应用工程师 ",
    });
    const without = await service.createStatementVersion(ctx, {
      oneLiner: "v2 文案",
      keywords: ["论文", "代码", "工程化"],
      productAnchorIds: [],
    });
    // DTO 不含 changeReason(留痕列,读面后续接)—— 直接查行验证真落库。
    const { positioningStatements } = await import("./positioning.db-schema");
    const rows = await db.select().from(positioningStatements);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(withReason.id)?.changeReason).toBe(
      "受众从泛开发者收窄到 AI 应用工程师",
    );
    expect(byId.get(without.id)?.changeReason).toBe("");
  });

  it("rejects a statement whose keywords are not exactly 3", async () => {
    const service = makeService(db, makeProjectsPort());
    await service.upsertProfile(ctx, PROFILE_INPUT);
    await expect(
      service.createStatementVersion(ctx, {
        oneLiner: "x",
        keywords: ["a", "b"],
        productAnchorIds: [],
      }),
    ).rejects.toBeInstanceOf(StatementValidationError);
  });

  it("AI-formalize: createStatementVersion tags created_by_type 'ai' + ai_task_id (no parallel candidate machine)", async () => {
    const service = makeService(db, makeProjectsPort());
    await service.upsertProfile(ctx, PROFILE_INPUT);
    const aiVersion = await service.createStatementVersion(ctx, {
      oneLiner: "AI 建议的定位",
      keywords: ["论文", "代码", "工程化"],
      productAnchorIds: [],
      createdByType: "ai",
      aiTaskId: "ai-task-9",
    });
    expect(aiVersion.createdByType).toBe("ai");
    expect(aiVersion.aiTaskId).toBe("ai-task-9");
    // Positioning owns no candidate lifecycle (C-3).
    expect(
      (service as unknown as Record<string, unknown>).submitCandidate,
    ).toBeUndefined();
    expect(
      (service as unknown as Record<string, unknown>).confirm,
    ).toBeUndefined();
  });

  it("evaluateGate is deterministic + advisory: same input → same score twice, no mutation", async () => {
    const port = makeProjectsPort({
      title: "论文精读：工程化落地",
      brief: "把代码做成生产级",
    });
    const service = makeService(db, port);
    await service.upsertProfile(ctx, PROFILE_INPUT);
    await service.createStatementVersion(ctx, {
      oneLiner: "把论文变代码",
      keywords: ["论文", "代码", "工程化"],
      productAnchorIds: ["product-1"],
    });
    const r1 = await service.evaluateGate(ctx, {
      subjectType: "project",
      subjectId: "project-1",
    });
    const r2 = await service.evaluateGate(ctx, {
      subjectType: "project",
      subjectId: "project-1",
    });
    expect(r1.positioningFit).toBe(r2.positioningFit);
    expect(r1.reasons).toEqual(r2.reasons);
    expect(r1.positioningFit).toBeGreaterThanOrEqual(0);
    expect(r1.positioningFit).toBeLessThanOrEqual(100);
    // Keyword hits: "论文" + "代码" + "工程化" all present in subject text → 3/3.
    expect(r1.reasons).toContain("命中关键词 3/3");
    // statement list unchanged by evaluation (advisory, not mutating).
    const { total } = await service.listStatements(ctx, { limit: 50, offset: 0 });
    expect(total).toBe(1);
  });

  it("evaluateGate with no statement → GateSubjectError", async () => {
    const service = makeService(db, makeProjectsPort());
    await service.upsertProfile(ctx, PROFILE_INPUT);
    await expect(
      service.evaluateGate(ctx, {
        subjectType: "project",
        subjectId: "project-1",
      }),
    ).rejects.toBeInstanceOf(GateSubjectError);
  });

  it("evaluateGate accepts an inline candidate payload (OQ5) and scores anchor/role", async () => {
    const service = makeService(db, makeProjectsPort());
    await service.upsertProfile(ctx, PROFILE_INPUT);
    await service.createStatementVersion(ctx, {
      oneLiner: "把论文变代码",
      keywords: ["论文", "代码", "工程化"],
      productAnchorIds: ["product-1"],
    });
    const r = await service.evaluateGate(ctx, {
      subjectType: "candidate",
      subjectId: "cand-1",
      candidate: {
        title: "论文解读",
        angle: "工程化",
        contentRole: "conversion",
        productAnchorId: "product-1",
      },
    });
    expect(r.subjectType).toBe("candidate");
    expect(r.reasons).toContain("锚定产品一致");
    expect(r.reasons).toContain("内容角色对齐 (conversion)");
  });

  it("getPositioningCenter empty-state returns nulls + empty arrays, not an error", async () => {
    const service = makeService(db, makeProjectsPort());
    const center = await service.getPositioningCenter(ctx);
    expect(center.profile).toBeNull();
    expect(center.currentStatement).toBeNull();
    expect(center.keywords).toEqual([]);
    expect(center.productAnchors).toEqual([]);
    expect(center.history).toEqual([]);
  });

  it("getPositioningCenter returns current = max version + history version-desc", async () => {
    const service = makeService(db, makeProjectsPort());
    await service.upsertProfile(ctx, PROFILE_INPUT);
    await service.createStatementVersion(ctx, {
      oneLiner: "v1",
      keywords: ["a", "b", "c"],
      productAnchorIds: [],
    });
    await service.createStatementVersion(ctx, {
      oneLiner: "v2",
      keywords: ["d", "e", "f"],
      productAnchorIds: ["product-9"],
    });
    const center = await service.getPositioningCenter(ctx);
    expect(center.currentStatement!.versionNumber).toBe(2);
    expect(center.keywords).toEqual(["d", "e", "f"]);
    expect(center.productAnchors).toEqual(["product-9"]);
    expect(center.history.map((h) => h.versionNumber)).toEqual([2, 1]);
  });

  // ── [T-136 切片 ④ · SPEC §C/§D] service→repo accountId 透传:切号 = 换定位母版 ──
  it("按号切:同 user 不同 accountId 的 getPositioningCenter 见各自的定位母版", async () => {
    const service = makeService(db, makeProjectsPort());
    const ctxAcc1: RequestContext = { ...ctx, accountId: "acc-1" };
    const ctxAcc2: RequestContext = { ...ctx, accountId: "acc-2" };

    await service.upsertProfile(ctxAcc1, { ...PROFILE_INPUT, persona: "科技号" });
    await service.upsertProfile(ctxAcc2, { ...PROFILE_INPUT, persona: "美食号" });

    // 号 1 只见科技号母版;号 2 只见美食号母版 —— 切号即换约束(§D)。
    const center1 = await service.getPositioningCenter(ctxAcc1);
    const center2 = await service.getPositioningCenter(ctxAcc2);
    expect(center1.profile!.persona).toBe("科技号");
    expect(center2.profile!.persona).toBe("美食号");
    expect(center1.profile!.id).not.toBe(center2.profile!.id);

    // statement 也按号:号 1 建的 statement 在号 2 的 center 里看不到。
    await service.createStatementVersion(ctxAcc1, {
      oneLiner: "科技号定位",
      keywords: ["a", "b", "c"],
      productAnchorIds: [],
    });
    expect((await service.getPositioningCenter(ctxAcc1)).currentStatement)
      .not.toBeNull();
    expect(
      (await service.getPositioningCenter(ctxAcc2)).currentStatement,
    ).toBeNull();
  });
});
