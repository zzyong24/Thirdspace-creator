import {it,expect,vi} from "vitest";
import {runAssetInWorker} from "./asset-worker-run";
const input={kind:"asset.generate" as const,mediaKind:"image" as const,capability:"image.generate" as const,operationKey:"original",prompt:"画面",provider:"openai",model:"image",baseUrl:null};
const receipt={assetId:"asset",fileId:"file",assetType:"image",name:"原图",checksum:"sum",byteLength:3,committedAt:"now"};
it("原结果恢复优先于凭据和供应商调用",async()=>{
 const ports:string[]=[],generate=vi.fn();
 const result=await runAssetInWorker(input,new AbortController().signal,async(port)=>{ports.push(port);if(port==="reserveAssetCall")return {callId:"call",status:"settled"};if(port==="recoverAssetResult")return {status:"committed",receipt};throw new Error("不可调用");},generate);
 expect(result).toEqual({callId:"call",text:JSON.stringify(receipt)});expect(ports).toEqual(["reserveAssetCall","recoverAssetResult"]);expect(generate).not.toHaveBeenCalled();
});
it("原调用启动后才生成字节，保存回执作为唯一结果",async()=>{
 const seen:string[]=[],bytes=new Uint8Array([0,255,1]);
 const result=await runAssetInWorker(input,new AbortController().signal,async(port,data)=>{seen.push(port);if(port==="reserveAssetCall")return {callId:"call",status:"reserved"};if(port==="resolveAssetCredential")return {provider:"openai",model:"image",baseUrl:null,kind:"image",token:"private"};if(port==="startAssetCall")return {callId:"call",status:"started"};if(port==="saveAssetResult"){expect(data).toEqual({callId:"call",bytes});return receipt;}throw new Error("unexpected");},async()=>{seen.push("generate");return {assetBytes:bytes};});
 expect(seen).toEqual(["reserveAssetCall","resolveAssetCredential","startAssetCall","generate","saveAssetResult"]);expect(result.text).toBe(JSON.stringify(receipt));
});
it("参考图按冻结版本在启动前读取，字节交给图片适配器",async()=>{
 const seen:string[]=[],refBytes=new Uint8Array([9,8,7]);
 const referenced={...input,mode:"image_to_image" as const,capability:"image.edit" as const,reference:{assetId:"reference",fileId:"version-1",checksum:"a".repeat(64),mimeType:"image/png"}};
 await runAssetInWorker(referenced,new AbortController().signal,async(port)=>{
  seen.push(port);
  if(port==="reserveAssetCall")return {callId:"call",status:"reserved"};
  if(port==="resolveAssetCredential")return {provider:"openai",model:"image",baseUrl:null,kind:"image",token:"secret"};
  if(port==="readAssetReference")return {bytes:refBytes,mimeType:"image/png"};
  if(port==="startAssetCall")return {callId:"call",status:"started"};
  if(port==="saveAssetResult")return receipt;
  throw Error("unexpected");
 },async(_input,_spec,_signal,options)=>{expect(options.referenceImage).toEqual({bytes:refBytes,mimeType:"image/png"});seen.push("generate");return {assetBytes:new Uint8Array([1,2,3])};});
 expect(seen.indexOf("readAssetReference")).toBeLessThan(seen.indexOf("startAssetCall"));
});
it("参考图不可读时不启动供应商，也不降级为文生图",async()=>{
 const seen:string[]=[],generate=vi.fn();
 const referenced={...input,mode:"image_to_image" as const,capability:"image.edit" as const,reference:{assetId:"reference",fileId:"version-1",checksum:"a".repeat(64),mimeType:"image/png"}};
 await expect(runAssetInWorker(referenced,new AbortController().signal,async(port)=>{
  seen.push(port);
  if(port==="reserveAssetCall")return {callId:"call",status:"reserved"};
  if(port==="resolveAssetCredential")return {provider:"openai",model:"image",baseUrl:null,kind:"image",token:"secret"};
  if(port==="readAssetReference")throw new Error("参考版本丢失");
  throw Error("unexpected");
 },generate)).rejects.toThrow("参考版本丢失");
 expect(seen).not.toContain("startAssetCall");expect(generate).not.toHaveBeenCalled();
});

