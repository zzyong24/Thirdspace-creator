import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { MAX_WORKBENCH_PREVIEW_BYTES, MAX_WORKBENCH_RAW_BYTES, readRegisteredWorkbenchPreview, renderRegisteredHtmlPreview, WorkbenchPreviewIntegrityError, WorkbenchPreviewTooLargeError } from "./workbench-preview-read";

const ctx = { userId: "user", accountId: "account", requestId: "request", source: "user" as const };
const bytes = new Uint8Array(130_000).fill(65);
const metadata = { artifactId: "artifact", version: 1, mime: "text/html", size: bytes.byteLength,
  hash: createHash("sha256").update(bytes).digest("hex"), relativePath: "report.html", taskId: "task", provenance: [] };
function port(data:Uint8Array=bytes,meta=metadata){return {readAll:vi.fn(async()=>({metadata:meta,bytes:data}))};}

describe("工作台预览完整回读", () => {
  it("一份对象仅回读一次，验真后交付", async () => {
    const reader = port();
    const result = await readRegisteredWorkbenchPreview(reader, ctx, "task", "artifact", 1);
    expect(result.bytes).toEqual(bytes);
    expect(reader.readAll).toHaveBeenCalledTimes(1);
    expect(reader.readAll).toHaveBeenCalledWith(ctx,"task","artifact",1);
  });

  it("预览大小门只限制预览，raw 仍可读取存储上限内原始字节", async () => {
    const data = new Uint8Array(MAX_WORKBENCH_PREVIEW_BYTES + 1).fill(67);
    const meta = { ...metadata, size: data.byteLength,
      hash: createHash("sha256").update(data).digest("hex") };
    const reader = port(data,meta);
    await expect(readRegisteredWorkbenchPreview(reader, ctx, "task", "artifact", 1))
      .rejects.toBeInstanceOf(WorkbenchPreviewTooLargeError);
    const raw = await readRegisteredWorkbenchPreview(reader, ctx, "task", "artifact", 1, MAX_WORKBENCH_RAW_BYTES);
    expect(raw.bytes).toEqual(data);
  });

  it("拒绝篡改字节、假元数据和超限对象", async () => {
    const changed = Uint8Array.from(bytes); changed[129_999] = 66;
    await expect(readRegisteredWorkbenchPreview(port(changed), ctx, "task", "artifact", 1))
      .rejects.toBeInstanceOf(WorkbenchPreviewIntegrityError);
    await expect(readRegisteredWorkbenchPreview(port(bytes,{...metadata,taskId:"foreign"}),ctx,"task","artifact",1))
      .rejects.toBeInstanceOf(WorkbenchPreviewIntegrityError);
    const huge = new Uint8Array(MAX_WORKBENCH_PREVIEW_BYTES + 1);
    await expect(readRegisteredWorkbenchPreview(port(huge,{...metadata,size:huge.byteLength}),ctx,"task","artifact",1))
      .rejects.toBeInstanceOf(WorkbenchPreviewTooLargeError);
  });
});

