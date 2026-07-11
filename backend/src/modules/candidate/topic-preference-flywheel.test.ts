import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createCandidateService,
  type CandidateService,
} from "./candidate.service";

// [T-212d] 防茧房校准 service-level 单测 —— 淘汰带原因 + 偏好 upsert 护栏 + 评分前置注入 + 8 周归档。
// 用真 pglite(createDb 跑 0033 迁移),fake now/nextId(now 可变以测衰减/归档)。

const ctx: RequestContext = { userId: "user-a", requestId: "r1", source: "user" };
const WEEK = 7 * 24 * 60 * 60 * 1000;

function makeService(db: Db, nowRef: { iso: string }) {
  let seq = 0;
  const svc = createCandidateService({
    db,
    now: () => nowRef.iso,
    nextId: (prefix) => `${prefix}-${++seq}`,
    projects: { createProject: vi.fn(async (_c, cmd) => ({ id: `proj-${cmd.title}` })) },
    // 定位门:按标题给个确定 fit(便于断言 baseScore)。含「爆款」→ 高分,否则中等。
    positioning: {
      evaluateFit: vi.fn(async (_c, s) => (s.title.includes("高潜") ? 80 : 50)),
    },
    ingestion: { assertRunExists: vi.fn(async () => {}) },
  });
  return svc;
}

