import * as React from 'react';
import {describe,it,expect,vi,beforeEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
const mocks=vi.hoisted(()=>({request:vi.fn(),upload:vi.fn(),onFinalFile:vi.fn(),save:vi.fn(),getOutput:vi.fn(),getEditor:vi.fn(),createExport:vi.fn(),completeExport:vi.fn(),uploadFinal:vi.fn()}));
vi.mock('@/features/reference-editors/reference-editor-frame',()=>({ReferenceEditorFrame:React.forwardRef(function TestFrame(props:any,ref:any){React.useImperativeHandle(ref,()=>({request:mocks.request}));React.useEffect(()=>{props.onReady();},[]);return <div data-testid="test-frame"/>;})}));
vi.mock('@/features/reference-editors/reference-editor-media',()=>({
 uploadEditorMedia:mocks.upload,hydrateGraphicDocument:async(doc:any)=>({document:doc.nativeDocument,revoke:()=>{}}),readEditorMedia:async()=>new File(['file'],'fixture.mp4',{type:'video/mp4'}),downloadEditorExport:()=>{},
 freezeGraphicDocument:(doc:any,refs:any[])=>({editor:'kuaitu',revision:'b3bdcfb0bd6d8f98e7483cf561ac03ba56c0d889',nativeDocument:doc,mediaRefs:refs}),
}));
vi.mock('@/lib/contract-client',()=>({client:{saveProductionEditor:mocks.save,getOutput:mocks.getOutput,getProductionEditor:mocks.getEditor,createProductionExport:mocks.createExport,completeExport:mocks.completeExport}}));
vi.mock('@/features/production/production-resource-operations',()=>({uploadProductionAsset:mocks.uploadFinal,readVideoDurationViaElement:async()=>2}));
vi.mock('@/features/production/use-production-delivery',()=>({useProductionDelivery:()=>({hasExistingFinal:true,replaceOk:false,setReplaceOk:vi.fn(),finalBusy:false,finalError:null,finalNotice:null,onFinalFile:mocks.onFinalFile})}));
vi.mock('@/features/production/production-workbench',()=>({ProductionWorkbench:()=>null}));
vi.mock('@/features/production/rough-cut-workbench',()=>({RoughCutWorkbench:()=>null}));
vi.mock('@/features/production/production-conversion-panel',()=>({ProductionConversionPanel:()=>null}));
vi.mock('@/features/production/production-visual-editor',()=>({ProductionVisualEditor:()=>null}));
vi.mock('@/components/ui/dialog',()=>({Dialog:({children}:any)=><div>{children}</div>,DialogContent:({children}:any)=><div>{children}</div>,DialogTitle:({children}:any)=><h2>{children}</h2>}));
import {GraphicDesignWorkbench} from '../../../../../frontend/src/features/reference-editors/graphic-design-workbench';
import {VideoReferenceWorkbench} from '../../../../../frontend/src/features/reference-editors/video-reference-workbench';
const revision='b3bdcfb0bd6d8f98e7483cf561ac03ba56c0d889';
const oldDoc={objects:[{type:'textbox',text:'导出前'}]};const finalDoc={objects:[{type:'textbox',text:'实际导出'}]};
const design={target:{kind:'cover' as const},document:{editor:'kuaitu' as const,revision,nativeDocument:{},mediaRefs:[]}};
beforeEach(()=>{cleanup();vi.clearAllMocks();let uploaded=0;mocks.upload.mockImplementation(async()=>({mediaId:`export-${++uploaded}`,assetId:`asset-${uploaded}`,assetFileId:`file-${uploaded}`}));mocks.request.mockImplementation(async(op:string)=>op==='snapshot'?{document:oldDoc,mediaMetadata:[]}:op==='export'?{blob:new Blob(['valid-fixture']),fileName:'fixture.png',document:finalDoc}:{});mocks.getOutput.mockResolvedValue({primaryAssetId:'existing-final'});mocks.save.mockImplementation(async(input:any)=>({productionId:'prod',revision:input.body.expectedRevision+1,plan:input.body.plan}));mocks.uploadFinal.mockResolvedValue('actual-file-asset');mocks.createExport.mockResolvedValue({id:'export'});mocks.completeExport.mockResolvedValue({});});
describe('T1042 Host独立复核：机械桥夹具，不冒充浏览器导出',()=>{
 it('图文采用保存实际导出对应文档',async()=>{const onSave=vi.fn(async()=>{});render(<GraphicDesignWorkbench projectId="p" outputId="o" title="图卡" design={design} onSave={onSave} onClose={()=>{}}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'导出并采用图片'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'导出并采用图片'}));await waitFor(()=>expect(onSave).toHaveBeenCalledOnce());expect(onSave.mock.calls[0]![0].document.nativeDocument).toEqual(finalDoc);});
 it('图文保存未知回执重试沿已上传exactfile，不重复上传',async()=>{const onSave=vi.fn().mockRejectedValueOnce(Error('保存回执丢失')).mockResolvedValue(undefined);render(<GraphicDesignWorkbench projectId="p" outputId="o" title="图卡" design={design} onSave={onSave} onClose={()=>{}}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'导出并采用图片'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'导出并采用图片'}));await screen.findByRole('alert');await waitFor(()=>expect(screen.getByRole('button',{name:'导出并采用图片'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'导出并采用图片'}));await waitFor(()=>expect(onSave).toHaveBeenCalledTimes(2));expect(mocks.upload).toHaveBeenCalledOnce();expect(onSave.mock.calls[1]![1]).toEqual(onSave.mock.calls[0]![1]);});
 it('视频已有成片而未明确确认时不得再次采用覆盖',async()=>{const initial={outputId:'video',projectId:'project',productionId:'prod',revision:1,state:'editable' as const,unsupportedFields:[],plan:{editorVersion:3,referenceEditor:{editor:'opencut-classic',revision:'cf5e79e919144200294fb9fed22a222592a0aeea',nativeDocument:{},mediaRefs:[]}}};render(<VideoReferenceWorkbench initial={initial} title="视频" onOriginal={()=>{}} onSaved={()=>{}}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'导出 MP4'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'导出 MP4'}));const adopt=await screen.findByRole('button',{name:'采用为作品成片'});fireEvent.click(adopt);expect(mocks.onFinalFile).not.toHaveBeenCalled();});
});

