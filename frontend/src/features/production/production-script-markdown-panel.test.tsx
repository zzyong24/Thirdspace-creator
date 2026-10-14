import * as React from 'react';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {editorDigest,EditorCandidateConflictError} from '@/features/draft-workbench/draft-chat-request';
const h=vi.hoisted(()=>({read:vi.fn(),propose:vi.fn(),receipt:vi.fn(),current:vi.fn(),preview:vi.fn(),adopt:vi.fn(),recover:vi.fn(),aborted:false}));
vi.mock('@/lib/creation-workspace-scope',()=>({creationScopeKey:()=> 'group:g',useCreationWorkspace:()=>({signal:{get aborted(){return h.aborted;}},capture:()=>({assertCurrent:()=>{if(h.aborted)throw Error('已切组');}}),client:{readProductionEditorScript:h.read,proposeProductionEditorScript:h.propose,getProductionEditorReceipt:h.receipt,getProductionEditor:h.current}})}));
vi.mock('@/features/draft-workbench/draft-chat-request',async importOriginal=>({...await importOriginal<any>(),useDraftChatRequest:()=>({previewEditorCandidate:h.preview,adoptEditorCandidate:h.adopt})}));
vi.mock('@/features/reference-editors/reference-editor-media',()=>({downloadEditorExport:vi.fn()}));
import {ProductionScriptMarkdownPanel} from './production-script-markdown-panel';
const sha='sha256:'+'a'.repeat(64),target:any={schemaVersion:1,projectId:'p',outputId:'o',owner:'production',contentType:'video',documentDigest:sha,savedBase:{kind:'production',productionId:'prod',revision:1},selection:{kind:'native_scene',sceneId:'s',elementRefs:[],playheadTick:0,contextEpoch:2,editorGeneration:'g'}};
const tracks={main:{id:'t',type:'video',name:'主轨',elements:[],muted:false,hidden:false},overlay:[],audio:[]},scene={id:'s',name:'场景',isMain:true,bookmarks:[],createdAt:'date',updatedAt:'date',tracks};
const base:any={kind:'work.editor.context',schemaVersion:1,target,base:target.savedBase,baseDigest:sha,selection:target.selection,readScope:{},selected:[],documentSummary:{},document:null,projectEnvelope:{},media:[],sourceTranscripts:[],capabilities:{},fieldWindow:null,complete:true,failureCode:null,error:null,scriptMarkdown:{formatVersion:1,sceneId:'s',stateStamp:sha,libraryStamp:sha,markdown:'原时间轴文字',libraryDocs:[],tracks:[{alias:'V1',trackId:'t',type:'video',editableElementIds:[],protectedElementIds:[]}],scopeComplete:true}};
let candidate:any;
function mount(){return render(<ProductionScriptMarkdownPanel scope={{groupId:'g',accountId:null}} outputId="o" prepareTarget={async()=>target} onRecoverReceipt={h.recover}/>);}
async function proposed(){const view=mount();fireEvent.click(screen.getByText('高级：编辑时间轴文字'));fireEvent.click(screen.getByRole('button',{name:'读取当前时间轴'}));await screen.findByRole('textbox',{name:'时间轴文字'});fireEvent.change(screen.getByRole('textbox'),{target:{value:'保留这份修改'}});fireEvent.click(screen.getByRole('button',{name:'生成剪辑候选'}));await screen.findByText('剪辑候选待预览');return view;}
beforeEach(async()=>{vi.clearAllMocks();vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{});sessionStorage.clear();h.aborted=false;URL.createObjectURL=vi.fn(()=> 'blob:preview');URL.revokeObjectURL=vi.fn();candidate={kind:'work.editor.candidate',schemaVersion:1,target,base:target.savedBase,baseDigest:sha,candidateDigest:await editorDigest(scene),summary:'删除原句',candidate:{kind:'native_scene',document:scene},changes:[{path:'x',objectId:'x',label:'删除',before:1,after:0}],apply:{operation:'applyProductionEditor',outputId:'o',body:{expectedRevision:1,edits:[{type:'replaceNativeSceneTracks',sceneId:'s',expectedBeforeDigest:sha,tracks}]}},imageRequest:null,failureCode:null,error:null,scriptDiagnostics:{warnings:['局部恢复'],errors:[{line:9,message:'原段保留'}],operations:[]}};h.read.mockResolvedValue(base);h.propose.mockResolvedValue(candidate);h.preview.mockResolvedValue({blob:new Blob(['实际预览端口']),fileName:'预览.mp4'});h.adopt.mockRejectedValue(Error('原结果未知'));h.recover.mockResolvedValue(undefined);});
afterEach(cleanup);
async function pendingRecovery(){
 await proposed();fireEvent.click(screen.getByRole('button',{name:'预览这次修改'}));await screen.findByLabelText('文字剪辑候选预览');fireEvent.click(screen.getByRole('button',{name:'采纳并保存新版本'}));await screen.findByText('原结果未知');
 return h.adopt.mock.calls[0][1];
}
it('T1285 同工程版本前进且二次原回执仍空，只读解除等待，丢弃后原文字可继续编辑',async()=>{
 h.receipt.mockResolvedValue(null);h.current.mockResolvedValue({productionId:'prod',revision:2});const id=await pendingRecovery();
 fireEvent.click(screen.getByRole('button',{name:'核对原采纳结果'}));await waitFor(()=>expect(screen.getByRole('button',{name:'丢弃候选'})).toBeEnabled());
 expect(h.receipt).toHaveBeenCalledTimes(2);expect(h.current).toHaveBeenCalledOnce();expect(h.receipt.mock.invocationCallOrder[0]).toBeLessThan(h.current.mock.invocationCallOrder[0]);expect(h.current.mock.invocationCallOrder[0]).toBeLessThan(h.receipt.mock.invocationCallOrder[1]);
 expect(h.receipt.mock.calls.every(call=>call[0].params.requestId===id)).toBe(true);expect(h.adopt).toHaveBeenCalledOnce();expect(h.recover).not.toHaveBeenCalled();expect(screen.getByRole('textbox')).toHaveValue('保留这份修改');
 expect(JSON.parse(sessionStorage.getItem('creatoros:video-script:group:g:o')!)).toMatchObject({base,draft:'保留这份修改'});expect(screen.getByRole('button',{name:'备份文字稿并还原'})).toBeEnabled();
 fireEvent.click(screen.getByRole('button',{name:'丢弃候选'}));expect(screen.getByRole('textbox')).toBeEnabled();fireEvent.change(screen.getByRole('textbox'),{target:{value:'继续保留并修改'}});expect(screen.getByRole('textbox')).toHaveValue('继续保留并修改');
});
it.each([{productionId:'prod',revision:1},{productionId:'other',revision:2}])('T1285 未证同工程版本前进时继续保原等待：%j',async current=>{
 h.receipt.mockResolvedValue(null);h.current.mockResolvedValue(current);await pendingRecovery();fireEvent.click(screen.getByRole('button',{name:'核对原采纳结果'}));await screen.findByText('原请求尚未查到回执，候选和原请求ID继续保留。');expect(screen.getByRole('button',{name:'丢弃候选'})).toBeDisabled();expect(h.adopt).toHaveBeenCalledOnce();
});
it('T1285 二次读取出现真实原回执则校验并恢复，不把已保存请求当未保存',async()=>{
 h.current.mockResolvedValue({productionId:'prod',revision:2});const id=await pendingRecovery();h.receipt.mockResolvedValueOnce(null).mockResolvedValue({productionId:'prod',revision:2,requestId:id,plan:{editorVersion:3,referenceEditor:{editor:'opencut-classic',revision:'c'.repeat(40),mediaRefs:[],nativeDocument:{version:31,currentSceneId:'s',scenes:[scene]}}}});
 fireEvent.click(screen.getByRole('button',{name:'核对原采纳结果'}));await screen.findByText('已采纳到当前时间轴。可重新读取继续修改。');expect(h.recover).toHaveBeenCalledOnce();expect(h.adopt).toHaveBeenCalledOnce();
});
it.each(['读取失败','切组晚响应','缓存失败'])('T1285 %s不解除原等待',async failure=>{
 h.receipt.mockResolvedValue(null);h.current.mockImplementation(async()=>{if(failure==='读取失败')throw Error('公开读取失败');if(failure==='切组晚响应')h.aborted=true;return {productionId:'prod',revision:2};});await pendingRecovery();
 const spy=failure==='缓存失败'?vi.spyOn(Object.getPrototypeOf(sessionStorage),'setItem').mockImplementation(()=>{throw Error('缓存不可写');}):null;
 try{fireEvent.click(screen.getByRole('button',{name:'核对原采纳结果'}));await waitFor(()=>expect(h.current).toHaveBeenCalledOnce());await waitFor(()=>expect(screen.getByRole('button',{name:'核对原采纳结果'})).toBeEnabled());if(spy)expect(spy).toHaveBeenCalledOnce();expect(screen.getByRole('button',{name:'丢弃候选'})).toBeDisabled();expect(h.adopt).toHaveBeenCalledOnce();expect(screen.getByRole('textbox')).toHaveValue('保留这份修改');}finally{spy?.mockRestore();}
});
it('T1285 二次回执在卸载后返回时不解除持久等待或回调恢复',async()=>{
 h.current.mockResolvedValue({productionId:'prod',revision:2});let resolve:(value:null)=>void=()=>{};
 h.receipt.mockResolvedValueOnce(null).mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 await pendingRecovery();const original=sessionStorage.getItem('creatoros:video-script:group:g:o');
 fireEvent.click(screen.getByRole('button',{name:'核对原采纳结果'}));await waitFor(()=>expect(h.receipt).toHaveBeenCalledTimes(2));cleanup();resolve(null);
 await new Promise(r=>setTimeout(r,0));expect(sessionStorage.getItem('creatoros:video-script:group:g:o')).toBe(original);expect(h.recover).not.toHaveBeenCalled();expect(h.adopt).toHaveBeenCalledOnce();
});
it('dirty读取不覆盖文字，候选错误可见；先预览才允许采纳，生成候选不执行采纳',async()=>{
 await proposed();expect(screen.getByText('第 9 行：原段保留')).toBeVisible();expect(h.adopt).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'采纳并保存新版本'})).toBeDisabled();expect(h.propose.mock.calls[0][0].body.input.candidate.markdown).toBe('保留这份修改');
});
it('未知采纳刷新保留原ID与文字；按receipt核对完整scene digest且不新增apply',async()=>{
 const view=await proposed();fireEvent.click(screen.getByRole('button',{name:'预览这次修改'}));await screen.findByLabelText('文字剪辑候选预览');fireEvent.click(screen.getByRole('button',{name:'采纳并保存新版本'}));await screen.findByText('原结果未知');const id=h.adopt.mock.calls[0][1];expect(screen.getByRole('button',{name:'丢弃候选'})).toBeDisabled();view.unmount();
 mount();fireEvent.click(screen.getByText('高级：编辑时间轴文字'));expect(screen.getByRole('textbox')).toHaveValue('保留这份修改');expect(screen.getByRole('button',{name:'备份文字稿并还原'})).toBeDisabled();
 h.receipt.mockResolvedValue({productionId:'prod',revision:2,requestId:id,plan:{editorVersion:3,referenceEditor:{editor:'opencut-classic',revision:'c'.repeat(40),mediaRefs:[],nativeDocument:{version:31,currentSceneId:'s',scenes:[scene]}}}});
 fireEvent.click(screen.getByRole('button',{name:'核对原采纳结果'}));await screen.findByText('已采纳到当前时间轴。可重新读取继续修改。');expect(h.receipt.mock.calls[0][0].params.requestId).toBe(id);expect(h.adopt).toHaveBeenCalledOnce();expect(h.recover.mock.calls[0][1]).toMatchObject({requestId:id,expectedRevision:1});expect(sessionStorage.length).toBe(0);
});
it('可信零发送冲突解除pending，允许丢弃且保留输入；未知结果仍锁原ID',async()=>{
 h.adopt.mockRejectedValue(new EditorCandidateConflictError('有新修改，本次未发送'));await proposed();fireEvent.click(screen.getByRole('button',{name:'预览这次修改'}));await screen.findByLabelText('文字剪辑候选预览');fireEvent.click(screen.getByRole('button',{name:'采纳并保存新版本'}));await screen.findByText('有新修改，本次未发送');expect(screen.getByRole('button',{name:'丢弃候选'})).toBeEnabled();expect(screen.getByRole('textbox')).toHaveValue('保留这份修改');
});
it('切组的迟到读取不回写旧文字稿',async()=>{
 let resolve:(v:any)=>void=()=>{};h.read.mockImplementation(()=>new Promise(r=>{resolve=r;}));mount();fireEvent.click(screen.getByText('高级：编辑时间轴文字'));fireEvent.click(screen.getByRole('button',{name:'读取当前时间轴'}));await waitFor(()=>expect(h.read).toHaveBeenCalledOnce());h.aborted=true;resolve(base);await waitFor(()=>expect(screen.getByRole('button',{name:'读取当前时间轴'})).toBeEnabled());expect(screen.queryByRole('textbox')).toBeNull();expect(sessionStorage.length).toBe(0);
});

