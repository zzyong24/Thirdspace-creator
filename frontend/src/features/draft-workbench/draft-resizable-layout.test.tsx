/**
 * [T-130] 稿面可拖拽分栏单测。pointer 拖拽的几何数学依赖真实 getBoundingClientRect(jsdom 恒返
 * 0),故这里用 **键盘可调**(←/→,共享同一 clampRail + setRailWidth + persist 逻辑)覆盖核心:
 * slot 渲染、默认宽、加宽/收窄、边界钳制、localStorage 持久 + 读回。
 *
 * [T-150] 追加:右栏折叠开关(收起/展开)的持久、收起态布局、以及「收起态来新 request →
 * 自动展开」的边界(用真实 DraftChatRequestProvider + 触发 openChat 驱动 nonce 变化验证)。
 */

import * as React from "react";
import { createPortal } from "react-dom";
type ControlledSession = { chat?: unknown; control: {fetch: ReturnType<typeof vi.fn>;cancel: () => Promise<void>;currentTaskId: () => null}; conversationId: string | null;epoch: number;executionEngine: "pi";sourceEngines: Map<string, string>;transport: unknown };
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

// 真实AICopilot组件；仅SDK发送边界/公开读取端口受控，不运行模型/backend。
const assistantBoundary = vi.hoisted(() => ({
  send: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
  listTasks: vi.fn(async (): Promise<unknown[]> => []),
  sessions: new Map<string, ControlledSession>(),
  messages: [] as unknown[], setMessages: vi.fn(), regenerate: vi.fn(), stop: vi.fn(async () => {}),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/projects/project-a",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/features/copilot/use-assistant-engine", () => ({
  useAssistantEngine: () => ({ engine: "pi", available: true, checking: false }),
}));
vi.mock("@/lib/contract-client", () => ({client:{
  listAITasks: () => assistantBoundary.listTasks(),
  listProjects: async () => [], listConversations: async () => [], listMessages: async () => [],
}}));
vi.mock("@/features/copilot/live-chat-session", () => ({
  acquireLiveChatSession: () => () => {},
  getLiveChatSession: (key: string, factory: (session: ControlledSession) => unknown) => {
    let session = assistantBoundary.sessions.get(key);
    if (!session) {
      session = { control: { fetch: vi.fn(), cancel: async () => {}, currentTaskId: () => null },
        conversationId: null, epoch: 0, executionEngine: "pi", sourceEngines: new Map(), transport: null };
      session.chat = factory(session); assistantBoundary.sessions.set(key, session);
    }
    return session;
  },
}));
vi.mock("@ai-sdk/react", async () => {
  const actual = await vi.importActual<typeof import("@ai-sdk/react")>("@ai-sdk/react");
  return {...actual, useChat: () => ({messages: assistantBoundary.messages, status: "ready", error: null,
    sendMessage: (...args: unknown[]) => assistantBoundary.send(...args),
    regenerate: assistantBoundary.regenerate, setMessages: assistantBoundary.setMessages, stop: assistantBoundary.stop,
  })};
});
import { AICopilotContent } from "@/features/copilot/ai-copilot-content";

import { DraftResizableLayout } from "./draft-resizable-layout";
import {
  DraftChatRequestProvider,
  useDraftChatRequest,
} from "./draft-chat-request";

let narrowViewport = false;
let mediaSubscribers = new Set<() => void>();
beforeEach(() => {
  narrowViewport = false;
  assistantBoundary.send.mockReset(); assistantBoundary.send.mockResolvedValue(undefined);
  assistantBoundary.listTasks.mockReset(); assistantBoundary.listTasks.mockResolvedValue([]);
  assistantBoundary.sessions.clear(); assistantBoundary.messages=[];
  assistantBoundary.setMessages.mockReset(); assistantBoundary.regenerate.mockReset(); assistantBoundary.stop.mockClear();
  sessionStorage.clear();
  localStorage.setItem("creatoros:current-group", "fixture-t1342-owned-group");
  mediaSubscribers = new Set();
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    media: query, get matches() { return narrowViewport; },
    addEventListener: (_type: string, callback: () => void) => mediaSubscribers.add(callback),
    removeEventListener: (_type: string, callback: () => void) => mediaSubscribers.delete(callback),
  })));
});
function viewport(width: number) {
  act(() => { narrowViewport = width < 1280; for (const update of mediaSubscribers) update(); });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  cleanup();
  try {
    window.localStorage.clear();
  } catch {
    /* noop */
  }
});

