import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [T-084a] ChatGatherCard 诚实降级 UI:
//   - grounding=model_memory → 头部黄条诚实提示未取得实时检索结果,不暴露内部搜索配置。
//   - 带 sourceUrl 的条目 → 可点域名链接(新窗打开真实来源)。
//   - 无 sourceUrl 的条目 → 「需核实」徽标(非查证过的真信源)。
//   - grounding=web → 不显黄条,头部文案「联网搜到素材」。
// [T-264] 批量入库门:每条可勾选,「存入选中 N 条」一次 persist + 一次 refresh。

const createKnowledge = vi.fn();
const createMaterialLink = vi.fn();
const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/contract-client", () => ({
  client: {
    createKnowledge: (...a: unknown[]) => createKnowledge(...a),
    createMaterialLink: (...a: unknown[]) => createMaterialLink(...a),
  },
}));

import { ChatGatherCard } from "./chat-gather-card";

afterEach(() => cleanup());
beforeEach(() => {
  createKnowledge.mockReset();
  createKnowledge.mockResolvedValue({ id: "k-1" });
  createMaterialLink.mockReset();
  createMaterialLink.mockResolvedValue({ id: "ml-1" });
  routerRefresh.mockReset();
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

describe("ChatGatherCard — T-084a 诚实降级", () => {
  it("grounding=model_memory → 显诚实黄条且不引导配置内部搜索能力", () => {
    render(
      <ChatGatherCard
        items={[MEMORY_ITEM]}
        projectId="p-1"
        grounding="model_memory"
      />,
    );
    const warn = document.querySelector('[data-slot="chat-gather-warning"]');
    expect(warn).not.toBeNull();
    expect(warn?.textContent).toContain("本轮未取得实时检索结果");
    expect(warn?.textContent).toContain("模型记忆");
    expect(warn?.textContent).toContain("来源需自行核实");
    expect(warn?.querySelector("a")).toBeNull();
    // 无 sourceUrl → 「需核实」徽标(不渲链接)。
    expect(
      document.querySelector('[data-slot="chat-gather-needs-check"]'),
    ).not.toBeNull();
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
    expect(screen.getByText(/联网搜到素材/)).toBeTruthy();
  });

  it("grounding 缺省 → 默认 model_memory(显黄条,诚实兜底)", () => {
    render(<ChatGatherCard items={[MEMORY_ITEM]} projectId="p-1" />);
    expect(
      document.querySelector('[data-slot="chat-gather-warning"]'),
    ).not.toBeNull();
  });
});

describe("ChatGatherCard — T-264 批量入库", () => {
  it("有项目 + ≥2 条 → 渲批量门;「存入选中 N 条」逐条 persist 但只 refresh 一次", async () => {
    const user = userEvent.setup();
    render(
      <ChatGatherCard
        items={[WEB_ITEM, { ...WEB_ITEM, title: "第二条素材" }]}
        projectId="p-1"
        grounding="web"
      />,
    );
    await user.click(screen.getByText("存入选中 2 条"));
    // 两条各 create 一次 knowledge + 一次 materialLink。
    await vi.waitFor(() => expect(createKnowledge).toHaveBeenCalledTimes(2));
    expect(createMaterialLink).toHaveBeenCalledTimes(2);
    // 关键:批量只刷新一次(而非逐条 N 次)。
    expect(routerRefresh).toHaveBeenCalledTimes(1);
  });

  it("取消勾选一条 → 批量按钮条数跟着变,未选中的不入库", async () => {
    const user = userEvent.setup();
    render(
      <ChatGatherCard
        items={[WEB_ITEM, { ...WEB_ITEM, title: "第二条素材" }]}
        projectId="p-1"
        grounding="web"
      />,
    );
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]); // 取消第 1 条
    await user.click(screen.getByText("存入选中 1 条"));
    await vi.waitFor(() => expect(createKnowledge).toHaveBeenCalledTimes(1));
    expect(createKnowledge.mock.calls[0][0].body.title).toBe("第二条素材");
  });

  it("无项目 → 不渲批量门(存不进弹药)", () => {
    render(
      <ChatGatherCard
        items={[WEB_ITEM, { ...WEB_ITEM, title: "第二条素材" }]}
        projectId={null}
        grounding="web"
      />,
    );
    expect(
      document.querySelector('[data-slot="chat-gather-batch"]'),
    ).toBeNull();
  });
});
