import type { JsonSchema } from "./schema-bridge";

export interface CompletionPolicyV1 {
  schemaVersion: 1;
  minSegments: number;
  maxSegments: number | null;
  requiredSequence: string[];
  repairAttempts: number;
}

export interface CompletionPolicyAdapterRef {
  id: string;
  version: string;
}

export type EditableSkillField =
  | "system"
  | "template"
  | "tools"
  | "requiredFacets"
  | "outputSchema"
  | "completionPolicy";

export interface OfficialSkillBase {
  skillId: string;
  baseVersion: string;
  methodSystem: string;
  template: string;
  tools: string[];
  requiredFacets: string[];
  contextRequirements: string[];
  availableFacets: string[];
  editableFields: EditableSkillField[];
  outputSchema: JsonSchema | null;
  completionPolicy: CompletionPolicyV1 | null;
  completionPolicyAdapter: CompletionPolicyAdapterRef | null;
}

export interface EffectiveSkillSnapshotV1 {
  snapshotVersion: 1;
  userId: string;
  accountId: string;
  resolvedAt: string;
  platformPolicyVersion: string;
  platformPolicy: string;
  skills: Array<{
    skillId: string;
    baseVersion: string;
    overlayRevision: number | null;
    overlayVersion: string | null;
    effective: {
      methodSystem: string;
      template: string;
      tools: string[];
      requiredFacets: string[];
      contextRequirements: string[];
      outputSchema: JsonSchema | null;
      completionPolicy: CompletionPolicyV1 | null;
      completionPolicyAdapter: CompletionPolicyAdapterRef | null;
    };
  }>;
}

export type EffectiveSkill = EffectiveSkillSnapshotV1["skills"][number];
