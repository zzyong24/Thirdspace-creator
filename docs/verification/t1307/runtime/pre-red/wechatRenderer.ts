import { parseMarkdown } from "./markdownParser";
import { getThemeInfo, isBuiltInTheme, type ThemeInfo } from "./themeCss";
import type { BuiltInTheme, Frontmatter, ParsedBlock, RenderOptions, RenderResult, WeChatLayoutSettings } from "./types";

export const DEFAULT_SETTINGS: WeChatLayoutSettings = {
  defaultTheme: "moyu-green",
  accentColor: "#059669",
  contentWidth: 695,
  showCopyWarnings: true,
  customCss: "",
  useCustomCss: false,
  safeMode: true,
  lastPreviewTheme: "moyu-green",
  customCssPresets: [
    { id: "default", name: "默认样式", css: "" }
  ],
  activeCssPresetId: "default",
  authorName: "",
  authorBio: "热衷于分享 AI 观察与干货",
  footerCta: "如果你觉得今天这篇有收获，欢迎**点赞、在看、转发**三连，我们下篇见。",
  articleVariables: "",
  autoSignature: true,
  autoKeywordUnderline: true
};

interface RenderContext {
  settings: RenderOptions;
  frontmatter: Frontmatter;
  theme: BuiltInTheme;
  themeInfo: ThemeInfo;
  warnings: string[];
  sectionIndex: number;
  hasHero: boolean;
  variables: Record<string, string>;
}

export function renderWechatHtml(markdown: string, options: Partial<RenderOptions> = {}): RenderResult {
  const settings: RenderOptions = { ...DEFAULT_SETTINGS, ...options };
  const parsed = parseMarkdown(markdown);
  const theme = resolveTheme(parsed.frontmatter, settings);
  const baseThemeInfo = getThemeInfo(theme);
  const themeInfo = settings.themeInfoOverride ?? baseThemeInfo;
  const warnings: string[] = [];
  const context: RenderContext = { settings, frontmatter: parsed.frontmatter, theme, themeInfo, warnings, sectionIndex: 0, hasHero: false, variables: {} };
  context.variables = buildArticleVariables(context);
  const blocks = [...parsed.blocks];
  const parts: string[] = [];
  const explicitHero = blocks.some((block) => block.type === "callout" && block.kind === "hero");
  const firstHeading = blocks.find((block): block is Extract<ParsedBlock, { type: "heading" }> => block.type === "heading" && block.level === 1);
  const articleTitle = parsed.frontmatter.title || firstHeading?.text;
  const firstContentBlock = blocks.find((block) => !(block.type === "heading" && block.level === 1));
  const startsWithQuote = firstContentBlock?.type === "quote";
  const coverTheme = ["magazine", "ticket", "olive"].includes(themeInfo.layout);

  if (articleTitle && !explicitHero && (coverTheme || !startsWithQuote)) {
    parts.push(renderArticleHeader(articleTitle, parsed.frontmatter.subtitle, parsed.frontmatter.kicker, context));
  }

  blocks.forEach((block) => {
    parts.push(renderBlock(block, context));
  });

  if (settings.autoSignature && shouldAppendSignature(parsed.blocks)) {
    const signature = renderSignature(context);
    if (signature) { parts.push(renderEndDivider(context)); parts.push(signature); }
  }

  const shell = renderShell(parts.filter(Boolean).join("\n"), settings.contentWidth, context);
  const html = settings.themeInfoOverride ? replaceLegacyPalette(shell, baseThemeInfo, themeInfo) : shell;
  return { html, plainText: toPlainText(parsed.blocks, parsed.frontmatter, context), warnings };
}

function replaceLegacyPalette(html: string, base: ThemeInfo, custom: ThemeInfo): string {
  const replacements: Array<[string, string]> = [
    [base.accent, custom.accent], [base.light, custom.light], [base.border, custom.border], [base.title, custom.title],
    [base.text, custom.text], [base.muted, custom.muted], [base.highlight, custom.highlight], [base.deep, custom.deep],
    [base.codeBg, custom.codeBg], [base.signatureBg, custom.signatureBg]
  ];
  return replacements
    .filter(([from]) => from.toLowerCase() !== "#ffffff")
    .reduce((result, [from, to]) => result.replace(new RegExp(from, "gi"), to), html);
}

function resolveTheme(frontmatter: Frontmatter, settings: RenderOptions): BuiltInTheme {
  const rawTheme = frontmatter.theme as string | undefined;
  if (settings.themeOverride && isBuiltInTheme(settings.themeOverride)) return settings.themeOverride;
  if (isBuiltInTheme(rawTheme)) return rawTheme;
  if (rawTheme === "tech-tutorial") return "moyu-green";
  if (rawTheme === "reference-tech") return "graphite-minimal";
  if (rawTheme === "minimal-business") return "red-white";
  return settings.defaultTheme;
}

function renderBlock(block: ParsedBlock, context: RenderContext): string {
  switch (block.type) {
    case "heading":
      if (block.level === 1) {
        return "";
      }
      if (block.level === 2) return renderSectionHeading(block.text, context);
      if (block.level === 3) return renderMinorHeading(block.text, context);
      return renderMinorHeading(block.text, context);
    case "paragraph":
      return renderParagraph(block.text, context);
    case "list":
      return renderList(block.items, block.ordered, context);
    case "quote":
      return context.hasHero ? renderQuote(block.text, context, false) : renderLeadQuote(block.text, context);
    case "code":
      return renderCode(block.code, block.language || "CODE", context);
    case "image":
      return renderImage(block, context);
    case "table":
      return renderTable(block, context);
    case "rule":
      return renderDivider(context);
    case "callout":
      return renderCallout(block, context);
    default:
      return "";
  }
}

function renderCallout(block: Extract<ParsedBlock, { type: "callout" }>, context: RenderContext): string {
  const title = block.attrs.title || block.title;
  switch (block.kind) {
    case "hero":
      context.hasHero = true;
      return renderHero(block.attrs.title || block.body.split("\n")[0] || "Untitled", block.attrs.subtitle || block.body.split("\n").slice(1).join("\n") || undefined, block.attrs.kicker, context);
    case "section":
      return renderSectionHeading(block.attrs.title || block.body || title || "Section", context);
    case "step":
      return renderCard(title || block.attrs.title || "步骤", block.body, context, block.attrs.number || block.attrs.step || "步骤");
    case "command":
      return renderCode(block.body || block.attrs.command || "", block.attrs.label || title || "COMMAND", context);
    case "quote":
      return context.hasHero ? renderQuote(block.body || title || "", context, true) : renderLeadQuote(block.body || title || "", context);
    case "cta":
      return renderCta(block.body || title || "", context);
    case "figure":
      return renderFigureCallout(block, context);
    case "warning":
    case "note":
    case "tip":
    default:
      return renderCard(title || labelForCallout(block.kind), block.body, context, labelForCallout(block.kind));
  }
}

function renderShell(content: string, width: number, context: RenderContext): string {
  const theme = context.themeInfo;
  const fontSize = Math.max(14, Math.min(18, context.settings.bodyFontSize ?? 15));
  const lineHeight = Math.max(1.5, Math.min(2.2, context.settings.bodyLineHeight ?? 1.8));
  return `<section data-wenote-block="shell" data-wenote-kind="${escapeAttr(context.theme)}" style="max-width:${numberAttr(theme.maxWidth || width)}px;margin:0 auto;background:#FFFFFF;font-family:${escapeAttr(theme.fontFamily)};font-size:${fontSize}px;color:${escapeAttr(theme.text)};line-height:${lineHeight};letter-spacing:0.3px;overflow-x:hidden;">
${content}
</section>`;
}

