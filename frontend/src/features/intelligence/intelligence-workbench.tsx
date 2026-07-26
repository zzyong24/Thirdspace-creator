"use client";

import * as React from "react";
import Image from "next/image";
import {
  Activity,
  Archive,
  ChevronRight,
  Clock3,
  FileAudio,
  FolderPlus,
  Link2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { ErrorCode } from "@creatoros/contract";

import { client } from "@/lib/contract-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface RadarCollection {
  id: string;
  parentId: string | null;
  name: string;
  kind: "system" | "custom";
  sortOrder: number;
  version: number;
}

export interface RadarSource {
  id: string;
  collectionId: string | null;
  type:
    | "creator_profile"
    | "favorites_folder"
    | "web"
    | "rss"
    | "darkhorse_query";
  displayName: string;
  canonicalUrl: string | null;
  monitorEnabled: boolean;
  status: "draft" | "active" | "paused" | "archived";
  lastRunAt: string | null;
}

export interface RadarMetric {
  id: string;
  capturedAt: string;
  likeCount: number | null;
  commentCount: number | null;
  collectCount: number | null;
  shareCount: number | null;
}

export interface RadarItem {
  id: string;
  type: "video" | "article" | "trend_signal";
  platform: string;
  canonicalUrl: string;
  authorName: string | null;
  title: string;
  summary: string | null;
  coverUrl: string | null;
  publishedAt: string | null;
  capturedAt: string;
}

export interface RadarItemRow {
  item: RadarItem;
  latestMetric: RadarMetric | null;
  sourceCount: number;
}

export interface RadarItemDetail {
  item: RadarItem;
  metrics: RadarMetric[];
  observations: Array<{
    id: string;
    sourceId: string;
    firstSeenAt: string;
    lastSeenAt: string;
  }>;
  snapshots: Array<{
    id: string;
    title: string | null;
    capturedAt: string;
    finalUrl: string;
  }>;
  transcript: {
    itemId: string;
    status:
      | "not_requested"
      | "queued"
      | "running"
      | "done"
      | "skipped"
      | "failed"
      | "blocked";
    text: string | null;
    errorCode: string | null;
  };
  transforms: Array<{
    id: string;
    status: "candidate" | "confirmed" | "cancelled";
    outputSnapshot: {
      hook?: string;
      structureSteps?: string[];
      coreClaims?: string[];
      reusablePattern?: string;
      factRisks?: string[];
      title: string;
      angle: string;
      differentiation: string;
      sourceSummary: string;
      sourceUrl?: string;
      transcriptHash?: string;
      decompositionVersion?: string;
    } | null;
    targetTopicId: string | null;
  }>;
}

export interface RadarWorkspace {
  collections: RadarCollection[];
  sources: RadarSource[];
  memberships: Array<{
    id: string;
    sourceId: string;
    collectionId: string;
    createdAt: string;
  }>;
  pendingCount: number;
  blockedCount: number;
}

export interface RadarApi {
  previewProfile(input: {
    accountId: string;
    url: string;
  }): Promise<{
    externalAccountId: string;
    nickname: string;
    avatarUrl: string | null;
    canonicalUrl: string;
    visibleWorkCount: number | null;
    browserSessionRef: string;
  }>;
  previewWeb(input: {
    accountId: string;
    url: string;
    instruction: string;
  }): Promise<{
    type: "web" | "rss";
    title: string | null;
    finalUrl: string;
    samples: Array<{ title: string; url: string; summary: string | null }>;
    loginRequired: boolean;
    parser: string;
    browserSessionRef: string | null;
  }>;
  listFavoriteFolders(input: {
    accountId: string;
    browserSessionRef: string;
  }): Promise<Array<{ id: string; name: string; itemCount: number | null }>>;
  createCollection(input: {
    accountId: string;
    name: string;
    parentId: string | null;
    idempotencyKey: string;
  }): Promise<unknown>;
  createSource(input: {
    accountId: string;
    collectionId: string | null;
    type: RadarSource["type"];
    config: Record<string, unknown>;
    displayName?: string;
    extractionInstruction?: string;
    monitorEnabled: boolean;
    runInitial: boolean;
    idempotencyKey: string;
  }): Promise<unknown>;
  importDouyinShare(input: {
    accountId: string;
    collectionId: string | null;
    shareInput: string;
    idempotencyKey: string;
  }): Promise<unknown>;
  startRun(input: {
    sourceId: string;
    idempotencyKey: string;
  }): Promise<unknown>;
  getItem(itemId: string): Promise<RadarItemDetail>;
  enqueueTranscript(input: {
    itemId: string;
    idempotencyKey: string;
  }): Promise<unknown>;
  previewTopic(input: {
    itemId: string;
    sourceSnapshotId: string;
    positioningVersionId: string;
    idempotencyKey: string;
  }): Promise<unknown>;
  confirmTopic(input: {
    transformId: string;
    editedCandidate: {
      title: string;
      angle: string;
      differentiation: string;
      sourceSummary: string;
    };
    idempotencyKey: string;
  }): Promise<unknown>;
}

