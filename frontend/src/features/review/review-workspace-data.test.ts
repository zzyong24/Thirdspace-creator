import { describe, it, expect } from "vitest";
import {
  buildReviewWorkspaceViewModel,
  fetchReviewComments,
  type ReviewDataClient,
} from "./review-workspace-data";
import type { MetricSnapshotDto } from "./analytics-review-view-model";

// T-042 评论热榜排序:fetchReviewComments 跨作品合并后必须按点赞数(热榜)降序,
// 同赞数按 created_at 降序兜底,null 点赞(存量 0014 前采集)沉榜尾,封顶前 100 条。

// 两个作品的评论(点赞数交错),用来验「合并后全局热榜序」而非「按作品分段」。
const COMMENTS: Record<string, ReadonlyArray<Record<string, unknown>>> = {
  "pub-A": [
    { id: "a1", rawText: "A 最热", demandTag: null, likeCount: 300, createdAt: "2026-06-30T02:00:00.000Z" },
    { id: "a2", rawText: "A 冷门", demandTag: null, likeCount: 5, createdAt: "2026-06-30T01:00:00.000Z" },
  ],
  "pub-B": [
    { id: "b1", rawText: "B 中等", demandTag: null, likeCount: 100, createdAt: "2026-06-30T03:00:00.000Z" },
    { id: "b2", rawText: "B 无点赞(存量)", demandTag: null, likeCount: null, createdAt: "2026-06-30T09:00:00.000Z" },
  ],
};

function fakeClient(): ReviewDataClient {
  return {
    async listPublicationComments(input: { params: { publicationId: string } }) {
      return COMMENTS[input.params.publicationId] ?? [];
    },
  } as unknown as ReviewDataClient;
}

// 只需 publicationId 字段驱动 publicationIdsFromSnapshots;其余 snapshot 形状本测不关心。
function snap(publicationId: string): MetricSnapshotDto {
  return { publicationId } as unknown as MetricSnapshotDto;
}

