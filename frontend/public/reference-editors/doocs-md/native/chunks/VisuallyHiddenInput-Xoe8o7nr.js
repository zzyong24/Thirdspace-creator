import { C as e, D as t, F as n, H as r, S as i, W as a, Z as o, h as s, x as c, y as l } from "./vendor_vue-OlfIOlFg.js";
import { t as u } from "./VisuallyHidden-D556S2Ak.js";
import { t as d } from "./usePrimitiveElement-CnkYcO3s.js";
var f = /* @__PURE__ */ t({
	inheritAttrs: !1,
	__name: "VisuallyHiddenInputBubble",
	props: {
		name: {
			type: String,
			required: !0
		},
		value: {
			type: null,
			required: !0
		},
		checked: {
			type: Boolean,
			required: !1,
			default: void 0
		},
		required: {
			type: Boolean,
			required: !1
		},
		disabled: {
			type: Boolean,
			required: !1
		},
		feature: {
			type: String,
			required: !1,
			default: "fully-hidden"
		}
	},
	setup(e) {
		let t = e, { primitiveElement: i, currentElement: a } = d(), s = l(() => t.checked ?? t.value);
		return o(s, (e, t) => {
			if (!a.value) return;
			let n = a.value, r = window.HTMLInputElement.prototype, i = Object.getOwnPropertyDescriptor(r, "value").set;
			if (i && e !== t) {
				let t = new Event("input", { bubbles: !0 }), r = new Event("change", { bubbles: !0 });
				i.call(n, e), n.dispatchEvent(t), n.dispatchEvent(r);
			}
		}), (e, a) => (r(), c(u, n({
			ref_key: "primitiveElement",
			ref: i
		}, {
			...t,
			...e.$attrs
		}, { as: "input" }), null, 16));
	}
}), p = /* @__PURE__ */ t({
	inheritAttrs: !1,
	__name: "VisuallyHiddenInput",
	props: {
		name: {
			type: String,
			required: !0
		},
		value: {
			type: null,
			required: !0
		},
		checked: {
			type: Boolean,
			required: !1,
			default: void 0
		},
		required: {
			type: Boolean,
			required: !1
		},
		disabled: {
			type: Boolean,
			required: !1
		},
		feature: {
			type: String,
			required: !1,
			default: "fully-hidden"
		}
	},
	setup(t) {
		let o = t, u = l(() => typeof o.value == "object" && Array.isArray(o.value) && o.value.length === 0 && o.required), d = l(() => typeof o.value == "string" || typeof o.value == "number" || typeof o.value == "boolean" || o.value === null || o.value === void 0 ? [{
			name: o.name,
			value: o.value
		}] : typeof o.value == "object" && Array.isArray(o.value) ? o.value.flatMap((e, t) => typeof e == "object" ? Object.entries(e).map(([e, n]) => ({
			name: `${o.name}[${t}][${e}]`,
			value: n
		})) : {
			name: `${o.name}[${t}]`,
			value: e
		}) : o.value !== null && typeof o.value == "object" && !Array.isArray(o.value) ? Object.entries(o.value).map(([e, t]) => ({
			name: `${o.name}[${e}]`,
			value: t
		})) : []);
		return (t, l) => (r(), e(s, null, [i(" We render single input if it's required "), u.value ? (r(), c(f, n({ key: t.name }, {
			...o,
			...t.$attrs
		}, {
			name: t.name,
			value: t.value
		}), null, 16, ["name", "value"])) : (r(!0), e(s, { key: 1 }, a(d.value, (e) => (r(), c(f, n({ key: e.name }, { ref_for: !0 }, {
			...o,
			...t.$attrs
		}, {
			name: e.name,
			value: e.value
		}), null, 16, ["name", "value"]))), 128))], 2112));
	}
});
export { p as t };
