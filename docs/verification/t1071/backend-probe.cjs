const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const ts = require(path.join(root, 'frontend/node_modules/typescript'));
function load(relative, stubs) {
  const source = fs.readFileSync(root + '/' + relative, 'utf8');
  const code = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const exports = {};
  const context = {exports,require: name => {if(Object.hasOwn(stubs,name)) return stubs[name];throw Error('未授权依赖: '+name);},Promise,AbortController,ReadableStream,TextEncoder,Response,structuredClone,Date,console,process:{env:{}},setInterval,clearInterval,setTimeout,clearTimeout};
  context.globalThis = context;
  vm.runInNewContext(code,context,{filename:relative});
  return exports;
}
const mode = process.argv[2];
(async()=>{
  if(mode==='sse') {
    const count = Number(process.argv[3] || 1000);
    const {chatExecutionResponse} = load('frontend/src/server/chat-execution-stream.ts',{'@/lib/ai-error-humanize':{humanizeAiError:()=>null}});
    const {subscribeExecutionStream}=load('backend/src/modules/execution/execution-stream.service.ts',{'../../workspace-scope':{},'node:util':require('node:util'),'@creatoros/backend':{},'@creatoros/contract/execution-worker':{},'./execution-lease.service':{},'./execution.errors':{}});
    const content = 'x'.repeat(32*1024);
    let produced=0,done;
    const complete = new Promise(r=>{done=r;});
    const readService={read:async(_ctx,_id,{afterSequence})=>{const end=Math.min(count,afterSequence+100);const events=[];for(let i=afterSequence;i<end;i++){produced++;events.push({sequence:i+1,chunk:{type:'text-delta',id:'synthetic',delta:content}});}return {events,nextSequence:end,hasMore:end<count,status:'succeeded',attempt:1};}};
    const runtime={subscribe:async function*(ctx,id,signal){try{yield* subscribeExecutionStream(readService,ctx,id,{signal});}finally{done();}},get:async()=>({})};
    global.gc();const before=process.memoryUsage();
    const response=chatExecutionResponse(runtime,{userId:'synthetic-user'},{executionTaskId:'synthetic-task',sourceMessageId:'synthetic-message',conversationId:'synthetic-conversation'},new AbortController().signal);
    // 刻意没有 reader；所有输入均为合成文本，不走 HTTP/数据库/模型。
    await complete;await new Promise(r=>setImmediate(r));global.gc();
    const queued=process.memoryUsage();
    await response.body.cancel();global.gc();global.gc();
    const cancelled=process.memoryUsage();
    console.log(JSON.stringify({probe:'真实 chatExecutionResponse + subscribeExecutionStream，合成 read 端口，未消费响应体',count,produced,before,queued,cancelled,arrayBuffersDelta:queued.arrayBuffers-before.arrayBuffers,expectedPayloadBytes:count*32*1024},null,2));
  } else if(mode==='cron') {
    let callback,active=0,peak=0,startup=true;const gates=[];
    const cron={validate:()=>true,schedule:(_pattern,fn)=>{callback=fn;return {stop(){},destroy(){}};}};
    const {startAutomationDriver}=load('backend/src/modules/ai-runtime/automation-driver.ts',{'./scheduled-collection-scheduler':{cronMatchesMinute:()=>false},'node-cron':cron});
    const tasks={recoverExpiredLeases:async()=>({}),claimNext:async()=>null};
    const deps={ctx:{userId:'synthetic-user'},tasks,registry:{isSealed:()=>true},listRunnableJobs:async()=>{if(startup){startup=false;return [];}active++;peak=Math.max(peak,active);await new Promise(r=>gates.push(r));active--;return [];},now:()=>new Date().toISOString(),workerId:'synthetic-worker'};
    await startAutomationDriver(deps);
    for(let i=0;i<10;i++)callback();
    await new Promise(r=>setImmediate(r));
    const during={callbacks:10,active,peak,gates:gates.length};
    for(const release of gates)release();
    await new Promise(r=>setImmediate(r));
    console.log(JSON.stringify({probe:'真实 startAutomationDriver / tick，合成 cron 与慢业务端口；模拟 10 次分钟回调',during,after:{active,peak}},null,2));
  } else throw Error('未知模式');
})().catch(e=>{console.error(e);process.exitCode=1;});
