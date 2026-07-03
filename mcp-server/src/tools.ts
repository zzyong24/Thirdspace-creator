// 工具面自动生成 —— 从 @creatoros/contract 的 ENDPOINTS 遍历生成 MCP tools:
//   工具名   = op id 点换下划线(projects.list → projects_list)
//   inputSchema = endpoint 的 params/query/body zod schema → JSON Schema(zod v4 z.toJSONSchema)
//   annotations = readOnlyHint(GET)/ destructiveHint(DELETE)正确标注
//   description = 从 endpoint 元数据生成;写 op 附确认门语义说明,高危 op 附警告。
// 契约每加一个 op,这里自动多一个 tool,零手工维护。

import { z } from "zod";
import { ENDPOINTS, type Endpoint, type HttpMethod } from "@creatoros/contract";

/** MCP tool 定义(与 MCP spec 的 Tool 结构对齐,低层 Server API 直接返回)。 */
export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  /** 反查:该 tool 对应的 contract op id(overview 等辅助工具为约定值)。 */
  opId: string;
}

/** op id → MCP 工具名(点换下划线)。 */
export function toToolName(opId: string): string {
  return opId.replaceAll(".", "_");
}

/** 单个 zod schema → JSON Schema。转不动的类型(transform 等)降级 any,不炸。 */
function schemaToJson(schema: z.ZodTypeAny): Record<string, unknown> {
  const json = z.toJSONSchema(schema, {
    // io "input":入参视角 —— 带 default 的字段按可省略处理,与 dispatch 校验一致。
    io: "input",
    // 个别 schema 可能含 transform/custom 等不可表示类型,降级为 {} 而非抛错。
    unrepresentable: "any",
  }) as Record<string, unknown>;
  // MCP inputSchema 不需要 $schema 字段,去掉减噪。
  delete json.$schema;
  return json;
}

/**
 * endpoint 的 params/query/body 三段合成一个 MCP inputSchema:
 * { type: "object", properties: { params?, query?, body? } } ——
 * 与 /api/v1/dispatch 的 input 形状({ params, query, body })一一对应,
 * tools/call 的 arguments 原样透传即可。
 */
export function endpointInputSchema(endpoint: Endpoint): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  if (endpoint.params) {
    properties.params = schemaToJson(endpoint.params);
    required.push("params"); // 路径参数必填(如 :projectId)
  }
  if (endpoint.query) {
    properties.query = schemaToJson(endpoint.query);
  }
  if (endpoint.body) {
    properties.body = schemaToJson(endpoint.body);
  }
  const schema: Record<string, unknown> = {
    type: "object",
    properties,
    additionalProperties: false,
  };
  if (required.length > 0) schema.required = required;
  return schema;
}

/** AI 任务类 op(只产候选、需要 confirm 落账)的 id 前缀/精确名单。 */
const CANDIDATE_SEMANTICS_OPS = new Set([
  "ai.tasks.create",
  "ai.tasks.confirm",
  "ai.tasks.cancel",
  "ai.tasks.results.patch",
]);

function methodAnnotations(method: HttpMethod): McpToolDef["annotations"] {
  return {
    readOnlyHint: method === "GET",
    // 只有物理删除类算 destructive;POST/PATCH/PUT 是可审计的业务写。
    destructiveHint: method === "DELETE",
    // GET/PUT/DELETE 幂等;POST/PATCH 不保证。
    idempotentHint: method === "GET" || method === "PUT" || method === "DELETE",
    // 全部打到本机 CreatorOS,不触外网。
    openWorldHint: false,
  };
}

/** 生成单个 endpoint 的 description(中文,写明方法/路径/确认门/高危警告)。 */
export function endpointDescription(endpoint: Endpoint): string {
  const parts: string[] = [
    `CreatorOS contract op「${endpoint.id}」(${endpoint.method} ${endpoint.path})。`,
  ];
  if (endpoint.isList) {
    parts.push("返回列表 envelope({ data: [...], meta })。");
  }
  if (endpoint.method === "GET") {
    parts.push("只读操作,无副作用。");
  } else if (CANDIDATE_SEMANTICS_OPS.has(endpoint.id)) {
    // 确认门语义:AI 任务只产候选,用户/调用方显式 confirm 才物化落账。
    parts.push(
      "【确认门】AI 任务类操作:create 只产生候选结果(不落账),必须由用户审阅后调 ai_tasks_confirm 才物化;cancel/patch 只作用于候选。",
    );
  } else if (endpoint.method === "DELETE") {
    parts.push(
      "【高危】物理删除操作,不可恢复 —— 调用前必须得到用户明确确认。",
    );
  } else {
    parts.push(
      "写操作:直接落账到用户数据。涉及 AI 产出物的流程请优先走 ai.tasks 候选+confirm 确认门,而非直接写。",
    );
  }
  if (endpoint.fr.length > 0) {
    parts.push(`对应需求:${endpoint.fr.join(", ")}。`);
  }
  return parts.join(" ");
}

/** 辅助工具:一发拿 dashboard 摘要,外部 AI 起步入口。 */
export const OVERVIEW_TOOL: McpToolDef = {
  name: "creatoros_overview",
  description:
    "CreatorOS 总览:一次调用拿到 dashboard 页面摘要(项目/发布/数据看板等聚合信息),等价于 pages_dashboard_get。外部 AI 建议以此为起步了解当前工作台状态。",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  opId: "pages.dashboard.get",
};

/** 从 ENDPOINTS 生成全部 MCP tools(含 creatoros_overview 辅助工具)。 */
export function buildTools(): McpToolDef[] {
  const tools: McpToolDef[] = [];
  const seen = new Set<string>();
  for (const endpoint of Object.values(ENDPOINTS) as Endpoint[]) {
    const name = toToolName(endpoint.id);
    if (seen.has(name)) {
      // op id 全局唯一,点换下划线后不应撞名;真撞了是契约层 bug,当场暴露。
      throw new Error(`duplicate MCP tool name: ${name}`);
    }
    seen.add(name);
    tools.push({
      name,
      description: endpointDescription(endpoint),
      inputSchema: endpointInputSchema(endpoint),
      annotations: methodAnnotations(endpoint.method),
      opId: endpoint.id,
    });
  }
  tools.push(OVERVIEW_TOOL);
  return tools;
}
