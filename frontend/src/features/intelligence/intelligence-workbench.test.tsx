import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executionTaskResourceV2 } from "@creatoros/contract";

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
    deleteSource: vi.fn().mockResolvedValue({
      affectedItems: 3,
      preservedSnapshots: 5,
      status: "deleted",
    }),
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
    listItems: vi.fn().mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 100,
      total: 0,
      hasMore: false,
    }),
    getItem: vi.fn().mockResolvedValue(detail),
    enqueueTranscript: vi.fn().mockResolvedValue({}),
    uploadTranscript: vi.fn().mockResolvedValue(detail.transcript),
    previewTopic: vi.fn().mockResolvedValue({}),
    confirmTopic: vi.fn().mockResolvedValue({}),
    promoteCandidate: vi.fn().mockResolvedValue({ projectId: "project-1" }),
  };
}

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  window.localStorage.clear();
  refresh.mockReset();
  push.mockReset();
});

describe("T-482 内容雷达工作区", () => {
  it("T-938 返回页面恢复筛选排序，其他账号不复用", async()=>{
    const stub=api();
    const props={accountId:"account-1",workspace,items:[],initialDetail:null,api:stub};
    const first=render(<IntelligenceWorkbench {...props}/>);
    fireEvent.change(screen.getByRole("combobox",{name:"内容排序"}),{target:{value:"collect_desc"}});
    await waitFor(()=>expect(screen.getByRole("combobox",{name:"内容排序"})).toBeEnabled());
    fireEvent.change(screen.getByRole("combobox",{name:"逐字稿筛选"}),{target:{value:"extracted"}});
    await waitFor(()=>expect(screen.getByRole("combobox",{name:"逐字稿筛选"})).toBeEnabled());
    first.unmount();vi.mocked(stub.listItems).mockClear();
    const returned=render(<IntelligenceWorkbench {...props}/>);
    await waitFor(()=>expect(stub.listItems).toHaveBeenCalledWith(expect.objectContaining({accountId:"account-1",sort:"collect_desc",transcriptState:"extracted"})));
    expect(screen.getByRole("combobox",{name:"内容排序"})).toHaveValue("collect_desc");
    expect(screen.getByRole("combobox",{name:"逐字稿筛选"})).toHaveValue("extracted");
    returned.unmount();
    render(<IntelligenceWorkbench {...props} accountId="account-other"/>);
    expect(screen.getByRole("combobox",{name:"内容排序"})).toHaveValue("published_desc");
    expect(screen.getByRole("combobox",{name:"逐字稿筛选"})).toHaveValue("");
  });

  it("T-938 已升级作品显示真实项目链接，页头不显示受阻计数", async()=>{
    const stub=api();
    stub.enqueueProjectUpgrades=vi.fn();
    stub.listProjectUpgrades=vi.fn().mockResolvedValue({tasks:[{id:"upgrade-1",accountId:"account-1",ownerId:detail.item.id,status:"succeeded",checkpoint:{stage:"completed",projectId:"project-actual"},createdAt:"2026-09-09T00:00:00Z"}],total:1});
    render(<IntelligenceWorkbench accountId="account-1" workspace={{...workspace,blockedCount:2}} items={[{item:detail.item,latestMetric:null,sourceCount:1}]} initialDetail={null} api={stub}/>);
    expect(await screen.findByRole("link",{name:"查看项目"})).toHaveAttribute("href","/projects/project-actual");
    expect(screen.getByText("已升级为项目")).toBeInTheDocument();
    expect(screen.queryByText("受阻 2")).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"升级为项目"})).not.toBeInTheDocument();
  });

  it("T-937 转写完成直接更新详情与卡片，不需要切 Tab", async()=>{
    vi.useFakeTimers();
    const stub=api();
    vi.mocked(stub.getItem).mockResolvedValue({...detail,transcript:{...detail.transcript,status:"done",text:"后台生成的完整逐字稿"}});
    render(<IntelligenceWorkbench accountId="account-1" workspace={workspace} items={[{item:detail.item,latestMetric:null,sourceCount:1,transcriptState:"processing",progressState:"transcript_processing"}]} initialDetail={{...detail,transcript:{...detail.transcript,status:"running"}}} api={stub}/>);
    await act(async()=>{await vi.advanceTimersByTimeAsync(2100);});
    expect(screen.getByText("后台生成的完整逐字稿")).toBeInTheDocument();
    expect(screen.getByText("待生成选题")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    expect(stub.enqueueTranscript).not.toHaveBeenCalled();
  });

  it("T-937 转写读取抖动后继续刷新原任务", async()=>{
    vi.useFakeTimers();
    const stub=api();
    vi.mocked(stub.getItem).mockRejectedValueOnce(new Error("offline")).mockResolvedValue({...detail,transcript:{...detail.transcript,status:"done",text:"重连后的正文"}});
    render(<IntelligenceWorkbench accountId="account-1" workspace={workspace} items={[]} initialDetail={{...detail,transcript:{...detail.transcript,status:"running"}}} api={stub}/>);
    await act(async()=>{await vi.advanceTimersByTimeAsync(4100);});
    expect(screen.getByText("重连后的正文")).toBeInTheDocument();
    expect(stub.getItem).toHaveBeenCalledTimes(2);
  });

  it("T-937 升级入队未返回时仍可添加第二个作品，重复点击不重复提交", async()=>{
    const stub=api();
    stub.enqueueProjectUpgrades=vi.fn();
    stub.listProjectUpgrades=vi.fn().mockResolvedValue({tasks:[],total:0});
    stub.enqueueProjectUpgrades=vi.fn(()=>new Promise<{tasks:never[]}>(()=>{}));
    render(<IntelligenceWorkbench accountId="account-1" workspace={workspace} positioningVersionId="position-1" items={[{item:detail.item,latestMetric:null,sourceCount:1},{item:{...detail.item,id:"item-2",title:"第二个作品"},latestMetric:null,sourceCount:1}]} initialDetail={null} api={stub}/>);
    const buttons=screen.getAllByRole("button",{name:"升级为项目"});
    fireEvent.click(buttons[0]!);fireEvent.click(buttons[0]!);fireEvent.click(buttons[1]!);
    expect(stub.enqueueProjectUpgrades).toHaveBeenCalledTimes(2);
    expect(stub.enqueueProjectUpgrades).toHaveBeenNthCalledWith(2,expect.objectContaining({itemIds:["item-2"],positioningVersionId:"position-1"}));
  });
  it("显示服务端真实总量，并允许继续读取 100 条之后的内容", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      item: {
        ...detail.item,
        id: `item-${index + 1}`,
        title: `真实作品 ${index + 1}`,
      },
      latestMetric: detail.metrics[0]!,
      sourceCount: 1,
    }));
    const secondPageRow = {
      item: {
        ...detail.item,
        id: "item-101",
        title: "第 101 条真实作品",
      },
      latestMetric: detail.metrics[0]!,
      sourceCount: 1,
    };
    const stub = api();
    vi.mocked(stub.listItems).mockResolvedValue({
      items: [secondPageRow],
      page: 2,
      pageSize: 100,
      total: 101,
      hasMore: false,
    });

    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={firstPage}
        initialTotal={101}
        initialDetail={{ ...detail, item: firstPage[0]!.item }}
        api={stub}
      />,
    );

    expect(screen.getByText("101 条真实内容")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /继续加载.*已显示 100.*共 101/ }),
    );
    await waitFor(() =>
      expect(stub.listItems).toHaveBeenCalledWith({
        accountId: "account-1",
        page: 2,
        pageSize: 100,
        sort: "published_desc",
      }),
    );
    expect(await screen.findAllByText("第 101 条真实作品")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: /继续加载/ }),
    ).not.toBeInTheDocument();
  });

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

  it("[T-613] 黑马来源必须先验证热点宝授权，不能把普通抖音登录误当成可同步", async () => {
    const stub = api();
    stub.createSource = vi.fn().mockResolvedValue({
      source: {
        id: "source-darkhorse",
        collectionId: null,
        type: "darkhorse_query",
        displayName: "黑马：AI 工具",
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
      within(dialog).getByRole("button", { name: "黑马关键词" }),
    );
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "来源地址或关键词" }),
      "AI 工具",
    );
    const save = within(dialog).getByRole("button", {
      name: "保存并开始首次同步",
    });
    expect(save).toBeDisabled();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "验证热点宝授权" }),
    );
    await waitFor(() => {
      expect(stub.reconnectCollector).toHaveBeenCalledWith({
        collectorAccountId: "account-1",
        sourceType: "darkhorse_query",
      });
    });
    expect(
      await within(dialog).findByText(
        "热点宝授权已确认，可以保存并开始同步。",
      ),
    ).toBeInTheDocument();
    await waitFor(()=>expect(save).toBeEnabled());

    await userEvent.click(save);
    await waitFor(() => {
      expect(stub.createSource).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "darkhorse_query",
          config: {
            type: "darkhorse_query",
            collectorAccountId: "account-1",
            keyword: "AI 工具",
            board: "low_follower_breakout",
          },
        }),
      );
    });
  });

  it("[T-613] 热点宝未完成授权时保持禁用，不伪装成普通抖音登录失效", async () => {
    const stub = api();
    stub.reconnectCollector = vi.fn().mockResolvedValue({ loggedIn: false });

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
      within(dialog).getByRole("button", { name: "黑马关键词" }),
    );
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "来源地址或关键词" }),
      "AI 工具",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "验证热点宝授权" }),
    );

    expect(
      await within(dialog).findByText(
        "没有检测到热点宝授权成功。请在弹出的 Chrome 窗口完成授权后再试。",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", {
        name: "保存并开始首次同步",
      }),
    ).toBeDisabled();
    expect(stub.createSource).not.toHaveBeenCalled();
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

  it("[T-572] 左栏可按来源名称、类型和同步状态快速筛选", async () => {
    const sourceWorkspace: RadarWorkspace = {
      ...workspace,
      sources: [
        {
          id: "source-favorites",
          collectionId: "collection-favorites",
          type: "favorites_folder",
          displayName: "日常收藏夹",
          canonicalUrl: null,
          collector: null,
          monitorEnabled: true,
          syncPolicy: { mode: "scheduled", interval: "daily" },
          status: "active",
          lastRunAt: null,
          nextRunAt: null,
          version: 1,
        },
        {
          id: "source-darkhorse",
          collectionId: "collection-darkhorse",
          type: "darkhorse_query",
          displayName: "AI 工具观察",
          canonicalUrl: null,
          collector: null,
          monitorEnabled: false,
          syncPolicy: { mode: "manual" },
          status: "active",
          lastRunAt: null,
          nextRunAt: null,
          version: 1,
        },
      ],
      health: [
        {
          sourceId: "source-favorites",
          lastRunId: null,
          lastRunStatus: "succeeded_no_change",
          blockedCount: 0,
          lastErrorCode: null,
          scannedCount: 2,
          newCount: 0,
          updatedCount: 0,
          failedCount: 0,
        },
        {
          sourceId: "source-darkhorse",
          lastRunId: "run-failed",
          lastRunStatus: "failed",
          blockedCount: 0,
          lastErrorCode: "RESPONSE_SHAPE_CHANGED",
          scannedCount: 0,
          newCount: 0,
          updatedCount: 0,
          failedCount: 1,
        },
      ],
    };
    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={sourceWorkspace}
        items={[]}
        initialDetail={null}
        api={api()}
      />,
    );

    const filter = screen.getByRole("searchbox", { name: "筛选来源" });
    await userEvent.type(filter, "黑马");
    expect(
      screen.getByTestId("radar-source-row-source-darkhorse"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("radar-source-row-source-favorites"),
    ).not.toBeInTheDocument();

    await userEvent.clear(filter);
    await userEvent.type(filter, "同步失败");
    expect(
      screen.getByTestId("radar-source-row-source-darkhorse"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("radar-source-row-source-favorites"),
    ).not.toBeInTheDocument();
  });

  it("[T-574] 点击分类和来源会查询并切换真实作品，切回全部恢复全集", async () => {
    const favoritesRow = {
      item: detail.item,
      latestMetric: detail.metrics[0]!,
      sourceCount: 1,
    };
    const darkhorseRow = {
      item: {
        ...detail.item,
        id: "item-darkhorse",
        canonicalUrl: "https://www.douyin.com/video/darkhorse",
        title: "黑马作品",
      },
      latestMetric: null,
      sourceCount: 1,
    };
    const sourceWorkspace: RadarWorkspace = {
      ...workspace,
      sources: [
        {
          id: "source-favorites",
          collectionId: "collection-favorites",
          type: "favorites_folder",
          displayName: "收藏夹",
          canonicalUrl: null,
          collector: null,
          monitorEnabled: true,
          syncPolicy: { mode: "scheduled", interval: "daily" },
          status: "active",
          lastRunAt: null,
          nextRunAt: null,
          version: 1,
        },
        {
          id: "source-darkhorse",
          collectionId: "collection-darkhorse",
          type: "darkhorse_query",
          displayName: "黑马关键词",
          canonicalUrl: null,
          collector: null,
          monitorEnabled: false,
          syncPolicy: { mode: "manual" },
          status: "active",
          lastRunAt: null,
          nextRunAt: null,
          version: 1,
        },
      ],
    };
    const stub = api();
    vi.mocked(stub.listItems).mockImplementation(async (input) => {
      const items =
        input.sourceId === "source-darkhorse" ||
        input.collectionId === "collection-darkhorse"
          ? [darkhorseRow]
          : [favoritesRow, darkhorseRow];
      return {
        items,
        page: input.page ?? 1,
        pageSize: input.pageSize ?? 100,
        total: items.length,
        hasMore: false,
      };
    });
    vi.mocked(stub.getItem).mockImplementation(async (itemId) => ({
      ...detail,
      item:
        itemId === darkhorseRow.item.id
          ? darkhorseRow.item
          : favoritesRow.item,
    }));

    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={sourceWorkspace}
        items={[favoritesRow, darkhorseRow]}
        initialDetail={detail}
        api={stub}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /^黑马发现/ }),
    );
    await waitFor(() =>
      expect(stub.listItems).toHaveBeenCalledWith({
        accountId: "account-1",
        collectionId: "collection-darkhorse",
        page: 1,
        pageSize: 100,
        sort: "published_desc",
      }),
    );
    expect(await screen.findAllByText("黑马作品")).toHaveLength(2);
    expect(screen.queryByText("真实作品")).not.toBeInTheDocument();
    expect(screen.getByText("1 条真实内容")).toBeInTheDocument();

    await userEvent.click(
      within(
        screen.getByTestId("radar-source-row-source-darkhorse"),
      ).getAllByRole("button")[0]!,
    );
    await waitFor(() =>
      expect(stub.listItems).toHaveBeenLastCalledWith({
        accountId: "account-1",
        collectionId: "collection-darkhorse",
        page: 1,
        pageSize: 100,
        sourceId: "source-darkhorse",
        sort: "published_desc",
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: /^全部内容/ }));
    await waitFor(() =>
      expect(stub.listItems).toHaveBeenLastCalledWith({
        accountId: "account-1",
        page: 1,
        pageSize: 100,
        sort: "published_desc",
      }),
    );
    expect(await screen.findAllByText("真实作品")).toHaveLength(2);
    expect(screen.getByText("2 条真实内容")).toBeInTheDocument();
  });

  it("[T-572] 即使数据里残留封面地址，列表和详情也不再渲染大图占位", () => {
    const itemWithLegacyCover = {
      ...detail.item,
      coverUrl: "https://example.com/legacy-cover.jpg",
    };
    const { container } = render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[
          {
            item: itemWithLegacyCover,
            latestMetric: detail.metrics[0]!,
            sourceCount: 1,
          },
        ]}
        initialDetail={{ ...detail, item: itemWithLegacyCover }}
        api={api()}
      />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getAllByText("真实作品")).toHaveLength(2);
    expect(screen.getAllByText(/赞/).length).toBeGreaterThan(0);
  });

  it("[T-651] 缺失发布时间时如实展示收录时间，不伪装成发布时间", () => {
    const itemWithoutPublishedAt = {
      ...detail.item,
      id: "item-without-published-at",
      publishedAt: null,
      capturedAt: "2026-07-31T12:00:00.000Z",
    };
    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[
          {
            item: itemWithoutPublishedAt,
            latestMetric: detail.metrics[0]!,
            sourceCount: 1,
          },
        ]}
        initialDetail={{ ...detail, item: itemWithoutPublishedAt }}
        api={api()}
      />,
    );

    expect(
      screen.getAllByText(/发布时间未知 · 收录于/),
    ).not.toHaveLength(0);
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

  it("[T-613] 黑马验证错误统一指向热点宝授权，不误导为普通抖音登录", () => {
    expect(
      sourceVerificationErrorMessage("darkhorse_query", {
        cause: { name: "DouyinNotLoggedInError" },
      }),
    ).toContain("热点宝");
    expect(
      sourceVerificationErrorMessage("darkhorse_query", {
        code: "RESPONSE_SHAPE_CHANGED",
      }),
    ).toContain("页面结构");
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
      screen.getByText(/点击 AI 转写即可自动提取正文/),
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

  it("[T-665] 删除入口先打开系统 Dialog，取消时不调用删除接口", async () => {
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
      screen.getByRole("button", { name: "移除 AI 工具" }),
    );

    expect(stub.deleteSource).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", {
        name: "删除「AI 工具」及其内容？",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "删除后会停止同步，并清理这个信源独占的内容、快照和任务记录。被其他信源复用或已进入正式选题、项目的内容不会被破坏。",
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(stub.deleteSource).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", {
        name: "删除「AI 工具」及其内容？",
      }),
    ).not.toBeInTheDocument();
  });

  it("[T-665] 确认后永久删除信源及独占内容，并说明共享与正式引用保护", async () => {
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

    await userEvent.click(screen.getByText("AI 工具"));
    expect(screen.getByTestId("radar-source-row-source-1")).toHaveClass(
      "ring-1",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "移除 AI 工具" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "删除信源与内容" }),
    );

    await waitFor(() =>
      expect(stub.deleteSource).toHaveBeenCalledWith({
        sourceId: "source-1",
        mode: "permanent",
        confirmToken: "source-1",
      }),
    );
    expect(stub.deleteSource).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("heading", {
        name: "删除「AI 工具」及其内容？",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("radar-source-row-source-1")).not.toHaveClass(
      "ring-1",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "已删除「AI 工具」及 3 条独占内容；被其他信源或正式选题、项目引用的内容已安全保留。",
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("[T-665] 删除失败时来源与确认框不消失，并显示可行动错误", async () => {
    const stub = api();
    stub.deleteSource = vi.fn().mockRejectedValue(new Error("network"));
    const sourceWorkspace: RadarWorkspace = {
      ...workspace,
      sources: [
        {
          id: "source-1",
          collectionId: null,
          type: "web",
          displayName: "行业观察",
          canonicalUrl: "https://example.com",
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
      screen.getByRole("button", { name: "移除 行业观察" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "删除信源与内容" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "未能删除「行业观察」。请确认来源未在同步并刷新后重试。",
    );
    expect(
      screen.getByRole("heading", {
        name: "删除「行业观察」及其内容？",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("radar-source-row-source-1")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("[T-665] 同步中的来源明确禁用移除，不能误调用删除接口", () => {
    const stub = api();
    const sourceWorkspace: RadarWorkspace = {
      ...workspace,
      sources: [
        {
          id: "source-1",
          collectionId: null,
          type: "web",
          displayName: "行业观察",
          canonicalUrl: "https://example.com",
          collector: null,
          monitorEnabled: true,
          syncPolicy: { mode: "scheduled", interval: "daily" },
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
    stub.getRun = vi.fn().mockImplementation(() => new Promise(() => {}));
    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={sourceWorkspace}
        items={[]}
        initialDetail={null}
        api={stub}
      />,
    );

    const remove = screen.getByRole("button", {
      name: "同步中，暂时不能移除 行业观察",
    });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAttribute(
      "title",
      "同步进行中，完成后才能移除来源",
    );
    expect(stub.deleteSource).not.toHaveBeenCalled();
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

  it("[T-570] 黑马恢复任务处于 queued 时显示排队中，进入页面不会新建一次同步", () => {
    const stub = api();
    stub.getRun = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<RadarApi["getRun"]>>>(() => {}),
    );
    const sourceWorkspace: RadarWorkspace = {
      ...workspace,
      sources: [
        {
          id: "source-darkhorse",
          collectionId: "collection-darkhorse",
          type: "darkhorse_query",
          displayName: "黑马：AI 工具",
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
          lastRunAt: null,
          nextRunAt: null,
          version: 1,
        },
      ],
      health: [
        {
          sourceId: "source-darkhorse",
          lastRunId: "run-darkhorse",
          lastRunStatus: "queued",
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
      screen.getByRole("button", { name: "等待同步 黑马：AI 工具" }),
    ).toBeDisabled();
    expect(screen.getAllByText("排队中")).toHaveLength(2);
    expect(stub.startRun).not.toHaveBeenCalled();
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

  it("逐字稿只有点击“AI 转写”后才进入队列", async () => {
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
      screen.getByRole("button", { name: "AI 转写" }),
    );
    expect(stub.enqueueTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: "item-1" }),
    );
    expect(await screen.findByText("排队中")).toBeInTheDocument();
  });

  it("[T-610] 来源证据按 sourceId 去重，保留最近采集时间和累计次数", () => {
    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[]}
        initialDetail={{
          ...detail,
          snapshots: [
            {
              id: "snapshot-a3",
              sourceId: "source-a",
              title: "同一作品",
              capturedAt: "2026-07-29T07:41:00.000Z",
              finalUrl: detail.item.canonicalUrl,
            },
            {
              id: "snapshot-a2",
              sourceId: "source-a",
              title: "同一作品",
              capturedAt: "2026-07-28T07:40:00.000Z",
              finalUrl: detail.item.canonicalUrl,
            },
            {
              id: "snapshot-a1",
              sourceId: "source-a",
              title: "同一作品",
              capturedAt: "2026-07-27T16:08:00.000Z",
              finalUrl: detail.item.canonicalUrl,
            },
            {
              id: "snapshot-b1",
              sourceId: "source-b",
              title: "另一个来源发现",
              capturedAt: "2026-07-26T12:00:00.000Z",
              finalUrl: "https://example.com/other-source",
            },
          ],
        }}
        api={api()}
      />,
    );

    expect(screen.getAllByText("同一作品")).toHaveLength(1);
    expect(screen.getByText(/累计采集 3 次/)).toBeInTheDocument();
    expect(screen.getByText("另一个来源发现")).toBeInTheDocument();
  });

  it("[T-603] 文件先导入编辑器，确认保存后才写入逐字稿并解锁生成选题", async () => {
    const uploadedTranscript = {
      ...detail.transcript,
      status: "done" as const,
      text: "第一句\n第二句",
    };
    const uploadTranscript = vi.fn().mockResolvedValue(uploadedTranscript);
    const stub = Object.assign(api(), { uploadTranscript });
    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[]}
        initialDetail={{
          ...detail,
          snapshots: [
            {
              id: "snapshot-1",
              title: "真实作品",
              capturedAt: "2026-07-23T12:00:00.000Z",
              finalUrl: detail.item.canonicalUrl,
            },
          ],
        }}
        api={stub}
        positioningVersionId="positioning-1"
      />,
    );

    const file = new File(
      [
        "1\n00:00:01,000 --> 00:00:03,000\n第一句\n\n2\n00:00:04,000 --> 00:00:06,000\n第二句",
      ],
      "访谈.srt",
      { type: "application/x-subrip" },
    );
    await userEvent.click(
      screen.getByRole("button", { name: "添加逐字稿" }),
    );
    await userEvent.upload(
      screen.getByLabelText("从文件导入逐字稿"),
      file,
    );

    expect(uploadTranscript).not.toHaveBeenCalled();
    expect(screen.getByLabelText("逐字稿正文")).toHaveValue(
      "第一句\n第二句",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "保存逐字稿" }),
    );

    await waitFor(() =>
      expect(uploadTranscript).toHaveBeenCalledWith({
        itemId: "item-1",
        inputMode: "file",
        format: "srt",
        fileName: "访谈.srt",
        text: "第一句\n第二句",
      }),
    );
    expect(
      await screen.findByText(
        (_, node) =>
          node?.tagName === "P" &&
          node.textContent === "第一句\n第二句",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "生成我的改写稿" }),
    ).toBeEnabled();
  });

  it("[T-1017] 当前账号没有定位仍可直接生成通用改写稿", () => {
    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[]}
        initialDetail={{
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
            ...detail.transcript,
            status: "done",
            text: "一段真实逐字稿",
          },
        }}
        positioningVersionId={null}
        api={api()}
      />,
    );

    expect(screen.getByText("当前没有可用账号定位；生成时会明确标注为通用改写稿。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成我的改写稿" })).toBeEnabled();
  });

  it("[T-622] 逐字稿和选题状态筛选、收藏排序统一交给服务端查询", async () => {
    const stub = api();
    const row = {
      item: detail.item,
      latestMetric: detail.metrics[0]!,
      sourceCount: 1,
      transcriptState: "not_extracted" as const,
      topicState: "not_generated" as const,
      progressState: "pending_transcript" as const,
    };
    stub.listItems = vi.fn().mockImplementation(async (input) => ({
      items: [row],
      page: input.page ?? 1,
      pageSize: input.pageSize ?? 100,
      total: 1,
      hasMore: false,
    }));
    stub.getItem = vi.fn().mockResolvedValue(detail);

    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[row]}
        initialDetail={detail}
        api={stub}
      />,
    );

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "逐字稿筛选" }),
      "extracted",
    );
    await waitFor(() =>
      expect(stub.listItems).toHaveBeenLastCalledWith({
        accountId: "account-1",
        page: 1,
        pageSize: 100,
        sort: "published_desc",
        transcriptState: "extracted",
      }),
    );

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "选题筛选" }),
      "not_generated",
    );
    await waitFor(() =>
      expect(stub.listItems).toHaveBeenLastCalledWith({
        accountId: "account-1",
        page: 1,
        pageSize: 100,
        sort: "published_desc",
        transcriptState: "extracted",
        topicState: "not_generated",
      }),
    );

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "内容排序" }),
      "collect_desc",
    );
    await waitFor(() =>
      expect(stub.listItems).toHaveBeenLastCalledWith({
        accountId: "account-1",
        page: 1,
        pageSize: 100,
        sort: "collect_desc",
        transcriptState: "extracted",
        topicState: "not_generated",
      }),
    );
  });

  it("[T-622] 支持直接粘贴逐字稿；生成候选前仍可替换和重新转写", async () => {
    const savedTranscript = {
      ...detail.transcript,
      status: "done" as const,
      text: "粘贴进来的完整逐字稿",
    };
    const uploadTranscript = vi.fn().mockResolvedValue(savedTranscript);
    const stub = Object.assign(api(), { uploadTranscript });
    const { rerender } = render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[]}
        initialDetail={detail}
        api={stub}
        positioningVersionId="positioning-1"
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "添加逐字稿" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "逐字稿正文" }),
      "粘贴进来的完整逐字稿",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "保存逐字稿" }),
    );
    await waitFor(() =>
      expect(uploadTranscript).toHaveBeenCalledWith({
        itemId: "item-1",
        inputMode: "paste",
        text: "粘贴进来的完整逐字稿",
      }),
    );

    rerender(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[]}
        initialDetail={{
          ...detail,
          transcript: savedTranscript,
        }}
        api={stub}
        positioningVersionId="positioning-1"
      />,
    );
    expect(
      screen.getByRole("button", { name: "替换逐字稿" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "重新 AI 转写" }),
    ).toBeEnabled();
  });

  it("[T-893] 超长逐字稿使用受限正文滚动区，常见小窗口仍保留保存操作区", async () => {
    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[]}
        initialDetail={detail}
        api={api()}
        positioningVersionId="positioning-1"
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "添加逐字稿" }),
    );

    const dialog = screen.getByRole("dialog");
    const body = dialog.querySelector(
      '[data-slot="transcript-editor-body"]',
    );
    expect(dialog).toHaveClass("max-h-[calc(100dvh-2rem)]", "overflow-hidden");
    expect(body).toHaveClass("min-h-0", "overflow-y-auto");
    expect(screen.getByLabelText("逐字稿正文")).toHaveClass(
      "field-sizing-fixed",
      "max-h-[min(50dvh,28rem)]",
      "overflow-y-auto",
    );
    expect(
      screen.getByRole("button", { name: "保存逐字稿" }).closest(
        '[data-slot="dialog-footer"]',
      ),
    ).toBeInTheDocument();
  });

  it("[T-622] 任一选题候选生成成功后永久锁定逐字稿", () => {
    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[]}
        initialDetail={{
          ...detail,
          transcript: {
            ...detail.transcript,
            status: "done",
            text: "已经参与生成的逐字稿",
          },
          transforms: [
            {
              id: "transform-locked",
              status: "candidate",
              targetTopicId: null,
              outputSnapshot: {
                title: "已生成候选",
                angle: "真实角度",
                differentiation: "差异化",
                sourceSummary: "摘要",
              },
            },
          ],
        }}
        api={api()}
        positioningVersionId="positioning-1"
      />,
    );

    expect(
      screen.getByText("已用于生成选题，逐字稿永久锁定。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "替换逐字稿" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "重新 AI 转写" }),
    ).not.toBeInTheDocument();
  });

  it("[T-546] 生成我的改写稿立即显示局部进度并阻止重复创建，完成后回显编辑卡", async () => {
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
      name: "生成我的改写稿",
    });
    fireEvent.click(generate);

    expect(stub.previewTopic).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("status"),
    ).toHaveTextContent("正在生成改写稿");
    expect(
      screen.getByText(/任务已创建；完成后会自动显示可编辑、可复制的改写稿/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("后台完成后会自动更新当前选题，无需切换选题或页面。"),
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

  it("[T-589] 模型超过 8 秒仍自动跟踪到终态，不要求用户手动刷新", async () => {
    vi.useFakeTimers();
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
    const pending: RadarItemDetail = {
      ...readyDetail,
      transforms: [
        {
          id: "transform-slow",
          status: "candidate",
          taskStatus: "running",
          taskErrorCode: null,
          taskErrorMessage: null,
          outputSnapshot: null,
          targetTopicId: null,
        },
      ],
    };
    const completed: RadarItemDetail = {
      ...readyDetail,
      transforms: [
        {
          ...pending.transforms[0]!,
          taskStatus: "succeeded",
          outputSnapshot: {
            title: "慢模型也会自动回显",
            angle: "真实切入角度",
            differentiation: "本账号差异化",
            sourceSummary: "真实摘要",
            hook: "反差开场",
            structureSteps: ["提出问题", "拆解原因"],
          },
        },
      ],
    };
    stub.previewTopic = vi.fn().mockResolvedValue({
      transform: {
        id: "transform-slow",
        status: "candidate",
        outputSnapshot: null,
        targetTopicId: null,
      },
      task: { id: "task-slow", status: "queued" },
    });
    let reads = 0;
    stub.getItem = vi.fn().mockImplementation(async () => {
      reads += 1;
      return reads > 20 ? completed : pending;
    });

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
    fireEvent.click(
      screen.getByRole("button", { name: "生成我的改写稿" }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });

    expect(reads).toBeGreaterThan(20);
    expect(
      screen.getByDisplayValue("慢模型也会自动回显"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "刷新生成结果" }),
    ).not.toBeInTheDocument();
  });

  it("[T-642] 重新进入后台生成中的当前选题时自动续接，读取抖动后仍回显选题卡", async () => {
    vi.useFakeTimers();
    const stub = api();
    const pending: RadarItemDetail = {
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
      transforms: [
        {
          id: "transform-resume",
          status: "candidate",
          taskStatus: "running",
          taskErrorCode: null,
          taskErrorMessage: null,
          outputSnapshot: null,
          targetTopicId: null,
        },
      ],
    };
    const completed: RadarItemDetail = {
      ...pending,
      transforms: [
        {
          ...pending.transforms[0]!,
          taskStatus: "succeeded",
          outputSnapshot: {
            title: "无需切换选题即可看到的新卡片",
            angle: "当前选题角度",
            differentiation: "本账号差异化",
            sourceSummary: "真实摘要",
            hook: "自动回显",
            structureSteps: ["拆解", "生成", "回显"],
          },
        },
      ],
    };
    stub.getItem = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary network error"))
      .mockResolvedValue(completed);

    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[]}
        initialDetail={pending}
        positioningVersionId="positioning-v1"
        api={stub}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(stub.getItem).toHaveBeenCalledTimes(2);
    expect(
      screen.getByDisplayValue("无需切换选题即可看到的新卡片"),
    ).toBeInTheDocument();
  });

  it("[T-870] 生成完成的雷达选题可一次确认并升级为项目", async () => {
    const stub = api();
    vi.mocked(stub.confirmTopic).mockResolvedValue({
      topicId: "candidate-radar-1",
    });
    vi.mocked(stub.promoteCandidate).mockResolvedValue({
      projectId: "project-radar-1",
    });

    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[]}
        positioningVersionId="positioning-v1"
        initialDetail={{
          ...detail,
          transcript: {
            ...detail.transcript,
            status: "done",
            text: "来源完整逐字稿",
          },
          snapshots: [
            {
              id: "snapshot-upgrade",
              title: "真实作品",
              capturedAt: "2026-07-23T12:00:00.000Z",
              finalUrl: detail.item.canonicalUrl,
            },
          ],
          transforms: [
            {
              id: "transform-upgrade",
              status: "candidate",
              taskStatus: "succeeded",
              taskErrorCode: null,
              taskErrorMessage: null,
              targetTopicId: null,
              outputSnapshot: {
                hook: "反常识开场",
                structureSteps: ["提出误区", "给出方法"],
                coreClaims: ["流程决定交付"],
                reusablePattern: "误区—方法",
                factRisks: [],
                title: "先稳定流程，再选择模型",
                angle: "从真实交付切入",
                differentiation: "使用本账号案例",
                sourceSummary: "来源讨论模型和流程",
                targetAudience: "AI 业务负责人",
                audiencePain: "交付结果不稳定",
                coreConflict: "模型参数与流程责任的冲突",
                format: "案例复盘口播",
                contentRole: "traffic",
                contentRoleReason: "原作靠共同处境吸引观看，本账号可用同类问题吸引业务负责人。",
                adaptationStrategy: {
                  keep: ["反常识结构"],
                  replace: ["来源案例"],
                  add: ["本账号经验"],
                  avoid: ["照搬原句"],
                },
                adaptedDraft: {
                  contentText: "这是一版基于逐字稿生成的完整改写初稿。",
                  generatedFromTranscriptHash: "sha256:transcript",
                  strategyHash: "sha256:strategy",
                  templateVersion: "intelligence-topic-draft-v1",
                },
                generationProgress: {
                  decomposition: { status: "completed" },
                  topic: { status: "completed" },
                  draft: { status: "completed" },
                },
              },
            },
          ],
        }}
        api={stub}
      />,
    );

    expect(screen.getByText("原推荐：流量型")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("选题候选内容目的"), "conversion");
    expect(screen.getByText(/当前初稿仍是原推荐下的参考稿/)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "一键升级项目" }),
    );

    await waitFor(() =>
      expect(stub.confirmTopic).toHaveBeenCalledWith(
        expect.objectContaining({
          transformId: "transform-upgrade",
          editedCandidate: expect.objectContaining({ contentRole: "conversion" }),
          idempotencyKey: expect.stringMatching(/^topic-confirm:/),
        }),
      ),
    );
    expect(stub.promoteCandidate).toHaveBeenCalledWith({
      candidateId: "candidate-radar-1",
    });
    expect(push).toHaveBeenCalledWith("/projects/project-radar-1");
  });

  it("[T-900] 只有改写初稿时也可写入选题池或一键升级项目", async () => {
    const stub = api();
    vi.mocked(stub.confirmTopic).mockResolvedValue({
      topicId: "candidate-partial-radar",
    });
    vi.mocked(stub.promoteCandidate).mockResolvedValue({
      projectId: "project-partial-radar",
    });

    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[]}
        positioningVersionId="positioning-v1"
        initialDetail={{
          ...detail,
          transcript: {
            ...detail.transcript,
            status: "done",
            text: "来源完整逐字稿",
          },
          transforms: [
            {
              id: "transform-partial-upgrade",
              status: "candidate",
              taskStatus: "succeeded",
              taskErrorCode: null,
              taskErrorMessage: null,
              targetTopicId: null,
              outputSnapshot: {
                title: "",
                angle: "",
                differentiation: "",
                sourceSummary: "",
                targetAudience: "",
                audiencePain: "",
                coreConflict: "",
                format: "",
                adaptationStrategy: {
                  keep: [],
                  replace: [],
                  add: [],
                  avoid: [],
                },
                adaptedDraft: {
                  contentText: "这是已经可用的本账号改写逐字稿。",
                  generatedFromTranscriptHash: "sha256:transcript",
                  strategyHash: "sha256:strategy",
                  templateVersion: "intelligence-topic-draft-v1",
                },
                generationProgress: {
                  decomposition: { status: "completed" },
                  topic: { status: "completed" },
                  draft: { status: "completed" },
                },
              },
            },
          ],
        }}
        api={stub}
      />,
    );

    expect(
      screen.getByRole("button", { name: "确认写入选题池" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "一键升级项目" }),
    ).toBeEnabled();

    await userEvent.click(
      screen.getByRole("button", { name: "一键升级项目" }),
    );

    await waitFor(() =>
      expect(stub.confirmTopic).toHaveBeenCalledWith(
        expect.objectContaining({
          transformId: "transform-partial-upgrade",
          editedCandidate: expect.objectContaining({
            title: "",
            audiencePain: "",
            coreConflict: "",
            format: "",
          }),
        }),
      ),
    );
    expect(stub.promoteCandidate).toHaveBeenCalledWith({
      candidateId: "candidate-partial-radar",
    });
    expect(push).toHaveBeenCalledWith("/projects/project-partial-radar");
  });

  it("[T-870] 已写入选题池的雷达候选直接升级，不重复确认", async () => {
    const stub = api();
    vi.mocked(stub.promoteCandidate).mockResolvedValue({
      projectId: "project-existing-topic",
    });

    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[]}
        positioningVersionId="positioning-v1"
        initialDetail={{
          ...detail,
          transcript: {
            ...detail.transcript,
            status: "done",
            text: "来源完整逐字稿",
          },
          transforms: [
            {
              id: "transform-confirmed",
              status: "confirmed",
              taskStatus: "succeeded",
              taskErrorCode: null,
              taskErrorMessage: null,
              targetTopicId: "candidate-existing",
              outputSnapshot: {
                title: "已经保存的选题",
                angle: "真实角度",
                differentiation: "真实差异化",
                sourceSummary: "真实来源",
                targetAudience: "目标观众",
                audiencePain: "真实痛点",
                coreConflict: "真实冲突",
                format: "口播",
                adaptationStrategy: {
                  keep: ["结构"],
                  replace: ["案例"],
                  add: ["经验"],
                  avoid: ["照搬"],
                },
                adaptedDraft: {
                  contentText: "已经确认的改写稿。",
                  generatedFromTranscriptHash: "sha256:transcript",
                  strategyHash: "sha256:strategy",
                  templateVersion: "intelligence-topic-draft-v1",
                },
              },
            },
          ],
        }}
        api={stub}
      />,
    );

    expect(screen.getByLabelText("选题候选内容目的")).toBeDisabled();
    expect(screen.getByText("原推荐：未推荐")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "一键升级项目" }),
    );

    await waitFor(() =>
      expect(stub.promoteCandidate).toHaveBeenCalledWith({
        candidateId: "candidate-existing",
      }),
    );
    expect(stub.confirmTopic).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/projects/project-existing-topic");
  });

  it("[T-870] 项目创建失败时保留已确认选题并允许幂等重试", async () => {
    const stub = api();
    const confirmedDetail: RadarItemDetail = {
      ...detail,
      transcript: {
        ...detail.transcript,
        status: "done",
        text: "来源完整逐字稿",
      },
      transforms: [
        {
          id: "transform-retry-project",
          status: "confirmed",
          taskStatus: "succeeded",
          targetTopicId: "candidate-retry-project",
          outputSnapshot: {
            title: "保留的选题",
            angle: "真实角度",
            differentiation: "真实差异化",
            sourceSummary: "真实来源",
            targetAudience: "目标观众",
            audiencePain: "真实痛点",
            coreConflict: "真实冲突",
            format: "口播",
            adaptationStrategy: {
              keep: ["结构"],
              replace: ["案例"],
              add: ["经验"],
              avoid: ["照搬"],
            },
            adaptedDraft: {
              contentText: "已经确认且不会因立项失败丢失的改写稿。",
              generatedFromTranscriptHash: "sha256:transcript",
              strategyHash: "sha256:strategy",
              templateVersion: "intelligence-topic-draft-v1",
            },
          },
        },
      ],
    };
    vi.mocked(stub.getItem).mockResolvedValue(confirmedDetail);
    vi.mocked(stub.promoteCandidate).mockRejectedValueOnce(
      new Error("temporary project failure"),
    );

    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[]}
        initialDetail={confirmedDetail}
        api={stub}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "一键升级项目" }),
    );

    expect(
      await screen.findByText(
        "选题已保留，但项目创建未完成。请重试「一键升级项目」，不会重复创建。",
      ),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "一键升级项目" }),
    ).toBeEnabled();
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
      screen.getByRole("button", { name: "生成我的改写稿" }),
    );

    expect(
      (await screen.findAllByText("模型没有返回可解析的选题结构"))[0],
    ).toBeInTheDocument();
    expect(screen.getByText("错误代码：MODEL_PROTOCOL_ERROR")).toBeInTheDocument();
    expect(
      screen.queryByText("候选仍在后台生成"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "重新生成改写稿" }),
    ).toBeEnabled();
  });

  it("[T-1022] 改写阶段暂时失败保留已有结果并由原任务自动恢复", async () => {
    const stub = api();
    vi.mocked(stub.previewTopic).mockResolvedValue({
      transform: {
        id: "transform-retry",
        status: "candidate",
        outputSnapshot: null,
        targetTopicId: null,
      },
      task: { id: "task-retry", status: "queued" },
    });
    vi.mocked(stub.getItem).mockImplementation(() => new Promise(() => {}));
    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[]}
        initialDetail={{
          ...detail,
          transcript: {
            ...detail.transcript,
            status: "done",
            text: "来源完整逐字稿",
          },
          snapshots: [
            {
              id: "snapshot-partial",
              title: "真实作品",
              capturedAt: "2026-07-23T12:00:00.000Z",
              finalUrl: detail.item.canonicalUrl,
            },
          ],
          transforms: [
            {
              id: "transform-partial",
              status: "candidate",
              taskStatus: "queued",
              taskRuntimeStatus: "retry_wait",
              taskErrorCode: "TOPIC_PREVIEW_OUTPUT_INVALID",
              taskErrorMessage: "模型输出不完整，系统正在继续生成选题卡",
              targetTopicId: null,
              outputSnapshot: {
                hook: "反常识开场",
                structureSteps: ["提出误区", "给出新方法"],
                coreClaims: ["流程比参数优先"],
                reusablePattern: "误区—方法",
                factRisks: [],
                title: "先稳定流程，再选择模型",
                angle: "从交付现场切入",
                differentiation: "不用来源案例",
                sourceSummary: "来源讨论模型与工作流",
                targetAudience: "业务负责人",
                audiencePain: "交付不稳定",
                coreConflict: "参数与流程优先级",
                format: "复盘口播",
                adaptationStrategy: {
                  keep: ["反常识结构"],
                  replace: ["来源案例"],
                  add: ["本账号经验"],
                  avoid: ["照搬原句"],
                },
                generationProgress: {
                  decomposition: { status: "completed" },
                  topic: { status: "completed" },
                  draft: { status: "failed" },
                },
              },
            },
          ],
        }}
        api={stub}
        positioningVersionId="positioning-1"
      />,
    );

    expect(screen.getByText("反常识开场")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("先稳定流程，再选择模型"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("拆解和选题已保留，正在重试改写初稿"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重试生成选题卡" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认写入选题池" })).toBeDisabled();

    expect(stub.previewTopic).not.toHaveBeenCalled();
  });

  it("[T-1022] 没有可用模型时保留原选题任务并直达模型设置", () => {
    const stub = api();
    render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[]}
        initialDetail={{
          ...detail,
          transcript: { ...detail.transcript, status: "done", text: "来源完整逐字稿" },
          snapshots: [{
            id: "snapshot-model-setup",
            title: "真实作品",
            capturedAt: "2026-07-23T12:00:00.000Z",
            finalUrl: detail.item.canonicalUrl,
          }],
          transforms: [{
            id: "transform-model-setup",
            status: "candidate",
            taskStatus: "blocked",
            taskRuntimeStatus: "waiting_user",
            taskErrorCode: "MODEL_CONFIGURATION_REQUIRED",
            taskErrorMessage: "还没有可用的 AI 模型，请完成模型设置后继续原任务",
            outputSnapshot: null,
            targetTopicId: null,
          }],
        }}
        api={stub}
        positioningVersionId="positioning-1"
      />,
    );

    expect(screen.getByText("完成 AI 设置后继续")).toBeInTheDocument();
    const settings = document.querySelector('[data-slot="radar-model-settings-link"]') as HTMLAnchorElement;
    expect(settings?.getAttribute("href")).toBe("/settings?highlight=text-model");
    expect(screen.queryByRole("button", { name: "重新生成" })).not.toBeInTheDocument();
  });

  it.each([
    ["成功但未采纳", "candidate" as const, null],
    ["已采纳且下游选题已淘汰", "confirmed" as const, "topic-dropped"],
  ])(
    "[T-744] %s 时可直接重新生成改写稿，活动任务期间旧稿只读且不可误采纳",
    async (_label, status, targetTopicId) => {
      const stub = api();
      vi.mocked(stub.previewTopic).mockResolvedValue({
        transform: {
          id: "transform-rewrite-retry",
          status: "candidate",
          outputSnapshot: null,
          targetTopicId: null,
        },
        task: { id: "task-rewrite-retry", status: "queued" },
      });
      vi.mocked(stub.getItem).mockImplementation(() => new Promise(() => {}));
      render(
        <IntelligenceWorkbench
          accountId="account-1"
          workspace={workspace}
          items={[]}
          positioningVersionId="positioning-v1"
          initialDetail={{
            ...detail,
            transcript: {
              ...detail.transcript,
              status: "done",
              text: "来源完整逐字稿",
            },
            snapshots: [
              {
                id: "snapshot-rewrite-retry",
                title: "真实作品",
                capturedAt: "2026-07-23T12:00:00.000Z",
                finalUrl: detail.item.canonicalUrl,
              },
            ],
            transforms: [
              {
                id: "transform-completed",
                status,
                taskStatus: "succeeded",
                taskErrorCode: null,
                taskErrorMessage: null,
                targetTopicId,
                outputSnapshot: {
                  hook: "反常识开场",
                  structureSteps: ["提出误区", "给出新方法"],
                  coreClaims: ["流程比参数优先"],
                  reusablePattern: "误区—方法",
                  factRisks: [],
                  title: "先稳定流程，再选择模型",
                  angle: "从交付现场切入",
                  differentiation: "不用来源案例",
                  sourceSummary: "来源讨论模型与工作流",
                  targetAudience: "业务负责人",
                  audiencePain: "交付不稳定",
                  coreConflict: "参数与流程优先级",
                  format: "复盘口播",
                  adaptationStrategy: {
                    keep: ["反常识结构"],
                    replace: ["来源案例"],
                    add: ["本账号经验"],
                    avoid: ["照搬原句"],
                  },
                  adaptedDraft: {
                    contentText: "这是一版已经成功但用户想重试的改写稿。",
                    generatedFromTranscriptHash: "sha256:transcript",
                    strategyHash: "sha256:strategy",
                    templateVersion: "intelligence-topic-draft-v1",
                  },
                  generationProgress: {
                    decomposition: { status: "completed" },
                    topic: { status: "completed" },
                    draft: { status: "completed" },
                  },
                },
              },
            ],
          }}
          api={stub}
        />,
      );

      if (status === "confirmed") {
        expect(screen.getByText("已采纳过")).toBeInTheDocument();
      }
      await userEvent.click(
        screen.getByRole("button", { name: "重新生成改写稿" }),
      );
      await waitFor(() =>
        expect(stub.previewTopic).toHaveBeenCalledWith({
          itemId: "item-1",
          sourceSnapshotId: "snapshot-rewrite-retry",
          positioningVersionId: "positioning-v1",
          idempotencyKey: expect.stringMatching(/^topic-preview:/),
        }),
      );

      expect(
        screen.getByDisplayValue("这是一版已经成功但用户想重试的改写稿。"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "确认写入选题池" }),
      ).toBeDisabled();
      expect(screen.getByLabelText("选题候选标题")).toBeDisabled();
      expect(
        screen.queryByRole("button", { name: "重新生成改写稿" }),
      ).not.toBeInTheDocument();
      expect(stub.confirmTopic).not.toHaveBeenCalled();
    },
  );

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
    stub.importDouyinShare = vi.fn().mockResolvedValue({ task: {
      id: "import-task", userId: "user-1", accountId: "account-1", kind: "share_import", ownerType: "item_import", ownerId: "import-1", status: "succeeded", createdAt: "2026-09-30T00:00:00Z", updatedAt: "2026-09-30T00:00:00Z",
    } });
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
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});


