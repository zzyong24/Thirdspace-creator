import fs from 'node:fs/promises';
import {openSync,writeSync,closeSync} from 'node:fs';
import {constants} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createWhisperLocalAdapter,createDefaultPipelineProvider} from '/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/ai-worker/src/runtime/multimodal-whisper-local.ts';
import {must,sha,fileSHA,checkOriginal,readNativePcmWav,deriveStride,denyNetwork} from './common.mjs';
const planDir='/tmp/t1062-asr-timing-observation';
const output=path.resolve(process.argv[2]??path.join(planDir,'capture-one'));
let fd,bytes=0,pipelineCalls=0,generateCalls=0,extractCalls=0,forwardCalls=0;
const metadata={schema:'t1062-asr-real-attention-capture/v1',status:'pending',assembly:'direct actual adapter/pipeline instrumentation; not packaged worker',decodeCalls:0,modelGenerationCalls:0};
async function main(){
 must(output.startsWith('/tmp/')&&!output.includes('asr-alternate-preflight'),'capture output must be fresh /tmp scope');
 const registry=JSON.parse(await fs.readFile(path.join(planDir,'registry.json'),'utf8'));
 await checkOriginal(registry);await fs.mkdir(output,{recursive:true});
 // One attempt forever for this capture; a failed run is not retried by this script.
 await fs.writeFile(path.join(output,'one-attempt.lock'),new Date().toISOString(),{flag:'wx'});
 const networkAttempts=denyNetwork();
 const input=await fs.readFile(path.join(registry.originDirectory,'audio.wav'));
 must(sha(input)===registry.wavSHA256,'WAV changed');
 const {pcm,witness}=readNativePcmWav(input,registry);metadata.pcmWitness=witness;metadata.validSampleCount=pcm.length;
 const cache=path.join(output,'cache');
 for(const f of registry.modelFiles){const target=path.join(cache,f.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(registry.originDirectory,f.path),target,constants.COPYFILE_EXCL);must(await fileSHA(target)===f.sha256,'independent model cache copy mismatch');}
 metadata.registry=registry;metadata.modelCacheRoot=cache;
 const transformerFile=path.join(registry.sourceRoot,'ai-worker/node_modules/@xenova/transformers/src/transformers.js');
 const {env}=await import(pathToFileURL(transformerFile).href);
 env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath=cache+'/';env.useBrowserCache=false;env.useFSCache=false;
 process.env.CREATOROS_WHISPER_CACHE_DIR=cache;
 metadata.preprocessorConfig=JSON.parse(await fs.readFile(path.join(cache,'Xenova/whisper-small/preprocessor_config.json'),'utf8'));
 const packageJSON=JSON.parse(await fs.readFile(path.join(registry.sourceRoot,'ai-worker/node_modules/@xenova/transformers/package.json'),'utf8'));
 must(packageJSON.version==='2.17.2','dependency version drift');metadata.dependencyVersion=packageJSON.version;
 fd=openSync(path.join(output,'capture.bin'),'wx');
 function saveTensor(t,label){
  must(t?.type==='float32'&&t.data instanceof Float32Array&&Array.isArray(t.dims),'unsupported original tensor dtype/shape: '+label);
  must(t.dims.every(x=>Number.isInteger(x)&&x>0)&&t.dims.reduce((a,b)=>a*b,1)===t.data.length,'tensor data/shape mismatch');
  const n=t.data.byteLength;must(bytes+n<=registry.maxCaptureBytes,'128MiB capture cap exceeded');
  const ref={tensor:true,type:t.type,dims:[...t.dims],offset:bytes,byteLength:n,label};
  const buffer=Buffer.from(t.data.buffer,t.data.byteOffset,n);let written=0;while(written<n)written+=writeSync(fd,buffer,written,n-written,bytes+written);bytes+=n;return ref;
 }
 function saveOutputs(outputs){
  const expected=['cross_attentions','decoder_attentions','sequences'];must(Object.keys(outputs).every(k=>expected.includes(k)),'unknown generate output keys');
  must(Array.isArray(outputs.sequences)&&outputs.sequences.length===1&&outputs.sequences[0].length<=registry.maxTokens,'single batch bounded decoder sequence required');
  must(outputs.sequences[0].every(Number.isSafeInteger),'decoder sequence must retain original integer tokens');
  const serializeGroup=(group,label)=>{
   must(Array.isArray(group)&&group.length===1,'single attention batch required');
   return group.map((batch,b)=>{must(batch.length>0&&batch.length<=registry.maxTokens,'bounded actual token steps required');return batch.map((layers,s)=>{must(layers.length===metadata.modelConfig.decoder_layers,'actual decoder layer count mismatch');return layers.map((t,l)=>{
    must(t.dims.length===4&&t.dims[0]===1&&t.dims[1]===metadata.modelConfig.decoder_attention_heads,'actual original layer/head layout mismatch');
    if(label==='cross_attentions'){must(t.dims[3]<=registry.maxSourceFrames,'attention source dim cap exceeded');if(!metadata.attentionDims)metadata.attentionDims=[...t.dims];must(t.dims[3]===metadata.attentionDims[3],'cross attention source dims changed');}
    return saveTensor(t,`${label}.${b}.${s}.${l}`);
   });});});
  };
  return {sequences:JSON.parse(JSON.stringify(outputs.sequences)),cross_attentions:serializeGroup(outputs.cross_attentions,'cross_attentions'),decoder_attentions:serializeGroup(outputs.decoder_attentions,'decoder_attentions')};
 }
 const get=createDefaultPipelineProvider();
 const adapter=createWhisperLocalAdapter({
  // Native WAV already proves exact int16 PCM. Mechanical int16/32768 conversion only;
  // no subprocess/ffmpeg decoding, resampling, trim or input padding is introduced.
  decodeAudioToFloat32:async(audio)=>{must(sha(audio)===registry.wavSHA256,'adapter input drift');return pcm;},
  getPipeline:async(id)=>{
   must(id==='Xenova/whisper-small','model selection drift');const pipeline=await get(id);
   const model=pipeline.model;
   must(model&&typeof model.generate==='function'&&typeof model.forward==='function'&&typeof model._extract_token_timestamps==='function','actual instrumentation APIs unavailable');
   metadata.modelConfig=JSON.parse(JSON.stringify(model.config));metadata.originalGenerationConfig=JSON.parse(JSON.stringify(model.generation_config));
   const originalGenerate=model.generate,originalForward=model.forward,originalExtract=model._extract_token_timestamps;
   metadata.originalExtractFunctionSHA256=sha(originalExtract.toString());
   model.generate=async function(inputs,options,...rest){must(++generateCalls===1,'one model.generate only');metadata.featureDims=[...inputs.dims];metadata.generateOptions=JSON.parse(JSON.stringify(options));return originalGenerate.call(this,inputs,options,...rest);};
   model.forward=async function(inputs){const result=await originalForward.call(this,inputs);forwardCalls++;must(result.encoder_outputs?.dims,'actual encoder outputs not observable');if(!metadata.encoderDims)metadata.encoderDims=[...result.encoder_outputs.dims];must(JSON.stringify(result.encoder_outputs.dims)===JSON.stringify(metadata.encoderDims),'encoder output dims changed');return result;};
   model._extract_token_timestamps=function(outputs,heads,numFrames,timePrecision=0.02){
    must(++extractCalls===1,'one token extraction only');metadata.alignmentHeads=JSON.parse(JSON.stringify(heads));metadata.numFrames=numFrames;metadata.timePrecision=timePrecision;
    must(JSON.stringify(heads)===JSON.stringify(metadata.originalGenerationConfig.alignment_heads),'actual alignment heads differ from config');
    metadata.generateOutputs=saveOutputs(outputs);metadata.strideWitness=deriveStride(metadata);
    const timestamps=originalExtract.call(this,outputs,heads,numFrames,timePrecision);
    metadata.originalTokenTimestamps=saveTensor(timestamps,'original-token-timestamps');return timestamps;
   };
   return async(audio,options,signal)=>{must(++pipelineCalls===1,'one pipeline invocation only');metadata.pipelineOptionsBefore=JSON.parse(JSON.stringify(options));const raw=await pipeline(audio,options,signal);metadata.pipelineOptionsAfter=JSON.parse(JSON.stringify(options));metadata.rawProviderOutput=raw;return raw;};
  }
 });
 const result=await adapter.transcribeAudio({provider:'whisper-local',model:'small',baseUrl:null,kind:'audio',token:''},{audioBytes:input,language:'zh',timestampMode:'word',timingAudio:{sampleRate:16000,validSampleCount:registry.validSampleCount}});
 must(pipelineCalls===1&&generateCalls===1&&extractCalls===1,'instrumentation count invalid');
 metadata.actualDriverResult=result;metadata.rawProviderOutputSHA256=sha(JSON.stringify(metadata.rawProviderOutput));metadata.forwardCalls=forwardCalls;metadata.modelGenerationCalls=generateCalls;metadata.pipelineCalls=pipelineCalls;metadata.captureBytes=bytes;metadata.networkAttempts=networkAttempts();must(metadata.networkAttempts===0,'network attempted');
 closeSync(fd);fd=undefined;metadata.captureSHA256=await fileSHA(path.join(output,'capture.bin'));
 await checkOriginal(registry);for(const f of registry.modelFiles)must(await fileSHA(path.join(cache,f.path))===f.sha256,'independent cache changed after inference');
 metadata.sourceAndCacheUnchanged=true;metadata.status='captured_once';await fs.writeFile(path.join(output,'capture.json'),JSON.stringify(metadata,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({status:metadata.status,output,modelGenerationCalls:generateCalls,captureBytes:bytes,featureDims:metadata.featureDims,encoderDims:metadata.encoderDims,attentionDims:metadata.attentionDims,strideWitness:metadata.strideWitness,verifiedDriverTiming:!!result.timing,networkAttempts:0}));
}
const timer=setTimeout(()=>{console.error('Unknown: bounded observation exceeded 15min; no retry authorized');process.exit(124);},15*60*1000);timer.unref();
main().then(()=>process.exit(0)).catch(async error=>{if(fd!==undefined)closeSync(fd);metadata.status='unknown';metadata.error=String(error);metadata.captureBytes=bytes;metadata.modelGenerationCalls=generateCalls;await fs.writeFile(path.join(output,'unknown.json'),JSON.stringify(metadata,null,2)+'\n',{flag:'wx'}).catch(()=>{});console.error(error);process.exit(1);});
