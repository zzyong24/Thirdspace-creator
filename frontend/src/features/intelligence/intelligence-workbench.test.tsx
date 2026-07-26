import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  IntelligenceWorkbench,
  clampDetailWidth,
  favoriteFoldersErrorMessage,
  type RadarApi,
  type RadarItemDetail,
  type RadarWorkspace,
} from "./intelligence-workbench";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const workspace: RadarWorkspace = {
  collections: [
    {
      id: "collection-favorites",
      parentId: null,
      name: "我的收藏",
      kind: "system",
      sortOrder: 0,
      version: 1,
    },
    {
      id: "collection-darkhorse",
      parentId: null,
      name: "黑马发现",
      kind: "system",
      sortOrder: 1,
      version: 1,
    },
  ],
  sources: [],
  memberships: [],
  health: [],
  pendingCount: 0,
  blockedCount: 0,
};

const detail: RadarItemDetail = {
  item: {
    id: "item-1",
    type: "video",
    platform: "douyin",
    canonicalUrl: "https://www.douyin.com/video/1",
    authorName: "示例博主",
    title: "真实作品",
    summary: null,
    coverUrl: null,
    publishedAt: "2026-07-23T12:00:00.000Z",
    capturedAt: "2026-07-23T12:00:00.000Z",
  },
  metrics: [
    {
      id: "metric-1",
      capturedAt: "2026-07-23T12:00:00.000Z",
      likeCount: 1200,
      commentCount: null,
      collectCount: 23,
      shareCount: 8,
    },
  ],
  observations: [],
  snapshots: [],
  transcript: {
    itemId: "item-1",
    status: "not_requested",
    text: null,
    errorCode: null,
  },
  transforms: [],
};

function api(): RadarApi {
  return {
    previewProfile: vi.fn().mockResolvedValue({
      externalAccountId: "sec-example",
      nickname: "示例博主",
      avatarUrl: null,
      canonicalUrl: "https://www.douyin.com/user/sec-example",
      visibleWorkCount: 12,
      browserSessionRef: "douyin-profile:account-1",
    }),
    previewWeb: vi.fn().mockResolvedValue({
      type: "web",
      title: "示例网页",
      finalUrl: "https://example.com/final",
      samples: [],
      loginRequired: false,
      parser: "readable:readability",
      browserSessionRef: null,
    }),
    listFavoriteFolders: vi.fn().mockResolvedValue([]),
    createCollection: vi.fn().mockResolvedValue({}),
    createSource: vi.fn().mockResolvedValue({}),
    importDouyinShare: vi.fn().mockResolvedValue({
      item: detail.item,
      created: true,
    }),
    startRun: vi.fn().mockResolvedValue({
      run: {
        id: "run-1",
        sourceId: "source-1",
        trigger: "manual",
        status: "queued",
        startedAt: null,
        finishedAt: null,
        scannedCount: 0,
        newCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        errorCode: null,
        errorSummary: null,
        nextAction: "none",
        createdAt: "2026-07-24T00:00:00.000Z",
      },
      task: { id: "task-1", status: "queued" },
    }),
    listRuns: vi.fn().mockResolvedValue([]),
    getRun: vi.fn().mockResolvedValue({
      run: {
        id: "run-1",
        sourceId: "source-1",
        trigger: "manual",
        status: "succeeded_no_change",
        startedAt: "2026-07-24T00:00:00.000Z",
        finishedAt: "2026-07-24T00:00:01.000Z",
        scannedCount: 13,
        newCount: 0,
        updatedCount: 13,
        skippedCount: 0,
        failedCount: 0,
        errorCode: null,
        errorSummary: null,
        nextAction: "none",
        createdAt: "2026-07-24T00:00:00.000Z",
      },
      events: [],
    }),
    getItem: vi.fn().mockResolvedValue(detail),
    enqueueTranscript: vi.fn().mockResolvedValue({}),
    previewTopic: vi.fn().mockResolvedValue({}),
    confirmTopic: vi.fn().mockResolvedValue({}),
  };
}

afterEach(() => {
  cleanup();
  refresh.mockReset();
});

