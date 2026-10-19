import {test,expect,type Page,type Route,type Request as BrowserRequest} from "@playwright/test";
import {ENDPOINTS,type AccountGroupResource} from "@creatoros/contract";
import {recordExternalNetworkAttempt,type ExternalNetworkAttempt} from "../helpers/network-policy";
import {mkdir,writeFile} from "node:fs/promises";
type ProjectResource=ReturnType<typeof ENDPOINTS.createProject.response.parse>;
type AccountResource=ReturnType<typeof ENDPOINTS.createAccount.response.parse>;
type CanvasResource=ReturnType<typeof ENDPOINTS.createCanvas.response.parse>;

async function dispatch<T>(page:Page,id:string,input:unknown,groupId?:string):Promise<T>{
  const response=await page.request.post("/api/v1/dispatch",{timeout:120_000,headers:{...(groupId?{"x-group-id":groupId}:{})},data:{id,input}});
  expect(response.ok(),`${id}: ${response.status()} ${await response.text()}`).toBe(true);
  return (await response.json()).data as T;
}
// 已保留原项目列表首列零宽视觉FAIL；切组合同核实际实体行与可见真实打开入口。
async function projectRow(page:Page,project:ProjectResource){
  const row=page.locator(`[data-slot="project-row"][data-project-id="${project.id}"]`);
  await expect(row).toBeVisible();await expect(row.locator('[data-slot="project-title"]')).toHaveText(project.title);
  const open=row.getByRole("link",{name:"打开",exact:true});await expect(open).toHaveAttribute("href",`/projects/${project.id}`);await expect(open).toBeVisible();await expect(open).toBeInViewport();
}
async function select(page:Page,group:AccountGroupResource){
  const trigger=page.getByTestId("account-switcher-trigger"),menu=page.getByTestId("account-switcher-menu");
  // 等上一层菜单真实退出；关闭属性可先于退出动画，不能把旧层当新一轮菜单。
  await expect(menu).toBeHidden();await expect(trigger).toHaveAttribute("aria-expanded","false");
  await trigger.click();await expect(menu).toBeVisible();
  await menu.locator(`[data-group-id="${group.id}"]`).click();await expect(menu).toBeHidden();
}
async function choose(page:Page,group:AccountGroupResource){
  await select(page,group);
  await expect(page.getByTestId("account-switcher-trigger")).toHaveAccessibleName(`当前账号组：${group.name}`);
}
async function rscGate(page:Page){
  const held:Array<{groupId:string;status:number;release:()=>void;done:Promise<void>}>=[];
  const inFlight=new Set<Promise<void>>();let holding=true;
  const handler=async(route:Route)=>{
    if(!holding){await route.continue();return;}
    let done!:()=>void;const completed=new Promise<void>(resolve=>{done=resolve;});inFlight.add(completed);
    try{
      const response=await route.fetch({timeout:120_000});
      let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
      const headers=await route.request().allHeaders();
      const groupId=decodeURIComponent((headers.cookie??"").match(/(?:^|;\s*)creatoros_current_group=([^;]+)/)?.[1]??"");
      held.push({groupId,status:response.status(),release,done:completed});
      // fetch期间可能已release；晚到的原响应直接交付，不再挂一个无人释放的gate。
      if(!holding)release();await gate;
      try{await route.fulfill({response});}catch(error){
        // 只允许浏览器真实取消的旧请求；其它夹具/路由异常仍原样失败。
        if(!route.request().failure())throw error;
      }
    }finally{done();inFlight.delete(completed);}
  };
  await page.route("**/*_rsc=*",handler);
  return {held,release:async()=>{holding=false;for(const row of held)row.release();await Promise.all([...inFlight]);await page.unroute("**/*_rsc=*",handler);}};
}

