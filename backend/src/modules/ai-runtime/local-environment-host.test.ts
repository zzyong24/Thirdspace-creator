import {it,expect,vi} from "vitest";
import {createLocalEnvironmentHost} from "./local-environment-host";
import {resolveExecutablePath} from "@creatoros/ai-worker";
const context={userId:"u",accountId:"a",source:"user" as const,requestId:"r"};
it("实际执行本机 node 固定版本探测，非法名称不传给路径解析",async()=>{
 const locate=vi.fn(resolveExecutablePath),read=createLocalEnvironmentHost(locate);
 const result=await read(context,{tools:["node","git; false","unknown"]});
 expect(locate).toHaveBeenCalledTimes(1);expect(locate.mock.calls[0]![0]).toBe("node");
 expect(result).toMatchObject({tools:[{name:"node",installed:true,path:process.execPath,version:process.versions.node,installHint:null}],rejected:["git; false","unknown"]});
});
it("已取消的请求不解析路径或启动进程",async()=>{
 const locate=vi.fn(resolveExecutablePath),read=createLocalEnvironmentHost(locate);
 await expect(read(context,{tools:["node"],signal:AbortSignal.abort()})).rejects.toThrow();expect(locate).not.toHaveBeenCalled();
});
it("路径解析期间取消，后续版本探测不启动",async()=>{
 const controller=new AbortController(),read=createLocalEnvironmentHost(vi.fn(()=>{controller.abort();return process.execPath;}));
 await expect(read(context,{tools:["node"],signal:controller.signal})).rejects.toThrow();
});
it("工具确实未安装时保留真实空路径和安装提示",async()=>{
 const read=createLocalEnvironmentHost(vi.fn(()=>null));
 expect(await read(context,{tools:["node"]})).toMatchObject({tools:[{name:"node",installed:false,path:null,version:null,installHint:expect.any(String)}],rejected:[]});
});
it.runIf(process.platform!=="win32")("取消确实终止正在等待版本输出的本机探测进程",async()=>{
 const {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync}=await import("node:fs"),{tmpdir}=await import("node:os"),{join}=await import("node:path");
 const directory=mkdtempSync(join(tmpdir(),"local-probe-cancel-")),binary=join(directory,"probe"),ready=join(directory,"ready");
 // 隔离的版本探测 fixture，exec 保留同一 PID，便于证明实际子进程被终止。
 const quotedReady="'"+ready.replaceAll("'", "'\\''")+"'";
 writeFileSync(binary,`#!/bin/sh\nprintf "%s" "$$" > ${quotedReady}\nexec /bin/sleep 30\n`,{mode:0o700});
 const controller=new AbortController(),read=createLocalEnvironmentHost(vi.fn(()=>binary));
 const work=read(context,{tools:["node"],signal:controller.signal}),rejected=expect(work).rejects.toThrow();
 try{await vi.waitFor(()=>expect(existsSync(ready)).toBe(true),{timeout:2500});const pid=Number(readFileSync(ready,"utf8"));controller.abort();await rejected;await vi.waitFor(()=>expect(()=>process.kill(pid,0)).toThrow(),{timeout:2000});}
 finally{controller.abort();await work.catch(()=>{});await rejected.catch(()=>{});rmSync(directory,{recursive:true,force:true});}
});
