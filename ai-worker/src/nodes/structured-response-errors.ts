/** 只识别供应商结构化协议兼容错误，不做内容语义判断。 */
export function isStructuredResponseCompatibilityError(
  error: unknown,
): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current != null; depth += 1) {
    if (seen.has(current)) break;
    seen.add(current);
    if (typeof current !== "object") break;
    const record = current as Record<string, unknown>;
    const message =
      typeof record.message === "string" ? record.message : "";
    const namesStructuredProtocol =
      /response[_\s-]?format|json[_\s-]?schema|structured\s+outputs?/i.test(
        message,
      );
    const declaresUnsupported =
      /not\s+support(?:ed)?|unsupported|does\s+not\s+support|不支持/i.test(
        message,
      );
    if (namesStructuredProtocol && declaresUnsupported) return true;
    current = record.cause;
  }
  return false;
}

