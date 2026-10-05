import { A as e, D as t, F as n, G as r, H as i, et as a, h as o, m as s, v as c, x as l, xt as ee, yt as u } from "./vendor_vue-OlfIOlFg.js";
function d(e) {
	return e ? e.flatMap((e) => e.type === o ? d(e.children) : [e]) : [];
}
var f = /*#__PURE__*/ t({
	name: "PrimitiveSlot",
	inheritAttrs: !1,
	setup(e, { attrs: t, slots: r }) {
		return () => {
			if (!r.default) return null;
			let e = d(r.default()), i = e.findIndex((e) => e.type !== s);
			if (i === -1) return e;
			let a = e[i];
			delete a.props?.ref;
			let o = a.props ? n(t, a.props) : t, l = c({
				...a,
				props: {}
			}, o);
			return e.length === 1 ? l : (e[i] = l, e);
		};
	}
}), p = [
	"area",
	"img",
	"input"
], m = /*#__PURE__*/ t({
	name: "Primitive",
	inheritAttrs: !1,
	props: {
		asChild: {
			type: Boolean,
			default: !1
		},
		as: {
			type: [String, Object],
			default: "div"
		}
	},
	setup(t, { attrs: n, slots: r }) {
		let i = t.asChild ? "template" : t.as;
		return typeof i == "string" && p.includes(i) ? () => e(i, n) : i === "template" ? () => e(f, n, { default: r.default }) : () => e(t.as, n, { default: r.default });
	}
});
function h(e) {
	var t, n, r = "";
	if (typeof e == "string" || typeof e == "number") r += e;
	else if (typeof e == "object") {
		if (Array.isArray(e)) {
			var i = e.length;
			for (t = 0; t < i; t++) e[t] && (n = h(e[t])) && (r && (r += " "), r += n);
		} else for (n in e) e[n] && (r && (r += " "), r += n);
	}
	return r;
}
function g() {
	for (var e, t, n = 0, r = "", i = arguments.length; n < i; n++) (e = arguments[n]) && (t = h(e)) && (r && (r += " "), r += t);
	return r;
}
var te = (e, t) => {
	let n = Array(e.length + t.length);
	for (let t = 0; t < e.length; t++) n[t] = e[t];
	for (let r = 0; r < t.length; r++) n[e.length + r] = t[r];
	return n;
}, _ = (e, t) => ({
	classGroupId: e,
	validator: t
}), v = (e = /* @__PURE__ */ new Map(), t = null, n) => ({
	nextPart: e,
	validators: t,
	classGroupId: n
}), y = "-", b = [], ne = "arbitrary..", x = (e) => {
	let t = ie(e), { conflictingClassGroups: n, conflictingClassGroupModifiers: r } = e;
	return {
		getClassGroupId: (e) => {
			if (e.startsWith("[") && e.endsWith("]")) return re(e);
			let n = e.split(y);
			return S(n, +(n[0] === "" && n.length > 1), t);
		},
		getConflictingClassGroupIds: (e, t) => {
			if (t) {
				let t = r[e], i = n[e];
				return t ? i ? te(i, t) : t : i || b;
			}
			return n[e] || b;
		}
	};
}, S = (e, t, n) => {
	if (e.length - t === 0) return n.classGroupId;
	let r = e[t], i = n.nextPart.get(r);
	if (i) {
		let n = S(e, t + 1, i);
		if (n) return n;
	}
	let a = n.validators;
	if (a === null) return;
	let o = t === 0 ? e.join(y) : e.slice(t).join(y), s = a.length;
	for (let e = 0; e < s; e++) {
		let t = a[e];
		if (t.validator(o)) return t.classGroupId;
	}
}, re = (e) => e.slice(1, -1).indexOf(":") === -1 ? void 0 : (() => {
	let t = e.slice(1, -1), n = t.indexOf(":"), r = t.slice(0, n);
	return r ? ne + r : void 0;
})(), ie = (e) => {
	let { theme: t, classGroups: n } = e;
	return C(n, t);
}, C = (e, t) => {
	let n = v();
	for (let r in e) {
		let i = e[r];
		w(i, n, r, t);
	}
	return n;
}, w = (e, t, n, r) => {
	let i = e.length;
	for (let a = 0; a < i; a++) {
		let i = e[a];
		T(i, t, n, r);
	}
}, T = (e, t, n, r) => {
	if (typeof e == "string") {
		E(e, t, n);
		return;
	}
	if (typeof e == "function") {
		D(e, t, n, r);
		return;
	}
	O(e, t, n, r);
}, E = (e, t, n) => {
	let r = e === "" ? t : k(t, e);
	r.classGroupId = n;
}, D = (e, t, n, r) => {
	if (A(e)) {
		w(e(r), t, n, r);
		return;
	}
	t.validators === null && (t.validators = []), t.validators.push(_(n, e));
}, O = (e, t, n, r) => {
	let i = Object.entries(e), a = i.length;
	for (let e = 0; e < a; e++) {
		let [a, o] = i[e];
		w(o, k(t, a), n, r);
	}
}, k = (e, t) => {
	let n = e, r = t.split(y), i = r.length;
	for (let e = 0; e < i; e++) {
		let t = r[e], i = n.nextPart.get(t);
		i || (i = v(), n.nextPart.set(t, i)), n = i;
	}
	return n;
}, A = (e) => "isThemeGetter" in e && e.isThemeGetter === !0, j = (e) => {
	if (e < 1) return {
		get: () => void 0,
		set: () => {}
	};
	let t = 0, n = Object.create(null), r = Object.create(null), i = (i, a) => {
		n[i] = a, t++, t > e && (t = 0, r = n, n = Object.create(null));
	};
	return {
		get(e) {
			let t = n[e];
			if (t !== void 0) return t;
			if ((t = r[e]) !== void 0) return i(e, t), t;
		},
		set(e, t) {
			e in n ? n[e] = t : i(e, t);
		}
	};
}, M = "!", N = ":", ae = [], P = (e, t, n, r, i) => ({
	modifiers: e,
	hasImportantModifier: t,
	baseClassName: n,
	maybePostfixModifierPosition: r,
	isExternal: i
}), F = (e) => {
	let { prefix: t, experimentalParseClassName: n } = e, r = (e) => {
		let t = [], n = 0, r = 0, i = 0, a, o = e.length;
		for (let s = 0; s < o; s++) {
			let o = e[s];
			if (n === 0 && r === 0) {
				if (o === N) {
					t.push(e.slice(i, s)), i = s + 1;
					continue;
				}
				if (o === "/") {
					a = s;
					continue;
				}
			}
			o === "[" ? n++ : o === "]" ? n-- : o === "(" ? r++ : o === ")" && r--;
		}
		let s = t.length === 0 ? e : e.slice(i), c = s, l = !1;
		s.endsWith(M) ? (c = s.slice(0, -1), l = !0) : s.startsWith(M) && (c = s.slice(1), l = !0);
		let ee = a && a > i ? a - i : void 0;
		return P(t, l, c, ee);
	};
	if (t) {
		let e = t + N, n = r;
		r = (t) => t.startsWith(e) ? n(t.slice(e.length)) : P(ae, !1, t, void 0, !0);
	}
	if (n) {
		let e = r;
		r = (t) => n({
			className: t,
			parseClassName: e
		});
	}
	return r;
}, I = (e) => {
	let t = /* @__PURE__ */ new Map();
	return e.orderSensitiveModifiers.forEach((e, n) => {
		t.set(e, 1e6 + n);
	}), (e) => {
		let n = [], r = [];
		for (let i = 0; i < e.length; i++) {
			let a = e[i], o = a[0] === "[", s = t.has(a);
			o || s ? (r.length > 0 && (r.sort(), n.push(...r), r = []), n.push(a)) : r.push(a);
		}
		return r.length > 0 && (r.sort(), n.push(...r)), n;
	};
}, L = (e) => ({
	cache: j(e.cacheSize),
	parseClassName: F(e),
	sortModifiers: I(e),
	postfixLookupClassGroupIds: oe(e),
	...x(e)
}), oe = (e) => {
	let t = Object.create(null), n = e.postfixLookupClassGroups;
	if (n) for (let e = 0; e < n.length; e++) t[n[e]] = !0;
	return t;
}, R = /\s+/, se = (e, t) => {
	let { parseClassName: n, getClassGroupId: r, getConflictingClassGroupIds: i, sortModifiers: a, postfixLookupClassGroupIds: o } = t, s = [], c = e.trim().split(R), l = "";
	for (let e = c.length - 1; e >= 0; --e) {
		let t = c[e], { isExternal: ee, modifiers: u, hasImportantModifier: d, baseClassName: f, maybePostfixModifierPosition: p } = n(t);
		if (ee) {
			l = t + (l.length > 0 ? " " + l : l);
			continue;
		}
		let m = !!p, h;
		if (m) {
			h = r(f.substring(0, p));
			let e = h && o[h] ? r(f) : void 0;
			e && e !== h && (h = e, m = !1);
		} else h = r(f);
		if (!h) {
			if (!m) {
				l = t + (l.length > 0 ? " " + l : l);
				continue;
			}
			if (h = r(f), !h) {
				l = t + (l.length > 0 ? " " + l : l);
				continue;
			}
			m = !1;
		}
		let g = u.length === 0 ? "" : u.length === 1 ? u[0] : a(u).join(":"), te = d ? g + M : g, _ = te + h;
		if (s.indexOf(_) > -1) continue;
		s.push(_);
		let v = i(h, m);
		for (let e = 0; e < v.length; ++e) {
			let t = v[e];
			s.push(te + t);
		}
		l = t + (l.length > 0 ? " " + l : l);
	}
	return l;
}, z = (...e) => {
	let t = 0, n, r, i = "";
	for (; t < e.length;) (n = e[t++]) && (r = B(n)) && (i && (i += " "), i += r);
	return i;
}, B = (e) => {
	if (typeof e == "string") return e;
	let t, n = "";
	for (let r = 0; r < e.length; r++) e[r] && (t = B(e[r])) && (n && (n += " "), n += t);
	return n;
}, V = (e, ...t) => {
	let n, r, i, a, o = (o) => (n = L(t.reduce((e, t) => t(e), e())), r = n.cache.get, i = n.cache.set, a = s, s(o)), s = (e) => {
		let t = r(e);
		if (t) return t;
		let a = se(e, n);
		return i(e, a), a;
	};
	return a = o, (...e) => a(z(...e));
}, H = [], U = (e) => {
	let t = (t) => t[e] || H;
	return t.isThemeGetter = !0, t.themeKey = e, t;
}, ce = /^\[(?:(\w[\w-]*):)?(.+)\]$/i, le = /^\((?:(\w[\w-]*):)?(.+)\)$/i, ue = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/, de = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/, fe = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/, pe = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix|color|light-dark)\(.+\)$/, me = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/, he = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/, W = (e) => ue.test(e), G = (e) => !!e && !Number.isNaN(Number(e)), K = (e) => !!e && Number.isInteger(Number(e)), ge = (e) => e.endsWith("%") && G(e.slice(0, -1)), q = (e) => de.test(e), _e = () => !0, ve = (e) => fe.test(e) && !pe.test(e), ye = () => !1, be = (e) => me.test(e), xe = (e) => he.test(e), Se = (e) => !J(e) && !X(e), Ce = (e) => e.startsWith("@container") && (e[10] === "/" && e[11] !== void 0 || e[11] === "s" && e[16] !== void 0 && e.startsWith("-size/", 10) || e[11] === "n" && e[18] !== void 0 && e.startsWith("-normal/", 10)), we = (e) => Q(e, ze, ye), J = (e) => ce.test(e), Y = (e) => Q(e, Be, ve), Te = (e) => Q(e, Ve, G), Ee = (e) => Q(e, Ue, _e), De = (e) => Q(e, He, ye), Oe = (e) => Q(e, Le, ye), ke = (e) => Q(e, Re, xe), Ae = (e) => Q(e, We, be), X = (e) => le.test(e), Z = (e) => $(e, Be), je = (e) => $(e, He), Me = (e) => $(e, Le), Ne = (e) => $(e, ze), Pe = (e) => $(e, Re), Fe = (e) => $(e, We, !0), Ie = (e) => $(e, Ue, !0), Q = (e, t, n) => {
	let r = ce.exec(e);
	return r ? r[1] ? t(r[1]) : n(r[2]) : !1;
}, $ = (e, t, n = !1) => {
	let r = le.exec(e);
	return r ? r[1] ? t(r[1]) : n : !1;
}, Le = (e) => e === "position" || e === "percentage", Re = (e) => e === "image" || e === "url", ze = (e) => e === "length" || e === "size" || e === "bg-size", Be = (e) => e === "length", Ve = (e) => e === "number", He = (e) => e === "family-name", Ue = (e) => e === "number" || e === "weight", We = (e) => e === "shadow", Ge = /*#__PURE__*/ V(() => {
	let e = U("color"), t = U("font"), n = U("text"), r = U("font-weight"), i = U("tracking"), a = U("leading"), o = U("breakpoint"), s = U("container"), c = U("spacing"), l = U("radius"), ee = U("shadow"), u = U("inset-shadow"), d = U("text-shadow"), f = U("drop-shadow"), p = U("blur"), m = U("perspective"), h = U("aspect"), g = U("ease"), te = U("animate"), _ = () => [
		"auto",
		"avoid",
		"all",
		"avoid-page",
		"page",
		"left",
		"right",
		"column"
	], v = () => [
		"center",
		"top",
		"bottom",
		"left",
		"right",
		"top-left",
		"left-top",
		"top-right",
		"right-top",
		"bottom-right",
		"right-bottom",
		"bottom-left",
		"left-bottom"
	], y = () => [
		...v(),
		X,
		J
	], b = () => [
		"auto",
		"hidden",
		"clip",
		"visible",
		"scroll"
	], ne = () => [
		"auto",
		"contain",
		"none"
	], x = () => [
		X,
		J,
		c
	], S = () => [
		W,
		"full",
		"auto",
		...x()
	], re = () => [
		K,
		"none",
		"subgrid",
		X,
		J
	], ie = () => [
		"auto",
		{ span: [
			"full",
			K,
			X,
			J
		] },
		K,
		X,
		J
	], C = () => [
		K,
		"auto",
		X,
		J
	], w = () => [
		"auto",
		"min",
		"max",
		"fr",
		X,
		J
	], T = () => [
		"start",
		"end",
		"center",
		"between",
		"around",
		"evenly",
		"stretch",
		"baseline",
		"center-safe",
		"end-safe"
	], E = () => [
		"start",
		"end",
		"center",
		"stretch",
		"center-safe",
		"end-safe"
	], D = () => ["auto", ...x()], O = () => [
		W,
		"auto",
		"full",
		"dvw",
		"dvh",
		"lvw",
		"lvh",
		"svw",
		"svh",
		"min",
		"max",
		"fit",
		...x()
	], k = () => [
		s,
		W,
		"screen",
		"full",
		"dvw",
		"lvw",
		"svw",
		"min",
		"max",
		"fit",
		...x()
	], A = () => [
		W,
		"screen",
		"full",
		"lh",
		"dvh",
		"lvh",
		"svh",
		"min",
		"max",
		"fit",
		...x()
	], j = () => [
		e,
		X,
		J
	], M = () => [
		...v(),
		Me,
		Oe,
		{ position: [X, J] }
	], N = () => ["no-repeat", { repeat: [
		"",
		"x",
		"y",
		"space",
		"round"
	] }], ae = () => [
		"auto",
		"cover",
		"contain",
		Ne,
		we,
		{ size: [X, J] }
	], P = () => [
		ge,
		Z,
		Y
	], F = () => [
		"",
		"none",
		"full",
		l,
		X,
		J
	], I = () => [
		"",
		G,
		Z,
		Y
	], L = () => [
		"solid",
		"dashed",
		"dotted",
		"double"
	], oe = () => [
		"normal",
		"multiply",
		"screen",
		"overlay",
		"darken",
		"lighten",
		"color-dodge",
		"color-burn",
		"hard-light",
		"soft-light",
		"difference",
		"exclusion",
		"hue",
		"saturation",
		"color",
		"luminosity"
	], R = () => [
		G,
		ge,
		Me,
		Oe
	], se = () => [
		"",
		"none",
		p,
		X,
		J
	], z = () => [
		"none",
		G,
		X,
		J
	], B = () => [
		"none",
		G,
		X,
		J
	], V = () => [
		G,
		X,
		J
	], H = () => [
		W,
		"full",
		...x()
	];
	return {
		cacheSize: 500,
		theme: {
			animate: [
				"spin",
				"ping",
				"pulse",
				"bounce"
			],
			aspect: ["video"],
			blur: [q],
			breakpoint: [q],
			color: [_e],
			container: [q],
			"drop-shadow": [q],
			ease: [
				"in",
				"out",
				"in-out"
			],
			font: [Se],
			"font-weight": [
				"thin",
				"extralight",
				"light",
				"normal",
				"medium",
				"semibold",
				"bold",
				"extrabold",
				"black"
			],
			"inset-shadow": [q],
			leading: [
				"none",
				"tight",
				"snug",
				"normal",
				"relaxed",
				"loose"
			],
			perspective: [
				"dramatic",
				"near",
				"normal",
				"midrange",
				"distant",
				"none"
			],
			radius: [q],
			shadow: [q],
			spacing: ["px", G],
			text: [q],
			"text-shadow": [q],
			tracking: [
				"tighter",
				"tight",
				"normal",
				"wide",
				"wider",
				"widest"
			]
		},
		classGroups: {
			aspect: [{ aspect: [
				"auto",
				"square",
				W,
				J,
				X,
				h
			] }],
			container: ["container"],
			"container-type": [{ "@container": [
				"",
				"normal",
				"size",
				X,
				J
			] }],
			"container-named": [Ce],
			columns: [{ columns: [
				G,
				"auto",
				J,
				X,
				s
			] }],
			"break-after": [{ "break-after": _() }],
			"break-before": [{ "break-before": _() }],
			"break-inside": [{ "break-inside": [
				"auto",
				"avoid",
				"avoid-page",
				"avoid-column"
			] }],
			"box-decoration": [{ "box-decoration": ["slice", "clone"] }],
			box: [{ box: ["border", "content"] }],
			display: [
				"block",
				"inline-block",
				"inline",
				"flex",
				"inline-flex",
				"table",
				"inline-table",
				"table-caption",
				"table-cell",
				"table-column",
				"table-column-group",
				"table-footer-group",
				"table-header-group",
				"table-row-group",
				"table-row",
				"flow-root",
				"grid",
				"inline-grid",
				"contents",
				"list-item",
				"hidden"
			],
			sr: ["sr-only", "not-sr-only"],
			float: [{ float: [
				"right",
				"left",
				"none",
				"start",
				"end"
			] }],
			clear: [{ clear: [
				"left",
				"right",
				"both",
				"none",
				"start",
				"end"
			] }],
			isolation: ["isolate", "isolation-auto"],
			"object-fit": [{ object: [
				"contain",
				"cover",
				"fill",
				"none",
				"scale-down"
			] }],
			"object-position": [{ object: y() }],
			overflow: [{ overflow: b() }],
			"overflow-x": [{ "overflow-x": b() }],
			"overflow-y": [{ "overflow-y": b() }],
			overscroll: [{ overscroll: ne() }],
			"overscroll-x": [{ "overscroll-x": ne() }],
			"overscroll-y": [{ "overscroll-y": ne() }],
			position: [
				"static",
				"fixed",
				"absolute",
				"relative",
				"sticky"
			],
			inset: [{ inset: S() }],
			"inset-x": [{ "inset-x": S() }],
			"inset-y": [{ "inset-y": S() }],
			start: [{
				"inset-s": S(),
				start: S()
			}],
			end: [{
				"inset-e": S(),
				end: S()
			}],
			"inset-bs": [{ "inset-bs": S() }],
			"inset-be": [{ "inset-be": S() }],
			top: [{ top: S() }],
			right: [{ right: S() }],
			bottom: [{ bottom: S() }],
			left: [{ left: S() }],
			visibility: [
				"visible",
				"invisible",
				"collapse"
			],
			z: [{ z: [
				K,
				"auto",
				X,
				J
			] }],
			basis: [{ basis: [
				W,
				"full",
				"auto",
				s,
				...x()
			] }],
			"flex-direction": [{ flex: [
				"row",
				"row-reverse",
				"col",
				"col-reverse"
			] }],
			"flex-wrap": [{ flex: [
				"nowrap",
				"wrap",
				"wrap-reverse"
			] }],
			flex: [{ flex: [
				G,
				W,
				"auto",
				"initial",
				"none",
				J
			] }],
			grow: [{ grow: [
				"",
				G,
				X,
				J
			] }],
			shrink: [{ shrink: [
				"",
				G,
				X,
				J
			] }],
			order: [{ order: [
				K,
				"first",
				"last",
				"none",
				X,
				J
			] }],
			"grid-cols": [{ "grid-cols": re() }],
			"col-start-end": [{ col: ie() }],
			"col-start": [{ "col-start": C() }],
			"col-end": [{ "col-end": C() }],
			"grid-rows": [{ "grid-rows": re() }],
			"row-start-end": [{ row: ie() }],
			"row-start": [{ "row-start": C() }],
			"row-end": [{ "row-end": C() }],
			"grid-flow": [{ "grid-flow": [
				"row",
				"col",
				"dense",
				"row-dense",
				"col-dense"
			] }],
			"auto-cols": [{ "auto-cols": w() }],
			"auto-rows": [{ "auto-rows": w() }],
			gap: [{ gap: x() }],
			"gap-x": [{ "gap-x": x() }],
			"gap-y": [{ "gap-y": x() }],
			"justify-content": [{ justify: [...T(), "normal"] }],
			"justify-items": [{ "justify-items": [...E(), "normal"] }],
			"justify-self": [{ "justify-self": ["auto", ...E()] }],
			"align-content": [{ content: ["normal", ...T()] }],
			"align-items": [{ items: [...E(), { baseline: ["", "last"] }] }],
			"align-self": [{ self: [
				"auto",
				...E(),
				{ baseline: ["", "last"] }
			] }],
			"place-content": [{ "place-content": T() }],
			"place-items": [{ "place-items": [...E(), "baseline"] }],
			"place-self": [{ "place-self": ["auto", ...E()] }],
			p: [{ p: x() }],
			px: [{ px: x() }],
			py: [{ py: x() }],
			ps: [{ ps: x() }],
			pe: [{ pe: x() }],
			pbs: [{ pbs: x() }],
			pbe: [{ pbe: x() }],
			pt: [{ pt: x() }],
			pr: [{ pr: x() }],
			pb: [{ pb: x() }],
			pl: [{ pl: x() }],
			m: [{ m: D() }],
			mx: [{ mx: D() }],
			my: [{ my: D() }],
			ms: [{ ms: D() }],
			me: [{ me: D() }],
			mbs: [{ mbs: D() }],
			mbe: [{ mbe: D() }],
			mt: [{ mt: D() }],
			mr: [{ mr: D() }],
			mb: [{ mb: D() }],
			ml: [{ ml: D() }],
			"space-x": [{ "space-x": x() }],
			"space-x-reverse": ["space-x-reverse"],
			"space-y": [{ "space-y": x() }],
			"space-y-reverse": ["space-y-reverse"],
			size: [{ size: O() }],
			"inline-size": [{ inline: ["auto", ...k()] }],
			"min-inline-size": [{ "min-inline": ["auto", ...k()] }],
			"max-inline-size": [{ "max-inline": ["none", ...k()] }],
			"block-size": [{ block: ["auto", ...A()] }],
			"min-block-size": [{ "min-block": ["auto", ...A()] }],
			"max-block-size": [{ "max-block": ["none", ...A()] }],
			w: [{ w: [
				s,
				"screen",
				...O()
			] }],
			"min-w": [{ "min-w": [
				s,
				"screen",
				"none",
				...O()
			] }],
			"max-w": [{ "max-w": [
				s,
				"screen",
				"none",
				"prose",
				{ screen: [o] },
				...O()
			] }],
			h: [{ h: [
				"screen",
				"lh",
				...O()
			] }],
			"min-h": [{ "min-h": [
				"screen",
				"lh",
				"none",
				...O()
			] }],
			"max-h": [{ "max-h": [
				"screen",
				"lh",
				"none",
				...O()
			] }],
			"font-size": [{ text: [
				"base",
				n,
				Z,
				Y
			] }],
			"font-smoothing": ["antialiased", "subpixel-antialiased"],
			"font-style": ["italic", "not-italic"],
			"font-weight": [{ font: [
				r,
				Ie,
				Ee
			] }],
			"font-stretch": [{ "font-stretch": [
				"ultra-condensed",
				"extra-condensed",
				"condensed",
				"semi-condensed",
				"normal",
				"semi-expanded",
				"expanded",
				"extra-expanded",
				"ultra-expanded",
				ge,
				J
			] }],
			"font-family": [{ font: [
				je,
				De,
				t
			] }],
			"font-features": [{ "font-features": [J] }],
			"fvn-normal": ["normal-nums"],
			"fvn-ordinal": ["ordinal"],
			"fvn-slashed-zero": ["slashed-zero"],
			"fvn-figure": ["lining-nums", "oldstyle-nums"],
			"fvn-spacing": ["proportional-nums", "tabular-nums"],
			"fvn-fraction": ["diagonal-fractions", "stacked-fractions"],
			tracking: [{ tracking: [
				i,
				X,
				J
			] }],
			"line-clamp": [{ "line-clamp": [
				G,
				"none",
				X,
				Te
			] }],
			leading: [{ leading: [
				"none",
				a,
				...x()
			] }],
			"list-image": [{ "list-image": [
				"none",
				X,
				J
			] }],
			"list-style-position": [{ list: ["inside", "outside"] }],
			"list-style-type": [{ list: [
				"disc",
				"decimal",
				"none",
				X,
				J
			] }],
			"text-alignment": [{ text: [
				"left",
				"center",
				"right",
				"justify",
				"start",
				"end"
			] }],
			"placeholder-color": [{ placeholder: j() }],
			"text-color": [{ text: j() }],
			"text-decoration": [
				"underline",
				"overline",
				"line-through",
				"no-underline"
			],
			"text-decoration-style": [{ decoration: [...L(), "wavy"] }],
			"text-decoration-thickness": [{ decoration: [
				G,
				"from-font",
				"auto",
				X,
				Y
			] }],
			"text-decoration-color": [{ decoration: j() }],
			"underline-offset": [{ "underline-offset": [
				G,
				"auto",
				X,
				J
			] }],
			"text-transform": [
				"uppercase",
				"lowercase",
				"capitalize",
				"normal-case"
			],
			"text-overflow": [
				"truncate",
				"text-ellipsis",
				"text-clip"
			],
			"text-wrap": [{ text: [
				"wrap",
				"nowrap",
				"balance",
				"pretty"
			] }],
			indent: [{ indent: x() }],
			"tab-size": [{ tab: [
				K,
				X,
				J
			] }],
			"vertical-align": [{ align: [
				"baseline",
				"top",
				"middle",
				"bottom",
				"text-top",
				"text-bottom",
				"sub",
				"super",
				X,
				J
			] }],
			whitespace: [{ whitespace: [
				"normal",
				"nowrap",
				"pre",
				"pre-line",
				"pre-wrap",
				"break-spaces"
			] }],
			break: [{ break: [
				"normal",
				"words",
				"all",
				"keep"
			] }],
			wrap: [{ wrap: [
				"break-word",
				"anywhere",
				"normal"
			] }],
			hyphens: [{ hyphens: [
				"none",
				"manual",
				"auto"
			] }],
			content: [{ content: [
				"none",
				X,
				J
			] }],
			"bg-attachment": [{ bg: [
				"fixed",
				"local",
				"scroll"
			] }],
			"bg-clip": [{ "bg-clip": [
				"border",
				"padding",
				"content",
				"text"
			] }],
			"bg-origin": [{ "bg-origin": [
				"border",
				"padding",
				"content"
			] }],
			"bg-position": [{ bg: M() }],
			"bg-repeat": [{ bg: N() }],
			"bg-size": [{ bg: ae() }],
			"bg-image": [{ bg: [
				"none",
				{
					linear: [
						{ to: [
							"t",
							"tr",
							"r",
							"br",
							"b",
							"bl",
							"l",
							"tl"
						] },
						K,
						X,
						J
					],
					radial: [
						"",
						X,
						J
					],
					conic: [
						"",
						K,
						X,
						J
					]
				},
				Pe,
				ke
			] }],
			"bg-color": [{ bg: j() }],
			"gradient-from-pos": [{ from: P() }],
			"gradient-via-pos": [{ via: P() }],
			"gradient-to-pos": [{ to: P() }],
			"gradient-from": [{ from: j() }],
			"gradient-via": [{ via: j() }],
			"gradient-to": [{ to: j() }],
			rounded: [{ rounded: F() }],
			"rounded-s": [{ "rounded-s": F() }],
			"rounded-e": [{ "rounded-e": F() }],
			"rounded-t": [{ "rounded-t": F() }],
			"rounded-r": [{ "rounded-r": F() }],
			"rounded-b": [{ "rounded-b": F() }],
			"rounded-l": [{ "rounded-l": F() }],
			"rounded-ss": [{ "rounded-ss": F() }],
			"rounded-se": [{ "rounded-se": F() }],
			"rounded-ee": [{ "rounded-ee": F() }],
			"rounded-es": [{ "rounded-es": F() }],
			"rounded-tl": [{ "rounded-tl": F() }],
			"rounded-tr": [{ "rounded-tr": F() }],
			"rounded-br": [{ "rounded-br": F() }],
			"rounded-bl": [{ "rounded-bl": F() }],
			"border-w": [{ border: I() }],
			"border-w-x": [{ "border-x": I() }],
			"border-w-y": [{ "border-y": I() }],
			"border-w-s": [{ "border-s": I() }],
			"border-w-e": [{ "border-e": I() }],
			"border-w-bs": [{ "border-bs": I() }],
			"border-w-be": [{ "border-be": I() }],
			"border-w-t": [{ "border-t": I() }],
			"border-w-r": [{ "border-r": I() }],
			"border-w-b": [{ "border-b": I() }],
			"border-w-l": [{ "border-l": I() }],
			"divide-x": [{ "divide-x": I() }],
			"divide-x-reverse": ["divide-x-reverse"],
			"divide-y": [{ "divide-y": I() }],
			"divide-y-reverse": ["divide-y-reverse"],
			"border-style": [{ border: [
				...L(),
				"hidden",
				"none"
			] }],
			"divide-style": [{ divide: [
				...L(),
				"hidden",
				"none"
			] }],
			"border-color": [{ border: j() }],
			"border-color-x": [{ "border-x": j() }],
			"border-color-y": [{ "border-y": j() }],
			"border-color-s": [{ "border-s": j() }],
			"border-color-e": [{ "border-e": j() }],
			"border-color-bs": [{ "border-bs": j() }],
			"border-color-be": [{ "border-be": j() }],
			"border-color-t": [{ "border-t": j() }],
			"border-color-r": [{ "border-r": j() }],
			"border-color-b": [{ "border-b": j() }],
			"border-color-l": [{ "border-l": j() }],
			"divide-color": [{ divide: j() }],
			"outline-style": [{ outline: [
				...L(),
				"none",
				"hidden"
			] }],
			"outline-offset": [{ "outline-offset": [
				G,
				X,
				J
			] }],
			"outline-w": [{ outline: [
				"",
				G,
				Z,
				Y
			] }],
			"outline-color": [{ outline: j() }],
			shadow: [{ shadow: [
				"",
				"inner",
				"none",
				ee,
				Fe,
				Ae
			] }],
			"shadow-color": [{ shadow: j() }],
			"inset-shadow": [{ "inset-shadow": [
				"none",
				u,
				Fe,
				Ae
			] }],
			"inset-shadow-color": [{ "inset-shadow": j() }],
			"ring-w": [{ ring: I() }],
			"ring-w-inset": ["ring-inset"],
			"ring-color": [{ ring: j() }],
			"ring-offset-w": [{ "ring-offset": [G, Y] }],
			"ring-offset-color": [{ "ring-offset": j() }],
			"inset-ring-w": [{ "inset-ring": I() }],
			"inset-ring-color": [{ "inset-ring": j() }],
			"text-shadow": [{ "text-shadow": [
				"none",
				d,
				Fe,
				Ae
			] }],
			"text-shadow-color": [{ "text-shadow": j() }],
			opacity: [{ opacity: [
				G,
				X,
				J
			] }],
			"mix-blend": [{ "mix-blend": [
				...oe(),
				"plus-darker",
				"plus-lighter"
			] }],
			"bg-blend": [{ "bg-blend": oe() }],
			"mask-clip": [{ "mask-clip": [
				"border",
				"padding",
				"content",
				"fill",
				"stroke",
				"view"
			] }, "mask-no-clip"],
			"mask-composite": [{ mask: [
				"add",
				"subtract",
				"intersect",
				"exclude"
			] }],
			"mask-image-linear-pos": [{ "mask-linear": [G] }],
			"mask-image-linear-from-pos": [{ "mask-linear-from": R() }],
			"mask-image-linear-to-pos": [{ "mask-linear-to": R() }],
			"mask-image-linear-from-color": [{ "mask-linear-from": j() }],
			"mask-image-linear-to-color": [{ "mask-linear-to": j() }],
			"mask-image-t-from-pos": [{ "mask-t-from": R() }],
			"mask-image-t-to-pos": [{ "mask-t-to": R() }],
			"mask-image-t-from-color": [{ "mask-t-from": j() }],
			"mask-image-t-to-color": [{ "mask-t-to": j() }],
			"mask-image-r-from-pos": [{ "mask-r-from": R() }],
			"mask-image-r-to-pos": [{ "mask-r-to": R() }],
			"mask-image-r-from-color": [{ "mask-r-from": j() }],
			"mask-image-r-to-color": [{ "mask-r-to": j() }],
			"mask-image-b-from-pos": [{ "mask-b-from": R() }],
			"mask-image-b-to-pos": [{ "mask-b-to": R() }],
			"mask-image-b-from-color": [{ "mask-b-from": j() }],
			"mask-image-b-to-color": [{ "mask-b-to": j() }],
			"mask-image-l-from-pos": [{ "mask-l-from": R() }],
			"mask-image-l-to-pos": [{ "mask-l-to": R() }],
			"mask-image-l-from-color": [{ "mask-l-from": j() }],
			"mask-image-l-to-color": [{ "mask-l-to": j() }],
			"mask-image-x-from-pos": [{ "mask-x-from": R() }],
			"mask-image-x-to-pos": [{ "mask-x-to": R() }],
			"mask-image-x-from-color": [{ "mask-x-from": j() }],
			"mask-image-x-to-color": [{ "mask-x-to": j() }],
			"mask-image-y-from-pos": [{ "mask-y-from": R() }],
			"mask-image-y-to-pos": [{ "mask-y-to": R() }],
			"mask-image-y-from-color": [{ "mask-y-from": j() }],
			"mask-image-y-to-color": [{ "mask-y-to": j() }],
			"mask-image-radial": [{ "mask-radial": [X, J] }],
			"mask-image-radial-from-pos": [{ "mask-radial-from": R() }],
			"mask-image-radial-to-pos": [{ "mask-radial-to": R() }],
			"mask-image-radial-from-color": [{ "mask-radial-from": j() }],
			"mask-image-radial-to-color": [{ "mask-radial-to": j() }],
			"mask-image-radial-shape": [{ "mask-radial": ["circle", "ellipse"] }],
			"mask-image-radial-size": [{ "mask-radial": [{
				closest: ["side", "corner"],
				farthest: ["side", "corner"]
			}] }],
			"mask-image-radial-pos": [{ "mask-radial-at": v() }],
			"mask-image-conic-pos": [{ "mask-conic": [G] }],
			"mask-image-conic-from-pos": [{ "mask-conic-from": R() }],
			"mask-image-conic-to-pos": [{ "mask-conic-to": R() }],
			"mask-image-conic-from-color": [{ "mask-conic-from": j() }],
			"mask-image-conic-to-color": [{ "mask-conic-to": j() }],
			"mask-mode": [{ mask: [
				"alpha",
				"luminance",
				"match"
			] }],
			"mask-origin": [{ "mask-origin": [
				"border",
				"padding",
				"content",
				"fill",
				"stroke",
				"view"
			] }],
			"mask-position": [{ mask: M() }],
			"mask-repeat": [{ mask: N() }],
			"mask-size": [{ mask: ae() }],
			"mask-type": [{ "mask-type": ["alpha", "luminance"] }],
			"mask-image": [{ mask: [
				"none",
				X,
				J
			] }],
			filter: [{ filter: [
				"",
				"none",
				X,
				J
			] }],
			blur: [{ blur: se() }],
			brightness: [{ brightness: [
				G,
				X,
				J
			] }],
			contrast: [{ contrast: [
				G,
				X,
				J
			] }],
			"drop-shadow": [{ "drop-shadow": [
				"",
				"none",
				f,
				Fe,
				Ae
			] }],
			"drop-shadow-color": [{ "drop-shadow": j() }],
			grayscale: [{ grayscale: [
				"",
				G,
				X,
				J
			] }],
			"hue-rotate": [{ "hue-rotate": [
				G,
				X,
				J
			] }],
			invert: [{ invert: [
				"",
				G,
				X,
				J
			] }],
			saturate: [{ saturate: [
				G,
				X,
				J
			] }],
			sepia: [{ sepia: [
				"",
				G,
				X,
				J
			] }],
			"backdrop-filter": [{ "backdrop-filter": [
				"",
				"none",
				X,
				J
			] }],
			"backdrop-blur": [{ "backdrop-blur": se() }],
			"backdrop-brightness": [{ "backdrop-brightness": [
				G,
				X,
				J
			] }],
			"backdrop-contrast": [{ "backdrop-contrast": [
				G,
				X,
				J
			] }],
			"backdrop-grayscale": [{ "backdrop-grayscale": [
				"",
				G,
				X,
				J
			] }],
			"backdrop-hue-rotate": [{ "backdrop-hue-rotate": [
				G,
				X,
				J
			] }],
			"backdrop-invert": [{ "backdrop-invert": [
				"",
				G,
				X,
				J
			] }],
			"backdrop-opacity": [{ "backdrop-opacity": [
				G,
				X,
				J
			] }],
			"backdrop-saturate": [{ "backdrop-saturate": [
				G,
				X,
				J
			] }],
			"backdrop-sepia": [{ "backdrop-sepia": [
				"",
				G,
				X,
				J
			] }],
			"border-collapse": [{ border: ["collapse", "separate"] }],
			"border-spacing": [{ "border-spacing": x() }],
			"border-spacing-x": [{ "border-spacing-x": x() }],
			"border-spacing-y": [{ "border-spacing-y": x() }],
			"table-layout": [{ table: ["auto", "fixed"] }],
			caption: [{ caption: ["top", "bottom"] }],
			transition: [{ transition: [
				"",
				"all",
				"colors",
				"opacity",
				"shadow",
				"transform",
				"none",
				X,
				J
			] }],
			"transition-behavior": [{ transition: ["normal", "discrete"] }],
			duration: [{ duration: [
				G,
				"initial",
				X,
				J
			] }],
			ease: [{ ease: [
				"linear",
				"initial",
				g,
				X,
				J
			] }],
			delay: [{ delay: [
				G,
				X,
				J
			] }],
			animate: [{ animate: [
				"none",
				te,
				X,
				J
			] }],
			backface: [{ backface: ["hidden", "visible"] }],
			perspective: [{ perspective: [
				m,
				X,
				J
			] }],
			"perspective-origin": [{ "perspective-origin": y() }],
			rotate: [{ rotate: z() }],
			"rotate-x": [{ "rotate-x": z() }],
			"rotate-y": [{ "rotate-y": z() }],
			"rotate-z": [{ "rotate-z": z() }],
			scale: [{ scale: B() }],
			"scale-x": [{ "scale-x": B() }],
			"scale-y": [{ "scale-y": B() }],
			"scale-z": [{ "scale-z": B() }],
			"scale-3d": ["scale-3d"],
			skew: [{ skew: V() }],
			"skew-x": [{ "skew-x": V() }],
			"skew-y": [{ "skew-y": V() }],
			transform: [{ transform: [
				X,
				J,
				"",
				"none",
				"gpu",
				"cpu"
			] }],
			"transform-origin": [{ origin: y() }],
			"transform-style": [{ transform: ["3d", "flat"] }],
			translate: [{ translate: H() }],
			"translate-x": [{ "translate-x": H() }],
			"translate-y": [{ "translate-y": H() }],
			"translate-z": [{ "translate-z": H() }],
			"translate-none": ["translate-none"],
			zoom: [{ zoom: [
				K,
				X,
				J
			] }],
			accent: [{ accent: j() }],
			appearance: [{ appearance: ["none", "auto"] }],
			"caret-color": [{ caret: j() }],
			"color-scheme": [{ scheme: [
				"normal",
				"dark",
				"light",
				"light-dark",
				"only-dark",
				"only-light"
			] }],
			cursor: [{ cursor: [
				"auto",
				"default",
				"pointer",
				"wait",
				"text",
				"move",
				"help",
				"not-allowed",
				"none",
				"context-menu",
				"progress",
				"cell",
				"crosshair",
				"vertical-text",
				"alias",
				"copy",
				"no-drop",
				"grab",
				"grabbing",
				"all-scroll",
				"col-resize",
				"row-resize",
				"n-resize",
				"e-resize",
				"s-resize",
				"w-resize",
				"ne-resize",
				"nw-resize",
				"se-resize",
				"sw-resize",
				"ew-resize",
				"ns-resize",
				"nesw-resize",
				"nwse-resize",
				"zoom-in",
				"zoom-out",
				X,
				J
			] }],
			"field-sizing": [{ "field-sizing": ["fixed", "content"] }],
			"pointer-events": [{ "pointer-events": ["auto", "none"] }],
			resize: [{ resize: [
				"none",
				"",
				"y",
				"x"
			] }],
			"scroll-behavior": [{ scroll: ["auto", "smooth"] }],
			"scrollbar-thumb-color": [{ "scrollbar-thumb": j() }],
			"scrollbar-track-color": [{ "scrollbar-track": j() }],
			"scrollbar-gutter": [{ "scrollbar-gutter": [
				"auto",
				"stable",
				"both"
			] }],
			"scrollbar-w": [{ scrollbar: [
				"auto",
				"thin",
				"none"
			] }],
			"scroll-m": [{ "scroll-m": x() }],
			"scroll-mx": [{ "scroll-mx": x() }],
			"scroll-my": [{ "scroll-my": x() }],
			"scroll-ms": [{ "scroll-ms": x() }],
			"scroll-me": [{ "scroll-me": x() }],
			"scroll-mbs": [{ "scroll-mbs": x() }],
			"scroll-mbe": [{ "scroll-mbe": x() }],
			"scroll-mt": [{ "scroll-mt": x() }],
			"scroll-mr": [{ "scroll-mr": x() }],
			"scroll-mb": [{ "scroll-mb": x() }],
			"scroll-ml": [{ "scroll-ml": x() }],
			"scroll-p": [{ "scroll-p": x() }],
			"scroll-px": [{ "scroll-px": x() }],
			"scroll-py": [{ "scroll-py": x() }],
			"scroll-ps": [{ "scroll-ps": x() }],
			"scroll-pe": [{ "scroll-pe": x() }],
			"scroll-pbs": [{ "scroll-pbs": x() }],
			"scroll-pbe": [{ "scroll-pbe": x() }],
			"scroll-pt": [{ "scroll-pt": x() }],
			"scroll-pr": [{ "scroll-pr": x() }],
			"scroll-pb": [{ "scroll-pb": x() }],
			"scroll-pl": [{ "scroll-pl": x() }],
			"snap-align": [{ snap: [
				"start",
				"end",
				"center",
				"align-none"
			] }],
			"snap-stop": [{ snap: ["normal", "always"] }],
			"snap-type": [{ snap: [
				"none",
				"x",
				"y",
				"both"
			] }],
			"snap-strictness": [{ snap: ["mandatory", "proximity"] }],
			touch: [{ touch: [
				"auto",
				"none",
				"manipulation"
			] }],
			"touch-x": [{ "touch-pan": [
				"x",
				"left",
				"right"
			] }],
			"touch-y": [{ "touch-pan": [
				"y",
				"up",
				"down"
			] }],
			"touch-pz": ["touch-pinch-zoom"],
			select: [{ select: [
				"none",
				"text",
				"all",
				"auto"
			] }],
			"will-change": [{ "will-change": [
				"auto",
				"scroll",
				"contents",
				"transform",
				X,
				J
			] }],
			fill: [{ fill: ["none", ...j()] }],
			"stroke-w": [{ stroke: [
				G,
				Z,
				Y,
				Te
			] }],
			stroke: [{ stroke: ["none", ...j()] }],
			"forced-color-adjust": [{ "forced-color-adjust": ["auto", "none"] }]
		},
		conflictingClassGroups: {
			"container-named": ["container-type"],
			overflow: ["overflow-x", "overflow-y"],
			overscroll: ["overscroll-x", "overscroll-y"],
			inset: [
				"inset-x",
				"inset-y",
				"inset-bs",
				"inset-be",
				"start",
				"end",
				"top",
				"right",
				"bottom",
				"left"
			],
			"inset-x": [
				"start",
				"end",
				"right",
				"left"
			],
			"inset-y": [
				"inset-bs",
				"inset-be",
				"top",
				"bottom"
			],
			flex: [
				"basis",
				"grow",
				"shrink"
			],
			gap: ["gap-x", "gap-y"],
			p: [
				"px",
				"py",
				"ps",
				"pe",
				"pbs",
				"pbe",
				"pt",
				"pr",
				"pb",
				"pl"
			],
			px: [
				"ps",
				"pe",
				"pr",
				"pl"
			],
			py: [
				"pbs",
				"pbe",
				"pt",
				"pb"
			],
			m: [
				"mx",
				"my",
				"ms",
				"me",
				"mbs",
				"mbe",
				"mt",
				"mr",
				"mb",
				"ml"
			],
			mx: [
				"ms",
				"me",
				"mr",
				"ml"
			],
			my: [
				"mbs",
				"mbe",
				"mt",
				"mb"
			],
			size: ["w", "h"],
			"font-size": ["leading"],
			"fvn-normal": [
				"fvn-ordinal",
				"fvn-slashed-zero",
				"fvn-figure",
				"fvn-spacing",
				"fvn-fraction"
			],
			"fvn-ordinal": ["fvn-normal"],
			"fvn-slashed-zero": ["fvn-normal"],
			"fvn-figure": ["fvn-normal"],
			"fvn-spacing": ["fvn-normal"],
			"fvn-fraction": ["fvn-normal"],
			"line-clamp": ["display", "overflow"],
			rounded: [
				"rounded-s",
				"rounded-e",
				"rounded-t",
				"rounded-r",
				"rounded-b",
				"rounded-l",
				"rounded-ss",
				"rounded-se",
				"rounded-ee",
				"rounded-es",
				"rounded-tl",
				"rounded-tr",
				"rounded-br",
				"rounded-bl"
			],
			"rounded-s": ["rounded-ss", "rounded-es"],
			"rounded-e": ["rounded-se", "rounded-ee"],
			"rounded-t": ["rounded-tl", "rounded-tr"],
			"rounded-r": ["rounded-tr", "rounded-br"],
			"rounded-b": ["rounded-br", "rounded-bl"],
			"rounded-l": ["rounded-tl", "rounded-bl"],
			"border-spacing": ["border-spacing-x", "border-spacing-y"],
			"border-w": [
				"border-w-x",
				"border-w-y",
				"border-w-s",
				"border-w-e",
				"border-w-bs",
				"border-w-be",
				"border-w-t",
				"border-w-r",
				"border-w-b",
				"border-w-l"
			],
			"border-w-x": [
				"border-w-s",
				"border-w-e",
				"border-w-r",
				"border-w-l"
			],
			"border-w-y": [
				"border-w-bs",
				"border-w-be",
				"border-w-t",
				"border-w-b"
			],
			"border-color": [
				"border-color-x",
				"border-color-y",
				"border-color-s",
				"border-color-e",
				"border-color-bs",
				"border-color-be",
				"border-color-t",
				"border-color-r",
				"border-color-b",
				"border-color-l"
			],
			"border-color-x": [
				"border-color-s",
				"border-color-e",
				"border-color-r",
				"border-color-l"
			],
			"border-color-y": [
				"border-color-bs",
				"border-color-be",
				"border-color-t",
				"border-color-b"
			],
			translate: [
				"translate-x",
				"translate-y",
				"translate-none"
			],
			"translate-none": [
				"translate",
				"translate-x",
				"translate-y",
				"translate-z"
			],
			"scroll-m": [
				"scroll-mx",
				"scroll-my",
				"scroll-ms",
				"scroll-me",
				"scroll-mbs",
				"scroll-mbe",
				"scroll-mt",
				"scroll-mr",
				"scroll-mb",
				"scroll-ml"
			],
			"scroll-mx": [
				"scroll-ms",
				"scroll-me",
				"scroll-mr",
				"scroll-ml"
			],
			"scroll-my": [
				"scroll-mbs",
				"scroll-mbe",
				"scroll-mt",
				"scroll-mb"
			],
			"scroll-p": [
				"scroll-px",
				"scroll-py",
				"scroll-ps",
				"scroll-pe",
				"scroll-pbs",
				"scroll-pbe",
				"scroll-pt",
				"scroll-pr",
				"scroll-pb",
				"scroll-pl"
			],
			"scroll-px": [
				"scroll-ps",
				"scroll-pe",
				"scroll-pr",
				"scroll-pl"
			],
			"scroll-py": [
				"scroll-pbs",
				"scroll-pbe",
				"scroll-pt",
				"scroll-pb"
			],
			touch: [
				"touch-x",
				"touch-y",
				"touch-pz"
			],
			"touch-x": ["touch"],
			"touch-y": ["touch"],
			"touch-pz": ["touch"]
		},
		conflictingClassGroupModifiers: { "font-size": ["leading"] },
		postfixLookupClassGroups: ["container-type"],
		orderSensitiveModifiers: [
			"*",
			"**",
			"after",
			"backdrop",
			"before",
			"details-content",
			"file",
			"first-letter",
			"first-line",
			"marker",
			"placeholder",
			"selection"
		]
	};
});
function Ke(...e) {
	return Ge(g(e));
}
var qe = (e) => typeof e == "boolean" ? `${e}` : e === 0 ? "0" : e, Je = g, Ye = ((e, t) => (n) => {
	if (t?.variants == null) return Je(e, n?.class, n?.className);
	let { variants: r, defaultVariants: i } = t, a = Object.keys(r).map((e) => {
		let t = n?.[e], a = i?.[e];
		if (t === null) return null;
		let o = qe(t) || qe(a);
		return r[e][o];
	}), o = n && Object.entries(n).reduce((e, t) => {
		let [n, r] = t;
		return r === void 0 || (e[n] = r), e;
	}, {});
	return Je(e, a, t?.compoundVariants?.reduce((e, t) => {
		let { class: n, className: r, ...a } = t;
		return Object.entries(a).every((e) => {
			let [t, n] = e;
			return Array.isArray(n) ? n.includes({
				...i,
				...o
			}[t]) : {
				...i,
				...o
			}[t] === n;
		}) ? [
			...e,
			n,
			r
		] : e;
	}, []), n?.class, n?.className);
})("inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50", {
	variants: {
		variant: {
			default: "bg-primary text-primary-foreground hover:bg-primary/90",
			destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
			outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
			secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
			ghost: "hover:bg-accent hover:text-accent-foreground",
			link: "text-primary underline-offset-4 hover:underline"
		},
		size: {
			default: "h-10 px-4 py-2",
			xs: "h-7 rounded px-2",
			sm: "h-9 rounded-md px-3",
			lg: "h-11 rounded-md px-8",
			icon: "h-10 w-10"
		}
	},
	defaultVariants: {
		variant: "default",
		size: "default"
	}
}), Xe = /* @__PURE__ */ t({
	__name: "Button",
	props: {
		variant: {},
		size: {},
		class: { type: [
			Boolean,
			null,
			String,
			Object,
			Array
		] },
		asChild: { type: Boolean },
		as: { default: "button" }
	},
	setup(e) {
		let t = e;
		return (n, o) => (i(), l(u(m), {
			as: e.as,
			"as-child": e.asChild,
			class: ee(u(Ke)(u(Ye)({
				variant: e.variant,
				size: e.size
			}), t.class, "cursor-pointer"))
		}, {
			default: a(() => [r(n.$slots, "default")]),
			_: 3
		}, 8, [
			"as",
			"as-child",
			"class"
		]));
	}
});
export { f as a, m as i, Ye as n, d as o, Ke as r, Xe as t };
