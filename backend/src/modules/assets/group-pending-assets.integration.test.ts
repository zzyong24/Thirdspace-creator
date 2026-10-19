import {afterEach,expect,it} from 'vitest';
import {createDb} from '../../db';
import {createAccountGroupService} from '../platform-account/account-group.service';
import {createPendingDocumentService} from './pending-document.service';
import {createPendingGeneratedAssetService} from './pending-generated-asset.service';
import {assets} from '../../schema/assets';
let store:Awaited<ReturnType<typeof createDb>>;afterEach(async()=>store?.client.close());
it('空组网页正文和生成图像保持冻结组并可幂等恢复，另一组同key独立',async()=>{
 store=await createDb();let seq=0;const deps={db:store.db,now:()=>new Date().toISOString(),nextId:(p:string)=>p+'-'+ ++seq};const base={userId:'pending-owner',requestId:'pending',source:'user' as const};const groups=createAccountGroupService(deps);const a=(await groups.create(base,{name:'甲',idempotencyKey:'a'})).id,b=(await groups.create(base,{name:'乙',idempotencyKey:'b'})).id;
 const files=new Map<string,Uint8Array>(),mime=new Map<string,string>();const objectStorageForCtx=async()=>({getObject:async(k:string)=>files.get(k)??null,putObject:async(v:any)=>{files.set(v.storageKey,v.bytes);mime.set(v.storageKey,v.mimeType);},headObject:async(k:string)=>({fileSize:files.get(k)!.byteLength,mimeType:mime.get(k)!})} as any);const auth=async()=>{};
 const doc=createPendingDocumentService({...deps,objectStorageForCtx,authorize:auth});const gen=createPendingGeneratedAssetService({...deps,objectStorageForCtx,authorize:auth});
 const ctx={...base,groupId:a};const one=await doc.submit(ctx,{operationKey:'web-call',name:'网页',sourceUrl:'https://example.com/',fullText:'真实字节'});
 expect((await doc.submit(ctx,{operationKey:'web-call',name:'网页',sourceUrl:'https://example.com/',fullText:'真实字节'})).assetId).toBe(one.assetId);
 const image=await gen.submit(ctx,{operationKey:'image-call',assetType:'image',mimeType:'image/png',name:'图',bytes:new Uint8Array([1,2,3])});expect((await gen.recover(ctx,'image-call')).status).toBe('committed');
 expect((await gen.recover({...base,groupId:b},'image-call')).status).toBe('missing');
 const rows=await store.db.select().from(assets);expect(rows).toHaveLength(2);expect(rows.every(r=>r.groupId===a&&r.accountId===null)).toBe(true);expect(files.size).toBe(2);expect(image.assetId).not.toBe(one.assetId);
});