function renderLayout() {
  return render(
    <DraftResizableLayout
      left={<div data-testid="left-content">稿面</div>}
      right={<div data-testid="right-content">编导</div>}
    />,
  );
}

const KEY = "creatoros:draft:rail-width";
const COLLAPSE_KEY = "creatoros:draft:rail-collapsed";

describe("DraftResizableLayout (T-130)", () => {
  it("渲染左右 slot + 分隔条(role=separator,默认宽 380,inline width 跟随)", () => {
    const { container } = renderLayout();
    expect(screen.getByTestId("left-content")).toBeInTheDocument();
    expect(screen.getByTestId("right-content")).toBeInTheDocument();
    const handle = screen.getByRole("separator", { name: "调整编导栏宽度" });
    expect(handle).toHaveAttribute("aria-valuenow", "380");
    expect(handle).toHaveAttribute("aria-valuemin", "300");
    expect(handle).toHaveAttribute("aria-valuemax", "640");
    const aside = container.querySelector(
      '[data-slot="draft-chat-rail"]',
    ) as HTMLElement;
    expect(aside.style.width).toBe("380px");
  });

  it("键盘 ← 加宽 +16、→ 收窄 -16,右栏宽度跟随 + 持久化 localStorage", () => {
    const { container } = renderLayout();
    const handle = screen.getByTestId("draft-rail-resize-handle");
    const aside = container.querySelector(
      '[data-slot="draft-chat-rail"]',
    ) as HTMLElement;

    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(handle).toHaveAttribute("aria-valuenow", "396");
    expect(aside.style.width).toBe("396px");
    expect(window.localStorage.getItem(KEY)).toBe("396");

    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(handle).toHaveAttribute("aria-valuenow", "380");
    expect(window.localStorage.getItem(KEY)).toBe("380");
  });

  it("连续收窄钳到 MIN(300),不越界", () => {
    renderLayout();
    const handle = screen.getByTestId("draft-rail-resize-handle");
    for (let i = 0; i < 20; i++) fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(handle).toHaveAttribute("aria-valuenow", "300");
  });

  it("连续加宽钳到 MAX(640),不越界", () => {
    renderLayout();
    const handle = screen.getByTestId("draft-rail-resize-handle");
    for (let i = 0; i < 40; i++) fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(handle).toHaveAttribute("aria-valuenow", "640");
  });

  it("localStorage 有持久宽度 → 挂载后读回应用", async () => {
    window.localStorage.setItem(KEY, "512");
    const { container } = renderLayout();
    const aside = container.querySelector(
      '[data-slot="draft-chat-rail"]',
    ) as HTMLElement;
    await waitFor(() => expect(aside.style.width).toBe("512px"));
  });

  it("localStorage 越界值 → 读回时钳回边界(9999 → 640)", async () => {
    window.localStorage.setItem(KEY, "9999");
    const { container } = renderLayout();
    const aside = container.querySelector(
      '[data-slot="draft-chat-rail"]',
    ) as HTMLElement;
    await waitFor(() => expect(aside.style.width).toBe("640px"));
  });
});

// ---------------------------------------------------------------------------
// [T-150] 右栏折叠开关
// ---------------------------------------------------------------------------

/** 测试辅助:渲染一个能主动 openChat 的按钮,用来驱动 request.nonce 变化(模拟稿面 AI 按钮)。 */
function OpenChatButton() {
  const { openChat } = useDraftChatRequest();
  return (
    <button
      type="button"
      data-testid="fire-request"
      onClick={() =>
        openChat({ functionKey: "review.script", prefill: "审一下" })
      }
    >
      发起请求
    </button>
  );
}

function renderLayoutWithProvider() {
  return render(
    <DraftChatRequestProvider>
      <OpenChatButton />
      <DraftResizableLayout
        left={<div data-testid="left-content">稿面</div>}
        right={<div data-testid="right-content">编导</div>}
      />
    </DraftChatRequestProvider>,
  );
}

