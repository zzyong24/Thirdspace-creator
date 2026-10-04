import {act,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {webcrypto,createHash} from "node:crypto";
import {MediaPreview} from "./infinite-canvas-node";
const api=vi.hoisted(()=>({getDownloadUrl:vi.fn()}));
vi.mock("@/lib/contract-client",()=>({client:api}));
const bytes=new Uint8Array([1,2,3,4]),digest=createHash("sha256").update(bytes).digest("hex");
const fetcher=vi.fn(),createUrl=vi.fn(),revokeUrl=vi.fn();
beforeEach(()=>{
 vi.clearAllMocks();api.getDownloadUrl.mockResolvedValue({url:"/signed-owned-style.png",fileName:"style.png"});
 vi.stubGlobal("crypto",webcrypto);vi.stubGlobal("fetch",fetcher);
 vi.stubGlobal("URL",{createObjectURL:createUrl,revokeObjectURL:revokeUrl});
 createUrl.mockReturnValue("blob:verified-style");
 fetcher.mockResolvedValue({ok:true,headers:new Headers({"content-type":"image/png"}),arrayBuffer:async()=>bytes.buffer});
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it("签名URL指向新版本时不显示为冻结的私人样图",async()=>{
 const hashing=vi.spyOn(webcrypto.subtle,"digest");
 render(<MediaPreview assetId="sample" type="image" expectedChecksum={"0".repeat(64)}/>);
 await waitFor(()=>expect(hashing).toHaveBeenCalled());await act(async()=>{await hashing.mock.results[0]!.value;});
 expect(screen.queryByRole("img")).not.toBeInTheDocument();expect(createUrl).not.toHaveBeenCalled();
});
it("更换摘要后旧的下载结果不能回写，未完成请求在卸载时中止",async()=>{
 let release:(value:unknown)=>void=()=>{};let signal:AbortSignal|undefined;
 fetcher.mockImplementationOnce((_url,options)=>{signal=options.signal;return new Promise(resolve=>{release=resolve;});});
 const view=render(<MediaPreview assetId="sample" type="image" expectedChecksum={digest}/>);
 await waitFor(()=>expect(fetcher).toHaveBeenCalledOnce());
 view.rerender(<MediaPreview assetId="sample" type="image" expectedChecksum={"0".repeat(64)}/>);
 expect(signal?.aborted).toBe(true);
 const hashing=vi.spyOn(webcrypto.subtle,"digest");
 await act(async()=>release({ok:true,headers:new Headers(),arrayBuffer:async()=>bytes.buffer}));
 await waitFor(()=>expect(hashing).toHaveBeenCalled());
 await act(async()=>{await Promise.all(hashing.mock.results.map(result=>result.value));});
 expect(createUrl).not.toHaveBeenCalled();expect(screen.queryByRole("img")).not.toBeInTheDocument();view.unmount();
});
it("私人样图请求失败时不回退到未核对的签名URL",async()=>{
 fetcher.mockRejectedValue(Error("CORS denied"));render(<MediaPreview assetId="sample" type="image" expectedChecksum={digest}/>);
 await act(async()=>{});expect(fetcher).toHaveBeenCalledOnce();expect(screen.queryByRole("img")).not.toBeInTheDocument();expect(createUrl).not.toHaveBeenCalled();
});
it("只有摘要匹配的字节可显示，卸载释放本地预览",async()=>{
 const view=render(<MediaPreview assetId="sample" type="image" expectedChecksum={digest}/>);
 expect(await screen.findByRole("img")).toHaveAttribute("src","blob:verified-style");
 view.unmount();expect(revokeUrl).toHaveBeenCalledWith("blob:verified-style");
});
it("普通画布沿原签名URL显示，不新增校验请求",async()=>{
 render(<MediaPreview assetId="ordinary" type="image"/>);
 expect(await screen.findByRole("img")).toHaveAttribute("src","/signed-owned-style.png");expect(fetcher).not.toHaveBeenCalled();
});
