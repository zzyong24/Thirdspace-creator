import {createHash,randomUUID} from 'node:crypto';
import type {Page,Request} from '@playwright/test';
import {ENDPOINTS,articleAssistedVersionBody,workCandidateSourceResult} from '@creatoros/contract';
import {test,expect} from '../helpers/test-environment';

// 真实公共 UI 与原任务来源。静态列表/框架成功不代替官方模型 ledger 独立核验。
// 外层保留完整串行请求、UI 操作、有限观察及清理余量；运行器仍需覆盖两例及服务启动。
const requestMs=120_000,caseMs=18_000_000;
const fresh=(prefix:string)=>`${prefix}-${randomUUID()}`;
type Input={params?:unknown;query?:unknown;body?:unknown};
async function dispatch<T>(page:Page,id:string,input:Input,groupId?:string):Promise<T>{
 const response=await page.request.post('/api/v1/dispatch',{timeout:requestMs,
  headers:{'content-type':'application/json',...(groupId?{'x-group-id':groupId}:{})},data:{id,input}});
 expect(response.ok(),`${id} ${response.status()}: ${await response.text()}`).toBe(true);
 return (await response.json() as {data:T}).data;
}
function dispatched(request:Request){
 return request.url().endsWith('/api/v1/dispatch')&&request.method()==='POST'
  ?request.postDataJSON() as {id:string;input:Input}:null;
}
for(const viewport of [{width:1366,height:900},{width:390,height:900}]){
 test(`T1097 公共文章编导：明确资料→原候选→保护元信息采纳 ${viewport.width}`,async({page,baseURL},info)=>{
  test.setTimeout(caseMs);page.setDefaultTimeout(requestMs);page.setDefaultNavigationTimeout(requestMs);
  await page.setViewportSize(viewport);await page.goto('/');
  const group=await dispatch<{id:string}>(page,'accountGroups.create',{body:{name:fresh('T1097独立组'),idempotencyKey:fresh('group')}});
  const groupId=group.id;
  const preference=await dispatch<{assistantExecutionEngine:string}>(page,'settings.preferences.patch',{body:{assistantExecutionEngine:'codex'}},groupId);
  expect(preference.assistantExecutionEngine).toBe('codex');
  const models=await dispatch<Array<{capability:string;hasSecret:boolean;provider:string;modelName:string;secretReference:string;baseUrl:string|null}>>(page,'settings.models.list',{},groupId);
  expect(models.map(model=>model.capability).sort()).toEqual(['copilot.assist','copy.generate','planning.contract','planning.outline','research.analyze','review.insights','script.rewrite'].sort());
  expect(models.every(model=>!model.hasSecret&&!model.provider.trim()&&!model.modelName.trim()&&!model.secretReference.trim()&&!model.baseUrl?.trim()),'允许空默认DTO；本轮不可使用独立供应商配置').toBe(true);
  const project=await dispatch<{id:string}>(page,'projects.create',{body:{title:fresh('T1097资料审读'),brief:'真实公共编导资料选择',contentType:'article'}},groupId);
  const output=await dispatch<{id:string}>(page,'projects.outputs.create',{params:{projectId:project.id},body:{title:'审读文章',contentType:'article',clientRequestId:fresh('output')}},groupId);
  const initial=ENDPOINTS.getArticle.response.parse(await dispatch(page,ENDPOINTS.getArticle.id,{params:{outputId:output.id}},groupId));
  const document={...initial.current,title:'保留人工标题',summary:'保留人工摘要',tags:['人工标签'],
   sections:[{sectionId:'t1097-body',order:0,heading:'原段落标题',headingLevel:2,body:'这段正文由用户写入，请保留完整正文。',sourceRefs:[]}],
   factItems:[{id:'t1097-fact',text:'这是用户已确认的原事实。',sourceRefs:[],reviewState:'confirmed' as const}]};
  await dispatch(page,ENDPOINTS.createArticleVersion.id,{params:{outputId:output.id},body:{expectedCurrentVersionId:initial.currentVersionId,document,clientRequestId:fresh('manual')}},groupId);
  const base=ENDPOINTS.getArticle.response.parse(await dispatch(page,ENDPOINTS.getArticle.id,{params:{outputId:output.id}},groupId));
  const fileName=fresh('本次明确资料')+'.txt',bytes=Buffer.from('本次资料原文：只把段落标题改成“资料核对后的标题”。不改变用户正文、事实或作品元信息。','utf8');
  const upload=await dispatch<{uploadId:string;uploadUrl:string}>(page,'assets.uploads.create',{body:{assetType:'document',mimeType:'text/plain',fileSize:bytes.length,fileName,projectId:project.id}},groupId);
  const put=await page.request.put(upload.uploadUrl,{timeout:requestMs,headers:{'content-type':'text/plain'},data:bytes});expect(put.ok(),await put.text()).toBe(true);
  const asset=await dispatch<{id:string;currentFileId:string}>(page,'assets.uploads.complete',{params:{uploadId:upload.uploadId},body:{name:fileName}},groupId);
  await expect.poll(async()=> (await dispatch<{extractStatus:string|null}>(page,'assets.get',{params:{assetId:asset.id}},groupId)).extractStatus,{timeout:300_000}).toBe('done');
  await page.context().addCookies([{name:'creatoros_current_group',value:encodeURIComponent(groupId),url:baseURL!}]);
  await page.evaluate(id=>{localStorage.setItem('creatoros:current-group',id);localStorage.removeItem('creatoros:current-account');},groupId);
  await page.goto(`/projects/${project.id}/article?outputId=${output.id}`);
  await page.getByRole('button',{name:'AI 辅助生成与内容扩展',exact:true}).click();
  await page.getByRole('radio',{name:'中性写作方法',exact:true}).check();
  await page.getByRole('checkbox',{name:new RegExp(fileName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).check();
  if(viewport.width<800)await page.getByRole('button',{name:'打开编导',exact:true}).click();
  const rail=page.locator('[data-slot="stage-chat-rail"]');await expect(rail).toBeVisible({timeout:requestMs});
  const chatResponse=page.waitForResponse(response=>response.url().endsWith('/api/chat')&&response.request().method()==='POST',{timeout:420_000});
  await rail.getByRole('textbox',{name:'我能帮你做什么',exact:true}).fill('先通过 work.editor.read 读取本轮明确资料与原文章。然后调用 work.editor.propose，用 typed_patch 只修改 t1097-body 的 heading 为“资料核对后的标题”。保留用户正文、事实、标题、摘要和标签，不调用其他生成任务。');
  await rail.getByRole('button',{name:'提交提示给 Copilot',exact:true}).click();
  const response=await chatResponse;expect(response.status()).toBe(200);
  const sent=response.request().postDataJSON() as {chatContext:{editorTarget:{writingContext:unknown}}};
  expect(sent.chatContext.editorTarget.writingContext).toEqual({schemaVersion:1,brandProfileVersionId:null,sourceAssets:[{assetId:asset.id,assetFileId:asset.currentFileId}]});
  const conversationId=response.headers()['x-conversation-id'],sourceMessageId=response.headers()['x-source-message-id'];
  expect(conversationId).toBeTruthy();expect(sourceMessageId).toBeTruthy();
  const card=rail.locator('section[aria-label="编导编辑候选"]');await expect(card).toBeVisible({timeout:requestMs});
  await expect(card.locator('section[aria-label="本次采纳选择"]')).toBeVisible({timeout:requestMs});
  type Stored={role:string;modelMetadata:Record<string,unknown>;parts:unknown[]};
  let toolCallId='';
  await expect.poll(async()=>{
   const messages=await dispatch<Stored[]>(page,ENDPOINTS.listMessages.id,{params:{conversationId}},groupId);
   const assistant=messages.find(message=>message.role==='assistant'&&message.modelMetadata.sourceMessageId===sourceMessageId);
   const part=assistant?.parts.find(value=>{const p=value as {type?:string;state?:string};return ['tool-work.editor.propose','tool-work_editor_propose'].includes(p.type??'')&&p.state==='output-available';}) as {toolCallId?:string}|undefined;
   toolCallId=part?.toolCallId??'';return Boolean(toolCallId);
  },{timeout:300_000}).toBe(true);
  const source=workCandidateSourceResult.parse(await dispatch(page,ENDPOINTS.readWorkCandidateSource.id,{params:{conversationId},query:{sourceMessageId,toolCallId}},groupId));
  expect(source.toolName).toBe('work.editor.propose');expect(source.assistantSource.toolCallId).toBe(toolCallId);
  expect((ENDPOINTS.getArticle.response.parse(await dispatch(page,ENDPOINTS.getArticle.id,{params:{outputId:output.id}},groupId))).current).toEqual(base.current);
  for(const name of ['标题','摘要','标签'])await expect(card.getByRole('checkbox',{name:new RegExp(`采用候选${name}`)})).not.toBeChecked();
  await expect(card.getByRole('checkbox',{name:/替换为联合候选事实/})).toBeDisabled();
  await card.getByRole('button',{name:'预览改动',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'文章改动预览'});await expect(dialog).toBeVisible();
  await page.screenshot({path:info.outputPath('original-candidate-preview.png'),fullPage:true,timeout:requestMs});
  await dialog.getByRole('button',{name:'关闭',exact:true}).click();
  await expect(card.getByRole('button',{name:'采纳到当前作品',exact:true})).toBeEnabled();
  const saveRequest=page.waitForRequest(request=>dispatched(request)?.id===ENDPOINTS.createArticleVersion.id,{timeout:300_000});
  await card.getByRole('button',{name:'采纳到当前作品',exact:true}).click();
  const request=await saveRequest,adoptionBody=articleAssistedVersionBody.parse(dispatched(request)!.input.body);
  expect(adoptionBody.assistantSource).toEqual(source.assistantSource);expect(adoptionBody.fieldSelection).toEqual([]);expect(adoptionBody.factSelection).toEqual({mode:'keep'});
  expect(Object.hasOwn(dispatched(request)!.input.body as object,'document')).toBe(false);
  await expect(card.getByRole('status')).toContainText('已保存',{timeout:requestMs});
  const current=ENDPOINTS.getArticle.response.parse(await dispatch(page,ENDPOINTS.getArticle.id,{params:{outputId:output.id}},groupId));
  expect(current.currentVersionId).not.toBe(base.currentVersionId);
  for(const key of ['title','summary','tags','factItems'] as const)expect(current.current[key]).toEqual(base.current[key]);
  expect(current.current.sections[0]!.heading).toBe('资料核对后的标题');expect(current.current.sections[0]!.body).toBe(base.current.sections[0]!.body);
  const exact=ENDPOINTS.getArticleVersion.response.parse(await dispatch(page,ENDPOINTS.getArticleVersion.id,{params:{outputId:output.id,versionId:current.currentVersionId}},groupId));
  expect(exact.document).toEqual(current.current);
  await info.attach('t1097-original-source-and-adoption',{body:Buffer.from(JSON.stringify({groupId,projectId:project.id,outputId:output.id,sourceMessageId,conversationId,source:source.assistantSource,adoptionBody,versionId:current.currentVersionId,documentSha:createHash('sha256').update(JSON.stringify(exact.document)).digest('hex'),ledgerVerification:'pending_independent_original_task_call_usage_budget_readback'},null,2)),contentType:'application/json'});
 });
}
