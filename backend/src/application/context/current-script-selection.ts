import type {RequestContext} from "@creatoros/contract";
import type {ChatProductionServicePorts} from "../../modules/ai-runtime";
import {canonicalizeScriptSectionRecords,type ArtifactsService} from "../../modules/artifacts";
export interface ScriptSelectionSection {
  id: string;
  originalText: string;
}

export type ScriptSelectionMatchStrategy =
  | "id"
  | "text"
  | "position"
  | "whole_text";

export interface ResolvedCurrentScriptSelection {
  sectionId: string;
  originalText: string;
  matchStrategy: ScriptSelectionMatchStrategy;
}

export interface ResolveCurrentScriptSelectionInput {
  currentVersionId: string;
  requestedVersionId?: string;
  requestedSectionId: string;
  requestedExcerpt: string;
  requestedSectionIndex?: number;
  /**
   * 兼容尚未携带 sectionIndex 的旧桌面包：服务端可从请求所指的历史版本中恢复用户当时
   * 明确点选的段落位置，再把这个位置绑定到当前版本。这里只恢复结构位置，不复用旧正文。
   */
  requestedVersionSections?: readonly ScriptSelectionSection[];
  contentDataSections: readonly ScriptSelectionSection[];
  structuredSections: readonly ScriptSelectionSection[];
  contentText?: string | null;
}

/** 每次执行均读取当前版本；旧版本只用于恢复用户明确选择的位置。 */
export function createCurrentScriptSelectionReader(ports:{artifactsService:Pick<ArtifactsService,"getArtifact"|"listVersions"|"getScriptSections">;resolveCurrentScriptSelectionFromTruth:(input:ResolveCurrentScriptSelectionInput)=>ResolvedCurrentScriptSelection|null}){
const {artifactsService,resolveCurrentScriptSelectionFromTruth}=ports;
return async (c:RequestContext, input: Parameters<NonNullable<ChatProductionServicePorts["resolveCurrentScriptSelection"]>>[1]) => {
      const artifact = await artifactsService.getArtifact(c, input.artifactId);
      if (!artifact.currentVersionId) return null;
      const versions = await artifactsService.listVersions(c, input.artifactId);
      const current = versions.find(
        (version) => version.id === artifact.currentVersionId,
      );
      if (!current) return null;

      const data =
        current.contentData && typeof current.contentData === "object"
          ? (current.contentData as Record<string, unknown>)
          : null;
      const rawSections =
        data && Array.isArray(data.sections) ? data.sections : [];
      const contentDataSections = canonicalizeScriptSectionRecords(
        rawSections,
      ).map((section) => {
        const id = section.id;
        const originalText = [
          section.body,
          section.narration,
          section.text,
          section.content,
        ].find(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        );
        return { id, originalText: originalText ?? "" };
      });

      // 一些历史稿把结构化段落存在 script_sections，而 contentData 只留整稿/摘要。
      // 版本恢复后必须读取“当前版本自己的”结构化行，不能继续拿恢复前的前端快照判定
      // sectionId 不存在。两种存储形态合并后仍只允许 id 命中或唯一原文命中。
      const storedRows = await artifactsService.getScriptSections(c, current.id);
      const structuredSections = storedRows.flatMap((section) => {
        const id = typeof section.id === "string" ? section.id.trim() : "";
        const originalText =
          typeof section.content === "string" ? section.content.trim() : "";
        return id && originalText ? [{ id, originalText }] : [];
      });

      // 旧桌面包的局部改稿请求还没有 sectionIndex。若用户在 v16 点过第 3 段、随后稿面
      // 切到 v17，不能因为旧 sectionId 失效就要求再点一次；服务端从请求明确指向的 v16
      // 恢复“第 3 段”这个结构位置，再交给 resolver 读取 v17 的第 3 段当前正文。
      // 该历史版本只用于恢复用户已明确表达的位置，不会把历史正文重新送给工具。
      let requestedVersionSections:
        | Array<{ id: string; originalText: string }>
        | undefined;
      if (
        !Number.isInteger(input.sectionIndex) &&
        input.versionId &&
        input.versionId !== current.id
      ) {
        const requestedVersion = versions.find(
          (version) => version.id === input.versionId,
        );
        if (requestedVersion) {
          const requestedData =
            requestedVersion.contentData &&
            typeof requestedVersion.contentData === "object"
              ? (requestedVersion.contentData as Record<string, unknown>)
              : null;
          const requestedRawSections =
            requestedData && Array.isArray(requestedData.sections)
              ? requestedData.sections
              : [];
          requestedVersionSections = canonicalizeScriptSectionRecords(
            requestedRawSections,
          ).map((section) => {
            const id = section.id;
            const originalText = [
              section.body,
              section.narration,
              section.text,
              section.content,
            ].find(
              (value): value is string =>
                typeof value === "string" && value.trim().length > 0,
            );
            return { id, originalText: originalText ?? "" };
          });
          if (requestedVersionSections.length === 0) {
            const requestedRows = await artifactsService.getScriptSections(
              c,
              requestedVersion.id,
            );
            requestedVersionSections = requestedRows.flatMap((section) => {
              const id =
                typeof section.id === "string" ? section.id.trim() : "";
              const originalText =
                typeof section.content === "string"
                  ? section.content.trim()
                  : "";
              return id && originalText ? [{ id, originalText }] : [];
            });
          }
        }
      }
      const selected = resolveCurrentScriptSelectionFromTruth({
        currentVersionId: current.id,
        requestedVersionId: input.versionId,
        requestedSectionId: input.sectionId,
        requestedSectionIndex: input.sectionIndex,
        requestedExcerpt: input.excerpt,
        requestedVersionSections,
        contentDataSections,
        structuredSections,
        contentText: current.contentText,
      });
      if (!selected) return null;
      return {
        artifactId: artifact.id,
        versionId: current.id,
        sectionId: selected.sectionId,
        originalText: selected.originalText,
        matchStrategy: selected.matchStrategy,
      };
    };
}
