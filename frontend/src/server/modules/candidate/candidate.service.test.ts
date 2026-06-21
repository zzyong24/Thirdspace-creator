import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createCandidateService,
  type CandidateService,
  type CandidateProjectsPort,
  type CandidatePositioningPort,
  type CandidateIngestionPort,
} from "./candidate.service";
import {
  PromoteStateError,
  DanglingRunError,
  OwnershipError,
} from "./candidate.errors";

// Candidate service test (Task 3) — fake now/nextId, pglite db, stubbed peer ports.
// Covers: manual createCandidate (idea, positioningFit from gate or null);
// createFromAIResult (C-3 formalize — source∈{trend,benchmark,demand}, aiTaskId set,
// no parallel machine, idempotent); ingestAudienceSignal (C-4 — requires runId,
// RISK-005 dangling-run rejection, demandCount bump); linkSignalToCandidate (omit →
// spawn demand Candidate); promote (类比 promoteReviewInsight, no double-promote,
// atomic project+status+promotion). Deterministic clock/ids (no Date.now/Math.random).

const NOW = "2026-06-21T00:00:00.000Z";
const ctx: RequestContext = { userId: "user-a", requestId: "r1", source: "user" };
const ingestCtx: RequestContext = {
  userId: "user-a",
  requestId: "r2",
  source: "ingestion",
  ingestionRunId: "run-1",
};

function makePorts() {
  const projects: CandidateProjectsPort & {
    createProject: ReturnType<typeof vi.fn>;
  } = {
    createProject: vi.fn(async (_ctx, cmd) => ({
      id: `proj-${cmd.title}`,
    })),
  };
  const positioning: CandidatePositioningPort & {
    evaluateFit: ReturnType<typeof vi.fn>;
  } = {
    evaluateFit: vi.fn(async () => 72),
  };
  const ingestion: CandidateIngestionPort & {
    assertRunExists: ReturnType<typeof vi.fn>;
  } = { assertRunExists: vi.fn(async () => {}) };
  return { projects, positioning, ingestion };
}

function makeService(
  db: Db,
  ports: ReturnType<typeof makePorts>,
  opts: { withPositioning?: boolean } = {},
  tag = "a",
): CandidateService {
  let seq = 0;
  return createCandidateService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
    projects: ports.projects,
    positioning: opts.withPositioning === false ? undefined : ports.positioning,
    ingestion: ports.ingestion,
  });
}

