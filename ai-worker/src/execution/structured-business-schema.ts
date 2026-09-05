import { z } from "zod";
import type { structuredGenerationInputSchema } from "@creatoros/contract/execution-worker";
import {
  planningThesisOutputSchema,
  planningThesisGroundingSchema,
} from "./planning-thesis-output";
import { reviewInsightsSchema } from "../prompt/templates/review-insights";
import {
  contractSchema,
  PLANNING_CONTRACT_SLOTS,
} from "../prompt/templates/planning-contract";
import { topicCardSchema } from "../prompt/templates/topic-enrich";
import { materialMatchSchema } from "../prompt/templates/material-match";
import { diagnosisSchema } from "../prompt/templates/calibration-diagnose";
import { calibrationScoreSchema } from "../prompt/templates/calibration-score";
import { positioningSuggestionSchema } from "../prompt/templates/positioning-generate";

/** 固定候选协议与宿主投影保持一致；在有界生成修复内验证，不能保存后才发现无法提交。 */
export function resolveStructuredBusinessSchema(
  input: z.infer<typeof structuredGenerationInputSchema>,
): z.ZodType | undefined {
  // SEMANTIC_BOUNDARY_ALLOW: 只检查类型、非空结果和冻结真实ID范围，不评判内容、素材或评分质量。
  switch (input.skillId) {
    case "planning.thesis":
      planningThesisGroundingSchema.parse(
        JSON.parse(input.facets.__planningThesisGrounding ?? "null"),
      );
      return planningThesisOutputSchema;
    case "review.insights":
      return reviewInsightsSchema.refine(
        (value) => value.learnings.some((item) => item.title.trim()),
        "至少需要一条非空标题经验",
      );
    case "planning.contract":
      return contractSchema.refine(
        (value) =>
          PLANNING_CONTRACT_SLOTS.some(
            (slot) => value[slot.title]?.trim() || value[slot.id]?.trim(),
          ),
        "至少需要一个已知合同槽正文",
      );
    case "topic.enrich":
      return topicCardSchema.refine(
        (value) =>
          Boolean(value.oneLiner?.trim() || value.audiencePain?.trim()),
        "至少需要一句话选题或观众痛点",
      );
    case "material.match": {
      const ids = new Set(
        z
          .object({ assetIds: z.array(z.string()) })
          .parse(JSON.parse(input.facets.__materialMatchGrounding ?? "null"))
          .assetIds,
      );
      return materialMatchSchema.refine(
        (value) => value.matches.some((item) => ids.has(item.assetId.trim())),
        "至少需要一项真实素材",
      );
    }
    case "calibration.diagnose": {
      const keys = new Set(
        z
          .object({ rubricKeys: z.array(z.string()) })
          .parse(JSON.parse(input.facets.__calibrationDiagnosis ?? "null"))
          .rubricKeys,
      );
      return diagnosisSchema.refine(
        (value) =>
          value.dimensions.some(
            (item) =>
              keys.has(item.key.trim()) &&
              typeof item.score === "number" &&
              Number.isFinite(item.score) &&
              Math.round(item.score) >= 1 &&
              Math.round(item.score) <= 5,
          ),
        "诊断至少需要一个真实维度评分",
      );
    }
    case "calibration.score": {
      const keys = new Set(
        z
          .object({ rubricKeys: z.array(z.string()) })
          .parse(JSON.parse(input.facets.__calibrationScore ?? "null"))
          .rubricKeys,
      );
      return calibrationScoreSchema.refine(
        (value) => value.dimensions.some((item) => keys.has(item.key)),
        "评分至少需要一个真实预测维度",
      );
    }
    case "positioning.generate":
      return positioningSuggestionSchema.refine(
        (value) => Boolean(value.persona?.trim() || value.oneLiner?.trim()),
        "定位至少需要人设或一句话定位",
      );
    default:
      return undefined;
  }
}
