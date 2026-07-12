import { describe, it, expect, vi, beforeAll } from "vitest";
import { registerAllTemplates } from "@creatoros/ai-worker";
import {
  buildChatAssembly,
  buildHooksPrompt,
  formatWorksBrief,
  EXTRA_BRIEF_HEADING,
  type AssembleChatDeps,
  parseHookItems,
  resolveChatMaxSteps,
  buildChatPrepareStep,
} from "./chat-runner";
import type { ChatContext } from "./chat-context";

// [T-084a] 保留 ai-worker 全部真实导出(registerAllTemplates/getTemplate/modelFor 等装配用),
// 仅把 runResearchNode 换成不打网络的探针:grounding 由入参 searchResults 是否非空驱动(与真
// 节点同逻辑),让 gatherMaterials 绑定的「前置检索→注入→透传 grounding/sourceUrl」可零成本单测。
vi.mock("@creatoros/ai-worker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@creatoros/ai-worker")>();
  return {
    ...actual,
    runResearchNode: vi.fn(
      async (input: { searchResults?: unknown[] }) => {
        const hasSearch = (input.searchResults?.length ?? 0) > 0;
        return {
          grounding: hasSearch ? "web" : "model_memory",
          categories: {
            hooks: [],
            cases: [],
            dataPoints: [],
            quotes: [],
          },
          items: [
            {
              title: hasSearch ? "案例：真实检索案例" : "案例：记忆案例",
              url: hasSearch ? "https://blog.example.com/rag" : "",
              source: hasSearch ? "example.com" : "需核实",
              why_relevant: "同赛道",
              ...(hasSearch ? { sourceUrl: "https://blog.example.com/rag" } : {}),
            },
          ],
        };
      },
    ),
  };
});

// /api/chat 装配单测(SPEC §7「/api/chat 装配:resolve skill + 注入 context + tools 挂载」+
// 「ChatContext 三层注入选对 skill」)。
//
// 不真跑模型:resolveModelSpec 给 fake spec(不会真连厂商),context readers 给 fake brief。
// buildChatAssembly 内部经 ai-worker.modelFor(spec) 造一个 LanguageModel 对象(不发请求,
// 只是 provider 句柄),故装配可单测;真正的 streamText(流式)需 dev server + key,本环境不跑。

const ctx = { userId: "u-1", correlationId: "c-1" } as never;

const FAKE_SPEC = {
  apiFormat: "anthropic" as const,
  baseUrl: null,
  model: "claude-test",
  token: "sk-test", // 不会真用 —— buildChatAssembly 不发请求,只造 provider 句柄。
};

function makeDeps(over: Partial<AssembleChatDeps> = {}): {
  deps: AssembleChatDeps;
  resolveModelSpec: ReturnType<typeof vi.fn>;
} {
  const resolveModelSpec = vi.fn(async () => FAKE_SPEC);
  const deps: AssembleChatDeps = {
    resolveModelSpec,
    // [T-163] humanizeError 端口(下沉后经注入);chat-runner 测试不走 distill 错误路径,回落 null。
    humanizeError: () => null,
    positioning: {
      getPositioningCenter: async () => ({
        profile: {
          persona: "硬核创作者",
          field: "AI 工程",
          audience: "一线开发者",
          differentiation: "可运行代码",
          capabilities: ["论文拆解"],
        },
        currentStatement: { oneLiner: "把论文落成代码", keywords: ["代码"] },
      }),
    },
    learnings: {
      getSuggestions: async () => [
        { title: "反直觉开头", insight: "对你有效" },
      ],
    },
    signals: {
      list: async () => [
        { source: "douyin_comment", rawText: "怎么落地", demandTag: null },
      ],
    },
    knowledge: {
      // [T-079c] brief 按四原子分段后只有 claim/evidence/quote 进喂料(note 等
      // 旧类型是存档,不进 brief)→ fake 用 claim 才会出现在 system 注入里。
      list: async () => [
        { title: "RAG 实战", knowledgeType: "claim", usedCount: 2 },
      ],
    },
    contextReaders: {
      // [T-077b] brief.fill 的现状读端口(fake:proj-1 已填目标观众,其余未填)。
      getProjectBrief: async () => ({
        targetAudience: "一线开发者",
        targetPlatforms: ["douyin"],
      }),
      listComments: async () => ({ rows: [], total: 0 }),
      listProjects: async () => ({
        total: 1,
        rows: [
          {
            id: "proj-1",
            title: "上下文工程",
            stage: "planning",
            status: "active",
            publishedAt: null,
          },
        ],
      }),
      searchKnowledge: async () => [
        { id: "kn-1", title: "RAG 实战", snippet: "检索增强要点" },
      ],
      searchMaterials: async () => [
        { id: "as-1", title: "封面图 A", kind: "image" },
      ],
      // [T-099b] 详情类读端口 fake —— 断言工具 execute 经 ctx 调它拼全档。
      getProjectDetail: async () => ({
        id: "proj-1",
        title: "上下文工程",
        stage: "planning",
        status: "active",
        publish: { published: false, platform: null, publishedAt: null },
        brief: { targetAudience: "一线开发者", targetPlatforms: ["douyin"] },
        artifacts: [
          {
            artifactType: "output_script",
            versionCount: 2,
            updatedAt: "2026-07-01T00:00:00.000Z",
            charCount: 1234,
          },
        ],
        metricsSummary: "播放 8.5万 · 点赞 3000",
      }),
      getPositioningDetail: async () => ({
        profile: {
          persona: "硬核创作者",
          field: "AI 工程",
          audience: "一线开发者",
          differentiation: "可运行代码",
          capabilities: ["论文拆解"],
          facets: { contentScope: "只做 AI 工程" },
          downstreamRules: { forbidRule: "不追泛热点" },
        },
        currentStatement: { oneLiner: "把论文落成代码", keywords: ["代码"] },
        statementCount: 3,
        accounts: [
          {
            platform: "douyin",
            accountHandle: "@硬核老王",
            followerBaseline: 12000,
          },
        ],
      }),
      getKnowledgeDetail: async () => ({
        id: "kn-1",
        title: "上下文工程是护城河",
        knowledgeType: "claim",
        note: "短正文",
        sourceNote: "作者原话",
        sourceType: "manual",
        sourceUrl: null,
        tags: ["上下文工程"],
        usedCount: 5,
        usedInPublished: true,
        relations: [{ targetKnowledgeId: "kn-2", relationType: "supports" }],
      }),
      // [T-099c] 全文类读端口 fake —— 断言工具 execute 经 ctx 调它。
      listProjectArtifacts: async () => ({
        projectId: "proj-1",
        projectTitle: "上下文工程",
        items: [
          {
            artifactType: "output_script",
            currentVersion: 2,
            updatedAt: "2026-07-01T00:00:00.000Z",
            totalChars: 1234,
          },
        ],
      }),
      getArtifactText: async () => ({
        artifactType: "output_script",
        fullText: "逐字稿正文全文".repeat(100),
      }),
      getKnowledgeText: async () => ({
        id: "kn-1",
        title: "上下文工程逐字稿",
        knowledgeType: "quote",
        fullText: "知识长文正文".repeat(100),
      }),
      // [T-099 切片四/五] 指标/发布/经验/候选/校准读端口 fake —— 断言工具 execute 经 ctx 调它。
      listPublications: async () => ({
        rows: [
          {
            id: "pub-1",
            platform: "douyin",
            url: "https://v.douyin.com/x",
            publishedAt: "2026-07-01T00:00:00.000Z",
            projectTitle: "上下文工程",
            status: "published",
          },
        ],
        total: 1,
      }),
      getMetrics: async () => ({
        subject: "上下文工程",
        rows: [
          {
            title: "上下文工程",
            plays: 85000,
            likes: 3000,
            comments: 420,
            shares: 120,
          },
        ],
        retention: [{ atSeconds: 3, retentionRate: 0.82 }],
      }),
      listLearnings: async () => ({
        rows: [
          {
            id: "lrn-1",
            title: "前3秒给结果",
            insight: "完播更高",
            learningType: "hook",
            status: "validated",
            reuseCount: 4,
          },
        ],
        total: 1,
      }),
      listCandidates: async () => ({
        rows: [
          {
            id: "cand-1",
            title: "反直觉开头",
            status: "candidate",
            score: 80,
            source: "ai",
          },
        ],
        total: 1,
      }),
      getPredictions: async () => ({
        rubric: { name: "校准评分标准", versionNumber: 2, dimensionCount: 5 },
        rows: [
          {
            predictionId: "pred-1",
            subjectTitle: "上下文工程",
            hasResult: true,
            deviationBand: "low",
            finding: "钩子维度偏差最大",
            dimensions: [
              {
                key: "hook",
                label: "开头钩子",
                predicted: 4,
                actual: 5,
                deviation: 1,
              },
            ],
          },
        ],
        total: 1,
      }),
    },
    ...over,
  };
  return { deps, resolveModelSpec };
}

