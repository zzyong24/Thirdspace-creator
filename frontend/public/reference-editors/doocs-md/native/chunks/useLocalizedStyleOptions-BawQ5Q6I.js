import { y as e } from "./vendor_vue-OlfIOlFg.js";
import { k as t } from "./render-C0-GwsvR.js";
import { C as n, E as r, S as i, b as a, f as o, h as s, m as c, p as l, v as u, w as d, x as f, y as p } from "./storage-jiCkQUgy.js";
import { n as m } from "./vue-i18n-8AnKzzG6.js";
import { n as h } from "./marketplace-Bd_SEvWI.js";
var g = [
	"sansSerif",
	"serif",
	"monospace"
], _ = [
	"smaller",
	"slightlySmaller",
	"recommended",
	"slightlyLarger",
	"larger"
], v = [
	"tight",
	"slightlyTight",
	"recommended",
	"slightlyLoose",
	"loose"
], y = [
	"wechatBlue",
	"primary",
	"body"
], b = [
	"theme",
	"none",
	"primary"
], x = [
	"classicBlue",
	"emeraldGreen",
	"vividOrange",
	"lemonYellow",
	"lavenderPurple",
	"skyBlue",
	"roseGold",
	"oliveGreen",
	"graphiteBlack",
	"mistGray",
	"sakuraPink"
], S = [
	"titleAlt",
	"altTitle",
	"titleOnly",
	"altOnly",
	"filename",
	"none"
], C = {
	default: "default",
	"color-only": "colorOnly",
	"border-bottom": "borderBottom",
	"border-left": "borderLeft",
	custom: "custom"
};
function w(e) {
	return r.map((t) => {
		let n = t.desc ? e(`styleOptions.theme.${t.value}.desc`) : t.desc;
		return {
			...t,
			label: e(`styleOptions.theme.${t.value}.label`),
			desc: n
		};
	});
}
function T(e) {
	return u.map((t, n) => ({
		...t,
		label: e(`styleOptions.fontFamily.${g[n]}.label`),
		desc: e(`styleOptions.fontFamily.${g[n]}.desc`)
	}));
}
function E(e) {
	return p.map((t, n) => ({
		...t,
		desc: e(`styleOptions.fontSize.${_[n]}`)
	}));
}
function D(e) {
	return n.map((t, n) => ({
		...t,
		desc: e(`styleOptions.lineHeight.${v[n]}`)
	}));
}
function O(e) {
	return o.map((t, n) => ({
		...t,
		desc: e(`styleOptions.blockSpacing.${v[n]}`)
	}));
}
function k(e) {
	return d.map((t, n) => ({
		...t,
		label: e(`styleOptions.linkColor.${y[n]}.label`),
		desc: e(`styleOptions.linkColor.${y[n]}.desc`)
	}));
}
function A(e) {
	return l.map((t, n) => ({
		...t,
		label: e(`styleOptions.blockquoteBackground.${b[n]}.label`),
		desc: e(`styleOptions.blockquoteBackground.${b[n]}.desc`)
	}));
}
function j(e) {
	return s.map((t, n) => ({
		...t,
		label: e(`styleOptions.color.${x[n]}.label`),
		desc: e(`styleOptions.color.${x[n]}.desc`)
	}));
}
function M(e) {
	return a.map((t) => ({
		...t,
		label: e(`styleOptions.headingLevel.${t.value}`)
	}));
}
function N(e) {
	return f.map((t) => {
		let n = C[t.value] ?? t.value;
		return {
			...t,
			label: e(`styleOptions.headingStyle.${n}`)
		};
	});
}
function P(e) {
	return i.map((t, n) => ({
		...t,
		label: e(`styleOptions.legend.${S[n]}`)
	}));
}
function F(e, n, r) {
	return t(n) ? r || n : e(`styleOptions.theme.${n}.label`);
}
function I(e, t = []) {
	return {
		themeOptions: [...w(e), ...t],
		fontFamilyOptions: T(e),
		fontSizeOptions: E(e),
		lineHeightOptions: D(e),
		blockSpacingOptions: O(e),
		linkColorOptions: k(e),
		blockquoteBackgroundOptions: A(e),
		colorOptions: j(e),
		codeBlockThemeOptions: c,
		headingLevelOptions: M(e),
		headingStyleOptions: N(e),
		legendOptions: P(e),
		getThemeLabel: (n) => F(e, n, t.find((e) => e.value === n)?.label)
	};
}
function L() {
	let { t, locale: n } = m(), r = h();
	return e(() => {
		n.value, r.installedThemes;
		let e = r.getInstalledThemeOptions();
		return I(t, e);
	});
}
export { F as n, L as r, I as t };
