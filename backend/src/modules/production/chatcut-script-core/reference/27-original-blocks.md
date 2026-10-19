# 27 参考原代码块

来源：`/Users/zyongzhu/ThirdSpace/03-知识/ChatCut-架构分析/extracted/20261013_27-code_-_error-formatting_模块（ScriptError_+_zod_错误转换）.md`

原文件SHA256：`7b741f939de769f5d69d3d4619500bf8e67c24293924e7bcb716f44f4fc5e68c`

以下TypeScript代码块逐字保留，包括原缺漏，不作为运行时模块加载。

```ts
// error-formatting/types.ts

export class ScriptError extends Error {
  /** Short, single-line error message */
  readonly message: string;
  /** Detailed hint with examples / how to fix */
  readonly hint: string;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = "ScriptError";
    this.message = message;
    this.hint = hint ?? "";
  }

  /** Format for log / display */
  toString(): string {
    return this.hint ? `${this.message}\n\nHint: ${this.hint}` : this.message;
  }
}
```

```ts
// error-formatting/field-hints.ts

/** Map field name → custom error message + hint */
export const FIELD_SUGGESTION_HINTS: Record<string, string> = {
  audioFadeIn: "Use audioFadeIn / audioFadeOut for audio or video volume fades. Values are seconds, not frames.",
  audioFadeOut: "Use audioFadeIn / audioFadeOut for audio or video volume fades. Values are seconds, not frames.",
  fadeIn: "Use fadeIn / fadeOut for native visual item fades. Values are seconds, not frames.",
  fadeOut: "Use fadeIn / fadeOut for native visual item fades. Values are seconds, not frames.",
  sourceStartFromInSeconds: "Use sourceStartFromInSeconds for video, audio, or gif source trimming. It is the single edit_item source-offset field.",
  volume: "There is no volume field. Use decibelAdjustment in dB instead, e.g. -60 for silence, -6 for quieter, 0 unchanged, +3 louder.",
};

/** Map field name → {field, hint} for renaming suggestions */
export const UNSUPPORTED_FIELD_SUGGESTIONS: Record<string, { field?: string; hint: string }> = {
  audioStartFromInSeconds: { field: "sourceStartFromInSeconds", hint: FIELD_SUGGESTION_HINTS.sourceStartFromInSeconds! },
  captionStartInSeconds: { field: "sourceStartFromInSeconds", hint: FIELD_SUGGESTION_HINTS.sourceStartFromInSeconds! },
  videoStartFromInSeconds: { field: "sourceStartFromInSeconds", hint: FIELD_SUGGESTION_HINTS.sourceStartFromInSeconds! },
  gifStartFromInSeconds: { field: "sourceStartFromInSeconds", hint: FIELD_SUGGESTION_HINTS.sourceStartFromInSeconds! },

  effectAssetId: {
    hint: 'Effects are attached timeline items. To add an effect, use edit_item adds:[{type:"effect", targetItemId, assetId}].',
  },
  effectAssetIds: {
    hint: 'Effects are attached timeline items. Pass one {type:"effect", targetItemId, assetId} per target item.',
  },
  effectId: {
    hint: 'Effects are attached timeline items, not fields on regular items. Use preview_timeline for the effect id, then update that effect entry with type:"effect".',
  },
  effects: {
    hint: 'Effects are attached timeline items, not an "effects" array on regular items. Use edit_item adds:[{type:"effect", targetItemId, assetId}].',
  },
  keepAspectRatio: {
    hint: 'Do not pass keepAspectRatio. Media items are aspect-locked by default. Pass only width or height, or use fit:"cover"/fit:"contain".',
  },

  // 通用 size / scale 建议
  scale:  { hint: 'There is no scale/zoom field. To shrink a 1080x1920 clip to half, pass only width:540. To fill, pass left/top/width/height with fit:"cover".' },
  scaleX: { hint: 'There is no scale/zoom field. Use left/top/width/height instead.' },
  scaleY: { hint: 'There is no scale/zoom field. Use left/top/width/height instead.' },
  zoom:   { hint: 'There is no scale/zoom field. Add a builtin:zoom effect for animated zoom.' },
};
```

```ts
// error-formatting/levenshtein.ts

export function normalizeFieldName(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]!;
  }
  return prev[b.length]!;
}

export function findClosestKnownField(
  input: string,
  knownFields: string[],
  maxDistance: number = 3,
): string | null {
  const normalized = normalizeFieldName(input);
  let bestMatch: string | null = null;
  let bestDistance = Infinity;
  for (const field of knownFields) {
    const d = levenshteinDistance(normalized, normalizeFieldName(field));
    if (d < bestDistance) {
      bestDistance = d;
      bestMatch = field;
    }
  }
  return bestDistance <= maxDistance ? bestMatch : null;
}
```