it("凭据不可用保留原reserved，不启动或结算模型",async()=>{
 const seen:string[]=[];await expect(runAssetInWorker(input,new AbortController().signal,async port=>{seen.push(port);if(port==="reserveAssetCall")return {callId:"call",status:"reserved"};throw new Error("配置缺失");})).rejects.toMatchObject({outcome:"waiting_user"});
 expect(seen).toEqual(["reserveAssetCall","resolveAssetCredential"]);
});
it("无任务号且无原字节的旧调用不能重新提交",async()=>{
 const generate=vi.fn(),seen:string[]=[];
 await expect(runAssetInWorker(input,new AbortController().signal,async port=>{seen.push(port);if(port==="reserveAssetCall")return {callId:"call",status:"unknown"};if(port==="recoverAssetResult")return {status:"missing"};if(port==="readAssetProviderJob")return null;return {};},generate)).rejects.toMatchObject({outcome:"unknown_result"});expect(generate).not.toHaveBeenCalled();expect(seen).not.toContain("startAssetCall");
});
it("视频提交回执丢失不继续poll",async()=>{
 const video={...input,mediaKind:"video" as const,capability:"video.generate" as const,provider:"minimax"},seen:string[]=[];let polled=false;
 await expect(runAssetInWorker(video,new AbortController().signal,async port=>{seen.push(port);if(port==="reserveAssetCall")return {callId:"call",status:"reserved"};if(port==="resolveAssetCredential")return {provider:"minimax",model:"image",baseUrl:null,kind:"video",token:"secret"};if(port==="startAssetCall")return {callId:"call",status:"started"};if(port==="recordAssetProviderJob")throw new Error("回执丢失");return {};},async(_input,_spec,_signal,options)=>{await options.onJobSubmitted("original-job");polled=true;return {assetBytes:new Uint8Array([1])};})).rejects.toMatchObject({outcome:"unknown_result"});expect(polled).toBe(false);expect(seen.at(-1)).toBe("settleAssetCall");
});
it("恢复原job时只传原任务号，不重新启动调用",async()=>{
 const video={...input,mediaKind:"video" as const,capability:"video.generate" as const,provider:"minimax"},seen:string[]=[];
 const result=await runAssetInWorker(video,new AbortController().signal,async port=>{seen.push(port);if(port==="reserveAssetCall")return {callId:"call",status:"unknown"};if(port==="recoverAssetResult")return {status:"bytes_missing"};if(port==="readAssetProviderJob")return {schemaVersion:1,provider:"minimax",model:"image",baseUrl:null,jobId:"original-job"};if(port==="resolveAssetCredential")return {provider:"minimax",model:"image",baseUrl:null,kind:"video",token:"rotated"};if(port==="saveAssetResult")return {...receipt,assetType:"video"};throw Error("unexpected");},async(_input,_spec,_signal,options)=>{expect(options.resumeJobId).toBe("original-job");return {assetBytes:new Uint8Array([1])};});
 expect(result.callId).toBe("call");expect(seen).not.toContain("startAssetCall");
});
it.each([401,402,403,404,429,503])("原视频查询 HTTP %s 只对瞬态故障请求续查",async status=>{
 const video={...input,mediaKind:"video" as const,capability:"video.generate" as const,provider:"minimax"};
 const seen:string[]=[];
 const work=runAssetInWorker(video,new AbortController().signal,async(port,data)=>{seen.push(port);if(port==="reserveAssetCall")return {callId:"call",status:"unknown"};if(port==="recoverAssetResult")return {status:"missing"};if(port==="readAssetProviderJob")return {schemaVersion:1,provider:"minimax",model:"image",baseUrl:null,jobId:"original"};if(port==="resolveAssetCredential")return {provider:"minimax",model:"image",kind:"video",baseUrl:null,token:"secret"};if(port==="settleAssetCall"){expect(data).toEqual({callId:"call",status:"unknown"});return {};}throw new Error("unexpected");},async()=>{throw Object.assign(new Error("HTTP"),{stage:"poll",status,retryAfterMs:120000});});
 await expect(work).rejects.toMatchObject({outcome:"unknown_result",errorCode:[429,503].includes(status)?"ASSET_RECONCILE_RETRYABLE":"ASSET_RESULT_UNKNOWN",retryAfterMs:[429,503].includes(status)?120000:undefined});
 expect(seen).not.toContain("startAssetCall");
});
