/**
 * SkillsSection 组件测试(T-077a 设置「技能」页签,SPEC 2026-07-03 §1.1):
 *   - 列表按组渲染(对话技能 / 创作节点 / 采集分类)+ 中文名 + 「已定制」徽章;
 *   - 行内展开详情:system/template textarea 初值 = 当前生效值 + facets 说明卡([gate-F2])
 *     + tools/outputSchema 只读;
 *   - 「保存」→ client.putPrompt 只提交被编辑的账号增量;
 *   - completionPolicy 可编辑、基础校验、服务端不兼容原因可见、null 恢复官方策略;
 *   - 「恢复默认」(每个技能都有,未定制禁用)→ null 删除账号提示词增量;
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
    accountId: "account-a",
    id: "chatbox.topic",
    version: "v1",
    rowRevision: null,
    system: "你是选题编导。",
    template: "{{positioning}}\n【本轮上下文】{{turnContext}}",
    requiredFacets: ["positioning"],
    tools: ["topic.generate", "context.projects"],
    outputSchemaJson: '{\n  "type": "object"\n}',
    completionPolicySupported: false,
    completionPolicy: null,
    officialCompletionPolicy: null,
    completionPolicyCustomized: false,
    customized: false,
  },
  {
    accountId: "account-a",
    id: "script.draft",
    version: "2",
    rowRevision: 2,
    system: "你是文案写手。",
    template: "我的结构:{{positioning}}{{outline}}",
    requiredFacets: ["positioning"],
    tools: [],
    outputSchemaJson: null,
    completionPolicySupported: true,
    completionPolicy: {
      schemaVersion: 1,
      minSegments: 6,
      maxSegments: 10,
      requiredSequence: ["hook", "body", "cta"],
      repairAttempts: 2,
    },
    officialCompletionPolicy: {
      schemaVersion: 1,
      minSegments: 6,
      maxSegments: 10,
      requiredSequence: ["hook", "body", "cta"],
      repairAttempts: 2,
    },
    completionPolicyCustomized: false,
    customized: true, // 有有效 override → 徽章亮
  },
  {
    accountId: "account-a",
    id: "knowledge.classify",
    version: "v1",
    rowRevision: null,
    system: "你是知识归类员。",
    template: "{{content}}",
    requiredFacets: ["content"],
    tools: [],
    outputSchemaJson: null,
    completionPolicySupported: false,
    completionPolicy: null,
    officialCompletionPolicy: null,
    completionPolicyCustomized: false,
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
    // 未定制 → 「恢复默认」按钮**仍在**(每个技能都有,用户要求),但**禁用**(用的就是内置默认,无 override 可恢复)。
    const restoreBtn = detail.querySelector<HTMLButtonElement>(
      '[data-slot="skill-restore-default"]',
    );
    expect(restoreBtn).not.toBeNull();
    expect(restoreBtn!.disabled).toBe(true);
  });

  it("只改 template 时不制造冗余策略覆盖(settings.prompts.put)+ refresh", async () => {
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
        expectedRevision: 2,
        patch: {
          system: "你是文案写手。",
          template: "新结构:{{positioning}},禁用营销腔",
        },
      },
    });
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });

  it("可编辑并保存当前账号的完整性策略，不把 hook/CTA 写死在前端", async () => {
    const { container } = render(<SkillsSection skills={SKILLS} />);
    expand(container, "script.draft");

    const detail = container.querySelector('[data-slot="skill-detail"]')!;
    expect(
      detail.querySelector('[data-slot="skill-completion-policy"]'),
    ).not.toBeNull();
    fireEvent.change(
      detail.querySelector('[data-slot="skill-policy-min-segments"]')!,
      { target: { value: "1" } },
    );
    fireEvent.change(
      detail.querySelector('[data-slot="skill-policy-max-segments"]')!,
      { target: { value: "1" } },
    );
    fireEvent.change(
      detail.querySelector('[data-slot="skill-policy-required-sequence"]')!,
      { target: { value: "monologue" } },
    );
    fireEvent.change(
      detail.querySelector('[data-slot="skill-policy-repair-attempts"]')!,
      { target: { value: "1" } },
    );
    fireEvent.click(detail.querySelector('[data-slot="skill-save"]')!);

    await waitFor(() => expect(mockClient.putPrompt).toHaveBeenCalledTimes(1));
    expect(mockClient.putPrompt).toHaveBeenCalledWith({
      params: { id: "script.draft" },
      query: undefined,
      body: {
        expectedRevision: 2,
        patch: {
          system: "你是文案写手。",
          template: "我的结构:{{positioning}}{{outline}}",
          completionPolicy: {
            schemaVersion: 1,
            minSegments: 1,
            maxSegments: 1,
            requiredSequence: ["monologue"],
            repairAttempts: 1,
          },
        },
      },
    });
  });

  it("不合法的完整性策略在前端阻止发送并显示原因", async () => {
    const { container, getByText } = render(
      <SkillsSection skills={SKILLS} />,
    );
    expand(container, "script.draft");
    const detail = container.querySelector('[data-slot="skill-detail"]')!;
    fireEvent.change(
      detail.querySelector('[data-slot="skill-policy-min-segments"]')!,
      { target: { value: "9" } },
    );
    fireEvent.change(
      detail.querySelector('[data-slot="skill-policy-max-segments"]')!,
      { target: { value: "2" } },
    );
    fireEvent.click(detail.querySelector('[data-slot="skill-save"]')!);

    expect(getByText("最多段数不能小于最少段数。")).toBeTruthy();
    expect(mockClient.putPrompt).not.toHaveBeenCalled();
  });

  it("服务端判定策略与 outputSchema 不兼容时原样显示原因", async () => {
    mockClient.putPrompt.mockRejectedValueOnce(
      new Error(
        "HttpTransport: completionPolicy 与 outputSchema 不兼容：缺少 role 字段",
      ),
    );
    const { container, getByText } = render(
      <SkillsSection skills={SKILLS} />,
    );
    expand(container, "script.draft");
    const detail = container.querySelector('[data-slot="skill-detail"]')!;
    fireEvent.change(
      detail.querySelector('[data-slot="skill-policy-min-segments"]')!,
      { target: { value: "7" } },
    );
    fireEvent.click(detail.querySelector('[data-slot="skill-save"]')!);

    expect(
      await waitFor(() =>
        getByText(/completionPolicy 与 outputSchema 不兼容/),
      ),
    ).toBeTruthy();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });

  it("完整性策略可单独恢复官方默认，使用 null 删除账号增量", async () => {
    const policyCustomizedSkills: readonly SkillItem[] = [
      {
        ...SKILLS[1]!,
        completionPolicyCustomized: true,
      },
    ];
    const { container } = render(
      <SkillsSection skills={policyCustomizedSkills} />,
    );
    expand(container, "script.draft");

    fireEvent.click(
      container.querySelector('[data-slot="skill-policy-restore-default"]')!,
    );

    await waitFor(() => expect(mockClient.putPrompt).toHaveBeenCalledTimes(1));
    expect(mockClient.putPrompt).toHaveBeenCalledWith({
      params: { id: "script.draft" },
      query: undefined,
      body: {
        expectedRevision: 2,
        patch: { completionPolicy: null },
      },
    });
  });

  it("已定制行显「恢复默认」→ null 删除账号增量字段", async () => {
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
      body: {
        expectedRevision: 2,
        patch: { system: null, template: null },
      },
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

  it("账号 revision 冲突 → 明示刷新，禁止把旧草稿冒充保存成功", async () => {
    mockClient.putPrompt.mockRejectedValueOnce({
      code: "ConflictError",
      details: { domainCode: "SKILL_OVERLAY_REVISION_CONFLICT" },
      message: "Skill 覆盖已被其他请求修改",
    });
    const { container, getByText } = render(
      <SkillsSection skills={SKILLS} />,
    );
    expand(container, "script.draft");
    fireEvent.change(
      container.querySelector('[data-slot="skill-system-input"]')!,
      { target: { value: "并发修改" } },
    );
    fireEvent.click(container.querySelector('[data-slot="skill-save"]')!);
    await waitFor(() =>
      expect(
        getByText("该账号的技能配置已在别处更新，请刷新后再编辑。"),
      ).not.toBeNull(),
    );
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });

  it("官方基座升级后增量不兼容 → 展示真实原因，不建议盲重试", async () => {
    mockClient.putPrompt.mockRejectedValueOnce(
      new Error(
        "HttpTransport: 400 for settings.prompts.put: Skill 增量与当前官方基座不兼容: 上下文字段 oldFacet 没有官方 reader",
      ),
    );
    const { container, getByText } = render(
      <SkillsSection skills={SKILLS} />,
    );
    expand(container, "script.draft");
    fireEvent.change(
      container.querySelector('[data-slot="skill-template-input"]')!,
      { target: { value: "{{oldFacet}}" } },
    );
    fireEvent.click(container.querySelector('[data-slot="skill-save"]')!);
    await waitFor(() =>
      expect(
        getByText(/Skill 增量与当前官方基座不兼容/),
      ).not.toBeNull(),
    );
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });
});
