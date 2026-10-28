import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const cwd='/Users/masx/Projects/Thirdspace-creator';
function stable(v){if(Array.isArray(v))return `[${v.map(stable).join(',')}]`;if(v&&typeof v==='object')return `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;return JSON.stringify(v);}
const result=[];
for(const ref of ['6033bdd51e6996cfe80eb041661a2b1a4f15a5b0','b1f0272412bd44612ba370b10127418a3ce77d6e']){
 const raw=execFileSync('git',['show',`${ref}:orchestrator/review-events.ndjson`],{cwd,encoding:'utf8',maxBuffer:32*1024*1024});
 const events=raw.trim().split('\n').map(JSON.parse),issues=[];let previous='';
 for(const [i,e] of events.entries()){
  const {event_hash,...body}=e;
  const actual=createHash('sha256').update(stable(body)).digest('hex');
  if(actual!==event_hash)issues.push({line:i+1,task:e.task_id,error:'event_hash_mismatch'});
  if((e.previous_event_hash??'')!==previous)issues.push({line:i+1,task:e.task_id,error:'previous_event_hash_mismatch'});
  previous=event_hash;
 }
 result.push({ref,eventCount:events.length,ledgerSha256:createHash('sha256').update(raw).digest('hex'),issues});
}
writeFileSync(new URL('./baseline-review-audit.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
