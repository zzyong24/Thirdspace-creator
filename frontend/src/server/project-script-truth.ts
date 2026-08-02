/**
 * Project 当前口播稿的统一读协议（DEC-RADAR-030）。
 *
 * 正式 output_script 一旦产生版本，就成为唯一正文真相；在首次保存前，内容雷达
 * 已确认的 adaptedDraftSeed 是同一份项目口播稿的初始读模型。这里保持纯函数，供
 * 稿面、制作视频和服务端工具读侧复用，避免各页面各自判断成“有稿 / 没稿”。
 */

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function contentRadarDraftSeedOf(briefDetail: unknown): string | null {
  const detail = recordOf(briefDetail);
  const evidence = recordOf(detail?.contentRadarEvidence);
  const draft = recordOf(evidence?.adaptedDraftSeed);
  const text = draft?.contentText;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

export function resolveProjectScriptText(input: {
  readonly persistedText: string | null | undefined;
  readonly persistedVersionCount: number;
  readonly briefDetail: unknown;
}): string | null {
  const persisted = input.persistedText?.trim() ?? "";
  if (input.persistedVersionCount > 0) return persisted || null;
  if (persisted) return persisted;
  return contentRadarDraftSeedOf(input.briefDetail);
}
