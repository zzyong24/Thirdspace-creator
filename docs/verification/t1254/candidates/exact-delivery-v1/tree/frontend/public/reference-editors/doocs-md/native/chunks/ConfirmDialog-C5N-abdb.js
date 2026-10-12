import { C as e, D as t, F as n, G as r, H as i, I as a, S as o, St as s, T as c, dt as l, et as u, k as d, p as f, w as p, wt as m, x as h, xt as g, y as _, yt as v, z as y } from "./vendor_vue-OlfIOlFg.js";
import { E as b, _ as x, b as S, t as C, y as w } from "./Teleport-YNIcOte_.js";
import { n as T, r as E } from "./Button-B4kIEl6s.js";
import { a as D, c as O, i as k, n as A, o as j, r as M, s as N, t as P } from "./dialog-focus-DTw3vPHC.js";
import { t as F } from "./confirm-BRFdpM55.js";
var I = /* @__PURE__ */ t({
	__name: "AlertDialogAction",
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
		let t = e;
		return w(), (e, n) => (i(), h(v(N), s(d(t)), {
			default: u(() => [r(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), [L, R] = /*#__PURE__*/ b("AlertDialogContent"), z = /* @__PURE__ */ t({
	__name: "AlertDialogContent",
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
	setup(e, { emit: t }) {
		let o = e, s = S(t);
		w();
		let c = l();
		return R({ onCancelElementChange: (e) => {
			c.value = e;
		} }), (e, t) => (i(), h(v(j), n({
			...o,
			...v(s)
		}, {
			role: "alertdialog",
			onPointerDownOutside: t[0] ||= f(() => {}, ["prevent"]),
			onInteractOutside: t[1] ||= f(() => {}, ["prevent"]),
			onOpenAutoFocus: t[2] ||= () => {
				a(() => {
					c.value?.focus({ preventScroll: !0 });
				});
			}
		}), {
			default: u(() => [r(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), B = /* @__PURE__ */ t({
	__name: "AlertDialogCancel",
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
		let t = e, a = L(), { forwardRef: o, currentElement: s } = w();
		return y(() => {
			a.onCancelElementChange(s.value);
		}), (e, a) => (i(), h(v(N), n(t, { ref: v(o) }), {
			default: u(() => [r(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), V = /* @__PURE__ */ t({
	__name: "AlertDialogDescription",
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
		let t = e;
		return w(), (e, n) => (i(), h(v(D), s(d(t)), {
			default: u(() => [r(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), H = /* @__PURE__ */ t({
	__name: "AlertDialogOverlay",
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
		let t = e;
		return w(), (e, n) => (i(), h(v(k), s(d(t)), {
			default: u(() => [r(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), U = /* @__PURE__ */ t({
	__name: "AlertDialogPortal",
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
		return (e, n) => (i(), h(v(C), s(d(t)), {
			default: u(() => [r(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), W = /* @__PURE__ */ t({
	__name: "AlertDialogRoot",
	props: {
		open: {
			type: Boolean,
			required: !1
		},
		defaultOpen: {
			type: Boolean,
			required: !1
		},
		unmountOnHide: {
			type: Boolean,
			required: !1
		}
	},
	emits: ["update:open"],
	setup(e, { emit: t }) {
		let a = x(e, t);
		return w(), (e, t) => (i(), h(v(O), n(v(a), { modal: !0 }), {
			default: u((t) => [r(e.$slots, "default", s(d(t)))]),
			_: 3
		}, 16));
	}
}), G = /* @__PURE__ */ t({
	__name: "AlertDialogTitle",
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
		let t = e;
		return w(), (e, n) => (i(), h(v(M), s(d(t)), {
			default: u(() => [r(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), K = /* @__PURE__ */ t({
	__name: "AlertDialog",
	props: {
		open: { type: Boolean },
		defaultOpen: { type: Boolean },
		unmountOnHide: { type: Boolean }
	},
	emits: ["update:open"],
	setup(e, { emit: t }) {
		let n = e, a = x(n, t);
		return A(() => n.open), (e, t) => (i(), h(v(W), s(d(v(a))), {
			default: u(() => [r(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), q = /* @__PURE__ */ t({
	__name: "AlertDialogAction",
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
		let t = e, a = _(() => {
			let { class: e, ...n } = t;
			return n;
		});
		return (e, o) => (i(), h(v(I), n(v(a), { class: v(E)(v(T)(), t.class) }), {
			default: u(() => [r(e.$slots, "default")]),
			_: 3
		}, 16, ["class"]));
	}
}), J = /* @__PURE__ */ t({
	__name: "AlertDialogCancel",
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
		let t = e, a = _(() => {
			let { class: e, ...n } = t;
			return n;
		});
		return (e, o) => (i(), h(v(B), n(v(a), { class: v(E)(v(T)({ variant: "outline" }), "mt-2 sm:mt-0", t.class) }), {
			default: u(() => [r(e.$slots, "default")]),
			_: 3
		}, 16, ["class"]));
	}
}), Y = /* @__PURE__ */ t({
	__name: "AlertDialogContent",
	props: {
		forceMount: { type: Boolean },
		disableOutsidePointerEvents: { type: Boolean },
		asChild: { type: Boolean },
		as: {},
		class: { type: [
			Boolean,
			null,
			String,
			Object,
			Array
		] },
		overlayClass: { type: [
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
		"openAutoFocus",
		"closeAutoFocus"
	],
	setup(e, { emit: t }) {
		let a = e, o = t, s = _(() => {
			let { class: e, overlayClass: t, ...n } = a;
			return n;
		}), l = x(s, o), d = P(l);
		return (e, t) => (i(), h(v(U), null, {
			default: u(() => [c(v(H), { class: g(v(E)("data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/80", a.overlayClass)) }, null, 8, ["class"]), c(v(z), n(v(d), { class: v(E)("fixed left-1/2 top-1/2 z-200 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 sm:rounded-lg", a.class) }), {
				default: u(() => [r(e.$slots, "default")]),
				_: 3
			}, 16, ["class"])]),
			_: 3
		}));
	}
}), X = /* @__PURE__ */ t({
	__name: "AlertDialogDescription",
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
		let t = e, a = _(() => {
			let { class: e, ...n } = t;
			return n;
		});
		return (e, o) => (i(), h(v(V), n(v(a), { class: v(E)("text-sm text-muted-foreground", t.class) }), {
			default: u(() => [r(e.$slots, "default")]),
			_: 3
		}, 16, ["class"]));
	}
}), Z = /* @__PURE__ */ t({
	__name: "AlertDialogFooter",
	props: { class: { type: [
		Boolean,
		null,
		String,
		Object,
		Array
	] } },
	setup(t) {
		let n = t;
		return (t, a) => (i(), e("div", { class: g(v(E)("flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-x-2", n.class)) }, [r(t.$slots, "default")], 2));
	}
}), Q = /* @__PURE__ */ t({
	__name: "AlertDialogHeader",
	props: { class: { type: [
		Boolean,
		null,
		String,
		Object,
		Array
	] } },
	setup(t) {
		let n = t;
		return (t, a) => (i(), e("div", { class: g(v(E)("flex flex-col gap-y-2 text-center sm:text-left", n.class)) }, [r(t.$slots, "default")], 2));
	}
}), $ = /* @__PURE__ */ t({
	__name: "AlertDialogTitle",
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
		let t = e, a = _(() => {
			let { class: e, ...n } = t;
			return n;
		});
		return (e, o) => (i(), h(v(G), n(v(a), { class: v(E)("text-lg font-semibold", t.class) }), {
			default: u(() => [r(e.$slots, "default")]),
			_: 3
		}, 16, ["class"]));
	}
}), ee = /* @__PURE__ */ t({
	__name: "ConfirmDialog",
	setup(e) {
		let t = F();
		return (e, n) => (i(), h(v(K), {
			open: v(t).isOpen,
			"onUpdate:open": n[2] ||= (e) => v(t).isOpen = e
		}, {
			default: u(() => [c(v(Y), {
				"overlay-class": "z-[999]",
				class: "z-[1000]"
			}, {
				default: u(() => [c(v(Q), null, {
					default: u(() => [c(v($), { class: "text-lg font-semibold" }, {
						default: u(() => [p(m(v(t).title), 1)]),
						_: 1
					}), v(t).description ? (i(), h(v(X), { key: 0 }, {
						default: u(() => [p(m(v(t).description), 1)]),
						_: 1
					})) : o("", !0)]),
					_: 1
				}), c(v(Z), null, {
					default: u(() => [c(v(J), {
						class: g(v(E)(v(T)({ variant: "outline" }), "mt-2 sm:mt-0")),
						onClick: n[0] ||= (e) => v(t).handleCancel()
					}, {
						default: u(() => [p(m(v(t).cancelText), 1)]),
						_: 1
					}, 8, ["class"]), c(v(q), {
						class: g(v(E)(v(T)(), v(t).destructive && "bg-destructive text-destructive-foreground hover:bg-destructive/90")),
						onClick: n[1] ||= (e) => v(t).handleConfirm()
					}, {
						default: u(() => [p(m(v(t).confirmText), 1)]),
						_: 1
					}, 8, ["class"])]),
					_: 1
				})]),
				_: 1
			})]),
			_: 1
		}, 8, ["open"]));
	}
});
export { ee as default };
