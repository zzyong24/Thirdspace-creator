import type {RequestContext} from "@creatoros/contract";
import type {SearchService} from "../modules/search";

interface OwnedSource {id:string;userId:string;accountId:string|null;groupId?:string|null}
interface ProjectSource extends OwnedSource {title:string;brief:string;currentStage:string;progressPct:number}
interface AssetSource extends OwnedSource {name:string;assetType:string;status:string;description?:string|null}

/** 已通过拥有者 service 核验且提交的真实行 → 派生索引，不参与语义判断或实体创建。 */
export function createEntitySearchProjection(search:Pick<SearchService,"upsertDocument"|"removeDocument">){
 function context(ctx:RequestContext,row:OwnedSource):RequestContext{
  if(row.userId!==ctx.userId||(ctx.groupId&&row.groupId!==ctx.groupId))throw new Error("搜索投影来源与当前工作区不符");
  // SEMANTIC_BOUNDARY_ALLOW: 旧账号入口可能已由 intake 在锁内解析为初始组。
  // 索引沿已授权源行的真实归属，不把同一实体写到调用时的旧别名工作区。
  return {...ctx,accountId:row.accountId,groupId:row.groupId??undefined,
   ...(row.groupId===ctx.groupId?{}:{groupVersion:undefined,membershipVersion:undefined})};
 }
 async function project(ctx:RequestContext,row:ProjectSource):Promise<void>{
  try{
   const owner=context(ctx,row);
   await search.upsertDocument(owner,{entityType:"project",entityId:row.id,title:row.title,
    body:JSON.stringify({stage:row.currentStage,progressPct:row.progressPct,snippet:row.brief}),
    searchText:`${row.title}\n${row.brief}`.toLowerCase().trim()});
  }catch(error){console.warn("[search-projection] project failed; source saved",{entityId:row.id,error:error instanceof Error?error.message:String(error)});}
 }
 async function asset(ctx:RequestContext,row:AssetSource):Promise<void>{
  try{
   const owner=context(ctx,row);
   if(row.status!=="active"){await search.removeDocument(owner,"asset",row.id);return;}
   await search.upsertDocument(owner,{entityType:"asset",entityId:row.id,title:row.name,
    body:JSON.stringify({assetType:row.assetType}),searchText:`${row.name}\n${row.description??""}`.toLowerCase().trim()});
  }catch(error){console.warn("[search-projection] asset failed; source saved",{entityId:row.id,error:error instanceof Error?error.message:String(error)});}
 }
 return {project,asset};
}
