import { NextResponse } from "next/server";
import { consumeStream, type UIMessage } from "ai";
import type { RequestContext } from "@creatoros/contract";
import { OwnershipError } from "@creatoros/backend/modules/identity";
import { getChatRuntime } from "@/server/persistence-client";
import {
  runChatStream,
  type ChatContext,
} from "@creatoros/backend/modules/ai-runtime";
import { readSessionCookie } from "../v1/auth/_session";
import {
  resolveRequestContext,
  isAuthError,
  isOwnershipError,
} from "@/lib/request-context.server";
import {
  isTrustedLocalRequest,
  loopbackForbidden,
} from "@/lib/loopback-guard.server";
import { humanizeAiError } from "@/lib/ai-error-humanize";

// 上下文感知 ChatBox 的流式入口(SPEC §3.3)—— 全程 Vercel AI SDK,**不走 RPC envelope**:
// useChat 客户端 POST { messages, chatContext } 到这里 → 鉴权(同 dispatch:session cookie →
// RequestContext)→ runChatStream 装配(resolve skill + 注入 CreativeContext facets + 挂工具)
// → streamText 流式返回 → onFinish 把这轮的 user/assistant 文本落 ai_conversations/ai_messages。
//
// 铁律:AI 只产候选(工具 execute 产候选,经 tool-result part 流回前端渲 AdoptCandidateCard,
// 人采纳走 confirm 门;AI 不直接写实体)。没配 model key → runChatStream 抛 LlmCredentialError,
// 这里接住返 4xx(不假成功、不静默吞)。

export const dynamic = "force-dynamic";

// useChat(@ai-sdk/react)发来的请求体。messages 是 UIMessage[];chatContext 是会话三层注入的
// 上下文(surface 必填)。conversationId 可选(首轮缺省由路由 lazy 建一个会话复用)。
// [T-096] chatContext.scope = 会话作用域声明(前端 resolveChatScope 保证必带):
//   'global' | 'project:<id>' | 'surface:<name>'。lazy 建会话落它;续接时与库中会话的
//   scope 比对,不一致按 OwnershipError 语义 4xx 拒绝 —— 隔离锁在服务端,前端 bug/手工
//   请求都穿不透(SPEC 2026-07-03 §1.3-3)。
interface ChatRequestBody {
  messages?: UIMessage[];
  chatContext?: Partial<ChatContext> & { scope?: string };
  conversationId?: string;
  // [T-239f] useChat(DefaultChatTransport)默认 body 自带:trigger 区分「新消息」与
  // 「regenerate 重发」(d.ts 核实:'submit-message' | 'regenerate-message')。regenerate
  // 重发的是**同一条** user 消息 —— 不再重复 insert(幂等,治重复行真 bug)。
  trigger?: string;
  messageId?: string;
}

// [T-267②] 会话标题净化 —— 取首条用户消息前 24 字当会话名的老逻辑,遇到「斜杠命令 / 裸文件路径」
// 开头(如 `/cheat-predict scripts/2026-07-12_..md`)会把整条路径/命令原文渲成标题(用户实测坑:
// 选题对话名居然是文件路径,零提炼)。这里止血:检测命令/路径模式则取文件名(basename)或落
// 「新对话」占位,普通消息仍取前 24 字。
//   注:这是**会话标题**(ai_conversations.title),非 candidate.title。据首轮 assistant 回复
//   按主题**回填**真实标题需新增 conversations.rename 契约 op(跨 ai 模块),成本高 → 留后续
//   (审计报告 T-267② 已注:先做净化 + 占位)。导出供单测。
export function deriveConversationTitle(userText: string): string {
  const raw = userText.trim();
  if (!raw) return "新对话";

  const firstToken = raw.split(/\s+/)[0] ?? "";
  // 首 token 是斜杠命令(/cheat-predict)或裸路径(scripts/x.md、/Users/…、./a、~/b)——
  // 这类首条消息是「操作指令 / 文件路径」而非主题,当标题会渲成路径(用户实测坑)。
  const startsWithCommand = /^\/[a-zA-Z][\w-]*$/.test(firstToken);
  const startsWithPath =
    /^(~\/|\.\/|\/)/.test(firstToken) || // 绝对 / 家目录 / 相对路径前缀
    /^[\w.-]+\/[\w./-]+$/.test(firstToken); // scripts/xxx.md 这类含斜杠的相对路径 token

  if (startsWithCommand || startsWithPath) {
    // 抓消息里第一个「像文件路径」的 token(含分隔符 + 带扩展名),取 basename 作标题;
    // 没有可辨识文件名 → 「新对话」占位(绝不用路径 / 命令原文当标题)。
    const pathToken = raw
      .split(/\s+/)
      .find((t) => /[/\\]/.test(t) && /\.[a-zA-Z0-9]+$/.test(t));
    const base = pathToken
      ? (pathToken.split(/[/\\]/).filter(Boolean).pop() ?? "")
      : "";
    return base ? base.slice(0, 24) : "新对话";
  }

  return raw.slice(0, 24);
}

