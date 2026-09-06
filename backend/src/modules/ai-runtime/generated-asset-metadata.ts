/**
 * SEMANTIC_BOUNDARY_ALLOW: 这里只剥离工具注入的版本/正文包裹并做长度上限，不判断画面语义；
 * 视觉选择和描述正文仍完全来自编导模型已产出的 prompt。
 */
export function generatedAssetDescription(prompt: string): string {
  const marker = "【视觉方案】";
  const visual = prompt.includes(marker)
    ? prompt.split(marker).slice(1).join(marker).trim()
    : prompt.trim();
  const beforeVisual = prompt.includes(marker) ? prompt.split(marker)[0] ?? "" : "";
  const field = (name: string, nextNames: readonly string[]) => {
    const start = beforeVisual.indexOf(`${name}:`);
    if (start < 0) return "";
    const valueStart = start + name.length + 1;
    const next = nextNames
      .map((candidate) => beforeVisual.indexOf(`\n${candidate}:`, valueStart))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b)[0];
    return beforeVisual
      .slice(valueStart, next ?? beforeVisual.length)
      .trim();
  };
  const boundText = field("段落原文", ["画面职责"]);
  const visualPurpose = field("画面职责", []);
  return [
    boundText ? `服务原文:${boundText}` : "",
    visualPurpose ? `画面职责:${visualPurpose}` : "",
    visual ? `视觉方案:${visual}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1_000);
}

// 素材名:取 prompt 前若干字 + 类型后缀(录制页素材库列表可读;非唯一,asset id 才是主键)。
export function deriveName(prompt: string, kind: "image" | "video"): string {
  const visualMarker = "【视觉方案】";
  const semanticPrompt = prompt.includes(visualMarker)
    ? prompt.split(visualMarker).slice(1).join(visualMarker)
    : prompt;
  const head = semanticPrompt.trim().slice(0, 24).replace(/\s+/g, " ");
  const suffix = kind === "image" ? "生成图" : "生成视频";
  return head ? `${head} · ${suffix}` : `AI ${suffix}`;
}
