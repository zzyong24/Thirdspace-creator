import { A as e, C as t, D as n, E as r, H as i, I as a, J as o, O as s, P as c, S as l, T as u, W as d, _ as f, a as p, at as m, b as h, ct as g, dt as _, ft as v, g as y, h as b, ht as x, i as ee, it as te, l as ne, lt as S, mt as re, n as ie, nt as C, ot as ae, pt as oe, q as se, rt as ce, st as le, t as ue, ut as de, v as fe, w as pe, x as me, y as he, z as ge } from "./codemirror-C3tEDw1q.js";
import { I as _e, L as ve, R as ye, Z as be, dt as w, lt as xe, n as T, st as Se, y as E, z as Ce } from "./vendor_vue-OlfIOlFg.js";
import { c as D, i as we, n as Te, o as O, r as k, t as Ee } from "./native-host-BoAU4GnD.js";
import { T as De, _ as A, d as j, g as M, l as N, u as P } from "./storage-jiCkQUgy.js";
import { t as F } from "./config-CS1KboEo.js";
import { n as I, t as Oe } from "./translate-CUv9RhnO.js";
import { n as L } from "./lib-DIiEqr8B.js";
import "./editor-VmYacIt-.js";
import { A as ke, C as Ae, M as je, g as R, h as Me, j as Ne, m as Pe, n as Fe, u as z, w as Ie } from "./utils-D7O4F-LG.js";
import { g as Le, x as B } from "./vendor_vueuse-DbHwQsn4.js";
function Re(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e.matchAll(/--([\w-]+)\s*:\s*([^;}\n]+)/g)) t.set(`--${n[1]}`, n[2].trim());
	return t;
}
function ze(e) {
	let t = Re(e), n = /var\(\s*(--[\w-]+)\s*(?:,([^()]*(?:\([^()]*\)[^()]*)*))?\)/g, r = e, i = "", a = 0;
	for (; r !== i && a < 10;) i = r, r = r.replace(n, (e, n, r) => {
		let i = t.get(n);
		return i === void 0 ? r ? r.trim() : `var(${n})` : i;
	}), a++;
	let o = /calc\(([^()]+)\)/g;
	for (i = "", a = 0; r !== i && a < 10;) i = r, r = r.replace(o, (e, t) => He(t.trim())), a++;
	return r;
}
var Be = "px|em|rem|vw|vh|vmin|vmax|%|pt|pc|cm|mm|in|ex|ch", Ve = "(-?[\\d.]+)", V = `(-?[\\d.]+)(${Be})?`;
function He(e) {
	let t = e.match(RegExp(`^${V}\\s*\\*\\s*${V}$`));
	if (t) {
		let [, e, n, r, i] = t;
		if (!n != !i) {
			let t = n || i;
			return `${Ue(Number.parseFloat(e) * Number.parseFloat(r))}${t}`;
		}
	}
	let n = e.match(RegExp(`^${V}\\s*/\\s*${Ve}$`));
	if (n) {
		let [, e, t, , r] = n;
		return `${Ue(Number.parseFloat(e) / Number.parseFloat(r))}${t ?? ""}`;
	}
	let r = e.match(RegExp(`^${V}\\s*([+-])\\s*${V}$`));
	if (r) {
		let [, e, t, n, i, a] = r;
		if (t === a) return `${Ue(n === "+" ? Number.parseFloat(e) + Number.parseFloat(i) : Number.parseFloat(e) - Number.parseFloat(i))}${t ?? ""}`;
	}
	return `calc(${e})`;
}
function Ue(e) {
	return Math.round(e * 1e4) / 1e4;
}
var We = {
	blockquote_note: "markdown-alert-note",
	blockquote_tip: "markdown-alert-tip",
	blockquote_info: "markdown-alert-info",
	blockquote_important: "markdown-alert-important",
	blockquote_warning: "markdown-alert-warning",
	blockquote_caution: "markdown-alert-caution",
	blockquote_abstract: "markdown-alert-abstract",
	blockquote_summary: "markdown-alert-summary",
	blockquote_tldr: "markdown-alert-tldr",
	blockquote_todo: "markdown-alert-todo",
	blockquote_success: "markdown-alert-success",
	blockquote_done: "markdown-alert-done",
	blockquote_question: "markdown-alert-question",
	blockquote_help: "markdown-alert-help",
	blockquote_faq: "markdown-alert-faq",
	blockquote_failure: "markdown-alert-failure",
	blockquote_fail: "markdown-alert-fail",
	blockquote_missing: "markdown-alert-missing",
	blockquote_danger: "markdown-alert-danger",
	blockquote_error: "markdown-alert-error",
	blockquote_bug: "markdown-alert-bug",
	blockquote_example: "markdown-alert-example",
	blockquote_quote: "markdown-alert-quote",
	blockquote_cite: "markdown-alert-cite",
	blockquote_title: "alert-title",
	blockquote_title_note: "alert-title-note",
	blockquote_title_tip: "alert-title-tip",
	blockquote_title_info: "alert-title-info",
	blockquote_title_important: "alert-title-important",
	blockquote_title_warning: "alert-title-warning",
	blockquote_title_caution: "alert-title-caution",
	blockquote_title_abstract: "alert-title-abstract",
	blockquote_title_summary: "alert-title-summary",
	blockquote_title_tldr: "alert-title-tldr",
	blockquote_title_todo: "alert-title-todo",
	blockquote_title_success: "alert-title-success",
	blockquote_title_done: "alert-title-done",
	blockquote_title_question: "alert-title-question",
	blockquote_title_help: "alert-title-help",
	blockquote_title_faq: "alert-title-faq",
	blockquote_title_failure: "alert-title-failure",
	blockquote_title_fail: "alert-title-fail",
	blockquote_title_missing: "alert-title-missing",
	blockquote_title_danger: "alert-title-danger",
	blockquote_title_error: "alert-title-error",
	blockquote_title_bug: "alert-title-bug",
	blockquote_title_example: "alert-title-example",
	blockquote_title_quote: "alert-title-quote",
	blockquote_title_cite: "alert-title-cite",
	blockquote_p: "alert-content",
	blockquote_p_note: "alert-content-note",
	blockquote_p_tip: "alert-content-tip",
	blockquote_p_info: "alert-content-info",
	blockquote_p_important: "alert-content-important",
	blockquote_p_warning: "alert-content-warning",
	blockquote_p_caution: "alert-content-caution",
	blockquote_p_abstract: "alert-content-abstract",
	blockquote_p_summary: "alert-content-summary",
	blockquote_p_tldr: "alert-content-tldr",
	blockquote_p_todo: "alert-content-todo",
	blockquote_p_success: "alert-content-success",
	blockquote_p_done: "alert-content-done",
	blockquote_p_question: "alert-content-question",
	blockquote_p_help: "alert-content-help",
	blockquote_p_faq: "alert-content-faq",
	blockquote_p_failure: "alert-content-failure",
	blockquote_p_fail: "alert-content-fail",
	blockquote_p_missing: "alert-content-missing",
	blockquote_p_danger: "alert-content-danger",
	blockquote_p_error: "alert-content-error",
	blockquote_p_bug: "alert-content-bug",
	blockquote_p_example: "alert-content-example",
	blockquote_p_quote: "alert-content-quote",
	blockquote_p_cite: "alert-content-cite",
	code_pre: "code-block",
	codespan: "code-inline",
	inline_katex: "katex-inline",
	block_katex: "katex-block",
	markup_highlight: "markup-highlight",
	markup_underline: "markup-underline",
	markup_wavyline: "markup-wavyline",
	markup_superscript: "markup-superscript",
	listitem: "listitem"
};
function H(e, t = "#output") {
	return e.replace(/([^{}]+)\{([^}]*)\}/g, (e, n, r) => {
		let i = n.trim();
		return i.startsWith("@") || i.startsWith(":root") ? e : `${n.split(",").map((e) => {
			let n = e.trim();
			if (n.startsWith(t) || !n) return n;
			n = n.replace(/\.md-container\b/g, ".container");
			let r = n.split(/[\s>+~:[]/, 1)[0].trim();
			return r && We[r] && (n = n.replace(r, `.${We[r]}`)), n.match(/^(h[1-6])(\s|$|::|[:[])/) ? `${t} section ${n}` : `${t} ${n}`;
		}).filter(Boolean).join(",\n")} {${r}}`;
	});
}
var Ge = "1.75", Ke = "1", qe = "#576b95", Je = "default";
function U(e) {
	let t = e.blockquoteBackground && e.blockquoteBackground !== Je ? `\n  --md-blockquote-background: ${e.blockquoteBackground};` : "";
	return `
:root {
  /* Theme config */
  --md-primary-color: ${e.primaryColor};
  --md-font-family: ${e.fontFamily};
  --md-font-size: ${e.fontSize};
  --md-line-height: ${e.lineHeight || Ge};
  --md-block-spacing: ${e.blockSpacing || Ke};
  --md-link-color: ${e.linkColor || qe};${t}
}

/* Paragraph indent & justify */
#output p {
  ${e.isUseIndent ? "text-indent: 2em;" : ""}
  ${e.isUseJustify ? "text-align: justify;" : ""}
}
  `.trim();
}
function W(e) {
	return Ye(e.headingStyles);
}
function Ye(e) {
	if (!e) return "";
	let t = [
		"h1",
		"h2",
		"h3",
		"h4",
		"h5",
		"h6"
	], n = [];
	for (let r of t) {
		let t = e[r];
		t && t !== "default" && t !== "custom" && n.push(Xe(r, t));
	}
	return n.join("\n\n");
}
function Xe(e, t) {
	let n = "\n  display: block;\n  text-align: left;\n  background: transparent;";
	switch (t) {
		case "color-only": return `#output ${e} {
  color: var(--md-primary-color);
  background: transparent;
}`;
		case "border-bottom": return `#output ${e} {${n}
  padding-bottom: 0.3em;
  border-bottom: 2px solid var(--md-primary-color);
  color: var(--md-primary-color);
}`;
		case "border-left": return `#output ${e} {${n}
  margin-left: 0;
  padding-left: 10px;
  border-left: 4px solid var(--md-primary-color);
  color: var(--md-primary-color);
}`;
		default: return "";
	}
}
var Ze = "/**\n * MD base theme styles\n * Base element styles and CSS variable definitions\n */\n\n/* ==================== Container ==================== */\nsection,\n#output .container {\n  font-family: var(--md-font-family);\n  font-size: var(--md-font-size);\n  line-height: var(--md-line-height);\n  text-align: left;\n}\n\n#output {\n  font-family: var(--md-font-family);\n  font-size: var(--md-font-size);\n  line-height: var(--md-line-height);\n  text-align: left;\n}\n\n#output section > :first-child {\n  margin-top: 0 !important;\n}\n\n/*\n * Reset for exported HTML / share pages / VSCode preview (no Tailwind preflight).\n * Browser defaults leak in (e.g. blockquote 40px side margins, table border-collapse: separate).\n * Reset horizontal (and top) margins so export matches in-app preview.\n * Vertical spacing comes from theme blockquote { margin-bottom }; do not zero all margins here.\n * section selector covers VSCode preview (no #output; content in section.container).\n */\n#output blockquote,\nsection blockquote {\n  margin-left: 0;\n  margin-right: 0;\n  margin-top: 0;\n}\n\n#output table,\nsection table {\n  border-collapse: collapse;\n  min-width: 100%;\n}\n\n.mermaid-diagram .nodeLabel p {\n  color: unset !important;\n  letter-spacing: unset !important;\n}\n\n/* ==================== Inline emoji ====================\n * `<img class=\"md-emoji\">` comes from `<Emoji id=\"…\">` (and legacy\n * `{{emoji:id}}`). Native pixel sizing makes the image dwarf the surrounding\n * text; constrain to the line box so it reads as an inline character.\n */\n#output img.md-emoji,\nsection img.md-emoji {\n  max-height: 1.4em;\n  width: auto;\n  vertical-align: text-bottom;\n  margin: 0 0.1em;\n  display: inline;\n}\n\n/*\n * Original-size stickers (`width=\"N%\"`) use a separate class so the line-box\n * cap above does not shrink them. Keep aspect ratio and stay inside the article.\n */\n#output img.md-asset-img,\nsection img.md-asset-img {\n  height: auto;\n  max-width: 100%;\n  vertical-align: text-bottom;\n  display: inline;\n}\n", Qe = "/**\n * MD default theme (classic).\n * Format with Alt/Option + Shift + F.\n * Use var(--md-primary-color) for theme color instead of hard-coded values.\n * Vertical block margins are scaled by var(--md-block-spacing) so the theme's\n * own rhythm is preserved while the user tightens or loosens the whole page.\n */\n\n/* ==================== H1 ==================== */\nh1 {\n  display: table;\n  padding: 0 1em;\n  border-bottom: 2px solid var(--md-primary-color);\n  margin: calc(2em * var(--md-block-spacing)) auto calc(1em * var(--md-block-spacing));\n  color: hsl(var(--foreground));\n  font-size: calc(var(--md-font-size) * 1.2);\n  font-weight: bold;\n  text-align: center;\n}\n\n/* ==================== H2 ==================== */\nh2 {\n  display: table;\n  padding: 0 0.2em;\n  margin: calc(4em * var(--md-block-spacing)) auto calc(2em * var(--md-block-spacing));\n  color: #fff;\n  background: var(--md-primary-color);\n  font-size: calc(var(--md-font-size) * 1.2);\n  font-weight: bold;\n  text-align: center;\n}\n\n/* ==================== H3 ==================== */\nh3 {\n  padding-left: 8px;\n  border-left: 3px solid var(--md-primary-color);\n  margin: calc(2em * var(--md-block-spacing)) 8px calc(0.75em * var(--md-block-spacing)) 0;\n  color: hsl(var(--foreground));\n  font-size: calc(var(--md-font-size) * 1.1);\n  font-weight: bold;\n  line-height: 1.2;\n}\n\n/* ==================== H4 ==================== */\nh4 {\n  margin: calc(2em * var(--md-block-spacing)) 8px calc(0.5em * var(--md-block-spacing));\n  color: var(--md-primary-color);\n  font-size: calc(var(--md-font-size) * 1);\n  font-weight: bold;\n}\n\n/* ==================== H5 ==================== */\nh5 {\n  margin: calc(1.5em * var(--md-block-spacing)) 8px calc(0.5em * var(--md-block-spacing));\n  color: var(--md-primary-color);\n  font-size: calc(var(--md-font-size) * 1);\n  font-weight: bold;\n}\n\n/* ==================== H6 ==================== */\nh6 {\n  margin: calc(1.5em * var(--md-block-spacing)) 8px calc(0.5em * var(--md-block-spacing));\n  font-size: calc(var(--md-font-size) * 1);\n  color: var(--md-primary-color);\n}\n\n/* ==================== Paragraph ==================== */\np {\n  margin: calc(1.5em * var(--md-block-spacing)) 8px;\n  letter-spacing: 0.1em;\n  color: hsl(var(--foreground));\n}\n\n/* ==================== Blockquote ==================== */\nblockquote {\n  font-style: normal;\n  padding: 1em;\n  border-left: 4px solid var(--md-primary-color);\n  border-radius: 6px;\n  color: hsl(var(--foreground));\n  background: var(--md-blockquote-background, var(--blockquote-background));\n  margin-bottom: calc(1em * var(--md-block-spacing));\n}\n\nblockquote > p {\n  display: block;\n  font-size: 1em;\n  letter-spacing: 0.1em;\n  color: hsl(var(--foreground));\n  margin: 0;\n}\n\n/* ==================== GFM alerts ==================== */\n.alert-title-note,\n.alert-title-tip,\n.alert-title-info,\n.alert-title-important,\n.alert-title-warning,\n.alert-title-caution,\n.alert-title-abstract,\n.alert-title-summary,\n.alert-title-tldr,\n.alert-title-todo,\n.alert-title-success,\n.alert-title-done,\n.alert-title-question,\n.alert-title-help,\n.alert-title-faq,\n.alert-title-failure,\n.alert-title-fail,\n.alert-title-missing,\n.alert-title-danger,\n.alert-title-error,\n.alert-title-bug,\n.alert-title-example,\n.alert-title-quote,\n.alert-title-cite,\n.alert-title-theorem,\n.alert-title-lemma,\n.alert-title-corollary,\n.alert-title-proposition,\n.alert-title-definition,\n.alert-title-axiom,\n.alert-title-postulate,\n.alert-title-assumption,\n.alert-title-proof,\n.alert-title-remark,\n.alert-title-custom {\n  display: flex;\n  align-items: center;\n  gap: 0.5em;\n  margin-bottom: 0.5em;\n}\n\n.alert-title-note {\n  color: #478be6;\n}\n\n.alert-title-tip {\n  color: #57ab5a;\n}\n\n.alert-title-info {\n  color: #93c5fd;\n}\n\n.alert-title-important {\n  color: #986ee2;\n}\n\n.alert-title-warning {\n  color: #c69026;\n}\n\n.alert-title-caution {\n  color: #e5534b;\n}\n\n/* Obsidian-style callout colors */\n.alert-title-abstract,\n.alert-title-summary,\n.alert-title-tldr {\n  color: #00bfff;\n}\n\n.alert-title-todo {\n  color: #478be6;\n}\n\n.alert-title-success,\n.alert-title-done {\n  color: #57ab5a;\n}\n\n.alert-title-question,\n.alert-title-help,\n.alert-title-faq {\n  color: #c69026;\n}\n\n.alert-title-failure,\n.alert-title-fail,\n.alert-title-missing {\n  color: #e5534b;\n}\n\n.alert-title-danger,\n.alert-title-error {\n  color: #e5534b;\n}\n\n.alert-title-bug {\n  color: #e5534b;\n}\n\n.alert-title-example {\n  color: #986ee2;\n}\n\n.alert-title-quote,\n.alert-title-cite {\n  color: #9ca3af;\n}\n\n/* GFM alert SVG icon colors */\n.alert-icon-note {\n  fill: #478be6;\n}\n\n.alert-icon-tip {\n  fill: #57ab5a;\n}\n\n.alert-icon-info {\n  fill: #93c5fd;\n}\n\n.alert-icon-important {\n  fill: #986ee2;\n}\n\n.alert-icon-warning {\n  fill: #c69026;\n}\n\n.alert-icon-caution {\n  fill: #e5534b;\n}\n\n/* Obsidian-style callout icon colors */\n.alert-icon-abstract,\n.alert-icon-summary,\n.alert-icon-tldr {\n  fill: #00bfff;\n}\n\n.alert-icon-todo {\n  fill: #478be6;\n}\n\n.alert-icon-success,\n.alert-icon-done {\n  fill: #57ab5a;\n}\n\n.alert-icon-question,\n.alert-icon-help,\n.alert-icon-faq {\n  fill: #c69026;\n}\n\n.alert-icon-failure,\n.alert-icon-fail,\n.alert-icon-missing {\n  fill: #e5534b;\n}\n\n.alert-icon-danger,\n.alert-icon-error {\n  fill: #e5534b;\n}\n\n.alert-icon-bug {\n  fill: #e5534b;\n}\n\n.alert-icon-example {\n  fill: #986ee2;\n}\n\n.alert-icon-quote,\n.alert-icon-cite {\n  fill: #9ca3af;\n}\n\n/* ==================== Academic environments (theorem, lemma, definition, …) ==================== */\n/* Title colors */\n.alert-title-theorem,\n.alert-title-lemma,\n.alert-title-corollary,\n.alert-title-proposition {\n  color: #986ee2;\n}\n\n.alert-title-definition {\n  color: #57ab5a;\n}\n\n.alert-title-axiom,\n.alert-title-postulate,\n.alert-title-assumption {\n  color: #478be6;\n}\n\n.alert-title-proof {\n  color: #9ca3af;\n}\n\n.alert-title-remark {\n  color: #c69026;\n}\n\n/* Icon colors */\n.alert-icon-theorem,\n.alert-icon-lemma,\n.alert-icon-corollary,\n.alert-icon-proposition {\n  fill: #986ee2;\n}\n\n.alert-icon-definition {\n  fill: #57ab5a;\n}\n\n.alert-icon-axiom,\n.alert-icon-postulate,\n.alert-icon-assumption {\n  fill: #478be6;\n}\n\n.alert-icon-proof {\n  fill: #9ca3af;\n}\n\n.alert-icon-remark {\n  fill: #c69026;\n}\n\n/* Full border on academic boxes (theorem-style appearance) */\n.markdown-alert-theorem,\n.markdown-alert-lemma,\n.markdown-alert-corollary,\n.markdown-alert-proposition {\n  border: 1px solid rgba(152, 110, 226, 0.35);\n  border-left: 4px solid #986ee2;\n}\n\n.markdown-alert-definition {\n  border: 1px solid rgba(87, 171, 90, 0.35);\n  border-left: 4px solid #57ab5a;\n}\n\n.markdown-alert-axiom,\n.markdown-alert-postulate,\n.markdown-alert-assumption {\n  border: 1px solid rgba(71, 139, 230, 0.35);\n  border-left: 4px solid #478be6;\n}\n\n.markdown-alert-proof {\n  border: 1px solid rgba(156, 163, 175, 0.35);\n  border-left: 4px solid #9ca3af;\n}\n\n.markdown-alert-remark {\n  border: 1px solid rgba(198, 144, 38, 0.35);\n  border-left: 4px solid #c69026;\n}\n\n/* Fallback for custom/unknown names: no icon, theme primary color */\n.alert-title-custom {\n  color: var(--md-primary-color);\n}\n\n.markdown-alert-custom {\n  border-left: 4px solid var(--md-primary-color);\n}\n\n/* Italic body text in academic environments (math convention) */\n.markdown-alert-theorem > :not(.markdown-alert-title),\n.markdown-alert-lemma > :not(.markdown-alert-title),\n.markdown-alert-corollary > :not(.markdown-alert-title),\n.markdown-alert-proposition > :not(.markdown-alert-title),\n.markdown-alert-definition > :not(.markdown-alert-title),\n.markdown-alert-axiom > :not(.markdown-alert-title),\n.markdown-alert-postulate > :not(.markdown-alert-title),\n.markdown-alert-assumption > :not(.markdown-alert-title) {\n  font-style: italic;\n}\n\n/* ==================== Code blocks ==================== */\npre.code__pre,\n.hljs.code__pre {\n  font-size: 90%;\n  overflow-x: auto;\n  border-radius: 8px;\n  padding: 0 !important;\n  line-height: 1.5;\n  margin: calc(10px * var(--md-block-spacing)) 8px;\n}\n\n/* ==================== Images ==================== */\nimg {\n  display: block;\n  max-width: 100%;\n  margin: calc(0.1em * var(--md-block-spacing)) auto calc(0.5em * var(--md-block-spacing));\n  border-radius: 4px;\n}\n\n/* ==================== Lists ==================== */\nol {\n  padding-left: 1em;\n  margin-left: 0;\n  color: hsl(var(--foreground));\n}\n\nul {\n  list-style: circle;\n  padding-left: 1em;\n  margin-left: 0;\n  color: hsl(var(--foreground));\n}\n\nli {\n  display: block;\n  margin: calc(0.2em * var(--md-block-spacing)) 8px;\n  color: hsl(var(--foreground));\n}\n\n/* Footnotes */\n/* footnotes rendered as <p> in buildFootnotes() */\np.footnotes {\n  margin: calc(0.5em * var(--md-block-spacing)) 8px;\n  font-size: 80%;\n  color: hsl(var(--foreground));\n}\n\n/* Diagrams */\nfigure {\n  margin: calc(1.5em * var(--md-block-spacing)) 8px;\n  color: hsl(var(--foreground));\n}\n\nfigcaption,\n.md-figcaption {\n  text-align: center;\n  color: color-mix(in srgb, hsl(var(--foreground)) 50%, transparent);\n  font-size: 0.8em;\n}\n\n/* ==================== Horizontal rules ==================== */\nhr {\n  border-style: solid;\n  border-width: 2px 0 0;\n  border-color: rgba(0, 0, 0, 0.1);\n  -webkit-transform-origin: 0 0;\n  -webkit-transform: scale(1, 0.5);\n  transform-origin: 0 0;\n  transform: scale(1, 0.5);\n  height: 0.4em;\n  margin: calc(1.5em * var(--md-block-spacing)) 0;\n}\n\n/* Inline code */\n.codespan {\n  font-size: 90%;\n  color: var(--md-primary-color);\n  background: color-mix(in srgb, var(--md-primary-color) 8%, transparent);\n  padding: 3px 5px;\n  border-radius: 4px;\n  border: 1px solid color-mix(in srgb, var(--md-primary-color) 20%, transparent);\n}\n\n/* code inside pre (override inline code) */\npre.code__pre > code,\n.hljs.code__pre > code {\n  display: -webkit-box;\n  padding: 0.5em 1em 1em;\n  overflow-x: auto;\n  text-indent: 0;\n  color: inherit;\n  background: none;\n  white-space: nowrap;\n  margin: 0;\n}\n\n/* Emphasis */\nem {\n  font-style: italic;\n  font-size: inherit;\n}\n\n/* ==================== Links ==================== */\na {\n  color: var(--md-link-color);\n  text-decoration: none;\n}\n\n/* ==================== Bold ==================== */\nstrong {\n  color: var(--md-primary-color);\n  font-weight: bold;\n  font-size: inherit;\n}\n\n/* ==================== Strikethrough ==================== */\n.del {\n  color: color-mix(in srgb, hsl(var(--foreground)) 55%, transparent);\n  text-decoration: line-through;\n}\n\n/* ==================== Tables ==================== */\ntable {\n  color: hsl(var(--foreground));\n}\n\nthead {\n  font-weight: bold;\n  color: hsl(var(--foreground));\n}\n\nth {\n  border: 1px solid color-mix(in srgb, hsl(var(--foreground)) 15%, transparent);\n  padding: 0.25em 0.5em;\n  color: hsl(var(--foreground));\n  word-break: keep-all;\n  background: color-mix(in srgb, hsl(var(--foreground)) 5%, transparent);\n}\n\ntd {\n  border: 1px solid color-mix(in srgb, hsl(var(--foreground)) 15%, transparent);\n  padding: 0.25em 0.5em;\n  color: hsl(var(--foreground));\n  word-break: keep-all;\n}\n\n/* ==================== KaTeX ==================== */\n.katex-inline {\n  max-width: 100%;\n  overflow-x: auto;\n  cursor: pointer;\n}\n\n.katex-block {\n  max-width: 100%;\n  overflow-x: auto;\n  -webkit-overflow-scrolling: touch;\n  cursor: pointer;\n  padding: 0.5em 0;\n  text-align: center;\n}\n\n.katex-pending {\n  color: hsl(var(--muted-foreground, 0 0% 45%));\n  font-size: 0.875em;\n}\n\n.katex-block.katex-pending {\n  padding: 0.75em 0;\n}\n\n.katex-inline.katex-pending {\n  opacity: 0.75;\n}\n\n/* ==================== Markup highlight ==================== */\n.markup-highlight {\n  background-color: var(--md-primary-color);\n  padding: 2px 4px;\n  border-radius: 2px;\n  color: #fff;\n}\n\n.markup-underline {\n  text-decoration: underline;\n  text-decoration-color: var(--md-primary-color);\n}\n\n.markup-wavyline {\n  text-decoration: underline wavy;\n  text-decoration-color: var(--md-primary-color);\n  text-decoration-thickness: 2px;\n}\n\n/* line-height: 0 keeps the raised glyph from stretching the line box */\n.markup-superscript {\n  font-size: 0.75em;\n  line-height: 0;\n  vertical-align: super;\n}\n", $e = "/**\n * MD grace theme (@brzhang) — refinements on default\n */\n\n/* Headings */\nh1 {\n  padding: 0.5em 1em;\n  border-bottom: 2px solid var(--md-primary-color);\n  font-size: calc(var(--md-font-size) * 1.4);\n  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);\n}\n\nh2 {\n  padding: 0.3em 1em;\n  border-radius: 8px;\n  font-size: calc(var(--md-font-size) * 1.3);\n  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);\n}\n\nh3 {\n  padding-left: 12px;\n  font-size: calc(var(--md-font-size) * 1.2);\n  border-left: 4px solid var(--md-primary-color);\n  border-bottom: 1px dashed var(--md-primary-color);\n}\n\nh4 {\n  font-size: calc(var(--md-font-size) * 1.1);\n}\n\nh5 {\n  font-size: var(--md-font-size);\n}\n\nh6 {\n  font-size: var(--md-font-size);\n}\n\n/* Blockquote */\nblockquote {\n  font-style: italic;\n  padding: 1em 1em 1em 2em;\n  border-left: 4px solid var(--md-primary-color);\n  border-radius: 6px;\n  color: rgba(0, 0, 0, 0.6);\n  background: var(--md-blockquote-background, transparent);\n  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);\n  margin-bottom: calc(1em * var(--md-block-spacing));\n}\n\n.markdown-alert {\n  font-style: italic;\n}\n\n/* Inline code */\n.codespan {\n  font-family: 'Fira Code', Menlo, Operator Mono, Consolas, Monaco, monospace;\n  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);\n}\n\n/* Code blocks */\npre.code__pre,\n.hljs.code__pre {\n  box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.05);\n}\n\npre.code__pre > code,\n.hljs.code__pre > code {\n  font-family: 'Fira Code', Menlo, Operator Mono, Consolas, Monaco, monospace;\n}\n\n/* Images */\nimg {\n  border-radius: 8px;\n  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);\n}\n\nfigcaption,\n.md-figcaption {\n  text-align: center;\n  color: #888;\n  font-size: 0.8em;\n}\n\n/* Lists */\nol {\n  padding-left: 1.5em;\n}\n\nul {\n  list-style: none;\n  padding-left: 1.5em;\n}\n\nli {\n  margin: calc(0.5em * var(--md-block-spacing)) 8px;\n}\n\n/* Horizontal rules */\nhr {\n  height: 1px;\n  border: none;\n  margin: calc(2em * var(--md-block-spacing)) 0;\n  background: linear-gradient(to right, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0));\n}\n\n/* Tables */\ntable {\n  border-collapse: separate;\n  border-spacing: 0;\n  border-radius: 8px;\n  margin: calc(1em * var(--md-block-spacing)) 8px;\n  color: hsl(var(--foreground));\n  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);\n  overflow: hidden;\n}\n\nthead {\n  color: #fff;\n}\n\ntd {\n  padding: 0.5em 1em;\n}\n\n/* Emphasis */\nem {\n  font-style: italic;\n  font-size: inherit;\n}\n\n/* Links */\na {\n  color: var(--md-link-color);\n  text-decoration: none;\n}\n", et = "/**\n * MD simple theme (@okooo5km) — minimal modern layout\n */\n\n/* Headings */\nh1 {\n  padding: 0.5em 1em;\n  font-size: calc(var(--md-font-size) * 1.4);\n  text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.05);\n}\n\nh2 {\n  padding: 0.3em 1.2em;\n  font-size: calc(var(--md-font-size) * 1.3);\n  border-radius: 8px 24px 8px 24px;\n  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);\n}\n\nh3 {\n  padding-left: 12px;\n  font-size: calc(var(--md-font-size) * 1.2);\n  border-radius: 6px;\n  line-height: 2.4em;\n  border-left: 4px solid var(--md-primary-color);\n  border-right: 1px solid color-mix(in srgb, var(--md-primary-color) 10%, transparent);\n  border-bottom: 1px solid color-mix(in srgb, var(--md-primary-color) 10%, transparent);\n  border-top: 1px solid color-mix(in srgb, var(--md-primary-color) 10%, transparent);\n  background: color-mix(in srgb, var(--md-primary-color) 8%, transparent);\n}\n\nh4 {\n  font-size: calc(var(--md-font-size) * 1.1);\n  border-radius: 6px;\n}\n\nh5 {\n  font-size: var(--md-font-size);\n  border-radius: 6px;\n}\n\nh6 {\n  font-size: var(--md-font-size);\n  border-radius: 6px;\n}\n\n/* Blockquote */\nblockquote {\n  font-style: italic;\n  padding: 1em 1em 1em 2em;\n  color: rgba(0, 0, 0, 0.6);\n  background: var(--md-blockquote-background, transparent);\n  border-bottom: 0.2px solid rgba(0, 0, 0, 0.04);\n  border-top: 0.2px solid rgba(0, 0, 0, 0.04);\n  border-right: 0.2px solid rgba(0, 0, 0, 0.04);\n}\n\n/* GFM alert overrides */\n.markdown-alert-note,\n.markdown-alert-tip,\n.markdown-alert-info,\n.markdown-alert-important,\n.markdown-alert-warning,\n.markdown-alert-caution {\n  font-style: italic;\n}\n\n/* Inline code */\n.codespan {\n  font-family: 'Fira Code', Menlo, Operator Mono, Consolas, Monaco, monospace;\n  border-radius: 6px;\n  border: 1px solid color-mix(in srgb, var(--md-primary-color) 15%, transparent);\n}\n\n/* Code blocks */\npre.code__pre,\n.hljs.code__pre {\n  border: 1px solid rgba(0, 0, 0, 0.04);\n}\n\npre.code__pre > code,\n.hljs.code__pre > code {\n  font-family: 'Fira Code', Menlo, Operator Mono, Consolas, Monaco, monospace;\n}\n\n/* Images */\nimg {\n  border-radius: 8px;\n  border: 1px solid rgba(0, 0, 0, 0.04);\n}\n\nfigcaption,\n.md-figcaption {\n  text-align: center;\n  color: #888;\n  font-size: 0.8em;\n}\n\n/* Lists */\nol {\n  padding-left: 1.5em;\n}\n\nul {\n  list-style: none;\n  padding-left: 1.5em;\n}\n\nli {\n  margin: calc(0.5em * var(--md-block-spacing)) 8px;\n}\n\n/* Horizontal rules */\nhr {\n  height: 1px;\n  border: none;\n  margin: calc(2em * var(--md-block-spacing)) 0;\n  background: linear-gradient(to right, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0));\n}\n\n/* Emphasis */\nem {\n  font-style: italic;\n  font-size: inherit;\n}\n\n/* Links */\na {\n  color: var(--md-link-color);\n  text-decoration: none;\n}\n", tt = Ze, G = {
	default: Qe,
	grace: $e,
	simple: et
};
function nt(e) {
	return Object.keys(G).includes(e);
}
var rt = class {
	styleElement = null;
	styleId = "md-theme";
	inject(e) {
		this.styleElement || (this.styleElement = document.createElement("style"), this.styleElement.id = this.styleId, Ee(this.styleElement)), this.styleElement.textContent = we() ? "#output{--foreground:0 0% 3.9%;--blockquote-background:#f7f7f7;}" + e.replace(/:root/g, "#output").replace(/@import\s+[^;]+;/g, "") : e;
	}
	remove() {
		this.styleElement &&= (this.styleElement.remove(), null);
	}
	isInjected() {
		return this.styleElement !== null;
	}
}, it = null;
function at() {
	return it ||= new rt(), it;
}
function ot() {
	it?.remove(), it = null;
}
function st(e, t) {
	if (t != null && t.trim()) return `${G.default}\n\n${t}`;
	let n = G.default;
	if (e !== "default" && nt(e)) {
		let t = G[e];
		t && (n = `${n}\n\n${t}`);
	}
	return n;
}
async function ct(e) {
	let t = [
		U(e.variables),
		tt,
		H(st(e.themeName, e.themeCSS), "#output"),
		W(e.variables),
		e.customCSS ? H(e.customCSS, "#output") : ""
	].filter(Boolean).join("\n\n");
	t = ze(t), at().inject(t);
}
function K(e) {
	let t = /[\\/:*?"<>|]/g;
	if (!t.test(e) && e.length <= 100) return e.trim() || "untitled";
	let n = e.replace(t, "_").trim();
	return (n.length > 100 ? n.slice(0, 100) : n) || "untitled";
}
function q(e, t, n = "text/plain") {
	if (typeof document > "u") throw TypeError("downloadFile can only be used in browser environment");
	let r = document.createElement("a");
	r.download = t, r.style.display = "none";
	let i = null;
	if (e.startsWith("data:") || e.startsWith("blob:")) r.href = e;
	else if (n === "text/html") r.href = `data:text/html;charset=utf-8,${encodeURIComponent(e)}`;
	else {
		let t = new Blob([e], { type: n });
		i = URL.createObjectURL(t), r.href = i;
	}
	document.body.appendChild(r), r.click(), document.body.removeChild(r), i && URL.revokeObjectURL(i);
}
function lt(e) {
	return new Promise((t, n) => {
		let r = new FileReader();
		r.readAsDataURL(e), r.onload = () => t(r.result.split(",").pop()), r.onerror = (e) => n(e);
	});
}
var ut = /* @__PURE__ */ new Map();
function dt(e) {
	return ut.get(e) ?? (F ? `${F}/emojis/assets/${encodeURIComponent(e)}` : "about:blank");
}
async function ft(e) {
	let t = dt(e);
	return t === "about:blank" ? null : t;
}
function pt(e) {
	for (let t of e) t.url && ut.set(t.id, t.url);
}
function mt(e) {
	for (let t of e) ut.delete(t);
}
function ht(e) {
	let t = /* @__PURE__ */ new Set();
	for (let n of e.matchAll(/(\w[\w-]*)=(?:"[^"]*"|'[^']*')/g)) t.add(n[1]);
	let n = e.match(/(?:^|\s)([A-Z_][\w-]*)\s*=\s*(?:"[^"]*|'[^']*)?$/i);
	return n && t.add(n[1]), t;
}
function gt(e) {
	return e.default !== void 0 && e.default !== "" ? e.default : e.type === "array" ? "[]" : e.type === "boolean" ? "true" : e.type === "number" ? "0" : e.name;
}
function _t(e, t) {
	return t.includes("\"") && !t.includes("'") ? `${e}='${t}'` : t.includes("\"") && t.includes("'") ? `${e}="${t.replace(/"/g, "'")}"` : `${e}="${t}"`;
}
function vt(e, t) {
	if (t) {
		let n = [];
		for (let r of e.props) {
			let e = t[r.name], i = e === void 0 ? "" : e;
			(i !== "" || r.required) && n.push(_t(r.name, i === "" ? gt(r) : i));
		}
		return `<${e.name}${n.length ? ` ${n.join(" ")}` : ""} />`;
	}
	if (e.example) return e.example;
	let n = e.props.map((e) => _t(e.name, gt(e))).join(" ");
	return `<${e.name}${n ? ` ${n}` : ""} />`;
}
var yt = T("customComponent", () => {
	let e = N.reactive(P("custom_components"), []), t = E(() => Pe), n = E(() => {
		let t = new Map(Pe.map((e) => [e.name, e]));
		for (let n of e.value) R(n.name) || t.set(n.name, n);
		return [...t.values()];
	}), r = E(() => {
		let t = Me();
		for (let n of e.value) R(n.name) || (t[n.name] = n);
		return t;
	});
	function i(t) {
		if (R(t.name)) {
			L.error(I("component.nameReserved", { name: t.name }));
			return;
		}
		let n = Date.now(), r = {
			id: j(),
			name: t.name,
			description: t.description,
			template: t.template,
			props: t.props,
			createdAt: n,
			updatedAt: n
		};
		return e.value.push(r), L.success(I("store.component.created", { name: t.name })), r;
	}
	function a(t, n) {
		let r = e.value.findIndex((e) => e.id === t);
		return r === -1 ? (L.error(I("store.component.notFound")), !1) : n.name && R(n.name) ? (L.error(I("component.nameReserved", { name: n.name })), !1) : (e.value[r] = {
			...e.value[r],
			...n,
			updatedAt: Date.now()
		}, L.success(I("store.component.updated")), !0);
	}
	function o(t) {
		let n = e.value.findIndex((e) => e.id === t);
		if (n === -1) return L.error(I("store.component.notFound")), !1;
		let r = e.value[n].name;
		return e.value.splice(n, 1), L.success(I("store.component.deleted", { name: r })), !0;
	}
	function s(t) {
		return e.value.find((e) => e.id === t);
	}
	function c(e, t) {
		return vt(e, t);
	}
	return {
		userComponents: e,
		builtInComponents: t,
		allComponents: n,
		registry: r,
		createComponent: i,
		updateComponent: a,
		deleteComponent: o,
		getComponentById: s,
		buildSnippet: c
	};
});
function bt(e) {
	return `mp:${e}`;
}
function xt(e) {
	return e.startsWith("mp:") && e.length > 3;
}
function St(e) {
	return new Promise((t) => window.setTimeout(t, e));
}
var Ct = 2e4, wt = 250, Tt = ".mermaid-diagram, .plantuml-diagram, .infographic-diagram";
function Et(e) {
	return e?.themeMode ? { themeMode: e.themeMode } : void 0;
}
function Dt(e) {
	for (let t of e.querySelectorAll(Tt)) if (je(t)) return !0;
	return !1;
}
function Ot(e) {
	if (e.querySelector(".katex-fallback")) return !0;
	for (let t of e.querySelectorAll(".katex-block, .katex-inline")) if (!t.querySelector("svg, mjx-container")) return !0;
	return !1;
}
async function J(e = Ct, t) {
	await _e(), await _e();
	let n = O("output");
	if (!n) return !1;
	let r = Et(t), i = Date.now() + e;
	for (; Date.now() < i;) {
		if (z(n, r), !Dt(n) && !Ot(n)) return !0;
		await St(wt);
	}
	return z(n, r), !Dt(n) && !Ot(n);
}
function kt(e) {
	e.querySelectorAll(Tt).forEach((e) => {
		e.querySelector("svg, img") || e.getAttribute(Ne) === ke.loading && e.remove();
	}), e.querySelectorAll(".katex-pending").forEach((e) => {
		e.querySelector("svg, mjx-container") || e.remove();
	});
}
var At = ":root {\n  --foreground: 0 0% 3.9%;\n  --blockquote-background: #f7f7f7;\n}";
async function jt() {
	let e = D("#hljs");
	if (!e) return "";
	try {
		return `<style>${await (await fetch(e.href)).text()}</style>`;
	} catch (e) {
		return console.warn("Failed to fetch highlight.js styles:", e), "";
	}
}
function Mt(e) {
	let t = e;
	return t = t.replace(/#output\s*\{/g, "body {"), t = t.replace(/#output\s+/g, ""), t = t.replace(/^#output\s*/gm, ""), t;
}
function Nt() {
	let e = D("#md-theme");
	return !e || !e.textContent ? (console.warn("[getThemeStyles] theme styles not found"), "") : `<style>${Mt(e.textContent)}</style>`;
}
async function Pt() {
	return [Nt(), await jt()].filter(Boolean).join("");
}
var Y = "[data-png-export-host]", Ft = "png-export-root";
function X(e, t) {
	for (let [n, r] of Object.entries(t)) e.style.setProperty(n, r, "important");
}
function It(e) {
	let t = e.getAttribute("style") ?? "";
	return /overflow(?:-x)?:\s*(?:auto|scroll)/.test(t);
}
function Lt(e) {
	X(e, {
		width: "100%",
		maxWidth: "100%",
		tableLayout: "fixed"
	}), e.querySelectorAll("th, td").forEach((e) => {
		X(e, {
			wordBreak: "break-word",
			whiteSpace: "normal",
			overflowWrap: "anywhere"
		});
	});
}
function Rt(e) {
	e.querySelectorAll(".code-scroll").forEach((e) => {
		X(e, { overflow: "visible" }), e.querySelectorAll("div").forEach((e) => {
			X(e, {
				whiteSpace: "pre-wrap",
				wordBreak: "break-all",
				minWidth: "auto",
				maxWidth: "100%"
			});
		});
	}), e.querySelectorAll("pre.code__pre, .hljs.code__pre").forEach((e) => {
		X(e, { overflow: "visible" });
	}), e.querySelectorAll("pre.code__pre > code, .hljs.code__pre > code").forEach((e) => {
		X(e, {
			overflow: "visible",
			whiteSpace: "pre-wrap",
			wordBreak: "break-all",
			minWidth: "auto",
			maxWidth: "100%"
		});
	}), e.querySelectorAll("pre section, code section").forEach((e) => {
		X(e, { overflow: "visible" });
	});
}
function zt(e) {
	e.querySelectorAll("table.preview-table").forEach((e) => {
		let t = e.parentElement;
		t?.tagName === "SECTION" && X(t, {
			overflow: "visible",
			maxWidth: "100%"
		}), Lt(e);
	}), e.querySelectorAll("section").forEach((e) => {
		It(e) && e.querySelector("table") && (X(e, { overflow: "visible" }), e.querySelectorAll("table").forEach(Lt));
	}), Rt(e);
}
function Bt(e, t) {
	return e.split("\n").map((e) => {
		let n = e.trimStart();
		if (!n || n.startsWith("/*")) return e;
		let r = n.match(/^([^{]+)\{/);
		if (!r) return e;
		let i = r[1].trim(), a = i.split(",").map((e) => `${t} ${e.trim()}`).join(", ");
		return e.replace(i, a);
	}).join("\n");
}
function Vt(e) {
	let t = `${Y} .${Ft}`, n = e;
	return n = n.replace(/#output\s*\{/g, `${t} {`), n = n.replace(/#output\s+/g, `${t} `), n = n.replace(/^#output\s*/gm, `${t} `), n;
}
var Ht = "\n  section:has(> table.preview-table) { overflow: visible !important; }\n  table.preview-table { width: 100% !important; max-width: 100% !important; table-layout: fixed !important; }\n  table.preview-table th, table.preview-table td { word-break: break-word !important; white-space: normal !important; overflow-wrap: anywhere !important; }\n  section[style*=\"overflow-x: auto\"], section[style*=\"overflow: auto\"] { overflow: visible !important; }\n  section[style*=\"overflow-x: auto\"] table, section[style*=\"overflow: auto\"] table { width: 100% !important; max-width: 100% !important; table-layout: fixed !important; }\n  section[style*=\"overflow-x: auto\"] th, section[style*=\"overflow-x: auto\"] td, section[style*=\"overflow: auto\"] th, section[style*=\"overflow: auto\"] td { word-break: break-word !important; white-space: normal !important; overflow-wrap: anywhere !important; }\n  pre.code__pre, .hljs.code__pre, pre.code__pre > code, .hljs.code__pre > code, .code-scroll, pre section, code section { overflow: visible !important; }\n  pre.code__pre > code, .code-scroll, .code-scroll > div { white-space: pre-wrap !important; word-break: break-all !important; min-width: auto !important; max-width: 100% !important; }\n", Ut = Ht.trim();
function Wt(e) {
	return Bt(Ht, e).trim();
}
function Gt() {
	return document.documentElement.classList.contains("dark") && O("output-wrapper")?.classList.contains("output_night") ? "#191919" : "#fff";
}
var Kt = `
  ${Y} .preview {
    position: relative;
    margin: 0 auto;
    padding: 20px;
    font-size: 14px;
    box-sizing: border-box;
    word-wrap: break-word;
  }

  ${Y} .preview table {
    margin-bottom: 10px;
    border-collapse: collapse;
    display: table;
    min-width: 100%;
  }
`;
async function qt() {
	let e = D("#md-theme");
	if (!e?.textContent) return "";
	let t = document.documentElement.classList.contains("dark"), n = [
		`<style>${t ? `${Y} { --foreground: 0 0% 98%; --blockquote-background: #212121; }` : `${Y} { --foreground: 0 0% 3.9%; --blockquote-background: #f7f7f7; }`}</style>`,
		`<style>${Kt}</style>`,
		`<style>${Vt(e.textContent)}</style>`,
		`<style>${Wt(Y)}</style>`
	], r = D("#hljs");
	if (r) try {
		let e = await (await fetch(r.href)).text();
		n.push(`<style>@scope (${Y}) { ${e} }</style>`);
	} catch {}
	return t && O("output-wrapper")?.classList.contains("output_night") && n.push(`<style>${Y} .output_night .preview { background-color: #191919; }</style>`), n.join("");
}
function Jt(e) {
	let t = D("#output");
	if (!t) return "";
	let n = t.cloneNode(!0);
	return n.querySelectorAll(".diagram-download-bar").forEach((e) => e.remove()), z(n, e?.themeMode ? { themeMode: e.themeMode } : void 0), e?.staticLayout && zt(n), n.innerHTML;
}
async function Yt(e = "untitled") {
	await J();
	let t = Jt({ staticLayout: !0 }), n = await Pt();
	q(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${K(e)}</title>
  <style>${At}</style>
  ${n}
  <style>${Ut}</style>
</head>
<body>
  <div style="width: 750px; margin: auto; padding: 20px;">
    ${t}
  </div>
</body>
</html>`, `${K(e)}.html`, "text/html");
}
async function Xt(e, t = "untitled") {
	let n = K(t);
	q(await Fe(e), `${n}.html`, "text/html");
}
var Z = {
	showPageNumbers: !0,
	pageNumberFormat: "nOfM",
	pageNumberPosition: "bottomRight",
	showTitleHeader: !0,
	showSiteFooter: !0,
	margins: "default"
}, Zt = /* @__PURE__ */ new Set(["nOfM", "n"]), Qt = /* @__PURE__ */ new Set([
	"bottomLeft",
	"bottomCenter",
	"bottomRight"
]), $t = /* @__PURE__ */ new Set([
	"compact",
	"default",
	"comfortable"
]), en = {
	compact: "1cm",
	default: "1.5cm 1cm 2cm 1cm",
	comfortable: "2cm 1.5cm 2.5cm 1.5cm"
}, tn = "0.5cm", nn = "https://md.doocs.org";
function rn(e = window.location) {
	return e.protocol === "http:" || e.protocol === "https:" ? e.origin : nn;
}
function an(e) {
	return e.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
var on = {
	bottomLeft: "@bottom-left",
	bottomCenter: "@bottom-center",
	bottomRight: "@bottom-right"
}, sn = [
	"@bottom-left",
	"@bottom-center",
	"@bottom-right"
], cn = [
	"@top-left-corner",
	"@top-left",
	"@top-center",
	"@top-right",
	"@top-right-corner",
	"@bottom-left-corner",
	"@bottom-left",
	"@bottom-center",
	"@bottom-right",
	"@bottom-right-corner",
	"@left-top",
	"@left-middle",
	"@left-bottom",
	"@right-top",
	"@right-middle",
	"@right-bottom"
];
function ln(e) {
	let t = en[e].trim().split(/\s+/);
	return t.length === 1 ? {
		top: t[0],
		right: t[0],
		bottom: t[0],
		left: t[0]
	} : t.length === 2 ? {
		top: t[0],
		right: t[1],
		bottom: t[0],
		left: t[1]
	} : t.length === 3 ? {
		top: t[0],
		right: t[1],
		bottom: t[2],
		left: t[1]
	} : {
		top: t[0],
		right: t[1],
		bottom: t[2],
		left: t[3]
	};
}
function un({ top: e, right: t, bottom: n, left: r }) {
	return e === t && t === n && n === r ? e : e === n && t === r ? `${e} ${t}` : `${e} ${t} ${n} ${r}`;
}
function dn(e, t, n = "") {
	return `
      ${e} {
        content: ${t};${n}
      }`;
}
function fn(e, t) {
	return dn(e, "\"\"", t ? "\n        width: 0;\n        max-width: 0;\n        padding: 0;\n        margin: 0;\n        overflow: hidden;" : "");
}
function pn(e) {
	for (let t of sn) if (t !== e) return t;
	return null;
}
function mn(e) {
	let t = e ?? {};
	return {
		showPageNumbers: typeof t.showPageNumbers == "boolean" ? t.showPageNumbers : Z.showPageNumbers,
		pageNumberFormat: Zt.has(t.pageNumberFormat) ? t.pageNumberFormat : Z.pageNumberFormat,
		pageNumberPosition: Qt.has(t.pageNumberPosition) ? t.pageNumberPosition : Z.pageNumberPosition,
		showTitleHeader: typeof t.showTitleHeader == "boolean" ? t.showTitleHeader : Z.showTitleHeader,
		showSiteFooter: typeof t.showSiteFooter == "boolean" ? t.showSiteFooter : Z.showSiteFooter,
		margins: $t.has(t.margins) ? t.margins : Z.margins
	};
}
function hn(e, t, n = rn()) {
	let r = mn(e), i = K(t), a = an(n), o = ln(r.margins), s = r.showPageNumbers ? on[r.pageNumberPosition] : null, c = r.showSiteFooter ? pn(s) : null, l = r.showTitleHeader, u = !!(s || c), d = o.left, f = {
		top: l ? o.top : d,
		right: o.right,
		bottom: u ? o.bottom : d,
		left: o.left
	}, p = /* @__PURE__ */ new Map();
	if (r.showTitleHeader && p.set("@top-center", dn("@top-center", `"${i}"`, `
        font-size: 12px;
        color: #666;
        vertical-align: bottom;
        padding-bottom: ${tn};`)), c && p.set(c, dn(c, `"${a}"`, `
        font-size: 10px;
        color: #999;
        vertical-align: top;
        padding-top: ${tn};
        white-space: nowrap;`)), r.showPageNumbers && s) {
		let e = r.pageNumberFormat === "n" ? I("store.pdf.pageFooterN") : I("store.pdf.pageFooter");
		p.set(s, dn(s, `"${e}"`, `
        font-size: 10px;
        color: #999;
        vertical-align: top;
        padding-top: ${tn};
        white-space: nowrap;`));
	}
	let m = cn.map((e) => p.get(e) || fn(e, sn.includes(e) && !!(c || s)));
	return `
    @page {
      margin: ${un(f)};${m.join("")}
    }

    html, body {
      margin: 0;
    }`;
}
async function gn(e = "untitled", t) {
	await J();
	let n = Jt({ staticLayout: !0 }), r = await Pt(), i = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${K(e)}</title>
  <style>${At}</style>
  ${r}
  <style>${Ut}</style>
  <style>
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }

    ${hn(mn(t), e, rn())}
  </style>
</head>
<body>
  <div style="width: 100%; max-width: 750px; margin: auto;">
    ${n}
  </div>
</body>
</html>`, a = new Blob([i], { type: "text/html" }), o = URL.createObjectURL(a), s = document.createElement("iframe");
	s.style.cssText = "position:fixed;width:0;height:0;top:-9999px;left:-9999px;border:none;", s.src = o, Te(s);
	let c = () => {
		URL.revokeObjectURL(o), s.parentNode && s.remove();
	};
	s.onload = () => {
		s.contentWindow?.focus(), s.contentWindow?.print(), setTimeout(c, 500);
	}, s.onerror = () => {
		c();
	}, setTimeout(c, 5e3);
}
async function _n(e) {
	let t = O("output");
	if (!t) return null;
	let n = document.documentElement.classList.contains("dark") && O("output-wrapper")?.classList.contains("output_night"), r = e === "mobile" ? "375px" : "750px", i = document.createElement("div");
	i.setAttribute("data-png-export-host", ""), i.style.cssText = "position:fixed;left:-99999px;top:0;z-index:-1;visibility:visible;pointer-events:none;", i.innerHTML = await qt();
	let a = document.createElement("div");
	a.className = n ? "output_night" : "", a.style.width = r;
	let o = document.createElement("div");
	o.className = "preview border-x shadow-xl mx-auto", o.style.width = r, o.style.margin = "0";
	let s = t.cloneNode(!0);
	return s.removeAttribute("id"), s.classList.add(Ft), s.style.width = "100%", s.querySelectorAll(".diagram-download-bar").forEach((e) => e.remove()), kt(s), zt(s), o.appendChild(s), a.appendChild(o), i.appendChild(a), Te(i), {
		el: o,
		content: s,
		cleanup: () => i.remove()
	};
}
function vn() {
	return {
		backgroundColor: Gt(),
		skipFonts: !0,
		pixelRatio: Math.max(window.devicePixelRatio || 1, 2),
		style: { margin: "0" }
	};
}
async function yn(e = "untitled", t) {
	await J();
	let n = await _n(t.previewDevice);
	if (n) try {
		await St(100);
		let { toPng: t } = await import("./es-IlpKT8sT.js");
		q(await t(n.el, vn()), `${K(e)}.png`, "image/png");
	} finally {
		n.cleanup();
	}
}
var bn = [
	2e3,
	4e3,
	6e3,
	8e3
], xn = 4e3;
function Sn(e, t) {
	if (e.length === 0) return [];
	let n = [], r = [], i = e[0].top;
	for (let a = 0; a < e.length; a++) e[a].bottom - i > t && r.length > 0 && (n.push(r), r = [], i = e[a].top), r.push(a);
	return r.length > 0 && n.push(r), n;
}
function Cn(e) {
	return e.map((e) => {
		let t = e.getBoundingClientRect();
		return {
			top: t.top,
			bottom: t.bottom
		};
	});
}
function wn(e) {
	let t = e;
	for (; t.children.length === 1;) {
		let e = t.firstElementChild;
		if (e.tagName !== "SECTION" && e.tagName !== "DIV") break;
		t = e;
	}
	return t;
}
function Tn(e) {
	return Array.from(e.children).filter((e) => {
		let t = e.getBoundingClientRect();
		return t.width > 0 || t.height > 0;
	});
}
async function En(e, t) {
	let { zip: n } = await import("./browser-CVKpqfEq.js").then((e) => e.t), r = {}, i = String(e.length).length;
	for (let n = 0; n < e.length; n++) {
		let a = String(n + 1).padStart(i, "0");
		r[`${t}-${a}.png`] = new Uint8Array(await e[n].arrayBuffer());
	}
	let a = await new Promise((e, t) => n(r, (n, r) => n ? t(n) : e(r))), o = URL.createObjectURL(new Blob([a], { type: "application/zip" }));
	try {
		q(o, `${t}.zip`, "application/zip");
	} finally {
		URL.revokeObjectURL(o);
	}
}
function Dn(e, t) {
	let n = URL.createObjectURL(e);
	try {
		q(n, `${t}.png`, "image/png");
	} finally {
		URL.revokeObjectURL(n);
	}
}
async function On(e = "untitled", t) {
	await J();
	let n = await _n(t.previewDevice);
	if (!n) return 0;
	try {
		await St(100);
		let r = Tn(wn(n.content));
		if (r.length === 0) return 0;
		let i = Sn(Cn(r), t.maxSegmentHeight), a = vn(), { toBlob: o } = await import("./es-IlpKT8sT.js"), s = r.map((e) => e.style.display), c = [];
		try {
			for (let e = 0; e < i.length; e++) {
				let l = new Set(i[e]);
				r.forEach((e, t) => {
					e.style.display = l.has(t) ? s[t] : "none";
				});
				let u = await o(n.el, a);
				u && c.push(u), t.onProgress?.(e + 1, i.length);
			}
		} finally {
			r.forEach((e, t) => {
				e.style.display = s[t];
			});
		}
		if (c.length === 0) return 0;
		let l = K(e);
		return c.length === 1 ? Dn(c[0], l) : await En(c, l), c.length;
	} finally {
		n.cleanup();
	}
}
var kn = T("ui", () => {
	let e = k(), t = e ? w(e.mode === "dark") : Le(), n = B(t), r = N.reactive("showAIToolbox", !0), i = B(r), a = N.reactive("hasShownAIToolboxHint", !1), o = N.reactive(P("is_open_right_slider"), !1), s = N.reactive(P("is_open_post_slider"), !1), c = N.reactive(P("is_open_folder_panel"), !1), l = N.reactive(P("is_open_emoji_manager"), !1), u = B(l), d = N.reactive("isMobile", !1), f = N.reactive("viewMode", "split");
	function p(e) {
		f.value = e;
	}
	let m = N.reactive("previewDevice", "mobile");
	function h(e) {
		m.value = e;
	}
	function g() {
		m.value = m.value === "desktop" ? "mobile" : "desktop";
	}
	let _ = N.reactive(P("enableImageReupload"), !1), v = B(_), y = N.reactive(P("enableScrollSync"), !0), b = B(y), x = N.reactive(P("copyMode"), "txt"), ee = N.reactive("isShowCssEditor", !1), te = B(ee), ne = w(!1);
	function S() {
		ne.value = !0;
	}
	function re() {
		ne.value = !1;
	}
	let ie = w(!1), C = B(ie), ae = w(!1), oe = w(""), se = w(!0), ce = w(null);
	function le(e = {}) {
		oe.value = e.value ?? "", se.value = e.displayMode ?? !0, ce.value = e.sourceRaw ?? null, ae.value = !0;
	}
	function ue() {
		ae.value = !1, oe.value = "", se.value = !0, ce.value = null;
	}
	let de = w(!1), fe = B(de), pe = w(null), me = w(!1), he = B(me), ge = w(null), _e = w(!1), ve = B(_e), be = w(!1), xe = B(be), T = w(!1), Se = w("theme"), E = w("discover");
	function D(e) {
		e?.tab, Se.value = "theme", E.value = e?.view ?? "discover", T.value = !0;
	}
	let we = w(!1), Te = B(we), O = w(!1), Ee = B(O), De = w(!1), A = w("create");
	function j(e) {
		A.value = e?.tab ?? "create", De.value = !0;
	}
	let M = w(!1), F = N.reactive("pdfExportOptions", { ...Z });
	function I() {
		F.value = mn(F.value), M.value = !0;
	}
	let Oe = w(!1), L = B(Oe), ke = w(!1), Ae = B(ke), je = w(!1), R = B(je), Me = w(!1), Ne = B(Me), Pe = w(!1), Fe = B(Pe), z = w(!1), Ie = B(z), Re = w(!1), ze = B(Re), Be = w(null);
	function Ve(e) {
		Be.value = e, be.value = !0;
	}
	let V = w(!1), He = w(!1);
	function Ue(e) {
		V.value = e ?? !V.value;
	}
	function We(e) {
		He.value = e ?? !He.value;
	}
	let H = w(null);
	function Ge(e = "", t = !1) {
		H.value = {
			word: e,
			showReplace: t
		};
	}
	function Ke() {
		H.value = null;
	}
	let qe = w(0);
	function Je() {
		qe.value++;
	}
	let U = !1;
	function W() {
		let t = d.value;
		d.value = (e?.root.clientWidth || window.innerWidth) <= 768, !t && d.value && f.value === "split" ? (f.value = "edit", U = !0) : t && !d.value && U && (f.value = "split", U = !1);
	}
	let Ye;
	return Ce(() => {
		W(), e ? (Ye = new ResizeObserver(W), Ye.observe(e.root)) : window.addEventListener("resize", W);
	}), ye(() => {
		Ye?.disconnect(), window.removeEventListener("resize", W);
	}), {
		isDark: t,
		showAIToolbox: r,
		hasShownAIToolboxHint: a,
		isOpenRightSlider: o,
		isOpenPostSlider: s,
		isMobile: d,
		viewMode: f,
		previewDevice: m,
		isOpenFolderPanel: c,
		isOpenEmojiManager: l,
		enableImageReupload: _,
		enableScrollSync: y,
		copyMode: x,
		isShowCssEditor: ee,
		toggleShowCssEditor: te,
		isShowTableEditDialog: ne,
		openTableEditDialog: S,
		closeTableEditDialog: re,
		isShowUploadImgDialog: ie,
		toggleShowUploadImgDialog: C,
		isShowFormulaEditorDialog: ae,
		formulaEditorValue: oe,
		formulaEditorDisplayMode: se,
		formulaEditorSourceRaw: ce,
		openFormulaEditor: le,
		closeFormulaEditor: ue,
		isShowImportMdDialog: de,
		toggleShowImportMdDialog: fe,
		importMdOpenUrl: pe,
		isShowLocalImageUpload: me,
		toggleShowLocalImageUpload: he,
		localImageUploadData: ge,
		isShowTemplateDialog: _e,
		toggleShowTemplateDialog: ve,
		isShowComponentDialog: be,
		toggleShowComponentDialog: xe,
		isShowMarketplaceDialog: T,
		marketplaceDialogTab: Se,
		marketplaceDialogView: E,
		openMarketplaceDialog: D,
		isShowSyncDialog: we,
		toggleShowSyncDialog: Te,
		isShowAccountDialog: O,
		toggleShowAccountDialog: Ee,
		isShowShareDialog: De,
		shareDialogInitialTab: A,
		openShareDialog: j,
		isShowPdfExportDialog: M,
		openPdfExportDialog: I,
		pdfExportOptions: F,
		isShowAboutDialog: Oe,
		toggleShowAboutDialog: L,
		isShowFundDialog: ke,
		toggleShowFundDialog: Ae,
		isShowMarkdownHelpDialog: je,
		toggleShowMarkdownHelpDialog: R,
		isShowEditorStateDialog: Me,
		toggleShowEditorStateDialog: Ne,
		isShowPreferencesDialog: Pe,
		toggleShowPreferencesDialog: Fe,
		isShowKeyboardShortcutsDialog: z,
		toggleShowKeyboardShortcutsDialog: Ie,
		isShowCommandPalette: Re,
		toggleShowCommandPalette: ze,
		componentDialogTarget: Be,
		openComponentDialogWithTarget: Ve,
		aiDialogVisible: V,
		toggleAIDialog: Ue,
		aiImageDialogVisible: He,
		toggleAIImageDialog: We,
		searchTabRequest: H,
		openSearchTab: Ge,
		clearSearchTabRequest: Ke,
		goToLineRequest: qe,
		requestGoToLine: Je,
		toggleDark: n,
		toggleAIToolbox: i,
		toggleImageReupload: v,
		toggleScrollSync: b,
		toggleShowEmojiManager: u,
		setViewMode: p,
		setPreviewDevice: h,
		togglePreviewDevice: g
	};
}), An = {
	"zh-CN": "/* 全局变量 */\n:root {\n}\n\n/* 根容器 */\n.container {\n}\n\n/* 标题 */\nh1 {\n}\n\nh2 {\n}\n\nh3 {\n}\n\nh4 {\n}\n\nh5 {\n}\n\nh6 {\n}\n\n/* 段落和文本 */\np {\n}\n\nstrong {\n}\n\nem {\n}\n\n/* 引用块 */\nblockquote {\n}\n\nblockquote > p {\n}\n\n/* 代码 */\n/* 行内代码 */\n.codespan {\n}\n\n/* 代码块容器 */\npre.code__pre,\n.hljs.code__pre {\n}\n\n/* 代码块内的 code */\npre.code__pre > code,\n.hljs.code__pre > code {\n}\n\n/* 列表 */\nol {\n}\n\nul {\n}\n\nli {\n}\n\n/* 表格 */\ntable {\n}\n\nthead {\n}\n\nth {\n}\n\ntd {\n}\n\n/* 其他元素 */\nimg {\n}\n\nhr {\n}\n\n/* 分隔线变体：--- */\nhr.hr-dash {\n}\n\n/* 分隔线变体：*** */\nhr.hr-star {\n}\n\n/* 分隔线变体：___ */\nhr.hr-underscore {\n}\n\nfigure {\n}\n\nfigcaption {\n}\n\n/* KaTeX 公式 */\n.katex-inline {\n}\n\n.katex-block {\n}\n\n/* Markup 标记 */\n/* 高亮 ==文本== */\n.markup-highlight {\n}\n\n/* 下划线 ++文本++ */\n.markup-underline {\n}\n\n/* 波浪线 ~文本~ */\n.markup-wavyline {\n}\n\n/* GFM Alert 警告块 */\n/* Alert 标题 */\n.alert-title-note {\n}\n\n.alert-title-tip {\n}\n\n.alert-title-info {\n}\n\n.alert-title-important {\n}\n\n.alert-title-warning {\n}\n\n.alert-title-caution {\n}\n\n.alert-title-abstract {\n}\n\n.alert-title-summary {\n}\n\n.alert-title-tldr {\n}\n\n.alert-title-todo {\n}\n\n.alert-title-success {\n}\n\n.alert-title-done {\n}\n\n.alert-title-question {\n}\n\n.alert-title-help {\n}\n\n.alert-title-faq {\n}\n\n.alert-title-failure {\n}\n\n.alert-title-fail {\n}\n\n.alert-title-missing {\n}\n\n.alert-title-danger {\n}\n\n.alert-title-error {\n}\n\n.alert-title-bug {\n}\n\n.alert-title-example {\n}\n\n.alert-title-quote {\n}\n\n.alert-title-cite {\n}\n\n/* Alert SVG 图标 */\n.alert-icon-note {\n}\n\n.alert-icon-tip {\n}\n\n.alert-icon-info {\n}\n\n.alert-icon-important {\n}\n\n.alert-icon-warning {\n}\n\n.alert-icon-caution {\n}\n\n/* Obsidian-style Callout SVG 图标 */\n.alert-icon-abstract {\n}\n\n.alert-icon-summary {\n}\n\n.alert-icon-tldr {\n}\n\n.alert-icon-todo {\n}\n\n.alert-icon-success {\n}\n\n.alert-icon-done {\n}\n\n.alert-icon-question {\n}\n\n.alert-icon-help {\n}\n\n.alert-icon-faq {\n}\n\n.alert-icon-failure {\n}\n\n.alert-icon-fail {\n}\n\n.alert-icon-missing {\n}\n\n.alert-icon-danger {\n}\n\n.alert-icon-error {\n}\n\n.alert-icon-bug {\n}\n\n.alert-icon-example {\n}\n\n.alert-icon-quote {\n}\n\n.alert-icon-cite {\n}\n",
	"zh-TW": "/* 全域變數 */\n:root {\n}\n\n/* 根容器 */\n.container {\n}\n\n/* 標題 */\nh1 {\n}\n\nh2 {\n}\n\nh3 {\n}\n\nh4 {\n}\n\nh5 {\n}\n\nh6 {\n}\n\n/* 段落和文字 */\np {\n}\n\nstrong {\n}\n\nem {\n}\n\n/* 引用塊 */\nblockquote {\n}\n\nblockquote > p {\n}\n\n/* 程式碼 */\n/* 行內程式碼 */\n.codespan {\n}\n\n/* 程式碼塊容器 */\npre.code__pre,\n.hljs.code__pre {\n}\n\n/* 程式碼塊內的 code */\npre.code__pre > code,\n.hljs.code__pre > code {\n}\n\n/* 清單 */\nol {\n}\n\nul {\n}\n\nli {\n}\n\n/* 表格 */\ntable {\n}\n\nthead {\n}\n\nth {\n}\n\ntd {\n}\n\n/* 其他元素 */\nimg {\n}\n\nhr {\n}\n\n/* 分隔線變體：--- */\nhr.hr-dash {\n}\n\n/* 分隔線變體：*** */\nhr.hr-star {\n}\n\n/* 分隔線變體：___ */\nhr.hr-underscore {\n}\n\nfigure {\n}\n\nfigcaption {\n}\n\n/* KaTeX 公式 */\n.katex-inline {\n}\n\n.katex-block {\n}\n\n/* Markup 標記 */\n/* 高亮 ==文字== */\n.markup-highlight {\n}\n\n/* 底線 ++文字++ */\n.markup-underline {\n}\n\n/* 波浪線 ~文字~ */\n.markup-wavyline {\n}\n\n/* GFM Alert 警告塊 */\n/* Alert 標題 */\n.alert-title-note {\n}\n\n.alert-title-tip {\n}\n\n.alert-title-info {\n}\n\n.alert-title-important {\n}\n\n.alert-title-warning {\n}\n\n.alert-title-caution {\n}\n\n.alert-title-abstract {\n}\n\n.alert-title-summary {\n}\n\n.alert-title-tldr {\n}\n\n.alert-title-todo {\n}\n\n.alert-title-success {\n}\n\n.alert-title-done {\n}\n\n.alert-title-question {\n}\n\n.alert-title-help {\n}\n\n.alert-title-faq {\n}\n\n.alert-title-failure {\n}\n\n.alert-title-fail {\n}\n\n.alert-title-missing {\n}\n\n.alert-title-danger {\n}\n\n.alert-title-error {\n}\n\n.alert-title-bug {\n}\n\n.alert-title-example {\n}\n\n.alert-title-quote {\n}\n\n.alert-title-cite {\n}\n\n/* Alert SVG 圖示 */\n.alert-icon-note {\n}\n\n.alert-icon-tip {\n}\n\n.alert-icon-info {\n}\n\n.alert-icon-important {\n}\n\n.alert-icon-warning {\n}\n\n.alert-icon-caution {\n}\n\n/* Obsidian-style Callout SVG 圖示 */\n.alert-icon-abstract {\n}\n\n.alert-icon-summary {\n}\n\n.alert-icon-tldr {\n}\n\n.alert-icon-todo {\n}\n\n.alert-icon-success {\n}\n\n.alert-icon-done {\n}\n\n.alert-icon-question {\n}\n\n.alert-icon-help {\n}\n\n.alert-icon-faq {\n}\n\n.alert-icon-failure {\n}\n\n.alert-icon-fail {\n}\n\n.alert-icon-missing {\n}\n\n.alert-icon-danger {\n}\n\n.alert-icon-error {\n}\n\n.alert-icon-bug {\n}\n\n.alert-icon-example {\n}\n\n.alert-icon-quote {\n}\n\n.alert-icon-cite {\n}\n",
	"en-US": "/* Global variables */\n:root {\n}\n\n/* Root container */\n.container {\n}\n\n/* Headings */\nh1 {\n}\n\nh2 {\n}\n\nh3 {\n}\n\nh4 {\n}\n\nh5 {\n}\n\nh6 {\n}\n\n/* Paragraphs and text */\np {\n}\n\nstrong {\n}\n\nem {\n}\n\n/* Blockquote */\nblockquote {\n}\n\nblockquote > p {\n}\n\n/* Code */\n/* Inline code */\n.codespan {\n}\n\n/* Code block container */\npre.code__pre,\n.hljs.code__pre {\n}\n\n/* Code inside code block */\npre.code__pre > code,\n.hljs.code__pre > code {\n}\n\n/* Lists */\nol {\n}\n\nul {\n}\n\nli {\n}\n\n/* Tables */\ntable {\n}\n\nthead {\n}\n\nth {\n}\n\ntd {\n}\n\n/* Other elements */\nimg {\n}\n\nhr {\n}\n\n/* Horizontal rule variant: --- */\nhr.hr-dash {\n}\n\n/* Horizontal rule variant: *** */\nhr.hr-star {\n}\n\n/* Horizontal rule variant: ___ */\nhr.hr-underscore {\n}\n\nfigure {\n}\n\nfigcaption {\n}\n\n/* KaTeX */\n.katex-inline {\n}\n\n.katex-block {\n}\n\n/* Markup */\n/* Highlight ==text== */\n.markup-highlight {\n}\n\n/* Underline ++text++ */\n.markup-underline {\n}\n\n/* Wavy underline ~text~ */\n.markup-wavyline {\n}\n\n/* GFM Alert */\n/* Alert titles */\n.alert-title-note {\n}\n\n.alert-title-tip {\n}\n\n.alert-title-info {\n}\n\n.alert-title-important {\n}\n\n.alert-title-warning {\n}\n\n.alert-title-caution {\n}\n\n.alert-title-abstract {\n}\n\n.alert-title-summary {\n}\n\n.alert-title-tldr {\n}\n\n.alert-title-todo {\n}\n\n.alert-title-success {\n}\n\n.alert-title-done {\n}\n\n.alert-title-question {\n}\n\n.alert-title-help {\n}\n\n.alert-title-faq {\n}\n\n.alert-title-failure {\n}\n\n.alert-title-fail {\n}\n\n.alert-title-missing {\n}\n\n.alert-title-danger {\n}\n\n.alert-title-error {\n}\n\n.alert-title-bug {\n}\n\n.alert-title-example {\n}\n\n.alert-title-quote {\n}\n\n.alert-title-cite {\n}\n\n/* Alert SVG icons */\n.alert-icon-note {\n}\n\n.alert-icon-tip {\n}\n\n.alert-icon-info {\n}\n\n.alert-icon-important {\n}\n\n.alert-icon-warning {\n}\n\n.alert-icon-caution {\n}\n\n/* Obsidian-style Callout SVG icons */\n.alert-icon-abstract {\n}\n\n.alert-icon-summary {\n}\n\n.alert-icon-tldr {\n}\n\n.alert-icon-todo {\n}\n\n.alert-icon-success {\n}\n\n.alert-icon-done {\n}\n\n.alert-icon-question {\n}\n\n.alert-icon-help {\n}\n\n.alert-icon-faq {\n}\n\n.alert-icon-failure {\n}\n\n.alert-icon-fail {\n}\n\n.alert-icon-missing {\n}\n\n.alert-icon-danger {\n}\n\n.alert-icon-error {\n}\n\n.alert-icon-bug {\n}\n\n.alert-icon-example {\n}\n\n.alert-icon-quote {\n}\n\n.alert-icon-cite {\n}\n",
	"ja-JP": "/* グローバル変数 */\n:root {\n}\n\n/* ルートコンテナ */\n.container {\n}\n\n/* 見出し */\nh1 {\n}\n\nh2 {\n}\n\nh3 {\n}\n\nh4 {\n}\n\nh5 {\n}\n\nh6 {\n}\n\n/* 段落とテキスト */\np {\n}\n\nstrong {\n}\n\nem {\n}\n\n/* 引用 */\nblockquote {\n}\n\nblockquote > p {\n}\n\n/* コード */\n/* インラインコード */\n.codespan {\n}\n\n/* コードブロックコンテナ */\npre.code__pre,\n.hljs.code__pre {\n}\n\n/* コードブロック内の code */\npre.code__pre > code,\n.hljs.code__pre > code {\n}\n\n/* リスト */\nol {\n}\n\nul {\n}\n\nli {\n}\n\n/* テーブル */\ntable {\n}\n\nthead {\n}\n\nth {\n}\n\ntd {\n}\n\n/* その他の要素 */\nimg {\n}\n\nhr {\n}\n\n/* 区切り線バリアント：--- */\nhr.hr-dash {\n}\n\n/* 区切り線バリアント：*** */\nhr.hr-star {\n}\n\n/* 区切り線バリアント：___ */\nhr.hr-underscore {\n}\n\nfigure {\n}\n\nfigcaption {\n}\n\n/* KaTeX 数式 */\n.katex-inline {\n}\n\n.katex-block {\n}\n\n/* Markup */\n/* ハイライト ==text== */\n.markup-highlight {\n}\n\n/* 下線 ++text++ */\n.markup-underline {\n}\n\n/* 波線 ~text~ */\n.markup-wavyline {\n}\n\n/* GFM Alert */\n/* Alert タイトル */\n.alert-title-note {\n}\n\n.alert-title-tip {\n}\n\n.alert-title-info {\n}\n\n.alert-title-important {\n}\n\n.alert-title-warning {\n}\n\n.alert-title-caution {\n}\n\n.alert-title-abstract {\n}\n\n.alert-title-summary {\n}\n\n.alert-title-tldr {\n}\n\n.alert-title-todo {\n}\n\n.alert-title-success {\n}\n\n.alert-title-done {\n}\n\n.alert-title-question {\n}\n\n.alert-title-help {\n}\n\n.alert-title-faq {\n}\n\n.alert-title-failure {\n}\n\n.alert-title-fail {\n}\n\n.alert-title-missing {\n}\n\n.alert-title-danger {\n}\n\n.alert-title-error {\n}\n\n.alert-title-bug {\n}\n\n.alert-title-example {\n}\n\n.alert-title-quote {\n}\n\n.alert-title-cite {\n}\n\n/* Alert SVG アイコン */\n.alert-icon-note {\n}\n\n.alert-icon-tip {\n}\n\n.alert-icon-info {\n}\n\n.alert-icon-important {\n}\n\n.alert-icon-warning {\n}\n\n.alert-icon-caution {\n}\n\n/* Obsidian-style Callout SVG アイコン */\n.alert-icon-abstract {\n}\n\n.alert-icon-summary {\n}\n\n.alert-icon-tldr {\n}\n\n.alert-icon-todo {\n}\n\n.alert-icon-success {\n}\n\n.alert-icon-done {\n}\n\n.alert-icon-question {\n}\n\n.alert-icon-help {\n}\n\n.alert-icon-faq {\n}\n\n.alert-icon-failure {\n}\n\n.alert-icon-fail {\n}\n\n.alert-icon-missing {\n}\n\n.alert-icon-danger {\n}\n\n.alert-icon-error {\n}\n\n.alert-icon-bug {\n}\n\n.alert-icon-example {\n}\n\n.alert-icon-quote {\n}\n\n.alert-icon-cite {\n}\n"
};
function jn(e = "zh-CN") {
	return An[e] ?? An["zh-CN"];
}
var Mn = [
	le(),
	g(),
	h(),
	i(),
	te(),
	m(),
	re.allowMultipleSelections.of(!0),
	se(),
	o(ge, { fallback: !0 }),
	a(),
	n(),
	r(),
	_(),
	ce(),
	ae(),
	y(),
	b(),
	S.of([
		...s,
		...he,
		...f,
		...me,
		...d,
		...e,
		...fe,
		{
			key: "Tab",
			run: u
		},
		l
	])
];
function Q(e, { prefix: t, suffix: n, check: r, afterInsertCursorOffset: i = 0 }) {
	let a = e.state.selection.main, o = e.state.doc.sliceString(a.from, a.to), s = r?.(o) ?? !1, c;
	if (s) c = o.slice(t.length, o.length - n.length), e.dispatch(e.state.replaceSelection(c));
	else if (c = `${t}${o}${n}`, e.dispatch(e.state.replaceSelection(c)), i !== 0) {
		let t = e.state.selection.main.head + i;
		e.dispatch({ selection: { anchor: t } });
	}
}
function $(e, t) {
	let n = e.state.selection.ranges, r = [], i = `${"#".repeat(t)} `;
	if (n.forEach((t) => {
		let n = e.state.doc.lineAt(t.from), a = e.state.doc.lineAt(t.to);
		for (let t = n.number; t <= a.number; t++) {
			let n = e.state.doc.line(t), a = e.state.doc.sliceString(n.from, n.to).replace(/^#{1,6}\s+/, "").trimStart(), o = i + a;
			r.push({
				from: n.from,
				to: n.to,
				insert: o
			});
		}
	}), r.length > 0) {
		let t = e.state.doc.lineAt(n[0].from).from + i.length;
		e.dispatch({
			changes: r,
			selection: { anchor: t }
		});
	}
}
function Nn(e) {
	Q(e, {
		prefix: "**",
		suffix: "**",
		check: (e) => e.startsWith("**") && e.endsWith("**"),
		afterInsertCursorOffset: -2
	});
}
function Pn(e) {
	Q(e, {
		prefix: "*",
		suffix: "*",
		check: (e) => e.startsWith("*") && e.endsWith("*"),
		afterInsertCursorOffset: -1
	});
}
function Fn(e) {
	Q(e, {
		prefix: "~~",
		suffix: "~~",
		check: (e) => e.startsWith("~~") && e.endsWith("~~"),
		afterInsertCursorOffset: -2
	});
}
function In(e) {
	Q(e, {
		prefix: "[",
		suffix: "]()",
		check: (e) => e.startsWith("[") && e.endsWith("]()"),
		afterInsertCursorOffset: -1
	});
}
function Ln(e) {
	Q(e, {
		prefix: "`",
		suffix: "`",
		check: (e) => e.startsWith("`") && e.endsWith("`"),
		afterInsertCursorOffset: -1
	});
}
function Rn(e) {
	let t = e.state.selection.main, n = e.state.doc.sliceString(t.from, t.to).split("\n"), r = n.every((e) => e.trim().startsWith("- ")) ? n.map((e) => e.replace(/^- +/, "")).join("\n") : n.map((e) => `- ${e}`).join("\n");
	e.dispatch(e.state.replaceSelection(r));
}
function zn(e) {
	let t = e.state.selection.main, n = e.state.doc.sliceString(t.from, t.to).split("\n"), r = n.every((e) => /^\d+\.\s/.test(e.trim())) ? n.map((e) => e.replace(/^\d+\.\s+/, "")).join("\n") : n.map((e, t) => `${t + 1}. ${e}`).join("\n");
	e.dispatch(e.state.replaceSelection(r));
}
function Bn(e) {
	return pe(e);
}
function Vn(e) {
	return t(e);
}
var Hn = [
	c.of({
		name: "C",
		extensions: ["c", "h"],
		load: () => import("./dist-CKHFdyIa.js").then((e) => e.cpp())
	}),
	c.of({
		name: "C++",
		alias: ["cpp"],
		extensions: [
			"cpp",
			"cc",
			"cxx",
			"hpp",
			"hh"
		],
		load: () => import("./dist-CKHFdyIa.js").then((e) => e.cpp())
	}),
	c.of({
		name: "CSS",
		extensions: ["css"],
		load: () => import("./codemirror-C3tEDw1q.js").then((e) => e.u).then((e) => e.css())
	}),
	c.of({
		name: "Go",
		extensions: ["go"],
		load: () => import("./dist-BZUIPWhT.js").then((e) => e.go())
	}),
	c.of({
		name: "HTML",
		alias: ["xhtml"],
		extensions: ["html", "htm"],
		load: () => import("./codemirror-C3tEDw1q.js").then((e) => e.o).then((e) => e.html())
	}),
	c.of({
		name: "Java",
		extensions: ["java"],
		load: () => import("./dist-CKT5BxhH.js").then((e) => e.java())
	}),
	c.of({
		name: "JavaScript",
		alias: [
			"js",
			"javascript",
			"nodejs"
		],
		extensions: [
			"js",
			"mjs",
			"cjs"
		],
		load: () => import("./codemirror-C3tEDw1q.js").then((e) => e.c).then((e) => e.javascript())
	}),
	c.of({
		name: "JSON",
		alias: ["json5"],
		extensions: ["json"],
		load: () => import("./dist-D59A65n_.js").then((e) => e.json())
	}),
	c.of({
		name: "JSX",
		extensions: ["jsx"],
		load: () => import("./codemirror-C3tEDw1q.js").then((e) => e.c).then((e) => e.javascript({ jsx: !0 }))
	}),
	c.of({
		name: "Markdown",
		alias: ["md"],
		extensions: ["md", "markdown"],
		load: () => import("./codemirror-C3tEDw1q.js").then((e) => e.r).then((e) => e.markdown())
	}),
	c.of({
		name: "PHP",
		extensions: [
			"php",
			"php3",
			"php4",
			"php5",
			"php7",
			"phtml"
		],
		load: () => import("./dist-BLy4XDkZ.js").then((e) => e.php())
	}),
	c.of({
		name: "Python",
		alias: ["py"],
		extensions: ["py", "pyw"],
		load: () => import("./dist-CUznL96T.js").then((e) => e.python())
	}),
	c.of({
		name: "Rust",
		alias: ["rs"],
		extensions: ["rs"],
		load: () => import("./dist-DDDV7C0t.js").then((e) => e.rust())
	}),
	c.of({
		name: "SQL",
		extensions: ["sql"],
		load: () => import("./dist-DTIuew6s.js").then((e) => e.sql())
	}),
	c.of({
		name: "TSX",
		extensions: ["tsx"],
		load: () => import("./codemirror-C3tEDw1q.js").then((e) => e.c).then((e) => e.javascript({
			jsx: !0,
			typescript: !0
		}))
	}),
	c.of({
		name: "TypeScript",
		alias: ["ts"],
		extensions: [
			"ts",
			"mts",
			"cts"
		],
		load: () => import("./codemirror-C3tEDw1q.js").then((e) => e.c).then((e) => e.javascript({ typescript: !0 }))
	}),
	c.of({
		name: "XML",
		alias: [
			"rss",
			"wsdl",
			"xsd"
		],
		extensions: [
			"xml",
			"xsl",
			"xsd"
		],
		load: () => import("./dist-BvAVXpEm.js").then((e) => e.xml())
	}),
	c.of({
		name: "YAML",
		alias: ["yml"],
		extensions: ["yaml", "yml"],
		load: () => import("./dist-DwlXcRCs.js").then((e) => e.yaml())
	})
];
async function Un(e) {
	let t = e.state.doc.toString(), { formatDoc: n } = await import("./formatDoc-BDYZgvY1.js"), r = await n(t, "markdown");
	e.dispatch({ changes: {
		from: 0,
		to: e.state.doc.length,
		insert: r
	} });
}
function Wn(e) {
	let t = e.state.changeByRange((e) => ({
		changes: {
			from: e.from,
			to: e.to,
			insert: "  "
		},
		range: oe.range(e.from + 2, e.from + 2)
	}));
	return e.dispatch(t), !0;
}
function Gn(e) {
	let { onSearch: t, onReplace: n, onGoToLine: r } = e || {};
	return S.of([
		{
			key: "Tab",
			run: Wn
		},
		{
			key: "Mod-z",
			run: Bn
		},
		{
			key: "Mod-y",
			run: Vn
		},
		{
			key: "Mod-b",
			run: (e) => (Nn(e), !0)
		},
		{
			key: "Mod-i",
			run: (e) => (Pn(e), !0)
		},
		{
			key: "Mod-d",
			run: (e) => (Fn(e), !0)
		},
		{
			key: "Mod-k",
			run: (e) => (In(e), !0)
		},
		{
			key: "Mod-e",
			run: (e) => (Ln(e), !0)
		},
		{
			key: "Mod-1",
			run: (e) => ($(e, 1), !0)
		},
		{
			key: "Mod-2",
			run: (e) => ($(e, 2), !0)
		},
		{
			key: "Mod-3",
			run: (e) => ($(e, 3), !0)
		},
		{
			key: "Mod-4",
			run: (e) => ($(e, 4), !0)
		},
		{
			key: "Mod-5",
			run: (e) => ($(e, 5), !0)
		},
		{
			key: "Mod-6",
			run: (e) => ($(e, 6), !0)
		},
		{
			key: "Mod-u",
			run: (e) => (Rn(e), !0)
		},
		{
			key: "Mod-o",
			run: (e) => (zn(e), !0)
		},
		...t ? [{
			key: "Mod-f",
			run: (e) => (t(e), !0)
		}] : [],
		...n ? [{
			key: "Mod-h",
			run: (e) => (n(e), !0)
		}] : [],
		{
			key: "Shift-Alt-f",
			run: (e) => (Un(e), !0)
		},
		...r ? [{
			key: "Mod-g",
			run: (e) => (r(e), !0)
		}] : [{
			key: "Mod-g",
			run: () => !0
		}]
	]);
}
function Kn(e) {
	let { placeholder: t, withoutHistory: r } = e || {};
	return [
		...r ? [] : [h()],
		y(),
		n(),
		b(),
		ee({
			base: p,
			codeLanguages: Hn,
			addKeymap: !0
		}),
		x.high(Gn(e)),
		i(),
		S.of([
			...he,
			...me,
			...s,
			...d
		]),
		C.lineWrapping,
		re.allowMultipleSelections.of(!0),
		...t ? [de(t)] : []
	];
}
var qn = C.theme({
	".cm-gutterElement": {
		display: "flex",
		justifyContent: "right",
		alignItems: "center"
	},
	"&.cm-editor .cm-gutters": {
		backgroundColor: "transparent !important",
		borderRight: "none !important",
		padding: "0 !important"
	},
	".cm-foldGutter": {
		width: "10px !important",
		overflow: "hidden"
	},
	".cm-foldGutter .cm-gutterElement": {
		padding: "0 !important",
		width: "10px !important",
		minWidth: "unset !important"
	},
	".cm-foldGutter .cm-gutterElement span": {
		opacity: "0",
		transition: "opacity 0.15s ease"
	},
	"&.cm-editor .cm-gutters:hover .cm-foldGutter .cm-gutterElement span": { opacity: "1" }
});
function Jn() {
	return [ue, qn];
}
function Yn() {
	return [ie, qn];
}
function Xn(e) {
	return e ? Yn() : Jn();
}
async function Zn(e) {
	let t = e.state.doc.toString(), { formatDoc: n } = await import("./formatDoc-BDYZgvY1.js"), r = await n(t, "css");
	e.dispatch({ changes: {
		from: 0,
		to: e.state.doc.length,
		insert: r
	} });
}
function Qn() {
	return [
		Mn,
		ne(),
		C.lineWrapping,
		S.of([{
			key: "Shift-Alt-f",
			run: (e) => (Zn(e), !0)
		}])
	];
}
function $n() {
	return jn(Oe());
}
var er = T("cssEditor", () => {
	let e = k() ? E(() => kn().isDark) : Le(), t = w(null), n = w(null), r = N.reactive(P("css_content_config"), {
		active: "",
		tabs: []
	});
	ve(() => {
		let e = /* @__PURE__ */ new Date();
		if (r.value.tabs.length === 0) {
			let t = j();
			r.value.tabs = [{
				id: t,
				title: I("store.cssEditor.schemeDefault"),
				name: I("store.cssEditor.schemeDefault"),
				content: $n(),
				createDatetime: e,
				updateDatetime: e
			}], r.value.active = t;
			return;
		}
		if (r.value.tabs = r.value.tabs.map((t, n) => ({
			...t,
			id: t.id ?? j(),
			createDatetime: t.createDatetime ?? new Date(e.getTime() + n),
			updateDatetime: t.updateDatetime ?? new Date(e.getTime() + n)
		})), !r.value.tabs.find((e) => e.id === r.value.active)) {
			let e = r.value.tabs.find((e) => e.name === r.value.active);
			r.value.active = e?.id ?? r.value.tabs[0].id;
		}
	});
	let i = () => {
		let e = r.value.tabs.find((e) => e.id === r.value.active);
		if (!e) {
			if (r.value.tabs.length === 0) {
				let e = j(), t = /* @__PURE__ */ new Date();
				return r.value.tabs = [{
					id: e,
					title: I("store.cssEditor.schemeDefault"),
					name: I("store.cssEditor.schemeDefault"),
					content: $n(),
					createDatetime: t,
					updateDatetime: t
				}], r.value.active = e, r.value.tabs[0];
			}
			return r.value.active = r.value.tabs[0].id, r.value.tabs[0];
		}
		return e;
	}, a = () => i().content, o = (e) => {
		t.value && t.value.dispatch({ changes: {
			from: 0,
			to: t.value.state.doc.length,
			insert: e
		} });
	}, s = null;
	return be(e, () => {
		t.value && n.value && t.value.dispatch({ effects: n.value.reconfigure(Xn(e.value)) });
	}), {
		cssEditor: t,
		cssContentConfig: r,
		isSelectMode: E(() => r.value.isSelectMode ?? !1),
		selectedIds: E(() => r.value.selectedIds ?? []),
		getCurrentTab: i,
		getCurrentTabContent: a,
		setCssEditorValue: o,
		setOnTabChangedCallback: (e) => {
			s = e;
		},
		tabChanged: (e) => {
			r.value.active = e;
			let t = r.value.tabs.find((t) => t.id === e);
			t && (o(t.content), s && s(t.content));
		},
		renameTab: (e) => {
			let t = i();
			t.title = e, t.name = e;
		},
		addCssContentTab: (e, t) => {
			let n = t ?? $n(), i = /* @__PURE__ */ new Date();
			r.value.tabs.push({
				id: j(),
				name: e,
				title: e,
				content: n,
				createDatetime: i,
				updateDatetime: i
			});
			let a = r.value.tabs[r.value.tabs.length - 1];
			r.value.active = a.id, o(n), s && s(n);
		},
		resetCssConfig: () => {
			let e = $n(), n = j();
			r.value = {
				active: n,
				tabs: [{
					id: n,
					title: I("store.cssEditor.schemeDefaultSpaced"),
					name: I("store.cssEditor.schemeDefaultSpaced"),
					content: e,
					createDatetime: /* @__PURE__ */ new Date(),
					updateDatetime: /* @__PURE__ */ new Date()
				}]
			}, t.value && t.value.dispatch({ changes: {
				from: 0,
				to: t.value.state.doc.length,
				insert: e
			} });
		},
		initCssEditor: (r) => {
			let a = D("#cssEditor");
			if (!a) return;
			a.value = i().content;
			let o = document.createElement("div");
			o.className = "w-full h-full", a.parentNode?.replaceChild(o, a), n.value = new v();
			let s = re.create({
				doc: i().content,
				extensions: [
					Qn(),
					n.value.of(Xn(e.value)),
					C.updateListener.of((e) => {
						if (e.docChanged) {
							let t = e.state.doc.toString(), n = i();
							n.content = t, n.updateDatetime = /* @__PURE__ */ new Date(), r(t);
						}
					})
				]
			});
			t.value = Se(new C({
				state: s,
				parent: o
			}));
		},
		scrollToHeading: (e) => {
			if (!t.value) return;
			let n = t.value.state.doc.toString(), r = RegExp(`^${e}\\s*\\{`, "m"), i = n.match(r);
			if (i && i.index !== void 0) {
				let e = i.index, r = 0, a = e, o = !1;
				for (let t = e; t < n.length; t++) if (n[t] === "{") r++, o = !0;
				else if (n[t] === "}" && (r--, o && r === 0)) {
					a = t + 1;
					break;
				}
				t.value.dispatch({
					selection: {
						anchor: e,
						head: a
					},
					scrollIntoView: !0
				}), t.value.focus();
			}
		},
		toggleSelectMode: () => {
			r.value.isSelectMode = !(r.value.isSelectMode ?? !1), r.value.isSelectMode || (r.value.selectedIds = []);
		},
		toggleSelectTab: (e) => {
			let t = r.value.selectedIds ?? [];
			t.indexOf(e) === -1 ? r.value.selectedIds = [...t, e] : r.value.selectedIds = t.filter((t) => t !== e);
		},
		selectAllTabs: () => {
			r.value.selectedIds = r.value.tabs.map((e) => e.id);
		},
		clearSelection: () => {
			r.value.selectedIds = [];
		},
		batchDeleteTabs: () => {
			let e = r.value.selectedIds ?? [];
			if (e.length === 0) return;
			if (e.length >= r.value.tabs.length) {
				L.warning(I("store.cssEditor.keepAtLeastOne"));
				return;
			}
			let t = r.value.tabs.filter((t) => !e.includes(t.id));
			e.includes(r.value.active) && (r.value.active = t[0].id, o(t[0].content), s && s(t[0].content)), r.value.tabs = t, r.value.selectedIds = [], r.value.isSelectMode = !1, L.success(I("store.cssEditor.batchDeleted", { count: e.length }));
		},
		batchExportTabs: async () => {
			let e = r.value.selectedIds ?? [];
			if (e.length !== 0) {
				if (e.length === 1) {
					let t = r.value.tabs.find((t) => t.id === e[0]);
					t && q(`data:text/css;charset=utf-8,${encodeURIComponent(t.content)}`, `${K(t.title)}.css`);
				} else {
					let { strToU8: t, zip: n } = await import("./browser-CVKpqfEq.js").then((e) => e.t), i = {};
					e.forEach((e) => {
						let n = r.value.tabs.find((t) => t.id === e);
						n && (i[`${K(n.title)}.css`] = t(n.content));
					});
					let a = await new Promise((e, t) => n(i, (n, r) => n ? t(n) : e(r))), o = URL.createObjectURL(new Blob([a], { type: "application/zip" }));
					q(o, "css-schemes.zip"), URL.revokeObjectURL(o);
				}
				r.value.selectedIds = [], r.value.isSelectMode = !1, L.success(I("store.cssEditor.batchExported", { count: e.length }));
			}
		},
		exportSingleTab: (e) => {
			let t = r.value.tabs.find((t) => t.id === e);
			t && (q(`data:text/css;charset=utf-8,${encodeURIComponent(t.content)}`, `${K(t.title)}.css`), L.success(I("store.cssEditor.singleExported", { name: t.title })));
		}
	};
}), tr = T("theme", () => {
	let e = N.reactive(P("theme"), A.theme), t = N.reactive(P("themeSettings"), {}), n = E(() => t.value[e.value] ?? M()), r = E({
		get: () => n.value.primaryColor,
		set: (e) => {
			m("primaryColor", e);
		}
	}), i = E({
		get: () => n.value.fontFamily,
		set: (e) => {
			m("fontFamily", e);
		}
	}), a = E({
		get: () => n.value.fontSize,
		set: (e) => {
			m("fontSize", e);
		}
	}), o = E({
		get: () => n.value.lineHeight ?? A.lineHeight,
		set: (e) => {
			m("lineHeight", e);
		}
	}), s = E({
		get: () => n.value.blockSpacing ?? A.blockSpacing,
		set: (e) => {
			m("blockSpacing", e);
		}
	}), c = E({
		get: () => n.value.linkColor ?? A.linkColor,
		set: (e) => {
			m("linkColor", e);
		}
	}), l = E({
		get: () => n.value.blockquoteBackground ?? A.blockquoteBackground,
		set: (e) => {
			m("blockquoteBackground", e);
		}
	}), u = E({
		get: () => n.value.codeBlockTheme,
		set: (e) => {
			m("codeBlockTheme", e);
		}
	}), d = E({
		get: () => n.value.headingStyles,
		set: (e) => {
			m("headingStyles", e);
		}
	}), f = E({
		get: () => n.value.isShowLineNumber,
		set: (e) => {
			m("isShowLineNumber", e);
		}
	}), p = E({
		get: () => n.value.isMacCodeBlock,
		set: (e) => {
			m("isMacCodeBlock", e);
		}
	});
	function m(n, r) {
		let i = e.value, a = t.value[i] ?? M();
		t.value = {
			...t.value,
			[i]: {
				...a,
				[n]: r
			}
		};
	}
	let h = N.reactive("isCiteStatus", A.isCiteStatus), g = N.reactive("isCountStatus", A.isCountStatus), _ = N.reactive(P("use_indent"), !1), v = N.reactive(P("use_justify"), !1), y = N.reactive("legend", A.legend), b = N.reactive("previewWidth", De[0].value);
	return {
		theme: e,
		themeSettings: t,
		fontFamily: i,
		fontSize: a,
		fontSizeNumber: E(() => Number(a.value.replace("px", ""))),
		lineHeight: o,
		blockSpacing: s,
		linkColor: c,
		blockquoteBackground: l,
		primaryColor: r,
		codeBlockTheme: u,
		legend: y,
		isMacCodeBlock: p,
		isShowLineNumber: f,
		isCiteStatus: h,
		isCountStatus: g,
		isUseIndent: _,
		isUseJustify: v,
		previewWidth: b,
		headingStyles: d,
		toggleMacCodeBlock: B(p),
		toggleShowLineNumber: B(f),
		toggleCiteStatus: B(h),
		toggleCountStatus: B(g),
		toggleUseIndent: B(_),
		toggleUseJustify: B(v),
		resetStyle: () => {
			t.value = {
				...t.value,
				[e.value]: M()
			}, h.value = A.isCiteStatus, g.value = A.isCountStatus, y.value = A.legend, _.value = !1, v.value = !1;
		},
		updateCodeTheme: () => {
			if (k()) return;
			let e = u.value, t = D("#hljs");
			if (t) {
				if (t.getAttribute("href") === e) return;
				t.setAttribute("href", e);
			} else {
				let t = document.createElement("link");
				t.setAttribute("type", "text/css"), t.setAttribute("rel", "stylesheet"), t.setAttribute("href", e), t.setAttribute("id", "hljs"), Ee(t);
			}
		},
		applyCurrentTheme: async () => {
			let t = k();
			try {
				if (t && (!t.live || t.signal.aborted)) return;
				let n = er().getCurrentTabContent(), u;
				if (xt(e.value)) {
					let { useMarketplaceStore: t } = await import("./marketplace-Bubu1InB.js").then((e) => e.t);
					u = t().getInstalledThemeCss(e.value);
				}
				if (t && (!t.live || t.signal.aborted)) return;
				await ct({
					themeName: e.value,
					themeCSS: u,
					customCSS: n,
					variables: {
						primaryColor: r.value,
						fontFamily: i.value,
						fontSize: a.value,
						lineHeight: o.value,
						blockSpacing: s.value,
						linkColor: c.value,
						blockquoteBackground: l.value,
						isUseIndent: _.value,
						isUseJustify: v.value,
						headingStyles: d.value
					}
				});
			} catch (e) {
				console.error("[applyCurrentTheme] 主题应用失败:", e);
			}
		},
		setHeadingStyle: (e, t) => {
			let n = d.value;
			d.value = {
				...n,
				[e]: t === "default" ? void 0 : t
			};
		},
		getHeadingStyle: (e) => d.value[e] || "default"
	};
}), nr = T("render", () => {
	let e = k(), t = () => !e || e.live && !e.signal.aborted, n = w(""), r = xe({
		chars: 0,
		words: 0,
		minutes: 0
	}), i = w([]), a = null, o = "", s = "", c = null, l = null, u = () => a, d = () => ({
		mermaidLoading: I("store.diagram.mermaidLoading"),
		mermaidError: I("store.diagram.mermaidError"),
		plantumlLoading: I("store.diagram.plantumlLoading"),
		plantumlError: I("store.diagram.plantumlError"),
		infographicLoading: I("store.diagram.infographicLoading"),
		infographicError: I("store.diagram.infographicError")
	}), f = () => ({ summary: I("store.count.summary", {
		words: "{words}",
		minutes: "{minutes}"
	}) }), p = () => ({
		footnoteTitle: I("store.render.footnoteTitle"),
		unknownComponent: I("store.render.unknownComponent"),
		katexLoading: I("store.render.katexLoading")
	});
	function m(e) {
		return Object.keys(e.registry).sort().map((t) => {
			let n = e.registry[t];
			return [
				t,
				n.updatedAt ?? 0,
				n.template,
				JSON.stringify(n.props ?? [])
			].join("");
		}).join("");
	}
	function h(e, t, n) {
		return [
			e,
			t.isCiteStatus ? "1" : "0",
			t.legend,
			t.isCountStatus ? "1" : "0",
			t.isMacCodeBlock ? "1" : "0",
			t.isShowLineNumber ? "1" : "0",
			m(n),
			I("store.count.summary", {
				words: "{words}",
				minutes: "{minutes}"
			}),
			I("store.render.footnoteTitle"),
			I("store.render.unknownComponent"),
			I("store.render.katexLoading"),
			I("store.diagram.mermaidLoading")
		].join("");
	}
	let g = (e) => {
		let t = a.getHeadings();
		i.value = t.map((e, t) => ({
			url: `#${t}`,
			title: e.text,
			level: e.level
		}));
		let n = 0;
		return e.replace(/data-heading="true"/g, () => `data-heading="true" id="${n++}"`);
	}, _ = (i, c) => {
		if (!t()) return n.value;
		if (!a) return l = {
			content: i,
			options: c
		}, n.value;
		let u = tr(), m = kn(), _ = yt(), v = c?.themeMode ?? (e ? "light" : m.isDark ? "dark" : "light"), y = h(v, u, _);
		if (!c?.force && i === s && y === o) return n.value;
		a.reset({
			citeStatus: u.isCiteStatus,
			legend: u.legend,
			countStatus: u.isCountStatus,
			isMacCodeBlock: u.isMacCodeBlock,
			isShowLineNumber: u.isShowLineNumber,
			themeMode: v,
			components: _.registry,
			diagramMessages: d(),
			countMessages: f(),
			renderMessages: p(),
			assetResolver: dt
		});
		let { html: b, readingTime: x } = Ie(i, a);
		return r.chars = i.length, r.words = x.words, r.minutes = Math.ceil(x.minutes), n.value = g(Ae(b, x, a)), s = i, o = y, n.value;
	};
	function v() {
		if (!l || !a) return;
		let e = l;
		l = null, _(e.content, e.options);
	}
	return {
		output: n,
		readingTime: r,
		titleList: i,
		initRendererInstance: async (e) => {
			if (c ??= import("./renderer-2bSccpei.js").then((e) => e.t).then(({ initRenderer: n }) => {
				if (!t()) throw Error("稿件已关闭");
				return a = n(e || {}), o = "", s = "", a;
			}).catch((e) => {
				throw c = null, e;
			}), await c, !t()) throw Error("稿件已关闭");
			return v(), a;
		},
		getRenderer: u,
		render: _
	};
});
export { bt as A, K as B, Jt as C, J as D, Pt as E, pt as F, nt as H, dt as I, mt as L, ht as M, vt as N, St as O, ft as P, q as R, Xt as S, At as T, G as U, ot as V, U as W, bn as _, Kn as a, gn as b, Ln as c, zn as d, Fn as f, xn as g, kn as h, Xn as i, yt as j, xt as k, Pn as l, jn as m, tr as n, $ as o, Rn as p, er as r, Nn as s, nr as t, In as u, On as v, Ut as w, Yt as x, yn as y, lt as z };
