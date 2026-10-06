import {createCreationWorkspace,readCreationScope,type CreationOperation} from '@/lib/creation-workspace-scope';
import type {ReferenceEditorDocument,ReferenceEditorMedia} from '@creatoros/contract';
export async function uploadEditorMedia(projectId:string,outputId:string,file:File,captured?:CreationOperation):Promise<ReferenceEditorMedia>{
 const workspace=captured?null:createCreationWorkspace(readCreationScope());workspace?.activate();const operation=captured??workspace!.capture(),api=operation.client;
 try{operation.assertCurrent();
 const assetType=file.type.startsWith('video/')?'video':file.type.startsWith('audio/')?'audio':file.type.startsWith('image/')?'image':null;
 if(!assetType||!file.size)throw Error('请选择有效的图片、音频或视频文件');
 const upload=await api.createUpload({params:undefined,query:undefined,body:{projectId,fileName:file.name,assetType,mimeType:file.type,fileSize:file.size}});
 operation.assertCurrent();if(upload.uploadUrl.startsWith('mock://'))throw Error('当前素材存储未接通，文件和输入已保留');
 const put=await fetch(upload.uploadUrl,{method:'PUT',headers:{'content-type':file.type},body:file,signal:operation.signal});
 operation.assertCurrent();if(!put.ok)throw Error(`素材上传未完成（${put.status}），请重试`);
 const asset=await api.completeUpload({params:{uploadId:upload.uploadId},query:undefined,body:{name:file.name}});
 operation.assertCurrent();if(!asset.currentFileId)throw Error('上传文件尚未确认，请保留当前素材');
 operation.assertCurrent();await api.createMaterialLink({params:undefined,query:undefined,body:{projectId,contentOutputId:outputId,entityType:'asset',entityId:asset.id,role:'reference',stage:'production'}});
 operation.assertCurrent();return{mediaId:crypto.randomUUID(),assetId:asset.id,assetFileId:asset.currentFileId};
 }finally{workspace?.dispose();}
}
export async function readEditorMedia(ref:ReferenceEditorMedia,signal?:AbortSignal,captured?:CreationOperation){
 const workspace=captured?null:createCreationWorkspace(readCreationScope());workspace?.activate();const operation=captured??workspace!.capture(),api=operation.client;
 const combined=signal?AbortSignal.any([signal,operation.signal]):operation.signal;
 try{operation.assertCurrent();
 operation.assertCurrent();combined.throwIfAborted();const link=await api.getAssetFileDownloadUrl({params:{assetId:ref.assetId,assetFileId:ref.assetFileId},query:undefined,body:undefined});
 operation.assertCurrent();combined.throwIfAborted();const response=await fetch(link.url,{signal:combined});if(!response.ok)throw Object.assign(Error('原素材文件暂不可读取，当前稿件已保留'),{status:response.status});
 const blob=await response.blob();operation.assertCurrent();combined.throwIfAborted();return new File([blob],link.fileName,{type:blob.type});
 }finally{workspace?.dispose();}
}
// SEMANTIC_BOUNDARY_ALLOW: 仅替换确切mediaId的临时资源地址；保留全部图层属性，不判断内容。
function mapJson(value:unknown,visit:(item:Record<string,unknown>)=>Record<string,unknown>):unknown{
 if(Array.isArray(value))return value.map(v=>mapJson(v,visit));
 if(!value||typeof value!=='object')return value;
 return visit(Object.fromEntries(Object.entries(value).map(([key,v])=>[key,mapJson(v,visit)])));
}
export function freezeGraphicDocument(document:Record<string,unknown>,media:ReferenceEditorMedia[]):ReferenceEditorDocument{
 const used=new Set<string>();const known=new Set(media.map(ref=>ref.mediaId));
 const nativeDocument=mapJson(document,item=>{
  const data=item.data as {creatorosMediaId?:string}|undefined;
  if(item.type==='image'&&data?.creatorosMediaId&&known.has(data.creatorosMediaId)){used.add(data.creatorosMediaId);return{...item,src:`creatoros-media://${data.creatorosMediaId}`};}
  return item;
 }) as ReferenceEditorDocument['nativeDocument'];
 return{editor:'kuaitu',revision:'b3bdcfb0bd6d8f98e7483cf561ac03ba56c0d889',nativeDocument,mediaRefs:media.filter(ref=>used.has(ref.mediaId))};
}
export async function hydrateGraphicDocument(document:ReferenceEditorDocument,signal?:AbortSignal,captured?:CreationOperation){
 const workspace=captured?null:createCreationWorkspace(readCreationScope());workspace?.activate();const operation=captured??workspace!.capture();
 const urls=new Map<string,string>();
 try{
  const reads=await Promise.allSettled(document.mediaRefs.map(async ref=>{const file=await readEditorMedia(ref,signal,operation);signal?.throwIfAborted();urls.set(ref.mediaId,URL.createObjectURL(file));}));
  operation.assertCurrent();signal?.throwIfAborted();
  // 临时缺失只保留原引用；权限/坏合同仍由原服务守卫中止。
  const failure=reads.find((result):result is PromiseRejectedResult=>result.status==='rejected'&&[400,401,403,428].includes((result.reason as {status?:number})?.status??0));if(failure)throw failure.reason;
  const nativeDocument=mapJson(document.nativeDocument,item=>{
   if(typeof item.src==='string'&&item.src.startsWith('creatoros-media://')){
    const mediaId=item.src.slice('creatoros-media://'.length),src=urls.get(mediaId)??item.src;
    return{...item,src,data:{...(item.data as object??{}),creatorosMediaId:mediaId}};
   }
   return item;
  });
  return{document:nativeDocument,revoke:()=>{urls.forEach(url=>URL.revokeObjectURL(url));}};
 }catch(error){urls.forEach(url=>URL.revokeObjectURL(url));throw error;}finally{workspace?.dispose();}
}
export function downloadEditorExport(blob:Blob,fileName:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=fileName;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
