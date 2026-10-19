'use strict';
const path=require('node:path'),{loadBinding,budgets}=require('./binding.cjs'),{b}=loadBinding();
module.exports={testDir:__dirname,testMatch:'final.spec.cjs',workers:1,retries:0,fullyParallel:false,timeout:budgets.testMs,globalTimeout:budgets.globalMs,expect:{timeout:120000},reporter:[['line']],outputDir:path.join(b.outputDirectory,'playwright-artifacts')};
