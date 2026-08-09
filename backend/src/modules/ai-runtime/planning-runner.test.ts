import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";

// 论点树 runner 迁 runStructuredNode(T-025 跨模型健壮)后:mock ai-worker 的 runStructuredNode
// (动态 import 的目标),它返回 { object }(已被 outputSchema 校验的结构化对象)。runner 解析 model
// (resolveModelSpec)→ runStructuredNode 拿 object → normalizeThesisTree + recordCandidate。
// 这里把 runStructuredNode 打桩成返回固定 object,验证:capability 被正确解析、候选被记录、
// 归一逻辑(论点树 nodes)仍按约定产出。
const runStructuredNode = vi.fn(async () => ({ object: {} }));
// T-025 mock:桩住 model/结构化节点/getTemplate;[T-269] buildGroundingHaystack /
// annotateUngroundedClaims 用**真实**实现(纯叶子,importActual 取)——让「可溯后处理」在 runner
// 里真跑,单测能断言未溯源标注真被追加。
vi.mock("@creatoros/ai-worker", async () => {
  const actual = await vi.importActual<typeof import("@creatoros/ai-worker")>(
    "@creatoros/ai-worker",
  );
  return {
    modelFor: vi.fn(() => ({}) as never),
    runStructuredNode,
    // T-040b:runner 改运行时 getTemplate(id) 取被覆盖后的 REGISTRY 对象;mock 回传带该 id 的对象。
    getTemplate: (id: string) => ({ id }),
    buildGroundingHaystack: actual.buildGroundingHaystack,
    annotateUngroundedClaims: actual.annotateUngroundedClaims,
  };
});

import { runPlanningThesis } from "./planning-runner";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

function makeDeps(treeObject: Record<string, unknown>) {
  runStructuredNode.mockResolvedValue({ object: treeObject } as never);
  const recordCandidate = vi.fn(
    async (
      _ctx: RequestContext,
      _taskId: string,
      _input: {
        resultType: string;
        artifactId?: string | null;
        resultData: Record<string, unknown>;
      },
    ) => undefined,
  );
  const resolveModelSpec = vi.fn(async () => ({
    apiFormat: "anthropic" as const,
    baseUrl: null,
    model: "claude-opus-4-8",
    token: "k",
  }));
  return {
    deps: {
      ai: {
        markRunning: vi.fn(async () => undefined),
        recordCandidate,
        recordStep: vi.fn(async () => undefined),
        cancelTask: vi.fn(async () => undefined),
      } as never,
      // assembleCreativeContext reads getPositioningCenter (the PositioningReader port)
      // and getSuggestions (the LearningsReader port); both are wrapped in try/catch and
      // degrade to "" — these stubs return the real shapes so context assembles cleanly.
      positioning: {
        getPositioningCenter: async () => ({
          profile: null,
          currentStatement: null,
        }),
      } as never,
      learnings: { getSuggestions: async () => [] } as never,
      resolveModelSpec,
    },
    recordCandidate,
    resolveModelSpec,
  };
}

