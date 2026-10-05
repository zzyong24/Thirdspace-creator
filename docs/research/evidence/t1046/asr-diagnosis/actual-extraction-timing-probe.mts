import {readFile,writeFile} from "node:fs/promises";
import {extractProductionAsrAudio} from "../backend/src/modules/production/production-asset-asr-media";
import {verifyPcmMapping} from "../backend/src/modules/production/production-asr-timing";
import {createFfmpegPcmDecoder} from "../ai-worker/src/runtime/multimodal-whisper-local";
import {readActualProviderTiming} from "../ai-worker/src/runtime/asr-provider-timing";
async function main(){
 process.chdir("/tmp/t1046-backend-work/frontend");
 const source=(JSON.parse(await readFile("/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/docs/research/evidence/t1046/ui/real-native-source-proof.json","utf8")) as any[]).find(s=>s.source.sourceId.startsWith("source-2ebb")).source;
 const bytes=await readFile("/tmp/t1046-live/media/rough-verified-pcm.mov"),extracted=await extractProductionAsrAudio(bytes,{source,timestampMode:"word"} as any);
 await writeFile("/tmp/t1046-backend-work/evidence/actual-extraction-evidence.json",JSON.stringify(extracted.evidence,null,2));
 const pcm=await createFfmpegPcmDecoder()(extracted.bytes),captured=JSON.parse(await readFile("/tmp/t1046-backend-work/evidence/actual-whisper-word-chunks.json","utf8"));
 const full=readActualProviderTiming({rawResponse:JSON.stringify(captured.result),response:captured.result,audioBytes:extracted.bytes,granularity:"word",sampleRate:16000,validSampleCount:pcm.length,local:true});
 console.log(JSON.stringify({mappingStatus:extracted.evidence.mappingStatus,reason:extracted.evidence.reason,outputValidSampleCount:extracted.evidence.mappingStatus==="verified"?extracted.evidence.mappingReceipt.outputValidSampleCount:null,actualDecodedPcmCount:pcm.length,verified:extracted.evidence.mappingStatus==="verified"?!!verifyPcmMapping(extracted.evidence.mappingReceipt,source):false,timing:full,lastUnit:captured.result.chunks.at(-1),audioDigest:extracted.evidence.audioDigest}));
}
void main().catch(error=>{console.log(JSON.stringify({name:error.name,message:error.message,stack:error.stack}));process.exitCode=1;}).finally(()=>process.exit(process.exitCode??0));
