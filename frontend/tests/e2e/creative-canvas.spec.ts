import type {Page} from "@playwright/test";
import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {expect,test} from "../helpers/test-environment";

type Scope={groupId?:string;accountId?:string};
async function dispatch<T={id:string}>(page:Page,id:string,input:unknown,scope:Scope={}):Promise<T>{
 const response=await page.request.post("/api/v1/dispatch",{timeout:120_000,headers:{"content-type":"application/json",...(scope.groupId?{"x-group-id":scope.groupId}:{}),...(scope.accountId?{"x-account-id":scope.accountId}:{})},data:{id,input}});
 expect(response.ok(),`${id} 返回 ${response.status()}`).toBe(true);
 return (await response.json() as {data:T}).data;
}

async function groupedAccount(page:Page,platform="douyin",handle=`@canvas-${Date.now()}-${crypto.randomUUID()}`,groupName=`画布测试组-${crypto.randomUUID()}`){
 const group=await dispatch(page,"accountGroups.create",{body:{name:groupName,idempotencyKey:crypto.randomUUID()}}) as {id:string};
 const account=await dispatch(page,"accounts.create",{body:{platform,accountHandle:handle,idempotencyKey:crypto.randomUUID()}}) as {id:string};
 const preview=await dispatch(page,"accountGroups.members.previewTransfer",{body:{accountId:account.id,toGroupId:group.id}}) as Record<string,unknown>;
 await dispatch(page,"accountGroups.members.transfer",{body:{...preview,idempotencyKey:crypto.randomUUID()}});
 return {...account,groupId:group.id};
}
async function enterGroup(page:Page,context:import('@playwright/test').BrowserContext,baseURL:string,groupId:string){
 await context.addCookies([{name:"creatoros_current_group",value:encodeURIComponent(groupId),url:baseURL}]);
 await page.addInitScript(id=>{if(!localStorage.getItem("creatoros:current-group")){localStorage.setItem("creatoros:current-group",id);localStorage.removeItem("creatoros:current-account");}},groupId);
}

async function uploadMedia(page:Page,scope:Scope,path:string,assetType:"image"|"video",mimeType:string,name:string){
 const bytes=readFileSync(path);
 const headers={"content-type":"application/json",...(scope.groupId?{"x-group-id":scope.groupId}:{}),...(scope.accountId?{"x-account-id":scope.accountId}:{})};
 const started=await page.request.post("/api/v1/dispatch",{timeout:120_000,headers,data:{id:"assets.uploads.create",input:{params:undefined,query:undefined,body:{assetType,mimeType,fileSize:bytes.length,fileName:name}}}});
 expect(started.ok(),await started.text()).toBe(true);
 const upload=(await started.json() as {data:{uploadId:string;uploadUrl:string}}).data;
 const put=await page.request.put(upload.uploadUrl,{timeout:120_000,headers:{"content-type":mimeType},data:bytes});
 expect(put.ok(),await put.text()).toBe(true);
 const completed=await page.request.post("/api/v1/dispatch",{timeout:120_000,headers,data:{id:"assets.uploads.complete",input:{params:{uploadId:upload.uploadId},query:undefined,body:{name}}}});
 expect(completed.ok(),await completed.text()).toBe(true);
 return (await completed.json() as {data:{id:string}}).data.id;
}

test("T-993 画布可保存、重开，切换账号后列表和直链隔离",async({page,context,baseURL})=>{
 test.setTimeout(600_000);
 const accountA=await groupedAccount(page,"douyin",`@canvas-a-${Date.now()}`);
 const accountB=await groupedAccount(page,"douyin",`@canvas-b-${Date.now()}`);
 const project=await dispatch(page,"projects.create",{params:undefined,query:undefined,body:{title:"画布关联项目",brief:""}},{groupId:accountA.groupId});
 await enterGroup(page,context,baseURL!,accountA.groupId);

 await page.goto("/canvases?tab=canvases");
 await expect(page.getByRole("heading",{name:"创作画布"})).toBeVisible();
 await page.getByRole("button",{name:"新建画布"}).click();
 await expect(page).toHaveURL(/\/canvases\/[^/]+$/,{timeout:120_000});
 const canvasUrl=page.url();
 await page.getByRole("textbox",{name:"画布标题"}).fill("分镜试验画布");
 await page.getByRole("button",{name:"＋ 文字"}).click();
 await page.getByRole("button",{name:"编导与详情"}).click();
 await page.getByRole("textbox",{name:"名称"}).fill("开场镜头");
 await page.getByRole("textbox",{name:"内容",exact:true}).fill("日出时从山脚推镜到山顶");
 await page.getByRole("button",{name:"保存",exact:true}).click();
 await expect(page.getByText("已保存",{exact:true})).toBeVisible();
 await page.reload();
 await expect(page.getByRole("textbox",{name:"画布标题"})).toHaveValue("分镜试验画布");
 await expect(page.getByText("开场镜头")).toBeVisible();
 await page.getByText("开场镜头").click();
 await page.getByRole("button",{name:"编导与详情"}).click();
 await expect(page.getByRole("textbox",{name:"内容",exact:true})).toHaveValue("日出时从山脚推镜到山顶");
 await page.getByLabel("关联项目（可选）").selectOption(project.id);
 await page.getByRole("button",{name:"保存",exact:true}).click();
 await expect(page.getByText("已保存",{exact:true})).toBeVisible();
 await page.reload();
 await expect(page.getByLabel("关联项目（可选）")).toHaveValue(project.id);
 await page.getByRole("button",{name:"＋ 图片生成"}).click();
 await page.locator('[data-testid="canvas-node"]').last().getByRole("textbox",{name:"生成描述"}).fill("山间清晨的第一束光");
 await expect(page.locator('[data-testid="canvas-node"]').last().getByRole("button",{name:"生成",exact:true})).toBeDisabled();
 await page.getByRole("button",{name:"＋ 视频生成"}).click();
 await page.locator('[data-testid="canvas-node"]').last().getByRole("textbox",{name:"生成描述"}).fill("日出时缓慢推镜");
 await expect(page.locator('[data-testid="canvas-node"]').last().getByRole("button",{name:"生成",exact:true})).toBeDisabled();
 await page.getByRole("button",{name:"保存",exact:true}).click();
 await expect(page.getByText("已保存",{exact:true})).toBeVisible();

 await page.getByRole("button",{name:"画布库",exact:true}).click();
 await expect(page).toHaveURL(new RegExp(`projectId=${project.id}`));
 await expect(page.getByRole("heading",{name:"画布关联项目的创作画布"})).toBeVisible();

 await page.getByTestId("account-switcher-trigger").click();
 await page.getByTestId("account-switcher-menu").locator(`[data-testid="account-switcher-item"][data-group-id="${accountB.groupId}"]`).click();
 await page.goto("/canvases?tab=canvases");
 await expect(page.getByText("分镜试验画布")).toHaveCount(0);
 await page.goto(canvasUrl);
 await expect(page.getByRole("alert").filter({hasText:"画布不存在或当前账号无权访问"})).toBeVisible();
});

