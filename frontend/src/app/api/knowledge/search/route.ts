import { NextResponse } from "next/server";
import type { RequestContext } from "@creatoros/contract";
import {
  AuthenticationError,
  OwnershipError,
} from "@creatoros/backend/modules/identity";
import { getKnowledgeSearchRuntime } from "@/server/persistence-client";
import { readSessionCookie } from "../../v1/auth/_session";
import {
  readRequestAccountId,
  resolveRequestContext,
  readRequestGroupId,
} from "@/lib/request-context.server";

// 知识库 AI 搜索入口(T-093 SPEC §3)—— 同步轻路由(distill 同款 escape hatch,
// hybrid 检索要经可配 embedding capability,不走 RPC envelope):
//   POST { q } → 鉴权 → knowledgeSearchRuntime.hybridSearch:
//     · 配了 knowledge.search.embed:存量回填 embedding → query embed → exact 优先 +
//       语义余弦补位(阈值截断,不足额不硬凑);
//     · 未配 / 跑不通:纯 ILIKE 关键词 + semanticEnabled:false(诚实降级,前端渲提示条)。
//   search_history 落真实记录;零命中诚实空数组(不生成、不推荐凑数)。只读,不产实体。

export const dynamic = "force-dynamic";

interface SearchRequestBody {
  q?: string;
}

export async function POST(req: Request): Promise<Response> {
  let body: SearchRequestBody;
  try {
    body = (await req.json()) as SearchRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const q = typeof body.q === "string" ? body.q.trim() : "";
  if (!q) {
    return NextResponse.json(
      { error: "q 不能为空:请输入要搜索的内容" },
      { status: 400 },
    );
  }

  const rawToken = readSessionCookie(req);
  let ctx: RequestContext;
  try {
    ctx = await resolveRequestContext(rawToken, readRequestAccountId(req), {
      rejectInvalidToken: true,
      groupId:readRequestGroupId(req),
    });
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
    const runtime = await getKnowledgeSearchRuntime();
    const { semanticEnabled, semanticError, hits } = await runtime.hybridSearch(
      ctx,
      q,
    );
    // 投影 wire DTO:结果卡要 entityId(点开详情预览)/title/摘要/命中来源。
    const results = hits.map((h) => {
      let excerpt = "";
      try {
        const parsed = JSON.parse(h.document.body) as { excerpt?: unknown };
        if (typeof parsed.excerpt === "string") excerpt = parsed.excerpt;
      } catch {
        excerpt = h.document.body.slice(0, 120);
      }
      return {
        knowledgeId: h.document.entityId,
        title: h.document.title,
        excerpt,
        matchType: h.matchType,
        score: h.score,
      };
    });
    return NextResponse.json({ q, semanticEnabled, semanticError, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/knowledge/search] failed:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
