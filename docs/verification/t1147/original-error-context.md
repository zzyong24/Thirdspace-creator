# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/t1140-picker-low-height.spec.ts >> T-1140 精确选用、正式回读、刷新返回与原gallery流程
- Location: tests/e2e/t1140-picker-low-height.spec.ts:103:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false

Call Log:
- Timeout 120000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - complementary "主侧栏" [ref=e3]:
      - generic [ref=e4]:
        - img [ref=e7]
        - button "展开侧栏" [pressed] [ref=e10]:
          - img [ref=e11]
      - navigation "主要导航" [ref=e15]:
        - link "首页" [ref=e16] [cursor=pointer]:
          - /url: /
          - img [ref=e17]
        - link "创作者总览" [ref=e22] [cursor=pointer]:
          - /url: /overview
          - img [ref=e23]
        - link "定位中心" [ref=e25] [cursor=pointer]:
          - /url: /positioning
          - img [ref=e26]
        - link "内容雷达" [ref=e28] [cursor=pointer]:
          - /url: /intelligence
          - img [ref=e29]
        - link "选题" [ref=e36] [cursor=pointer]:
          - /url: /topics
          - img [ref=e37]
        - link "项目" [ref=e40] [cursor=pointer]:
          - /url: /projects
          - img [ref=e41]
        - link "知识库" [ref=e43] [cursor=pointer]:
          - /url: /knowledge
          - img [ref=e44]
        - link "素材中心" [ref=e46] [cursor=pointer]:
          - /url: /assets
          - img [ref=e47]
        - link "创作画布" [ref=e52] [cursor=pointer]:
          - /url: /canvases
          - img [ref=e53]
        - link "发布中心" [ref=e57] [cursor=pointer]:
          - /url: /publishing
          - img [ref=e58]
        - link "运营分析" [ref=e61] [cursor=pointer]:
          - /url: /daily-report
          - img [ref=e62]
        - link "自动化" [ref=e64] [cursor=pointer]:
          - /url: /automations
          - img [ref=e65]
        - link "设置" [ref=e69] [cursor=pointer]:
          - /url: /settings
          - img [ref=e70]
      - generic [ref=e73]:
        - button "帮助与反馈" [ref=e74]:
          - img [ref=e75]
        - button "当前账号组：素材预览验收" [ref=e85] [cursor=pointer]:
          - img [ref=e87]
        - generic "创作者" [ref=e91]:
          - generic [ref=e93]: "?"
    - generic [ref=e94]:
      - banner:
        - generic:
          - generic: 创作画布
          - paragraph: 整理想法，生成图片和视频
      - main [ref=e100]:
        - generic [ref=e101]:
          - button "画布库" [ref=e102]:
            - img [ref=e103]
            - text: 画布库
          - generic [ref=e105]:
            - generic [ref=e106]: 画布标题
            - textbox "画布标题" [ref=e107]: 素材预览与选取
          - status [ref=e108]:
            - img [ref=e109]
            - text: 已保存
          - button "保存" [ref=e111]:
            - img [ref=e112]
            - text: 保存
          - generic [ref=e116]:
            - button "撤销" [disabled] [ref=e117]
            - button "重做" [disabled] [ref=e118]
          - button "归档" [ref=e119]
        - generic [ref=e120]:
          - img [ref=e121]
          - generic [ref=e125]: 创作归属
          - combobox "关联项目（可选）" [ref=e126]:
            - option "独立画布 · 当前账号" [selected]
          - generic [ref=e127]: 生成结果先保留在当前账号素材库
        - generic [ref=e129]:
          - generic [ref=e130]:
            - generic:
              - img "画布连接"
              - generic [ref=e131]:
                - button "连接到图片生成" [ref=e132]
                - generic [ref=e133]:
                  - generic [ref=e134]: 图片生成
                  - generic [ref=e135]: 创作中枢
                - generic [ref=e136]:
                  - combobox "生成模式" [ref=e137]:
                    - option "文生图"
                    - option "参考图生图" [selected]
                  - textbox "生成描述" [ref=e138]:
                    - /placeholder: 描述你想生成的画面…
                  - generic [ref=e139]:
                    - button "参考图片" [ref=e140]:
                      - img "素材预览横图.png" [ref=e144]
                      - generic [ref=e145]:
                        - paragraph [ref=e146]: 参考图片
                        - paragraph [ref=e147]: 已选素材
                      - img [ref=e148]
                    - button "移除当前素材" [ref=e150]
                  - generic [ref=e151]:
                    - generic "当前账号尚未配置可用模型" [ref=e152]
                    - button "生成" [disabled] [ref=e153]
                  - paragraph [ref=e154]:
                    - text: 当前账号尚未配置可用模型
                    - link "查看模型设置" [ref=e155] [cursor=pointer]:
                      - /url: /settings
                - button "从图片生成连接" [ref=e156]
                - button "调整图片生成大小" [ref=e157]
          - generic:
            - generic [ref=e158]:
              - generic [ref=e159]: 添加
              - button "＋ 文字" [ref=e160]:
                - img [ref=e161]
                - text: ＋ 文字
              - button "＋ 图片生成" [ref=e164]:
                - img [ref=e165]
                - text: ＋ 图片生成
              - button "＋ 视频生成" [ref=e169]:
                - img [ref=e170]
                - text: ＋ 视频生成
              - button "素材库" [pressed] [ref=e174]:
                - img [ref=e175]
                - text: 素材库
              - button "案例库" [ref=e177]:
                - img [ref=e178]
                - text: 案例库
              - button "图文与发布" [ref=e180]:
                - img [ref=e181]
                - text: 图文与发布
            - button "编导与详情" [ref=e185]:
              - img [ref=e186]
              - text: 编导与详情
          - generic [ref=e189]:
            - generic [ref=e190]: 100%
            - button "选择：框选" [ref=e191]:
              - img [ref=e192]
              - text: 选择：框选
            - button "缩小" [ref=e197]:
              - img [ref=e198]
            - button "放大" [ref=e199]:
              - img [ref=e200]
            - button "适合内容" [ref=e201]:
              - img [ref=e202]
              - text: 适合内容
          - complementary "当前账号素材" [ref=e207]:
            - generic [ref=e208]:
              - generic [ref=e209]:
                - heading "从素材库选用" [level=2] [ref=e210]
                - paragraph [ref=e211]: 预览后选用，或拖到画布。
              - button "关闭素材库" [ref=e212]:
                - img [ref=e213]
            - generic [ref=e216]:
              - generic [ref=e217]:
                - generic [ref=e218]:
                  - generic [ref=e219]:
                    - img [ref=e220]
                    - textbox "搜索素材" [ref=e223]:
                      - /placeholder: 搜索素材库
                  - group "筛选素材类型" [ref=e224]:
                    - button "全部" [pressed] [ref=e225]
                    - button "图片" [ref=e226]
                    - button "视频" [ref=e227]
                - generic [ref=e230]:
                  - generic [ref=e231]:
                    - button "预览 素材预览横图.png" [active] [pressed] [ref=e232]:
                      - img "素材预览横图.png" [ref=e235]
                      - img [ref=e237]
                    - button "放到画布" [ref=e240]
                  - generic [ref=e241]:
                    - button "预览 素材预览长图-portrait_portrait_portrait_portrait_portrait_portrait_portrait_portrait_portrait_portrait_portrait_portrait_.png" [ref=e242]:
                      - img "素材预览长图-portrait_portrait_portrait_portrait_portrait_portrait_portrait_portrait_portrait_portrait_portrait_portrait_.png" [ref=e245]
                    - button "放到画布" [ref=e247]
              - complementary "素材预览" [ref=e248]:
                - button "关闭预览" [ref=e250]
                - img "画布图片素材" [ref=e253]
  - button "Open Next.js Dev Tools" [ref=e259] [cursor=pointer]:
    - img [ref=e260]
  - alert [ref=e263]
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
  25  | async function openReference(page:Page,trigger:Locator,readFailure=false){
  26  |  // 重开同库会先显示上次items，随后200ms正式重读；等待这一次响应，避免点旧DOM后在重建中滚动。
  27  |  const read=page.waitForResponse(response=>response.request().method()==="POST"&&response.url().endsWith("/api/v1/dispatch")&&response.request().postDataJSON()?.id==="assets.search",wait);
  28  |  await trigger.click(wait);const response=await read;if(!readFailure)expect(response.ok()).toBe(true);
  29  |  const dialog=page.getByRole("dialog",{name:"参考图片",exact:true});await expect(dialog.locator("[aria-busy]")).toHaveAttribute("aria-busy","false",wait);return dialog;
  30  | }
  31  | async function setup(page:Page,context:BrowserContext,baseURL:string){
  32  |  const group=await dispatch(page,"accountGroups.create",{body:{name:"素材预览验收",idempotencyKey:crypto.randomUUID()}});
  33  |  const first=await upload(page,group.id,"public-person-notes.png",portrait),second=await upload(page,group.id,"public-person-wide.png",wide);
  34  |  const canvas=await dispatch<Canvas>(page,"canvas.create",{body:{title:"素材预览与选取",projectId:null}},group.id);
  35  |  await context.addCookies([{name:"creatoros_current_group",value:encodeURIComponent(group.id),url:baseURL}]);
  36  |  await page.addInitScript(id=>{localStorage.setItem("creatoros:current-group",id);localStorage.removeItem("creatoros:current-account");},group.id);
  37  |  await page.goto("/canvases/"+canvas.id,wait);await page.getByRole("button",{name:"＋ 图片生成",exact:true}).click(wait);
  38  |  await page.getByRole("button",{name:"编导与详情",exact:true}).click(wait);
  39  |  const inspector=page.locator("aside").filter({has:page.getByRole("heading",{name:"节点设置",exact:true})});
  40  |  await inspector.getByRole("combobox",{name:"模式",exact:true}).selectOption("image_to_image",wait);
  41  |  await expect(page.getByText("已保存",{exact:true})).toBeVisible(wait);
  42  |  const get=()=>dispatch<Canvas>(page,"canvas.get",{params:{canvasId:canvas.id}},group.id);
  43  |  return {group,first,second,canvas,inspector,get,field:inspector.getByRole("button",{name:"参考图片",exact:true})};
  44  | }
  45  | async function paint(image:Locator){
  46  |  return image.evaluate((img:HTMLImageElement)=>{
  47  |   const rect=img.getBoundingClientRect(),style=getComputedStyle(img),scale=Math.min(rect.width/img.naturalWidth,rect.height/img.naturalHeight);
  48  |   const width=img.naturalWidth*scale,height=img.naturalHeight*scale;
  49  |   const painted={left:rect.left+(rect.width-width)/2,top:rect.top+(rect.height-height)/2,right:rect.left+(rect.width+width)/2,bottom:rect.top+(rect.height+height)/2,width,height};
  50  |   let clip={left:0,top:0,right:innerWidth,bottom:innerHeight};const ancestors=[];
  51  |   for(let el=img.parentElement;el;el=el.parentElement){
  52  |    const box=el.getBoundingClientRect(),css=getComputedStyle(el),clipsX=/^(auto|scroll|hidden|clip)$/.test(css.overflowX),clipsY=/^(auto|scroll|hidden|clip)$/.test(css.overflowY);
  53  |    if(clipsX){clip.left=Math.max(clip.left,box.left+el.clientLeft);clip.right=Math.min(clip.right,box.left+el.clientLeft+el.clientWidth);}
  54  |    if(clipsY){clip.top=Math.max(clip.top,box.top+el.clientTop);clip.bottom=Math.min(clip.bottom,box.top+el.clientTop+el.clientHeight);}
  55  |    if(clipsX||clipsY)ancestors.push({tag:el.tagName,overflowX:css.overflowX,overflowY:css.overflowY,top:box.top,height:box.height,clientHeight:el.clientHeight,scrollHeight:el.scrollHeight});
  56  |   }
  57  |   return {loaded:img.complete&&img.naturalWidth>0,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,objectFit:style.objectFit,painted,clip,ancestors,whole:img.complete&&width>0&&height>0&&painted.left>=clip.left-1&&painted.top>=clip.top-1&&painted.right<=clip.right+1&&painted.bottom<=clip.bottom+1};
  58  |  });
  59  | }