// 调一个工具的 execute(绕开 SDK execute 的严格泛型,断言行为而非类型)。
async function runToolExecute(
  tool: { execute?: unknown },
  input: unknown,
): Promise<unknown> {
  const exec = tool.execute as (i: unknown, o: unknown) => Promise<unknown>;
  return exec(input, { toolCallId: "tc", messages: [], context: {} });
}

beforeAll(() => {
  // 让 getTemplate("chatbox.topic") / getTools 能取到内置 skill。
  registerAllTemplates();
});

describe("buildChatAssembly — 三层注入装配", () => {
  it("surface=topics → 选 chatbox.topic skill(页面层)", async () => {
    const { deps } = makeDeps();
    const chatContext: ChatContext = { surface: "topics" };
    const a = await buildChatAssembly(ctx, chatContext, deps);
    expect(a.skillId).toBe("chatbox.topic");
  });

  it("未知 surface → 回落 chatbox.topic(路由不崩)", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "nope" }, deps);
    expect(a.skillId).toBe("chatbox.topic");
  });

  it("数据层:把非空 CreativeContext facets 注进 system(定位/飞轮/受众信号/知识库)", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    // skill 自己的 system(选题编导角色)在最前。
    expect(a.system).toContain("选题编导");
    // 数据层 facets 注入。
    expect(a.system).toContain("把论文落成代码"); // 定位
    expect(a.system).toContain("反直觉开头"); // 飞轮
    expect(a.system).toContain("怎么落地"); // 受众信号(真实评论)
    expect(a.system).toContain("RAG 实战"); // 知识库
  });

  it("[T-096 矩阵#10] 系统注入不受 scope 隔离影响:任意 scope 声明下 system 仍含账号级 facets(不过度隔离)", async () => {
    // scope 是会话归属(历史/恢复分桶),不是装配参数 —— chatContext 带任何 scope 声明,
    // 定位 brief 等账号级事实底座照常注入(SPEC §1.5:账号级共享不算泄漏)。
    const { deps } = makeDeps();
    for (const scope of ["global", "surface:knowledge-distill", "project:p1"]) {
      const a = await buildChatAssembly(
        ctx,
        // /api/chat 透传的 chatContext 可能带 scope 字段(额外键,装配层不读它)。
        { surface: "topics", scope } as unknown as ChatContext,
        deps,
      );
      expect(a.system).toContain("把论文落成代码"); // 定位 brief(账号级,全 scope 共享)
      expect(a.system).toContain("反直觉开头"); // 飞轮经验(账号级,全 scope 共享)
    }
  });

  it("surface=review + projectId → 把「本次复盘对象」(真标题/文案/数据/评论)注进对话 system(修「瞎问复盘对象」)", async () => {
    const { deps } = makeDeps({
      reviewSubject: {
        getTitle: async () => "22个没法看的逐字稿",
        getScript: async () => "大家好,今天讲怎么把逐字稿批量跑通",
        getMetricsSummary: async () => "播放 8.5万 · 完播 4.0%",
        getComments: async () => ["求教程", "太强了"],
      },
    });
    const a = await buildChatAssembly(
      ctx,
      { surface: "review", projectId: "proj-x" },
      deps,
    );
    // 对话系统提示里直接带上「本次复盘对象」+ 强指令 + 真材料 —— LLM 一进来就知道复盘哪条,
    // 不再问用户、不退回账号级泛论。
    expect(a.system).toContain("本次复盘对象");
    expect(a.system).toContain("不要再问");
    expect(a.system).toContain("22个没法看的逐字稿"); // 真标题
    expect(a.system).toContain("大家好,今天讲怎么把逐字稿批量跑通"); // 真文案
    expect(a.system).toContain("播放 8.5万"); // 真数据
    expect(a.system).toContain("求教程"); // 真评论
  });

  it("surface=review 但无 projectId(无真材料)→ 不注入复盘对象块(§8 不摆假)", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "review" }, deps);
    expect(a.system).not.toContain("本次复盘对象");
  });

  it("[T-106] 项目态注入当前项目 id 为工具可用值 + 指路 context.artifact.text + 禁 context.projects 找", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(
      ctx,
      {
        surface: "project",
        projectId: "proj-x",
        selection: { kind: "project", ids: ["proj-x"], label: "我的作品" },
      },
      deps,
    );
    // 当前项目 id 作为工具入参注入(模型不用 groping)。
    expect(a.system).toContain('projectId="proj-x"');
    expect(a.system).toContain("context.artifact.text");
    // 明令别用 context.projects 列全站找这一条(修 groping 根因)。
    expect(a.system).toContain("绝不要用 context.projects");
  });

  it("[T-106] 无 projectId(账号级对话)→ 不注入当前项目块", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    expect(a.system).not.toContain("当前项目 —— 你正在为这一个具体项目编导");
  });

  it("[T-117] functionKey 命中真工具 → forcedTool 置该工具(streamText 会 toolChoice 强制)", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(
      ctx,
      { surface: "topics", functionKey: "topic.enrich" },
      deps,
    );
    expect(a.forcedTool).toBe("topic.enrich");
  });

  it("[T-117] 无 functionKey / functionKey 非真工具 → forcedTool undefined(自由对话不强制)", async () => {
    const { deps } = makeDeps();
    const none = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    expect(none.forcedTool).toBeUndefined();
    const bogus = await buildChatAssembly(
      ctx,
      { surface: "topics", functionKey: "not-a-tool" },
      deps,
    );
    expect(bogus.forcedTool).toBeUndefined();
  });

  it("[T-240③] 场景白名单真收窄:topics(选题页)= 创作产出 + 素材 + 全量只读,不含 review.analyze/review.script", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    expect(Object.keys(a.tools).sort()).toEqual([
      "brief.fill",
      "calibration.diagnose",
      // [T-099c] 切片三:全文类(context.artifact.text 排在 context.artifacts 前:'.' < 's')。
      "context.artifact.text",
      "context.artifacts",
      // [T-099 切片五] context.candidates(排在 artifacts 后、comments 前:'a' < 'c')。
      "context.candidates",
      "context.comments",
      "context.knowledge",
      // [T-099b] 切片二:详情类(单实体全字段)。
      "context.knowledge.detail",
      // [T-099c] context.knowledge.text 排在 .detail 后('d' < 't')。
      "context.knowledge.text",
      // [T-099 切片五] context.learnings(排在 knowledge 后、materials 前)。
      "context.learnings",
      "context.materials",
      // [T-099 切片四] context.metrics(排在 materials 后、positioning 前)。
      "context.metrics",
      "context.positioning.detail",
      // [T-099 切片五] context.predictions(排在 positioning 后、project 前:'pre' < 'pro')。
      "context.predictions",
      "context.project.detail",
      "context.projects",
      // [T-099 切片四] context.publications(排在 projects 后:'pro' < 'pub')。
      "context.publications",
      "knowledge.distill",
      "learning.capture",
      "material.gather",
      // [T-084c] AI 生成素材(dispatch asset.generate)。
      "material.generate",
      // [T-084b] 网页截图(公开页真截图落 asset)。
      "material.screenshot",
      "positioning.generate",
      // [T-240③] review.analyze / review.script 被场景砍掉:选题页无单条作品的复盘/审核语境。
      "script.draft",
      "script.hooks",
      "topic.enrich",
      "topic.generate",
      // [T-217c] 带登录态读网页正文(排在最后:'w' > 't')。
      "web.read",
    ]);
  });

  it("[T-077c] 技能自感知:skillsBrief 注入 system(每白名单工具一行「中文名(工具名):用途」,行数=白名单数、≤30)", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    // 清单块头(与 honestyBlock 并列注入)。
    expect(a.system).toContain("你的技能清单");
    // 每个白名单工具一行,格式「中文名(工具名):一句话用途」(gate-F1)。
    const whitelist = Object.keys(a.tools);
    for (const id of whitelist) {
      // 行内含「(工具名):」—— 中文名和用途由词表给,这里锚定格式骨架。
      expect(a.system).toContain(`(${id}):`);
    }
    // 抽查中文名 + 用途同源词表(lib/chat-tool-labels)。
    expect(a.system).toContain("AI 出题(topic.generate):");
    expect(a.system).toContain("记录经验(learning.capture):");
    // 行数 = 白名单工具数(≤30,gate-F1 截断上限,[T-099c] 从 20 提到 30 覆盖全工具集)。
    const brief = a.system
      .split("【你的技能清单")[1]!
      .split("\n\n")[0]!
      .split("\n")
      .filter((l) => /\(.+\):/.test(l));
    expect(brief).toHaveLength(whitelist.length);
    expect(brief.length).toBeLessThanOrEqual(30);
  });

  it("[T-240③] skillsBrief 与场景白名单同步:review 面 preferred 在前,被场景砍掉的工具不进自感知清单", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "review" }, deps);
    expect(a.system).toContain("复盘提炼(review.analyze):");
    expect(a.system).toContain("记录经验(learning.capture):");
    // 只读 context 工具全场景保留(S1 无稿门要靠它们找真稿)。
    expect(a.system).toContain("(context.projects):");
    // [T-240③] 复盘面不给创作产出工具(topic.generate 等)—— 自感知清单与真实工具集一致。
    expect(a.system).not.toContain("(topic.generate):");
  });

  it("按 skill 能力解析 model(resolveModelSpec 被以 topic.generate 调用)", async () => {
    const { deps, resolveModelSpec } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    expect(resolveModelSpec).toHaveBeenCalledWith(ctx, "topic.generate");
    expect(a.modelSpec).toEqual(FAKE_SPEC);
  });

  it("surface=calibration → chatbox.calibration skill + calibration.diagnose([T-240③] 场景收窄:不给创作产出工具)", async () => {
    const { deps, resolveModelSpec } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "calibration" }, deps);
    expect(a.skillId).toBe("chatbox.calibration");
    // [T-240③] 场景白名单:盲评 + 记经验 + 素材(4)+ 全量只读(15)= 21;创作产出工具被砍。
    const names = Object.keys(a.tools);
    expect(names).toContain("calibration.diagnose");
    expect(names).toContain("learning.capture");
    expect(names).not.toContain("topic.generate");
    expect(names).not.toContain("script.draft");
    expect(names.length).toBe(21);
    // 主能力档按 calibration.diagnose 解析(各 surface 复用对应节点的模型配置)。
    expect(resolveModelSpec).toHaveBeenCalledWith(ctx, "calibration.diagnose");
  });

  it("surface=positioning → chatbox.positioning skill + positioning.generate([T-240③] 场景收窄:不给出题/写稿/复盘)", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "positioning" }, deps);
    expect(a.skillId).toBe("chatbox.positioning");
    const names = Object.keys(a.tools);
    expect(names).toContain("positioning.generate");
    expect(names).not.toContain("topic.generate");
    expect(names).not.toContain("review.analyze");
    expect(names.length).toBe(21);
  });

  it("T-039b:surface=positioning → 把账号画像(accountsBrief)注进定位对话 system(定位提案立足真实账号)", async () => {
    const { deps } = makeDeps({
      accounts: {
        list: async () => [
          {
            platform: "douyin",
            accountHandle: "@硬核老王",
            followerBaseline: 12000,
          },
        ],
      },
    } as Partial<AssembleChatDeps>);
    const a = await buildChatAssembly(ctx, { surface: "positioning" }, deps);
    // 账号画像块 + 真账号数据注入(仅定位对话)。
    expect(a.system).toContain("抖音账号画像");
    expect(a.system).toContain("@硬核老王");
    expect(a.system).toContain("12000");
  });

  it("T-039b:surface=topics(非定位)→ 不注入账号画像(避免给其它 surface 塞账号噪声)", async () => {
    const { deps } = makeDeps({
      accounts: {
        list: async () => [
          {
            platform: "douyin",
            accountHandle: "@硬核老王",
            followerBaseline: 12000,
          },
        ],
      },
    } as Partial<AssembleChatDeps>);
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    // 出题对话不该出现账号画像块(它只属于定位对话)。
    expect(a.system).not.toContain("抖音账号画像");
    expect(a.system).not.toContain("@硬核老王");
  });

  it("[T-240③] surface=review → chatbox.review skill,场景白名单 = 复盘提炼 + 记经验 + 素材 + 全量只读(不给创作产出)", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "review" }, deps);
    expect(a.skillId).toBe("chatbox.review");
    // [T-240③] 场景真收窄:preferred 是 review.analyze/learning.capture(排前),context.* 全保留
    // (S1 无稿门要靠 context.metrics/context.artifact.text 找真稿),创作产出工具(topic.generate/
    // script.draft 等)被砍 —— 复盘面不需要出题/写稿(2026-07-02「拉全标题凑数」污染源先例)。
    const names = Object.keys(a.tools);
    expect(names).toContain("review.analyze");
    expect(names).toContain("learning.capture");
    expect(names).toContain("context.projects");
    expect(names).toContain("context.metrics");
    expect(names).not.toContain("topic.generate");
    expect(names).not.toContain("script.draft");
    expect(names.length).toBe(21); // 2 产出 + 4 素材 + 15 只读
  });

  it("T-039a:surface=review + projectId → 装配期把 projectId 传给 reviewSubject reader(全链路后端段)", async () => {
    // 注入一个记录入参的 reviewSubject reader:证明 chatContext.projectId 真的流到 assembleCreativeContext
    // (原来 chat-runner 写死 projectId=null → 复盘永远读不到本项目)。有 projectId → reader 被以它调用。
    const seen: string[] = [];
    const reviewSubject = {
      getTitle: async (_c: unknown, projectId: string) => {
        seen.push(projectId);
        return "作品真标题";
      },
      getScript: async (_c: unknown, projectId: string) => {
        seen.push(projectId);
        return "逐字稿正文";
      },
      getMetricsSummary: async () => "播放：1000",
      getComments: async () => ["评论一"],
    };
    const { deps } = makeDeps({ reviewSubject } as Partial<AssembleChatDeps>);
    await buildChatAssembly(
      ctx,
      { surface: "review", projectId: "proj-real-1" },
      deps,
    );
    // reader 被以真实 projectId 调用(证明 projectId 打通到数据层)。
    expect(seen).toContain("proj-real-1");
    expect(seen.every((p) => p === "proj-real-1")).toBe(true);
  });

  it("T-039a:surface=review 但缺 projectId → 不调 reviewSubject reader(诚实兜底,不崩)", async () => {
    const getTitle = vi.fn(async () => "不该被调");
    const reviewSubject = {
      getTitle,
      getScript: vi.fn(async () => ""),
      getMetricsSummary: vi.fn(async () => ""),
      getComments: vi.fn(async () => []),
    };
    const { deps } = makeDeps({ reviewSubject } as Partial<AssembleChatDeps>);
    const a = await buildChatAssembly(ctx, { surface: "review" }, deps);
    expect(getTitle).not.toHaveBeenCalled();
    // 装配仍成功(skill + 工具照常)。
    expect(a.skillId).toBe("chatbox.review");
  });

  it("functionKey 叠加:把命中的专用工具置顶(按钮层,一键岛预调)", async () => {
    const { deps } = makeDeps();
    // 选题编导白名单 [topic.generate, topic.enrich];functionKey=topic.enrich → 置顶。
    const a = await buildChatAssembly(
      ctx,
      { surface: "topics", functionKey: "topic.enrich" },
      deps,
    );
    expect(Object.keys(a.tools)[0]).toBe("topic.enrich");
  });

  it("functionKey 越权(不在 skill preferred 白名单)→ 不置顶该工具(在场景白名单内仍可调,只是不预调置顶)", async () => {
    const { deps } = makeDeps();
    // 选题页 functionKey 给了盲评工具(越权 preferred 白名单)→ 不把它预调置顶;
    // calibration.diagnose 是发布前盲评(创作流工具),在 topics 场景白名单内 → 可调,只是不在队首。
    const a = await buildChatAssembly(
      ctx,
      { surface: "topics", functionKey: "calibration.diagnose" },
      deps,
    );
    const names = Object.keys(a.tools);
    expect(names.length).toBe(28); // [T-240③] topics 场景集(9 产出 + 4 素材 + 15 只读)
    expect(names).toContain("calibration.diagnose"); // 可调
    expect(names[0]).not.toBe("calibration.diagnose"); // 但越权不置顶
  });

  // ── [T-240] 场景一等机制:阶段判据 + 场景白名单 + 兜底 ─────────────────────────────
  describe("[T-240] 场景一等机制", () => {
    it("① 创作前项目(未发布)→ system 注入「创作前(未发布)」阶段块 + 「没有逐字稿是正常状态」", async () => {
      const { deps } = makeDeps(); // fake getProjectDetail: published=false, stage=planning
      const a = await buildChatAssembly(
        ctx,
        { surface: "project", projectId: "proj-1" },
        deps,
      );
      expect(a.system).toContain("当前项目阶段:创作前(未发布)");
      expect(a.system).toContain("没有逐字稿是正常状态");
      expect(a.system).toContain("(stage=planning)");
    });

    it("① 已发布项目 → system 注入「已发布(可复盘)」阶段块(拆解必须读真逐字稿/指标)", async () => {
      const { deps } = makeDeps();
      deps.contextReaders!.getProjectDetail = async () => ({
        id: "proj-pub",
        title: "已发布的一条",
        stage: "review",
        status: "published",
        publish: {
          published: true,
          platform: "douyin",
          publishedAt: "2026-07-01T00:00:00.000Z",
        },
        brief: {},
        artifacts: [],
        metricsSummary: "",
      });
      const a = await buildChatAssembly(
        ctx,
        { surface: "project", projectId: "proj-pub" },
        deps,
      );
      expect(a.system).toContain("当前项目阶段:已发布(可复盘)");
      expect(a.system).toContain("context.artifact.text");
    });

    it("① 无 projectId / 读不到项目详情 → 不注阶段块(不喂猜测,装配不崩)", async () => {
      const { deps } = makeDeps({
        contextReaders: undefined,
      } as Partial<AssembleChatDeps>);
      const a = await buildChatAssembly(
        ctx,
        { surface: "project", projectId: "proj-x" },
        deps,
      );
      expect(a.system).not.toContain("当前项目阶段");
    });

    it("② 规则带作用域:全局条款(编造禁令/论点树铁律)+ 场景条款(S1 已发布无稿门 / S2 创作前豁免)", async () => {
      const { deps } = makeDeps();
      const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
      // 全局条款:编造禁令(原第 9 条的全局半)+ 论点树铁律。
      expect(a.system).toContain("全局条款");
      expect(a.system).toContain("绝不编造具体数字、案例、来源");
      expect(a.system).toContain("论点树铁律");
      expect(a.system).toContain("挂不进论点骨架面板、写脚本时不会被引用");
      // 场景条款:S1 无稿门限定「已发布」;S2 创作前立框架不适用无稿门。
      expect(a.system).toContain("场景条款");
      expect(a.system).toContain("S1.(仅在拆解/复盘一条**已发布**作品时生效)");
      expect(a.system).toContain("必须先读到这条作品的真逐字稿");
      expect(a.system).toContain("S2.(仅在为**创作前(未发布)**的项目立框架时生效)");
      expect(a.system).toContain("不适用 S1 的无稿门");
    });

    it("③ 创作前 project surface → review.analyze 被阶段感知砍掉(review.script/calibration.diagnose 保留)", async () => {
      const { deps } = makeDeps(); // published=false
      const a = await buildChatAssembly(
        ctx,
        { surface: "project", projectId: "proj-1" },
        deps,
      );
      const names = Object.keys(a.tools);
      expect(names).not.toContain("review.analyze");
      expect(names).toContain("review.script"); // 稿面审核按钮深链落 project
      expect(names).toContain("calibration.diagnose"); // 盲预测按钮深链落 project
      expect(names.length).toBe(29);
    });

    it("③ 已发布 project surface → review.analyze 保留(复盘不误伤);阶段未知(无读端口)→ 全量兜底", async () => {
      const { deps } = makeDeps();
      deps.contextReaders!.getProjectDetail = async () => ({
        id: "proj-pub",
        title: "已发布的一条",
        stage: "review",
        status: "published",
        publish: { published: true, platform: "douyin", publishedAt: null },
        brief: {},
        artifacts: [],
        metricsSummary: "",
      });
      const a = await buildChatAssembly(
        ctx,
        { surface: "project", projectId: "proj-pub" },
        deps,
      );
      expect(Object.keys(a.tools)).toContain("review.analyze");
      expect(Object.keys(a.tools).length).toBe(30);
      // 阶段未知(读端口未装配)→ project 全集(诚实兜底,不误砍)。
      const { deps: noReaders } = makeDeps({
        contextReaders: undefined,
      } as Partial<AssembleChatDeps>);
      const b = await buildChatAssembly(
        ctx,
        { surface: "project", projectId: "proj-x" },
        noReaders,
      );
      expect(Object.keys(b.tools)).toContain("review.analyze");
      expect(Object.keys(b.tools).length).toBe(30);
    });

    it("③ 未知 surface(global 全局唤醒/兜底)→ 无场景映射,回落全量 30 工具(向后兼容)", async () => {
      const { deps } = makeDeps();
      const a = await buildChatAssembly(ctx, { surface: "nope" }, deps);
      expect(Object.keys(a.tools).length).toBe(30);
      expect(Object.keys(a.tools)).toContain("review.analyze");
      expect(Object.keys(a.tools)).toContain("topic.generate");
    });

    it("③ functionKey 命中真工具但被场景砍掉 → 补回白名单且 forcedTool 生效(T-231⑨ 强制置顶不受收窄影响)", async () => {
      const { deps } = makeDeps();
      // topics 场景砍了 review.script;深链按钮显式要它 → 补回 + 强制。
      const a = await buildChatAssembly(
        ctx,
        { surface: "topics", functionKey: "review.script" },
        deps,
      );
      expect(Object.keys(a.tools)).toContain("review.script");
      expect(a.forcedTool).toBe("review.script");
      expect(Object.keys(a.tools).length).toBe(29); // 28 + 补回的 1
    });
  });

  it("没配 model key(resolveModelSpec 抛错)→ 装配抛出(路由接住返 4xx,不假成功)", async () => {
    const { deps } = makeDeps({
      resolveModelSpec: vi.fn(async () => {
        throw new Error("no LLM credential");
      }),
    });
    await expect(
      buildChatAssembly(ctx, { surface: "topics" }, deps),
    ).rejects.toThrow(/no LLM credential/);
  });

  it("facets 装配失败(reader 抛)不阻断装配 —— 降级为无该 facet 的 system", async () => {
    const { deps } = makeDeps({
      positioning: {
        getPositioningCenter: async () => {
          throw new Error("positioning down");
        },
      },
    });
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    // 定位 facet 缺失,但 skill system + 其它 facet 仍在。
    expect(a.system).toContain("选题编导");
    expect(a.system).not.toContain("把论文落成代码");
    expect(a.system).toContain("反直觉开头");
  });

  it("只读 context 工具 execute → 经 ctx 调注入的 user-scoped 读端口(拉真数据)", async () => {
    const listProjects = vi.fn(async () => ({
      total: 1,
      rows: [
        {
          id: "proj-1",
          title: "上下文工程",
          stage: "planning",
          status: "active",
          publishedAt: null,
        },
      ],
    }));
    const { deps } = makeDeps({
      contextReaders: {
        getProjectBrief: async () => null,
        listProjects,
        listComments: async () => ({ rows: [], total: 0 }),
        searchKnowledge: async () => [],
        searchMaterials: async () => [],
      },
    });
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    const result = (await runToolExecute(a.tools["context.projects"]!, {
      limit: 5,
    })) as { kind: string; items: unknown[] };
    // 读端口收到本请求 ctx(user-scoping 由端口内部据 ctx.userId 收窄)。
    expect(listProjects).toHaveBeenCalledWith(ctx, { limit: 5, offset: 0 });
    expect(result.kind).toBe("context.projects");
    expect(result.items).toHaveLength(1);
  });

  it("[T-077b] brief.fill execute:项目对话(projectId)→ 经读端口取现状 current;建议字段纯回显", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(
      ctx,
      // project surface(稿面右栏)带 kind=project 选中态 → chatContext.projectId 已装。
      { surface: "project", projectId: "proj-1" },
      deps,
    );
    const result = (await runToolExecute(a.tools["brief.fill"]!, {
      targetAudience: "AI 新手",
      contentGoal: "涨粉",
      coreMessage: "", // 空串 → 清洗掉,不进建议
    })) as {
      kind: string;
      suggestion: Record<string, string>;
      current: Record<string, unknown> | null;
    };
    expect(result.kind).toBe("brief.fill");
    // 建议 = 模型填参纯回显(只留非空字段;不写库 —— 落库由人点卡上「写入选题卡」触发)。
    expect(result.suggestion).toEqual({
      targetAudience: "AI 新手",
      contentGoal: "涨粉",
    });
    // 现状 = makeDeps 里 fake 读端口给的 briefDetail(前端卡渲「现值 → 建议值」对照)。
    expect(result.current).toEqual({
      targetAudience: "一线开发者",
      targetPlatforms: ["douyin"],
    });
  });

  it("[T-077b] brief.fill execute:无项目上下文(无 projectId)→ current=null(诚实降级,不编现状)", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "project" }, deps);
    const result = (await runToolExecute(a.tools["brief.fill"]!, {
      targetAudience: "AI 新手",
    })) as { current: unknown };
    expect(result.current).toBeNull();
  });

  it("contextReaders 未装配 → context 工具读到空(诚实降级,不报错、不塞假数据)", async () => {
    const { deps } = makeDeps({ contextReaders: undefined });
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    const result = (await runToolExecute(a.tools["context.knowledge"]!, {
      query: "x",
    })) as { kind: string; items: unknown[] };
    expect(result.kind).toBe("context.knowledge");
    expect(result.items).toEqual([]);
  });

  // [T-099b] 切片二:详情类工具 execute —— 经 ctx 调注入的 user-scoped 详情读端口拼全档。
  it("[T-099b] context.project.detail execute → 经读端口拼项目全档(brief/阶段/发布/产物索引/指标)", async () => {
    const getProjectDetail = vi.fn(async () => ({
      id: "proj-1",
      title: "上下文工程",
      stage: "planning",
      status: "active",
      publish: { published: true, platform: "douyin", publishedAt: "2026-07-01T00:00:00.000Z" },
      brief: { targetAudience: "一线开发者", coreMessage: "上下文是护城河" },
      artifacts: [
        {
          artifactType: "output_script",
          versionCount: 3,
          updatedAt: "2026-07-01T00:00:00.000Z",
          charCount: 999,
        },
      ],
      metricsSummary: "播放 8.5万",
    }));
    const { deps } = makeDeps({
      contextReaders: {
        getProjectBrief: async () => null,
        listProjects: async () => ({ rows: [], total: 0 }),
        listComments: async () => ({ rows: [], total: 0 }),
        searchKnowledge: async () => [],
        searchMaterials: async () => [],
        getProjectDetail,
      },
    });
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    const result = (await runToolExecute(a.tools["context.project.detail"]!, {
      projectId: "proj-1",
    })) as {
      kind: string;
      found: boolean;
      project: { title: string; stage: string; publish: { published: boolean }; artifacts: unknown[] };
    };
    expect(getProjectDetail).toHaveBeenCalledWith(ctx, { projectId: "proj-1" });
    expect(result.kind).toBe("context.project.detail");
    expect(result.found).toBe(true);
    expect(result.project.title).toBe("上下文工程");
    expect(result.project.publish.published).toBe(true);
    expect(result.project.artifacts).toHaveLength(1);
  });

  it("[T-099b] context.project.detail execute:读不到(端口回 null)→ found:false + project:null(诚实空态)", async () => {
    const { deps } = makeDeps({
      contextReaders: {
        getProjectBrief: async () => null,
        listProjects: async () => ({ rows: [], total: 0 }),
        listComments: async () => ({ rows: [], total: 0 }),
        searchKnowledge: async () => [],
        searchMaterials: async () => [],
        getProjectDetail: async () => null,
      },
    });
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    const result = (await runToolExecute(a.tools["context.project.detail"]!, {
      projectId: "nope",
    })) as { found: boolean; project: unknown };
    expect(result.found).toBe(false);
    expect(result.project).toBeNull();
  });

  it("[T-099b] context.positioning.detail execute → 全 facets + downstreamRules + 陈述版本数 + 账号画像", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "positioning" }, deps);
    const result = (await runToolExecute(a.tools["context.positioning.detail"]!, {})) as {
      kind: string;
      found: boolean;
      positioning: {
        profile: { facets: { contentScope?: string }; downstreamRules: { forbidRule?: string } } | null;
        statementCount: number | null;
        accounts: unknown[];
      };
    };
    expect(result.kind).toBe("context.positioning.detail");
    expect(result.found).toBe(true);
    expect(result.positioning.profile?.facets.contentScope).toBe("只做 AI 工程");
    expect(result.positioning.profile?.downstreamRules.forbidRule).toBe("不追泛热点");
    expect(result.positioning.statementCount).toBe(3);
    expect(result.positioning.accounts).toHaveLength(1);
  });

  it("[T-099b] context.positioning.detail execute:端口未装配 → found:false + 空档(诚实降级)", async () => {
    const { deps } = makeDeps({
      contextReaders: {
        getProjectBrief: async () => null,
        listProjects: async () => ({ rows: [], total: 0 }),
        listComments: async () => ({ rows: [], total: 0 }),
        searchKnowledge: async () => [],
        searchMaterials: async () => [],
        // getPositioningDetail 缺省。
      },
    });
    const a = await buildChatAssembly(ctx, { surface: "positioning" }, deps);
    const result = (await runToolExecute(a.tools["context.positioning.detail"]!, {})) as {
      found: boolean;
      positioning: { profile: unknown; accounts: unknown[] };
    };
    expect(result.found).toBe(false);
    expect(result.positioning.profile).toBeNull();
    expect(result.positioning.accounts).toEqual([]);
  });

  it("[T-099b] context.knowledge.detail execute → 单条全字段 + 长文本截断(≤200 字 + totalChars + 指针)", async () => {
    const longNote = "字".repeat(500);
    const getKnowledgeDetail = vi.fn(async () => ({
      id: "kn-1",
      title: "上下文工程是护城河",
      knowledgeType: "claim",
      note: longNote,
      sourceNote: "作者原话",
      sourceType: "manual",
      sourceUrl: null,
      tags: ["上下文工程"],
      usedCount: 5,
      usedInPublished: true,
      relations: [{ targetKnowledgeId: "kn-2", relationType: "supports" }],
    }));
    const { deps } = makeDeps({
      contextReaders: {
        getProjectBrief: async () => null,
        listProjects: async () => ({ rows: [], total: 0 }),
        listComments: async () => ({ rows: [], total: 0 }),
        searchKnowledge: async () => [],
        searchMaterials: async () => [],
        getKnowledgeDetail,
      },
    });
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    const result = (await runToolExecute(a.tools["context.knowledge.detail"]!, {
      id: "kn-1",
    })) as {
      kind: string;
      found: boolean;
      item: {
        note: { preview: string; totalChars: number; fullTextTool: string | null };
        usedCount: number;
        relations: unknown[];
      };
    };
    expect(getKnowledgeDetail).toHaveBeenCalledWith(ctx, { id: "kn-1" });
    expect(result.kind).toBe("context.knowledge.detail");
    expect(result.found).toBe(true);
    // §3 详情档预算:长正文只回前 200 字 + totalChars + 指针到全文工具。
    expect(result.item.note.preview.length).toBe(200);
    expect(result.item.note.totalChars).toBe(500);
    expect(result.item.note.fullTextTool).toBe("context.knowledge.text");
    expect(result.item.usedCount).toBe(5);
    expect(result.item.relations).toHaveLength(1);
  });

  it("[T-099b] context.knowledge.detail execute:读不到 → found:false + item:null(诚实空态)", async () => {
    const { deps } = makeDeps({
      contextReaders: {
        getProjectBrief: async () => null,
        listProjects: async () => ({ rows: [], total: 0 }),
        listComments: async () => ({ rows: [], total: 0 }),
        searchKnowledge: async () => [],
        searchMaterials: async () => [],
        getKnowledgeDetail: async () => null,
      },
    });
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    const result = (await runToolExecute(a.tools["context.knowledge.detail"]!, {
      id: "nope",
    })) as { found: boolean; item: unknown };
    expect(result.found).toBe(false);
    expect(result.item).toBeNull();
  });

  // [T-099c] 切片三:全文类工具 execute —— 经 ctx 调注入的 user-scoped 全文读端口 + §3 窗口预算。
  it("[T-099c] context.artifacts execute → 经读端口拼产物清单(found + items)", async () => {
    const listProjectArtifacts = vi.fn(async () => ({
      projectId: "proj-1",
      projectTitle: "上下文工程",
      items: [
        {
          artifactType: "output_script",
          currentVersion: 3,
          updatedAt: "2026-07-01T00:00:00.000Z",
          totalChars: 1200,
        },
      ],
    }));
    const { deps } = makeDeps({
      contextReaders: {
        getProjectBrief: async () => null,
        listProjects: async () => ({ rows: [], total: 0 }),
        listComments: async () => ({ rows: [], total: 0 }),
        searchKnowledge: async () => [],
        searchMaterials: async () => [],
        listProjectArtifacts,
      },
    });
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    const result = (await runToolExecute(a.tools["context.artifacts"]!, {
      projectId: "proj-1",
    })) as { kind: string; found: boolean; items: unknown[] };
    expect(listProjectArtifacts).toHaveBeenCalledWith(ctx, { projectId: "proj-1" });
    expect(result.kind).toBe("context.artifacts");
    expect(result.found).toBe(true);
    expect(result.items).toHaveLength(1);
  });

  it("[T-099c] context.artifact.text execute → 经读端口取正文 + §3 窗口截断(maxChars/offset/hasMore)", async () => {
    const getArtifactText = vi.fn(async () => ({
      artifactType: "output_script",
      fullText: "逐字稿正文片段。".repeat(100), // 8 字 × 100 = 800 字
    }));
    const { deps } = makeDeps({
      contextReaders: {
        getProjectBrief: async () => null,
        listProjects: async () => ({ rows: [], total: 0 }),
        listComments: async () => ({ rows: [], total: 0 }),
        searchKnowledge: async () => [],
        searchMaterials: async () => [],
        getArtifactText,
      },
    });
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    const result = (await runToolExecute(a.tools["context.artifact.text"]!, {
      projectId: "proj-1",
      artifactType: "output_script",
      maxChars: 200,
    })) as {
      kind: string;
      found: boolean;
      artifactType: string;
      text: string;
      totalChars: number;
      hasMore: boolean;
    };
    expect(getArtifactText).toHaveBeenCalledWith(ctx, {
      projectId: "proj-1",
      artifactType: "output_script",
    });
    expect(result.kind).toBe("context.artifact.text");
    expect(result.found).toBe(true);
    expect(result.artifactType).toBe("output_script");
    // §3 全文档预算:窗口 200 字 + totalChars=800 + hasMore(execute 侧强制)。
    expect(result.text.length).toBe(200);
    expect(result.totalChars).toBe(800);
    expect(result.hasMore).toBe(true);
  });

  it("[T-099c] context.artifact.text execute:读不到(端口回 null)→ found:false + 空窗口(诚实空态)", async () => {
    const { deps } = makeDeps({
      contextReaders: {
        getProjectBrief: async () => null,
        listProjects: async () => ({ rows: [], total: 0 }),
        listComments: async () => ({ rows: [], total: 0 }),
        searchKnowledge: async () => [],
        searchMaterials: async () => [],
        getArtifactText: async () => null,
      },
    });
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    const result = (await runToolExecute(a.tools["context.artifact.text"]!, {
      projectId: "p",
      artifactType: "output_script",
    })) as { found: boolean; text: string; totalChars: number };
    expect(result.found).toBe(false);
    expect(result.text).toBe("");
    expect(result.totalChars).toBe(0);
  });

  it("[T-099c] context.knowledge.text execute → 经读端口取长文 + 窗口截断 + 元数据(title/type)", async () => {
    const getKnowledgeText = vi.fn(async () => ({
      id: "kn-1",
      title: "上下文工程逐字稿",
      knowledgeType: "quote",
      fullText: "知识长文正文。".repeat(100), // 7 字 × 100 = 700 字
    }));
    const { deps } = makeDeps({
      contextReaders: {
        getProjectBrief: async () => null,
        listProjects: async () => ({ rows: [], total: 0 }),
        listComments: async () => ({ rows: [], total: 0 }),
        searchKnowledge: async () => [],
        searchMaterials: async () => [],
        getKnowledgeText,
      },
    });
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    const result = (await runToolExecute(a.tools["context.knowledge.text"]!, {
      id: "kn-1",
      maxChars: 100,
    })) as {
      kind: string;
      found: boolean;
      title: string;
      knowledgeType: string;
      text: string;
      totalChars: number;
      hasMore: boolean;
    };
    expect(getKnowledgeText).toHaveBeenCalledWith(ctx, { id: "kn-1" });
    expect(result.kind).toBe("context.knowledge.text");
    expect(result.found).toBe(true);
    expect(result.title).toBe("上下文工程逐字稿");
    expect(result.knowledgeType).toBe("quote");
    expect(result.text.length).toBe(100);
    expect(result.totalChars).toBe(700);
    expect(result.hasMore).toBe(true);
  });

  it("[T-099c] 全文类端口未装配 → 三工具 found:false(诚实降级,不报错、不塞假)", async () => {
    const { deps } = makeDeps({
      contextReaders: {
        getProjectBrief: async () => null,
        listProjects: async () => ({ rows: [], total: 0 }),
        listComments: async () => ({ rows: [], total: 0 }),
        searchKnowledge: async () => [],
        searchMaterials: async () => [],
        // listProjectArtifacts / getArtifactText / getKnowledgeText 缺省。
      },
    });
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    const arts = (await runToolExecute(a.tools["context.artifacts"]!, {
      projectId: "p",
    })) as { found: boolean };
    const atext = (await runToolExecute(a.tools["context.artifact.text"]!, {
      projectId: "p",
      artifactType: "output_script",
    })) as { found: boolean };
    const ktext = (await runToolExecute(a.tools["context.knowledge.text"]!, {
      id: "k",
    })) as { found: boolean };
    expect(arts.found).toBe(false);
    expect(atext.found).toBe(false);
    expect(ktext.found).toBe(false);
  });
});

