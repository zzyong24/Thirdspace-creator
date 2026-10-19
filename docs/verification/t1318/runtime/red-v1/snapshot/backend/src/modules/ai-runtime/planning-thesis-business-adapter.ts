import type { RequestContext } from "@creatoros/contract";
import { structuredGenerationInputSchema } from "@creatoros/contract/execution-worker";
import {
  projectPlanningThesis,
  planningThesisGroundingSchema,
} from "@creatoros/ai-worker";
import type { ContextDeps } from "./creative-context";
import type { StructuredBusinessAdapter } from "./structured-business-execution.service";
import { preparePlanningThesisContext } from "./planning-thesis-context";
export function createPlanningThesisBusinessAdapter(
  deps: ContextDeps & {
    assertProject(ctx: RequestContext, projectId: string): Promise<void>;
  },
): StructuredBusinessAdapter {
  return {
    skillId: "planning.thesis",
    capability: "planning.thesis",
    async prepare(ctx, task) {
      if (!task.projectId) throw new Error("论点树缺少所属项目");
      await deps.assertProject(ctx, task.projectId);
      const prepared = await preparePlanningThesisContext(ctx, task, deps);
      return {
        ...prepared.facets,
        __planningThesisGrounding: JSON.stringify(prepared.grounding),
      };
    },
    project(_inputData, object, execution) {
      const frozen = structuredGenerationInputSchema.parse(
        execution?.frozenInput,
      );
      if (frozen.skillId !== "planning.thesis")
        throw new Error("论点树冻结类型不一致");
      const grounding = planningThesisGroundingSchema.parse(
        JSON.parse(frozen.facets.__planningThesisGrounding ?? "null"),
      );
      return {
        resultType: "artifact_version",
        artifactId: null,
        resultData: projectPlanningThesis(object, grounding),
      };
    },
  };
}
