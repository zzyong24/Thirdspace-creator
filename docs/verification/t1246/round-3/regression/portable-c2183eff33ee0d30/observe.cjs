'use strict';const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const input=JSON.parse(fs.readFileSync(path.join(__dirname,'input.json'),'utf8')),h=require(path.join(input.root,'docs/verification/t1246/round-2/unit/owned-pg-runtime.cjs'));
const plan=[{name:'native',workspace:'ai-worker',file:'src/execution/codex-native-turn.test.ts',budget:10680000,expected:43},{name:'copilot',workspace:'frontend',file:'src/features/copilot/ai-copilot-content.test.tsx',budget:36000000,expected:49},{name:'confirm-topic',workspace:'backend',file:'src/modules/intelligence/intelligence-confirm-topic-public.integration.test.ts',budget:3000000,expected:12},{name:'status-handoff',workspace:'backend',file:'src/modules/ai-runtime/local-codex-status-handoff.public.test.ts',budget:11280000,expected:5}];
const LC=2160000,MARGIN=600000,GUARD=120000,FINAL=360000,TOTAL=plan.reduce((v,p)=>v+p.budget+LC+MARGIN+2*GUARD,0)+2*GUARD+FINAL;
const born=performance.now(),deadline=born+TOTAL,controller=new AbortController(),timer=setTimeout(()=>controller.abort(Error('ORIGINAL_ONE_BIRTH_OBSERVATION_EXHAUSTED')),TOTAL);
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),json=(name,data)=>fs.writeFileSync(path.join(__dirname,name+'.json'),JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
const admit=n=>{if(controller.signal.aborted||deadline-performance.now()<n)throw Error('COMPLETE_FUTURE_NOT_AVAILABLE');};
const future=i=>plan.slice(i).reduce((v,p)=>v+p.budget+LC+MARGIN+2*GUARD,0)+GUARD+FINAL;
function guard(name){const at=performance.now(),rows=Object.entries(input.expected).map(([p,expected])=>{const file=path.join(input.root,p),st=fs.lstatSync(file),actual=hash(file);if(actual!==expected||!st.isFile()||st.isSymbolicLink())throw Error('SOURCE_BYTE_DRIFT:'+p);return {path:p,sha256:actual,bytes:st.size,mode:st.mode&0o777,uid:st.uid};});if(performance.now()-at>=GUARD)throw Error('SOURCE_IO_GUARD_EXHAUSTED');json(name,{rows,elapsedMs:performance.now()-at});return rows;}
const records=[];let failure;
(async()=>{try{
 admit(TOTAL-1);guard('source-before');
 const env={...h.cleanEnv(),PATH:path.dirname(input.node)+':/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',TMPDIR:'/private/tmp',CI:'true',FORCE_COLOR:'0'};
 for(let i=0;i<plan.length;i++){
  const p=plan[i];admit(future(i));guard(p.name+'-source-before');
  const args=['-C',p.workspace,'exec','vitest','run',p.file,'--retry=0','--testTimeout=120000','--hookTimeout=120000','--teardownTimeout=120000','--no-file-parallelism'];json(p.name+'-start',{at:new Date().toISOString(),file:input.pnpm,args,budgetMs:p.budget,fullRemainingFutureMs:future(i),retry:0});console.log('START '+p.name);
  const receipt=await h.boundedProcess(input.pnpm,args,{cwd:input.root,env,signal:controller.signal,budgetMs:p.budget,log:path.join(__dirname,p.name+'.log')});json(p.name+'-receipt',receipt);
  admit(GUARD+future(i+1));guard(p.name+'-source-after');
  const raw=fs.readFileSync(path.join(__dirname,p.name+'.log'),'utf8'),text=raw.replace(/\x1b\[[0-9;]*m/g,''),match=text.match(/Tests\s+(\d+) passed \((\d+)\)/),actual=match?{passed:Number(match[1]),total:Number(match[2])}:null;
  const complete=receipt.code===0&&receipt.processClosed&&receipt.remainingOwnedGroupMembers.length===0&&!receipt.budgetExhausted&&!receipt.outerAbort&&receipt.signals.length===0&&actual?.passed===p.expected&&actual?.total===p.expected;
  const row={name:p.name,expected:p.expected,actual,complete,receipt:path.join(__dirname,p.name+'-receipt.json'),log:path.join(__dirname,p.name+'.log')};records.push(row);json(p.name+'-actual-result',row);console.log(JSON.stringify({...row,code:receipt.code,closed:receipt.processClosed,group:receipt.remainingOwnedGroupMembers,elapsedMs:receipt.elapsedMs}));
  if(!complete)throw Error('ACTUAL_REGRESSION_FAILED:'+p.name);
 }
 }catch(error){failure={message:error.message,stack:error.stack};}
 finally{try{admit(GUARD+FINAL);guard('source-after');admit(FINAL);}catch(error){failure??={message:error.message,stack:error.stack};}
  const result={at:new Date().toISOString(),oneBirth:true,budgetMs:TOTAL,elapsedMs:performance.now()-born,retry:0,records,notRun:plan.filter(p=>!records.some(r=>r.name===p.name)).map(p=>p.name),failure,code:failure?1:0,externalModelFixtureOnly:true,appExecuted:false,productDistBuild:false};json('SUMMARY',result);clearTimeout(timer);console.log(JSON.stringify(result));if(failure)process.exitCode=1;
 }
})().catch(error=>{console.error(error);clearTimeout(timer);process.exitCode=1;});
