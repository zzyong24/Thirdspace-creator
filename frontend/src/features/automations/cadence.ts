/**
 * 友好频率 ⇄ cron 编译器(T-030-D7,SPEC §8.1「去裸 crontab」)。
 *
 * 普通用户看不懂 crontab —— 弹窗只暴露「周期 / 按间隔 / 单次」三段友好频率,cron 仅作
 * 内部实现落 `scheduled_job.schedule`(后端 node-cron 不变)。本文件是**纯函数**层,
 * 无 React / 无 I/O,可脱离组件单测:
 *
 *  - `compileCadenceToCron(cadence) → cronString`:友好频率 → 5 段 cron。
 *  - `compileCronToCadence(cron) → Cadence | null`:反解(编辑已有作业时把 cron 还原成
 *    友好频率;不可解则返回 null,由 UI 降级显示原值)。
 *
 * 支持三种 cadence:
 *  - period(周期):每天 / 每周(选周几)+ 时间 HH:mm。每天 09:00 → `0 9 * * *`;
 *    每周一 09:00 → `0 9 * * 1`。
 *  - interval(按间隔):每 N 小时 / 每 N 分钟。每 3 小时编译为 step-3 的小时字段;每 30 分
 *    编译为 step-30 的分钟字段(cron step 语法,见 compileCadenceToCron 实现)。
 *  - once(单次):日期 + 时间。cron 无「仅一次」语义 —— 用「具体到分/时/日/月」的近似,
 *    标注为一次性;调度器每年这天会再命中,故 UI 明确「近似为每年一次」。
 *
 * Determinism:全纯函数,输入定则输出定;无 Date.now / 无随机。
 */

// ── 类型 ──────────────────────────────────────────────────────────────────────

/** 周期频率:每天 or 每周某天,配一个 HH:mm 时刻。 */
export interface PeriodCadence {
  readonly mode: "period";
  /** daily=每天;weekly=每周(需 weekday)。 */
  readonly unit: "daily" | "weekly";
  /** weekly 时的周几,0=周日 … 6=周六(cron 周字段语义)。daily 时忽略。 */
  readonly weekday: number;
  /** 时(0–23)。 */
  readonly hour: number;
  /** 分(0–59)。 */
  readonly minute: number;
}

/** 间隔频率:每 N 小时 / 每 N 分钟。 */
export interface IntervalCadence {
  readonly mode: "interval";
  readonly unit: "hours" | "minutes";
  /** 间隔步长(≥1)。 */
  readonly every: number;
}

