import {fileURLToPath} from 'node:url';
export default {
 root:fileURLToPath(new URL('../../../../frontend/',import.meta.url)),
 resolve:{tsconfigPaths:true},
 cacheDir:fileURLToPath(new URL('./readonly-cache/',import.meta.url)),
 test:{environment:'node',include:['src/app/api/v1/local/execution-preview/**/route.test.ts','src/lib/request-context.server.test.ts'],alias:{'server-only':fileURLToPath(new URL('../../../../frontend/src/test/empty-module.ts',import.meta.url)),'client-only':fileURLToPath(new URL('../../../../frontend/src/test/empty-module.ts',import.meta.url))},testTimeout:3600000,hookTimeout:180000,maxWorkers:1,fileParallelism:false,retry:0},
};
