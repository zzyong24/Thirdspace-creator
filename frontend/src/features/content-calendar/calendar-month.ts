/**
 * 月历纯数学(T-083a)。与 server/client 都无耦合:输入 "YYYY-MM" 字符串,
 * 输出格网/相邻月;Date.UTC 只做日历换算(给定输入输出固定),不是 wall-clock,
 * 满足 C-5 决定论。page(server)与 view(client)共用。
 */

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** 校验路由 month 参数;非法返回 null(调用方回退参考月)。 */
export function normalizeMonth(raw: string | undefined): string | null {
  return raw && MONTH_RE.test(raw) ? raw : null;
}

/** "YYYY-MM" 前后平移 delta 个月(纯字符串数学)。 */
export function shiftMonth(month: string, delta: number): string {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + delta;
  const y = year + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${y}-${String(mm + 1).padStart(2, "0")}`;
}

/** "YYYY-MM" → 下一个月。 */
export function nextMonthOf(month: string): string {
  return shiftMonth(month, 1);
}

/** "YYYY-MM" → 上一个月。 */
export function prevMonthOf(month: string): string {
  return shiftMonth(month, -1);
}

export interface DayCell {
  /** "YYYY-MM-DD" */
  readonly dateKey: string;
  /** 本月内的格(前后月补位格只占位,不渲内容)。 */
  readonly inMonth: boolean;
  /** 当月内的「日」数字,1..31。 */
  readonly dayOfMonth: number;
}

/** "YYYY-MM" → 周一起始的按周格网(4~6 行,前后月补位到整周)。 */
export function buildMonthGrid(month: string): DayCell[][] {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)); // 1-based
  const firstDow = new Date(Date.UTC(year, m - 1, 1)).getUTCDay(); // 0=周日
  const leading = (firstDow + 6) % 7; // 周一起始的前置补位数
  const daysInMonth = new Date(Date.UTC(year, m, 0)).getUTCDate();

  const cells: DayCell[] = [];
  // 前置补位(上月尾)
  for (let i = leading; i > 0; i -= 1) {
    const d = new Date(Date.UTC(year, m - 1, 1 - i));
    cells.push({
      dateKey: d.toISOString().slice(0, 10),
      inMonth: false,
      dayOfMonth: d.getUTCDate(),
    });
  }
  // 本月
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      dateKey: `${month}-${String(day).padStart(2, "0")}`,
      inMonth: true,
      dayOfMonth: day,
    });
  }
  // 后置补位(下月头)到整周
  let tail = 1;
  while (cells.length % 7 !== 0) {
    const d = new Date(Date.UTC(year, m, tail));
    cells.push({
      dateKey: d.toISOString().slice(0, 10),
      inMonth: false,
      dayOfMonth: d.getUTCDate(),
    });
    tail += 1;
  }

  const weeks: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}