```ts
// error-formatting/convert.ts
import type { ScriptError } from "./types";
import { UNSUPPORTED_FIELD_SUGGESTIONS, FIELD_SUGGESTION_HINTS } from "./field-hints";
import { findClosestKnownField, normalizeFieldName } from "./levenshtein";

interface ZodIssue {
  code: string;
  path: Array<string | number>;
  message: string;
  keys?: string[];
}

function getZodIssues(error: any): ZodIssue[] {
  if (error && typeof error === "object" && "issues" in error && Array.isArray(error.issues)) {
    return error.issues;
  }
  return [];
}

/**
 * Convert a zod error to a ScriptError with rich hints.
 *
 * Strategy:
 * 1. If unrecognized_keys issue → suggest closest known field
 * 2. Else if path ends with known field name → look up hint
 * 3. Else fall back to generic hint
 */
export function zodErrorToScriptError(
  error: any,
  context: string = "request body",
  knownFields: string[] = [],
): ScriptError {
  const issues = getZodIssues(error);
  const first = issues[0];
  if (!first) {
    return new ScriptError(`Request validation failed: ${context}.`, "Check your input shape.");
  }

  const formatField = (issue: ZodIssue) =>
    issue.path && issue.path.length > 0
      ? `${context}.${issue.path.join(".")}`
      : context;

  // 1. Unrecognized keys (typo)
  const unknownFieldIssue = issues.find(
    i => i.code === "unrecognized_keys" && i.keys && i.keys.length > 0
  );
  if (unknownFieldIssue) {
    return formatUnknownFieldError(unknownFieldIssue, formatField(unknownFieldIssue), knownFields);
  }
  if (first.code === "unrecognized_keys") {
    return formatUnknownFieldError(first, formatField(first), knownFields);
  }

  // 2. Known field names → specific hint
  const lastPathPart = first.path?.[first.path.length - 1];
  if (typeof lastPathPart === "string") {
    const suggestion = UNSUPPORTED_FIELD_SUGGESTIONS[lastPathPart];
    if (suggestion) {
      return new ScriptError(
        `Request validation failed: ${formatField(first)}: ${first.message}.`,
        suggestion.hint,
      );
    }
    // 通用 hint
    if (lastPathPart === "type" && first.message === "Invalid input") {
      return new ScriptError(
        `Request validation failed: ${formatField(first)}: missing or unsupported item type.`,
        `Set type to one of: video, audio, image, gif, svg, motion-graphic, effect, transition.`,
      );
    }
    if (lastPathPart === "durationInFrames") {
      return new ScriptError(
        `Request validation failed: ${formatField(first)}: expected a positive frame count.`,
        `Use a positive durationInFrames integer. Use "3s" / "1:30" strings only when the user supplied a time value.`,
      );
    }
    if (lastPathPart === "fromFrame" || lastPathPart === "from") {
      return new ScriptError(
        `Request validation failed: ${formatField(first)}: expected a non-negative start position.`,
        `Use fromFrame with a non-negative integer. Use "5s" / "1:30" strings only for legacy time inputs.`,
      );
    }
    if (lastPathPart === "assetId") {
      return new ScriptError(
        `Request validation failed: ${formatField(first)}: missing or invalid asset reference.`,
        `Use an asset prefix from browse_assets for media-backed item types, or choose an item type that does not need assetId (solid, captions).`,
      );
    }
  }

  // 3. Fallback
  return new ScriptError(
    `Request validation failed: ${formatField(first)}: ${first.message}`,
    "Check the schema docs.",
  );
}

function formatUnknownFieldError(
  issue: ZodIssue,
  field: string,
  knownFields: string[],
): ScriptError {
  const unknownField = issue.keys?.[0] ?? issue.path[issue.path.length - 1];
  const known = typeof unknownField === "string" ? unknownField : String(unknownField);

  if (knownFields.length > 0) {
    const closest = findClosestKnownField(known, knownFields);
    if (closest) {
      return new ScriptError(
        `Request validation failed: ${field}: unknown field "${known}".`,
        `Did you mean "${closest}"? (Available: ${knownFields.slice(0, 8).join(", ")}...)`,
      );
    }
  }

  // 静态 mapping
  const suggestion = UNSUPPORTED_FIELD_SUGGESTIONS[known];
  if (suggestion) {
    return new ScriptError(
      `Request validation failed: ${field}: unknown field "${known}".`,
      suggestion.hint,
    );
  }

  return new ScriptError(
    `Request validation failed: ${field}: unknown field "${known}".`,
    `Check the schema for valid field names.`,
  );
}
```

```ts
// usage.ts
import { z } from "zod";
import { ScriptError, zodErrorToScriptError } from "error-formatting";

const EditItemSchema = z.object({
  type: z.enum(["video", "audio", "image", "gif", "svg", "motion-graphic", "effect", "transition"]),
  assetId: z.string().min(1).optional(),
  durationInFrames: z.number().int().positive(),
  fromFrame: z.number().int().nonnegative(),
  sourceStartFromInSeconds: z.number().nonnegative().optional(),
  fadeIn: z.number().nonnegative().optional(),
  fadeOut: z.number().nonnegative().optional(),
});

const KNOWN_FIELDS = Object.keys(EditItemSchema.shape);

function editItem(args: unknown) {
  const parsed = EditItemSchema.safeParse(args);
  if (!parsed.success) {
    throw zodErrorToScriptError(parsed.error, "edit_item args", KNOWN_FIELDS);
  }
  // ...
}

// 用户传错字段名：
try {
  editItem({ type: "video", duration: 60, from: 0 });
  //            ^^^^^^^^^^ durationInFrames 才对
} catch (err) {
  console.log(err.message);
  // "Request validation failed: edit_item args.durationInFrames: Required."
  console.log(err.hint);
  // "Use a positive durationInFrames integer..."
}

// 用户传完全不存在的字段：
try {
  editItem({ type: "video", scale: 2, fromFrame: 0, durationInFrames: 60 });
} catch (err) {
  console.log(err.message);
  // "Request validation failed: edit_item args: unknown field 'scale'."
  console.log(err.hint);
  // "There is no scale/zoom field. To shrink a 1080x1920 clip to half, pass only width:540..."
}
```