test("T-993 首次自动选账号后画布可创建，新增节点不会重叠",async({page})=>{
 await groupedAccount(page,"douyin",`@canvas-first-${Date.now()}`);
 await page.goto("/canvases?tab=canvases");
 await expect.poll(async()=>page.evaluate(()=>window.localStorage.getItem("creatoros:current-group"))).not.toBeNull();
 await expect(page.getByRole("alert").filter({hasText:"AccountRequiredError"})).toHaveCount(0);
 await page.getByRole("button",{name:"新建画布"}).click();
 await expect(page).toHaveURL(/\/canvases\/[^/]+$/);
 await page.getByRole("button",{name:"＋ 文字"}).click();
 await page.getByRole("button",{name:"＋ 图片生成"}).click();
 const positions=await page.locator('[data-testid="canvas-node"]').evaluateAll(nodes=>nodes.map(node=>`${(node as HTMLElement).style.left},${(node as HTMLElement).style.top}`));
 expect(positions).toHaveLength(2);
 expect(new Set(positions).size).toBe(2);
 const first=page.locator('[data-testid="canvas-node"]').first();
 await first.locator(".canvas-drag-handle").click();
 const resize=first.getByRole("button",{name:/调整.*大小/});
 await expect(resize).toBeVisible();
 const box=await resize.boundingBox();
 expect(box).not.toBeNull();
 await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);
 await page.mouse.down();
 await page.mouse.move(box!.x+box!.width/2+90,box!.y+box!.height/2+50,{steps:8});
 await page.mouse.up();
 await expect.poll(async()=>first.evaluate(node=>parseFloat((node as HTMLElement).style.width))).toBeGreaterThan(280);
 await expect(page.getByText("已保存",{exact:true})).toBeVisible();
 const width=await first.evaluate(node=>parseFloat((node as HTMLElement).style.width));
 await page.reload();
 await expect(page.locator('[data-testid="canvas-node"]').first()).toHaveCSS("width",`${width}px`);
 const nodes=page.locator('[data-testid="canvas-node"]');
 await nodes.first().locator(".canvas-drag-handle").click();
 await nodes.last().locator(".canvas-drag-handle").click({modifiers:["Shift"]});
 await expect(page.locator('[data-testid="canvas-node"][data-selected="true"]')).toHaveCount(2);
 const beforeMove=await nodes.evaluateAll(items=>items.map(item=>`${(item as HTMLElement).style.left},${(item as HTMLElement).style.top}`));
 const dragBox=await nodes.first().locator(".canvas-drag-handle").boundingBox();
 expect(dragBox).not.toBeNull();
 await page.mouse.move(dragBox!.x+30,dragBox!.y+12);
 await page.mouse.down();
 await page.mouse.move(dragBox!.x+95,dragBox!.y+47,{steps:8});
 await page.mouse.up();
 const afterMove=await nodes.evaluateAll(items=>items.map(item=>`${(item as HTMLElement).style.left},${(item as HTMLElement).style.top}`));
 expect(afterMove[0]).not.toBe(beforeMove[0]);
 expect(afterMove[1]).not.toBe(beforeMove[1]);
 await page.getByRole("button",{name:"适合内容"}).click();
 await expect.poll(async()=>(await nodes.last().locator("[data-canvas-handle-target]").boundingBox())?.y??Infinity).toBeLessThan(900);
 const sourceHandle=await nodes.first().locator("[data-canvas-handle-source]").boundingBox();
 const targetHandle=await nodes.last().locator("[data-canvas-handle-target]").boundingBox();
 expect(sourceHandle).not.toBeNull();
 expect(targetHandle).not.toBeNull();
 await page.mouse.move(sourceHandle!.x+sourceHandle!.width/2,sourceHandle!.y+sourceHandle!.height/2);
 await page.mouse.down();
 await page.mouse.move(targetHandle!.x+targetHandle!.width/2,targetHandle!.y+targetHandle!.height/2,{steps:12});
 await page.mouse.up();
 await expect(page.locator("[data-canvas-connection]")).toHaveCount(1);
 await expect(page.getByText("已保存",{exact:true})).toBeVisible();
 await page.reload();
 await expect(page.locator("[data-canvas-connection]")).toHaveCount(1);
 await page.getByRole("button",{name:"编导与详情"}).click();
 await page.getByRole("button",{name:/移除连线 old-edge|移除连线/}).click();
 await expect(page.locator("[data-canvas-connection]")).toHaveCount(0);
 await expect(page.getByText("已保存",{exact:true})).toBeVisible();
 await page.reload();await expect(page.locator("[data-canvas-connection]")).toHaveCount(0);
});

test("T-993 视口缩放只保存在本地，不改画布内容版本",async({page,context,baseURL})=>{
 const account=await groupedAccount(page,"douyin",`@canvas-viewport-${Date.now()}`);
 await enterGroup(page,context,baseURL!,account.groupId);
 await page.goto("/canvases?tab=canvases");
 await page.getByRole("button",{name:"新建画布"}).click();
 await expect(page).toHaveURL(/\/canvases\/[^/]+$/);
 const canvasId=page.url().split("/").at(-1)!;
 await page.getByRole("button",{name:"＋ 文字"}).click();
 await page.getByRole("button",{name:"保存",exact:true}).click();
 await expect(page.getByText("已保存",{exact:true})).toBeVisible();
 const before=await page.request.post("/api/v1/dispatch",{headers:{"content-type":"application/json","x-group-id":account.groupId},data:{id:"canvas.get",input:{params:{canvasId},query:undefined,body:undefined}}});
 expect(before.ok(),await before.text()).toBe(true);
 const beforeCanvas=(await before.json() as {data:{revision:number;userId:string;groupId:string|null;accountId:string|null}}).data;
 const beforeRevision=beforeCanvas.revision;
 await page.getByRole("button",{name:"放大"}).click();
 await expect(page.getByText(/\d+% · 双击空白处添加文字/)).toBeVisible();
 const key=`creatoros:canvas-viewport:${beforeCanvas.userId}:${beforeCanvas.groupId??beforeCanvas.accountId}:${canvasId}`;
 await expect.poll(async()=>page.evaluate(key=>JSON.parse(window.localStorage.getItem(key)??"null")?.zoom,key)).toBeGreaterThan(1);
 const after=await page.request.post("/api/v1/dispatch",{headers:{"content-type":"application/json","x-group-id":account.groupId},data:{id:"canvas.get",input:{params:{canvasId},query:undefined,body:undefined}}});
 expect(after.ok(),await after.text()).toBe(true);
 expect((await after.json() as {data:{revision:number}}).data.revision).toBe(beforeRevision);
});

