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
    const title = (b.match(/^LED-\d+\s*[—-]\s*([^\n]+)/) || [])[1]?.trim() ?? null;
    const date = (b.match(/\*\*Date\*\*:\s*(\d{4}-\d{2}-\d{2})/) || [])[1] ?? null;
    const stage = (b.match(/\*\*Stage\*\*:\s*([^·\n]+)/) || [])[1]?.trim() ?? null;
    const severity = (b.match(/\*\*Severity\*\*:\s*([\w-]+)/) || [])[1] ?? null;
    const status = (b.match(/\*\*Status\*\*:\s*([\w-]+)/) || [])[1] ?? null;
    const cm = b.match(/\*\*GuardCheck\*\*:\s*`([^`]+)`/);
    const check = cm ? cm[1] : (/\*\*GuardCheck\*\*:\s*manual/i.test(b) ? 'manual' : null);
    const whatFailed = (b.match(/\*\*WhatFailed\*\*:\s*([^\n]+)/) || [])[1]?.trim() ?? null;
    const guardRule = (b.match(/\*\*GuardRule\*\*:\s*([^\n]+)/) || [])[1]?.trim() ?? null;
    const ref = (b.match(/\*\*Ref\*\*:\s*([^\n]+)/) || [])[1]?.trim() ?? null;
    out.push({ id, title, date, stage, severity, status, check, whatFailed, guardRule, ref });
  }
  return out;
};

const REUSE_EVENT_KINDS = new Set(['reuse_candidate', 'pattern_new', 'lesson_promoted']);

// 先对完整事件流分区、再统一归档。不能先 filter 后按 filter 长度归档原文件，
// 否则 eval_red 排在前面时会归档错行，并让真正的 reuse 事件下轮重复消费。
export function partitionEvolutionEvents(events) {
  const lessonEvents = [];
  const reuseEvents = [];
  const ignoredEvents = [];
  for (const event of events) {
    if (event?.kind === 'eval_red') lessonEvents.push(event);
    else if (REUSE_EVENT_KINDS.has(event?.kind)) reuseEvents.push(event);
    else ignoredEvents.push(event);
  }
  return { lessonEvents, reuseEvents, ignoredEvents, consumedCount: events.length };
}

// 自动采集只落 observation 收件箱，不改 LESSON_LEDGER，更不会直接变成 rule。
// 这保证失败不丢，同时保留 lessons-injection-gate 的人工确认边界。
export function buildLessonObservation(event, { project }) {
  const runId = event.runId ?? 'unknown-run';
  const stage = event.stage ?? 'unknown-stage';
  return {
    schema: 'lesson-observation/v1',
    id: `${runId}:${stage}`,
    lifecycle: 'observation',
    project: project ?? 'unknown',
    stage,
    detail: event.detail ?? event.description ?? '未提供失败详情',
    evidence: {
      command: event.evidence?.command ?? 'manual-review',
      ...(event.evidence?.test && { test: event.evidence.test }),
      ...(event.evidence?.commit && { commit: event.evidence.commit }),
    },
    provenance: { runId, source: 'RUN_EVENTS.eval_red' },
  };
}

const CURRENT_LIFECYCLES = new Set(['observation', 'candidate', 'rule', 'quarantined', 'deprecated', 'retracted']);
const executableGuard = (lesson, configById) => {
  const configured = configById.get(lesson.id);
  return Boolean(
    lesson.check && lesson.check !== 'manual' &&
    configured?.check && configured.check !== 'manual' &&
    configured.check === lesson.check,
  );
};

// 把项目旧模板(active/promoted)与当前 candidate/rule 生命周期漂移变成可见诊断。
// 这里只报告，不自动洗白为 rule；迁移仍需 lessons-injection-gate 的红证据与确认。
export function lessonLifecycleFindings(ledgerEntries, lessonsCfg) {
  const out = [];
  const configById = new Map((lessonsCfg ?? []).map((item) => [item.led, item]));
  const ledgerIds = new Set(ledgerEntries.map((item) => item.id));
  for (const lesson of ledgerEntries) {
    if (CURRENT_LIFECYCLES.has(lesson.status)) continue;
    if (lesson.status === 'active' || lesson.status === 'promoted') {
      out.push({
        level: 'WARN',
        code: 'legacy_lifecycle',
        led: lesson.id,
        m: `lesson ${lesson.id}: 旧生命周期 Status=${lesson.status}；${executableGuard(lesson, configById) ? '已有同 ID 可执行守卫，可作为 legacy rule 检索，但仍需补晋升证据并迁移。' : '未找到同 ID 可执行守卫，只能作为待整理记录，禁止注入。'}`,
      });
    } else {
      out.push({ level: 'WARN', code: 'unknown_lifecycle', led: lesson.id, m: `lesson ${lesson.id}: 未知 Status=${lesson.status ?? '(missing)'}，不会进入检索窗口。` });
    }
  }
  for (const configured of lessonsCfg ?? []) {
    if (!ledgerIds.has(configured.led)) {
      out.push({ level: 'WARN', code: 'guard_without_ledger', led: configured.led, m: `lesson ${configured.led}: reconcile.config.json 有守卫，但 LESSON_LEDGER.md 无对应记录。` });
    }
  }
  return out;
}

const severityRank = (value) => ({ critical: 4, high: 3, medium: 2, low: 1 }[String(value).toLowerCase()] ?? 0);
const stageMatches = (lessonStage, requestedStage) => {
  if (!requestedStage || !lessonStage) return true;
  const lesson = lessonStage.toLowerCase();
  const requested = requestedStage.toLowerCase();
  if (lesson.includes('gen') || lesson.includes('通用')) return true;
  return lesson.includes(requested) || requested.includes(lesson);
};

// 给 stage-router 一份确定性的候选窗口。标准 rule 必须已接守卫；legacy active 也只有
// 同 ID、同 GuardCheck 已接线时才兼容读取，避免旧项目经验静默失效或越权晋升。
export function selectInjectableLessons({ ledger, lessonsCfg, stage, limit = 7 }) {
  const configById = new Map((lessonsCfg ?? []).map((item) => [item.led, item]));
  return ledger
    .filter((lesson) => stageMatches(lesson.stage, stage))
    .map((lesson) => {
      if (lesson.status === 'candidate') return { ...lesson, effectiveLifecycle: 'candidate' };
      if (lesson.status === 'rule' && executableGuard(lesson, configById)) return { ...lesson, effectiveLifecycle: 'rule' };
      if ((lesson.status === 'active' || lesson.status === 'promoted') && executableGuard(lesson, configById)) {
        return { ...lesson, effectiveLifecycle: 'legacy-rule' };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || String(b.date ?? '').localeCompare(String(a.date ?? '')) || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit));
}

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
