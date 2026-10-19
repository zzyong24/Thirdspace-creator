import {randomUUID} from "node:crypto";
import type {Page,TestInfo} from "@playwright/test";
import {test,expect as baseExpect} from "./acceptance-support";
const expect=baseExpect.configure({timeout:120_000});
const dialog=(page:Page)=>page.locator('[data-slot="settings-dialog"]');
const native=(page:Page)=>page.locator('[data-native-root="opencut"]');
async function screenshot(page:Page,info:TestInfo,name:string){const path=info.outputPath(`${name}.png`);await page.screenshot({path,animations:"disabled",caret:"hide"});await info.attach(name,{path,contentType:"image/png"});}
async function dispatch<T>(page:Page,id:string,input:unknown,groupId?:string):Promise<T>{
 const response=await page.request.post("/api/v1/dispatch",{timeout:120_000,headers:{"content-type":"application/json",...(groupId?{"x-group-id":groupId}:{})},data:{id,input}});
 expect(response.ok(),`${id} HTTP ${response.status()}: ${await response.text()}`).toBe(true);return (await response.json()).data;
}
test.beforeEach(async({page,context})=>{page.setDefaultTimeout(120_000);page.setDefaultNavigationTimeout(120_000);context.setDefaultTimeout(120_000);});
for(const width of [1366,390])for(const close of ["close","escape"]){
 test(`T1246 fresh直达设置 ${width}px ${close}关闭回首页`,async({page},info)=>{
  test.setTimeout(72000000);await page.setViewportSize({width,height:844});expect(page.url()).toBe("about:blank");
  await page.goto("/settings");await expect(dialog(page)).toBeVisible();await screenshot(page,info,"direct-settings");
  if(close==="escape")await page.keyboard.press("Escape");else await dialog(page).getByRole("button",{name:"关闭",exact:true}).click();
  await page.waitForURL(url=>url.pathname==="/",{timeout:120_000});await expect(page.locator('[data-slot="app-shell"]')).toBeVisible();
  await expect(dialog(page)).not.toBeVisible();await screenshot(page,info,"returned-home");
 });
}
for(const width of [1366,390])test(`T1246 accounts站内来源 ${width}px 完整query/hash与触发焦点`,async({page},info)=>{
 test.setTimeout(72000000);await page.setViewportSize({width,height:844});
 const path="/accounts?filter=real%20scope#original-account";await page.goto(path);
 const settings=page.getByRole("navigation",{name:"主要导航"}).getByRole("link",{name:"设置",exact:true});await settings.click();
 await expect(dialog(page)).toBeVisible();await dialog(page).getByRole("button",{name:"关闭",exact:true}).click();
 await page.waitForURL(url=>url.pathname+url.search+url.hash===path,{timeout:120_000});await expect(settings).toBeFocused();await screenshot(page,info,"accounts-returned");
});
test("T1246 站内设置保完整来源、原生脏工程与触发焦点；reload失效回首页",async({page,context,baseURL},info)=>{
 test.setTimeout(72000000);await page.goto("/accounts");
 const group=await dispatch<{id:string}>(page,"accountGroups.create",{body:{name:`设置返回验收-${randomUUID()}`,idempotencyKey:randomUUID()}});
 const project=await dispatch<{id:string}>(page,"projects.create",{body:{title:"原生脏稿返回验收",brief:"只检查实际工程保存状态",contentType:"video"}},group.id);
 const output=await dispatch<{id:string}>(page,"projects.outputs.create",{params:{projectId:project.id},body:{title:"原工程",contentType:"video",clientRequestId:randomUUID()}},group.id);
 await page.evaluate(id=>{localStorage.setItem("creatoros:current-group",id);localStorage.removeItem("creatoros:current-account");},group.id);
 await context.clearCookies({name:"creatoros_current_account"});await context.addCookies([{name:"creatoros_current_group",value:encodeURIComponent(group.id),url:baseURL!}]);
 const path=`/projects/${project.id}/production?outputId=${encodeURIComponent(output.id)}&filter=a%20b&copilot=0#original-draft`;
 await page.goto(path);await expect(native(page).locator(".native-workbench")).toBeVisible();
 const name=native(page).locator('header input[type="text"]');await name.fill("设置往返前的未保存工程");await name.press("Enter");
 const bench=page.locator('section[aria-label="视频剪辑工作台"]');await expect(bench.getByText("有未保存修改",{exact:true})).toBeVisible();
 const before=await dispatch(page,"outputs.production.editor.get",{params:{outputId:output.id}},group.id);
 const settings=page.getByRole("navigation",{name:"主要导航"}).getByRole("link",{name:"设置",exact:true});await settings.focus();await settings.click();
 await expect(dialog(page)).toBeVisible();await screenshot(page,info,"dirty-settings-open");
 await page.keyboard.press("Escape");await page.waitForURL(url=>url.pathname+url.search+url.hash===path,{timeout:120_000});
 await expect(name).toHaveValue("设置往返前的未保存工程");await expect(bench.getByText("有未保存修改",{exact:true})).toBeVisible();await expect(settings).toBeFocused();
 expect(await dispatch(page,"outputs.production.editor.get",{params:{outputId:output.id}},group.id)).toEqual(before);
 await screenshot(page,info,"dirty-original-returned");
 await settings.click();await expect(dialog(page)).toBeVisible();await page.reload();await expect(dialog(page)).toBeVisible();
 await dialog(page).getByRole("button",{name:"关闭",exact:true}).click();await page.waitForURL(url=>url.pathname==="/",{timeout:120_000});await screenshot(page,info,"reload-home");
 // 同在途task/call/deadline的联合往返另由V3真实公共协议场景核；本例不代签。
});
