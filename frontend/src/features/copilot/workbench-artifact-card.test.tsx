import {afterEach,expect,it,vi} from "vitest";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {WorkbenchArtifactCard} from "./workbench-artifact-card";

const mocks=vi.hoisted(()=>({exportArtifact:vi.fn(),desktop:true}));
vi.mock("./workbench-artifact-export",()=>({exportWorkbenchArtifact:mocks.exportArtifact}));
vi.mock("@/lib/desktop-updater",()=>({isDesktopRuntimeClient:()=>mocks.desktop}));
afterEach(()=>{mocks.exportArtifact.mockReset();mocks.desktop=true;vi.unstubAllGlobals();});
const artifact={artifactId:"wa-1",version:2,mime:"text/html",size:19,hash:"a".repeat(64),
 relativePath:"报告/分析.html",taskId:"task",provenance:[]};

it("预览使用无脚本无同源权限的隔离 iframe，保存只在点击后调用",async()=>{
 mocks.exportArtifact.mockResolvedValue("cancelled");
 vi.stubGlobal("fetch",vi.fn(async()=>new Response("<h1>报告</h1>",{headers:{"x-workbench-mime":"text/html"}})));
 render(<WorkbenchArtifactCard artifact={artifact} accountId="account-1"/>);
 expect(mocks.exportArtifact).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"预览"}));
 const frame=await screen.findByTitle("分析.html 预览");
 expect(frame.getAttribute("sandbox")).toBe("");
 expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
 fireEvent.click(screen.getByRole("button",{name:"导出文件"}));
 await waitFor(()=>expect(screen.getByRole("status").textContent).toBe("已取消保存"));
 expect(mocks.exportArtifact).toHaveBeenCalledWith(expect.stringContaining("format=raw"),artifact,"account-1",expect.any(AbortSignal));
});

it("网页环境只提供真实预览，不显示无法使用的原生导出按钮",async()=>{
 mocks.desktop=false;
 render(<WorkbenchArtifactCard artifact={artifact} accountId="account-1"/>);
 expect(screen.getByRole("button",{name:"预览"})).toBeTruthy();
 expect(screen.queryByRole("button",{name:"导出文件"})).toBeNull();
});
