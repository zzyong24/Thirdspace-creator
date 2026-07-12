"use client";

/**
 * `topics-supply-region.tsx` — [T-235e] 选题中心「被服务感知」客户端岛(SPEC
 * 2026-07-11-daily-topic-autopilot §2.5,用户拍板三决策):
 *
 *  ① `TodayTopicsStrip` 今日新选题 —— 页顶**横向滚动卡片带**(不挤压下方候选池三栏)。
 *     数据 = candidates.list 前端按 createdAt≥今日零点过滤(契约 query 不支持日期过滤,页大小
 *     100 内前端过滤可接受);来源徽标 = source + title 前缀解析(「🔥跟拍|」=T-235b 黑马雷达、
 *     「实验|」=T-235d 归因回流);一句依据 = card.oneLiner / angle 截断。空态诚实
 *     「今晨采集无新信号」。
 *  ② `SupplyHealthStrip` 供给链健康条 —— 今日条带上方**灰色细条一行**(仿 dy-- 顶部流水线):
 *     对标采集✓时间 → 拆解 M → 黑马⚡D → 出题✓时间·K → 待审 X;整条可点跳 /automations。
 *     lastRun 来自 scheduledJobs.list(服务端读装配),数据读不到的环节显「—」诚实降级。
 *  ③ `SignalSourcesButton` 统一「信号源」弹窗三 tab —— 网页信源(trend.sources.* CRUD,
 *     需登录站点提示去 设置→网站登录保管库)/ 对标博主(现有 BenchmarkSourcesPanel 整体迁入,
 *     含 T-222 立即采集)/ 黑马关键词(展示型 v1:定位 keywords chips + env 提示,不新建后端
 *     存储——诚实展示优于半吊子编辑)。替换原「对标源」按钮。
 *
 * Determinism (C-5):渲染内无 Date.now / Math.random / fetch —— 「今天」由服务端
 * loadViewModel 算好 dayStartIso 传入;时间显示是对入参 ISO 的纯格式化。
 */

import * as React from "react";
import Link from "next/link";
import {
  Radar,
  Globe,
  Target,
  Zap,
  Plus,
  Trash2,
  Sunrise,
  Bookmark,
} from "lucide-react";

import { client } from "@/lib/contract-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { CandidateResource } from "@creatoros/backend/modules/candidate";
import type { BenchmarkSourceResource } from "@creatoros/backend/modules/benchmark";
import type { TrendSourceResource } from "@creatoros/backend/modules/trend-sources";
// [T-235c] 指定收藏夹登记(信号源弹窗第 4 tab)。
import type { FavoritesFolderResource } from "@creatoros/backend/modules/favorites";

import {
  useMutation,
  FieldRow,
  BenchmarkSourcesPanel,
} from "./topics-interactive-region";
// [T-248B②] 受众信号入口(独立按钮+弹窗,audienceSignals.list / linkToCandidate 接线)。
import { AudienceSignalsButton } from "./topics-audience-signals";

// ── 供给来源徽标解析(title 前缀 > source 枚举)────────────────────────────────────
// T-235b 黑马转化候选 title 前缀「🔥跟拍|」(benchmark-teardown-runner.ts:204);
// T-235d 实验候选 title 前缀「实验|」+ card.attributionId(topic-attribution-runner.ts:213)。
// 徽标只解析、不改库 —— 展示时剥掉前缀让标题干净,data 层保持原样。
const STRIP_SOURCE_LABELS: Record<string, string> = {
  trend: "热点",
  benchmark: "对标",
  demand: "需求",
  idea: "灵感",
  favorites: "收藏", // [T-235c] 指定收藏夹采集进池的跟拍候选
};

export interface SupplyBadge {
  /** 徽标文案(🔥跟拍·时效 / 实验 / 热点 / 对标 / 需求 / 灵感)。 */
  readonly badge: string;
  /** 展示用标题(剥掉「🔥跟拍|」「实验|」前缀)。 */
  readonly title: string;
  /** 徽标语气:urgent=时效跟拍,experiment=归因实验,plain=常规来源。 */
  readonly tone: "urgent" | "experiment" | "plain";
}

