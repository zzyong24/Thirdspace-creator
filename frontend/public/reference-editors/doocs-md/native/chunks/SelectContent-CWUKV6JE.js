import { B as e, C as t, Ct as n, D as r, F as i, G as a, H as o, I as s, Q as c, R as l, S as u, St as d, T as f, W as p, Z as m, b as h, dt as g, et as _, g as v, gt as y, h as b, k as x, p as S, q as C, w, wt as T, x as E, xt as D, y as O, yt as k, z as A } from "./vendor_vue-OlfIOlFg.js";
import { s as j } from "./native-host-BoAU4GnD.js";
import { o as M, r as ee, s as N } from "./vendor_vueuse-DbHwQsn4.js";
import { n as te, r as P, t as ne } from "./VisuallyHidden-D556S2Ak.js";
import { C as F, E as I, S as re, T as L, _ as R, c as ie, f as ae, g as oe, h as se, m as ce, p as le, t as ue, v as z, w as de, x as fe, y as B } from "./Teleport-YNIcOte_.js";
import { i as V, r as H } from "./Button-B4kIEl6s.js";
import { a as U, c as pe, i as me, n as he, o as W, r as ge, s as _e } from "./PopperContent-RtMDF-yC.js";
import { t as ve } from "./createLucideIcon-CFmwvUbS.js";
import { t as G } from "./chevron-down-VU0vsl_3.js";
import { t as ye } from "./chevron-up-gO5-pfnB.js";
function K(e) {
	return typeof e == "string" ? `'${e}'` : new xe().serialize(e);
}
var be = " _-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$0123456789abcdefghijklmnopqrstuvwxyz", q = /*@__PURE__*/ (function() {
	let e = /* @__PURE__ */ new Uint8Array(128);
	for (let t = 0; t < 69; t++) e[be.charCodeAt(t)] = t + 1;
	for (let t = 65; t <= 90; t++) e[t] = e[t + 32];
	return e;
})();
function J(e, t) {
	if (e === t) return 0;
	let n = Math.min(e.length, t.length), r = 0;
	for (let i = 0; i < n; i++) {
		let n = e.charCodeAt(i), a = t.charCodeAt(i);
		if (n === a) continue;
		let o = n < 128 && q[n] ? q[n] : n + 128, s = a < 128 && q[a] ? q[a] : a + 128;
		if (o !== s) return o < s ? -1 : 1;
		r === 0 && (r = n > a ? -1 : 1);
	}
	return e.length === t.length ? r : e.length < t.length ? -1 : 1;
}
var xe = /*@__PURE__*/ (function() {
	class e {
		#e = /* @__PURE__ */ new Map();
		compare(e, t) {
			let n = typeof e, r = typeof t;
			return n === "string" && r === "string" ? J(e, t) : n === "number" && r === "number" ? e - t : J(this.serialize(e, !0), this.serialize(t, !0));
		}
		serialize(e, t) {
			if (e === null) return "null";
			switch (typeof e) {
				case "string": return t ? e : `'${e}'`;
				case "bigint": return `${e}n`;
				case "object": return this.$object(e);
				case "function": return this.$function(e);
			}
			return String(e);
		}
		serializeObject(e) {
			let t = Object.prototype.toString.call(e);
			if (t !== "[object Object]") return this.serializeBuiltInType(t.length < 10 ? `unknown:${t}` : t.slice(8, -1), e);
			let n = e.constructor, r = n === Object || n === void 0 ? "" : n.name;
			if (r !== "" && globalThis[r] === n) return this.serializeBuiltInType(r, e);
			if ("toJSON" in e && typeof e.toJSON == "function") {
				let t = e.toJSON();
				return r + (typeof t == "object" && t ? this.$object(t) : `(${this.serialize(t)})`);
			}
			let i = Object.keys(e).sort(J), a = `${r}{`;
			for (let t = 0; t < i.length; t++) {
				let n = i[t];
				a += `${n}:${this.serialize(e[n])}`, t < i.length - 1 && (a += ",");
			}
			return a + "}";
		}
		serializeBuiltInType(e, t) {
			let n = this["$" + e];
			if (n) return n.call(this, t);
			if (typeof t.entries == "function") return this.serializeObjectEntries(e, t.entries());
			throw Error(`Cannot serialize ${e}`);
		}
		serializeObjectEntries(e, t) {
			let n = Array.from(t).sort((e, t) => this.compare(e[0], t[0])), r = `${e}{`;
			for (let e = 0; e < n.length; e++) {
				let [t, i] = n[e];
				r += `${this.serialize(t, !0)}:${this.serialize(i)}`, e < n.length - 1 && (r += ",");
			}
			return r + "}";
		}
		$object(e) {
			let t = this.#e.get(e);
			return t === void 0 && (this.#e.set(e, `#${this.#e.size}`), t = this.serializeObject(e), this.#e.set(e, t)), t;
		}
		$function(e) {
			let t = Function.prototype.toString.call(e);
			return t.slice(-15) === "[native code] }" ? `${e.name || ""}()[native]` : `${e.name}(${e.length})${t.replace(/\s*\n\s*/g, "")}`;
		}
		$Array(e) {
			let t = "[";
			for (let n = 0; n < e.length; n++) t += this.serialize(e[n]), n < e.length - 1 && (t += ",");
			return t + "]";
		}
		$Date(e) {
			try {
				return `Date(${e.toISOString()})`;
			} catch {
				return "Date(null)";
			}
		}
		$ArrayBuffer(e) {
			return `ArrayBuffer[${new Uint8Array(e).join(",")}]`;
		}
		$Set(e) {
			return `Set${this.$Array(Array.from(e).sort((e, t) => this.compare(e, t)))}`;
		}
		$Map(e) {
			return this.serializeObjectEntries("Map", e.entries());
		}
	}
	for (let t of [
		"Error",
		"RegExp",
		"URL"
	]) e.prototype["$" + t] = function(e) {
		return `${t}(${e})`;
	};
	for (let t of [
		"Int8Array",
		"Uint8Array",
		"Uint8ClampedArray",
		"Int16Array",
		"Uint16Array",
		"Int32Array",
		"Uint32Array",
		"Float32Array",
		"Float64Array"
	]) e.prototype["$" + t] = function(e) {
		return `${t}[${e.join(",")}]`;
	};
	for (let t of ["BigInt64Array", "BigUint64Array"]) e.prototype["$" + t] = function(e) {
		return `${t}[${e.join("n,")}${e.length > 0 ? "n" : ""}]`;
	};
	return e;
})();
function Se(e, t) {
	return e === t || K(e) === K(t);
}
function Ce(e) {
	let t = re({ nonce: g() });
	return O(() => e?.value || t.nonce?.value);
}
var we = [
	" ",
	"Enter",
	"ArrowUp",
	"ArrowDown"
], Te = [" ", "Enter"];
function Y(e, t, n) {
	return e === void 0 ? !1 : Array.isArray(e) ? e.some((e) => X(e, t, n)) : X(e, t, n);
}
function X(e, t, n) {
	return e === void 0 || t === void 0 ? !1 : typeof e == "string" ? e === t : typeof n == "function" ? n(e, t) : typeof n == "string" ? e?.[n] === t?.[n] : Se(e, t);
}
function Ee(e) {
	return e == null || e === "" || Array.isArray(e) && e.length === 0;
}
var De = ["value"], [Z, Oe] = /*#__PURE__*/ I("SelectRoot"), ke = /* @__PURE__ */ r({
	inheritAttrs: !1,
	__name: "SelectRoot",
	props: {
		open: {
			type: Boolean,
			required: !1,
			default: void 0
		},
		defaultOpen: {
			type: Boolean,
			required: !1
		},
		defaultValue: {
			type: null,
			required: !1
		},
		modelValue: {
			type: null,
			required: !1,
			default: void 0
		},
		nullableValue: {
			type: String,
			required: !1,
			default: ""
		},
		by: {
			type: [String, Function],
			required: !1
		},
		dir: {
			type: String,
			required: !1
		},
		multiple: {
			type: Boolean,
			required: !1
		},
		autocomplete: {
			type: String,
			required: !1
		},
		disabled: {
			type: Boolean,
			required: !1
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
	emits: ["update:modelValue", "update:open"],
	setup(e, { emit: n }) {
		let r = e, s = n, { required: c, disabled: l, multiple: d, dir: f } = y(r), m = N(r, "modelValue", s, {
			defaultValue: r.defaultValue ?? (d.value ? [] : void 0),
			passive: r.modelValue === void 0,
			deep: !0
		}), h = N(r, "open", s, {
			defaultValue: r.defaultOpen,
			passive: r.open === void 0
		}), v = g(), x = g(), S = g({
			x: 0,
			y: 0
		}), C = O(() => d.value && Array.isArray(m.value) ? m.value?.length === 0 : F(m.value));
		U({ isProvider: !0 });
		let w = pe(f), T = te(v), D = g(/* @__PURE__ */ new Set()), A = O(() => Array.from(D.value).map((e) => e.value).join(";"));
		function j(e) {
			if (d.value) {
				let t = Array.isArray(m.value) ? [...m.value] : [], n = t.findIndex((t) => X(t, e, r.by));
				n === -1 ? t.push(e) : t.splice(n, 1), m.value = [...t];
			} else m.value = e;
		}
		function M(e) {
			return Array.from(D.value).find((t) => Y(e, t.value, r.by));
		}
		return Oe({
			triggerElement: v,
			onTriggerChange: (e) => {
				v.value = e;
			},
			valueElement: x,
			onValueElementChange: (e) => {
				x.value = e;
			},
			contentId: "",
			modelValue: m,
			onValueChange: j,
			by: r.by,
			open: h,
			multiple: d,
			required: c,
			onOpenChange: (e) => {
				h.value = e;
			},
			dir: w,
			triggerPointerDownPosRef: S,
			disabled: l,
			isEmptyModelValue: C,
			optionsSet: D,
			onOptionAdd: (e) => {
				let t = M(e.value);
				t && D.value.delete(t), D.value.add(e);
			},
			onOptionRemove: (e) => {
				let t = M(e.value);
				t && D.value.delete(t);
			}
		}), (e, n) => (o(), E(k(me), null, {
			default: _(() => [a(e.$slots, "default", {
				modelValue: k(m),
				open: k(h)
			}), k(T) && e.name ? (o(), E(Ae, {
				key: A.value,
				"aria-hidden": "true",
				tabindex: "-1",
				multiple: k(d),
				required: k(c),
				name: e.name,
				autocomplete: e.autocomplete,
				disabled: k(l),
				value: k(m)
			}, {
				default: _(() => [k(F)(k(m)) ? (o(), t("option", {
					key: 0,
					value: e.nullableValue
				}, null, 8, De)) : u("v-if", !0), (o(!0), t(b, null, p(Array.from(D.value), (e) => (o(), t("option", i({ key: e.value ?? "" }, { ref_for: !0 }, e), null, 16))), 128))]),
				_: 1
			}, 8, [
				"multiple",
				"required",
				"name",
				"autocomplete",
				"disabled",
				"value"
			])) : u("v-if", !0)]),
			_: 3
		}));
	}
}), Ae = /* @__PURE__ */ r({
	__name: "BubbleSelect",
	props: {
		autocomplete: {
			type: String,
			required: !1
		},
		autofocus: {
			type: Boolean,
			required: !1
		},
		disabled: {
			type: Boolean,
			required: !1
		},
		form: {
			type: String,
			required: !1
		},
		multiple: {
			type: Boolean,
			required: !1
		},
		name: {
			type: String,
			required: !1
		},
		required: {
			type: Boolean,
			required: !1
		},
		size: {
			type: Number,
			required: !1
		},
		value: {
			type: null,
			required: !1
		}
	},
	setup(e) {
		let t = e, n = g(), r = Z();
		m(() => t.value, (e, t) => {
			let r = window.HTMLSelectElement.prototype, i = Object.getOwnPropertyDescriptor(r, "value").set;
			if (e !== t && i && n.value) {
				let t = new Event("change", { bubbles: !0 });
				i.call(n.value, e), n.value.dispatchEvent(t);
			}
		});
		function s(e) {
			r.onValueChange(e.target.value);
		}
		return (e, r) => (o(), E(k(ne), { "as-child": "" }, {
			default: _(() => [h("select", i({
				ref_key: "selectElement",
				ref: n
			}, t, { onInput: s }), [a(e.$slots, "default")], 16)]),
			_: 3
		}));
	}
}), je = /* @__PURE__ */ r({
	__name: "SelectPopperPosition",
	props: {
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
			required: !1,
			default: "start"
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
			required: !1,
			default: 10
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
	},
	setup(e) {
		let t = z(e);
		return (e, n) => (o(), E(k(he), i(k(t), { style: {
			boxSizing: "border-box",
			"--reka-select-content-transform-origin": "var(--reka-popper-transform-origin)",
			"--reka-select-content-available-width": "var(--reka-popper-available-width)",
			"--reka-select-content-available-height": "var(--reka-popper-available-height)",
			"--reka-select-trigger-width": "var(--reka-popper-anchor-width)",
			"--reka-select-trigger-height": "var(--reka-popper-anchor-height)"
		} }), {
			default: _(() => [a(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), Me = {
	onViewportChange: () => {},
	itemTextRefCallback: () => {},
	itemRefCallback: () => {}
}, [Q, Ne] = /*#__PURE__*/ I("SelectContent"), Pe = /* @__PURE__ */ r({
	__name: "SelectContentImpl",
	props: {
		position: {
			type: String,
			required: !1,
			default: "item-aligned"
		},
		bodyLock: {
			type: Boolean,
			required: !1,
			default: !0
		},
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
			required: !1,
			default: "start"
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
		},
		disableOutsidePointerEvents: {
			type: Boolean,
			required: !1,
			default: !0
		}
	},
	emits: [
		"closeAutoFocus",
		"escapeKeyDown",
		"pointerDownOutside"
	],
	setup(e, { emit: t }) {
		let n = e, r = t, s = Z();
		_e(), fe(n.bodyLock);
		let { CollectionSlot: l, getItems: u } = U(), d = g();
		oe(d);
		let { search: p, handleTypeaheadSearch: h } = W(), v = g(), y = g(), b = g(), x = g(!1), w = g(!1), T = g(!1);
		function D() {
			y.value && d.value && ie([y.value, d.value]);
		}
		m(x, () => {
			D();
		});
		let { onOpenChange: A, triggerPointerDownPosRef: j } = s;
		c((e) => {
			if (!d.value) return;
			let t = {
				x: 0,
				y: 0
			}, n = (e) => {
				t = {
					x: Math.abs(Math.round(e.pageX) - (j.value?.x ?? 0)),
					y: Math.abs(Math.round(e.pageY) - (j.value?.y ?? 0))
				};
			}, r = (e) => {
				e.pointerType !== "touch" && (t.x <= 10 && t.y <= 10 ? e.preventDefault() : d.value?.contains(e.target) || A(!1), document.removeEventListener("pointermove", n), j.value = null);
			};
			j.value !== null && (document.addEventListener("pointermove", n), document.addEventListener("pointerup", r, {
				capture: !0,
				once: !0
			})), e(() => {
				document.removeEventListener("pointermove", n), document.removeEventListener("pointerup", r, { capture: !0 });
			});
		});
		function M(e) {
			let t = e.ctrlKey || e.altKey || e.metaKey;
			if (e.key === "Tab" && e.preventDefault(), e.code === "Space") {
				if (p.value === "") return;
				e.preventDefault();
			}
			if (!t && e.key.length === 1 && h(e.key, u()), [
				"ArrowUp",
				"ArrowDown",
				"Home",
				"End"
			].includes(e.key)) {
				let t = [...u().map((e) => e.ref)];
				if (["ArrowUp", "End"].includes(e.key) && (t = t.slice().reverse()), ["ArrowUp", "ArrowDown"].includes(e.key)) {
					let n = e.target, r = t.indexOf(n);
					t = t.slice(r + 1);
				}
				setTimeout(() => ie(t)), e.preventDefault();
			}
		}
		let N = O(() => n.position === "popper" ? n : {}), te = z(N.value);
		return Ne({
			content: d,
			viewport: v,
			onViewportChange: (e) => {
				v.value = e;
			},
			itemRefCallback: (e, t, n) => {
				let r = !w.value && !n, i = Y(s.modelValue.value, t, s.by);
				if (s.multiple.value) {
					if (T.value) return;
					(i || r) && (y.value = e, i && (T.value = !0));
				} else (i || r) && (y.value = e);
				r && (w.value = !0);
			},
			selectedItem: y,
			selectedItemText: b,
			onItemLeave: () => {
				d.value?.focus();
			},
			itemTextRefCallback: (e, t, n) => {
				let r = !w.value && !n;
				(Y(s.modelValue.value, t, s.by) || r) && (b.value = e);
			},
			focusSelectedItem: D,
			position: n.position,
			isPositioned: x,
			searchRef: p
		}), (e, t) => (o(), E(k(l), null, {
			default: _(() => [f(k(ae), {
				"as-child": "",
				onMountAutoFocus: t[6] ||= S(() => {}, ["prevent"]),
				onUnmountAutoFocus: t[7] ||= (e) => {
					r("closeAutoFocus", e), !e.defaultPrevented && (k(s).triggerElement.value?.focus({ preventScroll: !0 }), e.preventDefault());
				}
			}, {
				default: _(() => [f(k(le), {
					"as-child": "",
					"disable-outside-pointer-events": e.disableOutsidePointerEvents,
					onFocusOutside: t[2] ||= S(() => {}, ["prevent"]),
					onDismiss: t[3] ||= (e) => k(s).onOpenChange(!1),
					onEscapeKeyDown: t[4] ||= (e) => r("escapeKeyDown", e),
					onPointerDownOutside: t[5] ||= (e) => r("pointerDownOutside", e)
				}, {
					default: _(() => [(o(), E(C(e.position === "popper" ? je : Ie), i({
						...e.$attrs,
						...k(te)
					}, {
						id: k(s).contentId,
						ref: (e) => {
							if (!e) return;
							let t = k(ee)(e);
							t?.hasAttribute("data-reka-popper-content-wrapper") ? d.value = t.firstElementChild : d.value = t;
						},
						role: "listbox",
						"data-state": k(s).open.value ? "open" : "closed",
						dir: k(s).dir.value,
						style: {
							display: "flex",
							flexDirection: "column",
							outline: "none"
						},
						onContextmenu: t[0] ||= S(() => {}, ["prevent"]),
						onPlaced: t[1] ||= (e) => x.value = !0,
						onKeydown: M
					}), {
						default: _(() => [a(e.$slots, "default")]),
						_: 3
					}, 16, [
						"id",
						"data-state",
						"dir",
						"onKeydown"
					]))]),
					_: 3
				}, 8, ["disable-outside-pointer-events"])]),
				_: 3
			})]),
			_: 3
		}));
	}
}), [$, Fe] = /*#__PURE__*/ I("SelectItemAlignedPosition"), Ie = /* @__PURE__ */ r({
	inheritAttrs: !1,
	__name: "SelectItemAlignedPosition",
	props: {
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1
		}
	},
	emits: ["placed"],
	setup(e, { emit: r }) {
		let c = e, l = r, { getItems: u } = U(), d = Z(), p = Q(), m = g(!1), h = g(!0), v = g(), { forwardRef: y, currentElement: b } = B(), { viewport: x, selectedItem: S, selectedItemText: C, focusSelectedItem: w } = p;
		function T() {
			if (d.triggerElement.value && d.valueElement.value && v.value && b.value && x?.value && S?.value && C?.value) {
				let e = d.triggerElement.value.getBoundingClientRect(), t = b.value.getBoundingClientRect(), n = d.valueElement.value.getBoundingClientRect(), r = C.value.getBoundingClientRect();
				if (d.dir.value !== "rtl") {
					let i = r.left - t.left, a = n.left - i, o = e.left - a, s = e.width + o, c = Math.max(s, t.width), l = window.innerWidth - 10, u = P(a, 10, Math.max(10, l - c));
					v.value.style.minWidth = `${s}px`, v.value.style.left = `${u}px`;
				} else {
					let i = t.right - r.right, a = window.innerWidth - n.right - i, o = window.innerWidth - e.right - a, s = e.width + o, c = Math.max(s, t.width), l = window.innerWidth - 10, u = P(a, 10, Math.max(10, l - c));
					v.value.style.minWidth = `${s}px`, v.value.style.right = `${u}px`;
				}
				let i = u().map((e) => e.ref), a = window.innerHeight - 20, o = x.value.scrollHeight, s = window.getComputedStyle(b.value), c = Number.parseInt(s.borderTopWidth, 10), f = Number.parseInt(s.paddingTop, 10), p = Number.parseInt(s.borderBottomWidth, 10), h = Number.parseInt(s.paddingBottom, 10), g = c + f + o + h + p, _ = Math.min(S.value.offsetHeight * 5, g), y = window.getComputedStyle(x.value), w = Number.parseInt(y.paddingTop, 10), T = Number.parseInt(y.paddingBottom, 10), E = e.top + e.height / 2 - 10, D = a - E, O = S.value.offsetHeight / 2, k = S.value.offsetTop + O, A = c + f + k, j = g - A;
				if (A <= E) {
					let e = S.value === i.at(-1);
					v.value.style.bottom = "0px";
					let t = b.value.clientHeight - x.value.offsetTop - x.value.offsetHeight, n = A + Math.max(D, O + (e ? T : 0) + t + p);
					v.value.style.height = `${n}px`;
				} else {
					let e = S.value === i[0];
					v.value.style.top = "0px";
					let t = Math.max(E, c + x.value.offsetTop + (e ? w : 0) + O) + j;
					v.value.style.height = `${t}px`, x.value.scrollTop = A - E + x.value.offsetTop;
				}
				v.value.style.margin = "10px 0", v.value.style.minHeight = `${_}px`, v.value.style.maxHeight = `${a}px`, l("placed"), requestAnimationFrame(() => m.value = !0);
			}
		}
		let E = g("");
		A(async () => {
			await s(), T(), b.value && (E.value = window.getComputedStyle(b.value).zIndex);
		});
		function D(e) {
			e && h.value === !0 && (T(), w?.(), h.value = !1);
		}
		return M(d.triggerElement, () => {
			T();
		}), Fe({
			contentWrapper: v,
			shouldExpandOnScrollRef: m,
			onScrollButtonChange: D
		}), (e, r) => (o(), t("div", {
			ref_key: "contentWrapperElement",
			ref: v,
			style: n({
				display: "flex",
				flexDirection: "column",
				position: "fixed",
				zIndex: E.value
			})
		}, [f(k(V), i({
			ref: k(y),
			style: {
				boxSizing: "border-box",
				maxHeight: "100%"
			}
		}, {
			...e.$attrs,
			...c
		}), {
			default: _(() => [a(e.$slots, "default")]),
			_: 3
		}, 16)], 4));
	}
}), Le = /* @__PURE__ */ r({
	inheritAttrs: !1,
	__name: "SelectProvider",
	props: { context: {
		type: Object,
		required: !0
	} },
	setup(e) {
		return Oe(e.context), Ne(Me), (e, t) => a(e.$slots, "default");
	}
}), Re = { key: 1 }, ze = /* @__PURE__ */ r({
	inheritAttrs: !1,
	__name: "SelectContent",
	props: {
		forceMount: {
			type: Boolean,
			required: !1
		},
		position: {
			type: String,
			required: !1
		},
		bodyLock: {
			type: Boolean,
			required: !1
		},
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
		},
		disableOutsidePointerEvents: {
			type: Boolean,
			required: !1
		}
	},
	emits: [
		"closeAutoFocus",
		"escapeKeyDown",
		"pointerDownOutside"
	],
	setup(n, { emit: r }) {
		let i = n, s = R(i, r), c = Z(), l = g();
		A(() => {
			l.value = new DocumentFragment();
		});
		let p = g(), h = O(() => i.forceMount || c.open.value), y = g(h.value), b;
		function S() {
			b &&= (clearTimeout(b), void 0);
		}
		return m(h, (e, t, n) => {
			S(), b = setTimeout(() => {
				y.value = h.value, b = void 0;
			}), n(S);
		}), e(S), (e, n) => h.value || y.value || p.value?.present ? (o(), E(k(ce), {
			key: 0,
			ref_key: "presenceRef",
			ref: p,
			present: h.value
		}, {
			default: _(() => [f(Pe, d(x({
				...k(s),
				...e.$attrs
			})), {
				default: _(() => [a(e.$slots, "default")]),
				_: 3
			}, 16)]),
			_: 3
		}, 8, ["present"])) : l.value ? (o(), t("div", Re, [(o(), E(v, { to: l.value }, [f(Le, { context: k(c) }, {
			default: _(() => [a(e.$slots, "default")]),
			_: 3
		}, 8, ["context"])], 8, ["to"]))])) : u("v-if", !0);
	}
}), Be = /* @__PURE__ */ r({
	__name: "SelectIcon",
	props: {
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1,
			default: "span"
		}
	},
	setup(e) {
		return (e, t) => (o(), E(k(V), {
			"aria-hidden": "true",
			as: e.as,
			"as-child": e.asChild
		}, {
			default: _(() => [a(e.$slots, "default", {}, () => [t[0] ||= w("▼")])]),
			_: 3
		}, 8, ["as", "as-child"]));
	}
}), [Ve, He] = /*#__PURE__*/ I("SelectItem"), Ue = /* @__PURE__ */ r({
	__name: "SelectItem",
	props: {
		value: {
			type: null,
			required: !0
		},
		disabled: {
			type: Boolean,
			required: !1
		},
		textValue: {
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
	},
	emits: ["select"],
	setup(e, { emit: t }) {
		let n = e, r = t, { disabled: i } = y(n), c = Z(), l = Q(), { forwardRef: u, currentElement: d } = B(), { CollectionItem: p } = U(), m = O(() => Y(c.modelValue?.value, n.value, c.by)), h = g(!1), v = g(n.textValue ?? ""), b = se(void 0, "reka-select-item-text");
		async function x(e) {
			if (e.defaultPrevented) return;
			let t = {
				originalEvent: e,
				value: n.value
			};
			de("select.select", C, t);
		}
		async function C(e) {
			await s(), r("select", e), !e.defaultPrevented && (i.value || (c.onValueChange(n.value), c.multiple.value || c.onOpenChange(!1)));
		}
		async function w(e) {
			await s(), !e.defaultPrevented && (i.value ? l.onItemLeave?.() : e.currentTarget?.focus({ preventScroll: !0 }));
		}
		async function T(e) {
			await s(), !e.defaultPrevented && e.currentTarget === L() && l.onItemLeave?.();
		}
		async function D(e) {
			await s(), !e.defaultPrevented && (l.searchRef?.value === "" || e.key !== " ") && (Te.includes(e.key) && x(e), e.key === " " && e.preventDefault());
		}
		if (n.value === "") throw Error("A <SelectItem /> must have a value prop that is not an empty string. This is because the Select value can be set to an empty string to clear the selection and show the placeholder.");
		return A(() => {
			d.value && l.itemRefCallback(d.value, n.value, n.disabled);
		}), He({
			value: n.value,
			disabled: i,
			textId: b,
			isSelected: m,
			onItemTextChange: (e) => {
				v.value = ((v.value || e?.textContent) ?? "").trim();
			}
		}), (e, t) => (o(), E(k(p), { value: { textValue: v.value } }, {
			default: _(() => [f(k(V), {
				ref: k(u),
				role: "option",
				"aria-labelledby": k(b),
				"data-highlighted": h.value ? "" : void 0,
				"aria-selected": m.value,
				"data-state": m.value ? "checked" : "unchecked",
				"aria-disabled": k(i) || void 0,
				"data-disabled": k(i) ? "" : void 0,
				tabindex: k(i) ? void 0 : -1,
				as: e.as,
				"as-child": e.asChild,
				onFocus: t[0] ||= (e) => h.value = !0,
				onBlur: t[1] ||= (e) => h.value = !1,
				onPointerup: x,
				onPointerdown: t[2] ||= (e) => {
					e.currentTarget.focus({ preventScroll: !0 });
				},
				onTouchend: t[3] ||= S(() => {}, ["prevent", "stop"]),
				onPointermove: w,
				onPointerleave: T,
				onKeydown: D
			}, {
				default: _(() => [a(e.$slots, "default")]),
				_: 3
			}, 8, [
				"aria-labelledby",
				"data-highlighted",
				"aria-selected",
				"data-state",
				"aria-disabled",
				"data-disabled",
				"tabindex",
				"as",
				"as-child"
			])]),
			_: 3
		}, 8, ["value"]));
	}
}), We = /* @__PURE__ */ r({
	__name: "SelectItemIndicator",
	props: {
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1,
			default: "span"
		}
	},
	setup(e) {
		let t = e, n = Ve();
		return (e, r) => k(n).isSelected.value ? (o(), E(k(V), i({
			key: 0,
			"aria-hidden": "true"
		}, t), {
			default: _(() => [a(e.$slots, "default")]),
			_: 3
		}, 16)) : u("v-if", !0);
	}
}), Ge = /* @__PURE__ */ r({
	inheritAttrs: !1,
	__name: "SelectItemText",
	props: {
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1,
			default: "span"
		}
	},
	setup(t) {
		let n = t, r = Z(), s = Q(), c = Ve(), { forwardRef: l, currentElement: u } = B(), d = O(() => ({
			value: c.value,
			disabled: c.disabled.value,
			textContent: u.value?.textContent ?? c.value?.toString() ?? ""
		}));
		return A(() => {
			u.value && (c.onItemTextChange(u.value), s.itemTextRefCallback(u.value, c.value, c.disabled.value), r.onOptionAdd(d.value));
		}), e(() => {
			r.onOptionRemove(d.value);
		}), (e, t) => (o(), E(k(V), i({
			id: k(c).textId,
			ref: k(l)
		}, {
			...n,
			...e.$attrs
		}), {
			default: _(() => [a(e.$slots, "default")]),
			_: 3
		}, 16, ["id"]));
	}
}), Ke = /* @__PURE__ */ r({
	__name: "SelectPortal",
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
		return (e, n) => (o(), E(k(ue), d(x(t)), {
			default: _(() => [a(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), qe = /* @__PURE__ */ r({
	__name: "SelectScrollButtonImpl",
	emits: ["autoScroll"],
	setup(e, { emit: t }) {
		let n = t, { getItems: r } = U(), s = Q(), u = g(null);
		function d() {
			u.value !== null && (window.clearInterval(u.value), u.value = null);
		}
		c(() => {
			r().map((e) => e.ref).find((e) => e === L())?.scrollIntoView({ block: "nearest" });
		});
		function f() {
			u.value === null && (u.value = window.setInterval(() => {
				n("autoScroll");
			}, 50));
		}
		function p() {
			s.onItemLeave?.(), u.value === null && (u.value = window.setInterval(() => {
				n("autoScroll");
			}, 50));
		}
		return l(() => d()), (e, t) => (o(), E(k(V), i({
			"aria-hidden": "true",
			style: { flexShrink: 0 }
		}, e.$parent?.$props, {
			onPointerdown: f,
			onPointermove: p,
			onPointerleave: t[0] ||= () => {
				d();
			}
		}), {
			default: _(() => [a(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), Je = /* @__PURE__ */ r({
	__name: "SelectScrollDownButton",
	props: {
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
		let t = Q(), n = t.position === "item-aligned" ? $() : void 0, { forwardRef: r, currentElement: i } = B(), s = g(!1);
		return c((e) => {
			if (t.viewport?.value && t.isPositioned?.value) {
				let n = t.viewport.value;
				function r() {
					let e = n.scrollHeight - n.clientHeight;
					s.value = Math.ceil(n.scrollTop) < e;
				}
				r(), n.addEventListener("scroll", r), e(() => n.removeEventListener("scroll", r));
			}
		}), m(i, () => {
			i.value && n?.onScrollButtonChange(i.value);
		}), (e, n) => s.value ? (o(), E(qe, {
			key: 0,
			ref: k(r),
			onAutoScroll: n[0] ||= () => {
				let { viewport: e, selectedItem: n } = k(t);
				e?.value && n?.value && (e.value.scrollTop = e.value.scrollTop + n.value.offsetHeight);
			}
		}, {
			default: _(() => [a(e.$slots, "default")]),
			_: 3
		}, 512)) : u("v-if", !0);
	}
}), Ye = /* @__PURE__ */ r({
	__name: "SelectScrollUpButton",
	props: {
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
		let t = Q(), n = t.position === "item-aligned" ? $() : void 0, { forwardRef: r, currentElement: i } = B(), s = g(!1);
		return c((e) => {
			if (t.viewport?.value && t.isPositioned?.value) {
				let n = t.viewport.value;
				function r() {
					s.value = n.scrollTop > 0;
				}
				r(), n.addEventListener("scroll", r), e(() => n.removeEventListener("scroll", r));
			}
		}), m(i, () => {
			i.value && n?.onScrollButtonChange(i.value);
		}), (e, n) => s.value ? (o(), E(qe, {
			key: 0,
			ref: k(r),
			onAutoScroll: n[0] ||= () => {
				let { viewport: e, selectedItem: n } = k(t);
				e?.value && n?.value && (e.value.scrollTop = e.value.scrollTop - n.value.offsetHeight);
			}
		}, {
			default: _(() => [a(e.$slots, "default")]),
			_: 3
		}, 512)) : u("v-if", !0);
	}
}), Xe = /* @__PURE__ */ r({
	__name: "SelectTrigger",
	props: {
		disabled: {
			type: Boolean,
			required: !1
		},
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
			required: !1,
			default: "button"
		}
	},
	setup(e) {
		let t = e, n = Z(), { forwardRef: r, currentElement: i } = B(), s = O(() => n.disabled?.value || t.disabled);
		n.contentId ||= se(void 0, "reka-select-content"), A(() => {
			n.onTriggerChange(i.value);
		});
		let { getItems: c } = U(), { search: l, handleTypeaheadSearch: u, resetTypeahead: d } = W();
		function p() {
			s.value || (n.onOpenChange(!0), d());
		}
		function m(e) {
			p(), n.triggerPointerDownPosRef.value = {
				x: Math.round(e.pageX),
				y: Math.round(e.pageY)
			};
		}
		function h(e) {
			return e.button === 0 && e.ctrlKey === !1;
		}
		let g = !1;
		function v(e) {
			if (e.pointerType === "touch") return e.preventDefault();
			let t = e.target;
			t.hasPointerCapture(e.pointerId) && t.releasePointerCapture(e.pointerId), h(e) && (m(e), g = !0);
		}
		function y(e) {
			h(e) && e.preventDefault();
		}
		function b(e) {
			g || e.currentTarget?.focus(), g = !1;
		}
		return (e, t) => (o(), E(k(ge), {
			"as-child": "",
			reference: e.reference
		}, {
			default: _(() => [f(k(V), {
				ref: k(r),
				role: "combobox",
				type: e.as === "button" ? "button" : void 0,
				"aria-controls": k(n).open.value ? k(n).contentId : void 0,
				"aria-expanded": k(n).open.value || !1,
				"aria-required": k(n).required?.value,
				"aria-autocomplete": "none",
				disabled: s.value,
				dir: k(n)?.dir.value,
				"data-state": k(n)?.open.value ? "open" : "closed",
				"data-disabled": s.value ? "" : void 0,
				"data-placeholder": k(Ee)(k(n).modelValue?.value) ? "" : void 0,
				"as-child": e.asChild,
				as: e.as,
				onClick: b,
				onPointerdown: v,
				onMousedown: y,
				onPointerup: t[0] ||= S((e) => {
					e.pointerType === "touch" && m(e);
				}, ["prevent"]),
				onKeydown: t[1] ||= (e) => {
					let t = k(l) !== "";
					(e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1 || !t || e.key !== " ") && (k(u)(e.key, k(c)()), k(we).includes(e.key) && (p(), e.preventDefault()));
				}
			}, {
				default: _(() => [a(e.$slots, "default")]),
				_: 3
			}, 8, [
				"type",
				"aria-controls",
				"aria-expanded",
				"aria-required",
				"disabled",
				"dir",
				"data-state",
				"data-disabled",
				"data-placeholder",
				"as-child",
				"as"
			])]),
			_: 3
		}, 8, ["reference"]));
	}
}), Ze = /* @__PURE__ */ r({
	__name: "SelectValue",
	props: {
		placeholder: {
			type: String,
			required: !1,
			default: ""
		},
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1,
			default: "span"
		}
	},
	setup(e) {
		let t = e, { forwardRef: n, currentElement: r } = B(), i = Z();
		A(() => {
			i.valueElement = r;
		});
		let s = O(() => {
			let e = [], t = Array.from(i.optionsSet.value), n = (e) => t.find((t) => Y(e, t.value, i.by));
			return e = Array.isArray(i.modelValue.value) ? i.modelValue.value.map((e) => n(e)?.textContent ?? "") : [n(i.modelValue.value)?.textContent ?? ""], e.filter(Boolean);
		}), c = O(() => s.value.length ? s.value.join(", ") : t.placeholder);
		return (e, r) => (o(), E(k(V), {
			ref: k(n),
			as: e.as,
			"as-child": e.asChild,
			style: { pointerEvents: "none" },
			"data-placeholder": s.value.length ? void 0 : t.placeholder
		}, {
			default: _(() => [a(e.$slots, "default", {
				selectedLabel: s.value,
				modelValue: k(i).modelValue.value
			}, () => [w(T(c.value), 1)])]),
			_: 3
		}, 8, [
			"as",
			"as-child",
			"data-placeholder"
		]));
	}
}), Qe = /* @__PURE__ */ r({
	__name: "SelectViewport",
	props: {
		nonce: {
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
	},
	setup(e) {
		let n = e, { nonce: r } = y(n), s = Ce(r), c = Q(), l = c.position === "item-aligned" ? $() : void 0, { forwardRef: u, currentElement: d } = B();
		A(() => {
			c?.onViewportChange(d.value);
		});
		let p = g(0);
		function m(e) {
			let t = e.currentTarget, { shouldExpandOnScrollRef: n, contentWrapper: r } = l ?? {};
			if (n?.value && r?.value) {
				let e = Math.abs(p.value - t.scrollTop);
				if (e > 0) {
					let n = window.innerHeight - 20, i = Number.parseFloat(r.value.style.minHeight), a = Number.parseFloat(r.value.style.height), o = Math.max(i, a);
					if (o < n) {
						let i = o + e, a = Math.min(n, i), s = i - a;
						r.value.style.height = `${a}px`, r.value.style.bottom === "0px" && (t.scrollTop = s > 0 ? s : 0, r.value.style.justifyContent = "flex-end");
					}
				}
			}
			p.value = t.scrollTop;
		}
		return (e, r) => (o(), t(b, null, [f(k(V), i({
			ref: k(u),
			"data-reka-select-viewport": "",
			role: "presentation"
		}, {
			...e.$attrs,
			...n
		}, {
			style: {
				position: "relative",
				flex: 1,
				overflow: "hidden auto"
			},
			onScroll: m
		}), {
			default: _(() => [a(e.$slots, "default")]),
			_: 3
		}, 16), f(k(V), {
			as: "style",
			nonce: k(s)
		}, {
			default: _(() => r[0] ||= [w(" /* Hide scrollbars cross-browser and enable momentum scroll for touch devices */ [data-reka-select-viewport] { scrollbar-width:none; -ms-overflow-style: none; -webkit-overflow-scrolling: touch; } [data-reka-select-viewport]::-webkit-scrollbar { display: none; } ")]),
			_: 1,
			__: [0]
		}, 8, ["nonce"])], 64));
	}
}), $e = ve({
	name: "check",
	size: 24,
	node: [["path", {
		d: "M20 6 9 17l-5-5",
		key: "1gmf2c"
	}]]
}), et = /* @__PURE__ */ r({
	__name: "Select",
	props: {
		open: { type: Boolean },
		defaultOpen: { type: Boolean },
		defaultValue: {},
		modelValue: {},
		nullableValue: {},
		by: { type: [String, Function] },
		dir: {},
		multiple: { type: Boolean },
		autocomplete: {},
		disabled: { type: Boolean },
		name: {},
		required: { type: Boolean }
	},
	emits: ["update:modelValue", "update:open"],
	setup(e, { emit: t }) {
		let n = R(e, t);
		return (e, t) => (o(), E(k(ke), d(x(k(n))), {
			default: _(() => [a(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), tt = { class: "absolute left-2 h-3.5 w-3.5 flex items-center justify-center" }, nt = /* @__PURE__ */ r({
	__name: "SelectItem",
	props: {
		value: {},
		disabled: { type: Boolean },
		textValue: {},
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
		let t = e, n = O(() => {
			let { class: e, ...n } = t;
			return n;
		}), r = z(n);
		return (e, n) => (o(), E(k(Ue), i(k(r), { class: k(H)("relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50", t.class) }), {
			default: _(() => [h("span", tt, [f(k(We), null, {
				default: _(() => [f(k($e), { class: "h-4 w-4" })]),
				_: 1
			})]), f(k(Ge), null, {
				default: _(() => [a(e.$slots, "default")]),
				_: 3
			})]),
			_: 3
		}, 16, ["class"]));
	}
}), rt = /* @__PURE__ */ r({
	__name: "SelectScrollDownButton",
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
		let t = e, n = O(() => {
			let { class: e, ...n } = t;
			return n;
		}), r = z(n);
		return (e, n) => (o(), E(k(Je), i(k(r), { class: k(H)("flex cursor-default items-center justify-center py-1", t.class) }), {
			default: _(() => [a(e.$slots, "default", {}, () => [f(k(G), { class: "h-4 w-4" })])]),
			_: 3
		}, 16, ["class"]));
	}
}), it = /* @__PURE__ */ r({
	__name: "SelectScrollUpButton",
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
		let t = e, n = O(() => {
			let { class: e, ...n } = t;
			return n;
		}), r = z(n);
		return (e, n) => (o(), E(k(Ye), i(k(r), { class: k(H)("flex cursor-default items-center justify-center py-1", t.class) }), {
			default: _(() => [a(e.$slots, "default", {}, () => [f(k(ye), { class: "h-4 w-4" })])]),
			_: 3
		}, 16, ["class"]));
	}
}), at = /* @__PURE__ */ r({
	__name: "SelectTrigger",
	props: {
		disabled: { type: Boolean },
		reference: {},
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
		let t = e, n = O(() => {
			let { class: e, ...n } = t;
			return n;
		}), r = z(n);
		return (e, n) => (o(), E(k(Xe), i(k(r), { class: k(H)("flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:truncate text-start", t.class) }), {
			default: _(() => [a(e.$slots, "default"), f(k(Be), { "as-child": "" }, {
				default: _(() => [f(k(G), { class: "h-4 w-4 shrink-0 opacity-50" })]),
				_: 1
			})]),
			_: 3
		}, 16, ["class"]));
	}
}), ot = /* @__PURE__ */ r({
	__name: "SelectValue",
	props: {
		placeholder: {},
		asChild: { type: Boolean },
		as: {}
	},
	setup(e) {
		let t = e;
		return (e, n) => (o(), E(k(Ze), d(x(t)), {
			default: _(() => [a(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), st = /* @__PURE__ */ r({
	inheritAttrs: !1,
	__name: "SelectContent",
	props: {
		forceMount: { type: Boolean },
		position: { default: "popper" },
		bodyLock: { type: Boolean },
		memoDependencies: {},
		side: {},
		sideOffset: {},
		sideFlip: { type: Boolean },
		align: {},
		alignOffset: {},
		alignFlip: { type: Boolean },
		avoidCollisions: { type: Boolean },
		collisionBoundary: {},
		collisionPadding: {},
		arrowPadding: {},
		hideShiftedArrow: { type: Boolean },
		sticky: {},
		hideWhenDetached: { type: Boolean },
		positionStrategy: {},
		updatePositionStrategy: {},
		disableUpdateOnLayoutShift: { type: Boolean },
		prioritizePosition: { type: Boolean },
		reference: {},
		dir: {},
		asChild: { type: Boolean },
		as: {},
		disableOutsidePointerEvents: { type: Boolean },
		class: { type: [
			Boolean,
			null,
			String,
			Object,
			Array
		] }
	},
	emits: [
		"closeAutoFocus",
		"escapeKeyDown",
		"pointerDownOutside"
	],
	setup(e, { emit: t }) {
		let n = e, r = t, s = O(() => {
			let { class: e, ...t } = n;
			return t;
		}), c = R(s, r);
		return (t, r) => (o(), E(k(Ke), { to: k(j)() }, {
			default: _(() => [f(k(ze), i({
				...k(c),
				...t.$attrs
			}, { class: k(H)("relative z-200 max-h-96 min-w-32 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2", e.position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1", n.class) }), {
				default: _(() => [
					f(k(it)),
					f(k(Qe), { class: D(k(H)("p-1", e.position === "popper" && "h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width)")) }, {
						default: _(() => [a(t.$slots, "default")]),
						_: 3
					}, 8, ["class"]),
					f(k(rt))
				]),
				_: 3
			}, 16, ["class"])]),
			_: 3
		}, 8, ["to"]));
	}
});
export { et as a, nt as i, ot as n, $e as o, at as r, st as t };
