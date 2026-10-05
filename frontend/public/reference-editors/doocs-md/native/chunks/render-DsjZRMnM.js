import { I as e, L as t, R as n, Z as r, dt as i, lt as a, n as o, st as s, y as c, z as l } from "./vendor_vue-OlfIOlFg.js";
import { c as u, i as d, n as f, o as p, r as m, t as h } from "./native-host-BoAU4GnD.js";
import { T as g, _, d as v, g as y, l as b, u as x } from "./storage-jiCkQUgy.js";
import { t as S } from "./config-DbfjmaEn.js";
import { n as C, t as w } from "./translate-CUv9RhnO.js";
import { n as T } from "./lib-DIiEqr8B.js";
import "./editor-VmYacIt-.js";
import { A as E, C as D, M as O, g as k, h as ee, j as te, m as ne, n as re, u as ie, w as ae } from "./utils-D7O4F-LG.js";
import { g as oe, x as A } from "./vendor_vueuse-DbHwQsn4.js";
import { A as se, C as ce, D as j, E as le, H as ue, I as de, J as fe, O as pe, P as M, S as me, T as he, W as N, _ as ge, a as _e, at as ve, b as ye, ct as be, dt as xe, ft as Se, g as Ce, h as we, ht as Te, i as Ee, it as De, l as Oe, lt as P, mt as F, n as I, nt as L, ot as ke, pt as Ae, q as je, rt as Me, st as Ne, t as Pe, ut as Fe, v as Ie, w as Le, x as Re, y as R, z as ze } from "./codemirror-C3tEDw1q.js";
function Be(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e.matchAll(/--([\w-]+)\s*:\s*([^;}\n]+)/g)) t.set(`--${n[1]}`, n[2].trim());
	return t;
}
function Ve(e) {
	let t = Be(e), n = /var\(\s*(--[\w-]+)\s*(?:,([^()]*(?:\([^()]*\)[^()]*)*))?\)/g, r = e, i = "", a = 0;
	for (; r !== i && a < 10;) i = r, r = r.replace(n, (e, n, r) => {
		let i = t.get(n);
		return i === void 0 ? r ? r.trim() : `var(${n})` : i;
	}), a++;
	let o = /calc\(([^()]+)\)/g;
	for (i = "", a = 0; r !== i && a < 10;) i = r, r = r.replace(o, (e, t) => We(t.trim())), a++;
	return r;
}
var He = "px|em|rem|vw|vh|vmin|vmax|%|pt|pc|cm|mm|in|ex|ch", Ue = "(-?[\\d.]+)", z = `(-?[\\d.]+)(${He})?`;
function We(e) {
	let t = e.match(RegExp(`^${z}\\s*\\*\\s*${z}$`));
	if (t) {
		let [, e, n, r, i] = t;
		if (!n != !i) {
			let t = n || i;
			return `${Ge(Number.parseFloat(e) * Number.parseFloat(r))}${t}`;
		}
	}
	let n = e.match(RegExp(`^${z}\\s*/\\s*${Ue}$`));
	if (n) {
		let [, e, t, , r] = n;
		return `${Ge(Number.parseFloat(e) / Number.parseFloat(r))}${t ?? ""}`;
	}
	let r = e.match(RegExp(`^${z}\\s*([+-])\\s*${z}$`));
	if (r) {
		let [, e, t, n, i, a] = r;
		if (t === a) return `${Ge(n === "+" ? Number.parseFloat(e) + Number.parseFloat(i) : Number.parseFloat(e) - Number.parseFloat(i))}${t ?? ""}`;
	}
	return `calc(${e})`;
}
function Ge(e) {
	return Math.round(e * 1e4) / 1e4;
}
var Ke = {
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
function B(e, t = "#output") {
	return e.replace(/([^{}]+)\{([^}]*)\}/g, (e, n, r) => {
		let i = n.trim();
		return i.startsWith("@") || i.startsWith(":root") ? e : `${n.split(",").map((e) => {
			let n = e.trim();
			if (n.startsWith(t) || !n) return n;
			n = n.replace(/\.md-container\b/g, ".container");
			let r = n.split(/[\s>+~:[]/, 1)[0].trim();
			return r && Ke[r] && (n = n.replace(r, `.${Ke[r]}`)), n.match(/^(h[1-6])(\s|$|::|[:[])/) ? `${t} section ${n}` : `${t} ${n}`;
		}).filter(Boolean).join(",\n")} {${r}}`;
	});
}
var qe = "1.75", Je = "1", Ye = "#576b95", Xe = "default";
function V(e) {
	let t = e.blockquoteBackground && e.blockquoteBackground !== Xe ? `\n  --md-blockquote-background: ${e.blockquoteBackground};` : "";
	return `
:root {
  /* Theme config */
  --md-primary-color: ${e.primaryColor};
  --md-font-family: ${e.fontFamily};
  --md-font-size: ${e.fontSize};
  --md-line-height: ${e.lineHeight || qe};
  --md-block-spacing: ${e.blockSpacing || Je};
  --md-link-color: ${e.linkColor || Ye};${t}
}

/* Paragraph indent & justify */
#output p {
  ${e.isUseIndent ? "text-indent: 2em;" : ""}
  ${e.isUseJustify ? "text-align: justify;" : ""}
}
  `.trim();
}
function H(e) {
	return U(e.headingStyles);
}
function U(e) {
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
		t && t !== "default" && t !== "custom" && n.push(Ze(r, t));
	}
	return n.join("\n\n");
}
function Ze(e, t) {
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
var Qe = "/**\n * MD base theme styles\n * Base element styles and CSS variable definitions\n */\n\n/* ==================== Container ==================== */\nsection,\n#output .container {\n  font-family: var(--md-font-family);\n  font-size: var(--md-font-size);\n  line-height: var(--md-line-height);\n  text-align: left;\n}\n\n#output {\n  font-family: var(--md-font-family);\n  font-size: var(--md-font-size);\n  line-height: var(--md-line-height);\n  text-align: left;\n}\n\n#output section > :first-child {\n  margin-top: 0 !important;\n}\n\n/*\n * Reset for exported HTML / share pages / VSCode preview (no Tailwind preflight).\n * Browser defaults leak in (e.g. blockquote 40px side margins, table border-collapse: separate).\n * Reset horizontal (and top) margins so export matches in-app preview.\n * Vertical spacing comes from theme blockquote { margin-bottom }; do not zero all margins here.\n * section selector covers VSCode preview (no #output; content in section.container).\n */\n#output blockquote,\nsection blockquote {\n  margin-left: 0;\n  margin-right: 0;\n  margin-top: 0;\n}\n\n#output table,\nsection table {\n  border-collapse: collapse;\n  min-width: 100%;\n}\n\n.mermaid-diagram .nodeLabel p {\n  color: unset !important;\n  letter-spacing: unset !important;\n}\n\n/* ==================== Inline emoji ====================\n * `<img class=\"md-emoji\">` comes from `<Emoji id=\"…\">` (and legacy\n * `{{emoji:id}}`). Native pixel sizing makes the image dwarf the surrounding\n * text; constrain to the line box so it reads as an inline character.\n */\n#output img.md-emoji,\nsection img.md-emoji {\n  max-height: 1.4em;\n  width: auto;\n  vertical-align: text-bottom;\n  margin: 0 0.1em;\n  display: inline;\n}\n\n/*\n * Original-size stickers (`width=\"N%\"`) use a separate class so the line-box\n * cap above does not shrink them. Keep aspect ratio and stay inside the article.\n */\n#output img.md-asset-img,\nsection img.md-asset-img {\n  height: auto;\n  max-width: 100%;\n  vertical-align: text-bottom;\n  display: inline;\n}\n", $e = "/**\n * MD default theme (classic).\n * Format with Alt/Option + Shift + F.\n * Use var(--md-primary-color) for theme color instead of hard-coded values.\n * Vertical block margins are scaled by var(--md-block-spacing) so the theme's\n * own rhythm is preserved while the user tightens or loosens the whole page.\n */\n\n/* ==================== H1 ==================== */\nh1 {\n  display: table;\n  padding: 0 1em;\n  border-bottom: 2px solid var(--md-primary-color);\n  margin: calc(2em * var(--md-block-spacing)) auto calc(1em * var(--md-block-spacing));\n  color: hsl(var(--foreground));\n  font-size: calc(var(--md-font-size) * 1.2);\n  font-weight: bold;\n  text-align: center;\n}\n\n/* ==================== H2 ==================== */\nh2 {\n  display: table;\n  padding: 0 0.2em;\n  margin: calc(4em * var(--md-block-spacing)) auto calc(2em * var(--md-block-spacing));\n  color: #fff;\n  background: var(--md-primary-color);\n  font-size: calc(var(--md-font-size) * 1.2);\n  font-weight: bold;\n  text-align: center;\n}\n\n/* ==================== H3 ==================== */\nh3 {\n  padding-left: 8px;\n  border-left: 3px solid var(--md-primary-color);\n  margin: calc(2em * var(--md-block-spacing)) 8px calc(0.75em * var(--md-block-spacing)) 0;\n  color: hsl(var(--foreground));\n  font-size: calc(var(--md-font-size) * 1.1);\n  font-weight: bold;\n  line-height: 1.2;\n}\n\n/* ==================== H4 ==================== */\nh4 {\n  margin: calc(2em * var(--md-block-spacing)) 8px calc(0.5em * var(--md-block-spacing));\n  color: var(--md-primary-color);\n  font-size: calc(var(--md-font-size) * 1);\n  font-weight: bold;\n}\n\n/* ==================== H5 ==================== */\nh5 {\n  margin: calc(1.5em * var(--md-block-spacing)) 8px calc(0.5em * var(--md-block-spacing));\n  color: var(--md-primary-color);\n  font-size: calc(var(--md-font-size) * 1);\n  font-weight: bold;\n}\n\n/* ==================== H6 ==================== */\nh6 {\n  margin: calc(1.5em * var(--md-block-spacing)) 8px calc(0.5em * var(--md-block-spacing));\n  font-size: calc(var(--md-font-size) * 1);\n  color: var(--md-primary-color);\n}\n\n/* ==================== Paragraph ==================== */\np {\n  margin: calc(1.5em * var(--md-block-spacing)) 8px;\n  letter-spacing: 0.1em;\n  color: hsl(var(--foreground));\n}\n\n/* ==================== Blockquote ==================== */\nblockquote {\n  font-style: normal;\n  padding: 1em;\n  border-left: 4px solid var(--md-primary-color);\n  border-radius: 6px;\n  color: hsl(var(--foreground));\n  background: var(--md-blockquote-background, var(--blockquote-background));\n  margin-bottom: calc(1em * var(--md-block-spacing));\n}\n\nblockquote > p {\n  display: block;\n  font-size: 1em;\n  letter-spacing: 0.1em;\n  color: hsl(var(--foreground));\n  margin: 0;\n}\n\n/* ==================== GFM alerts ==================== */\n.alert-title-note,\n.alert-title-tip,\n.alert-title-info,\n.alert-title-important,\n.alert-title-warning,\n.alert-title-caution,\n.alert-title-abstract,\n.alert-title-summary,\n.alert-title-tldr,\n.alert-title-todo,\n.alert-title-success,\n.alert-title-done,\n.alert-title-question,\n.alert-title-help,\n.alert-title-faq,\n.alert-title-failure,\n.alert-title-fail,\n.alert-title-missing,\n.alert-title-danger,\n.alert-title-error,\n.alert-title-bug,\n.alert-title-example,\n.alert-title-quote,\n.alert-title-cite,\n.alert-title-theorem,\n.alert-title-lemma,\n.alert-title-corollary,\n.alert-title-proposition,\n.alert-title-definition,\n.alert-title-axiom,\n.alert-title-postulate,\n.alert-title-assumption,\n.alert-title-proof,\n.alert-title-remark,\n.alert-title-custom {\n  display: flex;\n  align-items: center;\n  gap: 0.5em;\n  margin-bottom: 0.5em;\n}\n\n.alert-title-note {\n  color: #478be6;\n}\n\n.alert-title-tip {\n  color: #57ab5a;\n}\n\n.alert-title-info {\n  color: #93c5fd;\n}\n\n.alert-title-important {\n  color: #986ee2;\n}\n\n.alert-title-warning {\n  color: #c69026;\n}\n\n.alert-title-caution {\n  color: #e5534b;\n}\n\n/* Obsidian-style callout colors */\n.alert-title-abstract,\n.alert-title-summary,\n.alert-title-tldr {\n  color: #00bfff;\n}\n\n.alert-title-todo {\n  color: #478be6;\n}\n\n.alert-title-success,\n.alert-title-done {\n  color: #57ab5a;\n}\n\n.alert-title-question,\n.alert-title-help,\n.alert-title-faq {\n  color: #c69026;\n}\n\n.alert-title-failure,\n.alert-title-fail,\n.alert-title-missing {\n  color: #e5534b;\n}\n\n.alert-title-danger,\n.alert-title-error {\n  color: #e5534b;\n}\n\n.alert-title-bug {\n  color: #e5534b;\n}\n\n.alert-title-example {\n  color: #986ee2;\n}\n\n.alert-title-quote,\n.alert-title-cite {\n  color: #9ca3af;\n}\n\n/* GFM alert SVG icon colors */\n.alert-icon-note {\n  fill: #478be6;\n}\n\n.alert-icon-tip {\n  fill: #57ab5a;\n}\n\n.alert-icon-info {\n  fill: #93c5fd;\n}\n\n.alert-icon-important {\n  fill: #986ee2;\n}\n\n.alert-icon-warning {\n  fill: #c69026;\n}\n\n.alert-icon-caution {\n  fill: #e5534b;\n}\n\n/* Obsidian-style callout icon colors */\n.alert-icon-abstract,\n.alert-icon-summary,\n.alert-icon-tldr {\n  fill: #00bfff;\n}\n\n.alert-icon-todo {\n  fill: #478be6;\n}\n\n.alert-icon-success,\n.alert-icon-done {\n  fill: #57ab5a;\n}\n\n.alert-icon-question,\n.alert-icon-help,\n.alert-icon-faq {\n  fill: #c69026;\n}\n\n.alert-icon-failure,\n.alert-icon-fail,\n.alert-icon-missing {\n  fill: #e5534b;\n}\n\n.alert-icon-danger,\n.alert-icon-error {\n  fill: #e5534b;\n}\n\n.alert-icon-bug {\n  fill: #e5534b;\n}\n\n.alert-icon-example {\n  fill: #986ee2;\n}\n\n.alert-icon-quote,\n.alert-icon-cite {\n  fill: #9ca3af;\n}\n\n/* ==================== Academic environments (theorem, lemma, definition, …) ==================== */\n/* Title colors */\n.alert-title-theorem,\n.alert-title-lemma,\n.alert-title-corollary,\n.alert-title-proposition {\n  color: #986ee2;\n}\n\n.alert-title-definition {\n  color: #57ab5a;\n}\n\n.alert-title-axiom,\n.alert-title-postulate,\n.alert-title-assumption {\n  color: #478be6;\n}\n\n.alert-title-proof {\n  color: #9ca3af;\n}\n\n.alert-title-remark {\n  color: #c69026;\n}\n\n/* Icon colors */\n.alert-icon-theorem,\n.alert-icon-lemma,\n.alert-icon-corollary,\n.alert-icon-proposition {\n  fill: #986ee2;\n}\n\n.alert-icon-definition {\n  fill: #57ab5a;\n}\n\n.alert-icon-axiom,\n.alert-icon-postulate,\n.alert-icon-assumption {\n  fill: #478be6;\n}\n\n.alert-icon-proof {\n  fill: #9ca3af;\n}\n\n.alert-icon-remark {\n  fill: #c69026;\n}\n\n/* Full border on academic boxes (theorem-style appearance) */\n.markdown-alert-theorem,\n.markdown-alert-lemma,\n.markdown-alert-corollary,\n.markdown-alert-proposition {\n  border: 1px solid rgba(152, 110, 226, 0.35);\n  border-left: 4px solid #986ee2;\n}\n\n.markdown-alert-definition {\n  border: 1px solid rgba(87, 171, 90, 0.35);\n  border-left: 4px solid #57ab5a;\n}\n\n.markdown-alert-axiom,\n.markdown-alert-postulate,\n.markdown-alert-assumption {\n  border: 1px solid rgba(71, 139, 230, 0.35);\n  border-left: 4px solid #478be6;\n}\n\n.markdown-alert-proof {\n  border: 1px solid rgba(156, 163, 175, 0.35);\n  border-left: 4px solid #9ca3af;\n}\n\n.markdown-alert-remark {\n  border: 1px solid rgba(198, 144, 38, 0.35);\n  border-left: 4px solid #c69026;\n}\n\n/* Fallback for custom/unknown names: no icon, theme primary color */\n.alert-title-custom {\n  color: var(--md-primary-color);\n}\n\n.markdown-alert-custom {\n  border-left: 4px solid var(--md-primary-color);\n}\n\n/* Italic body text in academic environments (math convention) */\n.markdown-alert-theorem > :not(.markdown-alert-title),\n.markdown-alert-lemma > :not(.markdown-alert-title),\n.markdown-alert-corollary > :not(.markdown-alert-title),\n.markdown-alert-proposition > :not(.markdown-alert-title),\n.markdown-alert-definition > :not(.markdown-alert-title),\n.markdown-alert-axiom > :not(.markdown-alert-title),\n.markdown-alert-postulate > :not(.markdown-alert-title),\n.markdown-alert-assumption > :not(.markdown-alert-title) {\n  font-style: italic;\n}\n\n/* ==================== Code blocks ==================== */\npre.code__pre,\n.hljs.code__pre {\n  font-size: 90%;\n  overflow-x: auto;\n  border-radius: 8px;\n  padding: 0 !important;\n  line-height: 1.5;\n  margin: calc(10px * var(--md-block-spacing)) 8px;\n}\n\n/* ==================== Images ==================== */\nimg {\n  display: block;\n  max-width: 100%;\n  margin: calc(0.1em * var(--md-block-spacing)) auto calc(0.5em * var(--md-block-spacing));\n  border-radius: 4px;\n}\n\n/* ==================== Lists ==================== */\nol {\n  padding-left: 1em;\n  margin-left: 0;\n  color: hsl(var(--foreground));\n}\n\nul {\n  list-style: circle;\n  padding-left: 1em;\n  margin-left: 0;\n  color: hsl(var(--foreground));\n}\n\nli {\n  display: block;\n  margin: calc(0.2em * var(--md-block-spacing)) 8px;\n  color: hsl(var(--foreground));\n}\n\n/* Footnotes */\n/* footnotes rendered as <p> in buildFootnotes() */\np.footnotes {\n  margin: calc(0.5em * var(--md-block-spacing)) 8px;\n  font-size: 80%;\n  color: hsl(var(--foreground));\n}\n\n/* Diagrams */\nfigure {\n  margin: calc(1.5em * var(--md-block-spacing)) 8px;\n  color: hsl(var(--foreground));\n}\n\nfigcaption,\n.md-figcaption {\n  text-align: center;\n  color: color-mix(in srgb, hsl(var(--foreground)) 50%, transparent);\n  font-size: 0.8em;\n}\n\n/* ==================== Horizontal rules ==================== */\nhr {\n  border-style: solid;\n  border-width: 2px 0 0;\n  border-color: rgba(0, 0, 0, 0.1);\n  -webkit-transform-origin: 0 0;\n  -webkit-transform: scale(1, 0.5);\n  transform-origin: 0 0;\n  transform: scale(1, 0.5);\n  height: 0.4em;\n  margin: calc(1.5em * var(--md-block-spacing)) 0;\n}\n\n/* Inline code */\n.codespan {\n  font-size: 90%;\n  color: var(--md-primary-color);\n  background: color-mix(in srgb, var(--md-primary-color) 8%, transparent);\n  padding: 3px 5px;\n  border-radius: 4px;\n  border: 1px solid color-mix(in srgb, var(--md-primary-color) 20%, transparent);\n}\n\n/* code inside pre (override inline code) */\npre.code__pre > code,\n.hljs.code__pre > code {\n  display: -webkit-box;\n  padding: 0.5em 1em 1em;\n  overflow-x: auto;\n  text-indent: 0;\n  color: inherit;\n  background: none;\n  white-space: nowrap;\n  margin: 0;\n}\n\n/* Emphasis */\nem {\n  font-style: italic;\n  font-size: inherit;\n}\n\n/* ==================== Links ==================== */\na {\n  color: var(--md-link-color);\n  text-decoration: none;\n}\n\n/* ==================== Bold ==================== */\nstrong {\n  color: var(--md-primary-color);\n  font-weight: bold;\n  font-size: inherit;\n}\n\n/* ==================== Strikethrough ==================== */\n.del {\n  color: color-mix(in srgb, hsl(var(--foreground)) 55%, transparent);\n  text-decoration: line-through;\n}\n\n/* ==================== Tables ==================== */\ntable {\n  color: hsl(var(--foreground));\n}\n\nthead {\n  font-weight: bold;\n  color: hsl(var(--foreground));\n}\n\nth {\n  border: 1px solid color-mix(in srgb, hsl(var(--foreground)) 15%, transparent);\n  padding: 0.25em 0.5em;\n  color: hsl(var(--foreground));\n  word-break: keep-all;\n  background: color-mix(in srgb, hsl(var(--foreground)) 5%, transparent);\n}\n\ntd {\n  border: 1px solid color-mix(in srgb, hsl(var(--foreground)) 15%, transparent);\n  padding: 0.25em 0.5em;\n  color: hsl(var(--foreground));\n  word-break: keep-all;\n}\n\n/* ==================== KaTeX ==================== */\n.katex-inline {\n  max-width: 100%;\n  overflow-x: auto;\n  cursor: pointer;\n}\n\n.katex-block {\n  max-width: 100%;\n  overflow-x: auto;\n  -webkit-overflow-scrolling: touch;\n  cursor: pointer;\n  padding: 0.5em 0;\n  text-align: center;\n}\n\n.katex-pending {\n  color: hsl(var(--muted-foreground, 0 0% 45%));\n  font-size: 0.875em;\n}\n\n.katex-block.katex-pending {\n  padding: 0.75em 0;\n}\n\n.katex-inline.katex-pending {\n  opacity: 0.75;\n}\n\n/* ==================== Markup highlight ==================== */\n.markup-highlight {\n  background-color: var(--md-primary-color);\n  padding: 2px 4px;\n  border-radius: 2px;\n  color: #fff;\n}\n\n.markup-underline {\n  text-decoration: underline;\n  text-decoration-color: var(--md-primary-color);\n}\n\n.markup-wavyline {\n  text-decoration: underline wavy;\n  text-decoration-color: var(--md-primary-color);\n  text-decoration-thickness: 2px;\n}\n\n/* line-height: 0 keeps the raised glyph from stretching the line box */\n.markup-superscript {\n  font-size: 0.75em;\n  line-height: 0;\n  vertical-align: super;\n}\n", et = "/**\n * MD grace theme (@brzhang) — refinements on default\n */\n\n/* Headings */\nh1 {\n  padding: 0.5em 1em;\n  border-bottom: 2px solid var(--md-primary-color);\n  font-size: calc(var(--md-font-size) * 1.4);\n  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);\n}\n\nh2 {\n  padding: 0.3em 1em;\n  border-radius: 8px;\n  font-size: calc(var(--md-font-size) * 1.3);\n  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);\n}\n\nh3 {\n  padding-left: 12px;\n  font-size: calc(var(--md-font-size) * 1.2);\n  border-left: 4px solid var(--md-primary-color);\n  border-bottom: 1px dashed var(--md-primary-color);\n}\n\nh4 {\n  font-size: calc(var(--md-font-size) * 1.1);\n}\n\nh5 {\n  font-size: var(--md-font-size);\n}\n\nh6 {\n  font-size: var(--md-font-size);\n}\n\n/* Blockquote */\nblockquote {\n  font-style: italic;\n  padding: 1em 1em 1em 2em;\n  border-left: 4px solid var(--md-primary-color);\n  border-radius: 6px;\n  color: rgba(0, 0, 0, 0.6);\n  background: var(--md-blockquote-background, transparent);\n  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);\n  margin-bottom: calc(1em * var(--md-block-spacing));\n}\n\n.markdown-alert {\n  font-style: italic;\n}\n\n/* Inline code */\n.codespan {\n  font-family: 'Fira Code', Menlo, Operator Mono, Consolas, Monaco, monospace;\n  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);\n}\n\n/* Code blocks */\npre.code__pre,\n.hljs.code__pre {\n  box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.05);\n}\n\npre.code__pre > code,\n.hljs.code__pre > code {\n  font-family: 'Fira Code', Menlo, Operator Mono, Consolas, Monaco, monospace;\n}\n\n/* Images */\nimg {\n  border-radius: 8px;\n  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);\n}\n\nfigcaption,\n.md-figcaption {\n  text-align: center;\n  color: #888;\n  font-size: 0.8em;\n}\n\n/* Lists */\nol {\n  padding-left: 1.5em;\n}\n\nul {\n  list-style: none;\n  padding-left: 1.5em;\n}\n\nli {\n  margin: calc(0.5em * var(--md-block-spacing)) 8px;\n}\n\n/* Horizontal rules */\nhr {\n  height: 1px;\n  border: none;\n  margin: calc(2em * var(--md-block-spacing)) 0;\n  background: linear-gradient(to right, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0));\n}\n\n/* Tables */\ntable {\n  border-collapse: separate;\n  border-spacing: 0;\n  border-radius: 8px;\n  margin: calc(1em * var(--md-block-spacing)) 8px;\n  color: hsl(var(--foreground));\n  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);\n  overflow: hidden;\n}\n\nthead {\n  color: #fff;\n}\n\ntd {\n  padding: 0.5em 1em;\n}\n\n/* Emphasis */\nem {\n  font-style: italic;\n  font-size: inherit;\n}\n\n/* Links */\na {\n  color: var(--md-link-color);\n  text-decoration: none;\n}\n", tt = "/**\n * MD simple theme (@okooo5km) — minimal modern layout\n */\n\n/* Headings */\nh1 {\n  padding: 0.5em 1em;\n  font-size: calc(var(--md-font-size) * 1.4);\n  text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.05);\n}\n\nh2 {\n  padding: 0.3em 1.2em;\n  font-size: calc(var(--md-font-size) * 1.3);\n  border-radius: 8px 24px 8px 24px;\n  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);\n}\n\nh3 {\n  padding-left: 12px;\n  font-size: calc(var(--md-font-size) * 1.2);\n  border-radius: 6px;\n  line-height: 2.4em;\n  border-left: 4px solid var(--md-primary-color);\n  border-right: 1px solid color-mix(in srgb, var(--md-primary-color) 10%, transparent);\n  border-bottom: 1px solid color-mix(in srgb, var(--md-primary-color) 10%, transparent);\n  border-top: 1px solid color-mix(in srgb, var(--md-primary-color) 10%, transparent);\n  background: color-mix(in srgb, var(--md-primary-color) 8%, transparent);\n}\n\nh4 {\n  font-size: calc(var(--md-font-size) * 1.1);\n  border-radius: 6px;\n}\n\nh5 {\n  font-size: var(--md-font-size);\n  border-radius: 6px;\n}\n\nh6 {\n  font-size: var(--md-font-size);\n  border-radius: 6px;\n}\n\n/* Blockquote */\nblockquote {\n  font-style: italic;\n  padding: 1em 1em 1em 2em;\n  color: rgba(0, 0, 0, 0.6);\n  background: var(--md-blockquote-background, transparent);\n  border-bottom: 0.2px solid rgba(0, 0, 0, 0.04);\n  border-top: 0.2px solid rgba(0, 0, 0, 0.04);\n  border-right: 0.2px solid rgba(0, 0, 0, 0.04);\n}\n\n/* GFM alert overrides */\n.markdown-alert-note,\n.markdown-alert-tip,\n.markdown-alert-info,\n.markdown-alert-important,\n.markdown-alert-warning,\n.markdown-alert-caution {\n  font-style: italic;\n}\n\n/* Inline code */\n.codespan {\n  font-family: 'Fira Code', Menlo, Operator Mono, Consolas, Monaco, monospace;\n  border-radius: 6px;\n  border: 1px solid color-mix(in srgb, var(--md-primary-color) 15%, transparent);\n}\n\n/* Code blocks */\npre.code__pre,\n.hljs.code__pre {\n  border: 1px solid rgba(0, 0, 0, 0.04);\n}\n\npre.code__pre > code,\n.hljs.code__pre > code {\n  font-family: 'Fira Code', Menlo, Operator Mono, Consolas, Monaco, monospace;\n}\n\n/* Images */\nimg {\n  border-radius: 8px;\n  border: 1px solid rgba(0, 0, 0, 0.04);\n}\n\nfigcaption,\n.md-figcaption {\n  text-align: center;\n  color: #888;\n  font-size: 0.8em;\n}\n\n/* Lists */\nol {\n  padding-left: 1.5em;\n}\n\nul {\n  list-style: none;\n  padding-left: 1.5em;\n}\n\nli {\n  margin: calc(0.5em * var(--md-block-spacing)) 8px;\n}\n\n/* Horizontal rules */\nhr {\n  height: 1px;\n  border: none;\n  margin: calc(2em * var(--md-block-spacing)) 0;\n  background: linear-gradient(to right, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0));\n}\n\n/* Emphasis */\nem {\n  font-style: italic;\n  font-size: inherit;\n}\n\n/* Links */\na {\n  color: var(--md-link-color);\n  text-decoration: none;\n}\n", nt = Qe, W = {
	default: $e,
	grace: et,
	simple: tt
};
function rt(e) {
	return Object.keys(W).includes(e);
}
var it = class {
	styleElement = null;
	styleId = "md-theme";
	inject(e) {
		this.styleElement || (this.styleElement = document.createElement("style"), this.styleElement.id = this.styleId, h(this.styleElement)), this.styleElement.textContent = d() ? "#output{--foreground:0 0% 3.9%;--blockquote-background:#f7f7f7;}" + e.replace(/:root/g, "#output").replace(/@import\s+[^;]+;/g, "") : e;
	}
	remove() {
		this.styleElement &&= (this.styleElement.remove(), null);
	}
	isInjected() {
		return this.styleElement !== null;
	}
}, at = null;
function ot() {
	return at ||= new it(), at;
}
function st() {
	at?.remove(), at = null;
}
function ct(e, t) {
	if (t != null && t.trim()) return `${W.default}\n\n${t}`;
	let n = W.default;
	if (e !== "default" && rt(e)) {
		let t = W[e];
		t && (n = `${n}\n\n${t}`);
	}
	return n;
}
async function lt(e) {
	let t = [
		V(e.variables),
		nt,
		B(ct(e.themeName, e.themeCSS), "#output"),
		H(e.variables),
		e.customCSS ? B(e.customCSS, "#output") : ""
	].filter(Boolean).join("\n\n");
	t = Ve(t), ot().inject(t);
}
function G(e) {
	let t = /[\\/:*?"<>|]/g;
	if (!t.test(e) && e.length <= 100) return e.trim() || "untitled";
	let n = e.replace(t, "_").trim();
	return (n.length > 100 ? n.slice(0, 100) : n) || "untitled";
}
function K(e, t, n = "text/plain") {
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
function ut(e) {
	return new Promise((t, n) => {
		let r = new FileReader();
		r.readAsDataURL(e), r.onload = () => t(r.result.split(",").pop()), r.onerror = (e) => n(e);
	});
}
var dt = /* @__PURE__ */ new Map();
function ft(e) {
	return dt.get(e) ?? (S ? `${S}/emojis/assets/${encodeURIComponent(e)}` : "about:blank");
}
async function pt(e) {
	let t = ft(e);
	return t === "about:blank" ? null : t;
}
function mt(e) {
	for (let t of e) t.url && dt.set(t.id, t.url);
}
function ht(e) {
	for (let t of e) dt.delete(t);
}
function gt(e) {
	let t = /* @__PURE__ */ new Set();
	for (let n of e.matchAll(/(\w[\w-]*)=(?:"[^"]*"|'[^']*')/g)) t.add(n[1]);
	let n = e.match(/(?:^|\s)([A-Z_][\w-]*)\s*=\s*(?:"[^"]*|'[^']*)?$/i);
	return n && t.add(n[1]), t;
}
function _t(e) {
	return e.default !== void 0 && e.default !== "" ? e.default : e.type === "array" ? "[]" : e.type === "boolean" ? "true" : e.type === "number" ? "0" : e.name;
}
function vt(e, t) {
	return t.includes("\"") && !t.includes("'") ? `${e}='${t}'` : t.includes("\"") && t.includes("'") ? `${e}="${t.replace(/"/g, "'")}"` : `${e}="${t}"`;
}
function yt(e, t) {
	if (t) {
		let n = [];
		for (let r of e.props) {
			let e = t[r.name], i = e === void 0 ? "" : e;
			(i !== "" || r.required) && n.push(vt(r.name, i === "" ? _t(r) : i));
		}
		return `<${e.name}${n.length ? ` ${n.join(" ")}` : ""} />`;
	}
	if (e.example) return e.example;
	let n = e.props.map((e) => vt(e.name, _t(e))).join(" ");
	return `<${e.name}${n ? ` ${n}` : ""} />`;
}
var bt = o("customComponent", () => {
	let e = b.reactive(x("custom_components"), []), t = c(() => ne), n = c(() => {
		let t = new Map(ne.map((e) => [e.name, e]));
		for (let n of e.value) k(n.name) || t.set(n.name, n);
		return [...t.values()];
	}), r = c(() => {
		let t = ee();
		for (let n of e.value) k(n.name) || (t[n.name] = n);
		return t;
	});
	function i(t) {
		if (k(t.name)) {
			T.error(C("component.nameReserved", { name: t.name }));
			return;
		}
		let n = Date.now(), r = {
			id: v(),
			name: t.name,
			description: t.description,
			template: t.template,
			props: t.props,
			createdAt: n,
			updatedAt: n
		};
		return e.value.push(r), T.success(C("store.component.created", { name: t.name })), r;
	}
	function a(t, n) {
		let r = e.value.findIndex((e) => e.id === t);
		return r === -1 ? (T.error(C("store.component.notFound")), !1) : n.name && k(n.name) ? (T.error(C("component.nameReserved", { name: n.name })), !1) : (e.value[r] = {
			...e.value[r],
			...n,
			updatedAt: Date.now()
		}, T.success(C("store.component.updated")), !0);
	}
	function o(t) {
		let n = e.value.findIndex((e) => e.id === t);
		if (n === -1) return T.error(C("store.component.notFound")), !1;
		let r = e.value[n].name;
		return e.value.splice(n, 1), T.success(C("store.component.deleted", { name: r })), !0;
	}
	function s(t) {
		return e.value.find((e) => e.id === t);
	}
	function l(e, t) {
		return yt(e, t);
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
		buildSnippet: l
	};
});
function xt(e) {
	return `mp:${e}`;
}
function St(e) {
	return e.startsWith("mp:") && e.length > 3;
}
function Ct(e) {
	return new Promise((t) => window.setTimeout(t, e));
}
var wt = 2e4, Tt = 250, Et = ".mermaid-diagram, .plantuml-diagram, .infographic-diagram";
function Dt(e) {
	return e?.themeMode ? { themeMode: e.themeMode } : void 0;
}
function Ot(e) {
	for (let t of e.querySelectorAll(Et)) if (O(t)) return !0;
	return !1;
}
function kt(e) {
	if (e.querySelector(".katex-fallback")) return !0;
	for (let t of e.querySelectorAll(".katex-block, .katex-inline")) if (!t.querySelector("svg, mjx-container")) return !0;
	return !1;
}
async function q(t = wt, n) {
	await e(), await e();
	let r = p("output");
	if (!r) return !1;
	let i = Dt(n), a = Date.now() + t;
	for (; Date.now() < a;) {
		if (ie(r, i), !Ot(r) && !kt(r)) return !0;
		await Ct(Tt);
	}
	return ie(r, i), !Ot(r) && !kt(r);
}
function At(e) {
	e.querySelectorAll(Et).forEach((e) => {
		e.querySelector("svg, img") || e.getAttribute(te) === E.loading && e.remove();
	}), e.querySelectorAll(".katex-pending").forEach((e) => {
		e.querySelector("svg, mjx-container") || e.remove();
	});
}
var jt = ":root {\n  --foreground: 0 0% 3.9%;\n  --blockquote-background: #f7f7f7;\n}";
async function Mt() {
	let e = u("#hljs");
	if (!e) return "";
	try {
		return `<style>${await (await fetch(e.href)).text()}</style>`;
	} catch (e) {
		return console.warn("Failed to fetch highlight.js styles:", e), "";
	}
}
function Nt(e) {
	let t = e;
	return t = t.replace(/#output\s*\{/g, "body {"), t = t.replace(/#output\s+/g, ""), t = t.replace(/^#output\s*/gm, ""), t;
}
function Pt() {
	let e = u("#md-theme");
	return !e || !e.textContent ? (console.warn("[getThemeStyles] theme styles not found"), "") : `<style>${Nt(e.textContent)}</style>`;
}
async function Ft() {
	return [Pt(), await Mt()].filter(Boolean).join("");
}
var J = "[data-png-export-host]", It = "png-export-root";
function Y(e, t) {
	for (let [n, r] of Object.entries(t)) e.style.setProperty(n, r, "important");
}
function Lt(e) {
	let t = e.getAttribute("style") ?? "";
	return /overflow(?:-x)?:\s*(?:auto|scroll)/.test(t);
}
function Rt(e) {
	Y(e, {
		width: "100%",
		maxWidth: "100%",
		tableLayout: "fixed"
	}), e.querySelectorAll("th, td").forEach((e) => {
		Y(e, {
			wordBreak: "break-word",
			whiteSpace: "normal",
			overflowWrap: "anywhere"
		});
	});
}
function zt(e) {
	e.querySelectorAll(".code-scroll").forEach((e) => {
		Y(e, { overflow: "visible" }), e.querySelectorAll("div").forEach((e) => {
			Y(e, {
				whiteSpace: "pre-wrap",
				wordBreak: "break-all",
				minWidth: "auto",
				maxWidth: "100%"
			});
		});
	}), e.querySelectorAll("pre.code__pre, .hljs.code__pre").forEach((e) => {
		Y(e, { overflow: "visible" });
	}), e.querySelectorAll("pre.code__pre > code, .hljs.code__pre > code").forEach((e) => {
		Y(e, {
			overflow: "visible",
			whiteSpace: "pre-wrap",
			wordBreak: "break-all",
			minWidth: "auto",
			maxWidth: "100%"
		});
	}), e.querySelectorAll("pre section, code section").forEach((e) => {
		Y(e, { overflow: "visible" });
	});
}
function Bt(e) {
	e.querySelectorAll("table.preview-table").forEach((e) => {
		let t = e.parentElement;
		t?.tagName === "SECTION" && Y(t, {
			overflow: "visible",
			maxWidth: "100%"
		}), Rt(e);
	}), e.querySelectorAll("section").forEach((e) => {
		Lt(e) && e.querySelector("table") && (Y(e, { overflow: "visible" }), e.querySelectorAll("table").forEach(Rt));
	}), zt(e);
}
function Vt(e, t) {
	return e.split("\n").map((e) => {
		let n = e.trimStart();
		if (!n || n.startsWith("/*")) return e;
		let r = n.match(/^([^{]+)\{/);
		if (!r) return e;
		let i = r[1].trim(), a = i.split(",").map((e) => `${t} ${e.trim()}`).join(", ");
		return e.replace(i, a);
	}).join("\n");
}
function Ht(e) {
	let t = `${J} .${It}`, n = e;
	return n = n.replace(/#output\s*\{/g, `${t} {`), n = n.replace(/#output\s+/g, `${t} `), n = n.replace(/^#output\s*/gm, `${t} `), n;
}
var Ut = "\n  section:has(> table.preview-table) { overflow: visible !important; }\n  table.preview-table { width: 100% !important; max-width: 100% !important; table-layout: fixed !important; }\n  table.preview-table th, table.preview-table td { word-break: break-word !important; white-space: normal !important; overflow-wrap: anywhere !important; }\n  section[style*=\"overflow-x: auto\"], section[style*=\"overflow: auto\"] { overflow: visible !important; }\n  section[style*=\"overflow-x: auto\"] table, section[style*=\"overflow: auto\"] table { width: 100% !important; max-width: 100% !important; table-layout: fixed !important; }\n  section[style*=\"overflow-x: auto\"] th, section[style*=\"overflow-x: auto\"] td, section[style*=\"overflow: auto\"] th, section[style*=\"overflow: auto\"] td { word-break: break-word !important; white-space: normal !important; overflow-wrap: anywhere !important; }\n  pre.code__pre, .hljs.code__pre, pre.code__pre > code, .hljs.code__pre > code, .code-scroll, pre section, code section { overflow: visible !important; }\n  pre.code__pre > code, .code-scroll, .code-scroll > div { white-space: pre-wrap !important; word-break: break-all !important; min-width: auto !important; max-width: 100% !important; }\n", Wt = Ut.trim();
function Gt(e) {
	return Vt(Ut, e).trim();
}
function Kt() {
	return document.documentElement.classList.contains("dark") && p("output-wrapper")?.classList.contains("output_night") ? "#191919" : "#fff";
}
var qt = `
  ${J} .preview {
    position: relative;
    margin: 0 auto;
    padding: 20px;
    font-size: 14px;
    box-sizing: border-box;
    word-wrap: break-word;
  }

  ${J} .preview table {
    margin-bottom: 10px;
    border-collapse: collapse;
    display: table;
    min-width: 100%;
  }
`;
async function Jt() {
	let e = u("#md-theme");
	if (!e?.textContent) return "";
	let t = document.documentElement.classList.contains("dark"), n = [
		`<style>${t ? `${J} { --foreground: 0 0% 98%; --blockquote-background: #212121; }` : `${J} { --foreground: 0 0% 3.9%; --blockquote-background: #f7f7f7; }`}</style>`,
		`<style>${qt}</style>`,
		`<style>${Ht(e.textContent)}</style>`,
		`<style>${Gt(J)}</style>`
	], r = u("#hljs");
	if (r) try {
		let e = await (await fetch(r.href)).text();
		n.push(`<style>@scope (${J}) { ${e} }</style>`);
	} catch {}
	return t && p("output-wrapper")?.classList.contains("output_night") && n.push(`<style>${J} .output_night .preview { background-color: #191919; }</style>`), n.join("");
}
function Yt(e) {
	let t = u("#output");
	if (!t) return "";
	let n = t.cloneNode(!0);
	return n.querySelectorAll(".diagram-download-bar").forEach((e) => e.remove()), ie(n, e?.themeMode ? { themeMode: e.themeMode } : void 0), e?.staticLayout && Bt(n), n.innerHTML;
}
async function Xt(e = "untitled") {
	await q();
	let t = Yt({ staticLayout: !0 }), n = await Ft();
	K(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${G(e)}</title>
  <style>${jt}</style>
  ${n}
  <style>${Wt}</style>
</head>
<body>
  <div style="width: 750px; margin: auto; padding: 20px;">
    ${t}
  </div>
</body>
</html>`, `${G(e)}.html`, "text/html");
}
async function Zt(e, t = "untitled") {
	let n = G(t);
	K(await re(e), `${n}.html`, "text/html");
}
var X = {
	showPageNumbers: !0,
	pageNumberFormat: "nOfM",
	pageNumberPosition: "bottomRight",
	showTitleHeader: !0,
	showSiteFooter: !0,
	margins: "default"
}, Qt = /* @__PURE__ */ new Set(["nOfM", "n"]), $t = /* @__PURE__ */ new Set([
	"bottomLeft",
	"bottomCenter",
	"bottomRight"
]), en = /* @__PURE__ */ new Set([
	"compact",
	"default",
	"comfortable"
]), tn = {
	compact: "1cm",
	default: "1.5cm 1cm 2cm 1cm",
	comfortable: "2cm 1.5cm 2.5cm 1.5cm"
}, nn = "0.5cm", rn = "https://md.doocs.org";
function an(e = window.location) {
	return e.protocol === "http:" || e.protocol === "https:" ? e.origin : rn;
}
function on(e) {
	return e.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
var sn = {
	bottomLeft: "@bottom-left",
	bottomCenter: "@bottom-center",
	bottomRight: "@bottom-right"
}, cn = [
	"@bottom-left",
	"@bottom-center",
	"@bottom-right"
], ln = [
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
function un(e) {
	let t = tn[e].trim().split(/\s+/);
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
function dn({ top: e, right: t, bottom: n, left: r }) {
	return e === t && t === n && n === r ? e : e === n && t === r ? `${e} ${t}` : `${e} ${t} ${n} ${r}`;
}
function fn(e, t, n = "") {
	return `
      ${e} {
        content: ${t};${n}
      }`;
}
function pn(e, t) {
	return fn(e, "\"\"", t ? "\n        width: 0;\n        max-width: 0;\n        padding: 0;\n        margin: 0;\n        overflow: hidden;" : "");
}
function mn(e) {
	for (let t of cn) if (t !== e) return t;
	return null;
}
function hn(e) {
	let t = e ?? {};
	return {
		showPageNumbers: typeof t.showPageNumbers == "boolean" ? t.showPageNumbers : X.showPageNumbers,
		pageNumberFormat: Qt.has(t.pageNumberFormat) ? t.pageNumberFormat : X.pageNumberFormat,
		pageNumberPosition: $t.has(t.pageNumberPosition) ? t.pageNumberPosition : X.pageNumberPosition,
		showTitleHeader: typeof t.showTitleHeader == "boolean" ? t.showTitleHeader : X.showTitleHeader,
		showSiteFooter: typeof t.showSiteFooter == "boolean" ? t.showSiteFooter : X.showSiteFooter,
		margins: en.has(t.margins) ? t.margins : X.margins
	};
}
function gn(e, t, n = an()) {
	let r = hn(e), i = G(t), a = on(n), o = un(r.margins), s = r.showPageNumbers ? sn[r.pageNumberPosition] : null, c = r.showSiteFooter ? mn(s) : null, l = r.showTitleHeader, u = !!(s || c), d = o.left, f = {
		top: l ? o.top : d,
		right: o.right,
		bottom: u ? o.bottom : d,
		left: o.left
	}, p = /* @__PURE__ */ new Map();
	if (r.showTitleHeader && p.set("@top-center", fn("@top-center", `"${i}"`, `
        font-size: 12px;
        color: #666;
        vertical-align: bottom;
        padding-bottom: ${nn};`)), c && p.set(c, fn(c, `"${a}"`, `
        font-size: 10px;
        color: #999;
        vertical-align: top;
        padding-top: ${nn};
        white-space: nowrap;`)), r.showPageNumbers && s) {
		let e = r.pageNumberFormat === "n" ? C("store.pdf.pageFooterN") : C("store.pdf.pageFooter");
		p.set(s, fn(s, `"${e}"`, `
        font-size: 10px;
        color: #999;
        vertical-align: top;
        padding-top: ${nn};
        white-space: nowrap;`));
	}
	let m = ln.map((e) => p.get(e) || pn(e, cn.includes(e) && !!(c || s)));
	return `
    @page {
      margin: ${dn(f)};${m.join("")}
    }

    html, body {
      margin: 0;
    }`;
}
async function _n(e = "untitled", t) {
	await q();
	let n = Yt({ staticLayout: !0 }), r = await Ft(), i = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${G(e)}</title>
  <style>${jt}</style>
  ${r}
  <style>${Wt}</style>
  <style>
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }

    ${gn(hn(t), e, an())}
  </style>
</head>
<body>
  <div style="width: 100%; max-width: 750px; margin: auto;">
    ${n}
  </div>
</body>
</html>`, a = new Blob([i], { type: "text/html" }), o = URL.createObjectURL(a), s = document.createElement("iframe");
	s.style.cssText = "position:fixed;width:0;height:0;top:-9999px;left:-9999px;border:none;", s.src = o, f(s);
	let c = () => {
		URL.revokeObjectURL(o), s.parentNode && s.remove();
	};
	s.onload = () => {
		s.contentWindow?.focus(), s.contentWindow?.print(), setTimeout(c, 500);
	}, s.onerror = () => {
		c();
	}, setTimeout(c, 5e3);
}
async function vn(e) {
	let t = p("output");
	if (!t) return null;
	let n = document.documentElement.classList.contains("dark") && p("output-wrapper")?.classList.contains("output_night"), r = e === "mobile" ? "375px" : "750px", i = document.createElement("div");
	i.setAttribute("data-png-export-host", ""), i.style.cssText = "position:fixed;left:-99999px;top:0;z-index:-1;visibility:visible;pointer-events:none;", i.innerHTML = await Jt();
	let a = document.createElement("div");
	a.className = n ? "output_night" : "", a.style.width = r;
	let o = document.createElement("div");
	o.className = "preview border-x shadow-xl mx-auto", o.style.width = r, o.style.margin = "0";
	let s = t.cloneNode(!0);
	return s.removeAttribute("id"), s.classList.add(It), s.style.width = "100%", s.querySelectorAll(".diagram-download-bar").forEach((e) => e.remove()), At(s), Bt(s), o.appendChild(s), a.appendChild(o), i.appendChild(a), f(i), {
		el: o,
		content: s,
		cleanup: () => i.remove()
	};
}
function yn() {
	return {
		backgroundColor: Kt(),
		skipFonts: !0,
		pixelRatio: Math.max(window.devicePixelRatio || 1, 2),
		style: { margin: "0" }
	};
}
async function bn(e = "untitled", t) {
	await q();
	let n = await vn(t.previewDevice);
	if (n) try {
		await Ct(100);
		let { toPng: t } = await import("./es-IlpKT8sT.js");
		K(await t(n.el, yn()), `${G(e)}.png`, "image/png");
	} finally {
		n.cleanup();
	}
}
var xn = [
	2e3,
	4e3,
	6e3,
	8e3
], Sn = 4e3;
function Cn(e, t) {
	if (e.length === 0) return [];
	let n = [], r = [], i = e[0].top;
	for (let a = 0; a < e.length; a++) e[a].bottom - i > t && r.length > 0 && (n.push(r), r = [], i = e[a].top), r.push(a);
	return r.length > 0 && n.push(r), n;
}
function wn(e) {
	return e.map((e) => {
		let t = e.getBoundingClientRect();
		return {
			top: t.top,
			bottom: t.bottom
		};
	});
}
function Tn(e) {
	let t = e;
	for (; t.children.length === 1;) {
		let e = t.firstElementChild;
		if (e.tagName !== "SECTION" && e.tagName !== "DIV") break;
		t = e;
	}
	return t;
}
function En(e) {
	return Array.from(e.children).filter((e) => {
		let t = e.getBoundingClientRect();
		return t.width > 0 || t.height > 0;
	});
}
async function Dn(e, t) {
	let { zip: n } = await import("./browser-CVKpqfEq.js").then((e) => e.t), r = {}, i = String(e.length).length;
	for (let n = 0; n < e.length; n++) {
		let a = String(n + 1).padStart(i, "0");
		r[`${t}-${a}.png`] = new Uint8Array(await e[n].arrayBuffer());
	}
	let a = await new Promise((e, t) => n(r, (n, r) => n ? t(n) : e(r))), o = URL.createObjectURL(new Blob([a], { type: "application/zip" }));
	try {
		K(o, `${t}.zip`, "application/zip");
	} finally {
		URL.revokeObjectURL(o);
	}
}
function On(e, t) {
	let n = URL.createObjectURL(e);
	try {
		K(n, `${t}.png`, "image/png");
	} finally {
		URL.revokeObjectURL(n);
	}
}
async function kn(e = "untitled", t) {
	await q();
	let n = await vn(t.previewDevice);
	if (!n) return 0;
	try {
		await Ct(100);
		let r = En(Tn(n.content));
		if (r.length === 0) return 0;
		let i = Cn(wn(r), t.maxSegmentHeight), a = yn(), { toBlob: o } = await import("./es-IlpKT8sT.js"), s = r.map((e) => e.style.display), c = [];
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
		let l = G(e);
		return c.length === 1 ? On(c[0], l) : await Dn(c, l), c.length;
	} finally {
		n.cleanup();
	}
}
var An = o("ui", () => {
	let e = m(), t = e ? i(e.mode === "dark") : oe(), r = A(t), a = b.reactive("showAIToolbox", !0), o = A(a), s = b.reactive("hasShownAIToolboxHint", !1), c = b.reactive(x("is_open_right_slider"), !1), u = b.reactive(x("is_open_post_slider"), !1), d = b.reactive(x("is_open_folder_panel"), !1), f = b.reactive(x("is_open_emoji_manager"), !1), p = A(f), h = b.reactive("isMobile", !1), g = b.reactive("viewMode", "split");
	function _(e) {
		g.value = e;
	}
	let v = b.reactive("previewDevice", "mobile");
	function y(e) {
		v.value = e;
	}
	function S() {
		v.value = v.value === "desktop" ? "mobile" : "desktop";
	}
	let C = b.reactive(x("enableImageReupload"), !1), w = A(C), T = b.reactive(x("enableScrollSync"), !0), E = A(T), D = b.reactive(x("copyMode"), "txt"), O = b.reactive("isShowCssEditor", !1), k = A(O), ee = i(!1);
	function te() {
		ee.value = !0;
	}
	function ne() {
		ee.value = !1;
	}
	let re = i(!1), ie = A(re), ae = i(!1), se = i(""), ce = i(!0), j = i(null);
	function le(e = {}) {
		se.value = e.value ?? "", ce.value = e.displayMode ?? !0, j.value = e.sourceRaw ?? null, ae.value = !0;
	}
	function ue() {
		ae.value = !1, se.value = "", ce.value = !0, j.value = null;
	}
	let de = i(!1), fe = A(de), pe = i(null), M = i(!1), me = A(M), he = i(null), N = i(!1), ge = A(N), _e = i(!1), ve = A(_e), ye = i(!1), be = i("theme"), xe = i("discover");
	function Se(e) {
		e?.tab, be.value = "theme", xe.value = e?.view ?? "discover", ye.value = !0;
	}
	let Ce = i(!1), we = A(Ce), Te = i(!1), Ee = A(Te), De = i(!1), Oe = i("create");
	function P(e) {
		Oe.value = e?.tab ?? "create", De.value = !0;
	}
	let F = i(!1), I = b.reactive("pdfExportOptions", { ...X });
	function L() {
		I.value = hn(I.value), F.value = !0;
	}
	let ke = i(!1), Ae = A(ke), je = i(!1), Me = A(je), Ne = i(!1), Pe = A(Ne), Fe = i(!1), Ie = A(Fe), Le = i(!1), Re = A(Le), R = i(!1), ze = A(R), Be = i(!1), Ve = A(Be), He = i(null);
	function Ue(e) {
		He.value = e, _e.value = !0;
	}
	let z = i(!1), We = i(!1);
	function Ge(e) {
		z.value = e ?? !z.value;
	}
	function Ke(e) {
		We.value = e ?? !We.value;
	}
	let B = i(null);
	function qe(e = "", t = !1) {
		B.value = {
			word: e,
			showReplace: t
		};
	}
	function Je() {
		B.value = null;
	}
	let Ye = i(0);
	function Xe() {
		Ye.value++;
	}
	let V = !1;
	function H() {
		let t = h.value;
		h.value = (e?.root.clientWidth || window.innerWidth) <= 768, !t && h.value && g.value === "split" ? (g.value = "edit", V = !0) : t && !h.value && V && (g.value = "split", V = !1);
	}
	let U;
	return l(() => {
		H(), e ? (U = new ResizeObserver(H), U.observe(e.root)) : window.addEventListener("resize", H);
	}), n(() => {
		U?.disconnect(), window.removeEventListener("resize", H);
	}), {
		isDark: t,
		showAIToolbox: a,
		hasShownAIToolboxHint: s,
		isOpenRightSlider: c,
		isOpenPostSlider: u,
		isMobile: h,
		viewMode: g,
		previewDevice: v,
		isOpenFolderPanel: d,
		isOpenEmojiManager: f,
		enableImageReupload: C,
		enableScrollSync: T,
		copyMode: D,
		isShowCssEditor: O,
		toggleShowCssEditor: k,
		isShowTableEditDialog: ee,
		openTableEditDialog: te,
		closeTableEditDialog: ne,
		isShowUploadImgDialog: re,
		toggleShowUploadImgDialog: ie,
		isShowFormulaEditorDialog: ae,
		formulaEditorValue: se,
		formulaEditorDisplayMode: ce,
		formulaEditorSourceRaw: j,
		openFormulaEditor: le,
		closeFormulaEditor: ue,
		isShowImportMdDialog: de,
		toggleShowImportMdDialog: fe,
		importMdOpenUrl: pe,
		isShowLocalImageUpload: M,
		toggleShowLocalImageUpload: me,
		localImageUploadData: he,
		isShowTemplateDialog: N,
		toggleShowTemplateDialog: ge,
		isShowComponentDialog: _e,
		toggleShowComponentDialog: ve,
		isShowMarketplaceDialog: ye,
		marketplaceDialogTab: be,
		marketplaceDialogView: xe,
		openMarketplaceDialog: Se,
		isShowSyncDialog: Ce,
		toggleShowSyncDialog: we,
		isShowAccountDialog: Te,
		toggleShowAccountDialog: Ee,
		isShowShareDialog: De,
		shareDialogInitialTab: Oe,
		openShareDialog: P,
		isShowPdfExportDialog: F,
		openPdfExportDialog: L,
		pdfExportOptions: I,
		isShowAboutDialog: ke,
		toggleShowAboutDialog: Ae,
		isShowFundDialog: je,
		toggleShowFundDialog: Me,
		isShowMarkdownHelpDialog: Ne,
		toggleShowMarkdownHelpDialog: Pe,
		isShowEditorStateDialog: Fe,
		toggleShowEditorStateDialog: Ie,
		isShowPreferencesDialog: Le,
		toggleShowPreferencesDialog: Re,
		isShowKeyboardShortcutsDialog: R,
		toggleShowKeyboardShortcutsDialog: ze,
		isShowCommandPalette: Be,
		toggleShowCommandPalette: Ve,
		componentDialogTarget: He,
		openComponentDialogWithTarget: Ue,
		aiDialogVisible: z,
		toggleAIDialog: Ge,
		aiImageDialogVisible: We,
		toggleAIImageDialog: Ke,
		searchTabRequest: B,
		openSearchTab: qe,
		clearSearchTabRequest: Je,
		goToLineRequest: Ye,
		requestGoToLine: Xe,
		toggleDark: r,
		toggleAIToolbox: o,
		toggleImageReupload: w,
		toggleScrollSync: E,
		toggleShowEmojiManager: p,
		setViewMode: _,
		setPreviewDevice: y,
		togglePreviewDevice: S
	};
}), jn = {
	"zh-CN": "/* 全局变量 */\n:root {\n}\n\n/* 根容器 */\n.container {\n}\n\n/* 标题 */\nh1 {\n}\n\nh2 {\n}\n\nh3 {\n}\n\nh4 {\n}\n\nh5 {\n}\n\nh6 {\n}\n\n/* 段落和文本 */\np {\n}\n\nstrong {\n}\n\nem {\n}\n\n/* 引用块 */\nblockquote {\n}\n\nblockquote > p {\n}\n\n/* 代码 */\n/* 行内代码 */\n.codespan {\n}\n\n/* 代码块容器 */\npre.code__pre,\n.hljs.code__pre {\n}\n\n/* 代码块内的 code */\npre.code__pre > code,\n.hljs.code__pre > code {\n}\n\n/* 列表 */\nol {\n}\n\nul {\n}\n\nli {\n}\n\n/* 表格 */\ntable {\n}\n\nthead {\n}\n\nth {\n}\n\ntd {\n}\n\n/* 其他元素 */\nimg {\n}\n\nhr {\n}\n\n/* 分隔线变体：--- */\nhr.hr-dash {\n}\n\n/* 分隔线变体：*** */\nhr.hr-star {\n}\n\n/* 分隔线变体：___ */\nhr.hr-underscore {\n}\n\nfigure {\n}\n\nfigcaption {\n}\n\n/* KaTeX 公式 */\n.katex-inline {\n}\n\n.katex-block {\n}\n\n/* Markup 标记 */\n/* 高亮 ==文本== */\n.markup-highlight {\n}\n\n/* 下划线 ++文本++ */\n.markup-underline {\n}\n\n/* 波浪线 ~文本~ */\n.markup-wavyline {\n}\n\n/* GFM Alert 警告块 */\n/* Alert 标题 */\n.alert-title-note {\n}\n\n.alert-title-tip {\n}\n\n.alert-title-info {\n}\n\n.alert-title-important {\n}\n\n.alert-title-warning {\n}\n\n.alert-title-caution {\n}\n\n.alert-title-abstract {\n}\n\n.alert-title-summary {\n}\n\n.alert-title-tldr {\n}\n\n.alert-title-todo {\n}\n\n.alert-title-success {\n}\n\n.alert-title-done {\n}\n\n.alert-title-question {\n}\n\n.alert-title-help {\n}\n\n.alert-title-faq {\n}\n\n.alert-title-failure {\n}\n\n.alert-title-fail {\n}\n\n.alert-title-missing {\n}\n\n.alert-title-danger {\n}\n\n.alert-title-error {\n}\n\n.alert-title-bug {\n}\n\n.alert-title-example {\n}\n\n.alert-title-quote {\n}\n\n.alert-title-cite {\n}\n\n/* Alert SVG 图标 */\n.alert-icon-note {\n}\n\n.alert-icon-tip {\n}\n\n.alert-icon-info {\n}\n\n.alert-icon-important {\n}\n\n.alert-icon-warning {\n}\n\n.alert-icon-caution {\n}\n\n/* Obsidian-style Callout SVG 图标 */\n.alert-icon-abstract {\n}\n\n.alert-icon-summary {\n}\n\n.alert-icon-tldr {\n}\n\n.alert-icon-todo {\n}\n\n.alert-icon-success {\n}\n\n.alert-icon-done {\n}\n\n.alert-icon-question {\n}\n\n.alert-icon-help {\n}\n\n.alert-icon-faq {\n}\n\n.alert-icon-failure {\n}\n\n.alert-icon-fail {\n}\n\n.alert-icon-missing {\n}\n\n.alert-icon-danger {\n}\n\n.alert-icon-error {\n}\n\n.alert-icon-bug {\n}\n\n.alert-icon-example {\n}\n\n.alert-icon-quote {\n}\n\n.alert-icon-cite {\n}\n",
	"zh-TW": "/* 全域變數 */\n:root {\n}\n\n/* 根容器 */\n.container {\n}\n\n/* 標題 */\nh1 {\n}\n\nh2 {\n}\n\nh3 {\n}\n\nh4 {\n}\n\nh5 {\n}\n\nh6 {\n}\n\n/* 段落和文字 */\np {\n}\n\nstrong {\n}\n\nem {\n}\n\n/* 引用塊 */\nblockquote {\n}\n\nblockquote > p {\n}\n\n/* 程式碼 */\n/* 行內程式碼 */\n.codespan {\n}\n\n/* 程式碼塊容器 */\npre.code__pre,\n.hljs.code__pre {\n}\n\n/* 程式碼塊內的 code */\npre.code__pre > code,\n.hljs.code__pre > code {\n}\n\n/* 清單 */\nol {\n}\n\nul {\n}\n\nli {\n}\n\n/* 表格 */\ntable {\n}\n\nthead {\n}\n\nth {\n}\n\ntd {\n}\n\n/* 其他元素 */\nimg {\n}\n\nhr {\n}\n\n/* 分隔線變體：--- */\nhr.hr-dash {\n}\n\n/* 分隔線變體：*** */\nhr.hr-star {\n}\n\n/* 分隔線變體：___ */\nhr.hr-underscore {\n}\n\nfigure {\n}\n\nfigcaption {\n}\n\n/* KaTeX 公式 */\n.katex-inline {\n}\n\n.katex-block {\n}\n\n/* Markup 標記 */\n/* 高亮 ==文字== */\n.markup-highlight {\n}\n\n/* 底線 ++文字++ */\n.markup-underline {\n}\n\n/* 波浪線 ~文字~ */\n.markup-wavyline {\n}\n\n/* GFM Alert 警告塊 */\n/* Alert 標題 */\n.alert-title-note {\n}\n\n.alert-title-tip {\n}\n\n.alert-title-info {\n}\n\n.alert-title-important {\n}\n\n.alert-title-warning {\n}\n\n.alert-title-caution {\n}\n\n.alert-title-abstract {\n}\n\n.alert-title-summary {\n}\n\n.alert-title-tldr {\n}\n\n.alert-title-todo {\n}\n\n.alert-title-success {\n}\n\n.alert-title-done {\n}\n\n.alert-title-question {\n}\n\n.alert-title-help {\n}\n\n.alert-title-faq {\n}\n\n.alert-title-failure {\n}\n\n.alert-title-fail {\n}\n\n.alert-title-missing {\n}\n\n.alert-title-danger {\n}\n\n.alert-title-error {\n}\n\n.alert-title-bug {\n}\n\n.alert-title-example {\n}\n\n.alert-title-quote {\n}\n\n.alert-title-cite {\n}\n\n/* Alert SVG 圖示 */\n.alert-icon-note {\n}\n\n.alert-icon-tip {\n}\n\n.alert-icon-info {\n}\n\n.alert-icon-important {\n}\n\n.alert-icon-warning {\n}\n\n.alert-icon-caution {\n}\n\n/* Obsidian-style Callout SVG 圖示 */\n.alert-icon-abstract {\n}\n\n.alert-icon-summary {\n}\n\n.alert-icon-tldr {\n}\n\n.alert-icon-todo {\n}\n\n.alert-icon-success {\n}\n\n.alert-icon-done {\n}\n\n.alert-icon-question {\n}\n\n.alert-icon-help {\n}\n\n.alert-icon-faq {\n}\n\n.alert-icon-failure {\n}\n\n.alert-icon-fail {\n}\n\n.alert-icon-missing {\n}\n\n.alert-icon-danger {\n}\n\n.alert-icon-error {\n}\n\n.alert-icon-bug {\n}\n\n.alert-icon-example {\n}\n\n.alert-icon-quote {\n}\n\n.alert-icon-cite {\n}\n",
	"en-US": "/* Global variables */\n:root {\n}\n\n/* Root container */\n.container {\n}\n\n/* Headings */\nh1 {\n}\n\nh2 {\n}\n\nh3 {\n}\n\nh4 {\n}\n\nh5 {\n}\n\nh6 {\n}\n\n/* Paragraphs and text */\np {\n}\n\nstrong {\n}\n\nem {\n}\n\n/* Blockquote */\nblockquote {\n}\n\nblockquote > p {\n}\n\n/* Code */\n/* Inline code */\n.codespan {\n}\n\n/* Code block container */\npre.code__pre,\n.hljs.code__pre {\n}\n\n/* Code inside code block */\npre.code__pre > code,\n.hljs.code__pre > code {\n}\n\n/* Lists */\nol {\n}\n\nul {\n}\n\nli {\n}\n\n/* Tables */\ntable {\n}\n\nthead {\n}\n\nth {\n}\n\ntd {\n}\n\n/* Other elements */\nimg {\n}\n\nhr {\n}\n\n/* Horizontal rule variant: --- */\nhr.hr-dash {\n}\n\n/* Horizontal rule variant: *** */\nhr.hr-star {\n}\n\n/* Horizontal rule variant: ___ */\nhr.hr-underscore {\n}\n\nfigure {\n}\n\nfigcaption {\n}\n\n/* KaTeX */\n.katex-inline {\n}\n\n.katex-block {\n}\n\n/* Markup */\n/* Highlight ==text== */\n.markup-highlight {\n}\n\n/* Underline ++text++ */\n.markup-underline {\n}\n\n/* Wavy underline ~text~ */\n.markup-wavyline {\n}\n\n/* GFM Alert */\n/* Alert titles */\n.alert-title-note {\n}\n\n.alert-title-tip {\n}\n\n.alert-title-info {\n}\n\n.alert-title-important {\n}\n\n.alert-title-warning {\n}\n\n.alert-title-caution {\n}\n\n.alert-title-abstract {\n}\n\n.alert-title-summary {\n}\n\n.alert-title-tldr {\n}\n\n.alert-title-todo {\n}\n\n.alert-title-success {\n}\n\n.alert-title-done {\n}\n\n.alert-title-question {\n}\n\n.alert-title-help {\n}\n\n.alert-title-faq {\n}\n\n.alert-title-failure {\n}\n\n.alert-title-fail {\n}\n\n.alert-title-missing {\n}\n\n.alert-title-danger {\n}\n\n.alert-title-error {\n}\n\n.alert-title-bug {\n}\n\n.alert-title-example {\n}\n\n.alert-title-quote {\n}\n\n.alert-title-cite {\n}\n\n/* Alert SVG icons */\n.alert-icon-note {\n}\n\n.alert-icon-tip {\n}\n\n.alert-icon-info {\n}\n\n.alert-icon-important {\n}\n\n.alert-icon-warning {\n}\n\n.alert-icon-caution {\n}\n\n/* Obsidian-style Callout SVG icons */\n.alert-icon-abstract {\n}\n\n.alert-icon-summary {\n}\n\n.alert-icon-tldr {\n}\n\n.alert-icon-todo {\n}\n\n.alert-icon-success {\n}\n\n.alert-icon-done {\n}\n\n.alert-icon-question {\n}\n\n.alert-icon-help {\n}\n\n.alert-icon-faq {\n}\n\n.alert-icon-failure {\n}\n\n.alert-icon-fail {\n}\n\n.alert-icon-missing {\n}\n\n.alert-icon-danger {\n}\n\n.alert-icon-error {\n}\n\n.alert-icon-bug {\n}\n\n.alert-icon-example {\n}\n\n.alert-icon-quote {\n}\n\n.alert-icon-cite {\n}\n",
	"ja-JP": "/* グローバル変数 */\n:root {\n}\n\n/* ルートコンテナ */\n.container {\n}\n\n/* 見出し */\nh1 {\n}\n\nh2 {\n}\n\nh3 {\n}\n\nh4 {\n}\n\nh5 {\n}\n\nh6 {\n}\n\n/* 段落とテキスト */\np {\n}\n\nstrong {\n}\n\nem {\n}\n\n/* 引用 */\nblockquote {\n}\n\nblockquote > p {\n}\n\n/* コード */\n/* インラインコード */\n.codespan {\n}\n\n/* コードブロックコンテナ */\npre.code__pre,\n.hljs.code__pre {\n}\n\n/* コードブロック内の code */\npre.code__pre > code,\n.hljs.code__pre > code {\n}\n\n/* リスト */\nol {\n}\n\nul {\n}\n\nli {\n}\n\n/* テーブル */\ntable {\n}\n\nthead {\n}\n\nth {\n}\n\ntd {\n}\n\n/* その他の要素 */\nimg {\n}\n\nhr {\n}\n\n/* 区切り線バリアント：--- */\nhr.hr-dash {\n}\n\n/* 区切り線バリアント：*** */\nhr.hr-star {\n}\n\n/* 区切り線バリアント：___ */\nhr.hr-underscore {\n}\n\nfigure {\n}\n\nfigcaption {\n}\n\n/* KaTeX 数式 */\n.katex-inline {\n}\n\n.katex-block {\n}\n\n/* Markup */\n/* ハイライト ==text== */\n.markup-highlight {\n}\n\n/* 下線 ++text++ */\n.markup-underline {\n}\n\n/* 波線 ~text~ */\n.markup-wavyline {\n}\n\n/* GFM Alert */\n/* Alert タイトル */\n.alert-title-note {\n}\n\n.alert-title-tip {\n}\n\n.alert-title-info {\n}\n\n.alert-title-important {\n}\n\n.alert-title-warning {\n}\n\n.alert-title-caution {\n}\n\n.alert-title-abstract {\n}\n\n.alert-title-summary {\n}\n\n.alert-title-tldr {\n}\n\n.alert-title-todo {\n}\n\n.alert-title-success {\n}\n\n.alert-title-done {\n}\n\n.alert-title-question {\n}\n\n.alert-title-help {\n}\n\n.alert-title-faq {\n}\n\n.alert-title-failure {\n}\n\n.alert-title-fail {\n}\n\n.alert-title-missing {\n}\n\n.alert-title-danger {\n}\n\n.alert-title-error {\n}\n\n.alert-title-bug {\n}\n\n.alert-title-example {\n}\n\n.alert-title-quote {\n}\n\n.alert-title-cite {\n}\n\n/* Alert SVG アイコン */\n.alert-icon-note {\n}\n\n.alert-icon-tip {\n}\n\n.alert-icon-info {\n}\n\n.alert-icon-important {\n}\n\n.alert-icon-warning {\n}\n\n.alert-icon-caution {\n}\n\n/* Obsidian-style Callout SVG アイコン */\n.alert-icon-abstract {\n}\n\n.alert-icon-summary {\n}\n\n.alert-icon-tldr {\n}\n\n.alert-icon-todo {\n}\n\n.alert-icon-success {\n}\n\n.alert-icon-done {\n}\n\n.alert-icon-question {\n}\n\n.alert-icon-help {\n}\n\n.alert-icon-faq {\n}\n\n.alert-icon-failure {\n}\n\n.alert-icon-fail {\n}\n\n.alert-icon-missing {\n}\n\n.alert-icon-danger {\n}\n\n.alert-icon-error {\n}\n\n.alert-icon-bug {\n}\n\n.alert-icon-example {\n}\n\n.alert-icon-quote {\n}\n\n.alert-icon-cite {\n}\n"
};
function Mn(e = "zh-CN") {
	return jn[e] ?? jn["zh-CN"];
}
var Nn = [
	Ne(),
	be(),
	ye(),
	ue(),
	De(),
	ve(),
	F.allowMultipleSelections.of(!0),
	je(),
	fe(ze, { fallback: !0 }),
	de(),
	j(),
	le(),
	xe(),
	Me(),
	ke(),
	Ce(),
	we(),
	P.of([
		...pe,
		...R,
		...ge,
		...Re,
		...N,
		...se,
		...Ie,
		{
			key: "Tab",
			run: he
		},
		me
	])
];
function Z(e, { prefix: t, suffix: n, check: r, afterInsertCursorOffset: i = 0 }) {
	let a = e.state.selection.main, o = e.state.doc.sliceString(a.from, a.to), s = r?.(o) ?? !1, c;
	if (s) c = o.slice(t.length, o.length - n.length), e.dispatch(e.state.replaceSelection(c));
	else if (c = `${t}${o}${n}`, e.dispatch(e.state.replaceSelection(c)), i !== 0) {
		let t = e.state.selection.main.head + i;
		e.dispatch({ selection: { anchor: t } });
	}
}
function Q(e, t) {
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
function Pn(e) {
	Z(e, {
		prefix: "**",
		suffix: "**",
		check: (e) => e.startsWith("**") && e.endsWith("**"),
		afterInsertCursorOffset: -2
	});
}
function Fn(e) {
	Z(e, {
		prefix: "*",
		suffix: "*",
		check: (e) => e.startsWith("*") && e.endsWith("*"),
		afterInsertCursorOffset: -1
	});
}
function In(e) {
	Z(e, {
		prefix: "~~",
		suffix: "~~",
		check: (e) => e.startsWith("~~") && e.endsWith("~~"),
		afterInsertCursorOffset: -2
	});
}
function Ln(e) {
	Z(e, {
		prefix: "[",
		suffix: "]()",
		check: (e) => e.startsWith("[") && e.endsWith("]()"),
		afterInsertCursorOffset: -1
	});
}
function Rn(e) {
	Z(e, {
		prefix: "`",
		suffix: "`",
		check: (e) => e.startsWith("`") && e.endsWith("`"),
		afterInsertCursorOffset: -1
	});
}
function zn(e) {
	let t = e.state.selection.main, n = e.state.doc.sliceString(t.from, t.to).split("\n"), r = n.every((e) => e.trim().startsWith("- ")) ? n.map((e) => e.replace(/^- +/, "")).join("\n") : n.map((e) => `- ${e}`).join("\n");
	e.dispatch(e.state.replaceSelection(r));
}
function Bn(e) {
	let t = e.state.selection.main, n = e.state.doc.sliceString(t.from, t.to).split("\n"), r = n.every((e) => /^\d+\.\s/.test(e.trim())) ? n.map((e) => e.replace(/^\d+\.\s+/, "")).join("\n") : n.map((e, t) => `${t + 1}. ${e}`).join("\n");
	e.dispatch(e.state.replaceSelection(r));
}
function Vn(e) {
	return Le(e);
}
function Hn(e) {
	return ce(e);
}
var Un = [
	M.of({
		name: "C",
		extensions: ["c", "h"],
		load: () => import("./dist-CKHFdyIa.js").then((e) => e.cpp())
	}),
	M.of({
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
	M.of({
		name: "CSS",
		extensions: ["css"],
		load: () => import("./codemirror-C3tEDw1q.js").then((e) => e.u).then((e) => e.css())
	}),
	M.of({
		name: "Go",
		extensions: ["go"],
		load: () => import("./dist-BZUIPWhT.js").then((e) => e.go())
	}),
	M.of({
		name: "HTML",
		alias: ["xhtml"],
		extensions: ["html", "htm"],
		load: () => import("./codemirror-C3tEDw1q.js").then((e) => e.o).then((e) => e.html())
	}),
	M.of({
		name: "Java",
		extensions: ["java"],
		load: () => import("./dist-CKT5BxhH.js").then((e) => e.java())
	}),
	M.of({
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
	M.of({
		name: "JSON",
		alias: ["json5"],
		extensions: ["json"],
		load: () => import("./dist-D59A65n_.js").then((e) => e.json())
	}),
	M.of({
		name: "JSX",
		extensions: ["jsx"],
		load: () => import("./codemirror-C3tEDw1q.js").then((e) => e.c).then((e) => e.javascript({ jsx: !0 }))
	}),
	M.of({
		name: "Markdown",
		alias: ["md"],
		extensions: ["md", "markdown"],
		load: () => import("./codemirror-C3tEDw1q.js").then((e) => e.r).then((e) => e.markdown())
	}),
	M.of({
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
	M.of({
		name: "Python",
		alias: ["py"],
		extensions: ["py", "pyw"],
		load: () => import("./dist-CUznL96T.js").then((e) => e.python())
	}),
	M.of({
		name: "Rust",
		alias: ["rs"],
		extensions: ["rs"],
		load: () => import("./dist-DDDV7C0t.js").then((e) => e.rust())
	}),
	M.of({
		name: "SQL",
		extensions: ["sql"],
		load: () => import("./dist-DTIuew6s.js").then((e) => e.sql())
	}),
	M.of({
		name: "TSX",
		extensions: ["tsx"],
		load: () => import("./codemirror-C3tEDw1q.js").then((e) => e.c).then((e) => e.javascript({
			jsx: !0,
			typescript: !0
		}))
	}),
	M.of({
		name: "TypeScript",
		alias: ["ts"],
		extensions: [
			"ts",
			"mts",
			"cts"
		],
		load: () => import("./codemirror-C3tEDw1q.js").then((e) => e.c).then((e) => e.javascript({ typescript: !0 }))
	}),
	M.of({
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
	M.of({
		name: "YAML",
		alias: ["yml"],
		extensions: ["yaml", "yml"],
		load: () => import("./dist-DwlXcRCs.js").then((e) => e.yaml())
	})
];
async function Wn(e) {
	let t = e.state.doc.toString(), { formatDoc: n } = await import("./formatDoc-BDYZgvY1.js"), r = await n(t, "markdown");
	e.dispatch({ changes: {
		from: 0,
		to: e.state.doc.length,
		insert: r
	} });
}
function Gn(e) {
	let t = e.state.changeByRange((e) => ({
		changes: {
			from: e.from,
			to: e.to,
			insert: "  "
		},
		range: Ae.range(e.from + 2, e.from + 2)
	}));
	return e.dispatch(t), !0;
}
function Kn(e) {
	let { onSearch: t, onReplace: n, onGoToLine: r } = e || {};
	return P.of([
		{
			key: "Tab",
			run: Gn
		},
		{
			key: "Mod-z",
			run: Vn
		},
		{
			key: "Mod-y",
			run: Hn
		},
		{
			key: "Mod-b",
			run: (e) => (Pn(e), !0)
		},
		{
			key: "Mod-i",
			run: (e) => (Fn(e), !0)
		},
		{
			key: "Mod-d",
			run: (e) => (In(e), !0)
		},
		{
			key: "Mod-k",
			run: (e) => (Ln(e), !0)
		},
		{
			key: "Mod-e",
			run: (e) => (Rn(e), !0)
		},
		{
			key: "Mod-1",
			run: (e) => (Q(e, 1), !0)
		},
		{
			key: "Mod-2",
			run: (e) => (Q(e, 2), !0)
		},
		{
			key: "Mod-3",
			run: (e) => (Q(e, 3), !0)
		},
		{
			key: "Mod-4",
			run: (e) => (Q(e, 4), !0)
		},
		{
			key: "Mod-5",
			run: (e) => (Q(e, 5), !0)
		},
		{
			key: "Mod-6",
			run: (e) => (Q(e, 6), !0)
		},
		{
			key: "Mod-u",
			run: (e) => (zn(e), !0)
		},
		{
			key: "Mod-o",
			run: (e) => (Bn(e), !0)
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
			run: (e) => (Wn(e), !0)
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
function qn(e) {
	let { placeholder: t, withoutHistory: n } = e || {};
	return [
		...n ? [] : [ye()],
		Ce(),
		j(),
		we(),
		Ee({
			base: _e,
			codeLanguages: Un,
			addKeymap: !0
		}),
		Te.high(Kn(e)),
		ue(),
		P.of([
			...R,
			...Re,
			...pe,
			...N
		]),
		L.lineWrapping,
		F.allowMultipleSelections.of(!0),
		...t ? [Fe(t)] : []
	];
}
var Jn = L.theme({
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
function Yn() {
	return [Pe, Jn];
}
function Xn() {
	return [I, Jn];
}
function Zn(e) {
	return e ? Xn() : Yn();
}
async function Qn(e) {
	let t = e.state.doc.toString(), { formatDoc: n } = await import("./formatDoc-BDYZgvY1.js"), r = await n(t, "css");
	e.dispatch({ changes: {
		from: 0,
		to: e.state.doc.length,
		insert: r
	} });
}
function $n() {
	return [
		Nn,
		Oe(),
		L.lineWrapping,
		P.of([{
			key: "Shift-Alt-f",
			run: (e) => (Qn(e), !0)
		}])
	];
}
function $() {
	return Mn(w());
}
var er = o("cssEditor", () => {
	let e = m() ? c(() => An().isDark) : oe(), n = i(null), a = i(null), o = b.reactive(x("css_content_config"), {
		active: "",
		tabs: []
	});
	t(() => {
		let e = /* @__PURE__ */ new Date();
		if (o.value.tabs.length === 0) {
			let t = v();
			o.value.tabs = [{
				id: t,
				title: C("store.cssEditor.schemeDefault"),
				name: C("store.cssEditor.schemeDefault"),
				content: $(),
				createDatetime: e,
				updateDatetime: e
			}], o.value.active = t;
			return;
		}
		if (o.value.tabs = o.value.tabs.map((t, n) => ({
			...t,
			id: t.id ?? v(),
			createDatetime: t.createDatetime ?? new Date(e.getTime() + n),
			updateDatetime: t.updateDatetime ?? new Date(e.getTime() + n)
		})), !o.value.tabs.find((e) => e.id === o.value.active)) {
			let e = o.value.tabs.find((e) => e.name === o.value.active);
			o.value.active = e?.id ?? o.value.tabs[0].id;
		}
	});
	let l = () => {
		let e = o.value.tabs.find((e) => e.id === o.value.active);
		if (!e) {
			if (o.value.tabs.length === 0) {
				let e = v(), t = /* @__PURE__ */ new Date();
				return o.value.tabs = [{
					id: e,
					title: C("store.cssEditor.schemeDefault"),
					name: C("store.cssEditor.schemeDefault"),
					content: $(),
					createDatetime: t,
					updateDatetime: t
				}], o.value.active = e, o.value.tabs[0];
			}
			return o.value.active = o.value.tabs[0].id, o.value.tabs[0];
		}
		return e;
	}, d = () => l().content, f = (e) => {
		n.value && n.value.dispatch({ changes: {
			from: 0,
			to: n.value.state.doc.length,
			insert: e
		} });
	}, p = null;
	return r(e, () => {
		n.value && a.value && n.value.dispatch({ effects: a.value.reconfigure(Zn(e.value)) });
	}), {
		cssEditor: n,
		cssContentConfig: o,
		isSelectMode: c(() => o.value.isSelectMode ?? !1),
		selectedIds: c(() => o.value.selectedIds ?? []),
		getCurrentTab: l,
		getCurrentTabContent: d,
		setCssEditorValue: f,
		setOnTabChangedCallback: (e) => {
			p = e;
		},
		tabChanged: (e) => {
			o.value.active = e;
			let t = o.value.tabs.find((t) => t.id === e);
			t && (f(t.content), p && p(t.content));
		},
		renameTab: (e) => {
			let t = l();
			t.title = e, t.name = e;
		},
		addCssContentTab: (e, t) => {
			let n = t ?? $(), r = /* @__PURE__ */ new Date();
			o.value.tabs.push({
				id: v(),
				name: e,
				title: e,
				content: n,
				createDatetime: r,
				updateDatetime: r
			});
			let i = o.value.tabs[o.value.tabs.length - 1];
			o.value.active = i.id, f(n), p && p(n);
		},
		resetCssConfig: () => {
			let e = $(), t = v();
			o.value = {
				active: t,
				tabs: [{
					id: t,
					title: C("store.cssEditor.schemeDefaultSpaced"),
					name: C("store.cssEditor.schemeDefaultSpaced"),
					content: e,
					createDatetime: /* @__PURE__ */ new Date(),
					updateDatetime: /* @__PURE__ */ new Date()
				}]
			}, n.value && n.value.dispatch({ changes: {
				from: 0,
				to: n.value.state.doc.length,
				insert: e
			} });
		},
		initCssEditor: (t) => {
			let r = u("#cssEditor");
			if (!r) return;
			r.value = l().content;
			let i = document.createElement("div");
			i.className = "w-full h-full", r.parentNode?.replaceChild(i, r), a.value = new Se();
			let o = F.create({
				doc: l().content,
				extensions: [
					$n(),
					a.value.of(Zn(e.value)),
					L.updateListener.of((e) => {
						if (e.docChanged) {
							let n = e.state.doc.toString(), r = l();
							r.content = n, r.updateDatetime = /* @__PURE__ */ new Date(), t(n);
						}
					})
				]
			});
			n.value = s(new L({
				state: o,
				parent: i
			}));
		},
		scrollToHeading: (e) => {
			if (!n.value) return;
			let t = n.value.state.doc.toString(), r = RegExp(`^${e}\\s*\\{`, "m"), i = t.match(r);
			if (i && i.index !== void 0) {
				let e = i.index, r = 0, a = e, o = !1;
				for (let n = e; n < t.length; n++) if (t[n] === "{") r++, o = !0;
				else if (t[n] === "}" && (r--, o && r === 0)) {
					a = n + 1;
					break;
				}
				n.value.dispatch({
					selection: {
						anchor: e,
						head: a
					},
					scrollIntoView: !0
				}), n.value.focus();
			}
		},
		toggleSelectMode: () => {
			o.value.isSelectMode = !(o.value.isSelectMode ?? !1), o.value.isSelectMode || (o.value.selectedIds = []);
		},
		toggleSelectTab: (e) => {
			let t = o.value.selectedIds ?? [];
			t.indexOf(e) === -1 ? o.value.selectedIds = [...t, e] : o.value.selectedIds = t.filter((t) => t !== e);
		},
		selectAllTabs: () => {
			o.value.selectedIds = o.value.tabs.map((e) => e.id);
		},
		clearSelection: () => {
			o.value.selectedIds = [];
		},
		batchDeleteTabs: () => {
			let e = o.value.selectedIds ?? [];
			if (e.length === 0) return;
			if (e.length >= o.value.tabs.length) {
				T.warning(C("store.cssEditor.keepAtLeastOne"));
				return;
			}
			let t = o.value.tabs.filter((t) => !e.includes(t.id));
			e.includes(o.value.active) && (o.value.active = t[0].id, f(t[0].content), p && p(t[0].content)), o.value.tabs = t, o.value.selectedIds = [], o.value.isSelectMode = !1, T.success(C("store.cssEditor.batchDeleted", { count: e.length }));
		},
		batchExportTabs: async () => {
			let e = o.value.selectedIds ?? [];
			if (e.length !== 0) {
				if (e.length === 1) {
					let t = o.value.tabs.find((t) => t.id === e[0]);
					t && K(`data:text/css;charset=utf-8,${encodeURIComponent(t.content)}`, `${G(t.title)}.css`);
				} else {
					let { strToU8: t, zip: n } = await import("./browser-CVKpqfEq.js").then((e) => e.t), r = {};
					e.forEach((e) => {
						let n = o.value.tabs.find((t) => t.id === e);
						n && (r[`${G(n.title)}.css`] = t(n.content));
					});
					let i = await new Promise((e, t) => n(r, (n, r) => n ? t(n) : e(r))), a = URL.createObjectURL(new Blob([i], { type: "application/zip" }));
					K(a, "css-schemes.zip"), URL.revokeObjectURL(a);
				}
				o.value.selectedIds = [], o.value.isSelectMode = !1, T.success(C("store.cssEditor.batchExported", { count: e.length }));
			}
		},
		exportSingleTab: (e) => {
			let t = o.value.tabs.find((t) => t.id === e);
			t && (K(`data:text/css;charset=utf-8,${encodeURIComponent(t.content)}`, `${G(t.title)}.css`), T.success(C("store.cssEditor.singleExported", { name: t.title })));
		}
	};
}), tr = o("theme", () => {
	let e = b.reactive(x("theme"), _.theme), t = b.reactive(x("themeSettings"), {}), n = c(() => t.value[e.value] ?? y()), r = c({
		get: () => n.value.primaryColor,
		set: (e) => {
			C("primaryColor", e);
		}
	}), i = c({
		get: () => n.value.fontFamily,
		set: (e) => {
			C("fontFamily", e);
		}
	}), a = c({
		get: () => n.value.fontSize,
		set: (e) => {
			C("fontSize", e);
		}
	}), o = c({
		get: () => n.value.lineHeight ?? _.lineHeight,
		set: (e) => {
			C("lineHeight", e);
		}
	}), s = c({
		get: () => n.value.blockSpacing ?? _.blockSpacing,
		set: (e) => {
			C("blockSpacing", e);
		}
	}), l = c({
		get: () => n.value.linkColor ?? _.linkColor,
		set: (e) => {
			C("linkColor", e);
		}
	}), d = c({
		get: () => n.value.blockquoteBackground ?? _.blockquoteBackground,
		set: (e) => {
			C("blockquoteBackground", e);
		}
	}), f = c({
		get: () => n.value.codeBlockTheme,
		set: (e) => {
			C("codeBlockTheme", e);
		}
	}), p = c({
		get: () => n.value.headingStyles,
		set: (e) => {
			C("headingStyles", e);
		}
	}), v = c({
		get: () => n.value.isShowLineNumber,
		set: (e) => {
			C("isShowLineNumber", e);
		}
	}), S = c({
		get: () => n.value.isMacCodeBlock,
		set: (e) => {
			C("isMacCodeBlock", e);
		}
	});
	function C(n, r) {
		let i = e.value, a = t.value[i] ?? y();
		t.value = {
			...t.value,
			[i]: {
				...a,
				[n]: r
			}
		};
	}
	let w = b.reactive("isCiteStatus", _.isCiteStatus), T = b.reactive("isCountStatus", _.isCountStatus), E = b.reactive(x("use_indent"), !1), D = b.reactive(x("use_justify"), !1), O = b.reactive("legend", _.legend), k = b.reactive("previewWidth", g[0].value);
	return {
		theme: e,
		themeSettings: t,
		fontFamily: i,
		fontSize: a,
		fontSizeNumber: c(() => Number(a.value.replace("px", ""))),
		lineHeight: o,
		blockSpacing: s,
		linkColor: l,
		blockquoteBackground: d,
		primaryColor: r,
		codeBlockTheme: f,
		legend: O,
		isMacCodeBlock: S,
		isShowLineNumber: v,
		isCiteStatus: w,
		isCountStatus: T,
		isUseIndent: E,
		isUseJustify: D,
		previewWidth: k,
		headingStyles: p,
		toggleMacCodeBlock: A(S),
		toggleShowLineNumber: A(v),
		toggleCiteStatus: A(w),
		toggleCountStatus: A(T),
		toggleUseIndent: A(E),
		toggleUseJustify: A(D),
		resetStyle: () => {
			t.value = {
				...t.value,
				[e.value]: y()
			}, w.value = _.isCiteStatus, T.value = _.isCountStatus, O.value = _.legend, E.value = !1, D.value = !1;
		},
		updateCodeTheme: () => {
			if (m()) return;
			let e = f.value, t = u("#hljs");
			if (t) {
				if (t.getAttribute("href") === e) return;
				t.setAttribute("href", e);
			} else {
				let t = document.createElement("link");
				t.setAttribute("type", "text/css"), t.setAttribute("rel", "stylesheet"), t.setAttribute("href", e), t.setAttribute("id", "hljs"), h(t);
			}
		},
		applyCurrentTheme: async () => {
			let t = m();
			try {
				if (t && (!t.live || t.signal.aborted)) return;
				let n = er().getCurrentTabContent(), c;
				if (St(e.value)) {
					let { useMarketplaceStore: t } = await import("./marketplace-C8nh3WtE.js").then((e) => e.t);
					c = t().getInstalledThemeCss(e.value);
				}
				if (t && (!t.live || t.signal.aborted)) return;
				await lt({
					themeName: e.value,
					themeCSS: c,
					customCSS: n,
					variables: {
						primaryColor: r.value,
						fontFamily: i.value,
						fontSize: a.value,
						lineHeight: o.value,
						blockSpacing: s.value,
						linkColor: l.value,
						blockquoteBackground: d.value,
						isUseIndent: E.value,
						isUseJustify: D.value,
						headingStyles: p.value
					}
				});
			} catch (e) {
				console.error("[applyCurrentTheme] 主题应用失败:", e);
			}
		},
		setHeadingStyle: (e, t) => {
			let n = p.value;
			p.value = {
				...n,
				[e]: t === "default" ? void 0 : t
			};
		},
		getHeadingStyle: (e) => p.value[e] || "default"
	};
}), nr = o("render", () => {
	let e = m(), t = () => !e || e.live && !e.signal.aborted, n = i(""), r = a({
		chars: 0,
		words: 0,
		minutes: 0
	}), o = i([]), s = null, c = "", l = "", u = null, d = null, f = () => s, p = () => ({
		mermaidLoading: C("store.diagram.mermaidLoading"),
		mermaidError: C("store.diagram.mermaidError"),
		plantumlLoading: C("store.diagram.plantumlLoading"),
		plantumlError: C("store.diagram.plantumlError"),
		infographicLoading: C("store.diagram.infographicLoading"),
		infographicError: C("store.diagram.infographicError")
	}), h = () => ({ summary: C("store.count.summary", {
		words: "{words}",
		minutes: "{minutes}"
	}) }), g = () => ({
		footnoteTitle: C("store.render.footnoteTitle"),
		unknownComponent: C("store.render.unknownComponent"),
		katexLoading: C("store.render.katexLoading")
	});
	function _(e) {
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
	function v(e, t, n) {
		return [
			e,
			t.isCiteStatus ? "1" : "0",
			t.legend,
			t.isCountStatus ? "1" : "0",
			t.isMacCodeBlock ? "1" : "0",
			t.isShowLineNumber ? "1" : "0",
			_(n),
			C("store.count.summary", {
				words: "{words}",
				minutes: "{minutes}"
			}),
			C("store.render.footnoteTitle"),
			C("store.render.unknownComponent"),
			C("store.render.katexLoading"),
			C("store.diagram.mermaidLoading")
		].join("");
	}
	let y = (e) => {
		let t = s.getHeadings();
		o.value = t.map((e, t) => ({
			url: `#${t}`,
			title: e.text,
			level: e.level
		}));
		let n = 0;
		return e.replace(/data-heading="true"/g, () => `data-heading="true" id="${n++}"`);
	}, b = (i, a) => {
		if (!t()) return n.value;
		if (!s) return d = {
			content: i,
			options: a
		}, n.value;
		let o = tr(), u = An(), f = bt(), m = a?.themeMode ?? (e ? "light" : u.isDark ? "dark" : "light"), _ = v(m, o, f);
		if (!a?.force && i === l && _ === c) return n.value;
		s.reset({
			citeStatus: o.isCiteStatus,
			legend: o.legend,
			countStatus: o.isCountStatus,
			isMacCodeBlock: o.isMacCodeBlock,
			isShowLineNumber: o.isShowLineNumber,
			themeMode: m,
			components: f.registry,
			diagramMessages: p(),
			countMessages: h(),
			renderMessages: g(),
			assetResolver: ft
		});
		let { html: b, readingTime: x } = ae(i, s);
		return r.chars = i.length, r.words = x.words, r.minutes = Math.ceil(x.minutes), n.value = y(D(b, x, s)), l = i, c = _, n.value;
	};
	function x() {
		if (!d || !s) return;
		let e = d;
		d = null, b(e.content, e.options);
	}
	return {
		output: n,
		readingTime: r,
		titleList: o,
		initRendererInstance: async (e) => {
			if (u ??= import("./renderer-2bSccpei.js").then((e) => e.t).then(({ initRenderer: n }) => {
				if (!t()) throw Error("稿件已关闭");
				return s = n(e || {}), c = "", l = "", s;
			}).catch((e) => {
				throw u = null, e;
			}), await u, !t()) throw Error("稿件已关闭");
			return x(), s;
		},
		getRenderer: f,
		render: b
	};
});
export { xt as A, G as B, Yt as C, q as D, Ft as E, mt as F, rt as H, ft as I, ht as L, gt as M, yt as N, Ct as O, pt as P, K as R, Zt as S, jt as T, W as U, st as V, V as W, xn as _, qn as a, _n as b, Rn as c, Bn as d, In as f, Sn as g, An as h, Zn as i, bt as j, St as k, Fn as l, Mn as m, tr as n, Q as o, zn as p, er as r, Pn as s, nr as t, Ln as u, kn as v, Wt as w, Xt as x, bn as y, ut as z };
