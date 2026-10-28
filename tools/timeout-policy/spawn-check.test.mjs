import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnTimeoutCheck,timeoutCheckInvocation} from './spawn-check.mjs';

async function completed(child){
 let stdout='',stderr='';child.stdout?.on('data',chunk=>stdout+=chunk);child.stderr?.on('data',chunk=>stderr+=chunk);
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
 return {code,stdout,stderr};
}
test('真实Node检查保留非零退出码，不掩盖检查失败',async()=>{
 const result=await completed(spawnTimeoutCheck(process.execPath,['-e','process.stdout.write("fixture");process.exit(7)'],{stdio:['ignore','pipe','pipe']}));
 assert.equal(result.code,7);assert.equal(result.stdout,'fixture');
});
test('仅Windows固定pnpm入口走cmd，其他平台与Node检查保持直接启动',()=>{
 assert.deepEqual(timeoutCheckInvocation('pnpm',['--version'],'linux'),{command:'pnpm',args:['--version']});
 assert.deepEqual(timeoutCheckInvocation('node.exe',['some script.mjs'],'win32'),{command:'node.exe',args:['some script.mjs']});
 assert.deepEqual(timeoutCheckInvocation('pnpm',['--dir','contract'],'win32',{ComSpec:'C:\\Windows\\System32\\cmd.exe'}),{command:'C:\\Windows\\System32\\cmd.exe',args:['/d','/s','/c','pnpm.cmd --dir contract']});
});
test('固定pnpm入口拒绝空格、引号和CMD展开/连接参数，不形成注入命令',()=>{
 for(const value of ['x&echo','%PATH%','a b','"quoted"','x\ny','x|more','x^y'])assert.throws(()=>timeoutCheckInvocation('pnpm',['--dir',value],'win32'),/固定安全参数/);
});
test('Windows真实cmd入口保留固定pnpm参数与退出码',{skip:process.platform!=='win32'},async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'creatoros-gate-pnpm-'));
 try{
  fs.writeFileSync(path.join(temp,'pnpm.cmd'),'@echo off\r\necho %*\r\nexit /b 7\r\n');
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>key.toLowerCase()!=='path'));
  env.PATH=temp+path.delimiter+(process.env.PATH??'');
  const result=await completed(spawnTimeoutCheck('pnpm',['--dir','contract','exec','vitest','--retry=0'],{env,stdio:['ignore','pipe','pipe']}));
  assert.equal(result.code,7);assert.match(result.stdout,/--dir contract exec vitest --retry=0/);
 }finally{
  const relative=path.relative(os.tmpdir(),temp);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
  fs.rmSync(temp,{recursive:true,force:true});
 }
});
