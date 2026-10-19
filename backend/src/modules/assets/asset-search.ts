import {workspaceKey} from "@creatoros/backend";
import { createHash } from "node:crypto";
import type { RequestContext } from "@creatoros/contract";
import type { AssetRepository,AssetRow } from "./assets.repository";
import { requireAccountId,UploadValidationError } from "./assets.errors";
export interface AssetSearchInput {query:string;limit:number;cursor?:string|null;assetTypes?:Array<"image"|"video"|"audio"|"document"|"subtitle">}
export interface AssetSearchResult {rows:AssetRow[];nextCursor:string|null}
export async function searchAssetLibrary(repo:Pick<AssetRepository,"searchAssets">,ctx:RequestContext,input:AssetSearchInput):Promise<AssetSearchResult>{
  const accountId=workspaceKey(ctx);
  const query=input.query.trim();
  if(query.length>500 || !Number.isInteger(input.limit) || input.limit<1 || input.limit>100)throw new UploadValidationError("素材搜索参数无效");
  const types=input.assetTypes ? [...new Set(input.assetTypes)].sort() : undefined;
  if(types && (!types.length || types.length>5 || types.some(type=>!["image","video","audio","document","subtitle"].includes(type))))throw new UploadValidationError("素材搜索参数无效");
  // SEMANTIC_BOUNDARY_ALLOW: 摘要仅绑定字面查询与归属，不评判素材相关性或创作取舍。
  const scope=createHash("sha256").update(JSON.stringify(types ? ["typed-assets-search-v1",ctx.userId,accountId,query,types] : [ctx.userId,accountId,query])).digest("hex");
  let after:{createdAt:string;id:string}|undefined;
  if(input.cursor){
    try{
      if(input.cursor.length>2048)throw new Error();
      const value=JSON.parse(Buffer.from(input.cursor,"base64url").toString("utf8"));
      if(value.scope!==scope || typeof value.createdAt!=="string" || !Number.isFinite(Date.parse(value.createdAt)) || typeof value.id!=="string" || !value.id || value.id.length>500)throw new Error();
      after={createdAt:value.createdAt,id:value.id};
    }catch{throw new UploadValidationError("素材分页游标无效或不属于当前查询");}
  }
  const found=await repo.searchAssets(ctx.userId,accountId,{query,limit:input.limit+1,after,assetTypes:types});
  const rows=found.slice(0,input.limit);const last=rows.at(-1);
  return {rows,nextCursor:found.length>input.limit && last ? Buffer.from(JSON.stringify({scope,createdAt:last.createdAt,id:last.id})).toString("base64url") : null};
}
