import {KnowledgeGenerationPendingError} from '@creatoros/backend/modules/ai-runtime';
import { NextResponse } from "next/server";
import type { RequestContext } from "@creatoros/contract";
import {
  AuthenticationError,
  OwnershipError,
} from "@creatoros/backend/modules/identity";
import { getChatRuntime } from "@/server/persistence-client";
import {
  runKnowledgeRelate,
  type RelateAtomInput,
} from "@creatoros/backend/modules/ai-runtime";
import { readSessionCookie } from "../../v1/auth/_session";
import {
  readRequestAccountId,
  resolveRequestContext,
  readRequestGroupId,
} from "@/lib/request-context.server";
import { createServerClient } from "@/lib/contract-client.server";

// 图谱 AI 建边入口(T-091 SPEC §1.3)—— 同步轻路由(/api/knowledge/distill 同款 escape
// hatch):图谱 tab 点「AI 找关联」→ POST(空 body)→ 鉴权 → **服务端自读**该用户 active
// 知识原子清单(不信任客户端投喂)→ runKnowledgeRelate(capability "knowledge.relate"
// 经 model-config 解析)→ 返回候选边 { candidates: [{sourceId,targetId,relationType,reason}] }。
//
// 铁律:AI 只产候选 —— 本路由不写 knowledge_relations;前端确认门人点「采纳选中 N 条」
// 才逐条走 contract knowledge.relations.create(createdByType='ai')。空候选诚实返回
// (真没有语义关系不硬凑);凭据/模型失败诚实 4xx。

export const dynamic = "force-dynamic";

interface KnowledgeListDto {
  readonly id: string;
  readonly title: string;
  readonly knowledgeType: string;
  readonly status: string;
  readonly sourceNote?: string | null;
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
    // 服务端自读原子清单(user-scoped 真值;archived 不进图谱也不进提议)。
    const items = (await createServerClient(ctx).listKnowledge({
      params: undefined,
      query: { page: 1, pageSize: 200 },
      body: undefined,
    })) as unknown as ReadonlyArray<KnowledgeListDto>;
    const atoms: RelateAtomInput[] = (Array.isArray(items) ? items : [])
      .filter((i) => i.status === "active")
      .map((i) => ({
        id: i.id,
        knowledgeType: i.knowledgeType,
        title: i.title,
        sourceNote: i.sourceNote ?? null,
      }));

    const runtime = await getChatRuntime();
    const result = await runtime.runWithEffectiveSkills(
      ctx,
      ["knowledge.relate"],
      () =>
        runKnowledgeRelate(
          ctx,
          { atoms,signal:req.signal },
          { runKnowledgeGeneration: runtime.runKnowledgeGeneration },
        ),
    );
    return NextResponse.json(result);
  } catch (err) {
    // 没配 model key / 模型不可用 → 诚实 4xx(不假绿、不静默)。
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/knowledge/relate] failed:", err);
    return NextResponse.json({ error: message,...(err instanceof KnowledgeGenerationPendingError?{taskId:err.taskId,executionTaskId:err.executionTaskId,runtimeStatus:err.runtimeStatus,errorCode:err.errorCode}:{}) }, { status: 400 });
  }
}
