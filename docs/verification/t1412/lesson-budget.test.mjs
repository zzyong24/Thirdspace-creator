import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planLessonExecution} from '../../../orchestrator/process/lesson-runner.mjs';
const before=JSON.parse(fs.readFileSync(new URL('./before/reconcile.config.json',import.meta.url)));
const current=()=>JSON.parse(fs.readFileSync(new URL('../../../orchestrator/process/reconcile.config.json',import.meta.url)));
test('项目当前55项原命令能形成有限执行计划，外层包含每次清理与结算',()=>{
 const cfg=current(),plan=planLessonExecution(cfg.lessons,cfg.lesson_execution);
 assert.equal(plan.ok,true,plan.errors.join('\n'));
 assert.equal(cfg.lesson_execution.minimum_timeout_ms,120000);
 assert.equal(plan.commands.length,55);
 assert.equal(plan.overallTimeoutMs,plan.commands.reduce((n,x)=>n+x.timeoutMs+2000,0)+1);
 assert.ok(plan.overallTimeoutMs<=2147483647);
});
test('只增加预算，全部原检查字段、顺序和其它配置不变',()=>{
 const cfg=current(),{lesson_execution,...withoutPolicy}=cfg;
 withoutPolicy.lessons=withoutPolicy.lessons.map(({timeout_ms,...row})=>row);
 assert.deepEqual(withoutPolicy,before);
});
test('缺预算、低于下界、外层不覆盖内部时，原runner继续拒绝',()=>{
 const cfg=current();
 assert.equal(planLessonExecution(cfg.lessons,{}).ok,false);
 assert.equal(planLessonExecution([{check:'unused',timeout_ms:119999}],{minimum_timeout_ms:120000}).ok,false);
 assert.equal(planLessonExecution([{check:'unused',timeout_ms:120000}],{minimum_timeout_ms:120000,overall_timeout_ms:122000}).ok,false);
});
