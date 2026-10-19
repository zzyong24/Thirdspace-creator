import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync,openSync,closeSync,writeSync,constants} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {expect,it} from 'vitest';

const tsx=createRequire(import.meta.url).resolve('tsx');
const source=pathToFileURL(resolve('src/secret-crypto.ts')).href;
// 所有密钥/明文在隔离子进程内自建；真实 reader 与等待保持原行为。
async function probe(mode:string,payload:string='',fileFallback=false){
 const directory=mkdtempSync(resolve(tmpdir(),'creatoros-fd-proof-'));const runner=resolve(directory,'probe.mts');
 const fifo=resolve(directory,'input.fifo');let writer:number|undefined;
 if(mode==='eagain')execFileSync('/usr/bin/mkfifo',[fifo]);
 writeFileSync(runner,String.raw`
 import * as fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
 const originalRead=fs.readSync;let reads=0,eofs=0,eagains=0,sleeps=0,observedFd,measuring=false;
 fs.default.readSync=(...args)=>{const observed=measuring&&args[0]===observedFd;if(observed)reads++;try{const n=originalRead(...args);if(observed&&n===0)eofs++;return n;}catch(e){if(observed&&e.code==='EAGAIN')eagains++;throw e;}};syncBuiltinESMExports();
 const originalWait=Atomics.wait;Atomics.wait=(...args)=>{if(measuring)sleeps++;return originalWait(...args);};
 const mode=${JSON.stringify(mode)};const directory=${JSON.stringify(directory)};
 const module1=await import(${JSON.stringify(source)}+'?first');
 const fd=mode==='ebadf'?99999:mode==='eagain'?fs.openSync(${JSON.stringify(fifo)},fs.constants.O_RDONLY|fs.constants.O_NONBLOCK):0;
 const key=Buffer.alloc(32,37);const envKey=Buffer.alloc(32,83);const keyFile=directory+'/fake-master-key';fs.writeFileSync(keyFile,key.toString('base64'));
 const env={CREATOROS_MASTER_KEY_FD:String(fd),CREATOROS_MACHINE_SEED:'isolated-test-seed',CREATOROS_MASTER_KEY_FILE:keyFile,...(${fileFallback}||mode==='multi'?{}:{CREATOROS_MASTER_KEY:envKey.toString('base64')}),NODE_ENV:'test'};
 process.stdout.write('READY\n');
 // 不监听 stdin，给父进程一次真实关闭/迟到写入机会。
 await new Promise(r=>setTimeout(r,30));
 observedFd=fd;measuring=true;const started=performance.now();const first=module1.resolveMasterKey(env);const firstElapsed=performance.now()-started;measuring=false;
 const second=mode==='multi'?await import(${JSON.stringify(source)}+'?second'):module1;
 const beforeSecond=reads;const secondStarted=performance.now();measuring=true;const again=mode==='multi'||mode==='fd'?second.resolveMasterKey(env):first;measuring=false;
 const plaintext='neutral-roundtrip';const ciphertext=module1.encryptSecret(plaintext,first.key);
 process.stdout.write(JSON.stringify({source:first.source,degraded:first.degraded,expectedKey:first.key.equals(first.source==='env'?envKey:key),elapsed:firstElapsed,reads,eofs,eagains,sleeps,secondSource:again.source,secondElapsed:performance.now()-secondStarted,secondReads:reads-beforeSecond,roundtrip:second.decryptSecret(ciphertext,again.key)===plaintext})+'\n');
 if(mode==='eagain')fs.closeSync(fd);
 `);
 const started=performance.now();
 const child=spawn(process.execPath,['--import',tsx,runner],{env:{PATH:process.env.PATH??'',TMPDIR:tmpdir()},stdio:['pipe','pipe','pipe']});
 let output='',stderr='',ready=false;const timers:ReturnType<typeof setTimeout>[]=[];
 child.stderr.on('data',b=>stderr+=b);child.stdout.on('data',b=>{output+=b;if(!ready&&output.includes('READY\n')){ready=true;
  if(mode==='eagain'){writer=openSync(fifo,constants.O_WRONLY);timers.push(setTimeout(()=>writeSync(writer!,Buffer.alloc(32,37).toString('base64')+'\n'),250));}
  else child.stdin.end(payload);
 }});
 const timer=setTimeout(()=>child.kill('SIGKILL'),180000);
 try{const code=await new Promise<number|null>((done,reject)=>{child.on('error',reject);child.on('exit',done);});
  expect(code,`子进程退出；elapsed=${performance.now()-started};stderr=${stderr}`).toBe(0);expect(ready).toBe(true);
  const result=JSON.parse(output.trim().split('\n').at(-1)!);expect(output+stderr).not.toContain(Buffer.alloc(32,37).toString('base64'));expect(output+stderr).not.toContain('neutral-roundtrip');return result;
 }finally{clearTimeout(timer);for(const t of timers)clearTimeout(t);if(writer!==undefined)closeSync(writer);if(child.exitCode===null&&!child.killed)child.kill('SIGKILL');rmSync(directory,{recursive:true,force:true});}
}

it('真正 closed pipe EOF 立即走原 env 兜底而不睡眠两分钟',async()=>{
 const result=await probe('eof');expect(result).toMatchObject({source:'env',degraded:false,expectedKey:true,eofs:1,sleeps:0,secondReads:0,roundtrip:true});expect(result.elapsed).toBeLessThan(5000);
},240000);
it('真正 closed pipe EOF 保留原文件兜底',async()=>{
 const result=await probe('eof','',true);expect(result).toMatchObject({source:'file',degraded:false,expectedKey:true,sleeps:0,roundtrip:true});
},240000);
it.each([{label:'换行结束',payload:Buffer.alloc(32,37).toString('base64')+'\n'},{label:'数据后 EOF',payload:Buffer.alloc(32,37).toString('base64')}])('Rust 正常注入：$label，原 fd 优先且同实例正缓存',async({payload})=>{
 const result=await probe('fd',payload);expect(result).toMatchObject({source:'fd',degraded:false,expectedKey:true,sleeps:0,secondSource:'fd',secondReads:0,roundtrip:true});
},240000);
it('真正 O_NONBLOCK FIFO EAGAIN 仍等到父进程迟到写入，不误当 EOF',async()=>{
 const result=await probe('eagain');expect(result).toMatchObject({source:'fd',degraded:false,expectedKey:true,roundtrip:true});expect(result.eagains).toBeGreaterThan(0);expect(result.sleeps).toBeGreaterThan(0);
},240000);
it('两个真实独立模块实例共享已耗尽输入时按原同源文件解密',async()=>{
 const result=await probe('multi',Buffer.alloc(32,37).toString('base64')+'\n');expect(result).toMatchObject({source:'fd',secondSource:'file',secondReads:1,sleeps:0,expectedKey:true,roundtrip:true});expect(result.secondElapsed).toBeLessThan(5000);
},240000);

it.each([{label:'仅换行',payload:'\n'},{label:'空白',payload:'   '},{label:'非法短值',payload:'not-a-key\n'},{label:'过长值',payload:'x'.repeat(4100)}])('无有效 fd key：$label，保留 env 兜底',async({payload})=>{
 const result=await probe('invalid',payload);expect(result).toMatchObject({source:'env',degraded:false,expectedKey:true,sleeps:0,roundtrip:true});
},240000);
it('真实 EBADF 保留 env 兜底',async()=>{expect(await probe('ebadf')).toMatchObject({source:'env',degraded:false,expectedKey:true,sleeps:0,roundtrip:true});},240000);
