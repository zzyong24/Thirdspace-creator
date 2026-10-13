# 04 参考原代码块

来源：`/Users/zyongzhu/ThirdSpace/03-知识/ChatCut-架构分析/extracted/20261013_04-code_-_markdown-state_模块（ChatCut_script-mirror_逆向）.md`

原文件SHA256：`932123d0424dc7e37513059a3ba49097c92f0ce88fcde3dae7fc80d65152a6d2`

以下TypeScript代码块逐字保留，包括原缺漏，不作为运行时模块加载。

```ts
// markdown-state/format.ts
export const SCRIPT_BODY_MARKER = "<!-- markdown-state:body -->";

// Header markers (在 body marker 之前)
export const MARKER_PATTERNS = {
  // project 整体 stamp —— drift detection
  stamp: /<!--\s*markdown-state:stamp:\s*([0-9a-f]+)\s*-->/i,
  // library stamp —— source content 变化检测
  libStamp: /<!--\s*markdown-state:lib-stamp:\s*([0-9a-f]+)\s*-->/i,
  // 目标 timeline id
  timeline: /<!--\s*markdown-state:timeline:\s*([a-zA-Z0-9_-]+)\s*-->/i,
  // 目标 track id (optional)
  track: /<!--\s*markdown-state:track:\s*([a-zA-Z0-9_-]+)\s*-->/i,
};

// Body 行类型
export const ROW_PATTERNS = {
  trackHeader: /^##\s+([VA]\d+)(?:\s+—\s+.+)?\s*$/,         // ## V1, ## A1
  sourceHeader: /^###\s+(.+?)\s*$/,                          // ### filename.mp4
  segment: /^\[s(\d+)(?:@(\d+))?\]\s+(.*)$/,                 // [s1] text, [s3@1] second occurrence
  gap: /^\[gap\s+(~~)?(\d+)f(~~)?\]\s*$/,                    // [gap 30f] or [gap ~~30f~~] (drop)
  clip: /^\[c(\d+)\]\s+(~~)?(\d+)f(~~)?\s*$/,                // [c1] 60f
  silence: /^\[silence=(\d+(?:\.\d+)?)s(?:→(\d+(?:\.\d+)?)s)?\]\s*$/,
  speaker: /^@(\S.*)$/,
  comment: /^<!--[\s\S]*?-->/,
};

// 删除标记：~~text~~ 整行 strikethrough = drop this row
export const STRIKE_RE = /^~~(.+)~~$/;
```

