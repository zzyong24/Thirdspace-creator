/**
 * T-712 真实视频回归环：复制后的临时 DB → 当前 CreatorOS 模型分镜 →
 * 确定性构图审计 → 正式执行器渲染 → 抽帧联系表。
 *
 * 这不是 fixture 单测，也绝不允许指向用户正在使用的数据库/工作区。
 * 创作语义仍由 CreatorOS 当前配置模型完成；代码只拦截已确认的物理边界。
 */

import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const MAC_APP_DATA_DIR = path.join(
  homedir(),
  "Library",
  "Application Support",
  "cloud.aitongban.creatoros",
);

function creatorOSIsRunning(): boolean {
  try {
    execFileSync("/usr/bin/pgrep", ["-x", "CreatorOS"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function machineSeed(): string {
  const output = execFileSync(
    "/usr/sbin/ioreg",
    ["-rd1", "-c", "IOPlatformExpertDevice"],
    { encoding: "utf8" },
  );
  const match = output.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
  if (!match?.[1]) {
    throw new Error("无法读取本机安全种子，不能解密临时数据库中的模型配置");
  }
  return match[1];
}

/**
 * 默认把当前 CreatorOS 数据库复制进 /tmp 后再跑；绝不连接真实数据库。
 *
 * SEMANTIC_BOUNDARY_ALLOW: 这里只复制测试数据、设置运行目录并校验进程状态，
 * 不参与素材语义匹配、分镜或任何创作选择。
 */
function bootstrapSafeRegressionEnvironment(): void {
  const hasExplicitDb = Boolean(process.env.CREATOROS_DB_DIR);
  const hasExplicitWorkspace = Boolean(process.env.CREATOROS_WORKSPACES_ROOT);
  if (hasExplicitDb !== hasExplicitWorkspace) {
    throw new Error(
      "安全拒绝：CREATOROS_DB_DIR 与 CREATOROS_WORKSPACES_ROOT 必须同时提供或同时省略",
    );
  }

  if (!hasExplicitDb) {
    if (process.platform !== "darwin") {
      throw new Error("自动复制真实测试数据目前仅支持 macOS；其他平台请显式传临时目录");
    }
    if (creatorOSIsRunning()) {
      throw new Error("安全拒绝：请先退出 CreatorOS，再运行真实视频回归");
    }
    const sourceDb = path.join(MAC_APP_DATA_DIR, "db");
    if (!existsSync(sourceDb)) {
      throw new Error(`找不到 CreatorOS 数据库：${sourceDb}`);
    }

    const regressionRoot = mkdtempSync(
      path.join(tmpdir(), "creatoros-t712-regression."),
    );
    const dbCopy = path.join(regressionRoot, "db");
    cpSync(sourceDb, dbCopy, { recursive: true });
    const workspaces = mkdtempSync(
      path.join(tmpdir(), "creatoros-t712-workspaces."),
    );
    process.env.CREATOROS_DB_DIR = dbCopy;
    process.env.CREATOROS_WORKSPACES_ROOT = workspaces;
  }

  process.env.CREATOROS_DISABLE_BACKGROUND_DRIVERS = "1";
  if (!process.env.CREATOROS_MASTER_KEY_FILE) {
    const masterKeyFile = path.join(MAC_APP_DATA_DIR, ".master-key");
    if (!existsSync(masterKeyFile)) {
      throw new Error("找不到 CreatorOS 主密钥文件，无法读取当前已配置模型");
    }
    process.env.CREATOROS_MASTER_KEY_FILE = masterKeyFile;
  }
  if (!process.env.CREATOROS_MACHINE_SEED) {
    process.env.CREATOROS_MACHINE_SEED = machineSeed();
  }
}

bootstrapSafeRegressionEnvironment();

const dbDir = process.env.CREATOROS_DB_DIR ?? "";
const workspaceRoot = process.env.CREATOROS_WORKSPACES_ROOT ?? "";
if (!dbDir.includes("creatoros-t712-regression")) {
  throw new Error("安全拒绝：CREATOROS_DB_DIR 必须是 creatoros-t712-regression 临时副本");
}
if (!workspaceRoot.includes("creatoros-t712-workspaces")) {
  throw new Error("安全拒绝：CREATOROS_WORKSPACES_ROOT 必须是 creatoros-t712-workspaces 临时目录");
}
if (process.env.CREATOROS_DISABLE_BACKGROUND_DRIVERS !== "1") {
  throw new Error("安全拒绝：真实回归必须关闭后台自动化驱动");
}

const ACCOUNT_ID = process.env.T712_ACCOUNT_ID ?? "acct-ae1a8346-9";
const PROJECT_ID = process.env.T712_PROJECT_ID ?? "project-aa313dd8-218";
const ROUNDS = Math.max(1, Math.min(5, Number(process.env.T712_ROUNDS ?? "1")));
const OUTPUT_ROOT = process.env.T712_OUTPUT_ROOT ?? "/tmp/creatoros-t712-real-loop";
type Orientation = "landscape" | "portrait";
const ORIENTATIONS = (process.env.T712_ORIENTATIONS ?? "landscape,portrait")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value): Orientation => {
    if (value !== "landscape" && value !== "portrait") {
      throw new Error(`不支持的回归画幅：${value}`);
    }
    return value;
  });
if (ORIENTATIONS.length === 0) {
  throw new Error("至少需要一个回归画幅");
}
const EXPECTED_SCREEN_RECORDINGS = [
  "asset-7b35657d-1642",
  "asset-7b35657d-1660",
  "asset-7b35657d-1676",
  "asset-7b35657d-1692",
] as const;
const FORBIDDEN_ASSETS = ["asset-aa313dd8-697"] as const;
const TERMINAL_OK = new Set(["awaiting_confirmation", "succeeded"]);
const TERMINAL_BAD = new Set(["failed", "cancelled"]);

type Json = Record<string, unknown>;

function dataOf<T>(response: unknown): T {
  if (response && typeof response === "object" && "data" in response) {
    return (response as { data: T }).data;
  }
  return response as T;
}

function listOf<T>(response: unknown): T[] {
  const data = dataOf<unknown>(response);
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && "rows" in data) {
    const rows = (data as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }
  return [];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonFile(file: string, value: unknown): void {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function requestedAt(value: Json): number {
  const raw = value.requestedAt;
  return typeof raw === "string" ? Date.parse(raw) || 0 : 0;
}

function newest<T extends Json>(rows: T[]): T | undefined {
  return rows.slice().sort((a, b) => requestedAt(b) - requestedAt(a))[0];
}

function resolveRenderedFile(task: Json): string {
  const direct = path.join(workspaceRoot, String(task.id), "out", "final.mp4");
  try {
    readFileSync(direct);
    return direct;
  } catch {
    const manifest = task.manifest as { artifacts?: Array<{ path?: string; fileName?: string }> } | null;
    const artifact = manifest?.artifacts?.find(
      (item) => item.fileName === "final.mp4" || item.path?.endsWith("/final.mp4"),
    );
    if (!artifact?.path) throw new Error(`渲染完成但找不到 final.mp4：${String(task.id)}`);
    return path.isAbsolute(artifact.path)
      ? artifact.path
      : path.join(workspaceRoot, String(task.id), artifact.path);
  }
}

function createContactSheet(
  video: string,
  output: string,
  orientation: Orientation,
): void {
  const scale = orientation === "portrait" ? "scale=270:-2" : "scale=480:-2";
  execFileSync(
    "/opt/homebrew/bin/ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      video,
      "-vf",
      `fps=1/10,${scale},tile=4x3:padding=8:margin=8:color=111111`,
      "-frames:v",
      "1",
      output,
    ],
    { stdio: "inherit" },
  );
}

function expectedDelivery(orientation: Orientation): {
  width: number;
  height: number;
} {
  return orientation === "portrait"
    ? { width: 1080, height: 1920 }
    : { width: 1920, height: 1080 };
}

function inspectEncodedVideo(
  video: string,
  orientation: Orientation,
): Record<string, unknown> {
  const raw = execFileSync(
    "/opt/homebrew/bin/ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration,size",
      "-show_entries",
      "stream=index,codec_type,codec_name,width,height",
      "-of",
      "json",
      video,
    ],
    { encoding: "utf8" },
  );
  const parsed = JSON.parse(raw) as {
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
    }>;
    format?: { duration?: string; size?: string };
  };
  const videoStream = parsed.streams?.find(
    (stream) =>
      stream.codec_type === "video" ||
      (typeof stream.width === "number" && typeof stream.height === "number"),
  );
  const expected = expectedDelivery(orientation);
  const passed =
    videoStream?.width === expected.width &&
    videoStream.height === expected.height;
  return {
    passed,
    orientation,
    expected,
    actual: {
      width: videoStream?.width ?? null,
      height: videoStream?.height ?? null,
      codec: videoStream?.codec_name ?? null,
    },
    durationSec: Number(parsed.format?.duration ?? 0),
    sizeBytes: Number(parsed.format?.size ?? 0),
    ffprobe: parsed,
  };
}

async function main(): Promise<void> {
  // 动态导入必须发生在安全门之后，避免误连真实 DB 时触发任何服务初始化。
  const [{ ENDPOINTS }, { compositeTransport }, { resolveRequestContext }, production, assembler, audit] =
    await Promise.all([
      import("@creatoros/contract"),
      import("../src/server/persistence-client"),
      import("../src/lib/request-context.server"),
      import("../src/features/production/production-flow"),
      import("../src/features/production/assemble-video-render-props"),
      import("../src/features/production/video-regression-audit"),
    ]);

  const ctx = await resolveRequestContext(null, ACCOUNT_ID);
  const request = async (endpoint: unknown, input: Json): Promise<unknown> =>
    compositeTransport.request(endpoint as never, input as never, ctx);

  const aiTasks = listOf<Json>(
    await request(ENDPOINTS.listAITasks, {
      params: {},
      query: { limit: 100, offset: 0, projectId: PROJECT_ID, taskType: "video.decisions" },
      body: {},
    }),
  );
  const seedTask = newest(
    aiTasks.filter(
      (task) =>
        task.taskType === "video.decisions" &&
        task.inputData &&
        typeof task.inputData === "object",
    ),
  );
  if (!seedTask) throw new Error("没有找到可复用输入的 video.decisions 历史任务");

  const executionTasks = listOf<Json>(
    await request(ENDPOINTS.listExecutionTasks, {
      params: {},
      query: { limit: 100, offset: 0, projectId: PROJECT_ID },
      body: {},
    }),
  );
  const seedRender = newest(
    executionTasks.filter(
      (task) =>
        task.execType === "video.render" ||
        (task.spec && typeof task.spec === "object" && (task.spec as Json).taskType === "video.render"),
    ),
  );
  if (!seedRender) throw new Error("没有找到可复用人物主视频与时长的历史渲染任务");
  const seedSpec = seedRender.spec as Json;
  const seedProps = seedSpec.params && typeof seedSpec.params === "object"
    ? ((seedSpec.params as Json).props as Json)
    : undefined;
  const seedTalkingHead = seedProps?.talkingHead as Json | undefined;
  const talkingHeadAssetId = String(seedTalkingHead?.file ?? "");
  const durationSec = Number(seedTalkingHead?.durationSec ?? 0);
  if (!talkingHeadAssetId || !Number.isFinite(durationSec) || durationSec <= 0) {
    throw new Error("历史渲染任务缺少人物主视频或真实时长");
  }

  mkdirSync(OUTPUT_ROOT, { recursive: true });
  const runId = `t712-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const runRoot = path.join(OUTPUT_ROOT, runId);
  mkdirSync(runRoot, { recursive: true });
  jsonFile(path.join(runRoot, "run.json"), {
    runId,
    accountId: ACCOUNT_ID,
    projectId: PROJECT_ID,
    rounds: ROUNDS,
    orientations: ORIENTATIONS,
    seedTaskId: seedTask.id,
    seedRenderTaskId: seedRender.id,
    expectedScreenRecordings: EXPECTED_SCREEN_RECORDINGS,
    forbiddenAssets: FORBIDDEN_ASSETS,
    sourceDatabase: "temporary-copy",
    backgroundDrivers: "disabled",
  });

  const poll = async (endpoint: unknown, taskId: string, timeoutMs: number): Promise<Json> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const task = dataOf<Json>(
        await request(endpoint, { params: { taskId }, query: {}, body: {} }),
      );
      const status = String(task.status ?? "");
      if (TERMINAL_OK.has(status)) return task;
      if (TERMINAL_BAD.has(status)) {
        throw new Error(`${taskId} ${status}: ${String(task.errorMessage ?? "未知错误")}`);
      }
      await sleep(2_000);
    }
    throw new Error(`${taskId} 超过等待时限`);
  };

  for (const orientation of ORIENTATIONS) {
    const orientationDir = path.join(runRoot, orientation);
    mkdirSync(orientationDir, { recursive: true });
    let acceptedRound = false;
    for (let round = 1; round <= ROUNDS; round += 1) {
      const roundDir = path.join(orientationDir, `round-${round}`);
      mkdirSync(roundDir, { recursive: true });
      try {
        const attemptId = `t712-real-${orientation}-${Date.now()}-${round}`;
        const inputData = {
      ...((seedTask.inputData as Json) ?? {}),
      projectId: PROJECT_ID,
      orientation,
      regressionRunId: runId,
      regressionRound: round,
      regressionOrientation: orientation,
    };
        const created = dataOf<Json>(
      await request(ENDPOINTS.createAITask, {
        params: {},
        query: {},
        body: { taskType: "video.decisions", attemptId, inputData },
      }),
    );
        const aiTaskId = String(created.id);
        console.log(`[T-712] ${orientation} round ${round}: AI 分镜任务 ${aiTaskId}`);
        const finishedAI = await poll(ENDPOINTS.getTask, aiTaskId, 12 * 60_000);
        const results = listOf<Json>(
      await request(ENDPOINTS.listTaskResults, {
        params: { taskId: aiTaskId },
        query: {},
        body: {},
      }),
    );
        const result = newest(results.filter((item) => item.resultType === "video_decisions"));
        const resultData = result?.resultData as Json | undefined;
        if (!resultData?.decisions || !resultData.inventory) {
          throw new Error(`AI 分镜任务 ${aiTaskId} 没有 video_decisions 结果`);
        }
        const decisions = resultData.decisions as never;
        const inventory = resultData.inventory as never[];
        jsonFile(path.join(roundDir, "ai-task.json"), {
      id: aiTaskId,
      status: finishedAI.status,
      modelKey: finishedAI.modelKey,
    });
        jsonFile(path.join(roundDir, "decisions.json"), decisions);
        jsonFile(path.join(roundDir, "inventory.json"), inventory);

        const decisionAudit = audit.auditVideoDecisions(decisions, {
      forbiddenAssetIds: FORBIDDEN_ASSETS,
      expectedScreenRecordingIds: EXPECTED_SCREEN_RECORDINGS,
      minimumExpectedScreenRecordings: 3,
      ...(orientation === "portrait"
        ? {
            minimumScreenRecordingDurationSec: 6,
            minimumScreenRecordingCoverageRatio: 0.28,
          }
        : {}),
    });
        jsonFile(path.join(roundDir, "decision-audit.json"), decisionAudit);
        if (!decisionAudit.passed) {
          throw new Error(`${orientation} 第 ${round} 轮分镜物理边界未通过，详见 ${roundDir}/decision-audit.json`);
        }

        const renderProps = assembler.assembleVideoRenderProps(decisions, {
      title: String((seedProps?.meta as Json | undefined)?.title ?? "T-712 视频回归"),
      talkingHeadAssetId,
      talkingHeadDurationSec: durationSec,
      inventory,
      orientation,
    });
        const renderAudit = audit.auditVideoRenderProps(renderProps, {
      expectedOrientation: orientation,
      ...(orientation === "portrait"
        ? {
            minimumScreenRecordingDurationSec: 6,
            minimumScreenRecordingCoverageRatio: 0.28,
          }
        : {}),
    });
        jsonFile(path.join(roundDir, "render-props.json"), renderProps);
        jsonFile(path.join(roundDir, "render-audit.json"), renderAudit);
        if (!renderAudit.passed) {
          throw new Error(`${orientation} 第 ${round} 轮渲染契约未通过，详见 ${roundDir}/render-audit.json`);
        }

        const renderCreated = dataOf<Json>(
      await request(ENDPOINTS.createExecutionTask, {
        params: {},
        query: {},
        body: {
          projectId: PROJECT_ID,
          spec: {
            taskType: "video.render",
            goal: `T-712 ${orientation} 回归渲染:${String((renderProps.meta as Json).title ?? "成片")}`,
            inputs: production.buildRenderInputs(renderProps),
            params: { props: renderProps },
            constraints: { timeoutSec: 1800, network: "deny", maxOutputMB: 2048 },
          },
        },
      }),
    );
        const renderTaskId = String(renderCreated.id);
        console.log(`[T-712] ${orientation} round ${round}: 渲染任务 ${renderTaskId}`);
        const finishedRender = await poll(ENDPOINTS.getExecutionTask, renderTaskId, 35 * 60_000);
        const rendered = resolveRenderedFile(finishedRender);
        const copied = path.join(roundDir, "final.mp4");
        copyFileSync(rendered, copied);
        const contactSheet = path.join(roundDir, "contact-sheet.jpg");
        createContactSheet(copied, contactSheet, orientation);
        const encodedAudit = inspectEncodedVideo(copied, orientation);
        jsonFile(path.join(roundDir, "encoded-audit.json"), encodedAudit);
        if (!encodedAudit.passed) {
          throw new Error(
            `${orientation} 第 ${round} 轮编码尺寸未通过，详见 ${roundDir}/encoded-audit.json`,
          );
        }
        jsonFile(path.join(roundDir, "result.json"), {
      orientation,
      aiTaskId,
      renderTaskId,
      modelKey: finishedAI.modelKey,
      decisionAudit,
      renderAudit,
      encodedAudit,
      finalVideo: copied,
      contactSheet,
        });
        console.log(`[T-712] ${orientation} round ${round}: 完成 ${copied}`);
        acceptedRound = true;
        break;
      } catch (error) {
        const message = error instanceof Error ? error.stack ?? error.message : String(error);
        jsonFile(path.join(roundDir, "round-error.json"), { orientation, round, message });
        console.warn(`[T-712] ${orientation} round ${round}: 未通过，继续下一轮\n${message}`);
        if (round === ROUNDS) throw error;
      }
    }
    if (!acceptedRound) throw new Error(`${orientation} ${ROUNDS} 轮均未通过回归验收`);
  }

  console.log(`[T-712] 回归输出：${runRoot}`);
  console.log(`[T-712] 临时数据库：${dbDir}`);
  console.log(`[T-712] 临时工作区：${workspaceRoot}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exit(1);
  });