// [T-081⑤] honestyBlock 补边界规则:不摆工具做不到的操作选项。
describe("[T-081⑤] honestyBlock — 工具边界诚实", () => {
  it("system 注入「绝不提供工具不具备的操作选项」规则", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    expect(a.system).toContain(
      "绝不向用户提供你的工具不具备的操作选项",
    );
    expect(a.system).toContain("说明当前工具边界");
  });

  // [T-098] 第 6 条:context.* 数据卡直渲后,模型只有指针权、无转录权 —— 禁逐字口播清单。
  it("[T-098] system 注入「指针权/禁逐字复述清单」规则", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    expect(a.system).toContain("只有指针权");
    expect(a.system).toContain("禁止逐字复述清单内容");
    expect(a.system).toContain("已展示在卡片中");
  });
});

// [T-084a SPEC §1.3] 素材搜集诚实降级:honestyBlock 第 7 条按 probeSearchConfigured 动态注入;
// gatherMaterials 先真检索(searchWeb)再综合,失败/未配降级 grounding=model_memory。
describe("[T-084a] 联网检索诚实降级 + honestyBlock 动态第 7 条", () => {
  it("未配联网检索(默认无 probe 端口)→ 注入「未配置联网检索…绝不假装搜过网」", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    expect(a.system).toContain("未配置联网检索");
    expect(a.system).toContain("绝不使用「我搜到/我查到/联网搜到」等话术");
    expect(a.system).not.toContain("已配置联网检索:调用后素材会先经真实联网搜索");
  });

  it("已配联网检索(probeSearchConfigured=true)→ 注入「已配置联网检索」措辞", async () => {
    const { deps } = makeDeps({
      probeSearchConfigured: async () => true,
    });
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    expect(a.system).toContain("已配置联网检索");
    expect(a.system).not.toContain("未配置联网检索**:你给出的素材来自训练记忆");
  });

  it("probeSearchConfigured 抛错 → 视为未配(诚实降级,不崩装配)", async () => {
    const { deps } = makeDeps({
      probeSearchConfigured: async () => {
        throw new Error("settings unavailable");
      },
    });
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    expect(a.system).toContain("未配置联网检索");
  });

  it("gatherMaterials 有 searchWeb 端口 → 真检索 + grounding=web + sourceUrl 透传", async () => {
    const searchWeb = vi.fn(async () => [
      {
        title: "RAG 复盘",
        url: "https://blog.example.com/rag",
        snippet: "响应砍到 1/5",
        siteName: "example.com",
      },
    ]);
    const { deps } = makeDeps({
      probeSearchConfigured: async () => true,
      searchWeb,
    });
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    const gather = a.tools["material.gather"]! as { execute?: unknown };
    const res = (await runToolExecute(gather, { query: "AI 提效" })) as {
      kind: string;
      grounding: string;
      items: Array<{ sourceUrl?: string; url: string }>;
    };
    // searchWeb 以真 query 被调(前置检索真发生,top 10)。
    expect(searchWeb).toHaveBeenCalledWith(
      ctx,
      "AI 提效",
      expect.objectContaining({ count: 10 }),
    );
    expect(res.kind).toBe("material.gather");
    // 有检索结果 → grounding=web,sourceUrl 透传到工具结果(前端渲可点域名链接)。
    expect(res.grounding).toBe("web");
    expect(res.items[0]?.sourceUrl).toBe("https://blog.example.com/rag");
  });

  it("searchWeb 抛错(未配/超时)→ catch 成 model_memory 降级,不 crash", async () => {
    const searchWeb = vi.fn(async () => {
      throw new Error("SearchConfigError: web.search 未配置");
    });
    const { deps } = makeDeps({ searchWeb });
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    const gather = a.tools["material.gather"]! as { execute?: unknown };
    const res = (await runToolExecute(gather, { query: "X" })) as {
      grounding: string;
    };
    expect(searchWeb).toHaveBeenCalled();
    // 检索抛错被吞 → 走纯记忆综合,grounding=model_memory(诚实降级)。
    expect(res.grounding).toBe("model_memory");
  });
});

