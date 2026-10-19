import { dt as e, y as t } from "./vendor_vue-OlfIOlFg.js";
import { r as n } from "./vendor_vueuse-DbHwQsn4.js";
function r() {
	let r = e();
	return {
		primitiveElement: r,
		currentElement: t(() => ["#text", "#comment"].includes(r.value?.$el.nodeName) ? r.value?.$el.nextElementSibling : n(r))
	};
}
export { r as t };
