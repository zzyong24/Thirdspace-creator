import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe,it,expect } from "vitest";
import { resolveExecutionWorkerPath, resolveAgenticWorkerPath } from "./execution-worker-path";
describe("执行Worker资源定位",()=>{
  it.each([["execution-worker.cjs",resolveExecutionWorkerPath],["agentic-worker.cjs",resolveAgenticWorkerPath]] as const)("%s 桌面只认随包文件，开发可用构建生成物",(filename,resolvePath)=>{
    const root=mkdtempSync(join(tmpdir(),"worker-path-"));const cwd=join(root,"frontend");
    try{mkdirSync(join(root,"ai-worker/dist"),{recursive:true});writeFileSync(join(root,"ai-worker/dist",filename),"");
      expect(resolvePath(cwd,false)).toBe(join(root,"ai-worker/dist",filename));
      expect(()=>resolvePath(cwd,true)).toThrow("BUILD_MISSING");
      mkdirSync(join(cwd,"runtime"),{recursive:true});writeFileSync(join(cwd,"runtime",filename),"");expect(resolvePath(cwd,true)).toBe(join(cwd,"runtime",filename));expect(resolvePath(cwd,false)).toBe(join(cwd,"runtime",filename));
    }finally{rmSync(root,{recursive:true,force:true});}
  });
});
