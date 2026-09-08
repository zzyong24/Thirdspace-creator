import type {
  ExecutionTaskResourceV2,
  RequestContext,
} from "@creatoros/contract";
import type { PersistentTaskService } from "../execution";
import {
  IntelligenceConflictError,
  IntelligenceValidationError,
} from "./intelligence.errors";
import type {
  ProjectIntelligenceReferenceService,
  ProjectIntelligenceSourceContext,
} from "./project-reference.service";

export type ScriptSimilarityRisk = "low" | "medium" | "high";

export interface ProjectScriptArtifactPort {
  listProjectArtifacts(
    ctx: RequestContext,
    projectId: string,
  ): Promise<Array<{
    id: string;
    artifactType: string;
    currentVersionId: string | null;
  }>>;
  createArtifact(
    ctx: RequestContext,
    input: {
      projectId: string;
      title: string;
      artifactType: string;
      stage: string;
    },
  ): Promise<{ id: string }>;
  listVersions(
    ctx: RequestContext,
    artifactId: string,
  ): Promise<Array<{ id: string; aiTaskId: string | null; contentData?:Record<string,unknown>|null }>>;
  createVersion(
    ctx: RequestContext,
    artifactId: string,
    input: {
      contentText: string;
      contentData: Record<string, unknown>;
      changeSummary: string;
      createdByType: string;
      aiTaskId: string;
    },
  ): Promise<{ id: string }>;
}

export interface ScriptSemanticSimilarityPort {
  evaluate(
    ctx: RequestContext,
    input: { candidateText: string; sourceTaskId:string; projectId:string },
  ): Promise<number>;
}

interface ScriptCandidateCheckpoint {
  candidateText: string;
  referenceIds: string[];
  strategy: string;
}

function checkpointOf(value: unknown): ScriptCandidateCheckpoint {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const referenceIds = Array.isArray(raw.referenceIds)
    ? raw.referenceIds.filter(
        (value): value is string => typeof value === "string" && !!value,
      )
    : [];
  if (
    typeof raw.candidateText !== "string" ||
    !raw.candidateText.trim() ||
    typeof raw.strategy !== "string" ||
    !raw.strategy.trim() ||
    referenceIds.length === 0
  ) {
    throw new IntelligenceConflictError("Project 稿件候选尚未生成完成");
  }
  return {
    candidateText: raw.candidateText,
    referenceIds,
    strategy: raw.strategy,
  };
}

function normalizedText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function hasSharedRun(
  candidate: string,
  source: string,
  threshold: number,
): boolean {
  if (candidate.length < threshold || source.length < threshold) return false;
  const [shorter, longer] =
    candidate.length <= source.length
      ? [candidate, source]
      : [source, candidate];
  for (let index = 0; index <= shorter.length - threshold; index += 1) {
    if (longer.includes(shorter.slice(index, index + threshold))) return true;
  }
  return false;
}

export function deterministicSimilarityRisk(
  candidateText: string,
  sourceTexts: string[],
): ScriptSimilarityRisk {
  const candidate = normalizedText(candidateText);
  let medium = false;
  for (const rawSource of sourceTexts) {
    const source = normalizedText(rawSource);
    if (hasSharedRun(candidate, source, 30)) return "high";
    if (hasSharedRun(candidate, source, 16)) medium = true;
  }
  return medium ? "medium" : "low";
}

function combinedRisk(
  lexical: ScriptSimilarityRisk,
  semanticScore: number,
): ScriptSimilarityRisk {
  if (lexical === "high" || semanticScore >= 0.86) return "high";
  if (lexical === "medium" || semanticScore >= 0.65) return "medium";
  return "low";
}

export interface ProjectScriptCandidateService {
  generate(
    ctx: RequestContext,
    input: {
      projectId: string;
      referenceIds: string[];
      strategy: string;
      idempotencyKey: string;
    },
  ): Promise<ExecutionTaskResourceV2>;
  accept(
    ctx: RequestContext,
    input: {
      projectId: string;
      taskId: string;
      editedText?: string;
      idempotencyKey: string;
    },
  ): Promise<{
    artifactVersionId: string;
    similarityRisk: "low" | "medium";
    referenceIds: string[];
  }>;
}

