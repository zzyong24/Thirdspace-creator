import { B as e, D as t, F as n, G as r, H as i, I as a, P as o, St as s, T as c, Z as l, dt as u, et as d, gt as f, k as p, p as m, x as h, y as g, yt as _, z as v } from "./vendor_vue-OlfIOlFg.js";
import { n as y } from "./native-host-BoAU4GnD.js";
import { n as b } from "./translate-CUv9RhnO.js";
import { n as x } from "./lib-DIiEqr8B.js";
import { i as S, s as C, u as w } from "./vendor_vueuse-DbHwQsn4.js";
import { E as T, T as E, _ as D, a as O, c as k, d as ee, f as te, g as A, i as j, l as ne, m as M, n as re, p as ie, r as N, t as P, u as F, x as ae, y as I } from "./Teleport-YNIcOte_.js";
import { i as L } from "./Button-B4kIEl6s.js";
import { a as R, c as z, i as B, n as oe, o as se, r as V, s as ce, t as H } from "./PopperContent-RtMDF-yC.js";
var U = ["INPUT", "TEXTAREA"];
function W(e, t, n, r = {}) {
	if (!t || r.enableIgnoredElement && U.includes(t.nodeName)) return null;
	let { arrowKeyOptions: i = "both", attributeName: a = "[data-reka-collection-item]", itemsArray: o = [], loop: s = !0, dir: c = "ltr", preventScroll: l = !0, focus: u = !1 } = r, [d, f, p, m, h, g] = [
		e.key === "ArrowRight",
		e.key === "ArrowLeft",
		e.key === "ArrowUp",
		e.key === "ArrowDown",
		e.key === "Home",
		e.key === "End"
	], _ = p || m, v = d || f;
	if (!h && !g && (!_ && !v || i === "vertical" && v || i === "horizontal" && _)) return null;
	let y = n ? Array.from(n.querySelectorAll(a)) : o;
	if (!y.length) return null;
	l && e.preventDefault();
	let b = null;
	return v || _ ? b = G(y, t, {
		goForward: _ ? m : c === "ltr" ? d : f,
		loop: s
	}) : h ? b = y.at(0) || null : g && (b = y.at(-1) || null), u && b?.focus(), b;
}
function G(e, t, n, r = e.includes(t) ? e.length : e.length + 1) {
	if (--r === 0) return null;
	let i = e.indexOf(t), a;
	if (a = i === -1 ? n.goForward ? 0 : e.length - 1 : n.goForward ? i + 1 : i - 1, !n.loop && (a < 0 || a >= e.length)) return null;
	let o = e[(a + e.length) % e.length];
	return o ? o.hasAttribute("disabled") && o.getAttribute("disabled") !== "false" ? G(e, o, n, r) : o : null;
}
var K = "rovingFocusGroup.onEntryFocus", le = {
	bubbles: !1,
	cancelable: !0
};
function ue(e, t = !1) {
	let n = E();
	for (let r of e) if (r === n || (r.focus({ preventScroll: t }), E() !== n)) return;
}
var [de, fe] = /*#__PURE__*/ T("RovingFocusGroup"), pe = /* @__PURE__ */ t({
	__name: "RovingFocusGroup",
	props: {
		orientation: {
			type: String,
			required: !1,
			default: void 0
		},
		dir: {
			type: String,
			required: !1
		},
		loop: {
			type: Boolean,
			required: !1,
			default: !1
		},
		currentTabStopId: {
			type: [String, null],
			required: !1
		},
		defaultCurrentTabStopId: {
			type: String,
			required: !1
		},
		preventScrollOnEntryFocus: {
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
			required: !1
		}
	},
	emits: ["entryFocus", "update:currentTabStopId"],
	setup(e, { expose: t, emit: n }) {
		let a = e, o = n, { loop: s, orientation: l, dir: p } = f(a), m = z(p), g = C(a, "currentTabStopId", o, {
			defaultValue: a.defaultCurrentTabStopId,
			passive: a.currentTabStopId === void 0
		}), v = u(!1), y = u(!1), b = u(0), { getItems: x, CollectionSlot: S } = R({ isProvider: !0 });
		function w(e) {
			let t = !y.value;
			if (e.currentTarget && e.target === e.currentTarget && t && !v.value) {
				let t = new CustomEvent(K, le);
				if (e.currentTarget.dispatchEvent(t), o("entryFocus", t), !t.defaultPrevented) {
					let e = x().map((e) => e.ref).filter((e) => e.dataset.disabled !== "");
					ue([
						e.find((e) => e.getAttribute("data-active") === ""),
						e.find((e) => e.getAttribute("data-highlighted") === ""),
						e.find((e) => e.id === g.value),
						...e
					].filter(Boolean), a.preventScrollOnEntryFocus);
				}
			}
			y.value = !1;
		}
		function T() {
			setTimeout(() => {
				y.value = !1;
			}, 1);
		}
		return t({ getItems: x }), fe({
			loop: s,
			dir: m,
			orientation: l,
			currentTabStopId: g,
			onItemFocus: (e) => {
				g.value = e;
			},
			onItemShiftTab: () => {
				v.value = !0;
			},
			onFocusableItemAdd: () => {
				b.value++;
			},
			onFocusableItemRemove: () => {
				b.value--;
			}
		}), (e, t) => (i(), h(_(S), null, {
			default: d(() => [c(_(L), {
				tabindex: v.value || b.value === 0 ? -1 : 0,
				"data-orientation": _(l),
				as: e.as,
				"as-child": e.asChild,
				dir: _(m),
				style: { outline: "none" },
				onMousedown: t[0] ||= (e) => y.value = !0,
				onMouseup: T,
				onFocus: w,
				onBlur: t[1] ||= (e) => v.value = !1
			}, {
				default: d(() => [r(e.$slots, "default")]),
				_: 3
			}, 8, [
				"tabindex",
				"data-orientation",
				"as",
				"as-child",
				"dir"
			])]),
			_: 3
		}));
	}
}), me = /* @__PURE__ */ t({
	__name: "MenuAnchor",
	props: {
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
	setup(e) {
		let t = e;
		return (e, n) => (i(), h(_(V), s(p(t)), {
			default: d(() => [r(e.$slots, "default")]),
			_: 3
		}, 16));
	}
});
function he() {
	let e = u(!1);
	return v(() => {
		S("keydown", () => {
			e.value = !0;
		}, {
			capture: !0,
			passive: !0
		}), S(["pointerdown", "pointermove"], () => {
			e.value = !1;
		}, {
			capture: !0,
			passive: !0
		});
	}), e;
}
var ge = w(he), [q, J] = /*#__PURE__*/ T(["MenuRoot", "MenuSub"], "MenuContext"), [Y, _e] = /*#__PURE__*/ T("MenuRoot"), ve = /* @__PURE__ */ t({
	__name: "MenuRoot",
	props: {
		open: {
			type: Boolean,
			required: !1,
			default: !1
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
		let n = e, a = t, { modal: o, dir: s } = f(n), c = z(s), l = C(n, "open", a), p = u(), m = ge();
		return J({
			open: l,
			onOpenChange: (e) => {
				l.value = e;
			},
			content: p,
			onContentChange: (e) => {
				p.value = e;
			}
		}), _e({
			onClose: () => {
				l.value = !1;
			},
			isUsingKeyboardRef: m,
			dir: c,
			modal: o
		}), (e, t) => (i(), h(_(B), null, {
			default: d(() => [r(e.$slots, "default")]),
			_: 3
		}));
	}
}), [X, ye] = /*#__PURE__*/ T("MenuContent"), Z = /* @__PURE__ */ t({
	__name: "MenuContentImpl",
	props: /* @__PURE__ */ o({
		loop: {
			type: Boolean,
			required: !1
		},
		disableOutsidePointerEvents: {
			type: Boolean,
			required: !1
		},
		disableOutsideScroll: {
			type: Boolean,
			required: !1
		},
		trapFocus: {
			type: Boolean,
			required: !1
		},
		memoDependencies: {
			type: Array,
			required: !1
		},
		side: {
			type: null,
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
		align: {
			type: null,
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
	}, { ...H }),
	emits: [
		"escapeKeyDown",
		"pointerDownOutside",
		"focusOutside",
		"interactOutside",
		"entryFocus",
		"openAutoFocus",
		"closeAutoFocus",
		"dismiss"
	],
	setup(t, { emit: n }) {
		let a = t, o = n, s = q(), p = Y(), { trapFocus: m, disableOutsidePointerEvents: g, loop: v } = f(a);
		ce(), ae(g.value);
		let y = u(""), b = u(0), x = u(0), S = u(null), C = u("right"), w = u(0), T = u(null), D = u(), { forwardRef: O, currentElement: A } = I(), { handleTypeaheadSearch: M } = se(), N = u();
		function P(e) {
			let t = W(e, N.value || E(), A.value, {
				loop: v.value,
				arrowKeyOptions: "vertical",
				dir: p?.dir.value,
				focus: !1,
				attributeName: "[data-reka-collection-item]:not([data-disabled])"
			});
			t && (N.value = t, t.scrollIntoView({ block: "nearest" }));
		}
		function L() {
			N.value && N.value.click();
		}
		let R = u(), z = u();
		l(N, (e) => {
			if (z.value && (e === void 0 || e !== z.value.trigger.value)) {
				if (e === void 0) return;
				z.value.onOpenChange(!1), z.value = void 0;
			}
		}), l(A, (e) => {
			s.onContentChange(e);
		}), e(() => {
			window.clearTimeout(b.value);
		});
		function B(e) {
			return C.value === S.value?.side && ee(e, S.value?.area);
		}
		async function V(e) {
			o("openAutoFocus", e), !e.defaultPrevented && (e.preventDefault(), A.value?.focus({ preventScroll: !0 }));
		}
		function H(e) {
			if (e.defaultPrevented) return;
			let t = e.target, n = t.closest("[data-reka-menu-content]") === e.currentTarget, r = ["input", "textarea"].includes(t.tagName.toLowerCase()), i = e.ctrlKey || e.altKey || e.metaKey, a = e.key.length === 1, o = W(e, E(), A.value, {
				loop: v.value,
				arrowKeyOptions: "vertical",
				dir: p?.dir.value,
				focus: !0,
				attributeName: "[data-reka-collection-item]:not([data-disabled])"
			});
			if (o) return o?.focus();
			if (e.code === "Space") return;
			let s = D.value?.getItems() ?? [];
			if (n && (e.key === "Tab" && p.modal.value && e.preventDefault(), !i && a && !r && M(e.key, s)), e.target !== A.value || !re.includes(e.key)) return;
			e.preventDefault();
			let c = [...s.map((e) => e.ref)];
			j.includes(e.key) && c.reverse(), k(c);
		}
		function U(e) {
			e?.currentTarget?.contains?.(e.target) || (window.clearTimeout(b.value), y.value = "");
		}
		function G(e) {
			if (!F(e)) return;
			let t = e.target, n = w.value !== e.clientX;
			if ((e?.currentTarget)?.contains(t) && n) {
				let t = e.clientX > w.value ? "right" : "left";
				C.value = t, w.value = e.clientX;
			}
		}
		function K(e) {
			F(e) && R.value && R.value.focus();
		}
		return ye({
			onItemEnter: (e) => !!B(e),
			onItemLeave: (e) => B(e) ? !0 : (["INPUT", "TEXTAREA"].includes(E()?.tagName || "") || A.value?.focus(), T.value = null, !1),
			onTriggerLeave: (e) => !!B(e),
			searchRef: y,
			highlightedElement: N,
			onKeydownNavigation: P,
			onKeydownEnter: L,
			filterElement: R,
			onFilterElementChange: (e) => {
				R.value = e;
			},
			activeSubmenuContext: z,
			pointerGraceTimerRef: x,
			onPointerGraceIntentChange: (e) => {
				S.value = e;
			}
		}), (e, t) => (i(), h(_(te), {
			"as-child": "",
			trapped: _(m),
			onMountAutoFocus: V,
			onUnmountAutoFocus: t[7] ||= (e) => o("closeAutoFocus", e)
		}, {
			default: d(() => [c(_(ie), {
				"as-child": "",
				"disable-outside-pointer-events": _(g),
				onEscapeKeyDown: t[2] ||= (e) => o("escapeKeyDown", e),
				onPointerDownOutside: t[3] ||= (e) => o("pointerDownOutside", e),
				onFocusOutside: t[4] ||= (e) => o("focusOutside", e),
				onInteractOutside: t[5] ||= (e) => o("interactOutside", e),
				onDismiss: t[6] ||= (e) => o("dismiss")
			}, {
				default: d(() => [c(_(pe), {
					ref_key: "rovingFocusGroupRef",
					ref: D,
					"current-tab-stop-id": T.value,
					"onUpdate:currentTabStopId": t[0] ||= (e) => T.value = e,
					"as-child": "",
					orientation: "vertical",
					dir: _(p).dir.value,
					loop: _(v),
					onEntryFocus: t[1] ||= (e) => {
						o("entryFocus", e), _(p).isUsingKeyboardRef.value || e.preventDefault();
					}
				}, {
					default: d(() => [c(_(oe), {
						ref: _(O),
						role: "menu",
						as: e.as,
						"as-child": e.asChild,
						"aria-orientation": "vertical",
						"data-reka-menu-content": "",
						"data-state": _(ne)(_(s).open.value),
						dir: _(p).dir.value,
						side: e.side,
						"side-offset": e.sideOffset,
						align: e.align,
						"align-offset": e.alignOffset,
						"avoid-collisions": e.avoidCollisions,
						"collision-boundary": e.collisionBoundary,
						"collision-padding": e.collisionPadding,
						"arrow-padding": e.arrowPadding,
						"prioritize-position": e.prioritizePosition,
						"position-strategy": e.positionStrategy,
						"update-position-strategy": e.updatePositionStrategy,
						sticky: e.sticky,
						"hide-when-detached": e.hideWhenDetached,
						reference: e.reference,
						onKeydown: H,
						onBlur: U,
						onPointermove: G,
						onPointerenter: K
					}, {
						default: d(() => [r(e.$slots, "default")]),
						_: 3
					}, 8, [
						"as",
						"as-child",
						"data-state",
						"dir",
						"side",
						"side-offset",
						"align",
						"align-offset",
						"avoid-collisions",
						"collision-boundary",
						"collision-padding",
						"arrow-padding",
						"prioritize-position",
						"position-strategy",
						"update-position-strategy",
						"sticky",
						"hide-when-detached",
						"reference"
					])]),
					_: 3
				}, 8, [
					"current-tab-stop-id",
					"dir",
					"loop"
				])]),
				_: 3
			}, 8, ["disable-outside-pointer-events"])]),
			_: 3
		}, 8, ["trapped"]));
	}
}), Q = /* @__PURE__ */ t({
	inheritAttrs: !1,
	__name: "MenuItemImpl",
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
		let t = e, o = X(), { forwardRef: s, currentElement: l } = I(), { CollectionItem: f } = R(), p = u(!1), m = g(() => p.value || l.value != null && o.highlightedElement.value === l.value);
		async function v(e) {
			if (!e.defaultPrevented && F(e)) {
				if (t.disabled) o.onItemLeave(e);
				else if (!o.onItemEnter(e)) {
					let t = e.currentTarget;
					o.highlightedElement.value = t, ["INPUT", "TEXTAREA"].includes(E()?.tagName || "") || t.focus({ preventScroll: !0 });
				}
			}
		}
		async function y(e) {
			await a(), !e.defaultPrevented && F(e) && o.highlightedElement.value === l.value && !o.onItemLeave(e) && o.highlightedElement.value === l.value && (o.highlightedElement.value = void 0);
		}
		return (e, t) => (i(), h(_(f), { value: { textValue: e.textValue } }, {
			default: d(() => [c(_(L), n({
				ref: _(s),
				role: "menuitem",
				tabindex: "-1"
			}, e.$attrs, {
				as: e.as,
				"as-child": e.asChild,
				"aria-disabled": e.disabled || void 0,
				"data-disabled": e.disabled ? "" : void 0,
				"data-highlighted": m.value ? "" : void 0,
				onPointermove: v,
				onPointerleave: y,
				onFocus: t[0] ||= async (t) => {
					let n = t.currentTarget;
					await a(), !(t.defaultPrevented || e.disabled) && (p.value = !0, _(o).highlightedElement.value = n);
				},
				onBlur: t[1] ||= async (e) => {
					await a(), !e.defaultPrevented && (p.value = !1);
				}
			}), {
				default: d(() => [r(e.$slots, "default")]),
				_: 3
			}, 16, [
				"as",
				"as-child",
				"aria-disabled",
				"data-disabled",
				"data-highlighted"
			])]),
			_: 3
		}, 8, ["value"]));
	}
}), be = /* @__PURE__ */ t({
	__name: "MenuItem",
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
		let o = e, s = t, { forwardRef: c, currentElement: l } = I(), f = Y(), p = X(), m = u(!1);
		async function g() {
			let e = l.value;
			if (!o.disabled && e) {
				let e = new CustomEvent(N, {
					bubbles: !0,
					cancelable: !0
				});
				s("select", e), await a(), e.defaultPrevented ? m.value = !1 : f.onClose();
			}
		}
		return (e, t) => (i(), h(Q, n(o, {
			ref: _(c),
			onClick: g,
			onPointerdown: t[0] ||= () => {
				m.value = !0;
			},
			onPointerup: t[1] ||= async (e) => {
				await a(), !e.defaultPrevented && (m.value || e.currentTarget?.click());
			},
			onKeydown: t[2] ||= async (t) => {
				let n = _(p).searchRef.value !== "";
				e.disabled || n && t.key === " " || _(O).includes(t.key) && (t.currentTarget?.click(), t.preventDefault());
			}
		}), {
			default: d(() => [r(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), $ = /* @__PURE__ */ t({
	__name: "MenuRootContentModal",
	props: {
		loop: {
			type: Boolean,
			required: !1
		},
		memoDependencies: {
			type: Array,
			required: !1
		},
		side: {
			type: null,
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
		align: {
			type: null,
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
		let a = e, o = t, s = D(a, o), c = q(), { forwardRef: l, currentElement: u } = I();
		return A(u), (e, t) => (i(), h(Z, n(_(s), {
			ref: _(l),
			"trap-focus": _(c).open.value,
			"disable-outside-pointer-events": _(c).open.value,
			"disable-outside-scroll": !0,
			onDismiss: t[0] ||= (e) => _(c).onOpenChange(!1),
			onFocusOutside: t[1] ||= m((e) => o("focusOutside", e), ["prevent"])
		}), {
			default: d(() => [r(e.$slots, "default")]),
			_: 3
		}, 16, ["trap-focus", "disable-outside-pointer-events"]));
	}
}), xe = /* @__PURE__ */ t({
	__name: "MenuRootContentNonModal",
	props: {
		loop: {
			type: Boolean,
			required: !1
		},
		memoDependencies: {
			type: Array,
			required: !1
		},
		side: {
			type: null,
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
		align: {
			type: null,
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
		let a = D(e, t), o = q();
		return (e, t) => (i(), h(Z, n(_(a), {
			"trap-focus": !1,
			"disable-outside-pointer-events": !1,
			"disable-outside-scroll": !1,
			onDismiss: t[0] ||= (e) => _(o).onOpenChange(!1)
		}), {
			default: d(() => [r(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), Se = /* @__PURE__ */ t({
	__name: "MenuContent",
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
		side: {
			type: null,
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
		align: {
			type: null,
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
		let a = D(e, t), o = q(), c = Y();
		return (e, t) => (i(), h(_(M), { present: e.forceMount || _(o).open.value }, {
			default: d(() => [_(c).modal.value ? (i(), h($, s(n({ key: 0 }, {
				...e.$attrs,
				..._(a)
			})), {
				default: d(() => [r(e.$slots, "default")]),
				_: 3
			}, 16)) : (i(), h(xe, s(n({ key: 1 }, {
				...e.$attrs,
				..._(a)
			})), {
				default: d(() => [r(e.$slots, "default")]),
				_: 3
			}, 16))]),
			_: 3
		}, 8, ["present"]));
	}
}), Ce = /* @__PURE__ */ t({
	__name: "MenuPortal",
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
		return (e, n) => (i(), h(_(P), s(p(t)), {
			default: d(() => [r(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), we = /* @__PURE__ */ t({
	__name: "MenuSeparator",
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
		return (e, a) => (i(), h(_(L), n(t, {
			role: "separator",
			"aria-orientation": "horizontal"
		}), {
			default: d(() => [r(e.$slots, "default")]),
			_: 3
		}, 16));
	}
});
function Te(e) {
	return new Promise((t, n) => {
		try {
			let r = document.createElement("textarea");
			r.value = e, r.setAttribute("readonly", "true"), r.style.position = "fixed", r.style.opacity = "0", y(r), r.select();
			let i = document.execCommand("copy");
			r.remove(), i ? t() : n(/* @__PURE__ */ Error("execCommand failed"));
		} catch (e) {
			n(e);
		}
	});
}
async function Ee(e) {
	if (window.isSecureContext && navigator.clipboard?.writeText) try {
		await navigator.clipboard.writeText(e);
		return;
	} catch {}
	await Te(e);
}
async function De() {
	try {
		return await navigator.clipboard.readText();
	} catch (e) {
		let t = e instanceof Error ? e.message : String(e);
		return x.error(b("toast.pasteFailed", { message: t })), null;
	}
}
export { Se as a, Z as c, q as d, Y as f, Ce as i, X as l, me as m, De as n, be as o, J as p, we as r, Q as s, Ee as t, ve as u };
