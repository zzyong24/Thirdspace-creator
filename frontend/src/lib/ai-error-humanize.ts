// [T-094] AI 链路错误 → 人话的共享映射(单一真值)。
//
// 背景(实录):倾倒场蒸馏报 `Failed after 3 attempts. AI_APICallError: input new_sensitive (1026)`
// —— MiniMax 平台内容安全审核拦截了**输入原文**,SDK 重试 3 次全拦,用户看到一串机器码,完全
// 不知道发生了什么、该干什么。本表把这类「模型方平台错误码」翻译成用户能行动的人话。
//
// 落点与消费方(与 lib/chat-tool-labels 同款:纯常量/纯函数,无 "use client" / "server-only",
// 前后端都可安全 import):
//   - server:/api/knowledge/distill 路由(旧蒸馏管线)、/api/chat 的 onError、
//     chat-tools 的 knowledge.distill 工具 execute(错误随工具结果卡渲染);
//   - client:Copilot 对话错误气泡 / 蒸馏确认门卡的错误态。
//
// 原则:只翻译**能识别的**错误(规则不命中返回 null,调用方回落原始 message —— 诚实,
// 不把未知错误包装成似是而非的人话)。规则表可扩展,其他 AI 链路直接复用。

import {redactProviderErrorDetail} from "@creatoros/contract/provider-error-detail";
import type { ArtifactType } from "@/types/domain";

/** 稳定错误分类：渲染层可依赖 code 决定动作，不必反向解析人话文案。 */
export type AiErrorCode =
  | "result_unconfirmed"
  | "model_response_interrupted"
  | "model_not_configured"
  | "positioning_required"
  | "model_not_found"
  | "image_input_unsupported"
  | "provider_invalid"
  | "provider_auth"
  | "content_safety_input"
  | "content_safety_output"
  | "rate_limited"
  | "quota_exhausted";

/** 翻译结果:人话 message + 是否建议「去设置换模型」(渲染层据此挂设置深链)。 */
export interface HumanAiError {
  /** 机器稳定分类；message 可改文案，消费方不应据文案猜错误类型。 */
  code: AiErrorCode;
  /** 给人看的错误说明(含建议动作)。 */
  message: string;
  /** true = 建议用户换模型(渲染层附「去设置」链接;不做自动切换 —— 确认门原则)。 */
  suggestSwitchModel: boolean;
  /** true = 受管平台额度不足，渲染层应打开安全的 Growth 用户额度入口。 */
  suggestOpenCredits?: boolean;
  /** true = 当前账号定位未完成，渲染层应直达定位中心。 */
  suggestOpenPositioning?: boolean;
}

interface AiErrorRule {
  /** 命中原始错误串的特征(错误码/关键词;对 message 全文做不区分大小写匹配)。 */
  pattern: RegExp;
  human: HumanAiError;
}

/**
 * 错误码 → 人话规则表(按序匹配,先命中先用)。
 * MiniMax 平台码参考:1026=输入敏感,1027=输出敏感,1008=余额不足,1002/1039=限流。
 */
