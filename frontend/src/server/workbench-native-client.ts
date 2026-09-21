import "server-only";
import { createConnection } from "node:net";
import { randomUUID } from "node:crypto";
import type { ExecutionRef } from "@creatoros/contract/execution-worker";

export type NativeFileAction =
  | { kind: "list"; path?: string }
  | { kind: "read"; path: string; offset: number; limit: number }
  | { kind: "stat"; path: string }
  | { kind: "write"; path: string; contentBase64: string; expectedVersion: number };

export type NativeCommandAction =
  | { kind: "command_run"; argv: string[]; cwd: string; runtimeId: "bundled-node" | "bundled-python" | "approved-program"; timeoutMs: number; stdinRef?: string }
  | { kind: "command_status" | "command_cancel"; targetOperationId: string }
  | { kind: "command_read"; targetOperationId: string; stream: "stdout" | "stderr"; offset: number; limit: number };

type VerifiedScope = {
  context: { userId: string; accountId: string };
  task: { id: string; attempt: number; fenceToken: string | null };
};

/** Pass createExecutionLeaseService(db).withLease. Each callback must stay database-only and short. */
export type NativeLeasePort = {
  withLease<T>(ref: ExecutionRef, mode: "admission", action: (scope: VerifiedScope) => Promise<T>): Promise<T>;
};

export class NativeFileError extends Error {
  constructor(public readonly code: string, public readonly dispatched: boolean, public readonly currentVersion?: number) {
    super(code);
    this.name = "NativeFileError";
  }
}

type NativeReply = { ok: boolean; operationId?: string; value?: unknown; code?: string; currentVersion?: number };

function send(socketPath: string, request: object, operationId: string, isWrite: boolean): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let dispatched = false;
    let settled = false;
    let body = "";
    const socket = createConnection({ path: socketPath });
    socket.setTimeout(10_000);
    const fail = (code: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new NativeFileError(dispatched ? "NATIVE_RESULT_UNKNOWN" : code, dispatched));
    };
    socket.once("connect", () => {
      dispatched = true;
      socket.write(`${JSON.stringify(request)}\n`);
    });
    socket.on("data", chunk => {
      body += chunk.toString("utf8");
      if (body.length > 1_400_000) return fail("INVALID_NATIVE_REPLY");
      const end = body.indexOf("\n");
      if (end < 0) return;
      let reply: NativeReply;
      try { reply = JSON.parse(body.slice(0, end)) as NativeReply; }
      catch { return fail("INVALID_NATIVE_REPLY"); }
      if (settled) return;
      settled = true;
      socket.destroy();
      if (reply.ok === true && reply.operationId === operationId) resolve(reply.value);
      else if (reply.ok === false && typeof reply.code === "string") {
        reject(new NativeFileError(isWrite && reply.code === "FILE_IO_ERROR" ? "NATIVE_RESULT_UNKNOWN" : reply.code,
          true, reply.currentVersion));
      } else reject(new NativeFileError("NATIVE_RESULT_UNKNOWN", true));
    });
    socket.once("timeout", () => fail("NATIVE_TIMEOUT"));
    socket.once("error", () => fail("NATIVE_UNAVAILABLE"));
    socket.once("close", () => fail("NATIVE_CONNECTION_CLOSED"));
  });
}

/**
 * Backend-only entry point. The lease port supplies identity from the current
 * execution row. Native I/O runs between two short lease checks so a slow Rust
 * reply cannot occupy PGlite's single connection. Never pass identity from a
 * model action, HTTP body, or WebView state.
 */
