import type { RequestContext } from "@creatoros/contract";
import type { ArtifactsService } from "../artifacts/artifacts.service";
/** 经领域只读端口取得策划依据，各入口共用同一版本选择与归属规则。 */
export function createArtifactContextReaders(artifactsService:Pick<ArtifactsService,"listProjectArtifacts"|"listVersions">){
        const readArtifactContentData = async (
          c: RequestContext,
          projectId: string,
          artifactType: string,
        ): Promise<Record<string, unknown> | null> => {
          const artifacts = await artifactsService.listProjectArtifacts(
            c,
            projectId,
          );
          const target = artifacts.find((a) => a.artifactType === artifactType);
          if (!target) return null;
          const versions = await artifactsService.listVersions(c, target.id);
          if (versions.length === 0) return null;
          const current =
            versions.find((version) => version.id === target.currentVersionId) ??
            versions.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0];
          const data = current?.contentData;
          return data && typeof data === "object" && !Array.isArray(data)
            ? (data as Record<string, unknown>)
            : null;
        };
        // T-730：生成式写稿只读取当前项目当前 thesis_tree 版本上明确 adopted 的节点。
        // 历史无标记、inactive 或非法状态一律返回空；UI 读侧仍可展示这些历史内容。
        const thesisReader = {
          getThesisNodes: async (c: RequestContext, projectId: string) => {
            const data = await readArtifactContentData(c, projectId, "thesis_tree");
            const basis =
              data?.scriptBasis &&
              typeof data.scriptBasis === "object" &&
              !Array.isArray(data.scriptBasis)
                ? (data.scriptBasis as { status?: unknown })
                : null;
            if (basis?.status !== "adopted") return [];
            const rawNodes = Array.isArray(data?.nodes) ? data.nodes : [];
            return rawNodes
              .map((raw) => {
                const node = (raw ?? {}) as Record<string, unknown>;
                return {
                  column: typeof node.column === "string" ? node.column : "",
                  title: typeof node.title === "string" ? node.title : "",
                  summary: typeof node.summary === "string" ? node.summary : "",
                };
              })
              .filter((node) => node.column && (node.title || node.summary));
          },
        };
        // 内容合同 reader (planning.outline) — read the project's `content_contract`
        // artifact's current version's `contentData.cards` back as the constraint the
        // structure must honor.
        const contractReader = {
          getContractCards: async (c: RequestContext, projectId: string) => {
            const data = await readArtifactContentData(
              c,
              projectId,
              "content_contract",
            );
            const rawCards = Array.isArray(data?.cards) ? data!.cards : [];
            return rawCards
              .map((raw) => {
                const o = (raw ?? {}) as Record<string, unknown>;
                return {
                  title: typeof o.title === "string" ? o.title : "",
                  body: typeof o.body === "string" ? o.body : "",
                };
              })
              .filter((c2) => c2.title || c2.body);
          },
        };
        // 结构方案 reader (SEAM-01, script.draft) — read the project's `content_outline`
        // artifact's current version `contentData` ({structureType, opening, sections,
        // ending, cta}) back as the blueprint the script.draft node fleshes out. Same
        // public-service read path as contract (no cross-module repo import).
        const outlineReader = {
          getOutline: async (c: RequestContext, projectId: string) => {
            const data = await readArtifactContentData(
              c,
              projectId,
              "content_outline",
            );
            if (!data) return null;
            const rawSections = Array.isArray(data.sections)
              ? data.sections
              : [];
            const sections = rawSections
              .map((raw) => {
                const o = (raw ?? {}) as Record<string, unknown>;
                return {
                  label: typeof o.label === "string" ? o.label : "",
                  intent: typeof o.intent === "string" ? o.intent : "",
                };
              })
              .filter((s) => s.label || s.intent);
            const structureType =
              typeof data.structureType === "string" ? data.structureType : "";
            const opening = typeof data.opening === "string" ? data.opening : "";
            const ending = typeof data.ending === "string" ? data.ending : "";
            const cta = typeof data.cta === "string" ? data.cta : "";
            // No adopted outline content at all → null (script.draft degrades to no blueprint).
            if (
              sections.length === 0 &&
              !structureType &&
              !opening &&
              !ending &&
              !cta
            ) {
              return null;
            }
            return { structureType, opening, sections, ending, cta };
          },
        };
        // F2 消费侧隔离 reader (T-030-D4, SPEC §7 边界②) — reports the origin of the
        // project's current artifact of a given type so assembleCreativeContext can mark a
        // reconstructed contract/outline brief "未经确认" before it rides downstream
        // as a 已确认前提. Reuses the SAME public-service read (listProjectArtifacts →
        // ArtifactRow.origin) the content readers use — no extra content fetch, no repo import.
        const artifactOriginReader = {
          getArtifactOrigin: async (
            c: RequestContext,
            projectId: string,
            artifactType: string,
          ): Promise<"user" | "reconstructed" | null> => {
            const artifacts = await artifactsService.listProjectArtifacts(
              c,
              projectId,
            );
            const target = artifacts.find(
              (a) => a.artifactType === artifactType,
            );
            const origin = target?.origin ?? null;
            return origin === "reconstructed" || origin === "user"
              ? origin
              : null;
          },
        };
  return {readArtifactContentData,thesisReader,contractReader,outlineReader,artifactOriginReader};
}
