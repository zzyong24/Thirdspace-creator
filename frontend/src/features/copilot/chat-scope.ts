/**
 * [T-096] 会话作用域(scope)解析 —— 纯函数,SPEC 2026-07-03 chat-session-scope-contract
 * §1.1/§1.2 的前端真值表。scope 与 surface 解耦:surface 只管「装配哪个 skill」(chat-context.ts
 * 现职,不动);scope 决定「历史列给谁看、恢复恢复哪条、新对话开进哪个桶」。
 *
 * scope 文法(字符串,三段式,冒号分隔):
 *   scope := "global"
 *          | "project:" <projectId>
 *          | "surface:" <name>
 *          | "surface:" <name> ":" <entityId>   // 扩展位,本期只定文法不启用(YAGNI)
 *
 * 入口 → scope 总表(SPEC §1.2,穷举;新增入口按下面的映射规则判定):
 *   #1  左下角侧栏「打开 AI 助手」      → global(深链显式带 ?scope=global)
 *   #2  首页 AI 助手条「开始对话」      → global(同上,与 #1 同桶 —— 同为无任务全局助手)
 *   #3  ⌘K 徽标                        → n/a(死入口,假徽标已摘,不接 copilot)
 *   #4  选题页一键岛(4 种出题依据)    → surface:topics
 *   #5  校准「在对话里诊断」            → surface:calibration(诊断对象经 selection 注入,不另分桶)
 *   #6  定位「生成定位提案」            → surface:positioning
 *   #7  复盘一键岛「帮我复盘」          → project:<id>(selection.kind=project 归并,与右栏同源)
 *   #8  经验「记一条经验」              → surface:experience
 *   #9  稿面右栏「编导对话」(内嵌)    → project:<id>(embed persistKey,T-055b 现状持平)
 *   #10 复盘页右栏(同一 rail)         → project:<id>(与稿面同源延续,T-068 语义)
 *   #11 选题卡「让编导帮你填」深链      → project:<id>(修裸 `project` 桶 bug,与右栏同一条对话)
 *   #12 倾倒场蒸馏(T-094 Copilot 化)  → surface:knowledge-distill(预留隔离位,T-094 即插)
 *
 * 映射规则(SPEC §1.2,判定顺序即优先级):
 *   0. URL 显式 ?scope=(文法合法)最高 —— 全局入口用它声明 global,不再借 surface 桶;
 *   1. 入口聚焦某个具体项目(selection.kind=project 或宿主是项目页)→ project:<id>;
 *   2. 入口聚焦某个工作面/功能(URL 显式带 surface)→ surface:<name>;
 *   3. 无任务的全局唤醒(裸 ?copilot=open)→ global;
 *   4. 对象级隔离 surface:<name>:<entityId> 本期无需求,只定文法。
 */

/** 全局作用域(左下角/首页全局入口)。 */
export const GLOBAL_SCOPE = "global";

/** [T-094 预留] 知识库蒸馏的隔离位 —— 蒸馏历史只在此 scope 可见,绝不混进其它入口。 */
export const KNOWLEDGE_DISTILL_SCOPE = "surface:knowledge-distill";

/** project:<id> 构造器(#7/#9/#10/#11 同源归并的唯一拼法,别处不许手拼)。 */
export function projectScope(projectId: string): string {
  return `project:${projectId}`;
}

/** surface:<name> 构造器(#4/#5/#6/#8/#12)。 */
export function surfaceScope(name: string): string {
  return `surface:${name}`;
}

/**
 * scope 文法校验(与 /api/chat 服务端 isValidScope 同语义)。非法串不进入持久化/请求,
 * 解析时回落推导 —— 深链被手工改坏也不至于把会话落进垃圾桶名。
 */
export function isValidScope(v: unknown): v is string {
  if (typeof v !== "string" || v.length === 0) return false;
  if (v === GLOBAL_SCOPE) return true;
  if (v.startsWith("project:") && v.length > "project:".length) return true;
  if (v.startsWith("surface:") && v.length > "surface:".length) return true;
  return false;
}

/** resolveChatScope 的输入 —— 面板打开时可观察到的入口参数(URL / embed props)。 */
export interface ChatScopeInput {
  /** URL 显式 ?scope=(#1/#2 全局入口带);非法/缺省走推导。 */
  scopeParam?: string | null;
  /** URL 显式 ?surface=(一键岛深链带);**不含**回落默认值 —— 裸打开时必须传 null。 */
  urlSurface?: string | null;
  /** URL 选中态 ?selKind=/?selId=(深链带)。kind=project 时归并 project:<id>(规则 1)。 */
  selKind?: string | null;
  selId?: string | null;
  /**
   * [T-055b] 内嵌模式宿主注入:persistKey(如 `project:<id>`)/ surface。内嵌优先级最高
   * (宿主明确知道自己是谁,URL 不参与)。persistKey 已是合法 scope 则直接用;否则按
   * embed surface 落 surface:<name>。
   */
  embed?: {
    surface: string;
    persistKey?: string;
    selection?: { kind: string; id: string };
  } | null;
}

/**
 * 入口参数 → scope(纯函数,§1.2 总表的可执行形式;单测穷举 12 入口)。
 */
export function resolveChatScope(input: ChatScopeInput): string {
  const { scopeParam, urlSurface, selKind, selId, embed } = input;

  // 内嵌模式(#9/#10 稿面/复盘右栏):宿主注入优先,URL 不参与。
  if (embed) {
    if (isValidScope(embed.persistKey)) return embed.persistKey;
    if (embed.selection?.kind === "project" && embed.selection.id) {
      return projectScope(embed.selection.id);
    }
    return surfaceScope(embed.surface);
  }

  // 规则 0:URL 显式 scope 声明(#1/#2 带 ?scope=global)。
  if (isValidScope(scopeParam)) return scopeParam;

  // 规则 1:聚焦具体项目(#7 复盘岛 / #11 选题卡 brief.fill 深链)→ 归并 project:<id>,
  // 与右栏同一条对话(同源是特性,T-068 语义;修 #11 裸 `project` 桶 bug)。
  if (selKind === "project" && selId) return projectScope(selId);

  // 规则 2:聚焦工作面(#4/#5/#6/#8/#12 深链显式带 surface)→ surface:<name>。
  if (urlSurface) return surfaceScope(urlSurface);

  // 规则 3:无任务全局唤醒(裸 ?copilot=open,旧深链无 scope)→ global。
  // 这是「左下角每次新建对话」根因链断点 1 的根治:全局入口不再借 topics 桶。
  return GLOBAL_SCOPE;
}

/** 历史面板的范围提示文案(中文可见文案规范)—— 诚实标注列表只覆盖当前入口,不再假装全局列表。 */
export function scopeHistoryLabel(scope: string): string {
  if (scope === GLOBAL_SCOPE) return "全局助手的历史会话";
  if (scope.startsWith("project:")) return "本项目的历史会话";
  return "本入口的历史会话";
}
