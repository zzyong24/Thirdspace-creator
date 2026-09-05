// 仅隔离研究夹具，不是生产资源监管入口。
import { fork, type ChildProcess } from "node:child_process";
import { writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { killWorkerProcessTree } from "./worker-process-tree";
import { launchWithBrowser } from "../../../../ai-worker/src/runtime/browser/browser-launch";
interface ProbeBrowserServer {
  process(): ChildProcess;
  wsEndpoint(): string;
  close(): Promise<void>;
}
const [role, dir] = process.argv.slice(2);
if (role === "host") {
  const guardian = fork(__filename, ["guardian", dir!], {
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  guardian.on("message", (message) => process.send?.(message));
  process.on("message", (message) => {
    if (message === "shutdown") guardian.send("shutdown");
  });
} else {
  const { chromium } = createRequire(__filename)("@playwright/test");
  let stopped: Promise<void> | undefined;
  const ready = launchWithBrowser<ProbeBrowserServer>((selection) =>
    chromium.launchServer({ ...selection, headless: true, timeout: 15000 }),
  );
  const stop = () =>
    (stopped ??= (async () => {
      const server = await ready;
      try {
        await killWorkerProcessTree(server.process());
        const receipt = {
          kind: "probe-stopped",
          guardianPid: process.pid,
          browserPid: server.process().pid,
        };
        await writeFile(join(dir!, "stopped.tmp"), JSON.stringify(receipt));
        await rename(join(dir!, "stopped.tmp"), join(dir!, "stopped.json"));
      } catch (error) {
        await writeFile(
          join(dir!, "unverified.json"),
          JSON.stringify({
            reason: error instanceof Error ? error.message : "unknown",
          }),
        );
      } finally {
        await server.close().catch(() => {});
        process.exit(0);
      }
    })());
  process.on("disconnect", () => void stop());
  process.on("message", (message) => {
    if (message === "shutdown") void stop();
  });
  ready
    .then((server) => {
      if (process.connected)
        process.send?.({
          guardianPid: process.pid,
          browserPid: server.process().pid,
          endpoint: server.wsEndpoint(),
        });
      else void stop();
    })
    .catch(() => process.exit(2));
}
