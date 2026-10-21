/**
 * 行为测试:TipTap 脚本富文本编辑器(T-019 / L4)。
 *
 * 覆盖:
 *  - 编辑器在 jsdom 下真挂载(ProseMirror contenteditable 出现),初值 HTML 灌入;
 *  - 工具栏 role="toolbar" + 每个格式按钮带 aria-pressed(真富文本控件,非装饰);
 *  - 保存(有 artifactId)→ client.createArtifactVersion 带 contentData.html + sections + contentText
 *    → router.refresh();fixture-only(无 artifactId)保存不打契约。
 *
 * TipTap/ProseMirror 在 jsdom 下用 `immediatelyRender:false`,故渲染异步 —— 用 waitFor 等。
 */

import * as React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/react";

import { DraftChatRequestProvider, useDraftChatRequest } from "@/features/draft-workbench/draft-chat-request";
import { ScriptRichEditor } from "./script-rich-editor";
import {AccountSwitcher} from "@/components/shell/account-switcher";
import {beginForegroundActivity,hasForegroundActivity,listForegroundActivities,resetForegroundActivitiesForTest} from "@/lib/foreground-activity";

const mockRouter = {
  refresh: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
};
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockCreateArtifactVersion = vi.fn(
  (input: unknown): Promise<unknown> => Promise.resolve({ id: "av-new", input }),
);
// [T-247] 偏好读(autosaveEnabled → 失焦自动保存)。缺省 false = 不自动保存。
const mockGetArtifact=vi.fn(),mockListArtifactVersions=vi.fn();
const mockEnsureScript=vi.hoisted(()=>vi.fn());
vi.mock('./ensure-script-artifact',()=>({ensureScriptArtifact:(...args:unknown[])=>mockEnsureScript(...args)}));
const mockGetPreferences = vi.fn(
  (): Promise<unknown> => Promise.resolve({ autosaveEnabled: false }),
);
vi.mock("@/lib/contract-client", () => ({
  client: {
    createArtifactVersion: (input: unknown) =>
      mockCreateArtifactVersion(input),
    getPreferences: () => mockGetPreferences(),
    getArtifact:(input:unknown)=>mockGetArtifact(input),listArtifactVersions:(input:unknown)=>mockListArtifactVersions(input),
  },
}));

afterEach(() => cleanup());
beforeEach(() => {
  resetForegroundActivitiesForTest();
  localStorage.clear();
  mockRouter.refresh.mockClear();
  mockCreateArtifactVersion.mockReset();
  mockCreateArtifactVersion.mockImplementation((input:unknown)=>Promise.resolve({id:"av-new",input}));
  mockGetPreferences.mockClear();
  mockGetPreferences.mockResolvedValue({ autosaveEnabled: false });
});

const INITIAL_HTML =
  "<h2>开场 15 秒</h2><p>你有没有想过浏览器也能帮你完成任务？</p><h2>金句</h2><p><strong>AI Native Browser 不是工具，而是同事。</strong></p>";

async function findProseMirror(): Promise<HTMLElement> {
  return await waitFor(() => {
    const el = document.querySelector(
      '[data-slot="script-prosemirror"]',
    ) as HTMLElement | null;
    expect(el).not.toBeNull();
    return el!;
  });
}

it("T-1382 准备候选落库后的外部版本不覆盖尚未保存的本地稿", async () => {
  let editor: Editor | null = null;
  const mounted = render(<ScriptRichEditor projectId="project-real" artifactId="a1" initialHtml="<p>已保存稿</p>" onEditorReady={value => {editor=value;}} />);
  await findProseMirror();
  await act(async () => {editor!.commands.setContent("<p>用户未保存的输入</p>");});
  mounted.rerender(<ScriptRichEditor projectId="project-real" artifactId="a1" initialHtml="<p>准备候选已采纳版本</p>" onEditorReady={value => {editor=value;}} />);
  expect(editor!.getText()).toBe("用户未保存的输入");
  expect(document.querySelector('[data-save-status="dirty"]')).not.toBeNull();
}, 120000);

