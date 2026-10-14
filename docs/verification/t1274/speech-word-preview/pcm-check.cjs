// 复核已落盘的真实 PCM；只比较波形时移，不做语义/创作或听感判断。
const fs=require('node:fs'),path=require('node:path');
const load=n=>{const b=fs.readFileSync(path.join(__dirname,n+'.pcm'));return new Float32Array(b.buffer,b.byteOffset,b.length/4);};
const source=load('source'),candidate=load('candidate'),start=3200,count=32000;
const scoreAt=(offset,stride)=>{let dot=0,aa=0,bb=0;for(let t=start;t<start+count;t+=stride){const a=candidate[t],b=source[t+offset];dot+=a*b;aa+=a*a;bb+=b*b;}return dot/Math.sqrt(aa*bb);};
let best={score:-1,offset:0};for(let offset=-1600;offset<=12800;offset+=8){const score=scoreAt(offset,8);if(score>best.score)best={score,offset};}const coarse=best.offset;for(let offset=coarse-8;offset<=coarse+8;offset++){const score=scoreAt(offset,1);if(score>best.score)best={score,offset};}
console.log({correlation:best.score,matchedSourceMinusOutputSec:best.offset/16000,observedLeadingDelaySec:0.36-best.offset/16000});
