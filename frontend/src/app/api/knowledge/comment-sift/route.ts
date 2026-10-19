import {KnowledgeGenerationPendingError} from '@creatoros/backend/modules/ai-runtime';
import { NextResponse } from "next/server";
import type { RequestContext } from "@creatoros/contract";
import {
  AuthenticationError,
  OwnershipError,
} from "@creatoros/backend/modules/identity";
import { getChatRuntime } from "@/server/persistence-client";
import {
  runCommentQaSift,
  type SiftCommentInput,
} from "@creatoros/backend/modules/ai-runtime";
import {
  prefilterComments,
  collectBackflowedAnchors,
  type PrefilterSignal,
} from "@/server/knowledge/comment-prefilter";
import { readSessionCookie } from "../../v1/auth/_session";
import {
  readRequestAccountId,
  resolveRequestContext,
  readRequestGroupId,
} from "@/lib/request-context.server";
import { createServerClient } from "@/lib/contract-client.server";

// 评论回流入口(T-092 SPEC §2)—— 三级去噪门的 ①+②(③确认门在前端):
//   POST(空 body)→ 鉴权 → 服务端自读 audience_signals(source='comment',不信任客户端)
//   → ①硬规则预筛(纯函数:短/水/已回流排除,likeCount top 200)
//   → ②AI 蒸馏筛 comment.qa-sift(只留真疑问 + 同义合并;capability 可配)
//   → 返回 qa 候选(带支撑评论详情与幂等锚),前端渲 ③确认门,人采纳才 knowledge.create。
//
// 诚实空态:audience_signals 0 行 → { signalsTotal: 0 }(前端渲「先去复盘页采集」引导,
// 不渲假门);预筛后 0 条 → 同样诚实返回(全是水/已回流)。

export const dynamic = "force-dynamic";

interface SignalDto {
  readonly id: string;
  readonly rawText: string;
  readonly likeCount: number | null;
  readonly externalId: string | null;
  readonly createdAt: string;
}

interface KnowledgeListDto {
  readonly status: string;
  readonly sourceMetadata: Record<string, unknown>;
}

export async function POST(req: Request): Promise<Response> {
  const rawToken = readSessionCookie(req);
  let ctx: RequestContext;
  try {
    ctx = await resolveRequestContext(
      rawToken,
      readRequestAccountId(req),
      { rejectInvalidToken: true,groupId:readRequestGroupId(req) },
    );
  } catch (err) {
    if (err instanceof AuthenticationError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof OwnershipError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }

  try {
    const client = createServerClient(ctx);
    // 采集到的评论信号(user-scoped 真值)。
    const signals = (await client.listAudienceSignals({
      params: undefined,
      query: { page: 1, pageSize: 200, source: "comment" },
      body: undefined,
    })) as unknown as ReadonlyArray<SignalDto>;
    const signalRows: PrefilterSignal[] = (
      Array.isArray(signals) ? signals : []
    ).map((s) => ({
      id: s.id,
      rawText: s.rawText,
      likeCount: s.likeCount ?? null,
      externalId: s.externalId ?? null,
      createdAt: s.createdAt,
    }));

    // 诚实空态:没采集过评论 → 不渲假门,前端引导去复盘页采集。
    if (signalRows.length === 0) {
      return NextResponse.json({
        signalsTotal: 0,
        prefiltered: 0,
        droppedNoise: 0,
        droppedBackflowed: 0,
        candidates: [],
      });
    }

    // 已回流锚(knowledge sourceMetadata 反查,双集合:externalIds + signalIds 兜底)。
    const items = (await client.listKnowledge({
      params: undefined,
      query: { page: 1, pageSize: 200 },
      body: undefined,
    })) as unknown as ReadonlyArray<KnowledgeListDto>;
    const anchors = collectBackflowedAnchors(Array.isArray(items) ? items : []);

    // ① 硬规则预筛。
    const pre = prefilterComments(
      signalRows,
      anchors.externalIds,
      anchors.signalIds,
    );
    if (pre.kept.length === 0) {
      return NextResponse.json({
        signalsTotal: signalRows.length,
        prefiltered: 0,
        droppedNoise: pre.droppedNoise,
        droppedBackflowed: pre.droppedBackflowed,
        candidates: [],
      });
    }

    // ② AI 蒸馏筛(comment.qa-sift,capability 可配)。
    const runtime = await getChatRuntime();
    const siftInput: SiftCommentInput[] = pre.kept.map((s) => ({
      signalId: s.id,
      rawText: s.rawText,
      likeCount: s.likeCount,
    }));
    const { candidates } = await runtime.runWithEffectiveSkills(
      ctx,
      ["comment.qa-sift"],
      () =>
        runCommentQaSift(
          ctx,
          { comments: siftInput,signal:req.signal },
          { runKnowledgeGeneration: runtime.runKnowledgeGeneration },
        ),
    );

    // 候选带回支撑评论详情 + 幂等锚(externalIds),供 ③确认门展示与采纳落
    // sourceMetadata 双料锚,前端不必再反查。
    const byId = new Map(pre.kept.map((s) => [s.id, s]));
    const enriched = candidates.map((c) => {
      const supporting = c.signalIds
        .map((id) => byId.get(id))
        .filter((s): s is PrefilterSignal => Boolean(s));
      return {
        ...c,
        signalExternalIds: supporting
          .map((s) => s.externalId)
          .filter((v): v is string => Boolean(v)),
        supportingComments: supporting.map((s) => ({
          id: s.id,
          rawText: s.rawText,
          likeCount: s.likeCount,
        })),
      };
    });

    return NextResponse.json({
      signalsTotal: signalRows.length,
      prefiltered: pre.kept.length,
      droppedNoise: pre.droppedNoise,
      droppedBackflowed: pre.droppedBackflowed,
      candidates: enriched,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/knowledge/comment-sift] failed:", err);
    return NextResponse.json({ error: message,...(err instanceof KnowledgeGenerationPendingError?{taskId:err.taskId,executionTaskId:err.executionTaskId,runtimeStatus:err.runtimeStatus,errorCode:err.errorCode}:{}) }, { status: 400 });
  }
}