export function createProjectScriptCandidateService(deps: {
  tasks: PersistentTaskService;
  references: ProjectIntelligenceReferenceService;
  artifacts: ProjectScriptArtifactPort;
  similarity: ScriptSemanticSimilarityPort;
}): ProjectScriptCandidateService {
  return {
    async generate(ctx, input) {
      if (
        !input.projectId ||
        !input.strategy.trim() ||
        !input.idempotencyKey.trim() ||
        input.referenceIds.length === 0
      ) {
        throw new IntelligenceValidationError(
          "projectId、referenceIds、strategy 与 idempotencyKey 不能为空",
        );
      }
      // 入队前先验证引用属主与逐字稿 hash，不能让注定无来源的假任务排队。
      await deps.references.getSourceContexts(ctx, {
        projectId: input.projectId,
        referenceIds: input.referenceIds,
      });
      return deps.tasks.enqueue(ctx, {
        kind: "script_candidate",
        ownerType: "project",
        ownerId: input.projectId,
        idempotencyKey: input.idempotencyKey,
        payload: {
          referenceIds: [...new Set(input.referenceIds)],
          strategy: input.strategy.trim(),
        },
        priority: 15,
      });
    },

    async accept(ctx, input) {
      if (!input.idempotencyKey.trim()) {
        throw new IntelligenceValidationError("idempotencyKey 不能为空");
      }
      const task = await deps.tasks.get(ctx, input.taskId);
      if (
        task.kind !== "script_candidate" ||
        task.ownerType !== "project" ||
        task.ownerId !== input.projectId
      ) {
        throw new IntelligenceConflictError("稿件候选不属于当前 Project");
      }
      if (task.status !== "succeeded") {
        throw new IntelligenceConflictError("Project 稿件候选尚未生成完成");
      }
      const checkpoint = checkpointOf(task.checkpoint);
      const candidateText =
        input.editedText?.trim() || checkpoint.candidateText.trim();
      const artifacts = await deps.artifacts.listProjectArtifacts(ctx,input.projectId);
      let script = artifacts.find(artifact=>artifact.artifactType==="output_script"||artifact.artifactType==="master_script");
      if(script){const versions=await deps.artifacts.listVersions(ctx,script.id);const existing=versions.find(version=>version.aiTaskId===task.id);
       if(existing){const recorded=existing.contentData?.similarityRisk;if(recorded!=="low"&&recorded!=="medium")throw new IntelligenceConflictError("已采纳版本缺少相似度回执");return {artifactVersionId:existing.id,similarityRisk:recorded,referenceIds:checkpoint.referenceIds};}
      }
      const contexts = await deps.references.getSourceContexts(ctx, {
        projectId: input.projectId,
        referenceIds: checkpoint.referenceIds,
      });
      const sourceTexts = contexts.map((entry) => entry.transcript.text);
      const lexicalRisk = deterministicSimilarityRisk(
        candidateText,
        sourceTexts,
      );
      // 连续 30 字复用是确定性硬门，不依赖模型可用性；命中后立即拒绝。
      if (lexicalRisk === "high") {
        throw new IntelligenceConflictError(
          "候选稿与来源逐字稿高度相似，请修改或重新生成后再采纳",
        );
      }
      const semanticScore = await deps.similarity.evaluate(ctx, {
        candidateText,
        sourceTaskId:task.id,projectId:input.projectId,
      });
      const risk = combinedRisk(
        lexicalRisk,
        Math.max(0, Math.min(1, semanticScore)),
      );
      if (risk === "high") {
        throw new IntelligenceConflictError(
          "候选稿与来源逐字稿高度相似，请修改或重新生成后再采纳",
        );
      }

      if (!script) {
        script = {
          ...(await deps.artifacts.createArtifact(ctx, {
            projectId: input.projectId,
            title: "口播稿（提词器用）",
            artifactType: "output_script",
            stage: "script",
          })),
          artifactType: "output_script",
          currentVersionId: null,
        };
      }
      const version = await deps.artifacts.createVersion(ctx, script.id, {
        contentText: candidateText,
        contentData: {
          intelligenceReferenceIds: checkpoint.referenceIds,
          strategy: checkpoint.strategy,
          similarityRisk: risk,
          sourceUrls: contexts.map((entry) => entry.item.canonicalUrl),
        },
        changeSummary: input.editedText
          ? "采纳内容雷达稿件候选（用户已修改）"
          : "采纳内容雷达稿件候选",
        createdByType: input.editedText ? "user" : "ai",
        aiTaskId: task.id,
      });
      return {
        artifactVersionId: version.id,
        similarityRisk: risk,
        referenceIds: checkpoint.referenceIds,
      };
    },
  };
}

export type { ProjectIntelligenceSourceContext };
