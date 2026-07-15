// process/evolution-guards.mjs — 进化引擎防腐三守卫 + 账本解析 + 度量(纯函数,便于单测)。
// reconcile --consolidate 时调用,findings 一律 WARN(绝不 ERROR);console 的 [calibration] 由 calibrationOn 门控。
import { readFileSync, existsSync } from 'node:fs';

const DAY = 86400000;
const ageDays = (iso, now) => (now - new Date(iso)) / DAY;

export function neverFiredFindings(lessons, stats, now, staleDays) {
  const out = [];
  for (const L of lessons) {
    if (L.status !== 'rule') continue;
    const s = stats[L.led] ?? {};
    if (s.deterrence || L.deterrence) continue;           // deterrence 豁免(理想终态永不 fire)
    if ((s.fireCount ?? 0) !== 0) continue;
    if (!s.registeredAt || ageDays(s.registeredAt, now) <= staleDays) continue;
    out.push({ level: 'WARN', m: `lesson ${L.led}: active rule 已 ${Math.floor(ageDays(s.registeredAt, now))} 天 fireCount=0 且非 deterrence — 候选剪枝(WARN,不删)。` });
  }
  return out;
}

export function selfRefFindings(ledgerRules, lessonsCfg) {
  const wired = new Set(lessonsCfg.map((l) => l.led));
  const out = [];
  for (const r of ledgerRules) {
    if (r.status !== 'rule' || !r.check || r.check === 'manual') continue;
    if (!wired.has(r.id)) out.push({ level: 'WARN', m: `lesson ${r.id}: 漂移 — Status=rule 写进账本却忘接 lessons[](reconcile.config.json)。` });
  }
  return out;
}

export function quarantineFindings(rules, threshold, calibrationOn) {
  const out = [];
  for (const r of rules) {
    if ((r.falsePositives ?? 0) < threshold) continue;
    if (calibrationOn) { console.log(`[calibration] would quarantine ${r.led}(误报 ${r.falsePositives}≥${threshold})`); continue; }
    out.push({ level: 'WARN', m: `lesson ${r.led}: 误报 ${r.falsePositives}≥${threshold} — 提议 quarantine(可逆静音,WARN)。` });
  }
  return out;
}

// 度量(T5):只 repeat-failure-rate / guard-hit-rate 有真分母;无分母标 calibrating,不刷 0/N/A。
export function computeMetrics({ stats, activeRules, thisRunFired, totalRuns }) {
  const firedEver = Object.values(stats).filter((s) => (s.fireCount ?? 0) > 0).length;
  const denomR = totalRuns > 0 ? totalRuns : 0;
  const denomG = activeRules.length;
  return {
    repeatFailureRate: denomR ? `${firedEver}/${denomR}` : `calibrating ${firedEver}/0`,
    guardHitRate: denomG ? `${thisRunFired.length}/${denomG}` : `calibrating ${thisRunFired.length}/0`,
  };
}

// LESSON_LEDGER.md 解析:抽 `## LED-NNN` 块的 Status + GuardCheck(与 orphan-scan markdown 行解析同构)。
export function parseLedgerRules(path) {
  if (!path || !existsSync(path)) return [];
  return parseLedgerRules.fromString(readFileSync(path, 'utf8'));
}
parseLedgerRules.fromString = (md) => {
  const out = [];
  for (const b of md.split(/^## /m).slice(1)) {
    const id = (b.match(/^(LED-\d+)/) || [])[1];
    if (!id) continue;
    const status = (b.match(/\*\*Status\*\*:\s*([\w-]+)/) || [])[1] ?? null;
    const cm = b.match(/\*\*GuardCheck\*\*:\s*`([^`]+)`/);
    const check = cm ? cm[1] : (/\*\*GuardCheck\*\*:\s*manual/i.test(b) ? 'manual' : null);
    out.push({ id, status, check });
  }
  return out;
};

// 接缝 emit(T8):RUN_EVENTS 事件 → 冻结的 reuse-candidate/v1(KIND_MAP 显式映射,不混用)。
const KIND_MAP = { reuse_candidate: 'asset', pattern_new: 'pattern', lesson_promoted: 'lesson' };

export function buildReuseCandidate(ev, { project, seq }) {
  return {
    schema: 'reuse-candidate/v1',
    id: `${ev.runId}-${seq}`,
    kind: KIND_MAP[ev.kind] ?? 'asset',
    description: ev.description,
    evidence: { command: ev.evidence.command, ...(ev.evidence.test && { test: ev.evidence.test }), ...(ev.evidence.commit && { commit: ev.evidence.commit }) },
    provenance: { runId: ev.runId, project, stage: ev.stage, originRef: ev.led ?? ev.evidence.commit ?? ev.stage },
    suggested_scope: ev.suggested_scope ?? (ev.stage === 'gen' || ev.kind === 'lesson_promoted' ? 'gen' : 'prj'),
  };
}

export function emitDeadLetterWarn({ outboxLines, consumedMarker, rounds }) {
  if (outboxLines > 0 && consumedMarker === 0 && rounds >= 5)
    return { level: 'WARN', m: `REUSE_OUTBOX 已 ${outboxLines} 行、连续 ${rounds} 轮②零采纳 — 接缝可能断了(单向 emit 无回执时的 dead-letter 观测)。` };
  return null;
}