describe("DraftResizableLayout 折叠开关 (T-150)", () => {
  it("默认展开:收起按钮可见、展开 affordance 不在、右栏可见", () => {
    const { container } = renderLayout();
    expect(
      screen.getByTestId("draft-rail-collapse-toggle"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("draft-rail-expand-toggle"),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="draft-chat-rail"]'),
    ).toBeInTheDocument();
  });

  it("点收起 → 右栏 + 拖拽手柄隐藏、露出展开 affordance,且持久化 collapsed=1", () => {
    const { container } = renderLayout();
    fireEvent.click(screen.getByTestId("draft-rail-collapse-toggle"));

    expect(container.querySelector('[data-slot="draft-chat-rail"]')).toHaveAttribute("hidden");
    expect(container.querySelector('[data-slot="draft-chat-rail"]')).toHaveAttribute("inert");
    expect(
      container.querySelector('[data-slot="draft-rail-resize-handle"]'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("draft-rail-expand-toggle")).toBeInTheDocument();
    expect(window.localStorage.getItem(COLLAPSE_KEY)).toBe("1");
  });

  it("收起后再点展开 → 右栏恢复、持久化 collapsed=0", () => {
    const { container } = renderLayout();
    fireEvent.click(screen.getByTestId("draft-rail-collapse-toggle"));
    fireEvent.click(screen.getByTestId("draft-rail-expand-toggle"));

    expect(
      container.querySelector('[data-slot="draft-chat-rail"]'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("draft-rail-expand-toggle"),
    ).not.toBeInTheDocument();
    expect(window.localStorage.getItem(COLLAPSE_KEY)).toBe("0");
  });

  it("localStorage collapsed=1 → 挂载后读回应用为收起态(右栏隐藏)", async () => {
    window.localStorage.setItem(COLLAPSE_KEY, "1");
    const { container } = renderLayout();
    await waitFor(() =>
      expect(screen.getByTestId("draft-rail-expand-toggle")).toBeInTheDocument(),
    );
    expect(container.querySelector('[data-slot="draft-chat-rail"]')).toHaveAttribute("hidden");
    expect(container.querySelector('[data-slot="draft-chat-rail"]')).toHaveAttribute("inert");
  });

  it("收起态展开后仍保留之前持久的宽度(不丢 T-130 记忆:512)", async () => {
    window.localStorage.setItem(KEY, "512");
    window.localStorage.setItem(COLLAPSE_KEY, "1");
    const { container } = renderLayout();
    // 先确认已读回收起态
    await waitFor(() =>
      expect(screen.getByTestId("draft-rail-expand-toggle")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("draft-rail-expand-toggle"));
    const aside = container.querySelector(
      '[data-slot="draft-chat-rail"]',
    ) as HTMLElement;
    await waitFor(() => expect(aside.style.width).toBe("512px"));
  });

  it("边界:收起态来了新 request(nonce 变)→ 自动展开右栏", async () => {
    window.localStorage.setItem(COLLAPSE_KEY, "1");
    const { container } = renderLayoutWithProvider();
    // 初始为收起态(读回 collapsed=1)。
    await waitFor(() =>
      expect(screen.getByTestId("draft-rail-expand-toggle")).toBeInTheDocument(),
    );
    // 稿面 AI 按钮发请求(nonce 0 → 1)。
    fireEvent.click(screen.getByTestId("fire-request"));
    // 右栏应自动展开(结果不再喂进隐藏 rail)。
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="draft-chat-rail"]'),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("draft-rail-expand-toggle"),
    ).not.toBeInTheDocument();
  });

  it("首挂载(request=null)不误触发展开:显式收起后仍保持收起", async () => {
    // Provider 内首帧 request=null(nonce 概念上为 0);挂载 effect 不该把手动收起顶开。
    const { container } = renderLayoutWithProvider();
    // 手动收起。
    fireEvent.click(screen.getByTestId("draft-rail-collapse-toggle"));
    expect(container.querySelector('[data-slot="draft-chat-rail"]')).toHaveAttribute("hidden");
    expect(container.querySelector('[data-slot="draft-chat-rail"]')).toHaveAttribute("inert");
    // 等若干 tick 确认没有「幽灵 nonce」把它顶开。
    await new Promise((r) => setTimeout(r, 20));
    expect(container.querySelector('[data-slot="draft-chat-rail"]')).toHaveAttribute("hidden");
    expect(container.querySelector('[data-slot="draft-chat-rail"]')).toHaveAttribute("inert");
    expect(screen.getByTestId("draft-rail-expand-toggle")).toBeInTheDocument();
  });
});


// T1342: 真实React slot生命周期/本地呈现组合。消费探针不冒共享AI供应商发送。
function lifetimeFixture(project = "project-a") {
  const events = { mounts: 0, unmounts: 0, consumedNonces: [] as number[] };
  let publish: (() => void) | undefined;
  function Control() {
    const { openChat } = useDraftChatRequest();
    React.useEffect(() => {
      publish = () => openChat({ functionKey: "review.script", prefill: "原请求", autoSend: true });
      return () => { publish = undefined; };
    }, [openChat]);
    return null;
  }
  function Probe() {
    const { request } = useDraftChatRequest();
    const handled = React.useRef<number | null>(null);
    React.useEffect(() => { events.mounts++; return () => { events.unmounts++; }; }, []);
    React.useEffect(() => {
      if (request && handled.current !== request.nonce) {
        handled.current = request.nonce; events.consumedNonces.push(request.nonce);
      }
    }, [request]);
    return <><input aria-label="原未发送输入" defaultValue="保留原话"/><button>原对话尾动作</button></>;
  }
  function Host({ id }: { id: string }) {
    return <DraftChatRequestProvider key={id}><Control/><DraftResizableLayout
      left={<button>继续编辑脚本</button>} right={<Probe/>}/></DraftChatRequestProvider>;
  }
  const view = render(<Host id={project}/>);
  return { ...view, events, request: () => act(() => publish!()), nextProject: (id: string) => view.rerender(<Host id={id}/>) };
}

it("T1342 1024初始可见本地入口，关态同slot hidden/inert，打开稿面inert并正常关闭返回焦点", async () => {
  narrowViewport = true;
  const {container} = renderLayout();
  const trigger = screen.getByRole("button", {name:"打开编导"});
  const panel = container.querySelector('[data-slot="draft-chat-rail"]')!;
  expect(panel).toHaveAttribute("hidden"); expect(panel).toHaveAttribute("inert");
  expect(screen.queryByRole("dialog",{name:"编导对话"})).not.toBeInTheDocument();
  fireEvent.click(trigger);
  const dialog = await screen.findByRole("dialog",{name:"编导对话"},{timeout:120000});
  expect(dialog).toBe(panel); expect(dialog).toHaveAttribute("aria-modal","true");
  expect(dialog).not.toHaveAttribute("hidden"); expect(dialog).not.toHaveAttribute("inert");
  expect(container.querySelector('[data-slot="draft-pane"]')).toHaveAttribute("inert");
  const close = screen.getByRole("button",{name:"收起编导栏"});
  await waitFor(()=>expect(close).toHaveFocus(),{timeout:120000});
  fireEvent.click(close);
  expect(panel).toHaveAttribute("hidden"); expect(panel).toHaveAttribute("inert");
  expect(container.querySelector('[data-slot="draft-pane"]')).not.toHaveAttribute("inert");
  await waitFor(()=>expect(screen.getByRole("button",{name:"打开编导"})).toHaveFocus(),{timeout:120000});
});

it.each([false,true])("T1342 mobile开关保desktop collapsed=%s及512宽度偏好", async collapsed => {
  localStorage.setItem(COLLAPSE_KEY,collapsed?"1":"0");localStorage.setItem(KEY,"512");
  narrowViewport=true; const {container}=renderLayout();
  const trigger=screen.getByRole("button",{name:"打开编导"});fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole("button",{name:"收起编导栏"},{timeout:120000}));
  expect(localStorage.getItem(COLLAPSE_KEY)).toBe(collapsed?"1":"0");
  expect(localStorage.getItem(KEY)).toBe("512");viewport(1280);
  const panel=container.querySelector('[data-slot="draft-chat-rail"]')!;
  if(collapsed){expect(panel).toHaveAttribute("hidden");expect(screen.getByRole("button",{name:"展开编导栏"})).toBeVisible();}
  else {expect(panel).not.toHaveAttribute("hidden");expect(panel).toHaveStyle({width:"512px"});}
});

