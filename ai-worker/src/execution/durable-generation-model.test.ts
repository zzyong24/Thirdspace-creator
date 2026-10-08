import {generateText} from "ai";
import type {LanguageModelV4} from "@ai-sdk/provider";
import {expect,it,vi} from "vitest";
import {createDurableGenerationModel} from "./durable-generation-model";

function fixture(allowUnconfirmedModelRetry:boolean){
  const states:string[]=[];
  const provider:LanguageModelV4={
    specificationVersion:"v4",provider:"fixture",modelId:"fixture",supportedUrls:{},
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

it("未声明持续恢复的调用仍保持未知结果边界",async()=>{
  const f=fixture(false);
  await expect(generateText({model:f.model,prompt:"继续",maxRetries:0})).rejects.toMatchObject({outcome:"unknown_result"});
  expect(f.states).toEqual(["started","unknown"]);
});
