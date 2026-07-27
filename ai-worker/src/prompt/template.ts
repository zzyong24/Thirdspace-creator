/**
 * 提示词模板系统(脊柱-1 → 三位一体,SPEC §4.1)—— prompt 不再内联在 runner 代码里。
 *
 * **Skill = 提示词模板 ⊕ 工具集 ⊕ 输出 Zod schema**(三位一体)。一份 PromptTemplate 即一份可
 * 版本化的 skill:它现在同时承载「跟谁说话(system/template)」「能调哪些工具(tools 白名单)」
 * 「每轮必须吐什么形状(outputSchema 输出契约)」三件事。
 *
 * 最终 prompt = 模板(skill) ⊕ 上下文注入(facets) ⊕ 绑定。
 *   - 模板:纯数据(system + 含 {{facet}} 占位的 template 串 + 元数据 + 工具白名单 + 输出契约),
 *     不含代码逻辑,因此可外置(文件/DB)、可版本化、未来可由服务端推送到客户端覆盖
 *     (见 registry overrideTemplates / overrideTemplatesFromConfig)。
 *   - facets:由上层 creative-context 装配(定位/风格/knowledge/横竖屏/评论…)。
 *   - 绑定:bindPrompt(模板, facets) → 最终 {system, prompt}。缺必需 facet 直接报错,绝不静默拼空。
 *
 * 换写作方法论 = 换模板,不改 runner 代码;A/B 测提示词、服务端热推 skill 都靠这一层解耦。
 */

import type { z } from "zod";
import type {
  CompletionPolicyAdapterRef,
  CompletionPolicyV1,
  EditableSkillField,
} from "./effective-skill-types";

/**
 * 一个 AI 能力的提示词模板(= 一份可版本化的 skill,三位一体)。纯数据,可被外部源覆盖。
 *
 * `tools` / `outputSchema` 为新增的两位(SPEC §4.1):前者是该 skill 在 ChatBox 里允许调的工具
 * 白名单(按 ChatContext 注入),后者是每轮输出契约(generateObject/streamObject 绑它,Vercel SDK
 * 校验失败自动重试,防发散)。两者可空 —— 纯生成节点(无工具/留自由文本 parse)不必带。
 */
export interface PromptTemplate {
  /** 能力 id,如 "topic.generate" / "script.draft"。 */
  id: string;
  /** 版本,如 "v1"。同 id 多版本便于灰度/回滚。 */
  version: string;
  /** 系统提示(角色 + 方法论 = skill 本体)。 */
  system: string;
  /** 用户提示模板,含 `{{facetName}}` 占位。 */
  template: string;
  /** 必需注入的 facet 名;缺(undefined/空串)即 bindPrompt 报错,不静默拼空。 */
  requiredFacets: readonly string[];
  /**
   * [T-184] 声明式 context 注入 —— 本模板需要装配层注入哪些 **context 源 reader**(key = 组合根
   * ContextDeps 的 facet-reader 字段名,如 "positioning"/"learnings"/"knowledge"/"thesis"/
   * "contract"/"outline"/"artifactOrigin"/"projectMaterials"/"brief"…)。装配层(组合根
   * persistence-client 的 resolveContextDeps)按此声明**自动**从中央 reader registry 取 reader 组
   * deps,取代每个 runXxx dispatch **手列 deps**——手列漏一个 reader = 对应 facet 恒空(T-182
   * CLAIM-1 script.draft 漏 knowledge 的根因)。此声明就是那份「要哪些 context 源」的单一真值。
   *
   * 与 `requiredFacets` 区别:requiredFacets 是 bindPrompt 阶段对**已装配好的 facet 串**做非空校验的
   * facet 名;contextRequirements 是**更上游**——它决定装配层去装哪些 reader(reader 产出才是 facet)。
   * 二者互补:声明装哪些源(本字段) → reader 产 facet → bindPrompt 按 requiredFacets 校验非空。
   *
   * 可选:未声明的模板(undefined)= 装配层不按声明注入(保持各自现有手列),互不影响。
   *
   * future(本切片不做,仅留位):后续可从「静态 key 列表」升成带**权重/渐进式多轮/先问用户**的
   * 结构(如 `{ key, weight?, stage?, askUser? }[]`),支撑按预算裁剪 context、多轮渐进注入。当前只做
   * 「声明 → 静态注入 reader」最小骨架。
   */
  contextRequirements?: readonly string[];
  /**
   * 该 skill 在 ChatBox 里允许调用的工具白名单(工具 id,如 "topic.generate")。按 ChatContext
   * 的页面层/按钮层注入(SPEC §3.2/§4.1)。可空 = 该 skill 不挂工具(纯结构化生成)。
   * 配置口子:override 通道可整组替换(后台改白名单不改代码)。
   */
  tools?: readonly string[];
  /**
   * 每轮输出契约(SPEC §4.2 防发散脊梁)。runStructuredNode 用 generateObject 绑它校验 + 不符
   * 自动重试。形状至少两段 `{ reply, ...skill 特定结构 }`(candidates[]/scores[]/nextActions[])。
   * 可空 = 该模板走自由文本节点(templated-node,parse 留调用方),不受 schema 约束。
   * 配置口子:override 通道接受 JSON Schema 形式下发,运行时转回校验器套用(SPEC §4.3)。
   */
  outputSchema?: z.ZodType;
  /** T-513 official base metadata：合法的 required/optional facet allowlist。 */
  availableFacets?: readonly string[];
  /** T-513：账号增量允许编辑的字段；未声明时 official provider 使用六字段默认集。 */
  editableFields?: readonly EditableSkillField[];
  /** T-513 策略载体；具体 script.draft 默认值由 T-512 提供。 */
  completionPolicy?: CompletionPolicyV1 | null;
  /** official-only append-only adapter 引用，账号 overlay 不得覆盖。 */
  completionPolicyAdapter?: CompletionPolicyAdapterRef | null;
}

/** 绑定后的最终提示词。 */
export interface BoundPrompt {
  system: string;
  prompt: string;
}

/** 缺必需 facet 时抛出 —— 让调用方明确"上下文没装配齐",而不是喂半截 prompt 给模型。 */
export class PromptBindError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptBindError";
  }
}

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * 把模板与注入的 facets 绑定成最终 prompt。
 * - 必需 facet 缺失/空 → 抛 PromptBindError(数据要真:宁可报错也不喂空上下文)。
 * - 模板里的 `{{x}}` 用 facets[x] 替换;非必需且未提供的占位替换为空串。
 */
export function bindPrompt(
  tpl: PromptTemplate,
  facets: Readonly<Record<string, string | undefined>>,
): BoundPrompt {
  for (const name of tpl.requiredFacets) {
    const v = facets[name];
    if (v === undefined || v === null || v === "") {
      throw new PromptBindError(
        `prompt "${tpl.id}@${tpl.version}" 缺必需 facet: ${name}`,
      );
    }
  }
  const prompt = tpl.template.replace(PLACEHOLDER, (_m, key: string) => {
    const v = facets[key];
    return v === undefined || v === null ? "" : String(v);
  });
  return { system: tpl.system, prompt };
}
