import { describe, it, expect, vi } from "vitest";
import type { Db } from "@creatoros/backend";
import type { AiService } from "@creatoros/backend/modules/ai";
const fixture=vi.hoisted(()=>({db:undefined as Db|undefined,ai:undefined as AiService|undefined,
  tools:new Map<string,Parameters<typeof import("@creatoros/backend/modules/execution").createAgenticExecutor>[0]["resolveTools"]>()}));
vi.mock("@creatoros/backend",async original=>{
  const actual=await original<typeof import("@creatoros/backend")>();
  return {...actual,createConfiguredDb:async(...args:Parameters<typeof actual.createConfiguredDb>)=>{const result=await actual.createConfiguredDb(...args);fixture.db=result.db;return result;}};
});
vi.mock("@creatoros/backend/modules/ai",async original=>{
  const actual=await original<typeof import("@creatoros/backend/modules/ai")>();
  return {...actual,createAiService:(deps:Parameters<typeof actual.createAiService>[0])=>{const result=actual.createAiService(deps);fixture.ai=result;return result;}};
});
vi.mock("@creatoros/backend/modules/execution",async original=>{
  const actual=await original<typeof import("@creatoros/backend/modules/execution")>();
  return {...actual,createAgenticExecutor:(deps:Parameters<typeof actual.createAgenticExecutor>[0])=>{fixture.tools.set(deps.taskType,deps.resolveTools);return actual.createAgenticExecutor(deps);}};
});
vi.mock("./ingestion/web-reader",async original=>{
  const actual=await original<typeof import("./ingestion/web-reader")>();
  return {...actual,readUrl:async(url:string)=>({title:"测试来源",text:"原文的真实测试替身",finalUrl:url,extractor:"readability"})};
});
import { assets,knowledgeItems,entityTags } from "@creatoros/backend";
import { ENDPOINTS } from "@creatoros/contract";
import { getChatRuntime,compositeTransport,__resetPersistenceForTests } from "./persistence-client";
describe("候选工具到公开确认的实际装配",()=>{
  it.each(["agentic.research","agentic.material"])("%s 真实租约、工具、预览与重复采纳",async kind=>{
    vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR","");__resetPersistenceForTests();
    try{
      await getChatRuntime();const ai=fixture.ai!;const db=fixture.db!;
      const ctx={userId:"proposal-runtime",accountId:"proposal-runtime",requestId:"r",source:"user" as const};
      const stamp=new Date().toISOString();
      await db.insert(assets).values({id:"material",userId:ctx.userId,accountId:ctx.accountId,name:"示例素材",assetType:"image",createdAt:stamp,updatedAt:stamp});
      const task=await ai.createTask(ctx,{taskType:`exec.${kind}`,inputData:{spec:{taskType:kind,goal:"生成建议",inputs:[],params:{}}}});
      const toolMap=Object.fromEntries(fixture.tools.get(kind)!(ctx,{taskId:task.id}).map(tool=>[tool.name,tool]));
      await ai.runClaimedTaskExecution(ctx,task.id,async({signal})=>{
        let proposal:unknown;
        const opts={signal,dryRun:false,toolCallId:"call-1"};
        if(kind==="agentic.research"){
          await expect(toolMap["knowledge.write"]!.execute({title:"知识",note:"总结",sourceNote:"https://example.com"},opts)).rejects.toThrow("已读取");
          for(let i=0;i<9;i++)await toolMap["web.read"]!.execute({url:`https://example.com/${i}`},opts);
          proposal=(await toolMap["knowledge.write"]!.execute({title:"知识",note:"总结",sourceNote:"https://example.com/0"},opts)).data;
        }else{
          const before=await toolMap["material.organize"]!.execute({assetIds:["material"],tag:"示例标签"},opts);
          expect(await toolMap["material.organize"]!.execute({assetIds:["material"],tag:"示例标签"},opts)).toEqual(before);
          proposal=before.data;
        }
        expect(await db.select().from(knowledgeItems)).toHaveLength(0);
        expect(await db.select().from(entityTags)).toHaveLength(0);
        await ai.recordCandidate(ctx,task.id,{resultType:"agentic_proposals",resultData:{taskType:kind,summary:"待采纳的建议",proposals:[(proposal as {proposal:unknown}).proposal]}});
      });
      const request={params:{taskId:task.id},query:undefined,body:undefined};
      const preview=await compositeTransport.request(ENDPOINTS.getExecutionTask,request,ctx) as {data:{manifest:{proposals:unknown[];artifacts:unknown[]}}};
      expect(preview.data.manifest.proposals).toHaveLength(1);expect(preview.data.manifest.artifacts).toHaveLength(0);
      for(let i=0;i<2;i++)expect(await compositeTransport.request(ENDPOINTS.confirmExecutionTask,request,ctx)).toMatchObject({data:{status:"succeeded"}});
      expect(await db.select().from(knowledgeItems)).toHaveLength(kind==="agentic.research" ? 1 : 0);
      expect(await db.select().from(entityTags)).toHaveLength(kind==="agentic.material" ? 1 : 0);
    }finally{await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();vi.unstubAllEnvs();}
  },30000);
  it("预演通过真实租约原子记录成功，只投影计划不生成候选",async()=>{
    vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR","");__resetPersistenceForTests();
    try{
      await getChatRuntime();const ai=fixture.ai!;
      const ctx={userId:"plan-runtime",accountId:"plan-runtime",requestId:"r",source:"user" as const};
      const task=await ai.createTask(ctx,{taskType:"exec.agentic.research",inputData:{spec:{taskType:"agentic.research",goal:"预演",inputs:[],params:{dryRun:true}}}});
      await ai.runClaimedTaskExecution(ctx,task.id,async()=>{
        await ai.recordExecutionPlan(ctx,task.id,{taskType:"agentic.research",summary:"拟调研来源并形成知识建议",output:{plan:"生成建议后供用户检查"}});
      });
      expect(await compositeTransport.request(ENDPOINTS.getExecutionTask,{params:{taskId:task.id},query:undefined,body:undefined},ctx)).toMatchObject({data:{status:"succeeded",manifest:{summary:"拟调研来源并形成知识建议",artifacts:[],meta:{dryRun:true}}}});
      expect((await ai.listResults(ctx,task.id)).map(r=>r.resultType)).toEqual(["execution_plan"]);
    }finally{await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();vi.unstubAllEnvs();}
  },30000);

});
