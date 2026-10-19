'use strict';
// 原检查的有限结果观察；不重写原执行预算、测试断言或 reconcile 历史。
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');
const born=performance.now(),wallBorn=Date.now();let lastWall=wallBorn;
const root='/Users/zyongzhu/.codex/worktrees/integrated-dev-acceptance/Thirdspace-creator';
const node='/opt/homebrew/Cellar/node/25.9.0_2/bin/node',helper=root+'/docs/verification/t1246/round-2/unit/owned-pg-runtime.cjs';
const report='/private/tmp/t1246-package-final-source/LED018_LED057_READONLY_SOURCE_DIAGNOSIS_V1.json';
const budgets={prepare:3600000,led018:22800000,led057:3600000,lifecycle018:2160000,lifecycle057:2160000,after:3600000,total:37920000};
const commands=[['LED-018','pnpm --dir frontend exec vitest run src/server/ingestion/douyin-cdp.test.ts scripts/desktop/startup-safety-contract.test.mjs && cargo test --manifest-path frontend/src-tauri/Cargo.toml --lib windows_',budgets.led018,budgets.lifecycle018],['LED-057','cargo test --manifest-path frontend/src-tauri/Cargo.toml --lib runtime_cleanup_tests::windows_ --no-default-features',budgets.led057,budgets.lifecycle057]];
const pinned={
 [node]:'32e234a5b6bec67d72a016f2baadf7fadf3afd328470b395b73af473fdee0d85',
 [helper]:'393f88771f732e57959ce948a61104fe616c6090faa3e21808186a6df7df3dea',
 [report]:'3b27a11be9ea12fd8d5169719d449bf234418a34846f4cb547fb7455e02d81f0',
 '/Users/zyongzhu/.cargo/bin/rustup':'aeb4105778ca1bd3c6b0e75768f581c656633cd51368fa61289b6a71696ac7e1',
 '/Users/zyongzhu/.rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo':'1de2e84c15443b70444eecfa959ff9099dd8c1a5606b6d9ef5bc0ea9c25bc7f9',
 '/Users/zyongzhu/.rustup/toolchains/stable-aarch64-apple-darwin/bin/rustc':'a11618eca0956a8aa4372c2bc898690b513cbdfa2cb9125b2a5301e360ed5b49',
 '/opt/homebrew/lib/node_modules/pnpm/bin/pnpm.cjs':'b276da51dc8ca5b0d3ee3371695b50fc8b3244b281b091c63a3f082a88dadeb9'};
