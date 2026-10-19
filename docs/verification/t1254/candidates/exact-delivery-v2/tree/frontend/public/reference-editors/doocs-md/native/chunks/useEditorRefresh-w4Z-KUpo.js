import { B as e } from "./vendor_vue-OlfIOlFg.js";
import { r as t } from "./native-host-BoAU4GnD.js";
import { n, t as r } from "./render-BKss5lW7.js";
import { n as i } from "./editor-VmYacIt-.js";
var a = 300, o = 800;
function s(s) {
	let c = t(), l = n(), u = i(), d = r(), f = s?.debounceMs ?? a, p = s?.maxWaitMs ?? o, m, h;
	function g() {
		m &&= (clearTimeout(m), void 0), h &&= (clearTimeout(h), void 0);
	}
	function _(e) {
		if (c && (!c.live || c.signal.aborted)) return;
		l.updateCodeTheme();
		let t = u.getContent();
		d.render(t, e);
	}
	function v() {
		g(), _();
	}
	function y() {
		m && clearTimeout(m), m = setTimeout(() => {
			m = void 0, h &&= (clearTimeout(h), void 0), _();
		}, f), h ||= setTimeout(() => {
			h = void 0, m &&= (clearTimeout(m), void 0), _();
		}, p);
	}
	return e(() => {
		(m || h) && (g(), _());
	}), {
		editorRefresh: _,
		scheduleEditorRefresh: y,
		flushScheduledRefresh: v
	};
}
export { s as t };