describe('T1042 原实际frame消息校验',()=>{
 it('错session/source不采纳，确切回包可达；卸载拒绝在途请求',async()=>{
  const actual=await vi.importActual<typeof import('../../../../../frontend/src/features/reference-editors/reference-editor-frame')>('@/features/reference-editors/reference-editor-frame');
  const ref=React.createRef<import('../../../../../frontend/src/features/reference-editors/reference-editor-frame').EditorFrameHandle>();
  const changed=vi.fn();const mounted=render(<actual.ReferenceEditorFrame ref={ref} editor="kuaitu" onReady={()=>{}} onChanged={changed} onError={()=>{}} onImport={async()=>({mediaId:'one'})}/>);
  await waitFor(()=>expect(screen.getByTitle('图片设计工作台')).toBeInTheDocument());
  const frame=screen.getByTitle('图片设计工作台') as HTMLIFrameElement;const child=frame.contentWindow!;
  const post=vi.spyOn(child,'postMessage').mockImplementation(()=>{});
  const result=ref.current!.request('snapshot');const sent=post.mock.calls[0]![0] as any;let settled=false;void result.then(()=>{settled=true;});
  window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:child,data:{...sent,session:'old-session',operation:'result',payload:{wrong:true}}}));
  window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data:{...sent,operation:'result',payload:{wrong:true}}}));
  await Promise.resolve();expect(settled).toBe(false);
  window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:child,data:{...sent,operation:'result',payload:{document:{ok:true}}}}));
  await expect(result).resolves.toEqual({document:{ok:true}});
  const late=ref.current!.request('snapshot').catch(e=>e as Error);mounted.unmount();expect((await late).message).toContain('已切换作品');
  window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:child,data:{...sent,operation:'changed'}}));expect(changed).not.toHaveBeenCalled();
 });
});

