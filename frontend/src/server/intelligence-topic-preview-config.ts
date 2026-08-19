/**
 * 内容雷达结构化阶段只承担拆解或选题卡，不再携带长篇改写稿。
 * 保持零重试控制等待时间；长稿由独立纯文本阶段生成。
 */
export const TOPIC_ADAPTED_DRAFT_TIMEOUT_MS = 180_000;

export function topicPreviewGenerationOptions(input: {
  hasReusableDecomposition: boolean;
}): {
  maxRetries: 0;
  maxOutputTokens: number;
} {
  return {
    maxRetries: 0,
    maxOutputTokens: input.hasReusableDecomposition ? 2_048 : 3_072,
  };
}
