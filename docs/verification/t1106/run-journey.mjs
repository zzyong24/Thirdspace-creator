import {createRequire} from "node:module";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {createHash} from "node:crypto";

// 可重跑：node docs/verification/t1106/run-journey.mjs
// Chrome运行真实Workbench，RadarApi为隔离fixture；无平台Cookie、真实库或模型访问。
const base=dirname(fileURLToPath(import.meta.url));
const repo=resolve(base,"../../..");
const frontend=resolve(repo,"frontend");
const require=createRequire(resolve(frontend,"package.json"));
const {createServer}=await import(require.resolve("vite"));
const {default:react}=await import(require.resolve("@vitejs/plugin-react"));
const {chromium,expect:originalExpect}=require("@playwright/test");
const expect=originalExpect.configure({timeout:120_000});
const startedAt=new Date().toISOString();
const screenshots=resolve(base,"screenshots");mkdirSync(screenshots,{recursive:true});
const captures=[];
const steps=[];
const browserErrors=[];
let browser,server,page;
let outcome="failed";
const sourcePaths=["frontend/src/features/intelligence/intelligence-workbench.tsx","frontend/src/features/intelligence/intelligence-display.ts","frontend/src/features/intelligence/use-project-upgrade-queue.ts"];
const sourceWitness=sourcePaths.map(file=>({path:file,sha256:createHash("sha256").update(readFileSync(resolve(repo,file))).digest("hex")}));
const record=async(action,details={})=>{steps.push({at:new Date().toISOString(),action,...details,fixtureCalls:await page.evaluate(()=>window.__t1106Fixture.calls)});};
async function capture(checkpoint,check_ids,file) {
  const viewport=page.viewportSize();
  // 等正式弹层的有限入场动画结束再取文字几何；无限同步spinner不阻塞取证。
  // 前一轮两次真实运行文字相同、弹层rect随入场进度变化，原证据保留，不改产品动画。
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>document.getAnimations().every(animation=>
    animation.playState!=="running"||!Number.isFinite(animation.effect?.getComputedTiming().endTime)),undefined,{timeout:120_000});
  // 只取真正出现在本视口和overflow裁切区内的文字节点，避免把滚动区外文案冒充可见证据。
  const visible=await page.evaluate(()=>{
    const texts=[];
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    for(let node=walker.nextNode();node;node=walker.nextNode()) {
      const value=node.textContent?.trim();if(!value)continue;
      const parent=node.parentElement;if(!parent||parent.closest("script,style"))continue;
      let hidden=false;let clip={left:0,top:0,right:innerWidth,bottom:innerHeight};
      for(let ancestor=parent;ancestor;ancestor=ancestor.parentElement){
        const style=getComputedStyle(ancestor);
        if(style.display==="none"||style.visibility==="hidden"||Number(style.opacity)===0||ancestor.getAttribute("aria-hidden")==="true"){hidden=true;break;}
        const box=ancestor.getBoundingClientRect();
        if(["auto","scroll","hidden","clip"].includes(style.overflowX)){clip.left=Math.max(clip.left,box.left);clip.right=Math.min(clip.right,box.right);}
        if(["auto","scroll","hidden","clip"].includes(style.overflowY)){clip.top=Math.max(clip.top,box.top);clip.bottom=Math.min(clip.bottom,box.bottom);}
      }
      if(hidden)continue;
      const range=document.createRange();range.selectNodeContents(node);
      const rects=[...range.getClientRects()].filter(rect=>rect.width>0&&rect.height>0&&rect.right>clip.left&&rect.left<clip.right&&rect.bottom>clip.top&&rect.top<clip.bottom);
      if(rects.length)texts.push({text:value,rects:rects.map(rect=>({x:rect.x,y:rect.y,width:rect.width,height:rect.height}))});
    }
    return {text:texts.map(row=>row.text).join("\n"),nodes:texts};
  });
  await page.screenshot({path:resolve(screenshots,file),timeout:120_000,animations:"disabled"});
  captures.push({checkpoint,check_ids,viewport,text:visible.text,nodes:visible.nodes,screenshot:`docs/verification/t1106/screenshots/${file}`});
}
try {
  server=await createServer({
    root:base,
    cacheDir:mkdtempSync(resolve(tmpdir(),"creatoros-t1106-vite-")),
    configFile:false,
    plugins:[react()],
    resolve:{alias:[
      {find:/^next\/navigation$/,replacement:resolve(base,"fixture/navigation.ts")},
      {find:/^next\/link$/,replacement:resolve(base,"fixture/link.tsx")},
      {find:"@",replacement:resolve(frontend,"src")},
      ...["react","react-dom","react-dom/client","react/jsx-runtime","react/jsx-dev-runtime","lucide-react","radix-ui","@fontsource-variable/noto-sans-sc"].map(name=>({find:new RegExp(`^${name.replaceAll("/","\\/")}$`),replacement:require.resolve(name)})),
    ],dedupe:["react","react-dom"]},
    css:{postcss:frontend},
    server:{host:"127.0.0.1",port:0,hmr:false,fs:{allow:[repo]},watch:null},
    optimizeDeps:{include:["react","react-dom/client","lucide-react","radix-ui"]},
  });
  await server.listen();
  const address=server.httpServer.address();
  const origin=`http://127.0.0.1:${address.port}`;
  browser=await chromium.launch({channel:"chrome",headless:true,timeout:120_000});
  const context=await browser.newContext({viewport:{width:1366,height:900},locale:"zh-CN",timezoneId:"Asia/Shanghai",reducedMotion:"reduce",deviceScaleFactor:1,serviceWorkers:"block"});
  page=await context.newPage();page.setDefaultTimeout(120_000);page.setDefaultNavigationTimeout(120_000);
  page.on("pageerror",error=>browserErrors.push(error.message));
  // fixture之外的网络一律拒绝，保证不接触真实平台/用户服务。
  await page.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort("blockedbyclient"));
  await page.goto(`${origin}/fixture/index.html`,{waitUntil:"networkidle",timeout:120_000});
  const workbench=page.getByTestId("intelligence-workbench");
  const identities=await page.evaluate(()=>window.__t1106Fixture.identities);
  const row=page.getByTestId(`radar-source-row-${identities.sourceId}`);
  await expect(workbench).toBeVisible();
  await expect(row.getByText("上次同步需登录",{exact:true})).toBeVisible();
  await expect(row.getByRole("button",{name:"重试 Geo逸哥",exact:true})).toBeEnabled();
  await expect(page.getByText("暂时无法确认任务的原账号信息。已完成内容已保留，可点击「重试升级」重试；若仍失败，请在账号组中核对该账号。",{exact:true})).toBeVisible();
  await expect(workbench).not.toContainText("冻结账号归属版本");
  await capture("历史登录与升级归属提示-1366",["AC-RADAR-LOGIN","AC-RADAR-UPGRADE"],"radar-history-1366.png");
  await record("初始状态：历史失败明确，主要重试入口可用，内部术语已转为账号核对提示");
  await page.setViewportSize({width:1024,height:800});
  await row.scrollIntoViewIfNeeded();
  await expect(row.getByRole("button",{name:"重试 Geo逸哥",exact:true})).toBeVisible();
  const narrowBoxes=await page.evaluate(()=>[...document.querySelectorAll('[data-testid="intelligence-sidebar"], [data-testid="intelligence-responsive-layout"] main, [data-testid="intelligence-detail"]')].map(element=>({testid:element.getAttribute("data-testid"),tag:element.tagName,rect:element.getBoundingClientRect().toJSON(),scrollHeight:element.scrollHeight,clientHeight:element.clientHeight})));
  await record("1024窄窗可见面板实际几何",{narrowBoxes});
  await capture("历史登录提示-1024",["AC-RADAR-LOGIN"],"radar-history-1024.png");
  const narrowUpgrade=page.getByRole("button",{name:"重试升级",exact:true});
  await narrowUpgrade.scrollIntoViewIfNeeded();
  await expect(narrowUpgrade).toBeVisible();
  const ownershipNotice=page.getByText("暂时无法确认任务的原账号信息。已完成内容已保留，可点击「重试升级」重试；若仍失败，请在账号组中核对该账号。",{exact:true});
  await ownershipNotice.scrollIntoViewIfNeeded();
  await expect(ownershipNotice).toBeInViewport({ratio:1});
  await capture("原升级提示-1024",["AC-RADAR-UPGRADE"],"radar-upgrade-1024.png");
  const documentWidth=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
  expect(documentWidth.scrollWidth).toBeLessThanOrEqual(documentWidth.viewport);
  await page.setViewportSize({width:1366,height:900});
  await row.getByRole("button",{name:"重试 Geo逸哥",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__t1106Fixture.calls.filter(row=>row.method==="startRun").length)).toBe(1);
  await expect(row.getByRole("button",{name:"正在同步 Geo逸哥",exact:true})).toBeDisabled();
  await expect(row.getByText("同步中",{exact:true}).first()).toBeVisible();
  await expect(row.getByRole("button",{name:"扫码登录 Geo逸哥 的采集账号",exact:true})).toHaveCount(0);
  await row.getByRole("button",{name:"正在同步 Geo逸哥",exact:true}).evaluate(button=>{button.click();button.click();});
  expect(await page.evaluate(()=>window.__t1106Fixture.calls.filter(row=>row.method==="startRun").length)).toBe(1);
  expect(await page.evaluate(()=>window.__t1106Fixture.calls.filter(row=>row.method==="reconnectCollector").length)).toBe(0);
  await capture("同步在途禁止重发-1366",["AC-RADAR-LOGIN"],"radar-running-1366.png");
  await page.evaluate(()=>window.dispatchEvent(new Event("t1106:fixture-refresh")));
  await expect(row.getByRole("button",{name:"正在同步 Geo逸哥",exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>window.__t1106Fixture.calls.filter(row=>row.method==="startRun").length)).toBe(1);
  await capture("同步在途刷新保持原任务-1366",["AC-RADAR-LOGIN"],"radar-running-refresh-1366.png");
  await record("主重试调用startRun一次，未扫码；在途刷新后主要重试禁用、扫码入口隐藏且未重复提交");
  await page.evaluate(()=>{window.__t1106Fixture.completeRun();window.__t1106Fixture.releaseStart();});
  await expect(row.getByRole("button",{name:"同步 Geo逸哥",exact:true})).toBeEnabled();
  await record("合成同步回执结束后真实组件恢复同步入口；此结果不代表平台认证通过");
  // 显式重试原任务，不能新enqueue、改变原子任务ID或重复提交。
  const retryUpgrade=page.getByRole("button",{name:"重试升级",exact:true});
  await retryUpgrade.click();
  await expect.poll(()=>page.evaluate(()=>window.__t1106Fixture.calls.filter(row=>row.method==="commandTask").length)).toBe(1);
  const commands=await page.evaluate(()=>window.__t1106Fixture.calls.filter(row=>row.method==="commandTask"));
  expect(commands[0].input).toMatchObject({taskId:identities.taskId,command:"retry"});
  expect(await page.evaluate(()=>window.__t1106Fixture.calls.filter(row=>row.method==="enqueueProjectUpgrades").length)).toBe(0);
  await expect(page.getByRole("button",{name:"AI 转写中",exact:true})).toBeDisabled();
  const snapshot=await page.evaluate(()=>window.__t1106Fixture.snapshot());
  expect(snapshot.upgrade.checkpoint.transcriptTaskId).toBe(identities.childTaskId);
  await capture("原升级任务重试同ID-1366",["AC-RADAR-UPGRADE"],"radar-upgrade-retry-1366.png");
  await record("重试升级使用原taskId的retry命令，未新enqueue，checkpoint保留原转写子任务");
  // 第二个独立fixture场景恢复只读历史投影，以测试用户可选扫码；不伪称真实平台再度要求登录。
  await page.evaluate(()=>window.__t1106Fixture.resetHistoricalLoginScenario());
  await record("独立扫码场景：仅在fixture内重置同一份历史LOGIN_REQUIRED投影，未访问平台");
  // 独立入口仍能打开正式Dialog，再调用原collector的reconnect；fixture回执保持待决。
  await row.getByRole("button",{name:"扫码登录 Geo逸哥 的采集账号",exact:true}).click();
  const dialog=page.getByRole("dialog");
  await expect(dialog.getByRole("heading",{name:"重新登录采集账号",exact:true})).toBeVisible();
  await expect(dialog).toContainText("月明水清深");
  expect(await page.evaluate(()=>window.__t1106Fixture.calls.filter(row=>row.method==="reconnectCollector").length)).toBe(0);
  await capture("独立扫码入口-1366",["AC-RADAR-LOGIN"],"radar-reconnect-1366.png");
  await dialog.getByRole("button",{name:"取消",exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(row.getByRole("button",{name:"扫码登录 Geo逸哥 的采集账号",exact:true})).toBeFocused();
  expect(await page.evaluate(()=>window.__t1106Fixture.calls.filter(row=>row.method==="reconnectCollector").length)).toBe(0);
  await row.getByRole("button",{name:"扫码登录 Geo逸哥 的采集账号",exact:true}).click();
  await record("取消返回原扫码入口并恢复焦点，未发起认证；可再次打开");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await record("Esc关闭后的实际焦点",{focusedElement:await page.evaluate(()=>({tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute("aria-label"),text:document.activeElement?.textContent?.trim()}))});
  await expect(row.getByRole("button",{name:"扫码登录 Geo逸哥 的采集账号",exact:true})).toBeFocused();
  await row.getByRole("button",{name:"扫码登录 Geo逸哥 的采集账号",exact:true}).click();
  await record("Esc关闭扫码弹窗并返回原入口焦点，重新打开仍使用原采集账号");
  await page.setViewportSize({width:1024,height:800});
  await capture("独立扫码入口-1024",["AC-RADAR-LOGIN"],"radar-reconnect-1024.png");
  await dialog.getByRole("button",{name:"打开扫码窗口",exact:true}).click();
  await expect(dialog.getByRole("button",{name:"等待扫码…",exact:true})).toBeDisabled();
  await expect.poll(()=>page.evaluate(()=>window.__t1106Fixture.calls.filter(row=>row.method==="reconnectCollector").length)).toBe(1);
  const reconnects=await page.evaluate(()=>window.__t1106Fixture.calls.filter(row=>row.method==="reconnectCollector"));
  expect(reconnects[0].input).toEqual({collectorAccountId:identities.collectorAccountId,sourceType:"creator_profile"});
  expect(await page.evaluate(()=>window.__t1106Fixture.calls.filter(row=>row.method==="startRun").length)).toBe(1);
  await capture("扫码在途与原采集账号-1024",["AC-RADAR-LOGIN"],"radar-reconnect-pending-1024.png");
  await record("用户显式打开扫码窗口，调用原collector，待扫码时没有启动第二次同步");
  expect(browserErrors).toEqual([]);
  expect(sourcePaths.map(file=>({path:file,sha256:createHash("sha256").update(readFileSync(resolve(repo,file))).digest("hex")}))).toEqual(sourceWitness);
  outcome="passed";
} catch(error) {
  steps.push({at:new Date().toISOString(),action:"失败",error:error.stack??String(error)});
  if(page)await page.screenshot({path:resolve(screenshots,"failure.png"),timeout:120_000}).catch(()=>{});
  process.exitCode=1;
} finally {
  const calls=page?await page.evaluate(()=>window.__t1106Fixture?.calls??[]).catch(()=>[]):[];
  writeFileSync(resolve(base,"actual-visible-copy.json"),JSON.stringify({schema:"frontend-visible-copy/v1",task_id:"T-1106",commit_sha:execFileSync("git",["rev-parse","HEAD"],{cwd:repo,encoding:"utf8"}).trim(),source_witness:sourceWitness,evidence_scope:"真实Chrome、正式IntelligenceWorkbench与样式；RadarApi为隔离fixture，未验证平台Cookie/真实库/模型/安装版生效",captures},null,2)+"\n");
  writeFileSync(resolve(base,"journey-results.json"),JSON.stringify({task_id:"T-1106",outcome,startedAt,completedAt:new Date().toISOString(),browser:"Google Chrome (Playwright channel chrome)",source_witness:sourceWitness,evidence_scope:"隔离fixture仅证明前端操作链；不证明平台认证、模型运行或安装版任务恢复",steps,calls,browserErrors},null,2)+"\n");
  await browser?.close();await server?.close();
  process.stdout.write(`T-1106 Chrome隔离fixture旅程：${outcome}；截图与实际可见文案已保存。\n`);
}
