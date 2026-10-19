"use client";
import * as React from 'react';
import Link from 'next/link';
import {CheckCircle2,ChevronDown,ImageIcon,LayoutTemplate,Loader2,RefreshCw,Sparkles,TriangleAlert} from 'lucide-react';
import {ENDPOINTS,assistantActionCandidateSchema,canvasCreateCandidateSchema,canvasGenerateCandidateSchema,assistantAdoptionReceiptSchema,canvasMaterialSelectionResource,type AssistantActionInput,type CanvasDocument} from '@creatoros/contract';
import {Button} from '@/components/ui/button';
import {createCreationWorkspace,useCreationScope,type CreationClient,type CreationScope,type CreationWorkspace} from '@/lib/creation-workspace-scope';
import {useDraftChatRequest,EditorCandidateConflictError} from '@/features/draft-workbench/draft-chat-request';
import {adoptAssistantDocumentThroughEditor} from './chat-work-editor-card';
import {HttpTransportError} from '@/lib/http-transport';
import {humanizeAiError} from '@/lib/ai-error-humanize';
import {getPlatformIcon} from '@/lib/platform-icons';

type Candidate=ReturnType<typeof assistantActionCandidateSchema.parse>|ReturnType<typeof canvasCreateCandidateSchema.parse>|ReturnType<typeof canvasGenerateCandidateSchema.parse>;
type Receipt=ReturnType<typeof assistantAdoptionReceiptSchema.parse>;
const scopePrefix='creatoros:assistant-source-scope:';
/** 仅记录实际聊天请求的选择范围；后端每次仍核真实用户、来源和归属。 */
export function rememberAssistantSourceScope(taskId:string,headers:HeadersInit){
 const h=new Headers(headers),scope={groupId:h.get('x-group-id'),accountId:h.get('x-account-id')};
 try{localStorage.setItem(`${scopePrefix}${taskId}`,JSON.stringify(scope));}catch{/* 无存储时保留当前窗口的来源。 */}
 scopes.set(taskId,Object.freeze(scope));
}
const scopes=new Map<string,CreationScope>();
export function readAssistantSourceScope(taskId:string):CreationScope|null{
 const known=scopes.get(taskId);if(known)return known;
 try{const value=JSON.parse(localStorage.getItem(`${scopePrefix}${taskId}`)??'null');if(value&&Object.keys(value).length===2&&(value.groupId===null||typeof value.groupId==='string')&&(value.accountId===null||typeof value.accountId==='string')&&(value.groupId||value.accountId)){const scope=Object.freeze({groupId:value.groupId,accountId:value.accountId});scopes.set(taskId,scope);return scope;}}catch{/* 历史缺来源范围时不能猜当前筛选。 */}
 return null;
}
// SEMANTIC_BOUNDARY_ALLOW:合同判别值到中文标签，只展示已由模型选定的动作。
const labels:Record<AssistantActionInput['kind'],string>={'project.create':'创建项目','topic.create':'保存选题','topic.promote':'选题立项','script.patch':'修改脚本段落','article.save':'保存文章','graphic.save':'保存图文','asset.tag':'标记素材','knowledge.create':'保存知识','knowledge.folder.create':'新建知识分类','radar.collection.create':'新建雷达分类','positioning.save':'更新创作者定位','group.create':'创建账号组','group.rename':'修改账号组名称','account.bind.start':'开始扫码绑定','publication.prepare':'准备发布','calendar.plan':'安排创作日历','automation.createDraft':'创建自动化草稿','automation.enable':'调整自动化状态','preferences.update':'更新偏好设置'};
function parseCandidate(result:unknown):Candidate|null{
 for(const schema of [assistantActionCandidateSchema,canvasCreateCandidateSchema,canvasGenerateCandidateSchema]){const parsed=schema.safeParse(result);if(parsed.success)return parsed.data;}return null;
}
function object(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function message(error:unknown){if(error instanceof EditorCandidateConflictError)return error.message;return humanizeAiError(error instanceof Error?error:Error('原操作暂不可读取'))?.message??'原操作暂不可读取，请保留候选后核对。';}
function adoptionFailure(error:HttpTransportError){
 if(error.status===409)return '对象或素材已经改变，请先核对原操作；需要新候选时，让助手重新读取后调整。';
 if(error.status===404)return '原对象当前不可读取，请重新核对它的位置和归属。';
 if(error.status===401)return '请恢复登录后，让助手重新核对这条候选。';
 if(error.status===403)return '当前账号组的操作权限已改变，请核对账号组后继续。';
 if(error.status===428)return '这条候选需要先补齐原对象的确认信息，请重新核对。';
 return '候选内容未通过当前对象的校验，请让助手重新读取并调整候选。';
}
/** 仅预填明确的核对请求，保留用户已有未发送文字，不自动执行。 */
export function appendCandidateReviewPrompt(existing:string,request:string){return existing.trim()?`${existing}\n\n${request}`:request;}
function caption(candidate:Candidate){
 if(candidate.kind==='canvas.create.proposal')return {title:'创建创作画布',name:candidate.request.title,impact:`${candidate.document.nodes.length} 个节点 · ${candidate.document.edges.length} 条连接`,body:'采用后保存完整画布，可继续编排和生成图片。'};
 if(candidate.kind==='canvas.generate.proposal'){const input=candidate.snapshot.inputData;return {title:input.kind==='image'?'生成画布图片':'生成画布视频',name:input.mode.startsWith('image_to_')?'使用已选参考图生成':'按提示词生成',impact:`${input.aspectRatio??'模型默认比例'}${input.durationSec?` · ${input.durationSec} 秒`:''}`,body:input.prompt};}
 const action=candidate.request.action,observations=candidate.observations,observed=object(observations.article??observations.graphic??observations.candidate??observations.artifact??observations.project),target=object(observations.target);
 const name=(action.kind==='article.save'||action.kind==='graphic.save'?action.document.title:'title' in action&&typeof action.title==='string'?action.title:'name' in action&&typeof action.name==='string'?action.name:typeof observed.title==='string'?observed.title:action.kind==='automation.enable'&&typeof object(observations.job).name==='string'?String(object(observations.job).name):typeof target.accountHandle==='string'?target.accountHandle:labels[action.kind]);
 const body=action.kind==='script.patch'?action.replacementText:action.kind==='knowledge.create'?action.note:action.kind==='positioning.save'?action.persona:action.kind==='article.save'?action.document.summary:action.kind==='graphic.save'?action.document.body:typeof observations.effect==='string'?observations.effect:'检查候选内容，采用后保存到当前工作区。';
 const selectedTarget=typeof target.accountHandle==='string'?`目标：${target.accountHandle}`:null;
 return {title:labels[action.kind],name,impact:action.kind==='calendar.plan'?`排期：${action.plannedDate}${selectedTarget?` · ${selectedTarget}`:' · 尚未指定平台账号'}`:selectedTarget??(action.kind==='asset.tag'?`${action.targets.length} 个素材 · 标签「${action.tag}」`:action.kind==='account.bind.start'?'打开原扫码任务，完成登录后再核对身份':''),body};
}
type ActionCandidate=Extract<Candidate,{kind:'system.action.proposal'}>;
function readable(value:unknown,fallback='未填写'):string{return typeof value==='string'&&value.length?value:fallback;}
function platformName(value:unknown){return typeof value==='string'?getPlatformIcon(value).label:'平台待核对';}
function DetailRows({rows}:{rows:Array<[string,React.ReactNode]>}){
 return <dl className="space-y-3">{rows.map(([label,value])=>value===undefined?null:<div key={label} className="min-w-0"><dt className="mb-1 text-xs text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap break-words text-sm leading-relaxed">{value??'未填写'}</dd></div>)}</dl>;
}
/** SEMANTIC_BOUNDARY_ALLOW:合同字段与枚举的中文呈现，不决定内容、平台或创作取舍。 */
function ActionDetails({candidate}:{candidate:ActionCandidate}){
 const action=candidate.request.action,observations=candidate.observations,target=object(observations.target);
 const selectedTarget=typeof target.accountHandle==='string'?`${platformName(target.platform)} · ${target.accountHandle}`:'尚未指定平台账号';
 switch(action.kind){
  case 'script.patch':return <DetailRows rows={[["原文",action.expectedOriginalText],["修改后",action.replacementText],["修改说明",action.changeSummary]]}/>;
  case 'article.save':{
   const doc=action.document;
   return <div className="space-y-4"><DetailRows rows={[["文章标题",doc.title],["摘要",doc.summary],["标签",doc.tags?.join('、')],["已选图片",`${doc.imageUses.length+(doc.coverImageUse?1:0)} 张`]]}/>{doc.sections.map(section=><div key={section.sectionId} className="space-y-2"><h4 className="break-words text-sm font-semibold">{section.heading||'正文'}</h4><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{section.body}</p></div>)}{doc.factItems.length?<div className="space-y-2"><h4 className="text-sm font-semibold">事实核对</h4>{doc.factItems.map(fact=><div key={fact.id}><span className={`text-xs ${fact.reviewState==='confirmed'?'text-success':'text-warning'}`}>{fact.reviewState==='confirmed'?'已确认':'待确认'}</span><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{fact.text}</p></div>)}</div>:null}{doc.visualBriefs.length?<div className="space-y-2"><h4 className="text-sm font-semibold">配图要求</h4>{doc.visualBriefs.map((visual,index)=><p key={`${visual.sectionId}:${index}`} className="whitespace-pre-wrap break-words text-sm leading-relaxed">{visual.brief}</p>)}</div>:null}{doc.imageMatchWarnings?.map((warning,index)=><p key={index} className="break-words text-sm text-warning">{warning}</p>)}</div>;
  }
  case 'graphic.save':{
   const doc=action.document;
   return <div className="space-y-4"><DetailRows rows={[["图文标题",doc.title],["摘要",doc.summary],["正文",doc.body],["标签",doc.tags.join('、')],["已选图片",`${doc.imageUses.length} 张`],["系列视觉方向",doc.seriesProfile?.visualDirection],["图片比例",doc.seriesProfile?.aspectRatio]]}/>{doc.cardBriefs?.map((card,index)=><div key={card.cardId} className="space-y-2"><h4 className="break-words text-sm font-semibold">{index+1}. {card.title||'图卡'}</h4><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{card.body}</p>{card.visualBrief?<DetailRows rows={[["画面要求",card.visualBrief]]}/>:null}</div>)}{doc.imageMatchWarnings?.map((warning,index)=><p key={index} className="break-words text-sm text-warning">{warning}</p>)}</div>;
  }
  case 'project.create':{
   const brief=action.briefDetail;
   return <DetailRows rows={[["项目名称",action.title],["立项说明",action.brief],["目标受众",brief?.targetAudience],["内容目标",brief?.contentGoal],["内容形式",brief?.contentFormat],["核心信息",brief?.coreMessage],["成功标准",brief?.successCriteria],["预估时长",brief?.durationEstimate],["目标平台",(action.targetPlatforms??brief?.targetPlatforms)?.map(platformName).join('、')]]}/>;
  }
  case 'topic.create':return <DetailRows rows={[["选题标题",action.title],["创作角度",action.angle],["来源类型",{trend:'热点',benchmark:'对标',demand:'观众需求',idea:'灵感',favorites:'收藏'}[action.source]]]}/>;
  case 'topic.promote':{const topic=object(observations.candidate);return <DetailRows rows={[["立项选题",readable(topic.title)],["创作角度",readable(topic.angle)],["核心主张",object(topic.card).oneLiner as string|undefined]]}/>;}
  case 'knowledge.create':return <DetailRows rows={[["知识标题",action.title],["正文",action.note],["来源说明",action.sourceNote],["知识分类",readable(object(observations.folder).name,'未分类')]]}/>;
  case 'knowledge.folder.create':case 'radar.collection.create':return <DetailRows rows={[["分类名称",action.name],["所属分类",readable(object(observations.parent).name,'顶级分类')]]}/>;
  case 'asset.tag':return <DetailRows rows={[["标签",action.tag],["已选素材",`${action.targets.length} 个`],["素材引用",action.targets.map(row=>row.assetId).join('\n')]]}/>;
  case 'positioning.save':return <DetailRows rows={[["创作者人设",action.persona],["领域",action.field],["受众",action.audience],["差异化",action.differentiation],["能力",action.capabilities?.join('、')],["内容范围",action.facets?.contentScope],["不做的内容",action.facets?.avoid],["核心痛点",action.facets?.corePain],["核心价值",action.facets?.coreValue],["表达风格",action.facets?.tone],["当前状态",action.facets?.statusNote],["选题规则",action.downstreamRules?.topicRule],["写稿规则",action.downstreamRules?.scriptRule],["项目规则",action.downstreamRules?.projectRule],["禁止事项",action.downstreamRules?.forbidRule],["表达规则",action.downstreamRules?.expressionRule]]}/>;
  case 'group.create':return <DetailRows rows={[["新账号组名称",action.name],["采用后",'创建账号组，随后可添加平台账号']]}/>;
  case 'group.rename':return <DetailRows rows={[["原名称",readable(object(observations.group).name)],["新名称",action.name]]}/>;
  case 'account.bind.start':return <DetailRows rows={[["账号组",readable(object(observations.group).name)],["平台",platformName(action.platform)],["采用后",'预约扫码任务，完成登录后读取实际账号身份']]}/>;
  case 'publication.prepare':return <DetailRows rows={[["作品",readable(object(observations.output).title)],["发布平台",platformName(action.platform)],["目标账号",selectedTarget],["采用后",'创建发布准备记录，尚未向平台发布']]}/>;
  case 'calendar.plan':return <DetailRows rows={[["项目",readable(object(observations.project).title)],["排期日期",action.plannedDate],["目标账号",selectedTarget],["备注",action.note],["采用后",'保存创作计划，发布仍从发布中心执行']]}/>;
  case 'automation.createDraft':return <DetailRows rows={[["任务名称",action.name],["执行内容",action.prompt],["任务类型",{'topic.daily':'每日选题','self.metrics':'账号数据','comments':'评论收集'}[action.sourceKind]],["目标账号",selectedTarget],["执行计划（Cron）",action.schedule],["采用后",'保存为关闭的草稿，不立即执行']]}/>;
  case 'automation.enable':{const job=object(observations.job);return <DetailRows rows={[["任务名称",readable(job.name)],["执行内容",readable(job.prompt)],["执行计划（Cron）",readable(job.schedule)],["目标账号",selectedTarget],["调整为",action.enabled?'启用':'停用'],["采用后",action.enabled?'按原执行计划触发，不立即执行':'停止后续计划触发']]}/>;}
  case 'preferences.update':{
   const fieldNames={defaultHome:'默认首页',defaultCreationMode:'默认创作模式',defaultVisibility:'默认可见范围',autosaveEnabled:'自动保存',fileNamingRule:'文件命名规则',analyticsEnabled:'运行统计'};
   const values:Record<string,string>={home:'首页',dashboard:'首页',calendar:'创作日历',projects:'项目',guided:'引导创作',flexible:'灵活创作',freeform:'自由创作',private:'仅自己',unlisted:'不公开列出',public:'公开'};
   const format=(value:unknown)=>typeof value==='boolean'?value?'开启':'关闭':typeof value==='string'?values[value]??value:'未设置';
   const expected=object(observations.expected);
   return <DetailRows rows={Object.entries(action).filter(([key])=>key!=='kind').map(([key,value])=>[fieldNames[key as keyof typeof fieldNames],<div key={key} className="space-y-1"><p className="text-xs text-muted-foreground">之前：{format(expected[key])}</p><p>{format(value)||'清空'}</p></div>])}/>;
  }
 }
}
function CanvasPreview({document}:{document:CanvasDocument}){
 const nodes=document.nodes.slice(0,12),xs=nodes.map(n=>n.position.x),ys=nodes.map(n=>n.position.y),left=nodes.length?Math.min(...xs):0,top=nodes.length?Math.min(...ys):0,width=Math.max(180,...xs.map(x=>x-left+160)),height=Math.max(76,...ys.map(y=>y-top+76)),ids=new Set(nodes.map(n=>n.id));
 return <figure className="overflow-hidden rounded-lg border bg-surface-subtle"><svg viewBox={`${left-16} ${top-16} ${width+32} ${height+32}`} className="h-auto max-h-48 w-full" role="img" aria-label={`画布布局预览，${document.nodes.length}个节点`}>
  {document.edges.filter(e=>ids.has(e.source)&&ids.has(e.target)).map(e=>{const a=nodes.find(n=>n.id===e.source)!,b=nodes.find(n=>n.id===e.target)!;return <line key={e.id} x1={a.position.x+150} y1={a.position.y+38} x2={b.position.x} y2={b.position.y+38} stroke="var(--primary)" strokeWidth="2" opacity=".45"/>;})}
  {nodes.map(n=><g key={n.id} transform={`translate(${n.position.x},${n.position.y})`}><rect width="160" height="76" rx="10" fill="var(--card)" stroke="var(--border)"/><text x="14" y="29" fontSize="16" fill="var(--foreground)">{n.label.slice(0,8)||'未命名节点'}</text><text x="14" y="54" fontSize="14" fill="var(--muted-foreground)">{n.type==='text'?'文字节点':n.type==='image_generation'?'图片生成':n.type==='video_generation'?'视频生成':n.type==='image'?'图片素材':'视频素材'}</text></g>)}
 </svg><figcaption className="border-t px-3 py-2 text-xs text-muted-foreground">布局预览{document.nodes.length>12?' · 首屏展示12个节点，展开查看全部内容':''}</figcaption></figure>;
}
function destination(candidate:Candidate,receipt:Receipt){
 const result=object(receipt.result);
 if(candidate.kind==='canvas.create.proposal')return typeof result.id==='string'?{href:`/canvases/${encodeURIComponent(result.id)}`,label:'打开创作画布'}:null;
 if(candidate.kind==='canvas.generate.proposal')return {href:`/canvases/${encodeURIComponent(candidate.snapshot.canvasId)}`,label:'打开原画布'};
 const action=candidate.request.action;
 if(action.kind==='project.create'||action.kind==='topic.promote'){const id=action.kind==='project.create'?result.id:result.projectId;return typeof id==='string'?{href:`/projects/${encodeURIComponent(id)}`,label:'打开项目'}:null;}
 const route=action.kind==='topic.create'?'/topics':action.kind.startsWith('knowledge.')?'/knowledge':action.kind.startsWith('group.')||action.kind==='account.bind.start'?'/accounts':action.kind.startsWith('automation.')?'/automations':action.kind==='positioning.save'?'/positioning':action.kind==='preferences.update'?'/settings':action.kind==='radar.collection.create'?'/intelligence':action.kind==='asset.tag'?'/assets':action.kind==='publication.prepare'?'/publishing':action.kind==='calendar.plan'?'/calendar':'/projects';
 return {href:route,label:'查看保存结果'};
}
async function freshResult(client:CreationClient,candidate:Candidate,receipt:Receipt,scope:CreationScope):Promise<unknown>{
 const result=object(receipt.result),empty={query:undefined,body:undefined};
 if(candidate.kind==='canvas.create.proposal'){if(typeof result.id!=='string')throw Error('画布回执缺少真实身份');return client.getCanvas({...empty,params:{canvasId:result.id}});}
 if(candidate.kind==='canvas.generate.proposal'){return client.getCanvasGenerationMaterial({...empty,params:{canvasId:candidate.snapshot.canvasId,generationLinkId:String(result.id)}});}
 const action=candidate.request.action;
 switch(action.kind){
  case 'project.create':return client.getProject({...empty,params:{projectId:String(result.id)}});
  case 'topic.create':return client.getCandidate({...empty,params:{candidateId:String(result.id)}});
  case 'topic.promote':return client.getProject({...empty,params:{projectId:String(result.projectId)}});
  case 'script.patch':return client.getArtifact({...empty,params:{artifactId:action.artifactId}});
  case 'article.save':return client.getArticleVersion({...empty,params:{outputId:action.outputId,versionId:String(result.versionId)}});
  case 'graphic.save':return client.getGraphicPostVersion({...empty,params:{outputId:action.outputId,versionId:String(result.versionId)}});
  case 'knowledge.create':return client.getKnowledge({...empty,params:{knowledgeId:String(result.id)}});
  case 'group.create':case 'group.rename':return client.getAccountGroup({...empty,params:{groupId:String(result.id)}});
  case 'automation.createDraft':case 'automation.enable':return client.getScheduledJob({...empty,params:{jobId:String(result.id)}});
  case 'account.bind.start':return client.getAccountBinding({...empty,params:{runId:String(result.runId)}});
  case 'publication.prepare':return client.getPublication({...empty,params:{publicationId:String(result.id)}});
  case 'positioning.save':return client.getProfile({...empty,params:undefined});
  case 'preferences.update':return client.getPreferences({...empty,params:undefined});
  case 'knowledge.folder.create':return client.listKnowledgeFolders({...empty,params:undefined});
  case 'asset.tag':return Promise.all(action.targets.map(target=>client.getAsset({...empty,params:{assetId:target.assetId}})));
  case 'calendar.plan':{
   if(!scope.groupId||typeof result.id!=='string')throw Error('排期回执缺少原工作区或身份');
   for(let page=1;;page++){
    const rows=ENDPOINTS.listGroupCalendar.response.array().parse(await client.listGroupCalendar({params:{groupId:scope.groupId},query:{from:`${action.plannedDate}T00:00:00.000Z`,to:`${action.plannedDate}T23:59:59.999Z`,pageSize:50,page},body:undefined}));
    const saved=rows.find(row=>row.id===result.id);if(saved)return saved;if(rows.length<50)throw Error('原排期暂不可读取，请回到创作日历核对');
   }
  }
  case 'radar.collection.create':return client.getIntelligenceWorkspace({...empty,params:undefined,query:{}});
 }
}
export function ChatSystemActionCard({result,scope,operations,onReviewCandidate}:{result:unknown;scope?:CreationScope|null;operations?:CreationWorkspace;onReviewCandidate?:(request:string)=>void}){
 const candidate=React.useMemo(()=>parseCandidate(result),[result]),identity=candidate?JSON.stringify(candidate.source):'invalid';
 const workspace=React.useMemo(()=>operations??(scope?createCreationWorkspace(scope):null),[operations,scope?.groupId,scope?.accountId]);
 React.useEffect(()=>{if(operations||!workspace)return;workspace.activate();return()=>workspace.dispose();},[workspace,operations]);
 if(!candidate)return <p role="alert" className="mt-2 text-sm text-destructive">候选来源或内容不完整，请让助手重新读取当前对象。</p>;
 return <ActionCard key={`${identity}:${scope?.groupId}:${scope?.accountId}`} candidate={candidate} workspace={workspace} onReviewCandidate={onReviewCandidate}/>;
}
function ActionCard({candidate,workspace,onReviewCandidate}:{candidate:Candidate;workspace:CreationWorkspace|null;onReviewCandidate?:(request:string)=>void}){
 const editor=useDraftChatRequest(),currentScope=useCreationScope(),[editorNotice,setEditorNotice]=React.useState('');
 const view=caption(candidate),generation=candidate.kind==='canvas.generate.proposal',canvas=candidate.kind==='canvas.create.proposal',Icon=generation?ImageIcon:canvas?LayoutTemplate:Sparkles;
 const [receipt,setReceipt]=React.useState<Receipt|null>(null),[phase,setPhase]=React.useState<'checking'|'ready'|'saving'|'unknown'|'conflict'|'adopted'>('checking'),[error,setError]=React.useState(''),[expanded,setExpanded]=React.useState(false),[readback,setReadback]=React.useState<unknown>(null),[resultError,setResultError]=React.useState(''),[taskStatus,setTaskStatus]=React.useState(''),[mediaUrl,setMediaUrl]=React.useState(''),[observing,setObserving]=React.useState(false);
 const observeRef=React.useRef<(()=>Promise<void>)|null>(null);
 const statusRef=React.useRef<HTMLDivElement|null>(null),focusAfterOperation=React.useRef<Element|null>(null);
 const live=React.useRef(true),flight=React.useRef(false),source=candidate.source;
 React.useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 React.useEffect(()=>{
  if(observing||!['adopted','unknown','conflict','ready'].includes(phase)||!focusAfterOperation.current)return;
  const previous=focusAfterOperation.current;focusAfterOperation.current=null;
  if(document.activeElement===previous||document.activeElement===document.body)statusRef.current?.focus();
 },[phase,observing]);
 async function readSaved(restoreFocus=false,preserveConflict=false){
  if(!workspace||flight.current)return;const previousError=error;if(restoreFocus)focusAfterOperation.current=document.activeElement;flight.current=true;setError('');setPhase('checking');
  try{const op=workspace.capture(),saved=await op.client.getAssistantActionReceipt({params:undefined,query:source,body:undefined});op.assertCurrent();if(!live.current)return;
   if(saved.receipt){const value=assistantAdoptionReceiptSchema.parse(saved.receipt);if(JSON.stringify(value.source)!==JSON.stringify(source))throw Error('原回执与候选来源不符');setReceipt(value);setPhase('adopted');
    if(candidate.kind==='system.action.proposal'&&['article.save','graphic.save'].includes(candidate.request.action.kind)){
     try{const restored=await adoptAssistantDocumentThroughEditor({candidate,client:op.client,assertCurrent:op.assertCurrent,sourceScope:workspace.scope,currentScope,editor,receipt:value});if(live.current&&restored.adoption?.status==='saved-not-synced')setEditorNotice(restored.adoption.message??'已保存，当前输入保留，请核对原作品。');}
     catch(reason){if(live.current)setEditorNotice(`原采用结果已保存；${message(reason)}`);}
    }
   }
   else{setPhase(preserveConflict?'conflict':'ready');setError(preserveConflict?previousError:'');}
  }catch(reason){if(live.current){setPhase('unknown');setError(message(reason));}}finally{flight.current=false;}
 }
 React.useEffect(()=>{void readSaved();},[workspace]);
 async function adopt(){
  if(!workspace||flight.current||phase!=='ready')return;focusAfterOperation.current=document.activeElement;flight.current=true;setPhase('saving');setError('');
  try{const op=workspace.capture(),args={params:undefined,query:undefined,body:source};
   let value:Receipt;
   if(candidate.kind==='system.action.proposal'&&['article.save','graphic.save'].includes(candidate.request.action.kind)){
    const saved=await adoptAssistantDocumentThroughEditor({candidate,client:op.client,assertCurrent:op.assertCurrent,sourceScope:workspace.scope,currentScope,editor});value=saved.receipt;
    if(live.current&&saved.adoption?.status==='saved-not-synced')setEditorNotice(saved.adoption.message??'已保存，当前输入保留，请核对原作品。');
   }else value=assistantAdoptionReceiptSchema.parse(await (canvas?op.client.adoptCanvasCreate(args):generation?op.client.confirmCanvasGeneration({params:{canvasId:candidate.snapshot.canvasId,nodeId:candidate.request.nodeId},query:undefined,body:source}):op.client.adoptAssistantAction(args)));
   op.assertCurrent();if(!live.current)return;if(JSON.stringify(value.source)!==JSON.stringify(source))throw Error('原回执与候选来源不符');setReceipt(value);setPhase('adopted');
  }catch(reason){if(live.current){const local=reason instanceof EditorCandidateConflictError,known=local||reason instanceof HttpTransportError&&[400,401,403,404,409,422,428].includes(reason.status);setPhase(known?'conflict':'unknown');setError(!local&&known&&reason instanceof HttpTransportError?adoptionFailure(reason):message(reason));}}finally{flight.current=false;}
 }
 function prepareReview(){
  if(!workspace||!onReviewCandidate)return;
  try{workspace.capture().assertCurrent();onReviewCandidate(`请重新核对「${view.name}」这条「${view.title}」候选：先读取当前真实对象、素材和版本，再按原创作要求提出新候选供我确认。保留已有内容，不重复提交原采用或生成请求。`);}
  catch(reason){setError(message(reason));}
 }
 async function refreshResult(){focusAfterOperation.current=document.activeElement;await observeRef.current?.();}
 React.useEffect(()=>{
  if(!workspace||!receipt)return;
  const selectedWorkspace=workspace,savedReceipt=receipt;
  let alive=true,timer:ReturnType<typeof setTimeout>|undefined,inFlight=false;
  async function observe(){if(inFlight||!alive)return;inFlight=true;setObserving(true);
   try{const op=selectedWorkspace.capture(),value=await freshResult(op.client,candidate,savedReceipt,selectedWorkspace.scope);op.assertCurrent();if(!alive||!live.current)return;
    if(generation){const selected=canvasMaterialSelectionResource.parse(value),link=object(savedReceipt.result);
      const origin=selected.status==='available'?selected.origin:selected;
      if(origin.canvasId!==candidate.snapshot.canvasId||origin.nodeId!==candidate.request.nodeId||origin.generationLinkId!==link.id||origin.taskId!==link.taskId||origin.inputDigest!==candidate.snapshot.inputDigest||origin.inputRevision!==candidate.snapshot.inputRevision||origin.attemptId!==link.attemptId)throw Error('产物与原生成任务不符');
      if(typeof link.taskId==='string'){
       const task=await op.client.getTask({params:{taskId:link.taskId},query:undefined,body:undefined});op.assertCurrent();if(!alive||!live.current)return;
       if(task.id!==link.taskId||task.taskType!=='asset.generate'||selected.status==='available'&&task.executionTaskId!==selected.origin.executionTaskId)throw Error('产物与原任务归属证明不符');
       setTaskStatus(task.runtimeStatus??task.status);
       if(selected.status==='available'){
        const file=await op.client.getAssetFileDownloadUrl({params:{assetId:selected.file.assetId,assetFileId:selected.file.assetFileId},query:undefined,body:undefined});op.assertCurrent();if(!alive||!live.current)return;setMediaUrl(file.url);
       }
       if(selected.status==='not_ready'&&!['succeeded','failed','cancelled','unknown_result','blocked','waiting_user','paused','partial'].includes(task.runtimeStatus??task.status))timer=setTimeout(()=>void observe(),3000);
      }
    }
    setReadback(value);setResultError('');
   }catch(reason){if(alive&&live.current){setReadback(null);setMediaUrl('');setResultError(message(reason));}}finally{inFlight=false;if(alive&&live.current)setObserving(false);}
  }
  observeRef.current=observe;void observe();return()=>{alive=false;observeRef.current=null;if(timer)clearTimeout(timer);};
 },[workspace,receipt]);
 const link=receipt?destination(candidate,receipt):null,selected=generation&&readback?canvasMaterialSelectionResource.safeParse(readback):null;
 const generationProblem=({failed:'原生成任务失败',cancelled:'原生成任务已取消',unknown_result:'原生成结果待核对',blocked:'原生成任务受阻',waiting_user:'原生成任务需要处理',paused:'原生成任务已暂停',partial:'原生成任务部分完成'} as Record<string,string>)[taskStatus];
 const available=selected?.success&&selected.data.status==='available'?selected.data:null;
 const generationStatus=generationProblem??(available?`${available.assetType==='image'?'图片':'视频'}已生成${available.phase==='confirmed'?'并保留':'，待确认保留'}`:({queued:'生成排队中',running:'正在生成'} as Record<string,string>)[taskStatus]??'生成任务已接受');
 const status=phase==='adopted'?(generation?generationStatus:receipt?.status==='accepted'?'原任务已接受':'已采用并保存'):phase==='saving'?'正在保存':phase==='checking'?'核对原回执':phase==='unknown'?'需要核对原操作':phase==='conflict'?'需要重新核对候选':'候选待采用';
 const problem=phase==='unknown'||phase==='conflict'||phase==='adopted'&&generation&&!!generationProblem;
 const complete=phase==='adopted'&&(!generation||available)&&!problem;
 const busy=phase==='saving'||phase==='checking'||phase==='adopted'&&generation&&['queued','running'].includes(taskStatus);
 return <section aria-label={view.title} className="mt-3 overflow-hidden rounded-xl border bg-card shadow-sm">
  <div className="flex items-start gap-3 border-b bg-surface-subtle/60 p-4"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" aria-hidden="true"/></span><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{view.title}</p><h3 className="mt-1 break-words text-sm font-semibold leading-relaxed">{view.name}</h3></div></div>
  <div className="space-y-3 p-4">{view.impact?<p className="break-words text-xs leading-relaxed text-muted-foreground">{view.impact}</p>:null}{canvas?<CanvasPreview document={candidate.document}/>:null}<p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{view.body}</p>
   {generation&&candidate.snapshot.inputData.referenceAssetId?<p className="text-xs text-muted-foreground">使用节点中已选的原参考图片；文件变化后需要重新确认。</p>:null}
   <Button variant="ghost" className="h-auto justify-start px-0 text-xs text-muted-foreground" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}><ChevronDown className={`size-3.5 ${expanded?'rotate-180':''}`} aria-hidden="true"/>{expanded?'收起候选详情':'展开候选详情'}</Button>
   {expanded?<div role="region" aria-label="候选详情" tabIndex={0} className="max-h-80 overflow-auto rounded-lg border bg-surface-subtle p-3 text-xs leading-relaxed outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring">{canvas?candidate.document.nodes.map(node=><div key={node.id} className="mb-3"><p className="font-medium">{node.label||'未命名节点'}</p><p className="whitespace-pre-wrap break-words">{node.type==='text'?node.text:'prompt' in node?node.prompt:'使用已选媒体'}</p></div>):generation?<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2"><dt className="text-muted-foreground">生成方式</dt><dd>{{text_to_image:'文字生成图片',image_to_image:'参考图生成图片',text_to_video:'文字生成视频',image_to_video:'参考图生成视频'}[candidate.snapshot.inputData.mode]}</dd><dt className="text-muted-foreground">画面比例</dt><dd>{candidate.snapshot.inputData.aspectRatio??'模型默认比例'}</dd>{candidate.snapshot.inputData.resolution?<><dt className="text-muted-foreground">分辨率</dt><dd>{candidate.snapshot.inputData.resolution}</dd></>:null}{candidate.snapshot.inputData.durationSec?<><dt className="text-muted-foreground">时长</dt><dd>{candidate.snapshot.inputData.durationSec} 秒</dd></>:null}<dt className="text-muted-foreground">参考图片</dt><dd>{candidate.snapshot.inputData.referenceAssetId?'使用原节点中已选的图片':'未使用'}</dd></dl>:<ActionDetails candidate={candidate}/>}</div>:null}
   <div ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className={`flex items-start gap-2 rounded text-xs outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring ${problem?'text-warning':complete?'text-success':'text-muted-foreground'}`}>{problem?<TriangleAlert className="size-4 shrink-0" aria-hidden="true"/>:complete?<CheckCircle2 className="size-4 shrink-0" aria-hidden="true"/>:busy?<Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true"/>:null}<span>{workspace?status:'来源范围尚不可读取，请回到提出候选的会话和账号核对。'}</span></div>
   {error?<p role="alert" className="break-words text-xs leading-relaxed text-destructive">{error}{phase==='unknown'?' · 请先核对原回执，避免重复操作。':''}</p>:null}
   {resultError?<p role="alert" className="break-words text-xs leading-relaxed text-muted-foreground">已保留原采用回执；当前结果读取失败。{resultError}</p>:null}
   {editorNotice?<p className="break-words text-xs leading-relaxed text-warning">{editorNotice}</p>:null}
   {selected?.success&&selected.data.status!=='available'?<p className="break-words text-xs leading-relaxed">{selected.data.reason}</p>:null}
   {mediaUrl&&selected?.success&&selected.data.status==='available'?<figure className="overflow-hidden rounded-lg border bg-surface-subtle">{selected.data.assetType==='image'?<img src={mediaUrl} alt={`原生成结果：${selected.data.name}`} className="max-h-64 w-full object-contain"/>:<video src={mediaUrl} aria-label={`原生成结果：${selected.data.name}`} controls playsInline className="max-h-64 w-full"/>}<figcaption className="border-t px-3 py-2 text-xs text-muted-foreground">{selected.data.name} · {generationProblem?'原文件仍可查看，请到原画布核对任务':selected.data.phase==='confirmed'?'可在画布继续使用':'在原画布确认保留后可继续使用'}</figcaption></figure>:null}
   <div className="flex flex-wrap items-center gap-2">{phase==='ready'||phase==='saving'?<Button disabled={phase==='saving'} onClick={()=>void adopt()}>{generation?'确认生成':canvas?'采用并创建画布':'采用此改动'}</Button>:null}{(phase==='unknown'||phase==='conflict')&&workspace?<Button variant="outline" onClick={()=>void readSaved(true,phase==='conflict')}><RefreshCw aria-hidden="true"/>核对原操作</Button>:null}{phase==='conflict'&&workspace&&onReviewCandidate?<Button variant="outline" onClick={prepareReview}><RefreshCw aria-hidden="true"/>准备重新核对</Button>:null}{link?<Button variant={phase==='adopted'?'default':'outline'} asChild><Link href={link.href}>{link.label}</Link></Button>:null}{phase==='adopted'&&(generation||resultError)?<Button variant="outline" disabled={observing} onClick={()=>void refreshResult()}><RefreshCw aria-hidden="true"/>刷新原结果</Button>:null}</div>
  </div>
 </section>;
}
