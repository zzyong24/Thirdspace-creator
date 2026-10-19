import {saveWorkEditorCandidate} from './chat-work-editor-card';
import {useEffect} from 'react';
import {DraftChatRequestProvider,useDraftChatRequest} from '@/features/draft-workbench/draft-chat-request';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {emptyCanvasDocument,ENDPOINTS,assistantActionCandidateSchema,articleDocument} from '@creatoros/contract';
import {createCreationWorkspace} from '@/lib/creation-workspace-scope';
import {ChatSystemActionCard,appendCandidateReviewPrompt,readAssistantSourceScope,rememberAssistantSourceScope} from './chat-system-action-card';
afterEach(()=>{cleanup();vi.restoreAllMocks();localStorage.clear();});
const source={taskId:'task-source',callId:'call-original',toolCallId:'tool-1',candidateDigest:`sha256:${'a'.repeat(64)}`};
const document={...emptyCanvasDocument,nodes:[{id:'note-1',type:'text' as const,label:'创作主旨',text:'说明本次真实内容',position:{x:20,y:40}}]};
const candidate={schemaVersion:1,kind:'canvas.create.proposal',request:{title:'我的创作流程',document},document,source};
const canvas={id:'saved-canvas',userId:'u',accountId:null,groupId:'g',title:'我的创作流程',projectId:null,document,revision:1,createdAt:'2026-10-08T01:00:00.000Z',updatedAt:'2026-10-08T01:00:00.000Z',archivedAt:null};
const receipt={source,status:'adopted',operationId:'canvas.create',result:canvas,adoptedAt:'2026-10-08T01:00:00.000Z'};
it('文章候选展开呈现完整正文与待确认事实，采用前无内部请求JSON且不发生写入',async()=>{
 const f=fixture(),action=assistantActionCandidateSchema.parse({schemaVersion:1,kind:'system.action.proposal',source,observations:{article:{title:'原文章'}},request:{action:{kind:'article.save',outputId:'internal-output-article',expectedCurrentVersionId:'internal-version-article',document:articleDocument.parse({schemaVersion:1,title:'新的文章标题',summary:'这是本期摘要',sections:[{sectionId:'internal-section',order:0,heading:'如何开始',body:'全文不能藏在参数里。\n第二行😀仍需完整显示。'}],factItems:[{id:'internal-fact',text:'预算金额需要作者确认',reviewState:'needs_confirmation'}],visualBriefs:[],imageUses:[]})}}});
 render(<ChatSystemActionCard result={action} operations={f.operations}/>);fireEvent.click(screen.getByRole('button',{name:'展开候选详情'}));
 expect(screen.getByText('如何开始')).toBeInTheDocument();expect(screen.getByText(/第二行😀仍需完整显示/)).toBeInTheDocument();expect(screen.getByText('预算金额需要作者确认')).toBeInTheDocument();expect(screen.getByText('待确认')).toBeInTheDocument();
 expect(screen.queryByText(/internal-output-article|internal-version-article|"article.save"/)).not.toBeInTheDocument();
 await screen.findByRole('button',{name:'采用此改动'});expect(f.requests.map(r=>r.id)).toEqual(['ai.assistantActions.receipt']);
});
it('脚本候选明确比较原文和修改后正文，不显示内部锚点和版本字段',()=>{
 const action=assistantActionCandidateSchema.parse({schemaVersion:1,kind:'system.action.proposal',source,observations:{artifact:{title:'本期脚本'}},request:{action:{kind:'script.patch',artifactId:'internal-artifact',expectedVersionId:'internal-version-script',sectionId:'internal-anchor',expectedOriginalText:'这是旧句子',replacementText:'这是修改后的句子',changeSummary:'保留原本观点，缩短表达'}}});
 render(<ChatSystemActionCard result={action}/>);fireEvent.click(screen.getByRole('button',{name:'展开候选详情'}));
 expect(screen.getByText('原文')).toBeInTheDocument();expect(screen.getByText('修改后')).toBeInTheDocument();expect(screen.getByText('这是旧句子')).toBeInTheDocument();expect(screen.queryByText(/internal-anchor|internal-version-script/)).not.toBeInTheDocument();
});
it('排期候选同时显示日期、真实项目与平台目标；偏好候选使用中文字段和值',()=>{
 const planned=assistantActionCandidateSchema.parse({schemaVersion:1,kind:'system.action.proposal',source,observations:{project:{title:'本期作品'},target:{accountHandle:'实际小红书账号',platform:'xiaohongshu'}},request:{action:{kind:'calendar.plan',projectId:'internal-project',plannedDate:'2026-10-09',targetAccountId:'internal-account',note:'发布前先检查封面'}}});
 const view=render(<ChatSystemActionCard result={planned}/>);fireEvent.click(screen.getByRole('button',{name:'展开候选详情'}));
 expect(screen.getAllByText(/2026-10-09/).length).toBeGreaterThan(0);expect(screen.getByText('小红书 · 实际小红书账号')).toBeInTheDocument();expect(screen.getByText('发布前先检查封面')).toBeInTheDocument();expect(screen.queryByText(/internal-project|internal-account/)).not.toBeInTheDocument();
 view.unmount();const preference=assistantActionCandidateSchema.parse({schemaVersion:1,kind:'system.action.proposal',source,observations:{expected:{autosaveEnabled:true,defaultHome:'home'}},request:{action:{kind:'preferences.update',autosaveEnabled:false,defaultHome:'calendar'}}});
 render(<ChatSystemActionCard result={preference}/>);fireEvent.click(screen.getByRole('button',{name:'展开候选详情'}));expect(screen.getByText('自动保存')).toBeInTheDocument();expect(screen.getByText('关闭')).toBeInTheDocument();expect(screen.getByText('默认首页')).toBeInTheDocument();expect(screen.getByText('创作日历')).toBeInTheDocument();expect(screen.queryByText(/"autosaveEnabled"/)).not.toBeInTheDocument();
});
function fixture(options:{replyLost?:boolean;conflict?:boolean;conflictAfterCommit?:boolean;freshFailure?:boolean;pending?:boolean}={}){
 let saved:typeof receipt|null=null,current=true,release:(()=>void)|undefined;
 const requests:Array<{id:string;input:Record<string,unknown>}>=[];
 const fetchApi=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{
  const request=JSON.parse(String(init?.body));requests.push(request);
  let data:unknown;
  if(request.id==='ai.assistantActions.receipt')data={receipt:saved};
  else if(request.id==='canvas.create.adopt'){
   if(options.pending)await new Promise<void>(resolve=>{release=resolve;});
   if(options.conflict)return new Response(JSON.stringify({error:{message:'画布引用已改变，请重新读取',code:'ConflictError'}}),{status:409});
   saved=receipt;if(options.conflictAfterCommit)return new Response(JSON.stringify({error:{message:'唤醒期间原任务状态已改变',code:'ConflictError'}}),{status:409});if(options.replyLost)throw Error('连接中断');data=receipt;
  }else if(request.id==='canvas.get'){
   if(options.freshFailure)throw Error('连接中断');data=canvas;
  }else throw Error(`未预期操作 ${request.id}`);
  return new Response(JSON.stringify({data,meta:{requestId:'ui-fixture'}}));
 });
 const operations=createCreationWorkspace({groupId:'g',accountId:'account-at-source'},{isCurrent:()=>current,fetchApi});
 return {operations,fetchApi,requests,stop:()=>{current=false;},release:()=>release?.(),saved:()=>saved};
}
it('展示完整画布缩略和内容，用户采用只传原四字段，并用原canvas.get读回',async()=>{
 const f=fixture();render(<ChatSystemActionCard result={candidate} operations={f.operations}/>);
 expect(screen.getByRole('img',{name:'画布布局预览，1个节点'})).toBeInTheDocument();
 fireEvent.click(await screen.findByRole('button',{name:'采用并创建画布'}));
 await screen.findByText('已采用并保存');await waitFor(()=>expect(f.requests.some(r=>r.id==='canvas.get')).toBe(true));
 expect(f.requests.find(r=>r.id==='canvas.create.adopt')?.input).toEqual({body:source});
 expect(screen.getByRole('link',{name:'打开创作画布'})).toHaveAttribute('href','/canvases/saved-canvas');
 expect(screen.queryByRole('button',{name:'采用并创建画布'})).not.toBeInTheDocument();
});
it('回复丢失先核对原receipt，刷新恢复已保存候选，不重复采用',async()=>{
 const f=fixture({replyLost:true});const view=render(<ChatSystemActionCard result={candidate} operations={f.operations}/>);
 fireEvent.click(await screen.findByRole('button',{name:'采用并创建画布'}));await screen.findByText('需要核对原操作');
 expect(screen.queryByRole('button',{name:'采用并创建画布'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'核对原操作'}));await screen.findByText('已采用并保存');
 view.unmount();render(<ChatSystemActionCard result={candidate} operations={f.operations}/>);await screen.findByText('已采用并保存');
 expect(f.requests.filter(r=>r.id==='canvas.create.adopt')).toHaveLength(1);
});
it('采用在途单飞，候选内容保持；切组后迟到结果不显示成功',async()=>{
 const f=fixture({pending:true});render(<ChatSystemActionCard result={candidate} operations={f.operations}/>);
 const button=await screen.findByRole('button',{name:'采用并创建画布'});fireEvent.click(button);fireEvent.click(button);
 await screen.findByText('正在保存');expect(f.requests.filter(r=>r.id==='canvas.create.adopt')).toHaveLength(1);
 f.stop();f.release();await screen.findByText('需要核对原操作');
 expect(screen.queryByText('已采用并保存')).not.toBeInTheDocument();expect(screen.getByRole('heading',{name:'我的创作流程'})).toBeInTheDocument();
});
it('明确409冲突保留候选，不能继续盲目提交旧版本',async()=>{
 const f=fixture({conflict:true});render(<ChatSystemActionCard result={candidate} operations={f.operations}/>);
 fireEvent.click(await screen.findByRole('button',{name:'采用并创建画布'}));await screen.findByText('需要重新核对候选');
 expect(screen.queryByRole('button',{name:'采用并创建画布'})).not.toBeInTheDocument();expect(f.saved()).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'核对原操作'}));await screen.findByText('需要重新核对候选');
 expect(screen.queryByRole('button',{name:'采用并创建画布'})).not.toBeInTheDocument();
});
it('提交后唤醒返回409仍查原回执，恢复已采用而不是误称未保存',async()=>{
 const f=fixture({conflictAfterCommit:true});render(<ChatSystemActionCard result={candidate} operations={f.operations}/>);
 fireEvent.click(await screen.findByRole('button',{name:'采用并创建画布'}));await screen.findByText('需要重新核对候选');
 fireEvent.click(screen.getByRole('button',{name:'核对原操作'}));await screen.findByText('已采用并保存');
 expect(f.requests.filter(r=>r.id==='canvas.create.adopt')).toHaveLength(1);
});
it('版本冲突有真实重新核对入口，准备原候选的请求但不再次采用',async()=>{
 const f=fixture({conflict:true}),review=vi.fn();render(<ChatSystemActionCard result={candidate} operations={f.operations} onReviewCandidate={review}/>);
 fireEvent.click(await screen.findByRole('button',{name:'采用并创建画布'}));await screen.findByText('需要重新核对候选');
 expect(screen.getByRole('alert')).toHaveTextContent('对象或素材已经改变');
 fireEvent.click(screen.getByRole('button',{name:'准备重新核对'}));
 expect(review).toHaveBeenCalledWith(expect.stringContaining('我的创作流程'));
 expect(f.requests.filter(r=>r.id==='canvas.create.adopt')).toHaveLength(1);
});
it('键盘采用完成后焦点落在结果状态，加载历史回执不抢焦点',async()=>{
 const f=fixture(),view=render(<ChatSystemActionCard result={candidate} operations={f.operations}/>);
 const button=await screen.findByRole('button',{name:'采用并创建画布'});button.focus();fireEvent.click(button);
 await screen.findByText('已采用并保存');expect(screen.getByRole('status')).toHaveFocus();
 view.unmount();render(<><input aria-label="当前输入" autoFocus/><ChatSystemActionCard result={candidate} operations={f.operations}/></>);
 await screen.findByText('已采用并保存');expect(screen.getByRole('textbox',{name:'当前输入'})).toHaveFocus();
});
it('等待期间用户已移到其它输入框，完成回写不抢走新焦点',async()=>{
 const f=fixture({pending:true});render(<><input aria-label="继续写稿"/><ChatSystemActionCard result={candidate} operations={f.operations}/></>);
 const button=await screen.findByRole('button',{name:'采用并创建画布'});button.focus();fireEvent.click(button);
 const input=screen.getByRole('textbox',{name:'继续写稿'});input.focus();f.release();
 await screen.findByText('已采用并保存');expect(input).toHaveFocus();
});
it('重新核对预填保留未发送稿件，只追加请求',()=>{
 expect(appendCandidateReviewPrompt('  我正在调整原文\n','核对原候选')).toBe('  我正在调整原文\n\n\n核对原候选');
 expect(appendCandidateReviewPrompt('','核对原候选')).toBe('核对原候选');
});
it('已采用后的读取失败保留原回执和结果入口，不改成再次采用',async()=>{
 const f=fixture({freshFailure:true});render(<ChatSystemActionCard result={candidate} operations={f.operations}/>);
 fireEvent.click(await screen.findByRole('button',{name:'采用并创建画布'}));await screen.findByText(/已保留原采用回执/);
 expect(screen.getByText('已采用并保存')).toBeInTheDocument();expect(screen.getByRole('link',{name:'打开创作画布'})).toBeInTheDocument();
 expect(f.requests.filter(r=>r.id==='canvas.create.adopt')).toHaveLength(1);
});
it('缺来源范围不猜当前账号；无签名完整来源不出现保存按钮',async()=>{
 render(<ChatSystemActionCard result={candidate}/>);expect(screen.getByText(/来源范围尚不可读取/)).toBeInTheDocument();expect(screen.queryByRole('button',{name:'采用并创建画布'})).not.toBeInTheDocument();
 cleanup();render(<ChatSystemActionCard result={{...candidate,source:undefined}}/>);expect(screen.getByRole('alert')).toHaveTextContent('候选来源或内容不完整');
});
it('记录实际请求scope保留group和account，明确null能跨刷新读回',()=>{
 rememberAssistantSourceScope('new-source',{'x-group-id':'g-original','x-account-id':'a-original'});expect(readAssistantSourceScope('new-source')).toEqual({groupId:'g-original',accountId:'a-original'});
 localStorage.setItem('creatoros:assistant-source-scope:restored',JSON.stringify({groupId:'g-original',accountId:null}));expect(readAssistantSourceScope('restored')).toEqual({groupId:'g-original',accountId:null});
 expect(readAssistantSourceScope('no-record')).toBeNull();
});
const digest='b'.repeat(64);
const generationCandidate={schemaVersion:1,kind:'canvas.generate.proposal',request:{baseRevision:1,nodeId:'image'},snapshot:{canvasId:'canvas-g',inputRevision:1,inputDigest:digest,sourceExecutionTaskId:'source-execution',parentDeadlineAt:null,assetLimit:{maxCalls:6,maxTokens:1000000,deadlineMs:1800000},inputData:{kind:'image',mode:'text_to_image',prompt:'中性纸船画面',aspectRatio:'1:1',canvasOwner:{accountId:null,groupId:'g',canvasId:'canvas-g',nodeId:'image',inputDigest:digest}}},source};
function generationFixture(wrongOrigin=false,taskStatus='awaiting_confirmation'){
 const result={id:'link-g',taskId:'task-g',attemptId:'original-attempt'},saved={source,status:'accepted',operationId:'canvas.node.generate',result,adoptedAt:'2026-10-08T01:00:00.000Z'};
 const selection={status:'available',phase:'candidate',origin:{canvasId:'canvas-g',nodeId:'image',generationLinkId:wrongOrigin?'other-link':'link-g',taskId:'task-g',attemptId:'original-attempt',inputRevision:1,inputDigest:digest,resultId:'r',executionTaskId:'e',callId:'image-call'},file:{assetId:'asset-g',assetFileId:'exact-file-g'},checksum:digest,assetType:'image',name:'中性纸船',assetStatus:'pending',taskStatus:'awaiting_confirmation'};
 const requests:Array<{id:string;input:Record<string,unknown>}>=[];
 const task=ENDPOINTS.getTask.response.parse({id:'task-g',userId:'u',groupId:'g',projectId:null,contentOutputId:null,taskType:'asset.generate',status:taskStatus,executionTaskId:'e',inputData:{},modelKey:'ui-fixture',idempotencyKey:'original-attempt',attemptId:'original-attempt',requestFingerprint:`sha256:${digest}`,retryOfTaskId:null,requestedAt:'2026-10-08T01:00:00.000Z',startedAt:null,completedAt:null,errorMessage:null});
 const fetchApi=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{const request=JSON.parse(String(init?.body));requests.push(request);
  const data=request.id==='ai.assistantActions.receipt'?{receipt:saved}:request.id==='canvas.generations.material.get'?selection:request.id==='ai.tasks.get'?task:request.id==='assets.fileDownloadUrl'?{url:'/exact-file.png',fileName:'exact-file.png'}:null;
  if(!data)throw Error('没有该原操作夹具');return new Response(JSON.stringify({data,meta:{requestId:'ui-fixture'}}));
 });
 return {requests,operations:createCreationWorkspace({groupId:'g',accountId:null},{isCurrent:()=>true,fetchApi})};
}
it('生图原回执恢复后核原link/task/input，再预览确切assetFile；不重发确认',async()=>{
 const f=generationFixture();render(<ChatSystemActionCard result={generationCandidate} operations={f.operations}/>);
 const preview=await screen.findByRole('img',{name:'原生成结果：中性纸船'});expect(preview).toHaveAttribute('src','/exact-file.png');
 expect(f.requests.find(r=>r.id==='assets.fileDownloadUrl')?.input).toEqual({params:{assetId:'asset-g',assetFileId:'exact-file-g'}});
 expect(f.requests.some(r=>r.id==='canvas.generation.confirm')).toBe(false);
 const refresh=screen.getByRole('button',{name:'刷新原结果'});refresh.focus();fireEvent.click(refresh);await waitFor(()=>expect(f.requests.filter(r=>r.id==='canvas.generations.material.get')).toHaveLength(2));
 await waitFor(()=>expect(screen.getByRole('status')).toHaveFocus());
});
it('生图详情只展示创作设置，结果状态与原画布入口不冒充自动放入',async()=>{
 const f=generationFixture();render(<ChatSystemActionCard result={generationCandidate} operations={f.operations}/>);
 await screen.findByRole('img',{name:'原生成结果：中性纸船'});
 fireEvent.click(screen.getByRole('button',{name:'展开候选详情'}));
 expect(screen.getByText('文字生成图片')).toBeInTheDocument();
 expect(screen.queryByText(/canvasOwner|inputDigest|projectId/)).not.toBeInTheDocument();
 expect(screen.getByText('图片已生成，待确认保留')).toBeInTheDocument();
 expect(screen.getByRole('link',{name:'打开原画布'})).toHaveAttribute('href','/canvases/canvas-g');
 expect(screen.queryByText('等待保留')).not.toBeInTheDocument();
});
it('原任务最新失败优先于较早的文件快照，不显示绿色生成完成，仍保留回执和可核对入口',async()=>{
 const f=generationFixture(false,'failed');render(<ChatSystemActionCard result={generationCandidate} operations={f.operations}/>);
 await screen.findByText('原生成任务失败');expect(screen.getByRole('status')).toHaveClass('text-warning');
 expect(screen.queryByText('图片已生成，待确认保留')).not.toBeInTheDocument();
 expect(screen.getByRole('link',{name:'打开原画布'})).toBeInTheDocument();expect(f.requests.some(r=>r.id==='canvas.generation.confirm')).toBe(false);
});
it('生图产物来源不等原link时不请求文件URL、不伪显生成成功，原采用回执保留',async()=>{
 const f=generationFixture(true);render(<ChatSystemActionCard result={generationCandidate} operations={f.operations}/>);
 await screen.findByText(/已保留原采用回执/);expect(screen.queryByRole('img',{name:'原生成结果：中性纸船'})).not.toBeInTheDocument();
 expect(f.requests.some(r=>r.id==='assets.fileDownloadUrl')).toBe(false);expect(screen.getByText('生成任务已接受')).toBeInTheDocument();
});
it('排期正式读回按原组和日期分页找到原entry，不把采用回执当最新结果',async()=>{
 const action={kind:'calendar.plan',projectId:'project-c',plannedDate:'2026-10-09',targetAccountId:null},proposal={schemaVersion:1,kind:'system.action.proposal',request:{action},observations:{},source};
 const saved={source,status:'adopted',operationId:'group.calendar.entries.create',result:{id:'calendar-original'},adoptedAt:'2026-10-08T01:00:00.000Z'};
 const requests:Array<{id:string;input:{query?:{page:number};params?:unknown}}>=[];
 const row=(id:string)=>ENDPOINTS.listGroupCalendar.response.parse({id,userId:'u',groupId:'g',accountId:null,projectId:'project-c',plannedDate:'2026-10-09',plannedAt:'2026-10-09T00:00:00.000Z',contentOutputId:null,candidateId:null,status:'planned',note:'中性排期',publishedAt:null,createdAt:'2026-10-08T01:00:00.000Z',updatedAt:'2026-10-08T01:00:00.000Z'});
 const fetchApi=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{const request=JSON.parse(String(init?.body));requests.push(request);if(request.id==='group.calendar.list')ENDPOINTS.listGroupCalendar.query.parse(request.input.query);const data=request.id==='ai.assistantActions.receipt'?{receipt:saved}:request.id==='group.calendar.list'?request.input.query.page===1?Array.from({length:50},(_,i)=>row(`other-${i}`)):[row('calendar-original')]:null;return new Response(JSON.stringify({data,meta:request.id==='group.calendar.list'?{requestId:'ui-fixture',page:request.input.query.page,pageSize:50,total:51}:{requestId:'ui-fixture'}}));});
 const operations=createCreationWorkspace({groupId:'g',accountId:null},{isCurrent:()=>true,fetchApi});render(<ChatSystemActionCard result={proposal} operations={operations}/>);
 await waitFor(()=>expect(requests.filter(r=>r.id==='group.calendar.list')).toHaveLength(2));expect(requests.filter(r=>r.id==='group.calendar.list').map(r=>r.input)).toEqual([1,2].map(page=>({params:{groupId:'g'},query:{from:'2026-10-09T00:00:00.000Z',to:'2026-10-09T23:59:59.999Z',pageSize:50,page}})));
 expect(screen.queryByText(/当前结果读取失败/)).not.toBeInTheDocument();
});

