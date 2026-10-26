import * as React from 'react';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const h=vi.hoisted(()=>({request:vi.fn(),changed:null as null|(()=>void),saved:vi.fn(),client:{getOutput:vi.fn(),getProductionEditorReceipt:vi.fn(),saveProductionEditor:vi.fn(),getProductionEditorVersion:vi.fn(),getProductionEditor:vi.fn(),applyProductionEditor:vi.fn()},rough:null as any,missing:false,failApply:false}));
vi.mock('@/lib/contract-client',()=>({client:h.client}));
vi.mock('./reference-editor-media',()=>({readEditorMedia:vi.fn(async()=>{if(h.missing)throw Error('不可选素材暂不可读');return new File(['video'],'原片.mp4',{type:'video/mp4'});}),uploadEditorMedia:vi.fn(),downloadEditorExport:vi.fn()}));
vi.mock('./native-editor-surface',()=>({NativeEditorSurface:React.forwardRef(function Frame(props:any,ref:any){React.useImperativeHandle(ref,()=>({request:h.request}),[]);h.changed=props.onChanged;React.useEffect(()=>{props.onReady();},[]);return <div>真实原生编辑器边界{props.workspaceAddons?.transcript}</div>;})}));
vi.mock('@/features/production/use-production-delivery',()=>({useProductionDelivery:()=>({})}));
vi.mock('./native-source-panel',()=>({NativeSourcePanel:()=> <div data-testid="native-source-entry">选择视频并检查声音</div>}));
vi.mock('@/features/production/production-transcript-panel',()=>({ProductionTranscriptPanel:()=> <div data-testid="transcript-entry">生成视频文字</div>}));
vi.mock('@/features/production/production-rough-candidate-panel',()=>({ProductionRoughCandidatePanel:(props:any)=>{h.rough=props;return <div>同工程粗剪建议</div>;}}));
import {VideoReferenceWorkbench} from './video-reference-workbench';
import {readEditorMedia} from './reference-editor-media';
import {DraftChatRequestProvider,useDraftChatRequest,editorDigest} from '@/features/draft-workbench/draft-chat-request';
const source={sourceId:'source',assetId:'asset',assetFileId:'file',fileDigest:'a'.repeat(64),probeDigest:'b'.repeat(64),timebase:{num:1,den:120000},durationTicks:720000,hasAudio:true};
const tracks={main:{id:'main',type:'video',elements:[{id:'clip',type:'video',mediaId:'media',name:'原片',startTime:0,duration:720000,trimStart:0,trimEnd:0}]},overlay:[{id:'text',type:'text',elements:[{id:'title',type:'text',content:'独立标题',startTime:0,duration:720000,trimStart:0,trimEnd:0}]}],audio:[]};
const native={metadata:{id:'output',name:'测试稿'},currentSceneId:'scene',scenes:[{id:'scene',tracks}],settings:{},version:31,mediaMetadata:[{mediaId:'media',name:'原片.mp4',type:'video'}]};
const plan={editorVersion:3,referenceEditor:{editor:'opencut-classic',revision:'cf5e79e919144200294fb9fed22a222592a0aeea',nativeDocument:native,mediaRefs:[{mediaId:'media',assetId:'asset',assetFileId:'file'}]},nativeSources:[{mediaId:'media',source}],sourceTranscripts:[]};
const initial:any={outputId:'output',projectId:'project',productionId:'production',revision:1,state:'editable',plan,unsupportedFields:[]};
let local:any;
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();local=structuredClone(native);h.missing=false;h.failApply=false;localStorage.setItem('creatoros:current-account','account');document.cookie='creatoros_current_account=account';h.client.getProductionEditorReceipt.mockResolvedValue(null);h.client.getOutput.mockResolvedValue({});h.client.saveProductionEditor.mockImplementation(async({body}:any)=>({revision:2,productionId:'production',plan:body.plan}));h.client.getProductionEditorVersion.mockResolvedValue({plan});h.request.mockImplementation(async(op:string,payload:any)=>{if(op==='load')return {};if(op==='snapshot')return{document:local,mediaMetadata:local.mediaMetadata};if(op==='context')return{document:local,mediaMetadata:local.mediaMetadata,contextEpoch:7,outputId:'output',sceneId:'scene',trackId:'main',selectedElements:[{trackId:'main',elementId:'clip'},{trackId:'other-overlay',elementId:'overlay'}]};if(op==='apply-tracks'){if(h.failApply){h.failApply=false;throw Error('未知ACK');}local.scenes[0].tracks=structuredClone(payload.afterTracks);return{applied:true,sceneId:'scene'};}});});
afterEach(cleanup);
let director:ReturnType<typeof useDraftChatRequest>;
function DirectorProbe(){director=useDraftChatRequest();return null;}
it('重新打开工程还原已保存素材mtime与原bytes，不能把下载时刻当成用户修改',async()=>{
 const savedPlan=structuredClone(plan);(savedPlan.referenceEditor.nativeDocument.mediaMetadata[0] as any).lastModified=1700000000123;
 render(<VideoReferenceWorkbench initial={{...initial,plan:savedPlan}} title="还原原素材" onOriginal={()=>{}} onSaved={h.saved}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'保存工程'})).toBeEnabled());
 const file=h.request.mock.calls.find(row=>row[0]==='load')![1].media[0].file as File;
 expect(file.lastModified).toBe(1700000000123);expect(file.name).toBe('原片.mp4');expect(file.type).toBe('video/mp4');expect(await file.text()).toBe('video');
 expect(h.client.saveProductionEditor).not.toHaveBeenCalled();
});
it('刷新恢复原视频候选用真实已保存前值和现在epoch；不发模型、不保存、不加载替代工程',async()=>{
 const original=h.request.getMockImplementation()!;
 h.client.getProductionEditor.mockResolvedValue(initial);
 h.request.mockImplementation(async(op:string,payload:any)=>{if(op==='preview-scene')return{blob:new Blob(['真实预览端口']),fileName:'恢复候选.mp4',sceneId:payload.targetSceneId,candidateDigest:payload.candidateDigest,contextEpoch:payload.baseContextEpoch};return original(op,payload);});
 render(<DraftChatRequestProvider><DirectorProbe/><VideoReferenceWorkbench sessionIdentity={{scopeKey:'account:account',projectId:'project',outputId:'output',generation:71}} initial={initial} title="恢复剪辑候选" onOriginal={()=>{}} onSaved={h.saved}/></DraftChatRequestProvider>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'保存工程'})).toBeEnabled());
 const beforeDigest=await editorDigest(tracks),documentDigest=await editorDigest(plan);
 const target:any={schemaVersion:1,projectId:'project',outputId:'output',owner:'production',contentType:'video',savedBase:{kind:'production',productionId:'production',revision:1},documentDigest,selection:{kind:'native_scene',sceneId:'scene',elementRefs:[],playheadTick:0,contextEpoch:999,editorGeneration:'71'}};
 const candidate:any={kind:'work.editor.candidate',target,candidate:{kind:'native_scene',document:{...local.scenes[0],tracks:{...tracks,main:{...tracks.main,elements:[]}}}},candidateDigest:'sha256:'+'c'.repeat(64),apply:{operation:'applyProductionEditor',outputId:'output',body:{expectedRevision:1,edits:[{type:'replaceNativeSceneTracks',sceneId:'scene',expectedBeforeDigest:beforeDigest,tracks:{...tracks,main:{...tracks.main,elements:[]}}}]}}};
 const loadCount=h.request.mock.calls.filter(row=>row[0]==='load').length;
 expect((await director.previewEditorCandidate(candidate))?.fileName).toBe('恢复候选.mp4');
 expect(h.request.mock.calls.find(row=>row[0]==='preview-scene')?.[1].baseContextEpoch).toBe(7);
 h.client.getProductionEditor.mockResolvedValue({...initial,revision:2});
 await expect(director.previewEditorCandidate(candidate)).rejects.toThrow(/基准工程/);
 h.client.getProductionEditor.mockResolvedValue(initial);
 local.scenes[0].tracks.main.elements[0].duration=600000;
 await expect(director.previewEditorCandidate(candidate)).rejects.toThrow(/时间轴/);
 expect(h.request.mock.calls.filter(row=>row[0]==='preview-scene')).toHaveLength(1);
 expect(h.request.mock.calls.filter(row=>row[0]==='load')).toHaveLength(loadCount);
 expect(h.request.mock.calls.some(row=>row[0]==='apply-tracks')).toBe(false);
 expect(h.client.saveProductionEditor).not.toHaveBeenCalled();
});
it('刷新后原已保存但ACK未知的采纳重用原body/key，不能被旧revision阻断或重复apply',async()=>{
 const after=structuredClone(plan);after.referenceEditor.nativeDocument.scenes[0].tracks.main.elements=[];local=structuredClone(after.referenceEditor.nativeDocument);
 const receipt:any={...initial,revision:2,plan:after,requestId:'原采纳请求'};
 h.client.getProductionEditorReceipt.mockResolvedValue(receipt);h.client.applyProductionEditor.mockResolvedValue(receipt);
 h.client.getProductionEditor.mockResolvedValue(receipt);
 h.client.getProductionEditorVersion.mockImplementation(async({params}:any)=>({...initial,revision:params.revision,plan:params.revision===1?plan:after}));
 render(<DraftChatRequestProvider><DirectorProbe/><VideoReferenceWorkbench initial={receipt} title="恢复原采纳" onOriginal={()=>{}} onSaved={h.saved}/></DraftChatRequestProvider>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'保存工程'})).toBeEnabled());
 const body={expectedRevision:1,edits:[{type:'replaceNativeSceneTracks',sceneId:'scene',expectedBeforeDigest:await editorDigest(tracks),tracks:after.referenceEditor.nativeDocument.scenes[0].tracks}]};
 const candidate:any={kind:'work.editor.candidate',target:{outputId:'output',savedBase:{kind:'production',productionId:'production',revision:1}},candidate:{kind:'native_scene',document:after.referenceEditor.nativeDocument.scenes[0]},apply:{operation:'applyProductionEditor',outputId:'output',body},candidateDigest:'sha256:'+'d'.repeat(64)};
 expect(await director.adoptEditorCandidate(candidate,'原采纳请求')).toEqual({status:'adopted',revision:2});
 expect(h.client.getProductionEditorReceipt).toHaveBeenCalledWith({params:{outputId:'output',requestId:'原采纳请求'},query:undefined,body:undefined});expect(h.client.applyProductionEditor).not.toHaveBeenCalled();
 expect(h.request.mock.calls.some(row=>row[0]==='apply-tracks')).toBe(false);
 expect(h.client.saveProductionEditor).not.toHaveBeenCalled();
});
it('编导冻结原host identity与当场选区；preview-scene传actual File/身份但不load/save/apply',async()=>{
 const original=h.request.getMockImplementation()!;
 h.client.getProductionEditor.mockResolvedValue(initial);
 h.request.mockImplementation(async(op:string,payload:any)=>{if(op==='context')return {...await original(op,payload),playheadTick:12000,ticksPerSecond:120000};if(op==='preview-scene')return{operation:op,blob:new Blob(['actual-native-port-boundary'],{type:'video/mp4'}),fileName:'候选.mp4',sceneId:payload.targetSceneId,candidateDigest:payload.candidateDigest,contextEpoch:payload.baseContextEpoch,documentVersion:31};return original(op,payload);});
 render(<DraftChatRequestProvider><DirectorProbe/><VideoReferenceWorkbench sessionIdentity={{scopeKey:'account:account',projectId:'project',outputId:'output',generation:71}} initial={initial} title="编导精剪" onOriginal={()=>{}} onSaved={h.saved}/></DraftChatRequestProvider>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'保存工程'})).toBeEnabled());
 const target=await director.prepareEditorTurn();expect(target).toMatchObject({owner:'production',savedBase:{productionId:'production',revision:1},selection:{sceneId:'scene',playheadTick:12000,contextEpoch:7,editorGeneration:expect.stringMatching(/^71:/),elementRefs:[{trackId:'main',elementId:'clip'},{trackId:'other-overlay',elementId:'overlay'}]}});
 const loaded=h.request.mock.calls.find(row=>row[0]==='load')![1],loadCount=h.request.mock.calls.filter(row=>row[0]==='load').length;
 const candidate:any={kind:'work.editor.candidate',target,candidate:{kind:'native_scene',document:{...local.scenes[0],tracks:{...tracks,main:{...tracks.main,elements:tracks.main.elements.map(element=>({...element,duration:600000}))}}}},candidateDigest:'sha256:'+ 'c'.repeat(64),apply:{operation:'applyProductionEditor',body:{edits:[{sceneId:'scene',expectedBeforeDigest:await editorDigest(tracks)}]}}};
 const output=await director.previewEditorCandidate(candidate);expect(output?.blob.size).toBeGreaterThan(0);
 const input=h.request.mock.calls.find(row=>row[0]==='preview-scene')![1];expect(input).toMatchObject({owner:{accountId:'account',projectId:'project',outputId:'output'},targetSceneId:'scene',baseContextEpoch:7,candidateDigest:candidate.candidateDigest,media:[{mediaId:'media',assetId:'asset',assetFileId:'file'}]});expect(input.media[0].file).toBe(loaded.media[0].file);
 expect(h.request.mock.calls.filter(row=>row[0]==='load')).toHaveLength(loadCount);expect(h.request.mock.calls.some(row=>row[0]==='apply-tracks')).toBe(false);expect(h.client.saveProductionEditor).not.toHaveBeenCalled();
 const previous=h.request.getMockImplementation()!;
 h.request.mockImplementation(async(op:string,payload:any)=>op==='context'?{...await previous(op,payload),contextEpoch:8}:previous(op,payload));
 await expect(director.previewEditorCandidate(candidate)).rejects.toThrow(/时间轴或选区/);
 expect(h.request.mock.calls.filter(row=>row[0]==='preview-scene')).toHaveLength(1);
});
async function open(){render(<VideoReferenceWorkbench initial={initial} title="真实粗剪" onOriginal={()=>{}} onSaved={h.saved}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'保存工程'})).not.toBeDisabled());}
it('保存期间完成的在途导入在回执后仍是未保存修改',async()=>{
 let finish:(value:any)=>void=()=>{};h.client.saveProductionEditor.mockImplementation(({body}:any)=>new Promise(resolve=>{finish=()=>resolve({revision:2,productionId:'production',plan:body.plan});}));await open();fireEvent.click(screen.getByRole('button',{name:'保存工程'}));await waitFor(()=>expect(h.client.saveProductionEditor).toHaveBeenCalledOnce());const frozen=structuredClone(h.client.saveProductionEditor.mock.calls[0][0].body.plan);
 local.mediaMetadata[0].unknownEditable='保存期间的后续修改';h.changed?.();finish(null);await screen.findByText('有未保存修改');expect(h.client.saveProductionEditor.mock.calls[0][0].body.plan).toEqual(frozen);
});
it('保存保留不可变原片来源；AI用只读投影和真实main选区而不产生v2plan',async()=>{await open();fireEvent.click(screen.getByRole('button',{name:'保存工程'}));await waitFor(()=>expect(h.client.saveProductionEditor).toHaveBeenCalled());expect(h.client.saveProductionEditor.mock.calls[0][0].body.plan.nativeSources).toEqual(plan.nativeSources);expect(h.client.saveProductionEditor.mock.calls[0][0].body.plan.editorVersion).toBe(3);fireEvent.click(screen.getByRole('button',{name:'按文字剪视频'}));await waitFor(()=>expect(h.rough?.nativeScope.selectedClipIds).toEqual(['clip']));expect(h.rough.document.plan.editorVersion).toBe(3);expect(h.rough.planView.editorVersion).toBe(2);});
it('一次采纳apply保留Core，未知ACK恢复重用同ID同完整before；采用后Undo变化仍dirty',async()=>{await open();fireEvent.click(screen.getByRole('button',{name:'按文字剪视频'}));await waitFor(()=>expect(h.rough).toBeTruthy());const after=structuredClone(plan);after.referenceEditor.nativeDocument.scenes[0].tracks.main.elements=[];const version:any={outputId:'output',productionId:'production',revision:3,plan:after,requestId:'adopt'};h.failApply=true;await expect(h.rough.onSaved(version,{requestId:'adopt',expectedRevision:1})).rejects.toThrow('未知ACK');const one=h.request.mock.calls.find(c=>c[0]==='apply-tracks')!;expect(one[1].beforeTracks.overlay).toEqual(tracks.overlay);await h.rough.onSaved(version,{requestId:'adopt',expectedRevision:1});const calls=h.request.mock.calls.filter(c=>c[0]==='apply-tracks');expect(calls[1]).toEqual(calls[0]);expect(h.request.mock.calls.filter(c=>c[0]==='load')).toHaveLength(1);local.scenes[0].tracks=structuredClone(tracks);h.changed?.();await screen.findByText(/有未保存修改/);});
it('缺一个可选素材只局部降级，仍可保存且保留原引用和metadata',async()=>{h.missing=true;await open();await screen.findByText(/1 个素材暂未读到/);fireEvent.click(screen.getByRole('button',{name:'保存工程'}));await waitFor(()=>expect(h.client.saveProductionEditor).toHaveBeenCalled());const saved=h.client.saveProductionEditor.mock.calls[0][0].body.plan;expect(saved.referenceEditor.mediaRefs).toEqual(plan.referenceEditor.mediaRefs);expect(saved.referenceEditor.nativeDocument.mediaMetadata).toEqual(native.mediaMetadata);});

