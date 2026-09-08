import { spawnSync } from "node:child_process";
import { existsSync,mkdirSync,copyFileSync,realpathSync } from "node:fs";
import { join,dirname,relative,isAbsolute } from "node:path";
import { createRequire } from "node:module";
export const workerExternalPackages = ["jsdom", "@mozilla/readability", "mammoth"];
const workerEntries=["execution-worker.cjs","agentic-worker.cjs","intelligence-generation-worker.cjs","intelligence-transcript-worker.cjs","embedding-worker.cjs","flywheel-generation-worker.cjs","model-probe-worker.cjs"];
export function assertExecutionWorkerRuntime(runtimeRoot){
  const entry=join(runtimeRoot,"frontend/runtime/execution-worker.cjs");
  for(const filename of workerEntries){
    if(!existsSync(join(runtimeRoot,"frontend/runtime",filename)))throw new Error(`独立执行Worker ${filename} 未进入安装包，请重新构建运行时`);
  }
  return entry;
}
export function stageExecutionWorkerRuntime({repoRoot,runtimeRoot}){
  const result=spawnSync(process.execPath,[join(repoRoot,"ai-worker/scripts/build.mjs")],{cwd:repoRoot,stdio:"pipe"});
  if(result.status!==0)throw new Error("执行Worker构建失败");
  for(const filename of workerEntries){
    const target=join(runtimeRoot,"frontend/runtime",filename);
    mkdirSync(dirname(target),{recursive:true});copyFileSync(join(repoRoot,"ai-worker/dist",filename),target);
  }
  return assertExecutionWorkerRuntime(runtimeRoot);
}

/** 只解析依赖，不执行解析器；拒绝借构建机祖先 node_modules 假装随包齐全。 */
export function assertWorkerExternalPackages(runtimeRoot) {
  const root = realpathSync(runtimeRoot);
  const requireFromWorker = createRequire(join(root, "frontend/runtime/execution-worker.cjs"));
  for (const name of workerExternalPackages) {
    const resolved = realpathSync(requireFromWorker.resolve(name));
    const local = relative(root, resolved);
    if (local === ".." || local.startsWith("../") || local.startsWith("..\\") || isAbsolute(local)) {
      throw new Error(`Worker 依赖 ${name} 解析到了随包目录之外`);
    }
  }
}
