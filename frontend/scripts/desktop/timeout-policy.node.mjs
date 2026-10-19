import test from "node:test";
import assert from "node:assert/strict";
import { executionTimeoutMs, remainingObservationMs, configureProbePage } from "./timeout-policy.mjs";
import { assertWorkerExternalPackages } from "./execution-worker-runtime.mjs";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("短预算归一，更长不缩短，非法值明确拒绝", () => {
 assert.equal(executionTimeoutMs(30_000),120_000);
 assert.equal(executionTimeoutMs(600_000),600_000);
 for(const value of [0,-1,NaN,Infinity,2**32,1.5]) assert.throws(()=>executionTimeoutMs(value));
});
test("绝对deadline向内传播，最后剩余不能被floor重新延长", () => {
 assert.equal(remainingObservationMs(120_000,119_999),1);
 assert.throws(()=>remainingObservationMs(120_000,120_000),/已耗尽/);
});
test("页面配置端口收到动作与导航两分钟策略", async () => {
 const calls=[];configureProbePage({setDefaultTimeout:value=>calls.push(value),setDefaultNavigationTimeout:value=>calls.push(value)},30_000);
 assert.deepEqual(calls,[120_000,120_000]);
});
test("两个build-only消费者统一跳过外部依赖探针，正常验证传入两分钟",()=>{
 let spawned=false;
 assertWorkerExternalPackages("does-not-exist",{buildOnly:true,run(){spawned=true;throw Error("不应执行");}});
 assert.equal(spawned,false);
 const root=realpathSync(mkdtempSync(join(tmpdir(),"t1066-worker-probe-")));
 try {
  mkdirSync(join(root,"frontend"));writeFileSync(join(root,"frontend/creatoros-module-resolver.cjs"),"");
  if(process.platform==="win32") { mkdirSync(join(root,"cli"));writeFileSync(join(root,"cli/node.exe"),""); }
  let options;
  assertWorkerExternalPackages(root,{buildOnly:false,run(_command,_args,opts){options=opts;return {status:0};}});
  assert.equal(options.timeout,120_000);
 } finally {rmSync(root,{recursive:true,force:true});}
});
