var e;
function t(t) {
	e = t;
}
function n() {
	return e;
}
function r() {
	return !!e;
}
function i(t = e) {
	return !t || t.live && !t.signal.aborted;
}
function a(t) {
	return e ? i(e) ? e.root.querySelector(t) ?? e.portal.querySelector(t) : null : document.querySelector(t);
}
function o(t) {
	return e ? e.root.querySelectorAll(i(e) ? t : ":not(*)") : document.querySelectorAll(t);
}
function s(e) {
	return a(`[id="${e.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"]`);
}
function c(t) {
	if (!i()) throw Error("稿件已关闭");
	return (e ? e.root : document.head).appendChild(t);
}
function l(t) {
	if (!i()) throw Error("稿件已关闭");
	return (e ? e.portal : document.body).appendChild(t);
}
function u() {
	return e?.portal;
}
function d(t) {
	if (!e) return !0;
	if (!i(e)) return !1;
	let n = t?.composedPath() ?? [], r = e.root.getRootNode().activeElement;
	return n.some((t) => t instanceof Node && (e.root.contains(t) || e.portal.contains(t))) || !!r && (e.root.contains(r) || e.portal.contains(r));
}
function f(e, t) {
	if (!e) return t;
	let n, r = new Promise((t, r) => {
		n = () => r(/* @__PURE__ */ Error("稿件已关闭或操作已取消")), i(e) ? e.signal.addEventListener("abort", n, { once: !0 }) : n();
	}), a = Promise.race([t, r]);
	return e.jobs.add(a), a.finally(() => {
		e.signal.removeEventListener("abort", n), e.jobs.delete(a);
	}).catch(() => {}), a;
}
var p = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22360%22%20height%3D%2272%22%3E%3Crect%20width%3D%22360%22%20height%3D%2272%22%20fill%3D%22%23f1f1f1%22%2F%3E%3Ctext%20x%3D%2216%22%20y%3D%2242%22%20font-size%3D%2214%22%20fill%3D%22%23555%22%3E%E5%9B%BE%E7%89%87%E6%9C%AA%E7%BB%91%E5%AE%9A%E4%BD%9C%E5%93%81%E7%B4%A0%E6%9D%90%3C%2Ftext%3E%3C%2Fsvg%3E";
function m(e) {
	let t = n();
	if (!t) return e;
	let r = new Set(t.imageUrls.values()), i = /^data:image\/(?:png|jpeg|gif|webp|avif|bmp|svg\+xml)(?:;[^,]*)?,/i, a = (e) => {
		let n = /^creatoros-asset:([^:\s]+):([^:\s]+)$/.exec(e);
		return n ? t.imageUrls.get(`${n[1]}:${n[2]}`) ?? p : r.has(e) || i.test(e) ? e : p;
	}, o = t.root.ownerDocument.createElement("template");
	o.innerHTML = e;
	for (let e of o.content.querySelectorAll("picture source")) e.removeAttribute("srcset"), e.removeAttribute("src");
	for (let e of o.content.querySelectorAll("img")) e.removeAttribute("srcset"), e.setAttribute("src", a(e.getAttribute("src") ?? ""));
	for (let e of o.content.querySelectorAll("svg image")) e.removeAttribute("srcset"), e.hasAttribute("href") && e.setAttribute("href", a(e.getAttribute("href") ?? "")), e.hasAttribute("xlink:href") && e.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", a(e.getAttribute("xlink:href") ?? "")), !e.hasAttribute("href") && !e.hasAttribute("xlink:href") && e.setAttribute("href", p);
	return o.innerHTML;
}
export { i as a, a as c, m as d, t as f, r as i, o as l, l as n, s as o, f as p, n as r, u as s, c as t, d as u };
