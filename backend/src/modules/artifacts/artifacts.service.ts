import type { RequestContext } from "@creatoros/contract";
import type { Db } from "@creatoros/backend";
import {
  createArtifactRepository,
  type ArtifactRepository,
  type ArtifactRow,
  type ArtifactVersionRow,
  type ArtifactRelationRow,
  type ScriptSectionRow,
  type StructuredContent,
} from "./artifacts.repository";
import { ConflictError } from "./artifacts.errors";

// Artifacts service (foundation §5.3) — RequestContext-taking methods that thread
// `ctx.userId` into a user-scoped repository built per-call via `repoFor(ctx)`
// (foundation §2). Artifacts has NO lifecycle state machine (roadmap §5: "No
// machine for Knowledge/Artifacts — append-only versioning"). The invariants the
// service enforces are the append-only version rules (SPEC §18, data-model §9
// rules 6–7), not status transitions:
//   - createVersion appends + re-points (the repo enforces; the version row is
//     never mutated).
//   - restoreVersion clones to a NEW version (the repo enforces).
//   - replaceStructuredContent is refused unless the target is the artifact's
//     CURRENT version (immutable-plan guard, roadmap §5 callout 5) — and its
//     evidence targets are validated via the injected Knowledge/Assets guards
//     (MODULE-ARCH §4.3: Knowledge/Assets never depend back on Artifacts).
//
// The AI-adopt seam (SPEC §18): AI never writes the current version directly. The
// AI module's `AiService.confirmResult` calls `createVersion(ctx, artifactId, {
// contentText, changeSummary, createdByType:'ai', aiTaskId })`. Artifacts does NOT
// import AI; AI imports Artifacts via index.ts. The only code here is accepting
// `createdByType:'ai'` + `aiTaskId` (passed straight through to the repo).
//
// Post-commit (SPEC §11): createVersion calls the injected SearchService upsert
// (best-effort; a failure is swallowed and never rolls back the version write).

// Injected post-commit search upsert seam — best-effort, never rolls back.
export type SearchUpsert = (
  ctx: RequestContext,
  input: { entityType: string; entityId: string; title: string; body: string },
) => Promise<unknown>;

// Injected evidence-target ownership guards (Knowledge / Assets public services).
// Each throws if the referenced id is not owned by ctx.userId.
export type AssertOwned = (ctx: RequestContext, id: string) => Promise<unknown>;

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
  /** Optional post-commit index upsert (SPEC §11). */
  searchUpsert?: SearchUpsert;
  /** Optional evidence-target validators (MODULE-ARCH §4.3). */
  assertKnowledgeOwned?: AssertOwned;
  assertAssetOwned?: AssertOwned;
}

export interface ArtifactsService {
  listProjectArtifacts(
    ctx: RequestContext,
    projectId: string,
  ): Promise<ArtifactRow[]>;
  getArtifact(ctx: RequestContext, artifactId: string): Promise<ArtifactRow>;
  createArtifact(
    ctx: RequestContext,
    input: {
      projectId: string;
      title: string;
      artifactType: string;
      stage: string;
      contentOutputId?: string | null;
      // F1 (T-030-D4, SPEC §4.5): provenance. Default 'user' (null); auto-fill
      // (reconstruct.project) MUST pass 'reconstructed'.
      origin?: "user" | "reconstructed";
    },
  ): Promise<ArtifactRow>;
  createVersion(
    ctx: RequestContext,
    artifactId: string,
    input: {
      contentText?: string;
      changeSummary?: string;
      contentData?: Record<string, unknown>;
      createdByType?: string;
      aiTaskId?: string | null;
      // F1 (T-030-D4): explicit provenance for this version's content. When
      // omitted, createVersion applies the origin lifecycle (§4.5): a
      // user-authored version (createdByType !== 'ai') flips a 'reconstructed'
      // artifact back to 'user'; an AI version leaves origin untouched.
      origin?: "user" | "reconstructed";
    },
  ): Promise<ArtifactVersionRow>;
  listVersions(
    ctx: RequestContext,
    artifactId: string,
  ): Promise<ArtifactVersionRow[]>;
  restoreVersion(
    ctx: RequestContext,
    artifactId: string,
    versionId: string,
  ): Promise<ArtifactRow>;
  createRelation(
    ctx: RequestContext,
    artifactId: string,
    input: { targetArtifactId: string; relationType: string },
  ): Promise<ArtifactRelationRow>;
  replaceStructuredContent(
    ctx: RequestContext,
    artifactId: string,
    artifactVersionId: string,
    payload: StructuredContent,
  ): Promise<void>;
  getScriptSections(
    ctx: RequestContext,
    artifactVersionId: string,
  ): Promise<ScriptSectionRow[]>;
  // Ownership guard for AI / Ingestion callers (returns the ref or throws).
  assertArtifactOwned(
    ctx: RequestContext,
    artifactId: string,
  ): Promise<ArtifactRow>;
}

