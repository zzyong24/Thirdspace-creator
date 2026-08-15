import type { RequestContext } from "@creatoros/contract";
import { requireAccountId, type Db } from "@creatoros/backend";
import {
  createArtifactRepository,
  type ArtifactRepository,
  type ArtifactRow,
  type ArtifactVersionRow,
  type ArtifactRelationRow,
  type ScriptSectionRow,
  type StructuredContent,
} from "./artifacts.repository";
import { ConflictError, ValidationError } from "./artifacts.errors";
import {
  canonicalizeScriptContentData,
  canonicalizeScriptSectionRecords,
} from "./script-section-identity";

// Artifacts service (foundation §5.3) — RequestContext-taking methods that thread
// `ctx.userId` into a user-scoped repository built per-call via `repoFor(ctx)`
// (foundation §2). Artifacts has NO lifecycle state machine (roadmap §5: "No
// machine for Knowledge/Artifacts — append-only versioning"). The invariants the
// service enforces are the append-only version rules (SPEC §18, data-model §9
// rules 6–7), not status transitions:
//   - createVersion appends + re-points (the repo enforces; the version row is
//     never mutated).
//   - restoreVersion re-points to an existing immutable version without creating
//     a duplicate revision (the repo enforces).
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

// [T-183] 改稿 delta 捕捉的 best-effort post-commit seam(仿 SearchUpsert 注入范式,避免
// Artifacts 反向 import Learnings;composition root 绑到 learningsService.captureEditDelta)。
// 当前一版是 AI 产出、新版是用户手改的脚本时,把 before→after 差异沉淀成品味信号候选。
// 失败必被 service 吞掉,绝不回滚版本写(SPEC §11:派生信号非事务)。
export type RecordEditDelta = (
  ctx: RequestContext,
  input: {
    projectId: string;
    artifactId: string;
    before: string;
    after: string;
  },
) => Promise<unknown>;

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
  /** Optional post-commit index upsert (SPEC §11). */
  searchUpsert?: SearchUpsert;
  /** Optional evidence-target validators (MODULE-ARCH §4.3). */
  assertKnowledgeOwned?: AssertOwned;
  assertAssetOwned?: AssertOwned;
  /** Project/output association guards supplied by the Projects public service. */
  assertProjectOwned?: AssertOwned;
  resolveOutputProjectId?: (
    ctx: RequestContext,
    outputId: string,
  ) => Promise<string | null>;
  /** [T-183] Optional 改稿 delta → 品味信号 best-effort seam. */
  recordEditDelta?: RecordEditDelta;
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
      expectedCurrentVersionId?: string;
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
  /**
   * T-716：确定性应用一个已经由 AI 生成、由用户明确采纳的段落补丁。
   * 服务端重读当前真值并完成版本、段落和原文三重并发校验；AI 和前端都不拼整稿。
   */
  applyScriptPatch(
    ctx: RequestContext,
    artifactId: string,
    input: {
      expectedVersionId: string;
      sectionId: string;
      expectedOriginalText: string;
      replacementText: string;
      changeSummary?: string;
    },
  ): Promise<ArtifactVersionRow & { previousVersionId: string }>;
  listVersions(
    ctx: RequestContext,
    artifactId: string,
  ): Promise<ArtifactVersionRow[]>;
  restoreVersion(
    ctx: RequestContext,
    artifactId: string,
    versionId: string,
    expectedCurrentVersionId?: string,
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
  // [T-332 S2 · SPEC §4.2] 每个经 ctx 的入口都经此建 repo:未选号 → AccountRequiredError
  // (引导态禁读写),有号则 strict 收窄到该号。op 标注抛点便于前端归因。
  function repoFor(ctx: RequestContext, op: string): ArtifactRepository {
    return createArtifactRepository(deps.db, {
      now: deps.now,
      nextId: deps.nextId,
      userId: ctx.userId,
      accountId: requireAccountId(ctx.accountId, op),
    });
  }

  const service: ArtifactsService = {
    async listProjectArtifacts(ctx, projectId) {
      return repoFor(ctx, "artifacts.listProjectArtifacts").listByProject(projectId);
    },

    async getArtifact(ctx, artifactId) {
      return repoFor(ctx, "artifacts.getArtifact").requireArtifact(artifactId);
    },

    async createArtifact(ctx, input) {
      // Artifact owns its content/version lifecycle, while Projects owns the
      // project/output relationship. Validate through injected public-service
      // ports before persisting so CLI/API callers cannot create orphan scripts.
      if (deps.assertProjectOwned) {
        await deps.assertProjectOwned(ctx, input.projectId);
      }
      if (input.contentOutputId && deps.resolveOutputProjectId) {
        const outputProjectId = await deps.resolveOutputProjectId(
          ctx,
          input.contentOutputId,
        );
        if (outputProjectId !== input.projectId) {
          throw new ValidationError(
            "ValidationError: contentOutputId does not belong to projectId",
          );
        }
      }
      // origin threads straight to the repo (default null ≡ 'user'; auto-fill
      // passes 'reconstructed' — F1, SPEC §4.5).
      return repoFor(ctx, "artifacts.createArtifact").create(input);
    },

    async createVersion(ctx, artifactId, input) {
      const repo = repoFor(ctx, "artifacts.createVersion");
      const artifactForWrite = await repo.requireArtifact(artifactId);
      const isScriptArtifact =
        artifactForWrite.artifactType === "output_script" ||
        artifactForWrite.artifactType === "master_script";
      const versionInput =
        isScriptArtifact && input.contentData
          ? {
              ...input,
              contentData: canonicalizeScriptContentData(input.contentData),
            }
          : input;
      // [T-183] 改稿 delta 捕捉:在 append 重指针「前」先抓「前一版 = 当前版」快照(内容 +
      // createdByType),用于判定「AI 产出 → 用户手改」并算 before→after 差异。best-effort:
      // 仅在 recordEditDelta seam 已接线时才读,失败不影响主流程。
      let prevVersion: ArtifactVersionRow | null = null;
      let artifactBefore: ArtifactRow | null = null;
      if (deps.recordEditDelta) {
        try {
          artifactBefore = artifactForWrite;
          if (artifactBefore.currentVersionId) {
            prevVersion = await repo.getVersion(artifactBefore.currentVersionId);
          }
        } catch {
          prevVersion = null;
          artifactBefore = null;
        }
      }

      // origin lifecycle (flip 'reconstructed'→'user' on user edit) is applied in
      // the repo's createVersion (F1, SPEC §4.5); input.origin passes through.
      const version = await repo.createVersion(artifactId, versionInput);
      // Post-commit (SPEC §11): re-index best-effort. A failure never rolls back
      // the version write — the index is derived data.
      if (deps.searchUpsert) {
        try {
          const artifact = await repo.requireArtifact(artifactId);
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

      // [T-183] 品味信号沉淀:前一版是 AI 产出(createdByType==='ai')、新版是用户手改
      // (createdByType 非 'ai',即 transport 默认 'user')、且为脚本 artifact(output_script /
      // master_script)时,把 before→after delta 沉淀成 edit_delta candidate learning(经既有
      // 裁决台 promote 成写稿规则)。best-effort:未命中/失败永不阻塞、不回滚版本写(SPEC §11)。
      if (deps.recordEditDelta && prevVersion && artifactBefore) {
        try {
          const prevIsAi = prevVersion.createdByType === "ai";
          // 严格判「用户手改」:transport 手改路径不传 createdByType → 默认 'user'。机器来源
          // (ai / ingestion / restore 等)都不是改稿信号,一律排除(避免 ingestion 候选误触)。
          const newIsUser = (input.createdByType ?? "user") === "user";
          const isScript =
            artifactBefore.artifactType === "output_script" ||
            artifactBefore.artifactType === "master_script";
          if (prevIsAi && newIsUser && isScript) {
            await deps.recordEditDelta(ctx, {
              projectId: artifactBefore.projectId,
              artifactId,
              before: prevVersion.contentText,
              after: version.contentText,
            });
          }
        } catch {
          // swallow — 品味信号是派生数据,失败绝不影响版本写(与 searchUpsert 同 §11 语义)。
        }
      }
      return version;
    },

    async listVersions(ctx, artifactId) {
      return repoFor(ctx, "artifacts.listVersions").listVersions(artifactId);
    },

    async restoreVersion(ctx, artifactId, versionId, expectedCurrentVersionId) {
      const repo = repoFor(ctx, "artifacts.restoreVersion");
      return repo.restore(artifactId, versionId, expectedCurrentVersionId);
    },

    async applyScriptPatch(ctx, artifactId, input) {
      const repo = repoFor(ctx, "artifacts.applyScriptPatch");
      const artifact = await repo.requireArtifact(artifactId);
      const expected = await repo.getVersion(input.expectedVersionId);
      if (expected.artifactId !== artifactId) {
        throw new ConflictError("局部改稿候选不属于当前脚本，未写入稿面");
      }
      if (!artifact.currentVersionId) {
        throw new ConflictError("当前脚本没有可应用局部改稿的版本");
      }
      // T-833：同一次回复的多张候选都锚在同一旧版本。第一张采纳后，后续候选应
      // 基于权威当前稿安全重放，而不是仅因版本号变化全部过期。目标段原文的逐字
      // 比对仍是最终冲突门：同段已被用户或另一候选修改时绝不覆盖。
      const current =
        artifact.currentVersionId === expected.id
          ? expected
          : await repo.getVersion(artifact.currentVersionId);
      const data: Record<string, unknown> =
        current.contentData &&
        typeof current.contentData === "object" &&
        !Array.isArray(current.contentData)
          ? { ...(current.contentData as Record<string, unknown>) }
          : {};
      const rawSections = Array.isArray(data.sections) ? data.sections : [];
      const sections = canonicalizeScriptSectionRecords(rawSections);
      const targetIndex = sections.findIndex(
        (section) => section.id === input.sectionId,
      );
      if (targetIndex < 0) {
        throw new ConflictError("目标段落已不存在，请基于当前稿面重新选择段落");
      }

      const normalized = (value: unknown) =>
        typeof value === "string" ? value.trim() : "";
      if (
        normalized(sections[targetIndex]?.body) !==
        normalized(input.expectedOriginalText)
      ) {
        throw new ConflictError(
          "目标段落在补丁生成后已经修改，请基于当前稿面重新发起局部改稿",
        );
      }

      const replacementText = input.replacementText.trim();
      if (!replacementText) {
        throw new ConflictError("局部改稿候选为空，未写入稿面");
      }
      if (normalized(sections[targetIndex]?.body) === normalized(replacementText)) {
        throw new ConflictError("建议稿与当前段原文相同，没有可写入的修改");
      }
      const nextSections = sections.map((section, index) =>
        index === targetIndex
          ? { ...section, body: replacementText }
          : section,
      );
      const nextContentData: Record<string, unknown> = {
        ...data,
        sections: nextSections,
      };
      // html 是旧版派生展示，不得跨版本携带，否则会覆盖 sections 的当前真值。
      delete nextContentData.html;
      const contentText = nextSections
        .map((section) =>
          [section.heading, section.body]
            .filter(
              (value): value is string =>
                typeof value === "string" && value.trim().length > 0,
            )
            .join("\n"),
        )
        .filter(Boolean)
        .join("\n\n");

      const version = await service.createVersion(ctx, artifactId, {
        expectedCurrentVersionId: current.id,
        contentText,
        contentData: nextContentData,
        changeSummary: input.changeSummary?.trim() || "Copilot 局部改稿",
        createdByType: "user",
      });
      return { ...version, previousVersionId: current.id };
    },

    async createRelation(ctx, artifactId, input) {
      // Both ends owned is enforced by the repo (cross-user → OwnershipError 404).
      return repoFor(ctx, "artifacts.createRelation").createRelation(artifactId, input);
    },

    async replaceStructuredContent(ctx, artifactId, artifactVersionId, payload) {
      const repo = repoFor(ctx, "artifacts.replaceStructuredContent");
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
      return repoFor(ctx, "artifacts.getScriptSections").getScriptSections(artifactVersionId);
    },

    async assertArtifactOwned(ctx, artifactId) {
      return repoFor(ctx, "artifacts.assertArtifactOwned").requireArtifact(artifactId);
    },
  };
  return service;
}
