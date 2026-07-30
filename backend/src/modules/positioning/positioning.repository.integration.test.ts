import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  createPositioningRepository,
  type PositioningRepository,
} from "./positioning.repository";
import { OwnershipError } from "./positioning.errors";

// Positioning repository integration test (Tasks 1+2) — pglite-backed. Asserts the
// schema round-trips (Task 1: v1/v2 statements come back with distinct
// version_number + same profile_id, jsonb capabilities/keywords/product_anchor_ids
// survive) AND that every query is user-scoped (Task 2: user A cannot read/list
// user B's profile or statement → OwnershipError). Deterministic clock/ids (no
// Date.now / Math.random). The ALTER on projects (positioning_statement_id) ran in
// createDb after PROJECTS_DDL.

const NOW = "2026-06-21T00:00:00.000Z";

// 定位中心重建 — the facets / downstream-rules jsonb the repo now persists. Blank
// defaults keep the existing assertions focused; one test fills + round-trips them.
const BLANK_FACETS = {
  contentScope: "",
  avoid: "",
  corePain: "",
  coreValue: "",
  tone: "",
  statusNote: "",
};
const BLANK_RULES = {
  topicRule: "",
  scriptRule: "",
  projectRule: "",
  forbidRule: "",
  expressionRule: "",
};

// [T-332 S2] RepoDeps.accountId 已收成必填 string(strict 门):缺省固定测试号,
// 「null 全局视图」形态随 SPEC §4.2 裁决删除。
function repoFor(
  db: Db,
  userId: string,
  accountId = "acct-default",
  tag = accountId,
): PositioningRepository {
  let seq = 0;
  return createPositioningRepository(db, {
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
    userId,
    accountId,
  });
}