test("T-993 双指滚动平移、组合键缩放，节点文字仍可独立滚动",async({page,context,baseURL})=>{
 const account=await groupedAccount(page,"douyin",`@canvas-wheel-${Date.now()}`);
 await enterGroup(page,context,baseURL!,account.groupId);
 await page.goto("/canvases?tab=canvases");await page.getByRole("button",{name:"新建画布"}).click();
 const canvas=page.getByTestId("infinite-canvas"),rect=await canvas.boundingBox();expect(rect).not.toBeNull();
 const transform=()=>page.getByTestId("canvas-world").getAttribute("style");
 const before=await transform();await page.mouse.move(rect!.x+rect!.width/2,rect!.y+rect!.height/2);await page.mouse.wheel(70,90);
 await expect.poll(transform).not.toBe(before);
 const moved=await transform();expect(moved).toContain("scale(1)");
 await page.keyboard.down("Control");await page.mouse.wheel(0,-140);await page.keyboard.up("Control");
 await expect.poll(transform).not.toContain("scale(1)");
 await page.getByRole("button",{name:"＋ 文字"}).click();
 const text=page.getByRole("textbox",{name:"画布文字内容"});await text.fill(Array.from({length:35},(_,index)=>`第 ${index+1} 行`).join("\n"));
 await text.hover();const beforeInner=await transform();await page.mouse.wheel(0,100);
 await expect.poll(async()=>text.evaluate(element=>element.scrollTop)).toBeGreaterThan(0);
 expect(await transform()).toBe(beforeInner);
});

test("T-993 旧版无尺寸画布可读，保存后补默认尺寸且连线不丢",async({page,context,baseURL})=>{
 const account=await groupedAccount(page,"douyin",`@canvas-old-${Date.now()}`);
 const canvas=await dispatch(page,"canvas.create",{params:undefined,query:undefined,body:{title:"旧版画布"}},{groupId:account.groupId});
 const headers={"content-type":"application/json","x-group-id":account.groupId};
 const oldDocument={schemaVersion:1,viewport:{x:0,y:0,zoom:1},nodes:[{id:"old-a",type:"text",label:"旧文案",position:{x:100,y:100},text:"广告标题"},{id:"old-b",type:"image_generation",label:"旧生成",position:{x:460,y:100},prompt:"",mode:"text_to_image"}],edges:[{id:"old-edge",source:"old-a",target:"old-b"}]};
 const saved=await page.request.post("/api/v1/dispatch",{headers,data:{id:"canvas.save",input:{params:{canvasId:canvas.id},query:undefined,body:{expectedRevision:1,document:oldDocument}}}});
 expect(saved.ok(),await saved.text()).toBe(true);
 await enterGroup(page,context,baseURL!,account.groupId);
 await page.goto(`/canvases/${canvas.id}`);await expect(page.getByTestId("canvas-node")).toHaveCount(2);await expect(page.locator("[data-canvas-connection]")).toHaveCount(1);
 await page.getByRole("button",{name:"保存",exact:true}).click();await expect(page.getByText("已保存",{exact:true})).toBeVisible();
 const read=await page.request.post("/api/v1/dispatch",{headers,data:{id:"canvas.get",input:{params:{canvasId:canvas.id},query:undefined,body:undefined}}});
 expect(read.ok(),await read.text()).toBe(true);
 const document=(await read.json() as {data:{document:{nodes:Array<{size?:{width:number;height:number}}> ;edges:Array<{id:string}>}}}).data.document;
 expect(document.nodes.every(node=>Boolean(node.size?.width&&node.size?.height))).toBe(true);
 expect(document.edges.map(edge=>edge.id)).toEqual(["old-edge"]);
 await page.getByRole("button",{name:"适合内容"}).click();
 const boxes=await Promise.all([page.getByTestId("canvas-node").nth(0).boundingBox(),page.getByTestId("canvas-node").nth(1).boundingBox()]);
 expect(boxes.every(Boolean)).toBe(true);
 const left=Math.min(...boxes.map(box=>box!.x))-12,top=Math.min(...boxes.map(box=>box!.y))-12,right=Math.max(...boxes.map(box=>box!.x+box!.width))+12,bottom=Math.max(...boxes.map(box=>box!.y+box!.height))+12;
 await page.mouse.move(left,top);await page.mouse.down();await page.mouse.move(right,bottom,{steps:12});await page.mouse.up();
 await expect(page.locator('[data-testid="canvas-node"][data-selected="true"]')).toHaveCount(2);
 await page.keyboard.press("Delete");await expect(page.getByTestId("canvas-node")).toHaveCount(0);
 await page.getByRole("button",{name:"撤销"}).click();await expect(page.getByTestId("canvas-node")).toHaveCount(2);
 await page.getByRole("button",{name:"重做"}).click();await expect(page.getByTestId("canvas-node")).toHaveCount(0);
});

