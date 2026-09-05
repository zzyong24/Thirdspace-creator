import assert from "node:assert/strict";
import {fork} from "node:child_process";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

// 显式探针：独立进程与Playwright临时profile，仅setContent内存页面，不导航、不读取用户登录态。
if(process.argv.includes("--child")){
 const require=createRequire(import.meta.url);
 const runtime=require("../dist/browser-runtime.cjs");
 const {chromium}=await import("@playwright/test");
 let server,browser;
 try{
  server=await runtime.browser_launch.launchWithBrowser(selection=>chromium.launchServer({...selection,headless:true}));
  const browserPid=server.process().pid;assert.ok(browserPid);
  browser=await chromium.connect(server.wsEndpoint());
  const page=await browser.newPage();
  await page.setContent('<html><head><title>隔离浏览器验证</title></head><body><article><h1>真实运行证据</h1><p>'+"这份正文只用于验证独立进程内的浏览器与正文提取，不访问外部网页。".repeat(30)+'</p></article><button onclick="document.querySelector(\'article\').dataset.verified=\'yes\'">验证</button></body></html>');
  await page.getByRole("button",{name:"验证"}).click();
  assert.equal(await page.locator("article").getAttribute("data-verified"),"yes");
  const extracted=await runtime.web_reader.extractReadable(await page.content(),"https://example.com/isolated-fixture");
  assert.ok(extracted?.text.includes("这份正文只用于验证"));
  const version=browser.version();
  await browser.close();browser=undefined;await server.close();server=undefined;
  process.send?.({status:"passed",browserPid,browserVersion:version,chars:extracted.text.length,realBrowserActionVerified:true});
 }finally{await browser?.close();await server?.close();process.disconnect?.();}
}else{
 const child=fork(fileURLToPath(import.meta.url),["--child"],{stdio:["ignore","pipe","pipe","ipc"]});
 let reply,stderr="";
 child.stderr.on("data",chunk=>{stderr+=chunk.toString();});
 child.on("message",message=>{reply=message;});
 const timer=setTimeout(()=>child.kill("SIGTERM"),30000);
 const code=await new Promise((resolve,reject)=>{child.once("error",reject);child.once("exit",resolve);});clearTimeout(timer);
 assert.equal(code,0,stderr);assert.equal(reply?.status,"passed");
 let alive=true;try{process.kill(reply.browserPid,0);}catch(error){if(error.code!=="ESRCH")throw error;alive=false;}
 assert.equal(alive,false,"正常关闭后Chromium主进程仍存活");
 console.log(JSON.stringify({...reply,childExited:true,browserMainProcessExited:true,scope:"隔离临时profile/内存页面，未验证生产Agent调度、真实网站、强杀或安装包"}));
}
