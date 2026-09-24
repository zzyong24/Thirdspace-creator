import {afterEach,expect,it,vi} from "vitest";
import {createHash,webcrypto} from "node:crypto";
import {exportWorkbenchArtifact} from "./workbench-artifact-export";

const invoke=vi.fn();
vi.mock("@/lib/desktop-updater",()=>({isDesktopRuntimeClient:()=>true}));
vi.mock("@tauri-apps/api/core",()=>({invoke}));
afterEach(()=>{vi.unstubAllGlobals();invoke.mockReset();});

it("只把同源且与已登记哈希一致的字节交给原生保存面板；取消不报成功",async()=>{
 vi.stubGlobal("crypto",webcrypto);
 const bytes=Buffer.from("<h1>真实数据：0</h1>");
 const artifact={artifactId:"wa-1",version:1,mime:"text/html",size:bytes.byteLength,
  hash:createHash("sha256").update(bytes).digest("hex"),relativePath:"报告/分析.html",taskId:"task",provenance:[]};
 const fetchMock=vi.fn(async()=>new Response(bytes,{headers:{"content-type":"text/html; charset=utf-8",
  "x-workbench-hash":artifact.hash,"x-workbench-size":String(artifact.size),"x-workbench-filename":encodeURIComponent("分析.html")}}));
 vi.stubGlobal("fetch",fetchMock);
 invoke.mockResolvedValue("cancelled");
 expect(await exportWorkbenchArtifact("/api/v1/workbench-preview/task/wa-1/1?format=raw",artifact,"account-1")).toBe("cancelled");
 expect(fetchMock).toHaveBeenCalledWith(expect.any(URL),{credentials:"same-origin",cache:"no-store",signal:undefined,
  headers:{"x-account-id":"account-1"}});
 expect(invoke).toHaveBeenCalledWith("export_workbench_artifact",{
  bytesBase64:bytes.toString("base64"),mime:"text/html",suggestedName:"分析.html"});
});

it("跨源地址或篡改字节在进入原生面板前失败",async()=>{
 vi.stubGlobal("crypto",webcrypto);
 const bytes=Buffer.from("<h1>旧内容</h1>");
 const artifact={artifactId:"wa-1",version:1,mime:"text/html",size:bytes.byteLength,
  hash:createHash("sha256").update(bytes).digest("hex"),relativePath:"report.html",taskId:"task",provenance:[]};
 await expect(exportWorkbenchArtifact("https://example.com/report.html",artifact,"account-1")).rejects.toThrow("地址无效");
 vi.stubGlobal("fetch",vi.fn(async()=>new Response(Buffer.from("x".repeat(bytes.byteLength)),{headers:{"content-type":"text/html",
  "x-workbench-hash":artifact.hash,"x-workbench-size":String(artifact.size),"x-workbench-filename":"report.html"}})));
 await expect(exportWorkbenchArtifact("/api/v1/workbench-preview/task/wa-1/1?format=raw",artifact,"account-1")).rejects.toThrow("内容校验失败");
 expect(invoke).not.toHaveBeenCalled();
});

it("PNG/PDF 只接受已登记 HTML 来源与真实格式字节，调用同一原生面板",async()=>{
 vi.stubGlobal("crypto",webcrypto);
 const source=Buffer.from("<h1>真实数据：0</h1>");
 const artifact={artifactId:"wa-1",version:1,mime:"text/html",size:source.byteLength,
  hash:createHash("sha256").update(source).digest("hex"),relativePath:"报告/分析.html",taskId:"task",provenance:[]};
 const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9GmS8AAAAASUVORK5CYII=","base64");
 const pdf=Buffer.from("%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\n%%EOF");
 for(const [format,bytes,mime] of [["png",png,"image/png"],["pdf",pdf,"application/pdf"]] as const){
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(bytes,{headers:{"content-type":mime,
   "x-workbench-source-hash":artifact.hash,
   "x-workbench-hash":createHash("sha256").update(bytes).digest("hex"),
   "x-workbench-size":String(bytes.byteLength),
   "x-workbench-filename":encodeURIComponent(`分析.${format}`)}})));
  invoke.mockResolvedValueOnce("saved");
  expect(await exportWorkbenchArtifact(`/api/v1/workbench-preview/task/wa-1/1?format=${format}`,artifact,"account-1")).toBe("saved");
  expect(invoke).toHaveBeenLastCalledWith("export_workbench_artifact",{
   bytesBase64:bytes.toString("base64"),mime,suggestedName:`分析.${format}`});
 }
});

it("衍生响应的来源、大小或摘要不符时不开保存面板",async()=>{
 vi.stubGlobal("crypto",webcrypto);
 const artifact={artifactId:"wa-1",version:1,mime:"text/html",size:5,
  hash:"a".repeat(64),relativePath:"report.html",taskId:"task",provenance:[]};
 const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9GmS8AAAAASUVORK5CYII=","base64");
 const headers={"content-type":"image/png","x-workbench-source-hash":"b".repeat(64),
  "x-workbench-hash":createHash("sha256").update(png).digest("hex"),
  "x-workbench-size":String(png.byteLength),"x-workbench-filename":"report.png"};
 vi.stubGlobal("fetch",vi.fn(async()=>new Response(png,{headers})));
 await expect(exportWorkbenchArtifact("/api/v1/workbench-preview/task/wa-1/1?format=png",artifact,"account-1"))
  .rejects.toThrow("来源与登记版本不一致");
 vi.stubGlobal("fetch",vi.fn(async()=>new Response(png,{headers:{...headers,
  "x-workbench-source-hash":artifact.hash,"x-workbench-size":String(png.byteLength-1)}})));
 await expect(exportWorkbenchArtifact("/api/v1/workbench-preview/task/wa-1/1?format=png",artifact,"account-1"))
  .rejects.toThrow("超过声明大小");
 expect(invoke).not.toHaveBeenCalled();
});
