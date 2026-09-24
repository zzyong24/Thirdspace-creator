import {afterEach,expect,it,vi} from "vitest";
import {act,fireEvent,render,screen,waitFor} from "@testing-library/react";
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
 expect(screen.getByRole("button",{name:"导出 PNG"})).toBeTruthy();
 expect(screen.getByRole("button",{name:"导出 PDF"})).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"导出原文件"}));
 await waitFor(()=>expect(screen.getByRole("status").textContent).toBe("已取消保存"));
 expect(mocks.exportArtifact).toHaveBeenCalledWith(expect.stringContaining("format=raw"),artifact,"account-1",expect.any(AbortSignal));
});

it("网页环境只提供真实预览，不显示无法使用的原生导出按钮",async()=>{
 mocks.desktop=false;
 render(<WorkbenchArtifactCard artifact={artifact} accountId="account-1"/>);
 expect(screen.getByRole("button",{name:"预览"})).toBeTruthy();
 expect(screen.queryByRole("button",{name:"导出原文件"})).toBeNull();
 expect(screen.queryByRole("button",{name:"导出 PNG"})).toBeNull();
});

it("同一批次连点导出只发起一次请求，卸载时取消在途请求",async()=>{
 let finish!: (value:"saved")=>void;
 mocks.exportArtifact.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const view=render(<WorkbenchArtifactCard artifact={artifact} accountId="account-1"/>);
 const button=screen.getByRole("button",{name:"导出原文件"});
 act(()=>{fireEvent.click(button);fireEvent.click(button);});
 expect(mocks.exportArtifact).toHaveBeenCalledTimes(1);
 const signal=mocks.exportArtifact.mock.calls[0]?.[3] as AbortSignal;
 expect(signal.aborted).toBe(false);
 view.unmount();
 expect(signal.aborted).toBe(true);
 finish("saved");
});

it("HTML 的 PNG/PDF 是明确的原生保存选项，连点与切换账号不会显示旧回执",async()=>{
 let finish!: (value:"saved")=>void;
 mocks.exportArtifact.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const view=render(<WorkbenchArtifactCard artifact={artifact} accountId="account-1"/>);
 act(()=>{fireEvent.click(screen.getByRole("button",{name:"导出 PNG"}));
  fireEvent.click(screen.getByRole("button",{name:"导出 PDF"}));});
 expect(mocks.exportArtifact).toHaveBeenCalledTimes(1);
 expect(mocks.exportArtifact.mock.calls[0]?.[0]).toContain("format=png");
 const signal=mocks.exportArtifact.mock.calls[0]?.[3] as AbortSignal;
 view.rerender(<WorkbenchArtifactCard artifact={artifact} accountId="account-2"/>);
 expect(signal.aborted).toBe(true);
 await act(async()=>{finish("saved");});
 expect(screen.queryByRole("status")).toBeNull();
 mocks.exportArtifact.mockResolvedValue("cancelled");
 fireEvent.click(screen.getByRole("button",{name:"导出 PDF"}));
 await waitFor(()=>expect(screen.getByRole("status").textContent).toBe("已取消保存"));
 expect(mocks.exportArtifact.mock.calls[1]?.[0]).toContain("format=pdf");
 expect(mocks.exportArtifact.mock.calls[1]?.[2]).toBe("account-2");
});
