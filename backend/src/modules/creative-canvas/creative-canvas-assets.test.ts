import {beforeAll,afterAll,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {createDb,assets,assetFiles,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';

import {createFixtureAssetsService} from '../../test-fixtures/owner-services';
import {createLocalFsObjectStorage} from '../assets/localfs-object-storage';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
let db:Db,close:()=>Promise<void>;const ctx:RequestContext={userId:'canvas-assets',accountId:'a',source:'user',requestId:'exact'};
const now='2026-10-02T00:00:00.000Z',deps={now:()=>now,nextId:(prefix:string)=>prefix+'id'};
const storageRoot=mkdtempSync(join(tmpdir(),'canvas-real-storage-'));let key=0;const storage=createLocalFsObjectStorage({rootPath:storageRoot,publicBaseUrl:'/api/v1/blob',expiresInMs:60000},{nextKey:()=>String(++key),now:()=>1000000});
const service=()=>createFixtureAssetsService(db,deps,async()=>storage,deps);
async function seed(id:string,status='active',checksum=true){const bytes=Buffer.from('real fixture PNG bytes '+id),hash=createHash('sha256').update(bytes).digest('hex');await storage.putObject({storageKey:id,bytes,mimeType:'image/png',assetType:'image'});await db.insert(assets).values({id,userId:ctx.userId,accountId:'a',assetType:'image',name:id,status,currentFileId:id+'-file',createdAt:now,updatedAt:now});await db.insert(assetFiles).values({id:id+'-file',assetId:id,versionNumber:1,storageKey:id,mimeType:'image/png',fileSize:bytes.length,checksum:checksum?hash:'',createdAt:now});return{bytes,hash};}
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});afterAll(async()=>{await close();rmSync(storageRoot,{recursive:true,force:true});});
it('原Assets精确历史file读取真实字节，当前别名变更不替换冻结文件',async()=>{const {bytes,hash}=await seed('old');await storage.putObject({storageKey:'new-bytes',bytes:Buffer.from('new image'),mimeType:'image/png',assetType:'image'});await db.insert(assetFiles).values({id:'new-file',assetId:'old',versionNumber:2,storageKey:'new-bytes',mimeType:'image/png',fileSize:9,checksum:'',createdAt:now});await db.update(assets).set({currentFileId:'new-file'});expect(await service().readImageReference(ctx,'old','old-file',hash)).toEqual({fileId:'old-file',checksum:hash,mimeType:'image/png',bytes:new Uint8Array(bytes)});});
it('未知metadata checksum由真实字节计算冻结值，跨号和其他asset文件拒绝',async()=>{const {hash}=await seed('missing','active',false);await seed('foreign-file');expect(await service().readImageReference(ctx,'missing')).toMatchObject({fileId:'missing-file',checksum:hash});await expect(service().readImageReference({...ctx,accountId:'b'},'missing')).rejects.toThrow();await expect(service().readImageReference(ctx,'missing','foreign-file-file')).rejects.toThrow();});
it('持久checksum与实际字节不符或冻结checksum改变时拒绝，原账本零写',async()=>{await seed('tampered');await storage.putObject({storageKey:'tampered',bytes:Buffer.from('changed'),mimeType:'image/png',assetType:'image'});const before=await db.select().from(assetFiles);await expect(service().readImageReference(ctx,'tampered','tampered-file')).rejects.toThrow('校验');await expect(service().readImageReference(ctx,'missing','missing-file','0'.repeat(64))).rejects.toThrow('校验');expect(await db.select().from(assetFiles)).toEqual(before);});
it('pending原生成图片可作参考，deleted图片拒绝',async()=>{await seed('pending','pending');expect(await service().readImageReference(ctx,'pending')).toMatchObject({fileId:'pending-file'});await seed('deleted','deleted');await expect(service().readImageReference(ctx,'deleted')).rejects.toThrow('可用图片');});
