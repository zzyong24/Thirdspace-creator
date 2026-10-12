import {createServer} from "node:http";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {expect,it,vi} from "vitest";
import {chromium} from "@playwright/test";
import {PNG} from "pngjs";
import {PDFParse} from "pdf-parse";
import {renderTrustedWorkbenchHtml,WorkbenchHtmlRenderError} from "./workbench-artifact-render";

it("用真实 Chromium 把静态 HTML 渲染为 PNG，脚本和网络资源均不执行",async()=>{
 let requests=0;
 const server=createServer((_req,res)=>{requests++;res.writeHead(200,{"content-type":"image/png"});res.end();});
 const localDir=await mkdtemp(join(tmpdir(),"t1009-secret-"));
 const localImage=join(localDir,"private.png");
 const secret=new PNG({width:1,height:1});secret.data.set([0,200,0,255]);
 await writeFile(localImage,PNG.sync.write(secret));
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{
  const address=server.address();if(!address||typeof address==="string")throw new Error("server address missing");
  const html=`<!doctype html><html><head><style>body{margin:0}#box{width:120px;height:80px;background:#df2828}
   #local{position:absolute;left:200px;top:0;width:50px;height:50px;background-image:url('${pathToFileURL(localImage)}')}</style></head>
   <body><div id="box"></div><div id="local"></div><img src="http://127.0.0.1:${address.port}/spy.png">
   <script>document.querySelector('#box').style.background='blue';fetch('http://127.0.0.1:${address.port}/spy')</script></body></html>`;
  const png=await renderTrustedWorkbenchHtml({html:Buffer.from(html),format:"png"});
  expect(png.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
  const image=PNG.sync.read(png);
  expect(image.width).toBe(1280);
  const pixel=image.data.subarray((20*image.width+20)*4,(20*image.width+20)*4+4);
  expect([...pixel]).toEqual([223,40,40,255]);
  const localPixel=image.data.subarray((20*image.width+220)*4,(20*image.width+220)*4+4);
  expect([...localPixel]).toEqual([255,255,255,255]);
  expect(requests).toBe(0);
 }finally{
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  await rm(localDir,{recursive:true,force:true});
 }
},60_000);

it("用真实 Chromium 输出可解析 PDF 字节并保留正文",async()=>{
 const pdf=await renderTrustedWorkbenchHtml({html:"<!doctype html><html><body><h1>Offline report 2026</h1></body></html>",format:"pdf"});
 expect(pdf.subarray(0,5).toString()).toBe("%PDF-");
 expect(pdf.subarray(-1024).toString()).toContain("%%EOF");
 const parser=new PDFParse({data:pdf});
 try{const text=await parser.getText();expect(text.text).toContain("Offline report 2026");}
 finally{await parser.destroy();}
},60_000);

it("运行时缺失时明确失败，不返回伪图像",async()=>{
 const originalDesktop=process.env.CREATOROS_DESKTOP;
 const originalBrowsers=process.env.CREATOROS_BROWSERS_DIR;
 const originalRuntime=process.env.CREATOROS_RUNTIME_ROOT;
 process.env.CREATOROS_DESKTOP="1";
 process.env.CREATOROS_BROWSERS_DIR="/missing/t1009-browsers";
 process.env.CREATOROS_RUNTIME_ROOT="/missing/t1009-runtime";
 try{
  await expect(renderTrustedWorkbenchHtml({html:"<h1>test</h1>",format:"png"}))
   .rejects.toMatchObject({name:"WorkbenchHtmlRenderError",code:"BROWSER_RUNTIME_UNAVAILABLE"} satisfies Partial<WorkbenchHtmlRenderError>);
 }finally{
  if(originalDesktop===undefined)delete process.env.CREATOROS_DESKTOP;else process.env.CREATOROS_DESKTOP=originalDesktop;
  if(originalBrowsers===undefined)delete process.env.CREATOROS_BROWSERS_DIR;else process.env.CREATOROS_BROWSERS_DIR=originalBrowsers;
  if(originalRuntime===undefined)delete process.env.CREATOROS_RUNTIME_ROOT;else process.env.CREATOROS_RUNTIME_ROOT=originalRuntime;
 }
});

it("并发渲染超过固定预算时拒绝额外请求",async()=>{
 const html="<h1>有限并发</h1>";
 const first=renderTrustedWorkbenchHtml({html,format:"png"});
 const second=renderTrustedWorkbenchHtml({html,format:"png"});
 await expect(renderTrustedWorkbenchHtml({html,format:"png"}))
  .rejects.toMatchObject({code:"RENDER_BUSY"} satisfies Partial<WorkbenchHtmlRenderError>);
 const outputs=await Promise.all([first,second]);
 expect(outputs.every(bytes=>bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))).toBe(true);
},60_000);