// [T-081②] positioning.generate 的真实作品画像 —— formatWorksBrief 纯函数。
describe("[T-081②] formatWorksBrief — 全部作品标题压缩列表", () => {
  const row = (over: Partial<Parameters<typeof formatWorksBrief>[0][number]> = {}) => ({
    title: "普通标题",
    stage: "planning",
    status: "active",
    publishedAt: null,
    ...over,
  });

  it("每条截 40 字加 …,带发布状态标记", () => {
    const long = "这条标题其实是整篇口播文案,几百字都塞在 title 字段里,必须截断到四十个字以内才能进定位提示词";
    const brief = formatWorksBrief(
      [
        row({ title: long, publishedAt: "2026-06-01" }),
        row({ title: "短标题", status: "published" }),
        row({ title: "进行中的一条", stage: "scripting" }),
      ],
      3,
    );
    const lines = brief.split("\n");
    expect(lines).toHaveLength(3);
    // 截 40 字 + …(「· 」前缀 + 40 字 + … + 状态括注)。
    expect(lines[0]).toContain(`${long.slice(0, 40)}…`);
    expect(lines[0]).not.toContain(long.slice(0, 60));
    // 发布状态标记:publishedAt 或 status=published → 已发布;否则 stage。
    expect(lines[0]).toContain("（已发布）");
    expect(lines[1]).toContain("（已发布）");
    expect(lines[2]).toContain("（scripting）");
  });

  it("上限 100 条;total 更大时如实标注剩余", () => {
    const rows = Array.from({ length: 120 }, (_, i) => row({ title: `作品 ${i}` }));
    const brief = formatWorksBrief(rows, 150);
    const lines = brief.split("\n");
    expect(lines).toHaveLength(101); // 100 条 + 剩余标注
    expect(lines[100]).toBe("（另有 50 条未列出）");
  });

  it("空列表 → 空串(调用方整段省略,不注空噪声)", () => {
    expect(formatWorksBrief([], 0)).toBe("");
  });
});