function hash(file){const fd=fs.openSync(file,'r'),h=crypto.createHash('sha256'),b=Buffer.alloc(1048576);try{for(let n;(n=fs.readSync(fd,b,0,b.length,null));)h.update(b.subarray(0,n));return h.digest('hex');}finally{fs.closeSync(fd);}}
function deadline(need=0){const now=Date.now();if(now<lastWall)throw Error('CLOCK_REGRESSION');lastWall=now;const left=budgets.total-(performance.now()-born);if(left<=0||left<need)throw Error('COMPLETE_FINITE_OBSERVATION_FUTURE_UNAVAILABLE');return left;}
function write(file,data){fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});}
function fileRow(file){const s=fs.lstatSync(file);if(s.isSymbolicLink())return {path:file,kind:'link',target:fs.readlinkSync(file),realpath:fs.realpathSync(file),uid:s.uid,mode:s.mode&0o777};if(!s.isFile())throw Error('NOT_REGULAR_SOURCE '+file);return {path:file,kind:'regular',size:s.size,uid:s.uid,mode:s.mode&0o777,sha256:hash(file)};}
const sourceScopes=['frontend/src','frontend/scripts','frontend/src-tauri/src','frontend/src-tauri/vendor','frontend/src-tauri/build.rs','frontend/src-tauri/Cargo.toml','frontend/src-tauri/Cargo.lock','frontend/src-tauri/tauri.conf.json','frontend/src-tauri/capabilities','frontend/src-tauri/permissions','frontend/src-tauri/icons','frontend/vitest.config.ts','frontend/tsconfig.json','frontend/package.json','frontend/product-identity.json','ai-worker/src','ai-worker/package.json','backend/src','backend/package.json','contract/src','contract/package.json','package.json','pnpm-lock.yaml','pnpm-workspace.yaml'];
function snapshot(){
 const start=performance.now(),raw=cp.execFileSync('/usr/bin/git',['--no-optional-locks','ls-files','--cached','--others','--exclude-standard','-z','--',...sourceScopes],{cwd:root,timeout:120000,maxBuffer:64*1024*1024,env:{PATH:'/usr/bin:/bin',HOME:process.env.HOME,LC_ALL:'C'}});
 const source=[...new Set(raw.toString('utf8').split('\0').filter(Boolean))].sort().map(p=>fileRow(path.join(root,p)));
 const extra=[...Object.keys(pinned),root+'/orchestrator/process/reconcile.config.json',root+'/frontend/src-tauri/binaries/creatoros-server-aarch64-apple-darwin',root+'/frontend/src-tauri/sidecar.tar.gz','/Users/zyongzhu/.rustup/settings.toml'].map(fileRow);
 return {source,extra,sourceCount:source.length,elapsedMs:performance.now()-start};
}
function actualCounts(file){const t=fs.readFileSync(file,'utf8').replace(/\u001b\[[0-9;]*m/g,'');return {vitestSummaryLines:t.split('\n').filter(s=>/^\s*(Test Files|Tests|Duration)\s/.test(s)),rustSummaryLines:t.split('\n').filter(s=>s.startsWith('test result:')),rustWindowsCaseLines:t.split('\n').filter(s=>s.startsWith('test ')&&s.includes('windows_')),originalCommandExitOnly:true};}
const args=process.argv.slice(2),reviewPath=args[args.indexOf('--review')+1];
if(!args.includes('--execute')||!args.includes('--review')||!path.isAbsolute(reviewPath||''))throw Error('EXACT_ROOT_REVIEW_REQUIRED');
const review=JSON.parse(fs.readFileSync(reviewPath,'utf8'));
if(review.admitted!==true||review.toolSha256!==hash(__filename)||review.sourceReportSha256!==pinned[report]||review.totalMs!==budgets.total)throw Error('EXACT_REVIEW_BINDING_MISMATCH');
fs.writeFileSync(__filename+'.once',JSON.stringify({toolSha256:hash(__filename),reviewPath,wallBorn:new Date(wallBorn).toISOString()})+'\n',{flag:'wx',mode:0o600});
for(const [file,expected] of Object.entries(pinned))if(hash(file)!==expected)throw Error('PINNED_INPUT_DRIFT '+file);
const h=require(helper),out=fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'t1246-two-led-leaf-'))),nonce=crypto.randomBytes(16).toString('hex');fs.chmodSync(out,0o700);
const temp=path.join(out,'tmp'),target=path.join(out,'cargo-target');fs.mkdirSync(temp,{mode:0o700});fs.mkdirSync(target,{mode:0o700});
const profile=path.join(out,'no-creatoros-app.sb');fs.writeFileSync(profile,'(version 1)\n(allow default)\n(deny file-write* (regex "(^|/)CreatorOS\\\\.app(/|$)"))\n(deny process-exec (regex "(^|/)CreatorOS\\\\.app(/|$)"))\n',{flag:'wx',mode:0o600});
const env=h.cleanEnv({PATH:path.dirname(node)+':/Users/zyongzhu/.cargo/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',HOME:process.env.HOME,LANG:'zh_CN.UTF-8',TMPDIR:temp,CARGO_TARGET_DIR:target,CARGO_NET_OFFLINE:'true',RUSTUP_TOOLCHAIN:'stable-aarch64-apple-darwin'});
const control=new AbortController(),timer=setTimeout(()=>control.abort(Error('FINITE_TWO_LEAF_OBSERVATION_EXHAUSTED')),Math.max(1,deadline())),records=[];let before,after,error=null;
write(path.join(out,'owner.json'),{nonce,uid:process.getuid(),root:out,rootInode:fs.statSync(out).ino,startedAt:new Date(wallBorn).toISOString(),budgets,commands,reviewPath,reviewSha256:hash(reviewPath),toolSha256:hash(__filename),envSelection:{PATH:env.PATH,HOME:env.HOME,TMPDIR:temp,CARGO_TARGET_DIR:target,CARGO_NET_OFFLINE:true,RUSTUP_TOOLCHAIN:env.RUSTUP_TOOLCHAIN,pgKeys:Object.keys(env).filter(k=>k.startsWith('PG')||k.includes('DATABASE_URL'))},noApp:true,noInstall:true,noPublish:true,oldIgnoreLeafMissingPreserved:true});
console.log(JSON.stringify({out,nonce,stage:'prepare',budgets}));
(async()=>{try{
 deadline(budgets.total-budgets.prepare);before=snapshot();write(path.join(out,'source-before.json'),before);if(performance.now()-born>=budgets.prepare)throw Error('PREPARE_OBSERVATION_EXHAUSTED');
 for(let i=0;i<commands.length;i++){
  const [name,command,budgetMs]=commands[i],future=commands.slice(i).reduce((n,x)=>n+x[2]+x[3],budgets.after);deadline(future);control.signal.throwIfAborted();
  const log=path.join(out,name+'.log');console.log(JSON.stringify({out,nonce,stage:name,command,budgetMs}));
  const r=await h.boundedProcess('/usr/bin/sandbox-exec',['-f',profile,'/bin/bash','-c',command],{cwd:root,env,log,budgetMs,signal:control.signal});records.push({name,...r});write(path.join(out,name+'-receipt.json'),{name,...r});
  if(!r.processClosed||r.remainingOwnedGroupMembers.length)throw Error('LEAF_NOT_FULLY_CLOSED '+name);
  write(path.join(out,name+'-counts.json'),{name,logSha256:hash(log),logBytes:fs.statSync(log).size,...actualCounts(log)});
  deadline(commands.slice(i+1).reduce((n,x)=>n+x[2]+x[3],budgets.after));if(r.budgetExhausted||r.outerAbort||r.spawnError)throw Error('LEAF_OBSERVATION_FAILED '+name);
 }
}catch(e){error=String(e);}finally{
 const afterBorn=performance.now();try{deadline(budgets.after);after=snapshot();write(path.join(out,'source-after.json'),after);if(before&&(JSON.stringify(before.source)!==JSON.stringify(after.source)||JSON.stringify(before.extra)!==JSON.stringify(after.extra)))throw Error('SOURCE_OR_INPUT_AFTER_DRIFT');if(performance.now()-afterBorn>=budgets.after)throw Error('AFTER_OBSERVATION_EXHAUSTED');deadline();}catch(e){error=(error?error+'; ':'')+String(e);}
 const summary={nonce,out,startedAt:new Date(wallBorn).toISOString(),endedAt:new Date().toISOString(),totalMs:budgets.total,elapsedMs:performance.now()-born,budgets,records:records.map(r=>({name:r.name,code:r.code,signal:r.signal,budgetExhausted:r.budgetExhausted,processClosed:r.processClosed,remainingOwnedGroupMembers:r.remainingOwnedGroupMembers,identity:r.identity,log:r.log})),sourceBeforeCount:before?.sourceCount??null,sourceAfterCount:after?.sourceCount??null,sourceAfterMatches:!!before&&!!after&&JSON.stringify(before.source)===JSON.stringify(after.source)&&JSON.stringify(before.extra)===JSON.stringify(after.extra),error,noApp:true,noInstall:true,noPublish:true,oldIgnoreLeafMissingPreserved:true};
 write(path.join(out,'summary.json'),summary);try{deadline();}catch(e){error=(error?error+'; ':'')+String(e);write(path.join(out,'final-deadline-error.json'),{error});}clearTimeout(timer);console.log(JSON.stringify({out,nonce,records:summary.records.map(r=>({name:r.name,code:r.code})),error}));process.exitCode=error||records.length!==2||records.some(r=>r.code!==0)?1:0;
}})();
