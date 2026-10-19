'use strict';
const original=require('../../../candidate/driver/playwright.config.cjs');
module.exports={...original,testDir:__dirname,testMatch:'keyboard.spec.cjs',timeout:7200000,use:{...original.use,channel:'chromium',headless:true}};
