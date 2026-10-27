import {expect,it,vi} from "vitest";
import type {RequestContext} from "@creatoros/contract";
import {createEntitySearchProjection} from "./entity-search-projection";

const ctx:RequestContext={userId:"source-owner",groupId:"source-group",accountId:null,requestId:"t1403-projection",source:"user"};
const project={id:"source-project",userId:ctx.userId,groupId:ctx.groupId,accountId:null,title:"来源标题",brief:"原始简介",currentStage:"brief",progressPct:0};
function ports(){return {upsertDocument:vi.fn(async()=>({id:"derived",userId:ctx.userId,entityType:"project",entityId:project.id,title:project.title,body:"",searchText:"",embedding:[],indexedAt:"2026-10-25T00:00:00.000Z"})),removeDocument:vi.fn(async()=>{})};}

it("索引故障不伪造成功文档或反杀业务，后续原实体重放可自愈",async()=>{
 const search=ports(),projection=createEntitySearchProjection(search),warning=vi.spyOn(console,"warn").mockImplementation(()=>{});
 try{
  search.upsertDocument.mockRejectedValueOnce(new Error("derived index unavailable"));
  await expect(projection.project(ctx,project)).resolves.toBeUndefined();
  expect(warning).toHaveBeenCalledWith(expect.stringContaining("source saved"),expect.objectContaining({entityId:project.id,error:"derived index unavailable"}));
  await projection.project(ctx,project);
  expect(search.upsertDocument).toHaveBeenCalledTimes(2);
  expect(search.upsertDocument).toHaveBeenLastCalledWith(expect.objectContaining({groupId:ctx.groupId}),expect.objectContaining({entityId:project.id,title:project.title,searchText:"来源标题\n原始简介"}));
 }finally{warning.mockRestore();}
});

it("源行跨用户或跨组时不写入任何索引，不能借ctx重签他人内容",async()=>{
 const search=ports(),projection=createEntitySearchProjection(search),warning=vi.spyOn(console,"warn").mockImplementation(()=>{});
 try{
  await projection.project(ctx,{...project,userId:"another-user"});
  await projection.project(ctx,{...project,groupId:"another-group"});
  expect(search.upsertDocument).not.toHaveBeenCalled();expect(search.removeDocument).not.toHaveBeenCalled();
 }finally{warning.mockRestore();}
});

it("未确认、已归档及回收素材移除派生条目，恢复active后才能重投影",async()=>{
 const search=ports(),projection=createEntitySearchProjection(search);
 const asset={id:"source-image",userId:ctx.userId,groupId:ctx.groupId,accountId:null,name:"来源图片",assetType:"image",status:"pending"};
 for(const status of ["pending","deleted","archived"])await projection.asset(ctx,{...asset,status});
 expect(search.removeDocument).toHaveBeenCalledTimes(3);expect(search.upsertDocument).not.toHaveBeenCalled();
 await projection.asset(ctx,{...asset,status:"active"});
 expect(search.upsertDocument).toHaveBeenCalledWith(expect.objectContaining({groupId:ctx.groupId}),expect.objectContaining({entityType:"asset",entityId:asset.id,title:asset.name}));
});
