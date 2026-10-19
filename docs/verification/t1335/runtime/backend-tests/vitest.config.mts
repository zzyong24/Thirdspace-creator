// 仅服务组合与原Pi回归；没有worker、浏览器或模型。实际公共链由B单列。
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../../../../../',import.meta.url));
export default {root:repo+'backend',cacheDir:'/Volumes/T7-MacData/CodexBuilds/t1335-backend-boundaries-20261017-8cb8e94d/cache',test:{include:['src/modules/ai/agentic-proposal-staging.service.test.ts','src/modules/ai/execution-codex-agentic-candidate.test.ts','src/modules/ai/execution-agentic-candidate.service.test.ts'],fileParallelism:false,maxWorkers:1,testTimeout:120000,hookTimeout:180000,globalTimeout:30600000}};
