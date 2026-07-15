import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createAiService, type AiArtifactsPort } from "./ai.service";
import { createLearningsService } from "../learnings/learnings.service";

// [T-118a gate-F3] 闭环坐实(硬验收):对某 project 触发 review.analyze(打桩 recordCandidate
// 返固定 learnings)→ confirmTask 采纳 → learnings.list(projectId=X, validationStatus=candidate)
// 能非空读出。这里把 AI 服务的 learnings 端口接到 REAL learnings 服务(同一 db),不 mock —— 只有
// 真接线才能证明 project-scoped 读的前提(采纳带 projectId 写进 learning 行)真正落地。

const NOW = "2026-07-04T00:00:00.000Z";
const ctx: RequestContext = { userId: "user-a", requestId: "r1", source: "user", accountId: "acct-a" }; // [T-332 S2] strict 门下 ctx 必带号

function compose(db: Db) {
  let seq = 0;
  const deps = {
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
  };
  // REAL learnings 服务(projects 端口打桩为放行 —— 本测不写 application,只写/读 learning)。
  const learningsService = createLearningsService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    projects: {
      assertOwnsProject: async () => {},
      recordActivity: async () => {},
    },
  });
  const artifacts: AiArtifactsPort = {
    createVersion: async () => ({}),
  };
  const aiService = createAiService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    artifacts,
    knowledge: { createKnowledge: async () => ({ id: "k" }) },
    candidate: {
      createFromAIResult: async () => ({ id: "c" }),
      enrichCard: async () => ({ id: "c" }),
    },
    // 关键:AI 的 learnings 端口 = REAL learnings 服务(同一 db)。projectId 透传。
    learnings: {
      createLearning: (c, body) => learningsService.createLearning(c, body),
    },
    publishing: { createPublicationFromDraft: async () => ({ id: "p" }) },
    materialLinks: { link: async () => ({ id: "ml" }) },
    positioning: {
      upsertProfile: async () => ({ id: "pr" }),
      createStatementVersion: async () => ({ id: "st" }),
    },
    calibration: { createDraftPrediction: async () => ({ id: "pd" }) },
  });
  return { aiService, learningsService };
}

describe("[T-118a gate-F3] review.analyze → confirm → project-scoped candidate read", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("confirmed review.analyze learnings are readable by learnings.list(projectId, candidate)", async () => {
    const { aiService, learningsService } = compose(db);
    const PROJECT = "project-abc";

    // 1. 对 PROJECT 触发 review.analyze 任务(inputData 带 projectId,createTask 会提取它)。
    const task = await aiService.createTask(ctx, {
      taskType: "review.analyze",
      inputData: { projectId: PROJECT },
    });
    // 2. 打桩 runStructuredNode 的产物 —— review.analyze runner 会 recordCandidate 固定 learnings。
    await aiService.recordCandidate(ctx, task.id, {
      resultType: "learning_list",
      resultData: {
        items: [
          { title: "前3秒抛数字", insight: "可量化收益提升完播" },
          { title: "争议钩子", insight: "" },
        ],
      },
    });
    // 3. 采纳(confirm)→ 物化成 candidate learnings(带 PROJECT)。
    const done = await aiService.confirmTask(ctx, task.id);
    expect(done.status).toBe("succeeded");

    // 4. 硬验收:learnings.list(projectId=PROJECT, validationStatus=candidate) 非空读出。
    const scoped = await learningsService.listLearnings(
      ctx,
      { limit: 50, offset: 0 },
      { projectId: PROJECT, validationStatus: "candidate" },
    );
    expect(scoped.total).toBe(2);
    expect(scoped.rows.map((r) => r.title).sort()).toEqual(
      ["争议钩子", "前3秒抛数字"].sort(),
    );
    // 每条真带 projectId + candidate 状态(DTO 已投影 projectId)。
    for (const row of scoped.rows) {
      expect(row.projectId).toBe(PROJECT);
      expect(row.validationStatus).toBe("candidate");
    }

    // 5. 反证隔离:另一个项目的 project-scoped 读为空(不误读到本项目的候选)。
    const other = await learningsService.listLearnings(
      ctx,
      { limit: 50, offset: 0 },
      { projectId: "project-other", validationStatus: "candidate" },
    );
    expect(other.total).toBe(0);
  });
});