export const AI_ERROR_HUMAN_RULES: readonly AiErrorRule[] = [
  {
    // 仅可信的未启动调用取得拒绝结算回执后产生，不推断其它RPC错误的执行阶段。
    pattern: /\bCODEX_SESSION_PRECHECK_REJECTED\b/,
    human: {
      code: "model_not_configured",
      message: "本地 Codex 会话预检查未通过，本轮尚未开始。请检查本地 Codex 的登录与配置后再试。",
      suggestSwitchModel: true,
    },
  },
  {
    pattern: /\bCHAT_MODEL_RESPONSE_INTERRUPTED\b/,
    human: {
      code: "model_response_interrupted",
      message: "模型回复中断，输入和已完成内容已保留，系统正在沿原任务自动恢复。",
      suggestSwitchModel: false,
    },
  },
  {
    // SEMANTIC_BOUNDARY_ALLOW: 翻译服务端由 unknown_result 产生的稳定码；旧文本仅兼容已打开的旧连接。
    pattern: /\bCHAT_RESULT_UNCONFIRMED\b|本次执行结果尚未确认，请在任务中心核对原任务，避免重复操作。/,
    human: {
      code: "result_unconfirmed",
      message: "外部操作未返回确认结果，本轮对话已停止。已完成内容已保留，为避免重复执行，暂不重新提交该操作。",
      suggestSwitchModel: false,
    },
  },
  {
    // 受管平台额度状态必须先于通用模型方余额规则，不能误导用户去改模型配置。
    pattern:
      /\bAI_CREDIT_(?:EXHAUSTED|INSUFFICIENT)\b|ManagedAiCreditExhaustedError|AI\s*额度不足|平台\s*(?:AI\s*)?(?:额度|积分)不足/i,
    human: {
      code: "quota_exhausted",
      message: "AI 额度不足，请充值后再试。",
      suggestSwitchModel: false,
      suggestOpenCredits: true,
    },
  },
  {
    // 本地/用户自配版本尚未完成文本模型设置。规则放在 provider 鉴权前，确保
    // “尚未配置 API Key”被理解成缺设置，而不是把内部凭据名直接扔给用户。
    pattern:
      /\bMODEL_(?:NOT_)?CONFIGURED\b|LlmCredentialError|无可用\s*(?:LLM|AI)?\s*凭据|还没有可用的\s*AI\s*模型|尚未配置[\s\S]{0,24}(?:API\s*Key|模型|密钥)|(?:模型|AI)[\s\S]{0,16}(?:未配置|没有配置)/i,
    human: {
      code: "model_not_configured",
      message: "还没有可用的 AI 模型。完成设置后，回到这里即可继续。",
      suggestSwitchModel: true,
    },
  },
  {
    // 目前内容雷达选题任务会稳定落 POSITIONING_MISSING；对话若收到同一人话也走这里。
    pattern:
      /\bPOSITIONING_MISSING\b|当前账号(?:缺少|还没有)可用定位|(?:请先|需要先|先)[\s\S]{0,16}(?:完成|保存|生成)[\s\S]{0,10}定位/i,
    human: {
      code: "positioning_required",
      message: "当前账号还没有可用定位。先生成并保存一版定位，再回来继续。",
      suggestSwitchModel: false,
      suggestOpenPositioning: true,
    },
  },
  {
    // 不同代理/SDK 对视觉能力不足的错误措辞并不统一；只有同时出现 image/vision
    // 与 unsupported/not support 才命中，避免把普通图片内容错误误报成模型能力问题。
    pattern:
      /(?:image|vision)[\s\S]{0,100}(?:not[\s_-]+support(?:ed)?|unsupported|not[\s_-]+allowed)|(?:not[\s_-]+support(?:ed)?|unsupported)[\s\S]{0,100}(?:image|vision)/i,
    human: {
      code: "image_input_unsupported",
      message: "当前模型不支持识别图片，请切换支持图片的模型，或改用文字描述。",
      suggestSwitchModel: true,
    },
  },
  {
    // DeepSeek/OpenAI 等模型名无效：必须先于通用 404/not-found 分类。
    pattern:
      /\bmodel_not_found\b|\binvalid_model\b|\bunknown_model\b|\b(?:invalid|unknown)[\s_-]+model\b|\bmodel(?:[\s_-]*name)?\b[\s\S]{0,100}?\b(?:not[\s_-]*(?:found|exist(?:s)?)|does[\s_-]+not[\s_-]+exist|invalid|unknown)\b/i,
    human: {
      code: "model_not_found",
      message: "当前 AI 设置不可用，请检查模型配置后再试。",
      suggestSwitchModel: true,
    },
  },
  {
    // provider 配置不存在/不受支持；与具体 model 名错误分开，方便设置页定位。
    pattern:
      /\b(?:invalid|unknown|unsupported)[\s_-]+provider\b|\b(?:invalid|unknown|unsupported)_provider\b|\bprovider(?:[\s_-]*name)?\b[\s\S]{0,80}?\b(?:not[\s_-]*found|does[\s_-]+not[\s_-]+exist|unknown|unsupported|unavailable)\b/i,
    human: {
      code: "provider_invalid",
      message: "当前 AI 设置不可用，请检查模型配置后再试。",
      suggestSwitchModel: true,
    },
  },
  {
    // 模型服务商鉴权失败；不匹配裸 401/403，避免把 CreatorOS 登录失效误报成 API Key。
    pattern:
      /\binvalid_api_key\b|\bauthentication_error\b|\bincorrect[\s_-]+api[\s_-]+key\b|\bapi[\s_-]+key\b[\s\S]{0,60}?\b(?:invalid|incorrect|expired|revoked)\b|\b(?:invalid|expired|revoked)\b[\s\S]{0,40}?\bapi[\s_-]+key\b/i,
    human: {
      code: "provider_auth",
      message: "当前 AI 设置需要检查。完成设置后再试即可。",
      suggestSwitchModel: true,
    },
  },
  {
    // 输入被内容安全审核拦截(实录主案例):new_sensitive / 1026。
    pattern: /new_sensitive|input[\s_-]*sensitive|\(1026\)|\b1026\b/i,
    human: {
      code: "content_safety_input",
      message:
        "这段内容暂时无法生成。可以调整措辞后重试，或在设置中更换模型。",
      suggestSwitchModel: true,
    },
  },
  {
    // 输出被内容安全审核拦截:1027 / output sensitive。
    pattern: /output[\s_-]*sensitive|\(1027\)|\b1027\b/i,
    human: {
      code: "content_safety_output",
      message:
        "这次生成的内容未能返回。可以调整要求后重试，或在设置中更换模型。",
      suggestSwitchModel: true,
    },
  },
  {
    // 模型方限流:1002/1039 / rate_limit；裸 HTTP 429 交给通用规则，不能猜来源。
    pattern: /rate[\s_-]*limit|\(1002\)|\(1039\)/i,
    human: {
      code: "rate_limited",
      message: "请求有些频繁，请稍等片刻再试。",
      suggestSwitchModel: false,
    },
  },
  {
    // 余额/配额不足:1008 / insufficient balance|quota。
    pattern: /insufficient[\s_-]*(balance|quota)|\(1008\)|\b1008\b/i,
    human: {
      code: "quota_exhausted",
      message: "当前 AI 服务余额不足。请检查模型设置或补充余额后再试。",
      suggestSwitchModel: true,
    },
  },
] as const;

