# 22 参考原代码块

来源：`/Users/zyongzhu/ThirdSpace/03-知识/ChatCut-架构分析/extracted/20261013_22-code_-_markdown-renderer_模块（state_→_markdown_完整渲染）.md`

原文件SHA256：`5e1c0579b27f1ea34b811865f739ef53b77205ffa79fedd587e98ef53b11689d`

以下TypeScript代码块逐字保留，包括原缺漏，不作为运行时模块加载。

```ts
// markdown-renderer/types.ts

export interface Word {
  text: string;
  startMs: number;
  endMs: number;
  /** 词的删除标记 (ranges [start, end] in text) */
  deletes?: Array<[number, number]>;
}

export interface Segment {
  id: string;                // 稳定 ID ("s1" 或 "s3@2")
  localId: number;
  utteranceText: string;     // 完整文本
  words: Word[];             // 用于回算 silence
  startChar?: number | null;
  endChar?: number | null;
  deletes?: Array<[number, number]>;  // 哪些 range 已经被删除
  orderIndex: number;
  /** 可选 speaker */
  speakerId?: string;
}

export interface TimelineItem {
  id: string;
  trackId: string;
  assetId: string;
  fromMs: number;
  sourceStartMs: number;
  sourceEndMs: number;
  durationMs: number;
  /** segments that this item contains (timeline-mode) */
  segments: Segment[];
  /** asset-display name (e.g. "intro.mp4") */
  assetDisplayName: string;
  /** 该 item 自己算是一个 [cN] clip (no transcript) */
  isClip?: boolean;
  /** duration in frames for [cN] */
  durationFrames?: number;
}

export interface Track {
  id: string;
  alias: string;  // "V1", "A1"
  name?: string;
  hidden: boolean;
  muted: boolean;
  items: TimelineItem[];
}

export interface Asset {
  id: string;
  displayName: string;
  /** source transcript for library */
  librarySegments: Segment[];
  libraryStamp: string;
}

export interface CanonicalState {
  projectId: string;
  timelineId: string;
  trackId: string;
  fps: number;
  assets: Asset[];
  tracks: Track[];
  items: TimelineItem[];  // 已有 items
}

export interface RenderOptions {
  /** 是否在 segment 之间显示 silence 标记 (default false) */
  showSilence?: boolean;
  /** 阈值: silence 超过这个 ms 才显示 (default 500) */
  silenceThresholdMs?: number;
  /** library 是否包含在 markdown 里 (default true) */
  includeLibrary?: boolean;
  /** max silence duration 显示为多少 (default 2.0s) */
  maxSilenceDisplaySec?: number;
}

export interface RenderResult {
  /** 完整 markdown 字符串（含 header markers） */
  scriptMd: string;
  /** library 文件内容 map (filename -> markdown content) */
  libraryDocs: Map<string, string>;
  /** 教学 summary（给 agent 看的） */
  summary: string;
}
```