it("T1382 dirty时到达的外部旧稿在本地保存后也不回灌",async()=>{
 let editor:Editor|null=null;
 const view=(html:string)=><DraftChatRequestProvider><FlushProbe/><ScriptRichEditor projectId="project-real" artifactId="a1" initialHtml={html} onEditorReady={value=>{editor=value;}}/></DraftChatRequestProvider>;
 const mounted=render(view("<p>原正式稿</p>"));await findProseMirror();
 await act(async()=>{editor!.commands.setContent("<p>用户本地稿</p>");});mounted.rerender(view("<p>稍早采纳的外部稿</p>"));
 await act(async()=>{await strictFlush();});expect(editor!.getText()).toBe("用户本地稿");expect(document.querySelector('[data-save-status="saved"]')).not.toBeNull();
},120000);

describe("ScriptRichEditor (TipTap)", () => {
  it("dirty与保存在途登记离开保护，保存或卸载只释放自己的活动",async()=>{
    let editor:Editor|null=null,finish!:(value:unknown)=>void;
    mockCreateArtifactVersion.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const mounted=render(<ScriptRichEditor initialHtml="<p>原稿</p>" artifactId="guard-artifact" onEditorReady={value=>{editor=value;}}/>);
    await findProseMirror();await waitFor(()=>expect(editor).not.toBeNull());expect(hasForegroundActivity()).toBe(false);
    act(()=>{editor!.commands.insertContent("新输入");});await waitFor(()=>expect(hasForegroundActivity()).toBe(true));
    const endOther=beginForegroundActivity("另一个操作");await userEvent.setup().click(screen.getByRole("button",{name:"保存"}));
    await waitFor(()=>expect(listForegroundActivities()).toContain("脚本正在保存"));
    await act(async()=>finish({id:"guard-saved-version"}));await waitFor(()=>expect(listForegroundActivities()).toEqual(["另一个操作"]));
    act(()=>{editor!.commands.insertContent("继续编辑");});await waitFor(()=>expect(listForegroundActivities()).toHaveLength(2));
    mounted.unmount();expect(listForegroundActivities()).toEqual(["另一个操作"]);endOther();expect(hasForegroundActivity()).toBe(false);
  });
  it("关闭自动保存的真实编辑器切组先确认，取消保原稿原scope且不偷偷保存",async()=>{
    const group=(id:string)=>({id,userId:"u",name:`组${id}`,status:"active",version:1,createdAt:"2026-10-18T00:00:00Z",updatedAt:"2026-10-18T00:00:00Z",members:[]});
    localStorage.setItem("creatoros:current-group","a");window.history.replaceState(null,"","/");
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({data:[group("a"),group("b")],meta:{requestId:"guard",page:1,pageSize:100,total:2}}),{status:200})));
    try{
      let editor:Editor|null=null;render(<><AccountSwitcher collapsed={false}/><ScriptRichEditor initialHtml="<p>原稿</p>" artifactId="guard-artifact" onEditorReady={value=>{editor=value;}}/></>);
      await findProseMirror();await screen.findByRole("button",{name:"当前账号组：组a"});await waitFor(()=>expect(editor).not.toBeNull());
      act(()=>{editor!.commands.insertContent("逐字保留的新输入");});const text=editor!.getText();const user=userEvent.setup();
      await user.click(screen.getByTestId("account-switcher-trigger"));await user.click(screen.getByRole("menuitem",{name:"组b"}));
      expect(screen.getByTestId("account-switch-confirm")).toBeVisible();expect(localStorage.getItem("creatoros:current-group")).toBe("a");
      await user.click(screen.getByTestId("account-switch-cancel"));expect(editor!.getText()).toBe(text);expect(localStorage.getItem("creatoros:current-group")).toBe("a");expect(mockCreateArtifactVersion).not.toHaveBeenCalled();
    }finally{vi.unstubAllGlobals();}
  });
  it("mounts a ProseMirror contenteditable seeded with the initial HTML", async () => {
    render(<ScriptRichEditor initialHtml={INITIAL_HTML} />);
    const pm = await findProseMirror();
    expect(pm.getAttribute("contenteditable")).toBe("true");
    // The seeded heading + body text shows up in the editable document.
    await waitFor(() => {
      expect(pm.textContent ?? "").toContain("开场 15 秒");
      expect(pm.textContent ?? "").toContain("浏览器也能帮你完成任务");
    });
  });

  it("renders a role=toolbar with format buttons carrying aria-pressed", async () => {
    render(<ScriptRichEditor initialHtml={INITIAL_HTML} />);
    await findProseMirror();
    const toolbar = document.querySelector(
      '[data-slot="editor-toolbar"]',
    ) as HTMLElement;
    expect(toolbar).not.toBeNull();
    expect(toolbar.getAttribute("role")).toBe("toolbar");
    const buttons = toolbar.querySelectorAll(
      '[data-slot="editor-toolbar-button"]',
    );
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    buttons.forEach((b) => expect(b.hasAttribute("aria-pressed")).toBe(true));
    // The bold button exists (data-format="bold" — the mark button, truthfully bold).
    expect(
      toolbar.querySelector(
        '[data-slot="editor-toolbar-button"][data-format="bold"]',
      ),
    ).not.toBeNull();
    // T-024 ③:heading 按钮如实标 data-format="heading"(不再谎报 "bold"),
    // 且没有任何 heading 按钮伪装成 bold(H1/H2/H3 三个都在 heading 契约位下)。
    const headingButtons = toolbar.querySelectorAll(
      '[data-slot="editor-toolbar-button"][data-format="heading"]',
    );
    expect(headingButtons.length).toBe(3);
    headingButtons.forEach((b) =>
      expect(b.hasAttribute("aria-pressed")).toBe(true),
    );
    // Exactly one truthful bold button, not four (the 3 headings no longer lie as bold).
    expect(
      toolbar.querySelectorAll(
        '[data-slot="editor-toolbar-button"][data-format="bold"]',
      ).length,
    ).toBe(1);
  });

  it("exposes the editor shell, document slot and status bar (word count + save status)", async () => {
    render(<ScriptRichEditor initialHtml={INITIAL_HTML} />);
    await findProseMirror();
    const shell = document.querySelector('[data-slot="rich-text-editor"]');
    expect(shell).not.toBeNull();
    expect(
      shell!.querySelector('[data-slot="script-document"]'),
    ).not.toBeNull();
    const statusBar = shell!.querySelector('[data-slot="editor-status-bar"]');
    expect(statusBar).not.toBeNull();
    expect(
      statusBar!.querySelector('[data-slot="editor-status-word-count"]'),
    ).not.toBeNull();
    expect(
      statusBar!.querySelector('[data-slot="editor-status-save-status"]'),
    ).not.toBeNull();
  });

  it("toggling bold via a real TipTap command flips the toolbar aria-pressed", async () => {
    // jsdom has no layout → ProseMirror can't resolve a caret from a mouse coord.
    // Drive editing through the editor handle (TipTap's recommended test path).
    let editor: Editor | null = null;
    render(
      <ScriptRichEditor
        initialHtml="<p>脚本正文</p>"
        onEditorReady={(e) => (editor = e)}
      />,
    );
    await findProseMirror();
    await waitFor(() => expect(editor).not.toBeNull());
    const bold = document.querySelector(
      '[data-slot="editor-toolbar-button"][data-format="bold"]',
    ) as HTMLButtonElement;
    expect(bold.getAttribute("aria-pressed")).toBe("false");
    // Select the whole doc, then toggle bold — the toolbar must reflect the active mark.
    editor!.chain().selectAll().toggleBold().run();
    await waitFor(() =>
      expect(bold.getAttribute("aria-pressed")).toBe("true"),
    );
  });

  it("editing flips save status to dirty", async () => {
    let editor: Editor | null = null;
    render(
      <ScriptRichEditor
        initialHtml="<p>开场</p>"
        onEditorReady={(e) => (editor = e)}
      />,
    );
    await findProseMirror();
    await waitFor(() => expect(editor).not.toBeNull());
    const status = document.querySelector(
      '[data-slot="editor-status-save-status"]',
    ) as HTMLElement;
    expect(status.getAttribute("data-save-status")).toBe("saved");
    editor!.chain().focus("end").insertContent("补充内容").run();
    await waitFor(() =>
      expect(status.getAttribute("data-save-status")).toBe("dirty"),
    );
  });

  it("real Save (with artifactId) persists html + sections + contentText and refreshes", async () => {
    const user = userEvent.setup();
    let editor: Editor | null = null;
    render(
      <ScriptRichEditor
        initialHtml={INITIAL_HTML}
        artifactId="artifact-1"
        onEditorReady={(e) => (editor = e)}
      />,
    );
    await findProseMirror();
    await waitFor(() => expect(editor).not.toBeNull());
    editor!.chain().focus("end").insertContent("。").run();
    await waitFor(() => {
      const status = document.querySelector(
        '[data-slot="editor-status-save-status"]',
      ) as HTMLElement;
      expect(status.getAttribute("data-save-status")).toBe("dirty");
    });
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(mockCreateArtifactVersion).toHaveBeenCalledTimes(1),
    );
    const call = mockCreateArtifactVersion.mock.calls[0]![0] as {
      params: { artifactId: string };
      body: {
        contentText: string;
        contentData: {
          html: string;
          sections: Array<{ heading: string; body: string }>;
        };
        changeSummary: string;
      };
    };
    expect(call.params).toEqual({ artifactId: "artifact-1" });
    expect(call.body.changeSummary).toBe("编辑脚本");
    // contentData.html carries the rich-text body (faithful round-trip source).
    expect(call.body.contentData.html).toContain("<h2>开场 15 秒</h2>");
    expect(call.body.contentData.html).toContain("<strong>");
    // contentData.sections is the derived structure (outline/golden-quote + AI compat).
    expect(call.body.contentData.sections.length).toBeGreaterThanOrEqual(2);
    expect(call.body.contentData.sections[0]!.heading).toBe("开场 15 秒");
    // contentText is the plain-text projection.
    expect(call.body.contentText).toContain("开场 15 秒");

    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
    const status = document.querySelector(
      '[data-slot="editor-status-save-status"]',
    ) as HTMLElement;
    await waitFor(() =>
      expect(status.getAttribute("data-save-status")).toBe("saved"),
    );
  });

  // [T-247] 设置「偏好 · 自动保存」的真实消费:开启时失焦自动落库;关闭时失焦不动。
  it("[T-247] autosaveEnabled=true → 编辑后失焦自动 createArtifactVersion", async () => {
    mockGetPreferences.mockResolvedValue({ autosaveEnabled: true });
    let editor: Editor | null = null;
    render(
      <ScriptRichEditor
        initialHtml="<p>开场</p>"
        artifactId="artifact-1"
        onEditorReady={(e) => (editor = e)}
      />,
    );
    await findProseMirror();
    await waitFor(() => expect(editor).not.toBeNull());
    // 偏好读回(挂载后一次)。
    await waitFor(() => expect(mockGetPreferences).toHaveBeenCalledTimes(1));
    editor!.chain().focus("end").insertContent("补充").run();
    await waitFor(() => {
      const status = document.querySelector(
        '[data-slot="editor-status-save-status"]',
      ) as HTMLElement;
      expect(status.getAttribute("data-save-status")).toBe("dirty");
    });
    editor!.commands.blur();
    await waitFor(() =>
      expect(mockCreateArtifactVersion).toHaveBeenCalledTimes(1),
    );
    const call = mockCreateArtifactVersion.mock.calls[0]![0] as {
      params: { artifactId: string };
    };
    expect(call.params).toEqual({ artifactId: "artifact-1" });
  });

  it("[T-247] autosaveEnabled=false → 失焦不自动保存(仍走手动)", async () => {
    mockGetPreferences.mockResolvedValue({ autosaveEnabled: false });
    let editor: Editor | null = null;
    render(
      <ScriptRichEditor
        initialHtml="<p>开场</p>"
        artifactId="artifact-1"
        onEditorReady={(e) => (editor = e)}
      />,
    );
    await findProseMirror();
    await waitFor(() => expect(editor).not.toBeNull());
    await waitFor(() => expect(mockGetPreferences).toHaveBeenCalledTimes(1));
    editor!.chain().focus("end").insertContent("补充").run();
    await waitFor(() => {
      const status = document.querySelector(
        '[data-slot="editor-status-save-status"]',
      ) as HTMLElement;
      expect(status.getAttribute("data-save-status")).toBe("dirty");
    });
    editor!.commands.blur();
    // 给潜在的错误自动保存一个 flush 窗口再断言(负向断言)。
    await new Promise((r) => setTimeout(r, 50));
    expect(mockCreateArtifactVersion).not.toHaveBeenCalled();
  });

  it("suppresses a stale external re-sync that lands after the user has kept editing (T-024 ②)", async () => {
    // Simulate the save race: user edits, then an external initialHtml (the router.refresh
    // echo of the PREVIOUS content) arrives while the user has kept typing. The in-flight
    // keystrokes must NOT be clobbered by the stale re-sync.
    const user = userEvent.setup();
    let editor: Editor | null = null;
    const seeded = "<p>开场白</p>";
    const { rerender } = render(
      <ScriptRichEditor
        initialHtml={seeded}
        artifactId="artifact-race"
        onEditorReady={(e) => (editor = e)}
      />,
    );
    const pm = await findProseMirror();
    await waitFor(() => expect(editor).not.toBeNull());

    // User types more, then triggers a save (marks last-saved html + pending window).
    editor!.chain().focus("end").insertContent("第一次改动").run();
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(mockCreateArtifactVersion).toHaveBeenCalledTimes(1),
    );
    const savedHtml = (
      mockCreateArtifactVersion.mock.calls[0]![0] as {
        body: { contentData: { html: string } };
      }
    ).body.contentData.html;

    // User keeps typing AFTER the save fired (post-save in-flight edit).
    editor!.chain().focus("end").insertContent("在途继续打字").run();
    await waitFor(() =>
      expect(pm.textContent ?? "").toContain("在途继续打字"),
    );

    // Now the stale echo lands: the parent re-renders with the html we just saved
    // (which does NOT contain the newest keystrokes). This must be swallowed.
    rerender(
      <ScriptRichEditor
        initialHtml={savedHtml}
        artifactId="artifact-race"
        onEditorReady={(e) => (editor = e)}
      />,
    );

    // The in-flight keystrokes survive — the echo did not reset the editor.
    await waitFor(() =>
      expect(pm.textContent ?? "").toContain("在途继续打字"),
    );
    expect(pm.textContent ?? "").toContain("第一次改动");
  });

  it("still applies a genuinely different external initialHtml (not the save echo) (T-024 ②)", async () => {
    // The suppression must be narrow: a real, different external value (e.g. a version
    // restore) still flows into the editor.
    let editor: Editor | null = null;
    const { rerender } = render(
      <ScriptRichEditor
        initialHtml="<p>原始</p>"
        artifactId="artifact-ext"
        onEditorReady={(e) => (editor = e)}
      />,
    );
    const pm = await findProseMirror();
    await waitFor(() => expect(editor).not.toBeNull());
    await waitFor(() => expect(pm.textContent ?? "").toContain("原始"));

    // A different external value arrives (no save in flight) → applied.
    rerender(
      <ScriptRichEditor
        initialHtml="<h2>回滚到的版本</h2><p>新内容</p>"
        artifactId="artifact-ext"
        onEditorReady={(e) => (editor = e)}
      />,
    );
    await waitFor(() => expect(pm.textContent ?? "").toContain("回滚到的版本"));
    expect(pm.textContent ?? "").toContain("新内容");
    expect(pm.textContent ?? "").not.toContain("原始");
  });

  it("local-only Save (no artifactId) does NOT call the contract client", async () => {
    const user = userEvent.setup();
    let editor: Editor | null = null;
    render(
      <ScriptRichEditor
        initialHtml="<p>开场</p>"
        onEditorReady={(e) => (editor = e)}
      />,
    );
    await findProseMirror();
    await waitFor(() => expect(editor).not.toBeNull());
    editor!.chain().focus("end").insertContent("改一下").run();
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(mockCreateArtifactVersion).not.toHaveBeenCalled();
  });

  // [T-268] 对话整稿「采纳写入稿面」的局部刷新:卡片发 SCRIPT_WRITE 信号带新整稿 HTML → 编辑器
  // setContent 直接吃(不 router.refresh 整页重挂)。这是消掉「写入稿面卡顿」的关键路径。
  it("收到 SCRIPT_WRITE 信号 → setContent 局部刷新整稿(不 router.refresh)", async () => {
    let editor: Editor | null = null;
    render(
      <ScriptRichEditor
        initialHtml="<p>旧稿</p>"
        artifactId="art-1"
        projectId="proj-1"
        onEditorReady={(e) => (editor = e)}
      />,
    );
    const pm = await findProseMirror();
    await waitFor(() => expect(editor).not.toBeNull());
    expect(pm.textContent).toContain("旧稿");

    const { emitScriptWrite } = await import("./script-write-signal");
    emitScriptWrite({
      artifactId: null,
      html: "<h2>新整稿标题</h2><p>新整稿口播正文</p>",
    });

    await waitFor(() => {
      expect(pm.textContent).toContain("新整稿标题");
      expect(pm.textContent).toContain("新整稿口播正文");
    });
    expect(pm.textContent).not.toContain("旧稿");
    // 局部刷新走 setContent,**不**触发整页 router.refresh。
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });
});

