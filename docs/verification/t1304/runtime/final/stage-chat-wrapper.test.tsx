import * as React from "react";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { StageChatWrapper } from "./stage-chat-wrapper";
import {
  DraftChatRequestProvider,
  useDraftChatRequest,
} from "@/features/draft-workbench/draft-chat-request";
const route = vi.hoisted(() => ({ path: "/projects/p/article", extra: null as null | (() => React.ReactNode) }));
vi.mock("next/navigation", () => ({ usePathname: () => route.path }));
vi.mock("@/features/draft-workbench/draft-chat-rail", () => ({
  DraftChatRail: ({ projectId }: { projectId: string }) => (
    <div data-testid="director">
      project:{projectId}
      <button>对话动作</button><input aria-label="未发送的编导输入" defaultValue=""/>
      {route.extra?.()}
    </div>
  ),
}));
beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem("creatoros:stage:rail-width");
  localStorage.removeItem("creatoros:stage:rail-collapsed");
  window.matchMedia = vi.fn((query) => ({ matches: false, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn() }) as any);
  route.path = "/projects/p/article";
  route.extra = null;
});
afterEach(() => vi.unstubAllGlobals());
function measuredContainer(initialWidth:number) {
  let width=initialWidth;
  let resized=()=>{};
  vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockImplementation(() => ({
    width,height:900,left:0,top:0,right:width,bottom:900,x:0,y:0,toJSON:()=>({}),
  }));
  vi.stubGlobal("ResizeObserver",class {
    constructor(callback:()=>void){resized=callback;}
    observe(){} unobserve(){} disconnect(){}
  });
  return (next:number)=>{width=next;act(()=>resized());};
}
it("1366可用容器给编辑区720px，实际右栏限制后恢复原640偏好", () => {
  const resize=measuredContainer(1046);
  localStorage.setItem("creatoros:stage:rail-width","640");
  render(<StageChatWrapper projectId="p" projectTitle="项目"><p>编辑区</p></StageChatWrapper>);
  const rail=screen.getByLabelText("编导对话"),handle=screen.getByRole("separator");
  expect(rail).toHaveStyle({width:"320px"});
  expect(handle).toHaveAttribute("aria-valuenow","320");
  expect(handle).toHaveAttribute("aria-valuemax","320");
  expect(localStorage.getItem("creatoros:stage:rail-width")).toBe("640");
  resize(1500);
  expect(rail).toHaveStyle({width:"640px"});
  expect(handle).toHaveAttribute("aria-valuenow","640");
});
it("受限空间键盘和拖拽按实际宽度响应，空间不足使用同一编导弹层", async () => {
  const resize=measuredContainer(1046);
  render(<StageChatWrapper projectId="p" projectTitle="项目"><p>编辑区</p></StageChatWrapper>);
  const handle=screen.getByRole("separator");
  fireEvent.keyDown(handle,{key:"ArrowRight"});
  expect(handle).toHaveAttribute("aria-valuenow","304");
  expect(localStorage.getItem("creatoros:stage:rail-width")).toBe("304");
  fireEvent.keyDown(handle,{key:"ArrowLeft"});
  expect(handle).toHaveAttribute("aria-valuenow","320");
  fireEvent.keyDown(handle,{key:"ArrowLeft"});
  expect(handle).toHaveAttribute("aria-valuenow","320");
  fireEvent.pointerDown(handle,{pointerId:1});
  fireEvent(handle,new MouseEvent("pointermove",{bubbles:true,clientX:740}));
  fireEvent.pointerUp(handle,{pointerId:1});
  expect(handle).toHaveAttribute("aria-valuenow","306");
  expect(localStorage.getItem("creatoros:stage:rail-width")).toBe("306");
  resize(1000);
  expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  expect(screen.queryByTestId("director")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"打开编导"}));
  expect(await screen.findByRole("dialog",{name:"编导对话"})).toBeVisible();
  expect(screen.getAllByTestId("director")).toHaveLength(1);
});
it.each([
  "/projects/p/article",
  "/projects/p/outputs/real-graphic/image",
  "/projects/p/review",
])("真实文章/图文/复盘路由 %s 使用一个同项目编导", (path) => {
  route.path = path;
  render(
    <StageChatWrapper projectId="p" projectTitle="项目">
      <p>稿件</p>
    </StageChatWrapper>,
  );
  expect(screen.getAllByTestId("director")).toHaveLength(1);
  expect(screen.getByTestId("director")).toHaveTextContent("project:p");
});
it("脚本既有栏由稿面保留，阶段容器不重复挂载或截断原flex高度链", () => {
  route.path = "/projects/p";
  const {container}=render(
    <StageChatWrapper projectId="p" projectTitle="项目">
      <p>稿面原栏</p>
    </StageChatWrapper>,
  );
  expect(screen.queryByTestId("director")).not.toBeInTheDocument();
  expect(screen.getByText("稿面原栏").parentElement).toBe(container);
});

