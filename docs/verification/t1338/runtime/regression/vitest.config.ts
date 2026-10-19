export default {
  "root": "/Users/zyongzhu/Workbase/Thirdspace-creator/backend",
  "cacheDir": "/Volumes/T7-MacData/CodexBuilds/t1338-legacy-work-parent-20261017-11c9cca0/cache/backend-regression",
  "test": {
    "include": [
      "src/application/generation/work-candidate-adoption.integration.test.ts",
      "src/application/generation/work-review-root.test.ts",
      "src/modules/ai-runtime/chat-work-creation-admission.integration.test.ts",
      "src/modules/ai/work-candidate-source.service.test.ts",
      "src/modules/ai/work-creation-chat.integration.test.ts",
      "src/modules/moments/moments-model.integration.test.ts",
      "src/modules/production/production-video-material-owner.test.ts",
      "src/modules/publishing/publication-cover.integration.test.ts",
      "src/modules/review/work-review-read-current.test.ts",
      "src/modules/work-compositions/owner-materials.integration.test.ts",
      "src/modules/work-compositions/work-canvas-context.integration.test.ts",
      "src/modules/work-compositions/work-members.integration.test.ts",
      "src/modules/work-compositions/work-source.integration.test.ts",
      "src/modules/work-compositions/work-sources.transport.test.ts",
      "src/modules/work-compositions/work-compositions.service.test.ts",
      "src/modules/work-compositions/work-materials.integration.test.ts",
      "src/modules/moments/moments.service.test.ts",
      "src/modules/review/work-reviews.service.test.ts",
      "src/work-child-workspace.test.ts"
    ],
    "testTimeout": 120000,
    "hookTimeout": 120000,
    "globalTimeout": 86400000,
    "maxWorkers": 1,
    "fileParallelism": false,
    "retry": 0
  }
};
