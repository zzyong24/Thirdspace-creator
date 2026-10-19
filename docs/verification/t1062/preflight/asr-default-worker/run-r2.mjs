import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import childProcess from 'node:child_process';
import {createDefaultWhisperLocalAdapter,resolveWhisperWorkerRuntime} from '/Users/zyongzhu/.codex/worktrees/t1062-migration-convergence/Thirdspace-creator/ai-worker/src/runtime/multimodal-whisper-local.ts';
import {assetAsrProviderTiming} from '/Users/zyongzhu/.codex/worktrees/t1062-migration-convergence/Thirdspace-creator/contract/src/internal/asset-asr-timing.ts';
const dir='/tmp/t1062-default-worker-preflight',output=path.join(dir,'run-two'),manifestPath=path.join(dir,'prepared-manifest-r2.json');
const sha=b=>createHash('sha256').update(b).digest('hex');
const fileSHA=async file=>{const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');};
function must(ok,message){if(!ok)throw new Error('Unknown: '+message);}
let manifest,networkAttempts=0,decodeCalls=0,decodeBytes=0;
const report={schema:'t1062-actual-default-worker-result/v1',harnessRevision:'r2-canonical-path-identity',status:'unknown',assembly:'createDefaultWhisperLocalAdapter() without deps; native ffmpeg + real default eval worker',execPath:process.execPath,runtimeVersion:process.version,buildTarget:'node24',publicReserveSettleVerified:false,installedAppVerified:false};
async function checkFrozen(){
 const r=manifest.registry,snapshot={inputSHA256:await fileSHA(path.join(manifest.registry.originDirectory,'audio.wav')),sourceMovSHA256:await fileSHA(path.join(manifest.registry.originDirectory,'source.mov')),models:[],sources:[]};
 must(await fileSHA(path.join(r.originDirectory,'audio.wav'))===r.wavSHA256,'same input WAV SHA changed');
 must(await fileSHA(path.join(r.originDirectory,'source.mov'))===r.sourceMovSHA256,'same original source MOV SHA changed');
 for(const f of r.modelFiles){const sourceSHA256=await fileSHA(path.join(r.originDirectory,f.path)),independentCacheSHA256=await fileSHA(path.join(manifest.cacheRoot,f.path));must(sourceSHA256===f.sha256,'source model SHA changed: '+f.path);must(independentCacheSHA256===f.sha256,'independent model cache SHA changed: '+f.path);snapshot.models.push({path:f.path,sourceSHA256,independentCacheSHA256});}
 for(const f of manifest.sourceFiles){const sha256=await fileSHA(path.join(r.sourceRoot,f.path));must(sha256===f.sha256,'reviewed source SHA changed: '+f.path);snapshot.sources.push({path:f.path,sha256});}return snapshot;
}
async function main(){
 must(process.execPath===await fs.realpath('/opt/homebrew/bin/node')&&process.version==='v25.9.0','actual project Node25 runtime required');
 const bytes=await fs.readFile(manifestPath);must(process.argv[2]===sha(bytes),'ROOT-reviewed prepared manifest SHA required');manifest=JSON.parse(bytes);
 report.beforeSHA=await checkFrozen();report.sourceAndCacheBeforeUnchanged=true;report.preparedManifestSHA256=sha(bytes);report.sourceFiles=manifest.sourceFiles;
 await fs.writeFile(path.join(output,'one-attempt.lock'),new Date().toISOString(),{flag:'wx'});
 globalThis.fetch=async()=>{networkAttempts++;throw new Error('T1062 parent network denied');};
 // Count native spawn/bytes only; no injected adapter deps and no child output mutation.
 const originalSpawn=childProcess.spawn;
 childProcess.spawn=function(command,args,...rest){
  must(++decodeCalls===1,'one native decode only');report.nativeDecoder={command,args:[...args]};
  const child=originalSpawn.call(this,command,args,...rest);
  child.stdout.on('data',bytes=>{decodeBytes+=bytes.byteLength;});
  return child;
 };
 process.env.T1062_DEFAULT_MANIFEST=manifestPath;process.env.T1062_DEFAULT_OUTPUT=output;process.env.CREATOROS_WHISPER_CACHE_DIR=manifest.cacheRoot;
 process.chdir(manifest.cwd);
 const runtime=resolveWhisperWorkerRuntime();report.actualRuntime=runtime;
 must(await fs.realpath(runtime.moduleResolverPath)===await fs.realpath(path.join(manifest.cwd,'creatoros-module-resolver.cjs')),'default resolver bootstrap identity mismatch');
 must(await fs.realpath(runtime.requireBase)===await fs.realpath(path.join(manifest.cwd,'package.json')),'default resolver requireBase identity mismatch');
 must(await fs.realpath(runtime.runtimeRoot)===await fs.realpath(path.resolve(manifest.cwd,'..')),'default resolver runtimeRoot identity mismatch');
 const input=await fs.readFile(path.join(manifest.registry.originDirectory,'audio.wav'));
 const adapter=createDefaultWhisperLocalAdapter();
 const result=await adapter.transcribeAudio({provider:'whisper-local',model:'small',baseUrl:null,kind:'audio',token:''},{audioBytes:input,language:'zh',timestampMode:'word',timingAudio:{sampleRate:16000,validSampleCount:manifest.registry.validSampleCount},signal:AbortSignal.timeout(15*60*1000)});
 report.actualAdapterOutput=result;report.strictTiming=!!result.timing&&assetAsrProviderTiming.safeParse(result.timing).success;
 report.worker=JSON.parse(await fs.readFile(path.join(output,'worker-counts.json'),'utf8'));
 report.decodeCalls=decodeCalls;report.actualDecodedSampleCount=decodeBytes/4;report.parentNetworkAttempts=networkAttempts;
 report.afterSHA=await checkFrozen();report.sourceAndCacheAfterUnchanged=true;
 must(decodeCalls===1&&decodeBytes===manifest.registry.validSampleCount*4,'native decode differs from fixed original sample count');
 must(report.worker.factoryCalls===1&&report.worker.pipelineCalls===1&&report.worker.modelCalls===1,'actual default worker bounded call count mismatch');
 must(networkAttempts===0&&report.worker.networkAttempts===0,'network attempted');
 must(report.worker.actualPcmSampleCount===manifest.registry.validSampleCount,'worker PCM input count differs');
 must(report.strictTiming,'default adapter actual strict word timing unavailable');
 report.rangeCount=result.timing.ranges.length;report.lastRange=result.timing.ranges.at(-1);
 report.text=result.text;report.status='default_factory_word_timing_verified';
 await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({status:report.status,runtimeVersion:process.version,execPath:process.execPath,buildTarget:report.buildTarget,actualRuntime:runtime,worker:report.worker,strictTiming:report.strictTiming,rangeCount:report.rangeCount,lastRange:report.lastRange,decodedSampleCount:report.actualDecodedSampleCount,sourceAndCacheAfterUnchanged:true,text:result.text}));
}
const timer=setTimeout(()=>{console.error('Unknown: actual default worker exceeded 16min; no retry permitted');process.exit(124);},16*60*1000);timer.unref();
main().then(()=>process.exit(0)).catch(async error=>{
 report.error=String(error);report.parentNetworkAttempts=networkAttempts;report.decodeCalls=decodeCalls;report.actualDecodedSampleCount=decodeBytes/4;
 if(manifest){try{report.afterSHA=await checkFrozen();report.sourceAndCacheAfterUnchanged=true;}catch(e){report.afterSHAError=String(e);}try{report.worker=JSON.parse(await fs.readFile(path.join(output,'worker-counts.json'),'utf8'));}catch{}}
 await fs.writeFile(path.join(output,'unknown.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'}).catch(()=>{});console.error(error);process.exit(1);
});
