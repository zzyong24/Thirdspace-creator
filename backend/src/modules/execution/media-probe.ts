import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {z} from "zod";
import type {ExecutionExecutor} from "./executor-registry";
import {createDefaultVideoRenderEngine} from "./video-render/executor";
import {buildChildEnv} from "./child-env";
import {resolveInsideDir} from "./sandbox";
const paramsSchema=z.object({file:z.string().min(1)}).strict();
// SEMANTIC_BOUNDARY_ALLOW: 只读取原文件真实流、timebase及字节身份，不判断素材内容或删留。
export function createMediaProbeExecutor():ExecutionExecutor {
 return {taskType:"media.probe",networkPosture:"none",paramsSchema,async run(sandbox,params,opts){
  const {file}=paramsSchema.parse({file:params.file}),input=sandbox.inputs.find(i=>i.mountAs===file);
  if(!input)throw Error("探针原文件未物化");
  const ffprobe=await createDefaultVideoRenderEngine().findBinary("ffprobe");if(!ffprobe)throw Error("未找到 ffprobe，原片已保留，请安装媒体工具后重试");
  const path=resolveInsideDir(sandbox.inputDir,file);
  const {stdout}=await promisify(execFile)(ffprobe,["-v","error","-show_streams","-show_format","-of","json",path],{signal:opts.signal,env:buildChildEnv(),windowsHide:true,maxBuffer:2*1024*1024});
  const parsed=JSON.parse(stdout) as {streams?:Array<{codec_type?:string;time_base?:string;duration_ts?:number;duration?:string}>;format?:{duration?:string}};
  const video=parsed.streams?.find(s=>s.codec_type==="video");if(!video)throw Error("原片没有可用视频流");
  const parts=video.time_base?.split("/").map(Number),validBase=parts?.length===2&&parts.every(v=>Number.isSafeInteger(v)&&v>0);
  const realTicks=Number(video.duration_ts),seconds=Number(video.duration??parsed.format?.duration);
  const timebase=validBase&&Number.isSafeInteger(realTicks)&&realTicks>0?{num:parts![0]!,den:parts![1]!}:{num:1,den:1000000};
  const durationTicks=validBase&&Number.isSafeInteger(realTicks)&&realTicks>0?realTicks:Math.floor(seconds*1000000);
  if(!Number.isSafeInteger(durationTicks)||durationTicks<=0)throw Error("无法读取原片真实时长");
  const hash=createHash("sha256");for await(const chunk of createReadStream(path))hash.update(chunk);
  const probe={timebase,durationTicks,hasAudio:parsed.streams?.some(s=>s.codec_type==="audio")??false,fileDigest:hash.digest("hex")};
  const probeDigest=createHash("sha256").update(JSON.stringify(probe)).digest("hex");
  await opts.reportStep("已核验原始媒体文件、时长和音频流");
  return {summary:"原片探针完成，等待采用为剪辑来源",meta:{probe:{...probe,probeDigest}}};
 }};
}
