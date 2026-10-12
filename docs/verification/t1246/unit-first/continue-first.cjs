const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const evidence='/Users/zyongzhu/.codex/worktrees/integrated-dev-acceptance/Thirdspace-creator/docs/verification/t1246/unit-first';
const packages=['contract','ai-worker','backend','frontend'];
const receipt=p=>JSON.parse(fs.readFileSync(path.join(evidence,p+'-exit.json'),'utf8'));
const done=p=>{try{return receipt(p).status!=='running';}catch{return false;}};
const call=(script,p)=>new Promise((resolve,reject)=>{const c=spawn(process.execPath,[script,p],{stdio:'inherit'});c.on('error',reject);c.on('close',(code,signal)=>{console.log(JSON.stringify({controllerPhase:script.includes('typecheck')?'typecheck':'vitest',package:p,actualExitCode:code,signal}));resolve(code);});});
(async()=>{
 if(!done('contract')||!done('ai-worker'))throw Error('前置首轮未结束');
 while(!done('backend'))await new Promise(r=>setTimeout(r,5000));
 if(fs.existsSync(path.join(evidence,'frontend-exit.json')))throw Error('frontend已有回执，禁止重跑');
 await call('/tmp/t1246-unit/run-package-first.cjs','frontend');
 for(const p of packages){if(!done(p))throw Error('Vitest四包未完整结束，禁止开始typecheck');}
 for(const p of packages)await call('/tmp/t1246-unit/run-typecheck-first.cjs',p);
 console.log(JSON.stringify({status:'all_four_vitest_and_typecheck_first_round_completed',completedAt:new Date().toISOString()}));
})().catch(e=>{console.error(e);process.exitCode=1;});