describe("runPlanningThesis (runStructuredNode + 外置模板)", () => {
  it("resolves the planning.thesis capability and records an artifact_version candidate", async () => {
    // 结构化对象(已被 outputSchema 校验):核心论点 + 一个支撑分支。
    const tree = {
      core: { title: "核心", summary: "展开" },
      branches: [{ column: "support", title: "s", summary: "x" }],
    };
    const { deps, recordCandidate, resolveModelSpec } = makeDeps(tree);
    await runPlanningThesis(
      ctx,
      { id: "t1", projectId: "p1", inputData: {} },
      deps,
    );
    expect(resolveModelSpec).toHaveBeenCalledWith(ctx, "planning.thesis");
    expect(runStructuredNode).toHaveBeenCalledTimes(1);
    expect(recordCandidate).toHaveBeenCalledTimes(1);
    const input = recordCandidate.mock.calls[0]![2];
    expect(input.resultType).toBe("artifact_version");
    expect(input.artifactId).toBeNull();
    // contentData.nodes carries the core + branch nodes (writer↔reader contract).
    const nodes = (input.resultData.contentData as { nodes: unknown[] }).nodes;
    expect(Array.isArray(nodes)).toBe(true);
    expect(nodes.length).toBe(2);
  });

  // [T-269/T-270] 接地根:论点树生成链此前只注 positioning+learnings+topic(无 brief、无素材)。
  it("装配 brief + projectMaterials reader → thesisFacets 注入 projectBriefHard + 用户素材", async () => {
    const tree = {
      core: { title: "核心", summary: "展开" },
      branches: [{ column: "support", title: "s", summary: "x" }],
    };
    const { deps } = makeDeps(tree);
    // 补 brief reader(扩投影全字段)+ projectMaterials reader(高优先用户素材)。
    (deps as Record<string, unknown>).brief = {
      getBriefDetail: async () => ({
        coreMessage: "纪律是最后护城河",
        contentGoal: "避免做成工具分享",
      }),
    };
    (deps as Record<string, unknown>).projectMaterials = {
      listProjectMaterials: async () => [
        {
          name: "设计文档",
          priority: "high" as const,
          materialSummary: { keyPoints: ["18 阶段设计流程"], facts: [] },
        },
      ],
    };
    await runPlanningThesis(
      ctx,
      { id: "t1", projectId: "p1", inputData: { artifactId: "a1" } },
      deps,
    );
    // runStructuredNode 是 module-level 共享 mock,calls 跨 test 累积 → 取**最后一次**调用。
    // vi.fn 声明无入参类型(calls 元素被推成空元组),故显式 cast 取第 0 个入参的 facets。
    const lastCall = runStructuredNode.mock.calls.at(-1) as unknown as [
      { facets: Record<string, string | undefined> },
    ];
    const facets = lastCall[0].facets;
    // 立项硬锚(钦定核心信息 + 避免X 负向约束)进 facets。
    expect(facets.projectBriefHard).toContain("纪律是最后护城河");
    expect(facets.projectBriefHard).toContain("避免做成工具分享");
    // 用户素材(论点/证据的可溯弹药)进 facets。
    expect(facets.userMaterialHard).toContain("18 阶段设计流程");
  });

  it("[T-269] 可溯后处理:证据分支含不可溯数字 → summary 追加未溯源标注(原文保留)", async () => {
    // 模型吐了一个语料里没有的具体计数(「22 个 AI」),校验后应被标注。
    const tree = {
      core: { title: "反共识主张", summary: "纪律比工具重要" },
      branches: [
        {
          column: "evidence",
          title: "证据",
          summary: "脚手架里有 22 个 AI 智能体互相盯着写代码",
        },
      ],
    };
    const { deps, recordCandidate } = makeDeps(tree);
    await runPlanningThesis(
      ctx,
      { id: "t1", projectId: "p1", inputData: { artifactId: "a1" } },
      deps,
    );
    const input = recordCandidate.mock.calls[0]![2];
    const nodes = (input.resultData.contentData as {
      nodes: Array<{ column: string; summary: string }>;
    }).nodes;
    const evidence = nodes.find((n) => n.column === "evidence")!;
    expect(evidence.summary).toContain("22 个 AI 智能体"); // 原文不删
    expect(evidence.summary).toContain("未溯源"); // 追加标注
  });

  it("忽略客户端传入的旧 artifactId，候选始终交给确认 UoW 解析", async () => {
    const { deps, recordCandidate } = makeDeps({
      core: { title: "核心", summary: "展开" },
      branches: [],
    });
    await runPlanningThesis(
      ctx,
      { id: "t-artifact", projectId: "p1", inputData: { artifactId: "forged" } },
      deps,
    );

    const input = recordCandidate.mock.calls[0]![2];
    expect(input.artifactId).toBeNull();
    expect(input.resultType).toBe("artifact_version");
  });

  it("不再读取 projectAmmo 做词面预挂，候选节点保持无素材引用", async () => {
    const { deps, recordCandidate } = makeDeps({
      core: { title: "核心", summary: "展开" },
      branches: [{ column: "evidence", title: "证据", summary: "说明" }],
    });
    const list = vi.fn(async () => {
      throw new Error("不应读取");
    });
    (deps as Record<string, unknown>).projectAmmo = { list };

    await runPlanningThesis(
      ctx,
      { id: "t-no-ammo", projectId: "p1", inputData: {} },
      deps,
    );

    const nodes = (recordCandidate.mock.calls[0]![2].resultData.contentData as {
      nodes: Array<Record<string, unknown>>;
    }).nodes;
    expect(list).not.toHaveBeenCalled();
    expect(recordCandidate).toHaveBeenCalledTimes(1);
    expect(nodes.every((node) => !("materialRefs" in node))).toBe(true);
  });

  it("模型输出夹带 materialRefs 时也不会进入受信候选", async () => {
    const { deps, recordCandidate } = makeDeps({
      core: { title: "核心", summary: "展开", materialRefs: [{ id: "x" }] },
      branches: [
        {
          column: "support",
          title: "支撑",
          summary: "说明",
          materialRefs: [{ id: "y" }],
        },
      ],
    });
    await runPlanningThesis(
      ctx,
      { id: "t-untrusted-ref", projectId: "p1", inputData: {} },
      deps,
    );

    const nodes = (recordCandidate.mock.calls[0]![2].resultData.contentData as {
      nodes: Array<Record<string, unknown>>;
    }).nodes;
    expect(nodes).toHaveLength(2);
    expect(nodes.every((node) => !("materialRefs" in node))).toBe(true);
  });

  it("把中文列名归一成固定四栏契约", async () => {
    const { deps, recordCandidate } = makeDeps({
      core: { title: "核心", summary: "展开" },
      branches: [
        { column: "支持依据", title: "支撑", summary: "一" },
        { column: "证据", title: "证据", summary: "二" },
        { column: "反驳", title: "反驳", summary: "三" },
      ],
    });
    await runPlanningThesis(
      ctx,
      { id: "t-columns", projectId: "p1", inputData: {} },
      deps,
    );

    const nodes = (recordCandidate.mock.calls[0]![2].resultData.contentData as {
      nodes: Array<{ column: string }>;
    }).nodes;
    expect(nodes).toHaveLength(4);
    expect(nodes.map((node) => node.column)).toEqual([
      "core",
      "support",
      "evidence",
      "counter",
    ]);
  });

  it("过滤未知列名，但保留同批合法节点", async () => {
    const { deps, recordCandidate } = makeDeps({
      core: { title: "核心", summary: "展开" },
      branches: [
        { column: "sales_pitch", title: "越权列", summary: "不进入候选" },
        { column: "support", title: "合法支撑", summary: "保留" },
      ],
    });
    await runPlanningThesis(
      ctx,
      { id: "t-filter", projectId: "p1", inputData: {} },
      deps,
    );

    const nodes = (recordCandidate.mock.calls[0]![2].resultData.contentData as {
      nodes: Array<{ column: string; title: string }>;
    }).nodes;
    expect(recordCandidate).toHaveBeenCalledTimes(1);
    expect(nodes.map((node) => node.column)).toEqual(["core", "support"]);
    expect(nodes.some((node) => node.title === "越权列")).toBe(false);
  });

  it("裁掉空白节点并规范化标题与摘要空白", async () => {
    const { deps, recordCandidate } = makeDeps({
      core: { title: "  核心  ", summary: "  展开  " },
      branches: [
        { column: "support", title: "  支撑  ", summary: "  说明  " },
        { column: "evidence", title: "  ", summary: "  " },
      ],
    });
    await runPlanningThesis(
      ctx,
      { id: "t-trim", projectId: "p1", inputData: {} },
      deps,
    );

    const nodes = (recordCandidate.mock.calls[0]![2].resultData.contentData as {
      nodes: Array<{ title: string; summary: string }>;
    }).nodes;
    expect(nodes).toHaveLength(2);
    expect(nodes.map((node) => node.title)).toEqual(["核心", "支撑"]);
    expect(nodes.map((node) => node.summary)).toEqual(["展开", "说明"]);
  });

  it("缺 projectId 时在调用模型前失败关闭并取消任务", async () => {
    const { deps, recordCandidate } = makeDeps({
      core: { title: "不应生成", summary: "" },
      branches: [],
    });
    const cancelTask = vi.fn(async () => undefined);
    (deps.ai as { cancelTask: unknown }).cancelTask = cancelTask;
    const modelCallsBefore = runStructuredNode.mock.calls.length;

    await runPlanningThesis(
      ctx,
      { id: "t-no-project", projectId: null, inputData: {} },
      deps,
    );

    expect(runStructuredNode.mock.calls).toHaveLength(modelCallsBefore);
    expect(recordCandidate).not.toHaveBeenCalled();
    expect(cancelTask).toHaveBeenCalledTimes(1);
  });

  it("cancels the task (no candidate) when the object normalizes to no nodes", async () => {
    // 合法但空的结构化对象 → normalizeThesisTree 产 0 节点 → guard 触发 → cancelTask。
    const { deps, recordCandidate } = makeDeps({
      core: { title: "", summary: "" },
      branches: [],
    });
    const cancelTask = vi.fn(async () => undefined);
    (deps.ai as { cancelTask: unknown }).cancelTask = cancelTask;
    await runPlanningThesis(
      ctx,
      { id: "t1", projectId: "p1", inputData: { artifactId: "a1" } },
      deps,
    );
    expect(recordCandidate).not.toHaveBeenCalled();
    expect(cancelTask).toHaveBeenCalledTimes(1);
  });
});
