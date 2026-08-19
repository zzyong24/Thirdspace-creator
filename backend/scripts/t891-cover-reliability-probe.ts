import { createHash, randomUUID } from "node:crypto";
import process from "node:process";

import {
  createOpenaiImagesAdapter,
  generateImage,
  type MultimodalSpec,
} from "@creatoros/ai-worker";
import {
  composeCoverImagePrompt,
  COVER_IMAGE_PROMPT_MAX,
  type ClampedCoverPlan,
} from "../src/modules/ai-runtime/cover-runner";
import { retryExplicitRejectedSubmit } from "../src/modules/ai-runtime/multimodal/retry-submit";

const token = process.env.OMNIHI_TEST_API_KEY?.trim();
const dryRun = process.env.T859_DRY_RUN === "1";
const baseUrl =
  process.env.T859_IMAGE_BASE_URL?.trim() || "https://api.omnihi.ai/openai";
const model =
  process.env.T859_IMAGE_MODEL?.trim() ||
  "openai/gpt-image-2-text-to-image";
const coverRuns = Math.max(
  1,
  Math.min(10, Number(process.env.T859_COVER_RUNS ?? 3) || 3),
);
const runId = process.env.T859_PROBE_RUN_ID?.trim() || randomUUID();
const requestTimeoutMs = Math.max(
  60_000,
  Math.min(
    900_000,
    Number(process.env.T859_REQUEST_TIMEOUT_MS ?? 300_000) || 300_000,
  ),
);

if (!token && !dryRun) throw new Error("OMNIHI_TEST_API_KEY_MISSING");

interface SafeProbeError {
  name: string;
  status?: number;
  reason?: string;
  stage?: string;
  retryable?: boolean;
  message: string;
}

interface ProbeResult {
  label: string;
  ok: boolean;
  promptChars: number;
  durationMs: number;
  submitCount: number;
  submitStatuses: number[];
  outputBytes?: number;
  error?: SafeProbeError;
}

function emit(value: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function redact(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-<redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer <redacted>")
    .replace(/https?:\/\/[^\s)]+/gi, "<url>")
    .slice(0, 600);
}

function safeError(error: unknown): SafeProbeError {
  const row =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  return {
    name: error instanceof Error ? error.name : "Error",
    ...(typeof row.status === "number" ? { status: row.status } : {}),
    ...(typeof row.reason === "string" ? { reason: row.reason } : {}),
    ...(typeof row.stage === "string" ? { stage: row.stage } : {}),
    ...(typeof row.retryable === "boolean" ? { retryable: row.retryable } : {}),
    message: redact(error instanceof Error ? error.message : String(error)),
  };
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function creatorOsCoverPrompt(): string {
  const plan: ClampedCoverPlan = {
    headline: "做了九个月才敢说",
    subheadline: "真正难的不是模型",
    keyPoints: ["真实交付", "用户留存", "持续迭代"],
    visualConcept:
      "不露脸创作者在真实工作桌前整理分镜卡片，左侧混乱草稿与右侧清晰成片形成一个直观变化；手部动作是画面焦点。",
    composition:
      "竖版近景，人物背影位于左下，桌面工作过程占中心，标题区留在上方且不遮挡手部。",
    palette: "暖橙主光配深蓝环境光，真实、克制、有质感。",
  };
  return composeCoverImagePrompt(plan, {
    orientation: "竖屏",
    userVisualRequirements:
      "不露脸，保留真实工作现场和操作动作，不使用画中画，不做万能 AI 科技海报。",
  });
}

const normalImagePrompt =
  "竖版真实摄影：一双手在木质工作桌上整理三张分镜卡片，暖色窗光，画面干净自然，不露脸，不出现文字、logo 或水印。";
const coverPrompt = creatorOsCoverPrompt();
if (coverPrompt.length > COVER_IMAGE_PROMPT_MAX) {
  throw new Error(`CREATOROS_COVER_PROMPT_OVER_LIMIT:${coverPrompt.length}`);
}

const spec: MultimodalSpec = {
  provider: "openai-compatible",
  baseUrl,
  model,
  token: token ?? "",
  kind: "image",
  displayModelKey: "channel-managed",
};

let submitCount = 0;
let submitStatuses: number[] = [];
const timedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const isSubmit =
    init?.method === "POST" && String(input).includes("/images/generations");
  if (isSubmit) submitCount += 1;
  const signal = init?.signal ?? AbortSignal.timeout(requestTimeoutMs);
  const response = await fetch(input, { ...init, signal });
  if (isSubmit) submitStatuses.push(response.status);
  return response;
}) as typeof fetch;
const registry = {
  "openai-compatible": createOpenaiImagesAdapter({ fetch: timedFetch }),
};

async function runProbe(label: string, prompt: string): Promise<ProbeResult> {
  if (dryRun) {
    const result: ProbeResult = {
      label,
      ok: true,
      promptChars: prompt.length,
      durationMs: 0,
      submitCount: 0,
      submitStatuses: [],
    };
    emit({ probe: result, promptSha256: fingerprint(prompt), dryRun: true });
    return result;
  }

  submitCount = 0;
  submitStatuses = [];
  const startedAt = Date.now();
  const idempotencyKey = `t891-${fingerprint(`${runId}:${label}`)}`;
  try {
    const output = await retryExplicitRejectedSubmit({
      operation: () =>
        generateImage(
          spec,
          {
            prompt,
            aspectRatio: "9:16",
            idempotencyKey,
          },
          registry,
        ),
    });
    const result: ProbeResult = {
      label,
      ok: true,
      promptChars: prompt.length,
      durationMs: Date.now() - startedAt,
      submitCount,
      submitStatuses: [...submitStatuses],
      outputBytes: output.assetBytes.length,
    };
    emit({ probe: result, promptSha256: fingerprint(prompt) });
    return result;
  } catch (error) {
    const result: ProbeResult = {
      label,
      ok: false,
      promptChars: prompt.length,
      durationMs: Date.now() - startedAt,
      submitCount,
      submitStatuses: [...submitStatuses],
      error: safeError(error),
    };
    emit({ probe: result, promptSha256: fingerprint(prompt) });
    return result;
  }
}

emit({
  event: "probe-start",
  model,
  baseUrlHost: new URL(baseUrl).host,
  coverRuns,
  coverPromptChars: coverPrompt.length,
  coverPromptLimit: COVER_IMAGE_PROMPT_MAX,
  requestTimeoutMs,
  dryRun,
  policy:
    "one baseline plus repeated real cover generations; unique intent key per run, same key only for explicit rejected-submit retry; no asset persistence",
});

const results: ProbeResult[] = [];
results.push(await runProbe("normal-image-baseline", normalImagePrompt));
for (let index = 1; index <= coverRuns; index += 1) {
  results.push(await runProbe(`creatoros-cover-${index}`, coverPrompt));
}

const coverResults = results.filter((result) => result.label.startsWith("creatoros-cover-"));
const coverSuccesses = coverResults.filter((result) => result.ok).length;
const allPassed = results.every((result) => result.ok);
emit({
  event: "probe-complete",
  ok: allPassed,
  baselineOk: results[0]?.ok ?? false,
  coverSuccesses,
  coverRuns: coverResults.length,
  coverSuccessRate: coverResults.length > 0 ? coverSuccesses / coverResults.length : 0,
  totalSubmitCount: results.reduce((sum, result) => sum + result.submitCount, 0),
});

if (!allPassed) process.exitCode = 2;
