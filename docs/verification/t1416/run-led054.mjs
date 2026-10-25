import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const out=path.dirname(fileURLToPath(import.meta.url));
const state=JSON.parse(fs.readFileSync(path.resolve(out,'../t1412/resumed-validation/state.json'),'utf8'));
const require=createRequire(import.meta.url);
const runtime=require(path.join(state.source,'docs/verification/t1246/round-2/unit/owned-pg-runtime.cjs'));
const git=(...args)=>execFileSync('git',args,{cwd:state.tree,encoding:'utf8'}).trim();
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const save=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const full=JSON.parse(fs.readFileSync(path.resolve(out,'../t1412/resumed-validation/reconcile-full.receipt.json'),'utf8'));
const red=JSON.parse(fs.readFileSync(path.resolve(out,'../t1412/resumed-validation/cft-five.receipt.json'),'utf8'));
if(!full.processClosed||full.remainingOwnedGroupMembers.length||!red.processClosed||red.remainingOwnedGroupMembers.length)throw Error('原执行尚未完全退出');
const candidate=git('rev-parse','HEAD');
if(candidate===state.commit||candidate!==git('rev-parse','main'))throw Error('需要主线程冻结的新提交');
if(git('status','--porcelain=v1')!=='M orchestrator/.lessons-stats.json')throw Error('候选存在非预期改动');
const source='frontend/src/server/workbench-browser-host.test.ts';
const before=hash(path.join(state.tree,source));
const config=JSON.parse(fs.readFileSync(path.join(state.tree,'orchestrator/process/reconcile.config.json'),'utf8'));
const lesson=config.lessons.find(item=>item.id==='LED-054');
if(!lesson||!lesson.check||lesson.timeout_ms!==2700000)throw Error('原LED054命令或预算缺失');
save('candidate.json',{candidate,previousFullCandidate:state.commit,installedPackageCommit:state.installedPackageCommit,source,sourceSha256:before,configurationSha256:hash(path.join(state.tree,'orchestrator/process/reconcile.config.json')),lesson,environmentKeys:Object.keys(state.env).sort(),scope:'原full失败后的原单项整链复验；不改写原full结果。'});
for(const key of Object.keys(process.env))delete process.env[key];
Object.assign(process.env,state.env);
const controller=new AbortController();
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>controller.abort(new Error(signal)));
let pg;
try{
 pg=await runtime.start({workspace:state.tree,evidenceRoot:path.join(out,'owned-pg'),signal:controller.signal});
 const env={...state.env};
 for(const key of ['CREATOROS_OWNED_PG_MARKER','CREATOROS_OWNED_PG_NONCE','CREATOROS_TEST_POSTGRES_URL','CREATOROS_ISOLATED_PG_URL'])env[key]=pg.env[key];
 const receipt=await runtime.boundedProcess('/bin/sh',['-c',lesson.check],{cwd:state.tree,env,budgetMs:lesson.timeout_ms,signal:controller.signal,log:path.join(out,'led054-green.log')});
 save('led054-green.receipt.json',receipt);
 console.log(JSON.stringify({step:'LED-054',code:receipt.code,closed:receipt.processClosed,remaining:receipt.remainingOwnedGroupMembers,elapsedMs:receipt.elapsedMs}));
 if(receipt.code!==0||!receipt.processClosed||receipt.remainingOwnedGroupMembers.length)throw Error('LED054未通过');
 const types=await runtime.boundedProcess(state.node,[state.pnpm,'--dir','frontend','typecheck'],{cwd:state.tree,env:state.env,budgetMs:900000,signal:controller.signal,log:path.join(out,'frontend-typecheck.log')});
 save('frontend-typecheck.receipt.json',types);
 console.log(JSON.stringify({step:'frontend-typecheck',code:types.code,closed:types.processClosed,remaining:types.remainingOwnedGroupMembers,elapsedMs:types.elapsedMs}));
 if(types.code!==0||!types.processClosed||types.remainingOwnedGroupMembers.length)throw Error('frontend typecheck未通过');
}finally{
 if(pg){await runtime.stop(pg);save('owned-pg-stop.json',{stopped:true,rootRemoved:!fs.existsSync(pg.root),endedAt:new Date().toISOString()});}
 save('candidate-after.json',{candidate:git('rev-parse','HEAD'),sourceSha256:hash(path.join(state.tree,source)),unchanged:before===hash(path.join(state.tree,source))});
}
