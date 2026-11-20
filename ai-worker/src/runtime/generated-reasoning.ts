const reasoningTag = /<\s*(\/?)(?:think(?:ing)?|analysis|reasoning|chain[-_]of[-_]thought)(?=[\s/>])[^>]*>/gi;
const processPreface = /^(?:#{1,6}[ \t]+)?(?:分析如下\s*[:：]|(?:模型思考|内部推理|思考过程|推理步骤)\s*(?:[:：\n]|$)|(?:让我先|接下来[，, ]*(?:我(?:会|将)?|将))\s*先?(?:分析|思考|梳理|整理|规划|提取|检查|构思|拟定|写作|撰写))/u;
const bodyLabel = /^(?:#{1,6}[ \t]+)?(?:文章正文|最终正文|成稿|正文)(?:如下)?[ \t]*[：:][ \t]*/mu;

/** SEMANTIC_BOUNDARY_ALLOW: 只处理生成器的显式思考包装和过程前缀，保留其余文本。 */
export function stripGeneratedReasoning(text: string, spokenText = ""): string {
  let depth = 0, cursor = 0, unwrapped = "";
  for (const tag of text.matchAll(reasoningTag)) {
    // 有些兼容接口只返回思考的结束标记，标记前的首段仍属于思考。
    if (depth === 0 && !(cursor === 0 && tag[1])) unwrapped += text.slice(cursor, tag.index);
    if (tag[1]) depth = Math.max(0, depth - 1);
    else if (!tag[0].endsWith("/>")) depth++;
    cursor = tag.index + tag[0].length;
  }
  if (depth === 0) unwrapped += text.slice(cursor);
  unwrapped = unwrapped.trim();
  const spoken = spokenText.replace(/[\s\p{P}\p{S}]+/gu, "");
  const isProcess = (paragraph: string) => processPreface.test(paragraph) &&
    !spoken.includes(paragraph.replace(/[\s\p{P}\p{S}]+/gu, ""));
  const label = bodyLabel.exec(unwrapped);
  if (label && (isProcess(unwrapped.slice(0, label.index).trim()) || (cursor > 0 && label.index === 0))) {
    unwrapped = unwrapped.slice(label.index + label[0].length);
  }
  const parts = unwrapped.split(/(\r?\n[ \t]*\r?\n)/u);
  let cleaned = "";
  for (let index = 0; index < parts.length; index += 2) {
    const paragraph = parts[index]!;
    if (!isProcess(paragraph.trim())) cleaned += paragraph + (parts[index + 1] ?? "");
  }
  cleaned = cleaned.trim();
  return cleaned === text.trim() ? text : cleaned;
}
