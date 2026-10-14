import {beforeAll,afterAll,it,expect} from 'vitest';
import {createDb,projects,contentOutputs,productions,type Db} from '@creatoros/backend';
import {ENDPOINTS,productionReferencePlan,type RequestContext} from '@creatoros/contract';
import {createProductionService} from './production.service';
import {createProductionTransport} from './production.transport';
import {itemDigest} from './production-editor-plan';
const ctx:RequestContext={userId:'user',accountId:'account-a',source:'user',requestId:'script-public'},date='2026-10-13T10:00:00.000Z';
const tracks={main:{id:'main',name:'原片',type:'video',muted:false,hidden:false,elements:[{id:'clip',name:'原片',type:'video',mediaId:'media',startTime:0,duration:240000,trimStart:0,trimEnd:0,sourceDuration:240000,params:{opacity:1},effects:[]}]},overlay:[{id:'title-track',name:'字幕',type:'text',hidden:false,elements:[{id:'title',name:'字幕',type:'text',startTime:0,duration:240000,trimStart:0,trimEnd:0,params:{content:'原字幕'}}]}],audio:[]};
(tracks.overlay as any[]).push({id:'future-track',name:'旧扩展',type:'graphic',hidden:false,elements:[{id:'future',type:'future-shape',name:'旧形状',startTime:0,duration:120000,trimStart:0,trimEnd:0,params:{private:{x:1}},oldPayload:[1,2]}]});
const plan:any={editorVersion:3,revision:1,referenceEditor:{editor:'opencut-classic',revision:'cf5e79e919144200294fb9fed22a222592a0aeea',nativeDocument:{version:31,currentSceneId:'scene',metadata:{name:'原工程'},settings:{},scenes:[{id:'scene',name:'当前',isMain:true,createdAt:date,updatedAt:date,bookmarks:[],tracks},{id:'other',name:'其他',tracks:structuredClone(tracks)}]},mediaRefs:[{mediaId:'media',assetId:'asset',assetFileId:'file'}]},nativeSources:[{mediaId:'media',source:{sourceId:'source',assetId:'asset',assetFileId:'file',fileDigest:'a'.repeat(64),probeDigest:'b'.repeat(64),timebase:{num:1,den:120000},durationTicks:240000,hasAudio:true}}],sourceTranscripts:[]};
plan.referenceEditor.mediaRefs.push({mediaId:'optional-media',assetId:'optional-unavailable',assetFileId:'optional-file'});
plan.referenceEditor.nativeDocument.scenes[0].tracks.overlay.push({id:'optional-track',type:'video',name:'保留可选图像',muted:false,hidden:false,elements:[{id:'optional-image',type:'image',mediaId:'optional-media',name:'旧图像',startTime:0,duration:240000,trimStart:0,trimEnd:0,params:{}}]});
const target:any={schemaVersion:1,projectId:'project-a',outputId:'output',owner:'production',contentType:'video',savedBase:{kind:'production',productionId:'production',revision:1},documentDigest:itemDigest(plan),selection:{kind:'native_scene',sceneId:'scene',elementRefs:[{trackId:'main',elementId:'clip'}],playheadTick:0,contextEpoch:1,editorGeneration:'generation'}};
let db:Db,close:()=>Promise<void>,seq=0;
const service=()=>createProductionService({db,now:()=>date,nextId:p=>`${p}-${++seq}`,assertEditorAsset:async()=>{},readNativeEditorMedia:async(_ctx,input)=>{if(input.assetId==='optional-unavailable')throw Error('保原可选图像不可读，不能为未编辑引用阻断合法删片');return{kind:'video',durationTick:240000};}});
const call=async(key:string,body:unknown,context=ctx)=>{const endpoint=(ENDPOINTS as any)[key];if(!endpoint)throw Error(`Missing public endpoint ${key}`);const result=await createProductionTransport(service).request(endpoint,{params:{outputId:'output'},query:undefined,body},context);if(!result||typeof result!=='object'||!('data' in result))throw Error('公共响应未返回data');return endpoint.response.parse(result.data);};
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();await db.insert(projects).values({id:'project-a',userId:'user',accountId:'account-a',title:'剪辑公开链',creationMode:'guided',status:'active',currentStage:'production',startedAt:date,createdAt:date,updatedAt:date});await db.insert(contentOutputs).values({id:'output',projectId:'project-a',contentType:'video',title:'视频',status:'drafting',createdAt:date,updatedAt:date});await db.insert(productions).values({id:'production',userId:'user',contentOutputId:'output',productionMode:'studio',status:'editing',recordingConfig:{videoEditingPlan:plan},subtitleConfig:{},updatedAt:date});});
afterAll(async()=>{await close?.();});
it('公共返回合同保留未知旧元素；正常no-op与纯错误回执不冒充待采纳',async()=>{
 const read=await call('readProductionEditorScript',{target}),script=read.scriptMarkdown;
 const input={base:target.savedBase,baseDigest:target.documentDigest,summary:'文字核对',candidate:{kind:'markdown_timeline',owner:'production',sceneId:'scene',markdown:script.markdown,declaredTrackIds:script.tracks.map((t:any)=>t.trackId),stateStamp:script.stateStamp,libraryStamp:script.libraryStamp}};
 const noop=await call('proposeProductionEditorScript',{target,input});expect(noop.apply).toBeNull();expect(noop.error).toBeNull();expect(noop.candidate.document.tracks.overlay).toEqual(tracks.overlay);
 const bad=await call('proposeProductionEditorScript',{target,input:{...input,candidate:{...input.candidate,stateStamp:'sha256:'+'f'.repeat(64)}}});expect(bad.apply).toBeNull();expect(bad.failureCode).toBe('script_input');expect(bad.error).toContain('第');expect(bad.scriptDiagnostics.errors.length).toBeGreaterThan(0);expect((await service().listEditorVersions(ctx,'output',{})).total).toBe(0);
});
it('公共read→propose→旧apply→精确回读：候选不写库，采纳一次，字幕和其它scene完整保留',async()=>{
 const read=await call('readProductionEditorScript',{target});expect(read.scriptMarkdown.scopeComplete).toBe(true);expect((await service().listEditorVersions(ctx,'output',{})).total).toBe(0);
 const script=read.scriptMarkdown,markdown=script.markdown.split('\n').filter((line:string)=>!line.startsWith('[c1]')).join('\n');
 const candidate=await call('proposeProductionEditorScript',{target,input:{base:target.savedBase,baseDigest:target.documentDigest,summary:'明确删除原片',candidate:{kind:'markdown_timeline',owner:'production',sceneId:'scene',markdown,declaredTrackIds:script.tracks.map((t:any)=>t.trackId),stateStamp:script.stateStamp,libraryStamp:script.libraryStamp}}});
 expect(candidate.candidate.document.tracks.main.elements).toEqual([]);expect(candidate.candidate.document.tracks.overlay).toEqual(tracks.overlay);expect((await service().getEditor(ctx,'output')).revision).toBe(1);
 const body={...candidate.apply.body,requestId:'script-adopt-request-01'};const saved=await service().applyEditor(ctx,'output',body);expect(saved.revision).toBe(2);expect(await service().applyEditor(ctx,'output',body)).toEqual(saved);
 const exact=await service().getEditorVersion(ctx,'output',saved.revision);expect((productionReferencePlan.parse(exact.plan).referenceEditor.nativeDocument.scenes as unknown[])[1]).toEqual(plan.referenceEditor.nativeDocument.scenes[1]);// 首次采纳还保留原fixture工程为legacy历史，不重复执行本次请求。
 const history=await service().listEditorVersions(ctx,'output',{});expect(history.total).toBe(2);expect(history.items.filter(v=>v.requestId===body.requestId)).toHaveLength(1);expect((await service().getEditorVersion(ctx,'output',1)).plan).toEqual(plan);
});
it('旧target漂移、跨账号、target/params不符均拒绝且不产生版本',async()=>{
 const count=(await service().listEditorVersions(ctx,'output',{})).total;
 await expect(call('readProductionEditorScript',{target})).rejects.toThrow(/版本/);
 await expect(call('readProductionEditorScript',{target},{...ctx,accountId:'account-b'})).rejects.toThrow();
 await expect(call('readProductionEditorScript',{target:{...target,outputId:'other'}})).rejects.toThrow(/目标/);
 expect((await service().listEditorVersions(ctx,'output',{})).total).toBe(count);
});
