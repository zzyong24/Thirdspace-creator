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
 * This is a client island. T-004 ChatBox slice 1: the composer is now driven by
 * `useChat` (@ai-sdk/react) streaming against `/api/chat` (Vercel AI SDK streamText) —
 * NOT the old createMessage→poll-listMessages loop. A submit `sendMessage({text})`,
 * the reply streams token-by-token, `stop()` aborts mid-stream. The route resolves the
 * 选题编导 (chatbox.topic) skill, injects CreativeContext facets, and exposes the first-wave
 * tools (topic.generate / topic.enrich). Tool results arrive as candidate parts → rendered
 * inline as `ChatCandidateCard` → 人逐条采纳 via the candidates.create confirm gate (AI never
 * writes entities directly, 铁律②). The thread still persists to ai_conversations/ai_messages
 * server-side (the route's onFinish). ChatContext is carried in the transport body (surface
 * layer + data layer wired; functionKey 叠加 left for a later slice).
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
import { useRouter, useSearchParams } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  DefaultChatTransport,
  isToolUIPart,
  getToolName,
  type UIMessage,
} from "ai";
import { ChatCandidateCard, type ChatTopicCandidate } from "./chat-candidate-card";
import {
  ChatDiagnosisCard,
  ChatLearningsCard,
  ChatPositioningCard,
  type ChatDiagnosis,
  type ChatLearningItem,
  type ChatPositioningSuggestion,
} from "./chat-result-cards";
import {
  ArrowUp,
  BookOpenText,
  ChartLine,
  Clock3,
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buildCopilotViewModel } from "@/fixtures/selectors";
import { client } from "@/lib/contract-client";
import type { BasePageViewModel } from "@/types/view-models";
import {
  readStoredConversationId,
  writeStoredConversationId,
  toUIMessages,
  type WireAIMessage,
} from "./conversation-persistence";
import {
  detectMentionQuery,
  filterProjectOptions,
  applyProjectMention,
  type ProjectOption,
  type MentionedProject,
} from "./project-mention";
import { ProjectMentionMenu } from "./project-mention-menu";

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

// The wire shape of an AITask as returned by the global feed op (ai.tasks.list). Cast
// structurally so the island has no contract-package type dependency (mirrors other
// list call sites). The chat thread itself is now driven by useChat's UIMessage (T-004).
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

// ai_conversations 的一行(契约 aiConversationResource 的子集)—— 历史记录面板只需
// id/title/createdAt。结构化 cast,与本 island 其它 list 调用一致(不引 contract 类型依赖)。
interface WireConversation {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
}

// projects.list 的一行(契约 projectResource 的子集)—— @项目引用下拉只需 id/title。结构化 cast,
// 与本 island 其它 list 调用一致(不引 contract 类型依赖)。数据源复用现有只读 op client.listProjects。
interface WireProject {
  readonly id: string;
  readonly title: string;
}

// @项目引用下拉一次展示的最大候选数(过滤后截断,避免长列表)。
const MENTION_MAX_OPTIONS = 8;

// AI task status → human label for the 最近任务 feed. Honest mirror of the §12 machine.
const TASK_STATUS_LABEL: Record<WireTask["status"], string> = {
  queued: "排队中",
  running: "进行中",
  awaiting_confirmation: "待确认",
  succeeded: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

// bug #6:taskType(如 "calibration.diagnose")是机器枚举,用户看不懂。这里给一张中文 label +
// 一句简短副文映射,任务卡显中文标题 + 副文。未知 taskType 回退到原串(诚实兜底,不编一个假中文)。
const TASK_TYPE_LABEL: Record<string, { label: string; sub: string }> = {
  "calibration.diagnose": { label: "编导诊断", sub: "逐维度盲评内容" },
  "topic.generate": { label: "AI 出题", sub: "生成选题候选" },
  "topic.enrich": { label: "选题补全", sub: "补全成完整选题卡" },
  "planning.thesis": { label: "核心论点", sub: "提炼论点树" },
  "review.analyze": { label: "复盘分析", sub: "提炼可复用爆款要素" },
  "positioning.generate": { label: "定位策略", sub: "生成结构化定位提案" },
  "script.draft": { label: "脚本初稿", sub: "起草口播脚本" },
  "script.rewrite": { label: "脚本改写", sub: "按反馈重写脚本" },
  "material.match": { label: "素材匹配", sub: "为脚本匹配素材" },
  "publish.platform_adapt": { label: "发布适配", sub: "适配多平台发布物料" },
  "research.gather_material": { label: "找素材", sub: "收集研究素材" },
  "research.gather": { label: "找素材", sub: "收集研究素材" },
  "research.analyze": { label: "研究分析", sub: "分析研究结论" },
  "copilot.assist": { label: "AI 助手", sub: "对话式创作建议" },
};

// taskType → 中文标题(bug #6)。命中映射用中文 label;否则回退到原 taskType 串(诚实,不伪造)。
function taskTitle(t: WireTask): string {
  return TASK_TYPE_LABEL[t.taskType]?.label ?? t.taskType;
}

// taskType → 中文副文(任务卡第二行)。未命中返回 null(不渲染副文)。
function taskSubtitle(t: WireTask): string | null {
  return TASK_TYPE_LABEL[t.taskType]?.sub ?? null;
}

// 历史会话的时间戳 → 简洁本地时间(YYYY-MM-DD HH:mm)。非法/空串回退原串,不抛。
function formatConvTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
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

// bug #7:status → 既有 Badge 组件的 variant + 中文 label(honest mirror of the §12 machine,
// 无假进度)。复用设计 token(default/secondary/outline),与全局徽章一致,不再手搓 inline 颜色类。
const CONTINUING_STATUS_META: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  queued: { label: "排队中", variant: "outline" },
  running: { label: "进行中", variant: "default" },
  awaiting_confirmation: { label: "待确认", variant: "secondary" },
};

