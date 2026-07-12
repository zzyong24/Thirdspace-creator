// [T-256c] 三领域工具适配器出口(调研 / 抓取决策 / 素材整理)。
export {
  createResearchTools,
  RESEARCH_WEB_READ_WINDOW_CHARS,
  type ResearchPorts,
} from "./research-adapter";
export {
  createCollectionTools,
  type CollectionPorts,
} from "./collection-adapter";
export {
  createMaterialTools,
  type MaterialPorts,
} from "./material-adapter";
