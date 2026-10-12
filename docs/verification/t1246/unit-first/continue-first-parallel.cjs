const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const evidence='/Users/zyongzhu/.codex/worktrees/integrated-dev-acceptance/Thirdspace-creator/docs/verification/t1246/unit-first';
const packages=['contract','ai-worker','backend','frontend'];
const receipt=p=>JSON.parse(fs.readFileSync(path.join(evidence,p+'-exit.json'),'utf8'));
const done=p=>{try{return receipt(p).status!=='running';}catch{return false;}};
const call=p=>new Promise((resolve,reject)=>{const c=spawn(process.execPath,['/tmp/t1246-unit/run-typecheck-first-isolated.cjs',p],{stdio:'inherit'});c.on('error',reject);c.on('close',(code,signal)=>{console.log(JSON.stringify({controllerPhase:'typecheck',package:p,actualExitCode:code,signal}));resolve(code);});});
(async()=>{
 const front=receipt('frontend');if(front.pid!==98159||front.cwd!=='/Users/zyongzhu/.codex/worktrees/integrated-frontend-unit/Thirdspace-creator/frontend')throw Error('不能等待其它frontend任务');
 while(packages.some(p=>!done(p)))await new Promise(r=>setTimeout(r,5000));
 for(const p of packages)await call(p);
 console.log(JSON.stringify({status:'all_four_vitest_and_typecheck_first_round_completed_not_pass_claim',completedAt:new Date().toISOString()}));
})().catch(e=>{console.error(e);process.exitCode=1;});
