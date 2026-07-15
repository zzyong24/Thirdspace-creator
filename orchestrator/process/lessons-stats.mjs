// process/lessons-stats.mjs — 纯函数,无 IO,便于单测。reconcile.mjs import 之。
// 字段冻结:{fireCount, lastFiredAt, firstRedAt, registeredAt, deterrence}。
export function tallyLessonStats(prev, results, nowIso) {
  const stats = { ...prev };
  for (const r of results) {
    const s = stats[r.led] ?? { fireCount: 0, lastFiredAt: null, firstRedAt: null, registeredAt: nowIso, deterrence: false };
    s.registeredAt ??= nowIso;
    if (typeof r.deterrence === 'boolean') s.deterrence = r.deterrence;
    if (r.outcome === 'fire') {
      s.fireCount += 1;
      s.lastFiredAt = nowIso;
      s.firstRedAt ??= nowIso;
    }
    stats[r.led] = s;
  }
  return stats;
}
