import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  IntelligenceWorkbench,
  clampDetailWidth,
  favoriteFoldersErrorMessage,
  sourceVerificationErrorMessage,
  type RadarApi,
  type RadarItemDetail,
  type RadarWorkspace,
} from "./intelligence-workbench";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push }),
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
    listCollectors: vi.fn().mockResolvedValue([
      {
        accountId: "account-1",
        accountHandle: "@创作号",
        platform: "douyin",
      },
      {
        accountId: "account-2",
        accountHandle: "@观察号",
        platform: "douyin",
      },
    ]),
    previewProfile: vi.fn().mockResolvedValue({
      externalAccountId: "sec-example",
      nickname: "示例博主",
      avatarUrl: null,
      canonicalUrl: "https://www.douyin.com/user/sec-example",
      visibleWorkCount: 12,
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
    updateSource: vi.fn().mockImplementation(async (input) => ({
      id: input.sourceId,
      collectionId: null,
      type: "creator_profile",
      displayName: "示例博主",
      canonicalUrl: "https://www.douyin.com/user/sec-example",
      collector: {
        accountId: "account-1",
        accountHandle: "@创作号",
        platform: "douyin",
        availability: "active",
      },
      monitorEnabled: input.monitorEnabled,
      syncPolicy: input.syncPolicy,
      status: "active",
      lastRunAt: null,
      nextRunAt: null,
      version: 2,
    })),
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
    reconnectCollector: vi.fn().mockResolvedValue({ loggedIn: true }),
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
  push.mockReset();
});

