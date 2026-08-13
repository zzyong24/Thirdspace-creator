"use client";

/**
 * [T-254c] 制作视频工作台(SPEC 2026-07-11 §3.1 工作流 / §3.3 tab UI)。
 *
 * 串起完整管线(全部确认门在位,铁律②):
 *   ① 备料:口播稿提词展示 + 录制指引 → 上传粗剪人物视频(video asset)+ SRT
 *      (subtitle asset,两阶段上传链 createUpload→PUT→completeUpload,同
 *      upload-to-project 先例,stage="production" 挂用料链);
 *   ② SRT 匹配校验(挡在提交前):时长 vs 视频时长(<video> metadata 客户端读,
 *      免 ffprobe 往返)+ 全文 vs 口播稿相似度(srt-check 前端纯函数);不匹配显示
 *      具体原因,用户可勾「我确认没传错」明确覆盖;
 *   ③ 「AI 分场决策」→ createAITask(video.decisions,inputData {srtText,script,
 *      projectId})→ live dispatch 后台跑四决策 → 轮询到 awaiting_confirmation 渲
 *      分场预览卡(VideoDecisionPreview,inventory=任务产物携带的素材清单快照);
 *   ④ 用户确认 → confirmTask 收口决策任务 + createExecutionTask(video.render,
 *      params={props},inputs **mountAs=assetId 约定**)→ ExecutionTaskCard 跟踪
 *      渲染步骤流 → 采纳入库;
 *   ⑤ production 状态机接线(复活 6 op):上传视频→recording、备料齐→editing、
 *      确认渲染→rendering + createProductionExport(queued)+ 分场 segments 登记、
 *      渲染任务采纳→completeExport(resultAssetId)+ ready。
 *
 * ffmpeg/Chromium 未就绪:executor 诚实报错,这里经 humanizeRenderError 给安装引导。
 *
 * [T-366a] 制作方式二选一(SPEC 2026-07-17 §4.1):默认「用 CreatorOS 制作」= 上述
 * 现状流零破坏;「直接上传成品视频」= 复用同一条两阶段上传链传成品(mp4/mov 收窄 +
 * 时长>0 探针,坏文件诚实拒收)→ 不 dispatch 四决策/不渲染 → createProductionExport +
 * completeExport(resultAssetId=成品)→ 状态机到 ready。状态机跳转语义(SPEC §5 待决点1):
 * 后端 putProduction 只接受相邻 +1(跨步 ConflictError),故选「补记中间态」—— 复用
 * statusStepsTo 依次 PUT recording→editing→rendering→ready,不改状态机语义。
 * 可退回(VP-03):completeExport 前随时切回;已被 publication 登记 → 禁覆盖(§5.1③,
 * 只提示先解除登记/新增,绝不静默换片)。飞轮不脱钩(§5.1⑤):盲预测/发布物料/登记发布
 * 都锚 outputId/publication(稿面 PublishPack 链),与成片怎么来的正交,此处零改动。
 *
 * [T-366b] 「导出素材包」辅助入口:调 productions.exports.materials(后端本地 zip →
 * asset → 签名下载 URL),诚实门文案「原素材+编导说明,非可一键导入的剪映工程」。
 */

import * as React from "react";
import { Check, Copy } from "lucide-react";

import { client } from "@/lib/contract-client";
import { createAiTaskAttemptId } from "@/lib/ai-task-attempt";
// [T-285] mount 恢复已上传素材:取 SRT 资产签名下载 URL 回读文本。
import { resolveAssetPreviewUrl } from "@/components/resources/asset-preview-url";
import { ExecutionTaskCard } from "@/features/copilot/execution-task-card";
import { VideoDecisionPreview } from "./video-decision-preview";
import type { ManualMaterialAssignment } from "./video-decision-preview";
import { assembleVideoRenderProps } from "./assemble-video-render-props";
import type { VideoDecisions, BrollAssetRef } from "@creatoros/backend/modules/ai-runtime";
import type { VideoRenderProps } from "@creatoros/contract";
import {
  parseSrt,
  checkSrtDurationMatch,
  checkSrtScriptMatch,
  type SrtLine,
  type SrtDurationCheck,
  type SrtScriptCheck,
} from "./srt-check";
import {
  PRODUCTION_STATUS_ORDER,
  PRODUCTION_STATUS_LABEL,
  statusStepsTo,
  buildRenderInputs,
  humanizeRenderError,
  // [T-726] B-roll 自动聚合只取脚本画面点名 + 项目弹药。
  aggregateAutoBroll,
  assetRefsFromScriptContentData,
  BROLL_SOURCE_LABEL,
  type AutoBrollItem,
  type ProductionStatus,
} from "./production-flow";

const POLL_MS = 4000;
// [FE-H01] 后台长任务轮询退避上限:决策/渲染都是分钟级(MiniMax 下更久),不能设「最多轮
// N 次就静默放弃」——那样「后台运行,可离开」承诺不成立(进度会丢)。改为持续轮询,前若干次
// 密集(4s),之后指数退避拉长到 30s 封顶,绝不放弃(只在终态或组件卸载时停)。
const POLL_MAX_MS = 30_000;

/** 决策轮询退避间隔:前 15 次 4s,之后每 15 次翻倍,封顶 30s。持续轮询、绝不静默退出。 */
function pollDelay(attempt: number): number {
  const backed = POLL_MS * 2 ** Math.floor(attempt / 15);
  return Math.min(backed, POLL_MAX_MS);
}

/**
 * 局部选材动作的稳定 attemptId：同一项目、同一稳定分镜、同一选择只能创建一条任务。
 * SEMANTIC_BOUNDARY_ALLOW: 该哈希只做请求幂等，不参与任何素材/场景创作判断。
 */
function materialAdjustmentAttemptId(input: unknown): string {
  const text = JSON.stringify(input);
  const hash = (seed: number) => {
    let value = seed >>> 0;
    for (let index = 0; index < text.length; index += 1) {
      value ^= text.charCodeAt(index);
      value = Math.imul(value, 0x01000193) >>> 0;
    }
    return value.toString(16).padStart(8, "0");
  };
  return `materials-${hash(0x811c9dc5)}-${hash(0x9e3779b9)}-${hash(0x85ebca6b)}-${hash(0xc2b2ae35)}`;
}

// ── wire 形状(只声明本组件读的字段;服务端 zod 是单一真值)────────────────────

interface WireAsset {
  id: string;
}

interface WireAITask {
  id: string;
  status: string;
  retryOfTaskId?: string | null;
  requestedAt?: string;
}

interface DecisionFailureDisplay {
  summary: string;
  detail: string | null;
}

function decisionFailureDisplay(raw: string): DecisionFailureDisplay {
  const [summaryPart = "", ...detailParts] = raw.split(/\n原始错误（已脱敏）：/);
  const detail = detailParts.join("\n原始错误（已脱敏）：").trim() || null;
  const where = summaryPart.match(/^(①[^：:]*|②[^：:]*|③[^：:]*|④[^：:]*|⑤[^：:]*|备料[^：:]*)/)?.[1]
    ?.replace(/\s*失败\s*$/, "")
    .trim();
  if (detail) {
    return {
      summary: summaryPart || `${where || "AI 分场"}暂时失败，请继续上次分场。`,
      detail,
    };
  }
  // 兼容旧任务：旧步骤把摘要和原始错误写在同一行，尽量保留冒号后的原文。
  const legacy = raw.match(/失败\s*[:：]\s*(.+)$/)?.[1]?.trim() ?? null;
  if (/provider|http\s*\d|端点|econn|fetch failed|network|timeout/i.test(raw)) {
    return {
      summary: `${where || "AI 分场"}暂时失败，请继续上次分场。`,
      detail: legacy,
    };
  }
  return {
    summary: raw || "AI 分场暂时失败，请继续上次分场。",
    detail: null,
  };
}

interface WireTaskResult {
  resultType: string;
  resultData: Record<string, unknown>;
}

interface WireProduction {
  id: string;
  status: string;
  recordingConfig?: Record<string, unknown>;
}

interface WireExecTask {
  id: string;
  execType: string;
  status: string;
  requestedAt?: string;
  spec?: {
    params?: Record<string, unknown>;
  };
  adoptedAssetIds: string[];
  errorMessage: string | null;
}

type RenderFlowStatus =
  | "saving_plan"
  | "creating_task"
  | "queued"
  | "running"
  | "awaiting_confirmation"
  | "succeeded"
  | "failed"
  | "cancelled";

interface WireMaterialLink {
  projectId: string;
  contentOutputId: string | null;
  entityType: string;
  entityId: string;
  role: string;
  stage: string;
}

/**
 * [T-548] 旧版卡内重试没有把 projectId 传给新任务，导致按项目 list 时只看得到旧失败
 * 任务。retryOf 是服务端已持久化的稳定父指针；从当前项目任务集合出发闭包追后代，可把
 * 这些历史孤儿重试安全归回原项目（不会靠标题/文件名猜归属）。
 */
export function includeExecutionRetryDescendants(
  projectTasks: readonly WireExecTask[],
  allTasks: readonly WireExecTask[],
): WireExecTask[] {
  const relatedIds = new Set(projectTasks.map((task) => task.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of allTasks) {
      const retryOf = task.spec?.params?.retryOf;
      if (
        typeof retryOf === "string" &&
        relatedIds.has(retryOf) &&
        !relatedIds.has(task.id)
      ) {
        relatedIds.add(task.id);
        changed = true;
      }
    }
  }
  // allTasks 服务端按新到旧；先保留它的顺序，项目列表独有行补在末尾。
  return [
    ...allTasks.filter((task) => relatedIds.has(task.id)),
    ...projectTasks.filter(
      (task) => !allTasks.some((candidate) => candidate.id === task.id),
    ),
  ].filter(
    (task, index, rows) =>
      rows.findIndex((candidate) => candidate.id === task.id) === index,
  );
}

// ── 客户端读视频时长(<video> metadata,免 ffprobe 往返;失败诚实 null)────────

async function readVideoDurationViaElement(file: File): Promise<number | null> {
  if (typeof document === "undefined" || typeof URL === "undefined") return null;
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const el = document.createElement("video");
      el.preload = "metadata";
      const done = (v: number | null) => {
        URL.revokeObjectURL(url);
        resolve(v);
      };
      const timer = setTimeout(() => done(null), 10_000);
      el.onloadedmetadata = () => {
        clearTimeout(timer);
        done(Number.isFinite(el.duration) ? el.duration : null);
      };
      el.onerror = () => {
        clearTimeout(timer);
        done(null);
      };
      el.src = url;
    } catch {
      resolve(null);
    }
  });
}

// 读文件文本(jsdom 的 File 可能没有 .text() —— FileReader 兜底)。
async function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result ?? ""));
    fr.onerror = () => reject(fr.error ?? new Error("读取文件失败"));
    fr.readAsText(file);
  });
}

/**
 * 结构化分镜稿 → 纯口播稿。
 *
 * 命中「口播:」标记时，只保留该段及其续行；画面/字幕/时长等制作说明全部剔除。
 * 没有任何结构标记时，说明稿件本来就是纯文本，原样复制，避免把用户自由稿误删空。
 */
export function extractVoiceoverText(script: string): string {
  const normalized = script.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";

  const voiceoverBlocks: string[] = [];
  let current: string[] = [];
  let collecting = false;
  let foundVoiceoverLabel = false;

  const flush = () => {
    const block = current.join("\n").trim();
    if (block) voiceoverBlocks.push(block);
    current = [];
  };

  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trim();
    const voiceover = line.match(/^口播\s*[：:]\s*(.*)$/i);
    if (voiceover) {
      flush();
      collecting = true;
      foundVoiceoverLabel = true;
      if (voiceover[1]?.trim()) current.push(voiceover[1].trim());
      continue;
    }

    if (
      /^(画面|字幕|时长|镜头|景别|动作|素材|音效|配乐|BGM)\s*[：:]/i.test(
        line,
      )
    ) {
      flush();
      collecting = false;
      continue;
    }

    if (!collecting) continue;
    if (!line) {
      flush();
      collecting = false;
      continue;
    }
    if (/^(?:#{1,6}\s*)?\d+[.、]\s+/.test(line)) {
      flush();
      collecting = false;
      continue;
    }
    current.push(line);
  }
  flush();

  return foundVoiceoverLabel
    ? voiceoverBlocks.join("\n\n").trim()
    : normalized;
}

async function writeClipboardText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("copy_failed");
}

// ── 两阶段上传链(同 upload-to-project 先例;stage="production" 挂用料链)────────

