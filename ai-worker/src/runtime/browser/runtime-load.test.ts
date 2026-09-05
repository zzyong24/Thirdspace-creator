import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import {describe,it,expect} from "vitest";

describe("独立浏览器运行库闭包",()=>{
  it("真实子进程加载构建产物、Playwright和正文解析器，调用纯提取而不启动浏览器",()=>{
    execFileSync(process.execPath,[resolve("scripts/build.mjs")],{stdio:"pipe",timeout:20000});
    const script=`
      const runtime=require(${JSON.stringify(resolve("dist/browser-runtime.cjs"))});
      (async()=>{
        const {chromium}=await import("@playwright/test");
        const article=await runtime.web_reader.extractReadable("<html><head><title>闭包验证</title></head><body><article><h1>闭包验证</h1><p>真实HTML正文，用于验证独立运行时的Readability与JSDOM依赖加载。</p></article></body></html>","https://example.com");
        const error=new runtime.web_reader.WebReaderLoginRequiredError("example.com");
        process.stdout.write(JSON.stringify({pid:process.pid,launchAvailable:typeof chromium.launch==="function",article,sameErrorBase:error instanceof runtime.web_capture.WebCaptureError,domain:runtime.web_domain.assertSafeWebDomain("EXAMPLE.COM"),blocked:runtime.url_guard.blockedIpReason("127.0.0.1")}));
      })().catch(()=>process.exit(1));
    `;
    const result=JSON.parse(execFileSync(process.execPath,["-e",script],{cwd:process.cwd(),encoding:"utf8",timeout:15000}));
    expect(result.pid).not.toBe(process.pid);expect(result.launchAvailable).toBe(true);expect(result.sameErrorBase).toBe(true);
    expect(result.article).toMatchObject({title:"闭包验证",text:expect.stringContaining("真实HTML正文")});expect(result.domain).toBe("example.com");expect(result.blocked).toContain("回环");
  },40000);
});