function renderArticleHeader(title: string, subtitle: string | undefined, kicker: string | undefined, context: RenderContext): string {
  const theme = context.themeInfo;
  const label = kicker || theme.label;
  const author = context.frontmatter.author || context.settings.authorName || "";
  const meta = [author, theme.label].filter(Boolean).join(" · ");
  if (theme.layout === "magazine") {
    const column = kicker || variableOrPlaceholder(context, "栏目名");
    const date = variableOrPlaceholder(context, "日期");
    const summary = subtitle || variableOrPlaceholder(context, "副标题");
    return `<section data-wenote-block="hero" data-wenote-kind="magazine" style="margin:0 0 32px;background:#FFFFFF;border:1.5px solid rgba(5,150,105,.15);border-radius:20px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.06);width:100%;box-sizing:border-box;">
  <section style="padding:32px 28px 28px;">
    <section style="display:flex;align-items:center;margin-bottom:28px;"><span style="width:6px;height:6px;background:#059669;border-radius:50%;margin-right:8px;">${leafBreak()}</span><span style="font-size:11px;font-weight:700;letter-spacing:3px;color:#059669;">${leaf(column)}</span><span style="flex:1;height:1px;background:linear-gradient(to right,rgba(5,150,105,.12),transparent);margin:0 8px;">${leafBreak()}</span><span style="font-size:10px;color:#D1D5DB;font-weight:600;">${leaf(date)}</span></section>
    <p style="font-size:15px;color:#D1D5DB;margin:0 0 6px;text-decoration:line-through;letter-spacing:.5px;">${leaf(summary)}</p>
    <h1 style="font-size:26px;font-weight:900;color:#111827;margin:0;line-height:1.1;letter-spacing:-1.5px;">${leaf(replaceArticleVariables(title, context))}</h1>
    <section style="width:48px;height:3px;background:linear-gradient(to right,#059669,#34D399);border-radius:2px;margin:16px 0 12px;">${leafBreak()}</section>
    <p style="font-size:13px;color:#9CA3AF;margin:0;line-height:1.7;letter-spacing:.5px;">${leaf(variableOrPlaceholder(context, "关键词"))}</p>
  </section>
  <section style="background:linear-gradient(135deg,#059669,#10B981);padding:12px 28px;display:flex;align-items:center;justify-content:space-between;"><p style="font-size:12px;color:rgba(255,255,255,.9);margin:0;font-weight:600;">${leaf(author || variableOrPlaceholder(context, "账号名称"))}</p><span style="background:rgba(255,255,255,.2);padding:1px 7px;border-radius:3px;font-size:8px;color:#FFFFFF;font-weight:600;">${leaf(variableOrPlaceholder(context, "标签"))}</span></section>
</section>`;
  }
  if (theme.layout === "ticket") {
    const issue = variableOrPlaceholder(context, "票号");
    const summary = subtitle || variableOrPlaceholder(context, "副标题");
    return `<section data-wenote-block="hero" data-wenote-kind="ticket" style="background:#FFFEF8;border:2px solid #1A1A1A;box-shadow:4px 4px 0 #1A1A1A;margin:0 4px 32px;box-sizing:border-box;overflow:hidden;">
  <section style="background:#059669;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;"><span style="color:#FFFEF8;font-size:11px;letter-spacing:4px;font-weight:600;">${leaf(kicker || "AGENT ERA NOTE")}</span><span style="color:#FFFEF8;font-size:11px;letter-spacing:2px;">${leaf("★★★★★")}</span></section>
  <section style="display:flex;"><section style="flex:1;padding:24px 20px;border-right:2px dashed #A7F3D0;min-width:0;"><h1 style="font-size:24px;font-weight:900;color:#1A1A1A;letter-spacing:.5px;margin:0 0 5px;line-height:1.2;">${leaf(replaceArticleVariables(title, context))}</h1><p style="font-size:14px;color:#666;letter-spacing:1px;margin:0 0 20px;">${inlineMarkdown(summary, context)}</p><section style="border-top:1px dashed #A7F3D0;margin-bottom:16px;">${leafBreak()}</section><p style="font-size:15px;color:#1A1A1A;font-weight:700;margin:0 0 3px;">${leaf(author || variableOrPlaceholder(context, "账号名称"))}</p><p style="font-size:12px;color:#888;margin:0;">${leaf(context.settings.authorBio || variableOrPlaceholder(context, "账号介绍"))}</p></section><section style="width:48px;padding:14px 4px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;background:#F0FDF4;box-sizing:border-box;"><section style="text-align:center;"><p style="font-size:7px;color:#999;margin:0;">${leaf("NO.")}</p><p style="font-size:15px;font-weight:900;color:#059669;margin:0;">${leaf(issue)}</p></section><p style="font-size:9px;color:#888;letter-spacing:1px;margin:16px 0;">${leaf(variableOrPlaceholder(context, "票据分类"))}</p><section style="text-align:center;"><p style="font-size:7px;color:#999;margin:0;">${leaf("GRADE")}</p><p style="font-size:14px;font-weight:900;color:#059669;margin:0;">${leaf(variableOrPlaceholder(context, "评级"))}</p></section></section></section>
  <section style="display:flex;align-items:center;padding:0 8px;"><span style="flex:1;border-top:2px dashed #A7F3D0;">${leafBreak()}</span><span style="padding:0 8px;font-size:10px;color:#A7F3D0;">${leaf("✂")}</span><span style="flex:1;border-top:2px dashed #A7F3D0;">${leafBreak()}</span></section>
  <section style="padding:10px 20px;display:flex;justify-content:space-between;"><span style="font-size:10px;color:#999;letter-spacing:1px;">${leaf("VALID FOR ONE READ")}</span><span style="font-size:10px;color:#999;letter-spacing:1px;">${leaf("ADMIT ONE 🎫")}</span></section>
</section>`;
  }
  if (theme.layout === "olive") {
    const issue = variableOrPlaceholder(context, "期号");
    const summary = subtitle || variableOrPlaceholder(context, "副标题");
    return `<section data-wenote-block="hero" data-wenote-kind="olive" style="background:#FDFDF8;border:1px solid #BFC1B7;border-radius:6px;overflow:hidden;margin:0 0 32px;box-sizing:border-box;">
  <section style="padding:28px 24px 22px;"><section style="display:flex;align-items:center;margin-bottom:22px;"><span style="width:8px;height:8px;background:#1E1F23;border-radius:50%;margin-right:8px;">${leafBreak()}</span><span style="font-size:10px;font-weight:700;letter-spacing:3px;color:#65675E;">${leaf(kicker || "橄榄手记 · 编辑部观察")}</span><span style="flex:1;height:1px;background:#BFC1B7;margin:0 8px;">${leafBreak()}</span><span style="font-size:10px;color:#9EA096;font-weight:500;">${leaf(`ISSUE ${issue}`)}</span></section>
  <section style="display:flex;align-items:stretch;"><section style="flex:1;min-width:0;margin-right:18px;"><h1 style="font-size:24px;font-weight:800;color:#23251D;margin:0 0 10px;line-height:1.15;letter-spacing:-.75px;">${leaf(replaceArticleVariables(title, context))}</h1><section style="display:flex;align-items:center;margin-bottom:12px;"><span style="width:22px;height:3px;background:#1E1F23;border-radius:2px;margin-right:4px;">${leafBreak()}</span><span style="width:8px;height:3px;background:#BFC1B7;border-radius:2px;">${leafBreak()}</span></section><p style="font-size:13px;color:#65675E;margin:0;line-height:1.7;">${inlineMarkdown(summary, context)}</p></section><section style="flex-shrink:0;width:96px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#EEEFE9;border:1px dashed #BFC1B7;border-radius:6px;padding:8px;box-sizing:border-box;"><span style="font-size:34px;color:#4D4F46;">${leaf("◉")}</span><span style="font-size:8px;font-weight:700;color:#9EA096;letter-spacing:1px;margin-top:4px;">${leaf("DOODLE")}</span></section></section></section>
  <section style="background:#1E1F23;padding:11px 24px;display:flex;align-items:center;justify-content:space-between;"><p style="font-size:12px;color:rgba(255,255,255,.92);margin:0;font-weight:600;">${leaf(variableOrPlaceholder(context, "封面导语"))}</p><span style="background:#E5E7E0;color:#23251D;padding:3px 8px;border-radius:4px;font-size:8px;font-weight:700;">${leaf(variableOrPlaceholder(context, "标签"))}</span></section>
</section>`;
  }
  if (theme.layout === "zen") {
    return `<section data-wenote-block="hero" data-wenote-kind="zen" style="margin:14px 18px 54px;padding:34px 12px 30px;border-top:1px solid ${escapeAttr(theme.border)};border-bottom:1px solid ${escapeAttr(theme.border)};text-align:center;">
  <p style="margin:0 0 18px;font-size:11px;color:${escapeAttr(theme.muted)};letter-spacing:4px;">${leaf(kicker || label)}</p>
  <h1 style="margin:0;font-family:${escapeAttr(theme.fontFamily)};font-size:28px;line-height:1.5;color:${escapeAttr(theme.title)};font-weight:700;letter-spacing:1px;">${leaf(replaceArticleVariables(title, context))}</h1>
  ${subtitle ? `<p style="margin:20px auto 0;max-width:540px;font-size:15px;line-height:2;color:${escapeAttr(theme.text)};">${inlineMarkdown(subtitle, context)}</p>` : ""}
</section>`;
  }
  if (theme.layout === "red-editorial") {
    return `<section data-wenote-block="hero" data-wenote-kind="red-editorial" style="margin:0 10px 38px;padding:26px 22px 24px;background:#FFFFFF;border-left:6px solid ${escapeAttr(theme.accent)};border-top:1px solid ${escapeAttr(theme.border)};border-bottom:1px solid ${escapeAttr(theme.border)};box-sizing:border-box;">
  <p style="margin:0 0 12px;font-size:11px;color:${escapeAttr(theme.accent)};font-weight:900;letter-spacing:2px;">${leaf(kicker || label)}</p>
  <h1 style="margin:0;font-size:29px;line-height:1.3;color:#1C1917;font-weight:950;">${leaf(replaceArticleVariables(title, context))}</h1>
  ${subtitle ? `<p style="margin:16px 0 0;font-size:15px;line-height:1.8;color:${escapeAttr(theme.text)};">${inlineMarkdown(subtitle, context)}</p>` : ""}
  ${author ? `<p style="margin:18px 0 0;color:${escapeAttr(theme.muted)};font-size:12px;">${leaf(`—— ${author}`)}</p>` : ""}
</section>`;
  }
  if (theme.layout === "graphite") {
    return `<section data-wenote-block="hero" data-wenote-kind="graphite" style="margin:10px 10px 42px;padding:30px 22px 26px;background:#FFFFFF;border-top:1px solid ${escapeAttr(theme.border)};border-bottom:1px solid ${escapeAttr(theme.border)};box-sizing:border-box;">
  <p style="margin:0 0 16px;font-size:10px;color:${escapeAttr(theme.muted)};letter-spacing:3px;">${leaf(kicker || label)}</p>
  <h1 style="margin:0;font-size:30px;line-height:1.3;color:${escapeAttr(theme.title)};font-weight:900;letter-spacing:-.5px;">${leaf(replaceArticleVariables(title, context))}</h1>
  ${subtitle ? `<p style="margin:18px 0 0;font-size:15px;line-height:1.9;color:${escapeAttr(theme.text)};">${inlineMarkdown(subtitle, context)}</p>` : ""}
</section>`;
  }
  return `<section data-wenote-block="hero" data-wenote-kind="${escapeAttr(context.theme)}" style="margin:0 10px 32px;padding:28px 22px 24px;border:1px solid ${escapeAttr(theme.border)};border-top:6px solid ${escapeAttr(theme.deep)};background:linear-gradient(135deg,${escapeAttr(theme.light)} 0%,#FFFFFF 54%,#FFFFFF 100%);border-radius:22px;box-sizing:border-box;overflow:hidden;">
  <section style="margin:0 0 18px;">
    <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#FFFFFF;border:1px solid ${escapeAttr(theme.border)};font-size:11px;line-height:1.4;color:${escapeAttr(theme.accent)};font-weight:800;letter-spacing:1.5px;">${leaf(label)}</span>
  </section>
  <h1 style="margin:0;font-size:30px;line-height:1.25;color:${escapeAttr(theme.title)};font-weight:900;letter-spacing:-0.5px;">${leaf(replaceArticleVariables(title, context))}</h1>
  ${subtitle ? `<p style="margin:16px 0 0;font-size:15px;line-height:1.8;color:${escapeAttr(theme.text)};font-weight:600;">${leaf(replaceArticleVariables(subtitle, context))}</p>` : ""}
  ${meta ? `<p style="margin:20px 0 0;padding-top:14px;border-top:1px solid ${escapeAttr(theme.border)};font-size:12px;line-height:1.6;color:${escapeAttr(theme.muted)};letter-spacing:0.8px;">${leaf(meta)}</p>` : ""}
</section>`;
}

