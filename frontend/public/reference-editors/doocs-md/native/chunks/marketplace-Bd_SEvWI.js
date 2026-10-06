import { n as e } from "./rolldown-runtime-WOOOH1Hs.js";
import { dt as t, n, y as r } from "./vendor_vue-OlfIOlFg.js";
import { A as i, j as a, k as o, n as s, t as c } from "./render-C0-GwsvR.js";
import { l, u } from "./storage-jiCkQUgy.js";
import { i as d, n as f, r as p, t as m } from "./config-DbfjmaEn.js";
import { n as h } from "./translate-CUv9RhnO.js";
import { n as g } from "./lib-DIiEqr8B.js";
import { n as _ } from "./editor-VmYacIt-.js";
import { m as v } from "./utils-D7O4F-LG.js";
import { n as y, t as b } from "./oauth-CN0-Wcs0.js";
var x = class extends Error {
	status;
	body;
	constructor(e, t, n) {
		super(t), this.status = e, this.body = n, this.name = "ApiError";
	}
}, S = class {
	getToken;
	constructor(e) {
		this.getToken = e;
	}
	async request(e, t, n) {
		let r = this.getToken(), i = {}, a = n instanceof FormData;
		n !== void 0 && !a && (i["Content-Type"] = "application/json"), r && (i.Authorization = `Bearer ${r}`);
		let o = await fetch(`${m}${t}`, {
			method: e,
			headers: i,
			body: n === void 0 ? void 0 : a ? n : JSON.stringify(n)
		});
		if (!o.ok) {
			let e = o.statusText, t;
			try {
				t = await o.json(), typeof t?.error == "string" && (e = t.error);
			} catch {}
			throw new x(o.status, e, t);
		}
		return o.json();
	}
	me() {
		return this.request("GET", "/me");
	}
};
function C() {
	return d();
}
function w(e, t = "marketplace.publishFailed") {
	if (e instanceof x) switch (e.message) {
		case "slug_taken": return h("marketplace.validation.slugTaken");
		case "rate_limited": {
			let t = typeof e.body?.limit == "number" ? e.body.limit : null;
			return t == null ? h("marketplace.validation.rateLimited") : h("marketplace.validation.rateLimitedWithLimit", { limit: t });
		}
		case "unauthorized":
		case "invalid_token": return h("marketplace.validation.unauthorized");
		case "forbidden": return h("marketplace.validation.forbidden");
		case "payload_too_large": return h("marketplace.validation.payloadTooLarge");
		case "css_import_forbidden":
		case "css_external_url_forbidden": return h("marketplace.validation.cssUnsafe");
		case "unsafe_component_template": return h("marketplace.validation.templateUnsafe");
		case "invalid_slug": return h("marketplace.validation.slugInvalid");
		case "invalid_name": return h("marketplace.validation.nameRequired");
		case "invalid_css": return h("marketplace.validation.cssRequired");
		case "invalid_component_name": return h("marketplace.validation.componentNameInvalid");
		case "invalid_component_template": return h("marketplace.validation.templateRequired");
		case "invalid_version": return h("marketplace.validation.versionInvalid");
		case "version_not_increased": return h("marketplace.validation.versionNotIncreased");
		case "version_required": return h("marketplace.validation.versionRequired");
		default: if (e.message && e.message !== "Conflict" && e.message !== "Bad Request") return e.message;
	}
	return h(t);
}
function T(e) {
	return e instanceof x && typeof e.message == "string" ? e.message : null;
}
function E(e = {}) {
	let t = new URLSearchParams();
	e.q && t.set("q", e.q), e.sort && t.set("sort", e.sort), e.page && t.set("page", String(e.page)), e.pageSize && t.set("pageSize", String(e.pageSize));
	let n = t.toString();
	return n ? `?${n}` : "";
}
var D = class extends S {
	listThemes(e) {
		return this.request("GET", `/marketplace/themes${E(e)}`);
	}
	listComponents(e) {
		return this.request("GET", `/marketplace/components${E(e)}`);
	}
	get(e) {
		return this.request("GET", `/marketplace/${e}`);
	}
	install(e) {
		return this.request("POST", `/marketplace/${e}/install`);
	}
	listMine() {
		return this.request("GET", "/marketplace/me");
	}
	publishTheme(e) {
		return this.request("POST", "/marketplace/themes", e);
	}
	publishComponent(e) {
		return this.request("POST", "/marketplace/components", e);
	}
	update(e, t) {
		return this.request("PATCH", `/marketplace/${e}`, t);
	}
	remove(e) {
		return this.request("DELETE", `/marketplace/${e}`);
	}
	listPending(e) {
		let t = new URLSearchParams();
		e?.type && t.set("type", e.type), e?.page && t.set("page", String(e.page)), e?.pageSize && t.set("pageSize", String(e.pageSize));
		let n = t.toString();
		return this.request("GET", `/marketplace/admin/pending${n ? `?${n}` : ""}`);
	}
	approve(e) {
		return this.request("POST", `/marketplace/admin/${e}/approve`);
	}
	reject(e, t) {
		return this.request("POST", `/marketplace/admin/${e}/reject`, { reason: t });
	}
}, O = /* @__PURE__ */ new Set([
	"chrome-extension:",
	"moz-extension:",
	"safari-web-extension:"
]);
function k() {
	let e = globalThis;
	return e.browser?.runtime?.id ?? e.chrome?.runtime?.id;
}
function A() {
	return O.has(window.location.protocol) ? !!k() : !1;
}
function j() {
	let e = globalThis;
	return e.browser?.identity ?? e.chrome?.identity ?? null;
}
function M(e) {
	try {
		let t = new URL(e).hash.replace(/^#/, "");
		return new URLSearchParams(t).get(f);
	} catch {
		return null;
	}
}
function N(e) {
	let t = e instanceof Error ? e.message : String(e);
	return /cancell?ed|did not approve|closed|aborted/i.test(t);
}
async function P() {
	let e = j();
	if (!e || !m) return {
		ok: !1,
		reason: "unavailable"
	};
	let t = e.getRedirectURL(), n = `${m}/auth/github?redirect=${encodeURIComponent(t)}`;
	try {
		let t = M(await e.launchWebAuthFlow({
			url: n,
			interactive: !0
		}));
		return t ? {
			ok: !0,
			token: t
		} : {
			ok: !1,
			reason: "no_token"
		};
	} catch (e) {
		return N(e) ? {
			ok: !1,
			reason: "cancelled"
		} : {
			ok: !1,
			reason: "unavailable"
		};
	}
}
function F() {
	return A() && !!(j() && m);
}
"https://ifdian.net/a/doocs".replace(/\/$/, "");
var I = class extends S {
	pull(e) {
		return this.request("GET", `/sync/pull?since=${e}`);
	}
	push(e) {
		return this.request("POST", "/sync/push", e);
	}
	activatePro(e) {
		return this.request("POST", "/sync/activate", { orderNo: e });
	}
}, L = n("auth", () => {
	let e = l.reactive(b, ""), n = t(null), i = !1, a = r(() => d()), o = r(() => !!e.value), s = new S(() => e.value || null), c = new I(() => e.value || null);
	async function u() {
		if (!a.value || i) return;
		i = !0;
		let { error: t } = y((t) => {
			e.value = t;
		});
		t === "access_denied" ? g.info(h("account.loginCancelled")) : t && g.error(h("account.loginFailed")), e.value && await f();
	}
	async function f() {
		if (!e.value) return !1;
		try {
			let e = await s.me();
			return n.value = {
				...e,
				plan: e.plan ?? "free",
				planExpiresAt: e.planExpiresAt ?? null,
				isAdmin: !!e.isAdmin
			}, !0;
		} catch (e) {
			return e instanceof x && (e.status === 401 || e.status === 403) && v(), !1;
		}
	}
	async function m() {
		let { useEditorStore: e } = await import("./editor-VmYacIt-.js").then((e) => e.t), { usePostStore: t } = await import("./post-BeiAh9Pa.js").then((e) => e.t);
		e().flushContentToPostStore(), await t().persistImmediately();
	}
	async function _() {
		try {
			await m();
		} catch (e) {
			console.error("[auth] Failed to persist drafts before login:", e);
		}
		if (A()) {
			if (!F()) {
				g.error(h("account.extensionLoginUnavailable"));
				return;
			}
			let t = await P();
			if (!t.ok) {
				t.reason !== "cancelled" && g.error(h("account.loginFailed"));
				return;
			}
			e.value = t.token, await l.set(b, t.token), await f() || (v(), g.error(h("account.loginFailed")));
			return;
		}
		p();
	}
	function v() {
		e.value = "", n.value = null, l.remove(b).catch(() => {});
	}
	return {
		token: e,
		user: n,
		isConfigured: a,
		isLoggedIn: o,
		api: s,
		syncClient: c,
		bootstrap: u,
		fetchMe: f,
		login: _,
		logout: v
	};
});
function R() {
	return d();
}
var z = class extends S {
	list(e = {}) {
		let t = new URLSearchParams();
		e.page && t.set("page", String(e.page)), e.pageSize && t.set("pageSize", String(e.pageSize));
		let n = t.toString();
		return this.request("GET", `/notifications${n ? `?${n}` : ""}`);
	}
	unreadCount() {
		return this.request("GET", "/notifications/unread-count");
	}
	markRead(e) {
		return this.request("POST", `/notifications/${encodeURIComponent(e)}/read`);
	}
	markAllRead() {
		return this.request("POST", "/notifications/read-all");
	}
	clearAll() {
		return this.request("DELETE", "/notifications");
	}
}, B = n("notifications", () => {
	let e = L(), n = t([]), i = t(0), a = t(!1), o = t(!1), s = r(() => new z(() => e.token || null));
	function c() {
		n.value = [], i.value = 0, o.value = !1;
	}
	async function l() {
		if (R() && e.isLoggedIn) {
			a.value = !0;
			try {
				let [e, t] = await Promise.all([s.value.list({
					page: 1,
					pageSize: 30
				}), s.value.unreadCount()]);
				n.value = e.items, i.value = t.count, o.value = !0;
			} catch {} finally {
				a.value = !1;
			}
		}
	}
	async function u(e) {
		let t = n.value.find((t) => t.id === e), r = t && t.readAt == null;
		try {
			await s.value.markRead(e), t && t.readAt == null && (t.readAt = Date.now()), r && i.value > 0 && --i.value;
		} catch {}
	}
	async function d() {
		try {
			await s.value.markAllRead();
			let e = Date.now();
			for (let t of n.value) t.readAt ??= e;
			i.value = 0;
		} catch {}
	}
	async function f() {
		try {
			await s.value.clearAll(), n.value = [], i.value = 0, o.value = !0;
		} catch {}
	}
	return {
		items: n,
		unreadCount: i,
		loading: a,
		fetched: o,
		clear: c,
		fetchOnce: l,
		markRead: u,
		markAllRead: d,
		clearAll: f
	};
}), V = /* @__PURE__ */ e({ useMarketplaceStore: () => U });
function H(e) {
	try {
		let t = JSON.parse(e);
		return !t || typeof t.name != "string" || typeof t.template != "string" || !Array.isArray(t.props) ? null : t;
	} catch {
		return null;
	}
}
var U = n("marketplace", () => {
	let e = L(), n = new D(() => e.token || null), d = l.reactive(u("marketplace_installed_themes"), {}), f = l.reactive(u("marketplace_installed_components"), {}), p = t([]), m = t(0), y = t([]), b = t([]), x = t(0), S = t(!1), E = t(!1), O = t(null), k = r(() => C()), A = r(() => !!e.user?.isAdmin);
	function j() {
		e.isLoggedIn && B().fetchOnce();
	}
	function M(e) {
		return !!d.value[i(e)];
	}
	function N(e) {
		return !!f.value[e];
	}
	function P(e) {
		return d.value[e]?.css;
	}
	function F() {
		return Object.values(d.value).map((e) => ({
			label: e.name,
			value: i(e.marketplaceId),
			desc: e.authorLogin ? `@${e.authorLogin}` : ""
		}));
	}
	async function I(e, t = {}) {
		if (k.value) {
			S.value = !0;
			try {
				let r = e === "theme" ? await n.listThemes(t) : await n.listComponents(t);
				p.value = r.items, m.value = r.total;
			} catch (e) {
				g.error(w(e, "marketplace.loadFailed"));
			} finally {
				S.value = !1;
			}
		}
	}
	async function R() {
		if (e.isLoggedIn) {
			S.value = !0;
			try {
				let e = await n.listMine();
				y.value = e.items;
			} catch (e) {
				g.error(w(e, "marketplace.loadFailed"));
			} finally {
				S.value = !1;
			}
		}
	}
	async function z(e) {
		if (A.value) {
			S.value = !0;
			try {
				let t = await n.listPending({
					type: e,
					pageSize: 50
				});
				b.value = t.items, x.value = t.total;
			} catch (e) {
				g.error(w(e, "marketplace.loadFailed"));
			} finally {
				S.value = !1;
			}
		}
	}
	async function V(e) {
		try {
			let t = await n.get(e);
			return O.value = t, t;
		} catch (e) {
			return g.error(w(e, "marketplace.loadFailed")), null;
		}
	}
	async function U(e, t = !0) {
		S.value = !0;
		try {
			let r = await n.install(e);
			if (r.type === "theme") {
				let e = i(r.id);
				if (d.value = {
					...d.value,
					[e]: {
						marketplaceId: r.id,
						slug: r.slug,
						name: r.name,
						description: r.description,
						version: r.version,
						coverUrl: r.coverUrl,
						primaryColor: r.primaryColor,
						css: r.payload,
						authorLogin: r.author.login,
						installedAt: Date.now()
					}
				}, t) {
					let t = s();
					t.theme = e, r.primaryColor && (t.primaryColor = r.primaryColor), await t.applyCurrentTheme(), c().render(_().getContent());
				}
				return g.success(h("marketplace.installThemeSuccess", { name: r.name })), !0;
			}
			let o = H(r.payload);
			if (!o) return g.error(h("marketplace.invalidComponentPayload")), !1;
			if (new Set(v.map((e) => e.name)).has(o.name)) return g.error(h("marketplace.builtinNameConflict", { name: o.name })), !1;
			let l = a(), u = l.userComponents.find((e) => e.name === o.name), p = Date.now(), m = {
				id: u?.id ?? `mp-${r.id}`,
				name: o.name,
				description: o.description || r.description,
				template: o.template,
				props: o.props,
				example: o.example,
				createdAt: u?.createdAt ?? p,
				updatedAt: p
			};
			if (u) {
				l.updateComponent(u.id, {
					name: m.name,
					description: m.description,
					template: m.template,
					props: m.props
				});
				let e = l.userComponents.findIndex((e) => e.id === u.id);
				e !== -1 && o.example && (l.userComponents[e] = {
					...l.userComponents[e],
					example: o.example
				});
			} else l.userComponents.push(m);
			return f.value = {
				...f.value,
				[r.id]: {
					marketplaceId: r.id,
					slug: r.slug,
					name: r.name,
					description: r.description,
					version: r.version,
					componentName: o.name,
					authorLogin: r.author.login,
					installedAt: p
				}
			}, c().render(_().getContent()), g.success(h("marketplace.installComponentSuccess", { name: r.name })), !0;
		} catch (e) {
			return g.error(w(e, "marketplace.installFailed")), !1;
		} finally {
			S.value = !1;
		}
	}
	function W(e) {
		let t = i(e), n = { ...d.value };
		delete n[t], d.value = n;
		let r = s();
		r.theme === t && (r.theme = "default", r.applyCurrentTheme().then(() => {
			c().render(_().getContent());
		})), g.success(h("marketplace.uninstallSuccess"));
	}
	function G(e) {
		let t = f.value[e], n = { ...f.value };
		if (delete n[e], f.value = n, t) {
			let n = a(), r = n.userComponents.find((n) => n.id === `mp-${e}` || n.name === t.componentName);
			r && n.deleteComponent(r.id);
		} else g.success(h("marketplace.uninstallSuccess"));
	}
	async function K(e) {
		E.value = !0;
		try {
			let t = await n.publishTheme(e);
			return g.success(h("marketplace.publishPending")), await R(), j(), {
				item: t,
				errorCode: null
			};
		} catch (e) {
			return g.error(w(e, "marketplace.publishFailed"), { duration: 5e3 }), {
				item: null,
				errorCode: T(e)
			};
		} finally {
			E.value = !1;
		}
	}
	async function q(e) {
		E.value = !0;
		try {
			let t = await n.publishComponent(e);
			return g.success(h("marketplace.publishPending")), await R(), j(), {
				item: t,
				errorCode: null
			};
		} catch (e) {
			return g.error(w(e, "marketplace.publishFailed"), { duration: 5e3 }), {
				item: null,
				errorCode: T(e)
			};
		} finally {
			E.value = !1;
		}
	}
	async function J(e, t) {
		E.value = !0;
		try {
			return await n.update(e, t), g.success(h("marketplace.updatePending")), await R(), j(), !0;
		} catch (e) {
			return g.error(w(e, "marketplace.publishFailed")), !1;
		} finally {
			E.value = !1;
		}
	}
	async function Y(e) {
		try {
			return await n.remove(e), g.success(h("marketplace.removeSuccess")), await R(), !0;
		} catch (e) {
			return g.error(w(e, "marketplace.removeFailed")), !1;
		}
	}
	async function X(e) {
		try {
			return await n.approve(e), g.success(h("marketplace.approveSuccess")), await z(), j(), !0;
		} catch (e) {
			return g.error(w(e, "marketplace.reviewFailed")), !1;
		}
	}
	async function Z(e, t) {
		try {
			return await n.reject(e, t), g.success(h("marketplace.rejectSuccess")), await z(), j(), !0;
		} catch (e) {
			return g.error(w(e, "marketplace.reviewFailed")), !1;
		}
	}
	return {
		installedThemes: d,
		installedComponents: f,
		discoverItems: p,
		discoverTotal: m,
		myItems: y,
		pendingItems: b,
		pendingTotal: x,
		loading: S,
		publishing: E,
		detail: O,
		isConfigured: k,
		isAdmin: A,
		isThemeInstalled: M,
		isComponentInstalled: N,
		getInstalledThemeCss: P,
		getInstalledThemeOptions: F,
		isMarketplaceThemeKey: o,
		marketplaceThemeKey: i,
		fetchDiscover: I,
		fetchMine: R,
		fetchPending: z,
		fetchDetail: V,
		installItem: U,
		uninstallTheme: W,
		uninstallComponent: G,
		publishTheme: K,
		publishComponent: q,
		updateItem: J,
		removeItem: Y,
		approveItem: X,
		rejectItem: Z
	};
});
export { S as a, x as i, U as n, L as r, V as t };
