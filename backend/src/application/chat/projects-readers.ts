import type { RequestContext } from "@creatoros/contract";
import type { ContextReaders } from "../../modules/ai-runtime";

/** 通过公开服务组合projects读取；不持有数据库或任务执行权。 */
export function createChatProjectsReaders(ports: {
projectsService: Pick<ReturnType<typeof import("../../modules/projects").createProjectsService>, "listOutputIdsByProject" | "getProjectOverviewCore">;
publishingService: Pick<ReturnType<typeof import("../../modules/publishing").createPublishingService>, "listPublications">;
artifactsService: Pick<ReturnType<typeof import("../../modules/artifacts").createArtifactsService>, "listProjectArtifacts" | "listVersions">;
listRecentProjects: NonNullable<ContextReaders["listProjects"]>;
searchProjects: NonNullable<ContextReaders["searchProjects"]>;
contentRadarDraftSeedOf: (briefDetail: unknown) => string | null;
extractArtifactText: (contentText: string | null | undefined, contentData: unknown) => string;
makeReviewSubjectReader: () => import("../../modules/ai-runtime").ReviewSubjectReader;
readProjectRadarDraftSeed: (ctx: RequestContext, projectId: string) => Promise<string | null>;
readCurrentArtifactTruth: (ctx: RequestContext, projectId: string, artifactType: string) => ReturnType<NonNullable<ContextReaders["getArtifactText"]>>;
}): Pick<ContextReaders,"listProjects" | "searchProjects" | "getProjectBrief" | "getProjectDetail" | "listProjectArtifacts" | "getArtifactText"> {
 const {projectsService,publishingService,artifactsService,listRecentProjects,searchProjects,contentRadarDraftSeedOf,extractArtifactText,makeReviewSubjectReader,readProjectRadarDraftSeed,readCurrentArtifactTruth}=ports;
const readProject = async (ctx: RequestContext, id: string) => (await projectsService.getProjectOverviewCore(ctx,id)).project;
const readArtifactVersion = async (ctx: RequestContext, artifactId: string, versionId: string) => { const versions=await artifactsService.listVersions(ctx,artifactId); const version=versions.find(row=>row.id===versionId); if(!version)throw new Error("工件版本不存在或不可读取"); return version; };

return {
listProjects: listRecentProjects,
searchProjects,
getProjectBrief: async (
        c: RequestContext,
        opts: { projectId: string },
      ) => {
        try {
          const row = await readProject(c, opts.projectId);
          return (row.briefDetail ?? null) as {
            targetAudience?: string;
            contentGoal?: string;
            contentFormat?: string;
            orientation?: "landscape" | "portrait";
            targetPlatforms?: string[];
            durationEstimate?: string;
            coreMessage?: string;
            successCriteria?: string;
          } | null;
        } catch {
          return null;
        }
      },
getProjectDetail: async (c: RequestContext, opts: { projectId: string }) => {
        try {
          const project = await readProject(c, opts.projectId);
          const brief = (project.briefDetail ?? {}) as Record<string, unknown>;
          const s = (v: unknown): string | undefined =>
            typeof v === "string" && v.trim() ? v.trim() : undefined;
          const platforms = Array.isArray(brief.targetPlatforms)
            ? brief.targetPlatforms.filter((p): p is string => typeof p === "string")
            : undefined;
          // 产物索引 —— 每类产物的版本数 + updatedAt + 当前版本字数(全文走 context.artifact.text)。
          const artifactRows = await artifactsService.listProjectArtifacts(
            c,
            opts.projectId,
          );

          const persistedArtifacts = await Promise.all(
            artifactRows.map(async (a) => {
              let versionCount = 0;
              let charCount = 0;
              try {
                const versions = await artifactsService.listVersions(c, a.id);
                versionCount = versions.length;
              } catch {
                versionCount = 0;
              }
              if (a.currentVersionId) {
                try {
                  const version = await readArtifactVersion(c, a.id, a.currentVersionId);
                  const data = version.contentData as
                    | Record<string, unknown>
                    | null
                    | undefined;
                  const text =
                    version.contentText && version.contentText.trim()
                      ? version.contentText
                      : data && typeof data.transcript === "string"
                        ? data.transcript
                        : "";
                  charCount = text.length;
                } catch {
                  charCount = 0;
                }
              }
              return {
                artifactType: a.artifactType,
                versionCount,
                updatedAt: a.updatedAt ?? null,
                charCount,
              };
            }),
          );
          const radarDraftSeed = contentRadarDraftSeedOf(project.briefDetail);
          const hasPersistedOutputScript = persistedArtifacts.some(
            (artifact) =>
              artifact.artifactType === "output_script" &&
              artifact.versionCount > 0,
          );
          const artifacts =
            radarDraftSeed && !hasPersistedOutputScript
              ? [
                  ...persistedArtifacts.filter(
                    (artifact) => artifact.artifactType !== "output_script",
                  ),
                  {
                    artifactType: "output_script",
                    versionCount: 0,
                    updatedAt: project.updatedAt ?? null,
                    charCount: radarDraftSeed.length,
                  },
                ]
              : persistedArtifacts;
          // 发布状态 —— 项目 outputs → publications;取首个已发布(publishedAt 非空)作代表。
          let publish = {
            published: false,
            platform: null as string | null,
            publishedAt: null as string | null,
          };
          try {
            const outputIds = await projectsService.listOutputIdsByProject(
              c,
              opts.projectId,
            );
            outer: for (const outputId of outputIds) {
              const pubs = await publishingService.listPublications(c, outputId, {
                limit: 20,
                offset: 0,
              });
              for (const pub of pubs) {
                if (pub.publishedAt) {
                  publish = {
                    published: true,
                    platform: pub.platform,
                    publishedAt: pub.publishedAt,
                  };
                  break outer;
                }
              }
            }
          } catch {
            /* 发布状态 best-effort,读失败按未发布(诚实,不编) */
          }
          // 最新指标摘要 —— 复用 ReviewSubjectReader 口径(views/plays 归一,人类可读串)。
          let metricsSummary = "";
          try {
            metricsSummary = await makeReviewSubjectReader().getMetricsSummary(
              c,
              opts.projectId,
            );
          } catch {
            metricsSummary = "";
          }
          return {
            id: project.id,
            title: project.title,
            stage: project.currentStage,
            status: project.status,
            publish,
            brief: {
              targetAudience: s(brief.targetAudience),
              contentGoal: s(brief.contentGoal),
              contentFormat: s(brief.contentFormat),
              targetPlatforms: platforms,
              durationEstimate: s(brief.durationEstimate),
              coreMessage: s(brief.coreMessage),
              successCriteria: s(brief.successCriteria),
            },
            artifacts,
            metricsSummary,
          };
        } catch {
          return null;
        }
      },
listProjectArtifacts: async (
        c: RequestContext,
        opts: { projectId: string },
      ) => {
        try {
          const project = await readProject(c, opts.projectId);
          const artifactRows = await artifactsService.listProjectArtifacts(
            c,
            opts.projectId,
          );

          const persistedItems = await Promise.all(
            artifactRows.map(async (a) => {
              let currentVersion: number | null = null;
              let totalChars = 0;
              try {
                const versions = await artifactsService.listVersions(c, a.id);
                // T-816：恢复历史版本后 currentVersionId 可能指向较小版本号；不能用 max 冒充当前。
                const current = a.currentVersionId
                  ? versions.find((version) => version.id === a.currentVersionId)
                  : undefined;
                currentVersion = current?.versionNumber ?? null;
              } catch {
                currentVersion = null;
              }
              if (a.currentVersionId) {
                try {
                  const version = await readArtifactVersion(c, a.id, a.currentVersionId);
                  totalChars = extractArtifactText(
                    version.contentText,
                    version.contentData,
                  ).length;
                } catch {
                  totalChars = 0;
                }
              }
              return {
                artifactType: a.artifactType,
                currentVersion,
                updatedAt: a.updatedAt ?? null,
                totalChars,
              };
            }),
          );
          const radarDraftSeed = contentRadarDraftSeedOf(project.briefDetail);
          const hasPersistedOutputScript = persistedItems.some(
            (item) =>
              item.artifactType === "output_script" &&
              item.currentVersion !== null,
          );
          const items =
            radarDraftSeed && !hasPersistedOutputScript
              ? [
                  ...persistedItems.filter(
                    (item) => item.artifactType !== "output_script",
                  ),
                  {
                    artifactType: "output_script",
                    currentVersion: null,
                    updatedAt: project.updatedAt ?? null,
                    totalChars: radarDraftSeed.length,
                  },
                ]
              : persistedItems;
          return {
            projectId: project.id,
            projectTitle: project.title,
            items,
          };
        } catch {
          return null;
        }
      },
getArtifactText: async (
        c: RequestContext,
        opts: { projectId: string; artifactType: string },
      ) => {
        try {
          const truth = await readCurrentArtifactTruth(
            c,
            opts.projectId,
            opts.artifactType,
          );
          if (!truth) {
            if (opts.artifactType !== "output_script") return null;
            const seed = await readProjectRadarDraftSeed(c, opts.projectId);
            return seed
              ? { artifactType: "output_script", fullText: seed }
              : null;
          }
          return truth;
        } catch {
          return null;
        }
      }
};
}
