// [T-212d] 防茧房校准 —— 反过拟合护栏(纯函数,SPEC 2026-07-11 §2.4)。
//
// 这是本任务的**精华**:一套让「AI 别越学越窄(信息茧房)」的成套机制。用户淘汰选题写原因 →
// 蒸馏成偏好信号 → 喂进选题评分。若不加护栏,评分会被少数偏好过拟合、把选题池收窄。四条护栏:
//
//   ① 权重 ±10 封顶       —— clampPreferenceWeight:单条偏好对评分的影响有上限,不让某条偏好独大。
//   ② ≥3 例才升级为硬偏好  —— isHardPreference:单次淘汰只「记」不「改规则」;累计 3 例才注入评分。
//   ③ 8 周衰减 + 过期归档   —— decayedWeight / isArchivable:旧偏好按时间线性衰减到 0,过期归档。
//   ④ 探索位              —— rankWithExploration:排序时保留 N 个**不受偏好压制**的探索候选,
//                            防高分选题(合偏好的)挤占全部,给「偏离偏好但本身不差」的题留活路。
//
// 全部**纯函数**(无 Date.now / Math.random / IO),可逐条单测。service 读库后调它们算调整量与排序。

/** 单条偏好对选题评分的**影响上限**(±10 封顶,护栏①)。 */
export const PREFERENCE_WEIGHT_CAP = 10;

/** 升级为「硬偏好」(注入评分)所需的最少支持淘汰原因数(≥3 才升级,护栏②)。 */
export const MIN_EXAMPLES_FOR_HARD = 3;

/** 偏好衰减周期:满 8 周衰减到 0 并可归档(护栏③)。 */
export const PREFERENCE_DECAY_WEEKS = 8;

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * 护栏① 权重 ±10 封顶:把蒸馏/累计出的原始权重四舍五入并夹到 [-10, 10]。
 * 正=prefer(抬分)、负=avoid(压分)。NaN/非有限 → 0(诚实降级,不注入)。
 */
export function clampPreferenceWeight(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  const rounded = Math.round(raw);
  return Math.max(-PREFERENCE_WEIGHT_CAP, Math.min(PREFERENCE_WEIGHT_CAP, rounded));
}

/**
 * 护栏② ≥3 例才升级:支持这条偏好的淘汰原因数 ≥ 3 才算「硬偏好」(可注入评分)。
 * 单次淘汰(count=1)只记录、不改评分规则 —— 防单次情绪把选题池带偏。
 */
export function isHardPreference(exampleCount: number): boolean {
  return exampleCount >= MIN_EXAMPLES_FOR_HARD;
}

/** 两个 ISO 时间之间的周数(from → to;to 早于 from 记 0,不出现负龄)。纯函数。 */
export function weeksBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  const weeks = (to - from) / MS_PER_WEEK;
  return weeks > 0 ? weeks : 0;
}

/**
 * 护栏③ 8 周线性衰减:偏好越久没被强化,权重越小,满 8 周归 0。
 *   ageWeeks=0 → 原值;ageWeeks≥8 → 0;中间线性(如 4 周 → 半衰)。
 * 返回**已按护栏①再封顶**的整数(衰减不会放大,但保证注入端一致夹紧)。
 */
export function decayedWeight(weight: number, ageWeeks: number): number {
  if (ageWeeks >= PREFERENCE_DECAY_WEEKS) return 0;
  const factor = (PREFERENCE_DECAY_WEEKS - ageWeeks) / PREFERENCE_DECAY_WEEKS;
  return clampPreferenceWeight(weight * factor);
}

/** 护栏③ 归档判定:偏好自上次强化起满 8 周 → 应归档(status=archived,不再注入评分)。 */
export function isArchivable(ageWeeks: number): boolean {
  return ageWeeks >= PREFERENCE_DECAY_WEEKS;
}

/** 一条已升级(active)的硬偏好的最小视图(护栏计算只需这些字段)。 */
export interface ActivePreference {
  keyword: string;
  direction: "avoid" | "prefer";
  weight: number; // 已 ±10 封顶的基准权重
  exampleCount: number; // 支持的淘汰原因数
  lastReinforcedAt: string; // 8 周衰减的时间锚
}

