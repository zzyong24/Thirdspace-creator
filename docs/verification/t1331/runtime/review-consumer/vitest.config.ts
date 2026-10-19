export default {
  "root": "/Users/zyongzhu/Workbase/Thirdspace-creator/frontend",
  "resolve": {
    "tsconfigPaths": true
  },
  "cacheDir": "/Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1331/runtime/review-consumer/cache",
  "test": {
    "environment": "node",
    "include": [
      "src/server/__module_integration__/script-review-confirmed-current.persistence-client.test.ts"
    ],
    "setupFiles": [],
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