it.each([null,{editorVersion:2}])('新工程或旧稿进入编辑器不会强制parse原生3 (%j)',async old=>{render(<VideoReferenceWorkbench initial={{...initial,plan:old}} title="新稿" onOriginal={()=>{}} onSaved={h.saved}/>);await waitFor(()=>expect(h.request).toHaveBeenCalledWith('load',expect.objectContaining({document:null})));expect(screen.getByRole('button',{name:'按文字剪视频'})).toBeInTheDocument();});

it('干净工程仅自动updatedAt变化及服务revision不会再save，首次采用沿用候选版本',async()=>{
 const saved=structuredClone(initial);saved.plan.revision=1;saved.plan.referenceEditor.nativeDocument.metadata.updatedAt='2026-10-02T00:00:00.000Z';saved.plan.referenceEditor.nativeDocument.scenes[0].updatedAt='2026-10-02T00:00:00.000Z';local.metadata.updatedAt='2026-10-03T00:00:00.000Z';local.scenes[0].updatedAt='2026-10-03T00:00:00.000Z';h.rough=null;
 render(<VideoReferenceWorkbench initial={saved} title="干净已保存工程" onOriginal={()=>{}} onSaved={h.saved}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'保存工程'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'按文字剪视频'}));await waitFor(()=>expect(h.rough).toBeTruthy());expect(h.client.saveProductionEditor).not.toHaveBeenCalled();expect((await h.rough.prepareDocument()).revision).toBe(1);expect((await h.rough.prepareDocument()).revision).toBe(1);expect(h.client.saveProductionEditor).not.toHaveBeenCalled();
});
it('通知尚未到达的独立轨未知editable字段及metadata改变仍先save，不忽略任意updatedAt',async()=>{
 h.rough=null;await open();fireEvent.click(screen.getByRole('button',{name:'按文字剪视频'}));await waitFor(()=>expect(h.rough).toBeTruthy());h.client.saveProductionEditor.mockClear();local.scenes[0].tracks.overlay[0].elements[0].customEditable={updatedAt:'用户手动修改'};local.mediaMetadata[0].customEditable='真实媒体变化';await h.rough.prepareDocument();expect(h.client.saveProductionEditor).toHaveBeenCalledOnce();const body=h.client.saveProductionEditor.mock.calls[0][0].body;expect(body.plan.referenceEditor.nativeDocument.scenes[0].tracks.overlay[0].elements[0].customEditable).toEqual({updatedAt:'用户手动修改'});expect(body.plan.referenceEditor.nativeDocument.mediaMetadata[0].customEditable).toBe('真实媒体变化');expect(body.plan.referenceEditor.mediaRefs).toEqual(plan.referenceEditor.mediaRefs);expect(body.plan.nativeSources).toEqual(plan.nativeSources);
});
it('实际dirty仍先save；unknown原保存即使当前snapshot相同也不能绕过冻结body',async()=>{
 h.rough=null;await open();fireEvent.click(screen.getByRole('button',{name:'按文字剪视频'}));await waitFor(()=>expect(h.rough).toBeTruthy());h.client.saveProductionEditor.mockClear();h.changed?.();await h.rough.prepareDocument();expect(h.client.saveProductionEditor).toHaveBeenCalledOnce();h.client.saveProductionEditor.mockRejectedValueOnce(Error('保存回执未知'));fireEvent.click(screen.getByRole('button',{name:'保存工程'}));await screen.findByRole('alert');const frozen=h.client.saveProductionEditor.mock.calls[1][0].body;local.metadata.updatedAt='自动更新';await h.rough.prepareDocument();expect(h.client.saveProductionEditor.mock.calls[2][0].body).toEqual(frozen);expect(h.client.saveProductionEditor.mock.calls[2][0].body.requestId).toBe(frozen.requestId);
});

