'use strict';
const original=require('../../../../../t1304/acceptance/candidate/driver/playwright.config.cjs');
module.exports={...original,testDir:__dirname,testMatch:'source.spec.cjs',timeout:1800000,use:{...original.use,channel:'chromium',headless:true}};
