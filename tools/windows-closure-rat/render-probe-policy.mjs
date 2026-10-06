import { executionTimeoutMs } from '../../frontend/scripts/desktop/timeout-policy.mjs';
// CLI自身控制每一步及重试；单独process帽子无法表示帧数/重试/编码全路径，外层不限时。
export function renderProbeOptions(baseEnv, overrides = {}) {
  const budgets = {
    PRODUCER_PUPPETEER_LAUNCH_TIMEOUT_MS: 120_000,
    PRODUCER_PUPPETEER_PROTOCOL_TIMEOUT_MS: 300_000,
    PRODUCER_PAGE_NAVIGATION_TIMEOUT_MS: 120_000,
    PRODUCER_PLAYER_READY_TIMEOUT_MS: 120_000,
    PRODUCER_RENDER_READY_TIMEOUT_MS: 120_000,
    FFMPEG_PROCESS_TIMEOUT_MS: 300_000,
    FFMPEG_ENCODE_TIMEOUT_MS: 600_000,
    FFMPEG_STREAMING_TIMEOUT_MS: 600_000,
  };
  const env = { ...baseEnv };
  for (const [name, existingDefault] of Object.entries(budgets)) {
    const supplied = overrides[name] === undefined ? existingDefault : Number(overrides[name]);
    env[name] = String(Math.max(existingDefault, executionTimeoutMs(supplied)));
  }
  return { env }; // 不设spawnSync.timeout；0/缺省是Node明确支持的无限等待。
}
