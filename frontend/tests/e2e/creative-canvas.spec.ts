import type {Page} from "@playwright/test";
import {mkdirSync,readFileSync} from "node:fs";
import {resolve} from "node:path";
import {expect,test} from "../helpers/test-environment";

async function dispatch(page:Page,id:string,input:unknown,accountId?:string){
 const response=await page.request.post("/api/v1/dispatch",{headers:{"content-type":"application/json",...(accountId?{"x-account-id":accountId}:{})},data:{id,input}});
 expect(response.ok(),`${id} 返回 ${response.status()}`).toBe(true);
 return (await response.json() as {data:{id:string}}).data;
}

async function uploadMedia(page:Page,accountId:string,path:string,assetType:"image"|"video",mimeType:string,name:string){
 const bytes=readFileSync(path);
 const headers={"content-type":"application/json","x-account-id":accountId};
 const started=await page.request.post("/api/v1/dispatch",{headers,data:{id:"assets.uploads.create",input:{params:undefined,query:undefined,body:{assetType,mimeType,fileSize:bytes.length,fileName:name}}}});
 expect(started.ok(),await started.text()).toBe(true);
 const upload=(await started.json() as {data:{uploadId:string;uploadUrl:string}}).data;
 const put=await page.request.put(upload.uploadUrl,{headers:{"content-type":mimeType},data:bytes});
 expect(put.ok(),await put.text()).toBe(true);
 const completed=await page.request.post("/api/v1/dispatch",{headers,data:{id:"assets.uploads.complete",input:{params:{uploadId:upload.uploadId},query:undefined,body:{name}}}});
 expect(completed.ok(),await completed.text()).toBe(true);
 return (await completed.json() as {data:{id:string}}).data.id;
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

 await page.getByTestId("account-switcher-trigger").click();
 await page.getByTestId("account-switcher-menu").locator(`[data-testid="account-switcher-item"][data-account-id="${accountB.id}"]`).click();
 await page.goto("/canvases");
 await expect(page.getByText("分镜试验画布")).toHaveCount(0);
 await page.goto(canvasUrl);
 await expect(page.getByRole("alert").filter({hasText:"画布不存在或当前账号无权访问"})).toBeVisible();
});

test("T-993 首次自动选账号后画布可创建，新增节点不会重叠",async({page})=>{
 await dispatch(page,"accounts.create",{params:undefined,query:undefined,body:{platform:"douyin",accountHandle:`@canvas-first-${Date.now()}`}});
 await page.goto("/canvases");
 await expect.poll(async()=>page.evaluate(()=>window.localStorage.getItem("creatoros:current-account"))).not.toBeNull();
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
 const account=await dispatch(page,"accounts.create",{params:undefined,query:undefined,body:{platform:"douyin",accountHandle:`@canvas-viewport-${Date.now()}`}});
 await context.addCookies([{name:"creatoros_current_account",value:encodeURIComponent(account.id),url:baseURL!}]);
 await page.addInitScript(id=>window.localStorage.setItem("creatoros:current-account",id),account.id);
 await page.goto("/canvases");
 await page.getByRole("button",{name:"新建画布"}).click();
 await expect(page).toHaveURL(/\/canvases\/[^/]+$/);
 const canvasId=page.url().split("/").at(-1)!;
 await page.getByRole("button",{name:"＋ 文字"}).click();
 await page.getByRole("button",{name:"保存",exact:true}).click();
 await expect(page.getByText("已保存",{exact:true})).toBeVisible();
 const before=await page.request.post("/api/v1/dispatch",{headers:{"content-type":"application/json","x-account-id":account.id},data:{id:"canvas.get",input:{params:{canvasId},query:undefined,body:undefined}}});
 expect(before.ok(),await before.text()).toBe(true);
 const beforeCanvas=(await before.json() as {data:{revision:number;userId:string;accountId:string}}).data;
 const beforeRevision=beforeCanvas.revision;
 await page.getByRole("button",{name:"放大"}).click();
 await expect(page.getByText(/\d+% · 双击空白处添加文字/)).toBeVisible();
 const key=`creatoros:canvas-viewport:${beforeCanvas.userId}:${beforeCanvas.accountId}:${canvasId}`;
 await expect.poll(async()=>page.evaluate(key=>JSON.parse(window.localStorage.getItem(key)??"null")?.zoom,key)).toBeGreaterThan(1);
 const after=await page.request.post("/api/v1/dispatch",{headers:{"content-type":"application/json","x-account-id":account.id},data:{id:"canvas.get",input:{params:{canvasId},query:undefined,body:undefined}}});
 expect(after.ok(),await after.text()).toBe(true);
 expect((await after.json() as {data:{revision:number}}).data.revision).toBe(beforeRevision);
});

