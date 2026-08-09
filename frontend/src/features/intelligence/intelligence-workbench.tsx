"use client";

import * as React from "react";
import {
  Activity,
  Archive,
  ChevronRight,
  Clock3,
  FileAudio,
  FolderPlus,
  Link2,
  LockKeyhole,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
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
import { prepareTranscriptUpload } from "./intelligence-transcript-upload";

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
  collector: {
    accountId: string;
    accountHandle: string | null;
    platform: "douyin" | null;
    availability: "active" | "archived" | "missing";
  } | null;
  monitorEnabled: boolean;
  syncPolicy: Record<string, unknown>;
  status: "draft" | "active" | "paused" | "archived";
  lastRunAt: string | null;
  nextRunAt: string | null;
  version: number;
}

export type RadarRunStatus =
  | "queued"
  | "running"
  | "succeeded_with_items"
  | "succeeded_no_change"
  | "partial"
  | "blocked"
  | "failed";

export interface RadarRun {
  id: string;
  sourceId: string;
  trigger: "manual" | "schedule" | "initial" | "retry";
  status: RadarRunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  scannedCount: number;
  newCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  errorCode: string | null;
  errorSummary: string | null;
  nextAction: "login" | "configure_model" | "retry" | "edit" | "none";
  createdAt: string;
}

export interface RadarRunEvent {
  id: string;
  runId: string;
  step: string;
  status:
    | "succeeded_with_items"
    | "succeeded_no_change"
    | "partial"
    | "blocked"
    | "failed";
  occurredAt: string;
  message: string;
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
  transcriptState?:
    | "not_extracted"
    | "processing"
    | "extracted"
    | "attention";
  topicState?:
    | "not_generated"
    | "generating"
    | "awaiting_confirmation"
    | "converted"
    | "attention";
  progressState?:
    | "pending_transcript"
    | "transcript_processing"
    | "pending_topic"
    | "topic_generating"
    | "awaiting_confirmation"
    | "converted"
    | "attention";
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
    sourceId?: string;
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
    taskStatus?:
      | "queued"
      | "running"
      | "pause_requested"
      | "paused"
      | "cancel_requested"
      | "cancelled"
      | "succeeded"
      | "failed"
      | "blocked"
      | null;
    taskErrorCode?: string | null;
    taskErrorMessage?: string | null;
    outputSnapshot: {
      hook?: string;
      structureSteps?: string[];
      coreClaims?: string[];
      reusablePattern?: string;
      factRisks?: string[];
      title?: string;
      angle?: string;
      differentiation?: string;
      sourceSummary?: string;
      targetAudience?: string;
      audiencePain?: string;
      coreConflict?: string;
      format?: string;
      adaptationStrategy?: {
        keep: string[];
        replace: string[];
        add: string[];
        avoid: string[];
      };
      adaptedDraft?: {
        contentText: string;
        generatedFromTranscriptHash: string;
        strategyHash: string;
        templateVersion: string;
      };
      sourceUrl?: string;
      transcriptHash?: string;
      decompositionVersion?: string;
      generationProgress?: Partial<
        Record<
          "decomposition" | "topic" | "draft",
          { status: "pending" | "running" | "completed" | "failed"; completedAt?: string }
        >
      >;
    } | null;
    targetTopicId: string | null;
  }>;
}

type RadarTopicPreviewStart = {
  transform: {
    id: string;
    status: "candidate" | "confirmed" | "cancelled";
    outputSnapshot: Record<string, unknown> | null;
    targetTopicId: string | null;
  };
  task: { id: string; status: string };
};

export interface RadarWorkspace {
  collections: RadarCollection[];
  sources: RadarSource[];
  memberships: Array<{
    id: string;
    sourceId: string;
    collectionId: string;
    createdAt: string;
  }>;
  health: Array<{
    sourceId: string;
    lastRunId: string | null;
    lastRunStatus: RadarRunStatus | null;
    blockedCount: number;
    lastErrorCode: string | null;
    scannedCount: number;
    newCount: number;
    updatedCount: number;
    failedCount: number;
  }>;
  pendingCount: number;
  blockedCount: number;
}

interface CreateSourceResult {
  source: RadarSource;
  run: RadarRun | null;
  task: { id: string; status: string } | null;
}

interface StartRunResult {
  run: RadarRun;
  task: { id: string; status: string };
}

export interface RadarApi {
  listCollectors(input: { accountId: string }): Promise<
    Array<{
      accountId: string;
      accountHandle: string;
      platform: "douyin";
    }>
  >;
  previewProfile(input: {
    accountId: string;
    collectorAccountId: string;
    url: string;
  }): Promise<{
    externalAccountId: string;
    nickname: string;
    avatarUrl: string | null;
    canonicalUrl: string;
    visibleWorkCount: number | null;
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
    collectorAccountId: string;
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
  }): Promise<CreateSourceResult>;
  updateSource(input: {
    sourceId: string;
    monitorEnabled: boolean;
    syncPolicy: Record<string, unknown>;
    expectedVersion: number;
  }): Promise<RadarSource>;
  deleteSource(input: {
    sourceId: string;
    mode: "permanent";
    confirmToken: string;
  }): Promise<{
    affectedItems: number;
    preservedSnapshots: number;
    status: RadarSource["status"] | "deleted";
  }>;
  importDouyinShare(input: {
    accountId: string;
    collectionId: string | null;
    shareInput: string;
    idempotencyKey: string;
  }): Promise<unknown>;
  startRun(input: {
    sourceId: string;
    idempotencyKey: string;
  }): Promise<StartRunResult>;
  reconnectCollector(input: {
    collectorAccountId: string;
    sourceType: RadarSource["type"];
  }): Promise<{ loggedIn: boolean }>;
  listRuns(sourceId: string): Promise<RadarRun[]>;
  getRun(runId: string): Promise<{
    run: RadarRun;
    events: RadarRunEvent[];
  }>;
  listItems(input: {
    accountId: string;
    collectionId?: string;
    sourceId?: string;
    query?: string;
    sort: "published_desc" | "collect_desc" | "like_desc";
    transcriptState?:
      | "not_extracted"
      | "processing"
      | "extracted"
      | "attention";
    topicState?:
      | "not_generated"
      | "generating"
      | "awaiting_confirmation"
      | "converted"
      | "attention";
  }): Promise<RadarItemRow[]>;
  getItem(itemId: string): Promise<RadarItemDetail>;
  enqueueTranscript(input: {
    itemId: string;
    idempotencyKey: string;
  }): Promise<unknown>;
  uploadTranscript(
    input:
      | {
          itemId: string;
          inputMode: "paste";
          text: string;
        }
      | {
          itemId: string;
          inputMode: "file";
          format: "txt" | "md" | "srt" | "vtt";
          fileName: string;
          text: string;
        },
  ): Promise<RadarItemDetail["transcript"]>;
  previewTopic(input: {
    itemId: string;
    sourceSnapshotId: string;
    positioningVersionId: string;
    idempotencyKey: string;
  }): Promise<RadarTopicPreviewStart>;
  confirmTopic(input: {
    transformId: string;
    editedCandidate: {
      title: string;
      angle: string;
      differentiation: string;
      sourceSummary: string;
      targetAudience: string;
      audiencePain: string;
      coreConflict: string;
      format: string;
      adaptationStrategy: {
        keep: string[];
        replace: string[];
        add: string[];
        avoid: string[];
      };
    };
    idempotencyKey: string;
  }): Promise<unknown>;
}

type RadarSort = Parameters<RadarApi["listItems"]>[0]["sort"];
type RadarTranscriptState = NonNullable<
  Parameters<RadarApi["listItems"]>[0]["transcriptState"]
>;
type RadarTopicState = NonNullable<
  Parameters<RadarApi["listItems"]>[0]["topicState"]
>;

