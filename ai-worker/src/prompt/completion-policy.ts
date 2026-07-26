import { getEffectiveSkill } from "./effective-skill-runtime";
import type {
  CompletionPolicyAdapterRef,
  CompletionPolicyV1,
} from "./effective-skill-types";
import type { JsonSchema } from "./schema-bridge";

export interface CompletionPolicyViolation {
  code:
    | "POLICY_INVALID"
    | "MIN_SEGMENTS"
    | "MAX_SEGMENTS"
    | "ROLE_INVALID"
    | "REQUIRED_SEQUENCE_MISMATCH"
    | "OUTPUT_INCOMPLETE";
  path: string;
  message: string;
}

export interface CompletionPolicyAdapter {
  id: string;
  version: string;
  supportsSchema(jsonSchema: JsonSchema): boolean;
  toSegments(value: unknown): readonly { role?: string | null }[];
}

export interface CompletionPolicyEvaluation {
  policy: CompletionPolicyV1;
  adapter: CompletionPolicyAdapterRef;
  segmentCount: number;
  errors: CompletionPolicyViolation[];
}

export interface CompletionPolicyFailureEvidence {
  finishReason: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    cachedTokens: number | null;
    totalTokens: number | null;
  };
  attempts: readonly {
    finishReason: string;
    usage: {
      inputTokens: number | null;
      outputTokens: number | null;
      cachedTokens: number | null;
      totalTokens: number | null;
    };
    kind: "initial" | "repair";
  }[];
}

export class CompletionPolicyRuntimeError extends Error {
  constructor(
    readonly code:
      | "COMPLETION_POLICY_UNSUPPORTED"
      | "COMPLETION_POLICY_VIOLATION"
      | "COMPLETION_POLICY_REPAIR_EXHAUSTED",
    message: string,
    readonly violations: readonly CompletionPolicyViolation[] = [],
    readonly originalSegmentCount: number | null = null,
    readonly finalSegmentCount: number | null = null,
    options?: ErrorOptions,
    readonly evidence?: CompletionPolicyFailureEvidence,
  ) {
    super(`[${code}] ${message}`, options);
    this.name = "CompletionPolicyRuntimeError";
  }
}

const adapters = new Map<string, CompletionPolicyAdapter>();
const ROLE_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

function adapterKey(ref: CompletionPolicyAdapterRef): string {
  return `${ref.id}@${ref.version}`;
}

export function registerOfficialCompletionPolicyAdapter(
  adapter: CompletionPolicyAdapter,
): void {
  const key = adapterKey(adapter);
  const existing = adapters.get(key);
  if (existing && existing !== adapter) {
    throw new Error(
      `official completionPolicy adapter append-only: ${key} 已注册，禁止原地改写`,
    );
  }
  if (!existing) adapters.set(key, Object.freeze(adapter));
}

export function listOfficialCompletionPolicyAdapters(): CompletionPolicyAdapterRef[] {
  return [...adapters.values()]
    .map(({ id, version }) => ({ id, version }))
    .sort((a, b) => adapterKey(a).localeCompare(adapterKey(b)));
}

function validatePolicyDefinition(
  policy: CompletionPolicyV1,
): CompletionPolicyViolation[] {
  const errors: CompletionPolicyViolation[] = [];
  if (
    policy.schemaVersion !== 1 ||
    !Number.isInteger(policy.minSegments) ||
    policy.minSegments < 1 ||
    policy.minSegments > 100
  ) {
    errors.push({
      code: "POLICY_INVALID",
      path: "minSegments",
      message: "minSegments 必须是 1..100 的整数",
    });
  }
  if (
    policy.maxSegments !== null &&
    (!Number.isInteger(policy.maxSegments) ||
      policy.maxSegments < policy.minSegments ||
      policy.maxSegments > 100)
  ) {
    errors.push({
      code: "POLICY_INVALID",
      path: "maxSegments",
      message: "maxSegments 必须为 null 或 minSegments..100 的整数",
    });
  }
  if (
    !Number.isInteger(policy.repairAttempts) ||
    policy.repairAttempts < 0 ||
    policy.repairAttempts > 3
  ) {
    errors.push({
      code: "POLICY_INVALID",
      path: "repairAttempts",
      message: "repairAttempts 必须是 0..3 的整数",
    });
  }
  if (
    !Array.isArray(policy.requiredSequence) ||
    policy.requiredSequence.length > 20
  ) {
    errors.push({
      code: "POLICY_INVALID",
      path: "requiredSequence",
      message: "requiredSequence 最多 20 项",
    });
  } else {
    for (const [index, rawRole] of policy.requiredSequence.entries()) {
      const role =
        typeof rawRole === "string" ? rawRole.trim().toLowerCase() : "";
      if (!ROLE_PATTERN.test(role)) {
        errors.push({
          code: "POLICY_INVALID",
          path: `requiredSequence.${index}`,
          message: `非法 role: ${String(rawRole)}`,
        });
      }
    }
  }
  return errors;
}

