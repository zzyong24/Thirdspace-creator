import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useLatestScriptReview } from "./use-latest-script-review";
import { ScriptReviewGate, ReviewSoftGateHint } from "./script-review-gate";
import * as React from "react";
import { render, cleanup } from "@testing-library/react";
import type { ScriptReviewReportResource } from "@creatoros/contract";
vi.mock("next/navigation", () => ({ useRouter: () => ({refresh: vi.fn(),push:vi.fn()}) }));
vi.mock("./draft-chat-request", () => ({useDraftChatRequest: () => ({openChat:vi.fn(),flushSave:vi.fn()})}));

const getLatestScriptReview = vi.fn();

vi.mock("@/lib/contract-client", () => ({
  client: {
    getLatestScriptReview: (...args: unknown[]) =>
      getLatestScriptReview(...args),
  },
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  getLatestScriptReview.mockReset();
});

describe("T-1073 真实稿面共享读取与生命周期", () => {
  const oldReport = {id:"old",artifactVersion:1,reviewedAt:"2026-10-07T00:00:00Z",verdict:"pass",lintFindings:[],llmFindings:[],artifactId:null,summary:"已审核"} as unknown as ScriptReviewReportResource;
  it("实际审核门与软提示在慢请求、聚焦和可见唤醒下只保留一个公共读取", async () => {
    vi.useFakeTimers();
    vi.spyOn(document,"hidden","get").mockReturnValue(false);
    let release!: (v:unknown)=>void;
    getLatestScriptReview.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
    const view=render(<><ScriptReviewGate projectId="slow" projectTitle="慢稿" outputId={null} currentVersion={2} initialReport={oldReport}/><ReviewSoftGateHint projectId="slow" currentVersion={2} report={oldReport}/></>);
    await act(async()=>{await vi.advanceTimersByTimeAsync(32000);window.dispatchEvent(new Event("focus"));document.dispatchEvent(new Event("visibilitychange"));});
    expect(getLatestScriptReview).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async()=>{release({...oldReport,id:"fresh",artifactVersion:2});await vi.advanceTimersByTimeAsync(32000);});
    expect(getLatestScriptReview).toHaveBeenCalledTimes(1);
  });
  it("隐藏停止定时读取，重新可见立即恢复；切项目不回写旧回执，失败后可再查", async () => {
    vi.useFakeTimers();
    let hidden=true;
    vi.spyOn(document,"hidden","get").mockImplementation(()=>hidden);
    let release!: (v:unknown)=>void;
    getLatestScriptReview.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;})).mockRejectedValueOnce(Error("offline")).mockResolvedValue({...oldReport,id:"current",artifactVersion:2});
    const hook=renderHook(({id})=>useLatestScriptReview(id,oldReport,2),{initialProps:{id:"old-project"}});
    await act(async()=>{await vi.advanceTimersByTimeAsync(32000);});
    expect(getLatestScriptReview).not.toHaveBeenCalled();
    await act(async()=>{hidden=false;document.dispatchEvent(new Event("visibilitychange"));});
    expect(getLatestScriptReview).toHaveBeenCalledTimes(1);
    hook.rerender({id:"new-project"});
    await act(async()=>{release({...oldReport,id:"wrong",artifactVersion:9});await vi.advanceTimersByTimeAsync(16000);});
    expect(hook.result.current?.id).toBe("current");
    expect(getLatestScriptReview).toHaveBeenCalledTimes(3);
  });
});

describe("T-585 稿面审核空态轮询", () => {
  it("从未审核时不再每 8 秒请求，窗口重新聚焦时才补拉一次", async () => {
    vi.useFakeTimers();
    getLatestScriptReview.mockRejectedValue(new Error("not found"));
    renderHook(() => useLatestScriptReview("project-1", null, 1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(24_000);
    });
    expect(getLatestScriptReview).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });
    expect(getLatestScriptReview).toHaveBeenCalledTimes(1);
  });

  it("T-767 同一脚本版本重新审核后，服务端新 report id 会替换本地旧结论", () => {
    const oldReport = {
      id: "review-old",
      artifactVersion: 2,
      verdict: "block",
      reviewedAt: "2026-08-11T08:00:00.000Z",
    } as never;
    const newReport = {
      id: "review-new",
      artifactVersion: 2,
      verdict: "pass",
      reviewedAt: "2026-08-11T08:01:00.000Z",
    } as never;
    const { result, rerender } = renderHook(
      ({ initial }) => useLatestScriptReview("project-1", initial, 2),
      { initialProps: { initial: oldReport } },
    );

    expect(result.current?.id).toBe("review-old");
    rerender({ initial: newReport });
    expect(result.current?.id).toBe("review-new");
    expect(result.current?.verdict).toBe("pass");
  });
});