// [T-081①] buildHooksPrompt —— script.hooks 的 prompt 拼装(从 execute 内联提出的纯函数)。
describe("[T-081①] buildHooksPrompt — extraBrief 注入", () => {
  it("extraBrief 非空 → 注入「本次生成指令」段(优先遵循)", () => {
    const prompt = buildHooksPrompt({
      topic: "RAG 实战",
      direction: "冲突感强",
      extraBrief: "用户要求 hook 带真实数据",
      positioningBrief: "AI 工程科普",
    });
    expect(prompt).toContain(EXTRA_BRIEF_HEADING);
    expect(prompt).toContain("用户要求 hook 带真实数据");
    // 原有段落不变。
    expect(prompt).toContain("《RAG 实战》");
    expect(prompt).toContain("方向要求:冲突感强");
    expect(prompt).toContain("AI 工程科普");
  });

  it("extraBrief 空 → 不注入该段(行为与旧 prompt 一致)", () => {
    const prompt = buildHooksPrompt({
      topic: "RAG 实战",
      positioningBrief: "AI 工程科普",
    });
    expect(prompt).not.toContain(EXTRA_BRIEF_HEADING);
  });
});

// [T-055c] script.hooks 的宽容 JSON 解析。
describe("parseHookItems", () => {
  it("剥围栏 + 提取数组 + 收窄字段", () => {
    const raw = '```json\n[{"text":"90% 文档没人看","angle":"反常识"},{"text":"","angle":"空的丢弃"},{"text":"两小时做出小程序"}]\n```';
    expect(parseHookItems(raw)).toEqual([
      { text: "90% 文档没人看", angle: "反常识" },
      { text: "两小时做出小程序", angle: "hook" },
    ]);
  });

  it("不合形输出 → 诚实空数组", () => {
    expect(parseHookItems("抱歉,我无法生成。")).toEqual([]);
    expect(parseHookItems('{"not":"array"}')).toEqual([]);
  });
});