export function validateCompletionPolicy(
  policy: CompletionPolicyV1,
  segments: readonly { role?: string | null }[],
): { valid: boolean; errors: CompletionPolicyViolation[] } {
  const errors = validatePolicyDefinition(policy);
  if (segments.length < policy.minSegments) {
    errors.push({
      code: "MIN_SEGMENTS",
      path: "segments",
      message: `段落数 ${segments.length} 少于下限 ${policy.minSegments}`,
    });
  }
  if (
    policy.maxSegments !== null &&
    segments.length > policy.maxSegments
  ) {
    errors.push({
      code: "MAX_SEGMENTS",
      path: "segments",
      message: `段落数 ${segments.length} 超过上限 ${policy.maxSegments}`,
    });
  }
  const requiredSequence = Array.isArray(policy.requiredSequence)
    ? policy.requiredSequence
    : [];
  if (requiredSequence.length > 0) {
    const normalized: string[] = [];
    for (const [index, segment] of segments.entries()) {
      const rawRole =
        typeof segment === "object" && segment !== null
          ? segment.role
          : undefined;
      const role =
        typeof rawRole === "string" ? rawRole.trim().toLowerCase() : "";
      if (!ROLE_PATTERN.test(role)) {
        errors.push({
          code: "ROLE_INVALID",
          path: `segments.${index}.role`,
          message: `段落 role 不合法或缺失: ${String(rawRole ?? "")}`,
        });
        continue;
      }
      if (normalized[normalized.length - 1] !== role) normalized.push(role);
    }
    const required = requiredSequence.map((role) =>
      typeof role === "string" ? role.trim().toLowerCase() : "",
    );
    if (
      normalized.length !== required.length ||
      normalized.some((role, index) => role !== required[index])
    ) {
      errors.push({
        code: "REQUIRED_SEQUENCE_MISMATCH",
        path: "segments",
        message: `role 顺序必须完整等于 ${required.join(",")}`,
      });
    }
  }
  return { valid: errors.length === 0, errors };
}

export function evaluateCompletionPolicy(
  skillId: string,
  output: unknown,
): CompletionPolicyEvaluation | null {
  const { effective } = getEffectiveSkill(skillId);
  const policy = effective.completionPolicy;
  if (!policy) return null;
  const ref = effective.completionPolicyAdapter;
  const adapter = ref ? adapters.get(adapterKey(ref)) : undefined;
  let supportsSchema = false;
  try {
    supportsSchema = Boolean(
      adapter &&
        effective.outputSchema &&
        adapter.supportsSchema(effective.outputSchema),
    );
  } catch {
    supportsSchema = false;
  }
  if (!adapter || !effective.outputSchema || !supportsSchema) {
    throw new CompletionPolicyRuntimeError(
      "COMPLETION_POLICY_UNSUPPORTED",
      `skill "${skillId}" 的 adapter/schema 不可用`,
    );
  }
  let segments: readonly { role?: string | null }[];
  try {
    segments = adapter.toSegments(output);
  } catch (error) {
    throw new CompletionPolicyRuntimeError(
      "COMPLETION_POLICY_UNSUPPORTED",
      `skill "${skillId}" 无法提取结构化 segments: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!Array.isArray(segments)) {
    throw new CompletionPolicyRuntimeError(
      "COMPLETION_POLICY_UNSUPPORTED",
      `skill "${skillId}" adapter 未返回 segments 数组`,
    );
  }
  const result = validateCompletionPolicy(policy, segments);
  return {
    policy: structuredClone(policy),
    adapter: structuredClone(ref!),
    segmentCount: segments.length,
    errors: result.errors,
  };
}

export function enforceCompletionPolicy(
  skillId: string,
  output: unknown,
): CompletionPolicyEvaluation | null {
  const evaluation = evaluateCompletionPolicy(skillId, output);
  if (!evaluation) return null;
  const result = {
    valid: evaluation.errors.length === 0,
    errors: evaluation.errors,
  };
  if (!result.valid) {
    throw new CompletionPolicyRuntimeError(
      "COMPLETION_POLICY_VIOLATION",
      `skill "${skillId}" 输出未满足 completionPolicy`,
      result.errors,
      evaluation.segmentCount,
      evaluation.segmentCount,
    );
  }
  return evaluation;
}