export function createWorkbenchNativeClient(lease: NativeLeasePort, options: {
  platform?: NodeJS.Platform;
  desktop?: boolean;
  socketPath?: string;
} = {}) {
  const platform = options.platform ?? process.platform;
  const desktop = options.desktop ?? process.env.CREATOROS_DESKTOP === "1";
  const socketPath = options.socketPath ?? process.env.CREATOROS_WORKBENCH_SOCKET;
  const watchers = new Map<string, ReturnType<typeof setInterval>>();
  const stopWatching = (targetOperationId: string) => {
    const timer = watchers.get(targetOperationId);
    if (timer) clearInterval(timer);
    watchers.delete(targetOperationId);
  };
  function watch(ref: ExecutionRef, targetOperationId: string, scope: { userId:string; accountId:string; taskId:string; attempt:number; fenceToken:string }) {
    if (!socketPath || watchers.has(targetOperationId)) return;
    let busy = false;
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        try {
          await lease.withLease(ref, "admission", async ({context,task}) => {
            if (context.userId!==scope.userId || context.accountId!==scope.accountId || task.id!==scope.taskId ||
              task.attempt!==scope.attempt || task.fenceToken!==scope.fenceToken) throw new NativeFileError("STALE_LEASE",false);
          });
        } catch {
          // The exact admitted operation may be cancelled after its lease is
          // revoked. No new model action or account scope is accepted here.
          try {
            const cancelId=randomUUID();
            await send(socketPath, {operationId:cancelId,scope,action:{kind:"command_cancel",targetOperationId}}, cancelId, true);
            stopWatching(targetOperationId);
          } catch { /* Retry until the native bridge closes or acknowledges. */ }
          return;
        }
        try {
          const statusId=randomUUID();
          const check = await send(socketPath, {operationId:statusId,scope,action:{kind:"command_status",targetOperationId}}, statusId, false);
          if (check && typeof check==="object" && "state" in check && check.state!=="running") stopWatching(targetOperationId);
        } catch (error) {
          if (error instanceof NativeFileError && error.code==="INVALID_COMMAND") stopWatching(targetOperationId);
        }
      } finally { busy = false; }
    }, 500);
    timer.unref();
    watchers.set(targetOperationId,timer);
  }
  async function invoke(ref: ExecutionRef, operationId: string, action: NativeFileAction | NativeCommandAction,
    onVerified?: (scope:{userId:string;accountId:string;taskId:string;attempt:number;fenceToken:string})=>void): Promise<unknown> {
    if (platform !== "darwin" && platform !== "win32") throw new NativeFileError("UNSUPPORTED_PLATFORM", false);
    if (platform === "win32" && action.kind.startsWith("command_"))
      throw new NativeFileError("UNSUPPORTED_PLATFORM", false);
    if (!desktop || !socketPath) throw new NativeFileError("NATIVE_UNAVAILABLE", false);
    if (!operationId || operationId.length > 160 || /[\x00-\x1f]/.test(operationId)) {
      throw new NativeFileError("INVALID_OPERATION_ID", false);
    }
    if ("targetOperationId" in action && (!action.targetOperationId || action.targetOperationId.length > 160 || /[\x00-\x1f/\\]/.test(action.targetOperationId))) {
      throw new NativeFileError("INVALID_OPERATION_ID", false);
    }
    const verified=await lease.withLease(ref, "admission", async ({ context, task }) => {
      if (!task.fenceToken || task.id !== ref.executionTaskId || task.attempt !== ref.attempt || task.fenceToken !== ref.fenceToken) {
        throw new NativeFileError("STALE_LEASE", false);
      }
      const scope={ userId: context.userId, accountId: context.accountId,
        taskId: task.id, attempt: task.attempt, fenceToken: task.fenceToken };
      return scope;
    });
    onVerified?.(verified);
    const mutating=action.kind === "write" || action.kind === "command_run" || action.kind === "command_cancel";
    const value=await send(socketPath, {operationId,scope:verified,action}, operationId, mutating);
    try {
      await lease.withLease(ref,"admission",async({context,task})=>{
        if(context.userId!==verified.userId || context.accountId!==verified.accountId || task.id!==verified.taskId ||
          task.attempt!==verified.attempt || task.fenceToken!==verified.fenceToken)throw new NativeFileError("STALE_LEASE",true);
      });
    } catch(error) {
      // A write/process may have committed after its lease stopped. Preserve the
      // original operation for reconciliation instead of reporting false success.
      if(mutating)throw new NativeFileError("NATIVE_RESULT_UNKNOWN",true);
      if(error instanceof NativeFileError)throw error;
      throw new NativeFileError("STALE_LEASE",true);
    }
    return value;
  }
  return {
    file: (ref: ExecutionRef, operationId: string, action: NativeFileAction) => invoke(ref, operationId, action),
    async command(ref: ExecutionRef, operationId: string, action: NativeCommandAction) {
      let verified: {userId:string;accountId:string;taskId:string;attempt:number;fenceToken:string}|undefined;
      try {
        const value=await invoke(ref,operationId,action,scope=>{verified=scope;});
        if (action.kind==="command_run" && verified && value && typeof value==="object" && "state" in value && value.state==="running")
          watch(ref,operationId,verified);
        if (action.kind==="command_cancel") stopWatching(action.targetOperationId);
        if (action.kind==="command_status" && value && typeof value==="object" && "state" in value && value.state!=="running")
          stopWatching(action.targetOperationId);
        return value;
      } catch(error) {
        if (action.kind==="command_run" && verified && error instanceof NativeFileError &&
            error.dispatched && error.code==="NATIVE_RESULT_UNKNOWN") watch(ref,operationId,verified);
        throw error;
      }
    },
  };
}
