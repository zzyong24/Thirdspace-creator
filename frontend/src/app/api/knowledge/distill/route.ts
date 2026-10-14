import {KnowledgeGenerationPendingError} from '@creatoros/backend/modules/ai-runtime';
import { NextResponse } from "next/server";
import type { RequestContext } from "@creatoros/contract";
import {
  AuthenticationError,
  OwnershipError,
} from "@creatoros/backend/modules/identity";
import { getChatRuntime } from "@/server/persistence-client";
import { runKnowledgeDistill } from "@creatoros/backend/modules/ai-runtime";
import { readSessionCookie } from "../../v1/auth/_session";
import {
  readRequestAccountId,
  resolveRequestContext,
  readRequestGroupId,
} from "@/lib/request-context.server";
import { humanizeAiError } from "@/lib/ai-error-humanize";

// 知识倾倒场蒸馏入口(T-079b SPEC §2)—— 同步轻路由(/api/knowledge/classify 同款 escape
// hatch:AI 交互不走 RPC envelope):倾倒场 POST { content } → 鉴权(session cookie →
// RequestContext,T-046 单机免登录直通)→ runKnowledgeDistill(capability
// "knowledge.distill" 经 model-config 解析,不写死)→ 返回一批知识原子候选
// { atoms: [{type,title,note,sourceNote}], suggestedTags }。
//
// 铁律:AI 只产候选 —— 本路由**不写任何实体**;前端蒸馏批量确认门人点「采纳选中 N 条」才
// 逐条走 contract knowledge.create。失败诚实 4xx(无凭据/模型不可用/产出不可用),倾倒场
// 内联展示,原始输入保留供重试或手动补录 [gate-F2]。

export const dynamic = "force-dynamic";

interface DistillRequestBody {
  content?: string;
}

export async function POST(req: Request): Promise<Response> {
  let body: DistillRequestBody;
  try {
    body = (await req.json()) as DistillRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json(
      { error: "content 不能为空:请先倒入要蒸馏的文本" },
      { status: 400 },
    );
  }

  // 鉴权:同 /api/knowledge/classify —— 有 cookie 验 token,无/失效 cookie 以本机主用户直通(T-046)。
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

  const runtime = await getChatRuntime();
  try {
    const distillation = await runtime.runWithEffectiveSkills(
      ctx,
      ["knowledge.distill"],
      () =>
        runKnowledgeDistill(
          ctx,
          { content,signal:req.signal },
          { runKnowledgeGeneration: runtime.runKnowledgeGeneration },
        ),
    );
    return NextResponse.json(distillation);
  } catch (err) {
    // 没配 model key(LlmCredentialError)/模型产出不可用等 → 诚实 4xx(不假绿、不静默)。
    // [T-094] 平台类错误(如 MiniMax new_sensitive/1026 内容安全拦截)先过人话映射
    // (lib/ai-error-humanize 单一真值,与对话蒸馏工具卡同一套),不再裸吐机器码。
    const raw = err instanceof Error ? err.message : String(err);
    const message = humanizeAiError(err)?.message ?? raw;
    console.error("[api/knowledge/distill] failed:", err);
    return NextResponse.json({ error: message,...(err instanceof KnowledgeGenerationPendingError?{taskId:err.taskId,executionTaskId:err.executionTaskId,runtimeStatus:err.runtimeStatus,errorCode:err.errorCode}:{}) }, { status: 400 });
  }
}
