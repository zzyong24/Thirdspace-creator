/**
 * 把生成卡的可见序号扩成用户自然会说的素材别名。
 * 只做确定性映射，不按标题模糊猜测；最终值始终是真实 assetId。
 */
function chineseOrdinal(value: number): string | null {
  if (!Number.isInteger(value) || value < 1 || value > 99) return null;
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (value < 10) return digits[value] ?? null;
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return `${tens === 1 ? "" : digits[tens]}十${ones === 0 ? "" : digits[ones]}`;
}

export function expandGeneratedAssetAliases(
  alias: string,
  assetId: string,
): Record<string, string> {
  const normalizedAlias = alias.trim();
  const normalizedAssetId = assetId.trim();
  if (!normalizedAlias || !normalizedAssetId) return {};
  const aliases: Record<string, string> = {
    [normalizedAlias]: normalizedAssetId,
  };
  const imageNo = Number(/^图(\d+)$/.exec(normalizedAlias)?.[1] ?? NaN);
  if (Number.isInteger(imageNo)) {
    const chinese = chineseOrdinal(imageNo);
    for (const name of [
      `image${imageNo}`,
      `img${imageNo}`,
      `第${imageNo}张`,
      `刚才第${imageNo}张`,
      `刚才那组第${imageNo}张`,
      ...(chinese
        ? [`第${chinese}张`, `${chinese}张`, `刚才第${chinese}张`, `刚才${chinese}张`, `刚才那组第${chinese}张`, `刚才那组${chinese}张`]
        : []),
    ]) {
      aliases[name] = normalizedAssetId;
    }
  }
  const videoNo = Number(/^视频(\d+)$/.exec(normalizedAlias)?.[1] ?? NaN);
  if (Number.isInteger(videoNo)) {
    const chinese = chineseOrdinal(videoNo);
    for (const name of [
      `video${videoNo}`,
      `第${videoNo}个视频`,
      ...(chinese ? [`第${chinese}个视频`, `刚才第${chinese}个视频`] : []),
    ]) {
      aliases[name] = normalizedAssetId;
    }
  }
  return aliases;
}

export interface GeneratedAssetAliasRegistry {
  readonly activeBatchKey: string | null;
  readonly activeBatchRank: number;
  readonly aliases: Readonly<Record<string, string>>;
}

export function registerGeneratedAssetAlias(
  registry: GeneratedAssetAliasRegistry,
  input: {
    readonly batchKey: string;
    readonly batchRank: number;
    readonly alias: string;
    readonly assetId: string;
  },
): GeneratedAssetAliasRegistry {
  if (!input.batchKey.trim() || !Number.isInteger(input.batchRank)) return registry;
  // 旧批次的视频可能比新批次的图片更晚完成。它可以继续渲自己的卡，但不能把
  // “刚才第二张/image2”抢回旧素材。
  if (input.batchRank < registry.activeBatchRank) return registry;
  const sameBatch = input.batchRank === registry.activeBatchRank;
  return {
    activeBatchKey: input.batchKey,
    activeBatchRank: input.batchRank,
    aliases: {
      ...(sameBatch ? registry.aliases : {}),
      ...expandGeneratedAssetAliases(input.alias, input.assetId),
    },
  };
}
