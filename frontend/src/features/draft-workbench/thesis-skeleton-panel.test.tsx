import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import { ThesisSkeletonPanel } from "./thesis-skeleton-panel";
import type { ThesisSkeletonNode } from "@/features/script/script-editor-data";

// [T-127] 稿面论点骨架面板。深链走 openChat(planning.thesis 到右栏编导对话)。
const openChat = vi.fn();
vi.mock("./draft-chat-request", () => ({
  useDraftChatRequest: () => ({ openChat }),
}));

const NODES: ThesisSkeletonNode[] = [
  { column: "core", title: "本地 AI 栈三步搭好", summary: "普通开发者也能自建" },
  { column: "support", title: "痛点真实", summary: "环境难配" },
  { column: "evidence", title: "实测数据", summary: "10 分钟跑通" },
  { column: "counter", title: "有人说太慢", summary: "量化模型可缓解" },
];

describe("ThesisSkeletonPanel (T-127)", () => {
  beforeEach(() => openChat.mockClear());

  it("空态(nodes=null)→ 诚实空态 + 「立论点」按钮", () => {
    render(<ThesisSkeletonPanel nodes={null} />);
    const panel = screen.getByRole("region", { name: "论点骨架" });
    expect(panel.getAttribute("data-has-thesis")).toBe("false");
    expect(
      within(panel).getByText(/还没立论点/),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole("button", { name: /立论点/ }),
    ).toBeInTheDocument();
  });

  it("空态(nodes=[])→ 同样诚实空态", () => {
    render(<ThesisSkeletonPanel nodes={[]} />);
    expect(
      screen.getByRole("region", { name: "论点骨架" }).getAttribute("data-has-thesis"),
    ).toBe("false");
  });

  it("有论点 → 渲核心论点 + 支撑/证据/反驳分支(锁定顺序)+ 「重新立论点」", () => {
    render(<ThesisSkeletonPanel nodes={NODES} />);
    const panel = screen.getByRole("region", { name: "论点骨架" });
    expect(panel.getAttribute("data-has-thesis")).toBe("true");
    // 四列都渲。
    const cols = within(panel).getAllByRole("generic").filter(
      (el) => el.getAttribute("data-slot") === "thesis-column",
    );
    expect(cols.map((c) => c.getAttribute("data-column"))).toEqual([
      "core",
      "support",
      "evidence",
      "counter",
    ]);
    expect(within(panel).getByText("本地 AI 栈三步搭好")).toBeInTheDocument();
    expect(within(panel).getByText("实测数据")).toBeInTheDocument();
    expect(
      within(panel).getByRole("button", { name: /重新立论点/ }),
    ).toBeInTheDocument();
  });

  it("点「立论点」→ openChat functionKey=planning.thesis + autoSend", () => {
    render(<ThesisSkeletonPanel nodes={null} />);
    fireEvent.click(screen.getByRole("button", { name: /立论点/ }));
    expect(openChat).toHaveBeenCalledTimes(1);
    expect(openChat.mock.calls[0][0]).toMatchObject({
      functionKey: "planning.thesis",
      autoSend: true,
    });
  });

  it("只有 core 时不渲空的其它列", () => {
    render(
      <ThesisSkeletonPanel
        nodes={[{ column: "core", title: "唯一核心", summary: "" }]}
      />,
    );
    const panel = screen.getByRole("region", { name: "论点骨架" });
    const cols = within(panel)
      .getAllByRole("generic")
      .filter((el) => el.getAttribute("data-slot") === "thesis-column");
    expect(cols).toHaveLength(1);
    expect(cols[0]!.getAttribute("data-column")).toBe("core");
  });
});
