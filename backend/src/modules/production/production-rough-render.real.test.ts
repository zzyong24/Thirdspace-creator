import {expect,it} from "vitest";
import {promisify} from "node:util";
import {execFile} from "node:child_process";
import {mkdtemp,rm,copyFile,stat,readFile,mkdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {runExecutionTask} from "../execution/run-execution-task";
import {createExecutorRegistry,registerBuiltinExecutors} from "../execution/executor-registry";
import {compileV2RenderablePlan} from "./production-v2-compile";
import {createVideoRenderExecutor,createDefaultVideoRenderEngine} from "../execution/video-render/executor";
import type {ExecutionManifest,ProductionPlanV2} from "@creatoros/contract";
// 真实本机媒体工具/HyperFrames验收；合成测试片只检验音画时间，不冒充真人稿或模型判断。
it("真实主轨重排和重复片段经公共执行输出有音频MP4，声音源顺序与工程一致",async()=>{
 const root=await mkdtemp(join(tmpdir(),"creatoros-rough-real-")),ffmpeg=(process.env.CREATOROS_FFMPEG_PATH || "ffmpeg"),sourceFile=join(root,"source.mp4");
 try{
  await promisify(execFile)(ffmpeg,["-v","error","-f","lavfi","-i","color=c=red:s=320x180:r=24:d=1","-f","lavfi","-i","sine=frequency=440:sample_rate=48000:duration=1","-f","lavfi","-i","color=c=blue:s=320x180:r=24:d=1","-f","lavfi","-i","sine=frequency=880:sample_rate=48000:duration=1","-filter_complex","[0:v][1:a][2:v][3:a]concat=n=2:v=1:a=1[v][a]","-map","[v]","-map","[a]","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac",sourceFile]);
  const {createHash}=await import("node:crypto"),fileDigest=createHash("sha256").update(await readFile(sourceFile)).digest("hex");
  const plan={editorVersion:2,mainTrack:{sources:[{sourceId:"s",assetId:"actual-source",assetFileId:"actual-file",fileDigest,probeDigest:"b".repeat(64),timebase:{num:1,den:24},durationTicks:48,hasAudio:true}],clips:[{clipId:"blue",sourceId:"s",sourceInTicks:24,sourceOutTicks:36},{clipId:"red",sourceId:"s",sourceInTicks:0,sourceOutTicks:12},{clipId:"repeat-blue",sourceId:"s",sourceInTicks:24,sourceOutTicks:36}]},overlayDraft:{meta:{title:"真实粗剪时间验收"},scenes:[],captions:[],broll:[],delivery:{width:320,height:180,fps:24}},sourceTranscripts:[]} as ProductionPlanV2;
  const compiled=compileV2RenderablePlan(plan),registry=createExecutorRegistry(),engine=createDefaultVideoRenderEngine();
  registry.register(createVideoRenderExecutor({...engine,renderComposition:async(opts)=>{
   const evidence=resolve("../docs/research/evidence/t850");await mkdir(evidence,{recursive:true});await copyFile(join(opts.projectDir,"index.html"),join(evidence,"rough-render-generated.html"));
   await engine.renderComposition(opts);
  }}));
  let manifest:ExecutionManifest|null=null;const failures:string[]=[],steps:string[]=[];
  const id="actual-rough-render";
  await runExecutionTask({userId:"actual-user",accountId:"actual-account",requestId:"actual-request",source:"user"},{id,inputData:{spec:{taskType:"video.render",goal:"实际粗剪渲染验收",inputs:compiled.mediaBindings.map(b=>({assetId:b.assetId,assetFileId:b.assetFileId,fileDigest:b.fileDigest,mountAs:b.mountAs})),params:{props:compiled.props},constraints:{timeoutSec:null,network:"deny",maxOutputMB:64}}}},{workspacesRoot:root,registry,ai:{markRunning:async()=>{},recordStep:async(_c,_id,input)=>{steps.push(input.text);},recordCandidate:async(_c,_id,input)=>{manifest=input.resultData.manifest as ExecutionManifest;return{};},markFailed:async(_c,_id,error)=>{failures.push(error??"");}},assets:{materializeAsset:async(_c,_id,destination,exact)=>{expect(exact?.assetFileId).toBe("actual-file");await copyFile(sourceFile,destination);return {size:(await stat(destination)).size,mimeType:"video/mp4"};}}});
  const diagnostics=resolve("../docs/research/evidence/t850");await mkdir(diagnostics,{recursive:true});await import("node:fs/promises").then(fs=>fs.writeFile(join(diagnostics,"rough-render-diagnostics.json"),JSON.stringify({failures,steps,manifest},null,2)));
  expect(failures).toEqual([]);const result=manifest as ExecutionManifest|null;expect(result?.taskType).toBe("video.render");const artifact=result?.artifacts.find(a=>a.fileName.endsWith(".mp4"));expect(artifact).toBeTruthy();
  const output=join(root,id,"out",artifact!.path),{stdout}=await promisify(execFile)((process.env.CREATOROS_FFPROBE_PATH || "ffprobe"),["-v","error","-show_streams","-show_format","-of","json",output]),probe=JSON.parse(stdout) as {streams:Array<{codec_type:string}>;format:{duration:string}};
  expect(probe.streams.some(s=>s.codec_type==="audio")).toBe(true);expect(Math.abs(Number(probe.format.duration)-1.5)).toBeLessThan(.1);
  for(const [time,channel] of [[.25,2],[.75,0],[1.25,2]]){
   const pixel=join(root,`pixel-${time}.rgb`);await promisify(execFile)(ffmpeg,["-v","error","-ss",String(time),"-i",output,"-frames:v","1","-vf","crop=16:16:152:82,scale=1:1","-pix_fmt","rgb24","-f","rawvideo",pixel]);
   const rgb=await readFile(pixel);expect(rgb[channel!]!).toBeGreaterThan(rgb[channel===0?2:0]!*2);
  }
  const pcm=join(root,"audio.pcm");await promisify(execFile)(ffmpeg,["-v","error","-i",output,"-vn","-ac","1","-ar","8000","-f","f32le",pcm]);const bytes=await readFile(pcm),samples=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
  // SEMANTIC_BOUNDARY_ALLOW: 数字频率仅核验声音片段来自冻结源区间，不解释语音或选择内容。
  const energy=(frequency:number,startSec:number)=>{let real=0,imaginary=0;for(let i=Math.round(startSec*8000);i<Math.round((startSec+.15)*8000)&&i<samples.length;i++){real+=samples[i]!*Math.cos(2*Math.PI*frequency*i/8000);imaginary+=samples[i]!*Math.sin(2*Math.PI*frequency*i/8000);}return real*real+imaginary*imaginary;};
  expect(energy(880,.15)).toBeGreaterThan(energy(440,.15)*5);expect(energy(440,.65)).toBeGreaterThan(energy(880,.65)*5);expect(energy(880,1.15)).toBeGreaterThan(energy(440,1.15)*5);
  const evidence=resolve("../docs/research/evidence/t850");await mkdir(evidence,{recursive:true});await copyFile(output,join(evidence,"rough-actual-order-repeat.mp4"));await import("node:fs/promises").then(fs=>fs.writeFile(join(evidence,"rough-actual-render-steps.json"),JSON.stringify({probe,steps,mappings:compiled.mappings},null,2)));
 }finally{await rm(root,{recursive:true,force:true});}
},180000);
