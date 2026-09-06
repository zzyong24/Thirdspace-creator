import {afterEach,beforeEach,it,expect,vi} from "vitest";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {readFileSync} from "node:fs";
import {createDb,assets,assetFiles,eq,sql} from "@creatoros/backend";
import {pendingGeneratedAssetCommits} from "../../schema/pending-generated-asset-commits";
import {createPendingGeneratedAssetService} from "./pending-generated-asset.service";
import {createLocalFsObjectStorage} from "./localfs-object-storage";
const ctx={userId:"u",accountId:"a",requestId:"r",source:"ai" as const};
const input={operationKey:"asset:call-1",assetType:"video" as const,mimeType:"video/mp4",name:"原视频",description:"画面说明",bytes:new Uint8Array([1,2,3])};
let opened:Awaited<ReturnType<typeof createDb>>,root:string,storage:ReturnType<typeof createLocalFsObjectStorage>;
const authorize=vi.fn(async()=>{}),now=()=>"2026-09-06T00:00:00.000Z";
const service=()=>createPendingGeneratedAssetService({db:opened.db,objectStorageForCtx:async()=>storage,now,authorize});
beforeEach(async()=>{opened=await createDb();root=await mkdtemp(join(tmpdir(),"t915-generated-"));storage=createLocalFsObjectStorage({rootPath:root,publicBaseUrl:"/blob"},{nextKey:()=>"unused"});authorize.mockReset();authorize.mockResolvedValue();});
afterEach(async()=>{await opened.client.close();await rm(root,{recursive:true,force:true});});
const rows=async()=>({receipts:await opened.db.select().from(pendingGeneratedAssetCommits),assets:await opened.db.select().from(assets),files:await opened.db.select().from(assetFiles)});
it("真实字节、pending 素材和媒体元数据完整保存",async()=>{
 const head=storage.headObject.bind(storage);storage.headObject=async key=>({...await head(key),width:1920,height:1080,durationMs:6000,mediaMetadata:{codec:"fixture"}});
 const result=await service().submit(ctx,input),data=await rows();
 expect(data.assets).toMatchObject([{id:result.assetId,status:"pending",assetType:"video",description:input.description}]);
 expect(data.files).toMatchObject([{id:result.fileId,width:1920,height:1080,durationMs:6000,mediaMetadata:{codec:"fixture"},fileSize:3}]);
 expect(await storage.getObject(data.receipts[0]!.storageKey)).toEqual(input.bytes);
});
it("写字节后断开，重新装配可只凭操作键恢复，不重写或重新生成",async()=>{
 const put=storage.putObject.bind(storage);storage.putObject=async value=>{await put(value);throw new Error("写后断开");};
 await expect(service().submit(ctx,input)).rejects.toThrow("写后断开");
 const row=(await rows()).receipts[0]!;expect((await rows()).assets).toHaveLength(0);
 storage.putObject=vi.fn(async()=>{throw new Error("不能重写");});
 const result=await service().recover(ctx,input.operationKey);
 expect(result).toMatchObject({status:"committed",receipt:{assetId:row.assetId,fileId:row.fileId}});expect(storage.putObject).not.toHaveBeenCalled();
});
it("首个等待前复制 bytes 和输入，调用方修改不会改变已准备内容",async()=>{
 const copy={...input,bytes:new Uint8Array([4,5])};let release!:()=>void;
 authorize.mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve;}));
 const pending=service().submit(ctx,copy);await vi.waitFor(()=>expect(release).toBeDefined());copy.bytes[0]=99;copy.name="篡改";release();await pending;
 const data=await rows();expect(data.assets[0]?.name).toBe(input.name);expect(await storage.getObject(data.receipts[0]!.storageKey)).toEqual(new Uint8Array([4,5]));
});
it("无回执与已准备但缺字节明确区分，恢复不产生素材",async()=>{
 expect(await service().recover(ctx,input.operationKey)).toEqual({status:"missing"});
 storage.putObject=async()=>{throw new Error("未写入");};await expect(service().submit(ctx,input)).rejects.toThrow("未写入");
 expect(await service().recover(ctx,input.operationKey)).toMatchObject({status:"bytes_missing"});expect((await rows()).assets).toHaveLength(0);
});
it("已保存字节损坏或存储不可用，不当成缺失后覆盖",async()=>{
 const put=storage.putObject.bind(storage);storage.putObject=async value=>{await put(value);throw new Error("断开");};await expect(service().submit(ctx,input)).rejects.toThrow();
 const row=(await rows()).receipts[0]!;await writeFile(join(root,row.storageKey),new Uint8Array([9]));
 await expect(service().recover(ctx,input.operationKey)).rejects.toThrow("摘要");
 storage.getObject=async()=>{throw new Error("存储断开");};await expect(service().recover(ctx,input.operationKey)).rejects.toThrow("存储断开");expect((await rows()).assets).toHaveLength(0);
});
it("并发同键只创建一份素材，异内容同键拒绝",async()=>{
 const [a,b]=await Promise.all([service().submit(ctx,input),service().submit(ctx,input)]);expect(a).toEqual(b);expect((await rows()).assets).toHaveLength(1);
 await expect(service().submit(ctx,{...input,bytes:new Uint8Array([8])})).rejects.toThrow();
});
it("提交后用户删除素材，历史回放不重新创建或读取字节",async()=>{
 const first=await service().submit(ctx,input);await opened.db.update(assets).set({status:"deleted",name:"用户删除"}).where(eq(assets.id,first.assetId));
 storage.getObject=vi.fn(async()=>{throw new Error("不应读取");});authorize.mockRejectedValue(new Error("已停止"));
 expect(await service().recover(ctx,input.operationKey)).toEqual({status:"committed",receipt:first});
 expect((await rows()).assets).toMatchObject([{status:"deleted",name:"用户删除"}]);expect(storage.getObject).not.toHaveBeenCalled();
});
it("数据库文件写入失败整体回滚，原对象可再次恢复",async()=>{
 await opened.db.execute(sql.raw("CREATE FUNCTION fail_generated_file() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'file failure'; END; $$;"));
 await opened.db.execute(sql.raw("CREATE TRIGGER fail_generated_file BEFORE INSERT ON asset_files FOR EACH ROW EXECUTE FUNCTION fail_generated_file();"));
 await expect(service().submit(ctx,input)).rejects.toThrow();expect((await rows()).assets).toHaveLength(0);expect((await rows()).files).toHaveLength(0);
 await opened.db.execute(sql.raw("DROP TRIGGER fail_generated_file ON asset_files;"));expect(await service().recover(ctx,input.operationKey)).toMatchObject({status:"committed"});
});
it("对象写入期间取消不创建素材，恢复仍使用原字节",async()=>{
 const controller=new AbortController(),put=storage.putObject.bind(storage);
 storage.putObject=async value=>{await put(value);controller.abort(new Error("已停止"));};
 await expect(service().submit(ctx,input,controller.signal)).rejects.toThrow("已停止");
 expect((await rows()).assets).toHaveLength(0);expect((await rows()).receipts[0]?.committedAt).toBeNull();
 storage.putObject=vi.fn(async()=>{throw new Error("不能重写");});
 expect(await service().recover(ctx,input.operationKey)).toMatchObject({status:"committed"});expect(storage.putObject).not.toHaveBeenCalled();
});
it("准备后的恢复在读取字节前检查授权，其他账号不能回读",async()=>{
 storage.putObject=async()=>{throw new Error("保留准备态");};await expect(service().submit(ctx,input)).rejects.toThrow();
 storage.getObject=vi.fn(async()=>{throw new Error("不应读取");});authorize.mockRejectedValue(new Error("无权限"));
 await expect(service().recover(ctx,input.operationKey)).rejects.toThrow("无权限");expect(storage.getObject).not.toHaveBeenCalled();
 expect(await service().recover({...ctx,accountId:"other"},input.operationKey)).toEqual({status:"missing"});
});
it("新增迁移可重跑，不改变已提交素材与回执",async()=>{
 const first=await service().submit(ctx,input),migration=readFileSync("drizzle/0088_pending_generated_asset_commits.sql","utf8");
 await opened.client.exec(migration);await opened.client.exec(migration);
 expect(await service().recover(ctx,input.operationKey)).toEqual({status:"committed",receipt:first});expect((await rows()).assets).toHaveLength(1);
});
it("完整字节已发布但元数据 sidecar 缺失，恢复原字节并补齐元数据",async()=>{
 const put=storage.putObject.bind(storage);storage.putObject=async value=>{await put(value);throw new Error("保存中断");};
 await expect(service().submit(ctx,input)).rejects.toThrow();const row=(await rows()).receipts[0]!;
 await rm(join(root,`${row.storageKey}.meta.json`),{force:true});
 storage.putObject=vi.fn(put);
 expect(await service().recover(ctx,input.operationKey)).toMatchObject({status:"committed",receipt:{assetId:row.assetId}});
 expect(storage.putObject).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({bytes:input.bytes,mimeType:input.mimeType,storageKey:row.storageKey}));
});
