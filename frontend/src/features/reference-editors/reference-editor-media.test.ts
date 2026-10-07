import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {referenceEditorDocument} from '@creatoros/contract';
const h=vi.hoisted(()=>({download:vi.fn()}));
vi.mock('@/lib/contract-client',()=>({client:{getAssetFileDownloadUrl:h.download}}));
import {freezeGraphicDocument,hydrateGraphicDocument,uploadEditorMedia} from './reference-editor-media';
const refs=[{mediaId:'one',assetId:'a',assetFileId:'fa'},{mediaId:'two',assetId:'b',assetFileId:'fb'}];
const document=referenceEditorDocument.parse({editor:'kuaitu',revision:'b3bdcfb0bd6d8f98e7483cf561ac03ba56c0d889',mediaRefs:refs,nativeDocument:{objects:[{type:'image',src:'creatoros-media://one',left:10},{type:'image',src:'creatoros-media://two',left:20},{type:'textbox',text:'保留文字'}]}});
beforeEach(()=>{vi.clearAllMocks();h.download.mockImplementation(async({params})=>({url:`https://fixture.invalid/${params.assetId}`,fileName:'图片.png'}));vi.stubGlobal('fetch',vi.fn(async(url:string)=>{if(url.endsWith('/b'))throw Error('文件暂不可读');return new Response(new Blob(['fixture'],{type:'image/png'}));}));URL.createObjectURL=vi.fn(()=> 'blob:fixture');URL.revokeObjectURL=vi.fn();});
afterEach(()=>vi.unstubAllGlobals());
it('单个 exact file 暂不可读保留原引用、层级和其他图层，不整单失败',async()=>{
 const hydrated=await hydrateGraphicDocument(document,undefined,downloadOperation);const value=hydrated.document as any;
 expect(value.objects[0].src).toBe('blob:fixture');expect(value.objects[1]).toMatchObject({src:'creatoros-media://two',left:20,data:{creatorosMediaId:'two'}});expect(value.objects[2].text).toBe('保留文字');
 const saved=referenceEditorDocument.parse(freezeGraphicDocument(value,refs));expect(saved.mediaRefs).toEqual(refs);expect((saved.nativeDocument.objects as any[]).slice(0,2)).toMatchObject([{src:'creatoros-media://one'},{src:'creatoros-media://two'}]);hydrated.revoke();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fixture');
});
it('权限回执中止并释放已读取的临时资源',async()=>{
 h.download.mockImplementation(async({params})=>{if(params.assetId==='b')throw Object.assign(Error('拒绝访问'),{status:403});return {url:'https://fixture.invalid/a',fileName:'图.png'};});
 await expect(hydrateGraphicDocument(document,undefined,downloadOperation)).rejects.toThrow('拒绝访问');expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fixture');
});
it('取消后迟到文件不创建 Blob URL',async()=>{
 const controller=new AbortController();let resolve:(value:any)=>void=()=>{};h.download.mockImplementation(()=>new Promise(r=>{resolve=r;}));const job=hydrateGraphicDocument({...document,mediaRefs:[refs[0]]},controller.signal,downloadOperation);controller.abort();resolve({url:'https://fixture.invalid/a',fileName:'图.png'});
 await expect(job).rejects.toThrow();expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('未知导入媒体ID不能伪造真实素材引用；保留安全占位与缺失元数据',()=>{
 const image={type:'image',src:'data:image/png;base64,AA==',data:{creatorosMediaId:'unknown',creatorosMissingSource:'creatoros-media://unknown'},left:19};const saved=referenceEditorDocument.parse(freezeGraphicDocument({objects:[image]},refs));expect(saved.mediaRefs).toEqual([]);expect(saved.nativeDocument.objects).toEqual([image]);
});

import type {CreationOperation} from '@/lib/creation-workspace-scope';
const client={createUpload:vi.fn(),completeUpload:vi.fn(),createMaterialLink:vi.fn()};
const operation={scope:{groupId:'g',accountId:null},signal:new AbortController().signal,client,assertCurrent:vi.fn()} as unknown as CreationOperation;
const file=new File(['video'],'talk.mp4',{type:'video/mp4'});
function setupUpload(){vi.clearAllMocks();client.createUpload.mockResolvedValue({uploadId:'u',uploadUrl:'https://fixture.invalid/u'});client.completeUpload.mockResolvedValue({id:'a',currentFileId:'f'});client.createMaterialLink.mockResolvedValue({});vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(null,{status:200})));}
it('完成上传回执丢失后恢复原上传，不重复申请或发送已经完成的文件',async()=>{
 setupUpload();const intent:any={};client.completeUpload.mockRejectedValueOnce(Error('回执未确认'));
 const run=()=>uploadEditorMedia('p','o',file,operation,{intent} as never);
 await expect(run()).rejects.toThrow('回执未确认');const ref=await run();
 expect(client.createUpload).toHaveBeenCalledTimes(1);expect(fetch).toHaveBeenCalledTimes(1);
 expect(client.completeUpload.mock.calls.map(c=>c[0].params.uploadId)).toEqual(['u','u']);expect(ref).toMatchObject({assetId:'a',assetFileId:'f'});
});
it('创建上传结果未知时保留原意图，禁止重试生成第二份上传',async()=>{
 setupUpload();const intent:any={};client.createUpload.mockRejectedValueOnce(Error('连接中断'));
 const run=()=>uploadEditorMedia('p','o',file,operation,{intent} as never);
 await expect(run()).rejects.toThrow('连接中断');await expect(run()).rejects.toThrow('原上传');expect(client.createUpload).toHaveBeenCalledTimes(1);
});
it('原意图不能换作品或换 File 对象',async()=>{
 setupUpload();const intent:any={};await uploadEditorMedia('p','o',file,operation,{intent} as never);
 await expect(uploadEditorMedia('p','other',file,operation,{intent} as never)).rejects.toThrow('原上传');
 await expect(uploadEditorMedia('p','o',new File(['other'],'talk.mp4',{type:'video/mp4'}),operation,{intent} as never)).rejects.toThrow('原上传');
 expect(client.createUpload).toHaveBeenCalledTimes(1);
});

const downloadOperation={scope:{groupId:'g',accountId:null},signal:new AbortController().signal,assertCurrent:()=>{},client:{getAssetFileDownloadUrl:h.download}} as unknown as CreationOperation;