function renderHero(title: string, subtitle: string | undefined, kicker: string | undefined, context: RenderContext): string {
  const theme = context.themeInfo;
  const label = kicker || theme.label;
  return `<section data-wenote-block="hero" data-wenote-kind="${escapeAttr(context.theme)}" style="margin:0 0 26px;padding:34px 22px 30px;background:${escapeAttr(theme.light)};border:1px solid ${escapeAttr(theme.border)};border-radius:0 0 24px 24px;box-sizing:border-box;text-align:center;">
  <p style="margin:0 0 12px;font-size:12px;line-height:1.4;color:${escapeAttr(theme.accent)};font-weight:800;letter-spacing:2px;">${leaf(label)}</p>
  <h1 style="margin:0 auto;max-width:620px;font-size:32px;line-height:1.25;color:${escapeAttr(theme.title)};font-weight:900;letter-spacing:-.4px;">${leaf(title)}</h1>
  ${subtitle ? `<p style="margin:16px auto 0;max-width:560px;font-size:16px;line-height:1.8;color:${escapeAttr(theme.muted)};font-weight:600;">${inlineMarkdown(subtitle, context)}</p>` : ""}
</section>`;
}

function renderLeadQuote(text: string, context: RenderContext): string {
  context.hasHero = true;
  const theme = context.themeInfo;
  if (theme.layout === "zen") {
    return `<section data-wenote-block="quote" data-wenote-kind="lead" style="margin:16px 22px 44px;padding:30px 8px;text-align:center;">
  <p style="font-family:${escapeAttr(theme.fontFamily)};font-size:18px;font-weight:600;color:${escapeAttr(theme.title)};margin:0;line-height:2;letter-spacing:.5px;">${inlineMarkdown(text, context)}</p>
</section>`;
  }
  if (theme.layout === "magazine" || theme.layout === "ticket" || theme.layout === "olive") {
    return `<section data-wenote-block="quote" data-wenote-kind="lead" style="margin:0 10px 38px;padding:20px 20px;background:${escapeAttr(theme.light)};border-left:5px solid ${escapeAttr(theme.accent)};box-sizing:border-box;">
  <p style="font-size:17px;font-weight:800;color:${escapeAttr(theme.title)};margin:0;line-height:1.8;">${inlineMarkdown(text, context)}</p>
</section>`;
  }
  return `<section data-wenote-block="quote" data-wenote-kind="lead" style="margin:10px 10px 40px;padding:32px 24px;border-top:1px solid ${escapeAttr(theme.border)};border-bottom:1px solid ${escapeAttr(theme.border)};background:#FFFFFF;">
  <p style="font-size:18px;font-weight:700;color:${escapeAttr(theme.title)};margin:0;line-height:1.7;letter-spacing:0.5px;">${inlineMarkdown(text, context)}</p>
</section>`;
}

