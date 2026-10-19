export default {
  "root": "/Users/zyongzhu/Workbase/Thirdspace-creator/frontend",
  "resolve": {
    "tsconfigPaths": true
  },
  "cacheDir": "/Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1331/runtime/review-consumer/regression/cache",
  "test": {
    "environment": "node",
    "include": [
      "../backend/src/modules/ai-runtime/script-review-context.test.ts",
      "../backend/src/modules/ai-runtime/script-review-preparation.integration.test.ts"
    ],
    "setupFiles": [],
    "testTimeout": 120000,
    "hookTimeout": 180000,
    "globalTimeout": 3600000,
    "maxWorkers": 1,
    "fileParallelism": false,
    "retry": 0
  }
};
