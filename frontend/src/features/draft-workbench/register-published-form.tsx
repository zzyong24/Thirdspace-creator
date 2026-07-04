"use client";

/**
 * 「登记已发布」表单([T-055h③/T-063c] 发布操作流收尾,稿面发布包区主落点)。
 *
 * 用户把抖音链接粘进来 → 纯前端解析 aweme_id(lib/douyin-link,短链诚实拒绝)→
 * `outputs.publications.register`(backend 复用 createImportedPublication:直接落
 * status=published + external_id,幂等)→ 尽力触发一次指标采集:查启用中的
 * `self.metrics` 调度作业,命中则 `scheduledJobs.runNow`(fire-and-forget,幂等双闸
 * 在 backend);查不到/失败不阻塞登记事实,提示「下次任务采集将覆盖此作品」。
 *
 * 项目还没有 ContentOutput 时(纯站内新建、未走制作),先 `projects.outputs.create`
 * 铸一个再登记 —— 与制作区 start-production 的铸 output 同语义。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { LinkIcon, ShieldX, AlertTriangle } from "lucide-react";

import { client } from "@/lib/contract-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseDouyinAwemeId, douyinVideoUrl } from "@/lib/douyin-link";
import { deriveReviewPublishGate } from "./review-publish-gate";
import type { ScriptReviewReportResource } from "@creatoros/contract";

interface ScheduledJobDto {
  readonly id: string;
  readonly enabled: boolean;
  readonly sourceKind: string;
}

/**
 * 登记成功后的采集触发(best-effort):找一条启用中的 self.metrics 调度作业 runNow。
 * 返回给用户看的结果提示;任何失败都不影响已落库的登记事实。
 */
async function triggerMetricsCollection(): Promise<string> {
  try {
    const jobsRaw = await client.listScheduledJobs({
      params: undefined,
      query: { page: 1, pageSize: 50, sourceKind: "self.metrics" },
      body: undefined,
    });
    const jobs = (Array.isArray(jobsRaw) ? jobsRaw : []) as ScheduledJobDto[];
    // [T-054 组B] 规范 §2:「落库/任务采集」是实现说法,提示改用户视角。
    const job = jobs.find((j) => j.enabled);
    if (!job) return "已登记;下次自动采集会带回这条作品的数据。";
    await client.runScheduledJobNow({
      params: { jobId: job.id },
      query: undefined,
      body: {},
    });
    return "已登记,并已开始抓取这条作品的数据。";
  } catch {
    return "已登记;下次自动采集会带回这条作品的数据。";
  }
}

export function RegisterPublishedForm({
  projectId,
  projectTitle,
  outputId,
  scriptReview,
  scriptVersion,
}: {
  readonly projectId: string;
  readonly projectTitle: string;
  /** 项目现有 ContentOutput;null = 还没有(提交时先铸一个)。 */
  readonly outputId: string | null;
  /** [T-110] 最新审核报告(getLatestScriptReview 首屏真值;null = 未审)。 */
  readonly scriptReview: ScriptReviewReportResource | null;
  /** [T-110] 当前脚本版本号;判 stale(报告版本 < 当前 → 旧 verdict 不作数)。 */
  readonly scriptVersion: number;
}) {
  const router = useRouter();
  const [link, setLink] = React.useState("");
  const [phase, setPhase] = React.useState<"idle" | "saving">("idle");
  const [message, setMessage] = React.useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);

  // [T-110] 审核折中门:block(红)硬禁用登记;risk/stale 软提醒不禁用;pass/无报告放行。
  const gate = deriveReviewPublishGate(scriptReview, scriptVersion);
  const valid = link.trim().length > 0;

  function submit() {
    if (!valid || phase === "saving" || gate.hardBlocked) return;
    const awemeId = parseDouyinAwemeId(link);
    if (!awemeId) {
      setMessage({
        tone: "error",
        text: "没解析出视频编号 —— v.douyin.com 短链请先在浏览器打开,复制完整地址(含 /video/编号),或直接粘视频编号。",
      });
      return;
    }
    setPhase("saving");
    setMessage(null);
    void (async () => {
      try {
        // 1. 确保有 ContentOutput(纯站内项目可能还没走制作)。
        let targetOutputId = outputId;
        if (!targetOutputId) {
          const created = (await client.createOutput({
            params: { projectId },
            query: undefined,
            body: { title: projectTitle || "主内容" },
          })) as { id: string };
          targetOutputId = created.id;
        }
        // 2. 登记:published + external_id 落库(幂等)。
        await client.registerPublishedPublication({
          params: { outputId: targetOutputId },
          query: undefined,
          body: {
            platform: "douyin",
            externalId: awemeId,
            externalUrl: douyinVideoUrl(awemeId, link),
            title: projectTitle,
          },
        });
        // 3. best-effort 触发指标采集(失败不影响登记事实)。
        const hint = await triggerMetricsCollection();
        setMessage({ tone: "ok", text: hint });
        setLink("");
        router.refresh();
      } catch {
        setMessage({
          tone: "error",
          text: "登记失败,请稍后重试(链接已保留)。",
        });
      } finally {
        setPhase("idle");
      }
    })();
  }

  return (
    <div
      data-slot="register-published-form"
      data-testid="register-published-form"
      data-gate={gate.hardBlocked ? "blocked" : gate.softWarn ? "warn" : "open"}
      className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3"
    >
      {/* [T-110] block(红)→ 硬拦条 +「先去审核」引导(动作已 disabled)。 */}
      {gate.hardBlocked ? (
        <div
          data-testid="register-published-hard-block"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5"
        >
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-destructive">
            <ShieldX className="size-3.5 shrink-0" />
            {gate.reason}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="register-published-goto-review"
            className="h-6 px-2 text-[10px]"
            onClick={() =>
              document
                .getElementById("script")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            先去审核
          </Button>
        </div>
      ) : gate.softWarn ? (
        /* [T-110] risk(黄)/ stale → 只软提醒,不禁用。 */
        <p
          data-testid="register-published-soft-warn"
          className="flex items-center gap-1.5 text-[11px] font-medium text-warning"
        >
          <AlertTriangle className="size-3.5 shrink-0" />
          {gate.reason}
        </p>
      ) : null}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <LinkIcon className="size-3.5 shrink-0 text-text-subtle" />
        <Input
          aria-label="抖音链接"
          placeholder="发完了?粘抖音链接(或视频编号),登记为已发布…"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          disabled={phase === "saving" || gate.hardBlocked}
          className="h-8 min-w-0 flex-1 text-xs"
        />
        <Button
          type="submit"
          size="sm"
          disabled={!valid || phase === "saving" || gate.hardBlocked}
          title={
            gate.hardBlocked
              ? "合规审核判为阻断，请先去审核并处理命中项"
              : undefined
          }
          className="h-8 shrink-0 px-3 text-xs"
        >
          {phase === "saving" ? "登记中…" : "登记已发布"}
        </Button>
      </form>
      {message ? (
        <p
          data-testid="register-published-message"
          data-tone={message.tone}
          className={
            message.tone === "ok"
              ? "pl-6 text-[11px] text-success"
              : "pl-6 text-[11px] text-destructive"
          }
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