function renderSectionHeading(text: string, context: RenderContext): string {
  context.sectionIndex += 1;
  const theme = context.themeInfo;
  const number = String(context.sectionIndex).padStart(2, "0");
  const marginTop = context.sectionIndex === 1 ? 16 : 56;
  if (theme.layout === "magazine") {
    return `<section data-wenote-block="section" data-wenote-kind="magazine" style="margin:${marginTop}px 10px 28px;padding:0;">
  <section style="display:flex;align-items:flex-end;border-bottom:3px solid ${escapeAttr(theme.deep)};padding-bottom:12px;"><span style="font-size:34px;line-height:1;color:${escapeAttr(theme.accent)};font-weight:950;margin-right:12px;">${leaf(number)}</span><h3 style="font-size:20px;color:${escapeAttr(theme.title)};font-weight:900;margin:0;line-height:1.4;">${inlineMarkdown(text, context)}</h3></section>
</section>`;
  }
  if (theme.layout === "red-editorial") {
    return `<section data-wenote-block="section" data-wenote-kind="red-editorial" style="margin:${marginTop}px 10px 30px;padding:0;">
  <section style="display:flex;align-items:center;margin-bottom:12px;"><span style="display:inline-block;background:${escapeAttr(theme.accent)};color:#FFFFFF;font-size:13px;font-weight:900;padding:3px 10px;margin-right:12px;">${leaf(number)}</span><h3 style="font-size:21px;color:#1C1917;font-weight:900;margin:0;line-height:1.4;">${inlineMarkdown(text, context)}</h3></section><section style="height:2px;background:linear-gradient(to right,${escapeAttr(theme.accent)},#FECACA,transparent);">${leafBreak()}</section>
</section>`;
  }
  if (theme.layout === "zen") {
    return `<section data-wenote-block="section" data-wenote-kind="zen" style="margin:${marginTop + 10}px 18px 34px;text-align:center;">
  <p style="margin:0 0 12px;font-size:11px;color:${escapeAttr(theme.accent)};letter-spacing:3px;">${leaf(number)}</p><h3 style="font-family:${escapeAttr(theme.fontFamily)};font-size:22px;color:${escapeAttr(theme.title)};font-weight:700;margin:0 0 16px;line-height:1.5;">${inlineMarkdown(text, context)}</h3><section style="width:42px;height:1px;background:${escapeAttr(theme.border)};margin:0 auto;">${leafBreak()}</section>
</section>`;
  }
  if (theme.layout === "ticket") {
    return `<section data-wenote-block="section" data-wenote-kind="ticket" style="margin:${marginTop}px 12px 30px;padding:17px 18px;background:#FFFEF8;border:2px solid ${escapeAttr(theme.title)};box-shadow:5px 5px 0 ${escapeAttr(theme.border)};">
  <p style="margin:0 0 7px;font-size:12px;color:${escapeAttr(theme.accent)};font-weight:900;letter-spacing:2px;">${leaf(number)}</p><h3 style="font-size:20px;color:${escapeAttr(theme.title)};font-weight:950;margin:0;line-height:1.4;">${inlineMarkdown(text, context)}</h3>
</section>`;
  }
  if (theme.layout === "olive") {
    return `<section data-wenote-block="section" data-wenote-kind="olive" style="margin:${marginTop}px 10px 30px;padding:0 2px 14px;border-bottom:1px solid ${escapeAttr(theme.border)};">
  <section style="display:flex;align-items:center;margin-bottom:7px;"><span style="font-size:28px;color:${escapeAttr(theme.accent)};font-weight:900;margin-right:10px;">${leaf(number)}</span><span style="width:28px;height:2px;background:#ED7B2F;">${leafBreak()}</span></section><h3 style="font-size:20px;font-weight:800;color:${escapeAttr(theme.title)};margin:0;line-height:1.4;">${inlineMarkdown(text, context)}</h3>
</section>`;
  }
  return `<section data-wenote-block="section" data-wenote-kind="heading" style="margin-top:${marginTop}px;margin-bottom:32px;padding:0 10px;">
  <section style="position:relative;padding-bottom:20px;border-bottom:1px solid ${escapeAttr(theme.border)};">
    <p style="font-size:48px;font-weight:900;color:${escapeAttr(theme.border)};margin:0;line-height:1;letter-spacing:-2px;">${leaf(number)}</p>
    <section style="margin-top:-8px;">
      <h3 style="font-size:20px;font-weight:800;color:${escapeAttr(theme.title)};margin:0;letter-spacing:0.5px;line-height:1.4;">${inlineMarkdown(text, context)}</h3>
    </section>
  </section>
</section>`;
}

function renderMinorHeading(text: string, context: RenderContext): string {
  const theme = context.themeInfo;
  const borderWidth = theme.layout === "zen" ? 2 : theme.layout === "ticket" ? 4 : 3;
  const margin = theme.layout === "zen" ? "34px 22px 16px" : theme.layout === "olive" ? "30px 10px 14px" : "28px 10px 14px";
  return `<p data-wenote-block="minor-heading" style="font-size:${theme.layout === "magazine" || theme.layout === "ticket" || theme.layout === "olive" ? 14 : 15}px;font-weight:800;color:${escapeAttr(theme.title)};margin:${margin};padding-left:12px;border-left:${borderWidth}px solid ${escapeAttr(theme.accent)};line-height:1.5;">${inlineMarkdown(text, context)}</p>`;
}

function renderParagraph(text: string, context: RenderContext): string {
  const theme = context.themeInfo;
  const content = context.settings.autoKeywordUnderline ? underlineKeywordIfPlain(text) : text;
  const styles: Record<ThemeInfo["layout"], string> = {
    magazine: "margin:0 20px 20px;font-size:14px;line-height:1.9;text-align:justify;letter-spacing:.2px;",
    "red-editorial": "margin:0 10px 24px;font-size:15px;line-height:1.85;text-align:justify;letter-spacing:.25px;",
    graphite: "margin:0 10px 26px;font-size:15px;line-height:1.9;text-align:justify;letter-spacing:.3px;",
    zen: "margin:0 22px 28px;font-size:15px;line-height:2;text-align:justify;letter-spacing:.45px;",
    ticket: "margin:0 20px 20px;font-size:14px;line-height:1.9;text-align:justify;letter-spacing:.15px;",
    olive: "margin:0 10px 21px;font-size:14px;line-height:1.9;text-align:justify;letter-spacing:.2px;"
  };
  return `<p data-wenote-block="paragraph" style="${styles[theme.layout]}color:${escapeAttr(theme.text)};">${inlineMarkdown(content, context).replace(/\n/g, "<br>")}</p>`;
}

function renderList(items: Array<{ text: string; html?: string; checked?: boolean }>, ordered: boolean, context: RenderContext): string {
  const theme = context.themeInfo;
  const rows = items.map((item, index) => {
    const marker = typeof item.checked === "boolean" ? (item.checked ? "✓" : "") : ordered ? String(index + 1) : "•";
    const text = item.checked ? `~~${item.text}~~` : item.text;
    if (theme.layout === "olive") return `<section data-wenote-block="list-item" style="display:flex;align-items:flex-start;margin:0 0 13px;"><span style="width:7px;height:7px;border-radius:50%;background:${index % 2 ? "#ED7B2F" : "#1E1F23"};margin:10px 12px 0 0;flex-shrink:0;">${leafBreak()}</span><p style="font-size:14px;color:${escapeAttr(theme.text)};margin:0;line-height:1.9;flex:1;">${inlineMarkdown(text, context)}</p></section>`;
    if (theme.layout === "zen") return `<section data-wenote-block="list-item" style="display:flex;align-items:flex-start;padding:${index === 0 ? 0 : 15}px 0 15px;border-bottom:1px solid ${escapeAttr(theme.border)};"><span style="font-size:11px;color:${escapeAttr(theme.accent)};letter-spacing:1px;margin:5px 16px 0 0;">${leaf(ordered ? String(index + 1).padStart(2, "0") : "—")}</span><p style="font-size:15px;color:${escapeAttr(theme.text)};margin:0;line-height:1.9;flex:1;">${inlineMarkdown(text, context)}</p></section>`;
    if (theme.layout === "ticket") return `<section data-wenote-block="list-item" style="display:flex;align-items:flex-start;padding:12px 0;border-bottom:${index === items.length - 1 ? 0 : "1px dashed #A7F3D0"};"><span leaf="" style="display:inline-block;width:24px;height:24px;line-height:24px;background:#059669;color:#FFFEF8;text-align:center;font-size:11px;font-weight:900;margin-right:10px;flex-shrink:0;">${escapeHtml(marker)}</span><p style="font-size:14px;color:${escapeAttr(theme.text)};margin:0;line-height:1.9;flex:1;">${inlineMarkdown(text, context)}</p></section>`;
    const markerStyle = theme.layout === "red-editorial" ? `background:#DC2626;color:#FFFFFF;border-radius:50%;` : theme.layout === "magazine" ? `background:#ECFDF5;color:#059669;border-radius:999px;` : `background:#FAFAFA;color:#52525B;border:1px solid #E4E4E7;border-radius:50%;`;
    return `<section data-wenote-block="list-item" style="display:flex;align-items:flex-start;margin:0 0 12px;"><span leaf="" style="display:inline-block;width:22px;height:22px;line-height:22px;${markerStyle}text-align:center;font-size:11px;font-weight:800;margin-right:10px;flex-shrink:0;">${escapeHtml(marker)}</span><p style="font-size:${theme.layout === "magazine" ? 14 : 15}px;color:${escapeAttr(theme.text)};margin:0;line-height:1.85;flex:1;">${inlineMarkdown(text, context)}</p></section>`;
  }).join("");
  if (theme.layout === "ticket") {
    return `<section data-wenote-block="list" data-wenote-kind="${ordered ? "ordered" : "unordered"}" style="margin:0 20px 26px;padding:4px 16px;background:#FFFEF8;border-left:1px dashed #059669;border-right:1px dashed #059669;">${rows}</section>`;
  }
  if (theme.layout === "zen") {
    return `<section data-wenote-block="list" data-wenote-kind="${ordered ? "ordered" : "unordered"}" style="margin:0 22px 34px;padding:0;border-top:1px solid ${escapeAttr(theme.border)};">${rows}</section>`;
  }
  if (theme.layout === "olive") {
    return `<section data-wenote-block="list" data-wenote-kind="${ordered ? "ordered" : "unordered"}" style="margin:0 10px 26px;padding:18px 20px;background:#FDFDF8;border:1px solid #BFC1B7;border-radius:6px;">${rows}</section>`;
  }
  return `<section data-wenote-block="list" data-wenote-kind="${ordered ? "ordered" : "unordered"}" style="margin:0 ${theme.layout === "magazine" ? 20 : 10}px 26px;padding:18px 20px;background:${escapeAttr(theme.light)};border-top:1px solid ${escapeAttr(theme.border)};">
  ${rows}
</section>`;
}

