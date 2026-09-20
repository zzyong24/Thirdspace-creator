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
 const fetchMock=vi.fn(async()=>new Response(bytes,{headers:{"content-type":"text/html; charset=utf-8"}}));
 vi.stubGlobal("fetch",fetchMock);
 invoke.mockResolvedValue("cancelled");
 expect(await exportWorkbenchArtifact("/api/v1/workbench-preview/raw",artifact)).toBe("cancelled");
 expect(fetchMock).toHaveBeenCalledWith(expect.any(URL),{credentials:"same-origin",cache:"no-store"});
 expect(invoke).toHaveBeenCalledWith("export_workbench_artifact",{
  bytesBase64:bytes.toString("base64"),mime:"text/html",suggestedName:"分析.html"});
});

it("跨源地址或篡改字节在进入原生面板前失败",async()=>{
 vi.stubGlobal("crypto",webcrypto);
 const bytes=Buffer.from("<h1>旧内容</h1>");
 const artifact={artifactId:"wa-1",version:1,mime:"text/html",size:bytes.byteLength,
  hash:createHash("sha256").update(bytes).digest("hex"),relativePath:"report.html",taskId:"task",provenance:[]};
 await expect(exportWorkbenchArtifact("https://example.com/report.html",artifact)).rejects.toThrow("地址无效");
 vi.stubGlobal("fetch",vi.fn(async()=>new Response(Buffer.from("x".repeat(bytes.byteLength)),{headers:{"content-type":"text/html"}})));
 await expect(exportWorkbenchArtifact("/api/v1/workbench-preview/raw",artifact)).rejects.toThrow("内容校验失败");
 expect(invoke).not.toHaveBeenCalled();
});