it("T1250 真实离线document超过30秒仍生成原PNG/PDF，完整请求允许串行尾轮",async()=>{
 const launch=chromium.launch.bind(chromium),optionsSeen:number[]=[];
 const spy=vi.spyOn(chromium,"launch").mockImplementation(async options=>{
  optionsSeen.push(options?.timeout??0);
  const browser=await launch(options),newContext=browser.newContext.bind(browser);
  vi.spyOn(browser,"newContext").mockImplementation(async options=>{
   const context=await newContext(options),route=context.route.bind(context);
   vi.spyOn(context,"route").mockImplementation(async(url,handler,options)=>route(url,async intercepted=>{
    if(intercepted.request().isNavigationRequest())await new Promise<void>(resolve=>{
     const timer=setTimeout(resolve,35000);
     context.once("close",()=>{clearTimeout(timer);resolve();});
    });
    if(!intercepted.request().frame().page().isClosed())await handler(intercepted,intercepted.request());
   },options));
   return context;
  });
  return browser;
 });
 try{
  const png=await renderTrustedWorkbenchHtml({html:"<style>body{margin:0;background:#df2828}</style><h1>Slow owned report</h1>",format:"png"});
  const image=PNG.sync.read(png);expect([...image.data.subarray(0,4)]).toEqual([223,40,40,255]);
  const pdf=await renderTrustedWorkbenchHtml({html:"<h1>Slow owned report</h1>",format:"pdf"});
  const parser=new PDFParse({data:pdf});try{expect((await parser.getText()).text).toContain("Slow owned report");}finally{await parser.destroy();}
  expect(optionsSeen).toHaveLength(2);expect(optionsSeen.every(value=>value>=120000)).toBe(true);
 }finally{spy.mockRestore();}
},1800000);


it("T1250 launch观察超时后迟到浏览器仅关闭，不产生输出或遗留目录",async()=>{
 vi.resetModules();const runtime=await import("./workbench-artifact-render");
 let deliver!:(value:Awaited<ReturnType<typeof chromium.launch>>)=>void,entered!:()=>void;
 const enteredLaunch=new Promise<void>(resolve=>entered=resolve),close=vi.fn(async()=>{});
 const spy=vi.spyOn(chromium,"launch").mockImplementation(()=>{entered();return new Promise(resolve=>deliver=resolve);});
 vi.useFakeTimers({toFake:["setTimeout","clearTimeout"]});
 const running=runtime.renderTrustedWorkbenchHtml({html:"<p>owned</p>",format:"png"});
 const failed=expect(running).rejects.toMatchObject({code:"RENDER_FAILED"});
 try{await enteredLaunch;await vi.advanceTimersByTimeAsync(120001);await failed;
  deliver({close} as unknown as Awaited<ReturnType<typeof chromium.launch>>);
  for(let i=0;i<100&&close.mock.calls.length===0;i++)await new Promise<void>(resolve=>setImmediate(resolve));
  expect(close).toHaveBeenCalledOnce();
 }finally{vi.useRealTimers();spy.mockRestore();}
},1800000);

