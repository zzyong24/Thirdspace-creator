# 28 参考原代码块

来源：`/Users/zyongzhu/ThirdSpace/03-知识/ChatCut-架构分析/extracted/20261013_28-code_-_auto-correct-chain_模块（markdown_编辑容错恢复）.md`

原文件SHA256：`7c7b41c99d12563ce0b81e217557b8c3331d6010bf08006fcb8e8e4faf669e5e`

以下TypeScript代码块逐字保留，包括原缺漏，不作为运行时模块加载。

```ts
// auto-correct-chain/types.ts

export interface Segment {
  id: number;                // localId
  assetId: string;
  words: Array<{ text: string; startMs: number; endMs: number }>;
  defaultKept?: boolean;
}

export interface ParsedEntry {
  kind: "segment" | "clip" | "gap";
  trackAlias: string;
  assetId: string;
  segLocalId: number;
  instanceIdx: number;
  text: string;
}

export interface AutoCorrectResult {
  entries: ParsedEntry[];
  /** Warning 消息列表（每条对应一次自动修正） */
  warnings: string[];
  /** Error 消息列表（每条对应一个无法修正的 entry） */
  errors: Array<{ message: string; hint?: string }>;
}
```

```ts
// auto-correct-chain/normalize.ts

/** 归一化文本用于匹配：lowercase + Unicode 标点 + 空白 */
export function normalizeWithMap(text: string): {
  norm: string;
  /** norm[i] 对应原 text 的哪个 index（取左闭区间） */
  normToOrig: number[];
} {
  const norm: string[] = [];
  const normToOrig: number[] = [];
  let lastWasSpace = true;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!.toLowerCase();
    if (isPunctOrSpace(ch)) {
      if (!lastWasSpace) {
        norm.push(" ");
        normToOrig.push(i);
        lastWasSpace = true;
      }
    } else {
      norm.push(ch);
      normToOrig.push(i);
      lastWasSpace = false;
    }
  }
  // 去尾空格
  while (norm.length > 0 && norm[norm.length - 1] === " ") {
    norm.pop();
    normToOrig.pop();
  }
  return { norm: norm.join(""), normToOrig };
}

function isPunctOrSpace(ch: string): boolean {
  return /[\p{P}\p{S}\s]/u.test(ch);
}

/** 进一步紧凑：去掉所有空白 */
export function stripWhitespaceFromNormalized(n: { norm: string; normToOrig: number[] }): {
  norm: string;
  normToOrig: number[];
} {
  const norm: string[] = [];
  const normToOrig: number[] = [];
  for (let i = 0; i < n.norm.length; i++) {
    if (n.norm[i] !== " ") {
      norm.push(n.norm[i]!);
      normToOrig.push(n.normToOrig[i]!);
    }
  }
  return { norm: norm.join(""), normToOrig };
}

/** 找所有 norm 出现 normQuery 的位置（多结果） */
export function findAllOccurrences(haystack: string, needle: string): number[] {
  if (needle.length === 0) return [];
  const out: number[] = [];
  let pos = 0;
  while (pos <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) break;
    out.push(idx);
    pos = idx + 1;
  }
  return out;
}
```

```ts
// auto-correct-chain/chain.ts
import type { Segment, ParsedEntry, AutoCorrectResult } from "./types";
import { normalizeWithMap, stripWhitespaceFromNormalized, findAllOccurrences } from "./normalize";

export interface AutoCorrectOptions {
  /** All available segments (for lookup) */
  segments: Segment[];
  /** Display name for an assetId (for warning messages) */
  displayNameByAssetId: Map<string, string>;
  /** Library slug for an assetId (for hint URLs) */
  librarySlugByAssetId: Map<string, string>;
}

/**
 * Apply the full auto-correct chain to a list of parsed entries.
 *
 * Mutates each entry in place (re-point segLocalId to correct value).
 * Returns the warnings/errors accumulated.
 */
export function applyAutoCorrectChain(
  entries: ParsedEntry[],
  options: AutoCorrectOptions,
): AutoCorrectResult {
  const warnings: string[] = [];
  const errors: Array<{ message: string; hint?: string }> = [];
  const segById = new Map<number, Segment>();
  for (const s of options.segments) segById.set(s.id, s);

  for (const entry of entries) {
    if (entry.kind !== "segment") continue;
    let segment = segById.get(entry.segLocalId);

    // Phase 1: ID 直接匹配
    if (segment) {
      const matched = matchByText(segment, entry.text);
      if (matched) continue;  // 完全 match
      // ID match but text not match — 降级
    }

    // Phase 2: 同 asset 下找文字匹配的 segment
    const sameAsset = options.segments.filter(s => s.assetId === entry.assetId);
    const textMatch = findByTextInSet(sameAsset, entry.text);
    if (textMatch) {
      const display = options.displayNameByAssetId.get(entry.assetId) ?? entry.assetId;
      const corrected = textMatch;
      warnings.push(
        `\`${display}/[s${entry.segLocalId}]\` → [s${corrected.id}]: segment number did not match its source text; this line's text uniquely identifies [s${corrected.id}] — auto-corrected. Re-read the markdown to see the corrected numbering.`,
      );
      entry.segLocalId = corrected.id;
      segment = corrected;
      continue;
    }

    // Phase 3: 紧凑匹配（同 asset + 去掉空白）
    const compactText = entry.text.replace(/\s+/g, "").toLowerCase();
    const compactMatch = sameAsset.find(s => {
      const compactSeg = s.words.map(w => w.text).join("").replace(/\s+/g, "").toLowerCase();
      return compactSeg === compactText;
    });
    if (compactMatch) {
      const display = options.displayNameByAssetId.get(entry.assetId) ?? entry.assetId;
      warnings.push(
        `\`${display}/[s${entry.segLocalId}]\` → [s${compactMatch.id}]: segment number matched after ignoring whitespace/punctuation. Auto-corrected.`,
      );
      entry.segLocalId = compactMatch.id;
      segment = compactMatch;
      continue;
    }

    // Phase 4: 完全失败
    const display = options.displayNameByAssetId.get(entry.assetId) ?? entry.assetId;
    const slug = options.librarySlugByAssetId.get(entry.assetId) ?? entry.assetId;
    errors.push({
      message: `Unknown segment \`${display}/[s${entry.segLocalId}]\` referenced in timeline.md.`,
      hint: `Anchor must exist in library/${slug}.md. If you intended a different source, switch the surrounding ### ${display} H3.`,
    });
    // 不 continue —— 让 caller 决定怎么处理（一般会 skip 这个 entry）
  }

  return { entries, errors, warnings };
}

