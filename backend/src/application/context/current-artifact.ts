import {createHash} from "node:crypto";
import type {RequestContext} from "@creatoros/contract";
import {extractLegacyScriptText,canonicalizeScriptSectionRecords,type ArtifactsService} from "../../modules/artifacts";
import type {ProjectsService} from "../../modules/projects";
export function extractArtifactText(
  contentText: string | null | undefined,
  contentData: unknown,
): string {
  const data =
    contentData && typeof contentData === "object"
      ? (contentData as Record<string, unknown>)
      : null;
  // 结构化稿面：用与稳定段落引用相同的规范化顺序拼正文。
  if (data && Array.isArray(data.sections)) {
    const joined = canonicalizeScriptSectionRecords(data.sections)
      .map((section) => {
        const heading = [section.heading, section.label].find(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        );
        const body = [
          section.body,
          section.narration,
          section.text,
          section.content,
        ].find(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        );
        return [heading, body].filter(Boolean).join("\n");
      })
      .filter((line) => line.length > 0)
      .join("\n\n");
    if (joined.trim()) return joined;
  }
  return extractLegacyScriptText(contentText, contentData);
}

/** 当前版本、规范正文与稳定段落引用的共享只读源。 */
export function createCurrentArtifactReader(ports:{projectsService:Pick<ProjectsService,"getProject">;artifactsService:Pick<ArtifactsService,"listProjectArtifacts"|"listVersions"|"getScriptSections">}) {
const {projectsService,artifactsService}=ports;
return async (
    c: RequestContext,
    projectId: string,
    artifactType: string,
  ) => {
    await projectsService.getProject(c, projectId);
    const artifactRows = await artifactsService.listProjectArtifacts(c, projectId);
    const target = artifactRows.find((row) => row.artifactType === artifactType);
    if (!target?.currentVersionId) return null;
    const versions = await artifactsService.listVersions(c, target.id);
    const current = versions.find(
      (version) => version.id === target.currentVersionId,
    );
    if (!current) return null;

    const data =
      current.contentData &&
      typeof current.contentData === "object" &&
      !Array.isArray(current.contentData)
        ? (current.contentData as Record<string, unknown>)
        : {};
    let sections = canonicalizeScriptSectionRecords(data.sections).map(
      (section, index) => {
        const heading = [section.heading, section.label].find(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        );
        const body = [
          section.body,
          section.narration,
          section.text,
          section.content,
        ].find(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        );
        const sectionType = [section.sectionType, section.type, section.role].find(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        );
        const finite = (value: unknown): number | null =>
          typeof value === "number" && Number.isFinite(value) ? value : null;
        return {
          sectionRef: section.id,
          index,
          heading: heading?.trim() ?? "",
          body: body ?? "",
          sectionType: sectionType?.trim() ?? null,
          startSeconds: finite(section.startSeconds ?? section.start),
          endSeconds: finite(section.endSeconds ?? section.end),
        };
      },
    );
    if (sections.length === 0 && artifactType === "output_script") {
      const rows = await artifactsService.getScriptSections(c, current.id);
      sections = rows.flatMap((section, index) => {
        const body =
          typeof section.content === "string" ? section.content : "";
        const sectionRef =
          typeof section.id === "string" ? section.id.trim() : "";
        if (!body.trim() || !sectionRef) return [];
        return [
          {
            sectionRef,
            index,
            heading: "",
            body,
            sectionType:
              typeof section.sectionType === "string"
                ? section.sectionType
                : null,
            startSeconds:
              typeof section.startSeconds === "number"
                ? section.startSeconds
                : null,
            endSeconds:
              typeof section.endSeconds === "number" ? section.endSeconds : null,
          },
        ];
      });
    }
    const fullText =
      sections.length > 0
        ? sections
            .map((section) =>
              [section.heading, section.body].filter(Boolean).join("\n"),
            )
            .join("\n\n")
        : extractArtifactText(current.contentText, current.contentData);
    return {
      artifactType: target.artifactType,
      projectId,
      artifactId: target.id,
      currentVersionId: current.id,
      versionNumber: current.versionNumber,
      updatedAt: target.updatedAt ?? null,
      contentHash: createHash("sha256").update(fullText).digest("hex"),
      truthPriority: "current_confirmed_script" as const,
      sections,
      fullText,
    };
  };
}
