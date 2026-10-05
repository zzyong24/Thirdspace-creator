import { t as e } from "./graphlib-TuBEVTtx.js";
import { t } from "./chunk-X3CZISLH-CyeAZ9SC.js";
import { g as n } from "./chunk-ZIGJFQKS-B1q1oAt1.js";
import { n as r } from "./chunk-Y2CYZVJY-BAmSaPLl.js";
import { b as i, x as a } from "./chunk-O7XYJQB3-CuTSgmsg.js";
import { o } from "./chunk-7INBJB4K-CUqQ2Lhw.js";
import { i as s, n as c, r as l, t as u } from "./chunk-5DYCD2WN-H1yJbv79.js";
import { a as d, c as f, i as p, n as m, r as h, t as g, u as _ } from "./chunk-Z7XXMR3K-BQOjLvhe.js";
import { r as v, t as y } from "./chunk-UA2S7LBM-CkbQfO34.js";
function b(e, { edgePathsClass: t = "edges edgePaths" } = {}) {
	let n = e.insert("g").attr("class", "root");
	return {
		clusters: n.insert("g").attr("class", "clusters"),
		edgePaths: n.insert("g").attr("class", t),
		edgeLabels: n.insert("g").attr("class", "edgeLabels"),
		nodes: n.insert("g").attr("class", "nodes"),
		rootGroups: n
	};
}
r(b, "createLayoutElementGroups");
async function x(e, t, n) {
	if (t.label) {
		let { shapeSvg: r, bbox: i } = await o(e, n === void 0 ? t : {
			...t,
			width: n
		});
		t.labelBBox = {
			width: i.width,
			height: i.height
		}, r.remove();
	} else t.labelBBox = {
		width: 0,
		height: 0
	};
}
r(x, "measureGroupLabel");
async function S(e, t, n) {
	let r = await l(e, t, n), i = r.node()?.getBBox() ?? {
		width: 0,
		height: 0
	};
	return t.width = i.width, t.height = i.height, r;
}
r(S, "insertMeasuredNode");
function C(e, t, n) {
	let r = e, i = /* @__PURE__ */ new Set();
	for (; r;) {
		if (r.dir) return r.dir;
		if (!r.parentId || i.has(r.parentId)) break;
		i.add(r.parentId), r = t.get(r.parentId);
	}
	return n;
}
r(C, "resolveNodeDir");
async function w(t, n, r = {}) {
	let i = new e({
		multigraph: !0,
		compound: !0
	}), o = [...n.edges], s = a(), c = b(t), { edgeLabels: l, nodes: u } = c, f = /* @__PURE__ */ new Map(), p = new Map(n.nodes.map((e) => [e.id, e])), m = n.direction, g = t.node() != null;
	await Promise.all(n.nodes.map(async (e) => {
		if (e.isGroup) {
			if (g) {
				let t = r.unwrapGroupLabels && e.labelType !== "markdown";
				await x(u, e, t ? Infinity : void 0);
			}
			i.setNode(e.id, { ...e });
		} else {
			if (g) {
				let t = await S(u, e, {
					config: s,
					dir: C(e, p, m)
				});
				f.set(e.id, t);
			}
			i.setNode(e.id, { ...e });
		}
	}));
	for (let e of o) g && h(e) && await d(l, e), i.setEdge(e.start, e.end, { ...e }, e.id), n.edges.some((t) => t.id === e.id) || n.edges.push(e);
	if (globalThis.mermaidCaptureSizes) {
		let { captureNodeSizes: e } = await import("./sizeCapture-INFHLROL-DrR9NkPf.js");
		e(t, n);
	}
	return {
		graph: i,
		groups: c,
		nodeElements: f
	};
}
r(w, "createGraphWithElements");
var T = /* @__PURE__ */ new Map(), E = /* @__PURE__ */ new Map(), D = /* @__PURE__ */ new Map(), O = /* @__PURE__ */ r(() => {
	E.clear(), D.clear(), T.clear();
}, "clear"), k = /* @__PURE__ */ r((e, n) => {
	let r = E.get(n) || [];
	return t.trace("In isDescendant", n, " ", e, " = ", r.includes(e)), r.includes(e);
}, "isDescendant"), A = /* @__PURE__ */ r((e, n) => {
	let r = E.get(n) || [];
	return t.info("Descendants of ", n, " is ", r), t.info("Edge is ", e), e.v === n || e.w === n ? !1 : r ? r.includes(e.v) || k(e.v, n) || k(e.w, n) || r.includes(e.w) : (t.debug("Tilt, ", n, ",not in descendants"), !1);
}, "edgeInCluster"), j = /* @__PURE__ */ r((e, n, r, i) => {
	t.debug("Copying children of ", e, "root", i, "data", n.node(e), i);
	let a = n.children(e) || [];
	e !== i && a.push(e), t.debug("Copying (nodes) clusterId", e, "nodes", a), a.forEach((a) => {
		if (n.children(a).length > 0) j(a, n, r, i);
		else {
			let o = n.node(a);
			t.info("cp ", a, " to ", i, " with parent ", e), r.setNode(a, o), i !== n.parent(a) && (t.debug("Setting parent", a, n.parent(a)), r.setParent(a, n.parent(a))), e !== i && a !== e ? (t.debug("Setting parent", a, e), r.setParent(a, e)) : (t.info("In copy ", e, "root", i, "data", n.node(e), i), t.debug("Not Setting parent for node=", a, "cluster!==rootId", e !== i, "node!==clusterId", a !== e));
			let s = n.edges(a);
			t.debug("Copying Edges", s), s.forEach((a) => {
				t.info("Edge", a);
				let o = n.edge(a.v, a.w, a.name);
				t.info("Edge data", o, i);
				try {
					A(a, i) ? (t.info("Copying as ", a.v, a.w, o, a.name), r.setEdge(a.v, a.w, o, a.name), t.info("newGraph edges ", r.edges(), r.edge(r.edges()[0]))) : t.info("Skipping copy of edge ", a.v, "-->", a.w, " rootId: ", i, " clusterId:", e);
				} catch (e) {
					t.error(e);
				}
			});
		}
		t.debug("Removing node", a), n.removeNode(a);
	});
}, "copy"), M = /* @__PURE__ */ r((e, t) => {
	let n = t.children(e), r = [...n];
	for (let i of n) D.set(i, e), r = [...r, ...M(i, t)];
	return r;
}, "extractDescendants"), N = /* @__PURE__ */ r((e, t, n) => {
	let r = e.edges().filter((e) => e.v === t || e.w === t), i = e.edges().filter((e) => e.v === n || e.w === n), a = r.map((e) => ({
		v: e.v === t ? n : e.v,
		w: e.w === t ? t : e.w
	})), o = i.map((e) => ({
		v: e.v,
		w: e.w
	}));
	return a.filter((e) => o.some((t) => e.v === t.v && e.w === t.w));
}, "findCommonEdges"), P = /* @__PURE__ */ r((e, n, r) => {
	let i = n.children(e);
	if (t.trace("Searching children of id ", e, i), i.length < 1) return e;
	let a;
	for (let e of i) {
		let t = P(e, n, r), i = N(n, r, t);
		if (t) {
			if (i.length > 0) a = t;
			else return t;
		}
	}
	return a;
}, "findNonClusterChild"), F = /* @__PURE__ */ r((e) => !T.has(e) || !T.get(e).externalConnections ? e : T.has(e) ? T.get(e).id : e, "getAnchorId"), I = /* @__PURE__ */ r((e, n) => {
	if (!e || n > 10) {
		t.debug("Opting out, no graph ");
		return;
	}
	t.debug("Opting in, graph "), e.nodes().forEach(function(n) {
		e.children(n).length > 0 && (t.debug("Cluster identified", n, " Replacement id in edges: ", P(n, e, n)), E.set(n, M(n, e)), T.set(n, {
			id: P(n, e, n),
			clusterData: e.node(n)
		}));
	}), e.nodes().forEach(function(n) {
		let r = e.children(n), i = e.edges();
		r.length > 0 ? (t.debug("Cluster identified", n, E), i.forEach((e) => {
			k(e.v, n) ^ k(e.w, n) && (t.debug("Edge: ", e, " leaves cluster ", n), t.debug("Descendants of XXX ", n, ": ", E.get(n)), T.get(n).externalConnections = !0);
		})) : t.debug("Not a cluster ", n, E);
	});
	for (let t of T.keys()) {
		let n = T.get(t).id, r = e.parent(n);
		r !== t && T.has(r) && !T.get(r).externalConnections && (T.get(t).id = r);
		let i = e.edges().some((e) => e.v === t);
		if (n && T.get(t)?.externalConnections && i && B(e, n, t)) {
			let r = V(e, t, e.parent(n));
			r && (T.get(t).id = r);
		}
	}
	e.edges().forEach(function(n) {
		let r = e.edge(n);
		t.debug("Edge " + n.v + " -> " + n.w + ": " + JSON.stringify(n)), t.debug("Edge " + n.v + " -> " + n.w + ": " + JSON.stringify(e.edge(n)));
		let i = n.v, a = n.w;
		if (t.debug("Fix XXX", T, "ids:", n.v, n.w, "Translating: ", T.get(n.v), " --- ", T.get(n.w)), T.get(n.v) || T.get(n.w)) {
			if (t.debug("Fixing and trying - removing XXX", n.v, n.w, n.name), i = F(n.v), a = F(n.w), e.removeEdge(n.v, n.w, n.name), i !== n.v) {
				let t = e.parent(i);
				T.get(t).externalConnections = !0, r.fromCluster = n.v;
			}
			if (a !== n.w) {
				let t = e.parent(a);
				T.get(t).externalConnections = !0, r.toCluster = n.w;
			}
			t.debug("Fix Replacing with XXX", i, a, n.name), e.setEdge(i, a, r, n.name);
		}
	}), L(e, 0), t.trace(T);
}, "adjustClustersAndEdges"), L = /* @__PURE__ */ r((n, r) => {
	if (r > 10) {
		t.error("Bailing out");
		return;
	}
	let i = n.nodes(), a = !1;
	for (let e of i) {
		let t = n.children(e);
		a ||= t.length > 0;
	}
	if (!a) {
		t.debug("Done, no node has children", n.nodes());
		return;
	}
	t.debug("Nodes = ", i, r);
	for (let a of i) if (t.debug("Extracting node", a, T, T.has(a) && !T.get(a).externalConnections, !n.parent(a), n.node(a), n.children("D"), " Depth ", r), !T.has(a)) t.debug("Not a cluster", a, r);
	else if (!T.get(a).externalConnections && n.children(a) && n.children(a).length > 0) {
		t.debug("Cluster without external connections, without a parent and with children", a, r);
		let i = n.graph().rankdir === "TB" ? "LR" : "TB";
		T.get(a)?.clusterData?.dir && (i = T.get(a).clusterData.dir, t.debug("Fixing dir", T.get(a).clusterData.dir, i));
		let o = new e({
			multigraph: !0,
			compound: !0
		}).setGraph({
			rankdir: i,
			nodesep: 50,
			ranksep: 50,
			marginx: 8,
			marginy: 8
		}).setDefaultEdgeLabel(function() {
			return {};
		});
		j(a, n, o, a), n.setNode(a, {
			clusterNode: !0,
			id: a,
			clusterData: T.get(a).clusterData,
			label: T.get(a).label,
			graph: o
		});
	} else t.debug("Cluster ** ", a, " **not meeting the criteria !externalConnections:", !T.get(a).externalConnections, " no parent: ", !n.parent(a), " children ", n.children(a) && n.children(a).length > 0, n.children("D"), r), t.debug(T);
	i = n.nodes(), t.debug("New list of nodes", i);
	for (let e of i) {
		let i = n.node(e);
		t.debug(" Now next level", e, i), i?.clusterNode && L(i.graph, r + 1);
	}
}, "extractor"), R = /* @__PURE__ */ r((e, t) => {
	if (t.length === 0) return [];
	let n = Object.assign([], t);
	return t.forEach((t) => {
		let r = R(e, e.children(t));
		n = [...n, ...r];
	}), n;
}, "sorter"), z = /* @__PURE__ */ r((e) => R(e, e.children()), "sortNodesByHierarchy"), B = /* @__PURE__ */ r((e, t, n) => {
	let r = e.parent(t);
	for (; r && r !== n;) {
		let t = T.get(r);
		if (t && !t.externalConnections) return !0;
		r = e.parent(r);
	}
	return !1;
}, "isNodeInExtractableCluster"), V = /* @__PURE__ */ r((e, t, n) => {
	let r = e.children(t) ?? [];
	for (let i of r) {
		if (i === n || k(i, n)) continue;
		let r = P(i, e, t);
		if (r && !B(e, r, t)) return r;
	}
	return null;
}, "findSafeAnchorNode");
function H({ prepareLayout: e, measureLayout: t, runLayoutCore: n, paintLayout: i, afterPaint: a, paintOptions: o }) {
	let s = t ?? W;
	return /* @__PURE__ */ r(async function(t, r, c, l) {
		let u = r.select("g");
		(c?.insertMarkers ?? f)(u, t.markers, t.type, t.diagramId), U();
		let d = {
			element: u,
			helpers: c,
			options: l
		};
		d.preparedLayout = await e?.(t, d);
		let p = await s(t, d), m = await n(t, d), h = {
			...d,
			measure: p
		};
		i ? await i(t, h, m) : await G(t, h, o), await a?.(t, h, m);
	}, "render");
}
r(H, "createCommonLayoutRenderer");
function U() {
	u(), g(), y(), O();
}
r(U, "clearLayoutRenderState");
async function W(e, { element: t }, n) {
	return await w(t, e, n);
}
r(W, "defaultMeasureLayout");
async function G(e, t, n = {}) {
	let { measure: r } = t, { groups: i } = r;
	for (let r of n.getNodes?.(e, t) ?? e.nodes) n.skipNode?.(r, t) || await K(i, r, t, n);
	let a = J(e.nodes);
	for (let r of e.edges) Y(r, n) || await X(i, r, a, e, n, t);
}
r(G, "paintLayoutData");
async function K(e, t, n, r) {
	t.clusterNode ? s(t) : q(t, n, r) ? await v(e.clusters, t) : s(t);
}
r(K, "paintLayoutNode");
function q(e, t, n) {
	return e.isGroup === !0 && (n.isCluster?.(e, t) ?? !0);
}
r(q, "shouldPaintAsCluster");
function J(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) n?.id && t.set(n.id, n);
	return t;
}
r(J, "buildNodeLookup");
function Y(e, t) {
	return e.isLayoutOnly || !!t.skipEdge?.(e);
}
r(Y, "shouldSkipPaintEdge");
async function X(e, t, n, r, i, a) {
	let o = p(e.edgePaths, { ...t }, i.clusterDb ?? /* @__PURE__ */ new Map(), r.type, Z(t.start, t, n, a, i), Z(t.end, t, n, a, i), r.diagramId, Q(t, i));
	h(t) && (m.has(t.id) || await d(e.edgeLabels, t), $(t, o));
}
r(X, "paintLayoutEdge");
function Z(e, t, n, r, i) {
	return i.getEdgeNode?.(e, t, r) ?? (e ? n.get(e) ?? {} : {});
}
r(Z, "getRenderedNode");
function Q(e, t) {
	return typeof t.skipIntersect == "function" ? t.skipIntersect(e) : t.skipIntersect ?? !1;
}
r(Q, "shouldSkipIntersect");
function $(e, r) {
	let a = r?.updatedPath ?? r?.originalPath, o = i(), { subGraphTitleTotalMargin: s } = c({ flowchart: o.flowchart ?? {} });
	if (e.label) {
		let i = m.get(e.id), o = e.x, c = e.y;
		if (a) {
			let i = n.calcLabelPosition(a);
			t.debug("Moving label " + e.label + " from (", o, ",", c, ") to (", i.x, ",", i.y, ") abc88"), r?.updatedPath && (o = i.x, c = i.y);
		}
		i.attr("transform", `translate(${o}, ${c + s / 2})`);
	}
	if (e?.startLabelLeft) {
		let t = _.get(e.id).startLeft, r = e?.x, i = e?.y;
		if (a) {
			let t = n.calcTerminalLabelPosition(e.arrowTypeStart ? 10 : 0, "start_left", a);
			r = t.x, i = t.y;
		}
		t.attr("transform", `translate(${r}, ${i})`);
	}
	if (e.startLabelRight) {
		let t = _.get(e.id).startRight, r = e.x, i = e.y;
		if (a) {
			let t = n.calcTerminalLabelPosition(e.arrowTypeStart ? 10 : 0, "start_right", a);
			r = t.x, i = t.y;
		}
		t.attr("transform", `translate(${r}, ${i})`);
	}
	if (e.endLabelLeft) {
		let t = _.get(e.id).endLeft, r = e.x, i = e.y;
		if (a) {
			let t = n.calcTerminalLabelPosition(e.arrowTypeEnd ? 10 : 0, "end_left", a);
			r = t.x, i = t.y;
		}
		t.attr("transform", `translate(${r}, ${i})`);
	}
	if (e.endLabelRight) {
		let t = _.get(e.id).endRight, r = e.x, i = e.y;
		if (a) {
			let t = n.calcTerminalLabelPosition(e.arrowTypeEnd ? 10 : 0, "end_right", a);
			r = t.x, i = t.y;
		}
		t.attr("transform", `translate(${r}, ${i})`);
	}
}
r($, "positionRenderedEdgeLabel");
export { W as a, z as c, b as i, T as n, P as o, H as r, S as s, I as t };
