import { describe, it, expect } from "vitest";
import { createDb, aiTasks, aiTaskResults, knowledgeItems, eq } from "@creatoros/backend";
import { createAgenticProposalStagingService } from "./agentic-proposal-staging.service";
const ctx = {userId:"u",accountId:"a",requestId:"r",source:"user" as const};
const input = {kind:"knowledge.create" as const,toolCallId:"call",title:"标题",note:"正文",sourceNote:"https://example.com",evidenceRefs:["https://example.com"]};
async function setup(){
  const fixture=await createDb();
  await fixture.db.insert(aiTasks).values({id:"parent",userId:"u",accountId:"a",taskType:"exec.agentic.research",status:"running",idempotencyKey:"task",requestedAt:new Date().toISOString(),leaseToken:"lease",leaseExpiresAt:"2099-01-01T00:00:00.000Z"});
  return fixture;
}
describe("自主候选staging持久回执与执行权",()=>{
  it("稳定调用重放同一候选、不同内容拒绝，采纳前无知识写入",async()=>{
    const f=await setup();try{
      const stage=createAgenticProposalStagingService(f.db,{resolveLease:()=>({leaseToken:"lease"}),prepareAssets:async()=>[]});
      const first=await stage.stage(ctx,"parent",input,new AbortController().signal);
      expect(await stage.stage(ctx,"parent",input,new AbortController().signal)).toEqual(first);
      await expect(stage.stage(ctx,"parent",{...input,note:"改写"},new AbortController().signal)).rejects.toThrow("不同候选");
      expect(await f.db.select().from(aiTaskResults)).toHaveLength(1);
      expect(await f.db.select().from(knowledgeItems)).toHaveLength(0);
      await expect(stage.stage({...ctx,accountId:"other"},"parent",input,new AbortController().signal)).rejects.toThrow();
    }finally{await f.client.close();}
  });
  it("同running任务被新租约接管后，旧执行不能追加回执",async()=>{
    const f=await setup();try{
      const stage=createAgenticProposalStagingService(f.db,{resolveLease:()=>({leaseToken:"lease"}),prepareAssets:async()=>{
        await f.db.update(aiTasks).set({leaseToken:"new-lease"}).where(eq(aiTasks.id,"parent"));
        return [{assetId:"a1",expectedVersion:"snapshot"}];
      }});
      await expect(stage.stage(ctx,"parent",{kind:"asset.tags",toolCallId:"call",assetIds:["a1"],tag:"标签",evidenceRefs:["a1"]},new AbortController().signal)).rejects.toThrow("执行权");
      expect(await f.db.select().from(aiTaskResults)).toHaveLength(0);
    }finally{await f.client.close();}
  });
  it("准备期间取消，事务门阻止回执写入",async()=>{
    const f=await setup();try{
      const abort=new AbortController();
      const stage=createAgenticProposalStagingService(f.db,{resolveLease:()=>({leaseToken:"lease"}),prepareAssets:async()=>{abort.abort();return [{assetId:"a1",expectedVersion:"snapshot"}];}});
      await expect(stage.stage(ctx,"parent",{kind:"asset.tags",toolCallId:"call",assetIds:["a1"],tag:"标签",evidenceRefs:["a1"]},abort.signal)).rejects.toThrow();
      expect(await f.db.select().from(aiTaskResults)).toHaveLength(0);
    }finally{await f.client.close();}
  });
});
