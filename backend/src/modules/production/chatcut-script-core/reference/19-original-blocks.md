# 19 参考原代码块

来源：`/Users/zyongzhu/ThirdSpace/03-知识/ChatCut-架构分析/extracted/20261013_19-code_-_apply-diff-algorithm_模块（planned_vs_originals_决策）.md`

原文件SHA256：`af6f807aaaec416bd4871d0030eff29b70cd98072f64e69f88c0a8fc76378a6e`

以下TypeScript代码块逐字保留，包括原缺漏，不作为运行时模块加载。

```ts
// apply-diff-algorithm/types.ts

export interface OriginalItem {
  id: string;
  assetId: string;
  type: string;  // "video" | "audio" | "image" | "gif" | "svg" | "motion-graphic" | "effect" | "transition"
  fromMs: number;
  sourceStartMs: number;
  sourceEndMs: number;
}

export interface PlannedItem {
  /** 显式指定要 preserve 的原 item id (从 markdown 解析时填) */
  preservedItemId: string | null;
  assetId: string;
  itemType: string;
  sourceStartMs: number;
  sourceEndMs: number;
  fromFrame: number;
  durationFrames: number;
}

export type Assignment =
  | { kind: "update"; originalId: string }
  | { kind: "clone"; fromOriginalId: string }
  | { kind: "fresh" };

export interface DiffResult {
  /** planned index → assignment */
  assignments: Map<number, Assignment>;
  /** original ids that were not re-emitted (should be deleted) */
  deletedIds: Set<string>;
}
```

```ts
// apply-diff-algorithm/diff.ts
import type { OriginalItem, PlannedItem, DiffResult, Assignment } from "./types";

/**
 * Decide for each planned item: update an existing one, clone from existing, or add fresh.
 *
 * Strategy:
 * 1. If `preservedItemId` is set and exists in originals → update
 * 2. Find best-match original by (assetId, type, source overlap)
 *    - if multiple planned items want the same original → winner by overlap, others clone
 * 3. If no good match → fresh add
 * 4. Originals not assigned to any planned → delete
 */
export function mapPlannedToOriginals(
  planned: PlannedItem[],
  originals: OriginalItem[],
): DiffResult {
  const sortedOriginals = [...originals].sort(
    (a, b) => a.fromMs - b.fromMs || a.id.localeCompare(b.id)
  );
  const taken = new Set<string>();
  const assignments = new Map<number, Assignment>();
  const originalById = new Map<string, OriginalItem>();
  for (const o of sortedOriginals) originalById.set(o.id, o);

  // Pass 1: explicit preserved IDs (markdown 显式锚定)
  for (let plannedIdx = 0; plannedIdx < planned.length; plannedIdx++) {
    const p = planned[plannedIdx]!;
    if (p.preservedItemId === null) continue;
    if (taken.has(p.preservedItemId)) continue;
    if (!originalById.has(p.preservedItemId)) continue;
    assignments.set(plannedIdx, { kind: "update", originalId: p.preservedItemId });
    taken.add(p.preservedItemId);
  }

  // Pass 2: find best ancestor for each unplanned planned item
  const ancestorByPlanned = new Map<number, string>();
  for (let plannedIdx = 0; plannedIdx < planned.length; plannedIdx++) {
    if (assignments.has(plannedIdx)) continue;
    const p = planned[plannedIdx]!;
    let bestOverlap = 0;
    let bestId: string | null = null;
    for (const o of sortedOriginals) {
      if (o.assetId !== p.assetId) continue;
      if (o.type !== p.itemType) continue;
      const overlap = computeSourceOverlap(p, o);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestId = o.id;
      }
    }
    if (bestId !== null) ancestorByPlanned.set(plannedIdx, bestId);
  }

  // Pass 3: resolve conflicts (multiple planned → same ancestor)
  const claimantsByOriginal = new Map<string, number[]>();
  for (const [plannedIdx, originalId] of ancestorByPlanned) {
    const bucket = claimantsByOriginal.get(originalId);
    if (bucket) bucket.push(plannedIdx);
    else claimantsByOriginal.set(originalId, [plannedIdx]);
  }

  for (const [originalId, claimants] of claimantsByOriginal) {
    if (taken.has(originalId)) {
      // Already taken by explicit preserve → all claimants become clones
      for (const plannedIdx of claimants) {
        assignments.set(plannedIdx, { kind: "clone", fromOriginalId: originalId });
      }
      continue;
    }
    // Pick the winner by max overlap
    const original = originalById.get(originalId)!;
    let winnerPlannedIdx = claimants[0]!;
    let winnerOverlap = computeSourceOverlap(planned[winnerPlannedIdx]!, original);
    for (const candidatePlannedIdx of claimants.slice(1)) {
      const overlap = computeSourceOverlap(planned[candidatePlannedIdx]!, original);
      if (overlap > winnerOverlap) {
        winnerPlannedIdx = candidatePlannedIdx;
        winnerOverlap = overlap;
      }
    }
    assignments.set(winnerPlannedIdx, { kind: "update", originalId });
    taken.add(originalId);
    for (const plannedIdx of claimants) {
      if (plannedIdx === winnerPlannedIdx) continue;
      assignments.set(plannedIdx, { kind: "clone", fromOriginalId: originalId });
    }
  }

  // Pass 4: any planned without assignment → fresh add
  for (let plannedIdx = 0; plannedIdx < planned.length; plannedIdx++) {
    if (!assignments.has(plannedIdx)) {
      assignments.set(plannedIdx, { kind: "fresh" });
    }
  }

  // Pass 5: originals not taken → delete
  const deletedIds = new Set<string>();
  for (const o of sortedOriginals) {
    if (!taken.has(o.id)) deletedIds.add(o.id);
  }

  return { assignments, deletedIds };
}

export function computeSourceOverlap(planned: PlannedItem, original: OriginalItem): number {
  return Math.max(
    0,
    Math.min(original.sourceEndMs, planned.sourceEndMs) - Math.max(original.sourceStartMs, planned.sourceStartMs)
  );
}
```

