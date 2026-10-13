# 35 参考原代码块

来源：`/Users/zyongzhu/ThirdSpace/03-知识/ChatCut-架构分析/extracted/20261013_35-code_-_apply-flow-complete_模块（5-stamp_check_+_auto-correct_+_diff_+_apply_整合）.md`

原文件SHA256：`d8eb8e39a0da5d15e0f3c2291f24f4d9164096c0396d16bf97b5a0a9e91cf634`

以下TypeScript代码块逐字保留，包括原缺漏，不作为运行时模块加载。

```ts
// apply-flow-complete/types.ts

export interface CanonicalState {
  projectId: string;
  timelineId: string;
  trackId: string;
  fps: number;
  assets: Array<{ id: string; displayName: string; librarySegments: any[] }>;
  tracks: Array<{ id: string; alias: string; hidden: boolean; items: any[] }>;
  items: Array<{ id: string; trackId: string; type: string; [key: string]: unknown }>;
  segments: Array<{
    id: number;
    assetId: string;
    text: string;
    words: Array<{ text: string; startMs: number; endMs: number }>;
  }>;
}

export interface ApplyFlowOptions {
  /** Target state */
  state: CanonicalState;
  /** New markdown (from agent's edit) */
  newMarkdown: string;
  /** True = dry run, no DB write */
  preview: boolean;
  /** When dry-run completes, where to also persist the result file */
  persistToFile?: boolean;
  /** Optional: which track to filter (e.g. "V1") */
  trackFilter?: string;
}

export interface ApplyFlowResult {
  /** True = applied (or dry-run successful) */
  ok: boolean;
  /** Stage at which it failed (if !ok) */
  failedAt?: "stamps" | "parse" | "track-plan" | "diff" | "commit";
  /** Apply operations (only when ok && !preview) */
  operations?: {
    updates: Array<{ id: string; body: any }>;
    adds: Array<{ body: any; fromOriginalId?: string }>;
    deletes: string[];
  };
  /** Warnings (auto-corrections, drift notes) */
  warnings: string[];
  /** Errors (if !ok) */
  errors: Array<{ message: string; hint?: string }>;
  /** Human-readable summary */
  summary: string;
}
```

