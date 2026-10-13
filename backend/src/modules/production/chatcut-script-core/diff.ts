/** 来源：19-code mapPlannedToOriginals / computeSourceOverlap（原块见reference/19）。
 * 适配：Ms改为Tick，assignment身份仍按原算法；显式ID的归属由调用方验证。
 * SEMANTIC_BOUNDARY_ALLOW: 同媒体同类型源区间交集只延续原元素身份，不选择创作内容。
 */
export interface OriginalItem { id: string; assetId: string; type: string; fromTick: number; sourceStartTick: number; sourceEndTick: number }
export interface PlannedItem { preservedItemId: string | null; assetId: string; itemType: string; sourceStartTick: number; sourceEndTick: number; fromTick: number; durationTick: number }
export type Assignment = { kind: 'update'; originalId: string } | { kind: 'clone'; fromOriginalId: string } | { kind: 'fresh' };
export function computeSourceOverlap(planned: PlannedItem, original: OriginalItem): number {
  return Math.max(0, Math.min(original.sourceEndTick, planned.sourceEndTick) - Math.max(original.sourceStartTick, planned.sourceStartTick));
}
export function mapPlannedToOriginals(planned: PlannedItem[], originals: OriginalItem[]) {
  const sortedOriginals = [...originals].sort((a, b) => a.fromTick - b.fromTick || a.id.localeCompare(b.id));
  const taken = new Set<string>(), assignments = new Map<number, Assignment>();
  const originalById = new Map(sortedOriginals.map(o => [o.id, o]));
  for (let index = 0; index < planned.length; index++) {
    const p = planned[index]!;
    if (p.preservedItemId === null || taken.has(p.preservedItemId) || !originalById.has(p.preservedItemId)) continue;
    assignments.set(index, { kind: 'update', originalId: p.preservedItemId }); taken.add(p.preservedItemId);
  }
  const ancestorByPlanned = new Map<number, string>();
  for (let index = 0; index < planned.length; index++) {
    if (assignments.has(index)) continue;
    const p = planned[index]!; let bestOverlap = 0, bestId: string | null = null;
    for (const o of sortedOriginals) {
      if (o.assetId !== p.assetId || o.type !== p.itemType) continue;
      const overlap = computeSourceOverlap(p, o);
      if (overlap > bestOverlap) { bestOverlap = overlap; bestId = o.id; }
    }
    if (bestId !== null) ancestorByPlanned.set(index, bestId);
  }
  const claimantsByOriginal = new Map<string, number[]>();
  for (const [index, originalId] of ancestorByPlanned) {
    const bucket = claimantsByOriginal.get(originalId);
    if (bucket) bucket.push(index); else claimantsByOriginal.set(originalId, [index]);
  }
  for (const [originalId, claimants] of claimantsByOriginal) {
    if (taken.has(originalId)) {
      for (const index of claimants) assignments.set(index, { kind: 'clone', fromOriginalId: originalId });
      continue;
    }
    const original = originalById.get(originalId)!;
    let winner = claimants[0]!, overlap = computeSourceOverlap(planned[winner]!, original);
    for (const index of claimants.slice(1)) {
      const candidate = computeSourceOverlap(planned[index]!, original);
      if (candidate > overlap) { winner = index; overlap = candidate; }
    }
    assignments.set(winner, { kind: 'update', originalId }); taken.add(originalId);
    for (const index of claimants) if (index !== winner) assignments.set(index, { kind: 'clone', fromOriginalId: originalId });
  }
  for (let index = 0; index < planned.length; index++) if (!assignments.has(index)) assignments.set(index, { kind: 'fresh' });
  return { assignments, deletedIds: new Set(sortedOriginals.filter(o => !taken.has(o.id)).map(o => o.id)) };
}