/**
 * 单条候选选题的**偏好调整量**(注入评分用,与 positioningFit 并列)。对每条**硬偏好**
 * (≥3 例且未过期),若其 keyword 命中候选的标题/角度文本,则累加其**衰减后**的带符号权重:
 *   prefer → +decayedWeight;avoid → -decayedWeight。
 * 最终把**总调整量再夹到 ±10**(护栏①的总量兜底:防多条偏好叠加后仍能独大压垮 positioningFit)。
 * 非硬偏好 / 已过期(衰减为 0)/ 未命中 → 不贡献。纯函数(now 由调用方注入)。
 */
export function computePreferenceAdjustment(
  subjectText: string,
  preferences: readonly ActivePreference[],
  nowIso: string,
): number {
  const haystack = subjectText.toLowerCase();
  let sum = 0;
  for (const p of preferences) {
    // 护栏②:非硬偏好绝不注入(即便调用方误传 candidate 态)。
    if (!isHardPreference(p.exampleCount)) continue;
    const kw = p.keyword.trim().toLowerCase();
    if (kw.length === 0 || !haystack.includes(kw)) continue;
    // 护栏③:按龄衰减;过期(≥8 周)→ 0,不贡献。
    const w = decayedWeight(p.weight, weeksBetween(p.lastReinforcedAt, nowIso));
    if (w === 0) continue;
    sum += p.direction === "avoid" ? -Math.abs(w) : Math.abs(w);
  }
  // 护栏①(总量兜底):整体调整量也夹到 ±10。
  return clampPreferenceWeight(sum);
}

/** 参与排序的候选:baseScore=偏好前的分(如 positioningFit),adjustedScore=注入偏好后的分。 */
export interface ScoredCandidate {
  id: string;
  baseScore: number; // 偏好注入前(positioningFit 等),null 视作 0
  adjustedScore: number; // 偏好注入后(baseScore + 偏好调整量,夹 0–100)
}

export interface RankOptions {
  limit: number; // 返回条数上限
  explorationSlots: number; // 护栏④:保留给「探索」的名额(不受偏好压制)
}

/**
 * 护栏④ 探索位:防「合偏好的高分选题」挤占全部输出。做法 ——
 *   1. 先按 adjustedScore(注入偏好后)降序,取前 (limit - explorationSlots) 条为「利用位」;
 *   2. 再从**剩余**候选里,按 baseScore(**偏好注入前**的原始分)降序,补 explorationSlots 条为
 *      「探索位」—— 这些是「本身不差、但被偏好压下去」的题,给它们保留出场机会,打破茧房。
 * explorationSlots ≤ 0 → 退化为纯 adjustedScore 排序。limit ≥ 总数 → 全出(但仍按此双段拼接)。
 * 纯函数、稳定:同输入同输出(并列分用 id 兜底稳定序)。
 */
export function rankWithExploration<T extends ScoredCandidate>(
  scored: readonly T[],
  opts: RankOptions,
): T[] {
  const limit = Math.max(0, opts.limit);
  const slots = Math.max(0, opts.explorationSlots);
  if (limit === 0) return [];

  const byAdjusted = [...scored].sort(
    (a, b) => b.adjustedScore - a.adjustedScore || a.id.localeCompare(b.id),
  );
  // slots<=0 或名额吃满 limit → 纯利用位排序。
  const exploitCount = Math.max(0, limit - slots);
  const exploit = byAdjusted.slice(0, exploitCount);
  if (slots === 0) return exploit;

  const chosen = new Set(exploit.map((c) => c.id));
  // 探索位:剩余候选按**原始 baseScore** 降序补位(命中偏好压制前的真实潜力)。
  const explore = [...scored]
    .filter((c) => !chosen.has(c.id))
    .sort((a, b) => b.baseScore - a.baseScore || a.id.localeCompare(b.id))
    .slice(0, Math.min(slots, limit - exploit.length));

  return [...exploit, ...explore];
}
