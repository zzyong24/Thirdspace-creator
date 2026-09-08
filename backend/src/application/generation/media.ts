
import { createAssetProcessingBusinessAdapter, createVideoDecisionsBusinessAdapter, createReconstructBusinessAdapter } from "../../modules/ai-runtime";

import {createMaterialMatchBusinessAdapter} from "../../modules/ai-runtime";
import {collectProjectBrollInventory,storyboardFromContentData} from "../../modules/ai-runtime";

import type {createStructuredBusinessExecutionService} from "../../modules/ai-runtime";
/** 固定业务能力注册；冻结上下文、候选投影与原执行服务保持一致。 */
export function createMediaBusinessAdapters(ports:{
projectsService: Pick<ReturnType<typeof import("../../modules/projects").createProjectsService>,"listOutputIdsByProject" | "getProject">;
publishingService: Pick<ReturnType<typeof import("../../modules/publishing").createPublishingService>,"listPublications">;
analyticsService: Pick<ReturnType<typeof import("../../modules/analytics").createAnalyticsService>,"getPublicationAnalytics">;
assetsService: Pick<ReturnType<typeof import("../../modules/assets").createAssetsService>,"getAsset" | "listFilesByIds">;
artifactsService: Pick<ReturnType<typeof import("../../modules/artifacts").createArtifactsService>,"listProjectArtifacts" | "listVersions">;
materialLinksService: Pick<ReturnType<typeof import("../../modules/material-links").createMaterialLinksService>,"list">;
resolveModelSpec: Parameters<typeof createVideoDecisionsBusinessAdapter>[0]["resolveModelSpec"];
aiService: ReturnType<typeof import("../../modules/ai").createAiService>;
assetProcessingPreparation: Parameters<typeof createAssetProcessingBusinessAdapter>[1];
generationContext: Required<Pick<import("../../modules/ai-runtime").ContextDeps,"positioning"|"learnings">>;
makeGenerationReaders: ()=>ReturnType<typeof import("../context/generation").createGenerationContextReaders>;
readArtifactContentData: ReturnType<typeof import("../../modules/ai-runtime").createArtifactContextReaders>["readArtifactContentData"];
}){
const {projectsService,publishingService,analyticsService,assetsService,artifactsService,materialLinksService,resolveModelSpec,aiService,assetProcessingPreparation,generationContext,makeGenerationReaders,readArtifactContentData}=ports;
return {
"asset.classify":createAssetProcessingBusinessAdapter("asset.classify",assetProcessingPreparation),
"material.extract":createAssetProcessingBusinessAdapter("material.extract",assetProcessingPreparation),
"video.decisions":createVideoDecisionsBusinessAdapter({resolveModelSpec,getTaskRuntimeData:(c,id)=>aiService.getTaskRuntimeData(c,id),
              listBrollInventory: (c, projectId) =>
                collectProjectBrollInventory(c, projectId, {
                  assertProjectAccess: async (scopeCtx, scopeProjectId) => {
                    await projectsService.listOutputIdsByProject(
                      scopeCtx,
                      scopeProjectId,
                    );
                  },
                  readArtifactContentData,
                  listProjectMaterialLinks: async (
                    scopeCtx,
                    scopeProjectId,
                  ) =>
                    (
                      await materialLinksService.list(scopeCtx, {
                        projectId: scopeProjectId,
                        page: 1,
                        pageSize: 100,
                      })
                    ).rows,
                  getAsset: async (scopeCtx, assetId) => {
                    const asset = await assetsService.getAsset(scopeCtx, assetId);
                    const file = asset.currentFileId
                      ? (
                          await assetsService.listFilesByIds(scopeCtx, [
                            asset.currentFileId,
                          ])
                        )[0] ?? null
                      : null;
                    return {
                      ...asset,
                      width: file?.width ?? null,
                      height: file?.height ?? null,
                      durationMs: file?.durationMs ?? null,
                    };
                  },
                }),
              // [T-387c] 凝固分镜 reader:output_script 当前版本 contentData → 分镜投影
              // (storyboardFromContentData 宽容解析;旧稿无 visual → 空数组 → facet 空 = 现状)。
              readStoryboard: async (c, projectId) => {
                if (!projectId) return [];
                try {
                  return storyboardFromContentData(
                    await readArtifactContentData(c, projectId, "output_script"),
                  );
                } catch {
                  return [];
                }
              },

    }),
"reconstruct.project":createReconstructBusinessAdapter({...generationContext,
              getProjectSource: async (c, projectId) => {
                try {
                  const row = await projectsService.getProject(c, projectId);
                  return row.source ?? null;
                } catch {
                  return null; // 读不到 → runner 视为非 imported → 失败,不误触发
                }
              },
              // 读该作品逐字稿(D3 绑的 output_script transcript artifact 当前版本 contentText/
              // contentData.transcript)。走公开 service(listProjectArtifacts)+ per-ctx repo getVersion。
              getTranscript: async (c, projectId) => {
                const rows = await artifactsService.listProjectArtifacts(
                  c,
                  projectId,
                );

                for (const r of rows) {
                  if (r.artifactType !== "output_script") continue;
                  if (!r.currentVersionId) continue;
                  const version = (await artifactsService.listVersions(c,r.id)).find(version=>version.id===r.currentVersionId)!;
                  const data = version.contentData as
                    | Record<string, unknown>
                    | null
                    | undefined;
                  const t =
                    data && typeof data.transcript === "string"
                      ? data.transcript
                      : version.contentText;
                  if (t && t.trim()) return t;
                }
                return null;
              },
              // 读该作品真实指标摘要(digg/comment/play 等)——解析项目 publications → 最新 snapshot
              // 的 rawMetrics(views/likes/comments/...)→ 人类可读串喂给模型(数据是真实值,模型不改)。
              getMetricsSummary: async (c, projectId) => {
                try {
                  const outputIds =
                    await projectsService.listOutputIdsByProject(c, projectId);
                  const merged = new Map<string, number>();
                  for (const outputId of outputIds) {
                    let pubs: Array<{ id: string }> = [];
                    try {
                      pubs = await publishingService.listPublications(
                        c,
                        outputId,
                        { limit: 20, offset: 0 },
                      );
                    } catch {
                      pubs = [];
                    }
                    for (const pub of pubs) {
                      try {
                        const page =
                          await analyticsService.getPublicationAnalytics(
                            c,
                            pub.id,
                            1,
                            10,
                          );
                        const latest = page.rows
                          .slice()
                          .sort((a, b) =>
                            b.capturedAt.localeCompare(a.capturedAt),
                          )[0];
                        const raw = (latest?.rawMetrics ?? {}) as Record<
                          string,
                          unknown
                        >;
                        for (const [k, v] of Object.entries(raw)) {
                          if (typeof v === "number" && Number.isFinite(v)) {
                            merged.set(k, v);
                          }
                        }
                      } catch {
                        /* single publication read failing → skip, never crash */
                      }
                    }
                  }
                  if (merged.size === 0) return "";
                  const LABELS: Record<string, string> = {
                    views: "播放",
                    plays: "播放",
                    likes: "点赞",
                    digg: "点赞",
                    comments: "评论",
                    shares: "分享",
                    favorites: "收藏",
                    finish_rate: "完播率",
                  };
                  return Array.from(merged.entries())
                    .map(([k, v]) => `${LABELS[k] ?? k}：${v}`)
                    .join(" · ");
                } catch {
                  return "";
                }
              },

    }),
"material.match":createMaterialMatchBusinessAdapter({
      ...generationContext,
      assets:makeGenerationReaders().assetsReader,
      async assertProject(c,id){await projectsService.getProject(c,id);},
    })
} satisfies Parameters<typeof createStructuredBusinessExecutionService>[1]["adapters"];
}