describe("[T-212d] 淘汰带原因 → listDropReasons", () => {
  let db: Db;
  let svc: CandidateService;
  const nowRef = { iso: "2026-06-01T00:00:00.000Z" };
  beforeEach(async () => {
    ({ db } = await createDb());
    svc = makeService(db, nowRef);
  });

  it("patch status=dropped 带 dropReason 落库,listDropReasons 读回", async () => {
    const c1 = await svc.createCandidate(ctx, { title: "选题A" });
    const c2 = await svc.createCandidate(ctx, { title: "选题B" });
    await svc.patchCandidate(ctx, c1.id, {
      status: "dropped",
      dropReason: "太理论了没人看",
    });
    await svc.patchCandidate(ctx, c2.id, {
      status: "dropped",
      dropReason: "又是复盘不想做",
    });
    const reasons = await svc.listDropReasons(ctx);
    expect(reasons).toContain("太理论了没人看");
    expect(reasons).toContain("又是复盘不想做");
    expect(reasons).toHaveLength(2);
  });

  it("未淘汰 / 无原因的候选不进 listDropReasons", async () => {
    const c1 = await svc.createCandidate(ctx, { title: "留着的" });
    await svc.patchCandidate(ctx, c1.id, { status: "dropped" }); // 无原因
    expect(await svc.listDropReasons(ctx)).toHaveLength(0);
  });

  it("带原因淘汰触发 dispatchPreferenceDistill(有原因才触发)", async () => {
    const dispatch = vi.fn();
    let seq = 0;
    const svc2 = createCandidateService({
      db,
      now: () => nowRef.iso,
      nextId: (p) => `${p}-x-${++seq}`,
      projects: { createProject: vi.fn(async () => ({ id: "p" })) },
      ingestion: { assertRunExists: vi.fn(async () => {}) },
      dispatchPreferenceDistill: dispatch,
    });
    const c = await svc2.createCandidate(ctx, { title: "T" });
    await svc2.patchCandidate(ctx, c.id, { status: "dropped" }); // 无原因 → 不触发
    expect(dispatch).not.toHaveBeenCalled();
    await svc2.patchCandidate(ctx, c.id, { status: "dropped", dropReason: "理由" });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});

describe("[T-212d] 偏好 upsert 护栏(①±10 封顶 / ②≥3 例才升级)", () => {
  let db: Db;
  let svc: CandidateService;
  const nowRef = { iso: "2026-06-01T00:00:00.000Z" };
  beforeEach(async () => {
    ({ db } = await createDb());
    svc = makeService(db, nowRef);
  });

  it("护栏②:<3 例 → status=candidate(不进 active,不注入评分)", async () => {
    const p = await svc.upsertTopicPreference(ctx, {
      keyword: "理论",
      direction: "avoid",
      signal: "不喜欢理论",
      exampleCount: 2,
    });
    expect(p.status).toBe("candidate");
    // candidate 态不进 active 列表(不注入评分)。
    expect(await svc.listActiveTopicPreferences(ctx)).toHaveLength(0);
  });

  it("护栏②:≥3 例 → status=active(升级为硬偏好)", async () => {
    const p = await svc.upsertTopicPreference(ctx, {
      keyword: "理论",
      direction: "avoid",
      signal: "不喜欢理论",
      exampleCount: 3,
    });
    expect(p.status).toBe("active");
  });

  it("护栏①:weight ±10 封顶(exampleCount 派生也不越 10)", async () => {
    const p = await svc.upsertTopicPreference(ctx, {
      keyword: "长尾",
      direction: "avoid",
      signal: "s",
      exampleCount: 100, // 派生 weight=300 → 封顶 10
    });
    expect(p.weight).toBe(10);
    const p2 = await svc.upsertTopicPreference(ctx, {
      keyword: "另一个",
      direction: "prefer",
      signal: "s",
      exampleCount: 3,
      weight: 999, // 显式超限也封顶
    });
    expect(p2.weight).toBe(10);
  });

  it("身份键 keyword+direction 归并:同 keyword 再 upsert 累计强化不新建", async () => {
    await svc.upsertTopicPreference(ctx, {
      keyword: "理论",
      direction: "avoid",
      signal: "v1",
      exampleCount: 2,
    });
    const p2 = await svc.upsertTopicPreference(ctx, {
      keyword: "理论",
      direction: "avoid",
      signal: "v2",
      exampleCount: 4, // 升到 3+ → active
    });
    expect(p2.status).toBe("active");
    expect(p2.signal).toBe("v2");
    // 只有一行(归并),active 列表恰 1 条。
    const active = await svc.listActiveTopicPreferences(ctx);
    expect(active).toHaveLength(1);
  });
});

describe("[T-212d] 评分前置注入 + 护栏④探索位 (rankTopicsWithGuardrails)", () => {
  let db: Db;
  let svc: CandidateService;
  const nowRef = { iso: "2026-06-01T00:00:00.000Z" };
  beforeEach(async () => {
    ({ db } = await createDb());
    svc = makeService(db, nowRef);
  });

  it("active avoid 偏好命中候选 → 该候选 adjustedScore 被压低(与 positioningFit 并列不覆盖)", async () => {
    // 两个候选,positioningFit 同为 50;其中一个标题含「理论」。
    await svc.createCandidate(ctx, { title: "纯理论解析" });
    await svc.createCandidate(ctx, { title: "实操演示" });
    await svc.upsertTopicPreference(ctx, {
      keyword: "理论",
      direction: "avoid",
      signal: "不喜欢理论",
      exampleCount: 3, // active
    });
    const ranked = await svc.rankTopicsWithGuardrails(ctx, {
      limit: 10,
      explorationSlots: 0,
    });
    const theory = ranked.find((r) => r.title === "纯理论解析")!;
    const hands = ranked.find((r) => r.title === "实操演示")!;
    expect(theory.baseScore).toBe(50); // positioningFit 未被覆盖
    expect(theory.preferenceAdjustment).toBeLessThan(0); // 被 avoid 压低
    expect(theory.adjustedScore).toBeLessThan(theory.baseScore);
    expect(hands.preferenceAdjustment).toBe(0); // 未命中不动
    // 排序:实操(50)在纯理论(<50)之前。
    expect(ranked[0]!.title).toBe("实操演示");
  });

  it("护栏②:candidate 态(<3 例)偏好不注入评分", async () => {
    await svc.createCandidate(ctx, { title: "纯理论解析" });
    await svc.upsertTopicPreference(ctx, {
      keyword: "理论",
      direction: "avoid",
      signal: "s",
      exampleCount: 2, // 未升级
    });
    const ranked = await svc.rankTopicsWithGuardrails(ctx, { limit: 10 });
    expect(ranked[0]!.preferenceAdjustment).toBe(0);
  });

  it("护栏④ 探索位:被偏好压制但 base 高的候选仍获出场", async () => {
    // 高潜候选(positioningFit=80)标题含被 avoid 的「理论」→ adjusted 被压;
    // 另 3 个普通候选 positioningFit=50 不含。纯利用位会把高潜挤出前列,探索位救回。
    await svc.createCandidate(ctx, { title: "高潜理论深挖" }); // base 80,被压到 70
    await svc.createCandidate(ctx, { title: "普通一" });
    await svc.createCandidate(ctx, { title: "普通二" });
    await svc.createCandidate(ctx, { title: "普通三" });
    await svc.upsertTopicPreference(ctx, {
      keyword: "理论",
      direction: "avoid",
      signal: "s",
      exampleCount: 5, // weight 派生 10 → 80-10=70
    });
    // limit 3、探索位 1:利用位取 adjusted 前 2,探索位从剩余按 base 补 1(=高潜,base 80)。
    const ranked = await svc.rankTopicsWithGuardrails(ctx, {
      limit: 3,
      explorationSlots: 1,
    });
    expect(ranked.map((r) => r.title)).toContain("高潜理论深挖");
    expect(ranked).toHaveLength(3);
  });
});

describe("[T-212d] 护栏③ 8 周衰减 + 过期归档 (rankTopicsWithGuardrails)", () => {
  let db: Db;
  const nowRef = { iso: "2026-06-01T00:00:00.000Z" };
  beforeEach(async () => {
    ({ db } = await createDb());
    nowRef.iso = "2026-06-01T00:00:00.000Z"; // 每测复位(前测会拨快 now)
  });

  it("偏好满 8 周未强化 → rank 时归档、不再注入评分", async () => {
    const svc = makeService(db, nowRef);
    await svc.createCandidate(ctx, { title: "纯理论解析" });
    await svc.upsertTopicPreference(ctx, {
      keyword: "理论",
      direction: "avoid",
      signal: "s",
      exampleCount: 5,
    });
    // 立刻 rank(同 now):命中压低。
    let ranked = await svc.rankTopicsWithGuardrails(ctx, { limit: 10 });
    expect(ranked.find((r) => r.title === "纯理论解析")!.preferenceAdjustment).toBeLessThan(0);

    // 把 now 拨快 9 周 → 偏好过期,rank 内 archiveExpired 生效,不再注入。
    nowRef.iso = new Date(Date.parse("2026-06-01T00:00:00.000Z") + 9 * WEEK).toISOString();
    ranked = await svc.rankTopicsWithGuardrails(ctx, { limit: 10 });
    expect(ranked.find((r) => r.title === "纯理论解析")!.preferenceAdjustment).toBe(0);
    // active 列表已空(被归档)。
    expect(await svc.listActiveTopicPreferences(ctx)).toHaveLength(0);
  });

  it("4 周(半衰):调整量按龄衰减但仍注入", async () => {
    const svc = makeService(db, nowRef);
    await svc.createCandidate(ctx, { title: "纯理论解析" });
    await svc.upsertTopicPreference(ctx, {
      keyword: "理论",
      direction: "avoid",
      signal: "s",
      exampleCount: 5, // weight 10
    });
    nowRef.iso = new Date(Date.parse("2026-06-01T00:00:00.000Z") + 4 * WEEK).toISOString();
    const ranked = await svc.rankTopicsWithGuardrails(ctx, { limit: 10 });
    const adj = ranked.find((r) => r.title === "纯理论解析")!.preferenceAdjustment;
    expect(adj).toBe(-5); // 10 * (8-4)/8 = 5,方向 avoid → -5
  });
});
