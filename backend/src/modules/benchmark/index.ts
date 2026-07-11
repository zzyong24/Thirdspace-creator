// [T-212a] Benchmark module（对标源 + 对标作品，选题/对标强化）—— ONLY public entry
// (foundation §1)。composite transport 只经本文件 import（不碰内部）。

export {
  createBenchmarkService,
  type BenchmarkService,
  type CreateSourceInput,
  type RecordWorkInput,
  type EnabledSource,
} from "./benchmark.service";

export {
  createBenchmarkRepository,
  type BenchmarkRepository,
  type RepoDeps,
  type BenchmarkSourceRow,
  type BenchmarkWorkRow,
} from "./benchmark.repository";

export {
  createBenchmarkTransport,
  BENCHMARK_OP_IDS,
} from "./benchmark.transport";

export { BENCHMARK_DDL } from "./benchmark.db-schema";

export { OwnershipError, ValidationError } from "./benchmark.errors";

export {
  benchmarkSourceResource,
  benchmarkWorkResource,
  toBenchmarkSourceDto,
  toBenchmarkWorkDto,
  type BenchmarkSourceResource,
  type BenchmarkWorkResource,
} from "./benchmark.schema";

// [T-212b] 爆款判定纯函数（统计学，可单测）。
export {
  detectViral,
  medianOf,
  DEFAULT_VIRAL_OPTIONS,
  type ViralInputWork,
  type ViralVerdict,
  type DetectViralOptions,
} from "./benchmark.viral";
