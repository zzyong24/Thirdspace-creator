"use client";
import { compactNumber,dateLabel,progressLabel,runStatusLabel,sourceTypeLabel,transcriptLabel } from "./intelligence-display";
import styles from "./source-management.module.css";
import { SourceManagementOverview } from "./source-management-overview";
import { SourceRunHistoryDialog } from "./source-run-history-dialog";

import {
Activity,
Archive,
ChevronRight,
Clock3,
Link2,
LockKeyhole,
Pause,
Play,
RefreshCw,
Search,
ShieldCheck,
Heart,
Flame,
Trash2
} from "lucide-react";
import { useRouter } from "next/navigation";
import {radarScopeKey} from "./intelligence-workbench-types";
import {readRadarView,saveRadarView} from "./radar-view-preferences";
import * as React from "react";
import { AddCollectionDialog,ImportDouyinShareDialog } from "./collection-import-dialogs";
import { AddSourceDialog } from "./source-setup-dialog";
import { useSourceRuns } from "./use-source-runs";
import { useTopicPreview } from "./use-topic-preview";
import { useTranscriptRefresh } from "./use-transcript-refresh";
import { RadarUpgradeAction } from "./radar-upgrade-action";
import { useProjectUpgradeQueue,type RadarProjectState } from "./use-project-upgrade-queue";
export { favoriteFoldersErrorMessage,sourceVerificationErrorMessage } from "./intelligence-errors";
export type * from "./intelligence-workbench-types";