it('正常采用后的自动项目/scene时间变化不标dirty，明确采用成功且下次prepare不save',async()=>{
 const baseRequest=h.request.getMockImplementation()!;h.request.mockImplementation(async(op:string,payload:any)=>{const result=await baseRequest(op,payload);if(op==='apply-tracks'){local.metadata.updatedAt='自动项目保存时间';local.scenes[0].updatedAt='自动场景保存时间';h.changed?.();}return result;});h.rough=null;await open();fireEvent.click(screen.getByRole('button',{name:'按文字剪视频'}));await waitFor(()=>expect(h.rough).toBeTruthy());const after:any=structuredClone(plan);after.revision=2;after.referenceEditor.nativeDocument.scenes[0].tracks.main.elements=[];await h.rough.onSaved({productionId:'production',revision:2,plan:after,requestId:'normal-adopt'},{requestId:'normal-adopt',expectedRevision:1});await screen.findByText('已采用到当前时间轴，可继续编辑或撤销。');expect(screen.queryByText(/有未保存修改/)).toBeNull();expect(screen.queryByText(/原采纳回执已确认/)).toBeNull();h.client.saveProductionEditor.mockClear();expect((await h.rough.prepareDocument()).revision).toBe(2);expect(h.client.saveProductionEditor).not.toHaveBeenCalled();
});
it.each(['clean','undo','media'])('恢复真实已应用但ACK丢失的原回执，%s只保留真实差异而不重复apply',async kind=>{
 const baseRequest=h.request.getMockImplementation()!,receipts=new Set<string>();h.request.mockImplementation(async(op:string,payload:any,options:any)=>{if(op!=='apply-tracks')return baseRequest(op,payload);if(receipts.has(options.requestId))return{applied:true,sceneId:'scene'};receipts.add(options.requestId);local.scenes[0].tracks=structuredClone(payload.afterTracks);local.metadata.updatedAt='自动项目保存时间';local.scenes[0].updatedAt='自动场景保存时间';h.changed?.();throw Error('应用已完成但ACK未知');});h.rough=null;await open();fireEvent.click(screen.getByRole('button',{name:'按文字剪视频'}));await waitFor(()=>expect(h.rough).toBeTruthy());const after:any=structuredClone(plan);after.revision=2;after.referenceEditor.nativeDocument.scenes[0].tracks.main.elements=[];await expect(h.rough.onSaved({productionId:'production',revision:2,plan:after,requestId:'lost-adopt'},{requestId:'lost-adopt',expectedRevision:1})).rejects.toThrow('ACK未知');if(kind==='undo')local.scenes[0].tracks=structuredClone(tracks);if(kind==='media')local.mediaMetadata[0].unknownEditable='用户后续编辑';fireEvent.click(await screen.findByRole('button',{name:'恢复原剪辑回执'}));if(kind==='clean'){await screen.findByText('已采用到当前时间轴，可继续编辑或撤销。');expect(screen.queryByText(/有未保存修改/)).toBeNull();}else{await screen.findByText(/本地后续修改或撤销已保留/);expect(screen.getByText(/有未保存修改/)).toBeInTheDocument();if(kind==='undo')expect(local.scenes[0].tracks).toEqual(tracks);if(kind==='media')expect(local.mediaMetadata[0].unknownEditable).toBe('用户后续编辑');}const applies=h.request.mock.calls.filter(c=>c[0]==='apply-tracks');expect(applies[1]).toEqual(applies[0]);expect(receipts.size).toBe(1);
});