function matchByText(segment: Segment, text: string): boolean {
  const segText = segment.words.map(w => w.text).join("").trim();
  const segNorm = normalizeWithMap(segText);
  const txtNorm = normalizeWithMap(text);
  if (segNorm.norm === txtNorm.norm) return true;
  // 紧凑
  return stripWhitespaceFromNormalized(segNorm).norm === stripWhitespaceFromNormalized(txtNorm).norm;
}

function findByTextInSet(segments: Segment[], text: string): Segment | null {
  const txtNorm = normalizeWithMap(text);
  const txtCompact = stripWhitespaceFromNormalized(txtNorm);
  for (const s of segments) {
    const segText = s.words.map(w => w.text).join("").trim();
    const segNorm = normalizeWithMap(segText);
    if (segNorm.norm === txtNorm.norm) return s;
    if (stripWhitespaceFromNormalized(segNorm).norm === txtCompact.norm) return s;
  }
  return null;
}
```

```ts
// auto-correct-chain/integrated.ts
import { applyAutoCorrectChain } from "./chain";
import { parseMarkdown, validate } from "markdown-state";
import { computeStamp, computeLibraryStamp } from "markdown-state/stamps";
import type { CanonicalState } from "load-canonical-state";

/**
 * applyScript 的完整流程，含容错链。
 */
export async function applyScriptWithAutoCorrect(
  newMd: string,
  state: CanonicalState,
  options: {
    displayNameByAssetId: Map<string, string>;
    librarySlugByAssetId: Map<string, string>;
  },
): Promise<{ ok: true; warnings: string[] } | { ok: false; errors: Array<{ message: string; hint?: string }>; warnings: string[] }> {
  // 1. Stamps
  const diskStamp = extractStamp(newMd);
  const liveStamp = computeStamp(state);
  if (diskStamp && diskStamp !== liveStamp) {
    return {
      ok: false,
      errors: [{
        message: "The timeline was modified by another tool or by the user. Refresh and review before continuing.",
        hint: "Call read_script to re-materialize timeline.md and library/*.md, review the new state, then re-edit and apply_script() again.",
      }],
      warnings: [],
    };
  }
  const diskLibStamp = extractLibraryStamp(newMd);
  const liveLibStamp = computeLibraryStamp(state);
  if (diskLibStamp && diskLibStamp !== liveLibStamp) {
    return {
      ok: false,
      errors: [{
        message: "A source library transcript changed after timeline.md was materialized.",
        hint: "Call read_script to re-materialize, re-copy the library rows, then apply again.",
      }],
      warnings: [],
    };
  }

  // 2. Parse
  const assetIdByDisplayName = new Map<string, string>();
  for (const a of state.assets) assetIdByDisplayName.set(a.displayName, a.id);
  const parsed = parseMarkdown(newMd, { assetIdByDisplayName });
  if (!parsed.ok) {
    return { ok: false, errors: [{ message: `Parse error: ${parsed.error}`, hint: "Fix the file structure and retry." }], warnings: [] };
  }

  // 3. Auto-correct chain
  const ac = applyAutoCorrectChain(parsed.entries, {
    displayNameByAssetId: options.displayNameByAssetId,
    librarySlugByAssetId: options.librarySlugByAssetId,
    segments: state.segments,  // 需要 segments 字段
  });

  // 4. 至少一个 playable
  if (!ac.entries.some(e => !e.dropped)) {
    return {
      ok: false,
      errors: [{ message: "No playable content in the markdown.", hint: "Add at least one [sN] row." }],
      warnings: ac.warnings,
    };
  }

  if (ac.errors.length > 0) {
    return { ok: false, errors: ac.errors, warnings: ac.warnings };
  }

  return { ok: true, warnings: ac.warnings };
}
```

```ts
// usage.ts
import { applyAutoCorrectChain } from "auto-correct-chain";

const result = applyAutoCorrectChain(parsedEntries, {
  displayNameByAssetId: new Map([
    ["intro.mp4", "asset_001"],
    ["outro.mp4", "asset_002"],
  ]),
  librarySlugByAssetId: new Map([
    ["asset_001", "intro"],
    ["asset_002", "outro"],
  ]),
  segments: await db.getAllSegments(),
});

if (result.warnings.length > 0) {
  console.log("Auto-corrected:");
  for (const w of result.warnings) console.log(`  - ${w}`);
}
if (result.errors.length > 0) {
  console.log("Hard errors:");
  for (const e of result.errors) console.log(`  - ${e.message}\n    Hint: ${e.hint}`);
}

// result.entries 是修正后的 entries，可以继续 apply
```
