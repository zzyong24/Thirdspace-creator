import {fileURLToPath} from 'node:url';
export default {
 root:fileURLToPath(new URL('../../../../frontend/',import.meta.url)),
 resolve:{tsconfigPaths:true},
 cacheDir:fileURLToPath(new URL('./cache/',import.meta.url)),
 test:{environment:'node',include:['src/server/__module_integration__/group-execution-preview.persistence-client.test.ts'],alias:{'server-only':fileURLToPath(new URL('../../../../frontend/src/test/empty-module.ts',import.meta.url)),'client-only':fileURLToPath(new URL('../../../../frontend/src/test/empty-module.ts',import.meta.url))},testTimeout:3600000,hookTimeout:180000,maxWorkers:1,fileParallelism:false,retry:0},
};
