"use client";

/**
 * use-latest-script-review — 稿面审核报告的 client 自愈真值(T-393)。
 *
 * 病根:审核在右栏对话内完成(工具流落库),稿面的审核卡/软门横幅拿的是 server 首屏
 * props(initialReport)——完成路径上的 router.refresh 不总是覆盖到(真机实测:重新审核
 * 完成后横幅仍说「未重新审核」)。与其逐条完成路径埋刷新(易漏),这里让消费组件自愈:
 * **仅当报告缺失或 stale(版本落后当前脚本)时**轮询 getLatestScriptReview,追上即停;
 * 窗口聚焦时立即补拉一次。非 stale 时零请求。
 */

import * as React from "react";

import type { ScriptReviewReportResource } from "@creatoros/contract";

import { client } from "@/lib/contract-client";

const POLL_MS = 8000;

/** 读最新报告;404(未审)/失败吞成 null,下轮再试(诚实,不炸 UI)。 */
async function fetchLatest(
  projectId: string,
): Promise<ScriptReviewReportResource | null> {
  try {
    return (await client.getLatestScriptReview({
      params: { projectId },
      query: undefined,
      body: undefined,
    })) as ScriptReviewReportResource;
  } catch {
    return null;
  }
}

export function useLatestScriptReview(
  projectId: string,
  initialReport: ScriptReviewReportResource | null,
  currentVersion: number,
): ScriptReviewReportResource | null {
  const [report, setReport] = React.useState(initialReport);
  const needsFresh = report === null || report.artifactVersion < currentVersion;

  React.useEffect(() => {
    if (!needsFresh) return;
    let stopped = false;
    const pull = async () => {
      const latest = await fetchLatest(projectId);
      if (stopped || latest === null) return;
      setReport((prev) =>
        prev === null ||
        latest.id !== prev.id ||
        latest.artifactVersion > prev.artifactVersion
          ? latest
          : prev,
      );
    };
    const iv = setInterval(() => void pull(), POLL_MS);
    const onWake = () => void pull();
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      stopped = true;
      clearInterval(iv);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [needsFresh, projectId]);

  return report;
}