it("T1342 1366-1279-1280-1024-1366始终同一slot、输入和已消费nonce，真换项目正常卸载",async()=>{
  const h=lifetimeFixture();const input=screen.getByRole("textbox",{name:"原未发送输入"});
  fireEvent.change(input,{target:{value:"当前草稿不发送"}});h.request();expect(h.events.consumedNonces).toEqual([1]);
  const panel=h.container.querySelector('[data-slot="draft-chat-rail"]');
  fireEvent.click(screen.getByRole("button",{name:"收起编导栏"}));
  fireEvent.click(screen.getByRole("button",{name:"展开编导栏"}));
  input.focus();
  for(const width of [1279,1280,1024,1366]){
    viewport(width);
    if(width===1279) await waitFor(()=>expect(screen.getByRole("button",{name:"打开编导"})).toHaveFocus(),{timeout:120000});
    if(width<1280){fireEvent.click(screen.getByRole("button",{name:"打开编导"}));fireEvent.keyDown(screen.getByRole("dialog",{name:"编导对话"}),{key:"Escape"});}
    expect(h.container.querySelector('[data-slot="draft-chat-rail"]')).toBe(panel);
    expect(screen.getByLabelText("原未发送输入")).toBe(input);expect(input).toHaveValue("当前草稿不发送");
  }
  expect(h.events).toEqual({mounts:1,unmounts:0,consumedNonces:[1]});
  h.request();expect(h.events.consumedNonces).toEqual([1,2]);
  h.nextProject("project-b");expect(h.events.mounts).toBe(2);expect(h.events.unmounts).toBe(1);
  expect(screen.getByRole("textbox",{name:"原未发送输入"})).toHaveValue("保留原话");
  h.unmount();expect(h.events.unmounts).toBe(2);
});

