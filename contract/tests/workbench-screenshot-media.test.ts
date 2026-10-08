import {expect,it} from "vitest";
import {workerPortInputSchemas,workerPortSchema} from "../src/internal/execution-worker";
import {WORKBENCH_SCREENSHOT_MAX_BYTES,workbenchScreenshotResolvedSchema} from "../src/internal/agent-workbench";

it("截图读取端口只收原调用 ID 和不含身份信息的内容引用",()=>{
 const input={callId:"settled-call",dataRef:"wm1-"+"a".repeat(64)};
 expect(workerPortSchema.parse("resolveWorkbenchScreenshot")).toBe("resolveWorkbenchScreenshot");
 expect(workerPortInputSchemas.resolveWorkbenchScreenshot.parse(input)).toEqual(input);
 for(const extra of [{accountId:"other"},{taskId:"other"},{fenceToken:"forged"},{mimeType:"image/jpeg"}])
  expect(workerPortInputSchemas.resolveWorkbenchScreenshot.safeParse({...input,...extra}).success).toBe(false);
 for(const dataRef of ["image/jpeg","wm1-../secret","wm1-"+"g".repeat(64)])
  expect(workerPortInputSchemas.resolveWorkbenchScreenshot.safeParse({...input,dataRef}).success).toBe(false);
});

it("2 MiB 图片的 base64 可容纳于 4 MB 原生回复，超限及错 MIME 被拒绝",()=>{
 const data="qqqq".repeat(Math.floor(WORKBENCH_SCREENSHOT_MAX_BYTES/3))+"qqo=";
 expect(data.length).toBe(2_796_204);
 expect(data.length).toBeLessThan(4_000_000);
 expect(Math.ceil(5*1024*1024/3)*4).toBeGreaterThan(4_000_000);
 expect(workbenchScreenshotResolvedSchema.parse({mimeType:"image/png",data}).data.length).toBe(data.length);
 expect(workbenchScreenshotResolvedSchema.safeParse({mimeType:"image/png",data:data+"AAAA"}).success).toBe(false);
 expect(workbenchScreenshotResolvedSchema.safeParse({mimeType:"image/png",data:data.slice(0,-1)+"A"}).success).toBe(false);
 expect(workbenchScreenshotResolvedSchema.safeParse({mimeType:"image/jpeg",data}).success).toBe(false);
});
