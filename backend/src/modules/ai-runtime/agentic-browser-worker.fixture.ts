// 隔离集成入口：真实Pi/Chromium/工具工厂；仅DNS映射和URL guard允许本地HTTP夹具。
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { createExecutionWorker } from "../../../../ai-worker/src/execution/worker-runtime";
import { runAgenticInWorker } from "../../../../ai-worker/src/execution/agentic-worker-run";
import { createResearchWorkerTools } from "../../../../ai-worker/src/execution/research-worker-tools";
import { launchWithBrowser } from "../../../../ai-worker/src/runtime/browser/browser-launch";
import { isPiAgenticRuntimeAvailable } from "../../../../ai-worker/src/runtime/agentic/pi-engine";
type ResearchDeps = Parameters<typeof createResearchWorkerTools>[0];
type Browser = Awaited<ReturnType<NonNullable<ResearchDeps["connect"]>>>;
type BrowserServer = Awaited<
  ReturnType<NonNullable<ResearchDeps["launchServer"]>>
>;
// 夹具产物放在ai-worker/node_modules下，依赖解析与正式Worker相同；backend不增加浏览器SDK依赖。
const { chromium } = createRequire(__filename)("@playwright/test") as {
  chromium: {
    launchServer(options: Record<string, unknown>): Promise<BrowserServer>;
    connect(endpoint: string): Promise<Browser>;
  };
};
const { sourceUrl, mode } = JSON.parse(
  readFileSync(join(__dirname, "config.json"), "utf8"),
) as { sourceUrl: string; mode?: string };
const trace = (data: object) =>
  appendFileSync(
    join(__dirname, "trace.ndjson"),
    JSON.stringify({ pid: process.pid, ...data }) + "\n",
  );
async function main() {
  if (!process.send || !(await isPiAgenticRuntimeAvailable()))
    throw new Error("PI_UNAVAILABLE");
  const resources = new Set<ReturnType<typeof createResearchWorkerTools>>();
  const worker = createExecutionWorker({
    capabilities: ["agentic.run"],
    generate: async () => {
      throw new Error("wrong capability");
    },
    runAgentic: async (input, model, signal, call, onText) => {
      let hasLoaded = false;
      let activePage:
        | Awaited<
            ReturnType<Awaited<ReturnType<Browser["newContext"]>>["newPage"]>
          >
        | undefined;
      const tools = createResearchWorkerTools({
        signal,
        call,
        guardUrl: async (value) => {
          if (new URL(value).origin !== new URL(sourceUrl).origin)
            throw new Error("禁止外站");
          // 故障夹具只让真实动作后的guard失败，不伪造工具输出或持久回执。
          if (
            mode === "unknown" &&
            value === sourceUrl &&
            hasLoaded &&
            activePage &&
            !activePage.isClosed() &&
            (await activePage.evaluate(
              () => (window as any).__clicked === true,
            ))
          ) {
            trace({ type: "post-click-observation-failed" });
            throw new Error("fixture post-action observation unavailable");
          }
        },
        launchServer: async () => {
          const server = await launchWithBrowser((selection) =>
            chromium.launchServer({
              ...selection,
              headless: true,
              args: [
                "--host-resolver-rules=MAP browser.example.com 127.0.0.1",
                "--no-proxy-server",
              ],
            }),
          );
          trace({ type: "server", browserPid: server.process().pid });
          server.on("close", () => trace({ type: "server-close" }));
          return server;
        },
        connect: async (endpoint) => {
          const browser = await chromium.connect(endpoint);
          browser.on("disconnected", () => trace({ type: "browser-close" }));
          return new Proxy(browser, {
            get(target, key) {
              if (key === "newContext")
                return async (
                  ...args: Parameters<typeof browser.newContext>
                ) => {
                  const context = await target.newContext(...args);
                  trace({ type: "context" });
                  context.on("close", () => trace({ type: "context-close" }));
                  context.on("page", (page) => {
                    activePage = page;
                    page.on("domcontentloaded", () => {
                      hasLoaded = true;
                    });
                    trace({ type: "page" });
                    page.on("close", () => trace({ type: "page-close" }));
                  });
                  return context;
                };
              const value = Reflect.get(target, key, target);
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
        },
      });
      resources.add(tools);
      try {
        return await runAgenticInWorker(
          input,
          model,
          signal,
          call,
          onText,
          tools,
        );
      } finally {
        await tools.close();
        resources.delete(tools);
      }
    },
    send(message) {
      if (message.type === "call") trace({ type: "ipc", port: message.port });
      if (process.connected) process.send!(message);
    },
  });
  process.on("message", (message) => worker.receive(message));
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    worker.close();
    await Promise.all([...resources].map((item) => item.close()));
    process.exit(0);
  };
  process.on("disconnect", () => {
    void stop();
  });
  process.on("SIGTERM", () => {
    void stop();
  });
  worker.ready();
}
void main().catch(() => {
  trace({ type: "startup-error" });
  process.exit(78);
});
