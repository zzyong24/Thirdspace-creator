// [T-421] 生成本仓提交活动图(GitHub 风格每日热力图 + 近 30 天每日柱状图)。
// 私有仓第三方嵌入(Repobeats/shields 动态徽章)全取不到数据,故自托管:
// CI 每日跑本脚本 → 产出 docs/assets/commit-activity{,-dark}.svg → README <picture> 引用。
//
// 约定:
// - 零 npm 依赖,直接 git log 统计;每条提交按其自身记录的时区偏移归桶(--date=short 默认,
//   GitHub contribution graph 同款逻辑)——本仓历史横跨 +0800/-0700 两时区,硬编码任一都会错位。
// - "今天"/footer 时间用最近一次提交的时区偏移折算(CI 是 UTC,不折算则"今日"错位)。
// - 排除 github-actions[bot] 自身的图表更新提交,不污染数据。
// - 深浅两套 SVG 分别生成(GitHub README 背景 #ffffff / #0d1117,level-0 格子色须贴各自背景)。
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = join(repoRoot, "docs", "assets");
const DAY = 86_400_000;

// ---------- 统计 ----------
const git = (cmd) =>
  execSync(cmd, { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024, encoding: "utf8" });
const raw = git("git log --pretty=%ad%x09%an --date=short");

const counts = new Map(); // YYYY-MM-DD -> 提交数
for (const line of raw.split("\n")) {
  if (!line) continue;
  const [date, author] = line.split("\t");
  if (author === "github-actions[bot]") continue;
  counts.set(date, (counts.get(date) ?? 0) + 1);
}

const toUTC = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromUTC = (ms) => new Date(ms).toISOString().slice(0, 10);

// 展示时区 = 最近一条「非 bot」提交的时区偏移(±HHMM),"今天"按它折算
// (bot 自己的图表提交是 runner 的 UTC,取它会让展示时区退化成 UTC+0)
const lastOffset =
  git("git log -50 --pretty=%ad%x09%an --date=raw")
    .split("\n")
    .find((l) => l && !l.endsWith("\tgithub-actions[bot]"))
    ?.split("\t")[0]
    .split(" ")[1] ?? "+0000";
const offsetMin =
  (lastOffset[0] === "-" ? -1 : 1) *
  (Number(lastOffset.slice(1, 3)) * 60 + Number(lastOffset.slice(3, 5)));
const nowShifted = new Date(Date.now() + offsetMin * 60_000);
const today = nowShifted.toISOString().slice(0, 10);
const todayMs = toUTC(today);

const total = [...counts.values()].reduce((a, b) => a + b, 0);
let last30 = 0;
for (let i = 0; i < 30; i++) last30 += counts.get(fromUTC(todayMs - i * DAY)) ?? 0;
const todayCount = counts.get(today) ?? 0;

// 最长连续提交天数
let longestStreak = 0;
for (const d of counts.keys()) {
  const ms = toUTC(d);
  if (counts.has(fromUTC(ms - DAY))) continue; // 只从连击起点数
  let len = 0;
  while (counts.has(fromUTC(ms + len * DAY))) len++;
  if (len > longestStreak) longestStreak = len;
}

// 热力图分级:非零值按 25/50/75 分位切 4 级(GitHub 同款自适应)
const nonzero = [...counts.values()].sort((a, b) => a - b);
const q = (p) => nonzero[Math.floor(p * (nonzero.length - 1))] ?? 1;
const [t1, t2, t3] = [q(0.25), q(0.5), q(0.75)];
const levelOf = (v) => (v === 0 ? 0 : v <= t1 ? 1 : v <= t2 ? 2 : v <= t3 ? 3 : 4);

// 53 列(周),列首为周日;最后一列截止今天
const startMs = todayMs - (52 * 7 + new Date(todayMs).getUTCDay()) * DAY;

const pad2 = (n) => String(n).padStart(2, "0");
const genAt = `${today} ${pad2(nowShifted.getUTCHours())}:${pad2(nowShifted.getUTCMinutes())}`;
const tzLabel = `UTC${lastOffset[0]}${Number(lastOffset.slice(1, 3))}${
  lastOffset.slice(3, 5) === "00" ? "" : ":" + lastOffset.slice(3, 5)}`;

// ---------- 渲染 ----------
const THEMES = {
  light: {
    file: "commit-activity.svg",
    ink: "#1f2328", muted: "#59636e", faint: "#818b98",
    levels: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
    bar: "#2da44e", axis: "#d1d9e0",
  },
  dark: {
    file: "commit-activity-dark.svg",
    ink: "#e6edf3", muted: "#9198a1", faint: "#767e87",
    levels: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
    bar: "#3fb950", axis: "#3d444d",
  },
};

