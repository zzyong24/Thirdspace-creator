import { describe, it, expect } from "vitest";
import { z } from "zod";
import { bindPrompt, PromptBindError, type PromptTemplate } from "./template";
import {
  registerTemplate,
  registerAllTemplates,
  getTemplate,
  hasTemplate,
  listTemplates,
  getTools,
  resolveOutputSchema,
  hasOutputSchema,
  exportSkillSchema,
  overrideTemplates,
  overrideTemplatesFromConfig,
  clearSchemaOverride,
  _resetRegistry,
} from "./registry";
import { asSchema } from "ai";
import { TOPIC_GENERATE_TEMPLATE } from "./templates/topic-generate";

const TPL: PromptTemplate = {
  id: "test.cap",
  version: "v1",
  system: "你是测试 agent。",
  template: "定位:{{positioning}}\n风格:{{style}}\n依据:{{basisHint}}",
  requiredFacets: ["positioning", "basisHint"],
};

describe("bindPrompt", () => {
  it("注入 facets 并替换占位 + 透传 system", () => {
    const b = bindPrompt(TPL, {
      positioning: "AI 工程科普",
      style: "硬核",
      basisHint: "蹭热点",
    });
    expect(b.system).toBe("你是测试 agent。");
    expect(b.prompt).toContain("定位:AI 工程科普");
    expect(b.prompt).toContain("风格:硬核");
    expect(b.prompt).toContain("依据:蹭热点");
  });

  it("缺必需 facet → 抛 PromptBindError(不静默拼空)", () => {
    expect(() => bindPrompt(TPL, { positioning: "x" })).toThrow(PromptBindError);
    expect(() => bindPrompt(TPL, { positioning: "x", basisHint: "" })).toThrow(
      /缺必需 facet: basisHint/,
    );
  });

  it("非必需占位未提供 → 替换为空串(不报错)", () => {
    const b = bindPrompt(TPL, { positioning: "x", basisHint: "y" });
    expect(b.prompt).toContain("风格:\n"); // style 未提供,空串
  });
});

describe("registry", () => {
  it("注册/取/覆盖(PROMPT-04 服务端推送落点)", () => {
    _resetRegistry();
    registerTemplate(TPL);
    expect(hasTemplate("test.cap")).toBe(true);
    expect(getTemplate("test.cap").version).toBe("v1");
    // 外部源覆盖同 id
    overrideTemplates([{ ...TPL, version: "v2", system: "覆盖版" }]);
    expect(getTemplate("test.cap").version).toBe("v2");
    expect(getTemplate("test.cap").system).toBe("覆盖版");
  });

  it("未注册 → 抛错", () => {
    _resetRegistry();
    expect(() => getTemplate("nope")).toThrow(/未注册/);
  });

  // T-077a 技能管理面:listTemplates 只读列表入口。
  it("listTemplates:空表惰性 bootstrap 内置全量;含内置 id 且反映覆盖后的生效值", () => {
    _resetRegistry();
    const all = listTemplates();
    // 内置 18+ 个 skill 全量注册(数量随内置模板增长,下限断言防退化)。
    expect(all.length).toBeGreaterThanOrEqual(18);
    const ids = all.map((t) => t.id);
    expect(ids).toContain("topic.generate");
    expect(ids).toContain("script.draft");
    expect(ids).toContain("chatbox.topic");
    expect(ids).toContain("knowledge.classify");
    expect(ids).not.toContain("planning.thesis");
    // 覆盖后再列 → 反映当前生效文本(管理面「当前生效值」语义)。
    overrideTemplatesFromConfig([
      { id: "script.draft", template: "自定义结构:{{positioning}}" },
    ]);
    const after = listTemplates();
    expect(
      after.find((t) => t.id === "script.draft")?.template,
    ).toBe("自定义结构:{{positioning}}");
    // 数量不因覆盖而变(覆盖是同 id 替换,不是新增)。
    expect(after.length).toBe(all.length);
  });

  it("listTemplates:返回浅拷贝数组,调用方改动不影响 registry", () => {
    _resetRegistry();
    const all = listTemplates();
    const n = all.length;
    all.pop();
    expect(listTemplates().length).toBe(n);
  });
});

describe("内置模板:topic.generate 可绑定", () => {
  it("装配定位+依据 → 出可用 prompt(证明选题节点的解耦)", () => {
    const b = bindPrompt(TOPIC_GENERATE_TEMPLATE, {
      positioning: "AI 工程科普,面向开发者",
      basisHint: "蹭当下热点",
    });
    expect(b.prompt).toContain("AI 工程科普");
    expect(b.prompt).toContain("蹭当下热点");
    // T-025:topic.generate 输出契约改结构化(顶层对象 { topics:[...] }),不再是裸 JSON 数组。
    expect(b.prompt).toContain("JSON 对象");
  });
});

// ── 三位一体(SPEC §4.1):registry 带 tools + outputSchema 一等字段 ──────────────────────────
const SKILL: PromptTemplate = {
  id: "test.skill",
  version: "v1",
  system: "你是测试 skill。",
  template: "上下文:{{ctx}}",
  requiredFacets: ["ctx"],
  tools: ["topic.generate", "topic.enrich"],
  outputSchema: z.object({
    reply: z.string(),
    candidates: z.array(z.object({ title: z.string() })).min(1),
  }),
};

