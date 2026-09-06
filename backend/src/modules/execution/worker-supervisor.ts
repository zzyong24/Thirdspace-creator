import { fork, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { workerMessageSchema, workerPortInputSchemas, sameExecution, type ExecutionRef, type HostMessage, type WorkerPort } from "@creatoros/contract/execution-worker";
import { buildChildEnv } from "./child-env";
import { killWorkerProcessTree } from "./worker-process-tree";

export interface WorkerSupervisorPorts {
  /** 必须重读持久执行租约和控制状态；settlement 仅允许结算已发生的调用。 */
  validate(execution: ExecutionRef, mode: "admission" | "settlement"): Promise<void>;
  /** 写端口须在自身事务内再次检查 fence/控制状态，不可依赖先前 validate 的快照。 */
  invoke(execution: ExecutionRef, port: WorkerPort, data: unknown): Promise<unknown>;
}
export interface WorkerSupervisorOptions {
  entryPath: string;
  ports: WorkerSupervisorPorts;
  onText?: (execution: ExecutionRef, text: string) => void;
  shutdownGraceMs?: number;
  startupTimeoutMs?: number;
}

/** 监督单执行进程。重排队/恢复由后端持久调度器决定，本层不重放任务。 */
export function createWorkerSupervisor(options: WorkerSupervisorOptions) {
  let child: ChildProcess | undefined;
  let ready: Promise<string[]> | undefined;
  let stopping = false;
  let current: {execution: ExecutionRef; resolve(reason: string): void; reject(error: Error): void; lastSeq: number; cancelTimer?: ReturnType<typeof setTimeout>; deadlineTimer?: ReturnType<typeof setTimeout>} | undefined;
  const replies = new Map<string, Promise<HostMessage>>();
  const cleanups = new Map<ChildProcess, Promise<void>>();
  let cleanupFailure: Error | undefined;
  const stoppedTrees = new WeakSet<ChildProcess>();
  const executionHandles = new Map<string, ChildProcess>();
  const latestExecution = new WeakMap<ChildProcess, string>();
  const executionKey = (ref: ExecutionRef) => JSON.stringify([ref.executionTaskId, ref.attempt, ref.fenceToken]);
  const forceStop = (handle: ChildProcess) => {
    if (stoppedTrees.has(handle)) return Promise.resolve();
    let pending = cleanups.get(handle);
    if (!pending) {
      pending = killWorkerProcessTree(handle).then(() => { stoppedTrees.add(handle); });
      cleanups.set(handle, pending);
      void pending.catch(error => {
        cleanupFailure = error instanceof Error ? error : new Error("WORKER_TREE_CLEANUP_FAILED");
        if (child === handle) current?.reject(cleanupFailure);
      }).finally(() => cleanups.delete(handle));
    }
    return pending;
  };
  const clearRun = () => {
    if (current?.cancelTimer) clearTimeout(current.cancelTimer);
    if (current?.deadlineTimer) clearTimeout(current.deadlineTimer);
    current = undefined;
    replies.clear();
  };
  const send = (message: HostMessage) => {
    if (!child?.connected) throw new Error("WORKER_DISCONNECTED");
    const handle = child;
    handle.send(message, error => {if (error && child === handle) void forceStop(handle).catch(() => {});});
  };
  const cancel = (execution: ExecutionRef) => {
    if (!current || !sameExecution(current.execution, execution)) return;
    send({version: 1, requestId: randomUUID(), type: "cancel", execution});
    const handle = child!;
    const run = current;
    if (!current.cancelTimer) current.cancelTimer = setTimeout(() => {
      if (child === handle && current === run) void forceStop(handle).catch(() => {});
    }, options.shutdownGraceMs ?? 5000);
  };
  const start = (): Promise<string[]> => {
    if (cleanupFailure) return Promise.reject(cleanupFailure);
    if (cleanups.size) return Promise.all([...cleanups.values()]).then(() => start());
    if (ready) return ready;
    stopping = false;
    const processHandle = fork(options.entryPath, [], {env: buildChildEnv(), execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"]});
    child = processHandle;
    ready = new Promise((resolve, reject) => {
      let startupTimedOut = false;
      const startupTimer = setTimeout(() => {
        startupTimedOut = true;
        void forceStop(processHandle).then(() => reject(new Error("WORKER_START_TIMEOUT")), reject);
      }, options.startupTimeoutMs ?? 15000);
      processHandle.on("error", () => {clearTimeout(startupTimer); reject(new Error("WORKER_START_FAILED"));});
      processHandle.on("exit", () => {
        clearTimeout(startupTimer);
        if (!startupTimedOut) reject(new Error("WORKER_EXITED"));
        if (child !== processHandle) return;
        current?.reject(new Error(stopping ? "WORKER_STOPPED" : "WORKER_EXITED"));
        clearRun(); ready = undefined; child = undefined;
      });
      processHandle.on("message", raw => {
        if (child !== processHandle) return;
        const parsed = workerMessageSchema.safeParse(raw);
        if (!parsed.success) return;
        const message = parsed.data;
        if (message.type === "ready") {if (startupTimedOut) return; clearTimeout(startupTimer); resolve(message.capabilities); return;}
        if (!current || !sameExecution(current.execution, message.execution)) return;
        if (message.type === "progress") {
          if (message.seq > current.lastSeq && !current.cancelTimer) {
            current.lastSeq = message.seq;
            try {options.onText?.(message.execution, message.text);} catch {/* 订阅者故障不改变持久执行。 */}
          }
          return;
        }
        if (message.type === "stopped") {current.resolve(message.reason); clearRun(); return;}
        let reply = replies.get(message.requestId);
        if (!reply) {
          reply = (async (): Promise<HostMessage> => {
            try {
              const input = workerPortInputSchemas[message.port].parse(message.data);
              const settlement = message.port === "settleChatResearch" || message.port === "failChatGeneration" || message.port === "settleChatGenerationModel" || message.port === "failChatHooks" || message.port === "settleChatHooksModel" || message.port === "commitChatResult" || message.port === "appendStreamEvents" || message.port === "settleTopicRead" || message.port === "settleCall" || message.port === "settleGenerationCall" || message.port === "settleAgenticTool" || message.port === "settleResearchRead" || message.port === "settleBrowserObservation" || message.port === "acknowledgeControl";
              await options.ports.validate(message.execution, settlement ? "settlement" : "admission");
              // 校验期间可能取消/换租约；本地控制也必须再次检查。
              if (!current || !sameExecution(current.execution, message.execution) || (!settlement && current.cancelTimer)) throw new Error("STALE_EXECUTION");
              const data = await options.ports.invoke(message.execution, message.port, input);
              return {version: 1, type: "reply", requestId: message.requestId, ok: true, data};
            } catch(error) {
              const code=error && typeof error === "object" ? (error as {code?:unknown}).code : undefined;
              const errorCode=message.port==="reserveTopicRead" && error && typeof error==="object" && (error as {budgetCode?:unknown}).budgetCode==="EXECUTION_BUDGET_EXHAUSTED" ? "EXECUTION_BUDGET_EXHAUSTED" : message.port==="resolveModelCredential" && typeof code === "string" && ["MODEL_AUTHORITY_CHANGED","MODEL_CREDENTIAL_UNAVAILABLE"].includes(code) ? code : "HOST_PORT_REJECTED";
              return {version:1,type:"reply",requestId:message.requestId,ok:false,errorCode};
            }
          })();
          replies.set(message.requestId, reply);
        }
        void reply.then(response => {
          if (processHandle.connected) processHandle.send(response, error => {if (error && child === processHandle) void forceStop(processHandle).catch(() => {});});
        });
      });
    });
    return ready;
  };
  return {
    start,
    async run(execution: ExecutionRef, deadlineAt: number): Promise<string> {
      await start();
      if (stopping) throw new Error("WORKER_STOPPED");
      if (current) throw new Error("WORKER_BUSY");
      await options.ports.validate(execution, "admission");
      if (stopping) throw new Error("WORKER_STOPPED");
      if (current) throw new Error("WORKER_BUSY");
      if (Date.now() >= deadlineAt) throw new Error("EXECUTION_DEADLINE");
      return new Promise((resolve, reject) => {
        const boundExecution = {...execution};
        const handle = child;
        if (!handle) { reject(new Error("WORKER_DISCONNECTED")); return; }
        const bindingKey = executionKey(boundExecution);
        executionHandles.delete(bindingKey);
        executionHandles.set(bindingKey, handle);
        latestExecution.set(handle, bindingKey);
        while (executionHandles.size > 256) executionHandles.delete(executionHandles.keys().next().value!);
        current = {execution:boundExecution, resolve, reject, lastSeq: -1};
        current.deadlineTimer = setTimeout(() => cancel(boundExecution), Math.max(0, deadlineAt-Date.now()));
        try {send({version: 1, type: "run", requestId: randomUUID(), execution: boundExecution, deadlineAt});}
        catch {clearRun(); reject(new Error("WORKER_DISCONNECTED"));}
      });
    },
    cancel,
    /** 证明仅来自宿主ChildProcess整树清理；Worker的stopped/自然exit均不是资源释放证据。 */
    async stopExecutionTree(execution: ExecutionRef): Promise<boolean> {
      const bindingKey = executionKey(execution);
      const handle = executionHandles.get(bindingKey);
      if (!handle) return false;
      if (stoppedTrees.has(handle)) return true;
      if (latestExecution.get(handle) !== bindingKey) return false;
      const pending = cleanups.get(handle);
      if (pending) {
        try { await pending; return stoppedTrees.has(handle); }
        catch { return false; }
      }
      if (handle.exitCode !== null || handle.signalCode !== null || !handle.pid) return false;
      if (child !== handle) return false;
      // 同步阻止 startup/validate 窗口继续复用此 handle，然后直接冻结并清理后代。
      stopping = true;
      try { await forceStop(handle); return stoppedTrees.has(handle); }
      catch { return false; }
    },
    async stop() {
      stopping = true;
      const handle = child;
      if (!handle) { await Promise.all([...cleanups.values()]); if (cleanupFailure) throw cleanupFailure; return; }
      const exited = new Promise<void>(resolve => handle.once("exit", () => resolve()));
      handle.kill("SIGTERM");
      let rejectCleanup!: (error: Error) => void;
      const failed = new Promise<never>((_resolve, reject) => { rejectCleanup = reject; });
      let cleanup: Promise<void> | undefined;
      const killTimer = setTimeout(() => { cleanup = forceStop(handle); void cleanup.catch(rejectCleanup); }, options.shutdownGraceMs ?? 5000);
      try { await Promise.race([exited, failed]); await cleanup; await Promise.all([...cleanups.values()]); if (cleanupFailure) throw cleanupFailure; }
      finally { clearTimeout(killTimer); }
    },
  };
}