// ── [T-239f S6] 步数收尾:上限可配 + 最后一步禁工具强制总结(prepareStep 纯函数)────────
describe("[T-239f] resolveChatMaxSteps — 步数上限可配", () => {
  it("未配 → 默认 6;非法值 → 默认 6", () => {
    expect(resolveChatMaxSteps({})).toBe(6);
    expect(resolveChatMaxSteps({ CREATOROS_CHAT_MAX_STEPS: "abc" })).toBe(6);
    expect(resolveChatMaxSteps({ CREATOROS_CHAT_MAX_STEPS: "" })).toBe(6);
  });

  it("可配且夹在 [2,12](至少留 1 步给禁工具收尾)", () => {
    expect(resolveChatMaxSteps({ CREATOROS_CHAT_MAX_STEPS: "8" })).toBe(8);
    expect(resolveChatMaxSteps({ CREATOROS_CHAT_MAX_STEPS: "1" })).toBe(2);
    expect(resolveChatMaxSteps({ CREATOROS_CHAT_MAX_STEPS: "99" })).toBe(12);
  });
});

describe("[T-239f] buildChatPrepareStep — 末步禁工具收尾 + T-117 强制工具兼容", () => {
  it("最后一步(stepNumber === maxSteps-1)→ toolChoice:'none'(模型必须文字总结,不再被 stopWhen 静默腰斩)", () => {
    const prep = buildChatPrepareStep({ maxSteps: 6 });
    expect(prep({ stepNumber: 5 })).toEqual({ toolChoice: "none" });
    // 中间步不干预(auto)。
    expect(prep({ stepNumber: 0 })).toEqual({});
    expect(prep({ stepNumber: 4 })).toEqual({});
  });

  it("[T-117 兼容] forcedTool:第 0 步仍强制该工具;末步照旧禁工具", () => {
    const prep = buildChatPrepareStep({
      forcedTool: "topic.enrich",
      maxSteps: 6,
    });
    expect(prep({ stepNumber: 0 })).toEqual({
      toolChoice: { type: "tool", toolName: "topic.enrich" },
    });
    expect(prep({ stepNumber: 1 })).toEqual({});
    expect(prep({ stepNumber: 5 })).toEqual({ toolChoice: "none" });
  });
});

