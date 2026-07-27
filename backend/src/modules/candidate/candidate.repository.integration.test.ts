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

// [T-332 S2] repo deps.accountId 已必填(service 经 requireAccountId 收窄后传入);
// 测试给默认号 acct-main,按号隔离用例显式传不同号。
function repoFor(
  db: Db,
  userId: string,
  accountId: string = "acct-main",
  tag = `${userId}-${accountId}`,
  now = NOW,
): CandidateRepository {
  let seq = 0;
  return createCandidateRepository(db, {
    now: () => now,
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
    userId,
    accountId,
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

  it("[T-282] createdAfter 在 SQL 层过滤并按 createdAt 最新优先", async () => {
    const oldRepo = repoFor(
      db,
      "user-a",
      "acct-main",
      "old",
      "2026-06-20T23:59:59.000Z",
    );
    const newRepo = repoFor(
      db,
      "user-a",
      "acct-main",
      "new",
      "2026-06-21T08:00:00.000Z",
    );
    await oldRepo.createCandidate({
      title: "昨天有高分也不应进入今日窗口",
      angle: "",
      source: "idea",
      contentRole: null,
      productAnchorId: null,
      positioningFit: 99,
      predictedScore: 99,
      aiTaskId: null,
    });
    const newest = await newRepo.createCandidate({
      title: "今天新建且尚未评分",
      angle: "",
      source: "trend",
      contentRole: null,
      productAnchorId: null,
      positioningFit: null,
      predictedScore: null,
      aiTaskId: null,
    });

    const result = await newRepo.listCandidates({
      status: "pool",
      sort: "createdAt",
      createdAfter: "2026-06-21T00:00:00.000Z",
      limit: 100,
      offset: 0,
    });
    expect(result.rows.map((row) => row.id)).toEqual([newest.id]);
    expect(result.total).toBe(1);
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

// [T-332 S2] 同一 user 下按号(account_id)隔离门。四表(candidates/audience_signals/
// topic_promotions/topic_preferences)均 per-account(account_id NOT NULL)。strict:
// 读写一律无条件叠 eq(account_id),不存在「null = 全局视图」退化。
describe("candidate repository — per-account isolation (T-332 S2 strict)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  function mkCand(source = "idea") {
    return {
      title: "选题",
      angle: "角度",
      source,
      contentRole: null,
      productAnchorId: null,
      positioningFit: null,
      predictedScore: null,
      aiTaskId: null,
    };
  }

  it("candidates:accountId 设时 listCandidates/getCandidate 只见该号,别号 → OwnershipError", async () => {
    const repo1 = repoFor(db, "user-a", "acct-1");
    const repo2 = repoFor(db, "user-a", "acct-2");
    const c1 = await repo1.createCandidate(mkCand());
    const c2 = await repo2.createCandidate(mkCand());
    expect((await repo1.listCandidates({})).rows.map((r) => r.id)).toEqual([c1.id]);
    expect((await repo2.listCandidates({})).rows.map((r) => r.id)).toEqual([c2.id]);
    await expect(repo1.getCandidate(c2.id)).rejects.toBeInstanceOf(OwnershipError);
  });

  it("candidates:create stamp 落库带 accountId(必有号,无 null 兜底)", async () => {
    const repo1 = repoFor(db, "user-a", "acct-1");
    const c1 = await repo1.createCandidate(mkCand());
    expect(c1.accountId).toBe("acct-1");
  });

  it("audience_signals:accountId 设时 listSignals 只见该号 + create stamp 正确", async () => {
    const repo1 = repoFor(db, "user-a", "acct-1");
    const repo2 = repoFor(db, "user-a", "acct-2");
    const s1 = await repo1.createSignal({
      source: "comment",
      rawText: "号1评论",
      demandTag: null,
      payingIntent: null,
      linkedCandidateId: null,
      ingestionRunId: null,
    });
    await repo2.createSignal({
      source: "comment",
      rawText: "号2评论",
      demandTag: null,
      payingIntent: null,
      linkedCandidateId: null,
      ingestionRunId: null,
    });
    expect(s1.row.accountId).toBe("acct-1");
    const list1 = await repo1.listSignals({});
    expect(list1.rows.map((r) => r.rawText)).toEqual(["号1评论"]);
    // strict:号2 视图只见自己的一条(无全局视图)。
    const list2 = await repo2.listSignals({});
    expect(list2.rows.map((r) => r.rawText)).toEqual(["号2评论"]);
  });

  it("topic_promotions:createPromotion stamp + topicsOverviewCounts 按号计数", async () => {
    const repo1 = repoFor(db, "user-a", "acct-1");
    const repo2 = repoFor(db, "user-a", "acct-2");
    const c1 = await repo1.createCandidate(mkCand());
    const c2 = await repo2.createCandidate(mkCand());
    const promo1 = await repo1.createPromotion({
      candidateId: c1.id,
      projectId: "proj-1",
    });
    await repo2.createPromotion({ candidateId: c2.id, projectId: "proj-2" });
    expect(promo1.accountId).toBe("acct-1");
    // 号1 总览只算号1的:1 个 promotion(strict,不见号2 的)。
    const counts1 = await repo1.topicsOverviewCounts();
    expect(counts1.promotionsCount).toBe(1);
    const counts2 = await repo2.topicsOverviewCounts();
    expect(counts2.promotionsCount).toBe(1);
  });

  // [T-326 DATA-H02 → T-332 S2] topic preference 身份键 ux_topic_preferences_identity_v2
  //   (user_id, account_id, keyword, direction)(迁移 0041):第二账号同关键词偏好独立
  //   成行,不再改写第一账号;同号重复 upsert 仍归并强化。account_id 已 NOT NULL(0042),
  //   「未选号 NULL 桶」不复存在(service 入口 requireAccountId 拦截)。
  describe("upsertTopicPreference — 账号维度身份键 (T-326 DATA-H02)", () => {
    const prefInput = {
      keyword: "职场",
      direction: "avoid" as const,
      signal: "淘汰原因:太宽泛",
      exampleCount: 3,
      weight: -5,
      status: "active" as const,
    };

    it("两个号同 keyword+direction 各自成行,互不改写", async () => {
      const repo1 = repoFor(db, "user-a", "acct-1");
      const repo2 = repoFor(db, "user-a", "acct-2");
      const r1 = await repo1.upsertTopicPreference(prefInput);
      const r2 = await repo2.upsertTopicPreference({
        ...prefInput,
        weight: -9,
        signal: "号2独立信号",
      });
      expect(r1.id).not.toBe(r2.id); // 不同号 → 两行(不是 upsert 改写)
      expect(r1.accountId).toBe("acct-1");
      expect(r2.accountId).toBe("acct-2");
      // 号1 的行未被号2 的写入改动。
      const list1 = await repo1.listActiveTopicPreferences();
      expect(list1.length).toBe(1);
      expect(list1[0]!.weight).toBe(-5);
      expect(list1[0]!.signal).toBe("淘汰原因:太宽泛");
    });

    it("同号重复 upsert 归并强化(不新插平行行)", async () => {
      const repo1 = repoFor(db, "user-a", "acct-1");
      const first = await repo1.upsertTopicPreference(prefInput);
      const second = await repo1.upsertTopicPreference({
        ...prefInput,
        exampleCount: 4,
        weight: -7,
      });
      expect(second.id).toBe(first.id); // 命中同号身份键 → 更新
      expect(second.exampleCount).toBe(4);
      expect(second.weight).toBe(-7);
    });

  });

  // [T-332 S2] audience_signals 幂等锚升级为 _v2(user, account, source, external_id)
  //   的核心回归:conflict target 必须与新索引列一致(不改会 ON CONFLICT 不命中直接报错);
  //   两个号采同一评论各归其号,同号重复采仍去重。
  describe("createSignal — external_id 幂等锚账号维度 (_v2, T-332 S2)", () => {
    const sigInput = {
      source: "comment",
      rawText: "同一条评论",
      demandTag: null,
      payingIntent: null,
      linkedCandidateId: null,
      ingestionRunId: "run-1",
      externalId: "douyin:comment:c-777",
    };

    it("两个号采同一 external_id → 各自成行;同号重复采 → 命中锚返回本号原行", async () => {
      const repo1 = repoFor(db, "user-a", "acct-1");
      const repo2 = repoFor(db, "user-a", "acct-2");
      const r1 = await repo1.createSignal(sigInput);
      expect(r1.inserted).toBe(true);
      // 号2 同 external_id → 新行(旧 user 级唯一键下这里会被号1 的行吞掉)。
      const r2 = await repo2.createSignal({ ...sigInput, rawText: "号2采集" });
      expect(r2.inserted).toBe(true);
      expect(r2.row.id).not.toBe(r1.row.id);
      expect(r2.row.accountId).toBe("acct-2");
      // 号1 重复采 → 幂等命中,回读的是号1 自己的行(不是号2 的)。
      const r1again = await repo1.createSignal(sigInput);
      expect(r1again.inserted).toBe(false);
      expect(r1again.row.id).toBe(r1.row.id);
      expect(r1again.row.accountId).toBe("acct-1");
      // 各号列表各见一条。
      expect((await repo1.listSignals({})).total).toBe(1);
      expect((await repo2.listSignals({})).total).toBe(1);
    });
  });
});
