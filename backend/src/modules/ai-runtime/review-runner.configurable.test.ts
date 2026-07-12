import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { RequestContext } from "@creatoros/contract";

// T-040b「可配生效」证明测（挑 review.insights 作代表）——
// 目的:证明结构化 runner 改「运行时 getTemplate(id)」后,**真的读被服务端覆盖后的 REGISTRY 对象**,
// 而不是编译期 import 的模板快照。
//
// 手法(与既有 review-runner.test.ts 的「整模块 mock」不同):这里 **partial mock** ——保留 ai-worker
// 的真 registry(registerAllTemplates / overrideTemplatesFromConfig / getTemplate,同一 REGISTRY 单例),
// 只把 runStructuredNode 换成捕获桩(它记下 runner 装配时传进来的 template)。于是:
//   1) 先 overrideTemplatesFromConfig 把 review.insights 的 system 改掉(套进真 REGISTRY);
//   2) 跑 runReviewAnalyze,它内部 getTemplate("review.insights") 从真 REGISTRY 取被覆盖的对象;
//   3) 断言捕获桩收到的 template.system === 覆盖值 → 证 runner 吃到了服务端覆盖。
// 若 runner 仍持 import 快照(旧实现),这里断言必失败(拿到的是内置 system),故此测锁死回归方向。
// vi.mock 工厂被 hoist 到文件顶,不能引用普通顶层变量;用 vi.hoisted 把捕获桩一起提升。
const { capturedTemplates, runStructuredNode } = vi.hoisted(() => {
  const captured: Array<{ id: string; system?: string }> = [];
  const fn = vi.fn(
    async (input: { template: { id: string; system?: string } }) => {
      captured.push(input.template);
      // 返回一个能过 normalizeLearnings 的最小结构化对象(顶层 { learnings:[...] })。
      return { object: { learnings: [{ title: "占位经验", insight: "占位洞察" }] } };
    },
  );
  return { capturedTemplates: captured, runStructuredNode: fn };
});

vi.mock("@creatoros/ai-worker", async (importActual) => {
  // 保留真模块(真 registry:getTemplate / overrideTemplatesFromConfig 操作同一 REGISTRY 单例),
  // 只替换 runStructuredNode 为捕获桩 + modelFor 为无副作用桩。
  const actual = await importActual<typeof import("@creatoros/ai-worker")>();
  return {
    ...actual,
    modelFor: vi.fn(() => ({}) as never),
    runStructuredNode,
  };
});

import {
  registerAllTemplates,
  overrideTemplatesFromConfig,
  getTemplate,
  _resetRegistry,
} from "@creatoros/ai-worker";
import { runReviewAnalyze } from "./review-runner";
import type { CreativeContext } from "./creative-context";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

const EMPTY_CONTEXT: CreativeContext = {
  positioningBrief: "",
  learningsBrief: "",
  assetsBrief: "",
  userMaterialHardBrief: "",
  userMaterialRefBrief: "",
  userMaterialQueryTerms: [],
  accountsBrief: "",
  signalsBrief: "",
  knowledgeBrief: "",
  thesisBrief: "",
  contractBrief: "",
  outlineBrief: "",
  orientationHint: "",
  projectBriefHard: "",
  reviewTitle: "",
  reviewScript: "",
  reviewMetrics: "",
  reviewComments: "",
  topic: { title: "", angle: "" },
  projectId: null,
};

// review-runner 内部走 assembleCreativeContext(ctx, {...}, deps)。为让本测聚焦「模板取值来源」,
// 把装配器桩成恒空 context(与模板覆盖正交,不引入真 reader 噪声),这样 makeDeps 只需给
// review-runner 真正用到的 ai + resolveModelSpec(assembleCreativeContext 走桩,忽略其它 reader)。
vi.mock("./creative-context", async (importActual) => {
  const actual = await importActual<typeof import("./creative-context")>();
  return {
    ...actual,
    assembleCreativeContext: vi.fn(async () => EMPTY_CONTEXT),
  };
});

function makeDeps() {
  const resolveModelSpec = vi.fn(async () => ({
    apiFormat: "anthropic" as const,
    baseUrl: null,
    model: "claude-test",
    token: "k",
  }));
  return {
    ai: {
      markRunning: vi.fn(async () => undefined),
      recordCandidate: vi.fn(async () => undefined),
      recordStep: vi.fn(async () => undefined),
      cancelTask: vi.fn(async () => undefined),
    } as never,
    positioning: {
      getPositioningCenter: async () => ({ profile: null, currentStatement: null }),
    } as never,
    learnings: { getSuggestions: async () => [] } as never,
    resolveModelSpec,
  };
}

describe("review-runner 可配生效(T-040b:runner 读被 override 覆盖后的 REGISTRY,非 import 快照)", () => {
  beforeEach(() => {
    capturedTemplates.length = 0;
    runStructuredNode.mockClear();
    // 每例前重置 registry 到内置(清掉上一例的 override),保证隔离。
    _resetRegistry();
    registerAllTemplates();
  });

  afterEach(() => {
    _resetRegistry();
    registerAllTemplates();
  });

  it("回归:无 override 时,runner 装配用的是内置 review.insights(getTemplate(id)===内置对象)", async () => {
    const builtin = getTemplate("review.insights");
    await runReviewAnalyze(
      ctx,
      { id: "t1", projectId: "p1", inputData: { topic: "复盘对象" } },
      makeDeps(),
    );
    expect(runStructuredNode).toHaveBeenCalledTimes(1);
    const used = capturedTemplates[0]!;
    // runner 传进结构化节点的 template 就是 REGISTRY 里的内置对象(system 未被改)。
    expect(used.id).toBe("review.insights");
    expect(used.system).toBe(builtin.system);
  });

  it("可配生效:overrideTemplatesFromConfig 改 review.insights.system → runner 装配用覆盖后 system", async () => {
    const OVERRIDDEN_SYSTEM = "【服务端覆盖】你现在是一个改过提示词的复盘专家。";
    // 服务端下发覆盖(套进真 REGISTRY;与 T-040a applySkillConfigOverridesFromDb 同一条通道)。
    overrideTemplatesFromConfig([
      { id: "review.insights", system: OVERRIDDEN_SYSTEM },
    ]);
    // sanity:REGISTRY 里的对象确实被改了。
    expect(getTemplate("review.insights").system).toBe(OVERRIDDEN_SYSTEM);

    await runReviewAnalyze(
      ctx,
      { id: "t2", projectId: "p1", inputData: { topic: "复盘对象" } },
      makeDeps(),
    );

    expect(runStructuredNode).toHaveBeenCalledTimes(1);
    const used = capturedTemplates[0]!;
    // 关键断言:runner 装配用的 template.system 是覆盖值 —— 证明它读的是 REGISTRY(被 override 后),
    // 而不是编译期 import 的 REVIEW_INSIGHTS_TEMPLATE 快照(旧实现下这里会是内置 system,断言失败)。
    expect(used.id).toBe("review.insights");
    expect(used.system).toBe(OVERRIDDEN_SYSTEM);
  });
});