describe("fetchReviewComments — 热榜排序 (T-042)", () => {
  it("跨作品合并后按点赞降序(热榜),null 点赞沉榜尾", async () => {
    const rows = await fetchReviewComments(fakeClient(), [
      snap("pub-A"),
      snap("pub-B"),
    ]);
    // 全局热榜序:a1(300) > b1(100) > a2(5) > b2(null=-1),不是按作品分段(A 全部再 B 全部)。
    expect(rows.map((r) => r.id)).toEqual(["a1", "b1", "a2", "b2"]);
    expect(rows[0].likeCount).toBe(300);
    // null 点赞映射为 null(不伪造 0),且排最后。
    expect(rows[rows.length - 1].id).toBe("b2");
    expect(rows[rows.length - 1].likeCount).toBeNull();
    // 文本/需求标签照常投影。
    expect(rows[0].text).toBe("A 最热");
  });

  it("无作品快照 → 空数组(诚实空态,不请求)", async () => {
    const rows = await fetchReviewComments(fakeClient(), []);
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// [T-116c] AI 分析卡 = 真·本期专属:读本条视频最近一次 review.analyze 结果,
// 不再挂全站 learnings;无结果 → 诚实空态(空 aiAnalysis)。
// ---------------------------------------------------------------------------

const REAL_PROJECT = "project-real-xyz"; // 非 canonical fixture → 空快照走诚实空指标

/** 只装配 T-116c 读路径需要的方法(其余读端口缺省 → 各区诚实空/降级)。 */
function reviewInsightsClient(opts: {
  tasks: ReadonlyArray<{
    id: string;
    taskType: string;
    projectId: string | null;
    status: string;
    requestedAt: string;
  }>;
  resultsByTask: Record<
    string,
    ReadonlyArray<{ resultType: string; resultData: Record<string, unknown> }>
  >;
  /** 断言服务端窄化过滤真被下推(projectId + taskType)。 */
  onListTasksQuery?: (q: { projectId?: string; taskType?: string }) => void;
}): ReviewDataClient {
  return {
    async getProjectAnalytics() {
      return []; // 空快照 → 指标区诚实空(与本测无关)
    },
    async listAITasks(input: {
      query: { projectId?: string; taskType?: string };
    }) {
      opts.onListTasksQuery?.({
        projectId: input.query.projectId,
        taskType: input.query.taskType,
      });
      // 模拟服务端 additive 过滤:只回命中 projectId + taskType 的任务。
      return opts.tasks.filter(
        (t) =>
          (!input.query.projectId || t.projectId === input.query.projectId) &&
          (!input.query.taskType || t.taskType === input.query.taskType),
      );
    },
    async listTaskResults(input: { params: { taskId: string } }) {
      return opts.resultsByTask[input.params.taskId] ?? [];
    },
  } as unknown as ReviewDataClient;
}

describe("AI 分析卡真本期 (T-116c)", () => {
  it("读本条视频最近一次 review.analyze 的 learning_list → aiAnalysis 要点", async () => {
    let captured: { projectId?: string; taskType?: string } | null = null;
    const client = reviewInsightsClient({
      tasks: [
        // 最近一条(requestedAt 最大),有结果 → 取它。
        {
          id: "t-new",
          taskType: "review.analyze",
          projectId: REAL_PROJECT,
          status: "awaiting_confirmation",
          requestedAt: "2026-07-04T10:00:00.000Z",
        },
        // 更早一条也有结果,但不应被取(更新的在前)。
        {
          id: "t-old",
          taskType: "review.analyze",
          projectId: REAL_PROJECT,
          status: "succeeded",
          requestedAt: "2026-07-01T10:00:00.000Z",
        },
      ],
      resultsByTask: {
        "t-new": [
          {
            resultType: "learning_list",
            resultData: {
              items: [
                { title: "开头钩子扎实", insight: "前 3 秒抛冲突,完播率高" },
                { title: "", insight: "空标题应被过滤" },
                { title: "结尾 CTA 明确", insight: "" },
              ],
            },
          },
        ],
        "t-old": [
          {
            resultType: "learning_list",
            resultData: { items: [{ title: "旧要点", insight: "不该出现" }] },
          },
        ],
      },
      onListTasksQuery: (q) => {
        captured = q;
      },
    });

    const vm = await buildReviewWorkspaceViewModel(REAL_PROJECT, client);
    // 服务端窄化过滤真被下推(projectId + taskType)。
    expect(captured).toEqual({
      projectId: REAL_PROJECT,
      taskType: "review.analyze",
    });
    // 取最近一条(t-new)的要点;空标题项被过滤;空 insight 保留但 body 为空。
    expect(vm.aiAnalysis.map((a) => a.title)).toEqual([
      "开头钩子扎实",
      "结尾 CTA 明确",
    ]);
    expect(vm.aiAnalysis[0].body).toContain("前 3 秒");
    // id 带任务与序号锚,唯一。
    expect(new Set(vm.aiAnalysis.map((a) => a.id)).size).toBe(
      vm.aiAnalysis.length,
    );
  });

  it("本项目没有 review.analyze 结果 → aiAnalysis 空(诚实空态,不回退全站)", async () => {
    const client = reviewInsightsClient({
      tasks: [], // 本项目零复盘分析任务
      resultsByTask: {},
    });
    const vm = await buildReviewWorkspaceViewModel(REAL_PROJECT, client);
    expect(vm.aiAnalysis).toEqual([]);
  });

  it("有任务但无 learning_list 结果(排队/失败)→ aiAnalysis 空", async () => {
    const client = reviewInsightsClient({
      tasks: [
        {
          id: "t-queued",
          taskType: "review.analyze",
          projectId: REAL_PROJECT,
          status: "queued",
          requestedAt: "2026-07-04T10:00:00.000Z",
        },
      ],
      resultsByTask: { "t-queued": [] },
    });
    const vm = await buildReviewWorkspaceViewModel(REAL_PROJECT, client);
    expect(vm.aiAnalysis).toEqual([]);
  });

  it("旧 client 无 task 读方法 → aiAnalysis 空(降级不炸)", async () => {
    const legacy = {
      async getProjectAnalytics() {
        return [];
      },
    } as unknown as ReviewDataClient;
    const vm = await buildReviewWorkspaceViewModel(REAL_PROJECT, legacy);
    expect(vm.aiAnalysis).toEqual([]);
  });
});
