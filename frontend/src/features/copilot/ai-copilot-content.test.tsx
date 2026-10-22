/**
 * Contract tests for the AI Copilot dialog (Task 24 / page-specs §16).
 *
 * Spec invariants under test:
 *  - The dialog is rendered inside exactly ONE shared AppShell.
 *  - The OverlayController is mounted once and centers the panel
 *    (NOT a right-side drawer — page-specs §16 "弹窗居中").
 *  - The component tree matches page-specs §16:
 *      PromptComposer
 *        ├── PromptInput (textarea)
 *        ├── SuggestedActionChips (4 chips)
 *        └── SubmitButton
 *      CopilotDashboard
 *        ├── RecommendedCommands (4 cards)
 *        ├── RecentTasks (real feed; loading/empty state, no fixture rows)
 *        └── ContinuingTasks (real in-progress feed; loading/empty state, no fixture rows)
 *      QuickEntries (3 entries)
 *      SmartRecommendation (2 items)
 *  - The dialog closes when `data-overlay-close` is clicked (close button).
 *  - The submit button does NOT post a real network request — its parent
 *    form has no `action` and no `onSubmit` handler.
 *  - No message-thread UI is rendered.
 *  - The dialog is `role="dialog"` with `aria-modal="true"`.
 */

import * as React from "react";
import {mkdirSync,writeFileSync} from "node:fs";
import path from "node:path";
import {
  cleanup,
  render,
  screen,
  act,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { ENDPOINTS } from "@creatoros/contract";
import { buildCopilotViewModel } from "@/fixtures/selectors/copilot";

const previewNavigation = vi.hoisted(() => ({ search: "copilot=open", pathname: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => previewNavigation.pathname,
  useRouter: () => ({ replace: vi.fn(), back: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(previewNavigation.search),
}));
const protocol = vi.hoisted(() => ({
  messages: [] as any[],
  error: null as Error | null,
  send: vi.fn(),
  regenerate: vi.fn(),
  setMessages: vi.fn(),
  listMessages: vi.fn(async (..._args: unknown[]):Promise<any[]> => []),
  listConversations: vi.fn(async (..._args: unknown[]):Promise<any[]> => []),
  sessionRegistry: null as Map<string,any>|null,
  fetch: vi.fn(),
  upload: vi.fn(),
  live: null as any,
  actualSdk: false,
  status: "ready",
  attachmentIds: [] as string[],
  attachmentChanged: null as null | ((state: { ids: string[]; count: number; uploading: boolean }) => void),
  keyedSessions: false,
  sessionKey: null as string | null,
  engine: "pi" as "pi"|"codex",
  engineAvailable: true,
  engineChecking: false,
}));
vi.mock("./use-assistant-engine",()=>({useAssistantEngine:()=>({engine:protocol.engine,available:protocol.engineAvailable,checking:protocol.engineChecking})}));
vi.mock("@/lib/contract-client", () => ({
  client: {
    listAITasks: async () => [],
    listProjects: async () => [],
    listConversations: (...args: unknown[]) => protocol.listConversations(...args),
    listMessages: (...args: unknown[]) => protocol.listMessages(...args),
  },
}));
vi.mock("./live-chat-session", () => ({
  acquireLiveChatSession: () => () => {},
  getLiveChatSession: (key: string, createChat: (session:any)=>any) => {
    if(protocol.sessionRegistry){
      let session=protocol.sessionRegistry.get(key);
      if(!session){session={control:{fetch:(...args:unknown[])=>protocol.fetch(...args),cancel:async()=>{},currentTaskId:()=>null},conversationId:null,epoch:0,executionEngine:"pi",sourceEngines:new Map(),transport:null};session.chat=createChat(session);protocol.sessionRegistry.set(key,session);}
      protocol.sessionKey=key;protocol.live=session;return session;
    }
    if (protocol.keyedSessions && protocol.sessionKey !== key) protocol.live = null;
    protocol.sessionKey = key;
    return (protocol.live ??= {
      chat: { messages: [], status: "ready" },
      control: {
        fetch: (...args: unknown[]) => protocol.fetch(...args),
        cancel: async () => {},
        currentTaskId: () => null,
      },
      conversationId: null,
      epoch: 0,
      executionEngine: "pi",
      sourceEngines: new Map(),
      transport: null,
    });
  },
}));
vi.mock("@/features/draft-workbench/upload-to-project",async()=>{const actual=await vi.importActual<any>("@/features/draft-workbench/upload-to-project");return {...actual,uploadFileForCopilot:(...args:any[])=>protocol.upload(...args)};});
vi.mock("@ai-sdk/react", async () => {
  const actual=await vi.importActual<{useChat:(options:any)=>any;Chat:new(options:any)=>any}>("@ai-sdk/react");
  return {Chat:actual.Chat,useChat: (options:any) => protocol.actualSdk?actual.useChat(options):({
    messages: protocol.messages,
    status: protocol.status,
    error: protocol.error,
    sendMessage: (...args: unknown[]) => protocol.send(...args),
    regenerate: (...args: unknown[]) => protocol.regenerate(...args),
    setMessages: (...args: unknown[]) => protocol.setMessages(...args),
    stop: async () => {},
  })};
});
vi.mock("./copilot-attachment-picker",async()=>{
  const actual=await vi.importActual<typeof import("./copilot-attachment-picker")>("./copilot-attachment-picker");
  const react=await vi.importActual<typeof import("react")>("react");
  return {...actual,CopilotAttachmentPicker:react.forwardRef((props:any,ref:any)=>{
    const innerRef=react.useRef<any>(null);
    protocol.attachmentChanged = props.onStateChange;
    react.useEffect(()=>{if(protocol.actualSdk&&protocol.attachmentIds.length)props.onStateChange({ids:[...protocol.attachmentIds],count:protocol.attachmentIds.length,uploading:false});},[]);
    react.useImperativeHandle(ref,()=>({clear:()=>{if(!protocol.actualSdk)innerRef.current?.clear();props.onStateChange({ids:[],count:0,uploading:false});},readDraft:()=>innerRef.current?.readDraft?.()??[]}));
    return protocol.actualSdk?null:<actual.CopilotAttachmentPicker {...props} ref={innerRef}/>;
  })};
});

import { AppShell } from "@/components/shell/app-shell";
import { OverlayController } from "@/components/overlays/overlay-controller";
import { AICopilotDialog } from "@/components/overlays/ai-copilot-dialog";
import { AICopilotContent } from "./ai-copilot-content";
import {ArticleWorkbench} from "@/features/article/article-workbench";
// T1340：仅原生编辑器外宿主替身；文章load/Provider/助手准入与正文数据均走真实组件。
vi.mock("@/features/reference-editors/noterelay/noterelay-editor",()=>({NoteRelayEditor:(props:any)=><section aria-label="T1340原生成稿宿主">{props.value.sections.map((s:any)=><p key={s.sectionId}>{s.body}</p>)}</section>}));
import {
  DraftChatRequestProvider,
  useDraftChatRequest,
  type DraftEditorPort,
} from "@/features/draft-workbench/draft-chat-request";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => {
  previewNavigation.search = "copilot=open";
  previewNavigation.pathname = "/";
  protocol.live = null;
  protocol.sessionRegistry = null;
  protocol.actualSdk = false;
  protocol.status = "ready";
  protocol.attachmentIds = [];
  protocol.attachmentChanged = null;
  protocol.keyedSessions = false;
  protocol.sessionKey = null;
  protocol.engine = "pi";
  protocol.engineAvailable = true;
  protocol.engineChecking = false;
  protocol.error = null;
  protocol.messages = [];
  protocol.send.mockReset();
  protocol.regenerate.mockReset();
  protocol.setMessages.mockReset();
  protocol.listMessages.mockReset();
  protocol.listMessages.mockResolvedValue([]);
  protocol.listConversations.mockReset();protocol.listConversations.mockResolvedValue([]);
  protocol.upload.mockReset();protocol.upload.mockResolvedValue({assetId:"fixture-existing-owned-upload"});
  protocol.fetch.mockReset();
  protocol.fetch.mockResolvedValue(new Response("", { status: 200 }));
  sessionStorage.clear();
  localStorage.clear();
  // 合法发送原断言所需的明确中立空组fixture（只localStorage归属意图，无平台账号/模型fixture）。
  localStorage.setItem("creatoros:current-group", "fixture-valid-empty-group");
});

function renderDialog(pathname = "/") {
  return render(
    <AppShell pathname={pathname}>
      <main data-page="test">
        <p>underlay</p>
      </main>
      <OverlayController>
        <AICopilotDialog pathname={pathname} />
      </OverlayController>
    </AppShell>,
  );
}

function slot(dialog: HTMLElement, name: string) {
  return dialog.querySelector(`[data-slot="${name}"]`);
}

describe("独立预览的定位专用对话", () => {
  function openPositioning() {
    previewNavigation.pathname = "/positioning";
    previewNavigation.search = new URLSearchParams({copilot:"open",surface:"positioning",fn:"positioning.generate",scope:"surface:positioning",prefill:"之前保存的信息：我的优势是实践经验。"}).toString();
    return renderDialog("/positioning");
  }
  it("显示定位语境与真实入口，不夹带通用脚本指令", async () => {
    openPositioning();
    expect(screen.getByRole("dialog", {name:"定位对话"})).toBeVisible();
    expect(screen.getByText("账号组级定位 · 无需关联项目")).toBeVisible();
    expect(screen.getByRole("button", {name:/继续深入当前账号/})).toBeVisible();
    expect(screen.queryByRole("button", {name:"生成脚本"})).toBeNull();
    expect(screen.getByRole("button", {name:"历史记录"})).toBeVisible();
    expect(screen.getByRole("button", {name:"新对话"})).toBeVisible();
    expect(screen.getByRole("button", {name:"添加文件或图片"})).toBeVisible();
    await waitFor(() => expect(screen.getByRole("textbox", {name:"定位对话内容"})).toHaveValue("之前保存的信息：我的优势是实践经验。"));
    expect(protocol.send).not.toHaveBeenCalled();
  });
  it("更换起点保留入口资料，不累积矛盾选择或自动发送", async () => {
    openPositioning();
    const input = screen.getByRole("textbox", {name:"定位对话内容"});
    await waitFor(() => expect(input).toHaveValue("之前保存的信息：我的优势是实践经验。"));
    await userEvent.setup().click(screen.getByRole("button", {name:/继续深入当前账号/}));
    expect((input as HTMLTextAreaElement).value).toContain("我的优势是实践经验");
    expect(input).toHaveFocus();
    await userEvent.setup().click(screen.getByRole("button", {name:/完全从零开始/}));
    expect((input as HTMLTextAreaElement).value).toContain("完全从零开始定位");
    expect((input as HTMLTextAreaElement).value).not.toContain("我想继续深入");
    expect((input as HTMLTextAreaElement).value).toContain("我的优势是实践经验");
    expect(protocol.send).not.toHaveBeenCalled();
  });
  it("保留手写草稿，更换起点只替换预填选择", async () => {
    openPositioning();
    const input = screen.getByRole("textbox", {name:"定位对话内容"});
    await waitFor(() => expect(input).toHaveValue("之前保存的信息：我的优势是实践经验。"));
    fireEvent.change(input, {target:{value:"我想分享十年的教学经验。"}});
    await userEvent.setup().click(screen.getByRole("button", {name:/调整到一个新方向/}));
    await userEvent.setup().click(screen.getByRole("button", {name:/完全从零开始/}));
    expect((input as HTMLTextAreaElement).value).toContain("我想分享十年的教学经验。");
    expect((input as HTMLTextAreaElement).value).not.toContain("我想调整");
    expect(protocol.send).not.toHaveBeenCalled();
  });
});

describe("AI Copilot dialog (Task 24)", () => {
  it("宿主读取失败保留原因与恢复，不渲染项目空库或绿色成功",()=>{
    protocol.messages=[{id:"assistant-real-result",role:"assistant",parts:[{type:"tool-context_projects",toolCallId:"real-tool",state:"output-available",input:{},output:{kind:"context.projects",items:[],total:0,__creatorosOutcome:{schemaVersion:1,callId:"call-real",status:"error",summary:"账号权限已变更",sideEffect:"none",error:{code:"permission",retryable:false,recovery:"重新选择有权限的账号组"},continuation:null}}}]}];
    const {container}=renderDialog();
    expect(screen.getByText("账号权限已变更")).toBeVisible();
    expect(screen.getByText("重新选择有权限的账号组")).toBeVisible();
    expect(container.querySelector('[data-slot="chat-project-list-card"]')).toBeNull();
    expect(screen.queryByText(/共 0 条/)).toBeNull();
  });
  it("renders the dialog inside the single shared AppShell with one sidebar and one top-header", () => {
    renderDialog();
    expect(screen.getAllByTestId("app-shell")).toHaveLength(1);
    expect(screen.getAllByTestId("app-sidebar")).toHaveLength(1);
    expect(screen.getAllByTestId("app-top-header")).toHaveLength(1);
  });

  it("renders the dialog with role=dialog and aria-modal=true and is centered (not a right-side drawer)", () => {
    renderDialog();
    const panel = screen.getByRole("dialog");
    expect(panel).toHaveAttribute("aria-modal", "true");
    const layer = panel.closest('[data-slot="overlay-layer"]');
    expect(layer).not.toBeNull();
    expect(layer!.className).toContain("items-center");
    expect(layer!.className).toContain("justify-center");
    expect(layer!.className).not.toContain("justify-end");
  });

  it("renders the page-specs §16 component tree in order", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");

    // PromptComposer
    expect(slot(dialog, "prompt-composer")).not.toBeNull();
    expect(slot(dialog, "prompt-input")).not.toBeNull();
    expect(slot(dialog, "suggested-action-chips")).not.toBeNull();
    expect(slot(dialog, "submit-button")).not.toBeNull();

    // [T-354] 次区(CopilotDashboard 三卡:推荐指令/最近任务/继续任务 + 快捷入口/智能推荐)
    // 已整体下架(用户真机反馈冗余)—— 对话 + 快捷 chip 已覆盖;任务进度走对话区顶部通知卡。
    expect(slot(dialog, "copilot-dashboard")).toBeNull();
    expect(slot(dialog, "recommended-commands")).toBeNull();
    expect(slot(dialog, "recent-tasks")).toBeNull();
    expect(slot(dialog, "continuing-tasks")).toBeNull();
    expect(slot(dialog, "quick-entries")).toBeNull();
    expect(slot(dialog, "smart-recommendation")).toBeNull();
  });

  it("exposes the prompt region only ([T-354] secondary regions removed)", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");

    expect(
      Array.from(
        dialog.querySelectorAll('[data-slot-region="copilot-region"]'),
      ).map((node) => node.getAttribute("data-region")),
    ).toEqual(["prompt"]);
  });

  it("renders the reference fixture counts", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");
    // [T-836] 原 5 个真入口旁增加按当前稿语义生成图片/视频素材两个入口。
    // [T-354] 次区计数断言随次区下架删除(recommended-command/recent-task/continuing-task/
    // quick-entry/smart-recommendation 均不再渲染)。
    expect(
      dialog.querySelectorAll('[data-slot="suggested-chip"]'),
    ).toHaveLength(7);
    expect(
      dialog.querySelectorAll('[data-slot="recommended-command"]'),
    ).toHaveLength(0);
    expect(dialog.querySelectorAll('[data-slot="recent-task"]')).toHaveLength(
      0,
    );
    expect(
      dialog.querySelectorAll('[data-slot="continuing-task"]'),
    ).toHaveLength(0);
    expect(slot(dialog, "recent-tasks-loading")).toBeNull();
    expect(slot(dialog, "continuing-tasks-loading")).toBeNull();
    expect(dialog.querySelectorAll('[data-slot="quick-entry"]')).toHaveLength(
      0,
    );
    expect(
      dialog.querySelectorAll('[data-slot="smart-recommendation-item"]'),
    ).toHaveLength(0);
  });

  it("生成封面入口绑定专用封面工具，并要求自动选择最新且最关联的已发布作品", () => {
    const viewModel = buildCopilotViewModel();
    const cover = viewModel.chips.find((chip) => chip.id === "cover");

    expect(cover?.functionKey).toBe("cover.generate");
    expect(cover?.prefill).toContain("最新且最关联");
    expect(cover?.prefill).toContain("直接生成");
  });

  it("图片按稿件需要生成多段候选，视频默认只生成一个候选", () => {
    const viewModel = buildCopilotViewModel();
    const image = viewModel.chips.find(
      (chip) => chip.id === "generate-image-material",
    );
    const video = viewModel.chips.find(
      (chip) => chip.id === "generate-video-material",
    );

    expect(image).toMatchObject({
      label: "生成图片素材",
      functionKey: "material.generate.image",
    });
    expect(video).toMatchObject({
      label: "生成视频素材",
      functionKey: "material.generate.video",
    });
    expect(image?.prefill).toContain("先读取当前确认稿");
    expect(video?.prefill).toContain("先读取当前确认稿");
    expect(image?.prefill).toContain("根据稿件篇幅");
    expect(image?.prefill).toContain("选择多个");
    expect(image?.prefill).toContain("每个段落各生成一张");
    expect(image?.prefill).not.toContain("唯一服务段落");
    expect(video?.prefill).toContain("默认只生成一个");
    expect(video?.prefill).toContain("控制生成成本");
    expect(video?.prefill).toContain("除非我明确要求");
    expect(image?.prefill).not.toContain("context.artifact.text");
    expect(video?.prefill).not.toContain("material.generate");
    expect(video?.prefill).toContain("连续短镜头");
  });

  it("renders the close button with data-overlay-close so the controller's delegated click handler closes the dialog", () => {
    renderDialog();
    const closeButton = document.querySelector(
      '[data-slot="ai-copilot-close"]',
    );
    expect(closeButton).not.toBeNull();
    expect(closeButton).toHaveAttribute("data-overlay-close");
    expect(closeButton).toHaveAttribute("aria-label", "关闭 AI 助手");
  });

  it("does NOT render a message thread UI", () => {
    renderDialog();
    expect(document.querySelector('[data-slot="message-thread"]')).toBeNull();
    expect(screen.queryByRole("log")).toBeNull();
  });

  it("does NOT post a real network request: the submit button is type=submit and is inside a form with no action", () => {
    renderDialog();
    const submit = document.querySelector(
      '[data-slot="submit-button"]',
    ) as HTMLElement;
    expect(submit).not.toBeNull();
    expect(submit).toHaveAttribute("type", "submit");
    const form = submit.closest("form");
    expect(form).not.toBeNull();
    expect(form!.getAttribute("action")).toBeNull();
    // The textarea has no fetch consumer.
    const textarea = document.querySelector(
      '[data-slot="prompt-input"]',
    ) as HTMLElement;
    expect(textarea.tagName.toLowerCase()).toBe("textarea");
  });
});

