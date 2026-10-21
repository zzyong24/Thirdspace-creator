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
    expect(await screen.findByRole("link",{name:"查看项目：真实作品"})).toHaveAttribute("href","/projects/project-actual");
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
    vi.mocked(stub.getItem).mockImplementation(async (itemId) => ({...detail, item: {...detail.item, id: itemId, title: itemId === "item-2" ? "第二个作品" : "真实作品"}}));
    expect(screen.queryByRole("button", {name: "升级为项目"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: /真实作品/}));
    const first = await screen.findByRole("button", {name: "升级为项目"});
    fireEvent.click(first); fireEvent.click(first);
    fireEvent.click(screen.getByRole("button", {name: /第二个作品/}));
    const second = await screen.findByRole("button", {name: "升级为项目"});
    fireEvent.click(second);
    expect(stub.enqueueProjectUpgrades).toHaveBeenCalledTimes(2);
    expect(stub.enqueueProjectUpgrades).toHaveBeenNthCalledWith(2,expect.objectContaining({itemIds:["item-2"],positioningVersionId:"position-1"}));
  });
  it("雷达只选方案：详情不提供 AI 转写或改写，只用唯一的升级为项目入口", async()=>{
    const stub=api();
    stub.listProjectUpgrades=vi.fn().mockResolvedValue({tasks:[],total:0});
    stub.enqueueProjectUpgrades=vi.fn().mockResolvedValue({tasks:[]});
    render(<IntelligenceWorkbench accountId="account-1" workspace={workspace} positioningVersionId="position-1" items={[{item:detail.item,latestMetric:null,sourceCount:1}]} initialDetail={detail} api={stub}/>);
    expect(screen.getByRole("heading",{name:"04 选定方案"})).toBeInTheDocument();
    expect(screen.queryByRole("button",{name:/AI 转写/})).toBeNull();
    expect(screen.queryByRole("button",{name:/生成我的改写稿/})).toBeNull();
    expect(screen.queryByRole("button",{name:/添加逐字稿|替换逐字稿/})).toBeNull();
    const upgrade=document.querySelector('[data-slot="radar-upgrade-button"]') as HTMLButtonElement;
    expect(upgrade).toHaveTextContent("升级为项目");
    expect(screen.getAllByRole("button", {name: "升级为项目"})).toHaveLength(1);
    fireEvent.click(upgrade);
    await waitFor(()=>expect(stub.enqueueProjectUpgrades).toHaveBeenCalledWith(expect.objectContaining({itemIds:[detail.item.id],positioningVersionId:"position-1"})));
    expect(stub.enqueueTranscript).not.toHaveBeenCalled();
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
    expect(layout.className).toContain("layout");
    expect(layout.className).not.toContain("xl:grid-cols");
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
    expect(layout.className).toContain("layout");
    const detailRegion = screen
      .getByTestId("intelligence-detail")
      .parentElement;
    expect(detailRegion).not.toHaveClass("xl:col-span-2");
    expect(detailRegion).toHaveAttribute("data-slot", "radar-detail-pane");
    const sourceStep=screen.getByRole("heading",{name:"01 来源与采集"});
    const pickStep=screen.getByRole("heading",{name:"02 挑选内容"});
    const readStep=screen.getByRole("heading",{name:"03 阅读核对"});
    const createStep=screen.getByRole("heading",{name:"04 选定方案"});
    expect(sourceStep.compareDocumentPosition(pickStep)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pickStep.compareDocumentPosition(readStep)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(readStep.compareDocumentPosition(createStep)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const transcript=screen.getByRole("heading",{name:"逐字稿"});
    const evidence=screen.getByRole("heading",{name:"来源证据"});
    expect(transcript.compareDocumentPosition(evidence)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(evidence.compareDocumentPosition(createStep)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it("[T-1384] 列表展示已有封面缩略图，详情不渲染大图占位", () => {
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

    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector("img")).toHaveAttribute("width", "48");
    expect(within(screen.getByTestId("intelligence-detail")).queryByRole("img")).not.toBeInTheDocument();
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

  it("收藏与黑马发现按分组卡片呈现：说明、计数徽标与真实空态（无假按钮）", () => {
    const { container } = render(
      <IntelligenceWorkbench
        accountId="account-1"
        workspace={workspace}
        items={[]}
        initialDetail={null}
        api={api()}
      />,
    );
    const groups = container.querySelectorAll('[data-slot="radar-collection-group"]');
    expect(groups).toHaveLength(2);
    const fav = screen.getByRole("region", { name: "我的收藏分组" });
    const dh = screen.getByRole("region", { name: "黑马发现分组" });
    expect(within(fav).getByText("抖音收藏夹同步的作品")).toBeInTheDocument();
    expect(within(dh).getByText("热点宝关键词命中的黑马作品")).toBeInTheDocument();
    expect(within(fav).getByRole("button", { name: /^我的收藏/ })).toHaveAttribute("aria-pressed", "false");
    expect(fav.querySelector('[data-slot="radar-collection-empty"]')?.textContent).toMatch(/还没有绑定收藏夹/);
    expect(dh.querySelector('[data-slot="radar-collection-empty"]')?.textContent).toMatch(/还没有黑马关键词/);
    // 空态只说明下一步，不另造按钮。
    expect(within(fav).getAllByRole("button")).toHaveLength(1);
    expect(within(dh).getAllByRole("button")).toHaveLength(1);
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
      screen.getByText(/升级为项目后，会在项目里自动转写正文/),
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
    // jsdom 不计算容器查询；验证大屏调宽的处理器与存储值，显隐由样式契约覆盖。
    const pane = screen.getByTestId("intelligence-detail");
    const separator = pane.parentElement!.querySelector<HTMLElement>('[role="separator"]')!;
    expect(separator).toHaveAttribute("aria-label", "调整作品详情宽度");
    expect(separator).toHaveAttribute("aria-valuenow", "392");
    expect(pane.parentElement!.style.getPropertyValue("--detail-width")).toBe("392px");
    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(separator).toHaveAttribute("aria-valuenow", "416");
    expect(pane.parentElement!.style.getPropertyValue("--detail-width")).toBe("416px");
    expect(pane).toHaveAttribute("tabindex", "0");
  });

  it("[T-1384/T-514/T-546] 长来源名有完整提示，管理菜单仍能打开运行记录", async () => {
    const stub = api();
    const sourceWorkspace: RadarWorkspace = {
      ...workspace,
      sources: [
        {
          id: "source-1",
          collectionId: "collection-darkhorse",
          type: "darkhorse_query",
          displayName: "爆款选题观察与创作者工具收藏",
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

    const sync = screen.getByRole("button", { name: "同步 爆款选题观察与创作者工具收藏" });
    expect(sync).toHaveTextContent("同步");
    expect(sync).not.toHaveClass("opacity-0");
    const sourceRow = screen.getByTestId("radar-source-row-source-1");
    expect(sourceRow).toHaveClass("overflow-hidden");
    const name = within(sourceRow).getByText("爆款选题观察与创作者工具收藏");
    expect(name).not.toHaveClass("truncate");
    expect(name).not.toHaveClass("whitespace-nowrap");
    expect(within(sourceRow).getByText("尚未同步")).not.toHaveClass("truncate");
    const actions = within(sourceRow).getByRole("group", { name: "爆款选题观察与创作者工具收藏的来源操作" });
    expect(within(actions).getByRole("button", { name: "同步 爆款选题观察与创作者工具收藏" })).toBe(sync);
    expect(within(actions).getAllByRole("button")).toHaveLength(2);
    expect(name).toHaveAttribute("title", "爆款选题观察与创作者工具收藏");
    expect(actions).not.toContainElement(name);
    expect(actions).not.toContainElement(within(sourceRow).getByText("无需登录账号 · 自动"));
    await userEvent.click(screen.getByRole("button", {name: "管理 爆款选题观察与创作者工具收藏"}));
    expect(screen.getByRole("menuitem", {name: "暂停 爆款选题观察与创作者工具收藏 的每日自动同步"})).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("menuitem", { name: "查看 爆款选题观察与创作者工具收藏 的运行记录" }),
    );
    expect(
      await screen.findByRole("heading", { name: "爆款选题观察与创作者工具收藏 · 运行记录" }),
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

    await userEvent.click(screen.getByRole("button", {name: "管理 AI 工具"}));
    await userEvent.click(screen.getByRole("menuitem", {name: "移除 AI 工具"}));

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
    await userEvent.click(screen.getByRole("button", {name: "管理 AI 工具"}));
    await userEvent.click(screen.getByRole("menuitem", {name: "移除 AI 工具"}));
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

    await userEvent.click(screen.getByRole("button", {name: "管理 行业观察"}));
    await userEvent.click(screen.getByRole("menuitem", {name: "移除 行业观察"}));
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

  it("[T-665] 同步中的来源明确禁用移除，不能误调用删除接口", async () => {
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

    await userEvent.click(screen.getByRole("button", {name: "管理 行业观察"}));
    const remove = screen.getByRole("menuitem", {
      name: "同步中，暂时不能移除 行业观察",
    });
    expect(remove).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(remove);
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

    await userEvent.click(screen.getByRole("button", {name: "管理 示例博主"}));
    await userEvent.click(
      screen.getByRole("menuitem", {
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

it("来源管理只展示来源任务，入口仍打开原对话框", async () => {
  render(<IntelligenceWorkbench presentation="sources" groupId="sources-only-empty" workspace={workspace} items={[]} initialDetail={null} api={api()}/>);
  expect(screen.getByRole("heading",{name:"真实来源"})).toBeVisible();
  expect(screen.getByRole("heading",{name:"从添加一个来源开始"})).toBeVisible();
  expect(screen.queryByRole("heading",{name:"02 挑选内容"})).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox",{name:"搜索雷达内容"})).not.toBeInTheDocument();
  expect(screen.queryByRole("separator",{name:"调整作品详情宽度"})).not.toBeInTheDocument();
  for (const [name,title] of [["添加来源","添加真实来源"],["粘贴分享链接","从抖音分享链接建档"],["新建分类","新建监控分类"]]) {
    await userEvent.click(screen.getByRole("button",{name}));
    expect(screen.getByRole("dialog",{name:title})).toBeVisible();
    await userEvent.keyboard("{Escape}");
  }
});

it("来源目录选择仅切换真实状态概览，筛选和原同步入口保留", async () => {
  const sourceWorkspace:RadarWorkspace={...workspace,sources:[{id:"source-preview-web",collectionId:null,type:"web",displayName:"来源布局样例",canonicalUrl:"https://example.com",collector:null,monitorEnabled:false,syncPolicy:{mode:"manual"},status:"active",lastRunAt:null,nextRunAt:null,version:1}]};
  const calls=api();
  render(<IntelligenceWorkbench presentation="sources" groupId="sources-only-selected" workspace={sourceWorkspace} items={[]} initialDetail={null} api={calls}/>);
  await userEvent.click(screen.getByRole("button",{name:/来源布局样例.*网页/}));
  expect(screen.getByRole("button",{name:/来源布局样例.*网页/})).toHaveAttribute("aria-pressed","true");
  const overview=screen.getByRole("region",{name:"来源采集概览"});
  expect(within(overview).getByRole("heading",{name:"来源布局样例"})).toBeVisible();
  expect(within(overview).getByText("已暂停")).toBeVisible();
  expect(within(overview).getByText("未安排")).toBeVisible();
  expect(within(overview).getByRole("link",{name:"查看来源原链接"})).toHaveAttribute("href","https://example.com");
  expect(calls.listItems).not.toHaveBeenCalled();
  expect(screen.getByRole("button",{name:"同步 来源布局样例"})).toBeEnabled();
  await userEvent.click(screen.getByRole("button",{name:"管理 来源布局样例"}));
  expect(screen.getByRole("menuitem",{name:"恢复 来源布局样例 的每日自动同步"})).not.toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("menuitem",{name:"移除 来源布局样例"})).not.toHaveAttribute("aria-disabled", "true");
  await userEvent.keyboard("{Escape}");
  await userEvent.type(screen.getByRole("searchbox",{name:"筛选来源"}),"不存在的来源");
  expect(screen.getByText("没有匹配的来源")).toBeVisible();
  expect(screen.queryByRole("button",{name:"同步 来源布局样例"})).not.toBeInTheDocument();
});

it.each(["unknown", "provider_new_state"])("未知转写状态 %s 显示通用状态，正文和升级入口仍可用", async (status) => {
 const stub=api();
 stub.listProjectUpgrades=vi.fn().mockResolvedValue({tasks:[],total:0});
 stub.enqueueProjectUpgrades=vi.fn().mockResolvedValue({tasks:[]});
 render(<IntelligenceWorkbench accountId="account-1" workspace={workspace} positioningVersionId="position-1" items={[]} initialDetail={{...detail,transcript:{...detail.transcript,status:status as RadarItemDetail["transcript"]["status"],text:"保留的真实逐字稿"}}} api={stub}/>);
 expect(screen.getByText("状态未知")).toBeInTheDocument();
 expect(screen.getByText("保留的真实逐字稿")).toBeInTheDocument();
 expect(screen.getByRole("button",{name:"升级为项目"})).toBeEnabled();
 expect(stub.enqueueProjectUpgrades).not.toHaveBeenCalled();
 expect(stub.enqueueTranscript).not.toHaveBeenCalled();
});

it("T-1384 作品行显示已有封面、完整标题提示，缺封面诚实留空且选择仍有效", async () => {
  const stub = api();
  const title = "长作品标题".repeat(45);
  render(<IntelligenceWorkbench accountId="density-cover" workspace={workspace} items={[
    { item: {...detail.item, title, coverUrl: "https://example.com/cover.jpg"}, latestMetric: {...detail.metrics[0], likeCount: 12800000}, sourceCount: 2 },
    { item: {...detail.item, id: "no-cover", title: "山"}, latestMetric: {...detail.metrics[0], likeCount: 0}, sourceCount: 1 },
  ]} initialDetail={null} api={stub}/>);
  const cover = screen.getByRole("img", {name: `${title}的封面`});
  expect(cover).toHaveAttribute("src", "https://example.com/cover.jpg");
  expect(cover).toHaveAttribute("loading", "lazy");
  expect(screen.getByText(title)).toHaveAttribute("title", title);
  expect(screen.getAllByRole("img")).toHaveLength(1);
  expect(screen.getByText("赞 0")).toBeInTheDocument();
  fireEvent.error(cover);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  await userEvent.click(screen.getByText(title));
  expect(stub.getItem).toHaveBeenCalledWith("item-1");
});

it("T-1384 自定义子分类保留真实父级名称提示和目录层级", () => {
  const name = "很长的子分类名称".repeat(12);
  render(<IntelligenceWorkbench accountId="density-group" workspace={{...workspace, collections:[...workspace.collections, {
    id:"child", parentId:"collection-favorites", name, kind:"custom", sortOrder:2, version:1,
  }]}} items={[]} initialDetail={null} api={api()}/>);
  const child = screen.getByRole("region", {name:`${name}分组`});
  expect(child).toHaveAttribute("data-parent-collection", "我的收藏");
  expect(within(child).getByText(name)).toHaveAttribute("title", `我的收藏 / ${name}`);
});

it.each([
  ["failed", "升级失败"], ["blocked", "升级受阻"], ["paused", "升级已暂停"],
  ["cancelled", "升级已取消"], ["queued", "升级排队中"],
])("T-1384 作品卡的 %s 显示状态，继续或重试入口只在详情", async (status, label) => {
  const stub = api();
  stub.enqueueProjectUpgrades = vi.fn();
  stub.listProjectUpgrades = vi.fn().mockResolvedValue({tasks:[{
    id:"upgrade-state", accountId:"state-account", ownerId:detail.item.id, status,
    checkpoint:null, errorMessage: status === "failed" ? "来源暂不可读，原任务已保留" : null,
    createdAt:"2026-10-21T00:00:00Z",
  }],total:1});
  render(<IntelligenceWorkbench accountId="state-account" workspace={workspace} items={[{item:detail.item, latestMetric:null, sourceCount:1}]} initialDetail={null} api={stub}/>);
  expect(await screen.findByText(label)).toBeInTheDocument();
  expect(screen.queryByRole("button", {name:/升级为项目|重试升级|继续升级|重新加入队列/})).not.toBeInTheDocument();
  if (status === "failed") expect(screen.getByText(label)).toHaveAttribute("title", "来源暂不可读，原任务已保留");
});

it("T-1384 需登录来源醒目标识、按可见状态筛选，管理菜单支持键盘开关", async () => {
  const stub = api();
  const source = {id:"login-source", collectionId:null, type:"favorites_folder" as const, displayName:"登录过期的来源", canonicalUrl:null, collector:null, monitorEnabled:true, syncPolicy:{mode:"manual" as const}, status:"active" as const, lastRunAt:null, nextRunAt:null, version:1};
  render(<IntelligenceWorkbench accountId="status-search" workspace={{...workspace, sources:[source], health:[{
    sourceId:source.id, lastRunId:null, lastRunStatus:"blocked", blockedCount:1,
    lastErrorCode:"LOGIN_REQUIRED", scannedCount:0,newCount:0,updatedCount:0,failedCount:0,
  }]}} items={[]} initialDetail={null} api={stub}/>);
  expect(screen.getByText("需登录")).toHaveClass("text-warning");
  await userEvent.type(screen.getByRole("searchbox", {name:"筛选来源"}), "需登录");
  expect(screen.getByRole("button",{name:"重新登录 登录过期的来源 的采集账号"})).toBeEnabled();
  const manage = screen.getByRole("button",{name:"管理 登录过期的来源"});
  manage.focus();
  await userEvent.keyboard("{Enter}");
  expect(screen.getByRole("menuitem", {name:"查看 登录过期的来源 的运行记录"})).toBeVisible();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(manage).toHaveFocus();
  expect(stub.startRun).not.toHaveBeenCalled();
});
