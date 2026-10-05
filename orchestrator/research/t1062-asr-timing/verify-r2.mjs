import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readActualProviderTiming} from '/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/ai-worker/src/runtime/asr-provider-timing.ts';
import {must,sha,fileSHA,checkOriginal,readNativePcmWav,deriveStride,denyNetwork} from './common.mjs';
// Zero writes: no model loading/session/generate/pipeline/decoder. Only immutable capture
// hashes, original tensors + original DTW/tokenizer code, actual public timing parser.
async function main(){
 const mode=process.argv[2],dir=path.resolve(process.argv[3]??'/tmp/t1062-asr-timing-observation/capture-one');must(['evidence','timing'].includes(mode),'mode evidence|timing required');
 const metadata=JSON.parse(await fs.readFile(path.join(dir,'capture.json'),'utf8')),r=metadata.registry;must(metadata.status==='captured_once'&&metadata.modelGenerationCalls===1&&metadata.pipelineCalls===1&&metadata.networkAttempts===0,'bounded capture receipt invalid');
 await checkOriginal(r);for(const f of r.modelFiles)must(await fileSHA(path.join(metadata.modelCacheRoot,f.path))===f.sha256,'captured independent model files drift');
 const input=await fs.readFile(path.join(r.originDirectory,'audio.wav'));const native=readNativePcmWav(input,r);must(JSON.stringify(native.witness)===JSON.stringify(metadata.pcmWitness),'same PCM witness mismatch');
 const stat=await fs.stat(path.join(dir,'capture.bin'));must(stat.size===metadata.captureBytes&&stat.size<=r.maxCaptureBytes,'capture byte limit/length invalid');must(await fileSHA(path.join(dir,'capture.bin'))===metadata.captureSHA256,'capture bytes drift');
 const bytes=await fs.readFile(path.join(dir,'capture.bin'));const networkAttempts=denyNetwork();
 const base=path.join(r.sourceRoot,'ai-worker/node_modules/@xenova/transformers/src');
 // Standard package initialization first: internal ESM entrypoints have a circular
 // models/pipelines registry dependency. No pipeline/session/generate is constructed.
 await import(pathToFileURL(path.join(base,'transformers.js')).href);
 const {WhisperForConditionalGeneration}=await import(pathToFileURL(path.join(base,'models.js')).href);
 const {Tensor}=await import(pathToFileURL(path.join(base,'utils/tensor.js')).href);
 const {WhisperTokenizer}=await import(pathToFileURL(path.join(base,'tokenizers.js')).href);
 const {round}=await import(pathToFileURL(path.join(base,'utils/maths.js')).href);
 const extract=WhisperForConditionalGeneration.prototype._extract_token_timestamps;must(sha(extract.toString())===metadata.originalExtractFunctionSHA256,'original DTW function identity changed');
 function restore(ref){must(ref?.tensor&&ref.type==='float32'&&ref.offset>=0&&ref.byteLength>0&&ref.offset+ref.byteLength<=bytes.length&&ref.byteLength%4===0,'tensor reference invalid');must(ref.dims.reduce((a,b)=>a*b,1)*4===ref.byteLength,'tensor original shape/bytes invalid');const copy=bytes.subarray(ref.offset,ref.offset+ref.byteLength).slice();return new Tensor(ref.type,new Float32Array(copy.buffer,copy.byteOffset,copy.byteLength/4),ref.dims);}
 const group=refs=>refs.map(batch=>batch.map(layers=>layers.map(restore)));
 const outputs={sequences:metadata.generateOutputs.sequences,cross_attentions:group(metadata.generateOutputs.cross_attentions),decoder_attentions:group(metadata.generateOutputs.decoder_attentions)};
 must(outputs.sequences.length===1&&outputs.sequences[0].length<=r.maxTokens,'sequence bounds invalid');
 const context={config:metadata.modelConfig};const original=restore(metadata.originalTokenTimestamps);
 const legacy=extract.call(context,outputs,metadata.alignmentHeads,metadata.numFrames,metadata.timePrecision);
 const binary=t=>Buffer.from(t.data.buffer,t.data.byteOffset,t.data.byteLength);
 must(JSON.stringify(legacy.dims)===JSON.stringify(original.dims)&&binary(legacy).equals(binary(original)),'legacy reconstruction not byte-equal to captured original timestamps');
 const tokenizer=new WhisperTokenizer(JSON.parse(await fs.readFile(path.join(metadata.modelCacheRoot,'Xenova/whisper-small/tokenizer.json'),'utf8')),JSON.parse(await fs.readFile(path.join(metadata.modelCacheRoot,'Xenova/whisper-small/tokenizer_config.json'),'utf8')));
 function decoded(ts){const [text,optional]=tokenizer._decode_asr([{stride:[r.validSampleCount/r.sampleRate,0,0],tokens:outputs.sequences[0],token_timestamps:ts.tolist()[0].map(x=>round(x,2))}],{time_precision:metadata.timePrecision,return_timestamps:'word',force_full_sequences:false});return {text,...optional};}
 const rawLegacy=decoded(legacy);must(JSON.stringify(rawLegacy)===JSON.stringify(metadata.rawProviderOutput),'same original tokenizer replay differs from actual pipeline raw');
 const stride=deriveStride(metadata);const corrected=extract.call(context,outputs,metadata.alignmentHeads,stride.actualStrideCrop,metadata.timePrecision),rawCorrected=decoded(corrected);
 must(rawCorrected.text===rawLegacy.text,'same sequences changed transcript text');
 const timing=raw=>readActualProviderTiming({rawResponse:JSON.stringify(raw),response:raw,audioBytes:input,granularity:'word',sampleRate:r.sampleRate,validSampleCount:r.validSampleCount,local:true});
 const oldTiming=timing(rawLegacy),newTiming=timing(rawCorrected);
 must(JSON.stringify(oldTiming??undefined)===JSON.stringify(metadata.actualDriverResult.timing),'legacy driver timing replay mismatch');
 must(networkAttempts()===0,'offline verifier attempted network');
 if(mode==='timing')must(newTiming!==null,'actual-stride crop still lacks strict same-source timing; retain Unknown/negative');
 console.log(JSON.stringify({criterion:mode,status:'verified',writes:0,modelCalls:0,decodeCalls:0,networkAttempts:0,legacyTokenTimestampsByteEqual:true,legacyProviderOutputExactEqual:true,sameTextPreserved:true,strideWitness:stride,legacyTimingAccepted:!!oldTiming,actualStrideTimingAccepted:!!newTiming,originalUnitsUnchanged:true,noFinalTimestampClamp:true,ranges:newTiming?.ranges??null}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
