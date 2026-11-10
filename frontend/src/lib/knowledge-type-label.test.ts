import { describe, expect, it } from "vitest";
import { knowledgeTypeLabelZh } from "./knowledge-type-label";
import { knowledgeTypeLabel } from "@/fixtures/selectors/knowledge";

describe("知识类型显示中文（月明录屏 2026-11-10）", () => {
  it("四原子显示 金句/证据/观点/观众问题，未知类型不漏英文", () => {
    expect(["quote", "evidence", "claim", "qa"].map(knowledgeTypeLabelZh)).toEqual(["金句", "证据", "观点", "观众问题"]);
    expect(knowledgeTypeLabelZh("weird_enum")).toBe("资料");
  });
  it("知识库选择器不再把原子类型原样返回英文", () => {
    for (const type of ["quote", "evidence", "claim", "qa"]) expect(knowledgeTypeLabel(type)).not.toMatch(/[a-z]/);
  });
});
