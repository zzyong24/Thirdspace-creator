import { A as e, B as t, Ct as n, D as r, G as i, H as a, I as o, M as s, O as c, Q as l, S as u, Tt as d, U as f, V as p, Y as m, Z as h, _t as g, bt as _, dt as v, et as y, g as ee, gt as te, ht as ne, lt as re, o as ie, vt as ae, x as b, y as x, yt as S } from "./vendor_vue-OlfIOlFg.js";
import { a as oe, d as C, f as w, h as se, i as ce, l as le, n as ue, r as T, t as de, u as fe } from "./vendor_vueuse-DbHwQsn4.js";
import { i as E, o as pe } from "./Button-B4kIEl6s.js";
function D(e, t) {
	let n = typeof e == "string" && !t ? `${e}Context` : t, r = Symbol(n);
	return [(t) => {
		let n = s(r, t);
		if (n || n === null) return n;
		throw Error(`Injection \`${r.toString()}\` not found. Component must be used within ${Array.isArray(e) ? `one of the following components: ${e.join(", ")}` : `\`${e}\``}`);
	}, (e) => (f(r, e), e)];
}
function O() {
	let e = document.activeElement;
	if (e == null) return null;
	for (; e != null && e.shadowRoot != null && e.shadowRoot.activeElement != null;) e = e.shadowRoot.activeElement;
	return e;
}
function k(e, t, n) {
	let r = n.originalEvent.target, i = new CustomEvent(e, {
		bubbles: !1,
		cancelable: !0,
		detail: n
	});
	t && r.addEventListener(e, t, { once: !0 }), r.dispatchEvent(i);
}
function A(e) {
	return e == null;
}
var [j, me] = /*#__PURE__*/ D("ConfigProvider"), M = /*#__PURE__*/ re({
	layersRoot: /* @__PURE__ */ new Set(),
	layersWithOutsidePointerEventsDisabled: /* @__PURE__ */ new Set(),
	originalBodyPointerEvents: void 0,
	branches: /* @__PURE__ */ new Set()
});
function N(e) {
	if (typeof e != "object" || !e) return !1;
	let t = Object.getPrototypeOf(e);
	return t !== null && t !== Object.prototype && Object.getPrototypeOf(t) !== null || Symbol.iterator in e ? !1 : Symbol.toStringTag in e ? Object.prototype.toString.call(e) === "[object Module]" : !0;
}
function P(e, t, n = ".", r) {
	if (!N(t)) return P(e, {}, n, r);
	let i = { ...t };
	for (let t of Object.keys(e)) {
		if (t === "__proto__" || t === "constructor") continue;
		let a = e[t];
		a != null && (r && r(i, t, a, n) || (i[t] = Array.isArray(a) && Array.isArray(i[t]) ? [...a, ...i[t]] : N(a) && N(i[t]) ? P(a, i[t], (n ? `${n}.` : "") + t.toString(), r) : a));
	}
	return i;
}
function he(e) {
	return (...t) => t.reduce((t, n) => P(t, n, "", e), {});
}
var ge = he(), _e = fe(() => {
	let e = v(/* @__PURE__ */ new Map()), t = v(), n = x(() => {
		for (let t of e.value.values()) if (t) return !0;
		return !1;
	}), r = j({ scrollBody: v(!0) }), i = null, a = () => {
		document.body.style.paddingRight = "", document.body.style.marginRight = "", M.layersWithOutsidePointerEventsDisabled.size === 0 && (document.body.style.pointerEvents = ""), document.documentElement.style.removeProperty("--scrollbar-width"), document.body.style.overflow = t.value ?? "", w && i?.(), t.value = void 0;
	};
	return h(n, (e, s) => {
		if (!C) return;
		if (!e) {
			s && a();
			return;
		}
		t.value === void 0 && (t.value = document.body.style.overflow);
		let c = window.innerWidth - document.documentElement.clientWidth, l = {
			padding: c,
			margin: 0
		}, u = r.scrollBody?.value ? typeof r.scrollBody.value == "object" ? ge({
			padding: r.scrollBody.value.padding === !0 ? c : r.scrollBody.value.padding,
			margin: r.scrollBody.value.margin === !0 ? c : r.scrollBody.value.margin
		}, l) : l : {
			padding: 0,
			margin: 0
		};
		c > 0 && (document.body.style.paddingRight = typeof u.padding == "number" ? `${u.padding}px` : String(u.padding), document.body.style.marginRight = typeof u.margin == "number" ? `${u.margin}px` : String(u.margin), document.documentElement.style.setProperty("--scrollbar-width", `${c}px`), document.body.style.overflow = "hidden"), w && (i = ce(document, "touchmove", (e) => ye(e), { passive: !1 })), o(() => {
			n.value && (document.body.style.pointerEvents = "none", document.body.style.overflow = "hidden");
		});
	}, {
		immediate: !0,
		flush: "sync"
	}), e;
});
function ve(e) {
	let t = Math.random().toString(36).substring(2, 7), n = _e();
	n.value.set(t, e ?? !1);
	let r = x({
		get: () => n.value.get(t) ?? !1,
		set: (e) => n.value.set(t, e)
	});
	return se(() => {
		n.value.delete(t);
	}), r;
}
function F(e) {
	let t = window.getComputedStyle(e);
	if (t.overflowX === "scroll" || t.overflowY === "scroll" || t.overflowX === "auto" && e.clientWidth < e.scrollWidth || t.overflowY === "auto" && e.clientHeight < e.scrollHeight) return !0;
	{
		let t = e.parentNode;
		return !(t instanceof Element) || t.tagName === "BODY" ? !1 : F(t);
	}
}
function ye(e) {
	let t = e || window.event, n = t.target;
	return n instanceof Element && F(n) ? !1 : t.touches.length > 1 || (t.preventDefault && t.cancelable && t.preventDefault(), !1);
}
function I(e) {
	let t = c(), n = t?.type.emits, r = {};
	return n?.length || console.warn(`No emitted event found. Please check component: ${t?.type.__name}`), n?.forEach((t) => {
		r[d(_(t))] = (...n) => e(t, ...n);
	}), r;
}
function L() {
	let e = c(), t = v(), n = x(() => r());
	p(() => {
		n.value !== r() && ae(t);
	});
	function r() {
		return t.value && "$el" in t.value && ["#text", "#comment"].includes(t.value.$el.nodeName) ? t.value.$el.nextElementSibling : T(t);
	}
	let i = Object.assign({}, e.exposed), a = {};
	for (let t in e.props) Object.defineProperty(a, t, {
		enumerable: !0,
		configurable: !0,
		get: () => e.props[t]
	});
	if (Object.keys(i).length > 0) for (let e in i) Object.defineProperty(a, e, {
		enumerable: !0,
		configurable: !0,
		get: () => i[e]
	});
	Object.defineProperty(a, "$el", {
		enumerable: !0,
		configurable: !0,
		get: () => e.vnode.el
	}), e.exposed = a;
	function o(n) {
		if (t.value = n, n && (Object.defineProperty(a, "$el", {
			enumerable: !0,
			configurable: !0,
			get: () => n instanceof Element ? n : n.$el
		}), !(n instanceof Element) && !Object.hasOwn(n, "$el"))) {
			let t = n.$.exposed, r = Object.assign({}, a);
			for (let e in t) Object.defineProperty(r, e, {
				enumerable: !0,
				configurable: !0,
				get: () => t[e]
			});
			e.exposed = r;
		}
	}
	return {
		forwardRef: o,
		currentRef: t,
		currentElement: n
	};
}
function R(e) {
	let t = c(), n = Object.keys(t?.type.props ?? {}).reduce((e, n) => {
		let r = (t?.type.props[n]).default;
		return r !== void 0 && (e[n] = r), e;
	}, {}), r = ne(e);
	return x(() => {
		let e = {}, i = t?.vnode.props ?? {};
		return Object.keys(i).forEach((t) => {
			e[_(t)] = i[t];
		}), Object.keys({
			...n,
			...e
		}).reduce((e, t) => (r.value[t] !== void 0 && (e[t] = r.value[t]), e), {});
	});
}
function be(e, t) {
	let n = R(e), r = t ? I(t) : {};
	return x(() => ({
		...n.value,
		...r
	}));
}
var xe = function(e) {
	return typeof document > "u" ? null : (Array.isArray(e) ? e[0] : e).ownerDocument.body;
}, z = /* @__PURE__ */ new WeakMap(), B = /* @__PURE__ */ new WeakMap(), V = {}, H = 0, U = function(e) {
	return e && (e.host || U(e.parentNode));
}, Se = function(e, t) {
	return t.map(function(t) {
		if (e.contains(t)) return t;
		var n = U(t);
		return n && e.contains(n) ? n : (console.error("aria-hidden", t, "in not contained inside", e, ". Doing nothing"), null);
	}).filter(function(e) {
		return !!e;
	});
}, Ce = function(e, t, n, r) {
	var i = Se(t, Array.isArray(e) ? e : [e]);
	V[n] || (V[n] = /* @__PURE__ */ new WeakMap());
	var a = V[n], o = [], s = /* @__PURE__ */ new Set(), c = new Set(i), l = function(e) {
		e && !s.has(e) && (s.add(e), l(e.parentNode));
	};
	i.forEach(l);
	var u = function(e) {
		e && !c.has(e) && Array.prototype.forEach.call(e.children, function(e) {
			if (s.has(e)) u(e);
			else try {
				var t = e.getAttribute(r), i = t !== null && t !== "false", c = (z.get(e) || 0) + 1, l = (a.get(e) || 0) + 1;
				z.set(e, c), a.set(e, l), o.push(e), c === 1 && i && B.set(e, !0), l === 1 && e.setAttribute(n, "true"), i || e.setAttribute(r, "true");
			} catch (t) {
				console.error("aria-hidden: cannot operate on ", e, t);
			}
		});
	};
	return u(t), s.clear(), H++, function() {
		o.forEach(function(e) {
			var t = z.get(e) - 1, i = a.get(e) - 1;
			z.set(e, t), a.set(e, i), t || (B.has(e) || e.removeAttribute(r), B.delete(e)), i || e.removeAttribute(n);
		}), H--, H || (z = /* @__PURE__ */ new WeakMap(), z = /* @__PURE__ */ new WeakMap(), B = /* @__PURE__ */ new WeakMap(), V = {});
	};
}, we = function(e, t, n) {
	n === void 0 && (n = "data-aria-hidden");
	var r = Array.from(Array.isArray(e) ? e : [e]), i = t || xe(e);
	return i ? (r.push.apply(r, Array.from(i.querySelectorAll("[aria-live], script"))), Ce(r, i, n, "aria-hidden")) : function() {
		return null;
	};
};
function Te(e) {
	let n;
	h(() => T(e), (e) => {
		let t = !1;
		try {
			t = !!e?.closest("[popover]:not(:popover-open)");
		} catch {}
		e && !t ? n = we(e) : n && n();
	}), t(() => {
		n && n();
	});
}
var Ee = 0;
function De(e, t = "reka") {
	if (e) return e;
	let n, r = j({ useId: void 0 });
	return n = r.useId ? r.useId() : "useId" in ie ? m?.() : `${++Ee}`, t ? `${t}-${n}` : n;
}
function Oe(e, t) {
	let n = v(e);
	function r(e) {
		return t[n.value][e] ?? n.value;
	}
	return {
		state: n,
		dispatch: (e) => {
			n.value = r(e);
		}
	};
}
function ke(e, n) {
	let r = v({}), i = v("none"), a = v(e), s = e.value ? "mounted" : "unmounted", c, l = n.value?.ownerDocument.defaultView ?? de, { state: u, dispatch: d } = Oe(s, {
		mounted: {
			UNMOUNT: "unmounted",
			ANIMATION_OUT: "unmountSuspended"
		},
		unmountSuspended: {
			MOUNT: "mounted",
			ANIMATION_END: "unmounted"
		},
		unmounted: { MOUNT: "mounted" }
	}), f = (e) => {
		if (C) {
			let t = new CustomEvent(e, {
				bubbles: !1,
				cancelable: !1
			});
			n.value?.dispatchEvent(t);
		}
	};
	h(e, async (e, t) => {
		let a = t !== e;
		if (await o(), a) {
			let a = i.value, o = W(n.value);
			e ? (d("MOUNT"), f("enter"), o === "none" && f("after-enter")) : o === "none" || o === "undefined" || r.value?.display === "none" ? (d("UNMOUNT"), f("leave"), f("after-leave")) : t && a !== o ? (d("ANIMATION_OUT"), f("leave")) : (d("UNMOUNT"), f("after-leave"));
		}
	}, { immediate: !0 });
	let p = (e) => {
		if (e.target !== n.value) return;
		let t = W(n.value), r = t.includes(CSS.escape(e.animationName)), i = u.value === "mounted" ? "enter" : "leave";
		if (r && (f(`after-${i}`), d("ANIMATION_END"), !a.value)) {
			let e = n.value.style.animationFillMode;
			n.value.style.animationFillMode = "forwards", c = l?.setTimeout(() => {
				n.value?.style.animationFillMode === "forwards" && (n.value.style.animationFillMode = e);
			});
		}
		t === "none" && d("ANIMATION_END");
	}, m = (e) => {
		e.target === n.value && (i.value = W(n.value));
	}, g = h(n, (e, t) => {
		e ? (r.value = getComputedStyle(e), e.addEventListener("animationstart", m), e.addEventListener("animationcancel", p), e.addEventListener("animationend", p)) : (d("ANIMATION_END"), c !== void 0 && l?.clearTimeout(c), t?.removeEventListener("animationstart", m), t?.removeEventListener("animationcancel", p), t?.removeEventListener("animationend", p));
	}, { immediate: !0 }), _ = h(u, () => {
		let e = W(n.value);
		i.value = u.value === "mounted" ? e : "none";
	});
	return t(() => {
		g(), _(), n.value && (n.value.removeEventListener("animationstart", m), n.value.removeEventListener("animationcancel", p), n.value.removeEventListener("animationend", p)), c !== void 0 && l?.clearTimeout(c);
	}), { isPresent: x(() => ["mounted", "unmountSuspended"].includes(u.value)) };
}
function W(e) {
	return e && getComputedStyle(e).animationName || "none";
}
var Ae = /*#__PURE__*/ r({
	name: "Presence",
	props: {
		present: {
			type: Boolean,
			required: !0
		},
		forceMount: { type: Boolean }
	},
	slots: {},
	setup(t, { slots: n, expose: r }) {
		let { present: i, forceMount: a } = te(t), o = v(), { isPresent: s } = ke(i, o);
		r({ present: s });
		let l = n.default({ present: s.value });
		l = pe(l || []);
		let u = c();
		if (l && l?.length > 1) {
			let e = u?.parent?.type.name ? `<${u.parent.type.name} />` : "component";
			throw Error([
				`Detected an invalid children for \`${e}\` for  \`Presence\` component.`,
				"",
				"Note: Presence works similarly to `v-if` directly, but it waits for animation/transition to finished before unmounting. So it expect only one direct child of valid VNode type.",
				"You can apply a few solutions:",
				["Provide a single child element so that `presence` directive attach correctly.", "Ensure the first child is an actual element instead of a raw text node or comment node."].map((e) => `  - ${e}`).join("\n")
			].join("\n"));
		}
		return () => a.value || i.value || s.value ? e(n.default({ present: s.value })[0], { ref: (e) => {
			let t = T(e);
			return t?.hasAttribute === void 0 || (t?.hasAttribute("data-reka-popper-content-wrapper") ? o.value = t.firstElementChild : o.value = t), t;
		} }) : null;
	}
}), je = "dismissableLayer.pointerDownOutside", Me = "dismissableLayer.focusOutside";
function G(e, t) {
	if (!(t instanceof Element)) return !1;
	if (e.contains(t)) return !0;
	let n = t.closest("[data-dismissable-layer]"), r = e.dataset.dismissableLayer === "" ? e : e.querySelector("[data-dismissable-layer]"), i = Array.from(e.ownerDocument.querySelectorAll("[data-dismissable-layer]"));
	return !!(n && (r === n || i.indexOf(r) < i.indexOf(n)));
}
function Ne(e, t, n = !0) {
	let r = t?.value?.ownerDocument ?? globalThis?.document, i = v(!1), a = v(() => {});
	return l((o) => {
		if (!C || !g(n)) return;
		let s = async (n) => {
			let o = n.target;
			if (t?.value && o) {
				if (G(t.value, o)) {
					r.removeEventListener("click", a.value), i.value = !1;
					return;
				}
				if (n.target && !i.value) {
					let t = { originalEvent: n };
					function i() {
						k(je, e, t);
					}
					n.pointerType === "touch" ? (r.removeEventListener("click", a.value), a.value = i, r.addEventListener("click", a.value, { once: !0 })) : i();
				} else r.removeEventListener("click", a.value);
				i.value = !1;
			}
		}, c = window.setTimeout(() => {
			r.addEventListener("pointerdown", s);
		}, 0);
		o(() => {
			window.clearTimeout(c), r.removeEventListener("pointerdown", s), r.removeEventListener("click", a.value);
		});
	}), { onPointerDownCapture: () => {
		g(n) && (i.value = !0);
	} };
}
function Pe(e, t, n = !0) {
	let r = t?.value?.ownerDocument ?? globalThis?.document, i = v(!1);
	return l((a) => {
		if (!C || !g(n)) return;
		let s = async (n) => {
			if (!t?.value) return;
			await o(), await o();
			let r = n.target;
			t.value && r && !G(t.value, r) && n.target && !i.value && k(Me, e, { originalEvent: n });
		};
		r.addEventListener("focusin", s), a(() => r.removeEventListener("focusin", s));
	}), {
		onFocusCapture: () => {
			g(n) && (i.value = !0);
		},
		onBlurCapture: () => {
			g(n) && (i.value = !1);
		}
	};
}
var Fe = /* @__PURE__ */ r({
	__name: "DismissableLayer",
	props: {
		disableOutsidePointerEvents: {
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
		},
		present: {
			type: Boolean,
			required: !1,
			default: !0
		}
	},
	emits: [
		"escapeKeyDown",
		"pointerDownOutside",
		"focusOutside",
		"interactOutside",
		"dismiss"
	],
	setup(e, { emit: t }) {
		let r = e, s = t, { forwardRef: c, currentElement: u } = L(), d = x(() => u.value?.ownerDocument ?? globalThis.document), f = x(() => M.layersRoot), p = x(() => u.value ? Array.from(f.value).indexOf(u.value) : -1), m = x(() => M.layersWithOutsidePointerEventsDisabled.size > 0), g = x(() => {
			let e = Array.from(f.value), [t] = [...M.layersWithOutsidePointerEventsDisabled].slice(-1), n = e.indexOf(t);
			return p.value >= n;
		}), _ = Ne(async (e) => {
			let t = [...M.branches].some((t) => t?.contains(e.target));
			r.present && g.value && !t && (s("pointerDownOutside", e), s("interactOutside", e), await o(), e.defaultPrevented || s("dismiss"));
		}, u, () => r.present), v = Pe((e) => {
			let t = [...M.branches].some((t) => t?.contains(e.target));
			r.present && !t && (s("focusOutside", e), s("interactOutside", e), e.defaultPrevented || s("dismiss"));
		}, u);
		return ue("Escape", (e) => {
			r.present && p.value === f.value.size - 1 && (s("escapeKeyDown", e), e.defaultPrevented || s("dismiss"));
		}), h([
			u,
			() => r.disableOutsidePointerEvents,
			() => r.present
		], ([e, t, n], r, i) => {
			e && n && t && (M.layersWithOutsidePointerEventsDisabled.size === 0 && (M.originalBodyPointerEvents = d.value.body.style.pointerEvents, d.value.body.style.pointerEvents = "none"), M.layersWithOutsidePointerEventsDisabled.add(e), i(() => {
				M.layersWithOutsidePointerEventsDisabled.delete(e), M.layersWithOutsidePointerEventsDisabled.size === 0 && !A(M.originalBodyPointerEvents) && (d.value.body.style.pointerEvents = M.originalBodyPointerEvents);
			}));
		}, { immediate: !0 }), h([u, () => r.present], ([e, t], n, r) => {
			e && t && (f.value.add(e), r(() => {
				f.value.delete(e);
			}));
		}, { immediate: !0 }), l((e) => {
			e(() => {
				u.value && (f.value.delete(u.value), M.layersWithOutsidePointerEventsDisabled.delete(u.value));
			});
		}), (e, t) => (a(), b(S(E), {
			ref: S(c),
			"as-child": e.asChild,
			as: e.as,
			"data-dismissable-layer": "",
			style: n({ pointerEvents: m.value ? g.value ? "auto" : "none" : void 0 }),
			onFocusCapture: S(v).onFocusCapture,
			onBlurCapture: S(v).onBlurCapture,
			onPointerdownCapture: S(_).onPointerDownCapture
		}, {
			default: y(() => [i(e.$slots, "default")]),
			_: 3
		}, 8, [
			"as-child",
			"as",
			"style",
			"onFocusCapture",
			"onBlurCapture",
			"onPointerdownCapture"
		]));
	}
}), Ie = le(() => v([]));
function Le() {
	let e = Ie();
	return {
		add(t) {
			let n = e.value[0];
			t !== n && n?.pause(), e.value = K(e.value, t), e.value.unshift(t);
		},
		remove(t) {
			e.value = K(e.value, t), e.value[0]?.resume();
		}
	};
}
function K(e, t) {
	let n = [...e], r = n.indexOf(t);
	return r !== -1 && n.splice(r, 1), n;
}
var q = "focusScope.autoFocusOnMount", J = "focusScope.autoFocusOnUnmount", Y = {
	bubbles: !1,
	cancelable: !0
};
function Re(e, { select: t = !1 } = {}) {
	let n = O();
	for (let r of e) if (Q(r, { select: t }), O() !== n) return !0;
}
function ze(e) {
	let t = X(e);
	return [Z(t, e), Z(t.reverse(), e)];
}
function X(e) {
	let t = [], n = document.createTreeWalker(e, NodeFilter.SHOW_ELEMENT, { acceptNode: (e) => {
		let t = e.tagName === "INPUT" && e.type === "hidden";
		return e.disabled || e.hidden || t ? NodeFilter.FILTER_SKIP : e.tabIndex >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
	} });
	for (; n.nextNode();) t.push(n.currentNode);
	return t;
}
function Z(e, t) {
	for (let n of e) if (!Be(n, { upTo: t })) return n;
}
function Be(e, { upTo: t }) {
	if (getComputedStyle(e).visibility === "hidden") return !0;
	for (; e;) {
		if (t !== void 0 && e === t) return !1;
		if (getComputedStyle(e).display === "none") return !0;
		e = e.parentElement;
	}
	return !1;
}
function Ve(e) {
	return e instanceof HTMLInputElement && "select" in e;
}
function Q(e, { select: t = !1 } = {}) {
	if (e && e.focus) {
		let n = O();
		e.focus({ preventScroll: !0 }), e !== n && Ve(e) && t && e.select();
	}
}
var He = /* @__PURE__ */ r({
	__name: "FocusScope",
	props: {
		loop: {
			type: Boolean,
			required: !1,
			default: !1
		},
		trapped: {
			type: Boolean,
			required: !1,
			default: !1
		},
		present: {
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
		}
	},
	emits: ["mountAutoFocus", "unmountAutoFocus"],
	setup(e, { emit: t }) {
		let n = e, r = t, { currentRef: s, currentElement: c } = L(), u = v(null), d = Le(), f = /*#__PURE__*/ re({
			paused: !1,
			pause() {
				this.paused = !0;
			},
			resume() {
				this.paused = !1;
			}
		});
		l((e) => {
			if (!C) return;
			let t = c.value;
			if (!n.trapped) return;
			function r(e) {
				if (f.paused || !t) return;
				let n = e.target;
				t.contains(n) ? u.value = n : Q(u.value, { select: !0 });
			}
			function i(e) {
				if (f.paused || !t) return;
				let n = e.relatedTarget;
				n !== null && (t.contains(n) || Q(u.value, { select: !0 }));
			}
			function a(e) {
				let n = u.value;
				if (n === null || !e.some((e) => e.removedNodes.length > 0)) return;
				let r = O();
				r && t.contains(r) || t.contains(n) || Q(t);
			}
			document.addEventListener("focusin", r), document.addEventListener("focusout", i);
			let o = new MutationObserver(a);
			t && o.observe(t, {
				childList: !0,
				subtree: !0
			}), e(() => {
				document.removeEventListener("focusin", r), document.removeEventListener("focusout", i), o.disconnect();
			});
		});
		function p(e, t) {
			let n = new CustomEvent(q, Y), i = (e) => r("mountAutoFocus", e);
			e.addEventListener(q, i), e.dispatchEvent(n), e.removeEventListener(q, i), n.defaultPrevented || (Re(X(e), { select: !0 }), O() === t && Q(e));
		}
		l(async (e) => {
			let t = c.value;
			if (await o(), !t) return;
			n.present !== !1 && d.add(f);
			let i = O();
			!t.contains(i) && n.present !== !1 && p(t, i), e(() => {
				let e = new CustomEvent(J, Y), n = (e) => {
					r("unmountAutoFocus", e);
				};
				t.addEventListener(J, n), t.dispatchEvent(e), t.setAttribute("data-focus-scope-unmounting", ""), setTimeout(() => {
					e.defaultPrevented || Q(i ?? document.body, { select: !0 }), t.removeEventListener(J, n), d.remove(f), t.removeAttribute("data-focus-scope-unmounting");
				}, 0);
			});
		}), h(() => n.present, async (e, t) => {
			if (!C) return;
			if (e === !1 && t === !0) {
				d.remove(f);
				return;
			}
			if (e !== !0 || t !== !1) return;
			d.add(f), await o();
			let n = c.value;
			if (!n) return;
			let r = O();
			n.contains(r) || p(n, r);
		});
		function m(e) {
			if (!n.loop && !n.trapped || f.paused) return;
			let t = e.key === "Tab" && !e.altKey && !e.ctrlKey && !e.metaKey, r = O();
			if (t && r) {
				let t = e.currentTarget, [i, a] = ze(t);
				i && a ? !e.shiftKey && r === a ? (e.preventDefault(), n.loop && Q(i, { select: !0 })) : e.shiftKey && r === i && (e.preventDefault(), n.loop && Q(a, { select: !0 })) : r === t && e.preventDefault();
			}
		}
		return (e, t) => (a(), b(S(E), {
			ref_key: "currentRef",
			ref: s,
			tabindex: "-1",
			"as-child": e.asChild,
			as: e.as,
			onKeydown: m
		}, {
			default: y(() => [i(e.$slots, "default")]),
			_: 3
		}, 8, ["as-child", "as"]));
	}
}), Ue = "menu.itemSelect", $ = ["Enter", " "], We = [
	"ArrowDown",
	"PageUp",
	"Home"
], Ge = [
	"ArrowUp",
	"PageDown",
	"End"
], Ke = [...We, ...Ge], qe = {
	ltr: [...$, "ArrowRight"],
	rtl: [...$, "ArrowLeft"]
}, Je = {
	ltr: ["ArrowLeft"],
	rtl: ["ArrowRight"]
};
function Ye(e) {
	return e ? "open" : "closed";
}
function Xe(e) {
	let t = O();
	for (let n of e) if (n === t || (n.focus(), O() !== t)) return;
}
function Ze(e, t) {
	let { x: n, y: r } = e, i = !1;
	for (let e = 0, a = t.length - 1; e < t.length; a = e++) {
		let o = t[e].x, s = t[e].y, c = t[a].x, l = t[a].y;
		s > r != l > r && n < (c - o) * (r - s) / (l - s) + o && (i = !i);
	}
	return i;
}
function Qe(e, t) {
	return t ? Ze({
		x: e.clientX,
		y: e.clientY
	}, t) : !1;
}
function $e(e) {
	return e.pointerType === "mouse";
}
var et = /* @__PURE__ */ r({
	__name: "Teleport",
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
		let t = e, n = j({}), r = x(() => t.to ?? n.teleportTo?.value ?? "body"), o = oe();
		return (e, t) => S(o) || e.forceMount ? (a(), b(ee, {
			key: 0,
			to: r.value,
			disabled: e.disabled,
			defer: e.defer
		}, [i(e.$slots, "default")], 8, [
			"to",
			"disabled",
			"defer"
		])) : u("v-if", !0);
	}
});
export { A as C, D as E, j as S, O as T, be as _, $ as a, I as b, Xe as c, Qe as d, He as f, Te as g, De as h, Ge as i, Ye as l, Ae as m, Ke as n, Je as o, Fe as p, Ue as r, qe as s, et as t, $e as u, R as v, k as w, ve as x, L as y };
