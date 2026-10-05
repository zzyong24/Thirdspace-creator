import { copyRichHtml } from "../../core/clipboard";
import { setSanitizedHtml, createEl, createDiv, appendEl, appendSpan, setCssProps } from "../../core/dom";
import type { RenderContext } from "../../types";
import type { PlatformAdapter } from "../platform";
import { baseThemeId, customWechatThemeInfo, findCustomWechatTheme } from "./customTheme";
import { isBuiltInTheme } from "./wenote/themeCss";
import type { BuiltInTheme, RenderResult } from "./wenote/types";
import { makeHtmlWeChatCompatible } from "./wenote/wechatCompat";
import { renderWechatHtml } from "./wenote/wechatRenderer";

export class WechatAdapter implements PlatformAdapter {
  id = "wechat" as const;
  label = "公众号";

  render(context: RenderContext): HTMLElement {
    const result = renderWenote(context);
    const root = createEl("article");
    root.className = "noterelay-wechat noterelay-themed";
    if (result.warnings.length) {
      const warning = createEl("aside");
      warning.className = "noterelay-wechat-warning";
      warning.textContent = "文章包含本地图片，复制时会将可读取的图片一并写入。";
      root.appendChild(warning);
    }
    const preview = createDiv();
    preview.className = "noterelay-wechat-preview";
    setSanitizedHtml(preview, result.html);
    root.appendChild(preview);
    return root;
  }

  async copy(context: RenderContext): Promise<string> {
    const result = renderWenote(context);
    const wrapped = `<article class="noterelay-themed">${result.html}</article>`;
    const portableHtml = await inlineLocalImages(wrapped, context);
    const html = makeHtmlWeChatCompatible(portableHtml, { safeMode: true, stripInternalAttrs: true });
    context.signal?.throwIfAborted();
    await copyRichHtml(html, result.plainText, context.onDeliver);
    return "公众号文章已复制";
  }
}

async function inlineLocalImages(html: string, context: RenderContext): Promise<string> {
  const host = createDiv();
  setSanitizedHtml(host, html);
  for (const image of Array.from(host.querySelectorAll<HTMLImageElement>("img"))) {
    const source = image.dataset.noterelaySource;
    if (!source || /^(?:https?:|data:)/i.test(source)) {
      image.removeAttribute("data-noterelay-source");
      continue;
    }
    const dataUrl = await context.resolveImageDataUrl?.(source);
    context.signal?.throwIfAborted();
    if (!dataUrl) throw new Error(`无法读取本地图片：${source}`);
    image.src = dataUrl;
    image.removeAttribute("data-noterelay-source");
  }
  return host.innerHTML;
}

function renderWenote(context: RenderContext): RenderResult {
  const customTheme = findCustomWechatTheme(context.settings, context.theme.id);
  const theme = customTheme ? baseThemeId(customTheme.baseLayout) : resolveWenoteTheme(context.theme.id);
  const articleVariables = serializeAccountVariables(context);
  return renderWechatHtml(context.note.source, {
    defaultTheme: theme,
    lastPreviewTheme: theme,
    themeOverride: theme,
    themeInfoOverride: customTheme ? customWechatThemeInfo(customTheme) : undefined,
    bodyFontSize: customTheme?.typography.baseFontSize,
    bodyLineHeight: customTheme?.typography.lineHeight,
    accentColor: context.theme.tokens.accent,
    contentWidth: context.theme.tokens.contentWidth,
    authorName: context.account?.name ?? "",
    authorBio: context.account?.signature ?? "",
    articleVariables,
    autoSignature: true,
    autoKeywordUnderline: true,
    customCss: "",
    useCustomCss: false,
    safeMode: true,
    resolveImageSrc: context.resolveImageSrc
  });
}

function serializeAccountVariables(context: RenderContext): string {
  const account = context.account;
  const entries: Array<[string, string | undefined]> = [
    ["账号名称", account?.name],
    ["accountName", account?.name],
    ["作者名", account?.name],
    ["账号介绍", account?.signature],
    ["accountBio", account?.signature],
    ["简介", account?.signature],
    ...Object.entries(account?.variables ?? {})
  ];
  return entries
    .filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function resolveWenoteTheme(themeId: string): BuiltInTheme {
  return isBuiltInTheme(themeId) ? themeId : "moyu-green";
}
