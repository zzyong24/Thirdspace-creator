import { describe,it,expect,vi } from "vitest";
import type { Db } from "@creatoros/backend";
const fixture=vi.hoisted(()=>({db:undefined as Db|undefined,materialTools:undefined as undefined|Parameters<typeof import("@creatoros/backend/modules/execution").createAgenticExecutor>[0]["resolveTools"]}));
vi.mock("@creatoros/backend",async original=>{
  const actual=await original<typeof import("@creatoros/backend")>();
  return {...actual,createConfiguredDb:async(...args:Parameters<typeof actual.createConfiguredDb>)=>{const result=await actual.createConfiguredDb(...args);fixture.db=result.db;return result;}};
});
vi.mock("@creatoros/backend/modules/execution",async original=>{
  const actual=await original<typeof import("@creatoros/backend/modules/execution")>();
  return {...actual,createAgenticExecutor:(deps:Parameters<typeof actual.createAgenticExecutor>[0])=>{if(deps.taskType==="agentic.material")fixture.materialTools=deps.resolveTools;return actual.createAgenticExecutor(deps);}};
});
import { assets } from "@creatoros/backend";
import { getChatRuntime,__resetPersistenceForTests } from "./persistence-client";
describe("聊天素材检索实际装配",()=>{
  it("真实runtime命中首100条以外的素材且保持账号隔离",async()=>{
    vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR","");__resetPersistenceForTests();
    try{
      const runtime=await getChatRuntime();const ctx={userId:"search-runtime",accountId:"search-runtime",requestId:"r",source:"user" as const};
      const stamp="2026-09-01T00:00:00.000Z";
      const rows=Array.from({length:135},(_,index)=>({id:`runtime-${String(index).padStart(3,"0")}`,userId:ctx.userId,accountId:ctx.accountId,assetType:"image",name:index===134 ? "较早的唯一目标" : "其它图片",createdAt:stamp,updatedAt:stamp}));
      await fixture.db!.insert(assets).values([...rows,{...rows[134]!,id:"foreign-runtime",accountId:"other"}]);
      const tool=fixture.materialTools!(ctx).find(tool=>tool.name==="material.search")!;
      expect((await tool.execute({query:"唯一目标"},{signal:new AbortController().signal,dryRun:false})).data).toEqual({items:[{id:"runtime-134",title:"较早的唯一目标",kind:"image"}],nextCursor:null});
      expect(await runtime.contextReaders.searchMaterials!(ctx,{query:"唯一目标",limit:20})).toEqual([{id:"runtime-134",title:"较早的唯一目标",kind:"image"}]);
    }finally{
      await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();vi.unstubAllEnvs();
    }
  },30000);
});
