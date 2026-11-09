/**
 * 批次2-8b（月明 2026-11-10，B5 遗留）：复盘结论信号。
 *
 * review.analyze 的「实际观察 / 待验证解释 / 下一条检验」只存在于对话工具结果里（不落库）。
 * 经验卡在没有候选时只显示空态，用户看不到刚做完的复盘结论。这里把对话卡渲染出的结论按
 * projectId 存进本机（localStorage + 窗口事件），复盘页「本期经验」区订阅后在空态里展示。
 * 只是展示缓存：不改服务端数据，不替代经验裁决。
 */
import * as React from "react";

export interface ReviewConclusion {
  observations: string[];
  hypotheses: string[];
  nextExperiment: string;
  insufficientReason: string;
  /** 本次复盘提出的经验标题（默认已采纳，可在对话卡撤销）。 */
  learningTitles: string[];
  at: string;
}

const EVENT = "creatoros:review-conclusion";
const storageKey = (projectId: string) => `creatoros:review-conclusion:${projectId}`;

export function hasConclusion(c: Pick<ReviewConclusion, "observations" | "hypotheses" | "nextExperiment" | "insufficientReason">): boolean {
  return c.observations.length > 0 || c.hypotheses.length > 0 || !!c.nextExperiment.trim() || !!c.insufficientReason.trim();
}

export function publishReviewConclusion(projectId: string, conclusion: ReviewConclusion): void {
  if (typeof window === "undefined" || !projectId || !hasConclusion(conclusion)) return;
  try {
    const raw = JSON.stringify(conclusion);
    if (window.localStorage.getItem(storageKey(projectId)) === raw) return;
    window.localStorage.setItem(storageKey(projectId), raw);
  } catch { /* 存不下仍发事件给当前页 */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { projectId } }));
}

export function readReviewConclusion(projectId: string): ReviewConclusion | null {
  if (typeof window === "undefined" || !projectId) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(projectId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<ReviewConclusion>;
    const list = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string" && !!s.trim()) : []);
    const c: ReviewConclusion = {
      observations: list(v.observations), hypotheses: list(v.hypotheses),
      nextExperiment: typeof v.nextExperiment === "string" ? v.nextExperiment : "",
      insufficientReason: typeof v.insufficientReason === "string" ? v.insufficientReason : "",
      learningTitles: list(v.learningTitles), at: typeof v.at === "string" ? v.at : "",
    };
    return hasConclusion(c) ? c : null;
  } catch { return null; }
}

/** 订阅某项目最近一次复盘结论；SSR 首帧为 null，挂载后读本机。 */
export function useReviewConclusion(projectId: string): ReviewConclusion | null {
  const [value, setValue] = React.useState<ReviewConclusion | null>(null);
  React.useEffect(() => {
    setValue(readReviewConclusion(projectId));
    const onSignal = (e: Event) => {
      const detail = (e as CustomEvent<{ projectId?: string }>).detail;
      if (detail?.projectId === projectId) setValue(readReviewConclusion(projectId));
    };
    const onStorage = (e: StorageEvent) => { if (e.key === storageKey(projectId)) setValue(readReviewConclusion(projectId)); };
    window.addEventListener(EVENT, onSignal);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener(EVENT, onSignal); window.removeEventListener("storage", onStorage); };
  }, [projectId]);
  return value;
}
