import { describe,it,expect } from "vitest";
import { createDb,assets } from "@creatoros/backend";
import { createAssetRepository } from "./assets.repository";
import { createAssetsService } from "./assets.service";
import { createMaterialTools } from "../execution/agentic/adapters/material-adapter";
const ctx={userId:"u",accountId:"a",requestId:"r",source:"user" as const};
const stamp="2026-09-01T00:00:00.000Z";
describe("全库字面素材检索",()=>{
  it("超过100条及同时间记录不漏页，跨账号和非active不可见",async()=>{
    const opened=await createDb();let seq=0;const deps={now:()=>stamp,nextId:(prefix:string)=>`${prefix}-${++seq}`};
    const service=createAssetsService(createAssetRepository(opened.db,deps),async()=>{throw new Error("搜索不应访问文件存储");},deps);
    try{
      const rows=Array.from({length:135},(_,index)=>({id:`asset-${String(index).padStart(3,"0")}`,userId:ctx.userId,accountId:ctx.accountId,assetType:"image",name:index===134 ? "非常早的目标" : `同词素材${index}`,createdAt:stamp,updatedAt:stamp}));
      await opened.db.insert(assets).values([...rows,{...rows[0]!,id:"foreign",accountId:"other"},{...rows[0]!,id:"pending",status:"pending"}]);
      expect((await service.searchAssets(ctx,{query:"非常早",limit:20})).rows.map(row=>row.id)).toEqual(["asset-134"]);
      let cursor:string|null=null;const ids:string[]=[];let firstCursor:string|null=null;
      do{const result=await service.searchAssets(ctx,{query:"同词",limit:17,cursor});ids.push(...result.rows.map(row=>row.id));cursor=result.nextCursor;if(!firstCursor)firstCursor=cursor;}while(cursor);
      expect(ids).toHaveLength(134);expect(new Set(ids).size).toBe(134);
      await expect(service.searchAssets({...ctx,accountId:"other"},{query:"同词",limit:17,cursor:firstCursor})).rejects.toThrow("游标");
      await expect(service.searchAssets(ctx,{query:"变化",limit:17,cursor:firstCursor})).rejects.toThrow("游标");
      await expect(service.searchAssets(ctx,{query:"同词",limit:0})).rejects.toThrow("参数");
      const ports={searchMaterials:async(input:{query:string;limit?:number;cursor?:string|null})=>{const result=await service.searchAssets(ctx,{query:input.query,limit:input.limit ?? 20,cursor:input.cursor});return {items:result.rows.map(row=>({id:row.id,title:row.name,kind:row.assetType})),nextCursor:result.nextCursor};},organizeMaterials:async()=>{throw new Error("未接通");}};
      const tool=createMaterialTools(ports).find(tool=>tool.name==="material.search")!;
      const result=await tool.execute({query:"同词",limit:2},{signal:new AbortController().signal,dryRun:false});expect((result.data as {nextCursor:string}).nextCursor).toBeTruthy();
    }finally{await opened.client.close();}
  });
  it("百分号、下划线和反斜杠按字面匹配，不作为SQL通配符",async()=>{
    const opened=await createDb();const deps={now:()=>stamp,nextId:(p:string)=>p};const service=createAssetsService(createAssetRepository(opened.db,deps),async()=>{throw new Error("不应访问存储");},deps);
    try{
      const names=["100%完成","带_符号","路径\\文件","普通名称"];
      await opened.db.insert(assets).values(names.map((name,index)=>({id:`literal-${index}`,userId:"u",accountId:"a",assetType:"image",name,createdAt:stamp,updatedAt:stamp})));
      for(const [query,expected] of [["%",names[0]],["_",names[1]],["\\",names[2]]])expect((await service.searchAssets(ctx,{query:query!,limit:20})).rows.map(row=>row.name)).toEqual([expected]);
    }finally{await opened.client.close();}
  });
});
