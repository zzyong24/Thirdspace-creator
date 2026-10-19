# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/t1136-calendar-dialog-layout.spec.ts >> T-1136 当前真实排期长名称的四种窗口尺寸
- Location: tests/e2e/t1136-calendar-dialog-layout.spec.ts:78:5

# Error details

```
Error: expect(locator).toBeFocused() failed

Locator:  getByRole('button', { name: '安排创作', exact: true })
Expected: focused
Received: inactive
Timeout:  120000ms

Call log:
  - Expect "toBeFocused" with timeout 120000ms
  - waiting for getByRole('button', { name: '安排创作', exact: true })
    239 × locator resolved to <button type="button" data-slot="button" class="group/button inline-flex shrink-0 items-center justify-center border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructi…>…</button>
        - unexpected value "inactive"

```

```yaml
- button "安排创作"
```

# Test source

```ts
  1   | import type {Page, Locator, BrowserContext} from "@playwright/test";
  2   | import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
  3   | import {resolve} from "node:path";
  4   | import {expect, test} from "../helpers/test-environment";
  5   |
  6   | const evidence = resolve("../docs/verification/t1136");
  7   | const viewports = [{width:1366,height:900},{width:900,height:900},{width:390,height:900},{width:683,height:450}];
  8   | const wait = {timeout:120_000};
  9   | type Scope = {groupId?:string};
  10  | type Entry = {id:string;projectId:string;accountId:string|null;plannedDate:string;targetStatus:string};
  11  | const title = "发布策略复盘与内容创作计划".repeat(9);
  12  | const handle = "@calendar_creator_" + "long_unbroken_platform_identity_".repeat(8);
  13  |
  14  | async function dispatch<T = {id:string}>(page:Page,id:string,input:unknown,scope:Scope={}):Promise<T> {
  15  |  const response=await page.request.post("/api/v1/dispatch",{...wait,headers:{"content-type":"application/json",...(scope.groupId?{"x-group-id":scope.groupId}:{})},data:{id,input}});
  16  |  expect(response.ok(),id+" HTTP "+response.status()).toBe(true);
  17  |  return (await response.json() as {data:T}).data;
  18  | }
  19  | async function createGroup(page:Page,name:string) {
  20  |  return dispatch(page,"accountGroups.create",{body:{name,idempotencyKey:crypto.randomUUID()}});
  21  | }
  22  | async function transfer(page:Page,accountId:string,toGroupId:string) {
  23  |  const preview=await dispatch<Record<string,unknown>>(page,"accountGroups.members.previewTransfer",{body:{accountId,toGroupId}});
  24  |  await dispatch(page,"accountGroups.members.transfer",{body:{...preview,idempotencyKey:crypto.randomUUID()}});
  25  | }
  26  | async function setup(page:Page) {
  27  |  const group=await createGroup(page,"排期布局验证-"+crypto.randomUUID());
  28  |  const first=await dispatch(page,"accounts.create",{body:{platform:"wechatOfficial",accountHandle:handle,idempotencyKey:crypto.randomUUID()}});
  29  |  const second=await dispatch(page,"accounts.create",{body:{platform:"xiaohongshu",accountHandle:handle+"2",idempotencyKey:crypto.randomUUID()}});
  30  |  await transfer(page,first.id,group.id);await transfer(page,second.id,group.id);
  31  |  const project=await dispatch(page,"projects.create",{body:{title,brief:"本地隔离验证"}},{groupId:group.id});
  32  |  return {group,first,second,project};
  33  | }
  34  | async function enter(page:Page,context:BrowserContext,baseURL:string,groupId:string) {
  35  |  await context.addCookies([{name:"creatoros_current_group",value:encodeURIComponent(groupId),url:baseURL}]);
  36  |  await page.addInitScript(id=>{localStorage.setItem("creatoros:current-group",id);localStorage.removeItem("creatoros:current-account");},groupId);
  37  |  await page.goto("/publishing",wait);
  38  |  await expect(page.getByRole("button",{name:"安排创作",exact:true})).toBeVisible(wait);
  39  | }
  40  | function today() {
  41  |  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  42  |  return ["year","month","day"].map(type=>parts.find(p=>p.type===type)!.value).join("-");
  43  | }
  44  | async function list(page:Page,groupId:string) {
  45  |  const day=today(),month=day.slice(0,7),year=Number(month.slice(0,4)),m=Number(month.slice(5));
  46  |  const end=new Date(Date.UTC(year,m,0)).toISOString().slice(0,10);
  47  |  return dispatch<Entry[]>(page,"group.calendar.list",{params:{groupId},query:{from:month+"-01T00:00:00.000Z",to:end+"T23:59:59.000Z",limit:100,offset:0}},{groupId});
  48  | }
  49  | async function date(page:Page,dialog:Locator) {
  50  |  await dialog.getByRole("button",{name:"创作日期",exact:true}).click(wait);
  51  |  const cell=page.locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden) td[title="'+today()+'"]');
  52  |  await expect(cell).toBeVisible(wait);await cell.click(wait);
  53  |  await expect(dialog.getByLabel("创作日期")).toHaveValue(today(),wait);
  54  | }
  55  | async function openDay(page:Page) {
  56  |  await page.getByRole("button",{name:new RegExp("^"+today()+"(?: 今天)?，发布 ")}).click(wait);
  57  |  await expect(page.getByTestId("calendar-day-drawer")).toBeVisible(wait);
  58  | }
  59  | async function dimensions(dialog:Locator) {
  60  |  return dialog.evaluate(node=>{
  61  |   const rect=node.getBoundingClientRect(),style=getComputedStyle(node);
  62  |   const controls=Array.from(node.querySelectorAll("select,button,input")).filter(el=>getComputedStyle(el).position!=="absolute").map(el=>{
  63  |    const box=el.getBoundingClientRect();
  64  |    return {label:el.getAttribute("aria-label")||el.textContent?.trim(),left:box.left,right:box.right,width:box.width};
  65  |   });
  66  |   return {viewport:innerWidth,left:rect.left,right:rect.right,width:rect.width,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth,maxWidth:style.maxWidth,gridTemplateColumns:style.gridTemplateColumns,controls};
  67  |  });
  68  | }
  69  | function noOverflow(d:Awaited<ReturnType<typeof dimensions>>) {
  70  |  return d.left>=15&&d.right<=d.viewport-15&&d.scrollWidth<=d.clientWidth+1&&d.controls.every(c=>c.left>=d.left-1&&c.right<=d.right+1);
  71  | }
  72  | async function capture(page:Page,dialog:Locator,name:string) {
  73  |  mkdirSync(resolve(evidence,"screenshots"),{recursive:true});
  74  |  await page.screenshot({path:resolve(evidence,"screenshots",name+".png")});
  75  |  return {name,url:page.url(),viewport:page.viewportSize(),dimensions:await dimensions(dialog),text:await dialog.innerText()};
  76  | }
  77  |
  78  | test("T-1136 当前真实排期长名称的四种窗口尺寸",async({page,context,baseURL})=>{
  79  |  test.setTimeout(600_000);page.setDefaultTimeout(120_000);page.setDefaultNavigationTimeout(120_000);
  80  |  const {group,first,project}=await setup(page);await enter(page,context,baseURL!,group.id);
  81  |  const records=[];
  82  |  for(const vp of viewports) {
  83  |   await page.setViewportSize(vp);const trigger=page.getByRole("button",{name:"安排创作",exact:true});await trigger.click(wait);
  84  |   const dialog=page.getByRole("dialog",{name:"安排创作日期"});
  85  |   await expect(dialog.getByRole("option",{name:"微信公众号 · "+handle,exact:true})).toHaveCount(1,wait);
  86  |   await dialog.getByLabel("共享项目",{exact:true}).selectOption(project.id,wait);
  87  |   await dialog.getByLabel("发布目标（可选）",{exact:true}).selectOption(first.id,wait);
  88  |   records.push(await capture(page,dialog,"calendar-long-"+vp.width));
> 89  |   await page.keyboard.press("Escape");await expect(dialog).toBeHidden(wait);await expect(trigger).toBeFocused(wait);
      |                                                                                                   ^ Error: expect(locator).toBeFocused() failed
  90  |  }
  91  |  writeFileSync(resolve(evidence,"layout-observation.json"),JSON.stringify({surface:"browser",mode:"non-fixture",input:"fresh public synthetic group/project/accounts",viewports:records},null,2));
  92  |  expect(records.filter(r=>!noOverflow(r.dimensions)).map(r=>r.name),"弹窗或控件超出窗口/容器").toEqual([]);
  93  |  for(const r of records.filter(r=>r.viewport!.width>=640))expect(r.dimensions.width).toBeCloseTo(448,0);
  94  |  expect(await list(page,group.id)).toHaveLength(0);
  95  | });
  96  |
  97  | test("T-1136 真实保存回读重开、目标转组重选与失败保留输入",async({page,context,baseURL})=>{
  98  |  test.setTimeout(720_000);page.setDefaultTimeout(120_000);page.setDefaultNavigationTimeout(120_000);
  99  |  const {group,first,second,project}=await setup(page);await enter(page,context,baseURL!,group.id);await page.setViewportSize({width:900,height:900});
  100 |  const captures=[];const trigger=page.getByRole("button",{name:"安排创作",exact:true});
  101 |  await trigger.click(wait);let dialog=page.getByRole("dialog",{name:"安排创作日期"});
  102 |  await expect(dialog.getByRole("option",{name:"微信公众号 · "+handle,exact:true})).toHaveCount(1,wait);
  103 |  expect(noOverflow(await dimensions(dialog))).toBe(true);
  104 |  await dialog.getByLabel("共享项目",{exact:true}).selectOption(project.id,wait);await date(page,dialog);
  105 |  await dialog.getByLabel("发布目标（可选）",{exact:true}).selectOption(first.id,wait);
  106 |  await dialog.getByRole("button",{name:"保存计划",exact:true}).click(wait);await expect(dialog).toBeHidden(wait);
  107 |  let rows=await list(page,group.id);expect(rows).toHaveLength(1);const entry=rows[0]!;
  108 |  expect(entry).toMatchObject({projectId:project.id,accountId:first.id,plannedDate:today(),targetStatus:"ready"});
  109 |  await page.reload(wait);expect(await list(page,group.id)).toEqual(rows);
  110 |  await trigger.click(wait);dialog=page.getByRole("dialog",{name:"安排创作日期"});await expect(dialog.getByLabel("共享项目")).toBeVisible(wait);
  111 |  await dialog.getByRole("button",{name:"取消",exact:true}).click(wait);await expect(dialog).toBeHidden(wait);expect(await list(page,group.id)).toEqual(rows);
  112 |  const other=await createGroup(page,"排期目标转出验证-"+crypto.randomUUID());await transfer(page,first.id,other.id);
  113 |  await page.reload(wait);await openDay(page);await page.getByRole("button",{name:"重新选择目标",exact:true}).click(wait);
  114 |  dialog=page.getByRole("dialog",{name:"选择发布目标"});await expect(dialog.getByRole("option",{name:"小红书 · "+handle+"2",exact:true})).toHaveCount(1,wait);
  115 |  await dialog.getByLabel("发布目标（可选）",{exact:true}).selectOption(second.id,wait);
  116 |  let injected=0;
  117 |  await page.route("**/api/v1/dispatch",async route=>{
  118 |   const payload=route.request().postDataJSON();
  119 |   if(payload?.id==="calendar.entries.target"&&injected===0){injected++;await route.fulfill({status:409,contentType:"application/json",body:JSON.stringify({data:null,error:{code:"ConflictError",message:"隔离测试：一次保存失败"}})});return;}
  120 |   await route.fallback();
  121 |  });
  122 |  await dialog.getByRole("button",{name:"保存计划",exact:true}).click(wait);await expect(dialog.getByRole("alert")).toBeVisible(wait);
  123 |  expect(injected).toBe(1);await expect(dialog.getByLabel("发布目标（可选）")).toHaveValue(second.id,wait);
  124 |  rows=await list(page,group.id);expect(rows[0]).toMatchObject({id:entry.id,accountId:first.id,targetStatus:"needs_reselection"});
  125 |  captures.push(await capture(page,dialog,"calendar-save-error-900"));
  126 |  await dialog.getByRole("button",{name:"取消",exact:true}).click(wait);await expect(dialog).toBeHidden(wait);expect(await list(page,group.id)).toEqual(rows);
  127 |  await page.getByRole("button",{name:"重新选择目标",exact:true}).click(wait);dialog=page.getByRole("dialog",{name:"选择发布目标"});
  128 |  await expect(dialog.getByLabel("发布目标（可选）")).toBeEnabled(wait);
  129 |  await dialog.getByLabel("发布目标（可选）").selectOption(second.id,wait);
  130 |  await dialog.getByRole("button",{name:"保存计划",exact:true}).click(wait);await expect(dialog).toBeHidden(wait);
  131 |  rows=await list(page,group.id);expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({id:entry.id,projectId:project.id,accountId:second.id,targetStatus:"ready"});
  132 |  await page.reload(wait);expect(await list(page,group.id)).toEqual(rows);
  133 |  await page.goto("/projects",wait);await page.goto("/publishing",wait);expect(await list(page,group.id)).toEqual(rows);
  134 |  // 空目标沿正式原操作，保真实entry/归属，不开启发布或模型。
  135 |  await transfer(page,second.id,other.id);await page.reload(wait);await openDay(page);await page.getByRole("button",{name:"重新选择目标",exact:true}).click(wait);
  136 |  dialog=page.getByRole("dialog",{name:"选择发布目标"});await expect(dialog.getByText("当前组未绑定平台账号，可先安排创作。")).toBeVisible(wait);
  137 |  await dialog.getByLabel("发布目标（可选）").selectOption("",wait);
  138 |  captures.push(await capture(page,dialog,"calendar-empty-target-900"));
  139 |  await dialog.getByRole("button",{name:"保存计划",exact:true}).click(wait);await expect(dialog).toBeHidden(wait);
  140 |  rows=await list(page,group.id);expect(rows[0]).toMatchObject({id:entry.id,accountId:null,targetStatus:"unassigned"});
  141 |  writeFileSync(resolve(evidence,"public-write-read-observation.json"),JSON.stringify({surface:"browser",mode:"non-fixture",witnesses:{groupId:group.id,projectId:project.id,entryId:entry.id},finalEntry:rows[0],faultFixture:{operation:"calendar.entries.target",http:409,count:injected,successfulWritesReplaced:false},captures},null,2));
  142 | });
  143 |
  144 | test("T-1136 读取中及共享反馈、参考素材弹窗仍可操作",async({page,context,baseURL})=>{
  145 |  test.setTimeout(600_000);page.setDefaultTimeout(120_000);page.setDefaultNavigationTimeout(120_000);
  146 |  const {group,project}=await setup(page);await enter(page,context,baseURL!,group.id);
  147 |  const captures=[];
  148 |  let release!:()=>void,held=false;const gate=new Promise<void>(resolve=>{release=resolve;});
  149 |  await page.route("**/api/v1/dispatch",async route=>{
  150 |   if(route.request().postDataJSON()?.id==="accountGroups.get"&&!held){held=true;await gate;}
  151 |   await route.fallback();
  152 |  });
  153 |  await page.getByRole("button",{name:"安排创作",exact:true}).click(wait);
  154 |  let dialog=page.getByRole("dialog",{name:"安排创作日期"});
  155 |  try {
  156 |   await expect(dialog.getByText("正在读取当前组的平台账号…")).toBeVisible(wait);
  157 |   await expect(dialog.getByRole("button",{name:"保存计划",exact:true})).toBeDisabled(wait);
  158 |   captures.push(await capture(page,dialog,"calendar-loading-900"));
  159 |  } finally {release();}
  160 |  await expect(dialog.getByLabel("共享项目")).toBeEnabled(wait);
  161 |  await dialog.getByRole("button",{name:"取消",exact:true}).click(wait);expect(await list(page,group.id)).toHaveLength(0);
  162 |  // 反馈只填写、检查和关闭；不发送反馈、外部消息或诊断日志。
  163 |  await page.getByRole("button",{name:"帮助与反馈",exact:true}).click(wait);
  164 |  dialog=page.getByRole("dialog",{name:"帮助与反馈",exact:true});
  165 |  await dialog.getByLabel("问题摘要",{exact:true}).fill("本地隔离验证弹窗可操作",wait);
  166 |  await dialog.getByLabel("问题描述",{exact:true}).fill("核对表单、中文换行和关闭功能，未提交反馈。",wait);
  167 |  for(const vp of [{width:1366,height:900},{width:900,height:900}]){
  168 |   await page.setViewportSize(vp);expect(noOverflow(await dimensions(dialog))).toBe(true);
  169 |   captures.push(await capture(page,dialog,"shared-feedback-"+vp.width));
  170 |  }
  171 |  await page.keyboard.press("Escape");await expect(dialog).toBeHidden(wait);
  172 |  await expect(page.getByRole("button",{name:"帮助与反馈",exact:true})).toBeFocused(wait);
  173 |  const name="本地弹窗预览图.png",bytes=readFileSync(resolve("public/douyin-icon.png"));
  174 |  const upload=await dispatch<{uploadId:string;uploadUrl:string}>(page,"assets.uploads.create",{body:{assetType:"image",mimeType:"image/png",fileSize:bytes.length,fileName:name}},{groupId:group.id});
  175 |  const put=await page.request.put(upload.uploadUrl,{...wait,headers:{"content-type":"image/png"},data:bytes});expect(put.ok()).toBe(true);
  176 |  const asset=await dispatch<{id:string;currentFileId:string}>(page,"assets.uploads.complete",{params:{uploadId:upload.uploadId},body:{name}},{groupId:group.id});
  177 |  const canvas=await dispatch(page,"canvas.create",{body:{title:"共享弹窗验证画布",projectId:project.id}},{groupId:group.id});
  178 |  await page.goto("/canvases/"+canvas.id,wait);await page.getByRole("button",{name:"＋ 图片生成",exact:true}).click(wait);
  179 |  await page.getByRole("button",{name:"编导与详情",exact:true}).click(wait);
  180 |  const inspector=page.locator("aside").filter({has:page.getByRole("heading",{name:"节点设置",exact:true})});
  181 |  await inspector.getByLabel("模式",{exact:true}).selectOption("image_to_image",wait);
  182 |  const field=inspector.getByRole("button",{name:"参考图片",exact:true});await field.click(wait);
  183 |  dialog=page.getByRole("dialog",{name:"参考图片",exact:true});
  184 |  const preview=dialog.getByRole("button",{name:"预览 "+name,exact:true});await preview.click(wait);
  185 |  const large=dialog.getByAltText("画布图片素材",{exact:true});
  186 |  await expect.poll(()=>large.evaluate((node:HTMLImageElement)=>node.complete&&node.naturalWidth>0),wait).toBe(true);
  187 |  await expect.poll(()=>preview.getByRole("img").evaluate((node:HTMLImageElement)=>node.complete&&node.naturalWidth>0),wait).toBe(true);
  188 |  for(const vp of [{width:1366,height:900},{width:900,height:900},{width:683,height:450}]){
  189 |   await page.setViewportSize(vp);const box=await dialog.boundingBox();expect(box).not.toBeNull();
```