describe("T-482 内容雷达工作区", () => {
  it("[T-537] 登录型来源默认 owner，切换 collector 清空旧验证并只提交 collectorAccountId", async () => {
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
    const collector = await screen.findByRole("combobox", {
      name: "采集账号",
    });
    expect(collector).toHaveValue("account-1");
    await userEvent.selectOptions(collector, "account-2");
    await userEvent.type(
      screen.getByRole("textbox", { name: "来源地址或关键词" }),
      "https://www.douyin.com/user/sec-example",
    );
    await userEvent.click(screen.getByRole("button", { name: "测试来源" }));
    expect(
      await screen.findByText(/已识别「示例博主」/),
    ).toBeInTheDocument();
    expect(stub.previewProfile).toHaveBeenCalledWith({
      accountId: "account-1",
      collectorAccountId: "account-2",
      url: "https://www.douyin.com/user/sec-example",
    });

    await userEvent.selectOptions(collector, "account-1");
    expect(screen.queryByText(/已识别「示例博主」/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "保存并开始首次同步" }),
    ).toBeDisabled();
  });

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
              collector: null,
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

  it("[T-567] 中等桌面窗口保持来源、内容、详情三栏，详情不再整块下坠", () => {
    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[]}
        initialDetail={detail}
        api={api()}
      />,
    );

    const layout = screen.getByTestId("intelligence-responsive-layout");
    expect(layout.className).toContain(
      "xl:grid-cols-[minmax(220px,260px)_minmax(320px,1fr)_minmax(320px,392px)]",
    );
    const detailRegion = screen
      .getByTestId("intelligence-detail")
      .parentElement;
    expect(detailRegion).not.toHaveClass("xl:col-span-2");
    expect(detailRegion).toHaveClass("xl:min-h-0");
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

  it("[T-546] 网页来源按安全错误类型给出可执行建议", () => {
    expect(
      sourceVerificationErrorMessage("web", { code: "LOGIN_WALL" }),
    ).toContain("网站登录保管库");
    expect(
      sourceVerificationErrorMessage("web", { code: "PARSE_FAILED" }),
    ).toContain("具体文章");
    expect(
      sourceVerificationErrorMessage("rss", { code: "PARSE_FAILED" }),
    ).toContain("RSS/Atom");
    expect(
      sourceVerificationErrorMessage("web", {
        cause: { code: "TIMEOUT" },
      }),
    ).toContain("连接超时");
    expect(
      sourceVerificationErrorMessage("web", { code: "UNSAFE_URL" }),
    ).toContain("公网网页");
  });

  it("[T-567] 创作者主页旁证发现收藏会话过期时明确提示重新登录", () => {
    expect(
      sourceVerificationErrorMessage("creator_profile", {
        cause: { code: "DOUYIN_FAVORITES_SESSION_EXPIRED" },
      }),
    ).toContain("重新登录");
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
      within(dialog).getByRole("button", { name: "读取并选择收藏夹" }),
    );

    expect(
      await screen.findByText("已确认当前账号目前有 0 个收藏夹。"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/登录已失效/)).not.toBeInTheDocument();
  });

  it("[T-546] 收藏夹列表读取失败时仍可按准确名称指定，失败不伪装成 0", async () => {
    const stub = api();
    stub.listFavoriteFolders = vi.fn().mockRejectedValue({
      code: "DOUYIN_FAVORITES_NETWORK",
    });
    stub.createSource = vi.fn().mockResolvedValue({
      source: {
        id: "source-favorites",
        collectionId: "collection-favorites",
        type: "favorites_folder",
        displayName: "选题库",
        canonicalUrl: null,
        collector: {
          accountId: "account-1",
          accountHandle: "@创作号",
          platform: "douyin",
          availability: "active",
        },
        monitorEnabled: true,
        syncPolicy: { mode: "scheduled", interval: "daily" },
        status: "active",
        lastRunAt: null,
        nextRunAt: null,
        version: 1,
      },
      run: null,
      task: null,
    });
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
    await userEvent.click(
      within(dialog).getByRole("button", { name: "我的收藏" }),
    );
    const folderName = within(dialog).getByRole("textbox", {
      name: "收藏夹名称",
    });
    await userEvent.type(folderName, "选题库");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "读取并选择收藏夹" }),
    );

    expect(await screen.findByText(/网络连接失败/)).toBeInTheDocument();
    expect(folderName).toHaveValue("选题库");
    expect(screen.queryByText(/有 0 个收藏夹/)).not.toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("button", {
        name: "保存并开始首次同步",
      }),
    );
    await waitFor(() =>
      expect(stub.createSource).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "favorites_folder",
          displayName: "选题库",
          config: {
            type: "favorites_folder",
            collectorAccountId: "account-1",
            folderId: "选题库",
          },
        }),
      ),
    );
  });

  it("[T-546] 读取成功后可选择具体收藏夹并保存稳定 ID 和真实名称", async () => {
    const stub = api();
    stub.listFavoriteFolders = vi.fn().mockResolvedValue([
      { id: "collects-1", name: "选题库", itemCount: 12 },
      { id: "collects-2", name: "爆款参考", itemCount: 8 },
    ]);
    stub.createSource = vi.fn().mockResolvedValue({
      source: {
        id: "source-favorites",
        collectionId: "collection-favorites",
        type: "favorites_folder",
        displayName: "爆款参考",
        canonicalUrl: null,
        collector: {
          accountId: "account-1",
          accountHandle: "@创作号",
          platform: "douyin",
          availability: "active",
        },
        monitorEnabled: true,
        syncPolicy: { mode: "scheduled", interval: "daily" },
        status: "active",
        lastRunAt: null,
        nextRunAt: null,
        version: 1,
      },
      run: null,
      task: null,
    });
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
    await userEvent.click(
      within(dialog).getByRole("button", { name: "我的收藏" }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "读取并选择收藏夹" }),
    );
    await userEvent.selectOptions(
      await within(dialog).findByRole("combobox", { name: "选择收藏夹" }),
      "collects-2",
    );
    expect(
      within(dialog).getByRole("textbox", { name: "收藏夹名称" }),
    ).toHaveValue("爆款参考");

    await userEvent.click(
      within(dialog).getByRole("button", {
        name: "保存并开始首次同步",
      }),
    );
    await waitFor(() =>
      expect(stub.createSource).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "favorites_folder",
          displayName: "爆款参考",
          config: {
            type: "favorites_folder",
            collectorAccountId: "account-1",
            folderId: "collects-2",
          },
        }),
      ),
    );
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

  it("[T-514/T-546] 窄栏来源使用两层紧凑结构，名称不逐字换行且操作完整", async () => {
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
          collector: null,
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
    const sourceRow = screen.getByTestId("radar-source-row-source-1");
    expect(sourceRow).toHaveClass("overflow-hidden");
    expect(within(sourceRow).getByText("AI 工具")).toHaveClass(
      "truncate",
      "whitespace-nowrap",
    );
    expect(within(sourceRow).getByText("尚未同步")).toHaveClass("truncate");
    expect(
      within(sourceRow).getByRole("button", {
        name: "暂停 AI 工具 的每日自动同步",
      }),
    ).toHaveTextContent("自动");

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
          collector: null,
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

  it("[T-546] 页面恢复时重新监听已有 active run，终态后停止转圈并恢复同步按钮", async () => {
    const stub = api();
    const sourceWorkspace: RadarWorkspace = {
      ...workspace,
      sources: [
        {
          id: "source-1",
          collectionId: "collection-favorites",
          type: "favorites_folder",
          displayName: "我的选题收藏",
          canonicalUrl: null,
          collector: {
            accountId: "account-1",
            accountHandle: "@创作号",
            platform: "douyin",
            availability: "active",
          },
          monitorEnabled: false,
          syncPolicy: { mode: "manual" },
          status: "active",
          lastRunAt: "2026-07-24T00:00:00.000Z",
          nextRunAt: null,
          version: 1,
        },
      ],
      health: [
        {
          sourceId: "source-1",
          lastRunId: "run-1",
          lastRunStatus: "running",
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

    expect(
      screen.getByRole("button", { name: "正在同步 我的选题收藏" }),
    ).toBeDisabled();
    expect(stub.getRun).toHaveBeenCalledWith("run-1");
    expect(
      await screen.findByRole("button", { name: "同步 我的选题收藏" }),
    ).toBeEnabled();
    expect(await screen.findByText(/同步完成：扫描 13 条/)).toBeInTheDocument();
  });

  it("[T-546] 登录失效时原地确认并复用采集账号扫码，成功后自动重试来源", async () => {
    const stub = api();
    const sourceWorkspace: RadarWorkspace = {
      ...workspace,
      sources: [
        {
          id: "source-1",
          collectionId: "collection-darkhorse",
          type: "darkhorse_query",
          displayName: "黑马：智能体",
          canonicalUrl: null,
          collector: {
            accountId: "account-1",
            accountHandle: "@创作号",
            platform: "douyin",
            availability: "active",
          },
          monitorEnabled: false,
          syncPolicy: { mode: "manual" },
          status: "active",
          lastRunAt: "2026-07-24T00:00:00.000Z",
          nextRunAt: null,
          version: 1,
        },
      ],
      health: [
        {
          sourceId: "source-1",
          lastRunId: "run-1",
          lastRunStatus: "blocked",
          blockedCount: 1,
          lastErrorCode: "LOGIN_REQUIRED",
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

    await userEvent.click(
      screen.getByRole("button", {
        name: "重新登录 黑马：智能体 的采集账号",
      }),
    );
    expect(
      screen.getByRole("dialog", { name: "重新登录采集账号" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/复用 @创作号 已有的本机登录档案/)).toBeInTheDocument();
    expect(stub.reconnectCollector).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: "打开热点宝授权" }),
    );
    await waitFor(() => {
      expect(stub.reconnectCollector).toHaveBeenCalledWith({
        collectorAccountId: "account-1",
        sourceType: "darkhorse_query",
      });
      expect(stub.startRun).toHaveBeenCalledWith(
        expect.objectContaining({ sourceId: "source-1" }),
      );
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("[T-546] 博主来源保存后可暂停每日同步，且保留手动同步", async () => {
    const stub = api();
    const sourceWorkspace: RadarWorkspace = {
      ...workspace,
      sources: [
        {
          id: "source-creator",
          collectionId: null,
          type: "creator_profile",
          displayName: "示例博主",
          canonicalUrl: "https://www.douyin.com/user/sec-example",
          collector: {
            accountId: "account-1",
            accountHandle: "@创作号",
            platform: "douyin",
            availability: "active",
          },
          monitorEnabled: true,
          syncPolicy: { mode: "scheduled", interval: "daily" },
          status: "active",
          lastRunAt: null,
          nextRunAt: "2026-07-27T00:00:00.000Z",
          version: 1,
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

    await userEvent.click(
      screen.getByRole("button", {
        name: "暂停 示例博主 的每日自动同步",
      }),
    );
    await waitFor(() => {
      expect(stub.updateSource).toHaveBeenCalledWith({
        sourceId: "source-creator",
        monitorEnabled: false,
        syncPolicy: { mode: "manual" },
        expectedVersion: 1,
      });
    });
    expect(
      screen.getByRole("button", { name: "同步 示例博主" }),
    ).toBeEnabled();
    expect(
      await screen.findByText(/仍可手动同步/),
    ).toBeInTheDocument();
  });

  it("[T-546] 新增收藏来源遇到登录失效时可复用所选账号原地重新登录", async () => {
    const stub = api();
    stub.listCollectors = vi.fn().mockResolvedValue([
      {
        accountId: "collector-1",
        accountHandle: "@采集号",
        platform: "douyin",
        availability: "active",
      },
    ]);
    stub.listFavoriteFolders = vi.fn().mockRejectedValue({
      code: "DOUYIN_FAVORITES_SESSION_EXPIRED",
      name: "DouyinFavoritesSessionExpiredError",
    });
    stub.reconnectCollector = vi.fn().mockResolvedValue({ loggedIn: true });

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
    await userEvent.click(screen.getByRole("button", { name: "我的收藏" }));
    await waitFor(() =>
      expect(screen.getByLabelText("采集账号")).toHaveValue("collector-1"),
    );
    await userEvent.type(screen.getByLabelText("收藏夹名称"), "选题库");
    await userEvent.click(
      screen.getByRole("button", { name: "读取并选择收藏夹" }),
    );

    expect(
      await screen.findByText(/抖音收藏登录已失效/),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "重新登录所选采集账号" }),
    );
    await waitFor(() => {
      expect(stub.reconnectCollector).toHaveBeenCalledWith({
        collectorAccountId: "collector-1",
        sourceType: "favorites_folder",
      });
    });
    expect(
      await screen.findByText("登录已恢复，请重新测试来源。"),
    ).toBeInTheDocument();
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

  it("[T-546] 生成选题候选立即显示局部进度并阻止重复创建，完成后回显编辑卡", async () => {
    const stub = api();
    const readyDetail: RadarItemDetail = {
      ...detail,
      snapshots: [
        {
          id: "snapshot-1",
          title: "真实作品",
          capturedAt: "2026-07-23T12:00:00.000Z",
          finalUrl: detail.item.canonicalUrl,
        },
      ],
      transcript: {
        itemId: detail.item.id,
        status: "done",
        text: "完整逐字稿",
        errorCode: null,
      },
    };
    const pendingTransform: RadarItemDetail["transforms"][number] = {
      id: "transform-1",
      status: "candidate",
      outputSnapshot: null,
      targetTopicId: null,
    };
    const completedDetail: RadarItemDetail = {
      ...readyDetail,
      transforms: [
        {
          ...pendingTransform,
          outputSnapshot: {
            title: "完整候选标题",
            angle: "真实切入角度",
            differentiation: "本账号差异化",
            sourceSummary: "来自逐字稿的真实摘要",
            hook: "反差开场",
            structureSteps: ["提出误区", "拆解原因", "给出行动"],
          },
        },
      ],
    };
    let finishPreview!: (
      value: Awaited<ReturnType<RadarApi["previewTopic"]>>,
    ) => void;
    stub.previewTopic = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<RadarApi["previewTopic"]>>>((resolve) => {
          finishPreview = resolve;
        }),
    );
    stub.getItem = vi.fn().mockResolvedValue(completedDetail);

    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[]}
        initialDetail={readyDetail}
        positioningVersionId="positioning-v1"
        api={stub}
      />,
    );

    const generate = screen.getByRole("button", {
      name: "生成选题候选",
    });
    fireEvent.click(generate);
    fireEvent.click(generate);

    expect(stub.previewTopic).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("button", {
        name: "正在生成选题候选",
      }),
    ).toBeDisabled();
    expect(
      screen.getByText(/正在结合当前定位和逐字稿生成/),
    ).toBeInTheDocument();

    finishPreview({
      transform: {
        ...pendingTransform,
        outputSnapshot: null,
      },
      task: { id: "task-1", status: "queued" },
    });

    expect(
      await screen.findByDisplayValue("完整候选标题"),
    ).toBeInTheDocument();
    expect(screen.getByText("反差开场")).toBeInTheDocument();
  });

  it("[T-579] 生成任务失败后停止假进度，显示真实错误并允许重新生成", async () => {
    const stub = api();
    const readyDetail: RadarItemDetail = {
      ...detail,
      snapshots: [
        {
          id: "snapshot-1",
          title: "真实作品",
          capturedAt: "2026-07-23T12:00:00.000Z",
          finalUrl: detail.item.canonicalUrl,
        },
      ],
      transcript: {
        itemId: detail.item.id,
        status: "done",
        text: "完整逐字稿",
        errorCode: null,
      },
    };
    const failedDetail: RadarItemDetail = {
      ...readyDetail,
      transforms: [
        {
          id: "transform-failed",
          status: "candidate",
          taskStatus: "failed",
          taskErrorCode: "MODEL_PROTOCOL_ERROR",
          taskErrorMessage: "模型没有返回可解析的选题结构",
          outputSnapshot: null,
          targetTopicId: null,
        },
      ],
    };
    stub.previewTopic = vi.fn().mockResolvedValue({
      transform: {
        id: "transform-failed",
        status: "candidate",
        outputSnapshot: null,
        targetTopicId: null,
      },
      task: { id: "task-failed", status: "queued" },
    });
    stub.getItem = vi.fn().mockResolvedValue(failedDetail);

    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[]}
        initialDetail={readyDetail}
        positioningVersionId="positioning-v1"
        api={stub}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "生成选题候选" }),
    );

    expect(
      await screen.findByText("模型没有返回可解析的选题结构"),
    ).toBeInTheDocument();
    expect(screen.getByText("错误代码：MODEL_PROTOCOL_ERROR")).toBeInTheDocument();
    expect(
      screen.queryByText("候选仍在后台生成"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "重新生成" }),
    ).toBeEnabled();
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