async function uploadProductionAsset(
  projectId: string,
  file: File,
  assetType: "video" | "subtitle" | "image",
  // [T-294] 用料链 role 可覆盖:B-roll 素材传 "broll"(缺省按类型:video=clip / 其它=reference)。
  role?: string,
): Promise<string> {
  const mimeType =
    file.type ||
    (assetType === "video"
      ? "video/mp4"
      : assetType === "image"
        ? "image/png"
        : "application/x-subrip");
  const upload = (await client.createUpload({
    params: undefined,
    query: undefined,
    body: {
      assetType,
      mimeType,
      fileSize: Math.max(1, file.size),
      projectId,
      fileName: file.name,
    },
  })) as unknown as { uploadId: string; uploadUrl: string };
  if (!upload.uploadUrl.startsWith("mock://")) {
    const put = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: { "content-type": mimeType },
      body: file,
    });
    if (!put.ok) throw new Error(`上传失败(PUT ${put.status})`);
  }
  const asset = (await client.completeUpload({
    params: { uploadId: upload.uploadId },
    query: undefined,
    body: { name: file.name },
  })) as unknown as WireAsset;
  if (!asset?.id) throw new Error("上传完成但没有返回 asset id");
  // 用料链是制作页后续读取的真入口；登记失败必须让用户看到，不能假报“已上传可用”。
  await client.createMaterialLink({
    params: undefined,
    query: undefined,
    body: {
      projectId,
      entityType: "asset",
      entityId: asset.id,
      role: role ?? (assetType === "video" ? "clip" : "reference"),
      stage: "production",
    },
  });
  return asset.id;
}

// ── 组件 ──────────────────────────────────────────────────────────────────────

export interface ProductionWorkbenchProps {
  projectId: string;
  projectTitle: string;
  /** 口播稿全文(稿面当前版本投影);null = 项目还没有脚本(诚实空态)。 */
  scriptText: string | null;
  /** 项目首个产出 id;null = 还没有产出(状态机接线时懒建)。 */
  outputId: string | null;
  /** 服务端读到的 production 状态(outputId 为 null 时也为 null)。 */
  initialStatus: string | null;
  /** 已登记分场段数(listSegments 服务端读)。 */
  initialSegmentCount: number;
  /** [T-290] 项目画幅(briefDetail.orientation 投影)→ 渲染 delivery 尺寸。缺省 = 未设(按 landscape 兜底)。 */
  orientation?: "portrait" | "landscape";
  /** 测试注入:读视频时长(默认 <video> metadata)。 */
  readVideoDuration?: (file: File) => Promise<number | null>;
}

interface VideoState {
  assetId: string;
  name: string;
  durationSec: number | null;
}

interface SrtState {
  assetId: string;
  name: string;
  text: string;
  lines: SrtLine[];
}