function renderTable(block: Extract<ParsedBlock, { type: "table" }>, context: RenderContext): string {
  const theme = context.themeInfo;
  const headers = block.headers.map((header) => `<th style="padding:10px 10px;text-align:left;font-size:13px;line-height:1.5;color:${escapeAttr(theme.title)};background:${escapeAttr(theme.light)};border:1px solid ${escapeAttr(theme.border)};font-weight:850;word-break:break-word;overflow-wrap:anywhere;box-sizing:border-box;">${inlineMarkdown(header, context)}</th>`).join("");
  const rows = block.rows.map((row) => `<tr>${row.map((cell) => `<td style="padding:10px 10px;font-size:13px;line-height:1.65;color:${escapeAttr(theme.text)};border:1px solid ${escapeAttr(theme.border)};word-break:break-word;overflow-wrap:anywhere;box-sizing:border-box;">${inlineMarkdown(cell, context)}</td>`).join("")}</tr>`).join("");
  return `<section data-wenote-block="table" style="margin:20px 16px;box-sizing:border-box;overflow:visible;">
  <table style="width:100%;max-width:100%;border-collapse:collapse;border-spacing:0;table-layout:fixed;word-break:break-word;overflow-wrap:anywhere;box-sizing:border-box;">
    <thead><tr>${headers}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

function renderQuote(text: string, context: RenderContext, prominent = false): string {
  const theme = context.themeInfo;
  if (theme.layout === "magazine") return `<section data-wenote-block="quote" data-wenote-kind="${prominent ? "prominent" : "normal"}" style="margin:0 20px 26px;padding:18px 20px;background:#F9FAFB;border:1px dashed #D1D5DB;border-radius:10px;"><p style="font-size:14px;font-weight:700;color:#374151;margin:0;line-height:1.9;">${inlineMarkdown(text, context)}</p></section>`;
  if (theme.layout === "red-editorial") return `<section data-wenote-block="quote" data-wenote-kind="${prominent ? "prominent" : "normal"}" style="margin:0 10px 28px;padding:18px 20px;background:#FEF2F2;border-left:4px solid #DC2626;"><p style="font-size:15px;font-weight:700;color:#1C1917;margin:0;line-height:1.8;">${inlineMarkdown(text, context)}</p></section>`;
  if (theme.layout === "zen") return `<section data-wenote-block="quote" data-wenote-kind="${prominent ? "prominent" : "normal"}" style="margin:8px 22px 38px;padding:28px 12px;border-top:1px solid #E8E8E8;border-bottom:1px solid #E8E8E8;text-align:center;"><p style="font-family:Georgia,serif;font-size:18px;color:#2B2B2B;margin:0;line-height:2;letter-spacing:.5px;">${inlineMarkdown(text, context)}</p></section>`;
  if (theme.layout === "ticket") return `<section data-wenote-block="quote" data-wenote-kind="${prominent ? "prominent" : "normal"}" style="margin:0 20px 28px;padding:18px;background:#F0FDF4;border:1px solid #A7F3D0;"><p style="font-size:14px;font-weight:800;color:#1A1A1A;margin:0;line-height:1.9;">${inlineMarkdown(text, context)}</p></section>`;
  if (theme.layout === "olive") return `<section data-wenote-block="quote" data-wenote-kind="${prominent ? "prominent" : "normal"}" style="margin:0 10px 28px;background:#EEEFE9;border-radius:5px;overflow:hidden;"><p style="margin:0;padding:7px 16px;background:#1E1F23;color:#FFFFFF;font-size:11px;font-weight:700;letter-spacing:1px;">${leaf("编者按")}</p><p style="font-size:14px;color:#4D4F46;margin:0;padding:16px 18px;line-height:1.9;">${inlineMarkdown(text, context)}</p></section>`;
  return `<section data-wenote-block="quote" data-wenote-kind="${prominent ? "prominent" : "normal"}" style="border-left:3px solid ${escapeAttr(theme.accent)};padding:16px 0 16px 24px;margin:0 10px 28px;">
  <p style="font-size:${prominent ? 16 : 15}px;font-weight:${prominent ? 700 : 600};color:${escapeAttr(theme.title)};margin:0;line-height:1.7;letter-spacing:0.5px;">${inlineMarkdown(text, context)}</p>
</section>`;
}

function renderCard(title: string, body: string, context: RenderContext, label: string): string {
  const theme = context.themeInfo;
  if (theme.layout === "ticket") {
    return `<section data-wenote-block="tip" style="margin:0 12px 26px;padding:16px 18px;background:#FFFEF8;border:2px solid ${escapeAttr(theme.title)};box-shadow:4px 4px 0 ${escapeAttr(theme.border)};"><p style="margin:0 0 7px;font-size:11px;color:${escapeAttr(theme.accent)};font-weight:900;letter-spacing:2px;">${leaf(label)}</p><p style="margin:0;font-size:14px;line-height:1.8;color:${escapeAttr(theme.text)};font-weight:700;">${inlineMarkdown(body || title, context).replace(/\n/g, "<br>")}</p></section>`;
  }
  if (theme.layout === "olive") {
    return `<section data-wenote-block="tip" style="margin:0 10px 26px;padding:15px 18px;background:#EEEFE9;border-left:4px solid ${escapeAttr(theme.accent)};"><p style="margin:0 0 7px;font-size:10px;color:${escapeAttr(theme.accent)};font-weight:800;letter-spacing:2px;">${leaf(label)}</p><p style="margin:0;font-size:14px;line-height:1.8;color:${escapeAttr(theme.text)};font-weight:700;">${inlineMarkdown(body || title, context).replace(/\n/g, "<br>")}</p></section>`;
  }
  if (theme.layout === "zen") {
    return `<section data-wenote-block="tip" style="margin:0 22px 30px;padding:16px 0 16px 20px;border-left:2px solid ${escapeAttr(theme.border)};"><p style="margin:0 0 7px;font-size:10px;color:${escapeAttr(theme.muted)};letter-spacing:3px;">${leaf(label)}</p><p style="margin:0;font-family:${escapeAttr(theme.fontFamily)};font-size:14px;line-height:2;color:${escapeAttr(theme.text)};">${inlineMarkdown(body || title, context).replace(/\n/g, "<br>")}</p></section>`;
  }
  return `<section data-wenote-block="tip" style="border-left:3px solid ${escapeAttr(theme.deep)};padding:14px 0 14px 22px;margin:0 10px 24px;">
  <p style="font-size:11px;color:${escapeAttr(theme.muted)};margin:0 0 ${body ? 8 : 0}px;letter-spacing:2px;font-weight:500;">${leaf(label)}</p>
  <p style="font-size:14px;font-weight:700;color:${escapeAttr(theme.title)};margin:0;line-height:1.8;">${inlineMarkdown(body || title, context).replace(/\n/g, "<br>")}</p>
</section>`;
}

function renderCode(code: string, label: string, context: RenderContext): string {
  const theme = context.themeInfo;
  const lines = code.split("\n").map((line) => `<p style="margin:0;font-size:13px;line-height:1.65;color:#E5E7EB;font-family:SFMono-Regular,Consolas,Liberation Mono,monospace;word-break:break-word;overflow-wrap:anywhere;">${leaf(line.replace(/^ +/, (spaces) => "　".repeat(spaces.length)))}</p>`).join("");
  return `<section data-wenote-block="command" style="margin:18px 16px;background:${escapeAttr(theme.codeBg)};border-radius:18px;overflow:visible;box-sizing:border-box;">
  <section style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.12);box-sizing:border-box;">
    <span leaf="" style="font-size:11px;line-height:1;color:${escapeAttr(theme.border)};font-weight:900;letter-spacing:2px;">${escapeHtml(label || "CODE")}</span>
  </section>
  <section style="margin:0;padding:14px 16px;box-sizing:border-box;">${lines || `<p style="margin:0;">${leaf("")}</p>`}</section>
