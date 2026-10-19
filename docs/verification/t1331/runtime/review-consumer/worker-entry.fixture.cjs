'use strict';
// TEST ONLY: original immutable worker; actual model transport talks only to owned loopback HTTP.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=process.env.T1331_REVIEW_ROOT,relative=root?path.relative(path.join(__dirname,'cases'),path.resolve(root)):'';
const parts=relative.split(path.sep);
if(parts.length!==2||!['red-v1','green-v1'].includes(parts[0])||!['restore','reserved'].includes(parts[1])||path.resolve(root)!==path.join(__dirname,'cases',parts[0],parts[1]))throw Error('T1331_REVIEW_EXACT_OWNED_ROOT_REQUIRED');
require('./register-process.cjs')(root,'immutable-production-model-worker');
const binding=JSON.parse(fs.readFileSync(path.join(__dirname,'WORKER_BINDING.json'),'utf8')),bytes=fs.readFileSync(binding.executionWorkerPath);
if(bytes.length!==binding.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==binding.sha256)throw Error('T1331_REVIEW_WORKER_DRIFT');
for(const key of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY'])delete process.env[key];
require(binding.executionWorkerPath);
