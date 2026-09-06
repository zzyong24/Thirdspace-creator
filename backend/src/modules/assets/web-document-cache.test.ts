import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {createDb,assetFiles,eq,sql} from "@creatoros/backend";
import {createAssetRepository} from "./assets.repository";
import {createMockObjectStorage} from "./object-storage";
import {createWebDocumentCacheService} from "./web-document-cache.service";
const ctx={userId:"reader",accountId:"account",requestId:"cache",source:"user" as const},url="https://example.com/original";
let opened:Awaited<ReturnType<typeof createDb>>,seq=0;
beforeEach(async()=>{opened=await createDb();});afterEach(async()=>{await opened.client.close();});
async function fixture(){
 const repo=createAssetRepository(opened.db,{now:()=>new Date().toISOString(),nextId:p=>`${p}-${++seq}`});
 const asset=await repo.insertAsset(ctx.userId,{assetType:"document",name:"正文·标题",currentFileId:null,status:"pending"},ctx.accountId);
 const file=await repo.insertAssetFile(ctx.userId,{assetId:asset.id,storageKey:"old",mimeType:"text/plain",fileSize:6,checksum:"old-hash",width:null,height:null,durationMs:null,mediaMetadata:{sourceUrl:url,keep:"保留"}},ctx.accountId);
 await repo.updateAssetStatus(ctx.userId,asset.id,{currentFileId:file.id},ctx.accountId);
 const getObject=vi.fn(async()=>new TextEncoder().encode("正文"));
 const storage={...createMockObjectStorage({nextKey:()=>"key"}),getObject};
 const cache=createWebDocumentCacheService(opened.db,{objectStorageForCtx:async()=>storage});
 return {repo,asset,file,getObject,cache};
}
it("缓存固定文件版本，确认后只修复该版本正文并保留metadata",async()=>{
 const f=await fixture(),prepared=await f.cache.prepare(ctx,url);expect(prepared).not.toBeNull();
 const result=await f.cache.confirm(ctx,prepared!);expect(result).toMatchObject({assetId:f.asset.id,fileId:f.file.id,name:"正文·标题",fullText:"正文"});
 const [file]=await opened.db.select().from(assetFiles).where(eq(assetFiles.id,f.file.id));
 expect(file).toMatchObject({extractedText:"正文",extractStatus:"done",mediaMetadata:{sourceUrl:url,keep:"保留"}});
});
it("字节读取期间换版本不会把旧正文修复到新文件",async()=>{
 const f=await fixture();f.getObject.mockImplementationOnce(async()=>{await f.repo.updateAssetStatus(ctx.userId,f.asset.id,{currentFileId:"new-version"},ctx.accountId);return new TextEncoder().encode("旧正文");});
 const prepared=await f.cache.prepare(ctx,url);await expect(f.cache.confirm(ctx,prepared!)).rejects.toThrow();
 const [file]=await opened.db.select().from(assetFiles).where(eq(assetFiles.id,f.file.id));expect(file!.extractedText).toBeNull();
});
it("确认前来源或存储身份改变拒绝修复",async()=>{
 const f=await fixture(),prepared=await f.cache.prepare(ctx,url);
 await opened.db.update(assetFiles).set({storageKey:"replacement"}).where(eq(assetFiles.id,f.file.id));
 await expect(f.cache.confirm(ctx,prepared!)).rejects.toThrow();
});
it("未知来源、不可读字节是未命中，取消不能伪装未命中",async()=>{
 const f=await fixture();expect(await f.cache.prepare(ctx,"https://other.example")).toBeNull();
 f.getObject.mockRejectedValueOnce(new Error("IO"));expect(await f.cache.prepare(ctx,url)).toBeNull();
 const c=new AbortController();f.getObject.mockImplementationOnce(async()=>{c.abort();throw new Error("IO after cancel");});
 await expect(f.cache.prepare(ctx,url,c.signal)).rejects.toThrow();
});
it("准备对象不能跨账号或伪造，确认取消不写正文",async()=>{
 const f=await fixture(),prepared=await f.cache.prepare(ctx,url);
 await expect(f.cache.confirm({...ctx,accountId:"other"},prepared!)).rejects.toThrow();
 await expect(f.cache.confirm(ctx,{...prepared!})).rejects.toThrow();
 await expect(f.cache.confirm(ctx,prepared!,undefined,AbortSignal.abort())).rejects.toThrow();
});
it("修复SQL失败上抛并回滚，不当作缓存未命中",async()=>{
 const f=await fixture(),prepared=await f.cache.prepare(ctx,url);
 await opened.db.execute(sql.raw("CREATE FUNCTION reject_cache_repair() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'cache repair failed'; END; $$;"));
 await opened.db.execute(sql.raw("CREATE TRIGGER reject_cache_repair BEFORE UPDATE ON asset_files FOR EACH ROW EXECUTE FUNCTION reject_cache_repair();"));
 await expect(f.cache.confirm(ctx,prepared!)).rejects.toThrow();
 const [file]=await opened.db.select().from(assetFiles).where(eq(assetFiles.id,f.file.id));expect(file!.extractedText).toBeNull();
});
it.each(["lock","update"])("事务内 %s 等待结束后取消必须回滚修复",async(point)=>{
 const f=await fixture(),prepared=await f.cache.prepare(ctx,url),controller=new AbortController();
 const original=opened.client.transaction.bind(opened.client);let matched=false;
 opened.client.transaction=((callback:any)=>original(async(tx:any)=>{
  const query=tx.query.bind(tx);tx.query=async(text:string,...args:any[])=>{
   const result=await query(text,...args);
   if(!matched && (point==="lock"?/select.*from "assets".*for update/i:/update "asset_files"/i).test(text)){matched=true;controller.abort();}
   return result;
  };return callback(tx);
 })) as typeof opened.client.transaction;
 try{await expect(f.cache.confirm(ctx,prepared!,undefined,controller.signal)).rejects.toThrow();expect(matched).toBe(true);}
 finally{opened.client.transaction=original;}
 const [file]=await opened.db.select().from(assetFiles).where(eq(assetFiles.id,f.file.id));expect(file!.extractedText).toBeNull();
});
it("外部执行事务失败时缓存修复一起回滚",async()=>{
 const f=await fixture(),prepared=await f.cache.prepare(ctx,url);
 await expect(opened.db.transaction(async tx=>{await f.cache.confirm(ctx,prepared!,tx);throw new Error("父回执写失败");})).rejects.toThrow("父回执写失败");
 const [file]=await opened.db.select().from(assetFiles).where(eq(assetFiles.id,f.file.id));expect(file!.extractedText).toBeNull();
});
