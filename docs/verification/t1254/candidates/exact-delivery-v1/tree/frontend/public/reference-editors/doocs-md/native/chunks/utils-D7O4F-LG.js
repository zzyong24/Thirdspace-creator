import { n as e } from "./rolldown-runtime-WOOOH1Hs.js";
import { a as t, c as n, d as r, i, n as a, o, p as s, r as c, t as l } from "./native-host-BoAU4GnD.js";
import { a as u, c as d, d as f, i as p, l as m, n as ee, o as te, r as ne, s as re, u as ie } from "./highlight-ZqbupznI.js";
import { t as h } from "./purify.es-CcTd0BvO.js";
import { n as ae } from "./browser-CVKpqfEq.js";
function g(e) {
	return (t) => e(t);
}
function oe(e) {
	return (t) => e(t);
}
function se(e) {
	return (t) => e(t);
}
function ce(e) {
	return function(t) {
		return e.call(this, t);
	};
}
function le(e) {
	return e.type === "code";
}
function ue(e, t) {
	return Object.assign(e, { type: t });
}
var _ = "data-md-diagram-state", v = {
	loading: "loading",
	error: "error",
	ready: "ready"
}, de = {
	mermaidLoading: "Loading Mermaid…",
	mermaidError: "Mermaid render failed: {detail}",
	plantumlLoading: "Loading PlantUML diagram…",
	plantumlError: "Failed to load PlantUML diagram",
	infographicLoading: "Loading infographic…",
	infographicError: "Infographic render failed: {detail}"
};
function y(e) {
	return `${_}="${e}"`;
}
function b(e) {
	return e ?? de;
}
function fe(e, t) {
	return e.replace("{detail}", t);
}
function pe(e) {
	return e.trimStart().startsWith("<svg");
}
function me(e) {
	if (!(e instanceof HTMLElement) || e.querySelector("svg, img")) return !1;
	let t = e.getAttribute(_);
	return t !== v.error && t !== v.ready;
}
function he(e) {
	return e.slice(0, 1).toUpperCase() + e.slice(1).toLowerCase();
}
function x(e) {
	return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function ge(e) {
	return e.replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function _e(e) {
	let t = 0;
	for (let n = 0; n < e.length; n++) {
		let r = e.charCodeAt(n);
		t = (t << 5) - t + r, t &= t;
	}
	return Math.abs(t).toString(36);
}
var ve = 10, ye = 13, be = 32, xe = 9;
function Se(e) {
	return e === ve || e === ye;
}
function Ce(e, t) {
	return t === 0 || Se(e.charCodeAt(t - 1));
}
function S(e) {
	let t = 0;
	for (;;) {
		let n = e.indexOf("\n", t);
		if (n === -1) return e.length;
		let r = n + 1;
		for (; r < e.length;) {
			let t = e.charCodeAt(r);
			if (t === ve) return n;
			if (t === be || t === xe || t === ye) {
				r++;
				continue;
			}
			break;
		}
		if (r >= e.length) return e.length;
		t = n + 1;
	}
}
function we(e, t, n, r) {
	let i = Math.min(r, e.length - t.length);
	if (i < n) return -1;
	if (i >= e.length - t.length) {
		let r = e.indexOf(t, n);
		return r > i ? -1 : r;
	}
	let a = t.charCodeAt(0), o = t.length;
	for (let r = n; r <= i; r++) {
		if (e.charCodeAt(r) !== a) continue;
		let n = 1;
		for (; n < o && e.charCodeAt(r + n) === t.charCodeAt(n);) n++;
		if (n === o) return r;
	}
	return -1;
}
function Te(e, t, n = e.length) {
	let r = 0;
	for (;;) {
		let i = we(e, t, r, n);
		if (i === -1) return;
		if (Ce(e, i)) return i;
		r = i + 1;
	}
}
function Ee(e, t, n, r = e.length) {
	let i = 0;
	for (;;) {
		let a = we(e, t, i, r);
		if (a === -1) return;
		let o = a, s = 0;
		for (; o > 0 && s <= n;) {
			let t = e.charCodeAt(o - 1);
			if (t === be || t === xe) {
				o--, s++;
				continue;
			}
			break;
		}
		if (s <= n && Ce(e, o)) return o;
		i = a + 1;
	}
}
function De(e, t) {
	let n = e.indexOf("\n", t);
	return n === -1 ? e.length : n;
}
function Oe(e, t, n) {
	for (let r = t; r < n; r++) {
		let t = e.charCodeAt(r);
		if (t !== be && t !== xe && t !== ye) return !1;
	}
	return !0;
}
function ke(e, t, n = e.length) {
	let r = 0;
	for (;;) {
		let i = we(e, t, r, n);
		if (i === -1) return;
		let a = i;
		for (; a > 0 && !Se(e.charCodeAt(a - 1));) a--;
		let o = De(e, i);
		if (Oe(e, a, i) && Oe(e, i + t.length, o)) return a;
		r = i + 1;
	}
}
function Ae(e, t, n, r) {
	return we(e, t, n, r);
}
var C = class {
	maxSize;
	map = /* @__PURE__ */ new Map();
	constructor(e = 50) {
		if (this.maxSize = e, e < 1) throw RangeError(`LRUMap maxSize must be >= 1, got ${e}`);
	}
	get(e) {
		if (!this.map.has(e)) return;
		let t = this.map.get(e);
		return this.map.delete(e), this.map.set(e, t), t;
	}
	set(e, t) {
		if (this.map.has(e)) this.map.delete(e);
		else if (this.map.size >= this.maxSize) {
			let e = this.map.keys().next().value;
			e !== void 0 && this.map.delete(e);
		}
		this.map.set(e, t);
	}
	get size() {
		return this.map.size;
	}
	clear() {
		this.map.clear();
	}
};
function w(e = 50) {
	return new C(e);
}
var T = {
	background: "#ffffff",
	text: "#262626",
	border: "#d9d9d9",
	line: "#333333",
	surface: "#f5f5f5"
}, E = {
	background: "#1f1f1f",
	text: "#ffffff",
	border: "#404040",
	line: "#cccccc",
	surface: "#2d2d2d"
};
function D(e) {
	return e === "dark" ? "dark" : "light";
}
function je(e) {
	return D(e);
}
var Me = [
	`skinparam backgroundColor ${T.background}`,
	`skinparam defaultFontColor ${T.text}`,
	"skinparam shadowing false"
].join("\n"), Ne = [
	`skinparam backgroundColor ${E.background}`,
	`skinparam defaultFontColor ${E.text}`,
	"skinparam shadowing false",
	`skinparam classBackgroundColor ${E.surface}`,
	`skinparam classBorderColor ${E.border}`,
	`skinparam activityBackgroundColor ${E.surface}`,
	`skinparam activityBorderColor ${E.border}`,
	`skinparam noteBackgroundColor ${E.surface}`,
	`skinparam noteBorderColor ${E.border}`,
	`skinparam noteFontColor ${E.text}`,
	`skinparam sequenceParticipantBackgroundColor ${E.surface}`,
	`skinparam sequenceLifeLineBorderColor ${E.border}`,
	`skinparam ArrowColor ${E.line}`
].join("\n");
function Pe(e, t) {
	let n = D(t) === "dark" ? Ne : Me, r = e.trim(), i = !r.includes("@start") || !r.includes("@end") ? `@startuml\n${r}\n@enduml` : r;
	return i.includes(n) ? i : i.replace(/@startuml\r?\n/i, `@startuml\n${n}\n`);
}
function Fe(e) {
	let t = D(e) === "dark";
	return {
		startOnLoad: !1,
		theme: t ? "dark" : "default",
		themeVariables: t ? { darkMode: !0 } : { darkMode: !1 }
	};
}
var Ie = null, O;
function Le() {
	return typeof O == "function" ? O() : O;
}
function Re() {
	return b(Le()?.diagramMessages);
}
async function ze() {
	return Be();
}
function Be() {
	return Ie ||= import("./mermaid.core-DsMCwKuT.js").then((e) => (e.default.initialize(Fe()), e.default)), Ie;
}
function Ve(e, t) {
	return _e(`${e}-${je(t)}`);
}
var He = w(50);
async function Ue(e, n) {
	let r = Ve(e, n), i = He.get(r);
	if (i) return i;
	let a = c(), o = await Be();
	if (!t(a)) throw Error("稿件已关闭");
	o.initialize(Fe(n));
	let l = a ? document.createElement("div") : void 0;
	l && a.portal.appendChild(l);
	let u;
	try {
		u = await s(a, o.render(`mermaid-svg-${r}`, e, l));
	} finally {
		l?.remove();
	}
	if (!t(a)) throw Error("稿件已关闭");
	return He.set(r, u.svg), u.svg;
}
function We(e, n, r, i) {
	if (typeof window > "u") return;
	let a = c();
	Ue(n, i).then((n) => {
		if (!t(a)) return;
		He.set(r, n);
		let i = o(e);
		i && (i.innerHTML = n, i.setAttribute(_, v.ready));
	}).catch((n) => {
		if (!t(a)) return;
		console.error("Failed to render Mermaid:", n);
		let r = o(e);
		if (r) {
			let e = n instanceof Error ? n.message : String(n);
			r.innerHTML = `<div style="color: red; padding: 10px; border: 1px solid red;">${fe(Re().mermaidError, e)}</div>`, r.setAttribute(_, v.error);
		}
	});
}
function Ge(e) {
	O = e;
	let t = "mermaid-diagram";
	return {
		extensions: [{
			name: "mermaid",
			level: "block",
			start(e) {
				return Te(e, "```mermaid", S(e));
			},
			tokenizer(e) {
				let t = /^```mermaid\r?\n([\s\S]*?)\r?\n```/.exec(e);
				if (t) return {
					type: "mermaid",
					raw: t[0],
					text: t[1].trim()
				};
			},
			renderer: g((e) => {
				let n = e.text, r = Le()?.themeMode, i = Ve(n, r), a = He.get(i);
				if (a) return `<!--mermaid-start--><div class="${t}">${a}</div><!--mermaid-end-->`;
				let o = `mermaid-${i}`;
				We(o, n, i, r);
				let s = Re();
				return `<!--mermaid-start--><div id="${o}" class="${t}" ${y(v.loading)}>${s.mermaidLoading}</div><!--mermaid-end-->`;
			})
		}],
		walkTokens(e) {
			le(e) && e.lang === "mermaid" && ue(e, "mermaid");
		}
	};
}
var Ke = {
	bash: f,
	css: ie,
	javascript: m,
	json: d,
	markdown: re,
	plaintext: te,
	python: u,
	shell: p,
	typescript: ne,
	xml: ee
}, qe = "https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/npm/highlightjs/11.11.1", Je = /* @__PURE__ */ new Map();
function Ye(e) {
	return `${qe}/es/languages/${e}.min.js`;
}
async function Xe(e, t) {
	if (t.getLanguage(e)) return;
	if (Je.has(e)) {
		await Je.get(e);
		return;
	}
	let n = (async () => {
		try {
			let n = await import(
				/* webpackIgnore: true */
				/* @vite-ignore */
				Ye(e)
);
			t.registerLanguage(e, n.default);
		} catch (t) {
			throw console.warn(`Failed to load language: ${e}`, t), t;
		} finally {
			Je.delete(e);
		}
	})();
	Je.set(e, n), await n;
}
function Ze(e, t = !1) {
	let n = e;
	return n = n.replace(/(<span[^>]*>[^<]*<\/span>)(\s+)(<span[^>]*>[^<]*<\/span>)/g, (e, t, n, r) => t + r.replace(/^(<span[^>]*>)/, `$1${n}`)), n = n.replace(/(\s+)(<span[^>]*>)/g, (e, t, n) => n.replace(/^(<span[^>]*>)/, `$1${t}`)), n = n.replace(/\t/g, "    "), n = t ? n.replace(/\r\n/g, "<br/>").replace(/\n/g, "<br/>").replace(/(>[^<]+)|(^[^<]+)/g, (e) => e.replace(/\s/g, "&nbsp;")) : n.replace(/(>[^<]+)|(^[^<]+)/g, (e) => e.replace(/\s/g, "&nbsp;")), n;
}
function Qe(e) {
	let t = [], n = "", r = [], i = 0;
	for (; i < e.length;) if (e[i] === "<") {
		let t = "<";
		for (i++; i < e.length && e[i] !== ">";) t += e[i], i++;
		i < e.length && (t += ">", i++), n += t, t.startsWith("</span") ? r.pop() : t.startsWith("<span") && r.push(t);
	} else if (e[i] === "\n") {
		let e = "</span>".repeat(r.length);
		t.push(n + e), n = r.join(""), i++;
	} else n += e[i], i++;
	return t.push(n), t;
}
var $e = new C(128);
function et(e, t, n, r) {
	let i = `${t}\u0000${r ? "1" : "0"}\u0000${e}`, a = $e.get(i);
	if (a !== void 0) return a;
	let o = "";
	if (r) {
		let r = e.replace(/\r\n/g, "\n"), i = n.highlight(r, { language: t }).value, a = Qe(i).map((e) => {
			let t = Ze(e, !1);
			return t === "" ? "&nbsp;" : t;
		});
		o = `
      <section style="display:flex;align-items:flex-start;overflow-x:hidden;overflow-y:auto;width:100%;max-width:100%;padding:0;box-sizing:border-box">
        <section class="line-numbers" style="text-align:right;padding:8px 0;border-right:1px solid rgba(0,0,0,0.04);user-select:none;background:var(--code-bg,transparent);">${a.map((e, t) => `<section style="padding:0 10px 0 0;line-height:1.75">${t + 1}</section>`).join("")}</section>
        <section class="code-scroll" style="flex:1 1 auto;overflow-x:auto;overflow-y:visible;padding:8px;min-width:0;box-sizing:border-box">${`<div style="white-space:pre;min-width:max-content;line-height:1.75">${a.join("<br/>")}</div>`}</section>
      </section>
    `;
	} else {
		let r = n.highlight(e, { language: t }).value;
		o = `<span class="code-block__inner" style="display:block">${Ze(r, !0)}</span>`;
	}
	return $e.set(i, o), o;
}
function tt() {
	$e.clear();
}
function nt(e, t, n) {
	let r = e.getAttribute("data-raw-code"), i = e.getAttribute("data-show-line-number") === "true";
	r && (e.innerHTML = et(r.replace(/&quot;/g, "\""), t, n, i), e.removeAttribute("data-language-pending"), e.removeAttribute("data-raw-code"), e.removeAttribute("data-show-line-number"));
}
function rt(e, t = document) {
	t.querySelectorAll("code[data-language-pending]").forEach((t) => {
		let n = t.getAttribute("data-language-pending");
		n && (e.getLanguage(n) ? nt(t, n, e) : Xe(n, e).then(() => {
			nt(t, n, e);
		}).catch(() => {
			t.removeAttribute("data-language-pending"), t.removeAttribute("data-raw-code"), t.removeAttribute("data-show-line-number");
		}));
	});
}
var it = h;
h.sanitize.bind(h), h.isSupported, h.addHook.bind(h), h.removeHook.bind(h), h.removeHooks.bind(h), h.removeAllHooks.bind(h), h.setConfig.bind(h), h.clearConfig.bind(h), h.isValidAttribute.bind(h), h.version, h.removed;
var at = /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n$]))\1(?=[\s?!.,:？！。，：]|$)/, ot = /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n$]))\1/, st = /^\s{0,3}(\${1,2})[ \t]*\n([\s\S]+?)\n\s{0,3}\1[ \t]*(?:\n|$)/, ct = /^\s{0,3}(\$\$)([^\n]+)\1[ \t]*(?:\n|$)/;
function lt(e) {
	return e.match(st) ?? e.match(ct);
}
var ut = /* @__PURE__ */ new Map();
function dt(e) {
	let t = ut.get(e);
	return t || (t = new RegExp(e.source.replace(/^\^/, ""), `${e.flags.replace(/[gy]/g, "")}y`), ut.set(e, t)), t;
}
function ft(e, t, n) {
	let r = dt(e);
	return r.lastIndex = n, r.test(t);
}
function pt(e) {
	if (!e.includes("$")) return !1;
	let t = 0;
	for (;;) {
		if (ft(st, e, t) || ft(ct, e, t)) return !0;
		let n = e.indexOf("\n", t);
		if (n === -1) return !1;
		t = n + 1;
	}
}
var mt = /^\\\(([^\\]*(?:\\.[^\\]*)*?)\\\)/, ht = /^\\\[([^\\]*(?:\\.[^\\]*)*?)\\\]/, gt = /\\\[[^\\]*(?:\\.[^\\]*)*?\\\]/, _t = /\\\([^\\]*(?:\\.[^\\]*)*?\\\)/, vt = 36;
function yt(e, t, n) {
	if (t <= n) return !1;
	let r = e.charAt(t - 1);
	return /[\d,.]/.test(r) ? !0 : r === " " && t - n >= 2 && /\d/.test(e.charAt(t - 2));
}
function bt(e, t, n, r) {
	return r ? !yt(e, t, n) : t === n || e.charAt(t - 1) === " ";
}
function xt(e, t, n) {
	let r = 0;
	for (; r < e.length;) {
		let i = e.indexOf("$", r);
		if (i === -1) return;
		if (bt(e, i, r, t) && ft(n, e, i)) return i;
		let a = i + 1;
		for (; a < e.length && e.charCodeAt(a) === vt;) a++;
		r = a;
	}
}
function St(e, t = !0) {
	return pt(e) || gt.test(e) || _t.test(e) ? !0 : xt(e, t, t ? ot : at) !== void 0;
}
function Ct(e) {
	return e.replace(/<br\s*\/?>\s*(?=<span class="katex-inline)/gi, "");
}
var wt = /<!--infographic-start-->[\s\S]*?<!--infographic-end-->/g, Tt = /<!--mermaid-start-->[\s\S]*?<!--mermaid-end-->/g, Et = /<span data-md-protected="(\d+)"><\/span>/g;
function Dt(e) {
	e = r(e);
	let t = [];
	return e = e.replace(wt, (e) => (t.push(e), `<span data-md-protected="${t.length - 1}"></span>`)), e = e.replace(Tt, (e) => (t.push(e), `<span data-md-protected="${t.length - 1}"></span>`)), e = it.sanitize(e, {
		ADD_TAGS: ["mp-common-profile"],
		...i() ? { ALLOWED_URI_REGEXP: /^(?:(?:https?|ftp|ftps|mailto|tel|callto|sms|cid|xmpp|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i } : {}
	}), e = e.replace(Et, (e, n) => t[Number(n)]), e;
}
function Ot(e, t) {
	let { markdownContent: n, readingTime: r } = t.parseFrontMatterAndContent(e), i = t.renderMarkdownToHtml(n);
	return i = Ct(i), i = Dt(i), {
		html: i,
		readingTime: r
	};
}
function kt(e, t, n) {
	let r = e;
	return r = n.buildReadingTime(t) + r, r += n.buildFootnotes(), r += n.buildAddition(), r += `
    <style>
      .hljs.code__pre > .mac-sign {
        display: ${n.getOpts().isMacCodeBlock ? "flex" : "none"};
      }
    </style>
  `, r += "\n    <style>\n      h2 strong {\n        color: inherit !important;\n      }\n    </style>\n  ", n.createContainer(r);
}
function At(e, t) {
	let { markdownContent: n, readingTime: r } = t.parseFrontMatterAndContent(e), i = t.renderMarkdownToHtml(n);
	return i = Ct(i), i = Dt(i), kt(i, r, t);
}
var jt = "https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/npm/mathjax@3/es5/tex-svg.js", Mt = "./static/libs/mathjax/tex-svg.js", Nt = "MathJax-script";
function Pt() {
	return typeof window < "u" && window.__MD_UTOOLS__ ? Mt : jt;
}
var Ft = "md:mathjax-ready", k = null, It = !1;
function A() {
	return typeof window < "u" && typeof window.MathJax?.tex2svg == "function";
}
function Lt() {
	return window.MathJax?.startup?.promise ?? Promise.resolve();
}
function Rt() {
	o(Nt)?.remove();
}
function zt() {
	Rt();
	let e = document.createElement("script");
	return e.id = Nt, e.src = Pt(), l(e), e;
}
function Bt() {
	if (typeof window > "u" || A()) return Promise.resolve();
	if (k) return k;
	let e = c(), n = window.MathJax, r;
	return e?.cleanups.add(() => {
		e && (r?.remove(), r && (r.onload = null, r.onerror = null), window.MathJax = n, k = null, It = !1);
	}), k = s(e, new Promise((n, i) => {
		Object.assign(window, { MathJax: {
			tex: { tags: "ams" },
			svg: { fontCache: "none" },
			startup: { typeset: !1 },
			options: { ignoreHtmlClass: "mathjax-ignore" }
		} });
		let a = zt();
		r = a, a.onload = () => {
			t(e) && Lt().then(() => {
				t(e) && n();
			}).catch((e) => {
				Rt(), k = null, i(e);
			});
		}, a.onerror = () => {
			t(e) && (Rt(), k = null, i(/* @__PURE__ */ Error("Failed to load MathJax")));
		};
	})), k;
}
function Vt() {
	let e = c(), n = A();
	return Bt().then(() => {
		!t(e) || typeof window > "u" || n || It || (It = !0, window.dispatchEvent(new CustomEvent(Ft)));
	});
}
function Ht() {
	return {
		async: !1,
		breaks: !1,
		extensions: null,
		gfm: !0,
		hooks: null,
		pedantic: !1,
		renderer: null,
		silent: !1,
		tokenizer: null,
		walkTokens: null
	};
}
var j = Ht();
function Ut(e) {
	j = e;
}
var M = { exec: () => null };
function N(e) {
	let t = [];
	return (n) => {
		let r = Math.max(0, Math.min(3, n - 1)), i = t[r];
		return i || (i = e(r), t[r] = i), i;
	};
}
function P(e, t = "") {
	let n = typeof e == "string" ? e : e.source, r = {
		replace: (e, t) => {
			let i = typeof t == "string" ? t : t.source;
			return i = i.replace(F.caret, "$1"), n = n.replace(e, i), r;
		},
		getRegex: () => new RegExp(n, t)
	};
	return r;
}
var Wt = ((e = "") => {
	try {
		return !!RegExp("(?<=1)(?<!1)" + e);
	} catch {
		return !1;
	}
})(), F = {
	codeRemoveIndent: /^(?: {0,3}\t| {1,4})/gm,
	outputLinkReplace: /\\([\[\]])/g,
	indentCodeCompensation: /^(\s+)(?:```)/,
	beginningSpace: /^\s+/,
	endingHash: /#$/,
	startingSpaceChar: /^ /,
	endingSpaceChar: / $/,
	endingSpaceTabChar: /[ \t]$/,
	nonSpaceChar: /[^ ]/,
	newLineCharGlobal: /\n/g,
	tabCharGlobal: /\t/g,
	leadingSpaceTab: /^[ \t]+/,
	multipleSpaceGlobal: /\s+/g,
	blankLine: /^[ \t]*$/,
	doubleBlankLine: /\n[ \t]*\n[ \t]*$/,
	blockquoteStart: /^ {0,3}>/,
	blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g,
	blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm,
	listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g,
	listIsTask: /^\[[ xX]\] +\S/,
	listReplaceTask: /^\[[ xX]\] +/,
	listTaskCheckbox: /\[[ xX]\]/,
	anyLine: /\n.*\n/,
	hrefBrackets: /^<(.*)>$/,
	tableDelimiter: /[:|]/,
	tableAlignChars: /^\||\| *$/g,
	tableRowBlankLine: /\n[ \t]*$/,
	tableAlignRight: /^ *-+: *$/,
	tableAlignCenter: /^ *:-+: *$/,
	tableAlignLeft: /^ *:-+ *$/,
	startATag: /^<a /i,
	endATag: /^<\/a>/i,
	startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i,
	endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i,
	startAngleBracket: /^</,
	endAngleBracket: />$/,
	pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/,
	unicodeAlphaNumeric: /[\p{L}\p{N}]/u,
	numericCharacterReference: /&#(?:(\d{1,7})|[Xx]([A-Fa-f0-9]{1,6}));/g,
	escapeTest: /[&<>"']/,
	escapeReplace: /[&<>"']/g,
	escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,
	escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,
	caret: /(^|[^\[])\^/g,
	percentDecode: /%25/g,
	findPipe: /\|/g,
	splitPipe: / \|/,
	slashPipe: /\\\|/g,
	carriageReturn: /\r\n|\r/g,
	spaceLine: /^ +$/gm,
	notSpaceStart: /^\S*/,
	endingNewline: /\n$/,
	listItemRegex: (e) => RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),
	nextBulletRegex: N((e) => RegExp(`^ {0,${e}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`)),
	hrRegex: N((e) => RegExp(`^ {0,${e}}((?:-[ 	]*){3,}|(?:_[ 	]*){3,}|(?:\\*[ 	]*){3,})(?:\\n+|$)`)),
	fencesBeginRegex: N((e) => RegExp(`^ {0,${e}}(?:\`\`\`|~~~)`)),
	headingBeginRegex: N((e) => RegExp(`^ {0,${e}}#`)),
	htmlBeginRegex: N((e) => RegExp(`^ {0,${e}}(?:</?(?:${L})(?: +|$|/?>)|<(?:script|pre|style|textarea|!--))`, "i")),
	blockquoteBeginRegex: N((e) => RegExp(`^ {0,${e}}>`))
}, Gt = /^(?:[ \t]*(?:\n|$))+/, Kt = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/, qt = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/, I = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/, Jt = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/, Yt = / {0,3}(?:[*+-]|\d{1,9}[.)])/, Xt = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |fences|blockquote|heading|hr|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/, Zt = P(Xt).replace(/bull/g, Yt).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}(?:\s|$)/).replace(/hr/g, / {0,3}(?:(?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex(), Qt = P(Xt).replace(/bull/g, Yt).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}(?:\s|$)/).replace(/hr/g, / {0,3}(?:(?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(), $t = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table|[ \t]+\n)[^\n]+)*)/, en = /^[^\n]+/, tn = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/, nn = P(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", tn).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(), rn = P(/^(bull)([ \t][^\n]*?)?(?:\n|$)/).replace(/bull/g, Yt).getRegex(), L = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul", an = /<!--(?:-?>|[\s\S]*?(?:-->|$))/, on = P("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n*|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>[^\\n]*\\n*|$)|<![A-Z][\\s\\S]*?(?:>[^\\n]*\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>[^\\n]*\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][a-z0-9-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][a-z0-9-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))", "i").replace("comment", an).replace("tag", L).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(), sn = (e) => P($t).replace("hr", I).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)").replace("list", e).replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", L).getRegex(), cn = sn(/ {0,3}(?:[*+-]|1[.)])[ \t]+[^ \t\n]/), ln = sn(/ {0,3}(?:[*+-]|\d{1,9}[.)])(?:[ \t]|\n|$)/), un = {
	blockquote: P(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", ln).getRegex(),
	code: Kt,
	def: nn,
	fences: qt,
	heading: Jt,
	hr: I,
	html: on,
	lheading: Zt,
	list: rn,
	newline: Gt,
	paragraph: cn,
	table: M,
	text: en
}, dn = P("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", I).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", L).getRegex(), fn = {
	...un,
	lheading: Qt,
	table: dn,
	paragraph: P($t).replace("hr", I).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", dn).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]+[^ \\t\\n]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", L).getRegex()
}, pn = {
	...un,
	html: P("^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:\"[^\"]*\"|'[^']*'|\\s[^'\"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))").replace("comment", an).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),
	def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,
	heading: /^(#{1,6})(.*)(?:\n+|$)/,
	fences: M,
	lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,
	paragraph: P($t).replace("hr", I).replace("heading", " *#{1,6} *[^\n]").replace("lheading", Zt).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex()
}, mn = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/, hn = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/, gn = /^( {2,}|\\)\n(?!\s*$)[ \t]*/, _n = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/, R = /[\p{P}\p{S}]/u, z = /[\s\p{P}\p{S}]/u, B = /[^\s\p{P}\p{S}]/u, vn = P(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, z).getRegex(), yn = /[\p{Pi}\p{Ps}"']/u, bn = /(?!~)[\p{P}\p{S}]/u, xn = /(?!~)[\s\p{P}\p{S}]/u, Sn = /(?:[^\s\p{P}\p{S}]|~)/u, Cn = P(/link|precode-code|html/, "g").replace("link", /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace("precode-", Wt ? "(?<!`)()" : "(^^|[^`])").replace("code", /(?<b>`+)[^`]+\k<b>(?!`)/).replace("html", /<(?! )[^<>]*?>/).getRegex(), wn = /^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/, Tn = P(wn, "u").replace(/punct/g, R).getRegex(), En = P(wn, "u").replace(/punct/g, bn).getRegex(), Dn = P(/^(?:\*+(?:((?!\*)(?!openQuote)punct)|([^\s*]))?)|^_+(?:((?!_)(?!openQuote)punct)|([^\s_]))?/, "u").replace(/openQuote/g, yn).replace(/punct/g, R).getRegex(), On = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)", kn = P(On, "gu").replace(/notPunctSpace/g, B).replace(/punctSpace/g, z).replace(/punct/g, R).getRegex(), An = P(On, "gu").replace(/notPunctSpace/g, Sn).replace(/punctSpace/g, xn).replace(/punct/g, bn).getRegex(), jn = P("^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)[\\s](\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|(?:(?!\\*)punct|notPunctSpace)(\\*+)(?!\\*)(?=notPunctSpace)", "gu").replace(/notPunctSpace/g, B).replace(/punctSpace/g, z).replace(/punct/g, R).getRegex(), Mn = P("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)", "gu").replace(/notPunctSpace/g, B).replace(/punctSpace/g, z).replace(/punct/g, R).getRegex(), Nn = P("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)[\\s](_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)|(?:(?!_)punct|notPunctSpace)(_+)(?!_)(?=notPunctSpace)", "gu").replace(/notPunctSpace/g, B).replace(/punctSpace/g, z).replace(/punct/g, R).getRegex(), Pn = P(/^~~?(?:((?!~)punct)|[^\s~])/, "u").replace(/punct/g, R).getRegex(), Fn = P("^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)", "gu").replace(/notPunctSpace/g, B).replace(/punctSpace/g, z).replace(/punct/g, R).getRegex(), In = P(/\\(punct)/, "gu").replace(/punct/g, R).getRegex(), Ln = P(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(), Rn = P(an).replace("(?:-->|$)", "-->").getRegex(), zn = P("^comment|^</[a-zA-Z][a-zA-Z0-9-]*\\s*>|^<[a-zA-Z][a-zA-Z0-9-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", Rn).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(), Bn = /\[(?:\\[\s\S]|[^\[\]\\])*\]/, Vn = P(/(?:\[(?:brackets|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/).replace("brackets", Bn).getRegex(), Hn = P(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?\s*\)/).replace("label", Vn).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]+|(?=\))/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(), Un = P(/^!?\[(label)\]\[(ref)\]/).replace("label", Vn).replace("ref", tn).getRegex(), Wn = P(/^!?\[(ref)\](?:\[\])?/).replace("ref", tn).getRegex(), Gn = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\]){1,999}/, Kn = P(/(?:[^\[\]\\`]*(?:\[(?:brackets|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\]))){0,999}?[^\[\]\\`]*?/).replace("brackets", Bn).getRegex(), qn = P("reflink|nolink(?!\\()", "g").replace("reflink", P(/^!?\[(label)\]\[(ref)\]/).replace("label", Kn).replace("ref", Gn).getRegex()).replace("nolink", P(/^!?\[(ref)\](?:\[\])?/).replace("ref", Gn).getRegex()).getRegex(), Jn = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/, Yn = P(/(?:mailto:email|xmpp:email(?:\/[A-Za-z0-9@.]+)?)/).replace(/email/g, /[A-Za-z0-9._+-]+@[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/).getRegex(), Xn = {
	_backpedal: M,
	anyPunctuation: In,
	autolink: Ln,
	blockSkip: Cn,
	br: gn,
	code: hn,
	del: M,
	delLDelim: M,
	delRDelim: M,
	emStrongLDelim: Tn,
	emStrongRDelimAst: kn,
	emStrongRDelimUnd: Mn,
	escape: mn,
	link: Hn,
	nolink: Wn,
	punctuation: vn,
	reflink: Un,
	reflinkSearch: qn,
	tag: zn,
	text: _n,
	url: M
}, Zn = {
	...Xn,
	emStrongLDelim: Dn,
	emStrongRDelimAst: jn,
	emStrongRDelimUnd: Nn,
	link: P(/^!?\[(label)\]\((.*?)\)/).replace("label", Vn).getRegex(),
	reflink: P(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", Vn).getRegex()
}, Qn = {
	...Xn,
	emStrongRDelimAst: An,
	emStrongLDelim: En,
	delLDelim: Pn,
	delRDelim: Fn,
	url: P(/^emailProtocol|^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace("emailProtocol", Yn).replace("protocol", Jn).replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/).getRegex(),
	_backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,
	del: /^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/,
	text: P(/^(?:[^a-zA-Z0-9](?=emailProtocol)|(`+|~+|[^`~])(?:(?=[`~])|(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9](?=emailProtocol)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@))))/).replace("protocol", Jn).replace(/emailProtocol/g, /(?:mailto|xmpp):/).getRegex()
}, $n = {
	...Qn,
	br: P(gn).replace("{2,}", "*").getRegex(),
	text: P(Qn.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex()
}, er = {
	normal: un,
	gfm: fn,
	pedantic: pn
}, V = {
	normal: Xn,
	gfm: Qn,
	breaks: $n,
	pedantic: Zn
}, tr = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&#39;"
}, nr = (e) => tr[e];
function H(e, t) {
	if (t) {
		if (F.escapeTest.test(e)) return e.replace(F.escapeReplace, nr);
	} else if (F.escapeTestNoEncode.test(e)) return e.replace(F.escapeReplaceNoEncode, nr);
	return e;
}
function rr(e) {
	return e.replace(F.numericCharacterReference, (e, t, n) => {
		let r = t === void 0 ? Number.parseInt(n, 16) : Number.parseInt(t, 10);
		return r === 0 || r > 1114111 || r >= 55296 && r <= 57343 ? "�" : String.fromCodePoint(r);
	});
}
function ir(e) {
	try {
		e = encodeURI(e).replace(F.percentDecode, "%");
	} catch {
		return null;
	}
	return e;
}
function ar(e, t) {
	let n = e.replace(F.findPipe, (e, t, n) => {
		let r = !1, i = t;
		for (; --i >= 0 && n[i] === "\\";) r = !r;
		return r ? "|" : " |";
	}).split(F.splitPipe), r = 0;
	if (n[0].trim() || n.shift(), n.length > 0 && !n.at(-1)?.trim() && n.pop(), t) {
		if (n.length > t) n.splice(t);
		else for (; n.length < t;) n.push("");
	}
	for (; r < n.length; r++) n[r] = n[r].trim().replace(F.slashPipe, "|");
	return n;
}
function U(e, t, n) {
	let r = e.length;
	if (r === 0) return "";
	let i = 0;
	for (; i < r;) {
		let a = e.charAt(r - i - 1);
		if (a === t && !n) i++;
		else if (a !== t && n) i++;
		else break;
	}
	return e.slice(0, r - i);
}
function or(e) {
	let t = e.split("\n"), n = t.length - 1;
	for (; n >= 0 && F.blankLine.test(t[n]);) n--;
	return t.length - n <= 2 ? e : t.slice(0, n + 1).join("\n");
}
function sr(e) {
	return e.trim().toLowerCase().toUpperCase().toLowerCase();
}
function cr(e, t) {
	if (e.indexOf(t[1]) === -1) return -1;
	let n = 0;
	for (let r = 0; r < e.length; r++) if (e[r] === "\\") r++;
	else if (e[r] === t[0]) n++;
	else if (e[r] === t[1] && (n--, n < 0)) return r;
	return n > 0 ? -2 : -1;
}
function lr(e, t = 0) {
	let n = t, r = "";
	for (let t of e) if (t === "	") {
		let e = 4 - n % 4;
		r += " ".repeat(e), n += e;
	} else r += t, n++;
	return r;
}
function ur(e, t, n, r, i) {
	let a = t.href, o = t.title || null, s = e[1].replace(i.other.outputLinkReplace, "$1"), c = e[0].charAt(0) === "!";
	r.state.inLink = !0;
	let l = r.state.linkEmitted, u = r.state.inRawBlock;
	r.state.linkEmitted = !1;
	let d = r.inlineTokens(s), f = r.state.linkEmitted;
	if (r.state.linkEmitted = l, r.state.inLink = !1, !c) {
		if (f) {
			r.state.inRawBlock = u;
			return;
		}
		r.state.linkEmitted = !0;
	}
	return {
		type: c ? "image" : "link",
		raw: n,
		href: a,
		title: o,
		text: s,
		tokens: d
	};
}
function dr(e, t, n) {
	let r = e.match(n.other.indentCodeCompensation);
	if (r === null) return t;
	let i = r[1];
	return t.split("\n").map((e) => {
		let t = e.match(n.other.beginningSpace);
		if (t === null) return e;
		let [r] = t;
		return e.slice(Math.min(r.length, i.length));
	}).join("\n");
}
function fr(e, t, n, r) {
	if (!t.includes("<")) return !1;
	for (let i = 0; i < t.length; i++) {
		if (t[i] === "\\") {
			i++;
			continue;
		}
		if (t[i] === "`") {
			let e = r.inline.code.exec(t.slice(i));
			if (e) {
				i += e[0].length - 1;
				continue;
			}
		}
		if (t[i] !== "<") continue;
		let a = e.slice(n + i), o = r.inline.tag.exec(a) || r.inline.autolink.exec(a);
		if (o) {
			if (o[0].length > t.length - i) return !0;
			i += o[0].length - 1;
		}
	}
	return !1;
}
var pr = class {
	options;
	rules;
	lexer;
	constructor(e) {
		this.options = e || j;
	}
	space(e) {
		let t = this.rules.block.newline.exec(e);
		if (t && t[0].length > 0) return {
			type: "space",
			raw: t[0]
		};
	}
	code(e) {
		let t = this.rules.block.code.exec(e);
		if (t) {
			let e = this.options.pedantic ? t[0] : or(t[0]);
			return {
				type: "code",
				raw: e,
				codeBlockStyle: "indented",
				text: e.replace(this.rules.other.codeRemoveIndent, "")
			};
		}
	}
	fences(e) {
		let t = this.rules.block.fences.exec(e);
		if (t) {
			let e = t[0], n = dr(e, t[3] || "", this.rules);
			return {
				type: "code",
				raw: e,
				lang: t[2] ? t[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : t[2],
				text: n
			};
		}
	}
	heading(e) {
		let t = this.rules.block.heading.exec(e);
		if (t) {
			let e = t[2].trim();
			if (this.rules.other.endingHash.test(e)) {
				let t = U(e, "#");
				(this.options.pedantic || !t || this.rules.other.endingSpaceTabChar.test(t)) && (e = t.trim());
			}
			return {
				type: "heading",
				raw: U(t[0], "\n"),
				depth: t[1].length,
				text: e,
				tokens: this.lexer.inline(e)
			};
		}
	}
	hr(e) {
		let t = this.rules.block.hr.exec(e);
		if (t) return {
			type: "hr",
			raw: U(t[0], "\n")
		};
	}
	blockquote(e) {
		let t = this.rules.block.blockquote.exec(e);
		if (t) {
			let e = U(t[0], "\n").split("\n"), n = "", r = "", i = [];
			for (; e.length > 0;) {
				let t = !1, a = [], o = 0;
				for (; o < e.length; o++) if (this.rules.other.blockquoteStart.test(e[o])) a.push(e[o]), t = !0;
				else if (!t) a.push(e[o]);
				else break;
				e = e.slice(o);
				let s = a.join("\n"), c = s.replace(this.rules.other.blockquoteSetextReplace, "\n    $1").replace(this.rules.other.blockquoteSetextReplace2, "");
				n = n ? `${n}
${s}` : s, r = r ? `${r}
${c}` : c;
				let l = this.lexer.state.top;
				if (this.lexer.state.top = !0, this.lexer.blockTokens(c, i, !0), this.lexer.state.top = l, e.length === 0) break;
				let u = i.at(-1);
				if (u?.type === "code") break;
				if (u?.type === "blockquote") {
					let t = u, a = e.join("\n"), o = t.raw + "\n" + a.replace(this.rules.other.blockquoteSetextReplace2, ""), s = this.blockquote(o);
					i[i.length - 1] = s;
					let c = o.substring(s.raw.length).replace(/^\n/, ""), l = c ? c.split("\n").length : 0, d = l ? e.slice(0, -l) : e;
					d.length > 0 && (n = `${n}
${d.join("\n")}`), r = r.substring(0, r.length - t.text.length) + s.text;
					break;
				}
				if (u?.type === "list") {
					let t = u, a = t.raw + "\n" + e.join("\n"), o = this.list(a);
					i[i.length - 1] = o, n = n.substring(0, n.length - u.raw.length) + o.raw, r = r.substring(0, r.length - t.raw.length) + o.raw, e = a.substring(i.at(-1).raw.length).split("\n");
					continue;
				}
			}
			return {
				type: "blockquote",
				raw: n,
				tokens: i,
				text: r
			};
		}
	}
	list(e) {
		let t = this.rules.block.list.exec(e);
		if (t) {
			let n = t[1].trim(), r = n.length > 1, i = {
				type: "list",
				raw: "",
				ordered: r,
				start: r ? +n.slice(0, -1) : "",
				loose: !1,
				items: []
			};
			n = r ? `\\d{1,9}\\${n.slice(-1)}` : `\\${n}`, this.options.pedantic && (n = r ? n : "[*+-]");
			let a = this.rules.other.listItemRegex(n), o = !1;
			for (; e;) {
				let n = !1, r = "", s = "";
				if (!(t = a.exec(e)) || this.rules.block.hr.test(e)) break;
				r = t[0], e = e.substring(r.length);
				let c = t[2].split("\n", 1)[0], l = t[1].length, u = this.options.pedantic ? lr(c, l) : c.replace(this.rules.other.leadingSpaceTab, (e) => lr(e, l)), d = e.split("\n", 1)[0], f = !u.trim(), p = 0;
				if (this.options.pedantic ? (p = 2, s = u.trimStart()) : f ? p = l + 1 : (p = u.search(this.rules.other.nonSpaceChar), p = p > 4 ? 1 : p, s = u.slice(p), p += l), f && this.rules.other.blankLine.test(d) && (r += d + "\n", e = e.substring(d.length + 1), n = !0), !n) {
					let t = this.rules.other.nextBulletRegex(p), n = this.rules.other.hrRegex(p), i = this.rules.other.fencesBeginRegex(p), a = this.rules.other.headingBeginRegex(p), o = this.rules.other.htmlBeginRegex(p), c = this.rules.other.blockquoteBeginRegex(p);
					for (; e;) {
						let l = e.split("\n", 1)[0], m;
						if (d = l, this.options.pedantic ? (d = d.replace(this.rules.other.listReplaceNesting, "  "), m = d) : m = d.replace(this.rules.other.leadingSpaceTab, (e) => e.replace(this.rules.other.tabCharGlobal, "    ")), i.test(d) || a.test(d) || o.test(d) || c.test(d) || t.test(d) || n.test(d)) break;
						if (m.search(this.rules.other.nonSpaceChar) >= p || !d.trim()) s += "\n" + m.slice(p);
						else {
							if (f || u.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4 || i.test(u) || a.test(u) || n.test(u)) break;
							s += "\n" + d;
						}
						f = !d.trim(), r += l + "\n", e = e.substring(l.length + 1), u = m.slice(p);
					}
				}
				i.loose || (o ? i.loose = !0 : this.rules.other.doubleBlankLine.test(r) && (o = !0)), i.items.push({
					type: "list_item",
					raw: r,
					task: !!this.options.gfm && this.rules.other.listIsTask.test(s),
					loose: !1,
					text: s,
					tokens: []
				}), i.raw += r;
			}
			let s = i.items.at(-1);
			if (s) s.raw = s.raw.trimEnd(), s.text = s.text.trimEnd();
			else return;
			i.raw = i.raw.trimEnd();
			for (let e of i.items) if (this.lexer.state.top = !1, e.tokens = this.lexer.blockTokens(e.text, []), !i.loose) {
				let t = e.tokens.filter((e) => e.type === "space");
				i.loose = t.length > 0 && t.some((e) => this.rules.other.anyLine.test(e.raw));
			}
			for (let e of i.items) {
				let t = e.tokens[0];
				if (e.task && (t?.type === "text" || t?.type === "paragraph")) {
					e.text = e.text.replace(this.rules.other.listReplaceTask, ""), t.raw = t.raw.replace(this.rules.other.listReplaceTask, ""), t.text = t.text.replace(this.rules.other.listReplaceTask, "");
					for (let e = this.lexer.inlineQueue.length - 1; e >= 0; e--) if (this.rules.other.listIsTask.test(this.lexer.inlineQueue[e].src)) {
						this.lexer.inlineQueue[e].src = this.lexer.inlineQueue[e].src.replace(this.rules.other.listReplaceTask, "");
						break;
					}
					let n = this.rules.other.listTaskCheckbox.exec(e.raw);
					if (n) {
						let t = {
							type: "checkbox",
							raw: n[0] + " ",
							checked: n[0] !== "[ ]"
						};
						e.checked = t.checked, i.loose ? e.tokens[0] && ["paragraph", "text"].includes(e.tokens[0].type) && "tokens" in e.tokens[0] && e.tokens[0].tokens ? (e.tokens[0].raw = t.raw + e.tokens[0].raw, e.tokens[0].text = t.raw + e.tokens[0].text, e.tokens[0].tokens.unshift(t)) : e.tokens.unshift({
							type: "paragraph",
							raw: t.raw,
							text: t.raw,
							tokens: [t]
						}) : e.tokens.unshift(t);
					}
				} else e.task &&= !1;
			}
			if (i.loose) for (let e of i.items) {
				e.loose = !0;
				for (let t of e.tokens) t.type === "text" && (t.type = "paragraph");
			}
			return i;
		}
	}
	html(e) {
		let t = this.rules.block.html.exec(e);
		if (t) {
			let e = or(t[0]);
			return {
				type: "html",
				block: !0,
				raw: e,
				pre: t[1] === "pre" || t[1] === "script" || t[1] === "style",
				text: e
			};
		}
	}
	def(e) {
		let t = this.rules.block.def.exec(e);
		if (t) {
			let e = sr(t[1]).replace(this.rules.other.multipleSpaceGlobal, " "), n = t[2] ? t[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "", r = t[3] ? t[3].substring(1, t[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : t[3];
			return {
				type: "def",
				tag: e,
				raw: U(t[0], "\n"),
				href: n,
				title: r
			};
		}
	}
	table(e) {
		let t = this.rules.block.table.exec(e);
		if (!t || !this.rules.other.tableDelimiter.test(t[2])) return;
		let n = ar(t[1]), r = t[2].replace(this.rules.other.tableAlignChars, "").split("|"), i = t[3]?.trim() ? t[3].replace(this.rules.other.tableRowBlankLine, "").split("\n") : [], a = {
			type: "table",
			raw: U(t[0], "\n"),
			header: [],
			align: [],
			rows: []
		};
		if (n.length === r.length) {
			for (let e of r) this.rules.other.tableAlignRight.test(e) ? a.align.push("right") : this.rules.other.tableAlignCenter.test(e) ? a.align.push("center") : this.rules.other.tableAlignLeft.test(e) ? a.align.push("left") : a.align.push(null);
			for (let e = 0; e < n.length; e++) a.header.push({
				text: n[e],
				tokens: this.lexer.inline(n[e]),
				header: !0,
				align: a.align[e]
			});
			for (let e of i) a.rows.push(ar(e, a.header.length).map((e, t) => ({
				text: e,
				tokens: this.lexer.inline(e),
				header: !1,
				align: a.align[t]
			})));
			return a;
		}
	}
	lheading(e) {
		let t = this.rules.block.lheading.exec(e);
		if (t) {
			let e = t[1].trim();
			return {
				type: "heading",
				raw: U(t[0], "\n"),
				depth: t[2].charAt(0) === "=" ? 1 : 2,
				text: e,
				tokens: this.lexer.inline(e)
			};
		}
	}
	paragraph(e) {
		let t = this.rules.block.paragraph.exec(e);
		if (t) {
			let e = t[1].charAt(t[1].length - 1) === "\n" ? t[1].slice(0, -1) : t[1];
			return {
				type: "paragraph",
				raw: t[0],
				text: e,
				tokens: this.lexer.inline(e)
			};
		}
	}
	text(e) {
		let t = this.rules.block.text.exec(e);
		if (t) return {
			type: "text",
			raw: t[0],
			text: t[0],
			tokens: this.lexer.inline(t[0])
		};
	}
	escape(e) {
		let t = this.rules.inline.escape.exec(e);
		if (t) return {
			type: "escape",
			raw: t[0],
			text: t[1]
		};
	}
	tag(e) {
		let t = this.rules.inline.tag.exec(e);
		if (t) return !this.lexer.state.inLink && this.rules.other.startATag.test(t[0]) ? this.lexer.state.inLink = !0 : this.lexer.state.inLink && this.rules.other.endATag.test(t[0]) && (this.lexer.state.inLink = !1), !this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(t[0]) ? this.lexer.state.inRawBlock = !0 : this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(t[0]) && (this.lexer.state.inRawBlock = !1), {
			type: "html",
			raw: t[0],
			inLink: this.lexer.state.inLink,
			inRawBlock: this.lexer.state.inRawBlock,
			block: !1,
			text: t[0]
		};
	}
	link(e) {
		let t = this.rules.inline.link.exec(e);
		if (t) {
			let n = t[0].charAt(0) === "!" ? 2 : 1;
			if (!this.options.pedantic && fr(e, t[1], n, this.rules)) return;
			let r = t[2].trim();
			if (!this.options.pedantic && this.rules.other.startAngleBracket.test(r)) {
				if (!this.rules.other.endAngleBracket.test(r)) return;
				let e = U(r.slice(0, -1), "\\");
				if ((r.length - e.length) % 2 == 0) return;
			} else {
				let e = cr(t[2], "()");
				if (e === -2) return;
				if (e > -1) {
					let n = (t[0].indexOf("!") === 0 ? 5 : 4) + t[1].length + e;
					t[2] = t[2].substring(0, e), t[0] = t[0].substring(0, n).trim(), t[3] = "";
				}
			}
			let i = t[2], a = "";
			if (this.options.pedantic) {
				let e = this.rules.other.pedanticHrefTitle.exec(i);
				e && (i = e[1], a = e[3]);
			} else a = t[3] ? t[3].slice(1, -1) : "";
			return i = i.trim(), this.rules.other.startAngleBracket.test(i) && (i = this.options.pedantic && !this.rules.other.endAngleBracket.test(r) ? i.slice(1) : i.slice(1, -1)), ur(t, {
				href: i && i.replace(this.rules.inline.anyPunctuation, "$1"),
				title: a && a.replace(this.rules.inline.anyPunctuation, "$1")
			}, t[0], this.lexer, this.rules);
		}
	}
	reflink(e, t) {
		let n;
		if ((n = this.rules.inline.reflink.exec(e)) || (n = this.rules.inline.nolink.exec(e))) {
			let r = n[0].charAt(0) === "!" ? 2 : 1;
			if (!this.options.pedantic && fr(e, n[1], r, this.rules)) return;
			let i = t[sr((n[2] || n[1]).replace(this.rules.other.multipleSpaceGlobal, " "))];
			if (!i) {
				let e = n[0].charAt(0);
				return {
					type: "text",
					raw: e,
					text: e
				};
			}
			return ur(n, i, n[0], this.lexer, this.rules);
		}
	}
	emStrong(e, t, n = "") {
		let r = this.rules.inline.emStrongLDelim.exec(e);
		if (!(!r || !r[1] && !r[2] && !r[3] && !r[4] || r[4] && n.match(this.rules.other.unicodeAlphaNumeric)) && (!(r[1] || r[3]) || !n || this.rules.inline.punctuation.exec(n))) {
			let i = [...r[0]].length - 1, a, o, s = i, c = 0, l = r[0][0], u = n === l, d = l === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
			for (d.lastIndex = 0, t = t.slice(-1 * e.length + i); (r = d.exec(t)) !== null;) {
				if (a = r[1] || r[2] || r[3] || r[4] || r[5] || r[6], !a) continue;
				if (o = [...a].length, r[3] || r[4]) {
					s += o;
					continue;
				}
				if (r[5] || r[6]) {
					if (i % 3 && !((i + o) % 3)) {
						c += o;
						continue;
					}
					if (u) break;
				}
				if (s -= o, s > 0) continue;
				o = Math.min(o, o + s + c);
				let t = [...r[0]][0].length, n = e.slice(0, i + r.index + t + o);
				if (Math.min(i, o) % 2) {
					let e = n.slice(1, -1);
					return {
						type: "em",
						raw: n,
						text: e,
						tokens: this.lexer.inlineTokens(e)
					};
				}
				let l = n.slice(2, -2);
				return {
					type: "strong",
					raw: n,
					text: l,
					tokens: this.lexer.inlineTokens(l)
				};
			}
		}
	}
	codespan(e) {
		let t = this.rules.inline.code.exec(e);
		if (t) {
			let e = t[2].replace(this.rules.other.newLineCharGlobal, " "), n = this.rules.other.nonSpaceChar.test(e), r = this.rules.other.startingSpaceChar.test(e) && this.rules.other.endingSpaceChar.test(e);
			return n && r && (e = e.substring(1, e.length - 1)), {
				type: "codespan",
				raw: t[0],
				text: e
			};
		}
	}
	br(e) {
		let t = this.rules.inline.br.exec(e);
		if (t) return {
			type: "br",
			raw: t[0]
		};
	}
	del(e, t, n = "") {
		let r = this.rules.inline.delLDelim.exec(e);
		if (r && (!r[1] || !n || this.rules.inline.punctuation.exec(n))) {
			let n = [...r[0]].length - 1, i, a, o = n, s = this.rules.inline.delRDelim;
			for (s.lastIndex = 0, t = t.slice(-1 * e.length + n); (r = s.exec(t)) !== null;) {
				if (i = r[1] || r[2] || r[3] || r[4] || r[5] || r[6], !i || (a = [...i].length, a !== n)) continue;
				if (r[3] || r[4]) {
					o += a;
					continue;
				}
				if (o -= a, o > 0) continue;
				a = Math.min(a, a + o);
				let t = [...r[0]][0].length, s = e.slice(0, n + r.index + t + a), c = s.slice(n, -n);
				return {
					type: "del",
					raw: s,
					text: c,
					tokens: this.lexer.inlineTokens(c)
				};
			}
		}
	}
	autolink(e) {
		let t = this.rules.inline.autolink.exec(e);
		if (t) {
			let e, n;
			return t[2] === "@" ? (e = t[1], n = "mailto:" + e) : (e = t[1], n = e), {
				type: "link",
				raw: t[0],
				text: e,
				href: n,
				autolink: !0,
				tokens: [{
					type: "text",
					raw: e,
					text: e
				}]
			};
		}
	}
	url(e) {
		let t;
		if (t = this.rules.inline.url.exec(e)) {
			let e, n;
			if (t[2] === "@") e = t[0], n = "mailto:" + e;
			else {
				let r;
				do
					r = t[0], t[0] = this.rules.inline._backpedal.exec(t[0])?.[0] ?? "";
				while (r !== t[0]);
				e = t[0], n = t[1] === "www." ? "http://" + t[0] : t[0];
			}
			return {
				type: "link",
				raw: t[0],
				text: e,
				href: n,
				autolink: !0,
				tokens: [{
					type: "text",
					raw: e,
					text: e
				}]
			};
		}
	}
	inlineText(e) {
		let t = this.rules.inline.text.exec(e);
		if (t) {
			let e = this.lexer.state.inRawBlock;
			return {
				type: "text",
				raw: t[0],
				text: e ? t[0] : rr(t[0]),
				escaped: e
			};
		}
	}
}, W = class e {
	tokens;
	options;
	state;
	inlineQueue;
	tokenizer;
	constructor(e) {
		this.tokens = [], this.tokens.links = Object.create(null), this.options = e || j, this.options.tokenizer = this.options.tokenizer || new pr(), this.tokenizer = this.options.tokenizer, this.tokenizer.options = this.options, this.tokenizer.lexer = this, this.inlineQueue = [], this.state = {
			inLink: !1,
			inRawBlock: !1,
			linkEmitted: !1,
			top: !0
		};
		let t = {
			other: F,
			block: er.normal,
			inline: V.normal
		};
		this.options.pedantic ? (t.block = er.pedantic, t.inline = V.pedantic) : this.options.gfm && (t.block = er.gfm, t.inline = this.options.breaks ? V.breaks : V.gfm), this.tokenizer.rules = t;
	}
	static get rules() {
		return {
			block: er,
			inline: V
		};
	}
	static lex(t, n) {
		return new e(n).lex(t);
	}
	static lexInline(t, n) {
		return new e(n).inlineTokens(t);
	}
	lex(e) {
		e = e.replace(F.carriageReturn, "\n"), this.blockTokens(e, this.tokens);
		for (let e = 0; e < this.inlineQueue.length; e++) {
			let t = this.inlineQueue[e];
			this.inlineTokens(t.src, t.tokens);
		}
		return this.inlineQueue = [], this.tokens;
	}
	blockTokens(e, t = [], n = !1) {
		this.tokenizer.lexer = this, this.options.pedantic && (e = e.replace(F.tabCharGlobal, "    ").replace(F.spaceLine, ""));
		let r = 1 / 0;
		for (; e;) {
			if (e.length < r) r = e.length;
			else {
				this.infiniteLoopError(e.charCodeAt(0));
				break;
			}
			let i;
			if (this.options.extensions?.block?.some((n) => (i = n.call({ lexer: this }, e, t)) ? (e = e.substring(i.raw.length), t.push(i), !0) : !1)) continue;
			if (i = this.tokenizer.space(e)) {
				e = e.substring(i.raw.length);
				let n = t.at(-1);
				i.raw.length === 1 && n !== void 0 ? n.raw += "\n" : t.push(i);
				continue;
			}
			if (i = this.tokenizer.code(e)) {
				e = e.substring(i.raw.length);
				let n = t.at(-1);
				n?.type === "paragraph" || n?.type === "text" ? (n.raw += (n.raw.endsWith("\n") ? "" : "\n") + i.raw, n.text += "\n" + i.text, this.inlineQueue.at(-1).src = n.text) : t.push(i);
				continue;
			}
			if (i = this.tokenizer.fences(e)) {
				e = e.substring(i.raw.length), t.push(i);
				continue;
			}
			if (i = this.tokenizer.heading(e)) {
				e = e.substring(i.raw.length), t.push(i);
				continue;
			}
			if (i = this.tokenizer.hr(e)) {
				e = e.substring(i.raw.length), t.push(i);
				continue;
			}
			if (i = this.tokenizer.blockquote(e)) {
				e = e.substring(i.raw.length), t.push(i);
				continue;
			}
			if (i = this.tokenizer.list(e)) {
				e = e.substring(i.raw.length), t.push(i);
				continue;
			}
			if (i = this.tokenizer.html(e)) {
				e = e.substring(i.raw.length), t.push(i);
				continue;
			}
			if (i = this.tokenizer.def(e)) {
				e = e.substring(i.raw.length);
				let n = t.at(-1);
				n?.type === "paragraph" || n?.type === "text" ? (n.raw += (n.raw.endsWith("\n") ? "" : "\n") + i.raw, n.text += "\n" + i.raw, this.inlineQueue.at(-1).src = n.text) : this.tokens.links[i.tag] || (this.tokens.links[i.tag] = {
					href: i.href,
					title: i.title
				}, t.push(i));
				continue;
			}
			if (i = this.tokenizer.table(e)) {
				e = e.substring(i.raw.length), t.push(i);
				continue;
			}
			if (i = this.tokenizer.lheading(e)) {
				e = e.substring(i.raw.length), t.push(i);
				continue;
			}
			let a = e;
			if (this.options.extensions?.startBlock) {
				let t = 1 / 0, n = e.slice(1), r;
				this.options.extensions.startBlock.forEach((e) => {
					r = e.call({ lexer: this }, n), typeof r == "number" && r >= 0 && (t = Math.min(t, r));
				}), t < 1 / 0 && t >= 0 && (a = e.substring(0, t + 1));
			}
			if (this.state.top && (i = this.tokenizer.paragraph(a))) {
				let r = t.at(-1);
				n && r?.type === "paragraph" ? (r.raw += (r.raw.endsWith("\n") ? "" : "\n") + i.raw, r.text += "\n" + i.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = r.text) : t.push(i), n = a.length !== e.length, e = e.substring(i.raw.length);
				continue;
			}
			if (i = this.tokenizer.text(e)) {
				e = e.substring(i.raw.length);
				let n = t.at(-1);
				n?.type === "text" ? (n.raw += (n.raw.endsWith("\n") ? "" : "\n") + i.raw, n.text += "\n" + i.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = n.text) : t.push(i);
				continue;
			}
			if (e) {
				this.infiniteLoopError(e.charCodeAt(0));
				break;
			}
		}
		return this.state.top = !0, t;
	}
	inline(e, t = []) {
		return this.inlineQueue.push({
			src: e,
			tokens: t
		}), t;
	}
	linkInText(e) {
		if (!e.includes("[")) return !1;
		let t = this.tokenizer.rules.inline.link;
		for (let n of e.matchAll(this.tokenizer.rules.inline.blockSkip)) if (t.test(n[0]) && e.charAt(n.index - 1) !== "!") return !0;
		for (let t of e.matchAll(this.tokenizer.rules.inline.reflinkSearch)) {
			let e = t[0], n = e.lastIndexOf("[");
			if (e.charAt(0) !== "!" && Object.hasOwn(this.tokens.links, sr(e.slice(n + 1, -1))) && !(n > 1 && this.linkInText(e.slice(1, n - 1)))) return !0;
		}
		return !1;
	}
	inlineTokens(e, t = []) {
		this.tokenizer.lexer = this;
		let n = e;
		if (this.tokens.links && e.includes("[")) {
			let e = this.tokenizer.rules.inline.reflinkSearch, t = (n) => {
				let r = n.lastIndexOf("[");
				if (!Object.hasOwn(this.tokens.links, sr(n.slice(r + 1, -1)))) return n;
				if (r > 1 && n.charAt(0) !== "!") {
					let i = n.slice(1, r - 1);
					if (this.linkInText(i)) return "[" + i.replace(e, t) + "][" + "a".repeat(n.length - r - 2) + "]";
				}
				return "[" + "a".repeat(n.length - 2) + "]";
			};
			n = n.replace(e, t);
		}
		n = n.replace(this.tokenizer.rules.inline.anyPunctuation, (e) => "+".repeat(e.length)), n = n.replace(this.tokenizer.rules.inline.blockSkip, (e, t, n) => {
			let r = n ? n.length : 0;
			return e.slice(0, r) + "[" + "a".repeat(e.length - r - 2) + "]";
		}), n = this.options.hooks?.emStrongMask?.call({ lexer: this }, n) ?? n;
		let r = !1, i = "", a = 1 / 0;
		for (; e;) {
			if (e.length < a) a = e.length;
			else {
				this.infiniteLoopError(e.charCodeAt(0));
				break;
			}
			r || (i = ""), r = !1;
			let o;
			if (this.options.extensions?.inline?.some((n) => (o = n.call({ lexer: this }, e, t)) ? (e = e.substring(o.raw.length), t.push(o), !0) : !1)) continue;
			if (o = this.tokenizer.escape(e)) {
				e = e.substring(o.raw.length), t.push(o);
				continue;
			}
			if (o = this.tokenizer.tag(e)) {
				e = e.substring(o.raw.length), t.push(o);
				continue;
			}
			if (o = this.tokenizer.link(e)) {
				e = e.substring(o.raw.length), t.push(o);
				continue;
			}
			if (o = this.tokenizer.reflink(e, this.tokens.links)) {
				e = e.substring(o.raw.length);
				let n = t.at(-1);
				o.type === "text" && n?.type === "text" ? (n.raw += o.raw, n.text += o.text) : t.push(o);
				continue;
			}
			if (o = this.tokenizer.emStrong(e, n, i)) {
				e = e.substring(o.raw.length), t.push(o);
				continue;
			}
			if (o = this.tokenizer.codespan(e)) {
				e = e.substring(o.raw.length), t.push(o);
				continue;
			}
			if (o = this.tokenizer.br(e)) {
				e = e.substring(o.raw.length), t.push(o);
				continue;
			}
			if (o = this.tokenizer.del(e, n, i)) {
				e = e.substring(o.raw.length), t.push(o);
				continue;
			}
			if (o = this.tokenizer.autolink(e)) {
				e = e.substring(o.raw.length), t.push(o);
				continue;
			}
			if (!this.state.inLink && (o = this.tokenizer.url(e))) {
				e = e.substring(o.raw.length), t.push(o);
				continue;
			}
			let s = e;
			if (this.options.extensions?.startInline) {
				let t = 1 / 0, n = e.slice(1), r;
				this.options.extensions.startInline.forEach((e) => {
					r = e.call({ lexer: this }, n), typeof r == "number" && r >= 0 && (t = Math.min(t, r));
				}), t < 1 / 0 && t >= 0 && (s = e.substring(0, t + 1));
			}
			if (o = this.tokenizer.inlineText(s)) {
				e = e.substring(o.raw.length), o.raw.slice(-1) !== "_" && (i = o.raw.slice(-1)), r = !0;
				let n = t.at(-1);
				n?.type === "text" ? (n.raw += o.raw, n.text += o.text) : t.push(o);
				continue;
			}
			if (e) {
				this.infiniteLoopError(e.charCodeAt(0));
				break;
			}
		}
		return t;
	}
	infiniteLoopError(e) {
		let t = "Infinite loop on byte: " + e;
		if (this.options.silent) console.error(t);
		else throw Error(t);
	}
}, mr = class {
	options;
	parser;
	constructor(e) {
		this.options = e || j;
	}
	space(e) {
		return "";
	}
	code({ text: e, lang: t, escaped: n }) {
		let r = (t || "").match(F.notSpaceStart)?.[0], i = e ? e.replace(F.endingNewline, "") + "\n" : "";
		return r ? "<pre><code class=\"language-" + H(r) + "\">" + (n ? i : H(i, !0)) + "</code></pre>\n" : "<pre><code>" + (n ? i : H(i, !0)) + "</code></pre>\n";
	}
	blockquote({ tokens: e }) {
		return `<blockquote>
${this.parser.parse(e)}</blockquote>
`;
	}
	html({ text: e }) {
		return e;
	}
	def(e) {
		return "";
	}
	heading({ tokens: e, depth: t }) {
		return `<h${t}>${this.parser.parseInline(e)}</h${t}>
`;
	}
	hr(e) {
		return "<hr>\n";
	}
	list(e) {
		let t = e.ordered, n = e.start, r = "";
		for (let t = 0; t < e.items.length; t++) {
			let n = e.items[t];
			r += this.listitem(n);
		}
		let i = t ? "ol" : "ul", a = t && n !== 1 ? " start=\"" + n + "\"" : "";
		return "<" + i + a + ">\n" + r + "</" + i + ">\n";
	}
	listitem(e) {
		return `<li>${this.parser.parse(e.tokens)}</li>
`;
	}
	checkbox({ checked: e }) {
		return "<input " + (e ? "checked=\"\" " : "") + "disabled=\"\" type=\"checkbox\"> ";
	}
	paragraph({ tokens: e }) {
		return `<p>${this.parser.parseInline(e)}</p>
`;
	}
	table(e) {
		let t = "", n = "";
		for (let t = 0; t < e.header.length; t++) n += this.tablecell(e.header[t]);
		t += this.tablerow({ text: n });
		let r = "";
		for (let t = 0; t < e.rows.length; t++) {
			let i = e.rows[t];
			n = "";
			for (let e = 0; e < i.length; e++) n += this.tablecell(i[e]);
			r += this.tablerow({ text: n });
		}
		return r &&= `<tbody>${r}</tbody>`, "<table>\n<thead>\n" + t + "</thead>\n" + r + "</table>\n";
	}
	tablerow({ text: e }) {
		return `<tr>
${e}</tr>
`;
	}
	tablecell(e) {
		let t = this.parser.parseInline(e.tokens), n = e.header ? "th" : "td";
		return (e.align ? `<${n} align="${e.align}">` : `<${n}>`) + t + `</${n}>
`;
	}
	strong({ tokens: e }) {
		return `<strong>${this.parser.parseInline(e)}</strong>`;
	}
	em({ tokens: e }) {
		return `<em>${this.parser.parseInline(e)}</em>`;
	}
	codespan({ text: e }) {
		return `<code>${H(e, !0)}</code>`;
	}
	br(e) {
		return "<br>";
	}
	del({ tokens: e }) {
		return `<del>${this.parser.parseInline(e)}</del>`;
	}
	link({ href: e, title: t, text: n, tokens: r, autolink: i }) {
		let a = i ? H(n, !0) : this.parser.parseInline(r), o = ir(e);
		if (o === null) return a;
		e = H(o, i);
		let s = "<a href=\"" + e + "\"";
		return t && (s += " title=\"" + H(t) + "\""), s += ">" + a + "</a>", s;
	}
	image({ href: e, title: t, text: n, tokens: r }) {
		r && (n = this.parser.parseInline(r, this.parser.textRenderer));
		let i = ir(e);
		if (i === null) return H(n);
		e = i;
		let a = `<img src="${H(e)}" alt="${H(n)}"`;
		return t && (a += ` title="${H(t)}"`), a += ">", a;
	}
	text(e) {
		return "tokens" in e && e.tokens ? this.parser.parseInline(e.tokens) : "escaped" in e && e.escaped ? e.text : H(e.text);
	}
}, hr = class {
	strong({ text: e }) {
		return e;
	}
	em({ text: e }) {
		return e;
	}
	codespan({ text: e }) {
		return e;
	}
	del({ text: e }) {
		return e;
	}
	html({ text: e }) {
		return e;
	}
	text({ text: e }) {
		return e;
	}
	link({ text: e }) {
		return "" + e;
	}
	image({ text: e }) {
		return "" + e;
	}
	br() {
		return "";
	}
	checkbox({ raw: e }) {
		return e;
	}
}, G = class e {
	options;
	renderer;
	textRenderer;
	constructor(e) {
		this.options = e || j, this.options.renderer = this.options.renderer || new mr(), this.renderer = this.options.renderer, this.renderer.options = this.options, this.renderer.parser = this, this.textRenderer = new hr();
	}
	static parse(t, n) {
		return new e(n).parse(t);
	}
	static parseInline(t, n) {
		return new e(n).parseInline(t);
	}
	parse(e) {
		this.renderer.parser = this;
		let t = "";
		for (let n = 0; n < e.length; n++) {
			let r = e[n];
			if (this.options.extensions?.renderers?.[r.type]) {
				let e = r, n = this.options.extensions.renderers[e.type].call({ parser: this }, e);
				if (n !== !1 || ![
					"space",
					"hr",
					"heading",
					"code",
					"table",
					"blockquote",
					"list",
					"checkbox",
					"html",
					"def",
					"paragraph",
					"text"
				].includes(e.type)) {
					t += n || "";
					continue;
				}
			}
			let i = r;
			switch (i.type) {
				case "space":
					t += this.renderer.space(i);
					break;
				case "hr":
					t += this.renderer.hr(i);
					break;
				case "heading":
					t += this.renderer.heading(i);
					break;
				case "code":
					t += this.renderer.code(i);
					break;
				case "table":
					t += this.renderer.table(i);
					break;
				case "blockquote":
					t += this.renderer.blockquote(i);
					break;
				case "list":
					t += this.renderer.list(i);
					break;
				case "checkbox":
					t += this.renderer.checkbox(i);
					break;
				case "html":
					t += this.renderer.html(i);
					break;
				case "def":
					t += this.renderer.def(i);
					break;
				case "paragraph":
					t += this.renderer.paragraph(i);
					break;
				case "text":
					t += this.renderer.text(i);
					break;
				default: {
					let e = "Token with \"" + i.type + "\" type was not found.";
					if (this.options.silent) return console.error(e), "";
					throw Error(e);
				}
			}
		}
		return t;
	}
	parseInline(e, t = this.renderer) {
		this.renderer.parser = this;
		let n = "";
		for (let r = 0; r < e.length; r++) {
			let i = e[r];
			if (this.options.extensions?.renderers?.[i.type]) {
				let e = this.options.extensions.renderers[i.type].call({ parser: this }, i);
				if (e !== !1 || ![
					"escape",
					"html",
					"link",
					"image",
					"checkbox",
					"strong",
					"em",
					"codespan",
					"br",
					"del",
					"text"
				].includes(i.type)) {
					n += e || "";
					continue;
				}
			}
			let a = i;
			switch (a.type) {
				case "escape":
					n += t.text(a);
					break;
				case "html":
					n += t.html(a);
					break;
				case "link":
					n += t.link(a);
					break;
				case "image":
					n += t.image(a);
					break;
				case "checkbox":
					n += t.checkbox(a);
					break;
				case "strong":
					n += t.strong(a);
					break;
				case "em":
					n += t.em(a);
					break;
				case "codespan":
					n += t.codespan(a);
					break;
				case "br":
					n += t.br(a);
					break;
				case "del":
					n += t.del(a);
					break;
				case "text":
					n += t.text(a);
					break;
				default: {
					let e = "Token with \"" + a.type + "\" type was not found.";
					if (this.options.silent) return console.error(e), "";
					throw Error(e);
				}
			}
		}
		return n;
	}
}, K = class {
	options;
	block;
	constructor(e) {
		this.options = e || j;
	}
	static passThroughHooks = /* @__PURE__ */ new Set([
		"preprocess",
		"postprocess",
		"processAllTokens",
		"emStrongMask"
	]);
	static passThroughHooksRespectAsync = /* @__PURE__ */ new Set([
		"preprocess",
		"postprocess",
		"processAllTokens"
	]);
	preprocess(e) {
		return e;
	}
	postprocess(e) {
		return e;
	}
	processAllTokens(e) {
		return e;
	}
	emStrongMask(e) {
		return e;
	}
	provideLexer(e = this.block) {
		return e ? W.lex : W.lexInline;
	}
	provideParser(e = this.block) {
		return e ? G.parse : G.parseInline;
	}
}, gr = class {
	defaults = Ht();
	options = this.setOptions;
	parse = this.parseMarkdown(!0);
	parseInline = this.parseMarkdown(!1);
	Parser = G;
	Renderer = mr;
	TextRenderer = hr;
	Lexer = W;
	Tokenizer = pr;
	Hooks = K;
	constructor(...e) {
		this.use(...e);
	}
	walkTokens(e, t) {
		let n = [];
		for (let r of e) switch (n = n.concat(t.call(this, r)), r.type) {
			case "table": {
				let e = r;
				for (let r of e.header) n = n.concat(this.walkTokens(r.tokens, t));
				for (let r of e.rows) for (let e of r) n = n.concat(this.walkTokens(e.tokens, t));
				break;
			}
			case "list": {
				let e = r;
				n = n.concat(this.walkTokens(e.items, t));
				break;
			}
			default: {
				let e = r;
				this.defaults.extensions?.childTokens?.[e.type] ? this.defaults.extensions.childTokens[e.type].forEach((r) => {
					let i = e[r].flat(1 / 0);
					n = n.concat(this.walkTokens(i, t));
				}) : e.tokens && (n = n.concat(this.walkTokens(e.tokens, t)));
			}
		}
		return n;
	}
	use(...e) {
		let t = this.defaults.extensions || {
			renderers: {},
			childTokens: {}
		};
		return e.forEach((e) => {
			let n = { ...e };
			if (n.async = this.defaults.async || n.async || !1, e.extensions && (e.extensions.forEach((e) => {
				if (!e.name) throw Error("extension name required");
				if ("renderer" in e) {
					let n = t.renderers[e.name];
					n ? t.renderers[e.name] = function(...t) {
						let r = e.renderer.apply(this, t);
						return r === !1 && (r = n.apply(this, t)), r;
					} : t.renderers[e.name] = e.renderer;
				}
				if ("tokenizer" in e) {
					if (!e.level || e.level !== "block" && e.level !== "inline") throw Error("extension level must be 'block' or 'inline'");
					let n = t[e.level];
					n ? n.unshift(e.tokenizer) : t[e.level] = [e.tokenizer], e.start && (e.level === "block" ? t.startBlock ? t.startBlock.push(e.start) : t.startBlock = [e.start] : e.level === "inline" && (t.startInline ? t.startInline.push(e.start) : t.startInline = [e.start]));
				}
				"childTokens" in e && e.childTokens && (t.childTokens[e.name] = e.childTokens);
			}), n.extensions = t), e.renderer) {
				let t = this.defaults.renderer || new mr(this.defaults);
				for (let n in e.renderer) {
					if (!(n in t)) throw Error(`renderer '${n}' does not exist`);
					if (["options", "parser"].includes(n)) continue;
					let r = n, i = e.renderer[r], a = t[r];
					t[r] = (...e) => {
						let n = i.apply(t, e);
						return n === !1 && (n = a.apply(t, e)), n || "";
					};
				}
				n.renderer = t;
			}
			if (e.tokenizer) {
				let t = this.defaults.tokenizer || new pr(this.defaults);
				for (let n in e.tokenizer) {
					if (!(n in t)) throw Error(`tokenizer '${n}' does not exist`);
					if ([
						"options",
						"rules",
						"lexer"
					].includes(n)) continue;
					let r = n, i = e.tokenizer[r], a = t[r];
					t[r] = (...e) => {
						let n = i.apply(t, e);
						return n === !1 && (n = a.apply(t, e)), n;
					};
				}
				n.tokenizer = t;
			}
			if (e.hooks) {
				let t = this.defaults.hooks || new K();
				for (let n in e.hooks) {
					if (!(n in t)) throw Error(`hook '${n}' does not exist`);
					if (["options", "block"].includes(n)) continue;
					let r = n, i = e.hooks[r], a = t[r];
					t[r] = K.passThroughHooks.has(n) ? (e) => {
						if (this.defaults.async && K.passThroughHooksRespectAsync.has(n)) return (async () => {
							let n = await i.call(t, e);
							return a.call(t, n);
						})();
						let r = i.call(t, e);
						return a.call(t, r);
					} : (...e) => {
						if (this.defaults.async) return (async () => {
							let n = await i.apply(t, e);
							return n === !1 && (n = await a.apply(t, e)), n;
						})();
						let n = i.apply(t, e);
						return n === !1 && (n = a.apply(t, e)), n;
					};
				}
				n.hooks = t;
			}
			if (e.walkTokens) {
				let t = this.defaults.walkTokens, r = e.walkTokens;
				n.walkTokens = function(e) {
					let n = [];
					return n.push(r.call(this, e)), t && (n = n.concat(t.call(this, e))), n;
				};
			}
			this.defaults = {
				...this.defaults,
				...n
			};
		}), this;
	}
	setOptions(e) {
		return this.defaults = {
			...this.defaults,
			...e
		}, this;
	}
	lexer(e, t) {
		return W.lex(e, t ?? this.defaults);
	}
	parser(e, t) {
		return G.parse(e, t ?? this.defaults);
	}
	parseMarkdown(e) {
		return (t, n) => {
			let r = { ...n }, i = {
				...this.defaults,
				...r
			}, a = this.onError(!!i.silent, !!i.async);
			if (this.defaults.async === !0 && r.async === !1) return a(/* @__PURE__ */ Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
			if (typeof t > "u" || t === null) return a(/* @__PURE__ */ Error("marked(): input parameter is undefined or null"));
			if (typeof t != "string") return a(/* @__PURE__ */ Error("marked(): input parameter is of type " + Object.prototype.toString.call(t) + ", string expected"));
			if (i.hooks && (i.hooks.options = i, i.hooks.block = e), i.async) return (async () => {
				let n = i.hooks ? await i.hooks.preprocess(t) : t, r = await (i.hooks ? await i.hooks.provideLexer(e) : e ? W.lex : W.lexInline)(n, i), a = i.hooks ? await i.hooks.processAllTokens(r) : r;
				i.walkTokens && await Promise.all(this.walkTokens(a, i.walkTokens));
				let o = await (i.hooks ? await i.hooks.provideParser(e) : e ? G.parse : G.parseInline)(a, i);
				return i.hooks ? await i.hooks.postprocess(o) : o;
			})().catch(a);
			try {
				i.hooks && (t = i.hooks.preprocess(t));
				let n = (i.hooks ? i.hooks.provideLexer(e) : e ? W.lex : W.lexInline)(t, i);
				i.hooks && (n = i.hooks.processAllTokens(n)), i.walkTokens && this.walkTokens(n, i.walkTokens);
				let r = (i.hooks ? i.hooks.provideParser(e) : e ? G.parse : G.parseInline)(n, i);
				return i.hooks && (r = i.hooks.postprocess(r)), r;
			} catch (e) {
				return a(e);
			}
		};
	}
	onError(e, t) {
		return (n) => {
			if (n.message += "\nPlease report this to https://github.com/markedjs/marked.", e) {
				let e = "<p>An error occurred:</p><pre>" + H(n.message + "", !0) + "</pre>";
				return t ? Promise.resolve(e) : e;
			}
			if (t) return Promise.reject(n);
			throw n;
		};
	}
}, q = new gr();
function J(e, t) {
	return q.parse(e, t);
}
J.options = J.setOptions = function(e) {
	return q.setOptions(e), J.defaults = q.defaults, Ut(J.defaults), J;
}, J.getDefaults = Ht, J.defaults = j;
function _r(...e) {
	return q.use(...e), J.defaults = q.defaults, Ut(J.defaults), J;
}
J.use = _r, J.walkTokens = function(e, t) {
	return q.walkTokens(e, t);
}, J.parseInline = q.parseInline, J.Parser = G, J.parser = G.parse, J.Renderer = mr, J.TextRenderer = hr, J.Lexer = W, J.lexer = W.lex, J.Tokenizer = pr, J.Hooks = K, J.parse = J, J.options, J.setOptions, J.walkTokens, J.parseInline, G.parse, W.lex;
function vr(e = {}) {
	let { className: t = "markdown-alert", variants: n = [], withoutStyle: r = !1 } = e, i = Sr(n);
	function a(e) {
		let t = e.toLowerCase();
		return i.find((e) => e.type.toLowerCase() === t) ?? null;
	}
	function o(e, n, r, i = !1) {
		let a = n ? n.type : "custom", o = n ? n.title ?? he(n.type) : e, s = r && r.trim() ? r.trim() : o;
		return {
			className: t,
			variant: a,
			icon: n?.icon ?? "",
			title: x(s),
			titleClassName: `${t}-title`,
			fromContainer: i
		};
	}
	let s = function(e) {
		let { meta: t, tokens: n = [] } = e, i = this.parser.parse(n), a = `<blockquote class="${t.className} ${t.className}-${t.variant}">\n`;
		return a += `<p class="${t.titleClassName} alert-title-${t.variant}">`, r || (a += t.icon.replace("<svg", `<svg class="alert-icon-${t.variant}"`)), a += t.title, a += "</p>\n", a += i, a += "</blockquote>\n", a;
	};
	return {
		walkTokens(e) {
			if (e.type !== "blockquote") return;
			let t = /^\[!([^\]\n]+)\][ \t]*([^\n]*)/.exec(e.text);
			if (!t) return;
			let n = t[1].trim(), r = t[2], i = a(n);
			Object.assign(e, {
				type: "alert",
				meta: o(n, i, r)
			});
			let s = e.tokens?.[0]?.tokens;
			if (s?.length) {
				let t = !1;
				for (let e = 0; e < s.length; e++) {
					let n = s[e];
					if (n.type === "br") {
						s.splice(0, e + 1), t = !0;
						break;
					}
					if (n.type === "text" && n.raw.includes("\n")) {
						let r = n, i = r.raw.slice(r.raw.indexOf("\n") + 1), a = r.text.indexOf("\n"), o = a >= 0 ? r.text.slice(a + 1) : i;
						s.splice(0, e), i === "" ? s.shift() : Object.assign(s[0], {
							raw: i,
							text: o
						}), t = !0;
						break;
					}
				}
				(!t || s.length === 0) && e.tokens?.shift();
			}
		},
		extensions: [{
			name: "alert",
			level: "block",
			renderer: ce(s)
		}, {
			name: "alertContainer",
			level: "block",
			start(e) {
				return e.startsWith(":::") ? 0 : void 0;
			},
			tokenizer(e, t) {
				let n = /^:::[ \t]*(\S+)[ \t]*([^\n]*)\n([\s\S]*?)\n:::/.exec(e);
				if (n) {
					let [e, t, r, i] = n, s = a(t);
					return {
						type: "alert",
						raw: e,
						text: i.trim(),
						tokens: this.lexer.blockTokens(i.trim()),
						meta: o(t, s, r, !0)
					};
				}
			},
			renderer: ce(s)
		}]
	};
}
var yr = "<svg class=\"octicon octicon-light-bulb\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z\"></path></svg>", br = "<svg class=\"octicon octicon-book\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M0 1.75A.75.75 0 0 1 .75 1h4.253c1.227 0 2.317.59 3 1.501A3.743 3.743 0 0 1 11.006 1h4.245a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-4.507a2.25 2.25 0 0 0-1.591.659l-.622.621a.75.75 0 0 1-1.06 0l-.622-.621A2.25 2.25 0 0 0 5.258 13H.75a.75.75 0 0 1-.75-.75Zm7.251 10.324.004-5.073-.002-2.253A2.25 2.25 0 0 0 5.003 2.5H1.5v9h3.757a3.75 3.75 0 0 1 1.994.574ZM8.755 4.75l-.004 7.322a3.752 3.752 0 0 1 1.992-.572H14.5v-9h-3.495a2.25 2.25 0 0 0-2.25 2.25Z\"></path></svg>", xr = [
	{
		type: "note",
		icon: "<svg class=\"octicon octicon-info\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z\"></path></svg>"
	},
	{
		type: "info",
		icon: "<svg class=\"octicon octicon-info\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z\"></path></svg>"
	},
	{
		type: "tip",
		icon: "<svg class=\"octicon octicon-light-bulb\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z\"></path></svg>"
	},
	{
		type: "important",
		icon: "<svg class=\"octicon octicon-report\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z\"></path></svg>"
	},
	{
		type: "warning",
		icon: "<svg class=\"octicon octicon-alert\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z\"></path></svg>"
	},
	{
		type: "caution",
		icon: "<svg class=\"octicon octicon-stop\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z\"></path></svg>"
	},
	{
		type: "abstract",
		title: "Abstract",
		icon: "<svg class=\"octicon octicon-clipboard\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M5.75 1a.75.75 0 0 0-.75.75v.5c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.5a.75.75 0 0 0-.75-.75Zm4.5-1.5a2.25 2.25 0 0 1 2.122 1.5H13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h.628A2.25 2.25 0 0 1 5.75-.5ZM3.5 3v10a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5V3a.5.5 0 0 0-.5-.5h-8a.5.5 0 0 0-.5.5Z\"></path></svg>"
	},
	{
		type: "summary",
		title: "Summary",
		icon: "<svg class=\"octicon octicon-clipboard\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M5.75 1a.75.75 0 0 0-.75.75v.5c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.5a.75.75 0 0 0-.75-.75Zm4.5-1.5a2.25 2.25 0 0 1 2.122 1.5H13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h.628A2.25 2.25 0 0 1 5.75-.5ZM3.5 3v10a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5V3a.5.5 0 0 0-.5-.5h-8a.5.5 0 0 0-.5.5Z\"></path></svg>"
	},
	{
		type: "tldr",
		title: "TL;DR",
		icon: "<svg class=\"octicon octicon-clipboard\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M5.75 1a.75.75 0 0 0-.75.75v.5c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.5a.75.75 0 0 0-.75-.75Zm4.5-1.5a2.25 2.25 0 0 1 2.122 1.5H13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h.628A2.25 2.25 0 0 1 5.75-.5ZM3.5 3v10a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5V3a.5.5 0 0 0-.5-.5h-8a.5.5 0 0 0-.5.5Z\"></path></svg>"
	},
	{
		type: "todo",
		title: "Todo",
		icon: "<svg class=\"octicon octicon-checklist\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M2.5 1.75v11.5c0 .138.112.25.25.25h3.17a.75.75 0 0 1 0 1.5H2.75A1.75 1.75 0 0 1 1 13.25V1.75C1 .784 1.784 0 2.75 0h8.5C12.216 0 13 .784 13 1.75v7.736a.75.75 0 0 1-1.5 0V1.75a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25Zm10.97 8.72a.75.75 0 0 1 1.06 0l2 2a.75.75 0 0 1-1.06 1.06l-1.22-1.22v4.94a.75.75 0 0 1-1.5 0v-4.94l-1.22 1.22a.75.75 0 0 1-1.06-1.06Z\"></path></svg>"
	},
	{
		type: "success",
		title: "Success",
		icon: "<svg class=\"octicon octicon-check-circle\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16Zm3.78-9.72a.751.751 0 0 0-.018-1.042.751.751 0 0 0-1.042-.018L6.75 9.19 5.28 7.72a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042l2 2a.75.75 0 0 0 1.06 0Z\"></path></svg>"
	},
	{
		type: "done",
		title: "Done",
		icon: "<svg class=\"octicon octicon-check-circle\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16Zm3.78-9.72a.751.751 0 0 0-.018-1.042.751.751 0 0 0-1.042-.018L6.75 9.19 5.28 7.72a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042l2 2a.75.75 0 0 0 1.06 0Z\"></path></svg>"
	},
	{
		type: "question",
		title: "Question",
		icon: "<svg class=\"octicon octicon-question\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.92 6.085h.001a.749.749 0 1 1-1.342-.67c.169-.339.436-.701.849-.977C6.845 4.16 7.369 4 8 4a2.756 2.756 0 0 1 1.637.525c.503.377.863.965.863 1.725 0 .448-.115.83-.329 1.15-.205.307-.47.513-.692.662-.109.072-.22.138-.313.195l-.006.004a6.24 6.24 0 0 0-.26.16.952.952 0 0 0-.276.245.75.75 0 0 1-1.248-.832c.184-.264.42-.489.692-.661.103-.067.207-.132.313-.195l.007-.004c.1-.061.182-.11.258-.161a.969.969 0 0 0 .277-.245C8.96 6.514 9 6.427 9 6.25a.612.612 0 0 0-.262-.525A1.27 1.27 0 0 0 8 5.5c-.369 0-.595.09-.74.187a1.01 1.01 0 0 0-.34.398ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z\"></path></svg>"
	},
	{
		type: "help",
		title: "Help",
		icon: "<svg class=\"octicon octicon-question\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.92 6.085h.001a.749.749 0 1 1-1.342-.67c.169-.339.436-.701.849-.977C6.845 4.16 7.369 4 8 4a2.756 2.756 0 0 1 1.637.525c.503.377.863.965.863 1.725 0 .448-.115.83-.329 1.15-.205.307-.47.513-.692.662-.109.072-.22.138-.313.195l-.006.004a6.24 6.24 0 0 0-.26.16.952.952 0 0 0-.276.245.75.75 0 0 1-1.248-.832c.184-.264.42-.489.692-.661.103-.067.207-.132.313-.195l.007-.004c.1-.061.182-.11.258-.161a.969.969 0 0 0 .277-.245C8.96 6.514 9 6.427 9 6.25a.612.612 0 0 0-.262-.525A1.27 1.27 0 0 0 8 5.5c-.369 0-.595.09-.74.187a1.01 1.01 0 0 0-.34.398ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z\"></path></svg>"
	},
	{
		type: "faq",
		title: "FAQ",
		icon: "<svg class=\"octicon octicon-question\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.92 6.085h.001a.749.749 0 1 1-1.342-.67c.169-.339.436-.701.849-.977C6.845 4.16 7.369 4 8 4a2.756 2.756 0 0 1 1.637.525c.503.377.863.965.863 1.725 0 .448-.115.83-.329 1.15-.205.307-.47.513-.692.662-.109.072-.22.138-.313.195l-.006.004a6.24 6.24 0 0 0-.26.16.952.952 0 0 0-.276.245.75.75 0 0 1-1.248-.832c.184-.264.42-.489.692-.661.103-.067.207-.132.313-.195l.007-.004c.1-.061.182-.11.258-.161a.969.969 0 0 0 .277-.245C8.96 6.514 9 6.427 9 6.25a.612.612 0 0 0-.262-.525A1.27 1.27 0 0 0 8 5.5c-.369 0-.595.09-.74.187a1.01 1.01 0 0 0-.34.398ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z\"></path></svg>"
	},
	{
		type: "failure",
		title: "Failure",
		icon: "<svg class=\"octicon octicon-x-circle\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M2.343 13.657A8 8 0 1 1 13.658 2.343 8 8 0 0 1 2.343 13.657ZM6.03 4.97a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042L6.94 8 4.97 9.97a.749.749 0 0 0 .326 1.275.749.749 0 0 0 .734-.215L8 9.06l1.97 1.97a.749.749 0 0 0 1.275-.326.749.749 0 0 0-.215-.734L9.06 8l1.97-1.97a.749.749 0 0 0-.326-1.275.749.749 0 0 0-.734.215L8 6.94Z\"></path></svg>"
	},
	{
		type: "fail",
		title: "Fail",
		icon: "<svg class=\"octicon octicon-x-circle\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M2.343 13.657A8 8 0 1 1 13.658 2.343 8 8 0 0 1 2.343 13.657ZM6.03 4.97a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042L6.94 8 4.97 9.97a.749.749 0 0 0 .326 1.275.749.749 0 0 0 .734-.215L8 9.06l1.97 1.97a.749.749 0 0 0 1.275-.326.749.749 0 0 0-.215-.734L9.06 8l1.97-1.97a.749.749 0 0 0-.326-1.275.749.749 0 0 0-.734.215L8 6.94Z\"></path></svg>"
	},
	{
		type: "missing",
		title: "Missing",
		icon: "<svg class=\"octicon octicon-x-circle\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M2.343 13.657A8 8 0 1 1 13.658 2.343 8 8 0 0 1 2.343 13.657ZM6.03 4.97a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042L6.94 8 4.97 9.97a.749.749 0 0 0 .326 1.275.749.749 0 0 0 .734-.215L8 9.06l1.97 1.97a.749.749 0 0 0 1.275-.326.749.749 0 0 0-.215-.734L9.06 8l1.97-1.97a.749.749 0 0 0-.326-1.275.749.749 0 0 0-.734.215L8 6.94Z\"></path></svg>"
	},
	{
		type: "danger",
		title: "Danger",
		icon: "<svg class=\"octicon octicon-zap\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M9.504.43a1.516 1.516 0 0 1 2.437 1.713L10.415 5.5h2.123c1.57 0 2.346 1.909 1.22 3.004l-7.34 7.142a1.249 1.249 0 0 1-.871.354h-.302a1.25 1.25 0 0 1-1.157-1.723L5.633 10.5H3.462c-1.57 0-2.346-1.909-1.22-3.004ZM9.98 1.873a.016.016 0 0 0-.016.006L2.252 9.021a.75.75 0 0 0 .488 1.212h3.838a.75.75 0 0 1 .694 1.034L5.545 15.02a.016.016 0 0 0 .003.017.017.017 0 0 0 .018.004h.302a.016.016 0 0 0 .012-.005l7.34-7.142a.75.75 0 0 0-.488-1.212h-3.838a.75.75 0 0 1-.694-1.034l1.527-3.628a.016.016 0 0 0-.003-.017.017.017 0 0 0-.018-.004h-.302Z\"></path></svg>"
	},
	{
		type: "error",
		title: "Error",
		icon: "<svg class=\"octicon octicon-zap\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M9.504.43a1.516 1.516 0 0 1 2.437 1.713L10.415 5.5h2.123c1.57 0 2.346 1.909 1.22 3.004l-7.34 7.142a1.249 1.249 0 0 1-.871.354h-.302a1.25 1.25 0 0 1-1.157-1.723L5.633 10.5H3.462c-1.57 0-2.346-1.909-1.22-3.004ZM9.98 1.873a.016.016 0 0 0-.016.006L2.252 9.021a.75.75 0 0 0 .488 1.212h3.838a.75.75 0 0 1 .694 1.034L5.545 15.02a.016.016 0 0 0 .003.017.017.017 0 0 0 .018.004h.302a.016.016 0 0 0 .012-.005l7.34-7.142a.75.75 0 0 0-.488-1.212h-3.838a.75.75 0 0 1-.694-1.034l1.527-3.628a.016.016 0 0 0-.003-.017.017.017 0 0 0-.018-.004h-.302Z\"></path></svg>"
	},
	{
		type: "bug",
		title: "Bug",
		icon: "<svg class=\"octicon octicon-bug\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M4.72.22a.75.75 0 0 1 1.06 0l1 .999a3.488 3.488 0 0 1 2.441 0l.999-1a.748.748 0 0 1 1.265.332.75.75 0 0 1-.205.729l-.775.776c.616.63.995 1.493.995 2.444v.327c0 .1-.009.197-.025.292l.727.726a.75.75 0 1 1-1.06 1.06l-.727-.727a2.17 2.17 0 0 1-.292.026H9.25V7.5a.75.75 0 0 1-1.5 0V6.125H6.875a2.17 2.17 0 0 1-.292-.026l-.727.727a.75.75 0 1 1-1.06-1.06l.727-.726a2.17 2.17 0 0 1-.025-.292V4.5c0-.951.379-1.814.995-2.444l-.775-.776a.75.75 0 0 1 0-1.06Zm6.437 6.003A.608.608 0 0 0 11 6.072v-.026a3.999 3.999 0 0 0-.11-.936 2.488 2.488 0 0 0-5.78 0 3.992 3.992 0 0 0-.11.936v.026c0 .05.008.098.02.147h4.937a.612.612 0 0 0 .2-.02ZM2.25 7.5a.75.75 0 0 0 0 1.5h.5v1.25a4.75 4.75 0 0 0 2.478 4.166l.247.137a.75.75 0 1 0 .722-1.313l-.246-.137A3.25 3.25 0 0 1 4.25 10.25V9h7.5v1.25a3.25 3.25 0 0 1-1.701 2.853l-.246.137a.75.75 0 1 0 .722 1.313l.247-.137A4.75 4.75 0 0 0 13.25 10.25V9h.5a.75.75 0 0 0 0-1.5Z\"></path></svg>"
	},
	{
		type: "example",
		title: "Example",
		icon: "<svg class=\"octicon octicon-list-unordered\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M5.75 2.5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5Zm0 5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5Zm0 5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5ZM2 14a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1-6a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM2 4a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z\"></path></svg>"
	},
	{
		type: "quote",
		title: "Quote",
		icon: "<svg class=\"octicon octicon-quote\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25v-8.5C0 2.784.784 2 1.75 2ZM1.5 12.25c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25ZM4 5.25a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 4 5.25Zm0 4a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1-.75-.75Z\"></path></svg>"
	},
	{
		type: "cite",
		title: "Cite",
		icon: "<svg class=\"octicon octicon-quote\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25v-8.5C0 2.784.784 2 1.75 2ZM1.5 12.25c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25ZM4 5.25a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 4 5.25Zm0 4a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1-.75-.75Z\"></path></svg>"
	},
	{
		type: "theorem",
		title: "Theorem",
		icon: yr
	},
	{
		type: "lemma",
		title: "Lemma",
		icon: yr
	},
	{
		type: "corollary",
		title: "Corollary",
		icon: yr
	},
	{
		type: "proposition",
		title: "Proposition",
		icon: yr
	},
	{
		type: "definition",
		title: "Definition",
		icon: br
	},
	{
		type: "axiom",
		title: "Axiom",
		icon: br
	},
	{
		type: "postulate",
		title: "Postulate",
		icon: br
	},
	{
		type: "assumption",
		title: "Assumption",
		icon: br
	},
	{
		type: "proof",
		title: "Proof",
		icon: "<svg class=\"octicon octicon-check-circle\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16Zm3.78-9.72a.751.751 0 0 0-.018-1.042.751.751 0 0 0-1.042-.018L6.75 9.19 5.28 7.72a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042l2 2a.75.75 0 0 0 1.06 0Z\"></path></svg>"
	},
	{
		type: "remark",
		title: "Remark",
		icon: "<svg class=\"octicon octicon-comment\" style=\"margin-right: 0.25em;\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" aria-hidden=\"true\"><path d=\"M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z\"></path></svg>"
	}
];
function Sr(e) {
	return e.length ? Object.values([...xr, ...e].reduce((e, t) => (e[t.type] = t, e), {})) : xr;
}
function Cr(e) {
	return `^(?:\\[!${e}])\\s*?\n*`;
}
var wr = [
	{
		id: "builtin-mp-profile",
		name: "MpProfile",
		description: "公众号名片组件，展示微信公众号名片",
		builtIn: !0,
		props: [
			{
				name: "mpId",
				description: "公众号 ID",
				required: !0
			},
			{
				name: "nickname",
				description: "公众号名称",
				required: !0
			},
			{
				name: "headimg",
				description: "公众号头像 URL"
			},
			{
				name: "signature",
				description: "公众号简介"
			},
			{
				name: "serviceType",
				description: "账号类型（1=公众号，2=服务号）",
				default: "1"
			},
			{
				name: "verifyStatus",
				description: "认证状态（0=无，1=个人，2=企业）",
				default: "0"
			}
		],
		template: "<section class=\"mp_profile_iframe_wrp custom_select_card_wrp\" nodeleaf=\"\">\n  <mp-common-profile class=\"mpprofile js_uneditable custom_select_card mp_profile_iframe\" data-pluginname=\"mpprofile\" data-id=\"{{mpId}}\" data-nickname=\"{{nickname}}\" data-headimg=\"{{headimg}}\" data-signature=\"{{signature}}\" data-service_type=\"{{serviceType}}\" data-verify_status=\"{{verifyStatus}}\"></mp-common-profile>\n  <br class=\"ProseMirror-trailingBreak\">\n</section>",
		example: "<MpProfile mpId=\"MzIxNjA5ODQ0OQ==\" nickname=\"Doocs\" headimg=\"https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/gh/doocs/md/images/mp-logo.png\" signature=\"GitHub 开源组织\" serviceType=\"1\" verifyStatus=\"1\" />"
	},
	{
		id: "builtin-qrcode",
		name: "QRCodeBlock",
		description: "二维码组件，将 URL 渲染为可扫描的二维码图片",
		builtIn: !0,
		props: [
			{
				name: "url",
				description: "二维码内容（URL）",
				required: !0
			},
			{
				name: "text",
				description: "二维码下方提示文字",
				default: "扫码访问"
			},
			{
				name: "size",
				description: "二维码尺寸（px）",
				default: "150"
			}
		],
		template: "<section style=\"text-align: center; margin: 20px auto; padding: 16px 0;\">\n  <img\n    src=\"https://api.qrserver.com/v1/create-qr-code/?size={{size}}x{{size}}&data={{url}}\"\n    alt=\"QR Code\"\n    style=\"width: {{size}}px; height: {{size}}px; display: block; margin: 0 auto; border-radius: 4px;\"\n  />\n  <p style=\"text-align: center; font-size: 14px; color: {{_textTertiary_}}; margin-top: 8px; margin-bottom: 0;\">{{text}}</p>\n</section>",
		example: "<QRCodeBlock url=\"https://md.doocs.org\" text=\"扫码访问\" size=\"150\" />"
	},
	{
		id: "builtin-author",
		name: "AuthorBlock",
		description: "作者信息组件，展示作者头像、名称和简介",
		builtIn: !0,
		props: [
			{
				name: "name",
				description: "作者名称",
				required: !0
			},
			{
				name: "avatar",
				description: "头像图片 URL"
			},
			{
				name: "bio",
				description: "作者简介"
			}
		],
		template: "<section style=\"display: table; width: 100%; padding: 16px 0; margin: 16px 0; box-sizing: border-box;\">\n  <section style=\"display: table-cell; vertical-align: middle; width: 64px;\">\n    <img src=\"{{avatar}}\" alt=\"{{name}}\" style=\"width: 56px; height: 56px; border-radius: 50%; display: block;\" />\n  </section>\n  <section style=\"display: table-cell; vertical-align: middle; padding-left: 12px;\">\n    <p style=\"margin: 0 0 4px; font-size: 15px; font-weight: bold; color: {{_textPrimary_}};\">{{name}}</p>\n    <p style=\"margin: 0; font-size: 13px; color: {{_textTertiary_}}; line-height: 1.5;\">{{bio}}</p>\n  </section>\n</section>",
		example: "<AuthorBlock name=\"yanglbme\" avatar=\"https://avatars.githubusercontent.com/u/21008209?v=4\" bio=\"Creator of Doocs\" />"
	},
	{
		id: "builtin-tip",
		name: "TipBlock",
		description: "提示框组件，高亮展示小贴士或注意事项",
		builtIn: !0,
		props: [
			{
				name: "type",
				description: "类型：info、success、warning、danger",
				default: "info"
			},
			{
				name: "title",
				description: "标题（可选）"
			},
			{
				name: "content",
				description: "提示内容",
				required: !0
			}
		],
		template: "<section style=\"border-left: 4px solid {{borderColor}}; background: {{bgColor}}; padding: 12px 16px; margin: 16px 0; border-radius: 0 6px 6px 0;\">\n  {{#if title}}<p style=\"margin: 0 0 6px; font-size: 14px; font-weight: bold; color: {{textColor}};\">{{title}}</p>{{/if}}\n  <p style=\"margin: 0; font-size: 14px; color: {{textColor}}; line-height: 1.6;\">{{content}}</p>\n</section>",
		example: "<TipBlock type=\"info\" title=\"提示\" content=\"这是一条提示信息\" />"
	},
	{
		id: "builtin-table",
		name: "TableBlock",
		description: "表格组件，用 JSON 数组渲染样式化表格，支持斑马纹",
		builtIn: !0,
		props: [
			{
				name: "headers",
				description: "列标题 JSON 字符串数组",
				required: !0,
				type: "array"
			},
			{
				name: "rows",
				description: "数据行 JSON 二维数组",
				required: !0,
				type: "array"
			},
			{
				name: "striped",
				description: "斑马纹行（true/false）",
				default: "true"
			},
			{
				name: "caption",
				description: "表格标题（可选）"
			}
		],
		template: "",
		example: "<TableBlock headers='[\"名称\",\"版本\",\"状态\"]' rows='[[\"Vue\",\"3.x\",\"稳定\"],[\"Vite\",\"8.x\",\"稳定\"],[\"pnpm\",\"10.x\",\"稳定\"]]' caption=\"技术栈清单\" />"
	},
	{
		id: "builtin-info-grid",
		name: "InfoGrid",
		description: "信息网格组件，以多列展示键值对信息",
		builtIn: !0,
		props: [{
			name: "items",
			description: "JSON 数组，每项含 label、value 字段",
			required: !0,
			type: "array"
		}, {
			name: "cols",
			description: "列数（1-3）",
			default: "2"
		}],
		template: "",
		example: "<InfoGrid items='[{\"label\":\"作者\",\"value\":\"yanglbme\"},{\"label\":\"版本\",\"value\":\"v1.0\"},{\"label\":\"许可证\",\"value\":\"MIT\"},{\"label\":\"语言\",\"value\":\"TypeScript\"}]' cols=\"2\" />"
	},
	{
		id: "builtin-badge-group",
		name: "BadgeGroup",
		description: "标签组组件，展示一组彩色标签",
		builtIn: !0,
		props: [{
			name: "tags",
			description: "JSON 字符串数组，标签列表",
			required: !0,
			type: "array"
		}, {
			name: "color",
			description: "标签主色调（hex）",
			default: "#07c160"
		}],
		template: "<section style=\"display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0;\">\n{{#each tags}}<span style=\"display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 13px; font-weight: 500; background: {{color}}1a; color: {{color}}; border: 1px solid {{color}}40;\">{{item}}</span>{{/each}}\n</section>",
		example: "<BadgeGroup tags='[\"Vue 3\",\"TypeScript\",\"Vite\",\"Tailwind CSS\"]' color=\"#07c160\" />"
	},
	{
		id: "builtin-emoji",
		name: "Emoji",
		description: "行内表情贴纸，从系统或「我的表情」插入",
		builtIn: !0,
		inline: !0,
		hidden: !0,
		template: "",
		props: [
			{
				name: "id",
				description: "表情 ID",
				required: !0
			},
			{
				name: "alt",
				description: "替代文本（可选）"
			},
			{
				name: "width",
				description: "宽度百分比，如 20%（可选，默认小尺寸）"
			},
			{
				name: "align",
				description: "独占一行时的对齐：left、center、right（可选）"
			}
		],
		example: "<Emoji id=\"liulei\" alt=\"流泪\" />"
	}
], Tr = /* @__PURE__ */ new Set(["Emoji"]);
function Er(e) {
	return Tr.has(e);
}
function Dr(e) {
	let t = {};
	for (let n of e.matchAll(/(\w[\w-]*)=(?:"([^"]*)"|'([^']*)')/g)) t[n[1]] = ge(n[2] === void 0 ? n[3] ?? "" : n[2]);
	return t;
}
function Or(e) {
	return {
		_bgPrimary_: "var(--md-comp-bg, #fff)",
		_bgSecondary_: "var(--md-comp-bg-secondary, #f5f5f5)",
		_bgStripe_: "var(--md-comp-bg-stripe, #fafafa)",
		_textPrimary_: "var(--md-comp-text-primary, #333)",
		_textSecondary_: "var(--md-comp-text-secondary, #666)",
		_textTertiary_: "var(--md-comp-text-tertiary, #999)",
		_borderDefault_: "var(--md-comp-border-default, #e0e0e0)",
		_borderLight_: "var(--md-comp-border-light, #eee)",
		...e
	};
}
var Y = {
	bg: "var(--md-comp-bg, #fff)",
	bgSec: "var(--md-comp-bg-secondary, #f5f5f5)",
	bgStripe: "var(--md-comp-bg-stripe, #fafafa)",
	txtP: "var(--md-comp-text-primary, #333)",
	txtS: "var(--md-comp-text-secondary, #666)",
	txtT: "var(--md-comp-text-tertiary, #999)",
	border: "var(--md-comp-border-default, #e0e0e0)",
	borderL: "var(--md-comp-border-light, #eee)"
};
function kr(e) {
	let t = [], n = [];
	try {
		t = JSON.parse(e.headers || "[]");
	} catch {
		t = [];
	}
	try {
		let t = JSON.parse(e.rows || "[]");
		n = Array.isArray(t) ? t : [];
	} catch {
		n = [];
	}
	let r = e.striped !== "false", i = e.caption || "", a = `padding: 8px 12px; text-align: left; font-weight: 600; font-size: 13px; color: ${Y.txtS}; background: ${Y.bgSec}; border-bottom: 2px solid ${Y.border};`, o = `padding: 8px 12px; font-size: 13px; color: ${Y.txtP}; border-bottom: 1px solid ${Y.borderL};`, s = "<section style=\"overflow-x: auto; margin: 16px 0;\">\n";
	if (s += "  <table style=\"width: 100%; border-collapse: collapse; font-size: 13px;\">\n", i && (s += `    <caption style="font-size: 13px; color: ${Y.txtS}; margin-bottom: 8px; text-align: left; caption-side: top;">${x(i)}</caption>\n`), t.length > 0) {
		s += "    <thead>\n      <tr>\n";
		for (let e of t) s += `        <th style="${a}">${x(String(e))}</th>\n`;
		s += "      </tr>\n    </thead>\n";
	}
	s += "    <tbody>\n";
	for (let e = 0; e < n.length; e++) {
		let t = Array.isArray(n[e]) ? n[e] : [], i = r && e % 2 == 1 ? ` style="background: ${Y.bgStripe};"` : "";
		s += `      <tr${i}>\n`;
		for (let e of t) s += `        <td style="${o}">${x(String(e))}</td>\n`;
		s += "      </tr>\n";
	}
	return s += "    </tbody>\n  </table>\n</section>", s;
}
function Ar(e) {
	let t = [];
	try {
		t = JSON.parse(e.items || "[]");
	} catch {
		t = [];
	}
	let n = Math.min(Math.max(Number(e.cols) || 2, 1), 3), r = `${Math.floor(100 / n)}%`, i = `<section style="margin: 16px 0; border: 1px solid ${Y.borderL}; border-radius: 8px; overflow: hidden; background: ${Y.bg};">\n`;
	i += "  <section style=\"display: table; width: 100%; border-collapse: collapse;\">\n";
	for (let e = 0; e < t.length; e += n) {
		i += "    <section style=\"display: table-row;\">\n";
		for (let a = 0; a < n; a++) {
			let o = t[e + a], s = e + n < t.length ? `1px solid ${Y.borderL}` : "none", c = a < n - 1 ? `1px solid ${Y.borderL}` : "none";
			i += `      <section style="display: table-cell; width: ${r}; padding: 10px 14px; border-bottom: ${s}; border-right: ${c}; vertical-align: top; box-sizing: border-box;">\n`, o && (i += `        <p style="margin: 0 0 2px; font-size: 11px; color: ${Y.txtT}; text-transform: uppercase; letter-spacing: 0.5px;">${x(o.label || "")}</p>\n`, i += `        <p style="margin: 0; font-size: 14px; font-weight: 500; color: ${Y.txtP};">${x(o.value || "")}</p>\n`), i += "      </section>\n";
		}
		i += "    </section>\n";
	}
	return i += "  </section>\n</section>", i;
}
var jr = {
	TableBlock: kr,
	InfoGrid: Ar
}, Mr = {
	info: {
		borderColor: "#1890ff",
		bgColor: "#e6f7ff",
		textColor: "#0050b3"
	},
	success: {
		borderColor: "#52c41a",
		bgColor: "#f6ffed",
		textColor: "#135200"
	},
	warning: {
		borderColor: "#faad14",
		bgColor: "#fffbe6",
		textColor: "#874d00"
	},
	danger: {
		borderColor: "#ff4d4f",
		bgColor: "#fff2f0",
		textColor: "#a8071a"
	}
};
function Nr(e) {
	return {
		...Mr[e.type || "info"] || Mr.info,
		...e
	};
}
function Pr(e, t) {
	return e = e.replace(/\{\{#each\s+([\w-]+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (e, n, r) => {
		let i;
		try {
			i = JSON.parse(t[n] || "[]");
		} catch {
			i = [];
		}
		return Array.isArray(i) ? i.map((e, n) => {
			let i = r;
			if (i = i.replace(/\{\{@index\}\}/g, String(n)), typeof e == "object" && e) {
				let t = e;
				i = i.replace(/\{\{item\.([\w-]+)\}\}/g, (e, n) => t[n] === void 0 ? "" : x(String(t[n])));
			} else i = i.replace(/\{\{item\}\}/g, x(String(e ?? "")));
			return Pr(i, t);
		}).join("") : "";
	}), e = e.replace(/\{\{#if\s+([\w-]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (e, n, r) => {
		let i = r.indexOf("{{#else}}");
		return i >= 0 ? t[n] ? r.slice(0, i) : r.slice(i + 9) : t[n] ? r : "";
	}), e = e.replace(/\{\{#unless\s+([\w-]+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (e, n, r) => t[n] ? "" : r), e = e.replace(/\{\{([\w-]+)\}\}/g, (e, n) => n === "children" ? t[n] ?? "" : t[n] === void 0 ? "" : x(t[n])), e;
}
function Fr(e, t) {
	let n = {};
	for (let t of e.props) t.default !== void 0 && (n[t.name] = t.default);
	Object.assign(n, t);
	let r = jr[e.name];
	if (r) return r(n);
	let i = Or(e.name === "TipBlock" ? Nr(n) : n);
	return Pr(e.template, i);
}
function Ir(e, t) {
	return Fr(e, t ?? {});
}
var Lr = {};
function Rr(e) {
	Lr = e;
}
function zr() {
	let e = {};
	for (let t of wr) e[t.name] = t;
	return e;
}
var Br = "Unknown component: {name}";
function Vr(e, t) {
	function n() {
		return e ? e() : Lr;
	}
	function r(e) {
		return (t?.()?.unknownComponent || Br).split("{name}").join(e);
	}
	function i(e, t) {
		let n = t;
		for (; n < e.length && /\w/.test(e[n]);) n++;
		return e.slice(t, n);
	}
	function a(e) {
		return Er(e) || n()[e]?.inline === !0;
	}
	function o(e, t) {
		let n = e.indexOf("\n", t);
		return n >= 0 ? n : e.length;
	}
	function s(e, t) {
		return e.slice(t, o(e, t)).trim() === "";
	}
	function c(e, t) {
		let n = 0;
		for (;;) {
			let r = Ae(e, "<", n, t);
			if (r === -1) return !1;
			let i = e.charCodeAt(r + 1);
			if (i >= 65 && i <= 90) return !0;
			n = r + 1;
		}
	}
	function l(e, t, n) {
		let r = t, i = 0;
		for (; r < n && e[r] === " " && i < 3;) r++, i++;
		let a = e[r];
		if (a !== "`" && a !== "~") return null;
		let o = 0;
		for (; r + o < n && e[r + o] === a;) o++;
		return o >= 3 ? {
			char: a,
			length: o
		} : null;
	}
	function u(e) {
		let t = S(e);
		if (!c(e, t)) return;
		let n = "", r = 0, s = 0;
		for (; s <= t;) {
			let t = o(e, s), c = l(e, s, t);
			if (n) c && c.char === n && c.length >= r && (n = "", r = 0);
			else if (c) n = c.char, r = c.length;
			else {
				let t = e.charCodeAt(s + 1);
				if (e[s] === "<" && t >= 65 && t <= 90 && !a(i(e, s + 1))) return s;
			}
			s = t + 1;
		}
	}
	function d(e) {
		function t(e, t, n) {
			let r = `</${t}>`, i = n, a = "", s = 0;
			for (; i <= e.length;) {
				let t = o(e, i), n = e.slice(i, t), c = n.match(/^ {0,3}([`~]{3,})/);
				if (a) c && c[1][0] === a && c[1].length >= s && (a = "", s = 0);
				else if (c) a = c[1][0], s = c[1].length;
				else {
					let e = n.match(/^\s*/)?.[0].length ?? 0;
					if (n.slice(e).startsWith(r) && n.slice(e + r.length).trim() === "") return i + e;
				}
				if (t === e.length) break;
				i = t + 1;
			}
			return -1;
		}
		if (e[0] !== "<" || e[1] < "A" || e[1] > "Z") return null;
		let n = i(e, 1);
		if (!n || a(n)) return null;
		let r = 1 + n.length, c = "", l = r;
		for (; l < e.length;) {
			let i = e[l];
			if (c) i === c && (c = "");
			else if (i === "\"" || i === "'") c = i;
			else if (i === "/" && e[l + 1] === ">") return s(e, l + 2) ? {
				raw: e.slice(0, l + 2),
				name: n,
				propsStr: e.slice(r, l).trim(),
				children: ""
			} : null;
			else if (i === ">") {
				let i = o(e, l + 1), a = `</${n}>`, c = e.indexOf(a, l + 1);
				if (c >= 0 && c < i) {
					if (e.slice(c + a.length, i).trim() !== "") return null;
					let t = e.slice(l + 1, c);
					return {
						raw: e.slice(0, c + a.length),
						name: n,
						propsStr: e.slice(r, l).trim(),
						children: t
					};
				}
				if (!s(e, l + 1)) return null;
				let u = t(e, n, i === e.length ? i : i + 1);
				if (u < 0) return null;
				let d = e.slice(l + 1, u);
				return {
					raw: e.slice(0, u + a.length),
					name: n,
					propsStr: e.slice(r, l).trim(),
					children: d
				};
			}
			l++;
		}
		return null;
	}
	return { extensions: [{
		name: "mdComponent",
		level: "block",
		start(e) {
			return u(e);
		},
		tokenizer(e) {
			let t = d(e);
			if (t) return {
				type: "mdComponent",
				raw: t.raw,
				name: t.name,
				propsStr: t.propsStr,
				children: t.children
			};
		},
		renderer(e) {
			let { name: t, propsStr: i, children: a } = e, o = n()[t];
			if (!o) return `<p style="color:#f00;font-size:12px;">[${r(t)}]</p>\n`;
			let s = Dr(i);
			return a && s.children === void 0 && (s.children = a), `${Fr(o, s)}\n`;
		}
	}] };
}
var Hr = {
	grinning: "😀",
	smiley: "😃",
	smile: "😄",
	grin: "😁",
	laughing: "😆",
	sweat_smile: "😅",
	rofl: "🤣",
	joy: "😂",
	slightly_smiling_face: "🙂",
	upside_down_face: "🙃",
	wink: "😉",
	blush: "😊",
	innocent: "😇",
	heart_eyes: "😍",
	kissing_heart: "😘",
	yum: "😋",
	stuck_out_tongue: "😛",
	stuck_out_tongue_winking_eye: "😜",
	zany_face: "🤪",
	money_mouth_face: "🤑",
	hugs: "🤗",
	thinking: "🤔",
	zipper_mouth_face: "🤐",
	neutral_face: "😐",
	expressionless: "😑",
	no_mouth: "😶",
	smirk: "😏",
	unamused: "😒",
	roll_eyes: "🙄",
	grimacing: "😬",
	relieved: "😌",
	pensive: "😔",
	sleepy: "😪",
	drooling_face: "🤤",
	sleeping: "😴",
	mask: "😷",
	face_with_thermometer: "🤒",
	nauseated_face: "🤢",
	sneezing_face: "🤧",
	hot_face: "🥵",
	cold_face: "🥶",
	dizzy_face: "😵",
	exploding_head: "🤯",
	cowboy_hat_face: "🤠",
	partying_face: "🥳",
	sunglasses: "😎",
	nerd_face: "🤓",
	confused: "😕",
	worried: "😟",
	open_mouth: "😮",
	astonished: "😲",
	flushed: "😳",
	pleading_face: "🥺",
	frowning_face: "☹️",
	anguished: "😧",
	fearful: "😨",
	cold_sweat: "😰",
	disappointed_relieved: "😥",
	cry: "😢",
	sob: "😭",
	scream: "😱",
	confounded: "😖",
	persevere: "😣",
	disappointed: "😞",
	sweat: "😓",
	weary: "😩",
	tired_face: "😫",
	yawning_face: "🥱",
	triumph: "😤",
	rage: "😡",
	angry: "😠",
	smiling_imp: "😈",
	imp: "👿",
	skull: "💀",
	ghost: "👻",
	alien: "👽",
	robot: "🤖",
	poop: "💩",
	clown_face: "🤡",
	wave: "👋",
	raised_hand: "✋",
	ok_hand: "👌",
	v: "✌️",
	crossed_fingers: "🤞",
	love_you_gesture: "🤟",
	call_me_hand: "🤙",
	point_left: "👈",
	point_right: "👉",
	point_up_2: "👆",
	point_down: "👇",
	point_up: "☝️",
	"+1": "👍",
	thumbsup: "👍",
	"-1": "👎",
	thumbsdown: "👎",
	fist: "✊",
	facepunch: "👊",
	clap: "👏",
	raised_hands: "🙌",
	open_hands: "👐",
	handshake: "🤝",
	pray: "🙏",
	muscle: "💪",
	writing_hand: "✍️",
	nail_care: "💅",
	eyes: "👀",
	brain: "🧠",
	baby: "👶",
	man: "👨",
	woman: "👩",
	bust_in_silhouette: "👤",
	busts_in_silhouette: "👥",
	technologist: "🧑‍💻",
	detective: "🕵️",
	construction_worker: "👷",
	superhero: "🦸",
	santa: "🎅",
	dancer: "💃",
	running: "🏃",
	walking: "🚶",
	dog: "🐶",
	cat: "🐱",
	mouse: "🐭",
	hamster: "🐹",
	rabbit: "🐰",
	fox_face: "🦊",
	bear: "🐻",
	panda_face: "🐼",
	koala: "🐨",
	tiger: "🐯",
	lion: "🦁",
	cow: "🐮",
	pig: "🐷",
	frog: "🐸",
	monkey_face: "🐵",
	see_no_evil: "🙈",
	hear_no_evil: "🙉",
	speak_no_evil: "🙊",
	chicken: "🐔",
	penguin: "🐧",
	bird: "🐦",
	duck: "🦆",
	eagle: "🦅",
	owl: "🦉",
	bat: "🦇",
	wolf: "🐺",
	horse: "🐴",
	unicorn: "🦄",
	bee: "🐝",
	bug: "🐛",
	butterfly: "🦋",
	snail: "🐌",
	spider: "🕷️",
	turtle: "🐢",
	snake: "🐍",
	dragon: "🐉",
	whale: "🐳",
	dolphin: "🐬",
	fish: "🐟",
	octopus: "🐙",
	crab: "🦀",
	shrimp: "🦐",
	seedling: "🌱",
	evergreen_tree: "🌲",
	deciduous_tree: "🌳",
	palm_tree: "🌴",
	cactus: "🌵",
	herb: "🌿",
	four_leaf_clover: "🍀",
	maple_leaf: "🍁",
	fallen_leaf: "🍂",
	leaves: "🍃",
	mushroom: "🍄",
	bouquet: "💐",
	cherry_blossom: "🌸",
	rose: "🌹",
	sunflower: "🌻",
	hibiscus: "🌺",
	tulip: "🌷",
	sunny: "☀️",
	partly_sunny: "⛅",
	cloud: "☁️",
	rainbow: "🌈",
	umbrella: "☔",
	zap: "⚡",
	snowflake: "❄️",
	snowman: "⛄",
	fire: "🔥",
	droplet: "💧",
	ocean: "🌊",
	star: "⭐",
	star2: "🌟",
	sparkles: "✨",
	boom: "💥",
	dizzy: "💫",
	moon: "🌙",
	sun_with_face: "🌞",
	earth_asia: "🌏",
	earth_americas: "🌎",
	earth_africa: "🌍",
	apple: "🍎",
	green_apple: "🍏",
	tangerine: "🍊",
	lemon: "🍋",
	banana: "🍌",
	watermelon: "🍉",
	grapes: "🍇",
	strawberry: "🍓",
	peach: "🍑",
	cherries: "🍒",
	pineapple: "🍍",
	avocado: "🥑",
	tomato: "🍅",
	corn: "🌽",
	hot_pepper: "🌶️",
	bread: "🍞",
	cheese: "🧀",
	hamburger: "🍔",
	fries: "🍟",
	pizza: "🍕",
	hotdog: "🌭",
	taco: "🌮",
	popcorn: "🍿",
	rice: "🍚",
	ramen: "🍜",
	sushi: "🍣",
	dumpling: "🥟",
	icecream: "🍦",
	doughnut: "🍩",
	cookie: "🍪",
	birthday: "🎂",
	cake: "🍰",
	chocolate_bar: "🍫",
	candy: "🍬",
	honey_pot: "🍯",
	coffee: "☕",
	tea: "🍵",
	beer: "🍺",
	beers: "🍻",
	wine_glass: "🍷",
	cocktail: "🍸",
	champagne: "🍾",
	clinking_glasses: "🥂",
	soccer: "⚽",
	basketball: "🏀",
	football: "🏈",
	baseball: "⚾",
	tennis: "🎾",
	volleyball: "🏐",
	"8ball": "🎱",
	ping_pong: "🏓",
	badminton: "🏸",
	goal_net: "🥅",
	dart: "🎯",
	bowling: "🎳",
	video_game: "🎮",
	game_die: "🎲",
	chess_pawn: "♟️",
	jigsaw: "🧩",
	art: "🎨",
	clapper: "🎬",
	microphone: "🎤",
	headphones: "🎧",
	musical_note: "🎵",
	notes: "🎶",
	guitar: "🎸",
	trophy: "🏆",
	medal_sports: "🏅",
	"1st_place_medal": "🥇",
	"2nd_place_medal": "🥈",
	"3rd_place_medal": "🥉",
	tada: "🎉",
	confetti_ball: "🎊",
	balloon: "🎈",
	gift: "🎁",
	ribbon: "🎀",
	fireworks: "🎆",
	rocket: "🚀",
	airplane: "✈️",
	helicopter: "🚁",
	ship: "🚢",
	sailboat: "⛵",
	car: "🚗",
	taxi: "🚕",
	bus: "🚌",
	truck: "🚚",
	tractor: "🚜",
	bike: "🚲",
	motorcycle: "🏍️",
	train: "🚆",
	bullettrain_side: "🚄",
	station: "🚉",
	traffic_light: "🚦",
	construction: "🚧",
	house: "🏠",
	office: "🏢",
	hospital: "🏥",
	bank: "🏦",
	school: "🏫",
	factory: "🏭",
	japanese_castle: "🏯",
	european_castle: "🏰",
	statue_of_liberty: "🗽",
	tokyo_tower: "🗼",
	mount_fuji: "🗻",
	mountain: "⛰️",
	volcano: "🌋",
	desert_island: "🏝️",
	beach_umbrella: "🏖️",
	tent: "⛺",
	world_map: "🗺️",
	compass: "🧭",
	computer: "💻",
	desktop_computer: "🖥️",
	keyboard: "⌨️",
	computer_mouse: "🖱️",
	printer: "🖨️",
	iphone: "📱",
	telephone: "☎️",
	fax: "📠",
	tv: "📺",
	camera: "📷",
	video_camera: "📹",
	movie_camera: "🎥",
	vhs: "📼",
	mag: "🔍",
	mag_right: "🔎",
	bulb: "💡",
	flashlight: "🔦",
	candle: "🕯️",
	battery: "🔋",
	electric_plug: "🔌",
	floppy_disk: "💾",
	cd: "💿",
	minidisc: "💽",
	dvd: "📀",
	satellite: "📡",
	hourglass: "⌛",
	hourglass_flowing_sand: "⏳",
	watch: "⌚",
	alarm_clock: "⏰",
	stopwatch: "⏱️",
	bell: "🔔",
	no_bell: "🔕",
	loudspeaker: "📢",
	mega: "📣",
	postbox: "📮",
	email: "📧",
	envelope: "✉️",
	package: "📦",
	memo: "📝",
	pencil2: "✏️",
	black_nib: "✒️",
	paperclip: "📎",
	scissors: "✂️",
	straight_ruler: "📏",
	triangular_ruler: "📐",
	pushpin: "📌",
	round_pushpin: "📍",
	bookmark: "🔖",
	label: "🏷️",
	books: "📚",
	book: "📖",
	closed_book: "📕",
	green_book: "📗",
	blue_book: "📘",
	orange_book: "📙",
	notebook: "📓",
	ledger: "📒",
	page_facing_up: "📄",
	page_with_curl: "📃",
	scroll: "📜",
	clipboard: "📋",
	calendar: "📅",
	date: "📆",
	card_index_dividers: "🗂️",
	file_folder: "📁",
	open_file_folder: "📂",
	chart_with_upwards_trend: "📈",
	chart_with_downwards_trend: "📉",
	bar_chart: "📊",
	abacus: "🧮",
	moneybag: "💰",
	credit_card: "💳",
	gem: "💎",
	hammer: "🔨",
	wrench: "🔧",
	nut_and_bolt: "🔩",
	gear: "⚙️",
	hammer_and_wrench: "🛠️",
	toolbox: "🧰",
	magnet: "🧲",
	test_tube: "🧪",
	petri_dish: "🧫",
	dna: "🧬",
	microscope: "🔬",
	telescope: "🔭",
	pill: "💊",
	syringe: "💉",
	key: "🔑",
	lock: "🔒",
	unlock: "🔓",
	closed_lock_with_key: "🔐",
	shield: "🛡️",
	crystal_ball: "🔮",
	broom: "🧹",
	basket: "🧺",
	wastebasket: "🗑️",
	door: "🚪",
	bed: "🛏️",
	bathtub: "🛁",
	shopping_cart: "🛒",
	crown: "👑",
	ring: "💍",
	briefcase: "💼",
	heart: "❤️",
	orange_heart: "🧡",
	yellow_heart: "💛",
	green_heart: "💚",
	blue_heart: "💙",
	purple_heart: "💜",
	black_heart: "🖤",
	white_heart: "🤍",
	broken_heart: "💔",
	two_hearts: "💕",
	sparkling_heart: "💖",
	heartpulse: "💗",
	cupid: "💘",
	gift_heart: "💝",
	hankey: "💩",
	100: "💯",
	anger: "💢",
	speech_balloon: "💬",
	thought_balloon: "💭",
	zzz: "💤",
	warning: "⚠️",
	no_entry: "⛔",
	no_entry_sign: "🚫",
	bangbang: "‼️",
	interrobang: "⁉️",
	question: "❓",
	grey_question: "❔",
	exclamation: "❗",
	grey_exclamation: "❕",
	white_check_mark: "✅",
	heavy_check_mark: "✔️",
	ballot_box_with_check: "☑️",
	x: "❌",
	negative_squared_cross_mark: "❎",
	heavy_plus_sign: "➕",
	heavy_minus_sign: "➖",
	heavy_multiplication_x: "✖️",
	heavy_division_sign: "➗",
	infinity: "♾️",
	recycle: "♻️",
	arrow_right: "➡️",
	arrow_left: "⬅️",
	arrow_up: "⬆️",
	arrow_down: "⬇️",
	arrow_right_hook: "↪️",
	leftwards_arrow_with_hook: "↩️",
	arrows_counterclockwise: "🔄",
	repeat: "🔁",
	back: "🔙",
	soon: "🔜",
	top: "🔝",
	new: "🆕",
	free: "🆓",
	ok: "🆗",
	sos: "🆘",
	up: "🆙",
	cool: "🆒",
	id: "🆔",
	vs: "🆚",
	abc: "🔤",
	1234: "🔢",
	symbols: "🔣",
	copyright: "©️",
	registered: "®️",
	tm: "™️",
	radioactive: "☢️",
	biohazard: "☣️",
	atom_symbol: "⚛️",
	wheelchair: "♿",
	no_smoking: "🚭",
	put_litter_in_its_place: "🚮",
	potable_water: "🚰",
	wc: "🚾",
	red_circle: "🔴",
	orange_circle: "🟠",
	yellow_circle: "🟡",
	green_circle: "🟢",
	large_blue_circle: "🔵",
	purple_circle: "🟣",
	black_circle: "⚫",
	white_circle: "⚪",
	red_square: "🟥",
	orange_square: "🟧",
	yellow_square: "🟨",
	green_square: "🟩",
	blue_square: "🟦",
	purple_square: "🟪",
	black_large_square: "⬛",
	white_large_square: "⬜",
	small_blue_diamond: "🔹",
	small_orange_diamond: "🔸",
	large_blue_diamond: "🔷",
	large_orange_diamond: "🔶",
	diamond_shape_with_a_dot_inside: "💠",
	triangular_flag_on_post: "🚩",
	checkered_flag: "🏁",
	crossed_flags: "🎌",
	black_flag: "🏴",
	white_flag: "🏳️",
	rainbow_flag: "🏳️‍🌈"
}, Ur = Object.entries(Hr).map(([e, t]) => ({
	name: e,
	char: t
})), Wr = /^:([a-z0-9_+-]+):/, Gr = /^\{\{emoji:([\w-]+)\}\}/, Kr = /^!\[([^\]]*)\]\(\s*asset:\/*([^\s/)]+)\s*\)\{(\d+)%\}?/, qr = "Emoji", X = `<${qr}`, Jr = /^(?:https?:|blob:|data:image\/|about:blank)/i, Yr = /^[\w-]+$/;
function Xr(e) {
	return e.includes("\"") && !e.includes("'") ? `'${e}'` : `"${e.replace(/"/g, "'")}"`;
}
function Zr(e) {
	let t = e.trim();
	return Jr.test(t) ? x(t) : "about:blank";
}
function Qr(e) {
	let t = [`id=${Xr(e.id)}`], n = e.alt?.trim();
	n && t.push(`alt=${Xr(n)}`);
	let r = e.widthPercent == null ? void 0 : ei(String(e.widthPercent));
	return r != null && t.push(`width=${Xr(`${r}%`)}`), e.align && t.push(`align=${Xr(e.align)}`), `<${qr} ${t.join(" ")} />`;
}
function $r(e, t, n) {
	return `${t.endsWith("\n\n") || t === "" ? "" : t.endsWith("\n") ? "\n" : "\n\n"}${e}${n.startsWith("\n\n") || n === "" ? "" : n.startsWith("\n") ? "\n" : "\n\n"}`;
}
function ei(e) {
	if (!e) return;
	let t = /^(\d+)%?$/.exec(e.trim());
	if (!t) return;
	let n = Number(t[1]);
	if (Number.isFinite(n)) return Math.max(1, Math.min(100, n));
}
function ti(e) {
	let t = e?.trim().toLowerCase();
	if (t === "left" || t === "center" || t === "right") return t;
}
function ni(e) {
	return !e || !/[\w-]/.test(e);
}
function Z(e, t) {
	let n = t;
	for (; n < e.length && /\s/.test(e[n]);) n++;
	return n;
}
function ri(e, t) {
	let n = e[t];
	if (n !== "\"" && n !== "'") return;
	let r = t + 1;
	for (; r < e.length && e[r] !== n;) r++;
	if (e[r] === n) return {
		value: e.slice(t + 1, r),
		end: r + 1
	};
}
function ii(e) {
	if (!e.startsWith(X) || !ni(e[X.length])) return;
	let t = {}, n = Z(e, X.length), r = !1;
	for (; n < e.length;) {
		if (n = Z(e, n), e.startsWith("/>", n)) {
			n += 2, r = !0;
			break;
		}
		if (e[n] === ">") {
			n = Z(e, n + 1);
			let t = `</${qr}>`;
			if (!e.startsWith(t, n)) return;
			n += t.length, r = !0;
			break;
		}
		let i = n;
		for (; n < e.length && /[\w-]/.test(e[n]);) n++;
		if (n === i) return;
		let a = e.slice(i, n);
		if (n = Z(e, n), e[n] !== "=") return;
		n = Z(e, n + 1);
		let o = ri(e, n);
		if (!o) return;
		t[a] = o.value, n = o.end;
	}
	if (!r) return;
	let i = t.id?.trim();
	if (i && Yr.test(i)) return {
		raw: e.slice(0, n),
		id: i,
		alt: t.alt?.trim() || void 0,
		widthPercent: ei(t.width),
		align: ti(t.align)
	};
}
function ai(e) {
	return e >= 97 && e <= 122 || e >= 48 && e <= 57 || e === 95 || e === 43 || e === 45;
}
function oi(e, t = 0) {
	let n = t;
	for (; n < e.length;) {
		let t = e.indexOf(":", n);
		if (t === -1) return;
		let r = t + 1;
		for (; r < e.length && ai(e.charCodeAt(r));) r++;
		if (r > t + 1 && e[r] === ":") return t;
		n = t + 1;
	}
}
function si(e, t = 0, n = e.length) {
	let r = t;
	for (;;) {
		let t = Ae(e, X, r, n);
		if (t === -1) return;
		if (ni(e[t + X.length])) return t;
		r = t + X.length;
	}
}
function ci(e) {
	let t = oi(e), n = e.indexOf("{{emoji:"), r = si(e), i = [
		t,
		n === -1 ? void 0 : n,
		r
	].filter((e) => e !== void 0);
	if (i.length) return Math.min(...i);
}
var li = 256;
function ui(e, t, n, r) {
	let i = x(t), a = x(n), o = Zr(e(t)), s = r == null ? void 0 : ei(String(r));
	return s == null ? `<img class="md-emoji" data-emoji-id="${i}" src="${o}" alt="${a}" />` : `<img class="md-asset-img" data-emoji-id="${i}" data-asset-id="${i}" src="${o}" alt="${a}" style="width:${s}%" />`;
}
function di(e, t, n) {
	let r = t, i = 0;
	for (; r < n && e[r] === " " && i < 3;) r++, i++;
	let a = e[r];
	if (a !== "`" && a !== "~") return null;
	let o = 0;
	for (; r + o < n && e[r + o] === a;) o++;
	return o >= 3 ? {
		char: a,
		length: o
	} : null;
}
function fi(e) {
	let t = S(e), n = "", r = 0, i = 0;
	for (; i <= t;) {
		let t = e.indexOf("\n", i), a = t === -1 ? e.length : t, o = di(e, i, a);
		if (n) o && o.char === n && o.length >= r && (n = "", r = 0);
		else if (o) n = o.char, r = o.length;
		else if (e.startsWith(X, i) && ni(e[i + X.length])) return i;
		if (t === -1) return;
		i = t + 1;
	}
}
function pi(e) {
	let t = ii(e);
	if (!t) return;
	let n = e.slice(t.raw.length), r = n.indexOf("\n"), i = r === -1 ? n : n.slice(0, r);
	if (i.trim() === "") return {
		tag: t,
		raw: t.raw + i + (r === -1 ? "" : "\n")
	};
}
function mi(e = {}) {
	let t = e.resolveUrl ?? (() => "about:blank");
	return { extensions: [
		{
			name: "emojiBlock",
			level: "block",
			start(e) {
				return fi(e);
			},
			tokenizer(e) {
				let t = pi(e);
				if (t) return {
					type: "emojiBlock",
					raw: t.raw,
					id: t.tag.id,
					name: t.tag.alt,
					widthPercent: t.tag.widthPercent,
					align: t.tag.align
				};
			},
			renderer: oe((e) => {
				let n = ui(t, e.id, e.name || `:${e.id}:`, e.widthPercent);
				return e.align ? `<p style="text-align:${e.align}">${n}</p>\n` : `<p>${n}</p>\n`;
			})
		},
		{
			name: "assetEmoji",
			level: "inline",
			start(e) {
				let t = e.indexOf("![");
				if (t !== -1 && Ae(e, "](asset:", t, t + li) !== -1) return t;
			},
			tokenizer(e) {
				let t = Kr.exec(e);
				if (!t) return;
				let n = t[2];
				if (!Yr.test(n)) return;
				let r = ei(t[3]);
				if (r != null) return {
					type: "assetEmoji",
					raw: t[0],
					name: t[1],
					id: n,
					widthPercent: r
				};
			},
			renderer: oe((e) => ui(t, e.id, e.name || `:${e.id}:`, e.widthPercent))
		},
		{
			name: "emoji",
			level: "inline",
			start(e) {
				return ci(e);
			},
			tokenizer(e) {
				let t = ii(e);
				if (t) return {
					type: "emoji",
					raw: t.raw,
					id: t.id,
					name: t.alt,
					widthPercent: t.widthPercent,
					text: t.raw
				};
				let n = Gr.exec(e);
				if (n) return {
					type: "emoji",
					raw: n[0],
					id: n[1],
					text: n[0]
				};
				let r = Wr.exec(e);
				if (!r) return;
				let i = Hr[r[1]];
				if (i) return {
					type: "emoji",
					raw: r[0],
					text: i
				};
			},
			renderer: g((e) => e.id ? ui(t, e.id, e.name || `:${e.id}:`, e.widthPercent) : e.text)
		}
	] };
}
function hi() {
	let e = /* @__PURE__ */ new Map();
	return {
		hooks: { preprocess(t) {
			return e.clear(), t;
		} },
		extensions: [{
			name: "footnoteDef",
			level: "block",
			start(e) {
				return e.startsWith("[^") ? 0 : void 0;
			},
			tokenizer(t) {
				let n = t.match(/^\[\^(.*)\]:(.*)/);
				if (n) {
					let [t, r, i] = n, a = e.size + 1;
					return e.set(r, {
						index: a,
						text: i
					}), {
						type: "footnoteDef",
						raw: t,
						fnId: r,
						index: a,
						text: i
					};
				}
			},
			renderer(t) {
				let { index: n, text: r, fnId: i } = t, a = `
                <code>${n}.</code> 
                <span>${r}</span> 
                    <a id="fnDef-${i}" href="#fnRef-${i}" style="color: var(--md-primary-color);">\u21A9\uFE0E</a>
                <br>`;
				return n === 1 ? `
            <p style="font-size: 80%;margin: 0.5em 8px;word-break:break-all;">${a}` : n === e.size ? `${a}</p>` : a;
			}
		}, {
			name: "footnoteRef",
			level: "inline",
			start(e) {
				let t = e.indexOf("[^");
				return t === -1 ? void 0 : t;
			},
			tokenizer(e) {
				let t = e.match(/^\[\^(.*?)\]/);
				if (t) {
					let [e, n] = t;
					return {
						type: "footnoteRef",
						raw: e,
						fnId: n
					};
				}
			},
			renderer(t) {
				let { fnId: n } = t, r = e.get(n);
				if (!r) return t.raw;
				let { index: i } = r;
				return `<sup style="color: var(--md-primary-color);">
                    <a href="#fnDef-${n}" id="fnRef-${n}">\[${i}\]</a>
                </sup>`;
			}
		}]
	};
}
var Q = w(50), gi = /* @__PURE__ */ new Map(), _i = /* @__PURE__ */ new Set(), vi = "```infographic", yi = /^```infographic\r?\n([\s\S]*?)\r?\n```/, bi = "infographic-", xi = "md-infographic-offscreen-root", Si = "800px", Ci = {
	theme: "default",
	colorBg: T.background,
	colorText: T.text,
	svgBackground: "transparent"
}, wi = {
	theme: "dark",
	colorBg: E.background,
	colorText: E.text,
	svgBackground: E.background
};
function Ti(e, t) {
	return _e(`${e}-${D(t)}-v2`);
}
function Ei(e) {
	let t = e?.themeMode === "dark" ? wi : Ci, n;
	return typeof window < "u" && (n = getComputedStyle(c()?.root.querySelector("#output") ?? document.documentElement).getPropertyValue("--md-primary-color").trim() || void 0), {
		theme: t.theme,
		svgBackground: t.svgBackground,
		themeConfig: {
			colorPrimary: n,
			colorBg: t.colorBg,
			colorText: t.colorText
		}
	};
}
function Di(e) {
	return typeof e == "function" ? e() : e;
}
function Oi() {
	let e = o(xi);
	return e || (e = document.createElement("div"), e.id = xi, e.style.cssText = `position:fixed;left:-9999px;top:0;width:${Si};visibility:hidden;pointer-events:none;overflow:hidden;`, a(e)), e;
}
function ki(e) {
	let t = document.createElement("div");
	return t.replaceChildren(e), t.innerHTML;
}
function Ai(e, t) {
	let n = o(`${bi}${e}`);
	n && (n.innerHTML = t, n.setAttribute(_, v.ready));
}
function ji(e, t, n) {
	let r = o(e);
	if (!r) return;
	let i = t instanceof Error ? t.message : String(t);
	r.innerHTML = `<div style="color: red; padding: 10px; border: 1px solid red;">${fe(b(n).infographicError, i)}</div>`, r.setAttribute(_, v.error);
}
async function Mi(e, n) {
	let r = Ti(e, n?.themeMode), i = Q.get(r);
	if (i) return i;
	let a = c(), o, l = () => {
		o?.destroy(), u.remove();
	}, u = document.createElement("div");
	a?.cleanups.add(l), u.style.width = Si, Oi().appendChild(u);
	try {
		let { Infographic: i, setDefaultFont: c, setFontExtendFactor: l, exportToSVG: d } = await import("./esm-CpymJYxv.js");
		if (!t(a)) throw Error("稿件已关闭");
		l(1.1), c("-apple-system-font, \"system-ui\", \"Helvetica Neue\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei UI\", \"Microsoft YaHei\", Arial, sans-serif");
		let { theme: f, svgBackground: p, themeConfig: m } = Ei(n);
		return await s(a, new Promise((n, s) => {
			let c = new i({
				container: u,
				svg: {
					style: {
						width: "100%",
						height: "100%",
						background: p
					},
					background: !1
				},
				theme: f,
				themeConfig: m
			});
			o = c, c.on("loaded", ({ node: e }) => {
				t(a) && d(e, { removeIds: !0 }).then((e) => {
					if (!t(a)) return;
					let i = ki(e);
					Q.set(r, i), n(i);
				}).catch(s);
			});
			try {
				c.render(e);
			} catch (e) {
				s(e);
			}
		}));
	} finally {
		l(), a?.cleanups.delete(l);
	}
}
async function Ni(e, n, r, i) {
	if (typeof window > "u") return;
	let a = c();
	if (!t(a)) return;
	gi.set(r, {
		code: n,
		options: i
	});
	let o = Q.get(r);
	if (o) {
		Ai(r, o);
		return;
	}
	if (_i.has(r)) return;
	_i.add(r);
	let s = () => {
		_i.delete(r), gi.delete(r);
	};
	a?.cleanups.add(s);
	try {
		let e = await Mi(n, i);
		t(a) && Ai(r, e);
	} catch (n) {
		if (!t(a)) return;
		console.error("Failed to render Infographic:", n), ji(e, n, i?.diagramMessages);
	} finally {
		_i.delete(r), a?.cleanups.delete(s);
	}
}
function Pi(e, t) {
	typeof window < "u" && e.querySelectorAll(".infographic-diagram").forEach((e) => {
		if (e.querySelector("svg, img") || e.getAttribute(_) === v.error) return;
		let n = e.id;
		if (!n?.startsWith(bi)) return;
		let r = n.slice(bi.length), i = Q.get(r);
		if (i) {
			e.innerHTML = i;
			return;
		}
		let a = gi.get(r);
		a && Ni(n, a.code, r, t ?? a.options);
	});
}
function Fi(e) {
	let t = "infographic-diagram";
	return {
		extensions: [{
			name: "infographic",
			level: "block",
			start(e) {
				return Te(e, vi, S(e));
			},
			tokenizer(e) {
				let t = yi.exec(e);
				if (t) return {
					type: "infographic",
					raw: t[0],
					text: t[1].trim()
				};
			},
			renderer: g((n) => {
				let r = n.text, i = Di(e), a = Ti(r, i?.themeMode), o = Q.get(a);
				if (o) return `<!--infographic-start--><div class="${t}" style="width: 100%;">${o}</div><!--infographic-end-->`;
				let s = `${bi}${a}`;
				Ni(s, r, a, i);
				let c = b(i?.diagramMessages);
				return `<!--infographic-start--><div id="${s}" class="${t}" style="width: 100%;" ${y(v.loading)}>${c.infographicLoading}</div><!--infographic-end-->`;
			})
		}],
		walkTokens(e) {
			le(e) && e.lang === "infographic" && ue(e, "infographic");
		}
	};
}
var Ii = "Loading formula…", Li = new C(400);
function Ri() {
	Li.clear();
}
var zi = !1;
function Bi() {
	A() || zi || (zi = !0, Vt().catch((e) => {
		zi = !1, console.error(e);
	}));
}
function Vi(e, t = !0, n) {
	return (r) => {
		let i = r.displayMode ?? e, a = x(r.raw ?? r.text), o = `${i ? "1" : "0"}\u0000${t ? "1" : "0"}\u0000${a}\u0000${r.text}`, s = Li.get(o);
		if (s !== void 0) return s;
		if (typeof window > "u" || !A()) return Bi(), i ? `<section class="katex-block katex-pending" data-math-display="true" data-math-raw="${a}"><span>${x(n?.() || Ii)}</span></section>` : `<span class="katex-inline katex-pending" data-math-display="false" data-math-raw="${a}"><span>…</span></span>`;
		window.MathJax.texReset();
		let c = window.MathJax.tex2svg(r.text, { display: i }).firstChild, l = c.style["min-width"] || c.getAttribute("width");
		c.removeAttribute("width"), t && (c.style.display = "initial", c.style.setProperty("max-width", "300vw", "important"), c.style.flexShrink = "0", c.style.width = l || "");
		let u = c.querySelector("g");
		u && (u.style.fill = "currentColor", u.style.stroke = "currentColor", u.setAttribute("fill", "currentColor"), u.setAttribute("stroke", "currentColor"));
		let d = i ? `<section class="katex-block" data-math-display="true" data-math-raw="${a}">${c.outerHTML}</section>` : `<span class="katex-inline" data-math-display="false" data-math-raw="${a}">${c.outerHTML}</span>`;
		return Li.set(o, d), d;
	};
}
function Hi(e, t) {
	let n = e && e.nonStandard, r = n ? ot : at;
	return {
		name: "inlineKatex",
		level: "inline",
		start(e) {
			return xt(e, !!n, r);
		},
		tokenizer(e) {
			let t = e.match(r);
			if (t) return {
				type: "inlineKatex",
				raw: t[0],
				text: t[2].trim(),
				displayMode: t[1].length === 2
			};
		},
		renderer: se(t)
	};
}
function Ui(e, t) {
	return {
		name: "blockKatex",
		level: "block",
		start(e) {
			return Ee(e, "$$", 3, S(e));
		},
		tokenizer(e) {
			let t = lt(e);
			if (t) return {
				type: "blockKatex",
				raw: t[0],
				text: t[2].trim(),
				displayMode: !0
			};
		},
		renderer: se(t)
	};
}
function Wi(e, t) {
	return {
		name: "inlineLatexKatex",
		level: "inline",
		start(e) {
			let t = e.indexOf("\\(");
			return t === -1 ? void 0 : t;
		},
		tokenizer(e) {
			let t = e.match(mt);
			if (t) return {
				type: "inlineLatexKatex",
				raw: t[0],
				text: t[1].trim(),
				displayMode: !1
			};
		},
		renderer: se(t)
	};
}
function Gi(e, t) {
	return {
		name: "blockLatexKatex",
		level: "block",
		start(e) {
			let t = e.indexOf("\\[");
			return t === -1 ? void 0 : t;
		},
		tokenizer(e) {
			let t = e.match(ht);
			if (t) return {
				type: "blockLatexKatex",
				raw: t[0],
				text: t[1].trim(),
				displayMode: !0
			};
		},
		renderer: se(t)
	};
}
function Ki(e, t = !0) {
	let n = e?.getKatexLoadingMessage;
	return { extensions: [
		Hi(e, Vi(!1, t, n)),
		Ui(e, Vi(!0, t, n)),
		Wi(e, Vi(!1, t, n)),
		Gi(e, Vi(!0, t, n))
	] };
}
var qi = /[A-Z0-9]/i;
function Ji(e) {
	let t = e?.[e.length - 1];
	if (!t) return "";
	let n = t.tokens;
	if (Array.isArray(n) && n.length > 0) return Ji(n);
	let r = t.text ?? t.raw ?? "";
	return r.charAt(r.length - 1);
}
function Yi(e) {
	return qi.test(Ji(e));
}
function Xi(e, t) {
	let n = 0;
	for (;;) {
		let r = e.indexOf(t, n);
		if (r === -1) return;
		if (e[r + t.length] === t[0]) {
			n = r + 1;
			continue;
		}
		if (!qi.test(e.charAt(r - 1))) return r;
		n = r + t.length;
	}
}
function Zi() {
	return { extensions: [
		{
			name: "markup_highlight",
			level: "inline",
			start(e) {
				return Xi(e, "==");
			},
			tokenizer(e, t) {
				if (Yi(t)) return;
				let n = /^==(?=\S)((?:[^=]|=(?!=))*[^\s=])==/.exec(e);
				if (n) return {
					type: "markup_highlight",
					raw: n[0],
					text: n[1]
				};
			},
			renderer: g((e) => `<span class="markup-highlight">${e.text}</span>`)
		},
		{
			name: "markup_underline",
			level: "inline",
			start(e) {
				return Xi(e, "++");
			},
			tokenizer(e, t) {
				if (Yi(t)) return;
				let n = /^\+\+(?=\S)((?:[^+]|\+(?!\+))*[^\s+])\+\+/.exec(e);
				if (n) return {
					type: "markup_underline",
					raw: n[0],
					text: n[1]
				};
			},
			renderer: g((e) => `<span class="markup-underline">${e.text}</span>`)
		},
		{
			name: "markup_wavyline",
			level: "inline",
			start(e) {
				return Xi(e, "~");
			},
			tokenizer(e, t) {
				if (Yi(t)) return;
				let n = /^~(?=\S)([^~\n]*[^\s~])~(?!~)/.exec(e);
				if (n) return {
					type: "markup_wavyline",
					raw: n[0],
					text: n[1]
				};
			},
			renderer: g((e) => `<span class="markup-wavyline">${e.text}</span>`)
		},
		{
			name: "markup_superscript",
			level: "inline",
			start(e) {
				let t = e.indexOf("^");
				return t === -1 ? void 0 : t;
			},
			tokenizer(e) {
				let t = /^\^([^\s^]+)\^/.exec(e);
				if (t) return {
					type: "markup_superscript",
					raw: t[0],
					text: t[1]
				};
			},
			renderer: g((e) => `<sup class="markup-superscript">${e.text}</sup>`)
		}
	] };
}
var Qi = w(50);
function $(e) {
	return e < 10 ? String.fromCharCode(48 + e) : (e -= 10, e < 26 ? String.fromCharCode(65 + e) : (e -= 26, e < 26 ? String.fromCharCode(97 + e) : (e -= 26, e === 0 ? "-" : e === 1 ? "_" : "?")));
}
function $i(e, t, n) {
	let r = e >> 2, i = (e & 3) << 4 | t >> 4, a = (t & 15) << 2 | n >> 6, o = n & 63, s = "";
	return s += $(r & 63), s += $(i & 63), s += $(a & 63), s += $(o & 63), s;
}
function ea(e) {
	let t = "";
	for (let n = 0; n < e.length; n += 3) n + 2 === e.length ? t += $i(e.charCodeAt(n), e.charCodeAt(n + 1), 0) : n + 1 === e.length ? t += $i(e.charCodeAt(n), 0, 0) : t += $i(e.charCodeAt(n), e.charCodeAt(n + 1), e.charCodeAt(n + 2));
	return t;
}
function ta(e) {
	try {
		let t = new TextEncoder().encode(e), n = ae(t, { level: 9 });
		return String.fromCharCode(...n);
	} catch (t) {
		return console.warn("Deflate compression failed:", t), e;
	}
}
function na(e) {
	try {
		return ea(ta(e));
	} catch (t) {
		console.warn("PlantUML encoding failed, using fallback:", t);
		let n = new TextEncoder().encode(e);
		return `~1${btoa(String.fromCharCode(...n)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")}`;
	}
}
function ra(e, t) {
	let n = na(e), r = t.format === "svg" ? "svg" : "png";
	return `${t.serverUrl}/${r}/${n}`;
}
function ia(e, t) {
	return Pe(e, t);
}
function aa(e, t) {
	return _e(`${e}-${je(t)}`);
}
function oa(e, t, n = !1) {
	return ua("", t, e, n);
}
function sa(e, t) {
	let n = Qi.get(e);
	return n ? pe(n) ? oa(n, t) : n : null;
}
function ca(e, r, i) {
	let { text: a } = e, o = b(r.getDiagramMessages?.()), s = r.getThemeMode?.(), l = ra(ia(a, s), r);
	if (r.inlineSvg && r.format === "svg") {
		let e = `plantuml-${i}`, a = c();
		la(l, o.plantumlError, a?.signal).then((o) => {
			if (!t(a)) return;
			let s = n(`[data-placeholder="${e}"]`);
			if (s) {
				let e = !pe(o);
				e || Qi.set(i, o), s.outerHTML = oa(o, r, e);
			}
		});
		let s = r.styles.container ? Object.entries(r.styles.container).map(([e, t]) => `${e.replace(/([A-Z])/g, "-$1").toLowerCase()}: ${t}`).join("; ") : "";
		return `<div class="${r.className}" style="${s}" data-placeholder="${e}" ${y(v.loading)}>
      <div style="color: #666; font-style: italic;">${o.plantumlLoading}</div>
    </div>`;
	}
	return ua(l, r);
}
async function la(e, t, n) {
	try {
		let t = await fetch(e, { signal: n });
		if (!t.ok) throw Error(`HTTP ${t.status}`);
		return (await t.text()).replace(/(<svg[^>]*)\swidth="[^"]*"/g, "$1").replace(/(<svg[^>]*)\sheight="[^"]*"/g, "$1").replace(/(<svg[^>]*style="[^"]*?)width:[^;]*;?/g, "$1").replace(/(<svg[^>]*style="[^"]*?)height:[^;]*;?/g, "$1").replace(/preserveAspectRatio="none"/g, "preserveAspectRatio=\"xMidYMid meet\"");
	} catch (n) {
		return console.warn(`Failed to fetch SVG content from ${e}:`, n), `<div style="color: #666; font-style: italic;">${t}</div>`;
	}
}
function ua(e, t, n, r = !1) {
	let i = t.styles.container ? Object.entries(t.styles.container).map(([e, t]) => `${e.replace(/([A-Z])/g, "-$1").toLowerCase()}: ${t}`).join("; ") : "";
	if (n) {
		let e = r ? v.error : v.ready;
		return `<div class="${t.className}" style="${i}" ${y(e)}>
      ${n}
    </div>`;
	}
	return `<div class="${t.className}" style="${i}" ${y(v.ready)}>
    <img src="${e}" alt="PlantUML Diagram" style="max-width: 100%; height: auto;" />
  </div>`;
}
function da(e = {}) {
	let t = {
		serverUrl: e.serverUrl || "https://www.plantuml.com/plantuml",
		format: e.format || "svg",
		className: e.className || "plantuml-diagram",
		inlineSvg: e.inlineSvg || !1,
		getDiagramMessages: e.getDiagramMessages,
		styles: { container: {
			textAlign: "center",
			margin: "16px 8px",
			overflowX: "auto",
			...e.styles?.container
		} }
	};
	return {
		extensions: [{
			name: "plantuml",
			level: "block",
			start(e) {
				return Te(e, "```plantuml", S(e));
			},
			tokenizer(e) {
				let t = /^```plantuml\r?\n([\s\S]*?)\r?\n```/.exec(e);
				if (t) {
					let [e, n] = t;
					return {
						type: "plantuml",
						raw: e,
						text: n.trim()
					};
				}
			},
			renderer: g((e) => {
				let n = t.getThemeMode?.(), r = aa(e.text, n);
				return sa(r, t) || ca(e, t, r);
			})
		}],
		walkTokens(e) {
			le(e) && e.lang === "plantuml" && ue(e, "plantuml");
		}
	};
}
function fa() {
	return { extensions: [{
		name: "ruby",
		level: "inline",
		start(e) {
			let t = e.indexOf("[");
			return t === -1 ? void 0 : t;
		},
		tokenizer(e) {
			let t = /^\[([^\]]+)\]\{([^}]+)\}/.exec(e);
			if (t) return {
				type: "ruby",
				raw: t[0],
				text: t[1].trim(),
				ruby: t[2].trim(),
				format: "basic"
			};
			if (t = /^\[([^\]]+)\]\^\(([^)]+)\)/.exec(e), t) return {
				type: "ruby",
				raw: t[0],
				text: t[1].trim(),
				ruby: t[2].trim(),
				format: "basic-hat"
			};
		},
		renderer: g((e) => {
			let { text: t, ruby: n, format: r } = e, i = /[・．。-]/g;
			if (i.test(n)) {
				let e = n.split(i).filter((e) => e.trim() !== ""), a = t.split(""), o = [];
				if (a.length >= e.length) {
					let t = 0;
					for (let n = 0; n < e.length; n++) {
						let i = e[n], s = a.length - t, c = e.length - n, l = 1;
						c === 1 && (l = s);
						let u = a.slice(t, t + l).join("");
						o.push(`<ruby data-text="${u}" data-ruby="${i}" data-format="${r}">${u}<rp>(</rp><rt>${i}</rt><rp>)</rp></ruby>`), t += l;
					}
					t < a.length && o.push(a.slice(t).join(""));
				} else for (let t = 0; t < a.length; t++) {
					let n = a[t], i = e[t] || "";
					i ? o.push(`<ruby data-text="${n}" data-ruby="${i}" data-format="${r}">${n}<rp>(</rp><rt>${i}</rt><rp>)</rp></ruby>`) : o.push(n);
				}
				return o.join("");
			}
			return `<ruby data-text="${t}" data-ruby="${n}" data-format="${r}">${t}<rp>(</rp><rt>${n}</rt><rp>)</rp></ruby>`;
		})
	}] };
}
function pa() {
	return { extensions: [{
		name: "horizontalSlider",
		level: "block",
		start(e) {
			return e.startsWith("<![") ? 0 : void 0;
		},
		tokenizer(e) {
			let t = e.match(/^<(!\[.*?\]\(.*?\)(?:,!\[.*?\]\(.*?\))*)>/);
			if (t) return {
				type: "horizontalSlider",
				raw: t[0],
				text: t[1]
			};
		},
		renderer(e) {
			let { text: t } = e, n = t.match(/!\[(.*?)\]\((.*?)\)/g) || [];
			return n.length === 0 ? "" : `
            <section style="box-sizing: border-box; font-size: 16px;">
              <section data-role="outer" style="font-family: 微软雅黑; font-size: 16px;">
                <section data-role="paragraph" style="margin: 0px auto; box-sizing: border-box; width: 100%;">
                  <section style="margin: 0px auto; text-align: center;">
                    <section style="display: inline-block; width: 100%;">
                      <!-- WeChat-compatible horizontal scroll image container -->
                      <section style="overflow-x: scroll; -webkit-overflow-scrolling: touch; white-space: nowrap; width: 100%; text-align: center;">
                        ${n.map((e) => {
				let t = e.match(/!\[(.*?)\]/) || [], n = e.match(/\]\((.*?)\)/) || [], r = t[1] || "";
				return {
					src: n[1] || "",
					alt: r
				};
			}).map((e, t) => `<section style="display: inline-block; width: 100%; margin-right: 0; vertical-align: top;">
                          <img src="${e.src}" alt="${e.alt}" title="${e.alt}" style="width: 100%; height: auto; border-radius: 4px; vertical-align: top;"/>
                          <p style="margin-top: 5px; font-size: 14px; color: #666; text-align: center; white-space: normal;">${e.alt}</p>
                        </section>`).join("")}
                      </section>
                    </section>
                  </section>
                </section>
              </section>
              <p style="font-size: 14px; color: #999; text-align: center; margin-top: 5px;"><<< 左右滑动看更多 >>></p>
            </section>
          `;
		}
	}] };
}
function ma() {
	let e = [];
	return {
		hooks: { preprocess(t) {
			return e = [], t;
		} },
		walkTokens(t) {
			if (t.type === "heading") {
				let n = t.text || "", r = t.depth || 1, i = e.length;
				e.push({
					text: n,
					depth: r,
					index: i
				});
			}
		},
		extensions: [{
			name: "toc",
			level: "block",
			start(e) {
				return ke(e, "[TOC]", S(e));
			},
			tokenizer(e) {
				let t = /^\[TOC\]/.exec(e);
				if (t) return {
					type: "toc",
					raw: t[0]
				};
			},
			renderer() {
				let t = e.filter((e) => e.depth !== 1);
				if (!t.length) return "";
				let n = Math.min(...t.map((e) => e.depth)), r = `<nav class="markdown-toc"><ul class="toc-ul toc-level-${n} pl-4 border-l ml-2">`, i = n;
				t.forEach(({ text: e, depth: t, index: n }) => {
					if (t > i) for (let e = i + 1; e <= t; e++) r += `<ul class="toc-ul toc-level-${e} pl-4 border-l ml-2">`;
					else if (t < i) for (let e = i; e > t; e--) r += "</ul>";
					r += `<li class="toc-li toc-level-${t} mb-1"><a class="text-gray-700 hover:text-blue-600 underline transition-colors" href="#${n}">${e}</a></li>`, i = t;
				});
				for (let e = i; e > 1; e--) r += "</ul>";
				return r += "</ul></nav>", r;
			}
		}]
	};
}
var ha = /* @__PURE__ */ e({
	BUILT_IN_COMPONENTS: () => wr,
	DIAGRAM_DARK_COLORS: () => E,
	DIAGRAM_LIGHT_COLORS: () => T,
	GITHUB_EMOJI_LIST: () => Ur,
	INLINE_SYSTEM_COMPONENT_NAMES: () => Tr,
	MDKatex: () => Ki,
	clearMathSvgCache: () => Ri,
	createSyntaxPattern: () => Cr,
	diagramCacheThemeSuffix: () => je,
	formatEmojiSnippet: () => Qr,
	getBuiltInRegistry: () => zr,
	getMermaidThemeConfig: () => Fe,
	hydratePendingInfographicDiagrams: () => Pi,
	initializeMermaid: () => ze,
	injectPlantUmlTheme: () => Pe,
	isInlineSystemComponent: () => Er,
	markedAlert: () => vr,
	markedComponent: () => Vr,
	markedEmoji: () => mi,
	markedFootnotes: () => hi,
	markedInfographic: () => Fi,
	markedMarkup: () => Zi,
	markedMermaid: () => Ge,
	markedPlantUML: () => da,
	markedRuby: () => fa,
	markedSlider: () => pa,
	markedToc: () => ma,
	padEmojiBlock: () => $r,
	parseEmojiTag: () => ii,
	previewComponent: () => Ir,
	resolveDiagramThemeMode: () => D,
	resolveVariants: () => Sr,
	setComponentRegistry: () => Rr
});
async function ga(e) {
	let t = new gr();
	return t.use(vr({ withoutStyle: !0 })), t.use(Ki({ nonStandard: !0 }, !1)), await t.parse(e);
}
var _a = /* @__PURE__ */ e({
	COMMON_LANGUAGES: () => Ke,
	DEFAULT_DIAGRAM_MESSAGES: () => de,
	LRUMap: () => C,
	MATHJAX_CDN_URL: () => jt,
	MATHJAX_LOCAL_URL: () => Mt,
	MATHJAX_READY_EVENT: () => Ft,
	MD_DIAGRAM_STATE: () => v,
	MD_DIAGRAM_STATE_ATTR: () => _,
	blockLatexRule: () => ht,
	blockRuleMultiline: () => st,
	blockRuleSingleLine: () => ct,
	clearHighlightCache: () => tt,
	contentHasMath: () => St,
	createSVGCache: () => w,
	diagramStateAttr: () => y,
	ensureMathJaxLoaded: () => Vt,
	escapeHtml: () => x,
	findInlineKatexStart: () => xt,
	formatDiagramMessage: () => fe,
	generatePureHTML: () => ga,
	highlightAndFormatCode: () => et,
	highlightCodeBlock: () => nt,
	highlightPendingBlocks: () => rt,
	initializeMermaid: () => ze,
	inlineLatexRule: () => mt,
	inlineRule: () => at,
	inlineRuleNonStandard: () => ot,
	isAsyncDiagramPending: () => me,
	isMathJaxReady: () => A,
	isSvgMarkup: () => pe,
	loadAndRegisterLanguage: () => Xe,
	loadMathJax: () => Bt,
	matchBlockKatex: () => lt,
	modifyHtmlContent: () => At,
	postProcessHtml: () => kt,
	renderMarkdown: () => Ot,
	resolveDiagramMessages: () => b,
	sanitizeHtml: () => Dt,
	simpleHash: () => _e,
	stripBreakBeforeInlineKatex: () => Ct,
	ucfirst: () => he,
	unescapeHtml: () => ge
});
export { v as A, kt as C, et as D, Ke as E, me as M, Ge as O, Bt as S, St as T, Vr as _, pa as a, Ft as b, Zi as c, Fi as d, hi as f, Er as g, zr as h, ma as i, _ as j, x as k, Ki as l, wr as m, ga as n, fa as o, mi as p, ha as r, da as s, _a as t, Pi as u, vr as v, Ot as w, A as x, gr as y };
