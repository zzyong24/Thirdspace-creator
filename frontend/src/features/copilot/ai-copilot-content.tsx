"use client";

import {getLiveChatSession} from "./live-chat-session";

/**
 * Copilot 页面负责输入、流式消息、候选卡与原任务控制。
 * `/api/chat` 只提交持久 chat.run 并订阅事件，模型和工具循环由独立 Worker 执行。
 * useChat 保留为消息协议与 UI 状态适配；停止订阅与取消后台任务分别处理。
 * 候选经用户采纳后由 backend 落库，完成消息也由 backend 持久化。
 * 最近任务读取真实 ai.tasks.list，恢复与取消使用原 executionTaskId；空列表显示空态。
 */

import {TaskRuntimeActions,taskRuntimeStatus} from "@/components/ai/task-runtime-actions";
import {ExecutionTaskCard} from "./execution-task-card";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { useForegroundActivity } from "@/lib/foreground-activity";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  DefaultChatTransport,
  isToolUIPart,
  getToolName as sdkGetToolName,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import { ChatCandidateCard, type ChatTopicCandidate } from "./chat-candidate-card";
import { ChatEnrichCard, type ChatEnrichCardData } from "./chat-enrich-card";
import { ChatHookCard, type ChatHookItem } from "./chat-hook-card";
import {
  ChatScriptPatchCard,
  type ChatScriptPatchCandidate,
} from "./chat-script-patch-card";
import { ChatScriptDraftCard } from "./chat-script-draft-card";
import { ChatVideoEditCard, type ChatVideoEditCandidate } from "./chat-video-edit-card";
import { ChatPublishPackageCard } from "./chat-publish-package-card";
import { ChatGatherCard, type ChatGatherItem } from "./chat-gather-card";
import { joinCopilotMessageText } from "./copilot-message-text";
import { CopilotUserMessageText } from "./copilot-user-message";
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
// [T-253] 本机文件读取卡(运行时确认卡「允许一次/总是允许该目录/拒绝」/ 文本窗口 / 目录清单 / 拒读态)。
import {
  ChatLocalReadCard,
  type LocalReadApproval,
  type LocalReadFile,
  type LocalReadListing,
  type LocalReadFoundByName,
  type LocalReadCandidates,
} from "./chat-local-read-card";
import { ChatGenerateCard } from "./chat-generate-card";
import {
  registerGeneratedAssetAlias,
  type GeneratedAssetAliasRegistry,
} from "./asset-aliases";
import { ChatDouyinShareCard } from "./chat-douyin-share-card";
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
import { ChatThesisCard } from "./chat-thesis-card";
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
  ChartLine,
  Clock3,
  Crosshair,
  FileSearch,
  FolderOpen,
  Plus,
  Sparkles,
  Video,
  Wand2,
  Image as ImageIcon,
} from "lucide-react";

import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  buildCopilotViewModel,
  IMAGE_MATERIAL_PREFILL,
  VIDEO_MATERIAL_PREFILL,
} from "@/fixtures/selectors";
import {
  CHAT_TOOL_LABELS,
  SCHEDULED_TASK_TYPE_LABELS,
} from "@creatoros/contract";

/**
 * [T-439 配套] 工具名还原 —— **卡片能不能渲出来全靠它**。
 *
 * 后端在发给模型前把工具名的 `.` 换成 `_`(DeepSeek/OpenAI/Anthropic 对
 * `tools[].function.name` 一律要求 `^[a-zA-Z0-9_-]+$`,点号会被 400 秒拒),于是 AI SDK 回传的
 * ToolUIPart 类型变成 `tool-topic_enrich`,SDK 的 getToolName 取出来就是 `topic_enrich`。
 * 而本文件下面有 **22 处**按原名比对(`name === "topic.enrich"` 等)—— 不还原就全部比不上,
 * 表现为「工具明明调用成功了,卡片却渲不出来」(2026-07-20 用户真机反馈,是 T-439 的回归)。
 *
 * 安全性:工具名注册表里 **0 个**名字含下划线(后端有测锚钉住这条不变式),故 `_`→`.` 无歧义。
 * 更彻底的做法是在 provider 中间件层做名字转换、让 SDK 上层始终看到原名(见 T-444)。
 */
function getToolName(part: Parameters<typeof sdkGetToolName>[0]): string {
  return String(sdkGetToolName(part)).replace(/_/g, ".");
}

/**
 * T-716:局部改稿不是“请求发出去”就算完成，必须等到 script.patch 候选真正回到前端。
 * 这样 provider 中断、工具参数不合法或用户点停止时，都不会提前消费当前段落锚点。
 */
function hasCompletedScriptPatch(messages: readonly UIMessage[]): boolean {
  return messages.some(
    (message) =>
      message.role === "assistant" &&
      message.parts.some((part) => {
        if (!isToolUIPart(part) || getToolName(part) !== "script.patch") {
          return false;
        }
        if (part.state !== "output-available") return false;
        const output = part.output as { kind?: unknown } | undefined;
        return output?.kind === "script.patch";
      }),
  );
}
// [T-094] AI 链路错误 → 人话共享映射(与服务端同一张表;客户端兜底二次转译)。
import {
  humanizeAiErrorMessage,
  describeUserError,
} from "@/lib/ai-error-humanize";
import { openAiCreditCenter } from "@/lib/open-ai-credit-center";
import { client } from "@/lib/contract-client";
import { creatorApiHeaders, readCurrentAccountId } from "@/lib/http-transport";
import type { BasePageViewModel } from "@/types/view-models";
import {
  readStoredConversationId,
  writeStoredConversationId,
  toUIMessages,
  // [T-239e] 会话成本角标:历史底数(落库行的 token 列)+ 流式增量(metadata.usage)分账相加。
  sumUsageTokens,
  sumStreamedUsage,
  type WireAIMessage,
} from "./conversation-persistence";
// [T-096] 会话作用域:入口参数 → scope(纯函数),历史/恢复/新对话全按它分桶。
import { resolveChatScope, scopeHistoryLabel } from "./chat-scope";
// [T-239g] 长任务完成 → 对话内通知卡:纯检测逻辑(轮询 feed 检出「新到终态」的任务)。
import {
  detectTaskNotifications,
  mergeTaskNotifications,
  type TaskNotification,
} from "./task-notifications";
import {
  detectMentionQuery,
  filterProjectOptions,
  applyProjectMention,
  type ProjectOption,
  type MentionedProject,
} from "./project-mention";
import { ProjectMentionMenu } from "./project-mention-menu";
import { shouldResumeToolApprovalOnce } from "./tool-approval-resume-guard";
import {
  CopilotAttachmentPicker,
  type CopilotAttachmentPickerHandle,
  type CopilotAttachmentState,
} from "./copilot-attachment-picker";
import {
  extractChatApiPublicError,
  isTerminalScriptSelectionError,
} from "./chat-api-error";

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
      | "video"
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
        readonly artifactId?: string;
        readonly versionId?: string;
        readonly sectionIndex?: number;
        readonly excerpt?: string;
      };
      readonly nonce: number;
    } | null;
  };
}

type EmbeddedDraftChatRequest = Exclude<
  NonNullable<AICopilotContentProps["embed"]>["request"],
  null | undefined
>;

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
  readonly executionTaskId?:string|null;
  readonly runtimeStatus?:string|null;
  readonly requestedAt: string;
  // [T-239g] 失败通知需诚实带原因 —— ai.tasks.list 返回 aiTaskResource 已含 errorMessage,
  // 此前 WireTask cast 未取(feed 用不到);通知卡要读它,故在此补齐(老调用侧零影响)。
  readonly errorMessage?: string | null;
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
// 快捷 chip(composer 下方一排)图标 —— [T-354] 次区已删,本组件是 chips 专用、保留。
function ChipIcon({
  kind,
}: {
  kind:
    | "crosshair"
    | "wand"
    | "file-search"
    | "sparkles"
    | "image"
    | "video"
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
    case "video":
      return <Video className="size-3.5" aria-hidden="true" />;
    case "line-chart":
      return <ChartLine className="size-3.5" aria-hidden="true" />;
  }
}

const MENTION_MAX_OPTIONS = 8;


// bug #6:taskType(如 "calibration.diagnose")是机器枚举,用户看不懂。这里给一张中文 label +
// 一句简短副文映射,任务卡显中文标题 + 副文。未知 taskType 回退到原串(诚实兜底,不编一个假中文)。
const TASK_TYPE_LABEL: Record<string, { label: string; sub: string }> = {
  "topic.preference": { label: "更新选题偏好", sub: "从淘汰原因中提炼偏好" },
  "script.source_similarity": { label: "检查稿件原创性", sub: "与引用来源核对相似程度" },
  "asset.classify": { label: "识别图片素材", sub: "补充描述与用途标签" },
  "material.extract": { label: "提取文档资料", sub: "读取全文并整理摘要" },
  "video.decisions": { label: "编排视频", sub: "规划场景、字幕和素材" },
  "benchmark.transcribe": { label: "转写对标作品", sub: "读取作品音频并保存逐字稿" },
  "calibration.diagnose": { label: "编导诊断", sub: "逐维度盲评内容" },
  "topic.generate": { label: "AI 出题", sub: "生成选题候选" },
  "topic.enrich": { label: "选题补全", sub: "补全成完整选题卡" },
  "planning.thesis": { label: "梳理观点", sub: "生成可选论点骨架" },
  "cover.generate": { label: "生成封面", sub: "结构化封面方案 + 生图" },
  "intelligence.douyin.share": {
    label: "抖音分享建档",
    sub: "持久归档，可选明确授权的转写",
  },
  "review.analyze": { label: "复盘分析", sub: "提炼可复用爆款要素" },
  "script.review": { label: "文案审核", sub: "违禁词 lint + 语义审" },
  "positioning.generate": { label: "定位策略", sub: "生成结构化定位提案" },
  "script.draft": { label: "脚本初稿", sub: "起草口播脚本" },
  "script.patch": { label: "局部改稿", sub: "只改选中的段落" },
  "script.rewrite": { label: "脚本改写", sub: "按反馈重写脚本" },
  "material.match": { label: "素材匹配", sub: "为脚本匹配素材" },
  "publish.platform_adapt": { label: "发布适配", sub: "适配多平台发布物料" },
  "research.gather_material": { label: "找素材", sub: "收集研究素材" },
  "research.gather": { label: "找素材", sub: "收集研究素材" },
  "research.analyze": { label: "研究分析", sub: "分析研究结论" },
  "copilot.assist": { label: "AI 助手", sub: "对话式创作建议" },
  // 持久任务 kind（不是 chat tool 名）；通知/任务状态按 execution 真值显示。
  share_import: { label: "抖音内容建档", sub: "读取并归档分享作品" },
  transcribe: { label: "语音转写", sub: "提取逐字稿" },
  "reconstruct.project": { label: "历史作品重建", sub: "依据逐字稿还原创作结构" },
  // [T-255a] 执行层任务(exec.* 命名空间,脑手分离)。
  "exec.echo.manifest": { label: "执行自检", sub: "沙箱执行框架演示" },
  "exec.video.render": { label: "渲染成片", sub: "模板确定性渲染视频" },
};

