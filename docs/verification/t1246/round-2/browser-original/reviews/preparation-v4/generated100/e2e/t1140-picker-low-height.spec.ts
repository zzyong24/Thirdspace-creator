import type {Page,Locator,BrowserContext} from "@playwright/test";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {expect,test as base} from "../helpers/test-environment";
const test=base.extend<{}, {cleanupWitness:void}>({cleanupWitness:[async({browser},provide)=>{
 const diagnostic=process.env.CREATOROS_PICKER_CLEANUP_DIAG==="1";
 if(diagnostic)console.info("T1144 worker开始",JSON.stringify({at:new Date().toISOString(),pid:process.pid,browserConnected:browser.isConnected(),resources:process.getActiveResourcesInfo()}));
 await provide();
 if(diagnostic)console.info("T1144 worker测试已结束",JSON.stringify({at:new Date().toISOString(),pid:process.pid,browserConnected:browser.isConnected(),resources:process.getActiveResourcesInfo()}));
},{scope:"worker",auto:true,timeout:180000}]});
const evidence=resolve((process.env.CREATOROS_T1246_RUN_DIR! + "/original-output/t1140")),wait={timeout:120_000};
const viewports=[{width:1366,height:900},{width:1024,height:680},{width:683,height:450},{width:390,height:900},{width:390,height:450},{width:512,height:340}];
const portrait="素材预览长图-"+"portrait_".repeat(12)+".png",wide="素材预览横图.png";
type Canvas={id:string;revision:number;document:{nodes:Array<{id:string;type:string;referenceAssetId?:string;referenceFileId?:string}>}};
async function dispatch<T={id:string}>(page:Page,id:string,input:unknown,groupId?:string):Promise<T>{
 const response=await page.request.post("/api/v1/dispatch",{...wait,headers:{"content-type":"application/json",...(groupId?{"x-group-id":groupId}:{})},data:{id,input}, timeout: 120000});
 expect(response.ok(),id+" HTTP "+response.status()).toBe(true);return (await response.json() as {data:T}).data;
}
async function upload(page:Page,groupId:string,file:string,name:string){
 const bytes=readFileSync(resolve("public/visual-templates",file));
 const session=await dispatch<{uploadId:string;uploadUrl:string}>(page,"assets.uploads.create",{body:{assetType:"image",mimeType:"image/png",fileSize:bytes.length,fileName:name}},groupId);
 const put=await page.request.put(session.uploadUrl,{...wait,headers:{"content-type":"image/png"},data:bytes, timeout: 120000});expect(put.ok()).toBe(true);
 return dispatch<{id:string;currentFileId:string}>(page,"assets.uploads.complete",{params:{uploadId:session.uploadId},body:{name}},groupId);
}
async function openReference(page:Page,trigger:Locator,readFailure=false){
 // 重开同库会先显示上次items，随后200ms正式重读；等待这一次响应，避免点旧DOM后在重建中滚动。
 const read=page.waitForResponse(response=>response.request().method()==="POST"&&response.url().endsWith("/api/v1/dispatch")&&response.request().postDataJSON()?.id==="assets.search",wait);
 await trigger.click(wait);const response=await read;if(!readFailure)expect(response.ok()).toBe(true);
 const dialog=page.getByRole("dialog",{name:"参考图片",exact:true});await expect(dialog.locator("[aria-busy]")).toHaveAttribute("aria-busy","false",wait);return dialog;
}
async function setup(page:Page,context:BrowserContext,baseURL:string){
 const group=await dispatch(page,"accountGroups.create",{body:{name:"素材预览验收",idempotencyKey:crypto.randomUUID()}});
 const first=await upload(page,group.id,"public-person-notes.png",portrait),second=await upload(page,group.id,"public-person-wide.png",wide);
 const canvas=await dispatch<Canvas>(page,"canvas.create",{body:{title:"素材预览与选取",projectId:null}},group.id);
 await context.addCookies([{name:"creatoros_current_group",value:encodeURIComponent(group.id),url:baseURL}]);
 await page.addInitScript(id=>{localStorage.setItem("creatoros:current-group",id);localStorage.removeItem("creatoros:current-account");},group.id);
 await page.goto("/canvases/"+canvas.id,wait);await page.getByRole("button",{name:"＋ 图片生成",exact:true}).click(wait);
 await page.getByRole("button",{name:"编导与详情",exact:true}).click(wait);
 const inspector=page.locator("aside").filter({has:page.getByRole("heading",{name:"节点设置",exact:true})});
 await inspector.getByRole("combobox",{name:"模式",exact:true}).selectOption("image_to_image",wait);
 await expect(page.getByText("已保存",{exact:true})).toBeVisible(wait);
 const get=()=>dispatch<Canvas>(page,"canvas.get",{params:{canvasId:canvas.id}},group.id);
 return {group,first,second,canvas,inspector,get,field:inspector.getByRole("button",{name:"参考图片",exact:true})};
}
async function paint(image:Locator){
 return image.evaluate((img:HTMLImageElement)=>{
  const rect=img.getBoundingClientRect(),style=getComputedStyle(img),scale=Math.min(rect.width/img.naturalWidth,rect.height/img.naturalHeight);
  const width=img.naturalWidth*scale,height=img.naturalHeight*scale;
  const painted={left:rect.left+(rect.width-width)/2,top:rect.top+(rect.height-height)/2,right:rect.left+(rect.width+width)/2,bottom:rect.top+(rect.height+height)/2,width,height};
  const chain=[];
  for(let el=img.parentElement;el;el=el.parentElement)chain.push({el,css:getComputedStyle(el)});
  const fixedIndex=chain.findIndex(({css})=>css.position==="fixed");
  // 固定到viewport的元素跨过普通overflow祖先；存在固定包含块时仍保守核全部边界。
  const establishesFixedBlock=(css:CSSStyleDeclaration)=>[css.transform,css.translate,css.rotate,css.scale,css.perspective,css.filter,css.backdropFilter].some(value=>Boolean(value)&&value!=="none")||/(layout|paint|strict|content)/.test(css.contain)||/(transform|translate|rotate|scale|perspective|filter|contain)/.test(css.willChange)||css.containerType!=="normal"||css.contentVisibility==="auto"||css.transformStyle==="preserve-3d";
  const fixedViewport=fixedIndex>=0&&!chain.slice(fixedIndex+1).some(({css})=>establishesFixedBlock(css));
  let clip={left:0,top:0,right:innerWidth,bottom:innerHeight};const ancestors=[];
  for(const [index,{el,css}] of chain.entries()){
   const box=el.getBoundingClientRect(),escaped=fixedViewport&&index>fixedIndex,clipsX=!escaped&&/^(auto|scroll|hidden|clip)$/.test(css.overflowX),clipsY=!escaped&&/^(auto|scroll|hidden|clip)$/.test(css.overflowY);
   if(clipsX){clip.left=Math.max(clip.left,box.left+el.clientLeft);clip.right=Math.min(clip.right,box.left+el.clientLeft+el.clientWidth);}
   if(clipsY){clip.top=Math.max(clip.top,box.top+el.clientTop);clip.bottom=Math.min(clip.bottom,box.top+el.clientTop+el.clientHeight);}
   ancestors.push({tag:el.tagName,position:css.position,overflowX:css.overflowX,overflowY:css.overflowY,escaped,establishesFixedBlock:establishesFixedBlock(css),transform:css.transform,translate:css.translate,rotate:css.rotate,scale:css.scale,perspective:css.perspective,filter:css.filter,backdropFilter:css.backdropFilter,contain:css.contain,willChange:css.willChange,containerType:css.containerType,contentVisibility:css.contentVisibility,top:box.top,height:box.height,clientHeight:el.clientHeight,scrollHeight:el.scrollHeight});
  }
  return {loaded:img.complete&&img.naturalWidth>0,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,objectFit:style.objectFit,painted,clip,fixedViewport,ancestors,whole:img.complete&&width>0&&height>0&&painted.left>=clip.left-1&&painted.top>=clip.top-1&&painted.right<=clip.right+1&&painted.bottom<=clip.bottom+1};
 });
}
async function whole(image:Locator){
 let observed;
 try{await expect.poll(async()=>{observed=await paint(image);return observed.loaded&&observed.objectFit==="contain"&&observed.whole;},wait).toBe(true);}
 catch(error){mkdirSync(evidence,{recursive:true});writeFileSync(resolve(evidence,"failed-paint-observation.json"),JSON.stringify({at:new Date().toISOString(),viewport:image.page().viewportSize(),observed},null,2));throw error;}
 return paint(image);
}
async function boundaries(dialog:Locator){
 return dialog.evaluate(node=>{
  const box=node.getBoundingClientRect();const buttons=Array.from(node.querySelectorAll("button")).filter(el=>["取消","使用此素材"].includes(el.textContent?.trim()??"")).map(el=>{const r=el.getBoundingClientRect();return {text:el.textContent?.trim(),top:r.top,bottom:r.bottom,left:r.left,right:r.right};});
  const title=node.querySelector('[data-slot="dialog-title"]')?.getBoundingClientRect();
  const scrollOwners=Array.from(node.querySelectorAll("*")).filter(el=>/^(auto|scroll)$/.test(getComputedStyle(el).overflowY));
  const scrolls=scrollOwners.filter(el=>el.scrollHeight>el.clientHeight+1).map(el=>({tag:el.tagName,top:el.getBoundingClientRect().top,clientHeight:el.clientHeight,scrollHeight:el.scrollHeight}));
  return {box:{left:box.left,right:box.right,top:box.top,bottom:box.bottom},viewport:{width:innerWidth,height:innerHeight},buttons,scrollOwnerCount:scrollOwners.length,title:title?{top:title.top,bottom:title.bottom}:null,scrolls,inside:box.left>=15&&box.right<=innerWidth-15&&buttons.length===2&&buttons.every(r=>r.top>=box.top&&r.bottom<=box.bottom)};
 });
}
async function capture(page:Page,dialog:Locator,name:string,details:unknown={}){
 mkdirSync(resolve(evidence,"screenshots"),{recursive:true});await page.screenshot({path:resolve(evidence,"screenshots",name+".png"), timeout: 120000});
 return {name,url:page.url(),viewport:page.viewportSize(),text:await dialog.innerText(),boundaries:await boundaries(dialog),details};
}

