import { B as e, C as t, Ct as n, D as r, E as i, F as a, G as o, H as s, I as c, O as l, S as u, T as d, W as f, X as p, Z as m, a as h, b as g, dt as _, et as v, f as ee, gt as y, h as b, ot as x, p as S, w as C, wt as w, x as T, xt as E, y as D, yt as O } from "./vendor_vue-OlfIOlFg.js";
import { r as te } from "./native-host-BoAU4GnD.js";
import { h as ne, n as re, r as ie } from "./render-C0-GwsvR.js";
import { n as ae } from "./vue-i18n-8AnKzzG6.js";
import { n as oe } from "./lib-DIiEqr8B.js";
import { _ as se, s as k } from "./vendor_vueuse-DbHwQsn4.js";
import { a as ce, i as le, n as ue, r as de, t as fe } from "./SelectContent-CWUKV6JE.js";
import { n as A } from "./VisuallyHidden-D556S2Ak.js";
import { E as j, _ as M, y as N } from "./Teleport-YNIcOte_.js";
import { i as P, r as F, t as pe } from "./Button-B4kIEl6s.js";
import { t as me } from "./VisuallyHiddenInput-Xoe8o7nr.js";
import { t as I } from "./Label-BgDHuDsA.js";
import { t as he } from "./x-E9vLZ87c.js";
import { t as ge } from "./confirm-BRFdpM55.js";
import { t as _e } from "./useEditorRefresh-CP-K_yWo.js";
import { r as ve } from "./useLocalizedStyleOptions-BawQ5Q6I.js";
import { t as ye } from "./_plugin-vue_export-helper-B3W2xDgE.js";
function be() {
	let e = l()?.vnode?.scopeId;
	return e ? { [e]: "" } : {};
}
var [L, R] = /*#__PURE__*/ j("SwitchRoot"), z = /* @__PURE__ */ r({
	inheritAttrs: !1,
	__name: "SwitchRoot",
	props: {
		defaultValue: {
			type: null,
			required: !1
		},
		modelValue: {
			type: null,
			required: !1,
			default: void 0
		},
		disabled: {
			type: Boolean,
			required: !1
		},
		id: {
			type: String,
			required: !1
		},
		value: {
			type: String,
			required: !1,
			default: "on"
		},
		trueValue: {
			type: null,
			required: !1,
			default: () => !0
		},
		falseValue: {
			type: null,
			required: !1,
			default: () => !1
		},
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1,
			default: "button"
		},
		name: {
			type: String,
			required: !1
		},
		required: {
			type: Boolean,
			required: !1
		}
	},
	emits: ["update:modelValue"],
	setup(e, { emit: n }) {
		let r = e, i = n, { disabled: c } = y(r), l = k(r, "modelValue", i, {
			defaultValue: r.defaultValue ?? r.falseValue,
			passive: r.modelValue === void 0
		}), f = D(() => l.value === r.trueValue);
		function p() {
			c.value || (l.value = f.value ? r.falseValue : r.trueValue);
		}
		let { forwardRef: m, currentElement: h } = N(), g = A(h), _ = be(), x = D(() => r.id && h.value ? document.querySelector(`[for="${r.id}"]`)?.innerText : void 0);
		return R({
			checked: f,
			toggleCheck: p,
			disabled: c
		}), (e, n) => (s(), t(b, null, [d(O(P), a({
			id: e.id,
			ref: O(m),
			role: "switch",
			type: e.as === "button" ? "button" : void 0,
			value: e.value,
			"aria-label": e.$attrs["aria-label"] || x.value,
			"aria-checked": f.value,
			"aria-required": e.required,
			"data-state": f.value ? "checked" : "unchecked",
			"data-disabled": O(c) ? "" : void 0,
			"as-child": e.asChild,
			as: e.as,
			disabled: O(c)
		}, {
			...O(_),
			...e.$attrs
		}, {
			onClick: p,
			onKeydown: ee(S(p, ["prevent"]), ["enter"])
		}), {
			default: v(() => [o(e.$slots, "default", {
				modelValue: O(l),
				checked: f.value
			})]),
			_: 3
		}, 16, [
			"id",
			"type",
			"value",
			"aria-label",
			"aria-checked",
			"aria-required",
			"data-state",
			"data-disabled",
			"as-child",
			"as",
			"disabled",
			"onKeydown"
		]), O(g) && e.name ? (s(), T(O(me), a({
			key: 0,
			type: "checkbox",
			name: e.name,
			disabled: O(c),
			required: e.required,
			value: e.value,
			checked: f.value
		}, O(_)), null, 16, [
			"name",
			"disabled",
			"required",
			"value",
			"checked"
		])) : u("v-if", !0)], 64));
	}
}), B = /* @__PURE__ */ r({
	__name: "SwitchThumb",
	props: {
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1,
			default: "span"
		}
	},
	setup(e) {
		let t = L();
		return N(), (e, n) => (s(), T(O(P), {
			"data-state": O(t).checked.value ? "checked" : "unchecked",
			"data-disabled": O(t).disabled.value ? "" : void 0,
			"as-child": e.asChild,
			as: e.as
		}, {
			default: v(() => [o(e.$slots, "default")]),
			_: 3
		}, 8, [
			"data-state",
			"data-disabled",
			"as-child",
			"as"
		]));
	}
}), V = /* @__PURE__ */ r({
	__name: "Switch",
	props: {
		defaultValue: {},
		modelValue: {},
		disabled: { type: Boolean },
		id: {},
		value: {},
		trueValue: {},
		falseValue: {},
		asChild: { type: Boolean },
		as: {},
		name: {},
		required: { type: Boolean },
		class: { type: [
			Boolean,
			null,
			String,
			Object,
			Array
		] }
	},
	emits: ["update:modelValue"],
	setup(e, { emit: t }) {
		let n = e, r = t, i = D(() => {
			let { class: e, ...t } = n;
			return t;
		}), c = M(i, r);
		return (e, t) => (s(), T(O(z), a(O(c), { class: O(F)("peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input", n.class) }), {
			default: v(() => [d(O(B), { class: E(O(F)("pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5")) }, {
				default: v(() => [o(e.$slots, "thumb")]),
				_: 3
			}, 8, ["class"])]),
			_: 3
		}, 16, ["class"]));
	}
}), xe = {
	key: 0,
	class: "sticky top-0 z-10 -mx-4 mb-4 border-b bg-background px-4 pb-3 pt-[max(0.5rem,env(safe-area-inset-top,0px))]"
}, Se = { class: "flex items-center justify-between" }, Ce = { class: "text-lg font-semibold" }, we = { class: "space-y-2" }, Te = { class: "text-sm font-medium" }, Ee = { class: "space-y-2" }, De = { class: "text-sm font-medium" }, Oe = { class: "grid grid-cols-3 gap-2" }, ke = { class: "space-y-2" }, Ae = { class: "text-sm font-medium" }, je = { class: "grid grid-cols-5 gap-1.5" }, Me = { class: "space-y-2" }, Ne = { class: "text-sm font-medium" }, Pe = { class: "grid grid-cols-5 gap-1.5" }, Fe = { class: "space-y-2" }, Ie = { class: "text-sm font-medium" }, Le = { class: "grid grid-cols-5 gap-1.5" }, Re = { class: "space-y-2" }, ze = { class: "text-sm font-medium" }, Be = { class: "grid grid-cols-3 gap-1.5" }, Ve = { class: "space-y-2" }, He = { class: "text-sm font-medium" }, Ue = { class: "grid grid-cols-3 gap-1.5" }, We = { class: "space-y-2" }, Ge = { class: "text-sm font-medium" }, Ke = { key: 0 }, qe = { class: "space-y-2" }, Je = { class: "text-sm font-medium" }, Ye = {
	key: 0,
	class: "flex gap-2 items-center"
}, Xe = ["value"], Ze = ["value"], Qe = { class: "space-y-2" }, $e = { class: "text-sm font-medium" }, et = { class: "flex gap-2" }, tt = { class: "space-y-2" }, nt = { class: "text-sm font-medium" }, rt = { class: "space-y-2" }, it = { class: "text-sm font-medium" }, at = { class: "grid grid-cols-2 gap-2" }, ot = { class: "flex items-center justify-between gap-3" }, st = { class: "flex items-center justify-between gap-3" }, ct = { class: "flex items-center justify-between gap-3" }, lt = { class: "flex items-center justify-between gap-3" }, ut = { class: "flex items-center justify-between gap-3" }, dt = { class: "flex items-center justify-between gap-3" }, ft = { class: "space-y-2" }, pt = { class: "text-sm font-medium" }, H = 280, U = /*#__PURE__*/ ye(/* @__PURE__ */ r({
	__name: "RightSlider",
	setup(r) {
		let a = te(), o = i(() => import("./index.esm-Bw5633gn.js")), l;
		e(() => {
			clearTimeout(l);
		});
		let ee = ge(), y = ie(), S = ne(), k = re(), { t: A } = ae(), j = ve(), { theme: M, fontFamily: N, fontSize: P, lineHeight: F, blockSpacing: me, linkColor: ye, blockquoteBackground: be, primaryColor: L, codeBlockTheme: R, legend: z, isMacCodeBlock: B, isShowLineNumber: U, isCiteStatus: mt, isUseIndent: ht, isUseJustify: gt, isCountStatus: _t } = h(k), { scheduleEditorRefresh: W, editorRefresh: vt } = _e(), G = _("h2"), K = D({
			get: () => k.getHeadingStyle(G.value),
			set: (e) => {
				k.setHeadingStyle(G.value, e), e === "custom" && (S.isShowCssEditor = !0, c(() => {
					l = setTimeout(() => {
						(!a || a.live && !a.signal.aborted) && y.scrollToHeading(G.value);
					}, 100);
				})), k.applyCurrentTheme(), W();
			}
		}), yt = D(() => j.value.headingStyleOptions.find((e) => e.value === K.value)?.label), { isMobile: q, isOpenRightSlider: J, isDark: bt } = h(S);
		function xt(e) {
			k.theme = e, k.applyCurrentTheme(), W();
		}
		function St() {
			S.openMarketplaceDialog({
				tab: "theme",
				view: "discover"
			});
		}
		function Ct(e) {
			k.fontFamily = e, k.applyCurrentTheme(), W();
		}
		function wt(e) {
			k.fontSize = e, k.applyCurrentTheme(), W();
		}
		function Tt(e) {
			k.lineHeight = e, k.applyCurrentTheme(), W();
		}
		function Et(e) {
			k.blockSpacing = e, k.applyCurrentTheme(), W();
		}
		function Dt(e) {
			k.linkColor = e, k.applyCurrentTheme(), W();
		}
		function Ot(e) {
			k.blockquoteBackground = e, k.applyCurrentTheme(), W();
		}
		function Y(e) {
			k.primaryColor = e, k.applyCurrentTheme(), W();
		}
		function kt(e) {
			typeof e == "string" && (k.codeBlockTheme = e, W());
		}
		function At(e) {
			k.legend = e, W();
		}
		function jt() {
			k.isMacCodeBlock = !k.isMacCodeBlock, W();
		}
		function Mt() {
			k.isShowLineNumber = !k.isShowLineNumber, W();
		}
		function Nt() {
			k.isCiteStatus = !k.isCiteStatus, W();
		}
		function Pt() {
			k.isUseIndent = !k.isUseIndent, k.applyCurrentTheme(), W();
		}
		function Ft() {
			k.isUseJustify = !k.isUseJustify, k.applyCurrentTheme(), W();
		}
		function It(e) {
			e !== B.value && jt();
		}
		function Lt(e) {
			e !== U.value && Mt();
		}
		function Rt(e) {
			e !== mt.value && Nt();
		}
		function zt(e) {
			e !== ht.value && Pt();
		}
		function Bt(e) {
			e !== gt.value && Ft();
		}
		function Vt() {
			k.isCountStatus = !k.isCountStatus, vt();
		}
		function Ht(e) {
			e !== _t.value && Vt();
		}
		function Ut() {
			ee.confirm({
				title: A("confirm.tip"),
				description: A("confirm.resetStyleDescription"),
				onConfirm: () => {
					k.resetStyle(), y.resetCssConfig(), k.applyCurrentTheme(), vt(), oe.success(A("toast.styleReset"));
				}
			});
		}
		let X = _(!1);
		m(J, () => {
			q.value && (X.value = !0);
		}), m(q, () => {
			X.value = !1;
		});
		let Z = p("pickColorsContainer"), Wt = _("rgb"), Gt = _([
			"rgb",
			"hex",
			"hsl",
			"hsv"
		]), Kt = p("colorGridRef"), { width: qt } = se(Kt), Q = D(() => qt.value > 0 && qt.value < H), Jt = p("themeGridRef"), { width: Yt } = se(Jt), $ = D(() => Yt.value > 0 && Yt.value < H);
		return (e, r) => {
			let i = pe, c = ue, l = de, p = le, m = fe, h = ce;
			return s(), t(b, null, [O(q) && O(J) ? (s(), t("div", {
				key: 0,
				class: "fixed inset-0 bg-black/50 z-40",
				onClick: r[0] ||= (e) => J.value = !1
			})) : u("", !0), g("div", {
				class: E(["h-full overflow-hidden", {
					"fixed top-0 right-0 w-full h-full z-55 bg-background border-l shadow-lg mobile-right-drawer": O(q),
					animate: O(q) && O(X)
				}]),
				style: n(O(q) ? { transform: O(J) ? "translateX(0)" : "translateX(100%)" } : void 0)
			}, [g("div", { class: E(["h-full space-y-4 overflow-auto p-4", { "pt-0": O(q) }]) }, [
				O(q) ? (s(), t("div", xe, [r[8] ||= g("div", {
					"aria-hidden": "true",
					class: "mx-auto mb-2 h-1 w-10 rounded-full bg-muted-foreground/25"
				}, null, -1), g("div", Se, [g("h2", Ce, w(O(A)("rightSlider.title")), 1), d(i, {
					variant: "ghost",
					size: "sm",
					"aria-label": O(A)("common.close"),
					title: O(A)("common.close"),
					onClick: r[1] ||= (e) => J.value = !1
				}, {
					default: v(() => [d(O(he), { class: "h-4 w-4" })]),
					_: 1
				}, 8, ["aria-label", "title"])])])) : u("", !0),
				g("div", we, [
					g("h2", Te, w(O(A)("menu.theme")), 1),
					g("div", {
						ref_key: "themeGridRef",
						ref: Jt,
						class: E(["grid gap-2", O($) ? "grid-cols-4 sm:grid-cols-5" : "grid-cols-3"])
					}, [(s(!0), t(b, null, f(O(j).themeOptions, ({ label: e, value: t }) => (s(), T(i, {
						key: t,
						class: E(["h-auto w-full text-xs whitespace-nowrap", [O($) ? "justify-center px-1 py-2" : "px-1.5 py-2", { "bg-accent text-accent-foreground ring-1 ring-primary/20 border-primary": O(M) === t }]]),
						variant: "outline",
						title: e,
						"aria-label": e,
						onClick: (e) => xt(t)
					}, {
						default: v(() => [g("span", { class: E({ "min-w-0 truncate": O($) }) }, w(e), 3)]),
						_: 2
					}, 1032, [
						"class",
						"title",
						"aria-label",
						"onClick"
					]))), 128))], 2),
					O(a) ? u("", !0) : (s(), T(i, {
						key: 0,
						variant: "ghost",
						size: "sm",
						class: "h-8 w-full justify-start px-1.5 text-xs text-muted-foreground",
						onClick: St
					}, {
						default: v(() => [C(w(O(A)("marketplace.exploreThemes")), 1)]),
						_: 1
					}))
				]),
				g("div", Ee, [g("h2", De, w(O(A)("menu.font")), 1), g("div", Oe, [(s(!0), t(b, null, f(O(j).fontFamilyOptions, ({ label: e, value: t }) => (s(), T(i, {
					key: t,
					variant: "outline",
					class: E(["h-auto w-full px-1.5 py-2 text-xs whitespace-nowrap", { "bg-accent text-accent-foreground ring-1 ring-primary/20 border-primary": O(N) === t }]),
					onClick: (e) => Ct(t)
				}, {
					default: v(() => [C(w(e), 1)]),
					_: 2
				}, 1032, ["class", "onClick"]))), 128))])]),
				g("div", ke, [g("h2", Ae, w(O(A)("menu.fontSize")), 1), g("div", je, [(s(!0), t(b, null, f(O(j).fontSizeOptions, ({ label: e, value: t, desc: n }) => (s(), T(i, {
					key: t,
					variant: "outline",
					class: E(["h-auto w-full px-1 py-2 text-xs whitespace-nowrap", { "bg-accent text-accent-foreground ring-1 ring-primary/20 border-primary": O(P) === t }]),
					title: n,
					onClick: (e) => wt(t)
				}, {
					default: v(() => [C(w(e), 1)]),
					_: 2
				}, 1032, [
					"title",
					"class",
					"onClick"
				]))), 128))])]),
				g("div", Me, [g("h2", Ne, w(O(A)("menu.lineHeight")), 1), g("div", Pe, [(s(!0), t(b, null, f(O(j).lineHeightOptions, ({ label: e, value: t, desc: n }) => (s(), T(i, {
					key: t,
					variant: "outline",
					class: E(["h-auto w-full px-1 py-2 text-xs whitespace-nowrap", { "bg-accent text-accent-foreground ring-1 ring-primary/20 border-primary": O(F) === t }]),
					title: n,
					onClick: (e) => Tt(t)
				}, {
					default: v(() => [C(w(e), 1)]),
					_: 2
				}, 1032, [
					"title",
					"class",
					"onClick"
				]))), 128))])]),
				g("div", Fe, [g("h2", Ie, w(O(A)("menu.blockSpacing")), 1), g("div", Le, [(s(!0), t(b, null, f(O(j).blockSpacingOptions, ({ label: e, value: t, desc: n }) => (s(), T(i, {
					key: t,
					variant: "outline",
					class: E(["h-auto w-full px-1 py-2 text-xs whitespace-nowrap", { "bg-accent text-accent-foreground ring-1 ring-primary/20 border-primary": O(me) === t }]),
					title: n,
					onClick: (e) => Et(t)
				}, {
					default: v(() => [C(w(e), 1)]),
					_: 2
				}, 1032, [
					"title",
					"class",
					"onClick"
				]))), 128))])]),
				g("div", Re, [g("h2", ze, w(O(A)("menu.linkColor")), 1), g("div", Be, [(s(!0), t(b, null, f(O(j).linkColorOptions, ({ label: e, value: t, desc: n }) => (s(), T(i, {
					key: t,
					variant: "outline",
					class: E(["h-auto w-full px-1 py-2 text-xs whitespace-nowrap", { "bg-accent text-accent-foreground ring-1 ring-primary/20 border-primary": O(ye) === t }]),
					title: n,
					onClick: (e) => Dt(t)
				}, {
					default: v(() => [C(w(e), 1)]),
					_: 2
				}, 1032, [
					"title",
					"class",
					"onClick"
				]))), 128))])]),
				g("div", Ve, [g("h2", He, w(O(A)("menu.blockquoteBackground")), 1), g("div", Ue, [(s(!0), t(b, null, f(O(j).blockquoteBackgroundOptions, ({ label: e, value: t, desc: n }) => (s(), T(i, {
					key: t,
					variant: "outline",
					class: E(["h-auto w-full px-1 py-2 text-xs whitespace-nowrap", { "bg-accent text-accent-foreground ring-1 ring-primary/20 border-primary": O(be) === t }]),
					title: n,
					onClick: (e) => Ot(t)
				}, {
					default: v(() => [C(w(e), 1)]),
					_: 2
				}, 1032, [
					"title",
					"class",
					"onClick"
				]))), 128))])]),
				g("div", We, [g("h2", Ge, w(O(A)("menu.primaryColor")), 1), g("div", {
					ref_key: "colorGridRef",
					ref: Kt,
					class: E(["grid gap-2", O(Q) ? "grid-cols-4 sm:grid-cols-5" : "grid-cols-3"])
				}, [(s(!0), t(b, null, f(O(j).colorOptions, ({ label: e, value: r }) => (s(), T(i, {
					key: r,
					class: E(["h-auto w-full text-xs whitespace-nowrap", [O(Q) ? "justify-center px-1 py-2" : "px-1.5 py-2", { "bg-accent text-accent-foreground ring-1 ring-primary/20 border-primary": O(L) === r }]]),
					variant: "outline",
					title: e,
					"aria-label": e,
					onClick: (e) => Y(r)
				}, {
					default: v(() => [g("span", {
						class: E(["inline-block shrink-0 rounded-full", O(Q) ? "size-4" : "mr-1.5 size-3"]),
						style: n({ background: r })
					}, null, 6), O(Q) ? u("", !0) : (s(), t("span", Ke, w(e), 1))]),
					_: 2
				}, 1032, [
					"class",
					"title",
					"aria-label",
					"onClick"
				]))), 128))], 2)]),
				g("div", qe, [g("h2", Je, w(O(A)("menu.customPrimaryColor")), 1), g("div", {
					ref_key: "pickColorsContainer",
					ref: Z
				}, [O(a) ? (s(), t("div", Ye, [g("input", {
					type: "color",
					"aria-label": "自定义主色",
					value: /^#[0-9a-f]{6}$/i.test(O(L)) ? O(L) : "#000000",
					onInput: r[2] ||= (e) => Y(e.target.value)
				}, null, 40, Xe), g("input", {
					"aria-label": "主色值",
					value: O(L),
					class: "w-full rounded border bg-background px-2 py-1",
					onChange: r[3] ||= (e) => Y(e.target.value)
				}, null, 40, Ze)])) : u("", !0), !O(a) && O(Z) ? (s(), T(O(o), {
					key: 1,
					value: O(L),
					"onUpdate:value": r[4] ||= (e) => x(L) ? L.value = e : null,
					"show-alpha": "",
					format: O(Wt),
					"format-options": O(Gt),
					theme: O(bt) ? "dark" : "light",
					"popup-container": O(Z),
					onChange: Y
				}, null, 8, [
					"value",
					"format",
					"format-options",
					"theme",
					"popup-container"
				])) : u("", !0)], 512)]),
				g("div", Qe, [g("h2", $e, w(O(A)("rightSlider.headingStyle")), 1), g("div", et, [d(h, {
					modelValue: O(G),
					"onUpdate:modelValue": r[5] ||= (e) => x(G) ? G.value = e : null
				}, {
					default: v(() => [d(l, { class: "w-[120px]" }, {
						default: v(() => [d(c, { placeholder: O(A)("rightSlider.selectHeading") }, null, 8, ["placeholder"])]),
						_: 1
					}), d(m, null, {
						default: v(() => [(s(!0), t(b, null, f(O(j).headingLevelOptions, ({ label: e, value: t }) => (s(), T(p, {
							key: t,
							value: t
						}, {
							default: v(() => [C(w(e), 1)]),
							_: 2
						}, 1032, ["value"]))), 128))]),
						_: 1
					})]),
					_: 1
				}, 8, ["modelValue"]), d(h, {
					modelValue: O(K),
					"onUpdate:modelValue": r[6] ||= (e) => x(K) ? K.value = e : null
				}, {
					default: v(() => [d(l, { class: "flex-1" }, {
						default: v(() => [d(c, { placeholder: O(A)("rightSlider.selectStyle") }, {
							default: v(() => [C(w(O(yt)), 1)]),
							_: 1
						}, 8, ["placeholder"])]),
						_: 1
					}), d(m, null, {
						default: v(() => [(s(!0), t(b, null, f(O(j).headingStyleOptions, ({ label: e, value: t }) => (s(), T(p, {
							key: t,
							value: t
						}, {
							default: v(() => [C(w(e), 1)]),
							_: 2
						}, 1032, ["value"]))), 128))]),
						_: 1
					})]),
					_: 1
				}, 8, ["modelValue"])])]),
				g("div", tt, [g("h2", nt, w(O(A)("menu.codeBlockTheme")), 1), d(h, {
					modelValue: O(R),
					"onUpdate:modelValue": [r[7] ||= (e) => x(R) ? R.value = e : null, kt]
				}, {
					default: v(() => [d(l, null, {
						default: v(() => [d(c, { placeholder: O(A)("rightSlider.selectCodeBlockTheme") }, null, 8, ["placeholder"])]),
						_: 1
					}), d(m, null, {
						default: v(() => [(s(!0), t(b, null, f(O(j).codeBlockThemeOptions, ({ label: e, value: t }) => (s(), T(p, {
							key: e,
							value: t
						}, {
							default: v(() => [C(w(e), 1)]),
							_: 2
						}, 1032, ["value"]))), 128))]),
						_: 1
					})]),
					_: 1
				}, 8, ["modelValue"])]),
				g("div", rt, [g("h2", it, w(O(A)("menu.legendFormat")), 1), g("div", at, [(s(!0), t(b, null, f(O(j).legendOptions, ({ label: e, value: t }) => (s(), T(i, {
					key: t,
					class: E(["h-auto w-full px-1.5 py-2 text-xs whitespace-nowrap", { "bg-accent text-accent-foreground ring-1 ring-primary/20 border-primary": O(z) === t }]),
					variant: "outline",
					onClick: (e) => At(t)
				}, {
					default: v(() => [C(w(e), 1)]),
					_: 2
				}, 1032, ["class", "onClick"]))), 128))])]),
				g("div", ot, [d(O(I), {
					for: "mac-code-block",
					class: "min-w-0 shrink text-xs leading-snug sm:text-sm"
				}, {
					default: v(() => [C(w(O(A)("menu.macCodeBlock")), 1)]),
					_: 1
				}), d(O(V), {
					id: "mac-code-block",
					class: "shrink-0",
					"model-value": O(B),
					"onUpdate:modelValue": It
				}, null, 8, ["model-value"])]),
				g("div", st, [d(O(I), {
					for: "show-line-number",
					class: "min-w-0 shrink text-xs leading-snug sm:text-sm"
				}, {
					default: v(() => [C(w(O(A)("rightSlider.codeBlockLineNumber")), 1)]),
					_: 1
				}), d(O(V), {
					id: "show-line-number",
					class: "shrink-0",
					"model-value": O(U),
					"onUpdate:modelValue": Lt
				}, null, 8, ["model-value"])]),
				g("div", ct, [d(O(I), {
					for: "cite-status",
					class: "min-w-0 shrink text-xs leading-snug sm:text-sm"
				}, {
					default: v(() => [C(w(O(A)("rightSlider.citeStatus")), 1)]),
					_: 1
				}), d(O(V), {
					id: "cite-status",
					class: "shrink-0",
					"model-value": O(mt),
					"onUpdate:modelValue": Rt
				}, null, 8, ["model-value"])]),
				g("div", lt, [d(O(I), {
					for: "use-indent",
					class: "min-w-0 shrink text-xs leading-snug sm:text-sm"
				}, {
					default: v(() => [C(w(O(A)("rightSlider.paragraphIndent")), 1)]),
					_: 1
				}), d(O(V), {
					id: "use-indent",
					class: "shrink-0",
					"model-value": O(ht),
					"onUpdate:modelValue": zt
				}, null, 8, ["model-value"])]),
				g("div", ut, [d(O(I), {
					for: "use-justify",
					class: "min-w-0 shrink text-xs leading-snug sm:text-sm"
				}, {
					default: v(() => [C(w(O(A)("rightSlider.paragraphJustify")), 1)]),
					_: 1
				}), d(O(V), {
					id: "use-justify",
					class: "shrink-0",
					"model-value": O(gt),
					"onUpdate:modelValue": Bt
				}, null, 8, ["model-value"])]),
				g("div", dt, [d(O(I), {
					for: "count-status",
					class: "min-w-0 shrink text-xs leading-snug sm:text-sm"
				}, {
					default: v(() => [C(w(O(A)("rightSlider.wordCount")), 1)]),
					_: 1
				}), d(O(V), {
					id: "count-status",
					class: "shrink-0",
					"model-value": O(_t),
					"onUpdate:modelValue": Ht
				}, null, 8, ["model-value"])]),
				g("div", ft, [g("h2", pt, w(O(A)("rightSlider.styleConfig")), 1), d(i, {
					variant: "destructive",
					onClick: Ut
				}, {
					default: v(() => [C(w(O(A)("menu.reset")), 1)]),
					_: 1
				})])
			], 2)], 6)], 64);
		};
	}
}), [["__scopeId", "data-v-75dc15be"]]);
export { U as default };