it('当前稿未保存时保留输入和具体恢复说明，正式采用和旧保存均不调用',async()=>{
 localStorage.setItem('creatoros:current-group','g');
 const f=fixture(),doc=articleDocument.parse({schemaVersion:1,title:'候选文章',summary:'',sections:[],factItems:[],visualBriefs:[],imageUses:[]});
 const action=assistantActionCandidateSchema.parse({schemaVersion:1,kind:'system.action.proposal',source,observations:{article:{projectId:'p',outputId:'article-current',artifactId:'artifact-current',currentVersionId:'base-current',current:{...doc,title:'原文章'},versions:[]}},request:{action:{kind:'article.save',outputId:'article-current',expectedCurrentVersionId:'base-current',document:doc}}});
 const adopt=vi.fn();
 function Editor(){const chat=useDraftChatRequest();useEffect(()=>chat.registerEditor({readState:()=>({target:null,outputId:'article-current',generation:1,dirty:true}),prepareForTurn:async()=>{throw Error('不发起');},previewCandidate:async()=>null,adoptCandidate:adopt}),[chat.registerEditor]);return <input aria-label="当前文章输入" defaultValue="我正在补充的文字😀"/>;}
 render(<DraftChatRequestProvider><Editor/><ChatSystemActionCard result={action} operations={f.operations}/></DraftChatRequestProvider>);
 fireEvent.click(await screen.findByRole('button',{name:'采用此改动'}));
 await screen.findByText('当前作品有未保存修改，请先保存或核对；原输入已保留。');
 expect(screen.getByRole('textbox',{name:'当前文章输入'})).toHaveValue('我正在补充的文字😀');expect(adopt).not.toHaveBeenCalled();
 expect(f.requests.map(r=>r.id)).toEqual(['ai.assistantActions.receipt']);
});

