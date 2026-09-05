import { spawnSync } from "node:child_process";
import { existsSync,mkdirSync,copyFileSync } from "node:fs";
import { join,dirname } from "node:path";
export function assertExecutionWorkerRuntime(runtimeRoot){
  const entry=join(runtimeRoot,"frontend/runtime/execution-worker.cjs");
  if(!existsSync(entry))throw new Error("独立执行Worker未进入安装包，请重新构建运行时");
  return entry;
}
export function stageExecutionWorkerRuntime({repoRoot,runtimeRoot}){
  const result=spawnSync(process.execPath,[join(repoRoot,"ai-worker/scripts/build.mjs")],{cwd:repoRoot,stdio:"pipe"});
  if(result.status!==0)throw new Error("执行Worker构建失败");
  const target=join(runtimeRoot,"frontend/runtime/execution-worker.cjs");
  mkdirSync(dirname(target),{recursive:true});copyFileSync(join(repoRoot,"ai-worker/dist/execution-worker.cjs"),target);
  return assertExecutionWorkerRuntime(runtimeRoot);
}
