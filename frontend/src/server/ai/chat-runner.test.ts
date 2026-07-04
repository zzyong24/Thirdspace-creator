import { describe, it, expect, vi, beforeAll } from "vitest";
import { registerAllTemplates } from "@creatoros/ai-worker";
import {
  buildChatAssembly,
  buildHooksPrompt,
  formatWorksBrief,
  EXTRA_BRIEF_HEADING,
  type AssembleChatDeps,
  parseHookItems,
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

  it("工具白名单层:挂上 chatbox.topic 的白名单工具(topic.* + 3 个只读 context 工具)", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    expect(Object.keys(a.tools).sort()).toEqual([
      "brief.fill",
      "context.comments",
      "context.knowledge",
      "context.materials",
      "context.projects",
      "learning.capture",
      "material.gather",
      "positioning.generate",
      "script.draft",
      "script.hooks",
      "topic.enrich",
      "topic.generate",
    ]);
  });

  it("[T-077c] 技能自感知:skillsBrief 注入 system(每白名单工具一行「中文名(工具名):用途」,行数=白名单数、≤20)", async () => {
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
    // 行数 = 白名单工具数(≤20,gate-F1 截断上限)。
    const brief = a.system
      .split("【你的技能清单")[1]!
      .split("\n\n")[0]!
      .split("\n")
      .filter((l) => /\(.+\):/.test(l));
    expect(brief).toHaveLength(whitelist.length);
    expect(brief.length).toBeLessThanOrEqual(20);
  });

  it("[T-077c] skillsBrief 按 surface 白名单收窄:review 面只列 review.analyze + learning.capture,不编造别面能力", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "review" }, deps);
    expect(a.system).toContain("复盘提炼(review.analyze):");
    expect(a.system).toContain("记录经验(learning.capture):");
    // 不在复盘白名单的工具绝不出现在清单里(自感知与真实能力一致)。
    expect(a.system).not.toContain("(topic.generate):");
    expect(a.system).not.toContain("(context.projects):");
  });

  it("按 skill 能力解析 model(resolveModelSpec 被以 topic.generate 调用)", async () => {
    const { deps, resolveModelSpec } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    expect(resolveModelSpec).toHaveBeenCalledWith(ctx, "topic.generate");
    expect(a.modelSpec).toEqual(FAKE_SPEC);
  });

  it("surface=calibration → chatbox.calibration skill + 挂 calibration.diagnose 工具", async () => {
    const { deps, resolveModelSpec } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "calibration" }, deps);
    expect(a.skillId).toBe("chatbox.calibration");
    expect(Object.keys(a.tools).sort()).toEqual([
      "calibration.diagnose",
      "context.comments",
      "context.knowledge",
      "context.materials",
      "context.projects",
    ]);
    // 主能力档按 calibration.diagnose 解析(各 surface 复用对应节点的模型配置)。
    expect(resolveModelSpec).toHaveBeenCalledWith(ctx, "calibration.diagnose");
  });

  it("surface=positioning → chatbox.positioning skill + 挂 positioning.generate 工具", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "positioning" }, deps);
    expect(a.skillId).toBe("chatbox.positioning");
    expect(Object.keys(a.tools).sort()).toEqual([
      "context.comments",
      "context.knowledge",
      "context.materials",
      "context.projects",
      "positioning.generate",
    ]);
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

  it("surface=review → chatbox.review skill + 只挂 review.analyze(收紧:不挂 context.projects/knowledge/materials,防拉全作品标题凑数)", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "review" }, deps);
    expect(a.skillId).toBe("chatbox.review");
    // T-039a:复盘只聚焦当前这一条作品 → 只挂 review.analyze(它基于注入的这条真材料)。
    // 刻意去掉 context.projects(列全作品标题)等,防 MiniMax 把其他作品标题当经验凑数。
    // [T-062a] + learning.capture:复盘对话可手录经验(候选卡,人点才落库)。
    expect(Object.keys(a.tools).sort()).toEqual([
      "learning.capture",
      "review.analyze",
    ]);
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

  it("functionKey 越权(不在该 skill 白名单)→ 不挂越权工具(防越权)", async () => {
    const { deps } = makeDeps();
    // 选题页 functionKey 给了校准工具(越权)→ 白名单不变,只挂选题工具 + 只读 context 工具。
    const a = await buildChatAssembly(
      ctx,
      { surface: "topics", functionKey: "calibration.diagnose" },
      deps,
    );
    expect(Object.keys(a.tools).sort()).toEqual([
      "brief.fill",
      "context.comments",
      "context.knowledge",
      "context.materials",
      "context.projects",
      "learning.capture",
      "material.gather",
      "positioning.generate",
      "script.draft",
      "script.hooks",
      "topic.enrich",
      "topic.generate",
    ]);
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
    const result = (await runToolExecute(a.tools["context.projects"], {
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
    const result = (await runToolExecute(a.tools["brief.fill"], {
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
    const result = (await runToolExecute(a.tools["brief.fill"], {
      targetAudience: "AI 新手",
    })) as { current: unknown };
    expect(result.current).toBeNull();
  });

  it("contextReaders 未装配 → context 工具读到空(诚实降级,不报错、不塞假数据)", async () => {
    const { deps } = makeDeps({ contextReaders: undefined });
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    const result = (await runToolExecute(a.tools["context.knowledge"], {
      query: "x",
    })) as { kind: string; items: unknown[] };
    expect(result.kind).toBe("context.knowledge");
    expect(result.items).toEqual([]);
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
    const gather = a.tools["material.gather"] as { execute?: unknown };
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
    const gather = a.tools["material.gather"] as { execute?: unknown };
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
