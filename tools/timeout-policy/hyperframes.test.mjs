import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inspectSource} from './check.mjs';
import {createHyperframesIsolation} from './hyperframes-cli-isolation.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const pkg=path.join(root,'frontend/node_modules/hyperframes');
const cli=path.join(pkg,'dist/cli.js');
const source=fs.readFileSync(cli,'utf8');
const sha=data=>createHash('sha256').update(data).digest('hex');
test('锁定实际安装的同版本补丁，依赖升级必须重新核对内部等待',()=>{
 assert.equal(JSON.parse(fs.readFileSync(path.join(pkg,'package.json'))).version,'0.7.54');
 const patch=fs.readFileSync(path.join(root,'patches/hyperframes@0.7.54.patch'));
 assert.equal(sha(patch),'15761c896a52b54f07273e5031b38c4480484a466917f4cc65badf472149d5c0');
 assert.ok(fs.readFileSync(path.join(root,'pnpm-lock.yaml'),'utf8').includes(`hash: ${sha(patch)}`));
 assert.equal(sha(source),'1250669d951c4a462b7e4b5d574256f61978797ba3b941cc8491d620e3ef925b');
 const short=inspectSource(source,'hyperframes/dist/cli.js');
 assert.equal(short.length,2);
 for(const item of short){assert.equal(item.valueMs,500);assert.match(item.source,/SIGKILL/);}
 // 这两处是已有停止指令后的进程树强杀宽限，不是工作执行上限；取消仍即时生效。
 assert.equal((source.match(/creatorosConfigurePageTimeouts\((?:page\d*|previewPage)\);/g)||[]).length,12);
});
test('实际安装的归一入口保留零值、拒绝非法值并明确覆盖页面默认',()=>{
 const prefix=source.slice(source.indexOf('function creatorosConfigurePageTimeouts'),source.indexOf('import { createRequire'));
 const context=vm.createContext({});vm.runInContext(prefix,context);
 assert.equal(context.creatorosExecutionTimeout(1),120000);
 assert.equal(context.creatorosExecutionTimeout(300000),300000);
 assert.equal(context.creatorosExecutionTimeout(0),0);
 assert.throws(()=>context.creatorosExecutionTimeout(-1),/nonnegative/);
 const calls=[];context.creatorosConfigurePageTimeouts({setDefaultTimeout:ms=>calls.push(ms),setDefaultNavigationTimeout:ms=>calls.push(ms)});
 assert.deepEqual(calls,[120000,120000]);
 assert.ok(source.includes("MAX_PAGE_NAVIGATION_TIMEOUT_SECONDS = 86400"));
 assert.ok(source.includes("request_timeout_seconds=${Math.max(120, timeout)}"));
});
test('真实公共CLI拒绝一秒浏览器超时，错误单位为秒',async t=>{
 const isolated=await createHyperframesIsolation(cli);
 try{
  fs.writeFileSync(path.join(isolated.work,'index.html'),'<html><body><main data-composition-id="main" data-width="320" data-height="180" data-duration="0.2"></main></body></html>',{mode:0o600});
  const result=await isolated.run([cli,'render',isolated.work,'--browser-timeout','1']);
  assert.equal(result.signal,null);assert.notEqual(result.status,0);assert.match(result.stdout+result.stderr,/120/);
  assert.doesNotMatch(result.stdout+result.stderr,/ENOENT|Cannot find module/);
  t.diagnostic(JSON.stringify({schema:'hyperframes-real-cli-proof/v1',isolation:isolated.proof,child:result}));
 }finally{isolated.dispose();}
});
