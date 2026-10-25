// 可重跑的真实浏览器验收：复用隔离服务、实体和唯一 TaskSpace，不创建业务数据。
const fs = await import("node:fs/promises");
const {createHash, randomUUID} = await import("node:crypto");
const {execFileSync} = await import("node:child_process");
const {createRequire} = await import("node:module");
const root = "/Users/zyongzhu/Workbase/Thirdspace-creator";
const evidence = `${root}/docs/verification/t1404`;
const runtime = JSON.parse(await fs.readFile(`${evidence}/browser-runtime.json`, "utf8"));
const entities = JSON.parse(await fs.readFile(`${evidence}/browser-entities.json`, "utf8"));
const require = createRequire(`${root}/frontend/package.json`);
const {unzipSync, strFromU8} = require("fflate");
const sourcePaths = [
 "backend/src/modules/articles/articles.service.ts",
 "frontend/src/features/article/article-workbench.tsx",
 "frontend/src/features/article/doocs-article-editor.tsx",
 "frontend/src/features/reference-editors/noterelay/noterelay-editor.tsx",
 "frontend/src/features/projects/project-route-data.ts",
 "frontend/src/features/draft-workbench/draft-workbench-data.ts",
 "frontend/src/features/draft-workbench/draft-workbench-page.tsx",
 "frontend/src/features/draft-workbench/draft-workbench-deferred.tsx",
 "frontend/src/features/script/script-structure-view.tsx",
 "frontend/src/app/(creator)/projects/[projectId]/page.tsx",
 "frontend/src/app/(creator)/projects/[projectId]/article/page.tsx",
 "frontend/src/app/(creator)/projects/[projectId]/production/page.tsx",
].sort();
const sources = {};
for (const path of sourcePaths) sources[path] = createHash("sha256").update(await fs.readFile(`${root}/${path}`)).digest("hex");
const result = {schemaVersion:1, runId:randomUUID(), status:"running", startedAt:new Date().toISOString(),
 gitHead:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),
 sourceSha:createHash("sha256").update(JSON.stringify(sources)).digest("hex"), sources,
 sourceGitStatus:execFileSync("git",["status","--porcelain","--",...sourcePaths],{cwd:root,encoding:"utf8"}),
 spaceId:54, origin:runtime.origin, groupId:entities.group.id, projectId:entities.project.id,
 articleId:entities.article.id, graphicId:entities.graphic.id, videoId:entities.video.id,
 method:"同一Ego TaskSpace真实点击；MutationObserver从DOM click计时；正式隔离backend/PGlite；未mock请求或正文；每次重新导航及下载，不读取旧PASS",
 limitations:["Next dev暖态，不是当前安装版","没有修改前同条件浏览器基线","视频只有本次隔离空工程，不测试真实媒体或模型","范围外缺失scriptReviews报告可返回404；切离的附属请求可Abort"],
 samples:[], exports:[]};