it("[T-1022] 空组真实工作台可新建分类并预检公开网页，无须绑定平台账号", async () => {
  const stub=api();vi.mocked(stub.listCollectors).mockResolvedValue([]);
  render(<IntelligenceWorkbench groupId="empty-group" workspace={workspace} items={[]} initialDetail={null} api={stub}/>);
  fireEvent.click(screen.getByRole("button",{name:"新建分类"}));
  fireEvent.change(screen.getByLabelText("分类名称"),{target:{value:"组内公开来源"}});
  fireEvent.click(screen.getByRole("button",{name:"创建分类"}));
  await waitFor(()=>expect(stub.createCollection).toHaveBeenCalledWith(expect.objectContaining({groupId:"empty-group",accountId:undefined,name:"组内公开来源"})));
  fireEvent.click(screen.getByRole("button",{name:"添加来源"}));
  const dialog=screen.getByRole("dialog");
  const input=within(dialog).getByPlaceholderText(/https/);
  fireEvent.change(input,{target:{value:"https://example.com/public"}});
  fireEvent.click(within(dialog).getByRole("button",{name:"测试来源"}));
  await waitFor(()=>expect(stub.previewWeb).toHaveBeenCalledWith(expect.objectContaining({groupId:"empty-group",accountId:undefined,url:"https://example.com/public"})));
});

