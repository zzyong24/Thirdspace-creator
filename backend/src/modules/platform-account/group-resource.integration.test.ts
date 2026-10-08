import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createDb,type RequestContext} from '@creatoros/backend';
import {createAccountGroupService} from './account-group.service';
import {createAssetsService,createAssetRepository,createMockObjectStorage} from '../assets';
import {createSearchService,createSearchRepository} from '../search';
let store:Awaited<ReturnType<typeof createDb>>;let seq=0;
const now=()=> '2026-10-04T00:00:00.000Z';const nextId=(p:string)=>`${p}-${++seq}`;
const base:RequestContext={userId:'user',requestId:'resources',source:'user'};
let a:RequestContext,b:RequestContext;
beforeAll(async()=>{store=await createDb();const groups=createAccountGroupService({db:store.db,now,nextId});a={...base,groupId:(await groups.create(base,{name:'甲',idempotencyKey:'a'})).id};b={...base,groupId:(await groups.create(base,{name:'乙',idempotencyKey:'b'})).id};});
afterAll(async()=>{await store?.client.close();});
describe('账号组的素材与搜索',()=>{
 it('空组可上传素材；同组切平台仍能读，别组不能下载',async()=>{
  const storage=createMockObjectStorage({nextKey:()=>`resource/${++seq}`});
  const service=createAssetsService(createAssetRepository(store.db,{now,nextId}),async()=>storage,{now,nextId});
  const upload=await service.createUpload(a,{assetType:'image',mimeType:'image/png',fileSize:100});
  const asset=await service.completeUpload(a,upload.uploadId,{name:'封面'});
  expect((await service.getAsset({...a,accountId:'filter'},asset.id)).id).toBe(asset.id);
  await expect(service.getDownloadUrl(b,asset.id)).rejects.toMatchObject({code:'OwnershipError'});
 });
 it('索引保存真实组归属且搜索不串组',async()=>{
  const search=createSearchService(ctx=>createSearchRepository(store.db,{now,nextId,userId:ctx.userId,accountId:ctx.accountId??null,groupId:ctx.groupId}),{now});
  await search.upsertDocument(a,{entityType:'project',entityId:'one',title:'一期内容',body:''});
  expect(await search.search(a,'一期')).toHaveLength(1);expect(await search.search(b,'一期')).toHaveLength(0);
 });
});
