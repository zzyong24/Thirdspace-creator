export default {
  "root": "/Users/zyongzhu/Workbase/Thirdspace-creator/frontend",
  "resolve": {
    "tsconfigPaths": true
  },
  "cacheDir": "/Volumes/T7-MacData/CodexBuilds/t1338-legacy-work-parent-20261017-11c9cca0/cache/vitest",
  "test": {
    "environment": "node",
    "include": [
      "src/server/__module_integration__/legacy-work-parent-workspace.persistence-client.test.ts"
    ],
    "setupFiles": [
      "/Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1338/runtime/runner/next-environment.cjs"
    ],
    "alias": {
      "server-only": "/Users/zyongzhu/Workbase/Thirdspace-creator/frontend/src/test/empty-module.ts",
      "client-only": "/Users/zyongzhu/Workbase/Thirdspace-creator/frontend/src/test/empty-module.ts"
    },
    "testTimeout": 28800000,
    "hookTimeout": 180000,
    "globalTimeout": 30600000,
    "maxWorkers": 1,
    "fileParallelism": false,
    "retry": 0
  }
};
