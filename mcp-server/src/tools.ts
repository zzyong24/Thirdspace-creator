// 工具面自动生成 —— 从 @creatoros/contract 的 ENDPOINTS 遍历生成 MCP tools:
//   工具名   = op id 点换下划线(projects.list → projects_list)
//   inputSchema = endpoint 的 params/query/body zod schema → JSON Schema(zod v4 z.toJSONSchema)
//   annotations = readOnlyHint(GET)/ destructiveHint(DELETE)正确标注
//   description = 从 endpoint 元数据生成;写 op 附确认门语义说明,高危 op 附警告。
// 契约每加一个 op,这里自动多一个 tool,零手工维护。

import { z } from "zod";
import {
  ENDPOINTS,
  getCliOperationPolicy,
  type CliOperationPolicy,
  type Endpoint,
} from "@creatoros/contract";

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
export function schemaToJson(schema: z.ZodTypeAny): Record<string, unknown> {
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
  const policy = getCliOperationPolicy(endpoint.id);
  if (!policy) throw new Error(`operation 缺 CLI policy: ${endpoint.id}`);
  const contextRequired = policy.effect === "read"
    ? []
    : policy.confirmation === "confirm_impact"
      ? ["idempotencyKey", "apply", "confirmImpact"]
      : ["idempotencyKey", "apply"];
  properties._creatoros = {
    type: "object",
    description: "CreatorOS CLI/MCP 调用上下文。每次显式传 groupId；平台目标另传真实 accountId。",
    properties: {
      groupId: { type: "string", minLength: 1 },
      accountId: { type: "string", minLength: 1 },
      idempotencyKey: { type: "string", minLength: 1 },
      apply: { type: "boolean" },
      confirmImpact: { type: "string", minLength: 1 },
    },
    ...(contextRequired.length > 0 ? { required: contextRequired } : {}),
    additionalProperties: false,
  };
  if (contextRequired.length > 0) required.push("_creatoros");
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

function policyAnnotations(policy: CliOperationPolicy): McpToolDef["annotations"] {
  return {
    readOnlyHint: policy.effect === "read",
    destructiveHint: policy.effect === "destructive",
    idempotentHint: policy.idempotency !== "not_applicable" || policy.effect === "read",
    openWorldHint: policy.effect === "external",
  };
}

/** 生成单个 endpoint 的 description(中文,写明方法/路径/确认门/高危警告)。 */
export function endpointDescription(endpoint: Endpoint): string {
  const policy = getCliOperationPolicy(endpoint.id);
  if (!policy) throw new Error(`operation 缺 CLI policy: ${endpoint.id}`);
  const parts: string[] = [
    `CreatorOS contract op「${endpoint.id}」(${endpoint.method} ${endpoint.path})。`,
  ];
  if (endpoint.isList) {
    parts.push("返回列表 envelope({ data: [...], meta })。");
  }
  if (policy.effect === "read") {
    parts.push("只读操作,无副作用。");
  } else if (policy.effect === "destructive") {
    parts.push(
      "【高危/高影响】包含物理删除、归档、取消或清空语义；必须传 apply、幂等键和包含真实目标 ID 的 confirmImpact。",
    );
  } else if (policy.effect === "external") {
    parts.push(
      "【外部动作】会触发模型、浏览器、抖音采集或外部读取；必须传 apply、幂等键和明确的 confirmImpact。",
    );
    if (CANDIDATE_SEMANTICS_OPS.has(endpoint.id)) {
      parts.push("【确认门】该操作只产生候选；采纳仍调用现有 confirm operation。");
    }
  } else if (CANDIDATE_SEMANTICS_OPS.has(endpoint.id)) {
    parts.push(
      "【确认门】AI 候选只有在调用 confirm 后才物化；cancel/patch 只作用于候选。",
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
  inputSchema: {
    type: "object",
    properties: {
      _creatoros: {
        type: "object",
        description: "显式传 groupId，平台目标另传 accountId。",
        properties: { groupId: { type: "string", minLength: 1 }, accountId: { type: "string", minLength: 1 } },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
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
    const policy = getCliOperationPolicy(endpoint.id);
    if (!policy) throw new Error(`operation 缺 CLI policy: ${endpoint.id}`);
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
      annotations: policyAnnotations(policy),
      opId: endpoint.id,
    });
  }
  tools.push(OVERVIEW_TOOL);
  return tools.sort((left, right) => left.name.localeCompare(right.name));
}
