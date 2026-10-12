import { C as e, Ct as t, D as n, F as r, G as i, H as a, I as o, J as s, N as c, Q as l, R as ee, S as u, St as d, T as f, W as p, Z as m, b as h, dt as g, et as _, h as v, q as y, w as b, wt as x, x as S, xt as C, y as w, yt as T, z as E } from "./vendor_vue-OlfIOlFg.js";
var D = 1, O = new class {
	subscribers;
	toasts;
	dismissedToasts;
	constructor() {
		this.subscribers = [], this.toasts = [], this.dismissedToasts = /* @__PURE__ */ new Set();
	}
	subscribe = (e) => (this.subscribers.push(e), () => {
		let t = this.subscribers.indexOf(e);
		this.subscribers.splice(t, 1);
	});
	publish = (e) => {
		this.subscribers.forEach((t) => t(e));
	};
	addToast = (e) => {
		this.publish(e), this.toasts = [...this.toasts, e];
	};
	create = (e) => {
		let { message: t, ...n } = e, r = typeof e.id == "number" || e.id && e.id?.length > 0 ? e.id : D++, i = this.toasts.find((e) => e.id === r), a = e.dismissible === void 0 || e.dismissible;
		return this.dismissedToasts.has(r) && this.dismissedToasts.delete(r), i ? this.toasts = this.toasts.map((n) => n.id === r ? (this.publish({
			...n,
			...e,
			id: r,
			title: t
		}), {
			...n,
			...e,
			id: r,
			dismissible: a,
			title: t
		}) : n) : this.addToast({
			title: t,
			...n,
			dismissible: a,
			id: r
		}), r;
	};
	dismiss = (e) => (e ? (this.dismissedToasts.add(e), requestAnimationFrame(() => this.subscribers.forEach((t) => t({
		id: e,
		dismiss: !0
	})))) : this.toasts.forEach((e) => {
		this.subscribers.forEach((t) => t({
			id: e.id,
			dismiss: !0
		}));
	}), e);
	message = (e, t) => this.create({
		...t,
		message: e,
		type: "default"
	});
	error = (e, t) => this.create({
		...t,
		type: "error",
		message: e
	});
	success = (e, t) => this.create({
		...t,
		type: "success",
		message: e
	});
	info = (e, t) => this.create({
		...t,
		type: "info",
		message: e
	});
	warning = (e, t) => this.create({
		...t,
		type: "warning",
		message: e
	});
	loading = (e, t) => this.create({
		...t,
		type: "loading",
		message: e
	});
	promise = (e, t) => {
		if (!t) return;
		let n;
		t.loading !== void 0 && (n = this.create({
			...t,
			promise: e,
			type: "loading",
			message: t.loading,
			description: typeof t.description == "function" ? void 0 : t.description
		}));
		let r = Promise.resolve(e instanceof Function ? e() : e), i = n !== void 0, a, o = r.then(async (e) => {
			if (a = ["resolve", e], c(e)) i = !1, this.create({
				id: n,
				type: "default",
				message: e
			});
			else if (A(e) && !e.ok) {
				i = !1;
				let r = typeof t.error == "function" ? await t.error(`HTTP error! status: ${e.status}`) : t.error, a = typeof t.description == "function" ? await t.description(`HTTP error! status: ${e.status}`) : t.description, o = typeof r == "object" && !c(r) ? r : {
					message: r || "",
					id: n || ""
				};
				this.create({
					id: n,
					type: "error",
					description: a,
					...o
				});
			} else if (e instanceof Error) {
				i = !1;
				let r = typeof t.error == "function" ? await t.error(e) : t.error, a = typeof t.description == "function" ? await t.description(e) : t.description, o = typeof r == "object" && !c(r) ? r : {
					message: r || "",
					id: n || ""
				};
				this.create({
					id: n,
					type: "error",
					description: a,
					...o
				});
			} else if (t.success !== void 0) {
				i = !1;
				let r = typeof t.success == "function" ? await t.success(e) : t.success, a = typeof t.description == "function" ? await t.description(e) : t.description, o = typeof r == "object" && !c(r) ? r : {
					message: r || "",
					id: n || ""
				};
				this.create({
					id: n,
					type: "success",
					description: a,
					...o
				});
			}
		}).catch(async (e) => {
			if (a = ["reject", e], t.error !== void 0) {
				i = !1;
				let r = typeof t.error == "function" ? await t.error(e) : t.error, a = typeof t.description == "function" ? await t.description(e) : t.description, o = typeof r == "object" && !c(r) ? r : {
					message: r || "",
					id: n || ""
				};
				this.create({
					id: n,
					type: "error",
					description: a,
					...o
				});
			}
		}).finally(() => {
			i && (this.dismiss(n), n = void 0), t.finally?.();
		}), s = () => new Promise((e, t) => o.then(() => a[0] === "reject" ? t(a[1]) : e(a[1])).catch(t));
		return typeof n != "string" && typeof n != "number" ? { unwrap: s } : Object.assign(n, { unwrap: s });
	};
	custom = (e, t) => {
		let n = t?.id || D++, r = this.toasts.find((e) => e.id === n), i = t?.dismissible === void 0 || t.dismissible;
		return this.dismissedToasts.has(n) && this.dismissedToasts.delete(n), r ? this.toasts = this.toasts.map((r) => r.id === n ? (this.publish({
			...r,
			component: e,
			dismissible: i,
			id: n,
			...t
		}), {
			...r,
			component: e,
			dismissible: i,
			id: n,
			...t
		}) : r) : this.addToast({
			component: e,
			dismissible: i,
			id: n,
			...t
		}), n;
	};
	getActiveToasts = () => this.toasts.filter((e) => !this.dismissedToasts.has(e.id));
}();
function k(e, t) {
	let n = t?.id || D++;
	return O.create({
		message: e,
		id: n,
		type: "default",
		...t
	}), n;
}
var A = (e) => e && typeof e == "object" && "ok" in e && typeof e.ok == "boolean" && "status" in e && typeof e.status == "number", j = Object.assign(k, {
	success: O.success,
	info: O.info,
	warning: O.warning,
	error: O.error,
	custom: O.custom,
	message: O.message,
	promise: O.promise,
	dismiss: O.dismiss,
	loading: O.loading
}, {
	getHistory: () => O.toasts,
	getToasts: () => O.getActiveToasts()
});
function M(e) {
	return e.label !== void 0;
}
var N = 3, P = "24px", F = "16px", I = 4e3, L = 356, R = 14, te = 45, z = 200;
function ne() {
	let e = g(!1);
	return l(() => {
		let t = () => {
			e.value = document.hidden;
		};
		return document.addEventListener("visibilitychange", t), () => window.removeEventListener("visibilitychange", t);
	}), { isDocumentHidden: e };
}
function B(...e) {
	return e.filter(Boolean).join(" ");
}
function re(e) {
	let [t, n] = e.split("-"), r = [];
	return t && r.push(t), n && r.push(n), r;
}
function ie(e, t) {
	let n = {};
	return [e, t].forEach((e, t) => {
		let r = t === 1, i = r ? "--mobile-offset" : "--offset", a = r ? F : P;
		function o(e) {
			[
				"top",
				"right",
				"bottom",
				"left"
			].forEach((t) => {
				n[`${i}-${t}`] = typeof e == "number" ? `${e}px` : e;
			});
		}
		typeof e == "number" || typeof e == "string" ? o(e) : typeof e == "object" ? [
			"top",
			"right",
			"bottom",
			"left"
		].forEach((t) => {
			e[t] === void 0 ? n[`${i}-${t}`] = a : n[`${i}-${t}`] = typeof e[t] == "number" ? `${e[t]}px` : e[t];
		}) : o(a);
	}), n;
}
var ae = [
	"data-rich-colors",
	"data-styled",
	"data-mounted",
	"data-promise",
	"data-swiped",
	"data-removed",
	"data-visible",
	"data-y-position",
	"data-x-position",
	"data-index",
	"data-front",
	"data-swiping",
	"data-dismissible",
	"data-type",
	"data-invert",
	"data-swipe-out",
	"data-swipe-direction",
	"data-expanded",
	"data-testid"
], oe = [
	"aria-label",
	"data-disabled",
	"data-close-button-position"
], se = /* @__PURE__ */ n({
	__name: "Toast",
	props: {
		toast: {},
		toasts: {},
		index: {},
		swipeDirections: {},
		expanded: { type: Boolean },
		invert: { type: Boolean },
		heights: {},
		gap: {},
		position: {},
		closeButtonPosition: {},
		visibleToasts: {},
		expandByDefault: { type: Boolean },
		closeButton: { type: Boolean },
		interacting: { type: Boolean },
		style: {},
		cancelButtonStyle: {},
		actionButtonStyle: {},
		duration: {},
		class: {},
		unstyled: { type: Boolean },
		descriptionClass: {},
		loadingIcon: {},
		classes: {},
		icons: {},
		closeButtonAriaLabel: {},
		defaultRichColors: { type: Boolean }
	},
	emits: [
		"update:heights",
		"update:height",
		"removeToast"
	],
	setup(n, { emit: s }) {
		let c = n, f = s, p = g(null), _ = g(null), D = g(!1), O = g(!1), k = g(!1), A = g(!1), j = g(!1), N = g(0), P = g(0), F = g(c.toast.duration || c.duration || I), L = g(null), R = g(null), ie = w(() => c.index === 0), se = w(() => c.index + 1 <= c.visibleToasts), V = w(() => c.toast.type), H = w(() => c.toast.dismissible !== !1), ce = w(() => c.toast.class || ""), le = w(() => c.descriptionClass || ""), U = w(() => {
			let e = c.toast.position || c.position, t = c.heights.filter((t) => t.position === e).findIndex((e) => e.toastId === c.toast.id);
			return t >= 0 ? t : 0;
		}), ue = w(() => {
			let e = c.toast.position || c.position;
			return c.heights.filter((t) => t.position === e).reduce((e, t, n) => n >= U.value ? e : e + t.height, 0);
		}), W = w(() => U.value * c.gap + ue.value || 0), de = w(() => c.toast.closeButton ?? c.closeButton), fe = w(() => c.toast.duration || c.duration || I), G = g(0), K = g(0), q = g(null), J = w(() => c.position.split("-")), pe = w(() => J.value[0]), me = w(() => J.value[1]), he = w(() => typeof c.toast.title != "string"), ge = w(() => typeof c.toast.description != "string"), { isDocumentHidden: Y } = ne(), X = w(() => V.value && V.value === "loading");
		E(() => {
			D.value = !0, F.value = fe.value;
		}), l(async () => {
			if (!D.value || !R.value) return;
			await o();
			let e = R.value, t = e.style.height;
			e.style.height = "auto";
			let n = e.getBoundingClientRect().height;
			e.style.height = t, P.value = n, f("update:height", {
				toastId: c.toast.id,
				height: n,
				position: c.toast.position || c.position
			});
		});
		function Z() {
			O.value = !0, N.value = W.value, setTimeout(() => {
				f("removeToast", c.toast);
			}, z);
		}
		function Q() {
			if (X.value || !H.value) return {};
			Z(), c.toast.onDismiss?.(c.toast);
		}
		function _e(e) {
			e.button !== 2 && !X.value && H.value && (L.value = /* @__PURE__ */ new Date(), N.value = W.value, e.target.setPointerCapture(e.pointerId), e.target.tagName !== "BUTTON" && (k.value = !0, q.value = {
				x: e.clientX,
				y: e.clientY
			}));
		}
		function ve() {
			if (A.value || !H.value) return;
			q.value = null;
			let e = Number(R.value?.style.getPropertyValue("--swipe-amount-x").replace("px", "") || 0), t = Number(R.value?.style.getPropertyValue("--swipe-amount-y").replace("px", "") || 0), n = (/* @__PURE__ */ new Date()).getTime() - (L.value?.getTime() || 0), r = p.value === "x" ? e : t, i = Math.abs(r) / n;
			if (Math.abs(r) >= te || i > .11) {
				N.value = W.value, c.toast.onDismiss?.(c.toast), p.value === "x" ? _.value = e > 0 ? "right" : "left" : _.value = t > 0 ? "down" : "up", Z(), A.value = !0;
				return;
			}
			R.value?.style.setProperty("--swipe-amount-x", "0px"), R.value?.style.setProperty("--swipe-amount-y", "0px"), j.value = !1, k.value = !1, p.value = null;
		}
		function $(e) {
			if (!q.value || !H.value || (window?.getSelection()?.toString()?.length ?? !1)) return;
			let t = e.clientY - q.value.y, n = e.clientX - q.value.x, r = c.swipeDirections ?? re(c.position);
			!p.value && (Math.abs(n) > 1 || Math.abs(t) > 1) && (p.value = Math.abs(n) > Math.abs(t) ? "x" : "y");
			let i = {
				x: 0,
				y: 0
			}, a = (e) => 1 / (1.5 + Math.abs(e) / 20);
			if (p.value === "y") {
				if (r.includes("top") || r.includes("bottom")) {
					if (r.includes("top") && t < 0 || r.includes("bottom") && t > 0) i.y = t;
					else {
						let e = t * a(t);
						i.y = Math.abs(e) < Math.abs(t) ? e : t;
					}
				}
			} else if (p.value === "x" && (r.includes("left") || r.includes("right"))) {
				if (r.includes("left") && n < 0 || r.includes("right") && n > 0) i.x = n;
				else {
					let e = n * a(n);
					i.x = Math.abs(e) < Math.abs(n) ? e : n;
				}
			}
			(Math.abs(i.x) > 0 || Math.abs(i.y) > 0) && (j.value = !0), R.value?.style.setProperty("--swipe-amount-x", `${i.x}px`), R.value?.style.setProperty("--swipe-amount-y", `${i.y}px`);
		}
		E(() => {
			if (D.value = !0, !R.value) return;
			let e = R.value.getBoundingClientRect().height;
			P.value = e;
			let t = [{
				toastId: c.toast.id,
				height: e,
				position: c.toast.position
			}, ...c.heights];
			f("update:heights", t);
		}), ee(() => {
			R.value && f("removeToast", c.toast);
		}), l((e) => {
			if (c.toast.promise && V.value === "loading" || c.toast.duration === Infinity || c.toast.type === "loading") return;
			let t;
			c.expanded || c.interacting || Y.value ? (() => {
				if (K.value < G.value) {
					let e = (/* @__PURE__ */ new Date()).getTime() - G.value;
					F.value -= e;
				}
				K.value = (/* @__PURE__ */ new Date()).getTime();
			})() : F.value !== Infinity && (G.value = (/* @__PURE__ */ new Date()).getTime(), t = setTimeout(() => {
				c.toast.onAutoClose?.(c.toast), Z();
			}, F.value)), e(() => {
				clearTimeout(t);
			});
		}), m(() => c.toast.delete, (e) => {
			e !== void 0 && e && (Z(), c.toast.onDismiss?.(c.toast));
		}, { deep: !0 });
		function ye() {
			k.value = !1, p.value = null, q.value = null;
		}
		return (n, o) => (a(), e("li", {
			tabindex: "0",
			ref_key: "toastRef",
			ref: R,
			class: C(T(B)(c.class, ce.value, n.classes?.toast, n.toast.classes?.toast, n.classes?.[V.value], n.toast?.classes?.[V.value])),
			"data-sonner-toast": "",
			"data-rich-colors": n.toast.richColors ?? n.defaultRichColors,
			"data-styled": !(n.toast.component || n.toast?.unstyled || n.unstyled),
			"data-mounted": D.value,
			"data-promise": !!n.toast.promise,
			"data-swiped": j.value,
			"data-removed": O.value,
			"data-visible": se.value,
			"data-y-position": pe.value,
			"data-x-position": me.value,
			"data-index": n.index,
			"data-front": ie.value,
			"data-swiping": k.value,
			"data-dismissible": H.value,
			"data-type": V.value,
			"data-invert": n.toast.invert || n.invert,
			"data-swipe-out": A.value,
			"data-swipe-direction": _.value,
			"data-expanded": !!(n.expanded || n.expandByDefault && D.value),
			"data-testid": n.toast.testId,
			style: t({
				"--index": n.index,
				"--toasts-before": n.index,
				"--z-index": n.toasts.length - n.index,
				"--offset": `${O.value ? N.value : W.value}px`,
				"--initial-height": n.expandByDefault ? "auto" : `${P.value}px`,
				...n.style,
				...c.toast.style
			}),
			onDragend: ye,
			onPointerdown: _e,
			onPointerup: ve,
			onPointermove: $
		}, [de.value && !n.toast.component && V.value !== "loading" ? (a(), e("button", {
			key: 0,
			"aria-label": n.closeButtonAriaLabel || "Close toast",
			"data-disabled": X.value,
			"data-close-button": "true",
			"data-close-button-position": n.closeButtonPosition,
			class: C(T(B)(n.classes?.closeButton, n.toast?.classes?.closeButton)),
			onClick: Q
		}, [n.icons?.close ? (a(), S(y(n.icons?.close), { key: 0 })) : i(n.$slots, "close-icon", { key: 1 })], 10, oe)) : u("v-if", !0), n.toast.component ? (a(), S(y(n.toast.component), r({ key: 1 }, n.toast.componentProps, {
			onCloseToast: Q,
			isPaused: n.$props.expanded || n.$props.interacting || T(Y)
		}), null, 16, ["isPaused"])) : (a(), e(v, { key: 2 }, [
			V.value !== "default" || n.toast.icon || n.toast.promise ? (a(), e("div", {
				key: 0,
				"data-icon": "",
				class: C(T(B)(n.classes?.icon, n.toast?.classes?.icon))
			}, [n.toast.icon ? (a(), S(y(n.toast.icon), { key: 0 })) : (a(), e(v, { key: 1 }, [V.value === "loading" ? i(n.$slots, "loading-icon", { key: 0 }) : V.value === "success" ? i(n.$slots, "success-icon", { key: 1 }) : V.value === "error" ? i(n.$slots, "error-icon", { key: 2 }) : V.value === "warning" ? i(n.$slots, "warning-icon", { key: 3 }) : V.value === "info" ? i(n.$slots, "info-icon", { key: 4 }) : u("v-if", !0)], 64))], 2)) : u("v-if", !0),
			h("div", {
				"data-content": "",
				class: C(T(B)(n.classes?.content, n.toast?.classes?.content))
			}, [h("div", {
				"data-title": "",
				class: C(T(B)(n.classes?.title, n.toast.classes?.title))
			}, [he.value ? (a(), S(y(n.toast.title), d(r({ key: 0 }, n.toast.componentProps)), null, 16)) : (a(), e(v, { key: 1 }, [b(x(n.toast.title), 1)], 64))], 2), n.toast.description ? (a(), e("div", {
				key: 0,
				"data-description": "",
				class: C(T(B)(n.descriptionClass, le.value, n.classes?.description, n.toast.classes?.description))
			}, [ge.value ? (a(), S(y(n.toast.description), d(r({ key: 0 }, n.toast.componentProps)), null, 16)) : (a(), e(v, { key: 1 }, [b(x(n.toast.description), 1)], 64))], 2)) : u("v-if", !0)], 2),
			n.toast.cancel ? (a(), e("button", {
				key: 1,
				style: t(n.toast.cancelButtonStyle || n.cancelButtonStyle),
				class: C(T(B)(n.classes?.cancelButton, n.toast.classes?.cancelButton)),
				"data-button": "",
				"data-cancel": "",
				onClick: o[0] ||= (e) => {
					T(M)(n.toast.cancel) && H.value && (n.toast.cancel.onClick?.(e), Z());
				}
			}, x(T(M)(n.toast.cancel) ? n.toast.cancel?.label : n.toast.cancel), 7)) : u("v-if", !0),
			n.toast.action ? (a(), e("button", {
				key: 2,
				style: t(n.toast.actionButtonStyle || n.actionButtonStyle),
				class: C(T(B)(n.classes?.actionButton, n.toast.classes?.actionButton)),
				"data-button": "",
				"data-action": "",
				onClick: o[1] ||= (e) => {
					T(M)(n.toast.action) && (n.toast.action.onClick?.(e), !e.defaultPrevented && Z());
				}
			}, x(T(M)(n.toast.action) ? n.toast.action?.label : n.toast.action), 7)) : u("v-if", !0)
		], 64))], 46, ae));
	}
}), V = (e, t) => {
	let n = e.__vccOpts || e;
	for (let [e, r] of t) n[e] = r;
	return n;
}, H = {}, ce = {
	xmlns: "http://www.w3.org/2000/svg",
	width: "12",
	height: "12",
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	"stoke-width": "1.5",
	"stroke-linecap": "round",
	"stroke-linejoin": "round"
};
function le(t, n) {
	return a(), e("svg", ce, n[0] ||= [h("line", {
		x1: "18",
		y1: "6",
		x2: "6",
		y2: "18"
	}, null, -1), h("line", {
		x1: "6",
		y1: "6",
		x2: "18",
		y2: "18"
	}, null, -1)]);
}
var U = /* @__PURE__ */ V(H, [["render", le]]), ue = ["data-visible"], W = { class: "sonner-spinner" }, de = /* @__PURE__ */ n({
	__name: "Loader",
	props: { visible: { type: Boolean } },
	setup(t) {
		let n = Array(12).fill(0);
		return (t, r) => (a(), e("div", {
			class: "sonner-loading-wrapper",
			"data-visible": t.visible
		}, [h("div", W, [(a(!0), e(v, null, p(T(n), (t) => (a(), e("div", {
			key: `spinner-bar-${t}`,
			class: "sonner-loading-bar"
		}))), 128))])], 8, ue));
	}
}), fe = {}, G = {
	xmlns: "http://www.w3.org/2000/svg",
	viewBox: "0 0 20 20",
	fill: "currentColor",
	height: "20",
	width: "20"
};
function K(t, n) {
	return a(), e("svg", G, n[0] ||= [h("path", {
		"fill-rule": "evenodd",
		d: "M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z",
		"clip-rule": "evenodd"
	}, null, -1)]);
}
var q = /* @__PURE__ */ V(fe, [["render", K]]), J = {}, pe = {
	xmlns: "http://www.w3.org/2000/svg",
	viewBox: "0 0 20 20",
	fill: "currentColor",
	height: "20",
	width: "20"
};
function me(t, n) {
	return a(), e("svg", pe, n[0] ||= [h("path", {
		"fill-rule": "evenodd",
		d: "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z",
		"clip-rule": "evenodd"
	}, null, -1)]);
}
var he = /* @__PURE__ */ V(J, [["render", me]]), ge = {}, Y = {
	xmlns: "http://www.w3.org/2000/svg",
	viewBox: "0 0 24 24",
	fill: "currentColor",
	height: "20",
	width: "20"
};
function X(t, n) {
	return a(), e("svg", Y, n[0] ||= [h("path", {
		"fill-rule": "evenodd",
		d: "M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z",
		"clip-rule": "evenodd"
	}, null, -1)]);
}
var Z = /* @__PURE__ */ V(ge, [["render", X]]), Q = {}, _e = {
	xmlns: "http://www.w3.org/2000/svg",
	viewBox: "0 0 20 20",
	fill: "currentColor",
	height: "20",
	width: "20"
};
function ve(t, n) {
	return a(), e("svg", _e, n[0] ||= [h("path", {
		"fill-rule": "evenodd",
		d: "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z",
		"clip-rule": "evenodd"
	}, null, -1)]);
}
var $ = /* @__PURE__ */ V(Q, [["render", ve]]), ye = ["aria-label"], be = [
	"data-sonner-theme",
	"dir",
	"data-theme",
	"data-rich-colors",
	"data-y-position",
	"data-x-position"
], xe = typeof window < "u" && typeof document < "u";
function Se() {
	if (typeof window > "u" || typeof document > "u") return "ltr";
	let e = document.documentElement.getAttribute("dir");
	return e === "auto" || !e ? window.getComputedStyle(document.documentElement).direction : e;
}
var Ce = /* @__PURE__ */ n({
	name: "Toaster",
	inheritAttrs: !1,
	__name: "Toaster",
	props: {
		id: {},
		invert: {
			type: Boolean,
			default: !1
		},
		theme: { default: "light" },
		position: { default: "bottom-right" },
		closeButtonPosition: { default: "top-left" },
		hotkey: { default: () => ["altKey", "KeyT"] },
		richColors: {
			type: Boolean,
			default: !1
		},
		expand: {
			type: Boolean,
			default: !1
		},
		duration: {},
		gap: { default: R },
		visibleToasts: { default: N },
		closeButton: {
			type: Boolean,
			default: !1
		},
		toastOptions: { default: () => ({}) },
		class: { default: "" },
		style: {},
		offset: { default: P },
		mobileOffset: { default: F },
		dir: { default: "auto" },
		swipeDirections: {},
		icons: {},
		containerAriaLabel: { default: "Notifications" }
	},
	setup(n) {
		let c = n, ee = s(), d = g([]), m = w(() => c.id ? d.value.filter((e) => e.toasterId === c.id) : d.value.filter((e) => !e.toasterId));
		function y(e, t) {
			return m.value.filter((n) => !n.position && t === 0 || n.position === e);
		}
		let b = w(() => {
			let e = m.value.filter((e) => e.position).map((e) => e.position);
			return e.length > 0 ? Array.from(new Set([c.position].concat(e))) : [c.position];
		}), x = w(() => {
			let e = {};
			return b.value.forEach((t) => {
				e[t] = d.value.filter((e) => e.position === t);
			}), e;
		}), E = g([]), D = g({}), k = g(!1);
		l(() => {
			b.value.forEach((e) => {
				e in D.value || (D.value[e] = !1);
			});
		});
		let A = g(c.theme === "system" ? typeof window < "u" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" : c.theme), j = g(null), M = g(null), N = g(!1), P = c.hotkey.join("+").replace(/Key/g, "").replace(/Digit/g, "");
		function F(e) {
			d.value.find((t) => t.id === e.id)?.delete || O.dismiss(e.id), d.value = d.value.filter(({ id: t }) => t !== e.id), setTimeout(() => {
				d.value.find((t) => t.id === e.id) || (E.value = E.value.filter((t) => t.toastId !== e.id));
			}, 250);
		}
		function I(e) {
			N.value && !e.currentTarget?.contains?.(e.relatedTarget) && (N.value = !1, M.value &&= (M.value.focus({ preventScroll: !0 }), null));
		}
		function R(e) {
			e.target instanceof HTMLElement && e.target.dataset.dismissible === "false" || N.value || (N.value = !0, M.value = e.relatedTarget);
		}
		function te(e) {
			e.target && e.target instanceof HTMLElement && e.target.dataset.dismissible === "false" || (k.value = !0);
		}
		l((e) => {
			e(O.subscribe((e) => {
				if (e.dismiss) {
					requestAnimationFrame(() => {
						d.value = d.value.map((t) => t.id === e.id ? {
							...t,
							delete: !0
						} : t);
					});
					return;
				}
				o(() => {
					let t = d.value.findIndex((t) => t.id === e.id);
					t === -1 ? d.value = [e, ...d.value] : d.value = [
						...d.value.slice(0, t),
						{
							...d.value[t],
							...e
						},
						...d.value.slice(t + 1)
					];
				});
			}));
		}), l((e) => {
			if (typeof window > "u") return;
			if (c.theme !== "system") {
				A.value = c.theme;
				return;
			}
			let t = window.matchMedia("(prefers-color-scheme: dark)"), n = (e) => {
				A.value = e ? "dark" : "light";
			};
			n(t.matches);
			let r = (e) => {
				n(e.matches);
			};
			try {
				t.addEventListener("change", r);
			} catch {
				t.addListener(r);
			}
			e(() => {
				try {
					t.removeEventListener("change", r);
				} catch {
					t.removeListener(r);
				}
			});
		}), l(() => {
			j.value && M.value && (M.value.focus({ preventScroll: !0 }), M.value = null, N.value = !1);
		}), l(() => {
			d.value.length <= 1 && Object.keys(D.value).forEach((e) => {
				D.value[e] = !1;
			});
		}), l((e) => {
			function t(e) {
				let t = c.hotkey.every((t) => e[t] || e.code === t), n = Array.isArray(j.value) ? j.value[0] : j.value;
				t && (b.value.forEach((e) => {
					D.value[e] = !0;
				}), n?.focus());
				let r = document.activeElement === j.value || n?.contains(document.activeElement);
				e.code === "Escape" && r && b.value.forEach((e) => {
					D.value[e] = !1;
				});
			}
			xe && (document.addEventListener("keydown", t), e(() => {
				document.removeEventListener("keydown", t);
			}));
		});
		function z(e) {
			let t = e.currentTarget, n = t.getAttribute("data-y-position") + "-" + t.getAttribute("data-x-position");
			D.value[n] = !0;
		}
		function ne(e) {
			if (!k.value) {
				let t = e.currentTarget, n = t.getAttribute("data-y-position") + "-" + t.getAttribute("data-x-position");
				D.value[n] = !1;
			}
		}
		function B() {
			Object.keys(D.value).forEach((e) => {
				D.value[e] = !1;
			});
		}
		function re() {
			k.value = !1;
		}
		function ae(e) {
			E.value = e;
		}
		function oe(e) {
			let t = E.value.findIndex((t) => t.toastId === e.toastId);
			if (t !== -1) E.value[t] = e;
			else {
				let t = E.value.findIndex((t) => t.position === e.position);
				t === -1 ? E.value.unshift(e) : E.value.splice(t, 0, e);
			}
		}
		return (n, o) => (a(), e(v, null, [u(" Remove item from normal navigation flow, only available via hotkey "), h("section", {
			"aria-label": `${n.containerAriaLabel} ${T(P)}`,
			tabIndex: -1,
			"aria-live": "polite",
			"aria-relevant": "additions text",
			"aria-atomic": "false"
		}, [(a(!0), e(v, null, p(b.value, (o, s) => (a(), e("ol", r({
			key: o,
			ref_for: !0,
			ref_key: "listRef",
			ref: j,
			"data-sonner-toaster": "",
			"data-sonner-theme": A.value,
			class: c.class,
			dir: n.dir === "auto" ? Se() : n.dir,
			tabIndex: -1,
			"data-theme": n.theme,
			"data-rich-colors": n.richColors,
			"data-y-position": o.split("-")[0],
			"data-x-position": o.split("-")[1],
			style: {
				"--front-toast-height": `${E.value[0]?.height || 0}px`,
				"--width": `${T(L)}px`,
				"--gap": `${n.gap}px`,
				...n.style,
				...T(ee).style,
				...T(ie)(n.offset, n.mobileOffset)
			}
		}, { ref_for: !0 }, n.$attrs, {
			onBlur: I,
			onFocus: R,
			onMouseenter: z,
			onMousemove: z,
			onMouseleave: ne,
			onDragend: B,
			onPointerdown: te,
			onPointerup: re
		}), [(a(!0), e(v, null, p(y(o, s), (e, r) => (a(), S(se, {
			key: e.id,
			heights: E.value,
			icons: n.icons,
			index: r,
			toast: e,
			defaultRichColors: n.richColors,
			duration: n.toastOptions?.duration ?? n.duration,
			class: C(n.toastOptions?.class ?? ""),
			descriptionClass: n.toastOptions?.descriptionClass,
			invert: n.invert,
			visibleToasts: n.visibleToasts,
			closeButton: n.toastOptions?.closeButton ?? n.closeButton,
			interacting: k.value,
			position: o,
			closeButtonPosition: n.toastOptions?.closeButtonPosition ?? n.closeButtonPosition,
			style: t(n.toastOptions?.style),
			unstyled: n.toastOptions?.unstyled,
			classes: n.toastOptions?.classes,
			cancelButtonStyle: n.toastOptions?.cancelButtonStyle,
			actionButtonStyle: n.toastOptions?.actionButtonStyle,
			"close-button-aria-label": n.toastOptions?.closeButtonAriaLabel,
			toasts: x.value[o],
			expandByDefault: n.expand,
			gap: n.gap,
			expanded: D.value[o] || !1,
			swipeDirections: c.swipeDirections,
			"onUpdate:heights": ae,
			"onUpdate:height": oe,
			onRemoveToast: F
		}, {
			"close-icon": _(() => [i(n.$slots, "close-icon", {}, () => [f(U)])]),
			"loading-icon": _(() => [i(n.$slots, "loading-icon", {}, () => [f(de, { visible: e.type === "loading" }, null, 8, ["visible"])])]),
			"success-icon": _(() => [i(n.$slots, "success-icon", {}, () => [f(q)])]),
			"error-icon": _(() => [i(n.$slots, "error-icon", {}, () => [f($)])]),
			"warning-icon": _(() => [i(n.$slots, "warning-icon", {}, () => [f(Z)])]),
			"info-icon": _(() => [i(n.$slots, "info-icon", {}, () => [f(he)])]),
			_: 2
		}, 1032, [
			"heights",
			"icons",
			"index",
			"toast",
			"defaultRichColors",
			"duration",
			"class",
			"descriptionClass",
			"invert",
			"visibleToasts",
			"closeButton",
			"interacting",
			"position",
			"closeButtonPosition",
			"style",
			"unstyled",
			"classes",
			"cancelButtonStyle",
			"actionButtonStyle",
			"close-button-aria-label",
			"toasts",
			"expandByDefault",
			"gap",
			"expanded",
			"swipeDirections"
		]))), 128))], 16, be))), 128))], 8, ye)], 2112));
	}
});
export { j as n, Ce as t };
