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
import { ChatEnrichCard, type ChatEnrichCardData } from "./chat-enrich-card";
import { ChatHookCard, type ChatHookItem } from "./chat-hook-card";
import {
  ChatScriptDraftCard,
  type ChatScriptSection,
} from "./chat-script-draft-card";
import { ChatGatherCard, type ChatGatherItem } from "./chat-gather-card";
// [T-084b/c] 截图卡(公开页真截图 → 加入弹药)+ 生成卡(dispatch asset.generate → 轮询采纳)。
import {
  ChatScreenshotCard,
  type ChatScreenshotAsset,
} from "./chat-screenshot-card";
// [T-217c] 网页正文读取卡(带登录态读正文 → 逐字稿素材确认门 / 需登录引导 / 失败态)。
import {
  ChatWebReadCard,
  type ChatWebReadAsset,
} from "./chat-web-read-card";
import { ChatGenerateCard } from "./chat-generate-card";
import {
  ChatLearningCard,
  type ChatLearningSuggestion,
} from "./chat-learning-card";
import { ChatBriefCard } from "./chat-brief-card";
// [T-094] 蒸馏工具卡:知识原子候选 → 批量确认门(共享 KnowledgeAtomGate),错误人话化渲错误卡。
import { ChatDistillCard, type ChatDistillResult } from "./chat-distill-card";
import type {
  BriefFillSuggestion,
  BriefCurrentDetail,
} from "@creatoros/backend/modules/ai-runtime";
// [T-098] context.* 数据卡统一走注册表分发(素材卡也归入,行为不变)。
import { renderContextCard } from "./context-card-registry";
// [T-103b] 对话内审核报告卡:review.script 工具结果 → 轮询报告 + verdict/findings + 逐条改写门。
import { ChatReviewReportCard } from "./chat-review-report-card";
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
import {
  CHAT_TOOL_LABELS,
  SCHEDULED_TASK_TYPE_LABELS,
} from "@creatoros/contract";
// [T-094] AI 链路错误 → 人话共享映射(与服务端同一张表;客户端兜底二次转译)。
import {
  humanizeAiErrorMessage,
  describeUserError,
} from "@/lib/ai-error-humanize";
import { client } from "@/lib/contract-client";
import { readCurrentAccountId } from "@/lib/http-transport";
import type { BasePageViewModel } from "@/types/view-models";
import {
  readStoredConversationId,
  writeStoredConversationId,
  toUIMessages,
  type WireAIMessage,
} from "./conversation-persistence";
// [T-096] 会话作用域:入口参数 → scope(纯函数),历史/恢复/新对话全按它分桶。
import { resolveChatScope, scopeHistoryLabel } from "./chat-scope";
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
    // [T-231⑨] 真预调:点 chip = 完整话术预填输入框 + 该工具置顶(下一次发送的
    // chatContext.functionKey)。缺省(老数据)退化为填 label 的字条,不置顶工具。
    readonly functionKey?: string;
    readonly prefill?: string;
  }>;
  readonly recommendedCommands: ReadonlyArray<{
    readonly id: string;
    readonly icon: "crosshair" | "file" | "file-search" | "sparkles" | "line-chart";
    readonly tone: "pink" | "violet" | "mint" | "orange" | "indigo";
    readonly title: string;
    readonly description: string;
    // [T-231⑨] 推荐指令同机制升级(缺省退化为填 title)。
    readonly functionKey?: string;
    readonly prefill?: string;
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
    // [T-231⑨] 快速开始同机制升级(缺省退化为填 title)。
    readonly functionKey?: string;
    readonly prefill?: string;
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
  /**
   * [T-055b] 内嵌模式(稿面右栏常驻):上下文由宿主注入而非 URL —— surface/selection
   * 直接给值,会话持久化按 persistKey 隔离(如 `project:<id>`,各项目独立会话)。
   * 内嵌时隐藏全局次区(推荐指令/最近任务/快捷入口),头部标题可换文案。
   */
  readonly embed?: {
    readonly surface: string;
    readonly selection?: {
      readonly kind: string;
      readonly id: string;
      readonly title?: string;
    };
    readonly persistKey?: string;
    readonly title?: string;
    readonly subtitle?: string;
    /**
     * [T-103a] 稿面盲预测锁定上下文 —— 稿面右栏(surface=project)常驻,让对话内的
     * calibration.diagnosis 卡长出「锁定为盲预测」确认门(铁律②)。带项目的 content_output
     * 挂点(null=还没铸,锁定时先自愈)+ 项目 id/标题(铸 output 兜底)。仅稿面注入;
     * 其他 surface 的诊断卡不带 → 只读展示。
     */
    readonly blindPredict?: {
      readonly outputId: string | null;
      readonly projectId: string;
      readonly projectTitle: string;
    };
    /**
     * [T-108] 外部对话请求(方案 A · lift state)—— 稿面 AI 按钮(盲预测/审核)点击后,由
     * DraftChatRequestProvider 提上来的一次请求:置顶 functionKey(review.script /
     * calibration.diagnose)+ 话术 + selection(content_output)。embed 监听 `request.nonce`
     * 变化 → 置 functionKey + 应用 selection + **autoSend=true 时自动 sendMessage 那句话术**
     * (稿面常驻 rail + 用户显式点按钮,直接发;autoSend 缺省则只预填输入框,延续 T-055b)。
     * **不开全局弹层**(根治 T-108:稿面开不出 `?copilot=open` + 消息进不了常驻 rail)。
     * null/nonce=0 = 还没发起(首帧),不动。nonce 天然去重(重渲不重复发)。
     */
    readonly request?: {
      readonly functionKey: string;
      readonly prefill: string;
      readonly autoSend?: boolean;
      readonly selection?: {
        readonly kind: string;
        readonly id: string;
        readonly title?: string;
      };
      readonly nonce: number;
    } | null;
  };
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
  "script.review": { label: "文案审核", sub: "违禁词 lint + 语义审" },
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
// [T-095] 调度采集任务(scheduled.*)走统一词表 SCHEDULED_TASK_TYPE_LABELS(lib/chat-tool-labels),
// 不再满屏渲内部 op id。
function taskTitle(t: WireTask): string {
  return (
    TASK_TYPE_LABEL[t.taskType]?.label ??
    SCHEDULED_TASK_TYPE_LABELS[t.taskType]?.label ??
    t.taskType
  );
}

// taskType → 中文副文(任务卡第二行)。未命中返回 null(不渲染副文)。
function taskSubtitle(t: WireTask): string | null {
  return (
    TASK_TYPE_LABEL[t.taskType]?.sub ??
    SCHEDULED_TASK_TYPE_LABELS[t.taskType]?.sub ??
    null
  );
}

// [T-095] 任务卡第二行:有副文显副文;没副文但挂了项目显「项目:<id>」;两者皆无返回 null
// (调用侧整行不渲)—— 替换原「项目:—」无意义占位(采集类/全局任务本就不挂单项目)。
function taskSecondLine(t: WireTask): string | null {
  const sub = taskSubtitle(t);
  if (sub) return sub;
  return t.projectId ? `项目：${t.projectId}` : null;
}

// [T-095③] Copilot 首屏「最近任务/继续任务」只显与创作直接相关的 AI 任务 —— 调度采集任务
// (scheduled.*)是后台巡航噪音,已有自动化页承载,这里过滤掉,避免首屏被
// 「作品明细采集 ×N」刷屏、真正的创作任务(出题/诊断/复盘…)被挤出视野。
function isCreativeTask(t: WireTask): boolean {
  return !t.taskType.startsWith("scheduled.");
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
// route segment that owns that node. [T-076] 两阶段化:review.* 落复盘页,其余全部
// 落稿面(research/topic/script/material/publish 的可执行入口都在稿面内;
// production/research/planning 工作台已删)。
const TASK_TYPE_STAGE: Record<string, string> = {
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
  // [T-103b] 稿面文案审核进对话:填不发(T-055b),编导据此优先调 review.script。
  "review.script": "审核这份文案:跑一遍违禁词/合规诊断,命中给逐条改写建议。",
  "positioning.generate": "结合我的账号画像,生成/进化一份结构化定位提案。",
  "script.draft": "帮我为这条内容起草一版完整的分镜口播脚本。",
  "material.gather": "围绕这条内容的主题帮我搜一批可用素材(案例、数据、金句)。",
  // [T-231⑨] 生成封面(依赖设置里配好的生图模型;未配时工具卡自带「去设置」降级)。
  "material.generate":
    "帮我为这条内容生成几张封面图候选(走我在设置里配置的生图模型;如果我还没配生图模型,请直接告诉我并指路去设置配置)。",
};

// [T-060②→T-077c] 工具 trace 的中文名(对话内「正在调用/已调用」行;未知工具回落原名)。
// 词表抽到 lib/chat-tool-labels(纯常量)与服务端 skillsBrief 同源 —— 单一词表,防两处漂移。

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
    <h1 className="mb-1 mt-2 text-sm font-semibold text-foreground first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-1 mt-2 text-sm font-semibold text-foreground first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-0.5 mt-1.5 text-[13px] font-semibold text-foreground first:mt-0">
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
    <code className="rounded bg-surface px-1 py-0.5 font-mono text-xs text-foreground">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-1 overflow-x-auto rounded-md bg-surface p-2 font-mono text-xs text-foreground">
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
      <table className="w-full border-collapse text-xs">{children}</table>
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
  // [T-055b SPEC §5.3] 对话正文 14px、行高 1.7(原 11px 用户反馈「字体太小看的累」)。
  return (
    <div data-slot="copilot-markdown" className="text-sm leading-[1.7] text-muted-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function AICopilotContent({
  viewModel,
  embed,
}: AICopilotContentProps = {}) {
  const vm = viewModel ?? buildCopilotViewModel();
  const router = useRouter();

  // T-004 ChatBox:useChat 驱动流式对话(替掉旧的 createMessage→轮询 listMessages)。
  // transport 把请求打到 /api/chat(Vercel AI SDK streamText),body 带 ChatContext(三层注入)。
  // slice 2:页面层 surface + 按钮层 functionKey 从 URL 读(一键岛打开时带 ?surface=&fn=),
  // 让同一个全局面板按打开来源装配不同基础 skill + 预调专用工具。回复 token 级流式;可 stop()。
  const searchParams = useSearchParams();
  // [T-055b] 内嵌模式:surface/selection 由宿主 props 注入,URL 只保留 fn(预填话术仍可
  // 从稿面内深链触发);浮层模式维持全 URL 驱动。
  const surface =
    embed?.surface ?? (searchParams?.get("surface") || DEFAULT_SURFACE);
  // [T-108] embed.request(稿面 AI 按钮发起)优先于 URL:functionKey/selection 从 request 读,
  // 让常驻 rail 无需 `?copilot=open` 深链就置顶专用工具 + 注入选中态(根治 T-108)。request 为
  // null(首帧/未发起)时回落 URL(浮层深链)/ embed.selection(常驻项目上下文),行为不变。
  const activeRequest = embed?.request ?? null;
  const functionKey =
    activeRequest?.functionKey || searchParams?.get("fn") || undefined;
  // T-027:选中态从 URL 读(一键岛带 ?selKind=&selId=&selTitle=),装进 ChatContext.selection →
  // 后端注入 system + 工具入参兜底,让 Copilot 知道用户"这条"指哪条,不再瞎答/反复索要标题。
  // [T-108] request.selection(稿面按钮带的 content_output)优先,其次 embed.selection(常驻项目),
  // 最后 URL(浮层深链)。
  const selKind =
    activeRequest?.selection?.kind ??
    embed?.selection?.kind ??
    (searchParams?.get("selKind") || undefined);
  const selId =
    activeRequest?.selection?.id ??
    embed?.selection?.id ??
    (searchParams?.get("selId") || undefined);
  const selTitle =
    activeRequest?.selection?.title ??
    embed?.selection?.title ??
    (searchParams?.get("selTitle") || undefined);
  // [T-096] 会话作用域(scope)—— 历史列表/恢复/新对话的归属桶,与 surface(技能装配)解耦。
  // 入口 → scope 总表见 chat-scope.ts:内嵌右栏 = project:<id>;深链选中项目(复盘岛/选题卡
  // brief.fill)归并 project:<id>;一键岛 = surface:<name>;左下角/首页显式 ?scope=global;
  // 裸 ?copilot=open(旧深链)回落 global —— 全局入口不再借 topics 桶(根因链断点 1 根治)。
  const scope = resolveChatScope({
    scopeParam: embed ? null : searchParams?.get("scope") || null,
    // 注意传 URL 原始值(可能为 null),不传回落默认的 `surface` —— 裸打开必须判成 global。
    urlSurface: embed ? null : searchParams?.get("surface") || null,
    selKind: embed ? null : searchParams?.get("selKind") || null,
    selId: embed ? null : searchParams?.get("selId") || null,
    embed: embed
      ? {
          surface: embed.surface,
          persistKey: embed.persistKey,
          selection: embed.selection
            ? { kind: embed.selection.kind, id: embed.selection.id }
            : undefined,
        }
      : null,
  });
  // [T-055b] 上下文可摘:用户点掉 chip 后,本面板实例不再注入这份选中态(会话继续,
  // 只是后续轮次不带 selection/projectId)。
  const [selectionDismissed, setSelectionDismissed] = React.useState(false);
  // T-029:次区(推荐指令 / 最近任务 / 继续任务 / 快捷入口)只在「全局助手」模式展示 —— 即右下角
  // 浮标 / ⌘K 全局唤醒(落到默认 surface、无 functionKey、无选中态)。从工作台上下文打开的 surface
  // Copilot 聚焦当前任务,不展示次区(真机反馈:非右下角/全局唤醒不需要下面的推荐指令和全局入口)。
  const showSecondary =
    !embed && surface === DEFAULT_SURFACE && !functionKey && !selKind;
  // 会话持久化(本切片):前端持一个 conversationId,放进 transport body(和 chatContext 并列)
  // 让后端续接同一会话;并从 /api/chat 的响应头 `x-conversation-id` 捕获后端 lazy 建/复用的
  // 会话 id 存起来。conversationId 随 scope 切换重置(不同入口各自独立会话)。
  const [conversationId, setConversationId] = React.useState<string | null>(
    null,
  );
  // conversationId 放 ref 供 transport 的 body(Resolvable 函数)读最新值,避免因 body 变化
  // 重建 transport(重建会打断进行中的流)。fetch 包装层用 ref 里的 setter 回写捕获到的 id。
  const conversationIdRef = React.useRef<string | null>(null);
  conversationIdRef.current = conversationId;
  // 捕获到 x-conversation-id 时:更新 state + 持久化。[T-096] 持久化桶 = scope(global /
  // project:<id> / surface:<name>,入口级隔离);ref 读最新值,让 fetch 包装闭包不随
  // key 变(避免重建 transport 打断流)。
  const scopeRef = React.useRef(scope);
  scopeRef.current = scope;
  const captureConversationId = React.useCallback((id: string) => {
    if (!id) return;
    if (conversationIdRef.current === id) return;
    conversationIdRef.current = id;
    setConversationId(id);
    writeStoredConversationId(scopeRef.current, id);
  }, []);

  // @项目引用(T-039b):输入框 @ 选中的项目。存在时等价「选中态项目」注入后端(见下 chatContextBody)。
  // 与 URL 带来的选中态(一键岛)并存时,URL 选中态优先(它是打开来源的强上下文);@ 只在无 URL
  // 选中态时生效,避免"面板从复盘岛打开、用户又 @ 了别的项目"两者打架。
  const [mentionedProject, setMentionedProject] =
    React.useState<MentionedProject | null>(null);

  const chatContextBody = React.useMemo(() => {
    const chatContext: {
      surface: string;
      // [T-096] 作用域声明(必带):服务端据它落 lazy 建会话的归属,并在续接时与库中会话
      // 的 scope 比对(不一致 4xx)—— 隔离锁在服务端。
      scope: string;
      functionKey?: string;
      projectId?: string;
      selection?: { kind: string; ids: string[]; label?: string };
    } = { surface, scope };
    if (functionKey) chatContext.functionKey = functionKey;
    // [T-108] 稿面常驻 rail:embed.selection 是项目(kind=project),始终把它的 id 当 projectId 注入,
    // 让后端项目 facet 恒能读到本项目材料 —— 即使本轮 selection 主题被 request 换成 content_output
    // (稿面按钮带的 subject),项目上下文也不丢(overlay 深链路径原来没带 projectId,这里更完整)。
    if (embed?.selection?.kind === "project" && embed.selection.id) {
      chatContext.projectId = embed.selection.id;
    }
    if (!selectionDismissed && selKind && selId) {
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
  }, [
    surface,
    scope,
    functionKey,
    selKind,
    selId,
    selTitle,
    mentionedProject,
    selectionDismissed,
    embed?.selection?.kind,
    embed?.selection?.id,
  ]);
  // [T-231⑨] 快捷 chip / 推荐指令的一次性 functionKey:点按钮只**预填**完整话术(T-055b
  // 铁律:绝不自动发),同时把语义对应的专用工具记在 ref 里;下一次发送时注入
  // chatContext.functionKey(服务端 applyFunctionKey 置顶 + forcedTool 第 0 步强制),
  // **读后即清**(一次性)—— 不污染后续自由对话轮次。放 ref 不放 state:body 是
  // Resolvable(每次请求求值),ref 更新不重建 transport(重建会打断进行中的流)。
  const quickFunctionKeyRef = React.useRef<string | null>(null);
  const transport = React.useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/chat",
        // [T-220] 每次请求注入当前选中号 header(与 dispatch 同源 localStorage 真值)。chat route
        //   据此 stamp 工具产的 asset(截图/封面)当前号 —— 此前漏注入 → chat 全程无号 → asset
        //   account_id=NULL → blob 取回 404 破图。未选号 → 不带(server 退化全局)。
        headers: (): Record<string, string> => {
          const acct = readCurrentAccountId();
          return acct ? { "x-account-id": acct } : {};
        },
        // body 是 Resolvable(每次发请求求值):把当前 conversationId(ref 读最新)和 chatContext
        // 一起带上。首轮 conversationId 为 null → 不带,后端 lazy 建;拿到响应头后续轮带上续接。
        body: () => {
          // [T-231⑨] 一次性 chip functionKey:本次请求置顶该工具后即清;chip 是比
          // URL/embed 更晚的用户显式动作 → 本轮覆盖之,后续轮次回落原 functionKey。
          const quickFn = quickFunctionKeyRef.current;
          quickFunctionKeyRef.current = null;
          const chatContext = quickFn
            ? { ...chatContextBody.chatContext, functionKey: quickFn }
            : chatContextBody.chatContext;
          return {
            chatContext,
            ...(conversationIdRef.current
              ? { conversationId: conversationIdRef.current }
              : {}),
          };
        },
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
  // [T-231⑩] regenerate:@ai-sdk/react 现成的「重发最后一轮」API(对话出错时的重试通路)。
  const { messages, sendMessage, status, stop, setMessages, error, regenerate } =
    useChat({
      transport,
    });
  const streaming = status === "streaming" || status === "submitted";

  // [T-105] 自动滚到最新:发消息/回复开始(条数增)强制跟随到底;流式增长按「跟随态」滚;
  // 用户手动上滚离底则暂停跟随(读历史不被打断),滚回接近底部恢复。免得每次发消息还得手动滚。
  const messagesScrollRef = React.useRef<HTMLDivElement | null>(null);
  const autoFollowRef = React.useRef(true);
  const prevMsgCountRef = React.useRef(0);
  const handleMessagesScroll = React.useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    autoFollowRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);
  React.useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    if (messages.length > prevMsgCountRef.current) autoFollowRef.current = true;
    prevMsgCountRef.current = messages.length;
    if (autoFollowRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  // [T-094] 本轮流式错误 → 人话气泡:服务端 onError 已转人话;若客户端拿到的仍是原始机器码
  // (装配期 4xx 等路径),这里再过一次共享映射兜底。命中「换模型可解」类附「去设置」链接。
  const chatError = React.useMemo(() => {
    if (!error) return null;
    const raw = error.message || String(error);
    const human = humanizeAiErrorMessage(raw);
    return {
      // [T-133] 命中 AI 人话优先;否则走通用收口(结构化码人话 / fallback),
      // 绝不把裸 raw 机器码渲进错误气泡。
      message: human?.message ?? describeUserError(error, "出错了，请重试。"),
      suggestSwitchModel: human?.suggestSwitchModel ?? /在设置里换一个模型/.test(raw),
    };
  }, [error]);

  // 受控输入(useChat v7 不再托管 input;自管 + sendMessage({text}))。
  const [prompt, setPrompt] = React.useState<string>(vm.prompt);
  const isEmpty = prompt.trim().length === 0;

  // [T-055b SPEC §5.1] 一键岛预填 —— 面板带 fn 打开且对话尚空 → 把「预填话术」写进**输入框**,
  // 用户回车才发,**绝不自动发送**(治「点击后内容重复两遍」:旧预调自动 sendMessage 在带 ?fn
  // 重进/重渲时会重复入历史;预填只写 input value,机制上不可能重复发)。functionKey 置顶工具
  // 的白名单重排(applyFunctionKey)不受影响 —— 用户发出这条时仍优先调专用工具。
  const prefilledRef = React.useRef(false);
  React.useEffect(() => {
    if (prefilledRef.current) return;
    if (messages.length > 0 || streaming) return;
    // [T-060①] URL ?prefill= 自定义话术优先(按钮语义更细);否则按 fn 查默认词条。
    const custom = searchParams?.get("prefill") || "";
    const text = custom || (functionKey ? FUNCTION_KEY_PREFILL[functionKey] : "");
    if (!text) return;
    prefilledRef.current = true;
    // 不覆盖用户已敲的字(预填只填空输入框)。
    setPrompt((prev) => (prev.trim().length > 0 ? prev : text));
    lastPrefillRef.current = text;
  }, [functionKey, messages.length, streaming]);

  // [T-108] 外部对话请求(方案 A)—— 稿面 AI 按钮点击后 embed.request.nonce 自增,本 effect
  // 据 nonce 变化处理该请求。functionKey/selection 已在上方按 request 优先重算(置顶专用工具 +
  // 注入 content_output → transport body 会带上最新 chatContext)。两种模式:
  //   ① autoSend=true(稿面审核/盲预测):**直接 sendMessage** 那句话术(常驻 rail + 用户显式
  //      点按钮,直接发;模型据 functionKey 优先调 review.script/calibration.diagnose)。
  //   ② autoSend 缺省:只预填输入框(不覆盖用户已敲的字,延续 T-055b),用户回车才发。
  // nonce 由 Provider 内部计数器生成(SSR 安全,非 Date.now/Random),天然去重(重渲不重复发)。
  const lastPrefillRef = React.useRef<string>("");
  const handledRequestNonceRef = React.useRef(0);
  React.useEffect(() => {
    const req = embed?.request ?? null;
    if (!req || req.nonce === 0) return;
    if (req.nonce === handledRequestNonceRef.current) return;
    const text = req.prefill;
    if (!text) {
      handledRequestNonceRef.current = req.nonce; // 空话术:标记消费,别反复触发。
      return;
    }
    // 新请求即「用户显式发起」→ 放开首次预填守卫(URL 预填 effect 不再重复填,二者互不打架)。
    prefilledRef.current = true;
    if (req.autoSend) {
      // 流式中不打断本轮(极窄竞态:用户上一条还在流)—— 此时**不**标记消费,待 streaming 结束
      // effect 重跑(依赖 streaming)再发,不丢这条请求。functionKey/selection 已随 request 重算进
      // chatContextBody → transport 本次求值带最新上下文,模型据 functionKey 优先调专用工具。
      if (streaming) return;
      handledRequestNonceRef.current = req.nonce;
      setPrompt("");
      void sendMessage({ text });
      return;
    }
    handledRequestNonceRef.current = req.nonce;
    // 预填模式:仅当输入框为空、或仍是上次预填原文(用户没动过)时替换 —— 不 clobber 用户输入。
    setPrompt((prev) => {
      const untouched =
        prev.trim().length === 0 || prev === lastPrefillRef.current;
      return untouched ? text : prev;
    });
    lastPrefillRef.current = text;
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [embed?.request, streaming, sendMessage]);

  const submit = React.useCallback(() => {
    const value = prompt.trim();
    if (value.length === 0 || streaming) return;
    void sendMessage({ text: value });
    setPrompt("");
  }, [prompt, streaming, sendMessage]);

  // [T-231⑨] 快捷按钮(composer chips / 推荐指令 / 快速开始)统一走真预调:完整话术预填
  // 输入框 + 语义工具一次性置顶(quickFunctionKeyRef,下一次发送生效)。**预填不自动发**
  // (T-055b 铁律),用户按发送才出手。无 prefill/functionKey 的老条目退化为原「填字条」。
  const applyQuickPrompt = React.useCallback(
    (item: { readonly prefill?: string; readonly functionKey?: string }, fallbackText: string) => {
      const text = item.prefill ?? fallbackText;
      if (!text) return;
      setPrompt(text);
      lastPrefillRef.current = text;
      quickFunctionKeyRef.current = item.functionKey ?? null;
      textareaRef.current?.focus();
    },
    [],
  );

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
        writeStoredConversationId(scopeRef.current, id);
        return true;
      } catch (err) {
        console.error("[copilot] load conversation failed:", err);
        return false;
      }
    },
    [setMessages],
  );

  // 历史记录面板状态(声明提前:下方 scope 恢复 effect 在 scope 切换时要重置它)。
  // [T-096] 历史只列**当前 scope**(listConversations 带 scope);scope 变化清缓存重拉。
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [historyRows, setHistoryRows] = React.useState<
    ReadonlyArray<WireConversation> | null
  >(null);

  // [T-096] 二次进入恢复(双路,SPEC §1.4):组件挂载 / scope 切换时恢复该入口的最近会话。
  //   路 1(快路):localStorage 指针 `copilot:conv:<scope>` → 读回其消息;
  //   路 2(服务端兜底):指针缺失/读回失败 → listConversations?scope= 第一条(updatedAt 最新)
  //     即「该入口最近会话」—— 清缓存/换浏览器/指针毁档都不再失忆(根因链断点 3/4 根治);
  //   两路皆空 → 诚实空会话(该入口真的从没聊过)。
  // 读回失败自愈不毁档:失效指针只清指针本身,随即走服务端兜底,不再「一错清档、永远新建」。
  const hydratedForKeyRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (hydratedForKeyRef.current === scope) return;
    hydratedForKeyRef.current = scope;
    // scope 变了(入口/内嵌项目切换):重置会话态 + 历史面板缓存(历史只列当前 scope)。
    setHistoryRows(null);
    setHistoryOpen(false);
    const stored = readStoredConversationId(scope);
    conversationIdRef.current = stored;
    setConversationId(stored);
    if (stored) {
      // 有指针 → 先抑制一键岛预填(读回是「续上次」,输入框不再叠预填话术)。
      prefilledRef.current = true;
    }
    void (async () => {
      // 路 1:指针快路。失败(会话被删/网络错)→ 清失效指针,落入路 2。
      if (stored) {
        const ok = await loadConversation(stored);
        if (ok) return;
        writeStoredConversationId(scope, null);
      }
      // 路 2:服务端兜底 —— 该 scope 最近一条会话(只查本 scope,跨 scope 会话绝不流入)。
      try {
        const rows = (await client.listConversations({
          params: undefined,
          query: { page: 1, pageSize: 1, scope },
          body: undefined,
        })) as unknown as ReadonlyArray<WireConversation> | null | undefined;
        const latest = rows?.[0];
        if (latest?.id) {
          const ok = await loadConversation(latest.id);
          if (ok) {
            // 服务端恢复成功 = 「续上次」,同样抑制预填。
            prefilledRef.current = true;
            return;
          }
        }
      } catch (err) {
        // 兜底失败(离线等)→ 诚实空会话,不弹错;下次进入再试。
        console.error("[copilot] scope fallback recovery failed:", err);
      }
      // 两路皆空 → 干净空会话,放开一键岛预填(首次进入可预填一次)。
      conversationIdRef.current = null;
      setConversationId(null);
      setMessages([]);
      prefilledRef.current = false;
    })();
    // loadConversation 依赖稳定;scope 变化触发恢复。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  // 历史记录(SPEC 本切片,做实占位按钮):点「历史记录」→ 拉过往会话列表(标题+时间),
  // 点某条 → 切到该会话 + 读回消息。open 时懒加载一次(scope 切换时缓存已被上方 effect 清掉)。
  // [T-096] 隔离语义:仅列当前 scope 的会话 —— 跨 scope 会话在列表中**不出现**(不是置灰)。
  const toggleHistory = React.useCallback(() => {
    setHistoryOpen((prev) => {
      const next = !prev;
      if (next && historyRows === null) {
        void (async () => {
          try {
            const rows = (await client.listConversations({
              params: undefined,
              query: { page: 1, pageSize: 20, scope: scopeRef.current },
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
  // 新对话([T-096] 同 scope 内新开一条):清当前会话 id + 清消息 + 清**当前 scope**的指针,
  // 下轮发言由后端 lazy 建新会话(仍落当前 scope)。绝不跨 scope、绝不影响其它 scope 的指针
  // (选题岛「新对话」动的是 surface:topics 桶,global 的指针纹丝不动)。
  // prefilledRef 复位,让「新对话」后一键岛预调仍可触发一次。
  const startNewConversation = React.useCallback(() => {
    setHistoryOpen(false);
    conversationIdRef.current = null;
    setConversationId(null);
    writeStoredConversationId(scopeRef.current, null);
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
        // [T-095③] 多拉一页(24)再过滤+截 6:调度采集任务高频刷屏,只拉 6 条会被它占满,
        // 过滤后创作任务反而显示不出来。
        const rows = (await client.listAITasks({
          params: undefined,
          query: { page: 1, pageSize: 24 },
          body: undefined,
        })) as unknown as ReadonlyArray<WireTask> | null | undefined;
        // null→[] 收敛:若 op 成功 resolve 但返回 null/undefined(空 DB 的某些 transport
        // 路径),仍要把状态推进到空数组,否则 spinner 会一直转。empty array 触发诚实空态。
        if (active) setRecentTasks((rows ?? []).filter(isCreativeTask).slice(0, 6));
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
      if (!mentionOpen || mentionOptions.length === 0) {
        // [T-055c] 聊天惯例:Enter 发送、Shift+Enter 换行(原来 Enter 恒为换行,
        // 只能点按钮提交)。isComposing 时是输入法确认候选词,不发送。
        if (
          e.key === "Enter" &&
          !e.shiftKey &&
          !e.nativeEvent.isComposing
        ) {
          e.preventDefault();
          submit();
        }
        return;
      }
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
    [mentionOpen, mentionOptions, mentionIndex, pickMentionProject, submit],
  );

  // [T-055b] 上下文 chips 派生:生效的项目上下文(URL/embed 选中态优先,@ 引用次之,
  // 与 chatContextBody 的注入优先级一字不差),以及非项目对象 chip(脚本/候选等)。
  // [T-108] 稿面常驻 rail:项目 chip 恒来自 embed.selection(project)—— 与 chatContextBody 的
  // projectId 注入同源,不因本轮 request 把 subject 换成 content_output 而消失(项目上下文常驻);
  // content_output 走下面的 objectChip。activeProjectChip.id 还被下游卡(审核报告/HOOK/素材)当
  // projectId 用,故必须稳定解析到项目 id。
  const embedProjectSelection =
    embed?.selection?.kind === "project" && embed.selection.id
      ? { id: embed.selection.id, title: embed.selection.title || "当前项目" }
      : null;
  const urlProjectSelection =
    !embed && !selectionDismissed && selKind === "project" && selId
      ? { id: selId, title: selTitle || "当前项目" }
      : null;
  const activeProjectChip = embedProjectSelection
    ? {
        id: embedProjectSelection.id,
        title: embedProjectSelection.title,
        // 稿面常驻项目上下文不提供「摘除」(它是本页固定归属);仅 chip 展示。
        dismiss: undefined,
      }
    : urlProjectSelection
      ? {
          id: urlProjectSelection.id,
          title: urlProjectSelection.title,
          dismiss: () => setSelectionDismissed(true),
        }
      : mentionedProject
        ? {
            id: mentionedProject.id,
            title: mentionedProject.title,
            dismiss: () => setMentionedProject(null),
          }
        : null;
  // 非项目 subject chip(content_output/脚本/候选…):embed 模式下 request 带的 content_output
  // 也走这里;URL 深链的非项目选中态同理。project kind 归 activeProjectChip,不重复渲。
  const objectChip =
    !selectionDismissed && selKind && selKind !== "project" && selId
      ? { kind: selKind, label: selTitle || selKind }
      : null;

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
            {embed?.title ?? "AI 助手"}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {embed?.subtitle ?? "描述你的目标，我来帮你规划下一步"}
          </p>
        </div>
        {/* 历史记录 + 新对话(SPEC 本切片:占位按钮做实)。历史记录 → 拉过往会话列表,点某条
            切过去 + 读回;新对话 → 清空当前会话(下次发言后端 lazy 建新会话)。 */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap">
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
            {/* [T-096] 范围提示:诚实标注只列当前入口(scope)的会话,不再假装全局列表。 */}
            <p
              data-slot="copilot-history-scope"
              data-scope={scope}
              className="border-b border-border/60 px-2 pb-1 pt-0.5 text-[10px] font-medium text-text-subtle"
            >
              {scopeHistoryLabel(scope)}
            </p>
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

      {/* [T-055b SPEC §5.1] 上下文 chips —— 常驻显示本会话注入的上下文(@项目名 + 对象),
          可一键摘除;什么都没带时显式「未关联项目」空态提示(gate-F2:缺失不静默)。 */}
      <div
        data-slot="copilot-context-chips"
        className="flex shrink-0 flex-wrap items-center gap-1.5"
      >
        {activeProjectChip ? (
          <span
            data-slot="context-chip"
            data-kind="project"
            data-project-id={activeProjectChip.id}
            className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand"
          >
            <FolderOpen className="size-3" aria-hidden="true" />
            <span className="max-w-[200px] truncate">
              @{activeProjectChip.title}
            </span>
            {/* [T-108] 稿面常驻项目上下文(embed.selection)不给摘除按钮 —— 它是本页固定归属;
                URL/@ 引用来的项目仍可一键摘除。 */}
            {activeProjectChip.dismiss ? (
              <button
                type="button"
                aria-label="移除项目上下文"
                data-slot="context-chip-remove"
                onClick={activeProjectChip.dismiss}
                className="ml-0.5 rounded text-brand/70 transition-colors hover:text-brand focus:outline-none"
              >
                ×
              </button>
            ) : null}
          </span>
        ) : (
          <span
            data-slot="context-chip-empty"
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-text-subtle"
          >
            未关联项目 · 输入 @ 引用一个项目
          </span>
        )}
        {objectChip ? (
          <span
            data-slot="context-chip"
            data-kind={objectChip.kind}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-xs text-muted-foreground"
          >
            <span className="max-w-[200px] truncate">{objectChip.label}</span>
            <button
              type="button"
              aria-label="移除选中内容上下文"
              data-slot="context-chip-remove"
              onClick={() => setSelectionDismissed(true)}
              className="ml-0.5 rounded text-muted-foreground/70 transition-colors hover:text-foreground focus:outline-none"
            >
              ×
            </button>
          </span>
        ) : null}
      </div>

      {/* Conversation region (主区,bug #5)—— 消息流 + 输入框。flex-1 占满浮层主体,消息区
          自身滚动,输入框 pin 在底部。对话才是 Copilot 的核心,放大、可读、可滚。
          [T-095] 板块重合修复的根因是「次区 shrink-0 拒绝收缩」(已改为可收缩 max-h 次区,见
          copilot-secondary),而非主区高度模式。
          [T-101] 主区必须 min-h-0:长对话时 flex 才能把主区收缩到父容器给的高度,让内部消息滚动区
          (min-h-[220px] 固定保底 + overflow-y-auto)真正滚动。此前误用 min-h-min(下限=min-content=
          消息全内容高)使滚动容器被撑到全高、scrollHeight==clientHeight,长对话滚不动。 */}
      <div
        data-slot="copilot-conversation"
        data-region="prompt"
        data-slot-region="copilot-region"
        className="flex min-h-0 flex-1 flex-col gap-2"
      >
        {/* 消息流(可滚)—— 给一个 min-h 下限,保证对话区是视觉主区,不被次区压扁(bug #5)。 */}
        <div
          ref={messagesScrollRef}
          onScroll={handleMessagesScroll}
          data-slot="copilot-message-scroll"
          className="min-h-[120px] flex-1 overflow-y-auto rounded-2xl border border-border bg-surface-subtle/40 p-3"
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
                        className="rounded-lg bg-brand-soft px-3 py-2 text-sm leading-[1.7] text-foreground"
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
                    const name = getToolName(part);
                    const traceLabel = CHAT_TOOL_LABELS[name]?.name ?? name;
                    // [T-060②] 调用中 → 进行态 trace 行(WorkBuddy 式过程可见)。
                    if (part.state !== "output-available") {
                      return (
                        <div
                          key={`${message.id}-trace-${idx}`}
                          data-slot="copilot-tool-running"
                          className="mt-1 flex items-center gap-1.5 rounded-md border border-border/60 bg-surface-subtle/40 px-2.5 py-1.5 text-xs text-muted-foreground"
                        >
                          <span className="size-3 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                          正在调用 {traceLabel}…
                        </div>
                      );
                    }
                    const out = part.output as { kind?: string } | undefined;
                    if (!out) return null;
                    const key = `${message.id}-tool-${idx}`;
                    // [T-060②] 已完成 trace 行:可折叠展开看入参/结果摘要;后面若有产物卡
                    // 则卡随其后。纯读工具(context.*)也留痕 —— 用户能看见 AI 读了什么。
                    const traceRow = (
                      <details
                        key={`${key}-trace`}
                        data-slot="copilot-tool-trace"
                        className="mt-1 rounded-md border border-border/60 bg-surface-subtle/40 px-2.5 py-1.5"
                      >
                        <summary className="cursor-pointer select-none text-xs text-muted-foreground">
                          <span className="text-success">✓</span> 已调用 {traceLabel}
                          {typeof (out as { total?: number }).total === "number"
                            ? `（共 ${(out as { total?: number }).total} 条）`
                            : ""}
                        </summary>
                        <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-text-subtle">
                          {`入参 ${JSON.stringify(part.input ?? {}, null, 1).slice(0, 400)}\n结果 ${JSON.stringify(out, null, 1).slice(0, 800)}`}
                        </pre>
                      </details>
                    );
                    // 选题候选(topic.generate)→ 逐条采纳进候选池。
                    if (
                      name === "topic.generate" &&
                      out.kind === "topic.candidates"
                    ) {
                      const o = out as { items?: ChatTopicCandidate[] };
                      return (
                        <React.Fragment key={key}>
                          {traceRow}
                          <ChatCandidateCard candidates={o.items ?? []} />
                        </React.Fragment>
                      );
                    }
                    // [T-117] 补全选题卡(topic.enrich)→ 富卡渲染 + 采纳(patch 到被补全的
                    // 那条候选)。此前缺此分支 → topic.card 结果被静默丢弃(用户看不到卡)。
                    if (name === "topic.enrich" && out.kind === "topic.card") {
                      const o = out as { card?: ChatEnrichCardData | null };
                      return (
                        <React.Fragment key={key}>
                          {traceRow}
                          <ChatEnrichCard
                            card={o.card ?? null}
                            candidateId={selKind === "candidate" ? (selId ?? null) : null}
                          />
                        </React.Fragment>
                      );
                    }
                    // [T-055c] HOOK 候选组(script.hooks)→ 逐条「写入稿面」(artifacts 版本门)。
                    if (name === "script.hooks" && out.kind === "script.hooks") {
                      const o = out as { items?: ChatHookItem[] };
                      return (
                        <ChatHookCard
                          key={key}
                          items={o.items ?? []}
                          projectId={activeProjectChip?.id ?? null}
                        />
                      );
                    }
                    // [T-057⑤] 整稿分镜脚本(script.draft)→ 整稿「写入稿面」。
                    if (name === "script.draft" && out.kind === "script.draft") {
                      const o = out as { sections?: ChatScriptSection[] };
                      return (
                        <ChatScriptDraftCard
                          key={key}
                          sections={o.sections ?? []}
                          projectId={activeProjectChip?.id ?? null}
                        />
                      );
                    }
                    // [T-057④/T-084a] 搜素材(material.gather)→ 逐条「存入弹药」(knowledge+
                    // materialLink);grounding=model_memory 时卡片渲黄条 + 需核实徽标(未配联网)。
                    if (
                      name === "material.gather" &&
                      out.kind === "material.gather"
                    ) {
                      const o = out as {
                        items?: ChatGatherItem[];
                        grounding?: "web" | "model_memory";
                      };
                      return (
                        <ChatGatherCard
                          key={key}
                          items={o.items ?? []}
                          projectId={activeProjectChip?.id ?? null}
                          grounding={o.grounding ?? "model_memory"}
                        />
                      );
                    }
                    // [T-084b] 网页截图(material.screenshot)→ 缩略图 + 来源 URL +「加入弹药」
                    // (createMaterialLink 挂当前项目);失败(打不开/HTTP/登录墙)→ 卡渲错误态。
                    if (
                      name === "material.screenshot" &&
                      out.kind === "material.screenshot"
                    ) {
                      const o = out as {
                        asset?: ChatScreenshotAsset | null;
                        error?: string | null;
                      };
                      return (
                        <ChatScreenshotCard
                          key={key}
                          asset={o.asset ?? null}
                          error={o.error ?? null}
                          projectId={activeProjectChip?.id ?? null}
                        />
                      );
                    }
                    // [T-217c] 网页正文读取(web.read)→ 逐字稿素材确认门卡 / 需登录引导 / 失败态。
                    if (name === "web.read" && out.kind === "web.read") {
                      const o = out as {
                        asset?: ChatWebReadAsset | null;
                        needLogin?: { domain: string } | null;
                        error?: string | null;
                      };
                      return (
                        <ChatWebReadCard
                          key={key}
                          asset={o.asset ?? null}
                          needLogin={o.needLogin ?? null}
                          error={o.error ?? null}
                          projectId={activeProjectChip?.id ?? null}
                        />
                      );
                    }
                    // [T-084c] AI 生成素材(material.generate)→ 据 taskId 轮询 → 完成渲缩略图 +
                    // 「采纳进素材库」(confirmTask);未配模型 → 卡内「去设置」。
                    if (
                      name === "material.generate" &&
                      out.kind === "material.generate"
                    ) {
                      const o = out as {
                        taskId?: string | null;
                        kindOf?: "image" | "video";
                        error?: string | null;
                      };
                      return (
                        <ChatGenerateCard
                          key={key}
                          taskId={o.taskId ?? null}
                          kindOf={o.kindOf ?? "image"}
                          error={o.error ?? null}
                        />
                      );
                    }
                    // [T-062a] 手录经验(learning.capture)→ 候选卡「存为经验」(createLearning
                    // → candidate 进裁决队列;铁律②人点才物化)。
                    if (
                      name === "learning.capture" &&
                      out.kind === "learning.capture"
                    ) {
                      const o = out as {
                        suggestion?: ChatLearningSuggestion | null;
                      };
                      return (
                        <ChatLearningCard
                          key={key}
                          suggestion={o.suggestion ?? null}
                        />
                      );
                    }
                    // [T-077b] 对话填策划(brief.fill)→ 字段对照卡「写入选题卡」(patchProject
                    // 落 brief_detail;铁律②人点才物化)。projectId 取当前项目 chip(项目对话/@项目)。
                    if (name === "brief.fill" && out.kind === "brief.fill") {
                      const o = out as {
                        suggestion?: BriefFillSuggestion | null;
                        current?: BriefCurrentDetail | null;
                      };
                      return (
                        <ChatBriefCard
                          key={key}
                          suggestion={o.suggestion ?? null}
                          current={o.current ?? null}
                          projectId={activeProjectChip?.id ?? null}
                        />
                      );
                    }
                    // [T-098] context.* 只读工具 → CONTEXT_CARD_REGISTRY 分发数据卡
                    // (SPEC context-layer-redesign §2:真数据 UI 直渲,模型只归纳不转录;
                    // 未注册 kind 走通用表格兜底,不再裸 JSON trace)。素材卡(T-055c)
                    // 也归入注册表,行为不变。
                    if (
                      name.startsWith("context.") ||
                      (typeof out.kind === "string" &&
                        out.kind.startsWith("context."))
                    ) {
                      const kind =
                        typeof out.kind === "string" && out.kind
                          ? out.kind
                          : name;
                      return (
                        <React.Fragment key={key}>
                          {traceRow}
                          {renderContextCard(
                            kind,
                            out as Record<string, unknown>,
                            { projectId: activeProjectChip?.id ?? null },
                          )}
                        </React.Fragment>
                      );
                    }
                    // [T-094] 知识蒸馏(knowledge.distill)→ 批量确认门卡(勾选/改 type/改
                    // title,「采纳选中 N 条」逐条 knowledge.create;铁律②人点才物化)。
                    // 失败(如 MiniMax 内容安全拦截)已在服务端转人话 → 错误卡 + 可选「去设置」。
                    if (
                      name === "knowledge.distill" &&
                      out.kind === "knowledge.distill"
                    ) {
                      const o = out as unknown as Partial<ChatDistillResult>;
                      return (
                        <ChatDistillCard
                          key={key}
                          result={{
                            atoms: o.atoms ?? [],
                            suggestedTags: o.suggestedTags ?? [],
                            originalText: o.originalText ?? "",
                            error: o.error ?? null,
                            suggestSwitchModel: o.suggestSwitchModel ?? false,
                          }}
                        />
                      );
                    }
                    // 编导诊断(calibration.diagnose)→ 维度评分表。稿面盲预测场景
                    // (embed.blindPredict 注入)长出「锁定为盲预测」确认门(T-103a);
                    // 其他 surface 仍只读展示。
                    if (
                      name === "calibration.diagnose" &&
                      out.kind === "calibration.diagnosis"
                    ) {
                      const o = out as { diagnosis?: ChatDiagnosis | null };
                      return (
                        <ChatDiagnosisCard
                          key={key}
                          diagnosis={o.diagnosis ?? null}
                          blindPredict={embed?.blindPredict ?? null}
                        />
                      );
                    }
                    // 复盘经验(review.analyze)→ 逐条沉淀。
                    if (
                      name === "review.analyze" &&
                      out.kind === "review.learnings"
                    ) {
                      const o = out as {
                        items?: ChatLearningItem[];
                        error?: string | null;
                      };
                      return (
                        <ChatLearningsCard
                          key={key}
                          items={o.items ?? []}
                          error={o.error ?? null}
                        />
                      );
                    }
                    // [T-103b] 文案审核(review.script)→ 轮询审核任务 → 审核报告卡
                    // (verdict + L1/L2 命中);改写建议逐条走 createArtifactVersion append-only
                    // 应用门(复用稿面审核门链)。dispatch 失败/无项目上下文 → 卡渲诚实错误态。
                    if (name === "review.script" && out.kind === "review.report") {
                      const o = out as {
                        taskId?: string | null;
                        projectId?: string | null;
                        error?: string | null;
                      };
                      return (
                        <React.Fragment key={key}>
                          {traceRow}
                          <ChatReviewReportCard
                            taskId={o.taskId ?? null}
                            projectId={o.projectId ?? activeProjectChip?.id ?? null}
                            error={o.error ?? null}
                          />
                        </React.Fragment>
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
                    // 无专属卡的非 context 工具 → 只渲 trace 行(context.* 已在上方
                    // 全量走注册表渲数据卡,不再落到这里)。
                    return traceRow;
                  })}
                </li>
              ))}
              {/* [T-094] 流式错误气泡(人话):如 MiniMax 内容安全拦截整轮输入 —— 不再静默/
                  裸机器码;「换模型可解」类附「去设置」深链(不自动切换,确认门原则)。 */}
              {chatError && !streaming ? (
                <li
                  data-slot="copilot-error"
                  role="alert"
                  className="flex max-w-[420px] flex-col gap-1 self-start rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2"
                >
                  <span className="text-[12px] leading-relaxed text-destructive">
                    {chatError.message}
                  </span>
                  {chatError.suggestSwitchModel ? (
                    <Link
                      href="/settings"
                      data-slot="copilot-error-settings-link"
                      className="self-start text-[11px] font-medium text-brand underline underline-offset-2"
                    >
                      去设置换一个模型 →
                    </Link>
                  ) : null}
                  {/* [T-231⑩] 出错不再只让用户「请重试」却无处可点:regenerate() 重发
                      最后一条用户消息(@ai-sdk/react 现成 API,不手搓重放)。流式中不渲。 */}
                  {!streaming && messages.length > 0 ? (
                    <button
                      type="button"
                      data-slot="copilot-error-retry"
                      onClick={() => void regenerate()}
                      className="self-start rounded-md border border-destructive/40 px-2 py-0.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      重试
                    </button>
                  ) : null}
                </li>
              ) : null}
              {streaming ? (
                <li
                  data-slot="copilot-thinking"
                  aria-live="polite"
                  className="flex items-center gap-1.5 self-start rounded-lg bg-surface-muted px-2.5 py-1.5 text-xs text-muted-foreground"
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
              <p className="text-[13px] font-medium text-foreground">
                描述你的目标，我来帮你规划下一步
              </p>
              <p className="text-xs text-muted-foreground">
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
            {/* [T-055b] @引用命中的项目 chip 收编到头部常驻 context-chips(避免双 chip)。 */}
            <div
              className="flex flex-wrap items-center justify-between gap-2"
              data-slot="suggested-action-chips"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                {vm.chips.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    // [T-231⑨] 真预调:完整话术预填 + 语义工具一次性置顶(不自动发,T-055b)。
                    onClick={() => applyQuickPrompt(action, action.label)}
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
                  onClick={() => {
                    setPrompt("");
                    // [T-231⑨] 清空输入同时撤销 chip 的一次性工具置顶(话术没了,预调也不该留)。
                    quickFunctionKeyRef.current = null;
                  }}
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
          T-029:仅「全局助手」模式(右下角/⌘K)展示;surface Copilot 聚焦任务、不展示次区。
          [T-095] 板块重合修复:原 shrink-0 让次区在空间不足时拒绝收缩,对话主区(min-h-0)反被
          压到小于其最小内容 → 输入框直接画在三卡上(重叠实锤)。改成可收缩(去 shrink-0),
          flex 在空间不足时压缩次区自身(内部继续滚动),永不与主区重叠。 */}
      {showSecondary && (
      <div
        data-slot="copilot-secondary"
        className="@container flex max-h-[230px] min-h-0 flex-col gap-3 overflow-y-auto"
      >
      {/* CopilotDashboard ---------------------------------------------- */}
      <section
        aria-labelledby="ai-copilot-dashboard-title"
        data-slot="copilot-dashboard"
        data-region="dashboard"
        data-slot-region="copilot-region"
        className="grid shrink-0 grid-cols-1 gap-3 @[640px]:grid-cols-3"
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
                // [T-231⑨] 推荐指令同机制:完整话术预填 + 工具置顶(缺省退化为填 title)。
                onClick={() => applyQuickPrompt(cmd, cmd.title)}
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
                    {/* [T-095②] 副文:有词表副文/项目关联才渲,不再渲无意义的「项目:—」。 */}
                    <span className="min-w-0 truncate text-[9.5px] leading-tight text-muted-foreground">
                      {taskSecondLine(task) ?? ""}
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
                // [T-095②] 第二行说人话:词表副文 > 项目关联 > 不渲(不再显「项目:—」)。
                const sub = taskSecondLine(task);
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
                        {sub ?? ""}
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
                // [T-231⑨] 快速开始同机制:预填 + 工具置顶(缺省退化为填 title)。
                onClick={() => applyQuickPrompt(rec, rec.title)}
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
