import { D as e, F as t, G as n, H as r, S as i, T as a, Z as o, _t as s, d as c, dt as l, et as u, gt as d, p as f, tt as p, x as m, y as h, yt as g, z as _ } from "./vendor_vue-OlfIOlFg.js";
import { l as v } from "./native-host-BoAU4GnD.js";
import { s as y } from "./vendor_vueuse-DbHwQsn4.js";
import { E as b, T as x, b as S, f as C, g as w, h as T, l as E, m as D, p as O, x as k, y as A } from "./Teleport-YNIcOte_.js";
import { i as j } from "./Button-B4kIEl6s.js";
var [M, N] = /*#__PURE__*/ b("DialogRoot"), P = /* @__PURE__ */ e({
	inheritAttrs: !1,
	__name: "DialogRoot",
	props: {
		open: {
			type: Boolean,
			required: !1,
			default: void 0
		},
		defaultOpen: {
			type: Boolean,
			required: !1,
			default: !1
		},
		modal: {
			type: Boolean,
			required: !1,
			default: !0
		},
		unmountOnHide: {
			type: Boolean,
			required: !1,
			default: !0
		}
	},
	emits: ["update:open"],
	setup(e, { emit: t }) {
		let r = e, i = y(r, "open", t, {
			defaultValue: r.defaultOpen,
			passive: r.open === void 0
		}), a = l(), o = l(), { modal: s, unmountOnHide: c } = d(r);
		return N({
			open: i,
			modal: s,
			unmountOnHide: c,
			openModal: () => {
				i.value = !0;
			},
			onOpenChange: (e) => {
				i.value = e;
			},
			onOpenToggle: () => {
				i.value = !i.value;
			},
			contentId: "",
			titleId: "",
			descriptionId: "",
			triggerElement: a,
			contentElement: o
		}), (e, t) => n(e.$slots, "default", {
			open: g(i),
			close: () => i.value = !1
		});
	}
}), F = /* @__PURE__ */ e({
	__name: "DialogClose",
	props: {
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1,
			default: "button"
		}
	},
	setup(e) {
		let i = e;
		A();
		let a = M();
		return (e, o) => (r(), m(g(j), t(i, {
			type: e.as === "button" ? "button" : void 0,
			onClick: o[0] ||= (e) => g(a).onOpenChange(!1)
		}), {
			default: u(() => [n(e.$slots, "default")]),
			_: 3
		}, 16, ["type"]));
	}
}), I = /* @__PURE__ */ e({
	__name: "DialogContentImpl",
	props: {
		forceMount: {
			type: Boolean,
			required: !1
		},
		trapFocus: {
			type: Boolean,
			required: !1
		},
		disableOutsidePointerEvents: {
			type: Boolean,
			required: !1
		},
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1
		},
		present: {
			type: Boolean,
			required: !1
		}
	},
	emits: [
		"escapeKeyDown",
		"pointerDownOutside",
		"focusOutside",
		"interactOutside",
		"openAutoFocus",
		"closeAutoFocus"
	],
	setup(e, { emit: i }) {
		let o = e, s = i, c = M(), { forwardRef: l, currentElement: d } = A();
		return c.titleId ||= T(void 0, "reka-dialog-title"), c.descriptionId ||= T(void 0, "reka-dialog-description"), _(() => {
			c.contentElement = d, x() !== document.body && (c.triggerElement.value = x());
		}), (e, i) => (r(), m(g(C), {
			"as-child": "",
			loop: "",
			trapped: o.trapFocus,
			present: o.present,
			onMountAutoFocus: i[5] ||= (e) => s("openAutoFocus", e),
			onUnmountAutoFocus: i[6] ||= (e) => s("closeAutoFocus", e)
		}, {
			default: u(() => [a(g(O), t({
				id: g(c).contentId,
				ref: g(l),
				as: e.as,
				"as-child": e.asChild,
				present: o.present,
				"disable-outside-pointer-events": e.disableOutsidePointerEvents,
				role: "dialog",
				"aria-describedby": g(c).descriptionId,
				"aria-labelledby": g(c).titleId,
				"data-state": g(E)(g(c).open.value)
			}, e.$attrs, {
				onDismiss: i[0] ||= (e) => g(c).onOpenChange(!1),
				onEscapeKeyDown: i[1] ||= (e) => s("escapeKeyDown", e),
				onFocusOutside: i[2] ||= (e) => s("focusOutside", e),
				onInteractOutside: i[3] ||= (e) => s("interactOutside", e),
				onPointerDownOutside: i[4] ||= (e) => s("pointerDownOutside", e)
			}), {
				default: u(() => [n(e.$slots, "default")]),
				_: 3
			}, 16, [
				"id",
				"as",
				"as-child",
				"present",
				"disable-outside-pointer-events",
				"aria-describedby",
				"aria-labelledby",
				"data-state"
			])]),
			_: 3
		}, 8, ["trapped", "present"]));
	}
}), L = /* @__PURE__ */ e({
	__name: "DialogContentModal",
	props: {
		forceMount: {
			type: Boolean,
			required: !1
		},
		trapFocus: {
			type: Boolean,
			required: !1
		},
		disableOutsidePointerEvents: {
			type: Boolean,
			required: !1,
			default: !0
		},
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1
		},
		present: {
			type: Boolean,
			required: !0
		}
	},
	emits: [
		"escapeKeyDown",
		"pointerDownOutside",
		"focusOutside",
		"interactOutside",
		"openAutoFocus",
		"closeAutoFocus"
	],
	setup(e, { emit: i }) {
		let a = e, s = i, c = M(), l = S(s), { forwardRef: d, currentElement: f } = A(), p = h(() => a.present ? f.value : void 0);
		w(p);
		let _ = h(() => {
			let { present: e, ...t } = a;
			return t;
		});
		return o(() => a.present, (e, t) => {
			!e && t && c.triggerElement.value?.focus();
		}), (e, i) => (r(), m(I, t({
			..._.value,
			...g(l)
		}, {
			ref: g(d),
			present: e.present,
			"trap-focus": g(c).open.value,
			"disable-outside-pointer-events": a.disableOutsidePointerEvents,
			onCloseAutoFocus: i[0] ||= (e) => {
				e.defaultPrevented || (e.preventDefault(), g(c).triggerElement.value?.focus());
			},
			onPointerDownOutside: i[1] ||= (e) => {
				let t = e.detail.originalEvent, n = t.button === 0 && t.ctrlKey === !0;
				(t.button === 2 || n) && e.preventDefault();
			},
			onFocusOutside: i[2] ||= (e) => {
				e.preventDefault();
			}
		}), {
			default: u(() => [n(e.$slots, "default")]),
			_: 3
		}, 16, [
			"present",
			"trap-focus",
			"disable-outside-pointer-events"
		]));
	}
}), R = /* @__PURE__ */ e({
	__name: "DialogContentNonModal",
	props: {
		forceMount: {
			type: Boolean,
			required: !1
		},
		trapFocus: {
			type: Boolean,
			required: !1
		},
		disableOutsidePointerEvents: {
			type: Boolean,
			required: !1
		},
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1
		},
		present: {
			type: Boolean,
			required: !0
		}
	},
	emits: [
		"escapeKeyDown",
		"pointerDownOutside",
		"focusOutside",
		"interactOutside",
		"openAutoFocus",
		"closeAutoFocus"
	],
	setup(e, { emit: i }) {
		let a = e, s = S(i);
		A();
		let c = M(), d = l(!1), f = l(!1), p = h(() => {
			let { present: e, ...t } = a;
			return t;
		});
		return o(() => a.present, (e, t) => {
			!e && t && (d.value || c.triggerElement.value?.focus(), d.value = !1, f.value = !1);
		}), (e, i) => (r(), m(I, t({
			...p.value,
			...g(s)
		}, {
			present: e.present,
			"trap-focus": !1,
			"disable-outside-pointer-events": !1,
			onCloseAutoFocus: i[0] ||= (e) => {
				e.defaultPrevented || (d.value || g(c).triggerElement.value?.focus(), e.preventDefault()), d.value = !1, f.value = !1;
			},
			onInteractOutside: i[1] ||= (e) => {
				e.defaultPrevented || (d.value = !0, e.detail.originalEvent.type === "pointerdown" && (f.value = !0));
				let t = e.target;
				g(c).triggerElement.value?.contains(t) && e.preventDefault(), e.detail.originalEvent.type === "focusin" && f.value && e.preventDefault();
			}
		}), {
			default: u(() => [n(e.$slots, "default")]),
			_: 3
		}, 16, ["present"]));
	}
}), z = /* @__PURE__ */ e({
	__name: "DialogContent",
	props: {
		forceMount: {
			type: Boolean,
			required: !1
		},
		disableOutsidePointerEvents: {
			type: Boolean,
			required: !1,
			default: void 0
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
		"openAutoFocus",
		"closeAutoFocus"
	],
	setup(e, { emit: i }) {
		let a = e, o = i, s = M(), l = S(o), { forwardRef: d } = A(), f = h(() => a.forceMount || !s.unmountOnHide.value);
		return (e, i) => (r(), m(g(D), {
			present: g(s).open.value,
			"force-mount": f.value
		}, {
			default: u(({ present: i }) => [g(s).modal.value ? p((r(), m(L, t({
				key: 0,
				ref: g(d),
				present: !f.value || i
			}, {
				...a,
				...g(l),
				...e.$attrs
			}), {
				default: u(() => [n(e.$slots, "default")]),
				_: 2
			}, 1040, ["present"])), [[c, e.forceMount || g(s).unmountOnHide.value || i]]) : p((r(), m(R, t({
				key: 1,
				ref: g(d),
				present: !f.value || i
			}, {
				...a,
				...g(l),
				...e.$attrs
			}), {
				default: u(() => [n(e.$slots, "default")]),
				_: 2
			}, 1040, ["present"])), [[c, e.forceMount || g(s).unmountOnHide.value || i]])]),
			_: 3
		}, 8, ["present", "force-mount"]));
	}
}), B = /* @__PURE__ */ e({
	__name: "DialogDescription",
	props: {
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1,
			default: "p"
		}
	},
	setup(e) {
		let i = e;
		A();
		let a = M();
		return (e, o) => (r(), m(g(j), t(i, { id: g(a).descriptionId }), {
			default: u(() => [n(e.$slots, "default")]),
			_: 3
		}, 16, ["id"]));
	}
}), V = /* @__PURE__ */ e({
	__name: "DialogOverlayImpl",
	props: {
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1
		},
		present: {
			type: Boolean,
			required: !1,
			default: !0
		}
	},
	setup(e) {
		let t = e, i = M(), a = k(t.present);
		return o(() => t.present, (e) => a.value = e), A(), (e, t) => (r(), m(g(j), {
			as: e.as,
			"as-child": e.asChild,
			"data-state": g(i).open.value ? "open" : "closed",
			style: { "pointer-events": "auto" },
			onPointerdown: t[0] ||= f(() => {}, [
				"left",
				"self",
				"prevent"
			])
		}, {
			default: u(() => [n(e.$slots, "default")]),
			_: 3
		}, 8, [
			"as",
			"as-child",
			"data-state"
		]));
	}
}), H = /* @__PURE__ */ e({
	__name: "DialogOverlay",
	props: {
		forceMount: {
			type: Boolean,
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
		let o = e, s = M(), { forwardRef: l } = A(), d = h(() => o.forceMount || !s.unmountOnHide.value);
		return (e, o) => g(s)?.modal.value ? (r(), m(g(D), {
			key: 0,
			present: g(s).open.value,
			"force-mount": d.value
		}, {
			default: u(({ present: r }) => [p(a(V, t(e.$attrs, {
				ref: g(l),
				as: e.as,
				"as-child": e.asChild,
				present: !d.value || r
			}), {
				default: u(() => [n(e.$slots, "default")]),
				_: 2
			}, 1040, [
				"as",
				"as-child",
				"present"
			]), [[c, e.forceMount || g(s).unmountOnHide.value || r]])]),
			_: 3
		}, 8, ["present", "force-mount"])) : i("v-if", !0);
	}
}), U = /* @__PURE__ */ e({
	__name: "DialogTitle",
	props: {
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1,
			default: "h2"
		}
	},
	setup(e) {
		let i = e, a = M();
		return A(), (e, o) => (r(), m(g(j), t(i, { id: g(a).titleId }), {
			default: u(() => [n(e.$slots, "default")]),
			_: 3
		}, 16, ["id"]));
	}
});
function W(e) {
	return e instanceof HTMLElement && e !== document.body;
}
function G(e) {
	return !e.closest("[role=\"dialog\"]");
}
function K() {
	let e = document.activeElement;
	W(e) && G(e) && e.blur();
}
function q(e) {
	e(), queueMicrotask(e), requestAnimationFrame(e);
}
function J(e = !0) {
	let t = () => K();
	e ? q(t) : t();
}
function Y(e) {
	q(() => {
		let t = document.activeElement;
		W(t) && !e.contains(t) && t.blur();
		for (let t of v(".cm-content")) !e.contains(t) && t === document.activeElement && t.blur();
	});
}
function X(e) {
	let t = e.currentTarget;
	t instanceof HTMLElement && Y(t);
}
function Z(e) {
	let t = document.activeElement;
	if (!W(t)) return;
	let n = e.currentTarget;
	n instanceof HTMLElement && n.contains(t) && t.blur();
}
var Q = {
	onOpenAutoFocus: X,
	onCloseAutoFocus: Z
};
function $(e) {
	return h(() => t(Q, s(e)));
}
function ee(e) {
	o(() => s(e), (e) => {
		e && J();
	}, {
		immediate: !0,
		flush: "post"
	});
}
export { B as a, P as c, H as i, ee as n, z as o, U as r, F as s, $ as t };