/**
 * 原始错误串 → 人话(命中规则表)。不命中返回 null —— 调用方回落原串,不装懂。
 */
export function humanizeAiErrorMessage(raw: string): HumanAiError | null {
  if (!raw) return null;
  raw = raw.replace(/(?:\s*\|\s*(?:Error|AI_APICallError))+$/g, "").trim();
  if(/^上次请求被模型服务拒绝（HTTP (400|404|422)）/.test(raw))return {code:"provider_invalid",message:raw,suggestSwitchModel:true};
  // SSE 已翻译成安全中文后，客户端仍须识别其分类并展示同一原因。
  if(raw.startsWith("模型服务拒绝了请求"))return {code:"provider_invalid",message:redactProviderErrorDetail(raw),suggestSwitchModel:true};
  const rejected=raw.match(/\bhttp_(400|404|422)\b\s*:?\s*([\s\S]*)/i);
  if(rejected){
    const detail=redactProviderErrorDetail(rejected[2].replace(/^(?:http_(?:400|404|422)\s*:?\s*)+/i, "")).slice(0,240);
    const missing=!detail || /^(?:执行停止，等待恢复或诊断|模型服务拒绝了请求|Error)$/.test(detail);
    return {code:"provider_invalid",message:missing
      ? `上次请求被模型服务拒绝（HTTP ${rejected[1]}），但当时未记录具体原因；请点重试重新发送。`
      : `模型服务拒绝了请求：${detail}，请检查模型名称、接口格式和工具参数。`,suggestSwitchModel:true};
  }
  for (const rule of AI_ERROR_HUMAN_RULES) {
    if (rule.pattern.test(raw)) return rule.human;
  }
  return null;
}

/** Error/unknown → 人话(取 message 走规则表)。不命中返回 null。 */
export function humanizeAiError(err: unknown): HumanAiError | null {
  // Error 名称、响应正文与 cause 只辅助分类，不能拼成供应商原因展示。
  if(err instanceof Error){
    const direct=humanizeAiErrorMessage(err.message);
    if(direct)return direct;
  }
  const raw = collectErrorText(err);
  return humanizeAiErrorMessage(raw);
}

/**
 * 把 unknown 错误里所有可能藏机器码的字段拼成一个可匹配串(仅内部用于匹配,
 * **绝不**直接渲给用户)。AI SDK 的 APICallError 常把平台码藏在 cause/responseBody。
 */
function collectErrorText(err: unknown): string {
  return err instanceof Error
    ? [
        err.message,
        (err as { responseBody?: unknown }).responseBody,
        (err as { name?: unknown }).name,
        err.cause instanceof Error
          ? err.cause.message
          : typeof err.cause === "string"
            ? err.cause
            : "",
      ]
        .filter((v): v is string => typeof v === "string" && v.length > 0)
        .join(" | ")
    : String(err ?? "");
}