it('当前已保存稿采用正式来源候选后读回原版本，不再显示等待采用或调用旧保存',async()=>{
 localStorage.setItem('creatoros:current-group','g');
 const doc=articleDocument.parse({schemaVersion:1,title:'采用后的文章',summary:'',sections:[],factItems:[],visualBriefs:[],imageUses:[]});
 const original={projectId:'p',outputId:'article-current',artifactId:'artifact-current',currentVersionId:'base-current',current:{...doc,title:'原文章'},versions:[]};
 const action=assistantActionCandidateSchema.parse({schemaVersion:1,kind:'system.action.proposal',source,observations:{article:original},request:{action:{kind:'article.save',outputId:original.outputId,expectedCurrentVersionId:original.currentVersionId,document:doc}}});
 const adopted={source,status:'adopted',operationId:'articles.versions.create',result:{versionId:'adopted-version',document:doc},adoptedAt:canvas.createdAt};
 let saved:typeof adopted|null=null;const requests:any[]=[];
 const operations=createCreationWorkspace({groupId:'g',accountId:null},{isCurrent:()=>true,fetchApi:async(_url,init)=>{
  const request=JSON.parse(String(init?.body));requests.push(request);let value;
  switch(request.id){
   case 'ai.assistantActions.receipt':value={receipt:saved};break;
   case 'ai.assistantActions.adopt':saved=adopted;value=adopted;break;
   case 'articles.versions.get':value={versionId:'adopted-version',document:doc};break;
   case 'articles.get':value={...original,currentVersionId:'adopted-version',current:doc};break;
   default:throw Error('不允许旧保存或其它写入');
  }
  return new Response(JSON.stringify({data:value,meta:{requestId:'ui-fixture'}}));
 }});
 const adopt=vi.fn(async(candidate:any,requestId:string)=>{const value=await saveWorkEditorCandidate(operations.capture().client,candidate,requestId);return {status:'adopted' as const,versionId:value.receipt.versionId};});
 function Editor(){const chat=useDraftChatRequest();useEffect(()=>chat.registerEditor({readState:()=>({target:null,outputId:'article-current',generation:0,dirty:false}),prepareForTurn:async()=>{throw Error('不发起');},previewCandidate:async()=>null,adoptCandidate:adopt}),[chat.registerEditor]);return null;}
 render(<DraftChatRequestProvider><Editor/><ChatSystemActionCard result={action} operations={operations}/></DraftChatRequestProvider>);
 fireEvent.click(await screen.findByRole('button',{name:'采用此改动'}));await screen.findByText('已采用并保存');
 expect(screen.queryByText('等待你采用')).not.toBeInTheDocument();expect(adopt).toHaveBeenCalledTimes(1);expect(adopt.mock.calls[0]).toHaveLength(2);
 expect(requests.filter(r=>r.id==='ai.assistantActions.adopt')).toEqual([{id:'ai.assistantActions.adopt',input:{body:source}}]);
 await waitFor(()=>expect(requests.some(r=>r.id==='articles.versions.get')).toBe(true));
});
