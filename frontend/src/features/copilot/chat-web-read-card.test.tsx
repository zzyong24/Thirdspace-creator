import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const commitPendingAsset = vi.fn();
const createMaterialLink = vi.fn();
const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));
vi.mock("@/lib/contract-client", () => ({
  client: {
    commitPendingAsset: (...args: unknown[]) => commitPendingAsset(...args),
    createMaterialLink: (...args: unknown[]) => createMaterialLink(...args),
  },
}));

import { ChatWebReadCard } from "./chat-web-read-card";

const ASSET = {
  id: "asset-web-1",
  name: "正文·Harness",
  previewUrl: null,
  sourceUrl: "https://example.com/harness",
  title: "Harness 正文",
  excerpt: "这是正文开头，不是搜索摘要。",
  extractor: "readability",
};

afterEach(() => cleanup());
beforeEach(() => {
  commitPendingAsset.mockReset();
  commitPendingAsset.mockResolvedValue({ id: ASSET.id, status: "active" });
  createMaterialLink.mockReset();
  createMaterialLink.mockResolvedValue({ id: "link-1" });
  routerRefresh.mockReset();
});

describe("ChatWebReadCard — T-813 阅读后保存", () => {
  it("明确需登录时直达网站登录保管库，而不是只跳到设置首页", () => {
    render(
      <ChatWebReadCard
        asset={null}
        needLogin={{ domain: "example.com" }}
        error={null}
        projectId={null}
      />,
    );
    const link = screen.getByRole("link", { name: /去网站登录保管库/ });
    expect(link.getAttribute("href")).toBe(
      "/settings?highlight=web-session-vault",
    );
  });

  it("网站被拒时用简短行动提示替代内部恢复说明，并建议先登录", () => {
    render(
      <ChatWebReadCard
        asset={null}
        needLogin={null}
        error={
          "页面返回 HTTP 403:该链接不可访问——已自动用搜索引擎找到可能的替代来源(见 alternates 列表),用 web.read 读取"
        }
        httpStatus={403}
        loginSuggested
        projectId={null}
      />,
    );
    expect(screen.getByText(/当前没有拿到原文/)).toBeTruthy();
    expect(screen.getByText(/HTTP 403/)).toBeTruthy();
    expect(screen.queryByText(/alternates 列表/)).toBeNull();
    expect(screen.queryByText(/web\.read/)).toBeNull();
    const link = screen.getByRole("link", { name: /前往网站登录/ });
    expect(link.getAttribute("href")).toBe(
      "/settings?highlight=web-session-vault",
    );
  });

  it("缺少 URL 这类输入错误不误导用户去登录", () => {
    render(
      <ChatWebReadCard
        asset={null}
        needLogin={null}
        error="没有收到要读取的 URL —— 请给一个网页链接。"
        httpStatus={null}
        loginSuggested={false}
        projectId={null}
      />,
    );
    expect(screen.getByText(/没有收到要读取的 URL/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /网站登录/ })).toBeNull();
  });

  it("成功卡显示临时上下文与准确覆盖度", () => {
    render(
      <ChatWebReadCard
        asset={ASSET}
        needLogin={null}
        error={null}
        projectId="p-1"
        window={{ offset: 0, length: 1200, total: 3200 }}
        hasMore
      />,
    );
    expect(screen.getByText(/当前对话临时上下文/)).toBeTruthy();
    expect(screen.getByText(/已读 1,200 \/ 共 3,200 字/)).toBeTruthy();
    expect(screen.getByText(/还有 2,000 字未读/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "保存到项目" })).toBeTruthy();
  });

  it("保存时按稳定 assetId 提交 expectedSourceUrl，再关联当前项目", async () => {
    const user = userEvent.setup();
    render(
      <ChatWebReadCard
        asset={ASSET}
        needLogin={null}
        error={null}
        projectId="p-1"
        window={{ offset: 0, length: 3200, total: 3200 }}
        hasMore={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: "保存到项目" }));
    await vi.waitFor(() => expect(createMaterialLink).toHaveBeenCalledTimes(1));
    expect(commitPendingAsset).toHaveBeenCalledWith({
      params: { assetId: ASSET.id },
      query: undefined,
      body: { expectedSourceUrl: ASSET.sourceUrl },
    });
    expect(createMaterialLink).toHaveBeenCalledWith({
      params: undefined,
      query: undefined,
      body: {
        projectId: "p-1",
        entityType: "asset",
        entityId: ASSET.id,
        role: "reference",
        stage: "script",
        addedByType: "ai",
      },
    });
    expect(screen.getByText("已保存到项目")).toBeTruthy();
  });

  it("素材确认成功但项目关联失败时显示分段错误并复用同一 asset 重试", async () => {
    const user = userEvent.setup();
    createMaterialLink
      .mockRejectedValueOnce(new Error("link down"))
      .mockResolvedValueOnce({ id: "link-1" });
    render(
      <ChatWebReadCard
        asset={ASSET}
        needLogin={null}
        error={null}
        projectId="p-1"
        window={{ offset: 0, length: 3200, total: 3200 }}
        hasMore={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: "保存到项目" }));
    expect(await screen.findByText(/素材已入库，项目关联失败/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "重试保存" }));
    await vi.waitFor(() => expect(createMaterialLink).toHaveBeenCalledTimes(2));
    expect(commitPendingAsset).toHaveBeenCalledTimes(2);
    expect(commitPendingAsset.mock.calls[1]?.[0].params.assetId).toBe(ASSET.id);
  });

  it("无项目时不显示保存按钮", () => {
    render(
      <ChatWebReadCard
        asset={ASSET}
        needLogin={null}
        error={null}
        projectId={null}
        window={{ offset: 0, length: 3200, total: 3200 }}
        hasMore={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "保存到项目" })).toBeNull();
    expect(screen.getByText(/@ 引用当前项目/)).toBeTruthy();
  });
});


