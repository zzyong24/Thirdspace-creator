# 33 参考原代码块

来源：`/Users/zyongzhu/ThirdSpace/03-知识/ChatCut-架构分析/extracted/20261013_33-code_-_error-batching_模块（formatBatchedApplyErrors_+_drift_detection）.md`

原文件SHA256：`51960dfe04490396c9fad5402a7dc4e37ba3322dfdf9c772211575f293126f23`

以下TypeScript代码块逐字保留，包括原缺漏，不作为运行时模块加载。

```ts
// error-batching/format.ts

export interface ApplyError {
  message: string;
  hint?: string;
  /** 标记是否可能是 drift 引起（段编号偏移） */
  driftCandidate?: boolean;
  /** 可选：其他上下文 */
  [key: string]: unknown;
}

const CAP = 10;
const SCRIPT_FILENAME = "timeline.md";

/**
 * Format a list of apply errors for display to the agent.
 *
 * Strategy:
 * 1. If >=60% are drift candidates → emit "re-Read" hint first
 * 2. Show first CAP errors in detail
 * 3. If more, say "+N more errors (capped at CAP)"
 * 4. If many of same type, suggest re-reading the spec
 */
export function formatBatchedApplyErrors(errors: ApplyError[]): string {
  if (errors.length === 0) return "No errors.";

  const cap = CAP;
  const shown = errors.slice(0, cap);
  const remaining = errors.length - shown.length;
  const lines: string[] = [
    `Apply rejected: ${errors.length} issue${errors.length === 1 ? "" : "s"} in ${SCRIPT_FILENAME}. Fix ALL before retrying.`,
    "",
  ];

  // Drift detection
  const drift = errors.filter(e => e.driftCandidate).length;
  if (drift >= 3 && drift / errors.length >= 0.6) {
    lines.push(
      `Likely cause: \`[sN]\` segment numbering shifted since your last Read (re-segmentation usually fires after \`manage_transcript\` action \`fix\` modifies punctuation, or when word-level transcription completes in the background). The lines below look correct against the segments they USED to point at, just off by a few positions.`,
    );
    lines.push(
      `Quickest fix: **re-Read \`${SCRIPT_FILENAME}\`** to get the current numbering, then re-stage your edits against the new \`[sN]\` ids. Don't try to fix each line individually — the drift affects every anchor uniformly.`,
    );
    lines.push("");
  }

  // Show first N
  shown.forEach((error, errorIdx) => {
    lines.push(`[${errorIdx + 1}] ${error.message}`);
    if (error.hint) {
      for (const hintLine of error.hint.split("\n")) {
        lines.push(`    ${hintLine}`);
      }
    }
    lines.push("");
  });

  if (remaining > 0) {
    lines.push(
      `+ ${remaining} more error${remaining === 1 ? "" : "s"} (capped at ${cap} for readability).`,
    );
    lines.push(
      `If you're seeing many errors of the same type, you may have misunderstood the editing convention — consider re-reading the read_script description, or re-Read \`${SCRIPT_FILENAME}\` and start over from the current canonical state.`,
    );
  }
  return lines.join("\n");
}
```

```ts
// error-batching/drift-detect.ts
import type { ApplyError } from "./format";

/**
 * Heuristic: an error is a "drift candidate" if the message mentions
 * a missing segment / anchor / library row that was likely valid
 * before re-segmentation.
 */
export function isDriftCandidate(error: ApplyError): boolean {
  const driftPatterns = [
    /Unknown segment/i,
    /Anchor must exist/i,
    /Library row.*not found/i,
    /\[s\d+\].*not (found|exist)/i,
  ];
  return driftPatterns.some(p => p.test(error.message));
}

/**
 * Decorate a list of errors with drift detection.
 */
export function annotateDriftCandidates(errors: ApplyError[]): ApplyError[] {
  return errors.map(e => ({ ...e, driftCandidate: isDriftCandidate(e) }));
}
```

```ts
// error-batching/integration.ts
import type { ApplyError } from "error-batching/format";
import { annotateDriftCandidates } from "error-batching/drift-detect";
import { formatBatchedApplyErrors } from "error-batching/format";
import { ScriptError } from "error-formatting/types";

/**
 * Wrap applyScript's error collection into a single batched error.
 */
export function throwBatchedApplyErrors(errors: ApplyError[]): never {
  if (errors.length === 0) {
    // 不应该走到这里
    throw new ScriptError("Internal: throwBatchedApplyErrors called with empty list");
  }
  const annotated = annotateDriftCandidates(errors);
  const message = formatBatchedApplyErrors(annotated);
  throw new ScriptError(message, "Read the formatted errors above carefully.");
}
```

```ts
// usage.ts
import { formatBatchedApplyErrors, annotateDriftCandidates } from "error-batching";

const errors: ApplyError[] = [
  { message: "Unknown segment `intro.mp4/[s3]` referenced in timeline.md.", hint: "..." },
  { message: "Unknown segment `intro.mp4/[s4]` referenced in timeline.md.", hint: "..." },
  { message: "Unknown segment `outro.mp4/[s7]` referenced in timeline.md.", hint: "..." },
  { message: "Unknown segment `outro.mp4/[s8]` referenced in timeline.md.", hint: "..." },
  { message: "Unknown segment `outro.mp4/[s9]` referenced in timeline.md.", hint: "..." },
  // ... 30 more
];

// Auto-annotate drift candidates
const annotated = annotateDriftCandidates(errors);
const text = formatBatchedApplyErrors(annotated);
console.log(text);
```