test("T-1140 六种窗口完整预览、统一滚动、搜索与取消不写",async({page,context,baseURL})=>{
 test.setTimeout(Math.max((1_200_000), 100260000));page.setDefaultTimeout(120_000);page.setDefaultNavigationTimeout(120_000);
 await page.setViewportSize(viewports[0]!);const s=await setup(page,context,baseURL!);const before=await s.get(),captures=[];
 for(const vp of viewports){
  await page.setViewportSize(vp);const dialog=await openReference(page,s.field);
  const thumb=dialog.getByRole("button",{name:"预览 "+portrait,exact:true});await thumb.click(wait);
  const large=dialog.getByAltText("画布图片素材",{exact:true});
  await expect.poll(async()=> (await boundaries(dialog)).inside,wait).toBe(true);
  let thumbnail;
  if(vp.width>=640){thumbnail=await whole(thumb.getByRole("img"));await whole(large);}
  else{await thumb.scrollIntoViewIfNeeded(wait);thumbnail=await whole(thumb.getByRole("img"));await large.scrollIntoViewIfNeeded(wait);await whole(large);}
  const geometry=await boundaries(dialog);expect(geometry.title).not.toBeNull();expect(geometry.title!.top).toBeGreaterThanOrEqual(geometry.box.top);
  if(vp.width<640||vp.height<=480){expect(geometry.scrollOwnerCount).toBe(1);expect(geometry.scrolls.length).toBeLessThanOrEqual(1);}
  captures.push(await capture(page,dialog,"portrait-"+vp.width+"x"+vp.height,{thumbnail,preview:await paint(large)}));
  const other=dialog.getByRole("button",{name:"预览 "+wide,exact:true});await other.click(wait);await expect(large).toHaveJSProperty("naturalWidth",1672,wait);
  if(vp.width<640)await large.scrollIntoViewIfNeeded(wait);await whole(large);
  captures.push(await capture(page,dialog,"landscape-"+vp.width+"x"+vp.height,{preview:await paint(large)}));
  const search=dialog.getByRole("textbox",{name:"搜索素材",exact:true});await search.fill("没有这件素材",wait);
  await expect(dialog.getByText("没有找到匹配素材",{exact:true})).toBeVisible(wait);await expect(search).toBeFocused(wait);
  await search.fill("长图",wait);await expect(thumb).toBeVisible(wait);await search.fill("",wait);
  await expect(dialog.getByRole("button",{name:"预览 "+wide,exact:true})).toBeVisible(wait);
  await dialog.getByRole("group",{name:"筛选素材类型",exact:true}).getByRole("button",{name:"图片",exact:true}).click(wait);
  await expect(thumb).toBeVisible(wait);await page.keyboard.press("Escape");await expect(dialog).toBeHidden(wait);await expect(s.field).toBeFocused(wait);
  const after=await s.get();expect(after.revision).toBe(before.revision);expect(after.document).toEqual(before.document);
 }
 writeFileSync(resolve(evidence,"layout-observation.json"),JSON.stringify({surface:"browser",mode:"non-fixture",witnesses:{groupId:s.group.id,canvasId:s.canvas.id,assets:[s.first,s.second]},cancelBeforeRevision:before.revision,cancelUnchanged:true,modelCalled:false,viewports,captures},null,2));
});