it("T1342 新nonce在minimum打开原slot，不改desktop收起偏好且重开不再消费",async()=>{
  localStorage.setItem(COLLAPSE_KEY,"1");narrowViewport=true;const h=lifetimeFixture();h.request();
  expect(await screen.findByRole("dialog",{name:"编导对话"},{timeout:120000})).toBeVisible();
  expect(localStorage.getItem(COLLAPSE_KEY)).toBe("1");
  fireEvent.keyDown(screen.getByRole("dialog",{name:"编导对话"}),{key:"Escape"});
  fireEvent.click(screen.getByRole("button",{name:"打开编导"}));
  expect(h.events).toEqual({mounts:1,unmounts:0,consumedNonces:[1]});
});

it("T1342 窄窗Tab首尾循环，嵌套dialog和物理外portal的Escape不得关闭外栏",async()=>{
  narrowViewport=true;
  function Right(){return <><input aria-label="面板输入"/><section role="dialog" aria-label="来源预览"><input aria-label="来源输入"/></section>{createPortal(<section role="dialog" aria-label="外部来源预览"><input aria-label="portal输入"/></section>,document.body)}<button>最后动作</button></>;}
  render(<DraftResizableLayout left={<p>稿面</p>} right={<Right/>}/>);
  fireEvent.click(screen.getByRole("button",{name:"打开编导"}));const outer=screen.getByRole("dialog",{name:"编导对话"});
  const close=screen.getByRole("button",{name:"收起编导栏"}),last=screen.getByRole("button",{name:"最后动作"});
  // JSDOM无布局；仅此受控组合提供物理可见几何，不用于包像素证据。
  vi.spyOn(HTMLElement.prototype,"offsetParent","get").mockReturnValue(document.body);
  last.focus();fireEvent.keyDown(last,{key:"Tab"});expect(close).toHaveFocus();
  fireEvent.keyDown(close,{key:"Tab",shiftKey:true});expect(last).toHaveFocus();
  for(const name of ["来源输入","portal输入"]){fireEvent.keyDown(screen.getByRole("textbox",{name}),{key:"Escape"});expect(outer).not.toHaveAttribute("hidden");}
  fireEvent.keyDown(outer,{key:"Escape"});expect(outer).toHaveAttribute("hidden");
});

it("T1342 已defaultPrevented的键盘事件与宽栏Escape仍由原消费者拥有",()=>{
  const h=lifetimeFixture();const panel=h.container.querySelector('[data-slot="draft-chat-rail"]')!;
  fireEvent.keyDown(panel,{key:"Escape"});expect(panel).not.toHaveAttribute("hidden");
  viewport(1024);fireEvent.click(screen.getByRole("button",{name:"打开编导"}));
  const event=new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true});event.preventDefault();fireEvent(panel,event);
  expect(panel).not.toHaveAttribute("hidden");
});


function realAssistantFixture() {
  let publish: (() => void) | undefined;
  function Control() { const {openChat}=useDraftChatRequest(); React.useEffect(()=>{publish=()=>openChat({prefill:"本轮原请求",autoSend:true});return()=>{publish=undefined;};},[openChat]); return null; }
  function Assistant() {
    const {request}=useDraftChatRequest();
    return <AICopilotContent embed={{surface:"project",persistKey:"project:project-a",selection:{kind:"project",id:"project-a",title:"同项目稿面"},title:"编导对话",request}}/>;
  }
  const view=render(<DraftChatRequestProvider><Control/><DraftResizableLayout left={<p>原脚本</p>} right={<Assistant/>}/></DraftChatRequestProvider>);
  return {...view,request:()=>act(()=>publish!())};
}

