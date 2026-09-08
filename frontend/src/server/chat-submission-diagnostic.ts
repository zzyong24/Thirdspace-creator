/** 只记录执行阶段和有限机器错误码，不记录 SQL、参数、模型响应或凭据。 */
export function chatSubmissionDiagnostic(error: unknown, phase: string) {
  const codes: string[] = [];
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const item = current as { code?: unknown; cause?: unknown };
    // SEMANTIC_BOUNDARY_ALLOW: 仅约束诊断码格式，不参与内容判断或错误恢复决策。
    if (typeof item.code === "string" && /^(?:[A-Z0-9]{5}|[A-Z][A-Z0-9_]{2,79})$/.test(item.code)) {
      codes.push(item.code);
    }
    current = item.cause;
  }
  return { phase, codes: [...new Set(codes)] };
}