```ts
// markdown-state/index.ts
import {
  SCRIPT_BODY_MARKER, MARKER_PATTERNS, ROW_PATTERNS, STRIKE_RE,
} from "./format";
import { createHash } from "node:crypto";

// ────────────────── Types ──────────────────

export interface Asset {
  id: string;
  displayName: string;
  /** library source content 用于算 lib stamp */
  transcriptText?: string;
}

export interface Segment {
  /** stable id from library (e.g. "s1") */
  localId: number;
  /** 第几次出现 (1-based, optional) */
  occurrence?: number;
  text: string;
}

export interface CanonicalState {
  projectId: string;
  timelineId: string;
  trackId: string;
  assets: Asset[];
  /** 已有 items, 用于 diff */
  items: TimelineItem[];
  fps: number;
}

export interface TimelineItem {
  id: string;
  trackAlias: string;        // "V1", "A1"
  assetId: string;            // 来自哪个 asset
  kind: "segment" | "clip" | "gap" | "silence";
  /** for segment: which transcript local id */
  segmentLocalId?: number;
  occurrence?: number;
  /** for clip/gap: duration in frames */
  durationFrames?: number;
  text?: string;
  /** for silence: original duration in seconds */
  silenceSec?: number;
  silenceSecTo?: number;
}

// ────────────────── Parsed entries (intermediate) ──────────────────

export type ParsedEntry =
  | { kind: "track"; alias: string }
  | { kind: "source"; display: string; resolvedAssetId: string | null }
  | { kind: "segment"; trackAlias: string; assetId: string; localId: number; occurrence?: number; text: string; dropped: boolean }
  | { kind: "clip"; trackAlias: string; assetId: string; localId: number; durationFrames: number; dropped: boolean }
  | { kind: "gap"; trackAlias: string; durationFrames: number; dropped: boolean }
  | { kind: "silence"; trackAlias: string; fromSec: number; toSec?: number };

// ────────────────── Marker extractors ──────────────────

export function extractStamp(md: string): string | null {
  const idx = md.indexOf(SCRIPT_BODY_MARKER);
  const header = idx === -1 ? md : md.slice(0, idx);
  return MARKER_PATTERNS.stamp.exec(header)?.[1] ?? null;
}

export function extractLibraryStamp(md: string): string | null {
  const idx = md.indexOf(SCRIPT_BODY_MARKER);
  const header = idx === -1 ? md : md.slice(0, idx);
  return MARKER_PATTERNS.libStamp.exec(header)?.[1] ?? null;
}

export function extractTimelineId(md: string): string | null {
  const idx = md.indexOf(SCRIPT_BODY_MARKER);
  const header = idx === -1 ? md : md.slice(0, idx);
  return MARKER_PATTERNS.timeline.exec(header)?.[1] ?? null;
}

export function extractTrackId(md: string): string | null {
  const idx = md.indexOf(SCRIPT_BODY_MARKER);
  const header = idx === -1 ? md : md.slice(0, idx);
  return MARKER_PATTERNS.track.exec(header)?.[1] ?? null;
}

// ────────────────── Stamp computers ──────────────────

export function computeStateStamp(state: CanonicalState): string {
  // 任何 item 增删改都改 stamp
  const payload = state.items
    .map(i => `${i.id}:${i.kind}:${i.trackAlias}:${i.assetId}:${i.segmentLocalId ?? ""}:${i.occurrence ?? ""}:${i.durationFrames ?? ""}:${i.text ?? ""}`)
    .join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export function computeLibraryStamp(state: CanonicalState): string {
  // library 文本变了 → lib stamp 变
  const payload = state.assets
    .map(a => `${a.id}:${a.transcriptText ?? ""}`)
    .join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

// ────────────────── Renderer (state → markdown) ──────────────────

export function renderMarkdown(state: CanonicalState): string {
  const stamp = computeStateStamp(state);
  const libStamp = computeLibraryStamp(state);
  const assetById = new Map(state.assets.map(a => [a.id, a]));

  // group items by track + source
  const byTrack = groupBy(state.items.filter(i => !isGap(i)), i => i.trackAlias);

  const trackBlocks: string[] = [];
  for (const [trackAlias, items] of byTrack) {
    const byAsset = groupBy(items, i => i.assetId);
    const sourceBlocks: string[] = [];
    for (const [assetId, group] of byAsset) {
      const asset = assetById.get(assetId);
      if (!asset) continue;
      sourceBlocks.push(`### ${asset.displayName}`);
      for (const item of group) {
        sourceBlocks.push(renderItemRow(item));
      }
    }
    trackBlocks.push(`## ${trackAlias}\n${sourceBlocks.join("\n")}`);
  }

  return [
    `<!-- markdown-state:stamp:${stamp} -->`,
    `<!-- markdown-state:lib-stamp:${libStamp} -->`,
    `<!-- markdown-state:timeline:${state.timelineId} -->`,
    `<!-- markdown-state:track:${state.trackId} -->`,
    SCRIPT_BODY_MARKER,
    "",
    trackBlocks.join("\n\n"),
    "",
  ].join("\n");
}

function renderItemRow(item: TimelineItem): string {
  const dropped = false; // renderer only emits kept items
  if (item.kind === "segment") {
    const occ = item.occurrence ? `@${item.occurrence}` : "";
    return `  [s${item.segmentLocalId}${occ}] ${item.text ?? ""}`;
  }
  if (item.kind === "clip") {
    return `  [c${someLocalId(item)}] ${dropped ? "~~" : ""}${item.durationFrames}f${dropped ? "~~" : ""}`.trim();
  }
  if (item.kind === "gap") {
    return `  [gap ${dropped ? "~~" : ""}${item.durationFrames}f${dropped ? "~~" : ""}]`.trim();
  }
  if (item.kind === "silence") {
    const to = item.silenceSecTo ? `→${item.silenceSecTo}s` : "";
    return `  [silence=${item.silenceSec}s${to}]`;
  }
  return "";
}

function isGap(i: TimelineItem): boolean {
  return i.kind === "gap" || i.kind === "silence";
}

