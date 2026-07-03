// MCP server 装配 —— 低层 Server API(tools/list + tools/call 两个 handler)。
// 之所以不用高层 McpServer.registerTool:工具面是从 contract 批量生成的,inputSchema
// 已经是现成 JSON Schema,低层 API 直接吐出即可,不需要再绕一遍 zod shape。

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { buildTools, type McpToolDef } from "./tools";
import { DispatchClient, DispatchError, type DispatchInput } from "./dispatch";

export interface CreatorOsMcpServerOptions {
  dispatchClient: DispatchClient;
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

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolsByName.get(request.params.name);
    if (!tool) {
      return {
        content: [
          { type: "text" as const, text: `未知工具:${request.params.name}` },
        ],
        isError: true,
      };
    }
    const input = (request.params.arguments ?? {}) as DispatchInput;
    try {
      const envelope = await dispatchClient.dispatch(tool.opId, input);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(envelope, null, 2) },
        ],
      };
    } catch (err) {
      // dispatch 层错误(4xx/5xx/网络)转成 MCP tool error,而非协议级异常 ——
      // 让调用方 AI 拿到可读的失败原因继续推理。
      const message =
        err instanceof DispatchError
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
