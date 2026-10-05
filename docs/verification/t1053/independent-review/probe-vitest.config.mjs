import original from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/frontend/vitest.config.ts';
const frontend='/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/frontend';
export default {...original,root:'/private/tmp/t1053-implementation-review',cacheDir:'/private/tmp/t1053-implementation-review/vite-cache-probe',resolve:{...original.resolve,alias:{'@':frontend+'/src'}},test:{...original.test,include:['*.test.tsx'],setupFiles:[frontend+'/src/test/setup.ts'],cache:false,retry:0}};
