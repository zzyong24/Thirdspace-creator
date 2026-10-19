import { t as e } from "./chunk-X3CZISLH-CyeAZ9SC.js";
import { n as t } from "./mermaid-parser.core-GHfTH9tR.js";
import { n } from "./chunk-Y2CYZVJY-BAmSaPLl.js";
import { c as r } from "./chunk-O7XYJQB3-CuTSgmsg.js";
import { a as i } from "./mermaid.core-DsMCwKuT.js";
var a = { parse: /* @__PURE__ */ n(async (n) => {
	let r = await t("info", n);
	e.debug(r);
}, "parse") }, o = { version: "12.0.0" }, s = {
	parser: a,
	db: { getVersion: /* @__PURE__ */ n(() => o.version, "getVersion") },
	renderer: { draw: /* @__PURE__ */ n((t, n, a) => {
		e.debug("rendering info diagram\n" + t);
		let o = i(n);
		r(o, 100, 400, !0), o.append("g").append("text").attr("x", 100).attr("y", 40).attr("class", "version").attr("font-size", 32).style("text-anchor", "middle").text(`v${a}`);
	}, "draw") }
};
export { s as diagram };
