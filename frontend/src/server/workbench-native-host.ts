import "server-only";
import type { Db } from "@creatoros/backend";
import { createExecutionLeaseService } from "@creatoros/backend/modules/execution";
import type { ChatProductionCompositionDeps } from "@creatoros/backend/modules/ai-runtime";
import {
  workbenchCapabilitySchema, workbenchFileRequestSchema, workbenchCommandRequestSchema, workbenchHostCallSchema,
  workbenchResultSchema, type WorkbenchResult,
} from "@creatoros/contract/agent-workbench";
import type { ExecutionRef } from "@creatoros/contract/execution-worker";
import { createWorkbenchNativeClient, NativeFileError, type NativeFileAction, type NativeCommandAction } from "./workbench-native-client";

type Host = NonNullable<ChatProductionCompositionDeps["workbenchHost"]>;
type FilePort = (ref: ExecutionRef, operationId: string, action: NativeFileAction) => Promise<unknown>;
type CommandPort = (ref: ExecutionRef, operationId: string, action: NativeCommandAction) => Promise<unknown>;

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
    resultSchema: { type: "object" }, effects: [effect], requiredCapabilities: ["task.files"], platforms: ["macos", "windows"],
  });

export const nativeFileCapabilities = [
  descriptor("files.list", "read", { path }, []),
  descriptor("files.read", "read", { path, offset: {type:"integer",minimum:0}, limit: {type:"integer",minimum:1,maximum:128_000} }, ["path"]),
  descriptor("files.stat", "read", { path }, ["path"]),
  descriptor("files.write", "task_write", { path, content, expectedVersion: {type:"integer",minimum:0} }, ["path", "content"]),
  descriptor("files.edit", "task_write", { path, content, expectedVersion: {type:"integer",minimum:0} }, ["path", "content", "expectedVersion"]),
] as const;

const operationId = {type:"string",minLength:1,maxLength:160};
const commandDescriptor = (name:string, effect:"read"|"process", properties:Record<string,unknown>, required:string[]) =>
  workbenchCapabilitySchema.parse({name,schemaVersion:1,description:{
    "execution.run":"在当前任务目录以已打包运行时和受限环境启动命令，返回原操作 ID 与输出引用。",
    "execution.status":"查询本任务内命令的运行状态、退出码和输出预览。",
    "execution.cancel":"取消本任务内指定命令及其进程树。",
    "execution.read":"分页回读本任务内命令的 stdout 或 stderr。",
  }[name],inputSchema:{type:"object",properties,required,additionalProperties:false},resultSchema:{type:"object"},
    effects:[effect],requiredCapabilities:["task.command"],platforms:["macos"]});

export const nativeCommandCapabilities = [
  commandDescriptor("execution.run","process",{argv:{type:"array",items:{type:"string",maxLength:8192},minItems:1,maxItems:128},cwd:path,
    runtimeId:{type:"string",enum:["bundled-node","bundled-python","approved-program"]},timeoutMs:{type:"integer",minimum:1,maximum:3_600_000},stdinRef:path},["argv","cwd","runtimeId","timeoutMs"]),
  commandDescriptor("execution.status","read",{targetOperationId:operationId},["targetOperationId"]),
  commandDescriptor("execution.cancel","process",{targetOperationId:operationId},["targetOperationId"]),
  commandDescriptor("execution.read","read",{targetOperationId:operationId,stream:{type:"string",enum:["stdout","stderr"]},offset:{type:"integer",minimum:0},limit:{type:"integer",minimum:1,maximum:512_000}},["targetOperationId","stream"]),
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

function commandErrorResult(operationId:string, action:NativeCommandAction, error:unknown):WorkbenchResult {
  if (!(error instanceof NativeFileError)) throw error;
  const known=["INVALID_COMMAND","INVALID_OPERATION_ID","WRONG_SCOPE","COMMAND_UNAVAILABLE","UNSUPPORTED_PLATFORM","STALE_LEASE","NATIVE_UNAVAILABLE","ACCOUNT_SCOPE_INVALID"].includes(error.code)
    || (action.kind==="command_run" && error.code==="COMMAND_IO_ERROR");
  const unknown=!known && (action.kind==="command_run" || action.kind==="command_cancel") && error.dispatched;
  return workbenchResultSchema.parse({operationId,status:unknown?"unknown":"failed",artifactRefs:[],progressCursor:null,
    error:{code:error.code.toLowerCase(),dispatched:unknown,retryable:action.kind==="command_status" || action.kind==="command_read",
      nextAction:unknown?"reconcile":known?"contact_support":"retry"}});
}

function projectRead(value: unknown) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const page = value as Record<string, unknown>;
  if (typeof page.contentBase64 !== "string") return value;
  const bytes = Buffer.from(page.contentBase64, "base64");
  const {contentBase64:_encoded,...metadata}=page;
  try {
    return { ...metadata, text: new TextDecoder("utf-8", {fatal:true}).decode(bytes), encoding:"utf8" };
  } catch {
    return { ...metadata, contentBase64:page.contentBase64, encoding:"base64" };
  }
}

