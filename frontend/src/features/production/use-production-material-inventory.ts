"use client";
import {useCreationClient} from "@/lib/creation-workspace-scope";
import * as React from "react";
import {client} from "@/lib/contract-client";
import {aggregateAutoBroll,assetRefsFromScriptContentData,type AutoBrollItem} from "./production-flow";
/** 库存失败只影响该来源；不把历史候选快照冒充当前可用素材。 */
export function useProductionMaterialInventory(projectId:string){
 const client=useCreationClient();

  const [brollItems, setBrollItems] = React.useState<
    ReadonlyArray<{ linkId: string; assetId: string; kind: string; name: string }>
  >([]);
  const [brollInventoryStatus, setBrollInventoryStatus] = React.useState<
    "loading" | "ready" | "error"
  >("loading");
  const [autoBroll, setAutoBroll] = React.useState<ReadonlyArray<AutoBrollItem>>(
    [],
  );
  const loadBroll = React.useCallback(async () => {
    setBrollInventoryStatus("loading");
    try {
      const links = (await client.listMaterialLinks({
        params: undefined,
        query: { projectId, page: 1, pageSize: 100 },
        body: undefined,
      })) as unknown as ReadonlyArray<{
        id: string;
        entityType: string;
        entityId: string;
        role: string;
      }>;
      const brollLinks = links.filter(
        (l) => l.entityType === "asset" && l.role === "broll",
      );
      const items = await Promise.all(
        brollLinks.map(async (l) => {
          try {
            const a = (await client.getAsset({
              params: { assetId: l.entityId },
              query: undefined,
              body: undefined,
            })) as unknown as { assetType: string; name: string };
            return {
              linkId: l.id,
              assetId: l.entityId,
              kind: a.assetType,
              name: a.name,
            };
          } catch {
            return null; // 单条越权/已删跳过,不牵连整批
          }
        }),
      );
      const manual = items.filter((i): i is NonNullable<typeof i> => i !== null);
      setBrollItems(manual);

      // ── 自动聚合(best-effort:任一来源读失败只丢该来源,不牵连)────────────
      // 读某类型 artifact 当前版本 contentData(与稿面读侧同款 listArtifacts →
      // getArtifact → listArtifactVersions 三连;失败 → null)。
      const readContentData = async (
        artifactType: string,
      ): Promise<unknown> => {
        try {
          const listed = (await client.listArtifacts({
            params: { projectId },
            query: { page: 1, pageSize: 200 },
            body: undefined,
          })) as unknown as Array<{ id: string; artifactType: string }>;
          const target = (Array.isArray(listed) ? listed : []).find(
            (a) => a.artifactType === artifactType,
          );
          if (!target) return null;
          const artifact = (await client.getArtifact({
            params: { artifactId: target.id },
            query: undefined,
            body: undefined,
          })) as unknown as { currentVersionId?: string };
          const versions = (await client.listArtifactVersions({
            params: { artifactId: target.id },
            query: { page: 1, pageSize: 100 },
            body: undefined,
          })) as unknown as Array<{
            id: string;
            versionNumber: number;
            contentData?: unknown;
          }>;
          const rows = Array.isArray(versions) ? versions : [];
          const current =
            rows.find((v) => v.id === artifact.currentVersionId) ??
            rows.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0];
          return current?.contentData ?? null;
        } catch {
          return null;
        }
      };
      const scriptData = await readContentData("output_script");
      const projectAssetLinks = links.filter(
        (link) =>
          link.entityType === "asset" &&
          link.role !== "cover" &&
          link.role !== "final",
      );
      const projectAssetIds = new Set(
        projectAssetLinks.map((link) => link.entityId),
      );
      const projectRoleByAssetId = new Map(
        projectAssetLinks.map((link) => [link.entityId, link.role]),
      );
      // 候选 id(按来源优先级 script → ammo;聚合时先到先得)。
      const candidates: Array<{
        assetId: string;
        source: AutoBrollItem["source"];
        role?: string;
      }> =
        [
          ...assetRefsFromScriptContentData(scriptData)
            .filter((id) => projectAssetIds.has(id))
            .map((id) => ({
              assetId: id,
              source: "script" as const,
              role: projectRoleByAssetId.get(id),
            })),
          ...projectAssetLinks
            .filter(
              (l) =>
                l.role !== "broll" &&
                l.role !== "cover" &&
                l.role !== "final",
            )
            .map((l) => ({
              assetId: l.entityId,
              source: "ammo" as const,
              role: l.role,
            })),
        ];
      const resolved = await Promise.all(
        candidates.map(async (cand) => {
          try {
            const a = (await client.getAsset({
              params: { assetId: cand.assetId },
              query: undefined,
              body: undefined,
            })) as unknown as { assetType: string; name: string };
            // 只有图/视频能当 B-roll(文档/知识条目自然被 getAsset 失败或类型过滤掉)。
            if (a.assetType !== "video" && a.assetType !== "image") return null;
            if (cand.role === "clip" && a.assetType === "video") return null;
            return {
              assetId: cand.assetId,
              name: a.name,
              kind: a.assetType,
              source: cand.source,
            } satisfies AutoBrollItem;
          } catch {
            return null; // 知识条目 id / 越权 / 已删 → 跳过
          }
        }),
      );
      setAutoBroll(
        aggregateAutoBroll(
          resolved.filter((i): i is AutoBrollItem => i !== null),
          manual.map((m) => m.assetId),
        ),
      );
      setBrollInventoryStatus("ready");
    } catch {
      setBrollInventoryStatus("error");
    }
  }, [projectId]);

  React.useEffect(() => {
    const id = window.setTimeout(() => {
      void loadBroll();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadBroll]);

  return {brollItems,brollInventoryStatus,autoBroll,loadBroll};
}
