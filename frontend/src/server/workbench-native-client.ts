import "server-only";
import { createConnection } from "node:net";
import type { ExecutionRef } from "@creatoros/contract/execution-worker";

export type NativeFileAction =
  | { kind: "list"; path?: string }
  | { kind: "read"; path: string; offset: number; limit: number }
  | { kind: "stat"; path: string }
  | { kind: "write"; path: string; contentBase64: string; expectedVersion: number };

type VerifiedScope = {
  context: { userId: string; accountId: string };
  task: { id: string; attempt: number; fenceToken: string | null };
};

/** Pass createExecutionLeaseService(db).withLease. Its row lock spans the socket round trip. */
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
 * execution row and holds its transaction lock until Rust returns. Never pass
 * identity from a model action, HTTP body, or WebView state.
 */
export function createWorkbenchNativeClient(lease: NativeLeasePort, options: {
  platform?: NodeJS.Platform;
  desktop?: boolean;
  socketPath?: string;
} = {}) {
  const platform = options.platform ?? process.platform;
  const desktop = options.desktop ?? process.env.CREATOROS_DESKTOP === "1";
  const socketPath = options.socketPath ?? process.env.CREATOROS_WORKBENCH_SOCKET;
  return {
    async file(ref: ExecutionRef, operationId: string, action: NativeFileAction): Promise<unknown> {
      if (platform !== "darwin") throw new NativeFileError("UNSUPPORTED_PLATFORM", false);
      if (!desktop || !socketPath) throw new NativeFileError("NATIVE_UNAVAILABLE", false);
      if (!operationId || operationId.length > 160 || /[\x00-\x1f]/.test(operationId)) {
        throw new NativeFileError("INVALID_OPERATION_ID", false);
      }
      return lease.withLease(ref, "admission", async ({ context, task }) => {
        if (!task.fenceToken || task.id !== ref.executionTaskId || task.attempt !== ref.attempt || task.fenceToken !== ref.fenceToken) {
          throw new NativeFileError("STALE_LEASE", false);
        }
        return send(socketPath, {
          operationId,
          scope: { userId: context.userId, accountId: context.accountId,
            taskId: task.id, attempt: task.attempt, fenceToken: task.fenceToken },
          action,
        }, operationId, action.kind === "write");
      });
    },
  };
}