function someLocalId(item: TimelineItem): number {
  return item.segmentLocalId ?? Math.floor(Math.random() * 9999);
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(it);
  }
  return m;
}

// ────────────────── Parser (markdown → entries) ──────────────────

export type ParseResult =
  | { ok: true; entries: ParsedEntry[] }
  | { ok: false; error: string };

export interface ParserContext {
  assetIdByDisplayName: Map<string, string>;
}

export function parseMarkdown(content: string, ctx: ParserContext): ParseResult {
  const idx = content.indexOf(SCRIPT_BODY_MARKER);
  if (idx === -1) {
    return { ok: false, error: `Missing body marker ${SCRIPT_BODY_MARKER}` };
  }
  const body = content.slice(idx + SCRIPT_BODY_MARKER.length);
  const entries: ParsedEntry[] = [];
  let currentTrackAlias: string | null = null;
  let currentAssetId: string | null = null;

  const lines = body.split("\n");
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx];
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Skip pure comments
    if (ROW_PATTERNS.comment.test(trimmed)) continue;
    // Skip speaker labels
    if (ROW_PATTERNS.speaker.test(trimmed)) continue;

    const trackMatch = ROW_PATTERNS.trackHeader.exec(trimmed);
    if (trackMatch) {
      currentTrackAlias = trackMatch[1];
      currentAssetId = null;
      entries.push({ kind: "track", alias: currentTrackAlias });
      continue;
    }

    const sourceMatch = ROW_PATTERNS.sourceHeader.exec(trimmed);
    if (sourceMatch) {
      if (!currentTrackAlias) {
        return { ok: false, error: `H3 at line ${lineIdx + 1} appears before any ## track header` };
      }
      const display = sourceMatch[1].trim();
      const resolved = ctx.assetIdByDisplayName.get(display) ?? null;
      entries.push({ kind: "source", display, resolvedAssetId: resolved });
      currentAssetId = resolved;
      continue;
    }

    // Handle strikethrough row (whole-line delete)
    let lineForRow = trimmed;
    let wholeLineStrike = false;
    const strikeMatch = STRIKE_RE.exec(trimmed);
    if (strikeMatch) {
      lineForRow = strikeMatch[1].trim();
      wholeLineStrike = true;
    }

    const gapMatch = ROW_PATTERNS.gap.exec(lineForRow);
    if (gapMatch) {
      if (!currentTrackAlias) {
        return { ok: false, error: `Gap at line ${lineIdx + 1} before any ## track header` };
      }
      const openT = gapMatch[1] === "~~";
      const closeT = gapMatch[3] === "~~";
      if (openT !== closeT) {
        return { ok: false, error: `Unbalanced ~~ in gap at line ${lineIdx + 1}` };
      }
      const dur = Number.parseInt(gapMatch[2], 10);
      if (!Number.isFinite(dur) || dur < 0) {
        return { ok: false, error: `Invalid gap duration at line ${lineIdx + 1}` };
      }
      entries.push({
        kind: "gap",
        trackAlias: currentTrackAlias,
        durationFrames: dur,
        dropped: openT || wholeLineStrike,
      });
      continue;
    }

    const clipMatch = ROW_PATTERNS.clip.exec(lineForRow);
    if (clipMatch) {
      if (!currentTrackAlias || !currentAssetId) {
        return { ok: false, error: `Clip at line ${lineIdx + 1} before ## track + ### source` };
      }
      const openT = clipMatch[2] === "~~";
      const closeT = clipMatch[4] === "~~";
      if (openT !== closeT) {
        return { ok: false, error: `Unbalanced ~~ in clip at line ${lineIdx + 1}` };
      }
      const dur = Number.parseInt(clipMatch[3], 10);
      entries.push({
        kind: "clip",
        trackAlias: currentTrackAlias,
        assetId: currentAssetId,
        localId: Number.parseInt(clipMatch[1], 10),
        durationFrames: dur,
        dropped: openT || wholeLineStrike,
      });
      continue;
    }

    const segMatch = ROW_PATTERNS.segment.exec(lineForRow);
    if (segMatch) {
      if (!currentTrackAlias || !currentAssetId) {
        return { ok: false, error: `Segment at line ${lineIdx + 1} before ## track + ### source` };
      }
      const occRaw = segMatch[2];
      entries.push({
        kind: "segment",
        trackAlias: currentTrackAlias,
        assetId: currentAssetId,
        localId: Number.parseInt(segMatch[1], 10),
        occurrence: occRaw ? Number.parseInt(occRaw, 10) : undefined,
        text: segMatch[3],
        dropped: wholeLineStrike,
      });
      continue;
    }

    const silenceMatch = ROW_PATTERNS.silence.exec(lineForRow);
    if (silenceMatch) {
      if (!currentTrackAlias) {
        return { ok: false, error: `Silence at line ${lineIdx + 1} before any ## track` };
      }
      entries.push({
        kind: "silence",
        trackAlias: currentTrackAlias,
        fromSec: Number.parseFloat(silenceMatch[1]),
        toSec: silenceMatch[2] ? Number.parseFloat(silenceMatch[2]) : undefined,
      });
      continue;
    }

    // Unknown row — strict mode would reject; lenient mode skips
    // v1: skip silently
  }

  return { ok: true, entries };
}

