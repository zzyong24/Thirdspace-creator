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
 * This is a client island. The composer is wired to the REAL backend: a
 * submit ensures a per-session AI conversation, posts the USER message,
 * and polls `listMessages` for the assistant reply — produced async by the
 * positioning-aware copilot runner (Claude on the user's subscription).
 *
 * The dashboard chips below the prompt are fixture-driven (via the
 * `buildCopilotViewModel` selector in `@/fixtures/selectors`) but their
 * interactions are now REAL (GAP-COP-1, low-cost做真):
 *   - RecommendedCommands / SmartRecommendation chips fill the composer
 *     (`setPrompt`), feeding straight into the real-backend submit path.
 *   - QuickEntries navigate to their real (creator) routes via `next/link`.
 *   - RecentTasks is backed by the REAL global AI-task feed (ai.tasks.list); it
 *     resolves to an honest empty state on a fresh DB.
 *   - ContinuingTasks is now REAL (GAP-COP-1 做真): it reuses the SAME
 *     ai.tasks.list fetch and filters to the user's cross-project in-progress
 *     tasks (status ∈ {queued, running, awaiting_confirmation}). Each row gets a
 *     「继续」 button that routes to the task's project/stage, derived from
 *     `task.projectId` + `task.taskType` (taskType → stage map below). Tasks
 *     without a `projectId` (global tasks) can't be resumed into a project route,
 *     so their 「继续」 degrades to a disabled state. When the feed is genuinely
 *     empty it renders an honest 「暂无进行中的任务」 empty state — no fixture rows,
 *     no 规划中 badge.
 *
 *     Honest limit (see sharedChangesNeeded): ai.tasks.list returns paginated
 *     {id, projectId, taskType, status, requestedAt} but NOT a per-task resume
 *     anchor (e.g. the conversation/node id to re-open) nor a server-side
 *     status filter. We resume at the stage granularity (project/stage route)
 *     and filter client-side over a single page; a deep-link anchor + a
 *     status-scoped query would make 「继续」 land exactly on the in-flight node.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { buildCopilotViewModel } from "@/fixtures/selectors";
import { client } from "@/lib/contract-client";
import type { BasePageViewModel } from "@/types/view-models";

// ---------------------------------------------------------------------------
// ViewModel — shaped by the `buildCopilotViewModel` selector. The Copilot
// dialog carries richer per-row presentation hints (icon kinds, tones,
// progress) than the shared `AICopilotViewModel`, so the dialog owns this
// extended page-local projection. The selector imports it type-only.
// ---------------------------------------------------------------------------

export interface CopilotContentViewModel extends BasePageViewModel {
  readonly kind: "ai-copilot";
  readonly prompt: string;
  readonly chips: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly icon:
      | "crosshair"
      | "wand"
      | "file-search"
      | "sparkles"
      | "image"
      | "line-chart";
  }>;
  readonly recommendedCommands: ReadonlyArray<{
    readonly id: string;
    readonly icon: "crosshair" | "file" | "file-search" | "sparkles" | "line-chart";
    readonly tone: "pink" | "violet" | "mint" | "orange" | "indigo";
    readonly title: string;
    readonly description: string;
  }>;
  readonly recentTasks: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly project: string;
    readonly meta: string;
  }>;
  readonly continuingTasks: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly status: "进行中" | "排队中" | "已完成";
    readonly progress: number | null;
    readonly tone: "violet" | "amber" | "emerald";
  }>;
  readonly quickEntries: ReadonlyArray<{
    readonly id: string;
    readonly icon: "plus" | "folder" | "search" | "image" | "send" | "book";
    readonly title: string;
  }>;
  readonly smartRecommendations: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
  }>;
}

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

// Color-keyed badge classes shared by the real 「继续任务」 status mapping below.
const STATUS_BADGE_BASE = {
  violet: "bg-violet-100 text-violet-600",
  amber: "bg-amber-100 text-amber-700",
  emerald: "bg-emerald-100 text-emerald-700",
} as const;

// Quick-entry → real route map. The fixture rows carry a stable `id` (no `href`
// field in the shared VM), so this island owns the id→route mapping rather than
// adding a VM field. Every target is an existing (creator) route. Unmapped ids
// degrade gracefully to the projects index.
const QUICK_ENTRY_HREF: Record<string, string> = {
  "new-project": "/projects/new",
  "open-project": "/projects",
  search: "/search",
  assets: "/assets",
  publish: "/publishing",
  knowledge: "/knowledge",
};

