import { B as e, C as t, Ct as n, D as r, E as i, F as a, G as o, H as s, I as c, Q as l, S as u, St as d, T as f, W as p, X as m, Z as h, _t as g, a as _, b as v, c as y, d as b, dt as x, et as S, g as C, gt as w, h as T, i as E, k as D, mt as O, n as ee, ot as te, p as k, pt as ne, q as re, r as A, s as ie, t as ae, tt as oe, w as j, wt as M, x as N, xt as P, y as F, yt as I, z as se } from "./chunks/vendor_vue-OlfIOlFg.js";
import { f as ce, i as le, n as ue, o as L, p as de, r as R, s as fe, u as pe } from "./chunks/native-host-BoAU4GnD.js";
import { B as me, C as he, D as z, E as ge, F as _e, I as ve, L as ye, M as be, N as B, O as xe, P as Se, R as Ce, S as we, T as Te, V as Ee, _ as De, a as Oe, b as V, c as H, d as ke, f as Ae, g as je, h as U, i as Me, j as Ne, l as Pe, n as Fe, o as W, p as Ie, r as Le, s as Re, t as ze, u as Be, v as Ve, w as He, x as Ue, y as We, z as Ge } from "./chunks/render-DsjZRMnM.js";
import { A as Ke, D as qe, O as G, c as Je, j as Ye, k as K, l as Xe, n as Ze, t as Qe } from "./chunks/storage-jiCkQUgy.js";
import { i as $e } from "./chunks/config-DbfjmaEn.js";
import { n as q } from "./chunks/vue-i18n-8AnKzzG6.js";
import { a as et, i as tt, n as J, r as nt } from "./chunks/translate-CUv9RhnO.js";
import { n as Y, t as rt } from "./chunks/lib-DIiEqr8B.js";
import { n as it } from "./chunks/post-BeiAh9Pa.js";
import { n as at } from "./chunks/editor-VmYacIt-.js";
import { S as ot, T as st, b as ct, m as lt } from "./chunks/utils-D7O4F-LG.js";
import { b as ut, s as dt } from "./chunks/vendor_vueuse-DbHwQsn4.js";
import { A as ft, C as pt, E as mt, Y as ht, b as gt, ft as _t, ht as vt, lt as yt, mt as bt, nt as X, ut as xt, vt as St, w as Ct } from "./chunks/codemirror-C3tEDw1q.js";
import { E as wt, _ as Z, b as Tt, h as Et, l as Dt, m as Ot, o as kt, s as At, u as jt, v as Mt, y as Q } from "./chunks/Teleport-YNIcOte_.js";
import { i as Nt, r as Pt, t as Ft } from "./chunks/Button-B4kIEl6s.js";
import { a as It, c as Lt, d as Rt, f as zt, i as Bt, l as Vt, m as Ht, n as Ut, o as Wt, p as Gt, r as Kt, s as qt, t as Jt, u as Yt } from "./chunks/clipboard-CNx6erJo.js";
import { c as Xt, i as Zt } from "./chunks/PopperContent-RtMDF-yC.js";
import { a as Qt, i as $t, n as en, r as tn, t as nn } from "./chunks/DialogTitle-w1SUV50e.js";
import { t as $ } from "./chunks/createLucideIcon-CFmwvUbS.js";
import { C as rn, S as an, _ as on, a as sn, b as cn, c as ln, d as un, f as dn, g as fn, h as pn, l as mn, m as hn, o as gn, p as _n, s as vn, u as yn, v as bn, w as xn, x as Sn, y as Cn } from "./chunks/slashCommands-5rC_jymM.js";
import { t as wn } from "./chunks/chevron-right-BTkVQ4BO.js";
import { n as Tn, t as En } from "./chunks/file-text-DscvNBZB.js";
import { t as Dn } from "./chunks/trash-DHg1WvRr.js";
import { i as On, r as kn } from "./chunks/table-neeg7dzE.js";
import { t as An } from "./chunks/formula-BY10rzjJ.js";
import { t as jn } from "./chunks/confirm-BRFdpM55.js";
import { t as Mn } from "./chunks/useEditorRefresh-BBWJMw8B.js";
import { n as Nn, t as Pn } from "./chunks/provider-registry-C_yJEJu8.js";
import { a as Fn, i as In, r as Ln } from "./chunks/marketplace-C8nh3WtE.js";
import { t as Rn } from "./chunks/_plugin-vue_export-helper-B3W2xDgE.js";
function zn(e, t = "untitled") {
	let n = me(t);
	Ce(e, `${n}.md`, "text/markdown;charset=utf-8");
}
function Bn(e, t) {
	e.dispatch({
		changes: {
			from: 0,
			to: e.state.doc.length,
			insert: t
		},
		annotations: St.addToHistory.of(!1)
	});
}
function Vn(e, t) {
	e.dispatch({ effects: t.reconfigure([]) }), e.dispatch({ effects: t.reconfigure(gt()) });
}
var Hn = class {
	tail = Promise.resolve();
	active;
	async acquire(e, t) {
		let n = this.tail.then(async () => {
			if (t?.aborted) throw Error("挂载已取消");
			if (this.active) {
				let e = this.active;
				this.active = void 0, await e();
			}
			if (t?.aborted) throw Error("挂载已取消");
			this.active = e;
		});
		this.tail = n.catch(() => {}), await n;
	}
	release(e) {
		this.active === e && (this.active = void 0);
	}
	async close() {
		await this.tail;
		let e = this.active;
		this.active = void 0, await e?.();
	}
}, Un = class {
	tail = Promise.resolve();
	run(e) {
		let t = this.tail.then(e);
		return this.tail = t.catch(() => {}), t;
	}
	async settled() {
		await this.tail;
	}
}, Wn = {
	foreground: "text",
	background: "surface",
	card: "surface",
	"card-foreground": "text",
	popover: "surface",
	"popover-foreground": "text",
	border: "border",
	input: "border-strong",
	ring: "brand",
	primary: "brand",
	"primary-foreground": "brand-foreground",
	accent: "brand-soft",
	"accent-foreground": "text",
	secondary: "surface-subtle",
	"secondary-foreground": "text",
	muted: "surface-subtle",
	"muted-foreground": "text-muted",
	destructive: "danger"
};
function Gn(e, t) {
	for (let n of e) {
		n.classList.toggle("dark", t.mode === "dark"), n.setAttribute("data-density", t.density);
		for (let e = n.style.length - 1; e >= 0; e--) {
			let t = n.style.item(e);
			t.startsWith("--creatoros-") && n.style.removeProperty(t);
		}
		for (let [e, r] of Object.entries(t.tokens)) e.startsWith("--creatoros-") && n.style.setProperty(e, r);
		for (let [e, t] of Object.entries(Wn)) n.style.setProperty(`--${e}`, `var(--creatoros-${t}${e === "primary-foreground" ? ",#fff" : ""})`);
		n.style.setProperty("--radius", "var(--creatoros-radius-control,8px)"), n.style.setProperty("--native-ui-font", t.fontFamily), n.style.setProperty("--native-ui-size", t.fontSize), n.style.color = "var(--creatoros-text)", n.style.fontFamily = t.fontFamily, n.style.fontSize = t.fontSize;
	}
}
var [Kn, qn] = /*#__PURE__*/ wt("MenuSub"), Jn = /* @__PURE__ */ r({
	__name: "MenuSub",
	props: { open: {
		type: Boolean,
		required: !1,
		default: void 0
	} },
	emits: ["update:open"],
	setup(e, { emit: t }) {
		let n = e, r = dt(n, "open", t, {
			defaultValue: !1,
			passive: n.open === void 0
		}), i = Rt(), a = x(), c = x();
		return l((e) => {
			i?.open.value === !1 && (r.value = !1), e(() => r.value = !1);
		}), Gt({
			open: r,
			onOpenChange: (e) => {
				r.value = e;
			},
			content: c,
			onContentChange: (e) => {
				c.value = e;
			}
		}), qn({
			triggerId: "",
			contentId: "",
			trigger: a,
			onTriggerChange: (e) => {
				a.value = e;
			}
		}), (e, t) => (s(), N(I(Zt), null, {
			default: S(() => [o(e.$slots, "default")]),
			_: 3
		}));
	}
}), Yn = /* @__PURE__ */ r({
	__name: "MenuSubContent",
	props: {
		forceMount: {
			type: Boolean,
			required: !1
		},
		loop: {
			type: Boolean,
			required: !1
		},
		memoDependencies: {
			type: Array,
			required: !1
		},
		sideOffset: {
			type: Number,
			required: !1
		},
		sideFlip: {
			type: Boolean,
			required: !1
		},
		alignOffset: {
			type: Number,
			required: !1
		},
		alignFlip: {
			type: Boolean,
			required: !1
		},
		avoidCollisions: {
			type: Boolean,
			required: !1
		},
		collisionBoundary: {
			type: null,
			required: !1
		},
		collisionPadding: {
			type: [Number, Object],
			required: !1
		},
		arrowPadding: {
			type: Number,
			required: !1
		},
		hideShiftedArrow: {
			type: Boolean,
			required: !1
		},
		sticky: {
			type: String,
			required: !1
		},
		hideWhenDetached: {
			type: Boolean,
			required: !1
		},
		positionStrategy: {
			type: String,
			required: !1
		},
		updatePositionStrategy: {
			type: String,
			required: !1
		},
		disableUpdateOnLayoutShift: {
			type: Boolean,
			required: !1
		},
		prioritizePosition: {
			type: Boolean,
			required: !1,
			default: !0
		},
		reference: {
			type: null,
			required: !1
		},
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1
		}
	},
	emits: [
		"escapeKeyDown",
		"pointerDownOutside",
		"focusOutside",
		"interactOutside",
		"entryFocus",
		"openAutoFocus",
		"closeAutoFocus"
	],
	setup(e, { emit: t }) {
		let n = Z(e, t), r = Rt(), i = zt(), c = Kn(), l = Vt(), { forwardRef: u, currentElement: d } = Q();
		return c.contentId ||= Et(void 0, "reka-menu-sub-content"), (e, t) => (s(), N(I(Ot), { present: e.forceMount || I(r).open.value }, {
			default: S(() => [f(Lt, a(I(n), {
				id: I(c).contentId,
				ref: I(u),
				"aria-labelledby": I(c).triggerId,
				align: "start",
				side: I(i).dir.value === "rtl" ? "left" : "right",
				"disable-outside-pointer-events": !1,
				"disable-outside-scroll": !1,
				"trap-focus": !1,
				onOpenAutoFocus: t[0] ||= k((e) => {
					I(i).isUsingKeyboardRef.value && I(d)?.focus();
				}, ["prevent"]),
				onCloseAutoFocus: t[1] ||= k(() => {}, ["prevent"]),
				onFocusOutside: t[2] ||= (e) => {
					if (e.defaultPrevented) return;
					let t = I(l).filterElement.value?.contains(e.target);
					e.target !== I(c).trigger.value && !t && I(r).onOpenChange(!1);
				},
				onEscapeKeyDown: t[3] ||= (e) => {
					I(i).onClose(), e.preventDefault();
				},
				onKeydown: t[4] ||= (e) => {
					let t = e.currentTarget?.contains(e.target), n = I(kt)[I(i).dir.value].includes(e.key);
					t && n && (I(r).onOpenChange(!1), I(l).filterElement.value ? (I(l).filterElement.value.focus(), I(l).highlightedElement.value = I(c).trigger.value, I(c).trigger.value?.scrollIntoView({ block: "nearest" })) : I(c).trigger.value?.focus(), e.preventDefault());
				}
			}), {
				default: S(() => [o(e.$slots, "default")]),
				_: 3
			}, 16, [
				"id",
				"aria-labelledby",
				"side"
			])]),
			_: 3
		}, 8, ["present"]));
	}
}), Xn = /* @__PURE__ */ r({
	__name: "MenuSubTrigger",
	props: {
		disabled: {
			type: Boolean,
			required: !1
		},
		textValue: {
			type: String,
			required: !1
		},
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1
		}
	},
	setup(t) {
		let n = t, r = Rt(), i = zt(), l = Kn(), u = Vt();
		h(r.open, (e) => {
			e ? u.activeSubmenuContext.value = {
				onOpenChange: r.onOpenChange,
				trigger: l.trigger
			} : u.activeSubmenuContext.value?.trigger.value === l.trigger.value && (u.activeSubmenuContext.value = void 0);
		});
		let d = x(null);
		l.triggerId ||= Et(void 0, "reka-menu-sub-trigger");
		function p() {
			d.value && window.clearTimeout(d.value), d.value = null;
		}
		e(() => {
			p();
		});
		function m(e) {
			jt(e) && (u.onItemEnter(e) || !n.disabled && !r.open.value && !d.value && (u.onPointerGraceIntentChange(null), d.value = window.setTimeout(() => {
				r.onOpenChange(!0), p();
			}, 100)));
		}
		async function g(e) {
			if (!jt(e)) return;
			p();
			let t = r.content.value?.getBoundingClientRect();
			if (t?.width) {
				let n = r.content.value?.dataset.side, i = n === "right", a = i ? -5 : 5, o = t[i ? "left" : "right"], s = t[i ? "right" : "left"];
				u.onPointerGraceIntentChange({
					area: [
						{
							x: e.clientX + a,
							y: e.clientY
						},
						{
							x: o,
							y: t.top
						},
						{
							x: s,
							y: t.top
						},
						{
							x: s,
							y: t.bottom
						},
						{
							x: o,
							y: t.bottom
						}
					],
					side: n
				}), window.clearTimeout(u.pointerGraceTimerRef.value), u.pointerGraceTimerRef.value = window.setTimeout(() => u.onPointerGraceIntentChange(null), 300);
			} else {
				if (u.onTriggerLeave(e)) return;
				u.onPointerGraceIntentChange(null);
			}
		}
		async function _(e) {
			let t = u.searchRef.value !== "";
			n.disabled || t && e.key === " " || At[i.dir.value].includes(e.key) && (r.onOpenChange(!0), await c(), r.content.value?.focus(), e.preventDefault());
		}
		return (e, t) => (s(), N(Ht, { "as-child": "" }, {
			default: S(() => [f(qt, a(n, {
				id: I(l).triggerId,
				ref: (e) => {
					e && I(l)?.onTriggerChange(e?.$el);
				},
				"aria-haspopup": "menu",
				"aria-expanded": I(r).open.value,
				"aria-controls": I(l).contentId,
				"data-state": I(Dt)(I(r).open.value),
				onClick: t[0] ||= async (e) => {
					n.disabled || e.defaultPrevented || (e.currentTarget?.focus(), I(r).open.value || I(r).onOpenChange(!0));
				},
				onPointermove: m,
				onPointerleave: g,
				onKeydown: _
			}), {
				default: S(() => [o(e.$slots, "default")]),
				_: 3
			}, 16, [
				"id",
				"aria-expanded",
				"aria-controls",
				"data-state"
			])]),
			_: 3
		}));
	}
}), [Zn, Qn] = /*#__PURE__*/ wt("ContextMenuRoot"), $n = /* @__PURE__ */ r({
	inheritAttrs: !1,
	__name: "ContextMenuRoot",
	props: {
		pressOpenDelay: {
			type: Number,
			required: !1,
			default: 700
		},
		dir: {
			type: String,
			required: !1
		},
		modal: {
			type: Boolean,
			required: !1,
			default: !0
		}
	},
	emits: ["update:open"],
	setup(e, { emit: t }) {
		let n = e, r = t, { dir: i, modal: a, pressOpenDelay: c } = w(n);
		Q();
		let l = Xt(i), u = x(!1);
		return Qn({
			open: u,
			onOpenChange: (e) => {
				u.value = e;
			},
			dir: l,
			modal: a,
			triggerElement: x(),
			pressOpenDelay: c
		}), h(u, (e) => {
			r("update:open", e);
		}), (e, t) => (s(), N(I(Yt), {
			open: u.value,
			"onUpdate:open": t[0] ||= (e) => u.value = e,
			dir: I(l),
			modal: I(a)
		}, {
			default: S(() => [o(e.$slots, "default")]),
			_: 3
		}, 8, [
			"open",
			"dir",
			"modal"
		]));
	}
}), er = /* @__PURE__ */ r({
	__name: "ContextMenuContent",
	props: {
		forceMount: {
			type: Boolean,
			required: !1
		},
		loop: {
			type: Boolean,
			required: !1
		},
		memoDependencies: {
			type: Array,
			required: !1
		},
		sideFlip: {
			type: Boolean,
			required: !1
		},
		alignOffset: {
			type: Number,
			required: !1,
			default: 0
		},
		alignFlip: {
			type: Boolean,
			required: !1
		},
		avoidCollisions: {
			type: Boolean,
			required: !1,
			default: !0
		},
		collisionBoundary: {
			type: null,
			required: !1,
			default: () => []
		},
		collisionPadding: {
			type: [Number, Object],
			required: !1,
			default: 0
		},
		hideShiftedArrow: {
			type: Boolean,
			required: !1
		},
		sticky: {
			type: String,
			required: !1,
			default: "partial"
		},
		hideWhenDetached: {
			type: Boolean,
			required: !1,
			default: !1
		},
		positionStrategy: {
			type: String,
			required: !1
		},
		disableUpdateOnLayoutShift: {
			type: Boolean,
			required: !1
		},
		prioritizePosition: {
			type: Boolean,
			required: !1
		},
		reference: {
			type: null,
			required: !1
		},
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1
		}
	},
	emits: [
		"escapeKeyDown",
		"pointerDownOutside",
		"focusOutside",
		"interactOutside",
		"closeAutoFocus"
	],
	setup(e, { emit: t }) {
		let n = Z(e, t);
		Q();
		let r = Zn(), i = x(!1);
		return (e, t) => (s(), N(I(It), a(I(n), {
			side: "right",
			"side-offset": 2,
			align: "start",
			"update-position-strategy": "always",
			style: {
				"--reka-context-menu-content-transform-origin": "var(--reka-popper-transform-origin)",
				"--reka-context-menu-content-available-width": "var(--reka-popper-available-width)",
				"--reka-context-menu-content-available-height": "var(--reka-popper-available-height)",
				"--reka-context-menu-trigger-width": "var(--reka-popper-anchor-width)",
				"--reka-context-menu-trigger-height": "var(--reka-popper-anchor-height)"
			},
			onCloseAutoFocus: t[0] ||= (e) => {
				!e.defaultPrevented && i.value && e.preventDefault(), i.value = !1;
			},
			onInteractOutside: t[1] ||= (e) => {
				e.detail.originalEvent.button === 2 && e.target === I(r).triggerElement.value && e.preventDefault(), !e.defaultPrevented && !I(r).modal.value && (i.value = !0);
			}
		}), {
			default: S(() => [o(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), tr = /* @__PURE__ */ r({
	__name: "ContextMenuItem",
	props: {
		disabled: {
			type: Boolean,
			required: !1
		},
		textValue: {
			type: String,
			required: !1
		},
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1
		}
	},
	emits: ["select"],
	setup(e, { emit: t }) {
		let n = e, r = Tt(t);
		return Q(), (e, t) => (s(), N(I(Wt), d(D({
			...n,
			...I(r)
		})), {
			default: S(() => [o(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), nr = /* @__PURE__ */ r({
	__name: "ContextMenuPortal",
	props: {
		to: {
			type: null,
			required: !1
		},
		disabled: {
			type: Boolean,
			required: !1
		},
		defer: {
			type: Boolean,
			required: !1
		},
		forceMount: {
			type: Boolean,
			required: !1
		}
	},
	setup(e) {
		let t = e;
		return (e, n) => (s(), N(I(Bt), d(D(t)), {
			default: S(() => [o(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), rr = /* @__PURE__ */ r({
	__name: "ContextMenuSeparator",
	props: {
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1
		}
	},
	setup(e) {
		let t = e;
		return Q(), (e, n) => (s(), N(I(Kt), d(D(t)), {
			default: S(() => [o(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), ir = /* @__PURE__ */ r({
	__name: "ContextMenuSub",
	props: {
		defaultOpen: {
			type: Boolean,
			required: !1
		},
		open: {
			type: Boolean,
			required: !1,
			default: void 0
		}
	},
	emits: ["update:open"],
	setup(e, { emit: t }) {
		let n = e, r = t;
		Q();
		let i = dt(n, "open", r, {
			defaultValue: n.defaultOpen,
			passive: n.open === void 0
		});
		return (e, t) => (s(), N(I(Jn), {
			open: I(i),
			"onUpdate:open": t[0] ||= (e) => te(i) ? i.value = e : null
		}, {
			default: S(() => [o(e.$slots, "default", { open: I(i) })]),
			_: 3
		}, 8, ["open"]));
	}
}), ar = /* @__PURE__ */ r({
	__name: "ContextMenuSubContent",
	props: {
		forceMount: {
			type: Boolean,
			required: !1
		},
		loop: {
			type: Boolean,
			required: !1
		},
		memoDependencies: {
			type: Array,
			required: !1
		},
		sideOffset: {
			type: Number,
			required: !1
		},
		sideFlip: {
			type: Boolean,
			required: !1
		},
		alignOffset: {
			type: Number,
			required: !1
		},
		alignFlip: {
			type: Boolean,
			required: !1
		},
		avoidCollisions: {
			type: Boolean,
			required: !1
		},
		collisionBoundary: {
			type: null,
			required: !1
		},
		collisionPadding: {
			type: [Number, Object],
			required: !1
		},
		arrowPadding: {
			type: Number,
			required: !1
		},
		hideShiftedArrow: {
			type: Boolean,
			required: !1
		},
		sticky: {
			type: String,
			required: !1
		},
		hideWhenDetached: {
			type: Boolean,
			required: !1
		},
		positionStrategy: {
			type: String,
			required: !1
		},
		updatePositionStrategy: {
			type: String,
			required: !1
		},
		disableUpdateOnLayoutShift: {
			type: Boolean,
			required: !1
		},
		prioritizePosition: {
			type: Boolean,
			required: !1
		},
		reference: {
			type: null,
			required: !1
		},
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1
		}
	},
	emits: [
		"escapeKeyDown",
		"pointerDownOutside",
		"focusOutside",
		"interactOutside",
		"entryFocus",
		"openAutoFocus",
		"closeAutoFocus"
	],
	setup(e, { emit: t }) {
		let n = Z(e, t);
		return Q(), (e, t) => (s(), N(I(Yn), a(I(n), { style: {
			"--reka-context-menu-content-transform-origin": "var(--reka-popper-transform-origin)",
			"--reka-context-menu-content-available-width": "var(--reka-popper-available-width)",
			"--reka-context-menu-content-available-height": "var(--reka-popper-available-height)",
			"--reka-context-menu-trigger-width": "var(--reka-popper-anchor-width)",
			"--reka-context-menu-trigger-height": "var(--reka-popper-anchor-height)"
		} }), {
			default: S(() => [o(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), or = /* @__PURE__ */ r({
	__name: "ContextMenuSubTrigger",
	props: {
		disabled: {
			type: Boolean,
			required: !1
		},
		textValue: {
			type: String,
			required: !1
		},
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1
		}
	},
	setup(e) {
		let t = e;
		return Q(), (e, n) => (s(), N(I(Xn), d(D(t)), {
			default: S(() => [o(e.$slots, "default")]),
			_: 3
		}, 16));
	}
});
function sr(e) {
	return e.pointerType !== "mouse";
}
var cr = /* @__PURE__ */ r({
	inheritAttrs: !1,
	__name: "ContextMenuTrigger",
	props: {
		disabled: {
			type: Boolean,
			required: !1,
			default: !1
		},
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
		let { disabled: n } = w(e), { forwardRef: r, currentElement: i } = Q(), l = Zn(), u = x({
			x: 0,
			y: 0
		}), d = F(() => ({ getBoundingClientRect: () => ({
			width: 0,
			height: 0,
			left: u.value.x,
			right: u.value.x,
			top: u.value.y,
			bottom: u.value.y,
			...u.value
		}) })), p = x(0);
		function m() {
			window.clearTimeout(p.value);
		}
		function h(e) {
			u.value = {
				x: e.clientX,
				y: e.clientY
			}, l.onOpenChange(!0);
		}
		async function g(e) {
			n.value || (await c(), e.defaultPrevented || (m(), h(e), e.preventDefault()));
		}
		async function _(e) {
			n.value || (await c(), sr(e) && !e.defaultPrevented && (m(), p.value = window.setTimeout(h, l.pressOpenDelay.value, e)));
		}
		async function v(e) {
			n.value || (await c(), sr(e) && !e.defaultPrevented && m());
		}
		return se(() => {
			i.value && (l.triggerElement.value = i.value);
		}), (e, i) => (s(), t(T, null, [f(I(Ht), {
			as: "template",
			reference: d.value
		}, null, 8, ["reference"]), f(I(Nt), a({
			ref: I(r),
			as: e.as,
			"as-child": e.asChild,
			"data-state": I(l).open.value ? "open" : "closed",
			"data-disabled": I(n) ? "" : void 0,
			style: {
				WebkitTouchCallout: "none",
				pointerEvents: "auto"
			}
		}, e.$attrs, {
			onContextmenu: g,
			onPointerdown: _,
			onPointermove: v,
			onPointercancel: v,
			onPointerup: v
		}), {
			default: S(() => [o(e.$slots, "default")]),
			_: 3
		}, 16, [
			"as",
			"as-child",
			"data-state",
			"data-disabled"
		])], 64));
	}
}), lr = /* @__PURE__ */ r({
	__name: "ContextMenu",
	props: {
		pressOpenDelay: {},
		dir: {},
		modal: { type: Boolean }
	},
	emits: ["update:open"],
	setup(e, { emit: t }) {
		let n = e, r = Z(n, t);
		return (e, t) => (s(), N(I($n), a(I(r), { modal: !I(le)() && n.modal }), {
			default: S(() => [o(e.$slots, "default")]),
			_: 3
		}, 16, ["modal"]));
	}
}), ur = /* @__PURE__ */ r({
	__name: "ContextMenuShortcut",
	props: { class: { type: [
		Boolean,
		null,
		String,
		Object,
		Array
	] } },
	setup(e) {
		let n = e;
		return (e, r) => (s(), t("span", { class: P(I(Pt)("ml-auto text-xs tracking-widest text-muted-foreground", n.class)) }, [o(e.$slots, "default")], 2));
	}
}), dr = /* @__PURE__ */ r({
	__name: "ContextMenuSub",
	props: {
		defaultOpen: { type: Boolean },
		open: { type: Boolean }
	},
	emits: ["update:open"],
	setup(e, { emit: t }) {
		let n = Z(e, t);
		return (e, t) => (s(), N(I(ir), d(D(I(n))), {
			default: S(() => [o(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), fr = /* @__PURE__ */ r({
	__name: "ContextMenuSubContent",
	props: {
		forceMount: { type: Boolean },
		loop: { type: Boolean },
		memoDependencies: {},
		sideOffset: {},
		sideFlip: { type: Boolean },
		alignOffset: {},
		alignFlip: { type: Boolean },
		avoidCollisions: { type: Boolean },
		collisionBoundary: {},
		collisionPadding: {},
		arrowPadding: {},
		hideShiftedArrow: { type: Boolean },
		sticky: {},
		hideWhenDetached: { type: Boolean },
		positionStrategy: {},
		updatePositionStrategy: {},
		disableUpdateOnLayoutShift: { type: Boolean },
		prioritizePosition: { type: Boolean },
		reference: {},
		asChild: { type: Boolean },
		as: {},
		class: { type: [
			Boolean,
			null,
			String,
			Object,
			Array
		] }
	},
	emits: [
		"escapeKeyDown",
		"pointerDownOutside",
		"focusOutside",
		"interactOutside",
		"entryFocus",
		"openAutoFocus",
		"closeAutoFocus"
	],
	setup(e, { emit: t }) {
		let n = e, r = t, i = F(() => {
			let { class: e, ...t } = n;
			return t;
		}), c = Z(i, r);
		return (e, t) => (s(), N(I(ar), a(I(c), { class: I(Pt)("z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2", n.class) }), {
			default: S(() => [o(e.$slots, "default")]),
			_: 3
		}, 16, ["class"]));
	}
}), pr = $({
	name: "arrow-up-from-line",
	size: 24,
	node: [
		["path", {
			d: "m18 9-6-6-6 6",
			key: "kcunyi"
		}],
		["path", {
			d: "M12 3v14",
			key: "7cf3v8"
		}],
		["path", {
			d: "M5 21h14",
			key: "11awu3"
		}]
	]
}), mr = $({
	name: "clipboard-paste",
	size: 24,
	node: [
		["path", {
			d: "M11 14h10",
			key: "1w8e9d"
		}],
		["path", {
			d: "M16 4h2a2 2 0 0 1 2 2v1.344",
			key: "1e62lh"
		}],
		["path", {
			d: "m17 18 4-4-4-4",
			key: "z2g111"
		}],
		["path", {
			d: "M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 1.793-1.113",
			key: "bjbb7m"
		}],
		["rect", {
			x: "8",
			y: "2",
			width: "8",
			height: "4",
			rx: "1",
			key: "ublpy"
		}]
	]
}), hr = $({
	name: "copy",
	size: 24,
	node: [["rect", {
		width: "14",
		height: "14",
		x: "8",
		y: "8",
		rx: "2",
		ry: "2",
		key: "17jyea"
	}], ["path", {
		d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
		key: "zix9uf"
	}]]
}), gr = $({
	name: "file-code",
	size: 24,
	node: [
		["path", {
			d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
			key: "1oefj6"
		}],
		["path", {
			d: "M14 2v5a1 1 0 0 0 1 1h5",
			key: "wfsgrz"
		}],
		["path", {
			d: "M10 12.5 8 15l2 2.5",
			key: "1tg20x"
		}],
		["path", {
			d: "m14 12.5 2 2.5-2 2.5",
			key: "yinavb"
		}]
	]
}), _r = $({
	name: "file-image",
	size: 24,
	node: [
		["path", {
			d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
			key: "1oefj6"
		}],
		["path", {
			d: "M14 2v5a1 1 0 0 0 1 1h5",
			key: "wfsgrz"
		}],
		["circle", {
			cx: "10",
			cy: "12",
			r: "2",
			key: "737tya"
		}],
		["path", {
			d: "m20 17-1.296-1.296a2.41 2.41 0 0 0-3.408 0L9 22",
			key: "wt3hpn"
		}]
	]
}), vr = $({
	name: "file-up",
	size: 24,
	node: [
		["path", {
			d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
			key: "1oefj6"
		}],
		["path", {
			d: "M14 2v5a1 1 0 0 0 1 1h5",
			key: "wfsgrz"
		}],
		["path", {
			d: "M12 12v6",
			key: "3ahymv"
		}],
		["path", {
			d: "m15 15-3-3-3 3",
			key: "15xj92"
		}]
	]
}), yr = $({
	name: "import",
	size: 24,
	node: [
		["path", {
			d: "M12 3v12",
			key: "1x0j5s"
		}],
		["path", {
			d: "m8 11 4 4 4-4",
			key: "1dohi6"
		}],
		["path", {
			d: "M8 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4",
			key: "1ywtjm"
		}]
	]
}), br = $({
	name: "rotate-ccw",
	size: 24,
	node: [["path", {
		d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",
		key: "1357e3"
	}], ["path", {
		d: "M3 3v5h5",
		key: "1xhq8a"
	}]]
}), xr = $({
	name: "square-function",
	size: 24,
	node: [
		["rect", {
			width: "18",
			height: "18",
			x: "3",
			y: "3",
			rx: "2",
			ry: "2",
			key: "1m3agn"
		}],
		["path", {
			d: "M9 17c2 0 2.8-1 2.8-2.8V10c0-2 1-3.3 3.2-3",
			key: "m1af9g"
		}],
		["path", {
			d: "M9 11.2h5.7",
			key: "3zgcl2"
		}]
	],
	aliases: ["function-square"]
}), Sr = /* @__PURE__ */ r({
	__name: "ContextMenuSubTrigger",
	props: {
		disabled: { type: Boolean },
		textValue: {},
		asChild: { type: Boolean },
		as: {},
		class: { type: [
			Boolean,
			null,
			String,
			Object,
			Array
		] },
		inset: { type: Boolean }
	},
	setup(e) {
		let t = e, n = F(() => {
			let { class: e, ...n } = t;
			return n;
		}), r = Mt(n);
		return (n, i) => (s(), N(I(or), a(I(r), { class: I(Pt)("flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground", e.inset && "pl-8", t.class) }), {
			default: S(() => [o(n.$slots, "default"), f(I(wn), { class: "ml-auto h-4 w-4" })]),
			_: 3
		}, 16, ["class"]));
	}
}), Cr = /* @__PURE__ */ r({
	__name: "ContextMenuContent",
	props: {
		forceMount: { type: Boolean },
		loop: { type: Boolean },
		memoDependencies: {},
		sideFlip: { type: Boolean },
		alignOffset: {},
		alignFlip: { type: Boolean },
		avoidCollisions: { type: Boolean },
		collisionBoundary: {},
		collisionPadding: {},
		hideShiftedArrow: { type: Boolean },
		sticky: {},
		hideWhenDetached: { type: Boolean },
		positionStrategy: {},
		disableUpdateOnLayoutShift: { type: Boolean },
		prioritizePosition: { type: Boolean },
		reference: {},
		asChild: { type: Boolean },
		as: {},
		class: { type: [
			Boolean,
			null,
			String,
			Object,
			Array
		] }
	},
	emits: [
		"escapeKeyDown",
		"pointerDownOutside",
		"focusOutside",
		"interactOutside",
		"closeAutoFocus"
	],
	setup(e, { emit: t }) {
		let n = e, r = t, i = F(() => {
			let { class: e, ...t } = n;
			return t;
		}), c = Z(i, r);
		return (e, t) => (s(), N(I(nr), { to: I(fe)() }, {
			default: S(() => [f(I(er), a(I(c), { class: I(Pt)("z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2", n.class) }), {
				default: S(() => [o(e.$slots, "default")]),
				_: 3
			}, 16, ["class"])]),
			_: 3
		}, 8, ["to"]));
	}
}), wr = /* @__PURE__ */ r({
	__name: "ContextMenuSeparator",
	props: {
		asChild: { type: Boolean },
		as: {},
		class: { type: [
			Boolean,
			null,
			String,
			Object,
			Array
		] }
	},
	setup(e) {
		let t = e, n = F(() => {
			let { class: e, ...n } = t;
			return n;
		});
		return (e, r) => (s(), N(I(rr), a(I(n), { class: I(Pt)("-mx-1 my-1 h-px bg-border", t.class) }), null, 16, ["class"]));
	}
}), Tr = /* @__PURE__ */ r({
	__name: "ContextMenuItem",
	props: {
		disabled: { type: Boolean },
		textValue: {},
		asChild: { type: Boolean },
		as: {},
		class: { type: [
			Boolean,
			null,
			String,
			Object,
			Array
		] },
		inset: { type: Boolean }
	},
	emits: ["select"],
	setup(e, { emit: t }) {
		let n = e, r = t, i = F(() => {
			let { class: e, ...t } = n;
			return t;
		}), c = Z(i, r);
		return (t, r) => (s(), N(I(tr), a(I(c), { class: I(Pt)("relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50", e.inset && "pl-8", n.class) }), {
			default: S(() => [o(t.$slots, "default")]),
			_: 3
		}, 16, ["class"]));
	}
}), Er = /* @__PURE__ */ r({
	__name: "ContextMenuTrigger",
	props: {
		disabled: { type: Boolean },
		asChild: { type: Boolean },
		as: {}
	},
	setup(e) {
		let t = Mt(e);
		return (e, n) => (s(), N(I(cr), d(D(I(t))), {
			default: S(() => [o(e.$slots, "default")]),
			_: 3
		}, 16));
	}
});
function Dr(e) {
	function t(t) {
		let n = I(e);
		if (I(e)) switch (t) {
			case `${G}-B`:
				Re(n);
				break;
			case `${G}-I`:
				Pe(n);
				break;
			case `${G}-D`:
				Ae(n);
				break;
			case `${G}-K`:
				Be(n);
				break;
			case `${G}-E`:
				H(n);
				break;
			case `${G}-1`:
				W(n, 1);
				break;
			case `${G}-2`:
				W(n, 2);
				break;
			case `${G}-3`:
				W(n, 3);
				break;
			case `${G}-4`:
				W(n, 4);
				break;
			case `${G}-5`:
				W(n, 5);
				break;
			case `${G}-6`:
				W(n, 6);
				break;
			case `${G}-U`:
				Ie(n);
				break;
			case `${G}-O`: ke(n);
		}
	}
	return { addFormat: t };
}
var Or = ee("export", () => {
	let e = it(), t = U();
	return {
		editorContent2HTML: () => he(),
		exportEditorContent2HTML: async () => {
			let t = e.currentPost;
			t && await Ue(t.title);
		},
		exportEditorContent2PureHTML: (t) => {
			let n = e.currentPost;
			n && we(t, n.title);
		},
		downloadAsCardImage: async () => {
			let n = e.currentPost;
			n && await We(n.title, { previewDevice: t.previewDevice });
		},
		downloadAsSegmentedImages: async (n = je) => {
			let r = e.currentPost;
			if (!r) return;
			let i = Y.loading(J("store.png.segmentsStart"));
			try {
				let e = await Ve(r.title, {
					previewDevice: t.previewDevice,
					maxSegmentHeight: n,
					onProgress: (e, t) => {
						Y.loading(J("store.png.segmentsProgress", {
							done: e,
							total: t
						}), { id: i });
					}
				});
				e === 0 ? Y.error(J("store.png.segmentsEmpty"), { id: i }) : Y.success(J("store.png.segmentsDone", { count: e }), { id: i });
			} catch (e) {
				let t = e instanceof Error ? e.message : String(e);
				Y.error(J("store.png.segmentsFailed", { message: t }), { id: i });
			}
		},
		exportEditorContent2PDF: async (t) => {
			let n = e.currentPost;
			n && await V(n.title, t);
		},
		exportEditorContent2MD: (t) => {
			let n = e.currentPost;
			n && zn(t, n.title);
		}
	};
}), kr = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, Ar = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, jr = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, Mr = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, Nr = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, Pr = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, Fr = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, Ir = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, Lr = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, Rr = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, zr = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, Br = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, Vr = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, Hr = /* @__PURE__ */ r({
	__name: "EditorContextMenu",
	setup(n) {
		let r = R(), i = jn(), a = Le(), c = at(), l = Or(), d = ze(), m = Fe(), h = U(), { t: g } = q(), { openTableEditDialog: y, toggleShowUploadImgDialog: b, toggleShowImportMdDialog: C, toggleShowComponentDialog: w, toggleShowEmojiManager: E } = h, D = x(!1), ee = x(null);
		function te(e) {
			let t = O(c.editor);
			if (!t || !t.contentDOM.contains(e.target)) return;
			let n = t.posAtCoords({
				x: e.clientX,
				y: e.clientY
			});
			if (ee.value = n, n == null) return;
			let { from: r, to: i } = t.state.selection.main;
			(n < r || n > i) && t.dispatch({ selection: { anchor: n } });
		}
		se(() => document.addEventListener("contextmenu", te, !0)), e(() => document.removeEventListener("contextmenu", te, !0));
		function k(e) {
			if (!e) {
				ee.value = null;
				return;
			}
			let t = O(c.editor), n = ee.value ?? t?.state.selection.main.head;
			D.value = t != null && n != null && On(t.state.doc.toString(), n) !== null;
		}
		let { editor: ne } = _(c), { addFormat: A } = Dr(ne), { formatContent: ie, resetContent: ae, clearContent: oe } = gn(), P = [
			Sn,
			cn,
			Cn,
			bn,
			on,
			fn
		], ce = F(() => Ke.map((e, t) => ({
			...e,
			icon: P[t],
			label: g("menu.headingN", { n: e.level })
		})));
		function le() {
			let e = An(c.getSelection());
			h.openFormulaEditor({
				value: e.latex,
				displayMode: e.displayMode
			});
		}
		async function ue() {
			let e = c.getSelection();
			Jt(e);
		}
		async function L() {
			let e = await Ut();
			(!r || r.live && !r.signal.aborted) && e !== null && c.replaceSelection(e);
		}
		function de() {
			i.confirm({
				title: g("confirm.tip"),
				description: g("confirm.resetStyleDescription"),
				onConfirm: () => {
					m.resetStyle(), a.resetCssConfig(), m.applyCurrentTheme(), m.updateCodeTheme();
					let e = c.getContent();
					d.render(e), Y.success(g("toast.styleReset"));
				}
			});
		}
		function fe() {
			l.exportEditorContent2HTML();
		}
		function pe() {
			h.openPdfExportDialog();
		}
		function me() {
			l.exportEditorContent2MD(c.getContent());
		}
		function he() {
			l.downloadAsCardImage();
		}
		function z(e) {
			l.downloadAsSegmentedImages(e);
		}
		return (e, n) => {
			let i = Er, a = Tr, c = wr, l = Cr, d = Sr, m = fr, h = dr, _ = ur, x = lr;
			return s(), N(x, { "onUpdate:open": k }, {
				default: S(() => [f(i, null, {
					default: S(() => [o(e.$slots, "default")]),
					_: 3
				}), I(r) ? (s(), N(l, {
					key: 0,
					class: "w-56"
				}, {
					default: S(() => [
						f(a, { onClick: n[0] ||= (e) => I(b)() }, {
							default: S(() => [...n[33] ||= [j("插入图片", -1)]]),
							_: 1
						}),
						f(a, { onClick: n[1] ||= (e) => le() }, {
							default: S(() => [...n[34] ||= [j("编辑公式", -1)]]),
							_: 1
						}),
						f(a, { onClick: n[2] ||= (e) => I(y)() }, {
							default: S(() => [...n[35] ||= [j("编辑表格", -1)]]),
							_: 1
						}),
						f(c),
						f(a, { onClick: n[3] ||= (e) => I(A)(`${I(G)}-B`) }, {
							default: S(() => [...n[36] ||= [j("加粗", -1)]]),
							_: 1
						}),
						f(a, { onClick: n[4] ||= (e) => I(A)(`${I(G)}-I`) }, {
							default: S(() => [...n[37] ||= [j("斜体", -1)]]),
							_: 1
						}),
						f(a, { onClick: n[5] ||= (e) => I(ie)() }, {
							default: S(() => [...n[38] ||= [j("格式化正文", -1)]]),
							_: 1
						}),
						f(a, { onClick: n[6] ||= (e) => de() }, {
							default: S(() => [...n[39] ||= [j("恢复默认排版", -1)]]),
							_: 1
						}),
						f(a, { onClick: n[7] ||= (e) => I(oe)() }, {
							default: S(() => [...n[40] ||= [j("清空正文", -1)]]),
							_: 1
						}),
						f(c),
						f(a, { onClick: n[8] ||= (e) => ue() }, {
							default: S(() => [...n[41] ||= [j("复制选中文字", -1)]]),
							_: 1
						}),
						f(a, { onClick: n[9] ||= (e) => L() }, {
							default: S(() => [...n[42] ||= [j("粘贴文字", -1)]]),
							_: 1
						})
					]),
					_: 1
				})) : (s(), N(l, {
					key: 1,
					class: "w-64 max-h-[80vh] overflow-y-auto"
				}, {
					default: S(() => [
						I(D) ? (s(), t(T, { key: 0 }, [f(a, { onClick: n[10] ||= (e) => I(y)() }, {
							default: S(() => [f(I(ln), { class: "mr-2 h-4 w-4" }), j(" " + M(I(g)("tableEditor.titleEdit")), 1)]),
							_: 1
						}), f(c)], 64)) : u("", !0),
						f(h, null, {
							default: S(() => [f(d, null, {
								default: S(() => [f(I(yr), { class: "mr-2 h-4 w-4" }), j(" " + M(I(g)("menu.insert")), 1)]),
								_: 1
							}), f(m, { class: "w-48" }, {
								default: S(() => [
									f(a, { onClick: n[11] ||= (e) => I(b)() }, {
										default: S(() => [f(I(pn), { class: "mr-2 h-4 w-4" }), j(" " + M(I(g)("menu.image")), 1)]),
										_: 1
									}),
									f(a, { onClick: n[12] ||= (e) => le() }, {
										default: S(() => [f(I(xr), { class: "mr-2 h-4 w-4" }), j(" " + M(I(g)("menu.formula")), 1)]),
										_: 1
									}),
									f(a, { onClick: n[13] ||= (e) => I(y)() }, {
										default: S(() => [f(I(ln), { class: "mr-2 h-4 w-4" }), j(" " + M(I(g)("menu.table")), 1)]),
										_: 1
									}),
									f(a, { onClick: n[14] ||= (e) => I(w)() }, {
										default: S(() => [f(I(xn), { class: "mr-2 h-4 w-4" }), j(" " + M(I(g)("menu.component")), 1)]),
										_: 1
									}),
									f(a, { onClick: n[15] ||= (e) => I(E)() }, {
										default: S(() => [f(I(an), { class: "mr-2 h-4 w-4" }), j(" " + M(I(g)("menu.emoji")), 1)]),
										_: 1
									})
								]),
								_: 1
							})]),
							_: 1
						}),
						f(h, null, {
							default: S(() => [f(d, null, {
								default: S(() => [f(I(vn), { class: "mr-2 h-4 w-4" }), j(" " + M(I(g)("contextMenu.textFormat")), 1)]),
								_: 1
							}), f(m, { class: "w-48" }, {
								default: S(() => [
									f(a, { onClick: n[16] ||= (e) => I(A)(`${I(G)}-B`) }, {
										default: S(() => [
											f(I(rn), { class: "mr-2 h-4 w-4" }),
											j(" " + M(I(g)("menu.bold")) + " ", 1),
											f(_, null, {
												default: S(() => [v("kbd", kr, M(I(K)), 1), n[43] ||= v("kbd", { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, "B", -1)]),
												_: 1
											})
										]),
										_: 1
									}),
									f(a, { onClick: n[17] ||= (e) => I(A)(`${I(G)}-I`) }, {
										default: S(() => [
											f(I(hn), { class: "mr-2 h-4 w-4" }),
											j(" " + M(I(g)("menu.italic")) + " ", 1),
											f(_, null, {
												default: S(() => [v("kbd", Ar, M(I(K)), 1), n[44] ||= v("kbd", { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, "I", -1)]),
												_: 1
											})
										]),
										_: 1
									}),
									f(a, { onClick: n[18] ||= (e) => I(A)(`${I(G)}-D`) }, {
										default: S(() => [
											f(I(mn), { class: "mr-2 h-4 w-4" }),
											j(" " + M(I(g)("menu.strikethrough")) + " ", 1),
											f(_, null, {
												default: S(() => [v("kbd", jr, M(I(K)), 1), n[45] ||= v("kbd", { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, "D", -1)]),
												_: 1
											})
										]),
										_: 1
									}),
									f(c),
									f(a, { onClick: n[19] ||= (e) => I(A)(`${I(G)}-K`) }, {
										default: S(() => [
											f(I(_n), { class: "mr-2 h-4 w-4" }),
											j(" " + M(I(g)("menu.link")) + " ", 1),
											f(_, null, {
												default: S(() => [v("kbd", Mr, M(I(K)), 1), n[46] ||= v("kbd", { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, "K", -1)]),
												_: 1
											})
										]),
										_: 1
									}),
									f(a, { onClick: n[20] ||= (e) => I(A)(`${I(G)}-E`) }, {
										default: S(() => [
											f(I(gr), { class: "mr-2 h-4 w-4" }),
											j(" " + M(I(g)("menu.inlineCode")) + " ", 1),
											f(_, null, {
												default: S(() => [v("kbd", Nr, M(I(K)), 1), n[47] ||= v("kbd", { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, "E", -1)]),
												_: 1
											})
										]),
										_: 1
									})
								]),
								_: 1
							})]),
							_: 1
						}),
						f(h, null, {
							default: S(() => [f(d, null, {
								default: S(() => [f(I(Sn), { class: "mr-2 h-4 w-4" }), j(" " + M(I(g)("menu.heading")), 1)]),
								_: 1
							}), f(m, { class: "w-48" }, {
								default: S(() => [(s(!0), t(T, null, p(I(ce), ({ level: e, icon: t, label: n }) => (s(), N(a, {
									key: e,
									onClick: (t) => I(A)(`${I(G)}-${e}`)
								}, {
									default: S(() => [
										(s(), N(re(t), { class: "mr-2 h-4 w-4" })),
										j(" " + M(n) + " ", 1),
										f(_, null, {
											default: S(() => [v("kbd", Pr, M(I(K)), 1), v("kbd", Fr, M(e), 1)]),
											_: 2
										}, 1024)
									]),
									_: 2
								}, 1032, ["onClick"]))), 128))]),
								_: 1
							})]),
							_: 1
						}),
						f(a, { onClick: n[21] ||= (e) => I(A)(`${I(G)}-U`) }, {
							default: S(() => [
								f(I(un), { class: "mr-2 h-4 w-4" }),
								j(" " + M(I(g)("menu.unorderedList")) + " ", 1),
								f(_, null, {
									default: S(() => [v("kbd", Ir, M(I(K)), 1), n[48] ||= v("kbd", { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, "U", -1)]),
									_: 1
								})
							]),
							_: 1
						}),
						f(a, { onClick: n[22] ||= (e) => I(A)(`${I(G)}-O`) }, {
							default: S(() => [
								f(I(dn), { class: "mr-2 h-4 w-4" }),
								j(" " + M(I(g)("menu.orderedList")) + " ", 1),
								f(_, null, {
									default: S(() => [v("kbd", Lr, M(I(K)), 1), n[49] ||= v("kbd", { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, "O", -1)]),
									_: 1
								})
							]),
							_: 1
						}),
						f(c),
						f(a, { onClick: n[23] ||= (e) => I(C)(!0) }, {
							default: S(() => [f(I(vr), { class: "mr-2 h-4 w-4" }), j(" " + M(I(g)("contextMenu.importMd")), 1)]),
							_: 1
						}),
						f(h, null, {
							default: S(() => [f(d, null, {
								default: S(() => [f(I(Tn), { class: "mr-2 h-4 w-4" }), j(" " + M(I(g)("menu.export")), 1)]),
								_: 1
							}), f(m, { class: "w-48" }, {
								default: S(() => [
									f(a, { onClick: n[24] ||= (e) => me() }, {
										default: S(() => [f(I(Tn), { class: "mr-2 h-4 w-4" }), j(" " + M(I(g)("contextMenu.exportMd")), 1)]),
										_: 1
									}),
									f(a, { onClick: n[25] ||= (e) => fe() }, {
										default: S(() => [f(I(gr), { class: "mr-2 h-4 w-4" }), j(" " + M(I(g)("contextMenu.exportHtml")), 1)]),
										_: 1
									}),
									f(a, { onClick: n[26] ||= (e) => pe() }, {
										default: S(() => [f(I(En), { class: "mr-2 h-4 w-4" }), j(" " + M(I(g)("contextMenu.exportPdf")), 1)]),
										_: 1
									}),
									f(a, { onClick: n[27] ||= (e) => he() }, {
										default: S(() => [f(I(_r), { class: "mr-2 h-4 w-4" }), j(" " + M(I(g)("contextMenu.exportPng")), 1)]),
										_: 1
									}),
									f(h, null, {
										default: S(() => [f(d, null, {
											default: S(() => [f(I(_r), { class: "mr-2 h-4 w-4" }), j(" " + M(I(g)("contextMenu.exportPngSegments")), 1)]),
											_: 1
										}), f(m, { class: "w-48" }, {
											default: S(() => [(s(!0), t(T, null, p(I(De), (e) => (s(), N(a, {
												key: e,
												onClick: (t) => z(e)
											}, {
												default: S(() => [j(M(I(g)("menu.exportPngSegmentHeight", { height: e })), 1)]),
												_: 2
											}, 1032, ["onClick"]))), 128))]),
											_: 1
										})]),
										_: 1
									})
								]),
								_: 1
							})]),
							_: 1
						}),
						f(c),
						f(a, { onClick: n[28] ||= (e) => I(ie)() }, {
							default: S(() => [
								f(I(vn), { class: "mr-2 h-4 w-4" }),
								j(" " + M(I(g)("menu.formatContent")) + " ", 1),
								f(_, null, {
									default: S(() => [
										v("kbd", Rr, M(I(qe)), 1),
										v("kbd", zr, M(I(Ye)), 1),
										n[50] ||= v("kbd", { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, "F", -1)
									]),
									_: 1
								})
							]),
							_: 1
						}),
						f(a, { onClick: n[29] ||= (e) => I(ae)() }, {
							default: S(() => [f(I(yn), { class: "mr-2 h-4 w-4" }), j(" " + M(I(g)("menu.reset")), 1)]),
							_: 1
						}),
						f(a, { onClick: n[30] ||= (e) => de() }, {
							default: S(() => [f(I(br), { class: "mr-2 h-4 w-4" }), j(" " + M(I(g)("contextMenu.resetStyle")), 1)]),
							_: 1
						}),
						f(a, { onClick: n[31] ||= (e) => I(oe)() }, {
							default: S(() => [f(I(Dn), { class: "mr-2 h-4 w-4" }), j(" " + M(I(g)("menu.clear")), 1)]),
							_: 1
						}),
						f(c),
						f(a, { onClick: n[32] ||= (e) => ue() }, {
							default: S(() => [
								f(I(hr), { class: "mr-2 h-4 w-4" }),
								j(" " + M(I(g)("menu.copy")) + " ", 1),
								f(_, null, {
									default: S(() => [v("kbd", Br, M(I(K)), 1), n[51] ||= v("kbd", { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, "C", -1)]),
									_: 1
								})
							]),
							_: 1
						}),
						f(a, { onClick: L }, {
							default: S(() => [
								f(I(mr), { class: "mr-2 h-4 w-4" }),
								j(" " + M(I(g)("menu.paste")) + " ", 1),
								f(_, null, {
									default: S(() => [v("kbd", Vr, M(I(K)), 1), n[52] ||= v("kbd", { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, "V", -1)]),
									_: 1
								})
							]),
							_: 1
						})
					]),
					_: 1
				}))]),
				_: 3
			});
		};
	}
}), Ur = /<[A-Z]*$/i, Wr = /<([A-Z][A-Za-z0-9]*)\b([^>]*?)\s([a-zA-Z][\w-]*)?$/, Gr = /* @__PURE__ */ new Set([
	"FencedCode",
	"CodeBlock",
	"InlineCode"
]), Kr = "<svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/></svg>", qr = "<svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 7h16\"/><path d=\"M4 12h10\"/><path d=\"M4 17h7\"/></svg>";
function Jr(e, t = 42) {
	if (!e) return;
	let n = e.trim();
	return n.length <= t ? n : `${n.slice(0, t - 1)}…`;
}
function Yr(e) {
	let t = document.createElement("li");
	return t.className = "md-completion-section", t.setAttribute("aria-hidden", "true"), t.textContent = e.name, t;
}
function Xr() {
	return {
		name: J("component.completionSectionComponents"),
		rank: 1,
		header: Yr
	};
}
function Zr() {
	return {
		name: J("component.completionSectionProps"),
		rank: 1,
		header: Yr
	};
}
function Qr(e) {
	try {
		let t = ht(e.state).resolveInner(e.pos, -1);
		for (let e = t; e; e = e.parent) if (Gr.has(e.name)) return !0;
	} catch {}
	return !1;
}
function $r(e) {
	let t = document.createElement("span");
	return t.className = "md-completion-icon", e.type === "property" ? (t.classList.add("md-completion-icon--prop"), t.innerHTML = qr, t.title = J("component.completionSectionProps")) : (t.classList.add("md-completion-icon--component"), t.innerHTML = Kr, t.title = J("component.completionSectionComponents")), t;
}
function ei(e, t, n, r) {
	let i = B(t), a = n > 0 && e.state.doc.sliceString(n - 1, n) === "<" ? n - 1 : n;
	e.dispatch({
		changes: {
			from: a,
			to: r,
			insert: i
		},
		selection: { anchor: a + i.length }
	});
}
function ti(e, t) {
	let n = e.matchBefore(Ur);
	if (!n) return null;
	let r = n.text.slice(1);
	if (!e.explicit && r.length > 0 && !/^[A-Z]/.test(r)) return null;
	let i = n.from + 1, a = r.toLowerCase(), o = Xr(), s = t.filter((e) => !a || e.name.toLowerCase().startsWith(a)).map((e) => ({
		label: e.name,
		detail: Jr(e.description),
		type: "class",
		boost: +!!e.builtIn,
		section: o,
		apply: (t, n, r, i) => {
			ei(t, e, r, i);
		}
	}));
	return !s.length && !e.explicit ? null : {
		from: i,
		options: s,
		validFor: /^[A-Z]*$/i
	};
}
function ni(e, t) {
	let n = e.state.doc.lineAt(e.pos), r = e.state.doc.sliceString(n.from, e.pos), i = r.match(Wr);
	if (!i) return null;
	let a = i[1], o = i[2] ?? "", s = i[3] ?? "", c = t.find((e) => e.name === a);
	if (!c || !c.props.length) return null;
	let l = r.slice(r.indexOf(`<${a}`) + a.length + 1);
	if (!/^\s/.test(l) && !o) return null;
	let u = be(o), d = s.toLowerCase(), f = Zr(), p = c.props.filter((e) => !u.has(e.name) && (!d || e.name.toLowerCase().startsWith(d))).map((e) => ({
		label: e.name,
		detail: Jr(e.description || e.type || "string"),
		type: "property",
		section: f,
		apply: (t, n, r, i) => {
			let a = `${e.name}=""`;
			t.dispatch({
				changes: {
					from: r,
					to: i,
					insert: a
				},
				selection: { anchor: r + a.length - 1 }
			});
		}
	}));
	return !p.length && !e.explicit ? null : {
		from: s ? e.pos - s.length : e.pos,
		options: p,
		validFor: /^[\w-]*$/
	};
}
function ri(e) {
	return (t) => {
		if (Qr(t)) return null;
		let n = e();
		return n.length ? ni(t, n) ?? ti(t, n) : null;
	};
}
function ii(e) {
	return [mt({
		override: [ri(e)],
		defaultKeymap: !1,
		activateOnTyping: !0,
		icons: !1,
		aboveCursor: !1,
		tooltipClass: () => "md-completion-tooltip",
		optionClass: (e) => e.type === "property" ? "md-completion-option md-completion-option--prop" : "md-completion-option md-completion-option--component",
		addToOptions: [{
			position: 25,
			render: (e) => $r(e)
		}]
	}), vt.high(yt.of(ft.filter((e) => e.key !== "Tab")))];
}
async function ai(e, t) {
	let { fileUpload: n } = await import("./chunks/providers-5OiUFt8V.js");
	return n(e, t);
}
var oi = "uploaded_image_map";
function si(e, t) {
	return `${e}:${t}`;
}
function ci() {
	let e = x(!1), t = x(null), n = async () => await Xe.getJSON(oi, {}) ?? {}, r = async (e, t) => {
		let r = await n();
		r[e] = t, await Xe.setJSON(oi, r);
	}, i = async (e) => {
		let t = await e.arrayBuffer(), n = await crypto.subtle.digest("SHA-256", t);
		return Array.from(new Uint8Array(n), (e) => e.toString(16).padStart(2, "0")).join("");
	}, a = async (e) => {
		let t = ((e) => e.split("/").pop()?.split("?")[0] || `image-${Date.now()}.png`)(e), n = e.replace(/^http:\/\//i, "https://"), r = async (e, t) => {
			let n = await fetch(e, t);
			if (!n.ok) throw Error(`Status: ${n.status}`);
			return await n.blob();
		};
		try {
			let e = await r(n, { referrerPolicy: "no-referrer" });
			return new File([e], t, { type: e.type });
		} catch (e) {
			console.warn(`Direct fetch failed for ${n}, trying proxy...`, e);
			try {
				let e = await r(`https://wsrv.nl/?url=${encodeURIComponent(n)}`);
				return new File([e], t, { type: e.type });
			} catch (e) {
				console.error(`Proxy fetch failed for ${n}`, e);
				let t = e.message.includes("Failed to fetch") || e.name === "TypeError" ? J("store.uploader.corsFailed") : J("store.uploader.downloadFailed", { message: e.message });
				throw Error(t);
			}
		}
	};
	return {
		upload: async (o) => {
			let s = R();
			if (s) {
				if (!s.live || s.signal.aborted) throw Error("稿件已关闭");
				if (typeof o == "string") throw Error("请从 CreatorOS 素材库选择图片");
				let e = await s.importMedia(o);
				if (!s.live || s.signal.aborted) throw Error("稿件已改变，导入回执未应用");
				if (!/^creatoros-asset:[^:\s]+:[^\s]+$/.test(e.mediaId)) throw Error("素材导入没有返回精确素材引用");
				let t = /^creatoros-asset:([^:\s]+):([^\s]+)$/.exec(e.mediaId), n = `${t[1]}:${t[2]}`, r = s.imageUrls.get(n);
				return s.imageBlobs.set(n, o), s.imageUrls.set(n, URL.createObjectURL(o)), r && URL.revokeObjectURL(r), e.mediaId;
			}
			e.value = !0, t.value = null;
			try {
				let e;
				e = typeof o == "string" ? await a(o) : o;
				let t = await i(e), s = si(await Xe.get("imgHost") || "default", t), c = await n();
				if (c[s]) return c[s];
				let l = await ai(await Ge(e), e);
				return l && await r(s, l), l;
			} catch (e) {
				console.error(e);
				let n = e.message || J("store.uploader.uploadFailed");
				throw t.value = n, Error(n);
			} finally {
				e.value = !1;
			}
		},
		isUploading: e,
		error: t
	};
}
var li = "app-initial-loader", ui = !1, di;
function fi() {
	ui || (ui = !0, di &&= (clearTimeout(di), void 0), requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			let e = L(li);
			e instanceof HTMLElement && (e.style.transition = "opacity 0.3s ease", e.style.opacity = "0", window.setTimeout(() => e.remove(), 300));
		});
	}));
}
var pi = 2e4, mi = 5e3, hi = 50, gi = !1;
async function _i(e = mi) {
	let t = Date.now() + e;
	for (; Date.now() < t;) {
		let e = L("output");
		if (e) return e;
		await xe(hi);
	}
	return L("output");
}
async function vi() {
	gi || (gi = !0, await _i(), await z(pi), fi());
}
var yi = {
	"zh-CN": {
		MpProfile: "<MpProfile mpId=\"MzIxNjA5ODQ0OQ==\" nickname=\"Doocs\" headimg=\"https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/gh/doocs/md/images/mp-logo.png\" signature=\"GitHub 开源组织\" serviceType=\"1\" verifyStatus=\"1\" />",
		QRCodeBlock: "<QRCodeBlock url=\"https://md.doocs.org\" text=\"扫码访问\" size=\"150\" />",
		AuthorBlock: "<AuthorBlock name=\"yanglbme\" avatar=\"https://avatars.githubusercontent.com/u/21008209?v=4\" bio=\"Doocs 创建者\" />",
		TipBlock: "<TipBlock type=\"info\" title=\"提示\" content=\"这是一条提示信息\" />",
		TableBlock: "<TableBlock headers='[\"名称\",\"版本\",\"状态\"]' rows='[[\"Vue\",\"3.x\",\"稳定\"],[\"Vite\",\"8.x\",\"稳定\"],[\"pnpm\",\"10.x\",\"稳定\"]]' caption=\"技术栈清单\" />",
		InfoGrid: "<InfoGrid items='[{\"label\":\"作者\",\"value\":\"yanglbme\"},{\"label\":\"版本\",\"value\":\"v1.0\"},{\"label\":\"许可证\",\"value\":\"MIT\"},{\"label\":\"语言\",\"value\":\"TypeScript\"}]' cols=\"2\" />",
		BadgeGroup: "<BadgeGroup tags='[\"Vue 3\",\"TypeScript\",\"Vite\",\"Tailwind CSS\"]' color=\"#07c160\" />",
		Emoji: "<Emoji id=\"liulei\" alt=\"流泪\" />"
	},
	"zh-TW": {
		MpProfile: "<MpProfile mpId=\"MzIxNjA5ODQ0OQ==\" nickname=\"Doocs\" headimg=\"https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/gh/doocs/md/images/mp-logo.png\" signature=\"GitHub 開源組織\" serviceType=\"1\" verifyStatus=\"1\" />",
		QRCodeBlock: "<QRCodeBlock url=\"https://md.doocs.org\" text=\"掃碼造訪\" size=\"150\" />",
		AuthorBlock: "<AuthorBlock name=\"yanglbme\" avatar=\"https://avatars.githubusercontent.com/u/21008209?v=4\" bio=\"Doocs 建立者\" />",
		TipBlock: "<TipBlock type=\"info\" title=\"提示\" content=\"這是一條提示資訊\" />",
		TableBlock: "<TableBlock headers='[\"名稱\",\"版本\",\"狀態\"]' rows='[[\"Vue\",\"3.x\",\"穩定\"],[\"Vite\",\"8.x\",\"穩定\"],[\"pnpm\",\"10.x\",\"穩定\"]]' caption=\"技術棧清單\" />",
		InfoGrid: "<InfoGrid items='[{\"label\":\"作者\",\"value\":\"yanglbme\"},{\"label\":\"版本\",\"value\":\"v1.0\"},{\"label\":\"授權條款\",\"value\":\"MIT\"},{\"label\":\"語言\",\"value\":\"TypeScript\"}]' cols=\"2\" />",
		BadgeGroup: "<BadgeGroup tags='[\"Vue 3\",\"TypeScript\",\"Vite\",\"Tailwind CSS\"]' color=\"#07c160\" />",
		Emoji: "<Emoji id=\"liulei\" alt=\"流淚\" />"
	},
	"en-US": {
		MpProfile: "<MpProfile mpId=\"MzIxNjA5ODQ0OQ==\" nickname=\"Doocs\" headimg=\"https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/gh/doocs/md/images/mp-logo.png\" signature=\"Open-source organization on GitHub\" serviceType=\"1\" verifyStatus=\"1\" />",
		QRCodeBlock: "<QRCodeBlock url=\"https://md.doocs.org\" text=\"Scan to visit\" size=\"150\" />",
		AuthorBlock: "<AuthorBlock name=\"yanglbme\" avatar=\"https://avatars.githubusercontent.com/u/21008209?v=4\" bio=\"Creator of Doocs\" />",
		TipBlock: "<TipBlock type=\"info\" title=\"Tip\" content=\"This is a tip message\" />",
		TableBlock: "<TableBlock headers='[\"Name\",\"Version\",\"Status\"]' rows='[[\"Vue\",\"3.x\",\"Stable\"],[\"Vite\",\"8.x\",\"Stable\"],[\"pnpm\",\"10.x\",\"Stable\"]]' caption=\"Tech stack\" />",
		InfoGrid: "<InfoGrid items='[{\"label\":\"Author\",\"value\":\"yanglbme\"},{\"label\":\"Version\",\"value\":\"v1.0\"},{\"label\":\"License\",\"value\":\"MIT\"},{\"label\":\"Language\",\"value\":\"TypeScript\"}]' cols=\"2\" />",
		BadgeGroup: "<BadgeGroup tags='[\"Vue 3\",\"TypeScript\",\"Vite\",\"Tailwind CSS\"]' color=\"#07c160\" />",
		Emoji: "<Emoji id=\"liulei\" alt=\"tears\" />"
	},
	"ja-JP": {
		MpProfile: "<MpProfile mpId=\"MzIxNjA5ODQ0OQ==\" nickname=\"Doocs\" headimg=\"https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/gh/doocs/md/images/mp-logo.png\" signature=\"GitHub のオープンソース組織\" serviceType=\"1\" verifyStatus=\"1\" />",
		QRCodeBlock: "<QRCodeBlock url=\"https://md.doocs.org\" text=\"スキャンしてアクセス\" size=\"150\" />",
		AuthorBlock: "<AuthorBlock name=\"yanglbme\" avatar=\"https://avatars.githubusercontent.com/u/21008209?v=4\" bio=\"Doocs の創設者\" />",
		TipBlock: "<TipBlock type=\"info\" title=\"ヒント\" content=\"これはヒントメッセージです\" />",
		TableBlock: "<TableBlock headers='[\"名前\",\"バージョン\",\"状態\"]' rows='[[\"Vue\",\"3.x\",\"安定\"],[\"Vite\",\"8.x\",\"安定\"],[\"pnpm\",\"10.x\",\"安定\"]]' caption=\"技術スタック\" />",
		InfoGrid: "<InfoGrid items='[{\"label\":\"作者\",\"value\":\"yanglbme\"},{\"label\":\"バージョン\",\"value\":\"v1.0\"},{\"label\":\"ライセンス\",\"value\":\"MIT\"},{\"label\":\"言語\",\"value\":\"TypeScript\"}]' cols=\"2\" />",
		BadgeGroup: "<BadgeGroup tags='[\"Vue 3\",\"TypeScript\",\"Vite\",\"Tailwind CSS\"]' color=\"#07c160\" />",
		Emoji: "<Emoji id=\"liulei\" alt=\"涙\" />"
	}
};
function bi(e, t, n) {
	return yi[e]?.[t] ?? n;
}
function xi(e, t) {
	let n = new Map(e.map((e) => [e.name, e]));
	for (let e of t) {
		let t = n.get(e.name);
		t?.hidden || t?.inline || n.set(e.name, e);
	}
	return [...n.values()];
}
function Si(e, t, n, r) {
	let i = `component.builtinComponents.${e.name}`, a = e.props.map((e) => {
		let t = `${i}.props.${e.name}`, a = `${i}.propDefaults.${e.name}`;
		return {
			...e,
			description: r(t) ? n(t) : e.description,
			default: r(a) ? n(a) : e.default
		};
	});
	return {
		...e,
		description: r(`${i}.description`) ? n(`${i}.description`) : e.description,
		props: a,
		example: bi(t, e.name, e.example)
	};
}
function Ci(e, t, n) {
	return lt.map((r) => Si(r, e, t, n));
}
function wi() {
	let { t: e, te: t, locale: n } = q(), r = Ne();
	return F(() => (n.value, xi(Ci(n.value, e, t), r.userComponents)));
}
var Ti = Pn.map((e) => e.id);
function Ei(e, t) {
	let n = `upload.hosts.${t}`, r = e(n);
	return r === n ? t : r;
}
function Di(e) {
	return Ti.map((t) => ({
		value: t,
		label: Ei(e, t),
		desc: ""
	}));
}
function Oi() {
	let { t: e, locale: t } = q();
	return F(() => (t.value, Di(e)));
}
function ki() {
	let e = x(!1), t = x({
		x: 0,
		y: 0,
		top: 0
	}), n = x(""), r = x(0), i = x(-1), { locale: a } = q(), o = F(() => (a.value, sn().filter((e) => !R() || e.id !== "component"))), s = F(() => {
		let e = n.value.toLowerCase().trim();
		return e ? o.value.filter((t) => t.label.toLowerCase().includes(e) || t.id.toLowerCase().includes(e) || t.keywords.some((t) => t.toLowerCase().includes(e))) : o.value;
	}), c = F(() => s.value.filter((e) => e.group === "basic")), l = F(() => s.value.filter((e) => e.group === "common")), u = F(() => s.value.filter((e) => e.group === "edit")), d = F(() => s.value.filter((e) => e.group === "style"));
	function f(a, o) {
		let s = a.coordsAtPos(o);
		s && (i.value = o, n.value = "", r.value = 0, t.value = {
			x: s.left,
			y: s.bottom,
			top: s.top
		}, e.value = !0);
	}
	function p() {
		e.value = !1, n.value = "", i.value = -1;
	}
	function m(e, t) {
		let n = i.value;
		if (n < 0) return;
		let r = e.state.selection.main.head;
		e.dispatch({ changes: {
			from: n,
			to: r,
			insert: ""
		} }), p(), t.action(e);
	}
	function h() {
		let e = s.value.length;
		e !== 0 && (r.value = (r.value + 1) % e);
	}
	function g() {
		let e = s.value.length;
		e !== 0 && (r.value = (r.value - 1 + e) % e);
	}
	function _(t) {
		return [X.updateListener.of((a) => {
			if (e.value && a.viewportChanged && !a.docChanged) {
				p();
				return;
			}
			if (!a.docChanged) return;
			let o = a.state, c = o.selection.main.head;
			if (!e.value) a.changes.iterChanges((e, n, r, i, a) => {
				if (a.length === 1 && a.toString() === "/") {
					let e = o.doc.lineAt(r), n = r > e.from ? o.doc.sliceString(r - 1, r) : "";
					if (r === e.from || n === " " || n === "	") {
						let e = t();
						e && f(e, r);
					}
				}
			});
			else {
				let e = i.value;
				if (e < 0 || c < e) {
					p();
					return;
				}
				let t = o.doc.sliceString(e, c);
				if (!t.startsWith("/")) {
					p();
					return;
				}
				n.value = t.slice(1), r.value = 0, s.value.length === 0 && p();
			}
		}), vt.highest(yt.of([
			{
				key: "ArrowDown",
				run: () => e.value ? (h(), !0) : !1
			},
			{
				key: "ArrowUp",
				run: () => e.value ? (g(), !0) : !1
			},
			{
				key: "Enter",
				run: (t) => {
					if (!e.value) return !1;
					let n = s.value[r.value];
					return n ? m(t, n) : p(), !0;
				}
			},
			{
				key: "Escape",
				run: () => e.value ? (p(), !0) : !1
			}
		]))];
	}
	return {
		visible: e,
		position: t,
		filter: n,
		activeIndex: r,
		filteredCommands: s,
		basicCommands: c,
		commonCommands: l,
		editCommands: u,
		styleCommands: d,
		allCommands: o,
		closeMenu: p,
		executeCommand: m,
		createExtension: _
	};
}
function Ai(e) {
	let t = [], n = "", r = 0, i = !1;
	for (let a = 1; a <= e.lines; a++) {
		let o = e.line(a).text, s = o.trimStart();
		if (a === 1 && s === "---") {
			i = !0;
			continue;
		}
		if (i) {
			(s === "---" || s === "...") && (i = !1);
			continue;
		}
		if (n) {
			let e = s.match(/^(`{3,}|~{3,})\s*$/);
			e && e[1][0] === n && e[1].length >= r && (n = "", r = 0);
			continue;
		}
		let c = s.match(/^(`{3,}|~{3,})/);
		if (c) {
			n = c[1][0], r = c[1].length;
			continue;
		}
		let l = o.match(/^(\s{0,3})(#{1,6})\s+(.+)/);
		if (l) {
			let e = l[2].length, n = l[3].replace(/\s*#+\s*$/, "").trim();
			t.push({
				title: n,
				level: e,
				line: a
			});
		}
	}
	return t;
}
function ji(e, t) {
	let n = Number.parseInt(e, 10);
	return Math.max(1, Math.min(Number.isFinite(n) && n > 0 ? n : 1, Math.max(t, 1)));
}
function Mi(e, t, n) {
	if (e.length === 0) return null;
	if (n === "prev") {
		let n = null;
		for (let r of e) if (r.line < t) n = r.line;
		else break;
		return n;
	}
	for (let n of e) if (n.line > t) return n.line;
	return null;
}
function Ni(e, t, n = "start") {
	let r = ji(String(t), e.state.doc.lines), i = e.state.doc.line(r);
	return e.dispatch({
		selection: { anchor: i.from },
		effects: X.scrollIntoView(i.from, { y: n })
	}), e.focus(), !0;
}
function Pi(e, t) {
	let n = Ai(e.state.doc), r = e.state.doc.lineAt(e.state.selection.main.head).number, i = Mi(n, r, t);
	return i != null && Ni(e, i);
}
var Fi = /\.(?:gif|pjp|jfif|jpe|pjpeg|jpe?g|png|webp)$/i, Ii = 10, Li = {
	"image/gif": "gif",
	"image/jpeg": "jpg",
	"image/pjpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp"
};
new Set(Object.keys(Li));
function Ri(e) {
	return Fi.test(e);
}
function zi(e) {
	return e in Li;
}
function Bi(e) {
	if (Ri(e.name)) return e;
	let t = Li[e.type] ?? "png", n = zi(e.type) ? e.type : "image/png";
	return new File([e], `pasted-image.${t}`, { type: n });
}
function Vi(e, t) {
	return !Ri(e.name) && !zi(e.type) ? {
		ok: !1,
		msg: t("upload.errors.invalidFormat")
	} : e.size > Ii * 1024 * 1024 ? {
		ok: !1,
		msg: t("upload.errors.tooLarge", { maxSize: Ii })
	} : { ok: !0 };
}
function Hi(e) {
	return zi(e.type) || Ri(e.name);
}
function Ui(e) {
	let t = [];
	for (let n of e) n && Hi(n) && t.push(Bi(n));
	return t;
}
function Wi(e) {
	if (!e) return [];
	let t = Ui(Array.from(e.items ?? []).map((e) => e.kind === "file" ? e.getAsFile() : null));
	return t.length > 0 ? t : Ui(Array.from(e.files ?? []));
}
var Gi = ["lang"], Ki = /*#__PURE__*/ Rn(/* @__PURE__ */ r({
	__name: "EditorPanel",
	setup(n, { expose: r }) {
		let a = i(() => import("./chunks/SlashCommandMenu-DPaa3PV4.js")), o = i(() => import("./chunks/SearchTab-D0a6QC6a.js")), { t: l, locale: d } = q(), p = Oi(), g = R(), y = !1, C = () => !y && (!g || g.live && !g.signal.aborted), w = at(), T = it(), E = ze(), D = Fe(), O = U(), ee = wi(), { upload: te } = ci(), { editorRefresh: k, scheduleEditorRefresh: re } = Mn(), { visible: A, position: ie, filter: ae, activeIndex: j, basicCommands: M, commonCommands: P, editCommands: F, styleCommands: ce, filteredCommands: le, closeMenu: ue, executeCommand: L, createExtension: de } = ki();
		function fe(e) {
			A.value && (e.preventDefault(), e.stopPropagation());
		}
		let { editor: me } = _(w), { isDark: he } = _(O), { posts: z, currentPostIndex: ge, currentPost: _e } = _(T), { enableImageReupload: ve, viewMode: ye } = _(O), { toggleShowUploadImgDialog: be } = O, B = ne(null), xe = new _t(), Se = new _t(), Ce = new _t();
		function we() {
			return xt(l("codemirror.contentPlaceholder"));
		}
		let Te = x(), Ee = m("editorRef"), De = m("codeMirrorWrapper"), V = x(!1), H = m("searchTabRef"), ke = x(!1), Ae = x(null);
		function je(e, t, n = !1) {
			n ? e.setSearchWithReplace(t) : t ? e.setSearchWord(t) : e.showSearchTab = !0;
		}
		function Ne() {
			ke.value = !0;
		}
		let { searchTabRequest: Pe } = _(O);
		function W(e) {
			Ne();
			let t = e.state.selection.main, n = e.state.doc.sliceString(t.from, t.to).trim();
			H.value ? je(H.value, n) : Ae.value = { selected: n };
		}
		function Ie(e) {
			Ne();
			let t = e.state.selection.main, n = e.state.doc.sliceString(t.from, t.to).trim();
			H.value ? H.value.setSearchWithReplace(n) : O.openSearchTab(n, !0);
		}
		h(H, (e) => {
			if (e && (Ae.value &&= (je(e, Ae.value.selected), null), Pe.value)) {
				let { word: t, showReplace: n } = Pe.value;
				je(e, t, n), O.clearSearchTabRequest();
			}
		}), h(Pe, (e) => {
			e && (Ne(), H.value && (je(H.value, e.word, e.showReplace), O.clearSearchTabRequest()));
		});
		function Le(e) {
			if (!C() || !pe(e)) return;
			let t = B.value;
			e.key === "Escape" && H.value?.showSearchTab && (H.value.showSearchTab = !1, e.preventDefault(), t?.focus());
		}
		async function Re(e) {
			if (g) return C();
			let t = Vi(e, l);
			if (!t.ok) return Y.error(t.msg), !1;
			let n = await Xe.get("imgHost") || "default";
			if (await Xe.set("imgHost", n), !await Nn(n)) {
				let e = p.value.find((e) => e.value === n)?.label ?? n;
				return Y.error(l("editorPanel.configureImgHost", { host: e })), be(!0), !1;
			}
			return !0;
		}
		function Be(e) {
			if (!e) {
				Y.error(l("editorPanel.uploadUnknownError"));
				return;
			}
			if (g || setTimeout(() => {
				be(!1);
			}, 1e3), !C()) return;
			let t = g ? `<img src="${e}" alt="图片">` : `![](${e})`;
			B.value && B.value.dispatch(B.value.state.replaceSelection(`\n${t}\n`)), Y.success(l("editorPanel.uploadSuccess"));
		}
		async function Ve(e) {
			let { default: t } = await import("./chunks/browser-image-compression-BN7VflS2.js");
			return await t(e, {
				maxSizeMB: 1,
				maxWidthOrHeight: 1920,
				useWebWorker: !0
			});
		}
		async function He(e, t, n) {
			try {
				if (V.value = !0, !C()) return;
				if (g) {
					let n = await te(e);
					if (!C()) return;
					if (t) {
						let r = await Ge(e);
						if (!C()) return;
						t(n, r);
					} else Be(n);
					return;
				}
				await Xe.get("useCompression") === "true" && (e = await Ve(e));
				let r = await te(e);
				if (t ? t(r, await Ge(e)) : Be(r), n) return Be(r);
			} catch (e) {
				if (!C()) return;
				Y.error(e instanceof Error ? e.message : l("store.uploader.uploadFailed")), t?.("", "");
			} finally {
				V.value = !1;
			}
		}
		async function Ue({ list: e }) {
			return new Promise((t) => {
				let { path: n, file: r } = e.find((e) => e.path.match(/\.md$/)), i = new FileReader();
				i.readAsText(r, "UTF-8"), i.onload = (e) => {
					t({
						str: e.target.result,
						file: r,
						path: n
					});
				};
			});
		}
		async function We(e) {
			let t = [], n = "";
			try {
				let r = [e];
				for (let e of r) {
					n += `${e.name}/`;
					for await (let [, i] of e) i.kind === "file" ? t.push({
						path: n + i.name,
						file: await i.getFile()
					}) : (t.push({ path: `${n + i.name}/` }), r.push(i));
				}
			} catch (e) {
				console.error(e);
			}
			return t;
		}
		async function Ke({ md: e, list: t }) {
			let n = [...e.str.matchAll(/!\[(.*?)\]\((.*?)\)/g) || []].filter((e) => e), r = e.path.match(/.+?\//)[0];
			(await Promise.all(n.map((e) => new Promise((n) => {
				let [, , i] = e;
				i = i.replace(/^.\//, "");
				let { file: a } = t.find((e) => e.path === `${r}${i}`) || {};
				He(a, (e) => n({
					matchStr: i,
					url: e
				}));
			})))).forEach((t) => {
				e.str = e.str.replace(`](./${t.matchStr})`, `](${t.url})`).replace(`](${t.matchStr})`, `](${t.url})`);
			}), B.value && B.value.dispatch({ changes: {
				from: 0,
				to: B.value.state.doc.length,
				insert: e.str
			} });
		}
		function qe() {
			let e = De.value;
			e && (e.ondragover = (e) => e.preventDefault(), e.ondrop = async (e) => {
				if (e.preventDefault(), e.dataTransfer != null && Array.isArray(e.dataTransfer.items)) for (let t of e.dataTransfer.items.filter((e) => e.kind === "file")) t.getAsFileSystemHandle().then(async (e) => {
					if (e.kind === "directory") {
						let t = await We(e);
						Ke({
							md: await Ue({ list: t }),
							list: t
						});
					} else {
						let t = await e.getFile();
						await Re(t) && He(t);
					}
				});
			});
		}
		function G() {
			return (e, t) => {
				if (!C() || !pe(e)) return !1;
				let n = Wi(e.clipboardData);
				if (n.length > 0) return V.value || (async () => {
					let e = [];
					for (let t of n) await Re(t) && e.push(t);
					for (let t of e) await He(t);
				})(), !0;
				let r = e.clipboardData?.getData("text/plain");
				if (r && !g) {
					let e = /!\[(.*?)\]\((https?:\/\/[^)]+)\)/g, n = [...r.matchAll(e)];
					if (n.length > 0) {
						V.value = !0;
						let i = r, a = /* @__PURE__ */ new Map(), o = 0;
						i = i.replace(e, (e, t, n) => {
							let r = `LOADING_${Date.now()}_${o++}`;
							return a.set(r, {
								originalUrl: n,
								originalAlt: t
							}), `![${l("editorPanel.reuploading")}](${r})`;
						}), t.dispatch(t.state.replaceSelection(i));
						let s = [...new Set(n.map((e) => e[2]))];
						return Promise.all(s.map(async (e) => {
							try {
								let n = ve.value ? await te(e) : e;
								for (let [r, i] of a.entries()) if (i.originalUrl === e) {
									let e = `![${l("editorPanel.reuploading")}](${r})`, a = t.state.doc.toString().indexOf(e);
									if (a !== -1) {
										let r = `![${i.originalAlt}](${n})`;
										t.dispatch({ changes: {
											from: a,
											to: a + e.length,
											insert: r
										} });
									}
								}
							} catch (n) {
								console.error(`转存失败: ${e}`, n);
								for (let [n, r] of a.entries()) if (r.originalUrl === e) {
									let e = `![${l("editorPanel.reuploading")}](${n})`, i = t.state.doc.toString().indexOf(e);
									if (i !== -1) {
										let n = `![${r.originalAlt}](${r.originalUrl})`;
										t.dispatch({ changes: {
											from: i,
											to: i + e.length,
											insert: n
										} });
									}
								}
								Y.error(l("editorPanel.reuploadFailed"));
							}
						})).finally(() => {
							V.value = !1;
						}), !0;
					}
				}
				return !1;
			};
		}
		function Ye(e) {
			let t = bt.create({
				doc: z.value[ge.value]?.content ?? "",
				extensions: [
					Oe({
						onSearch: W,
						onReplace: Ie,
						onGoToLine: () => O.requestGoToLine(),
						withoutHistory: !0
					}),
					Ce.of(gt()),
					vt.high(yt.of([{
						key: "Mod-Alt-ArrowUp",
						run: (e) => Pi(e, "prev")
					}, {
						key: "Mod-Alt-ArrowDown",
						run: (e) => Pi(e, "next")
					}])),
					Se.of(we()),
					xe.of(Me(he.value)),
					X.updateListener.of((e) => {
						if (e.docChanged) {
							if (!C()) return;
							re(), clearTimeout(Te.value), Te.value = setTimeout(() => {
								tt();
							}, 300);
						}
					}),
					X.domEventHandlers({
						paste: G(),
						drop: (e) => {
							if (!g || !pe(e) || !e.dataTransfer?.files.length) return !1;
							e.preventDefault();
							for (let t of Array.from(e.dataTransfer.files)) t.type.startsWith("image/") && He(t);
							return !0;
						}
					}),
					...de(() => B.value),
					...ii(() => ee.value)
				]
			}), n = new X({
				state: t,
				parent: e
			});
			return B.value = n, n;
		}
		function K() {
			k();
		}
		async function Ze(e) {
			if (st(e)) try {
				await ot();
			} catch (e) {
				console.error(e);
			}
		}
		let Qe = 0;
		function $e(e) {
			if (clearTimeout(Te.value), Te.value = void 0, !B.value || e < 0) return;
			let t = B.value.state.doc.toString(), n = z.value[e];
			n && t !== n.content && (n.updateDatetime = /* @__PURE__ */ new Date(), n.content = t);
		}
		function tt() {
			$e(ge.value);
		}
		se(() => {
			let e = Ee.value;
			if (e == null) {
				vi();
				return;
			}
			window.addEventListener(ct, K), document.addEventListener("keydown", Le, {
				passive: !1,
				capture: !1
			}), (async () => {
				try {
					if (await E.initRendererInstance({
						isMacCodeBlock: D.isMacCodeBlock,
						isShowLineNumber: D.isShowLineNumber
					}), !C() || (await D.applyCurrentTheme(), !C()) || (await c(), !C())) return;
					let t = Ye(e);
					me.value = t, w.registerContentFlush(tt);
					let n = z.value[ge.value]?.content ?? "";
					if (g || await Ze(n), !C()) return;
					k(), g || qe(), g?.readyResolve?.();
				} catch (e) {
					g?.readyReject?.(e), g?.onError(e instanceof Error ? e.message : "编辑器初始化失败"), console.error("[EditorPanel] Failed to initialize editor", e);
				} finally {
					vi();
				}
			})();
		}), h(he, () => {
			B.value && B.value.dispatch({ effects: xe.reconfigure(Me(he.value)) }), k();
		}), h(d, () => {
			B.value && (B.value.dispatch({ effects: Se.reconfigure(we()) }), k());
		});
		function J(e) {
			let t = B.value;
			if (!t || t.state.doc.toString() === e) return;
			let n = ++Qe;
			Bn(t, e), Vn(t, Ce), Ze(e).then(() => {
				n === Qe && k();
			});
		}
		h(ge, (e, t) => {
			t !== void 0 && t >= 0 && $e(t);
			let n = z.value[e];
			n && J(n.content);
		}), h(() => _e.value?.content, (e) => {
			e != null && J(e);
		});
		let nt = x();
		return se(() => {
			nt.value = setInterval(() => {
				if (!C()) return;
				let e = z.value[ge.value];
				e && (e.history || [])[0]?.content !== e.content && (e.history ??= [], e.history.unshift({
					content: e.content,
					datetime: Je()
				}), e.history.length = Math.min(e.history.length, 10));
			}, 3e4);
		}), e(() => {
			y = !0, B.value?.destroy(), B.value = null, me.value = null, w.unregisterContentFlush(), window.removeEventListener(ct, K), clearTimeout(nt.value), clearTimeout(Te.value), document.removeEventListener("keydown", Le, { capture: !1 });
		}), r({
			codeMirrorView: B,
			editorRefresh: k,
			uploadImage: He,
			isImgLoading: V
		}), (e, n) => {
			let r = Hr;
			return oe((s(), t("div", {
				ref_key: "codeMirrorWrapper",
				ref: De,
				class: "codeMirror-wrapper relative h-full",
				onContextmenuCapture: fe
			}, [
				I(ke) && I(B) ? (s(), N(I(o), {
					key: 0,
					ref_key: "searchTabRef",
					ref: H,
					"editor-view": I(B)
				}, null, 8, ["editor-view"])) : u("", !0),
				I(A) ? (s(), N(I(a), {
					key: 1,
					visible: I(A),
					position: I(ie),
					"active-index": I(j),
					filter: I(ae),
					"container-el": I(De),
					"basic-commands": I(M),
					"common-commands": I(P),
					"edit-commands": I(F),
					"style-commands": I(ce),
					"filtered-commands": I(le),
					onExecute: n[0] ||= (e) => I(B) && I(L)(I(B), e),
					onClose: n[1] ||= (e) => I(ue)()
				}, null, 8, [
					"visible",
					"position",
					"active-index",
					"filter",
					"container-el",
					"basic-commands",
					"common-commands",
					"edit-commands",
					"style-commands",
					"filtered-commands"
				])) : u("", !0),
				f(r, null, {
					default: S(() => [v("div", {
						id: "editor",
						ref_key: "editorRef",
						ref: Ee,
						class: "codemirror-container mathjax-ignore",
						lang: I(et)
					}, null, 8, Gi)]),
					_: 1
				})
			], 544)), [[b, I(ye) !== "preview"]]);
		};
	}
}), [["__scopeId", "data-v-5e90bfc7"]]), qi = /*#__PURE__*/ Rn(/* @__PURE__ */ r({
	__name: "BackTop",
	props: {
		left: {},
		top: {},
		right: {},
		bottom: {},
		visibilityHeight: {},
		target: {},
		onClick: { type: Function }
	},
	setup(t) {
		let r = t, { t: i } = q(), a = x(r.visibilityHeight ?? 400), o = x(!1), c = x(null), l = F(() => ({
			left: r.left == null ? void 0 : `${r.left}px`,
			top: r.top == null ? void 0 : `${r.top}px`,
			right: r.right == null ? void 0 : `${r.right}px`,
			bottom: r.bottom == null ? void 0 : `${r.bottom}px`
		}));
		function d(e) {
			c.value?.scrollTo({
				top: 0,
				left: 0,
				behavior: "smooth"
			}), r.onClick?.(e);
		}
		let p = ut((e) => {
			e instanceof HTMLElement ? o.value = e.scrollTop > a.value : o.value = window.scrollY > a.value;
		}, 200, !0, !0);
		function m() {
			p(c.value);
		}
		return se(() => {
			r.target ? c.value = L(r.target) : c.value = window, c.value?.addEventListener("scroll", m);
		}), e(() => {
			c.value?.removeEventListener("scroll", m);
		}), (e, t) => {
			let r = Ft;
			return s(), N(ie, { name: "back-top" }, {
				default: S(() => [I(o) ? (s(), N(r, {
					key: 0,
					variant: "outline",
					size: "icon",
					class: "absolute z-50 rounded-full border bg-background/90 text-foreground/80 shadow-md backdrop-blur-sm hover:bg-background hover:text-foreground hover:shadow-lg",
					style: n(I(l)),
					"aria-label": I(i)("common.backToTop"),
					title: I(i)("common.backToTop"),
					onClick: d
				}, {
					default: S(() => [f(I(pr), { class: "size-5" })]),
					_: 1
				}, 8, [
					"style",
					"aria-label",
					"title"
				])) : u("", !0)]),
				_: 1
			});
		};
	}
}), [["__scopeId", "data-v-ce240466"]]), Ji = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"11\" height=\"11\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><polyline points=\"7 10 12 15 17 10\"/><line x1=\"12\" y1=\"15\" x2=\"12\" y2=\"3\"/></svg>", Yi = ".mermaid-diagram, .plantuml-diagram";
function Xi(e, t) {
	let n = document.createElement("a");
	n.href = e, n.download = t, n.style.display = "none", ue(n), n.click(), n.remove();
}
function Zi(e) {
	let t = e.cloneNode(!0);
	return t.hasAttribute("xmlns") || t.setAttribute("xmlns", "http://www.w3.org/2000/svg"), t;
}
function Qi(e, t = "diagram") {
	let n = new XMLSerializer().serializeToString(Zi(e)), r = new Blob([n], { type: "image/svg+xml;charset=utf-8" }), i = URL.createObjectURL(r);
	Xi(i, `${t}.svg`), URL.revokeObjectURL(i);
}
function $i(e, t = "diagram") {
	let n = e.getBoundingClientRect(), r = n.width || e.viewBox?.baseVal?.width || 800, i = n.height || e.viewBox?.baseVal?.height || 600, a = Math.max(2, window.devicePixelRatio), o = Zi(e);
	o.setAttribute("width", String(r)), o.setAttribute("height", String(i));
	let s = new XMLSerializer().serializeToString(o), c = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
	return new Promise((e, n) => {
		let o = new Image();
		o.onload = () => {
			let s = document.createElement("canvas");
			s.width = Math.round(r * a), s.height = Math.round(i * a);
			let c = s.getContext("2d");
			if (!c) {
				n(/* @__PURE__ */ Error("No 2D canvas context"));
				return;
			}
			c.fillStyle = "#ffffff", c.fillRect(0, 0, s.width, s.height), c.scale(a, a), c.drawImage(o, 0, 0, r, i), s.toBlob((r) => {
				if (!r) {
					n(/* @__PURE__ */ Error("PNG blob generation failed"));
					return;
				}
				let i = URL.createObjectURL(r);
				Xi(i, `${t}.png`), URL.revokeObjectURL(i), e();
			}, "image/png");
		}, o.onerror = () => n(/* @__PURE__ */ Error("Failed to load SVG as image")), o.src = c;
	});
}
function ea(e, t) {
	let n = document.createElement("button");
	return n.className = "diagram-download-btn", n.type = "button", n.title = t, n.innerHTML = `${Ji}<span>${e}</span>`, n;
}
function ta(e, t) {
	let n = document.createElement("div");
	n.className = "diagram-download-bar";
	let r = ea("SVG", J("store.diagram.downloadSvg"));
	r.addEventListener("click", (n) => {
		n.preventDefault(), n.stopPropagation();
		let r = e.querySelector("svg");
		r && Qi(r, `diagram-${t}`);
	});
	let i = ea("PNG", J("store.diagram.downloadPng"));
	return i.addEventListener("click", async (n) => {
		n.preventDefault(), n.stopPropagation();
		let r = e.querySelector("svg");
		if (!r) return;
		i.disabled = !0;
		let a = i.innerHTML;
		i.innerHTML = "<span class=\"diagram-btn-loading\">•••</span>";
		try {
			await $i(r, `diagram-${t}`);
		} finally {
			i.disabled = !1, i.innerHTML = a;
		}
	}), n.append(r, i), n;
}
function na(e, t) {
	getComputedStyle(e).position === "static" && (e.style.position = "relative"), e.querySelector(".diagram-download-bar")?.remove(), e.appendChild(ta(e, t));
}
function ra(e) {
	let t = !1, n = 0;
	function r(e) {
		!t && e.querySelector("svg") && !e.querySelector(".diagram-download-bar") && na(e, ++n);
	}
	function i() {
		e.querySelectorAll(Yi).forEach(r);
	}
	i();
	let a = null, o = new MutationObserver(() => {
		t || a === null && (a = requestAnimationFrame(() => {
			a = null, t || i();
		}));
	});
	return o.observe(e, {
		childList: !0,
		subtree: !0
	}), {
		cleanup: () => {
			a !== null && cancelAnimationFrame(a), o.disconnect();
		},
		pause: () => {
			t = !0, a !== null && (cancelAnimationFrame(a), a = null), e.querySelectorAll(".diagram-download-bar").forEach((e) => e.remove());
		},
		resume: () => {
			t = !1, i();
		}
	};
}
function ia() {
	return $e();
}
function aa(e) {
	return {
		id: e.id,
		name: e.name,
		source: e.kind,
		createdAt: e.createdAt,
		updatedAt: e.updatedAt,
		maxItems: e.kind === "user" ? 100 : void 0,
		files: e.items.map((e) => ({
			id: e.id,
			name: e.name,
			mimeType: e.mime,
			size: e.size,
			url: e.url,
			width: e.width ?? void 0,
			height: e.height ?? void 0,
			sortOrder: e.sortOrder
		}))
	};
}
var oa = class extends Fn {
	async getDefault() {
		return aa(await this.request("GET", "/emojis/default"));
	}
	async getMine() {
		return aa(await this.request("GET", "/emojis/me"));
	}
	async renameMine(e) {
		return aa(await this.request("PATCH", "/emojis/me", { name: e }));
	}
	async upload(e) {
		let t = new FormData();
		return t.set("file", e), aa(await this.request("POST", "/emojis/me/items", t));
	}
	async removeItem(e) {
		return aa(await this.request("DELETE", `/emojis/me/items/${encodeURIComponent(e)}`));
	}
	clearMine() {
		return this.request("DELETE", "/emojis/me");
	}
};
function sa(e) {
	return e instanceof In ? e.message : "emoji_request_failed";
}
var ca = ee("emojiPack", () => {
	let e = Ln(), t = new oa(() => e.token || null), n = x(null), r = x(null), i = x(!1), a = x(!1), o = x(!1), s = x(0), c = x(0), l = x(null), u = x(null), d = F(() => [n.value, r.value].filter((e) => !!e)), f = F(() => d.value.flatMap((e) => e.files)), p = F(() => new Map(f.value.map((e) => [e.id, e]))), m = F(() => ia()), g = F(() => Math.max(0, 100 - (r.value?.files.length ?? 0)));
	function _(e) {
		n.value && ye(n.value.files.map((e) => e.id)), n.value = e, _e(e.files);
	}
	function v(e) {
		r.value && ye(r.value.files.map((e) => e.id)), r.value = e, e && _e(e.files);
	}
	async function y(e = !1) {
		if (!m.value || i.value || n.value && !e) return !!n.value;
		i.value = !0, l.value = null;
		try {
			return _(await t.getDefault()), !0;
		} catch (e) {
			return l.value = sa(e), !1;
		} finally {
			i.value = !1;
		}
	}
	async function b(n = !1) {
		if (!e.isLoggedIn) return v(null), !1;
		if (a.value || r.value && !n) return !!r.value;
		a.value = !0, u.value = null;
		try {
			return v(await t.getMine()), !0;
		} catch (e) {
			return u.value = sa(e), e instanceof In && e.status === 401 && v(null), !1;
		} finally {
			a.value = !1;
		}
	}
	async function S(n) {
		let r = n.trim();
		if (!r || !e.isLoggedIn) return !1;
		try {
			return v(await t.renameMine(r)), !0;
		} catch (e) {
			return u.value = sa(e), !1;
		}
	}
	async function C(n) {
		let r = n.slice(0, g.value);
		if (!e.isLoggedIn || !r.length) return 0;
		o.value = !0, s.value = 0, c.value = r.length, u.value = null;
		let i = 0, a = 0, l = !1;
		async function d() {
			for (; !l && a < r.length;) {
				let e = r[a++];
				try {
					await t.upload(e), i++, s.value = i;
				} catch (e) {
					u.value = sa(e), l = !0;
				}
			}
		}
		try {
			let e = Array.from({ length: Math.min(4, r.length) }, () => d());
			return await Promise.all(e), i && await b(!0), i;
		} finally {
			o.value = !1;
		}
	}
	async function w(e) {
		if (!r.value) return !1;
		try {
			return v(await t.removeItem(e)), !0;
		} catch (e) {
			return u.value = sa(e), !1;
		}
	}
	async function T() {
		if (!r.value) return !1;
		try {
			return await t.clearMine(), ye(r.value.files.map((e) => e.id)), v(null), b(!0);
		} catch (e) {
			return u.value = sa(e), !1;
		}
	}
	function E(e) {
		return p.value.get(e);
	}
	function D(e) {
		return ve(e);
	}
	async function O(e) {
		return Se(e);
	}
	return h(() => e.isLoggedIn, (e) => {
		e ? b(!0) : v(null);
	}), {
		defaultPack: n,
		userPack: r,
		packs: d,
		allFiles: f,
		filesById: p,
		loadingDefault: i,
		loadingUser: a,
		uploading: o,
		uploadDone: s,
		uploadTotal: c,
		defaultError: l,
		userError: u,
		isConfigured: m,
		remainingSlots: g,
		loadDefault: y,
		loadMine: b,
		renameUserPack: S,
		uploadFiles: C,
		removeUserFile: w,
		clearUserPack: T,
		findFile: E,
		resolveUrl: D,
		ensureLoaded: O
	};
});
function la(e) {
	let t = ca(), n = /* @__PURE__ */ new Set();
	function r(e) {
		return e.getAttribute("data-emoji-id") ?? e.getAttribute("data-asset-id");
	}
	async function i(e) {
		let n = r(e);
		if (!n) return;
		let i = await t.ensureLoaded(n);
		i && e.src !== i && (e.src = i);
	}
	function a(e) {
		let t = e.querySelectorAll("img.md-emoji[data-emoji-id], img.md-asset-img[data-asset-id]");
		for (let e of t) e.src && e.src !== "about:blank" || (n.add(e), i(e).finally(() => n.delete(e)));
	}
	a(e);
	let o = new MutationObserver((e) => {
		for (let t of e) t.addedNodes.forEach((e) => {
			e instanceof HTMLImageElement && (e.classList.contains("md-emoji") || e.classList.contains("md-asset-img")) ? (n.add(e), i(e).finally(() => n.delete(e))) : e instanceof HTMLElement && a(e);
		});
	});
	return o.observe(e, {
		childList: !0,
		subtree: !0
	}), () => o.disconnect();
}
var ua = { class: "relative h-full overflow-x-hidden" }, da = ["lang", "innerHTML"], fa = {
	key: 0,
	class: "loading-mask"
}, pa = { class: "loading-mask-box" }, ma = /*#__PURE__*/ Rn(/* @__PURE__ */ r({
	__name: "PreviewPanel",
	props: {
		backLight: { type: Boolean },
		isCoping: { type: Boolean },
		onContentClick: { type: Function }
	},
	setup(n, { expose: r }) {
		let i = n, { t: a } = q(), o = R(), l = !0, d = ze(), f = U(), { output: p } = _(d), { isDark: g, isMobile: y, viewMode: x, previewDevice: S } = _(f), C = F(() => y.value ? "w-full" : S.value === "mobile" ? "w-[375px]" : "w-full"), w = m("previewRef");
		async function T() {
			if (!l || o && (!o.live || o.signal.aborted)) return;
			let e = L("output");
			if (!e) return;
			let [{ hljs: t }, { highlightPendingBlocks: n }, { hydratePendingInfographicDiagrams: r }] = await Promise.all([
				import("./chunks/renderer-2bSccpei.js").then((e) => e.t),
				import("./chunks/utils-D7O4F-LG.js").then((e) => e.t),
				import("./chunks/utils-D7O4F-LG.js").then((e) => e.r)
			]);
			l && (!o || o.live && !o.signal.aborted) && (n(t, e), r(e, { themeMode: o ? "light" : g.value ? "dark" : "light" }));
		}
		function E() {
			c(() => {
				T().catch((e) => {
					console.error("[PreviewPanel] Failed to hydrate diagrams", e);
				});
			});
		}
		h(p, () => {
			E();
		}), h(x, () => {
			x.value !== "edit" && E();
		});
		let D = null, O = null;
		return h(() => i.isCoping, (e) => {
			e ? D?.pause() : c(() => D?.resume());
		}), se(() => {
			c(() => {
				let e = L("output");
				e && (D = ra(e), O = la(e), T().catch((e) => {
					console.error("[PreviewPanel] Failed to hydrate diagrams", e);
				}));
			});
		}), e(() => {
			l = !1, D?.cleanup(), O?.();
		}), r({ previewRef: w }), (e, r) => {
			let i = qi;
			return oe((s(), t("div", ua, [v("div", {
				id: "preview",
				ref_key: "previewRef",
				ref: w,
				class: "preview-wrapper w-full p-5 flex justify-center"
			}, [v("div", {
				id: "output-wrapper",
				class: P(["w-full max-w-full", { output_night: !I(o) && !n.backLight }])
			}, [v("div", { class: P(["preview border-x shadow-xl mx-auto", [I(C), I(C) === "w-[375px]" ? "max-w-full" : ""]]) }, [v("section", {
				id: "output",
				class: "w-full",
				lang: I(et),
				onClick: r[0] ||= (...e) => n.onContentClick && n.onContentClick(...e),
				innerHTML: I(p)
			}, null, 8, da), n.isCoping ? (s(), t("div", fa, [v("div", pa, [r[1] ||= v("div", { class: "loading__img" }, null, -1), v("span", null, M(I(a)("common.generating")), 1)])])) : u("", !0)], 2)], 2), I(o) ? u("", !0) : (s(), N(i, {
				key: 0,
				target: "preview",
				right: I(y) ? 24 : 20,
				bottom: I(y) ? 90 : 20
			}, null, 8, ["right", "bottom"]))], 512)], 512)), [[b, I(x) !== "edit"]]);
		};
	}
}), [["__scopeId", "data-v-8a01ffa9"]]), ha = {
	class: "native-toolbar",
	"aria-label": "公众号正文编辑工具"
}, ga = ["value"], _a = ["aria-pressed"], va = ["aria-pressed"], ya = /* @__PURE__ */ r({
	__name: "native-toolbar",
	setup(e) {
		let n = at(), r = U();
		function i(e, t = e) {
			let r = n.editor;
			if (!r) return;
			let i = r.state.selection.main;
			r.dispatch(r.state.replaceSelection(`${e}${r.state.doc.sliceString(i.from, i.to) || "文字"}${t}`)), r.focus();
		}
		function a(e) {
			n.editor && (e === "undo" ? Ct : pt)(O(n.editor));
		}
		return (e, n) => (s(), t("div", ha, [
			v("button", {
				type: "button",
				onClick: n[0] ||= (e) => a("undo")
			}, "撤销"),
			v("button", {
				type: "button",
				onClick: n[1] ||= (e) => a("redo")
			}, "重做"),
			v("button", {
				type: "button",
				onClick: n[2] ||= (e) => i("**")
			}, "加粗"),
			v("button", {
				type: "button",
				onClick: n[3] ||= (e) => i("*")
			}, "斜体"),
			v("button", {
				type: "button",
				onClick: n[4] ||= (e) => i("## ", "")
			}, "标题"),
			v("button", {
				type: "button",
				onClick: n[5] ||= (e) => i("- ", "")
			}, "列表"),
			v("button", {
				type: "button",
				onClick: n[6] ||= (e) => i("> ", "")
			}, "引用"),
			v("select", {
				"aria-label": "编辑预览布局",
				value: I(r).viewMode,
				onChange: n[7] ||= (e) => I(r).setViewMode(e.target.value)
			}, [...n[11] ||= [
				v("option", { value: "split" }, "编辑与预览", -1),
				v("option", { value: "edit" }, "只看正文", -1),
				v("option", { value: "preview" }, "只看预览", -1)
			]], 40, ga),
			v("button", {
				type: "button",
				onClick: n[8] ||= (e) => I(r).isShowUploadImgDialog = !0
			}, "插入图片"),
			v("button", {
				type: "button",
				"aria-pressed": I(r).isOpenRightSlider,
				onClick: n[9] ||= (e) => I(r).isOpenRightSlider = !I(r).isOpenRightSlider
			}, "排版设置", 8, _a),
			v("button", {
				type: "button",
				"aria-pressed": I(r).isShowCssEditor,
				onClick: n[10] ||= (e) => I(r).isShowCssEditor = !I(r).isShowCssEditor
			}, "自定义 CSS", 8, va)
		]));
	}
}), ba = ["disabled"], xa = {
	key: 0,
	role: "status"
}, Sa = /* @__PURE__ */ r({
	__name: "native-media-dialog",
	props: { onImport: { type: Function } },
	setup(e) {
		let n = e, r = U(), i = R(), a = x(!1);
		async function o(e) {
			let t = e.target, o = Array.from(t.files ?? []);
			t.value = "", a.value = !0;
			try {
				for (let e of o) if (!i.live || i.signal.aborted || (await n.onImport(e), !i.live || i.signal.aborted)) return;
				r.isShowUploadImgDialog = !1;
			} catch (e) {
				i.onError(e instanceof Error ? e.message : "图片导入失败");
			} finally {
				i.live && !i.signal.aborted && (a.value = !1);
			}
		}
		return (e, n) => {
			let i = nn, c = en, l = tn, d = $t, p = Qt;
			return s(), N(p, {
				open: I(r).isShowUploadImgDialog,
				"onUpdate:open": n[0] ||= (e) => I(r).isShowUploadImgDialog = e
			}, {
				default: S(() => [f(d, null, {
					default: S(() => [
						f(l, null, {
							default: S(() => [f(i, null, {
								default: S(() => [...n[1] ||= [j("插入图片", -1)]]),
								_: 1
							}), f(c, null, {
								default: S(() => [...n[2] ||= [j("选择图片后会先保存到当前作品素材，再插入正文。", -1)]]),
								_: 1
							})]),
							_: 1
						}),
						v("input", {
							type: "file",
							accept: "image/*",
							multiple: "",
							disabled: I(a),
							"aria-label": "选择图片文件",
							onChange: o
						}, null, 40, ba),
						I(a) ? (s(), t("span", xa, "图片正在保存到作品素材…")) : u("", !0)
					]),
					_: 1
				})]),
				_: 1
			}, 8, ["open"]);
		};
	}
});
function Ca(e) {
	let t = () => g(e), n = U();
	function r(e) {
		return e.replace(/\s+/g, " ").trim();
	}
	function i(e) {
		if (!e.startsWith("#")) return null;
		let t = 0;
		for (; t < e.length && e[t] === "#" && t < 6;) t++;
		if (t === 0 || e[t] !== " ") return null;
		let n = r(e.slice(t + 1).replace(/#+\s*$/, ""));
		return n ? {
			level: t,
			title: n
		} : null;
	}
	function a(e, n) {
		let a = t();
		if (!a) return null;
		let o = a.state.doc, s = r(e);
		for (let e = 1; e <= o.lines; e++) {
			let t = o.line(e), r = i(t.text);
			if (!r || n && r.level !== n) continue;
			let a = r.title;
			if (a === s || a.includes(s) || s.includes(a)) return t.from;
		}
		return null;
	}
	function o(e) {
		let n = t();
		if (!n) return null;
		let i = n.state.doc.toString(), a = r(e);
		if (!a) return null;
		let o = [
			a,
			a.slice(0, 80),
			a.slice(0, 40),
			a.slice(0, 20)
		].filter((e) => e.length >= 6);
		for (let e of o) {
			let t = i.indexOf(e);
			if (t !== -1) return t;
		}
		return null;
	}
	function s(e) {
		let n = e.tagName.toLowerCase(), i = null;
		if (/^h[1-6]$/.test(n)) {
			let t = Number(n.slice(1));
			i = a(r(e.textContent || ""), t);
		} else if (n === "img") {
			let t = e, n = r(t.alt || "");
			i = n ? o(n) : null, i == null && t.src && (i = o(t.src));
		} else i = o(r(e.textContent || ""));
		if (i != null) {
			let e = t();
			if (!e) return;
			e.dispatch({
				selection: { anchor: i },
				effects: X.scrollIntoView(i, { y: "center" })
			}), e.focus();
		}
	}
	function c(e, n) {
		let r = t();
		if (!r) return null;
		let i = e.closest("#output");
		if (!i) return null;
		let a = Array.from(i.querySelectorAll("table.preview-table")).filter((e) => !e.closest("blockquote")).indexOf(e);
		if (a === -1) return null;
		let o = kn(r.state.doc.toString())[a];
		if (!o) return null;
		if (!n) return o.from;
		let s = o.text.split("\n"), c = n.parentElement?.children ?? [], l = n.parentElement?.tagName === "THEAD" ? 0 : Math.min(Array.prototype.indexOf.call(c, n) + 2, s.length - 1), u = o.from;
		for (let e = 0; e < l; e++) u += s[e].length + 1;
		return u;
	}
	function l(e) {
		let r = e.target;
		if (!r) return;
		let i = r.closest("a");
		if (i) {
			let t = i.getAttribute("href");
			if (t && t.startsWith("#")) {
				let n = "";
				try {
					n = decodeURIComponent(t.slice(1));
				} catch {}
				if (n) {
					let t = L(n);
					if (t) {
						let n = r.closest(".preview-wrapper") || L("preview");
						if (n && n.contains(t)) {
							e.preventDefault(), e.stopPropagation();
							let r = n.getBoundingClientRect(), i = t.getBoundingClientRect().top - r.top + n.scrollTop;
							n.scrollTo({
								top: i,
								behavior: "smooth"
							});
							return;
						}
					}
				}
			}
		}
		let a = r.closest("[data-math-raw]");
		if (a) {
			let e = a.getAttribute("data-math-raw") ?? "", t = a.getAttribute("data-math-display") === "true";
			n.openFormulaEditor({
				value: e,
				displayMode: t,
				sourceRaw: e
			});
			return;
		}
		let o = r.closest("td,th"), l = o?.closest("table.preview-table");
		if (o && l && !l.closest("blockquote")) {
			let e = c(l, o.closest("tr")), r = t();
			if (e != null && r) {
				r.dispatch({
					selection: { anchor: e },
					effects: X.scrollIntoView(e, { y: "center" })
				}), n.openTableEditDialog();
				return;
			}
		}
		let u = r.closest("h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,td,th,img");
		u && s(u);
	}
	return { handlePreviewContentClick: l };
}
function wa(e) {
	let t = [], n = -1;
	for (let r = 1; r <= e.lines; r++) {
		let i = e.line(r).text.trim() === "";
		!i && n === -1 ? n = r : i && n !== -1 && (t.push({
			startLine: n,
			endLine: r - 1
		}), n = -1);
	}
	return n !== -1 && t.push({
		startLine: n,
		endLine: e.lines
	}), t;
}
function Ta(e, t) {
	for (let n = e.length - 1; n >= 0; n--) if (e[n].startLine <= t) return n;
	return 0;
}
function Ea(e, t) {
	return e.length === 0 ? 1 : e[Math.min(t, e.length - 1)].startLine;
}
function Da(e, t, n) {
	return Math.round(t <= 1 || n <= 1 ? e / Math.max(t - 1, 1) * Math.max(n - 1, 1) : e / (t - 1) * (n - 1));
}
function Oa(t, n, r) {
	let i = /* @__PURE__ */ new Set();
	function a(e) {
		let t = requestAnimationFrame(() => {
			i.delete(t), e();
		});
		i.add(t);
	}
	e(() => {
		for (let e of i) cancelAnimationFrame(e);
		i.clear(), x();
	});
	let o = !1, s = !1, c = -1, u = -1, d = null, f = null;
	function p(e) {
		return d === e && f ? f : (d = e, f = wa(e), f);
	}
	let m = 0, h = -1, _ = [], v = [], y = null;
	function b(e) {
		if (y) return;
		let t = e.querySelector("#output");
		t && (y = new MutationObserver(() => {
			m++;
		}), y.observe(t, {
			childList: !0,
			subtree: !0
		}));
	}
	function x() {
		y?.disconnect(), y = null;
	}
	function S(e) {
		if (y || b(e), h === m) return {
			blocks: _,
			offsetTops: v
		};
		let t = e.querySelector("#output");
		if (!t) return h = m, _ = [], v = [], {
			blocks: [],
			offsetTops: []
		};
		let n = t.firstElementChild;
		if (!n) return h = m, _ = [], v = [], {
			blocks: [],
			offsetTops: []
		};
		let r = [];
		for (let e of n.children) {
			let t = e.tagName;
			if (t !== "STYLE" && !(t === "BLOCKQUOTE" && e.classList.contains("md-blockquote"))) {
				if (t === "H4" && e.dataset.heading === "true") {
					let t = e.nextElementSibling;
					if (t && t.classList.contains("footnotes")) break;
				}
				if (e.classList.contains("footnotes")) break;
				r.push(e);
			}
		}
		let i = e.getBoundingClientRect(), a = r.map((t) => t.getBoundingClientRect().top - i.top + e.scrollTop);
		return h = m, _ = r, v = a, {
			blocks: r,
			offsetTops: a
		};
	}
	function C() {
		if (!r.value || s) return;
		let e = g(t), i = g(n);
		if (!e || !i) return;
		let l = e.scrollDOM, d = l.scrollHeight - l.clientHeight;
		if (d <= 0) return;
		if (u >= 0 && Math.abs(l.scrollTop - u) < 2) {
			u = -1;
			return;
		}
		if (u = -1, o = !0, l.scrollTop <= 0) {
			c = 0, i.scrollTop = 0, a(() => {
				o = !1;
			});
			return;
		}
		if (l.scrollTop >= d) {
			let e = i.scrollHeight - i.clientHeight;
			c = e, i.scrollTop = e, a(() => {
				o = !1;
			});
			return;
		}
		let f = p(e.state.doc);
		if (f.length === 0) {
			o = !1;
			return;
		}
		let m = e.lineBlockAtHeight(l.scrollTop), h = e.state.doc.lineAt(m.from).number, _ = Ta(f, h), { blocks: v, offsetTops: y } = S(i);
		if (v.length === 0) {
			o = !1;
			return;
		}
		let b = Da(_, f.length, v.length), x = Math.min(b, v.length - 1), C = i.scrollHeight - i.clientHeight, w = Math.min(y[x], C);
		c = w, i.scrollTop = w, a(() => {
			o = !1;
		});
	}
	function w() {
		if (!r.value || o) return;
		let e = g(t), i = g(n);
		if (!e || !i) return;
		if (c >= 0 && Math.abs(i.scrollTop - c) < 2) {
			c = -1;
			return;
		}
		c = -1;
		let l = i.scrollHeight - i.clientHeight;
		if (l <= 0) return;
		if (s = !0, i.scrollTop <= 0) {
			u = 0, e.scrollDOM.scrollTop = 0, a(() => {
				s = !1;
			});
			return;
		}
		if (i.scrollTop >= l) {
			let t = e.scrollDOM.scrollHeight - e.scrollDOM.clientHeight;
			u = t, e.scrollDOM.scrollTop = t, a(() => {
				s = !1;
			});
			return;
		}
		let { blocks: d, offsetTops: f } = S(i);
		if (d.length === 0) {
			s = !1;
			return;
		}
		let m = i.scrollTop, h = 0, _ = f.length - 1;
		for (; h < _;) {
			let e = h + _ + 1 >> 1;
			f[e] <= m ? h = e : _ = e - 1;
		}
		let v = h, y = p(e.state.doc);
		if (y.length === 0) {
			s = !1;
			return;
		}
		let b = Ea(y, Da(v, d.length, y.length)), x = e.state.doc.line(b), C = e.lineBlockAt(x.from);
		if (C) {
			let t = e.scrollDOM.scrollHeight - e.scrollDOM.clientHeight, n = Math.min(C.top, t);
			u = n, e.scrollDOM.scrollTop = n;
		}
		a(() => {
			s = !1;
		});
	}
	l((e) => {
		if (!r.value) return;
		let i = g(t), a = g(n);
		if (!i || !a) return;
		b(a);
		let o = i.scrollDOM;
		o.addEventListener("scroll", C, { passive: !0 }), a.addEventListener("scroll", w, { passive: !0 }), e(() => {
			o.removeEventListener("scroll", C), a.removeEventListener("scroll", w), x();
		});
	});
}
var ka = /* @__PURE__ */ r({
	__name: "Sonner",
	props: {
		id: {},
		invert: { type: Boolean },
		theme: {},
		position: {},
		closeButtonPosition: {},
		hotkey: {},
		richColors: { type: Boolean },
		expand: { type: Boolean },
		duration: {},
		gap: {},
		visibleToasts: {},
		closeButton: { type: Boolean },
		toastOptions: {},
		class: {},
		style: {},
		offset: {},
		mobileOffset: {},
		dir: {},
		swipeDirections: {},
		icons: {},
		containerAriaLabel: {}
	},
	setup(e) {
		let t = e;
		return (e, n) => (s(), N(I(rt), a({ class: "toaster group" }, t), null, 16));
	}
}), Aa = { class: "native-editor-pane" }, ja = { class: "native-preview-pane" }, Ma = {
	key: 0,
	class: "native-style-pane"
}, Na = {
	key: 1,
	class: "native-css-pane"
}, Pa = /* @__PURE__ */ r({
	__name: "NativeApp",
	setup(e) {
		let n = i(() => import("./chunks/CssEditor-DuXTwX8p.js")), r = i(() => import("./chunks/RightSlider-3HjJiw_t.js")), a = i(() => import("./chunks/TableEditDialog-DDk-xto3.js")), o = i(() => import("./chunks/FormulaEditorDialog-D6Mch5W-.js")), c = i(() => import("./chunks/TemplateDialog-BweqQGzH.js")), l = i(() => import("./chunks/ConfirmDialog-C5N-abdb.js")), d = U(), p = x(null), m = x(null), { handlePreviewContentClick: h } = Ca(() => p.value?.codeMirrorView ?? null);
		Oa(() => p.value?.codeMirrorView ?? null, () => m.value?.previewRef ?? null, F(() => d.enableScrollSync));
		let g = R();
		return (e, i) => (s(), t("div", { class: P(["creatoros-doocs-native", { dark: I(d).isDark }]) }, [
			f(ya),
			f(Sa, { "on-import": (e) => I(p)?.uploadImage(e) }, null, 8, ["on-import"]),
			v("div", { class: P(["native-content", {
				"native-edit-only": I(d).viewMode === "edit",
				"native-preview-only": I(d).viewMode === "preview"
			}]) }, [
				v("div", Aa, [f(Ki, {
					ref_key: "editor",
					ref: p
				}, null, 512)]),
				v("div", ja, [f(ma, {
					ref_key: "preview",
					ref: m,
					"back-light": !1,
					"is-coping": !1,
					"on-content-click": I(h)
				}, null, 8, ["on-content-click"])]),
				I(d).isOpenRightSlider ? (s(), t("aside", Ma, [f(I(r))])) : u("", !0),
				I(d).isShowCssEditor ? (s(), t("aside", Na, [f(I(n))])) : u("", !0)
			], 2),
			I(d).isShowTableEditDialog ? (s(), N(I(a), { key: 0 })) : u("", !0),
			I(d).isShowFormulaEditorDialog ? (s(), N(I(o), { key: 1 })) : u("", !0),
			I(d).isShowTemplateDialog ? (s(), N(I(c), { key: 2 })) : u("", !0),
			f(I(l)),
			(s(), N(C, { to: I(g).portal }, [f(I(ka), {
				"rich-colors": "",
				position: "top-center",
				duration: 1800,
				theme: I(d).isDark ? "dark" : "light"
			}, null, 8, ["theme"])], 8, ["to"]))
		], 2));
	}
}), Fa = "a7c17fc4cda92e3c13aa7e24f06615cfa4219b31", Ia = new Hn();
async function La(e, t) {
	if (t.signal.aborted) throw Error("挂载已取消");
	if (!(e.getRootNode() instanceof ShadowRoot) || e.getRootNode() !== t.portalContainer.getRootNode()) throw Error("公众号编辑器需要同一组件样式容器");
	for (let e of [
		t.owner?.accountId,
		t.owner?.outputId,
		t.owner?.sourceVersionId
	]) if (typeof e != "string" || !e) throw Error("稿件归属不完整");
	let n = new AbortController(), r = new Un(), i = !1, a, o, s, l, u = !1, d = "", f = {
		root: e,
		portal: t.portalContainer,
		signal: n.signal,
		mode: t.theme.mode,
		live: !0,
		imageUrls: /* @__PURE__ */ new Map(),
		imageBlobs: /* @__PURE__ */ new Map(),
		jobs: /* @__PURE__ */ new Set(),
		cleanups: /* @__PURE__ */ new Set(),
		importMedia: async (e) => {
			if (p(), !(e instanceof Blob) || !e.type.startsWith("image/") || e.size > 26214400) throw Error("图片文件无效或超过25 MiB");
			let n = await de(f, t.importMedia(e));
			if (p(), !/^creatoros-asset:([^:\s]+):([^:\s]+)$/.test(n.mediaId)) throw Error("素材归属回执无效");
			return n;
		},
		onError: (e) => {
			i || t.onError(e);
		}
	};
	f.ready = new Promise((e, t) => {
		f.readyResolve = e, f.readyReject = t;
	}), f.ready.catch(() => {});
	function p(e) {
		if (i || n.signal.aborted || e?.aborted) throw Error("稿件已关闭或操作已取消");
	}
	function m() {
		if (l) return l;
		i = !0, f.live = !1, n.abort(), f.readyReject?.(/* @__PURE__ */ Error("稿件已关闭")), t.signal.removeEventListener("abort", g), s?.();
		for (let e of f.cleanups) try {
			e();
		} catch {}
		return f.cleanups.clear(), a?.unmount(), a = void 0, o && (at(o).editor?.destroy(), at(o).editor = null, Le(o).cssEditor?.destroy(), Le(o).cssEditor = null, A(o)), l = (async () => {
			await Promise.allSettled([...f.jobs]), await r.settled(), await Ze.whenIdle(), R() === f && (Ee(), ce(void 0));
			for (let e of f.imageUrls.values()) URL.revokeObjectURL(e);
			f.imageUrls.clear(), f.imageBlobs.clear(), e.replaceChildren(), t.portalContainer.replaceChildren();
			for (let n of [e, t.portalContainer]) n.removeAttribute("inert"), n.removeAttribute("aria-disabled");
			Ia.release(m);
		})(), l;
	}
	let g = () => {
		m();
	};
	t.signal.addEventListener("abort", g, { once: !0 });
	try {
		await Ia.acquire(m, t.signal), p(), ce(f), await Qe(), p();
		let n = await tt("zh-CN");
		p(), nt(n), o = ae(), E(o), a = y(Pa), a.use(o), a.use(n), Gn([e, t.portalContainer], t.theme), a.mount(e);
		let l;
		try {
			await de(f, Promise.race([f.ready, new Promise((e, t) => {
				l = setTimeout(() => t(/* @__PURE__ */ Error("公众号编辑器初始化超时")), 2e4);
			})])), p();
		} finally {
			clearTimeout(l);
		}
		let g = it(o), _ = at(o), v = ze(o), b = Fe(o), x = Le(o);
		g.replacePosts([{
			id: t.owner.outputId,
			title: "",
			content: "",
			history: [],
			createDatetime: /* @__PURE__ */ new Date(),
			updateDatetime: /* @__PURE__ */ new Date()
		}]), g.currentPostId = t.owner.outputId, _.importContent("");
		let S = () => ({
			schemaVersion: 1,
			editor: "doocs-md",
			editorCommit: Fa,
			themeId: String(b.theme),
			themeSettings: JSON.parse(JSON.stringify(b.themeSettings[b.theme] ?? {})),
			customCss: x.getCurrentTabContent(),
			exportOptions: {
				useIndent: !!b.isUseIndent,
				useJustify: !!b.isUseJustify
			}
		}), C = () => ({
			markdown: _.getContent(),
			layout: S()
		});
		s = h(() => [
			v.output,
			b.theme,
			JSON.stringify(b.themeSettings),
			x.getCurrentTabContent(),
			b.isUseIndent,
			b.isUseJustify
		], () => {
			if (i || u) return;
			let e = C(), n = JSON.stringify(e);
			n !== d && (d = n, t.onChanged(e));
		}, { flush: "post" });
		function w(e) {
			if (p(), !e || typeof e.assetId != "string" || typeof e.assetFileId != "string" || !/^[^:\s]+$/.test(e.assetId) || !/^[^:\s]+$/.test(e.assetFileId) || !(e.blob instanceof Blob) || !e.blob.type.startsWith("image/") || e.blob.size > 26214400) throw Error("精确图片素材无效或超过25 MiB");
			let t = `${e.assetId}:${e.assetFileId}`, n = f.imageUrls.get(t);
			f.imageBlobs.set(t, e.blob), f.imageUrls.set(t, URL.createObjectURL(e.blob)), n && URL.revokeObjectURL(n);
		}
		async function T(e, t, n) {
			if (p(n?.signal), E(o), e === "load") {
				let e = t?.document ?? t;
				if (typeof e?.markdown != "string") throw Error("公众号稿件输入无效");
				let r = e.layout;
				if (r && r.editor !== "doocs-md") throw Error("版式属于其它编辑器");
				u = !0;
				try {
					for (let e of t?.assets ?? []) w(e);
					if (r) {
						if (r.themeId && (b.theme = r.themeId), r.themeId && r.themeSettings && (b.themeSettings = {
							...b.themeSettings,
							[r.themeId]: r.themeSettings
						}), typeof r.customCss == "string") {
							let e = x.getCurrentTab();
							e.content = r.customCss, x.setCssEditorValue(e.content);
						}
						r.exportOptions && (b.isUseIndent = !!r.exportOptions.useIndent, b.isUseJustify = !!r.exportOptions.useJustify);
					}
					return g.currentPost && (g.currentPost.title = e.title ?? ""), _.importContent(e.markdown), _.flushContentToPostStore(), await b.applyCurrentTheme(), p(n?.signal), v.render(e.markdown, { force: !0 }), await c(), p(n?.signal), d = JSON.stringify(C()), C();
				} finally {
					u = !1;
				}
			}
			if (e === "asset" || e === "insert-media") return w(t), e === "insert-media" && _.insertAtCursor(`\n<img src="creatoros-asset:${t.assetId}:${t.assetFileId}" alt="图片">\n`), v.render(_.getContent(), { force: !0 }), await c(), p(n?.signal), { mediaId: `creatoros-asset:${t.assetId}:${t.assetFileId}` };
			if (e === "snapshot") return _.flushContentToPostStore(), C();
			if (e === "export-html") {
				let e = JSON.stringify(C());
				await b.applyCurrentTheme(), p(n?.signal), v.render(_.getContent(), {
					force: !0,
					themeMode: "light"
				}), await c(), p(n?.signal);
				let t = await ge();
				if (p(n?.signal), JSON.stringify(C()) !== e) throw Error("稿件已改变，请重新导出");
				return {
					html: `<style>${Te}</style>${t}<style>${He}</style><div id="output">${he({
						staticLayout: !0,
						themeMode: "light"
					})}</div>`,
					bindings: [...f.imageUrls].map(([e, t]) => ({
						key: e,
						url: t
					}))
				};
			}
			throw Error(`公众号编辑器不支持此操作：${e}`);
		}
		return {
			request(e, t, n) {
				return de(f, r.run(() => T(e, t, n)));
			},
			update(n) {
				if (!i && (n.theme && (f.mode = n.theme.mode, Gn([e, t.portalContainer], n.theme), U(o).isDark = n.theme.mode === "dark"), n.disabled !== void 0)) for (let r of [e, t.portalContainer]) r.toggleAttribute("inert", n.disabled), r.setAttribute("aria-disabled", String(n.disabled));
			},
			dispose: m
		};
	} catch (e) {
		throw await m(), e;
	}
}
export { La as mount };
