import {createDb,aiTasks,aiTaskResults,eq} from "@creatoros/backend";
import {createMediaProbeControl} from "../ai/ai-media-probe-control";
import {expect,it} from "vitest";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {mkdtemp,rm,stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createMediaProbeExecutor} from "./media-probe";
import {createSandbox} from "./sandbox";
import {productionProbeResult} from "@creatoros/contract";
it("真实 ffmpeg 原片经 ffprobe 读取时间基和音频流，缺输入不伪造探针",async()=>{
 const opened=await createDb();
 const root=await mkdtemp(join(tmpdir(),"creatoros-real-probe-"));
 try{
  const sandbox=await createSandbox(root,"actual-probe"),file=join(sandbox.inputDir,"probe-source");
  await promisify(execFile)((process.env.CREATOROS_FFMPEG_PATH || "ffmpeg"),["-v","error","-f","lavfi","-i","testsrc2=size=320x180:rate=30","-f","lavfi","-i","sine=frequency=440:sample_rate=48000","-t","2","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac","-f","mp4",file]);
  const {runExecutionTask}=await import("./run-execution-task"),{createExecutorRegistry}=await import("./executor-registry");
  const registry=createExecutorRegistry(),results:Array<Record<string,unknown>>=[],failures:string[]=[];registry.register(createMediaProbeExecutor());
  const ctx={userId:"user",accountId:"account",requestId:"request",source:"user" as const};
  const spec={taskType:"media.probe",goal:"真实公共原片探针",inputs:[{assetId:"real-source",assetFileId:"original-file",mountAs:"probe-source"}],params:{file:"probe-source"},constraints:{timeoutSec:120,network:"deny",maxOutputMB:1}};
  await opened.db.insert(aiTasks).values({id:"public-actual-probe",userId:ctx.userId,accountId:ctx.accountId,taskType:"exec.media.probe",inputData:{spec},idempotencyKey:"actual-probe",requestedAt:new Date().toISOString()});
  const probeControl=createMediaProbeControl({db:opened.db,now:()=>new Date().toISOString(),nextId:prefix=>`${prefix}-${crypto.randomUUID()}`});
  await runExecutionTask({userId:"user",accountId:"account",requestId:"request",source:"user"},{id:"public-actual-probe",inputData:{spec:{taskType:"media.probe",goal:"真实公共原片探针",inputs:[{assetId:"real-source",assetFileId:"original-file",mountAs:"probe-source"}],params:{file:"probe-source"},constraints:{timeoutSec:120,network:"deny",maxOutputMB:1}}}},{workspacesRoot:root,registry,ai:{probeControl,markRunning:async()=>{},recordStep:async()=>{},recordCandidate:async(_c,_id,input)=>{results.push(input.resultData);return{};},markFailed:async(_c,_id,error)=>{failures.push(error??"");}},assets:{materializeAsset:async(_c,_id,destination,exact)=>{expect(exact?.assetFileId).toBe("original-file");const {copyFile}=await import("node:fs/promises");await copyFile(file,destination);return{size:(await stat(destination)).size,mimeType:"video/mp4"};}}});
  results.push(...(await opened.db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,"public-actual-probe"))).map(row=>row.resultData as Record<string,unknown>));
  expect((await opened.db.select().from(aiTasks).where(eq(aiTasks.id,"public-actual-probe")))[0]?.status).toBe("awaiting_confirmation");
  expect(failures).toEqual([]);expect(results).toHaveLength(1);expect(results[0]).toMatchObject({manifest:{taskType:"media.probe",meta:{probe:{hasAudio:true}}}});
  const steps:string[]=[],executor=createMediaProbeExecutor(),view={...sandbox,inputs:[{assetId:"real-source",mountAs:"probe-source",size:(await stat(file)).size,mimeType:"video/mp4"}]};
  const result=await executor.run(view,{file:"probe-source"},{signal:new AbortController().signal,reportStep:async text=>{steps.push(text);}}),probe=productionProbeResult.parse(result.meta?.probe);
  expect(probe.hasAudio).toBe(true);expect(probe.durationTicks*probe.timebase.num/probe.timebase.den).toBe(2);expect(probe.fileDigest).toMatch(/^[a-f0-9]{64}$/);expect(steps).toHaveLength(1);
  await expect(executor.run({...view,inputs:[]},{file:"probe-source"},{signal:new AbortController().signal,reportStep:async()=>{}})).rejects.toThrow("未物化");
 }finally{await rm(root,{recursive:true,force:true});await opened.client.close();}
},20000);
