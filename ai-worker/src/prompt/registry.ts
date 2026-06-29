/**
 * 提示词模板注册表(脊柱-1)—— 集中持有所有 AI 能力的模板,可查、可版本化、可被外部源覆盖。
 *
 * 默认从内置 templates/ 注册;PROMPT-04 预留:`overrideTemplates` 让外部源(未来的服务端推送、
 * 本地文件、DB)覆盖内置模板,实现"换 skill 不改代码、服务端热推"。覆盖按 id 生效。
 */
import type { PromptTemplate } from "./template";

const REGISTRY = new Map<string, PromptTemplate>();

/** 注册(或覆盖)一个模板。后注册的同 id 覆盖先前的。 */
export function registerTemplate(tpl: PromptTemplate): void {
  REGISTRY.set(tpl.id, tpl);
}

/** 按 id 取模板;未注册即抛错(调用方应保证能力已注册)。 */
export function getTemplate(id: string): PromptTemplate {
  const tpl = REGISTRY.get(id);
  if (!tpl) {
    throw new Error(`prompt template 未注册: ${id}`);
  }
  return tpl;
}

/** 是否已注册某能力。 */
export function hasTemplate(id: string): boolean {
  return REGISTRY.has(id);
}

/**
 * 用外部源的一批模板覆盖内置(PROMPT-04 服务端推送接口的落点)。
 * 外部源 = 本地文件 / DB / 未来远端推送;按 id 覆盖,不在列表里的保持内置。
 */
export function overrideTemplates(templates: readonly PromptTemplate[]): void {
  for (const tpl of templates) REGISTRY.set(tpl.id, tpl);
}

/** 测试/重置用:清空注册表。 */
export function _resetRegistry(): void {
  REGISTRY.clear();
}