it("T1342 真实AICopilot已处理nonce在开关和断点后不重复走SDK发送边界，新nonce仅一次",async()=>{
  const h=realAssistantFixture();h.request();
  await waitFor(()=>expect(assistantBoundary.send).toHaveBeenCalledOnce(),{timeout:120000});
  fireEvent.click(screen.getByRole("button",{name:"收起编导栏"}));
  fireEvent.click(screen.getByRole("button",{name:"展开编导栏"}));
  viewport(1024);fireEvent.click(screen.getByRole("button",{name:"打开编导"}));
  fireEvent.keyDown(screen.getByRole("dialog",{name:"编导对话"}),{key:"Escape"});viewport(1366);
  await act(async()=>{await Promise.resolve();});
  expect(assistantBoundary.send).toHaveBeenCalledOnce();h.request();
  await waitFor(()=>expect(assistantBoundary.send).toHaveBeenCalledTimes(2),{timeout:120000});
  expect(screen.queryByRole("menu",{name:"历史会话"})).not.toBeInTheDocument();
});

it("T1342 真实AICopilot隐藏保原单在途8秒feed，重开不叠加且终态停",async()=>{
  let resolveFirst!:(rows:unknown[])=>void,resolveSecond!:(rows:unknown[])=>void;
  assistantBoundary.listTasks.mockImplementationOnce(()=>new Promise(resolve=>{resolveFirst=resolve;}))
    .mockImplementationOnce(()=>new Promise(resolve=>{resolveSecond=resolve;}));
  const h=realAssistantFixture();
  await waitFor(()=>expect(assistantBoundary.listTasks).toHaveBeenCalledOnce(),{timeout:120000});
  const task={id:"fixture-original-task",taskType:"script.review",status:"running",inputData:{kind:"script.review"},progress:0,createdAt:"2026-10-18T00:00:00Z",updatedAt:"2026-10-18T00:00:00Z",error:null};
  vi.useFakeTimers();
  await act(async()=>{resolveFirst([task]);});
  try {
    fireEvent.click(screen.getByRole("button",{name:"收起编导栏"}));
    await act(async()=>{await vi.advanceTimersByTimeAsync(8000);});
    expect(assistantBoundary.listTasks).toHaveBeenCalledTimes(2);
    await act(async()=>{await vi.advanceTimersByTimeAsync(24000);});
    expect(assistantBoundary.listTasks).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button",{name:"展开编导栏"}));
    viewport(1024);fireEvent.click(screen.getByRole("button",{name:"打开编导"}));
    fireEvent.keyDown(screen.getByRole("dialog",{name:"编导对话"}),{key:"Escape"});viewport(1366);
    expect(assistantBoundary.listTasks).toHaveBeenCalledTimes(2);
    await act(async()=>{resolveSecond([{...task,status:"succeeded",progress:100}]);});
    await act(async()=>{await vi.advanceTimersByTimeAsync(24000);});
    expect(assistantBoundary.listTasks).toHaveBeenCalledTimes(2);
    expect(assistantBoundary.send).not.toHaveBeenCalled();
  } finally {h.unmount();vi.useRealTimers();}
});


it("T1342 desktop原收起时窄窗打开后切回1280，焦点落可见桌面展开入口而不留hidden面板",async()=>{
  localStorage.setItem(COLLAPSE_KEY,"1");const h=lifetimeFixture();
  const panel=h.container.querySelector('[data-slot="draft-chat-rail"]')!;
  expect(panel).toHaveAttribute("hidden");viewport(1024);
  fireEvent.click(screen.getByRole("button",{name:"打开编导"}));
  const close=screen.getByRole("button",{name:"收起编导栏"});
  await waitFor(()=>expect(close).toHaveFocus(),{timeout:120000});
  h.request();expect(h.events.consumedNonces).toEqual([1]);viewport(1280);
  expect(h.container.querySelector('[data-slot="draft-chat-rail"]')).toBe(panel);
  expect(panel).toHaveAttribute("hidden");expect(panel).toHaveAttribute("inert");
  const expand=screen.getByRole("button",{name:"展开编导栏"});
  await waitFor(()=>expect(expand).toHaveFocus(),{timeout:120000});
  expect(localStorage.getItem(COLLAPSE_KEY)).toBe("1");
  expect(h.events).toEqual({mounts:1,unmounts:0,consumedNonces:[1]});
});
