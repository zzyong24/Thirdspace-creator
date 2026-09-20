import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("server-only", () => ({}));
import { createWorkbenchNativeClient, NativeFileError, type NativeLeasePort } from "./workbench-native-client";

const ref = { executionTaskId: "task-1", attempt: 2, fenceToken: "fence-2" };
const scope = { context: { userId: "db-user", accountId: "db-account" }, task: { id: "task-1", attempt: 2, fenceToken: "fence-2" } };
let server: Server | undefined;
let directory: string | undefined;

async function socket(handler: (request: Record<string, unknown>, reply: (value: object) => void, disconnect: () => void) => void) {
  directory = await mkdtemp(join(tmpdir(), "cw-node-test-"));
  const path = join(directory, "native.sock");
  server = createServer(connection => {
    let body = "";
    connection.on("data", chunk => {
      body += chunk.toString();
      const end = body.indexOf("\n");
      if (end < 0) return;
      handler(JSON.parse(body.slice(0, end)) as Record<string, unknown>, value => {
        connection.end(`${JSON.stringify(value)}\n`);
      }, () => connection.destroy());
    });
  });
  await new Promise<void>((resolve, reject) => server!.listen(path, () => resolve()).once("error", reject));
  return path;
}

afterEach(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  if (directory) await rm(directory, { recursive: true, force: true });
  server = undefined;
  directory = undefined;
});

describe("private native file client", () => {
  it("holds the backend admission callback through the native reply and derives identity from the locked row", async () => {
    let inLease = false;
    const path = await socket((request, reply) => {
      expect(inLease).toBe(true);
      expect(request.scope).toEqual({ userId: "db-user", accountId: "db-account", taskId: "task-1", attempt: 2, fenceToken: "fence-2" });
      expect(request.operationId).toBe("ledger-op");
      reply({ ok: true, operationId: "ledger-op", value: { entries: ["report.html"] } });
    });
    const lease: NativeLeasePort = {
      async withLease(current, mode, action) {
        expect(current).toEqual(ref);
        expect(mode).toBe("admission");
        inLease = true;
        try { return await action(scope); }
        finally { inLease = false; }
      },
    };
    const client = createWorkbenchNativeClient(lease, { platform: "darwin", desktop: true, socketPath: path });
    await expect(client.file(ref, "ledger-op", { kind: "list" })).resolves.toEqual({ entries: ["report.html"] });
    expect(inLease).toBe(false);
  });

  it("never connects when the backend rejects the current lease", async () => {
    let connects = 0;
    const path = await socket(() => { connects++; });
    const lease: NativeLeasePort = { async withLease() { throw new Error("lease expired"); } };
    const client = createWorkbenchNativeClient(lease, { platform: "darwin", desktop: true, socketPath: path });
    await expect(client.file(ref, "ledger-op", { kind: "stat", path: "a" })).rejects.toThrow("lease expired");
    expect(connects).toBe(0);
  });

  it("rejects stale fence even if a lease adapter erroneously returns another row", async () => {
    let connects = 0;
    const path = await socket(() => { connects++; });
    const lease: NativeLeasePort = { async withLease(_ref, _mode, action) {
      return action({ ...scope, task: { ...scope.task, fenceToken: "new-fence" } });
    } };
    const client = createWorkbenchNativeClient(lease, { platform: "darwin", desktop: true, socketPath: path });
    await expect(client.file(ref, "ledger-op", { kind: "stat", path: "a" })).rejects.toMatchObject({ code: "STALE_LEASE", dispatched: false });
    expect(connects).toBe(0);
  });

  it("marks a disconnected dispatched write as unknown_result", async () => {
    const path = await socket((_request, _reply, disconnect) => {
      disconnect();
    });
    const lease: NativeLeasePort = { async withLease(_ref, _mode, action) { return action(scope); } };
    const client = createWorkbenchNativeClient(lease, { platform: "darwin", desktop: true, socketPath: path });
    await expect(client.file(ref, "ledger-op", { kind: "write", path: "a", contentBase64: "YQ==", expectedVersion: 0 }))
      .rejects.toMatchObject({ code: "NATIVE_RESULT_UNKNOWN", dispatched: true });
  });

  it("keeps Windows closed", async () => {
    const client = createWorkbenchNativeClient({ async withLease() { throw new Error("must not run"); } },
      { platform: "win32", desktop: true, socketPath: "unused" });
    await expect(client.file(ref, "ledger-op", { kind: "list" })).rejects.toEqual(new NativeFileError("UNSUPPORTED_PLATFORM", false));
  });
});

