import {expect,test as base,chromium,type Page} from "@playwright/test";
import {type ExternalNetworkAttempt,recordExternalNetworkAttempt,formatExternalNetworkAttempts} from "../helpers/network-policy";
// 复用外网守卫，证据只归本任务；不触发历史 T1207 索引写入。
const test=base.extend({context:async({context},provide)=>{
 const attempts:ExternalNetworkAttempt[]=[];
 await context.route("**/*",async route=>{if(recordExternalNetworkAttempt(attempts,"http",route.request().url()))await route.abort("blockedbyclient");else await route.continue();});
 await context.routeWebSocket("**/*",async socket=>{if(recordExternalNetworkAttempt(attempts,"websocket",socket.url()))await socket.close({code:1008,reason:"External network requests are disabled in browser tests."});else socket.connectToServer();});
 await provide(context);
 expect(attempts,formatExternalNetworkAttempts(attempts)).toEqual([]);
}});
import type {AccountGroupResource,PlatformAccountResource} from "@creatoros/contract";
import {mkdirSync,writeFileSync,mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {execFileSync} from "node:child_process";
import {resolve,join} from "node:path";
const output=resolve("../docs/verification/t1345/e2e");
const wait={timeout:120_000};
const copies:Array<{checkpoint:string;check_ids:string[];viewport:{width:number;height:number};text:string;nativeZoom?:number}>=[];
async function dispatch<T>(page:Page,id:string,input:unknown,groupId?:string):Promise<T>{
 const response=await page.request.post("/api/v1/dispatch",{...wait,headers:{"content-type":"application/json",...(groupId?{"x-group-id":groupId}:{})},data:{id,input}});
 expect(response.ok(),`${id}:HTTP${response.status()}`).toBe(true);return (await response.json()).data;
}
const groupList=(page:Page)=>dispatch<AccountGroupResource[]>(page,"accountGroups.list",{query:{page:1,pageSize:100,includeArchived:true}});
async function more(page:Page,name:string,action:string){await page.getByRole("button",{name:`管理${name}`,exact:true}).click(wait);await page.getByRole("menuitem",{name:action,exact:true}).click(wait);}
async function capture(page:Page,name:string,check_ids:string[]=[]){await page.screenshot({path:resolve(output,`${name}.png`),animations:"disabled"});const text=await page.locator("body").innerText();writeFileSync(resolve(output,`${name}.txt`),text);copies.push({checkpoint:name,check_ids,viewport:page.viewportSize()!,text});}
test("T1345 首用户真实建组与单层管理、平台一次点击未知恢复",async({page})=>{
 test.setTimeout(7_200_000);page.setDefaultTimeout(120_000);page.setDefaultNavigationTimeout(120_000);mkdirSync(output,{recursive:true});
 // 本测试使用全新配置私有根；先读真实完整total为0，禁止借清除用户数据造首用户。
 let allowGuide=false,guideHeld=false,releaseGuide!:()=>void;const guideGate=new Promise<void>(done=>{releaseGuide=done;});
 await page.route("**/api/v1/dispatch",async route=>{let body;try{body=route.request().postDataJSON();}catch{}if(body?.id==="accountGroups.list"&&body.input?.query?.pageSize===1){if(!allowGuide){await route.abort("failed");return;}if(!guideHeld){guideHeld=true;const real=await route.fetch(wait);await guideGate;await route.fulfill({response:real});return;}}await route.continue();});
 await page.goto("/",wait);await expect(page.getByText("引导进度暂时无法读取，其他功能可以正常使用。",{exact:true})).toBeVisible(wait);await expect(page.getByRole("link",{name:"创建第一个账号组",exact:true})).toHaveCount(0);await capture(page,"first-home-read-error",["first_group_entry"]);
 allowGuide=true;await page.getByRole("region",{name:"新手引导",exact:true}).getByRole("button",{name:"重试",exact:true}).click(wait);await expect.poll(()=>guideHeld,wait).toBe(true);await expect(page.getByRole("link",{name:"创建第一个账号组",exact:true})).toHaveCount(0);await capture(page,"first-home-read-loading",["first_group_entry"]);releaseGuide();
 expect(await groupList(page)).toHaveLength(0);
 const entry=page.getByRole("link",{name:"创建第一个账号组",exact:true});await expect(entry).toBeVisible(wait);await page.unroute("**/api/v1/dispatch");
 const observations:unknown[]=[];
 for(const viewport of [{width:1366,height:900},{width:1024,height:680}]){
  await page.setViewportSize(viewport);await expect(entry).toBeInViewport();await capture(page,`first-home-${viewport.width}`,["first_group_entry"]);
 }
 await entry.click(wait);await expect(page.getByRole("region",{name:"创建你的第一个账号组"})).toBeVisible(wait);
 await page.getByLabel("新账号组名称").fill("长名称创作者与品牌的多平台工作区甲");await page.getByRole("button",{name:"创建账号组",exact:true}).click(wait);
 await expect(page.getByRole("heading",{name:"选择平台，扫码绑定",exact:true})).toBeVisible(wait);
 const group=(await groupList(page)).find(row=>row.name==="长名称创作者与品牌的多平台工作区甲")!;expect(group).toBeTruthy();
 await expect(page.getByTestId("account-switcher-trigger")).toHaveAccessibleName(`当前账号组：${group.name}`,wait);
 await expect(page.getByRole("button",{name:"扫码绑定抖音账号",exact:true})).toBeEnabled(wait);
 expect(await page.evaluate(()=>localStorage.getItem("creatoros:current-group"))).toBe(group.id);
 for(const viewport of [{width:1366,height:900},{width:1024,height:680}]){await page.setViewportSize(viewport);await expect(page.getByTestId("account-empty-state")).toBeVisible(wait);await capture(page,`first-group-empty-${viewport.width}`,["first_group_entry","empty_next_action","responsive_and_zoom"]);}
 // 隔离公共账号登记仅提供真实管理行见证，不冒扫码身份验证。生产页面手动登记入口已移除。
 const accounts:PlatformAccountResource[]=[];
 for(const [platform,name] of [["douyin","甲的很长平台账号名称用于检查右侧动作仍可访问"],["xiaohongshu","甲的小红书账号"]] as const){accounts.push(await dispatch(page,"accounts.create",{body:{platform,accountHandle:name,idempotencyKey:crypto.randomUUID()}},group.id));}
 await page.reload(wait);await expect(page.getByTestId("group-member-row")).toHaveCount(2,wait);
 for(const viewport of [{width:1366,height:900},{width:1024,height:680}]){
  await page.setViewportSize(viewport);
  for(const title of ["手动登记平台账号","共享资源","整理历史资料"]){await expect(page.getByRole("region",{name:title,exact:true})).toHaveCount(0);}
  for(const account of accounts){await expect(page.getByText(account.accountHandle,{exact:true})).toHaveCount(1);await expect(page.getByRole("button",{name:`管理${account.accountHandle}`,exact:true})).toBeInViewport();}
  await capture(page,`members-${viewport.width}`,["removed_and_single_row","group_control","member_detail","responsive_and_zoom"]);
  await page.emulateMedia({colorScheme:"dark"});await expect(page.locator("html")).toHaveClass(/dark/);await expect(page.getByRole("button",{name:"扫码绑定抖音账号",exact:true})).toBeEnabled(wait);await capture(page,`members-dark-${viewport.width}`,["removed_and_single_row","responsive_and_zoom"]);await page.emulateMedia({colorScheme:"light"});
  await more(page,accounts[0]!.accountHandle,"转组");const dialog=page.getByRole("dialog",{name:"转移平台账号"});await expect(dialog).toBeVisible(wait);await page.keyboard.press("Escape");await expect(dialog).toBeHidden(wait);await expect(page.getByRole("button",{name:`管理${accounts[0]!.accountHandle}`,exact:true})).toBeFocused(wait);
 }
 const b=await dispatch<AccountGroupResource>(page,"accountGroups.create",{body:{name:"账号转组目标乙",idempotencyKey:crypto.randomUUID()}});
 await page.reload(wait);await more(page,accounts[0]!.accountHandle,"转组");const transfer=page.getByRole("dialog",{name:"转移平台账号"});await transfer.getByLabel("目标账号组").selectOption(b.id);await transfer.getByRole("button",{name:"查看转组影响",exact:true}).click(wait);await expect(transfer.getByText(/历史作品和数据仍在原组/)).toBeVisible(wait);await transfer.getByRole("button",{name:"确认转组",exact:true}).click(wait);await expect(transfer).toBeHidden(wait);
 const readB=await dispatch<AccountGroupResource>(page,"accountGroups.get",{params:{groupId:b.id}});expect(readB.members.some(row=>row.accountId===accounts[0]!.id&&row.leftAt===null)).toBe(true);
 await page.getByRole("button",{name:/账号转组目标乙.*1 个平台账号/}).click(wait);await page.getByRole("button",{name:"进入此账号组",exact:true}).click(wait);await expect(page.getByTestId("account-switcher-trigger")).toHaveAccessibleName(`当前账号组：${b.name}`,wait);await expect(page.getByTestId("group-member-row")).toHaveCount(1,wait);
 await more(page,b.name,"重命名");await page.getByLabel("账号组名称",{exact:true}).fill("乙已保存名称");await page.getByRole("button",{name:"保存名称",exact:true}).click(wait);await expect(page.getByRole("dialog",{name:"重命名账号组"})).toBeHidden(wait);expect((await dispatch<AccountGroupResource>(page,"accountGroups.get",{params:{groupId:b.id}})).name).toBe("乙已保存名称");
 await page.reload(wait);await expect(page.getByRole("region",{name:"乙已保存名称",exact:true})).toBeVisible(wait);
 // 当前甲1浏览乙3仍可按真实owner协议管理乙对象，不能凭菜单存在冒可用。
 let noncurrentB=await dispatch<AccountGroupResource>(page,"accountGroups.get",{params:{groupId:b.id}});noncurrentB=await dispatch<AccountGroupResource>(page,"accountGroups.update",{params:{groupId:b.id},body:{name:noncurrentB.name,expectedVersion:noncurrentB.version}});
 const managed=await dispatch<PlatformAccountResource>(page,"accounts.create",{body:{platform:"douyin",accountHandle:"乙组非当前管理样例",idempotencyKey:crypto.randomUUID()}},b.id);
 const c=await dispatch<AccountGroupResource>(page,"accountGroups.create",{body:{name:"非当前管理转组丙",idempotencyKey:crypto.randomUUID()}});
 const liveA=await dispatch<AccountGroupResource>(page,"accountGroups.get",{params:{groupId:group.id}});const liveB=await dispatch<AccountGroupResource>(page,"accountGroups.get",{params:{groupId:b.id}});expect(liveA.version).not.toBe(liveB.version);
 await page.getByTestId("account-switcher-trigger").click(wait);await page.getByTestId("account-switcher-menu").locator(`[data-group-id="${group.id}"]`).click(wait);await expect(page.getByTestId("account-switcher-trigger")).toHaveAccessibleName(`当前账号组：${group.name}`,wait);
 await page.getByRole("button",{name:/乙已保存名称.*2 个平台账号/}).click(wait);await expect(page.getByRole("region",{name:"乙已保存名称",exact:true})).not.toContainText("继续创作");
 await more(page,managed.accountHandle,"隐藏");const otherVisibility=page.getByTestId("account-remove-dialog");await otherVisibility.getByLabel("隐藏二次确认").fill("我已确认隐藏该账户");await otherVisibility.getByRole("button",{name:"确认隐藏",exact:true}).click(wait);await expect(otherVisibility).toBeHidden(wait);expect((await dispatch<PlatformAccountResource>(page,"accounts.get",{params:{accountId:managed.id}},group.id)).status).toBe("archived");
 await more(page,managed.accountHandle,"恢复平台账号");await expect(page.getByText(/已隐藏/)).toHaveCount(0);expect((await dispatch<PlatformAccountResource>(page,"accounts.get",{params:{accountId:managed.id}},group.id)).status).toBe("active");
 await more(page,managed.accountHandle,"转组");const otherTransfer=page.getByRole("dialog",{name:"转移平台账号"});await otherTransfer.getByLabel("目标账号组").selectOption(c.id);await otherTransfer.getByRole("button",{name:"查看转组影响",exact:true}).click(wait);await expect(otherTransfer.getByText(/历史作品和数据仍在原组/)).toBeVisible(wait);await otherTransfer.getByRole("button",{name:"确认转组",exact:true}).click(wait);await expect(otherTransfer).toBeHidden(wait);
 expect((await dispatch<AccountGroupResource>(page,"accountGroups.get",{params:{groupId:c.id}},group.id)).members.some(member=>member.accountId===managed.id&&member.leftAt===null)).toBe(true);expect(await page.evaluate(()=>localStorage.getItem("creatoros:current-group"))).toBe(group.id);await capture(page,"noncurrent-owner-management");
 observations.push({checkpoint:"noncurrent-owner-management",currentGroup:group.id,currentGroupVersion:liveA.version,selectedGroup:b.id,selectedGroupVersion:liveB.version,targetGroup:c.id,accountId:managed.id,hideRestoreTransferReadback:true});
 await page.getByRole("button",{name:"进入此账号组",exact:true}).click(wait);await expect(page.getByTestId("account-switcher-trigger")).toHaveAccessibleName("当前账号组：乙已保存名称",wait);
 // 当前组归档由统一scope刷新协议接管，恢复后真实读回仍可进入。
 await more(page,"乙已保存名称","归档账号组");await expect(page.getByTestId("account-switcher-trigger")).toHaveAccessibleName("当前账号组：未选择账号组",wait);expect(await page.evaluate(()=>localStorage.getItem("creatoros:current-group"))).toBeNull();await expect(page.getByRole("link",{name:"继续创作 →"})).toHaveCount(0);
 await page.getByLabel("显示已归档组").check(wait);await page.getByRole("button",{name:/乙已保存名称.*已归档/}).click(wait);await more(page,"乙已保存名称","恢复账号组");
 expect((await dispatch<AccountGroupResource>(page,"accountGroups.get",{params:{groupId:b.id}})).status).toBe("active");await page.getByRole("button",{name:"进入此账号组",exact:true}).click(wait);await expect(page.getByTestId("account-switcher-trigger")).toHaveAccessibleName("当前账号组：乙已保存名称",wait);
 await more(page,accounts[0]!.accountHandle,"隐藏");const visibility=page.getByTestId("account-remove-dialog");await visibility.getByLabel("隐藏二次确认").fill("我已确认隐藏该账户");await visibility.getByRole("button",{name:"确认隐藏",exact:true}).click(wait);await expect(visibility).toBeHidden(wait);expect((await dispatch<PlatformAccountResource>(page,"accounts.get",{params:{accountId:accounts[0]!.id}},b.id)).status).toBe("archived");
 await more(page,accounts[0]!.accountHandle,"恢复平台账号");await expect(page.getByText(/已隐藏/)).toHaveCount(0);expect((await dispatch<PlatformAccountResource>(page,"accounts.get",{params:{accountId:accounts[0]!.id}},b.id)).status).toBe("active");
 // 阻止真实外部扫码，保留真实网络失败；不以伪造成功回执冒真实平台绑定。
 let starts=0;const intentKeys:string[]=[];
 await page.route("**/api/v1/dispatch",async route=>{const req=route.request();if(req.method()==="POST"){const body=req.postDataJSON();if(body.id==="accounts.bind.start"){starts++;intentKeys.push(body.input.body.idempotencyKey);await route.abort("failed");return;}}await route.continue();});
 await page.getByRole("button",{name:"扫码绑定快手账号",exact:true}).click(wait);const binding=page.getByRole("dialog",{name:"扫码绑定快手账号"});await expect(binding.getByRole("button",{name:"核对上次绑定请求",exact:true})).toBeVisible(wait);await capture(page,"binding-unknown",["scan_once_and_continue"]);expect(starts).toBe(1);
 await page.keyboard.press("Escape");await expect(binding).toBeHidden(wait);await page.getByRole("button",{name:"扫码绑定快手账号",exact:true}).click(wait);await expect(binding.getByRole("button",{name:"核对上次绑定请求",exact:true})).toBeVisible(wait);expect(starts).toBe(1);await page.keyboard.press("Escape");
 await page.reload(wait);await page.getByRole("button",{name:"扫码绑定快手账号",exact:true}).click(wait);await expect(binding.getByRole("button",{name:"核对上次绑定请求",exact:true})).toBeVisible(wait);expect(starts).toBe(1);await page.keyboard.press("Escape");await page.unroute("**/api/v1/dispatch");
 await page.goto("/projects",wait);await page.goBack(wait);await expect(page).toHaveURL(/\/accounts(?:\?|#|$)/);await expect(page.getByRole("region",{name:"乙已保存名称",exact:true})).toBeVisible(wait);await expect(page.getByText(accounts[0]!.accountHandle,{exact:true})).toHaveCount(1);await page.reload(wait);await expect(page.getByRole("region",{name:"乙已保存名称",exact:true})).toBeVisible(wait);expect(starts).toBe(1);
 const zoomContext=await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(),"creatoros-t1345-zoom-")),{channel:process.env.CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL||"chrome",headless:true,timeout:120_000,viewport:{width:1366,height:900},locale:"zh-CN"});
 let zoomControl:ReturnType<Page["locator"]>|undefined,originalZoom:string|undefined;const zoomPage=await zoomContext.newPage(),settings=await zoomContext.newPage();const cdp=await zoomContext.newCDPSession(zoomPage);
 try{
  zoomPage.setDefaultTimeout(120_000);zoomPage.setDefaultNavigationTimeout(120_000);await zoomContext.addCookies(await page.context().cookies());const origin=new URL(page.url()).origin;await zoomContext.addInitScript(({origin,groupId})=>{if(location.origin===origin)localStorage.setItem("creatoros:current-group",groupId);},{origin,groupId:b.id});
  await zoomContext.route("**/*",route=>{const u=new URL(route.request().url());return ["localhost","127.0.0.1"].includes(u.hostname)||["data:","blob:","about:","chrome:"].includes(u.protocol)?route.continue():route.abort("blockedbyclient");});
  await zoomPage.goto(origin+"/accounts",wait);await expect(zoomPage.getByRole("region",{name:"乙已保存名称",exact:true})).toContainText("当前工作区",wait);
  await settings.goto("chrome://settings/appearance",wait);const controls=await settings.locator("select").evaluateAll(nodes=>nodes.map(element=>{const node=element as HTMLSelectElement;return {id:node.id,value:node.value,options:[...node.options].map(option=>option.textContent?.trim())};}));const choice=controls.filter(row=>row.options.includes("200%"));expect(choice).toHaveLength(1);zoomControl=settings.locator("select#"+choice[0]!.id);originalZoom=choice[0]!.value;await zoomControl.selectOption({label:"200%"});await expect.poll(async()=>(await cdp.send("Page.getLayoutMetrics")).cssVisualViewport.zoom,wait).toBe(2);
  const actual=await zoomPage.evaluate(()=>({rootZoom:getComputedStyle(document.documentElement).zoom,bodyZoom:getComputedStyle(document.body).zoom,innerWidth,innerHeight,devicePixelRatio}));expect(actual.rootZoom).toBe("1");expect(actual.bodyZoom).toBe("1");await settings.screenshot({path:resolve(output,"chrome-native-200-settings.png")});await zoomPage.bringToFront();
  const longAction=zoomPage.getByRole("button",{name:`管理${accounts[0]!.accountHandle}`,exact:true});await longAction.scrollIntoViewIfNeeded();await expect(longAction).toBeInViewport(wait);await longAction.click(wait);await zoomPage.getByRole("menuitem",{name:"转组",exact:true}).click(wait);await expect(zoomPage.getByRole("dialog",{name:"转移平台账号"})).toBeVisible(wait);await zoomPage.keyboard.press("Escape");await expect(longAction).toBeFocused(wait);await capture(zoomPage,"native-200-management",["responsive_and_zoom","member_detail","back_refresh_repeat"]);copies[copies.length-1]!.nativeZoom=2;observations.push({checkpoint:"native-200-management",method:"Chrome appearance 200%",actual});
 }finally{if(zoomControl&&originalZoom!==undefined){await zoomControl.selectOption(originalZoom);await expect.poll(async()=>(await cdp.send("Page.getLayoutMetrics")).cssVisualViewport.zoom,wait).toBe(1);}await zoomContext.close();}
 for(const viewport of [{width:1366,height:900},{width:1024,height:680}]){await page.setViewportSize(viewport);await capture(page,`completed-${viewport.width}`,["scan_once_and_continue","group_control","member_selection","member_detail","empty_next_action","back_refresh_repeat","responsive_and_zoom"]);}
 writeFileSync(resolve(output,"visible-copy.json"),JSON.stringify({schema:"frontend-visible-copy/v1",task_id:"T-1345",commit_sha:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),captures:copies},null,2));
 observations.push({firstGroupId:group.id,transferTarget:b.id,accountIds:accounts.map(a=>a.id),starts,intentKeys: intentKeys.map(key=>({length:key.length})),realPlatformCalls:0,controlledPublicRunEvidence:"public-service.txt"});writeFileSync(resolve(output,"observed.json"),JSON.stringify({surface:"browser",publicGroupAndAccountWrites:true,realPlatformBinding:false,observations},null,2));
});