it("[T-1022] 两个空组切换卸载旧组列表及详情，旧筛选与迟到列表不污染新组", async () => {
  const stub=api();let finish!:(value:Awaited<ReturnType<RadarApi["listItems"]>>)=>void;
  vi.mocked(stub.listItems).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const mounted=render(<IntelligenceWorkbench groupId="group-a" workspace={workspace} items={[{item:detail.item,latestMetric:null,sourceCount:0}]} initialDetail={detail} api={stub}/>);
  fireEvent.click(screen.getByRole("button",{name:/我的收藏/}));
  mounted.rerender(<IntelligenceWorkbench groupId="group-b" workspace={workspace} items={[]} initialDetail={null} api={stub}/>);
  await act(async()=>{finish({items:[{item:detail.item,latestMetric:null,sourceCount:0}],page:1,pageSize:100,total:1,hasMore:false});});
  expect(screen.queryByText("真实作品")).toBeNull();
  expect(screen.getByText("先添加一个真实来源")).toBeInTheDocument();
});

it('[T-1022] 空组已有公开素材可以提交改写候选，未保存定位不要求平台账号',async()=>{
 const stub=api();const ready={...detail,snapshots:[{id:'group-snapshot',title:'真实作品',capturedAt:'2026-10-04T00:00:00Z',finalUrl:detail.item.canonicalUrl}],transcript:{...detail.transcript,status:'done' as const,text:'已有公开素材的完整逐字稿'}};
 vi.mocked(stub.getItem).mockResolvedValue(ready);
 vi.mocked(stub.previewTopic).mockResolvedValue({transform:{id:'group-transform',status:'candidate',outputSnapshot:null,targetTopicId:null},task:{id:'group-task',status:'queued'}});
 render(<IntelligenceWorkbench groupId='empty-group' workspace={workspace} items={[]} initialDetail={ready} api={stub}/>);
 await userEvent.click(screen.getByRole('button',{name:'生成我的改写稿'}));
 expect(stub.previewTopic).toHaveBeenCalledWith(expect.objectContaining({itemId:detail.item.id,sourceSnapshotId:'group-snapshot'}));
 expect(vi.mocked(stub.previewTopic).mock.calls[0]![0]).not.toHaveProperty('accountId');
 expect(vi.mocked(stub.previewTopic).mock.calls[0]![0]).not.toHaveProperty('positioningVersionId');
});

  it("分享文本 queued 回执保持排队，未完成时不刷新或自动转写", async () => {
    const stub = api();
    vi.mocked(stub.importDouyinShare).mockResolvedValue({
      task: executionTaskResourceV2.parse({
        id: "share-import-1",
        userId: "user-1",
        accountId: "account-1",
        kind: "share_import",
        ownerType: "item_import",
        ownerId: "share-import-1",
        status: "queued",
        priority: 0,
        idempotencyKey: "share-import-1",
        checkpoint: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        attempt: 0,
        maxAttempts: 3,
        errorCode: null,
        errorMessage: null,
        costEstimate: null,
        createdAt: "2026-09-20T00:00:00.000Z",
        updatedAt: "2026-09-20T00:00:00.000Z",
      }),
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
    expect(await screen.findByText("已排队")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
