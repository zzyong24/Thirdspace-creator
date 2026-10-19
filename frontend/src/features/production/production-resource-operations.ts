import {createCreationWorkspace,readCreationScope,type CreationOperation} from "@/lib/creation-workspace-scope";
import { executionTimeoutMs } from "@creatoros/contract/timeout-policy";
import {client} from "@/lib/contract-client";
const POLL_MS = 4000;
// [FE-H01] 后台长任务轮询退避上限:决策/渲染都是分钟级(MiniMax 下更久),不能设「最多轮
// N 次就静默放弃」——那样「后台运行,可离开」承诺不成立(进度会丢)。改为持续轮询,前若干次
// 密集(4s),之后指数退避拉长到 30s 封顶,绝不放弃(只在终态或组件卸载时停)。
const POLL_MAX_MS = 30_000;

/** 决策轮询退避间隔:前 15 次 4s,之后每 15 次翻倍,封顶 30s。持续轮询、绝不静默退出。 */
export function pollDelay(attempt: number): number {
  const backed = POLL_MS * 2 ** Math.floor(attempt / 15);
  return Math.min(backed, POLL_MAX_MS);
}

/**
 * 局部选材动作的稳定 attemptId：同一项目、同一稳定分镜、同一选择只能创建一条任务。
 * SEMANTIC_BOUNDARY_ALLOW: 该哈希只做请求幂等，不参与任何素材/场景创作判断。
 */
export function materialAdjustmentAttemptId(input: unknown): string {
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

export interface WireAsset {
  id: string;
}

export interface WireAITask {
  errorCode?:string|null;
  errorMessage?:string|null;
  executionTaskId?:string|null;
  runtimeStatus?:string|null;
  id: string;
  status: string;
  retryOfTaskId?: string | null;
  requestedAt?: string;
}

export interface DecisionFailureDisplay {
  summary: string;
  detail: string | null;
}

/** SEMANTIC_BOUNDARY_ALLOW: 只投影已回读任务的错误，复用正式诊断producer的纯脱敏规则；无创作判断。
 * 规则来自 ai-worker/src/runtime/error-diagnostics.ts safeErrorMessage，局部复用避免引入Worker/SDK初始化。
 * 空字段保持空，不把producer日志兜底unknown error当作用户错误详情。
 */
function redactedDecisionDiagnostic(raw: string): string {
  // SEMANTIC_BOUNDARY_ALLOW: Cookie头和绝对文件路径只作安全移除，不推断内容或创作含义。
  const singleLine = raw
    .replace(/(["'])((?:set-)?cookie)\1\s*:\s*(["'])(?:\\.|(?!\3)[^\r\n\\])*\3/gi, "$1$2$1: $3[REDACTED]$3")
    .replace(/\b((?:set-)?cookie)\s*[:=][^\r\n]*/gi, "$1: [REDACTED]")
    .replace(/\s+/g, " ").trim();
  const redacted = singleLine
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/g, "[REDACTED]")
    .replace(/https?:\/\/[^\s,;)"']+/gi, "[REDACTED_URL]")
    .replace(/file:\/\/\/[^\s,;)"']+/gi, "[REDACTED_PATH]")
    .replace(/(["'])(?:[a-z]:[\\/]|\\\\|\/(?!\/))[^"'\r\n]*\1/gi, "$1[REDACTED_PATH]$1")
    .replace(/(^|[\s(=:"'])(?:[a-z]:[\\/]|\\\\|\/(?!\/))[^\s,;)"']+/gi, "$1[REDACTED_PATH]")
    .replace(
      /((?:api[-_ ]?key|token|secret|password)\s*[:=]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /((?:model(?:name|id)?|provider|base[-_ ]?url)\s*[:=]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    );
  if (!redacted) return "";
  return redacted.length <= 500
    ? redacted
    : `${redacted.slice(0, 500)}…`;
}
export function decisionRuntimeFailureDisplay(task: Pick<WireAITask, "errorCode" | "errorMessage">): DecisionFailureDisplay {
  const code = typeof task.errorCode === "string" ? redactedDecisionDiagnostic(task.errorCode) : "";
  const message = typeof task.errorMessage === "string" ? redactedDecisionDiagnostic(task.errorMessage) : "";
  const detail = [code ? `错误代码：${code}` : "", message].filter(Boolean).join("\n") || null;
  return {summary: detail ? "原分场任务失败，请查看原任务错误并重试。" : "原任务未提供错误详情。", detail};
}

export function decisionFailureDisplay(raw: string): DecisionFailureDisplay {
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

export interface WireTaskResult {
  resultType: string;
  resultData: Record<string, unknown>;
}

export interface WireProduction {
  id: string;
  status: string;
  recordingConfig?: Record<string, unknown>;
}

export interface WireExecTask {
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

export type RenderFlowStatus =
  | "saving_plan"
  | "creating_task"
  | "queued"
  | "running"
  | "awaiting_confirmation"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface WireMaterialLink {
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

export async function readVideoDurationViaElement(file: File): Promise<number | null> {
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
      const timer = setTimeout(() => done(null), executionTimeoutMs(10_000));
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
export async function readFileText(file: File): Promise<string> {
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

export async function writeClipboardText(text: string): Promise<void> {
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

export async function uploadProductionAsset(
  projectId: string,
  file: File,
  assetType: "video" | "subtitle" | "image",
  // [T-294] 用料链 role 可覆盖:B-roll 素材传 "broll"(缺省按类型:video=clip / 其它=reference)。
  role?:string,captured?:CreationOperation,
): Promise<string> {
  const workspace=captured?null:createCreationWorkspace(readCreationScope());workspace?.activate();const operation=captured??workspace!.capture(),client=operation.client;
  try{operation.assertCurrent();
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
      body:file,signal:operation.signal,
    });
    operation.assertCurrent();if (!put.ok) throw new Error(`上传失败(PUT ${put.status})`);
  }
  const asset = (await client.completeUpload({
    params: { uploadId: upload.uploadId },
    query: undefined,
    body: { name: file.name },
  })) as unknown as WireAsset;
  operation.assertCurrent();if (!asset?.id) throw new Error("上传完成但没有返回 asset id");
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
  operation.assertCurrent();return asset.id;
  }finally{workspace?.dispose();}
}

// ── 组件 ──────────────────────────────────────────────────────────────────────

