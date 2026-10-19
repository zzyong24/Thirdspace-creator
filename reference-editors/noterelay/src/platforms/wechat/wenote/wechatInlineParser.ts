import MarkdownIt from "markdown-it";

export interface WechatInlineToken {
  type: string;
  content: string;
  attrs: [string, string][] | null;
  children: WechatInlineToken[] | null;
}

interface Delimiter {
  marker: number;
  length: number;
  token: number;
  end: number;
  open: boolean;
  close: boolean;
}

interface InlineState {
  src: string;
  pos: number;
  posMax: number;
  env: { variables: Record<string, string> };
  tokens: WechatInlineToken[];
  delimiters: Delimiter[];
  tokens_meta: Array<{ delimiters?: Delimiter[] } | null>;
  push(type: string, tag: string, nesting: number): WechatInlineToken;
}

// SEMANTIC_BOUNDARY_ALLOW: 只解析作者显式格式，不判断语义或作创作选择。
// 私有实例与共享块解析器隔离；变量值是终端token，绝不重新送回解析器。
const md = new MarkdownIt({ html: false, linkify: true, typographer: false, breaks: false });
const underlineMarker = 0x10000;

md.inline.ruler.before("text", "wechat_variable", (state: InlineState, silent: boolean) => {
  if (!state.src.startsWith("{{", state.pos)) return false;
  const match = state.src.slice(state.pos, state.posMax).match(/^\{\{\s*([^{}]+?)\s*\}\}/);
  if (!match) return false;
  const value = state.env.variables[match[1].trim()];
  if (typeof value !== "string") return false;
  if (!silent) state.push("wechat_variable", "", 0).content = value;
  state.pos += match[0].length;
  return true;
});

md.inline.ruler.before("emphasis", "wechat_decoration", (state: InlineState, silent: boolean) => {
  if (silent) return false;
  const start = state.pos;
  const marker = state.src.charCodeAt(start);
  const underline = state.src.startsWith("<u>", start);
  const underlineClose = state.src.startsWith("</u>", start);
  if (underline || underlineClose) {
    const markup = underline ? "<u>" : "</u>";
    state.push("text", "", 0).content = markup;
    state.delimiters.push({ marker: underlineMarker, length: 0, token: state.tokens.length - 1, end: -1, open: underline, close: underlineClose });
    state.pos += markup.length;
    return true;
  }
  if (marker !== 0x2b && marker !== 0x3d) return false;
  let end = start;
  while (end < state.posMax && state.src.charCodeAt(end) === marker) end++;
  const length = end - start;
  if (length < 2) return false;
  // 和原++/==能力一致，保留内部空格；奇数个标记的多余字符保留为原文。
  if (length % 2) state.push("text", "", 0).content = String.fromCharCode(marker);
  for (let offset = length % 2; offset < length; offset += 2) {
    state.push("text", "", 0).content = String.fromCharCode(marker).repeat(2);
    state.delimiters.push({ marker, length: 0, token: state.tokens.length - 1, end: -1, open: true, close: true });
  }
  state.pos = end;
  return true;
});

md.inline.ruler2.before("fragments_join", "wechat_decoration", (state: InlineState) => {
  const process = (delimiters: Delimiter[]) => {
    for (const opening of delimiters) {
      const kind = opening.marker === underlineMarker || opening.marker === 0x2b ? "underline" : opening.marker === 0x3d ? "highlight" : undefined;
      if (!kind || opening.end < 0) continue;
      const closing = delimiters[opening.end];
      const first = state.tokens[opening.token], last = state.tokens[closing.token];
      first.type = `wechat_${kind}_open`;
      first.content = "";
      last.type = `wechat_${kind}_close`;
      last.content = "";
      // 三个关闭标记时，把原文余字放在关闭token之后，避免装饰范围扩大。
      const previous = state.tokens[closing.token - 1];
      if (previous?.type === "text" && previous.content === String.fromCharCode(opening.marker)) {
        state.tokens[closing.token - 1] = last;
        state.tokens[closing.token] = previous;
      }
    }
  };
  process(state.delimiters);
  for (const meta of state.tokens_meta) if (meta?.delimiters) process(meta.delimiters);
});

export function parseWechatInline(input: string, variables: Record<string, string>): WechatInlineToken[] {
  return (md.parseInline(input, { variables })[0]?.children ?? []) as WechatInlineToken[];
}