export function parseSupplyBadge(candidate: CandidateResource): SupplyBadge {
  const title = candidate.title;
  if (title.startsWith("🔥跟拍|")) {
    return { badge: "🔥跟拍·时效", title: title.slice("🔥跟拍|".length), tone: "urgent" };
  }
  if (title.startsWith("实验|") || candidate.card.attributionId) {
    return {
      badge: "实验",
      title: title.startsWith("实验|") ? title.slice("实验|".length) : title,
      tone: "experiment",
    };
  }
  return {
    badge: STRIP_SOURCE_LABELS[candidate.source] ?? candidate.source,
    title,
    tone: "plain",
  };
}

// ── 今日过滤(纯函数,dayStartIso 由服务端算好传入 → 渲染无 Date.now)────────────────
export function filterTodayCandidates(
  candidates: readonly CandidateResource[],
  dayStartIso: string | undefined,
): CandidateResource[] {
  if (!dayStartIso) return [];
  const start = Date.parse(dayStartIso);
  if (Number.isNaN(start)) return [];
  return candidates.filter((c) => {
    const t = Date.parse(c.createdAt);
    return !Number.isNaN(t) && t >= start;
  });
}

// ── ① 今日新选题条带(页顶横向滚动卡片带;[T-242] 紧凑化 —— 徽标+标题同行、依据单行,
//     卡片降高,把垂直空间让给候选池 C 位)──────────────────────────────────────────
export function TodayTopicsStrip({
  candidates,
  dayStartIso,
}: {
  readonly candidates: readonly CandidateResource[];
  readonly dayStartIso?: string;
}) {
  const today = filterTodayCandidates(candidates, dayStartIso);

  return (
    <section
      data-testid="today-topics-strip"
      className="flex shrink-0 flex-col gap-1.5 rounded-card border border-border bg-surface px-3 py-2"
    >
      <div className="flex items-center gap-2">
        <Sunrise className="size-4 text-brand" />
        <h3 className="text-sm font-semibold text-foreground">今日新选题</h3>
        {today.length > 0 ? (
          <Badge variant="secondary" className="text-[10px] tabular-nums">
            {today.length}
          </Badge>
        ) : null}
        <span className="text-[11px] text-text-subtle">
          系统昨夜~今晨自动供给的候选
        </span>
      </div>
      {today.length === 0 ? (
        <p
          data-testid="today-topics-empty"
          className="rounded-control border border-dashed border-border px-3 py-2 text-xs text-muted-foreground"
        >
          今晨采集无新信号 —— 定时供给跑过但没有新候选,或作业还没到点。
        </p>
      ) : (
        <ul
          data-testid="today-topics-list"
          className="flex gap-2 overflow-x-auto pb-1"
        >
          {today.map((c) => {
            const parsed = parseSupplyBadge(c);
            const reason = c.card.oneLiner || c.angle || "";
            return (
              // [T-242] 紧凑卡:徽标与标题同行 + 依据单行截断(原三行叠 → 两行)。
              <li
                key={c.id}
                data-testid="today-topic-card"
                data-tone={parsed.tone}
                className="flex w-64 shrink-0 flex-col gap-1 rounded-card border border-border bg-surface-subtle/40 px-3 py-1.5"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Badge
                    variant={parsed.tone === "plain" ? "secondary" : "outline"}
                    className={cn(
                      "shrink-0 text-[10px]",
                      parsed.tone === "urgent" && "border-warning/50 text-warning",
                      parsed.tone === "experiment" && "border-brand/50 text-brand",
                    )}
                  >
                    {parsed.badge}
                  </Badge>
                  <span className="truncate text-xs font-medium text-foreground">
                    {parsed.title}
                  </span>
                </span>
                {reason ? (
                  <span className="truncate text-[11px] text-muted-foreground">
                    {reason}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ── ② 供给链健康条(灰色细条一行,点击跳 /automations)──────────────────────────────
/** 服务端装配的调度实绩(读不到 → null → 显「—」诚实降级)。 */
export interface SupplyHealth {
  /** benchmark 采集作业最近一次到点触发时刻(scheduledJobs.list lastRunAt)。 */
  readonly benchmarkLastRunAt: string | null;
  /** topic.daily 出题作业最近一次到点触发时刻。 */
  readonly topicDailyLastRunAt: string | null;
}

/** ISO → 本地 HH:mm(对入参的纯格式化;无效/缺失 → null)。 */
function formatRunTime(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  const hh = String(t.getHours()).padStart(2, "0");
  const mm = String(t.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export interface SupplySegment {
  readonly key: string;
  readonly label: string;
  /** 展示值;数据读不到 → 「—」。 */
  readonly value: string;
}

// 各环节读数(纯函数,可单测):对标采集(lastRun)→ 拆解 M(今日 source=benchmark 进池)→
// 黑马⚡D(其中「🔥跟拍|」前缀)→ 出题 K(今日新候选总数 + topic.daily lastRun)→ 待审 X(pool 总数)。
// dayStartIso 缺失时今日计数不可得 → 「—」(不猜)。
export function deriveSupplySegments({
  health,
  candidates,
  dayStartIso,
}: {
  readonly health: SupplyHealth | undefined;
  readonly candidates: readonly CandidateResource[];
  readonly dayStartIso?: string;
}): SupplySegment[] {
  const today = filterTodayCandidates(candidates, dayStartIso);
  const hasToday = Boolean(dayStartIso);
  const benchTime = formatRunTime(health?.benchmarkLastRunAt ?? null);
  const topicTime = formatRunTime(health?.topicDailyLastRunAt ?? null);
  const teardown = today.filter((c) => c.source === "benchmark").length;
  const darkhorse = today.filter((c) => c.title.startsWith("🔥跟拍|")).length;
  const pool = candidates.filter((c) => c.status === "pool").length;
  return [
    { key: "collect", label: "对标采集", value: benchTime ? `✓${benchTime}` : "—" },
    { key: "teardown", label: "拆解进池", value: hasToday ? String(teardown) : "—" },
    { key: "darkhorse", label: "黑马", value: hasToday ? `⚡${darkhorse}` : "—" },
    {
      key: "generate",
      label: "出题",
      value: hasToday
        ? topicTime
          ? `✓${topicTime}·${today.length}`
          : String(today.length)
        : "—",
    },
    { key: "review", label: "待审", value: String(pool) },
  ];
}

export function SupplyHealthStrip({
  health,
  candidates,
  dayStartIso,
}: {
  readonly health?: SupplyHealth;
  readonly candidates: readonly CandidateResource[];
  readonly dayStartIso?: string;
}) {
  const segments = deriveSupplySegments({ health, candidates, dayStartIso });
  return (
    <Link
      href="/automations"
      data-testid="supply-health-strip"
      className="flex shrink-0 items-center gap-1.5 overflow-x-auto rounded-control bg-surface-subtle/70 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-surface-subtle"
      title="供给链各环节实绩 —— 点击查看任务中心"
    >
      {segments.map((seg, i) => (
        <React.Fragment key={seg.key}>
          {i > 0 ? <span className="shrink-0 text-text-subtle">→</span> : null}
          <span
            data-testid="supply-health-segment"
            data-segment={seg.key}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap"
          >
            <span>{seg.label}</span>
            <span className="font-medium tabular-nums text-foreground/80">
              {seg.value}
            </span>
          </span>
        </React.Fragment>
      ))}
      <span className="ml-auto shrink-0 whitespace-nowrap text-text-subtle">
        任务中心 ›
      </span>
    </Link>
  );
}

// ── ③ 信号源弹窗 tab1:网页信源(trend.sources.* CRUD,T-235b)────────────────────────
function TrendSourceForm() {
  const { pending, run, router } = useMutation();
  const [url, setUrl] = React.useState("");
  const [name, setName] = React.useState("");
  const [note, setNote] = React.useState("");
  const valid = url.trim().length > 0;

  function submit() {
    if (!valid) return;
    run(
      () =>
        client.createTrendSource({
          params: undefined,
          query: undefined,
          body: {
            url: url.trim(),
            name: name.trim() || null,
            note: note.trim() || null,
            // sourceType 不传 → 服务端按 URL 派生(feed 特征 → rss,否则 web)。
          },
        }),
      () => {
        setUrl("");
        setName("");
        setNote("");
        router.refresh();
      },
    );
  }

  return (
    <form
      data-testid="trend-source-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-2.5 rounded-card border border-border bg-surface-subtle/40 p-3"
    >
      <FieldRow label="信源 URL" required>
        <Input
          aria-label="信源 URL"
          placeholder="热榜页 / 垂类社区 / RSS feed 地址"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </FieldRow>
      <FieldRow label="名称">
        <Input
          aria-label="信源名称"
          placeholder="展示名（可空,缺省用域名）"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </FieldRow>
      <FieldRow label="备注">
        <Input
          aria-label="信源备注"
          placeholder="这个源值得盯什么（可空）"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </FieldRow>
      <div className="flex justify-end">
        <Button
          type="submit"
          size="sm"
          disabled={pending || !valid}
          className="h-8 gap-1.5 bg-brand px-3 text-xs text-brand-foreground hover:bg-brand/90"
        >
          <Plus className="size-3.5" />
          {pending ? "登记中…" : "登记信源"}
        </Button>
      </div>
    </form>
  );
}

function TrendSourceRow({ source }: { readonly source: TrendSourceResource }) {
  const { pending, run } = useMutation();

  function toggle() {
    run(() =>
      client.toggleTrendSource({
        params: { sourceId: source.id },
        query: undefined,
        body: { enabled: !source.enabled },
      }),
    );
  }

  function remove() {
    run(() =>
      client.removeTrendSource({
        params: { sourceId: source.id },
        query: undefined,
        body: undefined,
      }),
    );
  }

  return (
    <li
      data-testid="trend-source-row"
      data-source-id={source.id}
      data-enabled={source.enabled ? "true" : "false"}
      className="flex items-start justify-between gap-2 rounded-control border border-border bg-surface px-3 py-2"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">
            {source.name}
          </span>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {source.sourceType === "rss" ? "RSS" : "网页"}
          </Badge>
          <Badge
            variant={source.enabled ? "secondary" : "outline"}
            className="shrink-0 text-[10px]"
          >
            {source.enabled ? "启用" : "停用"}
          </Badge>
        </span>
        <span className="truncate text-[11px] text-text-subtle">
          {source.domain}
        </span>
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="truncate text-[11px] text-brand hover:underline"
        >
          {source.url}
        </a>
        {source.note ? (
          <span className="text-[11px] text-muted-foreground">{source.note}</span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={pending}
          onClick={toggle}
        >
          {source.enabled ? "停用" : "启用"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground"
          aria-label="删除信源"
          disabled={pending}
          onClick={remove}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}

function TrendSourcesTab({
  sources,
}: {
  readonly sources: TrendSourceResource[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <TrendSourceForm />
      {/* 需登录站点的诚实引导 —— 登录态在 Web Session Vault(T-217a),这里只指路不代办。 */}
      <p
        data-testid="trend-source-login-hint"
        className="rounded-control bg-surface-subtle/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground"
      >
        需登录的站点:先去 设置→网站登录保管库 登录该域名,定时抓取会自动带上登录态读页面。
      </p>
      {sources.length === 0 ? (
        <p
          data-testid="trend-source-empty"
          className="rounded-card border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground"
        >
          还没有网页信源。登记任意热榜页 / 垂类社区 / RSS feed，出题时会抓最新信号进热点依据。
        </p>
      ) : (
        <ul data-testid="trend-source-list" className="flex flex-col gap-2">
          {sources.map((s) => (
            <TrendSourceRow key={s.id} source={s} />
          ))}
        </ul>
      )}
    </div>
  );
}

// ── ③ 信号源弹窗 tab4:收藏夹([T-235c] 指定抖音收藏夹登记,favorites.folders.* CRUD)────────
function FavoritesFolderForm() {
  const { pending, run, router } = useMutation();
  const [name, setName] = React.useState("");
  const valid = name.trim().length > 0;

  function submit() {
    if (!valid) return;
    run(
      () =>
        client.createFavoritesFolder({
          params: undefined,
          query: undefined,
          body: { name: name.trim() },
        }),
      () => {
        setName("");
        router.refresh();
      },
    );
  }

  return (
    <form
      data-testid="favorites-folder-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-2.5 rounded-card border border-border bg-surface-subtle/40 p-3"
    >
      <FieldRow label="收藏夹名" required>
        <Input
          aria-label="收藏夹名"
          placeholder="与抖音收藏夹同名,如:选题库"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </FieldRow>
      <div className="flex justify-end">
        <Button
          type="submit"
          size="sm"
          disabled={pending || !valid}
          className="h-8 gap-1.5 bg-brand px-3 text-xs text-brand-foreground hover:bg-brand/90"
        >
          <Plus className="size-3.5" />
          {pending ? "登记中…" : "登记收藏夹"}
        </Button>
      </div>
    </form>
  );
}

function FavoritesFolderRow({
  folder,
}: {
  readonly folder: FavoritesFolderResource;
}) {
  const { pending, run } = useMutation();

  function toggle() {
    run(() =>
      client.toggleFavoritesFolder({
        params: { folderId: folder.id },
        query: undefined,
        body: { enabled: !folder.enabled },
      }),
    );
  }

  function remove() {
    run(() =>
      client.removeFavoritesFolder({
        params: { folderId: folder.id },
        query: undefined,
        body: undefined,
      }),
    );
  }

  return (
    <li
      data-testid="favorites-folder-row"
      data-folder-id={folder.id}
      data-enabled={folder.enabled ? "true" : "false"}
      className="flex items-start justify-between gap-2 rounded-control border border-border bg-surface px-3 py-2"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">
            {folder.name}
          </span>
          {/* collectsId 已按名匹配回填 = 「已对上」;未匹配 = 等首采按名匹配(诚实状态,不装已连)。 */}
          <Badge
            variant={folder.collectsId ? "secondary" : "outline"}
            className="shrink-0 text-[10px]"
          >
            {folder.collectsId ? "已对上" : "待首采匹配"}
          </Badge>
          <Badge
            variant={folder.enabled ? "secondary" : "outline"}
            className="shrink-0 text-[10px]"
          >
            {folder.enabled ? "启用" : "停用"}
          </Badge>
        </span>
        {folder.note ? (
          <span className="text-[11px] text-muted-foreground">{folder.note}</span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={pending}
          onClick={toggle}
        >
          {folder.enabled ? "停用" : "启用"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground"
          aria-label="删除收藏夹登记"
          disabled={pending}
          onClick={remove}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}

function FavoritesFoldersTab({
  folders,
}: {
  readonly folders: FavoritesFolderResource[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* 引导文案:只采登记的指定夹,不碰其他收藏(隐私红线,登记页就说清)。 */}
      <p
        data-testid="favorites-folder-guide"
        className="rounded-control bg-surface-subtle/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground"
      >
        在抖音建一个专门收藏夹(如『选题库』),把想跟拍的对标视频收进去;系统每天只采集这里登记的指定夹,不碰其他收藏。
      </p>
      <FavoritesFolderForm />
      {folders.length === 0 ? (
        <p
          data-testid="favorites-folder-empty"
          className="rounded-card border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground"
        >
          还没有登记收藏夹。登记与抖音同名的收藏夹,每天自动把夹内视频变成跟拍候选。
        </p>
      ) : (
        <ul data-testid="favorites-folder-list" className="flex flex-col gap-2">
          {folders.map((f) => (
            <FavoritesFolderRow key={f.id} folder={f} />
          ))}
        </ul>
      )}
    </div>
  );
}

// ── ③ 信号源弹窗 tab3:黑马关键词(展示型 v1 —— 关键词跟随定位,不新建后端存储)───────────
function DarkhorseKeywordsTab({
  keywords,
}: {
  readonly keywords: readonly string[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        黑马雷达按这些关键词搜抖音「近 1 天最多赞」，低粉高赞 = 选题被算法验证且跟拍窗口未关。
      </p>
      {keywords.length === 0 ? (
        <p
          data-testid="darkhorse-keywords-empty"
          className="rounded-card border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground"
        >
          还没有定位关键词。关键词跟随定位——先去定位中心生成定位，黑马雷达会用它们搜索。
        </p>
      ) : (
        <div
          data-testid="darkhorse-keywords-chips"
          className="flex flex-wrap gap-1.5"
        >
          {keywords.map((k) => (
            <Badge key={k} variant="secondary" className="text-[11px]">
              {k}
            </Badge>
          ))}
        </div>
      )}
      <p className="rounded-control bg-surface-subtle/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        关键词跟随定位，去{" "}
        <Link href="/positioning" className="text-brand hover:underline">
          定位中心
        </Link>{" "}
        维护；也可用环境变量 CREATOROS_DARKHORSE_KEYWORDS（逗号分隔）追加，重启后生效。
      </p>
    </div>
  );
}

// ── ③ 统一「信号源」按钮 + 弹窗三 tab(替换原「对标源」按钮)────────────────────────────
export function SignalSourcesButton({
  benchmarkSources,
  trendSources = [],
  favoritesFolders = [],
  darkhorseKeywords = [],
  defaultTab = "web",
}: {
  readonly benchmarkSources: BenchmarkSourceResource[];
  readonly trendSources?: TrendSourceResource[];
  /** [T-235c] 已登记的指定收藏夹(第 4 tab)。可选:缺省空列表。 */
  readonly favoritesFolders?: FavoritesFolderResource[];
  readonly darkhorseKeywords?: readonly string[];
  /** 打开弹窗时的初始 tab(默认网页信源;测试/深链可指定)。 */
  readonly defaultTab?: "web" | "benchmark" | "darkhorse" | "favorites";
}) {
  const [open, setOpen] = React.useState(false);
  const { router } = useMutation();
  const total =
    trendSources.length + benchmarkSources.length + favoritesFolders.length;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="signal-sources-trigger"
        className="h-8 shrink-0 gap-1.5 px-3 text-xs"
        onClick={() => setOpen(true)}
      >
        <Radar className="size-3.5" />
        信号源
        {total > 0 ? (
          <Badge variant="secondary" className="ml-0.5 text-[10px] tabular-nums">
            {total}
          </Badge>
        ) : null}
      </Button>
      {/* [T-248B②] 受众信号入口 —— 与「信号源」并排的独立按钮+弹窗(不并入三 tab:
          信号源管「从哪采」,受众信号管「采到了什么 + 转候选」,语义不同;转候选成功后
          router.refresh() 让候选池吃到新孵化的 demand 候选)。 */}
      <AudienceSignalsButton onRefresh={() => router.refresh()} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          data-testid="signal-sources-dialog"
          className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-lg"
        >
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>选题信号源</DialogTitle>
            <DialogDescription>
              系统每天从这些信号源自动找选题 —— 网页信源、对标博主、黑马关键词、指定收藏夹。
            </DialogDescription>
          </DialogHeader>
          <Tabs
            defaultValue={defaultTab}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-5 py-4"
          >
            <TabsList className="shrink-0">
              <TabsTrigger value="web" data-testid="signal-tab-web">
                <Globe className="size-3.5" />
                网页信源
              </TabsTrigger>
              <TabsTrigger value="benchmark" data-testid="signal-tab-benchmark">
                <Target className="size-3.5" />
                对标博主
              </TabsTrigger>
              <TabsTrigger value="darkhorse" data-testid="signal-tab-darkhorse">
                <Zap className="size-3.5" />
                黑马关键词
              </TabsTrigger>
              {/* [T-235c] 指定收藏夹:抖音里随手收藏 = 人肉选题信号,系统只采登记的夹。 */}
              <TabsTrigger value="favorites" data-testid="signal-tab-favorites">
                <Bookmark className="size-3.5" />
                收藏夹
              </TabsTrigger>
            </TabsList>
            <TabsContent value="web" className="min-h-0 flex-1 overflow-y-auto">
              <TrendSourcesTab sources={trendSources} />
            </TabsContent>
            <TabsContent
              value="benchmark"
              className="min-h-0 flex-1 overflow-y-auto"
            >
              {/* [T-216/T-222] 对标源登记 + 立即采集整体迁入 tab(组件原样复用,行为不变)。 */}
              <BenchmarkSourcesPanel sources={benchmarkSources} />
            </TabsContent>
            <TabsContent
              value="darkhorse"
              className="min-h-0 flex-1 overflow-y-auto"
            >
              <DarkhorseKeywordsTab keywords={darkhorseKeywords} />
            </TabsContent>
            <TabsContent
              value="favorites"
              className="min-h-0 flex-1 overflow-y-auto"
            >
              {/* [T-235c] 指定收藏夹登记(favorites.folders.* CRUD,采集 9:50 定时到点)。 */}
              <FavoritesFoldersTab folders={favoritesFolders} />
            </TabsContent>
          </Tabs>
          <DialogFooter className="border-t">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
