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
import { buildCopilotViewModel } from "@/fixtures/selectors/copilot";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace: vi.fn(), back: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("copilot=open"),
}));
const protocol = vi.hoisted(() => ({
  messages: [] as any[],
  error: null as Error | null,
  send: vi.fn(),
  regenerate: vi.fn(),
  setMessages: vi.fn(),
  listMessages: vi.fn(async (..._args: unknown[]) => []),
  fetch: vi.fn(),
  live: null as any,
  actualSdk: false,
  attachmentIds: [] as string[],
  engine: "pi" as "pi"|"codex",
  engineAvailable: true,
  engineChecking: false,
}));
vi.mock("./use-assistant-engine",()=>({useAssistantEngine:()=>({engine:protocol.engine,available:protocol.engineAvailable,checking:protocol.engineChecking})}));
vi.mock("@/lib/contract-client", () => ({
  client: {
    listAITasks: async () => [],
    listProjects: async () => [],
    listConversations: async () => [],
    listMessages: (...args: unknown[]) => protocol.listMessages(...args),
  },
}));
vi.mock("./live-chat-session", () => ({
  getLiveChatSession: () =>
    (protocol.live ??= {
      chat: { messages: [], status: "ready" },
      control: {
        fetch: (...args: unknown[]) => protocol.fetch(...args),
        cancel: async () => {},
      },
      conversationId: null,
      epoch: 0,
      executionEngine: "pi",
      sourceEngines: new Map(),
      transport: null,
    }),
}));
vi.mock("@ai-sdk/react", async () => {
  const actual=await vi.importActual<{useChat:(options:any)=>any;Chat:new(options:any)=>any}>("@ai-sdk/react");
  return {useChat: (options:any) => protocol.actualSdk?actual.useChat(options):({
    messages: protocol.messages,
    status: "ready",
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
    react.useEffect(()=>{if(protocol.actualSdk&&protocol.attachmentIds.length)props.onStateChange({ids:[...protocol.attachmentIds],count:protocol.attachmentIds.length,uploading:false});},[]);
    react.useImperativeHandle(ref,()=>({clear:()=>props.onStateChange({ids:[],count:0,uploading:false})}));
    return protocol.actualSdk?null:<actual.CopilotAttachmentPicker {...props} ref={ref}/>;
  })};
});

import { AppShell } from "@/components/shell/app-shell";
import { OverlayController } from "@/components/overlays/overlay-controller";
import { AICopilotDialog } from "@/components/overlays/ai-copilot-dialog";
import { AICopilotContent } from "./ai-copilot-content";
import {
  DraftChatRequestProvider,
  useDraftChatRequest,
  type DraftEditorPort,
} from "@/features/draft-workbench/draft-chat-request";

afterEach(() => cleanup());
beforeEach(() => {
  protocol.live = null;
  protocol.actualSdk = false;
  protocol.attachmentIds = [];
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
  protocol.fetch.mockReset();
  protocol.fetch.mockResolvedValue(new Response("", { status: 200 }));
  sessionStorage.clear();
});

function renderDialog() {
  return render(
    <AppShell pathname="/">
      <main data-page="test">
        <p>underlay</p>
      </main>
      <OverlayController>
        <AICopilotDialog pathname="/" />
      </OverlayController>
    </AppShell>,
  );
}

function slot(dialog: HTMLElement, name: string) {
  return dialog.querySelector(`[data-slot="${name}"]`);
}

