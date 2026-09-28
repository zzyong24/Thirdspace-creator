import type {Page} from "@playwright/test";
import {expect,test} from "../helpers/test-environment";

async function dispatch(page:Page,id:string,input:unknown,accountId?:string){
 const response=await page.request.post("/api/v1/dispatch",{headers:{"content-type":"application/json",...(accountId?{"x-account-id":accountId}:{})},data:{id,input}});
 expect(response.ok(),`${id} 返回 ${response.status()}`).toBe(true);
 return (await response.json() as {data:{id:string}}).data;
}

test("T-993 画布可保存、重开，切换账号后列表和直链隔离",async({page,context,baseURL})=>{
 const accountA=await dispatch(page,"accounts.create",{params:undefined,query:undefined,body:{platform:"douyin",accountHandle:`@canvas-a-${Date.now()}`}});
 const accountB=await dispatch(page,"accounts.create",{params:undefined,query:undefined,body:{platform:"douyin",accountHandle:`@canvas-b-${Date.now()}`}});
 const project=await dispatch(page,"projects.create",{params:undefined,query:undefined,body:{title:"画布关联项目",brief:""}},accountA.id);
 await context.addCookies([{name:"creatoros_current_account",value:encodeURIComponent(accountA.id),url:baseURL!}]);
 await page.addInitScript(id=>{if(!window.localStorage.getItem("creatoros:current-account"))window.localStorage.setItem("creatoros:current-account",id);},accountA.id);

 await page.goto("/canvases");
 await expect(page.getByRole("heading",{name:"创作画布"})).toBeVisible();
 await page.getByRole("button",{name:"新建画布"}).click();
 await expect(page).toHaveURL(/\/canvases\/[^/]+$/);
 const canvasUrl=page.url();
 await page.getByRole("textbox",{name:"画布标题"}).fill("分镜试验画布");
 await page.getByRole("button",{name:"文字说明"}).click();
 await page.getByRole("textbox",{name:"名称"}).fill("开场镜头");
 await page.getByRole("textbox",{name:"内容"}).fill("日出时从山脚推镜到山顶");
 await page.getByRole("button",{name:"保存",exact:true}).click();
 await expect(page.getByText("已保存",{exact:true})).toBeVisible();
 await page.reload();
 await expect(page.getByRole("textbox",{name:"画布标题"})).toHaveValue("分镜试验画布");
 await expect(page.getByText("开场镜头")).toBeVisible();
 await page.getByText("开场镜头").click();
 await expect(page.getByRole("textbox",{name:"内容"})).toHaveValue("日出时从山脚推镜到山顶");
 await page.getByLabel("关联项目（可选）").selectOption(project.id);
 await page.getByRole("button",{name:"保存",exact:true}).click();
 await expect(page.getByText("已保存",{exact:true})).toBeVisible();
 await page.reload();
 await expect(page.getByLabel("关联项目（可选）")).toHaveValue(project.id);
 await page.getByRole("button",{name:"图片生成"}).click();
 await page.getByRole("textbox",{name:"生成描述"}).fill("山间清晨的第一束光");
 await expect(page.getByRole("button",{name:"生成",exact:true})).toBeDisabled();
 await page.getByRole("button",{name:"视频生成"}).click();
 await page.getByRole("textbox",{name:"生成描述"}).fill("日出时缓慢推镜");
 await expect(page.getByRole("button",{name:"生成",exact:true})).toBeDisabled();
 await page.getByRole("button",{name:"保存",exact:true}).click();
 await expect(page.getByText("已保存",{exact:true})).toBeVisible();

 await page.getByTestId("account-switcher-trigger").click();
 await page.getByTestId("account-switcher-menu").locator(`[data-testid="account-switcher-item"][data-account-id="${accountB.id}"]`).click();
 await page.goto("/canvases");
 await expect(page.getByText("分镜试验画布")).toHaveCount(0);
 await page.goto(canvasUrl);
 await expect(page.getByRole("alert").filter({hasText:"画布不存在"})).toBeVisible();
});

test("T-993 首次自动选账号后画布可创建，新增节点不会重叠",async({page})=>{
 await dispatch(page,"accounts.create",{params:undefined,query:undefined,body:{platform:"douyin",accountHandle:`@canvas-first-${Date.now()}`}});
 await page.goto("/canvases");
 await expect.poll(async()=>page.evaluate(()=>window.localStorage.getItem("creatoros:current-account"))).not.toBeNull();
 await expect(page.getByRole("alert").filter({hasText:"AccountRequiredError"})).toHaveCount(0);
 await page.getByRole("button",{name:"新建画布"}).click();
 await expect(page).toHaveURL(/\/canvases\/[^/]+$/);
 await page.getByRole("button",{name:"文字说明"}).click();
 await page.getByRole("button",{name:"图片生成"}).click();
 const positions=await page.locator(".react-flow__node").evaluateAll(nodes=>nodes.map(node=>(node as HTMLElement).style.transform));
 expect(positions).toHaveLength(2);
 expect(new Set(positions).size).toBe(2);
});