import { Button } from "@/components/ui/button";
import {
Dialog,
DialogContent,
DialogDescription,
DialogFooter,
DialogHeader,
DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { defaultApi } from "./intelligence-workbench-api";
import type { RadarApi,RadarItemDetail,RadarItemPage,RadarItemRow,RadarSort,RadarSource,RadarTopicState,RadarTranscriptState,RadarWorkspace } from "./intelligence-workbench-types";

const DETAIL_WIDTH_KEY = "creatoros:intelligence:detail-width";
const ITEM_PAGE_SIZE = 100;
const MIN_DETAIL_WIDTH = 320;
// 两个结构化节点各自最多 90 秒，长稿纯文本节点最多 180 秒；轮询覆盖完整硬上界并留出回读余量。
const MAX_DETAIL_WIDTH = 640;

function clampDetailWidth(value: number): number {
  return Math.min(MAX_DETAIL_WIDTH, Math.max(MIN_DETAIL_WIDTH, value));
}

export function groupRadarSourceEvidence(
  snapshots: RadarItemDetail["snapshots"],
): Array<{
  snapshot: RadarItemDetail["snapshots"][number];
  captureCount: number;
}> {
  const grouped = new Map<
    string,
    {
      snapshot: RadarItemDetail["snapshots"][number];
      captureCount: number;
    }
  >();
  for (const snapshot of [...snapshots].sort((left, right) =>
    right.capturedAt.localeCompare(left.capturedAt),
  )) {
    // 正式 API 始终带 sourceId；finalUrl 只给旧测试/旧 payload 一个兼容键。
    const key = snapshot.sourceId ?? snapshot.finalUrl;
    const existing = grouped.get(key);
    if (existing) {
      existing.captureCount += 1;
    } else {
      grouped.set(key, { snapshot, captureCount: 1 });
    }
  }
  return [...grouped.values()];
}

function IntelligenceWorkbenchScope({
  groupId,
  accountId,
  workspace,
  items,
  initialTotal = items.length,
  initialDetail,
  positioningVersionId = null,
  api: injectedApi,
  presentation = "workspace",
}: {
  presentation?: "workspace" | "sources";
  groupId?: string;
  accountId?: string;
  workspace: RadarWorkspace;
  items: RadarItemRow[];
  initialTotal?: number;
  initialDetail: RadarItemDetail | null;
  positioningVersionId?: string | null;
  api?: RadarApi;
}) {
  const sourcesOnly = presentation === "sources";
  const legacyAccountId=groupId?undefined:accountId;
  const scope=React.useMemo(()=>({groupId,accountId:legacyAccountId}),[groupId,legacyAccountId]);
  const scopeKey=radarScopeKey(scope);
  const router = useRouter();
  const api = React.useMemo(() => injectedApi ?? defaultApi(scope), [injectedApi,scope]);
  const [selectedCollectionId, setSelectedCollectionId] = React.useState<
    string | null
  >(null);
  const [selectedSourceId, setSelectedSourceId] = React.useState<string | null>(
    null,
  );
  const [sourceQuery, setSourceQuery] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<RadarSort>("published_desc");
  const [transcriptState, setTranscriptState] =
    React.useState<RadarTranscriptState | null>(null);
  const [topicState, setTopicState] =
    React.useState<RadarTopicState | null>(null);
  const [scopedItems, setScopedItems] =
    React.useState<RadarItemRow[]>(items);
  const [scopedPage, setScopedPage] = React.useState(1);
  const [scopedTotal, setScopedTotal] = React.useState(initialTotal);
  const [allItemsTotal, setAllItemsTotal] = React.useState(initialTotal);
  const [itemsLoading, setItemsLoading] = React.useState(false);
  const [detail, setDetail] = React.useState<RadarItemDetail | null>(
    initialDetail,
  );
  const [detailWidth, setDetailWidth] = React.useState(392);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [updatingMonitorSourceIds, setUpdatingMonitorSourceIds] =
    React.useState<Set<string>>(() => new Set());
  const [historySource, setHistorySource] = React.useState<RadarSource | null>(
    null,
  );
  const [reconnectSource, setReconnectSource] =
    React.useState<RadarSource | null>(null);
  const [reconnectBusy, setReconnectBusy] = React.useState(false);
  const [reconnectError, setReconnectError] = React.useState<string | null>(
    null,
  );
  const [removalSource, setRemovalSource] =
    React.useState<RadarSource | null>(null);
  const [removalBusy, setRemovalBusy] = React.useState(false);
  const [removalError, setRemovalError] = React.useState<string | null>(null);
  const activeDetailItemId = React.useRef<string | null>(
    initialDetail?.item.id ?? null,
  );
  const itemScopeRequestId = React.useRef(0);
  const searchTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    activeDetailItemId.current = detail?.item.id ?? null;
  }, [detail?.item.id]);

  const {resetTopicPreview}=useTopicPreview({api,detail,positioningVersionId,setDetail,setNotice,setBusy,activeDetailItemId});
  const upgrades=useProjectUpgradeQueue({api,...scope,items:detail?[...scopedItems.map(row=>row.item),detail.item]:scopedItems.map(row=>row.item),positioningVersionId,setNotice});
  useTranscriptRefresh({api,detail,rows:scopedItems,setDetail,setRows:setScopedItems,activeItemId:activeDetailItemId,

  });

  React.useEffect(() => {
    let timer: number | null = null;
    try {
      const saved = Number(window.localStorage.getItem(DETAIL_WIDTH_KEY));
      if (Number.isFinite(saved) && saved > 0) {
        timer = window.setTimeout(
          () => setDetailWidth(clampDetailWidth(saved)),
          0,
        );
      }
    } catch {
      // localStorage 不可用时使用默认宽度。
    }
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  React.useEffect(
    () => () => {
      if (searchTimer.current !== null) {
        window.clearTimeout(searchTimer.current);
      }
    },
    [],
  );

  React.useEffect(() => {
    if (!workspace.sources.some((source) => source.monitorEnabled)) return;
    const timer = window.setInterval(() => router.refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [router, workspace.sources]);

  const persistWidth = React.useCallback((width: number) => {
    const next = clampDetailWidth(width);
    setDetailWidth(next);
    try {
      window.localStorage.setItem(DETAIL_WIDTH_KEY, String(next));
    } catch {
      // 隐私模式下只保留本次会话宽度。
    }
  }, []);

  const visibleItems = scopedItems;

  const filteredItems = React.useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("zh-CN");
    return visibleItems.filter(({ item }) => {
      if (
        needle &&
        ![item.title, item.summary, item.authorName]
          .filter(Boolean)
          .some((value) =>
            value!.toLocaleLowerCase("zh-CN").includes(needle),
          )
      ) {
        return false;
      }
      return true;
    });
  }, [query, visibleItems]);

  const settleItemRows = React.useCallback(
    async (pageResult: RadarItemPage, requestId: number) => {
      if (itemScopeRequestId.current !== requestId) return;
      const rows = pageResult.items;
      setScopedItems(rows);
      setScopedPage(pageResult.page);
      setScopedTotal(pageResult.total);
      const selectedId = activeDetailItemId.current;
      if (selectedId && rows.some((row) => row.item.id === selectedId)) {
        return;
      }
      const firstId = rows[0]?.item.id;
      if (!firstId) {
        setDetail(null);
        return;
      }
      try {
        const firstDetail = await api.getItem(firstId);
        if (itemScopeRequestId.current === requestId) {
          setDetail(firstDetail);
        }
      } catch {
        if (itemScopeRequestId.current === requestId) {
          setDetail(null);
          setNotice("列表已更新，但第一条作品详情读取失败，请重新选择。");
        }
      }
    },
    [api],
  );

  const [viewRestored,setViewRestored]=React.useState(false);
  React.useEffect(()=>{
    let disposed=false;
    const saved=readRadarView(scope);
    setViewRestored(true);
    if(!saved)return;
    const collectionId=workspace.collections.some(row=>row.id===saved.collectionId)?saved.collectionId:null;
    const sourceId=workspace.sources.some(row=>row.id===saved.sourceId)?saved.sourceId:null;
    setSelectedCollectionId(collectionId);setSelectedSourceId(sourceId);
    setSort(saved.sort);setTranscriptState(saved.transcriptState);setTopicState(saved.topicState);
    setQuery(saved.query);setSourceQuery(saved.sourceQuery);
    const requestId=++itemScopeRequestId.current;
    setItemsLoading(true);
    void api.listItems({...scope,page:1,pageSize:ITEM_PAGE_SIZE,sort:saved.sort,
      ...(collectionId?{collectionId}:{}),...(sourceId?{sourceId}:{}),
      ...(saved.query.trim()?{query:saved.query.trim()}:{}),
      ...(saved.transcriptState?{transcriptState:saved.transcriptState}:{}),
      ...(saved.topicState?{topicState:saved.topicState}:{}),
    }).then(page=>{if(!disposed)return settleItemRows(page,requestId);})
      .catch(()=>{if(!disposed)setNotice("上次筛选已恢复，列表读取失败，请稍后重试。");})
      .finally(()=>{if(!disposed&&itemScopeRequestId.current===requestId)setItemsLoading(false);});
    return()=>{disposed=true;};
    // 每个账号组件首次进入恢复一次，工作区刷新不覆盖用户本次选择。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[scopeKey]);
  React.useEffect(()=>{
    if(viewRestored)saveRadarView(scope,{sort,transcriptState,topicState,query,sourceQuery,collectionId:selectedCollectionId,sourceId:selectedSourceId});
  },[scopeKey,viewRestored,sort,transcriptState,topicState,query,sourceQuery,selectedCollectionId,selectedSourceId]);

  const selectItemScope = React.useCallback(
    async (collectionId: string | null, sourceId: string | null) => {
      if (sourcesOnly) {
        setSelectedCollectionId(collectionId);
        setSelectedSourceId(sourceId);
        setNotice(null);
        return;
      }
      const requestId = itemScopeRequestId.current + 1;
      itemScopeRequestId.current = requestId;
      const previous = {
        collectionId: selectedCollectionId,
        sourceId: selectedSourceId,
        items: visibleItems,
        page: scopedPage,
        total: scopedTotal,
        detail,
      };

      setSelectedCollectionId(collectionId);
      setSelectedSourceId(sourceId);
      setItemsLoading(true);
      setDetail(null);
      setNotice(null);

      try {
        const nextPage = await api.listItems({
          ...scope,
          page: 1,
          pageSize: ITEM_PAGE_SIZE,
          ...(collectionId ? { collectionId } : {}),
          ...(sourceId ? { sourceId } : {}),
          ...(query.trim() ? { query: query.trim() } : {}),
          sort,
          ...(transcriptState ? { transcriptState } : {}),
          ...(topicState ? { topicState } : {}),
        });
        if (itemScopeRequestId.current !== requestId) return;
        await settleItemRows(nextPage, requestId);
        if (
          !collectionId &&
          !sourceId &&
          !query.trim() &&
          !transcriptState &&
          !topicState
        ) {
          setAllItemsTotal(nextPage.total);
        }
      } catch {
        if (itemScopeRequestId.current !== requestId) return;
        setSelectedCollectionId(previous.collectionId);
        setSelectedSourceId(previous.sourceId);
        setScopedItems(previous.items);
        setScopedPage(previous.page);
        setScopedTotal(previous.total);
        setDetail(previous.detail);
        setNotice("内容筛选失败，已保留切换前的结果，请稍后重试。");
      } finally {
        if (itemScopeRequestId.current === requestId) {
          setItemsLoading(false);
        }
      }
    },
    [
      sourcesOnly,
      scope,
      api,
      detail,
      selectedCollectionId,
      selectedSourceId,
      query,
      scopedPage,
      scopedTotal,
      settleItemRows,
      sort,
      topicState,
      transcriptState,
      visibleItems,
    ],
  );

  const applyItemView = React.useCallback(
    async (next: {
      sort: RadarSort;
      transcriptState: RadarTranscriptState | null;
      topicState: RadarTopicState | null;
      query: string;
    }) => {
      const previous = {
        sort,
        transcriptState,
        topicState,
        items: visibleItems,
        page: scopedPage,
        total: scopedTotal,
        detail,
      };
      const requestId = itemScopeRequestId.current + 1;
      itemScopeRequestId.current = requestId;
      setSort(next.sort);
      setTranscriptState(next.transcriptState);
      setTopicState(next.topicState);
      setItemsLoading(true);
      setNotice(null);
      try {
        const nextPage = await api.listItems({
          ...scope,
          page: 1,
          pageSize: ITEM_PAGE_SIZE,
          ...(selectedCollectionId
            ? { collectionId: selectedCollectionId }
            : {}),
          ...(selectedSourceId ? { sourceId: selectedSourceId } : {}),
          ...(next.query.trim() ? { query: next.query.trim() } : {}),
          sort: next.sort,
          ...(next.transcriptState
            ? { transcriptState: next.transcriptState }
            : {}),
          ...(next.topicState ? { topicState: next.topicState } : {}),
        });
        await settleItemRows(nextPage, requestId);
        if (
          !selectedCollectionId &&
          !selectedSourceId &&
          !next.query.trim() &&
          !next.transcriptState &&
          !next.topicState
        ) {
          setAllItemsTotal(nextPage.total);
        }
        return true;
      } catch {
        if (itemScopeRequestId.current === requestId) {
          setSort(previous.sort);
          setTranscriptState(previous.transcriptState);
          setTopicState(previous.topicState);
          setScopedItems(previous.items);
          setScopedPage(previous.page);
          setScopedTotal(previous.total);
          setDetail(previous.detail);
          setNotice("筛选失败，已保留原结果，请稍后重试。");
        }
        return false;
      } finally {
        if (itemScopeRequestId.current === requestId) {
          setItemsLoading(false);
        }
      }
    },
    [
      scope,
      api,
      detail,
      selectedCollectionId,
      selectedSourceId,
      scopedPage,
      scopedTotal,
      settleItemRows,
      sort,
      topicState,
      transcriptState,
      visibleItems,
    ],
  );

  const loadMoreItems = React.useCallback(async () => {
    if (itemsLoading || scopedItems.length >= scopedTotal) return;
    const requestId = itemScopeRequestId.current;
    setItemsLoading(true);
    setNotice(null);
    try {
      const nextPage = await api.listItems({
        ...scope,
        page: scopedPage + 1,
        pageSize: ITEM_PAGE_SIZE,
        ...(selectedCollectionId
          ? { collectionId: selectedCollectionId }
          : {}),
        ...(selectedSourceId ? { sourceId: selectedSourceId } : {}),
        ...(query.trim() ? { query: query.trim() } : {}),
        sort,
        ...(transcriptState ? { transcriptState } : {}),
        ...(topicState ? { topicState } : {}),
      });
      if (itemScopeRequestId.current !== requestId) return;
      setScopedItems((current) => {
        const seen = new Set(current.map((row) => row.item.id));
        return [
          ...current,
          ...nextPage.items.filter((row) => !seen.has(row.item.id)),
        ];
      });
      setScopedPage(nextPage.page);
      setScopedTotal(nextPage.total);
      if (
        !selectedCollectionId &&
        !selectedSourceId &&
        !query.trim() &&
        !transcriptState &&
        !topicState
      ) {
        setAllItemsTotal(nextPage.total);
      }
    } catch {
      if (itemScopeRequestId.current === requestId) {
        setNotice("后续内容读取失败，已保留当前结果，请稍后继续加载。");
      }
    } finally {
      if (itemScopeRequestId.current === requestId) {
        setItemsLoading(false);
      }
    }
  }, [
    scope,
    api,
    itemsLoading,
    query,
    scopedItems.length,
    scopedPage,
    scopedTotal,
    selectedCollectionId,
    selectedSourceId,
    sort,
    topicState,
    transcriptState,
  ]);

  const updateSearch = React.useCallback(
    (nextQuery: string) => {
      setQuery(nextQuery);
      if (searchTimer.current !== null) {
        window.clearTimeout(searchTimer.current);
      }
      searchTimer.current = window.setTimeout(() => {
        void applyItemView({
          sort,
          transcriptState,
          topicState,
          query: nextQuery,
        });
      }, 250);
    },
    [applyItemView, sort, topicState, transcriptState],
  );

  const visibleSourceIds = React.useMemo(() => {
    const needle = sourceQuery.trim().toLocaleLowerCase("zh-CN");
    if (!needle) return new Set(workspace.sources.map((source) => source.id));

    const matchingCollectionIds = new Set(
      workspace.collections
        .filter((collection) =>
          collection.name.toLocaleLowerCase("zh-CN").includes(needle),
        )
        .map((collection) => collection.id),
    );
    return new Set(
      workspace.sources
        .filter((source) => {
          if (
            source.collectionId &&
            matchingCollectionIds.has(source.collectionId)
          ) {
            return true;
          }
          if (
            workspace.memberships.some(
              (membership) =>
                membership.sourceId === source.id &&
                matchingCollectionIds.has(membership.collectionId),
            )
          ) {
            return true;
          }
          const health = workspace.health.find(
            (entry) => entry.sourceId === source.id,
          );
          const searchText = [
            source.displayName,
            sourceTypeLabel(source.type),
            runStatusLabel(health?.lastRunStatus ?? null),
            source.collector?.accountHandle,
            source.monitorEnabled ? "自动同步" : "手动同步",
            health?.lastErrorCode,
          ]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase("zh-CN");
          return searchText.includes(needle);
        })
        .map((source) => source.id),
    );
  }, [
    sourceQuery,
    workspace.collections,
    workspace.health,
    workspace.memberships,
    workspace.sources,
  ]);

  const selectItem = React.useCallback(
    async (itemId: string) => {
      activeDetailItemId.current = itemId;
      setBusy(true);
      resetTopicPreview();
      setNotice(null);
      try {
        const refreshed=await api.getItem(itemId);
        if(activeDetailItemId.current!==itemId)return;
        setDetail(refreshed);
      } catch {
        if(activeDetailItemId.current!==itemId)return;
        setNotice("作品详情读取失败，请稍后重试。");
      } finally {
        if(activeDetailItemId.current===itemId)setBusy(false);
      }
    },
    [api],
  );

  const startResize = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = detailWidth;
      const move = (next: PointerEvent) =>
        setDetailWidth(
          clampDetailWidth(startWidth + (startX - next.clientX)),
        );
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        persistWidth(
          clampDetailWidth(
            Number(
              document
                .querySelector<HTMLElement>(
                  '[data-testid="intelligence-detail"]',
                )
                ?.getBoundingClientRect().width ?? detailWidth,
            ),
          ),
        );
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up, { once: true });
    },
    [detailWidth, persistWidth],
  );

  const {runningSourceIds,runSource,watchRun}=useSourceRuns({api,workspace,setNotice,refresh:router.refresh});

  const reconnectAndRetry = React.useCallback(async () => {
    const source = reconnectSource;
    const collectorAccountId = source?.collector?.accountId;
    if (!source || !collectorAccountId || reconnectBusy) return;

    setReconnectBusy(true);
    setReconnectError(null);
    try {
      const result = await api.reconnectCollector({
        collectorAccountId,
        sourceType: source.type,
      });
      if (!result.loggedIn) {
        setReconnectError(
          source.type === "darkhorse_query"
            ? "没有检测到热点宝授权成功。请在弹出的 Chrome 窗口完成授权后再试。"
            : "没有检测到登录成功。请在弹出的 Chrome 窗口完成扫码后再试。",
        );
        return;
      }
      setReconnectSource(null);
      setNotice("登录已恢复，正在自动重试该来源…");
      await runSource(source.id);
    } catch (error) {
      setReconnectError(
        error instanceof Error && error.message
          ? error.message
          : "重新登录没有完成，请确认扫码窗口可用后再试。",
      );
    } finally {
      setReconnectBusy(false);
    }
  }, [api, reconnectBusy, reconnectSource, runSource]);

  const toggleSourceMonitor = React.useCallback(
    async (source: RadarSource) => {
      if (updatingMonitorSourceIds.has(source.id)) return;
      const monitorEnabled = !source.monitorEnabled;
      setUpdatingMonitorSourceIds((current) =>
        new Set(current).add(source.id),
      );
      try {
        await api.updateSource({
          sourceId: source.id,
          monitorEnabled,
          syncPolicy: monitorEnabled
            ? { mode: "scheduled", interval: "daily" }
            : { mode: "manual" },
          expectedVersion: source.version,
        });
        setNotice(
          monitorEnabled
            ? `已恢复「${source.displayName}」的每日自动同步。`
            : `已暂停「${source.displayName}」的每日自动同步；仍可手动同步。`,
        );
        router.refresh();
      } catch {
        setNotice(
          `未能${monitorEnabled ? "恢复" : "暂停"}「${source.displayName}」的自动同步，请刷新后重试。`,
        );
      } finally {
        setUpdatingMonitorSourceIds((current) => {
          const next = new Set(current);
          next.delete(source.id);
          return next;
        });
      }
    },
    [api, router, updatingMonitorSourceIds],
  );

  const permanentlyDeleteSource = React.useCallback(async () => {
    const source = removalSource;
    if (!source || removalBusy) return;
    if (runningSourceIds.has(source.id)) {
      setRemovalError("该来源仍在同步中，请等待同步完成后再移除。");
      return;
    }

    setRemovalBusy(true);
    setRemovalError(null);
    try {
      const result = await api.deleteSource({
        sourceId: source.id,
        mode: "permanent",
        confirmToken: source.id,
      });
      setSelectedSourceId((current) =>
        current === source.id ? null : current,
      );
      setHistorySource((current) =>
        current?.id === source.id ? null : current,
      );
      setReconnectSource((current) =>
        current?.id === source.id ? null : current,
      );
      setReconnectError(null);
      setRemovalSource(null);
      setNotice(
        `已删除「${source.displayName}」及 ${result.affectedItems} 条独占内容；被其他信源或正式选题、项目引用的内容已安全保留。`,
      );
      router.refresh();
    } catch {
      const message = `未能删除「${source.displayName}」。请确认来源未在同步并刷新后重试。`;
      setRemovalError(message);
      setNotice(message);
    } finally {
      setRemovalBusy(false);
    }
  }, [api, removalBusy, removalSource, router, runningSourceIds]);


  const sourceDialogs = {
    collection: (
          <AddCollectionDialog
            groupId={groupId}
            accountId={accountId}
            api={api}
            onDone={() => router.refresh()}
          />

    ),
    import: (
          <ImportDouyinShareDialog
            groupId={groupId}
            accountId={accountId}
            collections={workspace.collections}
            api={api}
            onDone={() => {
              setNotice(
                "单条视频已进入导入队列。完成后会出现在内容雷达；不会自动转写。",
              );
              router.refresh();
            }}
          />

    ),
    add: (
          <AddSourceDialog
            groupId={groupId}
            accountId={accountId}
            collections={workspace.collections}
            api={api}
            onDone={(result) => {
              router.refresh();
              if (result.run) {
                setNotice(
                  "来源已保存，首次同步正在后台执行；完成后作品会自动出现。",
                );
                void watchRun(result.source.id, result.run.id);
              } else {
                setNotice("来源已保存；当前设置为不立即同步。");
              }
            }}
          />
    ),
  };

  return (
    <section
      data-page="intelligence"
      data-testid="intelligence-workbench"
      data-presentation={presentation}
      className={cn("flex h-full min-h-0 flex-col overflow-hidden rounded-card border border-border bg-surface", sourcesOnly && styles.manager)}
    >
      {sourcesOnly ? <header className={styles.managerHeader}>
        <div><h3>真实来源</h3><p>只收公开作品与计数，不采集评论正文。</p></div>
        <span>待处理 {workspace.pendingCount}</span>
      </header> : (
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-surface px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-5 items-center justify-center text-muted-foreground">
            <Activity className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-foreground">
              内容雷达
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              只收公开作品与公开计数 · 评论正文不采集 · 逐字稿在项目内补充或转写
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={workspace.pendingCount > 0 ? "rounded-full bg-warning-soft px-2.5 py-1 text-warning" : "rounded-full bg-surface-subtle px-2.5 py-1 text-muted-foreground"}>
            待处理 {workspace.pendingCount}
          </span>

        </div>
      </div>
      )}
      {sourcesOnly ? <div className={styles.actions} aria-label="来源操作">
        <div>{sourceDialogs.add}<p>持续跟踪主页、网页或订阅源</p></div>
        <div>{sourceDialogs.import}<p>导入单条抖音作品</p></div>
        <div>{sourceDialogs.collection}<p>按主题整理来源</p></div>
      </div> : null}

      <SourceRunHistoryDialog
        key={historySource?.id ?? "no-source-history"}
        source={historySource}
        api={api}
        onClose={() => setHistorySource(null)}
      />

      <Dialog
        open={reconnectSource !== null}
        onOpenChange={(open) => {
          if (!open && !reconnectBusy) {
            setReconnectSource(null);
            setReconnectError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重新登录采集账号</DialogTitle>
            <DialogDescription>
              {`复用 ${reconnectSource?.collector?.accountHandle ?? "当前采集账号"} 已有的本机登录档案与 Cookie。系统会打开${
                reconnectSource?.type === "darkhorse_query"
                  ? "热点宝授权"
                  : "扫码"
              }窗口，不会新建重复账号；登录成功后会自动重试「${reconnectSource?.displayName ?? ""}」。`}
            </DialogDescription>
          </DialogHeader>
          {reconnectError ? (
            <div
              role="alert"
              className="rounded-xl border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger"
            >
              {reconnectError}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={reconnectBusy}
              onClick={() => {
                setReconnectSource(null);
                setReconnectError(null);
              }}
            >
              取消
            </Button>
            <Button
              type="button"
              disabled={reconnectBusy}
              onClick={() => void reconnectAndRetry()}
            >
              {reconnectBusy
                ? reconnectSource?.type === "darkhorse_query"
                  ? "等待授权…"
                  : "等待扫码…"
                : reconnectSource?.type === "darkhorse_query"
                  ? "打开热点宝授权"
                  : "打开扫码窗口"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={removalSource !== null}
        onOpenChange={(open) => {
          if (!open && !removalBusy) {
            setRemovalSource(null);
            setRemovalError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {`删除「${removalSource?.displayName ?? "该来源"}」及其内容？`}
            </DialogTitle>
            <DialogDescription>
              删除后会停止同步，并清理这个信源独占的内容、快照和任务记录。被其他信源复用或已进入正式选题、项目的内容不会被破坏。
            </DialogDescription>
          </DialogHeader>
          {removalError ? (
            <div
              role="alert"
              className="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {removalError}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={removalBusy}
              onClick={() => {
                setRemovalSource(null);
                setRemovalError(null);
              }}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={removalBusy}
              onClick={() => void permanentlyDeleteSource()}
            >
              {removalBusy ? "正在删除…" : "删除信源与内容"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {notice ? (
        <div
          role="status"
          className="shrink-0 border-b border-border/60 bg-muted/45 px-5 py-2 text-xs text-foreground"
        >
          {notice}
        </div>
      ) : null}

      <div
        data-testid="intelligence-responsive-layout" data-studio-layout="inbox"
        className={cn("grid min-h-0 flex-1 grid-cols-1 overflow-y-auto xl:grid-cols-[minmax(220px,260px)_minmax(320px,1fr)_minmax(320px,392px)] xl:overflow-hidden 2xl:grid-cols-[minmax(220px,260px)_minmax(360px,1fr)_auto]", sourcesOnly && styles.sourceLayout)}
      >
        <aside
          data-testid="intelligence-sidebar"
          aria-label="内容雷达分类和来源"
          className="flex min-h-0 flex-col border-b border-border/70 bg-surface-subtle xl:border-b-0 xl:border-r"
        >
          {!sourcesOnly ? <>
          <div className="shrink-0 border-b border-border/70 p-3">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><span className="text-primary">01</span> 来源与采集</h2>
            <div className="flex flex-wrap gap-2">
              {sourceDialogs.collection}
              {sourceDialogs.import}
              {sourceDialogs.add}
            </div>
          </div>
          </> : null}
          <div className="shrink-0 space-y-2 px-3 pb-2 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              来源目录
            </p>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                aria-label="筛选来源"
                value={sourceQuery}
                onChange={(event) => setSourceQuery(event.target.value)}
                placeholder="筛选名称、类型或状态"
                className="h-8 rounded-lg border-border/75 bg-surface pl-8 pr-2 text-xs"
              />
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
            <button
              type="button"
              onClick={() => void selectItemScope(null, null)}
              aria-pressed={!selectedCollectionId && !selectedSourceId}
              className={cn(
                "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition",
                !selectedCollectionId && !selectedSourceId
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-foreground hover:bg-muted",
              )}
            >
              <span>{sourcesOnly ? "全部来源" : "全部内容"}</span>
              <span className="text-xs text-muted-foreground">
                {sourcesOnly ? workspace.sources.length : allItemsTotal}
              </span>
            </button>
            <div className="mt-3 space-y-3" data-slot="radar-collection-groups">
            {workspace.collections.map((collection) => {
              const collectionSources = workspace.sources
                .filter(
                  (source) =>
                    source.collectionId === collection.id ||
                    workspace.memberships.some(
                      (membership) =>
                        membership.collectionId === collection.id &&
                        membership.sourceId === source.id,
                    ),
                )
                .filter((source) => visibleSourceIds.has(source.id));
              if (sourceQuery.trim() && collectionSources.length === 0) {
                return null;
              }
              return (
                <RadarCollectionGroup
                  key={collection.id}
                  name={collection.name}
                  system={collection.kind === "system"}
                  count={collectionSources.length}
                  active={selectedCollectionId === collection.id && !selectedSourceId}
                  highlighted={selectedCollectionId === collection.id}
                  filtering={Boolean(sourceQuery.trim())}
                  onSelect={() => void selectItemScope(collection.id, null)}
                >
                  {collectionSources.map((source) => (
                    <SourceRow
                      key={source.id}
                      source={source}
                      health={workspace.health.find(
                        (health) => health.sourceId === source.id,
                      )}
                      active={selectedSourceId === source.id}
                      syncing={runningSourceIds.has(source.id)}
                      monitorUpdating={updatingMonitorSourceIds.has(source.id)}
                      onSelect={() =>
                        void selectItemScope(collection.id, source.id)
                      }
                      onRun={() => runSource(source.id)}
                      onToggleMonitor={() => void toggleSourceMonitor(source)}
                      onReconnect={() => {
                        setReconnectError(null);
                        setReconnectSource(source);
                      }}
                      onRemove={() => {
                        setRemovalError(null);
                        setRemovalSource(source);
                      }}
                      onShowRuns={() => setHistorySource(source)}
                    />
                  ))}
                </RadarCollectionGroup>
              );
            })}
            </div>
            {workspace.sources
              .filter(
                (source) =>
                  visibleSourceIds.has(source.id) &&
                  source.collectionId === null &&
                  !workspace.memberships.some(
                    (membership) => membership.sourceId === source.id,
                  ),
              )
              .map((source) => (
                <SourceRow
                  key={source.id}
                  source={source}
                  health={workspace.health.find(
                    (health) => health.sourceId === source.id,
                  )}
                  active={selectedSourceId === source.id}
                  syncing={runningSourceIds.has(source.id)}
                  monitorUpdating={updatingMonitorSourceIds.has(source.id)}
                  onSelect={() => void selectItemScope(null, source.id)}
                  onRun={() => runSource(source.id)}
                  onToggleMonitor={() => void toggleSourceMonitor(source)}
                  onReconnect={() => {
                    setReconnectError(null);
                    setReconnectSource(source);
                  }}
                  onRemove={() => {
                    setRemovalError(null);
                    setRemovalSource(source);
                  }}
                  onShowRuns={() => setHistorySource(source)}
                />
              ))}
            {sourceQuery.trim() && visibleSourceIds.size === 0 ? (
              <div className="mx-2 mt-3 rounded-xl border border-dashed border-border/80 px-3 py-4 text-center text-xs leading-5 text-muted-foreground">
                没有匹配的来源
              </div>
            ) : null}
          </div>
        </aside>

        {sourcesOnly ? <SourceManagementOverview workspace={workspace} selectedSourceId={selectedSourceId} selectedCollectionId={selectedCollectionId}/> : <>
        <main
          aria-busy={itemsLoading}
          className="flex min-h-0 min-w-0 flex-col bg-canvas/55"
        >
          <h2 className="flex shrink-0 items-center gap-2 border-b border-border/70 px-4 py-3 text-sm font-semibold"><span className="text-primary">02</span> 挑选内容</h2>
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 px-4 py-2.5">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>逐字稿</span>
              <select
                aria-label="逐字稿筛选"
                value={transcriptState ?? ""}
                disabled={itemsLoading}
                onChange={(event) => {
                  const next =
                    (event.target.value as RadarTranscriptState) || null;
                  void applyItemView({
                    sort,
                    transcriptState: next,
                    topicState,
                    query,
                  });
                }}
                className="h-8 rounded-lg border border-input bg-surface px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">全部</option>
                <option value="not_extracted">未提取</option>
                <option value="processing">提取中</option>
                <option value="extracted">已提取</option>
                <option value="attention">失败或受阻</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>选题</span>
              <select
                aria-label="选题筛选"
                value={topicState ?? ""}
                disabled={itemsLoading}
                onChange={(event) => {
                  const next =
                    (event.target.value as RadarTopicState) || null;
                  void applyItemView({
                    sort,
                    transcriptState,
                    topicState: next,
                    query,
                  });
                }}
                className="h-8 rounded-lg border border-input bg-surface px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">全部</option>
                <option value="not_generated">尚未生成</option>
                <option value="generating">生成中</option>
                <option value="awaiting_confirmation">待确认</option>
                <option value="converted">已转为选题</option>
                <option value="attention">失败或受阻</option>
              </select>
            </label>
            {transcriptState || topicState ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={itemsLoading}
                onClick={() =>
                  void applyItemView({
                    sort,
                    transcriptState: null,
                    topicState: null,
                    query,
                  })
                }
                className="h-8 px-2 text-xs text-muted-foreground"
              >
                清除筛选
              </Button>
            ) : null}
            <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>排序</span>
              <select
                aria-label="内容排序"
                value={sort}
                disabled={itemsLoading}
                onChange={(event) => {
                  const next = event.target.value as RadarSort;
                  void applyItemView({
                    sort: next,
                    transcriptState,
                    topicState,
                    query,
                  });
                }}
                className="h-8 rounded-lg border border-input bg-surface px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="published_desc">最新发布</option>
                <option value="collect_desc">收藏最多</option>
                <option value="like_desc">点赞最多</option>
              </select>
            </label>
          </div>
          <div className="flex shrink-0 items-center gap-3 border-b border-border/70 px-4 py-3">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="搜索雷达内容"
                value={query}
                onChange={(event) => updateSearch(event.target.value)}
                placeholder="搜索标题、作者或摘要"
                className="h-9 rounded-xl border-border/80 bg-surface pl-9"
              />
            </label>
            <span className="shrink-0 text-xs text-muted-foreground">
              {itemsLoading
                ? "正在切换…"
                : `${scopedTotal} 条真实内容`}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {itemsLoading && filteredItems.length === 0 ? (
              <div
                role="status"
                className="rounded-xl border border-dashed border-border/80 px-4 py-10 text-center text-sm text-muted-foreground"
              >
                正在读取该分类的真实内容…
              </div>
            ) : filteredItems.length === 0 ? (
              <RadarEmptyState
                hasSources={workspace.sources.length > 0}
                filtered={Boolean(
                  query.trim() || transcriptState || topicState,
                )}
                onClear={() => {
                  setQuery("");
                  void applyItemView({
                    sort,
                    transcriptState: null,
                    topicState: null,
                    query: "",
                  });
                }}
              />
            ) : (
              <div
                className={cn(
                  "grid grid-cols-1 gap-2 transition-opacity xl:grid-cols-2",
                  itemsLoading && "opacity-60",
                )}
              >
                {filteredItems.map((row) => (
                  <ItemCard
                    key={row.item.id}
                    row={row}
                    active={detail?.item.id === row.item.id}
                    onSelect={() => selectItem(row.item.id)}
                    upgradeState={upgrades.byItem.get(row.item.id)}
                    upgradeSubmitting={upgrades.submitting.has(row.item.id)}
                    onUpgrade={api.ensureProject?()=>{
                      const projectId=upgrades.byItem.get(row.item.id)?.projectId;
                      if(projectId)router.push(`/projects/${encodeURIComponent(projectId)}`);
                      else void upgrades.enqueue(row.item.id);
                    }:undefined}
                  />
                ))}
              </div>
            )}
            {filteredItems.length > 0 && scopedItems.length < scopedTotal ? (
              <div className="flex justify-center py-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={itemsLoading}
                  onClick={() => void loadMoreItems()}
                  className="rounded-full px-5 text-xs"
                >
                  {itemsLoading
                    ? "正在读取后续内容…"
                    : `继续加载（已显示 ${scopedItems.length} / 共 ${scopedTotal}）`}
                </Button>
              </div>
            ) : null}
          </div>
        </main>

        <div className="relative flex min-h-[320px] xl:min-h-0">
          <div
            role="separator"
            aria-label="调整作品详情宽度"
            aria-valuenow={detailWidth}
            aria-valuemin={MIN_DETAIL_WIDTH}
            aria-valuemax={MAX_DETAIL_WIDTH}
            aria-orientation="vertical"
            tabIndex={0}
            onPointerDown={startResize}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                persistWidth(detailWidth + 24);
              } else if (event.key === "ArrowRight") {
                persistWidth(detailWidth - 24);
              }
            }}
            className="group z-10 hidden w-1 cursor-col-resize bg-border/60 outline-none transition hover:bg-primary/50 focus:bg-primary 2xl:block"
          >
            <span className="absolute left-1/2 top-1/2 h-14 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent group-hover:bg-primary/20" />
          </div>
          <aside
            data-testid="intelligence-detail"
            aria-label="作品详情"
            style={
              {
                width: detailWidth,
                "--detail-width": `${detailWidth}px`,
              } as React.CSSProperties
            }
            className="min-h-0 !w-full overflow-y-auto bg-surface 2xl:!w-[var(--detail-width)] 2xl:shrink-0"
          >
            {detail ? (
              <ItemDetail
                detail={detail}
                busy={busy}
                upgradeState={upgrades.byItem.get(detail.item.id)}
                upgradeSubmitting={upgrades.submitting.has(detail.item.id)}
                onUpgrade={api.ensureProject?()=>{
                  const projectId=upgrades.byItem.get(detail.item.id)?.projectId;
                  if(projectId)router.push(`/projects/${encodeURIComponent(projectId)}`);
                  else void upgrades.enqueue(detail.item.id);
                }:undefined}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <ChevronRight className="size-5" />
                </span>
                <p className="text-sm font-medium">选择一条内容查看完整证据</p>
                <p className="text-xs leading-5 text-muted-foreground">
                  这里会显示公开指标、来源快照和逐字稿状态。
                </p>
              </div>
            )}
          </aside>
        </div>
        </>}
      </div>
    </section>
  );
}

/** 系统分组（我的收藏 / 黑马发现）的说明与空态文案；只描述真实来源，不提供假入口。 */
const SYSTEM_COLLECTION_META: Record<string, { icon: typeof Heart; hint: string; empty: string }> = {
  我的收藏: { icon: Heart, hint: "抖音收藏夹同步的作品", empty: "还没有绑定收藏夹。用上方「添加来源」选择「我的收藏」，验证后会出现在这里。" },
  黑马发现: { icon: Flame, hint: "热点宝关键词命中的黑马作品", empty: "还没有黑马关键词。用上方「添加来源」选择「黑马关键词」并验证热点宝授权。" },
};

function RadarCollectionGroup({
  name,
  system,
  count,
  active,
  highlighted,
  filtering,
  onSelect,
  children,
}: {
  name: string;
  system: boolean;
  count: number;
  active: boolean;
  highlighted: boolean;
  filtering: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  const meta = system ? SYSTEM_COLLECTION_META[name] : undefined;
  const Icon = meta?.icon ?? (system ? ShieldCheck : Archive);
  return (
    <section
      data-slot="radar-collection-group"
      data-collection-kind={system ? "system" : "custom"}
      aria-label={`${name}分组`}
      className="rounded-xl border border-border/60 bg-surface/60"
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={cn(
          "flex w-full items-center gap-2 rounded-t-xl px-3 py-2 text-left text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary/40",
          highlighted ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-muted",
          count === 0 && "rounded-b-xl",
        )}
      >
        <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", system ? "text-primary" : "text-muted-foreground")} />
        <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
        <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums leading-4 text-muted-foreground">
          {count}
        </span>
      </button>
      {meta ? (
        <p className="px-3 pb-1 text-[10px] leading-4 text-muted-foreground">{meta.hint}</p>
      ) : null}
      {count > 0 ? (
        <div className="border-t border-border/50 pb-1.5" data-slot="radar-collection-sources">{children}</div>
      ) : meta && !filtering ? (
        <p data-slot="radar-collection-empty" className="mx-2 mb-2 rounded-lg border border-dashed border-border/80 px-2.5 py-2 text-[11px] leading-5 text-muted-foreground">
          {meta.empty}
        </p>
      ) : null}
    </section>
  );
}

function SourceRow({
  source,
  health,
  active,
  syncing,
  monitorUpdating,
  onSelect,
  onRun,
  onToggleMonitor,
  onReconnect,
  onRemove,
  onShowRuns,
}: {
  source: RadarSource;
  health?: RadarWorkspace["health"][number];
  active: boolean;
  syncing: boolean;
  monitorUpdating: boolean;
  onSelect: () => void;
  onRun: () => void;
  onToggleMonitor: () => void;
  onReconnect: () => void;
  onRemove: () => void;
  onShowRuns: () => void;
}) {
  const queued = syncing && health?.lastRunStatus === "queued";
  const currentStatus = queued
    ? "queued"
    : syncing
      ? "running"
      : (health?.lastRunStatus ?? null);
  const loginExpired = health?.lastErrorCode === "LOGIN_REQUIRED";
  const statusLabel = runStatusLabel(currentStatus);
  const collectorUnavailable=source.collector && source.collector.availability!=="active";
  const collectorLabel = collectorUnavailable ? "采集账号需重新选择" : source.collector
    ? `用 ${source.collector.accountHandle ?? source.collector.accountId} 采集`
    : "无需登录账号";
  return (
    <div
      data-testid={`radar-source-row-${source.id}`}
      className={cn(
        "ml-3 mr-1 mt-1.5 min-w-0 overflow-hidden rounded-xl border transition",
        active
          ? "border-primary/30 bg-surface ring-1 ring-primary/10"
          : "border-transparent bg-transparent hover:border-border/70 hover:bg-muted/55",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5 p-1.5">
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={active}
          className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left outline-none transition hover:bg-surface focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <span
            className="block truncate whitespace-nowrap text-xs font-semibold text-foreground"
            title={source.displayName}
          >
            {source.displayName}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1 whitespace-nowrap text-[10px] leading-4 text-muted-foreground">
            <span className="shrink-0">{sourceTypeLabel(source.type)}</span>
            <span aria-hidden="true" className="opacity-50">
              ·
            </span>
            <span
              className={cn(
                "min-w-0 truncate",
                currentStatus === "failed" && "text-destructive",
                currentStatus === "blocked" && "text-warning",
                (currentStatus === "succeeded_with_items" ||
                  currentStatus === "succeeded_no_change") &&
                  "text-success",
              )}
            >
              {statusLabel}
            </span>
          </span>
        </button>
        <Button
          type="button"
          aria-label={
            loginExpired
              ? `重新登录 ${source.displayName} 的采集账号`
              : `${queued ? "等待同步" : syncing ? "正在同步" : "同步"} ${source.displayName}`
          }
          variant="outline"
          size="sm"
          disabled={syncing || source.status !== "active" || !!collectorUnavailable}
          onClick={loginExpired ? onReconnect : onRun}
          className={cn(
            "h-8 shrink-0 gap-1 whitespace-nowrap border-border bg-surface px-2 text-[11px] text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary",
            loginExpired && "border-warning/40 text-warning",
          )}
        >
          {loginExpired ? (
            <ShieldCheck className="size-3" />
          ) : (
            <RefreshCw className={cn("size-3", syncing && "animate-spin")} />
          )}
          {loginExpired ? "登录" : queued ? "排队中" : syncing ? "同步中" : "同步"}
        </Button>
      </div>

      <div className="flex min-w-0 items-center gap-1 border-t border-border/55 bg-muted/25 px-2 py-1.5">
        <span
          className="min-w-0 flex-1 truncate whitespace-nowrap text-[10px] text-muted-foreground"
          title={collectorUnavailable?"采集账号已不可用，请添加使用当前组账号的来源。原内容仍保留。":`${collectorLabel} → 归当前工作区`}
        >
          {collectorLabel}
        </span>
        <Button
          type="button"
          aria-label={`${source.monitorEnabled ? "暂停" : "恢复"} ${source.displayName} 的每日自动同步`}
          title={
            source.monitorEnabled
              ? "暂停每日自动同步（仍可手动同步）"
              : "恢复每日自动同步"
          }
          variant="ghost"
          size="sm"
          disabled={monitorUpdating || source.status !== "active"}
          onClick={onToggleMonitor}
          className="h-6 shrink-0 gap-1 whitespace-nowrap px-1.5 text-[10px] text-muted-foreground hover:bg-surface hover:text-foreground"
        >
          {source.monitorEnabled ? (
            <Pause className="size-3" />
          ) : (
            <Play className="size-3" />
          )}
          {monitorUpdating
            ? "处理中"
            : source.monitorEnabled
              ? "自动"
              : "手动"}
        </Button>
        <Button
          type="button"
          aria-label={
            syncing
              ? `同步中，暂时不能移除 ${source.displayName}`
              : `移除 ${source.displayName}`
          }
          title={
            syncing ? "同步进行中，完成后才能移除来源" : "移除来源"
          }
          variant="ghost"
          size="sm"
          disabled={syncing}
          onClick={onRemove}
          className="h-6 shrink-0 gap-1 whitespace-nowrap px-1.5 text-[10px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3" />
          移除
        </Button>
        <Button
          type="button"
          aria-label={`查看 ${source.displayName} 的运行记录`}
          title="查看运行记录"
          variant="ghost"
          size="icon"
          onClick={onShowRuns}
          className="size-6 shrink-0 text-muted-foreground hover:bg-surface hover:text-foreground"
        >
          <Clock3 className="size-3" />
        </Button>
      </div>
    </div>
  );
}

function ItemCard({
  row,
  active,
  onSelect,
  upgradeState,upgradeSubmitting,onUpgrade,
}: {
  row: RadarItemRow;
  active: boolean;
  onSelect: () => void;
  upgradeState?:RadarProjectState;
  upgradeSubmitting?:boolean;
  onUpgrade?:()=>void;
}) {
  return (
    <div
      className={cn(
        "group flex min-h-28 w-full flex-col overflow-hidden rounded-2xl border bg-surface text-left transition",
        active
          ? "border-primary/60 ring-1 ring-primary/20"
          : "border-border/80 hover:border-primary/30",
      )}
    >
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 flex-col p-3.5 text-left">
        <span className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">
          {row.item.title || "未命名内容"}
        </span>
        <span className="mt-1 truncate text-xs text-muted-foreground">
          {row.item.authorName ?? row.item.platform} ·{" "}
          {row.item.publishedAt
            ? dateLabel(row.item.publishedAt)
            : `发布时间未知 · 收录于 ${dateLabel(row.item.capturedAt)}`}
        </span>
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-[11px] text-muted-foreground">
          <span>赞 {compactNumber(row.latestMetric?.likeCount ?? null)}</span>
          <span>
            评论 {compactNumber(row.latestMetric?.commentCount ?? null)}
          </span>
          <span>{row.sourceCount} 个来源</span>
          {!(row.item.projectId || upgradeState?.projectId) && progressLabel(row.progressState) ? (
            <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-primary">
              {progressLabel(row.progressState)}
            </span>
          ) : null}
        </div>
      </button>
      {(onUpgrade||upgradeState)?<RadarUpgradeAction compact state={upgradeState} submitting={upgradeSubmitting??false} onUpgrade={onUpgrade}/>:null}

    </div>
  );
}

function ItemDetail({detail,upgradeState,upgradeSubmitting,onUpgrade}:{detail:RadarItemDetail;busy?:boolean;upgradeState?:RadarProjectState;upgradeSubmitting:boolean;onUpgrade?:()=>void}) {
  const latest = detail.metrics[0] ?? null;
  // 雷达只负责选方案：转写、拆解、写稿全部在「升级为项目」后的项目流水线里自动完成。
  const transcriptCooling=detail.transcript.errorCode==="TRANSCRIBE_SOURCE_COOLDOWN" && detail.transcript.status==="queued";
  const transcriptBusy =
    detail.transcript.status === "queued" ||
    detail.transcript.status === "running";
  const transcriptLocked = detail.transforms.some(
    (transform) => transform.status === "confirmed",
  );
  const sourceEvidence = groupRadarSourceEvidence(detail.snapshots);
  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-border/70 p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><span className="text-primary">03</span> 阅读核对</h2>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold leading-6 text-foreground">
              {detail.item.title || "未命名内容"}
            </h3>
            <p className="mt-2 text-xs text-muted-foreground">
              {detail.item.authorName ?? detail.item.platform} ·{" "}
              {detail.item.publishedAt
                ? dateLabel(detail.item.publishedAt)
                : `发布时间未知 · 收录于 ${dateLabel(detail.item.capturedAt)}`}
            </p>

          </div>
          <a
            href={detail.item.canonicalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-primary hover:underline"
          >
            原链接 <Link2 className="size-3" />
          </a>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-px border-b border-border/70 bg-border/70">
        {[
          ["点赞", latest?.likeCount ?? null],
          ["评论", latest?.commentCount ?? null],
          ["收藏", latest?.collectCount ?? null],
          ["分享", latest?.shareCount ?? null],
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-surface px-2 py-3 text-center">
            <strong className="block text-sm text-foreground">
              {compactNumber(value as number | null)}
            </strong>
            <span className="mt-0.5 block text-[10px] text-muted-foreground">
              {label}
            </span>
          </div>
        ))}
      </div>

      <div className="space-y-5 p-5">

        <section>
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              逐字稿
            </h4>
            {transcriptLocked ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] text-primary">
                <LockKeyhole className="size-3" />
                已锁定
              </span>
            ) : (
              <span
                className={cn(
                  "rounded-full px-2 py-1 text-[11px]",
                  detail.transcript.status === "done"
                    ? "bg-success-soft text-success"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {transcriptCooling?"等待自动继续":transcriptLabel(detail.transcript.status)}
              </span>
            )}
          </div>
          {detail.transcript.text ? (
            <p className="mt-3 whitespace-pre-wrap rounded-xl bg-muted/60 p-3 text-sm leading-6 text-foreground">
              {detail.transcript.text}
            </p>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-border p-4">
              <p className="text-xs leading-5 text-muted-foreground">
                {transcriptCooling ? "来源通道正在冷却，系统会在等待结束后自动继续，无需重新添加或点击重试。" : transcriptBusy ? "AI 正在后台转写，完成后正文会自动出现在这里。你可以继续处理其他作品。" : "升级为项目后，会在项目里自动转写正文。"}
              </p>
            </div>
          )}
          {transcriptLocked ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <LockKeyhole className="size-3.5 text-primary" />
              已用于生成选题，逐字稿永久锁定。
            </p>
          ) : null}

        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            来源证据
          </h4>
          <div className="mt-3 space-y-2">
            {sourceEvidence.length > 0 ? (
              sourceEvidence.slice(0, 4).map(({ snapshot, captureCount }) => (
                <a
                  key={snapshot.sourceId ?? snapshot.finalUrl}
                  href={snapshot.finalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-xl border border-border/80 px-3 py-2.5 transition hover:border-primary/30"
                >
                  <Clock3 className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">
                      {snapshot.title ?? "来源快照"}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      最近采集 {dateLabel(snapshot.capturedAt)}
                      {captureCount > 1
                        ? ` · 累计采集 ${captureCount} 次`
                        : ""}
                    </span>
                  </span>
                </a>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">
                暂无来源快照，下一次成功同步后显示。
              </p>
            )}
          </div>
        </section>

        <section data-radar-step="upgrade" className="border-t border-border pt-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><span className="text-primary">04</span> 选定方案</h3>
          <p className="text-xs leading-5 text-muted-foreground">
            选中这条作为方案后升级为项目。项目会保留来源；准备进度、补充逐字稿和候选采纳都在项目页处理。
          </p>
          <RadarUpgradeAction
            state={upgradeState}
            submitting={upgradeSubmitting??false}
            onUpgrade={onUpgrade}
          />
        </section>
      </div>
    </div>
  );
}

function RadarEmptyState({
  hasSources,
  filtered = false,
  onClear,
}: {
  hasSources: boolean;
  filtered?: boolean;
  onClear?: () => void;
}) {
  return (
    <div className="flex h-full min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/70 px-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Activity className="size-5" />
      </span>
      <h3 className="mt-4 text-sm font-semibold">
        {filtered
          ? "没有符合条件的内容"
          : hasSources
            ? "来源已就绪，尚未同步到内容"
            : "先添加一个真实来源"}
      </h3>
      <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
        {filtered
          ? "可以清除筛选后查看当前来源中的全部真实内容。"
          : hasSources
          ? "点击左侧来源旁的同步按钮。真无新增会显示“无变化”，登录或解析失败会明确提示，不会伪装成 0 条。"
          : "可以添加抖音博主主页、网页、RSS 或黑马关键词。收藏夹选择器将在登录抖音后提供。"}
      </p>
      {filtered && onClear ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onClear}
          className="mt-4"
        >
          清除筛选
        </Button>
      ) : null}
    </div>
  );
}

export { clampDetailWidth };

/** 工作区切换卸载旧组状态和订阅，原后台任务仍保留。 */
export function IntelligenceWorkbench(props:React.ComponentProps<typeof IntelligenceWorkbenchScope>){return <IntelligenceWorkbenchScope key={radarScopeKey(props)} {...props}/>;}
