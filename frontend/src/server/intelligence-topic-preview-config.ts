/**
 * 内容雷达选题卡是结构化输出，预算既要容纳模型的推理 token，也要容纳最终 JSON。
 *
 * 旧值 1600/900 对会返回 thinking block 的模型过紧：模型在 JSON 完成前就触发 length，
 * generateObject 与文本兜底会连续失败。这里保持零重试控制等待时间，把空间留给单次完整输出。
 */
export function topicPreviewGenerationOptions(input: {
  hasReusableDecomposition: boolean;
}): {
  maxRetries: 0;
  maxOutputTokens: number;
} {
  return {
    maxRetries: 0,
    maxOutputTokens: input.hasReusableDecomposition ? 2_400 : 4_096,
  };
}
