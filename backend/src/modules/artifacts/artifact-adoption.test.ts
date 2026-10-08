import {projects,type Db as FixtureDb} from '@creatoros/backend';
async function seedOwnedProjects(db:FixtureDb){
 const rows=([["p", "u", "a"]] as Array<[string,string,string]>).map(([id,userId,accountId])=>({id,userId,accountId,title:'真实测试父项目',brief:'',creationMode:'guided',status:'active',currentStage:'script',startedAt:new Date().toISOString(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}));
 await db.insert(projects).values(rows).onConflictDoNothing();
}
import { describe,it,expect,vi } from "vitest";
import { createDb } from "@creatoros/backend";
import { createArtifactsService } from "./artifacts.service";
import { randomUUID } from "node:crypto";
const ctx={userId:"u",accountId:"a",requestId:"r",source:"user" as const};
describe("文稿候选幂等采纳",()=>{
  it("并发复用首次版本，重放不覆盖后续编辑且搜索仍指向当前内容",async()=>{
    const opened=await createDb();await seedOwnedProjects(opened.db);const searchUpsert=vi.fn(async()=>{});
    const service=createArtifactsService({db:opened.db,now:()=>new Date().toISOString(),nextId:p=>`${p}-${randomUUID()}`,searchUpsert});
    try{
      const artifact=await service.createArtifact(ctx,{projectId:"p",title:"结构",artifactType:"content_outline",stage:"planning"});
      const input={contentText:"AI候选",contentData:{opening:"开始"},createdByType:"ai",aiTaskId:"task",adoptionKey:"candidate:1",adoptionSourceDigest:"sha256:"+"1".repeat(64)};
      const saved=await Promise.all(Array.from({length:20},()=>service.createVersion(ctx,artifact.id,input)));
      expect(new Set(saved.map(row=>row.id)).size).toBe(1);expect(await service.listVersions(ctx,artifact.id)).toHaveLength(2);
      const edit=await service.createVersion(ctx,artifact.id,{contentText:"用户后续编辑"});
      expect((await service.createVersion(ctx,artifact.id,{...input,contentData:{opening:"凝固结果可能改变"}})).id).toBe(saved[0]!.id);
      expect((await service.getArtifact(ctx,artifact.id)).currentVersionId).toBe(edit.id);
      expect(searchUpsert).toHaveBeenLastCalledWith(ctx,expect.objectContaining({body:"用户后续编辑"}));
      await expect(service.createVersion(ctx,artifact.id,{...input,adoptionSourceDigest:"sha256:"+"2".repeat(64)})).rejects.toThrow("原候选");
      await expect(service.createVersion({...ctx,accountId:"other"},artifact.id,input)).rejects.toThrow();
      await expect(service.createVersion(ctx,artifact.id,{...input,adoptionSourceDigest:undefined})).rejects.toThrow("来源无效");
    }finally{await opened.client.close();}
  });
});
