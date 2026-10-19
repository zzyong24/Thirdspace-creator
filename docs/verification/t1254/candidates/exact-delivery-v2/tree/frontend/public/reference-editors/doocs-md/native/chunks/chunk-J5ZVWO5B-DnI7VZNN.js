import { n as e } from "./chunk-Y2CYZVJY-BAmSaPLl.js";
var t = /* @__PURE__ */ new Set(["redux-color", "redux-dark-color"]), n = 12, r = 64, i = /* @__PURE__ */ e((e) => Array.isArray(e) && e.length > 0, "hasPalette"), a = /* @__PURE__ */ e((e, n) => e != null && t.has(e) && i(n), "isColorTheme"), o = /^[\w-]+$/, s = /* @__PURE__ */ e((e) => {
	let t = typeof e == "string" || typeof e == "number" ? String(e) : "";
	return o.test(t) ? t : "classic";
}, "safeLook"), c = /* @__PURE__ */ e((e) => i(e) ? e.length : 0, "paletteSlotCount"), l = /* @__PURE__ */ e((e, t) => i(t) ? c(t) : typeof e == "number" && Number.isInteger(e) && e > 0 && e <= r ? e : n, "colorSlotCount"), u = /* @__PURE__ */ e((e, t, n, r) => {
	if (t === void 0 || !a(n, r)) return;
	let i = t % c(r);
	e.attr("data-color-id", `color-${i}`);
}, "stampColorSlot");
export { c as a, a as i, l as n, s as o, i as r, u as s, t };
