'use strict';
const path=require('node:path');
const original=require('../../../../../t1307/acceptance/candidate/driver/playwright.config.cjs');
const root=path.join(original.outputDir,'..','attempt02-approved-browser');
module.exports={...original,testDir:__dirname,testMatch:'presentation.spec.cjs',maxFailures:2,timeout:1800000,outputDir:path.join(root,'artifacts'),reporter:[['line'],['json',{outputFile:path.join(root,'result.json')}]],use:{...original.use,channel:'chromium',headless:true,acceptDownloads:true}};
