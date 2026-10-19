'use strict';
// TEST ONLY: production immutable worker; only supplier HTTP is owned loopback.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const auth=JSON.parse(fs.readFileSync(path.join(__dirname,'../OWNED_RUNTIME.json'))),root=process.env.T1338_CASE_ROOT,label=process.env.T1338_LABEL,caseId=process.env.T1338_CASE;
if(!['legacy','new-writes'].includes(caseId)||!/^((red|green)-v[1-9][0-9]*)$/.test(label??'')||path.resolve(root??'')!==path.join(auth.ownedRoot,'cases',label,caseId))throw Error('T1338_EXACT_OWNED_CASE_REQUIRED');
require('./register-process.cjs')(root,'immutable-production-model-worker');
const b=JSON.parse(fs.readFileSync(path.join(__dirname,'WORKER_BINDING.json'))),bytes=fs.readFileSync(b.executionWorkerPath);
if(bytes.length!==b.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==b.sha256)throw Error('T1338_IMMUTABLE_WORKER_DRIFT');
for(const k of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY'])delete process.env[k];
require(b.executionWorkerPath);