// scope 文法校验(宽松:三段式前缀;非法声明视为未声明,回落推导)。
function isValidScope(v: unknown): v is string {
  if (typeof v !== "string" || v.length === 0) return false;
  if (v === "global") return true;
  if (v.startsWith("project:") && v.length > "project:".length) return true;
  if (v.startsWith("surface:") && v.length > "surface:".length) return true;
  return false;
}

// 从 UIMessage 里抽纯文本(useChat v7 的消息是 parts 数组)。只取 text part 拼起来 —— 落库
// ai_messages.content 是纯文本;工具调用/结果不进 content(它们随流回前端渲卡)。
function textOf(message: UIMessage | undefined): string {
  if (!message) return "";
  const parts = (message as { parts?: Array<{ type: string; text?: string }> })
    .parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("")
    .trim();
}

export async function POST(req: Request): Promise<Response> {
  // [RT-H01] 有副作用的对话入口(落库 + dispatch 工具任务):先挡非本机/跨站请求。
  if (!isTrustedLocalRequest(req)) return loopbackForbidden();

  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // 鉴权:同 dispatch —— [T-046 单机免登录] 有 cookie 验 token,无/失效 cookie 以本机
  // 主用户直通;401 仅剩「库中无任何用户」的异常态兜底。
  const rawToken = readSessionCookie(req);
  // [T-220 → T-332 S3] x-account-id header = 前端当前选中的抖音号(与 dispatch route 同源,
  //   http-transport 从 localStorage 注入)。**绝不信任**:resolveRequestContext 内部以真实
  //   userId 查号验属主 + active;验不过(不存在/不属主/已归档)→ 抛 OwnershipError → 下方转
  //   404 拒绝(不再降级 null,SPEC §4.3)。带号后 chat 工具产的 asset(material.screenshot / cover 回填等经此 ctx)
  //   才 stamp 当前号 → 修「截图 asset account_id=NULL → 读侧 accountGate 严格 eq 排除 → blob
  //   取回 404 → 前端紫色占位」的写侧根因(此前 chat route 漏读 header → 全程无号)。
  const accountId = req.headers.get("x-account-id");
  let ctx: RequestContext;
  try {
    // 对话恒为状态变更类(落库 + 触发工具任务)→ present-but-invalid cookie 明确拒(401),不静默降级主用户。
    ctx = await resolveRequestContext(rawToken, accountId, {
      rejectInvalidToken: true,
    });
  } catch (err) {
    // 结构化识别鉴权错误(跨 bundle instanceof 不可靠)。
    if (isAuthError(err)) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "unauthorized" },
        { status: 401 },
      );
    }
    // [T-332 S3] 无效 x-account-id(不存在/不属主/已归档)→ 404 拒绝(同 dispatch 语义)。
    if (isOwnershipError(err)) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "not found" },
        { status: 404 },
      );
    }
    throw err;
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  // surface 必填(页面层注入);缺省回落 topics(当前唯一落地的 ChatBox skill)—— 路由不因
  // 缺 surface 崩,resolveSkillForSurface 也会兜底。
  const chatContext: ChatContext = {
    surface:
      typeof body.chatContext?.surface === "string"
        ? body.chatContext.surface
        : "topics",
    functionKey: body.chatContext?.functionKey,
    projectId: body.chatContext?.projectId ?? null,
    selection: body.chatContext?.selection,
  };

  const runtime = await getChatRuntime();

  // 持久化(SPEC §3.3:消息落 ai_conversations/ai_messages)——
  //   会话:body.conversationId 复用;缺省 lazy 建一个(标题取首条用户消息前缀)。
  //   本轮用户消息:落 createMessage(最新一条 user)。
  //   assistant 回复:streamText.onFinish 落 appendAssistantMessage(纯文本)。
  // 持久化失败绝不阻断流式(对话优先);best-effort + 记日志。
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const userText = textOf(lastUser);

  // [T-096] 会话作用域:显式声明(前端 resolver 保证)优先;旧客户端未带时按迁移同款语义推导
  // (有 projectId → project:<id>,否则 global),保证 lazy 建的会话永远有归属。
  const rawScope = body.chatContext?.scope;
  const declaredScope = isValidScope(rawScope) ? rawScope : null;
  const scope =
    declaredScope ??
    (chatContext.projectId ? `project:${chatContext.projectId}` : "global");

  let conversationId = body.conversationId ?? "";
  // [T-239f] 是否续接既有会话(user 去重只对续接轮做:首轮新会话不可能有旧行)。
  const isExistingConversation = Boolean(conversationId);

  // [T-096] 续接校验(服务端硬门,SPEC §1.3-3):带 conversationId 且显式声明了 scope 时,
  // 核对库中会话的 scope 与声明一致。不一致 = 跨作用域续接(泄漏路径)→ 4xx 拒绝,不续写、
  // 不读回。校验在持久化/流式之前 —— 该门失败绝不算 best-effort。
  if (conversationId && declaredScope) {
    try {
      const conv = await runtime.ai.getConversation(ctx, conversationId);
      if (conv.scope !== declaredScope) {
        return NextResponse.json(
          {
            error: `conversation scope mismatch: conversation belongs to "${conv.scope}", request declared "${declaredScope}"`,
          },
          { status: 403 },
        );
      }
    } catch (err) {
      // 跨用户/未知 conversationId(OwnershipError)→ 404(不泄漏存在性,原语义)。
      if (err instanceof OwnershipError) {
        return NextResponse.json({ error: err.message }, { status: 404 });
      }
      throw err;
    }
  }

  try {
    if (!conversationId) {
      // [T-267②] 净化:斜杠命令 / 裸文件路径开头不当标题(取文件名或「新对话」占位)。
      const title = deriveConversationTitle(userText);
      const conv = await runtime.ai.createConversation(ctx, {
        title,
        projectId: chatContext.projectId ?? null,
        // [T-096] lazy 建会话落作用域 —— 会话从出生起就有归属桶。
        scope,
      });
      conversationId = conv.id;
    }
    if (userText) {
      // [T-239f S6] user 消息幂等 —— regenerate(useChat 重发同一条 user 消息)不再写重复行:
      //   ① trigger==='regenerate-message'(DefaultChatTransport 默认 body 自带,d.ts 核实)
      //     = 明确的重发信号 → 直接跳过 insert;
      //   ② 兜底(老客户端/手工请求无 trigger):续接会话时查库中最后一条消息 —— 若它就是
      //     同内容的 user 行(上一轮流失败/中断,assistant 未落库),说明这条 user 已在库里,
      //     不重插。查失败(best-effort)→ 照常 insert(宁多勿丢)。
      let skipInsert = body.trigger === "regenerate-message";
      if (!skipInsert && isExistingConversation) {
        try {
          const history = await runtime.ai.listMessages(ctx, conversationId);
          const last = history[history.length - 1];
          if (last && last.role === "user" && last.content === userText) {
            skipInsert = true;
          }
        } catch {
          skipInsert = false; // 去重是增强;读历史失败绝不阻断本轮落库
        }
      }
      if (!skipInsert) {
        await runtime.ai.createMessage(ctx, conversationId, {
          content: userText,
        });
      }
    }
  } catch (err) {
    console.error("[api/chat] persist user turn failed:", err);
  }

  // [T-239e] 本轮 token 用量(runChatStream 每步累计回报,finish 以 totalUsage 权威值覆盖)。
  // route 只持最新值;toUIMessageStreamResponse onFinish 落库时随 assistant 消息带上 ——
  // 中断轮已完成步的用量也已回报过,照落。null = 本轮没拿到任何 usage(落库 NULL,不填 0)。
  let turnUsage: {
    inputTokens: number | null;
    outputTokens: number | null;
    cachedTokens: number | null;
    modelKey: string;
  } | null = null;

  try {
    const result = await runChatStream(
      ctx,
      // [T-239c] req.signal 贯通:用户点「停止」/关页 → streamText abort(服务端 1s 内停,
      // 不再空跑后续工具烧钱);signal 同时经工具 execute 第二参透传给长工具提前退出。
      {
        messages,
        chatContext,
        abortSignal: req.signal,
        // [T-239e] 用量回报口:持最新累计值(闭包变量,onFinish 落库时读)。
        onUsage: (u) => {
          turnUsage = u;
        },
      },
      {
        // 展开 runtime.context 里所有已绑定的 CreativeContext reader(positioning / learnings /
        // signals / knowledge / accounts / reviewSubject …)。原来手列 4 个,漏了 reviewSubject
        // (T-039a 复盘对象)与 accounts(T-039b 账号画像)—— 装配点 assembleCreativeContext 拿不到
        // 就跳过对应 facet。改为整体展开:composition root 绑什么,装配层就能读什么,不再逐个漏接。
        ...runtime.context,
        // [T-163] 错误→人话端口:chat-tools 下沉 backend 后不再直 import 前端 ai-error-humanize
        // (它含 ArtifactType 依赖),改由这里(前端边界)把 humanizeAiError 注入。
        humanizeError: humanizeAiError,
        resolveModelSpec: runtime.resolveModelSpec,
        // [T-239b] 备用对话模型端口 —— 主模型流开始前可重试错误耗尽时,恢复层用它接管一次
        // (只认 chat.fallback 专配行,用户没配 = 现状报错)。
        resolveFallbackModelSpec: runtime.resolveFallbackModelSpec,
        // 只读 context 工具(context.projects/knowledge/materials)的真数据读端口(user-scoped)。
        contextReaders: runtime.contextReaders,
        // [T-084a] 联网检索端口 —— gatherMaterials 先真搜索、honestyBlock 探测未配诚实降级。
        probeSearchConfigured: runtime.probeSearchConfigured,
        searchWeb: runtime.searchWeb,
        // [T-084b] material.screenshot 端口 —— 真无头浏览器截公开页 → 落 asset(带 sourceUrl)。
        captureScreenshotPort: runtime.captureScreenshot,
        // [T-217c] web.read 端口 —— 带 .auth/web 登录态读正文全文 → 落逐字稿素材(pending 确认门);
        //   无会话/过期返 { needLogin, domain } 供编导引导去保管库登录。
        readWebUrlPort: runtime.readWebUrl,
        // [T-386] 后台任务状态真值端口 —— 每轮注入近期任务库内真实状态,治凭记忆断言任务状态。
        listRecentTasksPort: runtime.listRecentTasks,
        // [T-253] local.read 端口 —— 本机文件读取(运行时逐次授权 + 敏感 denylist 硬门)。
        readLocalFilePort: runtime.readLocalFile,
        // [T-263] local.read 授权判定端口(HITL 门)—— 判定与执行拆开,未授权 → SDK 挂起弹确认卡。
        decideLocalReadAccessPort: runtime.decideLocalReadAccess,
        // [T-256a] local.tools 端口 —— 环境工具探测(白名单 which/--version,只读不执行任意命令)。
        detectToolsPort: runtime.detectTools,
        // [T-256a] local.workspace 端口 —— 列已授权本地目录(复用 T-253 授权表)。
        listAuthorizedDirsPort: runtime.listAuthorizedDirs,
        // [T-084c] material.generate 端口 —— dispatch 既有 asset.generate task(立即返回 taskId)。
        dispatchGenerateAssetPort: runtime.dispatchGenerateAsset,
        // [T-271] cover.generate 端口 —— dispatch 制作封面链(结构化封面方案 + 文案诚实门 + 生图)。
        dispatchGenerateCoverPort: runtime.dispatchGenerateCover,
        // [T-103b] review.script 端口 —— dispatch 既有 script.review 审核链路(L1 lint + L2 语义审)。
        dispatchScriptReviewPort: runtime.dispatchScriptReview,
        // [T-265] planning.thesis 端口 —— ensure thesis_tree artifact + dispatch 论点树生成(采纳落面板)。
        dispatchPlanningThesisPort: runtime.dispatchPlanningThesis,
        // [T-268] script.draft 端口 —— ensure output_script artifact + dispatch 异步整稿(采纳写稿面)。
        dispatchScriptDraftPort: runtime.dispatchScriptDraft,
        // [T-350a] publish.package 端口 —— 空稿门 + ensure outputId + dispatch 单平台抖音发布物料(采纳物化 Publication)。
        dispatchPublishPackagePort: runtime.dispatchPublishPackage,
        // [T-385] project.transcribe 端口 —— 复用 T-374 projects.transcribe 链,对话内一键抓单条逐字稿。
        dispatchProjectTranscribePort: runtime.dispatchProjectTranscribe,
      },
    );
    // 流式回前端(useChat 消费 UIMessage stream);回带 conversationId 头供客户端复用会话。
    // [T-094] onError:流中错误(如 MiniMax 内容安全审核拦截整轮输入 new_sensitive/1026)
    // 转人话再进 error part —— 不用 SDK 默认掩码("An error occurred"),也不裸吐机器码;
    // 人话规则未命中时回落原始 message(诚实)。前端错误气泡直接渲这段文案。
    return result.toUIMessageStreamResponse({
      headers: { "x-conversation-id": conversationId },
      // [T-239c] 关键:客户端 abort/断开后没人消费 SSE 流 → onFinish 不会触发、部分产出落不了库。
      // consumeSseStream 让服务端自己把流消费完(SDK 官方中断持久化形态),onFinish 才能在中断轮
      // 也拿到 isAborted + 已组装的部分 responseMessage。
      consumeSseStream: consumeStream,
      // [T-239e] 本轮 usage 以 message metadata 流回前端(SDK 官方口:finish part 携带
      // totalUsage)—— copilot 会话成本角标据此在流式中即时累加本轮,不用等重拉历史。
      messageMetadata: ({ part }) => {
        if (part.type !== "finish") return undefined;
        const u = part.totalUsage;
        if (!u) return undefined;
        return {
          usage: {
            inputTokens: u.inputTokens ?? null,
            outputTokens: u.outputTokens ?? null,
          },
        };
      },
      onError: (error) => {
        console.error("[api/chat] stream errored:", error);
        const human = humanizeAiError(error);
        if (human) return human.message;
        return error instanceof Error ? error.message : String(error);
      },
      // [T-128] assistant 回复落库带**完整 parts**(text + tool-result 卡数据)。之前 onFinish 只拿
      // finalText → 只存纯文本,tool-result 卡(候选卡/素材卡/审核报告卡)在存那刻就丢 → 刷新即消失
      // (用户实录)。这里的 responseMessage 是 SDK 组装好的这轮 assistant UIMessage,与 useChat 内存
      // 态同形,存它 → 恢复时 toUIMessages 原样回放 parts → 复用现有卡渲染分支,卡不再丢。
      // best-effort:落库失败不影响已流给前端的内容(对话优先)。
      // [T-239c] isAborted:中断轮也进这里(consumeSseStream 兜底消费)—— 已产出的部分文本 +
      // 已完成 tool parts 照落库,带 aborted 标记(modelMetadata.aborted=true,同存储不建新表),
      // 刷新后该轮仍在(不再丢半轮)。
      onFinish: async ({ responseMessage, isAborted }) => {
        if (!conversationId) return;
        const rawParts = (responseMessage as { parts?: unknown[] } | undefined)
          ?.parts;
        const rawPartsArr = Array.isArray(rawParts) ? rawParts : [];
        // [T-263] HITL 授权门:local.read 未授权时本回合**挂起**(approval-requested),onFinish 也会
        // 携该「未决态」tool part。**不落库未决/已回执但未出结果的 tool part**(state ∈
        // {approval-requested, approval-responded})—— 否则 reload 会回放一张点不动的旧授权卡(该调用
        // 的真实结果落在续跑那一轮:output-available/output-denied,由那轮独立落库)。其余 part 照落。
        const parts = rawPartsArr.filter((p) => {
          const rec = p as { type?: unknown; state?: unknown };
          if (
            typeof rec.type === "string" &&
            rec.type.startsWith("tool-") &&
            (rec.state === "approval-requested" ||
              rec.state === "approval-responded")
          ) {
            return false;
          }
          return true;
        });
        const text = textOf(responseMessage as UIMessage | undefined);
        // 有文本 或 有可渲染的 tool-result 部件才落库(纯空轮不留空气泡);tool part 的 type 形如
        // `tool-<name>`(AI SDK v5 ToolUIPart),据此判定「这轮产出了卡」。中断轮同判:开头即停
        // (毫无产出)不留空气泡,产出过半的落库保住。
        const hasRenderable =
          text.length > 0 ||
          parts.some(
            (p) =>
              typeof (p as { type?: unknown }).type === "string" &&
              (p as { type: string }).type.startsWith("tool-"),
          );
        if (!hasRenderable) {
          // [T-464] 空回复兜底 —— 2026-07-22 codex.hiyo.top 代理返回 200 + 空 SSE 流实证:
          //   AI SDK onFinish 正常触发(视作"成功"),但 responseMessage 无 text 也无 tool part。
          //   原行为:直接 return 不落库 → 用户看到"发了消息 → UI 完全无反应"(空白),分不清是
          //   卡了/挂了/代理坏了 → 疑惑无解。改为落一条**信封提示** assistant 消息,让用户明确
          //   "AI 未返回内容" + 建议(换模型/换 key),自诊断快。非中断轮才落(中断=用户主动停,
          //   本就该空;只在真实"完成但空"时提示)。best-effort,不影响响应流。
          if (!isAborted && conversationId) {
            const hint =
              "AI 未返回任何内容。可能的原因:①API 代理返回空流(如自建/第三方 endpoint 异常)②模型名无效(代理转发失败)③密钥被限流。建议:设置 → 模型配置 → 换一个模型或换 API 密钥,再重试。";
            try {
              await runtime.ai.appendAssistantMessage(
                ctx,
                conversationId,
                hint,
                [],
              );
            } catch (err) {
              console.error("[api/chat] persist empty-reply hint failed:", err);
            }
          }
          return;
        }
        try {
          // [T-239e] usage 随 assistant 消息落库(有才带,没拿到 → 不带 = 列 NULL,诚实缺省);
          // 中断轮(aborted)已完成步的用量照带。opts 全空时保持 4 参调用(既有语义/测试锚定)。
          const opts: {
            aborted?: boolean;
            usage?: {
              inputTokens: number | null;
              outputTokens: number | null;
              cachedTokens: number | null;
            };
            modelKey?: string;
          } = {};
          if (isAborted) opts.aborted = true;
          if (turnUsage) {
            opts.usage = {
              inputTokens: turnUsage.inputTokens,
              outputTokens: turnUsage.outputTokens,
              cachedTokens: turnUsage.cachedTokens,
            };
            opts.modelKey = turnUsage.modelKey;
          }
          if (Object.keys(opts).length > 0) {
            await runtime.ai.appendAssistantMessage(
              ctx,
              conversationId,
              text,
              parts,
              opts,
            );
          } else {
            await runtime.ai.appendAssistantMessage(
              ctx,
              conversationId,
              text,
              parts,
            );
          }
        } catch (err) {
          console.error("[api/chat] persist assistant reply failed:", err);
        }
      },
    });
  } catch (err) {
    if (err instanceof OwnershipError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    // 没配 model key(LlmCredentialError)等装配期错误 → 诚实 4xx(不假绿、不静默)。
    // [T-094] 平台类错误(内容审核/限流/配额)先过人话映射,用户拿到能行动的说明。
    const message =
      humanizeAiError(err)?.message ??
      (err instanceof Error ? err.message : String(err));
    console.error("[api/chat] stream failed:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
