// Server-only runtime: Node AsyncLocalStorage is intentionally used here so an
// effective Skill snapshot can never become browser/global mutable state.
import { AsyncLocalStorage } from "node:async_hooks";
import { jsonSchema as sdkJsonSchema, type FlexibleSchema } from "ai";
import type { PromptTemplate } from "./template";
import { applySchemaOverride } from "./schema-bridge";
import type {
  EffectiveSkill,
  EffectiveSkillSnapshotV1,
} from "./effective-skill-types";

export type {
  CompletionPolicyAdapterRef,
  CompletionPolicyV1,
  EditableSkillField,
  EffectiveSkill,
  EffectiveSkillSnapshotV1,
  OfficialSkillBase,
} from "./effective-skill-types";

export type EffectiveSkillRuntimeErrorCode =
  | "SKILL_SNAPSHOT_INVALID"
  | "SKILL_SNAPSHOT_MISSING"
  | "SKILL_SNAPSHOT_INCOMPLETE";

export class EffectiveSkillRuntimeError extends Error {
  constructor(
    readonly code: EffectiveSkillRuntimeErrorCode,
    message: string,
  ) {
    super(`[${code}] ${message}`);
    this.name = "EffectiveSkillRuntimeError";
  }
}

const activeSnapshot = new AsyncLocalStorage<EffectiveSkillSnapshotV1>();

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function immutableSnapshot(
  source: EffectiveSkillSnapshotV1,
): EffectiveSkillSnapshotV1 {
  if (
    source.snapshotVersion !== 1 ||
    !source.userId.trim() ||
    !source.accountId.trim() ||
    !source.platformPolicyVersion.trim() ||
    !source.platformPolicy.trim()
  ) {
    throw new EffectiveSkillRuntimeError(
      "SKILL_SNAPSHOT_INVALID",
      "snapshot 缺少版本、owner tuple 或 immutable platform policy",
    );
  }
  const ids = source.skills.map((skill) => skill.skillId);
  if (
    ids.some((id) => !id.trim()) ||
    new Set(ids).size !== ids.length ||
    ids.some((id, index) => index > 0 && ids[index - 1]! > id)
  ) {
    throw new EffectiveSkillRuntimeError(
      "SKILL_SNAPSHOT_INVALID",
      "skills 必须按 skillId 升序且无重复",
    );
  }
  return deepFreeze(structuredClone(source));
}

export function runWithEffectiveSkillSnapshot<T>(
  snapshot: EffectiveSkillSnapshotV1,
  fn: () => Promise<T>,
): Promise<T> {
  return activeSnapshot.run(immutableSnapshot(snapshot), fn);
}

export function getActiveEffectiveSkillSnapshot(): EffectiveSkillSnapshotV1 {
  const snapshot = activeSnapshot.getStore();
  if (!snapshot) {
    throw new EffectiveSkillRuntimeError(
      "SKILL_SNAPSHOT_MISSING",
      "运行态未绑定 effective Skill snapshot",
    );
  }
  return snapshot;
}

export function hasActiveEffectiveSkillSnapshot(): boolean {
  return activeSnapshot.getStore() !== undefined;
}

export function getEffectiveSkill(skillId: string): EffectiveSkill {
  const skill = getActiveEffectiveSkillSnapshot().skills.find(
    (entry) => entry.skillId === skillId,
  );
  if (!skill) {
    throw new EffectiveSkillRuntimeError(
      "SKILL_SNAPSHOT_INCOMPLETE",
      `snapshot 缺少 required skill: ${skillId}`,
    );
  }
  return skill;
}

export function getEffectiveTemplate(skillId: string): PromptTemplate {
  const skill = getEffectiveSkill(skillId);
  return {
    id: skill.skillId,
    version:
      skill.overlayVersion ??
      `${skill.baseVersion}@${skill.overlayRevision ?? "official"}`,
    system: skill.effective.methodSystem,
    template: skill.effective.template,
    requiredFacets: skill.effective.requiredFacets,
    contextRequirements: skill.effective.contextRequirements,
    tools: skill.effective.tools,
  };
}

export function getEffectiveTools(skillId: string): readonly string[] {
  return getEffectiveSkill(skillId).effective.tools;
}

export function getEffectiveContextRequirements(
  skillId: string,
): readonly string[] {
  return getEffectiveSkill(skillId).effective.contextRequirements;
}

export function resolveEffectiveOutputSchema(
  skillId: string,
): FlexibleSchema<unknown> {
  const jsonSchema = getEffectiveSkill(skillId).effective.outputSchema;
  if (!jsonSchema) {
    throw new EffectiveSkillRuntimeError(
      "SKILL_SNAPSHOT_INCOMPLETE",
      `effective skill "${skillId}" 未声明 outputSchema`,
    );
  }
  const validator = applySchemaOverride(jsonSchema);
  return sdkJsonSchema(validator.jsonSchema as never, {
    validate: (value) => {
      const normalized = validator.normalize(value);
      const result = validator.validate(normalized);
      return result.valid
        ? { success: true, value: normalized }
        : {
            success: false,
            error: new Error(
              `effective outputSchema 校验失败: ${
                result.errors[0]?.message ?? "shape mismatch"
              }`,
            ),
          };
    },
  });
}
