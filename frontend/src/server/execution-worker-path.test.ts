import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe,it,expect } from "vitest";
import { resolveExecutionWorkerPath } from "./execution-worker-path";
describe("执行Worker资源定位",()=>{
  it("桌面只认随包文件，开发可用构建生成物",()=>{
    const root=mkdtempSync(join(tmpdir(),"worker-path-"));const cwd=join(root,"frontend");
    try{mkdirSync(join(root,"ai-worker/dist"),{recursive:true});writeFileSync(join(root,"ai-worker/dist/execution-worker.cjs"),"");
      expect(resolveExecutionWorkerPath(cwd,false)).toBe(join(root,"ai-worker/dist/execution-worker.cjs"));
      expect(()=>resolveExecutionWorkerPath(cwd,true)).toThrow("BUILD_MISSING");
      mkdirSync(join(cwd,"runtime"),{recursive:true});writeFileSync(join(cwd,"runtime/execution-worker.cjs"),"");expect(resolveExecutionWorkerPath(cwd,true)).toBe(join(cwd,"runtime/execution-worker.cjs"));
    }finally{rmSync(root,{recursive:true,force:true});}
  });
});
