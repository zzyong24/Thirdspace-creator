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
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  putPrompt: vi.fn((input: unknown): Promise<unknown> => Promise.resolve(input)),
  listPromptVersions: vi.fn((): Promise<unknown[]> => Promise.resolve([])),
  rollbackPrompt: vi.fn((): Promise<unknown> => Promise.resolve(null)),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    putPrompt: (input: unknown) => mockClient.putPrompt(input),
  },
}));

// 固定 workspace client 与原旧 fixture 共用公开方法替身；HTTP header另用真实transport核。
vi.mock("@creatoros/contract", async (importOriginal) => ({
  ...await importOriginal<typeof import("@creatoros/contract")>(),
  createClient: vi.fn(() => mockClient),
}));
import { createClient } from "@creatoros/contract";
import { writeCurrentGroupId, CURRENT_ACCOUNT_KEY, createHttpTransport } from "@/lib/http-transport";
import { SkillsSection } from "./skills-section";
import type { SkillItem } from "./skills-data";

const SKILLS: readonly SkillItem[] = [
  {
    accountId: "account-a",
    editableFields: ["system", "template", "completionPolicy"],
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
    editableFields: ["system", "template", "completionPolicy"],
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
    editableFields: ["system", "template", "completionPolicy"],
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
  vi.mocked(createClient).mockReset().mockImplementation(() => mockClient as unknown as ReturnType<typeof createClient>);
  window.localStorage.clear();
  window.localStorage.setItem("creatoros:current-account", "account-a");
  mockRouter.refresh.mockClear();
  mockClient.putPrompt.mockReset();
  mockClient.putPrompt.mockImplementation((input:unknown) => Promise.resolve(input));
  mockClient.listPromptVersions.mockReset().mockResolvedValue([]);
  mockClient.rollbackPrompt.mockReset().mockResolvedValue(null);
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

  it("未选择账号时可查看 official Skill，但定制控件保持只读", () => {
    const officialOnly = [{ ...SKILLS[0]!, accountId: null }];
    const { container, getByText } = render(
      <SkillsSection skills={officialOnly} />,
    );

    expand(container, "chatbox.topic");

    const detail = container.querySelector('[data-slot="skill-detail"]')!;
    expect(getByText("选择账号后可定制此技能。")).toBeTruthy();
    expect(
      detail.querySelector<HTMLTextAreaElement>(
        '[data-slot="skill-system-input"]',
      )!.disabled,
    ).toBe(true);
    expect(
      detail.querySelector<HTMLTextAreaElement>(
        '[data-slot="skill-template-input"]',
      )!.disabled,
    ).toBe(true);
    expect(
      detail.querySelector<HTMLButtonElement>('[data-slot="skill-save"]')!
        .disabled,
    ).toBe(true);
    expect(detail.querySelector('[data-slot="skill-version-history"]')).toBeNull();
    expect(mockClient.putPrompt).not.toHaveBeenCalled();
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


describe("[T-1234] 组编辑权限", () => {
  it("合法纯组可首次编辑 system", () => {
    window.localStorage.removeItem("creatoros:current-account");
    window.localStorage.setItem("creatoros:current-group", "group-a");
    const skill = {...SKILLS[0]!, groupId:"group-a", accountId:null};
    const {container} = render(<SkillsSection skills={[skill]} />);
    fireEvent.click(container.querySelector('[data-slot="skill-row-toggle"]')!);
    expect(container.querySelector<HTMLTextAreaElement>('[data-slot="skill-system-input"]')!.disabled).toBe(false);
  });
  it("缺公开 editableFields 不增加编辑许可", () => {
    const {container} = render(<SkillsSection skills={[{...SKILLS[0]!, editableFields:undefined}]} />);
    fireEvent.click(container.querySelector('[data-slot="skill-row-toggle"]')!);
    expect(container.querySelector<HTMLTextAreaElement>('[data-slot="skill-system-input"]')!.disabled).toBe(true);
  });
});

// 以下仅补机械边界；旧26例的原行为断言保留。
describe("[T-1234] workspace 生命周期、字段和历史", () => {
  const observe = {timeout:120000};
  function groupSkill(over: Partial<SkillItem> = {}): SkillItem {
    return {...SKILLS[1]!, groupId:"group-a", accountId:null, ...over};
  }
  function select(groupId:string|null, accountId:string|null = null) {
    act(() => {
      writeCurrentGroupId(groupId);
      if (accountId) window.localStorage.setItem(CURRENT_ACCOUNT_KEY,accountId);
    });
  }
  function open(container: HTMLElement) {fireEvent.click(container.querySelector('[data-slot="skill-row-toggle"]')!);}
  function edit(container:HTMLElement, value="本轮中性方法") {
    fireEvent.change(container.querySelector('[data-slot="skill-system-input"]')!, {target:{value}});
  }
  function save(container:HTMLElement) {fireEvent.click(container.querySelector('[data-slot="skill-save"]')!);}
  async function history(container:HTMLElement) {
    const expectedCalls = mockClient.listPromptVersions.mock.calls.length + 1;
    const details=container.querySelector<HTMLDetailsElement>('[data-slot="skill-version-history"]')!;
    // jsdom真实details会自行派发toggle；不能另手发一次而制造第二个读取。
    act(() => {details.open=true;});
    await waitFor(() => expect(mockClient.listPromptVersions).toHaveBeenCalledTimes(expectedCalls), observe);
  }
  function deferred<T>() {
    let resolve!: (value:T)=>void; let reject!: (cause:unknown)=>void;
    const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
    return {promise,resolve,reject};
  }
  const versions=[2,1].map(rowRevision=>({id:`version-${rowRevision}`,skillId:"script.draft",groupId:"group-a",accountId:null,rowRevision,observedBaseVersion:"v1",overlayVersion:String(rowRevision),overlay:{system:`版本${rowRevision}`},savedCompatibility:"compatible",currentCompatibility:"compatible",currentCompatibilityErrors:[],updatedBy:"user-a",createdAt:"2026-10-11T00:00:00.000Z"}));

  it("canonical 同组成员账号筛选仍可编辑，首次null CAS不造账号scope", async () => {
    select("group-a","member-a");
    const {container}=render(<SkillsSection skills={[groupSkill({rowRevision:null})]} />);open(container);edit(container);save(container);
    await waitFor(()=>expect(mockClient.putPrompt).toHaveBeenCalledTimes(1),observe);
    expect(mockClient.putPrompt.mock.calls[0]![0]).toMatchObject({body:{expectedRevision:null,patch:{system:"本轮中性方法"}}});
    await waitFor(()=>expect(mockRouter.refresh).toHaveBeenCalledTimes(1),observe);
  },240000);

  it.each([
    {groupId:"group-a",accountId:"account-a"},
    {groupId:"",accountId:null},
    {groupId:"  ",accountId:null},
    {groupId:" group-a ",accountId:null},
    {groupId:null,accountId:""},
    {groupId:null,accountId:null},
  ])("异常/无scope投影只读且无写: %j", (scope) => {
    select("group-a");
    const {container}=render(<SkillsSection skills={[groupSkill(scope)]} />);open(container);
    expect(container.querySelector<HTMLTextAreaElement>('[data-slot="skill-system-input"]')!.disabled).toBe(true);
    edit(container);save(container);
    expect(mockClient.putPrompt).not.toHaveBeenCalled();
    expect(container.querySelector('[data-slot="skill-version-history"]')).toBeNull();
  });

  it("混组目录不凭第一项给其它条目授权", () => {
    select("group-a");
    const {container}=render(<SkillsSection skills={[groupSkill(),groupSkill({id:"chatbox.topic",groupId:"group-b"})]} />);open(container);
    expect(container.querySelector<HTMLTextAreaElement>('[data-slot="skill-system-input"]')!.disabled).toBe(true);
    edit(container);save(container);expect(mockClient.putPrompt).not.toHaveBeenCalled();
  });

  it.each(["system","template","completionPolicy"] as const)("仅获准%s字段可写，其它字段不能进入patch", async(field)=>{
    select("group-a");
    const {container}=render(<SkillsSection skills={[groupSkill({editableFields:[field],tools:["context.projects"]})]} />);open(container);
    expect(container.querySelector<HTMLTextAreaElement>('[data-slot="skill-system-input"]')!.disabled).toBe(field!=="system");
    expect(container.querySelector<HTMLTextAreaElement>('[data-slot="skill-template-input"]')!.disabled).toBe(field!=="template");
    expect(container.querySelector<HTMLInputElement>('[data-slot="skill-policy-min-segments"]')!.disabled).toBe(field!=="completionPolicy");
    const slot=field==="system"?"skill-system-input":field==="template"?"skill-template-input":"skill-policy-min-segments";
    fireEvent.change(container.querySelector(`[data-slot="${slot}"]`)!,{target:{value:field==="completionPolicy"?"7":"新获准字段"}});save(container);
    await waitFor(()=>expect(mockClient.putPrompt).toHaveBeenCalledTimes(1),observe);
    const patch=(mockClient.putPrompt.mock.calls[0]![0] as {body:{patch:object}}).body.patch;
    expect(Object.keys(patch)).toEqual([field]);
    expect(container.querySelector('[data-slot="skill-tools"]')).not.toBeNull();
  },240000);

  it("缺字段/adapter不支持不能用dirty事件绕过写权限",()=>{
    select("group-a");
    const {container}=render(<SkillsSection skills={[groupSkill({editableFields:["completionPolicy"],completionPolicySupported:false})]} />);open(container);edit(container);save(container);
    expect(mockClient.putPrompt).not.toHaveBeenCalled();
    expect(container.querySelector('[data-slot="skill-completion-policy"]')).toBeNull();
  });
  it("方法restore只清允许方法字段，policy restore保持独立",async()=>{
    select("group-a");
    const {container}=render(<SkillsSection skills={[groupSkill({editableFields:["template"]})]} />);open(container);
    fireEvent.click(container.querySelector('[data-slot="skill-restore-default"]')!);
    await waitFor(()=>expect(mockClient.putPrompt).toHaveBeenCalledTimes(1),observe);
    expect(mockClient.putPrompt.mock.calls[0]![0]).toMatchObject({body:{expectedRevision:2,patch:{template:null}}});
    expect(Object.keys((mockClient.putPrompt.mock.calls[0]![0] as {body:{patch:object}}).body.patch)).toEqual(["template"]);
    expect(container.querySelector<HTMLButtonElement>('[data-slot="skill-policy-restore-default"]')!.disabled).toBe(true);
  },240000);

  it("浏览器已切B而RSC仍A时不能发新保存/history",()=>{
    select("group-a");const {container}=render(<SkillsSection skills={[groupSkill()]} />);open(container);edit(container);select("group-b");save(container);
    expect(mockClient.putPrompt).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLButtonElement>('[data-slot="skill-save"]')!.disabled).toBe(true);
    expect(mockClient.listPromptVersions).not.toHaveBeenCalled();
  });
  it("无事件的selection不符仍在操作入口拒绝",()=>{
    select("group-a");const {container}=render(<SkillsSection skills={[groupSkill()]} />);open(container);edit(container);
    window.localStorage.setItem("creatoros:current-group","group-b");save(container);
    expect(mockClient.putPrompt).not.toHaveBeenCalled();
  });

  it.each(["success","reject","aba","unmount"])("旧保存%s晚回执不刷新、不落新scope",async(mode)=>{
    select("group-a");const pending=deferred<unknown>();mockClient.putPrompt.mockReturnValueOnce(pending.promise);
    const {container,rerender,unmount}=render(<SkillsSection skills={[groupSkill()]} />);open(container);edit(container);save(container);
    expect(mockClient.putPrompt).toHaveBeenCalledTimes(1);
    if(mode==="unmount")unmount();else {
      select("group-b");rerender(<SkillsSection skills={[groupSkill({groupId:"group-b"})]} />);
      if(mode==="aba"){select("group-a");rerender(<SkillsSection skills={[groupSkill()]} />);}
    }
    await act(async()=>{if(mode==="reject")pending.reject(new Error("旧scope错误"));else pending.resolve(null);await pending.promise.catch(()=>{});});
    expect(mockRouter.refresh).not.toHaveBeenCalled();expect(mockClient.putPrompt).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-slot="skill-save-error"]')).toBeNull();
    if(mode!=="unmount")expect(container.querySelector<HTMLTextAreaElement>('[data-slot="skill-system-input"]')!.value).toBe("你是文案写手。");
  },240000);

  it("同组成员筛选变化不反杀已发合法组保存",async()=>{
    select("group-a","member-a");const pending=deferred<unknown>();mockClient.putPrompt.mockReturnValueOnce(pending.promise);
    const {container}=render(<SkillsSection skills={[groupSkill()]} />);open(container);edit(container);save(container);
    act(()=>{window.localStorage.setItem(CURRENT_ACCOUNT_KEY,"member-b");window.dispatchEvent(new CustomEvent("creatoros:accounts-changed",{detail:{groupId:"group-a",source:"external",routeRefreshScheduled:false}}));});
    await act(async()=>{pending.resolve(null);await pending.promise;});
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
  },240000);
  it("legacy A切legacy B旧editor不能保存",()=>{
    const {container}=render(<SkillsSection skills={[SKILLS[1]!]} />);open(container);edit(container);
    act(()=>{window.localStorage.setItem(CURRENT_ACCOUNT_KEY,"account-b");window.dispatchEvent(new CustomEvent("creatoros:accounts-changed",{detail:{groupId:null,source:"external",routeRefreshScheduled:false}}));});
    save(container);expect(mockClient.putPrompt).not.toHaveBeenCalled();
  });

  it("history、rollback和保存共享在途互斥，回滚用原revision且再读历史",async()=>{
    select("group-a");const pending=deferred<unknown[]>();mockClient.listPromptVersions.mockReturnValueOnce(pending.promise);
    const {container}=render(<SkillsSection skills={[groupSkill()]} />);open(container);edit(container);await history(container);save(container);
    expect(mockClient.listPromptVersions).toHaveBeenCalledTimes(1);expect(mockClient.putPrompt).not.toHaveBeenCalled();
    await act(async()=>{pending.resolve(versions);await pending.promise;});
    expect(container.querySelectorAll('[data-slot="skill-version-row"]')).toHaveLength(2);
    fireEvent.click(container.querySelectorAll('[data-slot="skill-version-rollback"]')[1]!);
    await waitFor(()=>expect(mockClient.rollbackPrompt).toHaveBeenCalledTimes(1),observe);
    expect(mockClient.rollbackPrompt).toHaveBeenCalledWith({params:{id:"script.draft"},query:undefined,body:{versionId:"version-1",expectedRevision:2}});
    await waitFor(()=>expect(mockClient.listPromptVersions).toHaveBeenCalledTimes(2),observe);
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
  },240000);

  it.each(["success","reject","aba"])("history %s晚回执不进入新组列表",async(mode)=>{
    select("group-a");const pending=deferred<unknown[]>();mockClient.listPromptVersions.mockReturnValueOnce(pending.promise);
    const {container,rerender}=render(<SkillsSection skills={[groupSkill()]} />);open(container);await history(container);
    expect(mockClient.listPromptVersions).toHaveBeenCalledTimes(1);
    select("group-b");rerender(<SkillsSection skills={[groupSkill({groupId:"group-b"})]} />);
    if(mode==="aba"){select("group-a");rerender(<SkillsSection skills={[groupSkill()]} />);}
    await act(async()=>{if(mode==="reject")pending.reject(new Error("旧历史错误"));else pending.resolve(versions);await pending.promise.catch(()=>{});});
    expect(container.querySelectorAll('[data-slot="skill-version-row"]')).toHaveLength(0);
    expect(container.querySelector('[data-slot="skill-version-error"]')).toBeNull();expect(mockRouter.refresh).not.toHaveBeenCalled();
  },240000);

  it.each(["success","reject","aba"])("rollback %s晚回执不refresh或重拉其它组",async(mode)=>{
    select("group-a");mockClient.listPromptVersions.mockResolvedValueOnce(versions);
    const pending=deferred<unknown>();mockClient.rollbackPrompt.mockReturnValueOnce(pending.promise);
    const {container,rerender}=render(<SkillsSection skills={[groupSkill()]} />);open(container);await history(container);
    await waitFor(()=>expect(container.querySelectorAll('[data-slot="skill-version-row"]')).toHaveLength(2),observe);
    fireEvent.click(container.querySelectorAll('[data-slot="skill-version-rollback"]')[1]!);expect(mockClient.rollbackPrompt).toHaveBeenCalledTimes(1);
    select("group-b");rerender(<SkillsSection skills={[groupSkill({groupId:"group-b"})]} />);
    if(mode==="aba"){select("group-a");rerender(<SkillsSection skills={[groupSkill()]} />);}
    await act(async()=>{if(mode==="reject")pending.reject(new Error("旧回滚错误"));else pending.resolve(null);await pending.promise.catch(()=>{});});
    expect(mockRouter.refresh).not.toHaveBeenCalled();expect(mockClient.listPromptVersions).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-slot="skill-version-error"]')).toBeNull();
  },240000);

  it("当前history和rollback真实失败可见，不假成功",async()=>{
    select("group-a");mockClient.listPromptVersions.mockRejectedValueOnce(new Error("history failure"));
    const {container}=render(<SkillsSection skills={[groupSkill()]} />);open(container);await history(container);
    await waitFor(()=>expect(container.querySelector('[data-slot="skill-version-error"]')?.textContent).toContain("加载版本历史失败"),observe);
    const details=container.querySelector<HTMLDetailsElement>('[data-slot="skill-version-history"]')!;act(()=>{details.open=false;});
    mockClient.listPromptVersions.mockResolvedValueOnce(versions);await history(container);
    await waitFor(()=>expect(container.querySelectorAll('[data-slot="skill-version-row"]')).toHaveLength(2),observe);
    mockClient.rollbackPrompt.mockRejectedValueOnce(new Error("rollback failure"));fireEvent.click(container.querySelectorAll('[data-slot="skill-version-rollback"]')[1]!);
    await waitFor(()=>expect(container.querySelector('[data-slot="skill-version-error"]')?.textContent).toContain("回滚失败"),observe);
    expect(mockRouter.refresh).not.toHaveBeenCalled();expect(mockClient.listPromptVersions).toHaveBeenCalledTimes(2);
  },240000);

  it("真实HTTP transport冻结canonical A，ambient B不会改原header",async()=>{
    const actual=await vi.importActual<typeof import("@creatoros/contract")>("@creatoros/contract");
    select("group-a","member-a");
    vi.mocked(createClient).mockImplementationOnce(actual.createClient);
    const pending=deferred<Response>();const fetchMock=vi.fn<(url:RequestInfo|URL,init?:RequestInit)=>Promise<Response>>().mockImplementation(()=>pending.promise);vi.stubGlobal("fetch",fetchMock);
    const {container}=render(<SkillsSection skills={[groupSkill()]} />);open(container);edit(container);save(container);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init=fetchMock.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get("x-group-id")).toBe("group-a");
    expect(new Headers(init.headers).get("x-account-id")).toBeNull();
    expect(JSON.parse(init.body as string)).toMatchObject({id:"settings.prompts.put",input:{body:{expectedRevision:2,patch:{system:"本轮中性方法"}}}});
    select("group-b");
    const row={groupId:"group-a",accountId:null,skillId:"script.draft",baseVersion:"v1",editableFields:["system","template","completionPolicy"],completionPolicySupported:true,official:{system:"官方",template:"官方模板",requiredFacets:[],tools:[],outputSchema:null,completionPolicy:null},effective:{system:"本轮中性方法",template:"官方模板",requiredFacets:[],tools:[],outputSchema:null,completionPolicy:null},compatibility:"compatible",compatibilityErrors:[],rowRevision:3,validatedBaseVersion:"v1",overlayVersion:"3",overlay:{system:"本轮中性方法"},updatedAt:"2026-10-11T00:00:00.000Z"};
    await act(async()=>{pending.resolve(new Response(JSON.stringify({data:row}),{status:200,headers:{"content-type":"application/json"}}));await pending.promise;});
    expect(mockRouter.refresh).not.toHaveBeenCalled();expect(fetchMock).toHaveBeenCalledTimes(1);
    // 另一真实 transport 在ambient B下也只发冻结A；不是 mock factory 的参数断言。
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({data:versions,meta:{total:2}}),{status:200}));
    await createHttpTransport("/api/v1",{groupId:"group-a",accountId:null}).request(actual.ENDPOINTS.listPromptVersions,{params:{id:"script.draft"},query:undefined,body:undefined});
    expect(new Headers((fetchMock.mock.calls[1]![1] as RequestInit).headers).get("x-group-id")).toBe("group-a");
  },240000);
});
