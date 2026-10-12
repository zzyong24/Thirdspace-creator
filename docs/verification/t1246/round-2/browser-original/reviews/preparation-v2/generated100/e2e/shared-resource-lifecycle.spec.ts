import {writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {expect,test} from "../helpers/test-environment";

test("TEST-T1105-RESOURCE 共享资源真实空态、刷新返回与失败重读",async({page,context,baseURL},testInfo)=>{
 test.setTimeout(Math.max((7_200_000), 17460000));
 page.setDefaultTimeout(120_000);
 page.setDefaultNavigationTimeout(120_000);
 const created=await page.request.post("/api/v1/dispatch",{timeout:120_000,data:{id:"accountGroups.create",input:{body:{name:"共享资源验收组",idempotencyKey:crypto.randomUUID()}}}});
 expect(created.ok(),await created.text()).toBe(true);
 const group=(await created.json() as {data:{id:string}}).data;
 await context.addCookies([{name:"creatoros_current_group",value:encodeURIComponent(group.id),url:baseURL!}]);
 await page.addInitScript(id=>{localStorage.setItem("creatoros:current-group",id);localStorage.removeItem("creatoros:current-account");},group.id);
 await page.setViewportSize({width:1366,height:900});
 await page.goto("/accounts");
 const panel=page.getByRole("region",{name:"共享资源",exact:true});
 const reRead=panel.getByRole("button",{name:"重新读取",exact:true});
 const empty="当前没有共享授权。整理历史资料时，需要的素材与知识会保留来源并授权给目标组。";
 async function settled(){
  await expect(panel).toBeVisible({timeout:120_000});
  await expect(panel.getByText("正在读取共享资源…",{exact:true})).toHaveCount(0,{timeout:120_000});
  await expect(panel.getByText(empty,{exact:true})).toBeVisible({timeout:120_000});
  await expect(reRead).toBeEnabled({timeout:120_000});
 }
 await settled();
 const captures=[{checkpoint:"resource-normal",check_ids:["AC-READ"],viewport:{width:1366,height:900},text:await panel.innerText()}];
 await panel.screenshot({path:testInfo.outputPath("t1105-resource-normal.png"), timeout: 120000});
 await reRead.focus();await page.keyboard.press("Enter");await settled();
 await page.reload();await settled();
 await page.goto("/projects");await page.goBack();await settled();
 let injected=false;
 const failedRead=async(route:import("@playwright/test").Route)=>{
  const request=route.request();
  if(!injected&&request.method()==="POST"&&request.postDataJSON()?.id==="groupResourceGrants.list"){
   injected=true;await route.fulfill({status:500,contentType:"application/json",body:JSON.stringify({error:{code:"TestReadFailure",message:"验收读取失败"}})});return;
  }
  await route.continue();
 };
 await page.route("**/api/v1/dispatch",failedRead);
 await reRead.click();
 await expect(panel.getByRole("alert")).toBeVisible({timeout:120_000});
 await expect(reRead).toBeEnabled({timeout:120_000});
 expect(injected).toBe(true);
 captures.push({checkpoint:"resource-read-error",check_ids:["AC-RECOVERY"],viewport:{width:1366,height:900},text:await panel.innerText()});
 await panel.screenshot({path:testInfo.outputPath("t1105-resource-error.png"), timeout: 120000});
 await page.unroute("**/api/v1/dispatch",failedRead);
 await reRead.click();await settled();
 await page.setViewportSize({width:900,height:900});
 await settled();await reRead.click();await settled();
 await panel.screenshot({path:testInfo.outputPath("t1105-resource-narrow.png"), timeout: 120000});
 captures.push({checkpoint:"resource-recovered-narrow",check_ids:["AC-READ","AC-RECOVERY"],viewport:{width:900,height:900},text:await panel.innerText()});
 writeFileSync(resolve(process.cwd(),(process.env.CREATOROS_T1246_RUN_DIR! + "/original-output/t1105/resource-copy.json")),JSON.stringify(captures,null,2)+"\n");
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 17460000 });
