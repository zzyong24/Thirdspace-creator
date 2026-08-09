import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id, paginationQuery } from "../primitives";
import {
  artifactResource,
  artifactVersionResource,
  artifactRelationResource,
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
      artifactType: z.string().min(1),
      stage: z.string().min(1),
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
      sectionId: id,
      expectedOriginalText: z.string().min(1).max(12_000),
      replacementText: z.string().min(1).max(12_000),
      changeSummary: z.string().default("Copilot 局部改稿"),
    }),
    response: artifactVersionResource,
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
    body: z.object({ versionId: id }),
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