const writeResult = () => fs.writeFile(`${evidence}/browser-gate-result.json`,JSON.stringify(result,null,2));
await writeResult();
const task = await taskSpace(54);
const page = task.page("p1");
const targets = [
 {label:"文章",kind:"article",root:'[data-page="article-workbench"]',path:"/article",text:"Tab切换文章真实验收"},
 {label:"图文",kind:"graphic",root:'[data-page="graphic-post-workbench"]',path:"/image",text:"Tab切换图文真实验收"},
 {label:"制作视频",kind:"video",root:'div.relative[aria-label="视频剪辑工作台"]',path:"/production",text:""},
 {label:"脚本",kind:"script",root:'[data-page="draft-workbench"]',path:"",text:"隔离验收脚本正文。"},
];
try {
 await page.cdp("Page.addScriptToEvaluateOnNewDocument", {source:"window.__t1404GateErrors=[];window.__t1404GateConsole=[];window.addEventListener('error',e=>window.__t1404GateErrors.push({message:e.message,stack:e.error?.stack}));window.addEventListener('unhandledrejection',e=>window.__t1404GateErrors.push({message:String(e.reason),stack:e.reason?.stack}));const original=console.error.bind(console);console.error=(...args)=>{window.__t1404GateConsole.push(args.map(String).join(' ').slice(0,2000));original(...args);};"});
 await page.goto(`${runtime.origin}/projects/${entities.project.id}`, {timeout:180000});
 await page.waitForFunction(() => document.querySelector('textarea[aria-label="第 1 段正文"]')?.value.includes("隔离验收脚本正文。"), undefined, {timeout:120000});
 const scope = await page.evaluate(() => ({groupId:localStorage.getItem("creatoros:current-group")}));
 if (scope.groupId !== entities.group.id) throw Error("当前浏览器未处于本次隔离组，停止，不重选用户范围");
 for (const viewport of [{width:1366,height:900},{width:1024,height:768}]) {
  await page.cdp("Emulation.setDeviceMetricsOverride", {...viewport,deviceScaleFactor:1,mobile:false});
  for (const target of targets) {
   await page.evaluate(target => {
    window.__t1404GateObserver?.disconnect();for(const o of window.__t1404GateShadow??[])o.disconnect();window.__t1404GateShadow=[];
    const observed=new WeakSet();const mark={target,clickAt:null,rootAt:null,readyAt:null};window.__t1404GateMark=mark;
    const visible=e=>e&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
    const tick=()=>{
     for(const host of document.querySelectorAll('[aria-label="公众号排版编辑器"],div.relative[aria-label="视频剪辑工作台"]'))if(host.shadowRoot&&!observed.has(host.shadowRoot)){observed.add(host.shadowRoot);const observer=new MutationObserver(tick);observer.observe(host.shadowRoot,{subtree:true,childList:true,characterData:true,attributes:true});window.__t1404GateShadow.push(observer);}
     if(mark.clickAt===null)return;
     const root=document.querySelector(target.root);const onRoute=target.kind==='script'?!location.pathname.includes('/article')&&!location.pathname.includes('/image')&&!location.pathname.includes('/production'):location.pathname.endsWith(target.path);
     if(!onRoute||!visible(root))return;
     if(mark.rootAt===null)mark.rootAt=performance.now()-mark.clickAt;
     let ready=false;
     if(target.kind==='script')ready=[...root.querySelectorAll('textarea,[contenteditable=true]')].some(e=>(e.value??e.innerText).includes(target.text));
     else if(target.kind==='video')ready=Boolean(root.shadowRoot?.querySelector('button'));
     else ready=[...root.querySelectorAll('[aria-label="公众号排版编辑器"]')].some(e=>e.shadowRoot?.textContent.includes(target.text));
     if(ready&&mark.readyAt===null)mark.readyAt=performance.now()-mark.clickAt;
    };
    const click=event=>{if(event.target.closest?.('[aria-label="项目工作面"] a')){mark.clickAt=performance.now();document.removeEventListener('click',click,true);tick();}};
    document.addEventListener('click',click,true);window.__t1404GateObserver=new MutationObserver(tick);window.__t1404GateObserver.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true});tick();
   }, target);
   await page.click(`loc=css:[aria-label="项目工作面"] a:text-is("${target.label}")`, {label:`验收${target.label}真实切换`});
   await page.waitForFunction(() => window.__t1404GateMark?.readyAt!==null, undefined, {timeout:120000});
   const sample = await page.evaluate(() => {
    const extract=root=>{const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement?.closest('style,script')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});const text=[];let node;while(node=walker.nextNode())if(node.nodeValue.trim())text.push(node.nodeValue.trim());return text.join('\n');};
    const shadow=[...document.querySelectorAll('[aria-label="公众号排版编辑器"],div.relative[aria-label="视频剪辑工作台"]')].filter(e=>e.getBoundingClientRect().width>0&&e.shadowRoot).map(e=>extract(e.shadowRoot));
    return {url:location.href,rootAtMs:window.__t1404GateMark.rootAt,readyAtMs:window.__t1404GateMark.readyAt,visibleText:document.body.innerText+'\n\n原生编辑器可见文案：\n'+shadow.join('\n'),runtimeErrors:window.__t1404GateErrors??[],consoleErrors:window.__t1404GateConsole??[],alerts:[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent)};
   });
   const textPath=`browser-gate-${viewport.width}-${target.kind}.txt`;
   await fs.writeFile(`${evidence}/${textPath}`,sample.visibleText);
   await page.screenshot({path:`${evidence}/browser-gate-${viewport.width}-${target.kind}.png`});
   if(sample.runtimeErrors.length||sample.consoleErrors.length||sample.alerts.length)throw Error(`${viewport.width}/${target.kind}存在真实运行错误：${JSON.stringify(sample)}`);
   result.samples.push({...sample,visibleText:undefined,textPath,viewport,target:target.kind});await writeResult();
   if(target.kind==='article'){
    const rpc=await page.fetch('/api/v1/dispatch',{method:'POST',headers:{'content-type':'application/json','x-group-id':entities.group.id},body:JSON.stringify({id:'articles.get',input:{params:{outputId:entities.article.id}}})});
    if(!rpc.ok)throw Error(`读取隔离文章版本失败 ${rpc.status}`);
    const current=JSON.parse(rpc.body).data;
    const hiddenBefore=await page.evaluate(()=>[...document.querySelectorAll('[aria-hidden="true"]')].filter(e=>e.style.left==='-10000px').length);
    if(hiddenBefore!==0)throw Error('点击前不应挂载隐藏Doocs实例');
    await page.click('text="更多导出"',{label:'展开文章导出选项'});
    const downloading=page.waitForEvent('download',{timeout:120000});const started=Date.now();
    await page.click('loc=role:button[name="导出 HTML + 图片 ZIP"]',{label:'一次点击导出正式文章'});
    const download=await downloading;const path=`${evidence}/browser-gate-${viewport.width}-article.zip`;await download.saveAs(path);
    const failure=await download.failure();if(failure)throw Error(`真实下载失败 ${failure}`);
    const files=unzipSync(new Uint8Array(await fs.readFile(path)));const manifest=JSON.parse(strFromU8(files['manifest.json']));const html=strFromU8(files['index.html']);
    if(manifest.outputId!==entities.article.id||manifest.versionId!==current.currentVersionId||!html.includes(current.current.title)||!html.includes('正文先就绪'))throw Error('导出ZIP与正式文章版本或内容不一致');
    result.exports.push({viewport,clicksOnExportButton:1,hiddenNativeBefore:hiddenBefore,downloadFilename:download.suggestedFilename(),elapsedMs:Date.now()-started,failure,manifest,archivePath:path,archiveSha:createHash('sha256').update(await fs.readFile(path)).digest('hex')});await writeResult();
   }
  }
 }
 if(result.samples.length!==8||result.exports.length!==2)throw Error('真实旅程未完整执行');
 result.status='pass';result.finishedAt=new Date().toISOString();await writeResult();
 console.log(JSON.stringify({status:result.status,runId:result.runId,gitHead:result.gitHead,sourceSha:result.sourceSha,samples:result.samples.map(s=>({viewport:s.viewport.width,target:s.target,rootAtMs:s.rootAtMs,readyAtMs:s.readyAtMs})),exports:result.exports.length,resultPath:`${evidence}/browser-gate-result.json`},null,2));
 console.log(await page.snapshot());
} catch(error) {
 result.status='fail';result.finishedAt=new Date().toISOString();result.error={message:String(error),stack:error?.stack};
 try{result.failureSnapshot=await page.snapshot();await page.screenshot({path:`${evidence}/browser-gate-failure.png`});}catch{}
 await writeResult();throw error;
}
// 主会话尚需最终Gate；本runner保留space与服务，收尾由主会话明确派发。