// T1062_COMPONENT_PORT_SEAM: 仅本文件既有业务spies；真实scope/epoch/signal/lifecycle不替换。
vi.mock("@/lib/creation-workspace-scope", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/creation-workspace-scope")>();
  const {client: componentPorts} = await import("@/lib/contract-client");
  type Workspace = ReturnType<typeof actual.createCreationWorkspace>;
  type Operation = ReturnType<Workspace["capture"]>;
  const views = new WeakMap<Workspace, Workspace>();
  function portClient(base: Operation["client"], capture: () => Operation): Operation["client"] {
    const methods = new Map<PropertyKey, unknown>();
    return new Proxy(base, {
      get(target, key, receiver) {
        const port = Reflect.get(componentPorts, key);
        const original = Reflect.get(target, key, receiver);
        if (typeof port !== "function") return original;
        if (!methods.has(key)) methods.set(key, async (...args: unknown[]) => {
          const operation = capture();
          operation.assertCurrent();
          try { return await Reflect.apply(Reflect.get(componentPorts, key), componentPorts, args); }
          finally { operation.assertCurrent(); }
        });
        return methods.get(key);
      },
    });
  }
  function view(workspace: Workspace): Workspace {
    const cached = views.get(workspace);
    if (cached) return cached;
    const client = portClient(workspace.client, () => workspace.capture());
    const capture = (): Operation => {
      const operation = workspace.capture();
      return Object.freeze({...operation, client: portClient(operation.client, () => operation)});
    };
    const proxy = new Proxy(workspace, {
      get(target, key) {
        if (key === "client") return client;
        if (key === "capture") return capture;
        // Reflect读取原对象getter，signal/epoch始终是原factory当前值；不spread workspace。
        return Reflect.get(target, key, target);
      },
    });
    views.set(workspace, proxy);
    return proxy;
  }
  return {
    ...actual,
    createCreationWorkspace: (...args: Parameters<typeof actual.createCreationWorkspace>) => view(actual.createCreationWorkspace(...args)),
    useCreationWorkspace: (scope: Parameters<typeof actual.useCreationWorkspace>[0]) => view(actual.useCreationWorkspace(scope)),
    useCreationClient: () => view(actual.useCreationWorkspace(actual.useCreationScope())).client,
  };
});
// T1062_COMPONENT_PORT_SEAM_END

