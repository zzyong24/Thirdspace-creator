'use strict';
const path=require('node:path');
const config=require('../../../candidate/driver/playwright.config.cjs');
module.exports={...config,testDir:__dirname,testMatch:'business.spec.cjs',use:{...config.use,acceptDownloads:true,launchOptions:{timeout:180000}},timeout:28800000};
