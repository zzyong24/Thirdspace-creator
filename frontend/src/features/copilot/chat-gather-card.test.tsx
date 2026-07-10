import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// [T-084a] ChatGatherCard 诚实降级 UI:
//   - grounding=model_memory → 头部黄条「未配置联网搜索…需核实」+「去设置配联网搜索」链接。
//   - 带 sourceUrl 的条目 → 可点域名链接(新窗打开真实来源)。
//   - 无 sourceUrl 的条目 → 「需核实」徽标(非查证过的真信源)。
//   - grounding=web → 不显黄条,头部文案「联网搜到素材」。

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/contract-client", () => ({
  client: {
    createKnowledge: vi.fn(),
    createMaterialLink: vi.fn(),
  },
}));

import { ChatGatherCard } from "./chat-gather-card";

afterEach(() => cleanup());

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
  it("grounding=model_memory → 显黄条 + 去设置链接", () => {
    render(
      <ChatGatherCard
        items={[MEMORY_ITEM]}
        projectId="p-1"
        grounding="model_memory"
      />,
    );
    const warn = document.querySelector('[data-slot="chat-gather-warning"]');
    expect(warn).not.toBeNull();
    // [Bug-12 T-026] 措辞更新:明示「浏览器/RSS 免 key」与「付费 API」两条路径,不再让人误以为要再配模型。
    expect(warn?.textContent).toContain("本轮素材来自模型记忆");
    expect(warn?.textContent).toContain("来源需自行核实");
    expect(warn?.textContent).toContain("浏览器抓取 Bing");
    expect(warn?.textContent).toContain("RSS 订阅");
    // 去设置链接指向 models 面板 + 联网搜索 capability(深链到搜索项,免用户再找)。
    const link = warn?.querySelector("a");
    expect(link?.getAttribute("href")).toBe(
      "/settings?tab=models&capability=web.search",
    );
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
