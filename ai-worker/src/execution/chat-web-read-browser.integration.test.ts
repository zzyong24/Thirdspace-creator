import {expect,it,vi} from "vitest";
import {createServer} from "node:http";
import {createResearchWorkerTools} from "./research-worker-tools";
import {readWebDocument} from "../runtime/browser/web-read-workflow";

it.each([200,403])("真实 Chromium 原始读取进入共享编排：HTTP %s",async(status)=>{
 const server=createServer((_req,res)=>{res.writeHead(status,{"content-type":"text/html; charset=utf-8"});res.end(`<html><head><title>完整网页</title></head><body><article><h1>完整网页</h1><p>${"用于验证真实浏览器读取编排的完整正文。".repeat(100)}</p></article></body></html>`);});
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/source`,signal=new AbortController().signal;
 const call=vi.fn(async(port:string)=>{
  if(port==="readBrowserSession")return {domain:"127.0.0.1",stateJson:null,revision:null};
  if(port==="saveBrowserSession")return {saved:true,revision:"saved"};
  throw new Error("原始读取不能结算研究工具");
 });
 const tools=createResearchWorkerTools({signal,call,guardUrl:async(target)=>{if(new URL(target).origin!==new URL(url).origin)throw new Error("禁止访问测试站外地址");}});
 const saved=vi.fn(async(_input:{name:string;sourceUrl:string;fullText:string})=>({assetId:"test-port-asset",name:"正文·完整网页",previewUrl:null}));
 const searched:string[]=[];
 try {
  const result=await readWebDocument({url,signal},{readCached:async()=>null,read:(target,readSignal)=>tools.readDocument(target,{callId:"web",signal:readSignal!}),saveDocument:saved,hasSession:async()=>false,
   searchers:async()=>[
    async()=>{searched.push("configured");throw new Error("受控搜索失败");},
    async()=>{searched.push("bing");return [];},
    async()=>{searched.push("baidu");return [{title:"替代网页",url:"https://example.com/alternate",snippet:"公开摘要"}];},
   ],
  });
  if(status===200){
   expect(result).toMatchObject({needLogin:false,assetId:"test-port-asset",sourceUrl:url,fromCache:false});
   expect(saved.mock.calls[0]?.[0]).toMatchObject({sourceUrl:url,fullText:expect.stringContaining("完整正文")});
   expect(searched).toEqual([]);
  }else{
   expect(result).toMatchObject({blocked:true,status:403,alternates:[{url:"https://example.com/alternate"}]});
   expect(searched).toEqual(["configured","bing","baidu"]);expect(saved).not.toHaveBeenCalled();
  }
  expect(call.mock.calls.every(([port])=>port==="readBrowserSession"||port==="saveBrowserSession")).toBe(true);
  expect(tools.browserProcessIds().length).toBeGreaterThan(0);
 }finally{await tools.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
},30000);

it("T-957 真实 Chromium 从迁移页读取目标正文并交给共享保存端口",async()=>{
 const server=createServer((req,res)=>{
  res.writeHead(200,{"content-type":"text/html; charset=utf-8"});
  res.end(req.url==="/old"?'<html><body><aside>正文迁移</aside><meta http-equiv="refresh" content="0; url=/new"></body></html>':`<html><head><title>迁移后指南</title></head><body><article><p>${"迁移后实际正文，包含工具调用的说明。".repeat(100)}</p></article></body></html>`);
 });
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`,signal=AbortSignal.timeout(20000);
 const tools=createResearchWorkerTools({signal,guardUrl:async target=>{if(new URL(target).origin!==origin)throw new Error("仅允许本测试站");},call:async port=>{
  if(port==="readBrowserSession")return {domain:"127.0.0.1",stateJson:null,revision:null};
  if(port==="saveBrowserSession")return {saved:true,revision:"test"};
  throw new Error("不访问业务数据");
 }});
 const save=vi.fn(async()=>({assetId:"test-relocated",name:"正文·迁移后指南",previewUrl:null}));
 try{
  const result=await readWebDocument({url:origin+"/old",signal},{readCached:async()=>null,read:(url)=>tools.readDocument(url,{callId:"relocation",signal}),saveDocument:save,hasSession:async()=>false,searchers:async()=>[]});
  expect(result).toMatchObject({sourceUrl:origin+"/old",fullText:expect.stringContaining("迁移后实际正文"),fromCache:false});
  expect(save).toHaveBeenCalledTimes(1);
 }finally{await tools.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
},30000);