/** 单次频率:某月某日的 HH:mm(cron 近似,见文件头)。 */
export interface OnceCadence {
  readonly mode: "once";
  /** 月(1–12)。 */
  readonly month: number;
  /** 日(1–31)。 */
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

export type Cadence = PeriodCadence | IntervalCadence | OnceCadence;

// ── 缺省 ──────────────────────────────────────────────────────────────────────

/** 弹窗打开时的缺省频率:每天 09:00(与旧 `0 9 * * *` 等价,迁移体验一致)。 */
export const DEFAULT_CADENCE: PeriodCadence = {
  mode: "period",
  unit: "daily",
  weekday: 1, // 仅在切到「每周」时生效,默认周一
  hour: 9,
  minute: 0,
};

// 周几中文标签(0=周日 cron 语义)。UI 下拉复用。
export const WEEKDAY_LABELS: readonly string[] = [
  "周日",
  "周一",
  "周二",
  "周三",
  "周四",
  "周五",
  "周六",
];

// ── 校验/夹取(纯) ────────────────────────────────────────────────────────────

function clampInt(v: number, lo: number, hi: number): number {
  const n = Math.trunc(Number.isFinite(v) ? v : lo);
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

// ── 编译:cadence → cron ───────────────────────────────────────────────────────

/**
 * 友好频率 → 5 段 cron(分 时 日 月 周)。纯函数,越界值夹到合法域(防脏输入产非法 cron)。
 */
export function compileCadenceToCron(cadence: Cadence): string {
  switch (cadence.mode) {
    case "period": {
      const m = clampInt(cadence.minute, 0, 59);
      const h = clampInt(cadence.hour, 0, 23);
      if (cadence.unit === "weekly") {
        const wd = clampInt(cadence.weekday, 0, 6);
        return `${m} ${h} * * ${wd}`;
      }
      // daily
      return `${m} ${h} * * *`;
    }
    case "interval": {
      const every = clampInt(cadence.every, 1, cadence.unit === "hours" ? 23 : 59);
      if (cadence.unit === "hours") {
        // 每 N 小时:分固定 0,时用 */N。
        return `0 */${every} * * *`;
      }
      // 每 N 分钟:分用 */N。
      return `*/${every} * * * *`;
    }
    case "once": {
      const m = clampInt(cadence.minute, 0, 59);
      const h = clampInt(cadence.hour, 0, 23);
      const day = clampInt(cadence.day, 1, 31);
      const month = clampInt(cadence.month, 1, 12);
      // cron 无「仅一次」—— 近似为「每年这天这分」(mm hh dd MM *)。UI 标注为一次性/近似。
      return `${m} ${h} ${day} ${month} *`;
    }
  }
}

// ── 反解:cron → cadence(编辑已有作业) ────────────────────────────────────────

const RE_DAILY = /^(\d{1,2}) (\d{1,2}) \* \* \*$/; // 每天 HH:mm
const RE_WEEKLY = /^(\d{1,2}) (\d{1,2}) \* \* (\d)$/; // 每周某天 HH:mm
const RE_EVERY_HOURS = /^0 \*\/(\d{1,2}) \* \* \*$/; // 每 N 小时
const RE_EVERY_MINUTES = /^\*\/(\d{1,2}) \* \* \* \*$/; // 每 N 分钟
const RE_ONCE = /^(\d{1,2}) (\d{1,2}) (\d{1,2}) (\d{1,2}) \*$/; // 单次近似 mm hh dd MM *

/**
 * cron → 友好频率;仅识别本编译器产出的几种规范形。识别不了(手写复杂 cron / 旧数据)
 * 返回 null，调用方降级显示原 cron 文本。纯函数。
 */
export function compileCronToCadence(cron: string): Cadence | null {
  const s = cron.trim().replace(/\s+/g, " ");

  const daily = RE_DAILY.exec(s);
  if (daily) {
    const minute = Number(daily[1]);
    const hour = Number(daily[2]);
    if (inRange(minute, 0, 59) && inRange(hour, 0, 23)) {
      return { mode: "period", unit: "daily", weekday: 1, hour, minute };
    }
  }

  const weekly = RE_WEEKLY.exec(s);
  if (weekly) {
    const minute = Number(weekly[1]);
    const hour = Number(weekly[2]);
    const weekday = Number(weekly[3]);
    if (inRange(minute, 0, 59) && inRange(hour, 0, 23) && inRange(weekday, 0, 6)) {
      return { mode: "period", unit: "weekly", weekday, hour, minute };
    }
  }

  const everyH = RE_EVERY_HOURS.exec(s);
  if (everyH) {
    const every = Number(everyH[1]);
    if (inRange(every, 1, 23)) {
      return { mode: "interval", unit: "hours", every };
    }
  }

  const everyM = RE_EVERY_MINUTES.exec(s);
  if (everyM) {
    const every = Number(everyM[1]);
    if (inRange(every, 1, 59)) {
      return { mode: "interval", unit: "minutes", every };
    }
  }

  const once = RE_ONCE.exec(s);
  if (once) {
    const minute = Number(once[1]);
    const hour = Number(once[2]);
    const day = Number(once[3]);
    const month = Number(once[4]);
    if (
      inRange(minute, 0, 59) &&
      inRange(hour, 0, 23) &&
      inRange(day, 1, 31) &&
      inRange(month, 1, 12)
    ) {
      return { mode: "once", month, day, hour, minute };
    }
  }

  return null;
}

function inRange(v: number, lo: number, hi: number): boolean {
  return Number.isInteger(v) && v >= lo && v <= hi;
}

// ── 人类可读摘要(UI 辅助,可选用) ────────────────────────────────────────────

/** 把 cadence 渲染成一句中文说明(如「每天 09:00」),给弹窗即时预览。纯函数。 */
export function describeCadence(cadence: Cadence): string {
  const hhmm = (h: number, m: number) =>
    `${String(clampInt(h, 0, 23)).padStart(2, "0")}:${String(
      clampInt(m, 0, 59),
    ).padStart(2, "0")}`;
  switch (cadence.mode) {
    case "period":
      return cadence.unit === "daily"
        ? `每天 ${hhmm(cadence.hour, cadence.minute)}`
        : `每${WEEKDAY_LABELS[clampInt(cadence.weekday, 0, 6)]} ${hhmm(
            cadence.hour,
            cadence.minute,
          )}`;
    case "interval":
      return cadence.unit === "hours"
        ? `每 ${clampInt(cadence.every, 1, 23)} 小时`
        : `每 ${clampInt(cadence.every, 1, 59)} 分钟`;
    case "once":
      return `${clampInt(cadence.month, 1, 12)} 月 ${clampInt(
        cadence.day,
        1,
        31,
      )} 日 ${hhmm(cadence.hour, cadence.minute)}(近似为每年一次)`;
  }
}
