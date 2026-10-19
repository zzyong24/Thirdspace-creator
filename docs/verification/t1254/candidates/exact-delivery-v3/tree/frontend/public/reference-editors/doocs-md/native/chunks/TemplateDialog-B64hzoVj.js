import { C as e, D as t, H as n, S as r, T as i, W as a, b as o, dt as s, et as c, h as l, lt as u, n as d, ot as f, tt as p, u as m, w as h, wt as g, x as _, xt as v, y, yt as b } from "./vendor_vue-OlfIOlFg.js";
import { h as x } from "./render-BKss5lW7.js";
import { d as S, l as C, u as w } from "./storage-jiCkQUgy.js";
import { n as T } from "./vue-i18n-8AnKzzG6.js";
import { n as E } from "./translate-CUv9RhnO.js";
import { n as D } from "./lib-DIiEqr8B.js";
import { n as ee } from "./post-BeiAh9Pa.js";
import { n as O } from "./editor-VmYacIt-.js";
import { v as k } from "./vendor_vueuse-DbHwQsn4.js";
import { r as A, t as te } from "./Button-B4kIEl6s.js";
import { a as ne, i as re, n as ie, r as ae, t as oe } from "./DialogTitle-w1SUV50e.js";
import { t as se } from "./Label-BgDHuDsA.js";
import { t as j } from "./createLucideIcon-CFmwvUbS.js";
import { n as M, t as N } from "./file-text-DscvNBZB.js";
import { t as P } from "./plus-C2jBVcNN.js";
import { t as F } from "./search-DYgNslcJ.js";
import { t as I } from "./trash-DHg1WvRr.js";
import { t as L } from "./confirm-BRFdpM55.js";
import { t as R } from "./Input-BSRhgp5H.js";
var z = j({
	name: "calendar",
	size: 24,
	node: [
		["path", {
			d: "M8 2v3",
			key: "1ioesn"
		}],
		["path", {
			d: "M16 2v3",
			key: "otl347"
		}],
		["rect", {
			x: "3",
			y: "3",
			width: "18",
			height: "18",
			rx: "2",
			key: "h1oib"
		}],
		["path", {
			d: "M3 9h18",
			key: "1pudct"
		}]
	]
}), B = j({
	name: "clock",
	size: 24,
	node: [["circle", {
		cx: "12",
		cy: "12",
		r: "10",
		key: "1mglay"
	}], ["path", {
		d: "M12 6v6l4 2",
		key: "mmk7yg"
	}]]
}), V = j({
	name: "file-input",
	size: 24,
	node: [
		["path", {
			d: "M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1",
			key: "1q9hii"
		}],
		["path", {
			d: "M14 2v5a1 1 0 0 0 1 1h5",
			key: "wfsgrz"
		}],
		["path", {
			d: "M2 15h10",
			key: "jfw4w8"
		}],
		["path", {
			d: "m9 18 3-3-3-3",
			key: "112psh"
		}]
	]
}), H = j({
	name: "package",
	size: 24,
	node: [
		["path", {
			d: "M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z",
			key: "1a0edw"
		}],
		["path", {
			d: "M12 22V12",
			key: "d0xqtd"
		}],
		["polyline", {
			points: "3.29 7 12 12 20.71 7",
			key: "ousv84"
		}],
		["path", {
			d: "m7.5 4.27 9 5.15",
			key: "1c824w"
		}]
	]
}), U = j({
	name: "pencil",
	size: 24,
	node: [["path", {
		d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
		key: "1a8usu"
	}], ["path", {
		d: "m15 5 4 4",
		key: "1mk7zo"
	}]]
}), W = /* @__PURE__ */ t({
	__name: "Textarea",
	props: {
		class: { type: [
			Boolean,
			null,
			String,
			Object,
			Array
		] },
		defaultValue: {},
		modelValue: {}
	},
	setup(t, { emit: r }) {
		let i = t, a = k(i, "modelValue", r, {
			passive: !0,
			defaultValue: i.defaultValue
		});
		return (t, r) => p((n(), e("textarea", {
			"onUpdate:modelValue": r[0] ||= (e) => f(a) ? a.value = e : null,
			class: v(b(A)("flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50", i.class))
		}, null, 2)), [[m, b(a)]]);
	}
}), G = d("template", () => {
	let e = C.reactive(w("templates"), []), t = y(() => [...e.value].sort((e, t) => t.createdAt - e.createdAt)), n = y(() => e.value.length);
	function r(t) {
		let n = Date.now(), r = {
			id: S(),
			name: t.name,
			content: t.content,
			description: t.description,
			tags: t.tags,
			createdAt: n,
			updatedAt: n
		};
		return e.value.push(r), D.success(E("store.template.created", { name: t.name })), r;
	}
	function i(t) {
		return e.value.find((e) => e.id === t);
	}
	function a(t, n) {
		let r = e.value.findIndex((e) => e.id === t);
		return r === -1 ? (D.error(E("store.template.notFound")), !1) : (e.value[r] = {
			...e.value[r],
			...n,
			updatedAt: Date.now()
		}, D.success(E("store.template.updated")), !0);
	}
	function o(t) {
		let n = e.value.findIndex((e) => e.id === t);
		if (n === -1) return D.error(E("store.template.notFound")), !1;
		let r = e.value[n].name;
		return e.value.splice(n, 1), D.success(E("store.template.deleted", { name: r })), !0;
	}
	function s(e) {
		if (!e.trim()) return t.value;
		let n = e.toLowerCase();
		return t.value.filter((e) => e.name.toLowerCase().includes(n) || e.description?.toLowerCase().includes(n) || e.tags?.some((e) => e.toLowerCase().includes(n)));
	}
	function c(t) {
		let n = 0;
		return t.forEach((t) => {
			let r = e.value.findIndex((e) => e.id === t);
			r !== -1 && (e.value.splice(r, 1), n++);
		}), n > 0 && D.success(E("store.template.batchDeleted", { count: n })), n;
	}
	function l() {
		let t = e.value.length;
		e.value = [], D.success(E("store.template.allCleared", { count: t }));
	}
	function u() {
		return JSON.stringify(e.value, null, 2);
	}
	function d(t) {
		try {
			let n = JSON.parse(t);
			if (!Array.isArray(n)) return D.error(E("store.template.importInvalidFormat")), !1;
			let r = n.filter((e) => e.id && e.name && e.content && e.createdAt && e.updatedAt);
			return r.length === 0 ? (D.error(E("store.template.importNoValid")), !1) : (r.forEach((t) => {
				e.value.findIndex((e) => e.id === t.id) === -1 ? e.value.push(t) : e.value.push({
					...t,
					id: S()
				});
			}), D.success(E("store.template.importSuccess", { count: r.length })), !0);
		} catch (e) {
			return console.error("Import templates failed:", e), D.error(E("store.template.importParseError")), !1;
		}
	}
	return {
		templates: e,
		sortedTemplates: t,
		templateCount: n,
		createTemplate: r,
		getTemplateById: i,
		updateTemplate: a,
		deleteTemplate: o,
		searchTemplates: s,
		deleteTemplates: c,
		clearAllTemplates: l,
		exportTemplates: u,
		importTemplates: d
	};
}), K = { class: "flex-1 overflow-auto px-6 py-4" }, ce = {
	key: 0,
	class: "space-y-4 mb-6 p-4 border rounded-lg bg-muted/30"
}, le = { class: "flex items-center justify-between" }, ue = { class: "text-lg font-semibold" }, de = { class: "space-y-4" }, fe = { class: "space-y-2" }, pe = {
	key: 0,
	class: "text-sm text-red-500"
}, me = { class: "space-y-2" }, he = { class: "space-y-2" }, ge = { class: "flex gap-2 justify-end" }, _e = {
	key: 1,
	class: "flex gap-2 mb-4"
}, ve = { class: "relative flex-1" }, ye = {
	key: 2,
	class: "space-y-3"
}, be = {
	key: 0,
	class: "text-center py-12"
}, xe = { class: "text-muted-foreground mb-2" }, Se = {
	key: 0,
	class: "text-sm text-muted-foreground mb-4"
}, Ce = { class: "flex items-start justify-between gap-4" }, we = { class: "flex-1 min-w-0" }, Te = { class: "flex items-center gap-2 mb-2" }, Ee = { class: "font-medium truncate" }, De = {
	key: 0,
	class: "text-sm text-muted-foreground mb-2 line-clamp-2"
}, Oe = { class: "flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" }, ke = { class: "flex items-center gap-1" }, Ae = { class: "flex items-center gap-1" }, je = { class: "flex gap-1 flex-shrink-0" }, q = /* @__PURE__ */ t({
	__name: "TemplateDialog",
	setup(t) {
		let { t: d, locale: p } = T(), m = L(), S = O(), C = ee(), w = G(), E = x(), { toggleShowTemplateDialog: k } = E, A = s(""), j = y(() => w.searchTemplates(A.value)), q = s(!1), J = s("create"), Y = s(""), X = u({
			name: "",
			description: "",
			content: ""
		}), Z = u({ name: "" });
		function Q() {
			J.value = "create", X.name = "", X.description = "", X.content = S.getContent(), Z.name = "", q.value = !0;
		}
		function Me(e) {
			J.value = "edit", Y.value = e.id, X.name = e.name, X.description = e.description || "", X.content = e.content, Z.name = "", q.value = !0;
		}
		function Ne() {
			return Z.name = "", X.name.trim() ? X.name.trim().length > 50 ? (Z.name = d("template.nameTooLong"), !1) : !0 : (Z.name = d("template.nameRequired"), !1);
		}
		function Pe() {
			Ne() && (J.value === "create" ? w.createTemplate({
				name: X.name.trim(),
				description: X.description.trim() || void 0,
				content: X.content
			}) : w.updateTemplate(Y.value, {
				name: X.name.trim(),
				description: X.description.trim() || void 0,
				content: X.content
			}), q.value = !1);
		}
		function Fe() {
			q.value = !1;
		}
		function Ie(e) {
			let t = C.currentPost;
			t ? (C.updatePostContent(t.id, e.content), S.importContent(e.content), D.success(d("template.appliedToPost", { name: e.name }))) : (S.importContent(e.content), D.success(d("template.applied", { name: e.name }))), k(!1);
		}
		function Le(e) {
			S.insertAtCursor(e.content);
			let t = C.currentPost;
			t && C.updatePostContent(t.id, S.getContent()), D.success(d("template.inserted", { name: e.name })), k(!1);
		}
		function Re(e) {
			m.confirm({
				title: d("template.confirmDelete"),
				description: d("confirm.deleteTemplate", { name: e.name }),
				onConfirm: () => {
					w.deleteTemplate(e.id);
				}
			});
		}
		function $(e) {
			return new Date(e).toLocaleString(p.value, {
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit"
			});
		}
		function ze(e) {
			e || (k(!1), q.value = !1);
		}
		return (t, s) => {
			let u = oe, p = ie, m = ae, y = se, x = R, S = W, C = te, w = re, T = ne;
			return n(), _(T, {
				open: b(E).isShowTemplateDialog,
				"onUpdate:open": ze
			}, {
				default: c(() => [i(w, { class: "max-w-4xl max-h-[85vh] flex flex-col p-0" }, {
					default: c(() => [i(m, { class: "px-6 pt-6 pb-4 border-b" }, {
						default: c(() => [i(u, { class: "flex items-center gap-2" }, {
							default: c(() => [i(b(H), { class: "size-5" }), h(" " + g(b(d)("template.title")), 1)]),
							_: 1
						}), i(p, null, {
							default: c(() => [h(g(b(d)("template.description")), 1)]),
							_: 1
						})]),
						_: 1
					}), o("div", K, [
						b(q) ? (n(), e("div", ce, [
							o("div", le, [o("h3", ue, g(b(J) === "create" ? b(d)("template.create") : b(d)("template.edit")), 1)]),
							o("div", de, [
								o("div", fe, [
									i(y, { for: "template-name" }, {
										default: c(() => [h(g(b(d)("template.nameLabel")), 1)]),
										_: 1
									}),
									i(x, {
										id: "template-name",
										modelValue: b(X).name,
										"onUpdate:modelValue": s[0] ||= (e) => b(X).name = e,
										placeholder: b(d)("template.namePlaceholder"),
										class: v({ "border-red-500": b(Z).name })
									}, null, 8, [
										"modelValue",
										"placeholder",
										"class"
									]),
									b(Z).name ? (n(), e("p", pe, g(b(Z).name), 1)) : r("", !0)
								]),
								o("div", me, [i(y, { for: "template-description" }, {
									default: c(() => [h(g(b(d)("template.descLabel")), 1)]),
									_: 1
								}), i(S, {
									id: "template-description",
									modelValue: b(X).description,
									"onUpdate:modelValue": s[1] ||= (e) => b(X).description = e,
									placeholder: b(d)("template.descPlaceholder"),
									class: "resize-none h-20"
								}, null, 8, ["modelValue", "placeholder"])]),
								o("div", he, [i(y, { for: "template-content" }, {
									default: c(() => [h(g(b(d)("template.contentLabel")), 1)]),
									_: 1
								}), i(S, {
									id: "template-content",
									modelValue: b(X).content,
									"onUpdate:modelValue": s[2] ||= (e) => b(X).content = e,
									placeholder: b(d)("template.contentPlaceholder"),
									class: "resize-none h-40 font-mono text-sm"
								}, null, 8, ["modelValue", "placeholder"])])
							]),
							o("div", ge, [i(C, {
								variant: "outline",
								onClick: Fe
							}, {
								default: c(() => [h(g(b(d)("common.cancel")), 1)]),
								_: 1
							}), i(C, { onClick: Pe }, {
								default: c(() => [h(g(b(J) === "create" ? b(d)("common.create") : b(d)("common.save")), 1)]),
								_: 1
							})])
						])) : r("", !0),
						b(q) ? r("", !0) : (n(), e("div", _e, [o("div", ve, [i(b(F), { class: "absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" }), i(x, {
							modelValue: b(A),
							"onUpdate:modelValue": s[3] ||= (e) => f(A) ? A.value = e : null,
							placeholder: b(d)("template.searchPlaceholder"),
							class: "pl-9"
						}, null, 8, ["modelValue", "placeholder"])]), i(C, { onClick: Q }, {
							default: c(() => [i(b(P), { class: "mr-2 size-4" }), h(" " + g(b(d)("template.newTemplate")), 1)]),
							_: 1
						})])),
						b(q) ? r("", !0) : (n(), e("div", ye, [b(j).length === 0 ? (n(), e("div", be, [
							i(b(H), { class: "mx-auto size-12 text-muted-foreground mb-4" }),
							o("p", xe, g(b(A) ? b(d)("template.noMatch") : b(d)("template.empty")), 1),
							b(A) ? r("", !0) : (n(), e("p", Se, g(b(d)("template.emptyHint")), 1))
						])) : r("", !0), (n(!0), e(l, null, a(b(j), (t) => (n(), e("div", {
							key: t.id,
							class: "border rounded-lg p-4 hover:bg-muted/50 transition-colors"
						}, [o("div", Ce, [o("div", we, [
							o("div", Te, [i(b(N), { class: "size-4 text-muted-foreground flex-shrink-0" }), o("h4", Ee, g(t.name), 1)]),
							t.description ? (n(), e("p", De, g(t.description), 1)) : r("", !0),
							o("div", Oe, [o("span", ke, [i(b(z), { class: "size-3" }), h(" " + g(b(d)("template.createdAt")) + g($(t.createdAt)), 1)]), o("span", Ae, [i(b(B), { class: "size-3" }), h(" " + g(b(d)("template.updatedAt")) + g($(t.updatedAt)), 1)])])
						]), o("div", je, [
							i(C, {
								variant: "outline",
								size: "icon",
								class: "size-8",
								title: b(d)("template.applyTitle"),
								"aria-label": b(d)("template.applyTitle"),
								onClick: (e) => Ie(t)
							}, {
								default: c(() => [i(b(V), { class: "size-4" })]),
								_: 1
							}, 8, [
								"title",
								"aria-label",
								"onClick"
							]),
							i(C, {
								variant: "outline",
								size: "icon",
								class: "size-8",
								title: b(d)("template.insertTitle"),
								"aria-label": b(d)("template.insertTitle"),
								onClick: (e) => Le(t)
							}, {
								default: c(() => [i(b(M), { class: "size-4" })]),
								_: 1
							}, 8, [
								"title",
								"aria-label",
								"onClick"
							]),
							i(C, {
								variant: "outline",
								size: "icon",
								class: "size-8",
								title: b(d)("template.editTitle"),
								"aria-label": b(d)("template.editTitle"),
								onClick: (e) => Me(t)
							}, {
								default: c(() => [i(b(U), { class: "size-4" })]),
								_: 1
							}, 8, [
								"title",
								"aria-label",
								"onClick"
							]),
							i(C, {
								variant: "outline",
								size: "icon",
								class: "size-8 text-destructive hover:text-destructive",
								title: b(d)("template.deleteTitle"),
								"aria-label": b(d)("template.deleteTitle"),
								onClick: (e) => Re(t)
							}, {
								default: c(() => [i(b(I), { class: "size-4" })]),
								_: 1
							}, 8, [
								"title",
								"aria-label",
								"onClick"
							])
						])])]))), 128))]))
					])]),
					_: 1
				})]),
				_: 1
			}, 8, ["open"]);
		};
	}
});
export { q as default };
