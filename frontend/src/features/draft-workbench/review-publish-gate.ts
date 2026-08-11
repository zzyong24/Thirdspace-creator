/**
 * review-publish-gate — 审核折中门的纯派生(T-110,用户拍板:红硬拦、黄软提醒)。
 *
 * 稿面审核 verdict(script_review_reports)按三态门控「登记已发布 / 进入下一步 / 发布」:
 *   - block(红)→ 硬禁用发布/登记动作,给「先去审核」引导(hardBlocked=true);
 *   - risk(黄)→ 只软提醒(建议先改),不禁用(hardBlocked=false, softWarn=true);
 *   - pass(绿)/ 无报告(null)→ 放行(首次不强制先审 —— 只有审出 block 才硬拦);
 *   - stale(报告版本 < 当前脚本版本)→ 旧 verdict 不作数,降为软提醒「脚本已改,建议重审」,
 *     **不硬拦**(哪怕旧报告是 block —— 脚本已改过,旧结论不该继续挡)。
 *
 * 纯函数,零副作用:UI 组件读它决定 disabled + 提示,单测直接覆盖三态 + stale。
 */

import type { ScriptReviewReportResource } from "@creatoros/contract";
export { isLegacyIncompleteReview } from "@/lib/script-review-status";
import { isLegacyIncompleteReview } from "@/lib/script-review-status";

export interface ReviewPublishGate {
  /** true = 发布/登记动作硬禁用(仅 verdict=block 且非 stale)。 */
  readonly hardBlocked: boolean;
  /** true = 显示软提醒(risk 未过期,或 stale 报告);不禁用。 */
  readonly softWarn: boolean;
  /** 软提醒/引导文案(hardBlocked / softWarn 时非空;放行时 null)。 */
  readonly reason: string | null;
}

/**
 * 从最新审核报告 + 当前脚本版本派生门控。
 *
 * @param report          getLatestScriptReview 首屏真值;null = 未审。
 * @param currentVersion  当前脚本版本号(script.versionCount)。
 */
export function deriveReviewPublishGate(
  report: ScriptReviewReportResource | null,
  currentVersion: number,
): ReviewPublishGate {
  // 无报告 → 放行(首次不强制先审)。
  if (report === null || isLegacyIncompleteReview(report)) {
    return { hardBlocked: false, softWarn: false, reason: null };
  }
  // stale:脚本改过、旧 verdict 不作数 → 软提醒,绝不硬拦(即便旧报告是 block)。
  const stale = report.artifactVersion < currentVersion;
  if (stale) {
    return {
      hardBlocked: false,
      softWarn: true,
      reason: "脚本已改，建议重新审核",
    };
  }
  if (report.verdict === "block") {
    return {
      hardBlocked: true,
      softWarn: false,
      reason: "合规审核判为阻断，请先去审核并处理命中项，再登记/发布",
    };
  }
  if (report.verdict === "risk") {
    return {
      hardBlocked: false,
      softWarn: true,
      reason: "审核有风险项，建议先改",
    };
  }
  // pass → 放行。
  return { hardBlocked: false, softWarn: false, reason: null };
}
