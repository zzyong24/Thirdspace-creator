import { D as e, F as t, G as n, H as r, et as i, x as a, y as o, yt as s } from "./vendor_vue-OlfIOlFg.js";
import { y as c } from "./Teleport-YNIcOte_.js";
import { i as l, r as u } from "./Button-B4kIEl6s.js";
var d = /* @__PURE__ */ e({
	__name: "Label",
	props: {
		for: {
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
			default: "label"
		}
	},
	setup(e) {
		let o = e;
		return c(), (e, c) => (r(), a(s(l), t(o, { onMousedown: c[0] ||= (e) => {
			!e.defaultPrevented && e.detail > 1 && e.preventDefault();
		} }), {
			default: i(() => [n(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), f = /* @__PURE__ */ e({
	__name: "Label",
	props: {
		for: {},
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
		let c = e, l = o(() => {
			let { class: e, ...t } = c;
			return t;
		});
		return (e, o) => (r(), a(s(d), t(s(l), { class: s(u)("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", c.class) }), {
			default: i(() => [n(e.$slots, "default")]),
			_: 3
		}, 16, ["class"]));
	}
});
export { f as t };
