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

import {
  runPlanningThesis,
  scoreAmmoMatch,
  matchAmmoForNode,
  prefillMaterialRefs,
  AMMO_MATCH_MAX_REFS,
} from "./planning-runner";

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
      { id: "t1", projectId: "p1", inputData: { artifactId: "a1" } },
      deps,
    );
    expect(resolveModelSpec).toHaveBeenCalledWith(ctx, "planning.thesis");
    expect(runStructuredNode).toHaveBeenCalledTimes(1);
    expect(recordCandidate).toHaveBeenCalledTimes(1);
    const input = recordCandidate.mock.calls[0]![2];
    expect(input.resultType).toBe("artifact_version");
    expect(input.artifactId).toBe("a1");
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

  // ── [T-387a] AI 预挂素材(确定性词面匹配,纯函数 + runner 集成)────────────────

  describe("[T-387a] scoreAmmoMatch / matchAmmoForNode(确定性词面匹配)", () => {
    it("词面高度重合的弹药得高分,不相关的低分", () => {
      const hi = scoreAmmoMatch(
        "上下文工程是 AI 编程的核心方法",
        "上下文工程实战笔记",
      );
      const lo = scoreAmmoMatch("上下文工程是 AI 编程的核心方法", "猫粮测评");
      expect(hi).toBeGreaterThan(lo);
      expect(lo).toBeLessThan(0.28);
    });

    it("弹药标题整体出现在节点文本 → 子串加成(强信号)", () => {
      const s = scoreAmmoMatch(
        "根据 产品发布会实录 里的现场数据可以证明这一点",
        "产品发布会实录",
      );
      expect(s).toBeGreaterThanOrEqual(0.9);
    });

    it("匹配纯函数:高于阈值才挂、最多挂 2 条、标 source:'ai'(宁缺勿滥)", () => {
      const ammo = [
        { id: "k1", title: "上下文工程实战笔记", kind: "knowledge" },
        { id: "a1", title: "上下文工程演示录屏", kind: "video" },
        { id: "a2", title: "上下文工程速查图", kind: "image" },
        { id: "x1", title: "猫粮测评", kind: "knowledge" },
      ];
      const refs = matchAmmoForNode(
        { title: "上下文工程", summary: "上下文工程决定 AI 输出质量" },
        ammo,
      );
      expect(refs.length).toBeLessThanOrEqual(AMMO_MATCH_MAX_REFS);
      expect(refs.length).toBeGreaterThan(0);
      for (const r of refs) {
        expect(r.source).toBe("ai");
        expect(["k1", "a1", "a2"]).toContain(r.id); // 绝不挂不相关的 x1
      }
      // 完全不相关的节点 → 一条不挂(诚实缺)。
      expect(
        matchAmmoForNode({ title: "早餐吃什么", summary: "" }, ammo),
      ).toEqual([]);
    });

    it("prefillMaterialRefs:只给 support/evidence 挂;core/counter 与未匹配节点原样", () => {
      const nodes = [
        { column: "core" as const, title: "上下文工程", summary: "核心" },
        { column: "support" as const, title: "上下文工程有效", summary: "" },
        { column: "counter" as const, title: "上下文工程无用论", summary: "" },
        { column: "evidence" as const, title: "早餐吃什么", summary: "" },
      ];
      const ammo = [{ id: "k1", title: "上下文工程实战笔记", kind: "knowledge" }];
      const out = prefillMaterialRefs(nodes, ammo);
      expect(out[0]!.materialRefs).toBeUndefined(); // core 不参与
      expect(out[1]!.materialRefs?.[0]).toMatchObject({ id: "k1", source: "ai" });
      expect(out[2]!.materialRefs).toBeUndefined(); // counter 不参与
      expect(out[3]!.materialRefs).toBeUndefined(); // 匹配不到 → 不带字段(诚实缺)
    });
  });

  it("[T-387a] runner 预挂:装配 projectAmmo → 候选 contentData.nodes 带 source:'ai' 的 materialRefs", async () => {
    const tree = {
      core: { title: "核心", summary: "展开" },
      branches: [
        { column: "evidence", title: "上下文工程实战数据", summary: "" },
      ],
    };
    const { deps, recordCandidate } = makeDeps(tree);
    (deps as Record<string, unknown>).projectAmmo = {
      list: async () => [
        { id: "k1", title: "上下文工程实战笔记", kind: "knowledge" },
        { id: "x1", title: "猫粮测评", kind: "knowledge" },
      ],
    };
    await runPlanningThesis(
      ctx,
      { id: "t1", projectId: "p1", inputData: { artifactId: "a1" } },
      deps,
    );
    const input = recordCandidate.mock.calls[0]![2];
    const nodes = (input.resultData.contentData as {
      nodes: Array<{
        column: string;
        materialRefs?: Array<{ id: string; source?: string }>;
      }>;
    }).nodes;
    const evidence = nodes.find((n) => n.column === "evidence")!;
    expect(evidence.materialRefs?.length).toBeGreaterThan(0);
    expect(evidence.materialRefs![0]).toMatchObject({ id: "k1", source: "ai" });
    // 只引用真实存在的弹药 —— 不相关的 x1 绝不被挂。
    expect(evidence.materialRefs!.every((r) => r.id !== "x1")).toBe(true);
  });

  it("[T-387a] projectAmmo 读失败 → 不预挂、候选照常落(零回归)", async () => {
    const tree = {
      core: { title: "核心", summary: "展开" },
      branches: [{ column: "support", title: "s", summary: "x" }],
    };
    const { deps, recordCandidate } = makeDeps(tree);
    (deps as Record<string, unknown>).projectAmmo = {
      list: async () => {
        throw new Error("boom");
      },
    };
    await runPlanningThesis(
      ctx,
      { id: "t1", projectId: "p1", inputData: { artifactId: "a1" } },
      deps,
    );
    expect(recordCandidate).toHaveBeenCalledTimes(1);
    const input = recordCandidate.mock.calls[0]![2];
    const nodes = (input.resultData.contentData as {
      nodes: Array<{ materialRefs?: unknown }>;
    }).nodes;
    expect(nodes.every((n) => n.materialRefs === undefined)).toBe(true);
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