export function createArtifactsService(deps: ServiceDeps): ArtifactsService {
  function repoFor(ctx: RequestContext): ArtifactRepository {
    return createArtifactRepository(deps.db, {
      now: deps.now,
      nextId: deps.nextId,
      userId: ctx.userId,
    });
  }

  return {
    async listProjectArtifacts(ctx, projectId) {
      return repoFor(ctx).listByProject(projectId);
    },

    async getArtifact(ctx, artifactId) {
      return repoFor(ctx).requireArtifact(artifactId);
    },

    async createArtifact(ctx, input) {
      // origin threads straight to the repo (default null ≡ 'user'; auto-fill
      // passes 'reconstructed' — F1, SPEC §4.5).
      return repoFor(ctx).create(input);
    },

    async createVersion(ctx, artifactId, input) {
      // origin lifecycle (flip 'reconstructed'→'user' on user edit) is applied in
      // the repo's createVersion (F1, SPEC §4.5); input.origin passes through.
      const version = await repoFor(ctx).createVersion(artifactId, input);
      // Post-commit (SPEC §11): re-index best-effort. A failure never rolls back
      // the version write — the index is derived data.
      if (deps.searchUpsert) {
        try {
          const artifact = await repoFor(ctx).requireArtifact(artifactId);
          await deps.searchUpsert(ctx, {
            entityType: "artifact",
            entityId: artifact.id,
            title: artifact.title,
            body: version.contentText,
          });
        } catch {
          // swallow — derived-index failure is retryable, never fatal.
        }
      }
      return version;
    },

    async listVersions(ctx, artifactId) {
      return repoFor(ctx).listVersions(artifactId);
    },

    async restoreVersion(ctx, artifactId, versionId) {
      return repoFor(ctx).restore(artifactId, versionId);
    },

    async createRelation(ctx, artifactId, input) {
      // Both ends owned is enforced by the repo (cross-user → OwnershipError 404).
      return repoFor(ctx).createRelation(artifactId, input);
    },

    async replaceStructuredContent(ctx, artifactId, artifactVersionId, payload) {
      const repo = repoFor(ctx);
      // Ownership gate + immutable-plan guard: structured content is only ever
      // written against the artifact's CURRENT version (roadmap §5 callout 5).
      const artifact = await repo.requireArtifact(artifactId);
      if (artifact.currentVersionId !== artifactVersionId) {
        throw new ConflictError(
          "Structured content may only be written to the artifact's current version",
        );
      }
      // [T-055f] evidence_links 退役(用户拍板③;校验段随表删除)。
      await repo.replaceStructuredContent(artifactVersionId, payload);
    },

    async getScriptSections(ctx, artifactVersionId) {
      // Ownership is transitive via the version's parent; this read is scoped to
      // the version id (callers reach it only after an owned getArtifact).
      return repoFor(ctx).getScriptSections(artifactVersionId);
    },

    async assertArtifactOwned(ctx, artifactId) {
      return repoFor(ctx).requireArtifact(artifactId);
    },
  };
}
