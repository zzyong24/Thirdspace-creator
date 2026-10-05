import { C as e, D as t, F as n, H as r, J as i, dt as a, l as o, ot as s, tt as c, yt as l } from "./vendor_vue-OlfIOlFg.js";
import { v as u } from "./vendor_vueuse-DbHwQsn4.js";
import { r as d } from "./Button-B4kIEl6s.js";
var f = /* @__PURE__ */ t({
	__name: "Input",
	props: {
		defaultValue: {},
		modelValue: {},
		class: { type: [
			Boolean,
			null,
			String,
			Object,
			Array
		] }
	},
	setup(t, { expose: f, emit: p }) {
		let m = t, h = u(m, "modelValue", p, {
			passive: !0,
			defaultValue: m.defaultValue
		}), g = i(), _ = a();
		return f({
			focus: () => _.value?.focus(),
			blur: () => _.value?.blur(),
			select: () => _.value?.select(),
			setSelectionRange: (e, t) => _.value?.setSelectionRange(e, t),
			inputElement: _
		}), (t, i) => c((r(), e("input", n({
			ref_key: "inputRef",
			ref: _,
			"onUpdate:modelValue": i[0] ||= (e) => s(h) ? h.value = e : null
		}, l(g), { class: l(d)("flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50", m.class) }), null, 16)), [[o, l(h)]]);
	}
});
export { f as t };
