import type { ProjectOverviewPage } from "@creatoros/contract";
import { OwnershipError } from "../../modules/projects";
import { createProjectOverviewQueryService } from "../../modules/query-services";
type ProjectStageName=ProjectOverviewPage["stage"];
export function createProjectOverviewApplication(ports: {
projectsService: Pick<ReturnType<typeof import("../../modules/projects").createProjectsService>, "getProjectOverviewCore" | "listOutputIdsByProject">;
publishingService: Pick<ReturnType<typeof import("../../modules/publishing").createPublishingService>, "listPublicationsByOutputIds">;
assetsService: Pick<ReturnType<typeof import("../../modules/assets").createAssetsService>, "getAsset">;
artifactsService: Pick<ReturnType<typeof import("../../modules/artifacts").createArtifactsService>, "listProjectArtifacts">;
materialLinksService: Pick<ReturnType<typeof import("../../modules/material-links").createMaterialLinksService>, "list">;
}) {
 const {projectsService,publishingService,assetsService,artifactsService,materialLinksService}=ports;
  const overviewActivity = (
    row: { id: string; eventType: string; occurredAt: string },
  ): ProjectOverviewPage["activities"][number] => {
    const labels: Record<string, string> = {
      project_created: "项目已创建",
      project_archived: "项目已归档",
      stage_transition: "项目阶段已更新",
      stage_gate_blocked: "阶段交付物待补齐",
      output_created: "已创建内容产出",
      output_updated: "内容产出已更新",
      task_created: "已创建项目任务",
      artifact_updated: "脚本或内容产物已更新",
      evidence_linked: "项目已关联新资料",
    };
    return {
      id: row.id,
      title: labels[row.eventType] ?? "项目状态变化",
      eventType: row.eventType,
      occurredAt: row.occurredAt,
      tone: row.eventType === "stage_gate_blocked" ? "warning" : "info",
    };
  };
  const overviewMetric = (
    id: string,
    label: string,
    value: number,
  ): ProjectOverviewPage["assetStats"][number] => ({
    id,
    label,
    value: String(value),
    delta: "",
    trend: "flat",
    tone: "neutral",
  });
  const artifactFileKind = (
    artifactType: string,
  ): ProjectOverviewPage["recentFiles"][number]["fileKind"] =>
    artifactType === "output_script" || artifactType === "master_script"
      ? "script"
      : artifactType === "shot_list" || artifactType === "timeline"
        ? "shot"
        : "document";
  const assetFileKind = (
    assetType: string,
  ): ProjectOverviewPage["recentFiles"][number]["fileKind"] =>
    assetType === "video" || assetType === "image"
      ? "shot"
      : assetType === "document" || assetType === "subtitle"
        ? "document"
        : "data";

  const overviewQuery = createProjectOverviewQueryService({
    projects: {
      getProjectOverview: async (ctx, projectId) => {
        const { project, stages, outputs, activities } =
          await projectsService.getProjectOverviewCore(ctx, projectId);
        return {
          projectId: project.id,
          projectTitle: project.title,
          stage: project.currentStage as ProjectStageName,
          progressPct: project.progressPct,
          stages: stages.map((row) => ({
            stage: row.stage as ProjectStageName,
            // `blocked` is an internal transition state and is never serialized.
            status: (row.status === "blocked" ? "needs_review" : row.status) as
              ProjectOverviewPage["stages"][number]["status"],
            progressPct: row.progressPct,
          })),
          outputs: outputs.map((row) => ({
            id: row.id,
            title: row.title,
            contentType:
              row.contentType as ProjectOverviewPage["outputs"][number]["contentType"],
            status:
              row.status as ProjectOverviewPage["outputs"][number]["status"],
          })),
          activities: activities
            .slice()
            .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
            .map(overviewActivity),
          projectInfo: [
            { label: "内容分类", value: project.contentCategory || "—" },
            { label: "创建模式", value: project.creationMode || "—" },
            { label: "项目状态", value: project.status || "—" },
            { label: "开始时间", value: project.startedAt },
            { label: "目标完成", value: project.targetCompletedAt ?? "—" },
          ],
          milestones: [],
        };
      },
    },
    assets: {
      getProjectAssetStats: async (ctx, projectId) => {
        // Repeat the project ownership gate because this facade runs concurrently
        // with the core facade; no project-scoped child read may become an oracle.
        await projectsService.listOutputIdsByProject(ctx, projectId);
        const [{ rows: links }, artifacts] = await Promise.all([
          materialLinksService.list(ctx, { projectId, page: 1, pageSize: 500 }),
          artifactsService.listProjectArtifacts(ctx, projectId),
        ]);
        const assetLinks = links.filter((row) => row.entityType === "asset");
        const knowledgeCount = links.filter(
          (row) => row.entityType === "knowledge",
        ).length;
        const uniqueAssetIds = [...new Set(assetLinks.map((row) => row.entityId))];
        const linkedAssets = (
          await Promise.all(
            uniqueAssetIds.map(async (assetId) => {
              try {
                return await assetsService.getAsset(ctx, assetId);
              } catch (err) {
                // Legacy dangling soft links are omitted honestly; new writes are
                // prevented by the MaterialLinks ownership validators.
                if (
                  err instanceof OwnershipError ||
                  (typeof err === "object" &&
                    err !== null &&
                    "code" in err &&
                    String(err.code).includes("Ownership"))
                ) {
                  return null;
                }
                throw err;
              }
            }),
          )
        ).filter((row): row is NonNullable<typeof row> => row !== null);

        const recentFiles: ProjectOverviewPage["recentFiles"] = [
          ...artifacts.map((row) => ({
            id: row.id,
            name: row.title,
            type: row.artifactType,
            fileKind: artifactFileKind(row.artifactType),
            updatedAt: row.updatedAt,
          })),
          ...linkedAssets.map((row) => ({
            id: row.id,
            name: row.name,
            type: row.assetType,
            fileKind: assetFileKind(row.assetType),
            updatedAt: row.updatedAt,
          })),
        ]
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, 12);

        return {
          assetStats: [
            overviewMetric("stat-assets", "关联素材", assetLinks.length),
            overviewMetric("stat-knowledge", "关联知识", knowledgeCount),
            overviewMetric("stat-artifacts", "内容产物", artifacts.length),
          ],
          recentFiles,
        };
      },
    },
    publishing: {
      getProjectPublishing: async (ctx, projectId) => {
        const outputIds = await projectsService.listOutputIdsByProject(
          ctx,
          projectId,
        );
        const rows = await publishingService.listPublicationsByOutputIds(
          ctx,
          outputIds,
        );
        return rows.map((row) => ({
          id: row.id,
          platform:
            row.platform as ProjectOverviewPage["publishing"][number]["platform"],
          status:
            row.status as ProjectOverviewPage["publishing"][number]["status"],
          publishedAt: row.publishedAt ?? null,
        }));
      },
    },
  });

 return overviewQuery;
}