// ---------------------------------------------------------------------------
// [T-133] 通用面向用户错误收口 + artifactType → 中文 术语映射(单一真值)。
//
// 背景:审查发现 ~20 处前端 catch 把原始 `err.message`/技术码(ECONNREFUSED / HTTP 401 /
// stack / 后端内部串)直接渲给用户 —— 既看不懂又可能泄露实现细节。本收口层原则:
//   - 优先走 humanizeAiError(AI 类错已人话)命中即返;
//   - 否则识别常见结构化码(鉴权/网络/404/限流)映射人话;
//   - 再否则返 fallback(默认「操作失败,请重试。」)—— **绝不**把裸 err.message 渲给用户;
//   - **仅 dev**(NODE_ENV!=='production')把安全摘要去重后打 console.warn 便于排查(prod 静默)。
// 与 ai-error-humanize 同库(纯常量/纯函数,前后端可 import),扩展而非另起炉灶。

/** 结构化(非 AI 平台码)错误 → 人话规则:按序匹配,先命中先用。 */
const STRUCTURED_ERROR_RULES: readonly {
  pattern: RegExp;
  message: string;
}[] = [
  {
    // 鉴权失败:401 / 403 / Unauthorized / Forbidden。
    pattern: /\b401\b|\b403\b|unauthorized|forbidden|not[\s_-]*authenticated/i,
    message: "登录状态已失效或没有权限,请重新登录后再试。",
  },
  {
    // 资源不存在：保留明确 404 与领域资源 not-found，但排除 AI API/model/provider 上下文。
    // 后者信息不足时宁可走调用方 fallback，也不能谎称“内容被删除”。
    pattern:
      /^(?![\s\S]*(?:AI_APICallError|api[\s_-]*(?:endpoint|route)|\/v\d+\/|\/chat\/completions|\bmodel\b|\bprovider\b))[\s\S]*(?:\b404\b|(?:resource|record|item|project|asset|artifact|content)[\s_-]*(?:was[\s_-]*)?not[\s_-]*found)/i,
    message: "要操作的内容已不存在,可能已被移除或删除。",
  },
  {
    // 限流:429 / rate limit / too many requests。
    pattern: /\b429\b|rate[\s_-]*limit|too many requests/i,
    message: "操作太频繁了,请稍等片刻再试。",
  },
  {
    // 网络/连接类:fetch 失败 / 连接被拒 / 超时 / 断网。
    pattern:
      /failed to fetch|networkerror|network request failed|econnrefused|etimedout|timeout|err_network|load failed/i,
    message: "网络连接不稳定,请检查网络后重试。",
  },
  {
    // 服务端错误:5xx / internal server error。
    pattern: /\b5\d\d\b|internal server error|服务(器)?错误/i,
    message: "服务开小差了,请稍后重试。",
  },
];

/** 默认兜底文案(不传 fallback 时用)。 */
export const DEFAULT_USER_ERROR = "操作失败，请重试。";

/**
 * 面向用户的错误收口(唯一入口):AI 错→人话 / 结构化码→人话 / 其余→fallback。
 * **绝不**返回裸 err.message 或技术码。dev 才把安全摘要去重后打 console.warn(排查用)。
 *
 * @param err 任意 catch 到的错误。
 * @param fallback 识别不出时给用户看的人话(默认「操作失败,请重试。」)。
 */
const loggedUserErrors = new Set<string>();

export function describeUserError(
  err: unknown,
  fallback: string = DEFAULT_USER_ERROR,
): string {
  // dev 仅记录去重后的安全摘要；prod 静默。
  if (
    typeof process !== "undefined" &&
    process.env?.NODE_ENV !== "production"
  ) {
    const diagnostic=redactProviderErrorDetail(collectErrorText(err));
    if(!loggedUserErrors.has(diagnostic)){
      if(loggedUserErrors.size>=100)loggedUserErrors.delete(loggedUserErrors.values().next().value!);
      loggedUserErrors.add(diagnostic);
      // warn 保留开发诊断，不触发 Next 的 Console Error 弹层；相同错误只记录一次。
      console.warn("[describeUserError]", diagnostic);
    }
  }

  const ai = humanizeAiError(err);
  if (ai) return ai.message;

  const raw = collectErrorText(err);
  for (const rule of STRUCTURED_ERROR_RULES) {
    if (rule.pattern.test(raw)) return rule.message;
  }

  // 后端刻意抛的「已经是人话的中文短句」(如「无可用 LLM 凭据」「阶段核心交付物缺失」)
  // 予以透传 —— 它是策展过的面向用户文案,不是裸机器码。只有同时满足以下条件才算:
  // 单条 err.message(非拼接过的多字段串)+ 含中文 + 够短 + 无技术标记(ASCII 错误码 /
  // 栈帧 / URL / JSON / Error: 前缀 等)。否则一律回落 fallback,绝不裸吐。
  const single =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (isCuratedHumanMessage(single)) return single.trim();

  return fallback;
}

