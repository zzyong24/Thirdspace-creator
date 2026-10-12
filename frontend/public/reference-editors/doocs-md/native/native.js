import { A as e, C as t, E as n, Y as r, b as i, ft as a, gt as o, ht as s, lt as c, mt as l, nt as u, ut as d, vt as f, w as p } from "./chunks/codemirror-C3tEDw1q.js";
import { B as m, C as h, Ct as g, D as _, E as v, F as y, G as b, H as x, I as S, Q as C, S as w, St as T, T as E, W as D, X as ee, Z as O, _t as k, a as A, b as j, c as te, d as ne, dt as M, et as N, g as re, gt as P, h as ie, i as ae, k as F, mt as oe, n as se, ot as ce, p as le, pt as ue, q as de, r as fe, s as pe, t as me, tt as he, w as I, wt as L, x as R, xt as ge, y as z, yt as B, z as _e } from "./chunks/vendor_vue-OlfIOlFg.js";
import { f as ve, i as ye, n as be, o as V, p as xe, r as H, s as Se, u as Ce } from "./chunks/native-host-BoAU4GnD.js";
import { B as we, C as U, D as Te, E as Ee, F as De, I as Oe, L as W, M as ke, N as Ae, O as je, P as G, R as Me, S as Ne, T as Pe, V as Fe, _ as Ie, a as Le, b as Re, c as ze, d as Be, f as Ve, g as He, h as K, i as Ue, j as We, l as Ge, n as Ke, o as qe, p as Je, r as Ye, s as Xe, t as Ze, u as Qe, v as $e, w as et, x as tt, y as nt, z as rt } from "./chunks/render-BKss5lW7.js";
import { A as it, D as at, O as q, c as ot, j as st, k as J, l as ct, n as lt, t as ut } from "./chunks/storage-jiCkQUgy.js";
import { i as dt } from "./chunks/config-CS1KboEo.js";
import { n as ft } from "./chunks/vue-i18n-8AnKzzG6.js";
import { a as pt, i as mt, n as Y, r as ht } from "./chunks/translate-CUv9RhnO.js";
import { n as X, t as gt } from "./chunks/lib-DIiEqr8B.js";
import { n as _t } from "./chunks/post-BeiAh9Pa.js";
import { n as vt } from "./chunks/editor-VmYacIt-.js";
import { S as yt, T as bt, b as xt, m as St } from "./chunks/utils-D7O4F-LG.js";
import { b as Ct, s as wt } from "./chunks/vendor_vueuse-DbHwQsn4.js";
import { E as Tt, _ as Z, b as Et, h as Dt, l as Ot, m as kt, o as At, s as jt, u as Mt, v as Nt, y as Q } from "./chunks/Teleport-YNIcOte_.js";
import { i as Pt, r as Ft, t as It } from "./chunks/Button-B4kIEl6s.js";
import { a as Lt, c as Rt, d as zt, f as Bt, i as Vt, l as Ht, m as Ut, n as Wt, o as Gt, p as Kt, r as qt, s as Jt, t as Yt, u as Xt } from "./chunks/clipboard-CNx6erJo.js";
import { c as Zt, i as Qt } from "./chunks/PopperContent-RtMDF-yC.js";
import { a as $t, i as en, n as tn, r as nn, t as rn } from "./chunks/DialogTitle-w1SUV50e.js";
import { t as $ } from "./chunks/createLucideIcon-CFmwvUbS.js";
import { C as an, S as on, _ as sn, a as cn, b as ln, c as un, d as dn, f as fn, g as pn, h as mn, l as hn, m as gn, o as _n, p as vn, s as yn, u as bn, v as xn, w as Sn, x as Cn, y as wn } from "./chunks/slashCommands-Bp20Gpjz.js";
import { t as Tn } from "./chunks/chevron-right-BTkVQ4BO.js";
import { n as En, t as Dn } from "./chunks/file-text-DscvNBZB.js";
import { t as On } from "./chunks/trash-DHg1WvRr.js";
import { i as kn, r as An } from "./chunks/table-neeg7dzE.js";
import { t as jn } from "./chunks/formula-BY10rzjJ.js";
import { t as Mn } from "./chunks/confirm-BRFdpM55.js";
import { t as Nn } from "./chunks/useEditorRefresh-w4Z-KUpo.js";
import { n as Pn, t as Fn } from "./chunks/provider-registry-C_yJEJu8.js";
import { a as In, i as Ln, r as Rn } from "./chunks/marketplace-Bubu1InB.js";
import { t as zn } from "./chunks/_plugin-vue_export-helper-B3W2xDgE.js";
function Bn(e, t = "untitled") {
	let n = we(t);
	Me(e, `${n}.md`, "text/markdown;charset=utf-8");
}
function Vn(e, t) {
	e.dispatch({
		changes: {
			from: 0,
			to: e.state.doc.length,
			insert: t
		},
		annotations: f.addToHistory.of(!1)
	});
}
function Hn(e, t) {
	e.dispatch({ effects: t.reconfigure([]) }), e.dispatch({ effects: t.reconfigure(i()) });
}
var Un = class {
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
};
function Wn(e) {
	return JSON.stringify([
		e.groupId ? ["group", e.groupId] : ["account", e.accountId],
		e.projectId,
		e.outputId,
		e.sourceVersionId
	]);
}
function Gn(e) {
	if (!e.projectId || !e.outputId || !e.sourceVersionId || !e.groupId && !e.accountId) throw Error("稿件归属不完整");
}
function Kn(e, t, n) {
	if (n?.aborted || e !== t) throw Error("稿件上下文已变化，原请求停止");
}
var qn = class {
	tail = Promise.resolve();
	run(e) {
		let t = this.tail.then(e);
		return this.tail = t.catch(() => {}), t;
	}
	async settled() {
		await this.tail;
	}
}, Jn = {
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
function Yn(e, t) {
	for (let n of e) {
		n.classList.toggle("dark", t.mode === "dark"), n.setAttribute("data-density", t.density);
		for (let e = n.style.length - 1; e >= 0; e--) {
			let t = n.style.item(e);
			t.startsWith("--creatoros-") && n.style.removeProperty(t);
		}
		for (let [e, r] of Object.entries(t.tokens)) e.startsWith("--creatoros-") && n.style.setProperty(e, r);
		for (let [e, t] of Object.entries(Jn)) n.style.setProperty(`--${e}`, `var(--creatoros-${t}${e === "primary-foreground" ? ",#fff" : ""})`);
		n.style.setProperty("--radius", "var(--creatoros-radius-control,8px)"), n.style.setProperty("--native-ui-font", t.fontFamily), n.style.setProperty("--native-ui-size", t.fontSize), n.style.color = "var(--creatoros-text)", n.style.fontFamily = t.fontFamily, n.style.fontSize = t.fontSize;
	}
}
var [Xn, Zn] = /*#__PURE__*/ Tt("MenuSub"), Qn = /* @__PURE__ */ _({
	__name: "MenuSub",
	props: { open: {
		type: Boolean,
		required: !1,
		default: void 0
	} },
	emits: ["update:open"],
	setup(e, { emit: t }) {
		let n = e, r = wt(n, "open", t, {
			defaultValue: !1,
			passive: n.open === void 0
		}), i = zt(), a = M(), o = M();
		return C((e) => {
			i?.open.value === !1 && (r.value = !1), e(() => r.value = !1);
		}), Kt({
			open: r,
			onOpenChange: (e) => {
				r.value = e;
			},
			content: o,
			onContentChange: (e) => {
				o.value = e;
			}
		}), Zn({
			triggerId: "",
			contentId: "",
			trigger: a,
			onTriggerChange: (e) => {
				a.value = e;
			}
		}), (e, t) => (x(), R(B(Qt), null, {
			default: N(() => [b(e.$slots, "default")]),
			_: 3
		}));
	}
}), $n = /* @__PURE__ */ _({
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
		let n = Z(e, t), r = zt(), i = Bt(), a = Xn(), o = Ht(), { forwardRef: s, currentElement: c } = Q();
		return a.contentId ||= Dt(void 0, "reka-menu-sub-content"), (e, t) => (x(), R(B(kt), { present: e.forceMount || B(r).open.value }, {
			default: N(() => [E(Rt, y(B(n), {
				id: B(a).contentId,
				ref: B(s),
				"aria-labelledby": B(a).triggerId,
				align: "start",
				side: B(i).dir.value === "rtl" ? "left" : "right",
				"disable-outside-pointer-events": !1,
				"disable-outside-scroll": !1,
				"trap-focus": !1,
				onOpenAutoFocus: t[0] ||= le((e) => {
					B(i).isUsingKeyboardRef.value && B(c)?.focus();
				}, ["prevent"]),
				onCloseAutoFocus: t[1] ||= le(() => {}, ["prevent"]),
				onFocusOutside: t[2] ||= (e) => {
					if (e.defaultPrevented) return;
					let t = B(o).filterElement.value?.contains(e.target);
					e.target !== B(a).trigger.value && !t && B(r).onOpenChange(!1);
				},
				onEscapeKeyDown: t[3] ||= (e) => {
					B(i).onClose(), e.preventDefault();
				},
				onKeydown: t[4] ||= (e) => {
					let t = e.currentTarget?.contains(e.target), n = B(At)[B(i).dir.value].includes(e.key);
					t && n && (B(r).onOpenChange(!1), B(o).filterElement.value ? (B(o).filterElement.value.focus(), B(o).highlightedElement.value = B(a).trigger.value, B(a).trigger.value?.scrollIntoView({ block: "nearest" })) : B(a).trigger.value?.focus(), e.preventDefault());
				}
			}), {
				default: N(() => [b(e.$slots, "default")]),
				_: 3
			}, 16, [
				"id",
				"aria-labelledby",
				"side"
			])]),
			_: 3
		}, 8, ["present"]));
	}
}), er = /* @__PURE__ */ _({
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
	setup(e) {
		let t = e, n = zt(), r = Bt(), i = Xn(), a = Ht();
		O(n.open, (e) => {
			e ? a.activeSubmenuContext.value = {
				onOpenChange: n.onOpenChange,
				trigger: i.trigger
			} : a.activeSubmenuContext.value?.trigger.value === i.trigger.value && (a.activeSubmenuContext.value = void 0);
		});
		let o = M(null);
		i.triggerId ||= Dt(void 0, "reka-menu-sub-trigger");
		function s() {
			o.value && window.clearTimeout(o.value), o.value = null;
		}
		m(() => {
			s();
		});
		function c(e) {
			Mt(e) && (a.onItemEnter(e) || !t.disabled && !n.open.value && !o.value && (a.onPointerGraceIntentChange(null), o.value = window.setTimeout(() => {
				n.onOpenChange(!0), s();
			}, 100)));
		}
		async function l(e) {
			if (!Mt(e)) return;
			s();
			let t = n.content.value?.getBoundingClientRect();
			if (t?.width) {
				let r = n.content.value?.dataset.side, i = r === "right", o = i ? -5 : 5, s = t[i ? "left" : "right"], c = t[i ? "right" : "left"];
				a.onPointerGraceIntentChange({
					area: [
						{
							x: e.clientX + o,
							y: e.clientY
						},
						{
							x: s,
							y: t.top
						},
						{
							x: c,
							y: t.top
						},
						{
							x: c,
							y: t.bottom
						},
						{
							x: s,
							y: t.bottom
						}
					],
					side: r
				}), window.clearTimeout(a.pointerGraceTimerRef.value), a.pointerGraceTimerRef.value = window.setTimeout(() => a.onPointerGraceIntentChange(null), 300);
			} else {
				if (a.onTriggerLeave(e)) return;
				a.onPointerGraceIntentChange(null);
			}
		}
		async function u(e) {
			let i = a.searchRef.value !== "";
			t.disabled || i && e.key === " " || jt[r.dir.value].includes(e.key) && (n.onOpenChange(!0), await S(), n.content.value?.focus(), e.preventDefault());
		}
		return (e, r) => (x(), R(Ut, { "as-child": "" }, {
			default: N(() => [E(Jt, y(t, {
				id: B(i).triggerId,
				ref: (e) => {
					e && B(i)?.onTriggerChange(e?.$el);
				},
				"aria-haspopup": "menu",
				"aria-expanded": B(n).open.value,
				"aria-controls": B(i).contentId,
				"data-state": B(Ot)(B(n).open.value),
				onClick: r[0] ||= async (e) => {
					t.disabled || e.defaultPrevented || (e.currentTarget?.focus(), B(n).open.value || B(n).onOpenChange(!0));
				},
				onPointermove: c,
				onPointerleave: l,
				onKeydown: u
			}), {
				default: N(() => [b(e.$slots, "default")]),
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
}), [tr, nr] = /*#__PURE__*/ Tt("ContextMenuRoot"), rr = /* @__PURE__ */ _({
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
		let n = e, r = t, { dir: i, modal: a, pressOpenDelay: o } = P(n);
		Q();
		let s = Zt(i), c = M(!1);
		return nr({
			open: c,
			onOpenChange: (e) => {
				c.value = e;
			},
			dir: s,
			modal: a,
			triggerElement: M(),
			pressOpenDelay: o
		}), O(c, (e) => {
			r("update:open", e);
		}), (e, t) => (x(), R(B(Xt), {
			open: c.value,
			"onUpdate:open": t[0] ||= (e) => c.value = e,
			dir: B(s),
			modal: B(a)
		}, {
			default: N(() => [b(e.$slots, "default")]),
			_: 3
		}, 8, [
			"open",
			"dir",
			"modal"
		]));
	}
}), ir = /* @__PURE__ */ _({
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
		let r = tr(), i = M(!1);
		return (e, t) => (x(), R(B(Lt), y(B(n), {
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
				e.detail.originalEvent.button === 2 && e.target === B(r).triggerElement.value && e.preventDefault(), !e.defaultPrevented && !B(r).modal.value && (i.value = !0);
			}
		}), {
			default: N(() => [b(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), ar = /* @__PURE__ */ _({
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
		let n = e, r = Et(t);
		return Q(), (e, t) => (x(), R(B(Gt), T(F({
			...n,
			...B(r)
		})), {
			default: N(() => [b(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), or = /* @__PURE__ */ _({
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
		return (e, n) => (x(), R(B(Vt), T(F(t)), {
			default: N(() => [b(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), sr = /* @__PURE__ */ _({
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
		return Q(), (e, n) => (x(), R(B(qt), T(F(t)), {
			default: N(() => [b(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), cr = /* @__PURE__ */ _({
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
		let i = wt(n, "open", r, {
			defaultValue: n.defaultOpen,
			passive: n.open === void 0
		});
		return (e, t) => (x(), R(B(Qn), {
			open: B(i),
			"onUpdate:open": t[0] ||= (e) => ce(i) ? i.value = e : null
		}, {
			default: N(() => [b(e.$slots, "default", { open: B(i) })]),
			_: 3
		}, 8, ["open"]));
	}
}), lr = /* @__PURE__ */ _({
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
		return Q(), (e, t) => (x(), R(B($n), y(B(n), { style: {
			"--reka-context-menu-content-transform-origin": "var(--reka-popper-transform-origin)",
			"--reka-context-menu-content-available-width": "var(--reka-popper-available-width)",
			"--reka-context-menu-content-available-height": "var(--reka-popper-available-height)",
			"--reka-context-menu-trigger-width": "var(--reka-popper-anchor-width)",
			"--reka-context-menu-trigger-height": "var(--reka-popper-anchor-height)"
		} }), {
			default: N(() => [b(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), ur = /* @__PURE__ */ _({
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
		return Q(), (e, n) => (x(), R(B(er), T(F(t)), {
			default: N(() => [b(e.$slots, "default")]),
			_: 3
		}, 16));
	}
});
function dr(e) {
	return e.pointerType !== "mouse";
}
var fr = /* @__PURE__ */ _({
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
		let { disabled: t } = P(e), { forwardRef: n, currentElement: r } = Q(), i = tr(), a = M({
			x: 0,
			y: 0
		}), o = z(() => ({ getBoundingClientRect: () => ({
			width: 0,
			height: 0,
			left: a.value.x,
			right: a.value.x,
			top: a.value.y,
			bottom: a.value.y,
			...a.value
		}) })), s = M(0);
		function c() {
			window.clearTimeout(s.value);
		}
		function l(e) {
			a.value = {
				x: e.clientX,
				y: e.clientY
			}, i.onOpenChange(!0);
		}
		async function u(e) {
			t.value || (await S(), e.defaultPrevented || (c(), l(e), e.preventDefault()));
		}
		async function d(e) {
			t.value || (await S(), dr(e) && !e.defaultPrevented && (c(), s.value = window.setTimeout(l, i.pressOpenDelay.value, e)));
		}
		async function f(e) {
			t.value || (await S(), dr(e) && !e.defaultPrevented && c());
		}
		return _e(() => {
			r.value && (i.triggerElement.value = r.value);
		}), (e, r) => (x(), h(ie, null, [E(B(Ut), {
			as: "template",
			reference: o.value
		}, null, 8, ["reference"]), E(B(Pt), y({
			ref: B(n),
			as: e.as,
			"as-child": e.asChild,
			"data-state": B(i).open.value ? "open" : "closed",
			"data-disabled": B(t) ? "" : void 0,
			style: {
				WebkitTouchCallout: "none",
				pointerEvents: "auto"
			}
		}, e.$attrs, {
			onContextmenu: u,
			onPointerdown: d,
			onPointermove: f,
			onPointercancel: f,
			onPointerup: f
		}), {
			default: N(() => [b(e.$slots, "default")]),
			_: 3
		}, 16, [
			"as",
			"as-child",
			"data-state",
			"data-disabled"
		])], 64));
	}
}), pr = /* @__PURE__ */ _({
	__name: "ContextMenu",
	props: {
		pressOpenDelay: {},
		dir: {},
		modal: { type: Boolean }
	},
	emits: ["update:open"],
	setup(e, { emit: t }) {
		let n = e, r = Z(n, t);
		return (e, t) => (x(), R(B(rr), y(B(r), { modal: !B(ye)() && n.modal }), {
			default: N(() => [b(e.$slots, "default")]),
			_: 3
		}, 16, ["modal"]));
	}
}), mr = /* @__PURE__ */ _({
	__name: "ContextMenuShortcut",
	props: { class: { type: [
		Boolean,
		null,
		String,
		Object,
		Array
	] } },
	setup(e) {
		let t = e;
		return (e, n) => (x(), h("span", { class: ge(B(Ft)("ml-auto text-xs tracking-widest text-muted-foreground", t.class)) }, [b(e.$slots, "default")], 2));
	}
}), hr = /* @__PURE__ */ _({
	__name: "ContextMenuSub",
	props: {
		defaultOpen: { type: Boolean },
		open: { type: Boolean }
	},
	emits: ["update:open"],
	setup(e, { emit: t }) {
		let n = Z(e, t);
		return (e, t) => (x(), R(B(cr), T(F(B(n))), {
			default: N(() => [b(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), gr = /* @__PURE__ */ _({
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
		let n = e, r = t, i = z(() => {
			let { class: e, ...t } = n;
			return t;
		}), a = Z(i, r);
		return (e, t) => (x(), R(B(lr), y(B(a), { class: B(Ft)("z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2", n.class) }), {
			default: N(() => [b(e.$slots, "default")]),
			_: 3
		}, 16, ["class"]));
	}
}), _r = $({
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
}), vr = $({
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
}), yr = $({
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
}), br = $({
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
}), xr = $({
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
}), Sr = $({
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
}), Cr = $({
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
}), wr = $({
	name: "rotate-ccw",
	size: 24,
	node: [["path", {
		d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",
		key: "1357e3"
	}], ["path", {
		d: "M3 3v5h5",
		key: "1xhq8a"
	}]]
}), Tr = $({
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
}), Er = /* @__PURE__ */ _({
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
		let t = e, n = z(() => {
			let { class: e, ...n } = t;
			return n;
		}), r = Nt(n);
		return (n, i) => (x(), R(B(ur), y(B(r), { class: B(Ft)("flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground", e.inset && "pl-8", t.class) }), {
			default: N(() => [b(n.$slots, "default"), E(B(Tn), { class: "ml-auto h-4 w-4" })]),
			_: 3
		}, 16, ["class"]));
	}
}), Dr = /* @__PURE__ */ _({
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
		let n = e, r = t, i = z(() => {
			let { class: e, ...t } = n;
			return t;
		}), a = Z(i, r);
		return (e, t) => (x(), R(B(or), { to: B(Se)() }, {
			default: N(() => [E(B(ir), y(B(a), { class: B(Ft)("z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2", n.class) }), {
				default: N(() => [b(e.$slots, "default")]),
				_: 3
			}, 16, ["class"])]),
			_: 3
		}, 8, ["to"]));
	}
}), Or = /* @__PURE__ */ _({
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
		let t = e, n = z(() => {
			let { class: e, ...n } = t;
			return n;
		});
		return (e, r) => (x(), R(B(sr), y(B(n), { class: B(Ft)("-mx-1 my-1 h-px bg-border", t.class) }), null, 16, ["class"]));
	}
}), kr = /* @__PURE__ */ _({
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
		let n = e, r = t, i = z(() => {
			let { class: e, ...t } = n;
			return t;
		}), a = Z(i, r);
		return (t, r) => (x(), R(B(ar), y(B(a), { class: B(Ft)("relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50", e.inset && "pl-8", n.class) }), {
			default: N(() => [b(t.$slots, "default")]),
			_: 3
		}, 16, ["class"]));
	}
}), Ar = /* @__PURE__ */ _({
	__name: "ContextMenuTrigger",
	props: {
		disabled: { type: Boolean },
		asChild: { type: Boolean },
		as: {}
	},
	setup(e) {
		let t = Nt(e);
		return (e, n) => (x(), R(B(fr), T(F(B(t))), {
			default: N(() => [b(e.$slots, "default")]),
			_: 3
		}, 16));
	}
});
function jr(e) {
	function t(t) {
		let n = B(e);
		if (B(e)) switch (t) {
			case `${q}-B`:
				Xe(n);
				break;
			case `${q}-I`:
				Ge(n);
				break;
			case `${q}-D`:
				Ve(n);
				break;
			case `${q}-K`:
				Qe(n);
				break;
			case `${q}-E`:
				ze(n);
				break;
			case `${q}-1`:
				qe(n, 1);
				break;
			case `${q}-2`:
				qe(n, 2);
				break;
			case `${q}-3`:
				qe(n, 3);
				break;
			case `${q}-4`:
				qe(n, 4);
				break;
			case `${q}-5`:
				qe(n, 5);
				break;
			case `${q}-6`:
				qe(n, 6);
				break;
			case `${q}-U`:
				Je(n);
				break;
			case `${q}-O`: Be(n);
		}
	}
	return { addFormat: t };
}
var Mr = se("export", () => {
	let e = _t(), t = K();
	return {
		editorContent2HTML: () => U(),
		exportEditorContent2HTML: async () => {
			let t = e.currentPost;
			t && await tt(t.title);
		},
		exportEditorContent2PureHTML: (t) => {
			let n = e.currentPost;
			n && Ne(t, n.title);
		},
		downloadAsCardImage: async () => {
			let n = e.currentPost;
			n && await nt(n.title, { previewDevice: t.previewDevice });
		},
		downloadAsSegmentedImages: async (n = He) => {
			let r = e.currentPost;
			if (!r) return;
			let i = X.loading(Y("store.png.segmentsStart"));
			try {
				let e = await $e(r.title, {
					previewDevice: t.previewDevice,
					maxSegmentHeight: n,
					onProgress: (e, t) => {
						X.loading(Y("store.png.segmentsProgress", {
							done: e,
							total: t
						}), { id: i });
					}
				});
				e === 0 ? X.error(Y("store.png.segmentsEmpty"), { id: i }) : X.success(Y("store.png.segmentsDone", { count: e }), { id: i });
			} catch (e) {
				let t = e instanceof Error ? e.message : String(e);
				X.error(Y("store.png.segmentsFailed", { message: t }), { id: i });
			}
		},
		exportEditorContent2PDF: async (t) => {
			let n = e.currentPost;
			n && await Re(n.title, t);
		},
		exportEditorContent2MD: (t) => {
			let n = e.currentPost;
			n && Bn(t, n.title);
		}
	};
}), Nr = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, Pr = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, Fr = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, Ir = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, Lr = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, Rr = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, zr = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, Br = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, Vr = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, Hr = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, Ur = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, Wr = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, Gr = { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, Kr = /* @__PURE__ */ _({
	__name: "EditorContextMenu",
	setup(e) {
		let t = H(), n = Mn(), r = Ye(), i = vt(), a = Mr(), o = Ze(), s = Ke(), c = K(), { t: l } = ft(), { openTableEditDialog: u, toggleShowUploadImgDialog: d, toggleShowImportMdDialog: f, toggleShowComponentDialog: p, toggleShowEmojiManager: g } = c, _ = M(!1), v = M(null);
		function y(e) {
			let t = oe(i.editor);
			if (!t || !t.contentDOM.contains(e.target)) return;
			let n = t.posAtCoords({
				x: e.clientX,
				y: e.clientY
			});
			if (v.value = n, n == null) return;
			let { from: r, to: a } = t.state.selection.main;
			(n < r || n > a) && t.dispatch({ selection: { anchor: n } });
		}
		_e(() => document.addEventListener("contextmenu", y, !0)), m(() => document.removeEventListener("contextmenu", y, !0));
		function S(e) {
			if (!e) {
				v.value = null;
				return;
			}
			let t = oe(i.editor), n = v.value ?? t?.state.selection.main.head;
			_.value = t != null && n != null && kn(t.state.doc.toString(), n) !== null;
		}
		let { editor: C } = A(i), { addFormat: T } = jr(C), { formatContent: ee, resetContent: O, clearContent: k } = _n(), te = [
			Cn,
			ln,
			wn,
			xn,
			sn,
			pn
		], ne = z(() => it.map((e, t) => ({
			...e,
			icon: te[t],
			label: l("menu.headingN", { n: e.level })
		})));
		function re() {
			let e = jn(i.getSelection());
			c.openFormulaEditor({
				value: e.latex,
				displayMode: e.displayMode
			});
		}
		async function P() {
			let e = i.getSelection();
			Yt(e);
		}
		async function ae() {
			let e = await Wt();
			(!t || t.live && !t.signal.aborted) && e !== null && i.replaceSelection(e);
		}
		function F() {
			n.confirm({
				title: l("confirm.tip"),
				description: l("confirm.resetStyleDescription"),
				onConfirm: () => {
					s.resetStyle(), r.resetCssConfig(), s.applyCurrentTheme(), s.updateCodeTheme();
					let e = i.getContent();
					o.render(e), X.success(l("toast.styleReset"));
				}
			});
		}
		function se() {
			a.exportEditorContent2HTML();
		}
		function ce() {
			c.openPdfExportDialog();
		}
		function le() {
			a.exportEditorContent2MD(i.getContent());
		}
		function ue() {
			a.downloadAsCardImage();
		}
		function fe(e) {
			a.downloadAsSegmentedImages(e);
		}
		return (e, n) => {
			let r = Ar, i = kr, a = Or, o = Dr, s = Er, c = gr, m = hr, v = mr, y = pr;
			return x(), R(y, { "onUpdate:open": S }, {
				default: N(() => [E(r, null, {
					default: N(() => [b(e.$slots, "default")]),
					_: 3
				}), B(t) ? (x(), R(o, {
					key: 0,
					class: "w-56"
				}, {
					default: N(() => [
						E(i, { onClick: n[0] ||= (e) => B(d)() }, {
							default: N(() => [...n[33] ||= [I("插入图片", -1)]]),
							_: 1
						}),
						E(i, { onClick: n[1] ||= (e) => re() }, {
							default: N(() => [...n[34] ||= [I("编辑公式", -1)]]),
							_: 1
						}),
						E(i, { onClick: n[2] ||= (e) => B(u)() }, {
							default: N(() => [...n[35] ||= [I("编辑表格", -1)]]),
							_: 1
						}),
						E(a),
						E(i, { onClick: n[3] ||= (e) => B(T)(`${B(q)}-B`) }, {
							default: N(() => [...n[36] ||= [I("加粗", -1)]]),
							_: 1
						}),
						E(i, { onClick: n[4] ||= (e) => B(T)(`${B(q)}-I`) }, {
							default: N(() => [...n[37] ||= [I("斜体", -1)]]),
							_: 1
						}),
						E(i, { onClick: n[5] ||= (e) => B(ee)() }, {
							default: N(() => [...n[38] ||= [I("格式化正文", -1)]]),
							_: 1
						}),
						E(i, { onClick: n[6] ||= (e) => F() }, {
							default: N(() => [...n[39] ||= [I("恢复默认排版", -1)]]),
							_: 1
						}),
						E(i, { onClick: n[7] ||= (e) => B(k)() }, {
							default: N(() => [...n[40] ||= [I("清空正文", -1)]]),
							_: 1
						}),
						E(a),
						E(i, { onClick: n[8] ||= (e) => P() }, {
							default: N(() => [...n[41] ||= [I("复制选中文字", -1)]]),
							_: 1
						}),
						E(i, { onClick: n[9] ||= (e) => ae() }, {
							default: N(() => [...n[42] ||= [I("粘贴文字", -1)]]),
							_: 1
						})
					]),
					_: 1
				})) : (x(), R(o, {
					key: 1,
					class: "w-64 max-h-[80vh] overflow-y-auto"
				}, {
					default: N(() => [
						B(_) ? (x(), h(ie, { key: 0 }, [E(i, { onClick: n[10] ||= (e) => B(u)() }, {
							default: N(() => [E(B(un), { class: "mr-2 h-4 w-4" }), I(" " + L(B(l)("tableEditor.titleEdit")), 1)]),
							_: 1
						}), E(a)], 64)) : w("", !0),
						E(m, null, {
							default: N(() => [E(s, null, {
								default: N(() => [E(B(Cr), { class: "mr-2 h-4 w-4" }), I(" " + L(B(l)("menu.insert")), 1)]),
								_: 1
							}), E(c, { class: "w-48" }, {
								default: N(() => [
									E(i, { onClick: n[11] ||= (e) => B(d)() }, {
										default: N(() => [E(B(mn), { class: "mr-2 h-4 w-4" }), I(" " + L(B(l)("menu.image")), 1)]),
										_: 1
									}),
									E(i, { onClick: n[12] ||= (e) => re() }, {
										default: N(() => [E(B(Tr), { class: "mr-2 h-4 w-4" }), I(" " + L(B(l)("menu.formula")), 1)]),
										_: 1
									}),
									E(i, { onClick: n[13] ||= (e) => B(u)() }, {
										default: N(() => [E(B(un), { class: "mr-2 h-4 w-4" }), I(" " + L(B(l)("menu.table")), 1)]),
										_: 1
									}),
									E(i, { onClick: n[14] ||= (e) => B(p)() }, {
										default: N(() => [E(B(Sn), { class: "mr-2 h-4 w-4" }), I(" " + L(B(l)("menu.component")), 1)]),
										_: 1
									}),
									E(i, { onClick: n[15] ||= (e) => B(g)() }, {
										default: N(() => [E(B(on), { class: "mr-2 h-4 w-4" }), I(" " + L(B(l)("menu.emoji")), 1)]),
										_: 1
									})
								]),
								_: 1
							})]),
							_: 1
						}),
						E(m, null, {
							default: N(() => [E(s, null, {
								default: N(() => [E(B(yn), { class: "mr-2 h-4 w-4" }), I(" " + L(B(l)("contextMenu.textFormat")), 1)]),
								_: 1
							}), E(c, { class: "w-48" }, {
								default: N(() => [
									E(i, { onClick: n[16] ||= (e) => B(T)(`${B(q)}-B`) }, {
										default: N(() => [
											E(B(an), { class: "mr-2 h-4 w-4" }),
											I(" " + L(B(l)("menu.bold")) + " ", 1),
											E(v, null, {
												default: N(() => [j("kbd", Nr, L(B(J)), 1), n[43] ||= j("kbd", { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, "B", -1)]),
												_: 1
											})
										]),
										_: 1
									}),
									E(i, { onClick: n[17] ||= (e) => B(T)(`${B(q)}-I`) }, {
										default: N(() => [
											E(B(gn), { class: "mr-2 h-4 w-4" }),
											I(" " + L(B(l)("menu.italic")) + " ", 1),
											E(v, null, {
												default: N(() => [j("kbd", Pr, L(B(J)), 1), n[44] ||= j("kbd", { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, "I", -1)]),
												_: 1
											})
										]),
										_: 1
									}),
									E(i, { onClick: n[18] ||= (e) => B(T)(`${B(q)}-D`) }, {
										default: N(() => [
											E(B(hn), { class: "mr-2 h-4 w-4" }),
											I(" " + L(B(l)("menu.strikethrough")) + " ", 1),
											E(v, null, {
												default: N(() => [j("kbd", Fr, L(B(J)), 1), n[45] ||= j("kbd", { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, "D", -1)]),
												_: 1
											})
										]),
										_: 1
									}),
									E(a),
									E(i, { onClick: n[19] ||= (e) => B(T)(`${B(q)}-K`) }, {
										default: N(() => [
											E(B(vn), { class: "mr-2 h-4 w-4" }),
											I(" " + L(B(l)("menu.link")) + " ", 1),
											E(v, null, {
												default: N(() => [j("kbd", Ir, L(B(J)), 1), n[46] ||= j("kbd", { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, "K", -1)]),
												_: 1
											})
										]),
										_: 1
									}),
									E(i, { onClick: n[20] ||= (e) => B(T)(`${B(q)}-E`) }, {
										default: N(() => [
											E(B(br), { class: "mr-2 h-4 w-4" }),
											I(" " + L(B(l)("menu.inlineCode")) + " ", 1),
											E(v, null, {
												default: N(() => [j("kbd", Lr, L(B(J)), 1), n[47] ||= j("kbd", { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, "E", -1)]),
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
						E(m, null, {
							default: N(() => [E(s, null, {
								default: N(() => [E(B(Cn), { class: "mr-2 h-4 w-4" }), I(" " + L(B(l)("menu.heading")), 1)]),
								_: 1
							}), E(c, { class: "w-48" }, {
								default: N(() => [(x(!0), h(ie, null, D(B(ne), ({ level: e, icon: t, label: n }) => (x(), R(i, {
									key: e,
									onClick: (t) => B(T)(`${B(q)}-${e}`)
								}, {
									default: N(() => [
										(x(), R(de(t), { class: "mr-2 h-4 w-4" })),
										I(" " + L(n) + " ", 1),
										E(v, null, {
											default: N(() => [j("kbd", Rr, L(B(J)), 1), j("kbd", zr, L(e), 1)]),
											_: 2
										}, 1024)
									]),
									_: 2
								}, 1032, ["onClick"]))), 128))]),
								_: 1
							})]),
							_: 1
						}),
						E(i, { onClick: n[21] ||= (e) => B(T)(`${B(q)}-U`) }, {
							default: N(() => [
								E(B(dn), { class: "mr-2 h-4 w-4" }),
								I(" " + L(B(l)("menu.unorderedList")) + " ", 1),
								E(v, null, {
									default: N(() => [j("kbd", Br, L(B(J)), 1), n[48] ||= j("kbd", { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, "U", -1)]),
									_: 1
								})
							]),
							_: 1
						}),
						E(i, { onClick: n[22] ||= (e) => B(T)(`${B(q)}-O`) }, {
							default: N(() => [
								E(B(fn), { class: "mr-2 h-4 w-4" }),
								I(" " + L(B(l)("menu.orderedList")) + " ", 1),
								E(v, null, {
									default: N(() => [j("kbd", Vr, L(B(J)), 1), n[49] ||= j("kbd", { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, "O", -1)]),
									_: 1
								})
							]),
							_: 1
						}),
						E(a),
						E(i, { onClick: n[23] ||= (e) => B(f)(!0) }, {
							default: N(() => [E(B(Sr), { class: "mr-2 h-4 w-4" }), I(" " + L(B(l)("contextMenu.importMd")), 1)]),
							_: 1
						}),
						E(m, null, {
							default: N(() => [E(s, null, {
								default: N(() => [E(B(En), { class: "mr-2 h-4 w-4" }), I(" " + L(B(l)("menu.export")), 1)]),
								_: 1
							}), E(c, { class: "w-48" }, {
								default: N(() => [
									E(i, { onClick: n[24] ||= (e) => le() }, {
										default: N(() => [E(B(En), { class: "mr-2 h-4 w-4" }), I(" " + L(B(l)("contextMenu.exportMd")), 1)]),
										_: 1
									}),
									E(i, { onClick: n[25] ||= (e) => se() }, {
										default: N(() => [E(B(br), { class: "mr-2 h-4 w-4" }), I(" " + L(B(l)("contextMenu.exportHtml")), 1)]),
										_: 1
									}),
									E(i, { onClick: n[26] ||= (e) => ce() }, {
										default: N(() => [E(B(Dn), { class: "mr-2 h-4 w-4" }), I(" " + L(B(l)("contextMenu.exportPdf")), 1)]),
										_: 1
									}),
									E(i, { onClick: n[27] ||= (e) => ue() }, {
										default: N(() => [E(B(xr), { class: "mr-2 h-4 w-4" }), I(" " + L(B(l)("contextMenu.exportPng")), 1)]),
										_: 1
									}),
									E(m, null, {
										default: N(() => [E(s, null, {
											default: N(() => [E(B(xr), { class: "mr-2 h-4 w-4" }), I(" " + L(B(l)("contextMenu.exportPngSegments")), 1)]),
											_: 1
										}), E(c, { class: "w-48" }, {
											default: N(() => [(x(!0), h(ie, null, D(B(Ie), (e) => (x(), R(i, {
												key: e,
												onClick: (t) => fe(e)
											}, {
												default: N(() => [I(L(B(l)("menu.exportPngSegmentHeight", { height: e })), 1)]),
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
						E(a),
						E(i, { onClick: n[28] ||= (e) => B(ee)() }, {
							default: N(() => [
								E(B(yn), { class: "mr-2 h-4 w-4" }),
								I(" " + L(B(l)("menu.formatContent")) + " ", 1),
								E(v, null, {
									default: N(() => [
										j("kbd", Hr, L(B(at)), 1),
										j("kbd", Ur, L(B(st)), 1),
										n[50] ||= j("kbd", { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, "F", -1)
									]),
									_: 1
								})
							]),
							_: 1
						}),
						E(i, { onClick: n[29] ||= (e) => B(O)() }, {
							default: N(() => [E(B(bn), { class: "mr-2 h-4 w-4" }), I(" " + L(B(l)("menu.reset")), 1)]),
							_: 1
						}),
						E(i, { onClick: n[30] ||= (e) => F() }, {
							default: N(() => [E(B(wr), { class: "mr-2 h-4 w-4" }), I(" " + L(B(l)("contextMenu.resetStyle")), 1)]),
							_: 1
						}),
						E(i, { onClick: n[31] ||= (e) => B(k)() }, {
							default: N(() => [E(B(On), { class: "mr-2 h-4 w-4" }), I(" " + L(B(l)("menu.clear")), 1)]),
							_: 1
						}),
						E(a),
						E(i, { onClick: n[32] ||= (e) => P() }, {
							default: N(() => [
								E(B(yr), { class: "mr-2 h-4 w-4" }),
								I(" " + L(B(l)("menu.copy")) + " ", 1),
								E(v, null, {
									default: N(() => [j("kbd", Wr, L(B(J)), 1), n[51] ||= j("kbd", { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, "C", -1)]),
									_: 1
								})
							]),
							_: 1
						}),
						E(i, { onClick: ae }, {
							default: N(() => [
								E(B(vr), { class: "mr-2 h-4 w-4" }),
								I(" " + L(B(l)("menu.paste")) + " ", 1),
								E(v, null, {
									default: N(() => [j("kbd", Gr, L(B(J)), 1), n[52] ||= j("kbd", { class: "mx-1 bg-gray-2 dark:bg-stone-9" }, "V", -1)]),
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
}), qr = /<[A-Z]*$/i, Jr = /<([A-Z][A-Za-z0-9]*)\b([^>]*?)\s([a-zA-Z][\w-]*)?$/, Yr = /* @__PURE__ */ new Set([
	"FencedCode",
	"CodeBlock",
	"InlineCode"
]), Xr = "<svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/></svg>", Zr = "<svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 7h16\"/><path d=\"M4 12h10\"/><path d=\"M4 17h7\"/></svg>";
function Qr(e, t = 42) {
	if (!e) return;
	let n = e.trim();
	return n.length <= t ? n : `${n.slice(0, t - 1)}…`;
}
function $r(e) {
	let t = document.createElement("li");
	return t.className = "md-completion-section", t.setAttribute("aria-hidden", "true"), t.textContent = e.name, t;
}
function ei() {
	return {
		name: Y("component.completionSectionComponents"),
		rank: 1,
		header: $r
	};
}
function ti() {
	return {
		name: Y("component.completionSectionProps"),
		rank: 1,
		header: $r
	};
}
function ni(e) {
	try {
		let t = r(e.state).resolveInner(e.pos, -1);
		for (let e = t; e; e = e.parent) if (Yr.has(e.name)) return !0;
	} catch {}
	return !1;
}
function ri(e) {
	let t = document.createElement("span");
	return t.className = "md-completion-icon", e.type === "property" ? (t.classList.add("md-completion-icon--prop"), t.innerHTML = Zr, t.title = Y("component.completionSectionProps")) : (t.classList.add("md-completion-icon--component"), t.innerHTML = Xr, t.title = Y("component.completionSectionComponents")), t;
}
function ii(e, t, n, r) {
	let i = Ae(t), a = n > 0 && e.state.doc.sliceString(n - 1, n) === "<" ? n - 1 : n;
	e.dispatch({
		changes: {
			from: a,
			to: r,
			insert: i
		},
		selection: { anchor: a + i.length }
	});
}
function ai(e, t) {
	let n = e.matchBefore(qr);
	if (!n) return null;
	let r = n.text.slice(1);
	if (!e.explicit && r.length > 0 && !/^[A-Z]/.test(r)) return null;
	let i = n.from + 1, a = r.toLowerCase(), o = ei(), s = t.filter((e) => !a || e.name.toLowerCase().startsWith(a)).map((e) => ({
		label: e.name,
		detail: Qr(e.description),
		type: "class",
		boost: +!!e.builtIn,
		section: o,
		apply: (t, n, r, i) => {
			ii(t, e, r, i);
		}
	}));
	return !s.length && !e.explicit ? null : {
		from: i,
		options: s,
		validFor: /^[A-Z]*$/i
	};
}
function oi(e, t) {
	let n = e.state.doc.lineAt(e.pos), r = e.state.doc.sliceString(n.from, e.pos), i = r.match(Jr);
	if (!i) return null;
	let a = i[1], o = i[2] ?? "", s = i[3] ?? "", c = t.find((e) => e.name === a);
	if (!c || !c.props.length) return null;
	let l = r.slice(r.indexOf(`<${a}`) + a.length + 1);
	if (!/^\s/.test(l) && !o) return null;
	let u = ke(o), d = s.toLowerCase(), f = ti(), p = c.props.filter((e) => !u.has(e.name) && (!d || e.name.toLowerCase().startsWith(d))).map((e) => ({
		label: e.name,
		detail: Qr(e.description || e.type || "string"),
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
function si(e) {
	return (t) => {
		if (ni(t)) return null;
		let n = e();
		return n.length ? oi(t, n) ?? ai(t, n) : null;
	};
}
function ci(t) {
	return [n({
		override: [si(t)],
		defaultKeymap: !1,
		activateOnTyping: !0,
		icons: !1,
		aboveCursor: !1,
		tooltipClass: () => "md-completion-tooltip",
		optionClass: (e) => e.type === "property" ? "md-completion-option md-completion-option--prop" : "md-completion-option md-completion-option--component",
		addToOptions: [{
			position: 25,
			render: (e) => ri(e)
		}]
	}), s.high(c.of(e.filter((e) => e.key !== "Tab")))];
}
async function li(e, t) {
	let { fileUpload: n } = await import("./chunks/providers-Bmgr2ar7.js");
	return n(e, t);
}
var ui = "uploaded_image_map";
function di(e, t) {
	return `${e}:${t}`;
}
function fi() {
	let e = M(!1), t = M(null), n = async () => await ct.getJSON(ui, {}) ?? {}, r = async (e, t) => {
		let r = await n();
		r[e] = t, await ct.setJSON(ui, r);
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
				let t = e.message.includes("Failed to fetch") || e.name === "TypeError" ? Y("store.uploader.corsFailed") : Y("store.uploader.downloadFailed", { message: e.message });
				throw Error(t);
			}
		}
	};
	return {
		upload: async (o) => {
			let s = H();
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
				let t = await i(e), s = di(await ct.get("imgHost") || "default", t), c = await n();
				if (c[s]) return c[s];
				let l = await li(await rt(e), e);
				return l && await r(s, l), l;
			} catch (e) {
				console.error(e);
				let n = e.message || Y("store.uploader.uploadFailed");
				throw t.value = n, Error(n);
			} finally {
				e.value = !1;
			}
		},
		isUploading: e,
		error: t
	};
}
var pi = "app-initial-loader", mi = !1, hi;
function gi() {
	mi || (mi = !0, hi &&= (clearTimeout(hi), void 0), requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			let e = V(pi);
			e instanceof HTMLElement && (e.style.transition = "opacity 0.3s ease", e.style.opacity = "0", window.setTimeout(() => e.remove(), 300));
		});
	}));
}
var _i = 2e4, vi = 5e3, yi = 50, bi = !1;
async function xi(e = vi) {
	let t = Date.now() + e;
	for (; Date.now() < t;) {
		let e = V("output");
		if (e) return e;
		await je(yi);
	}
	return V("output");
}
async function Si() {
	bi || (bi = !0, await xi(), await Te(_i), gi());
}
var Ci = {
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
function wi(e, t, n) {
	return Ci[e]?.[t] ?? n;
}
function Ti(e, t) {
	let n = new Map(e.map((e) => [e.name, e]));
	for (let e of t) {
		let t = n.get(e.name);
		t?.hidden || t?.inline || n.set(e.name, e);
	}
	return [...n.values()];
}
function Ei(e, t, n, r) {
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
		example: wi(t, e.name, e.example)
	};
}
function Di(e, t, n) {
	return St.map((r) => Ei(r, e, t, n));
}
function Oi() {
	let { t: e, te: t, locale: n } = ft(), r = We();
	return z(() => (n.value, Ti(Di(n.value, e, t), r.userComponents)));
}
var ki = Fn.map((e) => e.id);
function Ai(e, t) {
	let n = `upload.hosts.${t}`, r = e(n);
	return r === n ? t : r;
}
function ji(e) {
	return ki.map((t) => ({
		value: t,
		label: Ai(e, t),
		desc: ""
	}));
}
function Mi() {
	let { t: e, locale: t } = ft();
	return z(() => (t.value, ji(e)));
}
function Ni() {
	let e = M(!1), t = M({
		x: 0,
		y: 0,
		top: 0
	}), n = M(""), r = M(0), i = M(-1), { locale: a } = ft(), o = z(() => (a.value, cn().filter((e) => !H() || e.id !== "component"))), l = z(() => {
		let e = n.value.toLowerCase().trim();
		return e ? o.value.filter((t) => t.label.toLowerCase().includes(e) || t.id.toLowerCase().includes(e) || t.keywords.some((t) => t.toLowerCase().includes(e))) : o.value;
	}), d = z(() => l.value.filter((e) => e.group === "basic")), f = z(() => l.value.filter((e) => e.group === "common")), p = z(() => l.value.filter((e) => e.group === "edit")), m = z(() => l.value.filter((e) => e.group === "style"));
	function h(a, o) {
		let s = a.coordsAtPos(o);
		s && (i.value = o, n.value = "", r.value = 0, t.value = {
			x: s.left,
			y: s.bottom,
			top: s.top
		}, e.value = !0);
	}
	function g() {
		e.value = !1, n.value = "", i.value = -1;
	}
	function _(e, t) {
		let n = i.value;
		if (n < 0) return;
		let r = e.state.selection.main.head;
		e.dispatch({ changes: {
			from: n,
			to: r,
			insert: ""
		} }), g(), t.action(e);
	}
	function v() {
		let e = l.value.length;
		e !== 0 && (r.value = (r.value + 1) % e);
	}
	function y() {
		let e = l.value.length;
		e !== 0 && (r.value = (r.value - 1 + e) % e);
	}
	function b(t) {
		return [u.updateListener.of((a) => {
			if (e.value && a.viewportChanged && !a.docChanged) {
				g();
				return;
			}
			if (!a.docChanged) return;
			let o = a.state, s = o.selection.main.head;
			if (!e.value) a.changes.iterChanges((e, n, r, i, a) => {
				if (a.length === 1 && a.toString() === "/") {
					let e = o.doc.lineAt(r), n = r > e.from ? o.doc.sliceString(r - 1, r) : "";
					if (r === e.from || n === " " || n === "	") {
						let e = t();
						e && h(e, r);
					}
				}
			});
			else {
				let e = i.value;
				if (e < 0 || s < e) {
					g();
					return;
				}
				let t = o.doc.sliceString(e, s);
				if (!t.startsWith("/")) {
					g();
					return;
				}
				n.value = t.slice(1), r.value = 0, l.value.length === 0 && g();
			}
		}), s.highest(c.of([
			{
				key: "ArrowDown",
				run: () => e.value ? (v(), !0) : !1
			},
			{
				key: "ArrowUp",
				run: () => e.value ? (y(), !0) : !1
			},
			{
				key: "Enter",
				run: (t) => {
					if (!e.value) return !1;
					let n = l.value[r.value];
					return n ? _(t, n) : g(), !0;
				}
			},
			{
				key: "Escape",
				run: () => e.value ? (g(), !0) : !1
			}
		]))];
	}
	return {
		visible: e,
		position: t,
		filter: n,
		activeIndex: r,
		filteredCommands: l,
		basicCommands: d,
		commonCommands: f,
		editCommands: p,
		styleCommands: m,
		allCommands: o,
		closeMenu: g,
		executeCommand: _,
		createExtension: b
	};
}
function Pi(e) {
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
function Fi(e, t) {
	let n = Number.parseInt(e, 10);
	return Math.max(1, Math.min(Number.isFinite(n) && n > 0 ? n : 1, Math.max(t, 1)));
}
function Ii(e, t, n) {
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
function Li(e, t, n = "start") {
	let r = Fi(String(t), e.state.doc.lines), i = e.state.doc.line(r);
	return e.dispatch({
		selection: { anchor: i.from },
		effects: u.scrollIntoView(i.from, { y: n })
	}), e.focus(), !0;
}
function Ri(e, t) {
	let n = Pi(e.state.doc), r = e.state.doc.lineAt(e.state.selection.main.head).number, i = Ii(n, r, t);
	return i != null && Li(e, i);
}
var zi = /\.(?:gif|pjp|jfif|jpe|pjpeg|jpe?g|png|webp)$/i, Bi = 10, Vi = {
	"image/gif": "gif",
	"image/jpeg": "jpg",
	"image/pjpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp"
};
new Set(Object.keys(Vi));
function Hi(e) {
	return zi.test(e);
}
function Ui(e) {
	return e in Vi;
}
function Wi(e) {
	if (Hi(e.name)) return e;
	let t = Vi[e.type] ?? "png", n = Ui(e.type) ? e.type : "image/png";
	return new File([e], `pasted-image.${t}`, { type: n });
}
function Gi(e, t) {
	return !Hi(e.name) && !Ui(e.type) ? {
		ok: !1,
		msg: t("upload.errors.invalidFormat")
	} : e.size > Bi * 1024 * 1024 ? {
		ok: !1,
		msg: t("upload.errors.tooLarge", { maxSize: Bi })
	} : { ok: !0 };
}
function Ki(e) {
	return Ui(e.type) || Hi(e.name);
}
function qi(e) {
	let t = [];
	for (let n of e) n && Ki(n) && t.push(Wi(n));
	return t;
}
function Ji(e) {
	if (!e) return [];
	let t = qi(Array.from(e.items ?? []).map((e) => e.kind === "file" ? e.getAsFile() : null));
	return t.length > 0 ? t : qi(Array.from(e.files ?? []));
}
var Yi = ["lang"], Xi = /*#__PURE__*/ zn(/* @__PURE__ */ _({
	__name: "EditorPanel",
	setup(e, { expose: t }) {
		let n = v(() => import("./chunks/SlashCommandMenu-CPpQMmMv.js")), r = v(() => import("./chunks/SearchTab-DCLuJ11n.js")), { t: o, locale: f } = ft(), p = Mi(), g = H(), _ = !1, y = () => !_ && (!g || g.live && !g.signal.aborted), b = vt(), C = _t(), T = Ze(), D = Ke(), k = K(), te = Oi(), { upload: re } = fi(), { editorRefresh: P, scheduleEditorRefresh: ie } = Nn(), { visible: ae, position: F, filter: oe, activeIndex: se, basicCommands: ce, commonCommands: le, editCommands: de, styleCommands: fe, filteredCommands: pe, closeMenu: me, executeCommand: I, createExtension: L } = Ni();
		function ge(e) {
			ae.value && (e.preventDefault(), e.stopPropagation());
		}
		let { editor: z } = A(b), { isDark: ve } = A(k), { posts: ye, currentPostIndex: be, currentPost: V } = A(C), { enableImageReupload: xe, viewMode: Se } = A(k), { toggleShowUploadImgDialog: we } = k, U = ue(null), Te = new a(), Ee = new a(), De = new a();
		function Oe() {
			return d(o("codemirror.contentPlaceholder"));
		}
		let W = M(), ke = ee("editorRef"), Ae = ee("codeMirrorWrapper"), je = M(!1), G = ee("searchTabRef"), Me = M(!1), Ne = M(null);
		function Pe(e, t, n = !1) {
			n ? e.setSearchWithReplace(t) : t ? e.setSearchWord(t) : e.showSearchTab = !0;
		}
		function Fe() {
			Me.value = !0;
		}
		let { searchTabRequest: Ie } = A(k);
		function Re(e) {
			Fe();
			let t = e.state.selection.main, n = e.state.doc.sliceString(t.from, t.to).trim();
			G.value ? Pe(G.value, n) : Ne.value = { selected: n };
		}
		function ze(e) {
			Fe();
			let t = e.state.selection.main, n = e.state.doc.sliceString(t.from, t.to).trim();
			G.value ? G.value.setSearchWithReplace(n) : k.openSearchTab(n, !0);
		}
		O(G, (e) => {
			if (e && (Ne.value &&= (Pe(e, Ne.value.selected), null), Ie.value)) {
				let { word: t, showReplace: n } = Ie.value;
				Pe(e, t, n), k.clearSearchTabRequest();
			}
		}), O(Ie, (e) => {
			e && (Fe(), G.value && (Pe(G.value, e.word, e.showReplace), k.clearSearchTabRequest()));
		});
		function Be(e) {
			if (!y() || !Ce(e)) return;
			let t = U.value;
			e.key === "Escape" && G.value?.showSearchTab && (G.value.showSearchTab = !1, e.preventDefault(), t?.focus());
		}
		async function Ve(e) {
			if (g) return y();
			let t = Gi(e, o);
			if (!t.ok) return X.error(t.msg), !1;
			let n = await ct.get("imgHost") || "default";
			if (await ct.set("imgHost", n), !await Pn(n)) {
				let e = p.value.find((e) => e.value === n)?.label ?? n;
				return X.error(o("editorPanel.configureImgHost", { host: e })), we(!0), !1;
			}
			return !0;
		}
		function He(e) {
			if (!e) {
				X.error(o("editorPanel.uploadUnknownError"));
				return;
			}
			if (g || setTimeout(() => {
				we(!1);
			}, 1e3), !y()) return;
			let t = g ? `<img src="${e}" alt="图片">` : `![](${e})`;
			U.value && U.value.dispatch(U.value.state.replaceSelection(`\n${t}\n`)), X.success(o("editorPanel.uploadSuccess"));
		}
		async function We(e) {
			let { default: t } = await import("./chunks/browser-image-compression-BN7VflS2.js");
			return await t(e, {
				maxSizeMB: 1,
				maxWidthOrHeight: 1920,
				useWebWorker: !0
			});
		}
		async function Ge(e, t, n) {
			try {
				if (je.value = !0, !y()) return;
				if (g) {
					let n = await re(e);
					if (!y()) return;
					if (t) {
						let r = await rt(e);
						if (!y()) return;
						t(n, r);
					} else He(n);
					return;
				}
				await ct.get("useCompression") === "true" && (e = await We(e));
				let r = await re(e);
				if (t ? t(r, await rt(e)) : He(r), n) return He(r);
			} catch (e) {
				if (!y()) return;
				X.error(e instanceof Error ? e.message : o("store.uploader.uploadFailed")), t?.("", "");
			} finally {
				je.value = !1;
			}
		}
		async function qe({ list: e }) {
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
		async function Je(e) {
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
		async function Ye({ md: e, list: t }) {
			let n = [...e.str.matchAll(/!\[(.*?)\]\((.*?)\)/g) || []].filter((e) => e), r = e.path.match(/.+?\//)[0];
			(await Promise.all(n.map((e) => new Promise((n) => {
				let [, , i] = e;
				i = i.replace(/^.\//, "");
				let { file: a } = t.find((e) => e.path === `${r}${i}`) || {};
				Ge(a, (e) => n({
					matchStr: i,
					url: e
				}));
			})))).forEach((t) => {
				e.str = e.str.replace(`](./${t.matchStr})`, `](${t.url})`).replace(`](${t.matchStr})`, `](${t.url})`);
			}), U.value && U.value.dispatch({ changes: {
				from: 0,
				to: U.value.state.doc.length,
				insert: e.str
			} });
		}
		function Xe() {
			let e = Ae.value;
			e && (e.ondragover = (e) => e.preventDefault(), e.ondrop = async (e) => {
				if (e.preventDefault(), e.dataTransfer != null && Array.isArray(e.dataTransfer.items)) for (let t of e.dataTransfer.items.filter((e) => e.kind === "file")) t.getAsFileSystemHandle().then(async (e) => {
					if (e.kind === "directory") {
						let t = await Je(e);
						Ye({
							md: await qe({ list: t }),
							list: t
						});
					} else {
						let t = await e.getFile();
						await Ve(t) && Ge(t);
					}
				});
			});
		}
		function Qe() {
			return (e, t) => {
				if (!y() || !Ce(e)) return !1;
				let n = Ji(e.clipboardData);
				if (n.length > 0) return je.value || (async () => {
					let e = [];
					for (let t of n) await Ve(t) && e.push(t);
					for (let t of e) await Ge(t);
				})(), !0;
				let r = e.clipboardData?.getData("text/plain");
				if (r && !g) {
					let e = /!\[(.*?)\]\((https?:\/\/[^)]+)\)/g, n = [...r.matchAll(e)];
					if (n.length > 0) {
						je.value = !0;
						let i = r, a = /* @__PURE__ */ new Map(), s = 0;
						i = i.replace(e, (e, t, n) => {
							let r = `LOADING_${Date.now()}_${s++}`;
							return a.set(r, {
								originalUrl: n,
								originalAlt: t
							}), `![${o("editorPanel.reuploading")}](${r})`;
						}), t.dispatch(t.state.replaceSelection(i));
						let c = [...new Set(n.map((e) => e[2]))];
						return Promise.all(c.map(async (e) => {
							try {
								let n = xe.value ? await re(e) : e;
								for (let [r, i] of a.entries()) if (i.originalUrl === e) {
									let e = `![${o("editorPanel.reuploading")}](${r})`, a = t.state.doc.toString().indexOf(e);
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
									let e = `![${o("editorPanel.reuploading")}](${n})`, i = t.state.doc.toString().indexOf(e);
									if (i !== -1) {
										let n = `![${r.originalAlt}](${r.originalUrl})`;
										t.dispatch({ changes: {
											from: i,
											to: i + e.length,
											insert: n
										} });
									}
								}
								X.error(o("editorPanel.reuploadFailed"));
							}
						})).finally(() => {
							je.value = !1;
						}), !0;
					}
				}
				return !1;
			};
		}
		function $e(e) {
			let t = l.create({
				doc: ye.value[be.value]?.content ?? "",
				extensions: [
					Le({
						onSearch: Re,
						onReplace: ze,
						onGoToLine: () => k.requestGoToLine(),
						withoutHistory: !0
					}),
					De.of(i()),
					s.high(c.of([{
						key: "Mod-Alt-ArrowUp",
						run: (e) => Ri(e, "prev")
					}, {
						key: "Mod-Alt-ArrowDown",
						run: (e) => Ri(e, "next")
					}])),
					Ee.of(Oe()),
					Te.of(Ue(ve.value)),
					u.updateListener.of((e) => {
						if (e.docChanged) {
							if (!y()) return;
							ie(), clearTimeout(W.value), W.value = setTimeout(() => {
								at();
							}, 300);
						}
					}),
					u.domEventHandlers({
						paste: Qe(),
						drop: (e) => {
							if (!g || !Ce(e) || !e.dataTransfer?.files.length) return !1;
							e.preventDefault();
							for (let t of Array.from(e.dataTransfer.files)) t.type.startsWith("image/") && Ge(t);
							return !0;
						}
					}),
					...L(() => U.value),
					...ci(() => te.value)
				]
			}), n = new u({
				state: t,
				parent: e
			});
			return U.value = n, n;
		}
		function et() {
			P();
		}
		async function tt(e) {
			if (bt(e)) try {
				await yt();
			} catch (e) {
				console.error(e);
			}
		}
		let nt = 0;
		function it(e) {
			if (clearTimeout(W.value), W.value = void 0, !U.value || e < 0) return;
			let t = U.value.state.doc.toString(), n = ye.value[e];
			n && t !== n.content && (n.updateDatetime = /* @__PURE__ */ new Date(), n.content = t);
		}
		function at() {
			it(be.value);
		}
		_e(() => {
			let e = ke.value;
			if (e == null) {
				Si();
				return;
			}
			window.addEventListener(xt, et), document.addEventListener("keydown", Be, {
				passive: !1,
				capture: !1
			}), (async () => {
				try {
					if (await T.initRendererInstance({
						isMacCodeBlock: D.isMacCodeBlock,
						isShowLineNumber: D.isShowLineNumber
					}), !y() || (await D.applyCurrentTheme(), !y()) || (await S(), !y())) return;
					let t = $e(e);
					z.value = t, b.registerContentFlush(at);
					let n = ye.value[be.value]?.content ?? "";
					if (g || await tt(n), !y()) return;
					P(), g || Xe(), g?.readyResolve?.();
				} catch (e) {
					g?.readyReject?.(e), g?.onError(e instanceof Error ? e.message : "编辑器初始化失败"), console.error("[EditorPanel] Failed to initialize editor", e);
				} finally {
					Si();
				}
			})();
		}), O(ve, () => {
			U.value && U.value.dispatch({ effects: Te.reconfigure(Ue(ve.value)) }), P();
		}), O(f, () => {
			U.value && (U.value.dispatch({ effects: Ee.reconfigure(Oe()) }), P());
		});
		function q(e) {
			let t = U.value;
			if (!t || t.state.doc.toString() === e) return;
			let n = ++nt;
			Vn(t, e), Hn(t, De), tt(e).then(() => {
				n === nt && P();
			});
		}
		O(be, (e, t) => {
			t !== void 0 && t >= 0 && it(t);
			let n = ye.value[e];
			n && q(n.content);
		}), O(() => V.value?.content, (e) => {
			e != null && q(e);
		});
		let st = M();
		return _e(() => {
			st.value = setInterval(() => {
				if (!y()) return;
				let e = ye.value[be.value];
				e && (e.history || [])[0]?.content !== e.content && (e.history ??= [], e.history.unshift({
					content: e.content,
					datetime: ot()
				}), e.history.length = Math.min(e.history.length, 10));
			}, 3e4);
		}), m(() => {
			_ = !0, U.value?.destroy(), U.value = null, z.value = null, b.unregisterContentFlush(), window.removeEventListener(xt, et), clearTimeout(st.value), clearTimeout(W.value), document.removeEventListener("keydown", Be, { capture: !1 });
		}), t({
			codeMirrorView: U,
			editorRefresh: P,
			uploadImage: Ge,
			isImgLoading: je
		}), (e, t) => {
			let i = Kr;
			return he((x(), h("div", {
				ref_key: "codeMirrorWrapper",
				ref: Ae,
				class: "codeMirror-wrapper relative h-full",
				onContextmenuCapture: ge
			}, [
				B(Me) && B(U) ? (x(), R(B(r), {
					key: 0,
					ref_key: "searchTabRef",
					ref: G,
					"editor-view": B(U)
				}, null, 8, ["editor-view"])) : w("", !0),
				B(ae) ? (x(), R(B(n), {
					key: 1,
					visible: B(ae),
					position: B(F),
					"active-index": B(se),
					filter: B(oe),
					"container-el": B(Ae),
					"basic-commands": B(ce),
					"common-commands": B(le),
					"edit-commands": B(de),
					"style-commands": B(fe),
					"filtered-commands": B(pe),
					onExecute: t[0] ||= (e) => B(U) && B(I)(B(U), e),
					onClose: t[1] ||= (e) => B(me)()
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
				])) : w("", !0),
				E(i, null, {
					default: N(() => [j("div", {
						id: "editor",
						ref_key: "editorRef",
						ref: ke,
						class: "codemirror-container mathjax-ignore",
						lang: B(pt)
					}, null, 8, Yi)]),
					_: 1
				})
			], 544)), [[ne, B(Se) !== "preview"]]);
		};
	}
}), [["__scopeId", "data-v-5e90bfc7"]]), Zi = /*#__PURE__*/ zn(/* @__PURE__ */ _({
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
	setup(e) {
		let t = e, { t: n } = ft(), r = M(t.visibilityHeight ?? 400), i = M(!1), a = M(null), o = z(() => ({
			left: t.left == null ? void 0 : `${t.left}px`,
			top: t.top == null ? void 0 : `${t.top}px`,
			right: t.right == null ? void 0 : `${t.right}px`,
			bottom: t.bottom == null ? void 0 : `${t.bottom}px`
		}));
		function s(e) {
			a.value?.scrollTo({
				top: 0,
				left: 0,
				behavior: "smooth"
			}), t.onClick?.(e);
		}
		let c = Ct((e) => {
			e instanceof HTMLElement ? i.value = e.scrollTop > r.value : i.value = window.scrollY > r.value;
		}, 200, !0, !0);
		function l() {
			c(a.value);
		}
		return _e(() => {
			t.target ? a.value = V(t.target) : a.value = window, a.value?.addEventListener("scroll", l);
		}), m(() => {
			a.value?.removeEventListener("scroll", l);
		}), (e, t) => {
			let r = It;
			return x(), R(pe, { name: "back-top" }, {
				default: N(() => [B(i) ? (x(), R(r, {
					key: 0,
					variant: "outline",
					size: "icon",
					class: "absolute z-50 rounded-full border bg-background/90 text-foreground/80 shadow-md backdrop-blur-sm hover:bg-background hover:text-foreground hover:shadow-lg",
					style: g(B(o)),
					"aria-label": B(n)("common.backToTop"),
					title: B(n)("common.backToTop"),
					onClick: s
				}, {
					default: N(() => [E(B(_r), { class: "size-5" })]),
					_: 1
				}, 8, [
					"style",
					"aria-label",
					"title"
				])) : w("", !0)]),
				_: 1
			});
		};
	}
}), [["__scopeId", "data-v-ce240466"]]), Qi = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"11\" height=\"11\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><polyline points=\"7 10 12 15 17 10\"/><line x1=\"12\" y1=\"15\" x2=\"12\" y2=\"3\"/></svg>", $i = ".mermaid-diagram, .plantuml-diagram";
function ea(e, t) {
	let n = document.createElement("a");
	n.href = e, n.download = t, n.style.display = "none", be(n), n.click(), n.remove();
}
function ta(e) {
	let t = e.cloneNode(!0);
	return t.hasAttribute("xmlns") || t.setAttribute("xmlns", "http://www.w3.org/2000/svg"), t;
}
function na(e, t = "diagram") {
	let n = new XMLSerializer().serializeToString(ta(e)), r = new Blob([n], { type: "image/svg+xml;charset=utf-8" }), i = URL.createObjectURL(r);
	ea(i, `${t}.svg`), URL.revokeObjectURL(i);
}
function ra(e, t = "diagram") {
	let n = e.getBoundingClientRect(), r = n.width || e.viewBox?.baseVal?.width || 800, i = n.height || e.viewBox?.baseVal?.height || 600, a = Math.max(2, window.devicePixelRatio), o = ta(e);
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
				ea(i, `${t}.png`), URL.revokeObjectURL(i), e();
			}, "image/png");
		}, o.onerror = () => n(/* @__PURE__ */ Error("Failed to load SVG as image")), o.src = c;
	});
}
function ia(e, t) {
	let n = document.createElement("button");
	return n.className = "diagram-download-btn", n.type = "button", n.title = t, n.innerHTML = `${Qi}<span>${e}</span>`, n;
}
function aa(e, t) {
	let n = document.createElement("div");
	n.className = "diagram-download-bar";
	let r = ia("SVG", Y("store.diagram.downloadSvg"));
	r.addEventListener("click", (n) => {
		n.preventDefault(), n.stopPropagation();
		let r = e.querySelector("svg");
		r && na(r, `diagram-${t}`);
	});
	let i = ia("PNG", Y("store.diagram.downloadPng"));
	return i.addEventListener("click", async (n) => {
		n.preventDefault(), n.stopPropagation();
		let r = e.querySelector("svg");
		if (!r) return;
		i.disabled = !0;
		let a = i.innerHTML;
		i.innerHTML = "<span class=\"diagram-btn-loading\">•••</span>";
		try {
			await ra(r, `diagram-${t}`);
		} finally {
			i.disabled = !1, i.innerHTML = a;
		}
	}), n.append(r, i), n;
}
function oa(e, t) {
	getComputedStyle(e).position === "static" && (e.style.position = "relative"), e.querySelector(".diagram-download-bar")?.remove(), e.appendChild(aa(e, t));
}
function sa(e) {
	let t = !1, n = 0;
	function r(e) {
		!t && e.querySelector("svg") && !e.querySelector(".diagram-download-bar") && oa(e, ++n);
	}
	function i() {
		e.querySelectorAll($i).forEach(r);
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
function ca() {
	return dt();
}
function la(e) {
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
var ua = class extends In {
	async getDefault() {
		return la(await this.request("GET", "/emojis/default"));
	}
	async getMine() {
		return la(await this.request("GET", "/emojis/me"));
	}
	async renameMine(e) {
		return la(await this.request("PATCH", "/emojis/me", { name: e }));
	}
	async upload(e) {
		let t = new FormData();
		return t.set("file", e), la(await this.request("POST", "/emojis/me/items", t));
	}
	async removeItem(e) {
		return la(await this.request("DELETE", `/emojis/me/items/${encodeURIComponent(e)}`));
	}
	clearMine() {
		return this.request("DELETE", "/emojis/me");
	}
};
function da(e) {
	return e instanceof Ln ? e.message : "emoji_request_failed";
}
var fa = se("emojiPack", () => {
	let e = Rn(), t = new ua(() => e.token || null), n = M(null), r = M(null), i = M(!1), a = M(!1), o = M(!1), s = M(0), c = M(0), l = M(null), u = M(null), d = z(() => [n.value, r.value].filter((e) => !!e)), f = z(() => d.value.flatMap((e) => e.files)), p = z(() => new Map(f.value.map((e) => [e.id, e]))), m = z(() => ca()), h = z(() => Math.max(0, 100 - (r.value?.files.length ?? 0)));
	function g(e) {
		n.value && W(n.value.files.map((e) => e.id)), n.value = e, De(e.files);
	}
	function _(e) {
		r.value && W(r.value.files.map((e) => e.id)), r.value = e, e && De(e.files);
	}
	async function v(e = !1) {
		if (!m.value || i.value || n.value && !e) return !!n.value;
		i.value = !0, l.value = null;
		try {
			return g(await t.getDefault()), !0;
		} catch (e) {
			return l.value = da(e), !1;
		} finally {
			i.value = !1;
		}
	}
	async function y(n = !1) {
		if (!e.isLoggedIn) return _(null), !1;
		if (a.value || r.value && !n) return !!r.value;
		a.value = !0, u.value = null;
		try {
			return _(await t.getMine()), !0;
		} catch (e) {
			return u.value = da(e), e instanceof Ln && e.status === 401 && _(null), !1;
		} finally {
			a.value = !1;
		}
	}
	async function b(n) {
		let r = n.trim();
		if (!r || !e.isLoggedIn) return !1;
		try {
			return _(await t.renameMine(r)), !0;
		} catch (e) {
			return u.value = da(e), !1;
		}
	}
	async function x(n) {
		let r = n.slice(0, h.value);
		if (!e.isLoggedIn || !r.length) return 0;
		o.value = !0, s.value = 0, c.value = r.length, u.value = null;
		let i = 0, a = 0, l = !1;
		async function d() {
			for (; !l && a < r.length;) {
				let e = r[a++];
				try {
					await t.upload(e), i++, s.value = i;
				} catch (e) {
					u.value = da(e), l = !0;
				}
			}
		}
		try {
			let e = Array.from({ length: Math.min(4, r.length) }, () => d());
			return await Promise.all(e), i && await y(!0), i;
		} finally {
			o.value = !1;
		}
	}
	async function S(e) {
		if (!r.value) return !1;
		try {
			return _(await t.removeItem(e)), !0;
		} catch (e) {
			return u.value = da(e), !1;
		}
	}
	async function C() {
		if (!r.value) return !1;
		try {
			return await t.clearMine(), W(r.value.files.map((e) => e.id)), _(null), y(!0);
		} catch (e) {
			return u.value = da(e), !1;
		}
	}
	function w(e) {
		return p.value.get(e);
	}
	function T(e) {
		return Oe(e);
	}
	async function E(e) {
		return G(e);
	}
	return O(() => e.isLoggedIn, (e) => {
		e ? y(!0) : _(null);
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
		remainingSlots: h,
		loadDefault: v,
		loadMine: y,
		renameUserPack: b,
		uploadFiles: x,
		removeUserFile: S,
		clearUserPack: C,
		findFile: w,
		resolveUrl: T,
		ensureLoaded: E
	};
});
function pa(e) {
	let t = fa(), n = /* @__PURE__ */ new Set();
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
var ma = { class: "relative h-full overflow-x-hidden" }, ha = ["lang", "innerHTML"], ga = {
	key: 0,
	class: "loading-mask"
}, _a = { class: "loading-mask-box" }, va = /*#__PURE__*/ zn(/* @__PURE__ */ _({
	__name: "PreviewPanel",
	props: {
		backLight: { type: Boolean },
		isCoping: { type: Boolean },
		onContentClick: { type: Function }
	},
	setup(e, { expose: t }) {
		let n = e, { t: r } = ft(), i = H(), a = !0, o = Ze(), s = K(), { output: c } = A(o), { isDark: l, isMobile: u, viewMode: d, previewDevice: f } = A(s), p = z(() => u.value ? "w-full" : f.value === "mobile" ? "w-[375px]" : "w-full"), g = ee("previewRef");
		async function _() {
			if (!a || i && (!i.live || i.signal.aborted)) return;
			let e = V("output");
			if (!e) return;
			let [{ hljs: t }, { highlightPendingBlocks: n }, { hydratePendingInfographicDiagrams: r }] = await Promise.all([
				import("./chunks/renderer-2bSccpei.js").then((e) => e.t),
				import("./chunks/utils-D7O4F-LG.js").then((e) => e.t),
				import("./chunks/utils-D7O4F-LG.js").then((e) => e.r)
			]);
			a && (!i || i.live && !i.signal.aborted) && (n(t, e), r(e, { themeMode: i ? "light" : l.value ? "dark" : "light" }));
		}
		function v() {
			S(() => {
				_().catch((e) => {
					console.error("[PreviewPanel] Failed to hydrate diagrams", e);
				});
			});
		}
		O(c, () => {
			v();
		}), O(d, () => {
			d.value !== "edit" && v();
		});
		let y = null, b = null;
		return O(() => n.isCoping, (e) => {
			e ? y?.pause() : S(() => y?.resume());
		}), _e(() => {
			S(() => {
				let e = V("output");
				e && (y = sa(e), b = pa(e), _().catch((e) => {
					console.error("[PreviewPanel] Failed to hydrate diagrams", e);
				}));
			});
		}), m(() => {
			a = !1, y?.cleanup(), b?.();
		}), t({ previewRef: g }), (t, n) => {
			let a = Zi;
			return he((x(), h("div", ma, [j("div", {
				id: "preview",
				ref_key: "previewRef",
				ref: g,
				class: "preview-wrapper w-full p-5 flex justify-center"
			}, [j("div", {
				id: "output-wrapper",
				class: ge(["w-full max-w-full", { output_night: !B(i) && !e.backLight }])
			}, [j("div", { class: ge(["preview border-x shadow-xl mx-auto", [B(p), B(p) === "w-[375px]" ? "max-w-full" : ""]]) }, [j("section", {
				id: "output",
				class: "w-full",
				lang: B(pt),
				onClick: n[0] ||= (...t) => e.onContentClick && e.onContentClick(...t),
				innerHTML: B(c)
			}, null, 8, ha), e.isCoping ? (x(), h("div", ga, [j("div", _a, [n[1] ||= j("div", { class: "loading__img" }, null, -1), j("span", null, L(B(r)("common.generating")), 1)])])) : w("", !0)], 2)], 2), B(i) ? w("", !0) : (x(), R(a, {
				key: 0,
				target: "preview",
				right: B(u) ? 24 : 20,
				bottom: B(u) ? 90 : 20
			}, null, 8, ["right", "bottom"]))], 512)], 512)), [[ne, B(d) !== "edit"]]);
		};
	}
}), [["__scopeId", "data-v-8a01ffa9"]]), ya = {
	class: "native-toolbar",
	"aria-label": "公众号正文编辑工具"
}, ba = ["value"], xa = ["aria-pressed"], Sa = ["aria-pressed"], Ca = /* @__PURE__ */ _({
	__name: "native-toolbar",
	setup(e) {
		let n = vt(), r = K();
		function i(e, t = e) {
			let r = n.editor;
			if (!r) return;
			let i = r.state.selection.main;
			r.dispatch(r.state.replaceSelection(`${e}${r.state.doc.sliceString(i.from, i.to) || "文字"}${t}`)), r.focus();
		}
		function a(e) {
			n.editor && (e === "undo" ? p : t)(oe(n.editor));
		}
		return (e, t) => (x(), h("div", ya, [
			j("button", {
				type: "button",
				onClick: t[0] ||= (e) => a("undo")
			}, "撤销"),
			j("button", {
				type: "button",
				onClick: t[1] ||= (e) => a("redo")
			}, "重做"),
			j("button", {
				type: "button",
				onClick: t[2] ||= (e) => i("**")
			}, "加粗"),
			j("button", {
				type: "button",
				onClick: t[3] ||= (e) => i("*")
			}, "斜体"),
			j("button", {
				type: "button",
				onClick: t[4] ||= (e) => i("## ", "")
			}, "标题"),
			j("button", {
				type: "button",
				onClick: t[5] ||= (e) => i("- ", "")
			}, "列表"),
			j("button", {
				type: "button",
				onClick: t[6] ||= (e) => i("> ", "")
			}, "引用"),
			j("select", {
				"aria-label": "编辑预览布局",
				value: B(r).viewMode,
				onChange: t[7] ||= (e) => B(r).setViewMode(e.target.value)
			}, [...t[11] ||= [
				j("option", { value: "split" }, "编辑与预览", -1),
				j("option", { value: "edit" }, "只看正文", -1),
				j("option", { value: "preview" }, "只看预览", -1)
			]], 40, ba),
			j("button", {
				type: "button",
				onClick: t[8] ||= (e) => B(r).isShowUploadImgDialog = !0
			}, "插入图片"),
			j("button", {
				type: "button",
				"aria-pressed": B(r).isOpenRightSlider,
				onClick: t[9] ||= (e) => B(r).isOpenRightSlider = !B(r).isOpenRightSlider
			}, "排版设置", 8, xa),
			j("button", {
				type: "button",
				"aria-pressed": B(r).isShowCssEditor,
				onClick: t[10] ||= (e) => B(r).isShowCssEditor = !B(r).isShowCssEditor
			}, "自定义 CSS", 8, Sa)
		]));
	}
}), wa = ["disabled"], Ta = {
	key: 0,
	role: "status"
}, Ea = /* @__PURE__ */ _({
	__name: "native-media-dialog",
	props: { onImport: { type: Function } },
	setup(e) {
		let t = e, n = K(), r = H(), i = M(!1);
		async function a(e) {
			let a = e.target, o = Array.from(a.files ?? []);
			a.value = "", i.value = !0;
			try {
				for (let e of o) if (!r.live || r.signal.aborted || (await t.onImport(e), !r.live || r.signal.aborted)) return;
				n.isShowUploadImgDialog = !1;
			} catch (e) {
				r.onError(e instanceof Error ? e.message : "图片导入失败");
			} finally {
				r.live && !r.signal.aborted && (i.value = !1);
			}
		}
		return (e, t) => {
			let r = rn, o = tn, s = nn, c = en, l = $t;
			return x(), R(l, {
				open: B(n).isShowUploadImgDialog,
				"onUpdate:open": t[0] ||= (e) => B(n).isShowUploadImgDialog = e
			}, {
				default: N(() => [E(c, null, {
					default: N(() => [
						E(s, null, {
							default: N(() => [E(r, null, {
								default: N(() => [...t[1] ||= [I("插入图片", -1)]]),
								_: 1
							}), E(o, null, {
								default: N(() => [...t[2] ||= [I("选择图片后会先保存到当前作品素材，再插入正文。", -1)]]),
								_: 1
							})]),
							_: 1
						}),
						j("input", {
							type: "file",
							accept: "image/*",
							multiple: "",
							disabled: B(i),
							"aria-label": "选择图片文件",
							onChange: a
						}, null, 40, wa),
						B(i) ? (x(), h("span", Ta, "图片正在保存到作品素材…")) : w("", !0)
					]),
					_: 1
				})]),
				_: 1
			}, 8, ["open"]);
		};
	}
});
function Da(e) {
	let t = () => k(e), n = K();
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
				effects: u.scrollIntoView(i, { y: "center" })
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
		let o = An(r.state.doc.toString())[a];
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
					let t = V(n);
					if (t) {
						let n = r.closest(".preview-wrapper") || V("preview");
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
					effects: u.scrollIntoView(e, { y: "center" })
				}), n.openTableEditDialog();
				return;
			}
		}
		let d = r.closest("h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,td,th,img");
		d && s(d);
	}
	return { handlePreviewContentClick: l };
}
function Oa(e) {
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
function ka(e, t) {
	for (let n = e.length - 1; n >= 0; n--) if (e[n].startLine <= t) return n;
	return 0;
}
function Aa(e, t) {
	return e.length === 0 ? 1 : e[Math.min(t, e.length - 1)].startLine;
}
function ja(e, t, n) {
	return Math.round(t <= 1 || n <= 1 ? e / Math.max(t - 1, 1) * Math.max(n - 1, 1) : e / (t - 1) * (n - 1));
}
function Ma(e, t, n) {
	let r = /* @__PURE__ */ new Set();
	function i(e) {
		let t = requestAnimationFrame(() => {
			r.delete(t), e();
		});
		r.add(t);
	}
	m(() => {
		for (let e of r) cancelAnimationFrame(e);
		r.clear(), y();
	});
	let a = !1, o = !1, s = -1, c = -1, l = null, u = null;
	function d(e) {
		return l === e && u ? u : (l = e, u = Oa(e), u);
	}
	let f = 0, p = -1, h = [], g = [], _ = null;
	function v(e) {
		if (_) return;
		let t = e.querySelector("#output");
		t && (_ = new MutationObserver(() => {
			f++;
		}), _.observe(t, {
			childList: !0,
			subtree: !0
		}));
	}
	function y() {
		_?.disconnect(), _ = null;
	}
	function b(e) {
		if (_ || v(e), p === f) return {
			blocks: h,
			offsetTops: g
		};
		let t = e.querySelector("#output");
		if (!t) return p = f, h = [], g = [], {
			blocks: [],
			offsetTops: []
		};
		let n = t.firstElementChild;
		if (!n) return p = f, h = [], g = [], {
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
		return p = f, h = r, g = a, {
			blocks: r,
			offsetTops: a
		};
	}
	function x() {
		if (!n.value || o) return;
		let r = k(e), l = k(t);
		if (!r || !l) return;
		let u = r.scrollDOM, f = u.scrollHeight - u.clientHeight;
		if (f <= 0) return;
		if (c >= 0 && Math.abs(u.scrollTop - c) < 2) {
			c = -1;
			return;
		}
		if (c = -1, a = !0, u.scrollTop <= 0) {
			s = 0, l.scrollTop = 0, i(() => {
				a = !1;
			});
			return;
		}
		if (u.scrollTop >= f) {
			let e = l.scrollHeight - l.clientHeight;
			s = e, l.scrollTop = e, i(() => {
				a = !1;
			});
			return;
		}
		let p = d(r.state.doc);
		if (p.length === 0) {
			a = !1;
			return;
		}
		let m = r.lineBlockAtHeight(u.scrollTop), h = r.state.doc.lineAt(m.from).number, g = ka(p, h), { blocks: _, offsetTops: v } = b(l);
		if (_.length === 0) {
			a = !1;
			return;
		}
		let y = ja(g, p.length, _.length), x = Math.min(y, _.length - 1), S = l.scrollHeight - l.clientHeight, C = Math.min(v[x], S);
		s = C, l.scrollTop = C, i(() => {
			a = !1;
		});
	}
	function S() {
		if (!n.value || a) return;
		let r = k(e), l = k(t);
		if (!r || !l) return;
		if (s >= 0 && Math.abs(l.scrollTop - s) < 2) {
			s = -1;
			return;
		}
		s = -1;
		let u = l.scrollHeight - l.clientHeight;
		if (u <= 0) return;
		if (o = !0, l.scrollTop <= 0) {
			c = 0, r.scrollDOM.scrollTop = 0, i(() => {
				o = !1;
			});
			return;
		}
		if (l.scrollTop >= u) {
			let e = r.scrollDOM.scrollHeight - r.scrollDOM.clientHeight;
			c = e, r.scrollDOM.scrollTop = e, i(() => {
				o = !1;
			});
			return;
		}
		let { blocks: f, offsetTops: p } = b(l);
		if (f.length === 0) {
			o = !1;
			return;
		}
		let m = l.scrollTop, h = 0, g = p.length - 1;
		for (; h < g;) {
			let e = h + g + 1 >> 1;
			p[e] <= m ? h = e : g = e - 1;
		}
		let _ = h, v = d(r.state.doc);
		if (v.length === 0) {
			o = !1;
			return;
		}
		let y = Aa(v, ja(_, f.length, v.length)), x = r.state.doc.line(y), S = r.lineBlockAt(x.from);
		if (S) {
			let e = r.scrollDOM.scrollHeight - r.scrollDOM.clientHeight, t = Math.min(S.top, e);
			c = t, r.scrollDOM.scrollTop = t;
		}
		i(() => {
			o = !1;
		});
	}
	C((r) => {
		if (!n.value) return;
		let i = k(e), a = k(t);
		if (!i || !a) return;
		v(a);
		let o = i.scrollDOM;
		o.addEventListener("scroll", x, { passive: !0 }), a.addEventListener("scroll", S, { passive: !0 }), r(() => {
			o.removeEventListener("scroll", x), a.removeEventListener("scroll", S), y();
		});
	});
}
var Na = /* @__PURE__ */ _({
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
		return (e, n) => (x(), R(B(gt), y({ class: "toaster group" }, t), null, 16));
	}
}), Pa = { class: "native-editor-pane" }, Fa = { class: "native-preview-pane" }, Ia = {
	key: 0,
	class: "native-style-pane"
}, La = {
	key: 1,
	class: "native-css-pane"
}, Ra = /* @__PURE__ */ _({
	__name: "NativeApp",
	setup(e) {
		let t = v(() => import("./chunks/CssEditor-rDOOcLd1.js")), n = v(() => import("./chunks/RightSlider-BEywkWYm.js")), r = v(() => import("./chunks/TableEditDialog-0WQyHr22.js")), i = v(() => import("./chunks/FormulaEditorDialog-DUTywkQa.js")), a = v(() => import("./chunks/TemplateDialog-B64hzoVj.js")), o = v(() => import("./chunks/ConfirmDialog-C5N-abdb.js")), s = K(), c = M(null), l = M(null), { handlePreviewContentClick: u } = Da(() => c.value?.codeMirrorView ?? null);
		Ma(() => c.value?.codeMirrorView ?? null, () => l.value?.previewRef ?? null, z(() => s.enableScrollSync));
		let d = H();
		return (e, f) => (x(), h("div", { class: ge(["creatoros-doocs-native", { dark: B(s).isDark }]) }, [
			E(Ca),
			E(Ea, { "on-import": (e) => B(c)?.uploadImage(e) }, null, 8, ["on-import"]),
			j("div", { class: ge(["native-content", {
				"native-edit-only": B(s).viewMode === "edit",
				"native-preview-only": B(s).viewMode === "preview"
			}]) }, [
				j("div", Pa, [E(Xi, {
					ref_key: "editor",
					ref: c
				}, null, 512)]),
				j("div", Fa, [E(va, {
					ref_key: "preview",
					ref: l,
					"back-light": !1,
					"is-coping": !1,
					"on-content-click": B(u)
				}, null, 8, ["on-content-click"])]),
				B(s).isOpenRightSlider ? (x(), h("aside", Ia, [E(B(n))])) : w("", !0),
				B(s).isShowCssEditor ? (x(), h("aside", La, [E(B(t))])) : w("", !0)
			], 2),
			B(s).isShowTableEditDialog ? (x(), R(B(r), { key: 0 })) : w("", !0),
			B(s).isShowFormulaEditorDialog ? (x(), R(B(i), { key: 1 })) : w("", !0),
			B(s).isShowTemplateDialog ? (x(), R(B(a), { key: 2 })) : w("", !0),
			E(B(o)),
			(x(), R(re, { to: B(d).portal }, [E(B(Na), {
				"rich-colors": "",
				position: "top-center",
				duration: 1800,
				theme: B(s).isDark ? "dark" : "light"
			}, null, 8, ["theme"])], 8, ["to"]))
		], 2));
	}
}), za = "a7c17fc4cda92e3c13aa7e24f06615cfa4219b31", Ba = new Un();
async function Va(e, t) {
	if (t.signal.aborted) throw Error("挂载已取消");
	if (!(e.getRootNode() instanceof ShadowRoot) || e.getRootNode() !== t.portalContainer.getRootNode()) throw Error("公众号编辑器需要同一组件样式容器");
	Gn(t.owner);
	for (let e of [
		t.owner?.projectId,
		t.owner?.outputId,
		t.owner?.sourceVersionId
	]) if (typeof e != "string" || !e) throw Error("稿件归属不完整");
	let n = new AbortController(), r = new qn(), i = !1, s, c, l, d, f = !1, p = "", m = 0, h = {
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
			if (g(), !(e instanceof Blob) || !e.type.startsWith("image/") || e.size > 26214400) throw Error("图片文件无效或超过25 MiB");
			let n = await xe(h, t.importMedia(e));
			if (g(), !/^creatoros-asset:([^:\s]+):([^:\s]+)$/.test(n.mediaId)) throw Error("素材归属回执无效");
			return n;
		},
		onError: (e) => {
			i || t.onError(e);
		}
	};
	h.ready = new Promise((e, t) => {
		h.readyResolve = e, h.readyReject = t;
	}), h.ready.catch(() => {});
	function g(e) {
		if (i || n.signal.aborted || e?.aborted) throw Error("稿件已关闭或操作已取消");
	}
	function _() {
		if (d) return d;
		i = !0, h.live = !1, n.abort(), h.readyReject?.(/* @__PURE__ */ Error("稿件已关闭")), t.signal.removeEventListener("abort", v), l?.();
		for (let e of h.cleanups) try {
			e();
		} catch {}
		return h.cleanups.clear(), s?.unmount(), s = void 0, c && (vt(c).editor?.destroy(), vt(c).editor = null, Ye(c).cssEditor?.destroy(), Ye(c).cssEditor = null, fe(c)), d = (async () => {
			await Promise.allSettled([...h.jobs]), await r.settled(), await lt.whenIdle(), H() === h && (Fe(), ve(void 0));
			for (let e of h.imageUrls.values()) URL.revokeObjectURL(e);
			h.imageUrls.clear(), h.imageBlobs.clear(), e.replaceChildren(), t.portalContainer.replaceChildren();
			for (let n of [e, t.portalContainer]) n.removeAttribute("inert"), n.removeAttribute("aria-disabled");
			Ba.release(_);
		})(), d;
	}
	let v = () => {
		_();
	};
	t.signal.addEventListener("abort", v, { once: !0 });
	try {
		await Ba.acquire(_, t.signal), g(), ve(h), await ut(), g();
		let n = await mt("zh-CN");
		g(), ht(n), c = me(), ae(c), s = te(Ra), s.use(c), s.use(n), Yn([e, t.portalContainer], t.theme), s.mount(e);
		let d;
		try {
			await xe(h, Promise.race([h.ready, new Promise((e, t) => {
				d = setTimeout(() => t(/* @__PURE__ */ Error("公众号编辑器初始化超时")), 2e4);
			})])), g();
		} finally {
			clearTimeout(d);
		}
		let v = _t(c), y = vt(c), b = Ze(c), x = Ke(c), C = Ye(c);
		v.replacePosts([{
			id: t.owner.outputId,
			title: "",
			content: "",
			history: [],
			createDatetime: /* @__PURE__ */ new Date(),
			updateDatetime: /* @__PURE__ */ new Date()
		}]), v.currentPostId = t.owner.outputId, y.importContent("");
		let w = () => ({
			schemaVersion: 1,
			editor: "doocs-md",
			editorCommit: za,
			themeId: String(x.theme),
			themeSettings: JSON.parse(JSON.stringify(x.themeSettings[x.theme] ?? {})),
			customCss: C.getCurrentTabContent(),
			exportOptions: {
				useIndent: !!x.isUseIndent,
				useJustify: !!x.isUseJustify
			}
		}), T = () => ({
			markdown: y.getContent(),
			layout: w()
		});
		function E(e, n = []) {
			if (i || f) return;
			let r = T();
			p = JSON.stringify(r), m++, t.onChanged({
				...r,
				kind: "native-context",
				contextEpoch: m,
				outputId: t.owner.outputId,
				sceneId: null,
				selectedElements: n,
				documentChanged: e
			});
		}
		let D = y.editor;
		if (D) {
			let e = new a();
			D.dispatch({ effects: o.appendConfig.of(e.of(u.updateListener.of((e) => {
				(e.docChanged || e.selectionSet) && E(e.docChanged, e.state.selection.ranges.map((e) => ({
					from: e.from,
					to: e.to
				})));
			}))) }), h.cleanups.add(() => {
				y.editor === D && D.dispatch({ effects: e.reconfigure([]) });
			});
		}
		l = O(() => [
			b.output,
			x.theme,
			JSON.stringify(x.themeSettings),
			C.getCurrentTabContent(),
			x.isUseIndent,
			x.isUseJustify
		], () => {
			if (i || f) return;
			let e = T();
			JSON.stringify(e) !== p && E(!0);
		}, { flush: "sync" });
		function ee(e) {
			if (g(), !e || typeof e.assetId != "string" || typeof e.assetFileId != "string" || !/^[^:\s]+$/.test(e.assetId) || !/^[^:\s]+$/.test(e.assetFileId) || !(e.blob instanceof Blob) || !e.blob.type.startsWith("image/") || e.blob.size > 26214400) throw Error("精确图片素材无效或超过25 MiB");
			let t = `${e.assetId}:${e.assetFileId}`, n = h.imageUrls.get(t);
			h.imageBlobs.set(t, e.blob), h.imageUrls.set(t, URL.createObjectURL(e.blob)), n && URL.revokeObjectURL(n);
		}
		async function k(e, t, n) {
			if (g(n?.signal), ae(c), e === "load") {
				m++;
				let e = t?.document ?? t;
				if (typeof e?.markdown != "string") throw Error("公众号稿件输入无效");
				let r = e.layout;
				if (r && r.editor !== "doocs-md") throw Error("版式属于其它编辑器");
				f = !0;
				try {
					for (let e of t?.assets ?? []) ee(e);
					if (r) {
						if (r.themeId && (x.theme = r.themeId), r.themeId && r.themeSettings && (x.themeSettings = {
							...x.themeSettings,
							[r.themeId]: r.themeSettings
						}), typeof r.customCss == "string") {
							let e = C.getCurrentTab();
							e.content = r.customCss, C.setCssEditorValue(e.content);
						}
						r.exportOptions && (x.isUseIndent = !!r.exportOptions.useIndent, x.isUseJustify = !!r.exportOptions.useJustify);
					}
					return v.currentPost && (v.currentPost.title = e.title ?? ""), y.importContent(e.markdown), y.flushContentToPostStore(), await x.applyCurrentTheme(), g(n?.signal), b.render(e.markdown, { force: !0 }), await S(), g(n?.signal), p = JSON.stringify(T()), T();
				} finally {
					f = !1;
				}
			}
			if (e === "asset" || e === "insert-media") return ee(t), e === "insert-media" && y.insertAtCursor(`\n<img src="creatoros-asset:${t.assetId}:${t.assetFileId}" alt="图片">\n`), b.render(y.getContent(), { force: !0 }), await S(), g(n?.signal), { mediaId: `creatoros-asset:${t.assetId}:${t.assetFileId}` };
			if (e === "snapshot") return y.flushContentToPostStore(), T();
			if (e === "export-html") {
				let e = JSON.stringify(T());
				await x.applyCurrentTheme(), g(n?.signal), b.render(y.getContent(), {
					force: !0,
					themeMode: "light"
				}), await S(), g(n?.signal);
				let t = await Ee();
				if (g(n?.signal), JSON.stringify(T()) !== e) throw Error("稿件已改变，请重新导出");
				return {
					html: `<style>${Pe}</style>${t}<style>${et}</style><div id="output">${U({
						staticLayout: !0,
						themeMode: "light"
					})}</div>`,
					bindings: [...h.imageUrls].map(([e, t]) => ({
						key: e,
						url: t
					}))
				};
			}
			throw Error(`公众号编辑器不支持此操作：${e}`);
		}
		return {
			async request(e, t, n) {
				let i = m;
				return g(n?.signal), xe(h, r.run(async () => {
					g(n?.signal), Kn(i, m, n?.signal);
					let r = await k(e, t, n);
					if (g(n?.signal), (e === "snapshot" || e === "export-html") && i !== m) throw Error("稿件上下文已变化，原结果停止");
					return r;
				}));
			},
			update(n) {
				if (!i && (n.theme && (h.mode = n.theme.mode, Yn([e, t.portalContainer], n.theme), K(c).isDark = n.theme.mode === "dark"), n.disabled !== void 0)) for (let r of [e, t.portalContainer]) r.toggleAttribute("inert", n.disabled), r.setAttribute("aria-disabled", String(n.disabled));
			},
			dispose: _
		};
	} catch (e) {
		throw await _(), e;
	}
}
export { Va as mount, Wn as nativeOwnerKey };