describe("private native command client", () => {
  it("uses the current locked task identity and a distinct target operation for status", async () => {
    let inLease = false;
    const path = await socket((request, reply) => {
      expect(inLease).toBe(true);
      expect(request.scope).toEqual({ userId: "db-user", accountId: "db-account", taskId: "task-1", attempt: 2, fenceToken: "fence-2" });
      expect(request.operationId).toBe("status-call");
      expect(request.action).toEqual({ kind: "command_status", targetOperationId: "run-call" });
      reply({ ok: true, operationId: "status-call", value: { operationId: "run-call", state: "running" } });
    });
    const lease: NativeLeasePort = { async withLease(current, mode, action) {
      expect(current).toEqual(ref);
      expect(mode).toBe("admission");
      inLease = true;
      try { return await action(scope); } finally { inLease = false; }
    } };
    const client = createWorkbenchNativeClient(lease, { platform: "darwin", desktop: true, socketPath: path });
    await expect(client.command(ref, "status-call", { kind: "command_status", targetOperationId: "run-call" })).resolves.toMatchObject({ state: "running" });
    expect(inLease).toBe(false);
  });

  it("rejects a stale fence and Windows before dispatch", async () => {
    const path = await socket(() => { throw new Error("must not connect"); });
    const lease: NativeLeasePort = { async withLease(_ref, _mode, action) {
      return action({ ...scope, task: { ...scope.task, fenceToken: "new-fence" } });
    } };
    await expect(createWorkbenchNativeClient(lease, { platform: "darwin", desktop: true, socketPath: path })
      .command(ref, "run-call", { kind: "command_run", argv: ["-e", "1"], cwd: ".", runtimeId: "bundled-node", timeoutMs: 1000 }))
      .rejects.toMatchObject({ code: "STALE_LEASE", dispatched: false });
    await expect(createWorkbenchNativeClient(lease, { platform: "win32", desktop: true, socketPath: path })
      .command(ref, "run-call", { kind: "command_cancel", targetOperationId: "run-call" }))
      .rejects.toMatchObject({ code: "UNSUPPORTED_PLATFORM", dispatched: false });
  });

  it("cancels the admitted process after the user stops its lease", async () => {
    let stopped = false;
    let cancelled!: () => void;
    const cancelSeen = new Promise<void>(resolve => { cancelled = resolve; });
    const path = await socket((request, reply) => {
      const action = request.action as {kind:string;targetOperationId?:string};
      if (action.kind === "command_run") reply({ok:true,operationId:"run-1",value:{operationId:"run-1",state:"running"}});
      if (action.kind === "command_cancel") {
        expect(action.targetOperationId).toBe("run-1");
        expect(request.scope).toMatchObject({userId:"db-user",accountId:"db-account",taskId:"task-1"});
        reply({ok:true,operationId:request.operationId as string,value:{operationId:"run-1",state:"cancelled"}});
        cancelled();
      }
    });
    const lease:NativeLeasePort={async withLease(_ref,_mode,action){
      if(stopped)throw new Error("stopped");
      return action(scope);
    }};
    const client=createWorkbenchNativeClient(lease,{platform:"darwin",desktop:true,socketPath:path});
    await client.command(ref,"run-1",{kind:"command_run",argv:["-e","1"],cwd:".",runtimeId:"bundled-node",timeoutMs:10000});
    stopped=true;
    await Promise.race([cancelSeen,new Promise((_resolve,reject)=>setTimeout(()=>reject(new Error("cancel not sent")),3000))]);
  });
});
