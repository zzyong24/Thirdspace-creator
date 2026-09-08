import { existsSync } from "node:fs";
import { resolve } from "node:path";
/** 桌面包只认随包资源；开发/普通Web构建使用仓库生成物。 */
function resolveWorkerPath(filename:string,errorCode:string,cwd:string,desktop:boolean){
  const packaged=resolve(cwd,"runtime",filename);
  if(existsSync(packaged))return packaged;
  const development=resolve(cwd,"../ai-worker/dist",filename);
  if(!desktop && existsSync(development))return development;
  throw new Error(errorCode);
}
export function resolveExecutionWorkerPath(cwd=process.cwd(),desktop=process.env.CREATOROS_DESKTOP==="1"){
  return resolveWorkerPath("execution-worker.cjs","EXECUTION_WORKER_BUILD_MISSING",cwd,desktop);
}
export function resolveAgenticWorkerPath(cwd=process.cwd(),desktop=process.env.CREATOROS_DESKTOP==="1"){
  return resolveWorkerPath("agentic-worker.cjs","AGENTIC_WORKER_BUILD_MISSING",cwd,desktop);
}

export function resolveIntelligenceGenerationWorkerPath(cwd=process.cwd(),desktop=process.env.CREATOROS_DESKTOP==="1"){
  return resolveWorkerPath("intelligence-generation-worker.cjs","INTELLIGENCE_GENERATION_WORKER_BUILD_MISSING",cwd,desktop);
}
