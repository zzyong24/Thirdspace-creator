import { describe, it, expect } from "vitest";
import { bindPrompt, PromptBindError, type PromptTemplate } from "./template";
import {
  registerTemplate,
  getTemplate,
  hasTemplate,
  overrideTemplates,
  _resetRegistry,
} from "./registry";
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
});

describe("内置模板:topic.generate 可绑定", () => {
  it("装配定位+依据 → 出可用 prompt(证明选题节点的解耦)", () => {
    const b = bindPrompt(TOPIC_GENERATE_TEMPLATE, {
      positioning: "AI 工程科普,面向开发者",
      basisHint: "蹭当下热点",
    });
    expect(b.prompt).toContain("AI 工程科普");
    expect(b.prompt).toContain("蹭当下热点");
    expect(b.prompt).toContain("JSON 数组");
  });
});