it('真实候选投影到中心画面；返回当前画面保留候选与采纳能力并释放Blob',async()=>{
 h.preview.mockResolvedValue({blob:new Blob(['实际预览端口']),fileName:'预览.mp4',warnings:['原有素材暂不可用，工程仍保留引用。']});
 const previewMount=document.createElement('div');document.body.append(previewMount);
 const pauseOriginal=vi.fn(async()=>{});
 const view=render(<React.StrictMode><ProductionScriptMarkdownPanel scope={{groupId:'g',accountId:null}} outputId="o" prepareTarget={async()=>target} previewTarget={previewMount} onPreviewPlay={pauseOriginal}/></React.StrictMode>);
 fireEvent.click(screen.getByRole('button',{name:'读取当前时间轴'}));await screen.findByText('高级：编辑时间轴文字');await waitFor(()=>expect(h.read).toHaveBeenCalledOnce());
 fireEvent.click(screen.getByText('高级：编辑时间轴文字'));await screen.findByRole('textbox');fireEvent.change(screen.getByRole('textbox'),{target:{value:'保留这份修改'}});fireEvent.click(screen.getByRole('button',{name:'生成剪辑候选'}));await screen.findByText('剪辑候选待预览');fireEvent.click(screen.getByRole('button',{name:'预览这次修改'}));await screen.findByLabelText('文字剪辑候选预览');
 expect(screen.getByText('剪辑候选已预览，待采纳')).toBeVisible();expect(screen.getByText('原有素材暂不可用，工程仍保留引用。')).toBeVisible();expect(previewMount.querySelector('video')).toHaveAttribute('src','blob:preview');expect(view.container.querySelector('video')).toBeNull();expect(previewMount).toHaveAttribute('data-creatoros-preview-active','true');expect(pauseOriginal).toHaveBeenCalledOnce();fireEvent.play(previewMount.querySelector('video')!);await waitFor(()=>expect(pauseOriginal).toHaveBeenCalledTimes(2));fireEvent.click(screen.getByRole('button',{name:'返回当前画面'}));expect(previewMount.querySelector('video')).toBeNull();expect(previewMount).not.toHaveAttribute('data-creatoros-preview-active');await waitFor(()=>expect(screen.getByRole('button',{name:'预览这次修改'})).toHaveFocus());expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');expect(screen.getByRole('button',{name:'采纳并保存新版本'})).toBeEnabled();view.unmount();previewMount.remove();
});