</section>`;
}

function renderImage(block: Extract<ParsedBlock, { type: "image" }>, context: RenderContext): string {
  const src = context.settings.resolveImageSrc ? context.settings.resolveImageSrc(block.src) : block.src;
  if (!/^https?:\/\//.test(block.src) && !block.src.startsWith("data:") && !src.startsWith("data:")) {
    context.warnings.push(`Local image kept as a local reference: ${block.src}`);
  }
  const isGif = /\.gif(?:[?#].*)?$/i.test(block.src);
  const margin = block.caption ? "0 10px 8px" : "0 10px 28px";
  return `<section data-wenote-block="image" style="border:1px solid ${escapeAttr(context.themeInfo.border)};padding:4px;margin:${margin};">
  <section style="margin:0;overflow:hidden;">
    <span leaf=""><img src="${escapeAttr(src)}" data-noterelay-source="${escapeAttr(block.src)}" style="max-width:100%;height:auto;display:block;margin:0 auto;"></span>
  </section>
  ${isGif ? `<p style="margin:8px 0 0;text-align:center;">${leaf("GIF 动图", `display:inline-block;padding:2px 8px;border-radius:999px;background:${context.themeInfo.light};color:${context.themeInfo.accent};font-size:12px;font-weight:800;`)}</p>` : ""}
  </section>
${block.caption ? `<p style="font-size:12px;color:${escapeAttr(context.themeInfo.muted)};text-align:center;margin:0 10px 28px;letter-spacing:0.5px;">${leaf(`— ${block.caption}`)}</p>` : ""}`;
}

function renderFigureCallout(block: Extract<ParsedBlock, { type: "callout" }>, context: RenderContext): string {
  const src = block.attrs.src;
  if (!src) return renderCard(block.attrs.title || "Figure", block.body, context, "FIGURE");
  return renderImage({ type: "image", src, alt: block.attrs.alt || block.attrs.title || "figure", caption: block.attrs.caption || block.body }, context);
}

function renderCta(text: string, context: RenderContext): string {
  const theme = context.themeInfo;
  return `<section data-wenote-block="cta" style="border-left:3px solid ${escapeAttr(theme.deep)};padding:14px 0 14px 22px;margin:0 10px 24px;">
  <p style="font-size:14px;font-weight:700;color:${escapeAttr(theme.title)};margin:0;line-height:1.8;">${inlineMarkdown(text, context)}</p>
</section>`;
}

function renderDivider(context: RenderContext): string {
  const theme = context.themeInfo;
  return `<section data-wenote-block="rule" style="padding:0 10px;">
  <section style="height:1px;background:${escapeAttr(theme.border)};margin:0;">${leafBreak()}</section>
</section>`;
}

function renderEndDivider(context: RenderContext): string {
  const theme = context.themeInfo;
  return `<section data-wenote-block="rule" data-wenote-kind="end" style="padding:0 10px;">
  <section style="text-align:center;margin:0 0 36px;">
    <section style="display:flex;align-items:center;justify-content:center;">
      <span style="height:1px;width:48px;background:${escapeAttr(theme.border)};margin-right:16px;">${leafBreak()}</span>
      <span style="font-size:10px;color:${escapeAttr(theme.muted)};letter-spacing:4px;font-weight:500;">${leaf("END")}</span>
      <span style="height:1px;width:48px;background:${escapeAttr(theme.border)};margin-left:16px;">${leafBreak()}</span>
    </section>
  </section>
</section>`;
}

function renderSignature(context: RenderContext): string {
  const theme = context.themeInfo;
  const author = context.frontmatter.author || context.settings.authorName || "{{作者名}}";
  const bio = context.frontmatter.bio || context.settings.authorBio || "{{简介}}";
  // SEMANTIC_BOUNDARY_ALLOW: 只核对模板变量是否完整解析，不猜测作者身份或改写正文。
  const resolvedAuthor = replaceArticleVariables(author, context).trim();
  const resolvedBio = replaceArticleVariables(bio, context).trim();
  if (!resolvedAuthor || !resolvedBio || /\{\{[^{}]*\}\}/.test(resolvedAuthor) || /\{\{[^{}]*\}\}/.test(resolvedBio)) return "";
  const sentence = `我是 ${author}，${bio}${/[。！？.!?]$/.test(bio) ? "" : "。"}`;
  const cta = context.variables["互动引导"] || context.settings.footerCta || DEFAULT_SETTINGS.footerCta;
  if (theme.footerCard) return renderCustomFooterCard(sentence, cta, context);
  if (theme.layout === "magazine") {
    return `<section data-wenote-block="cta" data-wenote-kind="signature" style="padding:0 20px 24px;">
  <p style="margin:0 0 24px;font-size:14px;line-height:1.9;text-align:justify;color:#374151;">${leaf(replaceArticleVariables(sentence, context))}</p>
  <section style="background:radial-gradient(circle at center,#F9FAFB 0%,#FFFFFF 100%);border:1px solid #E5E7EB;border-radius:16px;padding:32px 20px;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,.03);">
    <p style="font-size:13px;font-weight:700;color:#111827;margin:0 0 20px;line-height:1.6;">${inlineMarkdown(cta, context)}</p>
    ${renderEngagementActions("soft-green")}
    <p style="font-size:10px;color:#9CA3AF;letter-spacing:1px;margin:0;">${leaf("THANKS FOR READING")}</p>
  </section>
</section>`;
  }
  if (theme.layout === "zen") {
    return `<section data-wenote-block="cta" data-wenote-kind="signature" style="padding:0 16px 40px;">
  <p style="margin:0 0 26px;font-size:15px;line-height:1.9;text-align:justify;color:#525252;">${leaf(replaceArticleVariables(sentence, context))}</p>
  <p style="margin:0 0 26px;font-size:15px;line-height:1.9;text-align:justify;color:#525252;">${inlineMarkdown(cta, context)}</p>
</section>`;
  }
  if (theme.layout === "ticket") {
    return `<section data-wenote-block="cta" data-wenote-kind="signature" style="padding:0 0 32px;">
  <p style="margin:0 20px 24px;font-size:14px;line-height:1.9;color:#555;text-align:justify;">${leaf(replaceArticleVariables(sentence, context))}</p>
  <section style="background:#FFFEF8;border:2px solid #1A1A1A;box-shadow:4px 4px 0 #1A1A1A;padding:24px 20px;text-align:center;">
    <p style="font-size:13px;font-weight:700;color:#1A1A1A;margin:0 0 20px;line-height:1.6;">${inlineMarkdown(cta, context)}</p>
    ${renderEngagementActions("ticket")}
    <p style="border-top:1px dashed #CCC;padding-top:12px;font-size:10px;color:#999;letter-spacing:2px;margin:0;">${leaf("THANKS FOR READING ✂")}</p>
  </section>
