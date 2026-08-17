import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  ENDPOINTS,
  type Endpoint,
  type RequestContext,
  type Transport,
} from "@creatoros/contract";
import { createCandidateService } from "./candidate.service";
import { createCandidateTransport } from "./candidate.transport";
import { UnsupportedOperationError } from "./candidate.errors";

// Candidate contract test (Task 5) — for EACH of the 7 op ids, drive the transport
// with a seeded ctx + valid input and assert the op's contract response DTO
// .parse(envelope.data) succeeds (the output validates against the wire shape;
// per-item for the isList lists). Also: meta carries requestId; an unknown op id
// throws UnsupportedOperationError. Mirrors the positioning contract test.

const NOW = "2026-06-21T00:00:00.000Z";
// [T-332 S2] per-account 域 op 必须带号(未选号在 service 入口 AccountRequiredError)。
const ctx: RequestContext = {
  userId: "user-a",
  requestId: "r1",
  source: "user",
  accountId: "acc-a",
};

const ep = (id: string) => ({ id }) as unknown as Endpoint;
async function call(
  transport: Transport,
  id: string,
  input: unknown,
  rctx: RequestContext | undefined = ctx,
): Promise<{ data: unknown; meta?: { requestId?: string } }> {
  const res = await transport.request(ep(id), input as never, rctx);
  return res as { data: unknown; meta?: { requestId?: string } };
}

function makeTransport(db: Db): Transport {
  let seq = 0;
  const service = createCandidateService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
    projects: {
      createProject: async (_ctx, cmd) => ({ id: `proj-${cmd.title}` }),
    },
    positioning: { evaluateFit: async () => 60 },
    ingestion: { assertRunExists: async () => {} },
  });
  return createCandidateTransport(() => service);
}

