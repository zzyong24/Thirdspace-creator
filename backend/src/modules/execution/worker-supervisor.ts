import { fork, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { workerMessageSchema, workerPortInputSchemas, sameExecution, type ExecutionRef, type HostMessage, type WorkerPort } from "@creatoros/contract/execution-worker";
import { buildChildEnv } from "./child-env";

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
}

/** 监督单执行进程。重排队/恢复由后端持久调度器决定，本层不重放任务。 */
export function createWorkerSupervisor(options: WorkerSupervisorOptions) {
  let child: ChildProcess | undefined;
  let ready: Promise<string[]> | undefined;
  let stopping = false;
  let current: {execution: ExecutionRef; resolve(reason: string): void; reject(error: Error): void; lastSeq: number; cancelTimer?: ReturnType<typeof setTimeout>; deadlineTimer?: ReturnType<typeof setTimeout>} | undefined;
  const replies = new Map<string, Promise<HostMessage>>();
  const clearRun = () => {
    if (current?.cancelTimer) clearTimeout(current.cancelTimer);
    if (current?.deadlineTimer) clearTimeout(current.deadlineTimer);
    current = undefined;
    replies.clear();
  };
  const send = (message: HostMessage) => {
    if (!child?.connected) throw new Error("WORKER_DISCONNECTED");
    const handle = child;
    handle.send(message, error => {if (error) handle.kill();});
  };
  const cancel = (execution: ExecutionRef) => {
    if (!current || !sameExecution(current.execution, execution)) return;
    send({version: 1, requestId: randomUUID(), type: "cancel", execution});
    if (!current.cancelTimer) current.cancelTimer = setTimeout(() => child?.kill("SIGKILL"), options.shutdownGraceMs ?? 5000);
  };
  const start = (): Promise<string[]> => {
    if (ready) return ready;
    stopping = false;
    const processHandle = fork(options.entryPath, [], {env: buildChildEnv(), execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"]});
    child = processHandle;
    ready = new Promise((resolve, reject) => {
      const startupTimer = setTimeout(() => {reject(new Error("WORKER_START_TIMEOUT")); processHandle.kill("SIGKILL");}, 15000);
      processHandle.on("error", () => {clearTimeout(startupTimer); reject(new Error("WORKER_START_FAILED"));});
      processHandle.on("exit", () => {
        clearTimeout(startupTimer);
        reject(new Error("WORKER_EXITED"));
        current?.reject(new Error(stopping ? "WORKER_STOPPED" : "WORKER_EXITED"));
        clearRun(); ready = undefined; child = undefined;
      });
      processHandle.on("message", raw => {
        const parsed = workerMessageSchema.safeParse(raw);
        if (!parsed.success) return;
        const message = parsed.data;
        if (message.type === "ready") {clearTimeout(startupTimer); resolve(message.capabilities); return;}
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
              const settlement = message.port === "settleCall" || message.port === "acknowledgeControl";
              await options.ports.validate(message.execution, settlement ? "settlement" : "admission");
              // 校验期间可能取消/换租约；本地控制也必须再次检查。
              if (!current || !sameExecution(current.execution, message.execution) || (!settlement && current.cancelTimer)) throw new Error("STALE_EXECUTION");
              const data = await options.ports.invoke(message.execution, message.port, input);
              return {version: 1, type: "reply", requestId: message.requestId, ok: true, data};
            } catch {return {version: 1, type: "reply", requestId: message.requestId, ok: false, errorCode: "HOST_PORT_REJECTED"};}
          })();
          replies.set(message.requestId, reply);
        }
        void reply.then(response => {
          if (processHandle.connected) processHandle.send(response, error => {if (error) processHandle.kill();});
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
        current = {execution, resolve, reject, lastSeq: -1};
        current.deadlineTimer = setTimeout(() => cancel(execution), Math.max(0, deadlineAt-Date.now()));
        try {send({version: 1, type: "run", requestId: randomUUID(), execution, deadlineAt});}
        catch {clearRun(); reject(new Error("WORKER_DISCONNECTED"));}
      });
    },
    cancel,
    async stop() {
      stopping = true;
      const handle = child;
      if (!handle) return;
      const exited = new Promise<void>(resolve => handle.once("exit", () => resolve()));
      handle.kill("SIGTERM");
      const killTimer = setTimeout(() => handle.kill("SIGKILL"), options.shutdownGraceMs ?? 5000);
      await exited;
      clearTimeout(killTimer);
    },
  };
}
