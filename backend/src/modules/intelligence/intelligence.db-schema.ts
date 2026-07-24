// T-482 内容情报与持久任务 canonical schema 在 shared backend 根包；
// 模块只 re-export，避免第二份表定义。
export {
  executionTasks,
  intelligenceCollections,
  intelligenceItems,
  intelligenceMigrationLedgers,
  intelligenceSources,
  intelligenceSyncRunEvents,
  intelligenceSyncRuns,
  intelligenceTransforms,
  itemMetricSnapshots,
  itemSourceObservations,
  itemTranscripts,
  projectIntelligenceReferences,
  sourceSnapshots,
} from "@creatoros/backend";
