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
import { readCurrentAccountId, readCurrentGroupId } from "@/lib/http-transport";

const POLL_MS = 8000;

type ReviewObserver = { stale: boolean; update(report: ScriptReviewReportResource): void };
type SharedReviewRead = {
  observers: Set<ReviewObserver>;
  pending: boolean;
  timer?: ReturnType<typeof setTimeout>;
  report: ScriptReviewReportResource | null;
  wake(): void;
  schedule(): void;
};
const reads = new Map<string, SharedReviewRead>();

function sharedRead(key: string, projectId: string): SharedReviewRead {
  const previous = reads.get(key);
  if (previous) return previous;
  const entry: SharedReviewRead = {
    observers: new Set(), pending: false, report: null,
    schedule() {
      clearTimeout(entry.timer);
      if (!entry.pending && !document.hidden && [...entry.observers].some(observer => observer.stale)) {
        entry.timer = setTimeout(entry.wake, POLL_MS);
      }
    },
    wake() {
      if (entry.pending || !entry.observers.size || document.hidden) return;
      clearTimeout(entry.timer);
      entry.pending = true;
      void fetchLatest(projectId).then(report => {
        if (report) {
          entry.report = newerReport(entry.report, report);
          for (const observer of entry.observers) observer.update(entry.report!);
        }
      }).finally(() => {
        entry.pending = false;
        if (!entry.observers.size) reads.delete(key);
        else entry.schedule();
      });
    },
  };
  reads.set(key, entry);
  return entry;
}

function observeReview(key: string, projectId: string, observer: ReviewObserver): () => void {
  const entry = sharedRead(key, projectId);
  if (!entry.observers.size) {
    window.addEventListener("focus", entry.wake);
    document.addEventListener("visibilitychange", entry.schedule);
    document.addEventListener("visibilitychange", entry.wake);
  }
  entry.observers.add(observer);
  if (entry.report) observer.update(entry.report);
  entry.schedule();
  return () => {
    entry.observers.delete(observer);
    entry.schedule();
    if (!entry.observers.size) {
      window.removeEventListener("focus", entry.wake);
      document.removeEventListener("visibilitychange", entry.schedule);
      document.removeEventListener("visibilitychange", entry.wake);
      if (!entry.pending) reads.delete(key);
    }
    // 公共 transport 尚无 AbortSignal；移除观察者阻止旧回写，不宣称撤回已发送请求。
  };
}

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
  const key = JSON.stringify([readCurrentGroupId(), readCurrentAccountId(), projectId]);
  const [fetched, setFetched] = React.useState<{
    key: string;
    report: ScriptReviewReportResource;
  } | null>(null);
  const fetchedReport = fetched?.key === key ? fetched.report : null;
  const report = newerReport(initialReport, fetchedReport);

  const stale = report !== null && report.artifactVersion < currentVersion;
  const needsFresh = report === null || stale;

  React.useEffect(() => {
    if (!needsFresh) return;
    return observeReview(key, projectId, {stale, update: report => setFetched({key, report})});
  }, [needsFresh, key, projectId, stale]);

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
