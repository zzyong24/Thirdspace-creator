import { n as e } from "./rolldown-runtime-WOOOH1Hs.js";
import { dt as t, mt as n, n as r } from "./vendor_vue-OlfIOlFg.js";
import { r as i } from "./native-host-BoAU4GnD.js";
import { n as a } from "./translate-CUv9RhnO.js";
import { n as o } from "./lib-DIiEqr8B.js";
var s = /* @__PURE__ */ e({ useEditorStore: () => c }), c = r("editor", () => {
	let e = i(), r = () => !e || e.live && !e.signal.aborted, s = t(null), c = null;
	function l(e) {
		c = e;
	}
	function u() {
		c = null;
	}
	function d() {
		c?.();
	}
	return {
		editor: s,
		registerContentFlush: l,
		unregisterContentFlush: u,
		flushContentToPostStore: d,
		formatContent: async () => {
			if (!s.value) return;
			let e = n(s.value), t = e.state.doc.toString(), { formatDoc: i } = await import("./formatDoc-BDYZgvY1.js");
			if (!r()) return;
			let a = await i(t);
			if (r() && s.value === e && e.state.doc.toString() === t) return e.dispatch({ changes: {
				from: 0,
				to: s.value.state.doc.length,
				insert: a
			} }), a;
		},
		importContent: (e) => {
			s.value && s.value.dispatch({ changes: {
				from: 0,
				to: s.value.state.doc.length,
				insert: e
			} });
		},
		clearContent: () => {
			s.value && (s.value.dispatch({ changes: {
				from: 0,
				to: s.value.state.doc.length,
				insert: ""
			} }), o.success(a("store.editor.contentCleared")));
		},
		getContent: () => s.value?.state.doc.toString() ?? "",
		getSelection: () => {
			if (!s.value) return "";
			let e = s.value.state.selection.main;
			return s.value.state.doc.sliceString(e.from, e.to);
		},
		replaceSelection: (e) => {
			s.value && s.value.dispatch(s.value.state.replaceSelection(e));
		},
		replaceText: (e, t) => {
			if (!s.value || !e) return !1;
			let n = s.value.state.doc.toString(), r = s.value.state.selection.main.head, i = -1, a = Infinity, o = 0;
			for (;;) {
				let t = n.indexOf(e, o);
				if (t === -1) break;
				let s = Math.abs(t - r);
				s < a && (a = s, i = t), o = t + 1;
			}
			return i !== -1 && (s.value.dispatch({ changes: {
				from: i,
				to: i + e.length,
				insert: t
			} }), s.value.focus(), !0);
		},
		insertAtCursor: (e) => {
			if (!s.value) return;
			let t = s.value.state.selection.main;
			s.value.dispatch({
				changes: {
					from: t.from,
					to: t.to,
					insert: e
				},
				selection: { anchor: t.from + e.length }
			}), s.value.focus();
		}
	};
});
export { c as n, s as t };
