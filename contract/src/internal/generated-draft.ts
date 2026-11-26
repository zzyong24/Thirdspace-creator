const reasoningTag = /<\s*(\/?)\s*(?:think(?:ing)?|analysis|reasoning|chain[-_]of[-_]thought)(?=[\s/>])(?:[^<>"']|"[^"]*"|'[^']*')*>/gi;
const draftHeading = /^[ \t]*(?:#{1,6}[ \t]+)?(?:【(?:最终正文|初稿正文|口播正文|正文|成稿)】[ \t]*[：:]?[ \t]*|(?:最终正文|初稿正文|口播正文|正文|成稿)(?:如下)?[ \t]*(?:[：:][ \t]*|(?=\r?$)))/mu;

/** SEMANTIC_BOUNDARY_ALLOW: 只处理生成初稿的显式思考标记与未闭合时的正文标题，无标记的原稿逐字保留。 */
export function stripDraftReasoning(text: string): string {
  let depth = 0;
  let cursor = 0;
  let visible = "";
  let openBlock = "";

  for (const tag of text.matchAll(reasoningTag)) {
    const preceding = text.slice(cursor, tag.index);
    const closing = tag[1] === "/";
    if (depth === 0) {
      // 部分接口只返回首段思考的闭标签，闭标签之前属于该段。
      if (!closing || cursor > 0) visible += preceding;
      openBlock = "";
    } else if (depth === 1) {
      openBlock += preceding;
    }

    if (closing) depth = Math.max(0, depth - 1);
    else if (!tag[0].endsWith("/>")) depth++;
    cursor = tag.index + tag[0].length;
  }

  if (cursor === 0) return text;

  if (depth === 0) return (visible + text.slice(cursor)).trim();
  if (depth === 1) openBlock += text.slice(cursor);
  const heading = draftHeading.exec(openBlock);
  // 正常闭合的思考段全部丢弃，只有最后未闭合的段落才按显式正文标题恢复。
  return (visible + (heading ? openBlock.slice(heading.index + heading[0].length) : "")).trim();
}

export class MissingGeneratedDraftBodyError extends Error {
  constructor() {
    super("初稿生成失败：未返回可用正文");
  }
}

export function requireGeneratedDraftBody(text: string): string {
  const body = stripDraftReasoning(text);
  if (!body.trim()) throw new MissingGeneratedDraftBodyError();
  return body;
}
