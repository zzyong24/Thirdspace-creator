'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {repo}=require('./contract.cjs'),root=path.resolve(__dirname,'..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const budgets=Object.freeze({minimumPositiveMs:120000,requestMs:900000,agenticObservationMs:1800000,u35ObservationMs:28800000,setupMs:7200000,u35UiSetupMs:1800000,businessReadbackMs:1800000,caseHookMs:1800000,preflightMs:1800000,cleanupSeconds:600,outerSeconds:86400,computedCoverageSeconds:58200});
function timestamp(value){const n=typeof value==='string'?Date.parse(value):NaN;assert(Number.isFinite(n),'FINITE_ORIGINAL_DEADLINE_REQUIRED');return n;}
function remaining(deadline,now=Date.now()){const n=timestamp(deadline)-now;assert(n>0,'ORIGINAL_DEADLINE_EXHAUSTED_NO_RESEND');return n;}
function tighten(deadline,persisted){return persisted===null||persisted===undefined?deadline:new Date(Math.min(timestamp(deadline),timestamp(persisted))).toISOString();}
function positiveTimeout(deadline,cap=budgets.requestMs){const n=remaining(deadline);assert(n>=budgets.minimumPositiveMs,'INSUFFICIENT_ORIGINAL_TIME_NO_NEW_REQUEST');return Math.min(cap,n);}
function verifyLock(file,expected){const bytes=fs.readFileSync(file);assert.equal(sha(bytes),expected);const lock=JSON.parse(bytes);assert.equal(lock.confirmed,true);assert.equal(lock.state,'FINAL_EXECUTION_INPUTS');for(const r of lock.files){const p=path.isAbsolute(r.path)?r.path:path.join(repo,r.path),b=fs.readFileSync(p);assert.equal(b.length,r.bytes,r.path);assert.equal(sha(b),r.sha256,r.path);}for(const r of lock.links??[])assert.equal(fs.readlinkSync(path.join(repo,r.path)),r.target);for(const p of lock.absentPaths??[])assert(!fs.existsSync(path.join(repo,p)));return lock;}
function loadBinding(file){
 assert(file&&path.isAbsolute(file),'FINAL_EXECUTION_BINDING_REQUIRED');
 const b=JSON.parse(fs.readFileSync(file)),template=JSON.parse(fs.readFileSync(path.join(root,'preparation/binding.template.json')));
 assert.equal(b.mode,'EXECUTION');assert.equal(b.executionAuthorized,true);assert.equal(b.performanceWindowReleased,true);assert.equal(b.runId,template.runId);assert.deepEqual(b.budgets,budgets);assert.deepEqual(b.intents,template.intents);assert.equal(b.maximumRootSubmissions,4);
 const c=b.finalCandidateBinding;assert(c&&/^[a-f0-9]{40}$/.test(c.sourceHead));assert(/^[a-f0-9]{64}$/.test(c.packageSha256));assert(path.isAbsolute(c.packagePath));assert.equal(sha(fs.readFileSync(c.packagePath)),c.packageSha256);
 assert.equal(b.dataMode,'FRESH_OWNED_ROOT_NO_UNKNOWN_DATABASE_REOPEN');assert(path.isAbsolute(c.ownedRoot));assert(!/IIbU73|t1321-owned|598d9882/.test(c.ownedRoot));const u=new URL(c.baseURL);assert(['127.0.0.1','localhost','[::1]'].includes(u.hostname));assert.equal(c.baseURL,u.origin);
 for(const key of ['launchReceipt','candidatePreflightReceipt','beforeSnapshotReceipt']){const proof=b[key];assert(proof&&path.isAbsolute(proof.path));const bytes=fs.readFileSync(proof.path);assert.equal(sha(bytes),proof.sha256);const v=JSON.parse(bytes);assert.equal(v.confirmed,true);for(const k of ['sourceHead','packageSha256','baseURL','ownedRoot','sessionPath'])assert.equal(v[k],c[k]);}
 assert(b.executionInputLock&&path.isAbsolute(b.executionInputLock.path));const lock=verifyLock(b.executionInputLock.path,b.executionInputLock.sha256);assert.equal(lock.sourceHead,c.sourceHead);assert.equal(lock.packageSha256,c.packageSha256);
 assert(b.ownedScope?.groupId&&b.ownedScope?.userId);assert.equal(b.ownedScope.accountId,null);assert(b.routing&&Number.isSafeInteger(b.routing.revision));assert.equal(b.routing.choices.text,'codex');assert(b.expectedRuntimeVersion&&b.expectedModelId);
 assert(b.publicSources?.rssUrl&&b.publicSources?.researchUrl);for(const k of ['rssUrl','researchUrl']){const x=new URL(b.publicSources[k]);assert.equal(x.protocol,'https:');assert(!x.username&&!x.password);}
 const out=path.resolve(b.outputDirectory);assert(out.startsWith(path.join(root,'runtime')+path.sep));assert(!fs.existsSync(path.join(out,'UNIQUE_INVOCATION.json')));
 // 明确另获运行写权/许可才可读0600握手；模板及collection不会走到这里。
 assert.equal(process.env.T1315_FINAL_EXECUTION_APPROVED,'1');assert.equal(fs.statSync(c.sessionPath).mode&0o777,0o600);const s=JSON.parse(fs.readFileSync(c.sessionPath));assert.equal(s.baseURL,c.baseURL);assert.equal(s.ownedRoot,c.ownedRoot);assert(typeof s.handshake==='string'&&s.handshake.length>0);
 return{b,secret:s.handshake,out,lock};
}
module.exports={root,sha,budgets,timestamp,remaining,tighten,positiveTimeout,verifyLock,loadBinding};