it("从脚本进入作品后才挂容器测量，不保留未挂载的旧observer", () => {
  const resize=measuredContainer(1046);
  route.path="/projects/p";
  const view=render(<StageChatWrapper projectId="p" projectTitle="项目"><p>稿件</p></StageChatWrapper>);
  route.path="/projects/p/article";
  view.rerender(<StageChatWrapper projectId="p" projectTitle="项目"><p>稿件</p></StageChatWrapper>);
  expect(screen.getByLabelText("编导对话")).toHaveStyle({width:"320px"});
  resize(1000);
  expect(screen.queryByTestId("director")).not.toBeInTheDocument();
  expect(screen.getByRole("button",{name:"打开编导"})).toBeVisible();
});
it("窄屏本地打开编导，可 Escape 关闭并回到原按钮", async () => {
  window.matchMedia = vi.fn(
    (query) =>
      ({
        matches: true,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as any,
  );
  render(
    <StageChatWrapper projectId="p" projectTitle="项目">
      <button>稿件操作</button>
    </StageChatWrapper>,
  );
  expect(screen.queryByTestId("director")).not.toBeInTheDocument();
  const open = screen.getByRole("button", { name: "打开编导" });
  fireEvent.click(open);
  const dialog = await screen.findByRole("dialog", { name: "编导对话" });
  expect(dialog).toHaveAttribute("aria-modal", "true");
  // 683×512 实际浏览器复现：弹层扣除桌面顶部64px会裁到发送按钮。
  // jsdom 不做几何布局；这里守容器策略，实际可见性另保留浏览器截图。
  expect(dialog.firstElementChild).toHaveClass("h-full", "overflow-y-auto");
  expect(dialog.firstElementChild).not.toHaveClass("h-[calc(100vh-4rem)]");
  expect(screen.getAllByTestId("director")).toHaveLength(1);
  expect(screen.getByText("稿件操作").parentElement).toHaveAttribute("inert");
  fireEvent.keyDown(dialog, { key: "Escape" });
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "打开编导" })).toHaveFocus(),
  );
});
it("窄屏新请求展开本地栏，无整页导航", async () => {
  window.matchMedia = vi.fn(
    (query) =>
      ({
        matches: true,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as any,
  );
  function Sender() {
    const chat = useDraftChatRequest();
    return (
      <button onClick={() => chat.openChat({ prefill: "精简第二段" })}>
        微调稿件
      </button>
    );
  }
  render(
    <DraftChatRequestProvider>
      <StageChatWrapper projectId="p" projectTitle="项目">
        <Sender />
      </StageChatWrapper>
    </DraftChatRequestProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "微调稿件" }));
  expect(await screen.findByRole("dialog", { name: "编导对话" })).toBeVisible();
});