```ts
// apply-diff-algorithm/build-body.ts
import type { PlannedItem, Assignment } from "./types";
import { ScriptError } from "../errors";

export interface ItemBody {
  id?: string;
  trackId: string;
  fromFrame: number;
  durationInFrames: number;
  type: string;
  // type-specific fields
  [key: string]: unknown;
}

/** Build the JSON body for an UPDATE on an existing item */
export function buildUpdateBodyForPlanned(
  id: string,
  plannedItem: PlannedItem,
  trackId: string,
): ItemBody {
  const sourceStartSec = plannedItem.sourceStartMs / 1000;
  const base: ItemBody = {
    id,
    durationInFrames: plannedItem.durationFrames,
    fromFrame: plannedItem.fromFrame,
    trackId,
  };
  switch (plannedItem.itemType) {
    case "video":
      return { ...base, type: "video", videoStartFromInSeconds: sourceStartSec };
    case "audio":
      return { ...base, type: "audio", audioStartFromInSeconds: sourceStartSec };
    case "gif":
      return { ...base, type: "gif", gifStartFromInSeconds: sourceStartSec };
    case "image":
    case "svg":
    case "motion-graphic":
      return { ...base, type: plannedItem.itemType };
    default:
      throw new ScriptError(
        `Internal: item type "${plannedItem.itemType}" is not script-rebuildable.`,
        `This should be impossible — non-rebuildable types are filtered out before resolution. Report this as a bug.`
      );
  }
}

/** Build the JSON body for an ADD (either fresh or clone) */
export function buildAddBodyForPlanned(
  plannedItem: PlannedItem,
  trackId: string,
  cloneFrom: { id: string } | null,
): ItemBody & { __cloneFromId?: string } {
  const body = buildUpdateBodyForPlanned("", plannedItem, trackId);
  // strip id (will be assigned by DB on insert)
  delete body.id;
  if (cloneFrom) {
    return { ...body, __cloneFromId: cloneFrom.id };
  }
  return body;
}
```

