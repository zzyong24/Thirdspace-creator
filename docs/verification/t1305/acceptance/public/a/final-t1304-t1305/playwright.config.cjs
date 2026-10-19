'use strict';
const path=require('node:path');
const original=require('../../../../../t1304/acceptance/candidate/driver/playwright.config.cjs');
const sub=process.env.T1305_EVIDENCE_SUBDIR;
if(sub&&!/^[a-z0-9-]+$/.test(sub))throw Error('INVALID_A_OWNED_EVIDENCE_SUBDIR');
const extra=sub?{outputDir:path.join(original.outputDir,'..',sub,'artifacts'),reporter:[['line'],['json',{outputFile:path.join(original.outputDir,'..',sub,'result.json')}]]}:{};
module.exports={...original,...extra,testDir:__dirname,testMatch:'source.spec.cjs',timeout:1800000,use:{...original.use,channel:'chromium',headless:true}};
