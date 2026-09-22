import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { runCliCommand } from "../../src/cli";

/** 隔离测试适配器：真实 CLI/fetch/HTTP，调用方注入正式 dispatch POST。
 * 不替换业务 service；同一测试进程中串行使用，环境变量在每次调用后还原。
 */
export async function startLoopbackCliFixture(options: {
  post: (request: Request) => Promise<Response>;
  accessToken: string;
}) {
  let requests = 0;
  let baseUrl = "";
  const handshake = randomUUID();
  const server = createServer(async (incoming, outgoing) => {
    requests++;
    try {
      if (incoming.method !== "POST" || incoming.url !== "/api/v1/dispatch") {
        outgoing.writeHead(404).end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) value.forEach(item => headers.append(key, item));
        else if (value !== undefined) headers.set(key, value);
      }
      const response = await options.post(new Request(`${baseUrl}/api/v1/dispatch`, {
        method: "POST", headers, body: Buffer.concat(chunks).toString("utf8"),
      }));
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      outgoing.writeHead(500, { "content-type": "application/json" });
      outgoing.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("隔离 HTTP 未分配端口");
  baseUrl = `http://127.0.0.1:${address.port}`;
  let running = false;
  return {
    baseUrl,
    requests: () => requests,
    async run(args: string[]): Promise<unknown> {
      if (running) throw new Error("隔离 CLI fixture 必须串行调用");
      if (args[0] !== "call" || !args.includes("--account") || args.includes("--connection-file") || args.includes("--use-default-account")) {
        throw new Error("隔离 CLI 只允许显式账号 call，禁止读取安装连接或默认账号");
      }
      running = true;
      const values: Record<string, string> = {
        CREATOROS_BASE_URL: baseUrl,
        CREATOROS_CLI_ACCESS_TOKEN: options.accessToken,
        CREATOROS_CLI_ACCESS_FILE: "",
        CREATOROS_EMAIL: "",
        CREATOROS_PASSWORD: "",
        CREATOROS_HANDSHAKE_TOKEN: handshake,
        CREATOROS_SIDECAR_HANDSHAKE_TOKEN: handshake,
      };
      const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
      try {
        Object.assign(process.env, values);
        return await runCliCommand(args);
      } finally {
        for (const [key, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
        running = false;
      }
    },
    async close(): Promise<void> {
      const closed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      server.closeAllConnections();
      await closed;
    },
  };
}
