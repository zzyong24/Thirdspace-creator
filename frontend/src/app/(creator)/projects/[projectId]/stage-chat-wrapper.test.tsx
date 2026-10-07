import * as React from "react";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { StageChatWrapper } from "./stage-chat-wrapper";
import {
  DraftChatRequestProvider,
  useDraftChatRequest,
} from "@/features/draft-workbench/draft-chat-request";
const route = vi.hoisted(() => ({ path: "/projects/p/article" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.path }));
vi.mock("@/features/draft-workbench/draft-chat-rail", () => ({
  DraftChatRail: ({ projectId }: { projectId: string }) => (
    <div data-testid="director">
      project:{projectId}
      <button>对话动作</button>
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
