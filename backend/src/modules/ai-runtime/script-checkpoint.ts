import { createHash } from "node:crypto";

export interface ScriptDraftCheckpoint extends Record<string, unknown> {
  schemaVersion: 1;
  inputFingerprint: string;
  stage: "voiceover_started" | "voiceover_failed" | "voiceover_complete";
  voiceover?: string;
  centralClaim?: string;
  audienceOldBelief?: string;
  charCount?: number;
  sha256?: string;
  voiceoverSkillVersion: string;
  storyboardAttemptCount: number;
  voiceoverGeneration?: {
    finishReason: string;
    usage: {
      inputTokens: number | null;
      outputTokens: number | null;
      cachedTokens: number | null;
      totalTokens: number | null;
    };
    attempts: Array<Record<string, unknown>>;
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function scriptDraftInputFingerprint(value: unknown): string {
  // SEMANTIC_BOUNDARY_ALLOW: 指纹只判断恢复输入与 Skill 快照是否逐字段相同，
  // 不做写作语义、内容质量或素材匹配判断。
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

export function effectiveVersion(skill: {
  baseVersion: string;
  overlayVersion: string | null;
}): string {
  return skill.overlayVersion ?? skill.baseVersion;
}

export function readScriptDraftCheckpoint(
  runtimeData: Record<string, unknown>,
  expected: { inputFingerprint: string; voiceoverSkillVersion: string },
): ScriptDraftCheckpoint | null {
  const raw = runtimeData.scriptDraftCheckpoint;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (
    value.schemaVersion !== 1 ||
    value.inputFingerprint !== expected.inputFingerprint ||
    value.voiceoverSkillVersion !== expected.voiceoverSkillVersion ||
    !["voiceover_started", "voiceover_failed", "voiceover_complete"].includes(
      String(value.stage),
    ) ||
    typeof value.storyboardAttemptCount !== "number" ||
    !Number.isInteger(value.storyboardAttemptCount) ||
    value.storyboardAttemptCount < 0 ||
    value.storyboardAttemptCount > 2
  ) {
    throw new Error(
      "写稿恢复断点与当前输入或 Skill 版本不一致，已停止重复生成。",
    );
  }
  const checkpoint = value as unknown as ScriptDraftCheckpoint;
  if (checkpoint.stage === "voiceover_complete") {
    const voiceover =
      typeof checkpoint.voiceover === "string" ? checkpoint.voiceover : "";
    const hash = createHash("sha256").update(voiceover).digest("hex");
    if (
      !voiceover ||
      checkpoint.charCount !== voiceover.length ||
      checkpoint.sha256 !== hash ||
      !checkpoint.voiceoverGeneration
    ) {
      throw new Error("写稿恢复断点中的连续口播不完整，已停止重复生成。");
    }
  }
  return checkpoint;
}
