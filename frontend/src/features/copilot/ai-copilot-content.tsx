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
  FileText,
  ListChecks,
  PenLine,
  Sparkles,
  TrendingUp,
  Wand2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
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
}> = [
  { id: "analyze", label: "分析机会" },
  { id: "script", label: "生成脚本" },
  { id: "assets", label: "寻找素材" },
  { id: "title", label: "优化标题" },
  { id: "cover", label: "生成封面" },
  { id: "review", label: "发布复盘" },
];

const RECOMMENDED_COMMANDS: ReadonlyArray<{
  readonly id: string;
  readonly icon: "wand" | "book" | "file" | "trending";
  readonly title: string;
  readonly description: string;
}> = [
  {
    id: "research",
    icon: "wand",
    title: "生成竞品分析",
    description: "基于当前项目主题搜集近 30 天同类爆款",
  },
  {
    id: "thesis",
    icon: "book",
    title: "梳理内容合同",
    description: "为下一个 Output 自动生成 4 张合同卡",
  },
  {
    id: "script",
    icon: "file",
    title: "起草脚本大纲",
    description: "结合项目主脚本与平台风格输出 3 个版本",
  },
  {
    id: "publish",
    icon: "trending",
    title: "优化发布排期",
    description: "根据历史表现给出 7 天发布排期建议",
  },
  {
    id: "review",
    icon: "trending",
    title: "发布效果复盘",
    description: "分析发布数据并给出优化建议",
  },
];

const RECENT_TASKS: ReadonlyArray<{
  readonly id: string;
  readonly title: string;
  readonly status: "完成" | "进行中" | "失败";
  readonly meta: string;
}> = [
  {
    id: "task-1",
    title: "AI Native Browser 竞品分析",
    status: "完成",
    meta: "5 分钟前 · 12 条结果",
  },
  {
    id: "task-2",
    title: "短视频脚本大纲 v2",
    status: "进行中",
    meta: "8 分钟前 · 编辑中",
  },
  {
    id: "task-3",
    title: "周报复盘草稿",
    status: "完成",
    meta: "今早 09:42 · 1.2k 字",
  },
  {
    id: "task-4",
    title: "优化标题：AI 浏览器真的来了吗？",
    status: "完成",
    meta: "2 天前",
  },
  {
    id: "task-5",
    title: "复盘视频发布效果",
    status: "完成",
    meta: "3 天前",
  },
];

const CONTINUING_TASKS: ReadonlyArray<{
  readonly id: string;
  readonly title: string;
  readonly progress: number;
}> = [
  { id: "cont-1", title: "整理 AI Native Browser 资料", progress: 64 },
  { id: "cont-2", title: "起草视频脚本结尾段", progress: 38 },
  { id: "cont-3", title: "生成本周发布排期", progress: 82 },
  { id: "cont-4", title: "生成内容策略", progress: 100 },
];

const QUICK_ENTRIES: ReadonlyArray<{
  readonly id: string;
  readonly icon: "sparkles" | "pen" | "list";
  readonly title: string;
  readonly description: string;
}> = [
  {
    id: "new-project",
    icon: "sparkles",
    title: "新建 AI 选题",
    description: "从一条灵感开始",
  },
  {
    id: "draft",
    icon: "pen",
    title: "续写脚本",
    description: "回到上次未完成的章节",
  },
  {
    id: "review",
    icon: "list",
    title: "查看今日待办",
    description: "3 个任务等待处理",
  },
  {
    id: "search",
    icon: "list",
    title: "全局搜索",
    description: "搜索全部创作资料",
  },
  {
    id: "assets",
    icon: "sparkles",
    title: "素材中心",
    description: "管理图片与视频素材",
  },
  {
    id: "knowledge",
    icon: "pen",
    title: "知识库",
    description: "查找沉淀的知识",
  },
];

const SMART_RECOMMENDATIONS: ReadonlyArray<{
  readonly id: string;
  readonly title: string;
  readonly body: string;
}> = [
  {
    id: "rec-1",
    title: "把今天的内容合同加入 Project",
    body: "你昨天生成了 4 张合同卡，可以一键附加到 AI Native Browser 项目。",
  },
  {
    id: "rec-2",
    title: "复盘上一条爆款的发布节奏",
    body: "近 7 天播放最佳的发布于周三 20:15，建议复用时段。",
  },
];

// ---------------------------------------------------------------------------
// Icon helper
// ---------------------------------------------------------------------------

function ActionIcon({ kind }: { kind: "wand" | "book" | "file" | "trending" }) {
  switch (kind) {
    case "wand":
      return <Wand2 className="size-4 text-brand" aria-hidden="true" />;
    case "book":
      return <BookOpenText className="size-4 text-brand" aria-hidden="true" />;
    case "file":
      return <FileText className="size-4 text-brand" aria-hidden="true" />;
    case "trending":
      return <TrendingUp className="size-4 text-brand" aria-hidden="true" />;
  }
}