function narrowKeyboardHost(extra?:()=>React.ReactNode){
 window.matchMedia=vi.fn(query=>({matches:true,media:query,addEventListener:vi.fn(),removeEventListener:vi.fn()}) as any);
 // jsdom 无布局；仅补 offsetParent 可见性，不改事件、Portal 或 defaultPrevented。
 vi.spyOn(HTMLElement.prototype,'offsetParent','get').mockImplementation(function(this:HTMLElement){return this.parentElement;});
 route.extra=extra??null;
 const view=render(<StageChatWrapper projectId="p" projectTitle="项目"><p>稿件</p></StageChatWrapper>);
 fireEvent.click(screen.getByRole('button',{name:'打开编导'}));
 return {view,outer:screen.getByRole('dialog',{name:'编导对话'})};
}
it('T1304 外栏自有Tab及ShiftTab仍在真实首尾循环',()=>{
 const {outer}=narrowKeyboardHost();
 const first=screen.getByRole('button',{name:'收起编导栏'}),last=screen.getByRole('textbox',{name:'未发送的编导输入'});
 last.focus();fireEvent.keyDown(last,{key:'Tab'});expect(first).toHaveFocus();
 fireEvent.keyDown(first,{key:'Tab',shiftKey:true});expect(last).toHaveFocus();
 fireEvent.keyDown(outer,{key:'Escape'});expect(screen.queryByRole('dialog',{name:'编导对话'})).toBeNull();
});
it.each(['Escape','Tab'])('T1304 子控件实际消费%s后外栏不再次处理',key=>{
 const {outer}=narrowKeyboardHost(()=> <input aria-label="已有键盘处理" onKeyDown={event=>event.preventDefault()}/>);
 const input=screen.getByRole('textbox',{name:'已有键盘处理'});input.focus();
 fireEvent.keyDown(input,{key});
 expect(screen.queryByRole('dialog',{name:'编导对话'})).toBe(outer);expect(input).toHaveFocus();
});
it.each([['dialog','Escape'],['dialog','Tab'],['alertdialog','Escape'],['alertdialog','Tab']] as const)('T1304 inline嵌套%s拥有自己的%s，不由外栏消费',(role,key)=>{
 const {outer}=narrowKeyboardHost(()=> <section role={role} aria-label="内联任务"><input aria-label="内联任务输入"/></section>);
 const input=screen.getByRole('textbox',{name:'内联任务输入'});input.focus();
 const nativeEvent=new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});
 fireEvent(input,nativeEvent);
 expect(nativeEvent.defaultPrevented).toBe(false);
 expect(screen.queryByRole('dialog',{name:'编导对话'})).toBe(outer);expect(input).toHaveFocus();
});
it('T1304 外栏关闭后卸载不回焦点到已失效节点',async()=>{
 const {view,outer}=narrowKeyboardHost();
 fireEvent.keyDown(outer,{key:'Escape'});view.unmount();
 await act(async()=>{await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));});
 expect(document.activeElement?.isConnected).toBe(true);expect(screen.queryByRole('dialog')).toBeNull();
});
it('T1304 关闭后离开阶段再切对象，焦点只落在仍挂载的当前入口',async()=>{
 const {view,outer}=narrowKeyboardHost();fireEvent.keyDown(outer,{key:'Escape'});
 route.path='/projects/p';view.rerender(<StageChatWrapper projectId="p" projectTitle="原项目"><p>原稿面</p></StageChatWrapper>);
 await act(async()=>{await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));});
 expect(screen.queryByRole('button',{name:'打开编导'})).toBeNull();expect(document.activeElement?.isConnected).toBe(true);
 route.path='/projects/q/outputs/new-image/image';view.rerender(<StageChatWrapper projectId="q" projectTitle="新项目"><p>新作品</p></StageChatWrapper>);
 fireEvent.click(screen.getByRole('button',{name:'打开编导'}));expect(screen.getByTestId('director')).toHaveTextContent('project:q');
 fireEvent.keyDown(screen.getByRole('dialog',{name:'编导对话'}),{key:'Escape'});
 await waitFor(()=>expect(screen.getByRole('button',{name:'打开编导'})).toHaveFocus(),{timeout:120000});
});
it('T1304 宽栏自身Escape与Tab保持原本不接管行为',()=>{
 measuredContainer(1500);render(<StageChatWrapper projectId="p" projectTitle="项目"><p>稿件</p></StageChatWrapper>);
 const rail=screen.getByLabelText('编导对话'),input=screen.getByRole('textbox',{name:'未发送的编导输入'});input.focus();
 fireEvent.keyDown(input,{key:'Escape'});fireEvent.keyDown(input,{key:'Tab'});
 expect(screen.getByLabelText('编导对话')).toBe(rail);expect(input).toHaveFocus();
});

