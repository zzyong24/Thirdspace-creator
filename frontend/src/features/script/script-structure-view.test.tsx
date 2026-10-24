/**
 * ScriptStructureToggle(T-070 双视图 → T-072 结构化编辑)。
 *
 * 覆盖:
 *  - 默认视图:有 sections → 结构编辑;无 sections → 编辑(TipTap children);
 *  - 结构编辑交互:换段型徽章 / 改标题正文 / 上移下移 / 删除 / 在下方加段;
 *  - 保存:组装 sections → client.createArtifactVersion(contentText 拼接 +
 *    contentData.sections 全量,金句段强制 emphasis)→ router.refresh;
 *  - artifactId 缺省 + projectId → ensureScriptArtifact getOrCreate 再落库;
 *  - 空态:引导文案 + 「加第一段」起结构稿。
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScriptStructureToggle } from "./script-structure-view";
import {
  DraftChatRequestProvider,
  useDraftChatRequest,
} from "@/features/draft-workbench/draft-chat-request";
import type { ScriptSectionView } from "@/types/view-models";
import { plainTextFromSections } from "./script-editor-bridge";
import { ENDPOINTS, ErrorCode } from "@creatoros/contract";
import { createHttpTransport, HttpTransportError } from "@/lib/http-transport";
import {AccountSwitcher} from "@/components/shell/account-switcher";
import {beginForegroundActivity,hasForegroundActivity,listForegroundActivities,resetForegroundActivitiesForTest} from "@/lib/foreground-activity";

const mockRouter = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockCreateArtifactVersion = vi.fn(
  (input: unknown): Promise<unknown> => Promise.resolve({ id: "av-new", input }),
);
const mockListArtifacts = vi.fn(
  (_input: unknown): Promise<unknown> => Promise.resolve([]),
);
const mockCreateArtifact = vi.fn(
  (_input: unknown): Promise<unknown> => Promise.resolve({ id: "art-created" }),
);
const mockGetArtifact = vi.fn();
const mockListArtifactVersions = vi.fn();
vi.mock("@/lib/contract-client", () => ({
  client: {
    createArtifactVersion: (input: unknown) => mockCreateArtifactVersion(input),
    listArtifacts: (input: unknown) => mockListArtifacts(input),
    createArtifact: (input: unknown) => mockCreateArtifact(input),
    getArtifact: (input: unknown) => mockGetArtifact(input),
    listArtifactVersions: (input: unknown) => mockListArtifactVersions(input),
  },
}));

afterEach(() => cleanup());
beforeEach(() => {
  resetForegroundActivitiesForTest();
  localStorage.clear();
  mockRouter.refresh.mockClear();
  mockCreateArtifactVersion.mockReset();
  mockCreateArtifactVersion.mockImplementation((input:unknown)=>Promise.resolve({id:"av-new",input}));
  mockListArtifacts.mockClear();
  mockCreateArtifact.mockClear();
});

const SECTIONS: ScriptSectionView[] = [
  {
    id: "s-1",
    type: "hook",
    heading: "开场钩子",
    body: "前 3 秒直接放结论:论文能跑起来才算读懂。",
    emphasis: true,
    startSeconds: 0,
    endSeconds: 15,
  },
  {
    id: "s-2",
    type: "body",
    heading: "",
    body: "先把环境锁死,再逐模块复现。",
    emphasis: false,
    startSeconds: null,
    endSeconds: null,
  },
  {
    id: "s-3",
    type: "golden_quote",
    heading: "金句",
    body: "跑不通的 idea 只是感想。",
    emphasis: false,
    startSeconds: null,
    endSeconds: null,
  },
];

function renderToggle(
  sections: ScriptSectionView[],
  props: {
    artifactId?: string | null;
    projectId?: string | null;
    currentVersionId?: string | null;
    assetLabels?: Readonly<Record<string, string>>;
    assetLabelsRead?: Promise<{labels:Readonly<Record<string,string>>;error?:string|null}>;
  } = {},
) {
  return render(
    <ScriptStructureToggle sections={sections} {...props}>
      <div data-testid="editor-stub">编辑器</div>
    </ScriptStructureToggle>,
  );
}

it('素材名称迟到只补标签，不重建结构编辑器或覆盖当前输入',async()=>{
  let finish!:(value:{labels:Readonly<Record<string,string>>})=>void;
  const labels=new Promise<{labels:Readonly<Record<string,string>>}>(resolve=>{finish=resolve;});
  renderToggle([{...SECTIONS[0]!,visual:{description:'画面',assetRefs:['asset-late'],missing:[]}}],{assetLabelsRead:labels});
  expect(screen.getByText('正在读取素材…')).toBeVisible();
  const body=screen.getByDisplayValue(SECTIONS[0]!.body);
  fireEvent.change(body,{target:{value:'加载期间的未保存输入'}});
  await act(async()=>finish({labels:{'asset-late':'后到的真实素材'}}));
  expect(screen.getByText('后到的真实素材')).toBeVisible();
  expect(screen.getByDisplayValue('加载期间的未保存输入')).toBe(body);
});

it('标签请求失败不把仍引用的素材误报失效，用户输入保留',async()=>{
  let fail!:(error:Error)=>void;
  const labels=new Promise<{labels:Readonly<Record<string,string>>}>((_,reject)=>{fail=reject;});
  renderToggle([{...SECTIONS[0]!,visual:{description:'画面',assetRefs:['asset-late'],missing:[]}}],{assetLabelsRead:labels});
  const body=screen.getByDisplayValue(SECTIONS[0]!.body);
  fireEvent.change(body,{target:{value:'请求失败期间仍保留的正文'}});
  await act(async()=>fail(Error('offline')));
  expect(screen.getByText('素材暂时无法读取')).toBeVisible();
  expect(screen.queryByText('素材已失效')).toBeNull();
  expect(screen.getByDisplayValue('请求失败期间仍保留的正文')).toBe(body);
});

function ChatRequestProbe() {
  const { request } = useDraftChatRequest();
  return (
    <output data-testid="chat-request-probe">
      {request ? JSON.stringify(request) : ""}
    </output>
  );
}

function renderToggleWithChat(
  sections: ScriptSectionView[],
  props: {
    artifactId?: string | null;
    projectId?: string | null;
    currentVersionId?: string | null;
  },
) {
  return render(
    <DraftChatRequestProvider>
      <ScriptStructureToggle sections={sections} {...props}>
        <div data-testid="editor-stub">编辑器</div>
      </ScriptStructureToggle>
      <ChatRequestProbe />
    </DraftChatRequestProvider>,
  );
}

function sectionCards(): NodeListOf<Element> {
  return document.querySelectorAll('[data-slot="script-structure-section"]');
}

describe("ScriptStructureToggle(默认视图)", () => {
  it("结构稿dirty与saving登记离开保护，保存和卸载不误清其它活动",async()=>{
    let finish!:(value:unknown)=>void;mockCreateArtifactVersion.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const mounted=renderToggle(SECTIONS,{artifactId:"guard-structure"});expect(hasForegroundActivity()).toBe(false);
    fireEvent.change(screen.getByLabelText("第 1 段正文"),{target:{value:"结构稿原输入"}});await waitFor(()=>expect(hasForegroundActivity()).toBe(true));
    const endOther=beginForegroundActivity("另一个操作");fireEvent.click(screen.getByRole("button",{name:"保存"}));
    await waitFor(()=>expect(listForegroundActivities()).toContain("分镜脚本正在保存"));
    await act(async()=>finish({id:"structure-saved-version"}));await waitFor(()=>expect(listForegroundActivities()).toEqual(["另一个操作"]));
    fireEvent.change(screen.getByLabelText("第 1 段正文"),{target:{value:"新的结构输入"}});await waitFor(()=>expect(listForegroundActivities()).toHaveLength(2));
    mounted.unmount();expect(listForegroundActivities()).toEqual(["另一个操作"]);endOther();
  });
  it("真实结构编辑器切组先确认，取消逐字保留原段且没有保存请求",async()=>{
    const group=(id:string)=>({id,userId:"u",name:`组${id}`,status:"active",version:1,createdAt:"2026-10-18T00:00:00Z",updatedAt:"2026-10-18T00:00:00Z",members:[]});
    localStorage.setItem("creatoros:current-group","a");window.history.replaceState(null,"","/");
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({data:[group("a"),group("b")],meta:{requestId:"guard",page:1,pageSize:100,total:2}}),{status:200})));
    try{
      render(<AccountSwitcher collapsed={false}/>);renderToggle(SECTIONS,{artifactId:"guard-structure"});await screen.findByRole("button",{name:"当前账号组：组a"});
      fireEvent.change(screen.getByLabelText("第 1 段正文"),{target:{value:"需要逐字保留的结构稿"}});
      fireEvent.pointerDown(screen.getByTestId("account-switcher-trigger"),{button:0,ctrlKey:false,pointerType:"mouse"});fireEvent.click(screen.getByRole("menuitem",{name:"组b"}));
      expect(screen.getByTestId("account-switch-confirm")).toBeVisible();expect(localStorage.getItem("creatoros:current-group")).toBe("a");
      fireEvent.click(screen.getByTestId("account-switch-cancel"));expect(screen.getByLabelText("第 1 段正文")).toHaveValue("需要逐字保留的结构稿");expect(mockCreateArtifactVersion).not.toHaveBeenCalled();expect(localStorage.getItem("creatoros:current-group")).toBe("a");
    }finally{vi.unstubAllGlobals();}
  });
  it("有 sections → 默认结构编辑视图(徽章/标题/正文/时间字数可见);切编辑回 TipTap children", () => {
    renderToggle(SECTIONS);
    expect(
      screen.getByRole("button", { name: "纯文本稿" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "分镜脚本" }),
    ).toBeInTheDocument();
    // 默认即结构视图:编辑器 children 不渲,分段卡渲 3 张。
    expect(screen.queryByTestId("editor-stub")).toBeNull();
    expect(sectionCards()).toHaveLength(3);
    // 段型徽章 = select,展示当前段型。
    const typeSelects = document.querySelectorAll(
      '[data-slot="script-section-type"]',
    ) as NodeListOf<HTMLSelectElement>;
    expect(typeSelects[0]!.value).toBe("hook");
    expect(typeSelects[2]!.value).toBe("golden_quote");
    // 标题/正文可编辑控件承载原内容。
    expect(screen.getByDisplayValue("开场钩子")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(/前 3 秒直接放结论/),
    ).toBeInTheDocument();
    // 时间 + 字数行(第一段 0:00–0:15)。
    expect(screen.getByText(/0:00–0:15/)).toBeInTheDocument();
    // 切回编辑视图 → children 渲染。
    fireEvent.click(document.querySelector('[data-slot="script-view-edit"]')!);
    expect(screen.getByTestId("editor-stub")).toBeInTheDocument();
  });

  it("无 sections → 默认编辑视图;切结构给引导空态 + 可加第一段起结构稿", () => {
    renderToggle([]);
    expect(screen.getByTestId("editor-stub")).toBeInTheDocument();
    fireEvent.click(
      document.querySelector('[data-slot="script-view-structure"]')!,
    );
    expect(
      document.querySelector('[data-slot="script-structure-empty"]'),
    ).not.toBeNull();
    expect(
      screen.getByText(/让编导整稿起草会自动带分段/),
    ).toBeInTheDocument();
    // 「加第一段」→ 出一张钩子段卡,空态消失。
    fireEvent.click(
      document.querySelector('[data-slot="script-structure-add-first"]')!,
    );
    expect(
      document.querySelector('[data-slot="script-structure-empty"]'),
    ).toBeNull();
    expect(sectionCards()).toHaveLength(1);
    const select = document.querySelector(
      '[data-slot="script-section-type"]',
    ) as HTMLSelectElement;
    expect(select.value).toBe("hook");
  });
});

describe("ScriptStructureEditor(交互)", () => {
  it("换段型徽章 / 改标题正文 → 状态翻「有未保存的修改」", () => {
    renderToggle(SECTIONS);
    const typeSelect = document.querySelectorAll(
      '[data-slot="script-section-type"]',
    )[1] as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: "transition" } });
    expect(typeSelect.value).toBe("transition");

    const heading = screen.getByDisplayValue("开场钩子");
    fireEvent.change(heading, { target: { value: "更锋利的钩子" } });
    expect(screen.getByDisplayValue("更锋利的钩子")).toBeInTheDocument();

    const status = document.querySelector(
      '[data-slot="structure-save-status"]',
    )!;
    expect(status.getAttribute("data-save-status")).toBe("dirty");
    expect(screen.getByText("有未保存的修改")).toBeInTheDocument();
  });

  it("上移/下移/删除/在下方加段:段序与段数如实变化", () => {
    renderToggle(SECTIONS);
    // 第二段上移 → 「先把环境锁死…」成为第一段正文。
    const upButtons = document.querySelectorAll('[data-op-id="section-move-up"]');
    fireEvent.click(upButtons[1]!);
    let bodies = document.querySelectorAll(
      '[data-slot="script-section-body"]',
    ) as NodeListOf<HTMLTextAreaElement>;
    expect(bodies[0]!.value).toContain("先把环境锁死");
    // 第一段下移 → 换回去。
    const downButtons = document.querySelectorAll(
      '[data-op-id="section-move-down"]',
    );
    fireEvent.click(downButtons[0]!);
    bodies = document.querySelectorAll(
      '[data-slot="script-section-body"]',
    ) as NodeListOf<HTMLTextAreaElement>;
    expect(bodies[0]!.value).toContain("前 3 秒直接放结论");
    // 首段上移禁用 / 末段下移禁用。
    expect(
      (document.querySelectorAll('[data-op-id="section-move-up"]')[0] as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (document.querySelectorAll('[data-op-id="section-move-down"]')[2] as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    // 在第一段下方加段 → 4 张卡,第二张是空的正文段。
    fireEvent.click(
      document.querySelectorAll('[data-op-id="section-insert-below"]')[0]!,
    );
    expect(sectionCards()).toHaveLength(4);
    const newSelect = document.querySelectorAll(
      '[data-slot="script-section-type"]',
    )[1] as HTMLSelectElement;
    expect(newSelect.value).toBe("body");
    // 删除新加的段 → 回 3 张。
    fireEvent.click(
      document.querySelectorAll('[data-op-id="section-remove"]')[1]!,
    );
    expect(sectionCards()).toHaveLength(3);
  });
});

describe("ScriptStructureEditor(保存)", () => {
  it("保存 → createArtifactVersion 带 contentText 拼接 + contentData.sections 全量(金句强制 emphasis)→ refresh", async () => {
    renderToggle(SECTIONS, { artifactId: "art-1" });
    // 改第一段标题制造 dirty,解锁保存。
    fireEvent.change(screen.getByDisplayValue("开场钩子"), {
      target: { value: "v3 钩子" },
    });
    const saveBtn = document.querySelector(
      '[data-slot="structure-save-button"]',
    ) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
    fireEvent.click(saveBtn);

    await screen.findByText("已保存");
    expect(mockCreateArtifactVersion).toHaveBeenCalledTimes(1);
    const input = mockCreateArtifactVersion.mock.calls[0]![0] as {
      params: { artifactId: string };
      body: {
        contentText: string;
        changeSummary: string;
        contentData: { sections: Array<Record<string, unknown>>; html?: unknown };
      };
    };
    expect(input.params.artifactId).toBe("art-1");
    expect(input.body.changeSummary).toBe("结构编辑");
    // 不写 html:读侧从新 sections 重拼,避免结构改动被旧富文本盖掉。
    expect(input.body.contentData.html).toBeUndefined();
    const sections = input.body.contentData.sections;
    expect(sections).toHaveLength(3);
    expect(sections[0]).toMatchObject({
      type: "hook",
      heading: "v3 钩子",
      emphasis: true,
      startSeconds: 0,
      endSeconds: 15,
    });
    // 金句段:emphasis 未标也强制 true(段型语义)。
    expect(sections[2]).toMatchObject({ type: "golden_quote", emphasis: true });
    // contentText = heading\nbody 段间双换行拼接。
    expect(input.body.contentText).toContain("v3 钩子\n前 3 秒直接放结论");
    expect(input.body.contentText).toContain("\n\n");
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
  });

  it("artifactId 缺省 + projectId → ensureScriptArtifact getOrCreate 再落库(首存不假成功)", async () => {
    renderToggle(SECTIONS, { artifactId: null, projectId: "proj-1" });
    fireEvent.change(screen.getByDisplayValue("开场钩子"), {
      target: { value: "首存钩子" },
    });
    fireEvent.click(
      document.querySelector('[data-slot="structure-save-button"]')!,
    );
    await screen.findByText("已保存");
    // getOrCreate:先 list(空)→ create → 用新建 id 落版本。
    expect(mockListArtifacts).toHaveBeenCalled();
    expect(mockCreateArtifact).toHaveBeenCalled();
    const input = mockCreateArtifactVersion.mock.calls[0]![0] as {
      params: { artifactId: string };
    };
    expect(input.params.artifactId).toBe("art-created");
  });

  it("[T-732] 保存携带当前版本并发锚点，禁止旧稿覆盖刚写入的新整稿", async () => {
    renderToggle(SECTIONS, {
      artifactId: "art-1",
      currentVersionId: "version-6",
    });
    fireEvent.change(screen.getByDisplayValue("开场钩子"), {
      target: { value: "基于 v6 的本地修改" },
    });
    fireEvent.click(
      document.querySelector('[data-slot="structure-save-button"]')!,
    );
    await screen.findByText("已保存");

    const input = mockCreateArtifactVersion.mock.calls[0]![0] as {
      body: { expectedCurrentVersionId?: string };
    };
    expect(input.body.expectedCurrentVersionId).toBe("version-6");
  });

  it("全部段清空 → 保存禁用并提示,不产空版本", () => {
    renderToggle([SECTIONS[0]!], { artifactId: "art-1" });
    fireEvent.change(screen.getByDisplayValue("开场钩子"), {
      target: { value: "" },
    });
    fireEvent.change(
      document.querySelector('[data-slot="script-section-body"]')!,
      { target: { value: "" } },
    );
    const saveBtn = document.querySelector(
      '[data-slot="structure-save-button"]',
    ) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
    expect(
      screen.getByText(/至少留一段有内容的段落才能保存/),
    ).toBeInTheDocument();
    expect(mockCreateArtifactVersion).not.toHaveBeenCalled();
  });
});

describe("[T-716] AI 改写本段", () => {
  it("点击按钮自动携带稿件/版本/段落/原文锚点，不让模型或用户补技术 ID", async () => {
    renderToggleWithChat(SECTIONS, {
      artifactId: "artifact-1",
      currentVersionId: "version-6",
    });

    fireEvent.click(screen.getByRole("button", { name: "AI 改写第 2 段" }));

    await waitFor(() => {
      const raw = screen.getByTestId("chat-request-probe").textContent || "";
      expect(raw).not.toBe("");
      const request = JSON.parse(raw) as {
        functionKey: string;
        selection: Record<string, string | number>;
      };
      expect(request.functionKey).toBe("script.patch");
      expect(request.selection).toMatchObject({
        kind: "script_section",
        id: "s-2",
        artifactId: "artifact-1",
        versionId: "version-6",
        sectionIndex: 1,
        excerpt: "先把环境锁死,再逐模块复现。",
      });
    });
    expect(mockCreateArtifactVersion).not.toHaveBeenCalled();
  });

  it("[T-732] 整稿换版后段落与版本作为同一快照重绑，再点击只发送新版本正文", async () => {
    const currentSections = SECTIONS.map((section, index) => ({
      ...section,
      id: `current-${index + 1}`,
      body: `当前 v10 第 ${index + 1} 段正文`,
    }));
    const rendered = renderToggleWithChat(SECTIONS, {
      artifactId: "artifact-1",
      currentVersionId: "version-9",
    });

    rendered.rerender(
      <DraftChatRequestProvider>
        <ScriptStructureToggle
          sections={currentSections}
          artifactId="artifact-1"
          currentVersionId="version-10"
        >
          <div data-testid="editor-stub">编辑器</div>
        </ScriptStructureToggle>
        <ChatRequestProbe />
      </DraftChatRequestProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("第 2 段正文")).toHaveValue(
        "当前 v10 第 2 段正文",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "AI 改写第 2 段" }));

    await waitFor(() => {
      const request = JSON.parse(
        screen.getByTestId("chat-request-probe").textContent || "{}",
      ) as { selection?: Record<string, string | number> };
      expect(request.selection).toMatchObject({
        id: "current-2",
        artifactId: "artifact-1",
        versionId: "version-10",
        sectionIndex: 1,
        excerpt: "当前 v10 第 2 段正文",
      });
    });
  });

  it("本地段落有未保存修改时先自动保存，再用新版本和新原文打开局部改写", async () => {
    renderToggleWithChat(SECTIONS, {
      artifactId: "artifact-1",
      currentVersionId: "version-6",
    });
    fireEvent.change(screen.getByLabelText("第 2 段正文"), {
      target: { value: "这是刚刚在稿面改过、还没手动保存的新原文。" },
    });

    fireEvent.click(screen.getByRole("button", { name: "AI 改写第 2 段" }));

    await waitFor(() => expect(mockCreateArtifactVersion).toHaveBeenCalledTimes(1));
    const saved = mockCreateArtifactVersion.mock.calls[0]![0] as {
      body: { changeSummary: string };
    };
    expect(saved.body.changeSummary).toBe("AI 局部改稿前自动保存");

    await waitFor(() => {
      const request = JSON.parse(
        screen.getByTestId("chat-request-probe").textContent || "{}",
      ) as { selection?: Record<string, string | number> };
      expect(request.selection).toMatchObject({
        id: "s-2",
        artifactId: "artifact-1",
        versionId: "av-new",
        sectionIndex: 1,
        excerpt: "这是刚刚在稿面改过、还没手动保存的新原文。",
      });
    });
  });
});

// ── [T-387b] 凝固分镜 visual:渲染 + 保存透传 ─────────────────────────────────

describe("ScriptStructureEditor(凝固分镜 visual)", () => {
  const WITH_VISUAL: ScriptSectionView[] = [
    {
      ...SECTIONS[0]!,
      visual: {
        description: "产品操作录屏特写",
        assetRefs: ["asset-9"],
        missing: ["对比图表"],
      },
    },
    SECTIONS[1]!,
  ];

  it("有 visual 的段渲画面描述/点名素材/缺素材;无 visual 的段不渲(旧稿零回归)", () => {
    renderToggle(WITH_VISUAL, {
      artifactId: "art-1",
      assetLabels: { "asset-9": "选题卡操作录屏.mov" },
    });
    const blocks = document.querySelectorAll(
      '[data-slot="script-section-visual"]',
    );
    expect(blocks).toHaveLength(1); // 只有第一段有
    expect(blocks[0]!.textContent).toContain("产品操作录屏特写");
    expect(blocks[0]!.textContent).toContain("选题卡操作录屏.mov");
    expect(blocks[0]!.textContent).not.toContain("asset-9");
    expect(blocks[0]!.textContent).toContain("对比图表");
  });

  it("结构编辑保存 → visual 原样带回(不洗掉分镜真源);无 visual 的段不带字段", async () => {
    renderToggle(WITH_VISUAL, { artifactId: "art-1" });
    fireEvent.change(screen.getByDisplayValue("开场钩子"), {
      target: { value: "改标题" },
    });
    fireEvent.click(
      document.querySelector('[data-slot="structure-save-button"]')!,
    );
    await screen.findByText("已保存");
    const input = mockCreateArtifactVersion.mock.calls[0]![0] as {
      body: { contentData: { sections: Array<Record<string, unknown>> } };
    };
    const sections = input.body.contentData.sections;
    expect(sections[0]!.visual).toEqual({
      description: "产品操作录屏特写",
      assetRefs: ["asset-9"],
      missing: ["对比图表"],
    });
    expect(sections[1]!.visual).toBeUndefined();
  });
});

let strictStructureFlush: () => Promise<void>;
function StructureFlushProbe() { strictStructureFlush = useDraftChatRequest().flushSaveStrict; return null; }
it("结构视图严格 flush 未知不吞掉，保留编辑与原回执而不盲append", async () => {
  mockGetArtifact.mockResolvedValue({ id: "a1", projectId: "p1", currentVersionId: "v1" });
  mockListArtifactVersions.mockResolvedValue([{ id: "v1", artifactId: "a1", contentText: "旧稿", contentData: { sections: SECTIONS } }]);
  render(<DraftChatRequestProvider><StructureFlushProbe /><ScriptStructureToggle sections={SECTIONS} artifactId="a1" projectId="p1" currentVersionId="v1"><div /></ScriptStructureToggle></DraftChatRequestProvider>);
  const input = document.querySelector('textarea')!;
  fireEvent.change(input, { target: { value: "当前新正文" } });
  mockCreateArtifactVersion.mockRejectedValueOnce(new Error("保存失败"));
  await act(async () => { await expect(strictStructureFlush()).rejects.toThrow("保存失败"); });
  expect(input.value).toBe("当前新正文");
  await act(async () => { await expect(strictStructureFlush()).rejects.toThrow("原保存结果未知"); });
  expect(mockCreateArtifactVersion).toHaveBeenCalledOnce();
  expect(mockCreateArtifactVersion.mock.calls[0]?.[0]).toMatchObject({ body: { expectedCurrentVersionId: "v1", contentText: expect.stringContaining("当前新正文") } });
});

let prepareStructure: ReturnType<typeof useDraftChatRequest>["prepareScriptForCreation"];
function StructureCreationProbe() {
  prepareStructure = useDraftChatRequest().prepareScriptForCreation;
  return null;
}
function creationStructure(props: { artifactId?: string | null; sections?: ScriptSectionView[] } = {}) {
  return <DraftChatRequestProvider><StructureCreationProbe />
    <ScriptStructureToggle sections={props.sections ?? SECTIONS} artifactId={props.artifactId === undefined ? "structure-real" : props.artifactId}
      projectId="structure-project" currentVersionId={props.artifactId === null ? null : "version-before"}>
      <div data-testid="rich-view">纯文本视图</div>
    </ScriptStructureToggle>
  </DraftChatRequestProvider>;
}
function structurePayload(sections: ScriptSectionView[]) {
  return sections.map(s => ({ ...s, emphasis: s.type === "golden_quote" ? true : s.emphasis }));
}
function structureBoundary(sections = SECTIONS) {
  let current = "version-before";
  const first = structurePayload(sections);
  const versions = [{ id: current, artifactId: "structure-real", contentText: plainTextFromSections(first), contentData: { sections: first } }];
  mockGetArtifact.mockImplementation(async () => ({ id: "structure-real", projectId: "structure-project", currentVersionId: current }));
  mockListArtifactVersions.mockImplementation(async () => versions);
  mockCreateArtifactVersion.mockImplementation(async (input: any) => {
    current = `version-created-${versions.length}`;
    const version = { id: current, artifactId: input.params.artifactId, contentText: input.body.contentText, contentData: input.body.contentData };
    versions.unshift(version);
    return version;
  });
  return { versions, setCurrent: (id: string) => { current = id; } };
}
function structureDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
describe("T-1070 默认分镜严格确认（真实Provider与原client边界）", () => {
  beforeEach(() => {
    mockCreateArtifactVersion.mockReset(); mockGetArtifact.mockReset(); mockListArtifactVersions.mockReset();
    mockListArtifacts.mockReset(); mockCreateArtifact.mockReset();
    localStorage.setItem("creatoros:current-group", "structure-group");
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.removeItem("creatoros:current-group"); });
  it("默认分镜真实注册，已保存全文和版本读回后才给source", async () => {
    structureBoundary(); render(creationStructure());
    expect(screen.queryByTestId("rich-view")).not.toBeInTheDocument();
    await act(async () => expect(await prepareStructure()).toEqual({ kind: "project_script", id: "structure-real", versionId: "version-before" }));
    expect(mockGetArtifact).toHaveBeenCalled(); expect(mockListArtifactVersions).toHaveBeenCalled();
    expect(mockCreateArtifactVersion).not.toHaveBeenCalled();
  });
  it("当前未保存稿保真实ID、类型、时间与完整visual，旧html不覆盖新sections", async () => {
    const sections = SECTIONS.map((s, i) => i === 0 ? { ...s, visual: { description: "当前画面", assetRefs: ["real-asset"], missing: [], extra: { keep: true } } } : structuredClone(s));
    const server = structureBoundary(sections);
    (server.versions[0]!.contentData as Record<string, unknown>).html = "<p>旧正文</p>";
    render(creationStructure({ sections }));
    fireEvent.change(screen.getByLabelText("第 1 段正文"), { target: { value: "新正文🦊，完整保留。" } });
    await act(async () => expect(await prepareStructure()).toMatchObject({ id: "structure-real", versionId: "version-created-1" }));
    expect(mockCreateArtifactVersion).toHaveBeenCalledOnce();
    expect(mockCreateArtifactVersion.mock.calls[0]![0]).toMatchObject({ params: { artifactId: "structure-real" }, body: { expectedCurrentVersionId: "version-before", contentData: { sections: [{ ...structurePayload(sections)[0], body: "新正文🦊，完整保留。" }, ...structurePayload(sections).slice(1)] } } });
    expect((mockCreateArtifactVersion.mock.calls[0]![0] as any).body.contentData).not.toHaveProperty("html");
  });
  it("首次ensure真实ID保留，两次明确编辑不再次ensure或猜其它脚本", async () => {
    structureBoundary(); mockListArtifacts.mockResolvedValue([]); mockCreateArtifact.mockResolvedValue({ id: "structure-real" });
    render(creationStructure({ artifactId: null }));
    fireEvent.change(screen.getByLabelText("第 1 段正文"), { target: { value: "首次编辑" } });
    await act(async () => expect(await prepareStructure()).toMatchObject({ id: "structure-real", versionId: "version-created-1" }));
    fireEvent.change(screen.getByLabelText("第 1 段正文"), { target: { value: "二次编辑" } });
    await act(async () => expect(await prepareStructure()).toMatchObject({ id: "structure-real", versionId: "version-created-2" }));
    expect(mockCreateArtifact).toHaveBeenCalledOnce(); expect(mockListArtifacts).toHaveBeenCalledOnce();
    expect((mockCreateArtifactVersion.mock.calls[1]![0] as any).body.expectedCurrentVersionId).toBe("version-created-1");
  });
  it("保存期间继续输入拒绝本次确认且保留新稿", async () => {
    structureBoundary(); const pending = structureDeferred<any>(); mockCreateArtifactVersion.mockReturnValueOnce(pending.promise);
    render(creationStructure());
    fireEvent.change(screen.getByLabelText("第 1 段正文"), { target: { value: "正在保存的稿" } });
    let failure!: Promise<void>;
    await act(async () => { failure = expect(prepareStructure()).rejects.toThrow(/改变|修改/); });
    await waitFor(() => expect(mockCreateArtifactVersion).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByLabelText("第 1 段正文"), { target: { value: "保存途中新稿" } });
    await act(async () => { pending.resolve({ id: "known-saved", artifactId: "structure-real" }); await failure; });
    expect(screen.getByLabelText("第 1 段正文")).toHaveValue("保存途中新稿");
  });
  it("切纯文本视图注销token，迟到原保存不发旧source", async () => {
    structureBoundary(); const pending = structureDeferred<any>(); mockCreateArtifactVersion.mockReturnValueOnce(pending.promise);
    render(creationStructure()); fireEvent.change(screen.getByLabelText("第 1 段正文"), { target: { value: "当前结构稿" } });
    let failure!: Promise<void>; await act(async () => { failure = expect(prepareStructure()).rejects.toThrow(/改变|卸载|切换/); });
    await waitFor(() => expect(mockCreateArtifactVersion).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "纯文本稿" }));
    await act(async () => { pending.resolve({ id: "late-known", artifactId: "structure-real" }); await failure; });
    expect(screen.getByTestId("rich-view")).toBeVisible();
    await expect(prepareStructure()).rejects.toThrow("脚本尚未准备好");
  });
  it("无响应ID的UNKNOWN不把同正文旧current当回执，也不盲append", async () => {
    structureBoundary(); render(creationStructure());
    const body = SECTIONS[0]!.body;
    fireEvent.change(screen.getByLabelText("第 1 段正文"), { target: { value: "临时修改" } });
    fireEvent.change(screen.getByLabelText("第 1 段正文"), { target: { value: body } });
    mockCreateArtifactVersion.mockRejectedValueOnce(Error("保存响应未知"));
    await act(async () => { await expect(prepareStructure()).rejects.toThrow("保存响应未知"); });
    await act(async () => { await expect(prepareStructure()).rejects.toThrow(/未知|原保存|回执/); });
    expect(mockCreateArtifactVersion).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("第 1 段正文")).toHaveValue(body);
  });
  it("原公共transport明确409 ConflictError后保dirty和原错误，用户再次确认可沿同base/body保存", async () => {
    structureBoundary(); render(creationStructure());
    fireEvent.change(screen.getByLabelText("第 1 段正文"), { target: { value: "未写入的当前稿🦊" } });
    const dispatch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ error: {
      code: ErrorCode.ConflictError, message: "内容已在其他页面更新，请刷新后基于当前版本重试", details: {},
    } }), { status: 409, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", dispatch);
    mockCreateArtifactVersion.mockImplementationOnce(input => createHttpTransport().request(ENDPOINTS.createArtifactVersion, input as any));
    await act(async () => { await expect(prepareStructure()).rejects.toMatchObject({ status: 409, code: ErrorCode.ConflictError }); });
    expect(dispatch).toHaveBeenCalledOnce();
    expect(JSON.parse(dispatch.mock.calls[0]![1]!.body as string)).toMatchObject({ id: "artifacts.versions.create", input: { params: { artifactId: "structure-real" }, body: { expectedCurrentVersionId: "version-before" } } });
    expect(mockCreateArtifactVersion).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("第 1 段正文")).toHaveValue("未写入的当前稿🦊");
    expect(document.querySelector('[data-slot="structure-save-status"]')).toHaveAttribute("data-save-status", "dirty");
    const original = structuredClone(mockCreateArtifactVersion.mock.calls[0]![0]);
    await act(async () => expect(await prepareStructure()).toMatchObject({ versionId: "version-created-1" }));
    expect(mockCreateArtifactVersion).toHaveBeenCalledTimes(2);
    expect(mockCreateArtifactVersion.mock.calls[1]![0]).toEqual(original);
  });
  it("手工保存收到明确CAS拒绝后下一次严格确认核并发current，不把它换成原base覆盖", async () => {
    const server = structureBoundary(); render(creationStructure());
    fireEvent.change(screen.getByLabelText("第 1 段正文"), { target: { value: "保留我的未保存稿" } });
    server.versions.unshift({ ...server.versions[0]!, id: "another-user-version" });
    server.setCurrent("another-user-version");
    mockCreateArtifactVersion.mockRejectedValueOnce(new HttpTransportError("原CAS明确拒绝", { status: 409, code: ErrorCode.ConflictError }));
    fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));
    await waitFor(() => expect(document.querySelector('[data-slot="structure-save-status"]')).toHaveAttribute("data-save-status", "dirty"));
    expect(mockCreateArtifactVersion).toHaveBeenCalledOnce();
    await act(async () => { await expect(prepareStructure()).rejects.toThrow("脚本已并发更新"); });
    expect(mockCreateArtifactVersion).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("第 1 段正文")).toHaveValue("保留我的未保存稿");
    mockCreateArtifactVersion.mockRejectedValueOnce(new HttpTransportError("原CAS仍拒绝", { status: 409, code: ErrorCode.ConflictError }));
    fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));
    await waitFor(() => expect(mockCreateArtifactVersion).toHaveBeenCalledTimes(2));
    expect((mockCreateArtifactVersion.mock.calls[1]![0] as any).body.expectedCurrentVersionId).toBe("version-before");
  });
  it("首次ensure后明确CAS拒绝保真实ID和原prior，后续current变更不自动rebasing", async () => {
    const server = structureBoundary(); mockListArtifacts.mockResolvedValue([]); mockCreateArtifact.mockResolvedValue({ id: "structure-real" });
    render(creationStructure({ artifactId: null }));
    fireEvent.change(screen.getByLabelText("第 1 段正文"), { target: { value: "首份当前稿" } });
    mockCreateArtifactVersion.mockRejectedValueOnce(new HttpTransportError("首次CAS明确拒绝", { status: 409, code: ErrorCode.ConflictError }));
    await act(async () => { await expect(prepareStructure()).rejects.toThrow("首次CAS明确拒绝"); });
    server.versions.unshift({ ...server.versions[0]!, id: "another-user-version" });
    server.setCurrent("another-user-version");
    await act(async () => { await expect(prepareStructure()).rejects.toThrow("脚本已并发更新"); });
    expect(mockCreateArtifactVersion).toHaveBeenCalledOnce();
    expect(mockCreateArtifact).toHaveBeenCalledOnce(); expect(mockListArtifacts).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("第 1 段正文")).toHaveValue("首份当前稿");
  });
  it.each([
    { status: 503, code: ErrorCode.ConflictError },
    { status: 409, code: "CONFLICT" },
    { status: 409, code: null },
    { status: 400, code: ErrorCode.ValidationError },
  ])("非原明确CAS拒绝 $status/$code 继续保UNKNOWN意图，不再次append", async ({ status, code }) => {
    structureBoundary(); render(creationStructure());
    fireEvent.change(screen.getByLabelText("第 1 段正文"), { target: { value: "未知时保留这份稿" } });
    mockCreateArtifactVersion.mockRejectedValueOnce(new HttpTransportError("原请求结果需保守恢复", { status, code }));
    await act(async () => { await expect(prepareStructure()).rejects.toThrow("原请求结果需保守恢复"); });
    await act(async () => { await expect(prepareStructure()).rejects.toThrow("没有唯一版本回执"); });
    expect(mockCreateArtifactVersion).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("第 1 段正文")).toHaveValue("未知时保留这份稿");
  });
  it("已known版本的读回失败恢复原ID，不再追加；并发current换版明确拒绝", async () => {
    const server = structureBoundary(); render(creationStructure());
    fireEvent.change(screen.getByLabelText("第 1 段正文"), { target: { value: "已保存但读回丢失" } });
    mockListArtifactVersions.mockRejectedValueOnce(Error("读回未知"));
    await act(async () => { await expect(prepareStructure()).rejects.toThrow("读回未知"); });
    await act(async () => expect(await prepareStructure()).toMatchObject({ versionId: "version-created-1" }));
    expect(mockCreateArtifactVersion).toHaveBeenCalledOnce();
    server.setCurrent("another-user-version");
    await act(async () => { await expect(prepareStructure()).rejects.toThrow(/并发|当前版本|更新/); });
    expect(mockCreateArtifactVersion).toHaveBeenCalledOnce();
  });
  it("无响应ID时新current恰好同文也不能冒充这次保存回执", async () => {
    const server = structureBoundary(); render(creationStructure());
    fireEvent.change(screen.getByLabelText("第 1 段正文"), { target: { value: "另一用户也可能写的稿" } });
    mockCreateArtifactVersion.mockRejectedValueOnce(Error("网络响应未知"));
    await act(async () => { await expect(prepareStructure()).rejects.toThrow("网络响应未知"); });
    const body = (mockCreateArtifactVersion.mock.calls[0]![0] as any).body;
    server.versions.unshift({ id: "another-same-text", artifactId: "structure-real", contentText: body.contentText, contentData: structuredClone(body.contentData) });
    server.setCurrent("another-same-text");
    await act(async () => { await expect(prepareStructure()).rejects.toThrow("没有唯一版本回执"); });
    expect(mockCreateArtifactVersion).toHaveBeenCalledOnce();
  });
  it("等待原手工保存超过旧10s仍不提前确认、不启动第二次save", async () => {
    const server = structureBoundary(); const pending = structureDeferred<any>(); mockCreateArtifactVersion.mockReturnValueOnce(pending.promise);
    render(creationStructure()); fireEvent.change(screen.getByLabelText("第 1 段正文"), { target: { value: "慢保存仍等完整回执" } });
    fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));
    expect(mockCreateArtifactVersion).toHaveBeenCalledOnce();
    vi.useFakeTimers(); let settled = false; let prepared!: Promise<unknown>;
    await act(async () => { prepared = prepareStructure().then(value => { settled = true; return value; }); await vi.advanceTimersByTimeAsync(12_000); });
    expect(settled).toBe(false); expect(mockCreateArtifactVersion).toHaveBeenCalledOnce();
    const body = (mockCreateArtifactVersion.mock.calls[0]![0] as any).body;
    const saved = { id: "manual-known", artifactId: "structure-real", contentText: body.contentText, contentData: body.contentData };
    server.versions.unshift(saved); server.setCurrent(saved.id);
    await act(async () => { pending.resolve(saved); expect(await prepared).toEqual({ kind: "project_script", id: "structure-real", versionId: "manual-known" }); });
    expect(mockCreateArtifactVersion).toHaveBeenCalledOnce();
  });
  it("工作区切换或卸载后迟到保存只保原回执，不更新新scope或返回source", async () => {
    structureBoundary(); const pending = structureDeferred<any>(); mockCreateArtifactVersion.mockReturnValueOnce(pending.promise);
    render(creationStructure()); fireEvent.change(screen.getByLabelText("第 1 段正文"), { target: { value: "原工作区的稿" } });
    let failure!: Promise<void>; await act(async () => { failure = expect(prepareStructure()).rejects.toThrow(/工作区|卸载|切换/); });
    await waitFor(() => expect(mockCreateArtifactVersion).toHaveBeenCalledOnce());
    act(() => { localStorage.setItem("creatoros:current-group", "other-group"); window.dispatchEvent(new Event("creatoros:accounts-changed")); });
    await act(async () => { pending.resolve({ id: "old-scope-known", artifactId: "structure-real" }); await failure; });
    expect(screen.getByLabelText("第 1 段正文")).toHaveValue("原工作区的稿");
    await act(async () => { await expect(prepareStructure()).rejects.toThrow(/工作区|切换/); });
    expect(mockCreateArtifactVersion).toHaveBeenCalledOnce();
  });
  it("真实外部props换版时generation使原读回失效，新稿完整保留", async () => {
    const server = structureBoundary(); const pending = structureDeferred<any[]>(); mockListArtifactVersions.mockReturnValueOnce(pending.promise);
    const view = render(creationStructure());
    let failure!: Promise<void>; await act(async () => { failure = expect(prepareStructure()).rejects.toThrow(/改变|修改/); });
    await waitFor(() => expect(mockListArtifactVersions).toHaveBeenCalledOnce());
    const sections = SECTIONS.map((s, i) => i === 0 ? { ...s, body: "外部完整新稿" } : s);
    view.rerender(creationStructure({ sections }));
    await act(async () => { pending.resolve(server.versions); await failure; });
    expect(screen.getByLabelText("第 1 段正文")).toHaveValue("外部完整新稿");
    expect(mockCreateArtifactVersion).not.toHaveBeenCalled();
  });
  it("artifact/project与exact version artifactId任一错配都拒绝确认", async () => {
    structureBoundary(); render(creationStructure());
    mockGetArtifact.mockResolvedValueOnce({ id: "structure-real", projectId: "foreign-project", currentVersionId: "version-before" });
    await act(async () => { await expect(prepareStructure()).rejects.toThrow("不属于当前项目"); });
    mockListArtifactVersions.mockResolvedValueOnce([{ id: "version-before", artifactId: "foreign-artifact", contentText: "", contentData: {} }]);
    await act(async () => { await expect(prepareStructure()).rejects.toThrow("版本不属于原保存目标"); });
    expect(mockCreateArtifactVersion).not.toHaveBeenCalled();
  });
  it("原rich的段间空行格式不同仍沿原CAS确认当前结构一次，不阻断默认视图", async () => {
    const server = structureBoundary(); server.versions[0]!.contentText = server.versions[0]!.contentText.replace("\n", "\n\n");
    render(creationStructure());
    await act(async () => expect(await prepareStructure()).toMatchObject({ versionId: "version-created-1" }));
    expect(mockCreateArtifactVersion).toHaveBeenCalledOnce();
    expect((mockCreateArtifactVersion.mock.calls[0]![0] as any).body).toMatchObject({ expectedCurrentVersionId: "version-before", contentText: plainTextFromSections(structurePayload(SECTIONS)), contentData: { sections: structurePayload(SECTIONS) } });
  });
});
