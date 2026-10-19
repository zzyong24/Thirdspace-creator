import base from './playwright.t1356.config';

const attempt=process.env.T1369_ATTEMPT??'natural-attempt01';
if(!/^[a-z0-9-]+$/.test(attempt))throw Error('T1369_ATTEMPT_INVALID');
const config={
 ...base,
 timeout:9_360_000,
 testMatch:'t1369-dashboard-filter-sidebar-navigation.spec.ts',
 outputDir:`../docs/verification/t1369/${attempt}/artifacts`,
 reporter:[['list'],['json',{outputFile:`../docs/verification/t1369/${attempt}/results.json`}]],
 projects:[{name:'t1369-normal',use:{viewport:{width:1366,height:900}}},{name:'t1369-minimum',use:{viewport:{width:1024,height:680}}}],
};
export default config;
