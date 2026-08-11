/**
 * 当前脚本版本晚于盲预测时，旧预测只属于历史稿，不能继续冒充当前稿的锁定结果。
 * 只比较服务端 ISO 时间；缺失或非法时不猜测，保持既有结果。
 */
export function isBlindPredictionStale(
  predictionCreatedAt: string | null | undefined,
  currentScriptVersionCreatedAt: string | null | undefined,
): boolean {
  if (!predictionCreatedAt || !currentScriptVersionCreatedAt) return false;
  const predictionTime = Date.parse(predictionCreatedAt);
  const scriptTime = Date.parse(currentScriptVersionCreatedAt);
  if (!Number.isFinite(predictionTime) || !Number.isFinite(scriptTime)) {
    return false;
  }
  return scriptTime > predictionTime;
}