// T1062_UNIT_SCOPE_FIXTURE: 显式合成单测选择；不是当前用户/生产default。
import {beforeEach as t1062ScopeBeforeEach, afterEach as t1062ScopeAfterEach} from "vitest";
t1062ScopeBeforeEach(() => {
  window.localStorage.removeItem("creatoros:current-group");
  window.localStorage.setItem("creatoros:current-account", "account");
});
t1062ScopeAfterEach(() => {
  window.localStorage.removeItem("creatoros:current-group");
  window.localStorage.removeItem("creatoros:current-account");
});
// T1062_UNIT_SCOPE_FIXTURE_END

it('文字候选应用为可撤销草稿只调用原生apply-tracks，保存按钮才形成后端版本；未知ACK同请求恢复',async()=>{
 Object.assign(h.client,{readProductionEditorScript:vi.fn(),proposeProductionEditorScript:vi.fn()});
 h.client.getProductionEditor.mockResolvedValue(initial);
 const original=h.request.getMockImplementation()!;h.request.mockImplementation(async(op:string,payload:any)=>op==='context'?{...await original(op,payload),playheadTick:0,ticksPerSecond:120000}:original(op,payload));
 let target:any;const script={formatVersion:1,sceneId:'scene',stateStamp:'sha256:'+'a'.repeat(64),libraryStamp:'sha256:'+'b'.repeat(64),markdown:'原文字',libraryDocs:[],tracks:[{alias:'V1',trackId:'main',type:'video',editableElementIds:['clip'],protectedElementIds:[]}],scopeComplete:true};
 (h.client as any).readProductionEditorScript.mockImplementation(async({body}:any)=>{target=body.target;return{kind:'work.editor.context',schemaVersion:1,target,base:target.savedBase,baseDigest:target.documentDigest,selection:target.selection,scriptMarkdown:script};});
 const after={...structuredClone(native.scenes[0]),tracks:{...structuredClone(tracks),main:{...tracks.main,elements:[]}}};
 (h.client as any).proposeProductionEditorScript.mockImplementation(async()=>({kind:'work.editor.candidate',schemaVersion:1,target,base:target.savedBase,baseDigest:target.documentDigest,candidateDigest:await editorDigest(after),summary:'明确删除原片',candidate:{kind:'native_scene',document:after},changes:[{path:'tracks',objectId:'clip',label:'删除',before:1,after:0}],apply:{operation:'applyProductionEditor',outputId:'output',body:{expectedRevision:1,edits:[{type:'replaceNativeSceneTracks',sceneId:'scene',expectedBeforeDigest:await editorDigest(tracks),tracks:after.tracks}]}},scriptDiagnostics:{warnings:[],errors:[],operations:[{kind:'delete',trackId:'main',elementId:'clip'}]}}));
 render(<DraftChatRequestProvider><VideoReferenceWorkbench initial={initial} title="文字草稿" onOriginal={()=>{}} onSaved={h.saved}/></DraftChatRequestProvider>);await waitFor(()=>expect(screen.getByRole('button',{name:'保存工程'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'读取当前时间轴'}));fireEvent.click(screen.getByText('高级：编辑时间轴文字'));await screen.findByRole('textbox',{name:'时间轴文字'});fireEvent.change(screen.getByRole('textbox',{name:'时间轴文字'}),{target:{value:'删除这段原片'}});fireEvent.click(screen.getByRole('button',{name:'生成剪辑候选'}));await screen.findByRole('button',{name:'应用为可撤销草稿'});h.failApply=true;fireEvent.click(screen.getByRole('button',{name:'应用为可撤销草稿'}));await screen.findByText('未知ACK');expect(h.client.saveProductionEditor).not.toHaveBeenCalled();expect(h.client.applyProductionEditor).not.toHaveBeenCalled();const first=h.request.mock.calls.find(call=>call[0]==='apply-tracks')!;fireEvent.click(screen.getByRole('button',{name:'恢复原草稿操作'}));await screen.findByText('已应用为未保存剪辑稿，可撤销；保存工程后继续修改。');expect(h.request.mock.calls.filter(call=>call[0]==='apply-tracks')[1]).toEqual(first);await screen.findByText('有未保存修改');fireEvent.click(screen.getByRole('button',{name:'保存工程'}));await waitFor(()=>expect(h.client.saveProductionEditor).toHaveBeenCalledOnce());expect(h.client.saveProductionEditor.mock.calls[0][0].body.plan.referenceEditor.nativeDocument.scenes[0].tracks.overlay).toEqual(tracks.overlay);
});

it('原采纳基准已前进且无原回执，确认CAS已不可写并解除未知锁；不重发或覆盖当前稿',async()=>{
 h.client.getProductionEditor.mockResolvedValue({...initial,revision:2});
 render(<DraftChatRequestProvider><DirectorProbe/><VideoReferenceWorkbench initial={initial} title="核对原请求" onOriginal={()=>{}} onSaved={h.saved}/></DraftChatRequestProvider>);await waitFor(()=>expect(screen.getByRole('button',{name:'保存工程'})).toBeEnabled());
 const candidate:any={kind:'work.editor.candidate',target:{outputId:'output',savedBase:{kind:'production',productionId:'production',revision:1}},candidate:{kind:'native_scene',document:native.scenes[0]},apply:{operation:'applyProductionEditor',outputId:'output',body:{expectedRevision:1,edits:[]}}};
 let failure:any;try{await director.adoptEditorCandidate(candidate,'同一原采纳请求-核对');}catch(cause){failure=cause;}
 expect(failure).toMatchObject({notSent:true,originalSettled:true});expect(h.client.getProductionEditorReceipt).toHaveBeenCalledTimes(2);expect(h.client.applyProductionEditor).not.toHaveBeenCalled();expect(h.request.mock.calls.some(call=>call[0]==='apply-tracks')).toBe(false);
});

it('新候选采纳的真实documentChanged通知不能把精确同步结果误标为未同步',async()=>{
 const previous=h.request.getMockImplementation()!;let current:any=initial;
 h.client.getProductionEditor.mockImplementation(async()=>current);
 h.client.applyProductionEditor.mockImplementation(async()=>current);
 h.request.mockImplementation(async(op:string,payload:any)=>{const result=await previous(op,payload);if(op==='context')return{...result,ticksPerSecond:120000,playheadTick:0};if(op==='apply-tracks')h.changed?.();return result;});
 render(<DraftChatRequestProvider><DirectorProbe/><VideoReferenceWorkbench initial={initial} title="原生正常采纳" onOriginal={()=>{}} onSaved={h.saved}/></DraftChatRequestProvider>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'保存工程'})).toBeEnabled());
 const target=await director.prepareEditorTurn(),after=structuredClone(plan);after.referenceEditor.nativeDocument.scenes[0].tracks.main.elements=[];
 const candidate:any={kind:'work.editor.candidate',target,candidate:{kind:'native_scene',document:after.referenceEditor.nativeDocument.scenes[0]},candidateDigest:await editorDigest(after.referenceEditor.nativeDocument.scenes[0]),apply:{operation:'applyProductionEditor',body:{expectedRevision:1,edits:[{type:'replaceNativeSceneTracks',sceneId:'scene',expectedBeforeDigest:await editorDigest(tracks),tracks:after.referenceEditor.nativeDocument.scenes[0].tracks}]}}};
 const version:any={...initial,revision:2,plan:{...after,revision:2},requestId:'normal-native-event'};
 h.client.applyProductionEditor.mockImplementation(async()=>{current=version;return version;});
 h.client.getProductionEditorVersion.mockImplementation(async({params}:any)=>params.revision===1?initial:version);
 let adopted:any;await React.act(async()=>{adopted=await director.adoptEditorCandidate(candidate,'normal-native-event');});
 expect(adopted).toMatchObject({status:'adopted',revision:2});expect(h.client.applyProductionEditor).toHaveBeenCalledOnce();expect(local.scenes[0].tracks).toEqual(candidate.candidate.document.tracks);expect(screen.queryByText('有未保存修改')).toBeNull();
});

