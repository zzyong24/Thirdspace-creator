#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/** Mechanical budget arithmetic only. Actual call paths and library defaults still require verification. */
export function checkTimeoutBudget(policy) {
 const errors=[];
 policy=policy??{};
 const positive=(value)=>Number.isSafeInteger(value)&&value>0;
 const nonnegative=(value)=>Number.isSafeInteger(value)&&value>=0;
 if(!positive(policy?.minimumMs))errors.push('minimumMs must be a positive integer');
 if(!Array.isArray(policy?.stages)||!policy.stages.length)errors.push('stages must describe the actual inner operations');
 let requiredMs=0;
 for(const [index,stage] of (Array.isArray(policy?.stages)?policy.stages:[]).entries()){
  const attempts=stage?.attempts??1,backoff=stage?.backoffMs??0;
  if(!positive(stage?.executionMs)||stage?.executionMs<policy.minimumMs)errors.push(`stage ${index}: executionMs is below the project minimum`);
  if(!positive(attempts)||!nonnegative(backoff))errors.push(`stage ${index}: invalid attempts/backoffMs`);
  requiredMs+=(stage?.executionMs??NaN)*attempts+backoff*Math.max(0,attempts-1);
 }
 for(const name of ['queueMs','setupMs','cleanupMs']){
  const value=policy?.[name];
  if(!nonnegative(value))errors.push(`${name} must explicitly state the actual budget (0 is allowed)`);
  else requiredMs+=value;
 }
 if(!Number.isSafeInteger(requiredMs))errors.push('composed budget is invalid or overflows');
 if(policy.sharedDeadline===true && (!positive(policy.deadlineAt)||(Array.isArray(policy.stages)?policy.stages:[]).some(stage=>stage?.deadlineAt!==policy.deadlineAt)))errors.push('shared deadline must identify the same original absolute deadline at every inner stage');
 if(policy?.outerMs===null){if(policy.unboundedAllowed!==true)errors.push('unbounded outer observation requires an explicit contract');}
 else {
  if(!positive(policy?.outerMs)||policy.outerMs<policy.minimumMs)errors.push('outerMs is below the project minimum');
  if(policy?.sharedDeadline!==true && !(policy.outerMs>requiredMs))errors.push('outerMs must exceed the complete inner budget including retries/setup/queue/cleanup');
 }
 return {ok:errors.length===0,requiredMs,errors};
}
function main(){
 const args=process.argv.slice(2),at=args.indexOf('--input');
 if(at<0||!args[at+1])throw new Error('usage: timeout-budget.mjs --input <project-budget.json>');
 const raw=JSON.parse(fs.readFileSync(path.resolve(args[at+1]),'utf8'));
 const results=(Array.isArray(raw)?raw:[raw]).map(checkTimeoutBudget);
 console.log(JSON.stringify({ok:results.every(x=>x.ok),results},null,2));
 if(results.some(x=>!x.ok))process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main();}catch(error){console.error(error.message);process.exitCode=2;}
}