const W = 900;
const FONT = `-apple-system,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

function render(t) {
  const p = [];
  p.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="412" viewBox="0 0 ${W} 412" role="img" aria-label="CreatorOS 提交活动">`);
  p.push(`<g font-family="${FONT}">`);

  // 统计行
  const stats = [
    [total, "总提交"], [last30, "近 30 天"], [todayCount, "今日"], [longestStreak, "最长连续(天)"],
  ];
  stats.forEach(([num, label], i) => {
    const x = 32 + i * 170;
    p.push(`<text x="${x}" y="40" font-size="26" font-weight="700" fill="${t.ink}">${num}</text>`);
    p.push(`<text x="${x}" y="60" font-size="12" fill="${t.muted}">${esc(label)}</text>`);
  });

  // 热力图:x 起 32,cell 12 + gap 3;月标签 y=92,格子 y 起 100
  const CELL = 12, STEP = 15, HX = 32, HY = 100;
  let prevMonth = -1;
  for (let c = 0; c < 53; c++) {
    const colStart = new Date(startMs + c * 7 * DAY);
    const m = colStart.getUTCMonth();
    if (m !== prevMonth) {
      // 首列如果该月只露出不到 2 周,跳过标签防与下月标签挤撞
      const roomy = c < 51 || m === new Date(startMs + 52 * 7 * DAY).getUTCMonth();
      if (c === 0 ? new Date(startMs + 7 * DAY).getUTCMonth() === m : roomy) {
        p.push(`<text x="${HX + c * STEP}" y="92" font-size="11" fill="${t.muted}">${m + 1}月</text>`);
      }
      prevMonth = m;
    }
    for (let r = 0; r < 7; r++) {
      const ms = startMs + (c * 7 + r) * DAY;
      if (ms > todayMs) break;
      const v = counts.get(fromUTC(ms)) ?? 0;
      p.push(`<rect x="${HX + c * STEP}" y="${HY + r * STEP}" width="${CELL}" height="${CELL}" rx="2" fill="${t.levels[levelOf(v)]}"/>`);
    }
  }
  // 周标签(周一/三/五行)
  [[1, "一"], [3, "三"], [5, "五"]].forEach(([r, label]) => {
    p.push(`<text x="${HX - 6}" y="${HY + r * STEP + 10}" font-size="10" fill="${t.faint}" text-anchor="end">${label}</text>`);
  });
  // 图例
  const LX = W - 32 - 5 * STEP - 44;
  p.push(`<text x="${LX - 6}" y="${HY + 7 * STEP + 16}" font-size="11" fill="${t.muted}" text-anchor="end">少</text>`);
  t.levels.forEach((color, i) => {
    p.push(`<rect x="${LX + i * STEP}" y="${HY + 7 * STEP + 6}" width="${CELL}" height="${CELL}" rx="2" fill="${color}"/>`);
  });
  p.push(`<text x="${LX + 5 * STEP + 4}" y="${HY + 7 * STEP + 16}" font-size="11" fill="${t.muted}">多</text>`);

  // 近 30 天柱状图
  const BY = 282, BH = 72, BASE = BY + BH; // 柱区顶/高/基线
  p.push(`<text x="32" y="262" font-size="13" font-weight="600" fill="${t.ink}">近 30 天每日提交</text>`);
  const bars = [];
  for (let i = 29; i >= 0; i--) bars.push(counts.get(fromUTC(todayMs - i * DAY)) ?? 0);
  const maxBar = Math.max(...bars, 1);
  const BSTEP = (W - 64) / 30, BW = 18;
  bars.forEach((v, i) => {
    const x = 32 + i * BSTEP + (BSTEP - BW) / 2;
    const h = v === 0 ? 0 : Math.max(3, (v / maxBar) * BH);
    if (v > 0) {
      p.push(`<path d="M${x} ${BASE} v${-(h - 2)} q0 -2 2 -2 h${BW - 4} q2 0 2 2 v${h - 2} z" fill="${t.bar}"/>`);
      p.push(`<text x="${x + BW / 2}" y="${BASE - h - 4}" font-size="9" fill="${t.muted}" text-anchor="middle">${v}</text>`);
    }
    if (i % 5 === 0 || i === 29) {
      const d = new Date(todayMs - (29 - i) * DAY);
      p.push(`<text x="${x + BW / 2}" y="${BASE + 16}" font-size="9" fill="${t.faint}" text-anchor="middle">${d.getUTCMonth() + 1}/${d.getUTCDate()}</text>`);
    }
  });
  p.push(`<line x1="32" y1="${BASE}" x2="${W - 32}" y2="${BASE}" stroke="${t.axis}" stroke-width="1"/>`);

  // footer
  p.push(`<text x="${W - 32}" y="404" font-size="10" fill="${t.faint}" text-anchor="end">更新于 ${esc(genAt)} (${esc(tzLabel)}) · CI 每日自动生成</text>`);
  p.push(`</g></svg>`);
  return p.join("\n");
}

mkdirSync(outDir, { recursive: true });
for (const t of Object.values(THEMES)) writeFileSync(join(outDir, t.file), render(t), "utf8");
console.log(`[commit-activity] 总提交 ${total} · 近30天 ${last30} · 今日 ${todayCount} · 最长连续 ${longestStreak} 天 → docs/assets/commit-activity{,-dark}.svg`);