// Small "规划中" (planned) badge. The recent/continuing task lists below are
// fixture-only — Copilot needs a CROSS-project task feed and there is no global
// tasks op (projects.tasks.list is project-scoped; see INTERACTION_SPEC GAP-COP-1
// decision D-COP-a). Rather than render fake progress as if it were live, the
// lists are explicitly labelled 规划中 so nothing misleads the user.
function PlannedBadge() {
  return (
    <Badge
      data-slot="copilot-planned-badge"
      className="rounded-md border-0 bg-muted px-1.5 py-0 text-[9px] font-medium text-muted-foreground"
    >
      规划中
    </Badge>
  );
}

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

export interface AICopilotContentProps {
  /** Override hook for tests; defaults to the production selector. */
  readonly viewModel?: CopilotContentViewModel;
}

interface CopilotMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly text: string;
}

// The wire shape of an AIMessage as returned by the list op (cast structurally so the
// island has no contract-package type dependency, mirroring other list call sites).
interface WireMessage {
  readonly id: string;
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
}

// The wire shape of an AITask as returned by the global feed op (ai.tasks.list). Cast
// structurally — same convention as WireMessage.
interface WireTask {
  readonly id: string;
  readonly projectId: string | null;
  readonly taskType: string;
  readonly status:
    | "queued"
    | "running"
    | "awaiting_confirmation"
    | "succeeded"
    | "failed"
    | "cancelled";
  readonly requestedAt: string;
}

