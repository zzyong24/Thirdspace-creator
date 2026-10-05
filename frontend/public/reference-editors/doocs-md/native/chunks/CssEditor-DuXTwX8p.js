import { B as e, C as t, Ct as n, D as r, F as i, G as a, H as o, I as s, S as c, St as l, T as u, W as ee, Z as d, a as te, b as f, d as ne, dt as p, et as m, f as h, g as re, gt as g, h as ie, k as _, ot as v, p as y, s as ae, tt as oe, u as se, w as b, wt as x, x as S, xt as ce, y as C, yt as w, z as T } from "./vendor_vue-OlfIOlFg.js";
import { c as le, i as E, r as ue, s as D } from "./native-host-BoAU4GnD.js";
import { H as de, R as O, U as k, W as A, h as j, k as M, m as fe, n as pe, r as me, t as he } from "./render-DsjZRMnM.js";
import { n as ge } from "./vue-i18n-8AnKzzG6.js";
import { a as _e, t as ve } from "./translate-CUv9RhnO.js";
import { n as N } from "./lib-DIiEqr8B.js";
import { n as ye } from "./editor-VmYacIt-.js";
import { t as be } from "./highlight-ZqbupznI.js";
import { s as P } from "./vendor_vueuse-DbHwQsn4.js";
import { a as xe, i as Se, n as Ce, o as we, r as Te, t as Ee } from "./SelectContent-CWUKV6JE.js";
import { E as F, _ as I, b as L, h as R, v as z, y as B } from "./Teleport-YNIcOte_.js";
import { i as V, r as H, t as De } from "./Button-B4kIEl6s.js";
import { a as Oe, i as ke, m as Ae, o as je, r as Me, t as Ne, u as U } from "./clipboard-CNx6erJo.js";
import { c as Pe } from "./PopperContent-RtMDF-yC.js";
import { a as Fe, i as Ie, n as Le, r as Re, t as ze } from "./DialogTitle-w1SUV50e.js";
import { t as W } from "./createLucideIcon-CFmwvUbS.js";
import { t as Be } from "./plus-C2jBVcNN.js";
import { t as G } from "./x-E9vLZ87c.js";
import { t as Ve } from "./confirm-BRFdpM55.js";
import { n as He } from "./marketplace-C8nh3WtE.js";
import { n as Ue } from "./useLocalizedStyleOptions-BV-WqjoJ.js";
import { t as K } from "./_plugin-vue_export-helper-B3W2xDgE.js";
import { t as We } from "./DialogFooter-99Z6qvPr.js";
import { t as Ge } from "./Input-BSRhgp5H.js";
function Ke(e, t, n, r) {
	let i = A(n), a = [
		"/**",
		" * MD 主题导出",
		` * 导出时间: ${(/* @__PURE__ */ new Date()).toLocaleString()}`,
		" * 说明: 该文件包含完整的主题样式，可直接使用",
		" */",
		"",
		i,
		"",
		t,
		"",
		e
	].filter(Boolean).join("\n");
	return O(a, `${r}.css`, "text/css"), a;
}
var [q, J] = /*#__PURE__*/ F("DropdownMenuRoot"), Y = /* @__PURE__ */ r({
	__name: "DropdownMenuRoot",
	props: {
		defaultOpen: {
			type: Boolean,
			required: !1
		},
		open: {
			type: Boolean,
			required: !1,
			default: void 0
		},
		dir: {
			type: String,
			required: !1
		},
		modal: {
			type: Boolean,
			required: !1,
			default: !0
		}
	},
	emits: ["update:open"],
	setup(e, { emit: t }) {
		let n = e, r = t;
		B();
		let i = P(n, "open", r, {
			defaultValue: n.defaultOpen,
			passive: n.open === void 0
		}), s = p(), { modal: c, dir: l } = g(n), u = Pe(l);
		return J({
			open: i,
			onOpenChange: (e) => {
				i.value = e;
			},
			onOpenToggle: () => {
				i.value = !i.value;
			},
			triggerId: "",
			triggerElement: s,
			contentId: "",
			modal: c,
			dir: u
		}), (e, t) => (o(), S(w(U), {
			open: w(i),
			"onUpdate:open": t[0] ||= (e) => v(i) ? i.value = e : null,
			dir: w(u),
			modal: w(c)
		}, {
			default: m(() => [a(e.$slots, "default", { open: w(i) })]),
			_: 3
		}, 8, [
			"open",
			"dir",
			"modal"
		]));
	}
}), qe = /* @__PURE__ */ r({
	__name: "DropdownMenuContent",
	props: {
		forceMount: {
			type: Boolean,
			required: !1
		},
		loop: {
			type: Boolean,
			required: !1
		},
		memoDependencies: {
			type: Array,
			required: !1
		},
		side: {
			type: null,
			required: !1
		},
		sideOffset: {
			type: Number,
			required: !1
		},
		sideFlip: {
			type: Boolean,
			required: !1
		},
		align: {
			type: null,
			required: !1
		},
		alignOffset: {
			type: Number,
			required: !1
		},
		alignFlip: {
			type: Boolean,
			required: !1
		},
		avoidCollisions: {
			type: Boolean,
			required: !1
		},
		collisionBoundary: {
			type: null,
			required: !1
		},
		collisionPadding: {
			type: [Number, Object],
			required: !1
		},
		arrowPadding: {
			type: Number,
			required: !1
		},
		hideShiftedArrow: {
			type: Boolean,
			required: !1
		},
		sticky: {
			type: String,
			required: !1
		},
		hideWhenDetached: {
			type: Boolean,
			required: !1
		},
		positionStrategy: {
			type: String,
			required: !1
		},
		updatePositionStrategy: {
			type: String,
			required: !1
		},
		disableUpdateOnLayoutShift: {
			type: Boolean,
			required: !1
		},
		prioritizePosition: {
			type: Boolean,
			required: !1
		},
		reference: {
			type: null,
			required: !1
		},
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1
		}
	},
	emits: [
		"escapeKeyDown",
		"pointerDownOutside",
		"focusOutside",
		"interactOutside",
		"closeAutoFocus"
	],
	setup(e, { emit: t }) {
		let n = I(e, t);
		B();
		let r = q(), s = p(!1);
		function c(e) {
			e.defaultPrevented || (s.value || setTimeout(() => {
				r.triggerElement.value?.focus();
			}, 0), s.value = !1, e.preventDefault());
		}
		return r.contentId ||= R(void 0, "reka-dropdown-menu-content"), (e, t) => (o(), S(w(Oe), i(w(n), {
			id: w(r).contentId,
			"aria-labelledby": w(r)?.triggerId,
			style: {
				"--reka-dropdown-menu-content-transform-origin": "var(--reka-popper-transform-origin)",
				"--reka-dropdown-menu-content-available-width": "var(--reka-popper-available-width)",
				"--reka-dropdown-menu-content-available-height": "var(--reka-popper-available-height)",
				"--reka-dropdown-menu-trigger-width": "var(--reka-popper-anchor-width)",
				"--reka-dropdown-menu-trigger-height": "var(--reka-popper-anchor-height)"
			},
			onCloseAutoFocus: c,
			onInteractOutside: t[0] ||= (e) => {
				if (e.defaultPrevented) return;
				let t = e.detail.originalEvent, n = t.button === 0 && t.ctrlKey === !0, i = t.button === 2 || n;
				(!w(r).modal.value || i) && (s.value = !0), w(r).triggerElement.value?.contains(e.target) && e.preventDefault();
			}
		}), {
			default: m(() => [a(e.$slots, "default")]),
			_: 3
		}, 16, ["id", "aria-labelledby"]));
	}
}), Je = /* @__PURE__ */ r({
	__name: "DropdownMenuItem",
	props: {
		disabled: {
			type: Boolean,
			required: !1
		},
		textValue: {
			type: String,
			required: !1
		},
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1
		}
	},
	emits: ["select"],
	setup(e, { emit: t }) {
		let n = e, r = L(t);
		return B(), (e, t) => (o(), S(w(je), l(_({
			...n,
			...w(r)
		})), {
			default: m(() => [a(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), Ye = /* @__PURE__ */ r({
	__name: "DropdownMenuPortal",
	props: {
		to: {
			type: null,
			required: !1
		},
		disabled: {
			type: Boolean,
			required: !1
		},
		defer: {
			type: Boolean,
			required: !1
		},
		forceMount: {
			type: Boolean,
			required: !1
		}
	},
	setup(e) {
		let t = e;
		return (e, n) => (o(), S(w(ke), l(_(t)), {
			default: m(() => [a(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), X = /* @__PURE__ */ r({
	__name: "DropdownMenuSeparator",
	props: {
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1
		}
	},
	setup(e) {
		let t = e;
		return B(), (e, n) => (o(), S(w(Me), l(_(t)), {
			default: m(() => [a(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), Z = /* @__PURE__ */ r({
	__name: "DropdownMenuTrigger",
	props: {
		disabled: {
			type: Boolean,
			required: !1
		},
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1,
			default: "button"
		}
	},
	setup(e) {
		let t = e, n = q(), { forwardRef: r, currentElement: i } = B();
		return T(() => {
			n.triggerElement = i;
		}), n.triggerId ||= R(void 0, "reka-dropdown-menu-trigger"), (e, i) => (o(), S(w(Ae), { "as-child": "" }, {
			default: m(() => [u(w(V), {
				id: w(n).triggerId,
				ref: w(r),
				type: e.as === "button" ? "button" : void 0,
				"as-child": t.asChild,
				as: e.as,
				"aria-haspopup": "menu",
				"aria-expanded": w(n).open.value,
				"aria-controls": w(n).open.value ? w(n).contentId : void 0,
				"data-disabled": e.disabled ? "" : void 0,
				disabled: e.disabled,
				"data-state": w(n).open.value ? "open" : "closed",
				onClick: i[0] ||= async (t) => {
					!e.disabled && t.button === 0 && t.ctrlKey === !1 && (w(n)?.onOpenToggle(), await s(), w(n).open.value && t.preventDefault());
				},
				onKeydown: i[1] ||= h((t) => {
					e.disabled || (["Enter", " "].includes(t.key) && w(n).onOpenToggle(), t.key === "ArrowDown" && w(n).onOpenChange(!0), [
						"Enter",
						" ",
						"ArrowDown"
					].includes(t.key) && t.preventDefault());
				}, [
					"enter",
					"space",
					"arrow-down"
				])
			}, {
				default: m(() => [a(e.$slots, "default")]),
				_: 3
			}, 8, [
				"id",
				"type",
				"as-child",
				"as",
				"aria-expanded",
				"aria-controls",
				"data-disabled",
				"disabled",
				"data-state"
			])]),
			_: 3
		}));
	}
}), Xe = W({
	name: "circle-question-mark",
	size: 24,
	node: [
		["circle", {
			cx: "12",
			cy: "12",
			r: "10",
			key: "1mglay"
		}],
		["path", {
			d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3",
			key: "1u773s"
		}],
		["path", {
			d: "M12 17h.01",
			key: "p32p05"
		}]
	],
	aliases: ["help-circle", "circle-help"]
}), Ze = W({
	name: "download",
	size: 24,
	node: [
		["path", {
			d: "M12 15V3",
			key: "m9g1x1"
		}],
		["path", {
			d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
			key: "ih7n3h"
		}],
		["path", {
			d: "m7 10 5 5 5-5",
			key: "brsn70"
		}]
	]
}), Qe = W({
	name: "ellipsis",
	size: 24,
	node: [
		["circle", {
			cx: "12",
			cy: "12",
			r: "1",
			key: "41hilf"
		}],
		["circle", {
			cx: "19",
			cy: "12",
			r: "1",
			key: "1wjl8i"
		}],
		["circle", {
			cx: "5",
			cy: "12",
			r: "1",
			key: "1pcz8c"
		}]
	],
	aliases: ["more-horizontal"]
}), $e = W({
	name: "eye",
	size: 24,
	node: [["path", {
		d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
		key: "1nclc0"
	}], ["circle", {
		cx: "12",
		cy: "12",
		r: "3",
		key: "1v7zrd"
	}]]
}), et = W({
	name: "pen-line",
	size: 24,
	node: [["path", {
		d: "M13 21h8",
		key: "1jsn5i"
	}], ["path", {
		d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
		key: "1a8usu"
	}]],
	aliases: ["edit-3"]
}), tt = W({
	name: "square-check-big",
	size: 24,
	node: [["path", {
		d: "M21 10.656V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.344",
		key: "2acyp4"
	}], ["path", {
		d: "m9 11 3 3L22 4",
		key: "1pflzl"
	}]],
	aliases: ["check-square"]
}), nt = /* @__PURE__ */ r({
	__name: "DropdownMenu",
	props: {
		defaultOpen: { type: Boolean },
		open: { type: Boolean },
		dir: {},
		modal: { type: Boolean }
	},
	emits: ["update:open"],
	setup(e, { emit: t }) {
		let n = e, r = I(n, t);
		return (e, t) => (o(), S(w(Y), i(w(r), { modal: !w(E)() && n.modal }), {
			default: m(() => [a(e.$slots, "default")]),
			_: 3
		}, 16, ["modal"]));
	}
}), rt = /* @__PURE__ */ r({
	__name: "DropdownMenuContent",
	props: {
		forceMount: { type: Boolean },
		loop: { type: Boolean },
		memoDependencies: {},
		side: {},
		sideOffset: { default: 4 },
		sideFlip: { type: Boolean },
		align: {},
		alignOffset: {},
		alignFlip: { type: Boolean },
		avoidCollisions: { type: Boolean },
		collisionBoundary: {},
		collisionPadding: {},
		arrowPadding: {},
		hideShiftedArrow: { type: Boolean },
		sticky: {},
		hideWhenDetached: { type: Boolean },
		positionStrategy: {},
		updatePositionStrategy: {},
		disableUpdateOnLayoutShift: { type: Boolean },
		prioritizePosition: { type: Boolean },
		reference: {},
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
	emits: [
		"escapeKeyDown",
		"pointerDownOutside",
		"focusOutside",
		"interactOutside",
		"closeAutoFocus"
	],
	setup(e, { emit: t }) {
		let n = e, r = t, s = C(() => {
			let { class: e, ...t } = n;
			return t;
		}), c = I(s, r);
		return (e, t) => (o(), S(w(Ye), { to: w(D)() }, {
			default: m(() => [u(w(qe), i(w(c), { class: w(H)("z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2", n.class) }), {
				default: m(() => [a(e.$slots, "default")]),
				_: 3
			}, 16, ["class"])]),
			_: 3
		}, 8, ["to"]));
	}
}), it = /* @__PURE__ */ r({
	__name: "DropdownMenuSeparator",
	props: {
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
		let t = e, n = C(() => {
			let { class: e, ...n } = t;
			return n;
		});
		return (e, r) => (o(), S(w(X), i(w(n), { class: w(H)("-mx-1 my-1 h-px bg-muted", t.class) }), null, 16, ["class"]));
	}
}), at = /* @__PURE__ */ r({
	__name: "DropdownMenuItem",
	props: {
		disabled: { type: Boolean },
		textValue: {},
		asChild: { type: Boolean },
		as: {},
		class: { type: [
			Boolean,
			null,
			String,
			Object,
			Array
		] },
		inset: { type: Boolean }
	},
	setup(e) {
		let t = e, n = C(() => {
			let { class: e, ...n } = t;
			return n;
		}), r = z(n);
		return (n, s) => (o(), S(w(Je), i(w(r), { class: w(H)("relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-hidden transition-colors focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50", e.inset && "pl-8", t.class) }), {
			default: m(() => [a(n.$slots, "default")]),
			_: 3
		}, 16, ["class"]));
	}
}), ot = /* @__PURE__ */ r({
	__name: "DropdownMenuTrigger",
	props: {
		disabled: { type: Boolean },
		asChild: { type: Boolean },
		as: {}
	},
	setup(e) {
		let t = z(e);
		return (e, n) => (o(), S(w(Z), i({ class: "outline-hidden" }, w(t)), {
			default: m(() => [a(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), st = { class: "flex items-center h-9 px-2 shrink-0 border-b border-border" }, ct = {
	class: "flex-1 flex items-center gap-0 overflow-x-auto custom-scrollbar min-w-0 h-full",
	role: "tablist"
}, lt = [
	"aria-selected",
	"tabindex",
	"onClick",
	"onKeydown",
	"onDblclick",
	"onContextmenu"
], ut = {
	key: 2,
	class: "truncate max-w-[100px]"
}, dt = {
	key: 3,
	class: "absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-primary"
}, ft = ["aria-label", "title"], pt = { class: "flex items-center shrink-0" }, mt = ["title", "aria-label"], ht = ["title", "aria-label"], gt = ["title", "aria-label"], _t = ["lang"], vt = ["placeholder"], yt = {
	key: 0,
	class: "shrink-0 border-t border-border bg-background px-3 pt-2 pb-3 space-y-2"
}, bt = { class: "flex items-center justify-between text-xs" }, xt = { class: "text-muted-foreground" }, St = { class: "text-foreground font-semibold" }, Ct = { class: "flex items-center gap-2 text-muted-foreground" }, wt = { class: "flex" }, Tt = [
	"title",
	"aria-label",
	"disabled"
], Et = [
	"title",
	"aria-label",
	"disabled"
], Dt = { class: "space-y-4" }, Ot = { class: "space-y-2" }, kt = { class: "text-sm font-medium" }, At = { class: "space-y-2" }, jt = { class: "text-sm font-medium" }, Mt = { class: "text-xs text-muted-foreground" }, Nt = { class: "space-y-3 text-sm text-muted-foreground leading-relaxed" }, Pt = { class: "space-y-4 flex-1 min-h-0 flex flex-col" }, Ft = { class: "space-y-2" }, It = { class: "text-sm font-medium" }, Lt = { class: "flex-1 min-h-0 border rounded-lg overflow-auto" }, Rt = { class: "h-full overflow-auto bg-muted text-sm" }, zt = ["innerHTML"], Bt = /*#__PURE__*/ K(/* @__PURE__ */ r({
	__name: "CssEditor",
	setup(r) {
		let { t: i } = ge(), a = ue(), l = !0, g = Ve(), _ = me(), E = j(), D = he(), O = ye(), A = pe(), { isMobile: P } = te(E), { cssContentConfig: F, isSelectMode: I, selectedIds: L } = te(_), R = p(!1);
		d(() => E.isShowCssEditor, () => {
			P.value && (R.value = !0);
		}), d(() => P.value, () => {
			R.value = !1;
		});
		let z = p(!1), B = p(""), V = p(null), H = p(""), Oe = null;
		function ke(e) {
			Oe = e;
		}
		function Ae(e) {
			V.value = e.id, H.value = e.title, s(() => {
				Oe?.select();
			});
		}
		function je() {
			let e = V.value;
			if (!e) return;
			let t = H.value.trim();
			if (!t) {
				N.error(i("cssEditor.schemeNameRequired")), V.value = null;
				return;
			}
			let n = F.value.tabs.find((t) => t.id === e);
			n && t !== n.title && (n.title = t, n.name = t, n.updateDatetime = /* @__PURE__ */ new Date(), N.success(i("post.editSuccess"))), V.value = null;
		}
		function Me() {
			V.value = null;
		}
		async function U() {
			if (await s(), !l || a && (!a.live || a.signal.aborted)) return;
			let e = le(".cssEditor-wrapper .css-tab-active");
			e && e.scrollIntoView({
				behavior: "smooth",
				block: "nearest",
				inline: "center"
			});
		}
		function Pe(e) {
			B.value = e, z.value = !0;
		}
		function W() {
			if (!B.value.trim()) {
				N.error(i("cssEditor.editNameFailed"));
				return;
			}
			_.renameTab(B.value), z.value = !1, N.success(i("post.editSuccess"));
		}
		let K = p(!1), q = p(!1), J = p(""), Y = p("blank");
		async function qe() {
			if (!J.value.trim()) {
				N.error(i("cssEditor.createNameFailed"));
				return;
			}
			let e = "";
			e = Y.value === "blank" ? fe(ve()) : k[Y.value];
			let t = J.value;
			_.addCssContentTab(t, e), K.value = !1, N.success(i("cssEditor.createSuccess")), Y.value = "blank", U();
		}
		function Je(e) {
			g.confirm({
				title: i("confirm.tip"),
				description: i("cssEditor.deleteSchemeConfirm"),
				onConfirm: () => {
					let t = F.value.tabs;
					if (t.length === 1) {
						N.warning(i("cssEditor.keepOneScheme"));
						return;
					}
					let n = F.value.active;
					n === e && t.forEach((r, i) => {
						if (r.id === e) {
							let e = t[i + 1] || t[i - 1];
							e && (n = e.id);
						}
					}), _.tabChanged(n), F.value.tabs = t.filter((t) => t.id !== e), N.success(i("common.deleteSuccess"));
				}
			});
		}
		function Ye() {
			J.value = i("cssEditor.schemeDefaultName", { index: F.value.tabs.length + 1 }), Y.value = "blank", K.value = !0;
		}
		let X = p(!1), Z = p("default"), Bt = C(() => be.highlight(k[Z.value], { language: "css" }).value), Q = p(null), Vt = p(!1), Ht = p({
			x: 0,
			y: 0
		});
		function Ut(e, t) {
			e.preventDefault(), e.stopPropagation(), Q.value = t, Ht.value = {
				x: e.clientX,
				y: e.clientY
			}, Vt.value = !0;
		}
		function $() {
			Vt.value = !1, Q.value = null;
		}
		function Wt() {
			let e = F.value.tabs.find((e) => e.id === Q.value);
			e && Pe(e.name), $();
		}
		function Gt() {
			Q.value && _.exportSingleTab(Q.value), $();
		}
		function Kt() {
			Q.value && Je(Q.value), $();
		}
		function qt() {
			Q.value && (_.toggleSelectMode(), _.toggleSelectTab(Q.value)), $();
		}
		let Jt = C(() => F.value.tabs.length > 0 && L.value.length === F.value.tabs.length);
		function Yt() {
			let e = L.value.length, t = e === 1 ? i("confirm.deleteItem", { name: F.value.tabs.find((e) => e.id === L.value[0])?.title ?? "" }) : i("confirm.deleteCssScheme", { count: e });
			g.confirm({
				title: i("confirm.tip"),
				description: t,
				confirmText: i("post.confirmDelete"),
				destructive: !0,
				onConfirm: () => {
					_.batchDeleteTabs();
				}
			});
		}
		function Xt(e) {
			I.value ? _.toggleSelectTab(e) : tn(e);
		}
		function Zt() {
			_.toggleSelectMode();
		}
		function Qt() {
			Z.value = "default", X.value = !0;
		}
		async function $t() {
			let e = k[Z.value];
			await Ne(e), N.success(i("common.copiedToClipboard"));
		}
		function en() {
			X.value = !1, Y.value = Z.value, J.value = i("cssEditor.basedOnTheme", { theme: Ue(i, Z.value) }), K.value = !0;
		}
		function tn(e) {
			_.tabChanged(e), U();
		}
		T(() => {
			let e = () => {
				A.applyCurrentTheme(), A.updateCodeTheme();
				let e = O.getContent();
				D.render(e);
			};
			_.setOnTabChangedCallback(e), _.initCssEditor(e), U(), document.addEventListener("click", $);
		}), e(() => {
			l = !1, _.cssEditor?.destroy(), _.cssEditor = null, _.setOnTabChangedCallback(null), document.removeEventListener("click", $);
		});
		function nn() {
			let e = F.value.tabs.find((e) => e.id === F.value.active);
			if (!e) {
				N.error(i("cssEditor.schemeNotFound"));
				return;
			}
			let t = e.title || e.name, n = k.default;
			if (A.theme === "default") n = k.default;
			else if (de(A.theme)) n = `${k.default}\n\n${k[A.theme]}`;
			else if (M(A.theme)) {
				let e = He().getInstalledThemeCss(A.theme);
				e && (n = `${k.default}\n\n${e}`);
			}
			Ke(e.content, n, {
				primaryColor: A.primaryColor,
				fontFamily: A.fontFamily,
				fontSize: A.fontSize,
				lineHeight: A.lineHeight,
				blockSpacing: A.blockSpacing,
				linkColor: A.linkColor,
				blockquoteBackground: A.blockquoteBackground
			}, t);
		}
		return (e, r) => {
			let a = ot, s = at, l = it, d = rt, te = nt, p = ze, g = Le, C = Re, T = Ge, le = Ce, ue = Te, D = Se, de = Ee, O = xe, k = De, A = We, j = Ie, M = Fe;
			return o(), t(ie, null, [
				w(P) && w(E).isShowCssEditor ? (o(), t("div", {
					key: 0,
					class: "fixed inset-0 bg-black/50 z-40",
					onClick: r[0] ||= (e) => w(E).isShowCssEditor = !1
				})) : c("", !0),
				oe(f("div", {
					class: ce(["cssEditor-wrapper h-full flex flex-col overflow-y-auto", {
						"fixed top-0 right-0 w-full h-full z-100 bg-background border-l shadow-lg mobile-css-editor": w(P),
						animate: w(P) && w(R)
					}]),
					style: n(w(P) ? { transform: w(E).isShowCssEditor ? "translateX(0)" : "translateX(100%)" } : void 0)
				}, [
					f("div", st, [f("div", ct, [(o(!0), t(ie, null, ee(w(F).tabs, (e) => (o(), t("div", {
						key: e.id,
						class: "group/tab relative flex items-center shrink-0 h-full"
					}, [f("div", {
						role: "tab",
						"aria-selected": w(F).active === e.id && !w(I),
						tabindex: w(V) === e.id ? -1 : 0,
						class: ce(["relative flex items-center gap-1.5 h-full px-3 text-xs transition-colors duration-150", [w(F).active === e.id && !w(I) ? "css-tab-active text-foreground font-medium" : "text-muted-foreground hover:text-foreground", w(I) && w(L).includes(e.id) ? "bg-accent text-accent-foreground" : ""]]),
						onClick: (t) => Xt(e.id),
						onKeydown: [h(y((t) => Xt(e.id), ["prevent"]), ["enter"]), h(y((t) => Xt(e.id), ["prevent"]), ["space"])],
						onDblclick: y((t) => Ae(e), ["stop"]),
						onContextmenu: (t) => Ut(t, e.id)
					}, [
						w(I) ? (o(), t("span", {
							key: 0,
							class: ce(["inline-flex items-center justify-center size-4 rounded border transition-colors mr-1", w(L).includes(e.id) ? "bg-primary border-primary text-primary-foreground" : "border-border"])
						}, [w(L).includes(e.id) ? (o(), S(w(we), {
							key: 0,
							class: "size-3"
						})) : c("", !0)], 2)) : c("", !0),
						w(V) === e.id ? oe((o(), t("input", {
							key: 1,
							ref_for: !0,
							ref: ke,
							"onUpdate:modelValue": r[1] ||= (e) => v(H) ? H.value = e : null,
							class: "w-[80px] bg-transparent outline-none border-b border-primary text-xs",
							onClick: r[2] ||= y(() => {}, ["stop"]),
							onKeyup: [h(je, ["enter"]), h(Me, ["escape"])],
							onBlur: je
						}, null, 544)), [[se, w(H)]]) : (o(), t("span", ut, x(e.title), 1)),
						w(F).active === e.id && !w(I) ? (o(), t("span", dt)) : c("", !0)
					], 42, lt), w(F).active === e.id && !w(I) ? (o(), S(te, { key: 0 }, {
						default: m(() => [u(a, { "as-child": "" }, {
							default: m(() => [f("button", {
								type: "button",
								class: "-ml-2 mr-1 inline-flex items-center justify-center size-4 rounded text-muted-foreground/60 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors duration-100 cursor-pointer",
								"aria-label": w(i)("common.moreActions"),
								title: w(i)("common.moreActions"),
								onClick: r[3] ||= y(() => {}, ["stop"])
							}, [u(w(Qe), { class: "size-3" })], 8, ft)]),
							_: 1
						}), u(d, {
							align: "start",
							class: "w-32"
						}, {
							default: m(() => [
								u(s, { onClick: y((t) => Pe(e.name), ["stop"]) }, {
									default: m(() => [u(w(et), { class: "mr-2 size-4" }), b(" " + x(w(i)("common.rename")), 1)]),
									_: 1
								}, 8, ["onClick"]),
								u(s, { onClick: y((t) => w(_).exportSingleTab(e.id), ["stop"]) }, {
									default: m(() => [u(w(Ze), { class: "mr-2 size-4" }), b(" " + x(w(i)("common.export")), 1)]),
									_: 1
								}, 8, ["onClick"]),
								u(l),
								w(F).tabs.length > 1 ? (o(), S(s, {
									key: 0,
									class: "text-destructive focus:text-destructive",
									onClick: y((t) => Je(e.id), ["stop"])
								}, {
									default: m(() => [u(w(G), { class: "mr-2 size-4" }), b(" " + x(w(i)("common.delete")), 1)]),
									_: 1
								}, 8, ["onClick"])) : c("", !0),
								u(s, { onClick: y((t) => {
									w(_).toggleSelectMode(), w(_).toggleSelectTab(e.id);
								}, ["stop"]) }, {
									default: m(() => [u(w(tt), { class: "mr-2 size-4" }), b(" " + x(w(i)("cssEditor.multiSelect")), 1)]),
									_: 1
								}, 8, ["onClick"])
							]),
							_: 2
						}, 1024)]),
						_: 2
					}, 1024)) : c("", !0)]))), 128))]), f("div", pt, [
						f("button", {
							type: "button",
							class: "inline-flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-150",
							title: w(i)("cssEditor.newTitle"),
							"aria-label": w(i)("cssEditor.newTitle"),
							onClick: Ye
						}, [u(w(Be), { class: "size-3.5" })], 8, mt),
						u(te, null, {
							default: m(() => [u(a, { "as-child": "" }, {
								default: m(() => [f("button", {
									type: "button",
									class: "inline-flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-150",
									title: w(i)("common.more"),
									"aria-label": w(i)("common.more")
								}, [u(w(Qe), { class: "size-3.5" })], 8, ht)]),
								_: 1
							}), u(d, {
								align: "end",
								class: "w-48"
							}, {
								default: m(() => [
									u(s, { onClick: Qt }, {
										default: m(() => [u(w($e), { class: "mr-2 size-4" }), b(" " + x(w(i)("cssEditor.viewBuiltinTitle")), 1)]),
										_: 1
									}),
									u(s, { onClick: nn }, {
										default: m(() => [u(w(Ze), { class: "mr-2 size-4" }), b(" " + x(w(i)("common.export")), 1)]),
										_: 1
									}),
									u(l),
									u(s, { onClick: r[4] ||= (e) => q.value = !0 }, {
										default: m(() => [u(w(Xe), { class: "mr-2 size-4" }), b(" " + x(w(i)("cssEditor.tipsTitle")), 1)]),
										_: 1
									})
								]),
								_: 1
							})]),
							_: 1
						}),
						f("button", {
							type: "button",
							class: "inline-flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-150",
							title: w(i)("common.close"),
							"aria-label": w(i)("common.close"),
							onClick: r[5] ||= (e) => w(E).isShowCssEditor = !1
						}, [u(w(G), { class: "size-3.5" })], 8, gt)
					])]),
					f("div", {
						class: "flex-1 min-h-0",
						lang: w(_e)
					}, [f("textarea", {
						id: "cssEditor",
						type: "textarea",
						placeholder: w(i)("cssEditor.cssPlaceholder")
					}, null, 8, vt)], 8, _t),
					u(ae, { name: "slide-up" }, {
						default: m(() => [w(I) ? (o(), t("div", yt, [f("div", bt, [f("span", xt, [
							b(x(w(i)("common.selected")) + " ", 1),
							f("strong", St, x(w(L).length), 1),
							b(" " + x(w(i)("cssEditor.selectedUnit")), 1)
						]), f("div", Ct, [
							f("button", {
								class: "hover:text-foreground transition-colors",
								onClick: r[6] ||= (e) => w(Jt) ? w(_).clearSelection() : w(_).selectAllTabs()
							}, x(w(Jt) ? w(i)("common.deselectAll") : w(i)("common.selectAll")), 1),
							r[23] ||= f("span", { class: "opacity-30" }, "·", -1),
							f("button", {
								class: "hover:text-foreground transition-colors",
								onClick: Zt
							}, x(w(i)("common.done")), 1)
						])]), f("div", wt, [
							f("button", {
								type: "button",
								class: "flex flex-1 items-center justify-center rounded-md py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35",
								title: w(i)("common.export"),
								"aria-label": w(i)("common.export"),
								disabled: !w(L).length,
								onClick: r[7] ||= (...e) => w(_).batchExportTabs && w(_).batchExportTabs(...e)
							}, [u(w(Ze), { class: "size-4" })], 8, Tt),
							r[24] ||= f("div", { class: "mx-1 self-center h-5 w-px bg-border/60 shrink-0" }, null, -1),
							f("button", {
								type: "button",
								class: "flex flex-1 items-center justify-center rounded-md py-2 text-destructive/60 transition-colors hover:bg-destructive/8 hover:text-destructive disabled:pointer-events-none disabled:opacity-35",
								title: w(L).length >= w(F).tabs.length ? w(i)("cssEditor.deleteSchemeMinOne") : w(i)("common.delete"),
								"aria-label": w(L).length >= w(F).tabs.length ? w(i)("cssEditor.deleteSchemeMinOne") : w(i)("common.delete"),
								disabled: !w(L).length || w(L).length >= w(F).tabs.length,
								onClick: r[8] ||= (e) => Yt()
							}, [u(w(G), { class: "size-4" })], 8, Et)
						])])) : c("", !0)]),
						_: 1
					}),
					(o(), S(re, { to: "body" }, [w(Vt) ? (o(), t("div", {
						key: 0,
						class: "fixed z-50 min-w-[120px] rounded-md border border-border bg-background p-1 shadow-md animate-in fade-in-0 zoom-in-95",
						style: n({
							left: `${w(Ht).x}px`,
							top: `${w(Ht).y}px`
						}),
						onClick: r[9] ||= y(() => {}, ["stop"])
					}, [
						f("button", {
							class: "flex w-full items-center rounded-sm px-2 py-1.5 text-xs text-foreground hover:bg-accent transition-colors",
							onClick: Wt
						}, [u(w(et), { class: "mr-2 size-3.5" }), b(" " + x(w(i)("common.rename")), 1)]),
						f("button", {
							class: "flex w-full items-center rounded-sm px-2 py-1.5 text-xs text-foreground hover:bg-accent transition-colors",
							onClick: Gt
						}, [u(w(Ze), { class: "mr-2 size-3.5" }), b(" " + x(w(i)("common.export")), 1)]),
						r[25] ||= f("div", { class: "my-1 h-px bg-border" }, null, -1),
						w(F).tabs.length > 1 ? (o(), t("button", {
							key: 0,
							class: "flex w-full items-center rounded-sm px-2 py-1.5 text-xs text-destructive hover:bg-destructive/8 transition-colors",
							onClick: Kt
						}, [u(w(G), { class: "mr-2 size-3.5" }), b(" " + x(w(i)("common.delete")), 1)])) : c("", !0),
						f("button", {
							class: "flex w-full items-center rounded-sm px-2 py-1.5 text-xs text-foreground hover:bg-accent transition-colors",
							onClick: qt
						}, [u(w(tt), { class: "mr-2 size-3.5" }), b(" " + x(w(i)("cssEditor.multiSelect")), 1)])
					], 4)) : c("", !0)])),
					u(M, {
						open: w(K),
						"onUpdate:open": r[14] ||= (e) => v(K) ? K.value = e : null
					}, {
						default: m(() => [u(j, { class: "sm:max-w-[425px]" }, {
							default: m(() => [
								u(C, null, {
									default: m(() => [u(p, null, {
										default: m(() => [b(x(w(i)("cssEditor.newTitle")), 1)]),
										_: 1
									}), u(g, null, {
										default: m(() => [b(x(w(i)("cssEditor.newDescription")), 1)]),
										_: 1
									})]),
									_: 1
								}),
								f("div", Dt, [f("div", Ot, [f("label", kt, x(w(i)("cssEditor.schemeName")), 1), u(T, {
									modelValue: w(J),
									"onUpdate:modelValue": r[10] ||= (e) => v(J) ? J.value = e : null,
									placeholder: w(i)("cssEditor.schemeNamePlaceholder"),
									onKeyup: h(qe, ["enter"])
								}, null, 8, ["modelValue", "placeholder"])]), f("div", At, [
									f("label", jt, x(w(i)("cssEditor.initialTemplate")), 1),
									u(O, {
										modelValue: w(Y),
										"onUpdate:modelValue": r[11] ||= (e) => v(Y) ? Y.value = e : null
									}, {
										default: m(() => [u(ue, null, {
											default: m(() => [u(le, { placeholder: w(i)("cssEditor.selectTemplate") }, null, 8, ["placeholder"])]),
											_: 1
										}), u(de, null, {
											default: m(() => [
												u(D, { value: "blank" }, {
													default: m(() => [b(x(w(i)("cssEditor.blankScheme")), 1)]),
													_: 1
												}),
												u(D, { value: "default" }, {
													default: m(() => [b(x(w(i)("cssEditor.basedClassic")), 1)]),
													_: 1
												}),
												u(D, { value: "grace" }, {
													default: m(() => [b(x(w(i)("cssEditor.basedGrace")), 1)]),
													_: 1
												}),
												u(D, { value: "simple" }, {
													default: m(() => [b(x(w(i)("cssEditor.basedSimple")), 1)]),
													_: 1
												})
											]),
											_: 1
										})]),
										_: 1
									}, 8, ["modelValue"]),
									f("p", Mt, x(w(i)("cssEditor.templateHint")), 1)
								])]),
								u(A, null, {
									default: m(() => [u(k, {
										variant: "outline",
										onClick: r[12] ||= (e) => K.value = !1
									}, {
										default: m(() => [b(x(w(i)("common.cancel")), 1)]),
										_: 1
									}), u(k, { onClick: r[13] ||= (e) => qe() }, {
										default: m(() => [b(x(w(i)("common.create")), 1)]),
										_: 1
									})]),
									_: 1
								})
							]),
							_: 1
						})]),
						_: 1
					}, 8, ["open"]),
					u(M, {
						open: w(z),
						"onUpdate:open": r[17] ||= (e) => v(z) ? z.value = e : null
					}, {
						default: m(() => [u(j, { class: "sm:max-w-[425px]" }, {
							default: m(() => [
								u(C, null, {
									default: m(() => [u(p, null, {
										default: m(() => [b(x(w(i)("cssEditor.editSchemeTitle")), 1)]),
										_: 1
									}), u(g, null, {
										default: m(() => [b(x(w(i)("cssEditor.editSchemeDescription")), 1)]),
										_: 1
									})]),
									_: 1
								}),
								u(T, {
									modelValue: w(B),
									"onUpdate:modelValue": r[15] ||= (e) => v(B) ? B.value = e : null,
									onKeyup: h(W, ["enter"])
								}, null, 8, ["modelValue"]),
								u(A, null, {
									default: m(() => [u(k, {
										variant: "outline",
										onClick: r[16] ||= (e) => z.value = !1
									}, {
										default: m(() => [b(x(w(i)("common.cancel")), 1)]),
										_: 1
									}), u(k, { onClick: W }, {
										default: m(() => [b(x(w(i)("common.save")), 1)]),
										_: 1
									})]),
									_: 1
								})
							]),
							_: 1
						})]),
						_: 1
					}, 8, ["open"]),
					u(M, {
						open: w(q),
						"onUpdate:open": r[19] ||= (e) => v(q) ? q.value = e : null
					}, {
						default: m(() => [u(j, { class: "sm:max-w-[425px]" }, {
							default: m(() => [
								u(C, null, {
									default: m(() => [u(p, null, {
										default: m(() => [b(x(w(i)("cssEditor.tipsTitle")), 1)]),
										_: 1
									})]),
									_: 1
								}),
								f("div", Nt, [f("p", null, x(w(i)("cssEditor.editorHint")), 1)]),
								u(A, null, {
									default: m(() => [u(k, { onClick: r[18] ||= (e) => q.value = !1 }, {
										default: m(() => [b(x(w(i)("common.close")), 1)]),
										_: 1
									})]),
									_: 1
								})
							]),
							_: 1
						})]),
						_: 1
					}, 8, ["open"])
				], 6), [[ne, !w(P) || w(E).isShowCssEditor]]),
				u(M, {
					open: w(X),
					"onUpdate:open": r[22] ||= (e) => v(X) ? X.value = e : null
				}, {
					default: m(() => [u(j, { class: "sm:max-w-4xl max-h-[90vh] flex flex-col" }, {
						default: m(() => [
							u(C, null, {
								default: m(() => [u(p, null, {
									default: m(() => [b(x(w(i)("cssEditor.viewBuiltinTitle")), 1)]),
									_: 1
								}), u(g, null, {
									default: m(() => [b(x(w(i)("cssEditor.viewBuiltinDescription")), 1)]),
									_: 1
								})]),
								_: 1
							}),
							f("div", Pt, [f("div", Ft, [f("label", It, x(w(i)("cssEditor.selectTheme")), 1), u(O, {
								modelValue: w(Z),
								"onUpdate:modelValue": r[20] ||= (e) => v(Z) ? Z.value = e : null
							}, {
								default: m(() => [u(ue, { class: "w-full mt-2 sm:w-[200px] focus-visible:ring-0 focus-visible:ring-offset-0" }, {
									default: m(() => [u(le, { placeholder: w(i)("cssEditor.selectThemePlaceholder") }, null, 8, ["placeholder"])]),
									_: 1
								}), u(de, null, {
									default: m(() => [
										u(D, { value: "default" }, {
											default: m(() => [b(x(w(Ue)(w(i), "default")), 1)]),
											_: 1
										}),
										u(D, { value: "grace" }, {
											default: m(() => [b(x(w(Ue)(w(i), "grace")), 1)]),
											_: 1
										}),
										u(D, { value: "simple" }, {
											default: m(() => [b(x(w(Ue)(w(i), "simple")), 1)]),
											_: 1
										})
									]),
									_: 1
								})]),
								_: 1
							}, 8, ["modelValue"])]), f("div", Lt, [f("pre", Rt, [f("code", {
								class: "hljs",
								innerHTML: w(Bt)
							}, null, 8, zt)])])]),
							u(A, { class: "flex-col sm:flex-row gap-2" }, {
								default: m(() => [
									u(k, {
										variant: "outline",
										onClick: r[21] ||= (e) => X.value = !1
									}, {
										default: m(() => [b(x(w(i)("common.close")), 1)]),
										_: 1
									}),
									u(k, {
										variant: "outline",
										onClick: $t
									}, {
										default: m(() => [b(x(w(i)("cssEditor.copyAll")), 1)]),
										_: 1
									}),
									u(k, {
										variant: "outline",
										onClick: en
									}, {
										default: m(() => [b(x(w(i)("cssEditor.createFromTheme")), 1)]),
										_: 1
									})
								]),
								_: 1
							})
						]),
						_: 1
					})]),
					_: 1
				}, 8, ["open"])
			], 64);
		};
	}
}), [["__scopeId", "data-v-253dbc8c"]]);
export { Bt as default };