// ────────────────── Validator (the 5 checks) ──────────────────

export type ValidationError = { message: string; hint?: string };
export type ValidationResult =
  | { ok: true; warnings: ValidationError[] }
  | { ok: false; errors: ValidationError[]; warnings: ValidationError[] };

export function validate(
  newMarkdown: string,
  currentState: CanonicalState,
  /** 是否容忍 timeline 漂移（默认 true，给 agent 自动重试用） */
  tolerateDrift = true,
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Check 1: timeline id 必须匹配 (除非 markdown 里没指定)
  const diskTimelineId = extractTimelineId(newMarkdown);
  if (diskTimelineId && diskTimelineId !== currentState.timelineId) {
    if (!tolerateDrift) {
      errors.push({
        message: `Markdown was materialized for a different timeline (${diskTimelineId}, current: ${currentState.timelineId})`,
        hint: "Re-read the current state and edit a fresh markdown.",
      });
    } else {
      warnings.push({
        message: `Timeline mismatch detected: ${diskTimelineId} → ${currentState.timelineId}`,
        hint: "Re-read and re-edit recommended.",
      });
    }
  }

  // Check 2: stamp 漂移检测
  const diskStamp = extractStamp(newMarkdown);
  const liveStamp = computeStateStamp(currentState);
  if (diskStamp && diskStamp !== liveStamp) {
    if (!tolerateDrift) {
      errors.push({
        message: "State has drifted since this markdown was generated",
        hint: "Re-read the current state and edit a fresh markdown.",
      });
    } else {
      warnings.push({
        message: `Stamp drift detected: disk=${diskStamp} live=${liveStamp}`,
        hint: "Re-read recommended.",
      });
    }
  }

  // Check 3: library stamp 漂移 (如果 markdown 引用了 library)
  const diskLibStamp = extractLibraryStamp(newMarkdown);
  const liveLibStamp = computeLibraryStamp(currentState);
  if (diskLibStamp && diskLibStamp !== liveLibStamp) {
    errors.push({
      message: "Source library has changed since this markdown was generated",
      hint: "Re-read the library and re-copy any affected rows.",
    });
  }

  // Check 4: parse markdown
  const ctx: ParserContext = {
    assetIdByDisplayName: new Map(currentState.assets.map(a => [a.displayName, a.id])),
  };
  const parsed = parseMarkdown(newMarkdown, ctx);
  if (!parsed.ok) {
    errors.push({
      message: `Parse error: ${parsed.error}`,
      hint: "Fix the markdown structure and retry.",
    });
    return { ok: false, errors, warnings };
  }

  // Check 5: track aliases 必须存在或可创建
  const validTrackAliases = new Set(
    currentState.items.map(i => i.trackAlias).filter((v, i, a) => a.indexOf(v) === i)
  );
  const usedTrackAliases = new Set<string>();
  for (const entry of parsed.entries) {
    if (entry.kind === "track") usedTrackAliases.add(entry.alias);
  }
  for (const alias of usedTrackAliases) {
    if (validTrackAliases.has(alias)) continue;
    if (!/^[VA]\d+$/.test(alias)) {
      errors.push({
        message: `Invalid track alias "${alias}"`,
        hint: "Track aliases must look like V1, V2, A1, A2, ...",
      });
    } else {
      // 可以是新建 track —— warn 而不是 error
      warnings.push({
        message: `Track "${alias}" will be created`,
      });
    }
  }

  // Check 6: 至少要有一个 playable entry
  const hasPlayable = parsed.entries.some(
    e => (e.kind === "segment" || e.kind === "clip" || e.kind === "gap" || e.kind === "silence") && !(e as any).dropped
  );
  if (!hasPlayable) {
    errors.push({
      message: "Markdown has no playable content",
      hint: "Add at least one [sN], [cN], [gap], or [silence] row.",
    });
  }

  if (errors.length > 0) return { ok: false, errors, warnings };
  return { ok: true, warnings };
}

