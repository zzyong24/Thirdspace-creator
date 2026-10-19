import {createWorkerSupervisor} from '../../../../backend/src/modules/execution/worker-supervisor.ts';
const weak=[],listeners=new Map();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const checkpoint=n=>new Promise(resolve=>listeners.set(n,resolve));
async function sample(label){
 for(let i=0;i<4;i++){global.gc();await delay(10);}
 const memory=process.memoryUsage();
 const alive=weak.filter(ref=>ref.deref()).length;
 console.log(JSON.stringify({label,returnedBuffers:weak.length,liveBuffers:alive,retainedMiB:alive*0.5,heapMiB:+(memory.heapUsed/1024/1024).toFixed(2),externalMiB:+(memory.external/1024/1024).toFixed(2),rssMiB:+(memory.rss/1024/1024).toFixed(2)}));
}
const supervisor=createWorkerSupervisor({entryPath:new URL('./fixture.cjs',import.meta.url).pathname,ports:{async validate(){},async invoke(_execution,port){if(port!=='readTranscribeAudio')throw Error('unexpected port');const bytes=Buffer.alloc(512*1024,weak.length%256);weak.push(new WeakRef(bytes));return{status:'ready',bytes,audioDigest:'synthetic',audioByteLength:bytes.byteLength};}},onText:(_execution,text)=>listeners.get(Number(text))?.()});
const ref={executionTaskId:'synthetic-resource-audit',attempt:1,fenceToken:'synthetic-only'};
await sample('baseline');
const phases=[25,50,75,100].map(checkpoint);
const run=supervisor.run(ref,null);
try{
 for(let i=0;i<phases.length;i++){await phases[i];await sample(`running-${(i+1)*25}`);}
 supervisor.cancel(ref);
 console.log(JSON.stringify({runOutcome:await run}));
 await sample('after-stopped-clearRun');
}finally{await supervisor.stop();}
await sample('after-supervisor-stop');
