# 34 参考原代码块

来源：`/Users/zyongzhu/ThirdSpace/03-知识/ChatCut-架构分析/extracted/20261013_34-code_-_track-alias-validation_模块（V1_V2_A1_A2_完整规则）.md`

原文件SHA256：`065e7074375ef123baa6920737d86c7ed4cd2f8508fd2bb16fddfb4feb90beff`

以下TypeScript代码块逐字保留，包括原缺漏，不作为运行时模块加载。

```ts
// track-alias-validation/regex.ts

/**
 * Strict track alias regex: 1 letter (V or A) + 1-9 digit(s), no leading zero.
 * The 1-9 first digit prevents aliases like "V0" or "V0123".
 */
export const TRACK_ALIAS_RE = /^([VA])([1-9]\d*)$/;

/** Looser version (used in some places) */
export const TRACK_ALIAS_RE_LOOSE = /^[av]\d+$/i;

/** Parse an alias, return null if invalid */
export function parseTrackAlias(alias: string): { kind: "video" | "audio"; number: number } | null {
  const m = TRACK_ALIAS_RE.exec(alias);
  if (!m) return null;
  return {
    kind: m[1] === "V" ? "video" : "audio",
    number: Number.parseInt(m[2]!, 10),
  };
}
```

```ts
// track-alias-validation/sequence.ts
import { parseTrackAlias } from "./regex";

export interface ExistingTrack {
  alias: string;
}

export type SequenceError =
  | { kind: "invalid-format"; alias: string; hint: string }
  | { kind: "skips-slot"; alias: string; expectedAlias: string; hint: string };

/**
 * Validate a new track alias against existing tracks.
 * Returns null if valid, error if invalid.
 */
export function validateNewTrackAlias(
  newAlias: string,
  existingTracks: ExistingTrack[],
): SequenceError | null {
  const parsed = parseTrackAlias(newAlias);
  if (!parsed) {
    return {
      kind: "invalid-format",
      alias: newAlias,
      hint: `Track aliases must look like V1/V2/A1/A2/.... Got: "${newAlias}".`,
    };
  }

  // 算现有 track 数量（按 kind 分类）
  const existingVideoCount = existingTracks
    .map(t => parseTrackAlias(t.alias))
    .filter((p): p is { kind: "video" | "audio"; number: number } => p?.kind === "video").length;
  const existingAudioCount = existingTracks
    .map(t => parseTrackAlias(t.alias))
    .filter((p): p is { kind: "video" | "audio"; number: number } => p?.kind === "audio").length;

  const expectedNumber = (parsed.kind === "video" ? existingVideoCount : existingAudioCount) + 1;
  if (parsed.number !== expectedNumber) {
    const existingAliases = existingTracks.map(t => t.alias).sort().join(", ") || "(none)";
    const expectedAlias = `${parsed.kind === "video" ? "V" : "A"}${expectedNumber}`;
    return {
      kind: "skips-slot",
      alias: newAlias,
      expectedAlias,
      hint: `Existing tracks: ${existingAliases}. To add a new ${parsed.kind} track use ${expectedAlias} (the next slot); larger numbers create gaps that can't be addressed.`,
    };
  }

  return null;
}
```

```ts
// track-alias-validation/markdown-validator.ts
import { parseTrackAlias, validateNewTrackAlias } from "./sequence";

/**
 * Validate track aliases referenced in a parsed markdown script.
 *
 * Returns list of errors with hints.
 */
export function validateMarkdownTrackAliases(
  parsedTrackAliases: string[],
  existingTracks: Array<{ alias: string }>,
): Array<{ message: string; hint?: string }> {
  const errors: Array<{ message: string; hint?: string }> = [];
  const seen = new Set<string>();

  for (const alias of parsedTrackAliases) {
    if (seen.has(alias)) continue;
    seen.add(alias);

    if (existingTracks.some(t => t.alias === alias)) {
      // 已有 → OK
      continue;
    }

    // 不在 existing 中 → 当作新建
    const error = validateNewTrackAlias(alias, existingTracks);
    if (error) {
      const hintText = error.hint;
      if (error.kind === "invalid-format") {
        errors.push({
          message: `Unknown track \`${alias}\` in timeline.md.`,
          hint: hintText,
        });
      } else {
        errors.push({
          message: `Unknown track \`${alias}\` in timeline.md skips a slot.`,
          hint: hintText,
        });
      }
    }
  }

  return errors;
}
```

```ts
// usage.ts
import { parseTrackAlias, validateNewTrackAlias } from "track-alias-validation";

// 1. 简单 parse
const parsed = parseTrackAlias("V2");
console.log(parsed);  // { kind: "video", number: 2 }

// 2. 验证连续性
const existing = [{ alias: "V1" }];

const r1 = validateNewTrackAlias("V2", existing);
console.log(r1);  // null (valid)

const r2 = validateNewTrackAlias("V3", existing);
console.log(r2);
// { kind: "skips-slot", alias: "V3", expectedAlias: "V2", hint: "..." }

const r3 = validateNewTrackAlias("V0", existing);
console.log(r3);
// { kind: "invalid-format", alias: "V0", hint: "Track aliases must look like V1/V2/A1/A2/..." }

const r4 = validateNewTrackAlias("ABC", existing);
console.log(r4);
// { kind: "invalid-format", alias: "ABC", hint: "..." }
```
