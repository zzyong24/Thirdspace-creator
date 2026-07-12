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
 */

import * as React from "react";

import { client } from "@/lib/contract-client";
import { ExecutionTaskCard } from "@/features/copilot/execution-task-card";
import { VideoDecisionPreview } from "./video-decision-preview";
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
  type ProductionStatus,
} from "./production-flow";

const POLL_MS = 4000;
const MAX_DECISION_POLLS = 150; // ~10 分钟(四决策 MiniMax 下分钟级)

// ── wire 形状(只声明本组件读的字段;服务端 zod 是单一真值)────────────────────

interface WireAsset {
  id: string;
}

interface WireAITask {
  id: string;
  status: string;
}

interface WireTaskResult {
  resultType: string;
  resultData: Record<string, unknown>;
}

interface WireProduction {
  id: string;
  status: string;
}

interface WireExecTask {
  id: string;
  execType: string;
  status: string;
  adoptedAssetIds: string[];
  errorMessage: string | null;
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

// ── 两阶段上传链(同 upload-to-project 先例;stage="production" 挂用料链)────────

async function uploadProductionAsset(
  projectId: string,
  file: File,
  assetType: "video" | "subtitle",
): Promise<string> {
  const mimeType =
    file.type ||
    (assetType === "video" ? "video/mp4" : "application/x-subrip");
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
  // 用料链登记(制作阶段;best-effort,失败不阻断主链)。
  await client
    .createMaterialLink({
      params: undefined,
      query: undefined,
      body: {
        projectId,
        entityType: "asset",
        entityId: asset.id,
        role: assetType === "video" ? "clip" : "reference",
        stage: "production",
      },
    })
    .catch(() => undefined);
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
  readVideoDuration = readVideoDurationViaElement,
}: ProductionWorkbenchProps) {
  const [outputId, setOutputId] = React.useState(initialOutputId);
  const [status, setStatus] = React.useState<string | null>(initialStatus);
  const [segmentCount, setSegmentCount] = React.useState(initialSegmentCount);

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
  const [decisionsBusy, setDecisionsBusy] = React.useState(false);
  const [decisionsError, setDecisionsError] = React.useState<string | null>(
    null,
  );
  const [decisions, setDecisions] = React.useState<VideoDecisions | null>(null);
  const [inventory, setInventory] = React.useState<readonly BrollAssetRef[]>([]);
  const [recoveredDecisions, setRecoveredDecisions] = React.useState(false);

  const [renderTaskId, setRenderTaskId] = React.useState<string | null>(null);
  const [renderEnvHint, setRenderEnvHint] = React.useState<string | null>(null);
  const [exportId, setExportId] = React.useState<string | null>(null);
  const [flowError, setFlowError] = React.useState<string | null>(null);

  // ── SRT 匹配校验(挡在提交前)──────────────────────────────────────────────
  const durationCheck: SrtDurationCheck | null = React.useMemo(() => {
    if (!srt || video?.durationSec == null) return null;
    return checkSrtDurationMatch(srt.lines, video.durationSec);
  }, [srt, video]);
  const scriptCheck: SrtScriptCheck | null = React.useMemo(() => {
    if (!srt || !scriptText?.trim()) return null;
    return checkSrtScriptMatch(srt.lines, scriptText);
  }, [srt, scriptText]);
  const checksBlocked =
    (durationCheck !== null && !durationCheck.ok) ||
    (scriptCheck !== null && !scriptCheck.ok);

  const materialsReady = Boolean(video && srt && scriptText?.trim());
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

  // ── ② AI 分场决策 dispatch + 轮询 ───────────────────────────────────────────
  const dispatchDecisions = React.useCallback(async () => {
    if (!srt || !scriptText?.trim()) return;
    setDecisionsBusy(true);
    setDecisionsError(null);
    try {
      const task = (await client.createAITask({
        params: undefined,
        query: undefined,
        body: {
          taskType: "video.decisions",
          inputData: { projectId, srtText: srt.text, script: scriptText },
        },
      })) as unknown as WireAITask;
      setDecisionsTaskId(task.id);
    } catch (err) {
      setDecisionsError(
        err instanceof Error ? err.message : "决策任务创建失败,请重试",
      );
    } finally {
      setDecisionsBusy(false);
    }
  }, [projectId, srt, scriptText]);

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
      setInventory(
        Array.isArray(data.inventory)
          ? (data.inventory as BrollAssetRef[])
          : [],
      );
      return true;
    },
    [],
  );

  React.useEffect(() => {
    if (!decisionsTaskId || decisions) return;
    let abandoned = false;
    void (async () => {
      for (let i = 0; i < MAX_DECISION_POLLS; i++) {
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
            setDecisionsError(detail || "AI 分场决策失败,可重新发起");
            setDecisionsTaskId(null);
            return;
          }
        } catch {
          /* 单次拉取失败下轮再试 */
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
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
      setFlowError(null);
      try {
        // 渲染执行任务是主链,先发(inputs 物化声明:mountAs 必须 = assetId)。
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
        setRenderTaskId(created.id);
        const confirmedTaskId = decisionsTaskId;
        setDecisions(null); // 预览卡收起,进入渲染跟踪
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
            const exp = (await client.createProductionExport({
              params: { productionId },
              query: undefined,
              body: {
                format: "mp4",
                resolution: "1920x1080",
                aspectRatio: "16:9",
              },
            })) as unknown as { id: string };
            setExportId(exp.id);
          } catch {
            /* 记账失败不阻断渲染跟踪 */
          }
        }
      } catch (err) {
        setFlowError(
          err instanceof Error ? err.message : "渲染任务创建失败,请重试",
        );
      }
    },
    [projectId, projectTitle, decisionsTaskId, advanceStatus],
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
    setDecisionsTaskId(null);
    setRecoveredDecisions(false);
  }, [decisionsTaskId]);

  // ── ④ 渲染任务跟踪:采纳 → completeExport + ready;环境错误人话化 ─────────────
  React.useEffect(() => {
    if (!renderTaskId) return;
    let abandoned = false;
    void (async () => {
      for (;;) {
        try {
          const task = (await client.getExecutionTask({
            params: { taskId: renderTaskId },
            query: undefined,
            body: undefined,
          })) as unknown as WireExecTask;
          if (abandoned) return;
          setRenderEnvHint(humanizeRenderError(task.errorMessage));
          if (task.status === "succeeded") {
            const resultAssetId = task.adoptedAssetIds[0];
            if (exportId && resultAssetId) {
              void client
                .completeExport({
                  params: { exportId },
                  query: undefined,
                  body: { resultAssetId },
                })
                .catch(() => undefined);
            }
            void advanceStatus("ready");
            return;
          }
          if (task.status === "cancelled") return;
        } catch {
          /* 单次拉取失败下轮再试 */
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (abandoned) return;
      }
    })();
    return () => {
      abandoned = true;
    };
  }, [renderTaskId, exportId, advanceStatus]);

  // ── 刷新恢复(best-effort):未收口的决策候选 / 在跑的渲染任务接回跟踪 ─────────
  React.useEffect(() => {
    let abandoned = false;
    void (async () => {
      try {
        const execs = (await client.listExecutionTasks({
          params: undefined,
          query: { page: 1, pageSize: 20, projectId },
          body: undefined,
        })) as unknown as WireExecTask[];
        const live = execs.find(
          (t) =>
            t.execType === "video.render" &&
            (t.status === "queued" ||
              t.status === "running" ||
              t.status === "awaiting_confirmation"),
        );
        if (live && !abandoned) {
          setRenderTaskId((prev) => prev ?? live.id);
          return; // 渲染在途优先;决策候选不再恢复(已消费)
        }
        const tasks = (await client.listAITasks({
          params: undefined,
          query: {
            page: 1,
            pageSize: 10,
            projectId,
            taskType: "video.decisions",
          },
          body: undefined,
        })) as unknown as WireAITask[];
        const pending = tasks.find((t) => t.status === "awaiting_confirmation");
        if (pending && !abandoned) {
          const loaded = await loadDecisionResult(pending.id);
          if (loaded && !abandoned) {
            setDecisionsTaskId(pending.id);
            setRecoveredDecisions(true);
          }
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
        <h3 className="text-sm font-medium">① 口播稿(提词用)</h3>
        {scriptText?.trim() ? (
          <>
            <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-control bg-muted/40 p-3 text-sm leading-relaxed">
              {scriptText}
            </pre>
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

      {/* ① 备料区:上传粗剪 + SRT */}
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
                  ? `✓ 内容匹配:与口播稿相似度 ${(scriptCheck.similarity * 100).toFixed(0)}%`
                  : `✕ 内容不匹配:SRT 全文与口播稿相似度仅 ${(scriptCheck.similarity * 100).toFixed(0)}%(阈值 ${(scriptCheck.threshold * 100).toFixed(0)}%)—— 像是另一条视频的字幕`}
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

      {/* ② AI 分场决策 */}
      <section
        data-slot="production-decisions"
        className="flex flex-col gap-2 rounded-control border border-border bg-surface p-4"
      >
        <h3 className="text-sm font-medium">③ AI 分场决策</h3>
        {!decisionsTaskId && !decisions ? (
          <>
            <button
              type="button"
              data-slot="dispatch-decisions"
              disabled={!canDispatchDecisions}
              onClick={() => void dispatchDecisions()}
              className="inline-flex h-8 w-fit items-center rounded-control bg-brand px-3 text-sm font-medium text-brand-foreground disabled:opacity-50"
            >
              {decisionsBusy ? "创建任务中…" : "AI 分场决策"}
            </button>
            {!materialsReady ? (
              <p className="text-xs text-muted-foreground">
                备料齐(口播稿 + 粗剪视频 + SRT)后可发起 —— AI 产出分场/信息卡/
                B-roll/双语字幕决策,过目确认后才渲染。
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
            四决策进行中(分场/信息卡/B-roll/双语字幕)…任务后台跑,可离开本页
          </div>
        ) : null}
        {decisionsError ? (
          <p data-slot="decisions-error" className="text-xs text-destructive">
            {decisionsError}
          </p>
        ) : null}
        {decisions ? (
          <>
            {recoveredDecisions && !video ? (
              <p className="text-xs text-muted-foreground">
                已恢复上次的决策候选;刷新后视频引用丢失,请重新上传粗剪视频后再确认渲染。
              </p>
            ) : null}
            <VideoDecisionPreview
              decisions={decisions}
              inventory={inventory}
              title={projectTitle}
              talkingHeadAssetId={video?.assetId ?? null}
              talkingHeadDurationSec={video?.durationSec ?? undefined}
              onConfirm={(payload) => void onConfirmDecisions(payload)}
              onDiscard={onDiscardDecisions}
            />
          </>
        ) : null}
        {flowError ? (
          <p data-slot="flow-error" className="text-xs text-destructive">
            {flowError}
          </p>
        ) : null}
      </section>

      {/* ④ 渲染跟踪(执行确认卡 + 环境引导) */}
      {renderTaskId ? (
        <section
          data-slot="production-render"
          className="flex flex-col gap-2 rounded-control border border-border bg-surface p-4"
        >
          <h3 className="text-sm font-medium">④ 渲染成片</h3>
          {renderEnvHint ? (
            <p
              data-slot="render-env-hint"
              className="rounded-control bg-muted/40 p-2 text-xs leading-relaxed"
            >
              {renderEnvHint}
            </p>
          ) : null}
          <ExecutionTaskCard taskId={renderTaskId} />
          <p className="text-xs text-muted-foreground">
            渲染完成后在上方卡片「采纳进素材库」—— 采纳才入库(exportRecord 同步
            ready),丢弃/重试都在卡内。
          </p>
        </section>
      ) : null}
    </div>
  );
}
