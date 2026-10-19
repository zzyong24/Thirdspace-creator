# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/t1140-picker-low-height.spec.ts >> T-1140 六种窗口完整预览、统一滚动、搜索与取消不写
- Location: tests/e2e/t1140-picker-low-height.spec.ts:69:1

# Error details

```
Error: locator.scrollIntoViewIfNeeded: Element is not attached to the DOM
Call log:
  - attempting scroll into view action
    - waiting for element to be stable
    - element is not stable
  - retrying scroll into view action
    - waiting for element to be stable

```

# Page snapshot

```yaml
- generic:
  - generic:
    - complementary:
      - generic:
        - generic:
          - generic:
            - img
        - button [pressed]:
          - img
      - generic:
        - navigation:
          - link:
            - /url: /
            - img
          - link:
            - /url: /overview
            - img
          - link:
            - /url: /positioning
            - img
          - link:
            - /url: /intelligence
            - img
          - link:
            - /url: /topics
            - img
          - link:
            - /url: /projects
            - img
          - link:
            - /url: /knowledge
            - img
          - link:
            - /url: /assets
            - img
          - link:
            - /url: /canvases
            - img
          - link:
            - /url: /publishing
            - img
          - link:
            - /url: /daily-report
            - img
          - link:
            - /url: /automations
            - img
          - link:
            - /url: /settings
            - img
      - generic:
        - button:
          - img
        - generic:
          - button:
            - generic:
              - img
        - generic:
          - generic:
            - generic: "?"
    - generic:
      - banner:
        - generic:
          - generic: 创作画布
          - paragraph: 整理想法，生成图片和视频
      - generic:
        - generic:
          - generic:
            - generic:
              - generic:
                - main:
                  - generic:
                    - button:
                      - img
                      - text: 画布库
                    - generic:
                      - generic: 画布标题
                      - textbox: 素材预览与选取
                    - status:
                      - img
                      - text: 已保存
                    - button:
                      - img
                      - text: 保存
                    - generic:
                      - button: 撤销
                      - button [disabled]: 重做
                    - button: 归档
                  - generic:
                    - img
                    - generic: 创作归属
                    - combobox
                    - generic: 生成结果先保留在当前账号素材库
                  - generic:
                    - img
                    - generic:
                      - button
                      - generic:
                        - generic: 图片生成
                        - generic: 创作中枢
                      - generic:
                        - combobox
                        - textbox:
                          - /placeholder: 描述你想生成的画面…
                        - generic:
                          - button:
                            - generic:
                              - generic:
                                - img
                            - generic:
                              - paragraph: 参考图片
                              - paragraph: 选择素材
                            - img
                        - generic:
                          - generic: 当前账号尚未配置可用模型
                          - button [disabled]: 生成
                        - paragraph:
                          - text: 当前账号尚未配置可用模型
                          - link:
                            - /url: /settings
                            - text: 查看模型设置
                      - button
                      - button
                    - generic [ref=e1]:
                      - generic [ref=e2]: 添加
                      - button [ref=e3]:
                        - img [ref=e4]
                        - text: ＋ 文字
                      - button [ref=e7]:
                        - img [ref=e8]
                        - text: ＋ 图片生成
                      - button [ref=e12]:
                        - img [ref=e13]
                        - text: ＋ 视频生成
                      - button [ref=e17]:
                        - img [ref=e18]
                        - text: 素材库
                      - button [ref=e20]:
                        - img [ref=e21]
                        - text: 案例库
                      - button [ref=e23]:
                        - img [ref=e24]
                        - text: 图文与发布
                    - button [expanded] [ref=e28]:
                      - img [ref=e29]
                      - text: 收起详情
                    - generic:
                      - generic: 100%
                      - button:
                        - img
                        - text: 选择：框选
                      - button:
                        - img
                      - button:
                        - img
                      - button:
                        - img
                        - text: 适合内容
                    - complementary:
                      - heading [level=2]: 节点设置
                      - generic:
                        - text: 名称
                        - textbox
                      - generic:
                        - text: 生成描述
                        - textbox
                      - generic:
                        - text: 模式
                        - combobox
                      - generic:
                        - button [expanded]:
                          - generic:
                            - generic:
                              - img
                          - generic:
                            - paragraph: 参考图片
                            - paragraph: 选择素材
                          - img
                      - generic:
                        - text: 画幅
                        - combobox
                      - paragraph: 当前账号尚未配置可用模型
                      - button [disabled]: 生成
                      - button: 删除节点
                      - generic:
                        - generic:
                          - heading [level=2]: 编导建议
                          - button: 刷新
                        - link:
                          - /url: "?copilot=open&surface=canvas&selKind=canvas&selId=b4febff7-7229-4807-8210-69ddd553447b&selTitle=%E7%B4%A0%E6%9D%90%E9%A2%84%E8%A7%88%E4%B8%8E%E9%80%89%E5%8F%96&prefill=%E8%AF%B7%E5%85%88%E8%AF%BB%E5%8F%96%E5%BD%93%E5%89%8D%E7%94%BB%E5%B8%83%EF%BC%8C%E5%86%8D%E6%8F%90%E5%87%BA%E6%88%91%E5%8F%AF%E4%BB%A5%E9%80%90%E9%A1%B9%E5%AE%A1%E6%A0%B8%E7%9A%84%E7%94%BB%E5%B8%83%E4%BF%AE%E6%94%B9%E5%BB%BA%E8%AE%AE%E3%80%82&scope=surface%3Acanvas%3Ab4febff7-7229-4807-8210-69ddd553447b"
                          - text: 和编导讨论这张画布
                      - generic:
                        - heading [level=2]: 连线
                        - paragraph: 暂无连线
                      - generic:
                        - heading [level=2]: 生成历史
                        - paragraph: 暂无生成任务
  - button "Open Next.js Dev Tools" [ref=e37] [cursor=pointer]:
    - img [ref=e38]
  - alert
  - dialog "参考图片" [active] [ref=e42]:
    - generic [ref=e43]:
      - heading "参考图片" [level=2] [ref=e44]
      - paragraph [ref=e45]: 素材库图片 · 先预览，再选用
    - generic [ref=e46]:
      - generic [ref=e47]:
        - generic [ref=e48]:
          - img [ref=e49]
          - textbox "搜索素材" [ref=e52]:
            - /placeholder: 搜索素材库
        - group "筛选素材类型" [ref=e53]:
          - button "全部" [ref=e54]
          - button "图片" [pressed] [ref=e55]
      - generic [ref=e56]:
        - generic [ref=e58]:
          - button "预览 素材预览横图.png" [ref=e60]:
            - img "素材预览横图.png" [ref=e63]
          - button "预览 素材预览长图-portrait_portrait_portrait_portrait_portrait_portrait_portrait_portrait_portrait_portrait_portrait_portrait_.png" [pressed] [ref=e65]:
            - img "素材预览长图-portrait_portrait_portrait_portrait_portrait_portrait_portrait_portrait_portrait_portrait_portrait_portrait_.png" [ref=e68]
            - img [ref=e70]
        - complementary [ref=e72]:
          - img "画布图片素材" [ref=e75]
    - generic [ref=e76]:
      - paragraph [ref=e77]: 已选，可预览后使用
      - button "取消" [ref=e78]
      - button "使用此素材" [ref=e79]
    - button "关闭" [ref=e80]:
      - img
      - generic [ref=e81]: 关闭
```

