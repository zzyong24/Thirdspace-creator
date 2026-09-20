import {afterEach,expect,it,vi} from "vitest";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {WorkbenchArtifactCard} from "./workbench-artifact-card";

const exportArtifact=vi.hoisted(()=>vi.fn());
vi.mock("./workbench-artifact-export",()=>({exportWorkbenchArtifact:exportArtifact}));
afterEach(()=>exportArtifact.mockReset());
const artifact={artifactId:"wa-1",version:2,mime:"text/html",size:19,hash:"a".repeat(64),
 relativePath:"报告/分析.html",taskId:"task",provenance:[]};

it("预览使用无脚本无同源权限的隔离 iframe，保存只在点击后调用",async()=>{
 exportArtifact.mockResolvedValue("cancelled");
 render(<WorkbenchArtifactCard artifact={artifact}
  previewUrl="/api/v1/workbench-preview/task/wa-1?version=2"
  rawUrl="/api/v1/workbench-preview/task/wa-1?version=2&format=raw"/>);
 expect(exportArtifact).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"预览"}));
 const frame=screen.getByTitle("分析.html 预览");
 expect(frame.getAttribute("sandbox")).toBe("");
 expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
 fireEvent.click(screen.getByRole("button",{name:"导出文件"}));
 await waitFor(()=>expect(screen.getByRole("status").textContent).toBe("已取消保存"));
 expect(exportArtifact).toHaveBeenCalledWith(expect.stringContaining("format=raw"),artifact);
});

it("跨源预览和导出地址没有可点击控件",()=>{
 render(<WorkbenchArtifactCard artifact={artifact} previewUrl="https://example.com/report"
  rawUrl="https://example.com/file"/>);
 expect(screen.queryByRole("button")).toBeNull();
 expect(screen.queryByTitle("分析.html 预览")).toBeNull();
});
