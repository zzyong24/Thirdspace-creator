import { z } from "zod";
import { defineEndpoint } from "../endpoint-definition";
import { id, paginationQuery } from "../primitives";
import {
  artifactResource,
  artifactVersionResource,
  artifactRelationResource,
  artifactStage,
  artifactType,
} from "../resources/artifacts";

const projectParams = z.object({ projectId: id });
const artifactParams = z.object({ artifactId: id });

// SPEC §13 "Artifacts" group.
export const artifactsOperations = {
  listArtifacts: defineEndpoint({
    id: "artifacts.list",
    method: "GET",
    path: "/projects/:projectId/artifacts",
    params: projectParams,
    query: paginationQuery,
    response: artifactResource,
    isList: true,
    fr: ["FR-ARTIFACTS-LIST"],
  }),
  createArtifact: defineEndpoint({
    id: "artifacts.create",
    method: "POST",
    path: "/projects/:projectId/artifacts",
    params: projectParams,
    body: z.object({
      title: z.string().min(1),
      artifactType,
      stage: artifactStage,
      // 将脚本/平台文案等 artifact 正式锚到 ContentOutput；省略表示项目级产物。
      contentOutputId: id.nullable().optional(),
    }),
    response: artifactResource,
    fr: ["FR-ARTIFACTS-CREATE"],
  }),
  getArtifact: defineEndpoint({
    id: "artifacts.get",
    method: "GET",
    path: "/artifacts/:artifactId",
    params: artifactParams,
    response: artifactResource,
    fr: ["FR-ARTIFACTS-GET"],
  }),
  createArtifactVersion: defineEndpoint({
    id: "artifacts.versions.create",
    method: "POST",
    path: "/artifacts/:artifactId/versions",
    params: artifactParams,
    body: z.object({
      // 可选乐观并发门：需要基于当前版本编辑的调用方传入。服务端发现页面已落后时
      // 拒绝追加，避免旧稿覆盖后来保存的 artifact version；旧调用保持兼容。
      expectedCurrentVersionId: id.optional(),
      contentText: z.string().default(""),
      changeSummary: z.string().default(""),
      // Structured, editable payload (jsonb). The 脚本 editor serializes its
      // section id→text map here as { sections: [{ id, heading, body }] } so a
      // saved/AI-drafted version round-trips back into editable 分镜 sections.
      contentData: z.record(z.string(), z.unknown()).optional(),
    }),
    response: artifactVersionResource,
    fr: ["FR-ARTIFACTS-VERSION-CREATE"],
  }),
  applyScriptPatch: defineEndpoint({
    id: "artifacts.scriptPatches.apply",
    method: "POST",
    path: "/artifacts/:artifactId/script-patches/apply",
    params: artifactParams,
    body: z.object({
      expectedVersionId: id,
      // 宿主提供的结构段 ID，或 script-text-range:<sha256>:<start>:<end> 纯文范围锚点。
      // 纯文范围只允许原版本的唯一精确局部原文；服务端重验 hash/范围并 CAS 追加版本。
      sectionId: id,
      expectedOriginalText: z.string().min(1).max(12_000),
      replacementText: z.string().min(1).max(12_000),
      changeSummary: z.string().default("Copilot 局部改稿"),
    }),
    // 返回本次写入前的权威版本，确保多卡顺序采纳后每张卡的“撤销”只撤销自己，
    // 不会跳回所有候选共同绑定的旧 base version。
    response: artifactVersionResource.extend({ previousVersionId: id }),
    fr: ["FR-ARTIFACTS-VERSION-CREATE"],
  }),
  listArtifactVersions: defineEndpoint({
    id: "artifacts.versions.list",
    method: "GET",
    path: "/artifacts/:artifactId/versions",
    params: artifactParams,
    query: paginationQuery,
    response: artifactVersionResource,
    isList: true,
    fr: ["FR-ARTIFACTS-VERSION-LIST", "FR-014"],
  }),
  restoreArtifact: defineEndpoint({
    id: "artifacts.restore",
    method: "POST",
    path: "/artifacts/:artifactId/restore",
    params: artifactParams,
    body: z.object({
      versionId: id,
      // 局部改稿撤销会携带自己写出的版本；若之后又有新保存，服务端拒绝旧卡回滚，
      // 避免撤销前一张卡时覆盖后续卡片或用户编辑。普通历史版本恢复可继续省略。
      expectedCurrentVersionId: id.optional(),
    }),
    response: artifactResource,
    fr: ["FR-ARTIFACTS-RESTORE"],
  }),
  createArtifactRelation: defineEndpoint({
    id: "artifacts.relations.create",
    method: "POST",
    path: "/artifacts/:artifactId/relations",
    params: artifactParams,
    body: z.object({
      targetArtifactId: id,
      relationType: z.string().min(1),
    }),
    response: artifactRelationResource,
    fr: ["FR-ARTIFACTS-RELATION-CREATE"],
  }),
} as const;