function defaultApi(): RadarApi {
  return {
    listCollectors: (input) =>
      client.listIntelligenceCollectors({
        params: undefined,
        query: input,
        body: undefined,
      }) as unknown as Promise<
        Array<{
          accountId: string;
          accountHandle: string;
          platform: "douyin";
        }>
      >,
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
    updateSource: (input) =>
      client.updateIntelligenceSource({
        params: { sourceId: input.sourceId },
        query: undefined,
        body: {
          monitorEnabled: input.monitorEnabled,
          syncPolicy: input.syncPolicy,
          expectedVersion: input.expectedVersion,
        },
      }) as Promise<RadarSource>,
    deleteSource: (input) =>
      client.deleteIntelligenceSource({
        params: { sourceId: input.sourceId },
        query: undefined,
        body: { mode: input.mode, confirmToken: input.confirmToken },
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
    reconnectCollector: (input) =>
      client.loginDouyin({
        params: undefined,
        query: undefined,
        body: {
          accountId: input.collectorAccountId,
          site:
            input.sourceType === "darkhorse_query"
              ? "douhot.douyin.com"
              : "douyin.com",
        },
      }) as Promise<{ loggedIn: boolean }>,
    listRuns: (sourceId) =>
      client.listIntelligenceRuns({
        params: { sourceId },
        query: { page: 1, pageSize: 20 },
        body: undefined,
      }) as unknown as Promise<RadarRun[]>,
    getRun: (runId) =>
      client.getIntelligenceRun({
        params: { runId },
        query: undefined,
        body: undefined,
      }) as Promise<{ run: RadarRun; events: RadarRunEvent[] }>,
    listItems: (input) =>
      client.listIntelligenceItems({
        params: undefined,
        query: {
          accountId: input.accountId,
          page: 1,
          pageSize: 100,
          sort: input.sort,
          ...(input.collectionId
            ? { collectionId: input.collectionId }
            : {}),
          ...(input.sourceId ? { sourceId: input.sourceId } : {}),
          ...(input.query ? { query: input.query } : {}),
          ...(input.transcriptState
            ? { transcriptState: input.transcriptState }
            : {}),
          ...(input.topicState ? { topicState: input.topicState } : {}),
        },
        body: undefined,
      }) as unknown as Promise<RadarItemRow[]>,
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
    uploadTranscript: async (input) => {
      const result = await client.uploadManualIntelligenceTranscript({
        params: undefined,
        query: undefined,
        body: input,
      });
      return result.transcript;
    },
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
  let code: unknown = null;
  let name: unknown = null;
  let current: unknown = error;
  const seen = new Set<unknown>();
  for (let depth = 0; current && depth < 6 && !seen.has(current); depth += 1) {
    seen.add(current);
    if (typeof current !== "object") break;
    const record = current as {
      code?: unknown;
      name?: unknown;
      cause?: unknown;
      error?: unknown;
    };
    code = typeof record.code === "string" ? record.code : code;
    name = typeof record.name === "string" ? record.name : name;
    if (code) break;
    current = record.cause ?? record.error;
  }
  if (!code) {
    const byName: Record<string, ErrorCode> = {
      DouyinFavoritesSessionExpiredError:
        ErrorCode.DouyinFavoritesSessionExpired,
      DouyinNotLoggedInError: ErrorCode.DouyinFavoritesSessionExpired,
      DouyinFavoritesBrowserLockedError:
        ErrorCode.DouyinFavoritesBrowserLocked,
      BrowserProfileLockedError: ErrorCode.DouyinFavoritesBrowserLocked,
      DouyinFavoritesCaptchaError: ErrorCode.DouyinFavoritesCaptcha,
      DouyinFavoritesNetworkError: ErrorCode.DouyinFavoritesNetwork,
      DouyinFavoritesUpstreamError: ErrorCode.DouyinFavoritesUpstream,
      DouyinFavoritesInvalidResponseError:
        ErrorCode.DouyinFavoritesInvalidResponse,
    };
    code = typeof name === "string" ? byName[name] : null;
  }
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

function structuredErrorSignal(error: unknown): string {
  const values: string[] = [];
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();
  for (let depth = 0; queue.length > 0 && depth < 8; depth += 1) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    if (typeof current === "string") {
      values.push(current);
      continue;
    }
    if (typeof current !== "object") continue;
    const record = current as Record<string, unknown>;
    for (const key of ["code", "name", "message"]) {
      if (typeof record[key] === "string") values.push(record[key]);
    }
    for (const key of ["cause", "error", "body", "response"]) {
      if (record[key]) queue.push(record[key]);
    }
  }
  return values.join(":");
}

export function sourceVerificationErrorMessage(
  type: RadarSource["type"],
  error: unknown,
): string {
  if (type === "favorites_folder") return favoriteFoldersErrorMessage(error);
  const signal = structuredErrorSignal(error);
  if (type === "darkhorse_query") {
    if (/NotLoggedIn|LOGIN_REQUIRED|SessionExpired|OAuth|授权|登录/i.test(signal)) {
      return "热点宝尚未授权。请在弹出的 Chrome 窗口完成热点宝授权后重试。";
    }
    if (/NoValidResponse|NO_VALID_RESPONSE|TIMEOUT|Timeout/i.test(signal)) {
      return "热点宝暂时没有返回有效结果，请检查网络后重新验证授权。";
    }
    if (/ResponseShapeChanged|RESPONSE_SHAPE_CHANGED/i.test(signal)) {
      return "热点宝页面结构发生变化，当前无法确认授权状态；本次不会误记为同步成功。";
    }
    return "热点宝授权验证失败，请确认授权窗口可正常打开后重试。";
  }
  if (type === "creator_profile") {
    if (/DouyinNoValidResponseError/i.test(signal)) {
      return "本次没有读到有效作品列表，不能把它判断成 0 条。请重新测试一次。";
    }
    if (/DouyinResponseShapeChangedError/i.test(signal)) {
      return "已打开主页，但作品列表结构发生变化，当前不能给出可信作品数。";
    }
    if (/Captcha|验证码|验证/i.test(signal)) {
      return "抖音要求完成验证码，请处理后再测试；不会把它显示成 0 条。";
    }
    if (
      /NotLoggedIn|LOGIN_REQUIRED|DOUYIN_FAVORITES_SESSION_EXPIRED|SessionExpired|登录/i.test(
        signal,
      )
    ) {
      return "当前抖音登录状态不可用，请重新登录后再测试。";
    }
    return "主页验证失败：请确认已登录抖音，并输入完整的 /user/… 主页链接。";
  }
  if (type === "web" || type === "rss") {
    if (/LOGIN_WALL|LoginRequired/i.test(signal)) {
      return "网页要求登录。请先在“设置 → 网站登录保管库”登录该网站，再重新测试。";
    }
    if (/UNSAFE_URL|UrlBlocked/i.test(signal)) {
      return "这个地址不是可安全访问的公网网页，请检查网址后重试。";
    }
    if (/TIMEOUT|Timeout/i.test(signal)) {
      return "网页连接超时，请检查网络或稍后重新测试。";
    }
    if (/HTTP_ERROR|HTTP\s*[45]\d\d/i.test(signal)) {
      return "网页服务器拒绝访问或暂时异常，请确认链接在浏览器中可以正常打开。";
    }
    if (/PARSE_FAILED|Parse/i.test(signal)) {
      return type === "rss"
        ? "已打开地址，但没有解析到有效 RSS/Atom 内容。"
        : "已打开网页，但没有读到可监控的真实正文；请换成具体文章或内容页。";
    }
    return "来源验证失败：请检查网址、登录状态或页面是否允许读取。";
  }
  return "来源验证失败，请检查采集账号和来源配置。";
}

function transcriptSaveErrorMessage(error: unknown): string {
  const signal = structuredErrorSignal(error);
  if (/TRANSCRIPT_LOCKED/.test(signal)) {
    return "这份逐字稿已经生成过选题候选，现已永久锁定，不能再替换。";
  }
  if (/TRANSCRIPT_TOPIC_BUSY/.test(signal)) {
    return "选题正在生成，完成前暂时不能替换逐字稿。";
  }
  if (/TRANSCRIPT_BUSY/.test(signal)) {
    return "逐字稿正在转写，完成后再替换。";
  }
  if (
    /TRANSCRIPT_FILE_(EMPTY|INVALID_ENCODING|TOO_LARGE|UNSUPPORTED_FORMAT|EXTENSION_MISMATCH)/.test(
      signal,
    )
  ) {
    return "逐字稿正文无效或超出限制，请检查文件格式、乱码和内容大小。";
  }
  return "逐字稿保存失败，请检查内容后重试。";
}

const DETAIL_WIDTH_KEY = "creatoros:intelligence:detail-width";
const MIN_DETAIL_WIDTH = 320;
// 结构化主请求 + 文本兜底各自最多 90 秒，再给队列/网络回显留出余量。
const TOPIC_PREVIEW_POLL_TIMEOUT_MS = 240_000;

function topicPreviewPollDelayMs(attempt: number): number {
  return Math.min(400 + attempt * 100, 2_500);
}
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

function runStatusLabel(status: RadarRunStatus | null): string {
  if (!status) return "尚未同步";
  return {
    queued: "排队中",
    running: "同步中",
    succeeded_with_items: "同步完成",
    succeeded_no_change: "无新增",
    partial: "部分完成",
    blocked: "需要处理",
    failed: "同步失败",
  }[status];
}

function runResultMessage(
  run: RadarRun,
  sourceType?: RadarSource["type"],
): string {
  if (run.status === "succeeded_with_items") {
    return `同步完成：扫描 ${run.scannedCount} 条，新增 ${run.newCount} 条，更新 ${run.updatedCount} 条。`;
  }
  if (run.status === "succeeded_no_change") {
    return `同步完成：扫描 ${run.scannedCount} 条，本次没有新增或变化。`;
  }
  if (run.status === "blocked") {
    if (run.errorCode === "LOGIN_REQUIRED") {
      if (sourceType === "darkhorse_query") {
        return "同步暂停：热点宝授权已失效。请点击「热点宝授权」，授权成功后系统会自动重试。";
      }
      return "同步暂停：采集账号登录已失效。请点击「重新登录」扫码，成功后系统会自动重试。";
    }
    if (run.errorCode === "CAPTCHA") {
      return "同步暂停：页面要求完成验证码，请在登录保管库处理后重试。";
    }
    return `同步暂停：${run.errorCode ?? "来源需要处理"}。`;
  }
  if (run.status === "failed") {
    if (run.errorCode === "FOLDER_MISSING") {
      return "同步失败：当前采集账号中找不到已绑定的收藏夹。请重新添加该收藏来源。";
    }
    if (run.errorCode === "NO_VALID_RESPONSE") {
      return "同步失败：本次没有取得有效作品列表，未把它误记成 0 条。请稍后重试。";
    }
    if (run.errorCode === "RESPONSE_SHAPE_CHANGED") {
      return "同步失败：来源页面结构发生变化，未把它误记成 0 条。";
    }
    return `同步失败：${run.errorCode ?? "未知错误"}。`;
  }
  if (run.status === "partial") {
    return `同步部分完成：新增 ${run.newCount} 条，失败 ${run.failedCount} 条。`;
  }
  return `${runStatusLabel(run.status)}。`;
}

function isRunActive(status: RadarRunStatus | null | undefined): boolean {
  return status === "queued" || status === "running";
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

function progressLabel(
  state: RadarItemRow["progressState"],
): string | null {
  if (!state) return null;
  return {
    pending_transcript: "待转写",
    transcript_processing: "提取中",
    pending_topic: "待生成选题",
    topic_generating: "生成中",
    awaiting_confirmation: "待确认",
    converted: "已转为选题",
    attention: "需要处理",
  }[state];
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
  const [sourceQuery, setSourceQuery] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<RadarSort>("published_desc");
  const [transcriptState, setTranscriptState] =
    React.useState<RadarTranscriptState | null>(null);
  const [topicState, setTopicState] =
    React.useState<RadarTopicState | null>(null);
  const [scopedItems, setScopedItems] =
    React.useState<RadarItemRow[]>(items);
  const [itemsLoading, setItemsLoading] = React.useState(false);
  const [detail, setDetail] = React.useState<RadarItemDetail | null>(
    initialDetail,
  );
  const [detailWidth, setDetailWidth] = React.useState(392);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [topicGenerating, setTopicGenerating] = React.useState(false);
  const [runningSourceIds, setRunningSourceIds] = React.useState<Set<string>>(
    () =>
      new Set(
        workspace.health
          .filter((health) => isRunActive(health.lastRunStatus))
          .map((health) => health.sourceId),
      ),
  );
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
  const watchedRunIds = React.useRef<Set<string>>(new Set());
  const topicGenerationInFlight = React.useRef(false);
  const topicPollingKeys = React.useRef<Set<string>>(new Set());
  const mounted = React.useRef(true);
  const activeDetailItemId = React.useRef<string | null>(
    initialDetail?.item.id ?? null,
  );
  const itemScopeRequestId = React.useRef(0);
  const searchTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    activeDetailItemId.current = detail?.item.id ?? null;
  }, [detail?.item.id]);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const trackTopicTransform = React.useCallback(
    (itemId: string, transformId: string) => {
      const pollingKey = `${itemId}:${transformId}`;
      if (topicPollingKeys.current.has(pollingKey)) return;
      topicPollingKeys.current.add(pollingKey);

      const startedAt = Date.now();
      void (async () => {
        try {
          for (
            let attempt = 0;
            Date.now() - startedAt < TOPIC_PREVIEW_POLL_TIMEOUT_MS;
            attempt += 1
          ) {
            if (attempt > 0) {
              await new Promise((resolve) =>
                window.setTimeout(
                  resolve,
                  topicPreviewPollDelayMs(attempt - 1),
                ),
              );
            }
            if (
              !mounted.current ||
              activeDetailItemId.current !== itemId
            ) {
              return;
            }

            let refreshed: RadarItemDetail;
            try {
              refreshed = await api.getItem(itemId);
            } catch {
              // 后台任务仍然存在时，单次详情读取抖动不能中止自动回显。
              continue;
            }
            if (
              !mounted.current ||
              activeDetailItemId.current !== itemId
            ) {
              return;
            }
            setDetail((current) =>
              current?.item.id === itemId ? refreshed : current,
            );

            const currentTransform = refreshed.transforms.find(
              (transform) => transform.id === transformId,
            );
            if (!currentTransform) continue;
            if (
              ["failed", "blocked", "cancelled"].includes(
                currentTransform.taskStatus ?? "",
              )
            ) {
              setNotice(
                currentTransform.taskStatus === "blocked"
                  ? "生成任务已受阻，请按候选卡提示处理后重试。"
                  : "生成任务已失败，可查看候选卡中的原因并重新生成。",
              );
              return;
            }

            const snapshot = currentTransform.outputSnapshot;
            const progress = snapshot?.generationProgress;
            const complete = Boolean(
              snapshot &&
                (progress
                  ? progress.draft?.status === "completed"
                  : snapshot.title?.trim()),
            );
            if (complete) {
              setNotice(
                snapshot?.adaptedDraft?.contentText
                  ? "选题候选和改写初稿已生成，请检查后确认写入选题池。"
                  : "选题候选已生成，请检查后确认写入选题池。",
              );
              return;
            }
            if (progress?.topic?.status === "completed") {
              setNotice("选题已生成，正在生成本账号改写初稿。");
            } else if (progress?.decomposition?.status === "completed") {
              setNotice("逐字稿已拆解，正在生成选题和改写策略。");
            }
          }
          if (
            mounted.current &&
            activeDetailItemId.current === itemId
          ) {
            setNotice(
              "生成任务仍在后台执行，当前选题会继续自动更新，无需切换页面或重复生成。",
            );
          }
        } finally {
          topicPollingKeys.current.delete(pollingKey);
        }
      })();
    },
    [api],
  );

  const trackedTopicTransform = detail?.transforms[0] ?? null;
  const trackedTopicSnapshot = trackedTopicTransform?.outputSnapshot ?? null;
  const trackedTopicProgress = trackedTopicSnapshot?.generationProgress;
  const trackedTopicComplete = Boolean(
    trackedTopicSnapshot &&
      (trackedTopicProgress
        ? trackedTopicProgress.draft?.status === "completed"
        : trackedTopicSnapshot.title?.trim()),
  );

  React.useEffect(() => {
    const itemId = detail?.item.id;
    const transformId = trackedTopicTransform?.id;
    const taskStatus = trackedTopicTransform?.taskStatus ?? null;
    if (
      !itemId ||
      !transformId ||
      trackedTopicComplete ||
      !["queued", "running", "pause_requested"].includes(taskStatus ?? "")
    ) {
      return;
    }
    trackTopicTransform(itemId, transformId);
  }, [
    detail?.item.id,
    trackTopicTransform,
    trackedTopicComplete,
    trackedTopicTransform?.id,
    trackedTopicTransform?.taskStatus,
  ]);

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
    async (rows: RadarItemRow[], requestId: number) => {
      if (itemScopeRequestId.current !== requestId) return;
      setScopedItems(rows);
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

  const selectItemScope = React.useCallback(
    async (collectionId: string | null, sourceId: string | null) => {
      const requestId = itemScopeRequestId.current + 1;
      itemScopeRequestId.current = requestId;
      const previous = {
        collectionId: selectedCollectionId,
        sourceId: selectedSourceId,
        items: visibleItems,
        detail,
      };

      setSelectedCollectionId(collectionId);
      setSelectedSourceId(sourceId);
      setItemsLoading(true);
      setDetail(null);
      setNotice(null);

      try {
        const nextItems = await api.listItems({
          accountId,
          ...(collectionId ? { collectionId } : {}),
          ...(sourceId ? { sourceId } : {}),
          ...(query.trim() ? { query: query.trim() } : {}),
          sort,
          ...(transcriptState ? { transcriptState } : {}),
          ...(topicState ? { topicState } : {}),
        });
        if (itemScopeRequestId.current !== requestId) return;
        await settleItemRows(nextItems, requestId);
      } catch {
        if (itemScopeRequestId.current !== requestId) return;
        setSelectedCollectionId(previous.collectionId);
        setSelectedSourceId(previous.sourceId);
        setScopedItems(previous.items);
        setDetail(previous.detail);
        setNotice("内容筛选失败，已保留切换前的结果，请稍后重试。");
      } finally {
        if (itemScopeRequestId.current === requestId) {
          setItemsLoading(false);
        }
      }
    },
    [
      accountId,
      api,
      detail,
      selectedCollectionId,
      selectedSourceId,
      query,
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
        const nextItems = await api.listItems({
          accountId,
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
        await settleItemRows(nextItems, requestId);
        return true;
      } catch {
        if (itemScopeRequestId.current === requestId) {
          setSort(previous.sort);
          setTranscriptState(previous.transcriptState);
          setTopicState(previous.topicState);
          setScopedItems(previous.items);
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
      accountId,
      api,
      detail,
      selectedCollectionId,
      selectedSourceId,
      settleItemRows,
      sort,
      topicState,
      transcriptState,
      visibleItems,
    ],
  );

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
      setTopicGenerating(false);
      topicGenerationInFlight.current = false;
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

  const watchRun = React.useCallback(
    async (sourceId: string, runId: string) => {
      setRunningSourceIds((current) => new Set(current).add(sourceId));
      for (let attempt = 0; attempt < 120; attempt += 1) {
        try {
          const result = await api.getRun(runId);
          if (!isRunActive(result.run.status)) {
            setRunningSourceIds((current) => {
              const next = new Set(current);
              next.delete(sourceId);
              return next;
            });
            const sourceType = workspace.sources.find(
              (source) => source.id === sourceId,
            )?.type;
            setNotice(runResultMessage(result.run, sourceType));
            router.refresh();
            return;
          }
        } catch {
          // 短暂读取失败不把仍在后台执行的任务误判为失败。
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      setRunningSourceIds((current) => {
        const next = new Set(current);
        next.delete(sourceId);
        return next;
      });
      setNotice("同步仍在后台运行，可打开该来源的“运行记录”查看最新进度。");
      router.refresh();
    },
    [api, router, workspace.sources],
  );

  React.useEffect(() => {
    // 页面重开/刷新后，服务端 workspace 可能仍有 queued/running run。只恢复
    // spinner 不恢复监听会让按钮永远转圈；这里按 lastRunId 重新挂 watcher。
    for (const health of workspace.health) {
      if (
        health.lastRunId &&
        isRunActive(health.lastRunStatus) &&
        !watchedRunIds.current.has(health.lastRunId)
      ) {
        watchedRunIds.current.add(health.lastRunId);
        void watchRun(health.sourceId, health.lastRunId);
      }
    }
  }, [watchRun, workspace.health]);

  const runSource = React.useCallback(
    async (sourceId: string) => {
      if (runningSourceIds.has(sourceId)) {
        setNotice("该来源正在同步，无需重复点击。");
        return;
      }
      setRunningSourceIds((current) => new Set(current).add(sourceId));
      setNotice("正在创建同步任务…");
      try {
        const result = await api.startRun({
          sourceId,
          idempotencyKey: operationKey("manual-sync"),
        });
        setNotice("已开始同步，完成后作品会自动出现在列表中。");
        watchedRunIds.current.add(result.run.id);
        void watchRun(sourceId, result.run.id);
      } catch (error) {
        setRunningSourceIds((current) => {
          const next = new Set(current);
          next.delete(sourceId);
          return next;
        });
        const status = (error as { status?: unknown })?.status;
        const source = workspace.sources.find((item) => item.id === sourceId);
        setNotice(
          status === 409
            ? "该来源已经在排队或同步中，无需重复操作。"
            : source?.type === "favorites_folder"
              ? favoriteFoldersErrorMessage(error)
              : "同步任务没有创建成功，请检查来源配置后重试；错误类型已写入本地诊断日志。",
        );
      }
    },
    [api, runningSourceIds, watchRun, workspace.sources],
  );

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

  const uploadTranscript = React.useCallback(
    async (
      input:
        | { inputMode: "paste"; text: string }
        | {
            inputMode: "file";
            format: "txt" | "md" | "srt" | "vtt";
            fileName: string;
            text: string;
          },
    ): Promise<boolean> => {
      if (!detail) return false;
      const itemId = detail.item.id;
      const replacing = Boolean(detail.transcript.text);
      setBusy(true);
      setNotice(null);
      try {
        const transcript = await api.uploadTranscript({
          itemId,
          ...input,
        });
        setDetail((current) =>
          current?.item.id === itemId
            ? { ...current, transcript }
            : current,
        );
        setNotice(
          replacing
            ? "逐字稿已替换，可以继续生成选题候选。"
            : "逐字稿已保存，可以继续生成选题候选。",
        );
        router.refresh();
        return true;
      } catch (error) {
        setNotice(transcriptSaveErrorMessage(error));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [api, detail, router],
  );

  const previewTopic = React.useCallback(async () => {
    const sourceSnapshotId = detail?.snapshots[0]?.id;
    if (!detail || !sourceSnapshotId || !positioningVersionId) return;
    if (topicGenerationInFlight.current) {
      setNotice("选题候选正在生成，无需重复点击。");
      return;
    }
    topicGenerationInFlight.current = true;
    setBusy(true);
    setTopicGenerating(true);
    setNotice(null);
    try {
      const started = await api.previewTopic({
        itemId: detail.item.id,
        sourceSnapshotId,
        positioningVersionId,
        idempotencyKey: operationKey("topic-preview"),
      });
      const reusableOutputSnapshot =
        (started.transform.outputSnapshot as RadarItemDetail["transforms"][number]["outputSnapshot"]) ??
        detail.transforms.find(
          (transform) => transform.id === started.transform.id,
        )?.outputSnapshot ??
        detail.transforms.find((transform) => transform.outputSnapshot !== null)
          ?.outputSnapshot ??
        null;
      const pendingTransform: RadarItemDetail["transforms"][number] = {
        id: started.transform.id,
        status: started.transform.status,
        taskStatus: started.task.status as
          | "queued"
          | "running"
          | "pause_requested"
          | "paused"
          | "cancel_requested"
          | "cancelled"
          | "succeeded"
          | "failed"
          | "blocked",
        taskErrorCode: null,
        taskErrorMessage: null,
        // 重试只替换执行状态；后端会复用检查点，前端也不能在等待期间
        // 把已经生成的拆解、选题或改写初稿清空。
        outputSnapshot: reusableOutputSnapshot,
        targetTopicId: started.transform.targetTopicId,
      };
      setDetail((current) =>
        current?.item.id === detail.item.id
          ? {
              ...current,
              transforms: [
                pendingTransform,
                ...current.transforms.filter(
                  (transform) => transform.id !== pendingTransform.id,
                ),
              ],
            }
          : current,
      );
      setNotice(
        reusableOutputSnapshot
          ? "已保留现有生成结果，正在重试未完成部分。"
          : "选题候选正在结合当前定位生成，完成前不会写入选题池。",
      );
      trackTopicTransform(detail.item.id, started.transform.id);
    } catch {
      setNotice("选题候选生成失败，请检查定位版本和来源快照后重试。");
    } finally {
      topicGenerationInFlight.current = false;
      setTopicGenerating(false);
      setBusy(false);
    }
  }, [api, detail, positioningVersionId, trackTopicTransform]);

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
            title: candidate.title ?? "",
            angle: candidate.angle ?? "",
            differentiation: candidate.differentiation ?? "",
            sourceSummary: candidate.sourceSummary ?? "",
            targetAudience: candidate.targetAudience ?? "",
            audiencePain: candidate.audiencePain ?? "",
            coreConflict: candidate.coreConflict ?? "",
            format: candidate.format ?? "",
            adaptationStrategy: candidate.adaptationStrategy ?? {
              keep: [],
              replace: [],
              add: [],
              avoid: [],
            },
          },
          idempotencyKey: operationKey("topic-confirm"),
        });
        setDetail(await api.getItem(detail.item.id));
        setNotice(
          "已写入选题池。立项后，对标原稿、改写规则和我的初稿会一起带入项目。",
        );
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
              只收公开作品与公开计数 · 评论正文不采集 · 逐字稿可粘贴、导入或转写
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
        </div>
      </div>

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
        data-testid="intelligence-responsive-layout"
        className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto xl:grid-cols-[minmax(220px,260px)_minmax(320px,1fr)_minmax(320px,392px)] xl:overflow-hidden 2xl:grid-cols-[minmax(220px,260px)_minmax(360px,1fr)_auto]"
      >
        <aside
          data-testid="intelligence-sidebar"
          aria-label="内容雷达分类和来源"
          className="flex min-h-0 flex-col border-b border-border/70 bg-surface-subtle xl:border-b-0 xl:border-r"
        >
          <div className="shrink-0 space-y-2 px-3 pb-2 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              分类与来源
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
                <div key={collection.id} className="mt-2">
                  <button
                    type="button"
                    onClick={() => void selectItemScope(collection.id, null)}
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
                </div>
              );
            })}
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

        <main
          aria-busy={itemsLoading}
          className="flex min-h-0 min-w-0 flex-col bg-canvas/55"
        >
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
                : `${filteredItems.length} 条真实内容`}
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
                  />
                ))}
              </div>
            )}
          </div>
        </main>

        <div className="relative flex min-h-[320px] xl:min-h-0">
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
                topicGenerating={topicGenerating}
                positioningReady={Boolean(positioningVersionId)}
                onTranscribe={enqueueTranscript}
                onUploadTranscript={uploadTranscript}
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