it('其它场景或未使用媒体缺失不阻断当前候选预览，保留完整正式引用',async()=>{
 const extraPlan=structuredClone(plan);extraPlan.referenceEditor.mediaRefs.push({mediaId:'unused',assetId:'unreadable',assetFileId:'frozen-missing'});
 extraPlan.referenceEditor.nativeDocument.mediaMetadata.push({mediaId:'unused',name:'缺失素材.mp4',type:'video'});
 vi.mocked(readEditorMedia).mockImplementation(async ref=>{if(ref.mediaId==='unused')throw Error('原素材暂不可读');return new File(['video'],'原片.mp4',{type:'video/mp4'});});
 const saved={...initial,plan:extraPlan};h.client.getProductionEditor.mockResolvedValue(saved);
 const previous=h.request.getMockImplementation()!;
 h.request.mockImplementation(async(op:string,payload:any)=>op==='preview-scene'?{blob:new Blob(['实际预览端口']),fileName:'当前场景.mp4',sceneId:payload.targetSceneId,candidateDigest:payload.candidateDigest,contextEpoch:payload.baseContextEpoch}:previous(op,payload));
 render(<DraftChatRequestProvider><DirectorProbe/><VideoReferenceWorkbench initial={saved} title="其它场景有缺失素材" onOriginal={()=>{}} onSaved={h.saved}/></DraftChatRequestProvider>);await waitFor(()=>expect(screen.getByRole('button',{name:'保存工程'})).toBeEnabled());
 const currentPlan=structuredClone(extraPlan),target:any={schemaVersion:1,projectId:'project',outputId:'output',owner:'production',contentType:'video',savedBase:{kind:'production',productionId:'production',revision:1},documentDigest:await editorDigest(currentPlan),selection:{kind:'native_scene',sceneId:'scene',elementRefs:[],playheadTick:0,contextEpoch:7}};
 const candidate:any={kind:'work.editor.candidate',target,candidate:{kind:'native_scene',document:{...local.scenes[0],tracks}},candidateDigest:'sha256:'+'c'.repeat(64),apply:{operation:'applyProductionEditor',body:{edits:[{sceneId:'scene',expectedBeforeDigest:await editorDigest(tracks)}]}}};
 expect((await director.previewEditorCandidate(candidate))?.fileName).toBe('当前场景.mp4');expect(h.request.mock.calls.find(row=>row[0]==='preview-scene')?.[1].media.map((row:any)=>row.mediaId)).toEqual(['media']);expect(extraPlan.referenceEditor.mediaRefs).toHaveLength(2);expect(h.client.saveProductionEditor).not.toHaveBeenCalled();expect(h.client.applyProductionEditor).not.toHaveBeenCalled();
});

