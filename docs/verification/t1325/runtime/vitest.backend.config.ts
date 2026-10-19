import {fileURLToPath} from 'node:url';
export default {
 root:fileURLToPath(new URL('../../../../backend/',import.meta.url)),
 resolve:{tsconfigPaths:true},
 cacheDir:fileURLToPath(new URL('./backend-cache/',import.meta.url)),
 test:{environment:'node',include:['src/modules/creative-results/creative-results.integration.test.ts','src/modules/creative-results/media-adoption.integration.test.ts'],alias:{'server-only':fileURLToPath(new URL('../../../../backend/src/test/empty-module.ts',import.meta.url)),'client-only':fileURLToPath(new URL('../../../../backend/src/test/empty-module.ts',import.meta.url))},testTimeout:120000,hookTimeout:180000,maxWorkers:1,fileParallelism:false,retry:0},
};