describe("AI Copilot dialog (Task 24)", () => {
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
  function Composer({ request }: { request?: any }) {
    return (
      <DraftChatRequestProvider>
        <Port />
        <AICopilotContent viewModel={viewModel} embed={{ ...embed, request }} />
      </DraftChatRequestProvider>
    );
  }
  beforeEach(() => {
    prepare = vi.fn(async () => structuredClone(target));
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
  it("autoSend也等strict prepare；保存UNKNOWN不调用SDK，保留原请求", async () => {
    prepare.mockRejectedValueOnce(Error("原保存未知，不可用旧稿发送"));
    render(
      <Composer request={{ nonce: 1, prefill: "修改开头", autoSend: true }} />,
    );
    await waitFor(() => expect(prepare).toHaveBeenCalledOnce());
    await screen.findByText("原保存未知，不可用旧稿发送");
    expect(protocol.send).not.toHaveBeenCalled();
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
    await user.click(await screen.findByRole("button", { name: "重试" }));
    await waitFor(() =>
      expect(protocol.listMessages).toHaveBeenCalledWith({
        params: { conversationId: "original-conversation" },
        query: undefined,
        body: undefined,
      }),
    );
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
    await user.click(await screen.findByRole("button", { name: "重试" }));
    await waitFor(()=>expect(protocol.regenerate).toHaveBeenCalledWith({
      messageId: "server-source-real",
      body: { chatContext: frozen, executionEngine: "pi",conversationId:"original-conversation",attachmentIds:[] },
    }));
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
    protocol.listMessages.mockResolvedValue([{id:"older-server-source",role:"user",content:"上一回合",attachments:[]}] as any);
    view.rerender(<Composer/>);
    prepare.mockRejectedValueOnce(Error("这次原保存尚未完成"));
    await user.type(screen.getByLabelText("我能帮你做什么"),"这次明确修改");await user.click(screen.getByLabelText("提交提示给 Copilot"));
    await screen.findByText("这次原保存尚未完成");
    await user.click(screen.getByRole("button",{name:"重试"}));
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
    const live:any={control:{fetch:(...args:unknown[])=>protocol.fetch(...args),cancel:async()=>{}},conversationId:null,epoch:0,executionEngine:"pi",sourceEngines:new Map(),transport:null};
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
    await user.click(await screen.findByRole("button",{name:"重试"}));
    await waitFor(()=>expect(protocol.fetch).toHaveBeenCalledTimes(2));
    const retry=JSON.parse(protocol.fetch.mock.calls[1][1].body);
    expect(retry).toMatchObject({trigger:"regenerate-message",messageId:"server-source-real",conversationId:"original-conversation",attachmentIds:["uploaded-original-asset"],executionEngine:"pi",chatContext:original.chatContext});
    expect(retry.messages.at(-1)).toMatchObject({id:"server-source-real",role:"user",parts:[{type:"text",text:"微调标题"}]});
    expect(prepare).toHaveBeenCalledOnce();
    await waitFor(()=>expect(live.chat.status).toBe("ready"));
  });
  it("真实SDK联合创作在引擎不可用时明确零提交，可显式恢复同target；fetch开始后失败保持UNKNOWN",async()=>{
    const {Chat}=await vi.importActual<{useChat:(options:any)=>any;Chat:new(options:any)=>any}>("@ai-sdk/react");
    protocol.actualSdk=true;protocol.engineAvailable=false;
    const live:any={control:{fetch:(...args:unknown[])=>protocol.fetch(...args),cancel:async()=>{}},conversationId:null,epoch:0,executionEngine:"pi",sourceEngines:new Map(),transport:null};
    live.chat=new Chat({id:"actual-creation-chat",transport:{sendMessages:(options:any)=>live.transport.sendMessages(options),reconnectToStream:async()=>null}});protocol.live=live;
    const creationTarget={clientRequestId:"original-pair",projectId:"protocol-project",scriptSourceRef:{kind:"project_script",id:"script",versionId:"frozen-script-v"}};
    const onCreationSubmission=vi.fn(),request={nonce:1,prefill:"生成原文章图文候选",creationTarget,autoSend:true,onCreationSubmission};
    const view=render(<Composer request={request}/>);
    await screen.findByText("当前编导引擎尚不可用，请到设置核对后恢复原请求。");
    expect(onCreationSubmission.mock.calls).toEqual([["not-submitted"]]);
    expect(protocol.fetch).not.toHaveBeenCalled();expect(live.chat.messages).toHaveLength(0);expect(prepare).not.toHaveBeenCalled();
    protocol.engineAvailable=true;
    protocol.fetch.mockResolvedValueOnce(new Response("原流未知",{status:503,headers:{"x-source-message-id":"original-creation-source","x-conversation-id":"original-creation-conversation"}}));
    view.rerender(<Composer request={request}/>);
    await userEvent.setup().click(await screen.findByRole("button",{name:"重试"}));
    await waitFor(()=>expect(protocol.fetch).toHaveBeenCalledOnce());
    await waitFor(()=>expect(live.chat.status).toBe("error"));
    expect(onCreationSubmission.mock.calls).toEqual([["not-submitted"],["submitted-unknown"]]);
    expect(JSON.parse(protocol.fetch.mock.calls[0][1].body)).toMatchObject({chatContext:{creationTarget},executionEngine:"pi"});
    expect(prepare).not.toHaveBeenCalled();
  });
  it("真实SDK联合创作等待原Codex状态检查；同target就绪后只提交一次",async()=>{
    const {Chat}=await vi.importActual<{Chat:new(options:any)=>any}>("@ai-sdk/react");
    protocol.actualSdk=true;protocol.engine='codex';protocol.engineAvailable=false;protocol.engineChecking=true;
    const live:any={control:{fetch:(...args:unknown[])=>protocol.fetch(...args),cancel:async()=>{}},conversationId:null,epoch:0,executionEngine:'codex',sourceEngines:new Map(),transport:null};
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
});