// 宿主仅把真实404/410交给原生缺失引用校验，不能吞权限与取消错误。
it.each([404,410,403,401,500])('当前引用读取%s：仅缺失交原生判断并呈现警告',async(status)=>{
 const saved=structuredClone(initial);h.client.getProductionEditor.mockResolvedValue(saved);
 vi.mocked(readEditorMedia).mockRejectedValue(Object.assign(Error('文件不可读'),{status}));
 const previous=h.request.getMockImplementation()!;
 h.request.mockImplementation(async(op:string,payload:any)=>{if(op==='context'){const current=await previous(op,payload);return {...current,mediaMetadata:[],document:{...current.document,mediaMetadata:[]}};}return op==='preview-scene'?{blob:new Blob(['预览']),fileName:'预览.mp4',sceneId:payload.targetSceneId,candidateDigest:payload.candidateDigest,contextEpoch:payload.baseContextEpoch,warnings:[{code:'preserved_missing_media',trackId:'main',elementId:'clip',mediaId:'media',message:'原素材缺失，引用已保留。'}]}:previous(op,payload);});
 render(<DraftChatRequestProvider><DirectorProbe/><VideoReferenceWorkbench initial={saved} title="原缺失引用" onOriginal={()=>{}} onSaved={h.saved}/></DraftChatRequestProvider>);await waitFor(()=>expect(screen.getByRole('button',{name:'保存工程'})).toBeEnabled());
 const target:any={schemaVersion:1,projectId:'project',outputId:'output',owner:'production',contentType:'video',savedBase:{kind:'production',productionId:'production',revision:1},documentDigest:await editorDigest(saved.plan),selection:{kind:'native_scene',sceneId:'scene',elementRefs:[],playheadTick:0,contextEpoch:7}};
 const candidate:any={kind:'work.editor.candidate',target,candidate:{kind:'native_scene',document:{...local.scenes[0],tracks}},candidateDigest:'sha256:'+'c'.repeat(64),apply:{operation:'applyProductionEditor',body:{edits:[{sceneId:'scene',expectedBeforeDigest:await editorDigest(tracks)}]}}};
 if([404,410].includes(status)){let result:any;await React.act(async()=>{result=await director.previewEditorCandidate(candidate);});expect(result.warnings).toEqual(['原素材缺失，引用已保留。']);expect(h.request.mock.calls.find(row=>row[0]==='preview-scene')?.[1].media).toEqual([]);expect(screen.getByText('原素材缺失，引用已保留。')).toBeVisible();}else{await expect(director.previewEditorCandidate(candidate)).rejects.toThrow('文件不可读');expect(h.request.mock.calls.some(row=>row[0]==='preview-scene')).toBe(false);}
 expect(h.client.applyProductionEditor).not.toHaveBeenCalled();expect(h.client.saveProductionEditor).not.toHaveBeenCalled();
});

