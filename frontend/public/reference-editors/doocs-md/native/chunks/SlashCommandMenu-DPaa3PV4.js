import { B as e, C as t, Ct as n, D as r, H as i, I as a, S as o, T as s, W as c, X as l, Z as u, b as d, dt as f, et as ee, h as p, ht as m, p as h, q as g, s as te, wt as _, x as v, xt as y, y as b, yt as x } from "./vendor_vue-OlfIOlFg.js";
import { n as ne } from "./vue-i18n-8AnKzzG6.js";
import { t as S } from "./createLucideIcon-CFmwvUbS.js";
import { C as re, S as ie, _ as ae, b as oe, c as se, d as ce, f as le, g as ue, h as de, i as fe, l as pe, m as me, n as he, p as ge, r as _e, s as ve, t as ye, u as be, v as xe, w as Se, x as Ce, y as we } from "./slashCommands-5rC_jymM.js";
import { t as Te } from "./chevron-down-VU0vsl_3.js";
import { t as Ee } from "./minus-u0NdL0u6.js";
import { t as De } from "./search-DYgNslcJ.js";
import { t as Oe } from "./trash-DHg1WvRr.js";
import { t as C } from "./_plugin-vue_export-helper-B3W2xDgE.js";
var w = S({
	name: "braces",
	size: 24,
	node: [["path", {
		d: "M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1",
		key: "ezmyqa"
	}], ["path", {
		d: "M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1",
		key: "e1hn23"
	}]],
	aliases: ["curly-braces"]
}), T = S({
	name: "code",
	size: 24,
	node: [["path", {
		d: "m16 18 6-6-6-6",
		key: "eg8j8"
	}], ["path", {
		d: "m8 6-6 6 6 6",
		key: "ppft3o"
	}]]
}), E = S({
	name: "palette",
	size: 24,
	node: [
		["path", {
			d: "M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z",
			key: "e79jfc"
		}],
		["circle", {
			cx: "13.5",
			cy: "6.5",
			r: ".5",
			fill: "currentColor",
			key: "1okk4w"
		}],
		["circle", {
			cx: "17.5",
			cy: "10.5",
			r: ".5",
			fill: "currentColor",
			key: "f64h9f"
		}],
		["circle", {
			cx: "6.5",
			cy: "12.5",
			r: ".5",
			fill: "currentColor",
			key: "qy21gx"
		}],
		["circle", {
			cx: "8.5",
			cy: "7.5",
			r: ".5",
			fill: "currentColor",
			key: "fotxhn"
		}]
	]
}), ke = S({
	name: "quote",
	size: 24,
	node: [["path", {
		d: "M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z",
		key: "rib7q0"
	}], ["path", {
		d: "M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z",
		key: "1ymkrd"
	}]]
}), Ae = S({
	name: "sigma",
	size: 24,
	node: [["path", {
		d: "M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2",
		key: "wuwx1p"
	}]]
}), D = 260, O = 6, k = 8, A = 380, j = 320;
function M(e, t, n) {
	return Math.min(Math.max(e, t), n);
}
function je(t) {
	let n = f({
		x: 0,
		y: 0
	}), r = null;
	function i() {
		let e = t.containerEl.value;
		if (!e) {
			n.value = {
				x: t.position.value.x,
				y: t.position.value.y
			};
			return;
		}
		let r = e.getBoundingClientRect(), i = t.menuRef.value?.offsetWidth ?? D, a = t.menuRef.value?.offsetHeight ?? (t.isFiltering.value ? j : A), o = t.position.value.x - r.left, s = t.position.value.y - r.top, c = t.position.value.top - r.top;
		o = M(o, k, r.width - i - k);
		let l = r.height - s - k, u = c - k, d;
		d = l >= a ? s + O : u >= a ? c - a - O : M(s + O, k, r.height - a - k), n.value = {
			x: o,
			y: d
		};
	}
	function o() {
		s(), t.containerEl.value && (r = new ResizeObserver(() => i()), r.observe(t.containerEl.value));
	}
	function s() {
		r?.disconnect(), r = null;
	}
	return u(() => [
		t.visible.value,
		t.position.value.x,
		t.position.value.y,
		t.position.value.top,
		t.filter.value,
		t.containerEl.value
	], () => {
		t.visible.value && a(i);
	}), e(s), {
		adjustedPosition: n,
		updateAdjustedPosition: i,
		bindContainerObserver: o,
		unbindContainerObserver: s
	};
}
var N = 8;
function Me(t) {
	let n = f(!1), r = null;
	function i() {
		let e = t.scrollRef.value;
		if (!e) {
			n.value = !1;
			return;
		}
		n.value = e.scrollHeight - e.scrollTop - e.clientHeight > N;
	}
	function o() {
		s(), a(() => {
			let e = t.scrollRef.value;
			e && (r = new ResizeObserver(() => i()), r.observe(e), i());
		});
	}
	function s() {
		r?.disconnect(), r = null;
	}
	function c() {
		a(() => {
			(t.menuRef.value?.querySelector("[data-active=\"true\"]"))?.scrollIntoView({ block: "nearest" }), i();
		});
	}
	return u(() => [
		t.filter.value,
		t.filteredCommandsLength.value,
		t.activeIndex.value
	], () => {
		t.visible.value && a(i);
	}), e(s), {
		canScrollDown: n,
		updateScrollHint: i,
		scrollActiveIntoView: c,
		bindScrollContentObserver: o,
		unbindScrollContentObserver: s
	};
}
var Ne = { class: "slash-scroll-wrap" }, Pe = { class: "slash-filter-hint" }, Fe = { class: "slash-list" }, Ie = [
	"data-active",
	"title",
	"onMousedown"
], Le = { class: "slash-list-icon" }, Re = {
	key: 1,
	viewBox: "0 0 24 24",
	class: "size-3.5",
	fill: "currentColor",
	"aria-hidden": "true"
}, ze = {
	key: 3,
	class: "slash-list-fallback"
}, Be = { class: "slash-list-text" }, Ve = { class: "slash-list-label" }, He = { class: "slash-list-group" }, Ue = {
	key: 0,
	class: "slash-section"
}, We = { class: "slash-section-title" }, Ge = {
	key: 0,
	class: "slash-heading-row"
}, Ke = [
	"data-active",
	"title",
	"onMousedown"
], qe = { class: "slash-icon-row" }, Je = [
	"data-active",
	"title",
	"onMousedown"
], Ye = [
	"data-active",
	"title",
	"onMousedown"
], P = {
	key: 1,
	class: "slash-section"
}, Xe = { class: "slash-section-title" }, Ze = { class: "slash-grid-2" }, Qe = ["data-active", "onMousedown"], $e = { class: "slash-grid-icon" }, et = {
	key: 0,
	viewBox: "0 0 24 24",
	class: "size-3.5",
	fill: "currentColor",
	"aria-hidden": "true"
}, tt = {
	key: 2,
	class: "slash-section"
}, nt = { class: "slash-section-title" }, rt = { class: "slash-chip-row slash-chip-row--compact" }, it = ["data-active", "onMousedown"], at = {
	key: 3,
	class: "slash-section slash-section--last"
}, ot = { class: "slash-section-title" }, st = {
	key: 0,
	class: "slash-subsection"
}, ct = { class: "slash-subsection-title" }, lt = { class: "slash-theme-row" }, ut = [
	"data-active",
	"title",
	"onMousedown"
], dt = {
	key: 1,
	class: "slash-subsection"
}, ft = { class: "slash-subsection-title" }, pt = { class: "slash-color-grid" }, mt = [
	"data-active",
	"title",
	"onMousedown"
], ht = {
	key: 2,
	class: "slash-scroll-hint",
	"aria-hidden": "true"
}, F = /*#__PURE__*/ C(/* @__PURE__ */ r({
	__name: "SlashCommandMenu",
	props: {
		visible: { type: Boolean },
		position: {},
		activeIndex: {},
		filter: {},
		containerEl: {},
		basicCommands: {},
		commonCommands: {},
		editCommands: {},
		styleCommands: {},
		filteredCommands: {}
	},
	emits: ["execute", "close"],
	setup(r, { emit: f }) {
		let S = r, C = f, D = {
			H1: Ce,
			H2: oe,
			H3: we,
			H4: xe,
			H5: ae,
			H6: ue,
			"ordered-list": le,
			"unordered-list": ce,
			blockquote: ke,
			divider: Ee,
			code: w,
			formula: Ae,
			image: de,
			table: se,
			blocks: Se,
			bold: re,
			italic: me,
			strikethrough: pe,
			"code-inline": T,
			"link-wrap": ge,
			format: ve,
			reset: be,
			clear: Oe,
			find: De,
			theme: E,
			color: E,
			emoji: ie
		}, O = l("menuRef"), k = l("scrollRef"), A = m(S, "visible"), j = m(S, "position"), M = m(S, "filter"), N = m(S, "activeIndex"), F = m(S, "containerEl"), gt = b(() => S.filteredCommands.length), I = b(() => S.filter.trim().length > 0), L = b(() => S.basicCommands.filter((e) => fe.includes(e.id))), R = b(() => S.basicCommands.filter((e) => ye.includes(e.id))), z = b(() => S.basicCommands.filter((e) => he.includes(e.id))), B = b(() => S.editCommands.filter((e) => _e.includes(e.id))), V = b(() => S.styleCommands.filter((e) => e.id.startsWith("theme-"))), H = b(() => S.styleCommands.filter((e) => e.id.startsWith("color-"))), { adjustedPosition: U, updateAdjustedPosition: W, bindContainerObserver: _t, unbindContainerObserver: G } = je({
			visible: A,
			position: j,
			filter: M,
			containerEl: F,
			menuRef: O,
			isFiltering: I
		}), { canScrollDown: K, updateScrollHint: q, scrollActiveIntoView: J, bindScrollContentObserver: vt, unbindScrollContentObserver: Y } = Me({
			visible: A,
			scrollRef: k,
			menuRef: O,
			filter: M,
			filteredCommandsLength: gt,
			activeIndex: N
		});
		function X(e) {
			O.value && !O.value.contains(e.target) && C("close");
		}
		function yt(e) {
			return S.filteredCommands.indexOf(e);
		}
		function Z(e) {
			return yt(e) === S.activeIndex;
		}
		let { t: Q } = ne();
		function $(e) {
			let t = e.split(/\s*[·•]\s*/);
			return t.length > 1 ? t[t.length - 1] : e;
		}
		function bt(e) {
			return $(e);
		}
		function xt(e) {
			return $(e);
		}
		return u(() => S.visible, (e) => {
			e ? (_t(), vt(), a(() => {
				W(), q(), document.addEventListener("mousedown", X), J();
			})) : (G(), Y(), K.value = !1, document.removeEventListener("mousedown", X));
		}), u(() => [
			S.visible,
			S.position.x,
			S.position.y,
			S.position.top,
			S.filter,
			S.containerEl
		], () => {
			S.visible && a(() => {
				W(), q();
			});
		}), u(() => S.activeIndex, () => {
			J();
		}), e(() => {
			G(), Y(), document.removeEventListener("mousedown", X);
		}), (e, a) => (i(), v(te, { name: "slash-menu" }, {
			default: ee(() => [r.visible ? (i(), t("div", {
				key: 0,
				ref_key: "menuRef",
				ref: O,
				class: "slash-command-menu rounded-md shadow-md",
				style: n({
					left: `${x(U).x}px`,
					top: `${x(U).y}px`
				}),
				onContextmenuCapture: a[2] ||= h(() => {}, ["prevent", "stop"])
			}, [d("div", Ne, [x(I) ? (i(), t("div", {
				key: 0,
				ref_key: "scrollRef",
				ref: k,
				class: y(["slash-scroll slash-scroll--filter", { "slash-scroll--has-hint": x(K) }]),
				onScroll: a[0] ||= (...e) => x(q) && x(q)(...e)
			}, [d("div", Pe, _(x(Q)("slash.filterMatch", { filter: r.filter })), 1), d("div", Fe, [(i(!0), t(p, null, c(r.filteredCommands, (e) => (i(), t("button", {
				key: e.id,
				class: y(["slash-list-item", { active: Z(e) }]),
				"data-active": Z(e),
				title: e.label,
				onMousedown: h((t) => C("execute", e), ["prevent"])
			}, [d("span", Le, [e.swatch ? (i(), t("span", {
				key: 0,
				class: "slash-swatch",
				style: n({ backgroundColor: e.swatch })
			}, null, 4)) : e.id === "markdown" ? (i(), t("svg", Re, [...a[3] ||= [d("path", { d: "M20.56 18H3.44C2.65 18 2 17.37 2 16.59V7.41C2 6.63 2.65 6 3.44 6h17.12C21.35 6 22 6.63 22 7.41v9.18c0 .78-.65 1.41-1.44 1.41zM7 15V9l2 2 2-2v6h2V9l2 2 2-2v6h1V9h-1l-2 2-2-2H9L7 9v6H6V9H5v6h2z" }, null, -1)]])) : D[e.icon] ? (i(), v(g(D[e.icon]), {
				key: 2,
				class: "size-3.5"
			})) : (i(), t("span", ze, _(e.label.slice(0, 1)), 1))]), d("span", Be, [d("span", Ve, _(e.label), 1), d("span", He, _(e.groupLabel), 1)])], 42, Ie))), 128))])], 34)) : (i(), t("div", {
				key: 1,
				ref_key: "scrollRef",
				ref: k,
				class: y(["slash-scroll", { "slash-scroll--has-hint": x(K) }]),
				onScroll: a[1] ||= (...e) => x(q) && x(q)(...e)
			}, [
				x(L).length > 0 || x(R).length > 0 || x(z).length > 0 ? (i(), t("section", Ue, [
					d("div", We, _(x(Q)("slash.group.basic")), 1),
					x(L).length > 0 ? (i(), t("div", Ge, [(i(!0), t(p, null, c(x(L), (e) => (i(), t("button", {
						key: e.id,
						class: y(["slash-heading-chip", { active: Z(e) }]),
						"data-active": Z(e),
						title: e.label,
						onMousedown: h((t) => C("execute", e), ["prevent"])
					}, _(e.label), 43, Ke))), 128))])) : o("", !0),
					d("div", qe, [(i(!0), t(p, null, c(x(R), (e) => (i(), t("button", {
						key: e.id,
						class: y(["slash-icon-btn", { active: Z(e) }]),
						"data-active": Z(e),
						title: e.label,
						onMousedown: h((t) => C("execute", e), ["prevent"])
					}, [D[e.icon] ? (i(), v(g(D[e.icon]), {
						key: 0,
						class: "size-3.5"
					})) : o("", !0)], 42, Je))), 128)), (i(!0), t(p, null, c(x(z), (e) => (i(), t("button", {
						key: e.id,
						class: y(["slash-icon-btn", { active: Z(e) }]),
						"data-active": Z(e),
						title: e.label,
						onMousedown: h((t) => C("execute", e), ["prevent"])
					}, [D[e.icon] ? (i(), v(g(D[e.icon]), {
						key: 0,
						class: "size-3.5"
					})) : o("", !0)], 42, Ye))), 128))])
				])) : o("", !0),
				r.commonCommands.length > 0 ? (i(), t("section", P, [d("div", Xe, _(x(Q)("slash.group.common")), 1), d("div", Ze, [(i(!0), t(p, null, c(r.commonCommands, (e) => (i(), t("button", {
					key: e.id,
					class: y(["slash-grid-item", { active: Z(e) }]),
					"data-active": Z(e),
					onMousedown: h((t) => C("execute", e), ["prevent"])
				}, [d("span", $e, [e.id === "markdown" ? (i(), t("svg", et, [...a[4] ||= [d("path", { d: "M20.56 18H3.44C2.65 18 2 17.37 2 16.59V7.41C2 6.63 2.65 6 3.44 6h17.12C21.35 6 22 6.63 22 7.41v9.18c0 .78-.65 1.41-1.44 1.41zM7 15V9l2 2 2-2v6h2V9l2 2 2-2v6h1V9h-1l-2 2-2-2H9L7 9v6H6V9H5v6h2z" }, null, -1)]])) : D[e.icon] ? (i(), v(g(D[e.icon]), {
					key: 1,
					class: "size-3.5"
				})) : o("", !0)]), d("span", null, _(e.label), 1)], 42, Qe))), 128))])])) : o("", !0),
				x(B).length > 0 ? (i(), t("section", tt, [d("div", nt, _(x(Q)("slash.group.edit")), 1), d("div", rt, [(i(!0), t(p, null, c(x(B), (e) => (i(), t("button", {
					key: e.id,
					class: y(["slash-chip slash-chip--half", { active: Z(e) }]),
					"data-active": Z(e),
					onMousedown: h((t) => C("execute", e), ["prevent"])
				}, [D[e.icon] ? (i(), v(g(D[e.icon]), {
					key: 0,
					class: "size-3.5 shrink-0"
				})) : o("", !0), d("span", null, _(e.label), 1)], 42, it))), 128))])])) : o("", !0),
				r.styleCommands.length > 0 ? (i(), t("section", at, [
					d("div", ot, _(x(Q)("slash.group.style")), 1),
					x(V).length > 0 ? (i(), t("div", st, [d("div", ct, _(x(Q)("slash.theme")), 1), d("div", lt, [(i(!0), t(p, null, c(x(V), (e) => (i(), t("button", {
						key: e.id,
						class: y(["slash-theme-pill", { active: Z(e) }]),
						"data-active": Z(e),
						title: e.label,
						onMousedown: h((t) => C("execute", e), ["prevent"])
					}, _(bt(e.label)), 43, ut))), 128))])])) : o("", !0),
					x(H).length > 0 ? (i(), t("div", dt, [d("div", ft, _(x(Q)("slash.primaryColor")), 1), d("div", pt, [(i(!0), t(p, null, c(x(H), (e) => (i(), t("button", {
						key: e.id,
						class: y(["slash-color-btn", { active: Z(e) }]),
						"data-active": Z(e),
						title: xt(e.label),
						onMousedown: h((t) => C("execute", e), ["prevent"])
					}, [d("span", {
						class: "slash-swatch slash-swatch--lg",
						style: n({ backgroundColor: e.swatch })
					}, null, 4)], 42, mt))), 128))])])) : o("", !0)
				])) : o("", !0)
			], 34)), x(K) ? (i(), t("div", ht, [s(x(Te), { class: "size-4" })])) : o("", !0)])], 36)) : o("", !0)]),
			_: 1
		}));
	}
}), [["__scopeId", "data-v-e3822c9d"]]);
export { F as default };