// ── [T-239c S2] 长工具可中断:execute 第二参 abortSignal → 端口 signal(提前退出)────────
describe("[T-239c] 长工具 signal 透传(material.screenshot / web.read)", () => {
  it("material.screenshot:SDK callOptions.abortSignal 经工具 execute 透传到 captureScreenshotPort", async () => {
    const captured: { signal?: AbortSignal } = {};
    const captureScreenshotPort = vi.fn(
      async (
        _ctx: unknown,
        input: { url: string; fullPage?: boolean; signal?: AbortSignal },
      ) => {
        captured.signal = input.signal;
        return {
          assetId: "as-1",
          name: "截图·x",
          previewUrl: null,
          sourceUrl: input.url,
        };
      },
    );
    const { deps } = makeDeps({ captureScreenshotPort });
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    const tool = a.tools["material.screenshot"]! as { execute?: unknown };
    const ac = new AbortController();
    const exec = tool.execute as (i: unknown, o: unknown) => Promise<unknown>;
    const res = (await exec(
      { url: "https://example.com" },
      { toolCallId: "tc", messages: [], context: {}, abortSignal: ac.signal },
    )) as { kind: string; error: string | null };
    expect(res.kind).toBe("material.screenshot");
    expect(res.error).toBeNull();
    // 端口收到的就是本轮请求的 abortSignal(用户点「停止」→ Playwright 层提前退出)。
    expect(captured.signal).toBe(ac.signal);
  });

  it("web.read:同款透传到 readWebUrlPort;端口抛 AbortError → 工具信封人话(不裸抛给 SDK)", async () => {
    const captured: { signal?: AbortSignal } = {};
    const readWebUrlPort = vi.fn(
      async (_ctx: unknown, input: { url: string; signal?: AbortSignal }) => {
        captured.signal = input.signal;
        const err = new Error("已中断:用户停止了本轮对话,网页读取已取消。");
        err.name = "AbortError";
        throw err;
      },
    );
    const { deps } = makeDeps({ readWebUrlPort });
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    const tool = a.tools["web.read"]! as { execute?: unknown };
    const ac = new AbortController();
    ac.abort();
    const exec = tool.execute as (i: unknown, o: unknown) => Promise<unknown>;
    const res = (await exec(
      { url: "https://chatgpt.com/share/x" },
      { toolCallId: "tc", messages: [], context: {}, abortSignal: ac.signal },
    )) as { kind: string; error: string | null };
    expect(captured.signal).toBe(ac.signal);
    // 中断错误进结果信封(execute 内 catch 转人话),kind 不变 → 前端卡渲错误态不崩。
    expect(res.kind).toBe("web.read");
    expect(res.error).toContain("已中断");
  });
});
