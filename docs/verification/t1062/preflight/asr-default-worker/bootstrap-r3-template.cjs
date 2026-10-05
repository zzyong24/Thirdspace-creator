// Temporary runtime bootstrap only. Actual transformers entry/model are preserved.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),{createRequire}=require('node:module');
const manifest=JSON.parse(fs.readFileSync(process.env.T1062_DEFAULT_MANIFEST,'utf8'));
const output=process.env.T1062_DEFAULT_OUTPUT;
let factoryCalls=0,pipelineCalls=0,modelCalls=0,networkAttempts=0;
const metrics={assembly:'actual default eval worker; temporary module-resolver bootstrap',factoryCalls:0,pipelineCalls:0,modelCalls:0,networkAttempts:0};
function save(){fs.writeFileSync(path.join(output,'worker-counts.json'),JSON.stringify({...metrics,factoryCalls,pipelineCalls,modelCalls,networkAttempts},null,2)+'\n');}
globalThis.fetch=async()=>{networkAttempts++;save();throw new Error('T1062 worker network denied');};
const req=createRequire(manifest.registry.sourceRoot+'/ai-worker/package.json');
const actualEntry=req.resolve('@xenova/transformers');
const real=req(actualEntry); // Actual dependency entry; no model/pipeline/session yet.
real.env.allowRemoteModels=false;real.env.allowLocalModels=true;real.env.localModelPath=manifest.cacheRoot+'/';real.env.useFSCache=false;real.env.useBrowserCache=false;
metrics.actualDependencyEntry=actualEntry;metrics.runtimeVersion=process.version;metrics.env={allowRemoteModels:real.env.allowRemoteModels,allowLocalModels:real.env.allowLocalModels,localModelPath:real.env.localModelPath,useFSCache:real.env.useFSCache};save();
const originalLoad=Module._load;
const wrapped={...real,pipeline:async function(...args){
 if(++factoryCalls!==1)throw new Error('T1062 bounded factory count exceeded');save();
 const pipe=await real.pipeline.apply(this,args);
 const generate=pipe.model.generate;
 pipe.model.generate=async function(...parameters){if(++modelCalls!==1)throw new Error('T1062 bounded model count exceeded');save();return generate.apply(this,parameters);};
 return new Proxy(pipe,{apply(target,thisArg,parameters){
  if(++pipelineCalls!==1)throw new Error('T1062 bounded pipeline count exceeded');
  metrics.actualPcmSampleCount=parameters[0]?.length;metrics.optionsBefore=JSON.parse(JSON.stringify(parameters[1]));save();
  const preserveFailure=error=>{
   try{metrics.actualPipelineError={name:error?.name??null,message:error?.message??String(error),stack:error?.stack??null};save();
    fs.writeFileSync(path.join(output,'pipeline-error.json'),JSON.stringify(metrics.actualPipelineError,null,2)+'\n');
   }finally{throw error;} // Same original error object; do not substitute product/output/timing.
  };
  try{return Promise.resolve(Reflect.apply(target,thisArg,parameters)).catch(preserveFailure);}catch(error){return preserveFailure(error);}
 }});
}};
Module._load=function(request,parent,isMain){return request==='@xenova/transformers'?wrapped:originalLoad.apply(this,arguments);};