for(const viewport of [{width:1280,height:800},{width:1024,height:680}]){
  test(`切组真实连续旅程 ${viewport.width}×${viewport.height}`,async({page,context,baseURL},info)=>{
    await page.setViewportSize(viewport);
    const startedAt=new Date().toISOString(),points:unknown[]=[],dispatchIds:string[]=[];
    let entities:unknown=null,completed=false;
    await mkdir(info.outputDir,{recursive:true});
    page.on("request",request=>{if(request.url().endsWith("/api/v1/dispatch")){try{dispatchIds.push(request.postDataJSON().id);}catch{/* 非dispatch请求不推测 */}}});
    const mark=async(point:string,check_ids:string[],conditions:string[]=[])=>{
      points.push({point,check_ids,conditions,viewport,url:page.url(),currentGroupId:await page.evaluate(()=>localStorage.getItem("creatoros:current-group")),visibleCopy:await page.locator("body").innerText()});
      await writeFile(info.outputPath("witness.json"),JSON.stringify({schema:"creatoros-scope-ui-witness/v1",startedAt,observedAt:new Date().toISOString(),completed,viewport,entities,points,dispatchIds},null,2));
    };
    const external:ExternalNetworkAttempt[]=[];
    await context.route("**/*",async route=>{
      if(recordExternalNetworkAttempt(external,"http",route.request().url()))await route.abort("blockedbyclient");
      else await route.continue();
    });
    const nonce=`${viewport.width}-${Date.now()}`;
    const createGroup=(name:string)=>dispatch<AccountGroupResource>(page,"accountGroups.create",{body:{name:`切组${name}${nonce}`,idempotencyKey:crypto.randomUUID()}});
    const a=await createGroup("甲"),b=await createGroup("乙"),empty=await createGroup("空"),archived=await createGroup("归档");
    await dispatch(page,"accountGroups.archive",{params:{groupId:archived.id},body:{expectedVersion:archived.version}});
    const pa=await dispatch<ProjectResource>(page,"projects.create",{body:{title:`甲组专属作品${nonce}`,brief:""}},a.id);
    const pb=await dispatch<ProjectResource>(page,"projects.create",{body:{title:`乙组专属作品${nonce}`,brief:""}},b.id);
    const aa=await dispatch<AccountResource>(page,"accounts.create",{body:{platform:"douyin",accountHandle:`甲的平台账号${nonce}`,idempotencyKey:crypto.randomUUID()}},a.id);
    const ab=await dispatch<AccountResource>(page,"accounts.create",{body:{platform:"douyin",accountHandle:`乙的平台账号${nonce}`,idempotencyKey:crypto.randomUUID()}},b.id);
    entities={a,b,empty,archived,pa,pb,aa,ab};
    await context.addCookies([{name:"creatoros_current_group",value:encodeURIComponent(a.id),url:baseURL!}]);
    await page.addInitScript(groupId=>{if(!localStorage.getItem("creatoros:current-group"))localStorage.setItem("creatoros:current-group",groupId);},a.id);

    await page.goto("/");await expect(page.getByText(pa.title,{exact:true})).toBeVisible();
    const homeGate=await rscGate(page);await choose(page,b);
    await expect(page.getByTestId("workspace-initialization-loading")).toBeVisible();
    await expect(page.getByText(pa.title,{exact:true})).toHaveCount(0);
    await expect.poll(()=>homeGate.held.length).toBeGreaterThan(0);
    await page.screenshot({path:info.outputPath("home-pending.png")});await mark("home-pending",["switch_pending"],["loading"]);await homeGate.release();
    await expect(page.getByText(pb.title,{exact:true})).toBeVisible();await expect(page.getByText(pa.title,{exact:true})).toHaveCount(0);
    await page.screenshot({path:info.outputPath("home-b-ready.png")});
    await mark("home-ready",["switch_settled","scope_collection"],["repeat"]);

    await page.goto("/projects");await projectRow(page,pb);
    const listGate=await rscGate(page);await choose(page,a);
    await expect(page.getByTestId("workspace-initialization-loading")).toBeVisible();await expect(page.getByText(pb.title,{exact:true})).toHaveCount(0);
    await expect.poll(()=>listGate.held.length).toBeGreaterThan(0);await listGate.release();
    await projectRow(page,pa);await expect(page.locator(`[data-slot="project-row"][data-project-id="${pb.id}"]`)).toHaveCount(0);
    await mark("project-list-a",["scope_collection","scope_detail"]);

    await page.goto("/accounts");await expect(page.getByRole("region",{name:a.name,exact:true})).toContainText("当前工作区");
    await page.getByRole("button",{name:new RegExp(`^${b.name}`)}).click();await page.getByRole("button",{name:new RegExp(`^${a.name}`)}).click();
    const accountGate=await rscGate(page);await choose(page,b);
    await expect(page.getByTestId("workspace-initialization-loading")).toBeVisible();await expect(page.getByRole("region",{name:a.name,exact:true})).toHaveCount(0);
    await expect.poll(()=>accountGate.held.length).toBeGreaterThan(0);await accountGate.release();
    await expect(page.getByRole("region",{name:b.name,exact:true})).toContainText("当前工作区");
    await page.screenshot({path:info.outputPath("accounts-b-ready.png")});
    await mark("account-selection-b",["scope_selection","switch_settled"]);

    await page.goto(`/accounts/works?accountId=${ab.id}`);await expect(page.getByRole("heading",{name:`${ab.accountHandle}的作品与数据`,exact:true})).toBeVisible();
    await choose(page,a);await expect(page.getByTestId("zero-account-guidance")).toBeVisible();await expect(page.getByRole("heading",{name:`${ab.accountHandle}的作品与数据`,exact:true})).toHaveCount(0);
    await page.goto(`/accounts/works?accountId=${aa.id}`);await expect(page.getByRole("heading",{name:`${aa.accountHandle}的作品与数据`,exact:true})).toBeVisible();await expect(page.getByTestId("platform-work-catalog")).toHaveAttribute("data-account-id",aa.id);await mark("owned-account-works",["public_other_pages","scope_detail"]);
    await choose(page,b);
    const canvas=await dispatch<CanvasResource>(page,"canvas.create",{body:{title:`乙的独立画布${nonce}`}},b.id);await page.goto(`/canvases/${canvas.id}`);await expect(page.getByLabel("画布标题",{exact:true})).toHaveValue(canvas.title);
    const savedCanvasTitle=`乙画布已保存${nonce}`;await page.getByLabel("画布标题",{exact:true}).fill(savedCanvasTitle);await page.getByRole("button",{name:"保存",exact:true}).click();await expect(page.getByRole("status").filter({hasText:"已保存"})).toBeVisible();
    const savedCanvas=await dispatch<CanvasResource>(page,"canvas.get",{params:{canvasId:canvas.id}},b.id);expect(savedCanvas.title).toBe(savedCanvasTitle);expect(savedCanvas.id).toBe(canvas.id);await mark("canvas-same-scope-saved",["scope_detail"],["repeat"]);
    const canvasGate=await rscGate(page);await choose(page,a);await expect(page.getByTestId("workspace-initialization-loading")).toBeVisible();await expect(page.getByLabel("画布标题",{exact:true})).toHaveCount(0);await expect.poll(()=>canvasGate.held.length).toBeGreaterThan(0);await page.screenshot({path:info.outputPath("canvas-pending.png"),animations:"disabled"});await mark("canvas-pending",["entity_route"],["loading"]);await canvasGate.release();
    await expect(page).toHaveURL(/\/canvases(?:\?|#|$)/);await expect(page.getByLabel("画布标题",{exact:true})).toHaveCount(0);await expect(page.getByRole("heading",{name:"创作空间",exact:true})).toBeVisible();await expect(page.getByTestId("workspace-initialization-loading")).toHaveCount(0);await page.screenshot({path:info.outputPath("canvas-new-group-list.png"),animations:"disabled"});await mark("canvas-to-owned-list",["entity_route"]);await choose(page,b);

    // 用真实网络延迟流验证快速往返，不强行fulfill已过期的整份RSC。
    await page.goto("/");await expect(page.getByText(pb.title,{exact:true})).toBeVisible();
    const abaRequests:BrowserRequest[]=[],abaErrors:string[]=[],terminalTimes=new Map<BrowserRequest,number>();
    const trackRequest=(request:BrowserRequest)=>{if(request.url().includes("_rsc="))abaRequests.push(request);};const trackError=(error:Error)=>{abaErrors.push(error.message);};
    const requestGroup=async(request:BrowserRequest)=>decodeURIComponent((await request.allHeaders()).cookie?.match(/(?:^|;\s*)creatoros_current_group=([^;]+)/)?.[1]??"");
    const terminalAt=(request:BrowserRequest)=>{if(request.url().includes("_rsc="))terminalTimes.set(request,Date.now());};
    let releaseA!:()=>void,finishA!:()=>void,aHeld=false;const sendA=new Promise<void>(done=>{releaseA=done;}),aHandlerDone=new Promise<void>(done=>{finishA=done;});
    const delayFirstA=async(route:Route)=>{if(!aHeld&&await requestGroup(route.request())===a.id){aHeld=true;await sendA;try{await route.continue();}catch(error){if(!route.request().failure())throw error;}finally{finishA();}}else await route.continue();};
    await page.route("**/*_rsc=*",delayFirstA);
    page.on("request",trackRequest);page.on("requestfinished",terminalAt);page.on("requestfailed",terminalAt);page.on("pageerror",trackError);const network=await context.newCDPSession(page);await network.send("Network.enable");
    try{
      await network.send("Network.emulateNetworkConditions",{offline:false,latency:1500,downloadThroughput:-1,uploadThroughput:-1});
      const firstA=page.waitForRequest(async request=>request.url().includes("_rsc=")&&await requestGroup(request)===a.id,{timeout:120_000});await choose(page,a);const actualA=await firstA;await expect.poll(()=>aHeld).toBe(true);
      const finalB=page.waitForRequest(async request=>request.url().includes("_rsc=")&&await requestGroup(request)===b.id,{timeout:120_000}),bIntentAt=Date.now();await choose(page,b);const actualB=await finalB;
      await expect(page.getByTestId("workspace-initialization-loading")).toBeVisible();await expect(page.getByText(pa.title,{exact:true})).toHaveCount(0);
      const bResponse=await actualB.response();expect(bResponse?.status()).toBe(200);expect(await bResponse!.finished()).toBe(null);
      const bHttpCompletedBeforeReleaseAt=Date.now(),bVisibleBeforeRelease=await page.getByText(pb.title,{exact:true}).isVisible();releaseA();await aHandlerDone;
      const terminal=await Promise.all(abaRequests.map(async request=>{const response=await request.response(),finished=response?await response.finished():null;return {groupId:await requestGroup(request),status:response?.status()??null,failure:request.failure()?.errorText??finished?.message??null,timing:request.timing(),terminalAt:terminalTimes.get(request)??null};}));
      expect(terminal.some(row=>row.groupId===a.id)).toBe(true);expect(terminal.some(row=>row.groupId===b.id&&row.status===200&&row.failure===null)).toBe(true);for(const row of terminal)expect(row.status===200||row.failure!==null).toBe(true);
      await page.evaluate(()=>new Promise<void>(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));
      await expect(page.getByText(pb.title,{exact:true})).toBeVisible();await expect(page.getByText(pa.title,{exact:true})).toHaveCount(0);await expect(page.getByTestId("workspace-initialization-loading")).toHaveCount(0);expect(abaErrors).toEqual([]);
      await writeFile(info.outputPath("aba-network.json"),JSON.stringify({method:"CDP真实网络latency1500ms；首个A仅在发送前等待，B原HTTP完成后continue原请求，无响应读取/重写",bHttpCompletedBeforeReleaseAt,bVisibleBeforeRelease,aRequestStarted:true,aGroup:await requestGroup(actualA),bFinalIntent:b.id,bIntentAt,terminal,pageErrors:abaErrors},null,2));await page.screenshot({path:info.outputPath("aba-final-b.png"),animations:"disabled"});await mark("aba-final-b",["aba_order"],["repeat"]);
    }finally{releaseA();if(aHeld)await aHandlerDone;await page.unroute("**/*_rsc=*",delayFirstA);page.off("request",trackRequest);page.off("requestfinished",terminalAt);page.off("requestfailed",terminalAt);page.off("pageerror",trackError);await network.send("Network.emulateNetworkConditions",{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await network.detach();}

    await dispatch(page,"settings.preferences.patch",{body:{autosaveEnabled:false}});
    for(const mode of ["rich","structure"] as const){
      await page.goto(`/projects/${pb.id}`);
      let input;
      if(mode==="rich"){await page.getByRole("button",{name:"纯文本稿",exact:true}).click();input=page.locator('[aria-label="脚本正文编辑器"]');}
      else{await page.getByRole("button",{name:"分镜脚本",exact:true}).click();if(await page.locator('[data-slot="script-structure-add-first"]').isVisible())await page.locator('[data-slot="script-structure-add-first"]').click();input=page.getByLabel("第 1 段正文",{exact:true});}
      const draft=`请保留我的原稿${nonce}${mode==="rich"?"一":"二"}`;await input.fill(draft);
      const savesBefore=dispatchIds.filter(id=>id==="artifacts.versions.create").length;
      await select(page,a);await expect(page.getByTestId("account-switch-confirm")).toBeVisible();
      if(mode==="rich")await page.keyboard.press("Escape");else await page.getByTestId("account-switch-cancel").click();
      await expect(page.getByTestId("account-switch-confirm")).toHaveCount(0);
      expect(await page.evaluate(()=>localStorage.getItem("creatoros:current-group"))).toBe(b.id);
      if(mode==="rich")await expect(input).toHaveText(draft);else await expect(input).toHaveValue(draft);
      expect(dispatchIds.filter(id=>id==="artifacts.versions.create")).toHaveLength(savesBefore);
      await page.screenshot({path:info.outputPath(`${mode}-cancel-preserves.png`)});
      await mark(`${mode}-dirty-cancel`,[`${mode}_dirty_cancel`],["keyboard","repeat"]);
      await select(page,b);await expect(page.getByTestId("account-switch-confirm")).toHaveCount(0);
      if(mode==="rich")await expect(input).toHaveText(draft);else await expect(input).toHaveValue(draft);
      await mark(`${mode}-same-group`,[],["repeat"]);
      await select(page,a);await page.getByTestId("account-switch-confirm-action").click();await expect(page).toHaveURL(/\/projects(?:\?|#|$)/);
      await projectRow(page,pa);await expect(page.locator(`[data-slot="project-row"][data-project-id="${pb.id}"]`)).toHaveCount(0);await expect(page.getByText(draft,{exact:true})).toHaveCount(0);
      await mark(`${mode}-confirmed-leave`,["confirmed_leave","entity_route"]);
      await choose(page,b);
    }

    // 保存在途请求已经真实落库，但响应被延后；取消切组不取消或重发这次保存。
    await page.goto(`/projects/${pb.id}`);await page.getByRole("button",{name:"纯文本稿",exact:true}).click();
    const savingEditor=page.locator('[aria-label="脚本正文编辑器"]');await savingEditor.fill(`乙组已保存原稿${nonce}`);
    await savingEditor.evaluate(node=>{(window as Window & {__t1346Editor?:Element}).__t1346Editor=node;});
    const sameScopeRsc=page.waitForResponse(response=>response.url().includes("_rsc=")&&response.status()===200,{timeout:120_000});
    let releaseSave!:()=>void,finishSave!:()=>void;const saveGate=new Promise<void>(resolve=>{releaseSave=resolve;}),saveDelivered=new Promise<void>(resolve=>{finishSave=resolve;});let savedResponse=false,saveHandlerStarted=false;const savesBeforePending=dispatchIds.filter(id=>id==="artifacts.versions.create").length;
    const holdSave=async(route:Route)=>{if(route.request().postDataJSON()?.id!=="artifacts.versions.create"){await route.continue();return;}saveHandlerStarted=true;try{const response=await route.fetch({timeout:120_000});savedResponse=true;await saveGate;await route.fulfill({response});}finally{finishSave();}};
    await page.route("**/api/v1/dispatch",holdSave);
    try{await page.getByRole("button",{name:"保存",exact:true}).click();await expect.poll(()=>savedResponse).toBe(true);
    await select(page,a);await expect(page.getByTestId("account-switch-confirm")).toBeVisible();await page.getByTestId("account-switch-cancel").click();await expect(page.getByTestId("account-switch-confirm")).toHaveCount(0);
    expect(await page.evaluate(()=>localStorage.getItem("creatoros:current-group"))).toBe(b.id);await expect(savingEditor).toHaveText(`乙组已保存原稿${nonce}`);
    expect(dispatchIds.filter(id=>id==="artifacts.versions.create")).toHaveLength(savesBeforePending+1);await mark("saving-cancel",["saving_guard"]);releaseSave();await saveDelivered;await expect(page.getByText("已保存",{exact:true}).first()).toBeVisible();await sameScopeRsc;expect(dispatchIds.filter(id=>id==="artifacts.versions.create")).toHaveLength(savesBeforePending+1);
    expect(await savingEditor.evaluate(node=>(window as Window & {__t1346Editor?:Element}).__t1346Editor===node&&node.isConnected)).toBe(true);await expect(savingEditor).toHaveText(`乙组已保存原稿${nonce}`);await mark("same-scope-save-refresh",["same_scope_preservation"]);
    }finally{releaseSave();if(saveHandlerStarted)await saveDelivered;await page.unroute("**/api/v1/dispatch",holdSave);}
    if(viewport.width===1024){const assistant=page.getByRole("button",{name:"打开编导",exact:true});await expect(assistant).toBeVisible();await expect(assistant).toBeInViewport();await assistant.click();await expect(page.getByRole("dialog",{name:"编导对话"})).toBeVisible();await page.screenshot({path:info.outputPath("minimum-script-assistant.png"),animations:"disabled"});await page.keyboard.press("Escape");await expect(page.getByRole("dialog",{name:"编导对话"})).toHaveCount(0);}

    // 真实脚本编辑器启用自动保存，保存原稿后换组，不能让旧项目ID成为新组目标。
    await dispatch(page,"settings.preferences.patch",{body:{autosaveEnabled:true}});
    const preferenceRequests:BrowserRequest[]=[];const observePreferences=(request:BrowserRequest)=>{if(request.url().endsWith("/api/v1/dispatch")&&request.postDataJSON()?.id==="settings.preferences.get")preferenceRequests.push(request);};page.on("request",observePreferences);
    await page.goto(`/projects/${pb.id}`);
    await page.getByRole("button",{name:"纯文本稿",exact:true}).click();
    const editor=page.locator('[aria-label="脚本正文编辑器"]');await expect(editor).toBeVisible();
    await page.evaluate(()=>new Promise<void>(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));await expect.poll(()=>preferenceRequests.length).toBeGreaterThan(0);
    const preferenceReadback=[];for(const request of preferenceRequests){const response=await request.response();expect(response?.status()).toBe(200);expect(await response!.finished()).toBe(null);const payload=await response!.json();expect(payload.data.autosaveEnabled).toBe(true);preferenceReadback.push({status:response!.status(),autosaveEnabled:payload.data.autosaveEnabled});}page.off("request",observePreferences);
    await page.evaluate(()=>new Promise<void>(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));
    await editor.fill(`乙组保留原稿${nonce}`);await editor.press("Tab");await expect(editor).not.toBeFocused();await writeFile(info.outputPath("autosave-preconditions.json"),JSON.stringify({preferenceReadback,trigger:"真实Tab离开contenteditable",blurObserved:true},null,2));
    await expect(page.getByText("已保存",{exact:true}).first()).toBeVisible();
    await choose(page,a);await expect(page).toHaveURL(/\/projects(?:\?|#|$)/);
    await projectRow(page,pa);await expect(page.locator(`[data-slot="project-row"][data-project-id="${pb.id}"]`)).toHaveCount(0);
    await choose(page,b);await page.goto(`/projects/${pb.id}`);await page.getByRole("button",{name:"纯文本稿",exact:true}).click();await expect(page.locator('[contenteditable="true"]').first()).toContainText(`乙组保留原稿${nonce}`);
    await mark("saved-original-return",["scope_saved_return","scope_detail","entity_route"],["back"]);
    await page.goBack();await projectRow(page,pb);await page.goForward();await page.reload();await page.getByRole("button",{name:"纯文本稿",exact:true}).click();await expect(page.locator('[contenteditable="true"]').first()).toContainText(`乙组保留原稿${nonce}`);
    await mark("saved-back-refresh",["scope_saved_return"],["back","refresh"]);

    await page.goto("/");await choose(page,empty);await expect(page.getByText("独立内容数（期）",{exact:true})).toBeVisible();
    await expect(page.getByText(pa.title,{exact:true})).toHaveCount(0);await expect(page.getByText(pb.title,{exact:true})).toHaveCount(0);
    await page.getByTestId("account-switcher-trigger").click();await expect(page.getByTestId("account-switcher-menu").locator(`[data-group-id="${archived.id}"]`)).toHaveCount(0);await page.keyboard.press("Escape");await expect(page.getByTestId("account-switcher-menu")).toBeHidden();
    await page.reload();await expect(page.getByTestId("account-switcher-trigger")).toHaveAccessibleName(`当前账号组：${empty.name}`);
    await page.screenshot({path:info.outputPath("empty-refresh.png")});
    await mark("empty-refresh",["scope_empty"],["empty","refresh"]);
    for(const path of ["/assets","/knowledge","/topics","/intelligence","/publishing","/positioning","/accounts/works"]){
      await page.goto(path);await expect(page.getByTestId("account-switcher-trigger")).toHaveAccessibleName(`当前账号组：${empty.name}`);
      await choose(page,a);await expect(page.getByTestId("workspace-initialization-loading")).toHaveCount(0);
      await choose(page,empty);await expect(page.getByTestId("workspace-initialization-loading")).toHaveCount(0);
      await expect(page.getByText(pa.title,{exact:true})).toHaveCount(0);
      const anchor=path==="/assets"?'[data-page="assets"]':path==="/knowledge"?'[data-page="knowledge-library"]':path==="/intelligence"?'[data-testid="intelligence-workbench"]':path==="/publishing"?'[data-page="publishing-center"]':path==="/topics"?'h1:has-text("选题中心")':path==="/positioning"?'h1:has-text("定位中心")':'[data-testid="zero-account-guidance"]';
      await expect(page.locator(anchor).first()).toBeVisible();await expect(page.getByTestId("workspace-initialization-error")).toHaveCount(0);await expect(page.getByText("出了点问题",{exact:true})).toHaveCount(0);
      await mark(`page-${path}`,["public_other_pages"]);
    }
    let failList=true;const failOnce=async(route:Route)=>{if(failList&&route.request().postDataJSON()?.id==="accountGroups.list"){failList=false;await route.abort("failed");}else await route.continue();};
    await page.route("**/api/v1/dispatch",failOnce);await page.goto("/projects");await expect(page.getByTestId("account-switcher-error")).toBeVisible();await mark("list-read-error",[],["error"]);await page.getByRole("button",{name:"重试",exact:true}).click();await expect(page.getByTestId("account-switcher-trigger")).toHaveAccessibleName(`当前账号组：${empty.name}`);await page.unroute("**/api/v1/dispatch",failOnce);
    await info.attach("真实组与原稿回读",{body:JSON.stringify({a,b,empty,archived,pa,pb,homeRsc:homeGate.held.map(({groupId,status})=>({groupId,status})),abaRsc:{evidence:"aba-network.json",method:"真实网络与发送前gate，无响应改写"},external}),contentType:"application/json"});
    expect(external).toEqual([]);
    completed=true;await mark("completed",[],["repeat"]);await info.attach("witness",{path:info.outputPath("witness.json"),contentType:"application/json"});
  });
}
