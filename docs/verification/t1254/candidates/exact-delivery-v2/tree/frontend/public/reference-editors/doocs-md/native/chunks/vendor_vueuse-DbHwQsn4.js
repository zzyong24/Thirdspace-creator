import { I as e, M as t, O as n, Q as r, R as i, Z as a, _t as o, at as s, ct as c, dt as l, ft as u, ht as d, it as f, j as p, lt as m, ot as h, pt as g, rt as _, ut as v, y, yt as b, z as x } from "./vendor_vue-OlfIOlFg.js";
function S(e, t) {
	return s() ? (c(e, t), !0) : !1;
}
var C = /* @__PURE__ */ new WeakMap(), w = /* @__NO_SIDE_EFFECTS__ */ (...e) => {
	let r = e[0], i = n()?.proxy ?? s();
	if (i == null && !p()) throw Error("injectLocal must be called in setup");
	return i && C.has(i) && r in C.get(i) ? C.get(i)[r] : t(...e);
}, T = typeof window < "u" && typeof document < "u";
typeof WorkerGlobalScope < "u" && globalThis instanceof WorkerGlobalScope;
var E = (e) => e !== void 0, D = Object.prototype.toString, O = (e) => D.call(e) === "[object Object]", k = () => {};
function A(...e) {
	if (e.length !== 1) return d(...e);
	let t = e[0];
	return typeof t == "function" ? v(_(() => ({
		get: t,
		set: k
	}))) : l(t);
}
function j(e, t) {
	function n(...n) {
		return new Promise((r, i) => {
			Promise.resolve(e(() => t.apply(this, n), {
				fn: t,
				thisArg: this,
				args: n
			})).then(r).catch(i);
		});
	}
	return "cancel" in e && Object.assign(n, {
		cancel: e.cancel,
		flush: e.flush,
		isPending: e.isPending
	}), n;
}
var M = (e) => e();
function ee(e, t = {}) {
	let n, r, i = k, a = k, s = g(!1), c = (e) => {
		clearTimeout(e), i(), i = k;
	}, l;
	return Object.assign((u) => {
		let d = o(e), f = o(t.maxWait);
		return n && c(n), d <= 0 || f !== void 0 && f <= 0 ? (r &&= (c(r), void 0), s.value = !1, Promise.resolve(u())) : (s.value = !0, new Promise((e, o) => {
			i = t.rejectOnCancel ? o : e, a = e, l = u, f && !r && (r = setTimeout(() => {
				n && c(n), r = void 0, s.value = !1, e(l());
			}, f)), n = setTimeout(() => {
				r && c(r), r = void 0, s.value = !1, e(u());
			}, d);
		}));
	}, {
		cancel: () => {
			n &&= (c(n), void 0), r &&= (c(r), void 0), s.value = !1, a = k;
		},
		flush: () => {
			if (s.value) {
				n &&= (clearTimeout(n), void 0), r &&= (clearTimeout(r), void 0), s.value = !1;
				let e = a;
				i = k, a = k, e(l());
			}
		},
		isPending: u(s)
	});
}
function te(...e) {
	let t = 0, n, r = !0, i = k, a, s, c, l, u;
	!h(e[0]) && typeof e[0] == "object" ? {delay: s, trailing: c = !0, leading: l = !0, rejectOnCancel: u = !1} = e[0] : [s, c = !0, l = !0, u = !1] = e;
	let d = () => {
		n && (clearTimeout(n), n = void 0, i(), i = k);
	};
	return (e) => {
		let f = o(s), p = Date.now() - t, m = () => a = e();
		return d(), f <= 0 ? (t = Date.now(), m()) : (p > f ? (t = Date.now(), (l || !r) && m()) : c && (a = new Promise((e, a) => {
			i = u ? a : e, n = setTimeout(() => {
				t = Date.now(), r = !0, e(m()), d();
			}, Math.max(0, f - p));
		})), !l && !n && (n = setTimeout(() => r = !0, f)), r = !1, a);
	};
}
function ne(e = M, t = {}) {
	let { initialState: n = "active" } = t, r = A(n === "active");
	function i() {
		r.value = !1;
	}
	function a() {
		r.value = !0;
	}
	return {
		isActive: u(r),
		pause: i,
		resume: a,
		eventFilter: (...t) => {
			r.value && e(...t);
		}
	};
}
function N(e) {
	return e.endsWith("rem") ? Number.parseFloat(e) * 16 : Number.parseFloat(e);
}
function P(e) {
	return Array.isArray(e) ? e : [e];
}
function re(e) {
	return e || n();
}
function ie(e, t = 200, n = {}) {
	return j(ee(t, n), e);
}
function ae(e, t = 200, n = !0, r = !0, i = !1) {
	return j(te(t, n, r, i), e);
}
function oe(e, t, n = {}) {
	let { eventFilter: r = M, ...i } = n;
	return a(e, j(r, t), i);
}
function se(e, t, n = {}) {
	let { eventFilter: r, initialState: i = "active", ...a } = n, { eventFilter: o, pause: s, resume: c, isActive: l } = ne(r, { initialState: i });
	return {
		stop: oe(e, t, {
			...a,
			eventFilter: o
		}),
		pause: s,
		resume: c,
		isActive: l
	};
}
function F(t, n = !0, r) {
	re(r) ? x(t, r) : n ? t() : e(t);
}
function ce(e = !1, t = {}) {
	let { truthyValue: n = !0, falsyValue: r = !1 } = t, i = h(e), a = g(e);
	function s(e) {
		if (arguments.length) return a.value = e, a.value;
		{
			let e = o(n);
			return a.value = a.value === e ? o(r) : e, a.value;
		}
	}
	return i ? s : [a, s];
}
function le(e, t, n) {
	return a(e, t, {
		...n,
		immediate: !0
	});
}
var I = T ? window : void 0;
T && window.document, T && window.navigator, T && window.location;
function L(e) {
	let t = o(e);
	return t?.$el ?? t;
}
function R(...e) {
	let t = (e, t, n, r) => (e.addEventListener(t, n, r), () => e.removeEventListener(t, n, r)), n = y(() => {
		let t = P(o(e[0])).filter((e) => e != null);
		return t.every((e) => typeof e != "string") ? t : void 0;
	});
	return le(() => [
		n.value?.map((e) => L(e)) ?? [I].filter((e) => e != null),
		P(o(n.value ? e[1] : e[0])),
		P(b(n.value ? e[2] : e[1])),
		o(n.value ? e[3] : e[2])
	], ([e, n, r, i], a, o) => {
		if (!e?.length || !n?.length || !r?.length) return;
		let s = O(i) ? { ...i } : i, c = e.flatMap((e) => n.flatMap((n) => r.map((r) => t(e, n, r, s))));
		o(() => {
			c.forEach((e) => e());
		});
	}, { flush: "post" });
}
function ue() {
	let e = g(!1), t = n();
	return t && x(() => {
		e.value = !0;
	}, t), e;
}
/* @__NO_SIDE_EFFECTS__ */
function z(e) {
	let t = ue();
	return y(() => (t.value, !!e()));
}
var de = Symbol("vueuse-ssr-width");
/* @__NO_SIDE_EFFECTS__ */
function fe() {
	let e = p() ? /* @__PURE__ */ w(de, null) : null;
	return typeof e == "number" ? e : void 0;
}
function B(e, t = {}) {
	let { window: n = I, ssrWidth: i = /* @__PURE__ */ fe() } = t, a = /* @__PURE__ */ z(() => n && "matchMedia" in n && typeof n.matchMedia == "function"), s = g(typeof i == "number"), c = g(), l = g(!1);
	return r(() => {
		if (s.value) {
			s.value = !a.value;
			let t = o(e).split(",");
			l.value = t.some((e) => {
				let t = e.includes("not all"), n = e.match(/\(\s*min-width:\s*(-?\d+(?:\.\d*)?[a-z]+\s*)\)/), r = e.match(/\(\s*max-width:\s*(-?\d+(?:\.\d*)?[a-z]+\s*)\)/), a = !!(n || r);
				return n && a && (a = i >= N(n[1])), r && a && (a = i <= N(r[1])), t ? !a : a;
			});
			return;
		}
		a.value && (c.value = n.matchMedia(o(e)), l.value = c.value.matches);
	}), R(c, "change", (e) => {
		l.value = e.matches;
	}, { passive: !0 }), y(() => l.value);
}
function V(e) {
	return JSON.parse(JSON.stringify(e));
}
var H = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {}, U = "__vueuse_ssr_handlers__", pe = /* #__PURE__ */ me();
function me() {
	return U in H || (H[U] = H[U] || {}), H[U];
}
function W(e, t) {
	return pe[e] || t;
}
function he(e) {
	return B("(prefers-color-scheme: dark)", e);
}
function ge(e) {
	return e == null ? "any" : e instanceof Set ? "set" : e instanceof Map ? "map" : e instanceof Date ? "date" : typeof e == "boolean" ? "boolean" : typeof e == "string" ? "string" : typeof e == "object" ? "object" : Number.isNaN(e) ? "any" : "number";
}
var _e = {
	boolean: {
		read: (e) => e === "true",
		write: (e) => String(e)
	},
	object: {
		read: (e) => JSON.parse(e),
		write: (e) => JSON.stringify(e)
	},
	number: {
		read: (e) => Number.parseFloat(e),
		write: (e) => String(e)
	},
	any: {
		read: (e) => e,
		write: (e) => String(e)
	},
	string: {
		read: (e) => e,
		write: (e) => String(e)
	},
	map: {
		read: (e) => new Map(JSON.parse(e)),
		write: (e) => JSON.stringify(Array.from(e.entries()))
	},
	set: {
		read: (e) => new Set(JSON.parse(e)),
		write: (e) => JSON.stringify(Array.from(e))
	},
	date: {
		read: (e) => new Date(e),
		write: (e) => e.toISOString()
	}
}, G = "vueuse-storage";
function ve(t, n, r, i = {}) {
	let { flush: s = "pre", deep: c = !0, listenToStorageChanges: u = !0, writeDefaults: d = !0, mergeDefaults: f = !1, shallow: p, window: m = I, eventFilter: h, onError: _ = (e) => {
		console.error(e);
	}, initOnMounted: v } = i, b = (p ? g : l)(typeof n == "function" ? n() : n), x = y(() => o(t));
	if (!r) try {
		r = W("getDefaultStorage", () => I?.localStorage)();
	} catch (e) {
		_(e);
	}
	if (!r) return b;
	let S = o(n), C = ge(S), w = i.serializer ?? _e[C], { pause: T, resume: E } = se(b, (e) => k(e), {
		flush: s,
		deep: c,
		eventFilter: h
	});
	a(x, () => j(), { flush: s });
	let D = !1;
	m && u && (r instanceof Storage ? R(m, "storage", (e) => {
		(!v || D) && j(e);
	}, { passive: !0 }) : R(m, G, (e) => {
		(!v || D) && M(e);
	})), v ? F(() => {
		D = !0, j();
	}) : j();
	function O(e, t) {
		if (m) {
			let n = {
				key: x.value,
				oldValue: e,
				newValue: t,
				storageArea: r
			};
			m.dispatchEvent(r instanceof Storage ? new StorageEvent("storage", n) : new CustomEvent(G, { detail: n }));
		}
	}
	function k(e) {
		try {
			let t = r.getItem(x.value);
			if (e == null) O(t, null), r.removeItem(x.value);
			else {
				let n = w.write(e);
				t !== n && (r.setItem(x.value, n), O(t, n));
			}
		} catch (e) {
			_(e);
		}
	}
	function A(e) {
		let t = e ? e.newValue : r.getItem(x.value);
		if (t == null) return d && S != null && r.setItem(x.value, w.write(S)), S;
		if (!e && f) {
			let e = w.read(t);
			return typeof f == "function" ? f(e, S) : C === "object" && !Array.isArray(e) ? {
				...S,
				...e
			} : e;
		}
		return typeof t == "string" ? w.read(t) : t;
	}
	function j(t) {
		if (!(t && t.storageArea !== r)) {
			if (t && t.key == null) {
				b.value = S;
				return;
			}
			if (!(t && t.key !== x.value)) {
				T();
				try {
					let e = w.write(b.value);
					(t === void 0 || t?.newValue !== e) && (b.value = A(t));
				} catch (e) {
					_(e);
				} finally {
					t ? e(E) : E();
				}
			}
		}
	}
	function M(e) {
		j(e.detail);
	}
	return b;
}
var ye = "*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}";
function be(e = {}) {
	let { selector: t = "html", attribute: n = "class", initialValue: r = "auto", window: i = I, storage: o, storageKey: s = "vueuse-color-scheme", listenToStorageChanges: c = !0, storageRef: l, emitAuto: u, disableTransition: d = !0 } = e, f = {
		auto: "",
		light: "light",
		dark: "dark",
		...e.modes || {}
	}, p = he({ window: i }), m = y(() => p.value ? "dark" : "light"), h = l || (s == null ? A(r) : ve(s, r, o, {
		window: i,
		listenToStorageChanges: c
	})), g = y(() => h.value === "auto" ? m.value : h.value), _ = W("updateHTMLAttrs", (e, t, n) => {
		let r = typeof e == "string" ? i?.document.querySelector(e) : L(e);
		if (!r) return;
		let a = /* @__PURE__ */ new Set(), o = /* @__PURE__ */ new Set(), s = null;
		if (t === "class") {
			let e = n.split(/\s/g);
			Object.values(f).flatMap((e) => (e || "").split(/\s/g)).filter(Boolean).forEach((t) => {
				e.includes(t) ? a.add(t) : o.add(t);
			});
		} else s = {
			key: t,
			value: n
		};
		if (a.size === 0 && o.size === 0 && s === null) return;
		let c;
		d && (c = i.document.createElement("style"), c.appendChild(document.createTextNode(ye)), i.document.head.appendChild(c));
		for (let e of a) r.classList.add(e);
		for (let e of o) r.classList.remove(e);
		s && r.setAttribute(s.key, s.value), d && (i.getComputedStyle(c).opacity, document.head.removeChild(c));
	});
	function v(e) {
		_(t, n, f[e] ?? e);
	}
	function b(t) {
		e.onChanged ? e.onChanged(t, v) : v(t);
	}
	a(g, b, {
		flush: "post",
		immediate: !0
	}), F(() => b(g.value));
	let x = y({
		get() {
			return u ? h.value : g.value;
		},
		set(e) {
			h.value = e;
		}
	});
	return Object.assign(x, {
		store: h,
		system: m,
		state: g
	});
}
function K(e = {}) {
	let { valueDark: t = "dark", valueLight: n = "" } = e, r = be({
		...e,
		onChanged: (t, n) => {
			var r;
			e.onChanged ? (r = e.onChanged) == null || r.call(e, t === "dark", n, t) : n(t);
		},
		modes: {
			dark: t,
			light: n
		}
	}), i = y(() => r.system.value);
	return y({
		get() {
			return r.value === "dark";
		},
		set(e) {
			let t = e ? "dark" : "light";
			i.value === t ? r.value = "auto" : r.value = t;
		}
	});
}
function xe(e, t, n = {}) {
	let { window: r = I, ...i } = n, s, c = /* @__PURE__ */ z(() => r && "ResizeObserver" in r), l = () => {
		s &&= (s.disconnect(), void 0);
	}, u = y(() => {
		let t = o(e);
		return Array.isArray(t) ? t.map((e) => L(e)) : [L(t)];
	}), d = a(u, (e) => {
		if (l(), c.value && r) {
			s = new ResizeObserver(t);
			for (let t of e) t instanceof Element && s.observe(t, i);
		}
	}, {
		immediate: !0,
		flush: "post"
	}), f = () => {
		l(), d();
	};
	return S(f), {
		isSupported: c,
		stop: f
	};
}
function Se(e, t = {
	width: 0,
	height: 0
}, n = {}) {
	let { window: r = I, box: i = "content-box" } = n, o = y(() => {
		var t;
		return (t = L(e)) == null || (t = t.namespaceURI) == null ? void 0 : t.includes("svg");
	}), s = g(t.width), c = g(t.height), { stop: l } = xe(e, ([t]) => {
		let n = i === "border-box" ? t.borderBoxSize : i === "content-box" ? t.contentBoxSize : t.devicePixelContentBoxSize;
		if (r && o.value) {
			let t = L(e);
			if (t) {
				let e = t.getBoundingClientRect();
				s.value = e.width, c.value = e.height;
			}
		} else if (n) {
			let e = P(n);
			s.value = e.reduce((e, { inlineSize: t }) => e + t, 0), c.value = e.reduce((e, { blockSize: t }) => e + t, 0);
		} else s.value = t.contentRect.width, c.value = t.contentRect.height;
	}, n);
	F(() => {
		let n = L(e);
		if (n && "offsetWidth" in n) {
			if (i === "content-box" && r) {
				let e = r.getComputedStyle(n), t = Number.parseFloat(e.paddingLeft) + Number.parseFloat(e.paddingRight), i = Number.parseFloat(e.paddingTop) + Number.parseFloat(e.paddingBottom), a = Number.parseFloat(e.borderLeftWidth) + Number.parseFloat(e.borderRightWidth), o = Number.parseFloat(e.borderTopWidth) + Number.parseFloat(e.borderBottomWidth);
				s.value = n.offsetWidth - t - a, c.value = n.offsetHeight - i - o;
			} else s.value = n.offsetWidth, c.value = n.offsetHeight;
		} else n && (s.value = t.width, c.value = t.height);
	});
	let u = a(() => L(e), (e) => {
		s.value = e ? t.width : 0, c.value = e ? t.height : 0;
	});
	function d() {
		l(), u();
	}
	return {
		width: s,
		height: c,
		stop: d
	};
}
/* @__NO_SIDE_EFFECTS__ */
function Ce(t, r, i, o = {}) {
	var s, c;
	let { clone: u = !1, passive: d = !1, eventName: f, deep: p = !1, defaultValue: m, shouldEmit: h } = o, g = n(), _ = i || g?.emit || (g == null || (s = g.$emit) == null ? void 0 : s.bind(g)) || (g == null || (c = g.proxy) == null || (c = c.$emit) == null ? void 0 : c.bind(g?.proxy)), v = f;
	r ||= "modelValue", v ||= `update:${r.toString()}`;
	let b = (e) => u ? typeof u == "function" ? u(e) : V(e) : e, x = () => E(t[r]) ? b(t[r]) : m, S = (e) => {
		h ? h(e) && _(v, e) : _(v, e);
	};
	if (d) {
		let n = x(), i = l(n), o = !1;
		return a(() => t[r], (t) => {
			o || (o = !0, i.value = b(t), e(() => o = !1));
		}), a(i, (e) => {
			!o && (e !== t[r] || p) && S(e);
		}, { deep: p }), i;
	}
	return y({
		get() {
			return x();
		},
		set(e) {
			S(e);
		}
	});
}
function q(e, t) {
	return s() ? (c(e, t), !0) : !1;
}
function we() {
	let e = /* @__PURE__ */ new Set(), t = (t) => {
		e.delete(t);
	};
	return {
		on: (n) => {
			e.add(n);
			let r = () => t(n);
			return q(r), { off: r };
		},
		off: t,
		trigger: (...t) => Promise.all(Array.from(e).map((e) => e(...t))),
		clear: () => {
			e.clear();
		}
	};
}
function Te(e) {
	let t = !1, n, r = f(!0);
	return ((...i) => (t ||= (n = r.run(() => e(...i)), !0), n));
}
var J = typeof window < "u" && typeof document < "u";
typeof WorkerGlobalScope < "u" && globalThis instanceof WorkerGlobalScope;
var Ee = (e) => e !== void 0, De = Object.prototype.toString, Oe = (e) => De.call(e) === "[object Object]", ke = /* #__PURE__ */ Ae();
function Ae() {
	var e, t;
	return J && !!((e = window) != null && (e = e.navigator) != null && e.userAgent) && (/iP(?:ad|hone|od)/.test(window.navigator.userAgent) || ((t = window) == null || (t = t.navigator) == null ? void 0 : t.maxTouchPoints) > 2 && /iPad|Macintosh/.test(window?.navigator.userAgent));
}
function Y(e) {
	return Array.isArray(e) ? e : [e];
}
function je(e) {
	return e || n();
}
function Me(e) {
	if (!J) return e;
	let t = 0, n, r, i = () => {
		--t, r && t <= 0 && (r.stop(), n = void 0, r = void 0);
	};
	return ((...a) => (t += 1, r || (r = f(!0), n = r.run(() => e(...a))), q(i), n));
}
function Ne(e) {
	return h(e) ? m(new Proxy({}, {
		get(t, n, r) {
			return b(Reflect.get(e.value, n, r));
		},
		set(t, n, r) {
			return h(e.value[n]) && !h(r) ? e.value[n].value = r : e.value[n] = r, !0;
		},
		deleteProperty(t, n) {
			return Reflect.deleteProperty(e.value, n);
		},
		has(t, n) {
			return Reflect.has(e.value, n);
		},
		ownKeys() {
			return Object.keys(e.value);
		},
		getOwnPropertyDescriptor() {
			return {
				enumerable: !0,
				configurable: !0
			};
		}
	})) : m(e);
}
function Pe(e) {
	return Ne(y(e));
}
function Fe(e, t = 1e4) {
	return _((n, r) => {
		let i = o(e), a, s = () => setTimeout(() => {
			i = o(e), r();
		}, o(t));
		return q(() => {
			clearTimeout(a);
		}), {
			get() {
				return n(), i;
			},
			set(e) {
				i = e, r(), clearTimeout(a), a = s();
			}
		};
	});
}
function Ie(e, t) {
	je(t) && i(e, t);
}
function Le(e, t, n) {
	return a(e, t, {
		...n,
		immediate: !0
	});
}
var X = J ? window : void 0;
J && window.document, J && window.navigator, J && window.location;
function Z(e) {
	let t = o(e);
	return t?.$el ?? t;
}
function Q(...e) {
	let t = (e, t, n, r) => (e.addEventListener(t, n, r), () => e.removeEventListener(t, n, r)), n = y(() => {
		let t = Y(o(e[0])).filter((e) => e != null);
		return t.every((e) => typeof e != "string") ? t : void 0;
	});
	return Le(() => [
		n.value?.map((e) => Z(e)) ?? [X].filter((e) => e != null),
		Y(o(n.value ? e[1] : e[0])),
		Y(b(n.value ? e[2] : e[1])),
		o(n.value ? e[3] : e[2])
	], ([e, n, r, i], a, o) => {
		if (!e?.length || !n?.length || !r?.length) return;
		let s = Oe(i) ? { ...i } : i, c = e.flatMap((e) => n.flatMap((n) => r.map((r) => t(e, n, r, s))));
		o(() => {
			c.forEach((e) => e());
		});
	}, { flush: "post" });
}
function $() {
	let e = g(!1), t = n();
	return t && x(() => {
		e.value = !0;
	}, t), e;
}
/* @__NO_SIDE_EFFECTS__ */
function Re(e) {
	let t = $();
	return y(() => (t.value, !!e()));
}
function ze(e) {
	return typeof e == "function" ? e : typeof e == "string" ? (t) => t.key === e : Array.isArray(e) ? (t) => e.includes(t.key) : () => !0;
}
function Be(...e) {
	let t, n, r = {};
	e.length === 3 ? (t = e[0], n = e[1], r = e[2]) : e.length === 2 ? typeof e[1] == "object" ? (t = !0, n = e[0], r = e[1]) : (t = e[0], n = e[1]) : (t = !0, n = e[0]);
	let { target: i = X, eventName: a = "keydown", passive: s = !1, dedupe: c = !1 } = r, l = ze(t);
	return Q(i, a, (e) => {
		e.repeat && o(c) || l(e) && n(e);
	}, s);
}
function Ve(e) {
	return JSON.parse(JSON.stringify(e));
}
function He(e, t, n = {}) {
	let { window: r = X, ...i } = n, s, c = /* @__PURE__ */ Re(() => r && "ResizeObserver" in r), l = () => {
		s &&= (s.disconnect(), void 0);
	}, u = a(y(() => {
		let t = o(e);
		return Array.isArray(t) ? t.map((e) => Z(e)) : [Z(t)];
	}), (e) => {
		if (l(), c.value && r) {
			s = new ResizeObserver(t);
			for (let t of e) t && s.observe(t, i);
		}
	}, {
		immediate: !0,
		flush: "post"
	}), d = () => {
		l(), u();
	};
	return q(d), {
		isSupported: c,
		stop: d
	};
}
function Ue(t, r, i, o = {}) {
	var s, c;
	let { clone: u = !1, passive: d = !1, eventName: f, deep: p = !1, defaultValue: m, shouldEmit: h } = o, g = n(), _ = i || g?.emit || (g == null || (s = g.$emit) == null ? void 0 : s.bind(g)) || (g == null || (c = g.proxy) == null || (c = c.$emit) == null ? void 0 : c.bind(g?.proxy)), v = f;
	r ||= "modelValue", v ||= `update:${r.toString()}`;
	let b = (e) => u ? typeof u == "function" ? u(e) : Ve(e) : e, x = () => Ee(t[r]) ? b(t[r]) : m, S = (e) => {
		h ? h(e) && _(v, e) : _(v, e);
	};
	if (d) {
		let n = l(x()), i = !1;
		return a(() => t[r], (t) => {
			i || (i = !0, n.value = b(t), e(() => i = !1));
		}), a(n, (e) => {
			!i && (e !== t[r] || p) && S(e);
		}, { deep: p }), n;
	}
	return y({
		get() {
			return x();
		},
		set(e) {
			S(e);
		}
	});
}
export { Se as _, $ as a, ae as b, we as c, J as d, ke as f, K as g, Ie as h, Q as i, Te as l, Fe as m, Be as n, He as o, Pe as p, Z as r, Ue as s, X as t, Me as u, Ce as v, ce as x, ie as y };