/** 技术噪声特征:命中任一即视为「不是策展人话」,不予透传。 */
const TECHNICAL_NOISE = /[{}[\]<>]|https?:\/\/|\bError\b|_[a-z]|[a-z]{2,}\.[a-z]{2,}|\b\d{3,}\b|\bat\s|::/i;

/** 判断是否为后端刻意抛的中文人话短句(可安全透传给用户)。 */
function isCuratedHumanMessage(msg: string): boolean {
  const s = msg.trim();
  if (!s || s.length > 40) return false; // 过长多半是拼接/堆栈,不透传。
  if (!/[一-龥]/.test(s)) return false; // 必须含中文。
  if (TECHNICAL_NOISE.test(s)) return false; // 含技术噪声即不透传。
  return true;
}

/**
 * 阶段推进(transition)错误 → 一句中文。transport 把后端错误透传成
 * `HttpTransport: 409 for projects.stage.transition: <后端 message>`(见 http-transport.ts)。
 * 后端这条 message(如「阶段核心交付物缺失」)对用户有意义 —— 抽出冒号后的真实原因原样呈现;
 * 抽不到再按状态码兜底人话。**不**把 `HttpTransport:` 技术前缀渲给用户。
 * (原 project-actions.tsx 内私有函数,T-133 抽到共享库,brief-workbench 复用同一真值。)
 */
export function describeTransitionError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const m = raw.match(/^HttpTransport: \d+ for [^:]+: ([\s\S]+)$/);
  if (m?.[1]?.trim()) return m[1].trim();
  if (raw.includes("409") || /Conflict/i.test(raw)) {
    return "当前阶段还有核心交付物未完成，无法进入下一步。";
  }
  return "进入下一步失败，请稍后重试。";
}

/**
 * 归档错误 → 一句中文(after already-archived 守卫抛 409)。
 * (原 project-actions.tsx 内私有函数,T-133 抽到共享库。)
 */
export function describeArchiveError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("409") || /Conflict|archived/i.test(raw)) {
    return "该项目已归档，无需重复归档。";
  }
  return "归档失败，请稍后重试。";
}

/**
 * artifactType(内部枚举码)→ 中文标签(单一真值)。UI 一律走它,**不渲内部类型码**。
 * 覆盖 domain.ts `ArtifactType` 全部枚举;新增枚举时在此补一行(TS Record 会强制)。
 */
export const ARTIFACT_TYPE_LABELS: Readonly<Record<ArtifactType, string>> = {
  project_idea: "项目立项",
  trend_analysis: "趋势分析",
  market_analysis: "市场分析",
  competitor_analysis: "竞品分析",
  audience_research: "受众调研",
  research_note: "调研笔记",
  content_contract: "内容合同",
  thesis_tree: "论点树",
  evidence_map: "证据图谱",
  audience_profile: "受众画像",
  differentiation: "差异化定位",
  content_outline: "内容大纲",
  master_script: "母本脚本",
  output_script: "成片脚本",
  golden_quotes: "金句集",
  script_review: "脚本审核",
  production_plan: "拍摄方案",
  shot_list: "分镜清单",
  timeline: "时间线",
  subtitle_plan: "字幕方案",
  export_config: "导出配置",
  publish_package: "发布物料",
  platform_copy: "平台文案",
  cover_copy: "封面文案",
  cover_brief: "封面简报",
  review_report: "复盘报告",
  comparison_report: "横评报告",
  optimization_plan: "优化方案",
};

/**
 * artifactType → 中文(缺省/未知诚实回落「产物」,不裸吐内部码)。
 * 接受 string 以兼容运行期从后端拿到的、类型上是宽 string 的值。
 */
export function humanizeArtifactType(type: string | null | undefined): string {
  if (!type) return "产物";
  return (
    ARTIFACT_TYPE_LABELS[type as ArtifactType] ?? "产物"
  );
}
