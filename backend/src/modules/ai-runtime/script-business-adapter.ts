import { createHash } from "node:crypto";
import { scriptDraftSchema } from "@creatoros/ai-worker";
import { structuredGenerationInputSchema } from "@creatoros/contract/execution-worker";
import type { RequestContext } from "@creatoros/contract";
import type { ContextDeps } from "./creative-context";
import type { StructuredBusinessAdapter } from "./structured-business-execution.service";
import { prepareScriptDraftContext } from "./script-preparation";
import {
  projectScriptDraftCandidate,
  projectVerbatimScriptCandidate,
} from "./script-candidate-projection";
import {
  scriptDraftInputFingerprint,
  readScriptDraftCheckpoint,
  effectiveVersion,
} from "./script-checkpoint";

export function createScriptBusinessAdapter(
  deps: ContextDeps & {
    assertArtifact(
      ctx: RequestContext,
      artifactId: string,
      projectId: string | null,
    ): Promise<void>;
    readRuntime(
      ctx: RequestContext,
      taskId: string,
    ): Promise<Record<string, unknown>>;
  },
): StructuredBusinessAdapter {
  return {
    skillId: "script.draft",
    capability: "script.draft",
    async prepare(ctx, task) {
      const artifactId =
        typeof task.inputData.artifactId === "string"
          ? task.inputData.artifactId
          : "";
      if (!artifactId) throw new Error("文稿目标不能为空");
      await deps.assertArtifact(ctx, artifactId, task.projectId);
      const prepared = await prepareScriptDraftContext(ctx, task, deps);
      if (prepared.mode === "verbatim")
        return { __scriptVerbatim: JSON.stringify(prepared) };
      const snapshot = task.skillSnapshot;
      const draft = snapshot.skills.find(
        (skill) => skill.skillId === "script.draft",
      );
      const voiceover = snapshot.skills.find(
        (skill) => skill.skillId === "script.voiceover.compose",
      );
      const storyboard = snapshot.skills.find(
        (skill) => skill.skillId === "script.storyboard.segment",
      );
      if (!draft) throw new Error("文稿Skill快照缺失");
      let initialVoiceover: Record<string, unknown> | undefined;
      let inputFingerprint: string | undefined;
      if (draft.overlayVersion === null && voiceover && storyboard) {
        inputFingerprint = scriptDraftInputFingerprint({
          projectId: task.projectId,
          inputData: task.inputData,
          context: prepared.fingerprintContext,
          skills: snapshot.skills
            .filter((skill) => skill.skillId.startsWith("script."))
            .map(
              ({ skillId, baseVersion, overlayRevision, overlayVersion }) => ({
                skillId,
                baseVersion,
                overlayRevision,
                overlayVersion,
              }),
            ),
        });
        const runtime = await deps.readRuntime(
          ctx,
          task.retryOfTaskId ?? task.id,
        );
        const checkpoint = readScriptDraftCheckpoint(runtime, {
          inputFingerprint,
          voiceoverSkillVersion: effectiveVersion(voiceover),
        });
        if (
          checkpoint &&
          checkpoint.stage !== "voiceover_complete" &&
          !(task.retryOfTaskId && checkpoint.stage === "voiceover_failed")
        )
          throw new Error("口播生成状态待核对，已停止重复生成");
        if (checkpoint?.stage === "voiceover_complete") {
          const {
            voiceover,
            centralClaim,
            audienceOldBelief,
            sha256,
            charCount,
            voiceoverGeneration,
            storyboardAttemptCount,
          } = checkpoint;
          initialVoiceover = {
            voiceover,
            centralClaim,
            audienceOldBelief,
            sha256,
            charCount,
            voiceoverGeneration,
            storyboardAttemptCount,
          };
        }
      }
      return {
        __scriptFingerprint: inputFingerprint,
        __scriptDraft: JSON.stringify({
          nodeInput: prepared.nodeInput,
          ...(initialVoiceover ? { initialVoiceover } : {}),
        }),
        __scriptSources: JSON.stringify(prepared.frozenSources.metadata),
      };
    },
    project(inputData, object, execution) {
      const input = structuredGenerationInputSchema.parse(
        execution?.frozenInput,
      );
      if (input.skillId !== "script.draft")
        throw new Error("文稿执行快照不一致");
      if (input.facets.__scriptVerbatim) {
        const prepared = JSON.parse(input.facets.__scriptVerbatim) as Extract<
          Awaited<ReturnType<typeof prepareScriptDraftContext>>,
          { mode: "verbatim" }
        >;
        if (prepared.artifactId !== inputData.artifactId)
          throw new Error("原文目标不一致");
        return projectVerbatimScriptCandidate(prepared);
      }
      const result = execution?.structuredResult;
      if (!result) throw new Error("缺少文稿真实生成回执");
      const { shots } = scriptDraftSchema.parse(object);
      const pipelineMetadata =
        (object as { pipelineMetadata?: Record<string, unknown> })
          .pipelineMetadata ?? {};
      if (
        typeof pipelineMetadata.voiceoverSha256 === "string" &&
        createHash("sha256")
          .update(shots.map((shot) => shot.口播).join(""))
          .digest("hex") !== pipelineMetadata.voiceoverSha256
      )
        throw new Error("冻结口播保真校验失败");
      const effectiveSkill = input.skillSnapshot.skills.find(
        (skill) => skill.skillId === "script.draft",
      )!;
      return projectScriptDraftCandidate({
        artifactId: String(inputData.artifactId),
        shots,
        generation: result.generation,
        validation: result.validation,
        accountId: input.skillSnapshot.accountId,groupId:input.skillSnapshot.groupId,
        effectiveSkill,
        pipelineMetadata,
        sourceMetadata: JSON.parse(input.facets.__scriptSources ?? "[]"),
      });
    },
  };
}
