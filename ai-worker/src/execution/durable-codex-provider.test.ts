import {expect,it,vi} from 'vitest';
import {generateText} from 'ai';
import {codexExecutionSpec} from '@creatoros/contract/execution-worker';
const boundary=vi.hoisted(()=>({native:vi.fn(),read:vi.fn(),close:vi.fn()}));
vi.mock('./codex-app-server',async original=>({...await original<typeof import('./codex-app-server')>(),createControlledCodexSession:vi.fn(async()=>({rpc:{close:boundary.close},authenticated:true,mcpNames:{}}))}));
vi.mock('./codex-native-turn',()=>({runCodexNativeTurn:boundary.native,recoverCodexNativeTurn:boundary.read}));
import {createCodexProviderModel} from '../runtime/codex-provider';
import {createDurableGenerationModel} from './durable-generation-model';
import {codexWorkerPorts} from './codex-call-context';

it('真实Codex provider最终bind确认普通网络丢失，原call只读thread/turn恢复且已结算不再进provider',async()=>{
 const result={text:'原生成结果',sessionId:'official-thread',providerTurnId:'official-turn',model:'actual-model',modelProvider:'openai',images:[],usage:{inputTokens:7,outputTokens:5,totalTokens:12,cachedReadTokens:0,thoughtTokens:0}};
 boundary.native.mockImplementation(async input=>{await input.onThread(result.sessionId);await input.onTurn(result.providerTurnId);return result;});
 boundary.read.mockResolvedValue(result);
 let status='reserved',providerResult:unknown,failFinalAck=true,starts=0;
 const binding:Record<string,unknown>={},states:string[]=[],calls:Array<{port:string;data:any}>=[];
 const call=vi.fn(async(port,data:any)=>{
  calls.push({port,data});
  if(port==='readCodexCall')return {...binding};
  if(port==='bindCodexCall'){
   Object.assign(binding,data);
   if(data.modelFacts&&failFinalAck){failFinalAck=false;throw Error('connection closed');}
   return {callId:data.callId,budgetExceeded:false};
  }
  throw Error(`unexpected port ${port}`);
 });
 const ports={reserve:async()=>({callId:'original-call',status,providerResult}),start:async()=>{starts++;status='started';},settle:async(_id:string,input:any)=>{status=input.status;states.push(status);if(input.providerResult)providerResult=input.providerResult;}};
 const signal=new AbortController().signal;
 const run=()=>codexWorkerPorts.run(call,()=>generateText({model:createDurableGenerationModel({model:createCodexProviderModel(codexExecutionSpec()),operationKey:'hooks:original-parent',ports,allowUnconfirmedModelRetry:true,signal}),prompt:'原授权请求',maxRetries:0,abortSignal:signal}));
 await expect(run()).rejects.toMatchObject({outcome:'unknown_result'});
 expect(binding).toMatchObject({callId:'original-call',threadId:'official-thread',turnId:'official-turn',observedUsage:{inputTokens:7,outputTokens:5,totalTokens:12}});
 expect((await run()).text).toBe(result.text);expect((await run()).text).toBe(result.text);
 expect(boundary.native).toHaveBeenCalledTimes(1);expect(boundary.read).toHaveBeenCalledExactlyOnceWith(expect.anything(),'official-thread','official-turn');expect(starts).toBe(1);expect(states).toEqual(['unknown','settled']);
 expect(calls.filter(item=>item.port==='readCodexCall')).toEqual([{port:'readCodexCall',data:{callId:'original-call'}}]);
});