// ────────────────── Diff → operations ──────────────────

export type Operation =
  | { kind: "add"; trackAlias: string; assetId: string; fromFrame: number; payload: AddPayload }
  | { kind: "update"; itemId: string; changes: Record<string, unknown> }
  | { kind: "delete"; itemId: string }
  | { kind: "move"; itemId: string; toFrame: number };

export type AddPayload =
  | { type: "segment"; segmentLocalId: number; occurrence?: number; text?: string }
  | { type: "clip"; durationFrames: number }
  | { type: "gap"; durationFrames: number }
  | { type: "silence"; fromSec: number; toSec?: number };

/**
 * 根据 parsed entries 和 current state 算 diff。
 * 简化版：按 (trackAlias, assetId, segmentLocalId, occurrence) 作为原 item 的 key。
 * 在原 state 里找不到的 entry → add
 * 在 markdown 里没出现的原 item → delete
 * 其它 → keep
 */
export function diff(
  parsed: ParsedEntry[],
  currentState: CanonicalState,
  fps: number = currentState.fps,
): Operation[] {
  const ops: Operation[] = [];

  // Index existing items by composite key
  const existingByKey = new Map<string, TimelineItem>();
  for (const item of currentState.items) {
    if (item.kind === "segment" && item.segmentLocalId != null) {
      const key = segmentKey(item.trackAlias, item.assetId, item.segmentLocalId, item.occurrence);
      existingByKey.set(key, item);
    }
  }

  // Group entries by track
  const trackOrder: string[] = [];
  const trackEntries = new Map<string, ParsedEntry[]>();
  let currentTrack: string | null = null;
  let currentAsset: string | null = null;
  for (const entry of parsed) {
    if (entry.kind === "track") {
      currentTrack = entry.alias;
      currentAsset = null;
      if (!trackEntries.has(currentTrack)) {
        trackEntries.set(currentTrack, []);
        trackOrder.push(currentTrack);
      }
      continue;
    }
    if (entry.kind === "source") {
      currentAsset = entry.resolvedAssetId;
      continue;
    }
    if (!currentTrack) continue;
    if ("trackAlias" in entry) {
      trackEntries.get(currentTrack)!.push(entry);
    }
  }

  // Walk tracks and compute operations
  let runningFrame: number = 0;
  for (const trackAlias of trackOrder) {
    const entries = trackEntries.get(trackAlias)!;
    for (const entry of entries) {
      if (entry.kind === "segment" && !entry.dropped) {
        const key = segmentKey(trackAlias, entry.assetId, entry.localId, entry.occurrence);
        const existing = existingByKey.get(key);
        if (!existing) {
          ops.push({
            kind: "add",
            trackAlias,
            assetId: entry.assetId,
            fromFrame: runningFrame,
            payload: {
              type: "segment",
              segmentLocalId: entry.localId,
              occurrence: entry.occurrence,
              text: entry.text,
            },
          });
          runningFrame += framesForText(entry.text, fps);
        } else {
          existingByKey.delete(key);
          runningFrame += framesForItem(existing, fps);
        }
      } else if (entry.kind === "clip" && !entry.dropped) {
        ops.push({
          kind: "add",
          trackAlias,
          assetId: entry.assetId,
          fromFrame: runningFrame,
          payload: { type: "clip", durationFrames: entry.durationFrames },
        });
        runningFrame += entry.durationFrames;
      } else if (entry.kind === "gap" && !entry.dropped) {
        ops.push({
          kind: "add",
          trackAlias,
          assetId: currentState.items[0]?.assetId ?? "",
          fromFrame: runningFrame,
          payload: { type: "gap", durationFrames: entry.durationFrames },
        });
        runningFrame += entry.durationFrames;
      } else if (entry.kind === "silence") {
        ops.push({
          kind: "add",
          trackAlias,
          assetId: currentState.items[0]?.assetId ?? "",
          fromFrame: runningFrame,
          payload: {
            type: "silence",
            fromSec: entry.fromSec,
            toSec: entry.toSec,
          },
        });
        runningFrame += Math.round((entry.toSec ?? entry.fromSec) * fps);
      }
      // dropped = ignored
    }
  }

  // Anything still in existingByKey was not re-emitted → delete
  for (const item of existingByKey.values()) {
    ops.push({ kind: "delete", itemId: item.id });
  }

  return ops;
}

