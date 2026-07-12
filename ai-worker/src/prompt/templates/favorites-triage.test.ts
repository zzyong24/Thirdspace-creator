import { describe, it, expect } from "vitest";
import { bindPrompt } from "../template";
import {
  FAVORITES_TRIAGE_TEMPLATE,
  favoritesTriageSchema,
} from "./favorites-triage";

// [T-235d-distill] favorites.triage 模板 + Zod 输出契约。断言:必需 facet 注入、诚实门在 system
// (空/无信息判 skip)、schema 三态枚举 + default 最保守态(skip,不误灌知识库)。

const TITLE = "3 个提示词技巧";
const TRANSCRIPT = "大家好,今天讲上下文工程的第一性原理……";

describe("favorites.triage 模板", () => {
  it("title + transcript 注入 → 落进最终 prompt,无占位残留", () => {
    const { system, prompt } = bindPrompt(FAVORITES_TRIAGE_TEMPLATE, {
      title: TITLE,
      transcript: TRANSCRIPT,
    });
    expect(prompt).toContain(TITLE);
    expect(prompt).toContain(TRANSCRIPT);
    expect(prompt).not.toMatch(/\{\{[a-zA-Z]/);
    // 诚实门:空/无信息一律 skip,绝不硬判 knowledge。
    expect(system).toContain("skip");
    expect(system).toContain("绝不为凑数硬判");
  });

  it("缺必需 facet → bindPrompt 报错(不静默拼空)", () => {
    expect(() =>
      bindPrompt(FAVORITES_TRIAGE_TEMPLATE, { title: TITLE }),
    ).toThrow(/transcript/);
  });

  it("requiredFacets = [title, transcript]", () => {
    expect(FAVORITES_TRIAGE_TEMPLATE.requiredFacets).toEqual([
      "title",
      "transcript",
    ]);
  });

  it("outputSchema:三态枚举校验 + reason", () => {
    for (const verdict of ["knowledge", "topic", "skip"] as const) {
      const parsed = favoritesTriageSchema.parse({ verdict, reason: "依据" });
      expect(parsed.verdict).toBe(verdict);
      expect(parsed.reason).toBe("依据");
    }
  });

  it("缺字段 → default 最保守态 skip + reason 空串(老 provider 落空也过校验,不误灌库)", () => {
    const parsed = favoritesTriageSchema.parse({});
    expect(parsed.verdict).toBe("skip");
    expect(parsed.reason).toBe("");
  });

  it("枚举非法值 → 校验失败(runStructuredNode 重试,不给伪装)", () => {
    expect(() =>
      favoritesTriageSchema.parse({ verdict: "maybe", reason: "x" }),
    ).toThrow();
  });
});
