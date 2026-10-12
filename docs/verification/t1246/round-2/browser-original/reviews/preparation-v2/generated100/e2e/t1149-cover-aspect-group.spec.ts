import type {Page, BrowserContext, Locator} from "@playwright/test";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import type {CanvasDocument,CreativeCanvasResource,VisualTemplate} from "@creatoros/contract";
import {canvasGenerationCapabilitiesResource} from "@creatoros/contract";
import {expect,test} from "../helpers/test-environment";

const dir=resolve((process.env.CREATOROS_T1246_RUN_DIR! + "/original-output/t1149")),wait={timeout:120_000};
const viewports=[{width:1366,height:900},{width:900,height:900}];
async function dispatch<T>(page:Page,id:string,input:unknown,groupId?:string):Promise<T>{
 const response=await page.request.post("/api/v1/dispatch",{...wait,headers:{"content-type":"application/json",...(groupId?{"x-group-id":groupId}:{})},data:{id,input}, timeout: 120000});
 expect(response.ok(),`${id} HTTP ${response.status()}`).toBe(true);return (await response.json()).data;
}
async function upload(page:Page,groupId:string,file:string,name:string){
 const bytes=readFileSync(resolve("public/visual-templates",file));
 const session=await dispatch<{uploadId:string;uploadUrl:string}>(page,"assets.uploads.create",{body:{assetType:"image",mimeType:"image/png",fileSize:bytes.length,fileName:name}},groupId);
 const put=await page.request.put(session.uploadUrl,{...wait,headers:{"content-type":"image/png"},data:bytes, timeout: 120000});expect(put.ok()).toBe(true);
 return dispatch<{id:string;currentFileId:string}>(page,"assets.uploads.complete",{params:{uploadId:session.uploadId},body:{name}},groupId);
}
async function setup(page:Page,context:BrowserContext,baseURL:string,ratio:"3:4"|"16:9",bothReference=false){
 const group=await dispatch<{id:string}>(page,"accountGroups.create",{body:{name:"画幅交互验收",idempotencyKey:crypto.randomUUID()}});
 const project=await dispatch<{id:string}>(page,"projects.create",{body:{title:"图文画幅验收",brief:""}},group.id);
 const reference=await upload(page,group.id,"public-person-notes.png","中性人物示意图.png"),staticImage=await upload(page,group.id,"public-person-wide.png","横版示意图.png");
 const templates=await Promise.all((["xhs","cover"] as const).map(libraryKind=>dispatch<VisualTemplate[]>(page,"assets.visualTemplates.list",{query:{libraryKind,scope:"builtin",page:1,pageSize:24}},group.id)));
 const snapshots=templates.map(list=>{const actual=list.find(t=>t.visualMode==="graphic"&&!t.requiredIdentity);expect(actual).toBeTruthy();return {id:actual!.id,name:actual!.name,version:actual!.revision,prompt:actual!.prompt,visualMode:actual!.visualMode,requiredIdentity:actual!.requiredIdentity};});
 const created=await dispatch<CreativeCanvasResource>(page,"canvas.create",{body:{title:"一组图片统一画幅",projectId:project.id}},group.id);
 const first={id:"page-one",type:"image_generation" as const,label:"第一张图片",position:{x:30,y:100},size:{width:350,height:430},prompt:"中性图片描述一",mode:"image_to_image" as const,referenceAssetId:reference.id,referenceFileId:reference.currentFileId};
 const peer={...first,id:"page-two",label:"第二张图片",position:{x:460,y:100},prompt:"中性图片描述二",aspectRatio:ratio,...(!bothReference?{mode:"text_to_image" as const,referenceAssetId:undefined,referenceFileId:undefined}:{})};
 const document:CanvasDocument={schemaVersion:1,viewport:{x:0,y:0,zoom:1},nodes:[first,peer,{id:"static-image",type:"image",label:"静态原图",position:{x:890,y:100},size:{width:380,height:300},assetId:staticImage.id,fileId:staticImage.currentFileId},{...first,id:"other-page",label:"另一组图片",position:{x:1340,y:100},aspectRatio:"16:9"}],edges:[{id:"unchanged-connection",source:first.id,target:"other-page"}],visualGroups:[{id:"picture-group",name:"统一画幅组",libraryKind:"xhs",aspectRatio:ratio,caption:"原配文",pageOrder:[first.id,peer.id,"static-image"],templateSnapshot:snapshots[0]!,generationAttempts:{}},{id:"other-group",name:"另一图片组",libraryKind:"cover",aspectRatio:"16:9",caption:"另一配文",pageOrder:["other-page"],templateSnapshot:snapshots[1]!,generationAttempts:{}}]};
 const saved=await dispatch<CreativeCanvasResource>(page,"canvas.save",{params:{canvasId:created.id},body:{expectedRevision:created.revision,title:created.title,projectId:project.id,document}},group.id);
 await context.addCookies([{name:"creatoros_current_group",value:encodeURIComponent(group.id),url:baseURL}]);await page.addInitScript(id=>{localStorage.setItem("creatoros:current-group",id);localStorage.removeItem("creatoros:current-account");},group.id);
 const get=()=>dispatch<CreativeCanvasResource>(page,"canvas.get",{params:{canvasId:created.id}},group.id);
 return {group,project,canvas:saved,reference,staticImage,get,url:"/canvases/"+created.id};
}
async function capabilities(page:Page,text:string[],image:string[]){
 let calls=0;await page.route("**/api/v1/dispatch",async route=>{
  if(route.request().postDataJSON()?.id!=="canvas.capabilities"){await route.fallback();return;}
  calls++;await route.fulfill({json:{data:canvasGenerationCapabilitiesResource.parse({modes:[{mode:"text_to_image",available:true,model:"文字能力合成样本",reason:null,aspectRatios:text},{mode:"image_to_image",available:true,model:"参考能力合成样本",reason:null,aspectRatios:image},{mode:"text_to_video",available:false,model:null,reason:"本轮不调用视频模型"},{mode:"image_to_video",available:false,model:null,reason:"本轮不调用视频模型"}]}),meta:{requestId:"declared-capability-fixture"}}});
 });return ()=>calls;
}
function node(page:Page){return page.locator('[data-testid="canvas-node"][data-node-id="page-one"]');}
async function inspector(page:Page){await node(page).click({...wait,position:{x:24,y:20}});await page.getByRole("button",{name:"编导与详情",exact:true}).click(wait);const panel=page.locator("aside").filter({has:page.getByRole("heading",{name:"节点设置",exact:true})});await panel.getByRole("combobox",{name:"画幅",exact:true}).scrollIntoViewIfNeeded(wait);return panel;}
async function capture(page:Page,panel:Locator,name:string,checkIds:string[],referenceExpected=false){
 if(referenceExpected){const img=panel.getByRole("button",{name:"参考图片",exact:true}).locator("img");await expect(img).toHaveJSProperty("naturalWidth",1086,wait);await expect(img).toHaveJSProperty("naturalHeight",1448,wait);await expect(img).toHaveJSProperty("complete",true,wait);}
 mkdirSync(resolve(dir,"screenshots"),{recursive:true});await page.screenshot({path:resolve(dir,"screenshots",name+".png"), timeout: 120000});return {name,viewport:page.viewportSize(),text:await panel.innerText(),check_ids:checkIds,referenceReady:referenceExpected?{naturalWidth:1086,naturalHeight:1448,complete:true}:null};
}
function unchanged(saved:CanvasDocument,before:CanvasDocument,ratio:string){
 expect(saved.visualGroups).toEqual(before.visualGroups!.map(group=>group.id==="picture-group"?{...group,aspectRatio:ratio}:group));
 expect(saved.nodes).toEqual(before.nodes.map(n=>n.type==="image_generation"&&["page-one","page-two"].includes(n.id)?{...n,aspectRatio:ratio}:n));expect(saved.edges).toEqual(before.edges);expect(saved.viewport).toEqual(before.viewport);
}

