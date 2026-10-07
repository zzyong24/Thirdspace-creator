const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../..');
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
(async()=>{
 const {chatExecutionResponse}=load('frontend/src/server/chat-execution-stream.ts',{'@/lib/ai-error-humanize':{humanizeAiError:()=>null}});
 const {subscribeExecutionStream}=load('backend/src/modules/execution/execution-stream.service.ts',{'../../workspace-scope':{},'node:util':require('node:util'),'@creatoros/backend':{},'@creatoros/contract/execution-worker':{},'./execution-lease.service':{},'./execution.errors':{}});
 const count=2000,content='x'.repeat(32*1024);let produced=0,released=false;
 const readService={read:async(_ctx,_id,{afterSequence})=>{const end=Math.min(count,afterSequence+64),events=[];for(let i=afterSequence;i<end;i++){produced++;events.push({sequence:i+1,chunk:{type:'text-delta',id:'synthetic',delta:content}});}return {events,nextSequence:end,hasMore:end<count,status:'succeeded',attempt:1};}};
 const runtime={subscribe:async function*(ctx,id,signal){try{yield* subscribeExecutionStream(readService,ctx,id,{signal});}finally{released=true;}},get:async()=>({})};
 const gc=()=>{global.gc();global.gc();return process.memoryUsage().arrayBuffers;};
 const before=gc(),response=chatExecutionResponse(runtime,{userId:'synthetic-user'},{executionTaskId:'synthetic-task',sourceMessageId:'synthetic-message',conversationId:'synthetic-conversation'},new AbortController().signal);
 await new Promise(r=>setImmediate(r));const idle={produced,arrayBuffersDelta:gc()-before};
 const reader=response.body.getReader();await reader.read();await reader.read();await new Promise(r=>setImmediate(r));const paused={produced,arrayBuffersDelta:gc()-before};
 await reader.cancel();await new Promise(r=>setImmediate(r));const cancelled={produced,released,arrayBuffersDelta:gc()-before};
 if(idle.produced!==0||paused.produced!==64||!released)throw Error('背压或释放失效');
 console.log(JSON.stringify({probe:'实际SSE/持久订阅函数，合成只读端口；不访问真实库/账号',count,eventBytes:32768,idle,paused,cancelled},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