type SessionHandle = { readDraft: () => string };
function SessionProbe({ handleRef, mounted, unmounted }: {
  handleRef: React.RefObject<SessionHandle | null>;
  mounted: () => void;
  unmounted: () => void;
}) {
  const [draft, setDraft] = React.useState("原始工程");
  const draftRef = React.useRef(draft);
  const handle = React.useRef<SessionHandle>({ readDraft: () => draftRef.current });
  React.useEffect(() => { draftRef.current = draft; }, [draft]);
  React.useEffect(() => {
    handleRef.current = handle.current;
    mounted();
    return unmounted;
  }, [handleRef, mounted, unmounted]);
  return <input aria-label="剪辑工程未保存名称" value={draft} onChange={event => setDraft(event.target.value)} />;
}

it.each([true, false])("显式 active 初值 %s 的常驻剪辑器切页后保留 DOM、句柄和未保存稿", initialActive => {
  route.path = initialActive ? "/projects/p/production" : "/accounts";
  const mounted = vi.fn(), unmounted = vi.fn();
  const handleRef = React.createRef<SessionHandle>();
  const session = <SessionProbe key="same-native-session" handleRef={handleRef} mounted={mounted} unmounted={unmounted} />;
  const view = render(<StageChatWrapper active={initialActive} projectId="p" projectTitle="项目">{session}</StageChatWrapper>);
  const editor = screen.getByRole("textbox", { name: "剪辑工程未保存名称" });
  const handle = handleRef.current;
  fireEvent.change(editor, { target: { value: "切页前的未保存工程" } });

  for (const active of initialActive ? [false, true] : [true, false, true]) {
    route.path = active ? "/projects/p/production" : "/accounts";
    view.rerender(<StageChatWrapper active={active} projectId="p" projectTitle="项目">{session}</StageChatWrapper>);
    expect(screen.getByRole("textbox", { name: "剪辑工程未保存名称" })).toBe(editor);
    expect(editor).toHaveValue("切页前的未保存工程");
    expect(handleRef.current).toBe(handle);
    expect(handle?.readDraft()).toBe("切页前的未保存工程");
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(unmounted).not.toHaveBeenCalled();
    expect(screen.getByTestId("director")).toBeInTheDocument();
    expect(screen.getByTestId("director").closest("aside")?.hidden).toBe(!active);
  }
  view.unmount();
  expect(unmounted).toHaveBeenCalledTimes(1);
});

it("未传 active 的无栏稿面保持原透传结构和同 key 状态", () => {
  route.path = "/projects/p";
  const mounted = vi.fn(), unmounted = vi.fn();
  const handleRef = React.createRef<SessionHandle>();
  const session = <SessionProbe key="same-draft-session" handleRef={handleRef} mounted={mounted} unmounted={unmounted} />;
  const view = render(<StageChatWrapper projectId="p" projectTitle="项目">{session}</StageChatWrapper>);
  const editor = screen.getByRole("textbox", { name: "剪辑工程未保存名称" });
  const handle = handleRef.current;
  fireEvent.change(editor, { target: { value: "稿面原未保存内容" } });
  route.path = "/accounts";
  view.rerender(<StageChatWrapper projectId="p" projectTitle="项目">{session}</StageChatWrapper>);
  expect(editor.parentElement).toBe(view.container);
  expect(screen.getByRole("textbox", { name: "剪辑工程未保存名称" })).toBe(editor);
  expect(editor).toHaveValue("稿面原未保存内容");
  expect(handleRef.current).toBe(handle);
  expect(mounted).toHaveBeenCalledTimes(1);
  expect(unmounted).not.toHaveBeenCalled();
  expect(screen.queryByTestId("director")).not.toBeInTheDocument();
});

it('常驻视频切页只隐藏唯一编导，未发送输入和DOM实例保留',()=>{
 route.path='/projects/p/production';const view=render(<StageChatWrapper active projectId="p" projectTitle="项目"><p>当前视频</p></StageChatWrapper>);
 const input=screen.getByLabelText('未发送的编导输入');fireEvent.change(input,{target:{value:'还没有发送的剪辑要求'}});
 view.rerender(<StageChatWrapper active={false} projectId="p" projectTitle="项目"><p>当前视频</p></StageChatWrapper>);
 expect(screen.getByLabelText('未发送的编导输入')).toBe(input);
 view.rerender(<StageChatWrapper active projectId="p" projectTitle="项目"><p>当前视频</p></StageChatWrapper>);
 expect(screen.getByLabelText('未发送的编导输入')).toHaveValue('还没有发送的剪辑要求');expect(screen.getAllByTestId('director')).toHaveLength(1);
});
