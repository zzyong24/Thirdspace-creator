import { C as e, D as t, F as n, G as r, H as i, I as a, S as o, T as s, W as c, X as l, Z as u, b as d, ct as f, dt as p, et as m, gt as h, h as g, mt as _, ot as v, p as y, q as ee, w as b, wt as x, x as S, xt as C, y as w, yt as T, z as E } from "./vendor_vue-OlfIOlFg.js";
import { h as D } from "./render-C0-GwsvR.js";
import { n as O } from "./vue-i18n-8AnKzzG6.js";
import { n as k } from "./lib-DIiEqr8B.js";
import { n as A } from "./editor-VmYacIt-.js";
import { c as j, d as M, i as N, p as P, r as F, s as I } from "./vendor_vueuse-DbHwQsn4.js";
import { i as L, n as R, r as z } from "./VisuallyHidden-D556S2Ak.js";
import { C as B, E as V, S as H, T as U, _ as W, v as G } from "./Teleport-YNIcOte_.js";
import { i as K, r as q, t as te } from "./Button-B4kIEl6s.js";
import { t as J } from "./usePrimitiveElement-CnkYcO3s.js";
import { a as ne, i as Y, n as re, r as ie, t as ae } from "./DialogTitle-w1SUV50e.js";
import { t as oe } from "./VisuallyHiddenInput-Xoe8o7nr.js";
import { t as se } from "./Label-BgDHuDsA.js";
import { t as X } from "./createLucideIcon-CFmwvUbS.js";
import { t as ce } from "./minus-u0NdL0u6.js";
import { t as le } from "./plus-C2jBVcNN.js";
import { t as ue } from "./trash-DHg1WvRr.js";
import { t as de } from "./x-E9vLZ87c.js";
import { a as fe, i as pe, n as me, o as he, s as ge, t as _e } from "./table-neeg7dzE.js";
import { t as ve } from "./DialogFooter-99Z6qvPr.js";
import { t as ye } from "./Input-BSRhgp5H.js";
var be = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]/u, xe = /android/i;
function Se() {
	return typeof navigator < "u" && xe.test(navigator.userAgent);
}
function Ce(e) {
	let t = p(!1), n = p(!0), r = p(!1), i = w(() => t.value && n.value);
	function o() {
		t.value = !0, n.value = !0, r.value = !1;
	}
	function s(e) {
		e.data && (be.test(e.data) ? (n.value = !0, r.value = !0) : Se() && !r.value && (n.value = !1));
	}
	function c(n) {
		a(() => {
			t.value = !1, e?.(n);
		});
	}
	return {
		isComposing: t,
		shouldDeferInput: i,
		handleCompositionStart: o,
		handleCompositionUpdate: s,
		handleCompositionEnd: c
	};
}
function we() {
	return {
		ALT: "Alt",
		ARROW_DOWN: "ArrowDown",
		ARROW_LEFT: "ArrowLeft",
		ARROW_RIGHT: "ArrowRight",
		ARROW_UP: "ArrowUp",
		BACKSPACE: "Backspace",
		CAPS_LOCK: "CapsLock",
		CONTROL: "Control",
		DELETE: "Delete",
		END: "End",
		ENTER: "Enter",
		ESCAPE: "Escape",
		F1: "F1",
		F10: "F10",
		F11: "F11",
		F12: "F12",
		F2: "F2",
		F3: "F3",
		F4: "F4",
		F5: "F5",
		F6: "F6",
		F7: "F7",
		F8: "F8",
		F9: "F9",
		HOME: "Home",
		META: "Meta",
		PAGE_DOWN: "PageDown",
		PAGE_UP: "PageUp",
		SHIFT: "Shift",
		SPACE: " ",
		TAB: "Tab",
		CTRL: "Control",
		ASTERISK: "*",
		SPACE_CODE: "Space"
	};
}
function Te(e) {
	let t = H({ locale: p("en") });
	return w(() => e?.value || t.locale?.value || "en");
}
var Ee = /* @__PURE__ */ new Map(), De = !1;
try {
	De = new Intl.NumberFormat("de-DE", { signDisplay: "exceptZero" }).resolvedOptions().signDisplay === "exceptZero";
} catch {}
var Z = !1;
try {
	Z = new Intl.NumberFormat("de-DE", {
		style: "unit",
		unit: "degree"
	}).resolvedOptions().style === "unit";
} catch {}
var Oe = { degree: { narrow: {
	default: "°",
	"ja-JP": " 度",
	"zh-TW": "度",
	"sl-SI": " °"
} } }, ke = class {
	constructor(e, t = {}) {
		this.numberFormatter = Ae(e, t), this.options = t;
	}
	format(e) {
		let t = "";
		if (t = !De && this.options.signDisplay != null ? je(this.numberFormatter, this.options.signDisplay, e) : this.numberFormatter.format(e), this.options.style === "unit" && !Z) {
			let { unit: e, unitDisplay: n = "short", locale: r } = this.resolvedOptions();
			if (!e) return t;
			let i = Oe[e]?.[n];
			t += i[r] || i.default;
		}
		return t;
	}
	formatToParts(e) {
		return this.numberFormatter.formatToParts(e);
	}
	formatRange(e, t) {
		if (typeof this.numberFormatter.formatRange == "function") return this.numberFormatter.formatRange(e, t);
		if (t < e) throw RangeError("End date must be >= start date");
		return `${this.format(e)} \u{2013} ${this.format(t)}`;
	}
	formatRangeToParts(e, t) {
		if (typeof this.numberFormatter.formatRangeToParts == "function") return this.numberFormatter.formatRangeToParts(e, t);
		if (t < e) throw RangeError("End date must be >= start date");
		let n = this.numberFormatter.formatToParts(e), r = this.numberFormatter.formatToParts(t);
		return [
			...n.map((e) => ({
				...e,
				source: "startRange"
			})),
			{
				type: "literal",
				value: " – ",
				source: "shared"
			},
			...r.map((e) => ({
				...e,
				source: "endRange"
			}))
		];
	}
	resolvedOptions() {
		let e = this.numberFormatter.resolvedOptions();
		return !De && this.options.signDisplay != null && (e = {
			...e,
			signDisplay: this.options.signDisplay
		}), !Z && this.options.style === "unit" && (e = {
			...e,
			style: "unit",
			unit: this.options.unit,
			unitDisplay: this.options.unitDisplay
		}), e;
	}
};
function Ae(e, t = {}) {
	let { numberingSystem: n } = t;
	if (n && e.includes("-nu-") && (e.includes("-u-") || (e += "-u-"), e += `-nu-${n}`), t.style === "unit" && !Z) {
		let { unit: e, unitDisplay: n = "short" } = t;
		if (!e) throw Error("unit option must be provided with style: \"unit\"");
		if (!Oe[e]?.[n]) throw Error(`Unsupported unit ${e} with unitDisplay = ${n}`);
		t = {
			...t,
			style: "decimal"
		};
	}
	let r = e + (t ? Object.entries(t).sort((e, t) => e[0] < t[0] ? -1 : 1).join() : "");
	if (Ee.has(r)) return Ee.get(r);
	let i = new Intl.NumberFormat(e, t);
	return Ee.set(r, i), i;
}
function je(e, t, n) {
	if (t === "auto") return e.format(n);
	if (t === "never") return e.format(Math.abs(n));
	{
		let r = !1;
		if (t === "always" ? r = n > 0 || Object.is(n, 0) : t === "exceptZero" && (Object.is(n, -0) || Object.is(n, 0) ? n = Math.abs(n) : r = n > 0), r) {
			let t = e.format(-n), r = e.format(n), i = t.replace(r, "").replace(/\u200e|\u061C/, "");
			return [...i].length !== 1 && console.warn("@react-aria/i18n polyfill for NumberFormat signDisplay: Unsupported case"), t.replace(r, "!!!").replace(i, "+").replace("!!!", r);
		}
		return e.format(n);
	}
}
var Me = /* @__PURE__ */ RegExp("^.*\\(.*\\).*$"), Ne = [
	"latn",
	"arab",
	"hanidec",
	"deva",
	"beng",
	"fullwide"
], Pe = class {
	constructor(e, t = {}) {
		this.locale = e, this.options = t;
	}
	parse(e) {
		return Ie(this.locale, this.options, e).parse(e);
	}
	isValidPartialNumber(e, t, n) {
		return Ie(this.locale, this.options, e).isValidPartialNumber(e, t, n);
	}
	getNumberingSystem(e) {
		return Ie(this.locale, this.options, e).options.numberingSystem;
	}
}, Fe = /* @__PURE__ */ new Map();
function Ie(e, t, n) {
	let r = Le(e, t);
	if (!e.includes("-nu-") && !r.isValidPartialNumber(n)) {
		for (let i of Ne) if (i !== r.options.numberingSystem) {
			let r = Le(e + (e.includes("-u-") ? "-nu-" : "-u-nu-") + i, t);
			if (r.isValidPartialNumber(n)) return r;
		}
	}
	return r;
}
function Le(e, t) {
	let n = e + (t ? Object.entries(t).sort((e, t) => e[0] < t[0] ? -1 : 1).join() : ""), r = Fe.get(n);
	return r || (r = new Re(e, t), Fe.set(n, r)), r;
}
var Re = class {
	constructor(e, t = {}) {
		this.locale = e, t.roundingIncrement !== 1 && t.roundingIncrement != null && (t.maximumFractionDigits == null && t.minimumFractionDigits == null ? (t.maximumFractionDigits = 0, t.minimumFractionDigits = 0) : t.maximumFractionDigits == null ? t.maximumFractionDigits = t.minimumFractionDigits : t.minimumFractionDigits ??= t.maximumFractionDigits), this.formatter = new Intl.NumberFormat(e, t), this.options = this.formatter.resolvedOptions(), this.symbols = Ve(e, this.formatter, this.options, t), this.options.style === "percent" && ((this.options.minimumFractionDigits ?? 0) > 18 || (this.options.maximumFractionDigits ?? 0) > 18) && console.warn("NumberParser cannot handle percentages with greater than 18 decimal places, please reduce the number in your options.");
	}
	parse(e) {
		let t = this.formatter.resolvedOptions().useGrouping, n = this.sanitize(e);
		if (!t && this.symbols.group && n.includes(this.symbols.group)) return NaN;
		if (this.symbols.group && (n = n.replaceAll(this.symbols.group, "")), this.symbols.decimal && (n = n.replace(this.symbols.decimal, ".")), this.symbols.minusSign && (n = n.replace(this.symbols.minusSign, "-")), n = n.replace(this.symbols.numeral, this.symbols.index), this.options.style === "percent") {
			let e = n.indexOf("-");
			n = n.replace("-", ""), n = n.replace("+", "");
			let t = n.indexOf(".");
			t === -1 && (t = n.length), n = n.replace(".", ""), n = t - 2 == 0 ? `0.${n}` : t - 2 == -1 ? `0.0${n}` : t - 2 == -2 ? "0.00" : `${n.slice(0, t - 2)}.${n.slice(t - 2)}`, e > -1 && (n = `-${n}`);
		}
		let r = n ? +n : NaN;
		if (isNaN(r)) return NaN;
		if (this.options.style === "percent") {
			let e = {
				...this.options,
				style: "decimal",
				minimumFractionDigits: Math.min((this.options.minimumFractionDigits ?? 0) + 2, 20),
				maximumFractionDigits: Math.min((this.options.maximumFractionDigits ?? 0) + 2, 20)
			};
			return new Pe(this.locale, e).parse(new ke(this.locale, e).format(r));
		}
		return this.options.currencySign === "accounting" && Me.test(e) && (r = -1 * r), r;
	}
	sanitize(e) {
		let t = this.formatter.resolvedOptions().useGrouping;
		return this.symbols.noNumeralUnits.length > 0 && this.symbols.noNumeralUnits.find((t) => t.unit === e) ? this.symbols.noNumeralUnits.find((t) => t.unit === e).value.toString() : (e = e.replace(this.symbols.literals, ""), this.symbols.minusSign && (e = e.replace("-", this.symbols.minusSign)), this.options.numberingSystem === "arab" && (this.symbols.decimal && (e = Q(e, ",", this.symbols.decimal), e = Q(e, "،", this.symbols.decimal)), this.symbols.group && t && (e = Q(e, ".", this.symbols.group))), this.symbols.group === "’" && e.includes("'") && t && (e = Q(e, "'", this.symbols.group)), this.symbols.group === "'" && e.includes("’") && t && (e = Q(e, "’", this.symbols.group)), this.options.locale === "fr-FR" && this.symbols.group && t && (e = Q(e, " ", this.symbols.group), e = Q(e, /\u00A0/g, this.symbols.group)), e);
	}
	isValidPartialNumber(e, t = -Infinity, n = Infinity) {
		let r = this.formatter.resolvedOptions().useGrouping;
		return e = this.sanitize(e), this.symbols.minusSign && e.startsWith(this.symbols.minusSign) && t < 0 ? e = e.slice(this.symbols.minusSign.length) : this.symbols.plusSign && e.startsWith(this.symbols.plusSign) && n > 0 && (e = e.slice(this.symbols.plusSign.length)), this.symbols.decimal && e.indexOf(this.symbols.decimal) > -1 && this.options.maximumFractionDigits === 0 ? !1 : (this.symbols.group && r && (e = Q(e, this.symbols.group, "")), e = e.replace(this.symbols.numeral, ""), this.symbols.decimal && (e = e.replace(this.symbols.decimal, "")), e.length === 0);
	}
}, ze = /* @__PURE__ */ new Set([
	"decimal",
	"fraction",
	"integer",
	"minusSign",
	"plusSign",
	"group"
]), Be = [
	0,
	4,
	2,
	1,
	11,
	20,
	3,
	7,
	100,
	21,
	.1,
	1.1
];
function Ve(e, t, n, r) {
	let i = new Intl.NumberFormat(e, {
		...n,
		minimumSignificantDigits: 1,
		maximumSignificantDigits: 21,
		roundingIncrement: 1,
		roundingPriority: "auto",
		roundingMode: "halfExpand",
		useGrouping: !0
	}), a = i.formatToParts(-10000.111), o = i.formatToParts(10000.111), s = Be.map((e) => i.formatToParts(e)), c = s.map((e, t) => {
		let n = e.find((e) => e.type === "unit");
		return n && !e.some((e) => e.type === "integer" || e.type === "fraction") ? {
			unit: n.value,
			value: Be[t]
		} : null;
	}).filter((e) => !!e), l = a.find((e) => e.type === "minusSign")?.value ?? "-", u = o.find((e) => e.type === "plusSign")?.value;
	!u && (r?.signDisplay === "exceptZero" || r?.signDisplay === "always") && (u = "+");
	let d = new Intl.NumberFormat(e, {
		...n,
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).formatToParts(.001).find((e) => e.type === "decimal")?.value, f = a.find((e) => e.type === "group")?.value, p = a.filter((e) => !ze.has(e.type)).map((e) => He(e.value)), m = s.flatMap((e) => e.filter((e) => !ze.has(e.type)).map((e) => He(e.value))), h = [.../* @__PURE__ */ new Set([...p, ...m])].sort((e, t) => t.length - e.length), g = h.length === 0 ? /* @__PURE__ */ RegExp("\\p{White_Space}|\\p{Cf}", "gu") : RegExp(`${h.join("|")}|\\p{White_Space}|\\p{Cf}`, "gu"), _ = [...new Intl.NumberFormat(n.locale, { useGrouping: !1 }).format(9876543210)].reverse(), v = new Map(_.map((e, t) => [e, t])), y = RegExp(`[${_.join("")}]`, "g");
	return {
		minusSign: l,
		plusSign: u,
		decimal: d,
		group: f,
		literals: g,
		numeral: y,
		numerals: _,
		index: (e) => String(v.get(e)),
		noNumeralUnits: c
	};
}
function Q(e, t, n) {
	return e.replaceAll ? e.replaceAll(t, n) : e.split(t).join(n);
}
function He(e) {
	return e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
var Ue = 400, We = 60, Ge = 10;
function Ke(e) {
	let { disabled: t } = e, n = p(), r = j(), i = p(!1), a = w(() => F(e.target)), o, s = "", c = 0, l = 0, u = !1, d = () => {
		n.value !== void 0 && (window.clearTimeout(n.value), n.value = void 0);
	}, m = () => {
		d(), o = void 0, s = "", u = !1, i.value = !1;
	}, h = () => t.value ? (m(), !1) : (r.trigger(), !0), g = (e) => {
		d(), n.value = window.setTimeout(() => {
			u = !0, h() && g(We);
		}, e);
	};
	return M && (N(a || window, "pointerdown", (e) => {
		if (!(e.button !== 0 || i.value || t.value)) {
			if (e.preventDefault(), o = e.pointerId, s = e.pointerType, c = e.clientX, l = e.clientY, u = !1, i.value = !0, e.pointerType === "mouse") {
				u = !0, h() && g(Ue);
				return;
			}
			g(Ue);
		}
	}), N(window, "pointermove", (e) => {
		if (e.pointerId !== o || s === "mouse") return;
		let t = e.clientX - c, n = e.clientY - l;
		t * t + n * n > Ge ** 2 && m();
	}), N(window, "pointerup", (e) => {
		if (e.pointerId !== o) return;
		let t = s !== "mouse" && !u;
		m(), t && h();
	}), N(window, "pointercancel", (e) => {
		e.pointerId === o && m();
	})), f(m), {
		isPressed: i,
		onTrigger: r.on
	};
}
function qe(e, t = p({})) {
	return P(() => new ke(e.value, t.value));
}
function Je(e, t = p({})) {
	return P(() => new Pe(e.value, t.value));
}
function $(e, t, n) {
	let r = e === "+" ? t + n : t - n;
	if (t % 1 != 0 || n % 1 != 0) {
		let i = t.toString().split("."), a = n.toString().split("."), o = i[1] && i[1].length || 0, s = a[1] && a[1].length || 0, c = 10 ** Math.max(o, s);
		t = Math.round(t * c), n = Math.round(n * c), r = e === "+" ? t + n : t - n, r /= c;
	}
	return r;
}
var [Ye, Xe] = /*#__PURE__*/ V("NumberFieldRoot"), Ze = /* @__PURE__ */ t({
	inheritAttrs: !1,
	__name: "NumberFieldRoot",
	props: {
		defaultValue: {
			type: Number,
			required: !1,
			default: void 0
		},
		modelValue: {
			type: [Number, null],
			required: !1
		},
		min: {
			type: Number,
			required: !1
		},
		max: {
			type: Number,
			required: !1
		},
		step: {
			type: Number,
			required: !1,
			default: 1
		},
		stepSnapping: {
			type: Boolean,
			required: !1,
			default: !0
		},
		focusOnChange: {
			type: Boolean,
			required: !1,
			default: !0
		},
		formatOptions: {
			type: null,
			required: !1
		},
		locale: {
			type: String,
			required: !1
		},
		disabled: {
			type: Boolean,
			required: !1
		},
		readonly: {
			type: Boolean,
			required: !1
		},
		disableWheelChange: {
			type: Boolean,
			required: !1
		},
		invertWheelChange: {
			type: Boolean,
			required: !1
		},
		id: {
			type: String,
			required: !1
		},
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1,
			default: "div"
		},
		name: {
			type: String,
			required: !1
		},
		required: {
			type: Boolean,
			required: !1
		}
	},
	emits: ["update:modelValue"],
	setup(e, { emit: t }) {
		let a = e, s = t, { disabled: c, readonly: l, disableWheelChange: u, invertWheelChange: d, min: f, max: g, step: _, stepSnapping: v, formatOptions: y, id: ee, locale: b } = h(a), x = I(a, "modelValue", s, {
			defaultValue: a.defaultValue,
			passive: a.modelValue === void 0
		}), { primitiveElement: C, currentElement: E } = J(), D = Te(b), O = R(E), k = p(), A = w(() => B(x.value) || isNaN(x.value) ? !1 : M("decrease", x.value) >= x.value), j = w(() => B(x.value) || isNaN(x.value) ? !1 : M("increase", x.value) <= x.value);
		function M(e, t, n = 1) {
			let r = _.value ?? 1, i = e === "increase" ? "+" : "-", a;
			if (v.value && !isNaN(r)) {
				let o = L(t, f.value, g.value, r);
				if (o === t) a = $(i, t, r * n);
				else {
					let s = e === "increase" ? o > t ? o : $("+", o, r) : o < t ? o : $("-", o, r);
					a = n > 1 ? $(i, s, r * (n - 1)) : s;
				}
			} else a = $(i, t, r * n);
			return Y(a);
		}
		function N(e, t = 1) {
			if (a.focusOnChange && k.value?.focus(), a.disabled || a.readonly) return;
			let n = U.parse(k.value?.value ?? "");
			if (isNaN(n)) {
				x.value = Y(f.value ?? 0);
				return;
			}
			x.value = M(e, n, t);
		}
		function P(e = 1) {
			N("increase", e);
		}
		function F(e = 1) {
			N("decrease", e);
		}
		function V(e) {
			e === "min" && f.value !== void 0 ? x.value = Y(f.value) : e === "max" && g.value !== void 0 && (x.value = Y(g.value));
		}
		let H = qe(D, y), U = Je(D, y), W = w(() => H.resolvedOptions().maximumFractionDigits > 0 ? "decimal" : "numeric"), G = qe(D, y), q = w(() => B(x.value) || isNaN(x.value) ? "" : G.format(x.value));
		function te(e) {
			return U.isValidPartialNumber(e, f.value, g.value);
		}
		function ne(e) {
			k.value && (k.value.value = e);
		}
		function Y(e) {
			let t;
			return t = _.value === void 0 || isNaN(_.value) || !v.value ? z(e, f.value, g.value) : L(e, f.value, g.value, _.value), t = U.parse(H.format(t)), t;
		}
		function re(e) {
			let t = U.parse(e);
			return x.value = isNaN(t) ? void 0 : Y(t), e.length ? ne(q.value) : ne(e);
		}
		return Xe({
			modelValue: x,
			handleDecrease: F,
			handleIncrease: P,
			handleMinMaxValue: V,
			inputMode: W,
			inputEl: k,
			onInputElement: (e) => k.value = e,
			textValue: q,
			readonly: l,
			validate: te,
			applyInputValue: re,
			disabled: c,
			disableWheelChange: u,
			invertWheelChange: d,
			max: g,
			min: f,
			isDecreaseDisabled: A,
			isIncreaseDisabled: j,
			id: ee
		}), (e, t) => (i(), S(T(K), n(e.$attrs, {
			ref_key: "primitiveElement",
			ref: C,
			role: "group",
			as: e.as,
			"as-child": e.asChild,
			"data-disabled": T(c) ? "" : void 0,
			"data-readonly": T(l) ? "" : void 0
		}), {
			default: m(() => [r(e.$slots, "default", {
				modelValue: T(x),
				textValue: q.value,
				readonly: T(l)
			}), T(O) && e.name ? (i(), S(T(oe), {
				key: 0,
				type: "text",
				value: T(x),
				name: e.name,
				disabled: T(c),
				readonly: T(l),
				required: e.required
			}, null, 8, [
				"value",
				"name",
				"disabled",
				"readonly",
				"required"
			])) : o("v-if", !0)]),
			_: 3
		}, 16, [
			"as",
			"as-child",
			"data-disabled",
			"data-readonly"
		]));
	}
}), Qe = /* @__PURE__ */ t({
	__name: "NumberFieldDecrement",
	props: {
		disabled: {
			type: Boolean,
			required: !1
		},
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
		let t = e, a = Ye(), o = w(() => a.disabled?.value || a.readonly.value || t.disabled || a.isDecreaseDisabled.value), { primitiveElement: s, currentElement: c } = J(), { isPressed: l, onTrigger: u } = Ke({
			target: c,
			disabled: o
		});
		return u(() => {
			a.handleDecrease();
		}), (e, a) => (i(), S(T(K), n(t, {
			ref_key: "primitiveElement",
			ref: s,
			tabindex: "-1",
			"aria-label": "Decrease",
			type: e.as === "button" ? "button" : void 0,
			style: { userSelect: T(l) ? "none" : void 0 },
			disabled: o.value ? "" : void 0,
			"data-disabled": o.value ? "" : void 0,
			"data-pressed": T(l) ? "true" : void 0,
			onContextmenu: a[0] ||= y(() => {}, ["prevent"])
		}), {
			default: m(() => [r(e.$slots, "default")]),
			_: 3
		}, 16, [
			"type",
			"style",
			"disabled",
			"data-disabled",
			"data-pressed"
		]));
	}
}), $e = /* @__PURE__ */ t({
	__name: "NumberFieldIncrement",
	props: {
		disabled: {
			type: Boolean,
			required: !1
		},
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
		let t = e, a = Ye(), o = w(() => a.disabled?.value || a.readonly.value || t.disabled || a.isIncreaseDisabled.value), { primitiveElement: s, currentElement: c } = J(), { isPressed: l, onTrigger: u } = Ke({
			target: c,
			disabled: o
		});
		return u(() => {
			a.handleIncrease();
		}), (e, a) => (i(), S(T(K), n(t, {
			ref_key: "primitiveElement",
			ref: s,
			tabindex: "-1",
			"aria-label": "Increase",
			type: e.as === "button" ? "button" : void 0,
			style: { userSelect: T(l) ? "none" : void 0 },
			disabled: o.value ? "" : void 0,
			"data-disabled": o.value ? "" : void 0,
			"data-pressed": T(l) ? "true" : void 0,
			onContextmenu: a[0] ||= y(() => {}, ["prevent"])
		}), {
			default: m(() => [r(e.$slots, "default")]),
			_: 3
		}, 16, [
			"type",
			"style",
			"disabled",
			"data-disabled",
			"data-pressed"
		]));
	}
}), et = /* @__PURE__ */ t({
	__name: "NumberFieldInput",
	props: {
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1,
			default: "input"
		}
	},
	setup(e) {
		let t = e, { primitiveElement: a, currentElement: o } = J(), s = Ye(), c = we(), { isComposing: l, handleCompositionStart: d, handleCompositionEnd: f } = Ce();
		function h(e) {
			if (!(l.value || e.isComposing)) switch (e.key) {
				case c.ARROW_UP:
					e.preventDefault(), s.handleIncrease();
					break;
				case c.ARROW_DOWN:
					e.preventDefault(), s.handleDecrease();
					break;
				case c.PAGE_UP:
					e.preventDefault(), s.handleIncrease(10);
					break;
				case c.PAGE_DOWN:
					e.preventDefault(), s.handleDecrease(10);
					break;
				case c.HOME:
					e.preventDefault(), s.handleMinMaxValue("min");
					break;
				case c.END:
					e.preventDefault(), s.handleMinMaxValue("max");
					break;
				case c.ENTER: s.applyInputValue(e.target?.value);
			}
		}
		function g(e) {
			s.disableWheelChange.value || e.target === U() && (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || (e.preventDefault(), e.deltaY > 0 ? s.invertWheelChange.value ? s.handleDecrease() : s.handleIncrease() : e.deltaY < 0 && (s.invertWheelChange.value ? s.handleIncrease() : s.handleDecrease())));
		}
		E(() => {
			s.onInputElement(o.value);
		});
		let _ = p(s.textValue.value);
		u(() => s.textValue.value, () => {
			_.value = s.textValue.value;
		}, {
			immediate: !0,
			deep: !0
		});
		function v() {
			requestAnimationFrame(() => {
				_.value = s.textValue.value;
			});
		}
		return (e, o) => (i(), S(T(K), n(t, {
			id: T(s).id.value,
			ref_key: "primitiveElement",
			ref: a,
			value: _.value,
			role: "spinbutton",
			type: "text",
			tabindex: "0",
			inputmode: T(s).inputMode.value,
			disabled: T(s).disabled.value ? "" : void 0,
			"data-disabled": T(s).disabled.value ? "" : void 0,
			readonly: T(s).readonly.value ? "" : void 0,
			"data-readonly": T(s).readonly.value ? "" : void 0,
			autocomplete: "off",
			autocorrect: "off",
			spellcheck: "false",
			"aria-roledescription": "Number field",
			"aria-valuenow": T(s).modelValue.value,
			"aria-valuemin": T(s).min.value,
			"aria-valuemax": T(s).max.value,
			onKeydown: h,
			onWheel: g,
			onBeforeinput: o[0] ||= (e) => {
				if (e.isComposing || e.inputType.startsWith("delete") || e.inputType.startsWith("history")) return;
				let t = e.target, n = t.value.slice(0, t.selectionStart ?? void 0) + (e.data ?? "") + t.value.slice(t.selectionEnd ?? void 0);
				T(s).validate(n) || e.preventDefault();
			},
			onInput: o[1] ||= (e) => {
				let t = e.target;
				_.value = t.value;
			},
			onChange: v,
			onBlur: o[2] ||= (e) => T(s).applyInputValue(e.target?.value),
			onCompositionstart: T(d),
			onCompositionend: T(f)
		}), {
			default: m(() => [r(e.$slots, "default")]),
			_: 3
		}, 16, [
			"id",
			"value",
			"inputmode",
			"disabled",
			"data-disabled",
			"readonly",
			"data-readonly",
			"aria-valuenow",
			"aria-valuemin",
			"aria-valuemax",
			"onCompositionstart",
			"onCompositionend"
		]));
	}
}), tt = X({
	name: "text-align-center",
	size: 24,
	node: [
		["path", {
			d: "M21 5H3",
			key: "1fi0y6"
		}],
		["path", {
			d: "M17 12H7",
			key: "16if0g"
		}],
		["path", {
			d: "M19 19H5",
			key: "vjpgq2"
		}]
	],
	aliases: ["align-center"]
}), nt = X({
	name: "text-align-end",
	size: 24,
	node: [
		["path", {
			d: "M21 5H3",
			key: "1fi0y6"
		}],
		["path", {
			d: "M21 12H9",
			key: "dn1m92"
		}],
		["path", {
			d: "M21 19H7",
			key: "4cu937"
		}]
	],
	aliases: ["align-right"]
}), rt = X({
	name: "text-align-justify",
	size: 24,
	node: [
		["path", {
			d: "M3 5h18",
			key: "1u36vt"
		}],
		["path", {
			d: "M3 12h18",
			key: "1i2n21"
		}],
		["path", {
			d: "M3 19h18",
			key: "awlh7x"
		}]
	],
	aliases: ["align-justify"]
}), it = X({
	name: "text-align-start",
	size: 24,
	node: [
		["path", {
			d: "M21 5H3",
			key: "1fi0y6"
		}],
		["path", {
			d: "M15 12H3",
			key: "6jk70r"
		}],
		["path", {
			d: "M17 19H3",
			key: "z6ezky"
		}]
	],
	aliases: ["text", "align-left"]
}), at = /* @__PURE__ */ t({
	__name: "NumberField",
	props: {
		defaultValue: {},
		modelValue: {},
		min: {},
		max: {},
		step: {},
		stepSnapping: { type: Boolean },
		focusOnChange: { type: Boolean },
		formatOptions: {},
		locale: {},
		disabled: { type: Boolean },
		readonly: { type: Boolean },
		disableWheelChange: { type: Boolean },
		invertWheelChange: { type: Boolean },
		id: {},
		asChild: { type: Boolean },
		as: {},
		name: {},
		required: { type: Boolean },
		class: { type: [
			Boolean,
			null,
			String,
			Object,
			Array
		] }
	},
	emits: ["update:modelValue"],
	setup(e, { emit: t }) {
		let a = e, o = t, s = w(() => {
			let { class: e, ...t } = a;
			return t;
		}), c = W(s, o);
		return (e, t) => (i(), S(T(Ze), n(T(c), { class: T(q)("grid gap-1.5", a.class) }), {
			default: m(() => [r(e.$slots, "default")]),
			_: 3
		}, 16, ["class"]));
	}
}), ot = /* @__PURE__ */ t({
	__name: "NumberFieldContent",
	props: { class: { type: [
		Boolean,
		null,
		String,
		Object,
		Array
	] } },
	setup(t) {
		let n = t;
		return (t, a) => (i(), e("div", { class: C(T(q)("relative has-data-[slot=increment]:*:data-[slot=input]:pr-5 has-data-[slot=decrement]:*:data-[slot=input]:pl-5", n.class)) }, [r(t.$slots, "default")], 2));
	}
}), st = /* @__PURE__ */ t({
	__name: "NumberFieldIncrement",
	props: {
		disabled: { type: Boolean },
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
		let t = e, a = w(() => {
			let { class: e, ...n } = t;
			return n;
		}), o = G(a);
		return (e, a) => (i(), S(T($e), n({ "data-slot": "increment" }, T(o), { class: T(q)("absolute top-1/2 -translate-y-1/2 right-0 disabled:cursor-not-allowed disabled:opacity-20 p-3", t.class) }), {
			default: m(() => [r(e.$slots, "default", {}, () => [s(T(le), { class: "h-4 w-4" })])]),
			_: 3
		}, 16, ["class"]));
	}
}), ct = /* @__PURE__ */ t({
	__name: "NumberFieldInput",
	props: { class: { type: [
		Boolean,
		null,
		String,
		Object,
		Array
	] } },
	setup(e) {
		let t = e;
		return (e, n) => (i(), S(T(et), {
			"data-slot": "input",
			class: C(T(q)("flex h-10 w-full rounded-md border border-input bg-background py-2 text-sm text-center ring-offset-background placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50", t.class))
		}, null, 8, ["class"]));
	}
}), lt = /* @__PURE__ */ t({
	__name: "NumberFieldDecrement",
	props: {
		disabled: { type: Boolean },
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
		let t = e, a = w(() => {
			let { class: e, ...n } = t;
			return n;
		}), o = G(a);
		return (e, a) => (i(), S(T(Qe), n({ "data-slot": "decrement" }, T(o), { class: T(q)("absolute top-1/2 -translate-y-1/2 left-0 p-3 disabled:cursor-not-allowed disabled:opacity-20", t.class) }), {
			default: m(() => [r(e.$slots, "default", {}, () => [s(T(ce), { class: "h-4 w-4" })])]),
			_: 3
		}, 16, ["class"]));
	}
}), ut = { class: "flex flex-wrap items-center gap-4" }, dt = { class: "w-full border-collapse text-sm" }, ft = { class: "sticky top-0 bg-background" }, pt = { class: "border-b" }, mt = { class: "flex items-center justify-center gap-0.5" }, ht = ["title", "onClick"], gt = [
	"title",
	"aria-label",
	"onClick"
], _t = { class: "border-b" }, vt = { class: "w-8 px-1 text-center" }, yt = [
	"title",
	"aria-label",
	"onClick"
], bt = ["disabled"], xt = 50, St = 12, Ct = /* @__PURE__ */ t({
	__name: "TableEditDialog",
	setup(t) {
		let { t: n } = O(), r = D(), f = A(), h = p(0), y = p(0), C = w(() => Math.max(xt, h.value)), E = w(() => Math.max(St, y.value)), j = p(null), M = w(() => j.value !== null), N = p([]), P = p([]), F = p([]), I = l("gridRef");
		function L(e, t) {
			return Array.from({ length: t }, (t, n) => e[n] ?? "");
		}
		function R(e) {
			let t = ge(e);
			N.value = L(e.header, t), P.value = Array.from({ length: t }, (t, n) => e.aligns[n] ?? null), F.value = e.rows.map((e) => L(e, t));
		}
		let z = w({
			get: () => Math.max(N.value.length, 1),
			set: (e) => {
				let t = Math.max(1, Math.min(E.value, Math.floor(e) || 1));
				for (; N.value.length < t;) N.value.push(""), P.value.push(null), F.value.forEach((e) => e.push(""));
				N.value.length = t, P.value.length = t, F.value.forEach((e) => e.length = t);
			}
		}), B = w({
			get: () => F.value.length,
			set: (e) => {
				let t = Math.max(1, Math.min(C.value, Math.floor(e) || 1));
				for (; F.value.length < t;) F.value.push(Array.from({ length: z.value }).fill(""));
				F.value.length = t;
			}
		});
		u(() => r.isShowTableEditDialog, async (e) => {
			if (!e) return;
			let t = _(f.editor), n = t ? pe(t.state.doc.toString(), t.state.selection.main.head) : null, r = n ? fe(n.text) : null;
			n && r ? (j.value = n, R(r)) : (j.value = null, R(me(3, 3))), h.value = F.value.length, y.value = N.value.length, await a(), I.value?.querySelector("input[data-r=\"-1\"][data-c=\"0\"]")?.focus();
		}, { immediate: !0 });
		function V() {
			F.value.length < C.value && F.value.push(Array.from({ length: z.value }).fill(""));
		}
		function H(e) {
			F.value.length > 1 && F.value.splice(e, 1);
		}
		function U(e) {
			z.value <= 1 || (N.value.splice(e, 1), P.value.splice(e, 1), F.value.forEach((t) => t.splice(e, 1)));
		}
		let W = [
			null,
			"left",
			"center",
			"right"
		], G = {
			left: it,
			center: tt,
			right: nt
		};
		function K(e) {
			let t = W[(W.indexOf(P.value[e] ?? null) + 1) % W.length];
			P.value[e] = t;
		}
		function q(e) {
			let t = P.value[e];
			return t ? G[t] : rt;
		}
		function J(e) {
			let t = P.value[e] ?? null, r = t === null ? "alignDefault" : `align${t[0].toUpperCase()}${t.slice(1)}`;
			return n(`tableEditor.${r}`);
		}
		function oe(e, t, n) {
			if (e.key !== "Enter" || e.isComposing) return;
			e.preventDefault();
			let r = t + 1;
			r >= F.value.length && V(), a(() => {
				I.value?.querySelector(`input[data-r="${r}"][data-c="${n}"]`)?.focus();
			});
		}
		function X() {
			let e = _(f.editor), t = j.value;
			if (!e || !t) return null;
			let r = he(e.state.doc.toString(), t);
			return r ? (j.value = r, r) : (k.error(n("tableEditor.staleError")), null);
		}
		function ce() {
			let e = _(f.editor);
			if (!e) return;
			let t = _e({
				header: N.value,
				aligns: P.value,
				rows: F.value
			});
			if (M.value) {
				let r = X();
				if (!r) return;
				let { from: i, to: a, text: o } = r, s = o.match(/^ */)?.[0] ?? "", c = s ? t.split("\n").map((e) => s + e).join("\n") : t;
				e.dispatch({
					changes: {
						from: i,
						to: a,
						insert: c
					},
					selection: { anchor: i + c.length }
				}), k.success(n("tableEditor.updateSuccess"));
			} else {
				let r = e.state.selection.main, i = e.state.doc.lineAt(r.head);
				if (i.text.trim() === "") e.dispatch({
					changes: {
						from: i.from,
						to: i.to,
						insert: t
					},
					selection: { anchor: i.from + t.length }
				});
				else {
					let n = i.to;
					e.dispatch({
						changes: {
							from: n,
							insert: `\n\n${t}`
						},
						selection: { anchor: n + 2 + t.length }
					});
				}
				k.success(n("tableEditor.insertSuccess"));
			}
			e.focus(), r.closeTableEditDialog();
		}
		function be() {
			let e = _(f.editor);
			if (!e || !j.value) return;
			let t = X();
			if (!t) return;
			let n = e.state.doc, { from: i } = t, { to: a } = t, o = n.lineAt(i), s = n.lineAt(a), c = o.number > 1 && n.line(o.number - 1).text.trim() === "", l = s.number < n.lines && n.line(s.number + 1).text.trim() === "";
			c && l && (i = n.line(o.number - 1).from), e.dispatch({
				changes: {
					from: i,
					to: a,
					insert: ""
				},
				selection: { anchor: i }
			}), e.focus(), r.closeTableEditDialog();
		}
		function xe(e) {
			e || r.closeTableEditDialog();
		}
		return (t, a) => {
			let l = ae, u = re, f = ie, p = se, h = lt, _ = ct, y = st, w = ot, D = at, O = ye, k = te, A = ve, j = Y, P = ne;
			return i(), S(P, {
				open: T(r).isShowTableEditDialog,
				"onUpdate:open": xe
			}, {
				default: m(() => [s(j, { class: "sm:max-w-3xl max-h-[90vh] flex flex-col" }, {
					default: m(() => [
						s(f, null, {
							default: m(() => [s(l, null, {
								default: m(() => [b(x(T(M) ? T(n)("tableEditor.titleEdit") : T(n)("tableEditor.titleCreate")), 1)]),
								_: 1
							}), s(u, null, {
								default: m(() => [b(x(T(M) ? T(n)("tableEditor.descriptionEdit") : T(n)("tableEditor.descriptionCreate")), 1)]),
								_: 1
							})]),
							_: 1
						}),
						d("div", ut, [s(D, {
							modelValue: T(B),
							"onUpdate:modelValue": a[0] ||= (e) => v(B) ? B.value = e : null,
							min: 1,
							max: T(C),
							class: "w-32"
						}, {
							default: m(() => [s(p, null, {
								default: m(() => [b(x(T(n)("tableEditor.rows")), 1)]),
								_: 1
							}), s(w, null, {
								default: m(() => [
									s(h),
									s(_),
									s(y)
								]),
								_: 1
							})]),
							_: 1
						}, 8, ["modelValue", "max"]), s(D, {
							modelValue: T(z),
							"onUpdate:modelValue": a[1] ||= (e) => v(z) ? z.value = e : null,
							min: 1,
							max: T(E),
							class: "w-32"
						}, {
							default: m(() => [s(p, null, {
								default: m(() => [b(x(T(n)("tableEditor.cols")), 1)]),
								_: 1
							}), s(w, null, {
								default: m(() => [
									s(h),
									s(_),
									s(y)
								]),
								_: 1
							})]),
							_: 1
						}, 8, ["modelValue", "max"])]),
						d("div", {
							ref_key: "gridRef",
							ref: I,
							class: "min-h-0 flex-1 overflow-auto rounded-md border"
						}, [d("table", dt, [d("thead", ft, [d("tr", pt, [a[3] ||= d("th", { class: "w-8" }, null, -1), (i(!0), e(g, null, c(T(z), (t) => (i(), e("th", {
							key: t,
							class: "group px-1 py-1.5 font-normal"
						}, [d("div", mt, [d("button", {
							type: "button",
							class: "hover:bg-accent rounded p-1 transition-colors",
							title: J(t - 1),
							onClick: (e) => K(t - 1)
						}, [(i(), S(ee(q(t - 1)), { class: "h-3.5 w-3.5" }))], 8, ht), T(z) > 1 ? (i(), e("button", {
							key: 0,
							type: "button",
							class: "hover:bg-destructive/10 hover:text-destructive rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
							title: T(n)("tableEditor.deleteCol"),
							"aria-label": T(n)("tableEditor.deleteCol"),
							onClick: (e) => U(t - 1)
						}, [s(T(de), { class: "h-3.5 w-3.5" })], 8, gt)) : o("", !0)])]))), 128))]), d("tr", _t, [a[4] ||= d("th", null, null, -1), (i(!0), e(g, null, c(T(z), (t) => (i(), e("td", {
							key: t,
							class: "p-1"
						}, [s(O, {
							modelValue: T(N)[t - 1],
							"onUpdate:modelValue": (e) => T(N)[t - 1] = e,
							"data-r": -1,
							"data-c": t - 1,
							class: "bg-muted/50 h-9 font-medium",
							placeholder: T(n)("tableEditor.header"),
							onKeydown: (e) => oe(e, -1, t - 1)
						}, null, 8, [
							"modelValue",
							"onUpdate:modelValue",
							"data-c",
							"placeholder",
							"onKeydown"
						])]))), 128))])]), d("tbody", null, [(i(!0), e(g, null, c(T(F), (t, r) => (i(), e("tr", {
							key: r,
							class: "group border-b last:border-b-0"
						}, [d("td", vt, [T(F).length > 1 ? (i(), e("button", {
							key: 0,
							type: "button",
							class: "hover:bg-destructive/10 hover:text-destructive rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
							title: T(n)("tableEditor.deleteRow"),
							"aria-label": T(n)("tableEditor.deleteRow"),
							onClick: (e) => H(r)
						}, [s(T(ue), { class: "h-3.5 w-3.5" })], 8, yt)) : o("", !0)]), (i(!0), e(g, null, c(T(z), (n) => (i(), e("td", {
							key: n,
							class: "p-1"
						}, [s(O, {
							modelValue: t[n - 1],
							"onUpdate:modelValue": (e) => t[n - 1] = e,
							"data-r": r,
							"data-c": n - 1,
							class: "h-9",
							onKeydown: (e) => oe(e, r, n - 1)
						}, null, 8, [
							"modelValue",
							"onUpdate:modelValue",
							"data-r",
							"data-c",
							"onKeydown"
						])]))), 128))]))), 128))])]), d("button", {
							type: "button",
							class: "text-muted-foreground hover:bg-accent hover:text-foreground flex w-full items-center justify-center gap-1 border-t border-dashed py-2 text-sm transition-colors disabled:opacity-50",
							disabled: T(F).length >= T(C),
							onClick: V
						}, [s(T(le), { class: "h-4 w-4" }), b(" " + x(T(n)("tableEditor.addRow")), 1)], 8, bt)], 512),
						s(A, { class: "gap-2" }, {
							default: m(() => [
								T(M) ? (i(), S(k, {
									key: 0,
									variant: "destructive",
									class: "mr-auto",
									onClick: be
								}, {
									default: m(() => [b(x(T(n)("tableEditor.deleteTable")), 1)]),
									_: 1
								})) : o("", !0),
								s(k, {
									variant: "outline",
									onClick: a[2] ||= (e) => T(r).closeTableEditDialog()
								}, {
									default: m(() => [b(x(T(n)("common.cancel")), 1)]),
									_: 1
								}),
								s(k, { onClick: ce }, {
									default: m(() => [b(x(T(M) ? T(n)("tableEditor.update") : T(n)("tableEditor.insert")), 1)]),
									_: 1
								})
							]),
							_: 1
						})
					]),
					_: 1
				})]),
				_: 1
			}, 8, ["open"]);
		};
	}
});
export { Ct as default };
