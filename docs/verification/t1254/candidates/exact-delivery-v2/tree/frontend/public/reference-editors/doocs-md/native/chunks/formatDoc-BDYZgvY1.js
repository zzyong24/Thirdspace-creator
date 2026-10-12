import { i as e } from "./rolldown-runtime-WOOOH1Hs.js";
var t = null, n = null, r = null, i = null;
async function a(a) {
	let o = [t ? Promise.resolve() : import("./prettier-GzVfHlfC.js").then((t) => /* @__PURE__ */ e(t.t(), 1)).then((e) => t = e)];
	return a === "css" ? o.push(i ? Promise.resolve() : import("./prettier-GzVfHlfC.js").then((t) => /* @__PURE__ */ e(t.n(), 1)).then((e) => i = e)) : a === "javascript" ? o.push(n ? Promise.resolve() : import("./prettier-GzVfHlfC.js").then((t) => /* @__PURE__ */ e(t.i(), 1)).then((e) => n = e)) : o.push(r ? Promise.resolve() : import("./prettier-GzVfHlfC.js").then((t) => /* @__PURE__ */ e(t.r(), 1)).then((e) => r = e), n ? Promise.resolve() : import("./prettier-GzVfHlfC.js").then((t) => /* @__PURE__ */ e(t.i(), 1)).then((e) => n = e)), await Promise.all(o), {
		prettier: t,
		parserBabel: n,
		parserMarkdown: r,
		parserPostcss: i
	};
}
function o(e) {
	return e.default ?? e;
}
async function s(e, t = "markdown") {
	let { prettier: n, parserBabel: r, parserMarkdown: i, parserPostcss: s } = await a(t), c = t === "css" ? "css" : t === "javascript" ? "babel" : "markdown", l = t === "css" ? [o(s)] : t === "javascript" ? [o(r)] : [o(i), o(r)];
	return await n.format(e, {
		parser: c,
		plugins: l,
		printWidth: 80,
		tabWidth: 2,
		useTabs: !1,
		semi: !1,
		singleQuote: !0,
		quoteProps: "as-needed",
		trailingComma: "es5",
		bracketSpacing: !0,
		bracketSameLine: !1,
		arrowParens: "avoid",
		proseWrap: "preserve",
		htmlWhitespaceSensitivity: "css",
		endOfLine: "lf"
	});
}
export { s as formatDoc };
