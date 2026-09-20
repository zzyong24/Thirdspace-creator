import "server-only";
import type { Db } from "@creatoros/backend";
import { createExecutionLeaseService } from "@creatoros/backend/modules/execution";
import type { ChatProductionCompositionDeps } from "@creatoros/backend/modules/ai-runtime";
import {
  workbenchCapabilitySchema, workbenchFileRequestSchema, workbenchHostCallSchema,
  workbenchResultSchema, type WorkbenchResult,
} from "@creatoros/contract/agent-workbench";
import type { ExecutionRef } from "@creatoros/contract/execution-worker";
import { createWorkbenchNativeClient, NativeFileError, type NativeFileAction } from "./workbench-native-client";

type Host = NonNullable<ChatProductionCompositionDeps["workbenchHost"]>;
type FilePort = (ref: ExecutionRef, operationId: string, action: NativeFileAction) => Promise<unknown>;

const path = { type: "string", minLength: 1, maxLength: 2048 };
const content = { type: "string", maxLength: 1_000_000 };
const descriptor = (name: string, effect: "read" | "task_write", properties: Record<string, unknown>, required: string[]) =>
  workbenchCapabilitySchema.parse({
    name, schemaVersion: 1, description: {
      "files.list": "列出当前任务工作目录中的文件或子目录。",
      "files.read": "分页读取当前任务文件；文本返回原文及文件版本。",
      "files.stat": "读取当前任务文件的类型、大小和版本。",
      "files.write": "在当前任务目录新建或更新文件；已有文件须传 expectedVersion。",
      "files.edit": "按 expectedVersion 修改当前任务文件，冲突时返回当前版本。",
    }[name],
    inputSchema: { type: "object", properties, required, additionalProperties: false },
    resultSchema: { type: "object" }, effects: [effect], requiredCapabilities: ["task.files"], platforms: ["macos"],
  });

export const nativeFileCapabilities = [
  descriptor("files.list", "read", { path }, []),
  descriptor("files.read", "read", { path, offset: {type:"integer",minimum:0}, limit: {type:"integer",minimum:1,maximum:128_000} }, ["path"]),
  descriptor("files.stat", "read", { path }, ["path"]),
  descriptor("files.write", "task_write", { path, content, expectedVersion: {type:"integer",minimum:0} }, ["path", "content"]),
  descriptor("files.edit", "task_write", { path, content, expectedVersion: {type:"integer",minimum:0} }, ["path", "content", "expectedVersion"]),
] as const;

function result(operationId: string, value: unknown): WorkbenchResult {
  return workbenchResultSchema.parse({
    operationId, status: "succeeded", artifactRefs: [], progressCursor: null,
    content: [{type:"text",text:JSON.stringify(value??null)}],
  });
}

function errorResult(operationId: string, action: NativeFileAction, error: unknown): WorkbenchResult {
  if (!(error instanceof NativeFileError)) throw error;
  const read = action.kind !== "write";
  const conflict = error.code === "VERSION_CONFLICT";
  const invalid = ["INVALID_PATH", "TOO_LARGE", "INVALID_REQUEST", "INVALID_CONTEXT", "INVALID_OPERATION_ID"].includes(error.code);
  const unavailable = ["NATIVE_UNAVAILABLE", "UNSUPPORTED_PLATFORM", "UNAUTHORIZED_PEER", "STALE_LEASE"].includes(error.code);
  const unknown = !read && !conflict && !invalid && !unavailable && error.dispatched;
  const code = conflict && Number.isSafeInteger(error.currentVersion)
    ? `version_conflict:${error.currentVersion}` : error.code.toLowerCase();
  return workbenchResultSchema.parse({
    operationId, status: unknown ? "unknown" : "failed", artifactRefs: [], progressCursor: null,
    error: {code, dispatched:unknown, retryable:read && !invalid && !unavailable && !conflict,
      nextAction:unknown?"reconcile":invalid || conflict?"fix_input":unavailable?"contact_support":"retry"},
  });
}

function invalidInputResult(operationId: string): WorkbenchResult {
  return workbenchResultSchema.parse({operationId,status:"failed",artifactRefs:[],progressCursor:null,
    error:{code:"invalid_input",retryable:false,dispatched:false,nextAction:"fix_input"}});
}

function projectRead(value: unknown) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const page = value as Record<string, unknown>;
  if (typeof page.contentBase64 !== "string") return value;
  const bytes = Buffer.from(page.contentBase64, "base64");
  try {
    return { text: new TextDecoder("utf-8", {fatal:true}).decode(bytes), total:page.total, version:page.version, encoding:"utf8" };
  } catch {
    return { contentBase64:page.contentBase64, total:page.total, version:page.version, encoding:"base64" };
  }
}

/** Only a running macOS desktop with a private native socket advertises files. */
export function createNativeFilesWorkbenchHost(db: Db, options: {
  now?: () => string;
  platform?: NodeJS.Platform;
  desktop?: boolean;
  socketPath?: string;
  filePort?: FilePort;
} = {}): Host | undefined {
  const platform = options.platform ?? process.platform;
  const desktop = options.desktop ?? process.env.CREATOROS_DESKTOP === "1";
  const socketPath = options.socketPath ?? process.env.CREATOROS_WORKBENCH_SOCKET;
  if (platform !== "darwin" || !desktop || !socketPath) return undefined;
  const leases=createExecutionLeaseService(db,{now:options.now});
  const native = options.filePort ?? createWorkbenchNativeClient({
    withLease:(ref,mode,action)=>leases.withLease(ref,mode,async ({task,context})=>{
      if (!context.accountId || context.accountId!==task.accountId) throw new NativeFileError("ACCOUNT_SCOPE_INVALID",false);
      return action({context:{userId:context.userId,accountId:context.accountId},task});
    }),
  },{platform,desktop,socketPath}).file;
  return {
    catalog: nativeFileCapabilities, platform:"macos", capabilities:["task.files"],
    async dispatch(rawCall, {signal}) {
      signal.throwIfAborted();
      const call = workbenchHostCallSchema.parse(rawCall);
      const operation = call.invocation.name.split(".")[1];
      if (!nativeFileCapabilities.some(capability=>capability.name===call.invocation.name)) throw new Error("NATIVE_FILE_CAPABILITY_UNAVAILABLE");
      if (Object.hasOwn(call.invocation.input,"operation")) return invalidInputResult(call.context.operationId);
      const parsed=workbenchFileRequestSchema.safeParse({...call.invocation.input,operation});
      if (!parsed.success) return invalidInputResult(call.context.operationId);
      const request=parsed.data;
      const action: NativeFileAction = request.operation === "list" ? {kind:"list",...(request.path?{path:request.path}:{})}
        : request.operation === "read" ? {kind:"read",path:request.path,offset:request.offset??0,limit:Math.min(request.limit??32_000,128_000)}
        : request.operation === "stat" ? {kind:"stat",path:request.path}
        : {kind:"write",path:request.path,contentBase64:Buffer.from(request.content,"utf8").toString("base64"),expectedVersion:request.expectedVersion??0};
      try {
        const value = await native({executionTaskId:call.context.taskId,attempt:call.context.attempt,fenceToken:call.context.fenceToken},call.context.operationId,action);
        signal.throwIfAborted();
        return result(call.context.operationId,request.operation==="read"?projectRead(value):value);
      } catch (error) {
        if (signal.aborted) throw error;
        return errorResult(call.context.operationId,action,error);
      }
    },
  };
}
