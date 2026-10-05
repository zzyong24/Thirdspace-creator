export interface WeChatCompatOptions {
  safeMode?: boolean;
  stripInternalAttrs?: boolean;
}

export function makeHtmlWeChatCompatible(html: string, options: WeChatCompatOptions = {}): string {
  if (typeof document === "undefined") return stripWenoteAttributesFallback(html);
  const content = createSanitizedHost(html);
  makeWenoteWeChatCompatible(content, options);
  if (options.stripInternalAttrs ?? true) {
    content.querySelectorAll<HTMLElement>("*").forEach(stripElementAttrs);
  }
  return content.innerHTML;
}

export function makeWenoteWeChatCompatible(content: HTMLElement, options: WeChatCompatOptions = {}): void {
  const shell = content.querySelector<HTMLElement>('[data-wenote-block="shell"]') ?? content.firstElementChild as HTMLElement | null;
  const containerStyle = shell?.getAttribute("style") || "";
  content.querySelectorAll<HTMLElement>("*").forEach((element) => {
    normalizeWechatStyle(element);
    preventBoxOverflow(element);
    if (options.safeMode) applySafeMode(element);
  });
  forceTextInheritance(shell ?? content, containerStyle);
  keepCjkPunctuationTogether(shell ?? content);
}

export function appendStyle(element: HTMLElement, style: string): void {
  for (const declaration of style.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator < 1) continue;
    const property = declaration.slice(0, separator).trim();
    const value = declaration.slice(separator + 1).trim();
    if (property && value) element.style.setProperty(property, value);
  }
}

export function stripElementAttrs(element: HTMLElement): void {
  element.removeAttribute("data-wenote-block");
  element.removeAttribute("data-wenote-kind");
  element.removeAttribute("data-noterelay-source");
  element.removeAttribute("class");
  element.removeAttribute("id");
}

export function stripWenoteAttributesFallback(html: string): string {
  return html
    .replace(/\sdata-wenote-block="[^"]*"/g, "")
    .replace(/\sdata-wenote-kind="[^"]*"/g, "")
    .replace(/\sclass="[^"]*"/g, "")
    .replace(/\sid="[^"]*"/g, "");
}

function normalizeWechatStyle(element: HTMLElement): void {
  const style = element.style;
  removeUnsupportedStyleNames(style);
  if (style.position === "fixed" || style.position === "sticky") style.removeProperty("position");
  if (style.display === "grid" || style.display === "inline-grid") {
    style.setProperty("display", "block");
  }
  if (element.tagName === "A") {
    element.setAttribute("target", "_blank");
  }
}

function removeUnsupportedStyleNames(style: CSSStyleDeclaration): void {
  const exact = [
    "align-content",
    "align-self",
    "justify-items",
    "justify-self",
    "order",
    "grid",
    "grid-area",
    "grid-template",
    "grid-template-columns",
    "grid-template-rows",
    "grid-column",
    "grid-row",
    "transform"
  ];
  exact.forEach((name) => style.removeProperty(name));
  for (let index = style.length - 1; index >= 0; index--) {
    const name = style.item(index);
    if (/^(animation|transition)/.test(name)) style.removeProperty(name);
  }
}

function preventBoxOverflow(element: HTMLElement): void {
  const block = element.getAttribute("data-wenote-block");
  const tag = element.tagName;
  if (block === "list-marker") {
    appendStyle(element, "display:inline-block;width:30px;min-width:30px;height:26px;padding:0 3px;line-height:26px;box-sizing:border-box;text-align:center;white-space:nowrap;vertical-align:top;");
    return;
  }
  const isMarginBlock = Boolean(block && block !== "shell" && block !== "rule") || ["P", "H1", "H2", "H3", "H4", "H5", "H6", "PRE", "BLOCKQUOTE"].includes(tag);
  if (isMarginBlock) {
    element.style.removeProperty("width");
    element.style.removeProperty("min-width");
    element.style.removeProperty("max-width");
    Object.assign(element.style, { boxSizing: "border-box" });
  }
  if (tag === "SECTION" || tag === "DIV" || tag === "P") {
    const overflow = element.style.overflow || "";
    if (overflow === "hidden" || overflow === "auto" || overflow === "scroll") Object.assign(element.style, { overflow: "visible" });
    element.style.removeProperty("overflow-x");
    element.style.removeProperty("overflow-y");
  }
}

function applySafeMode(element: HTMLElement): void {
  element.style.removeProperty("box-shadow");
  element.style.removeProperty("filter");
  element.style.removeProperty("backdrop-filter");
  if (element.tagName === "IMG") {
    appendStyle(element, "display:block;max-width:100%;height:auto;margin-left:auto;margin-right:auto;");
  }
  if (element.tagName === "PRE" || element.tagName === "CODE") {
    appendStyle(element, "white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;");
  }
}

function forceTextInheritance(root: HTMLElement, containerStyle: string): void {
  const fontFamily = pickStyleValue(containerStyle, "font-family");
  const lineHeight = pickStyleValue(containerStyle, "line-height");
  const fontSize = pickStyleValue(containerStyle, "font-size");
  const color = pickStyleValue(containerStyle, "color");
  root.querySelectorAll<HTMLElement>("p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th").forEach((element) => {
    if (element.closest("pre, code") && element.tagName === "SPAN") return;
    if (fontFamily && !element.style.fontFamily) element.style.setProperty("font-family", fontFamily);
    if (lineHeight && !element.style.lineHeight) element.style.setProperty("line-height", lineHeight);
    if (fontSize && !element.style.fontSize && ["P", "LI", "BLOCKQUOTE", "SPAN", "TD", "TH"].includes(element.tagName)) {
      element.style.setProperty("font-size", fontSize);
    }
    if (color && !element.style.color) element.style.setProperty("color", color);
  });
}

function keepCjkPunctuationTogether(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("strong, b, em, span, a, code").forEach((element) => {
    if (element.getAttribute("data-wenote-block") === "list-marker") return;
    const next = element.nextSibling;
    if (!next || next.nodeType !== Node.TEXT_NODE) return;
    const text = next.textContent || "";
    const match = text.match(/^\s*([：；，。！？、:])(.*)$/s);
    if (!match) return;
    element.appendChild(document.createTextNode(match[1]));
    if (match[2]) {
      next.textContent = match[2];
    } else {
      next.parentNode?.removeChild(next);
    }
  });
}

function pickStyleValue(style: string, property: string): string {
  const match = style.match(new RegExp(`${property}\\s*:\\s*([^;]+)`, "i"));
  return match?.[1]?.trim() || "";
}
import { createSanitizedHost } from "../../../core/dom";
