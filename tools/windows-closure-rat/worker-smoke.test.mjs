import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { smokeWorker } from './worker-smoke.mjs';

// 时钟适配器只缩放测试的墙钟，生产策略传入的两分钟预算仍逐次断言。
const acceleratedTimers = {
 setTimeout(callback,milliseconds) {
  assert.ok(milliseconds >= 120_000, `收到短执行预算 ${milliseconds}`);
  return setTimeout(callback,milliseconds / 300);
 }, clearTimeout,
};
for (const [name,source,error] of [
  ['就绪后正常断连退出',"process.send({type:'ready'});process.on('disconnect',()=>process.exit(0));",null],
  ['就绪后崩溃不能算通过',"process.send({type:'ready'});process.on('disconnect',()=>process.exit(1));",/异常退出/],
  ['断连不退出必须失败',"setInterval(()=>{},1000);process.send({type:'ready'});",/未正常退出/],
  ['没有握手有界失败',"setInterval(()=>{},1000);",/未就绪/],
]) test(name,async()=>{
  const root=mkdtempSync(join(tmpdir(),'worker smoke 中文 '));
  try {
    const entry=join(root,'fixture.cjs');writeFileSync(entry,source);
    const run=smokeWorker({entry,cwd:root,env:{PATH:process.env.PATH},readyTimeoutMs:1000,stopTimeoutMs:100,timers:acceleratedTimers});
    if(error) await assert.rejects(run,error);else await run;
  } finally {rmSync(root,{recursive:true,force:true});}
});
test('Node不可执行也能有界返回',async()=>{
 await assert.rejects(smokeWorker({entry:'missing.cjs',execPath:join(tmpdir(),'missing-node-t974'),readyTimeoutMs:1000,stopTimeoutMs:100,timers:acceleratedTimers}),/ENOENT/);
});