// AI task status → human label for the 最近任务 feed. Honest mirror of the §12 machine.
const TASK_STATUS_LABEL: Record<WireTask["status"], string> = {
  queued: "排队中",
  running: "进行中",
  awaiting_confirmation: "待确认",
  succeeded: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

// taskType (e.g. "research.analyze") → a readable title for the feed row. The taskType IS
// the title surface the copilot shows (spec: {id,title|taskType,...}).
function taskTitle(t: WireTask): string {
  return t.taskType;
}

// In-progress statuses that belong in the 「继续任务」 feed. A user can resume any
// task that is queued / running / awaiting their confirmation; terminal states
// (succeeded/failed/cancelled) live in the 最近任务 feed instead.
const CONTINUING_STATUSES: ReadonlySet<WireTask["status"]> = new Set([
  "queued",
  "running",
  "awaiting_confirmation",
]);

// taskType prefix (the segment before the first ".") → the creator project STAGE
// route segment that owns that node. Anchored to where each AI node island lives:
//   research.* → research workbench   (research.gather / research.analyze)
//   topic.*    → planning             (topic.generate)
//   script.*   → script editor        (script.draft / script.rewrite)
//   material.* → production           (material.match)
//   publish.*  → publishing           (publish.platform_adapt)
//   review.*   → review               (review.analyze)
// Unknown prefixes degrade to the project root (the stepper lets the user pick up
// from there) rather than guessing a wrong stage.
const TASK_TYPE_STAGE: Record<string, string> = {
  research: "research",
  topic: "planning",
  script: "script",
  material: "production",
  publish: "publishing",
  review: "review",
};

// Derive the 「继续」 route for an in-progress task from projectId + taskType. Returns
// null when the task has no projectId (a global task with no project route to resume
// into — the button degrades to disabled). Resume granularity is the stage route; a
// deep-link anchor would need a new resume field on ai.tasks.list (see sharedChangesNeeded).
function resumeHref(t: WireTask): string | null {
  if (!t.projectId) return null;
  const prefix = t.taskType.split(".")[0] ?? "";
  const stage = TASK_TYPE_STAGE[prefix];
  return stage
    ? `/projects/${t.projectId}/${stage}`
    : `/projects/${t.projectId}`;
}

// Status → continuing-card tone/badge (honest mirror of the §12 machine, no fake progress).
const CONTINUING_BADGE: Record<string, { label: string; badge: string; bg: string }> = {
  queued: { label: "排队中", badge: STATUS_BADGE_BASE.amber, bg: "bg-amber-50/60" },
  running: { label: "进行中", badge: STATUS_BADGE_BASE.violet, bg: "bg-violet-50" },
  awaiting_confirmation: {
    label: "待确认",
    badge: STATUS_BADGE_BASE.amber,
    bg: "bg-amber-50/60",
  },
};

const POLL_INTERVAL_MS = 3000;
// ~4min — the assistant reply runs a real Claude subprocess (subscription) whose startup
// + reasoning can take 1–3min; the poll window must comfortably outlast it (verified e2e:
// a positioning-aware reply landed well past 60s).
const MAX_POLLS = 80;

export function AICopilotContent({ viewModel }: AICopilotContentProps = {}) {
  const vm = viewModel ?? buildCopilotViewModel();
  const router = useRouter();

  // Controlled composer wired to the REAL backend. The first submit ensures a
  // conversation exists (reused for the session); each submit posts the USER message,
  // optimistically renders the user bubble, then polls listMessages until a real
  // assistant reply (produced async by the positioning-aware copilot runner) appears.
  const [prompt, setPrompt] = React.useState<string>(vm.prompt);
  const [messages, setMessages] = React.useState<ReadonlyArray<CopilotMessage>>(
    () =>
      vm.prompt.trim().length > 0
        ? [{ id: "seed-user", role: "user", text: vm.prompt }]
        : [],
  );
  const [thinking, setThinking] = React.useState(false);
  const [timedOut, setTimedOut] = React.useState(false);
  const conversationIdRef = React.useRef<string | null>(null);
  const submissionRef = React.useRef(0);
  const cancelledRef = React.useRef(false);

  React.useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    [],
  );

  // GAP-COP-feed: 最近任务 is now backed by the REAL global task feed (ai.tasks.list) —
  // the user's cross-project AI tasks, newest first. `recentTasks` is null while loading,
  // [] when the feed is genuinely empty (honest empty state — no fixture rows).
  const [recentTasks, setRecentTasks] = React.useState<
    ReadonlyArray<WireTask> | null
  >(null);
  React.useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const rows = (await client.listAITasks({
          params: undefined,
          query: { page: 1, pageSize: 6 },
          body: undefined,
        })) as unknown as ReadonlyArray<WireTask> | null | undefined;
        // null→[] 收敛:若 op 成功 resolve 但返回 null/undefined(空 DB 的某些 transport
        // 路径),仍要把状态推进到空数组,否则 spinner 会一直转。empty array 触发诚实空态。
        if (active) setRecentTasks(rows ?? []);
      } catch {
        // Feed unavailable (e.g. unauthenticated dispatch) — fall back to an empty,
        // honest feed rather than fixture rows.
        if (active) setRecentTasks([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // GAP-COP-1 做真: 「继续任务」 reuses the SAME ai.tasks.list fetch (no second
  // round-trip) and filters to the user's CROSS-project in-progress tasks
  // (queued / running / awaiting_confirmation). `null` while loading, `[]` when
  // there is genuinely nothing in flight → honest empty state.
  const continuingTasks = React.useMemo<ReadonlyArray<WireTask> | null>(() => {
    if (recentTasks === null) return null;
    return recentTasks.filter((t) => CONTINUING_STATUSES.has(t.status));
  }, [recentTasks]);

  const isEmpty = prompt.trim().length === 0;

  // Ensure a single per-session conversation. Created lazily on first submit and reused.
  const ensureConversation = React.useCallback(async (): Promise<string> => {
    if (conversationIdRef.current) return conversationIdRef.current;
    const conversation = (await client.createConversation({
      params: undefined,
      query: undefined,
      body: { title: "AI 助手" },
    })) as { id: string };
    conversationIdRef.current = conversation.id;
    return conversation.id;
  }, []);

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const value = prompt.trim();
      if (value.length === 0 || thinking) return;
      const seq = (submissionRef.current += 1);
      // Optimistically render the user bubble + clear the composer.
      setMessages((prev) => [
        ...prev,
        { id: `u-${seq}`, role: "user", text: value },
      ]);
      setPrompt("");
      setTimedOut(false);
      setThinking(true);
      try {
        const conversationId = await ensureConversation();
        const baseline = (await client.listMessages({
          params: { conversationId },
          query: undefined,
          body: undefined,
        })) as unknown as ReadonlyArray<WireMessage>;
        const baselineAssistant = baseline.filter(
          (m) => m.role === "assistant",
        ).length;
        await client.createMessage({
          params: { conversationId },
          query: undefined,
          body: { content: value },
        });
        // Poll until a NEW assistant reply (one more than baseline) lands.
        for (let i = 0; i < MAX_POLLS; i++) {
          if (cancelledRef.current) return;
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          if (cancelledRef.current) return;
          const rows = (await client.listMessages({
            params: { conversationId },
            query: undefined,
            body: undefined,
          })) as unknown as ReadonlyArray<WireMessage>;
          const assistantRows = rows.filter((m) => m.role === "assistant");
          if (assistantRows.length > baselineAssistant) {
            // Render the real thread from the fetched messages (drop system rows).
            setMessages(
              rows
                .filter((m) => m.role === "user" || m.role === "assistant")
                .map((m) => ({
                  id: m.id,
                  role: m.role as "user" | "assistant",
                  text: m.content,
                })),
            );
            setThinking(false);
            return;
          }
        }
        // Budget exhausted — leave the optimistic user bubble + a gentle note.
        setTimedOut(true);
        setThinking(false);
      } catch {
        setTimedOut(true);
        setThinking(false);
      }
    },
    [prompt, thinking, ensureConversation],
  );

  return (
    <div className="flex flex-col gap-4" data-slot="ai-copilot-content">
      {/* CopilotHeader ------------------------------------------------- */}
      <div data-slot="copilot-header" className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="inline-flex size-8 items-center justify-center rounded-lg bg-brand-soft text-brand"
        >
          <Sparkles className="size-4" />
        </span>
        <div className="flex flex-col">
          <h2
            data-slot="copilot-header-title"
            className="text-sm font-semibold text-foreground"
          >
            AI 助手
          </h2>
          <p className="text-[11px] text-muted-foreground">
            描述你的目标，我来帮你规划下一步
          </p>
        </div>
      </div>

      {/* PromptComposer ------------------------------------------------ */}
      <Card
        data-slot="prompt-composer"
        data-region="prompt"
        data-slot-region="copilot-region"
        className="border border-border bg-surface p-4"
      >
        <CardContent className="flex flex-col gap-3 p-0">
          {messages.length > 0 ? (
            <ol
              data-slot="copilot-messages"
              aria-label="助手活动记录"
              className="flex flex-col gap-1.5"
            >
              {messages.map((message) => (
                <li
                  key={message.id}
                  data-slot="copilot-message"
                  data-role={message.role}
                  className={
                    message.role === "user"
                      ? "self-end rounded-lg bg-brand-soft px-2.5 py-1.5 text-[11px] text-foreground"
                      : "self-start rounded-lg bg-surface-muted px-2.5 py-1.5 text-[11px] text-muted-foreground"
                  }
                >
                  {message.text}
                </li>
              ))}
              {thinking ? (
                <li
                  data-slot="copilot-thinking"
                  aria-live="polite"
                  className="flex items-center gap-1.5 self-start rounded-lg bg-surface-muted px-2.5 py-1.5 text-[11px] text-muted-foreground"
                >
                  <span className="size-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                  助手思考中…
                </li>
              ) : null}
              {timedOut ? (
                <li
                  data-slot="copilot-timeout"
                  className="self-start rounded-lg bg-surface-muted px-2.5 py-1.5 text-[11px] text-muted-foreground"
                >
                  助手还在思考，稍后刷新查看回复。
                </li>
              ) : null}
            </ol>
          ) : null}
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-3"
            data-slot="prompt-form"
          >
            <textarea
              id="ai-copilot-prompt"
              name="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
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
                {vm.chips.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => setPrompt(action.label)}
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
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPrompt("")}
                  disabled={isEmpty}
                  data-slot="prompt-clear"
                  aria-label="清空输入"
                  className="inline-flex h-8 items-center rounded-xl border border-border/80 bg-surface px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  清空
                </button>
                <button
                  type="submit"
                  disabled={isEmpty || thinking}
                  data-slot="submit-button"
                  data-testid="submit-button"
                  aria-label="提交提示给 Copilot"
                  className="flex size-9 items-center justify-center rounded-full bg-brand text-brand-foreground transition-colors hover:bg-brand/90 focus:outline-none focus:ring-0 focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowUp className="size-4" aria-hidden="true" />
                  <span className="sr-only">生成</span>
                </button>
              </div>
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
            {vm.recommendedCommands.map((cmd) => (
              <button
                key={cmd.id}
                type="button"
                onClick={() => setPrompt(cmd.title)}
                data-slot="recommended-command"
                data-command-id={cmd.id}
                className="flex min-h-9 items-start gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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
            <span
              data-slot="recommended-view-all"
              className="mt-1 flex items-center justify-center gap-1 text-[10px] font-medium text-muted-foreground"
            >
              查看所有指令
              <PlannedBadge />
            </span>
          </CardContent>
        </Card>

        {/* RecentTasks — REAL global AI-task feed (GAP-COP-feed / ai.tasks.list). */}
        <Card data-slot="recent-tasks" className="overflow-hidden border border-border">
          <CardHeader className="px-3 pb-1 pt-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-[12px] font-semibold">最近任务</CardTitle>
              </div>
              <Link
                href="/copilot"
                data-slot="recent-view-all"
                className="text-[10px] font-medium text-muted-foreground hover:text-foreground"
              >
                查看全部
              </Link>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 px-3 pb-2.5 pt-0">
            {recentTasks === null ? (
              <span
                data-slot="recent-tasks-loading"
                className="text-[10px] leading-tight text-muted-foreground"
              >
                加载中…
              </span>
            ) : recentTasks.length === 0 ? (
              <span
                data-slot="recent-tasks-empty"
                className="text-[10px] leading-tight text-muted-foreground"
              >
                暂无 AI 任务，发起一个创作节点后会出现在这里。
              </span>
            ) : (
              recentTasks.map((task) => (
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
                      {taskTitle(task)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pl-5">
                    <span className="text-[9.5px] leading-tight text-muted-foreground">
                      项目：{task.projectId ?? "—"}
                    </span>
                    <span className="text-[9.5px] leading-tight text-muted-foreground">
                      {TASK_STATUS_LABEL[task.status]}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* ContinuingTasks — REAL cross-project in-progress feed (GAP-COP-1 / ai.tasks.list). */}
        <Card
          data-slot="continuing-tasks"
          className="overflow-hidden border border-border"
        >
          <CardHeader className="px-3 pb-1 pt-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-[12px] font-semibold">继续任务</CardTitle>
              </div>
              <Link
                href="/copilot"
                data-slot="continuing-view-all"
                className="text-[10px] font-medium text-muted-foreground hover:text-foreground"
              >
                查看全部
              </Link>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 px-3 pb-2.5 pt-0">
            {continuingTasks === null ? (
              <span
                data-slot="continuing-tasks-loading"
                className="text-[10px] leading-tight text-muted-foreground"
              >
                加载中…
              </span>
            ) : continuingTasks.length === 0 ? (
              <span
                data-slot="continuing-tasks-empty"
                className="text-[10px] leading-tight text-muted-foreground"
              >
                暂无进行中的任务。
              </span>
            ) : (
              continuingTasks.map((task) => {
                const meta =
                  CONTINUING_BADGE[task.status] ?? CONTINUING_BADGE.running;
                const href = resumeHref(task);
                return (
                  <div
                    key={task.id}
                    data-slot="continuing-task"
                    data-task-id={task.id}
                    className={`flex flex-col gap-1 rounded-lg ${meta.bg} px-2.5 py-1.5`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-foreground leading-tight">
                        {taskTitle(task)}
                      </span>
                      <Badge
                        className={`rounded-md border-0 px-1.5 py-0 text-[9px] font-medium ${meta.badge}`}
                      >
                        {meta.label}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9.5px] leading-tight text-muted-foreground">
                        项目：{task.projectId ?? "—"}
                      </span>
                      <button
                        type="button"
                        data-slot="continuing-resume"
                        data-task-id={task.id}
                        disabled={href === null}
                        title={
                          href === null
                            ? "该任务未关联项目，暂无法继续"
                            : undefined
                        }
                        onClick={() => {
                          if (href) router.push(href);
                        }}
                        className="inline-flex h-6 items-center rounded-md border border-brand/30 bg-surface px-2 text-[9.5px] font-medium text-brand transition-colors hover:bg-brand-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        继续
                      </button>
                    </div>
                  </div>
                );
              })
            )}
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
            {vm.quickEntries.map((entry) => (
              <Link
                key={entry.id}
                href={QUICK_ENTRY_HREF[entry.id] ?? "/projects"}
                data-slot="quick-entry"
                data-entry-id={entry.id}
                className="flex flex-col items-center gap-1 rounded-md px-1 py-1 text-center transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <span className="text-foreground/70">
                  <QuickIcon kind={entry.icon} />
                </span>
                <span className="text-[10px] font-medium text-foreground leading-tight">
                  {entry.title}
                </span>
              </Link>
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
            {vm.smartRecommendations.map((rec) => (
              <button
                key={rec.id}
                type="button"
                onClick={() => setPrompt(rec.title)}
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
