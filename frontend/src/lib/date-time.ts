type DateLike = string | Date | null | undefined;

function toDate(value: DateLike): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateParts(
  value: DateLike,
  options: Intl.DateTimeFormatOptions,
  timeZone?: string,
): Record<string, string> | null {
  const date = toDate(value);
  if (!date) return null;
  return Object.fromEntries(
    new Intl.DateTimeFormat("zh-CN", { ...options, timeZone })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
}

/** 使用用户电脑的本地时区，避免把数据库 ISO/UTC 字符串直接暴露在界面上。 */
export function formatLocalDate(value: DateLike): string {
  const part = dateParts(value, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  if (!part) return "时间未知";
  return `${part.year}-${part.month}-${part.day}`;
}

/** 紧凑到分钟；秒和时区偏移保留在数据层，不挤占产品界面。 */
export function formatLocalDateTime(value: DateLike): string {
  const part = dateParts(value, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  if (!part) return "时间未知";
  return `${part.year}-${part.month}-${part.day} ${part.hour}:${part.minute}`;
}

/** 服务端与浏览器首屏共用的稳定占位，水合后再切换到用户本机时区。 */
export function formatUtcDateTime(value: DateLike): string {
  const part = dateParts(
    value,
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    },
    "UTC",
  );
  if (!part) return "时间未知";
  return `${part.year}-${part.month}-${part.day} ${part.hour}:${part.minute}`;
}

function formatCalendarDate(value: DateLike): string {
  if (typeof value === "string") {
    const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (matched) return `${matched[1]}-${matched[2]}-${matched[3]}`;
  }
  return formatLocalDate(value);
}

/**
 * 复盘周期是日历日期，不是“某个 UTC 时刻”。直接保留年月日，避免跨时区后前后错一天。
 */
export function formatCalendarDateRange(
  start: DateLike,
  end: DateLike,
): string {
  const from = formatCalendarDate(start);
  const to = formatCalendarDate(end);
  if (from === "时间未知" || to === "时间未知") return "周期未知";
  return from === to ? from : `${from} 至 ${to}`;
}