describe('T1042 StrictMode与未知保存稳定请求',()=>{
 it('StrictMode重挂载setup后图文load完成恢复可操作',async()=>{render(<React.StrictMode><GraphicDesignWorkbench projectId="p" outputId="o" title="图卡" design={design} onSave={async()=>{}} onClose={()=>{}}/></React.StrictMode>);await waitFor(()=>expect(screen.getByRole('button',{name:'保存设计'})).not.toBeDisabled());expect(screen.queryByRole('alert')).not.toBeInTheDocument();});
 it('视频保存回执未知时原输入重试沿原request与版本',async()=>{const initial={outputId:'video',projectId:'project',productionId:'prod',revision:1,state:'editable' as const,unsupportedFields:[],plan:{editorVersion:3,referenceEditor:{editor:'opencut-classic',revision:'cf5e79e919144200294fb9fed22a222592a0aeea',nativeDocument:{},mediaRefs:[]}}};mocks.save.mockRejectedValueOnce(Error('保存回执未知'));render(<React.StrictMode><VideoReferenceWorkbench initial={initial} title="视频" onOriginal={()=>{}} onSaved={()=>{}}/></React.StrictMode>);await waitFor(()=>expect(screen.getByRole('button',{name:'保存工程'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'保存工程'}));await screen.findByRole('alert');await waitFor(()=>expect(screen.getByRole('button',{name:'保存工程'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'保存工程'}));await waitFor(()=>expect(mocks.save).toHaveBeenCalledTimes(2));expect(mocks.save.mock.calls[1]![0]).toEqual(mocks.save.mock.calls[0]![0]);});
 it('同session重复ready只初始化一次，避免原稿重载覆盖正在编辑内容',async()=>{const actual=await vi.importActual<typeof import('../../../../../frontend/src/features/reference-editors/reference-editor-frame')>('@/features/reference-editors/reference-editor-frame');const ready=vi.fn();render(<actual.ReferenceEditorFrame editor="kuaitu" onReady={ready} onChanged={()=>{}} onError={()=>{}} onImport={async()=>({mediaId:'one'})}/>);await waitFor(()=>expect(screen.getByTitle('图片设计工作台')).toBeInTheDocument());const frame=screen.getByTitle('图片设计工作台') as HTMLIFrameElement;const session=new URLSearchParams(new URL(frame.src).hash.replace(/^#\/?\??/,'')).get('session');const data={type:'creatoros.reference-editor',version:1,session,operation:'ready'};for(let i=0;i<2;i++)window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:frame.contentWindow!,data}));expect(ready).toHaveBeenCalledOnce();});
});

describe('T1042 未知手工保存与导出请求不能混配',()=>{
 it('手工保存未知后导出不得把新MP4配给旧保存快照',async()=>{
  const initial={outputId:'video',projectId:'project',productionId:'prod',revision:1,state:'editable' as const,unsupportedFields:[],plan:{editorVersion:3,referenceEditor:{editor:'opencut-classic',revision:'cf5e79e919144200294fb9fed22a222592a0aeea',nativeDocument:{},mediaRefs:[]}}};mocks.save.mockRejectedValueOnce(Error('手工保存回执未知'));
  render(<VideoReferenceWorkbench initial={initial} title="视频" onOriginal={()=>{}} onSaved={()=>{}}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'保存工程'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'保存工程'}));await screen.findByRole('alert');await waitFor(()=>expect(screen.getByRole('button',{name:'保存工程'})).not.toBeDisabled());
  const button=screen.getByRole('button',{name:'导出 MP4'});if(button.hasAttribute('disabled'))return;
  fireEvent.click(button);await waitFor(()=>expect(mocks.save).toHaveBeenCalledTimes(2));
  if(screen.queryByRole('button',{name:'采用为作品成片'})){expect(mocks.save.mock.calls[1]![0].body.plan.referenceEditor.nativeDocument.objects).toEqual(finalDoc.objects);}
  else{expect(mocks.request.mock.calls.filter(call=>call[0]==='export')).toHaveLength(0);fireEvent.click(screen.getByRole('button',{name:'导出 MP4'}));await screen.findByRole('button',{name:'采用为作品成片'});expect(mocks.save.mock.calls[2]![0].body.plan.referenceEditor.nativeDocument.objects).toEqual(finalDoc.objects);expect(mocks.save.mock.calls[2]![0].body.expectedRevision).toBe(2);}
 });
});

describe('T1042 实际制作入口切换作品',()=>{
 it('切作品重挂载，旧scope迟到读回不覆盖新作品保存',async()=>{
  const {ProductionEditorEntry}=await import('../../../../../frontend/src/features/production/production-editor-entry');
  const owner=(id:string)=>({outputId:id,projectId:'project',productionId:'prod-'+id,revision:1,state:'editable' as const,unsupportedFields:[],plan:{editorVersion:3,referenceEditor:{editor:'opencut-classic',revision:'cf5e79e919144200294fb9fed22a222592a0aeea',nativeDocument:{},mediaRefs:[]}}});
  let release!:(data:any)=>void;const old=new Promise(resolve=>{release=resolve;});mocks.getEditor.mockImplementation(async(input:any)=>input.params.outputId==='old'?old:owner('new'));
  const base={projectId:'project',projectTitle:'测试',accountId:'account',outputId:'old'};
  const mounted=render(<ProductionEditorEntry {...base as any}/>);await waitFor(()=>expect(mocks.getEditor).toHaveBeenCalledOnce());mounted.rerender(<ProductionEditorEntry {...base as any} outputId="new"/>);await waitFor(()=>expect(screen.getByRole('button',{name:'保存工程'})).not.toBeDisabled());release(owner('old'));await Promise.resolve();fireEvent.click(screen.getByRole('button',{name:'保存工程'}));await waitFor(()=>expect(mocks.save).toHaveBeenCalledOnce());expect(mocks.save.mock.calls[0]![0].params.outputId).toBe('new');
 });
});

describe('T1042 原delivery按导出真实画布登记',()=>{
 it('900x1200原生成片不写成1920x1080，原公共导出服务记录正确尺寸',async()=>{
  const actual=await vi.importActual<typeof import('../../../../../frontend/src/features/production/use-production-delivery')>('@/features/production/use-production-delivery');
  function Probe(){const delivery=actual.useProductionDelivery({projectId:'project',outputId:'video',status:'editing',finalVideoAssetId:null,renderOrientation:'landscape',renderDimensions:{width:900,height:1200},readVideoDuration:async()=>2,ensureOutputId:async()=> 'video',advanceStatus:async()=> 'prod',setFinalVideoAssetId:vi.fn()});return <button onClick={()=>void delivery.onFinalFile(new File(['video'],'real.mp4',{type:'video/mp4'}))}>采用真实尺寸视频</button>;}
  render(<Probe/>);fireEvent.click(screen.getByRole('button',{name:'采用真实尺寸视频'}));await waitFor(()=>expect(mocks.completeExport).toHaveBeenCalledOnce());expect(mocks.createExport.mock.calls[0]![0].body).toMatchObject({resolution:'900x1200'});const ratio=mocks.createExport.mock.calls[0]![0].body.aspectRatio.split(':').map(Number);expect(ratio[0]*1200).toBe(ratio[1]*900);
 });
});

describe('T1042 未知保存返回保护',()=>{
 it('图文初始保存未知时返回也保留冻结稿与exact文件',async()=>{
  const onClose=vi.fn();render(<GraphicDesignWorkbench projectId="p" outputId="o" title="图卡" design={design} onSave={async()=>{throw Error('回执未知');}} onClose={onClose}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'保存设计'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'保存设计'}));await screen.findByRole('alert');await waitFor(()=>expect(screen.getByRole('button',{name:'保存设计'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'返回稿件'}));expect(onClose).not.toHaveBeenCalled();
 });
 it('初始稿未改动的保存未知也不可直接返回丢原request',async()=>{
  const initial={outputId:'video',projectId:'project',productionId:'prod',revision:1,state:'editable' as const,unsupportedFields:[],plan:{editorVersion:3,referenceEditor:{editor:'opencut-classic',revision:'cf5e79e919144200294fb9fed22a222592a0aeea',nativeDocument:{},mediaRefs:[]}}};const onOriginal=vi.fn();mocks.save.mockRejectedValueOnce(Error('回执未知'));
  render(<VideoReferenceWorkbench initial={initial} title="视频" onOriginal={onOriginal} onSaved={()=>{}}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'保存工程'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'保存工程'}));await screen.findByRole('alert');await waitFor(()=>expect(screen.getByRole('button',{name:'保存工程'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'原方案与粗剪'}));expect(onOriginal).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'历史版本'})).toBeDisabled();
 });
});