test("T-993 当前账号图片与视频能插入画布并实际预览",async({page,context,baseURL})=>{
 const account=await groupedAccount(page,"douyin",`@canvas-media-${Date.now()}`);
 await enterGroup(page,context,baseURL!,account.groupId);
 await uploadMedia(page,{groupId:account.groupId},resolve(process.cwd(),"public/douyin-icon.png"),"image","image/png","画布预览图片.png");
 await uploadMedia(page,{groupId:account.groupId},resolve(process.cwd(),"../output/content-samples/ai-copy-eval-loop/motion-preview.mp4"),"video","video/mp4","画布预览视频.mp4");
 await page.goto("/canvases?tab=canvases");
 await page.getByRole("button",{name:"新建画布"}).click();
 await expect(page).toHaveURL(/\/canvases\/[^/]+$/);
 await page.getByRole("button",{name:"素材库"}).click();
 await page.getByRole("button",{name:/图片 · 画布预览图片/}).click();
 await expect.poll(async()=>page.locator('[data-testid="canvas-node"] img').first().evaluate(image=>(image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
 await page.getByRole("button",{name:"素材库"}).click();
 await page.getByRole("button",{name:/视频 · 画布预览视频/}).click();
 await expect(page.locator('[data-testid="canvas-node"] video')).toHaveCount(1);
 await expect.poll(async()=>page.locator('[data-testid="canvas-node"] video').evaluate(video=>(video as HTMLVideoElement).readyState)).toBeGreaterThan(0);
 await expect(page.getByText("已保存",{exact:true})).toBeVisible();
 await page.reload();
 await expect.poll(async()=>page.locator('[data-testid="canvas-node"] img').first().evaluate(image=>(image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
 await expect.poll(async()=>page.locator('[data-testid="canvas-node"] video').evaluate(video=>(video as HTMLVideoElement).readyState)).toBeGreaterThan(0);
});

test("T-994 作品素材入口、项目画布过滤与安全返回",async({page,context,baseURL},testInfo)=>{
 const account=await groupedAccount(page,"douyin",`@canvas-ux-${Date.now()}`);
 const project=await dispatch(page,"projects.create",{params:undefined,query:undefined,body:{title:"新品广告体验",brief:"视觉方案"}},{groupId:account.groupId});
 const other=await dispatch(page,"projects.create",{params:undefined,query:undefined,body:{title:"另一件作品",brief:""}},{groupId:account.groupId});
 await dispatch(page,"canvas.create",{params:undefined,query:undefined,body:{title:"另一件作品的画布",projectId:other.id}},{groupId:account.groupId});
 await enterGroup(page,context,baseURL!,account.groupId);
 await page.goto(`/projects/${project.id}`);
 await expect(page.getByRole("link",{name:"打开创作画布"})).toBeVisible();
 await page.locator('#materials').screenshot({path:testInfo.outputPath("project-materials-after.png")});
 await page.getByRole("link",{name:"打开创作画布"}).click();
 await expect(page.getByRole("heading",{name:"新品广告体验的创作画布"})).toBeVisible();
 await expect(page.getByText("另一件作品的画布")).toHaveCount(0);
 await expect(page.getByRole("link",{name:"查看当前账号全部画布"})).toBeVisible();
 await page.getByRole("button",{name:"创建作品画布"}).click();
 await expect(page.getByRole("heading",{name:"从一个画面开始"})).toBeVisible();
 await page.screenshot({path:testInfo.outputPath("canvas-empty-after.png")});
 await page.setViewportSize({width:1024,height:768});
 await expect(page.getByRole("button",{name:"素材库"})).toBeVisible();
 await expect(page.getByRole("button",{name:/生成视频 从描述或首帧开始做动态画面/})).toBeVisible();
 await page.screenshot({path:testInfo.outputPath("canvas-narrow-after.png")});
 await page.setViewportSize({width:1536,height:1024});
 await expect(page.getByLabel("关联项目（可选）")).toHaveValue(project.id);
 const canvasUrl=page.url();
 await page.getByRole("textbox",{name:"画布标题"}).fill("新品广告 · 视觉方案 A");
 await page.getByRole("button",{name:/返回作品 · 新品广告体验/}).click();
 await expect(page).toHaveURL(new RegExp(`/projects/${project.id}`));
 await page.goto(canvasUrl);
 await expect(page.getByRole("textbox",{name:"画布标题"})).toHaveValue("新品广告 · 视觉方案 A");
 await page.getByRole("button",{name:"选已有素材 把账号里的图片和视频放进来"}).click();
 await expect(page.getByRole("complementary",{name:"当前账号素材"})).toBeVisible();
 await page.screenshot({path:testInfo.outputPath("canvas-assets-after.png")});
 await expect(page.getByText("搜索已加载的 0 件素材")).toBeVisible();
 await expect(page.getByRole("link",{name:"去素材中心上传"})).toBeVisible();
});

test("T-994 画布版本冲突时不离开并给出恢复动作",async({page,context,baseURL})=>{
 const account=await groupedAccount(page,"douyin",`@canvas-ux-conflict-${Date.now()}`);
 const project=await dispatch(page,"projects.create",{params:undefined,query:undefined,body:{title:"冲突恢复作品",brief:""}},{groupId:account.groupId});
 const canvas=await dispatch(page,"canvas.create",{params:undefined,query:undefined,body:{title:"原画布",projectId:project.id}},{groupId:account.groupId});
 await enterGroup(page,context,baseURL!,account.groupId);
 await page.goto(`/canvases/${canvas.id}`);
 await expect(page.getByRole("textbox",{name:"画布标题"})).toHaveValue("原画布");
 const read=await page.request.post("/api/v1/dispatch",{headers:{"content-type":"application/json","x-group-id":account.groupId},data:{id:"canvas.get",input:{params:{canvasId:canvas.id},query:undefined,body:undefined}}});
 const current=(await read.json() as {data:{revision:number;document:unknown}}).data;
 const remote=await page.request.post("/api/v1/dispatch",{headers:{"content-type":"application/json","x-group-id":account.groupId},data:{id:"canvas.save",input:{params:{canvasId:canvas.id},query:undefined,body:{expectedRevision:current.revision,title:"另一窗口已改",document:current.document,projectId:project.id}}}});
 expect(remote.ok(),await remote.text()).toBe(true);
 await page.getByRole("textbox",{name:"画布标题"}).fill("我的未保存修改");
 await page.getByRole("button",{name:/返回作品 · 冲突恢复作品/}).click();
 await expect(page).toHaveURL(new RegExp(`/canvases/${canvas.id}$`));
 await expect(page.getByRole("alert").filter({hasText:"其他窗口更新"})).toBeVisible();
 await expect(page.getByRole("button",{name:"重新载入"})).toBeVisible();
});

test("T-994 生成结果就地保留并加入当前作品（模拟任务回执）",async({page,context,baseURL},testInfo)=>{
 const account=await groupedAccount(page,"douyin",`@canvas-result-${Date.now()}`);
 const project=await dispatch(page,"projects.create",{params:undefined,query:undefined,body:{title:"结果采纳作品",brief:""}},{groupId:account.groupId});
 const canvas=await dispatch(page,"canvas.create",{params:undefined,query:undefined,body:{title:"结果操作画布",projectId:project.id}},{groupId:account.groupId}) as {id:string;userId:string;document:{schemaVersion:1;viewport:{x:number;y:number;zoom:number};nodes:unknown[];edges:unknown[]}};
 const assetId=await uploadMedia(page,{groupId:account.groupId},resolve(process.cwd(),"public/douyin-icon.png"),"image","image/png","结果操作预览.png");
 const uploaded=await dispatch<{currentFileId:string}>(page,"assets.get",{params:{assetId},query:undefined,body:undefined},{groupId:account.groupId});
 const download=await dispatch<{url:string}>(page,"assets.fileDownloadUrl",{params:{assetId,assetFileId:uploaded.currentFileId},query:undefined,body:undefined},{groupId:account.groupId});
 const downloaded=await page.request.get(download.url);expect(downloaded.ok(),await downloaded.text()).toBe(true);
 const fileId=uploaded.currentFileId,checksum=createHash("sha256").update(await downloaded.body()).digest("hex");
 const nodeId="result-generation-node";
 await dispatch(page,"canvas.save",{params:{canvasId:canvas.id},query:undefined,body:{expectedRevision:1,document:{...canvas.document,nodes:[{id:nodeId,type:"image_generation",label:"主视觉",position:{x:100,y:100},size:{width:350,height:430},prompt:"秋季新品广告",mode:"text_to_image"}]}}},{groupId:account.groupId});
 let taskStatus:"awaiting_confirmation"|"succeeded"="awaiting_confirmation",confirmCount=0,linkAttempts=0;
 const taskId="mock-result-task-1",executionTaskId="mock-execution-task-1",callId="mock-call-1",stamp=new Date().toISOString();
 await page.route("**/api/v1/dispatch",async route=>{
  const request=route.request().postDataJSON() as {id:string;input?:{params?:Record<string,string>}};
  if(request.id==="canvas.node.tasks"&&request.input?.params?.canvasId===canvas.id){
   await route.fulfill({json:{data:[{id:"mock-link-1",canvasId:canvas.id,nodeId,attemptId:"mock-attempt-123456",taskId,mediaKind:"image",inputRevision:2,inputDigest:"a".repeat(64),referenceFileId:null,referenceChecksum:null,resultAssetId:assetId,createdAt:stamp,updatedAt:stamp}],meta:{requestId:"mock-list",page:1,pageSize:100,total:1}}});return;
  }
  if(request.id==="canvas.generations.material.get"&&request.input?.params?.canvasId===canvas.id&&request.input?.params?.generationLinkId==="mock-link-1"){
   await route.fulfill({json:{data:{status:"available",phase:taskStatus==="succeeded"?"confirmed":"candidate",origin:{canvasId:canvas.id,generationLinkId:"mock-link-1",nodeId,attemptId:"mock-attempt-123456",inputRevision:2,inputDigest:"a".repeat(64),taskId,resultId:"mock-result-1",executionTaskId,callId},file:{assetId,assetFileId:fileId},checksum,assetType:"image",name:"结果操作预览.png",assetStatus:taskStatus==="succeeded"?"active":"pending",taskStatus},meta:{requestId:"mock-material"}}});return;
  }
  if(request.id==="ai.tasks.get"&&request.input?.params?.taskId===taskId||request.id==="ai.tasks.confirm"&&request.input?.params?.taskId===taskId){
   if(request.id==="ai.tasks.confirm"){confirmCount++;taskStatus="succeeded";}
   await route.fulfill({json:{data:{id:taskId,userId:canvas.userId,projectId:null,contentOutputId:null,taskType:"asset.generate",status:taskStatus,executionTaskId,inputData:{prompt:"秋季新品广告",mode:"text_to_image"},modelKey:"mock/image",idempotencyKey:"mock-idempotency",attemptId:"mock-attempt-123456",requestFingerprint:`sha256:${"a".repeat(64)}`,retryOfTaskId:null,requestedAt:stamp,startedAt:stamp,completedAt:stamp,errorMessage:null},meta:{requestId:"mock-task"}}});return;
  }
  if(request.id==="materialLinks.create"&&++linkAttempts===1){await route.fulfill({status:503,json:{error:{code:"ExternalDependencyError",message:"模拟关联失败"},meta:{requestId:"mock-link-failure"}}});return;}
  await route.continue();
 });
 await enterGroup(page,context,baseURL!,account.groupId);
 await page.goto(`/canvases/${canvas.id}`);
 const result=page.getByTestId("canvas-node").filter({hasText:"主视觉"});
 await expect(result.getByText("最近结果",{exact:false})).toBeVisible();
 await page.screenshot({path:testInfo.outputPath("canvas-result-actions-after.png")});
 await result.getByRole("button",{name:"保留到素材库"}).click();
 await expect(result.getByRole("button",{name:"已在素材库"})).toBeDisabled();
 expect(confirmCount).toBe(1);
 await result.getByRole("button",{name:"加入作品 · 结果采纳作品"}).click();
 await expect(page.getByText(/已保留到素材库，加入作品失败/).first()).toBeVisible();
 await result.getByRole("button",{name:"加入作品 · 结果采纳作品"}).click();
 await expect(result.getByRole("button",{name:"已加入 结果采纳作品"})).toBeDisabled();
 expect(confirmCount).toBe(1);
 expect(linkAttempts).toBe(2);
});


test("T-1021 首页案例独立浏览、取消无写入，多页模板创建原画布并可重新读取",async({page,context,baseURL})=>{
 const account=await groupedAccount(page,"douyin",`@home-${Date.now()}`);
 await enterGroup(page,context,baseURL!,account.groupId);
 const canvases=async()=>{const response=await page.request.post("/api/v1/dispatch",{headers:{"content-type":"application/json","x-group-id":account.groupId},data:{id:"canvas.list",input:{}}});expect(response.ok()).toBe(true);return (await response.json()).data as unknown[];};
 const before=(await canvases()).length;
 await page.goto("/canvases");await expect(page.getByRole("heading",{name:"创作空间"})).toBeVisible();
 await expect(page.getByRole("navigation",{name:"创作空间功能"}).getByRole("link",{name:"案例库"})).toHaveAttribute("aria-current","page");
 await page.getByRole("button",{name:"小红书图文",exact:true}).click();
 await page.getByRole("button",{name:/步骤笔记/}).click();
 await page.locator('input[placeholder="这次想表达什么"]').fill("独立库多页创作");
 await page.locator('textarea[placeholder="粘贴当前确认稿或本期真实素材"]').fill("用户本期已确认的真实内容");
 await page.getByRole("button",{name:"1:1",exact:true}).click();
 await page.getByRole("button",{name:/用这个模板创作/}).click();
 await page.getByRole("button",{name:"取消",exact:true}).click();expect((await canvases()).length).toBe(before);
 await page.getByRole("button",{name:/用这个模板创作/}).click();
 await page.getByRole("button",{name:"新建画布并放入",exact:true}).click();
 await expect(page).toHaveURL(/\/canvases\/[^/?]+$/);await expect(page.getByTestId("canvas-node")).toHaveCount(3);
 const id=page.url().split("/").at(-1)!;const response=await page.request.post("/api/v1/dispatch",{headers:{"content-type":"application/json","x-group-id":account.groupId},data:{id:"canvas.get",input:{params:{canvasId:id}}}});
 const saved=(await response.json()).data;expect(saved.document.nodes.every((n:{aspectRatio:string})=>n.aspectRatio==="1:1")).toBe(true);expect(saved.document.visualGroups[0].pageOrder).toHaveLength(3);expect(saved.document.visualGroups[0].generationAttempts).toEqual({});expect((await canvases()).length).toBe(before+1);
 await page.reload();await expect(page.getByTestId("canvas-node")).toHaveCount(3);
});

test("T-1021 资产独立上传，选用追加原画布并冻结真实文件",async({page,context,baseURL})=>{
 const account=await groupedAccount(page,"douyin",`@asset-home-${Date.now()}`);
 const original=await dispatch(page,"canvas.create",{body:{title:"已有创作"}},{groupId:account.groupId});
 await enterGroup(page,context,baseURL!,account.groupId);
 await page.goto("/canvases?tab=assets");await page.locator('[data-slot="assets-upload-input"]').setInputFiles(resolve(process.cwd(),"public/douyin-icon.png"));
 await expect(page.getByRole("status").filter({hasText:"已上传素材"})).toBeVisible();
 await page.getByRole("button",{name:/douyin-icon.png · 用此素材创作/}).click();
 await page.getByRole("button",{name:"已有画布",exact:true}).click();
 await page.getByRole("dialog").locator("select").selectOption(original.id);
 await page.getByRole("button",{name:"放入这个画布",exact:true}).click();
 await expect(page).toHaveURL(new RegExp(`/canvases/${original.id}$`));await expect(page.getByTestId("canvas-node")).toHaveCount(1);
 const response=await page.request.post("/api/v1/dispatch",{headers:{"content-type":"application/json","x-group-id":account.groupId},data:{id:"canvas.get",input:{params:{canvasId:original.id}}}});const saved=(await response.json()).data;
 expect(saved.document.nodes[0].assetId).toBeTruthy();expect(saved.document.nodes[0].fileId).toBeTruthy();expect(saved.document.nodes[0].checksum).toMatch(/^[a-f0-9]{64}$/);
 await page.reload();await expect(page.getByTestId("canvas-node")).toHaveCount(1);
});

// T1101：公开真实canvas/asset/save；模型运行回执和能力为合成fixture，不访问用户profile。
test('T-1101 缩略素材、精确连线、运行锁与重生成确认（模拟模型回执）',async({page,context,baseURL},testInfo)=>{
 test.setTimeout(7_200_000);const observe=expect.configure({timeout:120_000});page.setDefaultTimeout(120_000);page.setDefaultNavigationTimeout(120_000);
 const account=await groupedAccount(page,'douyin','创作验收账号','创作验收组');const scope={groupId:account.groupId};
 const canvas=await dispatch<{id:string;userId:string;document:Record<string,unknown>}>(page,'canvas.create',{body:{title:'创作交互验收'}},scope);
 const assetId=await uploadMedia(page,scope,resolve(process.cwd(),'../docs/verification/t1101/user-baseline.png'),'image','image/png','不应展示的很长素材文件名称.png');
 const file=await dispatch<{currentFileId:string}>(page,'assets.get',{params:{assetId}},scope);
 await dispatch(page,'canvas.save',{params:{canvasId:canvas.id},body:{expectedRevision:1,document:{...canvas.document,nodes:[{id:'upstream',type:'image_generation',label:'上游生成',position:{x:20,y:20},size:{width:350,height:650},prompt:'验收生成图片',mode:'text_to_image'},{id:'downstream',type:'video_generation',label:'下游视频',position:{x:440,y:20},size:{width:350,height:650},prompt:'镜头缓慢推进',mode:'text_to_video'}],edges:[{id:'exact-edge',source:'upstream',target:'downstream'}]}}},scope);
 let status='running',submissions=0,confirmations=0,interruptedSave=0;const stamp=new Date().toISOString(),taskId='fixture-task-t1101';
 const link={id:'fixture-link',canvasId:canvas.id,nodeId:'upstream',attemptId:'fixture-attempt-t1101',taskId,mediaKind:'image',inputRevision:2,inputDigest:'a'.repeat(64),referenceFileId:null,referenceChecksum:null,resultAssetId:assetId,createdAt:stamp,updatedAt:stamp};
 await page.route('**/api/v1/dispatch',async route=>{
  const req=route.request().postDataJSON();let data:unknown;
  if(req.id==='canvas.save'&&req.input?.params?.canvasId===canvas.id&&req.input?.body?.document?.nodes?.some((n:{id:string;referenceFileId?:string})=>n.id==='downstream'&&n.referenceFileId===file.currentFileId)&&interruptedSave===0){interruptedSave++;await route.abort('failed');return;}
  if(req.id==='canvas.node.tasks'&&req.input?.params?.canvasId===canvas.id)data=[link];
  else if(req.id==='canvas.capabilities')data={modes:['text_to_image','image_to_image','text_to_video','image_to_video'].map(mode=>({mode,available:true,model:'image-01',reason:null}))};
  else if(req.id==='ai.tasks.get'&&req.input?.params?.taskId===taskId)data={id:taskId,userId:canvas.userId,projectId:null,contentOutputId:null,taskType:'asset.generate',status,inputData:{prompt:'验收生成图片',mode:'text_to_image'},modelKey:'fixture/image',idempotencyKey:'fixture-key',attemptId:link.attemptId,requestFingerprint:'sha256:'+link.inputDigest,retryOfTaskId:null,requestedAt:stamp,startedAt:stamp,completedAt:status==='running'?null:stamp,errorMessage:null};
  else if(req.id==='canvas.generations.material.get'&&req.input?.params?.generationLinkId===link.id)data=status==='running'?{status:'not_ready',reason:'生成中',canvasId:canvas.id,generationLinkId:link.id,nodeId:'upstream',taskId,attemptId:link.attemptId,inputRevision:2,inputDigest:link.inputDigest}:{status:'available',phase:'candidate',origin:{canvasId:canvas.id,generationLinkId:link.id,nodeId:'upstream',attemptId:link.attemptId,inputRevision:2,inputDigest:link.inputDigest,taskId,resultId:'fixture-result',executionTaskId:'fixture-execution',callId:'fixture-call'},file:{assetId,assetFileId:file.currentFileId},checksum:'a'.repeat(64),assetType:'image',name:'合成模型回执',assetStatus:'pending',taskStatus:'awaiting_confirmation'};
  else if(req.id==='canvas.node.generate'){submissions++;status='running';data={...link,attemptId:req.input.body.attemptId};}
  else if(req.id==='ai.tasks.confirm'){confirmations++;throw Error('连线不得自动采纳');}
  if(data!==undefined){await route.fulfill({json:{data,meta:{requestId:'fixture-t1101',page:1,pageSize:100,total:Array.isArray(data)?data.length:1}}});return;}await route.continue();
 });
 await enterGroup(page,context,baseURL!,account.groupId);await page.setViewportSize({width:1366,height:900});await page.goto('/canvases/'+canvas.id);
 const up=page.getByTestId('canvas-node').filter({hasText:'上游生成'}),down=page.getByTestId('canvas-node').filter({hasText:'下游视频'});
 await observe(up.getByRole('button',{name:'生成中…'})).toBeDisabled();expect(submissions).toBe(0);
 await page.screenshot({path:testInfo.outputPath('t1101-running.png')});
 status='awaiting_confirmation';await page.reload();await observe(up.getByText('最近结果',{exact:false})).toBeVisible();
 await observe.poll(()=>interruptedSave,{timeout:120_000}).toBe(1);await observe(page.getByText('保存失败',{exact:true})).toBeVisible();await page.screenshot({path:testInfo.outputPath('t1108-interrupted-save.png')});await page.reload();await observe(up.getByText('最近结果',{exact:false})).toBeVisible();
 await observe.poll(async()=>{const saved=await dispatch<{document:{nodes:Array<{id:string;referenceFileId?:string}>}}>(page,'canvas.get',{params:{canvasId:canvas.id}},scope);return saved.document.nodes.find(n=>n.id==='downstream')?.referenceFileId;},{timeout:360_000}).toBe(file.currentFileId);
 expect(confirmations).toBe(0);await observe(down.getByText('选择素材',{exact:true})).toHaveCount(0);
 await observe(page.getByText('已保存',{exact:true})).toBeVisible();await page.reload();
 const persisted=await dispatch<{revision:number;document:import('@creatoros/contract').CanvasDocument}>(page,'canvas.get',{params:{canvasId:canvas.id}},scope);expect(persisted.document.nodes.find(n=>n.id==='downstream')).toMatchObject({referenceAssetId:assetId,referenceFileId:file.currentFileId});
 // 离开编辑器后准备旧版状态，避免测试自己的外部写入与旧页面自动保存竞态。
 await page.getByRole('button',{name:'画布库',exact:true}).click();await observe(page).toHaveURL(/\/canvases\?tab=canvases$/);
 const canvasEntry=page.getByRole('link').filter({has:page.getByRole('heading',{name:'创作交互验收',exact:true})});await observe(canvasEntry).toBeVisible();
 const legacyBase=await dispatch<{revision:number;document:import('@creatoros/contract').CanvasDocument}>(page,'canvas.get',{params:{canvasId:canvas.id}},scope);
 // 显式合成旧flat标记和已保存空引用；不猜旧清空意图、不接用户数据。
 const legacyDocument={...legacyBase.document,nodes:legacyBase.document.nodes.map(node=>node.id==='downstream'?{...node,mode:'text_to_video' as const,referenceAssetId:undefined,referenceFileId:undefined}:node)};
 await dispatch(page,'canvas.save',{params:{canvasId:canvas.id},body:{expectedRevision:legacyBase.revision,document:legacyDocument}},scope);
 await page.evaluate(key=>localStorage.setItem(key,JSON.stringify(['exact-edge'])),`creatoros-canvas-references:group:${account.groupId}:${canvas.id}`);await canvasEntry.click();await observe(page).toHaveURL(new RegExp('/canvases/'+canvas.id+'$'));await observe(up.getByText('最近结果',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:/^编导与详情/}).click();const legacyButton=page.getByRole('button',{name:'使用连线参考',exact:true});await observe(legacyButton).toBeEnabled();
 const beforeExplicit=await dispatch<{document:import('@creatoros/contract').CanvasDocument}>(page,'canvas.get',{params:{canvasId:canvas.id}},scope);expect(beforeExplicit.document.nodes.find(n=>n.id==='downstream')).toMatchObject({mode:'text_to_video'});expect((beforeExplicit.document.nodes.find(n=>n.id==='downstream') as {referenceFileId?:string}).referenceFileId).toBeUndefined();expect(confirmations).toBe(0);expect(submissions).toBe(0);
 await page.screenshot({path:testInfo.outputPath('t1108-legacy-normal.png')});const legacyCaptures=[{checkpoint:'legacy-normal',check_ids:['AC-PERSIST','AC-LEGACY'],viewport:{width:1366,height:900},text:await legacyButton.locator('..').locator('..').innerText()}];
 await page.setViewportSize({width:900,height:900});await observe(legacyButton).toBeVisible();await page.screenshot({path:testInfo.outputPath('t1108-legacy-narrow.png')});legacyCaptures.push({checkpoint:'legacy-narrow',check_ids:['AC-PERSIST','AC-LEGACY'],viewport:{width:900,height:900},text:await legacyButton.locator('..').locator('..').innerText()});await legacyButton.focus();await page.keyboard.press('Enter');
 await observe.poll(async()=>{const saved=await dispatch<{document:import('@creatoros/contract').CanvasDocument}>(page,'canvas.get',{params:{canvasId:canvas.id}},scope);return (saved.document.nodes.find(n=>n.id==='downstream') as {referenceFileId?:string}).referenceFileId;},{timeout:360_000}).toBe(file.currentFileId);expect(confirmations).toBe(0);expect(submissions).toBe(0);await observe(page.getByText('已保存',{exact:true})).toBeVisible();
 await page.setViewportSize({width:1366,height:900});await page.getByRole('button',{name:/^收起详情/}).click();
 await page.getByRole('button',{name:'画布库',exact:true}).click();await observe(page).toHaveURL(/\/canvases\?tab=canvases$/);await observe(canvasEntry).toBeVisible();await canvasEntry.click();await observe(page).toHaveURL(new RegExp('/canvases/'+canvas.id+'$'));await observe(up.getByText('最近结果',{exact:false})).toBeVisible();
 const afterBack=await dispatch<{document:import('@creatoros/contract').CanvasDocument}>(page,'canvas.get',{params:{canvasId:canvas.id}},scope);expect(afterBack.document.nodes.find(n=>n.id==='downstream')).toMatchObject({referenceAssetId:assetId,referenceFileId:file.currentFileId});expect(confirmations).toBe(0);expect(submissions).toBe(0);
 writeFileSync(resolve(process.cwd(),'../docs/verification/t1108/visible-copy.json'),JSON.stringify({schema:'frontend-visible-copy/v1',task_id:'T-1108',commit_sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),captures:legacyCaptures},null,2)+'\n');

 await up.getByRole('button',{name:'生成',exact:true}).click();await observe(page.getByRole('dialog',{name:'重新生成图片？'})).toBeVisible();await page.screenshot({path:testInfo.outputPath('t1101-regenerate.png')});
 await page.getByRole('button',{name:'取消',exact:true}).click();expect(submissions).toBe(0);
 await up.getByRole('button',{name:'生成',exact:true}).click();await page.getByRole('button',{name:'确认重新生成'}).click();await observe.poll(()=>submissions,{timeout:120_000}).toBe(1);await observe(up.getByRole('button',{name:'生成中…'})).toBeDisabled();
 await page.getByRole('button',{name:'素材库',exact:true}).click();const gallery=page.getByRole('complementary',{name:'当前账号素材'});await observe(gallery.getByRole('button',{name:'放到画布'}).first()).toBeVisible();await observe(gallery.getByText('不应展示的很长素材文件名称.png',{exact:true})).toHaveCount(0);await observe(gallery.getByRole('img').first()).toBeVisible();await observe.poll(()=>gallery.getByRole('img').first().evaluate((element:HTMLImageElement)=>element.complete&&element.naturalWidth>0),{timeout:120_000}).toBe(true);await page.screenshot({path:testInfo.outputPath('t1101-gallery.png')});
 await observe(page.getByText('已保存',{exact:true})).toBeVisible();
 const captures=[{checkpoint:'canvas-normal',check_ids:['AC-GALLERY','AC-GENERATION','AC-EDGE'],viewport:{width:1366,height:900},text:await page.locator('body').innerText()}];
 await page.getByRole('button',{name:'关闭素材库'}).click();await page.setViewportSize({width:900,height:900});await page.getByRole('button',{name:'缩小',exact:true}).click();await observe(page.getByText('83%',{exact:true})).toBeVisible();await observe(up.getByRole('button',{name:'生成中…'})).toBeDisabled();await page.getByRole('button',{name:'素材库',exact:true}).click();await observe(gallery.getByRole('button',{name:'放到画布'}).first()).toBeVisible();await observe(gallery.getByRole('img').first()).toBeVisible();await observe.poll(()=>gallery.getByRole('img').first().evaluate((element:HTMLImageElement)=>element.complete&&element.naturalWidth>0),{timeout:120_000}).toBe(true);await page.screenshot({path:testInfo.outputPath('t1101-canvas-narrow.png')});
 await observe(page.getByText('已保存',{exact:true})).toBeVisible();
 captures.push({checkpoint:'canvas-narrow',check_ids:['AC-GALLERY','AC-GENERATION','AC-EDGE'],viewport:{width:900,height:900},text:await page.locator('body').innerText()});
 writeFileSync(resolve(process.cwd(),'../docs/verification/t1101/canvas-copy.json'),JSON.stringify(captures));
});

test('T-1101 三平台表格直接打开扫码弹窗，无重复刷新和下方扫码区',async({page,context,baseURL},testInfo)=>{
 test.setTimeout(7_200_000);const observe=expect.configure({timeout:120_000});page.setDefaultTimeout(120_000);page.setDefaultNavigationTimeout(120_000);const account=await groupedAccount(page,'douyin','创作验收账号','创作验收组');await enterGroup(page,context,baseURL!,account.groupId);
 await page.setViewportSize({width:1366,height:900});await page.goto('/accounts');
 const table=page.getByRole('table',{name:'各平台能力'});await observe(table).toBeVisible();
 for(const name of ['抖音','快手','小红书'])await observe(table.getByRole('button',{name:'扫码绑定'+name+'账号'})).toBeEnabled();
 await observe(page.getByRole('button',{name:'重新读取平台能力'})).toHaveCount(0);await observe(page.getByText('兼容扫码入口',{exact:true})).toHaveCount(0);
 await page.screenshot({path:testInfo.outputPath('t1101-platform-table.png'),fullPage:true});
 await table.getByRole('button',{name:'扫码绑定小红书账号'}).click();await observe(page.getByRole('dialog',{name:'扫码绑定小红书账号'})).toBeVisible();await page.screenshot({path:testInfo.outputPath('t1101-qr-dialog.png')});
 await observe(page.getByRole('dialog').getByRole('button',{name:'扫码绑定小红书账号',exact:true})).toBeEnabled();
 const captures=[{checkpoint:'binding-normal',check_ids:['AC-BINDING'],viewport:{width:1366,height:900},text:await page.locator('body').innerText()}];
 await page.keyboard.press('Escape');await observe(page.getByRole('dialog')).toHaveCount(0);await page.setViewportSize({width:900,height:900});await observe(table.getByRole('button',{name:'扫码绑定抖音账号'})).toBeVisible();await page.screenshot({path:testInfo.outputPath('t1101-platform-narrow.png'),fullPage:true});
 captures.push({checkpoint:'binding-narrow',check_ids:['AC-BINDING'],viewport:{width:900,height:900},text:await page.locator('body').innerText()});writeFileSync(resolve(process.cwd(),'../docs/verification/t1101/binding-copy.json'),JSON.stringify(captures));
});