it('原片选择入口在高级时间轴操作之前，首屏说明素材到转写再回画面的路径',async()=>{
 await open();
 const source=screen.getByTestId('native-source-entry'),timeline=screen.getByRole('button',{name:'更新剪辑内容'});
 expect(source.compareDocumentPosition(timeline)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(screen.getByText('把视频声音转成文字，再按句定位、删减。先预览修改，采纳后才更新剪辑，原视频保留。')).toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'2. 按文字剪视频'})).toBeInTheDocument();
});

it('视频转文字入口按实际准备状态展示，已有原片不依赖外层AI开关',async()=>{
 render(<VideoReferenceWorkbench initial={initial} title="转写路径" onOriginal={()=>{}} onSaved={h.saved}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'保存工程'})).toBeEnabled());
 expect(screen.getByRole('heading',{name:'1. 视频转文字'})).toBeVisible();expect(screen.getByTestId('transcript-entry')).toBeVisible();
 const action=screen.getByRole('button',{name:'按文字剪视频'});fireEvent.click(action);await waitFor(()=>expect(h.request).toHaveBeenCalledWith('open-addon',{panel:'transcript'}));
});
it('没有视频时给真实添加素材操作，不显示空转写表单',async()=>{
 const empty=structuredClone(initial);empty.plan.referenceEditor.mediaRefs=[];empty.plan.referenceEditor.nativeDocument.mediaMetadata=[];empty.plan.referenceEditor.nativeDocument.scenes[0].tracks.main.elements=[];empty.plan.nativeSources=[];local=empty.plan.referenceEditor.nativeDocument;
 render(<VideoReferenceWorkbench initial={empty} title="空工程" onOriginal={()=>{}} onSaved={h.saved}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'保存工程'})).toBeEnabled());
 expect(screen.queryByTestId('native-source-entry')).toBeNull();expect(screen.queryByTestId('transcript-entry')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'添加要剪辑的视频'}));expect(h.request).toHaveBeenCalledWith('open-addon',{panel:'materials'});
});
