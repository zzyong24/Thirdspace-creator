import { Z as e, at as t, ct as n, dt as r, mt as i, rt as a } from "./vendor_vue-OlfIOlFg.js";
import { t as o } from "./v4-vx8gRFYx.js";
import { n as s } from "./translate-CUv9RhnO.js";
import { n as c } from "./lib-DIiEqr8B.js";
var l = "MD", u = typeof navigator < "u" && /Mac/i.test(navigator.userAgent), ee = "Mod", te = u ? "⌘" : "Ctrl", ne = u ? "⌥" : "Alt", re = u ? "⇧" : "Shift", ie = [
	{
		level: 1,
		label: "标题 1"
	},
	{
		level: 2,
		label: "标题 2"
	},
	{
		level: 3,
		label: "标题 3"
	},
	{
		level: 4,
		label: "标题 4"
	},
	{
		level: 5,
		label: "标题 5"
	},
	{
		level: 6,
		label: "标题 6"
	}
], d = [
	{
		label: "经典",
		value: "default",
		desc: ""
	},
	{
		label: "优雅",
		value: "grace",
		desc: "@brzhang"
	},
	{
		label: "简洁",
		value: "simple",
		desc: "@okooo5km"
	}
], f = [
	{
		label: "无衬线",
		value: "-apple-system-font,BlinkMacSystemFont, Helvetica Neue, PingFang SC, Hiragino Sans GB , Microsoft YaHei UI , Microsoft YaHei ,Arial,sans-serif",
		desc: "字体123Abc"
	},
	{
		label: "衬线",
		value: "Optima-Regular, Optima, PingFangSC-light, PingFangTC-light, 'PingFang SC', Cambria, Cochin, Georgia, Times, 'Times New Roman', serif",
		desc: "字体123Abc"
	},
	{
		label: "等宽",
		value: "Menlo, Monaco, 'Courier New', monospace",
		desc: "字体123Abc"
	}
], ae = [
	{
		label: "14px",
		value: "14px",
		desc: "更小"
	},
	{
		label: "15px",
		value: "15px",
		desc: "稍小"
	},
	{
		label: "16px",
		value: "16px",
		desc: "推荐"
	},
	{
		label: "17px",
		value: "17px",
		desc: "稍大"
	},
	{
		label: "18px",
		value: "18px",
		desc: "更大"
	}
], oe = [
	{
		label: "1.5",
		value: "1.5",
		desc: "紧凑"
	},
	{
		label: "1.65",
		value: "1.65",
		desc: "稍紧"
	},
	{
		label: "1.75",
		value: "1.75",
		desc: "推荐"
	},
	{
		label: "1.9",
		value: "1.9",
		desc: "稍松"
	},
	{
		label: "2.05",
		value: "2.05",
		desc: "宽松"
	}
], se = [
	{
		label: "0.75×",
		value: "0.75",
		desc: "紧凑"
	},
	{
		label: "0.9×",
		value: "0.9",
		desc: "稍紧"
	},
	{
		label: "1×",
		value: "1",
		desc: "推荐"
	},
	{
		label: "1.15×",
		value: "1.15",
		desc: "稍松"
	},
	{
		label: "1.35×",
		value: "1.35",
		desc: "宽松"
	}
], ce = [
	{
		label: "微信蓝",
		value: "#576b95",
		desc: "默认"
	},
	{
		label: "主题色",
		value: "var(--md-primary-color)",
		desc: "跟随主题色"
	},
	{
		label: "正文色",
		value: "inherit",
		desc: "与正文一致"
	}
], le = [
	{
		label: "跟随主题",
		value: "default",
		desc: "默认"
	},
	{
		label: "无背景",
		value: "transparent",
		desc: "透明"
	},
	{
		label: "主题色",
		value: "color-mix(in srgb, var(--md-primary-color) 8%, transparent)",
		desc: "主题色浅底"
	}
], ue = [
	{
		label: "经典蓝",
		value: "#0F4C81",
		desc: "稳重冷静"
	},
	{
		label: "翡翠绿",
		value: "#009874",
		desc: "自然平衡"
	},
	{
		label: "活力橘",
		value: "#FA5151",
		desc: "热情活力"
	},
	{
		label: "柠檬黄",
		value: "#FECE00",
		desc: "明亮温暖"
	},
	{
		label: "薰衣紫",
		value: "#92617E",
		desc: "优雅神秘"
	},
	{
		label: "天空蓝",
		value: "#55C9EA",
		desc: "清爽自由"
	},
	{
		label: "玫瑰金",
		value: "#B76E79",
		desc: "奢华现代"
	},
	{
		label: "橄榄绿",
		value: "#556B2F",
		desc: "沉稳自然"
	},
	{
		label: "石墨黑",
		value: "#333333",
		desc: "内敛极简"
	},
	{
		label: "雾烟灰",
		value: "#A9A9A9",
		desc: "柔和低调"
	},
	{
		label: "樱花粉",
		value: "#FFB7C5",
		desc: "浪漫甜美"
	}
], de = [{
	label: "移动端",
	value: "w-[375px]",
	desc: "固定"
}, {
	label: "电脑端",
	value: "w-full",
	desc: "适应"
}], fe = "https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/npm/highlightjs/11.11.1/styles/", pe = (/* @__PURE__ */ "1c-light.a11y-dark.a11y-light.agate.an-old-hope.androidstudio.arduino-light.arta.ascetic.atom-one-dark-reasonable.atom-one-dark.atom-one-light.brown-paper.codepen-embed.color-brewer.dark.default.devibeans.docco.far.felipec.foundation.github-dark-dimmed.github-dark.github.gml.googlecode.gradient-dark.gradient-light.grayscale.hybrid.idea.intellij-light.ir-black.isbl-editor-dark.isbl-editor-light.kimbie-dark.kimbie-light.lightfair.lioshi.magula.mono-blue.monokai-sublime.monokai.night-owl.nnfx-dark.nnfx-light.nord.obsidian.panda-syntax-dark.panda-syntax-light.paraiso-dark.paraiso-light.pojoaque.purebasic.qtcreator-dark.qtcreator-light.rainbow.routeros.school-book.shades-of-purple.srcery.stackoverflow-dark.stackoverflow-light.sunburst.tokyo-night-dark.tokyo-night-light.tomorrow-night-blue.tomorrow-night-bright.vs.vs2015.xcode.xt256".split(".")).map((e) => ({
	label: e,
	value: `${fe}${e}.min.css`,
	desc: ""
})), me = [
	{
		label: "一级标题",
		value: "h1",
		desc: ""
	},
	{
		label: "二级标题",
		value: "h2",
		desc: ""
	},
	{
		label: "三级标题",
		value: "h3",
		desc: ""
	},
	{
		label: "四级标题",
		value: "h4",
		desc: ""
	},
	{
		label: "五级标题",
		value: "h5",
		desc: ""
	},
	{
		label: "六级标题",
		value: "h6",
		desc: ""
	}
], he = [
	{
		label: "默认",
		value: "default",
		desc: ""
	},
	{
		label: "主题色文字",
		value: "color-only",
		desc: ""
	},
	{
		label: "下边框",
		value: "border-bottom",
		desc: ""
	},
	{
		label: "左边框",
		value: "border-left",
		desc: ""
	},
	{
		label: "自定义",
		value: "custom",
		desc: ""
	}
], ge = {}, _e = [
	{
		label: "title 优先",
		value: "title-alt",
		desc: ""
	},
	{
		label: "alt 优先",
		value: "alt-title",
		desc: ""
	},
	{
		label: "只显示 title",
		value: "title",
		desc: ""
	},
	{
		label: "只显示 alt",
		value: "alt",
		desc: ""
	},
	{
		label: "文件名",
		value: "filename",
		desc: ""
	},
	{
		label: "不显示",
		value: "none",
		desc: ""
	}
], p = {
	isCiteStatus: !1,
	isMacCodeBlock: !0,
	isShowLineNumber: !1,
	isCountStatus: !1,
	theme: d[0].value,
	fontFamily: f[0].value,
	fontSize: ae[2].value,
	lineHeight: oe[2].value,
	blockSpacing: se[2].value,
	primaryColor: ue[0].value,
	linkColor: ce[0].value,
	blockquoteBackground: le[0].value,
	codeBlockTheme: pe[23].value,
	legend: _e[3].value,
	headingStyles: ge
};
function ve() {
	return {
		primaryColor: p.primaryColor,
		fontFamily: p.fontFamily,
		fontSize: p.fontSize,
		lineHeight: p.lineHeight,
		blockSpacing: p.blockSpacing,
		linkColor: p.linkColor,
		blockquoteBackground: p.blockquoteBackground,
		codeBlockTheme: p.codeBlockTheme,
		headingStyles: { ...p.headingStyles },
		isShowLineNumber: p.isShowLineNumber,
		isMacCodeBlock: p.isMacCodeBlock
	};
}
function ye() {
	return o();
}
var m = (e, t) => t.some((t) => e instanceof t), be, xe;
function Se() {
	return be ||= [
		IDBDatabase,
		IDBObjectStore,
		IDBIndex,
		IDBCursor,
		IDBTransaction
	];
}
function Ce() {
	return xe ||= [
		IDBCursor.prototype.advance,
		IDBCursor.prototype.continue,
		IDBCursor.prototype.continuePrimaryKey
	];
}
var h = /* @__PURE__ */ new WeakMap(), g = /* @__PURE__ */ new WeakMap(), _ = /* @__PURE__ */ new WeakMap();
function we(e) {
	let t = new Promise((t, n) => {
		let r = () => {
			e.removeEventListener("success", i), e.removeEventListener("error", a);
		}, i = () => {
			t(b(e.result)), r();
		}, a = () => {
			n(e.error), r();
		};
		e.addEventListener("success", i), e.addEventListener("error", a);
	});
	return _.set(t, e), t;
}
function Te(e) {
	if (h.has(e)) return;
	let t = new Promise((t, n) => {
		let r = () => {
			e.removeEventListener("complete", i), e.removeEventListener("error", a), e.removeEventListener("abort", a);
		}, i = () => {
			t(), r();
		}, a = () => {
			n(e.error || new DOMException("AbortError", "AbortError")), r();
		};
		e.addEventListener("complete", i), e.addEventListener("error", a), e.addEventListener("abort", a);
	});
	h.set(e, t);
}
var v = {
	get(e, t, n) {
		if (e instanceof IDBTransaction) {
			if (t === "done") return h.get(e);
			if (t === "store") return n.objectStoreNames[1] ? void 0 : n.objectStore(n.objectStoreNames[0]);
		}
		return b(e[t]);
	},
	set(e, t, n) {
		return e[t] = n, !0;
	},
	has(e, t) {
		return e instanceof IDBTransaction && (t === "done" || t === "store") || t in e;
	}
};
function y(e) {
	v = e(v);
}
function Ee(e) {
	return Ce().includes(e) ? function(...t) {
		return e.apply(x(this), t), b(this.request);
	} : function(...t) {
		return b(e.apply(x(this), t));
	};
}
function De(e) {
	return typeof e == "function" ? Ee(e) : (e instanceof IDBTransaction && Te(e), m(e, Se()) ? new Proxy(e, v) : e);
}
function b(e) {
	if (e instanceof IDBRequest) return we(e);
	if (g.has(e)) return g.get(e);
	let t = De(e);
	return t !== e && (g.set(e, t), _.set(t, e)), t;
}
var x = (e) => _.get(e);
function Oe(e, t, { blocked: n, upgrade: r, blocking: i, terminated: a } = {}) {
	let o = indexedDB.open(e, t), s = b(o);
	return r && o.addEventListener("upgradeneeded", (e) => {
		r(b(o.result), e.oldVersion, e.newVersion, b(o.transaction), e);
	}), n && o.addEventListener("blocked", (e) => n(e.oldVersion, e.newVersion, e)), s.then((e) => {
		a && e.addEventListener("close", () => a()), i && e.addEventListener("versionchange", (e) => i(e.oldVersion, e.newVersion, e));
	}).catch(() => {}), s;
}
var ke = [
	"get",
	"getKey",
	"getAll",
	"getAllKeys",
	"count"
], Ae = [
	"put",
	"add",
	"delete",
	"clear"
], S = /* @__PURE__ */ new Map();
function C(e, t) {
	if (!(e instanceof IDBDatabase && !(t in e) && typeof t == "string")) return;
	if (S.get(t)) return S.get(t);
	let n = t.replace(/FromIndex$/, ""), r = t !== n, i = Ae.includes(n);
	if (!(n in (r ? IDBIndex : IDBObjectStore).prototype) || !(i || ke.includes(n))) return;
	let a = async function(e, ...t) {
		let a = this.transaction(e, i ? "readwrite" : "readonly"), o = a.store;
		return r && (o = o.index(t.shift())), (await Promise.all([o[n](...t), i && a.done]))[0];
	};
	return S.set(t, a), a;
}
y((e) => ({
	...e,
	get: (t, n, r) => C(t, n) || e.get(t, n, r),
	has: (t, n) => !!C(t, n) || e.has(t, n)
}));
var je = [
	"continue",
	"continuePrimaryKey",
	"advance"
], w = {}, T = /* @__PURE__ */ new WeakMap(), E = /* @__PURE__ */ new WeakMap(), Me = { get(e, t) {
	if (!je.includes(t)) return e[t];
	let n = w[t];
	return n ||= w[t] = function(...e) {
		T.set(this, E.get(this)[t](...e));
	}, n;
} };
async function* Ne(...e) {
	let t = this;
	if (t instanceof IDBCursor || (t = await t.openCursor(...e)), !t) return;
	t = t;
	let n = new Proxy(t, Me);
	for (E.set(n, t), _.set(n, x(t)); t;) yield n, t = await (T.get(n) || t.continue()), T.delete(n);
}
function D(e, t) {
	return t === Symbol.asyncIterator && m(e, [
		IDBIndex,
		IDBObjectStore,
		IDBCursor
	]) || t === "iterate" && m(e, [IDBIndex, IDBObjectStore]);
}
y((e) => ({
	...e,
	get(t, n, r) {
		return D(t, n) ? Ne : e.get(t, n, r);
	},
	has(t, n) {
		return D(t, n) || e.has(t, n);
	}
}));
function O(e) {
	return `${l}__${e}`;
}
var Pe = "doocs-md", k = "documents", A = "settings", j = "secrets", M = "cache", N = "meta";
O("storage_migrated_v1"), O("storage_localstorage_cleaned_v1");
var Fe = O("emoji_packs");
`${l}`, O("current_post_id"), O("sort_mode");
var P = O("posts"), Ie = /* @__PURE__ */ new Set([
	"uploaded_image_map",
	"ai_generated_images",
	"ai_image_timestamps",
	"ai_image_prompts",
	"ai_memory_context",
	"ai_conversation_list"
]), Le = ["ai_conversation_"];
function Re(e) {
	return Ie.has(e) ? !0 : Le.some((t) => e.startsWith(t));
}
O("legacy_migrated"), O("theme"), O("themeSettings"), O("mp_profile_migrated");
var F = null;
async function ze(e, t, n, r) {
	if (t < 1) {
		if (!e.objectStoreNames.contains(k)) {
			let t = e.createObjectStore(k, { keyPath: "id" });
			t.createIndex("updateDatetime", "updateDatetime"), t.createIndex("parentId", "parentId");
		}
		e.objectStoreNames.contains(A) || e.createObjectStore(A, { keyPath: "key" }), e.objectStoreNames.contains(j) || e.createObjectStore(j, { keyPath: "key" }), e.objectStoreNames.contains(M) || e.createObjectStore(M, { keyPath: "key" }), e.objectStoreNames.contains(N) || e.createObjectStore(N, { keyPath: "key" });
	}
	if (t < 4 && e.objectStoreNames.contains(A) && await r.objectStore(A).delete(Fe), t < 4 && e.objectStoreNames.contains(M)) {
		let e = await r.objectStore(M).openCursor();
		for (; e;) {
			let t = e.value;
			typeof t?.key == "string" && t.key.startsWith("MD__emoji_blob:") && await e.delete(), e = await e.continue();
		}
	}
	t < 4 && e.objectStoreNames.contains("emoji") && e.deleteObjectStore("emoji");
}
function I() {
	return F ||= Oe(Pe, 4, { async upgrade(e, t, n, r) {
		await ze(e, t, n, r);
	} }), F;
}
var L = 0;
function R() {
	let e = Date.now();
	e - L < 5e3 || (L = e, c.warning(s("toast.storageQuota")));
}
function z(e) {
	return e instanceof DOMException ? e.name === "QuotaExceededError" || e.code === 22 : !1;
}
var B = class {
	supportsSyncRead() {
		return !0;
	}
	getSync(e) {
		try {
			return localStorage.getItem(e);
		} catch {
			return null;
		}
	}
	async get(e) {
		return this.getSync(e);
	}
	async set(e, t) {
		try {
			localStorage.setItem(e, t);
		} catch (e) {
			throw z(e) && R(), e;
		}
	}
	async remove(e) {
		localStorage.removeItem(e);
	}
	async has(e) {
		return localStorage.getItem(e) !== null;
	}
	async clear() {
		localStorage.clear();
	}
	async keys() {
		return Object.keys(localStorage);
	}
}, Be = class {
	volatile = !0;
	values = /* @__PURE__ */ new Map();
	supportsSyncRead() {
		return !0;
	}
	getSync(e) {
		return this.values.get(e) ?? null;
	}
	async get(e) {
		return this.getSync(e);
	}
	async set(e, t) {
		this.values.set(e, t);
	}
	async remove(e) {
		this.values.delete(e);
	}
	async has(e) {
		return this.values.has(e);
	}
	async clear() {
		this.values.clear();
	}
	async keys() {
		return [...this.values.keys()];
	}
};
function Ve(e, t) {
	try {
		let n = JSON.parse(e), r = Object.keys(n);
		if (r.length <= t) return e;
		let i = r.slice(-t).reduce((e, t) => (e[t] = n[t], e), {});
		return JSON.stringify(i);
	} catch {
		return e;
	}
}
function He(e, t) {
	try {
		let n = JSON.parse(e);
		return !Array.isArray(n) || n.length <= t ? e : JSON.stringify(n.slice(-t));
	} catch {
		return e;
	}
}
function Ue(e, t) {
	return e === "uploaded_image_map" ? Ve(t, 500) : e === "ai_generated_images" || e === "ai_image_timestamps" || e === "ai_image_prompts" ? He(t, 50) : t;
}
var V = new class o {
	engine = new B();
	setEngine(e) {
		this.pendingWrites.clear(), this.engine = e;
	}
	getEngine() {
		return this.engine;
	}
	pendingWrites = /* @__PURE__ */ new Map();
	static PAGEHIDE_BACKUP_KEY = "MD__pending_writes_backup";
	getSync(e) {
		let t = this.pendingWrites.get(e);
		return t === void 0 ? this.engine.getSync || this.engine instanceof B ? this.engine.getSync(e) : null : t;
	}
	supportsSyncRead() {
		return this.engine.supportsSyncRead?.() ?? !1;
	}
	async get(e) {
		let t = this.pendingWrites.get(e);
		return t === void 0 ? this.engine.get(e) : t;
	}
	async set(e, t) {
		return this.pendingWrites.delete(e), this.writeToEngine(e, t);
	}
	writeToEngine(e, t) {
		let n = Re(e) ? Ue(e, t) : t;
		return this.engine.set(e, n);
	}
	refreshPagehideBackup() {
		if (!this.engine.volatile && typeof localStorage < "u") try {
			if (this.pendingWrites.size === 0) {
				localStorage.removeItem(o.PAGEHIDE_BACKUP_KEY);
				return;
			}
			localStorage.setItem(o.PAGEHIDE_BACKUP_KEY, JSON.stringify(Object.fromEntries(this.pendingWrites)));
		} catch {}
	}
	async restorePendingWrites() {
		if (typeof localStorage > "u") return;
		let e = localStorage.getItem(o.PAGEHIDE_BACKUP_KEY);
		if (!e) return;
		localStorage.removeItem(o.PAGEHIDE_BACKUP_KEY);
		let t;
		try {
			t = JSON.parse(e);
		} catch {
			return;
		}
		for (let [e, n] of Object.entries(t)) try {
			await this.writeToEngine(e, n);
		} catch (t) {
			console.error("[Storage] Failed to restore pending write:", e, t);
		}
	}
	async getJSON(e, t) {
		let n = this.pendingWrites.get(e), r = n === void 0 ? await this.engine.get(e) : n;
		if (!r) return t ?? null;
		try {
			return JSON.parse(r);
		} catch (n) {
			return console.error("[Storage] Failed to parse JSON for key:", e, n), t ?? null;
		}
	}
	async setJSON(e, t) {
		try {
			let n = JSON.stringify(t);
			return this.set(e, n);
		} catch (t) {
			throw console.error("[Storage] Failed to stringify JSON for key:", e, t), t;
		}
	}
	async remove(e) {
		return this.pendingWrites.delete(e), this.engine.remove(e);
	}
	async has(e) {
		return this.pendingWrites.has(e) ? !0 : this.engine.has(e);
	}
	async clear() {
		return this.pendingWrites.clear(), this.engine.clear();
	}
	async keys() {
		return this.engine.keys();
	}
	reactive(a, o) {
		let s = typeof o == "string", c = o;
		if (this.supportsSyncRead()) try {
			let e = this.getSync(a);
			e !== null && (c = s ? e : this.parseJSON(e, o));
		} catch (e) {
			console.error("[Storage] Failed to read initial value:", a, e);
		}
		else if (this.engine instanceof B) try {
			let e = this.engine.getSync(a);
			e !== null && (c = s ? e : this.parseJSON(e, o));
		} catch (e) {
			console.error("[Storage] Failed to read initial value:", a, e);
		}
		let l = r(c);
		!this.supportsSyncRead() && !(this.engine instanceof B) && (s ? this.get(a).then((e) => e === null ? null : e) : this.getJSON(a, o)).then((e) => {
			e !== null && (l.value = e);
		});
		{
			let r = null, o = () => {
				r &&= (clearTimeout(r), null);
				let e = this.pendingWrites.get(a);
				e !== void 0 && this.writeToEngine(a, e).then(() => {
					this.pendingWrites.get(a) === e && this.pendingWrites.delete(a), this.refreshPagehideBackup();
				}).catch((e) => {
					z(e) && R(), console.error("[Storage] Failed to save reactive data:", a, e);
				});
			}, c = e(l, () => {
				try {
					let e = s ? l.value : JSON.stringify(i(l.value));
					this.pendingWrites.set(a, e), r && clearTimeout(r), r = setTimeout(o, 300);
				} catch (e) {
					console.error("[Storage] Failed to stringify reactive data:", a, e);
				}
			}, { deep: !0 });
			t() && n(() => {
				c(), r && clearTimeout(r);
			}), !this.engine.volatile && typeof window < "u" && window.addEventListener("pagehide", () => {
				o(), this.refreshPagehideBackup();
			});
		}
		return l;
	}
	customReactive(e, t, n) {
		let r = t;
		return this.getJSON(e, t).then((e) => {
			let i = e ?? t;
			r = n?.get ? n.get(i) : i;
		}), a((t, i) => ({
			get() {
				return t(), r;
			},
			set: (t) => {
				let a = n?.set ? n.set(t) : t;
				r = a, i(), this.setJSON(e, a).catch((t) => {
					z(t) && R(), console.error("[Storage] Failed to save custom reactive data:", e, t);
				});
			}
		}));
	}
	parseJSON(e, t) {
		try {
			return JSON.parse(e);
		} catch {
			return console.warn("[Storage] Failed to parse JSON, using fallback"), t;
		}
	}
}();
function We(e = /* @__PURE__ */ new Date()) {
	return e.getTime();
}
function Ge(e) {
	if (e == null) return null;
	if (typeof e == "number") return Number.isFinite(e) ? e : null;
	let t = e instanceof Date ? e.getTime() : new Date(e).getTime();
	return Number.isFinite(t) ? t : null;
}
function Ke(e) {
	return Ge(e) ?? e;
}
function H(e) {
	return (e ?? []).map(({ datetime: e, content: t }) => ({
		datetime: Ke(e),
		content: String(t)
	}));
}
var U = O("documents_pagehide_backup"), qe = 0;
function Je() {
	return qe += 1, `${qe}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function W(e) {
	let t = e instanceof Date ? e.getTime() : NaN;
	return Number.isFinite(t) ? t : -Infinity;
}
function Ye(e) {
	if (!e || typeof e != "object") return !1;
	let t = e;
	return typeof t.id == "string" && t.id.length > 0;
}
function Xe(e) {
	return !!e && typeof e == "object" && typeof e.token == "string" && Array.isArray(e.posts);
}
function Ze(e) {
	return {
		id: e.id,
		title: e.title,
		content: e.content,
		createDatetime: new Date(e.createDatetime).toISOString(),
		updateDatetime: new Date(e.updateDatetime).toISOString(),
		parentId: e.parentId ?? null,
		collapsed: e.collapsed
	};
}
function Qe(e) {
	return {
		id: e.id,
		title: e.title ?? "",
		content: e.content ?? "",
		history: [],
		createDatetime: new Date(e.createDatetime),
		updateDatetime: new Date(e.updateDatetime),
		parentId: e.parentId ?? null,
		collapsed: e.collapsed
	};
}
function $e(e) {
	return e.history.length > 0 ? e.history : [{
		datetime: W(e.updateDatetime),
		content: e.content
	}];
}
function et(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let t of e) t.id && n.set(t.id, t);
	let r = [];
	for (let e of t) {
		if (!e.id) continue;
		let t = n.get(e.id);
		if (!t) {
			let t = {
				...e,
				history: H($e(e))
			};
			n.set(e.id, t), r.push(t);
			continue;
		}
		W(e.updateDatetime) <= W(t.updateDatetime) || n.set(e.id, {
			...t,
			title: e.title,
			content: e.content,
			updateDatetime: e.updateDatetime,
			parentId: e.parentId ?? null,
			collapsed: e.collapsed
		});
	}
	let i = /* @__PURE__ */ new Set(), a = [];
	for (let t of e) {
		let e = n.get(t.id);
		e && !i.has(t.id) && (a.push(e), i.add(t.id));
	}
	for (let e of r) i.has(e.id) || (a.push(e), i.add(e.id));
	return a;
}
function tt(e) {
	if (!e) return null;
	try {
		let t = JSON.parse(e), n = Xe(t) ? t.token : null, r = Array.isArray(t) ? t : Xe(t) ? t.posts : null;
		if (!r?.length) return null;
		let i = r.filter(Ye).map(Qe);
		return i.length === 0 ? null : {
			token: n,
			posts: i
		};
	} catch {
		return null;
	}
}
function nt(e) {
	let t = null;
	for (let n of e) n.id && (!t || W(n.updateDatetime) >= W(t.updateDatetime)) && (t = n);
	return t;
}
function rt(e) {
	let t = Je();
	if (typeof localStorage > "u" || e.length === 0) return t;
	let n = [e], r = nt(e);
	r && e.length > 1 && n.push([r]);
	for (let e of n) try {
		let n = {
			token: t,
			posts: e.map(Ze)
		};
		return localStorage.setItem(U, JSON.stringify(n)), t;
	} catch {}
	return t;
}
function it() {
	if (typeof localStorage > "u") return null;
	try {
		return tt(localStorage.getItem(U));
	} catch {
		return null;
	}
}
function G(e) {
	if (typeof localStorage < "u") try {
		if (e !== void 0) {
			let t = tt(localStorage.getItem(U));
			if (!t || t.token !== e) return;
		}
		localStorage.removeItem(U);
	} catch {}
}
function at(e) {
	return {
		id: e.id,
		title: e.title,
		content: e.content,
		history: H(e.history),
		createDatetime: new Date(e.createDatetime).toISOString(),
		updateDatetime: new Date(e.updateDatetime).toISOString(),
		parentId: e.parentId ?? null,
		collapsed: e.collapsed
	};
}
function ot(e) {
	return {
		id: e.id,
		title: e.title,
		content: e.content,
		history: H(e.history),
		createDatetime: new Date(e.createDatetime),
		updateDatetime: new Date(e.updateDatetime),
		parentId: e.parentId ?? null,
		collapsed: e.collapsed
	};
}
var K = null, q = !1, J = !1, Y = [], X = Promise.resolve();
function st(e) {
	q = e;
}
function ct(e) {
	J = e, Y = [], K = null;
}
function lt() {
	return J;
}
function ut() {
	return K;
}
function Z(e) {
	let t = X.then(e, e);
	return X = t.then(() => {}, () => {}), t;
}
async function dt() {
	let e = await V.get(P);
	if (!e) return [];
	try {
		let t = JSON.parse(e);
		return Array.isArray(t) ? t.map((e, t) => ({
			...e,
			createDatetime: new Date(e.createDatetime ?? Date.now() + t),
			updateDatetime: new Date(e.updateDatetime ?? Date.now() + t),
			history: H(e.history)
		})) : [];
	} catch {
		return [];
	}
}
async function Q(e) {
	await V.setJSON(P, e), K = [...e];
}
async function ft(e) {
	let t = await I(), n = await t.getAllKeys(k), r = new Set(e.map((e) => e.id)), i = t.transaction(k, "readwrite");
	await Promise.all([...e.map((e) => i.store.put(at(e))), ...n.filter((e) => !r.has(String(e))).map((e) => i.store.delete(e))]), await i.done, K = [...e];
}
async function pt(e) {
	if (await (await I()).put(k, at(e)), K) {
		let t = K.findIndex((t) => t.id === e.id);
		t === -1 ? K.push(e) : K[t] = e;
	}
}
async function mt() {
	return J ? Y : q ? dt() : (await (await I()).getAll(k)).map(ot);
}
async function ht(e) {
	let t = [];
	try {
		t = await mt();
	} catch (t) {
		return console.error("[documentRepo] Failed to read posts before restoring backup:", t), K = e.posts, e.posts;
	}
	let n = et(t, e.posts);
	try {
		q ? await Q(n) : await ft(n), e.token ? G(e.token) : G();
	} catch (e) {
		console.error("[documentRepo] Failed to restore pagehide backup:", e), K = n;
	}
	return n;
}
var $ = {
	async whenIdle() {
		await X;
	},
	async loadAll() {
		if (K) return K;
		if (J) return K = [...Y], K;
		let e = it();
		return e ? (K = await ht(e), K) : q ? (K = await dt(), K) : (K = (await (await I()).getAll(k)).map(ot), K);
	},
	async savePost(e) {
		return Z(async () => {
			try {
				if (J) {
					let t = K ?? [], n = t.findIndex((t) => t.id === e.id);
					n < 0 ? t.push(e) : t[n] = e, Y = [...t], K = t;
					return;
				}
				if (q) {
					let t = K ?? await this.loadAll(), n = t.findIndex((t) => t.id === e.id);
					n === -1 ? t.push(e) : t[n] = e, await Q(t);
					return;
				}
				await pt(e);
			} catch (e) {
				throw z(e) && R(), console.error("[documentRepo] savePost failed:", e), e;
			}
		});
	},
	async saveAll(e) {
		return Z(async () => {
			try {
				if (J) {
					Y = [...e], K = Y;
					return;
				}
				if (q) {
					await Q(e);
					return;
				}
				await ft(e);
			} catch (e) {
				throw z(e) && R(), console.error("[documentRepo] saveAll failed:", e), e;
			}
		});
	},
	async deletePost(e) {
		return Z(async () => {
			if (J) {
				Y = (K ?? Y).filter((t) => t.id !== e), K = Y;
				return;
			}
			if (q) {
				await Q((K ?? await this.loadAll()).filter((t) => t.id !== e));
				return;
			}
			await (await I()).delete(k, e), K &&= K.filter((t) => t.id !== e);
		});
	},
	async clear() {
		return Z(async () => {
			if (J) {
				Y = [], K = [];
				return;
			}
			if (q) {
				await V.remove(P), K = [];
				return;
			}
			await (await I()).clear(k), K = [];
		});
	}
};
async function gt() {
	st(!1), ct(!0), V.setEngine(new Be()), await V.clear(), await $.loadAll(), Promise.resolve();
}
export { ie as A, oe as C, ne as D, d as E, ee as O, _e as S, de as T, p as _, G as a, me as b, We as c, ye as d, se as f, ve as g, ue as h, lt as i, re as j, te as k, V as l, pe as m, $ as n, rt as o, le as p, ut as r, H as s, gt as t, O as u, f as v, ce as w, he as x, ae as y };
