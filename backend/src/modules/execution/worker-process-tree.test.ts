import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";
import { killWorkerProcessTree } from "./worker-process-tree";

it.skipIf(process.platform === "win32")("真实Worker、独立进程组子进程和孙进程被清理，不影响宿主", async () => {
  const grandchild = `setInterval(()=>{},1000)`;
  const childCode = `const{spawn}=require('node:child_process');const p=spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'ignore'});process.send({grandchild:p.pid});setInterval(()=>{},1000);`;
  const rootCode = `const{spawn}=require('node:child_process');const p=spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{detached:true,stdio:['ignore','ignore','ignore','ipc']});p.on('message',m=>process.send({child:p.pid,...m}));setInterval(()=>{},1000);`;
  const root = spawn(process.execPath, ["-e", rootCode], { stdio: ["ignore", "ignore", "ignore", "ipc"] });
  const [message] = await once(root, "message") as [{ child: number; grandchild: number }];
  const exited = once(root, "exit");
  try {
    await killWorkerProcessTree(root); await exited;
    for (const pid of [message.child, message.grandchild]) {
      // macOS立即回收；Linux无init回收环境可能留下已退出的僵尸，由helper验证状态。
      if (process.platform === "darwin") expect(() => process.kill(pid, 0)).toThrow();
    }
    expect(process.kill(process.pid, 0)).toBe(true);
    await expect(killWorkerProcessTree(root)).rejects.toThrow("ROOT_NOT_LIVE");
  } finally {
    if (root.exitCode === null && root.signalCode === null) root.kill("SIGKILL");
    for (const pid of [message.child, message.grandchild]) { try { process.kill(pid, "SIGKILL"); } catch {} }
  }
}, 15000);

it.skipIf(process.platform === "win32")("真实临时Chromium BrowserServer随Worker进程树清理",async()=>{
  const playwright=resolve("../ai-worker/node_modules/@playwright/test");
  const options=process.platform==="darwin" && existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")?{channel:"chrome",headless:true}:{headless:true};
  const code=`const{chromium}=require(${JSON.stringify(playwright)});chromium.launchServer(${JSON.stringify(options)}).then(s=>{process.send({pid:s.process().pid});setInterval(()=>{},1000);}).catch(e=>{process.send({error:e.message});process.exit(1);});`;
  const root=spawn(process.execPath,["-e",code],{stdio:["ignore","ignore","ignore","ipc"]});
  let browserPid:number|undefined;
  try{
    const [message]=await once(root,"message") as [{pid?:number;error?:string}];
    expect(message.error).toBeUndefined();browserPid=message.pid;expect(browserPid).toBeGreaterThan(0);
    const exited=once(root,"exit");await killWorkerProcessTree(root);await exited;
    if(process.platform==="darwin")expect(()=>process.kill(browserPid!,0)).toThrow();
  }finally{
    if(root.exitCode===null && root.signalCode===null)root.kill("SIGKILL");
    if(browserPid)try{process.kill(browserPid,"SIGKILL");}catch{}
  }
},30000);

it.skipIf(process.platform === "win32")("后代冻结失败保留错误并恢复已暂停Worker",async()=>{
  const code=`const{spawn}=require('node:child_process');const p=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});process.send({pid:p.pid});setInterval(()=>process.send({tick:true}),30);`;
  const root=spawn(process.execPath,["-e",code],{stdio:["ignore","ignore","ignore","ipc"]});
  const [message]=await once(root,"message") as [{pid:number}];
  const original=process.kill.bind(process);
  const spy=vi.spyOn(process,"kill").mockImplementation((pid,signal)=>{
    if(pid===message.pid && signal==="SIGSTOP")throw Object.assign(new Error("fixture freeze denied"),{code:"EPERM"});
    return original(pid,signal);
  });
  try{
    await expect(killWorkerProcessTree(root)).rejects.toThrow("fixture freeze denied");
    expect((await once(root,"message"))[0]).toEqual({tick:true});
  }finally{
    spy.mockRestore();await killWorkerProcessTree(root);
  }
},15000);
