'use strict';
// Root明确授权：仅owned poll帧读owned.errors；不调用业务/DB；立即resume并关闭自己新开的inspector。
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const phase='/Volumes/T7-MacData/CodexBuilds/t1334-tool-visibility-20261017-706cfbe7/diagnostic-research-v3',out=path.join(phase,'debugger-read-owned-errors');fs.mkdirSync(out,{mode:0o700});
const pid=1291,expectedStart='Sat Oct 17 14:57:57 2026',pollSource='agentic-task-tool-visibility.persistence-client.test.ts',at=()=>new Date().toISOString(),identity=()=>cp.spawnSync('/bin/ps',['-p',String(pid),'-o','pid=,ppid=,pgid=,lstart=,command='],{encoding:'utf8'}).stdout.trim();
const before=identity();if(!before.includes(expectedStart)||!before.includes('1291  1270  1270')||!before.endsWith('/node_modules/vitest/dist/workers/forks.js'))throw Error('EXACT_OWNED_VITEST_IDENTITY_REQUIRED');
const portBefore=cp.spawnSync('/usr/sbin/lsof',['-nP','-iTCP:9229','-sTCP:LISTEN'],{encoding:'utf8'});if(portBefore.stdout.trim())throw Error('INSPECTOR_PORT_ALREADY_OWNED');
const record={authorization:'Root一次只读Debugger原poll帧仅owned.errors',pid,before,startedAt:at(),portInitiallyUnused:true,sourceBytesChanged:false,businessOrDbExpressionsEvaluated:0,originalDeadlinePreserved:true};fs.writeFileSync(path.join(out,'START.json'),JSON.stringify(record,null,2)+'\n');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws,sequence=0,pending=new Map(),scripts=[],pause,breakpointId;let pauseResolve;const pausePromise=new Promise(r=>pauseResolve=r);const budget=Date.now()+120000;let closingScheduled=false;
function request(method,params={}){return new Promise((yes,no)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);no(Error('INSPECTOR_REQUEST_TIMEOUT'));},120000);pending.set(id,{yes,no,timer});ws.send(JSON.stringify({id,method,params}));});}
async function main(){
 process.kill(pid,'SIGUSR1');record.inspectorStartedByThisProbe=true;
 let target;
 while(Date.now()<budget){try{const rows=await(await fetch('http://127.0.0.1:9229/json/list',{signal:AbortSignal.timeout(120000)})).json();target=rows[0];if(target)break;}catch{}await sleep(100);}
 if(!target?.webSocketDebuggerUrl?.startsWith('ws://127.0.0.1:9229/'))throw Error('LOOPBACK_ONLY_INSPECTOR_REQUIRED');
 const actualPort=cp.spawnSync('/usr/sbin/lsof',['-nP','-iTCP:9229','-sTCP:LISTEN'],{encoding:'utf8'}).stdout;if(!actualPort.split('\n').some(l=>l.trim().split(/\s+/)[1]===String(pid)&&l.includes('127.0.0.1:9229')))throw Error('INSPECTOR_OWNER_PID_MISMATCH');
 ws=new WebSocket(target.webSocketDebuggerUrl);ws.addEventListener('message',event=>{const value=JSON.parse(event.data);if(value.id){const r=pending.get(value.id);if(r){pending.delete(value.id);clearTimeout(r.timer);value.error?r.no(Error(value.error.message)):r.yes(value.result);}}else if(value.method==='Debugger.scriptParsed'&&value.params.url.includes(pollSource))scripts.push(value.params);else if(value.method==='Debugger.paused'){pause=value.params;record.pausedAt=at();pauseResolve(pause);}});
 await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});await request('Debugger.enable');
 if(!scripts.length)throw Error('ORIGINAL_POLL_SCRIPT_NOT_FOUND');const script=scripts.at(-1);const {scriptSource}=await request('Debugger.getScriptSource',{scriptId:script.scriptId});const lines=scriptSource.split('\n');const lineNumber=lines.findIndex(line=>line.includes('public-current'));if(lineNumber<0)throw Error('ORIGINAL_POLL_LINE_NOT_FOUND');record.pollScript={url:script.url,scriptId:script.scriptId,lineNumber};
 const point=await request('Debugger.setBreakpoint',{location:{scriptId:script.scriptId,lineNumber}});breakpointId=point.breakpointId;
 const stop=await Promise.race([pausePromise,sleep(Math.max(0,budget-Date.now())).then(()=>{throw Error('ORIGINAL_POLL_PAUSE_TIMEOUT');})]);
 const frame=stop.callFrames.find(f=>f.location.scriptId===script.scriptId);if(!frame)throw Error('POLL_FRAME_BINDING_UNAVAILABLE');
 const value=await request('Debugger.evaluateOnCallFrame',{callFrameId:frame.callFrameId,expression:'owned.errors',returnByValue:true,throwOnSideEffect:true});if(value.exceptionDetails)throw Error('OWNED_ERRORS_BINDING_UNAVAILABLE');record.ownedErrors=value.result.value;record.onlyReadExpression='owned.errors';
}
(async()=>{try{await main();}catch(e){record.error={name:e.name,message:e.message};}finally{
 try{if(ws?.readyState===WebSocket.OPEN){if(breakpointId)await request('Debugger.removeBreakpoint',{breakpointId});if(pause){await request('Debugger.resume');record.resumedAt=at();}await request('Debugger.disable');const r=await request('Runtime.evaluate',{expression:"setImmediate(()=>process.getBuiltinModule('inspector').close()); 'INSPECTOR_CLOSE_SCHEDULED'",returnByValue:true});closingScheduled=r.result?.value==='INSPECTOR_CLOSE_SCHEDULED';record.inspectorCleanupOnlyExpression=true;ws.close();}}catch(e){record.cleanupError={name:e.name,message:e.message};try{ws?.close();}catch{}}
 for(const r of pending.values())clearTimeout(r.timer);pending.clear();
 let remaining='';for(let i=0;i<100;i++){remaining=cp.spawnSync('/usr/sbin/lsof',['-nP','-iTCP:9229','-sTCP:LISTEN'],{encoding:'utf8'}).stdout.trim();if(!remaining)break;await sleep(100);}record.inspectorCloseScheduled=closingScheduled;record.inspectorPortAfterUnused=!remaining;record.identityAfter=identity();record.finishedAt=at();record.pauseIntervalExcludedFromNaturalTiming=true;fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({ownedErrors:record.ownedErrors??null,error:record.error??null,cleanupError:record.cleanupError??null,pausedAt:record.pausedAt,resumedAt:record.resumedAt,inspectorPortAfterUnused:record.inspectorPortAfterUnused}));
 }})();
