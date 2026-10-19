import {fileURLToPath} from 'node:url';
export default {
 root:fileURLToPath(new URL('../../../../../backend/',import.meta.url)),
 resolve:{alias:[{find:/^@creatoros\/backend$/,replacement:fileURLToPath(new URL('../../../../../backend/src/index.ts',import.meta.url))},{find:/^@creatoros\/ai-worker$/,replacement:fileURLToPath(new URL('../../../../../ai-worker/src/index.ts',import.meta.url))}]},
 cacheDir:fileURLToPath(new URL('./cache/',import.meta.url)),
 test:{include:['../docs/verification/t1310/supplemental/runtime/topic-chat.diagnosis.test.ts'],testTimeout:540000,hookTimeout:180000,maxWorkers:1,fileParallelism:false,retry:0},
};
