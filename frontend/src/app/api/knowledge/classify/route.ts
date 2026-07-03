import { NextResponse } from "next/server";
import type { RequestContext } from "@creatoros/contract";
import { AuthenticationError } from "@creatoros/backend/modules/identity";
import { getChatRuntime } from "@/server/persistence-client";
import { runKnowledgeClassify } from "@/server/ai/knowledge-classify-runner";
import { readSessionCookie } from "../../v1/auth/_session";
import { resolveRequestContext } from "@/lib/request-context.server";

// 知识倾倒场归类入口(T-062c SPEC §4)—— 同步轻路由(/api/chat 同款 escape hatch:AI 交互
// 不走 RPC envelope):倾倒场 POST { content } → 鉴权(session cookie → RequestContext,
// T-046 单机免登录直通)→ runKnowledgeClassify(capability "knowledge.classify" 经
// model-config 解析,不写死)→ 返回归类候选 { knowledgeType, title, tags, summary }。
//
// 铁律:AI 只产候选 —— 本路由**不写任何实体**;前端确认门卡片人点「存入知识库」才走
// contract knowledge.create。失败诚实 4xx(无凭据/模型不可用/产出不可用),倾倒场内联展示,
// 原始输入保留供重试或手动补录 [gate-F2]。

export const dynamic = "force-dynamic";

interface ClassifyRequestBody {
  content?: string;
}

export async function POST(req: Request): Promise<Response> {
  let body: ClassifyRequestBody;
  try {
    body = (await req.json()) as ClassifyRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json(
      { error: "content 不能为空:请先倒入要归类的文本" },
      { status: 400 },
    );
  }

  // 鉴权:同 /api/chat —— 有 cookie 验 token,无/失效 cookie 以本机主用户直通(T-046)。
  const rawToken = readSessionCookie(req);
  let ctx: RequestContext;
  try {
    ctx = await resolveRequestContext(rawToken);
  } catch (err) {
    if (err instanceof AuthenticationError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const runtime = await getChatRuntime();
  try {
    const classification = await runKnowledgeClassify(
      ctx,
      { content },
      { resolveModelSpec: runtime.resolveModelSpec },
    );
    return NextResponse.json({ classification });
  } catch (err) {
    // 没配 model key(LlmCredentialError)/模型产出不可用等 → 诚实 4xx(不假绿、不静默)。
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/knowledge/classify] failed:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
