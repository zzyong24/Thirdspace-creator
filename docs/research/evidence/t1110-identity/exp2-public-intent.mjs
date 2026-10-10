import fs from 'node:fs';import crypto from 'node:crypto';
const state=JSON.parse(fs.readFileSync('/tmp/t1110-identity-exp2-server-state.json','utf8'));
const origin=state.origin,groupId='grp-4eb3a857-5',accountId='acct-3eba3525-70',base=state.dataRoot;
if(state.schema!=='t1110-identity-only-research-host/v1'||origin!=='http://127.0.0.1:31412'||!state.readyAt)throw Error('研究宿主未就绪');
const file=base+'/identity-exp2-public-intent-20261010.json';if(fs.existsSync(file))throw Error('本EXP2已有intent文件，禁止第二次start');
const requestLog=[];
async function dispatch(id,input,account=false){const response=await fetch(origin+'/api/v1/dispatch',{method:'POST',headers:{'content-type':'application/json',origin,'x-group-id':groupId,...(account?{'x-account-id':accountId}:{})},body:JSON.stringify({id,input}),signal:AbortSignal.timeout(120000)});const body=await response.json();requestLog.push({at:new Date().toISOString(),id,input,http:response.status});if(!response.ok)throw Error('公开操作HTTP '+response.status);return body;}
const prior=await Promise.all([dispatch('accounts.bind.status',{params:{runId:'execution-task-51a95619-83'}}),dispatch('platforms.collections.get',{params:{accountId,attemptId:'collection-51a95619-62'}},true),dispatch('platforms.reports.list',{params:{accountId},query:{pageSize:100,cursor:null}},true)]);
fs.writeFileSync(base+'/identity-exp2-public-preflight-20261010.json',JSON.stringify(prior,null,2)+'\n',{mode:0o600});
if(prior[0].data.status!=='failed'||prior[0].data.accountId!==null||prior[1].data.status!=='failed'||prior[1].data.committedPages!==0||prior[2].data.items.length!==0)throw Error('原任务与报告前置不符');
const intent={experiment:'EXP-2',startedAt:new Date().toISOString(),clientRequestId:'t1110-identity-only-exp2-'+crypto.randomUUID(),operation:'platforms.collections.start',accountId,groupId,scope:'identity-only, no report preparation/download/commit; original62/83 preserved',singleSubmit:true};
fs.writeFileSync(file,JSON.stringify(intent,null,2)+'\n',{mode:0o600});
let started;
try{started=await dispatch('platforms.collections.start',{params:{accountId},body:{capability:'nativeReports',clientRequestId:intent.clientRequestId}},true);}catch(error){intent.startOutcome='UNKNOWN_OR_REJECTED_NO_RESUBMIT';intent.failedAt=new Date().toISOString();fs.writeFileSync(file,JSON.stringify(intent,null,2)+'\n');fs.writeFileSync(base+'/identity-exp2-public-requests-20261010.json',JSON.stringify(requestLog,null,2)+'\n');throw error;}
intent.attemptId=started.data.attemptId;intent.runStartedAt=started.data.startedAt;fs.writeFileSync(file,JSON.stringify(intent,null,2)+'\n');fs.writeFileSync(base+'/identity-exp2-public-start-20261010.json',JSON.stringify(started,null,2)+'\n');
console.log(JSON.stringify({experiment:'EXP-2',attemptId:intent.attemptId,status:started.data.status,submittedOnce:true,reportCountBefore:0,originalTasksPreserved:true}));
const deadlineAt=Date.parse(started.data.startedAt)+1800000,observationEnd=deadlineAt+120000;let last=started;
while(Date.now()<observationEnd){last=await dispatch('platforms.collections.get',{params:{accountId,attemptId:intent.attemptId}},true);if(['complete','partial','needsAuth','failed','cancelled'].includes(last.data.status))break;await new Promise(r=>setTimeout(r,1000));}
fs.writeFileSync(base+'/identity-exp2-public-final-20261010.json',JSON.stringify(last,null,2)+'\n');
const after=await Promise.all([dispatch('platforms.reports.list',{params:{accountId},query:{pageSize:100,cursor:null}},true),dispatch('accounts.bind.status',{params:{runId:'execution-task-51a95619-83'}}),dispatch('platforms.collections.get',{params:{accountId,attemptId:'collection-51a95619-62'}},true)]);
fs.writeFileSync(base+'/identity-exp2-public-after-20261010.json',JSON.stringify(after,null,2)+'\n');fs.writeFileSync(base+'/identity-exp2-public-requests-20261010.json',JSON.stringify(requestLog,null,2)+'\n');
console.log(JSON.stringify({experiment:'EXP-2',attemptId:intent.attemptId,status:last.data.status,reasonCode:last.data.reasonCode,committedPages:last.data.committedPages,reportCountAfter:after[0].data.items.length,officialStatusAfter:after[1].data.status,officialAccountAfter:after[1].data.accountId,originalVideoStatusAfter:after[2].data.status,observedAt:new Date().toISOString()}));
if(!['failed','needsAuth','partial','cancelled'].includes(last.data.status)||last.data.committedPages!==0||after[0].data.items.length!==0)process.exitCode=1;
