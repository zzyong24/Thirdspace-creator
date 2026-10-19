// @vitest-environment node
import {afterAll,expect,it,vi} from 'vitest';
import {assets,assetFiles,resourceAccessGrants,eq} from '@creatoros/backend';
import {accountGroups} from '../../../backend/src/schema/account-groups';
import {getLocalFileRuntime,__resetPersistenceForTests} from './persistence-client';
const fixture=vi.hoisted(()=>{process.env.CREATOROS_DISABLE_SCHEDULER='1';return {db:null as import('@creatoros/backend').Db|null,dispose:async()=>{}};});
vi.mock('@creatoros/backend',async originalImport=>{
 const original=await originalImport<typeof import('@creatoros/backend')>();
 return {...original,createConfiguredDb:async()=>{const opened=await original.createDb();fixture.db=opened.db;fixture.dispose=()=>opened.client.close();return {db:opened.db,driver:{kind:'memory-pglite'},dispose:fixture.dispose};},resolveMasterKey:()=>({key:Buffer.alloc(32,7),degraded:false})};
});
afterAll(async()=>{await fixture.dispose();__resetPersistenceForTests();});
it('正式本地文件runtime支持无账号的组素材，外组不能按ID取得原文件路径',async()=>{
 __resetPersistenceForTests();const runtime=await getLocalFileRuntime(),db=fixture.db!,at=new Date().toISOString();
 await db.insert(accountGroups).values(['ga','gb'].map(id=>({id,userId:'local-file-owner',name:id,createdAt:at,updatedAt:at})));
 await db.insert(assets).values({id:'group-file',userId:'local-file-owner',groupId:'ga',accountId:null,assetType:'image',name:'组内封面',status:'active',currentFileId:'file',createdAt:at,updatedAt:at});
 await db.insert(assetFiles).values({id:'file',assetId:'group-file',versionNumber:1,storageKey:'original/path/cover.png',mimeType:'image/png',fileSize:10,checksum:'test-bytes',createdAt:at});
 const ctx={userId:'local-file-owner',groupId:'ga',accountId:null,requestId:'local-file',source:'user' as const};
 expect(await runtime.assetStorageKey(ctx,'group-file')).toBe('original/path/cover.png');
 await expect(runtime.assetStorageKey({...ctx,groupId:'gb'},'group-file')).rejects.toMatchObject({code:'OwnershipError'});
 await db.insert(resourceAccessGrants).values({id:'actual-file-grant',userId:ctx.userId,targetGroupId:'gb',originGroupId:'ga',resourceType:'asset',resourceId:'group-file',migrationId:'local-file-permission-fixture',createdAt:at});
 expect(await runtime.assetStorageKey({...ctx,groupId:'gb'},'group-file')).toBe('original/path/cover.png');
 await db.update(resourceAccessGrants).set({revokedAt:at}).where(eq(resourceAccessGrants.id,'actual-file-grant'));
 await expect(runtime.assetStorageKey({...ctx,groupId:'gb'},'group-file')).rejects.toMatchObject({code:'OwnershipError'});
});
