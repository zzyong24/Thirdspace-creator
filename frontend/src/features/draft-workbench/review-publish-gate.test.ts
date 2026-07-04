/**
 * [T-110] 审核折中门纯派生测试(deriveReviewPublishGate)。
 *
 * 用户拍板三态 + stale:
 *   - block(红)→ hardBlocked;
 *   - risk(黄)→ softWarn 不 hardBlocked;
 *   - pass(绿)/ 无报告 → 全放行;
 *   - stale(报告版本 < 当前版本)→ 软提醒不硬拦(即便旧报告是 block)。
 */

import { describe, expect, it } from "vitest";
import type { ScriptReviewReportResource } from "@creatoros/contract";
import { deriveReviewPublishGate } from "./review-publish-gate";

function report(
  verdict: ScriptReviewReportResource["verdict"],
  artifactVersion: number,
): ScriptReviewReportResource {
  return {
    id: "rep",
    projectId: "p1",
    artifactId: "a1",
    artifactVersion,
    verdict,
    summary: "",
    lintFindings: [],
    llmFindings: [],
    modelLabel: "默认模型",
    reviewedAt: "2026-07-04T00:00:00.000Z",
  };
}

describe("deriveReviewPublishGate", () => {
  it("无报告(null)→ 放行(首次不强制先审)", () => {
    expect(deriveReviewPublishGate(null, 3)).toEqual({
      hardBlocked: false,
      softWarn: false,
      reason: null,
    });
  });

  it("pass(绿)且版本对齐 → 放行", () => {
    const g = deriveReviewPublishGate(report("pass", 3), 3);
    expect(g.hardBlocked).toBe(false);
    expect(g.softWarn).toBe(false);
    expect(g.reason).toBeNull();
  });

  it("block(红)且版本对齐 → 硬禁用 + 引导文案", () => {
    const g = deriveReviewPublishGate(report("block", 3), 3);
    expect(g.hardBlocked).toBe(true);
    expect(g.softWarn).toBe(false);
    expect(g.reason).toMatch(/阻断/);
  });

  it("risk(黄)且版本对齐 → 只软提醒,不禁用", () => {
    const g = deriveReviewPublishGate(report("risk", 3), 3);
    expect(g.hardBlocked).toBe(false);
    expect(g.softWarn).toBe(true);
    expect(g.reason).toMatch(/风险/);
  });

  it("stale(报告版本 < 当前)且是 risk → 软提醒「脚本已改」,不硬拦", () => {
    const g = deriveReviewPublishGate(report("risk", 2), 3);
    expect(g.hardBlocked).toBe(false);
    expect(g.softWarn).toBe(true);
    expect(g.reason).toMatch(/脚本已改/);
  });

  it("stale 且旧报告是 block → 仍不硬拦(脚本已改,旧 verdict 不作数)", () => {
    const g = deriveReviewPublishGate(report("block", 1), 3);
    expect(g.hardBlocked).toBe(false);
    expect(g.softWarn).toBe(true);
    expect(g.reason).toMatch(/脚本已改/);
  });
});