// taskType → 中文标题(bug #6)。命中映射用中文 label;否则回退到原 taskType 串(诚实,不伪造)。
// [T-095] 调度采集任务(scheduled.*)走统一词表 SCHEDULED_TASK_TYPE_LABELS(lib/chat-tool-labels),
// 不再满屏渲内部 op id。[T-239g] 抽出 taskTypeLabel(纯 taskType 入参)供通知卡复用同一词表。
function taskTypeLabel(taskType: string): string {
  return (
    TASK_TYPE_LABEL[taskType]?.label ??
    SCHEDULED_TASK_TYPE_LABELS[taskType]?.label ??
    taskType
  );
}

// [T-286] token 计数紧凑显示(1,191,893 → 1.2M / 26,262 → 26.3K)—— 会话成本角标里的原始
// toLocaleString 长串(百万级)在窄栏(制作视频右栏)把标题挤成竖排;紧凑后大幅省宽。
function formatCompactTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// [T-276] 取路径的直接父目录字符串(纯字符串,不 realpath)—— 供「一次目录授权批量放行同目录
// 兄弟卡」匹配。读文件夹的多文件读,各卡的原始路径共享同一父目录,据此收敛为一次授权。
function parentDirOf(p: string): string {
  const trimmed = p.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx > 0 ? trimmed.slice(0, idx) : "";
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

// [T-239g] 在途任务存在时,以此间隔轮询 ai.tasks.list 检测其到终态 → 推通知(无在途则不轮询,
// 见下方 effect)。8s 比 ExecutionTaskCard 的 4s 宽松 —— 通知不追求秒级实时,省网络。
const TASK_FEED_POLL_MS = 8000;

// [T-239g] 通知卡按状态选文案 + 配色 token(复用全站 success/destructive/amber 语义,不手搓颜色)。
const NOTIFY_STATUS_META: Record<
  TaskNotification["status"],
  { verb: string; hint: string; dot: string; text: string }
> = {
  waiting_user:{verb:"等待处理",hint:"处理原任务提示后可继续。",dot:"bg-warning",text:"text-warning"},
  unknown_result:{verb:"结果待核对",hint:"调用可能已发生，请保留原任务核对结果。",dot:"bg-warning",text:"text-warning"},
  paused:{verb:"已暂停",hint:"可以继续原任务。",dot:"bg-warning",text:"text-warning"},
  partial:{verb:"已完成部分",hint:"已保存实际完成的结果。",dot:"bg-warning",text:"text-warning"},
  succeeded: {
    verb: "已完成",
    hint: "任务跑完了，结果可在任务列表查看。",
    dot: "bg-success",
    text: "text-success",
  },
  awaiting_confirmation: {
    verb: "待确认",
    hint: "已跑完初稿，等待你确认结果。",
    dot: "bg-amber-500",
    text: "text-amber-600",
  },
  failed: {
    verb: "执行失败",
    hint: "",
    dot: "bg-destructive",
    text: "text-destructive",
  },
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
  "planning.thesis":
    "这条内容需要先梳理观点。请为当前项目生成一份可选的论点骨架；我确认采用后再用于生成式写稿。",
  "script.patch": "请按我的要求只改选中的这一段，先给我修改前后对照，我确认后再写入稿面。",
  "material.gather": "围绕这条内容的主题帮我搜一批可用素材(案例、数据、金句)。",
  // 通用 AI 素材生成(配图/B-roll;依赖设置里配好的生图/生视频模型;未配时工具卡自带「去设置」降级)。
  "material.generate":
    "帮我为这条内容生成一张配图/一个画面素材(走我在设置里配置的生图模型;如果我还没配生图模型,请直接告诉我并指路去设置配置)。",
  "material.generate.image": IMAGE_MATERIAL_PREFILL,
  "material.generate.video": VIDEO_MATERIAL_PREFILL,
  // [T-271] 制作封面链 —— 硬锚立项核心信息 + 口播稿产结构化封面文案(过诚实门,不编数字)并生图。
  "cover.generate":
    "帮我为这条内容生成封面:先基于这条的立项核心信息和口播稿产一版封面文案方案(主标题/副标题/信息点 + 主视觉 + 构图),封面文案不许编造数字/成绩,再据此生成封面图(走我在设置里配置的生图模型;如果我还没配生图模型,请直接告诉我并指路去设置配置)。",
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

/**
 * [T-473] 深链/稿面请求里的 functionKey 是一次性命令，不是会话永久上下文。
 * 同一个 key 的普通重渲不重新武装；只有入口命令真的变化时，下一次请求才再消费一次。
 */
export function createOneShotFunctionKey(
  initial?: string,
  initialIdentity: string | undefined = initial,
): {
  sync: (next?: string, identity?: string) => void;
  consume: () => string | null;
} {
  let currentIdentity = initialIdentity;
  let pending: string | null = initial ?? null;
  return {
    sync(next, identity = next) {
      if (identity === currentIdentity) return;
      currentIdentity = identity;
      pending = next ?? null;
    },
    consume() {
      const value = pending;
      pending = null;
      return value;
    },
  };
}

export function AICopilotContent({
  viewModel,
  embed,
}: AICopilotContentProps = {}) {
  const vm = viewModel ?? buildCopilotViewModel();

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
  // [T-716] “输入框里的话术”和“这句话对应的工具/段落锚点”必须是一个原子命令。
  // 旧实现直接在 render 时读取 Provider 的单一 request 槽，但预填为了保护用户已输入内容
  // 又可能保留上一条话术；一旦随后有另一个 openChat 覆盖 request，就会出现：输入框仍写着
  // “只改这一段”，发送体却已经没有 script_section 锚点。服务端只能按普通对话处理，模型便
  // 会猜工具甚至误走 video_edit_render。这里把已预填、尚未发送的 request 固定为
  // pendingComposerRequest，直到该轮发送结束才消费；新按钮是用户的明确动作，整条原子替换。
  const [consumedRequestNonce, setConsumedRequestNonce] = React.useState(0);
  const [pendingComposerRequest, setPendingComposerRequest] =
    React.useState<EmbeddedDraftChatRequest | null>(null);
  const pendingComposerRequestRef =
    React.useRef<EmbeddedDraftChatRequest | null>(null);
  // [T-732] 局部改稿按钮包含两个不同生命周期：functionKey 是只消费一次的明确命令；
  // script_section 是可供后续对话继续使用的轻量锚点。首轮候选成功后保留锚点，但自由文本
  // 不再强制走 script.patch——同一个对话模型会按本轮完整语义在局改、整稿或其他能力间选择。
  // 真正的 version/originalText 不信任这里的旧快照，route 每轮都会重读服务端当前稿面。
  const [stickyScriptPatchRequest, setStickyScriptPatchRequest] =
    React.useState<EmbeddedDraftChatRequest | null>(null);
  const stickyScriptPatchRequestRef =
    React.useRef<EmbeddedDraftChatRequest | null>(null);
  // 明确局部命令失败后只允许“重试”按钮复用，普通发送永远不读取这里，避免旧命令劫持新意图。
  const [retryableScriptPatchRequest, setRetryableScriptPatchRequest] =
    React.useState<EmbeddedDraftChatRequest | null>(null);
  const retryableScriptPatchRequestRef =
    React.useRef<EmbeddedDraftChatRequest | null>(null);
  const localComposerNonceRef = React.useRef(-1);
  const [composerLifecycleError, setComposerLifecycleError] =
    React.useState<string | null>(null);
  const inFlightComposerRequestRef = React.useRef<{
    nonce: number;
    functionKey: string;
    messageCountBefore: number;
    mode: "required" | "available";
  } | null>(null);
  const providerRequest = embed?.request ?? null;
  const activeRequest =
    providerRequest && providerRequest.nonce > consumedRequestNonce
      ? providerRequest
      : null;
  const contextRequest =
    pendingComposerRequest ?? activeRequest ?? stickyScriptPatchRequest;
  const functionKey =
    contextRequest?.functionKey || searchParams?.get("fn") || undefined;
  const functionKeyCommandIdentity = contextRequest
    ? `request:${contextRequest.nonce}:${functionKey ?? ""}`
    : functionKey
      ? `url:${surface}:${functionKey}`
      : undefined;
  const entryFunctionKeyRef = React.useRef<
    ReturnType<typeof createOneShotFunctionKey> | null
  >(null);
  if (!entryFunctionKeyRef.current) {
    entryFunctionKeyRef.current = createOneShotFunctionKey(
      functionKey,
      functionKeyCommandIdentity,
    );
  } else {
    entryFunctionKeyRef.current.sync(functionKey, functionKeyCommandIdentity);
  }
  // T-027:选中态从 URL 读(一键岛带 ?selKind=&selId=&selTitle=),装进 ChatContext.selection →
  // 后端注入 system + 工具入参兜底,让 Copilot 知道用户"这条"指哪条,不再瞎答/反复索要标题。
  // [T-108] request.selection(稿面按钮带的 content_output)优先,其次 embed.selection(常驻项目),
  // 最后 URL(浮层深链)。
  const selKind =
    contextRequest?.selection?.kind ??
    embed?.selection?.kind ??
    (searchParams?.get("selKind") || undefined);
  const selId =
    contextRequest?.selection?.id ??
    embed?.selection?.id ??
    (searchParams?.get("selId") || undefined);
  const selTitle =
    contextRequest?.selection?.title ??
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
  const sessionAccountId = readCurrentAccountId();
  const liveSessionKey = JSON.stringify([sessionAccountId, scope]);
  const liveSession = getLiveChatSession(liveSessionKey);
  const liveSessionRef = React.useRef(liveSession);
  liveSessionRef.current = liveSession;
  // [T-055b] 上下文可摘:用户点掉 chip 后,本面板实例不再注入这份选中态(会话继续,
  // 只是后续轮次不带 selection/projectId)。
  const [selectionDismissed, setSelectionDismissed] = React.useState(false);
  // [T-716] 点一次新的稿面按钮就是一次新的明确选择。用户曾经摘掉过旧 chip，不能让那个
  // 面板级 dismissed 状态把新来的 script_section 一并吞掉，否则按钮看似有效、服务端却收不到
  // 段落锚点，模型只能反问 sectionId。nonce 每次点击单调递增，因此这里不会误复活旧选择。
  React.useEffect(() => {
    if ((activeRequest?.nonce ?? 0) > 0) setSelectionDismissed(false);
  }, [activeRequest?.nonce]);
  React.useEffect(() => {
    if (!activeRequest) return;
    if (
      activeRequest.functionKey === "script.patch" &&
      activeRequest.selection?.kind === "script_section"
    ) {
      retryableScriptPatchRequestRef.current = null;
      setRetryableScriptPatchRequest(null);
      stickyScriptPatchRequestRef.current = activeRequest;
      setStickyScriptPatchRequest(activeRequest);
      return;
    }
    // 用户显式点击了另一个功能，旧段落不应暗中污染新的工具调用。
    retryableScriptPatchRequestRef.current = null;
    setRetryableScriptPatchRequest(null);
    stickyScriptPatchRequestRef.current = null;
    setStickyScriptPatchRequest(null);
    if (pendingComposerRequestRef.current?.functionKey === "script.patch") {
      pendingComposerRequestRef.current = null;
      setPendingComposerRequest(null);
    }
  }, [activeRequest]);
  // [T-354] 次区(推荐指令 / 最近任务 / 继续任务 三卡)已整体下架 —— 用户真机反馈冗余(对话 +
  // 快捷 chip 已覆盖其功能;任务进度经对话区顶部完成通知卡呈现)。底层任务轮询保留(喂通知卡)。
  // 会话持久化(本切片):前端持一个 conversationId,放进 transport body(和 chatContext 并列)
  // 让后端续接同一会话;并从 /api/chat 的响应头 `x-conversation-id` 捕获后端 lazy 建/复用的
  // 会话 id 存起来。conversationId 随 scope 切换重置(不同入口各自独立会话)。
  const [conversationId, setConversationId] = React.useState<string | null>(
    liveSession.conversationId,
  );
  // conversationId 放 ref 供 transport 的 body(Resolvable 函数)读最新值,避免因 body 变化
  // 重建 transport(重建会打断进行中的流)。fetch 包装层用 ref 里的 setter 回写捕获到的 id。
  const conversationIdRef = React.useRef<string | null>(null);
  conversationIdRef.current = conversationId;
  const assetAliasRegistryRef = React.useRef<GeneratedAssetAliasRegistry>({
    activeBatchKey: null,
    activeBatchRank: -1,
    aliases: {},
  });
  React.useEffect(() => {
    const onAlias = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          alias?: string;
          assetId?: string;
          batchKey?: string;
          batchRank?: number;
        }>
      ).detail;
      const alias = detail?.alias?.trim() ?? "";
      const assetId = detail?.assetId?.trim() ?? "";
      const batchKey = detail?.batchKey?.trim() ?? "";
      const batchRank = detail?.batchRank;
      if (!alias || !assetId || !batchKey || typeof batchRank !== "number") return;
      assetAliasRegistryRef.current = registerGeneratedAssetAlias(
        assetAliasRegistryRef.current,
        { alias, assetId, batchKey, batchRank },
      );
    };
    window.addEventListener("creatoros:asset-alias-ready", onAlias);
    return () => window.removeEventListener("creatoros:asset-alias-ready", onAlias);
  }, []);
  // 捕获到 x-conversation-id 时:更新 state + 持久化。[T-096] 持久化桶 = scope(global /
  // project:<id> / surface:<name>,入口级隔离);ref 读最新值,让 fetch 包装闭包不随
  // key 变(避免重建 transport 打断流)。
  const scopeRef = React.useRef(scope);
  scopeRef.current = scope;
  const captureConversationId = React.useCallback((id: string) => {
    if (!id) return;
    liveSession.conversationId = id;
    writeStoredConversationId(scope, id);
    if (liveSessionRef.current !== liveSession || conversationIdRef.current === id) return;
    conversationIdRef.current = id;
    setConversationId(id);
  }, [liveSession, scope]);

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
      projectId?: string;
      selection?: {
        kind: string;
        ids: string[];
        label?: string;
        artifactId?: string;
        versionId?: string;
        sectionIndex?: number;
        excerpt?: string;
      };
      assetAliases?: Record<string, string>;
    } = { surface, scope };
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
        ...(contextRequest?.selection?.artifactId
          ? { artifactId: contextRequest.selection.artifactId }
          : {}),
        ...(contextRequest?.selection?.versionId
          ? { versionId: contextRequest.selection.versionId }
          : {}),
        ...(Number.isInteger(contextRequest?.selection?.sectionIndex)
          ? { sectionIndex: contextRequest!.selection!.sectionIndex }
          : {}),
        ...(contextRequest?.selection?.excerpt
          ? { excerpt: contextRequest.selection.excerpt }
          : {}),
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
    selKind,
    selId,
    selTitle,
    mentionedProject,
    selectionDismissed,
    embed?.selection?.kind,
    embed?.selection?.id,
    contextRequest?.selection?.artifactId,
    contextRequest?.selection?.versionId,
    contextRequest?.selection?.sectionIndex,
    contextRequest?.selection?.excerpt,
  ]);
  // [T-716] DefaultChatTransport 会被 useChat 的对话实例在首次挂载时持有。
  // 如果 transport.body 只闭包首帧 chatContextBody，后续在稿面点「AI 改写本段」时，
  // 界面 chip 虽然已经显示 script_section，真实网络请求却仍会发送首帧的 project
  // selection。用 ref 作为每轮请求的真值口：transport 可以保持稳定，body()
  // 在实际发送瞬间仍读到最新段落锚点。服务端随后还会再重读当前稿面版本与正文。
  const chatContextBodyRef = React.useRef(chatContextBody);
  chatContextBodyRef.current = chatContextBody;
  // [T-231⑨] 快捷 chip / 推荐指令的一次性 functionKey:点按钮只**预填**完整话术(T-055b
  // 铁律:绝不自动发),同时把语义对应的专用工具记在 ref 里;下一次发送时注入
  // chatContext.functionKey(服务端 applyFunctionKey 置顶 + forcedTool 第 0 步强制),
  // **读后即清**(一次性)—— 不污染后续自由对话轮次。放 ref 不放 state:body 是
  // Resolvable(每次请求求值),ref 更新不重建 transport(重建会打断进行中的流)。
  const quickFunctionKeyRef = React.useRef<string | null>(null);
  // [T-813] 搜索卡「阅读全文」的一次性执行锚。和 functionKey 同轮消费，服务端在浏览器
  // 抓取前把 web.read 绑定到这个 URL，模型不能换成另一条搜索结果。
  const quickWebReadUrlRef = React.useRef<string | null>(null);
  // 附件只把素材 id 放进本轮 transport body。字节由服务端按当前用户/账号重新验属主后临时读取，
  // 不进对话 JSON、URL、localStorage 或日志。ref 持有“正在发出的这一轮”，避免 picker 清空后丢失。
  const requestAttachmentIdsRef = React.useRef<string[]>([]);
  const attachmentPickerRef = React.useRef<CopilotAttachmentPickerHandle | null>(null);
  const [attachmentState, setAttachmentState] = React.useState<CopilotAttachmentState>({
    ids: [],
    uploading: false,
    count: 0,
  });
  const handleAttachmentStateChange = React.useCallback(
    (next: CopilotAttachmentState) => setAttachmentState(next),
    [],
  );
  const taskControl=React.useRef(liveSession.control);
  taskControl.current = liveSession.control;
  const [stopPending,setStopPending]=React.useState(false);
  const transport = React.useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/chat",
        // [T-220] 每次请求注入当前选中号 header(与 dispatch 同源 localStorage 真值)。chat route
        //   据此 stamp 工具产的 asset(截图/封面)当前号 —— 此前漏注入 → chat 全程无号 → asset
        //   account_id=NULL → blob 取回 404 破图。未选号 → 不带(server 退化全局)。
        // [T-691] 复用统一入口；除账号 header/握手外，会在发请求前同步账号 cookie，
        // 避免切号瞬间 header 与 RSC cookie 差一拍而读到另一个项目空间。
        headers: (): Record<string, string> => creatorApiHeaders(),
        // body 是 Resolvable(每次发请求求值):把当前 conversationId(ref 读最新)和 chatContext
        // 一起带上。首轮 conversationId 为 null → 不带,后端 lazy 建;拿到响应头后续轮带上续接。
        body: () => {
          // [T-231⑨/T-473] chip 与入口 command 都是 one-shot；chip 是更晚的用户显式动作，
          // 本轮覆盖入口 command。二者读后即清，后续自由对话不再强制重复工具。
          const quickFn = quickFunctionKeyRef.current;
          quickFunctionKeyRef.current = null;
          const requestedFn =
            quickFn ?? entryFunctionKeyRef.current?.consume() ?? null;
          const webReadUrl =
            requestedFn === "web.read" ? quickWebReadUrlRef.current : null;
          quickWebReadUrlRef.current = null;
          const latestChatContext = chatContextBodyRef.current.chatContext;
          const chatContext = requestedFn
            ? { ...latestChatContext, functionKey: requestedFn }
            : latestChatContext;
          return {
            chatContext: {
              ...chatContext,
              ...(webReadUrl ? { webReadUrl } : {}),
              ...(Object.keys(assetAliasRegistryRef.current.aliases).length
                ? { assetAliases: assetAliasRegistryRef.current.aliases }
                : {}),
            },
            ...(liveSession.conversationId
              ? { conversationId: liveSession.conversationId }
              : {}),
            ...(requestAttachmentIdsRef.current.length > 0
              ? { attachmentIds: requestAttachmentIdsRef.current }
              : {}),
          };
        },
        // useChat 不直接暴露响应头 → 在 transport 的 fetch 层包一层,读 `x-conversation-id`
        // 后原样把 Response 交回给 SDK(不改流)。这是本 SDK 版本捕获会话 id 最稳的办法。
        fetch: async (input, init) => {
          const epoch = liveSession.epoch;
          const res = await liveSession.control.fetch(input as RequestInfo, init);
          try {
            const cid = res.headers.get("x-conversation-id");
            if (cid && liveSession.epoch === epoch) captureConversationId(cid);
          } catch {
            /* 读头失败不影响流式 */
          }
          return res;
        },
      }),
    [captureConversationId],
  );
  // [T-673] 每个 approval id 只允许自动续跑一次。正常流会推进为 output-available；若服务端/
  // provider 流畸形而仍停在 approval-responded，本 Set 会熔断自动重发，避免同一调用无限转圈。
  const resumedApprovalIdsRef = React.useRef(new Set<string>());
  const resumeApprovedToolsOnce = React.useCallback(
    ({ messages: currentMessages }: { messages: UIMessage[] }) =>
      shouldResumeToolApprovalOnce(
        currentMessages,
        resumedApprovalIdsRef.current,
        lastAssistantMessageIsCompleteWithApprovalResponses,
      ),
    [],
  );

  // [T-231⑩] regenerate:@ai-sdk/react 现成的「重发最后一轮」API(对话出错时的重试通路)。
  // [T-263] addToolApprovalResponse:HITL 授权卡「允许/拒绝」的回执口。sendAutomaticallyWhen 挂
  // lastAssistantMessageIsCompleteWithApprovalResponses —— local.read 的授权响应齐了就
  // **同回合自动 resume** execute,无新 user 消息、无第二回合叙述(根治「点了还得手动发」)。
  liveSession.transport = transport;
  liveSession.shouldResume = input => readCurrentAccountId() === sessionAccountId && resumeApprovedToolsOnce(input);
  const {
    messages,
    sendMessage,
    status,
    stop,
    setMessages,
    error,
    regenerate,
    addToolApprovalResponse,
  } = useChat({
    chat: liveSession.chat,
    experimental_throttle: 50,
  });
  React.useEffect(() => {
    if (liveSession.conversationId && conversationIdRef.current !== liveSession.conversationId) {
      conversationIdRef.current = liveSession.conversationId;
      setConversationId(liveSession.conversationId);
    }
  }, [liveSession, messages, status]);
  const stopTask=async()=>{
    if(stopPending)return;
    setStopPending(true);
    try{await taskControl.current.cancel();stop();}
    catch{setComposerLifecycleError("停止请求尚未确认，请重试停止，或到任务中心核对原任务。");}
    finally{setStopPending(false);}
  };
  const streaming = status === "streaming" || status === "submitted";
  // [T-332 S4] AI 流式生成中 = 进行中的前台操作:登记进 foreground-activity 注册表,
  // 账号切换器切号前会据此弹确认「有进行中的操作,切号会离开当前页面」(SPEC §6.1)。
  useForegroundActivity("AI 编导正在生成回复", streaming);

  // [T-276] 待决的 local.read 授权(approval-requested)—— 支撑两件事:
  //   ① 一次「总是允许该目录」批量放行同目录其它待决卡(读文件夹别逐个弹);
  //   ② 有待授权时提交排队(不并发触发新一轮,仿 Claude Code 的权限门)。
  const pendingLocalReads = React.useMemo(() => {
    const out: Array<{ approvalId: string; path: string }> = [];
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const p of m.parts) {
        if (!isToolUIPart(p)) continue;
        if (getToolName(p) !== "local.read") continue;
        if (p.state !== "approval-requested") continue;
        const id = p.approval?.id ?? "";
        const path = ((p.input ?? {}) as { path?: string }).path ?? "";
        if (id) out.push({ approvalId: id, path });
      }
    }
    return out;
  }, [messages]);
  const hasPendingApproval = pendingLocalReads.length > 0;

  // [T-276] 目录授权批量放行:一张卡点「总是允许该目录」→ 服务端已把该文件所在目录落进授权表,
  //   把**直接父目录相同**的其它待决 local.read 卡一并批准(读文件夹的多文件读共享父目录)。
  //   只匹配同一层目录(不递归、不跨目录),稳妥;匹配不到的保持独立待决。全部批准后
  //   sendAutomaticallyWhen 一次性 resume 续跑各读取。
  const approveDirBatch = React.useCallback(
    (approvalId: string) => {
      void addToolApprovalResponse({ id: approvalId, approved: true });
      const self = pendingLocalReads.find((x) => x.approvalId === approvalId);
      const dir = self?.path ? parentDirOf(self.path) : "";
      if (!dir) return;
      for (const pr of pendingLocalReads) {
        if (pr.approvalId === approvalId || !pr.path) continue;
        if (parentDirOf(pr.path) === dir) {
          void addToolApprovalResponse({ id: pr.approvalId, approved: true });
        }
      }
    },
    [pendingLocalReads, addToolApprovalResponse],
  );

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
  const terminalScriptSelectionError = isTerminalScriptSelectionError(error);
  const chatError = React.useMemo(() => {
    if (!error && !composerLifecycleError) return null;
    if (!error && composerLifecycleError) {
      return {
        title: "这次没有生成成功",
        message: composerLifecycleError,
        suggestSwitchModel: false,
        suggestOpenCredits: false,
        suggestOpenPositioning: false,
        canRetry: true,
      };
    }
    if (!error) return null;
    const raw = error.message || String(error);
    const human = humanizeAiErrorMessage(raw);
    const chatApiPublicError = extractChatApiPublicError(error);
    const localPatchWasPreserved =
      (pendingComposerRequest?.functionKey === "script.patch" ||
        retryableScriptPatchRequest?.functionKey === "script.patch") &&
      !human?.suggestOpenCredits &&
      !chatApiPublicError;
    const publicMessage =
      (terminalScriptSelectionError
        ? "稿面版本已经变化，本次局部改写已结束。你可以继续普通对话；如需改这一段，请在当前稿面重新点一次“AI 改写本段”。"
        : null) ??
      human?.message ??
      chatApiPublicError ??
      (localPatchWasPreserved
        ? "本次局部改写中断，稿面未被修改，目标段落已保留。请直接重试。"
        : null) ??
      describeUserError(error, "出错了，请重试。");
    const suggestSwitchModel =
      human?.suggestSwitchModel ?? /在设置里换一个模型/.test(raw);
    const suggestOpenCredits = human?.suggestOpenCredits ?? false;
    const suggestOpenPositioning = human?.suggestOpenPositioning ?? false;
    const isMissingModel = human?.code === "model_not_configured";
    return {
      title: suggestOpenCredits
        ? "AI 额度需要补充"
        : suggestOpenPositioning
          ? "先完成账号定位"
          : isMissingModel
            ? "完成 AI 设置后继续"
            : suggestSwitchModel
              ? "检查 AI 设置后继续"
              : terminalScriptSelectionError
                ? "这次局部改写已结束"
                : "这次没有生成成功",
      // 可恢复状态只讲用户下一步，不把版本、渠道、凭据或供应商细节露在主界面。
      message: suggestOpenCredits
        ? "刚才输入的内容已经保留。补充额度后，回来即可继续。"
        : suggestOpenPositioning
          ? "刚才输入的内容已经保留。保存一版定位后，回来即可继续。"
          : suggestSwitchModel
            ? "刚才输入的内容已经保留。完成设置后，回来即可继续。"
            : terminalScriptSelectionError || localPatchWasPreserved || chatApiPublicError
              ? publicMessage
              : "刚才输入的内容还在，可以直接再试一次。",
      suggestSwitchModel,
      suggestOpenCredits,
      suggestOpenPositioning,
      canRetry:
        !terminalScriptSelectionError &&
        !suggestOpenCredits &&
        !suggestOpenPositioning &&
        !suggestSwitchModel,
    };
  }, [
    composerLifecycleError,
    error,
    pendingComposerRequest?.functionKey,
    retryableScriptPatchRequest?.functionKey,
    terminalScriptSelectionError,
  ]);
  const [openingCredits, setOpeningCredits] = React.useState(false);
  const [creditOpenError, setCreditOpenError] = React.useState<string | null>(null);
  const handleOpenCredits = React.useCallback(async () => {
    if (openingCredits) return;
    setOpeningCredits(true);
    setCreditOpenError(null);
    try {
      await openAiCreditCenter();
    } catch (cause) {
      setCreditOpenError(
        describeUserError(cause, "暂时无法打开额度页面，请稍后重试。"),
      );
    } finally {
      setOpeningCredits(false);
    }
  }, [openingCredits]);

  // 受控输入(useChat v7 不再托管 input;自管 + sendMessage({text}))。
  const [prompt, setPrompt] = React.useState<string>(vm.prompt);
  const isEmpty = prompt.trim().length === 0 && attachmentState.ids.length === 0;

  const finishComposerRequest = React.useCallback((nonce: number) => {
    setConsumedRequestNonce((current) => Math.max(current, nonce));
    if (pendingComposerRequestRef.current?.nonce === nonce) {
      pendingComposerRequestRef.current = null;
    }
    setPendingComposerRequest((current) =>
      current?.nonce === nonce ? null : current,
    );
  }, []);

  // [T-732] stale/缺失锚点不是瞬时模型故障，重发上一轮只会再次命中同一个 409。这里把
  // 一次性命令、连续修订锚点和 in-flight 生命周期一起收口；项目上下文仍由 embed 保留，
  // 所以下一条普通消息可立即恢复，而新的局部改稿必须来自用户重新点击当前稿面段落。
  const recoveredTerminalSelectionErrorRef = React.useRef<unknown>(null);
  React.useEffect(() => {
    if (!terminalScriptSelectionError || !error) {
      recoveredTerminalSelectionErrorRef.current = null;
      return;
    }
    if (recoveredTerminalSelectionErrorRef.current === error) return;
    recoveredTerminalSelectionErrorRef.current = error;
    const failedRequest =
      pendingComposerRequestRef.current ??
      stickyScriptPatchRequestRef.current ??
      (activeRequest?.functionKey === "script.patch" ? activeRequest : null);
    inFlightComposerRequestRef.current = null;
    quickFunctionKeyRef.current = null;
    retryableScriptPatchRequestRef.current = null;
    setRetryableScriptPatchRequest(null);
    stickyScriptPatchRequestRef.current = null;
    setStickyScriptPatchRequest(null);
    setComposerLifecycleError(null);
    if (failedRequest) {
      finishComposerRequest(failedRequest.nonce);
    } else {
      pendingComposerRequestRef.current = null;
      setPendingComposerRequest(null);
    }
    console.warn("[T-732][script.patch] terminal selection cleared", {
      nonce: failedRequest?.nonce ?? null,
    });
  }, [activeRequest, error, finishComposerRequest, terminalScriptSelectionError]);

  const beginComposerRequest = React.useCallback(
    (request: EmbeddedDraftChatRequest) => {
      setComposerLifecycleError(null);
      pendingComposerRequestRef.current = request;
      setPendingComposerRequest(request);
      inFlightComposerRequestRef.current = {
        nonce: request.nonce,
        functionKey: request.functionKey,
        messageCountBefore: messages.length,
        mode: "required",
      };
      console.info("[T-716][script.patch] composer request started", {
        nonce: request.nonce,
        functionKey: request.functionKey,
        selectionKind: request.selection?.kind ?? null,
        sectionIndex: request.selection?.sectionIndex ?? null,
        messageCountBefore: messages.length,
      });
    },
    [messages],
  );

  // 明确按钮回合要求真实候选；自由跟进回合只把段落作为可选锚点。两者必须分别结算，
  // 否则模型正常转向整稿/回答问题也会被误报成“没有局部候选”，并把旧命令继续卡住。
  React.useEffect(() => {
    const inFlight = inFlightComposerRequestRef.current;
    if (!inFlight || error || status !== "ready") return;
    const newMessages = messages.slice(inFlight.messageCountBefore);
    if (!newMessages.some((message) => message.role === "assistant")) return;
    const completedScriptPatch = hasCompletedScriptPatch(newMessages);
    if (inFlight.mode === "available") {
      inFlightComposerRequestRef.current = null;
      setComposerLifecycleError(null);
      if (!completedScriptPatch) {
        // 模型已经按本轮语义选择了整稿、其他工具或纯对话；旧段落到此结束，避免下一轮
        // 仍携带一个用户已经转离的上下文。若模型确实继续局改，则锚点继续保留。
        stickyScriptPatchRequestRef.current = null;
        setStickyScriptPatchRequest(null);
      }
      return;
    }
    // 正常 transport 会在发请求时消费 quickFunctionKey；兼容替换式重试/测试适配器没有
    // 再求值 body 的情况，明确回合一旦结束也必须兜底清掉，不能泄漏到下一次普通发送。
    quickFunctionKeyRef.current = null;
    entryFunctionKeyRef.current?.consume();
    if (inFlight.functionKey === "script.patch" && !completedScriptPatch) {
      // 明确按钮已经结束却没有候选：结束本轮命令并保存一个仅供“重试”按钮读取的快照。
      // 普通发送永远不会从 retryable 取命令，因此用户可以立即转向整稿或其他问题。
      inFlightComposerRequestRef.current = null;
      const failedRequest = pendingComposerRequestRef.current;
      if (failedRequest?.nonce === inFlight.nonce) {
        retryableScriptPatchRequestRef.current = failedRequest;
        setRetryableScriptPatchRequest(failedRequest);
      }
      finishComposerRequest(inFlight.nonce);
      setComposerLifecycleError(
        "本轮回复没有生成可采纳的局部改稿候选，稿面未被修改，目标段落已保留。请直接重试。",
      );
      console.warn("[T-716][script.patch] assistant finished without candidate", {
        nonce: inFlight.nonce,
        newMessageCount: newMessages.length,
        assistantMessageCount: newMessages.filter((message) => message.role === "assistant")
          .length,
      });
      return;
    }
    inFlightComposerRequestRef.current = null;
    retryableScriptPatchRequestRef.current = null;
    setRetryableScriptPatchRequest(null);
    finishComposerRequest(inFlight.nonce);
  }, [error, finishComposerRequest, messages, status]);

  const retryLastTurn = React.useCallback(() => {
    setComposerLifecycleError(null);
    const request =
      pendingComposerRequestRef.current ?? retryableScriptPatchRequestRef.current;
    if (request) {
      // entry function key 在失败的首次请求中已被 one-shot 消费；重试前重新武装，保证
      // regenerate 仍是 script.patch，而不是退化为普通闲聊或整稿生成。
      quickFunctionKeyRef.current = request.functionKey;
      const lastUserMessageIndex = messages.findLastIndex(
        (message) => message.role === "user",
      );
      inFlightComposerRequestRef.current = {
        nonce: request.nonce,
        functionKey: request.functionKey,
        // regenerate 会替换上一条 assistant，不能以重试前总条数切片，否则永远看不到结果。
        messageCountBefore:
          lastUserMessageIndex >= 0 ? lastUserMessageIndex + 1 : messages.length,
        mode: "required",
      };
    }
    return regenerate();
  }, [messages, regenerate]);

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
    const req = activeRequest;
    if (!req || req.nonce === 0) return;
    if (req.nonce === handledRequestNonceRef.current) return;
    const text = req.prefill;
    if (!text) {
      handledRequestNonceRef.current = req.nonce; // 空话术:标记消费,别反复触发。
      finishComposerRequest(req.nonce);
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
      beginComposerRequest(req);
      quickFunctionKeyRef.current = req.functionKey;
      setPrompt("");
      const pending = Promise.resolve(sendMessage({ text }));
      // sendMessage Promise 只代表请求已提交，不代表流、工具和候选卡成功。附件等本轮资源
      // 可在 settle 后释放，但稿面锚点由上面的成功 effect 负责消费。
      void pending.catch(() => undefined);
      return;
    }
    handledRequestNonceRef.current = req.nonce;
    // 新按钮是一次新的、明确的用户动作。话术和锚点必须一起替换，不能保留上一条输入却暗中
    // 换成新的 selection；否则用户看到的是 A 指令，服务端收到的却是 B 上下文。
    pendingComposerRequestRef.current = req;
    setPendingComposerRequest(req);
    setPrompt(text);
    lastPrefillRef.current = text;
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [activeRequest, streaming, sendMessage, finishComposerRequest, beginComposerRequest]);

  const submit = React.useCallback(() => {
    const value =
      prompt.trim() ||
      (attachmentState.ids.length > 0 ? "请读取并分析我附上的内容。" : "");
    // [T-276] 有待确认的本机读取授权时,提交排队(不发)—— 先处理上方授权卡,避免并发触发新一轮
    // (仿 Claude Code 权限门;与 T-274 悬空调用净化互补:那边止崩,这边治源不让它并发)。
    if (
      value.length === 0 ||
      streaming ||
      hasPendingApproval ||
      attachmentState.uploading
    ) {
      return;
    }
    setComposerLifecycleError(null);
    requestAttachmentIdsRef.current = [...attachmentState.ids];
    // provider 失败后，旧的明确按钮命令仍可由“重试”复用，但用户此刻主动发送的是一条
    // 新消息。先把失败命令移入 retry-only 槽，不能让普通 submit 再次读取并强制 patch。
    const failedInFlight = error ? inFlightComposerRequestRef.current : null;
    const failedRequiredNonce =
      failedInFlight?.mode === "required" ? failedInFlight.nonce : null;
    const failedPendingRequest = pendingComposerRequestRef.current;
    if (
      failedRequiredNonce !== null &&
      failedPendingRequest?.nonce === failedRequiredNonce
    ) {
      retryableScriptPatchRequestRef.current = failedPendingRequest;
      setRetryableScriptPatchRequest(failedPendingRequest);
      inFlightComposerRequestRef.current = null;
      quickFunctionKeyRef.current = null;
      entryFunctionKeyRef.current?.consume();
      finishComposerRequest(failedPendingRequest.nonce);
    }
    const stickyRequest =
      !selectionDismissed &&
      stickyScriptPatchRequestRef.current?.functionKey === "script.patch" &&
      stickyScriptPatchRequestRef.current.selection?.kind === "script_section"
        ? stickyScriptPatchRequestRef.current
        : null;
    // 首轮显式按钮保留原 nonce；连续修订用负数本地 nonce 跟踪本轮生命周期。负数不会推进
    // provider 的 consumedRequestNonce，因此下一次真实按钮仍能正常覆盖当前上下文。
    const explicitRequest =
      pendingComposerRequestRef.current ??
      (activeRequest?.nonce !== failedRequiredNonce ? activeRequest : null);
    if (explicitRequest) {
      beginComposerRequest(explicitRequest);
      // transport.body 是发送瞬间求值；同步写 ref，避免 React state 尚未提交就退化为普通聊天。
      quickFunctionKeyRef.current = explicitRequest.functionKey;
    } else if (stickyRequest) {
      // 用户没有点“重试”而是发送了新消息，说明已经离开上一次失败命令；旧重试快照到此失效，
      // 避免将来一次无关的网络错误又被误写成“局部改写中断”。段落本身仍只是本轮可选锚点。
      retryableScriptPatchRequestRef.current = null;
      setRetryableScriptPatchRequest(null);
      // 连续对话只携带可信段落锚点，不再复用按钮的一次性 functionKey。模型可以继续 patch，
      // 也可以按“生成完整稿/回答问题”等本轮意图选择其他工具或纯文本。
      inFlightComposerRequestRef.current = {
        nonce: localComposerNonceRef.current--,
        functionKey: "script.patch",
        messageCountBefore: messages.length,
        mode: "available",
      };
    }
    // useChat 正常返回 Promise；测试 seam 或兼容适配器可能返回 void。统一包成 Promise，
    // 既保证附件 ids 活到 transport 读取本轮 body，又不让旧适配器触发 finally 崩溃。
    const pending = Promise.resolve(sendMessage({ text: value }));
    setPrompt("");
    attachmentPickerRef.current?.clear();
    void pending.finally(() => {
      requestAttachmentIdsRef.current = [];
    });
  }, [
    prompt,
    streaming,
    hasPendingApproval,
    sendMessage,
    attachmentState.ids,
    attachmentState.uploading,
    activeRequest,
    beginComposerRequest,
    error,
    finishComposerRequest,
    messages.length,
    selectionDismissed,
  ]);

  // [T-231⑨] 快捷按钮(composer chips / 推荐指令 / 快速开始)统一走真预调:完整话术预填
  // 输入框 + 语义工具一次性置顶(quickFunctionKeyRef,下一次发送生效)。**预填不自动发**
  // (T-055b 铁律),用户按发送才出手。无 prefill/functionKey 的老条目退化为原「填字条」。
  const applyQuickPrompt = React.useCallback(
    (item: { readonly prefill?: string; readonly functionKey?: string }, fallbackText: string) => {
      const text = item.prefill ?? fallbackText;
      if (!text) return;
      if (item.functionKey && item.functionKey !== "script.patch") {
        // 用户点了另一个明确功能，旧段落锚点和失败重试都不应暗中跟过去。
        stickyScriptPatchRequestRef.current = null;
        setStickyScriptPatchRequest(null);
        retryableScriptPatchRequestRef.current = null;
        setRetryableScriptPatchRequest(null);
        if (pendingComposerRequestRef.current?.functionKey === "script.patch") {
          finishComposerRequest(pendingComposerRequestRef.current.nonce);
        }
      }
      setPrompt(text);
      lastPrefillRef.current = text;
      quickFunctionKeyRef.current = item.functionKey ?? null;
      textareaRef.current?.focus();
    },
    [finishComposerRequest],
  );

  // [T-239e] 会话成本角标 —— 历史底数(读回时从落库行 token 列累计;老消息 null 兼容跳过)。
  // 流式增量另由 sumStreamedUsage(messages) 现算(route messageMetadata 注入 metadata.usage),
  // 两者相加 = 本会话累计;切会话/新对话/scope 切换时底数重置。
  const [historyUsage, setHistoryUsage] = React.useState<{
    inputTokens: number;
    outputTokens: number;
  }>({ inputTokens: 0, outputTokens: 0 });

  // 切到某个会话:拉它的历史消息 → 映射成 UIMessage → 喂 setMessages(读回);同时把
  // conversationId 设为它 + 按 surface 持久化(后续发言续接这个会话)。读回失败(会话被删/
  // 网络错)→ 静默降级(不清空当前对话、不弹错),只在控制台留日志。既服务「二次进入读回」,
  // 也服务「历史记录点某条切过去」。
  const loadConversation = React.useCallback(
    async (id: string): Promise<boolean> => {
      if (!id) return false;
      const messagesBeforeRead = liveSession.chat.messages;
      try {
        // 注意:契约 listMessages 只声明 params(conversationId),未声明分页 query(与 listConversations
        // 不同)—— 故 query 传 undefined,拿该会话全部消息(读回历史)。
        const rows = (await client.listMessages({
          params: { conversationId: id },
          query: undefined,
          body: undefined,
        })) as unknown as ReadonlyArray<WireAIMessage> | null | undefined;
        if (liveSessionRef.current !== liveSession) return false;
        if (liveSession.chat.messages !== messagesBeforeRead) return true;
        if (liveSession.chat.status === "streaming" || liveSession.chat.status === "submitted") return true;
        const mapped = toUIMessages(rows ?? []);
        // [T-239e] 会话成本角标的历史底数:落库行 token 列累计(老行/无 usage 行 null 跳过)。
        // 读回的 UIMessage 不带 metadata → 与下方流式增量(sumStreamedUsage)天然不重复计。
        setHistoryUsage(sumUsageTokens(rows ?? []));
        setMessages(mapped);
        liveSession.conversationId = id;
        conversationIdRef.current = id;
        setConversationId(id);
        writeStoredConversationId(scopeRef.current, id);
        return true;
      } catch (err) {
        console.error("[copilot] load conversation failed:", err);
        return false;
      }
    },
    [setMessages, scope, liveSession],
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
    if (hydratedForKeyRef.current === liveSessionKey) return;
    hydratedForKeyRef.current = liveSessionKey;
    // scope 变了(入口/内嵌项目切换):重置会话态 + 历史面板缓存(历史只列当前 scope)。
    setHistoryRows(null);
    setHistoryOpen(false);
    if (liveSession.chat.messages.length > 0 || ["submitted", "streaming"].includes(liveSession.chat.status)) {
      conversationIdRef.current = liveSession.conversationId;
      setConversationId(liveSession.conversationId);
      prefilledRef.current = true;
      return;
    }
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
      if (liveSessionRef.current !== liveSession || liveSession.chat.messages.length > 0) return;
      // 两路皆空 → 干净空会话,放开一键岛预填(首次进入可预填一次)。
      conversationIdRef.current = null;
      setConversationId(null);
      setMessages([]);
      setHistoryUsage({ inputTokens: 0, outputTokens: 0 }); // [T-239e] 空会话底数归零
      prefilledRef.current = false;
    })();
    // loadConversation 依赖稳定;scope 变化触发恢复。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, liveSessionKey]);

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
    // 新对话必须同时结束上一条局部命令、可选段落锚点和失败重试；否则新会话第一句
    // 仍可能继承旧稿面的 script.patch，形成“什么都发不了”的跨会话阻断。
    quickFunctionKeyRef.current = null;
    inFlightComposerRequestRef.current = null;
    pendingComposerRequestRef.current = null;
    setPendingComposerRequest(null);
    stickyScriptPatchRequestRef.current = null;
    setStickyScriptPatchRequest(null);
    retryableScriptPatchRequestRef.current = null;
    setRetryableScriptPatchRequest(null);
    setComposerLifecycleError(null);
    setConsumedRequestNonce((current) =>
      Math.max(current, providerRequest?.nonce ?? 0),
    );
    stop();
    liveSession.epoch += 1;
    liveSession.conversationId = null;
    conversationIdRef.current = null;
    setConversationId(null);
    writeStoredConversationId(scopeRef.current, null);
    setMessages([]);
    setHistoryUsage({ inputTokens: 0, outputTokens: 0 }); // [T-239e] 新对话底数归零
    prefilledRef.current = false;
  }, [providerRequest?.nonce, setMessages, stop, liveSession]);

  // GAP-COP-feed: 最近任务 is now backed by the REAL global task feed (ai.tasks.list) —
  // the user's cross-project AI tasks, newest first. `recentTasks` is null while loading,
  // [] when the feed is genuinely empty (honest empty state — no fixture rows).
  const [recentTasks, setRecentTasks] = React.useState<
    ReadonlyArray<WireTask> | null
  >(null);
  // [T-239g] 长任务完成 → 对话内通知卡:轮询 feed 检出「新到终态」的任务。
  //   - notifSnapshotRef:上一轮 taskId→status 快照(纯 diff 的对比基线,不进 render);
  //   - notifSeededRef:首帧只播种不通知(避免每次进面板把历史已完成任务刷成一堆通知);
  //   - taskNotifications:待展示的通知(用户可逐条关掉;同 taskId 后续迁移覆盖同一条)。
  const notifSnapshotRef = React.useRef<Map<string, string>>(new Map());
  const notifSeededRef = React.useRef(false);
  const [taskNotifications, setTaskNotifications] = React.useState<
    ReadonlyArray<TaskNotification>
  >([]);
  const dismissTaskNotification = React.useCallback((taskId: string) => {
    // 关掉仅移出展示;快照已记该 status → 同状态不会二次通知,后续「不同状态迁移」
    // (如 awaiting_confirmation→succeeded)仍会再推(那是新事件,理应再知会)。
    setTaskNotifications((prev) => prev.filter((n) => n.taskId !== taskId));
  }, []);
  // [T-248B①] 拉取逻辑抽成可复用回调:首屏 useEffect 用它,任务「取消」成功后也用它
  // 重拉刷新 feed(与本文件其它「变更后重拉」模式一致,不引入第二套刷新机制)。
  const tasksFetchEpochRef = React.useRef(0);
  const refreshRecentTasks = React.useCallback(() => {
    const epoch = ++tasksFetchEpochRef.current;
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
        if (epoch !== tasksFetchEpochRef.current) return; // 过期请求(有更新的在途)——丢弃
        const creative = (rows ?? []).filter(isCreativeTask);
        setRecentTasks(creative.slice(0, 6));
        // [T-239g] 状态迁移检测:在**全量创作任务**(非仅 top 6)上 diff,避免通知被截断漏掉。
        // scheduled.* 已被 isCreativeTask 滤掉(巡航噪音有自动化页承载,不进对话通知)。
        const { notifications, nextSnapshot } = detectTaskNotifications(
          notifSnapshotRef.current,
          creative,
          notifSeededRef.current,
        );
        notifSnapshotRef.current = nextSnapshot;
        notifSeededRef.current = true;
        {
          setTaskNotifications((prev) => {
            // 同 taskId 用最新一条覆盖(awaiting_confirmation→succeeded 就地更新文案),
            // 新任务追加在后。保持插入顺序。
            return mergeTaskNotifications(prev.filter(n=>{const current=creative.find(row=>row.id===n.taskId);return !n.executionTaskId||!current||taskRuntimeStatus(current)===n.status;}), notifications);
          });
        }
      } catch {
        // Feed unavailable (e.g. unauthenticated dispatch) — fall back to an empty,
        // honest feed rather than fixture rows.
        if (epoch === tasksFetchEpochRef.current) setRecentTasks([]);
      }
    })();
  }, []);
  React.useEffect(() => {
    refreshRecentTasks();
    return () => {
      // 卸载后推进 epoch,使在途请求的 setState 失效(等价于原 active 标记)。
      tasksFetchEpochRef.current += 1;
    };
  }, [refreshRecentTasks]);


  // [T-239g] 有在途任务时才轮询 feed(检测其到终态 → 推通知);全部终态即停,省网络、不空转。
  // 一旦某在途任务转终态,通知已推 + 它移出 continuingTasks → 无在途则本 effect 清 interval。
  const hasInflightTasks = (recentTasks ?? []).some((t) =>
    (t.executionTaskId?["queued","running","retry_wait","pause_requested","cancel_requested","paused","waiting_user","unknown_result"].includes(taskRuntimeStatus(t)):CONTINUING_STATUSES.has(t.status)),
  );
  React.useEffect(() => {
    if (!hasInflightTasks) return;
    const timer = setInterval(refreshRecentTasks, TASK_FEED_POLL_MS);
    return () => clearInterval(timer);
  }, [hasInflightTasks, refreshRecentTasks]);

  // [T-239g] 每轮对话结束(streaming→ready)刷新 feed:本轮可能经工具 dispatch 了后台长任务
  // (拆片/渲染/审核),早点纳入轮询,其完成时才能推通知。仅在「刚从流式落回」的沿触发一次。
  const prevStreamingRef = React.useRef(false);
  React.useEffect(() => {
    if (prevStreamingRef.current && !streaming) refreshRecentTasks();
    prevStreamingRef.current = streaming;
  }, [streaming, refreshRecentTasks]);

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

  // 选中某项目:`@query` 只负责选择，随后从正文移除；完整标题在独立上下文标签里展示，
  // 稳定 projectId 仍落到 chatContext(mentionedProject)。避免长标题在标签和消息中重复。
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
        // [T-233] 反转 T-055c:纯 Enter = 换行(治打字误发——用户打字时回车把半句话发了出去);
        // 带修饰键(Cmd/Ctrl+Enter 或 Shift+Enter,两种都宽容支持)才发送。
        // isComposing 时是输入法确认候选词,不发送。
        if (
          e.key === "Enter" &&
          (e.metaKey || e.ctrlKey || e.shiftKey) &&
          !e.nativeEvent.isComposing
        ) {
          e.preventDefault();
          submit();
        }
        // 纯 Enter 不拦截 → textarea 默认行为 = 插入换行(textarea 内 Enter 不触发表单提交)。
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
  const dismissObjectContext = React.useCallback(() => {
    setSelectionDismissed(true);
    if (quickFunctionKeyRef.current === "script.patch") {
      quickFunctionKeyRef.current = null;
    }
    inFlightComposerRequestRef.current = null;
    stickyScriptPatchRequestRef.current = null;
    setStickyScriptPatchRequest(null);
    retryableScriptPatchRequestRef.current = null;
    setRetryableScriptPatchRequest(null);
    if (pendingComposerRequestRef.current?.functionKey === "script.patch") {
      finishComposerRequest(pendingComposerRequestRef.current.nonce);
    }
    setComposerLifecycleError(null);
  }, [finishComposerRequest]);

  // [T-687] 每条助手消息是一批生成结果，批内从图1/视频1重新编号。完整历史每次 render
  // 都按同一顺序重放；注册器只接受最新批次，旧任务晚完成也不能覆盖“刚才那组”。
  const generatedOrdinalsByMessage = new Map<
    string,
    { image: number; video: number }
  >();

  // [T-239e] 会话成本角标:历史底数(落库行 token 列)+ 流式增量(本轮 metadata.usage,
  // route messageMetadata 在 finish part 注入,每轮 onFinish 后 messages 更新即自动刷新)。
  // 读回历史不带 metadata → 两账不重复。全 0(老会话/无 usage 模型)→ 不渲角标(诚实空态)。
  const streamedUsage = React.useMemo(() => sumStreamedUsage(messages), [messages]);
  const usageInput = historyUsage.inputTokens + streamedUsage.inputTokens;
  const usageOutput = historyUsage.outputTokens + streamedUsage.outputTokens;

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
        {/* [T-286] min-w-0 flex-1 + truncate:窄栏(制作视频右栏)下动作区(token 角标+按钮)
            不再把标题列挤成近零宽 → 「编导对话」竖排单字。标题超窄时优雅省略号,不竖排。 */}
        <div className="flex min-w-0 flex-1 flex-col">
          <h2
            data-slot="copilot-header-title"
            className="truncate text-sm font-semibold text-foreground"
          >
            {embed?.title ?? "AI 助手"}
          </h2>
          <p className="truncate text-[11px] text-muted-foreground">
            {embed?.subtitle ?? "描述你的目标，我来帮你规划下一步"}
          </p>
        </div>
        {/* 历史记录 + 新对话(SPEC 本切片:占位按钮做实)。历史记录 → 拉过往会话列表,点某条
            切过去 + 读回;新对话 → 清空当前会话(下次发言后端 lazy 建新会话)。 */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          {/* [T-239e] 会话成本角标 —— 本会话累计 token(↑输入 ↓输出)。v1 只显计数不算钱
              (价格换算待 model-config 可配单价,tooltip 注明);全 0(老会话/无 usage)不渲。 */}
          {usageInput + usageOutput > 0 && (
            <span
              data-slot="copilot-usage-badge"
              title="本会话累计 token 用量(↑输入 ↓输出)。费用换算后续可在模型配置里配置单价。"
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[10px] tabular-nums text-text-subtle"
            >
              ↑{formatCompactTokens(usageInput)} ↓{formatCompactTokens(usageOutput)}
            </span>
          )}
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

      {/* [T-055b SPEC §5.1] 上下文 chips —— 常驻显示本会话注入的上下文(项目短标题 + 对象),
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
            title={`项目 · ${activeProjectChip.title}`}
            aria-label={`当前项目：${activeProjectChip.title}`}
            className="inline-flex min-w-0 max-w-[min(360px,70vw)] items-center gap-1.5 rounded-md border border-brand/25 bg-brand-soft px-2.5 py-1 text-xs text-brand"
          >
            <FolderOpen className="size-3" aria-hidden="true" />
            <span className="shrink-0 font-medium text-brand/75">项目</span>
            <span aria-hidden="true" className="shrink-0 text-brand/40">·</span>
            <span className="min-w-0 truncate font-medium">{activeProjectChip.title}</span>
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
              onClick={dismissObjectContext}
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
        {/* [T-239g] 长任务完成通知卡 —— 轮询 ai.tasks.list 检出「新到终态」的任务时,在对话区
            顶部推一张轻通知(不滚走、可逐条关掉)。终态才推、进行中不打扰;失败诚实带原因。
            这是前端会话期的瞬态提示,不落库、不进 useChat 消息流(存储零改动)。 */}
        {taskNotifications.length > 0 ? (
          <ul
            data-slot="task-notifications"
            aria-live="polite"
            className="flex shrink-0 flex-col gap-1.5"
          >
            {taskNotifications.map((n) => {
              const meta = NOTIFY_STATUS_META[n.status];
              // 失败诚实带原因(先过共享人话映射,兜底原串,截断防超长)。
              const rawReason = (n.errorMessage ?? "").trim();
              const reason =
                n.status === "failed" && rawReason
                  ? (humanizeAiErrorMessage(rawReason)?.message ?? rawReason).slice(0, 140)
                  : "";
              const detail = n.status === "failed" ? reason : meta.hint;
              return (
                <li
                  key={n.taskId}
                  data-slot="task-notification"
                  data-task-id={n.taskId}
                  data-status={n.status}
                  className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2"
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1 size-2 shrink-0 rounded-full ${meta.dot}`}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[12px] font-medium leading-snug text-foreground">
                      「{taskTypeLabel(n.taskType)}」
                      {(n.count ?? 1) > 1 ? `（${n.count} 个任务）` : ""}
                      <span className={meta.text}>{meta.verb}</span>
                    </span>
                    {n.executionTaskId?<TaskRuntimeActions task={{status:n.status,executionTaskId:n.executionTaskId,runtimeStatus:n.runtimeStatus}} onUpdated={refreshRecentTasks}/>:null}
                    {detail ? (
                      <span
                        data-slot="task-notification-detail"
                        className="text-[11px] leading-snug text-muted-foreground"
                      >
                        {detail}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    aria-label="关闭通知"
                    data-slot="task-notification-dismiss"
                    onClick={() => dismissTaskNotification(n.taskId)}
                    className="shrink-0 rounded text-muted-foreground/70 transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {/* 消息流(可滚)—— 给一个 min-h 下限,保证对话区是视觉主区,不被次区压扁(bug #5)。 */}
        <div
          ref={messagesScrollRef}
          onScroll={handleMessagesScroll}
          data-slot="copilot-message-scroll"
          className="min-h-[120px] min-w-0 flex-1 overflow-x-hidden overflow-y-auto rounded-2xl border border-border bg-surface-subtle/40 p-3"
        >
          {messages.length > 0 ? (
            <ol
              data-slot="copilot-messages"
              aria-label="助手活动记录"
              className="flex min-w-0 flex-col gap-1.5"
            >
              {messages.map((message, messageIndex) => (
                <li
                  key={message.id}
                  data-slot="copilot-message"
                  data-role={message.role}
                  className={
                    message.role === "user"
                      ? "flex min-w-0 max-w-[92%] flex-col gap-1 self-end"
                      : "flex w-full min-w-0 flex-col gap-1 self-start"
                  }
                >
                  {/* 文本 part:用户消息纯文本气泡;AI 回复走 markdown 富呈现(T-029:标题/列表/
                      表格/代码/加粗,替掉纯文本直出)。 */}
                  {(() => {
                    const text = joinCopilotMessageText(message.parts, {
                      dedupeConsecutive: message.role === "assistant",
                    });
                    if (!text.trim()) return null;
                    return message.role === "user" ? (
                      <CopilotUserMessageText text={text} />
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
                    // [T-263] local.read 原生授权挂起(approval-requested)→ 渲**阻塞式确认卡**:
                    // 用户「允许」写 grant + addToolApprovalResponse(approved) → 同回合 resume 续跑
                    // execute 读到内容;「拒绝」→ addToolApprovalResponse(denied)。放在通用 spinner 前
                    // (否则挂起态会被误渲成「正在调用…」)。
                    if (
                      name === "local.read" &&
                      part.state === "approval-requested"
                    ) {
                      const inp = (part.input ?? {}) as { path?: string };
                      const approvalId = part.approval?.id ?? "";
                      return (
                        <ChatLocalReadCard
                          key={`${message.id}-approval-${idx}`}
                          approvalRequest={{
                            approvalId,
                            path: typeof inp.path === "string" ? inp.path : "",
                          }}
                          needApproval={null}
                          file={null}
                          listing={null}
                          error={null}
                          onApprove={(id) =>
                            void addToolApprovalResponse({ id, approved: true })
                          }
                          onApproveDir={(id) => approveDirBatch(id)}
                          onDeny={(id) =>
                            void addToolApprovalResponse({ id, approved: false })
                          }
                        />
                      );
                    }
                    // [T-263] local.read 用户已拒绝(output-denied)→ 渲「已拒绝」终态(execute 未跑,
                    // 无 output)。同样在通用 spinner 前拦掉,别渲成「正在调用…」死转。
                    if (name === "local.read" && part.state === "output-denied") {
                      return (
                        <ChatLocalReadCard
                          key={`${message.id}-denied-${idx}`}
                          approvalRequest={null}
                          needApproval={null}
                          file={null}
                          listing={null}
                          error={null}
                          deniedTerminal
                        />
                      );
                    }
                    if (
                      part.state === "output-error" ||
                      part.state === "output-denied" ||
                      (part.state === "approval-responded" && part.approval.approved === false)
                    ) {
                      return (
                        <div
                          key={`${message.id}-terminal-${idx}`}
                          data-slot="copilot-tool-terminal"
                          className="mt-1 rounded-md border border-border/60 bg-surface-subtle/40 px-2.5 py-1.5 text-xs text-muted-foreground"
                        >
                          {part.state === "output-error"
                            ? `未完成 ${traceLabel}：${part.errorText || "工具未返回结果。"}`
                            : `已拒绝 ${traceLabel}`}
                        </div>
                      );
                    }
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
                    if(name==="research.autonomous" && out.kind==="research.autonomous"){
                      const research=out as {taskId?:string|null;error?:string|null};
                      return <React.Fragment key={key}>{traceRow}{research.taskId?<ExecutionTaskCard taskId={research.taskId}/>:<div className="text-sm text-error">{research.error||"自主调研任务未提交，请重试。"}</div>}</React.Fragment>;
                    }
                    // 选题候选(topic.generate)→ 逐条采纳进候选池。
                    if (
                      name === "topic.generate" &&
                      out.kind === "topic.candidates"
                    ) {
                      const o = out as { items?: ChatTopicCandidate[] };
                      return (
                        <React.Fragment key={key}>
                          {traceRow}
                          {/* [T-267①] 透传当前 selection —— scoped 到某候选时采纳默认「更新当前选题」。 */}
                          <ChatCandidateCard
                            candidates={o.items ?? []}
                            selKind={selKind ?? null}
                            selId={selId ?? null}
                          />
                        </React.Fragment>
                      );
                    }
                    // [T-117] 补全选题卡(topic.enrich)→ 富卡渲染 + 采纳(patch 到被补全的
                    // 那条候选)。此前缺此分支 → topic.card 结果被静默丢弃(用户看不到卡)。
                    if (name === "topic.enrich" && out.kind === "topic.card") {
                      const o = out as {
                        card?: ChatEnrichCardData | null;
                        candidateId?: string | null;
                      };
                      return (
                        <React.Fragment key={key}>
                          {traceRow}
                          <ChatEnrichCard
                            card={o.card ?? null}
                            // [T-266] 优先用工具结果里持久化的锚(补全当时锚定的候选 id)——刷新
                            // 会话后仍准;回退当前 selection;都无 → null → 采纳走 createCandidate 新建。
                            candidateId={
                              o.candidateId ??
                              (selKind === "candidate" ? (selId ?? null) : null)
                            }
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
                    if (name === "script.patch" && out.kind === "script.patch") {
                      return (
                        <React.Fragment key={key}>
                          {traceRow}
                          <ChatScriptPatchCard
                            candidate={out as unknown as ChatScriptPatchCandidate}
                          />
                        </React.Fragment>
                      );
                    }
                    // [T-268] 整稿分镜脚本(script.draft)→ 据 taskId 轮询 → awaiting_confirmation 渲
                    // 整稿候选 → 「采纳写入稿面」(confirmTask → output_script append → 稿面编辑器局部刷新)。
                    // dispatch 失败/无项目上下文 → 卡渲诚实错误态(去项目稿面写脚本)。
                    if (name === "script.draft" && out.kind === "script.draft") {
                      const o = out as {
                        draftMode?: "generate" | "verbatim";
                        taskId?: string | null;
                        projectId?: string | null;
                        error?: string | null;
                      };
                      return (
                        <React.Fragment key={key}>
                          {traceRow}
                          <ChatScriptDraftCard
                            draftMode={o.draftMode}
                            taskId={o.taskId ?? null}
                            projectId={o.projectId ?? activeProjectChip?.id ?? null}
                            error={o.error ?? null}
                          />
                        </React.Fragment>
                      );
                    }
                    if (name === "video.edit.render" && out.kind === "video.edit") {
                      return (
                        <React.Fragment key={key}>
                          {traceRow}
                          <ChatVideoEditCard candidate={out as unknown as ChatVideoEditCandidate} />
                        </React.Fragment>
                      );
                    }
                    // [T-350a/b] 发布物料(publish.package)→ 据 taskId 轮询 → awaiting_confirmation 渲
                    // 抖音物料候选(标题/简介/标签/封面文案/审核结论)→「采纳」(confirmTask →
                    // createPublicationFromDraft 物化 Publication → 稿面发布包回填)。
                    // dispatch 失败/无项目上下文/空稿门 → 卡渲诚实错误态。
                    if (
                      name === "publish.package" &&
                      out.kind === "publish.package"
                    ) {
                      const o = out as {
                        taskId?: string | null;
                        projectId?: string | null;
                        error?: string | null;
                      };
                      return (
                        <React.Fragment key={key}>
                          {traceRow}
                          <ChatPublishPackageCard
                            taskId={o.taskId ?? null}
                            projectId={o.projectId ?? activeProjectChip?.id ?? null}
                            error={o.error ?? null}
                          />
                        </React.Fragment>
                      );
                    }
                    // [T-385] 抓逐字稿(project.transcribe)→ 简单状态文本(转写分钟级后台跑,
                    // 不轮询 —— 完成后用户让编导重新拆解即可);失败(无项目上下文/无抖音锚/
                    // dispatch 失败)→ 诚实错误态。
                    if (
                      name === "project.transcribe" &&
                      out.kind === "project.transcribe"
                    ) {
                      const o = out as {
                        taskId?: string | null;
                        error?: string | null;
                      };
                      return (
                        <React.Fragment key={key}>
                          {traceRow}
                          <p
                            data-slot="copilot-transcribe-status"
                            data-ok={o.error ? "false" : "true"}
                            className={
                              o.error
                                ? "mt-1 text-xs text-destructive"
                                : "mt-1 text-xs text-success"
                            }
                          >
                            {o.error
                              ? `✗ ${o.error}`
                              : "✓ 已发起逐字稿抓取(后台转写约 1-3 分钟)—— 完成后让我重新拆解这条作品即可。"}
                          </p>
                        </React.Fragment>
                      );
                    }
                    // [T-057④/T-084a] 搜素材(material.gather)→ 逐条「存入弹药」(knowledge+
                    // materialLink);grounding=unavailable 时明确浏览器失败且没有记忆兜底。
                    if (
                      name === "material.gather" &&
                      out.kind === "material.gather"
                    ) {
                      const o = out as {
                        items?: ChatGatherItem[];
                        grounding?: "web" | "unavailable";
                      };
                      return (
                        <ChatGatherCard
                          key={key}
                          items={o.items ?? []}
                          projectId={activeProjectChip?.id ?? null}
                          grounding={o.grounding ?? "unavailable"}
                          reading={streaming}
                          onRead={(url) => {
                            if (streaming) return;
                            quickFunctionKeyRef.current = "web.read";
                            quickWebReadUrlRef.current = url;
                            void sendMessage({ text: `请阅读全文：${url}` });
                          }}
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
                        httpStatus?: number | null;
                        loginSuggested?: boolean;
                        window?: { offset: number; length: number; total: number } | null;
                        hasMore?: boolean;
                      };
                      return (
                        <ChatWebReadCard
                          key={key}
                          asset={o.asset ?? null}
                          needLogin={o.needLogin ?? null}
                          error={o.error ?? null}
                          httpStatus={o.httpStatus ?? null}
                          loginSuggested={o.loginSuggested ?? false}
                          projectId={activeProjectChip?.id ?? null}
                          window={o.window ?? null}
                          hasMore={o.hasMore ?? false}
                        />
                      );
                    }
                    // [T-253] 本机文件读取(local.read)结果态:文本窗口卡 / 目录清单 / 拒读态。
                    // 未授权在正常路径已由上面的 approval-requested 分支(T-263 原生 HITL 挂起)接管;
                    // 这里 needApproval 仅在**授权门未装配**(端口缺席)时作为旧四态兜底出现。
                    if (name === "local.read" && out.kind === "local.read") {
                      const o = out as {
                        needApproval?: LocalReadApproval | null;
                        foundByName?: LocalReadFoundByName | null;
                        candidates?: LocalReadCandidates | null;
                        file?: LocalReadFile | null;
                        listing?: LocalReadListing | null;
                        error?: string | null;
                      };
                      return (
                        <React.Fragment key={key}>
                          {traceRow}
                          <ChatLocalReadCard
                            approvalRequest={null}
                            needApproval={o.needApproval ?? null}
                            // [T-262] 按名搜索兜底:唯一命中 → foundByName 注记(卡解释);多命中 → candidates 选择态。
                            foundByName={o.foundByName ?? null}
                            candidates={o.candidates ?? null}
                            file={o.file ?? null}
                            listing={o.listing ?? null}
                            error={o.error ?? null}
                            // [T-263 快修吞点] 去掉 `if(streaming)return` 吞点:兜底态用户点「允许」后
                            // 的自动重读不再被流式期直接丢弃(原「点了还得手动再发」的确切根因)。极窄
                            // 竞态下 sendMessage 由 useChat 自行排队/处理,不在这里静默 drop。
                            onDecision={(text) => {
                              void sendMessage({ text });
                            }}
                          />
                        </React.Fragment>
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
                      const ordinals = generatedOrdinalsByMessage.get(message.id) ?? {
                        image: 0,
                        video: 0,
                      };
                      const aliasLabel = o.kindOf === "video"
                        ? `视频${++ordinals.video}`
                        : `图${++ordinals.image}`;
                      generatedOrdinalsByMessage.set(message.id, ordinals);
                      return (
                        <ChatGenerateCard
                          key={key}
                          taskId={o.taskId ?? null}
                          kindOf={o.kindOf ?? "image"}
                          error={o.error ?? null}
                          aliasLabel={aliasLabel}
                          aliasBatchKey={message.id}
                          aliasBatchRank={messageIndex}
                          projectId={activeProjectChip?.id ?? null}
                          materialRole="broll"
                        />
                      );
                    }
                    // 抖音分享专路：只渲 execution 持久父/子任务真值，模型文本不能代替状态。
                    if (
                      name === "intelligence.douyin.share" &&
                      out.kind === "intelligence.douyin.share"
                    ) {
                      const o = out as {
                        taskId?: string | null;
                        ownerId?: string | null;
                        action?: "archive" | "archive_and_transcribe";
                        error?: string | null;
                      };
                      return (
                        <React.Fragment key={key}>
                          {traceRow}
                          <ChatDouyinShareCard
                            taskId={o.taskId ?? null}
                            ownerId={o.ownerId ?? null}
                            action={o.action ?? "archive"}
                            error={o.error ?? null}
                          />
                        </React.Fragment>
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
                    // [T-730] 可选论点骨架：生成只产候选；用户点击「采纳并用于写稿」后，
                    // 才由确认门原子写入当前版本并标记 adopted。完整逐字稿路径仍原文优先。
                    if (
                      name === "planning.thesis" &&
                      out.kind === "planning.thesis"
                    ) {
                      const o = out as {
                        taskId?: string | null;
                        error?: string | null;
                      };
                      return (
                        <React.Fragment key={key}>
                          {traceRow}
                          <ChatThesisCard
                            taskId={o.taskId ?? null}
                            error={o.error ?? null}
                          />
                        </React.Fragment>
                      );
                    }
                    // [T-271] 制作封面(cover.generate)→ 据 taskId 轮询 → awaiting_confirmation 渲
                    // 封面方案(封面文案已过诚实门,未溯源数据带⚠️)+ 封面图 → 「采纳进素材库」
                    // (confirmTask,既有 asset 采纳门绑进项目)。dispatch 失败/无项目上下文 → 卡渲诚实
                    // 错误态(去项目稿面生成封面)。复用 ChatGenerateCard(它按 taskId 轮 generated_asset,
                    // 并渲 resultData.coverPlan 封面方案块)。
                    if (
                      name === "cover.generate" &&
                      out.kind === "cover.generate"
                    ) {
                      const o = out as {
                        taskId?: string | null;
                        error?: string | null;
                      };
                      return (
                        <React.Fragment key={key}>
                          {traceRow}
                          <ChatGenerateCard
                            taskId={o.taskId ?? null}
                            kindOf="image"
                            error={o.error ?? null}
                            projectId={activeProjectChip?.id ?? null}
                            materialRole="cover"
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
                        discovery?: {
                          sessionId: string;
                          candidateId: string;
                          candidateRevision: number;
                        } | null;
                      };
                      return (
                        <ChatPositioningCard
                          key={key}
                          suggestion={o.suggestion ?? null}
                          discovery={o.discovery ?? null}
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
                  className="flex w-full max-w-[440px] flex-col gap-2 self-start rounded-xl border border-border bg-surface px-3.5 py-3 shadow-sm"
                >
                  <strong className="text-[13px] font-semibold text-foreground">
                    {chatError.title}
                  </strong>
                  <span className="text-[12px] leading-relaxed text-muted-foreground">
                    {chatError.message}
                  </span>
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    {chatError.suggestSwitchModel ? (
                      <Link
                        href="/settings?highlight=text-model"
                        data-slot="copilot-error-settings-link"
                        className="inline-flex h-8 items-center rounded-md bg-brand px-3 text-[11px] font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        去设置 AI 模型
                      </Link>
                    ) : null}
                    {chatError.suggestOpenPositioning ? (
                      <Link
                        href="/positioning"
                        data-slot="copilot-error-positioning-link"
                        className="inline-flex h-8 items-center rounded-md bg-brand px-3 text-[11px] font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        去完成账号定位
                      </Link>
                    ) : null}
                    {chatError.suggestOpenCredits ? (
                      <button
                        type="button"
                        data-slot="copilot-error-credits-button"
                        disabled={openingCredits}
                        onClick={() => void handleOpenCredits()}
                        className="inline-flex h-8 items-center rounded-md bg-brand px-3 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        {openingCredits ? "正在打开…" : "查看额度并充值"}
                      </button>
                    ) : null}
                    {creditOpenError && chatError.suggestOpenCredits ? (
                      <span
                        data-slot="copilot-error-credits-open-error"
                        className="text-[11px] text-destructive"
                      >
                        {creditOpenError}
                      </span>
                    ) : null}
                  {/* [T-231⑩] 出错不再只让用户「请重试」却无处可点:regenerate() 重发
                      最后一条用户消息(@ai-sdk/react 现成 API,不手搓重放)。流式中不渲。 */}
                    {chatError.canRetry &&
                    !chatError.suggestOpenCredits &&
                    !streaming &&
                    messages.length > 0 ? (
                      <button
                        type="button"
                        data-slot="copilot-error-retry"
                        onClick={() => void retryLastTurn()}
                        className="inline-flex h-8 items-center rounded-md border border-border px-3 text-[11px] font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        重试
                      </button>
                    ) : null}
                  </div>
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
          className="relative z-20 shrink-0 overflow-visible border border-border bg-surface p-3"
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
                onPaste={(event) => {
                  const files = Array.from(event.clipboardData.files ?? []);
                  if (files.length === 0) return;
                  // 剪贴板里带图片/文件时按附件处理；纯文本粘贴保留浏览器原行为。
                  event.preventDefault();
                  attachmentPickerRef.current?.addFiles(files);
                }}
                rows={2}
                aria-label="我能帮你做什么"
                placeholder="我能帮你做什么？（试试「基于最近评论出 5 个选题」，或输入 @ 引用一个项目）"
                className="min-h-12 w-full resize-none border-0 border-l-2 border-brand/40 bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                data-slot="prompt-input"
              />
            </div>
            <CopilotAttachmentPicker
              ref={attachmentPickerRef}
              projectId={chatContextBody.chatContext.projectId}
              disabled={streaming || hasPendingApproval}
              onStateChange={handleAttachmentStateChange}
            />
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
                {/* [T-233] 发送快捷键提示:Enter 已改为换行,明示修饰键才发送(不然用户不知道怎么发)。 */}
                <span
                  data-slot="prompt-send-hint"
                  className={`whitespace-nowrap text-[10px] ${
                    hasPendingApproval ? "text-warning" : "text-muted-foreground"
                  }`}
                >
                  {hasPendingApproval
                    ? "有待确认的本机读取 · 先处理上方授权卡再发"
                    : "⌘/Ctrl ↩ 发送 · Enter 换行"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPrompt("");
                    attachmentPickerRef.current?.clear();
                    // [T-231⑨] 清空输入同时撤销 chip 的一次性工具置顶(话术没了,预调也不该留)。
                    quickFunctionKeyRef.current = null;
                  }}
                  disabled={isEmpty && attachmentState.count === 0}
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
                    onClick={() => void stopTask()}
                    disabled={stopPending}
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
                    disabled={
                      isEmpty || hasPendingApproval || attachmentState.uploading
                    }
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

    </div>
  );
}

export default AICopilotContent;