test("T-993 双指滚动平移、组合键缩放，节点文字仍可独立滚动",async({page,context,baseURL})=>{
 const account=await dispatch(page,"accounts.create",{params:undefined,query:undefined,body:{platform:"douyin",accountHandle:`@canvas-wheel-${Date.now()}`}});
 await context.addCookies([{name:"creatoros_current_account",value:encodeURIComponent(account.id),url:baseURL!}]);
 await page.addInitScript(id=>window.localStorage.setItem("creatoros:current-account",id),account.id);
 await page.goto("/canvases");await page.getByRole("button",{name:"新建画布"}).click();
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
 const account=await dispatch(page,"accounts.create",{params:undefined,query:undefined,body:{platform:"douyin",accountHandle:`@canvas-old-${Date.now()}`}});
 const canvas=await dispatch(page,"canvas.create",{params:undefined,query:undefined,body:{title:"旧版画布"}},account.id);
 const headers={"content-type":"application/json","x-account-id":account.id};
 const oldDocument={schemaVersion:1,viewport:{x:0,y:0,zoom:1},nodes:[{id:"old-a",type:"text",label:"旧文案",position:{x:100,y:100},text:"广告标题"},{id:"old-b",type:"image_generation",label:"旧生成",position:{x:460,y:100},prompt:"",mode:"text_to_image"}],edges:[{id:"old-edge",source:"old-a",target:"old-b"}]};
 const saved=await page.request.post("/api/v1/dispatch",{headers,data:{id:"canvas.save",input:{params:{canvasId:canvas.id},query:undefined,body:{expectedRevision:1,document:oldDocument}}}});
 expect(saved.ok(),await saved.text()).toBe(true);
 await context.addCookies([{name:"creatoros_current_account",value:encodeURIComponent(account.id),url:baseURL!}]);
 await page.addInitScript(id=>window.localStorage.setItem("creatoros:current-account",id),account.id);
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
 const account=await dispatch(page,"accounts.create",{params:undefined,query:undefined,body:{platform:"douyin",accountHandle:`@canvas-media-${Date.now()}`}});
 await context.addCookies([{name:"creatoros_current_account",value:encodeURIComponent(account.id),url:baseURL!}]);
 await page.addInitScript(id=>window.localStorage.setItem("creatoros:current-account",id),account.id);
 await uploadMedia(page,account.id,resolve(process.cwd(),"../docs/image-4.png"),"image","image/png","画布预览图片.png");
 await uploadMedia(page,account.id,resolve(process.cwd(),"../output/content-samples/ai-copy-eval-loop/motion-preview.mp4"),"video","video/mp4","画布预览视频.mp4");
 await page.goto("/canvases");
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

test("T-994 作品素材入口、项目画布过滤与安全返回",async({page,context,baseURL})=>{
 const account=await dispatch(page,"accounts.create",{params:undefined,query:undefined,body:{platform:"douyin",accountHandle:`@canvas-ux-${Date.now()}`}});
 const project=await dispatch(page,"projects.create",{params:undefined,query:undefined,body:{title:"新品广告体验",brief:"视觉方案"}},account.id);
 const other=await dispatch(page,"projects.create",{params:undefined,query:undefined,body:{title:"另一件作品",brief:""}},account.id);
 await dispatch(page,"canvas.create",{params:undefined,query:undefined,body:{title:"另一件作品的画布",projectId:other.id}},account.id);
 await context.addCookies([{name:"creatoros_current_account",value:encodeURIComponent(account.id),url:baseURL!}]);
 await page.addInitScript(id=>window.localStorage.setItem("creatoros:current-account",id),account.id);
 await page.goto(`/projects/${project.id}`);
 const evidenceRoot=resolve(process.cwd(),"../docs/verification/t994");mkdirSync(evidenceRoot,{recursive:true});
 await expect(page.getByRole("link",{name:"打开创作画布"})).toBeVisible();
 await page.locator('#materials').screenshot({path:resolve(evidenceRoot,"project-materials-after.png")});
 await page.getByRole("link",{name:"打开创作画布"}).click();
 await expect(page.getByRole("heading",{name:"新品广告体验的创作画布"})).toBeVisible();
 await expect(page.getByText("另一件作品的画布")).toHaveCount(0);
 await expect(page.getByRole("link",{name:"查看当前账号全部画布"})).toBeVisible();
 await page.getByRole("button",{name:"创建作品画布"}).click();
 await expect(page.getByRole("heading",{name:"从一个画面开始"})).toBeVisible();
 await page.screenshot({path:resolve(evidenceRoot,"canvas-empty-after.png")});
 await page.setViewportSize({width:1024,height:768});
 await expect(page.getByRole("button",{name:"素材库"})).toBeVisible();
 await expect(page.getByRole("button",{name:/生成视频 从描述或首帧开始做动态画面/})).toBeVisible();
 await page.screenshot({path:resolve(evidenceRoot,"canvas-narrow-after.png")});
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
 await page.screenshot({path:resolve(evidenceRoot,"canvas-assets-after.png")});
 await expect(page.getByText("搜索已加载的 0 件素材")).toBeVisible();
 await expect(page.getByRole("link",{name:"去素材中心上传"})).toBeVisible();
});

test("T-994 画布版本冲突时不离开并给出恢复动作",async({page,context,baseURL})=>{
 const account=await dispatch(page,"accounts.create",{params:undefined,query:undefined,body:{platform:"douyin",accountHandle:`@canvas-ux-conflict-${Date.now()}`}});
 const project=await dispatch(page,"projects.create",{params:undefined,query:undefined,body:{title:"冲突恢复作品",brief:""}},account.id);
 const canvas=await dispatch(page,"canvas.create",{params:undefined,query:undefined,body:{title:"原画布",projectId:project.id}},account.id);
 await context.addCookies([{name:"creatoros_current_account",value:encodeURIComponent(account.id),url:baseURL!}]);
 await page.addInitScript(id=>window.localStorage.setItem("creatoros:current-account",id),account.id);
 await page.goto(`/canvases/${canvas.id}`);
 await expect(page.getByRole("textbox",{name:"画布标题"})).toHaveValue("原画布");
 const read=await page.request.post("/api/v1/dispatch",{headers:{"content-type":"application/json","x-account-id":account.id},data:{id:"canvas.get",input:{params:{canvasId:canvas.id},query:undefined,body:undefined}}});
 const current=(await read.json() as {data:{revision:number;document:unknown}}).data;
 const remote=await page.request.post("/api/v1/dispatch",{headers:{"content-type":"application/json","x-account-id":account.id},data:{id:"canvas.save",input:{params:{canvasId:canvas.id},query:undefined,body:{expectedRevision:current.revision,title:"另一窗口已改",document:current.document,projectId:project.id}}}});
 expect(remote.ok(),await remote.text()).toBe(true);
 await page.getByRole("textbox",{name:"画布标题"}).fill("我的未保存修改");
 await page.getByRole("button",{name:/返回作品 · 冲突恢复作品/}).click();
 await expect(page).toHaveURL(new RegExp(`/canvases/${canvas.id}$`));
 await expect(page.getByRole("alert").filter({hasText:"其他窗口更新"})).toBeVisible();
 await expect(page.getByRole("button",{name:"重新载入"})).toBeVisible();
});

test("T-994 生成结果就地保留并加入当前作品（模拟任务回执）",async({page,context,baseURL})=>{
 const account=await dispatch(page,"accounts.create",{params:undefined,query:undefined,body:{platform:"douyin",accountHandle:`@canvas-result-${Date.now()}`}});
 const project=await dispatch(page,"projects.create",{params:undefined,query:undefined,body:{title:"结果采纳作品",brief:""}},account.id);
 const canvas=await dispatch(page,"canvas.create",{params:undefined,query:undefined,body:{title:"结果操作画布",projectId:project.id}},account.id) as {id:string;userId:string;document:{schemaVersion:1;viewport:{x:number;y:number;zoom:number};nodes:unknown[];edges:unknown[]}};
 const assetId=await uploadMedia(page,account.id,resolve(process.cwd(),"../docs/image-4.png"),"image","image/png","结果操作预览.png");
 const nodeId="result-generation-node";
 await dispatch(page,"canvas.save",{params:{canvasId:canvas.id},query:undefined,body:{expectedRevision:1,document:{...canvas.document,nodes:[{id:nodeId,type:"image_generation",label:"主视觉",position:{x:100,y:100},size:{width:350,height:430},prompt:"秋季新品广告",mode:"text_to_image"}]}}},account.id);
 let taskStatus:"awaiting_confirmation"|"succeeded"="awaiting_confirmation",confirmCount=0,linkAttempts=0;
 const taskId="mock-result-task-1",stamp=new Date().toISOString();
 await page.route("**/api/v1/dispatch",async route=>{
  const request=route.request().postDataJSON() as {id:string;input?:{params?:Record<string,string>}};
  if(request.id==="canvas.node.tasks"&&request.input?.params?.canvasId===canvas.id){
   await route.fulfill({json:{data:[{id:"mock-link-1",canvasId:canvas.id,nodeId,attemptId:"mock-attempt-123456",taskId,mediaKind:"image",inputRevision:2,inputDigest:"mock-digest",referenceFileId:null,referenceChecksum:null,resultAssetId:assetId,createdAt:stamp,updatedAt:stamp}],meta:{requestId:"mock-list",page:1,pageSize:100,total:1}}});return;
  }
  if(request.id==="ai.tasks.get"&&request.input?.params?.taskId===taskId||request.id==="ai.tasks.confirm"&&request.input?.params?.taskId===taskId){
   if(request.id==="ai.tasks.confirm"){confirmCount++;taskStatus="succeeded";}
   await route.fulfill({json:{data:{id:taskId,userId:canvas.userId,projectId:null,contentOutputId:null,taskType:"asset.generate",status:taskStatus,inputData:{prompt:"秋季新品广告",mode:"text_to_image"},modelKey:"mock/image",idempotencyKey:"mock-idempotency",attemptId:"mock-attempt-123456",requestFingerprint:`sha256:${"a".repeat(64)}`,retryOfTaskId:null,requestedAt:stamp,startedAt:stamp,completedAt:stamp,errorMessage:null},meta:{requestId:"mock-task"}}});return;
  }
  if(request.id==="materialLinks.create"&&++linkAttempts===1){await route.fulfill({status:503,json:{error:{code:"ExternalDependencyError",message:"模拟关联失败"},meta:{requestId:"mock-link-failure"}}});return;}
  await route.continue();
 });
 await context.addCookies([{name:"creatoros_current_account",value:encodeURIComponent(account.id),url:baseURL!}]);
 await page.addInitScript(id=>window.localStorage.setItem("creatoros:current-account",id),account.id);
 await page.goto(`/canvases/${canvas.id}`);
 const result=page.getByTestId("canvas-node").filter({hasText:"主视觉"});
 await expect(result.getByText("最近结果",{exact:false})).toBeVisible();
 await page.screenshot({path:resolve(process.cwd(),"../docs/verification/t994/canvas-result-actions-after.png")});
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