function defaultApi(): RadarApi {
  return {
    previewProfile: (input) =>
      client.previewIntelligenceProfile({
        params: undefined,
        query: undefined,
        body: input,
      }),
    previewWeb: (input) =>
      client.previewIntelligenceWeb({
        params: undefined,
        query: undefined,
        body: { ...input, instruction: input.instruction },
      }),
    listFavoriteFolders: (input) =>
      client.listIntelligenceFavoriteFolders({
        params: undefined,
        query: input,
        body: undefined,
      }) as unknown as Promise<
        Array<{ id: string; name: string; itemCount: number | null }>
      >,
    createCollection: (input) =>
      client.createIntelligenceCollection({
        params: undefined,
        query: undefined,
        body: input,
      }),
    createSource: (input) =>
      client.createIntelligenceSource({
        params: undefined,
        query: undefined,
        body: input as never,
      }),
    importDouyinShare: (input) =>
      client.importDouyinShareItem({
        params: undefined,
        query: undefined,
        body: input,
      }),
    startRun: (input) =>
      client.startIntelligenceRun({
        params: { sourceId: input.sourceId },
        query: undefined,
        body: {
          trigger: "manual",
          idempotencyKey: input.idempotencyKey,
        },
      }),
    getItem: (itemId) =>
      client.getIntelligenceItem({
        params: { itemId },
        query: undefined,
        body: undefined,
      }) as Promise<RadarItemDetail>,
    enqueueTranscript: (input) =>
      client.enqueueIntelligenceTranscripts({
        params: undefined,
        query: undefined,
        body: {
          itemIds: [input.itemId],
          idempotencyKey: input.idempotencyKey,
        },
      }),
    previewTopic: (input) =>
      client.previewIntelligenceTopic({
        params: undefined,
        query: undefined,
        body: input,
      }),
    confirmTopic: (input) =>
      client.confirmIntelligenceTopic({
        params: { transformId: input.transformId },
        query: undefined,
        body: {
          editedCandidate: input.editedCandidate,
          idempotencyKey: input.idempotencyKey,
        },
      }),
  };
}

