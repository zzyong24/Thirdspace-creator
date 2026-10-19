import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createDb,
  type Db,
  UnsupportedOperationError,
} from "@creatoros/backend";
import {
  ENDPOINTS,
  listEnvelope,
  successEnvelope,
  type Endpoint,
  type RequestContext,
  type Transport,
} from "@creatoros/contract";
import { createAssetRepository } from "./assets.repository";
import { createAssetsService } from "./assets.service";
import { createMockObjectStorage } from "./object-storage";
import { createAssetsTransport } from "./assets.transport";
import { assetResource, assetFileResource, assetUpload } from "./assets.schema";

// D8 / F3 — drive each of the 7 ops through the transport against a seeded pglite
// db and assert the envelope `data` validates against the op's contract response
// DTO (foundation §5.4). Confirms numeric fileSize/versionNumber, record
// mediaMetadata, nullable deletedAt/width/height/durationMs serialize.

const NOW = "2026-06-21T02:00:00.000Z";
const ctx: RequestContext = {
  userId: "user-1",
  requestId: "req-1",
  source: "user",
  accountId: "acct-1", // [T-332 S2]
};
const ep = (id: string, isList = false) =>
  ({ id, isList }) as unknown as Endpoint;

function deterministicDeps() {
  const counters = new Map<string, number>();
  return {
    now: () => NOW,
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-c-${n}`;
    },
  };
}

let db: Db;
let t1341Client: Awaited<ReturnType<typeof createDb>>["client"];
let transport: Transport;

beforeEach(async () => {
  ({ db, client: t1341Client } = await createDb());
  const deps = deterministicDeps();
  const repo = createAssetRepository(db, deps);
  let keySeq = 0;
  const storage = createMockObjectStorage({
    nextKey: () => `uploads/k-${++keySeq}`,
  });
  const service = createAssetsService(repo, async () => storage, deps);
  transport = createAssetsTransport(() => service);
});

async function call(id: string, input: unknown, isList = false) {
  return transport.request(ep(id, isList), input as never, ctx);
}

// Helper: run the full upload, returning the created asset id.
async function uploadAsset(name = "封面"): Promise<string> {
  const up = await call("assets.uploads.create", {
    body: { assetType: "image", mimeType: "image/png", fileSize: 4096 },
  });
  const uploadId = (up as { data: { uploadId: string } }).data.uploadId;
  const done = await call("assets.uploads.complete", {
    params: { uploadId },
    body: { name },
  });
  return (done as { data: { id: string } }).data.id;
}

describe("assets.transport — 7-op contract conformance", () => {
  it("assets.uploads.create → assetUpload DTO", async () => {
    const up = await call("assets.uploads.create", {
      body: { assetType: "image", mimeType: "image/png", fileSize: 4096 },
    });
    expect(() => successEnvelope(assetUpload).parse(up)).not.toThrow();
  });

  it("assets.uploads.complete / get → assetResource", async () => {
    const up = await call("assets.uploads.create", {
      body: { assetType: "image", mimeType: "image/png", fileSize: 4096 },
    });
    const uploadId = (up as { data: { uploadId: string } }).data.uploadId;
    const done = await call("assets.uploads.complete", {
      params: { uploadId },
      body: { name: "封面" },
    });
    const parsed = successEnvelope(assetResource).parse(done);
    expect(parsed.data.status).toBe("active");
    expect(parsed.data.currentFileId).toBeTruthy();
    expect(parsed.data.deletedAt).toBeNull();

    const got = await call("assets.get", {
      params: { assetId: parsed.data.id },
    });
    expect(() => successEnvelope(assetResource).parse(got)).not.toThrow();
  });

  it("assets.list → assetResource[] (active only)", async () => {
    await uploadAsset("A1");
    const list = await call("assets.list", { query: { page: 1, pageSize: 50 } }, true);
    const parsed = listEnvelope(assetResource).parse(list);
    expect(parsed.data.length).toBe(1);
    expect(parsed.data[0]!.deletedAt).toBeNull();
  });

  it("assets.list 的 page>1 返回下一页，不重复第一页", async () => {
    await uploadAsset("A1");
    await uploadAsset("A2");
    await uploadAsset("A3");
    const first = listEnvelope(assetResource).parse(
      await call("assets.list", { query: { page: 1, pageSize: 2 } }, true),
    );
    const second = listEnvelope(assetResource).parse(
      await call("assets.list", { query: { page: 2, pageSize: 2 } }, true),
    );
    expect(first.data).toHaveLength(2);
    expect(second.data).toHaveLength(1);
    expect(second.data[0]!.id).not.toBe(first.data[0]!.id);
    expect(second.data[0]!.id).not.toBe(first.data[1]!.id);
  });

  it("assets.files.create → assetFileResource (numeric fields)", async () => {
    const assetId = await uploadAsset();
    const file = await call("assets.files.create", {
      params: { assetId },
      body: { storageKey: "extra/file-1" },
    });
    const parsed = successEnvelope(assetFileResource).parse(file);
    expect(parsed.data.versionNumber).toBe(2);
    expect(typeof parsed.data.fileSize).toBe("number");
    expect(parsed.data.mediaMetadata).toEqual({});
  });

  it("assets.trash → assetResource (deleted) then assets.restore → active", async () => {
    const assetId = await uploadAsset();
    const trashed = await call("assets.trash", { params: { assetId } });
    const pt = successEnvelope(assetResource).parse(trashed);
    expect(pt.data.status).toBe("deleted");
    expect(pt.data.deletedAt).toBe(NOW);

    const restored = await call("assets.restore", { params: { assetId } });
    const pr = successEnvelope(assetResource).parse(restored);
    expect(pr.data.status).toBe("active");
    expect(pr.data.deletedAt).toBeNull();
  });

  it("covers all 7 op ids + unknown → UnsupportedOperationError", async () => {
    const owned = [
      "assets.list",
      "assets.uploads.create",
      "assets.uploads.complete",
      "assets.get",
      "assets.files.create",
      "assets.trash",
      "assets.restore",
    ];
    const ids = Object.values(ENDPOINTS)
      .filter((e) => owned.includes(e.id))
      .map((e) => e.id);
    expect(ids).toHaveLength(7);

    await expect(
      transport.request(ep("assets.nope"), {} as never, ctx),
    ).rejects.toBeInstanceOf(UnsupportedOperationError);
  });
});

it("assets.search 公共读口返回实际文件元数据与游标，不伪造列表 envelope",async()=>{
 const id=await uploadAsset("目标图片");
 const result=await transport.request(ENDPOINTS.searchAssets,{params:undefined,body:undefined,query:{query:"目标",limit:24,assetTypes:["image"]}},ctx);
 const parsed=successEnvelope(ENDPOINTS.searchAssets.response).parse(result);
 expect(parsed.data.items.map(item=>item.id)).toEqual([id]);expect(parsed.data.items[0]!.currentFileId).toBeTruthy();expect(parsed.data.items[0]!.fileSize).toBe(4096);expect(parsed.data.nextCursor).toBeNull();
 expect(ENDPOINTS.searchAssets.query!.safeParse({query:"",limit:0}).success).toBe(false);
 expect(ENDPOINTS.searchAssets.query!.safeParse({query:"",assetTypes:[]}).success).toBe(false);
});


describe('T1341 真实资产transport附加标签projection不伤原读权/下载',()=>{
 it.each(['known','empty','unavailable'] as const)('list/get/search完整同源摘要 %s',async mode=>{
  const storage=createMockObjectStorage({nextKey:()=>`t1341/${mode}`}),service=createAssetsService(createAssetRepository(db,deterministicDeps()),async()=>storage,deterministicDeps());
  const readAssetTags=vi.fn(async(_ctx:RequestContext,ids:string[])=>{if(mode==='unavailable')throw new Error('CONTROLLED_TAG_READ_UNAVAILABLE');return Object.fromEntries(ids.map(id=>[id,mode==='empty'?[]:[{id:'t1341-tag',name:'中文真实'}]]));});
  transport=createAssetsTransport(()=>service,{readAssetTags});const assetId=await uploadAsset('T1341真实资产');
  const get:any=await call('assets.get',{params:{assetId}}),list:any=await call('assets.list',{query:{page:1,pageSize:100}},true),search:any=await call('assets.search',{query:{query:'T1341',limit:100}}),download:any=await call('assets.downloadUrl',{params:{assetId}});
  const expected=mode==='unavailable'?null:mode==='empty'?[]:[{id:'t1341-tag',name:'中文真实'}];expect(get.data.tags).toEqual(expected);expect(list.data[0].tags).toEqual(expected);expect(search.data.items[0].tags).toEqual(expected);expect(download.data.url).toBeTruthy();expect(get.data.name).toBe('T1341真实资产');expect(()=>assetResource.parse(get.data)).not.toThrow();
  readAssetTags.mockClear();await expect(transport.request(ep('assets.get'),{params:{assetId}} as never,{...ctx,userId:'other-user'})).rejects.toThrow();expect(readAssetTags).not.toHaveBeenCalled();
 },180000);
 it('旧独立装配无projection端口明确null，不能冒真实空数组',async()=>{const id=await uploadAsset('旧装配');const result:any=await call('assets.get',{params:{assetId:id}});expect(result.data.tags).toBeNull();},180000);
});


it('T1341 100真实素材各自标签：两个50条页/100搜索无截断且每次新增权限+taxonomy两条SQL',async()=>{
 const {createTaxonomyRepository,createTaxonomyService}=await import('../taxonomy');const deps=deterministicDeps(),repo=createAssetRepository(db,deps),service=createAssetsService(repo,async()=>createMockObjectStorage({nextKey:()=>''}),deps),taxonomyRepo=createTaxonomyRepository(db,deps);
 const expected=new Map<string,Array<{id:string;name:string}>>();
 for(let i=0;i<100;i++){
  const row=await repo.insertAsset(ctx.userId,{assetType:'image',name:'T1341有效-'+i,currentFileId:null},ctx.accountId!),file=await repo.insertAssetFile(ctx.userId,{assetId:row.id,storageKey:'t1341-real-batch/'+i,mimeType:'image/png',fileSize:8,checksum:'fixture-'+i,width:960,height:540,durationMs:null,mediaMetadata:{}},ctx.accountId!);await repo.updateAssetStatus(ctx.userId,row.id,{currentFileId:file.id},ctx.accountId!);
  const tag=await taxonomyRepo.insertTag(ctx,{name:'真实对应-'+i});await taxonomyRepo.insertEntityTag(ctx,{entityType:'asset',entityId:row.id,tagId:tag.id});const tags=[{id:tag.id,name:tag.name}];
  if(i===0||i===99){const extra=await taxonomyRepo.insertTag(ctx,{name:'首尾第二标签-'+i});await taxonomyRepo.insertEntityTag(ctx,{entityType:'asset',entityId:row.id,tagId:extra.id});tags.push({id:extra.id,name:extra.name});}expected.set(row.id,tags);
 }
 const query=vi.spyOn(t1341Client,'query'),counts:number[]=[];
 const taxonomy=createTaxonomyService(taxonomyRepo,{assertEntityReadable:async(c,type,id)=>{if(type!=='asset')throw Error('仅资产族');return service.getAsset(c,id);},assertEntityWritable:async()=>{throw Error('只读组合');},readableAssetIds:(c,ids)=>service.listReadableAssetIds(c,ids)});
 const projected=createAssetsTransport(()=>service,{readAssetTags:async(c,ids)=>{const before=query.mock.calls.length;const value=await taxonomy.listAssetTagSummaries(c,ids);const queries=query.mock.calls.slice(before).map(args=>String(args[0]));counts.push(queries.filter(text=>/from "(?:assets|entity_tags)"/.test(text)).length);return value;}});
 const first:any=await projected.request(ENDPOINTS.listAssets,{query:{page:1,pageSize:50}} as never,ctx),second:any=await projected.request(ENDPOINTS.listAssets,{query:{page:2,pageSize:50}} as never,ctx),search:any=await projected.request(ENDPOINTS.searchAssets,{query:{query:'T1341有效-',limit:100}} as never,ctx);
 expect(first.data).toHaveLength(50);expect(second.data).toHaveLength(50);expect(new Set([...first.data,...second.data].map((x:any)=>x.id)).size).toBe(100);expect(search.data.items).toHaveLength(100);
 for(const row of [...first.data,...second.data,...search.data.items]){expect(row.tags).toEqual(expected.get(row.id));expect(row.width).toBe(960);expect(row.height).toBe(540);}
 expect(counts).toEqual([2,2,2]);const before=query.mock.calls.length;expect(await taxonomy.listAssetTagSummaries(ctx,[])).toEqual({});expect(query.mock.calls.length).toBe(before);
},180000);
