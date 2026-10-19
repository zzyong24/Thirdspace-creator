export default {
  "root": "/Users/zyongzhu/Workbase/Thirdspace-creator/backend",
  "cacheDir": "/Volumes/T7-MacData/CodexBuilds/t1338-legacy-work-parent-20261017-11c9cca0/cache/moments-fix",
  "test": {
    "include": [
      "src/modules/moments/moments-model.integration.test.ts",
      "src/modules/moments/moments.service.test.ts",
      "src/modules/review/work-reviews.service.test.ts",
      "src/modules/work-compositions/work-canvas-context.integration.test.ts",
      "src/modules/work-compositions/work-compositions.service.test.ts",
      "src/modules/work-compositions/work-materials.integration.test.ts",
      "src/modules/work-compositions/work-source.integration.test.ts",
      "src/modules/work-compositions/work-sources.transport.test.ts"
    ],
    "testTimeout": 120000,
    "hookTimeout": 120000,
    "globalTimeout": 21600000,
    "maxWorkers": 1,
    "fileParallelism": false,
    "retry": 0
  }
};
