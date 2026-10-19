import * as React from 'react';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,within,fireEvent,waitFor,cleanup,act} from '@testing-library/react';
import {articleDocument,graphicPostDocument,workEditorCandidate,workCreationProposalResult} from '@creatoros/contract';
import {DraftChatRequestProvider,useDraftChatRequest,editorCanonical} from '@/features/draft-workbench/draft-chat-request';
import {ArticleWorkbench} from '@/features/article/article-workbench';
import {GraphicPostWorkbench} from '@/features/projects/graphic-post-workbench';
import {ChatWorkCreationCard} from './chat-work-creation-card';
import {ChatWorkEditorCard} from './chat-work-editor-card';
import userEvent from '@testing-library/user-event';
import {StageChatWrapper} from '@/app/(creator)/projects/[projectId]/stage-chat-wrapper';
// 真实 Provider/scope/owner/card/review/NoteRelay；只替代 dispatch 与 native surface 外部执行边界。
const h=vi.hoisted(()=>({rpc:vi.fn(),native:vi.fn(),refresh:vi.fn(),path:'/projects/p/article',renderRail:null as null|(()=>React.ReactNode)}));
vi.mock('@/lib/http-transport',async original=>({...await original<any>(),fetchCreatorApi:(...args:any[])=>h.rpc(...args)}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:h.refresh,push:vi.fn(),replace:vi.fn()}),usePathname:()=>h.path,useSearchParams:()=>new URLSearchParams()}));
// 仅替换 rail 装配插槽，真实卡仍在 wrapper 的 React 子树；不替换 Portal/键盘事件路径。
vi.mock('@/features/draft-workbench/draft-chat-rail',()=>({DraftChatRail:()=>h.renderRail?.()??null}));
vi.mock('@/features/reference-editors/native-editor-surface',()=>({NativeEditorSurface:React.forwardRef(function Surface(props:any,ref:any){
 React.useImperativeHandle(ref,()=>({request:(op:string,input:any)=>h.native(op,input,props.owner)}),[props.owner]);
 React.useEffect(()=>{props.onReady();},[]);
 return <div data-testid="native-surface" data-output={props.owner.outputId}/>;
})}));
const script={kind:'project_script' as const,id:'script-real',versionId:'script-version'};
const location={conversationId:'conversation-real',sourceMessageId:'source-message',toolCallId:'tool-real'};
const source={taskId:'source-task',callId:'source-call',toolCallId:'tool-real',candidateDigest:'sha256:'+'d'.repeat(64)};
const article=articleDocument.parse({schemaVersion:1,title:'候选文章',summary:'',sections:[{sectionId:'s-real',order:0,heading:'要点',headingLevel:2,body:'同源文章正文',sourceRefs:[script]}],factItems:[],visualBriefs:[],imageUses:[]});
const graphic=graphicPostDocument.parse({schemaVersion:1,title:'候选图文',body:'同源图文正文',summary:'',tags:[],sourceRefs:[script],imageUses:[],ruleSnapshotRef:null,cardBriefs:[{cardId:'card-real',title:'图卡',body:'图卡正文',sourceRefs:[script]}]});
const joint=workCreationProposalResult.parse({kind:'work.creation.propose',schemaVersion:1,target:{schemaVersion:1,clientRequestId:'request-real',projectId:'p',compositionId:'composition-real',compositionRevision:3,scriptSourceRef:script,scriptConfirmation:{confirmedBy:'user',source:'current-click'},articleMember:{kind:'article',outputId:'article-real',artifactId:'article-artifact',baseVersionId:'article-base'},graphicMember:{kind:'image',outputId:'image-real',artifactId:'graphic-artifact',baseVersionId:'graphic-base'}},targetDigest:'a'.repeat(64),article,graphic,articleDigest:'b'.repeat(64),graphicDigest:'c'.repeat(64),scriptSourceRef:script,error:null});
type Owner='article'|'image';
let fixture:ReturnType<typeof makeFixture>;
let chat:ReturnType<typeof useDraftChatRequest>;
function Witness(){chat=useDraftChatRequest();return <output data-testid="dirty-state">{String(chat.readEditorState()?.dirty)}</output>;}
function makeFixture(empty:boolean){
 const emptyArticle=articleDocument.parse({...article,title:'',sections:[]});
 const emptyGraphic=graphicPostDocument.parse({...graphic,title:'',body:'',sourceRefs:[],cardBriefs:[]});
 const bases={article:empty?emptyArticle:{...article,title:'原文章',sections:[{...article.sections[0],body:'原文章正文'}]},image:empty?emptyGraphic:{...graphic,title:'原图文',body:'原图文正文'}};
 const context={state:'ready',scriptRef:script,scriptText:'逐字脚本原稿',metadata:{title:'原稿标题',summary:'',tags:[]},message:''};
 const resource=(kind:Owner,doc:any,versionId:string)=>({projectId:'p',outputId:kind==='article'?'article-real':'image-real',artifactId:kind==='article'?'article-artifact':'graphic-artifact',currentVersionId:versionId,current:doc,versions:[],scriptContext:context,...(kind==='image'?{targetPlatform:null}:{})});
 const current={article:resource('article',bases.article,'article-base'),image:resource('image',bases.image,'graphic-base')};
 const versions=new Map<string,any>([['article-base',bases.article],['graphic-base',bases.image]]);
 const writes:any[]=[];const reads:any[]=[];let candidate:any=joint;let loseResponse=false;
 return {bases,current,versions,writes,reads,resource,setCandidate:(value:any)=>{candidate=value;},loseNext:()=>{loseResponse=true;},async dispatch(_url:any,options:any,scope:any){
  expect(scope).toEqual({groupId:'t1303-owned',accountId:null});
  const {id,input}=JSON.parse(options.body);reads.push({id,input});
  let data:any;
  const kind:Owner=id.startsWith('articles.')?'article':'image';
  if(id==='articles.get'||id==='graphicPosts.get')data=current[kind];
  else if(id==='articles.versions.get'||id==='graphicPosts.versions.get'){const document=versions.get(input.params.versionId);if(!document)throw Error('fixture: exact version missing '+input.params.versionId);data={versionId:input.params.versionId,document};}
  else if(id==='ai.workCandidates.source')data={assistantSource:source,toolName:candidate.kind==='work.creation.propose'?'work.creation.propose':'work.editor.propose',candidate};
  else if(id==='articles.versions.create'||id==='graphicPosts.versions.create'){
   writes.push({id,input});expect(input.body.adoptionMode).toBe('assistant');expect(input.body.assistantSource).toEqual(source);expect(input.body).not.toHaveProperty('document');
   const proposed=kind==='article'?candidate.kind==='work.creation.propose'?candidate.article:candidate.candidate.document:candidate.graphic;
   // RPC边界提供合法原保存回执；backend来源/CAS由原真实集成门独立验证。
   const document={...proposed};for(const field of ['title','summary','tags'])if(!input.body.fieldSelection.includes(field)){if(Object.hasOwn(bases[kind],field))document[field]=(bases[kind] as any)[field];else delete document[field];}
   if(kind==='article')document.factItems=input.body.factSelection.mode==='keep'?bases.article.factItems:proposed.factItems.map((fact:any)=>{const old=bases.article.factItems.find((old:any)=>old.id===fact.id&&old.text===fact.text&&editorCanonical(old.sourceRefs)===editorCanonical(fact.sourceRefs));return {...fact,reviewState:old?.reviewState??'needs_confirmation'};});
   const versionId=kind==='article'?'article-saved':'graphic-saved';versions.set(versionId,document);current[kind]={...resource(kind,document,versionId),scriptContext:current[kind].scriptContext};data={versionId,document};
   if(loseResponse){loseResponse=false;throw Error('原成功响应丢失');}
  }
  else if(id==='creativeCapabilities.list')data={items:[]};
  else if(id==='creativeResults.list'||id==='creativeResults.bundles.list')data={items:[],nextCursor:null};
  else throw Error('fixture: unhandled endpoint '+id);
  return new Response(JSON.stringify({data,meta:{requestId:'t1303-controlled'}}),{status:200,headers:{'content-type':'application/json'}});
 }};
}
function tree(owner:Owner,editorCandidate?:any,creation:any=joint){return <DraftChatRequestProvider><Witness/>{owner==='article'?<ArticleWorkbench projectId="p" projectTitle="项目" accountId={null} initialOutputs={[{id:'article-real',title:'文章'}]} initialOutputId="article-real"/>:<GraphicPostWorkbench projectId="p" projectTitle="项目" accountId={null} initial={fixture.current.image as any}/>} {editorCandidate?<ChatWorkEditorCard result={editorCandidate} toolCallId="tool-real" location={location}/>:<ChatWorkCreationCard result={creation} toolCallId="tool-real" location={location}/>}</DraftChatRequestProvider>;}
function row(owner:Owner){return screen.getByRole('heading',{name:owner==='article'?'文章候选':'图文候选',hidden:true}).closest('article')!;}
async function preview(owner:Owner){fireEvent.click(within(row(owner)).getByRole('button',{name:'预览候选'}));await screen.findByRole('dialog');await waitFor(()=>expect(within(screen.getByRole('dialog')).getByRole('button',{name:owner==='article'?'复制公众号文章':'导出分页 ZIP'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'关闭'}));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());await waitFor(()=>expect(within(row(owner)).getByRole('button',{name:owner==='article'?/采纳文章|恢复原采纳请求/:/采纳图文|恢复原采纳请求/})).not.toBeDisabled());}

