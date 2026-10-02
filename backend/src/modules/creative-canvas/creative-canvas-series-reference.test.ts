import {it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {createDb} from '@creatoros/backend';
import {createCreativeCanvasService} from './creative-canvas.service';
const ctx={userId:'canvas-series-user',accountId:'canvas-series-account',requestId:'req',source:'user'} as const;
const bytes=new Uint8Array([1,2,3]),checksum=createHash('sha256').update(bytes).digest('hex');
it('持久精确参考文件而非currentFile，公共生成、原attempt恢复和旧自由画布均保留真实版本',async()=>{
 const opened=await createDb();const submitted=new Map();
 const getReference=vi.fn(async(_c,_id,fileId)=>({fileId:fileId??'file-current',checksum,mimeType:'image/png',bytes}));
 const submitTask=vi.fn(async(_c,input)=>{submitted.set(input.attemptId,input.inputData);return {id:'task-'+input.attemptId};});
 const s=createCreativeCanvasService(opened.db,{now:()=>new Date().toISOString(),assertProject:async()=>{},assertMediaAsset:async()=>({fileId:'file-old',checksum}),assertReferenceAsset:async()=>{},getReference,resolveCapability:async()=>({provider:'minimax',model:'image-01'}),submitTask,
  readTask:async(c:any,id:string)=>({id,userId:c.userId,accountId:c.accountId,taskType:'asset.generate',attemptId:id.slice(5),projectId:null,inputData:submitted.get(id.slice(5)),status:'queued'})} as never);
 try{
  const canvas=await s.create(ctx,{title:'指定页'});
  const document:any={schemaVersion:1,viewport:{x:0,y:0,zoom:1},edges:[],nodes:[{id:'page',type:'image_generation',label:'第二页',position:{x:0,y:0},mode:'image_to_image',prompt:'已确认的第二页',referenceAssetId:'ref',referenceFileId:'file-old',aspectRatio:'3:4'}]};
  const saved=await s.save(ctx,canvas.id,{expectedRevision:canvas.revision,document});
  const link=await s.generate(ctx,canvas.id,'page',{expectedRevision:saved.revision,attemptId:'series-attempt-original'});
  expect(link.referenceFileId).toBe('file-old');expect(submitted.get('series-attempt-original')).toMatchObject({referenceFileId:'file-old',referenceChecksum:checksum,aspectRatio:'3:4'});
  expect(getReference).toHaveBeenCalledWith(expect.anything(),'ref','file-old');
  expect(await s.generate(ctx,canvas.id,'page',{expectedRevision:saved.revision,attemptId:'series-attempt-original'})).toMatchObject({id:link.id,taskId:link.taskId,inputDigest:link.inputDigest,inputRevision:link.inputRevision,referenceFileId:link.referenceFileId,referenceChecksum:link.referenceChecksum});
  expect(submitTask).toHaveBeenCalledOnce();
  await expect(s.generate({...ctx,accountId:'other'},canvas.id,'page',{expectedRevision:saved.revision,attemptId:'series-attempt-other'})).rejects.toThrow();
  const {referenceFileId,...legacyNode}=document.nodes[0];
  const legacy=await s.save(ctx,canvas.id,{expectedRevision:saved.revision,document:{...document,nodes:[legacyNode]}});
  expect((await s.generate(ctx,canvas.id,'page',{expectedRevision:legacy.revision,attemptId:'series-attempt-legacy'})).referenceFileId).toBe('file-current');
 }finally{await opened.client.close();}
});
it('精确参考端口若返回别的file，生成不能换图',async()=>{
 const opened=await createDb();const s=createCreativeCanvasService(opened.db,{now:()=>new Date().toISOString(),assertReferenceAsset:async()=>{},getReference:async()=>({fileId:'wrong-current',checksum,mimeType:'image/png',bytes}),resolveCapability:async()=>({provider:'minimax',model:'image-01'}),submitTask:vi.fn()} as never);
 try{
  const canvas=await s.create(ctx,{title:'错误引用'});
  const doc:any={schemaVersion:1,viewport:{x:0,y:0,zoom:1},edges:[],nodes:[{id:'page',type:'image_generation',label:'',position:{x:0,y:0},mode:'image_to_image',prompt:'第二页',referenceAssetId:'ref',referenceFileId:'file-old'}]};
  const saved=await s.save(ctx,canvas.id,{expectedRevision:canvas.revision,document:doc});
  await expect(s.generate(ctx,canvas.id,'page',{expectedRevision:saved.revision,attemptId:'series-attempt-mismatch'})).rejects.toThrow('参考');
 }finally{await opened.client.close();}
});
