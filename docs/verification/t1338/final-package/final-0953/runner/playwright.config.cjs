'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),collection=process.env.T1338_FINAL_UI_COLLECTION_ONLY==='1',b=collection?null:JSON.parse(fs.readFileSync(process.env.T1338_FINAL_UI_BINDING));
module.exports={testDir:__dirname,testMatch:'journey.spec.cjs',workers:1,fullyParallel:false,retries:0,timeout:28800000,globalTimeout:30600000,expect:{timeout:120000},outputDir:b?path.join(b.outputDirectory,'playwright-assets'):path.join(root,'NOT_RUN_OUTPUT'),reporter:b?[['json',{outputFile:path.join(b.outputDirectory,'playwright-result.json')}]]:'list',use:{actionTimeout:120000,navigationTimeout:300000,trace:'off',video:'off',screenshot:'off'}};