describe("positioning repository (integration, user-scoped)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("creator_profiles round-trips with jsonb capabilities + facets + downstream rules", async () => {
    const repo = repoFor(db, "user-a");
    const row = await repo.insertProfile({
      persona: "硬核科普创作者",
      field: "AI 工程",
      audience: "一线开发者",
      differentiation: "把论文落到可运行代码",
      capabilities: ["拆解论文", "代码演示", "工程化"],
      facets: {
        contentScope: "论文精读到工程落地",
        avoid: "纯理论推导",
        corePain: "看得懂论文却落不了地",
        coreValue: "今天就能 clone 跑通",
        tone: "硬核工程师口吻",
        statusNote: "稳定更新中",
      },
      downstreamRules: {
        topicRule: "只做能产出可运行代码的选题",
        scriptRule: "开头 15 秒抛可复现结果",
        projectRule: "每个项目绑定可演示代码产物",
        forbidRule: "不贴无法运行的截图",
        expressionRule: "统一工程师口吻不用营销腔",
      },
    });
    expect(row.userId).toBe("user-a");
    expect(row.field).toBe("AI 工程");
    expect(row.capabilities).toEqual(["拆解论文", "代码演示", "工程化"]);
    // 定位中心重建 — the two jsonb columns round-trip key-by-key from real SQL.
    expect((row.facets as { corePain: string }).corePain).toBe(
      "看得懂论文却落不了地",
    );
    expect((row.downstreamRules as { topicRule: string }).topicRule).toBe(
      "只做能产出可运行代码的选题",
    );
    expect(row.createdAt).toBe(NOW);
    expect(row.updatedAt).toBe(NOW);
  });

  it("positioning_statements v1/v2 round-trip with distinct version_number, same profile_id, jsonb arrays", async () => {
    const repo = repoFor(db, "user-a");
    const profile = await repo.insertProfile({
      persona: "p",
      field: "f",
      audience: "a",
      differentiation: "d",
      capabilities: [],
      facets: BLANK_FACETS,
      downstreamRules: BLANK_RULES,
    });
    const v1 = await repo.insertStatement({
      profileId: profile.id,
      oneLiner: "我帮一线开发者把 AI 论文变成可运行代码",
      keywords: ["论文", "代码", "工程化"],
      productAnchorIds: ["product-1"],
      versionNumber: 1,
      createdByType: "human",
      aiTaskId: null,
    });
    const v2 = await repo.insertStatement({
      profileId: profile.id,
      oneLiner: "我帮一线开发者把 AI 论文变成生产级代码",
      keywords: ["论文", "生产级", "工程化"],
      productAnchorIds: ["product-1", "product-2"],
      versionNumber: 2,
      createdByType: "ai",
      aiTaskId: "ai-task-1",
    });
    expect(v1.versionNumber).toBe(1);
    expect(v2.versionNumber).toBe(2);
    expect(v1.profileId).toBe(profile.id);
    expect(v2.profileId).toBe(profile.id);
    expect(v1.keywords).toEqual(["论文", "代码", "工程化"]);
    expect(v2.productAnchorIds).toEqual(["product-1", "product-2"]);
    expect(v2.createdByType).toBe("ai");
    expect(v2.aiTaskId).toBe("ai-task-1");

    // listStatements returns version-desc; current = max version.
    const { rows, total } = await repo.listStatements({ limit: 50, offset: 0 });
    expect(total).toBe(2);
    expect(rows[0]!.versionNumber).toBe(2);
    const current = await repo.getCurrentStatement(profile.id, 0);
    expect(current!.versionNumber).toBe(2);
    expect(await repo.maxVersionNumber(profile.id)).toBe(2);
  });

  it("is user-scoped: user A cannot read/list user B's profile or statement", async () => {
    const repoA = repoFor(db, "user-a");
    const repoB = repoFor(db, "user-b");
    const profileA = await repoA.insertProfile({
      persona: "A",
      field: "fa",
      audience: "aa",
      differentiation: "da",
      capabilities: [],
      facets: BLANK_FACETS,
      downstreamRules: BLANK_RULES,
    });
    const stmtA = await repoA.insertStatement({
      profileId: profileA.id,
      oneLiner: "A's statement",
      keywords: ["x", "y", "z"],
      productAnchorIds: [],
      versionNumber: 1,
      createdByType: "human",
      aiTaskId: null,
    });

    // B's profile read returns only B's (none yet → undefined).
    expect(await repoB.getProfile()).toBeUndefined();
    // B reading A's statement → OwnershipError (404, never reveals existence).
    await expect(repoB.getStatement(stmtA.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    // B's list excludes A's rows.
    const listB = await repoB.listStatements({ limit: 50, offset: 0 });
    expect(listB.total).toBe(0);
    // A still reads its own.
    expect((await repoA.getProfile())!.id).toBe(profileA.id);
    expect((await repoA.getStatement(stmtA.id)).id).toBe(stmtA.id);
  });

  // ── [T-136 切片 ④ · SPEC §C] 定位母版 per-account ─────────────────────────────
  const mkProfileInput = (persona: string) => ({
    persona,
    field: "f",
    audience: "a",
    differentiation: "d",
    capabilities: [] as string[],
    facets: BLANK_FACETS,
    downstreamRules: BLANK_RULES,
  });

  it("按号隔离:设当前号只见该号母版,不串到同 user 的别号", async () => {
    const repoAcc1 = repoFor(db, "user-a", "acc-1");
    const repoAcc2 = repoFor(db, "user-a", "acc-2");

    const p1 = await repoAcc1.insertProfile(mkProfileInput("科技号人设"));
    const p2 = await repoAcc2.insertProfile(mkProfileInput("美食号人设"));
    expect(p1.accountId).toBe("acc-1");
    expect(p2.accountId).toBe("acc-2");

    // 号 1 只见自己的母版,不见号 2。
    expect((await repoAcc1.getProfile())!.id).toBe(p1.id);
    expect((await repoAcc1.getProfile())!.persona).toBe("科技号人设");
    // 号 2 只见自己的母版。
    expect((await repoAcc2.getProfile())!.id).toBe(p2.id);
    expect((await repoAcc2.getProfile())!.persona).toBe("美食号人设");

    // 号 1 的 statement 归号 1;号 2 读不到(承 profile 的号)。
    const s1 = await repoAcc1.insertStatement({
      profileId: p1.id,
      oneLiner: "科技号一句话",
      keywords: ["a", "b", "c"],
      productAnchorIds: [],
      versionNumber: 1,
      createdByType: "human",
      aiTaskId: null,
    });
    expect(s1.accountId).toBe("acc-1");
    // 号 2 跨号读号 1 的 statement → OwnershipError（404，不泄存在）。
    await expect(repoAcc2.getStatement(s1.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    // 号 2 的 list 不含号 1 的 statement。
    expect((await repoAcc2.listStatements({ limit: 50, offset: 0 })).total).toBe(
      0,
    );
    // 号 1 的 list 只含自己那条。
    const l1 = await repoAcc1.listStatements({ limit: 50, offset: 0 });
    expect(l1.total).toBe(1);
    expect(l1.rows[0]!.id).toBe(s1.id);
  });

  it("建第二个号的 profile 不撞旧唯一约束（复合 UNIQUE(user_id, account_id) 生效）", async () => {
    const repoAcc1 = repoFor(db, "user-a", "acc-1");
    const repoAcc2 = repoFor(db, "user-a", "acc-2");
    // 同一 user 建两号各一套母版 —— 旧 UNIQUE(user_id) 下第二条会撞，复合唯一后 OK。
    await repoAcc1.insertProfile(mkProfileInput("号1"));
    await expect(
      repoAcc2.insertProfile(mkProfileInput("号2")),
    ).resolves.toMatchObject({ accountId: "acc-2" });
  });

  // [T-332 S2] 原「accountId=null 退化全局视图」用例随 SPEC §4.2 裁决删除:
  // strict 门下不存在无号读路径(未选号在 service 入口即 AccountRequiredError)。
  it("strict 门:别号 repo 读不到本号母版(getProfile 空,非全量兜底)", async () => {
    const repoAcc1 = repoFor(db, "user-a", "acc-1");
    await repoAcc1.insertProfile(mkProfileInput("号1母版"));
    const repoAcc2 = repoFor(db, "user-a", "acc-2");
    expect(await repoAcc2.getProfile()).toBeUndefined();
  });
});
