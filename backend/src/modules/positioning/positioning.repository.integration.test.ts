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

function repoFor(db: Db, userId: string, tag = userId): PositioningRepository {
  let seq = 0;
  return createPositioningRepository(db, {
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
    userId,
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
    const current = await repo.getCurrentStatement(profile.id);
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
});
