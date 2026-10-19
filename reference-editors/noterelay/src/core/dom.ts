import { sanitizeHTMLToDom } from "obsidian";

type Options = {text?: string; cls?: string; attr?: Record<string, string>; value?: string; type?: string};
export function createEl<K extends keyof HTMLElementTagNameMap>(tag: K, options: Options = {}): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (options.text !== undefined) element.textContent = options.text;
  if (options.cls) element.className = options.cls;
  for (const [key, value] of Object.entries(options.attr ?? {})) element.setAttribute(key, value);
  if (options.value !== undefined) element.setAttribute("value", options.value);
  if (options.type) element.setAttribute("type", options.type);
  return element;
}
export const createDiv = (options?: Options) => createEl("div", options);
export function appendEl<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, options?: Options) {
  const element = createEl(tag, options); parent.append(element); return element;
}
export const appendSpan = (parent: HTMLElement, options?: Options) => appendEl(parent, "span", options);
export function setCssProps(element: HTMLElement, values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) element.style.setProperty(key, value);
}
export function setSanitizedHtml(element: HTMLElement, html: string): void {
  element.replaceChildren(); element.append(sanitizeHTMLToDom(html));
}
export function createSanitizedHost(html: string, tag: keyof HTMLElementTagNameMap = "div"): HTMLElement {
  const element = createEl(tag); element.append(sanitizeHTMLToDom(html)); return element;
}