function QuickIcon({ kind }: { kind: "sparkles" | "pen" | "list" }) {
  switch (kind) {
    case "sparkles":
      return <Sparkles className="size-4" aria-hidden="true" />;
    case "pen":
      return <PenLine className="size-4" aria-hidden="true" />;
    case "list":
      return <ListChecks className="size-4" aria-hidden="true" />;
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
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-surface px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <ActionIcon
                      kind={
                        action.id === "analyze"
                          ? "wand"
                          : action.id === "script"
                            ? "file"
                            : action.id === "assets"
                              ? "book"
                              : action.id === "title"
                                ? "trending"
                                : action.id === "cover"
                                  ? "wand"
                                  : "trending"
                      }
                    />
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
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-[12px] font-semibold">
                  推荐指令
                </CardTitle>
                <CardDescription className="text-[10px]">
                  根据当前项目生成的常用操作
                </CardDescription>
              </div>
              <button
                type="button"
                data-slot="recommended-view-all"
                className="text-[10px] font-medium text-brand hover:underline focus:outline-none"
              >
                查看全部 →
              </button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 px-3 pb-2.5 pt-0">
            {RECOMMENDED_COMMANDS.map((cmd) => (
              <button
                key={cmd.id}
                type="button"
                data-slot="recommended-command"
                data-command-id={cmd.id}
                className="flex min-h-9 items-start gap-1.5 rounded-md bg-surface px-1.5 py-1 text-left transition-colors hover:bg-surface-muted"
              >
                <ActionIcon kind={cmd.icon} />
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
          </CardContent>
        </Card>

        {/* RecentTasks */}
        <Card data-slot="recent-tasks" className="overflow-hidden border border-border">
          <CardHeader className="px-3 pb-1 pt-2.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-[12px] font-semibold">最近任务</CardTitle>
                <CardDescription className="text-[10px]">
                  过去 24 小时内的生成记录
                </CardDescription>
              </div>
              <button
                type="button"
                data-slot="recent-view-all"
                className="text-[10px] font-medium text-brand hover:underline focus:outline-none"
              >
                查看全部 →
              </button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 px-3 pb-2.5 pt-0">
            {RECENT_TASKS.map((task) => (
              <div
                key={task.id}
                data-slot="recent-task"
                data-task-id={task.id}
                className="flex items-start justify-between gap-2 rounded-md border border-border bg-surface px-2 py-1"
              >
                <div className="flex flex-col gap-0">
                  <span className="text-[11px] font-medium text-foreground leading-tight">
                    {task.title}
                  </span>
                  <span className="text-[9.5px] leading-tight text-muted-foreground">
                    {task.meta}
                  </span>
                </div>
                <Badge
                  variant={
                    task.status === "完成"
                      ? "secondary"
                      : task.status === "进行中"
                        ? "default"
                        : "destructive"
                  }
                  className="px-1.5 py-0 text-[9px]"
                >
                  {task.status}
                </Badge>
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
              <div>
                <CardTitle className="text-[12px] font-semibold">继续任务</CardTitle>
                <CardDescription className="text-[10px]">
                  跨设备同步进行中的工作
                </CardDescription>
              </div>
              <button
                type="button"
                data-slot="continuing-view-all"
                className="text-[10px] font-medium text-brand hover:underline focus:outline-none"
              >
                查看全部 →
              </button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 px-3 pb-2.5 pt-0">
            {CONTINUING_TASKS.map((task) => (
              <div
                key={task.id}
                data-slot="continuing-task"
                data-task-id={task.id}
                className="flex flex-col gap-1 rounded-md border border-border bg-surface px-2 py-1.5"
              >
                <span className="text-[11px] font-medium text-foreground leading-tight">
                  {task.title}
                </span>
                <div className="flex items-center gap-2">
                  <div
                    className="h-1 flex-1 overflow-hidden rounded-full bg-surface-muted"
                    role="progressbar"
                    aria-valuenow={task.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                  <span className="text-[9.5px] text-muted-foreground">
                    {task.progress}%
                  </span>
                </div>
              </div>
            ))}
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
          className="grid grid-cols-6 gap-1 rounded-lg border border-border p-2"
        >
        <h3 id="ai-copilot-quick-entries-title" className="sr-only">
          快捷入口
        </h3>
          {QUICK_ENTRIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              data-slot="quick-entry"
              data-entry-id={entry.id}
              className="flex flex-col items-center gap-0.5 rounded-md px-1 py-1 text-center transition-colors hover:bg-surface-muted"
            >
              <span className="text-brand">
                <QuickIcon kind={entry.icon} />
              </span>
              <span className="text-[10px] font-medium text-foreground leading-tight">
                {entry.title}
              </span>
            </button>
          ))}
        </section>

        {/* SmartRecommendation ----------------------------------------- */}
        <section
          aria-labelledby="ai-copilot-smart-recommendation-title"
          data-slot="smart-recommendation"
          data-region="recommendation"
          data-slot-region="copilot-region"
          className="flex flex-col gap-1.5 rounded-lg border border-border p-2"
        >
        <h3
          id="ai-copilot-smart-recommendation-title"
          className="text-[10px] font-semibold uppercase tracking-wide text-text-subtle"
        >
          智能推荐
        </h3>
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
                className="rounded-md border border-brand/30 px-2 py-0.5 text-[10px] font-medium text-brand transition-colors hover:bg-brand-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                title={rec.body}
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