function SourceRunHistoryDialog({
  source,
  api,
  onClose,
}: {
  source: RadarSource | null;
  api: RadarApi;
  onClose: () => void;
}) {
  const [runs, setRuns] = React.useState<RadarRun[]>([]);
  const [loading, setLoading] = React.useState(Boolean(source));
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!source) return;
    let cancelled = false;
    void api
      .listRuns(source.id)
      .then((rows) => {
        if (!cancelled) setRuns(rows);
      })
      .catch(() => {
        if (!cancelled) setError("运行记录读取失败，请稍后重试。");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, source]);

  return (
    <Dialog
      open={Boolean(source)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{source?.displayName ?? "来源"} · 运行记录</DialogTitle>
          <DialogDescription>
            {source?.monitorEnabled
              ? `每日自动同步；APP 运行时执行，错过后下次打开补跑。下次计划：${dateLabel(source.nextRunAt ?? null)}`
              : "当前仅手动同步，不会定时运行。"}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[420px] space-y-2 overflow-y-auto">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              正在读取运行记录…
            </p>
          ) : error ? (
            <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : runs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              还没有同步记录。
            </p>
          ) : (
            runs.map((run) => (
              <div
                key={run.id}
                className="rounded-xl border border-border/80 px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">
                    {runStatusLabel(run.status)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {dateLabel(run.startedAt ?? run.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  扫描 {run.scannedCount} · 新增 {run.newCount} · 更新{" "}
                  {run.updatedCount} · 失败 {run.failedCount}
                </p>
                {run.errorCode ? (
                  <p className="mt-1 text-xs text-destructive">
                    {runResultMessage(run)}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
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
  const collectorLabel = source.collector
    ? `用 ${source.collector.accountHandle ?? source.collector.accountId} 采集`
    : "无需登录账号";
  return (
    <div
      data-testid={`radar-source-row-${source.id}`}
      className={cn(
        "ml-3 mr-1 mt-1.5 min-w-0 overflow-hidden rounded-xl border transition",
        active
          ? "border-primary/30 bg-surface shadow-sm ring-1 ring-primary/10"
          : "border-transparent bg-transparent hover:border-border/70 hover:bg-muted/55",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5 p-1.5">
        <button
          type="button"
          onClick={onSelect}
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
          disabled={syncing || source.status !== "active"}
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
          title={`${collectorLabel} → 归当前工作区`}
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
        "group flex min-h-28 w-full overflow-hidden rounded-2xl border bg-surface text-left transition",
        active
          ? "border-primary/60 shadow-card ring-1 ring-primary/20"
          : "border-border/80 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col p-3.5">
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
          {progressLabel(row.progressState) ? (
            <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-primary">
              {progressLabel(row.progressState)}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function ItemDetail({
  detail,
  busy,
  topicGenerating,
  positioningReady,
  onTranscribe,
  onUploadTranscript,
  onPreviewTopic,
  onConfirmTopic,
}: {
  detail: RadarItemDetail;
  busy: boolean;
  topicGenerating: boolean;
  positioningReady: boolean;
  onTranscribe: () => void;
  onUploadTranscript: (
    input:
      | { inputMode: "paste"; text: string }
      | {
          inputMode: "file";
          format: "txt" | "md" | "srt" | "vtt";
          fileName: string;
          text: string;
        },
  ) => Promise<boolean>;
  onPreviewTopic: () => void;
  onConfirmTopic: (
    transformId: string,
    candidate: NonNullable<
      RadarItemDetail["transforms"][number]["outputSnapshot"]
    >,
  ) => void;
}) {
  const [transcriptEditorOpen, setTranscriptEditorOpen] =
    React.useState(false);
  const [confirmGenerateOpen, setConfirmGenerateOpen] =
    React.useState(false);
  const latest = detail.metrics[0] ?? null;
  const latestTransform = detail.transforms[0] ?? null;
  const rawTopicSnapshot = latestTransform?.outputSnapshot ?? null;
  const topicCandidate =
    rawTopicSnapshot &&
    (rawTopicSnapshot.hook?.trim() ||
      rawTopicSnapshot.title?.trim() ||
      rawTopicSnapshot.adaptedDraft?.contentText?.trim())
      ? rawTopicSnapshot
      : null;
  const topicTaskTerminalFailure =
    latestTransform !== null &&
    ["failed", "blocked", "cancelled"].includes(
      latestTransform.taskStatus ?? "",
    );
  const topicTaskUnavailable =
    latestTransform !== null &&
    latestTransform.outputSnapshot === null &&
    latestTransform.taskStatus == null;
  const transcriptLocked = detail.transforms.some(
    (transform) =>
      transform.status === "confirmed" ||
      Boolean(transform.outputSnapshot?.title?.trim()),
  );
  const topicTaskBusy =
    topicGenerating ||
    detail.transforms.some(
      (transform) =>
        [
          "queued",
          "running",
          "pause_requested",
          "paused",
          "cancel_requested",
        ].includes(transform.taskStatus ?? ""),
    );
  const transcriptBusy =
    detail.transcript.status === "queued" ||
    detail.transcript.status === "running";
  const transcriptCanChange =
    !transcriptLocked && !topicTaskBusy && !transcriptBusy;
  const sourceEvidence = groupRadarSourceEvidence(detail.snapshots);
  return (
    <div className="flex min-h-full flex-col">
      {transcriptEditorOpen ? (
        <TranscriptEditorDialog
          open
          currentText={detail.transcript.text ?? ""}
          replacing={Boolean(detail.transcript.text)}
          busy={busy}
          onClose={() => setTranscriptEditorOpen(false)}
          onSave={onUploadTranscript}
        />
      ) : null}
      <Dialog
        open={confirmGenerateOpen}
        onOpenChange={setConfirmGenerateOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认生成选题候选</DialogTitle>
            <DialogDescription>
              生成成功后，这份逐字稿将永久锁定，不能再替换或重新转写。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmGenerateOpen(false)}
            >
              返回检查逐字稿
            </Button>
            <Button
              type="button"
              onClick={() => {
                setConfirmGenerateOpen(false);
                onPreviewTopic();
              }}
            >
              确认生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="border-b border-border/70 p-5">
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
                已采纳过
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
              sourceTranscript={detail.transcript.text ?? ""}
              busy={busy}
              retryDisabled={
                busy ||
                topicTaskBusy ||
                !positioningReady ||
                detail.snapshots.length === 0 ||
                detail.transcript.status !== "done"
              }
              onRetry={onPreviewTopic}
              onConfirm={onConfirmTopic}
            />
          ) : topicTaskTerminalFailure || topicTaskUnavailable ? (
            <div
              role="alert"
              className="mt-3 rounded-xl border border-destructive/25 bg-destructive/[0.045] p-4"
            >
              <p className="text-xs font-semibold text-foreground">
                {latestTransform?.taskStatus === "blocked"
                  ? "生成任务已受阻"
                  : topicTaskUnavailable
                    ? "生成状态不可用"
                    : "生成任务失败"}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {latestTransform?.taskErrorMessage?.trim() ||
                  (topicTaskUnavailable
                    ? "旧任务没有可读取的执行状态，可以直接重新生成。"
                    : "任务已经结束，不会继续假装“生成中”。请检查定位与模型配置后重试。")}
              </p>
              {latestTransform?.taskErrorCode ? (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  错误代码：{latestTransform.taskErrorCode}
                </p>
              ) : null}
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
                onClick={() => setConfirmGenerateOpen(true)}
                className="mt-3 gap-1.5"
              >
                <RefreshCw className="size-3.5" />
                重新生成
              </Button>
            </div>
          ) : topicGenerating ||
            (latestTransform &&
              latestTransform.outputSnapshot === null &&
              ["queued", "running", "pause_requested"].includes(
                latestTransform.taskStatus ?? "",
              )) ? (
            <div
              role="status"
              className="mt-3 rounded-xl border border-primary/20 bg-primary/[0.045] p-4"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <RefreshCw className="size-4 animate-spin" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">
                    正在生成候选
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    正在结合当前定位和逐字稿生成。任务已经创建，请勿重复点击；生成完成后会在这里出现可编辑选题卡。
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                后台完成后会自动更新当前选题，无需切换选题或页面。
              </p>
            </div>
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
                onClick={() => setConfirmGenerateOpen(true)}
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
                  请先在下方手动转写或上传逐字稿。只有完整逐字稿拆解完成后，才能生成有结构依据的选题。
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
                {transcriptLabel(detail.transcript.status)}
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
                不会自动转写。你可以直接粘贴正文、从文件导入，或手动发起转写。
              </p>
            </div>
          )}
          {transcriptLocked ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <LockKeyhole className="size-3.5 text-primary" />
              已用于生成选题，逐字稿永久锁定。
            </p>
          ) : topicTaskBusy ? (
            <p className="mt-2 text-xs text-muted-foreground">
              选题正在生成，完成前暂时不能修改逐字稿。
            </p>
          ) : transcriptBusy && detail.transcript.text ? (
            <p className="mt-2 text-xs text-muted-foreground">
              正在重新转写；新结果成功前继续保留当前正文。
            </p>
          ) : detail.transcript.status === "done" &&
            detail.transcript.errorCode ? (
            <p className="mt-2 text-xs text-warning">
              上次重新转写失败，已保留当前正文。
            </p>
          ) : null}
          {transcriptCanChange ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setTranscriptEditorOpen(true)}
                className="gap-1.5"
              >
                <Upload className="size-3.5" />
                {detail.transcript.text ? "替换逐字稿" : "添加逐字稿"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={onTranscribe}
                className="gap-1.5"
              >
                <FileAudio className="size-3.5" />
                {detail.transcript.text ? "重新转写" : "手动转写"}
              </Button>
            </div>
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
      </div>
    </div>
  );
}

function TranscriptEditorDialog({
  open,
  currentText,
  replacing,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  currentText: string;
  replacing: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (
    input:
      | { inputMode: "paste"; text: string }
      | {
          inputMode: "file";
          format: "txt" | "md" | "srt" | "vtt";
          fileName: string;
          text: string;
        },
  ) => Promise<boolean>;
}) {
  const [text, setText] = React.useState(currentText);
  const [file, setFile] =
    React.useState<Awaited<ReturnType<typeof prepareTranscriptUpload>> | null>(
      null,
    );
  const [error, setError] = React.useState<string | null>(null);
  const [preparing, setPreparing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const normalized = text.trim();
  const byteLength = new TextEncoder().encode(normalized).byteLength;
  const invalid =
    !normalized ||
    normalized.includes("\ufffd") ||
    normalized.length > 500_000 ||
    byteLength > 2 * 1024 * 1024;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {replacing ? "替换逐字稿" : "添加逐字稿"}
          </DialogTitle>
          <DialogDescription>
            直接粘贴正文，或从 TXT、Markdown、SRT、VTT 文件导入后检查再保存。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label
            className={cn(
              "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground",
              (busy || preparing || saving) &&
                "pointer-events-none opacity-50",
            )}
          >
            <Upload className="size-3.5" />
            从文件导入
            <input
              type="file"
              accept=".txt,.md,.srt,.vtt,text/plain,text/markdown,text/vtt,application/x-subrip"
              aria-label="从文件导入逐字稿"
              className="sr-only"
              disabled={busy || preparing || saving}
              onChange={(event) => {
                const selected = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (!selected) return;
                setPreparing(true);
                setError(null);
                void prepareTranscriptUpload(selected)
                  .then((prepared) => {
                    setFile(prepared);
                    setText(prepared.text);
                  })
                  .catch((caught) =>
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : "文件读取失败，请重新选择。",
                    ),
                  )
                  .finally(() => setPreparing(false));
              }}
            />
          </label>
          {file ? (
            <p className="text-xs text-muted-foreground">
              已导入 {file.fileName}，保存前仍可继续修改正文。
            </p>
          ) : null}
          <Textarea
            aria-label="逐字稿正文"
            value={text}
            disabled={busy || saving}
            onChange={(event) => {
              setText(event.target.value);
              setError(null);
            }}
            placeholder="在这里粘贴或编辑逐字稿正文…"
            className="min-h-64 resize-y text-sm leading-6"
          />
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              {normalized.length.toLocaleString("zh-CN")} 字 ·{" "}
              {byteLength.toLocaleString("zh-CN")} 字节
            </span>
            {error ? (
              <span role="alert" className="text-destructive">
                {error}
              </span>
            ) : invalid ? (
              <span className="text-warning">
                正文不能为空、包含乱码或超过 2 MiB / 500,000 字。
              </span>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={onClose}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={busy || preparing || saving || invalid}
            onClick={() => {
              setSaving(true);
              setError(null);
              const payload = file
                ? {
                    inputMode: "file" as const,
                    format: file.format,
                    fileName: file.fileName,
                    text: normalized,
                  }
                : {
                    inputMode: "paste" as const,
                    text: normalized,
                  };
              void onSave(payload)
                .then((saved) => {
                  if (saved) onClose();
                })
                .finally(() => setSaving(false));
            }}
          >
            {saving ? "保存中…" : "保存逐字稿"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TopicCandidateEditor({
  transform,
  sourceTranscript,
  busy,
  retryDisabled,
  onRetry,
  onConfirm,
}: {
  transform: RadarItemDetail["transforms"][number] & {
    outputSnapshot: NonNullable<
      RadarItemDetail["transforms"][number]["outputSnapshot"]
    >;
  };
  sourceTranscript: string;
  busy: boolean;
  retryDisabled: boolean;
  onRetry: () => void;
  onConfirm: (
    transformId: string,
    candidate: NonNullable<
      RadarItemDetail["transforms"][number]["outputSnapshot"]
    >,
  ) => void;
}) {
  const [candidate, setCandidate] = React.useState(() => ({
    ...transform.outputSnapshot,
    title: transform.outputSnapshot.title ?? "",
    angle: transform.outputSnapshot.angle ?? "",
    differentiation: transform.outputSnapshot.differentiation ?? "",
    sourceSummary: transform.outputSnapshot.sourceSummary ?? "",
    targetAudience: transform.outputSnapshot.targetAudience ?? "",
    audiencePain: transform.outputSnapshot.audiencePain ?? "",
    coreConflict: transform.outputSnapshot.coreConflict ?? "",
    format: transform.outputSnapshot.format ?? "",
    adaptationStrategy: transform.outputSnapshot.adaptationStrategy ?? {
      keep: [],
      replace: [],
      add: [],
      avoid: [],
    },
  }));
  const [draftText] = React.useState(
    transform.outputSnapshot.adaptedDraft?.contentText ?? "",
  );
  const confirmed = transform.status === "confirmed";
  const progress = transform.outputSnapshot.generationProgress;
  const retrying = ["queued", "running", "pause_requested"].includes(
    transform.taskStatus ?? "",
  );
  const progressLabel =
    retrying && progress?.draft?.status === "failed"
      ? "拆解和选题已保留，正在重试改写初稿"
      : retrying && progress?.topic?.status === "failed"
        ? "逐字稿拆解已保留，正在重试选题"
        : retrying && progress?.decomposition?.status === "failed"
          ? "正在重试逐字稿拆解"
          : progress?.draft?.status === "failed"
      ? "拆解和选题已保留，改写初稿待重试"
      : progress?.topic?.status === "failed"
          ? "逐字稿拆解已保留，选题待重试"
        : progress?.decomposition?.status === "failed"
          ? "逐字稿拆解待重试"
          : progress?.draft?.status === "completed"
            ? "改写初稿已生成"
            : progress?.topic?.status === "completed"
              ? "选题已生成，正在改写初稿"
              : progress?.decomposition?.status === "completed"
                ? "逐字稿已拆解，正在生成选题"
                : null;
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-primary/20 bg-primary/[0.035] p-3">
      {progressLabel ? (
        <div
          role="status"
          className="rounded-lg bg-primary/8 px-3 py-2 text-xs text-primary"
        >
          {retrying ? (
            <RefreshCw className="mr-1 inline size-3 animate-spin" />
          ) : null}
          {progressLabel}
        </div>
      ) : null}
      {terminalFailure ? (
        <div
          role="alert"
          className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2"
        >
          <p className="text-xs font-medium text-foreground">
            后续生成暂未完成，已生成的内容已保留
          </p>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {transform.taskErrorMessage?.trim() || "可以稍后只重试未完成部分。"}
          </p>
          {!confirmed ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={retryDisabled}
              onClick={onRetry}
              className="mt-2 gap-1.5"
            >
              <RefreshCw className="size-3.5" />
              重试生成选题卡
            </Button>
          ) : null}
        </div>
      ) : null}
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
      {draftText ? (
        <div className="grid gap-3 rounded-lg border border-border/70 bg-surface p-3 md:grid-cols-2">
          <label className="grid min-w-0 gap-1 text-[11px] font-semibold text-foreground">
            对标原稿（只读）
            <textarea
              aria-label="对标原稿"
              value={sourceTranscript}
              readOnly
              className="min-h-64 resize-y rounded-lg border border-input bg-muted/40 px-3 py-2 text-xs font-normal leading-5 text-muted-foreground"
            />
          </label>
          <label className="grid min-w-0 gap-1 text-[11px] font-semibold text-foreground">
            我的改写初稿
            <textarea
              aria-label="我的改写初稿"
              value={draftText}
              readOnly
              className="min-h-64 resize-y rounded-lg border border-input bg-background px-3 py-2 text-xs font-normal leading-5 text-foreground"
            />
            <span className="font-normal text-muted-foreground">
              采纳选题后会随选题进入 Project；在项目稿面编辑和保存版本。
            </span>
          </label>
        </div>
      ) : null}
      <Input
        aria-label="选题候选标题"
        value={candidate.title}
        disabled={confirmed || busy}
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
          ["targetAudience", "目标观众"],
          ["audiencePain", "观众痛点"],
          ["coreConflict", "核心冲突"],
          ["format", "内容形式"],
        ] as const
      ).map(([field, label]) => (
        <label key={field} className="grid gap-1 text-[11px] text-muted-foreground">
          {label}
          <textarea
            aria-label={`选题候选${label}`}
            value={candidate[field]}
            disabled={confirmed || busy}
            onChange={(event) =>
              setCandidate({ ...candidate, [field]: event.target.value })
            }
            className="min-h-16 resize-y rounded-lg border border-input bg-surface px-3 py-2 text-xs leading-5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      ))}
      <div
        role="group"
        aria-label="改写规则"
        className="space-y-2 rounded-lg border border-border/70 bg-surface p-3"
      >
        <div>
          <p className="text-[11px] font-semibold text-foreground">改写规则</p>
          <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
            系统根据对标原稿和当前定位生成，随本次选题锁定。文案不满意时，可重新生成改写稿。
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            ["keep", "保留什么"],
            ["replace", "替换什么"],
            ["add", "新增什么"],
            ["avoid", "避开什么"],
          ] as const
        ).map(([field, label]) => {
          const rules = candidate.adaptationStrategy[field];
          return (
            <section
              key={field}
              aria-label={label}
              className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
            >
              <p className="text-[11px] font-medium text-foreground">{label}</p>
              {rules.length > 0 ? (
                <ul className="mt-1 space-y-1 text-xs leading-5 text-muted-foreground">
                  {rules.map((rule, index) => (
                    <li key={`${field}:${index}:${rule}`}>· {rule}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">暂无额外规则</p>
              )}
            </section>
          );
        })}
        </div>
      </div>
      {draftText && !retrying && !terminalFailure ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={retryDisabled}
          onClick={onRetry}
          className="w-full gap-1.5"
        >
          <RefreshCw className="size-3.5" />
          重新生成改写稿
        </Button>
      ) : null}
      {!confirmed ? (
        <Button
          type="button"
          size="sm"
          disabled={
            busy ||
            !draftText.trim() ||
            [
              candidate.title,
              candidate.angle,
              candidate.differentiation,
              candidate.sourceSummary,
              candidate.targetAudience,
              candidate.audiencePain,
              candidate.coreConflict,
              candidate.format,
            ].some((value) => !value.trim())
          }
          onClick={() => onConfirm(transform.id, candidate)}
          className="w-full"
        >
          确认写入选题池
        </Button>
      ) : null}
      <p className="text-[10px] leading-4 text-muted-foreground">
        采纳后会把对标原稿、改写规则和当前初稿一起带入项目。进入项目后，可继续编辑「我的稿子」。
      </p>
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
  onDone: (result: CreateSourceResult) => void;
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
  const [collectors, setCollectors] = React.useState<
    Awaited<ReturnType<RadarApi["listCollectors"]>>
  >([]);
  const [collectorAccountId, setCollectorAccountId] =
    React.useState("");
  const [profilePreview, setProfilePreview] = React.useState<Awaited<
    ReturnType<RadarApi["previewProfile"]>
  > | null>(null);
  const [webPreview, setWebPreview] = React.useState<Awaited<
    ReturnType<RadarApi["previewWeb"]>
  > | null>(null);
  const [favoriteFolderName, setFavoriteFolderName] = React.useState("");
  const [folders, setFolders] = React.useState<
    Awaited<ReturnType<RadarApi["listFavoriteFolders"]>>
  >([]);
  const [verifiedMessage, setVerifiedMessage] = React.useState<string | null>(
    null,
  );
  const [darkhorseAuthorized, setDarkhorseAuthorized] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reconnectNeeded, setReconnectNeeded] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const loginSource =
    type === "creator_profile" ||
    type === "favorites_folder" ||
    type === "darkhorse_query";

  const resetVerification = React.useCallback(() => {
    setProfilePreview(null);
    setWebPreview(null);
    setVerifiedMessage(null);
    setDarkhorseAuthorized(false);
    setReconnectNeeded(false);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void api
      .listCollectors({ accountId })
      .then((rows) => {
        if (cancelled) return;
        setCollectors(rows);
        setCollectorAccountId(
          rows.find((row) => row.accountId === accountId)?.accountId ??
            rows[0]?.accountId ??
            "",
        );
      })
      .catch(() => {
        if (cancelled) return;
        setCollectors([]);
        setCollectorAccountId("");
        setError("暂时无法读取可用的抖音采集账号。");
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, api, open]);

  const verify = React.useCallback(() => {
    startTransition(async () => {
      setError(null);
      resetVerification();
      try {
        if (type === "creator_profile") {
          if (!collectorAccountId) throw new Error("collector required");
          const preview = await api.previewProfile({
            accountId,
            collectorAccountId,
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
          if (!collectorAccountId) throw new Error("collector required");
          setFolders([]);
          setValue("");
          const rows = await api.listFavoriteFolders({
            accountId,
            collectorAccountId,
          });
          setFolders(rows);
          if (rows.length === 0) {
            setVerifiedMessage("已确认当前账号目前有 0 个收藏夹。");
            return;
          }
          const requestedName = favoriteFolderName.trim();
          const matched = requestedName
            ? rows.find((folder) => folder.name.trim() === requestedName)
            : rows[0];
          if (matched) {
            setValue(matched.id);
            setFavoriteFolderName(matched.name);
          }
          setVerifiedMessage(
            requestedName && !matched
              ? `已读取 ${rows.length} 个收藏夹，但未找到「${requestedName}」。可检查名称或从列表选择。`
              : `已读取 ${rows.length} 个收藏夹，请选择要监控的一个。`,
          );
          return;
        }
        if (type === "darkhorse_query") {
          if (!collectorAccountId || !value.trim()) {
            throw new Error("collector and keyword required");
          }
          const result = await api.reconnectCollector({
            collectorAccountId,
            sourceType: "darkhorse_query",
          });
          if (!result.loggedIn) {
            setReconnectNeeded(true);
            setError(
              "没有检测到热点宝授权成功。请在弹出的 Chrome 窗口完成授权后再试。",
            );
            return;
          }
          setDarkhorseAuthorized(true);
          setVerifiedMessage("热点宝授权已确认，可以保存并开始同步。");
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
        const signal = structuredErrorSignal(caught);
        setReconnectNeeded(
          type === "darkhorse_query" ||
            (loginSource &&
              /DOUYIN_FAVORITES_SESSION_EXPIRED|DouyinNotLoggedIn|LOGIN_REQUIRED|LoginRequired/i.test(
                signal,
              )),
        );
        setError(sourceVerificationErrorMessage(type, caught));
      }
    });
  }, [
    accountId,
    api,
    collectorAccountId,
    favoriteFolderName,
    instruction,
    loginSource,
    resetVerification,
    type,
    value,
  ]);

  const reconnectCollectorForVerification = React.useCallback(() => {
    if (!collectorAccountId || pending) return;
    startTransition(async () => {
      setError(null);
      try {
        const result = await api.reconnectCollector({
          collectorAccountId,
          sourceType: type,
        });
        if (!result.loggedIn) {
          setReconnectNeeded(true);
          setError(
            type === "darkhorse_query"
              ? "热点宝授权尚未完成，请在打开的窗口中确认授权。"
              : "重新登录尚未完成，请在打开的窗口中扫码并确认登录。",
          );
          return;
        }
        setReconnectNeeded(false);
        if (type === "darkhorse_query") {
          setDarkhorseAuthorized(true);
          setVerifiedMessage("热点宝授权已确认，可以保存并开始同步。");
        } else {
          setVerifiedMessage("登录已恢复，请重新测试来源。");
        }
      } catch {
        setReconnectNeeded(true);
        setError(
          type === "darkhorse_query"
            ? "未能完成热点宝授权，请确认授权窗口可用后重试。"
            : "未能完成重新登录，请确认扫码窗口可用后重试。",
        );
      }
    });
  }, [api, collectorAccountId, pending, type]);

  const create = React.useCallback(() => {
    startTransition(async () => {
      setError(null);
      try {
        let config: Record<string, unknown>;
        let inferredDisplayName = "";
        if (type === "creator_profile") {
          if (!profilePreview) throw new Error("preview required");
          config = {
            type,
            collectorAccountId,
            canonicalUrl: profilePreview.canonicalUrl,
            externalAccountId: profilePreview.externalAccountId,
          };
        } else if (type === "favorites_folder") {
          const selectedFolder = folders.find((folder) => folder.id === value);
          const folderKey = selectedFolder?.id ?? favoriteFolderName.trim();
          if (!folderKey) throw new Error("folder required");
          inferredDisplayName =
            selectedFolder?.name ?? favoriteFolderName.trim();
          config = {
            type,
            collectorAccountId,
            folderId: folderKey,
          };
        } else if (type === "darkhorse_query") {
          if (!value.trim() || !darkhorseAuthorized) {
            throw new Error("keyword and douhot authorization required");
          }
          config = {
            type,
            collectorAccountId,
            keyword: value.trim(),
            board: "low_follower_breakout",
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
        const result = await api.createSource({
          accountId,
          collectionId: collectionId || null,
          type,
          config,
          ...(name.trim() || inferredDisplayName
            ? { displayName: name.trim() || inferredDisplayName }
            : {}),
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
        setFavoriteFolderName("");
        setFolders([]);
        resetVerification();
        setOpen(false);
        onDone(result);
      } catch {
        setError(
          type === "darkhorse_query"
            ? "请填写低粉爆款关键词，并先验证热点宝授权。"
            : "请先完成来源验证，再保存并首次同步。",
        );
      }
    });
  }, [
    accountId,
    api,
    collectionId,
    collectorAccountId,
    darkhorseAuthorized,
    favoriteFolderName,
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
                setFavoriteFolderName("");
                setError(null);
                setReconnectNeeded(false);
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
        {loginSource ? (
          <label className="grid gap-1 text-xs text-muted-foreground">
            采集账号
            <select
              aria-label="采集账号"
              value={collectorAccountId}
              onChange={(event) => {
                setCollectorAccountId(event.target.value);
                setValue("");
                setFavoriteFolderName("");
                setFolders([]);
                setError(null);
                setReconnectNeeded(false);
                resetVerification();
              }}
              className="h-9 rounded-xl border border-input bg-background px-3 text-sm text-foreground"
            >
              {collectors.length === 0 ? (
                <option value="">暂无可用抖音账号</option>
              ) : null}
              {collectors.map((collector) => (
                <option
                  key={collector.accountId}
                  value={collector.accountId}
                >
                  {collector.accountHandle}
                  {collector.accountId === accountId ? "（当前工作区）" : ""}
                </option>
              ))}
            </select>
            <span>
              用所选账号的登录态采集，内容仍归当前工作区。
            </span>
          </label>
        ) : null}
        {type === "favorites_folder" ? (
          <label className="grid gap-1 text-xs text-muted-foreground">
            收藏夹名称
            <Input
              aria-label="收藏夹名称"
              value={favoriteFolderName}
              onChange={(event) => {
                const nextName = event.target.value;
                const selectedFolder = folders.find(
                  (folder) => folder.id === value,
                );
                setFavoriteFolderName(nextName);
                if (
                  !selectedFolder ||
                  selectedFolder.name.trim() !== nextName.trim()
                ) {
                  setValue("");
                }
                setError(null);
                setVerifiedMessage(null);
              }}
              placeholder="与抖音收藏夹同名，例如：选题库"
            />
            <span>
              可直接输入准确名称；也可以读取所选账号后，从下方列表选择。
            </span>
          </label>
        ) : null}
        {type === "favorites_folder" && folders.length > 0 ? (
          <label className="grid gap-1 text-xs text-muted-foreground">
            选择收藏夹
            <select
              aria-label="选择收藏夹"
              value={value}
              onChange={(event) => {
                const nextId = event.target.value;
                const selectedFolder = folders.find(
                  (folder) => folder.id === nextId,
                );
                setValue(nextId);
                if (selectedFolder) {
                  setFavoriteFolderName(selectedFolder.name);
                }
                setError(null);
              }}
              className="h-9 rounded-xl border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="">按上方名称精确匹配</option>
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
          placeholder={
            type === "favorites_folder"
              ? "来源显示名称（可选，默认使用收藏夹名称）"
              : "显示名称（可选）"
          }
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
          每日自动同步
        </label>
        <p className="-mt-2 text-xs leading-5 text-muted-foreground">
          {monitor
            ? "保存后立即同步一次；此后 APP 运行时每天同步，错过会在下次打开后补跑。"
            : "保存后仍会立即同步一次；此后只在你点击“同步”时更新。"}
        </p>
        {type === "darkhorse_query" ? (
          <p className="rounded-xl bg-warning-soft px-3 py-2 text-xs leading-5 text-warning">
            黑马采集使用热点宝的独立授权，不等同于普通抖音登录。请先验证热点宝授权；不会回退到旧抖音搜索。
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={
            pending ||
            (loginSource && !collectorAccountId) ||
            (type !== "favorites_folder" && !value.trim())
          }
          onClick={verify}
        >
          {pending
            ? type === "darkhorse_query"
              ? "等待热点宝授权…"
              : "正在验证…"
            : type === "favorites_folder"
              ? "读取并选择收藏夹"
              : type === "darkhorse_query"
                ? "验证热点宝授权"
                : "测试来源"}
        </Button>
        {verifiedMessage ? (
          <p className="text-xs leading-5 text-success">
            {verifiedMessage}
          </p>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {reconnectNeeded ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending || !collectorAccountId}
            onClick={reconnectCollectorForVerification}
          >
            {pending
              ? type === "darkhorse_query"
                ? "等待热点宝授权…"
                : "等待扫码登录…"
              : type === "darkhorse_query"
                ? "重新打开热点宝授权"
                : "重新登录所选采集账号"}
          </Button>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            disabled={
              pending ||
              (loginSource && !collectorAccountId) ||
              (type === "favorites_folder"
                ? !value.trim() && !favoriteFolderName.trim()
                : !value.trim()) ||
              (type === "creator_profile" && !profilePreview) ||
              (type === "darkhorse_query" && !darkhorseAuthorized) ||
              ((type === "web" || type === "rss") && !webPreview)
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