describe("T-482 内容雷达工作区", () => {
  it("[T-520] 只用主题 token，窄桌面双栏、宽桌面三栏，关键同步操作始终可见", () => {
    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={{
          ...workspace,
          sources: [
            {
              id: "source-favorites",
              collectionId: "collection-favorites",
              type: "favorites_folder",
              displayName: "收藏选题库",
              canonicalUrl: null,
              monitorEnabled: true,
              syncPolicy: { mode: "scheduled", interval: "daily" },
              status: "active",
              lastRunAt: null,
              nextRunAt: "2026-07-25T09:00:00.000Z",
              version: 1,
            },
          ],
        }}
        items={[]}
        initialDetail={null}
        api={api()}
      />,
    );

    const layout = screen.getByTestId("intelligence-responsive-layout");
    expect(layout.className).toContain("xl:grid-cols");
    expect(layout.className).toContain("2xl:grid-cols");
    const sidebar = screen.getByTestId("intelligence-sidebar");
    expect(sidebar.className).toContain("bg-surface-subtle");
    expect(sidebar.className).not.toMatch(/bg-\[#|bg-white/);

    const sync = screen.getByRole("button", { name: "同步 收藏选题库" });
    expect(sync).toBeVisible();
    expect(sync).toHaveTextContent("同步");
    expect(sync.className).not.toContain("opacity-0");
  });

  it("[T-520] 收藏错误只按端到端结构化 code 给出不同处理建议", () => {
    expect(
      favoriteFoldersErrorMessage({
        code: "DOUYIN_FAVORITES_SESSION_EXPIRED",
      }),
    ).toContain("登录已失效");
    expect(
      favoriteFoldersErrorMessage({ code: "OwnershipError" }),
    ).toContain("账号");
    expect(
      favoriteFoldersErrorMessage({ code: "DOUYIN_FAVORITES_BROWSER_LOCKED" }),
    ).toContain("占用");
    expect(
      favoriteFoldersErrorMessage({ code: "DOUYIN_FAVORITES_CAPTCHA" }),
    ).toContain("验证码");
    expect(
      favoriteFoldersErrorMessage({ code: "DOUYIN_FAVORITES_NETWORK" }),
    ).toContain("网络");
    expect(
      favoriteFoldersErrorMessage({ code: "DOUYIN_FAVORITES_UPSTREAM" }),
    ).toContain("接口");
    expect(
      favoriteFoldersErrorMessage({
        name: "DouyinFavoritesSessionExpiredError",
        message: "看起来像登录失效，但没有 code",
      }),
    ).toContain("登录已失效");
    expect(
      favoriteFoldersErrorMessage({
        cause: {
          name: "DouyinFavoritesBrowserLockedError",
          code: "DOUYIN_FAVORITES_BROWSER_LOCKED",
        },
      }),
    ).toContain("占用");
  });

  it("[T-520] 业务确认真 0 时显示真实空态，来源弹窗可滚动且选项可换行", async () => {
    const stub = api();
    stub.listFavoriteFolders = vi.fn().mockResolvedValue([]);
    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[]}
        initialDetail={null}
        api={stub}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "添加来源" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("overflow-y-auto");
    expect(dialog.className).toContain("max-h-");
    const typeChoices = screen.getByTestId("source-type-choices");
    expect(typeChoices.className).toContain("grid-cols-2");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "我的收藏" }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "读取我的收藏夹" }),
    );

    expect(
      await screen.findByText("已确认当前账号目前有 0 个收藏夹。"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/登录已失效/)).not.toBeInTheDocument();
  });

  it("按定位→雷达→选题边界显示系统分类，评论未知不伪装 0", () => {
    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[
          {
            item: detail.item,
            latestMetric: detail.metrics[0]!,
            sourceCount: 1,
          },
        ]}
        initialDetail={detail}
        api={api()}
      />,
    );
    expect(screen.getByText("我的收藏")).toBeInTheDocument();
    expect(screen.getByText("黑马发现")).toBeInTheDocument();
    expect(screen.getAllByText("未知").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/系统不会自动转写其他作品|不会自动转写/),
    ).toBeInTheDocument();
  });

  it("详情栏可用键盘调整宽度，并记住合法范围", () => {
    expect(clampDetailWidth(100)).toBe(320);
    expect(clampDetailWidth(800)).toBe(640);
    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[]}
        initialDetail={detail}
        api={api()}
      />,
    );
    const separator = screen.getByRole("separator", {
      name: "调整作品详情宽度",
    });
    const pane = screen.getByTestId("intelligence-detail");
    expect(pane).toHaveStyle({ width: "392px" });
    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(pane).toHaveStyle({ width: "416px" });
  });

  it("[T-514] 来源始终显示文字同步按钮、监控口径和真实运行记录入口", async () => {
    const stub = api();
    const sourceWorkspace: RadarWorkspace = {
      ...workspace,
      sources: [
        {
          id: "source-1",
          collectionId: "collection-darkhorse",
          type: "darkhorse_query",
          displayName: "AI 工具",
          canonicalUrl: null,
          monitorEnabled: true,
          syncPolicy: { mode: "scheduled", interval: "daily" },
          status: "active",
          lastRunAt: null,
          nextRunAt: "2026-07-25T09:00:00.000Z",
          version: 1,
        },
      ],
      health: [
        {
          sourceId: "source-1",
          lastRunId: null,
          lastRunStatus: null,
          blockedCount: 0,
          lastErrorCode: null,
          scannedCount: 0,
          newCount: 0,
          updatedCount: 0,
          failedCount: 0,
        },
      ],
    };
    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={sourceWorkspace}
        items={[]}
        initialDetail={null}
        api={stub}
      />,
    );

    const sync = screen.getByRole("button", { name: "同步 AI 工具" });
    expect(sync).toHaveTextContent("同步");
    expect(sync).not.toHaveClass("opacity-0");
    expect(screen.getByText(/每日自动 · 尚未同步/)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "查看 AI 工具 的运行记录" }),
    );
    expect(
      await screen.findByRole("heading", { name: "AI 工具 · 运行记录" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/APP 运行时执行/)).toBeInTheDocument();
    expect(stub.listRuns).toHaveBeenCalledWith("source-1");
  });

  it("[T-514] 手动同步完成后自动刷新页面，不要求用户再点一次", async () => {
    const stub = api();
    const sourceWorkspace: RadarWorkspace = {
      ...workspace,
      sources: [
        {
          id: "source-1",
          collectionId: null,
          type: "creator_profile",
          displayName: "示例博主",
          canonicalUrl: "https://www.douyin.com/user/sec-example",
          monitorEnabled: false,
          syncPolicy: { mode: "manual" },
          status: "active",
          lastRunAt: null,
          nextRunAt: null,
          version: 1,
        },
      ],
      health: [],
    };
    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={sourceWorkspace}
        items={[]}
        initialDetail={null}
        api={stub}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "同步 示例博主" }),
    );
    expect(stub.startRun).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: "source-1" }),
    );
    expect(
      await screen.findByText(/同步完成：扫描 13 条/),
    ).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("逐字稿只有点击“手动转写”后才进入队列", async () => {
    const stub = api();
    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[]}
        initialDetail={detail}
        api={stub}
      />,
    );
    expect(stub.enqueueTranscript).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "手动转写" }),
    );
    expect(stub.enqueueTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: "item-1" }),
    );
    expect(await screen.findByText("排队中")).toBeInTheDocument();
  });

  it("博主主页必须真实预览成功后才能保存并首次同步", async () => {
    const stub = api();
    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[]}
        initialDetail={null}
        api={stub}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "添加来源" }));
    const save = screen.getByRole("button", {
      name: "保存并开始首次同步",
    });
    expect(save).toBeDisabled();
    await userEvent.type(
      screen.getByRole("textbox", { name: "来源地址或关键词" }),
      "https://www.douyin.com/user/sec-example",
    );
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "测试来源" }));
    expect(
      await screen.findByText(/已识别「示例博主」/),
    ).toBeInTheDocument();
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(stub.createSource).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "creator_profile",
        config: expect.objectContaining({
          externalAccountId: "sec-example",
        }),
      }),
    );
  });

  it("可选择分类粘贴分享文本单条建档，且不会自动发起转写", async () => {
    const stub = api();
    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[]}
        initialDetail={null}
        api={stub}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "粘贴分享链接" }),
    );
    expect(
      screen.getByText(/已有博主就把视频归入其作品/),
    ).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole("textbox", { name: "抖音分享文本" }),
      "复制打开抖音 https://v.douyin.com/iFooBar/",
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "导入到分类" }),
      "collection-darkhorse",
    );
    await userEvent.click(screen.getByRole("button", { name: "识别并建档" }));

    expect(stub.importDouyinShare).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "account-1",
        collectionId: "collection-darkhorse",
        shareInput: expect.stringContaining("v.douyin.com"),
      }),
    );
    expect(stub.enqueueTranscript).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });
});
