import {generateText} from "ai";
import type {LanguageModelV4} from "@ai-sdk/provider";
import {expect,it,vi} from "vitest";
import {createDurableGenerationModel} from "./durable-generation-model";
import {codexCallAuthority} from './codex-call-context';

function fixture(allowUnconfirmedModelRetry:boolean,providerName='fixture'){
  const states:string[]=[];
  const provider:LanguageModelV4={
    specificationVersion:"v4",provider:providerName,modelId:"fixture",supportedUrls:{},
    doGenerate:vi.fn(async()=>{throw Error("connection closed");}),
    doStream:async()=>{throw Error("no stream");},
  };
  const model=createDurableGenerationModel({model:provider,operationKey:"generate",allowUnconfirmedModelRetry,ports:{
    reserve:async()=>({callId:"call",status:"reserved"}),
    start:async()=>{states.push("started");},
    settle:async(_callId,value)=>{states.push(value.status);},
  }});
  return {model,states};
}

it("持续 Agent 节点可废弃网络断开的模型候选并续跑",async()=>{
  const f=fixture(true);
  await expect(generateText({model:f.model,prompt:"继续",maxRetries:0})).rejects.toMatchObject({outcome:"retry_wait"});
  expect(f.states).toEqual(["started","superseded"]);
});

it('Codex即使文本节点准许Pi候选重试，普通网络断开仍保留原call未知',async()=>{
  const f=fixture(true,'codex-app-server');
  await expect(generateText({model:f.model,prompt:'继续',maxRetries:0})).rejects.toMatchObject({outcome:'unknown_result'});
  expect(f.states).toEqual(['started','unknown']);
});

it('Codex原结果绑定确认丢失只读原call；已结算providerResult直接回放',async()=>{
 const states:string[]=[],contexts:Array<{callId:string;recover:boolean}|undefined>=[];
 const receipt={content:[{type:'text' as const,text:'原回合结果'}],finishReason:{unified:'stop' as const,raw:'completed'},usage:{inputTokens:{total:4,noCache:4,cacheRead:undefined,cacheWrite:undefined},outputTokens:{total:3,text:3,reasoning:undefined}},warnings:[]};
 let status='reserved',providerResult:unknown,starts=0,originalTurns=0;
 const provider:LanguageModelV4={specificationVersion:'v4',provider:'codex-app-server',modelId:'codex-default',supportedUrls:{},doStream:async()=>{throw Error('no stream');},doGenerate:vi.fn(async()=>{
  const authority=codexCallAuthority.getStore();contexts.push(authority);
  if(!authority?.recover){originalTurns++;throw Error('connection closed');}
  return receipt;
 })};
 const ports={reserve:async()=>({callId:'original-call',status,providerResult}),start:async()=>{starts++;status='started';},settle:async(_id:string,value:any)=>{states.push(value.status);status=value.status;if(value.providerResult)providerResult=value.providerResult;}};
 const run=()=>generateText({model:createDurableGenerationModel({model:provider,operationKey:'same-node',allowUnconfirmedModelRetry:true,ports}),prompt:'原请求',maxRetries:0});
 await expect(run()).rejects.toMatchObject({outcome:'unknown_result'});
 expect((await run()).text).toBe('原回合结果');expect((await run()).text).toBe('原回合结果');
 expect(originalTurns).toBe(1);expect(starts).toBe(1);expect(contexts).toEqual([{callId:'original-call',recover:false},{callId:'original-call',recover:true}]);expect(states).toEqual(['unknown','settled']);
});

it("未声明持续恢复的调用仍保持未知结果边界",async()=>{
  const f=fixture(false);
  await expect(generateText({model:f.model,prompt:"继续",maxRetries:0})).rejects.toMatchObject({outcome:"unknown_result"});
  expect(f.states).toEqual(["started","unknown"]);
});