describe("T-957 最终来源链接", () => {
  it("显示最终页面，采纳仍绑定原始来源", async () => {
    render(<ChatWebReadCard asset={{...ASSET, finalUrl: "https://docs.example.org/final"}} needLogin={null} error={null} projectId="project-1" />);
    expect(screen.getByRole("link", {name: /docs.example.org/}).getAttribute("href")).toBe("https://docs.example.org/final");
    await userEvent.click(screen.getByRole("button", {name: /保存到项目/}));
    expect(commitPendingAsset).toHaveBeenCalledWith({params:{assetId:ASSET.id},body:{expectedSourceUrl:ASSET.sourceUrl}});
  });
  it.each([undefined, "javascript:alert(1)", "data:text/html,hi", "https://user:secret@example.org/"])("旧记录或非法最终地址回退原来源：%s", (finalUrl) => {
    render(<ChatWebReadCard asset={{...ASSET,finalUrl}} needLogin={null} error={null} projectId={null} />);
    expect(screen.getByRole("link", {name: /example.com/}).getAttribute("href")).toBe(ASSET.sourceUrl);
  });
});

it.each([404,429,500,503])("T-957 历史HTTP %i回执即使建议登录也不能再显示登录入口或内部错误",status=>{
 render(<ChatWebReadCard asset={null} needLogin={null} error="fixture material.gather web.read alternates 内部恢复指令" httpStatus={status} loginSuggested projectId={null} />);
 expect(screen.queryByRole("link",{name:/网站登录/})).toBeNull();
 expect(screen.getByText(new RegExp(`HTTP ${status}`))).toBeTruthy();
 expect(screen.queryByText(/内部恢复指令/)).toBeNull();
});
it.each([401,403])("T-957 HTTP %i可以保留显式的可选登录建议",status=>{
 render(<ChatWebReadCard asset={null} needLogin={null} error="fixture" httpStatus={status} loginSuggested projectId={null} />);
 expect(screen.getByRole("link",{name:/前往网站登录/})).toBeTruthy();
});

it("T-957 确认登录墙优先于HTTP失败提示",()=>{
 render(<ChatWebReadCard asset={null} needLogin={{domain:"example.com"}} error="fixture" httpStatus={404} loginSuggested projectId={null} />);
 expect(screen.getByRole("link",{name:/去网站登录保管库/})).toBeTruthy();
});
it.each([null,0,302,600,NaN,401.5])("T-957 无效HTTP状态 %s 不能伪装成HTTP失败卡或登录依据",status=>{
 render(<ChatWebReadCard asset={null} needLogin={null} error="请输入有效链接" httpStatus={status} loginSuggested projectId={null} />);
 expect(screen.getByText("请输入有效链接")).toBeTruthy();
 expect(screen.queryByRole("link",{name:/网站登录/})).toBeNull();
});
