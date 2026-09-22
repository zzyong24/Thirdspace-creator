import {workbenchResultSchema,type WorkbenchResult} from "@creatoros/contract/agent-workbench";

// SEMANTIC_BOUNDARY_ALLOW: 只解释宿主已有路径/运行时协议，不判断脚本意图，不改写 argv。
const commandGuidance =
 'cwd 必须是任务目录内的相对路径，任务根用 "."；不能传 "/"、宿主绝对路径或越出任务目录。' +
 'runtimeId="bundled-node" 已选择 Node 解释器，argv 只传脚本及其参数，例如 ["verify-report.js"] 或 ["-e","console.log(42)"]，不需要再加 node 前缀。' +
 'runtimeId="bundled-python" 同样已选择 Python 解释器，argv 传脚本及参数。若任务文件本来就名为 node，它仍是合法脚本名，按真实文件名传入。' +
 'stdinRef 只指定标准输入文件，不用于选择要执行的脚本。approved-program 仅能使用已批准程序，不是任意程序或 shell 的替代入口。' +
 '命令是否完成以及是否成功，请核对原 operationId 的 execution.status、exitCode 和 execution.read 输出。';

/** 仅用于本地 schema 校验已拒绝、尚未调用 native 的新 execution.run。 */
export function commandRunInvalidInput(operationId:string):WorkbenchResult {
 return workbenchResultSchema.parse({operationId,status:"failed",artifactRefs:[],progressCursor:null,
  error:{code:"invalid_input",retryable:false,dispatched:false,nextAction:"fix_input",
   recovery:'本次输入未通过校验，命令尚未派发。'+commandGuidance+
    '必填 argv 为 1–128 个字符串，cwd 为非空路径，runtimeId 为目录声明的枚举，timeoutMs 为 1–3600000 的整数；不要传未声明字段。'}});
}

/** 新 native run 回执追加指导，原状态、退出码、输出与操作身份保持原值。 */
export function projectCommandRunResult(value:unknown):unknown {
 if(value===null||typeof value!=="object"||Array.isArray(value))return value;
 return {...value,guidance:commandGuidance};
}
