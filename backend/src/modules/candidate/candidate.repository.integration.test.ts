import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  createCandidateRepository,
  type CandidateRepository,
} from "./candidate.repository";
import { OwnershipError, DerivedFieldError } from "./candidate.errors";

// Candidate repository integration test (Task 1 + 2) — pglite-backed. Covers:
//   - Task 1: the three tables round-trip (candidate + signal referencing it +
//     promotion referencing candidate & project), ISO text timestamps, demandCount
//     default 0, status default 'pool' survive.
//   - Task 2: ownership (user A ≠ user B → OwnershipError 404), demandCount recompute
//     correctness, derived-field guard (patch can't set promoted/demandCount).
// Deterministic clock/ids (no Date.now / Math.random).

const NOW = "2026-06-21T00:00:00.000Z";

function repoFor(db: Db, userId: string, tag = userId): CandidateRepository {
  let seq = 0;
  return createCandidateRepository(db, {
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
    userId,
  });
}

describe("candidate repository (integration)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("round-trips a candidate, a linked signal, and a promotion", async () => {
    const repo = repoFor(db, "user-a");
    const cand = await repo.createCandidate({
      title: "选题 A",
      angle: "切入角度",
      source: "idea",
      contentRole: null,
      productAnchorId: null,
      positioningFit: null,
      predictedScore: null,
      aiTaskId: null,
    });
    expect(cand.status).toBe("pool");
    expect(cand.demandCount).toBe(0);
    expect(cand.createdAt).toBe(NOW);

    const { row: signal, inserted } = await repo.createSignal({
      source: "comment",
      rawText: "怎么入门？",
      demandTag: "入门",
      payingIntent: null,
      linkedCandidateId: cand.id,
      ingestionRunId: "run-1",
    });
    expect(inserted).toBe(true);
    expect(signal.linkedCandidateId).toBe(cand.id);
    expect(signal.ingestionRunId).toBe("run-1");
    expect(signal.createdAt).toBe(NOW);

    const promo = await repo.createPromotion({
      candidateId: cand.id,
      projectId: "proj-1",
    });
    expect(promo.candidateId).toBe(cand.id);
    expect(promo.projectId).toBe("proj-1");
    expect(promo.promotedAt).toBe(NOW);

    const got = await repo.getCandidate(cand.id);
    expect(got.id).toBe(cand.id);
  });

  it("scopes every read to the owner (user B cannot read user A's candidate)", async () => {
    const repoA = repoFor(db, "user-a");
    const cand = await repoA.createCandidate({
      title: "A 的选题",
      angle: "",
      source: "idea",
      contentRole: null,
      productAnchorId: null,
      positioningFit: null,
      predictedScore: null,
      aiTaskId: null,
    });

    const repoB = repoFor(db, "user-b");
    await expect(repoB.getCandidate(cand.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    const bList = await repoB.listCandidates({});
    expect(bList.rows).toHaveLength(0);
    // owner still sees it.
    const aList = await repoA.listCandidates({});
    expect(aList.rows.map((r) => r.id)).toContain(cand.id);
  });

  it("recomputeDemandCount matches the count of linked signals", async () => {
    const repo = repoFor(db, "user-a");
    const cand = await repo.createCandidate({
      title: "需求选题",
      angle: "",
      source: "demand",
      contentRole: null,
      productAnchorId: null,
      positioningFit: null,
      predictedScore: null,
      aiTaskId: null,
    });
    await repo.createSignal({
      source: "comment",
      rawText: "q1",
      demandTag: null,
      payingIntent: null,
      linkedCandidateId: cand.id,
      ingestionRunId: null,
    });
    await repo.createSignal({
      source: "dm",
      rawText: "q2",
      demandTag: null,
      payingIntent: null,
      linkedCandidateId: cand.id,
      ingestionRunId: null,
    });
    const count = await repo.recomputeDemandCount(cand.id);
    expect(count).toBe(2);
    const refreshed = await repo.getCandidate(cand.id);
    expect(refreshed.demandCount).toBe(2);
  });

  it("createSignal 带 external_id 幂等:同 cid 二次插入不重复(T-065)", async () => {
    const repo = repoFor(db, "user-a");
    const base = {
      source: "comment",
      rawText: "大佬求带",
      demandTag: null,
      payingIntent: null,
      linkedCandidateId: null,
      ingestionRunId: "run-1",
      externalId: "douyin:comment:7657740645872599859",
    };
    const first = await repo.createSignal(base);
    expect(first.inserted).toBe(true);
    // 第二次同 external_id(哪怕换 run / 换 publication)→ 命中唯一锚,返回原行,不新写。
    const second = await repo.createSignal({
      ...base,
      ingestionRunId: "run-2",
      publicationId: "pub-其他作品",
    });
    expect(second.inserted).toBe(false);
    expect(second.row.id).toBe(first.row.id);
    const { total } = await repo.listSignals({});
    expect(total).toBe(1);
    // 无锚写入(dm 等)不受约束,照常直插。
    const dm = await repo.createSignal({
      ...base,
      source: "dm",
      externalId: null,
    });
    expect(dm.inserted).toBe(true);
  });

  it("rejects a free patch that sets promoted or demandCount (derived-field guard)", async () => {
    const repo = repoFor(db, "user-a");
    const cand = await repo.createCandidate({
      title: "选题",
      angle: "",
      source: "idea",
      contentRole: null,
      productAnchorId: null,
      positioningFit: null,
      predictedScore: null,
      aiTaskId: null,
    });
    await expect(
      repo.patchCandidate(cand.id, { status: "promoted" } as never),
    ).rejects.toBeInstanceOf(DerivedFieldError);
    await expect(
      repo.patchCandidate(cand.id, { demandCount: 9 } as never),
    ).rejects.toBeInstanceOf(DerivedFieldError);
    // a legit patch (title + drop) works.
    const patched = await repo.patchCandidate(cand.id, {
      title: "新标题",
      status: "dropped",
    });
    expect(patched.title).toBe("新标题");
    expect(patched.status).toBe("dropped");
  });

  it("listSignalsForCandidate is user-scoped", async () => {
    const repoA = repoFor(db, "user-a");
    const cand = await repoA.createCandidate({
      title: "选题",
      angle: "",
      source: "idea",
      contentRole: null,
      productAnchorId: null,
      positioningFit: null,
      predictedScore: null,
      aiTaskId: null,
    });
    await repoA.createSignal({
      source: "comment",
      rawText: "q",
      demandTag: null,
      payingIntent: null,
      linkedCandidateId: cand.id,
      ingestionRunId: null,
    });
    const repoB = repoFor(db, "user-b");
    const bSignals = await repoB.listSignalsForCandidate(cand.id);
    expect(bSignals).toHaveLength(0);
    const aSignals = await repoA.listSignalsForCandidate(cand.id);
    expect(aSignals).toHaveLength(1);
  });
});
