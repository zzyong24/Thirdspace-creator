import {describe,it,expect} from "vitest";
import {createDb,assets,assetTagAdoptions,entityTags,eq} from "@creatoros/backend";
import {createAssetTagProposalService} from "./asset-tag-proposal.service";
import {createTaxonomyRepository} from "./taxonomy.repository";
import {createTaxonomyService} from "./taxonomy.service";
const ctx={userId:"user",accountId:"account",requestId:"r",source:"user" as const};
async function fixture(){
  const opened=await createDb();let serial=0;
  const deps={now:()=>"2026-09-05T00:00:00.000Z",nextId:(p:string)=>`${p}-${++serial}`};
  await opened.db.insert(assets).values(["a","b"].map(id=>({id,userId:ctx.userId,accountId:ctx.accountId,name:id,assetType:"image",createdAt:deps.now(),updatedAt:deps.now()})));
  return {...opened,service:createAssetTagProposalService(opened.db,deps),taxonomy:createTaxonomyService(createTaxonomyRepository(opened.db,deps))};
}
describe("素材标签建议采纳",()=>{
  it("12次并发重放只打标一次，人工移除后仍返回原回执",async()=>{
    const f=await fixture();try{
      const targets=await f.service.prepare(ctx,["a","b"]);
      const proposal={proposalId:"p",targets,tag:"旅行"};
      const results=await Promise.all(Array.from({length:12},()=>f.service.adopt(ctx,proposal)));
      for(const result of results) expect(result).toEqual(results[0]);
      expect(results[0]!.addedCount).toBe(2);
      expect((await f.taxonomy.listTags(ctx,{}))[0]!.usageCount).toBe(2);
      expect(await f.db.select().from(assetTagAdoptions)).toHaveLength(1);
      await f.taxonomy.removeTag(ctx,{entityType:"asset",entityId:"a",tagId:results[0]!.tagId});
      expect(await f.service.adopt(ctx,proposal)).toEqual(results[0]);
      expect(await f.taxonomy.listTagsForEntity(ctx,{entityType:"asset",entityId:"a"})).toHaveLength(0);
      expect((await f.taxonomy.listTags(ctx,{}))[0]!.usageCount).toBe(1);
    }finally{await f.client.close();}
  });
  it("同proposal不同目标并发仅一方成功，失败方无领域写入",async()=>{
    const f=await fixture();try{
      const targets=await f.service.prepare(ctx,["a","b"]);
      const results=await Promise.allSettled(targets.map(target=>f.service.adopt(ctx,{proposalId:"same",targets:[target],tag:"标签"})));
      expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
      expect(await f.db.select().from(entityTags)).toHaveLength(1);
      expect(await f.db.select().from(assetTagAdoptions)).toHaveLength(1);
    }finally{await f.client.close();}
  });
  it("人工改标签、换文件使版本失效；跨账号和非active目标不可采纳",async()=>{
    const f=await fixture();try{
      const targets=await f.service.prepare(ctx,["a"]);
      const tag=await f.taxonomy.createTag(ctx,{name:"人工"});
      await Promise.all(Array.from({length:8},()=>f.taxonomy.assignTags(ctx,{entityType:"asset",entityId:"a",tagIds:[tag.id]})));
      expect((await f.taxonomy.listTags(ctx,{}))[0]!.usageCount).toBe(1);
      await expect(f.service.adopt(ctx,{proposalId:"stale",targets,tag:"模型"})).rejects.toThrow("变化");
      const fresh=await f.service.prepare(ctx,["a"]);
      await f.db.update(assets).set({currentFileId:"new-file"}).where(eq(assets.id,"a"));
      await expect(f.service.adopt(ctx,{proposalId:"file",targets:fresh,tag:"模型"})).rejects.toThrow("变化");
      await expect(f.service.prepare({...ctx,accountId:"other"},["a"])).rejects.toThrow("不存在");
      await expect(f.taxonomy.assignTags({...ctx,accountId:"other"},{entityType:"asset",entityId:"a",tagIds:[tag.id]})).rejects.toThrow("不存在");
      await f.db.update(assets).set({status:"archived"}).where(eq(assets.id,"b"));
      await expect(f.service.prepare(ctx,["b"])).rejects.toThrow("不存在");
      expect(await f.db.select().from(assetTagAdoptions)).toHaveLength(0);
    }finally{await f.client.close();}
  });
  it("改名与删除标签使快照失效，删除标签后重放不重建关系",async()=>{
    const f=await fixture();try{
      const original={proposalId:"original",targets:await f.service.prepare(ctx,["a"]),tag:"原名"};
      const first=await f.service.adopt(ctx,original);
      const beforeRename=await f.service.prepare(ctx,["a"]);
      await f.taxonomy.renameTag(ctx,first.tagId,{name:"改名"});
      await expect(f.service.adopt(ctx,{proposalId:"rename",targets:beforeRename,tag:"另一个"})).rejects.toThrow("变化");
      const beforeDelete=await f.service.prepare(ctx,["a"]);
      await f.taxonomy.deleteTag(ctx,first.tagId);
      await expect(f.service.adopt(ctx,{proposalId:"delete",targets:beforeDelete,tag:"另一个"})).rejects.toThrow("变化");
      expect(await f.service.adopt(ctx,original)).toEqual(first);
      expect(await f.taxonomy.listTags(ctx,{})).toHaveLength(0);
    }finally{await f.client.close();}
  });

  it("不同素材并发建议共用同名标签，usageCount只累计实际关系",async()=>{
    const f=await fixture();try{
      const targets=await f.service.prepare(ctx,["a","b"]);
      const results=await Promise.all(targets.map(target=>f.service.adopt(ctx,{proposalId:target.assetId,targets:[target],tag:"同名"})));
      expect(results[0]!.tagId).toBe(results[1]!.tagId);
      expect((await f.taxonomy.listTags(ctx,{}))[0]!.usageCount).toBe(2);
      const snapshot=await f.service.prepare(ctx,["a"]);
      await f.taxonomy.removeTag(ctx,{entityType:"asset",entityId:"b",tagId:results[0]!.tagId});
      await expect(f.service.adopt(ctx,{proposalId:"unrelated-count",targets:snapshot,tag:"新标签"})).resolves.toMatchObject({addedCount:1});
    }finally{await f.client.close();}
  });

  it("可加入外层确认事务，外层失败时标签与回执一起回滚",async()=>{
    const f=await fixture();try{
      const proposal={proposalId:"outer",targets:await f.service.prepare(ctx,["a"]),tag:"原子确认"};
      await expect(f.db.transaction(async tx=>{await f.service.adopt(ctx,proposal,tx);throw new Error("confirm failed");})).rejects.toThrow("confirm failed");
      expect(await f.taxonomy.listTags(ctx,{})).toHaveLength(0);
      expect(await f.db.select().from(assetTagAdoptions)).toHaveLength(0);
      await expect(f.db.transaction(tx=>f.service.adopt(ctx,proposal,tx))).resolves.toMatchObject({addedCount:1});
    }finally{await f.client.close();}
  });

  it("同一批次对同资产添加两个标签只校验共同初始版本，整批可重放",async()=>{
    const f=await fixture();try{
      const targets=await f.service.prepare(ctx,["a"]);
      const proposals=[{proposalId:"one",targets,tag:"标签一"},{proposalId:"two",targets,tag:"标签二"}];
      const results=await f.service.adoptBatch(ctx,proposals);
      expect(results.map(r=>r.addedCount)).toEqual([1,1]);
      expect(await f.taxonomy.listTagsForEntity(ctx,{entityType:"asset",entityId:"a"})).toHaveLength(2);
      expect(await f.service.adoptBatch(ctx,proposals)).toEqual(results);
      const fresh=await f.service.prepare(ctx,["a"]);
      const before=(await f.taxonomy.listTags(ctx,{})).length;
      await expect(f.service.adoptBatch(ctx,[{proposalId:"fresh",targets:fresh,tag:"不可留下"},{proposalId:"stale",targets,tag:"已过期"}])).rejects.toThrow("变化");
      expect((await f.taxonomy.listTags(ctx,{})).length).toBe(before);
      expect(await f.db.select().from(assetTagAdoptions)).toHaveLength(2);
    }finally{await f.client.close();}
  });

});