export function ProductionWorkbench({
  projectId,
  projectTitle,
  scriptText,
  outputId: initialOutputId,
  initialStatus,
  initialSegmentCount,
  orientation,
  readVideoDuration = readVideoDurationViaElement,
}: ProductionWorkbenchProps) {
  // 画幅属于“本次制作 revision”，不是只能从立项继承的只读属性。存量项目无值时
  // 维持既有 landscape 行为；用户可在制作页显式切到 portrait。
  const [renderOrientation, setRenderOrientation] = React.useState<
    "portrait" | "landscape"
  >(orientation ?? "landscape");
  const [outputId, setOutputId] = React.useState(initialOutputId);
  const [status, setStatus] = React.useState<string | null>(initialStatus);
  const [segmentCount, setSegmentCount] = React.useState(initialSegmentCount);
  const [copyVoiceoverStatus, setCopyVoiceoverStatus] = React.useState<
    "idle" | "copied" | "error"
  >("idle");
  const [copyDecisionErrorStatus, setCopyDecisionErrorStatus] = React.useState<
    "idle" | "copied" | "error"
  >("idle");
  const voiceoverText = React.useMemo(
    () => extractVoiceoverText(scriptText ?? ""),
    [scriptText],
  );
  const copyVoiceover = React.useCallback(async () => {
    if (!voiceoverText) return;
    try {
      await writeClipboardText(voiceoverText);
      setCopyVoiceoverStatus("copied");
    } catch {
      setCopyVoiceoverStatus("error");
    }
  }, [voiceoverText]);

  const [video, setVideo] = React.useState<VideoState | null>(null);
  const [srt, setSrt] = React.useState<SrtState | null>(null);
  const [uploadBusy, setUploadBusy] = React.useState<"" | "video" | "srt">("");
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [override, setOverride] = React.useState(false);
  // [T-254c 打磨] 隐藏原生 file input,用样式化点击区触发(裸 input 显浏览器默认 "Choose File" 与暗色 UI 不搭)。
  const videoInputRef = React.useRef<HTMLInputElement>(null);
  const srtInputRef = React.useRef<HTMLInputElement>(null);

  const [decisionsTaskId, setDecisionsTaskId] = React.useState<string | null>(
    null,
  );
  const [decisionsRetryOfTaskId, setDecisionsRetryOfTaskId] = React.useState<
    string | null
  >(null);
  const [decisionsBusy, setDecisionsBusy] = React.useState(false);
  const materialAdjustmentInFlight = React.useRef(false);
  const [decisionsError, setDecisionsError] = React.useState<string | null>(
    null,
  );
  const [decisionsErrorDetail, setDecisionsErrorDetail] = React.useState<
    string | null
  >(null);
  const copyDecisionError = React.useCallback(async () => {
    if (!decisionsErrorDetail) return;
    try {
      await writeClipboardText(decisionsErrorDetail);
      setCopyDecisionErrorStatus("copied");
    } catch {
      setCopyDecisionErrorStatus("error");
    }
  }, [decisionsErrorDetail]);
  const [decisions, setDecisions] = React.useState<VideoDecisions | null>(null);
  const [editingPlanRevision, setEditingPlanRevision] = React.useState(0);
  const [decisionsConfirmed, setDecisionsConfirmed] = React.useState(false);
  const [inventory, setInventory] = React.useState<readonly BrollAssetRef[]>([]);
  const [recoveredDecisions, setRecoveredDecisions] = React.useState(false);
  const [brollRevisionNotice, setBrollRevisionNotice] = React.useState<
    string | null
  >(null);
  // [T-294] 制作页 B-roll 素材(role=broll):列/补传/剔除;决策读它们做 B-roll 匹配。
  const [brollItems, setBrollItems] = React.useState<
    ReadonlyArray<{ linkId: string; assetId: string; kind: string; name: string }>
  >([]);
  const [brollInventoryStatus, setBrollInventoryStatus] = React.useState<
    "loading" | "ready" | "error"
  >("loading");
  const [brollBusy, setBrollBusy] = React.useState(false);
  const [brollDragActive, setBrollDragActive] = React.useState(false);
  // [T-387c] 自动聚合的 B-roll 候选(脚本画面点名/论点树挂载/项目弹药,带来源徽标)+
  // 人剔除集(只影响本次决策的 inputData.excludedAssetIds,不动用料链)。
  const [autoBroll, setAutoBroll] = React.useState<ReadonlyArray<AutoBrollItem>>(
    [],
  );
  const [excludedAuto, setExcludedAuto] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const [renderTaskId, setRenderTaskId] = React.useState<string | null>(null);
  const [renderDispatchBusy, setRenderDispatchBusy] = React.useState(false);
  const [renderTaskStatus, setRenderTaskStatus] =
    React.useState<RenderFlowStatus | null>(null);
  const [renderEnvHint, setRenderEnvHint] = React.useState<string | null>(null);
  const [renderFinalizeError, setRenderFinalizeError] = React.useState<
    string | null
  >(null);
  const [renderFinalizeRetry, setRenderFinalizeRetry] = React.useState(0);
  const [exportId, setExportId] = React.useState<string | null>(null);
  // [T-292] 采纳后的成片 assetId → 产出区 <video> 预览。
  const [finalVideoAssetId, setFinalVideoAssetId] = React.useState<string | null>(
    null,
  );
  const [flowError, setFlowError] = React.useState<string | null>(null);
  const renderInProgress =
    renderDispatchBusy ||
    renderTaskStatus === "queued" ||
    renderTaskStatus === "running";
  const renderProgressLabel =
    renderTaskStatus === "saving_plan"
      ? "正在保存分镜方案…"
      : renderTaskStatus === "creating_task"
        ? "正在创建渲染任务…"
        : "渲染任务进行中…";

  // ── [T-366a] 制作方式二选一 ──────────────────────────────────────────────────
  const [method, setMethod] = React.useState<"creatoros" | "upload">(
    "creatoros",
  );
  const [finalBusy, setFinalBusy] = React.useState(false);
  const [finalError, setFinalError] = React.useState<string | null>(null);
  const [finalNotice, setFinalNotice] = React.useState<string | null>(null);
  // 已有成片时的替换确认门(§4.1:已 ready 覆盖需二次确认,不静默丢)。
  const [replaceOk, setReplaceOk] = React.useState(false);
  // §5.1③:成片已被 publication 登记 → 禁覆盖(null=未探测/无需探测)。
  const [pubLocked, setPubLocked] = React.useState<boolean | null>(null);
  const finalInputRef = React.useRef<HTMLInputElement>(null);

  // ── [T-366b] 素材包导出 ─────────────────────────────────────────────────────
  const [exportBusy, setExportBusy] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);
  const [exportDone, setExportDone] = React.useState<{
    fileName: string;
    fileCount: number;
    hasDecisions: boolean;
  } | null>(null);
  // 预计大小(项目素材 fileSize 求和;读不到就不提示,不编数)。
  const [estBytes, setEstBytes] = React.useState<number | null>(null);

  // ── [T-285] mount 恢复已上传素材 ─────────────────────────────────────────────
  //   病根:粗剪视频 + SRT 两阶段上传已落库(materialLink stage=production),但 video/srt 只
  //   在组件 state → 离开本页组件卸载即清,回来空白、被迫从零重传(用户实测)。这里 mount 时按
  //   项目拉 production 用料链,恢复最近的 video(role=clip)+ subtitle(role=reference);SRT
  //   文本经签名下载 URL 回读(AI 分场决策要 srt.text、相似度校验要 srt.lines)。只在初始空态跑
  //   一次,不覆盖本会话内刚上传的(setX(prev => prev ?? …))。恢复是增强,失败静默(可重传)。
  const restoredRef = React.useRef(false);
  React.useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    void (async () => {
      try {
        const links = (await client.listMaterialLinks({
          params: undefined,
          query: { projectId, page: 1, pageSize: 100 },
          body: undefined,
        })) as unknown as ReadonlyArray<{
          entityType: string;
          entityId: string;
          role: string;
          stage: string;
          createdAt: string;
        }>;
        const prod = links.filter(
          (l) => l.stage === "production" && l.entityType === "asset",
        );
        const latestOf = (role: string) =>
          prod
            .filter((l) => l.role === role)
            .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] ?? null;
        const videoLink = latestOf("clip");
        const srtLink = latestOf("reference");
        // [T-366a] 上传成品路径的恢复:role=final 存在 → 回到「直接上传成品」视图 +
        // 成片预览(与 CreatorOS 渲染成片互不干扰,role 隔离)。
        const finalLink = latestOf("final");
        if (finalLink) {
          setMethod("upload");
          setFinalVideoAssetId((prev) => prev ?? finalLink.entityId);
        }
        if (videoLink) {
          // 视频时长在上传时由 File 客户端读得,离开后无源 → null(时长校验优雅跳过,不阻断)。
          setVideo((prev) =>
            prev ?? {
              assetId: videoLink.entityId,
              name: "已上传的粗剪视频",
              durationSec: null,
            },
          );
        }
        if (srtLink) {
          const url = await resolveAssetPreviewUrl(srtLink.entityId);
          if (url) {
            const res = await fetch(url);
            if (res.ok) {
              const text = await res.text();
              const lines = parseSrt(text);
              if (lines.length > 0) {
                setSrt((prev) =>
                  prev ?? {
                    assetId: srtLink.entityId,
                    name: "已上传的 SRT 字幕",
                    text,
                    lines,
                  },
                );
              }
            }
          }
        }
      } catch {
        // 恢复失败不阻断(用户可重新上传)。
      }
    })();
  }, [projectId]);

  // 已确认分镜是制作真值，刷新后必须从 production.recordingConfig 回读，不能只靠组件 state。
  React.useEffect(() => {
    if (!outputId) return;
    void (async () => {
      try {
        const prod = (await client.getOutputProduction({
          params: { outputId },
          query: undefined,
          body: undefined,
        })) as unknown as WireProduction;
        const plan = prod.recordingConfig?.videoEditingPlan as
          | {
              revision?: unknown;
              decisions?: unknown;
              renderProps?: unknown;
              inventory?: unknown;
              sourceRenderTaskId?: unknown;
            }
          | undefined;
        if (!plan) return;
        if (typeof plan.revision === "number") setEditingPlanRevision(plan.revision);
        if (plan.decisions && typeof plan.decisions === "object") {
          setDecisions(plan.decisions as VideoDecisions);
          setDecisionsConfirmed(true);
          setRecoveredDecisions(true);
        }
        if (Array.isArray(plan.inventory)) {
          setInventory(plan.inventory as BrollAssetRef[]);
        }
        const delivery = (plan.renderProps as { delivery?: unknown } | null)
          ?.delivery as { width?: unknown; height?: unknown } | undefined;
        if (
          typeof delivery?.width === "number" &&
          typeof delivery.height === "number"
        ) {
          setRenderOrientation(
            delivery.height > delivery.width ? "portrait" : "landscape",
          );
        }
        if (typeof plan.sourceRenderTaskId === "string") {
          setRenderTaskId((current) => current ?? plan.sourceRenderTaskId as string);
        }
      } catch {
        // 旧 production 没有方案或暂时不可读，不阻断重新分场。
      }
    })();
  }, [outputId]);

  // ── SRT 匹配校验(挡在提交前)──────────────────────────────────────────────
  const durationCheck: SrtDurationCheck | null = React.useMemo(() => {
    if (!srt || video?.durationSec == null) return null;
    return checkSrtDurationMatch(srt.lines, video.durationSec);
  }, [srt, video]);
  const scriptCheck: SrtScriptCheck | null = React.useMemo(() => {
    if (!srt || !voiceoverText) return null;
    return checkSrtScriptMatch(srt.lines, voiceoverText);
  }, [srt, voiceoverText]);
  const checksBlocked =
    (durationCheck !== null && !durationCheck.ok) ||
    (scriptCheck !== null && !scriptCheck.ok);

  const materialsReady = Boolean(video && srt && voiceoverText);
  const canDispatchDecisions =
    materialsReady && (!checksBlocked || override) && !decisionsTaskId && !decisionsBusy;

  // ── production 状态机(forward-only 相邻步进;output 懒建)────────────────────
  const ensureOutputId = React.useCallback(async (): Promise<string> => {
    if (outputId) return outputId;
    const created = (await client.createOutput({
      params: { projectId },
      query: undefined,
      body: { title: projectTitle || "成片" },
    })) as unknown as { id: string };
    setOutputId(created.id);
    return created.id;
  }, [outputId, projectId, projectTitle]);

  const advanceStatus = React.useCallback(
    async (target: ProductionStatus): Promise<string | null> => {
      try {
        const oid = await ensureOutputId();
        const prod = (await client.getOutputProduction({
          params: { outputId: oid },
          query: undefined,
          body: undefined,
        })) as unknown as WireProduction;
        let current = prod.status;
        for (const step of statusStepsTo(current, target)) {
          const updated = (await client.putOutputProduction({
            params: { outputId: oid },
            query: undefined,
            body:
              step === "recording"
                ? { status: step, productionMode: "studio" }
                : { status: step },
          })) as unknown as WireProduction;
          current = updated.status;
        }
        setStatus(current);
        return prod.id;
      } catch {
        return null; // 状态机是伴随记账,失败不阻断主流程(诚实保持原状态显示)
      }
    },
    [ensureOutputId],
  );

  // ── 上传 handlers ────────────────────────────────────────────────────────────
  const onVideoFile = React.useCallback(
    async (file: File) => {
      setUploadBusy("video");
      setUploadError(null);
      try {
        const durationSec = await readVideoDuration(file);
        const assetId = await uploadProductionAsset(projectId, file, "video");
        setVideo({ assetId, name: file.name, durationSec });
        void advanceStatus(srt ? "editing" : "recording");
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : "视频上传失败,请重试",
        );
      } finally {
        setUploadBusy("");
      }
    },
    [projectId, readVideoDuration, advanceStatus, srt],
  );

  const onSrtFile = React.useCallback(
    async (file: File) => {
      setUploadBusy("srt");
      setUploadError(null);
      try {
        const text = await readFileText(file);
        const lines = parseSrt(text);
        if (lines.length === 0) {
          throw new Error(
            "SRT 解析不出任何字幕行 —— 请检查文件是不是剪辑软件导出的 .srt 字幕",
          );
        }
        const assetId = await uploadProductionAsset(projectId, file, "subtitle");
        setSrt({ assetId, name: file.name, text, lines });
        setOverride(false); // 换文件后覆盖声明作废,重新校验
        void advanceStatus(video ? "editing" : "recording");
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : "SRT 上传失败,请重试",
        );
      } finally {
        setUploadBusy("");
      }
    },
    [projectId, advanceStatus, video],
  );

  // ── [T-294] B-roll 素材:列 / 补传(role=broll)/ 剔除 ────────────────────────
  // [T-387c/T-739] 扩自动聚合:除手动上传(role=broll)外,把当前项目用料链中的
  // image/video 资产自动列入；脚本凝固分镜点名只调整当前项目已挂载素材的来源和优先级。
  // 服务端决策的 listBrollInventory 用同一批来源;这里的剔除经 inputData.excludedAssetIds 传给决策。
  const loadBroll = React.useCallback(async () => {
    setBrollInventoryStatus("loading");
    try {
      const links = (await client.listMaterialLinks({
        params: undefined,
        query: { projectId, page: 1, pageSize: 100 },
        body: undefined,
      })) as unknown as ReadonlyArray<{
        id: string;
        entityType: string;
        entityId: string;
        role: string;
      }>;
      const brollLinks = links.filter(
        (l) => l.entityType === "asset" && l.role === "broll",
      );
      const items = await Promise.all(
        brollLinks.map(async (l) => {
          try {
            const a = (await client.getAsset({
              params: { assetId: l.entityId },
              query: undefined,
              body: undefined,
            })) as unknown as { assetType: string; name: string };
            return {
              linkId: l.id,
              assetId: l.entityId,
              kind: a.assetType,
              name: a.name,
            };
          } catch {
            return null; // 单条越权/已删跳过,不牵连整批
          }
        }),
      );
      const manual = items.filter((i): i is NonNullable<typeof i> => i !== null);
      setBrollItems(manual);

      // ── 自动聚合(best-effort:任一来源读失败只丢该来源,不牵连)────────────
      // 读某类型 artifact 当前版本 contentData(与稿面读侧同款 listArtifacts →
      // getArtifact → listArtifactVersions 三连;失败 → null)。
      const readContentData = async (
        artifactType: string,
      ): Promise<unknown> => {
        try {
          const listed = (await client.listArtifacts({
            params: { projectId },
            query: { page: 1, pageSize: 200 },
            body: undefined,
          })) as unknown as Array<{ id: string; artifactType: string }>;
          const target = (Array.isArray(listed) ? listed : []).find(
            (a) => a.artifactType === artifactType,
          );
          if (!target) return null;
          const artifact = (await client.getArtifact({
            params: { artifactId: target.id },
            query: undefined,
            body: undefined,
          })) as unknown as { currentVersionId?: string };
          const versions = (await client.listArtifactVersions({
            params: { artifactId: target.id },
            query: { page: 1, pageSize: 100 },
            body: undefined,
          })) as unknown as Array<{
            id: string;
            versionNumber: number;
            contentData?: unknown;
          }>;
          const rows = Array.isArray(versions) ? versions : [];
          const current =
            rows.find((v) => v.id === artifact.currentVersionId) ??
            rows.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0];
          return current?.contentData ?? null;
        } catch {
          return null;
        }
      };
      const scriptData = await readContentData("output_script");
      const projectAssetLinks = links.filter(
        (link) =>
          link.entityType === "asset" &&
          link.role !== "cover" &&
          link.role !== "final",
      );
      const projectAssetIds = new Set(
        projectAssetLinks.map((link) => link.entityId),
      );
      const projectRoleByAssetId = new Map(
        projectAssetLinks.map((link) => [link.entityId, link.role]),
      );
      // 候选 id(按来源优先级 script → ammo;聚合时先到先得)。
      const candidates: Array<{
        assetId: string;
        source: AutoBrollItem["source"];
        role?: string;
      }> =
        [
          ...assetRefsFromScriptContentData(scriptData)
            .filter((id) => projectAssetIds.has(id))
            .map((id) => ({
              assetId: id,
              source: "script" as const,
              role: projectRoleByAssetId.get(id),
            })),
          ...projectAssetLinks
            .filter(
              (l) =>
                l.role !== "broll" &&
                l.role !== "cover" &&
                l.role !== "final",
            )
            .map((l) => ({
              assetId: l.entityId,
              source: "ammo" as const,
              role: l.role,
            })),
        ];
      const resolved = await Promise.all(
        candidates.map(async (cand) => {
          try {
            const a = (await client.getAsset({
              params: { assetId: cand.assetId },
              query: undefined,
              body: undefined,
            })) as unknown as { assetType: string; name: string };
            // 只有图/视频能当 B-roll(文档/知识条目自然被 getAsset 失败或类型过滤掉)。
            if (a.assetType !== "video" && a.assetType !== "image") return null;
            if (cand.role === "clip" && a.assetType === "video") return null;
            return {
              assetId: cand.assetId,
              name: a.name,
              kind: a.assetType,
              source: cand.source,
            } satisfies AutoBrollItem;
          } catch {
            return null; // 知识条目 id / 越权 / 已删 → 跳过
          }
        }),
      );
      setAutoBroll(
        aggregateAutoBroll(
          resolved.filter((i): i is AutoBrollItem => i !== null),
          manual.map((m) => m.assetId),
        ),
      );
      setBrollInventoryStatus("ready");
    } catch {
      setBrollInventoryStatus("error");
    }
  }, [projectId]);

  React.useEffect(() => {
    const id = window.setTimeout(() => {
      void loadBroll();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadBroll]);

  // 兼容 1.0 已保存但尚未携带 inventory 的旧方案：只从当前项目用料链重建下拉清单，
  // 不读取全局素材、不重新跑 AI，也不改既有 assetId/时间线。
  React.useEffect(() => {
    if (!recoveredDecisions || !decisions || inventory.length > 0) return;
    const fallback = new Map<string, BrollAssetRef>();
    for (const item of brollItems) {
      fallback.set(item.assetId, {
        assetId: item.assetId,
        label: item.name,
        kind: item.kind,
        description: "",
        source: "manual",
      });
    }
    for (const item of autoBroll) {
      if (fallback.has(item.assetId)) continue;
      fallback.set(item.assetId, {
        assetId: item.assetId,
        label: item.name,
        kind: item.kind,
        description: "",
        source: item.source,
      });
    }
    if (fallback.size === 0) return;
    const id = window.setTimeout(() => {
      setInventory([...fallback.values()]);
    }, 0);
    return () => window.clearTimeout(id);
  }, [autoBroll, brollItems, decisions, inventory.length, recoveredDecisions]);

  const currentProjectInventory = React.useMemo(() => {
    const current = new Map<string, BrollAssetRef>();
    for (const item of brollItems) {
      current.set(item.assetId, {
        assetId: item.assetId,
        label: item.name,
        kind: item.kind,
        description: "",
        source: "manual",
      });
    }
    for (const item of autoBroll) {
      if (current.has(item.assetId)) continue;
      current.set(item.assetId, {
        assetId: item.assetId,
        label: item.name,
        kind: item.kind,
        description: "",
        source: item.source,
      });
    }
    return [...current.values()];
  }, [autoBroll, brollItems]);

  // 已恢复方案的 inventory 是“当时快照”，不能继续冒充“当前仍可用”。当前项目清单加载
  // 成功后，以当前清单作为唯一可选集；旧快照只负责给失效绑定提供可读名称。
  const selectableInventory = React.useMemo(
    () =>
      recoveredDecisions && brollInventoryStatus === "ready"
        ? currentProjectInventory
        : inventory,
    [
      brollInventoryStatus,
      currentProjectInventory,
      inventory,
      recoveredDecisions,
    ],
  );
  const unavailableAssetLabels = React.useMemo(() => {
    if (
      !recoveredDecisions ||
      brollInventoryStatus !== "ready" ||
      !decisions
    ) {
      return {} as Readonly<Record<string, string>>;
    }
    const availableIds = new Set(
      selectableInventory.map((item) => item.assetId),
    );
    const historicalLabels = new Map(
      inventory.map((item) => [item.assetId, item.label]),
    );
    return Object.fromEntries(
      decisions.broll
        .filter((pick) => !availableIds.has(pick.assetId))
        .map((pick) => [
          pick.assetId,
          historicalLabels.get(pick.assetId) ?? pick.assetId,
        ]),
    );
  }, [
    brollInventoryStatus,
    decisions,
    inventory,
    recoveredDecisions,
    selectableInventory,
  ]);
  const hasUnavailableBroll =
    Object.keys(unavailableAssetLabels).length > 0;

  const invalidateDecisionsForBrollChange = React.useCallback(async () => {
    if (decisionsTaskId) {
      await client.cancelTask({
        params: { taskId: decisionsTaskId },
        query: undefined,
        body: undefined,
      });
    }
    setDecisions(null);
    setDecisionsConfirmed(false);
    setDecisionsTaskId(null);
    setDecisionsRetryOfTaskId(null);
    setInventory([]);
    setRecoveredDecisions(false);
    setBrollRevisionNotice("素材已更新，请重新运行 AI 分场决策。");
  }, [decisionsTaskId]);

  // [T-687] Copilot 中采纳生成素材后，制作页无需重进项目：立即刷新同一份项目用料链，
  // 并把基于旧清单的分场决策标为失效。封面更新不影响 B-roll 决策，因此只响应 role=broll。
  React.useEffect(() => {
    const onMaterialsChanged = (event: Event) => {
      const detail = (event as CustomEvent<{
        projectId?: string;
        role?: string;
      }>).detail;
      if (detail?.projectId !== projectId || detail.role !== "broll") return;
      void (async () => {
        await loadBroll();
        await invalidateDecisionsForBrollChange();
      })();
    };
    window.addEventListener(
      "creatoros:project-materials-changed",
      onMaterialsChanged,
    );
    return () => {
      window.removeEventListener(
        "creatoros:project-materials-changed",
        onMaterialsChanged,
      );
    };
  }, [invalidateDecisionsForBrollChange, loadBroll, projectId]);

  const onBrollFiles = React.useCallback(
    async (files: FileList | readonly File[] | null) => {
      if (!files || files.length === 0) return;
      setBrollBusy(true);
      setUploadError(null);
      try {
        for (const file of Array.from(files)) {
          if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
            throw new Error(`不支持的素材类型：${file.name}（仅支持图片或视频）`);
          }
          const kind = file.type.startsWith("image/") ? "image" : "video";
          await uploadProductionAsset(projectId, file, kind, "broll");
        }
        await loadBroll();
        if (decisions || decisionsTaskId) {
          await invalidateDecisionsForBrollChange();
        }
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : "B-roll 素材上传失败,请重试",
        );
      } finally {
        setBrollBusy(false);
      }
    },
    [
      projectId,
      loadBroll,
      decisions,
      decisionsTaskId,
      invalidateDecisionsForBrollChange,
    ],
  );

  const onRemoveBroll = React.useCallback(
    async (linkId: string) => {
      setBrollBusy(true);
      try {
        await client.deleteMaterialLink({
          params: { linkId },
          query: undefined,
          body: undefined,
        });
        await loadBroll();
        if (decisions || decisionsTaskId) {
          await invalidateDecisionsForBrollChange();
        }
      } catch {
        /* 删除失败静默(下次可再试) */
      } finally {
        setBrollBusy(false);
      }
    },
    [
      loadBroll,
      decisions,
      decisionsTaskId,
      invalidateDecisionsForBrollChange,
    ],
  );

  // ── [T-366a] 直接上传成品视频(跳过四决策/渲染直登成片)──────────────────────
  //   §5.1③ 探测:已有成片 + 该 output 已有 publication 登记 → 禁覆盖(先解除登记或
  //   新增产出,绝不静默换片)。只在 upload 视图且存在既有成片时探测(best-effort)。
  const hasExistingFinal = Boolean(finalVideoAssetId || status === "ready");
  React.useEffect(() => {
    if (method !== "upload" || !outputId || !hasExistingFinal) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 离开探测语境时复位(同 FinalVideoPreview 复位先例)
      setPubLocked(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const pubs = (await client.listPublications({
          params: { outputId },
          query: { page: 1, pageSize: 50 },
          body: undefined,
        })) as unknown as ReadonlyArray<{ id: string }>;
        if (!cancelled) setPubLocked(pubs.length > 0);
      } catch {
        if (!cancelled) setPubLocked(null); // 探测失败 → 上传时再兜一次
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [method, outputId, hasExistingFinal]);

  const onFinalFile = React.useCallback(
    async (file: File) => {
      setFinalError(null);
      setFinalNotice(null);
      // 基本校验(§5.1⑤):格式收窄 mp4/mov + 可读时长探针,坏文件诚实拒收不直登 ready。
      const isMp4Mov =
        /\.(mp4|mov)$/i.test(file.name) ||
        file.type === "video/mp4" ||
        file.type === "video/quicktime";
      if (!isMp4Mov) {
        setFinalError("成品只收 mp4 / mov 格式 —— 请从剪辑软件导出后再上传。");
        return;
      }
      setFinalBusy(true);
      try {
        const durationSec = await readVideoDuration(file);
        if (durationSec == null || durationSec <= 0) {
          setFinalError(
            "读不出有效时长(文件可能损坏或不是视频)—— 已拒收,请检查文件后重试。",
          );
          return;
        }
        // §5.1③ 禁覆盖:已有成片且该产出已被 publication 登记 → 不覆盖已登记事实。
        if (hasExistingFinal && outputId) {
          let locked = pubLocked;
          if (locked === null) {
            try {
              const pubs = (await client.listPublications({
                params: { outputId },
                query: { page: 1, pageSize: 50 },
                body: undefined,
              })) as unknown as ReadonlyArray<{ id: string }>;
              locked = pubs.length > 0;
            } catch {
              locked = null; // 探测不到 → 保守放行(登记事实在服务端仍不可变)
            }
          }
          if (locked) {
            setPubLocked(true);
            setFinalError(
              "当前成片已登记过发布 —— 不能覆盖已登记的事实。请先在发布面解除登记,或新建产出再上传。",
            );
            return;
          }
        }
        // 复用两阶段上传链(role=final,与粗剪 clip / B-roll 隔离)。
        const assetId = await uploadProductionAsset(
          projectId,
          file,
          "video",
          "final",
        );
        // 状态机跳转语义(SPEC §5 待决点 1,选「补记中间态」):后端 putProduction 只接受
        // 相邻 +1(跨步 → ConflictError),不为本路径开非相邻跳 —— 复用 statusStepsTo 依次
        // PUT recording→editing→rendering(advanceStatus 内部逐步),语义零改动。
        const productionId = await advanceStatus("rendering");
        if (!productionId) {
          throw new Error("production 状态机推进失败,请重试");
        }
        // 复用既有导出范式:export 建档(queued)→ completeExport(resultAssetId=成品)。
        // completeExport 的后端 fan-out 会把成品挂为 output primary asset —— 发布登记 /
        // 盲预测 / 发布物料链照常(§5.1⑤ 飞轮不脱钩)。
        const exp = (await client.createProductionExport({
          params: { productionId },
          query: undefined,
          body: {
            format: "mp4",
            resolution:
              renderOrientation === "portrait" ? "1080x1920" : "1920x1080",
            aspectRatio:
              renderOrientation === "portrait" ? "9:16" : "16:9",
          },
        })) as unknown as { id: string };
        await client.completeExport({
          params: { exportId: exp.id },
          query: undefined,
          body: { resultAssetId: assetId },
        });
        await advanceStatus("ready");
        setFinalVideoAssetId(assetId);
        setReplaceOk(false);
        setFinalNotice(
          `成品「${file.name}」已登记为本项目成片(export ready)。盲预测 / 发布物料 / 登记发布照常可用。`,
        );
      } catch (err) {
        setFinalError(
          err instanceof Error ? err.message : "成品上传失败,请重试",
        );
      } finally {
        setFinalBusy(false);
      }
    },
    [
      projectId,
      readVideoDuration,
      advanceStatus,
      renderOrientation,
      hasExistingFinal,
      outputId,
      pubLocked,
    ],
  );

  // ── [T-366b] 素材包导出(辅助入口)────────────────────────────────────────────
  // 预计大小:项目素材 fileSize 求和(asset 投影自带 fileSize;读不到就不提示,不编数)。
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const links = (await client.listMaterialLinks({
          params: undefined,
          query: { projectId, page: 1, pageSize: 100 },
          body: undefined,
        })) as unknown as ReadonlyArray<{ entityType: string; entityId: string }>;
        const assetIds = links
          .filter((l) => l.entityType === "asset")
          .map((l) => l.entityId);
        let sum = 0;
        let any = false;
        for (const id of assetIds) {
          try {
            const a = (await client.getAsset({
              params: { assetId: id },
              query: undefined,
              body: undefined,
            })) as unknown as { fileSize: number | null };
            if (typeof a.fileSize === "number") {
              sum += a.fileSize;
              any = true;
            }
          } catch {
            /* 单条读不到跳过 */
          }
        }
        if (!cancelled && any) setEstBytes(sum);
      } catch {
        /* 估算失败 → 不显示提示(诚实跳过) */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const onExportMaterials = React.useCallback(async () => {
    setExportBusy(true);
    setExportError(null);
    setExportDone(null);
    try {
      const oid = await ensureOutputId();
      const prod = (await client.getOutputProduction({
        params: { outputId: oid },
        query: undefined,
        body: undefined,
      })) as unknown as WireProduction;
      const res = (await client.exportProductionMaterials({
        params: { productionId: prod.id },
        query: undefined,
        body: undefined,
      })) as unknown as {
        downloadUrl: string;
        fileName: string;
        fileCount: number;
        hasDecisions: boolean;
      };
      setExportDone(res);
      // 经既有签名下载 URL 通道触发浏览器下载。
      const a = document.createElement("a");
      a.href = res.downloadUrl;
      a.download = res.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "素材包导出失败,请重试",
      );
    } finally {
      setExportBusy(false);
    }
  }, [ensureOutputId]);

  // ── ② AI 分场决策 dispatch + 轮询 ───────────────────────────────────────────
  const dispatchDecisions = React.useCallback(
    async (
      manualMaterialAssignments: readonly ManualMaterialAssignment[] = [],
    ) => {
      if (!srt || !voiceoverText) return;
      setDecisionsBusy(true);
      setDecisionsError(null);
      setDecisionsErrorDetail(null);
      setBrollRevisionNotice(null);
      try {
        const task = (await client.createAITask({
          params: undefined,
          query: undefined,
          body: {
            taskType: "video.decisions",
            attemptId: createAiTaskAttemptId(),
            ...(decisionsRetryOfTaskId
              ? { retryOfTaskId: decisionsRetryOfTaskId }
              : {}),
            inputData: {
              projectId,
              srtText: srt.text,
              script: voiceoverText,
              // 本次制作画幅直接喂给候选节点与总导演，分场/信息卡/B-roll 从一开始就按
              // 9:16 或 16:9 构图，而不是最后渲染时再粗暴裁切。
              orientation: renderOrientation,
              // [T-387c] 备料③人剔除的自动聚合项 → 决策可选集里滤掉(不动用料链)。
              excludedAssetIds: Array.from(excludedAuto),
              ...(manualMaterialAssignments.length > 0
                ? { manualMaterialAssignments }
                : {}),
            },
          },
        })) as unknown as WireAITask;
        // 新任务创建成功才切走旧确认卡。历史 plan/render/final 都在服务端与现有 state
        // 保留；这里只把“当前正在编辑的候选”切到新任务。
        setDecisionsConfirmed(false);
        setDecisions(null);
        setInventory([]);
        setRecoveredDecisions(false);
        setDecisionsTaskId(task.id);
        setDecisionsRetryOfTaskId(null);
      } catch (err) {
        setDecisionsError(
          err instanceof Error ? err.message : "决策任务创建失败,请重试",
        );
      } finally {
        setDecisionsBusy(false);
      }
    },
    [
      projectId,
      srt,
      voiceoverText,
      excludedAuto,
      renderOrientation,
      decisionsRetryOfTaskId,
    ],
  );

  const loadDecisionResult = React.useCallback(
    async (taskId: string): Promise<boolean> => {
      const results = (await client.listTaskResults({
        params: { taskId },
        query: undefined,
        body: undefined,
      })) as unknown as WireTaskResult[];
      const candidate = [...results]
        .reverse()
        .find((r) => r.resultType === "video_decisions");
      if (!candidate) return false;
      const data = candidate.resultData as {
        decisions?: unknown;
        inventory?: unknown;
      };
      if (!data.decisions) return false;
      setDecisions(data.decisions as VideoDecisions);
      setDecisionsConfirmed(false);
      setInventory(
        Array.isArray(data.inventory)
          ? (data.inventory as BrollAssetRef[])
          : [],
      );
      return true;
    },
    [],
  );

  const adjustMaterials = React.useCallback(
    async (assignments: readonly ManualMaterialAssignment[]) => {
      if (
        materialAdjustmentInFlight.current ||
        !srt ||
        !voiceoverText ||
        !decisions
      ) {
        return;
      }
      materialAdjustmentInFlight.current = true;
      setDecisionsBusy(true);
      setDecisionsError(null);
      setDecisionsErrorDetail(null);
      try {
        const attemptId = materialAdjustmentAttemptId({
          projectId,
          baseDecisions: decisions,
          assignments,
        });
        const task = (await client.createAITask({
          params: undefined,
          query: undefined,
          body: {
            taskType: "video.decisions",
            // 不使用随机 attemptId：双击/重放只能命中同一任务。
            attemptId,
            inputData: {
              projectId,
              srtText: srt.text,
              script: voiceoverText,
              orientation: renderOrientation,
              excludedAssetIds: Array.from(excludedAuto),
              adjustmentMode: "materials",
              baseDecisions: decisions,
              manualMaterialAssignments: assignments,
            },
          },
        })) as unknown as WireAITask;
        setDecisionsConfirmed(false);
        setDecisions(null);
        setRecoveredDecisions(false);
        setDecisionsTaskId(task.id);
      } catch (err) {
        setDecisionsError(
          err instanceof Error ? err.message : "补充选材应用失败,请重试",
        );
      } finally {
        materialAdjustmentInFlight.current = false;
        setDecisionsBusy(false);
      }
    }, [
      decisions,
      excludedAuto,
      projectId,
      renderOrientation,
      srt,
      voiceoverText,
    ],
  );

  React.useEffect(() => {
    if (!decisionsTaskId || decisions) return;
    let abandoned = false;
    void (async () => {
      // [FE-H01] 持续轮询(退避到 30s 封顶),绝不因「轮询次数用尽」静默退出:四决策后台跑
      // 分钟级,离开再回来仍能接着看进度/终态。只在 awaiting_confirmation / failed / cancelled
      // 终态或组件卸载(abandoned)时停。
      for (let attempt = 0; ; attempt++) {
        try {
          const task = (await client.getTask({
            params: { taskId: decisionsTaskId },
            query: undefined,
            body: undefined,
          })) as unknown as WireAITask;
          if (abandoned) return;
          if (task.status === "awaiting_confirmation") {
            await loadDecisionResult(decisionsTaskId);
            return;
          }
          if (task.status === "succeeded") {
            await loadDecisionResult(decisionsTaskId);
            return;
          }
          if (task.status === "failed" || task.status === "cancelled") {
            // 诚实报是哪一步失败(runner 把失败步骤写进步骤流末条)。
            let detail = "";
            try {
              const steps = (await client.listTaskSteps({
                params: { taskId: decisionsTaskId },
                query: undefined,
                body: undefined,
              })) as unknown as Array<{ text: string }>;
              detail = steps[steps.length - 1]?.text ?? "";
            } catch {
              /* 步骤读取失败不影响错误主信息 */
            }
            const failure = decisionFailureDisplay(detail);
            setDecisionsError(failure.summary);
            setDecisionsErrorDetail(failure.detail);
            setDecisionsRetryOfTaskId(decisionsTaskId);
            setDecisionsTaskId(null);
            return;
          }
        } catch {
          /* 单次拉取失败下轮再试 */
        }
        await new Promise((r) => setTimeout(r, pollDelay(attempt)));
        if (abandoned) return;
      }
    })();
    return () => {
      abandoned = true;
    };
  }, [decisionsTaskId, decisions, loadDecisionResult]);

  // ── ③ 确认决策 → 渲染任务 dispatch(mountAs=assetId 约定)──────────────────
  const onConfirmDecisions = React.useCallback(
    async (payload: {
      decisions: VideoDecisions;
      renderProps: VideoRenderProps;
    }) => {
      if (renderDispatchBusy) return;
      setFlowError(null);
      setRenderDispatchBusy(true);
      setRenderTaskStatus("saving_plan");
      let createdTask = false;
      try {
        const oid = await ensureOutputId();
        // 先原子保存、再从响应回读确认；保存失败绝不创建渲染任务，避免“渲了但回顾为空”。
        const persisted = (await client.confirmProductionEditingPlan({
          params: { outputId: oid },
          query: undefined,
          body: {
            expectedRevision: editingPlanRevision,
            plan: {
              sourceTaskId: decisionsTaskId,
              confirmedAt: new Date().toISOString(),
              decisions: payload.decisions as unknown as Record<string, unknown>,
              renderProps: payload.renderProps as unknown as Record<string, unknown>,
              inventory: selectableInventory as unknown as Record<string, unknown>[],
            },
          },
        })) as unknown as WireProduction;
        const savedPlan = persisted.recordingConfig?.videoEditingPlan as
          | { revision?: unknown }
          | undefined;
        if (typeof savedPlan?.revision !== "number") {
          throw new Error("分镜方案保存后未能回读，请刷新后重试，未开始渲染");
        }
        setEditingPlanRevision(savedPlan.revision);
        setDecisionsConfirmed(true);
        setRenderTaskStatus("creating_task");

        // 渲染执行任务是主链(inputs 物化声明:mountAs 必须 = assetId)。
        const created = (await client.createExecutionTask({
          params: undefined,
          query: undefined,
          body: {
            spec: {
              taskType: "video.render",
              goal: `渲染成片:${projectTitle || "未命名成片"}`,
              inputs: buildRenderInputs(payload.renderProps),
              params: { props: payload.renderProps },
              constraints: {
                timeoutSec: 1800,
                network: "deny",
                maxOutputMB: 2048,
              },
            } as never,
            projectId,
          },
        })) as unknown as WireExecTask;
        createdTask = true;
        setRenderTaskId(created.id);
        setRenderTaskStatus(created.status as RenderFlowStatus);
        // 再把本次 render task 关联回同一窄写 plan，刷新后仍能定位当前成片任务。
        // 若关联写失败，首轮已保存的分镜方案仍保留；页面明确报错，不伪装完整成功。
        const linked = (await client.confirmProductionEditingPlan({
          params: { outputId: oid },
          query: undefined,
          body: {
            expectedRevision: savedPlan.revision,
            plan: {
              sourceTaskId: decisionsTaskId,
              sourceRenderTaskId: created.id,
              confirmedAt: new Date().toISOString(),
              decisions: payload.decisions as unknown as Record<string, unknown>,
              renderProps: payload.renderProps as unknown as Record<string, unknown>,
              inventory: selectableInventory as unknown as Record<string, unknown>[],
            },
          },
        })) as unknown as WireProduction;
        const linkedPlan = linked.recordingConfig?.videoEditingPlan as
          | { revision?: unknown }
          | undefined;
        if (typeof linkedPlan?.revision !== "number") {
          throw new Error("成片任务已创建，但关联状态保存失败，请刷新后重试查看任务");
        }
        setEditingPlanRevision(linkedPlan.revision);
        const confirmedTaskId = decisionsTaskId;
        setDecisionsTaskId(null); // 决策任务已消费,停掉轮询
        // 伴随记账(全部 best-effort,失败不撤销已发出的渲染任务):
        // 决策任务收口 succeeded。
        if (confirmedTaskId) {
          void client
            .confirmTask({
              params: { taskId: confirmedTaskId },
              query: undefined,
              body: undefined,
            })
            .catch(() => undefined);
        }
        // 状态机 → rendering;分场登记 + exportRecord(queued)。
        const productionId = await advanceStatus("rendering");
        if (productionId) {
          try {
            // segment 是 production 的一次性结构登记；重新生成只新增 render/export
            // 版本，不能把同一批分场重复插入数据库。
            if (segmentCount === 0) {
              for (const [i, scene] of payload.decisions.scenes.entries()) {
                await client.createProductionSegment({
                  params: { productionId },
                  query: undefined,
                  body: {
                    title: scene.title,
                    position: i,
                    startMs: Math.round(scene.startSec * 1000),
                    endMs: Math.round(scene.endSec * 1000),
                  },
                });
              }
              setSegmentCount(payload.decisions.scenes.length);
            }
            const { width, height } = payload.renderProps.delivery;
            const exp = (await client.createProductionExport({
              params: { productionId },
              query: undefined,
              body: {
                format: "mp4",
                resolution: `${width}x${height}`,
                aspectRatio: height > width ? "9:16" : "16:9",
              },
            })) as unknown as { id: string };
            setExportId(exp.id);
          } catch {
            /* 记账失败不阻断渲染跟踪 */
          }
        }
      } catch (err) {
        if (!createdTask) setRenderTaskStatus("failed");
        setFlowError(
          err instanceof Error ? err.message : "渲染任务创建失败,请重试",
        );
      } finally {
        setRenderDispatchBusy(false);
      }
    },
    [
      projectId,
      projectTitle,
      decisionsTaskId,
      advanceStatus,
      ensureOutputId,
      editingPlanRevision,
      renderDispatchBusy,
      segmentCount,
      selectableInventory,
    ],
  );

  const regenerateCurrentStoryboard = React.useCallback(() => {
    if (!decisions || !video) return;
    void onConfirmDecisions({
      decisions,
      renderProps: assembleVideoRenderProps(decisions, {
        title: projectTitle,
        talkingHeadAssetId: video.assetId,
        talkingHeadDurationSec: video.durationSec ?? undefined,
        inventory: selectableInventory,
        orientation: renderOrientation,
      }),
    });
  }, [
    decisions,
    selectableInventory,
    onConfirmDecisions,
    projectTitle,
    renderOrientation,
    video,
  ]);

  const regenerateStoryboard = React.useCallback(() => {
    // dispatch 成功后才替换当前卡；请求失败时保留已确认方案，避免用户因一次网络错误
    // 丢掉可回顾内容。旧 render/final asset 始终保留并继续可预览。
    void dispatchDecisions();
  }, [dispatchDecisions]);

  const restoryboardWithManualAssignments = React.useCallback(
    (assignments: readonly ManualMaterialAssignment[]) => {
      void adjustMaterials(assignments);
    },
    [adjustMaterials],
  );

  const onDiscardDecisions = React.useCallback(() => {
    if (decisionsTaskId) {
      void client
        .cancelTask({
          params: { taskId: decisionsTaskId },
          query: undefined,
          body: undefined,
        })
        .catch(() => undefined);
    }
    setDecisions(null);
    setDecisionsConfirmed(false);
    setDecisionsTaskId(null);
    setDecisionsRetryOfTaskId(null);
    setRecoveredDecisions(false);
  }, [decisionsTaskId]);

  // ── ④ 渲染任务跟踪:采纳 → 项目用料链 + completeExport + ready ─────────────
  React.useEffect(() => {
    if (!renderTaskId) return;
    let abandoned = false;
    void (async () => {
      // [FE-H01] 同决策轮询:持续轮询 + 退避,只在 succeeded / failed / cancelled 终态或卸载时停。
      for (let attempt = 0; ; attempt++) {
        try {
          const task = (await client.getExecutionTask({
            params: { taskId: renderTaskId },
            query: undefined,
            body: undefined,
          })) as unknown as WireExecTask;
          if (abandoned) return;
          setRenderTaskStatus(task.status as RenderFlowStatus);
          setRenderEnvHint(humanizeRenderError(task.errorMessage));
          if (task.status === "succeeded") {
            const resultAssetId = task.adoptedAssetIds[0];
            if (!resultAssetId) {
              setRenderFinalizeError(
                "渲染任务已结束，但没有可用的成片资产。请在上方卡片重试。",
              );
              return;
            }
            try {
              const finalOutputId = outputId ?? (await ensureOutputId());
              // [T-548] execution.confirm 只把文件收进素材库，不会自动产生项目用料边。
              // 先反查同一资产的真实 usage，缺边才创建；后续任一步失败再点“重试关联”
              // 都会复用已有边，避免同一成片重复出现在项目使用记录里。
              const usages = (await client.listAssetUsage({
                params: { assetId: resultAssetId },
                query: undefined,
                body: undefined,
              })) as unknown as WireMaterialLink[];
              const alreadyLinked = usages.some(
                (usage) =>
                  usage.projectId === projectId &&
                  usage.contentOutputId === finalOutputId &&
                  usage.entityType === "asset" &&
                  usage.entityId === resultAssetId &&
                  usage.role === "final" &&
                  usage.stage === "production",
              );
              if (!alreadyLinked) {
                await client.createMaterialLink({
                  params: undefined,
                  query: undefined,
                  body: {
                    projectId,
                    contentOutputId: finalOutputId,
                    entityType: "asset",
                    entityId: resultAssetId,
                    role: "final",
                    stage: "production",
                  },
                });
              }
              if (exportId) {
                await client.completeExport({
                  params: { exportId },
                  query: undefined,
                  body: { resultAssetId },
                });
              } else {
                // 刷新恢复的历史 succeeded 任务拿不到旧 exportId；至少把 output 主成片
                // 修复为真实资产，避免“素材库能播、项目仍无成片”。正常新任务仍走上面的
                // exports.complete，exportRecord 与 output 一起收口。
                await client.patchOutput({
                  params: { outputId: finalOutputId },
                  query: undefined,
                  body: { primaryAssetId: resultAssetId },
                });
              }
              const productionId = await advanceStatus("ready");
              if (!productionId) {
                throw new Error("项目成片状态更新失败");
              }
              if (abandoned) return;
              setRenderFinalizeError(null);
              setRenderEnvHint(null);
              setFinalVideoAssetId(resultAssetId); // [T-292] 真实签名 URL 内联预览
            } catch (error) {
              if (abandoned) return;
              setRenderFinalizeError(
                error instanceof Error
                  ? `成片已生成，但关联项目失败：${error.message}`
                  : "成片已生成，但关联项目失败。请重试关联。",
              );
            }
            return;
          }
          // [FE-H01] failed 是终态:必须停止轮询(否则对已失败任务永久查询、转圈不散)。
          // 环境类错误上面已 humanize 成安装引导;通用错误由 ExecutionTaskCard 显「执行失败:…」
          // + 重试。状态机不推进(诚实停在 rendering 前),失败可见可恢复。
          if (task.status === "failed") return;
          if (task.status === "cancelled") return;
          if (task.status === "awaiting_confirmation") return;
        } catch {
          /* 单次拉取失败下轮再试 */
        }
        await new Promise((r) => setTimeout(r, pollDelay(attempt)));
        if (abandoned) return;
      }
    })();
    return () => {
      abandoned = true;
    };
  }, [
    renderTaskId,
    exportId,
    advanceStatus,
    ensureOutputId,
    outputId,
    projectId,
    renderFinalizeRetry,
  ]);

  // ── 刷新恢复(best-effort):未收口的决策候选 / 在跑 / 已失败的任务接回跟踪 ────────
  //   [FE-H01] 目标:进度不丢、不重复发起付费任务、失败可见可恢复。按「当前最该看的」优先级恢复:
  //   ① 渲染在途 → 接回跟踪;② 最新活跃决策(queued/running/awaiting_confirmation)→
  //   重挂轮询/预览卡(**绝不 re-createAITask**,否则重复付费/重复分场);③ 渲染已成功 →
  //   恢复成片预览;
  //   ④ 渲染失败 → 接回跟踪(ExecutionTaskCard 显失败原因 + 重试,失败可见可恢复)。
  React.useEffect(() => {
    let abandoned = false;
    void (async () => {
      try {
        const projectExecs = (await client.listExecutionTasks({
          params: undefined,
          query: { page: 1, pageSize: 100, projectId },
          body: undefined,
        })) as unknown as WireExecTask[];
        let execs = projectExecs;
        // [T-548 存量恢复] 旧版 retry 新任务没 projectId；仅当当前项目确有历史执行任务
        // 时读本账号最近任务，并按 retryOf 闭包归回。没有项目祖先就绝不吸附全局任务。
        if (projectExecs.length > 0) {
          try {
            const allExecs = (await client.listExecutionTasks({
              params: undefined,
              query: { page: 1, pageSize: 100 },
              body: undefined,
            })) as unknown as WireExecTask[];
            execs = includeExecutionRetryDescendants(projectExecs, allExecs);
          } catch {
            // 全局补读失败仍保留项目直查结果，不让增强恢复挡住主链。
          }
        }
        const live = execs.find(
          (t) =>
            t.execType === "video.render" &&
            (t.status === "queued" ||
              t.status === "running" ||
              t.status === "awaiting_confirmation"),
        );
        if (live && !abandoned) {
          // 项目任务列表按 requestedAt 新→旧返回，是当前执行真值。已保存方案里的
          // sourceRenderTaskId 只是恢复线索，不能抢占更新的在途任务并反复展示旧错误。
          setRenderTaskId(live.id);
          setRenderTaskStatus(live.status as RenderFlowStatus);
          return; // 渲染在途优先;决策候选不再恢复(已消费)
        }
        // [T-308] 当前活跃决策必须压过历史成功成片:用户可在已有成片后重新生成四决策,
        // 离页回来若先命中旧 succeeded render 就 return,会把仍在跑的新任务遮住并重新显示
        // 「AI 分场决策」按钮。listAITasks 按新到旧返回,取第一个活跃任务保持真实时序。
        let tasks: WireAITask[] = [];
        try {
          tasks = (await client.listAITasks({
            params: undefined,
            query: {
              page: 1,
              pageSize: 10,
              projectId,
              taskType: "video.decisions",
            },
            body: undefined,
          })) as unknown as WireAITask[];
        } catch {
          // 单次 AI 任务列表读取失败不应连带遮住可恢复的历史成片/失败渲染。
        }
        const activeDecision = tasks.find(
          (t) =>
            t.status === "queued" ||
            t.status === "running" ||
            t.status === "awaiting_confirmation",
        );
        if (activeDecision && !abandoned) {
          if (activeDecision.status === "awaiting_confirmation") {
            const loaded = await loadDecisionResult(activeDecision.id);
            if (!abandoned) {
              // 重挂轮询(loaded → decisions 已就位,轮询早退;未 loaded → 轮询会补读)。
              setDecisionsTaskId(activeDecision.id);
              if (loaded) setRecoveredDecisions(true);
            }
          } else {
            // queued/running → 重挂轮询,决不重新发起(付费/分场任务不能重复)。
            setDecisionsTaskId((prev) => prev ?? activeDecision.id);
          }
          return;
        }

        const doneRender = execs.find(
          (t) => t.execType === "video.render" && t.status === "succeeded",
        );
        // 没有活跃任务时恢复最新失败任务。只有它确实晚于已完成成片（或还没有成片）才
        // 抢占主状态，避免一条很老的失败任务遮住用户更新的成片。
        const newestDecision = tasks[0];
        const failedDecision =
          newestDecision?.status === "failed" || newestDecision?.status === "cancelled"
            ? newestDecision
            : undefined;
        const failedDecisionIsLatest =
          Boolean(failedDecision) &&
          (!doneRender ||
            (Boolean(failedDecision?.requestedAt) &&
              Boolean(doneRender.requestedAt) &&
              Date.parse(failedDecision!.requestedAt!) >=
                Date.parse(doneRender.requestedAt!)));
        if (failedDecision && failedDecisionIsLatest && !abandoned) {
          let detail = "";
          try {
            const steps = (await client.listTaskSteps({
              params: { taskId: failedDecision.id },
              query: undefined,
              body: undefined,
            })) as unknown as Array<{ text: string }>;
            detail = steps[steps.length - 1]?.text ?? "";
          } catch {
            /* 步骤读取失败仍保留可继续入口 */
          }
          if (!abandoned) {
            const failure = decisionFailureDisplay(detail);
            setDecisionsError(failure.summary);
            setDecisionsErrorDetail(failure.detail);
            setDecisionsRetryOfTaskId(failedDecision.id);
          }
          return;
        }

        // [T-292] 没有活跃决策时才恢复历史成功渲染(回到本页仍能看/播成片)。
        if (doneRender && !abandoned) {
          const aid = doneRender.adoptedAssetIds?.[0];
          if (aid) {
            setFinalVideoAssetId((prev) => prev ?? aid);
            setRenderTaskId((prev) => prev ?? doneRender.id);
            setRenderTaskStatus(doneRender.status as RenderFlowStatus);
            return;
          }
        }
        // [FE-H01] 渲染失败 → 接回跟踪(失败可见可恢复):放在决策恢复之后,让「重新决策」优先。
        const failedRender = execs.find(
          (t) => t.execType === "video.render" && t.status === "failed",
        );
        if (failedRender && !abandoned) {
          setRenderTaskId((prev) => prev ?? failedRender.id);
          setRenderTaskStatus(failedRender.status as RenderFlowStatus);
          return;
        }
      } catch {
        /* 恢复失败诚实从头开始 */
      }
    })();
    return () => {
      abandoned = true;
    };
    // 仅挂载时跑一次(projectId 固定于路由)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 渲染 ─────────────────────────────────────────────────────────────────────
  const fmtDelta = (n: number) => `${Math.round(n)}s`;

  return (
    <div
      data-slot="production-workbench"
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4"
    >
      {/* 状态条(production 状态机真值) */}
      <section
        data-slot="production-status-strip"
        className="flex items-center gap-2 rounded-control border border-border bg-surface px-3 py-2"
      >
        <ol className="flex flex-wrap items-center gap-1 text-xs">
          {PRODUCTION_STATUS_ORDER.map((s, i) => {
            const currentIdx = PRODUCTION_STATUS_ORDER.indexOf(
              (status ?? "drafting") as ProductionStatus,
            );
            const state =
              i < currentIdx ? "done" : i === currentIdx ? "current" : "todo";
            return (
              <li key={s} className="flex items-center gap-1">
                {i > 0 ? (
                  <span className="text-muted-foreground">→</span>
                ) : null}
                <span
                  data-status-step={s}
                  data-state={state}
                  className={
                    state === "current"
                      ? "rounded-control bg-brand px-2 py-0.5 font-medium text-brand-foreground"
                      : state === "done"
                        ? "px-1 text-foreground"
                        : "px-1 text-muted-foreground"
                  }
                >
                  {PRODUCTION_STATUS_LABEL[s]}
                </span>
              </li>
            );
          })}
        </ol>
        {segmentCount > 0 ? (
          <span className="ml-auto text-xs text-muted-foreground">
            已登记分场 {segmentCount} 段
          </span>
        ) : null}
      </section>

      {/* ① 备料区:口播稿提词 + 录制指引 */}
      <section
        data-slot="production-script"
        className="flex flex-col gap-2 rounded-control border border-border bg-surface p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">① 口播稿(提词用)</h3>
          {voiceoverText ? (
            <button
              type="button"
              data-slot="copy-voiceover"
              onClick={() => void copyVoiceover()}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-control border border-border bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {copyVoiceoverStatus === "copied" ? (
                <Check className="size-3.5 text-success" aria-hidden="true" />
              ) : (
                <Copy className="size-3.5" aria-hidden="true" />
              )}
              {copyVoiceoverStatus === "copied"
                ? "已复制纯口播稿"
                : copyVoiceoverStatus === "error"
                  ? "复制失败，请重试"
                  : "复制纯口播稿"}
            </button>
          ) : null}
        </div>
        {voiceoverText ? (
          <>
            <textarea
              data-slot="voiceover-preview"
              aria-label="纯口播稿（提词器用）"
              readOnly
              value={voiceoverText}
              className="min-h-48 max-h-64 w-full resize-y overflow-y-auto whitespace-pre-wrap rounded-control border-0 bg-muted/40 p-3 text-sm leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
            <p className="text-xs text-muted-foreground">
              录制指引:手机/相机横屏 1080p+,对着上面的稿子念完整条(口误就重来一句,
              后期按 SRT 剪);录完在剪辑软件里粗剪掉口误段,<b>导出粗剪视频 + SRT 字幕</b>
              (剪映:字幕识别后「导出 SRT」)再回来上传。
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            本项目还没有口播稿 —— 先回稿面把脚本写好(制作视频以口播稿为时间与内容真值,
            没有稿无法做 SRT 匹配校验和信息卡可溯提取)。
          </p>
        )}
      </section>

      {/* [T-366a] 制作方式二选一(默认现状流,零破坏;可切换/可退回 VP-03) */}
      <section
        data-slot="production-method"
        className="flex flex-col gap-2 rounded-control border border-border bg-surface p-4"
      >
        <h3 className="text-sm font-medium">制作方式</h3>
        <div className="flex gap-2">
          <button
            type="button"
            data-slot="method-creatoros"
            data-active={method === "creatoros"}
            disabled={finalBusy}
            onClick={() => setMethod("creatoros")}
            className={`inline-flex h-8 items-center rounded-control border px-3 text-sm transition disabled:opacity-50 ${
              method === "creatoros"
                ? "border-brand bg-brand/10 font-medium text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            在应用内制作
          </button>
          <button
            type="button"
            data-slot="method-upload"
            data-active={method === "upload"}
            disabled={finalBusy}
            onClick={() => setMethod("upload")}
            className={`inline-flex h-8 items-center rounded-control border px-3 text-sm transition disabled:opacity-50 ${
              method === "upload"
                ? "border-brand bg-brand/10 font-medium text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            直接上传成品视频
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {method === "creatoros"
            ? "上传粗剪 + SRT，经 AI 分镜统筹和总导演审片，确认后受控渲染成片。"
            : "在剪映等工具剪好的成品直接上传登记为成片 —— 跳过四决策与渲染;盲预测 / 发布物料 / 登记发布照常可用。"}
        </p>
      </section>

      {method === "creatoros" ? (
        <section
          data-slot="production-orientation"
          data-orientation={renderOrientation}
          className="flex flex-col gap-2 rounded-control border border-border bg-surface p-4"
        >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium">本次成片画幅</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              画幅会同时作用于分镜构图、素材安全区、字幕布局、预览和最终导出。
            </p>
          </div>
          <div className="flex gap-2" role="radiogroup" aria-label="本次成片画幅">
            {(
              [
                ["portrait", "竖屏 9:16"],
                ["landscape", "横屏 16:9"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={renderOrientation === value}
                data-slot={`orientation-${value}`}
                data-active={renderOrientation === value}
                disabled={decisionsBusy}
                onClick={() => setRenderOrientation(value)}
                className={`inline-flex h-8 items-center rounded-control border px-3 text-sm transition disabled:opacity-50 ${
                  renderOrientation === value
                    ? "border-brand bg-brand/10 font-medium text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {decisionsConfirmed || finalVideoAssetId ? (
          <p className="text-xs text-muted-foreground">
            切换只影响下一次“重新分镜”或“按当前分镜重新生成”；已保存分镜和旧成片不会被改写。
          </p>
        ) : null}
        </section>
      ) : null}

      {method === "upload" ? (
        /* [T-366a] 上传成品视频路径(复用两阶段上传链;mp4/mov + 时长探针;§5.1③ 禁覆盖) */
        <section
          data-slot="production-final-upload"
          className="flex flex-col gap-2 rounded-control border border-border bg-surface p-4"
        >
          <h3 className="text-sm font-medium">② 上传成品视频</h3>
          <input
            ref={finalInputRef}
            type="file"
            accept=".mp4,.mov,video/mp4,video/quicktime"
            aria-label="上传成品视频"
            className="sr-only"
            disabled={finalBusy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFinalFile(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            data-slot="production-final-picker"
            disabled={
              finalBusy ||
              pubLocked === true ||
              (hasExistingFinal && !replaceOk)
            }
            onClick={() => finalInputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-1 rounded-control border border-dashed px-3 py-5 text-center transition disabled:opacity-50 ${
              finalVideoAssetId
                ? "border-brand/50 bg-brand/5 text-foreground"
                : "border-border bg-surface-subtle/40 text-muted-foreground hover:border-brand/60 hover:text-foreground"
            }`}
          >
            <span className="font-medium">
              {finalBusy
                ? "成品上传登记中…"
                : finalVideoAssetId
                  ? "✓ 已登记成片,点此重新上传"
                  : "点击选择成品视频"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              仅收 mp4 / mov;上传前会探测时长,坏文件诚实拒收
            </span>
          </button>
          {/* 已有成片 → 替换需二次确认(§4.1 不静默丢);已登记发布 → 禁覆盖(§5.1③)。 */}
          {pubLocked === true ? (
            <p
              data-slot="final-pub-locked"
              className="text-xs text-destructive"
            >
              当前成片已登记过发布 —— 不能覆盖已登记的事实。请先在发布面解除登记,
              或新建产出再上传(绝不静默换片)。
            </p>
          ) : hasExistingFinal ? (
            <label
              data-slot="final-replace-confirm"
              className="flex items-center gap-2 text-xs"
            >
              <input
                type="checkbox"
                checked={replaceOk}
                onChange={(e) => setReplaceOk(e.target.checked)}
              />
              已有成片 —— 我确认要替换当前成片(替换后旧成片仍留在素材库)
            </label>
          ) : null}
          {finalError ? (
            <p data-slot="final-error" className="text-xs text-destructive">
              {finalError}
            </p>
          ) : null}
          {finalNotice ? (
            <p data-slot="final-notice" className="text-xs text-foreground">
              {finalNotice}
            </p>
          ) : null}
          {finalVideoAssetId ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-foreground">成片预览</p>
              <FinalVideoPreview
                assetId={finalVideoAssetId}
                orientation={renderOrientation}
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              上传成功即登记为本项目成片(状态机到「成片就绪」);想改用受控成片,
              上方随时切回「在应用内制作」。
            </p>
          )}
        </section>
      ) : null}

      {/* ① 备料区:上传粗剪 + SRT(仅 CreatorOS 制作路径;上传成品路径整段隐藏) */}
      {method === "creatoros" ? (
      <>
      <section
        data-slot="production-uploads"
        className="flex flex-col gap-3 rounded-control border border-border bg-surface p-4"
      >
        <h3 className="text-sm font-medium">② 上传粗剪人物视频 + SRT 字幕</h3>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
          <div className="flex flex-1 flex-col gap-1.5 text-xs">
            <span className="font-medium">粗剪人物视频</span>
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              aria-label="上传粗剪人物视频"
              className="sr-only"
              disabled={uploadBusy !== ""}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onVideoFile(f);
              }}
            />
            <button
              type="button"
              data-slot="production-video-picker"
              disabled={uploadBusy !== ""}
              onClick={() => videoInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-1 rounded-control border border-dashed px-3 py-5 text-center transition disabled:opacity-50 ${
                video
                  ? "border-brand/50 bg-brand/5 text-foreground"
                  : "border-border bg-surface-subtle/40 text-muted-foreground hover:border-brand/60 hover:text-foreground"
              }`}
            >
              <span className="font-medium">
                {video ? "✓ 已上传:" + video.name : "点击选择粗剪视频"}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {video ? "点此重新选择" : "mp4/mov 等,剪辑软件导出的纯人物视频"}
              </span>
            </button>
            {video?.durationSec != null ? (
              <span className="text-muted-foreground">
                视频时长 {Math.round(video.durationSec)}s
              </span>
            ) : video ? (
              <span className="text-muted-foreground">
                读不到视频时长(浏览器不支持该编码的 metadata)—— 时长校验诚实跳过
              </span>
            ) : null}
          </div>
          <div className="flex flex-1 flex-col gap-1.5 text-xs">
            <span className="font-medium">SRT 字幕</span>
            <input
              ref={srtInputRef}
              type="file"
              accept=".srt,application/x-subrip,text/plain"
              aria-label="上传 SRT 字幕"
              className="sr-only"
              disabled={uploadBusy !== ""}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onSrtFile(f);
              }}
            />
            <button
              type="button"
              data-slot="production-srt-picker"
              disabled={uploadBusy !== ""}
              onClick={() => srtInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-1 rounded-control border border-dashed px-3 py-5 text-center transition disabled:opacity-50 ${
                srt
                  ? "border-brand/50 bg-brand/5 text-foreground"
                  : "border-border bg-surface-subtle/40 text-muted-foreground hover:border-brand/60 hover:text-foreground"
              }`}
            >
              <span className="font-medium">
                {srt ? `✓ 已上传:${srt.name}` : "点击选择 SRT 字幕"}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {srt
                  ? `${srt.lines.length} 行 · 点此重新选择`
                  : "剪映等导出的 .srt 字幕文件"}
              </span>
            </button>
          </div>
        </div>
        {uploadBusy ? (
          <p className="text-xs text-muted-foreground">
            {uploadBusy === "video" ? "视频上传中…" : "SRT 上传中…"}
          </p>
        ) : null}
        {uploadError ? (
          <p data-slot="production-upload-error" className="text-xs text-destructive">
            {uploadError}
          </p>
        ) : null}

        {/* SRT 匹配校验(挡在提交前;不匹配给具体原因 + 明确覆盖) */}
        {srt ? (
          <div
            data-slot="srt-check-panel"
            className="flex flex-col gap-1 rounded-control bg-muted/40 p-2 text-xs"
          >
            {durationCheck ? (
              <p data-check="duration" data-ok={durationCheck.ok}>
                {durationCheck.ok
                  ? `✓ 时长匹配:SRT ${fmtDelta(durationCheck.srtDurationSec)} vs 视频 ${fmtDelta(durationCheck.videoDurationSec)}`
                  : `✕ 时长不匹配:SRT 总时长 ${fmtDelta(durationCheck.srtDurationSec)},视频 ${fmtDelta(durationCheck.videoDurationSec)},相差 ${fmtDelta(durationCheck.deltaSec)}(容差 ${fmtDelta(durationCheck.toleranceSec)})—— 可能传错了 SRT 文件`}
              </p>
            ) : (
              <p className="text-muted-foreground">
                时长校验:待视频时长可读后进行
              </p>
            )}
            {scriptCheck ? (
              <p data-check="script" data-ok={scriptCheck.ok}>
                {scriptCheck.ok
                  ? `✓ 内容匹配:与当前口播稿相似度 ${(scriptCheck.similarity * 100).toFixed(0)}%`
                  : `✕ 内容不匹配:SRT 全文与当前口播稿相似度仅 ${(scriptCheck.similarity * 100).toFixed(0)}%(阈值 ${(scriptCheck.threshold * 100).toFixed(0)}%)—— 像是另一条视频的字幕,或口播稿改过了`}
              </p>
            ) : (
              <p className="text-muted-foreground">
                内容校验:需要口播稿(先回稿面完成脚本)
              </p>
            )}
            {checksBlocked ? (
              <label
                data-slot="srt-check-override"
                className="mt-1 flex items-center gap-2"
              >
                <input
                  type="checkbox"
                  checked={override}
                  onChange={(e) => setOverride(e.target.checked)}
                />
                我确认没传错,继续(覆盖校验)
              </label>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* [T-294] ③ B-roll 素材:决策前备好,AI 分场决策据此匹配空镜/截图 */}
      <section
        data-slot="production-broll"
        data-drag-active={brollDragActive}
        onDragEnter={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setBrollDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (event.currentTarget === event.target) setBrollDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setBrollDragActive(false);
          void onBrollFiles(Array.from(event.dataTransfer.files));
        }}
        className="flex flex-col gap-2 rounded-control border border-border bg-surface p-4"
      >
        <h3 className="text-sm font-medium">③ B-roll 素材(截图 / 录屏,可选)</h3>
        <p className="text-xs text-muted-foreground">
          备好要插进成片的截图 / 录屏,AI 分场决策会从这里为对应画面挑 B-roll。
          <b className="text-foreground">先备素材,再点下方「AI 分场决策」,新素材才会被用上。</b>
        </p>
        <p className="rounded-control border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          可直接把图片或录屏拖到这里上传；松手后仍停留在当前页面。
        </p>
        <label
          data-slot="broll-picker"
          className="inline-flex h-8 w-fit cursor-pointer items-center rounded-control border border-border px-3 text-sm hover:bg-muted/50"
        >
          {brollBusy ? "上传中…" : "+ 上传素材"}
          <input
            type="file"
            accept="video/*,image/*"
            multiple
            className="hidden"
            disabled={brollBusy}
            onChange={(e) => {
              void onBrollFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {brollItems.length > 0 ? (
          <ul
            data-slot="broll-list"
            className="grid grid-cols-3 gap-2 sm:grid-cols-4"
          >
            {brollItems.map((it) => (
              <li key={it.linkId} className="relative flex flex-col gap-1">
                <BrollThumb assetId={it.assetId} kind={it.kind} name={it.name} />
                <button
                  type="button"
                  aria-label={`移除 ${it.name}`}
                  data-slot="broll-remove"
                  disabled={brollBusy}
                  onClick={() => void onRemoveBroll(it.linkId)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs leading-tight text-white hover:bg-black/80 disabled:opacity-50"
                >
                  ×
                </button>
                <span className="truncate text-[11px] text-muted-foreground">
                  {it.name}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            还没有手动上传的 B-roll 素材;不传也能出片(成片只有口播 + 信息卡)。
          </p>
        )}
        {/* [T-387c] 自动列入的候选(脚本画面点名/论点树挂载/项目弹药):带来源徽标,
            人可剔(剔除只影响本次决策,不删素材/不动用料链)。 */}
        {autoBroll.length > 0 ? (
          <div data-slot="broll-auto" className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">
              以下素材已自动列入 B-roll 候选(来自脚本画面点名 / 论点树挂载 /
              项目弹药),不想用的点「剔除」:
            </p>
            <ul
              data-slot="broll-auto-list"
              className="flex flex-col gap-1"
            >
              {autoBroll.map((it) => {
                const excluded = excludedAuto.has(it.assetId);
                return (
                  <li
                    key={it.assetId}
                    data-slot="broll-auto-item"
                    data-source={it.source}
                    data-excluded={excluded}
                    className={
                      "flex items-center gap-2 rounded-control border border-border px-2 py-1 text-xs " +
                      (excluded ? "opacity-50" : "")
                    }
                  >
                    <span
                      data-slot="broll-source-badge"
                      className="shrink-0 rounded-full bg-surface-subtle px-1.5 py-px text-[10px] text-muted-foreground"
                    >
                      {BROLL_SOURCE_LABEL[it.source]}
                    </span>
                    <span className={"min-w-0 truncate" + (excluded ? " line-through" : "")}>
                      {it.name}
                    </span>
                    <span className="shrink-0 text-[10px] text-text-subtle">
                      {it.kind}
                    </span>
                    <button
                      type="button"
                      data-slot="broll-auto-toggle"
                      onClick={() =>
                        setExcludedAuto((prev) => {
                          const next = new Set(prev);
                          if (next.has(it.assetId)) next.delete(it.assetId);
                          else next.add(it.assetId);
                          return next;
                        })
                      }
                      className="ml-auto shrink-0 rounded-control border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/50"
                    >
                      {excluded ? "恢复" : "剔除"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {brollRevisionNotice ? (
          <p
            data-slot="broll-revision-notice"
            className="text-xs text-amber-600 dark:text-amber-400"
          >
            {brollRevisionNotice}
          </p>
        ) : null}
      </section>

      {/* ④ AI 分场决策 */}
      <section
        data-slot="production-decisions"
        className="flex flex-col gap-2 rounded-control border border-border bg-surface p-4"
      >
        <h3 className="text-sm font-medium">④ AI 分场决策</h3>
        {decisionsError ? (
          <div
            data-slot="decisions-error"
            className="rounded-control border border-amber-500/30 bg-amber-500/5 px-3 py-2"
          >
            <p className="text-xs text-foreground">{decisionsError}</p>
            {decisionsErrorDetail ? (
              <div className="mt-2 rounded-control border border-border/70 bg-background/70 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    原始错误（已脱敏）
                  </p>
                  <button
                    type="button"
                    data-slot="copy-decision-error"
                    onClick={() => void copyDecisionError()}
                    className="shrink-0 text-[11px] text-brand hover:underline"
                  >
                    {copyDecisionErrorStatus === "copied"
                      ? "已复制"
                      : copyDecisionErrorStatus === "error"
                        ? "复制失败"
                        : "复制错误"}
                  </button>
                </div>
                <code
                  data-slot="decision-error-detail"
                  className="mt-1 block whitespace-pre-wrap break-all text-[11px] leading-relaxed text-foreground"
                >
                  {decisionsErrorDetail}
                </code>
              </div>
            ) : null}
            {decisionsRetryOfTaskId ? (
              <p className="mt-1 text-xs text-muted-foreground">
                如已有完成步骤，系统会保留；如果素材、字幕或画幅有变化，则自动重新计算。
              </p>
            ) : null}
          </div>
        ) : null}
        {!decisionsTaskId && !decisions ? (
          <>
            <button
              type="button"
              data-slot="dispatch-decisions"
              disabled={!canDispatchDecisions}
              onClick={() => void dispatchDecisions()}
              className="inline-flex h-8 w-fit items-center rounded-control bg-brand px-3 text-sm font-medium text-brand-foreground disabled:opacity-50"
            >
              {decisionsBusy
                ? decisionsRetryOfTaskId
                  ? "正在继续…"
                  : "创建任务中…"
                : decisionsRetryOfTaskId
                  ? "继续上次分场"
                  : "AI 分场决策"}
            </button>
            {!materialsReady ? (
              <p className="text-xs text-muted-foreground">
                备料齐(口播稿 + 粗剪视频 + SRT)后可发起 —— AI 产出分场/信息卡/
                B-roll/双语字幕，再经总导演统筹审核，过目确认后才渲染。
              </p>
            ) : checksBlocked && !override ? (
              <p className="text-xs text-destructive">
                SRT 校验未通过(见上方具体原因)。确认没传错可勾选覆盖后继续。
              </p>
            ) : null}
          </>
        ) : null}
        {decisionsTaskId && !decisions ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            分镜统筹中(分场/信息卡/素材/字幕/总导演审片)…任务后台跑,可离开本页
          </div>
        ) : null}
        {decisions ? (
          <>
            {decisionsConfirmed ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <p data-slot="confirmed-decisions-notice" className="text-xs text-success">
                    ✓ 分镜方案已保存，可随时回顾；生成新版本不会删除旧成片。
                  </p>
                  {renderInProgress ? (
                    <p
                      data-slot="confirmed-render-progress"
                      className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    >
                      <span className="size-3 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                      {renderProgressLabel}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-slot="restart-storyboard"
                    disabled={!canDispatchDecisions}
                    onClick={regenerateStoryboard}
                    className="inline-flex h-8 items-center rounded-control border border-border px-3 text-xs font-medium hover:bg-muted/50 disabled:opacity-50"
                  >
                    {decisionsBusy ? "创建新分镜中…" : "重新分镜"}
                  </button>
                  <button
                    type="button"
                    data-slot="rerender-current-storyboard"
                    disabled={!video || decisionsBusy || renderDispatchBusy}
                    onClick={regenerateCurrentStoryboard}
                    className="inline-flex h-8 items-center rounded-control bg-brand px-3 text-xs font-medium text-brand-foreground disabled:opacity-50"
                  >
                    按当前分镜重新生成
                  </button>
                </div>
              </div>
            ) : null}
            {recoveredDecisions && !video ? (
              <p className="text-xs text-muted-foreground">
                已恢复上次的决策候选;刷新后视频引用丢失,请重新上传粗剪视频后再确认渲染。
              </p>
            ) : null}
            <VideoDecisionPreview
              decisions={decisions}
              inventory={selectableInventory}
              unavailableAssetLabels={unavailableAssetLabels}
              title={projectTitle}
              talkingHeadAssetId={video?.assetId ?? null}
              talkingHeadDurationSec={video?.durationSec ?? undefined}
              orientation={renderOrientation}
              readOnly={decisionsConfirmed && !hasUnavailableBroll}
              confirming={renderDispatchBusy}
              adjustingMaterials={decisionsBusy}
              onConfirm={(payload) => void onConfirmDecisions(payload)}
              onRestoryboard={restoryboardWithManualAssignments}
              onDiscard={onDiscardDecisions}
            />
            {recoveredDecisions && brollInventoryStatus === "error" ? (
              <p className="text-xs text-destructive">
                当前项目素材清单读取失败，暂时保留上次方案且不允许静默改绑；请重试刷新素材清单。
              </p>
            ) : null}
          </>
        ) : null}
        {flowError ? (
          <p data-slot="flow-error" className="text-xs text-destructive">
            {flowError}
          </p>
        ) : null}
      </section>

      {/* ④ 渲染跟踪(执行确认卡 + 环境引导) */}
      {renderDispatchBusy || renderTaskId ? (
        <section
          data-slot="production-render"
          className="flex flex-col gap-2 rounded-control border border-border bg-surface p-4"
        >
          <h3 className="text-sm font-medium">⑤ 渲染成片</h3>
          {renderEnvHint ? (
            <p
              data-slot="render-env-hint"
              className="rounded-control bg-muted/40 p-2 text-xs leading-relaxed"
            >
              {renderEnvHint}
            </p>
          ) : null}
          {renderTaskId ? (
            <ExecutionTaskCard
              taskId={renderTaskId}
              projectId={projectId}
              onTaskIdChange={(nextTaskId) => {
                setRenderEnvHint(null);
                setRenderFinalizeError(null);
                setRenderTaskId(nextTaskId);
                setRenderTaskStatus("queued");
              }}
              onTaskUpdate={(task) => {
                setRenderTaskStatus(task.status as RenderFlowStatus);
                if (
                  task.status === "succeeded" &&
                  task.adoptedAssetIds.length > 0
                ) {
                  // 采纳动作已拿到真实 assetId，立即唤醒外层收口 usage/export/预览；
                  // 不等 4 秒轮询，也不要求用户再点一次“重试渲染”。
                  setRenderFinalizeRetry((value) => value + 1);
                }
              }}
            />
          ) : (
            <div
              data-slot="render-launch-loading"
              className="flex items-center gap-2 rounded-control border border-border bg-muted/30 p-3 text-sm text-muted-foreground"
            >
              <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              {renderProgressLabel}
            </div>
          )}
          {renderFinalizeError ? (
            <div
              data-slot="render-finalize-error"
              className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-destructive/30 bg-destructive/5 p-2"
            >
              <p className="text-xs leading-relaxed text-destructive">
                {renderFinalizeError}
              </p>
              <button
                type="button"
                data-slot="render-finalize-retry"
                onClick={() => setRenderFinalizeRetry((value) => value + 1)}
                className="inline-flex h-7 items-center rounded-control border border-destructive/30 px-3 text-[11px] font-medium text-destructive hover:bg-destructive/10"
              >
                重试关联项目
              </button>
            </div>
          ) : null}
          {/* [T-292] 采纳后的成片在产出区内联预览(签名 URL,画幅决定播放器比例)。 */}
          {finalVideoAssetId ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-foreground">成片预览</p>
              <FinalVideoPreview
                assetId={finalVideoAssetId}
                orientation={renderOrientation}
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              渲染完成后可先在上方卡片预览；确认满意再「采纳为项目成片」。未采纳的新版本
              不会替换当前成片，丢弃/重试都在卡内。
            </p>
          )}
        </section>
      ) : null}
      </>
      ) : null}

      {/* [T-366b] 导出素材包(辅助入口,不占主流程;两种制作方式下都可用) */}
      <section
        data-slot="production-material-export"
        className="flex flex-col gap-2 rounded-control border border-border bg-surface p-4"
      >
        <h3 className="text-sm font-medium">导出素材包(zip)</h3>
        <p className="text-xs text-muted-foreground">
          把本项目关联的<b className="text-foreground">全部素材 + 口播稿 + 编导说明</b>
          打包成一个 zip,供你手动在剪映等工具重建成片 ——
          <b className="text-foreground">不是可一键导入的剪映工程</b>
          (剪映没有通用工程导入格式);本地打包,不出网。
        </p>
        {estBytes != null ? (
          <p data-slot="export-estimate" className="text-xs text-muted-foreground">
            预计大小约 {(estBytes / (1024 * 1024)).toFixed(1)} MB(素材求和;
            B-roll 多时可能较大,打包需要一会儿)
          </p>
        ) : null}
        <button
          type="button"
          data-slot="export-materials"
          disabled={exportBusy}
          onClick={() => void onExportMaterials()}
          className="inline-flex h-8 w-fit items-center rounded-control border border-border px-3 text-sm hover:bg-muted/50 disabled:opacity-50"
        >
          {exportBusy ? "打包中…(素材多时可能需要一会儿)" : "导出素材包"}
        </button>
        {exportError ? (
          <p data-slot="export-error" className="text-xs text-destructive">
            {exportError}
          </p>
        ) : null}
        {exportDone ? (
          <p data-slot="export-done" className="text-xs text-foreground">
            已导出「{exportDone.fileName}」({exportDone.fileCount} 个文件),
            浏览器已开始下载。
            {!exportDone.hasDecisions
              ? " 注意:本项目未跑四决策,包内编导说明为素材清单(诚实空态)。"
              : ""}
          </p>
        ) : null}
      </section>
    </div>
  );
}

/**
 * [T-294] B-roll 素材缩略:assetId → 签名 URL → 视频/图片缩略;取不到 URL 显类型占位。
 */
function BrollThumb({
  assetId,
  kind,
  name,
}: {
  assetId: string;
  kind: string;
  name: string;
}) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    void resolveAssetPreviewUrl(assetId).then((u) => {
      if (!cancelled) setUrl(u ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [assetId]);
  const cls =
    "aspect-video w-full rounded-control border border-border bg-black object-cover";
  if (!url) {
    return (
      <div
        className={`${cls} flex items-center justify-center text-[10px] text-muted-foreground`}
      >
        {kind}
      </div>
    );
  }
  if (kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={name} className={cls} />
    );
  }
  return (
    <video src={url} muted preload="metadata" className={cls} />
  );
}

/**
 * [T-292] 成片预览:采纳后的 final.mp4 assetId → 签名 URL → 内联 <video>。
 * 画幅决定播放器比例(竖版 9:16 居中限高 / 横版 16:9);取不到 URL 诚实不渲染。
 */
function FinalVideoPreview({
  assetId,
  orientation,
}: {
  assetId: string;
  orientation?: "portrait" | "landscape";
}) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 换素材时重置,避免旧片闪
    setUrl(null);
    void resolveAssetPreviewUrl(assetId).then((u) => {
      if (!cancelled) setUrl(u ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [assetId]);
  if (!url) return null;
  const shape =
    orientation === "portrait"
      ? "mx-auto aspect-[9/16] max-h-[70vh]"
      : "aspect-video";
  return (
    <video
      src={url}
      controls
      preload="metadata"
      data-slot="production-final-video"
      className={`w-full rounded-control border border-border bg-black object-contain ${shape}`}
    />
  );
}