async function openSelection(){const summary=await screen.findByText('本次采纳选择',{selector:'summary'});if(!summary.closest('details')!.open)fireEvent.click(summary);return screen.findByRole('region',{name:'本次采纳选择'});}

beforeEach(()=>{h.path='/projects/p/article';h.renderRail=null;sessionStorage.clear();localStorage.clear();localStorage.setItem('creatoros:current-group','t1303-owned');h.native.mockImplementation(async(op:string)=>op==='load'?{themes:[],images:[],selectedImage:'',pageIndex:0,pageCount:1}:{});h.rpc.mockImplementation((...args:any[])=>fixture.dispatch(...args as [any,any,any]));});
afterEach(context=>{if(process.env.T1303_DOM_DIR){const dir=resolve(process.env.T1303_DOM_DIR);mkdirSync(dir,{recursive:true});writeFileSync(resolve(dir,context.task.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g,'_')+'.html'),document.body.innerHTML);}cleanup();vi.clearAllMocks();});
for(const owner of ['article','image'] as const){
 it(`RED-derived-${owner}: 完整owner自动承接→候选preview→原请求采纳`,async()=>{
  fixture=makeFixture(true);render(tree(owner));await waitFor(()=>expect(chat.readEditorState()?.dirty).toBe(true));await preview(owner);fireEvent.click(within(row(owner)).getByRole('button',{name:owner==='article'?'采纳文章':'采纳图文'}));
  await waitFor(()=>expect(fixture.writes).toHaveLength(1));await waitFor(()=>expect(chat.readEditorState()?.dirty).toBe(false));expect(within(row(owner)).getByRole('status')).toHaveTextContent('已保存');expect(fixture.writes[0].input.body.expectedCurrentVersionId).toBe(owner==='article'?'article-base':'graphic-base');
 });
 it(`RED-confirmed-${owner}: 独立非空cleanowner成功→整树重挂→只读确认`,async()=>{
  fixture=makeFixture(false);let view=render(tree(owner));await waitFor(()=>expect(chat.readEditorState()?.dirty).toBe(false));await preview(owner);fireEvent.click(within(row(owner)).getByRole('button',{name:owner==='article'?'采纳文章':'采纳图文'}));await within(row(owner)).findByRole('status');expect(fixture.writes).toHaveLength(1);view.unmount();
  view=render(tree(owner));await waitFor(()=>expect(within(row(owner)).getByRole('status')).toHaveTextContent('这份内容已保存'));expect(within(row(owner)).queryByText(/原采用请求待核对/)).toBeNull();expect(fixture.writes).toHaveLength(1);
 });
}
it('RED-lazy: 真实editor卡成功响应丢失→新整树未预览也可发现恢复',async()=>{
 fixture=makeFixture(false);const base={kind:'artifact',artifactId:'article-artifact',versionId:'article-base'};const candidate=workEditorCandidate.parse({kind:'work.editor.candidate',schemaVersion:1,target:{schemaVersion:1,projectId:'p',outputId:'article-real',owner:'wechat_article',contentType:'article',savedBase:base,documentDigest:'sha256:'+'a'.repeat(64),selection:{kind:'article',sectionIds:[]}},base,baseDigest:'sha256:'+'a'.repeat(64),candidateDigest:'sha256:'+'b'.repeat(64),summary:'真实编辑候选',candidate:{kind:'article',document:article},changes:[],apply:{operation:'createArticleVersion',outputId:'article-real',body:{expectedCurrentVersionId:'article-base',document:article}},imageRequest:null,failureCode:null,error:null});fixture.setCandidate(candidate);fixture.loseNext();let view=render(tree('article',candidate));await waitFor(()=>expect(chat.readEditorState()?.dirty).toBe(false));fireEvent.click(screen.getByRole('button',{name:'预览改动'}));await screen.findByRole('dialog');await waitFor(()=>expect(within(screen.getByRole('dialog')).getByRole('button',{name:'复制公众号文章'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'关闭'}));await waitFor(()=>expect(screen.getByRole('button',{name:'采纳到当前作品'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'采纳到当前作品'}));await screen.findByText('原成功响应丢失');view.unmount();const before=fixture.reads.filter(x=>x.id==='ai.workCandidates.source').length;
 view=render(tree('article',candidate));await screen.findByText('原采用请求待核对，请继续恢复原请求。');expect(screen.getByRole('button',{name:'恢复 / 采纳原请求'})).toBeVisible();expect(fixture.reads.filter(x=>x.id==='ai.workCandidates.source')).toHaveLength(before);expect(fixture.writes).toHaveLength(1);
});

function editorFixture(){const base={kind:'artifact',artifactId:'article-artifact',versionId:'article-base'};const candidate=workEditorCandidate.parse({kind:'work.editor.candidate',schemaVersion:1,target:{schemaVersion:1,projectId:'p',outputId:'article-real',owner:'wechat_article',contentType:'article',savedBase:base,documentDigest:'sha256:'+'a'.repeat(64),selection:{kind:'article',sectionIds:[]}},base,baseDigest:'sha256:'+'a'.repeat(64),candidateDigest:'sha256:'+'b'.repeat(64),summary:'真实编辑候选',candidate:{kind:'article',document:article},changes:[],apply:{operation:'createArticleVersion',outputId:'article-real',body:{expectedCurrentVersionId:'article-base',document:article}},imageRequest:null,failureCode:null,error:null});return candidate;}

function KeyboardRail({children}:{children:React.ReactNode}){
 const [input,setInput]=React.useState('');
 return <><input aria-label="未发送的编导输入" value={input} onChange={event=>setInput(event.target.value)}/>{children}</>;
}
function keyboardTree(owner:Owner,editorCandidate?:ReturnType<typeof editorFixture>){
 h.path=owner==='article'?'/projects/p/article':'/projects/p/outputs/image-real/image';
 h.renderRail=()=> <KeyboardRail>{editorCandidate?<ChatWorkEditorCard result={editorCandidate} toolCallId="tool-real" location={location}/>:<ChatWorkCreationCard result={joint} toolCallId="tool-real" location={location}/>}</KeyboardRail>;
 return <DraftChatRequestProvider><Witness/><StageChatWrapper projectId="p" projectTitle="项目">{owner==='article'?<ArticleWorkbench projectId="p" projectTitle="项目" accountId={null} initialOutputs={[{id:'article-real',title:'文章'}]} initialOutputId="article-real"/>:<GraphicPostWorkbench projectId="p" projectTitle="项目" accountId={null} initial={fixture.current.image as any}/>}</StageChatWrapper></DraftChatRequestProvider>;
}
function keyboardEvidence(name:string,value:unknown){
 if(!process.env.T1303_DOM_DIR)return;
 const dir=resolve(process.env.T1303_DOM_DIR);mkdirSync(dir,{recursive:true});
 writeFileSync(resolve(dir,name+'.json'),JSON.stringify(value,null,2)+'\n');
 writeFileSync(resolve(dir,name+'.html'),document.body.innerHTML);
}
for(const family of ['creation-article','creation-graphic','editor-article'] as const){
 it(`T1304 RED portal ${family}: 内层Escape保外栏焦点选择与未发送输入`,async()=>{
  fixture=makeFixture(false);const owner=family==='creation-graphic'?'image':'article';
  const candidate=family==='editor-article'?editorFixture():undefined;if(candidate)fixture.setCandidate(candidate);
  vi.spyOn(window,'matchMedia').mockImplementation(query=>({matches:true,media:query,addEventListener:vi.fn(),removeEventListener:vi.fn()}) as any);
  const before=editorCanonical(fixture.current),user=userEvent.setup();render(keyboardTree(owner,candidate));
  await user.click(await screen.findByRole('button',{name:'打开编导'},{timeout:120000}));
  const outer=screen.getByRole('dialog',{name:'编导对话'}),input=within(outer).getByRole('textbox',{name:'未发送的编导输入'});
  await waitFor(()=>expect(within(outer).getByRole('button',{name:'收起编导栏'})).toHaveFocus(),{timeout:120000});
  await user.type(input,'还未发送，保留此句');
  const trigger=candidate?within(outer).getByRole('button',{name:'预览改动'}):within(row(owner)).getByRole('button',{name:'预览候选'});
  trigger.focus();expect(trigger).toHaveFocus();await user.keyboard('{Enter}');
  const inner=await screen.findByRole('dialog',{name:candidate?'文章改动预览':owner==='article'?'文章候选预览':'图文候选预览'},{timeout:120000});
  expect(outer.contains(inner)).toBe(false);
  await waitFor(()=>expect(within(inner).getByRole('button',{name:owner==='article'?'复制公众号文章':'导出分页 ZIP'})).not.toBeDisabled(),{timeout:120000});
  await user.click(within(inner).getByText('本次采纳选择',{selector:'summary'}));
  const choice=within(inner).getByRole('checkbox',{name:/采用候选标题/});await user.click(choice);
  const checked=(choice as HTMLInputElement).checked;
  await user.keyboard('{Escape}');
  keyboardEvidence(family+'-after-escape',{outerConnected:outer.isConnected,innerConnected:inner.isConnected,triggerConnected:trigger.isConnected,activeElement:{tag:document.activeElement?.tagName,text:document.activeElement?.textContent},writes:fixture.writes,checked,inputValue:(input as HTMLInputElement).value});
  // 目标RED：原实现会把整栏与触发器一并卸载，不能把模块/夹具错当成这条失败。
  expect(screen.queryByRole('dialog',{name:'编导对话'})).toBe(outer);
  expect(screen.queryByRole('dialog',{name:candidate?'文章改动预览':owner==='article'?'文章候选预览':'图文候选预览'})).toBeNull();
  await waitFor(()=>expect(trigger).toHaveFocus(),{timeout:120000});
  expect(within(outer).getByRole('textbox',{name:'未发送的编导输入'})).toBe(input);expect(input).toHaveValue('还未发送，保留此句');
  await user.keyboard('{Enter}');
  const reopened=await screen.findByRole('dialog',{name:candidate?'文章改动预览':owner==='article'?'文章候选预览':'图文候选预览'},{timeout:120000});
  await user.click(within(reopened).getByText('本次采纳选择',{selector:'summary'}));
  expect(within(reopened).getByRole('checkbox',{name:/采用候选标题/})).toHaveProperty('checked',checked);
  await user.keyboard('{Escape}');await waitFor(()=>expect(trigger).toHaveFocus(),{timeout:120000});
  expect(fixture.writes).toHaveLength(0);expect(editorCanonical(fixture.current)).toBe(before);expect(sessionStorage.length).toBe(0);
  await user.keyboard('{Escape}');await waitFor(()=>expect(screen.queryByRole('dialog',{name:'编导对话'})).toBeNull(),{timeout:120000});
  await waitFor(()=>expect(screen.getByRole('button',{name:'打开编导'})).toHaveFocus(),{timeout:120000});
 });
 it(`T1304 portal Tab ${family}: 正反向由真实Radix内层循环`,async()=>{
  fixture=makeFixture(false);const owner=family==='creation-graphic'?'image':'article',candidate=family==='editor-article'?editorFixture():undefined;if(candidate)fixture.setCandidate(candidate);
  vi.spyOn(window,'matchMedia').mockImplementation(query=>({matches:true,media:query,addEventListener:vi.fn(),removeEventListener:vi.fn()}) as any);
  const user=userEvent.setup(),before=editorCanonical(fixture.current);render(keyboardTree(owner,candidate));
  await user.click(screen.getByRole('button',{name:'打开编导'}));const outer=screen.getByRole('dialog',{name:'编导对话'});
  await waitFor(()=>expect(within(outer).getByRole('button',{name:'收起编导栏'})).toHaveFocus(),{timeout:120000});
  const trigger=candidate?within(outer).getByRole('button',{name:'预览改动'}):within(row(owner)).getByRole('button',{name:'预览候选'});trigger.focus();expect(trigger).toHaveFocus();
  keyboardEvidence('tab-'+family+'-before-enter',{focusOnTrigger:document.activeElement===trigger,outerConnected:outer.isConnected});
  await user.keyboard('{Enter}');
  keyboardEvidence('tab-'+family+'-after-enter',{outerConnected:outer.isConnected,dialogs:Array.from(document.querySelectorAll('[role="dialog"]')).map(node=>({name:node.getAttribute('aria-label'),labelledBy:node.getAttribute('aria-labelledby')}))});
  const inner=await screen.findByRole('dialog',{name:candidate?'文章改动预览':owner==='article'?'文章候选预览':'图文候选预览'},{timeout:120000});
  const summary=await within(inner).findByText('本次采纳选择',{selector:'summary'},{timeout:120000});
  const close=within(inner).getByRole('button',{name:'关闭'});close.focus();await user.tab();expect(inner.contains(document.activeElement)).toBe(true);expect(outer.contains(document.activeElement)).toBe(false);
  summary.focus();await user.tab({shift:true});expect(inner.contains(document.activeElement)).toBe(true);expect(outer.contains(document.activeElement)).toBe(false);
  await user.click(close);await waitFor(()=>expect(trigger).toHaveFocus(),{timeout:120000});expect(screen.getByRole('dialog',{name:'编导对话'})).toBe(outer);
  expect(fixture.writes).toHaveLength(0);expect(editorCanonical(fixture.current)).toBe(before);
 });
}
async function previewEditor(){fireEvent.click(screen.getByRole('button',{name:'预览改动'}));await screen.findByRole('dialog');await waitFor(()=>expect(within(screen.getByRole('dialog')).getByRole('button',{name:'复制公众号文章'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'关闭'}));await waitFor(()=>expect(screen.getByRole('button',{name:'采纳到当前作品'})).not.toBeDisabled());}

it('RED-increment-editor-confirmed: editor成功后新整树未preview核精确版本不预取source',async()=>{
 fixture=makeFixture(false);const candidate=editorFixture();fixture.setCandidate(candidate);let view=render(tree('article',candidate));await waitFor(()=>expect(chat.readEditorState()?.dirty).toBe(false));await previewEditor();fireEvent.click(screen.getByRole('button',{name:'采纳到当前作品'}));await screen.findByText('已保存并采用。可继续微调。');view.unmount();const before=fixture.reads.filter(x=>x.id==='ai.workCandidates.source').length;
 view=render(tree('article',candidate));await screen.findByText(/这份内容已保存/);expect(fixture.reads.filter(x=>x.id==='ai.workCandidates.source')).toHaveLength(before);expect(fixture.writes).toHaveLength(1);expect(screen.queryByRole('dialog')).toBeNull();expect(screen.queryByText(/原采用请求待核对/)).toBeNull();
});
it('RED-increment-current: 原保存后有v3，新整树明确历史状态而不覆盖当前稿',async()=>{
 fixture=makeFixture(false);let view=render(tree('article'));await waitFor(()=>expect(chat.readEditorState()?.dirty).toBe(false));await preview('article');fireEvent.click(within(row('article')).getByRole('button',{name:'采纳文章'}));await within(row('article')).findByRole('status');view.unmount();fixture.current.article=fixture.resource('article',{...article,title:'后续v3',sections:[{...article.sections[0],body:'后续正文'}]},'article-later');fixture.versions.set('article-later',fixture.current.article.current);
 view=render(tree('article'));await within(row('article')).findByText('这份内容已保存，当前成稿已有后续版本。');expect(fixture.writes).toHaveLength(1);expect(fixture.current.article.currentVersionId).toBe('article-later');
});
it.each(['article','image'] as const)('RED-increment-registration: %s原owner仍挂载，保存等待时真实注册替换不得先同步旧owner',async(owner)=>{
 fixture=makeFixture(false);const dispatch=fixture.dispatch;let finish!:()=>void;const gate=new Promise<void>(resolve=>{finish=resolve;});fixture.dispatch=async(...args)=>{const id=JSON.parse(args[1].body).id;if(id===(owner==='article'?'articles.versions.create':'graphicPosts.versions.create'))await gate;return dispatch(...args);};render(tree(owner));await preview(owner);fireEvent.click(within(row(owner)).getByRole('button',{name:owner==='article'?'采纳文章':'采纳图文'}));await waitFor(()=>expect(within(row(owner)).getByRole('button',{name:'正在确认保存…'})).toBeDisabled());
 act(()=>{chat.registerEditor({readState:()=>({target:null,outputId:'replacement',generation:0,dirty:false}),prepareForTurn:async()=>{throw Error('不得发送');},previewCandidate:async()=>null,adoptCandidate:async()=>({status:'adopted'})});});await act(async()=>finish());await within(row(owner)).findByRole('status');
 const mainLoads=h.native.mock.calls.filter(([op,_input,nativeOwner])=>op==='load'&&nativeOwner.outputId===(owner==='article'?'article-real':'image-real')&&nativeOwner.sourceVersionId===(owner==='article'?'article-base':'graphic-base'));expect(mainLoads.at(-1)![1].markdown).toContain(owner==='article'?'原文章正文':'原图文正文');expect(mainLoads.at(-1)![1].markdown).not.toContain(owner==='article'?'同源文章正文':'同源图文正文');expect(fixture.writes).toHaveLength(1);
});

for(const owner of ['article','image'] as const){
 it(`StrictMode首次派生-${owner}与合法历史script不被latest推进反杀`,async()=>{
  fixture=makeFixture(true);render(<React.StrictMode>{tree(owner)}</React.StrictMode>);await waitFor(()=>expect(chat.readEditorState()?.dirty).toBe(true));
  fixture.current[owner]={...fixture.current[owner],scriptContext:{...fixture.current[owner].scriptContext,scriptRef:{...script,versionId:'newer-script-version'},scriptText:'最新脚本另一次保存'}};
  await preview(owner);fireEvent.click(within(row(owner)).getByRole('button',{name:owner==='article'?'采纳文章':'采纳图文'}));await within(row(owner)).findByRole('status');expect(chat.readEditorState()?.dirty).toBe(false);expect(fixture.writes).toHaveLength(1);expect(fixture.writes[0].input.body.expectedCurrentVersionId).toBe(owner==='article'?'article-base':'graphic-base');expect(fixture.current[owner].scriptContext.scriptText).toBe('最新脚本另一次保存');
 });
 it(`原base已推进-${owner}只读准入拒绝且零写入`,async()=>{
  fixture=makeFixture(true);render(tree(owner));await waitFor(()=>expect(chat.readEditorState()?.dirty).toBe(true));await preview(owner);fixture.current[owner]={...fixture.current[owner],currentVersionId:'other-current'};fireEvent.click(within(row(owner)).getByRole('button',{name:owner==='article'?'采纳文章':'采纳图文'}));await within(row(owner)).findByText(/当前作品有未保存修改/);expect(fixture.writes).toHaveLength(0);expect(chat.readEditorState()?.dirty).toBe(true);
 });
}

it.each(['legacy','identity','digest','exact-read'] as const)('confirmed损坏或缺证%s保原请求、锁选择、零自动POST',async(mode)=>{
 fixture=makeFixture(false);let view=render(tree('article'));await preview('article');fireEvent.click(within(row('article')).getByRole('button',{name:'采纳文章'}));await within(row('article')).findByRole('status');view.unmount();const key=Object.keys(sessionStorage).find(key=>key.startsWith('creatoros:t1097:adopt:')&&key.includes(':article-real:'))??Array.from({length:sessionStorage.length},(_,i)=>sessionStorage.key(i)!).find(key=>key.includes(':article-real:'))!;
 const record=JSON.parse(sessionStorage.getItem(key)!);if(mode==='legacy')delete record.confirmed;else if(mode==='identity')record.confirmed.identity='wrong';else if(mode==='digest')record.confirmed.documentDigest='sha256:'+'0'.repeat(64);else{const original=fixture.dispatch;fixture.dispatch=async(...args)=>{const {id,input}=JSON.parse(args[1].body);if(id==='articles.versions.get'&&input.params.versionId==='article-saved')throw Error('指定版本暂不可读');return original(...args);};}sessionStorage.setItem(key,JSON.stringify(record));const frozen=sessionStorage.getItem(key);
 view=render(tree('article'));await within(row('article')).findByText('原采用请求待核对，请继续恢复原请求。');await preview('article');fireEvent.click(within(row('article')).getByRole('button',{name:'预览候选'}));const choices=await openSelection();for(const input of within(choices).getAllByRole('checkbox'))expect(input).toBeDisabled();expect(within(row('article')).queryByRole('status')).toBeNull();expect(fixture.writes).toHaveLength(1);expect(sessionStorage.getItem(key)).toBe(frozen);
});
it('editor旧UNKNOWN只有显式恢复才同body/key写，确认刷新零额外POST',async()=>{
 fixture=makeFixture(false);const candidate=editorFixture();fixture.setCandidate(candidate);fixture.loseNext();let view=render(tree('article',candidate));await previewEditor();fireEvent.click(screen.getByRole('button',{name:'预览改动'}));const selection=await openSelection();fireEvent.click(within(selection).getByLabelText(/采用候选标题/));fireEvent.click(within(selection).getByLabelText(/采用候选摘要/));fireEvent.click(screen.getByRole('button',{name:'关闭'}));fireEvent.click(screen.getByRole('button',{name:'采纳到当前作品'}));await screen.findByText('原成功响应丢失');const original=structuredClone(fixture.writes[0]);expect(original.input.body.fieldSelection).toEqual(['title']);view.unmount();view=render(tree('article',candidate));await screen.findByText('原采用请求待核对，请继续恢复原请求。');expect(fixture.writes).toHaveLength(1);fireEvent.click(screen.getByRole('button',{name:'预览改动'}));await screen.findByRole('dialog');await waitFor(()=>expect(within(screen.getByRole('dialog')).getByRole('button',{name:'复制公众号文章'})).not.toBeDisabled());await openSelection();for(const input of within(screen.getByRole('region',{name:'本次采纳选择'})).getAllByRole('checkbox'))expect(input).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'关闭'}));fireEvent.click(screen.getByRole('button',{name:'恢复 / 采纳原请求'}));await screen.findByText('已保存并采用。可继续微调。');expect(fixture.writes).toHaveLength(2);expect(fixture.writes[1]).toEqual(original);view.unmount();view=render(tree('article',candidate));await screen.findByText('这份内容已保存，仍是当前成稿。');expect(fixture.writes).toHaveLength(2);
});

