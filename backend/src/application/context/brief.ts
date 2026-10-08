
import type { ProjectBriefReader } from "../../modules/ai-runtime";
/** 共享业务上下文读取；聊天和持久生成消费同一投影。 */
export function createBriefContext(ports: {
projectsService: Pick<ReturnType<typeof import("../../modules/projects").createProjectsService>,"getProject">;
}) {
const {projectsService}=ports;
return ((): ProjectBriefReader => ({
    getBriefDetail: async (c, projectId) => {
      try {
        const row = await projectsService.getProject(c, projectId);
        const d = (row.briefDetail ?? {}) as {
          orientation?: "landscape" | "portrait";
          coreMessage?: string;
          contentGoal?: string;
          contentFormat?: string;
          targetAudience?: string;
          successCriteria?: string;
          // [T-284a] 复刻补链 G1 —— 复刻项目携带的原爆款拆解要素(briefDetail.benchmarkRef jsonb)。
          benchmarkRef?: {
            钩子拆解?: string;
            结构拆解?: string;
            为什么爆?: string;
            可借鉴点?: string[];
            适配本账号建议?: string;
          };
          contentRadarEvidence?:
            | {
                generationMode: "rewrite_only";
                sourceReferences: Array<{
                  kind: "original_video" | "source_page";
                  platform: string;
                  label: string;
                  url: string;
                  intelligenceItemId?: string;
                }>;
                sourceSnapshotId: string;
                generatedFromTranscriptHash: string;
                adaptedDraftSeed: {
                  generationMode: "rewrite_only";
                  contentText: string;
                  sourceSnapshotId: string;
                  generatedFromTranscriptHash: string;
                  aiTaskId?: string;
                  positioningVersionId?: string;
                  personalizationStatus: "applied" | "not_applied";
                  templateVersion: string;
                };
                positioningVersionId?: string;
                personalizationStatus?: "applied" | "not_applied";
                aiTaskId?: string;
              }
            | {
                sourceReferences: Array<{
                  kind: "original_video" | "source_page";
                  platform: string;
                  label: string;
                  url: string;
                  intelligenceItemId?: string;
                }>;
                decomposition: {
                  hook: string;
                  structureSteps: string[];
                  coreClaims: string[];
                  reusablePattern: string;
                  factRisks: string[];
                };
                strategy: {
                  keep: string[];
                  replace: string[];
                  add: string[];
                  avoid: string[];
                };
                adaptedDraftSeed: {
                  contentText: string;
                  generatedFromTranscriptHash: string;
                  strategyHash: string;
                  templateVersion: string;
                };
              };
        };
        return {
          orientation: d.orientation,
          coreMessage: d.coreMessage,
          contentGoal: d.contentGoal,
          contentFormat: d.contentFormat,
          targetAudience: d.targetAudience,
          successCriteria: d.successCriteria,
          // [T-284a] 带出复刻参照(creative-context 据此产 benchmarkRefBrief 回流写稿/搭结构)。
          benchmarkRef: d.benchmarkRef,
          contentRadarEvidence: d.contentRadarEvidence,
        };
      } catch {
        return null; // best-effort;读不到 brief 绝不阻塞写文案
      }
    },
  }))();
}