// 一键岛预调(SPEC §3.4)—— 工作台「出题/诊断/分析」等按钮打开 ChatBox 时,在 URL 上带
// surface(页面层)+ fn(按钮层 functionKey)。Copilot 面板读它们装配 ChatContext + 预调该工具。
// functionKey → 一句中文「预调话术」,打开即自动发一轮让模型优先调置顶的专用工具(预调闭环)。
const FUNCTION_KEY_PREFILL: Record<string, string> = {
  "topic.generate": "基于我的定位和真实信号,出一批选题候选。",
  "topic.enrich": "把我刚选的选题补全成完整选题卡。",
  "calibration.diagnose": "对我这条发布前的内容做编导诊断,逐维度盲评并指出优先修改。",
  "review.analyze": "帮我复盘,提炼可复用的爆款要素沉淀成经验。",
  "positioning.generate": "结合我的账号画像,生成/进化一份结构化定位提案。",
};

// 默认页面层(无 URL 指定时)—— 选题编导是最通用的一面。
const DEFAULT_SURFACE = "topics";

// T-029:AI 文本回复用 markdown 富呈现(标题/列表/表格/代码/加粗/引用),替掉纯文本直出。
// 紧凑样式适配对话气泡(text-[11px]);GFM 表格/删除线走 remark-gfm。用户消息仍纯文本(自己打的)。
const MD_COMPONENTS: Components = {
  p: ({ children }) => (
    <p className="mb-1.5 leading-relaxed last:mb-0">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="my-1 ml-3.5 list-disc space-y-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1 ml-3.5 list-decimal space-y-0.5">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => (
    <h1 className="mb-1 mt-2 text-xs font-semibold text-foreground first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-1 mt-2 text-xs font-semibold text-foreground first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-0.5 mt-1.5 text-[11px] font-semibold text-foreground first:mt-0">
      {children}
    </h3>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-brand underline underline-offset-2"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-surface px-1 py-0.5 font-mono text-[10px] text-foreground">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-1 overflow-x-auto rounded-md bg-surface p-2 font-mono text-[10px] text-foreground">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-1 border-l-2 border-border pl-2 text-muted-foreground">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-1 overflow-x-auto">
      <table className="w-full border-collapse text-[10px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border bg-surface-muted px-1.5 py-0.5 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-border px-1.5 py-0.5">{children}</td>
  ),
  hr: () => <hr className="my-2 border-border" />,
};

function ChatMarkdown({ text }: { text: string }) {
  return (
    <div data-slot="copilot-markdown" className="text-[11px] text-muted-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function AICopilotContent({ viewModel }: AICopilotContentProps = {}) {
  const vm = viewModel ?? buildCopilotViewModel();
  const router = useRouter();

  // T-004 ChatBox:useChat 驱动流式对话(替掉旧的 createMessage→轮询 listMessages)。
  // transport 把请求打到 /api/chat(Vercel AI SDK streamText),body 带 ChatContext(三层注入)。
  // slice 2:页面层 surface + 按钮层 functionKey 从 URL 读(一键岛打开时带 ?surface=&fn=),
  // 让同一个全局面板按打开来源装配不同基础 skill + 预调专用工具。回复 token 级流式;可 stop()。
  const searchParams = useSearchParams();
  const surface = searchParams?.get("surface") || DEFAULT_SURFACE;
  const functionKey = searchParams?.get("fn") || undefined;
  // T-027:选中态从 URL 读(一键岛带 ?selKind=&selId=&selTitle=),装进 ChatContext.selection →
  // 后端注入 system + 工具入参兜底,让 Copilot 知道用户"这条"指哪条,不再瞎答/反复索要标题。
  const selKind = searchParams?.get("selKind") || undefined;
  const selId = searchParams?.get("selId") || undefined;
  const selTitle = searchParams?.get("selTitle") || undefined;
  // T-029:次区(推荐指令 / 最近任务 / 继续任务 / 快捷入口)只在「全局助手」模式展示 —— 即右下角
  // 浮标 / ⌘K 全局唤醒(落到默认 surface、无 functionKey、无选中态)。从工作台上下文打开的 surface
  // Copilot 聚焦当前任务,不展示次区(真机反馈:非右下角/全局唤醒不需要下面的推荐指令和全局入口)。
  const showSecondary =
    surface === DEFAULT_SURFACE && !functionKey && !selKind;
  // 会话持久化(本切片):前端持一个 conversationId,放进 transport body(和 chatContext 并列)
  // 让后端续接同一会话;并从 /api/chat 的响应头 `x-conversation-id` 捕获后端 lazy 建/复用的
  // 会话 id 存起来。conversationId 随 surface 切换重置(不同页面各自独立会话)。
  const [conversationId, setConversationId] = React.useState<string | null>(
    null,
  );
  // conversationId 放 ref 供 transport 的 body(Resolvable 函数)读最新值,避免因 body 变化
  // 重建 transport(重建会打断进行中的流)。fetch 包装层用 ref 里的 setter 回写捕获到的 id。
  const conversationIdRef = React.useRef<string | null>(null);
  conversationIdRef.current = conversationId;
  // 捕获到 x-conversation-id 时:更新 state + 按 surface 持久化。surface 用 ref 读最新值,
  // 让 fetch 包装闭包不随 surface 变(同样避免重建 transport)。
  const surfaceRef = React.useRef(surface);
  surfaceRef.current = surface;
  const captureConversationId = React.useCallback((id: string) => {
    if (!id) return;
    if (conversationIdRef.current === id) return;
    conversationIdRef.current = id;
    setConversationId(id);
    writeStoredConversationId(surfaceRef.current, id);
  }, []);

  // @项目引用(T-039b):输入框 @ 选中的项目。存在时等价「选中态项目」注入后端(见下 chatContextBody)。
  // 与 URL 带来的选中态(一键岛)并存时,URL 选中态优先(它是打开来源的强上下文);@ 只在无 URL
  // 选中态时生效,避免"面板从复盘岛打开、用户又 @ 了别的项目"两者打架。
  const [mentionedProject, setMentionedProject] =
    React.useState<MentionedProject | null>(null);

  const chatContextBody = React.useMemo(() => {
    const chatContext: {
      surface: string;
      functionKey?: string;
      projectId?: string;
      selection?: { kind: string; ids: string[]; label?: string };
    } = { surface };
    if (functionKey) chatContext.functionKey = functionKey;
    if (selKind && selId) {
      chatContext.selection = {
        kind: selKind,
        ids: [selId],
        ...(selTitle ? { label: selTitle } : {}),
      };
      // T-039a:选中态 kind=project 时,selId 就是当前项目 id —— 顺带装进 chatContext.projectId,
      // 让后端复盘/项目相关 facet 能读到「这一条作品」的真文案/标题/数据/评论(原来没带 projectId →
      // 后端恒 null → 复盘只能账号级泛论)。复盘一键岛(review-analyze-island)正是以 kind=project 打开。
      if (selKind === "project") {
        chatContext.projectId = selId;
      }
    } else if (mentionedProject) {
      // T-039b @项目引用:无 URL 选中态时,把 @ 选中的项目当「选中态项目」注入 —— 复用 T-039a 机制
      // (kind=project → selection.label 进 system + projectId 让后端项目 facet 读到这条作品的真材料)。
      chatContext.selection = {
        kind: "project",
        ids: [mentionedProject.id],
        label: mentionedProject.title,
      };
      chatContext.projectId = mentionedProject.id;
    }
    return { chatContext };
  }, [surface, functionKey, selKind, selId, selTitle, mentionedProject]);
  const transport = React.useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/chat",
        // body 是 Resolvable(每次发请求求值):把当前 conversationId(ref 读最新)和 chatContext
        // 一起带上。首轮 conversationId 为 null → 不带,后端 lazy 建;拿到响应头后续轮带上续接。
        body: () => ({
          ...chatContextBody,
          ...(conversationIdRef.current
            ? { conversationId: conversationIdRef.current }
            : {}),
        }),
        // useChat 不直接暴露响应头 → 在 transport 的 fetch 层包一层,读 `x-conversation-id`
        // 后原样把 Response 交回给 SDK(不改流)。这是本 SDK 版本捕获会话 id 最稳的办法。
        fetch: async (input, init) => {
          const res = await fetch(input as RequestInfo, init);
          try {
            const cid = res.headers.get("x-conversation-id");
            if (cid) captureConversationId(cid);
          } catch {
            /* 读头失败不影响流式 */
          }
          return res;
        },
      }),
    [chatContextBody, captureConversationId],
  );
  const { messages, sendMessage, status, stop, setMessages } = useChat({
    transport,
  });
  const streaming = status === "streaming" || status === "submitted";

  // 一键岛预调(SPEC §3.4):面板带 fn 打开 且对话尚空 → 自动发一轮「预调话术」,让模型本轮
  // 优先调被 functionKey 置顶的专用工具(出题/诊断/分析的真实闭环)。只触发一次(对话已有消息
  // 或没 fn 时不动),避免每次渲染重复发。
  const prefilledRef = React.useRef(false);
  React.useEffect(() => {
    if (prefilledRef.current) return;
    if (!functionKey || messages.length > 0 || streaming) return;
    const text = FUNCTION_KEY_PREFILL[functionKey];
    if (!text) return;
    prefilledRef.current = true;
    void sendMessage({ text });
  }, [functionKey, messages.length, streaming, sendMessage]);

  // 受控输入(useChat v7 不再托管 input;自管 + sendMessage({text}))。
  const [prompt, setPrompt] = React.useState<string>(vm.prompt);
  const isEmpty = prompt.trim().length === 0;

  const submit = React.useCallback(() => {
    const value = prompt.trim();
    if (value.length === 0 || streaming) return;
    void sendMessage({ text: value });
    setPrompt("");
  }, [prompt, streaming, sendMessage]);

  // 切到某个会话:拉它的历史消息 → 映射成 UIMessage → 喂 setMessages(读回);同时把
  // conversationId 设为它 + 按 surface 持久化(后续发言续接这个会话)。读回失败(会话被删/
  // 网络错)→ 静默降级(不清空当前对话、不弹错),只在控制台留日志。既服务「二次进入读回」,
  // 也服务「历史记录点某条切过去」。
  const loadConversation = React.useCallback(
    async (id: string): Promise<boolean> => {
      if (!id) return false;
      try {
        // 注意:契约 listMessages 只声明 params(conversationId),未声明分页 query(与 listConversations
        // 不同)—— 故 query 传 undefined,拿该会话全部消息(读回历史)。
        const rows = (await client.listMessages({
          params: { conversationId: id },
          query: undefined,
          body: undefined,
        })) as unknown as ReadonlyArray<WireAIMessage> | null | undefined;
        const mapped = toUIMessages(rows ?? []);
        setMessages(mapped);
        conversationIdRef.current = id;
        setConversationId(id);
        writeStoredConversationId(surfaceRef.current, id);
        return true;
      } catch (err) {
        console.error("[copilot] load conversation failed:", err);
        return false;
      }
    },
    [setMessages],
  );

  // 二次进入读回(SPEC 本切片):组件挂载 / surface 切换时,若该 surface 存过 conversationId
  // → 读回其消息填充对话。仅客户端读 localStorage(SSR 安全)。切 surface 会重置对话:先清空,
  // 再按新 surface 的存档读回(没有则保持空会话)。prefilledRef 一并复位,让新 surface 的
  // 一键岛预调仍可触发一次。
  const hydratedForSurfaceRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (hydratedForSurfaceRef.current === surface) return;
    hydratedForSurfaceRef.current = surface;
    const stored = readStoredConversationId(surface);
    // surface 变了:重置会话态(清 id + ref)。有存档则读回,否则留空会话。
    conversationIdRef.current = stored;
    setConversationId(stored);
    if (stored) {
      // 有存档 → 抑制一键岛预调(prefilledRef=true):读回是「续上次」,不该再自动发预调话术,
      // 否则每次带 ?fn 二次进入都会往历史里追加一条重复的预调。
      prefilledRef.current = true;
      void (async () => {
        const ok = await loadConversation(stored);
        // 读回失败(会话被删)→ 清掉这条失效存档,降级为干净空会话,并放开预调(可重新起一轮)。
        if (!ok) {
          writeStoredConversationId(surface, null);
          conversationIdRef.current = null;
          setConversationId(null);
          setMessages([]);
          prefilledRef.current = false;
        }
      })();
    } else {
      // 无存档 → 干净空会话,放开一键岛预调(新 surface 首次进入可自动预调一次)。
      prefilledRef.current = false;
      setMessages([]);
    }
    // loadConversation 依赖稳定;surface 变化触发读回。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface]);

  // 历史记录(SPEC 本切片,做实占位按钮):点「历史记录」→ 拉过往会话列表(标题+时间),
  // 点某条 → 切到该会话 + 读回消息。open 时懒加载一次(避免每次挂载都打请求)。
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [historyRows, setHistoryRows] = React.useState<
    ReadonlyArray<WireConversation> | null
  >(null);
  const toggleHistory = React.useCallback(() => {
    setHistoryOpen((prev) => {
      const next = !prev;
      if (next && historyRows === null) {
        void (async () => {
          try {
            const rows = (await client.listConversations({
              params: undefined,
              query: { page: 1, pageSize: 20 },
              body: undefined,
            })) as unknown as ReadonlyArray<WireConversation> | null | undefined;
            setHistoryRows(rows ?? []);
          } catch (err) {
            // 列表拉取失败 → 诚实空列表(不弹错)。
            console.error("[copilot] list conversations failed:", err);
            setHistoryRows([]);
          }
        })();
      }
      return next;
    });
  }, [historyRows]);
  const pickHistory = React.useCallback(
    (id: string) => {
      setHistoryOpen(false);
      void loadConversation(id);
    },
    [loadConversation],
  );
  // 新对话:清当前会话 id + 清消息 + 清该 surface 的存档,下次发言由后端 lazy 建新会话。
  // prefilledRef 复位,让「新对话」后一键岛预调仍可触发一次。
  const startNewConversation = React.useCallback(() => {
    setHistoryOpen(false);
    conversationIdRef.current = null;
    setConversationId(null);
    writeStoredConversationId(surfaceRef.current, null);
    setMessages([]);
    prefilledRef.current = false;
  }, [setMessages]);

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

  // ── @项目引用(T-039b)────────────────────────────────────────────────────
  // 项目列表懒加载:首次输入 `@` 触发一次拉取(复用现有只读 op client.listProjects,不新造 repo
  // 方法)。null=未加载/加载中,[]=空库(诚实引导先建项目),有值=可补全的候选。
  const [projectOptions, setProjectOptions] = React.useState<
    ReadonlyArray<ProjectOption> | null
  >(null);
  const projectsRequestedRef = React.useRef(false);
  const ensureProjectsLoaded = React.useCallback(() => {
    if (projectsRequestedRef.current) return;
    projectsRequestedRef.current = true;
    void (async () => {
      try {
        const rows = (await client.listProjects({
          params: undefined,
          query: { page: 1, pageSize: 100, sort: "updatedAt" },
          body: undefined,
        })) as unknown as ReadonlyArray<WireProject> | null | undefined;
        setProjectOptions(
          (rows ?? []).map((p) => ({ id: p.id, title: p.title })),
        );
      } catch (err) {
        // 拉取失败 → 诚实空列表(下拉显示空态引导),不弹错、不摆假行。
        console.error("[copilot] list projects failed:", err);
        setProjectOptions([]);
      }
    })();
  }, []);

  // @ 提及态:下拉是否开、当前 @query 的 [start,end) 范围、query 串、键盘高亮下标。
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [mentionOpen, setMentionOpen] = React.useState(false);
  const [mentionRange, setMentionRange] = React.useState<{
    start: number;
    end: number;
  } | null>(null);
  const [mentionQuery, setMentionQuery] = React.useState("");
  const [mentionIndex, setMentionIndex] = React.useState(0);

  // 过滤后的候选(空库时给空数组;截断到 MENTION_MAX_OPTIONS)。empty 标识用于诚实空态文案。
  const mentionOptions = React.useMemo<ReadonlyArray<ProjectOption>>(() => {
    if (!projectOptions) return [];
    return filterProjectOptions(projectOptions, mentionQuery).slice(
      0,
      MENTION_MAX_OPTIONS,
    );
  }, [projectOptions, mentionQuery]);
  const mentionLibraryEmpty = projectOptions !== null && projectOptions.length === 0;

  // textarea 值/光标变化 → 重算是否处在 @提及 token 内(纯函数 detectMentionQuery)。
  // 命中 → 开下拉 + 记范围/query + 懒加载项目;未命中 → 关下拉。高亮下标复位到 0。
  const syncMentionState = React.useCallback(
    (value: string, caret: number) => {
      const m = detectMentionQuery(value, caret);
      if (m.active) {
        ensureProjectsLoaded();
        setMentionOpen(true);
        setMentionRange({ start: m.start, end: m.end });
        setMentionQuery(m.query);
        setMentionIndex(0);
      } else {
        setMentionOpen(false);
        setMentionRange(null);
        setMentionQuery("");
      }
    },
    [ensureProjectsLoaded],
  );

  const handlePromptChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setPrompt(value);
      syncMentionState(value, e.target.selectionStart ?? value.length);
    },
    [syncMentionState],
  );

  // 选中某项目:把「@query」替换成「@项目标题 」+ 落到 chatContext(mentionedProject)。
  // 用受控值 + setSelectionRange 把光标移到插入 chip 之后(下一 tick,等 DOM 应用新值)。
  const pickMentionProject = React.useCallback(
    (project: ProjectOption) => {
      const range = mentionRange;
      if (!range) return;
      const applied = applyProjectMention(prompt, range, project);
      setPrompt(applied.value);
      setMentionedProject({ id: project.id, title: project.title });
      setMentionOpen(false);
      setMentionRange(null);
      setMentionQuery("");
      // 回焦 + 光标定位到插入点后(下一帧,确保受控 value 已提交)。
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          try {
            el.setSelectionRange(applied.caret, applied.caret);
          } catch {
            /* 某些环境不支持 setSelectionRange —— 不影响已插入的文本/注入 */
          }
        }
      });
    },
    [mentionRange, prompt],
  );

  // 下拉开启时拦截键盘:↑/↓ 移高亮、Enter/Tab 选中当前高亮项、Esc 关闭。未开启则透传(不干扰提交)。
  const handlePromptKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!mentionOpen || mentionOptions.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionOptions.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex(
          (i) => (i - 1 + mentionOptions.length) % mentionOptions.length,
        );
      } else if (e.key === "Enter" || e.key === "Tab") {
        // 下拉开着时 Enter 选中提及项(而非提交表单)——阻止默认提交。
        e.preventDefault();
        const opt = mentionOptions[mentionIndex] ?? mentionOptions[0];
        if (opt) pickMentionProject(opt);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setMentionOpen(false);
      }
    },
    [mentionOpen, mentionOptions, mentionIndex, pickMentionProject],
  );

  return (
    // bug #5:面板布局重排 —— 整体撑满浮层高度(min-h-0 让内部可正确收缩),对话区做主区(flex-1
    // 占满、消息流自身滚动),下面的「控制台/快捷入口/智能推荐」收进一个有界、可滚的次区,不再挤占对话。
    <div
      className="flex h-full min-h-0 flex-col gap-3"
      data-slot="ai-copilot-content"
    >
      {/* CopilotHeader ------------------------------------------------- */}
      <div
        data-slot="copilot-header"
        className="relative flex shrink-0 items-center gap-2"
      >
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
        {/* 历史记录 + 新对话(SPEC 本切片:占位按钮做实)。历史记录 → 拉过往会话列表,点某条
            切过去 + 读回;新对话 → 清空当前会话(下次发言后端 lazy 建新会话)。 */}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={startNewConversation}
            data-slot="ai-copilot-new"
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            新对话
          </button>
          <button
            type="button"
            onClick={toggleHistory}
            data-slot="ai-copilot-history"
            aria-haspopup="menu"
            aria-expanded={historyOpen}
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Clock3 className="size-3.5" aria-hidden="true" />
            历史记录
          </button>
        </div>
        {/* 历史会话下拉面板 —— 简洁列表(标题 + 时间),点某条加载。空/加载各有诚实态。 */}
        {historyOpen && (
          <div
            data-slot="copilot-history-panel"
            role="menu"
            aria-label="历史会话"
            className="absolute right-0 top-full z-20 mt-1 max-h-64 w-64 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-lg"
          >
            {historyRows === null ? (
              <p
                data-slot="copilot-history-loading"
                className="px-2 py-2 text-[11px] text-muted-foreground"
              >
                加载中…
              </p>
            ) : historyRows.length === 0 ? (
              <p
                data-slot="copilot-history-empty"
                className="px-2 py-2 text-[11px] text-muted-foreground"
              >
                暂无历史会话。
              </p>
            ) : (
              historyRows.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="menuitem"
                  onClick={() => pickHistory(c.id)}
                  data-slot="copilot-history-item"
                  data-conversation-id={c.id}
                  data-active={c.id === conversationId ? "true" : undefined}
                  className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-muted focus:outline-none focus-visible:bg-surface-muted data-[active=true]:bg-brand-soft"
                >
                  <span className="w-full truncate text-[11px] font-medium text-foreground">
                    {c.title || "未命名会话"}
                  </span>
                  <span className="text-[9.5px] text-muted-foreground">
                    {formatConvTime(c.createdAt)}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Conversation region (主区,bug #5)—— 消息流 + 输入框。flex-1 占满浮层主体,消息区
          自身滚动,输入框 pin 在底部。对话才是 Copilot 的核心,放大、可读、可滚。 */}
      <div
        data-slot="copilot-conversation"
        data-region="prompt"
        data-slot-region="copilot-region"
        className="flex min-h-0 flex-1 flex-col gap-2"
      >
        {/* 消息流(可滚)—— 给一个 min-h 下限,保证对话区是视觉主区,不被次区压扁(bug #5)。 */}
        <div
          data-slot="copilot-message-scroll"
          className="min-h-[220px] flex-1 overflow-y-auto rounded-2xl border border-border bg-surface-subtle/40 p-3"
        >
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
                      ? "flex flex-col gap-1 self-end"
                      : "flex flex-col gap-1 self-start"
                  }
                >
                  {/* 文本 part:用户消息纯文本气泡;AI 回复走 markdown 富呈现(T-029:标题/列表/
                      表格/代码/加粗,替掉纯文本直出)。 */}
                  {(() => {
                    const text = message.parts
                      .filter((p) => p.type === "text")
                      .map((p) => p.text)
                      .join("");
                    if (!text.trim()) return null;
                    return message.role === "user" ? (
                      <span
                        data-slot="copilot-message-text"
                        className="rounded-lg bg-brand-soft px-2.5 py-1.5 text-[11px] text-foreground"
                      >
                        {text}
                      </span>
                    ) : (
                      <div
                        data-slot="copilot-message-text"
                        className="rounded-lg bg-surface-muted px-2.5 py-1.5"
                      >
                        <ChatMarkdown text={text} />
                      </div>
                    );
                  })()}
                  {/* generative UI:首波 5 工具结果 → 对话内候选卡(逐条/整条采纳走 confirm 门)。
                      工具结果按 kind 分发到对应卡:选题候选 / 选题卡 / 维度诊断 / 复盘经验 / 定位提案。 */}
                  {message.parts.map((part, idx) => {
                    if (!isToolUIPart(part)) return null;
                    if (part.state !== "output-available") return null;
                    const name = getToolName(part);
                    const out = part.output as { kind?: string } | undefined;
                    if (!out) return null;
                    const key = `${message.id}-tool-${idx}`;
                    // 选题候选(topic.generate)→ 逐条采纳进候选池。
                    if (
                      name === "topic.generate" &&
                      out.kind === "topic.candidates"
                    ) {
                      const o = out as { items?: ChatTopicCandidate[] };
                      return (
                        <ChatCandidateCard key={key} candidates={o.items ?? []} />
                      );
                    }
                    // 编导诊断(calibration.diagnose)→ 维度评分表(只读展示)。
                    if (
                      name === "calibration.diagnose" &&
                      out.kind === "calibration.diagnosis"
                    ) {
                      const o = out as { diagnosis?: ChatDiagnosis | null };
                      return (
                        <ChatDiagnosisCard
                          key={key}
                          diagnosis={o.diagnosis ?? null}
                        />
                      );
                    }
                    // 复盘经验(review.analyze)→ 逐条沉淀。
                    if (
                      name === "review.analyze" &&
                      out.kind === "review.learnings"
                    ) {
                      const o = out as { items?: ChatLearningItem[] };
                      return (
                        <ChatLearningsCard key={key} items={o.items ?? []} />
                      );
                    }
                    // 定位提案(positioning.generate)→ 整条采纳写入定位母版。
                    if (
                      name === "positioning.generate" &&
                      out.kind === "positioning.suggestion"
                    ) {
                      const o = out as {
                        suggestion?: ChatPositioningSuggestion | null;
                      };
                      return (
                        <ChatPositioningCard
                          key={key}
                          suggestion={o.suggestion ?? null}
                        />
                      );
                    }
                    return null;
                  })}
                </li>
              ))}
              {streaming ? (
                <li
                  data-slot="copilot-thinking"
                  aria-live="polite"
                  className="flex items-center gap-1.5 self-start rounded-lg bg-surface-muted px-2.5 py-1.5 text-[11px] text-muted-foreground"
                >
                  <span className="size-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                  编导思考中…
                </li>
              ) : null}
            </ol>
          ) : (
            // 空对话态:大对话区不留白,给一句引导。
            <div
              data-slot="copilot-empty"
              className="flex h-full flex-col items-center justify-center gap-1.5 text-center"
            >
              <span className="inline-flex size-9 items-center justify-center rounded-full bg-brand-soft text-brand">
                <Sparkles className="size-4" aria-hidden="true" />
              </span>
              <p className="text-[12px] font-medium text-foreground">
                描述你的目标，我来帮你规划下一步
              </p>
              <p className="text-[11px] text-muted-foreground">
                试试「基于最近评论出 5 个选题」，或用下方推荐指令开聊。
              </p>
            </div>
          )}
        </div>
        {/* 输入框(pin 底部)—— bug #5:成为对话区的固定主控件,不被次区挤压。 */}
        <Card
          data-slot="prompt-composer"
          className="shrink-0 border border-border bg-surface p-3"
        >
          <CardContent className="p-0">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
            className="flex flex-col gap-2.5"
            data-slot="prompt-form"
          >
            {/* @项目引用(T-039b):relative 容器锚定下拉;输入 @ 弹真项目列表,选中插入 chip +
                注入 chatContext(等价选中态项目)。下拉在 textarea 上方(bottom-full)。 */}
            <div className="relative" data-slot="prompt-input-wrap">
              {mentionOpen && (
                <ProjectMentionMenu
                  options={mentionOptions}
                  activeIndex={mentionIndex}
                  loading={projectOptions === null}
                  query={mentionQuery}
                  empty={mentionLibraryEmpty}
                  onPick={pickMentionProject}
                  onHover={setMentionIndex}
                />
              )}
              <textarea
                id="ai-copilot-prompt"
                name="prompt"
                ref={textareaRef}
                value={prompt}
                onChange={handlePromptChange}
                onKeyDown={handlePromptKeyDown}
                rows={2}
                aria-label="我能帮你做什么"
                placeholder="我能帮你做什么？（试试「基于最近评论出 5 个选题」，或输入 @ 引用一个项目）"
                className="min-h-12 w-full resize-none border-0 border-l-2 border-brand/40 bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                data-slot="prompt-input"
              />
            </div>
            {/* @引用命中的项目 chip —— 显式告诉用户「本次对话已带上这个项目」,可一键移除。 */}
            {mentionedProject && (
              <div
                data-slot="mention-chip"
                data-project-id={mentionedProject.id}
                className="flex items-center gap-1.5 self-start rounded-md border border-brand/30 bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-brand"
              >
                <FolderOpen className="size-3" aria-hidden="true" />
                <span className="max-w-[180px] truncate">
                  {mentionedProject.title}
                </span>
                <button
                  type="button"
                  aria-label="移除项目引用"
                  data-slot="mention-chip-remove"
                  onClick={() => setMentionedProject(null)}
                  className="ml-0.5 rounded text-brand/70 transition-colors hover:text-brand focus:outline-none"
                >
                  ×
                </button>
              </div>
            )}
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
                {/* 流式中 → stop()(中断本轮);否则提交 */}
                {streaming ? (
                  <button
                    type="button"
                    onClick={() => stop()}
                    data-slot="prompt-stop"
                    data-testid="stop-button"
                    aria-label="停止生成"
                    className="flex size-9 items-center justify-center rounded-full border border-border bg-surface text-foreground transition-colors hover:bg-surface-muted focus:outline-none"
                  >
                    <span
                      className="size-3 rounded-[2px] bg-foreground"
                      aria-hidden="true"
                    />
                    <span className="sr-only">停止</span>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={isEmpty}
                    data-slot="submit-button"
                    data-testid="submit-button"
                    aria-label="提交提示给 Copilot"
                    className="flex size-9 items-center justify-center rounded-full bg-brand text-brand-foreground transition-colors hover:bg-brand/90 focus:outline-none focus:ring-0 focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ArrowUp className="size-4" aria-hidden="true" />
                    <span className="sr-only">生成</span>
                  </button>
                )}
              </div>
            </div>
          </form>
          </CardContent>
        </Card>
      </div>

      {/* 次区(bug #5)—— 控制台/快捷入口/智能推荐折进一个有界、可滚的区域,不挤占对话主区。
          给一个较小的上限高度(max-h)并自身滚动,把垂直空间让给上面的对话主区。
          T-029:仅「全局助手」模式(右下角/⌘K)展示;surface Copilot 聚焦任务、不展示次区。 */}
      {showSecondary && (
      <div
        data-slot="copilot-secondary"
        className="flex max-h-[230px] shrink-0 flex-col gap-3 overflow-y-auto"
      >
      {/* CopilotDashboard ---------------------------------------------- */}
      <section
        aria-labelledby="ai-copilot-dashboard-title"
        data-slot="copilot-dashboard"
        data-region="dashboard"
        data-slot-region="copilot-region"
        className="grid shrink-0 grid-cols-1 gap-3 md:grid-cols-3"
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
                    <span className="min-w-0 truncate text-[9.5px] leading-tight text-muted-foreground">
                      {taskSubtitle(task) ?? `项目：${task.projectId ?? "—"}`}
                    </span>
                    <span className="shrink-0 text-[9.5px] leading-tight text-muted-foreground">
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
                // bug #7:状态徽章 + 「继续」按钮改用项目既有 Badge/Button 组件 + 设计 token,
                // 与全局一致(原为手搓 inline class,灰扑扑、样式怪)。
                const status = CONTINUING_STATUS_META[task.status] ??
                  CONTINUING_STATUS_META.running;
                const sub = taskSubtitle(task);
                const href = resumeHref(task);
                return (
                  <div
                    key={task.id}
                    data-slot="continuing-task"
                    data-task-id={task.id}
                    className="flex flex-col gap-1 rounded-control border border-border bg-surface px-2.5 py-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[11px] font-medium text-foreground leading-tight">
                        {taskTitle(task)}
                      </span>
                      <Badge
                        variant={status.variant}
                        className="shrink-0 px-1.5 py-0 text-[9px] font-medium"
                      >
                        {status.label}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[9.5px] leading-tight text-muted-foreground">
                        {sub ?? `项目：${task.projectId ?? "—"}`}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
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
                        className="shrink-0"
                      >
                        继续
                      </Button>
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
              快速开始
            </h3>
          </div>
          {/* bug #5:原「检测到你最近在研究『AI 浏览器』」是 fixture 假数据 + 推「竞品策略」(对标已砍),
              误导用户。改成不编造、不涉对标的通用创作起点话术,点了直接填入对话。 */}
          <p className="text-[10px] leading-snug text-muted-foreground">
            不知道从哪开始？试试这些：
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
      )}
    </div>
  );
}

export default AICopilotContent;