</section>`;
  }
  if (theme.layout === "olive") {
    const initial = author.includes("{{") ? "名" : Array.from(author)[0] || "名";
    return `<section data-wenote-block="cta" data-wenote-kind="signature" style="padding:0 0 30px;">
  <p style="margin:24px 0 0;font-size:14px;line-height:1.9;color:#4D4F46;text-align:justify;">${leaf(replaceArticleVariables(sentence, context))}</p>
  <p style="margin:24px 0;"><span style="display:inline-flex;align-items:center;padding:8px 12px;background:#EEEFE9;border:1px solid #BFC1B7;border-radius:999px;"><span style="width:22px;height:22px;border-radius:50%;background:#1E1F23;color:#FFFFFF;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;margin-right:10px;">${leaf(initial)}</span><span style="font-size:12px;color:#23251D;font-weight:700;">${leaf(`${author} · ${bio}`)}</span></span></p>
  <section style="background:#FDFDF8;border:1px solid #BFC1B7;border-radius:6px;padding:22px 16px;text-align:center;">
    <p style="font-size:13px;font-weight:700;color:#23251D;line-height:1.6;margin:0 0 14px;">${inlineMarkdown(cta, context)}</p>
    ${renderEngagementActions("olive")}
    <p style="font-size:10px;color:#9EA096;letter-spacing:2px;margin:0;font-weight:500;">${leaf("THANKS FOR READING")}</p>
  </section>
</section>`;
  }
  const wrapperStyle = theme.layout === "graphite" ? "padding:0 10px 24px;" : "padding:0 10px 24px;";
  const innerStyle = theme.layout === "graphite" ? "border-top:1px solid #E4E4E7;padding-top:28px;" : "";
  return `<section data-wenote-block="cta" data-wenote-kind="signature" style="${wrapperStyle}"><section style="${innerStyle}"><p style="margin:0 0 16px;font-size:15px;line-height:1.8;color:${escapeAttr(theme.text)};text-align:justify;">${leaf(replaceArticleVariables(sentence, context))}</p><p style="margin:0 0 20px;font-size:15px;line-height:1.8;color:${escapeAttr(theme.text)};text-align:justify;">${inlineMarkdown(cta, context)}</p></section></section>`;
}

function renderCustomFooterCard(sentence: string, cta: string, context: RenderContext): string {
  const theme = context.themeInfo;
  const footer = theme.footerCard;
  if (!footer) return "";
  const shadow = footer.shadow === "soft" ? "box-shadow:0 4px 14px rgba(15,23,42,.06);" : "";
  return `<section data-wenote-block="cta" data-wenote-kind="signature" style="padding:0 20px 24px;">
  <p style="margin:0 0 24px;font-size:14px;line-height:1.9;text-align:justify;color:${escapeAttr(theme.text)};">${leaf(replaceArticleVariables(sentence, context))}</p>
  <section style="background:${escapeAttr(footer.background)};border:1px solid ${escapeAttr(footer.borderColor)};border-radius:${footer.borderRadius}px;padding:32px 20px;text-align:center;${shadow}">
    <p style="font-size:13px;font-weight:700;color:${escapeAttr(footer.textColor)};margin:0 0 20px;line-height:1.6;">${inlineMarkdown(cta, context)}</p>
    ${renderEngagementActions("custom", context)}
    <p style="font-size:10px;color:${escapeAttr(footer.mutedColor)};letter-spacing:1px;margin:0;">${leaf("THANKS FOR READING")}</p>
  </section>
</section>`;
}

function renderEngagementActions(variant: "soft-green" | "ticket" | "olive" | "custom", context?: RenderContext): string {
  const actions = variant === "ticket" ? [["like", "点赞"], ["view", "在看"], ["star", "星标"]] : variant === "olive" ? [["like", "赞"], ["view", "在看"], ["star", "收藏"]] : [["like", "点赞"], ["view", "在看"], ["share", "转发"]];
  const items = actions.map(([icon, label], index) => {
    const active = index === 2;
    const spacing = index < actions.length - 1 ? "margin-right:24px;" : "";
    const footer = context?.themeInfo.footerCard;
    const customBox = footer ? `background:${escapeAttr(active ? footer.activeIconBackground : footer.iconBackground)};border:1px solid ${escapeAttr(active ? context.themeInfo.accent : footer.borderColor)};border-radius:${footer.iconRadius}px;${footer.shadow === "soft" ? "box-shadow:0 2px 4px rgba(15,23,42,.05);" : ""}` : "";
    const box = variant === "custom" ? customBox : variant === "ticket" ? `background:${active ? "#F0FDF4" : "#FFFFFF"};border:${active ? "2px solid #059669" : "1px solid #1A1A1A"};border-radius:0;` : variant === "olive" ? `background:${active ? "#D4C9B8" : "#EEEFE9"};border:1px solid ${active ? "#B17816" : "#BFC1B7"};border-radius:6px;` : `background:${active ? "#ECFDF5" : "#FFFFFF"};border:1px solid ${active ? "#A7F3D0" : "#F3F4F6"};border-radius:12px;box-shadow:0 2px 4px rgba(0,0,0,.05);`;
    const color = variant === "custom" && footer && context ? (active ? context.themeInfo.accent : footer.mutedColor) : active ? (variant === "olive" ? "#23251D" : "#059669") : variant === "olive" ? "#4D4F46" : "#4B5563";
    return `<section style="text-align:center;color:${color};${spacing}"><section style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;margin:0 auto 6px;${box}">${engagementSvg(icon)}</section><span style="font-size:10px;font-weight:600;">${leaf(label)}</span></section>`;
  }).join("");
  return `<section style="display:flex;justify-content:center;margin-bottom:16px;">${items}</section>`;
}

function engagementSvg(icon: string): string {
  if (icon === "view") return `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"></circle><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path></svg>`;
  if (icon === "star") return `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
  if (icon === "share") return `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 18v-4a8 8 0 0 1 8-8h8"></path><polyline points="16 2 20 6 16 10"></polyline></svg>`;
  return `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>`;
}