test("T1149 共同支持画幅同步、正式保存、刷新返回及重复修改",async({page,context,baseURL})=>{
 test.setTimeout(Math.max((900_000), 38820000));page.setDefaultTimeout(120_000);page.setDefaultNavigationTimeout(120_000);
 const caps=await capabilities(page,["3:4","16:9","21:9"],["3:4","16:9","21:9"]),s=await setup(page,context,baseURL!,"3:4"),captures=[],writes=[];
 for(const [index,vp] of viewports.entries()){
  await page.setViewportSize(vp);await page.goto(s.url,wait);const before=await s.get(),panel=await inspector(page),ratio=panel.getByRole("combobox",{name:"画幅",exact:true});
  await expect(panel.getByText(/当前模型：参考能力合成样本/)).toBeVisible(wait);expect(await ratio.locator('option[value=""]').count()).toBe(0);await expect(ratio).toHaveValue(before.document.visualGroups![0]!.aspectRatio,wait);
  captures.push(await capture(page,panel,"group-before-"+vp.width,["AC-ASPECT","AC-COPY"],true));const choice=index===0?"16:9":"3:4";await ratio.selectOption(choice,wait);await page.getByRole("button",{name:"保存",exact:true}).click(wait);await expect(page.getByText("已保存",{exact:true})).toBeVisible(wait);
  const saved=await s.get();expect(saved.revision).toBe(before.revision+1);unchanged(saved.document,before.document,choice);expect(saved.projectId).toBe(s.project.id);captures.push(await capture(page,panel,"group-after-"+vp.width,["AC-ASPECT","AC-COPY"],true));writes.push({beforeRevision:before.revision,savedRevision:saved.revision,ratio:choice,document:saved.document});
  await page.reload(wait);expect((await s.get()).document).toEqual(saved.document);await page.goto("/canvases",wait);await page.goto(s.url,wait);expect((await s.get()).document).toEqual(saved.document);expect((await s.get()).revision).toBe(saved.revision);
 }
 // 模板列表与用途展示来自正式公开读取；只声明模型能力，不替换模板或领域保存。
 await page.getByRole("button",{name:"案例库",exact:true}).click(wait);const templates=page.getByRole("complementary",{name:"案例与收藏",exact:true});
 const list=await dispatch<VisualTemplate[]>(page,"assets.visualTemplates.list",{query:{libraryKind:"cover",scope:"builtin",page:1,pageSize:24}},s.group.id);const selected=list.find(t=>t.visualMode==="graphic")!;expect(selected).toBeTruthy();await templates.getByRole("button",{name:new RegExp(selected.name)}).click(wait);
 for(const vp of viewports){await page.setViewportSize(vp);const ratio=templates.getByRole("button",{name:"21:9",exact:true});await ratio.scrollIntoViewIfNeeded(wait);await ratio.click(wait);await expect(templates.getByText(/公众号头图底稿，发布前请按平台要求裁切/)).toBeVisible(wait);await expect(templates.getByRole("button",{name:"3:4",exact:true})).toContainText("小红书");captures.push(await capture(page,templates,"template-uses-"+vp.width,["AC-COPY"]));}
 expect((await s.get()).revision).toBe(writes.at(-1)!.savedRevision);expect(caps()).toBeGreaterThan(0);mkdirSync(dir,{recursive:true});writeFileSync(resolve(dir,"aspect-public-observation.json"),JSON.stringify({surface:"browser",mode:"non-fixture",witnesses:{groupId:s.group.id,projectId:s.project.id,canvasId:s.canvas.id,reference:s.reference,staticImage:s.staticImage},capabilityFixture:true,successfulWritesReplaced:false,modelCalled:false,refresh:true,back:true,repeat:true,writes,captures},null,2));
});