describe("HTML 相对图片解析", () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9GmS8AAAAASUVORK5CYII=", "base64");
  const htmlMeta = {...metadata,relativePath:"reports/index.html"};
  const pngHash=createHash("sha256").update(png).digest("hex");
  it("解析 HTML 属性与实体，并映射已登记 PNG", async () => {
    const reader={readRelativeImage:vi.fn(async (_ctx:unknown,_task:string,path:string)=>path==="reports/chart&one.png"
      ? {metadata:{...metadata,mime:"image/png",relativePath:path,size:png.byteLength,hash:pngHash},bytes:png}:null)};
    const html='<h1>报告</h1><img alt="图" src="./chart&amp;one.png" srcset="https://evil.test/x.png 2x">';
    const output=await renderRegisteredHtmlPreview(reader,ctx,"task",htmlMeta,html);
    expect(output).toContain("<h1>报告</h1>");
    expect(output).toContain(`src="data:image/png;base64,${png.toString("base64")}"`);
    expect(output).not.toContain("srcset");
    expect(reader.readRelativeImage).toHaveBeenCalledWith(ctx,"task","reports/chart&one.png",htmlMeta);
  });
  it("路径穿越、远程 URL、未登记图片及脚本均被跳过，正文保留", async () => {
    const reader={readRelativeImage:vi.fn(async()=>null)};
    const html='<p>正文仍可读</p><img src="../secret.png"><img src="https://evil.test/a.png"><img src="/api/private.png"><img src="./missing.png"><script>window.bad=1</script>';
    const output=await renderRegisteredHtmlPreview(reader,ctx,"task",htmlMeta,html);
    expect(output).toContain("正文仍可读");
    expect(output).not.toContain("secret.png");
    expect(output).not.toContain("evil.test");
    expect(output).not.toContain("/api/private.png");
    expect(output).not.toContain("missing.png");
    expect(output).not.toContain("<script");
    expect(reader.readRelativeImage).toHaveBeenCalledTimes(1);
  });
  it("限制引用数和总图片字节，超额图片仅失去 src", async () => {
    const large = Buffer.concat([png,Buffer.alloc(1_200_000)]);
    const reader={readRelativeImage:vi.fn(async (_ctx:unknown,_task:string,path:string)=>({
      metadata:{...metadata,mime:"image/png",relativePath:path,size:large.byteLength,hash:createHash("sha256").update(large).digest("hex")},bytes:large,
    }))};
    const html=`<p>预算测试</p>${Array.from({length:14},(_,i)=>`<img alt="图${i}" src="./${i}.png">`).join("")}`;
    const output=await renderRegisteredHtmlPreview(reader,ctx,"task",htmlMeta,html);
    expect(output).toContain("预算测试");
    expect(output.match(/data:image\/png;base64,/g)).toHaveLength(1);
    expect(reader.readRelativeImage).toHaveBeenCalledTimes(12);
    expect(output).not.toContain('src="./13.png"');
  });
  it("保留已登记 HTML 自带的有效内联 PNG，拒绝伪造数据图片", async () => {
    const reader={readRelativeImage:vi.fn(async()=>null)};
    const encoded=png.toString("base64");
    const output=await renderRegisteredHtmlPreview(reader,ctx,"task",htmlMeta,
      `<p>图表</p><img src="data:image/png;base64,${encoded}"><img src="data:image/png;base64,YmFk">`);
    expect(output).toContain(`data:image/png;base64,${encoded}`);
    expect(output).not.toContain("YmFk");
    expect(reader.readRelativeImage).not.toHaveBeenCalled();
  });
  it("跨任务复制按原基准与每个冻结tuple验图，不接受同路径其他版本或伪hash",async()=>{
    const image={...metadata,artifactId:'image',version:2,taskId:'source',relativePath:'old/chart.png',mime:'image/png',size:png.length,hash:pngHash};
    const copied={...htmlMeta,relativePath:'new/copy.html',htmlResourceBasePath:'old/index.html',htmlResources:[{path:image.relativePath,artifactId:image.artifactId,version:image.version,taskId:image.taskId,hash:image.hash,size:image.size}]};
    const reader={readRelativeImage:vi.fn(async()=>({metadata:image,bytes:png}))};
    expect(await renderRegisteredHtmlPreview(reader,ctx,'task',copied,'<img src="./chart.png">')).toContain('data:image/png;base64,');
    expect(reader.readRelativeImage).toHaveBeenCalledWith(ctx,'task','old/chart.png',copied);
    for(const patch of [{version:3},{taskId:'task'},{artifactId:'other'},{hash:'b'.repeat(64)},{size:png.length+1},{relativePath:'new/chart.png'}]){
      const wrong={readRelativeImage:vi.fn(async()=>({metadata:{...image,...patch},bytes:png}))};
      expect(await renderRegisteredHtmlPreview(wrong,ctx,'task',copied,'<p>正文</p><img src="./chart.png">')).not.toContain('data:image/png;base64,');
    }
    const badBytes=Buffer.from(png);badBytes[badBytes.length-1]^=1;
    expect(await renderRegisteredHtmlPreview({readRelativeImage:async()=>({metadata:image,bytes:badBytes})},ctx,'task',copied,'<img src="./chart.png">')).not.toContain('data:image/png;base64,');
  });
});
