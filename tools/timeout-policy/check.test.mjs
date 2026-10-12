import {test} from 'node:test';import assert from 'node:assert/strict';import {inspectSource} from './check.mjs';
import fs from 'node:fs';
test('detects short request, browser default and abort timer consumers',()=>{
 const old='const WAIT=30000;fetch(url,{signal:AbortSignal.timeout(WAIT)});page.setDefaultTimeout(30000);setTimeout(()=>reject(new Error("timeout")),5000);';
 assert.equal(inspectSource(old).length,3);
});
test('does not turn polling, sleeps, TTL or shared remaining deadline into execution budgets',()=>{
 assert.deepEqual(inspectSource('const ttl=30000;setTimeout(()=>resolve(),500);const remaining=deadlineAt-Date.now();setTimeout(()=>abort(),remaining);page.waitForTimeout(1000);'),[]);
});
test('accepts normalized defaults and longer outer budget instead of bare numeric replacement',()=>{
 assert.deepEqual(inspectSource('const ms=executionTimeoutMs(options.timeoutMs??30000);setTimeout(()=>reject(Error()),ms);page.goto(url,{timeout:Math.max(120000,supplied)});'),[]);
 assert.equal(inspectSource('page.goto(url,{timeout:30000});').length,1);
});

// T1250：API/词法边界回归，不把编辑器调度或动画当正执行，仍拒真实小预算。
test('T1250 精确调度和词法绑定，不给未知正执行泛豁免',()=>{
 assert.deepEqual(inspectSource('window.requestIdleCallback(() => measure(), { timeout: 400 });'),[]);
 assert.deepEqual(inspectSource('const outside=()=>{const y=1}; function merge(){function y(a,b){return b??a}const strategies={timeout:y};}'),[]);
 assert.equal(inspectSource('socket.setTimeout(10000); page.goto(url,{timeout:15000});').length,2);
 assert.equal(inspectSource('setTimeout(()=>resource.destroy(),300); fetch(url,{signal:AbortSignal.timeout(1000)});').length,2);
});
test('T1250 shadow的同名调度函数及未知destroy仍执行门拒绝',()=>{
 assert.equal(inspectSource('function call(requestIdleCallback){requestIdleCallback(work,{timeout:400});}').length,1);
 assert.equal(inspectSource('const window={requestIdleCallback:request};window.requestIdleCallback(work,{timeout:400});').length,1);
 assert.equal(inspectSource('const WAIT=5000;function call(){const WAIT=120000;page.goto(url,{timeout:WAIT});}page.goto(url,{timeout:WAIT});').length,1);
 assert.equal(inspectSource('function call(WAIT){page.goto(url,{timeout:WAIT});}const WAIT=1;').length,0);
 assert.equal(inspectSource('setTimeout(()=>connection.destroy(),300);').length,1);
});
test('T1250 六个关闭动画只接受原冻结文件及原AST节点，修改字节不得豁免',()=>{
 for(const path of ['frontend/public/reference-editors/kuaitu/js/index.770609ce.js','frontend/public/reference-editors/kuaitu/native/native.js']){
  const source=fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8');
  assert.deepEqual(inspectSource(source,path),[]);
  assert.ok(inspectSource(source,path+'-changed.js').length>=3);
  const changed=source.replace('this.destroy()','connection.destroy()');assert.notEqual(changed,source);
  assert.ok(inspectSource(changed,path).length>=3);
 }
});
test('T1250 named表达式/方法/for词法声明不能掩盖外层真实小预算',()=>{
 for(const code of [
  'const WAIT=1000;const cb=function WAIT(){};page.goto(url,{timeout:WAIT});',
  'const WAIT=1000;const o={WAIT(){}};page.goto(url,{timeout:WAIT});',
  'const WAIT=1000;for(let WAIT=120000;false;){}page.goto(url,{timeout:WAIT});',
  'const WAIT=1000;switch(type){case 0:let WAIT=120000;page.goto(url,{timeout:WAIT});}page.goto(url,{timeout:WAIT});',
 ])assert.equal(inspectSource(code).length,1,code);
});

// T1252：Undici每个实际网络观察选项进入既有正预算门。
test('T1252 headers/body/connect短门不被父case或未知dispatcher掩盖',()=>{
 assert.equal(inspectSource('const SHORT=30000;new Agent({headersTimeout:SHORT,bodyTimeout:30000,connectTimeout:10000});').length,3);
 assert.deepEqual(inspectSource('const WAIT=8100000;new Agent({headersTimeout:WAIT,bodyTimeout:WAIT,connect:{timeout:120000}});'),[]);
 assert.equal(inspectSource('const WAIT=120000;function call(){const WAIT=1000;new Agent({bodyTimeout:WAIT});}').length,1);
});
