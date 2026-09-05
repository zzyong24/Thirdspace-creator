import { existsSync } from "node:fs";
import { resolve } from "node:path";
/** 桌面包只认随包资源；开发/普通Web构建使用仓库生成物。 */
export function resolveExecutionWorkerPath(cwd=process.cwd(),desktop=process.env.CREATOROS_DESKTOP==="1"){
  const packaged=resolve(cwd,"runtime/execution-worker.cjs");
  if(existsSync(packaged))return packaged;
  const development=resolve(cwd,"../ai-worker/dist/execution-worker.cjs");
  if(!desktop && existsSync(development))return development;
  throw new Error("EXECUTION_WORKER_BUILD_MISSING");
}
