import {mkdtemp,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {expect,it} from "vitest";
import {WORKBENCH_SCREENSHOT_MAX_BYTES} from "@creatoros/contract/agent-workbench";
import {createWorkerSupervisor} from "./worker-supervisor";

it("2 MiB 图片的 base64 回复可经实际 WorkerPort 单次 IPC 传输",async()=>{
 const directory=await mkdtemp(join(tmpdir(),"t1008-media-ipc-")),entry=join(directory,"worker.cjs");
 const ref={executionTaskId:"media-ipc",attempt:1,fenceToken:"current"};
 const dataRef="wm1-"+"a".repeat(64),encoded=Buffer.alloc(WORKBENCH_SCREENSHOT_MAX_BYTES,0xaa).toString("base64");
 const nativeReply={ok:true,operationId:"screen-call",value:{laneId:"native-lane",browserEpoch:1,result:{output:{media_type:"image/png",data:encoded}}}};
 expect(Buffer.byteLength(JSON.stringify(nativeReply))).toBeLessThan(4_000_000);
 await writeFile(entry,`process.on('message',m=>{if(m.type==='run')process.send({version:1,type:'call',requestId:'media-call',execution:m.execution,port:'resolveWorkbenchScreenshot',data:{callId:'c',dataRef:${JSON.stringify(dataRef)}}});else if(m.type==='reply'){const ok=m.ok&&m.data?.mimeType==='image/png'&&m.data.data?.length===${encoded.length}&&m.data.data.startsWith('qq');process.send({version:1,type:'stopped',requestId:m.requestId,execution:${JSON.stringify(ref)},reason:ok?'completed':'failed'});}});process.send({version:1,type:'ready',requestId:'ready',capabilities:[]});`);
 const supervisor=createWorkerSupervisor({entryPath:entry,ports:{validate:async()=>{},invoke:async()=>({mimeType:"image/png",data:encoded})}});
 try {expect(await supervisor.run(ref,Date.now()+20000)).toBe("completed");}
 finally {await supervisor.stop();await rm(directory,{recursive:true,force:true});}
},25000);
