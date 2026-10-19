import base from './playwright.t1356.config';
export default {
 ...base,
 testMatch:'t1361-pending-filter-workspace-refresh.spec.ts',
 outputDir:'../docs/verification/t1361/e2e-artifacts',
 reporter:[['list'],['json',{outputFile:'../docs/verification/t1361/e2e-results.json'}]],
 projects:[{name:'t1361-normal',use:{viewport:{width:1366,height:900}}},{name:'t1361-minimum',use:{viewport:{width:1024,height:680}}}],
};