describe("candidate contract", () => {
  let db: Db;
  let transport: Transport;
  beforeEach(async () => {
    ({ db } = await createDb());
    transport = makeTransport(db);
  });

  it("candidates.create → candidateResource", async () => {
    const res = await call(transport, "candidates.create", {
      body: { title: "选题", angle: "切入", source: "idea" },
    });
    const parsed = ENDPOINTS.createCandidate.response.parse(res.data);
    expect(parsed).toMatchObject({ source: "idea", status: "pool" });
    expect(res.meta?.requestId).toBe("r1");
  });

  // [T-149] 对话内 AI 出题(topic.generate,无 ai_task → 走不通 confirm 流)采纳时,把真实出题
  // 渠道透传进 candidates.create,候选 source 保住 provenance(不再被硬编码 idea 冲进「手动灵感」)。
  it("[T-149] candidates.create 透传 AI 渠道 source(非 idea)", async () => {
    for (const source of ["trend", "benchmark", "demand"] as const) {
      const res = await call(transport, "candidates.create", {
        body: { title: `AI-${source}`, angle: "", source },
      });
      const parsed = ENDPOINTS.createCandidate.response.parse(res.data);
      expect(parsed).toMatchObject({ source, status: "pool" });
    }
  });

  // 手动新建门(不带 source)仍落 idea —— 向后兼容(手动灵感统计不受影响)。
  it("[T-149] candidates.create 不带 source → 兜底 idea", async () => {
    const res = await call(transport, "candidates.create", {
      body: { title: "手动选题", angle: "" },
    });
    const parsed = ENDPOINTS.createCandidate.response.parse(res.data);
    expect(parsed).toMatchObject({ source: "idea" });
  });

  it("candidates.list → candidateResource[] (per item)", async () => {
    await call(transport, "candidates.create", {
      body: { title: "a", angle: "", source: "idea" },
    });
    const res = await call(transport, "candidates.list", {
      query: { page: 1, pageSize: 20 },
    });
    const rows = res.data as unknown[];
    for (const row of rows) ENDPOINTS.listCandidates.response.parse(row);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("candidates.get → candidateResource", async () => {
    const created = (
      await call(transport, "candidates.create", {
        body: { title: "g", angle: "", source: "idea" },
      })
    ).data as { id: string };
    const res = await call(transport, "candidates.get", {
      params: { candidateId: created.id },
    });
    ENDPOINTS.getCandidate.response.parse(res.data);
  });

  it("candidates.patch → candidateResource", async () => {
    const created = (
      await call(transport, "candidates.create", {
        body: { title: "p", angle: "", source: "idea" },
      })
    ).data as { id: string };
    const res = await call(transport, "candidates.patch", {
      params: { candidateId: created.id },
      body: { status: "dropped" },
    });
    const parsed = ENDPOINTS.patchCandidate.response.parse(res.data);
    expect(parsed.status).toBe("dropped");
  });

  it("candidates.promote → topicPromotionResource", async () => {
    const created = (
      await call(transport, "candidates.create", {
        body: { title: "promo", angle: "", source: "idea" },
      })
    ).data as { id: string };
    const res = await call(transport, "candidates.promote", {
      params: { candidateId: created.id },
      body: {},
    });
    const parsed = ENDPOINTS.promoteCandidate.response.parse(res.data);
    expect(parsed.candidateId).toBe(created.id);

    const replay = await call(transport, "candidates.promote", {
      params: { candidateId: created.id },
      body: {},
    });
    expect(ENDPOINTS.promoteCandidate.response.parse(replay.data)).toEqual(
      parsed,
    );
  });

  it("audienceSignals.list → audienceSignalResource[] (per item)", async () => {
    const res = await call(transport, "audienceSignals.list", {
      query: { page: 1, pageSize: 20 },
    });
    const rows = res.data as unknown[];
    for (const row of rows) ENDPOINTS.listAudienceSignals.response.parse(row);
    expect(Array.isArray(rows)).toBe(true);
  });

  it("audienceSignals.linkToCandidate → candidateResource (omit candidateId spawns demand)", async () => {
    // There is no signals.create contract op (AudienceSignal writes go via
    // Ingestion, C-4). Seed one signal through the C-4 service intake seam so there
    // is something to link, then exercise the contract op. Deterministic ids (C-5).
    const ingestCtx: RequestContext = {
      userId: "user-a",
      requestId: "ri",
      source: "ingestion",
      ingestionRunId: "run-1",
      accountId: "acc-a",
    };
    let sigSeq = 0;
    const svc = createCandidateService({
      db,
      now: () => NOW,
      nextId: (p: string) => `${p}-sig-${++sigSeq}`,
      projects: { createProject: async (_c, cmd) => ({ id: `proj-${cmd.title}` }) },
      positioning: { evaluateFit: async () => 50 },
      ingestion: { assertRunExists: async () => {} },
    });
    const signal = await svc.ingestAudienceSignal(ingestCtx, {
      source: "comment",
      rawText: "一键转候选问题",
    });
    const res = await call(transport, "audienceSignals.linkToCandidate", {
      params: { signalId: signal.id },
      body: {},
    });
    const parsed = ENDPOINTS.linkSignalToCandidate.response.parse(res.data);
    expect(parsed.source).toBe("demand");
  });

  it("topics.overview → topicsOverviewResource (derived, SOFT deps degrade to 0/\"\")", async () => {
    // No overview port wired → 出题依据 cross-module counts are 0/"" (honest); the
    // candidate-module-owned funnel/source counts are real (0 on an empty store).
    const res = await call(transport, "topics.overview", {});
    const parsed = ENDPOINTS.overviewTopics.response.parse(res.data);
    expect(parsed.basis.positioningLabel).toBe("");
    expect(parsed.sources).toHaveLength(7);
    expect(parsed.funnel).toHaveLength(6);
    expect(res.meta?.requestId).toBe("r1");
  });

  it("unknown op id throws UnsupportedOperationError", async () => {
    await expect(call(transport, "candidates.bogus", {})).rejects.toBeInstanceOf(
      UnsupportedOperationError,
    );
  });

  it("a persisted op with no ctx throws (unauthenticated)", async () => {
    await expect(
      transport.request(ep("candidates.list"), { query: {} } as never, undefined),
    ).rejects.toBeTruthy();
  });
});