it("T1250 两个browser停止未确认仍占原并发槽，第三请求不得启动",async()=>{
 vi.resetModules();const runtime=await import("./workbench-artifact-render");
 const png=new PNG({width:1,height:1});png.data.set([223,40,40,255]);
 const page={setDefaultTimeout:vi.fn(),setDefaultNavigationTimeout:vi.fn(),goto:async()=>({status:()=>200}),screenshot:async()=>PNG.sync.write(png)};
 const close=vi.fn(async()=>{throw Error("owned close receipt missing");});
 const spy=vi.spyOn(chromium,"launch").mockResolvedValue({close,newContext:async()=>({newPage:async()=>page,route:async()=>{}})} as unknown as Awaited<ReturnType<typeof chromium.launch>>);
 try{
  for(let i=0;i<2;i++)await expect(runtime.renderTrustedWorkbenchHtml({html:"<p>owned</p>",format:"png"})).resolves.toEqual(PNG.sync.write(png));
  await expect(runtime.renderTrustedWorkbenchHtml({html:"<p>owned</p>",format:"png"})).rejects.toMatchObject({code:"RENDER_BUSY"});
  expect(spy).toHaveBeenCalledTimes(2);expect(close).toHaveBeenCalledTimes(2);
 }finally{spy.mockRestore();}
},1800000);

it("T1250 cleanup观察到期后原close成功收据恢复槽并清理目录，不重复close",async()=>{
 vi.resetModules();const runtime=await import('./workbench-artifact-render');
 const {stat}=await import('node:fs/promises');
 const png=new PNG({width:1,height:1});png.data.set([223,40,40,255]);const bytes=PNG.sync.write(png);
 const releases:Array<()=>void>=[],directories:string[]=[],closes:Array<ReturnType<typeof vi.fn>>=[];
 const page={setDefaultTimeout:vi.fn(),setDefaultNavigationTimeout:vi.fn(),goto:async()=>({status:()=>200}),screenshot:async()=>bytes};
 const spy=vi.spyOn(chromium,'launch').mockImplementation(async options=>{
  directories.push(options!.env!.TMPDIR!);const index=closes.length;
  const close=vi.fn(()=>index<2?new Promise<void>(resolve=>{releases[index]=resolve;}):Promise.resolve());closes.push(close);
  return {close,newContext:async()=>({newPage:async()=>page,route:async()=>{}})} as unknown as Awaited<ReturnType<typeof chromium.launch>>;
 });
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
 try{
  for(let index=0;index<2;index++){
   const running=runtime.renderTrustedWorkbenchHtml({html:'<p>owned safe output</p>',format:'png'});
   for(let i=0;i<1000&&!releases[index];i++)await new Promise<void>(resolve=>setImmediate(resolve));expect(releases[index]).toBeTypeOf('function');
   await vi.advanceTimersByTimeAsync(120001);await expect(running).resolves.toEqual(bytes);
  }
  await expect(runtime.renderTrustedWorkbenchHtml({html:'<p>owned</p>',format:'png'})).rejects.toMatchObject({code:'RENDER_BUSY'});expect(spy).toHaveBeenCalledTimes(2);
  releases[0]!();let removed=false;
  for(let i=0;i<1000&&!removed;i++){await new Promise<void>(resolve=>setImmediate(resolve));removed=await stat(directories[0]!).then(()=>false,error=>{if(error.code!=='ENOENT')throw error;return true;});}
  expect(removed).toBe(true);
  await expect(runtime.renderTrustedWorkbenchHtml({html:'<p>owned</p>',format:'png'})).resolves.toEqual(bytes);expect(spy).toHaveBeenCalledTimes(3);expect(closes.every(close=>close.mock.calls.length===1)).toBe(true);
 }finally{for(const release of releases)release?.();vi.useRealTimers();spy.mockRestore();}
},1800000);
