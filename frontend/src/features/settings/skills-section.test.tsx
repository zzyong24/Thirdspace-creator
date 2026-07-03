/**
 * SkillsSection 组件测试(T-077a 设置「技能」页签,SPEC 2026-07-03 §1.1):
 *   - 列表按组渲染(对话技能 / 创作节点 / 采集分类)+ 中文名 + 「已定制」徽章;
 *   - 行内展开详情:system/template textarea 初值 = 当前生效值 + facets 说明卡([gate-F2])
 *     + tools/outputSchema 只读;
 *   - 「保存」→ client.putPrompt body = 两个草稿;
 *   - 「恢复默认」(仅已定制显)→ client.putPrompt body = 空串字段(T-040 归一语义);
 *   - 空清单 → 诚实空态。
 */

import * as React from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  putPrompt: vi.fn((input: unknown): Promise<unknown> => Promise.resolve(input)),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    putPrompt: (input: unknown) => mockClient.putPrompt(input),
  },
}));

import { SkillsSection } from "./skills-section";
import type { SkillItem } from "./skills-data";

const SKILLS: readonly SkillItem[] = [
  {
    id: "chatbox.topic",
    version: "v1",
    system: "你是选题编导。",
    template: "{{positioning}}\n【本轮上下文】{{turnContext}}",
    requiredFacets: ["positioning"],
    tools: ["topic.generate", "context.projects"],
    outputSchemaJson: '{\n  "type": "object"\n}',
    customized: false,
  },
  {
    id: "script.draft",
    version: "2",
    system: "你是文案写手。",
    template: "我的结构:{{positioning}}{{outline}}",
    requiredFacets: ["positioning"],
    tools: [],
    outputSchemaJson: null,
    customized: true, // 有有效 override → 徽章亮
  },
  {
    id: "knowledge.classify",
    version: "v1",
    system: "你是知识归类员。",
    template: "{{content}}",
    requiredFacets: ["content"],
    tools: [],
    outputSchemaJson: null,
    customized: false,
  },
];

