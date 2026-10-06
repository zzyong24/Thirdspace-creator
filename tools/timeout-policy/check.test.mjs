import {test} from 'node:test';import assert from 'node:assert/strict';import {inspectSource} from './check.mjs';
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
