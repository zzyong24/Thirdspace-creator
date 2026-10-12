import { $ as e, A as t, B as n, C as r, Ct as i, D as a, F as o, G as s, H as c, M as l, P as u, Q as d, U as f, Z as p, at as m, ct as h, dt as g, et as _, ft as v, nt as y, pt as b, st as x, x as S, y as C, yt as w, z as T } from "./vendor_vue-OlfIOlFg.js";
import { d as E, m as D, r as O } from "./vendor_vueuse-DbHwQsn4.js";
import { E as k, S as A, T as j, y as ee } from "./Teleport-YNIcOte_.js";
import { a as te, i as ne } from "./Button-B4kIEl6s.js";
import { t as M } from "./usePrimitiveElement-CnkYcO3s.js";
function re(e) {
	let t = A({ dir: g("ltr") });
	return C(() => e?.value || t.dir?.value || "ltr");
}
var N = 0;
function ie() {
	d((e) => {
		if (!E) return;
		let t = document.querySelectorAll("[data-reka-focus-guard]");
		document.body.insertAdjacentElement("afterbegin", t[0] ?? P()), document.body.insertAdjacentElement("beforeend", t[1] ?? P()), N++, e(() => {
			N === 1 && document.querySelectorAll("[data-reka-focus-guard]").forEach((e) => e.remove()), N--;
		});
	});
}
function P() {
	let e = document.createElement("span");
	return e.setAttribute("data-reka-focus-guard", ""), e.tabIndex = 0, e.style.outline = "none", e.style.opacity = "0", e.style.position = "fixed", e.style.pointerEvents = "none", e;
}
function ae(e) {
	let t = g(), r = C(() => t.value?.width ?? 0), i = C(() => t.value?.height ?? 0), a;
	return T(() => {
		let n = O(e);
		n ? (t.value = {
			width: n.offsetWidth,
			height: n.offsetHeight
		}, a = new ResizeObserver((e) => {
			if (!Array.isArray(e) || !e.length) return;
			let r = e[0], i, a;
			if ("borderBoxSize" in r) {
				let e = r.borderBoxSize, t = Array.isArray(e) ? e[0] : e;
				i = t.inlineSize, a = t.blockSize;
			} else i = n.offsetWidth, a = n.offsetHeight;
			t.value = {
				width: i,
				height: a
			};
		}), a.observe(n, { box: "border-box" })) : t.value = void 0;
	}), n(() => {
		a?.disconnect(), a = void 0;
	}), {
		width: r,
		height: i
	};
}
function oe(e) {
	let t = D("", 1e3);
	return {
		search: t,
		handleTypeaheadSearch: (n, r) => {
			if (t.value += n, e) e(n);
			else {
				let e = j(), n = r.map((e) => ({
					...e,
					textValue: e.value?.textValue ?? e.ref.textContent?.trim() ?? ""
				})), i = n.find((t) => t.ref === e), a = ce(n.map((e) => e.textValue), t.value, i?.textValue), o = n.find((e) => e.textValue === a);
				return o && o.ref.focus(), o?.ref;
			}
		},
		resetTypeahead: () => {
			t.value = "";
		}
	};
}
function se(e, t) {
	return e.map((n, r) => e[(t + r) % e.length]);
}
function ce(e, t, n) {
	let r = t.length > 1 && Array.from(t).every((e) => e === t[0]) ? t[0] : t, i = n ? e.indexOf(n) : -1, a = se(e, Math.max(i, 0));
	r.length === 1 && (a = a.filter((e) => e !== n));
	let o = a.find((e) => e.toLowerCase().startsWith(r.toLowerCase()));
	return o === n ? void 0 : o;
}
var le = "data-reka-collection-item";
function ue(e = {}) {
	let { key: n = "", isProvider: r = !1 } = e, i = `${n}CollectionProvider`, o;
	if (r) {
		let e = g(/* @__PURE__ */ new Map());
		o = {
			collectionRef: g(),
			itemMap: e
		}, f(i, o);
	} else o = l(i);
	let s = (e, t = !1) => {
		if (!o.collectionRef.value) return;
		let n = o.itemMap.value.get(e);
		return n && (t || n.ref.dataset.disabled !== "") ? n : void 0;
	}, c = (e = !1) => {
		let t = o.collectionRef.value;
		if (!t) return [];
		let n = Array.from(t.querySelectorAll(`[${le}]`)), r = new Map(n.map((e, t) => [e, t])), i = Array.from(o.itemMap.value.values()).sort((e, t) => (r.get(e.ref) ?? -1) - (r.get(t.ref) ?? -1));
		return e ? i : i.filter((e) => e.ref.dataset.disabled !== "");
	}, u = /*#__PURE__*/ a({
		name: "CollectionSlot",
		inheritAttrs: !1,
		setup(e, { slots: n, attrs: r }) {
			let { primitiveElement: i, currentElement: a } = M();
			return p(a, () => {
				o.collectionRef.value = a.value;
			}), () => t(te, {
				ref: i,
				...r
			}, n);
		}
	}), m = /*#__PURE__*/ a({
		name: "CollectionItem",
		inheritAttrs: !1,
		props: { value: { validator: () => !0 } },
		setup(e, { slots: n, attrs: r }) {
			let { primitiveElement: i, currentElement: a } = M();
			return d((t) => {
				if (a.value) {
					let n = x(a.value);
					o.itemMap.value.set(n, {
						ref: a.value,
						value: e.value
					}), t(() => o.itemMap.value.delete(n));
				}
			}), () => t(te, {
				...r,
				[le]: "",
				ref: i
			}, n);
		}
	});
	return {
		getItems: c,
		getItem: s,
		reactiveItems: C(() => Array.from(o.itemMap.value.values())),
		itemMapSize: C(() => o.itemMap.value.size),
		CollectionSlot: u,
		CollectionItem: m
	};
}
var [de, fe] = /*#__PURE__*/ k("PopperRoot"), pe = /* @__PURE__ */ a({
	inheritAttrs: !1,
	__name: "PopperRoot",
	setup(e) {
		let t = g();
		return fe({
			anchor: t,
			onAnchorChange: (e) => t.value = e
		}), (e, t) => s(e.$slots, "default");
	}
}), me = /* @__PURE__ */ a({
	__name: "PopperAnchor",
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
	setup(t) {
		let n = t, { forwardRef: r, currentElement: i } = ee(), a = de();
		return e(() => {
			a.onAnchorChange(n.reference ?? i.value);
		}), (e, t) => (c(), S(w(ne), {
			ref: w(r),
			as: e.as,
			"as-child": e.asChild
		}, {
			default: _(() => [s(e.$slots, "default")]),
			_: 3
		}, 8, ["as", "as-child"]));
	}
});
function he(e) {
	return e !== null;
}
function ge(e) {
	return {
		name: "transformOrigin",
		options: e,
		fn(t) {
			let { placement: n, rects: r, middlewareData: i } = t, a = i.arrow?.centerOffset !== 0, o = a ? 0 : e.arrowWidth, s = a ? 0 : e.arrowHeight, [c, l] = _e(n), u = {
				start: e.dir === "rtl" ? "100%" : "0%",
				center: "50%",
				end: e.dir === "rtl" ? "0%" : "100%"
			}[l], d = {
				start: "0%",
				center: "50%",
				end: "100%"
			}[l], f = (i.arrow?.x ?? 0) + o / 2, p = (i.arrow?.y ?? 0) + s / 2, m = "", h = "";
			return c === "bottom" ? (m = a ? u : `${f}px`, h = `${-s}px`) : c === "top" ? (m = a ? u : `${f}px`, h = `${r.floating.height + s}px`) : c === "right" ? (m = `${-s}px`, h = a ? d : `${p}px`) : c === "left" && (m = `${r.floating.width + s}px`, h = a ? d : `${p}px`), { data: {
				x: m,
				y: h
			} };
		}
	};
}
function _e(e) {
	let [t, n = "center"] = e.split("-");
	return [t, n];
}
var ve = [
	"top",
	"right",
	"bottom",
	"left"
], F = Math.min, I = Math.max, ye = Math.round, be = Math.floor, L = (e) => ({
	x: e,
	y: e
}), xe = {
	left: "right",
	right: "left",
	bottom: "top",
	top: "bottom"
};
function Se(e, t, n) {
	return I(e, F(t, n));
}
function R(e, t) {
	return typeof e == "function" ? e(t) : e;
}
function z(e) {
	return e.split("-")[0];
}
function B(e) {
	return e.split("-")[1];
}
function Ce(e) {
	return e === "x" ? "y" : "x";
}
function we(e) {
	return e === "y" ? "height" : "width";
}
function V(e) {
	let t = e[0];
	return t === "t" || t === "b" ? "y" : "x";
}
function Te(e) {
	return Ce(V(e));
}
function Ee(e, t, n) {
	n === void 0 && (n = !1);
	let r = B(e), i = Te(e), a = we(i), o = i === "x" ? r === (n ? "end" : "start") ? "right" : "left" : r === "start" ? "bottom" : "top";
	return t.reference[a] > t.floating[a] && (o = Fe(o)), [o, Fe(o)];
}
function De(e) {
	let t = Fe(e);
	return [
		Oe(e),
		t,
		Oe(t)
	];
}
function Oe(e) {
	return e.includes("start") ? e.replace("start", "end") : e.replace("end", "start");
}
var ke = ["left", "right"], Ae = ["right", "left"], je = ["top", "bottom"], Me = ["bottom", "top"];
function Ne(e, t, n) {
	switch (e) {
		case "top":
		case "bottom": return n ? t ? Ae : ke : t ? ke : Ae;
		case "left":
		case "right": return t ? je : Me;
		default: return [];
	}
}
function Pe(e, t, n, r) {
	let i = B(e), a = Ne(z(e), n === "start", r);
	return i && (a = a.map((e) => e + "-" + i), t && (a = a.concat(a.map(Oe)))), a;
}
function Fe(e) {
	let t = z(e);
	return xe[t] + e.slice(t.length);
}
function Ie(e) {
	return {
		top: e.top ?? 0,
		right: e.right ?? 0,
		bottom: e.bottom ?? 0,
		left: e.left ?? 0
	};
}
function Le(e) {
	return typeof e == "number" ? {
		top: e,
		right: e,
		bottom: e,
		left: e
	} : Ie(e);
}
function Re(e) {
	let { x: t, y: n, width: r, height: i } = e;
	return {
		width: r,
		height: i,
		top: n,
		left: t,
		right: t + r,
		bottom: n + i,
		x: t,
		y: n
	};
}
function ze(e, t, n) {
	let { reference: r, floating: i } = e, a = V(t), o = Te(t), s = we(o), c = z(t), l = a === "y", u = r.x + r.width / 2 - i.width / 2, d = r.y + r.height / 2 - i.height / 2, f = r[s] / 2 - i[s] / 2, p;
	switch (c) {
		case "top":
			p = {
				x: u,
				y: r.y - i.height
			};
			break;
		case "bottom":
			p = {
				x: u,
				y: r.y + r.height
			};
			break;
		case "right":
			p = {
				x: r.x + r.width,
				y: d
			};
			break;
		case "left":
			p = {
				x: r.x - i.width,
				y: d
			};
			break;
		default: p = {
			x: r.x,
			y: r.y
		};
	}
	let m = B(t);
	return m && (p[o] += f * (m === "end" ? 1 : -1) * (n && l ? -1 : 1)), p;
}
async function Be(e, t) {
	t === void 0 && (t = {});
	let { x: n, y: r, platform: i, rects: a, elements: o, strategy: s } = e, { boundary: c = "clippingAncestors", rootBoundary: l = "viewport", elementContext: u = "floating", altBoundary: d = !1, padding: f = 0 } = R(t, e), p = Le(f), m = o[d ? u === "floating" ? "reference" : "floating" : u], h = Re(await i.getClippingRect({
		element: await (i.isElement == null ? void 0 : i.isElement(m)) ?? !0 ? m : m.contextElement || await (i.getDocumentElement == null ? void 0 : i.getDocumentElement(o.floating)),
		boundary: c,
		rootBoundary: l,
		strategy: s
	})), g = u === "floating" ? {
		x: n,
		y: r,
		width: a.floating.width,
		height: a.floating.height
	} : a.reference, _ = await (i.getOffsetParent == null ? void 0 : i.getOffsetParent(o.floating)), v = await (i.isElement == null ? void 0 : i.isElement(_)) && await (i.getScale == null ? void 0 : i.getScale(_)) || {
		x: 1,
		y: 1
	}, y = Re(i.convertOffsetParentRelativeRectToViewportRelativeRect ? await i.convertOffsetParentRelativeRectToViewportRelativeRect({
		elements: o,
		rect: g,
		offsetParent: _,
		strategy: s
	}) : g);
	return {
		top: (h.top - y.top + p.top) / v.y,
		bottom: (y.bottom - h.bottom + p.bottom) / v.y,
		left: (h.left - y.left + p.left) / v.x,
		right: (y.right - h.right + p.right) / v.x
	};
}
var Ve = 50, He = async (e, t, n) => {
	let { placement: r = "bottom", strategy: i = "absolute", middleware: a = [], platform: o } = n, s = o.detectOverflow ? o : {
		...o,
		detectOverflow: Be
	}, c = await (o.isRTL == null ? void 0 : o.isRTL(t)), l = await o.getElementRects({
		reference: e,
		floating: t,
		strategy: i
	}), { x: u, y: d } = ze(l, r, c), f = r, p = 0, m = {};
	for (let n = 0; n < a.length; n++) {
		let h = a[n];
		if (!h) continue;
		let { name: g, fn: _ } = h, { x: v, y, data: b, reset: x } = await _({
			x: u,
			y: d,
			initialPlacement: r,
			placement: f,
			strategy: i,
			middlewareData: m,
			rects: l,
			platform: s,
			elements: {
				reference: e,
				floating: t
			}
		});
		u = v ?? u, d = y ?? d, m[g] = {
			...m[g],
			...b
		}, x && p < Ve && (p++, typeof x == "object" && (x.placement && (f = x.placement), x.rects && (l = x.rects === !0 ? await o.getElementRects({
			reference: e,
			floating: t,
			strategy: i
		}) : x.rects), {x: u, y: d} = ze(l, f, c)), n = -1);
	}
	return {
		x: u,
		y: d,
		placement: f,
		strategy: i,
		middlewareData: m
	};
}, Ue = (e) => ({
	name: "arrow",
	options: e,
	async fn(t) {
		let { x: n, y: r, placement: i, rects: a, platform: o, elements: s, middlewareData: c } = t, { element: l, padding: u = 0 } = R(e, t) || {};
		if (l == null) return {};
		let d = Le(u), f = {
			x: n,
			y: r
		}, p = Te(i), m = we(p), h = await o.getDimensions(l), g = p === "y", _ = g ? "top" : "left", v = g ? "bottom" : "right", y = g ? "clientHeight" : "clientWidth", b = a.reference[m] + a.reference[p] - f[p] - a.floating[m], x = f[p] - a.reference[p], S = await (o.getOffsetParent == null ? void 0 : o.getOffsetParent(l)), C = S ? S[y] : 0;
		(!C || !await (o.isElement == null ? void 0 : o.isElement(S))) && (C = s.floating[y] || a.floating[m]);
		let w = b / 2 - x / 2, T = C / 2 - h[m] / 2 - 1, E = F(d[_], T), D = F(d[v], T), O = C - h[m] - D, k = C / 2 - h[m] / 2 + w, A = Se(E, k, O), j = !c.arrow && B(i) != null && k !== A && a.reference[m] / 2 - (k < E ? E : D) - h[m] / 2 < 0, ee = j ? k < E ? k - E : k - O : 0;
		return {
			[p]: f[p] + ee,
			data: {
				[p]: A,
				centerOffset: k - A - ee,
				...j && { alignmentOffset: ee }
			},
			reset: j
		};
	}
}), We = function(e) {
	return e === void 0 && (e = {}), {
		name: "flip",
		options: e,
		async fn(t) {
			var n;
			let { placement: r, middlewareData: i, rects: a, initialPlacement: o, platform: s, elements: c } = t, { mainAxis: l = !0, crossAxis: u = !0, fallbackPlacements: d, fallbackStrategy: f = "bestFit", fallbackAxisSideDirection: p = "none", flipAlignment: m = !0, ...h } = R(e, t);
			if ((n = i.arrow) != null && n.alignmentOffset) return {};
			let g = z(r), _ = V(o), v = z(o) === o, y = await (s.isRTL == null ? void 0 : s.isRTL(c.floating)), b = d || (v || !m ? [Fe(o)] : De(o)), x = p !== "none";
			!d && x && b.push(...Pe(o, m, p, y));
			let S = [o, ...b], C = await s.detectOverflow(t, h), w = [], T = i.flip?.overflows || [];
			if (l && w.push(C[g]), u) {
				let e = Ee(r, a, y);
				w.push(C[e[0]], C[e[1]]);
			}
			if (T = [...T, {
				placement: r,
				overflows: w
			}], !w.every((e) => e <= 0)) {
				let e = (i.flip?.index || 0) + 1, t = S[e];
				if (t && (u !== "alignment" || _ === V(t) || T.every((e) => V(e.placement) !== _ || e.overflows[0] > 0))) return {
					data: {
						index: e,
						overflows: T
					},
					reset: { placement: t }
				};
				let n = T.filter((e) => e.overflows[0] <= 0).sort((e, t) => e.overflows[1] - t.overflows[1])[0]?.placement;
				if (!n) switch (f) {
					case "bestFit": {
						let e = T.filter((e) => {
							if (x) {
								let t = V(e.placement);
								return t === _ || t === "y";
							}
							return !0;
						}).map((e) => [e.placement, e.overflows.filter((e) => e > 0).reduce((e, t) => e + t, 0)]).sort((e, t) => e[1] - t[1])[0]?.[0];
						e && (n = e);
						break;
					}
					case "initialPlacement": n = o;
				}
				if (r !== n) return { reset: { placement: n } };
			}
			return {};
		}
	};
};
function Ge(e, t) {
	return {
		top: e.top - t.height,
		right: e.right - t.width,
		bottom: e.bottom - t.height,
		left: e.left - t.width
	};
}
function Ke(e) {
	return ve.some((t) => e[t] >= 0);
}
var qe = function(e) {
	return e === void 0 && (e = {}), {
		name: "hide",
		options: e,
		async fn(t) {
			let { rects: n, platform: r } = t, { strategy: i = "referenceHidden", ...a } = R(e, t);
			switch (i) {
				case "referenceHidden": {
					let e = Ge(await r.detectOverflow(t, {
						...a,
						elementContext: "reference"
					}), n.reference);
					return { data: {
						referenceHiddenOffsets: e,
						referenceHidden: Ke(e)
					} };
				}
				case "escaped": {
					let e = Ge(await r.detectOverflow(t, {
						...a,
						altBoundary: !0
					}), n.floating);
					return { data: {
						escapedOffsets: e,
						escaped: Ke(e)
					} };
				}
				default: return {};
			}
		}
	};
}, Je = /*#__PURE__*/ new Set(["left", "top"]);
async function Ye(e, t) {
	let { placement: n, platform: r, elements: i } = e, a = await (r.isRTL == null ? void 0 : r.isRTL(i.floating)), o = z(n), s = B(n), c = V(n) === "y", l = Je.has(o) ? -1 : 1, u = a && c ? -1 : 1, d = R(t, e), { mainAxis: f, crossAxis: p, alignmentAxis: m } = typeof d == "number" ? {
		mainAxis: d,
		crossAxis: 0,
		alignmentAxis: null
	} : {
		mainAxis: d.mainAxis || 0,
		crossAxis: d.crossAxis || 0,
		alignmentAxis: d.alignmentAxis
	};
	return s && typeof m == "number" && (p = s === "end" ? m * -1 : m), c ? {
		x: p * u,
		y: f * l
	} : {
		x: f * l,
		y: p * u
	};
}
var Xe = function(e) {
	return e === void 0 && (e = 0), {
		name: "offset",
		options: e,
		async fn(t) {
			var n;
			let { x: r, y: i, placement: a, middlewareData: o } = t, s = await Ye(t, e);
			return a === o.offset?.placement && (n = o.arrow) != null && n.alignmentOffset ? {} : {
				x: r + s.x,
				y: i + s.y,
				data: {
					...s,
					placement: a
				}
			};
		}
	};
}, Ze = function(e) {
	return e === void 0 && (e = {}), {
		name: "shift",
		options: e,
		async fn(t) {
			let { x: n, y: r, placement: i, platform: a } = t, { mainAxis: o = !0, crossAxis: s = !1, limiter: c = { fn: (e) => {
				let { x: t, y: n } = e;
				return {
					x: t,
					y: n
				};
			} }, ...l } = R(e, t), u = {
				x: n,
				y: r
			}, d = await a.detectOverflow(t, l), f = V(i), p = Ce(f), m = u[p], h = u[f], g = (e, t) => Se(t + d[e === "y" ? "top" : "left"], t, t - d[e === "y" ? "bottom" : "right"]);
			o && (m = g(p, m)), s && (h = g(f, h));
			let _ = c.fn({
				...t,
				[p]: m,
				[f]: h
			});
			return {
				..._,
				data: {
					x: _.x - n,
					y: _.y - r,
					enabled: {
						[p]: o,
						[f]: s
					}
				}
			};
		}
	};
}, Qe = function(e) {
	return e === void 0 && (e = {}), {
		options: e,
		fn(t) {
			let { x: n, y: r, placement: i, rects: a, middlewareData: o } = t, { offset: s = 0, mainAxis: c = !0, crossAxis: l = !0 } = R(e, t), u = {
				x: n,
				y: r
			}, d = V(i), f = Ce(d), p = u[f], m = u[d], h = R(s, t), g = typeof h == "number" ? {
				mainAxis: h,
				crossAxis: 0
			} : {
				mainAxis: h.mainAxis ?? 0,
				crossAxis: h.crossAxis ?? 0
			};
			if (c) {
				let e = f === "y" ? "height" : "width", t = a.reference[f] - a.floating[e] + g.mainAxis, n = a.reference[f] + a.reference[e] - g.mainAxis;
				p < t ? p = t : p > n && (p = n);
			}
			if (l) {
				let e = f === "y" ? "width" : "height", t = Je.has(z(i)), n = a.reference[d] - a.floating[e] + (t && o.offset?.[d] || 0) + (t ? 0 : g.crossAxis), r = a.reference[d] + a.reference[e] + (t ? 0 : o.offset?.[d] || 0) - (t ? g.crossAxis : 0);
				m < n ? m = n : m > r && (m = r);
			}
			return {
				[f]: p,
				[d]: m
			};
		}
	};
}, $e = function(e) {
	return e === void 0 && (e = {}), {
		name: "size",
		options: e,
		async fn(t) {
			let { placement: n, rects: r, platform: i, elements: a } = t, { apply: o = () => {}, ...s } = R(e, t), c = await i.detectOverflow(t, s), l = z(n), u = B(n), d = V(n) === "y", { width: f, height: p } = r.floating, m, h;
			l === "top" || l === "bottom" ? (m = l, h = u === (await (i.isRTL == null ? void 0 : i.isRTL(a.floating)) ? "start" : "end") ? "left" : "right") : (h = l, m = u === "end" ? "top" : "bottom");
			let g = p - c.top - c.bottom, _ = f - c.left - c.right, v = F(p - c[m], g), y = F(f - c[h], _), b = t.middlewareData.shift, x = !b, S = v, C = y;
			b != null && b.enabled.x && (C = _), b != null && b.enabled.y && (S = g), x && !u && (d ? C = f - 2 * I(c.left, c.right) : S = p - 2 * I(c.top, c.bottom)), await o({
				...t,
				availableWidth: C,
				availableHeight: S
			});
			let w = await i.getDimensions(a.floating);
			return f !== w.width || p !== w.height ? { reset: { rects: !0 } } : {};
		}
	};
};
function et() {
	return typeof window < "u";
}
function H(e) {
	return tt(e) ? (e.nodeName || "").toLowerCase() : "#document";
}
function U(e) {
	var t;
	return (e == null || (t = e.ownerDocument) == null ? void 0 : t.defaultView) || window;
}
function W(e) {
	return ((tt(e) ? e.ownerDocument : e.document) || window.document)?.documentElement;
}
function tt(e) {
	return et() ? e instanceof Node || e instanceof U(e).Node : !1;
}
function G(e) {
	return et() ? e instanceof Element || e instanceof U(e).Element : !1;
}
function K(e) {
	return et() ? e instanceof HTMLElement || e instanceof U(e).HTMLElement : !1;
}
function nt(e) {
	return !et() || typeof ShadowRoot > "u" ? !1 : e instanceof ShadowRoot || e instanceof U(e).ShadowRoot;
}
function rt(e) {
	let { overflow: t, overflowX: n, overflowY: r, display: i } = Y(e);
	return /auto|scroll|overlay|hidden|clip/.test(t + r + n) && i !== "inline" && i !== "contents";
}
function it(e) {
	return /^(table|td|th)$/.test(H(e));
}
function at(e) {
	try {
		if (e.matches(":popover-open")) return !0;
	} catch {}
	try {
		return e.matches(":modal");
	} catch {
		return !1;
	}
}
var ot = /transform|translate|scale|rotate|perspective|filter/, st = /paint|layout|strict|content/, q = (e) => !!e && e !== "none", ct;
function lt(e) {
	let t = G(e) ? Y(e) : e;
	return q(t.transform) || q(t.translate) || q(t.scale) || q(t.rotate) || q(t.perspective) || !dt() && (q(t.backdropFilter) || q(t.filter)) || ot.test(t.willChange || "") || st.test(t.contain || "");
}
function ut(e) {
	let t = X(e);
	for (; K(t) && !J(t);) {
		if (lt(t)) return t;
		if (at(t)) return null;
		t = X(t);
	}
	return null;
}
function dt() {
	return ct ??= typeof CSS < "u" && CSS.supports && CSS.supports("-webkit-backdrop-filter", "none"), ct;
}
function J(e) {
	return /^(html|body|#document)$/.test(H(e));
}
function Y(e) {
	return U(e).getComputedStyle(e);
}
function ft(e) {
	return G(e) ? {
		scrollLeft: e.scrollLeft,
		scrollTop: e.scrollTop
	} : {
		scrollLeft: e.scrollX,
		scrollTop: e.scrollY
	};
}
function X(e) {
	if (H(e) === "html") return e;
	let t = e.assignedSlot || e.parentNode || nt(e) && e.host || W(e);
	return nt(t) ? t.host : t;
}
function pt(e) {
	let t = X(e);
	return J(t) ? (e.ownerDocument || e).body : K(t) && rt(t) ? t : pt(t);
}
function mt(e, t, n) {
	t === void 0 && (t = []), n === void 0 && (n = !0);
	let r = pt(e), i = r === e.ownerDocument?.body, a = U(r);
	if (i) {
		let e = ht(a);
		return t.concat(a, a.visualViewport || [], rt(r) ? r : [], e && n ? mt(e) : []);
	}
	return t.concat(r, mt(r, [], n));
}
function ht(e) {
	return e.parent && Object.getPrototypeOf(e.parent) ? e.frameElement : null;
}
function gt(e) {
	let t = Y(e), n = parseFloat(t.width) || 0, r = parseFloat(t.height) || 0, i = K(e), a = i ? e.offsetWidth : n, o = i ? e.offsetHeight : r, s = ye(n) !== a || ye(r) !== o;
	return s && (n = a, r = o), {
		width: n,
		height: r,
		$: s
	};
}
function _t(e) {
	return G(e) ? e : e.contextElement;
}
function Z(e) {
	let t = _t(e);
	if (!K(t)) return L(1);
	let n = t.getBoundingClientRect(), { width: r, height: i, $: a } = gt(t), o = (a ? ye(n.width) : n.width) / r, s = (a ? ye(n.height) : n.height) / i;
	return (!o || !Number.isFinite(o)) && (o = 1), (!s || !Number.isFinite(s)) && (s = 1), {
		x: o,
		y: s
	};
}
var vt = /*#__PURE__*/ L(0);
function yt(e) {
	let t = U(e);
	return !dt() || !t.visualViewport ? vt : {
		x: t.visualViewport.offsetLeft,
		y: t.visualViewport.offsetTop
	};
}
function bt(e, t, n) {
	return t === void 0 && (t = !1), !!n && t && n === U(e);
}
function Q(e, t, n, r) {
	t === void 0 && (t = !1), n === void 0 && (n = !1);
	let i = e.getBoundingClientRect(), a = _t(e), o = L(1);
	t && (r ? G(r) && (o = Z(r)) : o = Z(e));
	let s = bt(a, n, r) ? yt(a) : L(0), c = (i.left + s.x) / o.x, l = (i.top + s.y) / o.y, u = i.width / o.x, d = i.height / o.y;
	if (a && r) {
		let e = U(a), t = G(r) ? U(r) : r, n = e, i = ht(n);
		for (; i && t !== n;) {
			let e = Z(i), t = i.getBoundingClientRect(), r = Y(i), a = t.left + (i.clientLeft + parseFloat(r.paddingLeft)) * e.x, o = t.top + (i.clientTop + parseFloat(r.paddingTop)) * e.y;
			c *= e.x, l *= e.y, u *= e.x, d *= e.y, c += a, l += o, n = U(i), i = ht(n);
		}
	}
	return Re({
		width: u,
		height: d,
		x: c,
		y: l
	});
}
function xt(e, t) {
	let n = ft(e).scrollLeft;
	return t ? t.left + n : Q(W(e)).left + n;
}
function St(e, t) {
	let n = e.getBoundingClientRect();
	return {
		x: n.left + t.scrollLeft - xt(e, n),
		y: n.top + t.scrollTop
	};
}
function Ct(e) {
	let { elements: t, rect: n, offsetParent: r, strategy: i } = e, a = i === "fixed", o = W(r), s = t ? at(t.floating) : !1;
	if (r === o || s && a) return n;
	let c = {
		scrollLeft: 0,
		scrollTop: 0
	}, l = L(1), u = L(0), d = K(r);
	if ((d || !a) && ((H(r) !== "body" || rt(o)) && (c = ft(r)), d)) {
		let e = Q(r);
		l = Z(r), u.x = e.x + r.clientLeft, u.y = e.y + r.clientTop;
	}
	let f = o && !d && !a ? St(o, c) : L(0);
	return {
		width: n.width * l.x,
		height: n.height * l.y,
		x: n.x * l.x - c.scrollLeft * l.x + u.x + f.x,
		y: n.y * l.y - c.scrollTop * l.y + u.y + f.y
	};
}
function wt(e) {
	return e.getClientRects ? Array.from(e.getClientRects()) : [];
}
function Tt(e) {
	let t = ft(e), n = e.ownerDocument.body, r = I(e.scrollWidth, e.clientWidth, n.scrollWidth, n.clientWidth), i = I(e.scrollHeight, e.clientHeight, n.scrollHeight, n.clientHeight), a = -t.scrollLeft + xt(e), o = -t.scrollTop;
	return Y(n).direction === "rtl" && (a += I(e.clientWidth, n.clientWidth) - r), {
		width: r,
		height: i,
		x: a,
		y: o
	};
}
var Et = 25;
function Dt(e, t, n) {
	n === void 0 && (n = "viewport");
	let r = n === "layoutViewport", i = U(e), a = W(e), o = i.visualViewport, s = a.clientWidth, c = a.clientHeight, l = 0, u = 0;
	if (o) {
		let e = !dt() || t === "fixed";
		r ? e || (l = -o.offsetLeft, u = -o.offsetTop) : (s = o.width, c = o.height, e && (l = o.offsetLeft, u = o.offsetTop));
	}
	if (xt(a) <= 0) {
		let e = a.ownerDocument, t = e.body, n = getComputedStyle(t), r = e.compatMode === "CSS1Compat" && parseFloat(n.marginLeft) + parseFloat(n.marginRight) || 0, i = Math.abs(a.clientWidth - t.clientWidth - r), o = getComputedStyle(a).scrollbarGutter === "stable both-edges" ? i / 2 : i;
		o <= Et && (s -= o);
	}
	return {
		width: s,
		height: c,
		x: l,
		y: u
	};
}
function Ot(e, t) {
	let n = Q(e, !0, t === "fixed"), r = n.top + e.clientTop, i = n.left + e.clientLeft, a = Z(e);
	return {
		width: e.clientWidth * a.x,
		height: e.clientHeight * a.y,
		x: i * a.x,
		y: r * a.y
	};
}
function kt(e, t, n) {
	let r;
	if (t === "viewport" || t === "layoutViewport") r = Dt(e, n, t);
	else if (t === "document") r = Tt(W(e));
	else if (G(t)) r = Ot(t, n);
	else {
		let n = yt(e);
		r = {
			x: t.x - n.x,
			y: t.y - n.y,
			width: t.width,
			height: t.height
		};
	}
	return Re(r);
}
function At(e, t) {
	let n = t.get(e);
	if (n) return n;
	let r = mt(e, [], !1).filter((e) => G(e) && H(e) !== "body"), i = null, a = Y(e).position === "fixed", o = a ? X(e) : e;
	for (; G(o) && !J(o);) {
		let e = Y(o), t = lt(o), n = i ? i.position : a ? "fixed" : "";
		!t && (n === "fixed" || n === "absolute" && e.position === "static") ? r = r.filter((e) => e !== o) : i = e, o = X(o);
	}
	return t.set(e, r), r;
}
function jt(e) {
	let { element: t, boundary: n, rootBoundary: r, strategy: i } = e, a = [...n === "clippingAncestors" ? at(t) ? [] : At(t, this._c) : [].concat(n), r], o = kt(t, a[0], i), s = o.top, c = o.right, l = o.bottom, u = o.left;
	for (let e = 1; e < a.length; e++) {
		let n = kt(t, a[e], i);
		s = I(n.top, s), c = F(n.right, c), l = F(n.bottom, l), u = I(n.left, u);
	}
	return {
		width: c - u,
		height: l - s,
		x: u,
		y: s
	};
}
function Mt(e) {
	let { width: t, height: n } = gt(e);
	return {
		width: t,
		height: n
	};
}
function Nt(e, t, n) {
	let r = K(t), i = W(t), a = n === "fixed", o = Q(e, !0, a, t), s = {
		scrollLeft: 0,
		scrollTop: 0
	}, c = L(0);
	if ((r || !a) && ((H(t) !== "body" || rt(i)) && (s = ft(t)), r)) {
		let e = Q(t, !0, a, t);
		c.x = e.x + t.clientLeft, c.y = e.y + t.clientTop;
	}
	!r && i && (c.x = xt(i));
	let l = i && !r && !a ? St(i, s) : L(0);
	return {
		x: o.left + s.scrollLeft - c.x - l.x,
		y: o.top + s.scrollTop - c.y - l.y,
		width: o.width,
		height: o.height
	};
}
function Pt(e) {
	return Y(e).position === "static";
}
function Ft(e, t) {
	if (!K(e) || Y(e).position === "fixed") return null;
	if (t) return t(e);
	let n = e.offsetParent;
	return W(e) === n && (n = n.ownerDocument.body), n;
}
function It(e, t) {
	let n = U(e);
	if (at(e)) return n;
	if (!K(e)) {
		let t = X(e);
		for (; t && !J(t);) {
			if (G(t) && !Pt(t)) return t;
			t = X(t);
		}
		return n;
	}
	let r = Ft(e, t);
	for (; r && it(r) && Pt(r);) r = Ft(r, t);
	return r && J(r) && Pt(r) && !lt(r) ? n : r || ut(e) || n;
}
var Lt = async function(e) {
	let t = this.getOffsetParent || It, n = this.getDimensions, r = await n(e.floating);
	return {
		reference: Nt(e.reference, await t(e.floating), e.strategy),
		floating: {
			x: 0,
			y: 0,
			width: r.width,
			height: r.height
		}
	};
};
function Rt(e) {
	return Y(e).direction === "rtl";
}
var zt = {
	convertOffsetParentRelativeRectToViewportRelativeRect: Ct,
	getDocumentElement: W,
	getClippingRect: jt,
	getOffsetParent: It,
	getElementRects: Lt,
	getClientRects: wt,
	getDimensions: Mt,
	getScale: Z,
	isElement: G,
	isRTL: Rt
};
function Bt(e, t) {
	return e.x === t.x && e.y === t.y && e.width === t.width && e.height === t.height;
}
function Vt(e, t, n) {
	let r = null, i, a = W(e);
	function o() {
		var e;
		clearTimeout(i), (e = r) == null || e.disconnect(), r = null;
	}
	function s(n, c) {
		n === void 0 && (n = !1), c === void 0 && (c = 1), o();
		let l = e.getBoundingClientRect(), { left: u, top: d, width: f, height: p } = l;
		if (n || t(), !f || !p) return;
		let m = be(d), h = be(a.clientWidth - (u + f)), g = be(a.clientHeight - (d + p)), _ = be(u), v = {
			rootMargin: -m + "px " + -h + "px " + -g + "px " + -_ + "px",
			threshold: I(0, F(1, c)) || 1
		}, y = !0;
		function b(t) {
			let n = t[0].intersectionRatio;
			if (!Bt(l, e.getBoundingClientRect())) return s();
			if (n !== c) {
				if (!y) return s();
				n ? s(!1, n) : i = setTimeout(() => {
					s(!1, 1e-7);
				}, 1e3);
			}
			y = !1;
		}
		try {
			r = new IntersectionObserver(b, {
				...v,
				root: a.ownerDocument
			});
		} catch {
			r = new IntersectionObserver(b, v);
		}
		r.observe(e);
	}
	let c = U(e), l = () => s(n);
	return c.addEventListener("resize", l), s(!0), () => {
		c.removeEventListener("resize", l), o();
	};
}
function Ht(e, t, n, r) {
	r === void 0 && (r = {});
	let { ancestorScroll: i = !0, ancestorResize: a = !0, elementResize: o = typeof ResizeObserver == "function", layoutShift: s = typeof IntersectionObserver == "function", animationFrame: c = !1 } = r, l = _t(e), u = i || a ? [...l ? mt(l) : [], ...t ? mt(t) : []] : [];
	u.forEach((e) => {
		i && e.addEventListener("scroll", n), a && e.addEventListener("resize", n);
	});
	let d = l && s ? Vt(l, n, a) : null, f = -1, p = null;
	o && (p = new ResizeObserver((e) => {
		let [r] = e;
		r && r.target === l && p && t && (p.unobserve(t), cancelAnimationFrame(f), f = requestAnimationFrame(() => {
			var e;
			(e = p) == null || e.observe(t);
		})), n();
	}), l && !c && p.observe(l), t && p.observe(t));
	let m, h = c ? Q(e) : null;
	c && g();
	function g() {
		let t = Q(e);
		h && !Bt(h, t) && n(), h = t, m = requestAnimationFrame(g);
	}
	return n(), () => {
		var e;
		u.forEach((e) => {
			i && e.removeEventListener("scroll", n), a && e.removeEventListener("resize", n);
		}), d?.(), (e = p) == null || e.disconnect(), p = null, c && cancelAnimationFrame(m);
	};
}
var Ut = Xe, Wt = Ze, Gt = We, Kt = $e, qt = qe, Jt = Ue, Yt = Qe, Xt = (e, t, n) => {
	let r = /* @__PURE__ */ new Map(), i = n ?? {}, a = {
		...zt,
		...i.platform,
		_c: r
	};
	return He(e, t, {
		...i,
		platform: a
	});
};
function Zt(e) {
	return typeof e == "object" && !!e && "$el" in e;
}
function Qt(e) {
	if (Zt(e)) {
		let t = e.$el;
		return tt(t) && H(t) === "#comment" ? null : t;
	}
	return e;
}
function $(e) {
	return typeof e == "function" ? e() : w(e);
}
function $t(e) {
	return {
		name: "arrow",
		options: e,
		fn(t) {
			let n = Qt($(e.element));
			return n == null ? {} : Jt({
				element: n,
				padding: e.padding
			}).fn(t);
		}
	};
}
function en(e) {
	return typeof window > "u" ? 1 : (e.ownerDocument.defaultView || window).devicePixelRatio || 1;
}
function tn(e, t) {
	let n = en(e);
	return Math.round(t * n) / n;
}
function nn(e, t, n) {
	n === void 0 && (n = {});
	let r = n.whileElementsMounted, i = C(() => $(n.open) ?? !0), a = C(() => $(n.middleware)), o = C(() => $(n.placement) ?? "bottom"), s = C(() => $(n.strategy) ?? "absolute"), c = C(() => $(n.transform) ?? !0), l = C(() => Qt(e.value)), u = C(() => Qt(t.value)), d = g(0), f = g(0), _ = g(s.value), y = g(o.value), x = b({}), S = g(!1), w = C(() => {
		let e = {
			position: _.value,
			left: "0",
			top: "0"
		};
		if (!u.value) return e;
		let t = tn(u.value, d.value), n = tn(u.value, f.value);
		return c.value ? {
			...e,
			transform: "translate(" + t + "px, " + n + "px)",
			...en(u.value) >= 1.5 && { willChange: "transform" }
		} : {
			position: _.value,
			left: t + "px",
			top: n + "px"
		};
	}), T;
	function E() {
		if (l.value == null || u.value == null) return;
		let e = i.value;
		Xt(l.value, u.value, {
			middleware: a.value,
			placement: o.value,
			strategy: s.value
		}).then((t) => {
			d.value = t.x, f.value = t.y, _.value = t.strategy, y.value = t.placement, x.value = t.middlewareData, S.value = e !== !1;
		});
	}
	function D() {
		typeof T == "function" && (T(), T = void 0);
	}
	function O() {
		if (D(), r === void 0) {
			E();
			return;
		}
		if (l.value != null && u.value != null) {
			T = r(l.value, u.value, E);
			return;
		}
	}
	function k() {
		i.value || (S.value = !1);
	}
	return p([
		a,
		o,
		s,
		i
	], E, { flush: "sync" }), p([l, u], O, { flush: "sync" }), p(i, k, { flush: "sync" }), m() && h(D), {
		x: v(d),
		y: v(f),
		strategy: v(_),
		placement: v(y),
		middlewareData: v(x),
		isPositioned: v(S),
		floatingStyles: w,
		update: E
	};
}
var rn = ["dir"], an = {
	side: "bottom",
	sideOffset: 0,
	sideFlip: !0,
	align: "center",
	alignOffset: 0,
	alignFlip: !0,
	arrowPadding: 0,
	hideShiftedArrow: !0,
	avoidCollisions: !0,
	collisionBoundary: () => [],
	collisionPadding: 0,
	sticky: "partial",
	hideWhenDetached: !1,
	positionStrategy: "fixed",
	updatePositionStrategy: "optimized",
	prioritizePosition: !1
}, [on, sn] = /*#__PURE__*/ k("PopperContent"), cn = /* @__PURE__ */ a({
	inheritAttrs: !1,
	__name: "PopperContent",
	props: /* @__PURE__ */ u({
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
		dir: {
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
	}, { ...an }),
	emits: ["placed"],
	setup(t, { emit: n }) {
		let a = t, l = n, u = de(), { forwardRef: f, currentElement: p } = ee(), m = re(C(() => a.dir)), h = g(), v = g(), { width: b, height: x } = ae(v), T = C(() => a.side + (a.align === "center" ? "" : `-${a.align}`)), E = C(() => typeof a.collisionPadding == "number" ? a.collisionPadding : {
			top: 0,
			right: 0,
			bottom: 0,
			left: 0,
			...a.collisionPadding
		}), D = C(() => Array.isArray(a.collisionBoundary) ? a.collisionBoundary : [a.collisionBoundary]), O = C(() => ({
			padding: E.value,
			boundary: D.value.filter(he),
			altBoundary: D.value.length > 0
		})), k = C(() => ({
			mainAxis: a.sideFlip,
			crossAxis: a.alignFlip
		})), A = C(() => [
			Ut({
				mainAxis: a.sideOffset + x.value,
				alignmentAxis: a.alignOffset
			}),
			a.prioritizePosition && a.avoidCollisions && Gt({
				...O.value,
				...k.value
			}),
			a.avoidCollisions && Wt({
				mainAxis: !0,
				crossAxis: !!a.prioritizePosition,
				limiter: a.sticky === "partial" ? Yt() : void 0,
				...O.value
			}),
			!a.prioritizePosition && a.avoidCollisions && Gt({
				...O.value,
				...k.value
			}),
			Kt({
				...O.value,
				apply: ({ elements: e, rects: t, availableWidth: n, availableHeight: r }) => {
					let { width: i, height: a } = t.reference, o = e.floating.style;
					o.setProperty("--reka-popper-available-width", `${n}px`), o.setProperty("--reka-popper-available-height", `${r}px`), o.setProperty("--reka-popper-anchor-width", `${i}px`), o.setProperty("--reka-popper-anchor-height", `${a}px`);
				}
			}),
			v.value && $t({
				element: v.value,
				padding: a.arrowPadding
			}),
			ge({
				arrowWidth: b.value,
				arrowHeight: x.value,
				dir: m.value
			}),
			a.hideWhenDetached && qt({
				strategy: "referenceHidden",
				...O.value
			})
		]), { floatingStyles: j, placement: te, isPositioned: M, middlewareData: N, update: ie } = nn(C(() => a.reference ?? u.anchor.value), h, {
			strategy: a.positionStrategy,
			placement: T,
			whileElementsMounted: (...e) => Ht(...e, {
				layoutShift: !a.disableUpdateOnLayoutShift,
				animationFrame: a.updatePositionStrategy === "always"
			}),
			middleware: A
		}), P = C(() => _e(te.value)[0]), oe = C(() => _e(te.value)[1]);
		e(() => {
			M.value && l("placed");
		});
		let se = C(() => {
			let e = N.value.arrow?.centerOffset !== 0;
			return a.hideShiftedArrow && e;
		}), ce = g("");
		return d(() => {
			p.value && (ce.value = window.getComputedStyle(p.value).zIndex);
		}), sn({
			placedSide: P,
			onArrowChange: (e) => v.value = e,
			arrowX: C(() => N.value.arrow?.x ?? 0),
			arrowY: C(() => N.value.arrow?.y ?? 0),
			shouldHideArrow: se
		}), (e, t) => (c(), r("div", {
			ref_key: "floatingRef",
			ref: h,
			"data-reka-popper-content-wrapper": "",
			dir: w(m),
			style: i({
				...w(j),
				transform: w(M) ? w(j).transform : "translate(0, -200%)",
				minWidth: "max-content",
				zIndex: ce.value,
				"--reka-popper-transform-origin": [w(N).transformOrigin?.x, w(N).transformOrigin?.y].join(" "),
				...w(N).hide?.referenceHidden && {
					visibility: "hidden",
					pointerEvents: "none"
				}
			})
		}, [a.memoDependencies ? y([
			a.asChild,
			a.as,
			P.value,
			oe.value,
			w(M),
			...Object.values(e.$attrs),
			...a.memoDependencies
		], () => (c(), S(w(ne), o({
			key: 0,
			ref: w(f)
		}, e.$attrs, {
			"as-child": a.asChild,
			as: a.as,
			"data-side": P.value,
			"data-align": oe.value,
			style: { animation: w(M) ? void 0 : "none" }
		}), {
			default: _(() => [s(e.$slots, "default")]),
			_: 3
		}, 16, [
			"as-child",
			"as",
			"data-side",
			"data-align",
			"style"
		])), t, 0) : (c(), S(w(ne), o({
			key: 1,
			ref: w(f)
		}, e.$attrs, {
			"as-child": a.asChild,
			as: a.as,
			"data-side": P.value,
			"data-align": oe.value,
			dir: w(m),
			style: { animation: w(M) ? void 0 : "none" }
		}), {
			default: _(() => [s(e.$slots, "default")]),
			_: 3
		}, 16, [
			"as-child",
			"as",
			"data-side",
			"data-align",
			"dir",
			"style"
		]))], 12, rn));
	}
});
export { ue as a, re as c, pe as i, cn as n, oe as o, me as r, ie as s, an as t };