test("T-1140 精确选用、正式回读、刷新返回与原gallery流程",async({page,context,baseURL})=>{
 test.setTimeout(Math.max((900_000), 100260000));page.setDefaultTimeout(120_000);page.setDefaultNavigationTimeout(120_000);
 await page.setViewportSize({width:1024,height:680});const s=await setup(page,context,baseURL!),before=await s.get(),captures=[];
 let dialog=await openReference(page,s.field);
 await dialog.getByRole("button",{name:"预览 "+wide,exact:true}).click(wait);await whole(dialog.getByAltText("画布图片素材",{exact:true}));
 captures.push(await capture(page,dialog,"exact-before-confirm"));await dialog.getByRole("button",{name:"使用此素材",exact:true}).click(wait);await expect(dialog).toBeHidden(wait);
 await expect(page.getByText("已保存",{exact:true})).toBeVisible(wait);
 await expect.poll(async()=>{const current=await s.get();return current.document.nodes.some(n=>n.referenceAssetId===s.second.id&&n.referenceFileId===s.second.currentFileId);},wait).toBe(true);
 const saved=await s.get();expect(saved.revision).toBeGreaterThan(before.revision);const node=saved.document.nodes.find(n=>n.type==="image_generation")!;
 expect(node).toMatchObject({referenceAssetId:s.second.id,referenceFileId:s.second.currentFileId});
 await page.reload(wait);expect((await s.get()).document).toEqual(saved.document);await page.goto("/canvases",wait);await page.goto("/canvases/"+s.canvas.id,wait);
 expect((await s.get()).document).toEqual(saved.document);
 for(const vp of viewports){
  await page.setViewportSize(vp);await page.getByRole("button",{name:"素材库",exact:true}).click(wait);const gallery=page.getByRole("complementary",{name:"当前账号素材",exact:true});
  const thumb=gallery.getByRole("button",{name:"预览 "+wide,exact:true});await thumb.click(wait);const preview=gallery.getByRole("complementary",{name:"素材预览",exact:true});
  const positions=await gallery.evaluate(node=>{const filters=node.querySelector('[aria-label="筛选素材类型"]')!,card=node.querySelector('[aria-label="预览 素材预览横图.png"]')!.parentElement!,preview=node.querySelector('[aria-label="素材预览"]')!;const box=(el:Element)=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};return {filters:box(filters),card:box(card),preview:box(preview)};});
  expect(positions.card.top).toBeGreaterThanOrEqual(positions.filters.bottom-1);expect(positions.preview.top).toBeGreaterThanOrEqual(positions.card.bottom-1);
  await preview.getByAltText("画布图片素材",{exact:true}).scrollIntoViewIfNeeded(wait);await whole(preview.getByAltText("画布图片素材",{exact:true}));
  captures.push(await capture(page,gallery,"gallery-preview-"+vp.width+"x"+vp.height,{positions,preview:await paint(preview.getByAltText("画布图片素材",{exact:true}))}));
  await preview.getByRole("button",{name:"关闭预览",exact:true}).click(wait);await expect(preview).toBeHidden(wait);
  await thumb.scrollIntoViewIfNeeded(wait);await whole(thumb.getByRole("img"));await gallery.getByRole("button",{name:"关闭素材库",exact:true}).click(wait);
  expect((await s.get()).document).toEqual(saved.document);expect((await s.get()).revision).toBe(saved.revision);
 }
 await page.setViewportSize({width:1024,height:680});
 // 显式一次读取失败，只替换失败响应；重试的成功读取仍走正式HTTP。
 // 刷新后的节点由画布原卡片点击选中，不直接修改React状态。
 await page.getByTestId("canvas-node").filter({has:page.getByRole("textbox",{name:"生成描述",exact:true})}).click({...wait,position:{x:24,y:20}});
 await page.getByRole("button",{name:"编导与详情",exact:true}).click(wait);
 const inspector=page.locator("aside").filter({has:page.getByRole("heading",{name:"节点设置",exact:true})});
 let injected=0;await page.route("**/api/v1/dispatch",async route=>{if(route.request().postDataJSON()?.id==="assets.search"&&injected===0){injected++;await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({data:null,error:{code:"ServiceUnavailableError",message:"素材读取暂时失败，请重试"}})});return;}await route.fallback();});
 dialog=await openReference(page,inspector.getByRole("button",{name:"参考图片",exact:true}),true);
 await expect(dialog.getByRole("alert")).toBeVisible(wait);expect(injected).toBe(1);captures.push(await capture(page,dialog,"read-error"));
 await dialog.getByRole("button",{name:"重新读取",exact:true}).click(wait);await expect(dialog.getByRole("button",{name:"预览 "+portrait,exact:true})).toBeVisible(wait);
 await dialog.getByRole("button",{name:"取消",exact:true}).click(wait);expect((await s.get()).document).toEqual(saved.document);expect((await s.get()).revision).toBe(saved.revision);
 writeFileSync(resolve(evidence,"public-write-read-observation.json"),JSON.stringify({surface:"browser",mode:"non-fixture",witnesses:{groupId:s.group.id,canvasId:s.canvas.id,selected:s.second,nodeId:node.id},beforeRevision:before.revision,savedRevision:saved.revision,exactReference:saved.document.nodes.find(n=>n.id===node.id),refresh:true,back:true,repeat:true,galleryAdopted:false,galleryUnchanged:true,errorFixture:{operation:"assets.search",count:injected,status:503,successfulWritesReplaced:false},modelCalled:false,captures},null,2));
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 100260000 });