/** Only a running desktop with a private native transport advertises files. */
export function createNativeFilesWorkbenchHost(db: Db, options: {
  now?: () => string;
  platform?: NodeJS.Platform;
  desktop?: boolean;
  socketPath?: string;
  filePort?: FilePort;
  commandPort?: CommandPort;
} = {}): Host | undefined {
  const platform = options.platform ?? process.platform;
  const desktop = options.desktop ?? process.env.CREATOROS_DESKTOP === "1";
  const socketPath = options.socketPath ?? process.env.CREATOROS_WORKBENCH_SOCKET;
  if ((platform !== "darwin" && platform !== "win32") || !desktop || !socketPath) return undefined;
  const leases=createExecutionLeaseService(db,{now:options.now});
  const nativeClient = createWorkbenchNativeClient({
    withLease:(ref,mode,action)=>leases.withLease(ref,mode,async ({task,context})=>{
      if (!context.accountId || context.accountId!==task.accountId) throw new NativeFileError("ACCOUNT_SCOPE_INVALID",false);
      return action({context:{userId:context.userId,accountId:context.accountId},task});
    }),
  },{platform,desktop,socketPath});
  const native = options.filePort ?? nativeClient.file;
  const nativeCommand = options.commandPort ?? nativeClient.command;
  return {
    catalog: platform === "darwin" ? [...nativeFileCapabilities,...nativeCommandCapabilities] : [...nativeFileCapabilities],
    platform: platform === "darwin" ? "macos" : "windows",
    capabilities: platform === "darwin" ? ["task.files","task.command"] : ["task.files"],
    async dispatch(rawCall, {signal}) {
      signal.throwIfAborted();
      const call = workbenchHostCallSchema.parse(rawCall);
      const ref={executionTaskId:call.context.taskId,attempt:call.context.attempt,fenceToken:call.context.fenceToken};
      if (platform === "darwin" && nativeCommandCapabilities.some(capability=>capability.name===call.invocation.name)) {
        const input=call.invocation.input;
        let action:NativeCommandAction;
        if (call.invocation.name==="execution.run") {
          const parsed=workbenchCommandRequestSchema.safeParse(input);
          if (!parsed.success) return invalidInputResult(call.context.operationId);
          action={kind:"command_run",argv:parsed.data.argv,cwd:parsed.data.cwd,runtimeId:parsed.data.runtimeId,
            timeoutMs:parsed.data.timeoutMs,...(parsed.data.stdinRef?{stdinRef:parsed.data.stdinRef}:{})};
        } else {
          const target=input.targetOperationId;
          if (typeof target!=="string" || !target || target.length>160 || /[\x00-\x1f/\\]/.test(target)) return invalidInputResult(call.context.operationId);
          if (call.invocation.name==="execution.read") {
            if (Object.keys(input).some(key=>!["targetOperationId","stream","offset","limit"].includes(key)) ||
              !["stdout","stderr"].includes(String(input.stream)) || !Number.isSafeInteger(input.offset??0) || Number(input.offset??0)<0 ||
              !Number.isSafeInteger(input.limit??32_000) || Number(input.limit??32_000)<1 || Number(input.limit??32_000)>512_000) return invalidInputResult(call.context.operationId);
            action={kind:"command_read",targetOperationId:target,stream:input.stream as "stdout"|"stderr",offset:Number(input.offset??0),limit:Number(input.limit??32_000)};
          } else {
            if (Object.keys(input).some(key=>key!=="targetOperationId")) return invalidInputResult(call.context.operationId);
            action={kind:call.invocation.name==="execution.cancel"?"command_cancel":"command_status",targetOperationId:target};
          }
        }
        try { const value=await nativeCommand(ref,call.context.operationId,action);
          signal.throwIfAborted();
          return result(call.context.operationId,action.kind==="command_read"?projectRead(value):value);
        } catch(error) { if (signal.aborted) throw error; return commandErrorResult(call.context.operationId,action,error); }
      }
      const operation = call.invocation.name.split(".")[1];
      if (!nativeFileCapabilities.some(capability=>capability.name===call.invocation.name)) throw new Error("NATIVE_FILE_CAPABILITY_UNAVAILABLE");
      if (Object.hasOwn(call.invocation.input,"operation")) return invalidInputResult(call.context.operationId);
      const fileInput:Record<string,unknown>={...call.invocation.input,operation};
      // SEMANTIC_BOUNDARY_ALLOW: list 的点路径只表示当前任务根，规范为省略路径；
      // 不扩展其他操作或父目录/绝对路径的权限，也不做内容选择。
      if(operation==="list" && fileInput.path===".")delete fileInput.path;
      const parsed=workbenchFileRequestSchema.safeParse(fileInput);
      if (!parsed.success) return invalidInputResult(call.context.operationId);
      const request=parsed.data;
      const action: NativeFileAction = request.operation === "list" ? {kind:"list",...(request.path?{path:request.path}:{})}
        : request.operation === "read" ? {kind:"read",path:request.path,offset:request.offset??0,limit:Math.min(request.limit??32_000,128_000)}
        : request.operation === "stat" ? {kind:"stat",path:request.path}
        : {kind:"write",path:request.path,contentBase64:Buffer.from(request.content,"utf8").toString("base64"),expectedVersion:request.expectedVersion??0};
      try {
        const value = await native(ref,call.context.operationId,action);
        signal.throwIfAborted();
        return result(call.context.operationId,request.operation==="read"?projectRead(value):value);
      } catch (error) {
        if (signal.aborted) throw error;
        return errorResult(call.context.operationId,action,error);
      }
    },
  };
}
