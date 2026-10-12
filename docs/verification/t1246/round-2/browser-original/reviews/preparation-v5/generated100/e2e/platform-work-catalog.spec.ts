import { expect as baseExpect, test } from "../helpers/test-environment";
import type { Page, BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { ENDPOINTS } from "@creatoros/contract";
const expect=baseExpect.configure({timeout:120_000});
test.beforeEach(async({page,context})=>{test.setTimeout(Math.max((900_000), 55860000));page.setDefaultTimeout(120_000);page.setDefaultNavigationTimeout(120_000);context.setDefaultTimeout(120_000);});
async function dispatch<T>(page:Page,id:string,input:unknown,groupId?:string,accountId?:string):Promise<T>{
 const response=await page.request.post("/api/v1/dispatch",{timeout:120_000,headers:{"content-type":"application/json",...(groupId?{"x-group-id":groupId}:{}),...(accountId?{"x-account-id":accountId}:{})},data:{id,input}});
 expect(response.ok(),`${id}: ${response.status()} ${await response.text()}`).toBe(true);return ((await response.json()) as {data:T}).data;
}
async function group(page:Page,name:string){return await dispatch<{id:string}>(page,"accountGroups.create",{body:{name,idempotencyKey:randomUUID()}});}
async function select(page:Page,context:BrowserContext,baseURL:string,groupId:string){
 await context.clearCookies({name:"creatoros_current_account"});await context.addCookies([{name:"creatoros_current_group",value:encodeURIComponent(groupId),url:baseURL}]);
 // 实际已加载页面与随后导航共用同一组；不累积相互覆盖的addInitScript。
 await page.evaluate(id=>{localStorage.setItem("creatoros:current-group",id);localStorage.removeItem("creatoros:current-account");},groupId);
}
async function account(page:Page,groupId:string,platform:string,accountHandle:string){return await dispatch<{id:string}>(page,"accounts.create",{body:{platform,accountHandle,idempotencyKey:randomUUID()}},groupId);}

test("平台作品页按当前账号显示真实空目录和待核验能力",async({page,context,baseURL})=>{
 await page.goto("/accounts");const owned=await group(page,`E2E作品空目录-${randomUUID()}`);const created=await account(page,owned.id,"douyin","E2E作品空目录号");await select(page,context,baseURL!,owned.id);
 const capabilities=ENDPOINTS.getPlatformAccountCapabilities.response.array().parse(await dispatch(page,"accounts.bindingCapabilities",{}));
 await page.goto("/accounts");const table=page.getByRole("table",{name:"各平台能力"});await expect(table).toBeVisible();
 for(const [platform,label]of [["douyin","抖音"],["xiaohongshu","小红书"],["kuaishou","快手"],["wechatOfficial","公众号"],["wechatVideo","视频号"]]as const){
  const capability=capabilities.find(row=>row.platform===platform);expect(capability).toBeDefined();const row=table.getByRole("row").filter({has:page.getByRole("rowheader",{name:label,exact:true})});
  for(const [index,key]of ["bind","collect","publish","draft","manual"].entries()){const state=capability![key as "bind"|"collect"|"publish"|"draft"|"manual"];const cell=row.getByRole("cell").nth(index);await expect(cell.locator(":scope > span")).toHaveText(state.available?"可用":"暂不可用");await expect(cell).toContainText(state.reason);}
 }
 await page.getByRole("link",{name:"查看E2E作品空目录号的数据",exact:true}).click();await expect(page).toHaveURL(new RegExp(`/accounts/works\\?accountId=${created.id}$`));
 await expect(page.getByTestId("platform-work-catalog")).toHaveAttribute("data-account-id",created.id);await expect(page.getByTestId("catalog-completeness")).toContainText("尚无已核验的作品目录");await expect(page.getByText("当前目录没有作品。可返回账号页查看平台接入状态。")).toBeVisible();await expect(page.getByText("暂无粉丝总量记录。")).toBeVisible();
});

test("本地账号完成多平台目标项目与发布草稿，账号归属隔离",async({page,context,baseURL})=>{
 await page.goto("/accounts");let firstProjectId:string|null=null;
 for(const [platform,title,targetPlatforms]of [["douyin","抖音视频创作链验收",["douyin","kuaishou"]],["xiaohongshu","小红书账号视频创作链验收",["xiaohongshu","wechatOfficial"]]]as const){
  const owned=await group(page,`隔离作品组-${platform}-${randomUUID()}`);const created=await account(page,owned.id,platform,`e2e-${platform}-${randomUUID()}`);
  if(firstProjectId){const foreign=await page.request.post("/api/v1/dispatch",{timeout:120_000,headers:{"content-type":"application/json","x-group-id":owned.id,"x-account-id":created.id},data:{id:"projects.get",input:{params:{projectId:firstProjectId}}}});expect(foreign.status()).toBe(404);}
  const project=await dispatch<{id:string}>(page,"projects.create",{body:{title,brief:"本地隔离环境创作流验收",contentType:"video",targetPlatforms}},owned.id,created.id);
  const artifact=await dispatch<{id:string}>(page,"artifacts.create",{params:{projectId:project.id},body:{title:"创作稿",artifactType:"output_script",stage:"script"}},owned.id,created.id);
  await dispatch(page,"artifacts.versions.create",{params:{artifactId:artifact.id},body:{contentText:`${title}：真实稿件内容。`,changeSummary:"隔离环境验收"}},owned.id,created.id);
  const output=await dispatch<{id:string}>(page,"projects.outputs.create",{params:{projectId:project.id},body:{title:`${title}作品`,contentType:"video",contentRole:"conversion",clientRequestId:randomUUID()}},owned.id,created.id);
  const readGroup=await dispatch<{members:Array<{accountId:string;version:number}>}>(page,"accountGroups.get",{params:{groupId:owned.id}},owned.id,created.id);const member=readGroup.members.find(row=>row.accountId===created.id);expect(member).toBeDefined();
  const publication=await dispatch<{id:string}>(page,"outputs.publications.create",{params:{outputId:output.id},body:{platform,accountId:created.id,expectedMembershipVersion:member!.version,accountReference:created.id}},owned.id,created.id);
  const readProject=await dispatch<{id:string;title:string;briefDetail:{targetPlatforms:string[]}}>(page,"projects.get",{params:{projectId:project.id}},owned.id,created.id);expect(readProject.title).toBe(title);expect(readProject.briefDetail.targetPlatforms).toEqual(targetPlatforms);firstProjectId??=project.id;
  const publications=await dispatch<Array<{id:string}>>(page,"outputs.publications.list",{params:{outputId:output.id},query:{page:1,pageSize:100}},owned.id,created.id);expect(publications.some(row=>row.id===publication.id)).toBe(true);
  await select(page,context,baseURL!,owned.id);await page.goto(`/projects/${project.id}`);await expect(page.getByText(title,{exact:true}).first()).toBeVisible();
 }
});

test("账号页绑定成功后可直接切换到对应的小红书与快手作品页",async({page,context,baseURL})=>{
 await page.goto("/accounts");const owned=await group(page,`绑定导航契约-${randomUUID()}`);const accounts=new Map<string,{id:string;handle:string}>();
 for(const platform of ["xiaohongshu","kuaishou"]as const){const handle=`页面交互验收-${platform}`;const created=await account(page,owned.id,platform,handle);accounts.set(platform,{id:created.id,handle});}
 await select(page,context,baseURL!,owned.id);const starts=new Map<string,number>();
 // 明确的终态UI契约fixture；账号/成员/目录走实际公共接口。本例不代表真实扫码或平台认证。
 await page.route("**/api/v1/dispatch",async route=>{
  const body=route.request().postDataJSON() as {id?:string;input?:{body?:{platform?:string;groupId?:string}}};if(body.id!=="accounts.bind.start")return route.continue();
  const platform=body.input?.body?.platform??"";expect(body.input?.body?.groupId).toBe(owned.id);const created=accounts.get(platform);expect(created).toBeDefined();starts.set(platform,(starts.get(platform)??0)+1);
  const stamp=new Date().toISOString(),data=ENDPOINTS.startAccountBinding.response.parse({runId:`bind-${platform}-${randomUUID()}`,groupId:owned.id,platform,status:"succeeded",accountId:created!.id,error:null,createdAt:stamp,updatedAt:stamp});
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data,meta:{requestId:"e2e-ui-binding-navigation"}})});
 });
 for(const [platform,label]of [["xiaohongshu","小红书"],["kuaishou","快手"]]as const){
  await page.goto("/accounts");await page.getByRole("table",{name:"各平台能力"}).getByRole("button",{name:`扫码绑定${label}账号`,exact:true}).click();const dialog=page.getByRole("dialog",{name:`扫码绑定${label}账号`,exact:true});await expect(dialog).toBeVisible();await dialog.getByRole("button",{name:`扫码绑定${label}账号`,exact:true}).click();await expect(dialog.getByRole("status")).toHaveText("绑定已完成");expect(starts.get(platform)).toBe(1);
  await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();await page.getByRole("link",{name:`查看${accounts.get(platform)!.handle}的数据`,exact:true}).click();await expect(page.getByTestId("platform-work-catalog")).toHaveAttribute("data-account-id",accounts.get(platform)!.id);await expect(page.getByTestId("catalog-completeness")).toContainText("尚无已核验的作品目录");
 }
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 55860000 });