describe("registry 三位一体:tools + outputSchema 一等字段(SPEC §4.1)", () => {
  it("注册即随对象带上 tools + outputSchema,可经 getTools/resolveOutputSchema 取", () => {
    _resetRegistry();
    registerTemplate(SKILL);
    expect(getTools("test.skill")).toEqual([
      "topic.generate",
      "topic.enrich",
    ]);
    expect(hasOutputSchema("test.skill")).toBe(true);
    // resolveOutputSchema 返回的就是这份 Zod 契约(safeParse 卡形状)。
    const schema = resolveOutputSchema("test.skill") as typeof SKILL.outputSchema;
    expect(schema!.safeParse({ reply: "hi", candidates: [{ title: "t" }] }).success).toBe(
      true,
    );
    expect(schema!.safeParse({ reply: "hi", candidates: [] }).success).toBe(false);
  });

  it("overrideTemplates(Zod 形式)整组替换 tools + outputSchema 生效", () => {
    _resetRegistry();
    registerTemplate(SKILL);
    overrideTemplates([
      {
        ...SKILL,
        version: "v2",
        tools: ["calibration.diagnose"],
        outputSchema: z.object({ reply: z.string() }), // 收窄:不再要 candidates
      },
    ]);
    expect(getTemplate("test.skill").version).toBe("v2");
    expect(getTools("test.skill")).toEqual(["calibration.diagnose"]);
    const schema = resolveOutputSchema("test.skill") as z.ZodType;
    // 新契约:只要 reply 就过(老契约会因缺 candidates 而拒)。
    expect(schema.safeParse({ reply: "hi" }).success).toBe(true);
  });

  it("内置 chatbox.topic skill:三位齐全(模板 ⊕ 工具白名单 ⊕ 两段输出契约)", () => {
    _resetRegistry();
    registerAllTemplates();
    expect(getTools("chatbox.topic")).toContain("topic.generate");
    // [T-062a] 对话手录经验工具进选题/项目 surface 白名单(project surface 复用 chatbox.topic)。
    expect(getTools("chatbox.topic")).toContain("learning.capture");
    // [T-077b] 对话填策划工具(「帮我把选题卡填了」→ 字段对照候选卡,人点才 patch)。
    expect(getTools("chatbox.topic")).toContain("brief.fill");
    expect(hasOutputSchema("chatbox.topic")).toBe(true);
    const schema = resolveOutputSchema("chatbox.topic") as z.ZodType;
    // 两段 { reply, ... }:reply 必填;candidates/nextActions 默认空数组。
    expect(schema.safeParse({ reply: "给你 3 条" }).success).toBe(true);
    expect(schema.safeParse({ candidates: [] }).success).toBe(false); // 缺 reply
  });

  it("内置各 surface chatbox skill(校准/定位/复盘):三位齐全 + 工具白名单对齐首波 5 工具", () => {
    _resetRegistry();
    registerAllTemplates();
    // 工具白名单对齐首波 5 工具(SPEC §3.4):各 surface 各挂自己那个专用工具。
    expect(getTools("chatbox.calibration")).toContain("calibration.diagnose");
    expect(getTools("chatbox.positioning")).toContain("positioning.generate");
    expect(getTools("chatbox.review")).toContain("review.analyze");
    // [T-062a] 复盘对话可手录经验(「记一条经验:…」→ 候选卡 → 人点才落库)。
    expect(getTools("chatbox.review")).toContain("learning.capture");
    // 每轮输出契约都两段:reply 必填,缺它即不合形状(防退化成 chatbot)。
    for (const id of [
      "chatbox.calibration",
      "chatbox.positioning",
      "chatbox.review",
    ]) {
      expect(hasOutputSchema(id)).toBe(true);
      const s = resolveOutputSchema(id) as z.ZodType;
      expect(s.safeParse({ reply: "好的" }).success).toBe(true);
      expect(s.safeParse({}).success).toBe(false); // 缺 reply
    }
    // skill 特定结构按形状校验(校准=逐维度评分;score 卡 1-5)。
    const cal = resolveOutputSchema("chatbox.calibration") as z.ZodType;
    expect(
      cal.safeParse({
        reply: "诊断如下",
        diagnoses: [
          {
            subjectTitle: "标题",
            dimensions: [{ key: "hook", score: 4, reason: "强" }],
            verdict: "可发",
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      cal.safeParse({
        reply: "x",
        diagnoses: [
          { subjectTitle: "t", dimensions: [{ key: "k", score: 9, reason: "" }] },
        ],
      }).success,
    ).toBe(false); // score 越界(>5)
  });

  it("calibration.score 的 outputSchema 收口到 registry(不再靠调用方手传)", () => {
    _resetRegistry();
    registerAllTemplates();
    const schema = resolveOutputSchema("calibration.score") as z.ZodType;
    expect(
      schema.safeParse({
        dimensions: [{ key: "hook", score: 4, reason: "完播率高" }],
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ dimensions: [{ key: "hook", score: 9, reason: "x" }] })
        .success,
    ).toBe(false); // 1-5 整数,9 越界
  });

  it("纯生成 skill(无 outputSchema)→ resolveOutputSchema 抛错(不该走结构化节点)", () => {
    _resetRegistry();
    registerTemplate({
      id: "plain.gen",
      version: "v1",
      system: "s",
      template: "t",
      requiredFacets: [],
    });
    expect(getTools("plain.gen")).toEqual([]);
    expect(hasOutputSchema("plain.gen")).toBe(false);
    expect(() => resolveOutputSchema("plain.gen")).toThrow(/未声明 outputSchema/);
  });
});

// ── 配置口子(SPEC §4.3):JSON Schema 往返 + override 运行时套用 ──────────────────────────────
describe("配置口子:JSON Schema 往返(zod → JSON Schema → 校验器)", () => {
  it("exportSkillSchema 把内置 Zod 契约导成 JSON Schema(properties/required 保真)", () => {
    _resetRegistry();
    registerAllTemplates();
    const js = exportSkillSchema("chatbox.topic");
    expect(js).not.toBeNull();
    const props = (js as Record<string, unknown>).properties as Record<
      string,
      unknown
    >;
    expect(props).toHaveProperty("reply");
    expect(props).toHaveProperty("candidates");
    expect((js as Record<string, unknown>).required).toContain("reply");
  });

  it("overrideTemplatesFromConfig 用 JSON Schema 覆盖 outputSchema → 运行时校验器套用(校验通过/不符拒)", async () => {
    _resetRegistry();
    registerAllTemplates();
    // 后台/服务端「下发」的新契约(JSON Schema 形式,Zod 不可序列化):要求 reply + verdict(枚举)。
    const downstreamJsonSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        reply: { type: "string" },
        verdict: { type: "string", enum: ["pass", "fail"] },
      },
      required: ["reply", "verdict"],
      additionalProperties: false,
    } as const;
    overrideTemplatesFromConfig([
      {
        id: "chatbox.topic",
        system: "覆盖后的系统提示",
        tools: ["calibration.diagnose"],
        outputSchema: downstreamJsonSchema as Record<string, unknown>,
      },
    ]);
    // 文本/白名单字段就地覆盖。
    expect(getTemplate("chatbox.topic").system).toBe("覆盖后的系统提示");
    expect(getTools("chatbox.topic")).toEqual(["calibration.diagnose"]);
    // outputSchema 改走 SCHEMA_OVERRIDES:resolveOutputSchema 返回的 SDK schema 用回灌的 ajv 校验器
    // 卡形状 —— 这正是 generateObject 会消费的同一个 schema 点。
    const sdkSchema = asSchema(resolveOutputSchema("chatbox.topic"));
    const ok = await sdkSchema.validate!({ reply: "x", verdict: "pass" });
    const badEnum = await sdkSchema.validate!({ reply: "x", verdict: "maybe" });
    const badMissing = await sdkSchema.validate!({ reply: "x" });
    // 旧 Zod 契约里 candidates/nextActions 此刻不再是约束(已被新 JSON Schema 顶替)。
    expect(ok.success).toBe(true);
    expect(badEnum.success).toBe(false); // 枚举不符 → 拒
    expect(badMissing.success).toBe(false); // 缺 verdict → 拒
    // 撤掉覆盖 → 回落内置 Zod 契约(两段 { reply, candidates, nextActions })。
    clearSchemaOverride("chatbox.topic");
    const back = resolveOutputSchema("chatbox.topic") as z.ZodType;
    expect(back.safeParse({ reply: "x" }).success).toBe(true);
    expect(back.safeParse({ reply: "x", verdict: "pass" }).success).toBe(true); // verdict 非约束了
  });

  it("overrideTemplatesFromConfig 覆盖未注册 id → 抛错(不凭空建 skill)", () => {
    _resetRegistry();
    registerAllTemplates();
    expect(() =>
      overrideTemplatesFromConfig([{ id: "nope.skill", system: "x" }]),
    ).toThrow(/未注册/);
  });
});

// [T-245] 编导热点能力认知:选题 surface 的 system 明说 trend 出题会自动拉已登记信源信号,
// 并禁止自称「没有实时热点拉取能力」(T-235b 信源系统已建,prompt 不说编导就不知道)。
describe("[T-245] chatbox.topic system — 热点能力认知", () => {
  it("system 含 basis=trend 信源机制 + 禁自称没热点能力", async () => {
    const { CHATBOX_TOPIC_TEMPLATE } = await import("./templates/chatbox-turn");
    expect(CHATBOX_TOPIC_TEMPLATE.system).toContain("basis=trend");
    expect(CHATBOX_TOPIC_TEMPLATE.system).toContain(
      "『内容雷达』已登记网页/RSS 来源",
    );
    expect(CHATBOX_TOPIC_TEMPLATE.system).toContain("『内容雷达』");
    expect(CHATBOX_TOPIC_TEMPLATE.system).toContain(
      "绝不自称「没有实时热点拉取能力」",
    );
  });
});
