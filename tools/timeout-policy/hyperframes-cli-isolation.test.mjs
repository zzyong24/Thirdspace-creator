import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {before,after} from 'node:test';
import {fileURLToPath} from 'node:url';
import {createHyperframesIsolation} from './hyperframes-cli-isolation.mjs';
import {inspectSource} from './check.mjs';
const cli=fileURLToPath(new URL('../../frontend/node_modules/hyperframes/dist/cli.js',import.meta.url));
let session;
before(async()=>{session=await createHyperframesIsolation(cli);});
after(()=>session?.dispose());
test('真实CLI测试不能继承父环境；隔离由专用会话承担',()=>{
 const source=fs.readFileSync(new URL('./hyperframes.test.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/env:\s*\{\s*\.\.\.process\.env/,'原公共入口把任意父凭据/HOME传给真实CLI');
 assert.match(source,/createHyperframesIsolation/);
});
test('真实原生边界阻断网络、根外读写和普通/detached setsid后代',()=>{
 assert.equal(session.proof.verified,true);
 assert.deepEqual(Object.fromEntries(['readDenied','writeDenied','networkDenied','forkDenied','detachedSetsidDenied','parentSecretsAbsent'].map(key=>[key,session.proof.probe[key]])),{readDenied:true,writeDenied:true,networkDenied:true,forkDenied:true,detachedSetsidDenied:true,parentSecretsAbsent:true});
 assert.equal(session.proof.probe.connections,0);
 assert.equal(fs.statSync(session.root).mode&0o777,0o700);
 assert.doesNotMatch(session.proof.profile,/allow default|allow mach-/);
 assert.equal(session.proof.environment.NODE_OPTIONS,undefined);
 assert.equal(session.proof.environment.CREATOROS_BASE_URL,undefined);
 assert.ok(session.proof.environment.OPENSSL_CONF.startsWith(session.root+'/'));
 const directory=new URL('../../docs/verification/t1412/cli-proofs/',import.meta.url);fs.mkdirSync(directory,{recursive:true});
 fs.writeFileSync(new URL(`capabilities-${Date.now()}-${process.pid}.json`,directory),JSON.stringify(session.proof,null,2)+'\n');
});
test('没有已证原生入口或CLI身份不匹配时，不启动CLI',async()=>{
 await assert.rejects(createHyperframesIsolation(cli,{platform:'linux'}),/ISOLATION_UNPROVEN/);
 await assert.rejects(createHyperframesIsolation(cli,{sandboxPath:'/not-a-sandbox'}),/ISOLATION_UNPROVEN/);
 await assert.rejects(createHyperframesIsolation(process.execPath),/CLI身份/);
});
test('低于原执行下界、已取消和取消中的真实子进程不能被记成功',async()=>{
 await assert.rejects(session.run(['-e','process.exit(0)'],{timeoutMs:119999}),/至少120秒/);
 await assert.rejects(session.run(['-e','process.exit(0)'],{signal:AbortSignal.abort()}),/INCOMPLETE.*取消/);
 const controller=new AbortController();
 const pending=session.run(['-e','setInterval(()=>{},1000)'],{signal:controller.signal});
 assert.throws(()=>session.dispose(),/在途子进程/);
 controller.abort();
 await assert.rejects(pending,error=>/INCOMPLETE.*取消/.test(error.message)&&['SIGTERM','SIGKILL'].includes(error.receipt?.signal)&&error.receipt.remainingOwnedProcesses===0);
});
test('原120秒执行期限到期保持失败，真实owned进程收尾',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 try{
  const pending=session.run(['-e','setInterval(()=>{},1000)'],{timeoutMs:120000});
  t.mock.timers.tick(120000);
  await assert.rejects(pending,error=>/INCOMPLETE.*执行超时/.test(error.message)&&error.receipt.remainingOwnedProcesses===0);
 }finally{t.mock.timers.reset();}
});
test('清理归属不可信时不删除会话根，恢复后才正常销毁',()=>{
 fs.chmodSync(session.root,0o755);
 try{assert.throws(()=>session.dispose(),/ISOLATION_UNPROVEN/);assert.equal(fs.existsSync(session.root),true);}
 finally{fs.chmodSync(session.root,0o700);}
});
test('新helper即使尚未Git跟踪，也服从既有超时静态守卫',()=>{
 const file='tools/timeout-policy/hyperframes-cli-isolation.mjs';
 assert.deepEqual(inspectSource(fs.readFileSync(new URL('./hyperframes-cli-isolation.mjs',import.meta.url),'utf8'),file),[]);
});