# Test source

```ts
  1   | import type {Page,Locator,BrowserContext} from "@playwright/test";
  2   | import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
  3   | import {resolve} from "node:path";
  4   | import {expect,test as base} from "../helpers/test-environment";
  5   | const test=base.extend<{}, {cleanupWitness:void}>({cleanupWitness:[async({browser},provide)=>{
  6   |  const diagnostic=process.env.CREATOROS_PICKER_CLEANUP_DIAG==="1";
  7   |  if(diagnostic)console.info("T1144 worker开始",JSON.stringify({at:new Date().toISOString(),pid:process.pid,browserConnected:browser.isConnected(),resources:process.getActiveResourcesInfo()}));
  8   |  await provide();
  9   |  if(diagnostic)console.info("T1144 worker测试已结束",JSON.stringify({at:new Date().toISOString(),pid:process.pid,browserConnected:browser.isConnected(),resources:process.getActiveResourcesInfo()}));
  10  | },{scope:"worker",auto:true,timeout:120_000}]});
  11  | const evidence=resolve("../docs/verification/t1140"),wait={timeout:120_000};
  12  | const viewports=[{width:1366,height:900},{width:1024,height:680},{width:683,height:450},{width:390,height:900},{width:390,height:450},{width:512,height:340}];
  13  | const portrait="素材预览长图-"+"portrait_".repeat(12)+".png",wide="素材预览横图.png";
  14  | type Canvas={id:string;revision:number;document:{nodes:Array<{id:string;type:string;referenceAssetId?:string;referenceFileId?:string}>}};
  15  | async function dispatch<T={id:string}>(page:Page,id:string,input:unknown,groupId?:string):Promise<T>{
  16  |  const response=await page.request.post("/api/v1/dispatch",{...wait,headers:{"content-type":"application/json",...(groupId?{"x-group-id":groupId}:{})},data:{id,input}});
  17  |  expect(response.ok(),id+" HTTP "+response.status()).toBe(true);return (await response.json() as {data:T}).data;
  18  | }
  19  | async function upload(page:Page,groupId:string,file:string,name:string){
  20  |  const bytes=readFileSync(resolve("public/visual-templates",file));
  21  |  const session=await dispatch<{uploadId:string;uploadUrl:string}>(page,"assets.uploads.create",{body:{assetType:"image",mimeType:"image/png",fileSize:bytes.length,fileName:name}},groupId);
  22  |  const put=await page.request.put(session.uploadUrl,{...wait,headers:{"content-type":"image/png"},data:bytes});expect(put.ok()).toBe(true);
  23  |  return dispatch<{id:string;currentFileId:string}>(page,"assets.uploads.complete",{params:{uploadId:session.uploadId},body:{name}},groupId);
  24  | }
  25  | async function setup(page:Page,context:BrowserContext,baseURL:string){
  26  |  const group=await dispatch(page,"accountGroups.create",{body:{name:"素材预览验收",idempotencyKey:crypto.randomUUID()}});
  27  |  const first=await upload(page,group.id,"public-person-notes.png",portrait),second=await upload(page,group.id,"public-person-wide.png",wide);
  28  |  const canvas=await dispatch<Canvas>(page,"canvas.create",{body:{title:"素材预览与选取",projectId:null}},group.id);
  29  |  await context.addCookies([{name:"creatoros_current_group",value:encodeURIComponent(group.id),url:baseURL}]);
  30  |  await page.addInitScript(id=>{localStorage.setItem("creatoros:current-group",id);localStorage.removeItem("creatoros:current-account");},group.id);
  31  |  await page.goto("/canvases/"+canvas.id,wait);await page.getByRole("button",{name:"＋ 图片生成",exact:true}).click(wait);
  32  |  await page.getByRole("button",{name:"编导与详情",exact:true}).click(wait);
  33  |  const inspector=page.locator("aside").filter({has:page.getByRole("heading",{name:"节点设置",exact:true})});
  34  |  await inspector.getByRole("combobox",{name:"模式",exact:true}).selectOption("image_to_image",wait);
  35  |  await expect(page.getByText("已保存",{exact:true})).toBeVisible(wait);
  36  |  const get=()=>dispatch<Canvas>(page,"canvas.get",{params:{canvasId:canvas.id}},group.id);
  37  |  return {group,first,second,canvas,inspector,get,field:inspector.getByRole("button",{name:"参考图片",exact:true})};
  38  | }
  39  | async function paint(image:Locator){
  40  |  return image.evaluate((img:HTMLImageElement)=>{
  41  |   const rect=img.getBoundingClientRect(),style=getComputedStyle(img),scale=Math.min(rect.width/img.naturalWidth,rect.height/img.naturalHeight);
  42  |   const width=img.naturalWidth*scale,height=img.naturalHeight*scale;
  43  |   const painted={left:rect.left+(rect.width-width)/2,top:rect.top+(rect.height-height)/2,right:rect.left+(rect.width+width)/2,bottom:rect.top+(rect.height+height)/2,width,height};
  44  |   let clip={left:0,top:0,right:innerWidth,bottom:innerHeight};const ancestors=[];
  45  |   for(let el=img.parentElement;el;el=el.parentElement){
  46  |    const box=el.getBoundingClientRect(),css=getComputedStyle(el),clipsX=/^(auto|scroll|hidden|clip)$/.test(css.overflowX),clipsY=/^(auto|scroll|hidden|clip)$/.test(css.overflowY);
  47  |    if(clipsX){clip.left=Math.max(clip.left,box.left+el.clientLeft);clip.right=Math.min(clip.right,box.left+el.clientLeft+el.clientWidth);}
  48  |    if(clipsY){clip.top=Math.max(clip.top,box.top+el.clientTop);clip.bottom=Math.min(clip.bottom,box.top+el.clientTop+el.clientHeight);}
  49  |    if(clipsX||clipsY)ancestors.push({tag:el.tagName,overflowX:css.overflowX,overflowY:css.overflowY,top:box.top,height:box.height,clientHeight:el.clientHeight,scrollHeight:el.scrollHeight});
  50  |   }
  51  |   return {loaded:img.complete&&img.naturalWidth>0,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,objectFit:style.objectFit,painted,clip,ancestors,whole:img.complete&&width>0&&height>0&&painted.left>=clip.left-1&&painted.top>=clip.top-1&&painted.right<=clip.right+1&&painted.bottom<=clip.bottom+1};
  52  |  });
  53  | }
  54  | async function whole(image:Locator){await expect.poll(async()=>{const p=await paint(image);return p.loaded&&p.objectFit==="contain"&&p.whole;},wait).toBe(true);return paint(image);}
  55  | async function boundaries(dialog:Locator){
  56  |  return dialog.evaluate(node=>{
  57  |   const box=node.getBoundingClientRect();const buttons=Array.from(node.querySelectorAll("button")).filter(el=>["取消","使用此素材"].includes(el.textContent?.trim()??"")).map(el=>{const r=el.getBoundingClientRect();return {text:el.textContent?.trim(),top:r.top,bottom:r.bottom,left:r.left,right:r.right};});
  58  |   const title=node.querySelector('[data-slot="dialog-title"]')?.getBoundingClientRect();
  59  |   const scrollOwners=Array.from(node.querySelectorAll("*")).filter(el=>/^(auto|scroll)$/.test(getComputedStyle(el).overflowY));
  60  |   const scrolls=scrollOwners.filter(el=>el.scrollHeight>el.clientHeight+1).map(el=>({tag:el.tagName,top:el.getBoundingClientRect().top,clientHeight:el.clientHeight,scrollHeight:el.scrollHeight}));
  61  |   return {box:{left:box.left,right:box.right,top:box.top,bottom:box.bottom},viewport:{width:innerWidth,height:innerHeight},buttons,scrollOwnerCount:scrollOwners.length,title:title?{top:title.top,bottom:title.bottom}:null,scrolls,inside:box.left>=15&&box.right<=innerWidth-15&&buttons.length===2&&buttons.every(r=>r.top>=box.top&&r.bottom<=box.bottom)};
  62  |  });
  63  | }
  64  | async function capture(page:Page,dialog:Locator,name:string,details:unknown={}){
  65  |  mkdirSync(resolve(evidence,"screenshots"),{recursive:true});await page.screenshot({path:resolve(evidence,"screenshots",name+".png")});
  66  |  return {name,url:page.url(),viewport:page.viewportSize(),text:await dialog.innerText(),boundaries:await boundaries(dialog),details};
  67  | }
  68  |
  69  | test("T-1140 六种窗口完整预览、统一滚动、搜索与取消不写",async({page,context,baseURL})=>{
  70  |  test.setTimeout(1_200_000);page.setDefaultTimeout(120_000);page.setDefaultNavigationTimeout(120_000);
  71  |  await page.setViewportSize(viewports[0]!);const s=await setup(page,context,baseURL!);const before=await s.get(),captures=[];
  72  |  for(const vp of viewports){
  73  |   await page.setViewportSize(vp);await s.field.click(wait);const dialog=page.getByRole("dialog",{name:"参考图片",exact:true});
  74  |   const thumb=dialog.getByRole("button",{name:"预览 "+portrait,exact:true});await thumb.click(wait);
  75  |   const large=dialog.getByAltText("画布图片素材",{exact:true});
  76  |   await expect.poll(async()=> (await boundaries(dialog)).inside,wait).toBe(true);
  77  |   let thumbnail;
  78  |   if(vp.width>=640){thumbnail=await whole(thumb.getByRole("img"));await whole(large);}
> 79  |   else{await thumb.scrollIntoViewIfNeeded(wait);thumbnail=await whole(thumb.getByRole("img"));await large.scrollIntoViewIfNeeded(wait);await whole(large);}
      |                    ^ Error: locator.scrollIntoViewIfNeeded: Element is not attached to the DOM
  80  |   const geometry=await boundaries(dialog);expect(geometry.title).not.toBeNull();expect(geometry.title!.top).toBeGreaterThanOrEqual(geometry.box.top);
  81  |   if(vp.width<640||vp.height<=480){expect(geometry.scrollOwnerCount).toBe(1);expect(geometry.scrolls.length).toBeLessThanOrEqual(1);}
  82  |   captures.push(await capture(page,dialog,"portrait-"+vp.width+"x"+vp.height,{thumbnail,preview:await paint(large)}));
  83  |   const other=dialog.getByRole("button",{name:"预览 "+wide,exact:true});await other.click(wait);await expect(large).toHaveJSProperty("naturalWidth",1672,wait);
  84  |   if(vp.width<640)await large.scrollIntoViewIfNeeded(wait);await whole(large);
  85  |   captures.push(await capture(page,dialog,"landscape-"+vp.width+"x"+vp.height,{preview:await paint(large)}));
  86  |   const search=dialog.getByRole("textbox",{name:"搜索素材",exact:true});await search.fill("没有这件素材",wait);
  87  |   await expect(dialog.getByText("没有找到匹配素材",{exact:true})).toBeVisible(wait);await expect(search).toBeFocused(wait);
  88  |   await search.fill("长图",wait);await expect(thumb).toBeVisible(wait);await search.fill("",wait);
  89  |   await expect(dialog.getByRole("button",{name:"预览 "+wide,exact:true})).toBeVisible(wait);
  90  |   await dialog.getByRole("group",{name:"筛选素材类型",exact:true}).getByRole("button",{name:"图片",exact:true}).click(wait);
  91  |   await expect(thumb).toBeVisible(wait);await page.keyboard.press("Escape");await expect(dialog).toBeHidden(wait);await expect(s.field).toBeFocused(wait);
  92  |   const after=await s.get();expect(after.revision).toBe(before.revision);expect(after.document).toEqual(before.document);
  93  |  }
  94  |  writeFileSync(resolve(evidence,"layout-observation.json"),JSON.stringify({surface:"browser",mode:"non-fixture",witnesses:{groupId:s.group.id,canvasId:s.canvas.id,assets:[s.first,s.second]},cancelBeforeRevision:before.revision,cancelUnchanged:true,modelCalled:false,viewports,captures},null,2));
  95  | });
  96  |
  97  | test("T-1140 精确选用、正式回读、刷新返回与原gallery流程",async({page,context,baseURL})=>{
  98  |  test.setTimeout(900_000);page.setDefaultTimeout(120_000);page.setDefaultNavigationTimeout(120_000);
  99  |  await page.setViewportSize({width:1024,height:680});const s=await setup(page,context,baseURL!),before=await s.get(),captures=[];
  100 |  await s.field.click(wait);let dialog=page.getByRole("dialog",{name:"参考图片",exact:true});
  101 |  await dialog.getByRole("button",{name:"预览 "+wide,exact:true}).click(wait);await whole(dialog.getByAltText("画布图片素材",{exact:true}));
  102 |  captures.push(await capture(page,dialog,"exact-before-confirm"));await dialog.getByRole("button",{name:"使用此素材",exact:true}).click(wait);await expect(dialog).toBeHidden(wait);
  103 |  await expect(page.getByText("已保存",{exact:true})).toBeVisible(wait);
  104 |  await expect.poll(async()=>{const current=await s.get();return current.document.nodes.some(n=>n.referenceAssetId===s.second.id&&n.referenceFileId===s.second.currentFileId);},wait).toBe(true);
  105 |  const saved=await s.get();expect(saved.revision).toBeGreaterThan(before.revision);const node=saved.document.nodes.find(n=>n.type==="image_generation")!;
  106 |  expect(node).toMatchObject({referenceAssetId:s.second.id,referenceFileId:s.second.currentFileId});
  107 |  await page.reload(wait);expect((await s.get()).document).toEqual(saved.document);await page.goto("/canvases",wait);await page.goto("/canvases/"+s.canvas.id,wait);
  108 |  expect((await s.get()).document).toEqual(saved.document);
  109 |  for(const vp of viewports){
  110 |   await page.setViewportSize(vp);await page.getByRole("button",{name:"素材库",exact:true}).click(wait);const gallery=page.getByRole("complementary",{name:"当前账号素材",exact:true});
  111 |   const thumb=gallery.getByRole("button",{name:"预览 "+wide,exact:true});await thumb.click(wait);const preview=gallery.getByRole("complementary",{name:"素材预览",exact:true});
  112 |   const positions=await gallery.evaluate(node=>{const filters=node.querySelector('[aria-label="筛选素材类型"]')!,card=node.querySelector('[aria-label="预览 素材预览横图.png"]')!.parentElement!,preview=node.querySelector('[aria-label="素材预览"]')!;const box=(el:Element)=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};return {filters:box(filters),card:box(card),preview:box(preview)};});
  113 |   expect(positions.card.top).toBeGreaterThanOrEqual(positions.filters.bottom-1);expect(positions.preview.top).toBeGreaterThanOrEqual(positions.card.bottom-1);
  114 |   await preview.getByAltText("画布图片素材",{exact:true}).scrollIntoViewIfNeeded(wait);await whole(preview.getByAltText("画布图片素材",{exact:true}));
  115 |   captures.push(await capture(page,gallery,"gallery-preview-"+vp.width+"x"+vp.height,{positions,preview:await paint(preview.getByAltText("画布图片素材",{exact:true}))}));
  116 |   await preview.getByRole("button",{name:"关闭预览",exact:true}).click(wait);await expect(preview).toBeHidden(wait);
  117 |   await thumb.scrollIntoViewIfNeeded(wait);await whole(thumb.getByRole("img"));await gallery.getByRole("button",{name:"关闭素材库",exact:true}).click(wait);
  118 |   expect((await s.get()).document).toEqual(saved.document);expect((await s.get()).revision).toBe(saved.revision);
  119 |  }
  120 |  await page.setViewportSize({width:1024,height:680});
  121 |  // 显式一次读取失败，只替换失败响应；重试的成功读取仍走正式HTTP。
  122 |  // 刷新后的节点由画布原卡片点击选中，不直接修改React状态。
  123 |  await page.getByTestId("canvas-node").filter({has:page.getByRole("textbox",{name:"生成描述",exact:true})}).click({...wait,position:{x:24,y:20}});
  124 |  await page.getByRole("button",{name:"编导与详情",exact:true}).click(wait);
  125 |  const inspector=page.locator("aside").filter({has:page.getByRole("heading",{name:"节点设置",exact:true})});
  126 |  let injected=0;await page.route("**/api/v1/dispatch",async route=>{if(route.request().postDataJSON()?.id==="assets.search"&&injected===0){injected++;await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({data:null,error:{code:"ServiceUnavailableError",message:"素材读取暂时失败，请重试"}})});return;}await route.fallback();});
  127 |  await inspector.getByRole("button",{name:"参考图片",exact:true}).click(wait);dialog=page.getByRole("dialog",{name:"参考图片",exact:true});
  128 |  await expect(dialog.getByRole("alert")).toBeVisible(wait);expect(injected).toBe(1);captures.push(await capture(page,dialog,"read-error"));
  129 |  await dialog.getByRole("button",{name:"重新读取",exact:true}).click(wait);await expect(dialog.getByRole("button",{name:"预览 "+portrait,exact:true})).toBeVisible(wait);
  130 |  await dialog.getByRole("button",{name:"取消",exact:true}).click(wait);expect((await s.get()).document).toEqual(saved.document);expect((await s.get()).revision).toBe(saved.revision);
  131 |  writeFileSync(resolve(evidence,"public-write-read-observation.json"),JSON.stringify({surface:"browser",mode:"non-fixture",witnesses:{groupId:s.group.id,canvasId:s.canvas.id,selected:s.second,nodeId:node.id},beforeRevision:before.revision,savedRevision:saved.revision,exactReference:saved.document.nodes.find(n=>n.id===node.id),refresh:true,back:true,repeat:true,galleryAdopted:false,galleryUnchanged:true,errorFixture:{operation:"assets.search",count:injected,status:503,successfulWritesReplaced:false},modelCalled:false,captures},null,2));
  132 | });
  133 |
```
