import type { ScriptReviewReportResource } from "@creatoros/contract";

const LEGACY_INCOMPLETE_SUMMARY = /语义审核暂未(?:完成|运行)/;
const LEGACY_INCOMPLETE_MODEL = /仅完成基础规则检查/;

/**
 * 识别旧版把 L2 失败保存成成功报告的已知协议标记。纯确定性迁移判断，不解释文案语义。
 */
export function isLegacyIncompleteReview(
  report: Pick<ScriptReviewReportResource, "summary" | "modelLabel">,
): boolean {
  return (
    LEGACY_INCOMPLETE_SUMMARY.test(report.summary) ||
    LEGACY_INCOMPLETE_MODEL.test(report.modelLabel)
  );
}
