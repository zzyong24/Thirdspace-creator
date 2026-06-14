"use client";

/**
 * `AICopilotContent` is the page-specs §16 component tree for the
 * AI Copilot dialog (Task 24).
 *
 *   AICopilotContent
 *   ├── PromptComposer
 *   │   ├── PromptInput
 *   │   ├── SuggestedActionChips
 *   │   └── SubmitButton
 *   ├── CopilotDashboard
 *   │   ├── RecommendedCommands
 *   │   ├── RecentTasks
 *   │   └── ContinuingTasks
 *   ├── QuickEntries
 *   └── SmartRecommendation
 *
 * The content is a Server Component (no `"use client"`). The submit
 * button uses a `<form>` with no `action`, which is a no-op
 * fixture-only local behavior — the dialog MUST NOT issue a real AI
 * request (page-specs §16 "禁止改变": "不新增 Agent 商店", and D-001
 * the product is personal / no real agent network). The chips and
 * cards below the prompt are pure fixture-driven data from
 * `canonicalDataset` and from a `COPILOT_FIXTURE` block defined in
 * this file.
 *
 * Determinism: no `Date.now` / `Math.random` / network. The dialog
 * renders identically on every load.
 */

import * as React from "react";
import {
  ArrowUp,
  BookOpenText,
  ChartLine,
  Crosshair,
  FileSearch,
  FileText,
  FolderOpen,
  Lightbulb,
  Plus,
  Search as SearchIcon,
  Send,
  Sparkles,
  TrendingUp,
  Wand2,
  Image as ImageIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Fixture — locked, deterministic, local to this feature.
// ---------------------------------------------------------------------------

const PROMPT_VALUE = "";

const SUGGESTED_ACTIONS: ReadonlyArray<{
  readonly id: string;
  readonly label: string;
  readonly icon:
    | "crosshair"
    | "wand"
    | "file-search"
    | "sparkles"
    | "image"
    | "line-chart";
}> = [
  { id: "analyze", label: "分析机会", icon: "crosshair" },
  { id: "script", label: "生成脚本", icon: "wand" },
  { id: "assets", label: "寻找素材", icon: "file-search" },
  { id: "title", label: "优化标题", icon: "sparkles" },
  { id: "cover", label: "生成封面", icon: "image" },
  { id: "review", label: "发布复盘", icon: "line-chart" },
];

const RECOMMENDED_COMMANDS: ReadonlyArray<{
  readonly id: string;
  readonly icon: "crosshair" | "file" | "file-search" | "sparkles" | "line-chart";
  readonly tone: "pink" | "violet" | "mint" | "orange" | "indigo";
  readonly title: string;
  readonly description: string;
}> = [
  {
    id: "market-opportunity",
    icon: "crosshair",
    tone: "pink",
    title: "分析 AI Browser 市场机会",
    description: "深度分析市场趋势和机会点",
  },
  {
    id: "video-script",
    icon: "file",
    tone: "violet",
    title: "生成视频脚本大纲",
    description: "基于主题生成结构化脚本",
  },
  {
    id: "find-assets",
    icon: "file-search",
    tone: "mint",
    title: "寻找相关素材",
    description: "在全局素材库中搜索相关素材",
  },
  {
    id: "title-cover",
    icon: "sparkles",
    tone: "orange",
    title: "优化标题和封面",
    description: "生成更吸引人的标题和封面",
  },
  {
    id: "publish-review",
    icon: "line-chart",
    tone: "indigo",
    title: "发布效果复盘",
    description: "分析发布数据并给出优化建议",
  },
];

const RECENT_TASKS: ReadonlyArray<{
  readonly id: string;
  readonly title: string;
  readonly project: string;
  readonly meta: string;
}> = [
  {
    id: "task-1",
    title: "分析 AI Native Browser 的核心机会",
    project: "AI Native Browser 深度解析",
    meta: "2 小时前",
  },
  {
    id: "task-2",
    title: "生成脚本：浏览器隐私趋势",
    project: "下一代浏览器的机会与未来",
    meta: "昨天 16:30",
  },
  {
    id: "task-3",
    title: "寻找 B-roll 素材：用户使用场景",
    project: "AI 浏览器功能拆解",
    meta: "昨天 10:15",
  },
  {
    id: "task-4",
    title: "优化标题：AI 浏览器真的来了吗？",
    project: "AI Native Browser 深度解析",
    meta: "2 天前",
  },
  {
    id: "task-5",
    title: "复盘视频发布效果",
    project: "Comet 产品分析报告",
    meta: "3 天前",
  },
];

const CONTINUING_TASKS: ReadonlyArray<{
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: "进行中" | "排队中" | "已完成";
  readonly progress: number | null;
  readonly tone: "violet" | "amber" | "emerald";
}> = [
  {
    id: "cont-1",
    title: "生成脚本大纲",
    description: "AI 浏览器的未来趋势",
    status: "进行中",
    progress: 45,
    tone: "violet",
  },
  {
    id: "cont-2",
    title: "竞品对比分析",
    description: "对比 6 款主流浏览器",
    status: "排队中",
    progress: null,
    tone: "amber",
  },
  {
    id: "cont-3",
    title: "用户痛点挖掘",
    description: "分析用户评论和反馈",
    status: "排队中",
    progress: null,
    tone: "amber",
  },
  {
    id: "cont-4",
    title: "生成内容策略",
    description: "品牌内容策略规划",
    status: "已完成",
    progress: 100,
    tone: "emerald",
  },
];

const QUICK_ENTRIES: ReadonlyArray<{
  readonly id: string;
  readonly icon: "plus" | "folder" | "search" | "image" | "send" | "book";
  readonly title: string;
}> = [
  { id: "new-project", icon: "plus", title: "新建项目" },
  { id: "open-project", icon: "folder", title: "打开项目" },
  { id: "search", icon: "search", title: "全局搜索" },
  { id: "assets", icon: "image", title: "素材中心" },
  { id: "publish", icon: "send", title: "发布中心" },
  { id: "knowledge", icon: "book", title: "知识库" },
];

const SMART_RECOMMENDATIONS: ReadonlyArray<{
  readonly id: string;
  readonly title: string;
}> = [
  { id: "rec-1", title: "分析竞品策略" },
  { id: "rec-2", title: "寻找最新数据" },
  { id: "rec-3", title: "生成对比图表" },
];

// ---------------------------------------------------------------------------
// Icon helpers
// ---------------------------------------------------------------------------

const TONE_BG: Record<string, string> = {
  pink: "bg-pink-100 text-pink-600",
  violet: "bg-violet-100 text-violet-600",
  mint: "bg-emerald-100 text-emerald-600",
  orange: "bg-orange-100 text-orange-600",
  indigo: "bg-indigo-100 text-indigo-600",
};

const STATUS_BADGE: Record<string, string> = {
  进行中: "bg-violet-100 text-violet-600",
  排队中: "bg-amber-100 text-amber-700",
  已完成: "bg-emerald-100 text-emerald-700",
};

const STATUS_BAR: Record<string, string> = {
  进行中: "bg-violet-500",
  已完成: "bg-emerald-500",
};

function RecommendedIcon({
  kind,
  tone,
}: {
  kind:
    | "crosshair"
    | "file"
    | "file-search"
    | "sparkles"
    | "line-chart";
  tone: "pink" | "violet" | "mint" | "orange" | "indigo";
}) {
  const toneClass = TONE_BG[tone] ?? TONE_BG.violet;
  switch (kind) {
    case "crosshair":
      return (
        <span
          className={`inline-flex size-7 items-center justify-center rounded-md ${toneClass}`}
        >
          <Crosshair className="size-3.5" aria-hidden="true" />
        </span>
      );
    case "file":
      return (
        <span
          className={`inline-flex size-7 items-center justify-center rounded-md ${toneClass}`}
        >
          <FileText className="size-3.5" aria-hidden="true" />
        </span>
      );
    case "file-search":
      return (
        <span
          className={`inline-flex size-7 items-center justify-center rounded-md ${toneClass}`}
        >
          <FileSearch className="size-3.5" aria-hidden="true" />
        </span>
      );
    case "sparkles":
      return (
        <span
          className={`inline-flex size-7 items-center justify-center rounded-md ${toneClass}`}
        >
          <Wand2 className="size-3.5" aria-hidden="true" />
        </span>
      );
    case "line-chart":
      return (
        <span
          className={`inline-flex size-7 items-center justify-center rounded-md ${toneClass}`}
        >
          <ChartLine className="size-3.5" aria-hidden="true" />
        </span>
      );
  }
}

function ChipIcon({
  kind,
}: {
  kind:
    | "crosshair"
    | "wand"
    | "file-search"
    | "sparkles"
    | "image"
    | "line-chart";
}) {
  switch (kind) {
    case "crosshair":
      return <Crosshair className="size-3.5" aria-hidden="true" />;
    case "wand":
      return <Wand2 className="size-3.5" aria-hidden="true" />;
    case "file-search":
      return <FileSearch className="size-3.5" aria-hidden="true" />;
    case "sparkles":
      return <Sparkles className="size-3.5" aria-hidden="true" />;
    case "image":
      return <ImageIcon className="size-3.5" aria-hidden="true" />;
    case "line-chart":
      return <ChartLine className="size-3.5" aria-hidden="true" />;
  }
}

function QuickIcon({
  kind,
}: {
  kind: "plus" | "folder" | "search" | "image" | "send" | "book";
}) {
  switch (kind) {
    case "plus":
      return <Plus className="size-4" aria-hidden="true" />;
    case "folder":
      return <FolderOpen className="size-4" aria-hidden="true" />;
    case "search":
      return <SearchIcon className="size-4" aria-hidden="true" />;
    case "image":
      return <ImageIcon className="size-4" aria-hidden="true" />;
    case "send":
      return <Send className="size-4" aria-hidden="true" />;
    case "book":
      return <BookOpenText className="size-4" aria-hidden="true" />;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AICopilotContent() {
  return (
    <div className="flex flex-col gap-4" data-slot="ai-copilot-content">
      {/* PromptComposer ------------------------------------------------ */}
      <Card
        data-slot="prompt-composer"
        data-region="prompt"
        data-slot-region="copilot-region"
        className="border border-border bg-surface p-4"
      >
        <CardContent className="p-0">
          <form
            onSubmit={(event) => event.preventDefault()}
            className="flex flex-col gap-3"
            data-slot="prompt-form"
          >
            <textarea
              id="ai-copilot-prompt"
              name="prompt"
              defaultValue={PROMPT_VALUE}
              rows={2}
              aria-label="我能帮你做什么"
              placeholder="我能帮你做什么？"
              className="min-h-12 w-full resize-none border-0 border-l-2 border-brand/40 bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              data-slot="prompt-input"
            />
            <div
              className="flex flex-wrap items-center justify-between gap-2"
              data-slot="suggested-action-chips"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                {SUGGESTED_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    data-slot="suggested-chip"
                    data-chip-id={action.id}
                    className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border/80 bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <span className="text-brand">
                      <ChipIcon kind={action.icon} />
                    </span>
                    {action.label}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                data-slot="submit-button"
                data-testid="submit-button"
                aria-label="提交提示给 Copilot"
                className="flex size-9 items-center justify-center rounded-full bg-brand text-brand-foreground transition-colors hover:bg-brand/90 focus:outline-none focus:ring-0 focus-visible:ring-0"
              >
                <ArrowUp className="size-4" aria-hidden="true" />
                <span className="sr-only">生成</span>
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* CopilotDashboard ---------------------------------------------- */}
      <section
        aria-labelledby="ai-copilot-dashboard-title"
        data-slot="copilot-dashboard"
        data-region="dashboard"
        data-slot-region="copilot-region"
        className="grid h-[300px] grid-cols-1 gap-3 md:grid-cols-3"
      >
        <h3 id="ai-copilot-dashboard-title" className="sr-only">
          Copilot 控制台
        </h3>

        {/* RecommendedCommands */}
        <Card
          data-slot="recommended-commands"
          className="overflow-hidden border border-border"
        >
          <CardHeader className="px-3 pb-1 pt-2.5">
            <CardTitle className="text-[12px] font-semibold">
              推荐指令
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 px-3 pb-2.5 pt-0">
            {RECOMMENDED_COMMANDS.map((cmd) => (
              <button
                key={cmd.id}
                type="button"
                data-slot="recommended-command"
                data-command-id={cmd.id}
                className="flex min-h-9 items-start gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-surface-muted"
              >
                <RecommendedIcon kind={cmd.icon} tone={cmd.tone} />
                <div className="flex flex-col gap-0">
                  <span className="text-[11px] font-medium text-foreground leading-tight">
                    {cmd.title}
                  </span>
                  <span className="text-[9.5px] leading-tight text-muted-foreground">
                    {cmd.description}
                  </span>
                </div>
              </button>
            ))}
            <button
              type="button"
              data-slot="recommended-view-all"
              className="mt-1 self-center text-[10px] font-medium text-brand hover:underline focus:outline-none"
            >
              查看所有指令 →
            </button>
          </CardContent>
        </Card>

        {/* RecentTasks */}
        <Card data-slot="recent-tasks" className="overflow-hidden border border-border">
          <CardHeader className="px-3 pb-1 pt-2.5">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-[12px] font-semibold">最近任务</CardTitle>
              <button
                type="button"
                data-slot="recent-view-all"
                className="text-[10px] font-medium text-brand hover:underline focus:outline-none"
              >
                查看全部 →
              </button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 px-3 pb-2.5 pt-0">
            {RECENT_TASKS.map((task) => (
              <div
                key={task.id}
                data-slot="recent-task"
                data-task-id={task.id}
                className="flex flex-col gap-0"
              >
                <div className="flex items-start gap-1.5">
                  <FileText
                    className="mt-0.5 size-3.5 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="text-[11px] font-medium text-foreground leading-tight">
                    {task.title}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 pl-5">
                  <span className="text-[9.5px] leading-tight text-muted-foreground">
                    项目：{task.project}
                  </span>
                  <span className="text-[9.5px] leading-tight text-muted-foreground">
                    {task.meta}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ContinuingTasks */}
        <Card
          data-slot="continuing-tasks"
          className="overflow-hidden border border-border"
        >
          <CardHeader className="px-3 pb-1 pt-2.5">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-[12px] font-semibold">继续任务</CardTitle>
              <button
                type="button"
                data-slot="continuing-view-all"
                className="text-[10px] font-medium text-brand hover:underline focus:outline-none"
              >
                查看全部 →
              </button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 px-3 pb-2.5 pt-0">
            {CONTINUING_TASKS.map((task) => {
              const badgeClass = STATUS_BADGE[task.status] ?? STATUS_BADGE.进行中;
              const barClass = STATUS_BAR[task.status] ?? STATUS_BAR.进行中;
              const cardBg =
                task.status === "进行中"
                  ? "bg-violet-50"
                  : task.status === "排队中"
                    ? "bg-amber-50/60"
                    : "bg-emerald-50";
              return (
                <div
                  key={task.id}
                  data-slot="continuing-task"
                  data-task-id={task.id}
                  className={`flex flex-col gap-1 rounded-lg ${cardBg} px-2.5 py-1.5`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-foreground leading-tight">
                      {task.title}
                    </span>
                    <Badge
                      className={`rounded-md border-0 px-1.5 py-0 text-[9px] font-medium ${badgeClass}`}
                    >
                      {task.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9.5px] leading-tight text-muted-foreground">
                      {task.description}
                    </span>
                    {task.progress !== null ? (
                      <span className="text-[9.5px] leading-tight text-muted-foreground">
                        {task.progress}%
                      </span>
                    ) : (
                      <span className="text-[9.5px] leading-tight text-muted-foreground">
                        等待中
                      </span>
                    )}
                  </div>
                  {task.progress !== null && (
                    <div
                      className="h-1 overflow-hidden rounded-full bg-white/60"
                      role="progressbar"
                      aria-valuenow={task.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className={`h-full rounded-full ${barClass}`}
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>

      <div className="grid grid-cols-[1.1fr_0.9fr] gap-3">
        {/* QuickEntries ------------------------------------------------- */}
        <section
          aria-labelledby="ai-copilot-quick-entries-title"
          data-slot="quick-entries"
          data-region="quick-entries"
          data-slot-region="copilot-region"
          className="rounded-lg border border-border p-3"
        >
          <h3
            id="ai-copilot-quick-entries-title"
            className="mb-2 text-[11px] font-semibold text-foreground"
          >
            快捷入口
          </h3>
          <div className="grid grid-cols-6 gap-1">
            {QUICK_ENTRIES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                data-slot="quick-entry"
                data-entry-id={entry.id}
                className="flex flex-col items-center gap-1 rounded-md px-1 py-1 text-center transition-colors hover:bg-surface-muted"
              >
                <span className="text-foreground/70">
                  <QuickIcon kind={entry.icon} />
                </span>
                <span className="text-[10px] font-medium text-foreground leading-tight">
                  {entry.title}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* SmartRecommendation ----------------------------------------- */}
        <section
          aria-labelledby="ai-copilot-smart-recommendation-title"
          data-slot="smart-recommendation"
          data-region="recommendation"
          data-slot-region="copilot-region"
          className="flex flex-col gap-2 rounded-lg border border-border p-3"
        >
          <div className="flex items-center gap-1.5">
            <Lightbulb
              className="size-3.5 text-brand"
              aria-hidden="true"
            />
            <h3
              id="ai-copilot-smart-recommendation-title"
              className="text-[11px] font-semibold text-foreground"
            >
              智能推荐
            </h3>
          </div>
          <p className="text-[10px] leading-snug text-muted-foreground">
            检测到你最近在研究「AI 浏览器」，要我帮你：
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SMART_RECOMMENDATIONS.map((rec) => (
              <button
                key={rec.id}
                type="button"
                data-slot="smart-recommendation-item"
                data-rec-id={rec.id}
                className="rounded-lg border border-brand/30 bg-surface px-2.5 py-1 text-[10px] font-medium text-brand transition-colors hover:bg-brand-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {rec.title}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default AICopilotContent;
