// @项目引用(T-039b)—— ChatBox 输入框 `@` 提及某项目并把它注入 chatContext 的纯逻辑层。
//
// 拆成纯函数便于单测(检测 active @query / 应用选中 / 融入 chatContext),UI(下拉 + 键盘导航)
// 在 project-mention-menu.tsx,装配在 ai-copilot-content.tsx。数据源复用现有只读 op
// `client.listProjects`(见 ai-copilot-content 的 loadProjects)—— 不新造 repo 方法。
//
// 注入机制(最简做法,SPEC/任务 ①):选中的项目**等价于「选中态项目」**——复用 T-039a 已建的
// `selection={kind:"project", id, label}` + `projectId` 机制(selKind==="project" 时
// chatContext.projectId=selId)。故 @ 选中的项目和从工作台一键岛以 kind=project 打开注入后端
// 的效果一致(后端复盘/项目 facet 能读到这条作品的真材料)。

/** 被 @ 提及的项目(注入 chatContext 用)。 */
export interface MentionedProject {
  readonly id: string;
  readonly title: string;
}

/** 项目列表下拉的一行(补全候选)。 */
export interface ProjectOption {
  readonly id: string;
  readonly title: string;
}

/**
 * active `@query` 检测 —— 给定 textarea 的**整段值**与**光标位置**,判断光标是否正处在一个
 * 「@…」提及 token 内,若是则返回该 token 的起止下标 + 已输入的查询串(不含 `@`)。
 *
 * 规则(贴合聊天输入框直觉):
 *  - 从光标往前找最近的 `@`;`@` 必须在**行首或前面是空白**(避免把 email/句中 @ 误判为提及)。
 *  - `@` 与光标之间不能含空白(一旦打空格就结束提及,查询串是连续的一段)。
 *  - 命中 → { active:true, start:@下标, end:光标下标, query:@与光标间的串 }。
 *  - 未命中 → { active:false }。
 *
 * 纯函数,不依赖 DOM(接收已从 DOM 读出的 value + caret),可单测。
 */
export type MentionQuery =
  | { active: false }
  | { active: true; start: number; end: number; query: string };

export function detectMentionQuery(value: string, caret: number): MentionQuery {
  if (caret < 0 || caret > value.length) return { active: false };
  // 从光标往前扫,找最近的 `@`;遇空白/换行则中断(提及 token 不跨空白)。
  let i = caret - 1;
  while (i >= 0) {
    const ch = value[i]!;
    if (ch === "@") {
      // `@` 前必须是行首或空白,否则不是提及(如 name@host 的 @)。
      const before = i > 0 ? value[i - 1]! : "";
      if (i === 0 || /\s/.test(before)) {
        return {
          active: true,
          start: i,
          end: caret,
          query: value.slice(i + 1, caret),
        };
      }
      return { active: false };
    }
    if (/\s/.test(ch)) return { active: false };
    i -= 1;
  }
  return { active: false };
}

/**
 * 按查询串过滤项目列表(标题模糊匹配,大小写不敏感)。空查询 → 返回全部(截断由调用方控制)。
 * 稳定:命中项保持传入顺序(listProjects 已按最近排)。
 */
export function filterProjectOptions(
  options: readonly ProjectOption[],
  query: string,
): readonly ProjectOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((o) => o.title.toLowerCase().includes(q));
}

/**
 * 应用选中的项目 —— 把 textarea 值里 [start,end) 的「@query」替换成「@项目标题 」(尾随一个空格,
 * 便于继续输入),返回新值 + 替换后光标应落的位置。纯函数(不碰 DOM),供组件 setState + setSelectionRange。
 */
export function applyProjectMention(
  value: string,
  range: { start: number; end: number },
  project: ProjectOption,
): { value: string; caret: number } {
  const chip = `@${project.title} `;
  const next = value.slice(0, range.start) + chip + value.slice(range.end);
  return { value: next, caret: range.start + chip.length };
}
