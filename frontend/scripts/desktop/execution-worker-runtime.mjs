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
export function assertWorkerExternalPackages(runtimeRoot, { buildOnly = process.env.CREATOROS_PACKAGE_BUILD_ONLY === "1", run = spawnSync } = {}) {
  // build-only只负责组装；额外真加载探针由验证流程运行，所有消费者统一遵守。
  if (buildOnly) return;
  const root = realpathSync(runtimeRoot);
  const resolver = join(root,"frontend/creatoros-module-resolver.cjs");
  if (existsSync(resolver)) {
    // 分层安装包沿用实际解析器，不能用构建机node_modules判断随包完整性。
    // prepare步骤把主Node移交Tauri，保留的CLI Node也是同一随包二进制。
    const node = process.platform === "win32"
      ? [join(root,"cli/node.exe"),join(root,"layers/core/bin/creatoros-server.exe")].find(existsSync)
      : process.execPath;
    if(!node) throw new Error("Worker分层依赖验证失败: 缺少随包Node");
    const check = `const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
      const root=fs.realpathSync(process.argv[1]),req=createRequire(path.join(root,'frontend/runtime/execution-worker.cjs'));
      for(const name of JSON.parse(process.argv[2])) {
        const local=path.relative(root,fs.realpathSync(req.resolve(name)));
        if(local==='..'||local.startsWith('../')||local.startsWith('..\\\\')||path.isAbsolute(local))throw new Error('Worker依赖解析到包外:'+name);
      }`;
    const result=run(node,["--require",resolver,"-e",check,root,JSON.stringify(workerExternalPackages)],{
      cwd:root,encoding:"utf8",timeout:120_000,
      env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,CREATOROS_RUNTIME_ROOT:root},
    });
    if(result.error || result.status!==0) throw new Error(`Worker分层依赖验证失败: ${result.error?.message ?? result.stderr}`);
    return;
  }
  const requireFromWorker = createRequire(join(root, "frontend/runtime/execution-worker.cjs"));
  for (const name of workerExternalPackages) {
    const resolved = realpathSync(requireFromWorker.resolve(name));
    const local = relative(root, resolved);
    if (local === ".." || local.startsWith("../") || local.startsWith("..\\") || isAbsolute(local)) {
      throw new Error(`Worker 依赖 ${name} 解析到了随包目录之外`);
    }
  }
}
