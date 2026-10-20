"use client";

/**
 * `topics-supply-region.tsx` — [T-235e] 选题中心「被服务感知」客户端岛(SPEC
 * 2026-07-11-daily-topic-autopilot §2.5,用户拍板三决策):
 *
 *  ① `TodayTopicsStrip` 今日新选题 —— 页顶**横向滚动卡片带**(不挤压下方候选池三栏)。
 *     数据 = candidates.list?sort=createdAt&createdAfter=今日零点，SQL 先按日期过滤，
 *     前端再做防御性过滤；来源徽标 = source + title 前缀解析(「🔥跟拍|」=T-235b 黑马雷达、
 *     「实验|」=T-235d 归因回流);一句依据 = card.oneLiner / angle 截断。空态诚实
 *     「今晨采集无新信号」。
 *  ② `SupplyHealthStrip` 供给链健康条 —— 今日条带上方**灰色细条一行**(仿 dy-- 顶部流水线):
 *     对标采集✓时间 → 拆解 M → 黑马⚡D → 出题✓时间·K → 待审 X;整条可点跳 /automations。
 *     lastRun 来自 scheduledJobs.list(服务端读装配),数据读不到的环节显「—」诚实降级。
 *
 * 旧「信号源」配置弹窗已随 T-482 内容雷达退役；本文件只保留选题页仍在使用的今日候选
 * 与供给实绩投影。来源的登记、浏览和运行诊断统一进入 `/intelligence`。
 *
 * Determinism (C-5):渲染内无 Date.now / Math.random / fetch —— 「今天」由服务端
 * loadViewModel 算好 dayStartIso 传入;时间显示是对入参 ISO 的纯格式化。
 */

import * as React from "react";
import Link from "next/link";
import { Sunrise } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CandidateResource } from "@creatoros/backend/modules/candidate";
// [T-279] 今日新选题卡点击 → 跨 island 选中候选池详情(见 topic-focus-signal 注释)。
import { emitTopicFocus } from "./topic-focus-signal";

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
    return c.status === "pool" && !Number.isNaN(t) && t >= start;
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
          按新增时间汇总
        </span>
      </div>
      {today.length === 0 ? (
        <p
          data-testid="today-topics-empty"
          className="rounded-control border border-dashed border-border px-3 py-2 text-xs text-muted-foreground"
        >
          今日暂无新增选题，可继续挑选已有候选，或从上方补充选题。
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
              // [T-279] 可点:点卡 → 发 TOPIC_FOCUS 信号 → TopicsWorkspace 选中该候选 + 滚进视野
              //   (治「今日新选题点不进去」)。role/tabIndex/onKeyDown 补键盘可达 + hover 态。
              <li
                key={c.id}
                data-testid="today-topic-card"
                data-tone={parsed.tone}
                role="button"
                tabIndex={0}
                onClick={() => emitTopicFocus(c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    emitTopicFocus(c.id);
                  }
                }}
                className="flex w-64 shrink-0 cursor-pointer flex-col gap-1 rounded-card border border-border bg-surface-subtle/40 px-3 py-1.5 transition-colors hover:border-brand/40 hover:bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
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
