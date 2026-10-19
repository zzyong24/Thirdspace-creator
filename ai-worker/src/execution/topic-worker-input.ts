import { topicRecommendationContext } from "@creatoros/contract";
import { z } from "zod";
const optionalText = z.string().optional();
const count = z.number().int().nonnegative();
const ratio = z.number().min(0).max(1);
/** 仅包含真实读取和旧算法输入，不包含模型、凭据或联网结果。 */
export const topicGenerateFrozenSchema = z
  .object({
    version: z.literal(1),
    audienceTaskContext: topicRecommendationContext.optional(),
    mode: z.literal("daily").optional(),
    basis: z.enum(["positioning", "comments", "knowledge", "trend"]),
    projectId: z.string().min(1).nullable(),
    context: z
      .object({
        positioningBrief: z.string(),
        knowledgeBrief: z.string(),
        learningsBrief: z.string(),
      })
      .strict(),
    qualityNow: z.string().datetime(),
    qualityInputs: z
      .object({
        signals: z.array(
          z.object({
            source: z.string(),
            rawText: z.string(),
            demandTag: z.string().nullable(),
            publicationId: z.string().nullable().optional(),
          }),
        ),
        knowledge: z.array(
          z.object({
            title: z.string(),
            knowledgeType: z.string(),
            usedCount: z.number().optional(),
            usedInPublished: z.boolean().optional(),
            sourceNote: z.string().nullable().optional(),
            createdAt: z.string().nullable().optional(),
          }),
        ),
        positioning: z
          .object({
            profile: z
              .object({
                persona: z.string(),
                field: z.string(),
                audience: z.string(),
                differentiation: z.string(),
                capabilities: z.array(z.string()),
                facets: z
                  .object({
                    contentScope: optionalText,
                    avoid: optionalText,
                    corePain: optionalText,
                    coreValue: optionalText,
                    tone: optionalText,
                    statusNote: optionalText,
                  })
                  .optional(),
                downstreamRules: z
                  .object({
                    topicRule: optionalText,
                    scriptRule: optionalText,
                    projectRule: optionalText,
                    forbidRule: optionalText,
                    expressionRule: optionalText,
                  })
                  .optional(),
              })
              .nullable(),
            currentStatement: z
              .object({ oneLiner: z.string(), keywords: z.array(z.string()) })
              .nullable(),
          })
          .nullable(),
      })
      .strict(),
    qualityProfile: z
      .object({
        comments: z.object({
          count,
          coveredWorks: count,
          strongSignalRatio: ratio,
          noiseRatio: ratio,
        }),
        positioning: z.object({
          filledFacets: count,
          totalFacets: count,
          rulesFilled: count,
          completeness: ratio,
        }),
        knowledge: z.object({ count, recentRatio: ratio.nullable() }),
        trend: z.object({ sourceCount: count, signalCount: count }),
      })
      .strict(),
    basisBrief: z.string(),
    trendSources: z.array(
      z
        .object({
          id: z.string().min(1),
          name: z.string(),
          url: z.string().url(),
          domain: z.string().min(1),
          sourceType: z.enum(["web", "rss"]),
        })
        .strict(),
    ),
  })
  .strict();
export type TopicGenerateFrozen = z.infer<typeof topicGenerateFrozenSchema>;

/** 宿主冻结的每日任务身份及采纳排序输入，Worker不能覆写。 */
export const dailyTopicInputSchema=z.object({
 jobId:z.string().min(1),jobRunId:z.string().min(1),dayKey:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),dailyLimit:z.number().int().nonnegative(),
 preferences:z.array(z.object({keyword:z.string(),direction:z.enum(['avoid','prefer']),weight:z.number(),exampleCount:z.number().int().nonnegative(),lastReinforcedAt:z.string()})),rankingNow:z.string().datetime(),observedCount:z.number().int().nonnegative().optional(),skipReason:z.enum(['quota','model_unconfigured']).optional(),
}).strict().refine(value=>value.skipReason!=='quota'||(value.observedCount!==undefined&&value.observedCount>=value.dailyLimit),'配额跳过缺少实际已满计数');
