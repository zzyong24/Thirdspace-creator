import { t as e } from "./purify.es-CcTd0BvO.js";
import "./src-CKkAgJ42.js";
import { i as t, n, t as r } from "./chunk-X3CZISLH-CyeAZ9SC.js";
import { S as i, a, d as o, f as s, g as c, h as l, i as u, o as d, v as f, x as p, y as m } from "./chunk-ZIGJFQKS-B1q1oAt1.js";
import { n as h } from "./chunk-Y2CYZVJY-BAmSaPLl.js";
import { $ as g, C as _, E as v, I as y, J as b, K as x, L as S, N as C, P as w, Q as T, S as E, T as D, V as O, W as k, Z as A, _ as j, b as M, c as N, f as ee, g as P, l as F, m as I, n as L, p as R, r as te, s as ne, t as re, u as ie, x as ae } from "./chunk-O7XYJQB3-CuTSgmsg.js";
import { r as oe } from "./chunk-742MDFTN-BDr8Hm9g.js";
import { a as se } from "./chunk-MBY4JIJT-DOzZpBoU.js";
import { t as ce } from "./chunk-DUW6YSOI-BwFt7zlA.js";
import "./chunk-7PRAP22T-B1ndr8eL.js";
import { o as le } from "./chunk-7INBJB4K-CUqQ2Lhw.js";
import { r as ue } from "./chunk-5DYCD2WN-H1yJbv79.js";
import { a as de, c as fe, i as pe, l as z } from "./chunk-Z7XXMR3K-BQOjLvhe.js";
import { r as me } from "./chunk-UA2S7LBM-CkbQfO34.js";
var he = /* @__PURE__ */ h((e) => {
	let { securityLevel: n } = ae(), r = t("body");
	if (n === "sandbox") {
		let n = t(`#i${e}`).node()?.contentDocument ?? document;
		r = t(n.body);
	}
	return r.select(`#${e}`);
}, "selectSvgElement");
function ge(e) {
	let t = e?.constructor;
	return e === (typeof t == "function" ? t.prototype : Object.prototype);
}
function _e(e) {
	if (e == null) return !0;
	if (p(e)) return typeof e.splice != "function" && typeof e != "string" && !i(e) && !f(e) && !m(e) ? !1 : e.length === 0;
	if (typeof e == "object" || typeof e == "function") {
		if (e instanceof Map || e instanceof Set) return e.size === 0;
		let t = Object.keys(e);
		return ge(e) ? t.filter((e) => e !== "constructor").length === 0 : t.length === 0;
	}
	return !0;
}
var ve = {
	common: ne,
	getConfig: M,
	insertCluster: me,
	insertEdge: pe,
	insertEdgeLabel: de,
	insertMarkers: fe,
	insertNode: ue,
	interpolateToCurve: o,
	labelHelper: le,
	log: r,
	positionEdgeLabel: z
}, ye = [
	"elk.stress",
	"elk.force",
	"elk.mrtree",
	"elk.sporeOverlap",
	"elk.box",
	"elk.rectpacking"
], be = /* @__PURE__ */ Object.create(null), xe = /* @__PURE__ */ h((e) => {
	for (let t of e) be[t.name] = t;
}, "registerLayoutLoaders"), Se = /* @__PURE__ */ h(() => {
	let e = /* @__PURE__ */ h(async () => await import("./elk-276RUBZZ-DDCgGmyj.js"), "loader");
	return [{
		name: "elk",
		loader: e,
		algorithm: "elk.layered"
	}, ...ye.map((t) => ({
		name: t,
		loader: e,
		algorithm: t
	}))];
}, "elkLayoutLoaders");
(/* @__PURE__ */ h(() => {
	xe([
		{
			name: "dagre",
			loader: /* @__PURE__ */ h(async () => await import("./dagre-6A5THRUB-Cw7jr7x-.js"), "loader")
		},
		{
			name: "swimlane",
			loader: /* @__PURE__ */ h(async () => await import("./swimlanes-2SLR337P-h7AlebHt.js"), "loader")
		},
		{
			name: "cose-bilkent",
			loader: /* @__PURE__ */ h(async () => await import("./cose-bilkent-JH36ORCC-CyOPQ0AF.js"), "loader")
		},
		...Se()
	]);
}, "registerDefaultLayoutLoaders"))();
var Ce = /* @__PURE__ */ h(async (e, t) => {
	if (!Object.hasOwn(be, e.layoutAlgorithm)) throw Error(`Unknown layout algorithm: ${e.layoutAlgorithm}`);
	if (e.diagramId) for (let t of e.nodes) {
		let n = t.domId || t.id;
		t.domId = `${e.diagramId}-${n}`;
	}
	let n = be[e.layoutAlgorithm], r = await n.loader();
	return ce(t, e.config), r.render(e, t, ve, { algorithm: n.algorithm });
}, "render"), we = "dagre", Te = /* @__PURE__ */ h((e = "", { fallback: t = we } = {}) => {
	if (Object.hasOwn(be, e)) return e;
	for (let n of [t, we]) if (Object.hasOwn(be, n)) return r.warn(`Layout algorithm ${e} is not registered. Using ${n} as fallback.`), n;
	throw Error(`Neither layout algorithm ${e}, ${t}, nor ${we} is registered.`);
}, "getRegisteredLayoutAlgorithm");
function Ee(e) {
	return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, "default") ? e.default : e;
}
h(Ee, "getDefaultExportFromCjs");
var B = {}, De = {}, V = {}, Oe;
function H() {
	if (Oe) return V;
	Oe = 1;
	function e(e) {
		return e == null;
	}
	h(e, "isNothing");
	function t(e) {
		return typeof e == "object" && !!e;
	}
	h(t, "isObject");
	function n(t) {
		return Array.isArray(t) ? t : e(t) ? [] : [t];
	}
	h(n, "toArray");
	function r(e, t) {
		if (t) {
			let n = Object.keys(t);
			for (let r = 0, i = n.length; r < i; r += 1) {
				let i = n[r];
				e[i] = t[i];
			}
		}
		return e;
	}
	h(r, "extend");
	function i(e, t) {
		let n = "";
		for (let r = 0; r < t; r += 1) n += e;
		return n;
	}
	h(i, "repeat");
	function a(e) {
		return e === 0 && 1 / e == -Infinity;
	}
	return h(a, "isNegativeZero"), V.isNothing = e, V.isObject = t, V.toArray = n, V.repeat = i, V.isNegativeZero = a, V.extend = r, V;
}
h(H, "requireCommon");
var ke, Ae;
function U() {
	if (Ae) return ke;
	Ae = 1;
	function e(e, t) {
		let n = "", r = e.reason || "(unknown reason)";
		return e.mark ? (e.mark.name && (n += "in \"" + e.mark.name + "\" "), n += "(" + (e.mark.line + 1) + ":" + (e.mark.column + 1) + ")", !t && e.mark.snippet && (n += "\n\n" + e.mark.snippet), r + " " + n) : r;
	}
	h(e, "formatError");
	function t(t, n) {
		Error.call(this), this.name = "YAMLException", this.reason = t, this.mark = n, this.message = e(this, !1), Error.captureStackTrace ? Error.captureStackTrace(this, this.constructor) : this.stack = (/* @__PURE__ */ Error()).stack || "";
	}
	return h(t, "YAMLException2"), t.prototype = Object.create(Error.prototype), t.prototype.constructor = t, t.prototype.toString = /* @__PURE__ */ h(function(t) {
		return this.name + ": " + e(this, t);
	}, "toString"), ke = t, ke;
}
h(U, "requireException");
var je, Me;
function Ne() {
	if (Me) return je;
	Me = 1;
	let e = H();
	function t(e, t, n, r, i) {
		let a = "", o = "", s = Math.floor(i / 2) - 1;
		return r - t > s && (a = " ... ", t = r - s + a.length), n - r > s && (o = " ...", n = r + s - o.length), {
			str: a + e.slice(t, n).replace(/\t/g, "→") + o,
			pos: r - t + a.length
		};
	}
	h(t, "getLine");
	function n(t, n) {
		return e.repeat(" ", n - t.length) + t;
	}
	h(n, "padStart");
	function r(r, i) {
		if (i = Object.create(i || null), !r.buffer) return null;
		i.maxLength || (i.maxLength = 79), typeof i.indent != "number" && (i.indent = 1), typeof i.linesBefore != "number" && (i.linesBefore = 3), typeof i.linesAfter != "number" && (i.linesAfter = 2);
		let a = /\r?\n|\r|\0/g, o = [0], s = [], c, l = -1;
		for (; c = a.exec(r.buffer);) s.push(c.index), o.push(c.index + c[0].length), r.position <= c.index && l < 0 && (l = o.length - 2);
		l < 0 && (l = o.length - 1);
		let u = "", d = Math.min(r.line + i.linesAfter, s.length).toString().length, f = i.maxLength - (i.indent + d + 3);
		for (let a = 1; a <= i.linesBefore && !(l - a < 0); a++) {
			let c = t(r.buffer, o[l - a], s[l - a], r.position - (o[l] - o[l - a]), f);
			u = e.repeat(" ", i.indent) + n((r.line - a + 1).toString(), d) + " | " + c.str + "\n" + u;
		}
		let p = t(r.buffer, o[l], s[l], r.position, f);
		u += e.repeat(" ", i.indent) + n((r.line + 1).toString(), d) + " | " + p.str + "\n", u += e.repeat("-", i.indent + d + 3 + p.pos) + "^\n";
		for (let a = 1; a <= i.linesAfter && !(l + a >= s.length); a++) {
			let c = t(r.buffer, o[l + a], s[l + a], r.position - (o[l] - o[l + a]), f);
			u += e.repeat(" ", i.indent) + n((r.line + a + 1).toString(), d) + " | " + c.str + "\n";
		}
		return u.replace(/\n$/, "");
	}
	return h(r, "makeSnippet"), je = r, je;
}
h(Ne, "requireSnippet");
var Pe, Fe;
function W() {
	if (Fe) return Pe;
	Fe = 1;
	let e = U(), t = [
		"kind",
		"multi",
		"resolve",
		"construct",
		"instanceOf",
		"predicate",
		"represent",
		"representName",
		"defaultStyle",
		"styleAliases"
	], n = [
		"scalar",
		"sequence",
		"mapping"
	];
	function r(e) {
		let t = {};
		return e !== null && Object.keys(e).forEach(function(n) {
			e[n].forEach(function(e) {
				t[String(e)] = n;
			});
		}), t;
	}
	h(r, "compileStyleAliases");
	function i(i, a) {
		if (a ||= {}, Object.keys(a).forEach(function(n) {
			if (t.indexOf(n) === -1) throw new e("Unknown option \"" + n + "\" is met in definition of \"" + i + "\" YAML type.");
		}), this.options = a, this.tag = i, this.kind = a.kind || null, this.resolve = a.resolve || function() {
			return !0;
		}, this.construct = a.construct || function(e) {
			return e;
		}, this.instanceOf = a.instanceOf || null, this.predicate = a.predicate || null, this.represent = a.represent || null, this.representName = a.representName || null, this.defaultStyle = a.defaultStyle || null, this.multi = a.multi || !1, this.styleAliases = r(a.styleAliases || null), n.indexOf(this.kind) === -1) throw new e("Unknown kind \"" + this.kind + "\" is specified for \"" + i + "\" YAML type.");
	}
	return h(i, "Type2"), Pe = i, Pe;
}
h(W, "requireType");
var Ie, Le;
function Re() {
	if (Le) return Ie;
	Le = 1;
	let e = U(), t = W();
	function n(e, t) {
		let n = [];
		return e[t].forEach(function(e) {
			let t = n.length;
			n.forEach(function(n, r) {
				n.tag === e.tag && n.kind === e.kind && n.multi === e.multi && (t = r);
			}), n[t] = e;
		}), n;
	}
	h(n, "compileList");
	function r() {
		let e = {
			scalar: {},
			sequence: {},
			mapping: {},
			fallback: {},
			multi: {
				scalar: [],
				sequence: [],
				mapping: [],
				fallback: []
			}
		};
		function t(t) {
			t.multi ? (e.multi[t.kind].push(t), e.multi.fallback.push(t)) : e[t.kind][t.tag] = e.fallback[t.tag] = t;
		}
		h(t, "collectType");
		for (let e = 0, n = arguments.length; e < n; e += 1) arguments[e].forEach(t);
		return e;
	}
	h(r, "compileMap");
	function i(e) {
		return this.extend(e);
	}
	return h(i, "Schema2"), i.prototype.extend = /* @__PURE__ */ h(function(a) {
		let o = [], s = [];
		if (a instanceof t) s.push(a);
		else if (Array.isArray(a)) s = s.concat(a);
		else if (a && (Array.isArray(a.implicit) || Array.isArray(a.explicit))) a.implicit && (o = o.concat(a.implicit)), a.explicit && (s = s.concat(a.explicit));
		else throw new e("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
		o.forEach(function(n) {
			if (!(n instanceof t)) throw new e("Specified list of YAML types (or a single Type object) contains a non-Type object.");
			if (n.loadKind && n.loadKind !== "scalar") throw new e("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
			if (n.multi) throw new e("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
		}), s.forEach(function(n) {
			if (!(n instanceof t)) throw new e("Specified list of YAML types (or a single Type object) contains a non-Type object.");
		});
		let c = Object.create(i.prototype);
		return c.implicit = (this.implicit || []).concat(o), c.explicit = (this.explicit || []).concat(s), c.compiledImplicit = n(c, "implicit"), c.compiledExplicit = n(c, "explicit"), c.compiledTypeMap = r(c.compiledImplicit, c.compiledExplicit), c;
	}, "extend"), Ie = i, Ie;
}
h(Re, "requireSchema");
var ze, Be;
function Ve() {
	return Be ? ze : (Be = 1, ze = new (W())("tag:yaml.org,2002:str", {
		kind: "scalar",
		construct: /* @__PURE__ */ h(function(e) {
			return e === null ? "" : e;
		}, "construct")
	}), ze);
}
h(Ve, "requireStr");
var He, Ue;
function We() {
	return Ue ? He : (Ue = 1, He = new (W())("tag:yaml.org,2002:seq", {
		kind: "sequence",
		construct: /* @__PURE__ */ h(function(e) {
			return e === null ? [] : e;
		}, "construct")
	}), He);
}
h(We, "requireSeq");
var Ge, Ke;
function qe() {
	return Ke ? Ge : (Ke = 1, Ge = new (W())("tag:yaml.org,2002:map", {
		kind: "mapping",
		construct: /* @__PURE__ */ h(function(e) {
			return e === null ? {} : e;
		}, "construct")
	}), Ge);
}
h(qe, "requireMap");
var Je, Ye;
function Xe() {
	return Ye ? Je : (Ye = 1, Je = new (Re())({ explicit: [
		Ve(),
		We(),
		qe()
	] }), Je);
}
h(Xe, "requireFailsafe");
var Ze, Qe;
function $e() {
	if (Qe) return Ze;
	Qe = 1;
	let e = W();
	function t(e) {
		if (e === null) return !0;
		let t = e.length;
		return t === 1 && e === "~" || t === 4 && (e === "null" || e === "Null" || e === "NULL");
	}
	h(t, "resolveYamlNull");
	function n() {
		return null;
	}
	h(n, "constructYamlNull");
	function r(e) {
		return e === null;
	}
	return h(r, "isNull"), Ze = new e("tag:yaml.org,2002:null", {
		kind: "scalar",
		resolve: t,
		construct: n,
		predicate: r,
		represent: {
			canonical: /* @__PURE__ */ h(function() {
				return "~";
			}, "canonical"),
			lowercase: /* @__PURE__ */ h(function() {
				return "null";
			}, "lowercase"),
			uppercase: /* @__PURE__ */ h(function() {
				return "NULL";
			}, "uppercase"),
			camelcase: /* @__PURE__ */ h(function() {
				return "Null";
			}, "camelcase"),
			empty: /* @__PURE__ */ h(function() {
				return "";
			}, "empty")
		},
		defaultStyle: "lowercase"
	}), Ze;
}
h($e, "require_null");
var et, tt;
function nt() {
	if (tt) return et;
	tt = 1;
	let e = W();
	function t(e) {
		if (e === null) return !1;
		let t = e.length;
		return t === 4 && (e === "true" || e === "True" || e === "TRUE") || t === 5 && (e === "false" || e === "False" || e === "FALSE");
	}
	h(t, "resolveYamlBoolean");
	function n(e) {
		return e === "true" || e === "True" || e === "TRUE";
	}
	h(n, "constructYamlBoolean");
	function r(e) {
		return Object.prototype.toString.call(e) === "[object Boolean]";
	}
	return h(r, "isBoolean"), et = new e("tag:yaml.org,2002:bool", {
		kind: "scalar",
		resolve: t,
		construct: n,
		predicate: r,
		represent: {
			lowercase: /* @__PURE__ */ h(function(e) {
				return e ? "true" : "false";
			}, "lowercase"),
			uppercase: /* @__PURE__ */ h(function(e) {
				return e ? "TRUE" : "FALSE";
			}, "uppercase"),
			camelcase: /* @__PURE__ */ h(function(e) {
				return e ? "True" : "False";
			}, "camelcase")
		},
		defaultStyle: "lowercase"
	}), et;
}
h(nt, "requireBool");
var rt, it;
function at() {
	if (it) return rt;
	it = 1;
	let e = H(), t = W();
	function n(e) {
		return e >= 48 && e <= 57 || e >= 65 && e <= 70 || e >= 97 && e <= 102;
	}
	h(n, "isHexCode");
	function r(e) {
		return e >= 48 && e <= 55;
	}
	h(r, "isOctCode");
	function i(e) {
		return e >= 48 && e <= 57;
	}
	h(i, "isDecCode");
	function a(e) {
		if (e === null) return !1;
		let t = e.length, a = 0, s = !1;
		if (!t) return !1;
		let c = e[a];
		if ((c === "-" || c === "+") && (c = e[++a]), c === "0") {
			if (a + 1 === t) return !0;
			if (c = e[++a], c === "b") {
				for (a++; a < t; a++) {
					if (c = e[a], c !== "0" && c !== "1") return !1;
					s = !0;
				}
				return s && isFinite(o(e));
			}
			if (c === "x") {
				for (a++; a < t; a++) {
					if (!n(e.charCodeAt(a))) return !1;
					s = !0;
				}
				return s && isFinite(o(e));
			}
			if (c === "o") {
				for (a++; a < t; a++) {
					if (!r(e.charCodeAt(a))) return !1;
					s = !0;
				}
				return s && isFinite(o(e));
			}
		}
		for (; a < t; a++) {
			if (!i(e.charCodeAt(a))) return !1;
			s = !0;
		}
		return s ? isFinite(o(e)) : !1;
	}
	h(a, "resolveYamlInteger");
	function o(e) {
		let t = e, n = 1, r = t[0];
		if ((r === "-" || r === "+") && (r === "-" && (n = -1), t = t.slice(1), r = t[0]), t === "0") return 0;
		if (r === "0") {
			if (t[1] === "b") return n * parseInt(t.slice(2), 2);
			if (t[1] === "x") return n * parseInt(t.slice(2), 16);
			if (t[1] === "o") return n * parseInt(t.slice(2), 8);
		}
		return n * parseInt(t, 10);
	}
	h(o, "parseYamlInteger");
	function s(e) {
		return o(e);
	}
	h(s, "constructYamlInteger");
	function c(t) {
		return Object.prototype.toString.call(t) === "[object Number]" && t % 1 == 0 && !e.isNegativeZero(t);
	}
	return h(c, "isInteger"), rt = new t("tag:yaml.org,2002:int", {
		kind: "scalar",
		resolve: a,
		construct: s,
		predicate: c,
		represent: {
			binary: /* @__PURE__ */ h(function(e) {
				return e >= 0 ? "0b" + e.toString(2) : "-0b" + e.toString(2).slice(1);
			}, "binary"),
			octal: /* @__PURE__ */ h(function(e) {
				return e >= 0 ? "0o" + e.toString(8) : "-0o" + e.toString(8).slice(1);
			}, "octal"),
			decimal: /* @__PURE__ */ h(function(e) {
				return e.toString(10);
			}, "decimal"),
			hexadecimal: /* @__PURE__ */ h(function(e) {
				return e >= 0 ? "0x" + e.toString(16).toUpperCase() : "-0x" + e.toString(16).toUpperCase().slice(1);
			}, "hexadecimal")
		},
		defaultStyle: "decimal",
		styleAliases: {
			binary: [2, "bin"],
			octal: [8, "oct"],
			decimal: [10, "dec"],
			hexadecimal: [16, "hex"]
		}
	}), rt;
}
h(at, "requireInt");
var ot, st;
function ct() {
	if (st) return ot;
	st = 1;
	let e = H(), t = W(), n = /* @__PURE__ */ RegExp("^(?:[-+]?(?:[0-9]+)(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"), r = /* @__PURE__ */ RegExp("^(?:[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
	function i(e) {
		return e === null || !n.test(e) ? !1 : isFinite(parseFloat(e, 10)) ? !0 : r.test(e);
	}
	h(i, "resolveYamlFloat");
	function a(e) {
		let t = e.toLowerCase(), n = t[0] === "-" ? -1 : 1;
		return "+-".indexOf(t[0]) >= 0 && (t = t.slice(1)), t === ".inf" ? n === 1 ? Infinity : -Infinity : t === ".nan" ? NaN : n * parseFloat(t, 10);
	}
	h(a, "constructYamlFloat");
	let o = /^[-+]?[0-9]+e/;
	function s(t, n) {
		if (isNaN(t)) switch (n) {
			case "lowercase": return ".nan";
			case "uppercase": return ".NAN";
			case "camelcase": return ".NaN";
		}
		else if (t === Infinity) switch (n) {
			case "lowercase": return ".inf";
			case "uppercase": return ".INF";
			case "camelcase": return ".Inf";
		}
		else if (t === -Infinity) switch (n) {
			case "lowercase": return "-.inf";
			case "uppercase": return "-.INF";
			case "camelcase": return "-.Inf";
		}
		else if (e.isNegativeZero(t)) return "-0.0";
		let r = t.toString(10);
		return o.test(r) ? r.replace("e", ".e") : r;
	}
	h(s, "representYamlFloat");
	function c(t) {
		return Object.prototype.toString.call(t) === "[object Number]" && (t % 1 != 0 || e.isNegativeZero(t));
	}
	return h(c, "isFloat"), ot = new t("tag:yaml.org,2002:float", {
		kind: "scalar",
		resolve: i,
		construct: a,
		predicate: c,
		represent: s,
		defaultStyle: "lowercase"
	}), ot;
}
h(ct, "requireFloat");
var lt, ut;
function dt() {
	return ut ? lt : (ut = 1, lt = Xe().extend({ implicit: [
		$e(),
		nt(),
		at(),
		ct()
	] }), lt);
}
h(dt, "requireJson");
var ft, pt;
function mt() {
	return pt ? ft : (pt = 1, ft = dt(), ft);
}
h(mt, "requireCore");
var ht, gt;
function _t() {
	if (gt) return ht;
	gt = 1;
	let e = W(), t = /* @__PURE__ */ RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"), n = /* @__PURE__ */ RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$");
	function r(e) {
		return e === null ? !1 : t.exec(e) !== null || n.exec(e) !== null;
	}
	h(r, "resolveYamlTimestamp");
	function i(e) {
		let r = 0, i = null, a = t.exec(e);
		if (a === null && (a = n.exec(e)), a === null) throw Error("Date resolve error");
		let o = +a[1], s = a[2] - 1, c = +a[3];
		if (!a[4]) return new Date(Date.UTC(o, s, c));
		let l = +a[4], u = +a[5], d = +a[6];
		if (a[7]) {
			for (r = a[7].slice(0, 3); r.length < 3;) r += "0";
			r = +r;
		}
		if (a[9]) {
			let e = +a[10], t = +(a[11] || 0);
			i = (e * 60 + t) * 6e4, a[9] === "-" && (i = -i);
		}
		let f = new Date(Date.UTC(o, s, c, l, u, d, r));
		return i && f.setTime(f.getTime() - i), f;
	}
	h(i, "constructYamlTimestamp");
	function a(e) {
		return e.toISOString();
	}
	return h(a, "representYamlTimestamp"), ht = new e("tag:yaml.org,2002:timestamp", {
		kind: "scalar",
		resolve: r,
		construct: i,
		instanceOf: Date,
		represent: a
	}), ht;
}
h(_t, "requireTimestamp");
var vt, yt;
function bt() {
	if (yt) return vt;
	yt = 1;
	let e = W();
	function t(e) {
		return e === "<<" || e === null;
	}
	return h(t, "resolveYamlMerge"), vt = new e("tag:yaml.org,2002:merge", {
		kind: "scalar",
		resolve: t
	}), vt;
}
h(bt, "requireMerge");
var xt, St;
function Ct() {
	if (St) return xt;
	St = 1;
	let e = W();
	function t(e) {
		if (e === null) return !1;
		let t = 0, n = e.length;
		for (let r = 0; r < n; r++) {
			let n = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r".indexOf(e.charAt(r));
			if (!(n > 64)) {
				if (n < 0) return !1;
				t += 6;
			}
		}
		return t % 8 == 0;
	}
	h(t, "resolveYamlBinary");
	function n(e) {
		let t = e.replace(/[\r\n=]/g, ""), n = t.length, r = 0, i = [];
		for (let e = 0; e < n; e++) e % 4 == 0 && e && (i.push(r >> 16 & 255), i.push(r >> 8 & 255), i.push(r & 255)), r = r << 6 | "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r".indexOf(t.charAt(e));
		let a = n % 4 * 6;
		return a === 0 ? (i.push(r >> 16 & 255), i.push(r >> 8 & 255), i.push(r & 255)) : a === 18 ? (i.push(r >> 10 & 255), i.push(r >> 2 & 255)) : a === 12 && i.push(r >> 4 & 255), new Uint8Array(i);
	}
	h(n, "constructYamlBinary");
	function r(e) {
		let t = "", n = 0, r = e.length, i = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
		for (let a = 0; a < r; a++) a % 3 == 0 && a && (t += i[n >> 18 & 63], t += i[n >> 12 & 63], t += i[n >> 6 & 63], t += i[n & 63]), n = (n << 8) + e[a];
		let a = r % 3;
		return a === 0 ? (t += i[n >> 18 & 63], t += i[n >> 12 & 63], t += i[n >> 6 & 63], t += i[n & 63]) : a === 2 ? (t += i[n >> 10 & 63], t += i[n >> 4 & 63], t += i[n << 2 & 63], t += i[64]) : a === 1 && (t += i[n >> 2 & 63], t += i[n << 4 & 63], t += i[64], t += i[64]), t;
	}
	h(r, "representYamlBinary");
	function i(e) {
		return Object.prototype.toString.call(e) === "[object Uint8Array]";
	}
	return h(i, "isBinary"), xt = new e("tag:yaml.org,2002:binary", {
		kind: "scalar",
		resolve: t,
		construct: n,
		predicate: i,
		represent: r
	}), xt;
}
h(Ct, "requireBinary");
var wt, Tt;
function Et() {
	if (Tt) return wt;
	Tt = 1;
	let e = W(), t = Object.prototype.hasOwnProperty, n = Object.prototype.toString;
	function r(e) {
		if (e === null) return !0;
		let r = [], i = e;
		for (let e = 0, a = i.length; e < a; e += 1) {
			let a = i[e], o = !1;
			if (n.call(a) !== "[object Object]") return !1;
			let s;
			for (s in a) if (t.call(a, s)) {
				if (!o) o = !0;
				else return !1;
			}
			if (!o) return !1;
			if (r.indexOf(s) === -1) r.push(s);
			else return !1;
		}
		return !0;
	}
	h(r, "resolveYamlOmap");
	function i(e) {
		return e === null ? [] : e;
	}
	return h(i, "constructYamlOmap"), wt = new e("tag:yaml.org,2002:omap", {
		kind: "sequence",
		resolve: r,
		construct: i
	}), wt;
}
h(Et, "requireOmap");
var Dt, Ot;
function kt() {
	if (Ot) return Dt;
	Ot = 1;
	let e = W(), t = Object.prototype.toString;
	function n(e) {
		if (e === null) return !0;
		let n = e, r = Array(n.length);
		for (let e = 0, i = n.length; e < i; e += 1) {
			let i = n[e];
			if (t.call(i) !== "[object Object]") return !1;
			let a = Object.keys(i);
			if (a.length !== 1) return !1;
			r[e] = [a[0], i[a[0]]];
		}
		return !0;
	}
	h(n, "resolveYamlPairs");
	function r(e) {
		if (e === null) return [];
		let t = e, n = Array(t.length);
		for (let e = 0, r = t.length; e < r; e += 1) {
			let r = t[e], i = Object.keys(r);
			n[e] = [i[0], r[i[0]]];
		}
		return n;
	}
	return h(r, "constructYamlPairs"), Dt = new e("tag:yaml.org,2002:pairs", {
		kind: "sequence",
		resolve: n,
		construct: r
	}), Dt;
}
h(kt, "requirePairs");
var At, jt;
function Mt() {
	if (jt) return At;
	jt = 1;
	let e = W(), t = Object.prototype.hasOwnProperty;
	function n(e) {
		if (e === null) return !0;
		let n = e;
		for (let e in n) if (t.call(n, e) && n[e] !== null) return !1;
		return !0;
	}
	h(n, "resolveYamlSet");
	function r(e) {
		return e === null ? {} : e;
	}
	return h(r, "constructYamlSet"), At = new e("tag:yaml.org,2002:set", {
		kind: "mapping",
		resolve: n,
		construct: r
	}), At;
}
h(Mt, "requireSet");
var Nt, Pt;
function Ft() {
	return Pt ? Nt : (Pt = 1, Nt = mt().extend({
		implicit: [_t(), bt()],
		explicit: [
			Ct(),
			Et(),
			kt(),
			Mt()
		]
	}), Nt);
}
h(Ft, "require_default");
var It;
function Lt() {
	if (It) return De;
	It = 1;
	let e = H(), t = U(), n = Ne(), r = Ft(), i = Object.prototype.hasOwnProperty, a = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/, o = /[\x85\u2028\u2029]/, s = /[,\[\]{}]/, c = /^(?:!|!!|![0-9A-Za-z-]+!)$/, l = /^(?:!|[^,\[\]{}])(?:%[0-9a-f]{2}|[0-9a-z\-#;/?:@&=+$,_.!~*'()\[\]])*$/i;
	function u(e) {
		return Object.prototype.toString.call(e);
	}
	h(u, "_class");
	function d(e) {
		return e === 10 || e === 13;
	}
	h(d, "isEol");
	function f(e) {
		return e === 9 || e === 32;
	}
	h(f, "isWhiteSpace");
	function p(e) {
		return e === 9 || e === 32 || e === 10 || e === 13;
	}
	h(p, "isWsOrEol");
	function m(e) {
		return e === 44 || e === 91 || e === 93 || e === 123 || e === 125;
	}
	h(m, "isFlowIndicator");
	function g(e) {
		if (e >= 48 && e <= 57) return e - 48;
		let t = e | 32;
		return t >= 97 && t <= 102 ? t - 97 + 10 : -1;
	}
	h(g, "fromHexCode");
	function _(e) {
		return e === 120 ? 2 : e === 117 ? 4 : e === 85 ? 8 : 0;
	}
	h(_, "escapedHexLen");
	function v(e) {
		return e >= 48 && e <= 57 ? e - 48 : -1;
	}
	h(v, "fromDecimalCode");
	function y(e) {
		switch (e) {
			case 48: return "\0";
			case 97: return "\x07";
			case 98: return "\b";
			case 116: return "	";
			case 9: return "	";
			case 110: return "\n";
			case 118: return "\v";
			case 102: return "\f";
			case 114: return "\r";
			case 101: return "\x1B";
			case 32: return " ";
			case 34: return "\"";
			case 47: return "/";
			case 92: return "\\";
			case 78: return "";
			case 95: return "\xA0";
			case 76: return "\u2028";
			case 80: return "\u2029";
			default: return "";
		}
	}
	h(y, "simpleEscapeSequence");
	function b(e) {
		return e <= 65535 ? String.fromCharCode(e) : String.fromCharCode((e - 65536 >> 10) + 55296, (e - 65536 & 1023) + 56320);
	}
	h(b, "charFromCodepoint");
	function x(e, t, n) {
		t === "__proto__" ? Object.defineProperty(e, t, {
			configurable: !0,
			enumerable: !0,
			writable: !0,
			value: n
		}) : e[t] = n;
	}
	h(x, "setProperty");
	let S = Array(256), C = Array(256);
	for (let e = 0; e < 256; e++) S[e] = +!!y(e), C[e] = y(e);
	function w(e, t) {
		this.input = e, this.filename = t.filename || null, this.schema = t.schema || r, this.onWarning = t.onWarning || null, this.legacy = t.legacy || !1, this.json = t.json || !1, this.listener = t.listener || null, this.maxDepth = typeof t.maxDepth == "number" ? t.maxDepth : 100, this.maxTotalMergeKeys = typeof t.maxTotalMergeKeys == "number" ? t.maxTotalMergeKeys : 1e4, this.implicitTypes = this.schema.compiledImplicit, this.typeMap = this.schema.compiledTypeMap, this.length = e.length, this.position = 0, this.line = 0, this.lineStart = 0, this.lineIndent = 0, this.depth = 0, this.totalMergeKeys = 0, this.firstTabInLine = -1, this.documents = [], this.anchorMapTransactions = [];
	}
	h(w, "State");
	function T(e, r) {
		let i = {
			name: e.filename,
			buffer: e.input.slice(0, -1),
			position: e.position,
			line: e.line,
			column: e.position - e.lineStart
		};
		return i.snippet = n(i), new t(r, i);
	}
	h(T, "generateError");
	function E(e, t) {
		throw T(e, t);
	}
	h(E, "throwError");
	function D(e, t) {
		e.onWarning && e.onWarning.call(null, T(e, t));
	}
	h(D, "throwWarning");
	function O(e, t, n) {
		let r = e.anchorMapTransactions;
		if (r.length !== 0) {
			let n = r[r.length - 1];
			i.call(n, t) || (n[t] = {
				existed: i.call(e.anchorMap, t),
				value: e.anchorMap[t]
			});
		}
		e.anchorMap[t] = n;
	}
	h(O, "storeAnchor");
	function k(e) {
		e.anchorMapTransactions.push(/* @__PURE__ */ Object.create(null));
	}
	h(k, "beginAnchorTransaction");
	function A(e) {
		let t = e.anchorMapTransactions.pop(), n = e.anchorMapTransactions;
		if (n.length === 0) return;
		let r = n[n.length - 1], a = Object.keys(t);
		for (let e = 0, n = a.length; e < n; e += 1) {
			let n = a[e];
			i.call(r, n) || (r[n] = t[n]);
		}
	}
	h(A, "commitAnchorTransaction");
	function j(e) {
		let t = e.anchorMapTransactions.pop(), n = Object.keys(t);
		for (let r = n.length - 1; r >= 0; --r) {
			let i = t[n[r]];
			i.existed ? e.anchorMap[n[r]] = i.value : delete e.anchorMap[n[r]];
		}
	}
	h(j, "rollbackAnchorTransaction");
	function M(e) {
		return {
			position: e.position,
			line: e.line,
			lineStart: e.lineStart,
			lineIndent: e.lineIndent,
			firstTabInLine: e.firstTabInLine,
			tag: e.tag,
			anchor: e.anchor,
			kind: e.kind,
			result: e.result
		};
	}
	h(M, "snapshotState");
	function N(e, t) {
		e.position = t.position, e.line = t.line, e.lineStart = t.lineStart, e.lineIndent = t.lineIndent, e.firstTabInLine = t.firstTabInLine, e.tag = t.tag, e.anchor = t.anchor, e.kind = t.kind, e.result = t.result;
	}
	h(N, "restoreState");
	let ee = {
		YAML: /* @__PURE__ */ h(function(e, t, n) {
			e.version !== null && E(e, "duplication of %YAML directive"), n.length !== 1 && E(e, "YAML directive accepts exactly one argument");
			let r = /^([0-9]+)\.([0-9]+)$/.exec(n[0]);
			r === null && E(e, "ill-formed argument of the YAML directive");
			let i = parseInt(r[1], 10), a = parseInt(r[2], 10);
			i !== 1 && E(e, "unacceptable YAML version of the document"), e.version = n[0], e.checkLineBreaks = a < 2, a !== 1 && a !== 2 && D(e, "unsupported YAML version of the document");
		}, "handleYamlDirective"),
		TAG: /* @__PURE__ */ h(function(e, t, n) {
			let r;
			n.length !== 2 && E(e, "TAG directive accepts exactly two arguments");
			let a = n[0];
			r = n[1], c.test(a) || E(e, "ill-formed tag handle (first argument) of the TAG directive"), i.call(e.tagMap, a) && E(e, "there is a previously declared suffix for \"" + a + "\" tag handle"), l.test(r) || E(e, "ill-formed tag prefix (second argument) of the TAG directive");
			try {
				r = decodeURIComponent(r);
			} catch {
				E(e, "tag prefix is malformed: " + r);
			}
			e.tagMap[a] = r;
		}, "handleTagDirective")
	};
	function P(e, t, n, r) {
		if (t < n) {
			let i = e.input.slice(t, n);
			if (r) for (let t = 0, n = i.length; t < n; t += 1) {
				let n = i.charCodeAt(t);
				n === 9 || n >= 32 && n <= 1114111 || E(e, "expected valid JSON character");
			}
			else a.test(i) && E(e, "the stream contains non-printable characters");
			e.result += i;
		}
	}
	h(P, "captureSegment");
	function F(t, n, r, a) {
		e.isObject(r) || E(t, "cannot merge mappings; the provided source object is unacceptable");
		let o = Object.keys(r);
		for (let e = 0, s = o.length; e < s; e += 1) {
			let s = o[e];
			t.maxTotalMergeKeys !== -1 && ++t.totalMergeKeys > t.maxTotalMergeKeys && E(t, "merge keys exceeded maxTotalMergeKeys (" + t.maxTotalMergeKeys + ")"), i.call(n, s) || (x(n, s, r[s]), a[s] = !0);
		}
	}
	h(F, "mergeMappings");
	function I(e, t, n, r, a, o, s, c, l) {
		if (Array.isArray(a)) {
			a = Array.prototype.slice.call(a);
			for (let t = 0, n = a.length; t < n; t += 1) Array.isArray(a[t]) && E(e, "nested arrays are not supported inside keys"), typeof a == "object" && u(a[t]) === "[object Object]" && (a[t] = "[object Object]");
		}
		if (typeof a == "object" && u(a) === "[object Object]" && (a = "[object Object]"), a = String(a), t === null && (t = {}), r === "tag:yaml.org,2002:merge") {
			if (Array.isArray(o)) for (let r = 0, i = o.length; r < i; r += 1) F(e, t, o[r], n);
			else F(e, t, o, n);
		} else !e.json && !i.call(n, a) && i.call(t, a) && (e.line = s || e.line, e.lineStart = c || e.lineStart, e.position = l || e.position, E(e, "duplicated mapping key")), x(t, a, o), delete n[a];
		return t;
	}
	h(I, "storeMappingPair");
	function L(e) {
		let t = e.input.charCodeAt(e.position);
		t === 10 ? e.position++ : t === 13 ? (e.position++, e.input.charCodeAt(e.position) === 10 && e.position++) : E(e, "a line break is expected"), e.line += 1, e.lineStart = e.position, e.firstTabInLine = -1;
	}
	h(L, "readLineBreak");
	function R(e, t, n) {
		let r = 0, i = e.input.charCodeAt(e.position);
		for (; i !== 0;) {
			for (; f(i);) i === 9 && e.firstTabInLine === -1 && (e.firstTabInLine = e.position), i = e.input.charCodeAt(++e.position);
			if (t && i === 35) do
				i = e.input.charCodeAt(++e.position);
			while (i !== 10 && i !== 13 && i !== 0);
			if (d(i)) for (L(e), i = e.input.charCodeAt(e.position), r++, e.lineIndent = 0; i === 32;) e.lineIndent++, i = e.input.charCodeAt(++e.position);
			else break;
		}
		return n !== -1 && r !== 0 && e.lineIndent < n && D(e, "deficient indentation"), r;
	}
	h(R, "skipSeparationSpace");
	function te(e) {
		let t = e.position, n = e.input.charCodeAt(t);
		return !!((n === 45 || n === 46) && n === e.input.charCodeAt(t + 1) && n === e.input.charCodeAt(t + 2) && (t += 3, n = e.input.charCodeAt(t), n === 0 || p(n)));
	}
	h(te, "testDocumentSeparator");
	function ne(t, n) {
		n === 1 ? t.result += " " : n > 1 && (t.result += e.repeat("\n", n - 1));
	}
	h(ne, "writeFoldedLines");
	function re(e, t, n) {
		let r, i, a, o, s, c, l = e.kind, u = e.result, h = e.input.charCodeAt(e.position);
		if (p(h) || m(h) || h === 35 || h === 38 || h === 42 || h === 33 || h === 124 || h === 62 || h === 39 || h === 34 || h === 37 || h === 64 || h === 96) return !1;
		if (h === 63 || h === 45) {
			let t = e.input.charCodeAt(e.position + 1);
			if (p(t) || n && m(t)) return !1;
		}
		for (e.kind = "scalar", e.result = "", r = i = e.position, a = !1; h !== 0;) {
			if (h === 58) {
				let t = e.input.charCodeAt(e.position + 1);
				if (p(t) || n && m(t)) break;
			} else if (h === 35) {
				if (p(e.input.charCodeAt(e.position - 1))) break;
			} else if (e.position === e.lineStart && te(e) || n && m(h)) break;
			else if (d(h)) {
				if (o = e.line, s = e.lineStart, c = e.lineIndent, R(e, !1, -1), e.lineIndent >= t) {
					a = !0, h = e.input.charCodeAt(e.position);
					continue;
				}
				e.position = i, e.line = o, e.lineStart = s, e.lineIndent = c;
				break;
			}
			a &&= (P(e, r, i, !1), ne(e, e.line - o), r = i = e.position, !1), f(h) || (i = e.position + 1), h = e.input.charCodeAt(++e.position);
		}
		return P(e, r, i, !1), e.result ? !0 : (e.kind = l, e.result = u, !1);
	}
	h(re, "readPlainScalar");
	function ie(e, t) {
		let n, r, i = e.input.charCodeAt(e.position);
		if (i !== 39) return !1;
		for (e.kind = "scalar", e.result = "", e.position++, n = r = e.position; (i = e.input.charCodeAt(e.position)) !== 0;) if (i === 39) {
			if (P(e, n, e.position, !0), i = e.input.charCodeAt(++e.position), i === 39) n = e.position, e.position++, r = e.position;
			else return !0;
		} else d(i) ? (P(e, n, r, !0), ne(e, R(e, !1, t)), n = r = e.position) : e.position === e.lineStart && te(e) ? E(e, "unexpected end of the document within a single quoted scalar") : (e.position++, f(i) || (r = e.position));
		E(e, "unexpected end of the stream within a single quoted scalar");
	}
	h(ie, "readSingleQuotedScalar");
	function ae(e, t) {
		let n, r, i, a = e.input.charCodeAt(e.position);
		if (a !== 34) return !1;
		for (e.kind = "scalar", e.result = "", e.position++, n = r = e.position; (a = e.input.charCodeAt(e.position)) !== 0;) if (a === 34) return P(e, n, e.position, !0), e.position++, !0;
		else if (a === 92) {
			if (P(e, n, e.position, !0), a = e.input.charCodeAt(++e.position), d(a)) R(e, !1, t);
			else if (a < 256 && S[a]) e.result += C[a], e.position++;
			else if ((i = _(a)) > 0) {
				let t = i, n = 0;
				for (; t > 0; t--) a = e.input.charCodeAt(++e.position), (i = g(a)) >= 0 ? n = (n << 4) + i : E(e, "expected hexadecimal character");
				e.result += b(n), e.position++;
			} else E(e, "unknown escape sequence");
			n = r = e.position;
		} else d(a) ? (P(e, n, r, !0), ne(e, R(e, !1, t)), n = r = e.position) : e.position === e.lineStart && te(e) ? E(e, "unexpected end of the document within a double quoted scalar") : (e.position++, f(a) || (r = e.position));
		E(e, "unexpected end of the stream within a double quoted scalar");
	}
	h(ae, "readDoubleQuotedScalar");
	function oe(e, t) {
		let n = !0, r, i, a, o = e.tag, s, c = e.anchor, l, u, d, f, m = /* @__PURE__ */ Object.create(null), h, g, _, v = e.input.charCodeAt(e.position);
		if (v === 91) l = 93, f = !1, s = [];
		else if (v === 123) l = 125, f = !0, s = {};
		else return !1;
		for (e.anchor !== null && O(e, e.anchor, s), v = e.input.charCodeAt(++e.position); v !== 0;) {
			if (R(e, !0, t), v = e.input.charCodeAt(e.position), v === l) return e.position++, e.tag = o, e.anchor = c, e.kind = f ? "mapping" : "sequence", e.result = s, !0;
			n ? v === 44 && E(e, "expected the node content, but found ','") : E(e, "missed comma between flow collection entries"), g = h = _ = null, u = d = !1, v === 63 && p(e.input.charCodeAt(e.position + 1)) && (u = d = !0, e.position++, R(e, !0, t)), r = e.line, i = e.lineStart, a = e.position, z(e, t, 1, !1, !0), g = e.tag, h = e.result, R(e, !0, t), v = e.input.charCodeAt(e.position), (d || e.line === r) && v === 58 && (u = !0, v = e.input.charCodeAt(++e.position), R(e, !0, t), z(e, t, 1, !1, !0), _ = e.result), f ? I(e, s, m, g, h, _, r, i, a) : u ? s.push(I(e, null, m, g, h, _, r, i, a)) : s.push(h), R(e, !0, t), v = e.input.charCodeAt(e.position), v === 44 ? (n = !0, v = e.input.charCodeAt(++e.position)) : n = !1;
		}
		E(e, "unexpected end of the stream within a flow collection");
	}
	h(oe, "readFlowCollection");
	function se(t, n) {
		let r, i = 1, a = !1, o = !1, s = n, c = 0, l = !1, u, p = t.input.charCodeAt(t.position);
		if (p === 124) r = !1;
		else if (p === 62) r = !0;
		else return !1;
		for (t.kind = "scalar", t.result = ""; p !== 0;) if (p = t.input.charCodeAt(++t.position), p === 43 || p === 45) i === 1 ? i = p === 43 ? 3 : 2 : E(t, "repeat of a chomping mode identifier");
		else if ((u = v(p)) >= 0) u === 0 ? E(t, "bad explicit indentation width of a block scalar; it cannot be less than one") : o ? E(t, "repeat of an indentation width identifier") : (s = n + u - 1, o = !0);
		else break;
		if (f(p)) {
			do
				p = t.input.charCodeAt(++t.position);
			while (f(p));
			if (p === 35) do
				p = t.input.charCodeAt(++t.position);
			while (!d(p) && p !== 0);
		}
		for (; p !== 0;) {
			for (L(t), t.lineIndent = 0, p = t.input.charCodeAt(t.position); (!o || t.lineIndent < s) && p === 32;) t.lineIndent++, p = t.input.charCodeAt(++t.position);
			if (!o && t.lineIndent > s && (s = t.lineIndent), d(p)) {
				c++;
				continue;
			}
			if (!o && s === 0 && E(t, "missing indentation for block scalar"), t.lineIndent < s) {
				i === 3 ? t.result += e.repeat("\n", a ? 1 + c : c) : i === 1 && a && (t.result += "\n");
				break;
			}
			r ? f(p) ? (l = !0, t.result += e.repeat("\n", a ? 1 + c : c)) : l ? (l = !1, t.result += e.repeat("\n", c + 1)) : c === 0 ? a && (t.result += " ") : t.result += e.repeat("\n", c) : t.result += e.repeat("\n", a ? 1 + c : c), a = !0, o = !0, c = 0;
			let n = t.position;
			for (; !d(p) && p !== 0;) p = t.input.charCodeAt(++t.position);
			P(t, n, t.position, !1);
		}
		return !0;
	}
	h(se, "readBlockScalar");
	function ce(e, t) {
		let n = e.tag, r = e.anchor, i = [], a = !1;
		if (e.firstTabInLine !== -1) return !1;
		e.anchor !== null && O(e, e.anchor, i);
		let o = e.input.charCodeAt(e.position);
		for (; o !== 0 && (e.firstTabInLine !== -1 && (e.position = e.firstTabInLine, E(e, "tab characters must not be used in indentation")), o === 45 && p(e.input.charCodeAt(e.position + 1)));) {
			if (a = !0, e.position++, R(e, !0, -1) && e.lineIndent <= t) {
				i.push(null), o = e.input.charCodeAt(e.position);
				continue;
			}
			let n = e.line;
			if (z(e, t, 3, !1, !0), i.push(e.result), R(e, !0, -1), o = e.input.charCodeAt(e.position), (e.line === n || e.lineIndent > t) && o !== 0) E(e, "bad indentation of a sequence entry");
			else if (e.lineIndent < t) break;
		}
		return a ? (e.tag = n, e.anchor = r, e.kind = "sequence", e.result = i, !0) : !1;
	}
	h(ce, "readBlockSequence");
	function le(e, t, n) {
		let r, i, a, o, s = e.tag, c = e.anchor, l = {}, u = /* @__PURE__ */ Object.create(null), d = null, m = null, h = null, g = !1, _ = !1;
		if (e.firstTabInLine !== -1) return !1;
		e.anchor !== null && O(e, e.anchor, l);
		let v = e.input.charCodeAt(e.position);
		for (; v !== 0;) {
			!g && e.firstTabInLine !== -1 && (e.position = e.firstTabInLine, E(e, "tab characters must not be used in indentation"));
			let y = e.input.charCodeAt(e.position + 1), b = e.line;
			if ((v === 63 || v === 58) && p(y)) v === 63 ? (g && (I(e, l, u, d, m, null, i, a, o), d = m = h = null), _ = !0, g = !0, r = !0) : g ? (g = !1, r = !0) : E(e, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line"), e.position += 1, v = y;
			else {
				if (i = e.line, a = e.lineStart, o = e.position, !z(e, n, 2, !1, !0)) break;
				if (e.line === b) {
					for (v = e.input.charCodeAt(e.position); f(v);) v = e.input.charCodeAt(++e.position);
					if (v === 58) v = e.input.charCodeAt(++e.position), p(v) || E(e, "a whitespace character is expected after the key-value separator within a block mapping"), g && (I(e, l, u, d, m, null, i, a, o), d = m = h = null), _ = !0, g = !1, r = !1, d = e.tag, m = e.result;
					else if (_) E(e, "can not read an implicit mapping pair; a colon is missed");
					else return e.tag = s, e.anchor = c, !0;
				} else if (_) E(e, "can not read a block mapping entry; a multiline key may not be an implicit key");
				else return e.tag = s, e.anchor = c, !0;
			}
			if ((e.line === b || e.lineIndent > t) && (g && (i = e.line, a = e.lineStart, o = e.position), z(e, t, 4, !0, r) && (g ? m = e.result : h = e.result), g || (I(e, l, u, d, m, h, i, a, o), d = m = h = null), R(e, !0, -1), v = e.input.charCodeAt(e.position)), (e.line === b || e.lineIndent > t) && v !== 0) E(e, "bad indentation of a mapping entry");
			else if (e.lineIndent < t) break;
		}
		return g && I(e, l, u, d, m, null, i, a, o), _ && (e.tag = s, e.anchor = c, e.kind = "mapping", e.result = l), _;
	}
	h(le, "readBlockMapping");
	function ue(e) {
		let t = !1, n = !1, r, a, o = e.input.charCodeAt(e.position);
		if (o !== 33) return !1;
		e.tag !== null && E(e, "duplication of a tag property"), o = e.input.charCodeAt(++e.position), o === 60 ? (t = !0, o = e.input.charCodeAt(++e.position)) : o === 33 ? (n = !0, r = "!!", o = e.input.charCodeAt(++e.position)) : r = "!";
		let u = e.position;
		if (t) {
			do
				o = e.input.charCodeAt(++e.position);
			while (o !== 0 && o !== 62);
			e.position < e.length ? (a = e.input.slice(u, e.position), o = e.input.charCodeAt(++e.position)) : E(e, "unexpected end of the stream within a verbatim tag");
		} else {
			for (; o !== 0 && !p(o);) o === 33 && (n ? E(e, "tag suffix cannot contain exclamation marks") : (r = e.input.slice(u - 1, e.position + 1), c.test(r) || E(e, "named tag handle cannot contain such characters"), n = !0, u = e.position + 1)), o = e.input.charCodeAt(++e.position);
			a = e.input.slice(u, e.position), s.test(a) && E(e, "tag suffix cannot contain flow indicator characters");
		}
		a && !l.test(a) && E(e, "tag name cannot contain such characters: " + a);
		try {
			a = decodeURIComponent(a);
		} catch {
			E(e, "tag name is malformed: " + a);
		}
		return t ? e.tag = a : i.call(e.tagMap, r) ? e.tag = e.tagMap[r] + a : r === "!" ? e.tag = "!" + a : r === "!!" ? e.tag = "tag:yaml.org,2002:" + a : E(e, "undeclared tag handle \"" + r + "\""), !0;
	}
	h(ue, "readTagProperty");
	function de(e) {
		let t = e.input.charCodeAt(e.position);
		if (t !== 38) return !1;
		e.anchor !== null && E(e, "duplication of an anchor property"), t = e.input.charCodeAt(++e.position);
		let n = e.position;
		for (; t !== 0 && !p(t) && !m(t);) t = e.input.charCodeAt(++e.position);
		return e.position === n && E(e, "name of an anchor node must contain at least one character"), e.anchor = e.input.slice(n, e.position), !0;
	}
	h(de, "readAnchorProperty");
	function fe(e) {
		let t = e.input.charCodeAt(e.position);
		if (t !== 42) return !1;
		t = e.input.charCodeAt(++e.position);
		let n = e.position;
		for (; t !== 0 && !p(t) && !m(t);) t = e.input.charCodeAt(++e.position);
		e.position === n && E(e, "name of an alias node must contain at least one character");
		let r = e.input.slice(n, e.position);
		return i.call(e.anchorMap, r) || E(e, "unidentified alias \"" + r + "\""), e.result = e.anchorMap[r], R(e, !0, -1), !0;
	}
	h(fe, "readAlias");
	function pe(e, t, n, r) {
		let i = M(e);
		return k(e), N(e, t), e.tag = null, e.anchor = null, e.kind = null, e.result = null, le(e, n, r) && e.kind === "mapping" ? (A(e), !0) : (j(e), N(e, i), !1);
	}
	h(pe, "tryReadBlockMappingFromProperty");
	function z(e, t, n, r, a) {
		let o, s, c = 1, l = !1, u = !1, d = null, f, p, m;
		e.depth >= e.maxDepth && E(e, "nesting exceeded maxDepth (" + e.maxDepth + ")"), e.depth += 1, e.listener !== null && e.listener("open", e), e.tag = null, e.anchor = null, e.kind = null, e.result = null;
		let h = o = s = n === 4 || n === 3;
		if (r && R(e, !0, -1) && (l = !0, e.lineIndent > t ? c = 1 : e.lineIndent === t ? c = 0 : e.lineIndent < t && (c = -1)), c === 1) for (;;) {
			let n = e.input.charCodeAt(e.position), r = M(e);
			if (l && (n === 33 && e.tag !== null || n === 38 && e.anchor !== null) || !ue(e) && !de(e)) break;
			d === null && (d = r), R(e, !0, -1) ? (l = !0, s = h, e.lineIndent > t ? c = 1 : e.lineIndent === t ? c = 0 : e.lineIndent < t && (c = -1)) : s = !1;
		}
		if (s &&= l || a, c === 1 || n === 4) {
			if (p = n === 1 || n === 2 ? t : t + 1, m = e.position - e.lineStart, c === 1) {
				if (s && (ce(e, m) || le(e, m, p)) || oe(e, p)) u = !0;
				else {
					let t = e.input.charCodeAt(e.position);
					d !== null && h && !s && t !== 124 && t !== 62 && pe(e, d, d.position - d.lineStart, p) || o && se(e, p) || ie(e, p) || ae(e, p) ? u = !0 : fe(e) ? (u = !0, (e.tag !== null || e.anchor !== null) && E(e, "alias node should not have any properties")) : re(e, p, n === 1) && (u = !0, e.tag === null && (e.tag = "?")), e.anchor !== null && O(e, e.anchor, e.result);
				}
			} else c === 0 && (u = s && ce(e, m));
		}
		if (e.tag === null) e.anchor !== null && O(e, e.anchor, e.result);
		else if (e.tag === "?") {
			e.result !== null && e.kind !== "scalar" && E(e, "unacceptable node kind for !<?> tag; it should be \"scalar\", not \"" + e.kind + "\"");
			for (let t = 0, n = e.implicitTypes.length; t < n; t += 1) if (f = e.implicitTypes[t], f.resolve(e.result)) {
				e.result = f.construct(e.result), e.tag = f.tag, e.anchor !== null && O(e, e.anchor, e.result);
				break;
			}
		} else if (e.tag !== "!") {
			if (i.call(e.typeMap[e.kind || "fallback"], e.tag)) f = e.typeMap[e.kind || "fallback"][e.tag];
			else {
				f = null;
				let t = e.typeMap.multi[e.kind || "fallback"];
				for (let n = 0, r = t.length; n < r; n += 1) if (e.tag.slice(0, t[n].tag.length) === t[n].tag) {
					f = t[n];
					break;
				}
			}
			f || E(e, "unknown tag !<" + e.tag + ">"), e.result !== null && f.kind !== e.kind && E(e, "unacceptable node kind for !<" + e.tag + "> tag; it should be \"" + f.kind + "\", not \"" + e.kind + "\""), f.resolve(e.result, e.tag) ? (e.result = f.construct(e.result, e.tag), e.anchor !== null && O(e, e.anchor, e.result)) : E(e, "cannot resolve a node with !<" + e.tag + "> explicit tag");
		}
		return e.listener !== null && e.listener("close", e), --e.depth, e.tag !== null || e.anchor !== null || u;
	}
	h(z, "composeNode");
	function me(e) {
		let t = e.position, n = !1, r;
		for (e.version = null, e.checkLineBreaks = e.legacy, e.tagMap = /* @__PURE__ */ Object.create(null), e.anchorMap = /* @__PURE__ */ Object.create(null); (r = e.input.charCodeAt(e.position)) !== 0 && (R(e, !0, -1), r = e.input.charCodeAt(e.position), !(e.lineIndent > 0 || r !== 37));) {
			n = !0, r = e.input.charCodeAt(++e.position);
			let t = e.position;
			for (; r !== 0 && !p(r);) r = e.input.charCodeAt(++e.position);
			let a = e.input.slice(t, e.position), o = [];
			for (a.length < 1 && E(e, "directive name must not be less than one character in length"); r !== 0;) {
				for (; f(r);) r = e.input.charCodeAt(++e.position);
				if (r === 35) {
					do
						r = e.input.charCodeAt(++e.position);
					while (r !== 0 && !d(r));
					break;
				}
				if (d(r)) break;
				for (t = e.position; r !== 0 && !p(r);) r = e.input.charCodeAt(++e.position);
				o.push(e.input.slice(t, e.position));
			}
			r !== 0 && L(e), i.call(ee, a) ? ee[a](e, a, o) : D(e, "unknown document directive \"" + a + "\"");
		}
		if (R(e, !0, -1), e.lineIndent === 0 && e.input.charCodeAt(e.position) === 45 && e.input.charCodeAt(e.position + 1) === 45 && e.input.charCodeAt(e.position + 2) === 45 ? (e.position += 3, R(e, !0, -1)) : n && E(e, "directives end mark is expected"), z(e, e.lineIndent - 1, 4, !1, !0), R(e, !0, -1), e.checkLineBreaks && o.test(e.input.slice(t, e.position)) && D(e, "non-ASCII line breaks are interpreted as content"), e.documents.push(e.result), e.position === e.lineStart && te(e)) {
			e.input.charCodeAt(e.position) === 46 && (e.position += 3, R(e, !0, -1));
			return;
		}
		e.position < e.length - 1 && E(e, "end of the stream or a document separator is expected");
	}
	h(me, "readDocument");
	function he(e, t) {
		e = String(e), t ||= {}, e.length !== 0 && (e.charCodeAt(e.length - 1) !== 10 && e.charCodeAt(e.length - 1) !== 13 && (e += "\n"), e.charCodeAt(0) === 65279 && (e = e.slice(1)));
		let n = new w(e, t), r = e.indexOf("\0");
		for (r !== -1 && (n.position = r, E(n, "null byte is not allowed in input")), n.input += "\0"; n.input.charCodeAt(n.position) === 32;) n.lineIndent += 1, n.position += 1;
		for (; n.position < n.length - 1;) me(n);
		return n.documents;
	}
	h(he, "loadDocuments");
	function ge(e, t, n) {
		typeof t == "object" && t && n === void 0 && (n = t, t = null);
		let r = he(e, n);
		if (typeof t != "function") return r;
		for (let e = 0, n = r.length; e < n; e += 1) t(r[e]);
	}
	h(ge, "loadAll2");
	function _e(e, n) {
		let r = he(e, n);
		if (r.length !== 0) {
			if (r.length === 1) return r[0];
			throw new t("expected a single document in the stream, but found more");
		}
	}
	return h(_e, "load2"), De.loadAll = ge, De.load = _e, De;
}
h(Lt, "requireLoader");
var Rt = {}, zt;
function Bt() {
	if (zt) return Rt;
	zt = 1;
	let e = H(), t = U(), n = Ft(), r = Object.prototype.toString, i = Object.prototype.hasOwnProperty, a = 65279, o = {};
	o[0] = "\\0", o[7] = "\\a", o[8] = "\\b", o[9] = "\\t", o[10] = "\\n", o[11] = "\\v", o[12] = "\\f", o[13] = "\\r", o[27] = "\\e", o[34] = "\\\"", o[92] = "\\\\", o[133] = "\\N", o[160] = "\\_", o[8232] = "\\L", o[8233] = "\\P";
	let s = [
		"y",
		"Y",
		"yes",
		"Yes",
		"YES",
		"on",
		"On",
		"ON",
		"n",
		"N",
		"no",
		"No",
		"NO",
		"off",
		"Off",
		"OFF"
	], c = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
	function l(e, t) {
		if (t === null) return {};
		let n = {}, r = Object.keys(t);
		for (let a = 0, o = r.length; a < o; a += 1) {
			let o = r[a], s = String(t[o]);
			o.slice(0, 2) === "!!" && (o = "tag:yaml.org,2002:" + o.slice(2));
			let c = e.compiledTypeMap.fallback[o];
			c && i.call(c.styleAliases, s) && (s = c.styleAliases[s]), n[o] = s;
		}
		return n;
	}
	h(l, "compileStyleMap");
	function u(n) {
		let r, i, a = n.toString(16).toUpperCase();
		if (n <= 255) r = "x", i = 2;
		else if (n <= 65535) r = "u", i = 4;
		else if (n <= 4294967295) r = "U", i = 8;
		else throw new t("code point within a string may not be greater than 0xFFFFFFFF");
		return "\\" + r + e.repeat("0", i - a.length) + a;
	}
	h(u, "encodeHex");
	function d(t) {
		this.schema = t.schema || n, this.indent = Math.max(1, t.indent || 2), this.noArrayIndent = t.noArrayIndent || !1, this.skipInvalid = t.skipInvalid || !1, this.flowLevel = e.isNothing(t.flowLevel) ? -1 : t.flowLevel, this.styleMap = l(this.schema, t.styles || null), this.sortKeys = t.sortKeys || !1, this.lineWidth = t.lineWidth || 80, this.noRefs = t.noRefs || !1, this.noCompatMode = t.noCompatMode || !1, this.condenseFlow = t.condenseFlow || !1, this.quotingType = t.quotingType === "\"" ? 2 : 1, this.forceQuotes = t.forceQuotes || !1, this.replacer = typeof t.replacer == "function" ? t.replacer : null, this.implicitTypes = this.schema.compiledImplicit, this.explicitTypes = this.schema.compiledExplicit, this.tag = null, this.result = "", this.duplicates = [], this.usedDuplicates = null;
	}
	h(d, "State");
	function f(t, n) {
		let r = e.repeat(" ", n), i = 0, a = "", o = t.length;
		for (; i < o;) {
			let e, n = t.indexOf("\n", i);
			n === -1 ? (e = t.slice(i), i = o) : (e = t.slice(i, n + 1), i = n + 1), e.length && e !== "\n" && (a += r), a += e;
		}
		return a;
	}
	h(f, "indentString");
	function p(t, n) {
		return "\n" + e.repeat(" ", t.indent * n);
	}
	h(p, "generateNextLine");
	function m(e, t) {
		for (let n = 0, r = e.implicitTypes.length; n < r; n += 1) if (e.implicitTypes[n].resolve(t)) return !0;
		return !1;
	}
	h(m, "testImplicitResolving");
	function g(e) {
		return e === 32 || e === 9;
	}
	h(g, "isWhitespace");
	function _(e) {
		return e >= 32 && e <= 126 || e >= 161 && e <= 55295 && e !== 8232 && e !== 8233 || e >= 57344 && e <= 65533 && e !== a || e >= 65536 && e <= 1114111;
	}
	h(_, "isPrintable");
	function v(e) {
		return _(e) && e !== a && e !== 13 && e !== 10;
	}
	h(v, "isNsCharOrWhitespace");
	function y(e, t, n) {
		let r = v(e), i = r && !g(e);
		return (n ? r : r && e !== 44 && e !== 91 && e !== 93 && e !== 123 && e !== 125) && e !== 35 && !(t === 58 && !i) || v(t) && !g(t) && e === 35 || t === 58 && i;
	}
	h(y, "isPlainSafe");
	function b(e) {
		return _(e) && e !== a && !g(e) && e !== 45 && e !== 63 && e !== 58 && e !== 44 && e !== 91 && e !== 93 && e !== 123 && e !== 125 && e !== 35 && e !== 38 && e !== 42 && e !== 33 && e !== 124 && e !== 61 && e !== 62 && e !== 39 && e !== 34 && e !== 37 && e !== 64 && e !== 96;
	}
	h(b, "isPlainSafeFirst");
	function x(e) {
		return !g(e) && e !== 58;
	}
	h(x, "isPlainSafeLast");
	function S(e, t) {
		let n = e.charCodeAt(t), r;
		return n >= 55296 && n <= 56319 && t + 1 < e.length && (r = e.charCodeAt(t + 1), r >= 56320 && r <= 57343) ? (n - 55296) * 1024 + r - 56320 + 65536 : n;
	}
	h(S, "codePointAt");
	function C(e) {
		return /^\n* /.test(e);
	}
	h(C, "needIndentIndicator");
	function w(e, t, n, r, i, a, o, s) {
		let c, l = 0, u = null, d = !1, f = !1, p = r !== -1, m = -1, h = b(S(e, 0)) && x(S(e, e.length - 1));
		if (t || o) for (c = 0; c < e.length; l >= 65536 ? c += 2 : c++) {
			if (l = S(e, c), !_(l)) return 5;
			h &&= y(l, u, s), u = l;
		}
		else {
			for (c = 0; c < e.length; l >= 65536 ? c += 2 : c++) {
				if (l = S(e, c), l === 10) d = !0, p && (f ||= c - m - 1 > r && e[m + 1] !== " ", m = c);
				else if (!_(l)) return 5;
				h &&= y(l, u, s), u = l;
			}
			f ||= p && c - m - 1 > r && e[m + 1] !== " ";
		}
		return !d && !f ? h && !o && !i(e) ? 1 : a === 2 ? 5 : 2 : n > 9 && C(e) ? 5 : o ? a === 2 ? 5 : 2 : f ? 4 : 3;
	}
	h(w, "chooseScalarStyle");
	function T(e, n, r, i, a) {
		e.dump = (function() {
			if (n.length === 0) return e.quotingType === 2 ? "\"\"" : "''";
			if (!e.noCompatMode && (s.indexOf(n) !== -1 || c.test(n))) return e.quotingType === 2 ? "\"" + n + "\"" : "'" + n + "'";
			let o = e.indent * Math.max(1, r), l = e.lineWidth === -1 ? -1 : Math.max(Math.min(e.lineWidth, 40), e.lineWidth - o), u = i || e.flowLevel > -1 && r >= e.flowLevel;
			function d(t) {
				return m(e, t);
			}
			switch (h(d, "testAmbiguity"), w(n, u, e.indent, l, d, e.quotingType, e.forceQuotes && !i, a)) {
				case 1: return n;
				case 2: return "'" + n.replace(/'/g, "''") + "'";
				case 3: return "|" + E(n, e.indent) + D(f(n, o));
				case 4: return ">" + E(n, e.indent) + D(f(O(n, l), o));
				case 5: return "\"" + A(n) + "\"";
				default: throw new t("impossible error: invalid scalar style");
			}
		})();
	}
	h(T, "writeScalar");
	function E(e, t) {
		let n = C(e) ? String(t) : "", r = e[e.length - 1] === "\n";
		return n + (r && (e[e.length - 2] === "\n" || e === "\n") ? "+" : r ? "" : "-") + "\n";
	}
	h(E, "blockHeader");
	function D(e) {
		return e[e.length - 1] === "\n" ? e.slice(0, -1) : e;
	}
	h(D, "dropEndingNewline");
	function O(e, t) {
		let n = /(\n+)([^\n]*)/g, r = (function() {
			let r = e.indexOf("\n");
			return r = r === -1 ? e.length : r, n.lastIndex = r, k(e.slice(0, r), t);
		})(), i = e[0] === "\n" || e[0] === " ", a, o;
		for (; o = n.exec(e);) {
			let e = o[1], n = o[2];
			a = n[0] === " ", r += e + (!i && !a && n !== "" ? "\n" : "") + k(n, t), i = a;
		}
		return r;
	}
	h(O, "foldString");
	function k(e, t) {
		if (e === "" || e[0] === " ") return e;
		let n = / [^ ]/g, r, i = 0, a, o = 0, s = 0, c = "";
		for (; r = n.exec(e);) s = r.index, s - i > t && (a = o > i ? o : s, c += "\n" + e.slice(i, a), i = a + 1), o = s;
		return c += "\n", e.length - i > t && o > i ? c += e.slice(i, o) + "\n" + e.slice(o + 1) : c += e.slice(i), c.slice(1);
	}
	h(k, "foldLine");
	function A(e) {
		let t = "", n = 0;
		for (let r = 0; r < e.length; n >= 65536 ? r += 2 : r++) {
			n = S(e, r);
			let i = o[n];
			!i && _(n) ? (t += e[r], n >= 65536 && (t += e[r + 1])) : t += i || u(n);
		}
		return t;
	}
	h(A, "escapeString");
	function j(e, t, n) {
		let r = "", i = e.tag;
		for (let i = 0, a = n.length; i < a; i += 1) {
			let a = n[i];
			e.replacer && (a = e.replacer.call(n, String(i), a)), (F(e, t, a, !1, !1) || a === void 0 && F(e, t, null, !1, !1)) && (r !== "" && (r += "," + (e.condenseFlow ? "" : " ")), r += e.dump);
		}
		e.tag = i, e.dump = "[" + r + "]";
	}
	h(j, "writeFlowSequence");
	function M(e, t, n, r) {
		let i = "", a = e.tag;
		for (let a = 0, o = n.length; a < o; a += 1) {
			let o = n[a];
			e.replacer && (o = e.replacer.call(n, String(a), o)), (F(e, t + 1, o, !0, !0, !1, !0) || o === void 0 && F(e, t + 1, null, !0, !0, !1, !0)) && ((!r || i !== "") && (i += p(e, t)), e.dump && e.dump.charCodeAt(0) === 10 ? i += "-" : i += "- ", i += e.dump);
		}
		e.tag = a, e.dump = i || "[]";
	}
	h(M, "writeBlockSequence");
	function N(e, t, n) {
		let r = "", i = e.tag, a = Object.keys(n);
		for (let i = 0, o = a.length; i < o; i += 1) {
			let o = "";
			r !== "" && (o += ", "), e.condenseFlow && (o += "\"");
			let s = a[i], c = n[s];
			e.replacer && (c = e.replacer.call(n, s, c)), F(e, t, s, !1, !1) && (e.dump.length > 1024 && (o += "? "), o += e.dump + (e.condenseFlow ? "\"" : "") + ":" + (e.condenseFlow ? "" : " "), F(e, t, c, !1, !1) && (o += e.dump, r += o));
		}
		e.tag = i, e.dump = "{" + r + "}";
	}
	h(N, "writeFlowMapping");
	function ee(e, n, r, i) {
		let a = "", o = e.tag, s = Object.keys(r);
		if (e.sortKeys === !0) s.sort();
		else if (typeof e.sortKeys == "function") s.sort(e.sortKeys);
		else if (e.sortKeys) throw new t("sortKeys must be a boolean or a function");
		for (let t = 0, o = s.length; t < o; t += 1) {
			let o = "";
			(!i || a !== "") && (o += p(e, n));
			let c = s[t], l = r[c];
			if (e.replacer && (l = e.replacer.call(r, c, l)), !F(e, n + 1, c, !0, !0, !0)) continue;
			let u = e.tag !== null && e.tag !== "?" || e.dump && e.dump.length > 1024;
			u && (e.dump && e.dump.charCodeAt(0) === 10 ? o += "?" : o += "? "), o += e.dump, u && (o += p(e, n)), F(e, n + 1, l, !0, u) && (e.dump && e.dump.charCodeAt(0) === 10 ? o += ":" : o += ": ", o += e.dump, a += o);
		}
		e.tag = o, e.dump = a || "{}";
	}
	h(ee, "writeBlockMapping");
	function P(e, n, a) {
		let o = a ? e.explicitTypes : e.implicitTypes;
		for (let s = 0, c = o.length; s < c; s += 1) {
			let c = o[s];
			if ((c.instanceOf || c.predicate) && (!c.instanceOf || typeof n == "object" && n instanceof c.instanceOf) && (!c.predicate || c.predicate(n))) {
				if (e.tag = a ? c.multi && c.representName ? c.representName(n) : c.tag : "?", c.represent) {
					let a = e.styleMap[c.tag] || c.defaultStyle, o;
					if (r.call(c.represent) === "[object Function]") o = c.represent(n, a);
					else if (i.call(c.represent, a)) o = c.represent[a](n, a);
					else throw new t("!<" + c.tag + "> tag resolver accepts not \"" + a + "\" style");
					e.dump = o;
				}
				return !0;
			}
		}
		return !1;
	}
	h(P, "detectType");
	function F(e, n, i, a, o, s, c) {
		e.tag = null, e.dump = i, P(e, i, !1) || P(e, i, !0);
		let l = r.call(e.dump), u = a;
		a &&= e.flowLevel < 0 || e.flowLevel > n;
		let d = l === "[object Object]" || l === "[object Array]", f, p;
		if (d && (f = e.duplicates.indexOf(i), p = f !== -1), (e.tag !== null && e.tag !== "?" || p || e.indent !== 2 && n > 0) && (o = !1), p && e.usedDuplicates[f]) e.dump = "*ref_" + f;
		else {
			if (d && p && !e.usedDuplicates[f] && (e.usedDuplicates[f] = !0), l === "[object Object]") a && Object.keys(e.dump).length !== 0 ? (ee(e, n, e.dump, o), p && (e.dump = "&ref_" + f + e.dump)) : (N(e, n, e.dump), p && (e.dump = "&ref_" + f + " " + e.dump));
			else if (l === "[object Array]") a && e.dump.length !== 0 ? (e.noArrayIndent && !c && n > 0 ? M(e, n - 1, e.dump, o) : M(e, n, e.dump, o), p && (e.dump = "&ref_" + f + e.dump)) : (j(e, n, e.dump), p && (e.dump = "&ref_" + f + " " + e.dump));
			else if (l === "[object String]") e.tag !== "?" && T(e, e.dump, n, s, u);
			else if (l === "[object Undefined]") return !1;
			else {
				if (e.skipInvalid) return !1;
				throw new t("unacceptable kind of an object to dump " + l);
			}
			if (e.tag !== null && e.tag !== "?") {
				let t = encodeURI(e.tag[0] === "!" ? e.tag.slice(1) : e.tag).replace(/!/g, "%21");
				t = e.tag[0] === "!" ? "!" + t : t.slice(0, 18) === "tag:yaml.org,2002:" ? "!!" + t.slice(18) : "!<" + t + ">", e.dump = t + " " + e.dump;
			}
		}
		return !0;
	}
	h(F, "writeNode");
	function I(e, t) {
		let n = [], r = [];
		L(e, n, r);
		let i = r.length;
		for (let e = 0; e < i; e += 1) t.duplicates.push(n[r[e]]);
		t.usedDuplicates = Array(i);
	}
	h(I, "getDuplicateReferences");
	function L(e, t, n) {
		if (typeof e == "object" && e) {
			let r = t.indexOf(e);
			if (r !== -1) n.indexOf(r) === -1 && n.push(r);
			else if (t.push(e), Array.isArray(e)) for (let r = 0, i = e.length; r < i; r += 1) L(e[r], t, n);
			else {
				let r = Object.keys(e);
				for (let i = 0, a = r.length; i < a; i += 1) L(e[r[i]], t, n);
			}
		}
	}
	h(L, "inspectNode");
	function R(e, t) {
		t ||= {};
		let n = new d(t);
		n.noRefs || I(e, n);
		let r = e;
		return n.replacer && (r = n.replacer.call({ "": r }, "", r)), F(n, 0, r, !0, !0) ? n.dump + "\n" : "";
	}
	return h(R, "dump2"), Rt.dump = R, Rt;
}
h(Bt, "requireDumper");
var Vt;
function Ht() {
	if (Vt) return B;
	Vt = 1;
	let e = Lt(), t = Bt();
	function n(e, t) {
		return function() {
			throw Error("Function yaml." + e + " is removed in js-yaml 4. Use yaml." + t + " instead, which is now safe by default.");
		};
	}
	return h(n, "renamed"), B.Type = W(), B.Schema = Re(), B.FAILSAFE_SCHEMA = Xe(), B.JSON_SCHEMA = dt(), B.CORE_SCHEMA = mt(), B.DEFAULT_SCHEMA = Ft(), B.load = e.load, B.loadAll = e.loadAll, B.dump = t.dump, B.YAMLException = U(), B.types = {
		binary: Ct(),
		float: ct(),
		map: qe(),
		null: $e(),
		pairs: kt(),
		set: Mt(),
		timestamp: _t(),
		bool: nt(),
		int: at(),
		merge: bt(),
		omap: Et(),
		seq: We(),
		str: Ve()
	}, B.safeLoad = n("safeLoad", "load"), B.safeLoadAll = n("safeLoadAll", "loadAll"), B.safeDump = n("safeDump", "dump"), B;
}
h(Ht, "requireJsYaml");
var { Type: Ut, Schema: Wt, FAILSAFE_SCHEMA: Gt, JSON_SCHEMA: Kt, CORE_SCHEMA: qt, DEFAULT_SCHEMA: Jt, load: Yt, loadAll: Xt, dump: Zt, YAMLException: Qt, types: $t, safeLoad: en, safeLoadAll: tn, safeDump: nn } = /* @__PURE__ */ Ee(Ht()), rn = "comm", an = "rule", on = "decl", sn = "@import", cn = "@namespace", ln = "@keyframes", un = "@layer", dn = Math.abs, fn = String.fromCharCode;
function pn(e) {
	return e.trim();
}
function mn(e, t, n) {
	return e.replace(t, n);
}
function G(e, t) {
	return e.charCodeAt(t) | 0;
}
function K(e, t, n) {
	return e.slice(t, n);
}
function q(e) {
	return e.length;
}
function hn(e) {
	return e.length;
}
function gn(e, t) {
	return t.push(e), e;
}
var _n = 1, vn = 1, yn = 0, J = 0, Y = 0, bn = "";
function xn(e, t, n, r, i, a, o, s) {
	return {
		value: e,
		root: t,
		parent: n,
		type: r,
		props: i,
		children: a,
		line: _n,
		column: vn,
		length: o,
		return: "",
		siblings: s
	};
}
function Sn() {
	return Y;
}
function Cn() {
	return Y = J > 0 ? G(bn, --J) : 0, vn--, Y === 10 && (vn = 1, _n--), Y;
}
function X() {
	return Y = J < yn ? G(bn, J++) : 0, vn++, Y === 10 && (vn = 1, _n++), Y;
}
function Z() {
	return G(bn, J);
}
function wn() {
	return J;
}
function Tn(e, t) {
	return K(bn, e, t);
}
function En(e) {
	switch (e) {
		case 0:
		case 9:
		case 10:
		case 13:
		case 32: return 5;
		case 33:
		case 43:
		case 44:
		case 47:
		case 62:
		case 64:
		case 126:
		case 59:
		case 123:
		case 125: return 4;
		case 58: return 3;
		case 34:
		case 39:
		case 40:
		case 91: return 2;
		case 41:
		case 93: return 1;
	}
	return 0;
}
function Dn(e) {
	return _n = vn = 1, yn = q(bn = e), J = 0, [];
}
function On(e) {
	return bn = "", e;
}
function kn(e) {
	return pn(Tn(J - 1, Mn(e === 91 ? e + 2 : e === 40 ? e + 1 : e)));
}
function An(e) {
	for (; (Y = Z()) && Y < 33;) X();
	return En(e) > 2 || En(Y) > 3 ? "" : " ";
}
function jn(e, t) {
	for (; --t && X() && !(Y < 48 || Y > 102 || Y > 57 && Y < 65 || Y > 70 && Y < 97););
	return Tn(e, wn() + (t < 6 && Z() == 32 && X() == 32));
}
function Mn(e) {
	for (; X();) switch (Y) {
		case e: return J;
		case 34:
		case 39:
			e !== 34 && e !== 39 && Mn(Y);
			break;
		case 40:
			e === 41 && Mn(e);
			break;
		case 92: X();
	}
	return J;
}
function Nn(e, t) {
	for (; X() && e + Y !== 57 && (e + Y !== 84 || Z() !== 47););
	return "/*" + Tn(t, J - 1) + "*" + fn(e === 47 ? e : X());
}
function Pn(e) {
	for (; !En(Z());) X();
	return Tn(e, J);
}
function Fn(e) {
	return On(In("", null, null, null, [""], e = Dn(e), 0, [0], e));
}
function In(e, t, n, r, i, a, o, s, c) {
	for (var l = 0, u = 0, d = o, f = 0, p = 0, m = 0, h = 1, g = 1, _ = 1, v = 0, y = 0, b = "", x = i, S = a, C = r, w = b; g;) switch (m = y, y = X()) {
		case 40:
			m != 108 && G(w, d - 1) == 58 ? (v++, w += "(") : w += kn(y);
			break;
		case 41:
			v--, w += ")";
			break;
		case 34:
		case 39:
		case 91:
			w += kn(y);
			break;
		case 9:
		case 10:
		case 13:
		case 32:
			if (v > 0) {
				w += fn(y);
				break;
			}
			w += An(m);
			break;
		case 92:
			w += jn(wn() - 1, 7);
			continue;
		case 47:
			switch (Z()) {
				case 42:
				case 47:
					gn(Rn(Nn(X(), wn()), t, n, c), c), (En(m || 1) == 5 || En(Z() || 1) == 5) && q(w) && K(w, -1, void 0) !== " " && (w += " ");
					break;
				default: w += "/";
			}
			break;
		case 123 * h: s[l++] = q(w) * _;
		case 125 * h:
		case 59:
		case 0:
			if (v > 0 && y) {
				w += fn(y);
				break;
			}
			switch (y) {
				case 0:
				case 125: g = 0;
				case 59 + u:
					_ == -1 && (w = mn(w, /\f/g, "")), p > 0 && (q(w) - d || h === 0) && gn(p > 32 ? zn(w + ";", r, n, d - 1, c) : zn(mn(w, " ", "") + ";", r, n, d - 2, c), c);
					break;
				case 59: w += ";";
				default: if (gn(C = Ln(w, t, n, l, u, i, s, b, x = [], S = [], d, a), a), y === 123) {
					if (u === 0) In(w, t, C, C, x, a, d, s, S);
					else {
						switch (f) {
							case 99: if (G(w, 3) === 110) break;
							case 108: if (G(w, 2) === 97) break;
							default: u = 0;
							case 100:
							case 109:
							case 115:
						}
						u ? In(e, C, C, r && gn(Ln(e, C, C, 0, 0, i, s, b, i, x = [], d, S), S), i, S, d, s, r ? x : S) : In(w, C, C, C, [""], S, 0, s, S);
					}
				}
			}
			l = u = p = 0, h = _ = 1, b = w = "", d = o;
			break;
		case 58: d = 1 + q(w), p = m;
		default:
			if (h < 1) {
				if (y == 123) --h;
				else if (y == 125 && h++ == 0 && Cn() == 125) continue;
			}
			switch (w += fn(y), y * h) {
				case 38:
					_ = u > 0 ? 1 : (w += "\f", -1);
					break;
				case 44:
					if (v > 0) break;
					s[l++] = (q(w) - 1) * _, _ = 1;
					break;
				case 64:
					Z() === 45 && (w += kn(X())), f = Z(), u = d = q(b = w += Pn(wn())), y++;
					break;
				case 45: m === 45 && q(w) == 2 && (h = 0);
			}
	}
	return a;
}
function Ln(e, t, n, r, i, a, o, s, c, l, u, d) {
	for (var f = i - 1, p = i === 0 ? a : [""], m = hn(p), h = 0, g = 0, _ = 0; h < r; ++h) for (var v = 0, y = K(e, f + 1, f = dn(g = o[h])), b = e; v < m; ++v) (b = pn(g > 0 ? p[v] + " " + y : mn(y, /&\f/g, p[v]))) && (c[_++] = b);
	return xn(e, t, n, i === 0 ? an : s, c, l, u, d);
}
function Rn(e, t, n, r) {
	return xn(e, t, n, rn, fn(Sn()), K(e, 2, -2), 0, r);
}
function zn(e, t, n, r, i) {
	return xn(e, t, n, on, K(e, 0, r), K(e, r + 1, -1), r, i);
}
function Bn(e, t) {
	for (var n = "", r = 0; r < e.length; r++) n += t(e[r], r, e, t) || "";
	return n;
}
function Vn(e, t, n, r) {
	switch (e.type) {
		case un: if (e.children.length) break;
		case sn:
		case cn:
		case on: return e.return = e.return || e.value;
		case rn: return "";
		case ln: return e.return = e.value + "{" + Bn(e.children, r) + "}";
		case an: if (!q(e.value = e.props.join(","))) return "";
	}
	return q(n = Bn(e.children, r)) ? e.return = e.value + "{" + n + "}" : "";
}
function Hn(e) {
	var t = hn(e);
	return function(n, r, i, a) {
		for (var o = "", s = 0; s < t; s++) o += e[s](n, r, i, a) || "";
		return o;
	};
}
var Un = "c4", Wn = {
	id: Un,
	detector: /* @__PURE__ */ h((e) => /^\s*C4Context|C4Container|C4Component|C4Dynamic|C4Deployment/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./c4Diagram-YGBWAQC7-BsAr5jur.js");
		return {
			id: Un,
			diagram: e
		};
	}, "loader")
}, Gn = "flowchart-v2", Kn = {
	id: Gn,
	detector: /* @__PURE__ */ h((e) => /^\s*(graph|flowchart)/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./flowDiagram-KWPJA3E3-BW8nkhXb.js");
		return {
			id: Gn,
			diagram: e
		};
	}, "loader")
}, qn = "agentflow", Jn = {
	id: qn,
	detector: /* @__PURE__ */ h((e) => /^\s*agentflow-beta\b/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./diagram-22UHCM2B-DeVi2DDa.js");
		return {
			id: qn,
			diagram: e
		};
	}, "loader")
}, Yn = "swimlane", Xn = {
	id: Yn,
	detector: /* @__PURE__ */ h((e) => /^\s*swimlane-beta\b/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./swimlanesDiagram-TC7HE7FX-QKCn4BpV.js");
		return {
			id: Yn,
			diagram: e
		};
	}, "loader")
}, Zn = "er", Qn = {
	id: Zn,
	detector: /* @__PURE__ */ h((e) => /^\s*erDiagram/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./erDiagram-OPXOYQCR-DQa6N70o.js");
		return {
			id: Zn,
			diagram: e
		};
	}, "loader")
}, $n = "gitGraph", er = {
	id: $n,
	detector: /* @__PURE__ */ h((e) => /^\s*gitGraph/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./gitGraphDiagram-X574FWY7-bDc2GCWg.js");
		return {
			id: $n,
			diagram: e
		};
	}, "loader")
}, tr = "gantt", nr = {
	id: tr,
	detector: /* @__PURE__ */ h((e) => /^\s*gantt/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./ganttDiagram-FUAMR5RP-BbB3QIwG.js");
		return {
			id: tr,
			diagram: e
		};
	}, "loader")
}, rr = "info", ir = {
	id: rr,
	detector: /* @__PURE__ */ h((e) => /^\s*info/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./infoDiagram-VRGFBTTK-BbDGR5Qo.js");
		return {
			id: rr,
			diagram: e
		};
	}, "loader")
}, ar = "pie", or = {
	id: ar,
	detector: /* @__PURE__ */ h((e) => /^\s*pie/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./pieDiagram-5QR66LMP-DyJ9jHdj.js");
		return {
			id: ar,
			diagram: e
		};
	}, "loader")
}, sr = "quadrantChart", cr = {
	id: sr,
	detector: /* @__PURE__ */ h((e) => /^\s*quadrantChart/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./quadrantDiagram-O4NWA36T-B82Q13Fw.js");
		return {
			id: sr,
			diagram: e
		};
	}, "loader")
}, lr = "xychart", ur = {
	id: lr,
	detector: /* @__PURE__ */ h((e) => /^\s*xychart(-beta)?/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./xychartDiagram-PMCCYNJV-C2yKbTfv.js");
		return {
			id: lr,
			diagram: e
		};
	}, "loader")
}, dr = "requirement", fr = {
	id: dr,
	detector: /* @__PURE__ */ h((e) => /^\s*requirement(Diagram)?/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./requirementDiagram-PLB6GJNP-C9DiSk7z.js");
		return {
			id: dr,
			diagram: e
		};
	}, "loader")
}, pr = "sequence", mr = {
	id: pr,
	detector: /* @__PURE__ */ h((e) => /^\s*sequenceDiagram/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./sequenceDiagram-PO4LG4MO-BVz8cU4K.js");
		return {
			id: pr,
			diagram: e
		};
	}, "loader")
}, hr = "classDiagram", gr = {
	id: hr,
	detector: /* @__PURE__ */ h((e) => /^\s*classDiagram/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./classDiagram-v2-NBCMYWYE-BZ4bGHet.js");
		return {
			id: hr,
			diagram: e
		};
	}, "loader")
}, _r = "stateDiagram", vr = {
	id: _r,
	detector: /* @__PURE__ */ h((e) => /^\s*stateDiagram/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./stateDiagram-v2-GCMORJYK-GRK2W4dq.js");
		return {
			id: _r,
			diagram: e
		};
	}, "loader")
}, yr = "journey", br = {
	id: yr,
	detector: /* @__PURE__ */ h((e) => /^\s*journey/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./journeyDiagram-ZHPQQLJL-_EvFD6Oi.js");
		return {
			id: yr,
			diagram: e
		};
	}, "loader")
}, xr = { draw: /* @__PURE__ */ h((e, t, n) => {
	r.debug("rendering svg for syntax error\n");
	let i = he(t), a = i.append("g");
	i.attr("viewBox", "0 0 2412 512"), N(i, 100, 512, !0), a.append("path").attr("class", "error-icon").attr("d", "m411.313,123.313c6.25-6.25 6.25-16.375 0-22.625s-16.375-6.25-22.625,0l-32,32-9.375,9.375-20.688-20.688c-12.484-12.5-32.766-12.5-45.25,0l-16,16c-1.261,1.261-2.304,2.648-3.31,4.051-21.739-8.561-45.324-13.426-70.065-13.426-105.867,0-192,86.133-192,192s86.133,192 192,192 192-86.133 192-192c0-24.741-4.864-48.327-13.426-70.065 1.402-1.007 2.79-2.049 4.051-3.31l16-16c12.5-12.492 12.5-32.758 0-45.25l-20.688-20.688 9.375-9.375 32.001-31.999zm-219.313,100.687c-52.938,0-96,43.063-96,96 0,8.836-7.164,16-16,16s-16-7.164-16-16c0-70.578 57.422-128 128-128 8.836,0 16,7.164 16,16s-7.164,16-16,16z"), a.append("path").attr("class", "error-icon").attr("d", "m459.02,148.98c-6.25-6.25-16.375-6.25-22.625,0s-6.25,16.375 0,22.625l16,16c3.125,3.125 7.219,4.688 11.313,4.688 4.094,0 8.188-1.563 11.313-4.688 6.25-6.25 6.25-16.375 0-22.625l-16.001-16z"), a.append("path").attr("class", "error-icon").attr("d", "m340.395,75.605c3.125,3.125 7.219,4.688 11.313,4.688 4.094,0 8.188-1.563 11.313-4.688 6.25-6.25 6.25-16.375 0-22.625l-16-16c-6.25-6.25-16.375-6.25-22.625,0s-6.25,16.375 0,22.625l15.999,16z"), a.append("path").attr("class", "error-icon").attr("d", "m400,64c8.844,0 16-7.164 16-16v-32c0-8.836-7.156-16-16-16-8.844,0-16,7.164-16,16v32c0,8.836 7.156,16 16,16z"), a.append("path").attr("class", "error-icon").attr("d", "m496,96.586h-32c-8.844,0-16,7.164-16,16 0,8.836 7.156,16 16,16h32c8.844,0 16-7.164 16-16 0-8.836-7.156-16-16-16z"), a.append("path").attr("class", "error-icon").attr("d", "m436.98,75.605c3.125,3.125 7.219,4.688 11.313,4.688 4.094,0 8.188-1.563 11.313-4.688l32-32c6.25-6.25 6.25-16.375 0-22.625s-16.375-6.25-22.625,0l-32,32c-6.251,6.25-6.251,16.375-0.001,22.625z"), a.append("text").attr("class", "error-text").attr("x", 1440).attr("y", 250).attr("font-size", "150px").style("text-anchor", "middle").text("Syntax error in text"), a.append("text").attr("class", "error-text").attr("x", 1250).attr("y", 400).attr("font-size", "100px").style("text-anchor", "middle").text(`mermaid version ${n}`);
}, "draw") }, Sr = xr, Cr = {
	db: {},
	renderer: xr,
	parser: { parse: /* @__PURE__ */ h(() => {}, "parse") }
}, wr = "flowchart-elk", Tr = {
	id: wr,
	detector: /* @__PURE__ */ h((e, t = {}) => /^\s*flowchart-elk/.test(e) ? (t.layout = "elk", !0) : !1, "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./flowDiagram-KWPJA3E3-BW8nkhXb.js");
		return {
			id: wr,
			diagram: e
		};
	}, "loader")
}, Er = "timeline", Dr = {
	id: Er,
	detector: /* @__PURE__ */ h((e) => /^\s*timeline/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./timeline-definition-EJHVYXUP-cqxKpNaY.js");
		return {
			id: Er,
			diagram: e
		};
	}, "loader")
}, Or = "mindmap", kr = {
	id: Or,
	detector: /* @__PURE__ */ h((e) => /^\s*mindmap/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./mindmap-definition-NLK3R4M7-rdC3mmFY.js");
		return {
			id: Or,
			diagram: e
		};
	}, "loader")
}, Ar = "kanban", jr = {
	id: Ar,
	detector: /* @__PURE__ */ h((e) => /^\s*kanban/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./kanban-definition-PNTS6WVX-gHofTSYy.js");
		return {
			id: Ar,
			diagram: e
		};
	}, "loader")
}, Mr = "sankey", Nr = {
	id: Mr,
	detector: /* @__PURE__ */ h((e) => /^\s*sankey(-beta)?/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./sankeyDiagram-IPEJSGJF-Bx1mNGdZ.js");
		return {
			id: Mr,
			diagram: e
		};
	}, "loader")
}, Pr = "packet", Fr = {
	id: Pr,
	detector: /* @__PURE__ */ h((e) => /^\s*packet(-beta)?/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./diagram-MLGK6HIB-ChWMX2JR.js");
		return {
			id: Pr,
			diagram: e
		};
	}, "loader")
}, Ir = "radar", Lr = {
	id: Ir,
	detector: /* @__PURE__ */ h((e) => /^\s*radar-beta/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./diagram-MPIPVDR6-BxZXQzVU.js");
		return {
			id: Ir,
			diagram: e
		};
	}, "loader")
}, Rr = "block", zr = {
	id: Rr,
	detector: /* @__PURE__ */ h((e) => /^\s*block(-beta)?/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./blockDiagram-BEXU5L5S-BL0dHRlQ.js");
		return {
			id: Rr,
			diagram: e
		};
	}, "loader")
}, Br = "treeView", Vr = {
	id: Br,
	detector: /* @__PURE__ */ h((e) => /^\s*treeView-beta/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./diagram-CDSNMT55-FGarHLnE.js");
		return {
			id: Br,
			diagram: e
		};
	}, "loader")
}, Hr = "architecture", Ur = {
	id: Hr,
	detector: /* @__PURE__ */ h((e) => /^\s*architecture/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./architectureDiagram-NJMV4G6O-myaGrbEc.js");
		return {
			id: Hr,
			diagram: e
		};
	}, "loader")
}, Wr = "eventmodeling", Gr = {
	id: Wr,
	detector: /* @__PURE__ */ h((e) => /^\s*eventmodeling/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./diagram-ATOU4E4O-gXFvKK71.js");
		return {
			id: Wr,
			diagram: e
		};
	}, "loader")
}, Kr = "ishikawa", qr = {
	id: Kr,
	detector: /* @__PURE__ */ h((e) => /^\s*ishikawa(-beta)?\b/i.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./ishikawaDiagram-OU5B5YK6-C5HD1kzB.js");
		return {
			id: Kr,
			diagram: e
		};
	}, "loader")
}, Jr = "venn", Yr = {
	id: Jr,
	detector: /* @__PURE__ */ h((e) => /^\s*venn-beta/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./vennDiagram-UO4OBE2U-DuiLkbOp.js");
		return {
			id: Jr,
			diagram: e
		};
	}, "loader")
}, Xr = "treemap", Zr = {
	id: Xr,
	detector: /* @__PURE__ */ h((e) => /^\s*treemap/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./diagram-3UASUU5V-4TvIrRMk.js");
		return {
			id: Xr,
			diagram: e
		};
	}, "loader")
}, Qr = "usecase", $r = {
	id: Qr,
	detector: /* @__PURE__ */ h((e) => /^\s*usecase-beta(?:\s|$)/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./usecaseDiagram-POWQR4AR-B_PlDco-.js");
		return {
			id: Qr,
			diagram: e
		};
	}, "loader")
}, ei = "wardley", ti = {
	id: ei,
	detector: /* @__PURE__ */ h((e) => /^\s*wardley-beta/i.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./wardleyDiagram-VNRHLVJA-BFSaBTs3.js");
		return {
			id: ei,
			diagram: e
		};
	}, "loader")
}, ni = "cynefin", ri = {
	id: ni,
	detector: /* @__PURE__ */ h((e) => /^\s*cynefin-beta(?:[\s:]|$)/.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./cynefinDiagram-VND7K2PF-DlL3wrQP.js");
		return {
			id: ni,
			diagram: e
		};
	}, "loader")
}, ii = "railroad", ai = {
	id: ii,
	detector: /* @__PURE__ */ h((e) => /^\s*railroad-beta/i.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./railroadDiagram-XR7U4H2S-Q3RPzXTZ.js");
		return {
			id: ii,
			diagram: e
		};
	}, "loader")
}, oi = "railroadEbnf", si = {
	id: oi,
	detector: /* @__PURE__ */ h((e) => /^\s*railroad-ebnf-beta/i.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./ebnfDiagram-ZINNZB2B-QGzHu4f0.js");
		return {
			id: oi,
			diagram: e
		};
	}, "loader")
}, ci = "railroadAbnf", li = {
	id: ci,
	detector: /* @__PURE__ */ h((e) => /^\s*railroad-abnf-beta/i.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./abnfDiagram-O67JEVCF-CPVCA-ja.js");
		return {
			id: ci,
			diagram: e
		};
	}, "loader")
}, ui = "railroadPeg", di = {
	id: ui,
	detector: /* @__PURE__ */ h((e) => /^\s*railroad-peg-beta/i.test(e), "detector"),
	loader: /* @__PURE__ */ h(async () => {
		let { diagram: e } = await import("./pegDiagram-GJSIUBJH-CyVezvF8.js");
		return {
			id: ui,
			diagram: e
		};
	}, "loader")
}, fi = !1, pi = /* @__PURE__ */ h(() => {
	fi || (fi = !0, C("error", Cr, (e) => e.toLowerCase().trim() === "error"), C("---", {
		db: { clear: /* @__PURE__ */ h(() => {}, "clear") },
		styles: {},
		renderer: { draw: /* @__PURE__ */ h(() => {}, "draw") },
		parser: { parse: /* @__PURE__ */ h(() => {
			throw Error("Diagrams beginning with --- are not valid. If you were trying to use a YAML front-matter, please ensure that you've correctly opened and closed the YAML front-matter with un-indented `---` blocks");
		}, "parse") },
		init: /* @__PURE__ */ h(() => null, "init")
	}, (e) => e.toLowerCase().trimStart().startsWith("---")), w(Tr, kr, Ur), w(Jn, Wn, jr, gr, Qn, nr, ir, or, fr, mr, Xn, Kn, Dr, er, vr, br, cr, Nr, Fr, ur, zr, Gr, Vr, Lr, qr, Zr, ai, si, li, di, Yr, ti, ri, $r));
}, "addDiagrams"), mi = /* @__PURE__ */ h(async () => {
	r.debug("Loading registered diagrams");
	let e = (await Promise.allSettled(Object.entries(I).map(async ([e, { detector: t, loader: n }]) => {
		if (n) try {
			E(e);
		} catch {
			try {
				let { diagram: e, id: r } = await n();
				C(r, e, t);
			} catch (t) {
				throw r.error(`Failed to load external diagram with key ${e}. Removing from detectors.`), delete I[e], t;
			}
		}
	}))).filter((e) => e.status === "rejected");
	if (e.length > 0) {
		r.error(`Failed to load ${e.length} external diagrams`);
		for (let t of e) r.error(t);
		throw Error(`Failed to load ${e.length} external diagrams`);
	}
}, "loadRegisteredDiagrams"), hi = "graphics-document document";
function gi(e, t) {
	e.attr("role", hi), t !== "" && e.attr("aria-roledescription", t);
}
h(gi, "setA11yDiagramInfo");
function _i(e, t, n, r) {
	if (e.insert !== void 0) {
		if (n) {
			let t = `chart-desc-${r}`;
			e.attr("aria-describedby", t), e.insert("desc", ":first-child").attr("id", t).text(n);
		}
		if (t) {
			let n = `chart-title-${r}`;
			e.attr("aria-labelledby", n), e.insert("title", ":first-child").attr("id", n).text(t);
		}
	}
}
h(_i, "addSVGa11yTitleDescription");
var vi = class e {
	constructor(e, t, n, r, i) {
		this.type = e, this.text = t, this.db = n, this.parser = r, this.renderer = i;
	}
	static {
		h(this, "Diagram");
	}
	static async fromText(t, n = {}) {
		let i = typeof t == "string" ? {
			raw: t,
			cleaned: t
		} : t, a = M(), o = R(i.cleaned, a);
		try {
			E(o);
		} catch {
			let e = _(o);
			if (!e) throw new re(`Diagram ${o} not found.`);
			let { id: t, diagram: n } = await e();
			C(t, n);
		}
		let { db: s, parser: c, renderer: l, init: u } = E(o);
		c.parser && (c.parser.yy = s), s.clear?.(), u?.(a), n.title && s.setDiagramTitle?.(n.title);
		let f = i.cleaned;
		if (s.preserveCommentsWhenParsing && i.withComments) {
			let e = a.maxTextSize ?? ee.maxTextSize;
			i.withComments.length > e ? r.warn(`Comment-preserving source exceeds maxTextSize (${i.withComments.length} > ${e}); parsing the comment-stripped text instead. Reported source positions will not account for comment lines.`) : f = i.withComments;
		}
		let p = d(f) + "\n";
		return i.frontmatterLineOffset && s.setFrontmatterLineOffset?.(i.frontmatterLineOffset), await c.parse(p), new e(o, p, s, c, l);
	}
	async render(e, t) {
		await this.renderer.draw(this.text, e, t, this);
	}
	getParser() {
		return this.parser;
	}
	getType() {
		return this.type;
	}
}, yi = [], bi = /* @__PURE__ */ h(() => {
	yi.forEach((e) => {
		e();
	}), yi = [];
}, "attachFunctions"), xi = /* @__PURE__ */ h((e) => e.replace(/^\s*%%(?!{)[^\n]+\n?/gm, "").trimStart(), "cleanupComments");
function Si(e) {
	let t = e.match(j);
	if (!t) return {
		text: e,
		metadata: {}
	};
	let n = t[1], r = Yt(n ? t[2].split("\n").map((e) => e.startsWith(n) ? e.slice(n.length) : e).join("\n") : t[2], { schema: Kt }) ?? {};
	r = typeof r == "object" && !Array.isArray(r) ? r : {};
	let i = {};
	return r.displayMode && (i.displayMode = r.displayMode.toString()), r.title && (i.title = r.title.toString()), r.config && (i.config = r.config), {
		text: e.slice(t[0].length),
		metadata: i
	};
}
h(Si, "extractFrontMatter");
var Ci = /* @__PURE__ */ h((e) => e.replace(/\r\n?/g, "\n").replace(/<(\w+)([^>]*)>/g, (e, t, n) => "<" + t + n.replace(/="([^"]*)"/g, "='$1'") + ">"), "cleanupText"), wi = /* @__PURE__ */ h((e) => {
	let { text: t, metadata: n } = Si(e), { displayMode: r, title: i, config: a = {} } = n;
	return r && (a.gantt ||= {}, a.gantt.displayMode = r), {
		title: i,
		config: a,
		text: t
	};
}, "processFrontmatter"), Ti = /* @__PURE__ */ h((e) => {
	let t = c.detectInit(e) ?? {}, n = c.detectDirective(e, "wrap");
	return Array.isArray(n) ? t.wrap = n.some(({ type: e }) => e === "wrap") : n?.type === "wrap" && (t.wrap = !0), {
		text: l(e),
		directive: t
	};
}, "processDirectives");
function Ei(e) {
	let t = e, n = Ci(e), r = wi(n), i = Ti(r.text), a = u(r.config, i.directive), o = i.text;
	return {
		code: {
			raw: t,
			cleaned: xi(o),
			withComments: o,
			frontmatterLineOffset: n.length > r.text.length ? (n.substring(0, n.length - r.text.length).match(/\n/g) ?? []).length : 0
		},
		title: r.title,
		config: a
	};
}
h(Ei, "preprocessDiagram");
function Di(e) {
	let t = new TextEncoder().encode(e), n = Array.from(t, (e) => String.fromCodePoint(e)).join("");
	return btoa(n);
}
h(Di, "toBase64");
var Oi = 5e4, ki = "graph TB;a[Maximum text size in diagram exceeded];style a fill:#faa", Ai = "sandbox", ji = "loose", Mi = "http://www.w3.org/2000/svg", Ni = "http://www.w3.org/1999/xlink", Pi = "http://www.w3.org/1999/xhtml", Fi = "100%", Ii = "100%", Li = "border:0;margin:0;", Ri = "margin:0", zi = "allow-top-navigation-by-user-activation allow-popups", Bi = "The \"iframe\" tag is not supported by your browser.", Vi = ["foreignobject"], Hi = ["dominant-baseline"];
function Ui(e) {
	let t = Ei(e);
	y();
	let n;
	try {
		n = R(t.code.cleaned, M());
	} catch {
		n = void 0;
	}
	return x(n), L(t.config ?? {}), t;
}
h(Ui, "processAndSetConfigs");
async function Wi(e, t) {
	pi();
	try {
		let { code: t, config: n } = Ui(e);
		return {
			diagramType: (await vi.fromText(t)).type,
			config: n
		};
	} catch (e) {
		if (t?.suppressErrors) return !1;
		throw e;
	} finally {
		x(void 0);
	}
}
h(Wi, "parse");
var Gi = /* @__PURE__ */ h((e, t, n = []) => `.${e} ${t} ${S(`{ ${n.join(" !important; ")} !important; }`)}`, "cssImportantStyles"), Ki = /* @__PURE__ */ h((e, t = /* @__PURE__ */ new Map()) => {
	let n = new CSSStyleSheet();
	if (e.fontFamily !== void 0 && n.insertRule(`:root { --mermaid-font-family: ${e.fontFamily}}`, n.cssRules.length), e.altFontFamily !== void 0 && n.insertRule(`:root { --mermaid-alt-font-family: ${e.altFontFamily}}`, n.cssRules.length), t instanceof Map) {
		let r = D(e) ? ["> *", "span"] : [
			"rect",
			"polygon",
			"ellipse",
			"circle",
			"path"
		];
		t.forEach((e) => {
			_e(e.styles) || r.forEach((t) => {
				n.insertRule(Gi(e.id, t, e.styles), n.cssRules.length);
			}), _e(e.textStyles) || n.insertRule(Gi(e.id, "tspan", (e?.textStyles || []).map((e) => e.replace("color", "fill"))), n.cssRules.length);
		});
	}
	let r = "";
	if (e.themeCSS !== void 0) {
		if (typeof n.replaceSync == "function") {
			let t = new CSSStyleSheet();
			t.replaceSync(e.themeCSS), r = F(t) + "\n";
		} else r += `${e.themeCSS}
`;
	}
	return r + F(n);
}, "createCssStyles"), qi = /* @__PURE__ */ h((e, t) => Bn(Fn(`${e}{${t}}`), Hn([/* @__PURE__ */ h(function(t, n, i, a) {
	if (t.type === "rule" && Array.isArray(t.props)) {
		if (t.parent && t.parent.type === "@keyframes") return;
		t.props = t.props.map((n) => n === e && Array.isArray(t.children) && t.children.every((e) => e.type === "decl" && (/* @__PURE__ */ new Set([
			"font-family",
			"font-size",
			"fill"
		])).has(e.props)) ? n : !n.startsWith(`${e} `) && !n.startsWith(`${e}>`) || n.startsWith(`${e} ||`) ? `${e} ${n}` : n);
	} else t.type.startsWith("@") && ([
		"@media",
		"@supports",
		"@layer",
		"@scope",
		"@container",
		"@starting-style",
		"@keyframes"
	].includes(t.type) || (r.warn(`Removing unsupported at-rule ${t.type} from CSS`), t.type = rn));
}, "addNamespace"), Vn])), "compileCSS"), Ji = /* @__PURE__ */ h((e, t, n, r) => {
	let i = Ki(e, n);
	return qi(r, A(t, i, {
		...e.themeVariables,
		theme: e.theme,
		look: e.look
	}, r));
}, "createUserStyles"), Yi = /* @__PURE__ */ h((e = "", t, n) => {
	let r = e;
	return !n && !t && (r = r.replace(/marker-end="url\([\d+./:=?A-Za-z-]*?#/g, "marker-end=\"url(#")), r = a(r), r = r.replace(/<br>/g, "<br/>"), r;
}, "cleanUpSvgCode"), Xi = /* @__PURE__ */ h((e = "", t) => `<iframe style="width:${Fi};height:${t?.viewBox?.baseVal?.height ? t.viewBox.baseVal.height + "px" : Ii};${Li}" src="data:text/html;charset=UTF-8;base64,${Di(`<body style="${Ri}">${e}</body>`)}" sandbox="${zi}">
  ${Bi}
</iframe>`, "putIntoIFrame"), Zi = /* @__PURE__ */ h((e, t, n, r, i) => {
	let a = e.append("div");
	a.attr("id", n), r && a.attr("style", r);
	let o = a.append("svg").attr("id", t).attr("width", "100%").attr("xmlns", Mi);
	return i && o.attr("xmlns:xlink", i), o.append("g"), e;
}, "appendDivSvgG");
function Qi(e, t) {
	return e.append("iframe").attr("id", t).attr("style", "width: 100%; height: 100%;").attr("sandbox", "");
}
h(Qi, "sandboxedIframe");
var $i = /* @__PURE__ */ h((e, t, n, r) => {
	e.getElementById(t)?.remove(), e.getElementById(n)?.remove(), e.getElementById(r)?.remove();
}, "removeExistingElements"), ea = /* @__PURE__ */ h(async function(n, i, a) {
	pi();
	let o = Ui(i), s = o.code;
	i = s.cleaned;
	let c = M();
	r.debug(c), i.length > (c?.maxTextSize ?? Oi) && (i = ki, s = {
		raw: i,
		cleaned: i
	});
	let l = `#${n}`, u = "i" + n, d = "#" + u, f = "d" + n, p = "#" + f, m = /* @__PURE__ */ h(() => {
		let e = t(_ ? d : p).node();
		e && "remove" in e && e.remove();
	}, "removeTempElements"), g = t(document.body), _ = c.securityLevel === Ai, v = c.securityLevel === ji, y = c.fontFamily;
	if (a !== void 0) {
		if (a && (a.innerHTML = ""), _) {
			let e = Qi(t(a), u);
			g = t(e.nodes()[0].contentDocument.body), g.node().style.margin = "0";
		} else g = t(a);
		Zi(g, n, f, `font-family: ${y}`, Ni);
	} else {
		if ($i(document, n, f, u), _) {
			let e = Qi(t(document.body), u);
			g = t(e.nodes()[0].contentDocument.body), g.node().style.margin = "0";
		} else g = t("body");
		Zi(g, n, f);
	}
	let b, x;
	try {
		b = await vi.fromText(s, { title: o.title });
	} catch (e) {
		if (c.suppressErrorRendering) throw m(), e;
		b = await vi.fromText("error"), x = e;
	}
	let S = g.select(p).node(), C = b.type, w = S.firstChild, T = w.firstChild, E = b.renderer.getClasses?.(i, b), D = Ji(c, C, E, l), O = document.createElement("style");
	O.innerHTML = D, w.insertBefore(O, T);
	try {
		await b.renderer.draw(i, n, "12.0.0", b);
	} catch (e) {
		throw c.suppressErrorRendering ? m() : Sr.draw(i, n, "12.0.0"), e;
	}
	let k = g.select(`${p} svg`), A = b.db.getAccTitle?.(), j = b.db.getAccDescription?.();
	ia(C, k, A, j);
	let N = (/* @__PURE__ */ h(() => {
		g.select(`[id="${n}"]`).selectAll("foreignobject > *").attr("xmlns", Pi);
		let t = g.select(p).node().innerHTML;
		if (r.debug("config.arrowMarkerAbsolute", c.arrowMarkerAbsolute), t = Yi(t, _, P(c.arrowMarkerAbsolute)), _) {
			let e = g.select(p + " svg").node();
			t = Xi(t, e);
		} else v || (t = e.sanitize(t, {
			ADD_TAGS: Vi,
			ADD_ATTR: Hi,
			HTML_INTEGRATION_POINTS: { foreignobject: !0 }
		}));
		return bi(), t;
	}, "serializeSvg"))();
	if (x) throw x;
	return m(), {
		diagramType: C,
		svg: N,
		bindFunctions: b.db.bindFunctions
	};
}, "renderDiagram"), ta = /* @__PURE__ */ h(async function(e, t, n) {
	try {
		return await ea(e, t, n);
	} finally {
		x(void 0);
	}
}, "render");
function na(e = {}) {
	let t = te({}, e);
	t?.fontFamily && !t.themeVariables?.fontFamily && (t.themeVariables ||= {}, t.themeVariables.fontFamily = t.fontFamily), O(t);
	let r = ie.theme;
	t?.theme && Object.hasOwn(T, t.theme) ? t.themeVariables = T[t.theme].getThemeVariables(t.themeVariables) : t && (t.theme != null && t.theme !== "null" && (t.theme = r), t.themeVariables = T[r].getThemeVariables(t.themeVariables));
	let i = typeof t == "object" ? b(t) : v();
	n(i.logLevel), pi();
}
h(na, "initialize");
var ra = /* @__PURE__ */ h((e, t = {}) => {
	let { code: n } = Ei(e);
	return vi.fromText(n, t);
}, "getDiagramFromText");
function ia(e, t, n, r) {
	gi(t, e), _i(t, n, r, t.attr("id"));
}
h(ia, "addA11yInfo");
var Q = Object.freeze({
	render: ta,
	parse: Wi,
	getDiagramFromText: ra,
	initialize: na,
	getConfig: M,
	setConfig: k,
	getSiteConfig: v,
	updateSiteConfig: g,
	reset: /* @__PURE__ */ h(() => {
		y();
	}, "reset"),
	globalReset: /* @__PURE__ */ h(() => {
		y(ie);
	}, "globalReset"),
	defaultConfig: ie
});
n(M().logLevel), y(M());
var aa = /* @__PURE__ */ h((e, t, n) => {
	r.warn(e), s(e) ? (n && n(e.str, e.hash), t.push({
		...e,
		message: e.str,
		error: e
	})) : (n && n(e), e instanceof Error && t.push({
		str: e.message,
		message: e.message,
		hash: e.name,
		error: e
	}));
}, "handleError"), oa = /* @__PURE__ */ h(async function(e = { querySelector: ".mermaid" }) {
	try {
		await sa(e);
	} catch (t) {
		if (s(t) && r.error(t.str), $.parseError && $.parseError(t), !e.suppressErrors) throw r.error("Use the suppressErrors option to suppress these errors"), t;
	}
}, "run"), sa = /* @__PURE__ */ h(async function({ postRenderCallback: e, querySelector: t, nodes: n } = { querySelector: ".mermaid" }) {
	let i = Q.getConfig();
	r.debug(`${e ? "" : "No "}Callback function found`);
	let a;
	if (n) a = n;
	else if (t) a = document.querySelectorAll(t);
	else throw Error("Nodes and querySelector are both undefined");
	r.debug(`Found ${a.length} diagrams`), i?.startOnLoad !== void 0 && (r.debug("Start On Load: " + i?.startOnLoad), Q.updateSiteConfig({ startOnLoad: i?.startOnLoad }));
	let o = new c.InitIDGenerator(i.deterministicIds, i.deterministicIDSeed), s, l = [];
	for (let t of Array.from(a)) {
		if (r.info("Rendering diagram: " + t.id), t.getAttribute("data-processed")) continue;
		t.setAttribute("data-processed", "true");
		let n = `mermaid-${o.next()}`;
		s = t.innerHTML, s = se(c.entityDecode(s)).trim().replace(/<br\s*\/?>/gi, "<br/>");
		let i = c.detectInit(s);
		i && r.debug("Detected early reinit: ", i);
		try {
			let { svg: r, bindFunctions: i } = await _a(n, s, t);
			t.innerHTML = r, e && await e(n), i && i(t);
		} catch (e) {
			aa(e, l, $.parseError);
		}
	}
	if (l.length > 0) throw l[0];
}, "runThrowsErrors"), ca = /* @__PURE__ */ h(function(e) {
	Q.initialize(e);
}, "initialize"), la = /* @__PURE__ */ h(async function(e, t, n) {
	r.warn("mermaid.init is deprecated. Please use run instead."), e && ca(e);
	let i = {
		postRenderCallback: n,
		querySelector: ".mermaid"
	};
	typeof t == "string" ? i.querySelector = t : t && (i.nodes = t instanceof HTMLElement ? [t] : t), await oa(i);
}, "init"), ua = /* @__PURE__ */ h(async (e, { lazyLoad: t = !0 } = {}) => {
	pi(), w(...e), t === !1 && await mi();
}, "registerExternalDiagrams"), da = /* @__PURE__ */ h(function() {
	if ($.startOnLoad) {
		let { startOnLoad: e } = Q.getConfig();
		e && $.run().catch((e) => r.error("Mermaid failed to initialize", e));
	}
}, "contentLoaded");
typeof document < "u" && window.addEventListener("load", da, !1);
var fa = /* @__PURE__ */ h(function(e) {
	$.parseError = e;
}, "setParseErrorHandler"), pa = [], ma = !1, ha = /* @__PURE__ */ h(async () => {
	if (!ma) {
		for (ma = !0; pa.length > 0;) {
			let e = pa.shift();
			if (e) try {
				await e();
			} catch (e) {
				r.error("Error executing queue", e);
			}
		}
		ma = !1;
	}
}, "executeQueue"), ga = /* @__PURE__ */ h(async (e, t) => new Promise((n, i) => {
	let a = /* @__PURE__ */ h(() => new Promise((a, o) => {
		Q.parse(e, t).then((e) => {
			a(e), n(e);
		}, (e) => {
			r.error("Error parsing", e), $.parseError?.(e), o(e), i(e);
		});
	}), "performCall");
	pa.push(a), ha().catch(i);
}), "parse"), _a = /* @__PURE__ */ h((e, t, n) => new Promise((i, a) => {
	let o = /* @__PURE__ */ h(() => new Promise((o, s) => {
		Q.render(e, t, n).then((e) => {
			o(e), i(e);
		}, (e) => {
			r.error("Error parsing", e), $.parseError?.(e), s(e), a(e);
		});
	}), "performCall");
	pa.push(o), ha().catch(a);
}), "render"), $ = {
	startOnLoad: !0,
	mermaidAPI: Q,
	parse: ga,
	render: _a,
	init: la,
	run: oa,
	registerExternalDiagrams: ua,
	registerLayoutLoaders: xe,
	initialize: ca,
	parseError: void 0,
	contentLoaded: da,
	setParseErrorHandler: fa,
	detectType: R,
	registerIconPacks: oe,
	getRegisteredDiagramsMetadata: /* @__PURE__ */ h(() => Object.keys(I).map((e) => ({ id: e })), "getRegisteredDiagramsMetadata")
}, va = $;
export { he as a, va as default, Ce as i, Yt as n, Te as r, Kt as t };
