import "server-only";
import {MIN_EXECUTION_TIMEOUT_MS,completionWaitMs} from "@creatoros/contract/timeout-policy";
import {mkdtemp,realpath,rm,stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {isAbsolute,join,sep} from "node:path";
import type {Browser} from "@playwright/test";
import {WORKBENCH_PREVIEW_DOCUMENT_CSP} from "./workbench-preview-policy";

const DOCUMENT_URL="https://creatoros-render.invalid/";
const MAX_HTML_BYTES=20*1024*1024;
const MAX_RESULT_BYTES=20*1024*1024;
const MAX_CONCURRENT_RENDERS=2;
let activeRenders=0;
const RENDER_CSP=`sandbox; ${WORKBENCH_PREVIEW_DOCUMENT_CSP}`;

export class WorkbenchHtmlRenderError extends Error {
 constructor(readonly code:"INVALID_INPUT"|"BROWSER_RUNTIME_UNAVAILABLE"|"RENDER_FAILED"|"RENDER_BUSY",message:string,cause?:unknown){
  super(message,{cause});this.name="WorkbenchHtmlRenderError";
 }
}

async function chromiumExecutable(chromium:typeof import("@playwright/test")["chromium"]):Promise<string>{
 // 桌面版优先使用工作台已固定版本的 CfT；普通 Playwright bundle 是第二条随包路径。
 if(process.env.CREATOROS_DESKTOP==="1"){
  const runtimeRoot=process.env.CREATOROS_RUNTIME_ROOT?.trim();
  const chromeRelative=process.platform==="darwin"
   ?process.arch==="arm64"?"chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
    :"chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
   :process.platform==="win32"?"chrome-win64/chrome.exe":"";
  if(runtimeRoot&&isAbsolute(runtimeRoot)&&chromeRelative){
   const pinned=join(runtimeRoot,"layers/browser/workbench-cft/149.0.7827.155",chromeRelative);
   if((await stat(pinned).catch(()=>null))?.isFile()){
    const [resolvedRoot,resolvedPinned]=await Promise.all([realpath(runtimeRoot),realpath(pinned)]);
    if(resolvedPinned.startsWith(resolvedRoot+sep))return pinned;
   }
  }
  const root=process.env.CREATOROS_BROWSERS_DIR?.trim();
  if(!root||!isAbsolute(root))throw new WorkbenchHtmlRenderError("BROWSER_RUNTIME_UNAVAILABLE","桌面包未提供内置 Chromium 目录");
  const candidate=chromium.executablePath();
  if(!candidate||(await stat(candidate).catch(()=>null))?.isFile())
   throw new WorkbenchHtmlRenderError("BROWSER_RUNTIME_UNAVAILABLE","未找到 CreatorOS 可用的 Chromium 运行时");
  const [resolvedRoot,resolvedCandidate]=await Promise.all([realpath(root).catch(()=>""),realpath(candidate).catch(()=>"")]);
  if(!resolvedRoot||!resolvedCandidate.startsWith(resolvedRoot+sep))
   throw new WorkbenchHtmlRenderError("BROWSER_RUNTIME_UNAVAILABLE","内置 Chromium 路径不可用或不属于应用包");
  return candidate;
 }
 const candidate=chromium.executablePath();
 if(!candidate||(await stat(candidate).catch(()=>null))?.isFile()!==true)
  throw new WorkbenchHtmlRenderError("BROWSER_RUNTIME_UNAVAILABLE","未找到 CreatorOS 可用的 Chromium 运行时");
 return candidate;
}

function decodeHtml(html:string|Uint8Array):string{
 if(typeof html==="string"){
  if(!html||Buffer.byteLength(html,"utf8")>MAX_HTML_BYTES)
   throw new WorkbenchHtmlRenderError("INVALID_INPUT","HTML 内容为空或超过 20 MiB");
  return html;
 }
 if(!(Buffer.isBuffer(html)||html instanceof Uint8Array)||html.byteLength<1||html.byteLength>MAX_HTML_BYTES)
  throw new WorkbenchHtmlRenderError("INVALID_INPUT","HTML 字节为空或超过 20 MiB");
 try{return new TextDecoder("utf-8",{fatal:true}).decode(html);}
 catch(error){throw new WorkbenchHtmlRenderError("INVALID_INPUT","HTML 字节不是有效 UTF-8",error);}
}

async function within<T>(operation:Promise<T>,milliseconds:number):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([operation,new Promise<never>((_resolve,reject)=>{
  timer=setTimeout(()=>reject(new Error("Chromium 渲染超时")),milliseconds);
 })]);}
 finally{if(timer)clearTimeout(timer);}
}

/** 调用方须先按产物服务核实来源、归属、版本与摘要；本端口只负责离线渲染。 */
export async function renderTrustedWorkbenchHtml(input:{html:string|Uint8Array;format:"png"|"pdf"}):Promise<Buffer>{
 const html=decodeHtml(input.html);
 if(input.format!=="png"&&input.format!=="pdf")
  throw new WorkbenchHtmlRenderError("INVALID_INPUT","只支持 PNG 或 PDF 导出");
 if(activeRenders>=MAX_CONCURRENT_RENDERS)
  throw new WorkbenchHtmlRenderError("RENDER_BUSY","同时进行的 HTML 导出过多");
 activeRenders++;let released=false;const slot={retained:false,release:()=>{if(!released){released=true;activeRenders--;}}};
 const deadlineAt=performance.now()+completionWaitMs(Array(11).fill(MIN_EXECUTION_TIMEOUT_MS),60_000);
 try{return await renderHtmlWithinSlot(html,input.format,deadlineAt,slot);}
 finally{if(!slot.retained)slot.release();}
}

