/**
 * 提示词模板系统(脊柱-1)—— prompt 不再内联在 runner 代码里。
 *
 * 最终 prompt = 模板(skill) ⊕ 上下文注入(facets) ⊕ 绑定。
 *   - 模板:纯数据(system + 含 {{facet}} 占位的 template 串 + 元数据),不含代码逻辑,
 *     因此可外置(文件/DB)、可版本化、未来可由服务端推送到客户端覆盖(见 registry overrideTemplates)。
 *   - facets:由上层 creative-context 装配(定位/风格/knowledge/横竖屏/评论…)。
 *   - 绑定:bindPrompt(模板, facets) → 最终 {system, prompt}。缺必需 facet 直接报错,绝不静默拼空。
 *
 * 换写作方法论 = 换模板,不改 runner 代码;A/B 测提示词、服务端热推 skill 都靠这一层解耦。
 */

/** 一个 AI 能力的提示词模板(= 一份可版本化的 skill)。纯数据,可被外部源覆盖。 */
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
