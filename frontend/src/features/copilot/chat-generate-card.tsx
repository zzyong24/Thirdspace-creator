"use client";

/**
 * 对话内 AI 生成素材结果卡(T-084c,SPEC 2026-07-03 §3.1)。
 *
 * material.generate 工具 dispatch 了一个既有 asset.generate task(不直接生成 —— 视频异步分钟级
 * 不能阻塞对话回合),把 taskId 交给本卡。本卡据 taskId **轮询** task/candidate:
 *   running/queued → 显示进行中;
 *   awaiting_confirmation → 拉 candidate 渲缩略图 + 「采纳进素材库」(client.confirmTask,
 *     复用既有 AdoptCandidateCard 的 confirm 流,人点才把生成 asset 绑进用料链,铁律②);
 *   cancelled/failed → 失败(含未配生图/生视频模型)→ 卡内诚实「未配置生图/生视频模型,[去设置]」。
 *
 * 生成素材 origin:generated(asset-generate-runner 既有)—— AI 素材不冒充真证据。
 * dispatch 本身失败(极少;端口未接入)→ error 非 null → 直接渲错误态。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import { resolveAssetPreviewUrl } from "@/components/resources/asset-preview-url";

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 90; // ~6 分钟 —— 视频异步生成可达分钟级

type Phase = "running" | "review" | "done" | "error";

// [T-271] 结构化封面方案(cover-runner recordCandidate 写的 resultData.coverPlan 形状)。封面文案
// 已过诚实门(headline/subheadline/keyPoints 里未溯源的具体数字已带⚠️标注)。
interface CoverPlan {
  headline: string;
  subheadline: string;
  keyPoints: string[];
  visualConcept: string;
  composition: string;
  palette: string;
}

interface GeneratedCandidate {
  assetId: string;
  assetType: "image" | "video";
  name: string;
  // [T-271] 封面链候选带结构化封面方案(通用 material.generate 无此字段 → null)。
  coverPlan: CoverPlan | null;
  ungroundedCount: number;
  referenceImage: {
    requestedAssetId: string | null;
    status: "used" | "not_used" | "not_requested";
    used: boolean;
  } | null;
}

// [T-271] resultData.coverPlan → 收窄(封面链 recordCandidate 写的封面方案;非封面候选返回 null）。
function parseCoverPlan(resultData: Record<string, unknown>): CoverPlan | null {
  const raw = resultData.coverPlan;
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const keyPoints = Array.isArray(p.keyPoints)
    ? p.keyPoints.filter((x): x is string => typeof x === "string")
    : [];
  return {
    headline: str(p.headline),
    subheadline: str(p.subheadline),
    keyPoints,
    visualConcept: str(p.visualConcept),
    composition: str(p.composition),
    palette: str(p.palette),
  };
}

// candidate.resultData(asset-generate-runner / cover-runner recordCandidate 写的形状)→ 收窄。
function parseGenerated(
  resultData: Record<string, unknown>,
): GeneratedCandidate | null {
  const assetId =
    typeof resultData.assetId === "string" ? resultData.assetId : "";
  if (!assetId) return null;
  const assetType = resultData.assetType === "video" ? "video" : "image";
  const name = typeof resultData.name === "string" ? resultData.name : "AI 生成素材";
  const coverPlan = parseCoverPlan(resultData);
  const ungroundedCount = Array.isArray(resultData.ungroundedClaims)
    ? resultData.ungroundedClaims.length
    : 0;
  const rawReference =
    resultData.referenceImage &&
    typeof resultData.referenceImage === "object"
      ? (resultData.referenceImage as Record<string, unknown>)
      : null;
  const referenceImage =
    rawReference &&
    ["used", "not_used", "not_requested"].includes(
      String(rawReference.status),
    )
      ? {
          requestedAssetId:
            typeof rawReference.requestedAssetId === "string"
              ? rawReference.requestedAssetId
              : null,
          status: rawReference.status as "used" | "not_used" | "not_requested",
          used: rawReference.used === true,
        }
      : null;
  return {
    assetId,
    assetType,
    name,
    coverPlan,
    ungroundedCount,
    referenceImage,
  };
}

export function ChatGenerateCard({
  taskId,
  kindOf,
  error,
}: {
  taskId: string | null;
  kindOf: "image" | "video";
  /** dispatch 阶段的错误(端口未接入等);非 null 时直接渲错误态。 */
  error: string | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>(
    error || !taskId ? "error" : "running",
  );
  const [candidate, setCandidate] = React.useState<GeneratedCandidate | null>(
    null,
  );
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  // [T-376] 任务终败时 runner 写进步骤流末条的真实原因(「未配置」vs「配置了但调用失败」);
  // null = 没读到 → 兜底老文案。此前一切失败都渲「很可能是还没配置生图模型」,用户配了也被冤枉。
  const [failDetail, setFailDetail] = React.useState<string | null>(null);
  // [T-272] 只用 effect 局部 abandoned 标志控轮询;不再用 mount-cleanup 的 cancelledRef——
  // 它在 React StrictMode(Next dev 默认双挂)下 remount 不重置 → 轮询恒被 bail 卡死(与 T-265
  // ChatThesisCard 同款隐患同款修法)。

  // 完成后换缩略图签名 URL(与素材库同一份共享缓存,不重复换)。
  React.useEffect(() => {
    if (!candidate) return;
    let alive = true;
    void resolveAssetPreviewUrl(candidate.assetId).then((u) => {
      if (alive && u) setPreviewUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [candidate]);

  // 轮询 task/candidate(与 AdoptCandidateCard 同款循环,但从已 dispatch 的 taskId 起)。
  React.useEffect(() => {
    if (!taskId || error) return;
    let abandoned = false;
    void (async () => {
      for (let i = 0; i < MAX_POLLS; i++) {
        if (abandoned) return;
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (abandoned) return;
        let status: string;
        try {
          const t = (await client.getTask({
            params: { taskId },
            query: undefined,
            body: undefined,
          })) as { status: string };
          status = t.status;
        } catch {
          continue; // 单次拉取失败不终止(下轮再试)
        }
        if (status === "awaiting_confirmation") {
          try {
            const results = (await client.listTaskResults({
              params: { taskId },
              query: undefined,
              body: undefined,
            })) as unknown as Array<{ resultData: Record<string, unknown> }>;
            const last = results[results.length - 1];
            const got = last ? parseGenerated(last.resultData) : null;
            if (abandoned) return;
            if (got) {
              setCandidate(got);
              setPhase("review");
            } else {
              setPhase("error");
            }
          } catch {
            setPhase("error");
          }
          return;
        }
        if (status === "cancelled" || status === "failed") {
          // [T-376] 读步骤流末条拿 runner 记的真实失败原因(诚实分类,不一律怪「没配置」)。
          let detail = "";
          try {
            const steps = (await client.listTaskSteps({
              params: { taskId },
              query: undefined,
              body: undefined,
            })) as unknown as Array<{ kind: string; text: string }>;
            const last = steps[steps.length - 1];
            if (last?.kind === "error" && last.text) detail = last.text;
          } catch {
            /* 原因读取失败不影响错误主态(兜底老文案) */
          }
          if (!abandoned) {
            if (detail) setFailDetail(detail);
            setPhase("error");
          }
          return;
        }
      }
      if (!abandoned) setPhase("error"); // 轮询预算耗尽
    })();
    return () => {
      abandoned = true;
    };
    // taskId 稳定;错误态不轮询。
  }, [taskId, error]);

  const adopt = React.useCallback(async () => {
    if (!taskId) return;
    setConfirming(true);
    try {
      await client.confirmTask({
        params: { taskId },
        query: undefined,
        body: undefined,
      });
      setPhase("done");
      router.refresh();
    } catch {
      setPhase("error");
    } finally {
      setConfirming(false);
    }
  }, [taskId, router]);

  const kindLabel = kindOf === "video" ? "视频" : "图";

  return (
    <div
      data-slot="chat-generate-card"
      data-phase={phase}
      className="mt-1 flex w-full max-w-[420px] flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-2.5"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        AI 生成{kindLabel}素材 · 非真实拍摄
      </span>

      {phase === "running" ? (
        <div
          data-slot="chat-generate-running"
          className="flex items-center gap-2 text-[12px] text-muted-foreground"
        >
          <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          正在生成{kindLabel}
          {kindOf === "video" ? "（视频较慢，可能要一两分钟）" : ""}…
        </div>
      ) : null}

      {phase === "review" && candidate?.coverPlan ? (
        <div
          data-slot="chat-cover-plan"
          className="flex flex-col gap-1 rounded-md border border-border bg-surface-subtle p-2 text-[12px]"
        >
          <span className="text-[10px] font-medium uppercase tracking-wide text-text-subtle">
            封面方案（文案已过诚实门）
          </span>
          {candidate.coverPlan.headline ? (
            <div className="text-[13px] font-semibold text-foreground">
              {candidate.coverPlan.headline}
            </div>
          ) : null}
          {candidate.coverPlan.subheadline ? (
            <div className="text-foreground/80">{candidate.coverPlan.subheadline}</div>
          ) : null}
          {candidate.coverPlan.keyPoints.length > 0 ? (
            <ul className="ml-3.5 list-disc text-foreground/80">
              {candidate.coverPlan.keyPoints.map((kp, i) => (
                <li key={i}>{kp}</li>
              ))}
            </ul>
          ) : null}
          {candidate.coverPlan.visualConcept ? (
            <div className="text-[11px] text-text-subtle">
              主视觉：{candidate.coverPlan.visualConcept}
            </div>
          ) : null}
          {candidate.coverPlan.composition ? (
            <div className="text-[11px] text-text-subtle">
              构图：{candidate.coverPlan.composition}
            </div>
          ) : null}
          {candidate.referenceImage?.status === "used" ? (
            <div
              data-slot="chat-cover-reference"
              className="text-[11px] text-foreground/80"
            >
              参考图：已送给生图适配器
              {candidate.referenceImage.requestedAssetId
                ? `（${candidate.referenceImage.requestedAssetId}）`
                : ""}
              ，不代表模型一定采纳其风格
            </div>
          ) : candidate.referenceImage?.status === "not_used" ? (
            <div
              data-slot="chat-cover-reference"
              className="text-[11px] text-warning"
            >
              参考图：读取失败或不可用，本次未送给生图适配器
            </div>
          ) : null}
          {candidate.ungroundedCount > 0 ? (
            <div className="text-[11px] text-warning">
              ⚠️ 封面文案含 {candidate.ungroundedCount} 处未溯源数据（已标注），发布前请核实出处。
            </div>
          ) : null}
        </div>
      ) : null}

      {phase === "review" && candidate ? (
        <div data-slot="chat-generate-review" className="flex flex-col gap-1.5">
          {previewUrl ? (
            kindOf === "video" ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                src={previewUrl}
                controls
                preload="metadata"
                data-slot="chat-generate-thumb"
                className="max-h-64 w-full rounded-md border border-border bg-black object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={candidate.name}
                data-slot="chat-generate-thumb"
                className="max-h-64 w-full rounded-md border border-border object-contain bg-surface-subtle"
              />
            )
          ) : (
            <div className="flex h-24 w-full items-center justify-center rounded-md border border-dashed border-border text-[11px] text-text-subtle">
              缩略图加载中…
            </div>
          )}
          <div
            className="min-w-0 truncate text-[12px] text-foreground"
            title={candidate.name}
          >
            {candidate.name}
          </div>
          <button
            type="button"
            data-slot="chat-generate-adopt"
            disabled={confirming}
            onClick={() => void adopt()}
            className="inline-flex h-7 w-fit items-center rounded-control bg-brand px-3 text-[11px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
          >
            {confirming ? "采纳中…" : "采纳进素材库"}
          </button>
        </div>
      ) : null}

      {phase === "done" ? (
        <p data-slot="chat-generate-done" className="text-[12px] text-success">
          ✓ 已采纳进素材库（标记 AI 生成）。
        </p>
      ) : null}

      {phase === "error" ? (
        <div data-slot="chat-generate-error" className="flex flex-col gap-1">
          {/* [T-376] 有真实原因 → 原样展示(runner 已分类成人话:「未配置…」vs
              「…已配置,但调用失败:<原因>」);读不到才兜底老猜测文案。 */}
          <p className="text-[12px] leading-relaxed text-destructive">
            {error
              ? error
              : failDetail
                ? `没能生成${kindLabel}素材 —— ${failDetail}`
                : `没能生成${kindLabel}素材 —— 很可能是还没配置生${kindLabel}模型。`}
          </p>
          <a
            href="/settings?tab=models"
            data-slot="chat-generate-settings-link"
            className="text-[11px] font-medium text-brand underline underline-offset-2"
          >
            {failDetail && !failDetail.includes("未配置")
              ? "去设置检查模型配置 →"
              : `去设置配生${kindLabel}模型 →`}
          </a>
        </div>
      ) : null}
    </div>
  );
}
