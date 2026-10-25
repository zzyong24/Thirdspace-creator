import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const base='docs/verification/t1410';
const manifest=JSON.parse(fs.readFileSync(`${base}/canonical-repair-plan.json`));
const events=fs.readFileSync('orchestrator/review-events.ndjson','utf8').trim().split('\n').map(JSON.parse);
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const stable=v=>Array.isArray(v)?`[${v.map(stable).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`:JSON.stringify(v);
const extract=bytes=>JSON.parse(bytes.toString().match(/```spec-review-state\s*\n([\s\S]*?)\n```/)[1]);
const items=[];
// Validate every candidate and all original bytes before performing any restoration.
for(const item of manifest.items.filter(i=>i.restore_commit&&i.task_id!=='T-652')){
 const event=events.findLast(e=>e.task_id===item.task_id);
 assert.equal(event.event_hash,item.event_hash);
 const original=fs.readFileSync(item.review_path);
 const restored=execFileSync('git',['show',`${item.restore_commit}:${item.review_path}`]);
 const state=extract(restored),{receipt,...body}=state;
 assert.equal(sha(stable(body)).slice(0,12),receipt);
 assert.equal(receipt,item.canonical_receipt);
 assert.equal(state.latest_event_hash,event.event_hash);
 assert.equal(state.task_id,item.task_id);
 for(const key of ['cycle','round','verdict','spec_path','spec_sha256','constitution_path','constitution_sha256','review_path','cycle_authorization'])assert.equal(stable(state[key]),stable(event[key]),`${item.task_id}:${key}`);
 assert.deepEqual(state.open_findings,event.packet.findings.filter(f=>f.status==='open'));
 assert.deepEqual(state.resolved_findings,event.packet.findings.filter(f=>f.status==='resolved').map(({id,resolution_evidence})=>({id,resolution_evidence})));
 const archive=`${base}/foreign-snapshots/${item.task_id}.review.md`;
 assert(!fs.existsSync(archive),'refuse archive overwrite');
 items.push({taskId:item.task_id,path:item.review_path,sourceCommit:item.restore_commit,originalSha256:sha(original),restoredSha256:sha(restored),canonicalReceipt:receipt,canonicalEventHash:event.event_hash,archive,original,restored});
}
assert.equal(items.length,16);
fs.mkdirSync(`${base}/foreign-snapshots`,{recursive:true});
for(const item of items){
 fs.writeFileSync(item.archive,item.original,{flag:'wx'});
 assert.equal(sha(fs.readFileSync(item.path)),item.originalSha256);
 fs.writeFileSync(item.path,item.restored);
}
fs.writeFileSync(`${base}/canonical-restoration-receipt.json`,JSON.stringify({schema:'canonical-snapshot-restoration/v1',at:new Date().toISOString(),eventChainUnchanged:true,items:items.map(({original,restored,...rest})=>rest)},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({restored:items.length,eventChainChanged:false}));
