import { C as e, D as t, H as n, I as r, T as i, W as a, X as o, Z as s, b as c, dt as l, et as u, h as d, ot as ee, tt as te, u as ne, w as f, wt as p, x as re, xt as m, y as h, yt as g } from "./vendor_vue-OlfIOlFg.js";
import { h as _ } from "./render-C0-GwsvR.js";
import { n as v } from "./vue-i18n-8AnKzzG6.js";
import { n as y } from "./lib-DIiEqr8B.js";
import { n as ie } from "./editor-VmYacIt-.js";
import { S as ae, k as oe, x as se } from "./utils-D7O4F-LG.js";
import { t as ce } from "./Button-B4kIEl6s.js";
import { a as le, i as ue, n as de, r as fe, t as b } from "./DialogTitle-w1SUV50e.js";
import { n as x, t as S } from "./formula-BY10rzjJ.js";
import { t as C } from "./DialogFooter-99Z6qvPr.js";
var w = { class: "flex-1 min-h-0 overflow-y-auto lg:overflow-hidden grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-0" }, T = { class: "lg:min-h-0 border-b lg:border-b-0 lg:border-r p-6 space-y-4 lg:overflow-hidden flex flex-col" }, E = { class: "space-y-2" }, D = { class: "flex items-center justify-between gap-3 flex-wrap" }, O = { class: "text-sm font-medium" }, k = { class: "inline-flex rounded-md border overflow-hidden" }, A = ["placeholder"], j = { class: "space-y-2 lg:flex-1 lg:min-h-0 flex flex-col" }, M = { class: "text-sm font-medium" }, N = { class: "rounded-lg border bg-muted/30 p-4 overflow-x-auto min-h-28 flex-1 flex items-center" }, P = ["innerHTML"], F = { class: "lg:min-h-0 p-6 space-y-4 lg:overflow-hidden bg-muted/20 flex flex-col" }, I = { class: "space-y-2 flex-shrink-0" }, L = { class: "text-sm font-medium" }, R = { class: "flex flex-wrap gap-2" }, z = ["onClick"], pe = { class: "lg:min-h-0 lg:flex-1 lg:overflow-y-auto rounded-lg border bg-background p-3" }, B = { class: "grid grid-cols-2 xl:grid-cols-3 gap-2 content-start" }, me = ["onClick"], he = ["innerHTML"], V = /* @__PURE__ */ t({
	__name: "FormulaEditorDialog",
	setup(t) {
		let { t: V } = v(), H = _(), U = ie(), W = l(""), G = l(!1), K = o("latexInputRef"), q = [
			{
				key: "basic",
				items: [
					"x^2+y^2=z^2",
					"\\frac{a}{b}",
					"\\sqrt{x}",
					"\\sqrt[n]{x}",
					"\\sum_{i=1}^{n} i",
					"\\prod_{i=1}^{n} i",
					"\\int_0^1 x\\,dx",
					"\\lim_{x\\to 0}\\frac{\\sin x}{x}"
				]
			},
			{
				key: "greek",
				items: [
					"\\alpha",
					"\\beta",
					"\\gamma",
					"\\delta",
					"\\theta",
					"\\lambda",
					"\\mu",
					"\\omega"
				]
			},
			{
				key: "relation",
				items: [
					"a=b",
					"a\\neq b",
					"a\\leq b",
					"a\\geq b",
					"a\\approx b",
					"a\\sim b",
					"a\\equiv b",
					"a\\propto b"
				]
			},
			{
				key: "symbol",
				items: [
					"\\infty",
					"\\partial",
					"\\nabla",
					"\\pm",
					"\\times",
					"\\div",
					"\\cdot",
					"\\angle"
				]
			},
			{
				key: "logic",
				items: [
					"p\\land q",
					"p\\lor q",
					"\\neg p",
					"p\\Rightarrow q",
					"p\\Leftrightarrow q",
					"x\\in A",
					"x\\notin A",
					"A\\subseteq B"
				]
			},
			{
				key: "matrix",
				items: [
					"\\begin{bmatrix}a & b\\\\c & d\\end{bmatrix}",
					"\\begin{pmatrix}1 & 0\\\\0 & 1\\end{pmatrix}",
					"\\begin{cases}a & x>0\\\\b & x\\le 0\\end{cases}",
					"\\begin{aligned}a&=b+c\\\\d&=e+f\\end{aligned}",
					"\\begin{vmatrix}a & b\\\\c & d\\end{vmatrix}",
					"\\begin{matrix}1 & 2\\\\3 & 4\\end{matrix}"
				]
			},
			{
				key: "algebra",
				items: [
					"\\left(x-1\\right)\\left(x+3\\right)",
					"x=a_0+\\frac{1}{a_1+\\frac{1}{a_2}}",
					"\\binom{n}{k}",
					"\\frac{d}{dx}\\left(x^n\\right)=nx^{n-1}",
					"x_{n+1}=x_n-\\frac{f(x_n)}{f'(x_n)}"
				]
			},
			{
				key: "calculus",
				items: [
					"\\frac{dy}{dx}",
					"\\int_a^b f(x)\\,dx",
					"\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx",
					"\\sum_{n=1}^{\\infty} \\frac{1}{n^2}",
					"\\lim_{x\\to\\infty} \\left(1+\\frac{1}{x}\\right)^x"
				]
			},
			{
				key: "statistics",
				items: [
					"\\mathbb{E}[X]",
					"\\mathrm{Var}(X)",
					"P(A\\mid B)",
					"\\binom{n}{k}p^k(1-p)^{n-k}",
					"\\sum_i p_i = 1"
				]
			},
			{
				key: "set",
				items: [
					"A\\cup B",
					"A\\cap B",
					"A\\setminus B",
					"A\\subset B",
					"A\\subseteq B",
					"A\\supseteq B"
				]
			},
			{
				key: "trigonometry",
				items: [
					"\\sin\\theta",
					"\\cos\\theta",
					"\\tan\\theta",
					"\\cot\\theta",
					"\\arcsin x",
					"\\cos^2\\theta+\\sin^2\\theta=1"
				]
			},
			{
				key: "physics",
				items: [
					"E=mc^2",
					"F=ma",
					"p=mv",
					"V=IR",
					"s=ut+\\frac{1}{2}at^2",
					"\\Delta E = Q - W"
				]
			},
			{
				key: "chemistry",
				items: [
					"2H_2 + O_2 \\rightarrow 2H_2O",
					"A\\underset{b}{\\overset{a}{\\rightleftharpoons}}B",
					"\\mathrm{CO_2 + H_2O \\rightarrow H_2CO_3}",
					"\\mathrm{CH_4 + 2O_2 \\rightarrow CO_2 + 2H_2O}",
					"\\mathrm{NaOH + HCl \\rightarrow NaCl + H_2O}"
				]
			}
		], J = l(q[0].key), Y = h(() => q.find((e) => e.key === J.value) ?? q[0]);
		function X(e, t) {
			if (!se()) return `<div class="text-sm text-muted-foreground">${V("formula.loadingEngine")}</div>`;
			try {
				window.MathJax.texReset();
				let n = window.MathJax.tex2svg(e, { display: t }).firstChild;
				return n.style.display = t ? "block" : "initial", n.style.setProperty("max-width", "300vw", "important"), n.style.flexShrink = "0", n.outerHTML;
			} catch {
				return `<div class="text-sm text-destructive break-all">${oe(e)}</div>`;
			}
		}
		let Z = /* @__PURE__ */ new Map();
		function Q(e) {
			if (!G.value) return `<div class="text-sm text-muted-foreground">${V("formula.loadingEngine")}</div>`;
			let t = Z.get(e);
			if (t) return t;
			let n = X(e, !1);
			return Z.set(e, n), n;
		}
		let ge = h(() => {
			if (!G.value) return `<div class="text-sm text-muted-foreground">${V("formula.loadingEngine")}</div>`;
			let e = W.value.trim();
			return e ? X(e, H.formulaEditorDisplayMode) : `<div class="text-sm text-muted-foreground">${V("formula.previewEmpty")}</div>`;
		});
		s(() => H.isShowFormulaEditorDialog, async (e) => {
			if (!e) {
				G.value = !1, Z.clear();
				return;
			}
			try {
				await ae(), Z.clear(), G.value = !0;
			} catch {
				G.value = !1;
			}
			let t = S(H.formulaEditorValue);
			W.value = t.latex || H.formulaEditorValue, H.formulaEditorDisplayMode = H.formulaEditorDisplayMode || t.displayMode, J.value = q[0].key, await r(), K.value?.focus();
		}, { immediate: !0 });
		function _e(e) {
			e || H.closeFormulaEditor();
		}
		function ve() {
			W.value.includes("\n") && (H.formulaEditorDisplayMode = !0);
		}
		function ye(e) {
			let t = K.value;
			if (!t) {
				W.value += e;
				return;
			}
			let n = t.selectionStart ?? W.value.length, i = t.selectionEnd ?? n;
			W.value = `${W.value.slice(0, n)}${e}${W.value.slice(i)}`, r(() => {
				t.focus();
				let r = n + e.length;
				t.setSelectionRange(r, r);
			});
		}
		function be() {
			let e = W.value.trim();
			if (!e) {
				y.error(V("formula.contentRequired"));
				return;
			}
			let t = x(e, H.formulaEditorDisplayMode);
			H.formulaEditorSourceRaw && U.replaceText(H.formulaEditorSourceRaw, t) || U.replaceSelection(t), y.success(V("formula.insertSuccess")), H.closeFormulaEditor();
		}
		function $(e) {
			H.formulaEditorDisplayMode = e;
		}
		function xe(e) {
			J.value = e;
		}
		return (t, r) => {
			let o = b, s = de, l = fe, h = ce, _ = C, v = ue, y = le;
			return n(), re(y, {
				open: g(H).isShowFormulaEditorDialog,
				"onUpdate:open": _e
			}, {
				default: u(() => [i(v, { class: "sm:max-w-6xl max-h-[94vh] overflow-hidden flex flex-col p-0" }, {
					default: u(() => [
						i(l, { class: "px-6 pt-6 pb-3 border-b" }, {
							default: u(() => [i(o, null, {
								default: u(() => [f(p(g(V)("formula.title")), 1)]),
								_: 1
							}), i(s, null, {
								default: u(() => [f(p(g(V)("formula.description")), 1)]),
								_: 1
							})]),
							_: 1
						}),
						c("div", w, [c("div", T, [c("div", E, [c("div", D, [c("label", O, p(g(V)("formula.latexInput")), 1), c("div", k, [c("button", {
							type: "button",
							class: m(["px-3 py-1.5 text-sm transition-colors", g(H).formulaEditorDisplayMode ? "bg-transparent text-muted-foreground" : "bg-foreground text-background"]),
							onClick: r[0] ||= (e) => $(!1)
						}, p(g(V)("formula.inline")), 3), c("button", {
							type: "button",
							class: m(["px-3 py-1.5 text-sm transition-colors", g(H).formulaEditorDisplayMode ? "bg-foreground text-background" : "bg-transparent text-muted-foreground"]),
							onClick: r[1] ||= (e) => $(!0)
						}, p(g(V)("formula.block")), 3)])]), te(c("textarea", {
							ref_key: "latexInputRef",
							ref: K,
							"onUpdate:modelValue": r[2] ||= (e) => ee(W) ? W.value = e : null,
							class: "flex min-h-48 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none",
							placeholder: g(V)("formula.latexPlaceholder"),
							onInput: ve
						}, null, 40, A), [[ne, g(W)]])]), c("div", j, [c("label", M, p(g(V)("formula.preview")), 1), c("div", N, [c("div", {
							class: "w-full",
							innerHTML: g(ge)
						}, null, 8, P)])])]), c("div", F, [c("div", I, [c("h3", L, p(g(V)("formula.library")), 1), c("div", R, [(n(), e(d, null, a(q, (e) => c("button", {
							key: e.key,
							type: "button",
							class: m(["rounded-full border px-3 py-1.5 text-sm transition-colors", g(J) === e.key ? "bg-foreground text-background border-foreground" : "bg-background text-foreground hover:bg-accent"]),
							onClick: (t) => xe(e.key)
						}, p(g(V)(`formula.groups.${e.key}`)), 11, z)), 64))])]), c("div", pe, [c("div", B, [(n(!0), e(d, null, a(g(Y).items, (t) => (n(), e("button", {
							key: `${g(Y).key}-${t}`,
							type: "button",
							class: "rounded-lg border bg-background px-3 py-2 text-left text-sm hover:border-primary hover:bg-primary/5 transition-colors",
							onClick: (e) => ye(t)
						}, [c("span", {
							class: "flex items-center overflow-x-auto whitespace-nowrap font-mono h-15",
							innerHTML: Q(t)
						}, null, 8, he)], 8, me))), 128))])])])]),
						i(_, { class: "px-6 py-4 border-t bg-background" }, {
							default: u(() => [i(h, {
								variant: "outline",
								onClick: r[3] ||= (e) => g(H).closeFormulaEditor()
							}, {
								default: u(() => [f(p(g(V)("common.cancel")), 1)]),
								_: 1
							}), i(h, { onClick: r[4] ||= (e) => be() }, {
								default: u(() => [f(p(g(V)("formula.insertFormula")), 1)]),
								_: 1
							})]),
							_: 1
						})
					]),
					_: 1
				})]),
				_: 1
			}, 8, ["open"]);
		};
	}
});
export { V as default };