function inlineMarkdown(input: string, context: RenderContext, options: { onDark?: boolean } = {}): string {
  const theme = context.themeInfo;
  const variableValues: string[] = [];
  const protectedInput = input.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (all, key: string) => {
    const value = context.variables[key.trim()];
    if (typeof value !== "string") return all;
    const index = variableValues.push(value) - 1;
    return `\uE000${index}\uE001`;
  });
  let html = escapeHtml(protectedInput);
  html = html.replace(/\uE000(\d+)\uE001/g, (_all, index: string) => leaf(variableValues[Number(index)] ?? ""));
  const linkColor = options.onDark ? theme.border : theme.accent;
  const strongColor = options.onDark ? "#ffffff" : theme.title;
  html = html.replace(/!\[([^\]]*)]\(([^)]+)\)/g, (_all, alt: string, url: string) => `<img src="${escapeAttr(safeUrl(unescapeHtml(url)))}" alt="${escapeAttr(unescapeHtml(alt))}" style="max-width:100%;height:auto;border-radius:12px;vertical-align:middle;box-sizing:border-box;" />`);
  html = html.replace(/\[([^\]]+)]\(([^)]+)\)/g, (_all, label: string, url: string) => `<a href="${escapeAttr(safeUrl(unescapeHtml(url)))}" target="_blank" style="color:${escapeAttr(linkColor)};text-decoration:none;border-bottom:1px solid ${escapeAttr(theme.border)};word-break:break-word;overflow-wrap:anywhere;">${leaf(unescapeHtml(label))}</a>`);
  html = html.replace(/(^|[\s>])((?:https?:\/\/)[^\s<]+)/g, (_all, prefix: string, url: string) => `${prefix}<a href="${escapeAttr(safeUrl(unescapeHtml(url)))}" target="_blank" style="color:${escapeAttr(linkColor)};text-decoration:none;border-bottom:1px solid ${escapeAttr(theme.border)};word-break:break-word;overflow-wrap:anywhere;">${leaf(unescapeHtml(url))}</a>`);
  html = html.replace(/`([^`]+)`/g, (_all, code: string) => `<span style="background:${escapeAttr(theme.highlight)};color:${escapeAttr(theme.title)};padding:2px 6px;border-radius:4px;font-family:'SF Mono',Consolas,Monaco,monospace;font-size:14px;">${leaf(unescapeHtml(code))}</span>`);
  html = html.replace(/\+\+([^+]+)\+\+/g, (_all, value: string) => `<span style="${escapeAttr(theme.underlineCss)}color:${escapeAttr(strongColor)};">${leaf(unescapeHtml(value))}</span>`);
  html = html.replace(/&lt;u&gt;([\s\S]+?)&lt;\/u&gt;/g, (_all, value: string) => `<span style="${escapeAttr(theme.underlineCss)}color:${escapeAttr(strongColor)};">${leaf(unescapeHtml(value))}</span>`);
  html = html.replace(/==([^=]+)==/g, (_all, value: string) => `<span style="background:${escapeAttr(theme.highlight)};color:${escapeAttr(theme.title)};padding:2px 7px;border-radius:3px;font-weight:700;font-size:14px;">${leaf(unescapeHtml(value))}</span>`);
  html = html.replace(/\*\*([^*]+)\*\*/g, (_all, value: string) => `<strong style="color:${escapeAttr(strongColor)};">${leaf(unescapeHtml(value))}</strong>`);
  html = html.replace(/__([^_]+)__/g, (_all, value: string) => `<strong style="color:${escapeAttr(strongColor)};">${leaf(unescapeHtml(value))}</strong>`);
  html = html.replace(/~~([^~]+)~~/g, (_all, value: string) => `<del style="color:${escapeAttr(theme.muted)};text-decoration:line-through;">${leaf(unescapeHtml(value))}</del>`);
  html = html.replace(/\*([^*]+)\*/g, (_all, value: string) => `<em style="font-style:normal;color:${escapeAttr(options.onDark ? theme.border : theme.muted)};">${leaf(unescapeHtml(value))}</em>`);
  html = html.replace(/_([^_]+)_/g, (_all, value: string) => `<em style="font-style:normal;color:${escapeAttr(options.onDark ? theme.border : theme.muted)};">${leaf(unescapeHtml(value))}</em>`);
  return wrapLeafText(html);
}

function buildArticleVariables(context: RenderContext): Record<string, string> {
  const custom = parseArticleVariables(context.settings.articleVariables);
  const author = context.frontmatter.author || context.settings.authorName || custom["作者名"] || custom.author || "{{作者名}}";
  const bio = context.frontmatter.bio || context.settings.authorBio || custom["简介"] || custom.bio || "{{简介}}";
  const title = context.frontmatter.title || custom["标题"] || custom.title || "";
  const subtitle = context.frontmatter.subtitle || custom["副标题"] || custom.subtitle || "";
  const variables: Record<string, string> = {
    "作者名": author,
    "作者": author,
    author,
    "简介": bio,
    "作者简介": bio,
    bio,
    "标题": title,
    title,
    "副标题": subtitle,
    subtitle,
    "主题": context.themeInfo.label,
    "主题名": context.themeInfo.label,
    theme: context.themeInfo.label
  };
  Object.entries(custom).forEach(([key, value]) => {
    if (value) variables[key] = value;
  });
  return variables;
}

function parseArticleVariables(raw: string | undefined): Record<string, string> {
  const variables: Record<string, string> = {};
  if (!raw) return variables;
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const match = trimmed.match(/^([^=:：=]+)\s*(?:=|:|：)\s*(.+)$/);
    if (!match) return;
    const key = match[1].trim().replace(/^\{\{\s*|\s*\}\}$/g, "");
    const value = match[2].trim();
    if (key && value) variables[key] = value;
  });
  return variables;
}

function replaceArticleVariables(text: string, context: RenderContext): string {
  if (!text || !text.includes("{{")) return text;
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (all, key: string) => context.variables[key.trim()] ?? all);
}

function variableOrPlaceholder(context: RenderContext, key: string): string {
  const value = context.variables[key];
  return value?.trim() ? value : `{{${key}}}`;
}

function underlineKeywordIfPlain(text: string): string {
  if (/\*\*|==|\+\+|<u>|`|\[.+]\(.+\)/.test(text)) return text;
  const clean = text.replace(/https?:\/\/\S+/g, "").trim();
  const match = clean.match(/[\u4e00-\u9fa5A-Za-z0-9][\u4e00-\u9fa5A-Za-z0-9\s·-]{3,14}/);
  const phrase = match?.[0]?.trim();
  if (!phrase || phrase.length < 4) return text;
  const index = text.indexOf(phrase);
  if (index < 0) return text;
  return `${text.slice(0, index)}++${phrase}++${text.slice(index + phrase.length)}`;
}

function wrapLeafText(html: string): string {
  const parts = html.split(/(<[^>]+>)/g);
  let leafDepth = 0;
  return parts.map((part) => {
    if (!part) return part;
    if (part.startsWith("<")) {
      if (/^<span\b[^>]*\sleaf(?:\s*=\s*(?:""|''|[^\s>]+))?/i.test(part) && !/\/>$/.test(part)) leafDepth += 1;
      if (/^<\/span>/i.test(part) && leafDepth > 0) leafDepth -= 1;
      return part;
    }
    if (leafDepth > 0) return part;
    return part.replace(/([^\s]+)/g, (_all, text: string) => leaf(unescapeHtml(text)));
  }).join("");
}

function leaf(text: string, style = ""): string {
  const styleAttr = style ? ` style="${escapeAttr(style)}"` : "";
  return `<span leaf=""${styleAttr}>${escapeHtml(text)}</span>`;
}

function leafBreak(): string {
  return `<span leaf=""><br></span>`;
}

function shouldAppendSignature(blocks: ParsedBlock[]): boolean {
  const tail = blocks.slice(-3).map((block) => {
    if (block.type === "paragraph" || block.type === "quote" || block.type === "heading") return block.text;
    if (block.type === "callout") return block.body;
    return "";
  }).join("\n");
  return !/我是.+(欢迎|点赞|在看|转发|下篇见)|点赞、?在看、?转发/.test(tail);
}

function toPlainText(blocks: ParsedBlock[], frontmatter: Frontmatter, context: RenderContext): string {
  const lines: string[] = [];
  if (frontmatter.title) lines.push(replaceArticleVariables(frontmatter.title, context));
  for (const block of blocks) {
    if (block.type === "heading" || block.type === "paragraph" || block.type === "quote") lines.push(replaceArticleVariables(block.text, context));
    if (block.type === "list") lines.push(...block.items.map((item) => replaceArticleVariables(item.text, context)));
    if (block.type === "code") lines.push(block.code);
    if (block.type === "image") lines.push(replaceArticleVariables(block.alt || block.src, context));
    if (block.type === "table") lines.push(block.headers.map((header) => replaceArticleVariables(header, context)).join(" | "), ...block.rows.map((row) => row.map((cell) => replaceArticleVariables(cell, context)).join(" | ")));
    if (block.type === "callout") lines.push(replaceArticleVariables(block.attrs.title || block.title || "", context), replaceArticleVariables(block.body, context));
  }
  return lines.filter(Boolean).join("\n\n");
}

function labelForCallout(kind: string): string {
  const labels: Record<string, string> = { note: "提示", tip: "重点", warning: "注意" };
  return labels[kind] || kind.toUpperCase();
}

function safeUrl(url: string): string {
  const trimmed = url.trim();
  return /^javascript:/i.test(trimmed) ? "#" : trimmed;
}

function numberAttr(value: number): number {
  return Math.max(320, Math.min(900, Math.round(value || 695)));
}

function unescapeHtml(input: string): string {
  return input
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(input: string): string {
  return escapeHtml(input).replace(/'/g, "&#39;");
}
