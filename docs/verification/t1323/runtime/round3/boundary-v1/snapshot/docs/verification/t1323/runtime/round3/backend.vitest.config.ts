import {fileURLToPath} from 'node:url';
export default {root:fileURLToPath(new URL('../../../../../backend/',import.meta.url)),cacheDir:fileURLToPath(new URL('./backend-cache/',import.meta.url)),test:{include:['src/modules/execution/execution-checkpoint.service.test.ts'],testTimeout:3600000,hookTimeout:180000,maxWorkers:1,fileParallelism:false,retry:0}};