function segmentKey(trackAlias: string, assetId: string, localId: number, occ?: number): string {
  return `${trackAlias}|${assetId}|${localId}|${occ ?? 1}`;
}

function framesForText(text: string, fps: number): number {
  // 简化：按 ~3 字/秒 估算
  return Math.max(1, Math.round((text.length / 3) * fps));
}

function framesForItem(item: TimelineItem, fps: number): number {
  if (item.durationFrames) return item.durationFrames;
  if (item.text) return framesForText(item.text, fps);
  if (item.silenceSec) return Math.round(item.silenceSec * fps);
  return 0;
}
```

```ts
// markdown-state/auto-correct.ts
import { ROW_PATTERNS } from "./format";
import type { Asset, ParsedEntry } from "./index";

/**
 * 对 parsed entries 做一遍 auto-correct：
 * 如果 [sN] 引用了 library 里没有的 segment，但 text 完全匹配某 segment，
 * 把编号改对。
 *
 * Returns: { entries: corrected, fixes: number }
 */
export function autoCorrectSegmentIds(
  entries: ParsedEntry[],
  assets: Asset[],
  getTranscriptText: (assetId: string) => string,
): { entries: ParsedEntry[]; fixes: number } {
  // 1. 为每个 asset 算 segments (按 text 拆)
  const segmentsByAsset = new Map<string, { localId: number; text: string }[]>();
  for (const asset of assets) {
    const text = getTranscriptText(asset.id);
    if (!text) continue;
    // 简化：按句子拆
    const sentences = text.split(/[。.!?！？\n]+/).map(s => s.trim()).filter(Boolean);
    segmentsByAsset.set(asset.id, sentences.map((s, i) => ({ localId: i + 1, text: s })));
  }

  // 2. 对每个 segment entry 检查
  let fixes = 0;
  const corrected = entries.map(entry => {
    if (entry.kind !== "segment" || entry.dropped) return entry;
    const segs = segmentsByAsset.get(entry.assetId);
    if (!segs) return entry;
    const claimed = segs.find(s => s.localId === entry.localId);
    if (claimed && claimed.text === entry.text) return entry; // ok
    // text 匹配别的 segment
    const match = segs.find(s => s.text === entry.text);
    if (match && match.localId !== entry.localId) {
      fixes += 1;
      return { ...entry, localId: match.localId };
    }
    return entry; // 不修，让 validator 报错
  });

  return { entries: corrected, fixes };
}
```

```ts
// usage.ts
import {
  renderMarkdown, parseMarkdown, validate, diff, autoCorrectSegmentIds,
  extractStamp, extractLibraryStamp, type CanonicalState,
} from "markdown-state";

// 1. read: render state → markdown
const md = renderMarkdown(currentState);
// → 返回完整 markdown，可直接给 agent 用 Read 工具读

// 2. (agent 用 Edit 工具改 markdown)

// 3. apply: 改后的 markdown
async function apply(newMd: string, state: CanonicalState) {
  // a. validate
  const v = validate(newMd, state, /* tolerateDrift */ true);
  if (!v.ok) {
    return { ok: false, errors: v.errors };
  }

  // b. parse
  const parsed = parseMarkdown(newMd, {
    assetIdByDisplayName: new Map(state.assets.map(a => [a.displayName, a.id])),
  });
  if (!parsed.ok) {
    return { ok: false, errors: [{ message: parsed.error }] };
  }

  // c. auto-correct
  const ac = autoCorrectSegmentIds(parsed.entries, state.assets, assetId =>
    state.assets.find(a => a.id === assetId)?.transcriptText ?? ""
  );

  // d. diff → operations
  const ops = diff(ac.entries, state);
  return { ok: true, operations: ops, autoFixCount: ac.fixes, warnings: v.warnings };
}
```
