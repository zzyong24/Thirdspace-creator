import { n as e } from "./rolldown-runtime-WOOOH1Hs.js";
function t(e) {
	let t = e.trim();
	if (!t.startsWith("{") && !t.startsWith("[")) return e;
	try {
		return JSON.parse(t);
	} catch {
		return e;
	}
}
async function n(e) {
	let n = (e.method || "GET").toUpperCase(), r = e.url || "", i = { ...e.headers }, a = new AbortController(), o = e.timeout, s = typeof o == "number" && Number.isFinite(o) && o >= 0 ? Math.max(12e4, o) : 12e4, c = performance.now(), l = 2147483647, u = () => {
		let e = s - (performance.now() - c);
		if (e <= 0) {
			a.abort();
			return;
		}
		d = setTimeout(u, Math.min(e, l));
	}, d = setTimeout(u, Math.min(s, l));
	try {
		let o;
		if (e.data !== void 0 && n !== "GET" && n !== "HEAD") {
			if (typeof FormData < "u" && e.data instanceof FormData) {
				o = e.data;
				for (let e of Object.keys(i)) e.toLowerCase() === "content-type" && i[e].includes("multipart/form-data") && delete i[e];
			} else typeof e.data == "object" && e.data !== null && !(e.data instanceof Blob) && !(e.data instanceof ArrayBuffer) ? (o = JSON.stringify(e.data), Object.keys(i).some((e) => e.toLowerCase() === "content-type") || (i["Content-Type"] = "application/json")) : o = e.data;
		}
		let s = await globalThis.fetch(r, {
			method: n,
			headers: i,
			body: o,
			signal: a.signal
		}), c = (s.headers.get("content-type") || "").includes("application/json") ? await s.json() : t(await s.text());
		if (!s.ok) {
			let e = Object.assign(/* @__PURE__ */ Error(`Request failed with status ${s.status}`), {
				response: {
					status: s.status,
					data: c
				},
				data: c,
				status: s.status
			});
			return Promise.reject(e);
		}
		return c == null || c === "" ? Promise.reject(/* @__PURE__ */ Error("Empty response")) : c;
	} finally {
		clearTimeout(d);
	}
}
function r(e) {
	return (t, r, i) => n({
		...i,
		url: t,
		method: e,
		data: r
	});
}
function i(e) {
	return (t, r) => n({
		...r,
		url: t,
		method: e
	});
}
var a = (async function(e, t) {
	return n(typeof e == "string" ? {
		...t,
		url: e
	} : e);
});
a.get = i("GET"), a.post = r("POST"), a.put = r("PUT"), a.delete = i("DELETE"), a.patch = r("PATCH"), a.request = n;
var o = /* @__PURE__ */ e({
	base64encode: () => d,
	safe64: () => f,
	utf16to8: () => l
}), s = new TextEncoder();
function c(e) {
	let t = 32768, n = "";
	for (let r = 0; r < e.length; r += t) n += String.fromCharCode(...e.subarray(r, r + t));
	return n;
}
function l(e) {
	return c(s.encode(e));
}
function u(e) {
	return btoa(e);
}
function d(e) {
	return f(u(e));
}
function f(e) {
	return e.replace(/\+/g, "-").replace(/\//g, "_");
}
var p = "https://md-api.doocs.org".replace(/\/$/, ""), m = "account_token";
function h() {
	return !!p;
}
function g() {
	let e = `${window.location.origin}${window.location.pathname}`, t = encodeURIComponent(e);
	window.location.href = `${p}/auth/github?redirect=${t}`;
}
export { d as a, l as c, h as i, a as l, m as n, f as o, g as r, o as s, p as t };