function operationKey(prefix: string): string {
  return `${prefix}:${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
}

export function favoriteFoldersErrorMessage(error: unknown): string {
  const code =
    error && typeof error === "object"
      ? (error as { code?: unknown }).code
      : null;
  switch (code) {
    case ErrorCode.DouyinFavoritesSessionExpired:
      return "抖音收藏登录已失效，请重新登录当前账号后再读取。";
    case ErrorCode.OwnershipError:
    case ErrorCode.AccountRequiredError:
      return "当前页面账号与收藏登录档案不一致，请切回正确账号后重试。";
    case ErrorCode.DouyinFavoritesBrowserLocked:
      return "当前账号的登录浏览器档案正在被占用，请关闭相关浏览器窗口后重试。";
    case ErrorCode.DouyinFavoritesCaptcha:
      return "抖音要求完成验证码，请先完成验证后再读取收藏夹。";
    case ErrorCode.DouyinFavoritesNetwork:
      return "读取收藏夹时网络连接失败，请检查网络后重试。";
    case ErrorCode.DouyinFavoritesInvalidResponse:
      return "抖音收藏接口返回了不完整数据，本次未按 0 个处理，请稍后重试。";
    case ErrorCode.DouyinFavoritesUpstream:
      return "抖音收藏接口暂时拒绝请求，请稍后重试。";
    default:
      return "收藏夹服务暂时不可用，请稍后重试；本次不会被记成 0 个。";
  }
}

const DETAIL_WIDTH_KEY = "creatoros:intelligence:detail-width";
const MIN_DETAIL_WIDTH = 320;
const MAX_DETAIL_WIDTH = 640;

function clampDetailWidth(value: number): number {
  return Math.min(MAX_DETAIL_WIDTH, Math.max(MIN_DETAIL_WIDTH, value));
}

function compactNumber(value: number | null): string {
  if (value === null) return "未知";
  return new Intl.NumberFormat("zh-CN", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function dateLabel(value: string | null): string {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function sourceTypeLabel(type: RadarSource["type"]): string {
  return {
    creator_profile: "博主主页",
    favorites_folder: "我的收藏",
    web: "网页",
    rss: "RSS",
    darkhorse_query: "黑马关键词",
  }[type];
}

function transcriptLabel(status: RadarItemDetail["transcript"]["status"]) {
  return {
    not_requested: "尚未转写",
    queued: "排队中",
    running: "转写中",
    done: "已完成",
    skipped: "已跳过",
    failed: "转写失败",
    blocked: "需要配置",
  }[status];
}

export function IntelligenceWorkbench({
  accountId,
  workspace,
  items,
  initialDetail,
  positioningVersionId = null,
  api: injectedApi,
}: {
  accountId: string;
  workspace: RadarWorkspace;
  items: RadarItemRow[];
  initialDetail: RadarItemDetail | null;
  positioningVersionId?: string | null;
  api?: RadarApi;
}) {
  const router = useRouter();
  const api = React.useMemo(() => injectedApi ?? defaultApi(), [injectedApi]);
  const [selectedCollectionId, setSelectedCollectionId] = React.useState<
    string | null
  >(null);
  const [selectedSourceId, setSelectedSourceId] = React.useState<string | null>(
    null,
  );
  const [query, setQuery] = React.useState("");
  const [detail, setDetail] = React.useState<RadarItemDetail | null>(
    initialDetail,
  );
  const [detailWidth, setDetailWidth] = React.useState(392);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

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

  const persistWidth = React.useCallback((width: number) => {
    const next = clampDetailWidth(width);
    setDetailWidth(next);
    try {
      window.localStorage.setItem(DETAIL_WIDTH_KEY, String(next));
    } catch {
      // 隐私模式下只保留本次会话宽度。
    }
  }, []);

  const filteredItems = React.useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("zh-CN");
    return items.filter(({ item }) => {
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
      if (!selectedSourceId && !selectedCollectionId) return true;
      // 精确来源/分类的服务器查询会在刷新 URL 筛选版接入；当前不伪造本地归属关系，
      // 选择左栏只聚焦来源信息，作品列表仍展示账号内真实全集。
      return true;
    });
  }, [items, query, selectedCollectionId, selectedSourceId]);

  const selectItem = React.useCallback(
    async (itemId: string) => {
      setBusy(true);
      setNotice(null);
      try {
        setDetail(await api.getItem(itemId));
      } catch {
        setNotice("作品详情读取失败，请稍后重试。");
      } finally {
        setBusy(false);
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

  const runSource = React.useCallback(
    async (sourceId: string) => {
      setBusy(true);
      setNotice(null);
      try {
        await api.startRun({
          sourceId,
          idempotencyKey: operationKey("manual-sync"),
        });
        setNotice("同步任务已进入队列，可在来源运行记录中查看进度。");
        router.refresh();
      } catch {
        setNotice("暂时无法开始同步：可能已有任务在运行，或来源需要重新登录。");
      } finally {
        setBusy(false);
      }
    },
    [api, router],
  );

  const enqueueTranscript = React.useCallback(async () => {
    if (!detail) return;
    setBusy(true);
    setNotice(null);
    try {
      await api.enqueueTranscript({
        itemId: detail.item.id,
        idempotencyKey: operationKey("manual-transcribe"),
      });
      setDetail({
        ...detail,
        transcript: { ...detail.transcript, status: "queued" },
      });
      setNotice("逐字稿已进入异步队列。系统不会自动转写其他作品。");
      router.refresh();
    } catch {
      setNotice("逐字稿排队失败，请检查 ASR 模型配置后重试。");
    } finally {
      setBusy(false);
    }
  }, [api, detail, router]);

  const previewTopic = React.useCallback(async () => {
    const sourceSnapshotId = detail?.snapshots[0]?.id;
    if (!detail || !sourceSnapshotId || !positioningVersionId) return;
    setBusy(true);
    setNotice(null);
    try {
      await api.previewTopic({
        itemId: detail.item.id,
        sourceSnapshotId,
        positioningVersionId,
        idempotencyKey: operationKey("topic-preview"),
      });
      setNotice("选题候选正在结合当前定位生成，完成前不会写入选题池。");
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        const refreshed = await api.getItem(detail.item.id);
        setDetail(refreshed);
        if (
          refreshed.transforms.some(
            (transform) => transform.outputSnapshot !== null,
          )
        ) {
          setNotice("选题候选已生成，请检查后确认写入选题池。");
          break;
        }
      }
    } catch {
      setNotice("选题候选生成失败，请检查定位版本和来源快照后重试。");
    } finally {
      setBusy(false);
    }
  }, [api, detail, positioningVersionId]);

  const confirmTopic = React.useCallback(
    async (
      transformId: string,
      candidate: NonNullable<
        RadarItemDetail["transforms"][number]["outputSnapshot"]
      >,
    ) => {
      if (!detail) return;
      setBusy(true);
      setNotice(null);
      try {
        await api.confirmTopic({
          transformId,
          editedCandidate: {
            title: candidate.title,
            angle: candidate.angle,
            differentiation: candidate.differentiation,
            sourceSummary: candidate.sourceSummary,
          },
          idempotencyKey: operationKey("topic-confirm"),
        });
        setDetail(await api.getItem(detail.item.id));
        setNotice("已确认写入选题池；稿件生成和改写仍在创建 Project 后进行。");
        router.refresh();
      } catch {
        setNotice("写入选题池失败，候选仍保留，可以稍后重试。");
      } finally {
        setBusy(false);
      }
    },
    [api, detail, router],
  );

  return (
    <section
      data-testid="intelligence-workbench"
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-[22px] border border-border/80 bg-surface shadow-lg"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-gradient-to-r from-brand-soft/60 via-surface to-surface px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Activity className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-foreground">
              真实信源工作台
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              只收公开作品与公开计数 · 评论正文不采集 · 逐字稿只手动排队
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-warning-soft px-2.5 py-1 text-warning">
            待处理 {workspace.pendingCount}
          </span>
          <span className="rounded-full bg-danger-soft px-2.5 py-1 text-danger">
            受阻 {workspace.blockedCount}
          </span>
          <AddCollectionDialog
            accountId={accountId}
            api={api}
            onDone={() => router.refresh()}
          />
          <ImportDouyinShareDialog
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
          <AddSourceDialog
            accountId={accountId}
            collections={workspace.collections}
            api={api}
            onDone={() => router.refresh()}
          />
        </div>
      </div>

      {notice ? (
        <div
          role="status"
          className="shrink-0 border-b border-border/60 bg-muted/45 px-5 py-2 text-xs text-foreground"
        >
          {notice}
        </div>
      ) : null}

      <div
        data-testid="intelligence-responsive-layout"
        className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto xl:grid-cols-[minmax(220px,260px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(220px,260px)_minmax(360px,1fr)_auto] 2xl:overflow-hidden"
      >
        <aside
          data-testid="intelligence-sidebar"
          aria-label="内容雷达分类和来源"
          className="flex min-h-0 flex-col border-b border-border/70 bg-surface-subtle xl:border-b-0 xl:border-r"
        >
          <div className="shrink-0 px-4 pb-2 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              分类与来源
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
            <button
              type="button"
              onClick={() => {
                setSelectedCollectionId(null);
                setSelectedSourceId(null);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition",
                !selectedCollectionId && !selectedSourceId
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-foreground hover:bg-muted",
              )}
            >
              <span>全部内容</span>
              <span className="text-xs text-muted-foreground">
                {items.length}
              </span>
            </button>
            {workspace.collections.map((collection) => {
              const collectionSources = workspace.sources.filter(
                (source) =>
                  source.collectionId === collection.id ||
                  workspace.memberships.some(
                    (membership) =>
                      membership.collectionId === collection.id &&
                      membership.sourceId === source.id,
                  ),
              );
              return (
                <div key={collection.id} className="mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCollectionId(collection.id);
                      setSelectedSourceId(null);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition",
                      selectedCollectionId === collection.id
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-foreground hover:bg-muted",
                    )}
                  >
                    {collection.kind === "system" ? (
                      <ShieldCheck className="size-3.5 text-primary" />
                    ) : (
                      <Archive className="size-3.5 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {collection.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {collectionSources.length}
                    </span>
                  </button>
                  {collectionSources.map((source) => (
                    <SourceRow
                      key={source.id}
                      source={source}
                      active={selectedSourceId === source.id}
                      disabled={busy}
                      onSelect={() => {
                        setSelectedCollectionId(collection.id);
                        setSelectedSourceId(source.id);
                      }}
                      onRun={() => runSource(source.id)}
                    />
                  ))}
                </div>
              );
            })}
            {workspace.sources
              .filter(
                (source) =>
                  source.collectionId === null &&
                  !workspace.memberships.some(
                    (membership) => membership.sourceId === source.id,
                  ),
              )
              .map((source) => (
                <SourceRow
                  key={source.id}
                  source={source}
                  active={selectedSourceId === source.id}
                  disabled={busy}
                  onSelect={() => {
                    setSelectedCollectionId(null);
                    setSelectedSourceId(source.id);
                  }}
                  onRun={() => runSource(source.id)}
                />
              ))}
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col bg-canvas/55">
          <div className="flex shrink-0 items-center gap-3 border-b border-border/70 px-4 py-3">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="搜索雷达内容"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索标题、作者或摘要"
                className="h-9 rounded-xl border-border/80 bg-surface pl-9"
              />
            </label>
            <span className="shrink-0 text-xs text-muted-foreground">
              {filteredItems.length} 条真实内容
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {filteredItems.length === 0 ? (
              <RadarEmptyState hasSources={workspace.sources.length > 0} />
            ) : (
              <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                {filteredItems.map((row) => (
                  <ItemCard
                    key={row.item.id}
                    row={row}
                    active={detail?.item.id === row.item.id}
                    onSelect={() => selectItem(row.item.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </main>

        <div className="relative flex min-h-[320px] xl:col-span-2 2xl:col-span-1 2xl:min-h-0">
          <div
            role="separator"
            aria-label="调整作品详情宽度"
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
                positioningReady={Boolean(positioningVersionId)}
                onTranscribe={enqueueTranscript}
                onPreviewTopic={previewTopic}
                onConfirmTopic={confirmTopic}
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
      </div>
    </section>
  );
}

function SourceRow({
  source,
  active,
  disabled,
  onSelect,
  onRun,
}: {
  source: RadarSource;
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
  onRun: () => void;
}) {
  return (
    <div
      className={cn(
        "ml-4 mt-1 flex items-stretch gap-1 rounded-lg",
        active ? "bg-surface shadow-sm" : "hover:bg-muted/70",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 px-3 py-2 text-left"
      >
        <span className="block truncate text-xs font-medium text-foreground">
          {source.displayName}
        </span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          {sourceTypeLabel(source.type)} ·{" "}
          {source.status === "active" ? "正常" : source.status}
        </span>
      </button>
      <button
        type="button"
        aria-label={`同步 ${source.displayName}`}
        disabled={disabled || source.status !== "active"}
        onClick={onRun}
        className="my-1 mr-1 inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-muted-foreground transition hover:border-primary/40 hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshCw className="size-3.5" />
        同步
      </button>
    </div>
  );
}

function ItemCard({
  row,
  active,
  onSelect,
}: {
  row: RadarItemRow;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex min-h-36 w-full overflow-hidden rounded-2xl border bg-surface text-left transition",
        active
          ? "border-primary/60 shadow-card ring-1 ring-primary/20"
          : "border-border/80 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm",
      )}
    >
      <div className="relative w-28 shrink-0 overflow-hidden bg-gradient-to-br from-brand-soft via-surface-subtle to-surface">
        {row.item.coverUrl ? (
          <Image
            src={row.item.coverUrl}
            alt=""
            fill
            unoptimized
            className="object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <Sparkles className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-primary/55" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-3">
        <span className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">
          {row.item.title || "未命名内容"}
        </span>
        <span className="mt-1 truncate text-xs text-muted-foreground">
          {row.item.authorName ?? row.item.platform} ·{" "}
          {dateLabel(row.item.publishedAt ?? row.item.capturedAt)}
        </span>
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-[11px] text-muted-foreground">
          <span>赞 {compactNumber(row.latestMetric?.likeCount ?? null)}</span>
          <span>
            评论 {compactNumber(row.latestMetric?.commentCount ?? null)}
          </span>
          <span>{row.sourceCount} 个来源</span>
        </div>
      </div>
    </button>
  );
}

function ItemDetail({
  detail,
  busy,
  positioningReady,
  onTranscribe,
  onPreviewTopic,
  onConfirmTopic,
}: {
  detail: RadarItemDetail;
  busy: boolean;
  positioningReady: boolean;
  onTranscribe: () => void;
  onPreviewTopic: () => void;
  onConfirmTopic: (
    transformId: string,
    candidate: NonNullable<
      RadarItemDetail["transforms"][number]["outputSnapshot"]
    >,
  ) => void;
}) {
  const latest = detail.metrics[0] ?? null;
  const latestTransform = detail.transforms[0] ?? null;
  const topicCandidate = latestTransform?.outputSnapshot ?? null;
  const transcriptCanStart = [
    "not_requested",
    "failed",
    "blocked",
    "skipped",
  ].includes(detail.transcript.status);
  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-border/70 p-5">
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-gradient-to-br from-brand-soft via-surface-subtle to-surface">
          {detail.item.coverUrl ? (
            <Image
              src={detail.item.coverUrl}
              alt=""
              fill
              unoptimized
              className="object-cover"
            />
          ) : (
            <TrendingUp className="absolute left-1/2 top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 text-primary/60" />
          )}
        </div>
        <h3 className="mt-4 text-base font-semibold leading-6 text-foreground">
          {detail.item.title || "未命名内容"}
        </h3>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{detail.item.authorName ?? detail.item.platform}</span>
          <a
            href={detail.item.canonicalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
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
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              转为我的选题
            </h4>
            {latestTransform?.status === "confirmed" ? (
              <span className="rounded-full bg-success-soft px-2 py-1 text-[11px] text-success">
                已进入选题池
              </span>
            ) : null}
          </div>
          {latestTransform && topicCandidate ? (
            <TopicCandidateEditor
              key={latestTransform.id}
              transform={{
                ...latestTransform,
                outputSnapshot: topicCandidate,
              }}
              busy={busy}
              onConfirm={onConfirmTopic}
            />
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-border p-4">
              <p className="text-xs leading-5 text-muted-foreground">
                结合当前账号定位生成可编辑候选。生成阶段不会写选题池，只有你确认后才写入。
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  busy ||
                  !positioningReady ||
                  detail.snapshots.length === 0 ||
                  detail.transcript.status !== "done"
                }
                onClick={onPreviewTopic}
                className="mt-3 gap-1.5"
              >
                <Sparkles className="size-3.5" />
                生成选题候选
              </Button>
              {!positioningReady ? (
                <p className="mt-2 text-[11px] text-warning">
                  请先在定位中心保存一版定位。
                </p>
              ) : detail.snapshots.length === 0 ? (
                <p className="mt-2 text-[11px] text-warning">
                  需要先完成一次真实同步，取得来源快照。
                </p>
              ) : detail.transcript.status !== "done" ? (
                <p className="mt-2 text-[11px] text-warning">
                  请先在下方手动转写。只有完整逐字稿拆解完成后，才能生成有结构依据的选题。
                </p>
              ) : null}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              逐字稿
            </h4>
            <span
              className={cn(
                "rounded-full px-2 py-1 text-[11px]",
                detail.transcript.status === "done"
                  ? "bg-success-soft text-success"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {transcriptLabel(detail.transcript.status)}
            </span>
          </div>
          {detail.transcript.text ? (
            <p className="mt-3 whitespace-pre-wrap rounded-xl bg-muted/60 p-3 text-sm leading-6 text-foreground">
              {detail.transcript.text}
            </p>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-border p-4">
              <p className="text-xs leading-5 text-muted-foreground">
                不会自动转写。需要时由你手动发起，任务会排队并可暂停、恢复或重试。
              </p>
              {transcriptCanStart ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={onTranscribe}
                  className="mt-3 gap-1.5"
                >
                  <FileAudio className="size-3.5" />
                  手动转写
                </Button>
              ) : null}
            </div>
          )}
        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            来源证据
          </h4>
          <div className="mt-3 space-y-2">
            {detail.snapshots.length > 0 ? (
              detail.snapshots.slice(0, 4).map((snapshot) => (
                <a
                  key={snapshot.id}
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
                      {dateLabel(snapshot.capturedAt)}
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
      </div>
    </div>
  );
}

function TopicCandidateEditor({
  transform,
  busy,
  onConfirm,
}: {
  transform: RadarItemDetail["transforms"][number] & {
    outputSnapshot: NonNullable<
      RadarItemDetail["transforms"][number]["outputSnapshot"]
    >;
  };
  busy: boolean;
  onConfirm: (
    transformId: string,
    candidate: NonNullable<
      RadarItemDetail["transforms"][number]["outputSnapshot"]
    >,
  ) => void;
}) {
  const [candidate, setCandidate] = React.useState(transform.outputSnapshot);
  const confirmed = transform.status === "confirmed";
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-primary/20 bg-primary/[0.035] p-3">
      {candidate.hook || candidate.structureSteps?.length ? (
      <div className="space-y-2 rounded-lg border border-border/70 bg-surface p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-foreground">
            逐字稿结构拆解
          </span>
          {candidate.sourceUrl ? (
            <a
              href={candidate.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              查看原视频 <Link2 className="size-3" />
            </a>
          ) : null}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">钩子：</span>
          {candidate.hook ?? "—"}
        </p>
        <ol className="list-decimal space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
          {(candidate.structureSteps ?? []).map((step, index) => (
            <li key={`${index}:${step}`}>{step}</li>
          ))}
        </ol>
        <p className="text-xs leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">可迁移结构：</span>
          {candidate.reusablePattern ?? "—"}
        </p>
        {(candidate.factRisks?.length ?? 0) > 0 ? (
          <p className="text-xs leading-5 text-warning">
            待核验：{candidate.factRisks?.join("；")}
          </p>
        ) : null}
      </div>
      ) : null}
      <Input
        aria-label="选题候选标题"
        value={candidate.title}
        disabled={confirmed}
        onChange={(event) =>
          setCandidate({ ...candidate, title: event.target.value })
        }
        className="bg-surface text-sm font-medium"
      />
      {(
        [
          ["angle", "角度"],
          ["differentiation", "差异化"],
          ["sourceSummary", "来源摘要"],
        ] as const
      ).map(([field, label]) => (
        <label key={field} className="grid gap-1 text-[11px] text-muted-foreground">
          {label}
          <textarea
            aria-label={`选题候选${label}`}
            value={candidate[field]}
            disabled={confirmed}
            onChange={(event) =>
              setCandidate({ ...candidate, [field]: event.target.value })
            }
            className="min-h-16 resize-y rounded-lg border border-input bg-surface px-3 py-2 text-xs leading-5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      ))}
      {!confirmed ? (
        <Button
          type="button"
          size="sm"
          disabled={
            busy ||
            [
              candidate.title,
              candidate.angle,
              candidate.differentiation,
              candidate.sourceSummary,
            ].some((value) => !value.trim())
          }
          onClick={() => onConfirm(transform.id, candidate)}
          className="w-full"
        >
          确认写入选题池
        </Button>
      ) : null}
      <p className="text-[10px] leading-4 text-muted-foreground">
        这里只创建选题；口播稿生成和改写仍在 Project 创建后进行。
      </p>
    </div>
  );
}

function RadarEmptyState({ hasSources }: { hasSources: boolean }) {
  return (
    <div className="flex h-full min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/70 px-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Activity className="size-5" />
      </span>
      <h3 className="mt-4 text-sm font-semibold">
        {hasSources ? "来源已就绪，尚未同步到内容" : "先添加一个真实来源"}
      </h3>
      <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
        {hasSources
          ? "点击左侧来源旁的同步按钮。真无新增会显示“无变化”，登录或解析失败会明确提示，不会伪装成 0 条。"
          : "可以添加抖音博主主页、网页、RSS 或黑马关键词。收藏夹选择器将在登录抖音后提供。"}
      </p>
    </div>
  );
}

function AddCollectionDialog({
  accountId,
  api,
  onDone,
}: {
  accountId: string;
  api: RadarApi;
  onDone: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5">
          <FolderPlus className="size-3.5" />
          新建分类
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建监控分类</DialogTitle>
          <DialogDescription>
            分类只负责整理来源，不复制作品，也不会自动创建选题。
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          aria-label="分类名称"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="例如：AI 工具博主"
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button
            type="button"
            disabled={pending || !name.trim()}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                try {
                  await api.createCollection({
                    accountId,
                    name: name.trim(),
                    parentId: null,
                    idempotencyKey: operationKey("collection"),
                  });
                  setName("");
                  setOpen(false);
                  onDone();
                } catch {
                  setError("创建失败：同级可能已有同名分类。");
                }
              })
            }
          >
            {pending ? "创建中…" : "创建分类"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportDouyinShareDialog({
  accountId,
  collections,
  api,
  onDone,
}: {
  accountId: string;
  collections: RadarCollection[];
  api: RadarApi;
  onDone: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [shareText, setShareText] = React.useState("");
  const [collectionId, setCollectionId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5">
          <Link2 className="size-3.5" />
          粘贴分享链接
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>从抖音分享链接建档</DialogTitle>
          <DialogDescription>
            可直接粘贴整段分享话术。系统会识别真实作品和作者：已有博主就把视频归入其作品，
            没有则自动创建博主档案。只建档公开数据，不会自动转写。
          </DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          aria-label="抖音分享文本"
          rows={5}
          value={shareText}
          onChange={(event) => setShareText(event.target.value)}
          placeholder="例如：复制打开抖音，看看这个视频 https://v.douyin.com/..."
          className="resize-none"
        />
        <label className="grid gap-1 text-xs text-muted-foreground">
          导入到分类
          <select
            aria-label="导入到分类"
            value={collectionId}
            onChange={(event) => setCollectionId(event.target.value)}
            className="h-9 rounded-xl border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="">未分类</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </select>
        </label>
        <div className="rounded-xl border border-border/70 bg-muted/45 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
          建档层级为“分类 → 博主 → 视频”。导入会排进持久任务队列；短链解析、登录校验或
          验证码受阻时会诚实显示失败，不会建立只有标题的空记录。
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button
            type="button"
            disabled={pending || !shareText.trim()}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                try {
                  await api.importDouyinShare({
                    accountId,
                    collectionId: collectionId || null,
                    shareInput: shareText.trim(),
                    idempotencyKey: operationKey("douyin-share-import"),
                  });
                  setShareText("");
                  setCollectionId("");
                  setOpen(false);
                  onDone();
                } catch {
                  setError(
                    "暂时无法进入导入队列。请确认分享文本含抖音链接，并检查当前账号登录状态。",
                  );
                }
              })
            }
          >
            {pending ? "正在排队…" : "识别并建档"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddSourceDialog({
  accountId,
  collections,
  api,
  onDone,
}: {
  accountId: string;
  collections: RadarCollection[];
  api: RadarApi;
  onDone: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<RadarSource["type"]>(
    "creator_profile",
  );
  const [value, setValue] = React.useState("");
  const [name, setName] = React.useState("");
  const [instruction, setInstruction] = React.useState("");
  const [collectionId, setCollectionId] = React.useState("");
  const [monitor, setMonitor] = React.useState(true);
  const [profilePreview, setProfilePreview] = React.useState<Awaited<
    ReturnType<RadarApi["previewProfile"]>
  > | null>(null);
  const [webPreview, setWebPreview] = React.useState<Awaited<
    ReturnType<RadarApi["previewWeb"]>
  > | null>(null);
  const [folders, setFolders] = React.useState<
    Awaited<ReturnType<RadarApi["listFavoriteFolders"]>>
  >([]);
  const [verifiedMessage, setVerifiedMessage] = React.useState<string | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const resetVerification = React.useCallback(() => {
    setProfilePreview(null);
    setWebPreview(null);
    setVerifiedMessage(null);
  }, []);

  const verify = React.useCallback(() => {
    startTransition(async () => {
      setError(null);
      resetVerification();
      try {
        if (type === "creator_profile") {
          const preview = await api.previewProfile({
            accountId,
            url: new URL(value).toString(),
          });
          setProfilePreview(preview);
          setName((current) => current || preview.nickname);
          setVerifiedMessage(
            `已识别「${preview.nickname}」· 当前可见 ${preview.visibleWorkCount ?? "未知"} 条作品`,
          );
          return;
        }
        if (type === "favorites_folder") {
          setFolders([]);
          const rows = await api.listFavoriteFolders({
            accountId,
            browserSessionRef: `douyin-profile:${accountId}`,
          });
          setFolders(rows);
          if (rows.length === 0) {
            setVerifiedMessage("已确认当前账号目前有 0 个收藏夹。");
            return;
          }
          setValue((current) => current || rows[0]!.id);
          setVerifiedMessage(`已读取 ${rows.length} 个收藏夹，请选择要监控的一个。`);
          return;
        }
        if (type === "web" || type === "rss") {
          const preview = await api.previewWeb({
            accountId,
            url: new URL(value).toString(),
            instruction,
          });
          if (preview.loginRequired) {
            setError("该网页需要先登录。请到“设置 → 网站登录保管库”登录后再测试。");
            return;
          }
          setWebPreview(preview);
          setType(preview.type);
          setName((current) => current || preview.title || "");
          setVerifiedMessage(
            `验证成功：识别为 ${preview.type === "rss" ? "RSS/Atom" : "网页正文"}，取得 ${preview.samples.length} 条样例`,
          );
        }
      } catch (caught) {
        setError(
          type === "creator_profile"
            ? "主页验证失败：请确认已登录抖音，并输入完整的 /user/… 主页链接。"
            : type === "favorites_folder"
              ? favoriteFoldersErrorMessage(caught)
              : "来源验证失败：请检查网址、登录状态或页面是否允许读取。",
        );
      }
    });
  }, [accountId, api, instruction, resetVerification, type, value]);

  const create = React.useCallback(() => {
    startTransition(async () => {
      setError(null);
      try {
        let config: Record<string, unknown>;
        if (type === "creator_profile") {
          if (!profilePreview) throw new Error("preview required");
          config = {
            type,
            canonicalUrl: profilePreview.canonicalUrl,
            externalAccountId: profilePreview.externalAccountId,
            browserSessionRef: profilePreview.browserSessionRef,
          };
        } else if (type === "favorites_folder") {
          if (!folders.some((folder) => folder.id === value)) {
            throw new Error("folder preview required");
          }
          config = {
            type,
            folderId: value,
            browserSessionRef: `douyin-profile:${accountId}`,
          };
        } else if (type === "darkhorse_query") {
          if (!value.trim()) throw new Error("missing keyword");
          config = {
            type,
            keyword: value.trim(),
            board: "low_follower_breakout",
            browserSessionRef: `douyin-profile:${accountId}`,
          };
        } else {
          if (!webPreview || webPreview.type !== type) {
            throw new Error("preview required");
          }
          config = {
            type,
            url: webPreview.finalUrl,
            ...(webPreview.browserSessionRef
              ? { browserSessionRef: webPreview.browserSessionRef }
              : {}),
          };
        }
        await api.createSource({
          accountId,
          collectionId: collectionId || null,
          type,
          config,
          ...(name.trim() ? { displayName: name.trim() } : {}),
          ...(instruction.trim()
            ? { extractionInstruction: instruction.trim() }
            : {}),
          monitorEnabled: monitor,
          runInitial: true,
          idempotencyKey: operationKey("source"),
        });
        setValue("");
        setName("");
        setInstruction("");
        setFolders([]);
        resetVerification();
        setOpen(false);
        onDone();
      } catch {
        setError(
          type === "darkhorse_query"
            ? "请填写低粉爆款关键词，并确认当前抖音登录状态有效。"
            : "请先完成来源验证，再保存并首次同步。",
        );
      }
    });
  }, [
    accountId,
    api,
    collectionId,
    monitor,
    name,
    onDone,
    profilePreview,
    folders,
    instruction,
    resetVerification,
    type,
    value,
    webPreview,
  ]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 gap-1.5">
          <Plus className="size-3.5" />
          添加来源
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[min(90vh,760px)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>添加真实来源</DialogTitle>
          <DialogDescription>
            主页、网页和收藏夹先真实验证再保存。逐字稿不会自动生成。
          </DialogDescription>
        </DialogHeader>
        <div
          data-testid="source-type-choices"
          className="grid grid-cols-2 gap-2 sm:grid-cols-5"
        >
          {(
            [
              ["creator_profile", "博主主页"],
              ["favorites_folder", "我的收藏"],
              ["web", "网页"],
              ["rss", "RSS"],
              ["darkhorse_query", "黑马关键词"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setType(id);
                setValue("");
                setError(null);
                setFolders([]);
                resetVerification();
              }}
              className={cn(
                "min-w-0 whitespace-normal break-words rounded-xl border px-2 py-2 text-xs transition",
                type === id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {type === "favorites_folder" && folders.length > 0 ? (
          <label className="grid gap-1 text-xs text-muted-foreground">
            选择收藏夹
            <select
              aria-label="选择收藏夹"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="h-9 rounded-xl border border-input bg-background px-3 text-sm text-foreground"
            >
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                  {folder.itemCount === null ? "" : `（${folder.itemCount}）`}
                </option>
              ))}
            </select>
          </label>
        ) : type !== "favorites_folder" ? (
          <Input
            aria-label="来源地址或关键词"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              resetVerification();
            }}
            placeholder={
              type === "creator_profile"
                ? "https://www.douyin.com/user/..."
                : type === "darkhorse_query"
                  ? "输入要监控的低粉爆款关键词"
                  : "https://..."
            }
          />
        ) : null}
        {type === "web" || type === "rss" ? (
          <Input
            aria-label="监控说明"
            value={instruction}
            onChange={(event) => {
              setInstruction(event.target.value);
              resetVerification();
            }}
            placeholder="例如：只关注 AI 产品更新（会进入真实抽取规则）"
          />
        ) : null}
        <Input
          aria-label="来源显示名称"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="显示名称（可选）"
        />
        <label className="grid gap-1 text-xs text-muted-foreground">
          放入分类
          <select
            value={collectionId}
            onChange={(event) => setCollectionId(event.target.value)}
            className="h-9 rounded-xl border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="">未分类</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={monitor}
            onChange={(event) => setMonitor(event.target.checked)}
          />
          持续监控（无需再去自动化页开启）
        </label>
        {type === "darkhorse_query" ? (
          <p className="rounded-xl bg-warning-soft px-3 py-2 text-xs leading-5 text-warning">
            保存后由热点宝“低粉爆款”首轮任务验证登录、48 小时榜单和数据结构；不会回退到旧抖音搜索。
          </p>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={
              pending ||
              (type !== "favorites_folder" && !value.trim())
            }
            onClick={verify}
          >
            {pending
              ? "正在验证…"
              : type === "favorites_folder"
                ? "读取我的收藏夹"
                : "测试来源"}
          </Button>
        )}
        {verifiedMessage ? (
          <p className="text-xs leading-5 text-success">
            {verifiedMessage}
          </p>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button
            type="button"
            disabled={
              pending ||
              !value.trim() ||
              (type === "creator_profile" && !profilePreview) ||
              ((type === "web" || type === "rss") && !webPreview) ||
              (type === "favorites_folder" && folders.length === 0)
            }
            onClick={create}
          >
            {pending ? "保存中…" : "保存并开始首次同步"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { clampDetailWidth };
