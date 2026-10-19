'use strict';
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
if(!process.env.T1300_SESSION)throw Error('PRIVATE_SESSION_PATH_REQUIRED');
const session=JSON.parse(fs.readFileSync(process.env.T1300_SESSION,'utf8')),binding=JSON.parse(fs.readFileSync(session.candidateBinding,'utf8'));
if(binding.sourceHead!=='dc46cfa700ec9c9cbada47fb76237d0b50d10a67'||session.baseURL!=='http://127.0.0.1:65353')throw Error('EXACT_DIAGNOSIS_CANDIDATE_REQUIRED');
const {defineConfig}=createRequire(path.join(binding.sourceRoot,'frontend/package.json'))('@playwright/test');
const root=path.join(binding.sourceRoot,'docs/verification/t1308/acceptance/runs/final-t1307-t1308/b');fs.mkdirSync(root,{recursive:true,mode:0o700});
module.exports=defineConfig({testDir:__dirname,testMatch:'history.spec.cjs',fullyParallel:false,workers:1,retries:0,timeout:1800000,expect:{timeout:120000},outputDir:path.join(root,'artifacts'),reporter:[['line'],['json',{outputFile:path.join(root,'result.json')}]],use:{baseURL:session.baseURL,extraHTTPHeaders:{'x-creatoros-handshake':session.handshake},viewport:{width:1600,height:1000},actionTimeout:120000,navigationTimeout:300000,launchOptions:{timeout:180000},trace:'off',video:'off',screenshot:'only-on-failure'}});
