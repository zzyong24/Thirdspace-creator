import { totalmem } from "node:os";

const MiB = 1024 ** 2;

// Build-only budget: reserve at least 2 GiB and 40% for native memory/other workers.
// Never mutate process.env: packaged runtime smoke must use its normal environment.
export function buildMemoryEnvironment({
  totalBytes = totalmem(),
  constrainedBytes = process.constrainedMemory?.() ?? 0,
  env = process.env,
} = {}) {
  const effectiveMiB = Math.floor(Math.min(totalBytes, constrainedBytes > 0 ? constrainedBytes : totalBytes) / MiB);
  const heapMiB = Math.floor(Math.min(6144, effectiveMiB * 0.6, effectiveMiB - 2048) / 256) * 256;
  if (heapMiB < 2048) throw new Error(`Windows 构建可用内存不足：主机限制 ${effectiveMiB} MiB，需至少 4 GiB。`);
  // SEMANTIC_BOUNDARY_ALLOW: normalize numeric Node heap flags only; no content decisions.
  const existing = (env.NODE_OPTIONS ?? "").replace(/(?:^|\s)--max[-_]old[-_]space[-_]size(?:=|\s+)\d+(?=\s|$)/g, "").trim();
  return {
    totalMiB: Math.floor(totalBytes / MiB), effectiveMiB, heapMiB,
    env: { ...env, NODE_OPTIONS: `${existing} --max-old-space-size=${heapMiB}`.trim() },
  };
}
