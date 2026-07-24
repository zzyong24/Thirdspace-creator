import { createHash } from "node:crypto";

import {
  and,
  desc,
  eq,
  inArray,
  intelligenceItems,
  intelligenceTransforms,
  itemTranscripts,
  projectIntelligenceReferences,
  sourceSnapshots,
  type Db,
} from "@creatoros/backend";
import type {
  ProjectIntelligenceReferenceResource,
  RequestContext,
} from "@creatoros/contract";
import {
  IntelligenceConflictError,
  IntelligenceValidationError,
  OwnershipError,
  requireAccountId,
} from "./intelligence.errors";

type ReferenceRow = typeof projectIntelligenceReferences.$inferSelect;

export interface ProjectIntelligenceSourceContext {
  reference: ProjectIntelligenceReferenceResource;
  item: {
    id: string;
    title: string;
    canonicalUrl: string;
    authorName: string | null;
  };
  snapshot: {
    id: string;
    finalUrl: string;
    capturedAt: string;
    contentHash: string;
    safeExtract: string | null;
  };
  transform: {
    id: string;
    positioningVersionId: string;
    outputSnapshot: Record<string, unknown>;
  };
  transcript: {
    text: string;
    hash: string;
    completedAt: string;
    provider: string | null;
    model: string | null;
  };
}

export interface ProjectIntelligenceReferenceService {
  /**
   * 显式接线入口：只接受已经由内容雷达确认出的 topic。item/snapshot 不能由调用方
   * 任意拼装，而是必须与该 topic 对应的不可变 transform 完全一致。
   */
  attach(
    ctx: RequestContext,
    input: {
      projectId: string;
      topicId: string;
      itemId?: string;
      sourceSnapshotId?: string;
      idempotencyKey: string;
    },
  ): Promise<ProjectIntelligenceReferenceResource>;

  /**
   * Candidate promote 成功后的组合层桥接。普通/手动候选没有 intelligence
   * transform，诚实返回 null；雷达候选则同步写入 Project 来源引用。
   */
  attachFromPromotion(
    ctx: RequestContext,
    input: { projectId: string; topicId: string },
  ): Promise<ProjectIntelligenceReferenceResource | null>;

  /**
   * Project 脚本生成的唯一来源读取口：一次返回来源链接、原快照、确认时的拆写
   * 和 hash 校验后的逐字稿。调用方不得绕过此口直接拿“当前逐字稿”。
   */
  getSourceContexts(
    ctx: RequestContext,
    input: { projectId: string; referenceIds?: string[] },
  ): Promise<ProjectIntelligenceSourceContext[]>;
}

export interface ProjectIntelligenceReferenceServiceDeps {
  now: () => string;
  nextId: (prefix: string) => string;
  projects?: {
    assertExists(ctx: RequestContext, projectId: string): Promise<void>;
  };
}

