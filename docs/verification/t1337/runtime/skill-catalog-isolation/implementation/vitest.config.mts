import {fileURLToPath} from 'node:url';import path from 'node:path';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../../../..');
export default {root:path.join(repo,'ai-worker'),cacheDir:'/Volumes/T7-MacData/CodexBuilds/t1337-skill-catalog-isolation-20261017-df9381d3/unit/cache',test:{include:['src/execution/codex-app-server.test.ts','src/execution/codex-account-precheck.test.ts','src/execution/codex-agentic-worker-run.test.ts'],testTimeout:180000,hookTimeout:180000,maxWorkers:1,fileParallelism:false,retry:0}};
