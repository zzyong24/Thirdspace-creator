import * as React from 'react';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,within,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {articleDocument,graphicPostDocument,workEditorCandidate,workCreationProposalResult} from '@creatoros/contract';
import {DraftChatRequestProvider,useDraftChatRequest,editorCanonical} from '@/features/draft-workbench/draft-chat-request';
import {ArticleWorkbench} from '@/features/article/article-workbench';
import {GraphicPostWorkbench} from '@/features/projects/graphic-post-workbench';
import {ChatWorkCreationCard} from './chat-work-creation-card';
import {ChatWorkEditorCard} from './chat-work-editor-card';
// 真实 Provider/scope/owner/card/review/NoteRelay；只替代 dispatch 与 native surface 外部执行边界。
const h=vi.hoisted(()=>({rpc:vi.fn(),native:vi.fn(),refresh:vi.fn()}));
vi.mock('@/lib/http-transport',async original=>({...await original<any>(),fetchCreatorApi:(...args:any[])=>h.rpc(...args)}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:h.refresh,push:vi.fn(),replace:vi.fn()}),usePathname:()=>'/projects/p/article',useSearchParams:()=>new URLSearchParams()}));
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
   if(kind==='article')document.factItems=bases.article.factItems;
   const versionId=kind==='article'?'article-saved':'graphic-saved';versions.set(versionId,document);current[kind]=resource(kind,document,versionId);data={versionId,document};
   if(loseResponse){loseResponse=false;throw Error('原成功响应丢失');}
  }
  else if(id==='creativeCapabilities.list')data={items:[]};
  else if(id==='creativeResults.list'||id==='creativeResults.bundles.list')data={items:[],nextCursor:null};
  else throw Error('fixture: unhandled endpoint '+id);
  return new Response(JSON.stringify({data,meta:{requestId:'t1303-controlled'}}),{status:200,headers:{'content-type':'application/json'}});
 }};
}
function tree(owner:Owner,editorCandidate?:any){return <DraftChatRequestProvider><Witness/>{owner==='article'?<ArticleWorkbench projectId="p" accountId={null} initialOutputs={[{id:'article-real',title:'文章'}]} initialOutputId="article-real"/>:<GraphicPostWorkbench projectId="p" projectTitle="项目" accountId={null} initial={fixture.current.image as any}/>} {editorCandidate?<ChatWorkEditorCard result={editorCandidate} toolCallId="tool-real" location={location}/>:<ChatWorkCreationCard result={joint} toolCallId="tool-real" location={location}/>}</DraftChatRequestProvider>;}
function row(owner:Owner){return screen.getByRole('heading',{name:owner==='article'?'文章候选':'图文候选'}).closest('article')!;}
async function preview(owner:Owner){fireEvent.click(within(row(owner)).getByRole('button',{name:'预览候选'}));await screen.findByRole('dialog');await waitFor(()=>expect(within(screen.getByRole('dialog')).getByRole('button',{name:owner==='article'?'复制公众号文章':'导出分页 ZIP'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'关闭'}));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());await waitFor(()=>expect(within(row(owner)).getByRole('button',{name:owner==='article'?'采纳文章':'采纳图文'})).not.toBeDisabled());}
beforeEach(()=>{sessionStorage.clear();localStorage.clear();localStorage.setItem('creatoros:current-group','t1303-owned');h.native.mockImplementation(async(op:string)=>op==='load'?{themes:[],images:[],selectedImage:'',pageIndex:0,pageCount:1}:{});h.rpc.mockImplementation((...args:any[])=>fixture.dispatch(...args as [any,any,any]));});
afterEach(context=>{if(process.env.T1303_DOM_DIR){const dir=resolve(process.env.T1303_DOM_DIR);mkdirSync(dir,{recursive:true});writeFileSync(resolve(dir,context.task.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g,'_')+'.html'),document.body.innerHTML);}cleanup();vi.clearAllMocks();});
for(const owner of ['article','image'] as const){
 it(`RED-derived-${owner}: 完整owner自动承接→候选preview→原请求采纳`,async()=>{
  fixture=makeFixture(true);render(tree(owner));await waitFor(()=>expect(chat.readEditorState()?.dirty).toBe(true));await preview(owner);fireEvent.click(within(row(owner)).getByRole('button',{name:owner==='article'?'采纳文章':'采纳图文'}));
  await waitFor(()=>expect(fixture.writes).toHaveLength(1));await waitFor(()=>expect(chat.readEditorState()?.dirty).toBe(false));expect(within(row(owner)).getByRole('status')).toHaveTextContent('已保存');expect(fixture.writes[0].input.body.expectedCurrentVersionId).toBe(owner==='article'?'article-base':'graphic-base');
 });
 it(`RED-confirmed-${owner}: 独立非空cleanowner成功→整树重挂→只读确认`,async()=>{
  fixture=makeFixture(false);let view=render(tree(owner));await waitFor(()=>expect(chat.readEditorState()?.dirty).toBe(false));await preview(owner);fireEvent.click(within(row(owner)).getByRole('button',{name:owner==='article'?'采纳文章':'采纳图文'}));await within(row(owner)).findByRole('status');expect(fixture.writes).toHaveLength(1);view.unmount();
  view=render(tree(owner));await waitFor(()=>expect(within(row(owner)).getByRole('status')).toHaveTextContent('本客户端收到过成功回执'));expect(within(row(owner)).queryByText(/原采用请求待核对/)).toBeNull();expect(fixture.writes).toHaveLength(1);
 });
}
it('RED-lazy: 真实editor卡成功响应丢失→新整树未预览也可发现恢复',async()=>{
 fixture=makeFixture(false);const base={kind:'artifact',artifactId:'article-artifact',versionId:'article-base'};const candidate=workEditorCandidate.parse({kind:'work.editor.candidate',schemaVersion:1,target:{schemaVersion:1,projectId:'p',outputId:'article-real',owner:'wechat_article',contentType:'article',savedBase:base,documentDigest:'sha256:'+'a'.repeat(64),selection:{kind:'article',sectionIds:[]}},base,baseDigest:'sha256:'+'a'.repeat(64),candidateDigest:'sha256:'+'b'.repeat(64),summary:'真实编辑候选',candidate:{kind:'article',document:article},changes:[],apply:{operation:'createArticleVersion',outputId:'article-real',body:{expectedCurrentVersionId:'article-base',document:article}},imageRequest:null,failureCode:null,error:null});fixture.setCandidate(candidate);fixture.loseNext();let view=render(tree('article',candidate));await waitFor(()=>expect(chat.readEditorState()?.dirty).toBe(false));fireEvent.click(screen.getByRole('button',{name:'预览改动'}));await screen.findByRole('dialog');await waitFor(()=>expect(within(screen.getByRole('dialog')).getByRole('button',{name:'复制公众号文章'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'关闭'}));await waitFor(()=>expect(screen.getByRole('button',{name:'采纳到当前作品'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'采纳到当前作品'}));await screen.findByText('原成功响应丢失');view.unmount();const before=fixture.reads.filter(x=>x.id==='ai.workCandidates.source').length;
 view=render(tree('article',candidate));await screen.findByText('原采用请求待核对，请继续恢复原请求。');expect(screen.getByRole('button',{name:'恢复 / 采纳原请求'})).toBeVisible();expect(fixture.reads.filter(x=>x.id==='ai.workCandidates.source')).toHaveLength(before);expect(fixture.writes).toHaveLength(1);
});
