import config from '/Users/zyongzhu/.codex/worktrees/integrated-dev-acceptance/Thirdspace-creator/frontend/vitest.config.ts';
export default {...config,test:{...config.test,include:['src/server/platform-worker-entry.integration.test.ts', 'src/server/review-insights-worker-entry.integration.test.ts'],retry:0,fileParallelism:false,maxWorkers:1,teardownTimeout:180000}};
