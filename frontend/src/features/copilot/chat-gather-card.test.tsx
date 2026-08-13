import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [T-084a/T-684] ChatGatherCard 诚实失败 UI:
//   - grounding=unavailable → 头部黄条明确浏览器搜索失败,绝不拿模型记忆冒充联网结果。
//   - 带 sourceUrl 的条目 → 可点域名链接(新窗打开真实来源)。
//   - 无 sourceUrl 的条目 → 「需核实」徽标(非查证过的真信源)。
//   - grounding=web → 不显黄条,头部文案「联网找到资料」。
// [T-813] 搜索结果只是线索：只能阅读全文，读成功后才由 web.read 卡保存。

import { ChatGatherCard } from "./chat-gather-card";

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
});

const WEB_ITEM = {
  title: "案例：RAG 客服复盘",
  url: "https://blog.example.com/rag",
  source: "example.com",
  whyRelevant: "同赛道落地",
  category: "案例",
  sourceUrl: "https://blog.example.com/rag",
};
const MEMORY_ITEM = {
  title: "数据：知识工作者每天 28% 时间找信息",
  url: "",
  source: "需核实",
  whyRelevant: "",
  category: "数据",
};

describe("ChatGatherCard — T-084a/T-684 诚实失败", () => {
  it("grounding=unavailable → 显真实失败提示且不渲染模型记忆素材", () => {
    render(
      <ChatGatherCard
        items={[]}
        projectId="p-1"
        grounding="unavailable"
      />,
    );
    const warn = document.querySelector('[data-slot="chat-gather-warning"]');
    expect(warn).not.toBeNull();
    expect(warn?.textContent).toContain("本轮浏览器搜索失败");
    expect(warn?.textContent).toContain("没有用模型记忆伪造素材");
    expect(warn?.querySelector("a")).toBeNull();
    expect(screen.queryByText(MEMORY_ITEM.title)).toBeNull();
    expect(
      document.querySelector('[data-slot="chat-gather-source-link"]'),
    ).toBeNull();
  });

  it("grounding=web → 不显黄条,带 sourceUrl 条目渲可点域名链接(新窗)", () => {
    render(
      <ChatGatherCard items={[WEB_ITEM]} projectId="p-1" grounding="web" />,
    );
    expect(
      document.querySelector('[data-slot="chat-gather-warning"]'),
    ).toBeNull();
    const link = document.querySelector<HTMLAnchorElement>(
      '[data-slot="chat-gather-source-link"]',
    );
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("https://blog.example.com/rag");
    expect(link?.getAttribute("target")).toBe("_blank");
    // 链接文案是去 www 的域名。
    expect(link?.textContent).toContain("blog.example.com");
    // web 头部文案。
    expect(screen.getByText(/联网找到资料/)).toBeTruthy();
  });

  it("grounding 缺省 → 默认 unavailable(显黄条,诚实失败)", () => {
    render(<ChatGatherCard items={[MEMORY_ITEM]} projectId="p-1" />);
    expect(
      document.querySelector('[data-slot="chat-gather-warning"]'),
    ).not.toBeNull();
  });
});

describe("ChatGatherCard — T-813 先读后存", () => {
  it("真实 URL 只显示阅读全文，不显示单条/批量保存", () => {
    render(
      <ChatGatherCard
        items={[WEB_ITEM, { ...WEB_ITEM, title: "第二条素材" }]}
        projectId="p-1"
        grounding="web"
        onRead={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("button", { name: "阅读全文" })).toHaveLength(2);
    expect(screen.queryByText(/保存到项目/)).toBeNull();
    expect(screen.queryByText(/保存选中/)).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("点击阅读全文把该卡精确 URL 交给对话层", async () => {
    const user = userEvent.setup();
    const onRead = vi.fn();
    render(
      <ChatGatherCard
        items={[WEB_ITEM]}
        projectId="p-1"
        grounding="web"
        onRead={onRead}
      />,
    );
    await user.click(screen.getByRole("button", { name: "阅读全文" }));
    expect(onRead).toHaveBeenCalledTimes(1);
    expect(onRead).toHaveBeenCalledWith("https://blog.example.com/rag");
  });

  it("无真实 URL 的线索只显示需核实，不出现阅读全文", () => {
    render(
      <ChatGatherCard
        items={[MEMORY_ITEM]}
        projectId="p-1"
        grounding="unavailable"
        onRead={vi.fn()}
      />,
    );
    expect(screen.getByText("需核实")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "阅读全文" })).toBeNull();
  });

  it("对话正在生成时禁用阅读全文", () => {
    render(
      <ChatGatherCard
        items={[WEB_ITEM]}
        projectId={null}
        grounding="web"
        onRead={vi.fn()}
        reading
      />,
    );
    expect(screen.getByRole("button", { name: "阅读中…" })).toBeDisabled();
  });
});