async function renderHtmlWithinSlot(html:string,format:"png"|"pdf",deadlineAt:number,slot:{retained:boolean;release():void}):Promise<Buffer>{
 const remaining=()=>{const ms=deadlineAt-performance.now();if(ms<=0)throw new Error("Chromium 渲染期限耗尽");return ms;};
 const step=<T>(operation:()=>Promise<T>)=>{remaining();return within(operation(),Math.min(MIN_EXECUTION_TIMEOUT_MS,remaining()));};
 const {chromium}=await step(()=>import("@playwright/test")).catch(error=>{
  throw new WorkbenchHtmlRenderError("BROWSER_RUNTIME_UNAVAILABLE","Chromium 控制运行时不可用",error);
 });
 const executablePath=await step(()=>chromiumExecutable(chromium)).catch(error=>{
  if(error instanceof WorkbenchHtmlRenderError)throw error;
  throw new WorkbenchHtmlRenderError("BROWSER_RUNTIME_UNAVAILABLE","Chromium 路径检查失败",error);
 });
 const privateDirectory=await step(()=>mkdtemp(join(tmpdir(),"creatoros-html-render-"))).catch(error=>{
  throw new WorkbenchHtmlRenderError("RENDER_FAILED","无法创建隔离浏览器目录",error);
 });
 let browser:Browser|undefined;
 let output:Buffer|undefined,failure:unknown,launchPending=false;
 const recordCleanup=(error:unknown)=>console.warn("T1250_RENDER_CLEANUP_UNCONFIRMED",{directory:privateDirectory,error:error instanceof Error?error.name:"unknown"});
 try{
  remaining();slot.retained=true;launchPending=true;const launching=chromium.launch({executablePath,headless:true,chromiumSandbox:process.platform==="darwin"||process.platform==="win32",
   timeout:MIN_EXECUTION_TIMEOUT_MS,args:["--disable-background-networking","--disable-sync","--disable-extensions","--no-first-run"],
   // 仅保留系统 HOME/CODEX_HOME 原值；浏览器临时目录与缓存归本次调用，不透传模型或会话凭据。
   env:{PATH:process.env.PATH??"",...(process.env.HOME?{HOME:process.env.HOME}:{}),...(process.env.CODEX_HOME?{CODEX_HOME:process.env.CODEX_HOME}:{}),TMPDIR:privateDirectory,TEMP:privateDirectory,TMP:privateDirectory,
    USERPROFILE:privateDirectory,APPDATA:privateDirectory,LOCALAPPDATA:privateDirectory,
    SystemRoot:process.env.SystemRoot??"",WINDIR:process.env.WINDIR??"",LANG:process.env.LANG??"en_US.UTF-8"}});
  let accepted=false,abandoned=false;void launching.then(async value=>{launchPending=false;if(!accepted&&abandoned){try{await within(value.close(),MIN_EXECUTION_TIMEOUT_MS);slot.retained=false;slot.release();await within(rm(privateDirectory,{recursive:true,force:true}),MIN_EXECUTION_TIMEOUT_MS);}catch(error){recordCleanup(error);}}},()=>{launchPending=false;});
  try{browser=await step(()=>launching);accepted=true;}catch(error){abandoned=true;throw error;}
  const context=await step(()=>browser!.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1,
   javaScriptEnabled:false,serviceWorkers:"block",acceptDownloads:false,offline:true,permissions:[],reducedMotion:"reduce"}));
  const page=await step(()=>context.newPage());
  page.setDefaultTimeout(MIN_EXECUTION_TIMEOUT_MS);page.setDefaultNavigationTimeout(MIN_EXECUTION_TIMEOUT_MS);
  await step(()=>context.route("**/*",async route=>{
   const request=route.request();
   if(request.url()===DOCUMENT_URL&&request.isNavigationRequest()&&request.frame()===page.mainFrame()){
    await route.fulfill({status:200,contentType:"text/html; charset=utf-8",headers:{"content-security-policy":RENDER_CSP},body:html});
   }else await route.abort("blockedbyclient");
  }));
  const response=await step(()=>page.goto(DOCUMENT_URL,{waitUntil:"load",timeout:Math.min(MIN_EXECUTION_TIMEOUT_MS,remaining())}));
  if(!response||response.status()!==200)throw new Error("受控文档加载失败");
  const bytes=format==="png"
   ?await step(()=>page.screenshot({type:"png",fullPage:true,animations:"disabled",timeout:Math.min(MIN_EXECUTION_TIMEOUT_MS,remaining())}))
   :await step(()=>page.pdf({format:"A4",printBackground:true}));
  remaining();output=Buffer.from(bytes);
  const valid=format==="png"
   ?output.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&output.subarray(-8,-4).toString()==="IEND"
   :output.subarray(0,5).toString()==="%PDF-"&&/%%EOF\s*$/.test(output.subarray(-1024).toString());
  if(!valid||output.byteLength<64||output.byteLength>MAX_RESULT_BYTES)
   throw new Error("Chromium 未生成有效或可交付的文件字节");
 }catch(error){failure=error;}finally{
  // 已验证字节可交付；未确认停止保留并发槽，清理错误留真实收据。
  let stopped=!browser&&!launchPending;
  if(browser){try{await within(browser.close(),MIN_EXECUTION_TIMEOUT_MS);stopped=true;}catch(error){recordCleanup(error);}}
  if(stopped){slot.retained=false;slot.release();try{await within(rm(privateDirectory,{recursive:true,force:true}),MIN_EXECUTION_TIMEOUT_MS);}catch(error){recordCleanup(error);}}

 }
 if(failure instanceof WorkbenchHtmlRenderError)throw failure;
 if(failure)throw new WorkbenchHtmlRenderError("RENDER_FAILED","离线 HTML 渲染失败",failure);
 return output!;
}