```ts
// markdown-renderer/render.ts
import type {
  CanonicalState, Track, TimelineItem, Segment, Asset, RenderOptions, RenderResult,
} from "./types";
import { computeStamp, computeLibraryStamp } from "./stamps";

const ONE_FRAME_MS = 1000 / 30;  // 简化：假设 30fps

export function renderMarkdown(
  state: CanonicalState,
  options: RenderOptions = {},
): RenderResult {
  const showSilence = options.showSilence ?? false;
  const silenceThresholdMs = options.silenceThresholdMs ?? 500;
  const includeLibrary = options.includeLibrary ?? true;
  const maxSilenceDisplaySec = options.maxSilenceDisplaySec ?? 2.0;

  const stamp = computeStamp(state);
  const libStamp = computeLibraryStamp(state);
  const lines: string[] = [];

  // ── Header markers ──
  lines.push(`<!-- markdown-state:stamp:${stamp} -->`);
  lines.push(`<!-- markdown-state:lib-stamp:${libStamp} -->`);
  lines.push(`<!-- markdown-state:timeline:${state.timelineId} -->`);
  lines.push(`<!-- markdown-state:track:${state.trackId} -->`);
  lines.push("<!-- markdown-state:body -->");
  lines.push("");

  // ── Body ──
  const visibleTracks = state.tracks
    .filter(t => !t.hidden)
    .sort((a, b) => orderTracks(a, b));

  let totalSegments = 0;
  let totalDurationMs = 0;

  for (const track of visibleTracks) {
    lines.push(`## ${track.alias}${track.name ? ` — ${track.name}` : ""}`);
    const sortedItems = sortItemsOnTrack(track.items);

    let currentAssetId: string | null = null;
    let prevTail: { itemSourceEndMs: number; lastKeptEndMs: number; itemId: string } | null = null;
    let pendingLeadingMs = 0;
    let lastSpeakerId: string | null = null;
    let clipCounter = 0;

    for (const item of sortedItems) {
      // Switch source region when asset changes
      if (item.assetId !== currentAssetId) {
        if (currentAssetId !== null) flushPendingSilence(lines, pendingLeadingMs, showSilence);
        const asset = state.assets.find(a => a.id === item.assetId);
        lines.push(`### ${asset?.displayName ?? item.assetId}`);
        currentAssetId = item.assetId;
        pendingLeadingMs = 0;
        lastSpeakerId = null;
        prevTail = null;
      }

      // Process segments in this item
      if (item.segments.length === 0) {
        // This is a [cN] clip with no transcript
        clipCounter += 1;
        const dur = item.durationFrames ?? Math.round(item.durationMs / ONE_FRAME_MS);
        lines.push(`  [c${clipCounter}] ${dur}f`);
        prevTail = null;
        continue;
      }

      // Emit segments with silence between
      let prevEmittedKeptEndMs: number | null = null;
      let lastKept: { endMs: number } | null = null;

      for (const segment of item.segments) {
        const keptText = applyDeletes(segment.utteranceText, segment.deletes);
        if (!keptText.trim()) continue;

        // Speaker marker: only emit when speaker changes
        if (segment.speakerId && segment.speakerId !== lastSpeakerId) {
          lines.push(`@${segment.speakerId}`);
          lastSpeakerId = segment.speakerId;
        }

        // Silence between this segment and previous
        if (prevEmittedKeptEndMs !== null && segment.words.length > 0) {
          const firstWord = segment.words.find(w => !isWordDeleted(w, segment.deletes));
          if (firstWord && firstWord.startMs - prevEmittedKeptEndMs >= silenceThresholdMs) {
            emitSilence(lines, firstWord.startMs - prevEmittedKeptEndMs, showSilence, maxSilenceDisplaySec);
          }
        }

        // Emit segment line
        const segId = segment.id;  // e.g. "s1" or "s3@2"
        lines.push(`  [${segId}] ${keptText}`);

        totalSegments += 1;

        // Track last word for next silence calc
        const lastWord = findLastNonDeletedWord(segment.words, segment.deletes);
        if (lastWord) {
          prevEmittedKeptEndMs = lastWord.endMs;
          lastKept = lastWord;
        }
      }

      if (lastKept) {
        prevTail = {
          itemSourceEndMs: item.sourceEndMs,
          lastKeptEndMs: lastKept.endMs,
          itemId: item.id,
        };
      }
    }

    // Flush trailing silence
    flushPendingSilence(lines, pendingLeadingMs, showSilence);
  }

  // ── Library docs ──
  const libraryDocs = new Map<string, string>();
  if (includeLibrary) {
    for (const asset of state.assets) {
      if (asset.librarySegments.length === 0) continue;
      const md = renderLibraryDoc(asset);
      libraryDocs.set(`${asset.displayName}.md`, md);
    }
  }

  // ── Summary (教学式) ──
  const summary = buildSummary(state, libraryDocs, totalSegments);

  return {
    libraryDocs,
    scriptMd: lines.join("\n"),
    summary,
  };
}

// ──── helpers ────

function applyDeletes(text: string, deletes?: Array<[number, number]>): string {
  if (!deletes || deletes.length === 0) return text;
  // Sort and merge delete ranges
  const sorted = [...deletes].sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]!;
    const cur = sorted[i]!;
    if (cur[0] <= last[1] + 1) {
      last[1] = Math.max(last[1], cur[1]);
    } else {
      merged.push([...cur]);
    }
  }
  // Apply: keep chars not in any delete range
  const chars: string[] = [];
  let i = 0;
  for (const [s, e] of merged) {
    while (i < s && i < text.length) {
      chars.push(text[i]!);
      i += 1;
    }
    i = e + 1;
  }
  while (i < text.length) {
    chars.push(text[i]!);
    i += 1;
  }
  return chars.join("");
}

