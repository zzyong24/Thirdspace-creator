import { it, expect } from "vitest";
import { fork, execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function rows() {
  return execFileSync("ps", ["-axo", "pid=,ppid=,pgid=,stat=,lstart="], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .map((line) => {
      const [pid, ppid, pgid, state, ...started] = line.trim().split(/\s+/);
      return {
        pid: Number(pid),
        ppid: Number(ppid),
        pgid: Number(pgid),
        state: state!,
        started: started.join(" "),
      };
    });
}
function live(pid: number) {
  return rows().some((row) => row.pid === pid && !row.state.includes("Z"));
}
async function until(check: () => boolean | Promise<boolean>) {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await sleep(50);
  }
  throw new Error("probe timeout");
}
it.skipIf(process.platform !== "darwin").each(["host-kill", "guardian-kill"])(
  "隔离资源监管可行性 %s",
  async (mode) => {
    const dir = await mkdtemp(
        resolve("../ai-worker/node_modules/.resource-guardian-probe-"),
      ),
      entry = join(dir, "probe.cjs");
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "import{build}from'esbuild';await build({entryPoints:[process.argv[1]],outfile:process.argv[2],bundle:true,platform:'node',target:'node24',format:'cjs',external:['@playwright/test']});",
        resolve(
          "src/modules/execution/browser-resource-guardian.probe.fixture.ts",
        ),
        entry,
      ],
      { cwd: resolve("../ai-worker"), stdio: "pipe" },
    );
    const host = fork(entry, ["host", dir], {
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    let info:
      { guardianPid: number; browserPid: number; endpoint: string } | undefined;
    let connected: any;
    let tracked: number[] = [];
    let browserIdentity: ReturnType<typeof rows>[number] | undefined;
    let guardianIdentity: ReturnType<typeof rows>[number] | undefined;
    try {
      info = await new Promise<NonNullable<typeof info>>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("guardian ready timeout")),
          20000,
        );
        host.once("message", (value) => {
          clearTimeout(timer);
          resolve(value as any);
        });
        host.once("exit", () => {
          clearTimeout(timer);
          reject(new Error("host exited before ready"));
        });
      });
      const { chromium } = createRequire(entry)("@playwright/test");
      connected = await chromium.connect(info.endpoint);
      const page = await connected.newPage();
      await page.setContent("<button>隔离研究页面</button>");
      const before = rows(),
        browser = before.find((row) => row.pid === info!.browserPid)!,
        guardian = before.find((row) => row.pid === info!.guardianPid)!;
      browserIdentity = browser;
      guardianIdentity = guardian;
      expect(browser.pgid).toBe(browser.pid);
      expect(browser.pgid).not.toBe(guardian.pgid);
      tracked = [browser.pid];
      for (let round = 0; round < 10; round++)
        for (const row of before)
          if (tracked.includes(row.ppid) && !tracked.includes(row.pid))
            tracked.push(row.pid);
      expect(tracked.length).toBeGreaterThan(1);
      if (mode === "host-kill") {
        host.kill("SIGKILL");
        await until(async () => {
          try {
            await readFile(join(dir, "stopped.json"));
            return true;
          } catch {
            return false;
          }
        });
        expect(tracked.filter(live)).toEqual([]);
      } else {
        process.kill(info.guardianPid, "SIGKILL");
        await until(() => !live(info!.guardianPid));
        await sleep(250);
        expect(live(info.browserPid)).toBe(true);
        await expect(readFile(join(dir, "stopped.json"))).rejects.toThrow();
      }
      if (process.env.T915_RECORD_RESOURCE_PROBE === "1")
        await writeFile(
          resolve(
            `../docs/research/evidence/t915/resource-guardian-${mode}-probe.json`,
          ),
          JSON.stringify(
            {
              mode,
              platform: process.platform,
              hostPid: host.pid,
              guardianPid: info.guardianPid,
              browserPid: info.browserPid,
              browserPgid: browser.pgid,
              guardianPgid: guardian.pgid,
              trackedPids: tracked,
              liveTracked: tracked.filter(live),
              stoppedReceipt: mode === "host-kill",
              scope:
                "隔离夹具；无数据库、profile解锁或签名回执；不代表生产实现",
            },
            null,
            2,
          ) + "\n",
        );
    } finally {
      // 只清理由本夹具刚创建并记录的独立浏览器组，不将此操作充作生产停止证明。
      if (
        info &&
        rows().some(
          (row) =>
            row.pid === info!.browserPid &&
            row.pgid === info!.browserPid &&
            row.started === browserIdentity?.started,
        )
      )
        try {
          process.kill(-info.browserPid, "SIGKILL");
        } catch {}
      await connected?.close().catch(() => {});
      host.kill("SIGKILL");
      if (
        info &&
        rows().some(
          (row) =>
            row.pid === info!.guardianPid &&
            row.started === guardianIdentity?.started,
        )
      )
        try {
          process.kill(info.guardianPid, "SIGKILL");
        } catch {}
      if (tracked.length) await until(() => tracked.every((pid) => !live(pid)));
      await rm(dir, { recursive: true, force: true });
    }
  },
  40000,
);
