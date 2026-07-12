// [T-256b] 每任务工具白名单(SPEC §4.1)—— 复用 SURFACE_TOOL_SCOPES 思路(T-240):
// 自主任务只声明它该用的领域工具子集(调研任务给不了抓取工具,反之亦然)。白名单是**物理隔离**:
// 执行器只把在册工具喂给引擎,引擎调不到册外工具(不是靠提示词自律)。
import type { AgenticTool } from "./engine";

/**
 * agentic taskType → 允许的领域工具名集合(单一真值,导出供单测锚定)。
 * 三域(SPEC §3,对应 T-256c 三适配器):
 *   - agentic.research 调研:web 搜索端口 + web.read 分窗(T-251)+ 知识写入门;
 *   - agentic.collect  抓取决策:ingestion 采集端口(限流/防封/登录态在端口);
 *   - agentic.material 素材整理:素材搜索 + 归类整理。
 */
export const AGENTIC_TASK_TOOL_SCOPES: Readonly<
  Record<string, readonly string[]>
> = {
  "agentic.research": ["web.search", "web.read", "knowledge.write"],
  "agentic.collect": ["collect.plan", "collect.run"],
  "agentic.material": ["material.search", "material.organize"],
};

/**
 * 解析某 agentic taskType 的工具白名单。
 *   - 已知 → 工具名数组;
 *   - 未知 taskType → null(执行器据此诚实拒跑,不静默放全量)。
 */
export function resolveAgenticToolScope(
  taskType: string,
): readonly string[] | null {
  return AGENTIC_TASK_TOOL_SCOPES[taskType] ?? null;
}

/**
 * 白名单过滤:只保留 scope 内的工具(纵深防御 —— 即便 wiring 误传了额外工具,也在这里被挡)。
 * scope 未知 → 空集(拒放全量);工具集里缺白名单某项 → 跳过(后续切片补,不报错)。
 */
export function filterToolsToScope(
  tools: readonly AgenticTool[],
  taskType: string,
): AgenticTool[] {
  const scope = resolveAgenticToolScope(taskType);
  if (!scope) return [];
  const allowed = new Set(scope);
  return tools.filter((t) => allowed.has(t.name));
}