function isWordDeleted(word: Word, deletes?: Array<[number, number]>): boolean {
  if (!deletes) return false;
  // 简化：判断 word 在原文本中的 range 是否被 delete 覆盖
  return false;  // 实际需要 word 记录其原 char range
}

function findLastNonDeletedWord(words: Word[], deletes?: Array<[number, number]>): Word | null {
  for (let i = words.length - 1; i >= 0; i--) {
    if (!isWordDeleted(words[i]!, deletes)) return words[i]!;
  }
  return null;
}

function emitSilence(out: string[], ms: number, showSilence: boolean, maxSec: number) {
  if (!showSilence) return;
  const sec = Math.min(ms / 1000, maxSec);
  out.push(`  [silence=${sec.toFixed(1)}s]`);
}

function flushPendingSilence(out: string[], ms: number, showSilence: boolean) {
  if (ms > 500 && showSilence) {
    out.push(`  [silence=${(ms / 1000).toFixed(1)}s]`);
  }
}

function orderTracks(a: Track, b: Track): number {
  // V* tracks before A* tracks; within each, by alias number
  const aIsVideo = a.alias.startsWith("V");
  const bIsVideo = b.alias.startsWith("V");
  if (aIsVideo !== bIsVideo) return aIsVideo ? -1 : 1;
  const aNum = parseInt(a.alias.slice(1), 10) || 0;
  const bNum = parseInt(b.alias.slice(1), 10) || 0;
  return aNum - bNum;
}

function sortItemsOnTrack(items: TimelineItem[]): TimelineItem[] {
  return [...items].sort((a, b) => a.fromMs - b.fromMs);
}

function renderLibraryDoc(asset: Asset): string {
  const lines: string[] = [];
  lines.push(`# ${asset.displayName}`);
  lines.push("");
  // Group by source-region semantics (simplified: just emit in order)
  for (const seg of asset.librarySegments) {
    lines.push(`  [${seg.id}] ${seg.utteranceText}`);
  }
  return lines.join("\n");
}

function buildSummary(state: CanonicalState, library: Map<string, string>, totalSegments: number): string {
  const assetCount = state.assets.length;
  return [
    `Materialized timeline.md and library/*.md (${assetCount} source${assetCount === 1 ? "" : "s"}). ${totalSegments} segment${totalSegments === 1 ? "" : "s"} playing.`,
    ...library.size > 0
      ? [...library.keys()].map(k => `  - ${k}`)
      : [],
    `Workspace files: use read_workspace_file/edit_workspace_file/write_workspace_file on timeline.md and library/*.md in Codex plugin sessions, or the equivalent CreatorOS workspace Read/Edit/Write tools in native agent sessions. Do not use similarly named files outside this MCP workspace.`,
    `Important: library/*.md files are source libraries, not timeline files. Do not paste whole library files into timeline.md; preserve timeline.md's top markers and place copied rows under a ## track section and matching ### source region.`,
  ].join("\n");
}
```

```ts
// markdown-renderer/stamps.ts
import { createHash } from "node:crypto";
import type { CanonicalState } from "./types";

export function computeStamp(state: CanonicalState): string {
  const payload = state.tracks
    .flatMap(t => t.items.map(i => ({
      assetId: i.assetId,
      durationMs: i.durationMs,
      fromMs: i.fromMs,
      isClip: i.isClip,
      segmentIds: i.segments.map(s => `${s.id}:${s.utteranceText.length}`).join(","),
      trackId: t.id,
    })))
    .map(p => JSON.stringify(p))
    .join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export function computeLibraryStamp(state: CanonicalState): string {
  const payload = state.assets
    .map(a => `${a.id}:${a.librarySegments.map(s => s.utteranceText).join("|")}`)
    .join(";");
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}
```

```ts
// usage.ts
import { renderMarkdown } from "markdown-renderer";

const state: CanonicalState = {
  // ... 你的 state
  projectId: "proj_xxx",
  timelineId: "tl_001",
  trackId: "tr_001",
  fps: 30,
  assets: [...],
  tracks: [...],
  items: [...],
};

const { scriptMd, libraryDocs, summary } = renderMarkdown(state, {
  showSilence: true,
  silenceThresholdMs: 500,
});

console.log(scriptMd);
console.log("\n--- Summary ---\n", summary);

for (const [filename, content] of libraryDocs) {
  console.log(`\n--- ${filename} ---\n${content}`);
}
```