it('完整联合article部分fields与fact replace，UNKNOWN重挂保原body/key和另一平台',async()=>{
 fixture=makeFixture(false);const kept={id:'kept',text:'原已确认事实',sourceRefs:[script],reviewState:'confirmed' as const};fixture.bases.article.factItems=[kept];const value=workCreationProposalResult.parse({...joint,article:{...article,factItems:[kept,{id:'new',text:'',sourceRefs:[],reviewState:'confirmed'}]}});fixture.setCandidate(value);fixture.loseNext();const other=editorCanonical(fixture.current.image);let view=render(tree('article',undefined,value));await preview('article');fireEvent.click(within(row('article')).getByRole('button',{name:'预览候选'}));const choices=await openSelection();fireEvent.click(within(choices).getByLabelText(/采用候选标题/));fireEvent.click(within(choices).getByLabelText(/采用候选摘要/));fireEvent.click(within(choices).getByLabelText(/替换为联合候选事实/));fireEvent.click(screen.getByRole('button',{name:'关闭'}));fireEvent.click(within(row('article')).getByRole('button',{name:'采纳文章'}));await within(row('article')).findByText('原成功响应丢失');const original=structuredClone(fixture.writes[0]);expect(original.input.body).toMatchObject({adoptionMode:'assistant',fieldSelection:['title'],factSelection:{mode:'replace',expectedBeforeDigest:expect.stringMatching(/^sha256:/),proposedFactsDigest:expect.stringMatching(/^sha256:/)}});view.unmount();view=render(tree('article',undefined,value));await within(row('article')).findByText('原采用请求待核对，请继续恢复原请求。');await preview('article');fireEvent.click(within(row('article')).getByRole('button',{name:'恢复原采纳请求'}));await within(row('article')).findByRole('status');expect(fixture.writes[1]).toEqual(original);expect(fixture.current.article.current.factItems[1].reviewState).toBe('needs_confirmation');expect(editorCanonical(fixture.current.image)).toBe(other);expect(fixture.current.article.scriptContext.scriptText).toBe('逐字脚本原稿');
});