function transcriptHash(text: string): string {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

function toReference(row: ReferenceRow): ProjectIntelligenceReferenceResource {
  return {
    id: row.id,
    projectId: row.projectId,
    topicId: row.topicId,
    itemId: row.itemId,
    sourceSnapshotId: row.sourceSnapshotId,
    transformId: row.transformId,
    transcriptHash: row.transcriptHash,
    createdAt: row.createdAt,
  };
}

export function createProjectIntelligenceReferenceService(
  db: Db,
  deps: ProjectIntelligenceReferenceServiceDeps,
): ProjectIntelligenceReferenceService {
  async function findConfirmedTransform(
    ctx: RequestContext,
    topicId: string,
  ) {
    const accountId = requireAccountId(
      ctx.accountId,
      "intelligence.projectReference.transform",
    );
    const [transform] = await db
      .select()
      .from(intelligenceTransforms)
      .where(
        and(
          eq(intelligenceTransforms.userId, ctx.userId),
          eq(intelligenceTransforms.accountId, accountId),
          eq(intelligenceTransforms.targetTopicId, topicId),
          eq(intelligenceTransforms.status, "confirmed"),
        ),
      )
      .orderBy(desc(intelligenceTransforms.updatedAt))
      .limit(1);
    return transform ?? null;
  }

  async function attachResolved(
    ctx: RequestContext,
    input: {
      projectId: string;
      topicId: string;
      itemId?: string;
      sourceSnapshotId?: string;
      idempotencyKey: string;
    },
    missingIsNull: boolean,
  ): Promise<ProjectIntelligenceReferenceResource | null> {
    const accountId = requireAccountId(
      ctx.accountId,
      "intelligence.projectReference.attach",
    );
    if (!input.idempotencyKey.trim()) {
      throw new IntelligenceValidationError("idempotencyKey 不能为空");
    }
    if (deps.projects) {
      await deps.projects.assertExists(ctx, input.projectId);
    }

    const transform = await findConfirmedTransform(ctx, input.topicId);
    if (!transform) {
      if (missingIsNull) return null;
      throw new OwnershipError("Intelligence topic provenance not found");
    }
    if (input.itemId && input.itemId !== transform.itemId) {
      throw new IntelligenceValidationError(
        "itemId 与已确认选题的来源作品不一致",
      );
    }
    if (
      input.sourceSnapshotId &&
      input.sourceSnapshotId !== transform.sourceSnapshotId
    ) {
      throw new IntelligenceValidationError(
        "sourceSnapshotId 与已确认选题的来源快照不一致",
      );
    }

    const [transcript] = await db
      .select()
      .from(itemTranscripts)
      .where(
        and(
          eq(itemTranscripts.itemId, transform.itemId),
          eq(itemTranscripts.userId, ctx.userId),
          eq(itemTranscripts.accountId, accountId),
        ),
      )
      .limit(1);
    const text = transcript?.text?.trim() ?? "";
    if (
      !transcript ||
      transcript.status !== "done" ||
      !text ||
      !transcript.completedAt
    ) {
      throw new IntelligenceConflictError(
        "来源逐字稿尚未完成，不能透传到 Project",
      );
    }
    const hash = transcriptHash(text);

    const [existing] = await db
      .select()
      .from(projectIntelligenceReferences)
      .where(
        and(
          eq(projectIntelligenceReferences.userId, ctx.userId),
          eq(projectIntelligenceReferences.accountId, accountId),
          eq(projectIntelligenceReferences.projectId, input.projectId),
          eq(projectIntelligenceReferences.transformId, transform.id),
        ),
      )
      .limit(1);
    if (existing) return toReference(existing);

    const [created] = await db
      .insert(projectIntelligenceReferences)
      .values({
        id: deps.nextId("project-intelligence-reference"),
        userId: ctx.userId,
        accountId,
        projectId: input.projectId,
        topicId: input.topicId,
        itemId: transform.itemId,
        sourceSnapshotId: transform.sourceSnapshotId,
        transformId: transform.id,
        transcriptHash: hash,
        createdAt: deps.now(),
      })
      .onConflictDoNothing()
      .returning();
    if (created) return toReference(created);

    const [raced] = await db
      .select()
      .from(projectIntelligenceReferences)
      .where(
        and(
          eq(projectIntelligenceReferences.userId, ctx.userId),
          eq(projectIntelligenceReferences.accountId, accountId),
          eq(projectIntelligenceReferences.projectId, input.projectId),
          eq(projectIntelligenceReferences.transformId, transform.id),
        ),
      )
      .limit(1);
    if (!raced) {
      throw new Error("failed to attach project intelligence reference");
    }
    return toReference(raced);
  }

  return {
    async attach(ctx, input) {
      const reference = await attachResolved(ctx, input, false);
      if (!reference) {
        throw new OwnershipError("Intelligence topic provenance not found");
      }
      return reference;
    },

    attachFromPromotion(ctx, input) {
      return attachResolved(
        ctx,
        {
          ...input,
          idempotencyKey: `candidate-promotion:${input.topicId}`,
        },
        true,
      );
    },

    async getSourceContexts(ctx, input) {
      const accountId = requireAccountId(
        ctx.accountId,
        "intelligence.projectReference.context",
      );
      if (deps.projects) {
        await deps.projects.assertExists(ctx, input.projectId);
      }
      const requestedIds = [...new Set(input.referenceIds ?? [])];
      const conditions = [
        eq(projectIntelligenceReferences.userId, ctx.userId),
        eq(projectIntelligenceReferences.accountId, accountId),
        eq(projectIntelligenceReferences.projectId, input.projectId),
      ];
      if (requestedIds.length > 0) {
        conditions.push(
          inArray(projectIntelligenceReferences.id, requestedIds),
        );
      }
      const references = await db
        .select()
        .from(projectIntelligenceReferences)
        .where(and(...conditions))
        .orderBy(projectIntelligenceReferences.createdAt);
      if (
        requestedIds.length > 0 &&
        references.length !== requestedIds.length
      ) {
        throw new OwnershipError("Project intelligence reference not found");
      }

      const contexts: ProjectIntelligenceSourceContext[] = [];
      for (const reference of references) {
        const [[item], [snapshot], [transform], [transcript]] =
          await Promise.all([
            db
              .select()
              .from(intelligenceItems)
              .where(
                and(
                  eq(intelligenceItems.id, reference.itemId),
                  eq(intelligenceItems.userId, ctx.userId),
                  eq(intelligenceItems.accountId, accountId),
                ),
              )
              .limit(1),
            db
              .select()
              .from(sourceSnapshots)
              .where(
                and(
                  eq(sourceSnapshots.id, reference.sourceSnapshotId),
                  eq(sourceSnapshots.userId, ctx.userId),
                  eq(sourceSnapshots.accountId, accountId),
                ),
              )
              .limit(1),
            db
              .select()
              .from(intelligenceTransforms)
              .where(
                and(
                  eq(intelligenceTransforms.id, reference.transformId),
                  eq(intelligenceTransforms.userId, ctx.userId),
                  eq(intelligenceTransforms.accountId, accountId),
                ),
              )
              .limit(1),
            db
              .select()
              .from(itemTranscripts)
              .where(
                and(
                  eq(itemTranscripts.itemId, reference.itemId),
                  eq(itemTranscripts.userId, ctx.userId),
                  eq(itemTranscripts.accountId, accountId),
                ),
              )
              .limit(1),
          ]);
        const text = transcript?.text?.trim() ?? "";
        if (
          !item ||
          !snapshot ||
          !transform ||
          !transform.outputSnapshot ||
          !transcript ||
          transcript.status !== "done" ||
          !transcript.completedAt ||
          !text
        ) {
          throw new IntelligenceConflictError(
            "Project 来源上下文不完整，不能生成稿件",
          );
        }
        const currentHash = transcriptHash(text);
        if (currentHash !== reference.transcriptHash) {
          throw new IntelligenceConflictError(
            "来源逐字稿已变化，请重新确认来源后再生成稿件",
          );
        }
        contexts.push({
          reference: toReference(reference),
          item: {
            id: item.id,
            title: item.title,
            canonicalUrl: item.canonicalUrl,
            authorName: item.authorName,
          },
          snapshot: {
            id: snapshot.id,
            finalUrl: snapshot.finalUrl,
            capturedAt: snapshot.capturedAt,
            contentHash: snapshot.contentHash,
            safeExtract: snapshot.safeExtract,
          },
          transform: {
            id: transform.id,
            positioningVersionId: transform.positioningVersionId,
            outputSnapshot: transform.outputSnapshot as Record<
              string,
              unknown
            >,
          },
          transcript: {
            text,
            hash: currentHash,
            completedAt: transcript.completedAt,
            provider: transcript.provider,
            model: transcript.model,
          },
        });
      }
      return contexts;
    },
  };
}