> 60  | async function whole(image:Locator){await expect.poll(async()=>{const p=await paint(image);return p.loaded&&p.objectFit==="contain"&&p.whole;},wait).toBe(true);return paint(image);}
      |                                                                                                                                                      ^ Error: expect(received).toBe(expected) // Object.is equality
  61  | async function boundaries(dialog:Locator){
  62  |  return dialog.evaluate(node=>{
  63  |   const box=node.getBoundingClientRect();const buttons=Array.from(node.querySelectorAll("button")).filter(el=>["取消","使用此素材"].includes(el.textContent?.trim()??"")).map(el=>{const r=el.getBoundingClientRect();return {text:el.textContent?.trim(),top:r.top,bottom:r.bottom,left:r.left,right:r.right};});
  64  |   const title=node.querySelector('[data-slot="dialog-title"]')?.getBoundingClientRect();
  65  |   const scrollOwners=Array.from(node.querySelectorAll("*")).filter(el=>/^(auto|scroll)$/.test(getComputedStyle(el).overflowY));
  66  |   const scrolls=scrollOwners.filter(el=>el.scrollHeight>el.clientHeight+1).map(el=>({tag:el.tagName,top:el.getBoundingClientRect().top,clientHeight:el.clientHeight,scrollHeight:el.scrollHeight}));
  67  |   return {box:{left:box.left,right:box.right,top:box.top,bottom:box.bottom},viewport:{width:innerWidth,height:innerHeight},buttons,scrollOwnerCount:scrollOwners.length,title:title?{top:title.top,bottom:title.bottom}:null,scrolls,inside:box.left>=15&&box.right<=innerWidth-15&&buttons.length===2&&buttons.every(r=>r.top>=box.top&&r.bottom<=box.bottom)};
  68  |  });
  69  | }
  70  | async function capture(page:Page,dialog:Locator,name:string,details:unknown={}){
  71  |  mkdirSync(resolve(evidence,"screenshots"),{recursive:true});await page.screenshot({path:resolve(evidence,"screenshots",name+".png")});
  72  |  return {name,url:page.url(),viewport:page.viewportSize(),text:await dialog.innerText(),boundaries:await boundaries(dialog),details};
  73  | }
  74  |
  75  | test("T-1140 六种窗口完整预览、统一滚动、搜索与取消不写",async({page,context,baseURL})=>{
  76  |  test.setTimeout(1_200_000);page.setDefaultTimeout(120_000);page.setDefaultNavigationTimeout(120_000);
  77  |  await page.setViewportSize(viewports[0]!);const s=await setup(page,context,baseURL!);const before=await s.get(),captures=[];
  78  |  for(const vp of viewports){
  79  |   await page.setViewportSize(vp);const dialog=await openReference(page,s.field);
  80  |   const thumb=dialog.getByRole("button",{name:"预览 "+portrait,exact:true});await thumb.click(wait);
  81  |   const large=dialog.getByAltText("画布图片素材",{exact:true});
  82  |   await expect.poll(async()=> (await boundaries(dialog)).inside,wait).toBe(true);
  83  |   let thumbnail;
  84  |   if(vp.width>=640){thumbnail=await whole(thumb.getByRole("img"));await whole(large);}
  85  |   else{await thumb.scrollIntoViewIfNeeded(wait);thumbnail=await whole(thumb.getByRole("img"));await large.scrollIntoViewIfNeeded(wait);await whole(large);}
  86  |   const geometry=await boundaries(dialog);expect(geometry.title).not.toBeNull();expect(geometry.title!.top).toBeGreaterThanOrEqual(geometry.box.top);
  87  |   if(vp.width<640||vp.height<=480){expect(geometry.scrollOwnerCount).toBe(1);expect(geometry.scrolls.length).toBeLessThanOrEqual(1);}
  88  |   captures.push(await capture(page,dialog,"portrait-"+vp.width+"x"+vp.height,{thumbnail,preview:await paint(large)}));
  89  |   const other=dialog.getByRole("button",{name:"预览 "+wide,exact:true});await other.click(wait);await expect(large).toHaveJSProperty("naturalWidth",1672,wait);
  90  |   if(vp.width<640)await large.scrollIntoViewIfNeeded(wait);await whole(large);
  91  |   captures.push(await capture(page,dialog,"landscape-"+vp.width+"x"+vp.height,{preview:await paint(large)}));
  92  |   const search=dialog.getByRole("textbox",{name:"搜索素材",exact:true});await search.fill("没有这件素材",wait);
  93  |   await expect(dialog.getByText("没有找到匹配素材",{exact:true})).toBeVisible(wait);await expect(search).toBeFocused(wait);
  94  |   await search.fill("长图",wait);await expect(thumb).toBeVisible(wait);await search.fill("",wait);
  95  |   await expect(dialog.getByRole("button",{name:"预览 "+wide,exact:true})).toBeVisible(wait);
  96  |   await dialog.getByRole("group",{name:"筛选素材类型",exact:true}).getByRole("button",{name:"图片",exact:true}).click(wait);
  97  |   await expect(thumb).toBeVisible(wait);await page.keyboard.press("Escape");await expect(dialog).toBeHidden(wait);await expect(s.field).toBeFocused(wait);
  98  |   const after=await s.get();expect(after.revision).toBe(before.revision);expect(after.document).toEqual(before.document);
  99  |  }
  100 |  writeFileSync(resolve(evidence,"layout-observation.json"),JSON.stringify({surface:"browser",mode:"non-fixture",witnesses:{groupId:s.group.id,canvasId:s.canvas.id,assets:[s.first,s.second]},cancelBeforeRevision:before.revision,cancelUnchanged:true,modelCalled:false,viewports,captures},null,2));
  101 | });
  102 |
  103 | test("T-1140 精确选用、正式回读、刷新返回与原gallery流程",async({page,context,baseURL})=>{
  104 |  test.setTimeout(900_000);page.setDefaultTimeout(120_000);page.setDefaultNavigationTimeout(120_000);
  105 |  await page.setViewportSize({width:1024,height:680});const s=await setup(page,context,baseURL!),before=await s.get(),captures=[];
  106 |  let dialog=await openReference(page,s.field);
  107 |  await dialog.getByRole("button",{name:"预览 "+wide,exact:true}).click(wait);await whole(dialog.getByAltText("画布图片素材",{exact:true}));
  108 |  captures.push(await capture(page,dialog,"exact-before-confirm"));await dialog.getByRole("button",{name:"使用此素材",exact:true}).click(wait);await expect(dialog).toBeHidden(wait);
  109 |  await expect(page.getByText("已保存",{exact:true})).toBeVisible(wait);
  110 |  await expect.poll(async()=>{const current=await s.get();return current.document.nodes.some(n=>n.referenceAssetId===s.second.id&&n.referenceFileId===s.second.currentFileId);},wait).toBe(true);
  111 |  const saved=await s.get();expect(saved.revision).toBeGreaterThan(before.revision);const node=saved.document.nodes.find(n=>n.type==="image_generation")!;
  112 |  expect(node).toMatchObject({referenceAssetId:s.second.id,referenceFileId:s.second.currentFileId});
  113 |  await page.reload(wait);expect((await s.get()).document).toEqual(saved.document);await page.goto("/canvases",wait);await page.goto("/canvases/"+s.canvas.id,wait);
  114 |  expect((await s.get()).document).toEqual(saved.document);
  115 |  for(const vp of viewports){
  116 |   await page.setViewportSize(vp);await page.getByRole("button",{name:"素材库",exact:true}).click(wait);const gallery=page.getByRole("complementary",{name:"当前账号素材",exact:true});
  117 |   const thumb=gallery.getByRole("button",{name:"预览 "+wide,exact:true});await thumb.click(wait);const preview=gallery.getByRole("complementary",{name:"素材预览",exact:true});
  118 |   const positions=await gallery.evaluate(node=>{const filters=node.querySelector('[aria-label="筛选素材类型"]')!,card=node.querySelector('[aria-label="预览 素材预览横图.png"]')!.parentElement!,preview=node.querySelector('[aria-label="素材预览"]')!;const box=(el:Element)=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};return {filters:box(filters),card:box(card),preview:box(preview)};});
  119 |   expect(positions.card.top).toBeGreaterThanOrEqual(positions.filters.bottom-1);expect(positions.preview.top).toBeGreaterThanOrEqual(positions.card.bottom-1);
  120 |   await preview.getByAltText("画布图片素材",{exact:true}).scrollIntoViewIfNeeded(wait);await whole(preview.getByAltText("画布图片素材",{exact:true}));
  121 |   captures.push(await capture(page,gallery,"gallery-preview-"+vp.width+"x"+vp.height,{positions,preview:await paint(preview.getByAltText("画布图片素材",{exact:true}))}));
  122 |   await preview.getByRole("button",{name:"关闭预览",exact:true}).click(wait);await expect(preview).toBeHidden(wait);
  123 |   await thumb.scrollIntoViewIfNeeded(wait);await whole(thumb.getByRole("img"));await gallery.getByRole("button",{name:"关闭素材库",exact:true}).click(wait);
  124 |   expect((await s.get()).document).toEqual(saved.document);expect((await s.get()).revision).toBe(saved.revision);
  125 |  }
  126 |  await page.setViewportSize({width:1024,height:680});
  127 |  // 显式一次读取失败，只替换失败响应；重试的成功读取仍走正式HTTP。
  128 |  // 刷新后的节点由画布原卡片点击选中，不直接修改React状态。
  129 |  await page.getByTestId("canvas-node").filter({has:page.getByRole("textbox",{name:"生成描述",exact:true})}).click({...wait,position:{x:24,y:20}});
  130 |  await page.getByRole("button",{name:"编导与详情",exact:true}).click(wait);
  131 |  const inspector=page.locator("aside").filter({has:page.getByRole("heading",{name:"节点设置",exact:true})});
  132 |  let injected=0;await page.route("**/api/v1/dispatch",async route=>{if(route.request().postDataJSON()?.id==="assets.search"&&injected===0){injected++;await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({data:null,error:{code:"ServiceUnavailableError",message:"素材读取暂时失败，请重试"}})});return;}await route.fallback();});
  133 |  dialog=await openReference(page,inspector.getByRole("button",{name:"参考图片",exact:true}),true);
  134 |  await expect(dialog.getByRole("alert")).toBeVisible(wait);expect(injected).toBe(1);captures.push(await capture(page,dialog,"read-error"));
  135 |  await dialog.getByRole("button",{name:"重新读取",exact:true}).click(wait);await expect(dialog.getByRole("button",{name:"预览 "+portrait,exact:true})).toBeVisible(wait);
  136 |  await dialog.getByRole("button",{name:"取消",exact:true}).click(wait);expect((await s.get()).document).toEqual(saved.document);expect((await s.get()).revision).toBe(saved.revision);
  137 |  writeFileSync(resolve(evidence,"public-write-read-observation.json"),JSON.stringify({surface:"browser",mode:"non-fixture",witnesses:{groupId:s.group.id,canvasId:s.canvas.id,selected:s.second,nodeId:node.id},beforeRevision:before.revision,savedRevision:saved.revision,exactReference:saved.document.nodes.find(n=>n.id===node.id),refresh:true,back:true,repeat:true,galleryAdopted:false,galleryUnchanged:true,errorFixture:{operation:"assets.search",count:injected,status:503,successfulWritesReplaced:false},modelCalled:false,captures},null,2));
  138 | });
  139 |
```
