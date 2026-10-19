import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDb } from '../../index';
import { seedAdjacentContent } from '../../integration/adjacent-domain-fixtures';
import { createAssetsService } from '../../modules/assets/assets.service';
import { createAssetRepository } from '../../modules/assets/assets.repository';
import { createLocalFsObjectStorage } from '../../modules/assets/localfs-object-storage';
import { createPublishingService } from '../../modules/publishing/publishing.service';
import { OwnershipError } from '../../modules/publishing/publishing.errors';
import { publications, publicationRevisions } from '../../schema/publishing';
import { backfillDouyinCovers } from './douyin-cover-backfill';
const cleanups:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const f of cleanups.splice(0).reverse())await f();});
it('真实临时文件删除后，经候选、补采、版本保存整链恢复可读图片，保留好封面',async()=>{
 const root=await mkdtemp(join(tmpdir(),'creatoros-cover-repair-'));cleanups.push(()=>rm(root,{recursive:true,force:true}));
 const {db,client}=await createDb();cleanups.push(()=>client.close());let seq=0;
 const deps={now:()=>new Date().toISOString(),nextId:(p:string)=>`${p}-${++seq}`};
 const storage=createLocalFsObjectStorage({rootPath:root,publicBaseUrl:'/blob'},{nextKey:()=>`object-${++seq}`});
 const assets=createAssetsService(createAssetRepository(db,deps),async()=>storage,deps);
 const ctx={userId:'u',accountId:'a',requestId:'r',source:'user' as const};
 await seedAdjacentContent(db,ctx,['output-1','output-2']);
 const publishing=createPublishingService({db,...deps,isCoverAvailable:(c,id)=>assets.isAssetFileAvailable(c,id)});
 const bytes=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jUioAAAAASUVORK5CYII=','base64'));
 const lost=await assets.createGeneratedAsset(ctx,{assetType:'image',name:'old.png',mimeType:'image/png',bytes});
 const good=await assets.createGeneratedAsset(ctx,{assetType:'image',name:'user.png',mimeType:'image/png',bytes});
 const pub=await publishing.createImportedPublication(ctx,'output-1',{platform:'douyin',externalId:'video-1'});
 const other=await publishing.createImportedPublication(ctx,'output-2',{platform:'douyin',externalId:'video-2'});
 await publishing.setCover(ctx,pub.id,lost.id);await publishing.setCover(ctx,other.id,good.id);
 const file=(await assets.listFilesByIds(ctx,[lost.currentFileId!]))[0]!;
 await rm(join(root,file.storageKey));
 expect(await assets.isAssetFileAvailable(ctx,lost.id)).toBe(false);
 const result=await backfillDouyinCovers({
  listMissingCover:async limit=>(await publishing.listPublicationsMissingCover(ctx,{platform:'douyin',limit})).map(p=>({publicationId:p.id,externalId:p.externalId!})),
  fetchVideoUrl:async()=>({coverUrl:'https://example.com/cover.png'}),downloadImage:async()=>({bytes,mimeType:'image/png'}),
  createImageAsset:i=>assets.createGeneratedAsset(ctx,{...i,assetType:'image'}),setCover:async(id,asset)=>{await publishing.setCover(ctx,id,asset);},
 });
 expect(result).toMatchObject({attempted:1,filled:1,failed:0});
 expect(await publishing.listPublicationsMissingCover(ctx,{platform:'douyin'})).toEqual([]);
 const revisions=await publishing.listRevisions(ctx,pub.id,{limit:100,offset:0});
 const repaired=revisions.find(r=>r.coverAssetId!==lost.id)!;
 expect(await assets.getAssetBytes(ctx,repaired.coverAssetId!)).toMatchObject({bytes});
 expect((await publishing.listRevisions(ctx,other.id,{limit:100,offset:0}))[0]!.coverAssetId).toBe(good.id);
});
it.each([
 {name:'不存在的父稿件',owner:null},
 {name:'其它用户的父稿件',owner:{userId:'other-user',accountId:'a'}},
 {name:'其它账号的父稿件',owner:{userId:'u',accountId:'other-account'}},
])('$name拒绝写发布事实与版本，不绕过真实父链',async({owner})=>{
 const {db,client}=await createDb();cleanups.push(()=>client.close());
 const ctx={userId:'u',accountId:'a',requestId:'r',source:'user' as const};
 if(owner)await seedAdjacentContent(db,{...ctx,...owner},['blocked-output']);
 let seq=0;
 const publishing=createPublishingService({db,now:()=>new Date().toISOString(),nextId:p=>`${p}-${++seq}`});
 const beforePublications=await db.select().from(publications);
 const beforeRevisions=await db.select().from(publicationRevisions);
 await expect(publishing.createImportedPublication(ctx,'blocked-output',{platform:'douyin',externalId:'blocked-video'})).rejects.toBeInstanceOf(OwnershipError);
 expect(await db.select().from(publications)).toEqual(beforePublications);
 expect(await db.select().from(publicationRevisions)).toEqual(beforeRevisions);
 expect(await publishing.listPublicationsForUser(ctx,{limit:100,offset:0})).toEqual([]);
});
it('单张封面检查未知时只延后该作品，其余缺失图片继续下载补齐',async()=>{
 const downloaded:string[]=[],saved:string[]=[],settled:Array<{id:string;success:boolean}>=[];
 const result=await backfillDouyinCovers({
  listMissingCover:async()=>[{publicationId:'unknown',externalId:'unknown-video',coverCheckError:'暂时无法检查封面文件'},{publicationId:'missing',externalId:'missing-video'}],
  fetchVideoUrl:async id=>{downloaded.push(id);return{coverUrl:'https://example.com/cover.png'};},
  downloadImage:async()=>({bytes:new Uint8Array([1]),mimeType:'image/png'}),
  createImageAsset:async()=>({id:'new-cover'}),setCover:async id=>{saved.push(id);},
  onSettled:async(id,result)=>{settled.push({id,success:result.success});},
 });
 expect(result).toMatchObject({attempted:2,filled:1,failed:1});
 expect(downloaded).toEqual(['missing-video']);expect(saved).toEqual(['missing']);
 expect(settled).toEqual([{id:'unknown',success:false},{id:'missing',success:true}]);
});
