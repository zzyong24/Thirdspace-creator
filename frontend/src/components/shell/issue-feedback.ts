export interface IssueFeedbackInput {
  readonly summary?: string;
  readonly description: string;
  readonly appVersion: string | null;
  readonly buildId?: string | null;
  readonly os: string;
  readonly route: string;
  readonly occurredAt: Date;
  readonly correlationId?: string;
}

export interface ProductFeedbackPreviewInput {
  readonly summary: string;
  readonly description: string;
  readonly appVersion: string | null;
  readonly os: string;
  readonly locale: string;
}

const ENTITY_COLLECTIONS = new Set([
  "projects",
  "assets",
  "knowledge",
  "topics",
  "intelligence",
]);
const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LONG_NUMBER_SEGMENT = /^\d{6,}$/;

export function feedbackDescriptionLength(value: string): number {
  return Array.from(value.trim()).length;
}

export function sanitizeFeedbackRoute(value: string): string {
  try {
    const pathname = new URL(value, "http://creatoros.local").pathname;
    const segments = pathname.split("/").filter(Boolean);
    const sanitized = segments.map((segment, index) => {
      const previous = segments[index - 1];
      if (
        (previous && ENTITY_COLLECTIONS.has(previous)) ||
        UUID_SEGMENT.test(segment) ||
        LONG_NUMBER_SEGMENT.test(segment)
      ) {
        return ":id";
      }
      return segment;
    });
    return sanitized.length > 0 ? `/${sanitized.join("/")}` : "/";
  } catch {
    return "/unknown";
  }
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/\bAuthorization\s*:\s*Bearer\s+\S+/gi, "Authorization: Bearer [已隐藏]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [已隐藏]")
    .replace(/\bCookie\s*:\s*[^\r\n]+/gi, "Cookie: [已隐藏]")
    .replace(
      /\b(api[_-]?key|apiKey|activationCode|licenseKey)\s*[:=]\s*["']?[^\s;"']+/gi,
      "$1=[已隐藏]",
    )
    .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/g, "[已隐藏]");
}

/**
 * 应用内提交的逐字预览。
 *
 * 这里只展示 API-CREATOR-001 实际允许发送的字段；页面路径、时间、日志与关联编号不混进
 * “发送预览”，避免用户看到的内容和真正提交的内容不一致。
 */
export function buildProductFeedbackPreview(
  input: ProductFeedbackPreviewInput,
): string {
  return [
    `问题摘要：${redactSensitiveText(input.summary.replace(/\r\n?/g, "\n").trim())}`,
    `问题描述：${redactSensitiveText(input.description.replace(/\r\n?/g, "\n").trim())}`,
    "复现步骤：未单独填写",
    `应用版本：${input.appVersion?.trim() || "未知"}`,
    `系统：${input.os || "未知"}`,
    `语言：${input.locale || "zh-CN"}`,
  ].join("\n");
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatFeedbackOccurredAt(value: Date): string {
  if (!Number.isFinite(value.getTime())) return "未知";
  const offsetMinutes = -value.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? "+" : "-";
  const offsetAbs = Math.abs(offsetMinutes);
  const offset = `${offsetSign}${twoDigits(Math.floor(offsetAbs / 60))}:${twoDigits(offsetAbs % 60)}`;
  const localTime =
    `${value.getFullYear()}-${twoDigits(value.getMonth() + 1)}-${twoDigits(value.getDate())} ` +
    `${twoDigits(value.getHours())}:${twoDigits(value.getMinutes())}:${twoDigits(value.getSeconds())}`;
  return `${localTime}（UTC${offset}，本机时间）`;
}

export function buildIssueFeedbackText(input: IssueFeedbackInput): string {
  const version = input.appVersion?.trim() || "未知";
  const build = input.buildId?.trim() ? ` · build ${input.buildId.trim()}` : "";
  const lines = [
    ...(input.summary?.trim()
      ? [`问题摘要：${redactSensitiveText(input.summary.trim())}`]
      : []),
    `问题描述：${redactSensitiveText(input.description.trim())}`,
    `应用版本：${version}${build}`,
    `系统：${input.os || "未知"}`,
    `页面：${sanitizeFeedbackRoute(input.route)}`,
    `时间：${formatFeedbackOccurredAt(input.occurredAt)}`,
  ];
  if (input.correlationId?.trim()) {
    lines.push(`关联编号：${input.correlationId.trim()}`);
  }
  return lines.join("\n");
}
