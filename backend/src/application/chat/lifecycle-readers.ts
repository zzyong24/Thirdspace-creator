import type { RequestContext } from "@creatoros/contract";
import type { ContextReaders, ProjectLifecycleRaw } from "../../modules/ai-runtime";

import { OwnershipError } from "../../modules/projects";
import { createHash } from "node:crypto";

/** 通过公开服务组合lifecycle读取；不持有数据库或任务执行权。 */
export function createChatLifecycleReaders(ports: {
projectsService: Pick<ReturnType<typeof import("../../modules/projects").createProjectsService>, "listOutputIdsByProject" | "getProject">;
publishingService: Pick<ReturnType<typeof import("../../modules/publishing").createPublishingService>, "listPublications">;
analyticsService: Pick<ReturnType<typeof import("../../modules/analytics").createAnalyticsService>, "getPublicationAnalytics">;
assetsService: Pick<ReturnType<typeof import("../../modules/assets").createAssetsService>, "getAsset">;
artifactsService: Pick<ReturnType<typeof import("../../modules/artifacts").createArtifactsService>, "listProjectArtifacts" | "listVersions" | "getArtifact">;
materialLinksService: Pick<ReturnType<typeof import("../../modules/material-links").createMaterialLinksService>, "list">;
reviewGateService: Pick<ReturnType<typeof import("../../modules/review").createReviewGateService>, "getLatestReport">;
extractArtifactText: (contentText: string | null | undefined, contentData: unknown) => string;
isLegacyIncompleteReview: (report: Pick<import("@creatoros/contract").ScriptReviewReportResource,"summary" | "modelLabel">) => boolean;
}): Pick<ContextReaders,"getProjectLifecycle" | "getReviewReport"> {
 const {projectsService,publishingService,analyticsService,assetsService,artifactsService,materialLinksService,reviewGateService,extractArtifactText,isLegacyIncompleteReview}=ports;
const readProject = async (ctx: RequestContext, id: string) => await projectsService.getProject(ctx,id);
const readArtifactVersion = async (ctx: RequestContext, artifactId: string, versionId: string) => { const versions=await artifactsService.listVersions(ctx,artifactId); const version=versions.find(row=>row.id===versionId); if(!version)throw new Error("工件版本不存在或不可读取"); return version; };

return {
getProjectLifecycle: async (
        c: RequestContext,
        opts: { projectId: string },
      ) => {
        let project: Awaited<ReturnType<typeof readProject>>;
        try {
          project = await readProject(c, opts.projectId);
        } catch (error) {
          if (
            error instanceof OwnershipError ||
            (error instanceof Error && /not found/i.test(error.message))
          ) {
            return null;
          }
          throw error;
        }

        const traceId = `lifecycle-${createHash("sha256")
          .update(`${c.userId}:${opts.projectId}:${Date.now()}`)
          .digest("hex")
          .slice(0, 12)}`;
        const errors: Array<{ section: string; code: string }> = [];
        const availability = (
          value: unknown[] | null | undefined,
        ): "available" | "empty" =>
          Array.isArray(value) && value.length > 0 ? "available" : "empty";
        const errorCode = (section: string, error: unknown): void => {
          const name = error instanceof Error ? error.name : "UnknownError";
          errors.push({ section, code: `${section.toUpperCase()}_${name}` });
        };


        const artifactsPromise = (async () => {
          const rows = await artifactsService.listProjectArtifacts(c, project.id);
          return Promise.all(
            rows.map(async (artifact) => {
              const versions = await artifactsService.listVersions(c, artifact.id);
              const current = artifact.currentVersionId
                ? await readArtifactVersion(c, artifact.id, artifact.currentVersionId)
                : null;
              return {
                artifactId: artifact.id,
                artifactType: artifact.artifactType,
                currentVersionId: artifact.currentVersionId ?? null,
                versionNumber: current?.versionNumber ?? null,
                charCount: current
                  ? extractArtifactText(current.contentText, current.contentData).length
                  : 0,
                updatedAt: artifact.updatedAt ?? versions[0]?.createdAt ?? null,
              };
            }),
          );
        })();

        const materialsPromise = (async () => {
          const { rows } = await materialLinksService.list(c, {
            projectId: project.id,
            page: 1,
            pageSize: 200,
          });
          return Promise.all(
            rows
              .filter((link) => link.entityType === "asset")
              .map(async (link) => {
                const asset = await assetsService.getAsset(c, link.entityId);
                return {
                  linkId: link.id,
                  assetId: asset.id,
                  title: asset.name,
                  kind: asset.assetType,
                  role: link.role,
                  priority: link.priority,
                };
              }),
          );
        })();

        const publicationsPromise = (async () => {
          const outputIds = await projectsService.listOutputIdsByProject(
            c,
            project.id,
          );
          const rows = (
            await Promise.all(
              outputIds.map((outputId) =>
                publishingService.listPublications(c, outputId, {
                  limit: 100,
                  offset: 0,
                }),
              ),
            )
          ).flat();
          return rows
            .map((publication) => ({
              id: publication.id,
              platform: publication.platform,
              url: publication.externalUrl ?? null,
              publishedAt: publication.publishedAt ?? null,
              projectTitle: project.title,
              // listPublications 的窄读不投影封面；封面真值从项目素材 role=cover 解析。
              coverAssetId: null,
              status: publication.status,
            }))
            .sort((a, b) =>
              (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""),
            );
        })();

        const reviewPromise = (async () => {
          try {
            const report = await reviewGateService.getLatestReport(c, project.id);
            if (isLegacyIncompleteReview(report)) return null;
            return {
              reportId: report.id,
              verdict: report.verdict,
              artifactId: report.artifactId,
              artifactVersion: report.artifactVersion,
              findingCount:
                report.lintFindings.length + report.llmFindings.length,
              reviewedAt: report.reviewedAt,
            };
          } catch (error) {
            if (error instanceof Error && error.name === "ReportNotFoundError") {
              return null;
            }
            throw error;
          }
        })();

        const [artifactsResult, materialsResult, publicationsResult, reviewResult] =
          await Promise.allSettled([
            artifactsPromise,
            materialsPromise,
            publicationsPromise,
            reviewPromise,
          ]);
        if (artifactsResult.status === "rejected")
          errorCode("artifacts", artifactsResult.reason);
        if (materialsResult.status === "rejected")
          errorCode("materials", materialsResult.reason);
        if (publicationsResult.status === "rejected")
          errorCode("publications", publicationsResult.reason);
        if (reviewResult.status === "rejected")
          errorCode("review", reviewResult.reason);

        const artifacts =
          artifactsResult.status === "fulfilled" ? artifactsResult.value : [];
        const materials =
          materialsResult.status === "fulfilled" ? materialsResult.value : [];
        const publications =
          publicationsResult.status === "fulfilled"
            ? publicationsResult.value
            : [];
        const review =
          reviewResult.status === "fulfilled" ? reviewResult.value : null;

        const metrics: {
          subject: string | null;
          rows: Array<{
            projectId?: string;
            title: string;
            plays: number | null;
            likes: number | null;
            comments: number | null;
            shares: number | null;
          }>;
          retention: Array<{ atSeconds: number; retentionRate: number }>;
        } = { subject: project.title, rows: [], retention: [] };
        try {
          const merged = {
            plays: null as number | null,
            likes: null as number | null,
            comments: null as number | null,
            shares: null as number | null,
          };
          for (const publication of publications) {
            const page = await analyticsService.getPublicationAnalytics(
              c,
              publication.id,
              1,
              10,
            );
            const latest = page.rows
              .slice()
              .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
            const raw = (latest?.rawMetrics ?? {}) as Record<string, unknown>;
            const num = (key: string): number | null => {
              const value = raw[key];
              return typeof value === "number" && Number.isFinite(value)
                ? value
                : null;
            };
            merged.plays = merged.plays ?? num("views") ?? num("plays");
            merged.likes = merged.likes ?? num("likes") ?? num("digg");
            merged.comments = merged.comments ?? num("comments");
            merged.shares = merged.shares ?? num("shares");
          }
          if (Object.values(merged).some((value) => value !== null)) {
            metrics.rows.push({ projectId: project.id, title: project.title, ...merged });
          }
        } catch (error) {
          errorCode("metrics", error);
        }

        let cover: { assetId: string; title: string } | null = null;
        const coverAssetId =
          publications.find((publication) => publication.coverAssetId)?.coverAssetId ??
          materials.find((material) => material.role === "cover")?.assetId ??
          null;
        if (coverAssetId) {
          try {
            const asset = await assetsService.getAsset(c, coverAssetId);
            cover = { assetId: asset.id, title: asset.name };
          } catch (error) {
            errorCode("cover", error);
          }
        }

        const brief = (project.briefDetail ?? {}) as Record<string, unknown>;
        const str = (value: unknown): string | undefined =>
          typeof value === "string" && value.trim() ? value.trim() : undefined;
        const publishedAt = publications.find((row) => row.publishedAt)?.publishedAt ?? null;
        const lifecycle: ProjectLifecycleRaw = {
          traceId,
          project: {
            id: project.id,
            title: project.title,
            stage: project.currentStage,
            status: project.status,
            source: project.source,
            publishedAt,
          },
          brief: {
            targetAudience: str(brief.targetAudience),
            contentGoal: str(brief.contentGoal),
            contentFormat: str(brief.contentFormat),
            targetPlatforms: Array.isArray(brief.targetPlatforms)
              ? brief.targetPlatforms.filter(
                  (value): value is string => typeof value === "string",
                )
              : undefined,
            durationEstimate: str(brief.durationEstimate),
            coreMessage: str(brief.coreMessage),
            successCriteria: str(brief.successCriteria),
          },
          artifacts,
          materials,
          cover,
          publications,
          metrics,
          review,
          retrospective: { learningCount: 0 },
          completeness: {
            brief: Object.keys(brief).length > 0 ? "available" : "empty",
            artifacts:
              artifactsResult.status === "rejected"
                ? "error"
                : availability(artifacts),
            materials:
              materialsResult.status === "rejected"
                ? "error"
                : availability(materials),
            cover: errors.some((error) => error.section === "cover")
              ? "error"
              : cover
                ? "available"
                : "empty",
            publications:
              publicationsResult.status === "rejected"
                ? "error"
                : availability(publications),
            metrics: errors.some((error) => error.section === "metrics")
              ? "error"
              : availability(metrics.rows),
            review:
              reviewResult.status === "rejected"
                ? "error"
                : review
                  ? "available"
                  : "empty",
            retrospective: "unavailable",
          },
          errors,
        };
        console.info(
          "[copilot-context]",
          JSON.stringify({
            traceId,
            userId: c.userId,
            accountId: c.accountId ?? null,
            projectId: project.id,
            artifactCount: artifacts.length,
            artifacts: artifacts.map((artifact) => ({
              artifactId: artifact.artifactId,
              currentVersionId: artifact.currentVersionId,
              versionNumber: artifact.versionNumber,
            })),
            readSurface: "copilot-context",
            errorSections: errors.map((error) => error.section),
          }),
        );
        return lifecycle;
      },
getReviewReport: async (
        c: RequestContext,
        opts: { projectId: string; reportId?: string },
      ) => {
        await readProject(c, opts.projectId);
        let report: Awaited<ReturnType<typeof reviewGateService.getLatestReport>>;
        try {
          report = await reviewGateService.getLatestReport(c, opts.projectId);
        } catch (error) {
          if (error instanceof Error && error.name === "ReportNotFoundError") {
            return null;
          }
          throw error;
        }
        if (isLegacyIncompleteReview(report)) return null;
        // 当前 service 只有 latest 窄读；指定过期 reportId 时明确查不到，绝不拿最新冒充。
        if (opts.reportId && opts.reportId !== report.id) return null;

        let artifactVersionId: string | null = null;
        let currentVersionId: string | null = null;
        let reviewedText = "";
        if (report.artifactId) {
          const artifact = await artifactsService.getArtifact(c, report.artifactId);
          currentVersionId = artifact.currentVersionId ?? null;
          const versions = await artifactsService.listVersions(c, report.artifactId);
          artifactVersionId =
            versions.find(
              (version) => version.versionNumber === report.artifactVersion,
            )?.id ?? null;
          if (artifactVersionId) {

            const reviewedVersion = await readArtifactVersion(c, report.artifactId, artifactVersionId);
            reviewedText = extractArtifactText(
              reviewedVersion.contentText,
              reviewedVersion.contentData,
            );
          }
        }
        const stale = Boolean(
          currentVersionId && currentVersionId !== artifactVersionId,
        );
        const occurrence = (
          quote: string,
        ): { start: number | null; end: number | null; unique: boolean } => {
          if (!quote) return { start: null, end: null, unique: false };
          const start = reviewedText.indexOf(quote);
          const unique =
            start >= 0 &&
            reviewedText.indexOf(quote, start + quote.length) < 0;
          return {
            start: start >= 0 ? start : null,
            end: start >= 0 ? start + quote.length : null,
            unique,
          };
        };
        return {
          id: report.id,
          projectId: report.projectId,
          artifactId: report.artifactId,
          artifactVersion: report.artifactVersion,
          artifactVersionId,
          verdict: report.verdict,
          summary: report.summary,
          modelLabel: report.modelLabel,
          reviewedAt: report.reviewedAt,
          stale,
          findings: [
            ...report.lintFindings.map((finding, index) => {
              const located = occurrence(finding.quote);
              return {
                findingId: `${report.id}:L1:${finding.ruleId}:${index}`,
                level: "L1" as const,
                quote: finding.quote,
                start: located.start ?? finding.offset,
                end:
                  located.end ?? finding.offset + finding.quote.length,
                category: finding.category,
                reason: finding.note,
                suggestion: finding.replacement,
                applicable:
                  !stale && Boolean(finding.replacement) && located.unique,
              };
            }),
            ...report.llmFindings.map((finding, index) => {
              const located = occurrence(finding.quote);
              return {
                findingId: `${report.id}:L2:${index}`,
                level: "L2" as const,
                quote: finding.quote,
                start: located.start,
                end: located.end,
                category: finding.category,
                reason: finding.reason,
                suggestion: finding.suggestion,
                applicable:
                  !stale && Boolean(finding.suggestion) && located.unique,
              };
            }),
          ],
        };
      }
};
}