beforeEach(() => {
  mockRouter.refresh.mockClear();
  mockClient.putPrompt.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("SkillsSection 列表", () => {
  it("按组渲染:对话技能 / 创作节点 / 采集分类,行显中文名 + id", () => {
    const { container, getByText } = render(<SkillsSection skills={SKILLS} />);
    const groups = Array.from(
      container.querySelectorAll('[data-slot="skills-group"]'),
    ).map((n) => n.getAttribute("data-group-key"));
    expect(groups).toEqual(["chat", "creation", "ingestion"]);
    // 中文名来自 SKILL_LABELS 词表。
    expect(getByText("选题编导")).not.toBeNull();
    expect(getByText("写文案")).not.toBeNull();
    expect(getByText("知识归类")).not.toBeNull();
    // id 也显(mono 副标)。
    expect(getByText("script.draft")).not.toBeNull();
  });

  it("「已定制」徽章只在 customized 行显示", () => {
    const { container } = render(<SkillsSection skills={SKILLS} />);
    const customizedRow = container.querySelector(
      '[data-skill-id="script.draft"]',
    );
    expect(
      customizedRow!.querySelector('[data-slot="skill-customized-badge"]'),
    ).not.toBeNull();
    const plainRow = container.querySelector('[data-skill-id="chatbox.topic"]');
    expect(
      plainRow!.querySelector('[data-slot="skill-customized-badge"]'),
    ).toBeNull();
  });

  it("空清单 → 诚实空态(不渲假行)", () => {
    const { container } = render(<SkillsSection skills={[]} />);
    expect(container.querySelector('[data-slot="skills-empty"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="skill-row"]')).toBeNull();
  });
});

describe("SkillsSection 详情(行内展开)", () => {
  function expand(container: HTMLElement, id: string) {
    const toggle = container.querySelector(
      `[data-skill-id="${id}"] [data-slot="skill-row-toggle"]`,
    )!;
    fireEvent.click(toggle);
  }

  it("展开:textarea 初值 = 当前生效值;facets 卡逐行占位符 + 中文含义;tools/schema 只读", () => {
    const { container } = render(<SkillsSection skills={SKILLS} />);
    expand(container, "chatbox.topic");
    const detail = container.querySelector('[data-slot="skill-detail"]')!;
    const systemInput = detail.querySelector<HTMLTextAreaElement>(
      '[data-slot="skill-system-input"]',
    )!;
    const templateInput = detail.querySelector<HTMLTextAreaElement>(
      '[data-slot="skill-template-input"]',
    )!;
    expect(systemInput.value).toBe("你是选题编导。");
    expect(templateInput.value).toContain("{{positioning}}");
    // [gate-F2] facets 说明卡:requiredFacets(positioning,必需)+ 模板占位符(turnContext)。
    const facetRows = Array.from(
      detail.querySelectorAll('[data-slot="skill-facet-row"]'),
    ).map((n) => n.getAttribute("data-facet-name"));
    expect(facetRows).toEqual(["positioning", "turnContext"]);
    expect(detail.textContent).toContain("{{positioning}}");
    expect(detail.textContent).toContain("账号定位简报");
    // tools / outputSchema 只读展示。
    expect(detail.querySelector('[data-slot="skill-tools"]')!.textContent).toContain(
      "topic.generate",
    );
    expect(
      detail.querySelector('[data-slot="skill-output-schema"]'),
    ).not.toBeNull();
    // 未定制 → 无「恢复默认」按钮(假按钮不上)。
    expect(
      detail.querySelector('[data-slot="skill-restore-default"]'),
    ).toBeNull();
  });

  it("改 template 点保存 → putPrompt body = 两个草稿(settings.prompts.put)+ refresh", async () => {
    const { container } = render(<SkillsSection skills={SKILLS} />);
    expand(container, "script.draft");
    const detail = container.querySelector('[data-slot="skill-detail"]')!;
    const templateInput = detail.querySelector<HTMLTextAreaElement>(
      '[data-slot="skill-template-input"]',
    )!;
    const save = detail.querySelector<HTMLButtonElement>(
      '[data-slot="skill-save"]',
    )!;
    // 未改动 → 保存禁用(不发空 put)。
    expect(save.disabled).toBe(true);
    fireEvent.change(templateInput, {
      target: { value: "新结构:{{positioning}},禁用营销腔" },
    });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(mockClient.putPrompt).toHaveBeenCalledTimes(1));
    expect(mockClient.putPrompt).toHaveBeenCalledWith({
      params: { id: "script.draft" },
      query: undefined,
      body: {
        system: "你是文案写手。",
        template: "新结构:{{positioning}},禁用营销腔",
      },
    });
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });

  it("已定制行显「恢复默认」→ putPrompt body = 空串字段(T-040 空串归一 undefined)", async () => {
    const { container } = render(<SkillsSection skills={SKILLS} />);
    expand(container, "script.draft");
    const restore = container.querySelector<HTMLButtonElement>(
      '[data-slot="skill-restore-default"]',
    )!;
    expect(restore).not.toBeNull();
    fireEvent.click(restore);
    await waitFor(() => expect(mockClient.putPrompt).toHaveBeenCalledTimes(1));
    expect(mockClient.putPrompt).toHaveBeenCalledWith({
      params: { id: "script.draft" },
      query: undefined,
      body: { system: "", template: "" },
    });
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });

  it("putPrompt 失败 → 就地报错,不假装保存成功", async () => {
    mockClient.putPrompt.mockRejectedValueOnce(new Error("boom"));
    const { container } = render(<SkillsSection skills={SKILLS} />);
    expand(container, "script.draft");
    const detail = container.querySelector('[data-slot="skill-detail"]')!;
    fireEvent.change(
      detail.querySelector('[data-slot="skill-system-input"]')!,
      { target: { value: "改一下" } },
    );
    fireEvent.click(detail.querySelector('[data-slot="skill-save"]')!);
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="skill-save-error"]'),
      ).not.toBeNull(),
    );
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });
});