```ts
// apply-flow-complete/flow.ts
import { computeStamp, computeLibraryStamp } from "markdown-state/stamps";
import { parseMarkdown, validate } from "markdown-state";
import { applyAutoCorrectChain } from "auto-correct-chain";
import { mapPlannedToOriginals, buildUpdateBodyForPlanned, buildAddBodyForPlanned } from "apply-diff-algorithm";
import { validateMarkdownTrackAliases } from "track-alias-validation/markdown-validator";
import { ScriptError } from "error-formatting/types";
import { formatBatchedApplyErrors, annotateDriftCandidates } from "error-batching";

export async function runApplyFlow(
  options: ApplyFlowOptions,
  db: {
    /** Transactional commit */
    transaction: <T>(fn: (tx: any) => Promise<T>) => Promise<T>;
    /** Per-apply call backs */
    getTimelineId: (projectId: string) => Promise<string | null>;
    listItems: (projectId: string) => Promise<any[]>;
    cloneItemSideEffects: (fromId: string, toId: string) => Promise<void>;
    insertItem: (body: any) => Promise<{ id: string }>;
    updateItem: (id: string, body: any) => Promise<void>;
    deleteItem: (id: string) => Promise<void>;
  },
): Promise<ApplyFlowResult> {
  const { state, newMarkdown, preview, trackFilter } = options;

  // ═══════════ Stage 1: STAMPS ═══════════
  const stampCheck = checkStamps(newMarkdown, state);
  if (!stampCheck.ok) {
    return {
      failedAt: "stamps",
      ok: false,
      errors: stampCheck.errors,
      warnings: [],
      summary: stampCheck.summary,
    };
  }

  // ═══════════ Stage 2: PARSE ═══════════
  const assetIdByDisplayName = new Map<string, string>();
  for (const a of state.assets) assetIdByDisplayName.set(a.displayName, a.id);

  const parsed = parseMarkdown(newMarkdown, { assetIdByDisplayName });
  if (!parsed.ok) {
    return {
      failedAt: "parse",
      ok: false,
      errors: [{ message: `Parse error: ${parsed.error}` }],
      warnings: [],
      summary: "Markdown structure invalid. Fix the structure and retry.",
    };
  }

  // Auto-correct segment IDs (降级链)
  const ac = applyAutoCorrectChain(parsed.entries, {
    displayNameByAssetId: assetIdByDisplayName,
    librarySlugByAssetId: new Map(state.assets.map(a => [a.id, slugify(a.displayName)])),
    segments: state.segments,
  });
  const warnings = [...ac.warnings];

  if (ac.errors.length > 0) {
    const annotated = annotateDriftCandidates(ac.errors);
    const batched = formatBatchedApplyErrors(annotated);
    return {
      failedAt: "parse",
      ok: false,
      errors: ac.errors,
      warnings,
      summary: batched,
    };
  }

  // ═══════════ Stage 3: BUILD TRACK PLAN ═══════════
  const trackAliases = new Set<string>();
  for (const entry of parsed.entries) {
    if (entry.kind === "segment" || entry.kind === "clip" || entry.kind === "gap" || entry.kind === "silence") {
      trackAliases.add(entry.trackAlias);
    }
  }

  // 验证 track alias 序列
  const existingAliases = state.tracks.map(t => ({ alias: t.alias }));
  const trackErrors = validateMarkdownTrackAliases(
    [...trackAliases],
    [...existingAliases, ...[]].map(t => ({ alias: t.alias })),
  );
  if (trackErrors.length > 0) {
    return {
      failedAt: "track-plan",
      ok: false,
      errors: trackErrors,
      warnings,
      summary: "Track aliases invalid. Use V1/V2/A1/A2 sequence.",
    };
  }

  // Build per-track plans
  const trackPlans = buildPerTrackPlans(parsed.entries, state);
  if (trackPlans.length === 0) {
    return {
      failedAt: "track-plan",
      ok: false,
      errors: [{ message: "No playable content", hint: "Add at least one [sN] row." }],
      warnings,
      summary: "Markdown has no playable content.",
    };
  }

  // ═══════════ Stage 4: DIFF ═══════════
  const allUpdates: Array<{ id: string; body: any }> = [];
  const allAdds: Array<{ body: any; fromOriginalId?: string }> = [];
  const allDeletes: string[] = [];

  for (const plan of trackPlans) {
    const { assignments, deletedIds } = mapPlannedToOriginals(plan.planned, plan.originals);

    for (const [plannedIdx, assignment] of assignments) {
      const item = plan.planned[plannedIdx]!;
      if (assignment.kind === "update") {
        allUpdates.push({
          body: buildUpdateBodyForPlanned(assignment.originalId, item, plan.trackId),
          id: assignment.originalId,
        });
      } else if (assignment.kind === "clone") {
        allAdds.push({
          body: buildAddBodyForPlanned(item, plan.trackId, null),
          fromOriginalId: assignment.fromOriginalId,
        });
      } else {
        allAdds.push({ body: buildAddBodyForPlanned(item, plan.trackId, null) });
      }
    }

    for (const id of deletedIds) {
      allDeletes.push(id);
    }
  }

  if (preview) {
    // Dry run: 不 commit，只返回 plan
    return {
      ok: true,
      operations: { adds: allAdds, deletes: allDeletes, updates: allUpdates },
      summary: `Preview: would update ${allUpdates.length}, add ${allAdds.length}, delete ${allDeletes.length}`,
      warnings,
    };
  }

  // ═══════════ Stage 5: COMMIT ═══════════
  try {
    await db.transaction(async (tx) => {
      for (const u of allUpdates) {
        await tx.updateItem(u.id, u.body);
      }
      for (const a of allAdds) {
        const inserted = await tx.insertItem(a.body);
        if (a.fromOriginalId) {
          await tx.cloneItemSideEffects(a.fromOriginalId, inserted.id);
        }
      }
      for (const id of allDeletes) {
        await tx.deleteItem(id);
      }
    });
  } catch (err) {
    return {
      failedAt: "commit",
      ok: false,
      errors: [{ message: `DB commit failed: ${err instanceof Error ? err.message : String(err)}` }],
      operations: { adds: allAdds, deletes: allDeletes, updates: allUpdates },
      warnings,
      summary: "DB commit failed. State not modified.",
    };
  }

  return {
    ok: true,
    operations: { adds: allAdds, deletes: allDeletes, updates: allUpdates },
    summary: `Applied: ${allUpdates.length} updated, ${allAdds.length} added, ${allDeletes.length} deleted`,
    warnings,
  };
}

// ═══════════ Stage 1 helper: STAMPS ═══════════

function checkStamps(md: string, state: CanonicalState): { ok: true } | { ok: false; errors: any[]; summary: string } {
  // 1. timeline id
  const diskTimelineId = extractTimelineId(md);
  if (diskTimelineId && diskTimelineId !== state.timelineId) {
    return {
      errors: [{
        hint: `Switch back to timeline ${diskTimelineId} or call read_script on the active timeline ${state.timelineId}.`,
        message: `timeline.md was materialized for a different timeline.`,
      }],
      ok: false,
      summary: "Timeline mismatch",
    };
  }

  // 2. state stamp
  const diskStamp = extractStamp(md);
  const liveStamp = computeStamp(state);
  if (diskStamp && diskStamp !== liveStamp) {
    return {
      errors: [{
        hint: "Re-read timeline.md and re-edit.",
        message: "The timeline was modified by another tool or by the user.",
      }],
      ok: false,
      summary: "State drift",
    };
  }

  // 3. library stamp
  const diskLibStamp = extractLibraryStamp(md);
  const liveLibStamp = computeLibraryStamp(state);
  if (diskLibStamp && diskLibStamp !== liveLibStamp) {
    return {
      errors: [{
        hint: "Re-read the library and re-copy any affected rows.",
        message: "Source library transcript changed.",
      }],
      ok: false,
      summary: "Library drift",
    };
  }

  return { ok: true };
}

function extractTimelineId(md: string): string | null {
  return /<!--\s*markdown-state:timeline:\s*([a-zA-Z0-9_-]+)\s*-->/i.exec(md)?.[1] ?? null;
}

function extractStamp(md: string): string | null {
  return /<!--\s*markdown-state:stamp:\s*([0-9a-f]+)\s*-->/i.exec(md)?.[1] ?? null;
}

function extractLibraryStamp(md: string): string | null {
  return /<!--\s*markdown-state:lib-stamp:\s*([0-9a-f]+)\s*-->/i.exec(md)?.[1] ?? null;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildPerTrackPlans(
  entries: any[],
  state: CanonicalState,
): Array<{ trackId: string; planned: any[]; originals: any[] }> {
  // group by track alias
  const byTrack = new Map<string, any[]>();
  let currentTrack: string | null = null;
  let currentAsset: string | null = null;
  for (const e of entries) {
    if (e.kind === "track") {
      currentTrack = e.alias;
      currentAsset = null;
      if (!byTrack.has(currentTrack)) byTrack.set(currentTrack, []);
      continue;
    }
    if (e.kind === "source") {
      currentAsset = e.resolvedAssetId;
      continue;
    }
    if (!currentTrack) continue;
    if (e.kind === "segment" || e.kind === "clip" || e.kind === "gap" || e.kind === "silence") {
      byTrack.get(currentTrack)!.push({ ...e, assetId: currentAsset });
    }
  }

  // resolve trackId from alias
  const trackIdByAlias = new Map<string, string>();
  for (const t of state.tracks) trackIdByAlias.set(t.alias, t.id);

  const plans: Array<{ trackId: string; planned: any[]; originals: any[] }> = [];
  for (const [alias, planned] of byTrack) {
    const trackId = trackIdByAlias.get(alias);
    if (!trackId) continue;  // 已被 track-plan 阶段过滤
    const originals = state.items.filter(i => i.trackId === trackId);
    plans.push({ trackId, planned, originals });
  }

  return plans;
}
```

```ts
// usage.ts
import { runApplyFlow } from "apply-flow-complete/flow";

const result = await runApplyFlow(
  {
    newMarkdown: agentEditedMd,
    preview: false,
    state: currentState,
  },
  {
    cloneItemSideEffects: async (fromId, toId) => { /* copy effects, fades, etc */ },
    deleteItem: async (id) => db.delete(id),
    getTimelineId: async (projectId) => db.getActiveTimeline(projectId),
    insertItem: async (body) => db.insert(body),
    listItems: async (projectId) => db.listItems(projectId),
    transaction: (fn) => db.transaction(fn),
    updateItem: async (id, body) => db.update(id, body),
  },
);

if (!result.ok) {
  console.error(`Failed at ${result.failedAt}: ${result.summary}`);
  // result.errors 已经是 batched + drift-detected
} else {
  console.log(result.summary);
  // result.warnings 可能含 auto-correction 提示
  // result.operations 实际 commit 的 ops
}
```
