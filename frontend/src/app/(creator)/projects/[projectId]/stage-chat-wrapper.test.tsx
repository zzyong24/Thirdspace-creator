import * as React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { it, expect, vi, beforeEach } from "vitest";
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
  route.path = "/projects/p/article";
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
it("脚本既有栏由稿面保留，阶段容器不重复挂载", () => {
  route.path = "/projects/p";
  render(
    <StageChatWrapper projectId="p" projectTitle="项目">
      <p>稿面原栏</p>
    </StageChatWrapper>,
  );
  expect(screen.queryByTestId("director")).not.toBeInTheDocument();
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
