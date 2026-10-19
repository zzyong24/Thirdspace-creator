'use strict';
const original=require('../../../../../t1304/acceptance/candidate/driver/playwright.config.cjs');
module.exports={...original,testDir:__dirname,testMatch:'presentation.spec.cjs',maxFailures:2,timeout:1800000,use:{...original.use,channel:'chromium',headless:true,acceptDownloads:true}};
