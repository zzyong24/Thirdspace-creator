import { tool, type ToolSet } from "ai";
import type { z } from "zod";

// 工具注册表(Phase 3)—— 用户选的「函数注册表」机制(不先上 MCP)。一个工具 =
// 名字 + 一句描述 + 入参 zod schema + execute。execute 在上层绑到 backend 的 service
// port(读人设 / 搜热点 / 读知识 / 存候选 / 出可视化);写类工具只产候选,不直接落库。
// 这里只负责「把工具定义包成 AI SDK 的 ToolSet」,不含任何领域逻辑,也不绑厂商。
//
// 加一个工具 = 加一条 ToolDef;加一个节点 = 选它能用哪些工具。AgentRuntime 不动。

export interface ToolDef<I = unknown, O = unknown> {
  /** 工具名(模型按名调用;同一节点内唯一)。 */
  name: string;
  /** 一句话描述 —— 模型据此决定何时调用,务必写清「什么时候用」。 */
  description: string;
  /** 入参 schema(zod)—— 模型产出的入参先过它再进 execute。 */
  inputSchema: z.ZodType<I>;
  /** 真正干活:调 backend service port,返回给模型的观测结果。 */
  execute: (input: I) => Promise<O> | O;
}

/**
 * 把一组工具定义包成可直接喂给 runAgentNode(opts.tools) 的 ToolSet。
 * 入参用 ToolDef<any> —— 注册表本就是异构集合(各工具入参类型不同),逐个工具内部仍强类型。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toToolSet(defs: readonly ToolDef<any, any>[]): ToolSet {
  const set: ToolSet = {};
  for (const def of defs) {
    set[def.name] = tool({
      description: def.description,
      inputSchema: def.inputSchema,
      execute: async (input: unknown) => def.execute(input),
    });
  }
  return set;
}
