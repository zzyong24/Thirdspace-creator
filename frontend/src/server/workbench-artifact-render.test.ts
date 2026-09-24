import {createServer} from "node:http";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {expect,it} from "vitest";
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
