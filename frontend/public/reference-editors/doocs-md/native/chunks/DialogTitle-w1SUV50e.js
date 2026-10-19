import { C as e, D as t, F as n, G as r, H as i, St as a, T as o, b as s, et as c, k as l, wt as u, x as d, xt as f, y as p, yt as m } from "./vendor_vue-OlfIOlFg.js";
import { i as h, s as g } from "./native-host-BoAU4GnD.js";
import { n as _ } from "./vue-i18n-8AnKzzG6.js";
import { _ as v, t as y, v as b } from "./Teleport-YNIcOte_.js";
import { r as x } from "./Button-B4kIEl6s.js";
import { a as S, c as C, i as w, n as T, o as E, r as D, s as O, t as k } from "./dialog-focus-DTw3vPHC.js";
import { t as A } from "./x-E9vLZ87c.js";
var j = /* @__PURE__ */ t({
	__name: "DialogPortal",
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
		return (e, n) => (i(), d(m(y), a(l(t)), {
			default: c(() => [r(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), M = /* @__PURE__ */ t({
	__name: "Dialog",
	props: {
		open: { type: Boolean },
		defaultOpen: { type: Boolean },
		modal: { type: Boolean },
		unmountOnHide: { type: Boolean }
	},
	emits: ["update:open"],
	setup(e, { emit: t }) {
		let a = e, o = v(a, t);
		return T(() => a.open), (e, t) => (i(), d(m(C), n(m(o), { modal: !m(h)() && a.modal }), {
			default: c(() => [r(e.$slots, "default")]),
			_: 3
		}, 16, ["modal"]));
	}
}), N = { class: "sr-only" }, P = /* @__PURE__ */ t({
	__name: "DialogContent",
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
		let a = e, l = t, { t: f } = _(), h = p(() => {
			let { class: e, ...t } = a;
			return t;
		}), y = v(h, l), b = k(y);
		return (e, t) => (i(), d(m(j), { to: m(g)() }, {
			default: c(() => [o(m(w), { class: "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-200 bg-black/80" }), o(m(E), n(m(b), { class: m(x)("fixed left-1/2 top-1/2 z-200 grid w-[90vw] max-w-md sm:max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 sm:rounded-lg", a.class) }), {
				default: c(() => [r(e.$slots, "default"), o(m(O), { class: "data-[state=open]:bg-accent ring-offset-background data-[state=open]:text-muted-foreground focus:ring-ring absolute right-4 top-4 rounded-sm opacity-70 transition-opacity disabled:pointer-events-none hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-offset-2" }, {
					default: c(() => [o(m(A), { class: "h-4 w-4" }), s("span", N, u(m(f)("common.close")), 1)]),
					_: 1
				})]),
				_: 3
			}, 16, ["class"])]),
			_: 3
		}, 8, ["to"]));
	}
}), F = /* @__PURE__ */ t({
	__name: "DialogHeader",
	props: { class: { type: [
		Boolean,
		null,
		String,
		Object,
		Array
	] } },
	setup(t) {
		let n = t;
		return (t, a) => (i(), e("div", { class: f(m(x)("flex flex-col gap-y-1.5 text-center sm:text-left", n.class)) }, [r(t.$slots, "default")], 2));
	}
}), I = /* @__PURE__ */ t({
	__name: "DialogDescription",
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
		let t = e, a = p(() => {
			let { class: e, ...n } = t;
			return n;
		}), o = b(a);
		return (e, a) => (i(), d(m(S), n(m(o), { class: m(x)("text-sm text-muted-foreground", t.class) }), {
			default: c(() => [r(e.$slots, "default")]),
			_: 3
		}, 16, ["class"]));
	}
}), L = /* @__PURE__ */ t({
	__name: "DialogTitle",
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
		let t = e, a = p(() => {
			let { class: e, ...n } = t;
			return n;
		}), o = b(a);
		return (e, a) => (i(), d(m(D), n(m(o), { class: m(x)("text-lg font-semibold leading-none tracking-tight", t.class) }), {
			default: c(() => [r(e.$slots, "default")]),
			_: 3
		}, 16, ["class"]));
	}
});
export { M as a, P as i, I as n, F as r, L as t };