test("T1149 能力禁用、两个模式入口保引用与保存失败后公开重试",async({page,context,baseURL})=>{
 test.setTimeout(Math.max((900_000), 38820000));page.setDefaultTimeout(120_000);page.setDefaultNavigationTimeout(120_000);await page.setViewportSize(viewports[0]!);
 const caps=await capabilities(page,["3:4"],["3:4","16:9"]),s=await setup(page,context,baseURL!,"16:9",true),captures=[];await page.goto(s.url,wait);const original=await s.get();const readyPanel=await inspector(page);await expect(readyPanel.getByText(/当前模型：参考能力合成样本/)).toBeVisible(wait);await page.getByRole("button",{name:"收起详情",exact:true}).click(wait);
 const mode=node(page).getByRole("combobox",{name:"生成模式",exact:true});await mode.selectOption("text_to_image",wait);await expect(mode).toHaveValue("image_to_image",wait);await expect(page.getByRole("main").getByRole("alert")).toContainText("原参考图已保留",wait);expect((await s.get()).document).toEqual(original.document);
 const panel=await inspector(page);await expect(panel.getByText(/当前模型：参考能力合成样本/)).toBeVisible(wait);const ratio=panel.getByRole("combobox",{name:"画幅",exact:true});
 // Playwright elementState follows the enclosing label.control; read the native option itself.
 const unsupportedOption=ratio.locator('option[value="1:1"]');await expect(unsupportedOption).toHaveJSProperty("disabled",true,wait);await expect(unsupportedOption).toHaveAttribute("disabled","",wait);
 await panel.getByRole("combobox",{name:"模式",exact:true}).selectOption("text_to_image",wait);await expect(panel.getByRole("combobox",{name:"模式",exact:true})).toHaveValue("image_to_image",wait);expect((await s.get()).document).toEqual(original.document);captures.push(await capture(page,panel,"mode-rejected",["AC-CAPABILITY","AC-AVAILABILITY"],true));
 await ratio.selectOption("3:4",wait);await page.getByRole("button",{name:"保存",exact:true}).click(wait);await expect(page.getByText("已保存",{exact:true})).toBeVisible(wait);const unified=await s.get();unchanged(unified.document,original.document,"3:4");
 // 一次明确503仅替换失败；随后成功保存与回读仍走真实HTTP和service。
 let injected=0;await page.route("**/api/v1/dispatch",async route=>{if(route.request().postDataJSON()?.id==="canvas.save"&&injected===0){injected++;await route.fulfill({status:503,json:{data:null,error:{code:"ServiceUnavailableError",message:"画布保存暂时失败，请重试"}}});return;}await route.fallback();});
 await panel.getByRole("combobox",{name:"模式",exact:true}).selectOption("text_to_image",wait);await page.getByRole("button",{name:"保存",exact:true}).click(wait);await expect(page.getByText("保存失败",{exact:true})).toBeVisible(wait);await expect(panel.getByRole("combobox",{name:"模式",exact:true})).toHaveValue("text_to_image",wait);expect((await s.get()).document).toEqual(unified.document);captures.push(await capture(page,panel,"save-error-keeps-input",["AC-CAPABILITY","AC-AVAILABILITY"]));
 await page.getByRole("button",{name:"保存",exact:true}).click(wait);await expect(page.getByText("已保存",{exact:true})).toBeVisible(wait);const saved=await s.get();expect(saved.revision).toBe(unified.revision+1);expect(saved.document.nodes[0]).toEqual({...unified.document.nodes[0],mode:"text_to_image",referenceAssetId:undefined,referenceFileId:undefined});expect(saved.document.nodes.slice(1)).toEqual(unified.document.nodes.slice(1));expect(saved.document.visualGroups).toEqual(unified.document.visualGroups);
 await page.reload(wait);await page.goto("/canvases",wait);await page.goto(s.url,wait);expect((await s.get()).document).toEqual(saved.document);expect(injected).toBe(1);expect(caps()).toBeGreaterThan(0);
 writeFileSync(resolve(dir,"capability-public-observation.json"),JSON.stringify({surface:"browser",mode:"non-fixture",witnesses:{groupId:s.group.id,projectId:s.project.id,canvasId:s.canvas.id,reference:s.reference},capabilityFixture:true,errorFixture:{operation:"canvas.save",count:injected,status:503,successfulWritesReplaced:false},modelCalled:false,originalRevision:original.revision,unifiedRevision:unified.revision,savedRevision:saved.revision,modeRefusalPreserved:true,refresh:true,back:true,repeat:true,captures},null,2));
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 38820000 });
