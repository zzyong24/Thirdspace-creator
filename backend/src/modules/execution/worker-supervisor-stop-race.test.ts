import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fork: vi.fn(), killTree: vi.fn() }));
vi.mock("node:child_process", () => ({ fork: mocks.fork }));
vi.mock("./worker-process-tree", () => ({ killWorkerProcessTree: mocks.killTree }));
import { createWorkerSupervisor } from "./worker-supervisor";
const ref = { executionTaskId: "stop-race", attempt: 1, fenceToken: "fence" };
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

function fixture(exitOnTerm = true) {
  const callbacks: Array<(error: Error | null) => void> = [];
  const child = Object.assign(new EventEmitter(), {
    pid: 123, connected: true, exitCode: null as number | null, signalCode: null as string | null,
    send: vi.fn((_message: unknown, callback: (error: Error | null) => void) => { callbacks.push(callback); }),
    kill: vi.fn((signal: string) => { if (exitOnTerm && signal === "SIGTERM") setTimeout(exit, 1); return true; }),
  });
  function exit() { child.connected = false; child.exitCode = 0; child.emit("exit", 0); }
  mocks.fork.mockImplementation(() => { queueMicrotask(() => child.emit("message", { version: 1, type: "ready", requestId: "ready", capabilities: ["model.generate"] })); return child; });
  mocks.killTree.mockImplementation(async () => { exit(); });
  const ports = { validate: vi.fn(async () => {}), invoke: vi.fn(async () => ({})) };
  const supervisor = createWorkerSupervisor({ entryPath: "fixture.cjs", ports, shutdownGraceMs: 20 });
  return { child, callbacks, supervisor, exit, ports };
}

it.each(["run", "reply"] as const)("停止已开始后%s发送回调失败，不启动第二次清理", async kind => {
  const f = fixture();
  await f.supervisor.start();
  const running = f.supervisor.run(ref, null).catch(() => {});
  await vi.waitFor(() => expect(f.callbacks).toHaveLength(1));
  if (kind === "reply") {
    f.child.emit("message", { version: 1, type: "call", requestId: "heartbeat", execution: ref, port: "heartbeat", data: {} });
    await vi.waitFor(() => expect(f.callbacks).toHaveLength(2));
  }
  const stopping = f.supervisor.stop();
  f.callbacks.at(-1)!(new Error("IPC channel closed"));
  await stopping; await running;
  expect(mocks.killTree).not.toHaveBeenCalled();
});

it("正常运行时发送失败仍强制清理", async () => {
  const f = fixture(); await f.supervisor.start();
  const running = f.supervisor.run(ref, null).catch(() => {});
  await vi.waitFor(() => expect(f.callbacks).toHaveLength(1));
  f.callbacks[0]!(new Error("IPC failed")); await running;
  expect(mocks.killTree).toHaveBeenCalledTimes(1);
  await f.supervisor.stop();
});
it("不响应SIGTERM时仍按grace执行强制清理", async () => {
  vi.useFakeTimers();const f = fixture(false);const started=f.supervisor.start();await vi.advanceTimersByTimeAsync(0);await started;
  const stopping=f.supervisor.stop();await vi.advanceTimersByTimeAsync(120_000);await stopping;expect(mocks.killTree).toHaveBeenCalledTimes(1);
});
it("grace整树清理失败继续传播，不伪造停止证明", async () => {
  vi.useFakeTimers();const f = fixture(false);const started=f.supervisor.start();await vi.advanceTimersByTimeAsync(0);await started;
  const error = new Error("WORKER_TREE_OWNER_UNVERIFIED"); mocks.killTree.mockRejectedValue(error);
  const stopping=f.supervisor.stop(),rejected=expect(stopping).rejects.toBe(error);await vi.advanceTimersByTimeAsync(120_000);await rejected;
  expect(await f.supervisor.stopExecutionTree(ref)).toBe(false);
  f.exit();
});
