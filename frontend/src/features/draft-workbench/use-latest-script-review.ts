"use client";

/**
 * use-latest-script-review — 稿面审核报告的 client 自愈真值(T-393)。
 *
 * 病根:审核在右栏对话内完成(工具流落库),稿面的审核卡/软门横幅拿的是 server 首屏
 * props(initialReport)——完成路径上的 router.refresh 不总是覆盖到(真机实测:重新审核
 * 完成后横幅仍说「未重新审核」)。与其逐条完成路径埋刷新(易漏),这里让消费组件自愈:
 * **已有旧报告且 stale(版本落后当前脚本)时**轮询 getLatestScriptReview,追上即停;
 * 从未审核(null)只在窗口聚焦/重新可见时补拉，不再每 8 秒把正常空态刷成异常日志。
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
  const stale = report !== null && report.artifactVersion < currentVersion;
  const needsFresh = report === null || stale;

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
    // 从未审核是正常空态，不应无限请求一个必定 404 的资源。已有报告变旧时才需要
    // T-393 的短周期自愈；null 仍保留 focus/visibility 唤醒，审核完成后回到稿面即可追上。
    const iv = stale ? setInterval(() => void pull(), POLL_MS) : null;
    const onWake = () => void pull();
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      stopped = true;
      if (iv !== null) clearInterval(iv);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [needsFresh, projectId, stale]);

  return report;
}
