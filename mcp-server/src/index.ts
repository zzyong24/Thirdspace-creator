// CreatorOS MCP server 入口 —— stdio 进程形态。
// 外部 MCP client(Claude Code/Desktop 等)以子进程方式拉起本文件,通过 stdin/stdout
// 说 JSON-RPC;本进程再通过 HTTP 调运行中的 Next dev server 的 /api/v1/dispatch。
//
// env:
//   CREATOROS_BASE_URL  dev server 地址,默认 http://localhost:3000
//   CREATOROS_EMAIL     登录邮箱(与 PASSWORD 同缺 = T-046 本机免登录裸调)
//   CREATOROS_PASSWORD  登录密码

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DispatchClient } from "./dispatch";
import { discoverConnection } from "./connection";
import { createCreatorOsMcpServer } from "./server";

async function main(): Promise<void> {
  const explicitDevBaseUrl = process.env.CREATOROS_BASE_URL;
  const connection = explicitDevBaseUrl ? null : await discoverConnection();
  const dispatchClient = new DispatchClient(
    explicitDevBaseUrl
      ? {
          baseUrl: explicitDevBaseUrl,
          email: process.env.CREATOROS_EMAIL,
          password: process.env.CREATOROS_PASSWORD,
          handshakeToken: process.env.CREATOROS_HANDSHAKE_TOKEN,
          cliAccessToken: process.env.CREATOROS_CLI_ACCESS_TOKEN,
        }
      : {
          baseUrl: connection!.baseUrl,
          handshakeToken: connection!.handshakeToken,
          cliAccessToken: connection!.cliAccessToken,
          productId: connection!.productId,
          packageId: connection!.packageId,
          launchNonce: connection!.launchNonce,
        },
  );

  const server = createCreatorOsMcpServer({ dispatchClient });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio server 的一切日志走 stderr(stdout 是 JSON-RPC 通道,不能污染)。
  console.error(
    `[creatoros-mcp] 已就绪(mode=${explicitDevBaseUrl ? "explicit-dev" : "installed"},product=${connection?.productId ?? "dev"})`,
  );
}

main().catch((err) => {
  console.error("[creatoros-mcp] 启动失败:", err);
  process.exit(1);
});
