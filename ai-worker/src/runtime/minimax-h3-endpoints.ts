const DEFAULT_MINIMAX_API_BASE = "https://api.minimax.io";
const H3_V2_SUFFIX = "/v2";
const H3_SUBMIT_SUFFIX = "/v2/video_generation";

export interface MinimaxH3Endpoints {
  submitUrl: string;
  queryUrl: (taskId: string) => string;
}

/**
 * 把用户或渠道保存的 MiniMax 地址确定性归一到 H3 v2 根地址。
 *
 * 支持纯域名、`/v2` 版本根、完整 `/v2/video_generation` 提交接口，以及前面带
 * 中转路径的同类地址。这里绝不在 404 后尝试第二个提交端点，避免一次生成被重复计费。
 *
 * SEMANTIC_BOUNDARY_ALLOW: 这里只纠正公开 HTTP 协议的已知路径层级，不做模型、内容或
 * 创作选择；相同输入始终得到唯一 URL。
 */
export function resolveMinimaxH3Endpoints(
  baseUrl: string | null | undefined,
): MinimaxH3Endpoints {
  const configured = (baseUrl?.trim() || DEFAULT_MINIMAX_API_BASE).replace(
    /\/+$/,
    "",
  );
  const lower = configured.toLowerCase();

  let v2Base: string;
  if (lower.endsWith(H3_SUBMIT_SUFFIX)) {
    v2Base = configured.slice(0, -"/video_generation".length);
  } else if (lower.endsWith(H3_V2_SUFFIX)) {
    v2Base = configured;
  } else {
    v2Base = `${configured}${H3_V2_SUFFIX}`;
  }

  return {
    submitUrl: `${v2Base}/video_generation`,
    queryUrl: (taskId: string) =>
      `${v2Base}/query/video_generation/${encodeURIComponent(taskId)}`,
  };
}
