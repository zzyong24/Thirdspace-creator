// MCP server 装配 —— 低层 Server API(tools/list + tools/call 两个 handler)。
// 之所以不用高层 McpServer.registerTool:工具面是从 contract 批量生成的,inputSchema
// 已经是现成 JSON Schema,低层 API 直接吐出即可,不需要再绕一遍 zod shape。

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { buildTools,endpointInputSchema,schemaToJson,type McpToolDef } from "./tools";
import {operationCatalog,describeOperation,operationDescribeInput} from "./operation-catalog";
import {
  DispatchClient,
  DispatchError,
  DispatchObservationError,
  type DispatchCallOptions,
  type DispatchInput,
} from "./dispatch";
import { getCliOperationPolicy } from "@creatoros/contract";

export interface CreatorOsMcpServerOptions {
  dispatchClient: DispatchClient;
  /** 仅由 serve 的显式参数固定范围；工具可显式覆盖。 */
  defaultGroupId?: string;
  defaultAccountId?: string;
}

/** 装配一个 CreatorOS MCP Server(未连 transport;index.ts 负责接 stdio)。 */
export function createCreatorOsMcpServer(
  options: CreatorOsMcpServerOptions,
): Server {
  const { dispatchClient } = options;
  const tools = buildTools();
  const toolsByName = new Map<string, McpToolDef>(tools.map((t) => [t.name, t]));

  const server = new Server(
    { name: "creatoros", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(({ name, description, inputSchema, annotations }) => ({
      name,
      description,
      inputSchema: inputSchema as { type: "object" },
      annotations,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const tool = toolsByName.get(request.params.name);
    if (!tool) {
      return {
        content: [
          { type: "text" as const, text: `未知工具:${request.params.name}` },
        ],
        isError: true,
      };
    }
    const args = (request.params.arguments ?? {}) as DispatchInput & {
      _creatoros?: DispatchCallOptions;
    };
    const { _creatoros, ...input } = args;
    try {
      if(tool.opId==="creatoros.operations.list"||tool.opId==="creatoros.operations.describe"){
        const result=tool.opId==="creatoros.operations.list"?operationCatalog(args):describeOperation(operationDescribeInput.parse(args).operation,endpointInputSchema,schemaToJson);
        return {content:[{type:"text" as const,text:JSON.stringify(result)}]};
      }
      const policy = getCliOperationPolicy(tool.opId);
      if (!policy) throw new Error(`operation 缺 CLI policy: ${tool.opId}`);
      if (policy.effect !== "read") {
        if (_creatoros?.apply !== true) throw new Error(`${tool.opId} 必须显式 apply=true。`);
        if (!_creatoros.idempotencyKey?.trim()) {
          throw new Error(`${tool.opId} 必须提供 idempotencyKey。`);
        }
        if (policy.confirmation === "confirm_impact" && !_creatoros.confirmImpact?.trim()) {
          throw new Error(`${tool.opId} 必须提供 confirmImpact。`);
        }
      }
      const groupId=_creatoros?.groupId ?? options.defaultGroupId;
      // 显式切组时不把启动时原组的真实平台目标带过去。
      const accountId=_creatoros?.accountId ?? (_creatoros?.groupId && _creatoros.groupId!==options.defaultGroupId ? undefined : options.defaultAccountId);
      const envelope = await dispatchClient.dispatch(tool.opId, input, {..._creatoros,groupId,accountId}, {signal:extra.signal});
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(envelope, null, 2) },
        ],
      };
    } catch (err) {
      // dispatch 层错误(4xx/5xx/网络)转成 MCP tool error,而非协议级异常 ——
      // 让调用方 AI 拿到可读的失败原因继续推理。
      const message =
        err instanceof DispatchError || err instanceof DispatchObservationError
          ? err.message
          : err instanceof Error
            ? `dispatch ${tool.opId} 失败:${err.message}(dev server 是否在运行?CREATOROS_BASE_URL 是否正确?)`
            : String(err);
      return {
        content: [{ type: "text" as const, text: message }],
        isError: true,
      };
    }
  });

  return server;
}