```ts
// apply-diff-algorithm/apply.ts
import type { PlannedItem, OriginalItem } from "./types";
import { mapPlannedToOriginals } from "./diff";
import { buildUpdateBodyForPlanned, buildAddBodyForPlanned } from "./build-body";

export interface ApplyDiffOptions {
  /** Function to look up an original item by id (for clone case) */
  fetchOriginalById: (id: string) => Promise<OriginalItem | null>;
  /** Function to execute DB mutations */
  insertItem: (body: any) => Promise<{ id: string }>;
  updateItem: (id: string, body: any) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
}

export interface ApplyResult {
  updates: Array<{ id: string; body: any }>;
  adds: Array<{ body: any; fromOriginalId?: string }>;
  deletes: string[];
}

export async function applyDiff(
  planned: PlannedItem[],
  originals: OriginalItem[],
  trackId: string,
  options: ApplyDiffOptions,
): Promise<ApplyResult> {
  const { assignments, deletedIds } = mapPlannedToOriginals(planned, originals);
  const result: ApplyResult = { updates: [], adds: [], deletes: [] };

  for (const [plannedIdx, assignment] of assignments) {
    const item = planned[plannedIdx]!;
    if (assignment.kind === "update") {
      result.updates.push({
        id: assignment.originalId,
        body: buildUpdateBodyForPlanned(assignment.originalId, item, trackId),
      });
    } else if (assignment.kind === "clone") {
      const cloneFrom = await options.fetchOriginalById(assignment.fromOriginalId);
      if (cloneFrom) {
        result.adds.push({
          body: buildAddBodyForPlanned(item, trackId, cloneFrom),
          fromOriginalId: assignment.fromOriginalId,
        });
      }
    } else {
      result.adds.push({
        body: buildAddBodyForPlanned(item, trackId, null),
      });
    }
  }

  for (const id of deletedIds) {
    result.deletes.push(id);
  }

  return result;
}
```

```ts
// usage.ts
import { applyDiff } from "apply-diff-algorithm";
import { renderMarkdown, parseMarkdown, validate } from "markdown-state";

async function applyScript(state: CanonicalState, newMd: string, db: Database) {
  // 1. validate
  const v = validate(newMd, state, true);
  if (!v.ok) return { ok: false, errors: v.errors };

  // 2. parse
  const parsed = parseMarkdown(newMd, {
    assetIdByDisplayName: new Map(state.assets.map(a => [a.displayName, a.id])),
  });
  if (!parsed.ok) return { ok: false, errors: [{ message: parsed.error }] };

  // 3. build planned items
  const planned = buildPlannedItems(parsed.entries, state);  // 用户实现

  // 4. diff
  const diffResult = await applyDiff(planned, state.items, "track-v1-uuid", {
    fetchOriginalById: (id) => db.findItem(id),
    insertItem: (body) => db.insertItem(body),
    updateItem: (id, body) => db.updateItem(id, body),
    deleteItem: (id) => db.deleteItem(id),
  });

  // 5. submit in transaction
  await db.transaction(async (tx) => {
    for (const u of diffResult.updates) {
      await tx.updateItem(u.id, u.body);
    }
    for (const a of diffResult.adds) {
      const inserted = await tx.insertItem(a.body);
      if (a.fromOriginalId) {
        // 复制 effects / transitions / fades
        await tx.cloneSideEffects(a.fromOriginalId, inserted.id);
      }
    }
    for (const id of diffResult.deletes) {
      await tx.deleteItem(id);
    }
  });

  return { ok: true, summary: `Updated ${diffResult.updates.length}, added ${diffResult.adds.length}, deleted ${diffResult.deletes.length}` };
}
```