let strictFlush: () => Promise<void>;
let prepareScript:ReturnType<typeof useDraftChatRequest>['prepareScriptForCreation'];
function FlushProbe() { const port=useDraftChatRequest();strictFlush = port.flushSaveStrict;prepareScript=port.prepareScriptForCreation; return null; }
describe("真实富文本编辑器严格保存", () => {
  it('联合按钮首次ensure真实ID保留在ref，每次冻结当前HTML并读回精确版本',async()=>{
    mockEnsureScript.mockResolvedValue({artifactId:'first-real'});mockCreateArtifactVersion.mockImplementation(async()=>({id:'version-real'}));
    mockGetArtifact.mockResolvedValue({id:'first-real',projectId:'project-real',currentVersionId:'version-real'});
    mockListArtifactVersions.mockImplementation(async()=>{const input=mockCreateArtifactVersion.mock.calls.at(-1)![0] as any;return [{id:'version-real',artifactId:'first-real',contentText:input.body.contentText,contentData:input.body.contentData}];});
    let editor:Editor|null=null;
    render(<DraftChatRequestProvider><FlushProbe/><ScriptRichEditor projectId="project-real" initialHtml="<p>脚本当前真值</p>" onEditorReady={e=>{editor=e;}}/></DraftChatRequestProvider>);
    await findProseMirror();let source:unknown;
    await act(async()=>{source=await prepareScript();});expect(source).toEqual({kind:'project_script',id:'first-real',versionId:'version-real'});
    await act(async()=>{editor!.commands.insertContent('下一次修改');source=await prepareScript();});
    expect(mockEnsureScript).toHaveBeenCalledOnce();expect(mockCreateArtifactVersion).toHaveBeenCalledTimes(2);
    expect(mockCreateArtifactVersion.mock.calls[1][0]).toMatchObject({params:{artifactId:'first-real'},body:{contentData:{html:editor!.getHTML()},contentText:editor!.getText()}});
    expect(mockGetArtifact).toHaveBeenCalledWith({params:{artifactId:'first-real'},query:undefined,body:undefined});
  });
  it("落库响应未知保留正文，读取原版本恢复且不重复追加", async () => {
    let editor: Editor | null = null;
    render(<DraftChatRequestProvider><FlushProbe /><ScriptRichEditor artifactId="a1" initialHtml="<p>原稿</p>" onEditorReady={e => { editor = e; }} /></DraftChatRequestProvider>);
    await findProseMirror();
    await act(async () => { editor!.commands.insertContent("尚未保存"); });
    mockCreateArtifactVersion.mockRejectedValueOnce(new Error("写库失败"));
    await act(async () => { await expect(strictFlush()).rejects.toThrow("写库失败"); });
    expect(editor!.getText()).toContain("尚未保存");
    expect(document.querySelector('[data-save-status="dirty"]')).not.toBeNull();
    const frozen=(mockCreateArtifactVersion.mock.calls[0][0] as any).body;
    mockGetArtifact.mockResolvedValue({id:'a1',currentVersionId:'saved-original'});mockListArtifactVersions.mockResolvedValue([{id:'saved-original',artifactId:'a1',contentText:frozen.contentText,contentData:frozen.contentData}]);
    await act(async () => { await strictFlush(); });
    expect(mockCreateArtifactVersion).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-save-status="saved"]')).not.toBeNull();
  });
  it("保存中再次 flush 等待同一次写入，期间新增文字保留且拒绝旧稿诊断", async () => {
    let editor: Editor | null = null;
    render(<DraftChatRequestProvider><FlushProbe /><ScriptRichEditor artifactId="a1" initialHtml="<p>原稿</p>" onEditorReady={e => { editor = e; }} /></DraftChatRequestProvider>);
    await findProseMirror();
    await act(async () => { editor!.commands.insertContent("第一改"); });
    let resolve!: (value: unknown) => void;
    mockCreateArtifactVersion.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    let first!: Promise<unknown>; let second!: Promise<unknown>;
    await act(async () => {
      first = strictFlush().catch(e => e);
      second = strictFlush().catch(e => e);
    });
    expect(mockCreateArtifactVersion).toHaveBeenCalledTimes(1);
    await act(async () => { editor!.commands.insertContent("第二改"); resolve({ id: "v1" }); });
    expect(await first).toBeInstanceOf(Error); expect(await second).toBeInstanceOf(Error);
    expect(editor!.getText()).toContain("第二改");
    await act(async () => { await strictFlush(); });
    expect(mockCreateArtifactVersion).toHaveBeenCalledTimes(2);
  });
});
