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
  // T-767：轮询结果只作为第二真值保存，渲染时与 router.refresh 带回的新 props 比较真实
  // artifactVersion/reviewedAt 取较新者。这样不靠 effect 抄 props，也不会让同版本的新 report id
  // 被首屏 useState 永久冻住。
  const [fetched, setFetched] = React.useState<{
    projectId: string;
    report: ScriptReviewReportResource;
  } | null>(null);
  const fetchedReport = fetched?.projectId === projectId ? fetched.report : null;
  const report = newerReport(initialReport, fetchedReport);

  const stale = report !== null && report.artifactVersion < currentVersion;
  const needsFresh = report === null || stale;

  React.useEffect(() => {
    if (!needsFresh) return;
    let stopped = false;
    const pull = async () => {
      const latest = await fetchLatest(projectId);
      if (stopped || latest === null) return;
      setFetched({ projectId, report: latest });
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

function newerReport(
  initial: ScriptReviewReportResource | null,
  fetched: ScriptReviewReportResource | null,
): ScriptReviewReportResource | null {
  if (initial === null) return fetched;
  if (fetched === null) return initial;
  if (fetched.artifactVersion !== initial.artifactVersion) {
    return fetched.artifactVersion > initial.artifactVersion ? fetched : initial;
  }
  const initialTime = Date.parse(initial.reviewedAt);
  const fetchedTime = Date.parse(fetched.reviewedAt);
  if (Number.isFinite(initialTime) && Number.isFinite(fetchedTime)) {
    return fetchedTime >= initialTime ? fetched : initial;
  }
  // 时间异常时不靠 id 猜新旧；服务端 refresh 的当前报告优先。
  return initial;
}
