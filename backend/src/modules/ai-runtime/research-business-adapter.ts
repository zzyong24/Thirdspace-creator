import { z } from "zod";
import { structuredGenerationInputSchema } from "@creatoros/contract/execution-worker";
import {
  researchMaterialSchema,
  normalizeResearchResult,
} from "@creatoros/ai-worker";
import {
  prepareResearchGatherContext,
  type GatherDeps,
} from "./research-runner";
import type { StructuredBusinessAdapter } from "./structured-business-execution.service";
const groundingSchema = z
  .object({
    topic: z.string(),
    projectId: z.string().min(1).nullable(),
    grounding: z.literal("model_memory"),
  })
  .strict();
export function createResearchGatherBusinessAdapter(
  deps: GatherDeps,
): StructuredBusinessAdapter {
  return {
    skillId: "research.gather",
    capability: "research.gather",
    async prepare(ctx, task) {
      const facets = await prepareResearchGatherContext(ctx, task, deps);
      return {
        ...facets,
        __researchGather: JSON.stringify({
          topic: facets.topic,
          projectId: task.projectId,
          grounding: "model_memory",
        }),
      };
    },
    project(_input, object, execution) {
      const frozen = structuredGenerationInputSchema.parse(
        execution?.frozenInput,
      );
      if (
        frozen.skillId !== "research.gather" ||
        frozen.capability !== "research.gather"
      )
        throw new Error("素材搜集冻结类型不一致");
      const grounding = groundingSchema.parse(
        JSON.parse(frozen.facets.__researchGather ?? "null"),
      );
      const result = normalizeResearchResult(
        researchMaterialSchema.parse(object),
        grounding.grounding,
      );
      return {
        resultType: "material_list",
        resultData: { ...result, topic: grounding.topic },
      };
    },
  };
}