describe("T-1070 actual composer component / SDK boundary", () => {
  const target: any = {
    schemaVersion: 1,
    projectId: "protocol-project",
    outputId: "actual-article",
    owner: "wechat_article",
    contentType: "article",
    savedBase: {
      kind: "artifact",
      artifactId: "actual-artifact",
      versionId: "saved-base",
    },
    documentDigest: "sha256:" + "a".repeat(64),
    selection: { kind: "article_sections", sectionIds: ["actual-section"] },
  };
  const viewModel: any = {
    scenario: "default",
    kind: "ai-copilot",
    loading: false,
    error: null,
    prompt: "",
    chips: [],
    recommendedCommands: [],
    recentTasks: [],
    continuingTasks: [],
    quickEntries: [],
    smartRecommendations: [],
  };
  const embed = {
    surface: "project" as const,
    selection: { kind: "project", id: "protocol-project", title: "实际项目" },
    persistKey: "project:protocol-project",
    title: "编导对话",
  };
  let prepare: Mock<() => Promise<any>>;
  function Port() {
    const coordinator = useDraftChatRequest();
    React.useEffect(
      () =>
        coordinator.registerEditor({
          readState: () => ({ target, generation: 1, dirty: false }),
          prepareForTurn: () => prepare(),
          previewCandidate: async () => null,
          adoptCandidate: async () => ({ status: "adopted" }),
        } as DraftEditorPort),
      [coordinator.registerEditor],
    );
    return null;
  }
  function Composer({ request, projectId, showChat=true }: { request?: any; projectId?: string; showChat?:boolean }) {
    return (
      <DraftChatRequestProvider>
        <Port />
        {showChat?<AICopilotContent viewModel={viewModel} embed={{ ...embed, ...(projectId ? { selection: { kind: "project", id: projectId, title: "当前项目" }, persistKey: `project:${projectId}` } : {}), request }} />:null}
      </DraftChatRequestProvider>
    );
  }
  function NoEditorComposer({ request }: { request?: any }) {
    return <DraftChatRequestProvider><AICopilotContent viewModel={viewModel} embed={{ ...embed, request }} /></DraftChatRequestProvider>;
  }
  beforeEach(() => {
    prepare = vi.fn(async () => structuredClone(target));
  });
  it.each(["http_400: invalid tool_choice","模型服务拒绝了请求：invalid tool_choice，请检查模型名称、接口格式和工具参数。"])("供应商原因保留在错误卡，重复渲染不触发Console Error或自动重发：%s",raw=>{
    protocol.error=Error(raw);
    const errors=vi.spyOn(console,"error").mockImplementation(()=>{});
    const view=render(<NoEditorComposer/>);
    expect(screen.getByText(/模型服务拒绝了请求：invalid tool_choice/)).toBeInTheDocument();
    view.rerender(<NoEditorComposer/>);
    expect(errors).not.toHaveBeenCalled();expect(protocol.send).not.toHaveBeenCalled();expect(protocol.regenerate).not.toHaveBeenCalled();
    errors.mockRestore();
  });
  let ticketCoordinator: ReturnType<typeof useDraftChatRequest>;
  let ticketSelection: any;
  function TicketPort() {
    const coordinator=useDraftChatRequest();ticketCoordinator=coordinator;
    React.useEffect(()=>coordinator.registerEditor({
      readState:()=>({target:{...target,selection:ticketSelection},outputId:target.outputId,generation:1,dirty:false,preparation:{scopeKey:`group:${localStorage.getItem("creatoros:current-group")}`,projectId:target.projectId,outputId:target.outputId,owner:target.owner,versionId:target.savedBase.versionId,documentFingerprint:"exact-document",selection:ticketSelection}}),
      prepareForTurn:()=>prepare(),previewCandidate:async()=>null,adoptCandidate:async()=>({status:"adopted"}),
    }),[coordinator.registerEditor]);
    return null;
  }
  function TicketRail({showChat}:{showChat:boolean}) {const chat=useDraftChatRequest();return showChat?<AICopilotContent viewModel={viewModel} embed={{...embed,request:chat.request}}/>:null;}
  function TicketComposer({showChat=true}:{showChat?:boolean}) {return <DraftChatRequestProvider><TicketPort/><TicketRail showChat={showChat}/></DraftChatRequestProvider>;}
  it("T1300 真实Provider prepared ticket首次挂载StrictMode自动发送只准备一次且不进wire",async()=>{
    ticketSelection=structuredClone(target.selection);
    const view=render(<React.StrictMode><TicketComposer showChat={false}/></React.StrictMode>);
    let ticket:any;await act(async()=>{ticket=await ticketCoordinator.prepareEditorRequest("group:fixture-valid-empty-group");});
    act(()=>ticketCoordinator.openChat({prefill:"重组原文章",autoSend:true,preparedEditorTurn:ticket}));
    view.rerender(<React.StrictMode><TicketComposer/></React.StrictMode>);
    await waitFor(()=>expect(protocol.send).toHaveBeenCalledOnce());expect(prepare).toHaveBeenCalledOnce();expect(protocol.send.mock.calls[0][1].body.chatContext.editorTarget).toEqual(target);
    expect(JSON.stringify(protocol.send.mock.calls[0])).not.toContain("preparedEditorTurn");expect(Object.values(sessionStorage).join("")).not.toContain("preparedEditorTurn");
  });
  it.each(["unmount","replace","scope"])("T1300 prepared消费者失效重读期间%s不发送旧指令",async mode=>{
    ticketSelection=structuredClone(target.selection);const view=render(<React.StrictMode><TicketComposer showChat={false}/></React.StrictMode>);
    let ticket:any;await act(async()=>{ticket=await ticketCoordinator.prepareEditorRequest("group:fixture-valid-empty-group");});act(()=>ticketCoordinator.openChat({prefill:"原组原作品指令",autoSend:true,preparedEditorTurn:ticket}));
    if(mode==="scope"){
      const {writeCurrentGroupId}=await import("@/lib/http-transport");await act(async()=>writeCurrentGroupId("fixture-ticket-other-group"));view.rerender(<React.StrictMode><TicketComposer/></React.StrictMode>);await screen.findByText("稿件尚未准备好");expect(prepare).toHaveBeenCalledOnce();expect(protocol.send).not.toHaveBeenCalled();await userEvent.setup().click(screen.getByRole("button",{name:"继续本轮"}));await screen.findByText("稿件尚未准备好");expect(protocol.send).not.toHaveBeenCalled();expect(prepare).toHaveBeenCalledOnce();return;
    }
    ticketSelection={kind:"article",sectionIds:[]};let finish!:(value:any)=>void;prepare.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));view.rerender(<React.StrictMode><TicketComposer/></React.StrictMode>);await waitFor(()=>expect(prepare).toHaveBeenCalledTimes(2));
    if(mode==="unmount")view.unmount();else act(()=>ticketCoordinator.openChat({prefill:"新的明确指令",autoSend:false}));
    await act(async()=>finish(structuredClone(target)));expect(protocol.send).not.toHaveBeenCalled();
    if(mode==="replace")expect(screen.getByLabelText("我能帮你做什么")).toHaveValue("新的明确指令");
  });
  it("T1300 ticket消费后同归属明确prepare失败可恢复，仍复验原身份不借用已消费缓存",async()=>{
    ticketSelection=structuredClone(target.selection);const view=render(<TicketComposer showChat={false}/>);let ticket:any;await act(async()=>{ticket=await ticketCoordinator.prepareEditorRequest("group:fixture-valid-empty-group");});act(()=>ticketCoordinator.openChat({prefill:"本稿重组原话",autoSend:true,preparedEditorTurn:ticket}));ticketSelection={kind:"article",sectionIds:[]};prepare.mockRejectedValueOnce(Error("原保存未知"));view.rerender(<TicketComposer/>);await screen.findByText("稿件尚未准备好");expect(protocol.send).not.toHaveBeenCalled();await userEvent.setup().click(screen.getByRole("button",{name:"继续本轮"}));await waitFor(()=>expect(protocol.send).toHaveBeenCalledOnce());expect(prepare).toHaveBeenCalledTimes(3);expect(protocol.send.mock.calls[0][0]).toEqual({text:"本稿重组原话"});
  });
  it.each(["button", "modified-enter"])(
    "原发送入口%s等待strict prepare，再发送当次 frozen target",
    async (mode) => {
      let resolve!: (value: any) => void;
      prepare.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      render(<Composer />);
      const user = userEvent.setup();
      await user.type(screen.getByLabelText("我能帮你做什么"), "缩短所选段落");
      if (mode === "button")
        await user.click(screen.getByLabelText("提交提示给 Copilot"));
      else await user.keyboard("{Meta>}{Enter}{/Meta}");
      expect(prepare).toHaveBeenCalledOnce();
      expect(protocol.send).not.toHaveBeenCalled();
      await act(async () => resolve(structuredClone(target)));
      await waitFor(() => expect(protocol.send).toHaveBeenCalledOnce());
      expect(protocol.send.mock.calls[0]).toEqual([
        { text: "缩短所选段落" },
        {
          body: {
            attachmentIds: [],
            executionEngine: "pi",
            chatContext: expect.objectContaining({
              scope: "project:protocol-project",
              editorTarget: target,
            }),
          },
        },
      ]);
    },
  );
  it.each([false,true])("T1298 初挂StrictMode自动发送：真实卸载=%s", async (unmount) => {
    let release!:()=>void;prepare.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve(structuredClone(target));}));
    const view=render(<React.StrictMode><Composer showChat={false}/></React.StrictMode>);
    view.rerender(<React.StrictMode><Composer request={{nonce:1,prefill:"重组当前图文",autoSend:true}}/></React.StrictMode>);
    await waitFor(()=>expect(prepare).toHaveBeenCalledOnce());
    expect(protocol.send).not.toHaveBeenCalled();if(unmount)view.unmount();
    await act(async()=>release());
    expect(protocol.send).toHaveBeenCalledTimes(unmount?0:1);
  });
  it("autoSend也等strict prepare；保存UNKNOWN不调用SDK，保留原请求", async () => {
    prepare.mockRejectedValueOnce(Error("原保存未知，不可用旧稿发送"));
    render(
      <Composer request={{ nonce: 1, prefill: "修改开头", autoSend: true }} />,
    );
    await waitFor(() => expect(prepare).toHaveBeenCalledOnce());
    await screen.findByText("稿件尚未准备好");
    expect(protocol.send).not.toHaveBeenCalled();
    expect(screen.queryByText("自动恢复中")).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "继续本轮" }));
    await waitFor(() => expect(protocol.send).toHaveBeenCalledOnce());
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(protocol.send.mock.calls[0]).toEqual([{ text: "修改开头" }, { body: { attachmentIds: [], executionEngine: "pi", chatContext: expect.objectContaining({ editorTarget: target }) } }]);
  });
  it("UNKNOWN无服务器sourceID只读原会话，不regenerate、不重新prepare", async () => {
    const view = render(<Composer />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("我能帮你做什么"), "精简这一段");
    await user.click(screen.getByLabelText("提交提示给 Copilot"));
    await waitFor(() => expect(protocol.send).toHaveBeenCalledOnce());
    protocol.fetch.mockRejectedValueOnce(Error("network response unknown"));
    await act(async()=>{await expect(protocol.live.transport.fetch("/api/chat",{method:"POST"})).rejects.toThrow("network response unknown");});
    protocol.messages = [
      {
        id: "sdk-local-source",
        role: "user",
        parts: [{ type: "text", text: "精简这一段" }],
      },
    ];
    protocol.live.conversationId = "original-conversation";
    protocol.error = Error("stream response unknown");
    view.rerender(<Composer />);
    await waitFor(() =>
      expect(protocol.listMessages).toHaveBeenCalledWith({
        params: { conversationId: "original-conversation" },
        query: undefined,
        body: undefined,
      }),
      { timeout: 120_000 },
    );
    await screen.findByText("原请求结果待确认");
    expect(screen.queryByText("自动恢复中")).toBeNull();
    // The first automatic read returned no source. The empty readback still has
    // an explicit read-only action, without guessing a user message ID.
    protocol.messages = [];
    view.rerender(<Composer />);
    const readsBefore = protocol.listMessages.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "核对原请求" }));
    await waitFor(() => expect(protocol.listMessages).toHaveBeenCalledTimes(readsBefore + 1));
    expect(protocol.regenerate).not.toHaveBeenCalled();
    expect(prepare).toHaveBeenCalledOnce();
  });
  it("响应header存服务器sourceID，重试原messageID与完整frozenbody，不读取变更后的稿", async () => {
    const view = render(<Composer />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("我能帮你做什么"), "微调标题");
    await user.click(screen.getByLabelText("提交提示给 Copilot"));
    await waitFor(() => expect(protocol.send).toHaveBeenCalledOnce());
    const frozen = protocol.send.mock.calls[0][1].body.chatContext;
    protocol.fetch.mockResolvedValueOnce(
      new Response("", {
        headers: {
          "x-source-message-id": "server-source-real",
          "x-conversation-id": "original-conversation",
        },
      }),
    );
    await act(async () => {
      await protocol.live.transport.fetch("/api/chat", { method: "POST" });
    });
    prepare.mockResolvedValue({
      ...target,
      savedBase: { ...target.savedBase, versionId: "later-base" },
    });
    protocol.messages = [
      {
        id: "sdk-local-source",
        role: "user",
        parts: [{ type: "text", text: "微调标题" }],
      },
    ];
    protocol.error = Error("original stream interrupted");
    protocol.listMessages.mockResolvedValue([{id:"server-source-real",role:"user",content:"微调标题",attachments:[]}] as any);
    view.rerender(<Composer />);
    await waitFor(()=>expect(protocol.regenerate).toHaveBeenCalledWith({
      messageId: "server-source-real",
      body: { chatContext: frozen, executionEngine: "pi",conversationId:"original-conversation",attachmentIds:[] },
    }), { timeout: 120_000 });
    expect(protocol.regenerate).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledOnce();
    const stored = Array.from({ length: sessionStorage.length }, (_, index) =>
      sessionStorage.key(index),
    )
      .filter((key) => key?.startsWith("creatoros:t1070:turn:"))
      .map((key) => JSON.parse(sessionStorage.getItem(key!)!));
    expect(stored[0]).toMatchObject({
      sourceMessageId: "server-source-real",
      conversationId: "original-conversation",
      chatContext: frozen,
    });
  });
  it("新回合严格准备明确失败时重试当前原话，不重接上一回合server source",async()=>{
    const view=render(<Composer/>),user=userEvent.setup();
    await user.type(screen.getByLabelText("我能帮你做什么"),"上一回合");await user.click(screen.getByLabelText("提交提示给 Copilot"));
    await waitFor(()=>expect(protocol.send).toHaveBeenCalledOnce());
    protocol.fetch.mockResolvedValueOnce(new Response("",{headers:{"x-source-message-id":"older-server-source","x-conversation-id":"original-conversation"}}));
    await act(async()=>{await protocol.live.transport.fetch("/api/chat",{method:"POST"});});
    protocol.messages=[{id:"older-local-user",role:"user",parts:[{type:"text",text:"上一回合"}]}];
    protocol.error=Error("original stream interrupted");
    protocol.listMessages.mockResolvedValue([{id:"older-server-source",role:"user",content:"上一回合",attachments:[]}] as any);
    view.rerender(<Composer/>);
    prepare.mockRejectedValueOnce(Error("这次原保存尚未完成"));
    await user.type(screen.getByLabelText("我能帮你做什么"),"这次明确修改");await user.click(screen.getByLabelText("提交提示给 Copilot"));
    await screen.findByText("稿件尚未准备好");
    expect(screen.queryByText("自动恢复中")).toBeNull();
    expect(protocol.send).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button",{name:"继续本轮"}));
    await waitFor(()=>expect(prepare).toHaveBeenCalledTimes(3));
    expect(protocol.send).toHaveBeenLastCalledWith({text:"这次明确修改"},expect.anything());
    expect(protocol.regenerate).not.toHaveBeenCalled();
  });
  it("真实SDK从listMessages恢复server user ID后重接原任务，保原附件、会话、引擎与冻结稿", async () => {
    const {Chat}=await vi.importActual<{useChat:(options:any)=>any;Chat:new(options:any)=>any}>("@ai-sdk/react");
    protocol.actualSdk=true;
    // Only the upload boundary is supplied: this test uses the actual Chat/useChat
    // and DefaultChatTransport for both submissions, without mocking regenerate.
    protocol.attachmentIds=["uploaded-original-asset"];
    const live:any={control:{fetch:(...args:unknown[])=>protocol.fetch(...args),cancel:async()=>{},currentTaskId:()=>null},conversationId:null,epoch:0,executionEngine:"pi",sourceEngines:new Map(),transport:null};
    live.chat=new Chat({id:"actual-protocol-chat",transport:{sendMessages:(options:any)=>live.transport.sendMessages(options),reconnectToStream:async()=>null}});
    protocol.live=live;
    protocol.fetch.mockResolvedValueOnce(new Response("原流响应未知",{status:503,headers:{"x-source-message-id":"server-source-real","x-conversation-id":"original-conversation"}}));
    protocol.listMessages.mockResolvedValue([{id:"server-source-real",role:"user",content:"微调标题",parts:[{type:"text",text:"微调标题"}],attachments:["uploaded-original-asset"]}] as any);
    const view=render(<Composer />);
    const user=userEvent.setup();
    await user.type(screen.getByLabelText("我能帮你做什么"),"微调标题");
    await user.click(screen.getByLabelText("提交提示给 Copilot"));
    await waitFor(()=>expect(live.chat.status).toBe("error"));
    expect(live.chat.messages[0].id).not.toBe("server-source-real");
    const original=JSON.parse(protocol.fetch.mock.calls[0][1].body);
    protocol.fetch.mockResolvedValueOnce(new Response('data: {"type":"start","messageId":"restored-assistant"}\n\ndata: {"type":"finish","finishReason":"stop"}\n\ndata: [DONE]\n\n',{headers:{"content-type":"text/event-stream","x-vercel-ai-ui-message-stream":"v1"}}));
    protocol.engine="codex";
    view.rerender(<Composer />);
    prepare.mockResolvedValue({...target,savedBase:{...target.savedBase,versionId:"later-base"}});
    await waitFor(()=>expect(protocol.fetch).toHaveBeenCalledTimes(2), { timeout: 120_000 });
    const retry=JSON.parse(protocol.fetch.mock.calls[1][1].body);
    expect(retry).toMatchObject({trigger:"regenerate-message",messageId:"server-source-real",conversationId:"original-conversation",attachmentIds:["uploaded-original-asset"],executionEngine:"pi",chatContext:original.chatContext});
    expect(retry.messages.at(-1)).toMatchObject({id:"server-source-real",role:"user",parts:[{type:"text",text:"微调标题"}]});
    expect(prepare).toHaveBeenCalledOnce();
    await waitFor(()=>expect(live.chat.status).toBe("ready"));
  });
  it("真实SDK联合创作在引擎不可用时明确零提交，可显式恢复同target；fetch开始后失败保持UNKNOWN",async()=>{
    const {Chat}=await vi.importActual<{useChat:(options:any)=>any;Chat:new(options:any)=>any}>("@ai-sdk/react");
    protocol.actualSdk=true;protocol.engineAvailable=false;
    const live:any={control:{fetch:(...args:unknown[])=>protocol.fetch(...args),cancel:async()=>{},currentTaskId:()=>null},conversationId:null,epoch:0,executionEngine:"pi",sourceEngines:new Map(),transport:null};
    live.chat=new Chat({id:"actual-creation-chat",transport:{sendMessages:(options:any)=>live.transport.sendMessages(options),reconnectToStream:async()=>null}});protocol.live=live;
    const creationTarget={clientRequestId:"original-pair",projectId:"protocol-project",scriptSourceRef:{kind:"project_script",id:"script",versionId:"frozen-script-v"}};
    const onCreationSubmission=vi.fn(),request={nonce:1,prefill:"生成原文章图文候选",creationTarget,autoSend:true,onCreationSubmission};
    const view=render(<Composer request={request}/>);
    await screen.findByText("编导引擎尚未就绪");
    expect(screen.getByRole("link", { name: "检查编导引擎" })).toHaveAttribute("href", "/settings?highlight=assistant-engine");
    expect(screen.getByRole("button", { name: "继续本轮" })).toBeDisabled();
    expect(screen.queryByText("自动恢复中")).toBeNull();
    expect(onCreationSubmission.mock.calls).toEqual([["not-submitted"]]);
    expect(protocol.fetch).not.toHaveBeenCalled();expect(live.chat.messages).toHaveLength(0);expect(prepare).not.toHaveBeenCalled();
    protocol.engineAvailable=true;
    protocol.fetch.mockResolvedValueOnce(new Response("原流未知",{status:503,headers:{"x-source-message-id":"original-creation-source","x-conversation-id":"original-creation-conversation"}}));
    view.rerender(<Composer request={request}/>);
    expect(protocol.fetch).not.toHaveBeenCalled();
    await userEvent.setup().click(await screen.findByRole("button",{name:"继续本轮"}));
    await waitFor(()=>expect(protocol.fetch).toHaveBeenCalledOnce());
    await waitFor(()=>expect(live.chat.status).toBe("error"));
    expect(onCreationSubmission.mock.calls).toEqual([["not-submitted"],["submitted-unknown"]]);
    expect(JSON.parse(protocol.fetch.mock.calls[0][1].body)).toMatchObject({chatContext:{creationTarget},executionEngine:"pi"});
    expect(prepare).not.toHaveBeenCalled();
  });
  it("真实SDK联合创作等待原Codex状态检查；同target就绪后只提交一次",async()=>{
    const {Chat}=await vi.importActual<{Chat:new(options:any)=>any}>("@ai-sdk/react");
    protocol.actualSdk=true;protocol.engine='codex';protocol.engineAvailable=false;protocol.engineChecking=true;
    const live:any={control:{fetch:(...args:unknown[])=>protocol.fetch(...args),cancel:async()=>{},currentTaskId:()=>null},conversationId:null,epoch:0,executionEngine:'codex',sourceEngines:new Map(),transport:null};
    live.chat=new Chat({id:'checking-original-creation',transport:{sendMessages:(options:any)=>live.transport.sendMessages(options),reconnectToStream:async()=>null}});protocol.live=live;
    const creationTarget={clientRequestId:'original-checking-pair',projectId:'protocol-project',scriptSourceRef:{kind:'project_script',id:'script',versionId:'confirmed-version'}};
    const onCreationSubmission=vi.fn(),request={nonce:1,prefill:'生成当前文章图文',creationTarget,autoSend:true,onCreationSubmission};
    const view=render(<Composer request={request}/>);
    await act(async()=>{await Promise.resolve();});
    expect(protocol.fetch).not.toHaveBeenCalled();expect(onCreationSubmission).not.toHaveBeenCalled();
    expect(screen.queryByText('当前编导引擎尚不可用，请到设置核对后恢复原请求。')).toBeNull();
    protocol.engineChecking=false;protocol.engineAvailable=true;
    protocol.fetch.mockResolvedValueOnce(new Response('data: {"type":"start","messageId":"checking-done"}\n\ndata: {"type":"finish","finishReason":"stop"}\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream','x-vercel-ai-ui-message-stream':'v1'}}));
    view.rerender(<Composer request={request}/>);
    await waitFor(()=>expect(protocol.fetch).toHaveBeenCalledOnce());
    expect(JSON.parse(protocol.fetch.mock.calls[0][1].body)).toMatchObject({chatContext:{creationTarget},executionEngine:'codex'});
    await waitFor(()=>expect(live.chat.status).toBe('ready'));
    view.rerender(<Composer request={request}/>);expect(protocol.fetch).toHaveBeenCalledOnce();expect(prepare).not.toHaveBeenCalled();
  });

  it("真实SDK准备拒绝后继续保原附件，不采用后来picker的新附件", async () => {
    const { Chat } = await vi.importActual<{ Chat: new (options: any) => any }>("@ai-sdk/react");
    protocol.actualSdk = true;
    protocol.attachmentIds = ["uploaded-original-asset"];
    const live: any = { control: { fetch: (...args: unknown[]) => protocol.fetch(...args), cancel: async () => {}, currentTaskId: () => null }, conversationId: null, epoch: 0, executionEngine: "pi", sourceEngines: new Map(), transport: null };
    live.chat = new Chat({ id: "attachment-preparation-chat", transport: { sendMessages: (options: any) => live.transport.sendMessages(options), reconnectToStream: async () => null } });
    protocol.live = live;
    prepare.mockRejectedValueOnce(Error("保存结果尚未确认"));
    render(<Composer />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("我能帮你做什么"), "按原附件修改这一段");
    await user.click(screen.getByLabelText("提交提示给 Copilot"));
    await screen.findByText("稿件尚未准备好");
    expect(protocol.fetch).not.toHaveBeenCalled();
    expect(live.chat.messages).toHaveLength(0);
    await act(async () => protocol.attachmentChanged!({ ids: ["uploaded-later-asset"], count: 1, uploading: false }));
    protocol.fetch.mockResolvedValueOnce(new Response('data: {"type":"start","messageId":"attachment-done"}\n\ndata: {"type":"finish","finishReason":"stop"}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" } }));
    await user.click(screen.getByRole("button", { name: "继续本轮" }));
    await waitFor(() => expect(protocol.fetch).toHaveBeenCalledOnce());
    const body = JSON.parse(protocol.fetch.mock.calls[0][1].body);
    expect(body.attachmentIds).toEqual(["uploaded-original-asset"]);
    expect(body.messages.at(-1)).toMatchObject({ role: "user", parts: [{ type: "text", text: "按原附件修改这一段" }] });
    expect(body.chatContext.editorTarget).toEqual(target);
    expect(prepare).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(live.chat.status).toBe("ready"));
  });

  it.each(["scope", "group", "new-conversation"])("准备失败后切换%s，旧原请求没有继续入口或提交", async (change) => {
    protocol.keyedSessions = true;
    prepare.mockRejectedValueOnce(Error("旧请求保存尚未完成"));
    const view = render(<Composer />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("我能帮你做什么"), "旧原请求");
    await user.click(screen.getByLabelText("提交提示给 Copilot"));
    await screen.findByText("稿件尚未准备好");
    const oldSession = protocol.live;
    if (change === "scope") view.rerender(<Composer projectId="different-project" />);
    else if (change === "group") {
      const { writeCurrentGroupId } = await import("@/lib/http-transport");
      await act(async () => writeCurrentGroupId("different-neutral-group"));
    } else await user.click(screen.getByRole("button", { name: "新对话" }));
    expect(screen.queryByRole("button", { name: "继续本轮" })).toBeNull();
    expect(screen.queryByText("稿件尚未准备好")).toBeNull();
    expect(protocol.send).not.toHaveBeenCalled();
    expect(protocol.regenerate).not.toHaveBeenCalled();
    if (change === "new-conversation") expect(oldSession.epoch).toBe(1);
    else expect(protocol.live).not.toBe(oldSession);
  });

  it.each(["scope", "group", "new-conversation"])("延迟prepare完成前切换%s，不提交旧原话或覆盖新输入", async (change) => {
    protocol.keyedSessions = true;
    let resolve!: (value: any) => void;
    prepare.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const view = render(<Composer />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("我能帮你做什么"), "迟到的旧原话");
    await user.click(screen.getByLabelText("提交提示给 Copilot"));
    expect(prepare).toHaveBeenCalledOnce();
    if (change === "scope") view.rerender(<Composer projectId="different-project" />);
    else if (change === "group") {
      const { writeCurrentGroupId } = await import("@/lib/http-transport");
      await act(async () => writeCurrentGroupId("different-neutral-group"));
    } else await user.click(screen.getByRole("button", { name: "新对话" }));
    await user.type(screen.getByLabelText("我能帮你做什么"), "现在的新输入");
    await act(async () => resolve(structuredClone(target)));
    expect(protocol.send).not.toHaveBeenCalled();
    expect(protocol.regenerate).not.toHaveBeenCalled();
    expect(screen.getByLabelText("我能帮你做什么")).toHaveValue("现在的新输入");
    expect(screen.getByLabelText("提交提示给 Copilot")).toBeEnabled();
    expect(screen.queryByRole("button", { name: "继续本轮" })).toBeNull();
    expect(screen.queryByText("稿件尚未准备好")).toBeNull();
  });

  it("旧prepare迟到拒绝不覆盖新会话输入或错误，清理后新输入可以发送", async () => {
    let reject!: (cause: Error) => void;
    prepare.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    render(<Composer />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("我能帮你做什么"), "迟到的旧请求");
    await user.click(screen.getByLabelText("提交提示给 Copilot"));
    expect(prepare).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "新对话" }));
    await user.type(screen.getByLabelText("我能帮你做什么"), "新会话的输入");
    await act(async () => reject(Error("旧保存迟到拒绝")));
    expect(screen.getByLabelText("我能帮你做什么")).toHaveValue("新会话的输入");
    expect(screen.queryByText("稿件尚未准备好")).toBeNull();
    expect(screen.queryByRole("button", { name: "继续本轮" })).toBeNull();
    expect(protocol.send).not.toHaveBeenCalled();
    expect(protocol.regenerate).not.toHaveBeenCalled();
    expect(screen.getByLabelText("提交提示给 Copilot")).toBeEnabled();
    await user.click(screen.getByLabelText("提交提示给 Copilot"));
    await waitFor(() => expect(protocol.send).toHaveBeenCalledOnce());
    expect(protocol.send).toHaveBeenCalledWith({ text: "新会话的输入" }, expect.anything());
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it("无prepare失败标记的普通SDK断流仍恢复，不把捕获发送误判为新准备失败", async () => {
    vi.useFakeTimers();
    try {
      const view = render(<NoEditorComposer />);
      fireEvent.change(screen.getByLabelText("我能帮你做什么"), { target: { value: "普通原请求" } });
      fireEvent.click(screen.getByLabelText("提交提示给 Copilot"));
      await act(async () => { await Promise.resolve(); });
      expect(protocol.send).toHaveBeenCalledOnce();
      expect(prepare).not.toHaveBeenCalled();
      // This SDK capture deliberately does not fake transport.fetch. No trusted
      // preflight failure occurred; the original SDK recovery remains valid.
      protocol.messages = [{ id: "sdk-source", role: "user", parts: [{ type: "text", text: "普通原请求" }] }];
      protocol.error = Error("original stream interrupted");
      view.rerender(<NoEditorComposer />);
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
      expect(protocol.regenerate).toHaveBeenCalledOnce();
      expect(protocol.send).toHaveBeenCalledOnce();
      expect(prepare).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("真实SDK无编辑器的引擎明确失败也可继续同原话，一次提交", async () => {
    const { Chat } = await vi.importActual<{ Chat: new (options: any) => any }>("@ai-sdk/react");
    protocol.actualSdk = true;
    protocol.engineAvailable = false;
    const live: any = { control: { fetch: (...args: unknown[]) => protocol.fetch(...args), cancel: async () => {}, currentTaskId: () => null }, conversationId: null, epoch: 0, executionEngine: "pi", sourceEngines: new Map(), transport: null };
    live.chat = new Chat({ id: "non-editor-engine-chat", transport: { sendMessages: (options: any) => live.transport.sendMessages(options), reconnectToStream: async () => null } });
    protocol.live = live;
    const request = { nonce: 1, prefill: "继续讨论原主题", autoSend: true };
    const view = render(<NoEditorComposer request={request} />);
    await screen.findByText("编导引擎尚未就绪");
    expect(protocol.fetch).not.toHaveBeenCalled();
    expect(live.chat.messages).toHaveLength(0);
    protocol.engineAvailable = true;
    protocol.fetch.mockResolvedValueOnce(new Response('data: {"type":"start","messageId":"non-editor-done"}\n\ndata: {"type":"finish","finishReason":"stop"}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" } }));
    view.rerender(<NoEditorComposer request={request} />);
    expect(protocol.fetch).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole("button", { name: "继续本轮" }));
    await waitFor(() => expect(protocol.fetch).toHaveBeenCalledOnce());
    expect(JSON.parse(protocol.fetch.mock.calls[0][1].body).messages.at(-1)).toMatchObject({ role: "user", parts: [{ type: "text", text: "继续讨论原主题" }] });
    expect(prepare).not.toHaveBeenCalled();
    await waitFor(() => expect(live.chat.status).toBe("ready"));
  });

  it("已排队自动恢复遇到合法prepare，不调用恢复或消耗三次无进展预算", async () => {
    vi.useFakeTimers();
    try {
      protocol.messages = [{ id: "prior-source", role: "user", parts: [{ type: "text", text: "原回合" }] }];
      protocol.error = Error("original stream interrupted");
      let resolve!: (value: any) => void;
      prepare.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
      render(<Composer />);
      fireEvent.change(screen.getByLabelText("我能帮你做什么"), { target: { value: "正在准备的原请求" } });
      fireEvent.click(screen.getByLabelText("提交提示给 Copilot"));
      expect(prepare).toHaveBeenCalledOnce();
      await act(async () => { await vi.advanceTimersByTimeAsync(8_000); });
      expect(protocol.regenerate).not.toHaveBeenCalled();
      expect(protocol.listMessages).not.toHaveBeenCalled();
      expect(screen.queryByText("自动恢复暂未取得进展")).toBeNull();
      await act(async () => resolve(structuredClone(target)));
      expect(protocol.send).toHaveBeenCalledOnce();
      protocol.fetch.mockResolvedValueOnce(new Response("", { headers: { "x-source-message-id": "prepared-server-source", "x-conversation-id": "prepared-conversation" } }));
      protocol.listMessages.mockResolvedValue([{ id: "prepared-server-source", role: "user", content: "正在准备的原请求", attachments: [] }] as any);
      await act(async () => { await protocol.live.transport.fetch("/api/chat", { method: "POST" }); });
      await act(async () => { await vi.advanceTimersByTimeAsync(7_100); });
      expect(protocol.regenerate).toHaveBeenCalledTimes(3);
      expect(protocol.regenerate).toHaveBeenLastCalledWith({ messageId: "prepared-server-source", body: { chatContext: protocol.send.mock.calls[0][1].body.chatContext, conversationId: "prepared-conversation", attachmentIds: [], executionEngine: "pi" } });
      expect(screen.getByText("自动恢复暂未取得进展")).toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      expect(protocol.regenerate).toHaveBeenCalledTimes(3);
    } finally { vi.useRealTimers(); }
  });

  it("T1246 coreAdmission no-scope禁发且原草稿/附件留在公共composer",async()=>{
    localStorage.clear();
    render(<Composer/>);const user=userEvent.setup();
    await user.type(screen.getByLabelText("我能帮你做什么"),"未发送的原草稿");
    await act(async()=>protocol.attachmentChanged!({ids:["fixture-owned-upload"],count:1,uploading:false}));
    expect(screen.getByLabelText("提交提示给 Copilot")).toBeDisabled();
    expect(screen.getByLabelText("我能帮你做什么")).toHaveValue("未发送的原草稿");
    expect(protocol.send).not.toHaveBeenCalled();expect(protocol.regenerate).not.toHaveBeenCalled();expect(prepare).not.toHaveBeenCalled();
    expect(screen.getByRole("link",{name:"选择或创建账号组"})).toHaveAttribute("href","/accounts");
    const {writeCurrentGroupId}=await import("@/lib/http-transport");await act(async()=>writeCurrentGroupId("fixture-neutral-empty-group"));
    await user.click(screen.getByLabelText("提交提示给 Copilot"));
    await waitFor(()=>expect(protocol.send).toHaveBeenCalledOnce(),{timeout:120000});
    expect(protocol.send.mock.calls[0][1].body.attachmentIds).toEqual([]);
    expect(localStorage.getItem("creatoros:current-account")).toBeNull();
  });
  it.each(["empty-group","legacy-account"])("T1246 coreAdmission %s真实workspace准入不要求平台/模型配置",async(kind)=>{
    localStorage.clear();localStorage.setItem(kind==="empty-group"?"creatoros:current-group":"creatoros:current-account",kind==="empty-group"?"fixture-empty-group":"fixture-legacy-account");
    render(<Composer/>);const user=userEvent.setup();await user.type(screen.getByLabelText("我能帮你做什么"),"合法原请求");await user.click(screen.getByLabelText("提交提示给 Copilot"));await waitFor(()=>expect(protocol.send).toHaveBeenCalledOnce(),{timeout:120000});expect(prepare).toHaveBeenCalledOnce();
  });
  it("T1246 coreAdmission prepare期间同batch A-B-A不能提交旧owner",async()=>{
    let resolve!:(value:any)=>void;prepare.mockImplementationOnce(()=>new Promise(done=>resolve=done));
    const {writeCurrentGroupId}=await import("@/lib/http-transport");localStorage.setItem("creatoros:current-group","fixture-group-A");render(<Composer/>);const user=userEvent.setup();await user.type(screen.getByLabelText("我能帮你做什么"),"旧A原输入");await user.click(screen.getByLabelText("提交提示给 Copilot"));expect(prepare).toHaveBeenCalledOnce();
    await act(async()=>{writeCurrentGroupId("fixture-group-B");writeCurrentGroupId("fixture-group-A");});
    await act(async()=>resolve(structuredClone(target)));expect(protocol.send).not.toHaveBeenCalled();expect(protocol.regenerate).not.toHaveBeenCalled();expect(screen.getByLabelText("我能帮你做什么")).toHaveValue("旧A原输入");
  });
  it("T1246 coreAdmission accounts卸载回来原草稿不丢",async()=>{
    localStorage.clear();const view=render(<Composer/>);const user=userEvent.setup();await user.type(screen.getByLabelText("我能帮你做什么"),"去账号组之前的草稿");
    fireEvent.click(screen.getByRole("link",{name:"选择或创建账号组"}));
    view.unmount(); // 当前/accounts Link令Overlay(!open)return null的真实React卸载生命周期；不是实际浏览器路由通过。
    render(<Composer/>);expect(screen.getByLabelText("我能帮你做什么")).toHaveValue("去账号组之前的草稿");expect(protocol.send).not.toHaveBeenCalled();
  });


  it("T1246 coreAdmission accounts回来真实picker已上传附件标签/原ID保留且零重复上传",async()=>{
    localStorage.clear();const view=render(<Composer/>);const user=userEvent.setup();await user.type(screen.getByLabelText("我能帮你做什么"),"待选择组的原输入");
    fireEvent.drop(view.container.querySelector('[data-slot="copilot-attachment-picker"]')!,{dataTransfer:{files:[new File(["fixture上传的真实文件bytes"],"原文档.md",{type:"text/markdown",lastModified:1})]}});
    await waitFor(()=>expect(screen.getByText("已就绪")).toBeInTheDocument(),{timeout:120000});expect(protocol.upload).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("link",{name:"选择或创建账号组"}));view.unmount();const back=render(<Composer/>);
    expect(screen.getByLabelText("我能帮你做什么")).toHaveValue("待选择组的原输入");expect(screen.getByText("原文档.md")).toBeInTheDocument();expect(screen.getByText("已就绪")).toBeInTheDocument();expect(protocol.upload).toHaveBeenCalledOnce();
    const {writeCurrentGroupId}=await import("@/lib/http-transport");await act(async()=>writeCurrentGroupId("fixture-selected-neutral-empty-group"));expect(screen.getByText("请核对原工作区附件")).toBeInTheDocument();await user.click(screen.getByLabelText("提交提示给 Copilot"));await waitFor(()=>expect(protocol.send).toHaveBeenCalledOnce(),{timeout:120000});expect(protocol.send.mock.calls[0][1].body.attachmentIds).toEqual([]);expect(protocol.upload).toHaveBeenCalledOnce();
  });
  it("T1246 coreAdmission own exact500真实SDK任务未建立不auto-regenerate，输入保留",async()=>{
    const {Chat}=await vi.importActual<any>("@ai-sdk/react");protocol.actualSdk=true;
    const live:any={control:{fetch:(...args:any[])=>protocol.fetch(...args),cancel:async()=>{},currentTaskId:()=>null},conversationId:null,epoch:0,executionEngine:"pi",sourceEngines:new Map(),transport:null};live.chat=new Chat({id:"fixture-own500",transport:{sendMessages:(options:any)=>live.transport.sendMessages(options),reconnectToStream:async()=>null}});protocol.live=live;
    protocol.fetch.mockResolvedValueOnce(Response.json({error:"消息保存失败，请重试。"},{status:500}));render(<Composer/>);const user=userEvent.setup();await user.type(screen.getByLabelText("我能帮你做什么"),"没有建立任务的原话");await user.click(screen.getByLabelText("提交提示给 Copilot"));
    await waitFor(()=>expect(live.chat.status).toBe("error"),{timeout:120000});expect(screen.getByText("本轮尚未启动任务")).toBeInTheDocument();expect(screen.getByLabelText("我能帮你做什么")).toHaveValue("没有建立任务的原话");
    vi.useFakeTimers();try{await act(async()=>vi.advanceTimersByTimeAsync(9000));expect(protocol.fetch).toHaveBeenCalledOnce();expect(protocol.regenerate).not.toHaveBeenCalled();expect(screen.queryByText("自动恢复中")).toBeNull();expect(screen.queryByText("正在恢复原任务")).toBeNull();}finally{vi.useRealTimers();}
  });
  it.each(["generic500","transport-loss"])("T1246 coreAdmission %s保持未知，不伪尚未启动",async(kind)=>{
    const {Chat}=await vi.importActual<any>("@ai-sdk/react");protocol.actualSdk=true;const live:any={control:{fetch:(...args:any[])=>protocol.fetch(...args),cancel:async()=>{},currentTaskId:()=>null},conversationId:null,epoch:0,executionEngine:"pi",sourceEngines:new Map(),transport:null};live.chat=new Chat({id:"fixture-unknown",transport:{sendMessages:(options:any)=>live.transport.sendMessages(options),reconnectToStream:async()=>null}});protocol.live=live;
    if(kind==="generic500")protocol.fetch.mockResolvedValueOnce(Response.json({error:"未知装配错误"},{status:500}));else protocol.fetch.mockRejectedValueOnce(Error("fixture断网，可能已入场"));render(<Composer/>);const user=userEvent.setup();await user.type(screen.getByLabelText("我能帮你做什么"),"状态未确认的原话");await user.click(screen.getByLabelText("提交提示给 Copilot"));await waitFor(()=>expect(live.chat.status).toBe("error"),{timeout:120000});expect(screen.queryByText("本轮尚未启动任务")).toBeNull();expect(screen.getByText("正在恢复本轮生成")).toBeInTheDocument();expect(protocol.fetch).toHaveBeenCalledOnce();
  });

  it("T1246 draftBoundary 顶部workspace错误入口保留autoSend未发草稿",async()=>{
    localStorage.clear();const request={nonce:9001,prefill:"稿面按钮原autoSend草稿",autoSend:true};const view=render(<Composer request={request}/>);
    await waitFor(()=>expect(view.container.querySelector('[data-slot="copilot-error-workspace-link"]')).not.toBeNull(),{timeout:120000});
    fireEvent.click(view.container.querySelector('[data-slot="copilot-error-workspace-link"]')!);view.unmount();render(<Composer/>);
    expect(screen.getByLabelText("我能帮你做什么")).toHaveValue("稿面按钮原autoSend草稿");expect(protocol.send).not.toHaveBeenCalled();expect(protocol.regenerate).not.toHaveBeenCalled();expect(prepare).not.toHaveBeenCalled();
  });
  it("T1246 draftBoundary restored同File重选不碰撞localId或删除原ready附件",async()=>{
    const {CopilotAttachmentPicker}=await import("./copilot-attachment-picker");const ref=React.createRef<any>(),onState=vi.fn();const file=new File(["同一真实file bytes"],"同File.md",{type:"text/markdown",lastModified:123});
    protocol.upload.mockResolvedValue({assetId:"fixture-same-owned-asset",deduplicated:true});const first=render(<CopilotAttachmentPicker ref={ref} onStateChange={onState}/>);
    fireEvent.drop(first.container.querySelector('[data-slot="copilot-attachment-picker"]')!,{dataTransfer:{files:[file]}});await waitFor(()=>expect(onState).toHaveBeenLastCalledWith({ids:["fixture-same-owned-asset"],uploading:false,count:1}),{timeout:120000});const draft=ref.current.readDraft();first.unmount();
    const second=render(<CopilotAttachmentPicker initialDraft={draft} onStateChange={onState}/>);fireEvent.drop(second.container.querySelector('[data-slot="copilot-attachment-picker"]')!,{dataTransfer:{files:[file]}});
    await waitFor(()=>expect(protocol.upload).toHaveBeenCalledTimes(2),{timeout:120000});await act(async()=>{});
    expect(onState).toHaveBeenLastCalledWith({ids:["fixture-same-owned-asset"],uploading:false,count:1});expect(screen.getAllByText("同File.md")).toHaveLength(1);
    fireEvent.click(screen.getByLabelText("移除附件 同File.md"));expect(onState).toHaveBeenLastCalledWith({ids:[],uploading:false,count:0});
  });
  it("T1246 draftBoundary 原A附件切B不自动迁移或发送ID，不再上传",async()=>{
    const {CopilotAttachmentPicker}=await import("./copilot-attachment-picker");const {writeCurrentGroupId}=await import("@/lib/http-transport");localStorage.setItem("creatoros:current-group","fixture-origin-A");const ref=React.createRef<any>(),onState=vi.fn(),view=render(<CopilotAttachmentPicker ref={ref} onStateChange={onState}/>);fireEvent.drop(view.container.querySelector('[data-slot="copilot-attachment-picker"]')!,{dataTransfer:{files:[new File(["A文件"],"A原文件.md",{type:"text/markdown",lastModified:1})]}});await waitFor(()=>expect(onState).toHaveBeenLastCalledWith({ids:["fixture-existing-owned-upload"],uploading:false,count:1}),{timeout:120000});await act(async()=>writeCurrentGroupId("fixture-new-B"));expect(onState).toHaveBeenLastCalledWith({ids:[],uploading:false,count:1});expect(protocol.upload).toHaveBeenCalledOnce();expect(screen.getByText("A原文件.md")).toBeInTheDocument();expect(screen.getByText("请核对原工作区附件")).toBeInTheDocument();
  });

  it("T1246 draftBoundary 网络已提交后切owner不得把原输入移作未提交draft",async()=>{
    const {Chat}=await vi.importActual<any>("@ai-sdk/react");protocol.actualSdk=true;const live:any={control:{fetch:(...args:any[])=>protocol.fetch(...args),cancel:async()=>{},currentTaskId:()=>null},conversationId:null,epoch:0,executionEngine:"pi",sourceEngines:new Map(),transport:null};live.chat=new Chat({id:"fixture-no-task-transfer",transport:{sendMessages:(options:any)=>live.transport.sendMessages(options),reconnectToStream:async()=>null}});protocol.live=live;
    protocol.fetch.mockResolvedValueOnce(Response.json({error:"消息保存失败，请重试。"},{status:500}));const view=render(<Composer/>);const user=userEvent.setup();await user.type(screen.getByLabelText("我能帮你做什么"),"已交网络的旧owner原话");await user.click(screen.getByLabelText("提交提示给 Copilot"));await waitFor(()=>expect(live.chat.status).toBe("error"),{timeout:120000});
    const {writeCurrentGroupId}=await import("@/lib/http-transport");await act(async()=>writeCurrentGroupId(null));fireEvent.click(view.container.querySelector('[data-slot="copilot-workspace-required"] a')!);view.unmount();render(<Composer/>);
    expect(screen.getByLabelText("我能帮你做什么")).toHaveValue("");expect(protocol.fetch).toHaveBeenCalledOnce();
  });

});


describe("T1188 实际 Copilot 原 project.transcribe 工具回执入口", () => {
  function receipts(output: Record<string,unknown>) {
    protocol.messages=[{id:"assistant-receipt",role:"assistant",parts:[{type:"tool-project_transcribe",toolCallId:"call-original",state:"output-available",input:{},output}]}];
    localStorage.setItem("creatoros:current-group", "group-1");
    const requests: Array<{id:string;input:{params?:{taskId?:string}}}> = [];
    const TIME="2026-10-09T00:00:00.000Z";
    vi.stubGlobal("fetch", vi.fn(async (_url:RequestInfo|URL, init?:RequestInit) => {
      const request=JSON.parse(String(init?.body)) as (typeof requests)[number]; requests.push(request);
      const envelope=(data:unknown,list=false)=>Response.json({data,meta:{requestId:"t1188",...(list?{page:1,pageSize:100,total:Array.isArray(data)?data.length:0}:{})}});
      if(request.id==="settings.get")return envelope({id:"user-1",email:"synthetic@example.invalid",displayName:"测试创作者",timezone:"Asia/Shanghai",locale:"zh-CN",createdAt:TIME,updatedAt:TIME});
      if(request.id==="accountGroups.get")return envelope({id:"group-1",userId:"user-1",name:"本人组",status:"active",version:1,createdAt:TIME,updatedAt:TIME,members:[]});
      if(request.id==="ai.tasks.get")return envelope(ENDPOINTS.getTask.response.parse({id:"task-original",userId:"user-1",groupId:"group-1",projectId:null,contentOutputId:null,taskType:"transcribe.douyin",status:"succeeded",inputData:{awemeIds:["aweme-1"]},modelKey:"local",idempotencyKey:"paid-original",attemptId:"11111111-1111-4111-8111-111111111111",requestFingerprint:`sha256:${"a".repeat(64)}`,retryOfTaskId:null,requestedAt:TIME,startedAt:TIME,completedAt:TIME,errorMessage:null}));
      if(request.id==="ai.tasks.steps.list")return envelope([{stepNo:1,kind:"step",text:"原真实确认保存步骤",toolCalls:[],createdAt:TIME}],true);
      return envelope([],true);
    }));
    render(<AICopilotContent viewModel={buildCopilotViewModel()}/>);
    return requests;
  }
  it("真实 tool output taskId 接准确原 task 与 steps，零重发", async () => {
    const requests=receipts({kind:"project.transcribe",taskId:"task-original"});
    expect(document.querySelector('[data-slot="copilot-transcribe-status"]')).toHaveAttribute("data-ok","true");
    fireEvent.click(await screen.findByRole("button",{name:"查看转写进度"}));
    await screen.findByText("第 1 步：原真实确认保存步骤");
    expect(requests.filter(row=>row.id==="ai.tasks.get").every(row=>row.input.params?.taskId==="task-original")).toBe(true);
    expect(requests.some(row=>row.id==="projects.transcribe"||row.id==="execution.tasks.command")).toBe(false);
    expect(document.querySelector('[data-slot="copilot-dashboard"]')).toBeNull();
  });
  it("缺taskId保持未确认且无任务hook/POST", async () => {
    const requests=receipts({kind:"project.transcribe"});
    await waitFor(()=>expect(document.querySelector('[data-slot="copilot-transcribe-status"]')).toHaveAttribute("data-ok","unknown"));
    expect(screen.queryByRole("button",{name:"查看转写进度"})).toBeNull();
    expect(screen.getByText(/未取得准确任务编号/)).toBeVisible();
    expect(requests.some(row=>row.id==="ai.tasks.get"||row.id==="projects.transcribe")).toBe(false);
  });
  it("工具error即使带taskId不装成功进度或重发", () => {
    const requests=receipts({kind:"project.transcribe",taskId:"task-original",error:"原作品来源未确认"});
    const notice = document.querySelector('[data-slot="copilot-tool-outcome-notice"]');
    expect(notice).toBeVisible();
    expect(notice).toHaveTextContent("原作品来源未确认");
    expect(document.querySelector('[data-slot="copilot-transcribe-status"]')).toBeNull();
    expect(screen.queryByRole("button",{name:"查看转写进度"})).toBeNull();
    expect(requests.some(row=>row.id==="ai.tasks.get"||row.id==="ai.tasks.steps.list"||row.id==="projects.transcribe"||row.id==="execution.tasks.command"||row.id==="execution.tasks.transcribeCommand.v1")).toBe(false);
  });
});

it.each(['pi','codex'] as const)('BC003 实际封面chip预填按当前%s引擎免错误独立API门，引用资格不放松',async engine=>{
 protocol.engine=engine;renderDialog();fireEvent.click(screen.getByRole('button',{name:'生成封面'}));
 const input=document.querySelector('[data-slot="prompt-input"]') as HTMLTextAreaElement;
 expect(input.value).toContain('最新且最关联');
 if(engine==='codex'){expect(input.value).toContain('不需要独立文本或图片 API');expect(input.value).toContain('Codex');expect(input.value).not.toContain('已配置的模型');}
 else expect(input.value).toContain('Pi');
 expect(protocol.send).not.toHaveBeenCalled();
});


describe("T1302 当前真实宿主的精简输入区",()=>{
 const commonPlaceholder='描述目标，或输入 @ 引用项目';
 const embed={surface:'project',selection:{kind:'project',id:'current-project',title:'当前稿件'},persistKey:'project:current-project'};
 const state=(owner='wechat_article'):any=>({target:null,outputId:'current-output',generation:1,dirty:false,preparation:{scopeKey:'group:fixture-valid-empty-group',projectId:'current-project',outputId:'current-output',owner,versionId:'saved-version',documentFingerprint:'current-document',selection:{kind:'article_sections',sectionIds:[]}}});
 let coordinator:ReturnType<typeof useDraftChatRequest>;
 function Registry({value}:{value:any}){const chat=useDraftChatRequest();coordinator=chat;React.useEffect(()=>value?chat.registerEditor({readState:()=>value,prepareForTurn:async()=>undefined as any,previewCandidate:async()=>null,adoptCandidate:async()=>({status:'adopted'})}):undefined,[chat.registerEditor,value]);return null;}
 function Composer({value,host=embed}:{value:any;host?:any}){return <DraftChatRequestProvider><Registry value={value}/><AICopilotContent embed={host}/></DraftChatRequestProvider>;}
 it.each([['wechat_article','告诉我这篇文章需要怎么调整'],['graphic_post','告诉我这份图文需要怎么调整']])('T1302 匹配当前%s只隐藏内层chips，保输入附件发送清空和项目身份',async(owner,placeholder)=>{
  render(<Composer value={state(owner)}/>);await waitFor(()=>expect(document.querySelectorAll('[data-slot="suggested-chip"]')).toHaveLength(0));expect(screen.getByRole('textbox',{name:'我能帮你做什么'})).toHaveAttribute('placeholder',placeholder);expect(document.querySelector('[data-slot="suggested-action-chips"]')).not.toBeNull();expect(document.querySelector('[data-slot="copilot-attachment-picker"]')).not.toBeNull();expect(screen.getByRole('button',{name:'提交提示给 Copilot'})).toBeVisible();expect(screen.getByText('当前稿件',{exact:true})).toBeVisible();await userEvent.setup().type(screen.getByRole('textbox',{name:'我能帮你做什么'}),'保留自然输入');expect(screen.getByRole('button',{name:'清空输入'})).toBeVisible();await userEvent.setup().click(screen.getByRole('button',{name:'清空输入'}));expect(screen.getByRole('textbox',{name:'我能帮你做什么'})).toHaveValue('');
 });
 it.each(['global','no-preparation','no-editor','script','video','project','output','empty-output','scope','selection-kind'])('T1302 %s保持通用chips与placeholder，不借历史request猜宿主',async mode=>{
  let value=state(),host:any={...embed,request:{nonce:0,prefill:'旧文章指令',selection:{kind:'content_output',id:'current-output'}}};
  if(mode==='global')host=undefined;if(mode==='no-preparation')delete value.preparation;if(mode==='no-editor'||mode==='script')value=null;if(mode==='video')value.preparation.owner='production';if(mode==='project')value.preparation.projectId='other-project';if(mode==='output')value.outputId='other-output';if(mode==='empty-output')value.outputId='';if(mode==='scope')value.preparation.scopeKey='group:other-group';if(mode==='selection-kind')host.selection={kind:'content_output',id:'current-project'};
  // global显式不传embed，避免测试组件default值代替undefined。
  render(mode==='global'?<DraftChatRequestProvider><Registry value={value}/><AICopilotContent/></DraftChatRequestProvider>:<Composer value={value} host={host}/>);await waitFor(()=>expect(document.querySelectorAll('[data-slot="suggested-chip"]')).toHaveLength(7));expect(screen.getByRole('textbox',{name:'我能帮你做什么'})).toHaveAttribute('placeholder',commonPlaceholder);expect(protocol.send).not.toHaveBeenCalled();
 });
 it('T1302 registry注册/注销及当前scope切换立即重新判定，保停止控件',async()=>{
  const view=render(<Composer value={null}/>);expect(document.querySelectorAll('[data-slot="suggested-chip"]')).toHaveLength(7);const current=state();view.rerender(<Composer value={current}/>);await waitFor(()=>expect(document.querySelectorAll('[data-slot="suggested-chip"]')).toHaveLength(0));protocol.status='streaming';view.rerender(<Composer value={current}/>);expect(screen.getByRole('button',{name:'停止生成'})).toBeVisible();expect(document.querySelector('[data-slot="prompt-send-hint"]')).not.toBeNull();protocol.status='ready';const {writeCurrentGroupId}=await import('@/lib/http-transport');await act(async()=>writeCurrentGroupId('next-group'));await waitFor(()=>expect(document.querySelectorAll('[data-slot="suggested-chip"]')).toHaveLength(7));view.rerender(<Composer value={null}/>);expect(screen.getByRole('textbox',{name:'我能帮你做什么'})).toHaveAttribute('placeholder',commonPlaceholder);expect(coordinator.readEditorState()).toBeNull();
 });
});


describe("T1308 真实SDK历史意图归属",()=>{
 const project="history-project",scope="project:"+project;
 const vm:any={scenario:"default",kind:"ai-copilot",loading:false,error:null,prompt:"",chips:[],recommendedCommands:[],recentTasks:[],continuingTasks:[],quickEntries:[],smartRecommendations:[]};
 const histories=["A","B","C"].map(id=>({id:"history-"+id,title:"历史会话"+id,scope,createdAt:"2026-10-16T00:00:00.000Z"}));
 const rows=(id:string)=>[{id:"history-"+id+"-user",role:"user",content:"会话"+id+"的真实原话",inputTokens:1},{id:"history-"+id+"-assistant",role:"assistant",content:"会话"+id+"的回复",outputTokens:2}];
 function deferred<T=any>(){let resolve!:(value:T)=>void,reject!:(reason:unknown)=>void;const promise=new Promise<T>((ok,no)=>{resolve=ok;reject=no;});return {promise,resolve,reject};}
 function Composer({id=project,show=true}:{id?:string;show?:boolean}){return <DraftChatRequestProvider>{show?<AICopilotContent viewModel={vm} embed={{surface:"project",selection:{kind:"project",id,title:id},persistKey:"project:"+id}}/>:null}</DraftChatRequestProvider>;}
 const pointerKey=(id=project,group=localStorage.getItem("creatoros:current-group"))=>"copilot:conv:"+(group?"group:"+group+":":"")+"project:"+id;
 function actual(){protocol.actualSdk=true;protocol.sessionRegistry=new Map();protocol.listConversations.mockImplementation(async({query}:any)=>query.pageSize===20?histories:[]);}
 async function settle(operation:()=>void){await act(async()=>{operation();await Promise.resolve();});}
 async function pick(id:string){await userEvent.setup().click(screen.getByRole("button",{name:"历史记录"}));await userEvent.setup().click(await screen.findByRole("menuitem",{name:new RegExp("历史会话"+id)}));await waitFor(()=>expect(protocol.listMessages).toHaveBeenCalledWith(expect.objectContaining({params:{conversationId:"history-"+id}})),{timeout:120000});}
 async function reflectActual(){const text=protocol.live.chat.messages.find((row:any)=>row.role==="user")?.parts?.[0]?.text;if(text)await waitFor(()=>expect(screen.getByText(text,{exact:true})).toBeInTheDocument(),{timeout:120000});}
 async function evidence(name:string,empty:any,extra:Record<string,unknown>={}){if(screen.queryByLabelText("我能帮你做什么"))await reflectActual();const live=protocol.live;const value={name,messagesReferenceChanged:live.chat.messages!==empty,messages:live.chat.messages,conversationId:live.conversationId,pointer:localStorage.getItem(pointerKey()),prompt:(screen.queryByLabelText("我能帮你做什么") as HTMLTextAreaElement|null)?.value,reads:protocol.listMessages.mock.calls,listReads:protocol.listConversations.mock.calls,dom:document.body.innerHTML,...extra};const dir=process.env.T1308_EVIDENCE_DIR;if(dir){const allowed=path.resolve(process.cwd(),"../docs/verification/t1308/runtime");if(!path.resolve(dir).startsWith(allowed+path.sep))throw Error("T1308_EVIDENCE_PATH_REQUIRED");mkdirSync(dir,{recursive:true});writeFileSync(path.join(dir,name+".json"),JSON.stringify(value,null,2)+"\n");writeFileSync(path.join(dir,name+".html"),document.body.innerHTML);}return value;}
 async function expectSelected(id:string,empty:any,name:string){const state=await evidence(name,empty);expect.soft(state.messagesReferenceChanged).toBe(true);expect.soft(state.messages.map((x:any)=>x.id)).toEqual(rows(id).map(x=>x.id));expect.soft(state.conversationId).toBe("history-"+id);expect.soft(state.pointer).toBe("history-"+id);expect.soft(screen.queryByText("会话"+id+"的真实原话",{exact:true})).not.toBeNull();await userEvent.setup().click(screen.getByRole("button",{name:"历史记录"}));expect.soft(document.querySelector('[data-slot="copilot-history-item"][data-active="true"]')?.getAttribute("data-conversation-id")).toBe("history-"+id);await userEvent.setup().click(screen.getByRole("button",{name:"历史记录"}));}
 beforeEach(()=>actual());
 it("核心RED 默认A先回后B：真实messages引用、DOM、菜单与指针最终必须B",async()=>{
  const a=deferred(),b=deferred();localStorage.setItem(pointerKey(),"history-A");protocol.listMessages.mockImplementation(({params}:any)=>params.conversationId==="history-A"?a.promise:b.promise);
  render(<Composer/>);await waitFor(()=>expect(protocol.listMessages).toHaveBeenCalledOnce(),{timeout:120000});const empty=protocol.live.chat.messages;await pick("B");await settle(()=>a.resolve(rows("A")));await evidence("core1-after-A",empty);await settle(()=>b.resolve(rows("B")));await expectSelected("B",empty,"core1-final");
 });
 it("核心RED stored失败的旧恢复整链不得清B指针或用迟到fallback覆盖B",async()=>{
  const a=deferred(),b=deferred(),fallback=deferred();let aCalls=0;localStorage.setItem(pointerKey(),"history-A");protocol.listMessages.mockImplementation(({params}:any)=>params.conversationId==="history-A"?(++aCalls===1?a.promise:Promise.resolve(rows("A"))):b.promise);protocol.listConversations.mockImplementation(({query}:any)=>query.pageSize===1?fallback.promise:Promise.resolve(histories));
  render(<Composer/>);await waitFor(()=>expect(protocol.listMessages).toHaveBeenCalledOnce(),{timeout:120000});const empty=protocol.live.chat.messages;await pick("B");await settle(()=>b.resolve(rows("B")));await reflectActual();await settle(()=>a.reject(Error("原stored读取失败")));await evidence("core2-after-old-failure",empty);await settle(()=>fallback.resolve([histories[0]]));await expectSelected("B",empty,"core2-final");expect.soft(protocol.listConversations.mock.calls.filter((x:any)=>x[0].query.pageSize===1)).toHaveLength(0);
 });
 it("核心RED 更晚C优先：B先回后C仍必须C",async()=>{
  const b=deferred(),c=deferred();localStorage.setItem(pointerKey(),"history-A");protocol.listMessages.mockImplementation(({params}:any)=>params.conversationId==="history-B"?b.promise:params.conversationId==="history-C"?c.promise:Promise.resolve(rows("A")));
  render(<Composer/>);await screen.findByText("会话A的真实原话");const empty=protocol.live.chat.messages;await pick("B");await pick("C");await settle(()=>b.resolve(rows("B")));await evidence("core3-after-B",empty);await settle(()=>c.resolve(rows("C")));await expectSelected("C",empty,"core3-final");
 });
 it.each(["B-first","A-complete"])("辅助原基线 %s选择B",async mode=>{
  const a=deferred(),b=deferred();localStorage.setItem(pointerKey(),"history-A");protocol.listMessages.mockImplementation(({params}:any)=>params.conversationId==="history-A"?a.promise:b.promise);render(<Composer/>);await waitFor(()=>expect(protocol.listMessages).toHaveBeenCalledOnce(),{timeout:120000});const empty=protocol.live.chat.messages;
  if(mode==="A-complete"){await settle(()=>a.resolve(rows("A")));await reflectActual();}await pick("B");await settle(()=>b.resolve(rows("B")));await reflectActual();if(mode==="B-first")await settle(()=>a.resolve(rows("A")));await expectSelected("B",empty,"control-"+mode);
 });
 it.each(["stored","fallback"])("未被替代的正常%s恢复仍可用",async mode=>{
  if(mode==="stored")localStorage.setItem(pointerKey(),"history-A");protocol.listMessages.mockResolvedValue(rows("A") as any);protocol.listConversations.mockImplementation(async()=>[histories[0]]);render(<Composer/>);await screen.findByText("会话A的真实原话");expect(protocol.live.conversationId).toBe("history-A");expect(localStorage.getItem(pointerKey())).toBe("history-A");
 });
 it("迟到fallback列表不能在明确B后新启动旧A读取",async()=>{
  const fallback=deferred();protocol.listConversations.mockImplementation(({query}:any)=>query.pageSize===1?fallback.promise:Promise.resolve(histories));protocol.listMessages.mockImplementation(async({params}:any)=>rows(params.conversationId.endsWith("B")?"B":"A"));render(<Composer/>);await waitFor(()=>expect(protocol.listConversations).toHaveBeenCalledOnce(),{timeout:120000});const empty=protocol.live.chat.messages;await pick("B");await reflectActual();await settle(()=>fallback.resolve([histories[0]]));await expectSelected("B",empty,"late-fallback-list");expect.soft(protocol.listMessages.mock.calls.some((x:any)=>x[0].params.conversationId==="history-A")).toBe(false);
 });
 it.each(["new","unmount","same-scope-remount","scope-ABA","owner-ABA"])("旧stored读取在%s后不能回写",async mode=>{
  const a=deferred(),nextA=deferred();let readsA=0;localStorage.setItem(pointerKey(),"history-A");protocol.listMessages.mockImplementation(({params}:any)=>params.conversationId==="history-A"?(++readsA===1?a.promise:nextA.promise):Promise.resolve([]));const view=render(<Composer/>);await waitFor(()=>expect(protocol.listMessages).toHaveBeenCalledOnce(),{timeout:120000});const old=protocol.live,empty=old.chat.messages;
  if(mode==="new")await userEvent.setup().click(screen.getByRole("button",{name:"新对话"}));
  if(mode==="unmount")view.unmount();
  if(mode==="same-scope-remount"){view.rerender(<Composer show={false}/>);view.rerender(<Composer/>);}
  if(mode==="scope-ABA"){view.rerender(<Composer id="other-history-project"/>);view.rerender(<Composer/>);}
  if(mode==="owner-ABA"){const {writeCurrentGroupId}=await import("@/lib/http-transport");await act(async()=>writeCurrentGroupId("history-other-group"));await act(async()=>writeCurrentGroupId("fixture-valid-empty-group"));}
  if(mode!=="unmount")fireEvent.change(screen.getByLabelText("我能帮你做什么"),{target:{value:"新的未发送输入"}});
  const protectedMessages=old.chat.messages;await settle(()=>a.resolve(rows("A")));await evidence("lifecycle-"+mode,empty,{oldMessages:old.chat.messages,oldConversation:old.conversationId});
  // A cached session can legitimately resume on remount using a newly issued read.
  if(["new","unmount","same-scope-remount","scope-ABA","owner-ABA"].includes(mode)){expect.soft(old.chat.messages).toBe(protectedMessages);expect.soft(old.conversationId).not.toBe("history-A");}
  if(mode!=="unmount")expect(screen.getByLabelText("我能帮你做什么")).toHaveValue("新的未发送输入");await settle(()=>nextA.resolve([]));
 });
 it("StrictMode仍可正常恢复，不因cleanup取消后跳过第二setup",async()=>{
  localStorage.setItem(pointerKey(),"history-A");protocol.listMessages.mockResolvedValue(rows("A") as any);render(<React.StrictMode><Composer/></React.StrictMode>);await screen.findByText("会话A的真实原话");expect(protocol.live.conversationId).toBe("history-A");
 });
 it("旧history不覆盖真实SDK消息推进，即使最终status已ready",async()=>{
  const a=deferred();localStorage.setItem(pointerKey(),"history-A");protocol.listMessages.mockReturnValue(a.promise);render(<Composer/>);await waitFor(()=>expect(protocol.listMessages).toHaveBeenCalledOnce(),{timeout:120000});const empty=protocol.live.chat.messages;
  await settle(()=>{protocol.live.chat.messages=[{id:"new-source",role:"user",parts:[{type:"text",text:"新的SDK消息"}]}];});await settle(()=>a.resolve(rows("A")));await evidence("sdk-message-progress",empty);expect(protocol.live.chat.messages[0].id).toBe("new-source");expect(screen.getByText("新的SDK消息")).toBeInTheDocument();
 });

 it.each(["scope","owner"])("历史列表迟到不回写原%s之外的缓存",async mode=>{
  const oldList=deferred();let oldOwner=true;const other={id:"new-owner-history",title:"新归属历史",scope,createdAt:"2026-10-16T00:00:00.000Z"};
  protocol.listConversations.mockImplementation(({query}:any)=>query.pageSize===1?Promise.resolve([]):(oldOwner?oldList.promise:Promise.resolve([other])));const view=render(<Composer/>);await waitFor(()=>expect(protocol.listConversations).toHaveBeenCalled(),{timeout:120000});await userEvent.setup().click(screen.getByRole("button",{name:"历史记录"}));oldOwner=false;
  if(mode==="scope")view.rerender(<Composer id="other-history-project"/>);else{const {writeCurrentGroupId}=await import("@/lib/http-transport");await act(async()=>writeCurrentGroupId("history-new-owner"));}
  await userEvent.setup().click(screen.getByRole("button",{name:"历史记录"}));await screen.findByText("新归属历史");await settle(()=>oldList.resolve(histories));await evidence("late-list-"+mode,protocol.live.chat.messages);expect.soft(screen.queryByText("新归属历史")).not.toBeNull();expect.soft(screen.queryByText("历史会话A")).toBeNull();
 });
 it.each(["submitted-now","submitted-then-ready"])("真实SDK受控status %s使旧历史不能回写",async mode=>{
  const a=deferred();localStorage.setItem(pointerKey(),"history-A");protocol.listMessages.mockReturnValue(a.promise);render(<Composer/>);await waitFor(()=>expect(protocol.listMessages).toHaveBeenCalledOnce(),{timeout:120000});const empty=protocol.live.chat.messages;await settle(()=>{protocol.live.chat.state.status="submitted";});if(mode==="submitted-then-ready")await settle(()=>{protocol.live.chat.state.status="ready";});await settle(()=>a.resolve(rows("A")));await evidence("status-"+mode,empty);expect.soft(protocol.live.chat.messages).toBe(empty);expect.soft(protocol.live.conversationId).toBeNull();await settle(()=>{protocol.live.chat.state.status="ready";});
 });
 it("空fallback收尾不覆盖未发送输入",async()=>{
  const list=deferred();protocol.listConversations.mockReturnValue(list.promise);render(<Composer/>);await waitFor(()=>expect(protocol.listConversations).toHaveBeenCalledOnce(),{timeout:120000});fireEvent.change(screen.getByLabelText("我能帮你做什么"),{target:{value:"空恢复期间写入的新原话"}});await settle(()=>list.resolve([]));expect(screen.getByLabelText("我能帮你做什么")).toHaveValue("空恢复期间写入的新原话");expect(protocol.fetch).not.toHaveBeenCalled();
 });
 it("明确历史读取失败保原A和未发送输入，不触发模型",async()=>{
  localStorage.setItem(pointerKey(),"history-A");protocol.listMessages.mockImplementation(({params}:any)=>params.conversationId==="history-A"?Promise.resolve(rows("A")):Promise.reject(Error("B读取拒绝")));render(<Composer/>);await screen.findByText("会话A的真实原话");fireEvent.change(screen.getByLabelText("我能帮你做什么"),{target:{value:"历史失败仍保留我的输入"}});await pick("B");await reflectActual();expect(protocol.live.conversationId).toBe("history-A");expect(localStorage.getItem(pointerKey())).toBe("history-A");expect(screen.getByLabelText("我能帮你做什么")).toHaveValue("历史失败仍保留我的输入");expect(protocol.fetch).not.toHaveBeenCalled();
 });
 it.each(["manual","auto"])("实际公共submit %s在prepare await之前使旧历史失效",async mode=>{
  const a=deferred(),prepared=deferred();localStorage.setItem(pointerKey(),"history-A");protocol.listMessages.mockReturnValue(a.promise);
  const target:any={schemaVersion:1,projectId:project,outputId:"history-output",owner:"wechat_article",contentType:"article",savedBase:{kind:"artifact",artifactId:"history-artifact",versionId:"history-version"},documentDigest:"sha256:"+"a".repeat(64),selection:{kind:"article_sections",sectionIds:[]}};
  const prepare=vi.fn(()=>prepared.promise);function Port(){const c=useDraftChatRequest();React.useEffect(()=>c.registerEditor({readState:()=>({target,generation:1,dirty:false}),prepareForTurn:prepare,previewCandidate:async()=>null,adoptCandidate:async()=>({status:"adopted"})} as DraftEditorPort),[c.registerEditor]);return null;}
  protocol.fetch.mockResolvedValueOnce(new Response('data: {"type":"start","messageId":"history-submit-assistant"}\n\ndata: {"type":"finish","finishReason":"stop"}\n\ndata: [DONE]\n\n',{headers:{"content-type":"text/event-stream","x-vercel-ai-ui-message-stream":"v1"}}));
  render(<DraftChatRequestProvider><Port/><AICopilotContent viewModel={vm} embed={{surface:"project",selection:{kind:"project",id:project,title:project},persistKey:scope,...(mode==="auto"?{request:{nonce:1,prefill:"开始准备的本轮原话",autoSend:true}}:{})}}/></DraftChatRequestProvider>);const empty=protocol.live.chat.messages;if(mode==="manual"){await waitFor(()=>expect(protocol.listMessages).toHaveBeenCalledOnce(),{timeout:120000});fireEvent.change(screen.getByLabelText("我能帮你做什么"),{target:{value:"开始准备的本轮原话"}});await userEvent.setup().click(screen.getByLabelText("提交提示给 Copilot"));}await waitFor(()=>expect(prepare).toHaveBeenCalledOnce(),{timeout:120000});expect(protocol.fetch).not.toHaveBeenCalled();await settle(()=>a.resolve(rows("A")));await evidence("submit-before-prepare-"+mode,empty);expect.soft(protocol.live.chat.messages).toBe(empty);expect.soft(protocol.live.conversationId).toBeNull();await settle(()=>prepared.resolve(target));await waitFor(()=>expect(protocol.fetch).toHaveBeenCalledOnce(),{timeout:120000});const body=JSON.parse(protocol.fetch.mock.calls[0][1].body);expect(body.messages.at(-1).parts[0].text).toBe("开始准备的本轮原话");await waitFor(()=>expect(protocol.live.chat.status).toBe("ready"),{timeout:120000});
 });

});


describe("T1340 文章异步就绪的真实助手消费",()=>{
 const project="t1340-project",output="t1340-output";
 const title="告诉我这份成稿需要怎么调整",hint="审阅候选后采纳。";
 const empty={schemaVersion:1 as const,title:"",summary:"",sections:[],factItems:[],visualBriefs:[],imageUses:[]};
 const body="原脚本的第一段。\n\n原脚本的第二段。";
 const resource={projectId:project,outputId:output,artifactId:"t1340-artifact",currentVersionId:"t1340-v1",current:empty,versions:[{id:"t1340-v1",versionNumber:1,createdAt:"2026-10-17T00:00:00Z",changeSummary:"初稿"}],scriptContext:{state:"ready",scriptRef:{kind:"project_script",id:"t1340-script",versionId:"t1340-script-v2"},scriptText:body,metadata:{title:"原稿",summary:"",tags:[]},message:""}};
 it("T1340 delayed article get→真实Provider→专属助手，首次承接仍dirty且无写入",async()=>{
  let resolveArticle!:(value:Response)=>void;
  const pending=new Promise<Response>(resolve=>{resolveArticle=resolve;});
  const requests:Array<{id:string;input:any}>=[];
  vi.stubGlobal("fetch",vi.fn(async(_url:any,init?:RequestInit)=>{
   const request=JSON.parse(String(init?.body));requests.push(request);
   if(request.id==="articles.get")return pending;
   return Response.json({data:[],meta:{requestId:"t1340-list",page:1,pageSize:100,total:0}});
  }));
  let current:ReturnType<typeof useDraftChatRequest>;
  function Witness(){current=useDraftChatRequest();return <output data-testid="t1340-preparation">{current.readEditorState()?.preparation?.outputId??"not-ready"}</output>;}
  render(<DraftChatRequestProvider><ArticleWorkbench projectId={project} projectTitle="文章测试" initialOutputs={[{id:output,title:"公众号文章"}]}/><Witness/><AICopilotContent embed={{surface:"project",selection:{kind:"project",id:project,title:"文章测试"},persistKey:"project:"+project}}/></DraftChatRequestProvider>);
  await waitFor(()=>expect(requests.filter(row=>row.id==="articles.get")).toHaveLength(1),{timeout:120000});
  expect(screen.getByTestId("t1340-preparation")).toHaveTextContent("not-ready");
  expect(document.querySelectorAll('[data-slot="suggested-chip"]')).toHaveLength(7);
  await act(async()=>{resolveArticle(Response.json({data:resource,meta:{requestId:"t1340-article"}}));});
  await waitFor(()=>expect(document.querySelector('[aria-label="T1340原生成稿宿主"] p')?.textContent).toBe(body),{timeout:120000});
  expect(current!.readEditorState()?.dirty).toBe(true);
  expect(current!.readEditorState()?.preparation).toMatchObject({projectId:project,outputId:output,owner:"wechat_article"});
  // 目标RED：真实异步文章已读到，而消费方仍停留在首注册的未就绪状态。
  await waitFor(()=>expect(screen.getByRole("textbox",{name:"我能帮你做什么"})).toHaveAttribute("placeholder","告诉我这篇文章需要怎么调整"),{timeout:120000});
  expect(document.querySelectorAll('[data-slot="suggested-chip"]')).toHaveLength(0);
  expect(screen.getByTestId("t1340-preparation")).toHaveTextContent(output);
  expect(screen.getByText(title)).toBeVisible();expect(screen.getByText(hint)).toBeVisible();
  const actualReads=requests.map(row=>({id:row.id,method:Object.values(ENDPOINTS).find(endpoint=>endpoint.id===row.id)?.method??null}));
  if(process.env.T1340_OBSERVATION_DIR){mkdirSync(process.env.T1340_OBSERVATION_DIR,{recursive:true});writeFileSync(path.join(process.env.T1340_OBSERVATION_DIR,"ACTUAL_DISPATCH_READS.json"),JSON.stringify(actualReads,null,2));}
  for(const row of actualReads){expect(row.method,`未知或非只读端点：${row.id}`).toBe("GET");}
  expect(protocol.send).not.toHaveBeenCalled();expect(protocol.fetch).not.toHaveBeenCalled();
 },180000);
 it.each(["wechat_article","graphic_post"])("T1340 已有合法%s只显示平台空态且通用对话保持",async owner=>{
  const state:any={target:null,outputId:output,generation:1,dirty:false,preparation:{scopeKey:"group:fixture-valid-empty-group",projectId:project,outputId:output,owner,versionId:"saved-version",documentFingerprint:"original-document",selection:{kind:"article",sectionIds:[]}}};
  function Current(){const chat=useDraftChatRequest();React.useEffect(()=>chat.registerEditor({readState:()=>state,prepareForTurn:async()=>undefined as any,previewCandidate:async()=>null,adoptCandidate:async()=>({status:"adopted"})}),[chat.registerEditor]);return null;}
  render(<DraftChatRequestProvider><Current/><AICopilotContent embed={{surface:"project",selection:{kind:"project",id:project,title:"成稿"},persistKey:"project:"+project}}/></DraftChatRequestProvider>);
  await waitFor(()=>expect(document.querySelectorAll('[data-slot="suggested-chip"]')).toHaveLength(0),{timeout:120000});
  expect.soft(screen.queryByText(title)).toBeVisible();expect.soft(screen.queryByText(hint)).toBeVisible();
  expect(screen.queryByText(/也可选择下方指令/)).toBeNull();expect(protocol.send).not.toHaveBeenCalled();
 },120000);

 it.each(["output","scope","unmount","reject"] as const)("T1340 late-load %s：真实旧文章晚回不污染当前正文或助手",async mode=>{
  let resolveOld!:(value:Response)=>void,rejectOld!:(error:Error)=>void;
  const old=new Promise<Response>((resolve,reject)=>{resolveOld=resolve;rejectOld=reject;});
  const requests:Array<{id:string;input:any}>=[];let first=true;
  const nextOutput="t1340-next-output",nextProject=mode==="scope"?"t1340-next-project":project,nextBody="新作品当前正文，不接旧回执。";
  const nextResource={...resource,projectId:nextProject,outputId:nextOutput,artifactId:"t1340-next-artifact",currentVersionId:"t1340-next-v1",current:{...empty,title:"新的文章",sections:[{sectionId:"next-body",order:0,heading:"当前稿",headingLevel:2,body:nextBody,sourceRefs:[]}]}};
  vi.stubGlobal("fetch",vi.fn(async(_url:any,init?:RequestInit)=>{
   const request=JSON.parse(String(init?.body));requests.push(request);
   if(request.id==="articles.get"){if(first){first=false;return old;}return Response.json({data:nextResource,meta:{requestId:"t1340-next"}});}
   return Response.json({data:[],meta:{requestId:"t1340-read",page:1,pageSize:100,total:0}});
  }));
  let current:ReturnType<typeof useDraftChatRequest>;
  function Observe(){current=useDraftChatRequest();return <output data-testid="t1340-current-owner">{current.readEditorState()?.preparation?.outputId??"not-ready"}</output>;}
  function Scene({next=false,show=true}:{next?:boolean;show?:boolean}){const pid=next?nextProject:project,id=next?nextOutput:output;return <DraftChatRequestProvider>{show&&<ArticleWorkbench projectId={pid} projectTitle="当前文章" initialOutputs={[{id,title:"当前文章"}]} initialOutputId={id}/>}<Observe/><AICopilotContent embed={{surface:"project",selection:{kind:"project",id:pid,title:"当前文章"},persistKey:"project:"+pid}}/></DraftChatRequestProvider>;}
  const view=render(<Scene/>);await waitFor(()=>expect(requests.filter(row=>row.id==="articles.get")).toHaveLength(1),{timeout:120000});expect(current!.readEditorState()?.preparation).toBeUndefined();
  if(mode==="output"||mode==="scope"){
   const {writeCurrentGroupId}=await import("@/lib/http-transport");
   await act(async()=>{if(mode==="scope")writeCurrentGroupId("t1340-next-group");view.rerender(<Scene next/>);});
   await waitFor(()=>expect(screen.getByTestId("t1340-current-owner")).toHaveTextContent(nextOutput),{timeout:120000});
   expect(screen.getByRole("textbox",{name:"我能帮你做什么"})).toHaveAttribute("placeholder","告诉我这篇文章需要怎么调整");
   await act(async()=>resolveOld(Response.json({data:resource,meta:{requestId:"t1340-late"}})));
   expect(current!.readEditorState()?.preparation).toMatchObject({projectId:nextProject,outputId:nextOutput,scopeKey:mode==="scope"?"group:t1340-next-group":"group:fixture-valid-empty-group"});
   expect(document.querySelector('[aria-label="T1340原生成稿宿主"] p')?.textContent).toBe(nextBody);expect(document.body.textContent).not.toContain(body);expect(document.querySelectorAll('[data-slot="suggested-chip"]')).toHaveLength(0);
  }else{
   if(mode==="unmount")view.rerender(<Scene show={false}/>);
   await act(async()=>{if(mode==="reject")rejectOld(Error("原文章读取失败"));else resolveOld(Response.json({data:resource,meta:{requestId:"t1340-unmounted"}}));});
   expect(current!.readEditorState()?.preparation).toBeUndefined();expect(screen.getByTestId("t1340-current-owner")).toHaveTextContent("not-ready");expect(document.body.textContent).not.toContain(body);expect(document.querySelectorAll('[data-slot="suggested-chip"]')).toHaveLength(7);
   expect(screen.getByRole("textbox",{name:"我能帮你做什么"})).toHaveAttribute("placeholder",expect.stringContaining("描述目标"));if(mode==="reject")expect(screen.getByRole("alert")).toHaveTextContent("原文章读取失败");
  }
  for(const row of requests)expect(Object.values(ENDPOINTS).find(endpoint=>endpoint.id===row.id)?.method,`未知或非只读端点：${row.id}`).toBe("GET");expect(protocol.send).not.toHaveBeenCalled();expect(protocol.fetch).not.toHaveBeenCalled();
 },120000);
});