describe("candidate service", () => {
  let db: Db;
  let ports: ReturnType<typeof makePorts>;
  let svc: CandidateService;
  beforeEach(async () => {
    ({ db } = await createDb());
    ports = makePorts();
    svc = makeService(db, ports);
  });

  it("createCandidate(idea) lands in pool with positioningFit from the gate port", async () => {
    const c = await svc.createCandidate(ctx, {
      title: "新选题",
      angle: "切入",
    });
    expect(c.source).toBe("idea");
    expect(c.status).toBe("pool");
    expect(c.demandCount).toBe(0);
    expect(c.positioningFit).toBe(72);
    expect(ports.positioning.evaluateFit).toHaveBeenCalledOnce();
  });

  it("createCandidate(idea) has null positioningFit when the gate port is absent (soft dep)", async () => {
    const noGate = makeService(db, ports, { withPositioning: false });
    const c = await noGate.createCandidate(ctx, { title: "无门禁选题", angle: "" });
    expect(c.positioningFit).toBeNull();
  });

  it("createFromAIResult formalizes an AITaskResult (trend) with aiTaskId; no parallel machine; idempotent", async () => {
    const result = {
      aiTaskId: "ait-1",
      resultType: "candidate" as const,
      resultData: { title: "AI 选题", angle: "AI 切入", source: "trend" as const },
    };
    const c = await svc.createFromAIResult(ctx, result);
    expect(c.source).toBe("trend");
    expect(c.aiTaskId).toBe("ait-1");
    expect(c.status).toBe("pool"); // pool, NOT an awaiting/confirmed candidate state
    // Idempotent: re-calling with the same aiTaskId returns the same row, no dup.
    const again = await svc.createFromAIResult(ctx, result);
    expect(again.id).toBe(c.id);
    const list = await svc.listCandidates(ctx, { limit: 100, offset: 0 });
    expect(list.rows.filter((r) => r.aiTaskId === "ait-1")).toHaveLength(1);
  });

  it("ingestAudienceSignal requires a real IngestionRun (RISK-005 dangling-run rejection)", async () => {
    ports.ingestion.assertRunExists.mockRejectedValueOnce(
      new OwnershipError("OwnershipError: run not found"),
    );
    await expect(
      svc.ingestAudienceSignal(ingestCtx, {
        source: "comment",
        rawText: "怎么入门？",
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("ingestAudienceSignal rejects when ctx carries no ingestionRunId", async () => {
    await expect(
      svc.ingestAudienceSignal(ctx, { source: "comment", rawText: "q" }),
    ).rejects.toBeInstanceOf(DanglingRunError);
  });

  it("ingestAudienceSignal writes a signal carrying the runId and bumps demandCount of the linked candidate", async () => {
    const cand = await svc.createCandidate(ctx, { title: "需求选题", angle: "" });
    const signal = await svc.ingestAudienceSignal(ingestCtx, {
      source: "comment",
      rawText: "怎么报名？",
      linkedCandidateRef: cand.id,
    });
    expect(signal.ingestionRunId).toBe("run-1");
    expect(signal.linkedCandidateId).toBe(cand.id);
    expect(ports.ingestion.assertRunExists).toHaveBeenCalledWith(
      ingestCtx,
      "run-1",
    );
    const refreshed = await svc.getCandidate(ctx, cand.id);
    expect(refreshed.demandCount).toBe(1);
  });

  it("linkSignalToCandidate with no candidateId spawns a demand Candidate from the signal and links it", async () => {
    const signal = await svc.ingestAudienceSignal(ingestCtx, {
      source: "comment",
      rawText: "有没有进阶课？",
      demandTag: "进阶",
    });
    const cand = await svc.linkSignalToCandidate(ctx, signal.id, undefined);
    expect(cand.source).toBe("demand");
    expect(cand.title).toContain("有没有进阶课");
    expect(cand.demandCount).toBe(1);
    // the signal now points at the new candidate.
    const signals = await svc.listSignals(ctx, {
      linkedCandidateId: cand.id,
      limit: 100,
      offset: 0,
    });
    expect(signals.rows).toHaveLength(1);
  });

  it("linkSignalToCandidate to an existing candidate bumps that candidate's demandCount", async () => {
    const cand = await svc.createCandidate(ctx, { title: "目标选题", angle: "" });
    const signal = await svc.ingestAudienceSignal(ingestCtx, {
      source: "dm",
      rawText: "私信问题",
    });
    const linked = await svc.linkSignalToCandidate(ctx, signal.id, cand.id);
    expect(linked.id).toBe(cand.id);
    expect(linked.demandCount).toBe(1);
  });

  it("promote calls ProjectsService.createProject, sets promoted, writes a promotion row", async () => {
    const cand = await svc.createCandidate(ctx, {
      title: "可晋升选题",
      angle: "切入",
      contentRole: "conversion",
    });
    const promo = await svc.promote(ctx, cand.id);
    expect(ports.projects.createProject).toHaveBeenCalledOnce();
    expect(promo.candidateId).toBe(cand.id);
    expect(promo.projectId).toBe("proj-可晋升选题");
    const refreshed = await svc.getCandidate(ctx, cand.id);
    expect(refreshed.status).toBe("promoted");
  });

  it("promote on an already-promoted Candidate throws PromoteStateError (no double-promote)", async () => {
    const cand = await svc.createCandidate(ctx, { title: "选题", angle: "" });
    await svc.promote(ctx, cand.id);
    await expect(svc.promote(ctx, cand.id)).rejects.toBeInstanceOf(
      PromoteStateError,
    );
    // exactly one project created (no duplicate).
    expect(ports.projects.createProject).toHaveBeenCalledOnce();
  });

  it("multi-tenant: user B cannot get/promote user A's candidate (404)", async () => {
    const cand = await svc.createCandidate(ctx, { title: "A 选题", angle: "" });
    const ctxB: RequestContext = {
      userId: "user-b",
      requestId: "rb",
      source: "user",
    };
    await expect(svc.getCandidate(ctxB, cand.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    await expect(svc.promote(ctxB, cand.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });

  it("listCandidates sorts by demandCount desc when requested", async () => {
    const low = await svc.createCandidate(ctx, { title: "低需求", angle: "" });
    const high = await svc.createCandidate(ctx, { title: "高需求", angle: "" });
    // two signals on high, one on low.
    for (const text of ["q1", "q2"]) {
      const s = await svc.ingestAudienceSignal(ingestCtx, {
        source: "comment",
        rawText: text,
      });
      await svc.linkSignalToCandidate(ctx, s.id, high.id);
    }
    const s = await svc.ingestAudienceSignal(ingestCtx, {
      source: "comment",
      rawText: "q3",
    });
    await svc.linkSignalToCandidate(ctx, s.id, low.id);

    const list = await svc.listCandidates(ctx, {
      sort: "demandCount",
      limit: 100,
      offset: 0,
    });
    const idx = (id: string) => list.rows.findIndex((r) => r.id === id);
    expect(idx(high.id)).toBeLessThan(idx(low.id));
  });
});
