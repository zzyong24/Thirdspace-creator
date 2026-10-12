import "./rolldown-runtime-WOOOH1Hs.js";
import { a as e, c as t, d as n, f as r, h as i, l as a, m as o, n as s, o as c, p as l, r as u, s as d, t as f, u as ee } from "./SignatureV4MultiRegion-DnNN33PO.js";
import { i as p, n as m, r as te, t as ne } from "./hex-encoding-BZxwfeJD.js";
var re = {
	WHEN_SUPPORTED: "WHEN_SUPPORTED",
	WHEN_REQUIRED: "WHEN_REQUIRED"
}, ie = re.WHEN_SUPPORTED, ae = {
	WHEN_SUPPORTED: "WHEN_SUPPORTED",
	WHEN_REQUIRED: "WHEN_REQUIRED"
}, oe = re.WHEN_SUPPORTED, h;
(function(e) {
	e.MD5 = "MD5", e.CRC32 = "CRC32", e.CRC32C = "CRC32C", e.CRC64NVME = "CRC64NVME", e.SHA1 = "SHA1", e.SHA256 = "SHA256";
})(h ||= {});
var se;
(function(e) {
	e.HEADER = "header", e.TRAILER = "trailer";
})(se ||= {});
var ce = h.CRC32;
function le(e, t, n) {
	return e.$source ||= {}, e.$source[t] = n, e;
}
var ue = (e) => e?.body instanceof ReadableStream, de = (e, t) => {
	let n = [];
	if (e && n.push(e), t) for (let e of t) n.push(e);
	return n;
}, fe = (e, t) => `${e || "anonymous"}${t && t.length > 0 ? ` (a.k.a. ${t.join(",")})` : ""}`, pe = () => {
	let e = [], t = [], n = !1, r = /* @__PURE__ */ new Set(), i = (e) => e.sort((e, t) => me[t.step] - me[e.step] || he[t.priority || "normal"] - he[e.priority || "normal"]), a = (n) => {
		let i = !1, a = (e) => {
			let t = de(e.name, e.aliases);
			if (t.includes(n)) {
				i = !0;
				for (let e of t) r.delete(e);
				return !1;
			}
			return !0;
		};
		return e = e.filter(a), t = t.filter(a), i;
	}, o = (n) => {
		let i = !1, a = (e) => {
			if (e.middleware === n) {
				i = !0;
				for (let t of de(e.name, e.aliases)) r.delete(t);
				return !1;
			}
			return !0;
		};
		return e = e.filter(a), t = t.filter(a), i;
	}, s = (n) => (e.forEach((e) => {
		n.add(e.middleware, { ...e });
	}), t.forEach((e) => {
		n.addRelativeTo(e.middleware, { ...e });
	}), n.identifyOnResolve?.(u.identifyOnResolve()), n), c = (e) => {
		let t = [];
		return e.before.forEach((e) => {
			e.before.length === 0 && e.after.length === 0 ? t.push(e) : t.push(...c(e));
		}), t.push(e), e.after.reverse().forEach((e) => {
			e.before.length === 0 && e.after.length === 0 ? t.push(e) : t.push(...c(e));
		}), t;
	}, l = (n = !1) => {
		let r = [], a = [], o = {};
		return e.forEach((e) => {
			let t = {
				...e,
				before: [],
				after: []
			};
			for (let e of de(t.name, t.aliases)) o[e] = t;
			r.push(t);
		}), t.forEach((e) => {
			let t = {
				...e,
				before: [],
				after: []
			};
			for (let e of de(t.name, t.aliases)) o[e] = t;
			a.push(t);
		}), a.forEach((e) => {
			if (e.toMiddleware) {
				let t = o[e.toMiddleware];
				if (t === void 0) {
					if (n) return;
					throw Error(`${e.toMiddleware} is not found when adding ${fe(e.name, e.aliases)} middleware ${e.relation} ${e.toMiddleware}`);
				}
				e.relation === "after" && t.after.push(e), e.relation === "before" && t.before.push(e);
			}
		}), i(r).map(c).reduce((e, t) => (e.push(...t), e), []);
	}, u = {
		add: (t, n = {}) => {
			let { name: i, override: a, aliases: o } = n, s = {
				step: "initialize",
				priority: "normal",
				middleware: t,
				...n
			}, c = de(i, o);
			if (c.length > 0) {
				if (c.some((e) => r.has(e))) {
					if (!a) throw Error(`Duplicate middleware name '${fe(i, o)}'`);
					for (let t of c) {
						let n = e.findIndex((e) => e.name === t || e.aliases?.some((e) => e === t));
						if (n === -1) continue;
						let r = e[n];
						if (r.step !== s.step || s.priority !== r.priority) throw Error(`"${fe(r.name, r.aliases)}" middleware with ${r.priority} priority in ${r.step} step cannot be overridden by "${fe(i, o)}" middleware with ${s.priority} priority in ${s.step} step.`);
						e.splice(n, 1);
					}
				}
				for (let e of c) r.add(e);
			}
			e.push(s);
		},
		addRelativeTo: (e, n) => {
			let { name: i, override: a, aliases: o } = n, s = {
				middleware: e,
				...n
			}, c = de(i, o);
			if (c.length > 0) {
				if (c.some((e) => r.has(e))) {
					if (!a) throw Error(`Duplicate middleware name '${fe(i, o)}'`);
					for (let e of c) {
						let n = t.findIndex((t) => t.name === e || t.aliases?.some((t) => t === e));
						if (n === -1) continue;
						let r = t[n];
						if (r.toMiddleware !== s.toMiddleware || r.relation !== s.relation) throw Error(`"${fe(r.name, r.aliases)}" middleware ${r.relation} "${r.toMiddleware}" middleware cannot be overridden by "${fe(i, o)}" middleware ${s.relation} "${s.toMiddleware}" middleware.`);
						t.splice(n, 1);
					}
				}
				for (let e of c) r.add(e);
			}
			t.push(s);
		},
		clone: () => s(pe()),
		use: (e) => {
			e.applyToStack(u);
		},
		remove: (e) => typeof e == "string" ? a(e) : o(e),
		removeByTag: (n) => {
			let i = !1, a = (e) => {
				let { tags: t, name: a, aliases: o } = e;
				if (t && t.includes(n)) {
					let e = de(a, o);
					for (let t of e) r.delete(t);
					return i = !0, !1;
				}
				return !0;
			};
			return e = e.filter(a), t = t.filter(a), i;
		},
		concat: (e) => {
			let t = s(pe());
			return t.use(e), t.identifyOnResolve(n || t.identifyOnResolve() || (e.identifyOnResolve?.() ?? !1)), t;
		},
		applyToStack: s,
		identify: () => l(!0).map((e) => {
			let t = e.step ?? e.relation + " " + e.toMiddleware;
			return fe(e.name, e.aliases) + " - " + t;
		}),
		identifyOnResolve(e) {
			return typeof e == "boolean" && (n = e), n;
		},
		resolve: (e, t) => {
			for (let n of l().map((e) => e.middleware).reverse()) e = n(e, t);
			return n && console.log(u.identify()), e;
		}
	};
	return u;
}, me = {
	initialize: 5,
	serialize: 4,
	build: 3,
	finalizeRequest: 2,
	deserialize: 1
}, he = {
	high: 3,
	normal: 2,
	low: 1
}, ge;
(function(e) {
	e.HTTP = "http", e.HTTPS = "https";
})(ge ||= {});
var _e;
(function(e) {
	e.MD5 = "md5", e.CRC32 = "crc32", e.CRC32C = "crc32c", e.SHA1 = "sha1", e.SHA256 = "sha256";
})(_e ||= {});
var ve = class {
	statusCode;
	reason;
	headers;
	body;
	constructor(e) {
		this.statusCode = e.statusCode, this.reason = e.reason, this.headers = e.headers || {}, this.body = e.body;
	}
	static isInstance(e) {
		if (!e) return !1;
		let t = e;
		return typeof t.statusCode == "number" && typeof t.headers == "object";
	}
}, ye = /* @__PURE__ */ RegExp("^(?!.*-$)(?!-)[a-zA-Z0-9-]{1,63}$"), be = (e, t = !1) => {
	if (!t) return ye.test(e);
	let n = e.split(".");
	for (let e of n) if (!be(e)) return !1;
	return !0;
};
function xe(e) {
	return /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(e);
}
var Se = (e) => () => Promise.reject(e), Ce = () => {
	let e = /* @__PURE__ */ new WeakSet();
	return (t, n) => {
		if (typeof n == "object" && n) {
			if (e.has(n)) return "[Circular]";
			e.add(n);
		}
		return n;
	};
}, we = (e) => new Promise((t) => setTimeout(t, e * 1e3)), Te = {
	minDelay: 2,
	maxDelay: 120
}, Ee;
(function(e) {
	e.ABORTED = "ABORTED", e.FAILURE = "FAILURE", e.SUCCESS = "SUCCESS", e.RETRY = "RETRY", e.TIMEOUT = "TIMEOUT";
})(Ee ||= {});
var De = (e) => {
	if (e.state === Ee.ABORTED) {
		let t = /* @__PURE__ */ Error(`${JSON.stringify({
			...e,
			reason: "Request was aborted"
		}, Ce())}`);
		throw t.name = "AbortError", t;
	}
	if (e.state === Ee.TIMEOUT) {
		let t = /* @__PURE__ */ Error(`${JSON.stringify({
			...e,
			reason: "Waiter has timed out"
		}, Ce())}`);
		throw t.name = "TimeoutError", t;
	}
	if (e.state !== Ee.SUCCESS) throw Error(`${JSON.stringify(e, Ce())}`);
	return e;
}, Oe = async ({ minDelay: e, maxDelay: t, maxWaitTime: n, abortController: r, client: i, abortSignal: a }, o, s) => {
	let c = {}, [l, u] = [e * 1e3, t * 1e3], d = 0, f = Date.now() + n * 1e3, ee = Date.now() + 6e4, p = !1;
	for (;;) {
		if (d > 0) {
			let e = je(l, u, d, f);
			if (r?.signal?.aborted || a?.aborted) {
				let e = "AbortController signal aborted.";
				return c[e] |= 0, c[e] += 1, {
					state: Ee.ABORTED,
					observedResponses: c
				};
			}
			if (Date.now() + e > f) return {
				state: Ee.TIMEOUT,
				observedResponses: c
			};
			await we(e / 1e3);
		}
		let { state: e, reason: t } = await s(i, o);
		if (t) {
			let e = Ae(t);
			c[e] |= 0, c[e] += 1;
		}
		if (e !== Ee.RETRY) return {
			state: e,
			reason: t,
			final: t,
			observedResponses: c
		};
		d += 1, !p && Date.now() >= ee && (ke(c, i), p = !0);
	}
}, ke = (e = {}, t) => {
	let n = Object.keys(e), r = 0, i = 0;
	for (let t of n) {
		let n = e[t] | 0;
		r = Math.max(n, r), t.startsWith("403:") && (i += n);
	}
	let a = t?.config?.logger, o = typeof a?.warn == "function" && !a.constructor?.name?.includes?.("NoOpLogger") ? a : console;
	(i >= 3 || n[n.length - 1]?.startsWith("403:")) && o.warn("@smithy/util-waiter WARN - 403 status code encountered during waiter polling.");
}, Ae = (e) => {
	let t = e?.$response?.statusCode ?? e?.$metadata?.httpStatusCode;
	return e?.$responseBodyText ? `${t ? t + ": " : ""}Deserialization error for body: ${e.$responseBodyText}` : t ? e?.$response || e?.message ? `${t ?? "Unknown"}: ${e?.message}` : `${t}: OK` : String(e?.message ?? JSON.stringify(e, Ce()) ?? "Unknown");
}, je = (e, t, n, r) => {
	if (n > Math.log(t / e) / Math.log(2) + 1) return t;
	let i = e * 2 ** (n - 1), a = Me(e, Math.min(i, t));
	if (Date.now() + a > r) {
		let e = r - Date.now();
		return Math.max(0, e - 500);
	}
	return a;
}, Me = (e, t) => e + Math.random() * (t - e), Ne = (e) => {
	if (e.maxWaitTime <= 0) throw Error("WaiterConfiguration.maxWaitTime must be greater than 0");
	if (e.minDelay <= 0) throw Error("WaiterConfiguration.minDelay must be greater than 0");
	if (e.maxDelay <= 0) throw Error("WaiterConfiguration.maxDelay must be greater than 0");
	if (e.maxWaitTime <= e.minDelay) throw Error(`WaiterConfiguration.maxWaitTime [${e.maxWaitTime}] must be greater than WaiterConfiguration.minDelay [${e.minDelay}] for this waiter`);
	if (e.maxDelay < e.minDelay) throw Error(`WaiterConfiguration.maxDelay [${e.maxDelay}] must be greater than WaiterConfiguration.minDelay [${e.minDelay}] for this waiter`);
}, Pe = (e) => {
	let t;
	return {
		clearListener() {
			typeof e.removeEventListener == "function" && e.removeEventListener("abort", t);
		},
		aborted: new Promise((n) => {
			t = () => n({ state: Ee.ABORTED }), typeof e.addEventListener == "function" ? e.addEventListener("abort", t) : e.onabort = t;
		})
	};
}, Fe = async (e, t, n) => {
	let r = {
		...Te,
		...e
	};
	Ne(r);
	let i = [Oe(r, t, n)], a = [];
	if (e.abortSignal) {
		let { aborted: t, clearListener: n } = Pe(e.abortSignal);
		a.push(n), i.push(t);
	}
	if (e.abortController?.signal) {
		let { aborted: t, clearListener: n } = Pe(e.abortController.signal);
		a.push(n), i.push(t);
	}
	return Promise.race(i).then((e) => {
		for (let e of a) e();
		return e;
	});
}, Ie = class {
	config;
	middlewareStack = pe();
	initConfig;
	handlers;
	constructor(e) {
		this.config = e;
		let { protocol: t, protocolSettings: n } = e;
		n && typeof t == "function" && (e.protocol = new t(n));
	}
	send(e, t, n) {
		let r = typeof t == "function" ? void 0 : t, i = typeof t == "function" ? t : n, a = r === void 0 && this.config.cacheMiddleware === !0, o;
		if (a) {
			this.handlers ||= /* @__PURE__ */ new WeakMap();
			let t = this.handlers;
			t.has(e.constructor) ? o = t.get(e.constructor) : (o = e.resolveMiddleware(this.middlewareStack, this.config, r), t.set(e.constructor, o));
		} else delete this.handlers, o = e.resolveMiddleware(this.middlewareStack, this.config, r);
		if (i) o(e).then((e) => i(null, e.output), (e) => i(e)).catch(() => {});
		else return o(e).then((e) => e.output);
	}
	destroy() {
		this.config?.requestHandler?.destroy?.(), delete this.handlers;
	}
}, Le = (e) => typeof e == "function" ? e() : e, Re = (e, t, n, r, i) => ({
	name: t,
	namespace: e,
	traits: n,
	input: r,
	output: i
}), ze = (e) => (t, n) => async (r) => {
	let { response: i } = await t(r), { operationSchema: a } = o(n), [, s, c, l, u, d] = a ?? [];
	try {
		return {
			response: i,
			output: await e.protocol.deserializeResponse(Re(s, c, l, u, d), {
				...e,
				...n
			}, i)
		};
	} catch (e) {
		if (Object.defineProperty(e, "$response", {
			value: i,
			enumerable: !1,
			writable: !1,
			configurable: !1
		}), !("$metadata" in e)) {
			let t = "Deserialization error: to see the raw response, inspect the hidden field {error}.$response on this object.";
			try {
				e.message += "\n  " + t;
			} catch {
				!n.logger || n.logger?.constructor?.name === "NoOpLogger" ? console.warn(t) : n.logger?.warn?.(t);
			}
			e.$responseBodyText !== void 0 && e.$response && (e.$response.body = e.$responseBodyText);
			try {
				if (ve.isInstance(i)) {
					let { headers: t = {}, statusCode: n } = i, r = Object.entries(t);
					e.$metadata = {
						httpStatusCode: n,
						requestId: Be(/^x-[\w-]+-request-?id$/, r),
						extendedRequestId: Be(/^x-[\w-]+-id-2$/, r),
						cfId: Be(/^x-[\w-]+-cf-id$/, r)
					};
				}
			} catch {}
		}
		throw e;
	}
}, Be = (e, t) => (t.find(([t]) => t.match(e)) || [void 0, void 0])[1], Ve = (e) => (t, n) => async (r) => {
	let { operationSchema: i } = o(n), [, a, s, c, l, u] = i ?? [], d = n.endpointV2 ? async () => ee(n.endpointV2) : e.endpoint, f = await e.protocol.serializeRequest(Re(a, s, c, l, u), r.input, {
		...e,
		...n,
		endpoint: d
	});
	return t({
		...r,
		request: f
	});
}, He = {
	name: "deserializerMiddleware",
	step: "deserialize",
	tags: ["DESERIALIZER"],
	override: !0
}, Ue = {
	name: "serializerMiddleware",
	step: "serialize",
	tags: ["SERIALIZER"],
	override: !0
};
function We(e) {
	return { applyToStack: (t) => {
		t.add(Ve(e), Ue), t.add(ze(e), He), e.protocol.setSerdeContext(e);
	} };
}
var Ge = [];
function Ke(e) {
	if (typeof e == "object") return e;
	if (e |= 0, Ge[e]) return Ge[e];
	let t = {}, n = 0;
	for (let r of [
		"httpLabel",
		"idempotent",
		"idempotencyToken",
		"sensitive",
		"httpPayload",
		"httpResponseCode",
		"httpQueryParams"
	]) (e >> n++ & 1) == 1 && (t[r] = 1);
	return Ge[e] = t;
}
var qe = {
	it: Symbol.for("@smithy/nor-struct-it"),
	ns: Symbol.for("@smithy/ns")
}, Je = [], Ye = {}, Xe = class e {
	ref;
	memberName;
	static symbol = Symbol.for("@smithy/nor");
	symbol = e.symbol;
	name;
	schema;
	_isMemberSchema;
	traits;
	memberTraits;
	normalizedTraits;
	constructor(t, n) {
		this.ref = t, this.memberName = n;
		let r = [], i = t, a = t;
		for (this._isMemberSchema = !1; Qe(i);) r.push(i[1]), i = i[0], a = Le(i), this._isMemberSchema = !0;
		if (r.length > 0) {
			this.memberTraits = {};
			for (let e = r.length - 1; e >= 0; --e) {
				let t = r[e];
				Object.assign(this.memberTraits, Ke(t));
			}
		} else this.memberTraits = 0;
		if (a instanceof e) {
			let e = this.memberTraits;
			Object.assign(this, a), this.memberTraits = Object.assign({}, e, a.getMemberTraits(), this.getMemberTraits()), this.normalizedTraits = void 0, this.memberName = n ?? a.memberName;
			return;
		}
		if (this.schema = Le(a), $e(this.schema) ? (this.name = `${this.schema[1]}#${this.schema[2]}`, this.traits = this.schema[3]) : (this.name = this.memberName ?? String(a), this.traits = 0), this._isMemberSchema && !n) throw Error(`@smithy/core/schema - NormalizedSchema member init ${this.getName(!0)} missing member name.`);
	}
	static [Symbol.hasInstance](e) {
		let t = this.prototype.isPrototypeOf(e);
		return !t && typeof e == "object" && e ? e.symbol === this.symbol : t;
	}
	static of(t) {
		let n = typeof t == "function" || typeof t == "object" && !!t;
		if (typeof t == "number") {
			if (Je[t]) return Je[t];
		} else if (typeof t == "string") {
			if (Ye[t]) return Ye[t];
		} else if (n && t[qe.ns]) return t[qe.ns];
		let r = Le(t);
		if (r instanceof e) return r;
		if (Qe(r)) {
			let [n, i] = r;
			if (n instanceof e) return Object.assign(n.getMergedTraits(), Ke(i)), n;
			throw Error(`@smithy/core/schema - may not init unwrapped member schema=${JSON.stringify(t, null, 2)}.`);
		}
		let i = new e(r);
		return n ? t[qe.ns] = i : typeof r == "string" ? Ye[r] = i : typeof r == "number" ? Je[r] = i : i;
	}
	getSchema() {
		let e = this.schema;
		return Array.isArray(e) && e[0] === 0 ? e[4] : e;
	}
	getName(e = !1) {
		let { name: t } = this;
		return !e && t && t.includes("#") ? t.split("#")[1] : t || void 0;
	}
	getMemberName() {
		return this.memberName;
	}
	isMemberSchema() {
		return this._isMemberSchema;
	}
	isListSchema() {
		let e = this.getSchema();
		return typeof e == "number" ? e >= 64 && e < 128 : e[0] === 1;
	}
	isMapSchema() {
		let e = this.getSchema();
		return typeof e == "number" ? e >= 128 && e <= 255 : e[0] === 2;
	}
	isStructSchema() {
		let e = this.getSchema();
		if (typeof e != "object") return !1;
		let t = e[0];
		return t === 3 || t === -3 || t === 4;
	}
	isUnionSchema() {
		let e = this.getSchema();
		return typeof e == "object" && e[0] === 4;
	}
	isBlobSchema() {
		let e = this.getSchema();
		return e === 21 || e === 42;
	}
	isTimestampSchema() {
		let e = this.getSchema();
		return typeof e == "number" && e >= 4 && e <= 7;
	}
	isUnitSchema() {
		return this.getSchema() === "unit";
	}
	isDocumentSchema() {
		return this.getSchema() === 15;
	}
	isStringSchema() {
		return this.getSchema() === 0;
	}
	isBooleanSchema() {
		return this.getSchema() === 2;
	}
	isNumericSchema() {
		return this.getSchema() === 1;
	}
	isBigIntegerSchema() {
		return this.getSchema() === 17;
	}
	isBigDecimalSchema() {
		return this.getSchema() === 19;
	}
	isStreaming() {
		let { streaming: e } = this.getMergedTraits();
		return !!e || this.getSchema() === 42;
	}
	isIdempotencyToken() {
		return !!this.getMergedTraits().idempotencyToken;
	}
	getMergedTraits() {
		return this.normalizedTraits ??= {
			...this.getOwnTraits(),
			...this.getMemberTraits()
		};
	}
	getMemberTraits() {
		return Ke(this.memberTraits);
	}
	getOwnTraits() {
		return Ke(this.traits);
	}
	getKeySchema() {
		let [e, t] = [this.isDocumentSchema(), this.isMapSchema()];
		if (!e && !t) throw Error(`@smithy/core/schema - cannot get key for non-map: ${this.getName(!0)}`);
		let n = this.getSchema();
		return Ze([e ? 15 : n[4] ?? 0, 0], "key");
	}
	getValueSchema() {
		let e = this.getSchema(), [t, n, r] = [
			this.isDocumentSchema(),
			this.isMapSchema(),
			this.isListSchema()
		], i = typeof e == "number" ? 63 & e : e && typeof e == "object" && (n || r) ? e[3 + e[0]] : t ? 15 : void 0;
		if (i != null) return Ze([i, 0], n ? "value" : "member");
		throw Error(`@smithy/core/schema - ${this.getName(!0)} has no value member.`);
	}
	getMemberSchema(e) {
		let t = this.getSchema();
		if (this.isStructSchema() && t[4].includes(e)) {
			let n = t[4].indexOf(e), r = t[5][n];
			return Ze(Qe(r) ? r : [r, 0], e);
		}
		if (this.isDocumentSchema()) return Ze([15, 0], e);
		throw Error(`@smithy/core/schema - ${this.getName(!0)} has no member=${e}.`);
	}
	getMemberSchemas() {
		let e = {};
		try {
			for (let [t, n] of this.structIterator()) e[t] = n;
		} catch {}
		return e;
	}
	getEventStreamMember() {
		if (this.isStructSchema()) {
			for (let [e, t] of this.structIterator()) if (t.isStreaming() && t.isStructSchema()) return e;
		}
		return "";
	}
	*structIterator() {
		if (this.isUnitSchema()) return;
		if (!this.isStructSchema()) throw Error("@smithy/core/schema - cannot iterate non-struct schema.");
		let e = this.getSchema(), t = e[4].length, n = e[qe.it];
		if (n && t === n.length) {
			yield* n;
			return;
		}
		n = Array(t);
		for (let r = 0; r < t; ++r) {
			let t = e[4][r], i = Ze([e[5][r], 0], t);
			yield n[r] = [t, i];
		}
		e[qe.it] = n;
	}
};
function Ze(e, t) {
	return e instanceof Xe ? Object.assign(e, {
		memberName: t,
		_isMemberSchema: !0
	}) : new Xe(e, t);
}
var Qe = (e) => Array.isArray(e) && e.length === 2, $e = (e) => Array.isArray(e) && e.length >= 5, et = class e {
	namespace;
	schemas;
	exceptions;
	static registries = /* @__PURE__ */ new Map();
	constructor(t, n = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map()) {
		this.namespace = t, this.schemas = n, this.exceptions = r, e.registries.has(t) || e.registries.set(t, this);
	}
	static for(t) {
		return e.registries.get(t) ?? new e(t);
	}
	copyFrom(e) {
		let { schemas: t, exceptions: n } = this;
		for (let [n, r] of e.schemas) t.has(n) || t.set(n, r);
		for (let [t, r] of e.exceptions) n.has(t) || n.set(t, r);
	}
	register(t, n) {
		let r = this.normalizeShapeId(t);
		for (let t of [this, e.for(r.split("#")[0])]) t.schemas.has(r) || t.schemas.set(r, n);
	}
	getSchema(e) {
		let t = this.normalizeShapeId(e);
		if (!this.schemas.has(t)) {
			if (!e.includes("#")) {
				let t = "#" + e, n = [];
				for (let [e, r] of this.schemas.entries()) e.endsWith(t) && n.push(r);
				if (n.length === 1) return n[0];
			}
			throw Error(`@smithy/core/schema - schema not found for ${t}`);
		}
		return this.schemas.get(t);
	}
	registerError(t, n) {
		let r = t, i = r[1], a = i + "#" + r[2];
		for (let t of [this, e.for(i)]) !t.schemas.has(a) && !t.exceptions.has(r) && (t.schemas.set(a, r), t.exceptions.set(r, n));
	}
	getErrorCtor(t) {
		let n = t;
		return this.exceptions.has(n) ? this.exceptions.get(n) : e.for(n[1]).exceptions.get(n);
	}
	getBaseException() {
		for (let e of this.exceptions.keys()) if (Array.isArray(e)) {
			let [, t, n] = e, r = t + "#" + n;
			if (r.startsWith("smithy.ts.sdk.synthetic.") && r.endsWith("ServiceException")) return e;
		}
	}
	find(e) {
		for (let t of this.schemas.values()) if (e(t)) return t;
	}
	clear() {
		this.schemas.clear(), this.exceptions.clear();
	}
	normalizeShapeId(e) {
		return e.includes("#") ? e : this.namespace + "#" + e;
	}
}, tt = "***SensitiveInformation***";
function nt(e, t) {
	if (t == null) return t;
	let n = Xe.of(e);
	if (n.getMergedTraits().sensitive) return tt;
	if (n.isListSchema()) {
		if (n.getValueSchema().getMergedTraits().sensitive) return tt;
	} else if (n.isMapSchema()) {
		if (n.getKeySchema().getMergedTraits().sensitive || n.getValueSchema().getMergedTraits().sensitive) return tt;
	} else if (n.isStructSchema() && typeof t == "object") {
		let e = t, r = {};
		for (let [t, i] of n.structIterator()) e[t] != null && (r[t] = nt(i, e[t]));
		return r;
	}
	return t;
}
var rt = class {
	middlewareStack = pe();
	schema;
	static classBuilder() {
		return new it();
	}
	resolveMiddlewareWithContext(e, t, n, { middlewareFn: r, clientName: a, commandName: o, inputFilterSensitiveLog: s, outputFilterSensitiveLog: c, smithyContext: l, additionalContext: u, CommandCtor: d }) {
		for (let i of r.bind(this)(d, e, t, n)) this.middlewareStack.use(i);
		let f = e.concat(this.middlewareStack), { logger: ee } = t, p = u[i], m = {
			logger: ee,
			clientName: a,
			commandName: o,
			inputFilterSensitiveLog: s,
			outputFilterSensitiveLog: c,
			...u,
			[i]: {
				...p,
				commandInstance: this,
				...l,
				...n?.metricsRecorder === void 0 ? {} : { metricsRecorder: n.metricsRecorder }
			}
		}, { requestHandler: te } = t, ne = n ?? {};
		return ne.metricsRecorder && (ne = { ...ne }, delete ne.metricsRecorder), l.eventStream && (ne = {
			isEventStream: !0,
			...ne
		}), f.resolve((e) => te.handle(e.request, ne), m);
	}
}, it = class {
	_init = () => {};
	_ep = {};
	_middlewareFn = () => [];
	_commandName = "";
	_clientName = "";
	_additionalContext = {};
	_smithyContext = {};
	_inputFilterSensitiveLog = void 0;
	_outputFilterSensitiveLog = void 0;
	_serializer = null;
	_deserializer = null;
	_operationSchema;
	init(e) {
		this._init = e;
	}
	ep(e) {
		return this._ep = e, this;
	}
	m(e) {
		return this._middlewareFn = e, this;
	}
	s(e, t, n = {}) {
		return this._smithyContext = {
			service: e,
			operation: t,
			...n
		}, this;
	}
	c(e = {}) {
		return this._additionalContext = e, this;
	}
	n(e, t) {
		return this._clientName = e, this._commandName = t, this;
	}
	f(e = (e) => e, t = (e) => e) {
		return this._inputFilterSensitiveLog = e, this._outputFilterSensitiveLog = t, this;
	}
	ser(e) {
		return this._serializer = e, this;
	}
	de(e) {
		return this._deserializer = e, this;
	}
	sc(e) {
		return this._operationSchema = e, this._smithyContext.operationSchema = e, this;
	}
	build() {
		let e = this, t;
		return t = class extends rt {
			input;
			static getEndpointParameterInstructions() {
				return e._ep;
			}
			constructor(...[t]) {
				super(), this.input = t ?? {}, e._init(this), this.schema = e._operationSchema;
			}
			resolveMiddleware(n, r, i) {
				let a = e._operationSchema, o = a?.[4] ?? a?.input, s = a?.[5] ?? a?.output;
				return this.resolveMiddlewareWithContext(n, r, i, {
					CommandCtor: t,
					middlewareFn: e._middlewareFn,
					clientName: e._clientName,
					commandName: e._commandName,
					inputFilterSensitiveLog: e._inputFilterSensitiveLog ?? (a ? nt.bind(null, o) : (e) => e),
					outputFilterSensitiveLog: e._outputFilterSensitiveLog ?? (a ? nt.bind(null, s) : (e) => e),
					smithyContext: e._smithyContext,
					additionalContext: e._additionalContext
				});
			}
			serialize = e._serializer;
			deserialize = e._deserializer;
		};
	}
}, at = (e, t, n) => {
	for (let [n, r] of Object.entries(e)) {
		let e = async function(e, t, n) {
			let i = new r(e);
			if (typeof t == "function") this.send(i, t);
			else if (typeof n == "function") {
				if (typeof t != "object") throw Error(`Expected http options but got ${typeof t}`);
				this.send(i, t || {}, n);
			} else return this.send(i, t);
		}, i = (n[0].toLowerCase() + n.slice(1)).replace(/Command$/, "");
		t.prototype[i] = e;
	}
	let { paginators: r = {}, waiters: i = {} } = n ?? {};
	for (let [e, n] of Object.entries(r)) t.prototype[e] === void 0 && (t.prototype[e] = function(e = {}, t, ...r) {
		return n({
			...t,
			client: this
		}, e, ...r);
	});
	for (let [e, n] of Object.entries(i)) t.prototype[e] === void 0 && (t.prototype[e] = async function(e = {}, t, ...r) {
		let i = t;
		return typeof t == "number" && (i = { maxWaitTime: t }), n({
			...i,
			client: this
		}, e, ...r);
	});
}, ot = class e extends Error {
	$fault;
	$response;
	$retryable;
	$metadata;
	constructor(e) {
		super(e.message), Object.setPrototypeOf(this, Object.getPrototypeOf(this).constructor.prototype), this.name = e.name, this.$fault = e.$fault, this.$metadata = e.$metadata;
	}
	static isInstance(t) {
		if (!t) return !1;
		let n = t;
		return e.prototype.isPrototypeOf(n) || !!n.$fault && !!n.$metadata && (n.$fault === "client" || n.$fault === "server");
	}
	static [Symbol.hasInstance](t) {
		if (!t) return !1;
		let n = t;
		if (this === e) return e.isInstance(t);
		if (e.isInstance(t)) {
			if (this.prototype.isPrototypeOf(t)) return !0;
			let e = this.name;
			if (!e || !n.name) return !1;
			if (n.name === e) return !0;
			let r = Object.getPrototypeOf(n);
			for (; r && r !== Object.prototype;) {
				let t = r.constructor?.name;
				if (t && t !== "Error" && t === e) return !0;
				r = Object.getPrototypeOf(r);
			}
			return !1;
		}
		return !1;
	}
}, st = (e, t = {}) => (Object.entries(t).filter(([, e]) => e !== void 0).forEach(([t, n]) => {
	(e[t] == null || e[t] === "") && (e[t] = n);
}), e.message = e.message || e.Message || "UnknownError", delete e.Message, e), ct = (e) => {
	switch (e) {
		case "standard": return {
			retryMode: "standard",
			connectionTimeout: 3100
		};
		case "in-region": return {
			retryMode: "standard",
			connectionTimeout: 1100
		};
		case "cross-region": return {
			retryMode: "standard",
			connectionTimeout: 3100
		};
		case "mobile": return {
			retryMode: "standard",
			connectionTimeout: 3e4
		};
		default: return {};
	}
}, lt = Object.values(_e), ut = (e) => {
	let t = [];
	for (let n in _e) {
		if (!p(_e, n)) continue;
		let r = _e[n];
		e[r] !== void 0 && t.push({
			algorithmId: () => r,
			checksumConstructor: () => e[r]
		});
	}
	for (let [n, r] of Object.entries(e.checksumAlgorithms ?? {})) t.push({
		algorithmId: () => n,
		checksumConstructor: () => r
	});
	return {
		addChecksumAlgorithm(n) {
			e.checksumAlgorithms = e.checksumAlgorithms ?? {};
			let r = n.algorithmId(), i = n.checksumConstructor();
			lt.includes(r) ? e.checksumAlgorithms[r.toUpperCase()] = i : e.checksumAlgorithms[r] = i, t.push(n);
		},
		checksumAlgorithms() {
			return t;
		}
	};
}, dt = (e) => {
	let t = {};
	return e.checksumAlgorithms().forEach((e) => {
		let n = e.algorithmId();
		lt.includes(n) && (t[n] = e.checksumConstructor());
	}), t;
}, ft = (e) => ({
	setRetryStrategy(t) {
		e.retryStrategy = t;
	},
	retryStrategy() {
		return e.retryStrategy;
	}
}), pt = (e) => {
	let t = {};
	return t.retryStrategy = e.retryStrategy(), t;
}, mt = (e) => Object.assign(ut(e), ft(e)), ht = (e) => Object.assign(dt(e), pt(e)), gt = (e) => {
	let t = "#text";
	for (let n in e) p(e, n) && (e[n][t] === void 0 ? typeof e[n] == "object" && e[n] !== null && (e[n] = gt(e[n])) : e[n] = e[n][t]);
	return e;
}, _t = class {
	trace() {}
	debug() {}
	info() {}
	warn() {}
	error() {}
};
function vt(e, t, n, r) {
	return function(i, a, o, s, c = {}) {
		let l = Object.assign({}, e, i);
		return rt.classBuilder().ep(l).m(function(e, t, n, i) {
			let o = a.call(this, e, t, n, i);
			return o.unshift(r(n, e.getEndpointParameterInstructions())), o;
		}).s(t, o, c).n(n, o.charAt(0).toUpperCase() + o.slice(1) + "Command").sc(s).build();
	};
}
var yt = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", bt = Object.entries(yt).reduce((e, [t, n]) => (e[n] = Number(t), e), {}), xt = yt.split(""), St = (e) => {
	let t = e.length / 4 * 3;
	e.slice(-2) === "==" ? t -= 2 : e.slice(-1) === "=" && t--;
	let n = new ArrayBuffer(t), r = new DataView(n);
	for (let t = 0; t < e.length; t += 4) {
		let n = 0, i = 0;
		for (let r = t, a = t + 3; r <= a; r++) if (e[r] !== "=") {
			if (!(e[r] in bt)) throw TypeError(`Invalid character ${e[r]} in base64 string.`);
			n |= bt[e[r]] << (a - r) * 6, i += 6;
		} else n >>= 6;
		let a = t / 4 * 3;
		n >>= i % 8;
		let o = Math.floor(i / 8);
		for (let e = 0; e < o; e++) {
			let t = (o - e - 1) * 8;
			r.setUint8(a + e, (n & 255 << t) >> t);
		}
	}
	return new Uint8Array(n);
};
function Ct(e) {
	let t;
	t = typeof e == "string" ? te(e) : e;
	let n = typeof t == "object" && typeof t.length == "number", r = typeof t == "object" && typeof t.byteOffset == "number" && typeof t.byteLength == "number";
	if (!n && !r) throw Error("@smithy/util-base64: toBase64 encoder function only accepts string | Uint8Array.");
	let i = "";
	for (let e = 0; e < t.length; e += 3) {
		let n = 0, r = 0;
		for (let i = e, a = Math.min(e + 3, t.length); i < a; i++) n |= t[i] << (a - i - 1) * 8, r += 8;
		let a = Math.ceil(r / 6);
		n <<= a * 6 - r;
		for (let e = 1; e <= a; e++) {
			let t = (a - e) * 6;
			i += xt[(n & 63 << t) >> t];
		}
		i += "==".slice(0, 4 - a);
	}
	return i;
}
function wt(e, t, n, r) {
	return class i extends Uint8Array {
		static fromString(e, n = "utf-8") {
			if (typeof e == "string") return n === "base64" ? i.mutate(r(e)) : i.mutate(t(e));
			throw Error(`Unsupported conversion from ${typeof e} to Uint8ArrayBlobAdapter.`);
		}
		static mutate(e) {
			return Object.setPrototypeOf(e, i.prototype), e;
		}
		transformToString(t = "utf-8") {
			return t === "base64" ? n(this) : e(this);
		}
	};
}
var Tt = (e) => {
	if (typeof e == "string") return e;
	if (typeof e != "object" || typeof e.byteOffset != "number" || typeof e.byteLength != "number") throw Error("@smithy/util-utf8: toUtf8 encoder function only accepts string | Uint8Array.");
	return new TextDecoder("utf-8").decode(e);
}, Et = Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0"));
function Dt(e) {
	return typeof crypto < "u" && typeof crypto.randomUUID == "function" ? () => crypto.randomUUID() : () => {
		let t = /* @__PURE__ */ new Uint8Array(16);
		return e(t), t[6] = t[6] & 15 | 64, t[8] = t[8] & 63 | 128, Et[t[0]] + Et[t[1]] + Et[t[2]] + Et[t[3]] + "-" + Et[t[4]] + Et[t[5]] + "-" + Et[t[6]] + Et[t[7]] + "-" + Et[t[8]] + Et[t[9]] + "-" + Et[t[10]] + Et[t[11]] + Et[t[12]] + Et[t[13]] + Et[t[14]] + Et[t[15]];
	};
}
var Ot = (e) => {
	if (e != null) {
		if (typeof e == "string") {
			let t = parseFloat(e);
			if (!Number.isNaN(t)) return String(t) !== String(e) && Ht.warn(Vt(`Expected number but observed string: ${e}`)), t;
		}
		if (typeof e == "number") return e;
		throw TypeError(`Expected number, got ${typeof e}: ${e}`);
	}
}, kt = Math.ceil(2 ** 127 * (2 - 2 ** -23)), At = (e) => {
	let t = Ot(e);
	if (t !== void 0 && !Number.isNaN(t) && t !== Infinity && t !== -Infinity && Math.abs(t) > kt) throw TypeError(`Expected 32-bit float, got ${e}`);
	return t;
}, jt = (e) => {
	if (e != null) {
		if (Number.isInteger(e) && !Number.isNaN(e)) return e;
		throw TypeError(`Expected integer, got ${typeof e}: ${e}`);
	}
}, Mt = (e) => Pt(e, 16), Nt = (e) => Pt(e, 8), Pt = (e, t) => {
	let n = jt(e);
	if (n !== void 0 && Ft(n, t) !== n) throw TypeError(`Expected ${t}-bit integer, got ${e}`);
	return n;
}, Ft = (e, t) => {
	switch (t) {
		case 32: return Int32Array.of(e)[0];
		case 16: return Int16Array.of(e)[0];
		case 8: return Int8Array.of(e)[0];
	}
}, It = (e) => At(typeof e == "string" ? Rt(e) : e), Lt = /(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)|(-?Infinity)|(NaN)/g, Rt = (e) => {
	let t = e.match(Lt);
	if (t === null || t[0].length !== e.length) throw TypeError("Expected real number, got implicit NaN");
	return parseFloat(e);
}, zt = (e) => Mt(typeof e == "string" ? Rt(e) : e), Bt = (e) => Nt(typeof e == "string" ? Rt(e) : e), Vt = (e) => String(TypeError(e).stack || e).split("\n").slice(0, 5).filter((e) => !e.includes("stackTraceWarning")).join("\n"), Ht = { warn: console.warn }, Ut = [
	"Sun",
	"Mon",
	"Tue",
	"Wed",
	"Thu",
	"Fri",
	"Sat"
], Wt = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec"
];
function Gt(e) {
	let t = e.getUTCFullYear(), n = e.getUTCMonth(), r = e.getUTCDay(), i = e.getUTCDate(), a = e.getUTCHours(), o = e.getUTCMinutes(), s = e.getUTCSeconds(), c = i < 10 ? `0${i}` : `${i}`, l = a < 10 ? `0${a}` : `${a}`, u = o < 10 ? `0${o}` : `${o}`, d = s < 10 ? `0${s}` : `${s}`;
	return `${Ut[r]}, ${c} ${Wt[n]} ${t} ${l}:${u}:${d} GMT`;
}
var Kt = /* @__PURE__ */ new RegExp(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))? GMT$/), qt = /* @__PURE__ */ new RegExp(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2}) (\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))? GMT$/), Jt = /* @__PURE__ */ new RegExp(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ( [1-9]|\d{2}) (\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))? (\d{4})$/), Yt = (e) => {
	if (e == null) return;
	if (typeof e != "string") throw TypeError("RFC-7231 date-times must be expressed as strings");
	let t = Kt.exec(e);
	if (t) {
		let [e, n, r, i, a, o, s, c] = t;
		return Xt(zt(sn(i)), en(r), an(n, "day", 1, 31), {
			hours: a,
			minutes: o,
			seconds: s,
			fractionalMilliseconds: c
		});
	}
	if (t = qt.exec(e), t) {
		let [e, n, r, i, a, o, s, c] = t;
		return $t(Xt(Zt(i), en(r), an(n, "day", 1, 31), {
			hours: a,
			minutes: o,
			seconds: s,
			fractionalMilliseconds: c
		}));
	}
	if (t = Jt.exec(e), t) {
		let [e, n, r, i, a, o, s, c] = t;
		return Xt(zt(sn(c)), en(n), an(r.trimLeft(), "day", 1, 31), {
			hours: i,
			minutes: a,
			seconds: o,
			fractionalMilliseconds: s
		});
	}
	throw TypeError("Invalid RFC-7231 date-time value");
}, Xt = (e, t, n, r) => {
	let i = t - 1;
	return nn(e, i, n), new Date(Date.UTC(e, i, n, an(r.hours, "hour", 0, 23), an(r.minutes, "minute", 0, 59), an(r.seconds, "seconds", 0, 60), on(r.fractionalMilliseconds)));
}, Zt = (e) => {
	let t = (/* @__PURE__ */ new Date()).getUTCFullYear(), n = Math.floor(t / 100) * 100 + zt(sn(e));
	return n < t ? n + 100 : n;
}, Qt = 15768e8, $t = (e) => e.getTime() - (/* @__PURE__ */ new Date()).getTime() > Qt ? new Date(Date.UTC(e.getUTCFullYear() - 100, e.getUTCMonth(), e.getUTCDate(), e.getUTCHours(), e.getUTCMinutes(), e.getUTCSeconds(), e.getUTCMilliseconds())) : e, en = (e) => {
	let t = Wt.indexOf(e);
	if (t < 0) throw TypeError(`Invalid month: ${e}`);
	return t + 1;
}, tn = [
	31,
	28,
	31,
	30,
	31,
	30,
	31,
	31,
	30,
	31,
	30,
	31
], nn = (e, t, n) => {
	let r = tn[t];
	if (t === 1 && rn(e) && (r = 29), n > r) throw TypeError(`Invalid day for ${Wt[t]} in ${e}: ${n}`);
}, rn = (e) => e % 4 == 0 && (e % 100 != 0 || e % 400 == 0), an = (e, t, n, r) => {
	let i = Bt(sn(e));
	if (i < n || i > r) throw TypeError(`${t} must be between ${n} and ${r}, inclusive`);
	return i;
}, on = (e) => e == null ? 0 : It("0." + e) * 1e3, sn = (e) => {
	let t = 0;
	for (; t < e.length - 1 && e.charAt(t) === "0";) t++;
	return t === 0 ? e : e.slice(t);
}, cn = function(e) {
	return Object.assign(new String(e), {
		deserializeJSON() {
			return JSON.parse(String(e));
		},
		toString() {
			return String(e);
		},
		toJSON() {
			return String(e);
		}
	});
};
cn.from = (e) => e && typeof e == "object" && (e instanceof cn || "deserializeJSON" in e) ? e : typeof e == "string" || Object.getPrototypeOf(e) === String.prototype ? cn(String(e)) : cn(JSON.stringify(e)), cn.fromObject = cn.from;
function ln(e) {
	return (e.includes(",") || e.includes("\"")) && (e = `"${e.replace(/"/g, "\\\"")}"`), e;
}
var un = "(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:[ne|u?r]?s?day)?", dn = "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)", fn = "(\\d?\\d):(\\d{2}):(\\d{2})(?:\\.(\\d+))?", pn = "(\\d?\\d)", mn = "(\\d{4})", hn = /* @__PURE__ */ new RegExp(/^(\d{4})-(\d\d)-(\d\d)[tT](\d\d):(\d\d):(\d\d)(\.(\d+))?(([-+]\d\d:\d\d)|[zZ])$/), gn = RegExp(`^${un}, ${pn} ${dn} ${mn} ${fn} GMT$`), _n = RegExp(`^${un}, ${pn}-${dn}-(\\d\\d) ${fn} GMT$`), vn = RegExp(`^${un} ${dn} ( [1-9]|\\d\\d) ${fn} ${mn}$`), yn = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec"
], bn = (e) => {
	if (e == null) return;
	let t = NaN;
	if (typeof e == "number") t = e;
	else if (typeof e == "string") {
		if (!/^-?\d*\.?\d+$/.test(e)) throw TypeError("parseEpochTimestamp - numeric string invalid.");
		t = Number.parseFloat(e);
	} else typeof e == "object" && e.tag === 1 && (t = e.value);
	if (isNaN(t) || Math.abs(t) === Infinity) throw TypeError("Epoch timestamps must be valid finite numbers.");
	return new Date(Math.round(t * 1e3));
}, xn = (e) => {
	if (e == null) return;
	if (typeof e != "string") throw TypeError("RFC3339 timestamps must be strings");
	let t = hn.exec(e);
	if (!t) throw TypeError(`Invalid RFC3339 timestamp format ${e}`);
	let [, n, r, i, a, o, s, , c, l] = t;
	Cn(r, 1, 12), Cn(i, 1, 31), Cn(a, 0, 23), Cn(o, 0, 59), Cn(s, 0, 60);
	let u = new Date(Date.UTC(Number(n), Number(r) - 1, Number(i), Number(a), Number(o), Number(s), Number(c) ? Math.round(parseFloat(`0.${c}`) * 1e3) : 0));
	if (u.setUTCFullYear(Number(n)), l.toUpperCase() != "Z") {
		let [, e, t, n] = /([+-])(\d\d):(\d\d)/.exec(l) || [
			void 0,
			"+",
			0,
			0
		], r = e === "-" ? 1 : -1;
		u.setTime(u.getTime() + r * (Number(t) * 60 * 60 * 1e3 + Number(n) * 60 * 1e3));
	}
	return u;
}, Sn = (e) => {
	if (e == null) return;
	if (typeof e != "string") throw TypeError("RFC7231 timestamps must be strings.");
	let t, n, r, i, a, o, s, c;
	if ((c = gn.exec(e)) ? [, t, n, r, i, a, o, s] = c : (c = _n.exec(e)) ? ([, t, n, r, i, a, o, s] = c, r = (Number(r) + 1900).toString()) : (c = vn.exec(e)) && ([, n, t, i, a, o, s, r] = c), r && o) {
		let e = Date.UTC(Number(r), yn.indexOf(n), Number(t), Number(i), Number(a), Number(o), s ? Math.round(parseFloat(`0.${s}`) * 1e3) : 0);
		Cn(t, 1, 31), Cn(i, 0, 23), Cn(a, 0, 59), Cn(o, 0, 60);
		let c = new Date(e);
		return c.setUTCFullYear(Number(r)), c;
	}
	throw TypeError(`Invalid RFC7231 date-time value ${e}.`);
};
function Cn(e, t, n) {
	let r = Number(e);
	if (r < t || r > n) throw Error(`Value ${r} out of range [${t}, ${n}]`);
}
function wn(e, t, n) {
	if (n <= 0 || !Number.isInteger(n)) throw Error("Invalid number of delimiters (" + n + ") for splitEvery.");
	let r = e.split(t);
	if (n === 1) return r;
	let i = [], a = "";
	for (let e = 0; e < r.length; e++) a === "" ? a = r[e] : a += t + r[e], (e + 1) % n === 0 && (i.push(a), a = "");
	return a !== "" && i.push(a), i;
}
var Tn = (e) => {
	let t = e.length, n = [], r = !1, i, a = 0;
	for (let o = 0; o < t; ++o) {
		let t = e[o];
		switch (t) {
			case "\"":
				i !== "\\" && (r = !r);
				break;
			case ",": r || (n.push(e.slice(a, o)), a = o + 1);
		}
		i = t;
	}
	return n.push(e.slice(a)), n.map((e) => {
		e = e.trim();
		let t = e.length;
		return t < 2 ? e : (e[0] === "\"" && e[t - 1] === "\"" && (e = e.slice(1, t - 1)), e.replace(/\\"/g, "\""));
	});
}, En = /^-?((0|[1-9]\d*)(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/, Dn = class e {
	string;
	type;
	constructor(e, t) {
		if (this.string = e, this.type = t, !En.test(e)) throw Error(`@smithy/core/serde - NumericValue string must conform to the Smithy bigDecimal format. Received: "${e}"`);
	}
	toString() {
		return this.string;
	}
	static [Symbol.hasInstance](t) {
		if (!t || typeof t != "object") return !1;
		let n = t;
		return e.prototype.isPrototypeOf(t) || n.type === "bigDecimal" && En.test(n.string);
	}
}, On = typeof TextEncoder == "function" ? new TextEncoder() : null, kn = (e) => {
	if (typeof e == "string") {
		if (On) return On.encode(e).byteLength;
		let t = e.length;
		for (let n = t - 1; n >= 0; n--) {
			let r = e.charCodeAt(n);
			r > 127 && r <= 2047 ? t++ : r > 2047 && r <= 65535 && (t += 2), r >= 56320 && r <= 57343 && n--;
		}
		return t;
	}
	if (typeof e.byteLength == "number") return e.byteLength;
	if (typeof e.size == "number") return e.size;
	throw Error(`Body Length computation failed for ${e}`);
};
function An(e, t) {
	if (t === void 0) {
		t = 0;
		for (let n of e) t += n.byteLength;
	}
	let n = new Uint8Array(t), r = 0;
	for (let t of e) n.set(t, r), r += t.byteLength;
	return n;
}
var jn = class e {
	nodes;
	root;
	conditions;
	results;
	constructor(e, t, n, r) {
		this.nodes = e, this.root = t, this.conditions = n, this.results = r;
	}
	static from(t, n, r, i) {
		return new e(t, n, r, i);
	}
}, Mn = class {
	capacity;
	data = /* @__PURE__ */ new Map();
	parameters = [];
	constructor({ size: e, params: t }) {
		this.capacity = e ?? 50, t && (this.parameters = t);
	}
	get(e, t) {
		let n = this.hash(e);
		if (n === !1) return t();
		if (!this.data.has(n)) {
			if (this.data.size > this.capacity + 10) {
				let e = this.data.keys(), t = 0;
				for (;;) {
					let { value: n, done: r } = e.next();
					if (this.data.delete(n), r || ++t > 10) break;
				}
			}
			this.data.set(n, t());
		}
		return this.data.get(n);
	}
	size() {
		return this.data.size;
	}
	hash(e) {
		let t = "", { parameters: n } = this;
		if (n.length === 0) return !1;
		for (let r of n) {
			let n = String(e[r] ?? "");
			if (n.includes("|;")) return !1;
			t += n + "|;";
		}
		return t;
	}
}, Nn = class extends Error {
	constructor(e) {
		super(e), this.name = "EndpointError";
	}
}, Pn = "endpoints";
function Fn(e) {
	return typeof e != "object" || !e ? e : "ref" in e ? `$${Fn(e.ref)}` : "fn" in e ? `${e.fn}(${(e.argv || []).map(Fn).join(", ")})` : JSON.stringify(e, null, 2);
}
var In = {}, Ln = (e, t) => e === t;
function Rn(...e) {
	for (let t of e) if (t != null) return t;
}
var zn = (e) => {
	let t = e.split("."), n = [];
	for (let r of t) {
		let t = r.indexOf("[");
		if (t !== -1) {
			if (r.indexOf("]") !== r.length - 1) throw new Nn(`Path: '${e}' does not end with ']'`);
			let i = r.slice(t + 1, -1);
			if (Number.isNaN(parseInt(i))) throw new Nn(`Invalid array index: '${i}' in path: '${e}'`);
			t !== 0 && n.push(r.slice(0, t)), n.push(i);
		} else n.push(r);
	}
	return n;
}, Bn = (e, t) => zn(t).reduce((n, r) => {
	if (typeof n != "object") throw new Nn(`Index '${r}' in '${t}' not found in '${JSON.stringify(e)}'`);
	if (Array.isArray(n)) {
		let e = parseInt(r);
		return n[e < 0 ? n.length + e : e];
	}
	return n[r];
}, e), Vn = (e) => e != null;
function Hn(e, t, n) {
	return e ? t : n;
}
var Un = (e) => !e, Wn = /* @__PURE__ */ RegExp("^(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)){3}$"), Gn = (e) => Wn.test(e) || e.startsWith("[") && e.endsWith("]"), Kn = {
	[ge.HTTP]: 80,
	[ge.HTTPS]: 443
}, qn = (e) => {
	let t = (() => {
		try {
			if (e instanceof URL) return e;
			if (typeof e == "object" && "hostname" in e) {
				let { hostname: t, port: n, protocol: r = "", path: i = "", query: a = {} } = e, o = new URL(`${r}//${t}${n ? `:${n}` : ""}${i}`);
				return o.search = Object.entries(a).map(([e, t]) => `${e}=${t}`).join("&"), o;
			}
			return new URL(e);
		} catch {
			return null;
		}
	})();
	if (!t) return console.error(`Unable to parse ${JSON.stringify(e)} as a whatwg URL.`), null;
	let n = t.href, { host: r, hostname: i, pathname: a, protocol: o, search: s } = t;
	if (s) return null;
	let c = o.slice(0, -1);
	if (!Object.values(ge).includes(c)) return null;
	let l = Gn(i);
	return {
		scheme: c,
		authority: `${r}${n.includes(`${r}:${Kn[c]}`) || typeof e == "string" && e.includes(`${r}:${Kn[c]}`) ? `:${Kn[c]}` : ""}`,
		path: a,
		normalizedPath: a.endsWith("/") ? a : `${a}/`,
		isIp: l
	};
};
function Jn(e, t, n) {
	if (n === 1) return [e];
	if (e === "") return [""];
	let r = e.split(t);
	return n === 0 ? r : r.slice(0, n - 1).concat(r.slice(1).join(t));
}
var Yn = {
	booleanEquals: Ln,
	coalesce: Rn,
	getAttr: Bn,
	isSet: Vn,
	isValidHostLabel: be,
	ite: Hn,
	not: Un,
	parseURL: qn,
	split: Jn,
	stringEquals: (e, t) => e === t,
	substring: (e, t, n, r) => e == null || t >= n || e.length < n || /[^\u0000-\u007f]/.test(e) ? null : r ? e.substring(e.length - n, e.length - t) : e.substring(t, n),
	uriEncode: (e) => encodeURIComponent(e).replace(/[!*'()]/g, (e) => `%${e.charCodeAt(0).toString(16).toUpperCase()}`)
}, Xn = (e, t) => {
	let n = [], { referenceRecord: r, endpointParams: i } = t, a = 0;
	for (; a < e.length;) {
		let t = e.indexOf("{", a);
		if (t === -1) {
			n.push(e.slice(a));
			break;
		}
		n.push(e.slice(a, t));
		let o = e.indexOf("}", t);
		if (o === -1) {
			n.push(e.slice(t));
			break;
		}
		e[t + 1] === "{" && e[o + 1] === "}" && (n.push(e.slice(t + 1, o)), a = o + 2);
		let s = e.substring(t + 1, o);
		if (s.includes("#")) {
			let [e, t] = s.split("#");
			n.push(Bn(r[e] ?? i[e], t));
		} else n.push(r[s] ?? i[s]);
		a = o + 1;
	}
	return n.join("");
}, Zn = ({ ref: e }, t) => t.referenceRecord[e] ?? t.endpointParams[e], Qn = (e, t, n) => {
	if (typeof e == "string") return Xn(e, n);
	if (e.fn) return er.callFunction(e, n);
	if (e.ref) return Zn(e, n);
	throw new Nn(`'${t}': ${String(e)} is not a string, function or reference.`);
}, $n = ({ fn: e, argv: t }, n) => {
	let r = Array(t.length);
	for (let e = 0; e < r.length; ++e) {
		let i = t[e];
		typeof i == "boolean" || typeof i == "number" ? r[e] = i : r[e] = er.evaluateExpression(i, "arg", n);
	}
	let i = e.indexOf(".");
	if (i !== -1) {
		let t = In[e.slice(0, i)]?.[e.slice(i + 1)];
		if (typeof t == "function") return t(...r);
	}
	let a = Yn[e];
	if (typeof a == "function") return a(...r);
	throw Error(`function ${e} not loaded in endpointFunctions.`);
}, er = {
	evaluateExpression: Qn,
	callFunction: $n
}, tr = (e, t) => {
	let { assign: n } = e;
	if (n && n in t.referenceRecord) throw new Nn(`'${n}' is already defined in Reference Record.`);
	let r = $n(e, t);
	t.logger?.debug?.(`${Pn} evaluateCondition: ${Fn(e)} = ${Fn(r)}`);
	let i = r === "" || !!r;
	return n == null ? { result: i } : {
		result: i,
		toAssign: {
			name: n,
			value: r
		}
	};
}, nr = (e, t) => Object.entries(e ?? {}).reduce((e, [n, r]) => (e[n] = r.map((e) => {
	let r = Qn(e, "Header value entry", t);
	if (typeof r != "string") throw new Nn(`Header '${n}' value '${r}' is not a string`);
	return r;
}), e), {}), rr = (e, t) => Object.entries(e).reduce((e, [n, r]) => (e[n] = ar.getEndpointProperty(r, t), e), {}), ir = (e, t) => {
	if (Array.isArray(e)) return e.map((e) => ir(e, t));
	switch (typeof e) {
		case "string": return Xn(e, t);
		case "object":
			if (e === null) throw new Nn(`Unexpected endpoint property: ${e}`);
			return ar.getEndpointProperties(e, t);
		case "boolean": return e;
		default: throw new Nn(`Unexpected endpoint property type: ${typeof e}`);
	}
}, ar = {
	getEndpointProperty: ir,
	getEndpointProperties: rr
}, or = (e, t) => {
	let n = Qn(e, "Endpoint URL", t);
	if (typeof n == "string") try {
		return new URL(n);
	} catch (e) {
		throw console.error(`Failed to construct URL with ${n}`, e), e;
	}
	throw new Nn(`Endpoint URL must be a string, got ${typeof n}`);
}, sr = 1e8, cr = (e, t) => {
	let { nodes: n, root: r, results: i, conditions: a } = e, o = r, s = {}, c = {
		referenceRecord: s,
		endpointParams: t.endpointParams,
		logger: t.logger
	};
	for (; o !== 1 && o !== -1 && o < sr;) {
		let e = 3 * (Math.abs(o) - 1), [t, r, i] = [
			n[e],
			n[e + 1],
			n[e + 2]
		], [l, u, d] = a[t], f = tr({
			fn: l,
			assign: d,
			argv: u
		}, c);
		if (f.toAssign) {
			let { name: e, value: t } = f.toAssign;
			s[e] = t;
		}
		o = o >= 0 === f.result ? r : i;
	}
	if (o >= sr) {
		let e = i[o - sr];
		if (e[0] === -1) {
			let [, t] = e;
			throw new Nn(Qn(t, "Error", c));
		}
		let [t, n, r] = e;
		return {
			url: or(t, c),
			properties: rr(n, c),
			headers: nr(r ?? {}, c)
		};
	}
	throw new Nn("No matching endpoint.");
}, lr = typeof ReadableStream == "function" ? ReadableStream : function() {}, ur = class extends lr {}, dr = (e) => typeof ReadableStream == "function" && (e?.constructor?.name === ReadableStream.name || e instanceof ReadableStream), fr = (e) => typeof Blob == "function" && (e?.constructor?.name === Blob.name || e instanceof Blob), pr = ({ expectedChecksum: e, checksum: t, source: n, checksumSourceLocation: r, base64Encoder: i }) => {
	if (!dr(n)) throw Error(`@smithy/util-stream: unsupported source type ${n?.constructor?.name ?? n} in ChecksumStream.`);
	let a = i ?? Ct;
	if (typeof TransformStream != "function") throw Error("@smithy/util-stream: unable to instantiate ChecksumStream because API unavailable: ReadableStream/TransformStream.");
	let o = new TransformStream({
		start() {},
		async transform(e, n) {
			t.update(e), n.enqueue(e);
		},
		async flush(n) {
			let i = await t.digest(), o = a(i);
			if (e !== o) {
				let t = /* @__PURE__ */ Error(`Checksum mismatch: expected "${e}" but received "${o}" in response header "${r}".`);
				n.error(t);
			} else n.terminate();
		}
	});
	n.pipeThrough(o);
	let s = o.readable;
	return Object.setPrototypeOf(s, ur.prototype), s;
}, mr = class {
	allocByteArray;
	byteLength = 0;
	byteArrays = [];
	constructor(e) {
		this.allocByteArray = e;
	}
	push(e) {
		this.byteArrays.push(e), this.byteLength += e.byteLength;
	}
	flush() {
		if (this.byteArrays.length === 1) {
			let e = this.byteArrays[0];
			return this.reset(), e;
		}
		let e = this.allocByteArray(this.byteLength), t = 0;
		for (let n = 0; n < this.byteArrays.length; ++n) {
			let r = this.byteArrays[n];
			e.set(r, t), t += r.byteLength;
		}
		return this.reset(), e;
	}
	reset() {
		this.byteArrays = [], this.byteLength = 0;
	}
};
function hr(e, t, n) {
	let r = e.getReader(), i = !1, a = 0, o = ["", new mr((e) => new Uint8Array(e))], s = -1, c = async (e) => {
		let { value: l, done: u } = await r.read(), d = l;
		if (u) {
			if (s !== -1) {
				let t = vr(o, s);
				yr(t) > 0 && e.enqueue(t);
			}
			e.close();
		} else {
			let r = br(d, !1);
			if (s !== r && (s >= 0 && e.enqueue(vr(o, s)), s = r), s === -1) {
				e.enqueue(d);
				return;
			}
			let l = yr(d);
			a += l;
			let u = yr(o[s]);
			if (l >= t && u === 0) e.enqueue(d);
			else {
				let r = _r(o, s, d);
				!i && a > t * 2 && (i = !0, n?.warn(`@smithy/util-stream - stream chunk size ${l} is below threshold of ${t}, automatically buffering.`)), r >= t ? e.enqueue(vr(o, s)) : await c(e);
			}
		}
	};
	return new ReadableStream({ pull: c });
}
var gr = hr;
function _r(e, t, n) {
	switch (t) {
		case 0: return e[0] += n, yr(e[0]);
		case 1:
		case 2: return e[t].push(n), yr(e[t]);
	}
}
function vr(e, t) {
	switch (t) {
		case 0:
			let n = e[0];
			return e[0] = "", n;
		case 1:
		case 2: return e[t].flush();
	}
	throw Error(`@smithy/util-stream - invalid index ${t} given to flush()`);
}
function yr(e) {
	return e?.byteLength ?? e?.length ?? 0;
}
function br(e, t = !0) {
	return t && typeof Buffer < "u" && e instanceof Buffer ? 2 : e instanceof Uint8Array ? 1 : typeof e == "string" ? 0 : -1;
}
var xr = (e, t) => {
	let { base64Encoder: n, bodyLengthChecker: r, checksumAlgorithmFn: i, checksumLocationName: a, streamHasher: o } = t, s = n !== void 0 && r !== void 0 && i !== void 0 && a !== void 0 && o !== void 0, c = s ? o(i, e) : void 0;
	Promise.resolve(c).catch(() => {});
	let l = e.getReader();
	return new ReadableStream({ async pull(e) {
		let { value: t, done: i } = await l.read();
		if (i) {
			if (e.enqueue("0\r\n"), s) {
				let t = n(await c);
				e.enqueue(`${a}:${t}\r\n`), e.enqueue("\r\n");
			}
			e.close();
		} else e.enqueue(`${(r(t) || 0).toString(16)}\r\n${t}\r\n`);
	} });
}, Sr = async (e) => fr(e) ? Cr(e) : wr(e);
async function Cr(e) {
	return e.arrayBuffer().then((e) => new Uint8Array(e));
}
async function wr(e) {
	let t = [], n = e.getReader(), r = 0;
	for (;;) {
		let { done: e, value: i } = await n.read();
		if (i && (t.push(i), r += i.length), e) break;
	}
	return An(t, r);
}
var Tr = "The stream has already been transformed.", Er = (e) => {
	if (!Dr(e) && !dr(e)) {
		let t = e?.__proto__?.constructor?.name || e;
		throw Error(`Unexpected stream implementation, expect Blob or ReadableStream, got ${t}`);
	}
	let t = !1, n = async () => {
		if (t) throw Error(Tr);
		return t = !0, await Sr(e);
	}, r = (e) => {
		if (typeof e.stream != "function") throw Error("Cannot transform payload Blob to web stream. Please make sure the Blob.stream() is polyfilled.\nIf you are using React Native, this API is not yet supported, see: https://react-native.canny.io/feature-requests/p/fetch-streaming-body");
		return e.stream();
	};
	return Object.assign(e, {
		transformToByteArray: n,
		transformToString: async (e) => {
			let t = await n();
			if (e === "base64") return Ct(t);
			if (e === "hex") return m(t);
			if (e === void 0 || e === "utf8" || e === "utf-8") return Tt(t);
			if (typeof TextDecoder == "function") return new TextDecoder(e).decode(t);
			throw Error("TextDecoder is not available, please make sure polyfill is provided.");
		},
		transformToWebStream: () => {
			if (t) throw Error(Tr);
			if (t = !0, Dr(e)) return r(e);
			if (dr(e)) return e;
			throw Error(`Cannot transform payload to web stream, got ${e}`);
		}
	});
}, Dr = (e) => typeof Blob == "function" && e instanceof Blob, Or = class extends wt(Tt, te, Ct, St) {}, kr = Dt((e) => crypto.getRandomValues(e)), Ar = kr, jr = async (e = /* @__PURE__ */ new Uint8Array(), t) => {
	if (e instanceof Uint8Array) return Or.mutate(e);
	if (!e) return Or.mutate(/* @__PURE__ */ new Uint8Array());
	let n = t.streamCollector(e);
	return Or.mutate(await n);
};
function Mr(e) {
	return encodeURIComponent(e).replace(/[!'()*]/g, function(e) {
		return "%" + e.charCodeAt(0).toString(16).toUpperCase();
	});
}
var Nr = class {
	serdeContext;
	setSerdeContext(e) {
		this.serdeContext = e;
	}
}, Pr = class extends Nr {
	options;
	compositeErrorRegistry;
	constructor(e) {
		super(), this.options = e, this.compositeErrorRegistry = new et(e.defaultNamespace);
		for (let t of e.errorTypeRegistries ?? []) this.compositeErrorRegistry.copyFrom(t);
	}
	getRequestType() {
		return l;
	}
	getResponseType() {
		return ve;
	}
	setSerdeContext(e) {
		this.serdeContext = e, this.serializer.setSerdeContext(e), this.deserializer.setSerdeContext(e), this.getPayloadCodec() && this.getPayloadCodec().setSerdeContext(e);
	}
	updateServiceEndpoint(e, t) {
		if ("url" in t) {
			e.protocol = t.url.protocol, e.hostname = t.url.hostname, e.port = t.url.port ? Number(t.url.port) : void 0, e.path = t.url.pathname, e.fragment = t.url.hash || void 0, e.username = t.url.username || void 0, e.password = t.url.password || void 0, e.query ||= {};
			for (let [n, r] of t.url.searchParams.entries()) e.query[n] = r;
			if (t.headers) for (let n in t.headers) p(t.headers, n) && (e.headers[n] = t.headers[n].join(", "));
			return e;
		}
		if (e.protocol = t.protocol, e.hostname = t.hostname, e.port = t.port ? Number(t.port) : void 0, e.path = t.path, e.query = { ...t.query }, t.headers) for (let n in t.headers) p(t.headers, n) && (e.headers[n] = t.headers[n]);
		return e;
	}
	setHostPrefix(e, t, n) {
		if (this.serdeContext?.disableHostPrefix) return;
		let r = Xe.of(t.input), i = Ke(t.traits ?? {});
		if (i.endpoint) {
			let t = i.endpoint?.[0];
			if (typeof t == "string") {
				for (let [e, i] of r.structIterator()) {
					if (!i.getMergedTraits().hostLabel) continue;
					let r = n[e];
					if (typeof r != "string") throw Error(`@smithy/core/schema - ${e} in input must be a string as hostLabel.`);
					t = t.replace(`{${e}}`, r);
				}
				if (e.hostname = t + e.hostname, !xe(e.hostname)) throw Error(`[${e.hostname}] is not a valid hostname.`);
			}
		}
	}
	deserializeMetadata(e) {
		return {
			httpStatusCode: e.statusCode,
			requestId: e.headers["x-amzn-requestid"] ?? e.headers["x-amzn-request-id"] ?? e.headers["x-amz-request-id"],
			extendedRequestId: e.headers["x-amz-id-2"],
			cfId: e.headers["x-amz-cf-id"]
		};
	}
	resolveError(e, t, n) {
		let r = [
			-3,
			"",
			"Error",
			0,
			[],
			[],
			0
		], i;
		for (let r of n) for (let n of t) try {
			i = n === "*" ? r.getSchema(e) : r.getSchema(n + "#" + e);
			let t = r.getErrorCtor(i);
			if (t) return [
				i,
				t,
				"modeled"
			];
			{
				let e = r.getBaseException();
				if (e) {
					let t = r.getErrorCtor(e);
					if (t) return [
						i,
						t,
						"synthetic"
					];
				}
			}
		} catch {}
		for (let e of n) {
			let t = e.getBaseException();
			if (t) {
				let n = e.getErrorCtor(t);
				if (n) return [
					t,
					n,
					"synthetic"
				];
			}
		}
		return [
			r,
			Error,
			"native"
		];
	}
	async serializeEventStream({ eventStream: e, requestSchema: t, initialRequest: n }) {
		return (await this.loadEventStreamCapability()).serializeEventStream({
			eventStream: e,
			requestSchema: t,
			initialRequest: n
		});
	}
	async deserializeEventStream({ response: e, responseSchema: t, initialResponseContainer: n }) {
		return (await this.loadEventStreamCapability()).deserializeEventStream({
			response: e,
			responseSchema: t,
			initialResponseContainer: n
		});
	}
	async loadEventStreamCapability() {
		let { EventStreamSerde: e, eventStreamSerdeProvider: t } = await import("./index.browser-LeTeYHkU.js");
		return new e({
			marshaller: this.resolveEventStreamMarshaller(t),
			serializer: this.serializer,
			deserializer: this.deserializer,
			serdeContext: this.serdeContext,
			defaultContentType: this.getDefaultContentType(),
			compositeErrorRegistry: this.compositeErrorRegistry
		});
	}
	getDefaultContentType() {
		throw Error(`@smithy/core/protocols - ${this.constructor.name} getDefaultContentType() implementation missing.`);
	}
	async deserializeHttpMessage(e, t, n, r, i) {
		return [];
	}
	getEventStreamMarshaller() {
		let e = this.serdeContext;
		if (!e.eventStreamMarshaller) throw Error("@smithy/core - HttpProtocol: eventStreamMarshaller missing in serdeContext.");
		return e.eventStreamMarshaller;
	}
	resolveEventStreamMarshaller(e) {
		let t = this.serdeContext;
		return t.eventStreamMarshaller ? t.eventStreamMarshaller : e(this.serdeContext);
	}
}, Fr = class extends Pr {
	async serializeRequest(e, t, n) {
		let r = t && typeof t == "object" ? t : {}, i = this.serializer, a = {}, o = {}, s = await n.endpoint(), c = Xe.of(e?.input), u = [], d = [], f = !1, ee, m = new l({
			protocol: "",
			hostname: "",
			port: void 0,
			path: "",
			fragment: void 0,
			query: a,
			headers: o,
			body: void 0
		});
		if (s) {
			this.updateServiceEndpoint(m, s), this.setHostPrefix(m, e, r);
			let t = Ke(e.traits);
			if (t.http) {
				m.method = t.http[0];
				let [e, n] = t.http[1].split("?");
				m.path == "/" ? m.path = e : m.path += e;
				let r = new URLSearchParams(n ?? "");
				for (let [e, t] of r) a[e] = t;
			}
		}
		for (let [e, t] of c.structIterator()) {
			let n = t.getMergedTraits() ?? {}, s = r[e];
			if (s == null && !t.isIdempotencyToken()) {
				if (n.httpLabel && (m.path.includes(`{${e}+}`) || m.path.includes(`{${e}}`))) throw Error(`No value provided for input HTTP label: ${e}.`);
				continue;
			}
			if (n.httpPayload) t.isStreaming() ? t.isStructSchema() ? r[e] && (ee = await this.serializeEventStream({
				eventStream: r[e],
				requestSchema: c
			})) : ee = s : (i.write(t, s), ee = i.flush());
			else if (n.httpLabel) {
				i.write(t, s);
				let n = i.flush();
				m.path.includes(`{${e}+}`) ? m.path = m.path.replace(`{${e}+}`, n.split("/").map(Mr).join("/")) : m.path.includes(`{${e}}`) && (m.path = m.path.replace(`{${e}}`, Mr(n)));
			} else if (n.httpHeader) i.write(t, s), o[n.httpHeader.toLowerCase()] = String(i.flush());
			else if (typeof n.httpPrefixHeaders == "string") for (let e in s) {
				if (!p(s, e)) continue;
				let r = s[e], a = n.httpPrefixHeaders + e;
				i.write([t.getValueSchema(), { httpHeader: a }], r), o[a.toLowerCase()] = i.flush();
			}
			else n.httpQuery || n.httpQueryParams ? this.serializeQuery(t, s, a) : (f = !0, u.push(e), d.push(t));
		}
		if (f && r) {
			let [e, t] = (c.getName(!0) ?? "#Unknown").split("#"), n = c.getSchema()[6], a = [
				3,
				e,
				t,
				c.getMergedTraits(),
				u,
				d,
				void 0
			];
			n ? a[6] = n : a.pop(), i.write(a, r), ee = i.flush();
		}
		return m.headers = o, m.query = a, m.body = ee, m;
	}
	serializeQuery(e, t, n) {
		let r = this.serializer, i = e.getMergedTraits();
		if (i.httpQueryParams) {
			for (let r in t) if (p(t, r) && !(r in n)) {
				let a = t[r], o = e.getValueSchema();
				Object.assign(o.getMergedTraits(), {
					...i,
					httpQuery: r,
					httpQueryParams: void 0
				}), this.serializeQuery(o, a, n);
			}
			return;
		}
		if (e.isListSchema()) {
			let a = !!e.getMergedTraits().sparse, o = [];
			for (let n of t) {
				r.write([e.getValueSchema(), i], n);
				let t = r.flush();
				(a || t !== void 0) && o.push(t);
			}
			n[i.httpQuery] = o;
		} else r.write([e, i], t), n[i.httpQuery] = r.flush();
	}
	async deserializeResponse(e, t, n) {
		let r = this.deserializer, i = Xe.of(e.output), a = {};
		if (n.statusCode >= 300) {
			let i = await jr(n.body, t);
			throw i.byteLength > 0 && Object.assign(a, await r.read(15, i)), await this.handleError(e, t, n, a, this.deserializeMetadata(n)), Error("@smithy/core/protocols - HTTP Protocol error handler failed to throw.");
		}
		for (let e in n.headers) {
			if (!p(n.headers, e)) continue;
			let t = n.headers[e];
			delete n.headers[e], n.headers[e.toLowerCase()] = t;
		}
		let o = await this.deserializeHttpMessage(i, t, n, a);
		if (o.length) {
			let e = await jr(n.body, t);
			if (e.byteLength > 0) {
				let t = await r.read(i, e);
				for (let e of o) t[e] != null && (a[e] = t[e]);
			}
		} else o.discardResponseBody && await jr(n.body, t);
		return a.$metadata = this.deserializeMetadata(n), a;
	}
	async deserializeHttpMessage(e, t, n, r, i) {
		let a;
		a = r instanceof Set ? i : r;
		let o = !0, s = this.deserializer, c = Xe.of(e), l = [];
		for (let [e, r] of c.structIterator()) {
			let i = r.getMemberTraits();
			if (i.httpPayload) {
				if (o = !1, r.isStreaming()) r.isStructSchema() ? a[e] = await this.deserializeEventStream({
					response: n,
					responseSchema: c
				}) : a[e] = Er(n.body);
				else if (n.body) {
					let i = await jr(n.body, t);
					i.byteLength > 0 && (a[e] = await s.read(r, i));
				}
			} else if (i.httpHeader) {
				let t = String(i.httpHeader).toLowerCase(), o = n.headers[t];
				if (o != null) {
					if (r.isListSchema()) {
						let n = r.getValueSchema();
						n.getMergedTraits().httpHeader = t;
						let i;
						i = n.isTimestampSchema() && n.getSchema() === 4 ? wn(o, ",", 2) : Tn(o);
						let c = [];
						for (let e of i) c.push(await s.read(n, e.trim()));
						a[e] = c;
					} else a[e] = await s.read(r, o);
				}
			} else if (i.httpPrefixHeaders !== void 0) {
				a[e] = {};
				for (let t in n.headers) if (p(n.headers, t) && t.startsWith(i.httpPrefixHeaders)) {
					let o = n.headers[t], c = r.getValueSchema();
					c.getMergedTraits().httpHeader = t, a[e][t.slice(i.httpPrefixHeaders.length)] = await s.read(c, o);
				}
			} else i.httpResponseCode ? a[e] = n.statusCode : l.push(e);
		}
		return l.discardResponseBody = o, l;
	}
};
function Ir(e, t) {
	if (t.timestampFormat.useTrait && e.isTimestampSchema() && (e.getSchema() === 5 || e.getSchema() === 6 || e.getSchema() === 7)) return e.getSchema();
	let { httpLabel: n, httpPrefixHeaders: r, httpHeader: i, httpQuery: a } = e.getMergedTraits();
	return (t.httpBindings ? typeof r == "string" || i ? 6 : a || n ? 5 : void 0 : void 0) ?? t.timestampFormat.default;
}
var Lr = class extends Nr {
	settings;
	constructor(e) {
		super(), this.settings = e;
	}
	read(e, t) {
		let n = Xe.of(e);
		if (n.isListSchema()) return Tn(t).map((e) => this.read(n.getValueSchema(), e));
		if (n.isBlobSchema()) return (this.serdeContext?.base64Decoder ?? St)(t);
		if (n.isTimestampSchema()) switch (Ir(n, this.settings)) {
			case 5: return xn(t);
			case 6: return Sn(t);
			case 7: return bn(t);
			default: return console.warn("Missing timestamp format, parsing value with Date constructor:", t), new Date(t);
		}
		if (n.isStringSchema()) {
			let e = n.getMergedTraits().mediaType, r = t;
			if (e) return n.getMergedTraits().httpHeader && (r = this.base64ToUtf8(r)), (e === "application/json" || e.endsWith("+json")) && (r = cn.from(r)), r;
		}
		return n.isNumericSchema() ? Number(t) : n.isBigIntegerSchema() ? BigInt(t) : n.isBigDecimalSchema() ? new Dn(t, "bigDecimal") : n.isBooleanSchema() ? String(t).toLowerCase() === "true" : t;
	}
	base64ToUtf8(e) {
		return (this.serdeContext?.utf8Encoder ?? Tt)((this.serdeContext?.base64Decoder ?? St)(e));
	}
}, Rr = class extends Nr {
	codecDeserializer;
	stringDeserializer;
	constructor(e, t) {
		super(), this.codecDeserializer = e, this.stringDeserializer = new Lr(t);
	}
	setSerdeContext(e) {
		this.stringDeserializer.setSerdeContext(e), this.codecDeserializer.setSerdeContext(e), this.serdeContext = e;
	}
	read(e, t) {
		let n = Xe.of(e), r = n.getMergedTraits(), i = this.serdeContext?.utf8Encoder ?? Tt;
		if (r.httpHeader || r.httpResponseCode) return this.stringDeserializer.read(n, i(t));
		if (r.httpPayload) {
			if (n.isBlobSchema()) {
				let e = this.serdeContext?.utf8Decoder ?? te;
				return typeof t == "string" ? e(t) : t;
			}
			if (n.isStringSchema()) return "byteLength" in t ? i(t) : t;
		}
		return this.codecDeserializer.read(n, t);
	}
}, zr = class extends Nr {
	settings;
	stringBuffer = "";
	constructor(e) {
		super(), this.settings = e;
	}
	write(e, t) {
		let n = Xe.of(e);
		switch (typeof t) {
			case "object":
				if (t === null) {
					this.stringBuffer = "null";
					return;
				}
				if (n.isTimestampSchema()) {
					if (!(t instanceof Date)) throw Error(`@smithy/core/protocols - received non-Date value ${t} when schema expected Date in ${n.getName(!0)}`);
					switch (Ir(n, this.settings)) {
						case 5:
							this.stringBuffer = t.toISOString().replace(".000Z", "Z");
							break;
						case 6:
							this.stringBuffer = Gt(t);
							break;
						case 7:
							this.stringBuffer = String(t.getTime() / 1e3);
							break;
						default: console.warn("Missing timestamp format, using epoch seconds", t), this.stringBuffer = String(t.getTime() / 1e3);
					}
					return;
				}
				if (n.isBlobSchema() && "byteLength" in t) {
					this.stringBuffer = (this.serdeContext?.base64Encoder ?? Ct)(t);
					return;
				}
				if (n.isListSchema() && Array.isArray(t)) {
					let e = "";
					for (let r of t) {
						this.write([n.getValueSchema(), n.getMergedTraits()], r);
						let t = this.flush(), i = n.getValueSchema().isTimestampSchema() ? t : ln(t);
						e !== "" && (e += ", "), e += i;
					}
					this.stringBuffer = e;
					return;
				}
				this.stringBuffer = JSON.stringify(t, null, 2);
				break;
			case "string":
				let e = n.getMergedTraits().mediaType, r = t;
				if (e && ((e === "application/json" || e.endsWith("+json")) && (r = cn.from(r)), n.getMergedTraits().httpHeader)) {
					this.stringBuffer = (this.serdeContext?.base64Encoder ?? Ct)(r.toString());
					return;
				}
				this.stringBuffer = t;
				break;
			default: this.stringBuffer = n.isIdempotencyToken() ? Ar() : String(t);
		}
	}
	flush() {
		let e = this.stringBuffer;
		return this.stringBuffer = "", e;
	}
}, Br = class {
	codecSerializer;
	stringSerializer;
	buffer;
	constructor(e, t, n = new zr(t)) {
		this.codecSerializer = e, this.stringSerializer = n;
	}
	setSerdeContext(e) {
		this.codecSerializer.setSerdeContext(e), this.stringSerializer.setSerdeContext(e);
	}
	write(e, t) {
		let n = Xe.of(e), r = n.getMergedTraits();
		if (r.httpHeader || r.httpLabel || r.httpQuery) {
			this.stringSerializer.write(n, t), this.buffer = this.stringSerializer.flush();
			return;
		}
		return this.codecSerializer.write(n, t);
	}
	flush() {
		if (this.buffer !== void 0) {
			let e = this.buffer;
			return this.buffer = void 0, e;
		}
		return this.codecSerializer.flush();
	}
}, Vr = (e) => (e.logger && e.logger.constructor?.name !== "NoOpLogger" && e.requestHandler?.updateHttpClientConfig?.(Symbol.for("logger"), e.logger), {
	setHttpHandler(t) {
		e.requestHandler = t;
	},
	httpHandler() {
		return e.requestHandler;
	},
	updateHttpClientConfig(t, n) {
		e.requestHandler?.updateHttpClientConfig(t, n);
	},
	httpHandlerConfigs() {
		return e.requestHandler.httpHandlerConfigs();
	}
}), Hr = (e) => ({ requestHandler: e.httpHandler() }), Ur = "content-length";
function Wr(e) {
	return (t) => async (n) => {
		let r = n.request;
		if (l.isInstance(r)) {
			let { body: t, headers: n } = r;
			if (t && Object.keys(n).map((e) => e.toLowerCase()).indexOf(Ur) === -1) try {
				let n = e(t);
				n != null && (r.headers = {
					...r.headers,
					[Ur]: String(n)
				});
			} catch {}
		}
		return t({
			...n,
			request: r
		});
	};
}
var Gr = {
	step: "build",
	tags: ["SET_CONTENT_LENGTH", "CONTENT_LENGTH"],
	name: "contentLengthMiddleware",
	override: !0
}, Kr = (e) => ({ applyToStack: (t) => {
	t.add(Wr(e.bodyLengthChecker), Gr);
} }), qr = [
	"BandwidthLimitExceeded",
	"EC2ThrottledException",
	"LimitExceededException",
	"PriorRequestNotComplete",
	"ProvisionedThroughputExceededException",
	"RequestLimitExceeded",
	"RequestThrottled",
	"RequestThrottledException",
	"SlowDown",
	"ThrottledException",
	"Throttling",
	"ThrottlingException",
	"TooManyRequestsException",
	"TransactionInProgressException"
], Jr = [
	"TimeoutError",
	"RequestTimeout",
	"RequestTimeoutException"
], Yr = [
	500,
	502,
	503,
	504
], Xr = [
	"ECONNRESET",
	"ECONNREFUSED",
	"EPIPE",
	"ETIMEDOUT"
], Zr = [
	"EHOSTUNREACH",
	"ENETUNREACH",
	"ENOTFOUND",
	"EAI_AGAIN"
], Qr = (e) => e?.$retryable !== void 0, $r = (e) => e.$metadata?.clockSkewCorrected, ei = (e) => {
	let t = /* @__PURE__ */ new Set([
		"Failed to fetch",
		"NetworkError when attempting to fetch resource",
		"The Internet connection appears to be offline",
		"Load failed",
		"Network request failed"
	]);
	return e && e instanceof TypeError ? t.has(e.message) : !1;
}, ti = (e) => e.$metadata?.httpStatusCode === 429 || qr.includes(e.name) || e.$retryable?.throttling == 1, ni = (e, t = 0) => e?.name !== "AbortError" && (Qr(e) || $r(e) || e.name === "InvalidSignatureException" && e.message?.includes("Signature expired") || Jr.includes(e.name) || Xr.includes(e?.code || "") || Zr.includes(e?.code || "") || Yr.includes(e.$metadata?.httpStatusCode || 0) || ei(e) || ii(e) || e.cause !== void 0 && t <= 10 && ni(e.cause, t + 1)), ri = (e) => {
	if (e.$metadata?.httpStatusCode !== void 0) {
		let t = e.$metadata.httpStatusCode;
		return 500 <= t && t <= 599 && !ni(e);
	}
	return !1;
};
function ii(e) {
	return e.code === "ERR_HTTP2_STREAM_ERROR" && e.message.includes("NGHTTP2_REFUSED_STREAM");
}
var ai = 2e4, oi = "amz-sdk-invocation-id", si = "amz-sdk-request";
function ci(e, t) {
	if (ve.isInstance(e)) for (let n in e.headers) {
		if (!p(e.headers, n)) continue;
		let r = n.toLowerCase();
		if (r === "retry-after") {
			let r = e.headers[n], i = NaN;
			if (r.endsWith("GMT")) try {
				i = (Yt(r).getTime() - Date.now()) / 1e3;
			} catch (e) {
				t?.trace?.("Failed to parse retry-after header"), t?.trace?.(e);
			}
			else r.match(/ GMT, ((\d+)|(\d+\.\d+))$/) ? i = Number(r.match(/ GMT, ([\d.]+)$/)?.[1]) : r.match(/^((\d+)|(\d+\.\d+))$/) ? i = Number(r) : Date.parse(r) >= Date.now() && (i = (Date.parse(r) - Date.now()) / 1e3);
			return isNaN(i) ? void 0 : new Date(Date.now() + i * 1e3);
		}
		if (r === "x-amz-retry-after") {
			let r = e.headers[n], i = Number(r);
			if (isNaN(i)) {
				t?.trace?.(`Failed to parse x-amz-retry-after=${r}`);
				return;
			}
			return new Date(Date.now() + i);
		}
	}
}
var li = (e) => e instanceof Error ? e : e instanceof Object ? Object.assign(/* @__PURE__ */ Error(), e) : Error(typeof e == "string" ? e : `AWS SDK error wrapper for ${e}`);
function ui(e) {
	return (t) => (n, r) => async (i) => {
		let a = await t.retryStrategy(), o = await t.maxAttempts();
		if (fi(a)) {
			a = a;
			let s = await a.acquireInitialRetryToken((r.partition_id ?? "") + (r.__retryLongPoll ? ":longpoll" : "")), c = /* @__PURE__ */ Error(), u = 0, d = 0, { request: f } = i, ee = l.isInstance(f);
			for (ee && (f.headers[oi] = kr());;) try {
				ee && (f.headers[si] = `attempt=${u + 1}; max=${o}`);
				let { response: e, output: t } = await n(i);
				return a.recordSuccess(s), t.$metadata.attempts = u + 1, t.$metadata.totalRetryDelay = d, {
					response: e,
					output: t
				};
			} catch (n) {
				let i = pi(n, t.logger);
				if (c = li(n), ee && e(f)) throw (r.logger instanceof _t ? console : r.logger)?.warn("An error was encountered in a non-retryable streaming request."), c;
				try {
					s = await a.refreshRetryTokenForRetry(s, i);
				} catch {
					throw c.$metadata || (c.$metadata = {}), c.$metadata.attempts = u + 1, c.$metadata.totalRetryDelay = d, c;
				}
				u = s.getRetryCount();
				let o = s.getRetryDelay();
				d += (s?.$retryLog?.acquisitionDelay ?? 0) + o, o > 0 && await di(o);
			}
		} else return a = a, a?.mode && (r.userAgent = [...r.userAgent || [], ["cfg/retry-mode", a.mode]]), a.retry(n, i);
	};
}
var di = (e) => new Promise((t) => setTimeout(t, e)), fi = (e) => e.acquireInitialRetryToken !== void 0 && e.refreshRetryTokenForRetry !== void 0 && e.recordSuccess !== void 0, pi = (e, t) => {
	let n = {
		error: e,
		errorType: mi(e)
	}, r = ci(e.$response, t);
	return r && (n.retryAfterHint = r), n;
}, mi = (e) => ti(e) ? "THROTTLING" : ni(e) ? "TRANSIENT" : ri(e) ? "SERVER_ERROR" : "CLIENT_ERROR", hi = {
	name: "retryMiddleware",
	tags: ["RETRY"],
	step: "finalizeRequest",
	priority: "high",
	override: !0
};
function gi(e) {
	let t = ui(e);
	return (e) => ({ applyToStack: (n) => {
		n.add(t(e), hi);
	} });
}
var _i = class e {
	static setTimeoutFn = (e, t) => setTimeout(e, t);
	beta;
	minCapacity;
	minFillRate;
	scaleConstant;
	smooth;
	enabled = !1;
	availableTokens = 0;
	lastMaxRate = 0;
	measuredTxRate = 0;
	requestCount = 0;
	fillRate;
	lastThrottleTime;
	lastTimestamp = 0;
	lastTxRateBucket;
	maxCapacity;
	timeWindow = 0;
	constructor(e) {
		this.beta = e?.beta ?? .7, this.minCapacity = e?.minCapacity ?? 1, this.minFillRate = e?.minFillRate ?? .5, this.scaleConstant = e?.scaleConstant ?? .4, this.smooth = e?.smooth ?? .8, this.lastThrottleTime = this.getCurrentTimeInSeconds(), this.lastTxRateBucket = Math.floor(this.getCurrentTimeInSeconds()), this.fillRate = this.minFillRate, this.maxCapacity = this.minCapacity;
	}
	async getSendToken() {
		return this.acquireTokenBucket(1);
	}
	updateClientSendingRate(e) {
		let t;
		this.updateMeasuredRate();
		let n = e;
		if (n?.errorType === "THROTTLING" || ti(n?.error ?? e)) {
			let e = this.enabled ? Math.min(this.measuredTxRate, this.fillRate) : this.measuredTxRate;
			this.lastMaxRate = e, this.calculateTimeWindow(), this.lastThrottleTime = this.getCurrentTimeInSeconds(), t = this.cubicThrottle(e), this.enableTokenBucket();
		} else this.calculateTimeWindow(), t = this.cubicSuccess(this.getCurrentTimeInSeconds());
		let r = Math.min(t, 2 * this.measuredTxRate);
		this.updateTokenBucketRate(r);
	}
	getCurrentTimeInSeconds() {
		return Date.now() / 1e3;
	}
	async acquireTokenBucket(t) {
		if (this.enabled) {
			for (this.refillTokenBucket(); t > this.availableTokens;) {
				let n = (t - this.availableTokens) / this.fillRate * 1e3;
				await new Promise((t) => e.setTimeoutFn(t, n)), this.refillTokenBucket();
			}
			this.availableTokens -= t;
		}
	}
	refillTokenBucket() {
		let e = this.getCurrentTimeInSeconds();
		if (!this.lastTimestamp) {
			this.lastTimestamp = e;
			return;
		}
		let t = (e - this.lastTimestamp) * this.fillRate;
		this.availableTokens = Math.min(this.maxCapacity, this.availableTokens + t), this.lastTimestamp = e;
	}
	calculateTimeWindow() {
		this.timeWindow = this.getPrecise((this.lastMaxRate * (1 - this.beta) / this.scaleConstant) ** (1 / 3));
	}
	cubicThrottle(e) {
		return this.getPrecise(e * this.beta);
	}
	cubicSuccess(e) {
		return this.getPrecise(this.scaleConstant * (e - this.lastThrottleTime - this.timeWindow) ** 3 + this.lastMaxRate);
	}
	enableTokenBucket() {
		this.enabled = !0;
	}
	updateTokenBucketRate(e) {
		this.refillTokenBucket(), this.fillRate = Math.max(e, this.minFillRate), this.maxCapacity = Math.max(e, this.minCapacity), this.availableTokens = Math.min(this.availableTokens, this.maxCapacity);
	}
	updateMeasuredRate() {
		let e = this.getCurrentTimeInSeconds(), t = Math.floor(e * 2) / 2;
		if (this.requestCount++, t > this.lastTxRateBucket) {
			let e = this.requestCount / (t - this.lastTxRateBucket);
			this.measuredTxRate = this.getPrecise(e * this.smooth + this.measuredTxRate * (1 - this.smooth)), this.requestCount = 0, this.lastTxRateBucket = t;
		}
	}
	getPrecise(e) {
		return parseFloat(e.toFixed(8));
	}
}, vi = class e {
	static v2026 = typeof process < "u" && process.env?.SMITHY_NEW_RETRIES_2026 === "true";
	static delay() {
		return e.v2026 ? 50 : 100;
	}
	static throttlingDelay() {
		return e.v2026 ? 1e3 : 500;
	}
	static cost() {
		return e.v2026 ? 14 : 5;
	}
	static throttlingCost() {
		return e.v2026 ? 5 : 10;
	}
	static modifiedCostType() {
		return e.v2026 ? "THROTTLING" : "TRANSIENT";
	}
}, yi = class {
	x = vi.delay();
	computeNextBackoffDelay(e) {
		let t = Math.random() * Math.min(this.x * 2 ** e, ai);
		return Math.floor(t);
	}
	setDelayBase(e) {
		this.x = e;
	}
}, bi = class {
	delay;
	count;
	cost;
	longPoll;
	$retryLog = { acquisitionDelay: 0 };
	constructor(e, t, n, r) {
		this.delay = e, this.count = t, this.cost = n, this.longPoll = r;
	}
	getRetryCount() {
		return this.count;
	}
	getRetryDelay() {
		return Math.min(ai, this.delay);
	}
	getRetryCost() {
		return this.cost;
	}
	isLongPoll() {
		return this.longPoll;
	}
}, xi;
(function(e) {
	e.STANDARD = "standard", e.ADAPTIVE = "adaptive";
})(xi ||= {});
var Si = xi.STANDARD, Ci = {
	incompatible: 1,
	attempts: 2,
	capacity: 3
}, wi = class {
	mode = xi.STANDARD;
	retryBackoffStrategy;
	capacity = 500;
	maxAttemptsProvider;
	baseDelay;
	constructor(e) {
		typeof e == "number" ? this.maxAttemptsProvider = async () => e : typeof e == "function" ? this.maxAttemptsProvider = e : e && typeof e == "object" && (this.maxAttemptsProvider = async () => e.maxAttempts, this.baseDelay = e.baseDelay, this.retryBackoffStrategy = e.backoff), this.maxAttemptsProvider ??= async () => 3, this.baseDelay ??= vi.delay(), this.retryBackoffStrategy ??= new yi();
	}
	async acquireInitialRetryToken(e) {
		return new bi(vi.delay(), 0, void 0, vi.v2026 && e.includes(":longpoll"));
	}
	async refreshRetryTokenForRetry(e, t) {
		let n = await this.getMaxAttempts(), r = this.retryCode(e, t, n), i = r === 0, a = e.isLongPoll?.();
		if (i || a) {
			let n = t.errorType;
			this.retryBackoffStrategy.setDelayBase(n === "THROTTLING" ? vi.throttlingDelay() : this.baseDelay);
			let o = this.retryBackoffStrategy.computeNextBackoffDelay(e.getRetryCount()), s = o;
			if (t.retryAfterHint instanceof Date && (s = Math.max(o, Math.min(t.retryAfterHint.getTime() - Date.now(), o + 5e3))), i) {
				let t = this.getCapacityCost(n);
				this.capacity -= t;
				let r = new bi(0, e.getRetryCount() + 1, t, e.isLongPoll?.() ?? !1);
				return await new Promise((e) => setTimeout(e, s)), r.$retryLog.acquisitionDelay = s, r;
			}
			{
				let e = vi.v2026 && r === Ci.capacity && a ? s : 0;
				e > 0 && await new Promise((t) => setTimeout(t, e));
			}
		}
		throw Error("No retry token available");
	}
	recordSuccess(e) {
		this.capacity = Math.min(500, this.capacity + (e.getRetryCost() ?? 1));
	}
	getCapacity() {
		return this.capacity;
	}
	async maxAttempts() {
		return this.maxAttemptsProvider();
	}
	async getMaxAttempts() {
		try {
			return await this.maxAttemptsProvider();
		} catch {
			return console.warn("Max attempts provider could not resolve. Using default of 3"), 3;
		}
	}
	retryCode(e, t, n) {
		let r = e.getRetryCount() + 1, i = this.isRetryableError(t.errorType) ? 0 : Ci.incompatible, a = r < n ? 0 : Ci.attempts, o = this.capacity >= this.getCapacityCost(t.errorType) ? 0 : Ci.capacity;
		return i || a || o;
	}
	getCapacityCost(e) {
		return e === vi.modifiedCostType() ? vi.throttlingCost() : vi.cost();
	}
	isRetryableError(e) {
		return e === "THROTTLING" || e === "TRANSIENT";
	}
}, Ti = class {
	mode = xi.ADAPTIVE;
	rateLimiter;
	standardRetryStrategy;
	constructor(e, t) {
		let { rateLimiter: n } = t ?? {};
		this.rateLimiter = n ?? new _i(), this.standardRetryStrategy = t ? new wi({
			maxAttempts: typeof e == "number" ? e : 3,
			...t
		}) : new wi(e);
	}
	async acquireInitialRetryToken(e) {
		let t = await this.standardRetryStrategy.acquireInitialRetryToken(e);
		return await this.rateLimiter.getSendToken(), t;
	}
	async refreshRetryTokenForRetry(e, t) {
		this.rateLimiter.updateClientSendingRate(t);
		let n = await this.standardRetryStrategy.refreshRetryTokenForRetry(e, t);
		return await this.rateLimiter.getSendToken(), n;
	}
	recordSuccess(e) {
		this.rateLimiter.updateClientSendingRate({}), this.standardRetryStrategy.recordSuccess(e);
	}
	async maxAttemptsProvider() {
		return this.standardRetryStrategy.maxAttempts();
	}
}, Ei = (e, t) => {
	let { retryStrategy: n, retryMode: i } = e, { defaultMaxAttempts: a = 3, defaultBaseDelay: o = vi.delay() } = t ?? {}, s = r(e.maxAttempts ?? a), c = n ? Promise.resolve(n) : void 0, l = async () => {
		let e = await s();
		return await r(i)() === xi.ADAPTIVE ? new Ti(s, {
			maxAttempts: e,
			baseDelay: o
		}) : new wi({
			maxAttempts: e,
			baseDelay: o
		});
	};
	return Object.assign(e, {
		maxAttempts: s,
		retryStrategy: () => c ??= l()
	});
}, Di = gi(ue);
vi.v2026 ||= typeof process == "object" && process.env?.AWS_NEW_RETRIES_2026 === "true";
function Oi(e, t, n) {
	e.__aws_sdk_context ? e.__aws_sdk_context.features || (e.__aws_sdk_context.features = {}) : e.__aws_sdk_context = { features: {} }, e.__aws_sdk_context.features[t] = n;
}
function ki(e) {
	return e;
}
var Ai = (e) => (t) => async (n) => {
	if (!l.isInstance(n.request)) return t(n);
	let { request: r } = n, { handlerProtocol: i = "" } = e.requestHandler.metadata || {};
	if (i.indexOf("h2") >= 0 && !r.headers[":authority"]) delete r.headers.host, r.headers[":authority"] = r.hostname + (r.port ? ":" + r.port : "");
	else if (!r.headers.host) {
		let e = r.hostname;
		r.port != null && (e += `:${r.port}`), r.headers.host = e;
	}
	return t(n);
}, ji = {
	name: "hostHeaderMiddleware",
	step: "build",
	priority: "low",
	tags: ["HOST"],
	override: !0
}, Mi = (e) => ({ applyToStack: (t) => {
	t.add(Ai(e), ji);
} }), Ni = () => (e, t) => async (n) => {
	try {
		let r = await e(n), { clientName: i, commandName: a, logger: o, dynamoDbDocumentClientOptions: s = {} } = t, { overrideInputFilterSensitiveLog: c, overrideOutputFilterSensitiveLog: l } = s, u = c ?? t.inputFilterSensitiveLog, d = l ?? t.outputFilterSensitiveLog, { $metadata: f, ...ee } = r.output;
		return o?.info?.({
			clientName: i,
			commandName: a,
			input: u(n.input),
			output: d(ee),
			metadata: f
		}), r;
	} catch (e) {
		let { clientName: r, commandName: i, logger: a, dynamoDbDocumentClientOptions: o = {} } = t, { overrideInputFilterSensitiveLog: s } = o, c = s ?? t.inputFilterSensitiveLog;
		throw a?.error?.({
			clientName: r,
			commandName: i,
			input: c(n.input),
			error: e,
			metadata: e.$metadata
		}), e;
	}
}, Pi = {
	name: "loggerMiddleware",
	tags: ["LOGGER"],
	step: "initialize",
	override: !0
}, Fi = (e) => ({ applyToStack: (e) => {
	e.add(Ni(), Pi);
} }), Ii = (e) => ({ applyToStack: (e) => {} }), Li = (e, t) => {
	if (!t || t.length === 0) return e;
	let n = [];
	for (let r of t) for (let t of e) t.schemeId.split("#")[1] === r && n.push(t);
	for (let t of e) n.find(({ schemeId: e }) => e === t.schemeId) || n.push(t);
	return n;
};
function Ri(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) t.set(n.schemeId, n);
	return t;
}
var zi = (e, t) => (n, r) => async (i) => {
	let a = Li(e.httpAuthSchemeProvider(await t.httpAuthSchemeParametersProvider(e, r, i.input)), e.authSchemePreference ? await e.authSchemePreference() : []), s = Ri(e.httpAuthSchemes), c = o(r), l = [];
	for (let n of a) {
		let i = s.get(n.schemeId);
		if (!i) {
			l.push(`HttpAuthScheme \`${n.schemeId}\` was not enabled for this service.`);
			continue;
		}
		let a = i.identityProvider(await t.identityProviderConfigProvider(e));
		if (!a) {
			l.push(`HttpAuthScheme \`${n.schemeId}\` did not have an IdentityProvider configured.`);
			continue;
		}
		let { identityProperties: o = {}, signingProperties: u = {} } = n.propertiesExtractor?.(e, r) || {};
		n.identityProperties = Object.assign(n.identityProperties || {}, o), n.signingProperties = Object.assign(n.signingProperties || {}, u), c.selectedHttpAuthScheme = {
			httpAuthOption: n,
			identity: await a(n.identityProperties),
			signer: i.signer
		};
		break;
	}
	if (!c.selectedHttpAuthScheme) throw Error(l.join("\n"));
	return n(i);
}, Bi = {
	step: "serialize",
	tags: ["HTTP_AUTH_SCHEME"],
	name: "httpAuthSchemeMiddleware",
	override: !0,
	relation: "before",
	toMiddleware: "endpointV2Middleware"
}, Vi = (e, { httpAuthSchemeParametersProvider: t, identityProviderConfigProvider: n }) => ({ applyToStack: (r) => {
	r.addRelativeTo(zi(e, {
		httpAuthSchemeParametersProvider: t,
		identityProviderConfigProvider: n
	}), Bi);
} }), Hi = (e) => (e) => {
	throw e;
}, Ui = (e, t) => {}, Wi = (e) => (e, t) => async (n) => {
	if (!l.isInstance(n.request)) return e(n);
	let r = o(t).selectedHttpAuthScheme;
	if (!r) throw Error("No HttpAuthScheme was selected: unable to sign request");
	let { httpAuthOption: { signingProperties: i = {} }, identity: a, signer: s } = r, c = await e({
		...n,
		request: await s.sign(n.request, a, i)
	}).catch((s.errorHandler || Hi)(i));
	return (s.successHandler || Ui)(c.response, i), c;
}, Gi = {
	step: "finalizeRequest",
	tags: ["HTTP_SIGNING"],
	name: "httpSigningMiddleware",
	aliases: [
		"apiKeyMiddleware",
		"tokenMiddleware",
		"awsAuthMiddleware"
	],
	override: !0,
	relation: "after",
	toMiddleware: "retryMiddleware"
}, Ki = (e) => ({ applyToStack: (t) => {
	t.addRelativeTo(Wi(e), Gi);
} }), qi = (e) => {
	if (typeof e == "function") return e;
	let t = Promise.resolve(e);
	return () => t;
}, Ji = async (e, t, n, r = (e) => e, ...i) => {
	let a = new e(n);
	return a = r(a) ?? a, await t.send(a, ...i);
};
function Yi(e, t, n, r, i) {
	return async function* (a, o, ...s) {
		let c = o, l = a.startingToken ?? c[n], u = !0, d;
		for (; u;) {
			if (c[n] = l, i && (c[i] = c[i] ?? a.pageSize), a.client instanceof e) d = await Ji(t, a.client, o, a.withCommand, ...s);
			else throw Error(`Invalid client, expected instance of ${e.name}`);
			yield d;
			let f = l;
			l = Xi(d, r), u = !(!l || a.stopOnSameToken && l === f);
		}
		return void 0;
	};
}
var Xi = (e, t) => {
	let n = e, r = t.split(".");
	for (let e of r) {
		if (!n || typeof n != "object") return;
		n = n[e];
	}
	return n;
}, Zi = class {
	authSchemes = /* @__PURE__ */ new Map();
	constructor(e) {
		for (let t in e) {
			if (!p(e, t)) continue;
			let n = e[t];
			n !== void 0 && this.authSchemes.set(t, n);
		}
	}
	getIdentityProvider(e) {
		return this.authSchemes.get(e);
	}
}, Qi = ((e) => function(t) {
	return $i(t) && t.expiration.getTime() - Date.now() < e;
})(3e5), $i = (e) => e.expiration !== void 0, ea = (e, t, n) => {
	if (e === void 0) return;
	let r = typeof e == "function" ? e : async () => Promise.resolve(e), i, a, o, s = !1, c = async (e) => {
		a ||= r(e);
		try {
			i = await a, o = !0, s = !1;
		} finally {
			a = void 0;
		}
		return i;
	};
	return t === void 0 ? async (e) => ((!o || e?.forceRefresh) && (i = await c(e)), i) : async (e) => ((!o || e?.forceRefresh) && (i = await c(e)), s ? i : n(i) ? (t(i) && await c(e), i) : (s = !0, i));
};
function ta(e) {
	return e === void 0 || typeof e == "string" && e.length <= 50;
}
function na(e) {
	let t = qi(e.userAgentAppId ?? void 0), { customUserAgent: n } = e;
	return Object.assign(e, {
		customUserAgent: typeof n == "string" ? [[n]] : n,
		userAgentAppId: async () => {
			let n = await t();
			if (!ta(n)) {
				let t = e.logger?.constructor?.name === "NoOpLogger" || !e.logger ? console : e.logger;
				typeof n == "string" ? n.length > 50 && t?.warn("The provided userAgentAppId exceeds the maximum length of 50 characters.") : t?.warn("userAgentAppId must be a string or undefined.");
			}
			return n;
		}
	});
}
var ra = {
	partitions: [
		{
			id: "aws",
			outputs: {
				dnsSuffix: "amazonaws.com",
				dualStackDnsSuffix: "api.aws",
				implicitGlobalRegion: "us-east-1",
				name: "aws",
				supportsDualStack: !0,
				supportsFIPS: !0
			},
			regionRegex: "^(us|eu|ap|sa|ca|me|af|il|mx)\\-\\w+\\-\\d+$",
			regions: {
				"af-south-1": { description: "Africa (Cape Town)" },
				"ap-east-1": { description: "Asia Pacific (Hong Kong)" },
				"ap-east-2": { description: "Asia Pacific (Taipei)" },
				"ap-northeast-1": { description: "Asia Pacific (Tokyo)" },
				"ap-northeast-2": { description: "Asia Pacific (Seoul)" },
				"ap-northeast-3": { description: "Asia Pacific (Osaka)" },
				"ap-south-1": { description: "Asia Pacific (Mumbai)" },
				"ap-south-2": { description: "Asia Pacific (Hyderabad)" },
				"ap-southeast-1": { description: "Asia Pacific (Singapore)" },
				"ap-southeast-2": { description: "Asia Pacific (Sydney)" },
				"ap-southeast-3": { description: "Asia Pacific (Jakarta)" },
				"ap-southeast-4": { description: "Asia Pacific (Melbourne)" },
				"ap-southeast-5": { description: "Asia Pacific (Malaysia)" },
				"ap-southeast-6": { description: "Asia Pacific (New Zealand)" },
				"ap-southeast-7": { description: "Asia Pacific (Thailand)" },
				"aws-global": { description: "aws global region" },
				"ca-central-1": { description: "Canada (Central)" },
				"ca-west-1": { description: "Canada West (Calgary)" },
				"eu-central-1": { description: "Europe (Frankfurt)" },
				"eu-central-2": { description: "Europe (Zurich)" },
				"eu-north-1": { description: "Europe (Stockholm)" },
				"eu-south-1": { description: "Europe (Milan)" },
				"eu-south-2": { description: "Europe (Spain)" },
				"eu-west-1": { description: "Europe (Ireland)" },
				"eu-west-2": { description: "Europe (London)" },
				"eu-west-3": { description: "Europe (Paris)" },
				"il-central-1": { description: "Israel (Tel Aviv)" },
				"me-central-1": { description: "Middle East (UAE)" },
				"me-south-1": { description: "Middle East (Bahrain)" },
				"mx-central-1": { description: "Mexico (Central)" },
				"sa-east-1": { description: "South America (Sao Paulo)" },
				"us-east-1": { description: "US East (N. Virginia)" },
				"us-east-2": { description: "US East (Ohio)" },
				"us-west-1": { description: "US West (N. California)" },
				"us-west-2": { description: "US West (Oregon)" }
			}
		},
		{
			id: "aws-cn",
			outputs: {
				dnsSuffix: "amazonaws.com.cn",
				dualStackDnsSuffix: "api.amazonwebservices.com.cn",
				implicitGlobalRegion: "cn-northwest-1",
				name: "aws-cn",
				supportsDualStack: !0,
				supportsFIPS: !0
			},
			regionRegex: "^cn\\-\\w+\\-\\d+$",
			regions: {
				"aws-cn-global": { description: "aws-cn global region" },
				"cn-north-1": { description: "China (Beijing)" },
				"cn-northwest-1": { description: "China (Ningxia)" }
			}
		},
		{
			id: "aws-eusc",
			outputs: {
				dnsSuffix: "amazonaws.eu",
				dualStackDnsSuffix: "api.amazonwebservices.eu",
				implicitGlobalRegion: "eusc-de-east-1",
				name: "aws-eusc",
				supportsDualStack: !0,
				supportsFIPS: !0
			},
			regionRegex: "^eusc\\-(de)\\-\\w+\\-\\d+$",
			regions: { "eusc-de-east-1": { description: "AWS European Sovereign Cloud (Germany)" } }
		},
		{
			id: "aws-iso",
			outputs: {
				dnsSuffix: "c2s.ic.gov",
				dualStackDnsSuffix: "api.aws.ic.gov",
				implicitGlobalRegion: "us-iso-east-1",
				name: "aws-iso",
				supportsDualStack: !0,
				supportsFIPS: !0
			},
			regionRegex: "^us\\-iso\\-\\w+\\-\\d+$",
			regions: {
				"aws-iso-global": { description: "aws-iso global region" },
				"us-iso-east-1": { description: "US ISO East" },
				"us-iso-west-1": { description: "US ISO WEST" }
			}
		},
		{
			id: "aws-iso-b",
			outputs: {
				dnsSuffix: "sc2s.sgov.gov",
				dualStackDnsSuffix: "api.aws.scloud",
				implicitGlobalRegion: "us-isob-east-1",
				name: "aws-iso-b",
				supportsDualStack: !0,
				supportsFIPS: !0
			},
			regionRegex: "^us\\-isob\\-\\w+\\-\\d+$",
			regions: {
				"aws-iso-b-global": { description: "aws-iso-b global region" },
				"us-isob-east-1": { description: "US ISOB East (Ohio)" },
				"us-isob-west-1": { description: "US ISOB West" }
			}
		},
		{
			id: "aws-iso-e",
			outputs: {
				dnsSuffix: "cloud.adc-e.uk",
				dualStackDnsSuffix: "api.cloud-aws.adc-e.uk",
				implicitGlobalRegion: "eu-isoe-west-1",
				name: "aws-iso-e",
				supportsDualStack: !0,
				supportsFIPS: !0
			},
			regionRegex: "^eu\\-isoe\\-\\w+\\-\\d+$",
			regions: {
				"aws-iso-e-global": { description: "aws-iso-e global region" },
				"eu-isoe-west-1": { description: "EU ISOE West" }
			}
		},
		{
			id: "aws-iso-f",
			outputs: {
				dnsSuffix: "csp.hci.ic.gov",
				dualStackDnsSuffix: "api.aws.hci.ic.gov",
				implicitGlobalRegion: "us-isof-south-1",
				name: "aws-iso-f",
				supportsDualStack: !0,
				supportsFIPS: !0
			},
			regionRegex: "^us\\-isof\\-\\w+\\-\\d+$",
			regions: {
				"aws-iso-f-global": { description: "aws-iso-f global region" },
				"us-isof-east-1": { description: "US ISOF EAST" },
				"us-isof-south-1": { description: "US ISOF SOUTH" }
			}
		},
		{
			id: "aws-us-gov",
			outputs: {
				dnsSuffix: "amazonaws.com",
				dualStackDnsSuffix: "api.aws",
				implicitGlobalRegion: "us-gov-west-1",
				name: "aws-us-gov",
				supportsDualStack: !0,
				supportsFIPS: !0
			},
			regionRegex: "^us\\-gov\\-\\w+\\-\\d+$",
			regions: {
				"aws-us-gov-global": { description: "aws-us-gov global region" },
				"us-gov-east-1": { description: "AWS GovCloud (US-East)" },
				"us-gov-west-1": { description: "AWS GovCloud (US-West)" }
			}
		}
	],
	version: "1.1"
}, ia = "", aa = (e) => {
	let { partitions: t } = ra;
	for (let n of t) {
		let { regions: t, outputs: r } = n;
		for (let [n, i] of Object.entries(t)) if (n === e) return {
			...r,
			...i
		};
	}
	for (let n of t) {
		let { regionRegex: t, outputs: r } = n;
		if (new RegExp(t).test(e)) return { ...r };
	}
	let n = t.find((e) => e.id === "aws");
	if (!n) throw Error("Provided region was not found in the partition array or regex, and default partition with id 'aws' doesn't exist.");
	return { ...n.outputs };
}, oa = () => ia, sa = /\d{12}\.ddb/;
async function ca(e, t, n) {
	if (n.request?.headers?.["smithy-protocol"] === "rpc-v2-cbor" && Oi(e, "PROTOCOL_RPC_V2_CBOR", "M"), typeof t.retryStrategy == "function") {
		let n = await t.retryStrategy();
		if (typeof n.mode == "string") switch (n.mode) {
			case xi.ADAPTIVE:
				Oi(e, "RETRY_MODE_ADAPTIVE", "F");
				break;
			case xi.STANDARD: Oi(e, "RETRY_MODE_STANDARD", "E");
		}
	}
	if (typeof t.accountIdEndpointMode == "function") {
		let n = e.endpointV2;
		switch (String(n?.url?.hostname).match(sa) && Oi(e, "ACCOUNT_ID_ENDPOINT", "O"), await t.accountIdEndpointMode?.()) {
			case "disabled":
				Oi(e, "ACCOUNT_ID_MODE_DISABLED", "Q");
				break;
			case "preferred":
				Oi(e, "ACCOUNT_ID_MODE_PREFERRED", "P");
				break;
			case "required": Oi(e, "ACCOUNT_ID_MODE_REQUIRED", "R");
		}
	}
	let r = e.__smithy_context?.selectedHttpAuthScheme?.identity;
	if (r?.$source) {
		let t = r;
		t.accountId && Oi(e, "RESOLVED_ACCOUNT_ID", "T");
		for (let [n, r] of Object.entries(t.$source ?? {})) Oi(e, n, r);
	}
}
var la = "user-agent", ua = "x-amz-user-agent", da = /[^!$%&'*+\-.^_`|~\w]/g, fa = /[^!$%&'*+\-.^_`|~\w#]/g, pa = 1024;
function ma(e) {
	let t = "";
	for (let n in e) {
		let r = e[n];
		if (t.length + r.length + 1 <= pa) {
			t.length ? t += "," + r : t += r;
			continue;
		}
		break;
	}
	return t;
}
var ha = (e) => (t, n) => async (r) => {
	let { request: i } = r;
	if (!l.isInstance(i)) return t(r);
	let { headers: a } = i, o = n?.userAgent?.map(ga) || [], s = (await e.defaultUserAgentProvider()).map(ga);
	await ca(n, e, r);
	let c = n;
	s.push(`m/${ma(Object.assign({}, n.__smithy_context?.features, c.__aws_sdk_context?.features))}`);
	let u = e?.customUserAgent?.map(ga) || [], d = await e.userAgentAppId();
	d && s.push(ga(["app", `${d}`]));
	let f = oa(), ee = (f ? [f] : []).concat([
		...s,
		...o,
		...u
	]).join(" "), p = [...s.filter((e) => e.startsWith("aws-sdk-")), ...u].join(" ");
	return e.runtime === "browser" ? a[ua] = ee : (p && (a[ua] = a["x-amz-user-agent"] ? `${a[la]} ${p}` : p), a[la] = ee), t({
		...r,
		request: i
	});
}, ga = (e) => {
	let t = e[0].split("/").map((e) => e.replace(da, "-")).join("/"), n = e[1]?.replace(fa, "-"), r = t.indexOf("/"), i = t.substring(0, r), a = t.substring(r + 1);
	return i === "api" && (a = a.toLowerCase()), [
		i,
		a,
		n
	].filter((e) => e && e.length > 0).reduce((e, t, n) => {
		switch (n) {
			case 0: return t;
			case 1: return `${e}/${t}`;
			default: return `${e}#${t}`;
		}
	}, "");
}, _a = {
	name: "getUserAgentMiddleware",
	step: "build",
	priority: "low",
	tags: ["SET_USER_AGENT", "USER_AGENT"],
	override: !0
}, va = (e) => ({ applyToStack: (t) => {
	t.add(ha(e), _a);
} }), ya = ({ serviceId: e, clientVersion: t }) => async (n) => {
	let r = typeof window < "u" ? window.navigator : void 0, i = r?.userAgent ?? "", a = r?.userAgentData?.platform ?? ba.os(i) ?? "other", o = r?.userAgentData?.brands ?? [], s = o[o.length - 1], c = s?.brand ?? ba.browser(i) ?? "unknown", l = s?.version ?? "unknown", u = [
		["aws-sdk-js", t],
		["ua", "2.1"],
		[`os/${a}`, void 0],
		["lang/js"],
		["md/browser", `${c}_${l}`]
	];
	e && u.push([`api/${e}`, t]);
	let d = await n?.userAgentAppId?.();
	return d && u.push([`app/${d}`]), u;
}, ba = {
	os(e) {
		if (/iPhone|iPad|iPod/.test(e)) return "iOS";
		if (/Macintosh|Mac OS X/.test(e)) return "macOS";
		if (/Windows NT/.test(e)) return "Windows";
		if (/Android/.test(e)) return "Android";
		if (/Linux/.test(e)) return "Linux";
	},
	browser(e) {
		if (/EdgiOS|EdgA|Edg\//.test(e)) return "Microsoft Edge";
		if (/Firefox\//.test(e)) return "Firefox";
		if (/Chrome\//.test(e)) return "Chrome";
		if (/Safari\//.test(e)) return "Safari";
	}
}, xa = (e, t = !1) => {
	if (t) {
		for (let t of e.split(".")) if (!xa(t)) return !1;
		return !0;
	}
	return !(!be(e) || e.length < 3 || e.length > 63 || e !== e.toLowerCase() || Gn(e));
}, Sa = ":", Ca = "/", wa = {
	isVirtualHostableS3Bucket: xa,
	parseArn: (e) => {
		let t = e.split(Sa);
		if (t.length < 6) return null;
		let [n, r, i, a, o, ...s] = t;
		return n !== "arn" || r === "" || i === "" || s.join(Sa) === "" ? null : {
			partition: r,
			service: i,
			region: a,
			accountId: o,
			resourceId: s.map((e) => e.split(Ca)).flat()
		};
	},
	partition: aa
};
In.aws = wa;
var Ta = (e, t, n) => {
	let r, i, a, o = !1, s = async () => {
		i ||= e();
		try {
			r = await i, a = !0, o = !1;
		} finally {
			i = void 0;
		}
		return r;
	};
	return t === void 0 ? async (e) => ((!a || e?.forceRefresh) && (r = await s()), r) : async (e) => ((!a || e?.forceRefresh) && (r = await s()), o ? r : n && !n(r) ? (o = !0, r) : (t(r) && await s(), r));
}, Ea = /* @__PURE__ */ new Set(), Da = (e, t = be) => {
	if (!Ea.has(e) && !t(e)) {
		if (e === "*") console.warn("@smithy/config-resolver WARN - Please use the caller region instead of \"*\". See \"sigv4a\" in https://github.com/aws/aws-sdk-js-v3/blob/main/supplemental-docs/CLIENTS.md.");
		else throw Error(`Region not accepted: region="${e}" is not a valid hostname component.`);
	} else Ea.add(e);
}, Oa = (e) => typeof e == "string" && (e.startsWith("fips-") || e.endsWith("-fips")), ka = (e) => Oa(e) ? ["fips-aws-global", "aws-fips"].includes(e) ? "us-east-1" : e.replace(/fips-(dkr-|prod-)?|-fips/, "") : e, Aa = (e) => {
	let { region: t, useFipsEndpoint: n } = e;
	if (!t) throw Error("Region is missing");
	return Object.assign(e, {
		region: async () => {
			let e = ka(typeof t == "function" ? await t() : t);
			return Da(e), e;
		},
		useFipsEndpoint: async () => Oa(typeof t == "string" ? t : await t()) ? !0 : typeof n == "function" ? n() : Promise.resolve(!!n)
	});
}, ja = [
	"in-region",
	"cross-region",
	"mobile",
	"standard",
	"legacy"
], Ma = ({ defaultsMode: e } = {}) => Ta(async () => {
	let t = typeof e == "function" ? await e() : e;
	switch (t?.toLowerCase()) {
		case "auto": return Promise.resolve(Na() ? "mobile" : "standard");
		case "mobile":
		case "in-region":
		case "cross-region":
		case "standard":
		case "legacy": return Promise.resolve(t?.toLocaleLowerCase());
		case void 0: return Promise.resolve("legacy");
		default: throw Error(`Invalid parameter for "defaultsMode", expect ${ja.join(", ")}, got ${t}`);
	}
}), Na = () => {
	let e = window?.navigator;
	if (e?.connection) {
		let { effectiveType: t, rtt: n, downlink: r } = e.connection;
		if (typeof t == "string" && t !== "4g" || Number(n) > 100 || Number(r) < 10) return !0;
	}
	return e?.userAgentData?.mobile || typeof e?.maxTouchPoints == "number" && e?.maxTouchPoints > 1;
}, Pa = (e) => ({
	setRegion(t) {
		e.region = t;
	},
	region() {
		return e.region;
	}
}), Fa = (e) => ({ region: e.region() }), Ia = (e, { requestChecksumRequired: t, requestAlgorithmMember: n, requestChecksumCalculation: r }) => {
	if (!n) return r === re.WHEN_SUPPORTED || t ? ce : void 0;
	if (e[n]) return e[n];
}, La = (e) => e === h.MD5 ? "content-md5" : `x-amz-checksum-${e.toLowerCase()}`, Ra = (e, t) => {
	let n = e.toLowerCase();
	for (let e of Object.keys(t)) if (n === e.toLowerCase()) return !0;
	return !1;
}, za = (e, t) => {
	let n = e.toLowerCase();
	for (let e of Object.keys(t)) if (e.toLowerCase().startsWith(n)) return !0;
	return !1;
}, Ba = (e) => e !== void 0 && typeof e != "string" && !ArrayBuffer.isView(e) && !t(e), Va = /* @__PURE__ */ new Uint32Array(256);
for (let e = 0; e < 256; ++e) {
	let t = e;
	for (let e = 0; e < 8; ++e) t = t & 1 ? 2197175160 ^ t >>> 1 : t >>> 1;
	Va[e] = t >>> 0;
}
var Ha = class {
	digestLength = 4;
	crc = 4294967295;
	update(e) {
		let t = this.crc;
		for (let n = 0; n < e.length; ++n) t = t >>> 8 ^ Va[(t ^ e[n]) & 255];
		this.crc = t;
	}
	async digest() {
		let e = (this.crc ^ 4294967295) >>> 0, t = /* @__PURE__ */ new Uint8Array(4);
		return t[0] = e >>> 24, t[1] = e >>> 16 & 255, t[2] = e >>> 8 & 255, t[3] = e & 255, t;
	}
	reset() {
		this.crc = 4294967295;
	}
}, Ua = () => {
	let e = Array(8);
	for (let t = 0; t < 8; t++) {
		let n = Array(512);
		for (let e = 0; e < 256; e++) {
			let r = BigInt(e);
			for (let e = 0; e < 8 * (t + 1); e++) r & 1n ? r = r >> 1n ^ 11127430586519243189n : r >>= 1n;
			n[e * 2] = Number(r >> 32n & 4294967295n), n[e * 2 + 1] = Number(r & 4294967295n);
		}
		e[t] = new Uint32Array(n);
	}
	return e;
}, Wa, Ga, Ka, qa, Ja, Ya, Xa, Za, Qa, $a = () => {
	Wa || (Wa = Ua(), [Ga, Ka, qa, Ja, Ya, Xa, Za, Qa] = Wa);
}, eo = class {
	c1 = 0;
	c2 = 0;
	constructor() {
		$a(), this.reset();
	}
	update(e) {
		let t = e.length, n = 0, r = this.c1, i = this.c2;
		for (; n + 8 <= t;) {
			let t = ((i ^ e[n++]) & 255) << 1, a = ((i >>> 8 ^ e[n++]) & 255) << 1, o = ((i >>> 16 ^ e[n++]) & 255) << 1, s = ((i >>> 24 ^ e[n++]) & 255) << 1, c = ((r ^ e[n++]) & 255) << 1, l = ((r >>> 8 ^ e[n++]) & 255) << 1, u = ((r >>> 16 ^ e[n++]) & 255) << 1, d = ((r >>> 24 ^ e[n++]) & 255) << 1;
			r = Qa[t] ^ Za[a] ^ Xa[o] ^ Ya[s] ^ Ja[c] ^ qa[l] ^ Ka[u] ^ Ga[d], i = Qa[t + 1] ^ Za[a + 1] ^ Xa[o + 1] ^ Ya[s + 1] ^ Ja[c + 1] ^ qa[l + 1] ^ Ka[u + 1] ^ Ga[d + 1];
		}
		for (; n < t;) {
			let t = ((i ^ e[n]) & 255) << 1;
			i = (i >>> 8 | (r & 255) << 24) >>> 0, r = r >>> 8 ^ Ga[t], i ^= Ga[t + 1], ++n;
		}
		this.c1 = r, this.c2 = i;
	}
	async digest() {
		let e = this.c1 ^ 4294967295, t = this.c2 ^ 4294967295;
		return new Uint8Array([
			e >>> 24,
			e >>> 16 & 255,
			e >>> 8 & 255,
			e & 255,
			t >>> 24,
			t >>> 16 & 255,
			t >>> 8 & 255,
			t & 255
		]);
	}
	reset() {
		this.c1 = 4294967295, this.c2 = 4294967295;
	}
};
async function to(e, t, n = 1048576) {
	let r = e.size, i = 0;
	for (; i < r;) {
		let a = e.slice(i, Math.min(r, i + n));
		t(new Uint8Array(await a.arrayBuffer())), i += a.size;
	}
}
var no = async function(e, t) {
	let n = new e();
	return await to(t, (e) => {
		n.update(e);
	}), n.digest();
}, ro = class {
	digestLength = 16;
	state = Uint32Array.from(io);
	writeBuffer = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(64));
	bufferLength = 0;
	bytesHashed = 0;
	update(e) {
		let t = a(e), n = 0, r = t.byteLength;
		for (this.bytesHashed += r; r > 0;) this.writeBuffer.setUint8(this.bufferLength++, t[n++]), --r, this.bufferLength === 64 && (co(this.state, this.writeBuffer), this.bufferLength = 0);
	}
	async digest() {
		let e = Uint32Array.from(this.state), t = new DataView(this.writeBuffer.buffer.slice(0)), n = this.bufferLength, r = this.bytesHashed * 8;
		if (t.setUint8(n++, 128), this.bufferLength % 64 >= 56) {
			for (let e = n; e < 64; ++e) t.setUint8(e, 0);
			co(e, t), n = 0;
		}
		for (let e = n; e < 56; ++e) t.setUint8(e, 0);
		t.setUint32(56, r >>> 0, !0), t.setUint32(60, Math.floor(r / 2 ** 32), !0), co(e, t);
		let i = /* @__PURE__ */ new Uint8Array(16), a = new DataView(i.buffer);
		for (let t = 0; t < 4; ++t) a.setUint32(t * 4, e[t], !0);
		return i;
	}
	reset() {
		this.state.set(io), this.writeBuffer = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(64)), this.bufferLength = 0, this.bytesHashed = 0;
	}
}, io = [
	1732584193,
	4023233417,
	2562383102,
	271733878
], ao = 4294967295, oo = Uint8Array.of(7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21), so = Array.from({ length: 64 }, (e, t) => Math.abs(Math.sin(t + 1)) * 2 ** 32 >>> 0);
function co(e, t) {
	let n = e[0], r = e[1], i = e[2], a = e[3];
	for (let e = 0; e < 64; ++e) {
		let o, s;
		e < 16 ? (o = r & i | ~r & a, s = e) : e < 32 ? (o = a & r | i & ~a, s = (5 * e + 1) % 16) : e < 48 ? (o = r ^ i ^ a, s = (3 * e + 5) % 16) : (o = i ^ (r | ~a), s = 7 * e % 16);
		let c = t.getUint32(s * 4, !0), l = a;
		a = i, i = r;
		let u = oo[(e >> 4) * 4 + (e & 3)], d = (n + o & ao) + (c + so[e] & ao) & ao;
		r = r + ((d << u | d >>> 32 - u) >>> 0) & ao, n = l;
	}
	e[0] = e[0] + n & ao, e[1] = e[1] + r & ao, e[2] = e[2] + i & ao, e[3] = e[3] + a & ao;
}
var lo = /* @__PURE__ */ new Uint32Array(256);
for (let e = 0; e < 256; ++e) {
	let t = e;
	for (let e = 0; e < 8; ++e) t = t & 1 ? 3988292384 ^ t >>> 1 : t >>> 1;
	lo[e] = t >>> 0;
}
var uo = 4294967295, fo = class {
	digestLength = 4;
	checksum = uo;
	update(e) {
		for (let t = 0; t < e.length; ++t) this.checksum = this.checksum >>> 8 ^ lo[(this.checksum ^ e[t]) & 255];
	}
	digestSync() {
		return (this.checksum ^ uo) >>> 0;
	}
	async digest() {
		let e = this.digestSync(), t = /* @__PURE__ */ new Uint8Array(4);
		return new DataView(t.buffer).setUint32(0, e, !1), t;
	}
	reset() {
		this.checksum = uo;
	}
}, po = 64, mo = 32, ho = 2 ** 53 - 1, go = class e {
	digestLength = mo;
	state = Int32Array.from(_o);
	w;
	buffer = /* @__PURE__ */ new Uint8Array(64);
	bufferLength = 0;
	bytesHashed = 0;
	finished = !1;
	inner;
	outer;
	constructor(t) {
		if (t) {
			let n = e.normalizeKey(t);
			this.inner = new e(), this.outer = new e();
			let { inner: r, outer: i } = this, a = /* @__PURE__ */ new Uint8Array(128);
			for (let e = 0; e < po; ++e) a[e] = 54 ^ n[e], a[e + po] = 92 ^ n[e];
			r.update(a.subarray(0, po)), i.update(a.subarray(po));
		}
	}
	update(e) {
		if (this.finished) throw Error("Attempted to update an already finished HMAC.");
		if (this.inner) {
			this.inner.update(e);
			return;
		}
		let t = a(e), n = 0, { byteLength: r } = t;
		if (this.bytesHashed += r, this.bytesHashed * 8 > ho) throw Error("Cannot hash more than 2^53 - 1 bits");
		for (; r > 0;) this.buffer[this.bufferLength++] = t[n++], r--, this.bufferLength === po && (this.hashBuffer(), this.bufferLength = 0);
	}
	async digest() {
		let { inner: e, outer: t } = this;
		if (e && t) {
			if (this.finished) throw Error("Attempted to digest an already finished HMAC.");
			this.finished = !0;
			let n = e.digestSync();
			return t.update(n), t.digestSync();
		}
		return this.digestSync();
	}
	reset() {
		this.state = Int32Array.from(_o), this.buffer = /* @__PURE__ */ new Uint8Array(64), this.bufferLength = 0, this.bytesHashed = 0;
	}
	digestSync() {
		let e = this.state.slice(), t = this.buffer.slice(), n = this.bufferLength, r = this.bytesHashed * 8, i = new DataView(t.buffer, t.byteOffset, t.byteLength);
		if (i.setUint8(n++, 128), (n - 1) % po >= 56) {
			for (let e = n; e < po; ++e) i.setUint8(e, 0);
			this.hashBufferWith(e, t), n = 0;
		}
		for (let e = n; e < 56; ++e) i.setUint8(e, 0);
		i.setUint32(56, Math.floor(r / 4294967296), !1), i.setUint32(60, r, !1), this.hashBufferWith(e, t);
		let a = new Uint8Array(mo);
		for (let t = 0; t < 8; ++t) a[t * 4] = e[t] >>> 24 & 255, a[t * 4 + 1] = e[t] >>> 16 & 255, a[t * 4 + 2] = e[t] >>> 8 & 255, a[t * 4 + 3] = e[t] >>> 0 & 255;
		return a;
	}
	static normalizeKey(t) {
		let n = a(t);
		if (n.byteLength > po) {
			let t = new e();
			t.update(n);
			let r = t.digestSync(), i = new Uint8Array(po);
			return i.set(r), i;
		}
		if (n.byteLength < po) {
			let e = new Uint8Array(po);
			return e.set(n), e;
		}
		return n;
	}
	hashBuffer() {
		this.hashBufferWith(this.state, this.buffer);
	}
	hashBufferWith(e, t) {
		let n = this.w ??= /* @__PURE__ */ new Int32Array(64), r = e[0], i = e[1], a = e[2], o = e[3], s = e[4], c = e[5], l = e[6], u = e[7];
		for (let e = 0; e < po; ++e) {
			if (e < 16) n[e] = (t[e * 4] & 255) << 24 | (t[e * 4 + 1] & 255) << 16 | (t[e * 4 + 2] & 255) << 8 | t[e * 4 + 3] & 255;
			else {
				let t = n[e - 2], r = (t >>> 17 | t << 15) ^ (t >>> 19 | t << 13) ^ t >>> 10;
				t = n[e - 15];
				let i = (t >>> 7 | t << 25) ^ (t >>> 18 | t << 14) ^ t >>> 3;
				n[e] = (r + n[e - 7] | 0) + (i + n[e - 16] | 0);
			}
			let d = (((s >>> 6 | s << 26) ^ (s >>> 11 | s << 21) ^ (s >>> 25 | s << 7)) + (s & c ^ ~s & l) | 0) + (u + (vo[e] + n[e] | 0) | 0) | 0, f = ((r >>> 2 | r << 30) ^ (r >>> 13 | r << 19) ^ (r >>> 22 | r << 10)) + (r & i ^ r & a ^ i & a) | 0;
			u = l, l = c, c = s, s = o + d | 0, o = a, a = i, i = r, r = d + f | 0;
		}
		e[0] += r, e[1] += i, e[2] += a, e[3] += o, e[4] += s, e[5] += c, e[6] += l, e[7] += u;
	}
}, _o = new Int32Array([
	1779033703,
	3144134277,
	1013904242,
	2773480762,
	1359893119,
	2600822924,
	528734635,
	1541459225
]), vo = new Int32Array([
	1116352408,
	1899447441,
	3049323471,
	3921009573,
	961987163,
	1508970993,
	2453635748,
	2870763221,
	3624381080,
	310598401,
	607225278,
	1426881987,
	1925078388,
	2162078206,
	2614888103,
	3248222580,
	3835390401,
	4022224774,
	264347078,
	604807628,
	770255983,
	1249150122,
	1555081692,
	1996064986,
	2554220882,
	2821834349,
	2952996808,
	3210313671,
	3336571891,
	3584528711,
	113926993,
	338241895,
	666307205,
	773529912,
	1294757372,
	1396182291,
	1695183700,
	1986661051,
	2177026350,
	2456956037,
	2730485921,
	2820302411,
	3259730800,
	3345764771,
	3516065817,
	3600352804,
	4094571909,
	275423344,
	430227734,
	506948616,
	659060556,
	883997877,
	958139571,
	1322822218,
	1537002063,
	1747873779,
	1955562222,
	2024104815,
	2227730452,
	2361852424,
	2428436474,
	2756734187,
	3204031479,
	3329325298
]), { digest: yo, sign: bo, importKey: xo } = globalThis?.crypto?.subtle ?? {}, So = typeof yo == "function" && typeof bo == "function" && typeof xo == "function" ? globalThis.crypto.subtle : void 0, Co = 8388608, wo = class {
	digestLength = 32;
	secret;
	pending = [];
	pendingBytes = 0;
	fallback;
	finished = !1;
	constructor(e) {
		e && (this.secret = a(e));
	}
	update(e) {
		if (this.finished) throw Error("Attempted to update an already finished HMAC.");
		if (this.fallback) {
			this.fallback.update(e);
			return;
		}
		this.pending.push(e.slice()), this.pendingBytes += e.byteLength, this.pendingBytes >= Co && this.switchToFallback();
	}
	async digest() {
		if (this.fallback) return this.fallback.digest();
		if (this.secret && this.finished) throw Error("Attempted to digest an already finished HMAC.");
		let e = An(this.pending);
		if (So) {
			if (this.secret) {
				this.finished = !0;
				let t = await So.importKey("raw", this.secret, {
					name: "HMAC",
					hash: "SHA-256"
				}, !1, ["sign"]), n = await So.sign("HMAC", t, e);
				return new Uint8Array(n);
			}
			let t = await So.digest("SHA-256", e);
			return new Uint8Array(t);
		}
		let t = new go(this.secret);
		return t.update(e), t.digest();
	}
	reset() {
		this.pending = [], this.pendingBytes = 0, this.fallback = void 0, this.finished = !1;
	}
	switchToFallback() {
		let e = new go(this.secret);
		for (let t of this.pending) e.update(t);
		this.fallback = e, this.pending = [], this.pendingBytes = 0;
	}
}, To = [
	h.CRC32,
	h.CRC32C,
	h.CRC64NVME,
	h.SHA1,
	h.SHA256
], Eo = [
	h.SHA256,
	h.SHA1,
	h.CRC32,
	h.CRC32C,
	h.CRC64NVME
], Do = (e, t) => {
	let { checksumAlgorithms: n = {} } = t;
	switch (e) {
		case h.MD5: return n?.MD5 ?? t.md5;
		case h.CRC32: return n?.CRC32 ?? fo;
		case h.CRC32C: return n?.CRC32C ?? Ha;
		case h.CRC64NVME: return n?.CRC64NVME ?? eo;
		case h.SHA1: return n?.SHA1 ?? t.sha1;
		case h.SHA256: return n?.SHA256 ?? t.sha256;
		default:
			if (n?.[e]) return n[e];
			throw Error(`The checksum algorithm "${e}" is not supported by the client. Select one of ${To}, or provide an implementation to  the client constructor checksums field.`);
	}
}, Oo = (e, t) => {
	let n = new e();
	return n.update(a(t || "")), n.digest();
}, ko = {
	name: "flexibleChecksumsMiddleware",
	step: "build",
	tags: ["BODY_CHECKSUM"],
	override: !0
}, Ao = (e, t) => (n, r) => async (i) => {
	if (!l.isInstance(i.request) || za("x-amz-checksum-", i.request.headers)) return n(i);
	let { request: a, input: o } = i, { body: s, headers: c } = a, { base64Encoder: u, streamHasher: d } = e, { requestChecksumRequired: f, requestAlgorithmMember: ee } = t, p = await e.requestChecksumCalculation(), m = ee?.name, te = ee?.httpHeader;
	m && !o[m] && (p === re.WHEN_SUPPORTED || f) && (o[m] = ce, te && (c[te] = ce));
	let ne = Ia(o, {
		requestChecksumRequired: f,
		requestAlgorithmMember: ee?.name,
		requestChecksumCalculation: p
	}), ie = s, ae = c;
	if (ne) {
		switch (ne) {
			case h.CRC32:
				Oi(r, "FLEXIBLE_CHECKSUMS_REQ_CRC32", "U");
				break;
			case h.CRC32C:
				Oi(r, "FLEXIBLE_CHECKSUMS_REQ_CRC32C", "V");
				break;
			case h.CRC64NVME:
				Oi(r, "FLEXIBLE_CHECKSUMS_REQ_CRC64", "W");
				break;
			case h.SHA1:
				Oi(r, "FLEXIBLE_CHECKSUMS_REQ_SHA1", "X");
				break;
			case h.SHA256: Oi(r, "FLEXIBLE_CHECKSUMS_REQ_SHA256", "Y");
		}
		let t = La(ne), n = Do(ne, e);
		if (Ba(s)) {
			let { getAwsChunkedEncodingStream: i, bodyLengthChecker: a } = e;
			ie = i(typeof e.requestStreamBufferSize == "number" && e.requestStreamBufferSize >= 8192 ? gr(s, e.requestStreamBufferSize, r.logger) : s, {
				base64Encoder: u,
				bodyLengthChecker: a,
				checksumLocationName: t,
				checksumAlgorithmFn: n,
				streamHasher: d
			}), ae = {
				...c,
				"content-encoding": c["content-encoding"] ? `${c["content-encoding"]},aws-chunked` : "aws-chunked",
				"transfer-encoding": "chunked",
				"x-amz-decoded-content-length": c["content-length"],
				"x-amz-content-sha256": "STREAMING-UNSIGNED-PAYLOAD-TRAILER",
				"x-amz-trailer": t
			}, delete ae["content-length"];
		} else if (!Ra(t, c)) {
			let e = await Oo(n, s);
			ae = {
				...c,
				[t]: u(e)
			};
		}
	}
	try {
		return await n({
			...i,
			request: {
				...a,
				headers: ae,
				body: ie
			}
		});
	} catch (e) {
		if (e instanceof Error && e.name === "InvalidChunkSizeError") try {
			e.message.endsWith(".") || (e.message += "."), e.message += " Set [requestStreamBufferSize=number e.g. 65_536] in client constructor to instruct AWS SDK to buffer your input stream.";
		} catch {}
		throw e;
	}
}, jo = {
	name: "flexibleChecksumsInputMiddleware",
	toMiddleware: "serializerMiddleware",
	relation: "before",
	tags: ["BODY_CHECKSUM"],
	override: !0
}, Mo = (e, t) => (n, r) => async (i) => {
	let a = i.input, { requestValidationModeMember: o } = t, s = await e.requestChecksumCalculation(), c = await e.responseChecksumValidation();
	switch (s) {
		case re.WHEN_REQUIRED:
			Oi(r, "FLEXIBLE_CHECKSUMS_REQ_WHEN_REQUIRED", "a");
			break;
		case re.WHEN_SUPPORTED: Oi(r, "FLEXIBLE_CHECKSUMS_REQ_WHEN_SUPPORTED", "Z");
	}
	switch (c) {
		case ae.WHEN_REQUIRED:
			Oi(r, "FLEXIBLE_CHECKSUMS_RES_WHEN_REQUIRED", "c");
			break;
		case ae.WHEN_SUPPORTED: Oi(r, "FLEXIBLE_CHECKSUMS_RES_WHEN_SUPPORTED", "b");
	}
	return o && !a[o] && c === ae.WHEN_SUPPORTED && (a[o] = "ENABLED"), n(i);
}, No = (e = []) => {
	let t = [], n = Eo.length;
	for (let r of e) {
		let e = Eo.indexOf(r);
		e === -1 ? t[n++] = r : t[e] = r;
	}
	return t.filter(Boolean);
}, Po = (e) => {
	let t = e.lastIndexOf("-");
	if (t !== -1) {
		let n = e.slice(t + 1);
		if (!n.startsWith("0")) {
			let e = parseInt(n, 10);
			if (!isNaN(e) && e >= 1 && e <= 1e4) return !0;
		}
	}
	return !1;
}, Fo = async (e, { checksumAlgorithmFn: t, base64Encoder: n }) => n(await Oo(t, e)), Io = async (e, { config: t, responseAlgorithms: n, logger: r }) => {
	let i = No(n), { body: a, headers: o } = e;
	for (let n of i) {
		let i = La(n), s = o[i];
		if (s) {
			let o;
			try {
				o = Do(n, t);
			} catch (e) {
				if (n === h.CRC64NVME) {
					r?.warn(`Skipping ${h.CRC64NVME} checksum validation: ${e.message}`);
					continue;
				}
				throw e;
			}
			let { base64Encoder: c } = t;
			if (Ba(a)) {
				e.body = pr({
					expectedChecksum: s,
					checksumSourceLocation: i,
					checksum: new o(),
					source: a,
					base64Encoder: c
				});
				return;
			}
			let l = await Fo(a, {
				checksumAlgorithmFn: o,
				base64Encoder: c
			});
			if (l === s) break;
			throw Error(`Checksum mismatch: expected "${l}" but received "${s}" in response header "${i}".`);
		}
	}
}, Lo = {
	name: "flexibleChecksumsResponseMiddleware",
	toMiddleware: "deserializerMiddleware",
	relation: "after",
	tags: ["BODY_CHECKSUM"],
	override: !0
}, Ro = (e, t) => (n, r) => async (i) => {
	if (!l.isInstance(i.request)) return n(i);
	let a = i.input, o = await n(i), s = o.response, { requestValidationModeMember: c, responseAlgorithms: u } = t;
	if (c && a[c] === "ENABLED") {
		let { clientName: t, commandName: n } = r, i = Object.keys(e.checksumAlgorithms ?? {}).filter((e) => {
			let t = La(e);
			return s.headers[t] !== void 0;
		}), a = No([...u ?? [], ...i]);
		if (t === "S3Client" && n === "GetObjectCommand" && a.every((e) => {
			let t = La(e), n = s.headers[t];
			return !n || Po(n);
		})) return o;
		await Io(s, {
			config: e,
			responseAlgorithms: a,
			logger: r.logger
		});
	}
	return o;
}, zo = (e, t) => ({ applyToStack: (n) => {
	n.add(Ao(e, t), ko), n.addRelativeTo(Mo(e, t), jo), n.addRelativeTo(Ro(e, t), Lo);
} }), Bo = (e) => {
	let { requestChecksumCalculation: t, responseChecksumValidation: n, requestStreamBufferSize: i } = e;
	return Object.assign(e, {
		requestChecksumCalculation: r(t ?? ie),
		responseChecksumValidation: r(n ?? oe),
		requestStreamBufferSize: Number(i ?? 0),
		checksumAlgorithms: e.checksumAlgorithms ?? {}
	});
}, Vo = "content-length", Ho = "x-amz-decoded-content-length";
function Uo() {
	return (e, t) => async (n) => {
		let { request: r } = n;
		if (l.isInstance(r) && !(Vo in r.headers) && !(Ho in r.headers)) {
			let e = "Are you using a Stream of unknown length as the Body of a PutObject request? Consider using Upload instead from @aws-sdk/lib-storage.";
			typeof t?.logger?.warn == "function" && !(t.logger instanceof _t) ? t.logger.warn(e) : console.warn(e);
		}
		return e({ ...n });
	};
}
var Wo = {
	step: "finalizeRequest",
	tags: ["CHECK_CONTENT_LENGTH_HEADER"],
	name: "getCheckContentLengthHeaderPlugin",
	override: !0
}, Go = (e) => ({ applyToStack: (e) => {
	e.add(Uo(), Wo);
} }), Ko = (e) => (t, n) => async (r) => {
	let i = await e.region(), a = e.region, o = () => {};
	n.__s3RegionRedirect && (Object.defineProperty(e, "region", {
		writable: !1,
		value: async () => n.__s3RegionRedirect
	}), o = () => Object.defineProperty(e, "region", {
		writable: !0,
		value: a
	}));
	try {
		let a = await t(r);
		if (n.__s3RegionRedirect && (o(), i !== await e.region())) throw Error("Region was not restored following S3 region redirect.");
		return a;
	} catch (e) {
		throw o(), e;
	}
}, qo = {
	tags: ["REGION_REDIRECT", "S3"],
	name: "regionRedirectEndpointMiddleware",
	override: !0,
	relation: "before",
	toMiddleware: "endpointV2Middleware"
};
function Jo(e) {
	return (t, n) => async (r) => {
		try {
			return await t(r);
		} catch (i) {
			if (e.followRegionRedirects) {
				let a = i?.$metadata?.httpStatusCode, o = n.commandName === "HeadBucketCommand", s = i?.$response?.headers?.["x-amz-bucket-region"];
				if (s && (a === 301 || a === 400 && (i?.name === "IllegalLocationConstraintException" || o))) {
					try {
						let t = s;
						n.logger?.debug(`Redirecting from ${await e.region()} to ${t}`), n.__s3RegionRedirect = t, Oi(n, "S3_REGION_REDIRECT", "Ah");
					} catch (e) {
						throw Error("Region redirect failed: " + e);
					}
					return t(r);
				}
			}
			throw i;
		}
	};
}
var Yo = {
	step: "initialize",
	tags: ["REGION_REDIRECT", "S3"],
	name: "regionRedirectMiddleware",
	override: !0
}, Xo = (e) => ({ applyToStack: (t) => {
	t.add(Jo(e), Yo), t.addRelativeTo(Ko(e), qo);
} }), Zo = class e {
	data;
	lastPurgeTime = Date.now();
	static EXPIRED_CREDENTIAL_PURGE_INTERVAL_MS = 3e4;
	constructor(e = {}) {
		this.data = e;
	}
	get(e) {
		let t = this.data[e];
		if (t) return t;
	}
	set(e, t) {
		return this.data[e] = t, t;
	}
	delete(e) {
		delete this.data[e];
	}
	async purgeExpired() {
		let t = Date.now();
		if (!(this.lastPurgeTime + e.EXPIRED_CREDENTIAL_PURGE_INTERVAL_MS > t)) for (let e in this.data) {
			let n = this.data[e];
			if (!n.isRefreshing) {
				let r = await n.identity;
				r.expiration && r.expiration.getTime() < t && delete this.data[e];
			}
		}
	}
}, Qo = class {
	_identity;
	isRefreshing;
	accessed;
	constructor(e, t = !1, n = Date.now()) {
		this._identity = e, this.isRefreshing = t, this.accessed = n;
	}
	get identity() {
		return this.accessed = Date.now(), this._identity;
	}
}, $o = class e {
	createSessionFn;
	cache;
	static REFRESH_WINDOW_MS = 6e4;
	constructor(e, t = new Zo()) {
		this.createSessionFn = e, this.cache = t;
	}
	async getS3ExpressIdentity(t, n) {
		let r = n.Bucket, { cache: i } = this, a = i.get(r);
		return a ? a.identity.then((t) => (t.expiration?.getTime() ?? 0) < Date.now() ? i.set(r, new Qo(this.getIdentity(r))).identity : ((t.expiration?.getTime() ?? 0) < Date.now() + e.REFRESH_WINDOW_MS && !a.isRefreshing && (a.isRefreshing = !0, this.getIdentity(r).then((e) => {
			i.set(r, new Qo(Promise.resolve(e)));
		})), t)) : i.set(r, new Qo(this.getIdentity(r))).identity;
	}
	async getIdentity(e) {
		await this.cache.purgeExpired().catch((e) => {
			console.warn("Error while clearing expired entries in S3ExpressIdentityCache: \n" + e);
		});
		let t = await this.createSessionFn(e);
		if (!t.Credentials?.AccessKeyId || !t.Credentials?.SecretAccessKey) throw Error("s3#createSession response credential missing AccessKeyId or SecretAccessKey.");
		return {
			accessKeyId: t.Credentials.AccessKeyId,
			secretAccessKey: t.Credentials.SecretAccessKey,
			sessionToken: t.Credentials.SessionToken,
			expiration: t.Credentials.Expiration ? new Date(t.Credentials.Expiration) : void 0
		};
	}
}, es = (e, { session: t }) => {
	let [n, r] = t, { forcePathStyle: i, useAccelerateEndpoint: a, disableMultiregionAccessPoints: o, followRegionRedirects: s, s3ExpressIdentityProvider: c, bucketEndpoint: l, expectContinueHeader: u } = e;
	return Object.assign(e, {
		forcePathStyle: i ?? !1,
		useAccelerateEndpoint: a ?? !1,
		disableMultiregionAccessPoints: o ?? !1,
		followRegionRedirects: s ?? !1,
		s3ExpressIdentityProvider: c ?? new $o(async (e) => n().send(new r({ Bucket: e }))),
		bucketEndpoint: l ?? !1,
		expectContinueHeader: u ?? 2097152
	});
}, ts = (e) => (e, t) => async (n) => {
	let r = await e(n), { response: i } = r;
	if (ve.isInstance(i) && i.headers.expires) {
		i.headers.expiresstring = i.headers.expires;
		try {
			Yt(i.headers.expires);
		} catch (e) {
			t.logger?.warn(`AWS SDK Warning for ${t.clientName}::${t.commandName} response parsing (${i.headers.expires}): ${e}`), delete i.headers.expires;
		}
	}
	return r;
}, ns = {
	tags: ["S3"],
	name: "s3ExpiresMiddleware",
	override: !0,
	relation: "after",
	toMiddleware: "deserializerMiddleware"
}, rs = (e) => ({ applyToStack: (t) => {
	t.addRelativeTo(ts(e), ns);
} }), is = "sigv4-s3express", as = "x-amz-s3session-token", os = (e) => (t, n) => async (r) => {
	if (n.endpointV2) {
		let t = n.endpointV2, i = t.properties?.authSchemes?.[0]?.name === is;
		if ((t.properties?.backend === "S3Express" || t.properties?.bucketType === "Directory") && (Oi(n, "S3_EXPRESS_BUCKET", "J"), n.isS3ExpressBucket = !0), i) {
			let t = r.input.Bucket;
			if (t) {
				let i = await e.s3ExpressIdentityProvider.getS3ExpressIdentity(await e.credentials(), { Bucket: t });
				n.s3ExpressIdentity = i, l.isInstance(r.request) && i.sessionToken && (r.request.headers[as] = i.sessionToken);
			}
		}
	}
	return t(r);
}, ss = {
	name: "s3ExpressMiddleware",
	step: "build",
	tags: ["S3", "S3_EXPRESS"],
	override: !0
}, cs = (e) => ({ applyToStack: (t) => {
	t.add(os(e), ss);
} }), ls = async (e, t, n, r) => {
	let i = await r.signWithCredentials(n, e, {});
	if (i.headers["X-Amz-Security-Token"] || i.headers["x-amz-security-token"]) throw Error("X-Amz-Security-Token must not be set for s3-express requests.");
	return i;
}, us = (e) => (e) => {
	throw e;
}, ds = (e, t) => {}, fs = (e) => (t, n) => async (r) => {
	if (!l.isInstance(r.request)) return t(r);
	let i = o(n).selectedHttpAuthScheme;
	if (!i) throw Error("No HttpAuthScheme was selected: unable to sign request");
	let { httpAuthOption: { signingProperties: a = {} }, identity: s, signer: c } = i, u;
	u = n.s3ExpressIdentity ? await ls(n.s3ExpressIdentity, a, r.request, await e.signer()) : await c.sign(r.request, s, a);
	let d = await t({
		...r,
		request: u
	}).catch((c.errorHandler || us)(a));
	return (c.successHandler || ds)(d.response, a), d;
}, ps = (e) => ({ applyToStack: (t) => {
	t.addRelativeTo(fs(e), Gi);
} });
function ms(e) {
	return new ReadableStream({ start(t) {
		t.enqueue(e), t.close();
	} });
}
var hs = {
	CopyObjectCommand: !0,
	UploadPartCopyCommand: !0,
	CompleteMultipartUploadCommand: !0
}, gs = (e) => (t, n) => async (r) => {
	let i = await t(r), { response: a } = i;
	if (!ve.isInstance(a)) return i;
	let { statusCode: o, body: s } = a;
	if (o < 200 || o >= 300) return i;
	let c = await _s(s, e);
	if (a.body = ms(c), c.length === 0 && hs[n.commandName]) {
		let e = /* @__PURE__ */ Error("S3 aborted request");
		throw e.$metadata = { httpStatusCode: 503 }, e.name = "InternalError", e;
	}
	let l = e.utf8Encoder(c.subarray(c.length - 16));
	return l && l.endsWith("</Error>") && (a.statusCode = 503), i;
}, _s = (e = /* @__PURE__ */ new Uint8Array(), t) => e instanceof Uint8Array ? Promise.resolve(e) : t.streamCollector(e) || Promise.resolve(/* @__PURE__ */ new Uint8Array()), vs = {
	relation: "after",
	toMiddleware: "deserializerMiddleware",
	tags: ["THROW_200_EXCEPTIONS", "S3"],
	name: "throw200ExceptionsMiddleware",
	override: !0
}, ys = (e) => ({ applyToStack: (t) => {
	t.addRelativeTo(gs(e), vs);
} }), bs = (e) => typeof e == "string" && e.indexOf("arn:") === 0 && e.split(":").length >= 6;
function xs(e) {
	return (t, n) => async (r) => {
		if (e.bucketEndpoint) {
			let e = n.endpointV2;
			if (e) {
				let t = r.input.Bucket;
				if (typeof t == "string") try {
					let r = new URL(t);
					n.endpointV2 = {
						...e,
						url: r
					};
				} catch (e) {
					let r = `@aws-sdk/middleware-sdk-s3: bucketEndpoint=true was set but Bucket=${t} could not be parsed as URL.`;
					throw n.logger?.constructor?.name === "NoOpLogger" ? console.warn(r) : n.logger?.warn?.(r), e;
				}
			}
		}
		return t(r);
	};
}
var Ss = {
	name: "bucketEndpointMiddleware",
	override: !0,
	relation: "after",
	toMiddleware: "endpointV2Middleware"
};
function Cs({ bucketEndpoint: e }) {
	return (t) => async (n) => {
		let { input: { Bucket: r } } = n;
		if (!e && typeof r == "string" && !bs(r) && r.indexOf("/") >= 0) {
			let e = /* @__PURE__ */ Error(`Bucket name shouldn't contain '/', received '${r}'`);
			throw e.name = "InvalidBucketName", e;
		}
		return t({ ...n });
	};
}
var ws = {
	step: "initialize",
	tags: ["VALIDATE_BUCKET_NAME"],
	name: "validateBucketNameMiddleware",
	override: !0
}, Ts = (e) => ({ applyToStack: (t) => {
	t.add(Cs(e), ws), t.addRelativeTo(xs(e), Ss);
} }), Es = class {
	queryCompat;
	errorRegistry;
	constructor(e = !1) {
		this.queryCompat = e;
	}
	resolveRestContentType(e, t) {
		let n = t.getMemberSchemas(), r = Object.values(n).find((e) => !!e.getMergedTraits().httpPayload);
		if (r) return r.getMergedTraits().mediaType || (r.isStringSchema() ? "text/plain" : r.isBlobSchema() ? "application/octet-stream" : e);
		if (!t.isUnitSchema() && Object.values(n).find((e) => {
			let { httpQuery: t, httpQueryParams: n, httpHeader: r, httpLabel: i, httpPrefixHeaders: a } = e.getMergedTraits();
			return !t && !n && !r && !i && a === void 0;
		})) return e;
	}
	async getErrorSchemaOrThrowBaseException(e, t, n, r, i, a) {
		let o = e;
		e.includes("#") && ([, o] = e.split("#"));
		let s = {
			$metadata: i,
			$fault: n.statusCode < 500 ? "client" : "server"
		};
		if (!this.errorRegistry) throw Error("@aws-sdk/core/protocols - error handler not initialized.");
		try {
			return {
				errorSchema: a?.(this.errorRegistry, o) ?? this.errorRegistry.getSchema(e),
				errorMetadata: s
			};
		} catch {
			r.message = r.message ?? r.Message ?? "UnknownError";
			let e = this.errorRegistry, t = e.getBaseException();
			if (t) {
				let n = e.getErrorCtor(t) ?? Error;
				throw this.decorateServiceException(Object.assign(new n({ name: o }), s), r);
			}
			let n = r, i = n?.message ?? n?.Message ?? n?.Error?.Message ?? n?.Error?.message;
			throw this.decorateServiceException(Object.assign(Error(i), { name: o }, s), r);
		}
	}
	compose(e, t, n) {
		let r = n;
		t.includes("#") && ([r] = t.split("#"));
		let i = et.for(r), a = et.for("smithy.ts.sdk.synthetic." + n);
		e.copyFrom(i), e.copyFrom(a), this.errorRegistry = e;
	}
	decorateServiceException(e, t = {}) {
		if (this.queryCompat) {
			let n = e.Message ?? t.Message, r = st(e, t);
			n && (r.message = n);
			let i = r.Error ?? {};
			i.Type = r.Error?.Type, i.Code = r.Error?.Code, i.Message = r.Error?.message ?? r.Error?.Message ?? n, r.Error = i;
			let a = r.$metadata.requestId;
			return a && (r.RequestId = a), r;
		}
		return st(e, t);
	}
	setQueryCompatError(e, t) {
		let n = t.headers?.["x-amzn-query-error"];
		if (e !== void 0 && n != null) {
			let [t, r] = n.split(";"), i = Object.keys(e), a = {
				Code: t,
				Type: r
			};
			e.Code = t, e.Type = r;
			for (let t = 0; t < i.length; t++) {
				let n = i[t];
				a[n === "message" ? "Message" : n] = e[n];
			}
			delete a.__type, e.Error = a;
		}
	}
	queryCompatOutput(e, t) {
		e.Error && (t.Error = e.Error), e.Type && (t.Type = e.Type), e.Code && (t.Code = e.Code);
	}
	findQueryCompatibleError(e, t) {
		try {
			return e.getSchema(t);
		} catch {
			return e.find((e) => Xe.of(e).getMergedTraits().awsQueryError?.[0] === t);
		}
	}
}, Ds = class {
	serdeContext;
	setSerdeContext(e) {
		this.serdeContext = e;
	}
}, Os = class {
	from;
	to;
	keys;
	constructor(e, t) {
		this.from = e, this.to = t;
		let n = Object.keys(this.from), r = new Set(n);
		r.delete("__type"), this.keys = r;
	}
	mark(e) {
		this.keys.delete(e);
	}
	hasUnknown() {
		return this.keys.size === 1 && Object.keys(this.to).length === 0;
	}
	writeUnknown() {
		if (this.hasUnknown()) {
			let e = this.keys.values().next().value, t = this.from[e];
			this.to.$unknown = [e, t];
		}
	}
};
function ks(e) {
	Object.defineProperty(e, "__proto__", {
		value: void 0,
		writable: !0,
		enumerable: !0,
		configurable: !0
	});
}
var As = /[&<>"]/g, js = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;"
};
function Ms(e) {
	return e.replace(As, (e) => js[e]);
}
var Ns = /[&"'<>\r\n\u0085\u2028]/g, Ps = {
	"&": "&amp;",
	"\"": "&quot;",
	"'": "&apos;",
	"<": "&lt;",
	">": "&gt;",
	"\r": "&#x0D;",
	"\n": "&#x0A;",
	"": "&#x85;",
	"\u2028": "&#x2028;"
};
function Fs(e) {
	return e.replace(Ns, (e) => Ps[e]);
}
var Is = class {
	value;
	constructor(e) {
		this.value = e;
	}
	toString() {
		return Fs("" + this.value);
	}
}, Ls = class e {
	name;
	children;
	attributes = {};
	static of(t, n, r) {
		let i = new e(t);
		return n !== void 0 && i.addChildNode(new Is(n)), r !== void 0 && i.withName(r), i;
	}
	constructor(e, t = []) {
		this.name = e, this.children = t;
	}
	withName(e) {
		return this.name = e, this;
	}
	addAttribute(e, t) {
		return this.attributes[e] = t, this;
	}
	addChildNode(e) {
		return this.children.push(e), this;
	}
	removeAttribute(e) {
		return delete this.attributes[e], this;
	}
	n(e) {
		return this.name = e, this;
	}
	c(e) {
		return this.children.push(e), this;
	}
	a(e, t) {
		return t != null && (this.attributes[e] = t), this;
	}
	cc(t, n, r = n) {
		if (t[n] != null) {
			let i = e.of(n, t[n]).withName(r);
			this.c(i);
		}
	}
	l(e, t, n, r) {
		e[t] != null && r().map((e) => {
			e.withName(n), this.c(e);
		});
	}
	lc(t, n, r, i) {
		if (t[n] != null) {
			let t = i(), n = new e(r);
			t.map((e) => {
				n.c(e);
			}), this.c(n);
		}
	}
	toString() {
		let e = !!this.children.length, t = `<${this.name}`, n = this.attributes;
		for (let e of Object.keys(n)) {
			let r = n[e];
			r != null && (t += ` ${e}="${Ms("" + r)}"`);
		}
		return t += e ? `>${this.children.map((e) => e.toString()).join("")}</${this.name}>` : "/>";
	}
}, Rs;
function zs(e) {
	Rs ||= new DOMParser();
	let t = Rs.parseFromString(e, "application/xml");
	if (t.getElementsByTagName("parsererror").length > 0) throw Error("DOMParser XML parsing error.");
	let n = (e) => {
		if (e.nodeType === Node.TEXT_NODE && e.textContent?.trim()) return e.textContent;
		if (e.nodeType === Node.ELEMENT_NODE) {
			let t = e;
			if (t.attributes.length === 0 && t.childNodes.length === 0) return "";
			let r = {}, i = Array.from(t.attributes);
			for (let e of i) r[`${e.name}`] = e.value;
			let a = Array.from(t.childNodes);
			for (let e of a) {
				let o = n(e);
				if (o != null) {
					let t = e.nodeName;
					if (a.length === 1 && i.length === 0 && t === "#text") return o;
					t in r ? Array.isArray(r[t]) ? r[t].push(o) : r[t] = [r[t], o] : r[t] = o;
				} else if (a.length === 1 && i.length === 0) return t.textContent;
			}
			return r;
		}
		return null;
	};
	return { [t.documentElement.nodeName]: n(t.documentElement) };
}
var Bs = class extends Ds {
	settings;
	stringDeserializer;
	constructor(e) {
		super(), this.settings = e, this.stringDeserializer = new Lr(e);
	}
	setSerdeContext(e) {
		this.serdeContext = e, this.stringDeserializer.setSerdeContext(e);
	}
	read(e, t, n) {
		let r = Xe.of(e), i = r.getMemberSchemas();
		if (r.isStructSchema() && r.isMemberSchema() && Object.values(i).find((e) => !!e.getMemberTraits().eventPayload)) {
			let e = {}, n = Object.keys(i)[0];
			return e[n] = i[n].isBlobSchema() ? t : this.read(i[n], t), e;
		}
		let a = (this.serdeContext?.utf8Encoder ?? Tt)(t), o = this.parseXml(a);
		return this.readSchema(e, n ? o[n] : o);
	}
	readSchema(e, t) {
		let n = Xe.of(e);
		if (n.isUnitSchema()) return;
		let r = n.getMergedTraits();
		if (n.isListSchema() && !Array.isArray(t)) return this.readSchema(n, [t]);
		if (t == null) return t;
		if (typeof t == "object") {
			let e = !!r.xmlFlattened;
			if (n.isListSchema()) {
				let r = n.getValueSchema(), i = [], a = r.getMergedTraits().xmlName ?? "member", o = e ? t : (t[0] ?? t)[a];
				if (o == null) return i;
				let s = Array.isArray(o) ? o : [o];
				for (let e of s) i.push(this.readSchema(r, e));
				return i;
			}
			let i = {};
			if (n.isMapSchema()) {
				let r = n.getKeySchema(), a = n.getValueSchema(), o;
				o = e ? Array.isArray(t) ? t : [t] : Array.isArray(t.entry) ? t.entry : [t.entry];
				let s = r.getMergedTraits().xmlName ?? "key", c = a.getMergedTraits().xmlName ?? "value";
				for (let e of o) {
					let t = e[s], n = e[c];
					t === "__proto__" && ks(i), i[t] = this.readSchema(a, n);
				}
				return i;
			}
			if (n.isStructSchema()) {
				let e = n.isUnionSchema(), r;
				e && (r = new Os(t, i));
				for (let [a, o] of n.structIterator()) {
					let n = o.getMergedTraits(), s = n.httpPayload ? n.xmlName ?? o.getName() : o.getMemberTraits().xmlName ?? a;
					e && r.mark(s), t[s] != null && (i[a] = this.readSchema(o, t[s]));
				}
				return e && r.writeUnknown(), i;
			}
			if (n.isDocumentSchema()) return t;
			throw Error(`@aws-sdk/core/protocols - xml deserializer unhandled schema type for ${n.getName(!0)}`);
		}
		return n.isListSchema() ? [] : n.isMapSchema() || n.isStructSchema() ? {} : this.stringDeserializer.read(n, t);
	}
	parseXml(e) {
		if (e.length) {
			let t;
			try {
				t = zs(e);
			} catch (t) {
				throw t && typeof t == "object" && Object.defineProperty(t, "$responseBodyText", { value: e }), t;
			}
			let n = "#text", r = Object.keys(t)[0], i = t[r];
			return i[n] && (i[r] = i[n], delete i[n]), gt(i);
		}
		return {};
	}
}, Vs = (e, t) => {
	if (t?.Error?.Code !== void 0) return t.Error.Code;
	if (t?.Code !== void 0) return t.Code;
	if (e.statusCode == 404) return "NotFound";
}, Hs = class extends Ds {
	settings;
	stringBuffer;
	byteBuffer;
	buffer;
	constructor(e) {
		super(), this.settings = e;
	}
	write(e, t) {
		let n = Xe.of(e);
		if (n.isStringSchema() && typeof t == "string") this.stringBuffer = t;
		else if (n.isBlobSchema()) this.byteBuffer = "byteLength" in t ? t : (this.serdeContext?.base64Decoder ?? St)(t);
		else {
			this.buffer = this.writeStruct(n, t, void 0);
			let e = n.getMergedTraits();
			e.httpPayload && !e.xmlName && this.buffer.withName(n.getName());
		}
	}
	flush() {
		if (this.byteBuffer !== void 0) {
			let e = this.byteBuffer;
			return delete this.byteBuffer, e;
		}
		if (this.stringBuffer !== void 0) {
			let e = this.stringBuffer;
			return delete this.stringBuffer, e;
		}
		let e = this.buffer;
		return this.settings.xmlNamespace && (e?.attributes?.xmlns || e.addAttribute("xmlns", this.settings.xmlNamespace)), delete this.buffer, e.toString();
	}
	writeStruct(e, t, n) {
		let r = e.getMergedTraits(), i = e.isMemberSchema() && !r.httpPayload ? e.getMemberTraits().xmlName ?? e.getMemberName() : r.xmlName ?? e.getName();
		if (!i || !e.isStructSchema()) throw Error(`@aws-sdk/core/protocols - xml serializer, cannot write struct with empty name or non-struct, schema=${e.getName(!0)}.`);
		let a = Ls.of(i), [o, s] = this.getXmlnsAttribute(e, n);
		for (let [n, r] of e.structIterator()) {
			let e = t[n];
			if (e != null || r.isIdempotencyToken()) {
				if (r.getMergedTraits().xmlAttribute) {
					a.addAttribute(r.getMergedTraits().xmlName ?? n, this.writeSimple(r, e));
					continue;
				}
				if (r.isListSchema()) this.writeList(r, e, a, s);
				else if (r.isMapSchema()) this.writeMap(r, e, a, s);
				else if (r.isStructSchema()) a.addChildNode(this.writeStruct(r, e, s));
				else {
					let t = Ls.of(r.getMergedTraits().xmlName ?? r.getMemberName());
					this.writeSimpleInto(r, e, t, s), a.addChildNode(t);
				}
			}
		}
		let { $unknown: c } = t;
		if (c && e.isUnionSchema() && Array.isArray(c) && Object.keys(t).length === 1) {
			let [e, n] = c, r = Ls.of(e);
			if (typeof n != "string") {
				if (t instanceof Ls || t instanceof Is) a.addChildNode(t);
				else throw Error("@aws-sdk - $unknown union member in XML requires value of type string, @aws-sdk/xml-builder::XmlNode or XmlText.");
			}
			this.writeSimpleInto(0, n, r, s), a.addChildNode(r);
		}
		return s && a.addAttribute(o, s), a;
	}
	writeList(e, t, n, r) {
		if (!e.isMemberSchema()) throw Error(`@aws-sdk/core/protocols - xml serializer, cannot write non-member list: ${e.getName(!0)}`);
		let i = e.getMergedTraits(), a = e.getValueSchema(), o = a.getMergedTraits(), s = !!o.sparse, c = !!i.xmlFlattened, [l, u] = this.getXmlnsAttribute(e, r), d = (t, n) => {
			if (a.isListSchema()) this.writeList(a, Array.isArray(n) ? n : [n], t, u);
			else if (a.isMapSchema()) this.writeMap(a, n, t, u);
			else if (a.isStructSchema()) {
				let r = this.writeStruct(a, n, u);
				t.addChildNode(r.withName(c ? i.xmlName ?? e.getMemberName() : o.xmlName ?? "member"));
			} else {
				let r = Ls.of(c ? i.xmlName ?? e.getMemberName() : o.xmlName ?? "member");
				this.writeSimpleInto(a, n, r, u), t.addChildNode(r);
			}
		};
		if (c) for (let e of t) (s || e != null) && d(n, e);
		else {
			let r = Ls.of(i.xmlName ?? e.getMemberName());
			u && r.addAttribute(l, u);
			for (let e of t) (s || e != null) && d(r, e);
			n.addChildNode(r);
		}
	}
	writeMap(e, t, n, r, i = !1) {
		if (!e.isMemberSchema()) throw Error(`@aws-sdk/core/protocols - xml serializer, cannot write non-member map: ${e.getName(!0)}`);
		let a = e.getMergedTraits(), o = e.getKeySchema(), s = o.getMergedTraits().xmlName ?? "key", c = e.getValueSchema(), l = c.getMergedTraits(), u = l.xmlName ?? "value", d = !!l.sparse, f = !!a.xmlFlattened, [ee, p] = this.getXmlnsAttribute(e, r), m = (e, t, n) => {
			let r = Ls.of(s, t), [i, a] = this.getXmlnsAttribute(o, p);
			a && r.addAttribute(i, a), e.addChildNode(r);
			let l = Ls.of(u);
			c.isListSchema() ? this.writeList(c, n, l, p) : c.isMapSchema() ? this.writeMap(c, n, l, p, !0) : c.isStructSchema() ? l = this.writeStruct(c, n, p) : this.writeSimpleInto(c, n, l, p), e.addChildNode(l);
		};
		if (f) for (let r in t) {
			let i = t[r];
			if (d || i != null) {
				let t = Ls.of(a.xmlName ?? e.getMemberName());
				m(t, r, i), n.addChildNode(t);
			}
		}
		else {
			let r;
			i || (r = Ls.of(a.xmlName ?? e.getMemberName()), p && r.addAttribute(ee, p), n.addChildNode(r));
			for (let e in t) {
				let a = t[e];
				if (d || a != null) {
					let t = Ls.of("entry");
					m(t, e, a), (i ? n : r).addChildNode(t);
				}
			}
		}
	}
	writeSimple(e, t) {
		if (t === null) throw Error("@aws-sdk/core/protocols - (XML serializer) cannot write null value.");
		let n = Xe.of(e), r = null;
		if (t && typeof t == "object") {
			if (n.isBlobSchema()) r = (this.serdeContext?.base64Encoder ?? Ct)(t);
			else if (n.isTimestampSchema() && t instanceof Date) switch (Ir(n, this.settings)) {
				case 5:
					r = t.toISOString().replace(".000Z", "Z");
					break;
				case 6:
					r = Gt(t);
					break;
				case 7:
					r = String(t.getTime() / 1e3);
					break;
				default: console.warn("Missing timestamp format, using http date", t), r = Gt(t);
			}
			else if (n.isBigDecimalSchema() && t) return t instanceof Dn ? t.string : String(t);
			else if (n.isMapSchema() || n.isListSchema()) throw Error("@aws-sdk/core/protocols - xml serializer, cannot call _write() on List/Map schema, call writeList or writeMap() instead.");
			else throw Error(`@aws-sdk/core/protocols - xml serializer, unhandled schema type for object value and schema: ${n.getName(!0)}`);
		}
		if ((n.isBooleanSchema() || n.isNumericSchema() || n.isBigIntegerSchema() || n.isBigDecimalSchema()) && (r = String(t)), n.isStringSchema() && (r = t === void 0 && n.isIdempotencyToken() ? Ar() : String(t)), r === null) throw Error(`Unhandled schema-value pair ${n.getName(!0)}=${t}`);
		return r;
	}
	writeSimpleInto(e, t, n, r) {
		let i = this.writeSimple(e, t), a = Xe.of(e), o = new Is(i), [s, c] = this.getXmlnsAttribute(a, r);
		c && n.addAttribute(s, c), n.addChildNode(o);
	}
	getXmlnsAttribute(e, t) {
		let [n, r] = e.getMergedTraits().xmlNamespace ?? [];
		return r && r !== t ? [n ? `xmlns:${n}` : "xmlns", r] : [void 0, void 0];
	}
}, Us = class extends Ds {
	settings;
	constructor(e) {
		super(), this.settings = e;
	}
	createSerializer() {
		let e = new Hs(this.settings);
		return e.setSerdeContext(this.serdeContext), e;
	}
	createDeserializer() {
		let e = new Bs(this.settings);
		return e.setSerdeContext(this.serdeContext), e;
	}
}, Ws = class extends Fr {
	codec;
	serializer;
	deserializer;
	mixin = new Es();
	constructor(e) {
		super(e);
		let t = {
			timestampFormat: {
				useTrait: !0,
				default: 5
			},
			httpBindings: !0,
			xmlNamespace: e.xmlNamespace,
			serviceNamespace: e.defaultNamespace
		};
		this.codec = new Us(t), this.serializer = new Br(this.codec.createSerializer(), t), this.deserializer = new Rr(this.codec.createDeserializer(), t);
	}
	getPayloadCodec() {
		return this.codec;
	}
	getShapeId() {
		return "aws.protocols#restXml";
	}
	async serializeRequest(e, t, n) {
		let r = await super.serializeRequest(e, t, n), i = Xe.of(e.input);
		if (!r.headers["content-type"]) {
			let e = this.mixin.resolveRestContentType(this.getDefaultContentType(), i);
			e && (r.headers["content-type"] = e);
		}
		return typeof r.body == "string" && r.headers["content-type"] === this.getDefaultContentType() && !r.body.startsWith("<?xml ") && !this.hasUnstructuredPayloadBinding(i) && (r.body = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" + r.body), r;
	}
	async deserializeResponse(e, t, n) {
		return super.deserializeResponse(e, t, n);
	}
	async handleError(e, t, n, r, i) {
		let a = Vs(n, r) ?? "Unknown";
		if (this.mixin.compose(this.compositeErrorRegistry, a, this.options.defaultNamespace), r.Error && typeof r.Error == "object") for (let e of Object.keys(r.Error)) r[e] = r.Error[e], e.toLowerCase() === "message" && (r.message = r.Error[e]);
		r.RequestId && !i.requestId && (i.requestId = r.RequestId);
		let { errorSchema: o, errorMetadata: s } = await this.mixin.getErrorSchemaOrThrowBaseException(a, this.options.defaultNamespace, n, r, i), c = Xe.of(o), l = r.Error?.message ?? r.Error?.Message ?? r.message ?? r.Message ?? "UnknownError", u = new ((this.compositeErrorRegistry.getErrorCtor(o)) ?? Error)({});
		await this.deserializeHttpMessage(o, t, n, r);
		let d = {}, f = this.codec.createDeserializer();
		for (let [e, t] of c.structIterator()) {
			let n = t.getMergedTraits().xmlName ?? e, i = r.Error?.[n] ?? r[n];
			d[e] = f.readSchema(t, i);
		}
		throw this.mixin.decorateServiceException(Object.assign(u, s, {
			$fault: c.getMergedTraits().error,
			message: l
		}, d), r);
	}
	getDefaultContentType() {
		return "application/xml";
	}
	hasUnstructuredPayloadBinding(e) {
		for (let [, t] of e.structIterator()) if (t.getMergedTraits().httpPayload) return !(t.isStructSchema() || t.isMapSchema() || t.isListSchema());
		return !1;
	}
}, Gs = class extends Ws {
	async serializeRequest(e, t, n) {
		let r = await super.serializeRequest(e, t, n), i = Xe.of(e.input), a = i.getSchema(), o = 0, s = a[6] ?? 0;
		if (t && typeof t == "object") for (let [e, n] of i.structIterator()) {
			if (++o > s) break;
			if (e === "Bucket") {
				if (!t.Bucket && n.getMergedTraits().httpLabel) throw Error("No value provided for input HTTP label: Bucket.");
				break;
			}
		}
		return r;
	}
};
function Ks(e) {
	return (t) => async (n) => {
		let { request: r } = n;
		if (e.expectContinueHeader !== !1 && l.isInstance(r) && r.body && e.runtime === "node" && e.requestHandler?.constructor?.name !== "FetchHttpHandler") {
			let t = !0;
			if (typeof e.expectContinueHeader == "number") try {
				t = (Number(r.headers?.["content-length"]) ?? e.bodyLengthChecker?.(r.body) ?? Infinity) >= e.expectContinueHeader;
			} catch {}
			else t = !!e.expectContinueHeader;
			t && (r.headers.Expect = "100-continue");
		}
		return t({
			...n,
			request: r
		});
	};
}
var qs = {
	step: "build",
	tags: ["SET_EXPECT_HEADER", "EXPECT_HEADER"],
	name: "addExpectContinueMiddleware",
	override: !0
}, Js = (e) => ({ applyToStack: (t) => {
	t.add(Ks(e), qs);
} });
function Ys(e) {
	return (t) => async (n) => {
		let { CreateBucketConfiguration: r } = n.input, i = await e.region();
		return !r?.LocationConstraint && !r?.Location && i !== "us-east-1" && (n.input.CreateBucketConfiguration = n.input.CreateBucketConfiguration ?? {}, n.input.CreateBucketConfiguration.LocationConstraint = i), t(n);
	};
}
var Xs = {
	step: "initialize",
	tags: ["LOCATION_CONSTRAINT", "CREATE_BUCKET_CONFIGURATION"],
	name: "locationConstraintMiddleware",
	override: !0
}, Zs = (e) => ({ applyToStack: (t) => {
	t.add(Ys(e), Xs);
} });
function Qs(e) {
	return (t) => async (n) => {
		let r = { ...n.input };
		for (let t of [{
			target: "SSECustomerKey",
			hash: "SSECustomerKeyMD5"
		}, {
			target: "CopySourceSSECustomerKey",
			hash: "CopySourceSSECustomerKeyMD5"
		}]) {
			let n = r[t.target];
			if (n) {
				let i;
				typeof n == "string" ? tc(n, e) ? i = e.base64Decoder(n) : (i = e.utf8Decoder(n), r[t.target] = e.base64Encoder(i)) : (i = ArrayBuffer.isView(n) ? new Uint8Array(n.buffer, n.byteOffset, n.byteLength) : new Uint8Array(n), r[t.target] = e.base64Encoder(i));
				let a = new e.md5();
				a.update(i), r[t.hash] = e.base64Encoder(await a.digest());
			}
		}
		return t({
			...n,
			input: r
		});
	};
}
var $s = {
	name: "ssecMiddleware",
	step: "initialize",
	tags: ["SSE"],
	override: !0
}, ec = (e) => ({ applyToStack: (t) => {
	t.add(Qs(e), $s);
} });
function tc(e, t) {
	if (!/^(?:[A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(e)) return !1;
	try {
		return t.base64Decoder(e).length === 32;
	} catch {
		return !1;
	}
}
var nc = class e {
	bytes;
	constructor(e) {
		if (this.bytes = e, e.byteLength !== 8) throw Error("Int64 buffers must be exactly 8 bytes");
	}
	static fromNumber(t) {
		if (t > 0x8000000000000000 || t < -0x8000000000000000) throw Error(`${t} is too large (or, if negative, too small) to represent as an Int64`);
		let n = /* @__PURE__ */ new Uint8Array(8);
		for (let e = 7, r = Math.abs(Math.round(t)); e > -1 && r > 0; e--, r /= 256) n[e] = r;
		return t < 0 && rc(n), new e(n);
	}
	valueOf() {
		let e = this.bytes.slice(0), t = e[0] & 128;
		return t && rc(e), parseInt(m(e), 16) * (t ? -1 : 1);
	}
	toString() {
		return String(this.valueOf());
	}
};
function rc(e) {
	for (let t = 0; t < 8; t++) e[t] ^= 255;
	for (let t = 7; t > -1 && (e[t]++, e[t] === 0); t--);
}
var ic = class {
	toUtf8;
	fromUtf8;
	constructor(e, t) {
		this.toUtf8 = e, this.fromUtf8 = t;
	}
	format(e) {
		let t = [];
		for (let n in e) {
			if (!p(e, n)) continue;
			let r = this.fromUtf8(n);
			t.push(Uint8Array.from([r.byteLength]), r, this.formatHeaderValue(e[n]));
		}
		let n = new Uint8Array(t.reduce((e, t) => e + t.byteLength, 0)), r = 0;
		for (let e of t) n.set(e, r), r += e.byteLength;
		return n;
	}
	formatHeaderValue(e) {
		switch (e.type) {
			case "boolean": return Uint8Array.from([+!e.value]);
			case "byte": return Uint8Array.from([2, e.value]);
			case "short":
				let t = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(3));
				return t.setUint8(0, 3), t.setInt16(1, e.value, !1), new Uint8Array(t.buffer);
			case "integer":
				let n = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(5));
				return n.setUint8(0, 4), n.setInt32(1, e.value, !1), new Uint8Array(n.buffer);
			case "long":
				let r = /* @__PURE__ */ new Uint8Array(9);
				return r[0] = 5, r.set(e.value.bytes, 1), r;
			case "binary":
				let i = new DataView(new ArrayBuffer(3 + e.value.byteLength));
				i.setUint8(0, 6), i.setUint16(1, e.value.byteLength, !1);
				let a = new Uint8Array(i.buffer);
				return a.set(e.value, 3), a;
			case "string":
				let o = this.fromUtf8(e.value), s = new DataView(new ArrayBuffer(3 + o.byteLength));
				s.setUint8(0, 7), s.setUint16(1, o.byteLength, !1);
				let c = new Uint8Array(s.buffer);
				return c.set(o, 3), c;
			case "timestamp":
				let l = /* @__PURE__ */ new Uint8Array(9);
				return l[0] = 8, l.set(nc.fromNumber(e.value.valueOf()).bytes, 1), l;
			case "uuid":
				if (!hc.test(e.value)) throw Error(`Invalid UUID received: ${e.value}`);
				let u = /* @__PURE__ */ new Uint8Array(17);
				return u[0] = 9, u.set(ne(e.value.replace(/-/g, "")), 1), u;
		}
	}
	parse(e) {
		let t = {}, n = 0;
		for (; n < e.byteLength;) {
			let r = e.getUint8(n++), i = this.toUtf8(new Uint8Array(e.buffer, e.byteOffset + n, r));
			switch (n += r, e.getUint8(n++)) {
				case 0:
					t[i] = {
						type: oc,
						value: !0
					};
					break;
				case 1:
					t[i] = {
						type: oc,
						value: !1
					};
					break;
				case 2:
					t[i] = {
						type: sc,
						value: e.getInt8(n++)
					};
					break;
				case 3:
					t[i] = {
						type: cc,
						value: e.getInt16(n, !1)
					}, n += 2;
					break;
				case 4:
					t[i] = {
						type: lc,
						value: e.getInt32(n, !1)
					}, n += 4;
					break;
				case 5:
					t[i] = {
						type: uc,
						value: new nc(new Uint8Array(e.buffer, e.byteOffset + n, 8))
					}, n += 8;
					break;
				case 6:
					let r = e.getUint16(n, !1);
					n += 2, t[i] = {
						type: dc,
						value: new Uint8Array(e.buffer, e.byteOffset + n, r)
					}, n += r;
					break;
				case 7:
					let a = e.getUint16(n, !1);
					n += 2, t[i] = {
						type: fc,
						value: this.toUtf8(new Uint8Array(e.buffer, e.byteOffset + n, a))
					}, n += a;
					break;
				case 8:
					t[i] = {
						type: pc,
						value: new Date(new nc(new Uint8Array(e.buffer, e.byteOffset + n, 8)).valueOf())
					}, n += 8;
					break;
				case 9:
					let o = new Uint8Array(e.buffer, e.byteOffset + n, 16);
					n += 16, t[i] = {
						type: mc,
						value: `${m(o.subarray(0, 4))}-${m(o.subarray(4, 6))}-${m(o.subarray(6, 8))}-${m(o.subarray(8, 10))}-${m(o.subarray(10))}`
					};
					break;
				default: throw Error("Unrecognized header type tag");
			}
		}
		return t;
	}
}, ac;
(function(e) {
	e[e.boolTrue = 0] = "boolTrue", e[e.boolFalse = 1] = "boolFalse", e[e.byte = 2] = "byte", e[e.short = 3] = "short", e[e.integer = 4] = "integer", e[e.long = 5] = "long", e[e.byteArray = 6] = "byteArray", e[e.string = 7] = "string", e[e.timestamp = 8] = "timestamp", e[e.uuid = 9] = "uuid";
})(ac ||= {});
var oc = "boolean", sc = "byte", cc = "short", lc = "integer", uc = "long", dc = "binary", fc = "string", pc = "timestamp", mc = "uuid", hc = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/, gc = 4, _c = 8, vc = 4, yc = 16;
function bc({ byteLength: e, byteOffset: t, buffer: n }) {
	if (e < yc) throw Error("Provided message too short to accommodate event stream message overhead");
	let r = new DataView(n, t, e), i = r.getUint32(0, !1);
	if (e !== i) throw Error("Reported message length does not match received message length");
	let a = r.getUint32(gc, !1), o = r.getUint32(_c, !1), s = r.getUint32(e - vc, !1), c = new fo();
	if (c.update(new Uint8Array(n, t, _c)), o !== c.digestSync()) throw Error(`The prelude checksum specified in the message (${o}) does not match the calculated CRC32 checksum (${c.digestSync()})`);
	if (c.update(new Uint8Array(n, t + _c, e - 12)), s !== c.digestSync()) throw Error(`The message checksum (${c.digestSync()}) did not match the expected value of ${s}`);
	return {
		headers: new DataView(n, t + _c + vc, a),
		body: new Uint8Array(n, t + _c + vc + a, i - a - 16)
	};
}
var xc = class {
	headerMarshaller;
	messageBuffer;
	isEndOfStream;
	constructor(e, t) {
		this.headerMarshaller = new ic(e, t), this.messageBuffer = [], this.isEndOfStream = !1;
	}
	feed(e) {
		this.messageBuffer.push(this.decode(e));
	}
	endOfStream() {
		this.isEndOfStream = !0;
	}
	getMessage() {
		let e = this.messageBuffer.pop(), t = this.isEndOfStream;
		return {
			getMessage() {
				return e;
			},
			isEndOfStream() {
				return t;
			}
		};
	}
	getAvailableMessages() {
		let e = this.messageBuffer;
		this.messageBuffer = [];
		let t = this.isEndOfStream;
		return {
			getMessages() {
				return e;
			},
			isEndOfStream() {
				return t;
			}
		};
	}
	encode({ headers: e, body: t }) {
		let n = this.headerMarshaller.format(e), r = n.byteLength + t.byteLength + 16, i = new Uint8Array(r), a = new DataView(i.buffer, i.byteOffset, i.byteLength), o = new fo();
		return a.setUint32(0, r, !1), a.setUint32(4, n.byteLength, !1), o.update(i.subarray(0, 8)), a.setUint32(8, o.digestSync(), !1), i.set(n, 12), i.set(t, n.byteLength + 12), o.update(i.subarray(8, r - 4)), a.setUint32(r - 4, o.digestSync(), !1), i;
	}
	decode(e) {
		let { headers: t, body: n } = bc(e);
		return {
			headers: this.headerMarshaller.parse(t),
			body: n
		};
	}
	formatHeaders(e) {
		return this.headerMarshaller.format(e);
	}
}, Sc = class {
	options;
	constructor(e) {
		this.options = e;
	}
	[Symbol.asyncIterator]() {
		return this.asyncIterator();
	}
	async *asyncIterator() {
		for await (let e of this.options.inputStream) yield this.options.decoder.decode(e);
	}
}, Cc = class {
	options;
	constructor(e) {
		this.options = e;
	}
	[Symbol.asyncIterator]() {
		return this.asyncIterator();
	}
	async *asyncIterator() {
		for await (let e of this.options.messageStream) yield this.options.encoder.encode(e);
		this.options.includeEndFrame && (yield /* @__PURE__ */ new Uint8Array());
	}
}, wc = class {
	options;
	constructor(e) {
		this.options = e;
	}
	[Symbol.asyncIterator]() {
		return this.asyncIterator();
	}
	async *asyncIterator() {
		for await (let e of this.options.messageStream) {
			let t = await this.options.deserializer(e);
			t !== void 0 && (yield t);
		}
	}
}, Tc = class {
	options;
	constructor(e) {
		this.options = e;
	}
	[Symbol.asyncIterator]() {
		return this.asyncIterator();
	}
	async *asyncIterator() {
		for await (let e of this.options.inputStream) yield this.options.serializer(e);
	}
};
function Ec(e) {
	let t = 0, n = 0, r = null, i = null, a = (e) => {
		if (typeof e != "number") throw Error("Attempted to allocate an event message where size was not a number: " + e);
		t = e, n = 4, r = new Uint8Array(e), new DataView(r.buffer).setUint32(0, e, !1);
	}, o = async function* () {
		let o = e[Symbol.asyncIterator]();
		for (;;) {
			let { value: e, done: s } = await o.next();
			if (s) {
				if (!t) return;
				if (t === n) yield r;
				else throw Error("Truncated event message received.");
				return;
			}
			let c = e.length, l = 0;
			for (; l < c;) {
				if (!r) {
					let t = c - l;
					i ||= /* @__PURE__ */ new Uint8Array(4);
					let r = Math.min(4 - n, t);
					if (i.set(e.slice(l, l + r), n), n += r, l += r, n < 4) break;
					a(new DataView(i.buffer).getUint32(0, !1)), i = null;
				}
				let o = Math.min(t - n, c - l);
				r.set(e.slice(l, l + o), n), n += o, l += o, t && t === n && (yield r, r = null, t = 0, n = 0);
			}
		}
	};
	return { [Symbol.asyncIterator]: o };
}
function Dc(e, t) {
	return async function(n) {
		let { value: r } = n.headers[":message-type"];
		if (r === "error") {
			let e = Error(n.headers[":error-message"].value || "UnknownError");
			throw e.name = n.headers[":error-code"].value, e;
		}
		if (r === "exception") {
			let r = n.headers[":exception-type"].value, i = await e({ [r]: n });
			if (i.$unknown) {
				let e = Error(t(n.body));
				throw e.name = r, e;
			}
			throw i[r];
		}
		if (r === "event") {
			let t = await e({ [n.headers[":event-type"].value]: n });
			return t.$unknown ? void 0 : t;
		}
		throw Error(`Unrecognizable event type: ${n.headers[":event-type"].value}`);
	};
}
var Oc = class {
	eventStreamCodec;
	utfEncoder;
	constructor({ utf8Encoder: e, utf8Decoder: t }) {
		this.eventStreamCodec = new xc(e, t), this.utfEncoder = e;
	}
	deserialize(e, t) {
		return new wc({
			messageStream: new Sc({
				inputStream: Ec(e),
				decoder: this.eventStreamCodec
			}),
			deserializer: Dc(t, this.utfEncoder)
		});
	}
	serialize(e, t) {
		return new Cc({
			messageStream: new Tc({
				inputStream: e,
				serializer: t
			}),
			encoder: this.eventStreamCodec,
			includeEndFrame: !0
		});
	}
}, kc = (e) => ({ [Symbol.asyncIterator]: async function* () {
	let t = e.getReader();
	try {
		for (;;) {
			let { done: e, value: n } = await t.read();
			if (e) return;
			yield n;
		}
	} finally {
		t.releaseLock();
	}
} }), Ac = (e) => {
	let t = e[Symbol.asyncIterator]();
	return new ReadableStream({ async pull(e) {
		let { done: n, value: r } = await t.next();
		if (n) return e.close();
		e.enqueue(r);
	} });
}, jc = class {
	universalMarshaller;
	constructor({ utf8Encoder: e, utf8Decoder: t }) {
		this.universalMarshaller = new Oc({
			utf8Decoder: t,
			utf8Encoder: e
		});
	}
	deserialize(e, t) {
		let n = Mc(e) ? kc(e) : e;
		return this.universalMarshaller.deserialize(n, t);
	}
	serialize(e, t) {
		let n = this.universalMarshaller.serialize(e, t);
		return typeof ReadableStream == "function" ? Ac(n) : n;
	}
}, Mc = (e) => typeof ReadableStream == "function" && e instanceof ReadableStream, Nc = (e) => new jc(e), Pc = (e) => Object.assign(e, { eventStreamMarshaller: e.eventStreamSerdeProvider(e) }), Fc = class {
	marshaller;
	serializer;
	deserializer;
	serdeContext;
	defaultContentType;
	compositeErrorRegistry;
	constructor({ marshaller: e, serializer: t, deserializer: n, serdeContext: r, defaultContentType: i, compositeErrorRegistry: a }) {
		this.marshaller = e, this.serializer = t, this.deserializer = n, this.serdeContext = r, this.defaultContentType = i, this.compositeErrorRegistry = a;
	}
	async serializeEventStream({ eventStream: e, requestSchema: t, initialRequest: n, initialMessageType: r }) {
		let i = this.marshaller, a = t.getEventStreamMember(), o = t.getMemberSchema(a), s = this.serializer, c = this.defaultContentType, l = Symbol("initialRequestMarker"), u = { async *[Symbol.asyncIterator]() {
			if (n) {
				let e = {
					":event-type": {
						type: "string",
						value: r ?? "initial-request"
					},
					":message-type": {
						type: "string",
						value: "event"
					},
					":content-type": {
						type: "string",
						value: c
					}
				};
				s.write(t, n);
				let i = s.flush();
				yield {
					[l]: !0,
					headers: e,
					body: i
				};
			}
			for await (let t of e) yield t;
		} };
		return i.serialize(u, (e) => {
			if (e[l]) return {
				headers: e.headers,
				body: e.body
			};
			let t = "";
			for (let n in e) if (p(e, n) && n !== "__type") {
				t = n;
				break;
			}
			let { additionalHeaders: n, body: r, eventType: i, explicitPayloadContentType: a } = this.writeEventBody(t, o, e);
			return {
				headers: {
					":event-type": {
						type: "string",
						value: i
					},
					":message-type": {
						type: "string",
						value: "event"
					},
					":content-type": {
						type: "string",
						value: a ?? c
					},
					...n
				},
				body: r
			};
		});
	}
	async deserializeEventStream({ response: e, responseSchema: t, initialResponseContainer: n, initialMessageType: r }) {
		let i = this.marshaller, a = t.getEventStreamMember(), o = t.getMemberSchema(a).getMemberSchemas(), s = Symbol("initialResponseMarker"), c = i.deserialize(e.body, async (e) => {
			let n = "";
			for (let t in e) if (p(e, t) && t !== "__type") {
				n = t;
				break;
			}
			let i = e[n].body;
			if (n === (r ?? "initial-response")) {
				let e = await this.deserializer.read(t, i);
				return delete e[a], {
					[s]: !0,
					...e
				};
			}
			if (n in o) {
				let t = o[n];
				if (t.isStructSchema()) {
					let r = {}, a = !1;
					for (let [o, s] of t.structIterator()) {
						let { eventHeader: t, eventPayload: c } = s.getMergedTraits();
						if (a ||= !!(t || c), c) s.isBlobSchema() ? r[o] = i : s.isStringSchema() ? r[o] = (this.serdeContext?.utf8Encoder ?? Tt)(i) : s.isStructSchema() && (r[o] = await this.deserializer.read(s, i));
						else if (t) {
							let t = e[n].headers[o]?.value;
							t != null && (r[o] = s.isNumericSchema() ? t && typeof t == "object" && "bytes" in t ? BigInt(t.toString()) : Number(t) : t);
						}
					}
					return { [n]: await this.readEventMember(t, i, a, r) };
				}
				return { [n]: await this.deserializer.read(t, i) };
			}
			return { $unknown: e };
		}), l = c[Symbol.asyncIterator](), u = await l.next();
		if (u.done) return c;
		if (u.value?.[s]) {
			if (!t) throw Error("@smithy::core/protocols - initial-response event encountered in event stream but no response schema given.");
			for (let e in u.value) p(u.value, e) && (n[e] = u.value[e]);
		}
		return { async *[Symbol.asyncIterator]() {
			for (u?.value?.[s] || (yield u.value);;) {
				let { done: e, value: t } = await l.next();
				if (e) break;
				yield t;
			}
		} };
	}
	async readEventMember(e, t, n, r) {
		let i, a = e.getSchema();
		if (Array.isArray(a) && a[0] === -3) {
			let e = a[1], t = et.for(e);
			this.compositeErrorRegistry?.copyFrom(t), i = (this.compositeErrorRegistry ?? t)?.getErrorCtor(a);
		}
		let o = n ? r : t.byteLength === 0 ? {} : await this.deserializer.read(e, t);
		if (i) {
			let t = o.message ?? o.Message ?? "Unknown", n = {}, r = e.getMergedTraits().error;
			return r && (n.$fault = r), Object.assign(new i({}), n, { message: t }, o);
		}
		return o;
	}
	writeEventBody(e, t, n) {
		let r = this.serializer, i = e, a = null, o, s = t.getSchema()[4].includes(e), c = {};
		if (s) {
			let i = t.getMemberSchema(e);
			if (i.isStructSchema()) {
				for (let [t, r] of i.structIterator()) {
					let { eventHeader: i, eventPayload: o } = r.getMergedTraits();
					if (o) a = t;
					else if (i) {
						let i = n[e][t], a = "binary";
						r.isNumericSchema() ? a = (-2) ** 31 <= i && i <= 2 ** 31 - 1 ? "integer" : "long" : r.isTimestampSchema() ? a = "timestamp" : r.isStringSchema() ? a = "string" : r.isBooleanSchema() && (a = "boolean"), i != null && (c[t] = {
							type: a,
							value: i
						}, delete n[e][t]);
					}
				}
				if (a !== null) {
					let t = i.getMemberSchema(a);
					t.isBlobSchema() ? o = "application/octet-stream" : t.isStringSchema() && (o = "text/plain"), r.write(t, n[e][a]);
				} else r.write(i, n[e]);
			} else if (i.isUnitSchema()) r.write(i, {});
			else throw Error("@smithy/core/event-streams - non-struct member not supported in event stream union.");
		} else {
			let [t, a] = n[e];
			i = t, r.write(15, a);
		}
		let l = r.flush() ?? /* @__PURE__ */ new Uint8Array();
		return {
			body: typeof l == "string" ? (this.serdeContext?.utf8Decoder ?? te)(l) : l,
			eventType: i,
			explicitPayloadContentType: o,
			additionalHeaders: c
		};
	}
}, Ic = (e) => ve.isInstance(e) ? e.headers?.date ?? e.headers?.Date : void 0, Lc = (e) => ve.isInstance(e) ? e.headers?.age ?? e.headers?.Age : void 0, Rc = (e) => new Date(Date.now() + e), zc = (e, t, n, r) => {
	if (r !== void 0) return t;
	let i = Date.parse(e), a = Date.now();
	return n !== void 0 && a - n > 9e5 ? t : n === void 0 ? i - a : i - (n + a) / 2;
}, Bc = (e, t) => {
	if (!t) throw Error(`Property \`${e}\` is not resolved for AWS SDK SigV4Auth`);
	return t;
}, Vc = async (e) => {
	let t = Bc("context", e.context), n = Bc("config", e.config), r = t.endpointV2?.properties?.authSchemes?.[0];
	return {
		config: n,
		signer: await Bc("signer", n.signer)(r),
		signingRegion: e?.signingRegion,
		signingRegionSet: e?.signingRegionSet,
		signingName: e?.signingName
	};
}, Hc = class {
	async sign(e, t, n) {
		if (!l.isInstance(e)) throw Error("The request is not an instance of `HttpRequest` and cannot be signed");
		let r = await Vc(n), { config: i, signer: a } = r, { signingRegion: o, signingName: s } = r, c = n.context;
		if (c?.authSchemes?.length ?? !1) {
			let [e, t] = c.authSchemes;
			e?.name === "sigv4a" && t?.name === "sigv4" && (o = t?.signingRegion ?? o, s = t?.signingName ?? s);
		}
		let u = await i.disableClockSkewCorrection?.() === !0;
		return n._disableClockSkewCorrection = u, u || (n._preRequestSystemClockOffset = i.systemClockOffset, n._requestSentAt = Date.now()), await a.sign(e, {
			signingDate: u ? /* @__PURE__ */ new Date() : Rc(i.systemClockOffset),
			signingRegion: o,
			signingService: s
		});
	}
	errorHandler(e) {
		return (t) => {
			let n = t;
			if (!e._disableClockSkewCorrection) {
				let t = n.ServerTime ?? Ic(n.$response);
				if (t) {
					let r = Bc("config", e.config), i = e._preRequestSystemClockOffset, a = e._requestSentAt, o = Lc(n.$response), s = zc(t, r.systemClockOffset, a, o);
					r.systemClockOffset = s, Math.abs(s) >= 24e4 && (s !== i || i !== void 0 && i !== s) && n.$metadata && (n.$metadata.clockSkewCorrected = !0);
				}
			}
			throw t;
		};
	}
	successHandler(e, t) {
		if (t._disableClockSkewCorrection) return;
		let n = Ic(e);
		if (n) {
			let r = Bc("config", t.config), i = t._requestSentAt, a = Lc(e);
			r.systemClockOffset = zc(n, r.systemClockOffset, i, a);
		}
	}
}, Uc = class extends Hc {
	async sign(e, t, n) {
		if (!l.isInstance(e)) throw Error("The request is not an instance of `HttpRequest` and cannot be signed");
		let { config: r, signer: i, signingRegion: a, signingRegionSet: o, signingName: s } = await Vc(n), c = (await r.sigv4aSigningRegionSet?.() ?? o ?? [a]).join(","), u = await r.disableClockSkewCorrection?.() === !0;
		return n._disableClockSkewCorrection = u, u || (n._preRequestSystemClockOffset = r.systemClockOffset, n._requestSentAt = Date.now()), await i.sign(e, {
			signingDate: u ? /* @__PURE__ */ new Date() : Rc(r.systemClockOffset),
			signingRegion: c,
			signingService: s
		});
	}
}, Wc = (e) => (e.sigv4aSigningRegionSet = qi(e.sigv4aSigningRegionSet), e), Gc = (e) => (t) => {
	let n = t.credentials, r = !!t.credentials, i;
	Object.defineProperty(t, "credentials", {
		set(e) {
			e && e !== n && e !== i && (r = !0), n = e;
			let a = qc(t, Kc(t, {
				credentials: n,
				credentialDefaultProvider: t.credentialDefaultProvider
			}));
			if (r && !a.attributed) {
				let e = typeof n == "object" && !!n;
				i = async (t) => {
					let n = await a(t);
					return e && (!n.$source || Object.keys(n.$source).length === 0) ? le(n, "CREDENTIALS_CODE", "e") : n;
				}, i.memoized = a.memoized, i.configBound = a.configBound, i.attributed = !0;
			} else i = a;
		},
		get() {
			return i;
		},
		enumerable: !0,
		configurable: !0
	}), t.credentials = n;
	let { signingEscapePath: a = !0, systemClockOffset: o = t.systemClockOffset || 0, sha256: c } = t, l;
	return l = t.signer ? qi(t.signer) : t.regionInfoProvider ? () => qi(t.region)().then(async (e) => [await t.regionInfoProvider(e, {
		useFipsEndpoint: await t.useFipsEndpoint(),
		useDualstackEndpoint: await t.useDualstackEndpoint()
	}) || {}, e]).then(([e, n]) => {
		let { signingRegion: r, signingService: i } = e;
		t.signingRegion = t.signingRegion || r || n, t.signingName = t.signingName || i || t.serviceId;
		let o = {
			...t,
			credentials: t.credentials,
			region: t.signingRegion,
			service: t.signingName,
			sha256: c,
			uriEscapePath: a
		};
		return new (t.signerConstructor || s)(o);
	}) : async (e) => {
		e = Object.assign({}, {
			name: "sigv4",
			signingName: t.signingName || t.defaultSigningName,
			signingRegion: await qi(t.region)(),
			properties: {}
		}, e);
		let n = e.signingRegion, r = e.signingName;
		t.signingRegion = t.signingRegion || n, t.signingName = t.signingName || r || t.serviceId;
		let i = {
			...t,
			credentials: t.credentials,
			region: t.signingRegion,
			service: t.signingName,
			sha256: c,
			uriEscapePath: a
		};
		return new (t.signerConstructor || s)(i);
	}, Object.assign(t, {
		systemClockOffset: o,
		signingEscapePath: a,
		signer: l,
		disableClockSkewCorrection: qi(t.disableClockSkewCorrection ?? e)
	});
};
function Kc(e, { credentials: t, credentialDefaultProvider: n }) {
	let r;
	return r = t ? t?.memoized ? t : ea(t, Qi, $i) : n ? qi(n(Object.assign({}, e, { parentClientConfig: e }))) : async () => {
		throw Error("@aws-sdk/core::resolveAwsSdkSigV4Config - `credentials` not provided and no credentialDefaultProvider was configured.");
	}, r.memoized = !0, r;
}
function qc(e, t) {
	if (t.configBound) return t;
	let n = async (n) => t({
		...n,
		callerClientConfig: e
	});
	return n.memoized = t.memoized, n.configBound = !0, n;
}
var Jc = Gc(!1), g = "ref", _ = "argv", Yc = "backend", Xc = "authSchemes", Zc = "disableDoubleEncoding", Qc = "signingName", $c = "signingRegion", el = "signingRegionSet", v = -1, y = !0, tl = !1, nl = "isSet", rl = "booleanEquals", b = "stringEquals", il = "coalesce", al = "substring", ol = "", sl = "aws.partition", cl = "partitionResult", ll = "accessPointSuffix", ul = "regionPrefix", dl = (e) => "outpostId_ssa_" + e + ol, fl = "hardwareType", pl = "ite", ml = "isValidHostLabel", hl = "sigv4", gl = "aws.isVirtualHostableS3Bucket", _l = "url", vl = "getAttr", yl = "bucketArn", bl = "--", xl = "arnType", Sl = "accesspoint", Cl = (e) => "accessPointName_ssa_" + e + ol, wl = "s3-object-lambda", Tl = "s3-outposts", El = "bucketPartition", Dl = "us-east-1", Ol = "outpostType", kl = "name", Al = "s3", jl = "{url#scheme}://{Bucket}.{url#authority}{url#path}", Ml = "{url#scheme}://{url#authority}{url#path}", Nl = "{url#scheme}://{url#authority}{url#normalizedPath}{Bucket}", Pl = "https://{Bucket}.s3-accelerate.{partitionResult#dnsSuffix}", Fl = "https://{Bucket}.s3.{partitionResult#dnsSuffix}", Il = (e) => "{url#scheme}://{accessPointName_ssa_" + e + "}-{bucketArn#accountId}.{url#authority}{url#path}", Ll = (e) => "Invalid ARN: The access point name may only contain a-z, A-Z, 0-9 and `-`. Found: `{accessPointName_ssa_" + e + "}`", Rl = "sigv4a", zl = "{url#scheme}://{url#authority}{url#normalizedPath}{uri_encoded_bucket}", Bl = "https://s3.{partitionResult#dnsSuffix}/{uri_encoded_bucket}", Vl = "https://s3.{partitionResult#dnsSuffix}", Hl = { [g]: "UseFIPS" }, Ul = { [g]: "UseDualStack" }, Wl = { [g]: "Bucket" }, Gl = {
	fn: vl,
	[_]: [{ [g]: cl }, kl]
}, Kl = { [g]: _l }, ql = { [g]: "Region" }, Jl = { [g]: yl }, Yl = { [g]: xl }, Xl = { [g]: "accessPointName_ssa_1" }, Zl = {
	fn: vl,
	[_]: [Jl, "region"]
}, Ql = { [g]: fl }, $l = {
	fn: vl,
	[_]: [Jl, "service"]
}, eu = {
	fn: vl,
	[_]: [Jl, "accountId"]
}, tu = {
	[Yc]: "S3Express",
	[Xc]: [{
		[Zc]: !0,
		[kl]: "{_s3e_auth}",
		[Qc]: "s3express",
		[$c]: "{Region}"
	}]
}, nu = {
	[Yc]: "S3Express",
	[Xc]: [{
		[Zc]: !0,
		[kl]: hl,
		[Qc]: "s3express",
		[$c]: "{Region}"
	}]
}, ru = { [Xc]: [{
	[Zc]: !0,
	[kl]: Rl,
	[Qc]: Tl,
	[el]: ["*"]
}, {
	[Zc]: !0,
	[kl]: hl,
	[Qc]: Tl,
	[$c]: "{Region}"
}] }, iu = { [Xc]: [{
	[Zc]: !0,
	[kl]: hl,
	[Qc]: Al,
	[$c]: Dl
}] }, x = { [Xc]: [{
	[Zc]: !0,
	[kl]: hl,
	[Qc]: Al,
	[$c]: "{Region}"
}] }, au = { [Xc]: [{
	[Zc]: !0,
	[kl]: hl,
	[Qc]: wl,
	[$c]: "{bucketArn#region}"
}] }, ou = { [Xc]: [{
	[Zc]: !0,
	[kl]: hl,
	[Qc]: Al,
	[$c]: "{bucketArn#region}"
}] }, su = { [Xc]: [{
	[Zc]: !0,
	[kl]: Rl,
	[Qc]: Tl,
	[el]: ["*"]
}, {
	[Zc]: !0,
	[kl]: hl,
	[Qc]: Tl,
	[$c]: "{bucketArn#region}"
}] }, cu = { [Xc]: [{
	[Zc]: !0,
	[kl]: hl,
	[Qc]: wl,
	[$c]: "{Region}"
}] }, lu = [ql], uu = [{ [g]: "Endpoint" }], du = [Wl], fu = [
	Wl,
	0,
	7,
	!0
], pu = [Jl, "resourceId[1]"], mu = ["*"], hu = {
	conditions: [
		[nl, lu],
		[rl, [{ [g]: "Accelerate" }, y]],
		[rl, [Hl, y]],
		[rl, [Ul, y]],
		[nl, uu],
		[nl, du],
		[b, [{
			fn: il,
			[_]: [{
				fn: al,
				[_]: [
					Wl,
					0,
					6,
					y
				]
			}, ol]
		}, "--x-s3"]],
		[b, [{
			fn: il,
			[_]: [{
				fn: al,
				[_]: fu
			}, ol]
		}, "--xa-s3"]],
		[
			sl,
			lu,
			cl
		],
		[
			al,
			fu,
			ll
		],
		[b, [{ [g]: ll }, "--op-s3"]],
		[
			al,
			[
				Wl,
				8,
				12,
				y
			],
			ul
		],
		[
			al,
			[
				Wl,
				32,
				49,
				y
			],
			dl(2)
		],
		[
			al,
			[
				Wl,
				49,
				50,
				y
			],
			fl
		],
		[rl, [{ [g]: "ForcePathStyle" }, y]],
		[b, [Gl, "aws-cn"]],
		[
			pl,
			[
				Ul,
				".dualstack",
				ol
			],
			"_s3e_ds"
		],
		[ml, [{ [g]: dl(2) }, tl]],
		[
			pl,
			[
				Hl,
				"-fips",
				ol
			],
			"_s3e_fips"
		],
		[
			pl,
			[
				{
					fn: il,
					[_]: [{ [g]: "DisableS3ExpressSessionAuth" }, tl]
				},
				hl,
				"sigv4-s3express"
			],
			"_s3e_auth"
		],
		[gl, [Wl, tl]],
		[
			"parseURL",
			uu,
			_l
		],
		[rl, [{
			fn: il,
			[_]: [{ [g]: "UseS3ExpressControlEndpoint" }, tl]
		}, y]],
		[gl, [Wl, y]],
		[b, [{
			fn: vl,
			[_]: [Kl, "scheme"]
		}, "http"]],
		[ml, [ql, tl]],
		[
			"aws.parseArn",
			du,
			yl
		],
		[
			vl,
			[{
				fn: "split",
				[_]: [
					Wl,
					bl,
					0
				]
			}, "[-2]"],
			"s3expressAvailabilityZoneId"
		],
		[b, [{
			fn: il,
			[_]: [{
				fn: al,
				[_]: [
					Wl,
					0,
					4,
					tl
				]
			}, ol]
		}, "arn:"]],
		[b, [{
			fn: il,
			[_]: [{
				fn: al,
				[_]: [
					Wl,
					16,
					18,
					y
				]
			}, ol]
		}, bl]],
		[rl, [{
			fn: vl,
			[_]: [Kl, "isIp"]
		}, y]],
		[b, [{
			fn: il,
			[_]: [{
				fn: al,
				[_]: [
					Wl,
					21,
					23,
					y
				]
			}, ol]
		}, bl]],
		[b, [{
			fn: il,
			[_]: [{
				fn: al,
				[_]: [
					Wl,
					27,
					29,
					y
				]
			}, ol]
		}, bl]],
		[b, [{ [g]: ul }, "beta"]],
		[
			"uriEncode",
			du,
			"uri_encoded_bucket"
		],
		[ml, [ql, y]],
		[rl, [{
			fn: il,
			[_]: [{ [g]: "UseObjectLambdaEndpoint" }, tl]
		}, y]],
		[
			vl,
			[Jl, "resourceId[0]"],
			xl
		],
		[b, [Yl, ol]],
		[b, [Yl, Sl]],
		[
			vl,
			pu,
			Cl(1)
		],
		[b, [Xl, ol]],
		[b, [Zl, ol]],
		[b, [{
			fn: il,
			[_]: [{
				fn: al,
				[_]: [
					Wl,
					14,
					16,
					y
				]
			}, ol]
		}, bl]],
		[b, [Ql, "e"]],
		[b, [Ql, "o"]],
		[b, [ql, "aws-global"]],
		[b, [{
			fn: il,
			[_]: [{
				fn: al,
				[_]: [
					Wl,
					19,
					21,
					y
				]
			}, ol]
		}, bl]],
		[b, [$l, wl]],
		[rl, [{
			fn: il,
			[_]: [{ [g]: "DisableAccessPoints" }, tl]
		}, y]],
		[b, [$l, Tl]],
		[
			sl,
			[Zl],
			El
		],
		[ml, [Xl, y]],
		[b, [{
			fn: il,
			[_]: [{
				fn: al,
				[_]: [
					Wl,
					26,
					28,
					y
				]
			}, ol]
		}, bl]],
		[b, [{
			fn: il,
			[_]: [{
				fn: al,
				[_]: [
					Wl,
					15,
					17,
					y
				]
			}, ol]
		}, bl]],
		[vl, [Jl, "resourceId[4]"]],
		[b, [{
			fn: il,
			[_]: [{
				fn: al,
				[_]: [
					Wl,
					20,
					22,
					y
				]
			}, ol]
		}, bl]],
		[rl, [{ [g]: "UseGlobalEndpoint" }, y]],
		[b, [ql, Dl]],
		[
			vl,
			pu,
			dl(1)
		],
		[rl, [{
			fn: il,
			[_]: [{ [g]: "UseArnRegion" }, y]
		}, y]],
		[ml, [{ [g]: dl(1) }, tl]],
		[
			vl,
			[Jl, "resourceId[2]"],
			Ol
		],
		[b, [ql, Zl]],
		[b, [{
			fn: vl,
			[_]: [{ [g]: El }, kl]
		}, Gl]],
		[rl, [{ [g]: "DisableMultiRegionAccessPoints" }, y]],
		[ml, [Zl, y]],
		[b, [{
			fn: vl,
			[_]: [Jl, "partition"]
		}, Gl]],
		[b, [eu, ol]],
		[b, [$l, Al]],
		[ml, [eu, tl]],
		[
			vl,
			[Jl, "resourceId[3]"],
			Cl(2)
		],
		[ml, [Xl, tl]],
		[b, [{ [g]: Ol }, Sl]],
		[ml, [{ [g]: Cl(2) }, tl]]
	],
	results: [
		[v],
		[v, "Accelerate cannot be used with FIPS"],
		[v, "Cannot set dual-stack in combination with a custom endpoint."],
		[v, "A custom endpoint cannot be combined with FIPS"],
		[v, "A custom endpoint cannot be combined with S3 Accelerate"],
		[v, "Partition does not support FIPS"],
		[v, "S3Express does not support S3 Accelerate."],
		["{url#scheme}://{url#authority}/{uri_encoded_bucket}{url#path}", tu],
		[jl, tu],
		[v, "S3Express bucket name is not a valid virtual hostable name."],
		["https://s3express-control{_s3e_fips}{_s3e_ds}.{Region}.{partitionResult#dnsSuffix}/{uri_encoded_bucket}", nu],
		["https://{Bucket}.s3express{_s3e_fips}-{s3expressAvailabilityZoneId}{_s3e_ds}.{Region}.{partitionResult#dnsSuffix}", tu],
		[v, "Unrecognized S3Express bucket name format."],
		[Ml, tu],
		["https://s3express-control{_s3e_fips}{_s3e_ds}.{Region}.{partitionResult#dnsSuffix}", nu],
		[v, "Expected a endpoint to be specified but no endpoint was found"],
		["https://{Bucket}.ec2.{url#authority}", ru],
		["https://{Bucket}.ec2.s3-outposts.{Region}.{partitionResult#dnsSuffix}", ru],
		["https://{Bucket}.op-{outpostId_ssa_2}.{url#authority}", ru],
		["https://{Bucket}.op-{outpostId_ssa_2}.s3-outposts.{Region}.{partitionResult#dnsSuffix}", ru],
		[v, "Unrecognized hardware type: \"Expected hardware type o or e but got {hardwareType}\""],
		[v, "Invalid Outposts Bucket alias - it must be a valid bucket name."],
		[v, "Invalid ARN: The outpost Id must only contain a-z, A-Z, 0-9 and `-`."],
		[v, "Custom endpoint `{Endpoint}` was not a valid URI"],
		[v, "S3 Accelerate cannot be used in this region"],
		["https://{Bucket}.s3-fips.dualstack.us-east-1.{partitionResult#dnsSuffix}", iu],
		["https://{Bucket}.s3-fips.dualstack.{Region}.{partitionResult#dnsSuffix}", x],
		["https://{Bucket}.s3-fips.us-east-1.{partitionResult#dnsSuffix}", iu],
		["https://{Bucket}.s3-fips.{Region}.{partitionResult#dnsSuffix}", x],
		["https://{Bucket}.s3-accelerate.dualstack.us-east-1.{partitionResult#dnsSuffix}", iu],
		["https://{Bucket}.s3-accelerate.dualstack.{partitionResult#dnsSuffix}", x],
		["https://{Bucket}.s3.dualstack.us-east-1.{partitionResult#dnsSuffix}", iu],
		["https://{Bucket}.s3.dualstack.{Region}.{partitionResult#dnsSuffix}", x],
		[Nl, iu],
		[jl, iu],
		[Nl, x],
		[jl, x],
		[Pl, iu],
		[Pl, x],
		[Fl, iu],
		[Fl, x],
		["https://{Bucket}.s3.{Region}.{partitionResult#dnsSuffix}", x],
		[v, "Invalid region: region was not a valid DNS name."],
		[v, "S3 Object Lambda does not support Dual-stack"],
		[v, "S3 Object Lambda does not support S3 Accelerate"],
		[v, "Access points are not supported for this operation"],
		[v, "Invalid configuration: region from ARN `{bucketArn#region}` does not match client region `{Region}` and UseArnRegion is `false`"],
		[v, "Invalid ARN: Missing account id"],
		[Il(1), au],
		["https://{accessPointName_ssa_1}-{bucketArn#accountId}.s3-object-lambda-fips.{bucketArn#region}.{bucketPartition#dnsSuffix}", au],
		["https://{accessPointName_ssa_1}-{bucketArn#accountId}.s3-object-lambda.{bucketArn#region}.{bucketPartition#dnsSuffix}", au],
		[v, Ll(1)],
		[v, "Invalid ARN: The account id may only contain a-z, A-Z, 0-9 and `-`. Found: `{bucketArn#accountId}`"],
		[v, "Invalid region in ARN: `{bucketArn#region}` (invalid DNS name)"],
		[v, "Client was configured for partition `{partitionResult#name}` but ARN (`{Bucket}`) has `{bucketPartition#name}`"],
		[v, "Invalid ARN: The ARN may only contain a single resource component after `accesspoint`."],
		[v, "Invalid ARN: bucket ARN is missing a region"],
		[v, "Invalid ARN: Expected a resource of the format `accesspoint:<accesspoint name>` but no name was provided"],
		[v, "Invalid ARN: Object Lambda ARNs only support `accesspoint` arn types, but found: `{arnType}`"],
		[v, "Access Points do not support S3 Accelerate"],
		["https://{accessPointName_ssa_1}-{bucketArn#accountId}.s3-accesspoint-fips.dualstack.{bucketArn#region}.{bucketPartition#dnsSuffix}", ou],
		["https://{accessPointName_ssa_1}-{bucketArn#accountId}.s3-accesspoint-fips.{bucketArn#region}.{bucketPartition#dnsSuffix}", ou],
		["https://{accessPointName_ssa_1}-{bucketArn#accountId}.s3-accesspoint.dualstack.{bucketArn#region}.{bucketPartition#dnsSuffix}", ou],
		[Il(1), ou],
		["https://{accessPointName_ssa_1}-{bucketArn#accountId}.s3-accesspoint.{bucketArn#region}.{bucketPartition#dnsSuffix}", ou],
		[v, "Invalid ARN: The ARN was not for the S3 service, found: {bucketArn#service}"],
		[v, "S3 MRAP does not support dual-stack"],
		[v, "S3 MRAP does not support FIPS"],
		[v, "S3 MRAP does not support S3 Accelerate"],
		[v, "Invalid configuration: Multi-Region Access Point ARNs are disabled."],
		["https://{accessPointName_ssa_1}.accesspoint.s3-global.{partitionResult#dnsSuffix}", { [Xc]: [{
			[Zc]: y,
			name: Rl,
			[Qc]: Al,
			[el]: mu
		}] }],
		[v, "Client was configured for partition `{partitionResult#name}` but bucket referred to partition `{bucketArn#partition}`"],
		[v, "Invalid Access Point Name"],
		[v, "S3 Outposts does not support Dual-stack"],
		[v, "S3 Outposts does not support FIPS"],
		[v, "S3 Outposts does not support S3 Accelerate"],
		[v, "Invalid Arn: Outpost Access Point ARN contains sub resources"],
		["https://{accessPointName_ssa_2}-{bucketArn#accountId}.{outpostId_ssa_1}.{url#authority}", su],
		["https://{accessPointName_ssa_2}-{bucketArn#accountId}.{outpostId_ssa_1}.s3-outposts.{bucketArn#region}.{bucketPartition#dnsSuffix}", su],
		[v, Ll(2)],
		[v, "Expected an outpost type `accesspoint`, found {outpostType}"],
		[v, "Invalid ARN: expected an access point name"],
		[v, "Invalid ARN: Expected a 4-component resource"],
		[v, "Invalid ARN: The outpost Id may only contain a-z, A-Z, 0-9 and `-`. Found: `{outpostId_ssa_1}`"],
		[v, "Invalid ARN: The Outpost Id was not set"],
		[v, "Invalid ARN: Unrecognized format: {Bucket} (type: {arnType})"],
		[v, "Invalid ARN: No ARN type specified"],
		[v, "Invalid ARN: `{Bucket}` was not a valid ARN"],
		[v, "Path-style addressing cannot be used with ARN buckets"],
		["https://s3-fips.dualstack.us-east-1.{partitionResult#dnsSuffix}/{uri_encoded_bucket}", iu],
		["https://s3-fips.dualstack.{Region}.{partitionResult#dnsSuffix}/{uri_encoded_bucket}", x],
		["https://s3-fips.us-east-1.{partitionResult#dnsSuffix}/{uri_encoded_bucket}", iu],
		["https://s3-fips.{Region}.{partitionResult#dnsSuffix}/{uri_encoded_bucket}", x],
		["https://s3.dualstack.us-east-1.{partitionResult#dnsSuffix}/{uri_encoded_bucket}", iu],
		["https://s3.dualstack.{Region}.{partitionResult#dnsSuffix}/{uri_encoded_bucket}", x],
		[zl, iu],
		[zl, x],
		[Bl, iu],
		[Bl, x],
		["https://s3.{Region}.{partitionResult#dnsSuffix}/{uri_encoded_bucket}", x],
		[v, "Path-style addressing cannot be used with S3 Accelerate"],
		[Ml, cu],
		["https://s3-object-lambda-fips.{Region}.{partitionResult#dnsSuffix}", cu],
		["https://s3-object-lambda.{Region}.{partitionResult#dnsSuffix}", cu],
		["https://s3-fips.dualstack.us-east-1.{partitionResult#dnsSuffix}", iu],
		["https://s3-fips.dualstack.{Region}.{partitionResult#dnsSuffix}", x],
		["https://s3-fips.us-east-1.{partitionResult#dnsSuffix}", iu],
		["https://s3-fips.{Region}.{partitionResult#dnsSuffix}", x],
		["https://s3.dualstack.us-east-1.{partitionResult#dnsSuffix}", iu],
		["https://s3.dualstack.{Region}.{partitionResult#dnsSuffix}", x],
		[Ml, iu],
		[Ml, x],
		[Vl, iu],
		[Vl, x],
		["https://s3.{Region}.{partitionResult#dnsSuffix}", x],
		[v, "A region must be set when sending requests to S3."]
	]
}, gu = 2, _u = new Int32Array([
	-1,
	1,
	-1,
	0,
	3,
	100000115,
	1,
	424,
	4,
	2,
	272,
	5,
	3,
	233,
	6,
	4,
	85,
	7,
	5,
	15,
	8,
	8,
	9,
	100000115,
	16,
	10,
	13,
	18,
	11,
	13,
	19,
	12,
	13,
	22,
	100000014,
	13,
	35,
	14,
	100000042,
	36,
	100000103,
	435,
	6,
	271,
	16,
	7,
	270,
	17,
	8,
	19,
	18,
	14,
	501,
	106,
	9,
	20,
	24,
	10,
	21,
	24,
	11,
	22,
	24,
	12,
	23,
	24,
	13,
	547,
	24,
	14,
	77,
	25,
	20,
	73,
	26,
	26,
	27,
	78,
	37,
	28,
	100000086,
	38,
	100000086,
	29,
	39,
	47,
	30,
	48,
	100000058,
	31,
	50,
	32,
	100000085,
	51,
	33,
	136,
	55,
	100000076,
	34,
	59,
	35,
	100000084,
	60,
	39,
	36,
	61,
	37,
	100000083,
	62,
	38,
	146,
	63,
	41,
	100000046,
	61,
	40,
	100000083,
	62,
	41,
	150,
	64,
	42,
	100000054,
	66,
	43,
	100000053,
	70,
	44,
	100000052,
	71,
	45,
	100000081,
	73,
	46,
	100000080,
	74,
	100000078,
	100000079,
	40,
	48,
	100000057,
	41,
	100000057,
	49,
	42,
	185,
	50,
	48,
	62,
	51,
	49,
	100000045,
	52,
	51,
	53,
	526,
	60,
	56,
	54,
	62,
	100000055,
	55,
	63,
	57,
	100000046,
	62,
	100000055,
	57,
	64,
	58,
	100000054,
	66,
	59,
	100000053,
	69,
	60,
	100000065,
	70,
	61,
	100000052,
	72,
	100000064,
	100000051,
	49,
	100000045,
	63,
	51,
	64,
	526,
	60,
	67,
	65,
	62,
	100000055,
	66,
	63,
	68,
	100000046,
	62,
	100000055,
	68,
	64,
	69,
	100000054,
	66,
	70,
	100000053,
	68,
	100000047,
	71,
	70,
	72,
	100000052,
	72,
	100000050,
	100000051,
	25,
	74,
	100000042,
	46,
	100000039,
	75,
	57,
	76,
	100000041,
	58,
	100000040,
	100000041,
	26,
	100000088,
	78,
	28,
	100000087,
	79,
	34,
	82,
	80,
	35,
	81,
	545,
	36,
	100000103,
	100000115,
	46,
	100000097,
	83,
	57,
	84,
	100000099,
	58,
	100000098,
	100000099,
	5,
	101,
	86,
	8,
	87,
	100000115,
	16,
	88,
	89,
	18,
	91,
	89,
	19,
	90,
	92,
	21,
	97,
	95,
	19,
	93,
	92,
	21,
	98,
	95,
	21,
	97,
	94,
	22,
	100000014,
	95,
	35,
	96,
	100000042,
	36,
	100000103,
	100000042,
	22,
	100000013,
	98,
	35,
	99,
	100000042,
	36,
	100000101,
	100,
	46,
	100000110,
	100000111,
	6,
	214,
	102,
	7,
	208,
	103,
	8,
	119,
	104,
	14,
	118,
	105,
	21,
	106,
	100000023,
	26,
	107,
	502,
	37,
	108,
	100000086,
	38,
	100000086,
	109,
	39,
	112,
	110,
	48,
	100000058,
	111,
	50,
	136,
	100000085,
	40,
	113,
	100000057,
	41,
	100000057,
	114,
	42,
	115,
	500,
	48,
	100000056,
	116,
	52,
	117,
	100000072,
	65,
	100000069,
	100000072,
	21,
	501,
	100000023,
	9,
	120,
	124,
	10,
	121,
	124,
	11,
	122,
	124,
	12,
	123,
	124,
	13,
	202,
	124,
	14,
	195,
	125,
	20,
	190,
	126,
	21,
	127,
	100000023,
	23,
	128,
	129,
	24,
	189,
	129,
	26,
	130,
	197,
	37,
	131,
	100000086,
	38,
	100000086,
	132,
	39,
	159,
	133,
	48,
	100000058,
	134,
	50,
	135,
	100000085,
	51,
	141,
	136,
	55,
	100000076,
	137,
	59,
	138,
	100000084,
	60,
	100000083,
	139,
	61,
	140,
	100000083,
	63,
	100000083,
	100000046,
	55,
	100000076,
	142,
	59,
	143,
	100000084,
	60,
	148,
	144,
	61,
	145,
	100000083,
	62,
	147,
	146,
	63,
	150,
	100000046,
	63,
	153,
	100000046,
	61,
	149,
	100000083,
	62,
	153,
	150,
	64,
	151,
	100000054,
	66,
	152,
	100000053,
	70,
	100000082,
	100000052,
	64,
	154,
	100000054,
	66,
	155,
	100000053,
	70,
	156,
	100000052,
	71,
	157,
	100000081,
	73,
	158,
	100000080,
	74,
	100000077,
	100000079,
	40,
	160,
	100000057,
	41,
	100000057,
	161,
	42,
	185,
	162,
	48,
	174,
	163,
	49,
	100000045,
	164,
	51,
	165,
	526,
	60,
	168,
	166,
	62,
	100000055,
	167,
	63,
	169,
	100000046,
	62,
	100000055,
	169,
	64,
	170,
	100000054,
	66,
	171,
	100000053,
	69,
	172,
	100000065,
	70,
	173,
	100000052,
	72,
	100000063,
	100000051,
	49,
	100000045,
	175,
	51,
	176,
	526,
	60,
	179,
	177,
	62,
	100000055,
	178,
	63,
	180,
	100000046,
	62,
	100000055,
	180,
	64,
	181,
	100000054,
	66,
	182,
	100000053,
	68,
	100000047,
	183,
	70,
	184,
	100000052,
	72,
	100000048,
	100000051,
	48,
	100000056,
	186,
	52,
	187,
	100000072,
	65,
	100000069,
	188,
	67,
	100000070,
	100000071,
	25,
	100000036,
	100000042,
	21,
	191,
	100000023,
	25,
	192,
	100000042,
	30,
	194,
	193,
	46,
	100000034,
	100000036,
	46,
	100000033,
	100000035,
	21,
	196,
	100000023,
	26,
	100000088,
	197,
	28,
	100000087,
	198,
	34,
	201,
	199,
	35,
	200,
	545,
	36,
	100000101,
	100000115,
	46,
	100000095,
	100000096,
	17,
	203,
	100000022,
	20,
	204,
	100000021,
	21,
	205,
	550,
	33,
	206,
	550,
	44,
	100000016,
	207,
	45,
	100000018,
	100000020,
	8,
	209,
	215,
	16,
	210,
	220,
	18,
	211,
	220,
	19,
	212,
	224,
	20,
	213,
	227,
	21,
	231,
	401,
	8,
	218,
	215,
	19,
	216,
	100000009,
	20,
	217,
	227,
	21,
	231,
	100000009,
	16,
	219,
	220,
	18,
	223,
	220,
	19,
	221,
	224,
	20,
	222,
	227,
	21,
	231,
	100000012,
	19,
	226,
	224,
	20,
	225,
	100000009,
	21,
	100000009,
	100000012,
	20,
	230,
	227,
	21,
	228,
	100000009,
	30,
	229,
	100000009,
	34,
	100000007,
	100000009,
	21,
	231,
	415,
	30,
	232,
	100000008,
	34,
	100000007,
	100000008,
	4,
	100000002,
	234,
	5,
	235,
	480,
	6,
	271,
	236,
	7,
	270,
	237,
	8,
	238,
	491,
	9,
	239,
	243,
	10,
	240,
	243,
	11,
	241,
	243,
	12,
	242,
	243,
	13,
	547,
	243,
	14,
	266,
	244,
	20,
	264,
	245,
	26,
	246,
	267,
	37,
	247,
	100000086,
	38,
	100000086,
	248,
	39,
	249,
	518,
	40,
	250,
	100000057,
	41,
	100000057,
	251,
	42,
	538,
	252,
	48,
	100000043,
	253,
	49,
	100000045,
	254,
	51,
	255,
	526,
	60,
	258,
	256,
	62,
	100000055,
	257,
	63,
	259,
	100000046,
	62,
	100000055,
	259,
	64,
	260,
	100000054,
	66,
	261,
	100000053,
	69,
	262,
	100000065,
	70,
	263,
	100000052,
	72,
	100000062,
	100000051,
	25,
	265,
	100000042,
	46,
	100000031,
	100000032,
	26,
	100000088,
	267,
	28,
	100000087,
	268,
	34,
	269,
	544,
	46,
	100000093,
	100000094,
	8,
	397,
	100000009,
	8,
	407,
	100000009,
	3,
	346,
	273,
	4,
	100000003,
	274,
	5,
	284,
	275,
	8,
	276,
	100000115,
	15,
	100000005,
	277,
	16,
	278,
	281,
	18,
	279,
	281,
	19,
	280,
	281,
	22,
	100000014,
	281,
	35,
	282,
	100000042,
	36,
	100000102,
	283,
	46,
	100000106,
	100000107,
	6,
	405,
	285,
	7,
	395,
	286,
	8,
	295,
	287,
	14,
	501,
	288,
	26,
	289,
	502,
	37,
	290,
	100000086,
	38,
	100000086,
	291,
	39,
	292,
	307,
	40,
	293,
	100000057,
	41,
	100000057,
	294,
	42,
	335,
	500,
	9,
	296,
	300,
	10,
	297,
	300,
	11,
	298,
	300,
	12,
	299,
	300,
	13,
	394,
	300,
	14,
	339,
	301,
	15,
	100000005,
	302,
	20,
	337,
	303,
	26,
	304,
	341,
	37,
	305,
	100000086,
	38,
	100000086,
	306,
	39,
	309,
	307,
	48,
	100000058,
	308,
	50,
	100000074,
	100000085,
	40,
	310,
	100000057,
	41,
	100000057,
	311,
	42,
	335,
	312,
	48,
	324,
	313,
	49,
	100000045,
	314,
	51,
	315,
	526,
	60,
	318,
	316,
	62,
	100000055,
	317,
	63,
	319,
	100000046,
	62,
	100000055,
	319,
	64,
	320,
	100000054,
	66,
	321,
	100000053,
	69,
	322,
	100000065,
	70,
	323,
	100000052,
	72,
	100000061,
	100000051,
	49,
	100000045,
	325,
	51,
	326,
	526,
	60,
	329,
	327,
	62,
	100000055,
	328,
	63,
	330,
	100000046,
	62,
	100000055,
	330,
	64,
	331,
	100000054,
	66,
	332,
	100000053,
	68,
	100000047,
	333,
	70,
	334,
	100000052,
	72,
	100000049,
	100000051,
	48,
	100000056,
	336,
	52,
	100000067,
	100000072,
	25,
	338,
	100000042,
	46,
	100000027,
	100000028,
	15,
	100000005,
	340,
	26,
	100000088,
	341,
	28,
	100000087,
	342,
	34,
	345,
	343,
	35,
	344,
	545,
	36,
	100000102,
	100000115,
	46,
	100000091,
	100000092,
	4,
	100000002,
	347,
	5,
	357,
	348,
	8,
	349,
	100000115,
	15,
	100000005,
	350,
	16,
	351,
	354,
	18,
	352,
	354,
	19,
	353,
	354,
	22,
	100000014,
	354,
	35,
	355,
	100000042,
	36,
	100000043,
	356,
	46,
	100000104,
	100000105,
	6,
	405,
	358,
	7,
	395,
	359,
	8,
	360,
	491,
	9,
	361,
	365,
	10,
	362,
	365,
	11,
	363,
	365,
	12,
	364,
	365,
	13,
	394,
	365,
	14,
	389,
	366,
	15,
	100000005,
	367,
	20,
	387,
	368,
	26,
	369,
	391,
	37,
	370,
	100000086,
	38,
	100000086,
	371,
	39,
	372,
	518,
	40,
	373,
	100000057,
	41,
	100000057,
	374,
	42,
	538,
	375,
	48,
	100000043,
	376,
	49,
	100000045,
	377,
	51,
	378,
	526,
	60,
	381,
	379,
	62,
	100000055,
	380,
	63,
	382,
	100000046,
	62,
	100000055,
	382,
	64,
	383,
	100000054,
	66,
	384,
	100000053,
	69,
	385,
	100000065,
	70,
	386,
	100000052,
	72,
	100000060,
	100000051,
	25,
	388,
	100000042,
	46,
	100000025,
	100000026,
	15,
	100000005,
	390,
	26,
	100000088,
	391,
	28,
	100000087,
	392,
	34,
	393,
	544,
	46,
	100000089,
	100000090,
	15,
	100000005,
	547,
	8,
	396,
	100000009,
	15,
	100000005,
	397,
	16,
	398,
	410,
	18,
	399,
	410,
	19,
	400,
	410,
	20,
	401,
	100000009,
	27,
	402,
	100000012,
	29,
	100000011,
	403,
	31,
	100000011,
	404,
	32,
	100000011,
	422,
	8,
	406,
	100000009,
	15,
	100000005,
	407,
	16,
	408,
	410,
	18,
	409,
	410,
	19,
	411,
	410,
	20,
	100000012,
	100000009,
	20,
	414,
	412,
	22,
	413,
	100000009,
	34,
	100000010,
	100000009,
	22,
	416,
	415,
	27,
	419,
	100000012,
	27,
	418,
	417,
	34,
	100000010,
	100000012,
	34,
	100000010,
	419,
	43,
	100000011,
	420,
	47,
	100000011,
	421,
	53,
	100000011,
	422,
	54,
	100000011,
	423,
	56,
	100000011,
	100000012,
	2,
	100000001,
	425,
	3,
	478,
	426,
	4,
	100000004,
	427,
	5,
	438,
	428,
	8,
	429,
	100000115,
	16,
	430,
	433,
	18,
	431,
	433,
	19,
	432,
	433,
	22,
	100000014,
	433,
	35,
	434,
	100000042,
	36,
	100000044,
	435,
	46,
	100000112,
	436,
	57,
	437,
	100000114,
	58,
	100000113,
	100000114,
	6,
	100000006,
	439,
	7,
	100000006,
	440,
	8,
	450,
	441,
	14,
	501,
	442,
	26,
	443,
	502,
	37,
	444,
	100000086,
	38,
	100000086,
	445,
	39,
	446,
	465,
	40,
	447,
	100000057,
	41,
	100000057,
	448,
	42,
	471,
	449,
	48,
	100000044,
	500,
	9,
	451,
	455,
	10,
	452,
	455,
	11,
	453,
	455,
	12,
	454,
	455,
	13,
	547,
	455,
	14,
	473,
	456,
	15,
	460,
	457,
	20,
	458,
	461,
	25,
	459,
	100000042,
	46,
	100000037,
	100000038,
	20,
	540,
	461,
	26,
	462,
	474,
	37,
	463,
	100000086,
	38,
	100000086,
	464,
	39,
	467,
	465,
	48,
	100000058,
	466,
	50,
	100000075,
	100000085,
	40,
	468,
	100000057,
	41,
	100000057,
	469,
	42,
	471,
	470,
	48,
	100000044,
	524,
	48,
	100000044,
	472,
	52,
	100000068,
	100000072,
	26,
	100000088,
	474,
	28,
	100000087,
	475,
	34,
	100000100,
	476,
	35,
	477,
	545,
	36,
	100000044,
	100000115,
	4,
	100000002,
	479,
	5,
	488,
	480,
	8,
	481,
	100000115,
	16,
	482,
	485,
	18,
	483,
	485,
	19,
	484,
	485,
	22,
	100000014,
	485,
	35,
	486,
	100000042,
	36,
	100000043,
	487,
	46,
	100000108,
	100000109,
	6,
	100000006,
	489,
	7,
	100000006,
	490,
	8,
	503,
	491,
	14,
	501,
	492,
	26,
	493,
	502,
	37,
	494,
	100000086,
	38,
	100000086,
	495,
	39,
	496,
	518,
	40,
	497,
	100000057,
	41,
	100000057,
	498,
	42,
	538,
	499,
	48,
	100000043,
	500,
	49,
	100000045,
	526,
	26,
	100000088,
	502,
	28,
	100000087,
	100000115,
	9,
	504,
	508,
	10,
	505,
	508,
	11,
	506,
	508,
	12,
	507,
	508,
	13,
	547,
	508,
	14,
	541,
	509,
	15,
	513,
	510,
	20,
	511,
	514,
	25,
	512,
	100000042,
	46,
	100000029,
	100000030,
	20,
	540,
	514,
	26,
	515,
	542,
	37,
	516,
	100000086,
	38,
	100000086,
	517,
	39,
	520,
	518,
	48,
	100000058,
	519,
	50,
	100000073,
	100000085,
	40,
	521,
	100000057,
	41,
	100000057,
	522,
	42,
	538,
	523,
	48,
	100000043,
	524,
	49,
	100000045,
	525,
	51,
	529,
	526,
	60,
	100000055,
	527,
	62,
	100000055,
	528,
	63,
	100000055,
	100000046,
	60,
	532,
	530,
	62,
	100000055,
	531,
	63,
	533,
	100000046,
	62,
	100000055,
	533,
	64,
	534,
	100000054,
	66,
	535,
	100000053,
	69,
	536,
	100000065,
	70,
	537,
	100000052,
	72,
	100000059,
	100000051,
	48,
	100000043,
	539,
	52,
	100000066,
	100000072,
	25,
	100000024,
	100000042,
	26,
	100000088,
	542,
	28,
	100000087,
	543,
	34,
	100000100,
	544,
	35,
	546,
	545,
	36,
	100000042,
	100000115,
	36,
	100000043,
	100000115,
	17,
	548,
	100000022,
	20,
	549,
	100000021,
	33,
	552,
	550,
	44,
	100000017,
	551,
	45,
	100000019,
	100000020,
	44,
	100000015,
	553,
	45,
	100000015,
	100000020
]), vu = jn.from(_u, gu, hu.conditions, hu.results), yu = new Mn({
	size: 50,
	params: [
		"Accelerate",
		"Bucket",
		"DisableAccessPoints",
		"DisableMultiRegionAccessPoints",
		"DisableS3ExpressSessionAuth",
		"Endpoint",
		"ForcePathStyle",
		"Region",
		"UseArnRegion",
		"UseDualStack",
		"UseFIPS",
		"UseGlobalEndpoint",
		"UseObjectLambdaEndpoint",
		"UseS3ExpressControlEndpoint"
	]
}), bu = (e, t = {}) => yu.get(e, () => cr(vu, {
	endpointParams: e,
	logger: t.logger
}));
In.aws = wa;
var xu = ((e) => async (t, n, r) => {
	if (!r) throw Error("Could not find `input` for `defaultEndpointRuleSetHttpAuthSchemeParametersProvider`");
	let i = await e(t, n, r), a = o(n)?.commandInstance?.constructor?.getEndpointParameterInstructions;
	if (!a) throw Error(`getEndpointParameterInstructions() is not defined on '${n.commandName}'`);
	let s = await d(r, { getEndpointParameterInstructions: a }, t);
	return Object.assign(i, s);
})(async (e, t, n) => ({
	operation: o(t).operation,
	region: await r(e.region)() || (() => {
		throw Error("expected `region` to be configured for `aws.auth#sigv4`");
	})()
}));
function Su(e) {
	return {
		schemeId: "aws.auth#sigv4",
		signingProperties: {
			name: "s3",
			region: e.region
		},
		propertiesExtractor: (e, t) => ({ signingProperties: {
			config: e,
			context: t
		} })
	};
}
function Cu(e) {
	return {
		schemeId: "aws.auth#sigv4a",
		signingProperties: {
			name: "s3",
			region: e.region
		},
		propertiesExtractor: (e, t) => ({ signingProperties: {
			config: e,
			context: t
		} })
	};
}
var wu = ((e, t, n) => (r) => {
	let i = e(r).properties?.authSchemes;
	if (!i) return t(r);
	let a = [];
	for (let e of i) {
		let { name: t, properties: o = {}, ...s } = e, c = t.toLowerCase();
		t !== c && console.warn(`HttpAuthScheme has been normalized with lowercasing: '${t}' to '${c}'`);
		let l;
		if (c === "sigv4a") {
			l = "aws.auth#sigv4a";
			let e = i.find((e) => {
				let t = e.name.toLowerCase();
				return t !== "sigv4a" && t.startsWith("sigv4");
			});
			if (f.sigv4aDependency() === "none" && e) continue;
		} else if (c.startsWith("sigv4")) l = "aws.auth#sigv4";
		else throw Error(`Unknown HttpAuthScheme found in '@smithy.rules#endpointRuleSet': '${c}'`);
		let u = n[l];
		if (!u) throw Error(`Could not find HttpAuthOption create function for '${l}'`);
		let d = u(r);
		d.schemeId = l, d.signingProperties = {
			...d.signingProperties || {},
			...s,
			...o
		}, a.push(d);
	}
	return a;
})(bu, (e) => {
	let t = [];
	return e.operation, t.push(Su(e)), t.push(Cu(e)), t;
}, {
	"aws.auth#sigv4": Su,
	"aws.auth#sigv4a": Cu
}), Tu = (e) => {
	let t = Wc(Jc(e));
	return Object.assign(t, { authSchemePreference: r(e.authSchemePreference ?? []) });
}, Eu = (e) => Object.assign(e, {
	useFipsEndpoint: e.useFipsEndpoint ?? !1,
	useDualstackEndpoint: e.useDualstackEndpoint ?? !1,
	forcePathStyle: e.forcePathStyle ?? !1,
	useAccelerateEndpoint: e.useAccelerateEndpoint ?? !1,
	useGlobalEndpoint: e.useGlobalEndpoint ?? !1,
	disableMultiregionAccessPoints: e.disableMultiregionAccessPoints ?? !1,
	defaultSigningName: "s3",
	clientContextParams: e.clientContextParams ?? {}
}), S = vt({
	ForcePathStyle: {
		type: "clientContextParams",
		name: "forcePathStyle"
	},
	UseArnRegion: {
		type: "clientContextParams",
		name: "useArnRegion"
	},
	DisableMultiRegionAccessPoints: {
		type: "clientContextParams",
		name: "disableMultiregionAccessPoints"
	},
	Accelerate: {
		type: "clientContextParams",
		name: "useAccelerateEndpoint"
	},
	DisableS3ExpressSessionAuth: {
		type: "clientContextParams",
		name: "disableS3ExpressSessionAuth"
	},
	UseGlobalEndpoint: {
		type: "builtInParams",
		name: "useGlobalEndpoint"
	},
	UseFIPS: {
		type: "builtInParams",
		name: "useFipsEndpoint"
	},
	Endpoint: {
		type: "builtInParams",
		name: "endpoint"
	},
	Region: {
		type: "builtInParams",
		name: "region"
	},
	UseDualStack: {
		type: "builtInParams",
		name: "useDualstackEndpoint"
	}
}, "AmazonS3", "S3Client", e), Du = {
	Bucket: {
		type: "contextParams",
		name: "Bucket"
	},
	Key: {
		type: "contextParams",
		name: "Key"
	}
}, Ou = {
	DisableS3ExpressSessionAuth: {
		type: "staticContextParams",
		value: !0
	},
	Bucket: {
		type: "contextParams",
		name: "Bucket"
	},
	Key: {
		type: "contextParams",
		name: "Key"
	},
	CopySource: {
		type: "contextParams",
		name: "CopySource"
	}
}, ku = {
	UseS3ExpressControlEndpoint: {
		type: "staticContextParams",
		value: !0
	},
	DisableAccessPoints: {
		type: "staticContextParams",
		value: !0
	},
	Bucket: {
		type: "contextParams",
		name: "Bucket"
	}
}, C = {
	UseS3ExpressControlEndpoint: {
		type: "staticContextParams",
		value: !0
	},
	Bucket: {
		type: "contextParams",
		name: "Bucket"
	}
}, Au = {
	DisableS3ExpressSessionAuth: {
		type: "staticContextParams",
		value: !0
	},
	Bucket: {
		type: "contextParams",
		name: "Bucket"
	}
}, ju = { Bucket: {
	type: "contextParams",
	name: "Bucket"
} }, Mu = {}, Nu = { UseS3ExpressControlEndpoint: {
	type: "staticContextParams",
	value: !0
} }, Pu = {
	Bucket: {
		type: "contextParams",
		name: "Bucket"
	},
	Prefix: {
		type: "contextParams",
		name: "Prefix"
	}
}, Fu = { UseObjectLambdaEndpoint: {
	type: "staticContextParams",
	value: !0
} }, w = (e, t, n, r) => [ys(n)], Iu = (e, t, n, r) => [ys(n), ec(n)], Lu = (e, t, n, r) => [ys(n), Zs(n)], Ru = (e, t, n, r) => [zo(n, {
	requestAlgorithmMember: {
		httpHeader: "x-amz-sdk-checksum-algorithm",
		name: "ChecksumAlgorithm"
	},
	requestChecksumRequired: !0
})], T = (e, t, n, r) => [], zu = (e, t, n, r) => [zo(n, {
	requestAlgorithmMember: {
		httpHeader: "x-amz-sdk-checksum-algorithm",
		name: "ChecksumAlgorithm"
	},
	requestChecksumRequired: !0
}), ys(n)], Bu = (e, t, n, r) => [zo(n, {
	requestChecksumRequired: !1,
	requestValidationModeMember: "ChecksumMode",
	responseAlgorithms: [
		"CRC64NVME",
		"CRC32",
		"CRC32C",
		"SHA256",
		"SHA1",
		"SHA512",
		"MD5",
		"XXHASH64",
		"XXHASH3",
		"XXHASH128"
	]
})], Vu = (e, t, n, r) => [
	zo(n, {
		requestChecksumRequired: !1,
		requestValidationModeMember: "ChecksumMode",
		responseAlgorithms: [
			"CRC64NVME",
			"CRC32",
			"CRC32C",
			"SHA256",
			"SHA1",
			"SHA512",
			"MD5",
			"XXHASH64",
			"XXHASH3",
			"XXHASH128"
		]
	}),
	ec(n),
	rs(n)
], Hu = (e, t, n, r) => [
	ys(n),
	ec(n),
	rs(n)
], Uu = (e, t, n, r) => [zo(n, {
	requestAlgorithmMember: {
		httpHeader: "x-amz-sdk-checksum-algorithm",
		name: "ChecksumAlgorithm"
	},
	requestChecksumRequired: !1
})], Wu = (e, t, n, r) => [zo(n, {
	requestAlgorithmMember: {
		httpHeader: "x-amz-sdk-checksum-algorithm",
		name: "ChecksumAlgorithm"
	},
	requestChecksumRequired: !1
}), ys(n)], Gu = (e, t, n, r) => [
	zo(n, {
		requestAlgorithmMember: {
			httpHeader: "x-amz-sdk-checksum-algorithm",
			name: "ChecksumAlgorithm"
		},
		requestChecksumRequired: !1
	}),
	Go(n),
	ys(n),
	ec(n)
], Ku = (e, t, n, r) => [ec(n)], qu = (e, t, n, r) => [
	zo(n, {
		requestAlgorithmMember: {
			httpHeader: "x-amz-sdk-checksum-algorithm",
			name: "ChecksumAlgorithm"
		},
		requestChecksumRequired: !1
	}),
	ys(n),
	ec(n)
], E = class e extends ot {
	constructor(t) {
		super(t), Object.setPrototypeOf(this, e.prototype);
	}
}, Ju = class e extends E {
	name = "NoSuchUpload";
	$fault = "client";
	constructor(t) {
		super({
			name: "NoSuchUpload",
			$fault: "client",
			...t
		}), Object.setPrototypeOf(this, e.prototype);
	}
}, Yu = class e extends E {
	name = "AccessDenied";
	$fault = "client";
	constructor(t) {
		super({
			name: "AccessDenied",
			$fault: "client",
			...t
		}), Object.setPrototypeOf(this, e.prototype);
	}
}, Xu = class e extends E {
	name = "ObjectNotInActiveTierError";
	$fault = "client";
	constructor(t) {
		super({
			name: "ObjectNotInActiveTierError",
			$fault: "client",
			...t
		}), Object.setPrototypeOf(this, e.prototype);
	}
}, Zu = class e extends E {
	name = "BucketAlreadyExists";
	$fault = "client";
	constructor(t) {
		super({
			name: "BucketAlreadyExists",
			$fault: "client",
			...t
		}), Object.setPrototypeOf(this, e.prototype);
	}
}, Qu = class e extends E {
	name = "BucketAlreadyOwnedByYou";
	$fault = "client";
	constructor(t) {
		super({
			name: "BucketAlreadyOwnedByYou",
			$fault: "client",
			...t
		}), Object.setPrototypeOf(this, e.prototype);
	}
}, $u = class e extends E {
	name = "NoSuchBucket";
	$fault = "client";
	constructor(t) {
		super({
			name: "NoSuchBucket",
			$fault: "client",
			...t
		}), Object.setPrototypeOf(this, e.prototype);
	}
}, ed = class e extends E {
	name = "NoSuchKey";
	$fault = "client";
	constructor(t) {
		super({
			name: "NoSuchKey",
			$fault: "client",
			...t
		}), Object.setPrototypeOf(this, e.prototype);
	}
}, td = class e extends E {
	name = "InvalidObjectState";
	$fault = "client";
	StorageClass;
	AccessTier;
	constructor(t) {
		super({
			name: "InvalidObjectState",
			$fault: "client",
			...t
		}), Object.setPrototypeOf(this, e.prototype), this.StorageClass = t.StorageClass, this.AccessTier = t.AccessTier;
	}
}, nd = class e extends E {
	name = "NoSuchAnnotation";
	$fault = "client";
	constructor(t) {
		super({
			name: "NoSuchAnnotation",
			$fault: "client",
			...t
		}), Object.setPrototypeOf(this, e.prototype);
	}
}, rd = class e extends E {
	name = "NotFound";
	$fault = "client";
	constructor(t) {
		super({
			name: "NotFound",
			$fault: "client",
			...t
		}), Object.setPrototypeOf(this, e.prototype);
	}
}, id = class e extends E {
	name = "InvalidPrefix";
	$fault = "client";
	constructor(t) {
		super({
			name: "InvalidPrefix",
			$fault: "client",
			...t
		}), Object.setPrototypeOf(this, e.prototype);
	}
}, ad = class e extends E {
	name = "EncryptionTypeMismatch";
	$fault = "client";
	constructor(t) {
		super({
			name: "EncryptionTypeMismatch",
			$fault: "client",
			...t
		}), Object.setPrototypeOf(this, e.prototype);
	}
}, od = class e extends E {
	name = "InvalidRequest";
	$fault = "client";
	constructor(t) {
		super({
			name: "InvalidRequest",
			$fault: "client",
			...t
		}), Object.setPrototypeOf(this, e.prototype);
	}
}, sd = class e extends E {
	name = "InvalidWriteOffset";
	$fault = "client";
	constructor(t) {
		super({
			name: "InvalidWriteOffset",
			$fault: "client",
			...t
		}), Object.setPrototypeOf(this, e.prototype);
	}
}, cd = class e extends E {
	name = "TooManyParts";
	$fault = "client";
	constructor(t) {
		super({
			name: "TooManyParts",
			$fault: "client",
			...t
		}), Object.setPrototypeOf(this, e.prototype);
	}
}, ld = class e extends E {
	name = "AnnotationLimitExceeded";
	$fault = "client";
	constructor(t) {
		super({
			name: "AnnotationLimitExceeded",
			$fault: "client",
			...t
		}), Object.setPrototypeOf(this, e.prototype);
	}
}, ud = class e extends E {
	name = "AnnotationNameTooLong";
	$fault = "client";
	constructor(t) {
		super({
			name: "AnnotationNameTooLong",
			$fault: "client",
			...t
		}), Object.setPrototypeOf(this, e.prototype);
	}
}, dd = class e extends E {
	name = "InvalidAnnotationName";
	$fault = "client";
	constructor(t) {
		super({
			name: "InvalidAnnotationName",
			$fault: "client",
			...t
		}), Object.setPrototypeOf(this, e.prototype);
	}
}, fd = class e extends E {
	name = "UnsupportedMediaType";
	$fault = "client";
	constructor(t) {
		super({
			name: "UnsupportedMediaType",
			$fault: "client",
			...t
		}), Object.setPrototypeOf(this, e.prototype);
	}
}, pd = class e extends E {
	name = "IdempotencyParameterMismatch";
	$fault = "client";
	constructor(t) {
		super({
			name: "IdempotencyParameterMismatch",
			$fault: "client",
			...t
		}), Object.setPrototypeOf(this, e.prototype);
	}
}, md = class e extends E {
	name = "ObjectAlreadyInActiveTierError";
	$fault = "client";
	constructor(t) {
		super({
			name: "ObjectAlreadyInActiveTierError",
			$fault: "client",
			...t
		}), Object.setPrototypeOf(this, e.prototype);
	}
}, hd = "Account", gd = "AnalyticsAndOperator", _d = "AccelerateConfiguration", vd = "AccessControlList", yd = "ACL", bd = "AnalyticsConfigurationList", xd = "AccessControlPolicy", Sd = "AccessControlTranslation", Cd = "AnalyticsConfiguration", wd = "AnnotationCount", Td = "AccessDenied", Ed = "AbortDate", Dd = "AnnotationDirective", Od = "AnnotationEntry", kd = "AnalyticsExportDestination", Ad = "AnalyticsFilter", jd = "AllowedHeaders", Md = "AllowedHeader", Nd = "AccountId", Pd = "AbortIncompleteMultipartUpload", Fd = "AccessKeyId", Id = "AnnotationList", Ld = "AnnotationLimitExceeded", Rd = "AllowedMethods", zd = "AbortMultipartUpload", Bd = "AbortMultipartUploadOutput", Vd = "AbortMultipartUploadRequest", Hd = "AllowedMethod", Ud = "AnnotationName", Wd = "AnnotationNameTooLong", Gd = "AllowedOrigins", Kd = "AllowedOrigin", qd = "AnnotationPayload", Jd = "AccessPointAlias", Yd = "AccessPointArn", Xd = "AnnotationPrefix", Zd = "AllowQuotedRecordDelimiter", Qd = "AcceptRanges", $d = "AbortRuleId", ef = "AbacStatus", tf = "AnalyticsS3BucketDestination", nf = "ApplyServerSideEncryptionByDefault", rf = "ArchiveStatus", af = "AccessTier", of = "AnnotationTableConfiguration", sf = "AnnotationTableConfigurationResult", cf = "AnnotationTableConfigurationUpdates", lf = "And", uf = "Annotations", D = "Bucket", df = "BucketArn", ff = "BucketAlreadyExists", pf = "BucketAccountId", mf = "BucketAlreadyOwnedByYou", hf = "BlockedEncryptionTypes", gf = "BypassGovernanceRetention", _f = "BucketInfo", vf = "BucketKeyEnabled", yf = "BucketLifecycleConfiguration", bf = "BucketLocationName", xf = "BucketLoggingStatus", Sf = "BucketLocationType", Cf = "BucketNamespace", wf = "BucketName", Tf = "BytesProcessed", Ef = "BlockPublicAcls", Df = "BlockPublicPolicy", Of = "BucketRegion", kf = "BytesReturned", Af = "BytesScanned", jf = "Body", Mf = "Buckets", Nf = "Checksum", O = "ChecksumAlgorithm", Pf = "CannedACL", Ff = "CreateBucket", If = "CreateBucketConfiguration", Lf = "CreateBucketMetadataConfiguration", Rf = "CreateBucketMetadataConfigurationRequest", zf = "CreateBucketMetadataTableConfiguration", Bf = "CreateBucketMetadataTableConfigurationRequest", Vf = "CreateBucketOutput", Hf = "CreateBucketRequest", Uf = "CacheControl", Wf = "ChecksumCRC32", Gf = "ChecksumCRC32C", Kf = "ChecksumCRC64NVME", qf = "Cache-Control", Jf = "CreationDate", Yf = "Content-Disposition", Xf = "ContentDisposition", Zf = "ContinuationEvent", Qf = "Content-Encoding", $f = "ContentEncoding", ep = "CloudFunction", tp = "CloudFunctionConfiguration", np = "ContentLanguage", rp = "Content-Language", ip = "Content-Length", ap = "ContentLength", k = "Content-MD5", op = "ChecksumMD5", A = "ContentMD5", sp = "CompletedMultipartUpload", cp = "CompleteMultipartUploadOutput", lp = "CreateMultipartUploadOutput", up = "CompleteMultipartUploadResult", dp = "CompleteMultipartUploadRequest", fp = "CreateMultipartUploadRequest", pp = "CompleteMultipartUpload", mp = "CreateMultipartUpload", hp = "ChecksumMode", gp = "CopyObject", _p = "CopyObjectOutput", vp = "CopyObjectResult", yp = "CORSConfiguration", bp = "CORSRules", xp = "CORSRule", Sp = "CopyObjectRequest", Cp = "CommonPrefix", wp = "CommonPrefixList", Tp = "CompletedPartList", Ep = "CopyPartResult", Dp = "CompletedPart", Op = "CommonPrefixes", kp = "ContentRange", Ap = "ConfirmRemoveSelfBucketAccess", jp = "Content-Range", Mp = "ConfigurationState", Np = "ChecksumSHA1", Pp = "ChecksumSHA256", Fp = "ChecksumSHA512", Ip = "CopySourceIfMatch", Lp = "CopySourceIfModifiedSince", Rp = "CopySourceIfNoneMatch", zp = "CopySourceIfUnmodifiedSince", Bp = "CreateSessionOutput", Vp = "CreateSessionResult", Hp = "CopySourceRange", Up = "CreateSessionRequest", Wp = "CopySourceSSECustomerAlgorithm", Gp = "CopySourceSSECustomerKey", Kp = "CopySourceSSECustomerKeyMD5", qp = "CSV", Jp = "CopySourceVersionId", Yp = "CSVInput", Xp = "CSVOutput", Zp = "CopySource", Qp = "CreateSession", $p = "ChecksumType", em = "Content-Type", tm = "ClientToken", nm = "ContentType", rm = "CompressionType", im = "ContinuationToken", am = "ChecksumXXHASH64", om = "ChecksumXXHASH3", sm = "ChecksumXXHASH128", cm = "Condition", lm = "Code", um = "Comments", dm = "Contents", fm = "Cont", pm = "Credentials", mm = "Days", hm = "DaysAfterInitiation", gm = "DeleteBucket", _m = "DeleteBucketAnalyticsConfiguration", vm = "DeleteBucketAnalyticsConfigurationRequest", ym = "DeleteBucketCors", bm = "DeleteBucketCorsRequest", xm = "DeleteBucketEncryption", Sm = "DeleteBucketEncryptionRequest", Cm = "DeleteBucketInventoryConfiguration", wm = "DeleteBucketInventoryConfigurationRequest", Tm = "DeleteBucketIntelligentTieringConfiguration", Em = "DeleteBucketIntelligentTieringConfigurationRequest", Dm = "DeleteBucketLifecycle", Om = "DeleteBucketLifecycleRequest", km = "DeleteBucketMetadataConfiguration", Am = "DeleteBucketMetadataConfigurationRequest", jm = "DeleteBucketMetricsConfigurationRequest", Mm = "DeleteBucketMetricsConfiguration", Nm = "DeleteBucketMetadataTableConfiguration", Pm = "DeleteBucketMetadataTableConfigurationRequest", Fm = "DeleteBucketOwnershipControls", Im = "DeleteBucketOwnershipControlsRequest", Lm = "DeleteBucketPolicy", Rm = "DeleteBucketPolicyRequest", zm = "DeleteBucketRequest", Bm = "DeleteBucketReplicationRequest", Vm = "DeleteBucketReplication", Hm = "DeleteBucketTagging", Um = "DeleteBucketTaggingRequest", Wm = "DeleteBucketWebsite", Gm = "DeleteBucketWebsiteRequest", Km = "DataExport", qm = "DefaultEventHold", Jm = "DestinationIfMatch", Ym = "DestinationIfModifiedSince", Xm = "DestinationIfNoneMatch", Zm = "DestinationIfUnmodifiedSince", Qm = "DeleteMarker", $m = "DeleteMarkerEntry", eh = "DeleteMarkerReplication", th = "DeleteMarkerVersionId", nh = "DeleteMarkers", rh = "DisplayName", ih = "DeletedObject", ah = "DeleteObjectAnnotation", oh = "DeleteObjectAnnotationOutput", sh = "DeleteObjectAnnotationRequest", ch = "DeleteObjectOutput", lh = "DeleteObjectsOutput", uh = "DeleteObjectRequest", dh = "DeleteObjectsRequest", fh = "DeleteObjectTagging", ph = "DeleteObjectTaggingOutput", mh = "DeleteObjectTaggingRequest", hh = "DeletedObjects", gh = "DeleteObject", _h = "DeleteObjects", vh = "DeletePublicAccessBlock", yh = "DeletePublicAccessBlockRequest", bh = "DataRedundancy", xh = "DefaultRetention", Sh = "DeleteResult", Ch = "DestinationResult", wh = "Date", Th = "Delete", Eh = "Deleted", Dh = "Delimiter", Oh = "Destination", kh = "Description", Ah = "Details", jh = "Error", Mh = "EmailAddress", Nh = "EventBridgeConfiguration", j = "ExpectedBucketOwner", Ph = "EncryptionConfiguration", Fh = "ErrorCode", Ih = "ErrorDetails", Lh = "ErrorDocument", Rh = "EndEvent", zh = "ExposeHeaders", Bh = "EventHoldDuration", Vh = "EventHold", Hh = "ExposeHeader", Uh = "ErrorMessage", Wh = "ExpiredObjectDeleteMarker", Gh = "ExistingObjectReplication", Kh = "ExpiresString", qh = "ExpectedSourceBucketOwner", M = "ETag", Jh = "EncryptionTypeList", Yh = "EncryptionTypeMismatch", Xh = "EncryptionType", Zh = "EncodingType", Qh = "EventThreshold", $h = "ExpressionType", eg = "Encryption", tg = "Enabled", ng = "End", rg = "Errors", ig = "Events", ag = "Event", og = "Expiration", sg = "Expires", cg = "Expression", lg = "Filter", ug = "FieldDelimiter", dg = "FileHeaderInfo", fg = "FetchOwner", pg = "FilterRule", mg = "FilterRuleList", hg = "FilterRules", gg = "Field", _g = "Format", vg = "Frequency", yg = "Grants", bg = "GetBucketAbac", xg = "GetBucketAccelerateConfiguration", Sg = "GetBucketAccelerateConfigurationOutput", Cg = "GetBucketAnalyticsConfigurationOutput", wg = "GetBucketAccelerateConfigurationRequest", Tg = "GetBucketAnalyticsConfigurationRequest", Eg = "GetBucketAnalyticsConfiguration", Dg = "GetBucketAbacOutput", Og = "GetBucketAclOutput", kg = "GetBucketAbacRequest", Ag = "GetBucketAclRequest", jg = "GetBucketAcl", Mg = "GetBucketCors", Ng = "GetBucketCorsOutput", Pg = "GetBucketCorsRequest", Fg = "GetBucketEncryption", Ig = "GetBucketEncryptionOutput", Lg = "GetBucketEncryptionRequest", Rg = "GetBucketInventoryConfiguration", zg = "GetBucketInventoryConfigurationOutput", Bg = "GetBucketInventoryConfigurationRequest", Vg = "GetBucketIntelligentTieringConfiguration", Hg = "GetBucketIntelligentTieringConfigurationOutput", Ug = "GetBucketIntelligentTieringConfigurationRequest", Wg = "GetBucketLocation", Gg = "GetBucketLifecycleConfiguration", Kg = "GetBucketLifecycleConfigurationOutput", qg = "GetBucketLifecycleConfigurationRequest", Jg = "GetBucketLocationOutput", Yg = "GetBucketLoggingOutput", Xg = "GetBucketLocationRequest", Zg = "GetBucketLoggingRequest", Qg = "GetBucketLogging", $g = "GetBucketMetadataConfiguration", e_ = "GetBucketMetadataConfigurationOutput", t_ = "GetBucketMetricsConfigurationOutput", n_ = "GetBucketMetadataConfigurationResult", r_ = "GetBucketMetadataConfigurationRequest", i_ = "GetBucketMetricsConfigurationRequest", a_ = "GetBucketMetricsConfiguration", o_ = "GetBucketMetadataTableConfiguration", s_ = "GetBucketMetadataTableConfigurationOutput", c_ = "GetBucketMetadataTableConfigurationResult", l_ = "GetBucketMetadataTableConfigurationRequest", u_ = "GetBucketNotificationConfiguration", d_ = "GetBucketNotificationConfigurationRequest", f_ = "GetBucketOwnershipControls", p_ = "GetBucketOwnershipControlsOutput", m_ = "GetBucketOwnershipControlsRequest", h_ = "GetBucketPolicy", g_ = "GetBucketPolicyOutput", __ = "GetBucketPolicyRequest", v_ = "GetBucketPolicyStatus", y_ = "GetBucketPolicyStatusOutput", b_ = "GetBucketPolicyStatusRequest", x_ = "GetBucketReplication", S_ = "GetBucketReplicationOutput", C_ = "GetBucketRequestPayment", w_ = "GetBucketRequestPaymentOutput", T_ = "GetBucketRequestPaymentRequest", E_ = "GetBucketReplicationRequest", D_ = "GetBucketTagging", O_ = "GetBucketTaggingOutput", k_ = "GetBucketTaggingRequest", A_ = "GetBucketVersioning", j_ = "GetBucketVersioningOutput", M_ = "GetBucketVersioningRequest", N_ = "GetBucketWebsite", P_ = "GetBucketWebsiteOutput", F_ = "GetBucketWebsiteRequest", I_ = "GrantFullControl", L_ = "GlacierJobParameters", R_ = "GetObject", z_ = "GetObjectAcl", B_ = "GetObjectAclOutput", V_ = "GetObjectAnnotationOutput", H_ = "GetObjectAttributesOutput", U_ = "GetObjectAttributesParts", W_ = "GetObjectAclRequest", G_ = "GetObjectAnnotationRequest", K_ = "GetObjectAttributesResponse", q_ = "GetObjectAttributesRequest", J_ = "GetObjectAnnotation", Y_ = "GetObjectAttributes", X_ = "GetObjectLockConfiguration", Z_ = "GetObjectLockConfigurationOutput", Q_ = "GetObjectLockConfigurationRequest", $_ = "GetObjectLegalHold", ev = "GetObjectLegalHoldOutput", tv = "GetObjectLegalHoldRequest", nv = "GetObjectOutput", rv = "GetObjectRequest", iv = "GetObjectRetentionOutput", av = "GetObjectRetentionRequest", ov = "GetObjectRetention", sv = "GetObjectTagging", cv = "GetObjectTaggingOutput", lv = "GetObjectTorrentOutput", uv = "GetObjectTaggingRequest", dv = "GetObjectTorrentRequest", fv = "GetObjectTorrent", pv = "GetPublicAccessBlock", mv = "GetPublicAccessBlockOutput", hv = "GetPublicAccessBlockRequest", gv = "GrantRead", _v = "GrantReadACP", vv = "GrantWrite", yv = "GrantWriteACP", bv = "Grant", xv = "Grantee", Sv = "HeadBucket", Cv = "HeadBucketOutput", wv = "HeadBucketRequest", Tv = "HttpErrorCodeReturnedEquals", Ev = "HostName", Dv = "HeadObject", Ov = "HeadObjectOutput", kv = "HeadObjectRequest", Av = "HttpRedirectCode", jv = "Id", Mv = "InvalidAnnotationName", Nv = "InventoryConfiguration", Pv = "InventoryConfigurationList", Fv = "ID", Iv = "IndexDocument", Lv = "InventoryDestination", Rv = "IsEnabled", zv = "InventoryEncryption", Bv = "InventoryFilter", Vv = "IsLatest", Hv = "IfMatch", Uv = "IfMatchInitiatedTime", Wv = "IfMatchLastModifiedTime", Gv = "IfMatchSize", Kv = "If-Modified-Since", qv = "IfModifiedSince", Jv = "InitiateMultipartUploadResult", Yv = "If-Match", Xv = "IfNoneMatch", Zv = "If-None-Match", Qv = "InventoryOptionalFields", $v = "InvalidObjectState", ey = "IncludedObjectVersions", ty = "InvalidPrefix", ny = "IgnorePublicAcls", ry = "IdempotencyParameterMismatch", iy = "IsPublic", ay = "InvalidRequest", oy = "IsRestoreInProgress", sy = "InputSerialization", cy = "InventoryS3BucketDestination", ly = "InventorySchedule", uy = "IsTruncated", dy = "IntelligentTieringAndOperator", fy = "IntelligentTieringConfiguration", py = "IntelligentTieringConfigurationList", my = "InventoryTableConfigurationResult", hy = "InventoryTableConfigurationUpdates", gy = "InventoryTableConfiguration", _y = "IntelligentTieringFilter", vy = "IfUnmodifiedSince", yy = "If-Unmodified-Since", by = "InvalidWriteOffset", xy = "Initiator", Sy = "Initiated", Cy = "JSON", wy = "JSONInput", Ty = "JSONOutput", Ey = "JournalTableConfiguration", Dy = "JournalTableConfigurationResult", Oy = "JournalTableConfigurationUpdates", N = "Key", ky = "KeyCount", Ay = "KeyId", jy = "KmsKeyArn", My = "KeyMarker", Ny = "KMSContext", Py = "KMSKeyArn", Fy = "KMSKeyId", Iy = "KMSMasterKeyID", Ly = "KeyPrefixEquals", Ry = "Location", zy = "ListAllMyBucketsResult", By = "ListAllMyDirectoryBucketsResult", Vy = "ListBuckets", Hy = "ListBucketAnalyticsConfigurations", Uy = "ListBucketAnalyticsConfigurationsOutput", Wy = "ListBucketAnalyticsConfigurationResult", Gy = "ListBucketAnalyticsConfigurationsRequest", Ky = "ListBucketInventoryConfigurations", qy = "ListBucketInventoryConfigurationsOutput", Jy = "ListBucketInventoryConfigurationsRequest", Yy = "ListBucketIntelligentTieringConfigurations", Xy = "ListBucketIntelligentTieringConfigurationsOutput", Zy = "ListBucketIntelligentTieringConfigurationsRequest", Qy = "ListBucketMetricsConfigurations", $y = "ListBucketMetricsConfigurationsOutput", eb = "ListBucketMetricsConfigurationsRequest", tb = "ListBucketsOutput", nb = "ListBucketsRequest", rb = "ListBucketResult", ib = "LocationConstraint", ab = "LifecycleConfiguration", ob = "ListDirectoryBuckets", sb = "ListDirectoryBucketsOutput", cb = "ListDirectoryBucketsRequest", lb = "LoggingEnabled", ub = "LifecycleExpiration", db = "LambdaFunctionArn", fb = "LambdaFunctionConfiguration", pb = "LambdaFunctionConfigurationList", mb = "LambdaFunctionConfigurations", hb = "LegalHold", gb = "LocationInfo", _b = "ListInventoryConfigurationsResult", vb = "LastModified", yb = "ListMetricsConfigurationsResult", bb = "LastModifiedTime", xb = "ListMultipartUploads", Sb = "ListMultipartUploadsOutput", Cb = "ListMultipartUploadsResult", wb = "ListMultipartUploadsRequest", Tb = "Last-Modified", Eb = "ListObjects", Db = "ListObjectAnnotations", Ob = "ListObjectAnnotationsOutput", kb = "ListObjectAnnotationsRequest", Ab = "ListObjectsOutput", jb = "ListObjectsRequest", Mb = "ListObjectsV2", Nb = "ListObjectsV2Output", Pb = "ListObjectVersionsOutput", Fb = "ListObjectsV2Request", Ib = "ListObjectVersionsRequest", Lb = "ListObjectVersions", Rb = "ListParts", zb = "ListPartsOutput", Bb = "ListPartsResult", Vb = "ListPartsRequest", Hb = "LifecycleRule", Ub = "LifecycleRuleAndOperator", Wb = "LifecycleRuleFilter", Gb = "LifecycleRules", Kb = "ListVersionsResult", qb = "Metadata", Jb = "MetricsAndOperator", Yb = "MaxAnnotationResults", Xb = "MaxAgeSeconds", Zb = "MaxBuckets", Qb = "MetadataConfiguration", $b = "MetricsConfigurationList", ex = "MetadataConfigurationResult", tx = "MetricsConfiguration", nx = "MetadataDirective", rx = "MaxDirectoryBuckets", ix = "MfaDelete", ax = "MetadataEntry", ox = "MetricsFilter", sx = "MFA", cx = "MFADelete", lx = "MaxKeys", ux = "MissingMeta", dx = "MpuObjectSize", fx = "MaxParts", px = "MetadataTableConfiguration", mx = "MetadataTableConfigurationResult", hx = "MetadataTableEncryptionConfiguration", gx = "MultipartUpload", _x = "MultipartUploadList", vx = "MaxUploads", yx = "Marker", bx = "Metrics", xx = "Message", Sx = "Minutes", Cx = "Mode", wx = "Name", Tx = "NotificationConfiguration", Ex = "NotificationConfigurationFilter", Dx = "NextContinuationToken", Ox = "NoncurrentDays", kx = "NonEmptyKmsKeyArnString", Ax = "NotFound", jx = "NextKeyMarker", Mx = "NextMarker", Nx = "NewerNoncurrentVersions", Px = "NextPartNumberMarker", Fx = "NoSuchAnnotation", Ix = "NoSuchBucket", Lx = "NoSuchKey", Rx = "NoSuchUpload", zx = "NextUploadIdMarker", Bx = "NoncurrentVersionExpiration", Vx = "NextVersionIdMarker", Hx = "NoncurrentVersionTransitions", Ux = "NoncurrentVersionTransitionList", Wx = "NoncurrentVersionTransition", Gx = "Owner", Kx = "ObjectAttributes", qx = "ObjectAlreadyInActiveTierError", Jx = "OwnershipControls", Yx = "OwnershipControlsRule", Xx = "OwnershipControlsRules", Zx = "ObjectEncryption", Qx = "OptionalFields", $x = "ObjectIdentifier", eS = "ObjectIdentifierList", tS = "ObjectIfMatch", nS = "OutputLocation", rS = "ObjectLockConfiguration", iS = "ObjectLockEnabled", aS = "ObjectLockEnabledForBucket", oS = "ObjectLockEventHold", sS = "ObjectLockEventHoldDurationDays", cS = "ObjectLockEventHoldDurationYears", lS = "ObjectLockLegalHold", uS = "ObjectLockLegalHoldStatus", dS = "ObjectLockMode", fS = "ObjectLockRetention", pS = "ObjectLockRetainUntilDate", mS = "ObjectLockRule", hS = "ObjectList", gS = "ObjectNotInActiveTierError", _S = "ObjectOwnership", vS = "OptionalObjectAttributes", yS = "ObjectParts", bS = "ObjectPart", xS = "ObjectSize", SS = "ObjectSizeGreaterThan", CS = "ObjectSizeLessThan", wS = "OutputSchemaVersion", TS = "OutputSerialization", ES = "ObjectVersion", DS = "ObjectVersionId", OS = "ObjectVersionList", kS = "Objects", AS = "Object", P = "Prefix", jS = "PublicAccessBlockConfiguration", MS = "PutBucketAbac", NS = "PutBucketAccelerateConfiguration", PS = "PutBucketAccelerateConfigurationRequest", FS = "PutBucketAnalyticsConfigurationRequest", IS = "PutBucketAnalyticsConfiguration", LS = "PutBucketAbacRequest", RS = "PutBucketAclRequest", zS = "PutBucketAcl", BS = "PutBucketCors", VS = "PutBucketCorsRequest", HS = "PutBucketEncryption", US = "PutBucketEncryptionRequest", WS = "PutBucketInventoryConfiguration", GS = "PutBucketInventoryConfigurationRequest", KS = "PutBucketIntelligentTieringConfiguration", qS = "PutBucketIntelligentTieringConfigurationRequest", JS = "PutBucketLogging", YS = "PutBucketLifecycleConfiguration", XS = "PutBucketLifecycleConfigurationOutput", ZS = "PutBucketLifecycleConfigurationRequest", QS = "PutBucketLoggingRequest", $S = "PutBucketMetricsConfiguration", eC = "PutBucketMetricsConfigurationRequest", tC = "PutBucketNotificationConfiguration", nC = "PutBucketNotificationConfigurationRequest", rC = "PutBucketOwnershipControls", iC = "PutBucketOwnershipControlsRequest", aC = "PutBucketPolicy", oC = "PutBucketPolicyRequest", sC = "PutBucketReplication", cC = "PutBucketRequestPayment", lC = "PutBucketRequestPaymentRequest", uC = "PutBucketReplicationRequest", dC = "PutBucketTagging", fC = "PutBucketTaggingRequest", pC = "PutBucketVersioning", mC = "PutBucketVersioningRequest", hC = "PutBucketWebsite", gC = "PutBucketWebsiteRequest", _C = "PartsCount", vC = "PartitionDateSource", yC = "ProgressEvent", bC = "ParquetInput", xC = "PartsList", SC = "PartNumber", CC = "PartNumberMarker", wC = "PutObject", TC = "PutObjectAcl", EC = "PutObjectAclOutput", DC = "PutObjectAnnotationOutput", OC = "PutObjectAclRequest", kC = "PutObjectAnnotationRequest", AC = "PutObjectAnnotation", jC = "PutObjectLockConfiguration", MC = "PutObjectLockConfigurationOutput", NC = "PutObjectLockConfigurationRequest", PC = "PutObjectLegalHold", FC = "PutObjectLegalHoldOutput", IC = "PutObjectLegalHoldRequest", LC = "PutObjectOutput", RC = "PutObjectRequest", zC = "PutObjectRetentionOutput", BC = "PutObjectRetentionRequest", VC = "PutObjectRetention", HC = "PutObjectTagging", UC = "PutObjectTaggingOutput", WC = "PutObjectTaggingRequest", GC = "PartitionedPrefix", KC = "PutPublicAccessBlock", qC = "PutPublicAccessBlockRequest", JC = "PolicyStatus", YC = "Parts", XC = "Part", ZC = "Parquet", QC = "Payer", $C = "Payload", ew = "Permission", tw = "Policy", nw = "Progress", rw = "Priority", iw = "Protocol", aw = "Quiet", ow = "QueueArn", sw = "QuoteCharacter", cw = "QueueConfigurationList", lw = "QueueConfigurations", uw = "QueueConfiguration", dw = "QuoteEscapeCharacter", fw = "QuoteFields", pw = "Queue", mw = "Role", hw = "RedirectAllRequestsTo", F = "RequestCharged", gw = "ResponseCacheControl", _w = "ResponseContentDisposition", vw = "ResponseContentEncoding", yw = "ResponseContentLanguage", bw = "ResponseContentType", xw = "ReplicationConfiguration", Sw = "RecordDelimiter", Cw = "ResponseExpires", ww = "RestoreExpiryDate", Tw = "RecordExpiration", Ew = "RecordsEvent", Dw = "ReplicaKmsKeyID", Ow = "ReplaceKeyPrefixWith", kw = "ReplaceKeyWith", Aw = "ReplicaModifications", jw = "RenameObject", Mw = "RenameObjectOutput", Nw = "RestoreObjectOutput", Pw = "RestoreOutputPath", Fw = "RenameObjectRequest", Iw = "RestoreObjectRequest", Lw = "RestoreObject", I = "RequestPayer", Rw = "RestrictPublicBuckets", zw = "RequestPaymentConfiguration", Bw = "RequestProgress", Vw = "RoutingRules", Hw = "ReplicationRuleAndOperator", Uw = "ReplicationRuleFilter", Ww = "ReplicationRule", Gw = "ReplicationRules", Kw = "RequestRoute", qw = "RestoreRequest", Jw = "RoutingRule", Yw = "ReplicationStatus", Xw = "RestoreStatus", Zw = "RenameSource", Qw = "ReplicationTime", $w = "ReplicationTimeValue", eT = "RequestToken", tT = "RetainUntilDate", nT = "Range", rT = "Restore", iT = "Records", aT = "Redirect", oT = "Retention", sT = "Rules", cT = "Rule", lT = "Status", uT = "StartAfter", dT = "SecretAccessKey", fT = "SseAlgorithm", pT = "StreamingBlob", mT = "S3BucketDestination", hT = "StorageClass", gT = "StorageClassAnalysis", _T = "StorageClassAnalysisDataExport", vT = "SessionCredentialValue", yT = "SessionCredentials", bT = "StatusCode", xT = "SkipDestinationValidation", ST = "StatsEvent", CT = "SourceIfMatch", wT = "SourceIfModifiedSince", TT = "SourceIfNoneMatch", ET = "SourceIfUnmodifiedSince", DT = "SSE-KMS", OT = "SseKmsEncryptedObjects", kT = "S3KeyFilter", AT = "S3Key", jT = "S3Location", MT = "SessionMode", NT = "SelectObjectContent", PT = "SelectObjectContentEventStream", FT = "SelectObjectContentOutput", IT = "SelectObjectContentRequest", LT = "SelectParameters", RT = "SimplePrefix", zT = "ScanRange", BT = "SSE-S3", VT = "SourceSelectionCriteria", HT = "ServerSideEncryption", UT = "SSEAlgorithm", WT = "ServerSideEncryptionByDefault", GT = "ServerSideEncryptionConfiguration", KT = "SSECustomerAlgorithm", qT = "SSECustomerKey", JT = "SSECustomerKeyMD5", YT = "SSEKMS", XT = "SSEKMSEncryption", ZT = "SSEKMSEncryptionContext", QT = "SSEKMSKeyId", $T = "ServerSideEncryptionRule", eE = "ServerSideEncryptionRules", tE = "SSES3", nE = "SessionToken", rE = "S3TablesDestination", iE = "S3TablesDestinationResult", aE = "S3", oE = "Schedule", sE = "Size", cE = "Start", lE = "Stats", uE = "Suffix", dE = "Tags", fE = "TableArn", pE = "TopicArn", mE = "TargetBucket", hE = "TableBucketArn", gE = "TableBucketType", _E = "TagCount", vE = "TopicConfigurationList", yE = "TopicConfigurations", bE = "TopicConfiguration", xE = "TaggingDirective", SE = "TransitionDefaultMinimumObjectSize", CE = "TargetGrants", wE = "TargetGrant", TE = "TieringList", EE = "TransitionList", DE = "TooManyParts", OE = "TableName", kE = "TableNamespace", AE = "TargetObjectKeyFormat", jE = "TargetPrefix", ME = "TotalPartsCount", NE = "TableStatus", PE = "TagSet", FE = "Tag", IE = "Tagging", LE = "Tier", RE = "Tierings", zE = "Tiering", BE = "Time", VE = "Token", HE = "Topic", UE = "Transitions", WE = "Transition", GE = "Type", KE = "Uploads", qE = "UpdateBucketMetadataAnnotationTableConfiguration", JE = "UpdateBucketMetadataAnnotationTableConfigurationRequest", YE = "UpdateBucketMetadataInventoryTableConfiguration", XE = "UpdateBucketMetadataInventoryTableConfigurationRequest", ZE = "UpdateBucketMetadataJournalTableConfiguration", QE = "UpdateBucketMetadataJournalTableConfigurationRequest", $E = "UploadId", eD = "UploadIdMarker", tD = "UserMetadata", nD = "UnsupportedMediaType", rD = "UpdateObjectEncryption", iD = "UpdateObjectEncryptionRequest", aD = "UpdateObjectEncryptionResponse", oD = "UploadPart", sD = "UploadPartCopy", cD = "UploadPartCopyOutput", lD = "UploadPartCopyRequest", uD = "UploadPartOutput", dD = "UploadPartRequest", fD = "URI", pD = "Upload", mD = "Value", hD = "VersioningConfiguration", L = "VersionId", gD = "VersionIdMarker", _D = "Versions", vD = "Version", yD = "WebsiteConfiguration", bD = "WriteGetObjectResponse", xD = "WriteGetObjectResponseRequest", SD = "WriteOffsetBytes", CD = "WebsiteRedirectLocation", wD = "Years", TD = "annotationName", ED = "annotation-prefix", DD = "accept-ranges", OD = "bucket-region", R = "client", kD = "continuation-token", AD = "delimiter", z = "error", jD = "eventPayload", MD = "endpoint", ND = "encoding-type", PD = "fetch-owner", B = "http", V = "httpChecksum", FD = "httpError", H = "httpHeader", ID = "hostLabel", U = "httpPayload", LD = "httpPrefixHeaders", W = "httpQuery", RD = "http://www.w3.org/2001/XMLSchema-instance", zD = "id", BD = "idempotencyToken", VD = "key-marker", HD = "marker", UD = "max-annotation-results", WD = "max-buckets", GD = "max-directory-buckets", KD = "max-keys", qD = "max-parts", JD = "max-uploads", YD = "prefix", XD = "partNumber", ZD = "part-number-marker", QD = "response-cache-control", $D = "response-content-disposition", eO = "response-content-encoding", tO = "response-content-language", nO = "response-content-type", rO = "response-expires", iO = "smithy.ts.sdk.synthetic.com.amazonaws.s3", aO = "start-after", oO = "streaming", sO = "uploadId", cO = "upload-id-marker", lO = "versionId", uO = "version-id-marker", dO = "xsi", fO = "xmlAttribute", G = "xmlFlattened", K = "xmlName", pO = "xmlNamespace", mO = "x-amz-acl", hO = "x-amz-abort-date", gO = "x-amz-access-point-alias", _O = "x-amz-abort-rule-id", vO = "x-amz-archive-status", yO = "x-amz-bucket-arn", bO = "x-amz-bypass-governance-retention", xO = "x-amz-bucket-location-name", SO = "x-amz-bucket-location-type", CO = "x-amz-bucket-namespace", wO = "x-amz-bucket-object-lock-enabled", TO = "x-amz-bucket-object-lock-token", EO = "x-amz-bucket-region", DO = "x-amz-checksum-algorithm", OO = "x-amz-checksum-crc32", kO = "x-amz-checksum-crc32c", AO = "x-amz-checksum-crc64nvme", jO = "x-amz-checksum-md5", MO = "x-amz-checksum-mode", NO = "x-amz-confirm-remove-self-bucket-access", PO = "x-amz-checksum-sha1", FO = "x-amz-checksum-sha256", IO = "x-amz-checksum-sha512", LO = "x-amz-copy-source", RO = "x-amz-copy-source-if-match", zO = "x-amz-copy-source-if-modified-since", BO = "x-amz-copy-source-if-none-match", VO = "x-amz-copy-source-if-unmodified-since", HO = "x-amz-create-session-mode", UO = "x-amz-copy-source-range", WO = "x-amz-copy-source-server-side-encryption-customer-algorithm", GO = "x-amz-copy-source-server-side-encryption-customer-key", KO = "x-amz-copy-source-server-side-encryption-customer-key-MD5", qO = "x-amz-copy-source-version-id", JO = "x-amz-checksum-type", YO = "x-amz-client-token", XO = "x-amz-checksum-xxhash64", ZO = "x-amz-checksum-xxhash3", QO = "x-amz-checksum-xxhash128", $O = "x-amz-delete-marker", ek = "x-amz-expiration", q = "x-amz-expected-bucket-owner", tk = "x-amz-fwd-error-code", nk = "x-amz-fwd-error-message", rk = "x-amz-fwd-header-Cache-Control", ik = "x-amz-fwd-header-Content-Disposition", ak = "x-amz-fwd-header-Content-Encoding", ok = "x-amz-fwd-header-Content-Language", sk = "x-amz-fwd-header-Content-Range", ck = "x-amz-fwd-header-Content-Type", lk = "x-amz-fwd-header-ETag", uk = "x-amz-fwd-header-Expires", dk = "x-amz-fwd-header-Last-Modified", fk = "x-amz-fwd-header-accept-ranges", pk = "x-amz-fwd-header-x-amz-checksum-crc32", mk = "x-amz-fwd-header-x-amz-checksum-crc32c", hk = "x-amz-fwd-header-x-amz-checksum-crc64nvme", gk = "x-amz-fwd-header-x-amz-checksum-md5", _k = "x-amz-fwd-header-x-amz-checksum-sha1", vk = "x-amz-fwd-header-x-amz-checksum-sha256", yk = "x-amz-fwd-header-x-amz-checksum-sha512", bk = "x-amz-fwd-header-x-amz-checksum-xxhash64", xk = "x-amz-fwd-header-x-amz-checksum-xxhash3", Sk = "x-amz-fwd-header-x-amz-checksum-xxhash128", Ck = "x-amz-fwd-header-x-amz-delete-marker", wk = "x-amz-fwd-header-x-amz-expiration", Tk = "x-amz-fwd-header-x-amz-missing-meta", Ek = "x-amz-fwd-header-x-amz-mp-parts-count", Dk = "x-amz-fwd-header-x-amz-object-lock-legal-hold", Ok = "x-amz-fwd-header-x-amz-object-lock-mode", kk = "x-amz-fwd-header-x-amz-object-lock-retain-until-date", Ak = "x-amz-fwd-header-x-amz-restore", jk = "x-amz-fwd-header-x-amz-request-charged", Mk = "x-amz-fwd-header-x-amz-replication-status", Nk = "x-amz-fwd-header-x-amz-storage-class", Pk = "x-amz-fwd-header-x-amz-server-side-encryption", Fk = "x-amz-fwd-header-x-amz-server-side-encryption-aws-kms-key-id", Ik = "x-amz-fwd-header-x-amz-server-side-encryption-bucket-key-enabled", Lk = "x-amz-fwd-header-x-amz-server-side-encryption-customer-algorithm", Rk = "x-amz-fwd-header-x-amz-server-side-encryption-customer-key-MD5", zk = "x-amz-fwd-header-x-amz-tagging-count", Bk = "x-amz-fwd-header-x-amz-version-id", Vk = "x-amz-fwd-status", Hk = "x-amz-grant-full-control", Uk = "x-amz-grant-read", Wk = "x-amz-grant-read-acp", Gk = "x-amz-grant-write", Kk = "x-amz-grant-write-acp", qk = "x-amz-if-match-initiated-time", Jk = "x-amz-if-match-last-modified-time", Yk = "x-amz-if-match-size", Xk = "x-amz-meta-", Zk = "x-amz-mfa", Qk = "x-amz-metadata-directive", $k = "x-amz-missing-meta", eA = "x-amz-mp-object-size", tA = "x-amz-max-parts", nA = "x-amz-mp-parts-count", rA = "x-amz-object-attributes", iA = "x-amz-object-annotation-directive", aA = "x-amz-object-if-match", oA = "x-amz-object-lock-event-hold", sA = "x-amz-object-lock-event-hold-duration-days", cA = "x-amz-object-lock-event-hold-duration-years", lA = "x-amz-object-lock-legal-hold", uA = "x-amz-object-lock-mode", dA = "x-amz-object-lock-retain-until-date", fA = "x-amz-object-ownership", pA = "x-amz-optional-object-attributes", mA = "x-amz-object-size", hA = "x-amz-object-version-id", gA = "x-amz-part-number-marker", _A = "x-amz-restore", J = "x-amz-request-charged", vA = "x-amz-restore-output-path", Y = "x-amz-request-payer", yA = "x-amz-request-route", bA = "x-amz-replication-status", xA = "x-amz-rename-source", SA = "x-amz-rename-source-if-match", CA = "x-amz-rename-source-if-modified-since", wA = "x-amz-rename-source-if-none-match", TA = "x-amz-rename-source-if-unmodified-since", EA = "x-amz-request-token", DA = "x-amz-storage-class", X = "x-amz-sdk-checksum-algorithm", OA = "x-amz-skip-destination-validation", kA = "x-amz-source-expected-bucket-owner", AA = "x-amz-server-side-encryption", jA = "x-amz-server-side-encryption-aws-kms-key-id", MA = "x-amz-server-side-encryption-bucket-key-enabled", NA = "x-amz-server-side-encryption-context", PA = "x-amz-server-side-encryption-customer-algorithm", FA = "x-amz-server-side-encryption-customer-key", IA = "x-amz-server-side-encryption-customer-key-MD5", LA = "x-amz-tagging", RA = "x-amz-tagging-count", zA = "x-amz-tagging-directive", BA = "x-amz-transition-default-minimum-object-size", VA = "x-amz-version-id", HA = "x-amz-write-offset-bytes", UA = "x-amz-website-redirect-location", WA = "xsi:type", Z = "com.amazonaws.s3", GA = new et(iO), KA = [
	-3,
	iO,
	"S3ServiceException",
	0,
	[],
	[]
];
GA.registerError(KA, E);
var Q = new et(Z), qA = [
	-3,
	Z,
	Td,
	{
		[z]: R,
		[FD]: 403
	},
	[],
	[]
];
Q.registerError(qA, Yu);
var JA = [
	-3,
	Z,
	Ld,
	{
		[z]: R,
		[FD]: 400
	},
	[],
	[]
];
Q.registerError(JA, ld);
var YA = [
	-3,
	Z,
	Wd,
	{
		[z]: R,
		[FD]: 400
	},
	[],
	[]
];
Q.registerError(YA, ud);
var XA = [
	-3,
	Z,
	ff,
	{
		[z]: R,
		[FD]: 409
	},
	[],
	[]
];
Q.registerError(XA, Zu);
var ZA = [
	-3,
	Z,
	mf,
	{
		[z]: R,
		[FD]: 409
	},
	[],
	[]
];
Q.registerError(ZA, Qu);
var QA = [
	-3,
	Z,
	Yh,
	{
		[z]: R,
		[FD]: 400
	},
	[],
	[]
];
Q.registerError(QA, ad);
var $A = [
	-3,
	Z,
	ry,
	{
		[z]: R,
		[FD]: 400
	},
	[],
	[]
];
Q.registerError($A, pd);
var ej = [
	-3,
	Z,
	Mv,
	{
		[z]: R,
		[FD]: 400
	},
	[],
	[]
];
Q.registerError(ej, dd);
var tj = [
	-3,
	Z,
	$v,
	{
		[z]: R,
		[FD]: 403
	},
	[hT, af],
	[0, 0]
];
Q.registerError(tj, td);
var nj = [
	-3,
	Z,
	ty,
	{
		[z]: R,
		[FD]: 400
	},
	[],
	[]
];
Q.registerError(nj, id);
var rj = [
	-3,
	Z,
	ay,
	{
		[z]: R,
		[FD]: 400
	},
	[],
	[]
];
Q.registerError(rj, od);
var ij = [
	-3,
	Z,
	by,
	{
		[z]: R,
		[FD]: 400
	},
	[],
	[]
];
Q.registerError(ij, sd);
var aj = [
	-3,
	Z,
	Fx,
	{
		[z]: R,
		[FD]: 404
	},
	[],
	[]
];
Q.registerError(aj, nd);
var oj = [
	-3,
	Z,
	Ix,
	{
		[z]: R,
		[FD]: 404
	},
	[],
	[]
];
Q.registerError(oj, $u);
var sj = [
	-3,
	Z,
	Lx,
	{
		[z]: R,
		[FD]: 404
	},
	[],
	[]
];
Q.registerError(sj, ed);
var cj = [
	-3,
	Z,
	Rx,
	{
		[z]: R,
		[FD]: 404
	},
	[],
	[]
];
Q.registerError(cj, Ju);
var lj = [
	-3,
	Z,
	Ax,
	{ [z]: R },
	[],
	[]
];
Q.registerError(lj, rd);
var uj = [
	-3,
	Z,
	qx,
	{
		[z]: R,
		[FD]: 403
	},
	[],
	[]
];
Q.registerError(uj, md);
var dj = [
	-3,
	Z,
	gS,
	{
		[z]: R,
		[FD]: 403
	},
	[],
	[]
];
Q.registerError(dj, Xu);
var fj = [
	-3,
	Z,
	DE,
	{
		[z]: R,
		[FD]: 400
	},
	[],
	[]
];
Q.registerError(fj, cd);
var pj = [
	-3,
	Z,
	nD,
	{
		[z]: R,
		[FD]: 415
	},
	[],
	[]
];
Q.registerError(pj, fd);
var mj = [GA, Q], hj = [
	0,
	Z,
	Gp,
	8,
	0
], gj = [
	0,
	Z,
	kx,
	8,
	0
], _j = [
	0,
	Z,
	vT,
	8,
	0
], vj = [
	0,
	Z,
	qT,
	8,
	0
], yj = [
	0,
	Z,
	ZT,
	8,
	0
], bj = [
	0,
	Z,
	QT,
	8,
	0
], xj = [
	0,
	Z,
	pT,
	{ [oO]: 1 },
	42
], Sj = [
	3,
	Z,
	ef,
	0,
	[lT],
	[0]
], Cj = [
	3,
	Z,
	Pd,
	0,
	[hm],
	[1]
], wj = [
	3,
	Z,
	Bd,
	0,
	[F],
	[[0, { [H]: J }]]
], Tj = [
	3,
	Z,
	Vd,
	0,
	[
		D,
		N,
		$E,
		I,
		j,
		Uv
	],
	[
		[0, 1],
		[0, 1],
		[0, { [W]: sO }],
		[0, { [H]: Y }],
		[0, { [H]: q }],
		[6, { [H]: qk }]
	],
	3
], Ej = [
	3,
	Z,
	_d,
	0,
	[lT],
	[0]
], Dj = [
	3,
	Z,
	xd,
	0,
	[yg, Gx],
	[[() => QL, { [K]: vd }], () => HF]
], Oj = [
	3,
	Z,
	Sd,
	0,
	[Gx],
	[0],
	1
], kj = [
	3,
	Z,
	gd,
	0,
	[P, dE],
	[0, [() => _R, {
		[G]: 1,
		[K]: FE
	}]]
], Aj = [
	3,
	Z,
	Cd,
	0,
	[
		jv,
		gT,
		lg
	],
	[
		0,
		() => bL,
		[() => CR, 0]
	],
	2
], jj = [
	3,
	Z,
	kd,
	0,
	[mT],
	[() => Mj],
	1
], Mj = [
	3,
	Z,
	tf,
	0,
	[
		_g,
		D,
		pf,
		P
	],
	[
		0,
		0,
		0,
		0
	],
	2
], Nj = [
	3,
	Z,
	Od,
	0,
	[
		Ud,
		vb,
		sE,
		M,
		O,
		Yw
	],
	[
		0,
		4,
		1,
		0,
		[64, { [G]: 1 }],
		0
	],
	3
], Pj = [
	3,
	Z,
	of,
	0,
	[
		Mp,
		Ph,
		mw
	],
	[
		0,
		() => CF,
		0
	],
	1
], Fj = [
	3,
	Z,
	sf,
	0,
	[
		Mp,
		NE,
		jh,
		OE,
		fE,
		mw
	],
	[
		0,
		0,
		() => JM,
		0,
		0,
		0
	],
	1
], Ij = [
	3,
	Z,
	cf,
	0,
	[
		Mp,
		Ph,
		mw
	],
	[
		0,
		() => CF,
		0
	],
	1
], Lj = [
	3,
	Z,
	hf,
	0,
	[Xh],
	[[() => YL, { [G]: 1 }]]
], Rj = [
	3,
	Z,
	D,
	0,
	[
		wx,
		Jf,
		Of,
		df
	],
	[
		0,
		4,
		0,
		0
	]
], zj = [
	3,
	Z,
	_f,
	0,
	[bh, GE],
	[0, 0]
], Bj = [
	3,
	Z,
	yf,
	0,
	[sT],
	[[() => rR, {
		[G]: 1,
		[K]: cT
	}]],
	1
], Vj = [
	3,
	Z,
	xf,
	0,
	[lb],
	[[() => _F, 0]]
], Hj = [
	3,
	Z,
	Nf,
	0,
	[
		Wf,
		Gf,
		Kf,
		Np,
		Pp,
		Fp,
		op,
		am,
		om,
		sm,
		$p
	],
	[
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0
	]
], Uj = [
	3,
	Z,
	Cp,
	0,
	[P],
	[0]
], Wj = [
	3,
	Z,
	sp,
	0,
	[YC],
	[[() => GL, {
		[G]: 1,
		[K]: XC
	}]]
], Gj = [
	3,
	Z,
	Dp,
	0,
	[
		M,
		Wf,
		Gf,
		Kf,
		Np,
		Pp,
		Fp,
		op,
		am,
		om,
		sm,
		SC
	],
	[
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		1
	]
], Kj = [
	3,
	Z,
	cp,
	{ [K]: up },
	[
		Ry,
		D,
		N,
		og,
		M,
		Wf,
		Gf,
		Kf,
		Np,
		Pp,
		Fp,
		op,
		am,
		om,
		sm,
		$p,
		HT,
		L,
		QT,
		vf,
		F
	],
	[
		0,
		0,
		0,
		[0, { [H]: ek }],
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		[0, { [H]: AA }],
		[0, { [H]: VA }],
		[() => bj, { [H]: jA }],
		[2, { [H]: MA }],
		[0, { [H]: J }]
	]
], qj = [
	3,
	Z,
	dp,
	0,
	[
		D,
		N,
		$E,
		gx,
		Wf,
		Gf,
		Kf,
		Np,
		Pp,
		Fp,
		op,
		am,
		om,
		sm,
		$p,
		dx,
		I,
		j,
		Hv,
		Xv,
		KT,
		qT,
		JT
	],
	[
		[0, 1],
		[0, 1],
		[0, { [W]: sO }],
		[() => Wj, {
			[U]: 1,
			[K]: pp
		}],
		[0, { [H]: OO }],
		[0, { [H]: kO }],
		[0, { [H]: AO }],
		[0, { [H]: PO }],
		[0, { [H]: FO }],
		[0, { [H]: IO }],
		[0, { [H]: jO }],
		[0, { [H]: XO }],
		[0, { [H]: ZO }],
		[0, { [H]: QO }],
		[0, { [H]: JO }],
		[1, { [H]: eA }],
		[0, { [H]: Y }],
		[0, { [H]: q }],
		[0, { [H]: Yv }],
		[0, { [H]: Zv }],
		[0, { [H]: PA }],
		[() => vj, { [H]: FA }],
		[0, { [H]: IA }]
	],
	3
], Jj = [
	3,
	Z,
	cm,
	0,
	[Tv, Ly],
	[0, 0]
], Yj = [
	3,
	Z,
	Zf,
	0,
	[],
	[]
], Xj = [
	3,
	Z,
	_p,
	0,
	[
		vp,
		og,
		Jp,
		L,
		HT,
		KT,
		JT,
		QT,
		ZT,
		vf,
		F
	],
	[
		[() => Qj, 16],
		[0, { [H]: ek }],
		[0, { [H]: qO }],
		[0, { [H]: VA }],
		[0, { [H]: AA }],
		[0, { [H]: PA }],
		[0, { [H]: IA }],
		[() => bj, { [H]: jA }],
		[() => yj, { [H]: NA }],
		[2, { [H]: MA }],
		[0, { [H]: J }]
	]
], Zj = [
	3,
	Z,
	Sp,
	0,
	[
		D,
		Zp,
		N,
		yd,
		Uf,
		O,
		Xf,
		$f,
		np,
		nm,
		Ip,
		Lp,
		Rp,
		zp,
		sg,
		I_,
		gv,
		_v,
		yv,
		Hv,
		Xv,
		qb,
		nx,
		xE,
		Dd,
		HT,
		hT,
		CD,
		KT,
		qT,
		JT,
		QT,
		ZT,
		vf,
		Wp,
		Gp,
		Kp,
		I,
		IE,
		dS,
		pS,
		uS,
		oS,
		sS,
		cS,
		j,
		qh
	],
	[
		[0, 1],
		[0, { [H]: LO }],
		[0, 1],
		[0, { [H]: mO }],
		[0, { [H]: qf }],
		[0, { [H]: DO }],
		[0, { [H]: Yf }],
		[0, { [H]: Qf }],
		[0, { [H]: rp }],
		[0, { [H]: em }],
		[0, { [H]: RO }],
		[4, { [H]: zO }],
		[0, { [H]: BO }],
		[4, { [H]: VO }],
		[4, { [H]: sg }],
		[0, { [H]: Hk }],
		[0, { [H]: Uk }],
		[0, { [H]: Wk }],
		[0, { [H]: Kk }],
		[0, { [H]: Yv }],
		[0, { [H]: Zv }],
		[128, { [LD]: Xk }],
		[0, { [H]: Qk }],
		[0, { [H]: zA }],
		[0, { [H]: iA }],
		[0, { [H]: AA }],
		[0, { [H]: DA }],
		[0, { [H]: UA }],
		[0, { [H]: PA }],
		[() => vj, { [H]: FA }],
		[0, { [H]: IA }],
		[() => bj, { [H]: jA }],
		[() => yj, { [H]: NA }],
		[2, { [H]: MA }],
		[0, { [H]: WO }],
		[() => hj, { [H]: GO }],
		[0, { [H]: KO }],
		[0, { [H]: Y }],
		[0, { [H]: LA }],
		[0, { [H]: uA }],
		[5, { [H]: dA }],
		[0, { [H]: lA }],
		[0, { [H]: oA }],
		[1, { [H]: sA }],
		[1, { [H]: cA }],
		[0, { [H]: q }],
		[0, { [H]: kA }]
	],
	3
], Qj = [
	3,
	Z,
	vp,
	0,
	[
		M,
		vb,
		$p,
		Wf,
		Gf,
		Kf,
		Np,
		Pp,
		Fp,
		op,
		am,
		om,
		sm
	],
	[
		0,
		4,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0
	]
], $j = [
	3,
	Z,
	Ep,
	0,
	[
		M,
		vb,
		Wf,
		Gf,
		Kf,
		Np,
		Pp,
		Fp,
		op,
		am,
		om,
		sm
	],
	[
		0,
		4,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0
	]
], eM = [
	3,
	Z,
	yp,
	0,
	[bp],
	[[() => KL, {
		[G]: 1,
		[K]: xp
	}]],
	1
], tM = [
	3,
	Z,
	xp,
	0,
	[
		Rd,
		Gd,
		Fv,
		jd,
		zh,
		Xb
	],
	[
		[64, {
			[G]: 1,
			[K]: Hd
		}],
		[64, {
			[G]: 1,
			[K]: Kd
		}],
		0,
		[64, {
			[G]: 1,
			[K]: Md
		}],
		[64, {
			[G]: 1,
			[K]: Hh
		}],
		1
	],
	2
], nM = [
	3,
	Z,
	If,
	0,
	[
		ib,
		Ry,
		D,
		dE
	],
	[
		0,
		() => gF,
		() => zj,
		[() => _R, 0]
	]
], rM = [
	3,
	Z,
	Rf,
	0,
	[
		D,
		Qb,
		A,
		O,
		j
	],
	[
		[0, 1],
		[() => vF, {
			[U]: 1,
			[K]: Qb
		}],
		[0, { [H]: k }],
		[0, { [H]: X }],
		[0, { [H]: q }]
	],
	2
], iM = [
	3,
	Z,
	Bf,
	0,
	[
		D,
		px,
		A,
		O,
		j
	],
	[
		[0, 1],
		[() => xF, {
			[U]: 1,
			[K]: px
		}],
		[0, { [H]: k }],
		[0, { [H]: X }],
		[0, { [H]: q }]
	],
	2
], aM = [
	3,
	Z,
	Vf,
	0,
	[Ry, df],
	[[0, { [H]: Ry }], [0, { [H]: yO }]]
], oM = [
	3,
	Z,
	Hf,
	0,
	[
		D,
		yd,
		If,
		I_,
		gv,
		_v,
		vv,
		yv,
		aS,
		_S,
		Cf
	],
	[
		[0, 1],
		[0, { [H]: mO }],
		[() => nM, {
			[U]: 1,
			[K]: If
		}],
		[0, { [H]: Hk }],
		[0, { [H]: Uk }],
		[0, { [H]: Wk }],
		[0, { [H]: Gk }],
		[0, { [H]: Kk }],
		[2, { [H]: wO }],
		[0, { [H]: fA }],
		[0, { [H]: CO }]
	],
	1
], sM = [
	3,
	Z,
	lp,
	{ [K]: Jv },
	[
		Ed,
		$d,
		D,
		N,
		$E,
		HT,
		KT,
		JT,
		QT,
		ZT,
		vf,
		F,
		O,
		$p
	],
	[
		[4, { [H]: hO }],
		[0, { [H]: _O }],
		[0, { [K]: D }],
		0,
		0,
		[0, { [H]: AA }],
		[0, { [H]: PA }],
		[0, { [H]: IA }],
		[() => bj, { [H]: jA }],
		[() => yj, { [H]: NA }],
		[2, { [H]: MA }],
		[0, { [H]: J }],
		[0, { [H]: DO }],
		[0, { [H]: JO }]
	]
], cM = [
	3,
	Z,
	fp,
	0,
	[
		D,
		N,
		yd,
		Uf,
		Xf,
		$f,
		np,
		nm,
		sg,
		I_,
		gv,
		_v,
		yv,
		qb,
		HT,
		hT,
		CD,
		KT,
		qT,
		JT,
		QT,
		ZT,
		vf,
		I,
		IE,
		dS,
		pS,
		uS,
		oS,
		sS,
		cS,
		j,
		O,
		$p
	],
	[
		[0, 1],
		[0, 1],
		[0, { [H]: mO }],
		[0, { [H]: qf }],
		[0, { [H]: Yf }],
		[0, { [H]: Qf }],
		[0, { [H]: rp }],
		[0, { [H]: em }],
		[4, { [H]: sg }],
		[0, { [H]: Hk }],
		[0, { [H]: Uk }],
		[0, { [H]: Wk }],
		[0, { [H]: Kk }],
		[128, { [LD]: Xk }],
		[0, { [H]: AA }],
		[0, { [H]: DA }],
		[0, { [H]: UA }],
		[0, { [H]: PA }],
		[() => vj, { [H]: FA }],
		[0, { [H]: IA }],
		[() => bj, { [H]: jA }],
		[() => yj, { [H]: NA }],
		[2, { [H]: MA }],
		[0, { [H]: Y }],
		[0, { [H]: LA }],
		[0, { [H]: uA }],
		[5, { [H]: dA }],
		[0, { [H]: lA }],
		[0, { [H]: oA }],
		[1, { [H]: sA }],
		[1, { [H]: cA }],
		[0, { [H]: q }],
		[0, { [H]: DO }],
		[0, { [H]: JO }]
	],
	2
], lM = [
	3,
	Z,
	Bp,
	{ [K]: Vp },
	[
		pm,
		HT,
		QT,
		ZT,
		vf
	],
	[
		[() => dL, { [K]: pm }],
		[0, { [H]: AA }],
		[() => bj, { [H]: jA }],
		[() => yj, { [H]: NA }],
		[2, { [H]: MA }]
	],
	1
], uM = [
	3,
	Z,
	Up,
	0,
	[
		D,
		MT,
		HT,
		QT,
		ZT,
		vf
	],
	[
		[0, 1],
		[0, { [H]: HO }],
		[0, { [H]: AA }],
		[() => bj, { [H]: jA }],
		[() => yj, { [H]: NA }],
		[2, { [H]: MA }]
	],
	1
], dM = [
	3,
	Z,
	Yp,
	0,
	[
		dg,
		um,
		dw,
		Sw,
		ug,
		sw,
		Zd
	],
	[
		0,
		0,
		0,
		0,
		0,
		0,
		2
	]
], fM = [
	3,
	Z,
	Xp,
	0,
	[
		fw,
		dw,
		Sw,
		ug,
		sw
	],
	[
		0,
		0,
		0,
		0,
		0
	]
], pM = [
	3,
	Z,
	xh,
	0,
	[
		Cx,
		mm,
		wD,
		qm
	],
	[
		0,
		1,
		1,
		() => ZM
	]
], mM = [
	3,
	Z,
	Th,
	0,
	[kS, aw],
	[[() => sR, {
		[G]: 1,
		[K]: AS
	}], 2],
	1
], hM = [
	3,
	Z,
	vm,
	0,
	[
		D,
		jv,
		j
	],
	[
		[0, 1],
		[0, { [W]: zD }],
		[0, { [H]: q }]
	],
	2
], gM = [
	3,
	Z,
	bm,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], _M = [
	3,
	Z,
	Sm,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], vM = [
	3,
	Z,
	Em,
	0,
	[
		D,
		jv,
		j
	],
	[
		[0, 1],
		[0, { [W]: zD }],
		[0, { [H]: q }]
	],
	2
], yM = [
	3,
	Z,
	wm,
	0,
	[
		D,
		jv,
		j
	],
	[
		[0, 1],
		[0, { [W]: zD }],
		[0, { [H]: q }]
	],
	2
], bM = [
	3,
	Z,
	Om,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], xM = [
	3,
	Z,
	Am,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], SM = [
	3,
	Z,
	Pm,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], CM = [
	3,
	Z,
	jm,
	0,
	[
		D,
		jv,
		j
	],
	[
		[0, 1],
		[0, { [W]: zD }],
		[0, { [H]: q }]
	],
	2
], wM = [
	3,
	Z,
	Im,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], TM = [
	3,
	Z,
	Rm,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], EM = [
	3,
	Z,
	Bm,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], DM = [
	3,
	Z,
	zm,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], OM = [
	3,
	Z,
	Um,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], kM = [
	3,
	Z,
	Gm,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], AM = [
	3,
	Z,
	ih,
	0,
	[
		N,
		L,
		Qm,
		th
	],
	[
		0,
		0,
		2,
		0
	]
], jM = [
	3,
	Z,
	$m,
	0,
	[
		Gx,
		N,
		L,
		Vv,
		vb
	],
	[
		() => HF,
		0,
		0,
		2,
		4
	]
], MM = [
	3,
	Z,
	eh,
	0,
	[lT],
	[0]
], NM = [
	3,
	Z,
	oh,
	0,
	[DS, F],
	[[0, { [H]: hA }], [0, { [H]: J }]]
], PM = [
	3,
	Z,
	sh,
	0,
	[
		D,
		N,
		Ud,
		L,
		I,
		j,
		tS
	],
	[
		[0, 1],
		[0, 1],
		[0, { [W]: TD }],
		[0, { [W]: lO }],
		[0, { [H]: Y }],
		[0, { [H]: q }],
		[0, { [H]: aA }]
	],
	3
], FM = [
	3,
	Z,
	ch,
	0,
	[
		Qm,
		L,
		F
	],
	[
		[2, { [H]: $O }],
		[0, { [H]: VA }],
		[0, { [H]: J }]
	]
], IM = [
	3,
	Z,
	uh,
	0,
	[
		D,
		N,
		sx,
		L,
		I,
		gf,
		j,
		Hv,
		Wv,
		Gv
	],
	[
		[0, 1],
		[0, 1],
		[0, { [H]: Zk }],
		[0, { [W]: lO }],
		[0, { [H]: Y }],
		[2, { [H]: bO }],
		[0, { [H]: q }],
		[0, { [H]: Yv }],
		[6, { [H]: Jk }],
		[1, { [H]: Yk }]
	],
	2
], LM = [
	3,
	Z,
	lh,
	{ [K]: Sh },
	[
		Eh,
		F,
		rg
	],
	[
		[() => qL, { [G]: 1 }],
		[0, { [H]: J }],
		[() => XL, {
			[G]: 1,
			[K]: jh
		}]
	]
], RM = [
	3,
	Z,
	dh,
	0,
	[
		D,
		Th,
		sx,
		I,
		gf,
		j,
		O
	],
	[
		[0, 1],
		[() => mM, {
			[U]: 1,
			[K]: Th
		}],
		[0, { [H]: Zk }],
		[0, { [H]: Y }],
		[2, { [H]: bO }],
		[0, { [H]: q }],
		[0, { [H]: X }]
	],
	2
], zM = [
	3,
	Z,
	ph,
	0,
	[L],
	[[0, { [H]: VA }]]
], BM = [
	3,
	Z,
	mh,
	0,
	[
		D,
		N,
		L,
		j
	],
	[
		[0, 1],
		[0, 1],
		[0, { [W]: lO }],
		[0, { [H]: q }]
	],
	2
], VM = [
	3,
	Z,
	yh,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], HM = [
	3,
	Z,
	Oh,
	0,
	[
		D,
		hd,
		hT,
		Sd,
		Ph,
		Qw,
		bx
	],
	[
		0,
		0,
		0,
		() => Oj,
		() => GM,
		() => GI,
		() => wF
	],
	1
], UM = [
	3,
	Z,
	Ch,
	0,
	[
		gE,
		hE,
		kE
	],
	[
		0,
		0,
		0
	]
], WM = [
	3,
	Z,
	eg,
	0,
	[
		Xh,
		Fy,
		Ny
	],
	[
		0,
		[() => bj, 0],
		0
	],
	1
], GM = [
	3,
	Z,
	Ph,
	0,
	[Dw],
	[0]
], KM = [
	3,
	Z,
	Rh,
	0,
	[],
	[]
], qM = [
	3,
	Z,
	jh,
	0,
	[
		N,
		L,
		lm,
		xx
	],
	[
		0,
		0,
		0,
		0
	]
], JM = [
	3,
	Z,
	Ih,
	0,
	[Fh, Uh],
	[0, 0]
], YM = [
	3,
	Z,
	Lh,
	0,
	[N],
	[0],
	1
], XM = [
	3,
	Z,
	Nh,
	0,
	[],
	[]
], ZM = [
	3,
	Z,
	Bh,
	0,
	[mm, wD],
	[1, 1]
], QM = [
	3,
	Z,
	Gh,
	0,
	[lT],
	[0],
	1
], $M = [
	3,
	Z,
	pg,
	0,
	[wx, mD],
	[0, 0]
], eN = [
	3,
	Z,
	Dg,
	0,
	[ef],
	[[() => Sj, 16]]
], tN = [
	3,
	Z,
	kg,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], nN = [
	3,
	Z,
	Sg,
	{ [K]: _d },
	[lT, F],
	[0, [0, { [H]: J }]]
], rN = [
	3,
	Z,
	wg,
	0,
	[
		D,
		j,
		I
	],
	[
		[0, 1],
		[0, { [H]: q }],
		[0, { [H]: Y }]
	],
	1
], iN = [
	3,
	Z,
	Og,
	{ [K]: xd },
	[Gx, yg],
	[() => HF, [() => QL, { [K]: vd }]]
], aN = [
	3,
	Z,
	Ag,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], oN = [
	3,
	Z,
	Cg,
	0,
	[Cd],
	[[() => Aj, 16]]
], sN = [
	3,
	Z,
	Tg,
	0,
	[
		D,
		jv,
		j
	],
	[
		[0, 1],
		[0, { [W]: zD }],
		[0, { [H]: q }]
	],
	2
], cN = [
	3,
	Z,
	Ng,
	{ [K]: yp },
	[bp],
	[[() => KL, {
		[G]: 1,
		[K]: xp
	}]]
], lN = [
	3,
	Z,
	Pg,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], uN = [
	3,
	Z,
	Ig,
	0,
	[GT],
	[[() => lL, 16]]
], dN = [
	3,
	Z,
	Lg,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], fN = [
	3,
	Z,
	Hg,
	0,
	[fy],
	[[() => TP, 16]]
], pN = [
	3,
	Z,
	Ug,
	0,
	[
		D,
		jv,
		j
	],
	[
		[0, 1],
		[0, { [W]: zD }],
		[0, { [H]: q }]
	],
	2
], mN = [
	3,
	Z,
	zg,
	0,
	[Nv],
	[[() => DP, 16]]
], hN = [
	3,
	Z,
	Bg,
	0,
	[
		D,
		jv,
		j
	],
	[
		[0, 1],
		[0, { [W]: zD }],
		[0, { [H]: q }]
	],
	2
], gN = [
	3,
	Z,
	Kg,
	{ [K]: ab },
	[sT, SE],
	[[() => rR, {
		[G]: 1,
		[K]: cT
	}], [0, { [H]: BA }]]
], _N = [
	3,
	Z,
	qg,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], vN = [
	3,
	Z,
	Jg,
	{ [K]: ib },
	[ib],
	[0]
], yN = [
	3,
	Z,
	Xg,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], bN = [
	3,
	Z,
	Yg,
	{ [K]: xf },
	[lb],
	[[() => _F, 0]]
], xN = [
	3,
	Z,
	Zg,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], SN = [
	3,
	Z,
	e_,
	0,
	[n_],
	[[() => wN, 16]]
], CN = [
	3,
	Z,
	r_,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], wN = [
	3,
	Z,
	n_,
	0,
	[ex],
	[() => yF],
	1
], TN = [
	3,
	Z,
	s_,
	0,
	[c_],
	[[() => DN, 16]]
], EN = [
	3,
	Z,
	l_,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], DN = [
	3,
	Z,
	c_,
	0,
	[
		mx,
		lT,
		jh
	],
	[
		() => SF,
		0,
		() => JM
	],
	2
], ON = [
	3,
	Z,
	t_,
	0,
	[tx],
	[[() => EF, 16]]
], kN = [
	3,
	Z,
	i_,
	0,
	[
		D,
		jv,
		j
	],
	[
		[0, 1],
		[0, { [W]: zD }],
		[0, { [H]: q }]
	],
	2
], AN = [
	3,
	Z,
	d_,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], jN = [
	3,
	Z,
	p_,
	0,
	[Jx],
	[[() => UF, 16]]
], MN = [
	3,
	Z,
	m_,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], NN = [
	3,
	Z,
	g_,
	0,
	[tw],
	[[0, 16]]
], PN = [
	3,
	Z,
	__,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], FN = [
	3,
	Z,
	y_,
	0,
	[JC],
	[[() => JF, 16]]
], IN = [
	3,
	Z,
	b_,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], LN = [
	3,
	Z,
	S_,
	0,
	[xw],
	[[() => VI, 16]]
], RN = [
	3,
	Z,
	E_,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], zN = [
	3,
	Z,
	w_,
	{ [K]: zw },
	[QC],
	[0]
], BN = [
	3,
	Z,
	T_,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], VN = [
	3,
	Z,
	O_,
	{ [K]: IE },
	[PE],
	[[() => _R, 0]],
	1
], HN = [
	3,
	Z,
	k_,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], UN = [
	3,
	Z,
	j_,
	{ [K]: hD },
	[lT, cx],
	[0, [0, { [K]: ix }]]
], WN = [
	3,
	Z,
	M_,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], GN = [
	3,
	Z,
	P_,
	{ [K]: yD },
	[
		hw,
		Iv,
		Lh,
		Vw
	],
	[
		() => LI,
		() => xP,
		() => YM,
		[() => hR, 0]
	]
], KN = [
	3,
	Z,
	F_,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], qN = [
	3,
	Z,
	B_,
	{ [K]: xd },
	[
		Gx,
		yg,
		F
	],
	[
		() => HF,
		[() => QL, { [K]: vd }],
		[0, { [H]: J }]
	]
], JN = [
	3,
	Z,
	W_,
	0,
	[
		D,
		N,
		L,
		I,
		j
	],
	[
		[0, 1],
		[0, 1],
		[0, { [W]: lO }],
		[0, { [H]: Y }],
		[0, { [H]: q }]
	],
	2
], YN = [
	3,
	Z,
	V_,
	0,
	[
		qd,
		DS,
		vb,
		ap,
		M,
		Wf,
		Gf,
		Kf,
		Np,
		Pp,
		Fp,
		op,
		am,
		om,
		sm,
		$p,
		HT,
		F,
		Yw
	],
	[
		[() => xj, 16],
		[0, { [H]: hA }],
		[4, { [H]: Tb }],
		[1, { [H]: ip }],
		[0, { [H]: M }],
		[0, { [H]: OO }],
		[0, { [H]: kO }],
		[0, { [H]: AO }],
		[0, { [H]: PO }],
		[0, { [H]: FO }],
		[0, { [H]: IO }],
		[0, { [H]: jO }],
		[0, { [H]: XO }],
		[0, { [H]: ZO }],
		[0, { [H]: QO }],
		[0, { [H]: JO }],
		[0, { [H]: AA }],
		[0, { [H]: J }],
		[0, { [H]: bA }]
	]
], XN = [
	3,
	Z,
	G_,
	0,
	[
		D,
		N,
		Ud,
		L,
		I,
		j,
		hp
	],
	[
		[0, 1],
		[0, 1],
		[0, { [W]: TD }],
		[0, { [W]: lO }],
		[0, { [H]: Y }],
		[0, { [H]: q }],
		[0, { [H]: MO }]
	],
	3
], ZN = [
	3,
	Z,
	H_,
	{ [K]: K_ },
	[
		Qm,
		vb,
		L,
		F,
		M,
		Nf,
		yS,
		hT,
		xS
	],
	[
		[2, { [H]: $O }],
		[4, { [H]: Tb }],
		[0, { [H]: VA }],
		[0, { [H]: J }],
		0,
		() => Hj,
		[() => QN, 0],
		0,
		1
	]
], QN = [
	3,
	Z,
	U_,
	0,
	[
		ME,
		CC,
		Px,
		fx,
		uy,
		YC
	],
	[
		[1, { [K]: _C }],
		0,
		0,
		1,
		2,
		[() => fR, {
			[G]: 1,
			[K]: XC
		}]
	]
], $N = [
	3,
	Z,
	q_,
	0,
	[
		D,
		N,
		Kx,
		L,
		fx,
		CC,
		KT,
		qT,
		JT,
		I,
		j
	],
	[
		[0, 1],
		[0, 1],
		[64, { [H]: rA }],
		[0, { [W]: lO }],
		[1, { [H]: tA }],
		[0, { [H]: gA }],
		[0, { [H]: PA }],
		[() => vj, { [H]: FA }],
		[0, { [H]: IA }],
		[0, { [H]: Y }],
		[0, { [H]: q }]
	],
	3
], eP = [
	3,
	Z,
	ev,
	0,
	[hb],
	[[() => FF, {
		[U]: 1,
		[K]: hb
	}]]
], tP = [
	3,
	Z,
	tv,
	0,
	[
		D,
		N,
		L,
		I,
		j
	],
	[
		[0, 1],
		[0, 1],
		[0, { [W]: lO }],
		[0, { [H]: Y }],
		[0, { [H]: q }]
	],
	2
], nP = [
	3,
	Z,
	Z_,
	0,
	[rS],
	[[() => PF, 16]]
], rP = [
	3,
	Z,
	Q_,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], iP = [
	3,
	Z,
	nv,
	0,
	[
		jf,
		Qm,
		Qd,
		og,
		rT,
		vb,
		ap,
		M,
		Wf,
		Gf,
		Kf,
		Np,
		Pp,
		Fp,
		op,
		am,
		om,
		sm,
		$p,
		ux,
		L,
		Uf,
		Xf,
		$f,
		np,
		kp,
		nm,
		sg,
		Kh,
		CD,
		HT,
		qb,
		KT,
		JT,
		QT,
		vf,
		hT,
		F,
		Yw,
		_C,
		_E,
		dS,
		pS,
		uS,
		oS,
		sS,
		cS
	],
	[
		[() => xj, 16],
		[2, { [H]: $O }],
		[0, { [H]: DD }],
		[0, { [H]: ek }],
		[0, { [H]: _A }],
		[4, { [H]: Tb }],
		[1, { [H]: ip }],
		[0, { [H]: M }],
		[0, { [H]: OO }],
		[0, { [H]: kO }],
		[0, { [H]: AO }],
		[0, { [H]: PO }],
		[0, { [H]: FO }],
		[0, { [H]: IO }],
		[0, { [H]: jO }],
		[0, { [H]: XO }],
		[0, { [H]: ZO }],
		[0, { [H]: QO }],
		[0, { [H]: JO }],
		[1, { [H]: $k }],
		[0, { [H]: VA }],
		[0, { [H]: qf }],
		[0, { [H]: Yf }],
		[0, { [H]: Qf }],
		[0, { [H]: rp }],
		[0, { [H]: jp }],
		[0, { [H]: em }],
		[4, { [H]: sg }],
		[0, { [H]: Kh }],
		[0, { [H]: UA }],
		[0, { [H]: AA }],
		[128, { [LD]: Xk }],
		[0, { [H]: PA }],
		[0, { [H]: IA }],
		[() => bj, { [H]: jA }],
		[2, { [H]: MA }],
		[0, { [H]: DA }],
		[0, { [H]: J }],
		[0, { [H]: bA }],
		[1, { [H]: nA }],
		[1, { [H]: RA }],
		[0, { [H]: uA }],
		[5, { [H]: dA }],
		[0, { [H]: lA }],
		[0, { [H]: oA }],
		[1, { [H]: sA }],
		[1, { [H]: cA }]
	]
], aP = [
	3,
	Z,
	rv,
	0,
	[
		D,
		N,
		Hv,
		qv,
		Xv,
		vy,
		nT,
		gw,
		_w,
		vw,
		yw,
		bw,
		Cw,
		L,
		KT,
		qT,
		JT,
		I,
		SC,
		j,
		hp
	],
	[
		[0, 1],
		[0, 1],
		[0, { [H]: Yv }],
		[4, { [H]: Kv }],
		[0, { [H]: Zv }],
		[4, { [H]: yy }],
		[0, { [H]: nT }],
		[0, { [W]: QD }],
		[0, { [W]: $D }],
		[0, { [W]: eO }],
		[0, { [W]: tO }],
		[0, { [W]: nO }],
		[6, { [W]: rO }],
		[0, { [W]: lO }],
		[0, { [H]: PA }],
		[() => vj, { [H]: FA }],
		[0, { [H]: IA }],
		[0, { [H]: Y }],
		[1, { [W]: XD }],
		[0, { [H]: q }],
		[0, { [H]: MO }]
	],
	2
], oP = [
	3,
	Z,
	iv,
	0,
	[oT],
	[[() => IF, {
		[U]: 1,
		[K]: oT
	}]]
], sP = [
	3,
	Z,
	av,
	0,
	[
		D,
		N,
		L,
		I,
		j
	],
	[
		[0, 1],
		[0, 1],
		[0, { [W]: lO }],
		[0, { [H]: Y }],
		[0, { [H]: q }]
	],
	2
], cP = [
	3,
	Z,
	cv,
	{ [K]: IE },
	[PE, L],
	[[() => _R, 0], [0, { [H]: VA }]],
	1
], lP = [
	3,
	Z,
	uv,
	0,
	[
		D,
		N,
		L,
		j,
		I
	],
	[
		[0, 1],
		[0, 1],
		[0, { [W]: lO }],
		[0, { [H]: q }],
		[0, { [H]: Y }]
	],
	2
], uP = [
	3,
	Z,
	lv,
	0,
	[jf, F],
	[[() => xj, 16], [0, { [H]: J }]]
], dP = [
	3,
	Z,
	dv,
	0,
	[
		D,
		N,
		I,
		j
	],
	[
		[0, 1],
		[0, 1],
		[0, { [H]: Y }],
		[0, { [H]: q }]
	],
	2
], fP = [
	3,
	Z,
	mv,
	0,
	[jS],
	[[() => ZF, 16]]
], pP = [
	3,
	Z,
	hv,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], mP = [
	3,
	Z,
	L_,
	0,
	[LE],
	[0],
	1
], hP = [
	3,
	Z,
	bv,
	0,
	[xv, ew],
	[[() => gP, { [pO]: [dO, RD] }], 0]
], gP = [
	3,
	Z,
	xv,
	0,
	[
		GE,
		rh,
		Mh,
		Fv,
		fD
	],
	[
		[0, {
			[fO]: 1,
			[K]: WA
		}],
		0,
		0,
		0,
		0
	],
	1
], _P = [
	3,
	Z,
	Cv,
	0,
	[
		df,
		Sf,
		bf,
		Of,
		Jd
	],
	[
		[0, { [H]: yO }],
		[0, { [H]: SO }],
		[0, { [H]: xO }],
		[0, { [H]: EO }],
		[2, { [H]: gO }]
	]
], vP = [
	3,
	Z,
	wv,
	0,
	[D, j],
	[[0, 1], [0, { [H]: q }]],
	1
], yP = [
	3,
	Z,
	Ov,
	0,
	[
		Qm,
		Qd,
		og,
		rT,
		rf,
		vb,
		ap,
		Wf,
		Gf,
		Kf,
		Np,
		Pp,
		Fp,
		op,
		am,
		om,
		sm,
		$p,
		M,
		ux,
		L,
		Uf,
		Xf,
		$f,
		np,
		nm,
		kp,
		sg,
		Kh,
		CD,
		HT,
		qb,
		KT,
		JT,
		QT,
		vf,
		hT,
		F,
		Yw,
		_C,
		_E,
		dS,
		pS,
		uS,
		oS,
		sS,
		cS
	],
	[
		[2, { [H]: $O }],
		[0, { [H]: DD }],
		[0, { [H]: ek }],
		[0, { [H]: _A }],
		[0, { [H]: vO }],
		[4, { [H]: Tb }],
		[1, { [H]: ip }],
		[0, { [H]: OO }],
		[0, { [H]: kO }],
		[0, { [H]: AO }],
		[0, { [H]: PO }],
		[0, { [H]: FO }],
		[0, { [H]: IO }],
		[0, { [H]: jO }],
		[0, { [H]: XO }],
		[0, { [H]: ZO }],
		[0, { [H]: QO }],
		[0, { [H]: JO }],
		[0, { [H]: M }],
		[1, { [H]: $k }],
		[0, { [H]: VA }],
		[0, { [H]: qf }],
		[0, { [H]: Yf }],
		[0, { [H]: Qf }],
		[0, { [H]: rp }],
		[0, { [H]: em }],
		[0, { [H]: jp }],
		[4, { [H]: sg }],
		[0, { [H]: Kh }],
		[0, { [H]: UA }],
		[0, { [H]: AA }],
		[128, { [LD]: Xk }],
		[0, { [H]: PA }],
		[0, { [H]: IA }],
		[() => bj, { [H]: jA }],
		[2, { [H]: MA }],
		[0, { [H]: DA }],
		[0, { [H]: J }],
		[0, { [H]: bA }],
		[1, { [H]: nA }],
		[1, { [H]: RA }],
		[0, { [H]: uA }],
		[5, { [H]: dA }],
		[0, { [H]: lA }],
		[0, { [H]: oA }],
		[1, { [H]: sA }],
		[1, { [H]: cA }]
	]
], bP = [
	3,
	Z,
	kv,
	0,
	[
		D,
		N,
		Hv,
		qv,
		Xv,
		vy,
		nT,
		gw,
		_w,
		vw,
		yw,
		bw,
		Cw,
		L,
		KT,
		qT,
		JT,
		I,
		SC,
		j,
		hp
	],
	[
		[0, 1],
		[0, 1],
		[0, { [H]: Yv }],
		[4, { [H]: Kv }],
		[0, { [H]: Zv }],
		[4, { [H]: yy }],
		[0, { [H]: nT }],
		[0, { [W]: QD }],
		[0, { [W]: $D }],
		[0, { [W]: eO }],
		[0, { [W]: tO }],
		[0, { [W]: nO }],
		[6, { [W]: rO }],
		[0, { [W]: lO }],
		[0, { [H]: PA }],
		[() => vj, { [H]: FA }],
		[0, { [H]: IA }],
		[0, { [H]: Y }],
		[1, { [W]: XD }],
		[0, { [H]: q }],
		[0, { [H]: MO }]
	],
	2
], xP = [
	3,
	Z,
	Iv,
	0,
	[uE],
	[0],
	1
], SP = [
	3,
	Z,
	xy,
	0,
	[Fv, rh],
	[0, 0]
], CP = [
	3,
	Z,
	sy,
	0,
	[
		qp,
		rm,
		Cy,
		ZC
	],
	[
		() => dM,
		0,
		() => zP,
		() => GF
	]
], wP = [
	3,
	Z,
	dy,
	0,
	[P, dE],
	[0, [() => _R, {
		[G]: 1,
		[K]: FE
	}]]
], TP = [
	3,
	Z,
	fy,
	0,
	[
		jv,
		lT,
		RE,
		lg
	],
	[
		0,
		0,
		[() => yR, {
			[G]: 1,
			[K]: zE
		}],
		[() => EP, 0]
	],
	3
], EP = [
	3,
	Z,
	_y,
	0,
	[
		P,
		FE,
		lf
	],
	[
		0,
		() => SL,
		[() => wP, 0]
	]
], DP = [
	3,
	Z,
	Nv,
	0,
	[
		Oh,
		Rv,
		jv,
		ey,
		oE,
		lg,
		Qx
	],
	[
		[() => OP, 0],
		2,
		0,
		0,
		() => MP,
		() => AP,
		[() => tR, 0]
	],
	5
], OP = [
	3,
	Z,
	Lv,
	0,
	[mT],
	[[() => jP, 0]],
	1
], kP = [
	3,
	Z,
	zv,
	0,
	[tE, YT],
	[[() => _L, { [K]: BT }], [() => mL, { [K]: DT }]]
], AP = [
	3,
	Z,
	Bv,
	0,
	[P],
	[0],
	1
], jP = [
	3,
	Z,
	cy,
	0,
	[
		D,
		_g,
		Nd,
		P,
		eg
	],
	[
		0,
		0,
		0,
		0,
		[() => kP, 0]
	],
	2
], MP = [
	3,
	Z,
	ly,
	0,
	[vg],
	[0],
	1
], NP = [
	3,
	Z,
	gy,
	0,
	[Mp, Ph],
	[0, () => CF],
	1
], PP = [
	3,
	Z,
	my,
	0,
	[
		Mp,
		NE,
		jh,
		OE,
		fE
	],
	[
		0,
		0,
		() => JM,
		0,
		0
	],
	1
], FP = [
	3,
	Z,
	hy,
	0,
	[Mp, Ph],
	[0, () => CF],
	1
], IP = [
	3,
	Z,
	Ey,
	0,
	[Tw, Ph],
	[() => PI, () => CF],
	1
], LP = [
	3,
	Z,
	Dy,
	0,
	[
		NE,
		OE,
		Tw,
		jh,
		fE
	],
	[
		0,
		0,
		() => PI,
		() => JM,
		0
	],
	3
], RP = [
	3,
	Z,
	Oy,
	0,
	[Tw],
	[() => PI],
	1
], zP = [
	3,
	Z,
	wy,
	0,
	[GE],
	[0]
], BP = [
	3,
	Z,
	Ty,
	0,
	[Sw],
	[0]
], VP = [
	3,
	Z,
	fb,
	0,
	[
		db,
		ig,
		jv,
		lg
	],
	[
		[0, { [K]: ep }],
		[64, {
			[G]: 1,
			[K]: ag
		}],
		0,
		[() => jF, 0]
	],
	2
], HP = [
	3,
	Z,
	ub,
	0,
	[
		wh,
		mm,
		Wh
	],
	[
		5,
		1,
		2
	]
], UP = [
	3,
	Z,
	Hb,
	0,
	[
		lT,
		og,
		Fv,
		P,
		lg,
		UE,
		Hx,
		Bx,
		Pd
	],
	[
		0,
		() => HP,
		0,
		0,
		[() => GP, 0],
		[() => xR, {
			[G]: 1,
			[K]: WE
		}],
		[() => oR, {
			[G]: 1,
			[K]: Wx
		}],
		() => OF,
		() => Cj
	],
	1
], WP = [
	3,
	Z,
	Ub,
	0,
	[
		P,
		dE,
		SS,
		CS
	],
	[
		0,
		[() => _R, {
			[G]: 1,
			[K]: FE
		}],
		1,
		1
	]
], GP = [
	3,
	Z,
	Wb,
	0,
	[
		P,
		FE,
		SS,
		CS,
		lf
	],
	[
		0,
		() => SL,
		1,
		1,
		[() => WP, 0]
	]
], KP = [
	3,
	Z,
	Uy,
	{ [K]: Wy },
	[
		uy,
		im,
		Dx,
		bd
	],
	[
		2,
		0,
		0,
		[() => VL, {
			[G]: 1,
			[K]: Cd
		}]
	]
], qP = [
	3,
	Z,
	Gy,
	0,
	[
		D,
		im,
		j
	],
	[
		[0, 1],
		[0, { [W]: kD }],
		[0, { [H]: q }]
	],
	1
], JP = [
	3,
	Z,
	Xy,
	0,
	[
		uy,
		im,
		Dx,
		py
	],
	[
		2,
		0,
		0,
		[() => $L, {
			[G]: 1,
			[K]: fy
		}]
	]
], YP = [
	3,
	Z,
	Zy,
	0,
	[
		D,
		im,
		j
	],
	[
		[0, 1],
		[0, { [W]: kD }],
		[0, { [H]: q }]
	],
	1
], XP = [
	3,
	Z,
	qy,
	{ [K]: _b },
	[
		im,
		Pv,
		uy,
		Dx
	],
	[
		0,
		[() => eR, {
			[G]: 1,
			[K]: Nv
		}],
		2,
		0
	]
], ZP = [
	3,
	Z,
	Jy,
	0,
	[
		D,
		im,
		j
	],
	[
		[0, 1],
		[0, { [W]: kD }],
		[0, { [H]: q }]
	],
	1
], QP = [
	3,
	Z,
	$y,
	{ [K]: yb },
	[
		uy,
		im,
		Dx,
		$b
	],
	[
		2,
		0,
		0,
		[() => iR, {
			[G]: 1,
			[K]: tx
		}]
	]
], $P = [
	3,
	Z,
	eb,
	0,
	[
		D,
		im,
		j
	],
	[
		[0, 1],
		[0, { [W]: kD }],
		[0, { [H]: q }]
	],
	1
], eF = [
	3,
	Z,
	tb,
	{ [K]: zy },
	[
		Mf,
		Gx,
		im,
		P
	],
	[
		[() => UL, 0],
		() => HF,
		0,
		0
	]
], tF = [
	3,
	Z,
	nb,
	0,
	[
		Zb,
		im,
		P,
		Of
	],
	[
		[1, { [W]: WD }],
		[0, { [W]: kD }],
		[0, { [W]: YD }],
		[0, { [W]: OD }]
	]
], nF = [
	3,
	Z,
	sb,
	{ [K]: By },
	[Mf, im],
	[[() => UL, 0], 0]
], rF = [
	3,
	Z,
	cb,
	0,
	[im, rx],
	[[0, { [W]: kD }], [1, { [W]: GD }]]
], iF = [
	3,
	Z,
	Sb,
	{ [K]: Cb },
	[
		D,
		My,
		eD,
		jx,
		P,
		Dh,
		zx,
		vx,
		uy,
		KE,
		Op,
		Zh,
		F
	],
	[
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		1,
		2,
		[() => aR, {
			[G]: 1,
			[K]: pD
		}],
		[() => WL, { [G]: 1 }],
		0,
		[0, { [H]: J }]
	]
], aF = [
	3,
	Z,
	wb,
	0,
	[
		D,
		Dh,
		Zh,
		My,
		vx,
		P,
		eD,
		j,
		I
	],
	[
		[0, 1],
		[0, { [W]: AD }],
		[0, { [W]: ND }],
		[0, { [W]: VD }],
		[1, { [W]: JD }],
		[0, { [W]: YD }],
		[0, { [W]: cO }],
		[0, { [H]: q }],
		[0, { [H]: Y }]
	],
	1
], oF = [
	3,
	Z,
	Ob,
	0,
	[
		uf,
		D,
		N,
		DS,
		Xd,
		Yb,
		wd,
		im,
		Dx,
		F
	],
	[
		[() => HL, 0],
		0,
		0,
		[0, { [H]: hA }],
		0,
		1,
		1,
		0,
		0,
		[0, { [H]: J }]
	]
], sF = [
	3,
	Z,
	kb,
	0,
	[
		D,
		N,
		L,
		Yb,
		Xd,
		im,
		I,
		j
	],
	[
		[0, 1],
		[0, 1],
		[0, { [W]: lO }],
		[1, { [W]: UD }],
		[0, { [W]: ED }],
		[0, { [W]: kD }],
		[0, { [H]: Y }],
		[0, { [H]: q }]
	],
	2
], cF = [
	3,
	Z,
	Ab,
	{ [K]: rb },
	[
		uy,
		yx,
		Mx,
		dm,
		wx,
		P,
		Dh,
		lx,
		Op,
		Zh,
		F
	],
	[
		2,
		0,
		0,
		[() => cR, { [G]: 1 }],
		0,
		0,
		0,
		1,
		[() => WL, { [G]: 1 }],
		0,
		[0, { [H]: J }]
	]
], lF = [
	3,
	Z,
	jb,
	0,
	[
		D,
		Dh,
		Zh,
		yx,
		lx,
		P,
		I,
		j,
		vS
	],
	[
		[0, 1],
		[0, { [W]: AD }],
		[0, { [W]: ND }],
		[0, { [W]: HD }],
		[1, { [W]: KD }],
		[0, { [W]: YD }],
		[0, { [H]: Y }],
		[0, { [H]: q }],
		[64, { [H]: pA }]
	],
	1
], uF = [
	3,
	Z,
	Nb,
	{ [K]: rb },
	[
		uy,
		dm,
		wx,
		P,
		Dh,
		lx,
		Op,
		Zh,
		ky,
		im,
		Dx,
		uT,
		F
	],
	[
		2,
		[() => cR, { [G]: 1 }],
		0,
		0,
		0,
		1,
		[() => WL, { [G]: 1 }],
		0,
		1,
		0,
		0,
		0,
		[0, { [H]: J }]
	]
], dF = [
	3,
	Z,
	Fb,
	0,
	[
		D,
		Dh,
		Zh,
		lx,
		P,
		im,
		fg,
		uT,
		I,
		j,
		vS
	],
	[
		[0, 1],
		[0, { [W]: AD }],
		[0, { [W]: ND }],
		[1, { [W]: KD }],
		[0, { [W]: YD }],
		[0, { [W]: kD }],
		[2, { [W]: PD }],
		[0, { [W]: aO }],
		[0, { [H]: Y }],
		[0, { [H]: q }],
		[64, { [H]: pA }]
	],
	1
], fF = [
	3,
	Z,
	Pb,
	{ [K]: Kb },
	[
		uy,
		My,
		gD,
		jx,
		Vx,
		_D,
		nh,
		wx,
		P,
		Dh,
		lx,
		Op,
		Zh,
		F
	],
	[
		2,
		0,
		0,
		0,
		0,
		[() => lR, {
			[G]: 1,
			[K]: vD
		}],
		[() => JL, {
			[G]: 1,
			[K]: Qm
		}],
		0,
		0,
		0,
		1,
		[() => WL, { [G]: 1 }],
		0,
		[0, { [H]: J }]
	]
], pF = [
	3,
	Z,
	Ib,
	0,
	[
		D,
		Dh,
		Zh,
		My,
		lx,
		P,
		gD,
		j,
		I,
		vS
	],
	[
		[0, 1],
		[0, { [W]: AD }],
		[0, { [W]: ND }],
		[0, { [W]: VD }],
		[1, { [W]: KD }],
		[0, { [W]: YD }],
		[0, { [W]: uO }],
		[0, { [H]: q }],
		[0, { [H]: Y }],
		[64, { [H]: pA }]
	],
	1
], mF = [
	3,
	Z,
	zb,
	{ [K]: Bb },
	[
		Ed,
		$d,
		D,
		N,
		$E,
		CC,
		Px,
		fx,
		uy,
		YC,
		xy,
		Gx,
		hT,
		F,
		O,
		$p
	],
	[
		[4, { [H]: hO }],
		[0, { [H]: _O }],
		0,
		0,
		0,
		0,
		0,
		1,
		2,
		[() => dR, {
			[G]: 1,
			[K]: XC
		}],
		() => SP,
		() => HF,
		0,
		[0, { [H]: J }],
		0,
		0
	]
], hF = [
	3,
	Z,
	Vb,
	0,
	[
		D,
		N,
		$E,
		fx,
		CC,
		I,
		j,
		KT,
		qT,
		JT
	],
	[
		[0, 1],
		[0, 1],
		[0, { [W]: sO }],
		[1, { [W]: qD }],
		[0, { [W]: ZD }],
		[0, { [H]: Y }],
		[0, { [H]: q }],
		[0, { [H]: PA }],
		[() => vj, { [H]: FA }],
		[0, { [H]: IA }]
	],
	3
], gF = [
	3,
	Z,
	gb,
	0,
	[GE, wx],
	[0, 0]
], _F = [
	3,
	Z,
	lb,
	0,
	[
		mE,
		jE,
		CE,
		AE
	],
	[
		0,
		0,
		[() => vR, 0],
		[() => TL, 0]
	],
	2
], vF = [
	3,
	Z,
	Qb,
	0,
	[
		Ey,
		gy,
		of
	],
	[
		() => IP,
		() => NP,
		() => Pj
	],
	1
], yF = [
	3,
	Z,
	ex,
	0,
	[
		Ch,
		Dy,
		my,
		sf
	],
	[
		() => UM,
		() => LP,
		() => PP,
		() => Fj
	],
	1
], bF = [
	3,
	Z,
	ax,
	0,
	[wx, mD],
	[0, 0]
], xF = [
	3,
	Z,
	px,
	0,
	[rE],
	[() => nL],
	1
], SF = [
	3,
	Z,
	mx,
	0,
	[iE],
	[() => rL],
	1
], CF = [
	3,
	Z,
	hx,
	0,
	[fT, jy],
	[0, 0],
	1
], wF = [
	3,
	Z,
	bx,
	0,
	[lT, Qh],
	[0, () => KI],
	1
], TF = [
	3,
	Z,
	Jb,
	0,
	[
		P,
		dE,
		Yd
	],
	[
		0,
		[() => _R, {
			[G]: 1,
			[K]: FE
		}],
		0
	]
], EF = [
	3,
	Z,
	tx,
	0,
	[jv, lg],
	[0, [() => wR, 0]],
	1
], DF = [
	3,
	Z,
	gx,
	0,
	[
		$E,
		N,
		Sy,
		hT,
		Gx,
		xy,
		O,
		$p
	],
	[
		0,
		0,
		4,
		0,
		() => HF,
		() => SP,
		0,
		0
	]
], OF = [
	3,
	Z,
	Bx,
	0,
	[Ox, Nx],
	[1, 1]
], kF = [
	3,
	Z,
	Wx,
	0,
	[
		Ox,
		hT,
		Nx
	],
	[
		1,
		0,
		1
	]
], AF = [
	3,
	Z,
	Tx,
	0,
	[
		yE,
		lw,
		mb,
		Nh
	],
	[
		[() => bR, {
			[G]: 1,
			[K]: bE
		}],
		[() => pR, {
			[G]: 1,
			[K]: uw
		}],
		[() => nR, {
			[G]: 1,
			[K]: tp
		}],
		() => XM
	]
], jF = [
	3,
	Z,
	Ex,
	0,
	[N],
	[[() => eL, { [K]: AT }]]
], MF = [
	3,
	Z,
	AS,
	0,
	[
		N,
		vb,
		M,
		O,
		$p,
		sE,
		hT,
		Gx,
		Xw
	],
	[
		0,
		4,
		0,
		[64, { [G]: 1 }],
		0,
		1,
		0,
		() => HF,
		() => QI
	]
], NF = [
	3,
	Z,
	$x,
	0,
	[
		N,
		L,
		M,
		bb,
		sE
	],
	[
		0,
		0,
		0,
		6,
		1
	],
	1
], PF = [
	3,
	Z,
	rS,
	0,
	[iS, cT],
	[0, () => LF]
], FF = [
	3,
	Z,
	lS,
	0,
	[lT],
	[0]
], IF = [
	3,
	Z,
	fS,
	0,
	[
		Cx,
		tT,
		Vh,
		Bh
	],
	[
		0,
		5,
		0,
		() => ZM
	]
], LF = [
	3,
	Z,
	mS,
	0,
	[xh],
	[() => pM]
], RF = [
	3,
	Z,
	bS,
	0,
	[
		SC,
		sE,
		Wf,
		Gf,
		Kf,
		Np,
		Pp,
		Fp,
		op,
		am,
		om,
		sm
	],
	[
		1,
		1,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0
	]
], zF = [
	3,
	Z,
	ES,
	0,
	[
		M,
		O,
		$p,
		sE,
		hT,
		N,
		L,
		Vv,
		vb,
		Gx,
		Xw
	],
	[
		0,
		[64, { [G]: 1 }],
		0,
		1,
		0,
		0,
		0,
		2,
		4,
		() => HF,
		() => QI
	]
], BF = [
	3,
	Z,
	nS,
	0,
	[aE],
	[[() => tL, 0]]
], VF = [
	3,
	Z,
	TS,
	0,
	[qp, Cy],
	[() => fM, () => BP]
], HF = [
	3,
	Z,
	Gx,
	0,
	[rh, Fv],
	[0, 0]
], UF = [
	3,
	Z,
	Jx,
	0,
	[sT],
	[[() => uR, {
		[G]: 1,
		[K]: cT
	}]],
	1
], WF = [
	3,
	Z,
	Yx,
	0,
	[_S],
	[0],
	1
], GF = [
	3,
	Z,
	bC,
	0,
	[],
	[]
], KF = [
	3,
	Z,
	XC,
	0,
	[
		SC,
		vb,
		M,
		sE,
		Wf,
		Gf,
		Kf,
		Np,
		Pp,
		Fp,
		op,
		am,
		om,
		sm
	],
	[
		1,
		4,
		0,
		1,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0
	]
], qF = [
	3,
	Z,
	GC,
	{ [K]: GC },
	[vC],
	[0]
], JF = [
	3,
	Z,
	JC,
	0,
	[iy],
	[[2, { [K]: iy }]]
], YF = [
	3,
	Z,
	nw,
	0,
	[
		Af,
		Tf,
		kf
	],
	[
		1,
		1,
		1
	]
], XF = [
	3,
	Z,
	yC,
	0,
	[Ah],
	[[() => YF, { [jD]: 1 }]]
], ZF = [
	3,
	Z,
	jS,
	0,
	[
		Ef,
		ny,
		Df,
		Rw
	],
	[
		[2, { [K]: Ef }],
		[2, { [K]: ny }],
		[2, { [K]: Df }],
		[2, { [K]: Rw }]
	]
], QF = [
	3,
	Z,
	LS,
	0,
	[
		D,
		ef,
		A,
		O,
		j
	],
	[
		[0, 1],
		[() => Sj, {
			[U]: 1,
			[K]: ef
		}],
		[0, { [H]: k }],
		[0, { [H]: X }],
		[0, { [H]: q }]
	],
	2
], $F = [
	3,
	Z,
	PS,
	0,
	[
		D,
		_d,
		j,
		O
	],
	[
		[0, 1],
		[() => Ej, {
			[U]: 1,
			[K]: _d
		}],
		[0, { [H]: q }],
		[0, { [H]: X }]
	],
	2
], eI = [
	3,
	Z,
	RS,
	0,
	[
		D,
		yd,
		xd,
		A,
		O,
		I_,
		gv,
		_v,
		vv,
		yv,
		j
	],
	[
		[0, 1],
		[0, { [H]: mO }],
		[() => Dj, {
			[U]: 1,
			[K]: xd
		}],
		[0, { [H]: k }],
		[0, { [H]: X }],
		[0, { [H]: Hk }],
		[0, { [H]: Uk }],
		[0, { [H]: Wk }],
		[0, { [H]: Gk }],
		[0, { [H]: Kk }],
		[0, { [H]: q }]
	],
	1
], tI = [
	3,
	Z,
	FS,
	0,
	[
		D,
		jv,
		Cd,
		j
	],
	[
		[0, 1],
		[0, { [W]: zD }],
		[() => Aj, {
			[U]: 1,
			[K]: Cd
		}],
		[0, { [H]: q }]
	],
	3
], nI = [
	3,
	Z,
	VS,
	0,
	[
		D,
		yp,
		A,
		O,
		j
	],
	[
		[0, 1],
		[() => eM, {
			[U]: 1,
			[K]: yp
		}],
		[0, { [H]: k }],
		[0, { [H]: X }],
		[0, { [H]: q }]
	],
	2
], rI = [
	3,
	Z,
	US,
	0,
	[
		D,
		GT,
		A,
		O,
		j
	],
	[
		[0, 1],
		[() => lL, {
			[U]: 1,
			[K]: GT
		}],
		[0, { [H]: k }],
		[0, { [H]: X }],
		[0, { [H]: q }]
	],
	2
], iI = [
	3,
	Z,
	qS,
	0,
	[
		D,
		jv,
		fy,
		j
	],
	[
		[0, 1],
		[0, { [W]: zD }],
		[() => TP, {
			[U]: 1,
			[K]: fy
		}],
		[0, { [H]: q }]
	],
	3
], aI = [
	3,
	Z,
	GS,
	0,
	[
		D,
		jv,
		Nv,
		j
	],
	[
		[0, 1],
		[0, { [W]: zD }],
		[() => DP, {
			[U]: 1,
			[K]: Nv
		}],
		[0, { [H]: q }]
	],
	3
], oI = [
	3,
	Z,
	XS,
	0,
	[SE],
	[[0, { [H]: BA }]]
], sI = [
	3,
	Z,
	ZS,
	0,
	[
		D,
		O,
		ab,
		j,
		SE
	],
	[
		[0, 1],
		[0, { [H]: X }],
		[() => Bj, {
			[U]: 1,
			[K]: ab
		}],
		[0, { [H]: q }],
		[0, { [H]: BA }]
	],
	1
], cI = [
	3,
	Z,
	QS,
	0,
	[
		D,
		xf,
		A,
		O,
		j
	],
	[
		[0, 1],
		[() => Vj, {
			[U]: 1,
			[K]: xf
		}],
		[0, { [H]: k }],
		[0, { [H]: X }],
		[0, { [H]: q }]
	],
	2
], lI = [
	3,
	Z,
	eC,
	0,
	[
		D,
		jv,
		tx,
		j
	],
	[
		[0, 1],
		[0, { [W]: zD }],
		[() => EF, {
			[U]: 1,
			[K]: tx
		}],
		[0, { [H]: q }]
	],
	3
], uI = [
	3,
	Z,
	nC,
	0,
	[
		D,
		Tx,
		j,
		xT
	],
	[
		[0, 1],
		[() => AF, {
			[U]: 1,
			[K]: Tx
		}],
		[0, { [H]: q }],
		[2, { [H]: OA }]
	],
	2
], dI = [
	3,
	Z,
	iC,
	0,
	[
		D,
		Jx,
		A,
		j,
		O
	],
	[
		[0, 1],
		[() => UF, {
			[U]: 1,
			[K]: Jx
		}],
		[0, { [H]: k }],
		[0, { [H]: q }],
		[0, { [H]: X }]
	],
	2
], fI = [
	3,
	Z,
	oC,
	0,
	[
		D,
		tw,
		A,
		O,
		Ap,
		j
	],
	[
		[0, 1],
		[0, 16],
		[0, { [H]: k }],
		[0, { [H]: X }],
		[2, { [H]: NO }],
		[0, { [H]: q }]
	],
	2
], pI = [
	3,
	Z,
	uC,
	0,
	[
		D,
		xw,
		A,
		O,
		VE,
		j
	],
	[
		[0, 1],
		[() => VI, {
			[U]: 1,
			[K]: xw
		}],
		[0, { [H]: k }],
		[0, { [H]: X }],
		[0, { [H]: TO }],
		[0, { [H]: q }]
	],
	2
], mI = [
	3,
	Z,
	lC,
	0,
	[
		D,
		zw,
		A,
		O,
		j
	],
	[
		[0, 1],
		[() => qI, {
			[U]: 1,
			[K]: zw
		}],
		[0, { [H]: k }],
		[0, { [H]: X }],
		[0, { [H]: q }]
	],
	2
], hI = [
	3,
	Z,
	fC,
	0,
	[
		D,
		IE,
		A,
		O,
		j
	],
	[
		[0, 1],
		[() => CL, {
			[U]: 1,
			[K]: IE
		}],
		[0, { [H]: k }],
		[0, { [H]: X }],
		[0, { [H]: q }]
	],
	2
], gI = [
	3,
	Z,
	mC,
	0,
	[
		D,
		hD,
		A,
		O,
		sx,
		j
	],
	[
		[0, 1],
		[() => RL, {
			[U]: 1,
			[K]: hD
		}],
		[0, { [H]: k }],
		[0, { [H]: X }],
		[0, { [H]: Zk }],
		[0, { [H]: q }]
	],
	2
], _I = [
	3,
	Z,
	gC,
	0,
	[
		D,
		yD,
		A,
		O,
		j
	],
	[
		[0, 1],
		[() => zL, {
			[U]: 1,
			[K]: yD
		}],
		[0, { [H]: k }],
		[0, { [H]: X }],
		[0, { [H]: q }]
	],
	2
], vI = [
	3,
	Z,
	EC,
	0,
	[F],
	[[0, { [H]: J }]]
], yI = [
	3,
	Z,
	OC,
	0,
	[
		D,
		N,
		yd,
		xd,
		A,
		O,
		I_,
		gv,
		_v,
		vv,
		yv,
		I,
		L,
		j
	],
	[
		[0, 1],
		[0, 1],
		[0, { [H]: mO }],
		[() => Dj, {
			[U]: 1,
			[K]: xd
		}],
		[0, { [H]: k }],
		[0, { [H]: X }],
		[0, { [H]: Hk }],
		[0, { [H]: Uk }],
		[0, { [H]: Wk }],
		[0, { [H]: Gk }],
		[0, { [H]: Kk }],
		[0, { [H]: Y }],
		[0, { [W]: lO }],
		[0, { [H]: q }]
	],
	2
], bI = [
	3,
	Z,
	DC,
	0,
	[
		N,
		Ud,
		DS,
		M,
		Wf,
		Gf,
		Kf,
		Np,
		Pp,
		Fp,
		op,
		am,
		om,
		sm,
		$p,
		HT,
		F
	],
	[
		0,
		0,
		[0, { [H]: hA }],
		[0, { [H]: M }],
		[0, { [H]: OO }],
		[0, { [H]: kO }],
		[0, { [H]: AO }],
		[0, { [H]: PO }],
		[0, { [H]: FO }],
		[0, { [H]: IO }],
		[0, { [H]: jO }],
		[0, { [H]: XO }],
		[0, { [H]: ZO }],
		[0, { [H]: QO }],
		[0, { [H]: JO }],
		[0, { [H]: AA }],
		[0, { [H]: J }]
	]
], xI = [
	3,
	Z,
	kC,
	0,
	[
		D,
		N,
		Ud,
		qd,
		L,
		tS,
		O,
		Wf,
		Gf,
		Kf,
		Np,
		Pp,
		Fp,
		op,
		am,
		om,
		sm,
		A,
		I,
		j
	],
	[
		[0, 1],
		[0, 1],
		[0, { [W]: TD }],
		[() => xj, 16],
		[0, { [W]: lO }],
		[0, { [H]: aA }],
		[0, { [H]: X }],
		[0, { [H]: OO }],
		[0, { [H]: kO }],
		[0, { [H]: AO }],
		[0, { [H]: PO }],
		[0, { [H]: FO }],
		[0, { [H]: IO }],
		[0, { [H]: jO }],
		[0, { [H]: XO }],
		[0, { [H]: ZO }],
		[0, { [H]: QO }],
		[0, { [H]: k }],
		[0, { [H]: Y }],
		[0, { [H]: q }]
	],
	4
], SI = [
	3,
	Z,
	FC,
	0,
	[F],
	[[0, { [H]: J }]]
], CI = [
	3,
	Z,
	IC,
	0,
	[
		D,
		N,
		hb,
		I,
		L,
		A,
		O,
		j
	],
	[
		[0, 1],
		[0, 1],
		[() => FF, {
			[U]: 1,
			[K]: hb
		}],
		[0, { [H]: Y }],
		[0, { [W]: lO }],
		[0, { [H]: k }],
		[0, { [H]: X }],
		[0, { [H]: q }]
	],
	2
], wI = [
	3,
	Z,
	MC,
	0,
	[F],
	[[0, { [H]: J }]]
], TI = [
	3,
	Z,
	NC,
	0,
	[
		D,
		rS,
		I,
		VE,
		A,
		O,
		j
	],
	[
		[0, 1],
		[() => PF, {
			[U]: 1,
			[K]: rS
		}],
		[0, { [H]: Y }],
		[0, { [H]: TO }],
		[0, { [H]: k }],
		[0, { [H]: X }],
		[0, { [H]: q }]
	],
	1
], EI = [
	3,
	Z,
	LC,
	0,
	[
		og,
		M,
		Wf,
		Gf,
		Kf,
		Np,
		Pp,
		Fp,
		op,
		am,
		om,
		sm,
		$p,
		HT,
		L,
		KT,
		JT,
		QT,
		ZT,
		vf,
		sE,
		F
	],
	[
		[0, { [H]: ek }],
		[0, { [H]: M }],
		[0, { [H]: OO }],
		[0, { [H]: kO }],
		[0, { [H]: AO }],
		[0, { [H]: PO }],
		[0, { [H]: FO }],
		[0, { [H]: IO }],
		[0, { [H]: jO }],
		[0, { [H]: XO }],
		[0, { [H]: ZO }],
		[0, { [H]: QO }],
		[0, { [H]: JO }],
		[0, { [H]: AA }],
		[0, { [H]: VA }],
		[0, { [H]: PA }],
		[0, { [H]: IA }],
		[() => bj, { [H]: jA }],
		[() => yj, { [H]: NA }],
		[2, { [H]: MA }],
		[1, { [H]: mA }],
		[0, { [H]: J }]
	]
], DI = [
	3,
	Z,
	RC,
	0,
	[
		D,
		N,
		yd,
		jf,
		Uf,
		Xf,
		$f,
		np,
		ap,
		A,
		nm,
		O,
		Wf,
		Gf,
		Kf,
		Np,
		Pp,
		Fp,
		op,
		am,
		om,
		sm,
		sg,
		Hv,
		Xv,
		I_,
		gv,
		_v,
		yv,
		SD,
		qb,
		HT,
		hT,
		CD,
		KT,
		qT,
		JT,
		QT,
		ZT,
		vf,
		I,
		IE,
		dS,
		pS,
		uS,
		oS,
		sS,
		cS,
		j
	],
	[
		[0, 1],
		[0, 1],
		[0, { [H]: mO }],
		[() => xj, 16],
		[0, { [H]: qf }],
		[0, { [H]: Yf }],
		[0, { [H]: Qf }],
		[0, { [H]: rp }],
		[1, { [H]: ip }],
		[0, { [H]: k }],
		[0, { [H]: em }],
		[0, { [H]: X }],
		[0, { [H]: OO }],
		[0, { [H]: kO }],
		[0, { [H]: AO }],
		[0, { [H]: PO }],
		[0, { [H]: FO }],
		[0, { [H]: IO }],
		[0, { [H]: jO }],
		[0, { [H]: XO }],
		[0, { [H]: ZO }],
		[0, { [H]: QO }],
		[4, { [H]: sg }],
		[0, { [H]: Yv }],
		[0, { [H]: Zv }],
		[0, { [H]: Hk }],
		[0, { [H]: Uk }],
		[0, { [H]: Wk }],
		[0, { [H]: Kk }],
		[1, { [H]: HA }],
		[128, { [LD]: Xk }],
		[0, { [H]: AA }],
		[0, { [H]: DA }],
		[0, { [H]: UA }],
		[0, { [H]: PA }],
		[() => vj, { [H]: FA }],
		[0, { [H]: IA }],
		[() => bj, { [H]: jA }],
		[() => yj, { [H]: NA }],
		[2, { [H]: MA }],
		[0, { [H]: Y }],
		[0, { [H]: LA }],
		[0, { [H]: uA }],
		[5, { [H]: dA }],
		[0, { [H]: lA }],
		[0, { [H]: oA }],
		[1, { [H]: sA }],
		[1, { [H]: cA }],
		[0, { [H]: q }]
	],
	2
], OI = [
	3,
	Z,
	zC,
	0,
	[F],
	[[0, { [H]: J }]]
], kI = [
	3,
	Z,
	BC,
	0,
	[
		D,
		N,
		oT,
		I,
		L,
		gf,
		A,
		O,
		j
	],
	[
		[0, 1],
		[0, 1],
		[() => IF, {
			[U]: 1,
			[K]: oT
		}],
		[0, { [H]: Y }],
		[0, { [W]: lO }],
		[2, { [H]: bO }],
		[0, { [H]: k }],
		[0, { [H]: X }],
		[0, { [H]: q }]
	],
	2
], AI = [
	3,
	Z,
	UC,
	0,
	[L],
	[[0, { [H]: VA }]]
], jI = [
	3,
	Z,
	WC,
	0,
	[
		D,
		N,
		IE,
		L,
		A,
		O,
		j,
		I
	],
	[
		[0, 1],
		[0, 1],
		[() => CL, {
			[U]: 1,
			[K]: IE
		}],
		[0, { [W]: lO }],
		[0, { [H]: k }],
		[0, { [H]: X }],
		[0, { [H]: q }],
		[0, { [H]: Y }]
	],
	3
], MI = [
	3,
	Z,
	qC,
	0,
	[
		D,
		jS,
		A,
		O,
		j
	],
	[
		[0, 1],
		[() => ZF, {
			[U]: 1,
			[K]: jS
		}],
		[0, { [H]: k }],
		[0, { [H]: X }],
		[0, { [H]: q }]
	],
	2
], NI = [
	3,
	Z,
	uw,
	0,
	[
		ow,
		ig,
		jv,
		lg
	],
	[
		[0, { [K]: pw }],
		[64, {
			[G]: 1,
			[K]: ag
		}],
		0,
		[() => jF, 0]
	],
	2
], PI = [
	3,
	Z,
	Tw,
	0,
	[og, mm],
	[0, 1],
	1
], FI = [
	3,
	Z,
	Ew,
	0,
	[$C],
	[[21, { [jD]: 1 }]]
], II = [
	3,
	Z,
	aT,
	0,
	[
		Ev,
		Av,
		iw,
		Ow,
		kw
	],
	[
		0,
		0,
		0,
		0,
		0
	]
], LI = [
	3,
	Z,
	hw,
	0,
	[Ev, iw],
	[0, 0],
	1
], RI = [
	3,
	Z,
	Mw,
	0,
	[],
	[]
], zI = [
	3,
	Z,
	Fw,
	0,
	[
		D,
		N,
		Zw,
		Jm,
		Xm,
		Ym,
		Zm,
		CT,
		TT,
		wT,
		ET,
		tm
	],
	[
		[0, 1],
		[0, 1],
		[0, { [H]: xA }],
		[0, { [H]: Yv }],
		[0, { [H]: Zv }],
		[4, { [H]: Kv }],
		[4, { [H]: yy }],
		[0, { [H]: SA }],
		[0, { [H]: wA }],
		[6, { [H]: CA }],
		[6, { [H]: TA }],
		[0, {
			[H]: YO,
			[BD]: 1
		}]
	],
	3
], BI = [
	3,
	Z,
	Aw,
	0,
	[lT],
	[0],
	1
], VI = [
	3,
	Z,
	xw,
	0,
	[mw, sT],
	[0, [() => mR, {
		[G]: 1,
		[K]: cT
	}]],
	2
], HI = [
	3,
	Z,
	Ww,
	0,
	[
		lT,
		Oh,
		Fv,
		rw,
		P,
		lg,
		VT,
		Gh,
		eh
	],
	[
		0,
		() => HM,
		0,
		1,
		0,
		[() => WI, 0],
		() => pL,
		() => QM,
		() => MM
	],
	2
], UI = [
	3,
	Z,
	Hw,
	0,
	[P, dE],
	[0, [() => _R, {
		[G]: 1,
		[K]: FE
	}]]
], WI = [
	3,
	Z,
	Uw,
	0,
	[
		P,
		FE,
		lf
	],
	[
		0,
		() => SL,
		[() => UI, 0]
	]
], GI = [
	3,
	Z,
	Qw,
	0,
	[lT, BE],
	[0, () => KI],
	2
], KI = [
	3,
	Z,
	$w,
	0,
	[Sx],
	[1]
], qI = [
	3,
	Z,
	zw,
	0,
	[QC],
	[0],
	1
], JI = [
	3,
	Z,
	Bw,
	0,
	[tg],
	[2]
], YI = [
	3,
	Z,
	Nw,
	0,
	[F, Pw],
	[[0, { [H]: J }], [0, { [H]: vA }]]
], XI = [
	3,
	Z,
	Iw,
	0,
	[
		D,
		N,
		L,
		qw,
		I,
		O,
		j
	],
	[
		[0, 1],
		[0, 1],
		[0, { [W]: lO }],
		[() => ZI, {
			[U]: 1,
			[K]: qw
		}],
		[0, { [H]: Y }],
		[0, { [H]: X }],
		[0, { [H]: q }]
	],
	2
], ZI = [
	3,
	Z,
	qw,
	0,
	[
		mm,
		L_,
		GE,
		LE,
		kh,
		LT,
		nS
	],
	[
		1,
		() => mP,
		0,
		0,
		0,
		() => sL,
		[() => BF, 0]
	]
], QI = [
	3,
	Z,
	Xw,
	0,
	[oy, ww],
	[2, 4]
], $I = [
	3,
	Z,
	Jw,
	0,
	[aT, cm],
	[() => II, () => Jj],
	1
], eL = [
	3,
	Z,
	kT,
	0,
	[hg],
	[[() => ZL, {
		[G]: 1,
		[K]: pg
	}]]
], tL = [
	3,
	Z,
	jT,
	0,
	[
		wf,
		P,
		eg,
		Pf,
		vd,
		IE,
		tD,
		hT
	],
	[
		0,
		0,
		[() => WM, 0],
		0,
		[() => QL, 0],
		[() => CL, 0],
		[() => SR, 0],
		0
	],
	2
], nL = [
	3,
	Z,
	rE,
	0,
	[hE, OE],
	[0, 0],
	2
], rL = [
	3,
	Z,
	iE,
	0,
	[
		hE,
		OE,
		fE,
		kE
	],
	[
		0,
		0,
		0,
		0
	],
	4
], iL = [
	3,
	Z,
	zT,
	0,
	[cE, ng],
	[1, 1]
], aL = [
	3,
	Z,
	FT,
	0,
	[$C],
	[[() => ER, 16]]
], oL = [
	3,
	Z,
	IT,
	0,
	[
		D,
		N,
		cg,
		$h,
		sy,
		TS,
		KT,
		qT,
		JT,
		Bw,
		zT,
		j
	],
	[
		[0, 1],
		[0, 1],
		0,
		0,
		() => CP,
		() => VF,
		[0, { [H]: PA }],
		[() => vj, { [H]: FA }],
		[0, { [H]: IA }],
		() => JI,
		() => iL,
		[0, { [H]: q }]
	],
	6
], sL = [
	3,
	Z,
	LT,
	0,
	[
		sy,
		$h,
		cg,
		TS
	],
	[
		() => CP,
		0,
		0,
		() => VF
	],
	4
], cL = [
	3,
	Z,
	WT,
	0,
	[UT, Iy],
	[0, [() => bj, 0]],
	1
], lL = [
	3,
	Z,
	GT,
	0,
	[sT],
	[[() => gR, {
		[G]: 1,
		[K]: cT
	}]],
	1
], uL = [
	3,
	Z,
	$T,
	0,
	[
		nf,
		vf,
		hf
	],
	[
		[() => cL, 0],
		2,
		[() => Lj, 0]
	]
], dL = [
	3,
	Z,
	yT,
	0,
	[
		Fd,
		dT,
		nE,
		og
	],
	[
		[0, { [K]: Fd }],
		[() => _j, { [K]: dT }],
		[() => _j, { [K]: nE }],
		[4, { [K]: og }]
	],
	4
], fL = [
	3,
	Z,
	RT,
	{ [K]: RT },
	[],
	[]
], pL = [
	3,
	Z,
	VT,
	0,
	[OT, Aw],
	[() => hL, () => BI]
], mL = [
	3,
	Z,
	YT,
	{ [K]: DT },
	[Ay],
	[[() => bj, 0]],
	1
], hL = [
	3,
	Z,
	OT,
	0,
	[lT],
	[0],
	1
], gL = [
	3,
	Z,
	XT,
	{ [K]: DT },
	[Py, vf],
	[[() => gj, 0], 2],
	1
], _L = [
	3,
	Z,
	tE,
	{ [K]: BT },
	[],
	[]
], vL = [
	3,
	Z,
	lE,
	0,
	[
		Af,
		Tf,
		kf
	],
	[
		1,
		1,
		1
	]
], yL = [
	3,
	Z,
	ST,
	0,
	[Ah],
	[[() => vL, { [jD]: 1 }]]
], bL = [
	3,
	Z,
	gT,
	0,
	[Km],
	[() => xL]
], xL = [
	3,
	Z,
	_T,
	0,
	[wS, Oh],
	[0, () => jj],
	2
], SL = [
	3,
	Z,
	FE,
	0,
	[N, mD],
	[0, 0],
	2
], CL = [
	3,
	Z,
	IE,
	0,
	[PE],
	[[() => _R, 0]],
	1
], wL = [
	3,
	Z,
	wE,
	0,
	[xv, ew],
	[[() => gP, { [pO]: [dO, RD] }], 0]
], TL = [
	3,
	Z,
	AE,
	0,
	[RT, GC],
	[[() => fL, { [K]: RT }], [() => qF, { [K]: GC }]]
], EL = [
	3,
	Z,
	zE,
	0,
	[mm, af],
	[1, 0],
	2
], DL = [
	3,
	Z,
	bE,
	0,
	[
		pE,
		ig,
		jv,
		lg
	],
	[
		[0, { [K]: HE }],
		[64, {
			[G]: 1,
			[K]: ag
		}],
		0,
		[() => jF, 0]
	],
	2
], OL = [
	3,
	Z,
	WE,
	0,
	[
		wh,
		mm,
		hT
	],
	[
		5,
		1,
		0
	]
], kL = [
	3,
	Z,
	JE,
	0,
	[
		D,
		of,
		A,
		O,
		j
	],
	[
		[0, 1],
		[() => Ij, {
			[U]: 1,
			[K]: of
		}],
		[0, { [H]: k }],
		[0, { [H]: X }],
		[0, { [H]: q }]
	],
	2
], AL = [
	3,
	Z,
	XE,
	0,
	[
		D,
		gy,
		A,
		O,
		j
	],
	[
		[0, 1],
		[() => FP, {
			[U]: 1,
			[K]: gy
		}],
		[0, { [H]: k }],
		[0, { [H]: X }],
		[0, { [H]: q }]
	],
	2
], jL = [
	3,
	Z,
	QE,
	0,
	[
		D,
		Ey,
		A,
		O,
		j
	],
	[
		[0, 1],
		[() => RP, {
			[U]: 1,
			[K]: Ey
		}],
		[0, { [H]: k }],
		[0, { [H]: X }],
		[0, { [H]: q }]
	],
	2
], ML = [
	3,
	Z,
	iD,
	0,
	[
		D,
		N,
		Zx,
		L,
		I,
		j,
		A,
		O
	],
	[
		[0, 1],
		[0, 1],
		[() => TR, 16],
		[0, { [W]: lO }],
		[0, { [H]: Y }],
		[0, { [H]: q }],
		[0, { [H]: k }],
		[0, { [H]: X }]
	],
	3
], NL = [
	3,
	Z,
	aD,
	0,
	[F],
	[[0, { [H]: J }]]
], PL = [
	3,
	Z,
	cD,
	0,
	[
		Jp,
		Ep,
		HT,
		KT,
		JT,
		QT,
		vf,
		F
	],
	[
		[0, { [H]: qO }],
		[() => $j, 16],
		[0, { [H]: AA }],
		[0, { [H]: PA }],
		[0, { [H]: IA }],
		[() => bj, { [H]: jA }],
		[2, { [H]: MA }],
		[0, { [H]: J }]
	]
], FL = [
	3,
	Z,
	lD,
	0,
	[
		D,
		Zp,
		N,
		SC,
		$E,
		Ip,
		Lp,
		Rp,
		zp,
		Hp,
		KT,
		qT,
		JT,
		Wp,
		Gp,
		Kp,
		I,
		j,
		qh
	],
	[
		[0, 1],
		[0, { [H]: LO }],
		[0, 1],
		[1, { [W]: XD }],
		[0, { [W]: sO }],
		[0, { [H]: RO }],
		[4, { [H]: zO }],
		[0, { [H]: BO }],
		[4, { [H]: VO }],
		[0, { [H]: UO }],
		[0, { [H]: PA }],
		[() => vj, { [H]: FA }],
		[0, { [H]: IA }],
		[0, { [H]: WO }],
		[() => hj, { [H]: GO }],
		[0, { [H]: KO }],
		[0, { [H]: Y }],
		[0, { [H]: q }],
		[0, { [H]: kA }]
	],
	5
], IL = [
	3,
	Z,
	uD,
	0,
	[
		HT,
		M,
		Wf,
		Gf,
		Kf,
		Np,
		Pp,
		Fp,
		op,
		am,
		om,
		sm,
		KT,
		JT,
		QT,
		vf,
		F
	],
	[
		[0, { [H]: AA }],
		[0, { [H]: M }],
		[0, { [H]: OO }],
		[0, { [H]: kO }],
		[0, { [H]: AO }],
		[0, { [H]: PO }],
		[0, { [H]: FO }],
		[0, { [H]: IO }],
		[0, { [H]: jO }],
		[0, { [H]: XO }],
		[0, { [H]: ZO }],
		[0, { [H]: QO }],
		[0, { [H]: PA }],
		[0, { [H]: IA }],
		[() => bj, { [H]: jA }],
		[2, { [H]: MA }],
		[0, { [H]: J }]
	]
], LL = [
	3,
	Z,
	dD,
	0,
	[
		D,
		N,
		SC,
		$E,
		jf,
		ap,
		A,
		O,
		Wf,
		Gf,
		Kf,
		Np,
		Pp,
		Fp,
		op,
		am,
		om,
		sm,
		KT,
		qT,
		JT,
		I,
		j
	],
	[
		[0, 1],
		[0, 1],
		[1, { [W]: XD }],
		[0, { [W]: sO }],
		[() => xj, 16],
		[1, { [H]: ip }],
		[0, { [H]: k }],
		[0, { [H]: X }],
		[0, { [H]: OO }],
		[0, { [H]: kO }],
		[0, { [H]: AO }],
		[0, { [H]: PO }],
		[0, { [H]: FO }],
		[0, { [H]: IO }],
		[0, { [H]: jO }],
		[0, { [H]: XO }],
		[0, { [H]: ZO }],
		[0, { [H]: QO }],
		[0, { [H]: PA }],
		[() => vj, { [H]: FA }],
		[0, { [H]: IA }],
		[0, { [H]: Y }],
		[0, { [H]: q }]
	],
	4
], RL = [
	3,
	Z,
	hD,
	0,
	[cx, lT],
	[[0, { [K]: ix }], 0]
], zL = [
	3,
	Z,
	yD,
	0,
	[
		Lh,
		Iv,
		hw,
		Vw
	],
	[
		() => YM,
		() => xP,
		() => LI,
		[() => hR, 0]
	]
], BL = [
	3,
	Z,
	xD,
	0,
	[
		Kw,
		eT,
		jf,
		bT,
		Fh,
		Uh,
		Qd,
		Uf,
		Xf,
		$f,
		np,
		ap,
		kp,
		nm,
		Wf,
		Gf,
		Kf,
		Np,
		Pp,
		Fp,
		op,
		am,
		om,
		sm,
		Qm,
		M,
		sg,
		og,
		vb,
		ux,
		qb,
		dS,
		uS,
		pS,
		_C,
		Yw,
		F,
		rT,
		HT,
		KT,
		QT,
		JT,
		hT,
		_E,
		L,
		vf
	],
	[
		[0, {
			[ID]: 1,
			[H]: yA
		}],
		[0, { [H]: EA }],
		[() => xj, 16],
		[1, { [H]: Vk }],
		[0, { [H]: tk }],
		[0, { [H]: nk }],
		[0, { [H]: fk }],
		[0, { [H]: rk }],
		[0, { [H]: ik }],
		[0, { [H]: ak }],
		[0, { [H]: ok }],
		[1, { [H]: ip }],
		[0, { [H]: sk }],
		[0, { [H]: ck }],
		[0, { [H]: pk }],
		[0, { [H]: mk }],
		[0, { [H]: hk }],
		[0, { [H]: _k }],
		[0, { [H]: vk }],
		[0, { [H]: yk }],
		[0, { [H]: gk }],
		[0, { [H]: bk }],
		[0, { [H]: xk }],
		[0, { [H]: Sk }],
		[2, { [H]: Ck }],
		[0, { [H]: lk }],
		[4, { [H]: uk }],
		[0, { [H]: wk }],
		[4, { [H]: dk }],
		[1, { [H]: Tk }],
		[128, { [LD]: Xk }],
		[0, { [H]: Ok }],
		[0, { [H]: Dk }],
		[5, { [H]: kk }],
		[1, { [H]: Ek }],
		[0, { [H]: Mk }],
		[0, { [H]: jk }],
		[0, { [H]: Ak }],
		[0, { [H]: Pk }],
		[0, { [H]: Lk }],
		[() => bj, { [H]: Fk }],
		[0, { [H]: Rk }],
		[0, { [H]: Nk }],
		[1, { [H]: zk }],
		[0, { [H]: Bk }],
		[2, { [H]: Ik }]
	],
	2
], $ = "unit", VL = [
	1,
	Z,
	bd,
	0,
	[() => Aj, 0]
], HL = [
	1,
	Z,
	Id,
	0,
	[() => Nj, { [K]: Od }]
], UL = [
	1,
	Z,
	Mf,
	0,
	[() => Rj, { [K]: D }]
], WL = [
	1,
	Z,
	wp,
	0,
	() => Uj
], GL = [
	1,
	Z,
	Tp,
	0,
	() => Gj
], KL = [
	1,
	Z,
	bp,
	0,
	[() => tM, 0]
], qL = [
	1,
	Z,
	hh,
	0,
	() => AM
], JL = [
	1,
	Z,
	nh,
	0,
	() => jM
], YL = [
	1,
	Z,
	Jh,
	0,
	[0, { [K]: Xh }]
], XL = [
	1,
	Z,
	rg,
	0,
	() => qM
], ZL = [
	1,
	Z,
	mg,
	0,
	() => $M
], QL = [
	1,
	Z,
	yg,
	0,
	[() => hP, { [K]: bv }]
], $L = [
	1,
	Z,
	py,
	0,
	[() => TP, 0]
], eR = [
	1,
	Z,
	Pv,
	0,
	[() => DP, 0]
], tR = [
	1,
	Z,
	Qv,
	0,
	[0, { [K]: gg }]
], nR = [
	1,
	Z,
	pb,
	0,
	[() => VP, 0]
], rR = [
	1,
	Z,
	Gb,
	0,
	[() => UP, 0]
], iR = [
	1,
	Z,
	$b,
	0,
	[() => EF, 0]
], aR = [
	1,
	Z,
	_x,
	0,
	() => DF
], oR = [
	1,
	Z,
	Ux,
	0,
	() => kF
], sR = [
	1,
	Z,
	eS,
	0,
	() => NF
], cR = [
	1,
	Z,
	hS,
	0,
	[() => MF, 0]
], lR = [
	1,
	Z,
	OS,
	0,
	[() => zF, 0]
], uR = [
	1,
	Z,
	Xx,
	0,
	() => WF
], dR = [
	1,
	Z,
	YC,
	0,
	() => KF
], fR = [
	1,
	Z,
	xC,
	0,
	() => RF
], pR = [
	1,
	Z,
	cw,
	0,
	[() => NI, 0]
], mR = [
	1,
	Z,
	Gw,
	0,
	[() => HI, 0]
], hR = [
	1,
	Z,
	Vw,
	0,
	[() => $I, { [K]: Jw }]
], gR = [
	1,
	Z,
	eE,
	0,
	[() => uL, 0]
], _R = [
	1,
	Z,
	PE,
	0,
	[() => SL, { [K]: FE }]
], vR = [
	1,
	Z,
	CE,
	0,
	[() => wL, { [K]: bv }]
], yR = [
	1,
	Z,
	TE,
	0,
	() => EL
], bR = [
	1,
	Z,
	vE,
	0,
	[() => DL, 0]
], xR = [
	1,
	Z,
	EE,
	0,
	() => OL
], SR = [
	1,
	Z,
	tD,
	0,
	[() => bF, { [K]: ax }]
], CR = [
	4,
	Z,
	Ad,
	0,
	[
		P,
		FE,
		lf
	],
	[
		0,
		() => SL,
		[() => kj, 0]
	]
], wR = [
	4,
	Z,
	ox,
	0,
	[
		P,
		FE,
		Yd,
		lf
	],
	[
		0,
		() => SL,
		0,
		[() => TF, 0]
	]
], TR = [
	4,
	Z,
	Zx,
	0,
	[YT],
	[[() => gL, { [K]: DT }]]
], ER = [
	4,
	Z,
	PT,
	{ [oO]: 1 },
	[
		iT,
		lE,
		nw,
		fm,
		ng
	],
	[
		[() => FI, 0],
		[() => yL, 0],
		[() => XF, 0],
		() => Yj,
		() => KM
	]
], DR = [
	9,
	Z,
	zd,
	{ [B]: [
		"DELETE",
		"/{Key+}?x-id=AbortMultipartUpload",
		204
	] },
	() => Tj,
	() => wj
], OR = [
	9,
	Z,
	pp,
	{ [B]: [
		"POST",
		"/{Key+}",
		200
	] },
	() => qj,
	() => Kj
], kR = [
	9,
	Z,
	gp,
	{ [B]: [
		"PUT",
		"/{Key+}?x-id=CopyObject",
		200
	] },
	() => Zj,
	() => Xj
], AR = [
	9,
	Z,
	Ff,
	{ [B]: [
		"PUT",
		"/",
		200
	] },
	() => oM,
	() => aM
], jR = [
	9,
	Z,
	Lf,
	{
		[V]: "-",
		[B]: [
			"POST",
			"/?metadataConfiguration",
			200
		]
	},
	() => rM,
	() => $
], MR = [
	9,
	Z,
	zf,
	{
		[V]: "-",
		[B]: [
			"POST",
			"/?metadataTable",
			200
		]
	},
	() => iM,
	() => $
], NR = [
	9,
	Z,
	mp,
	{ [B]: [
		"POST",
		"/{Key+}?uploads",
		200
	] },
	() => cM,
	() => sM
], PR = [
	9,
	Z,
	Qp,
	{ [B]: [
		"GET",
		"/?session",
		200
	] },
	() => uM,
	() => lM
], FR = [
	9,
	Z,
	gm,
	{ [B]: [
		"DELETE",
		"/",
		204
	] },
	() => DM,
	() => $
], IR = [
	9,
	Z,
	_m,
	{ [B]: [
		"DELETE",
		"/?analytics",
		204
	] },
	() => hM,
	() => $
], LR = [
	9,
	Z,
	ym,
	{ [B]: [
		"DELETE",
		"/?cors",
		204
	] },
	() => gM,
	() => $
], RR = [
	9,
	Z,
	xm,
	{ [B]: [
		"DELETE",
		"/?encryption",
		204
	] },
	() => _M,
	() => $
], zR = [
	9,
	Z,
	Tm,
	{ [B]: [
		"DELETE",
		"/?intelligent-tiering",
		204
	] },
	() => vM,
	() => $
], BR = [
	9,
	Z,
	Cm,
	{ [B]: [
		"DELETE",
		"/?inventory",
		204
	] },
	() => yM,
	() => $
], VR = [
	9,
	Z,
	Dm,
	{ [B]: [
		"DELETE",
		"/?lifecycle",
		204
	] },
	() => bM,
	() => $
], HR = [
	9,
	Z,
	km,
	{ [B]: [
		"DELETE",
		"/?metadataConfiguration",
		204
	] },
	() => xM,
	() => $
], UR = [
	9,
	Z,
	Nm,
	{ [B]: [
		"DELETE",
		"/?metadataTable",
		204
	] },
	() => SM,
	() => $
], WR = [
	9,
	Z,
	Mm,
	{ [B]: [
		"DELETE",
		"/?metrics",
		204
	] },
	() => CM,
	() => $
], GR = [
	9,
	Z,
	Fm,
	{ [B]: [
		"DELETE",
		"/?ownershipControls",
		204
	] },
	() => wM,
	() => $
], KR = [
	9,
	Z,
	Lm,
	{ [B]: [
		"DELETE",
		"/?policy",
		204
	] },
	() => TM,
	() => $
], qR = [
	9,
	Z,
	Vm,
	{ [B]: [
		"DELETE",
		"/?replication",
		204
	] },
	() => EM,
	() => $
], JR = [
	9,
	Z,
	Hm,
	{ [B]: [
		"DELETE",
		"/?tagging",
		204
	] },
	() => OM,
	() => $
], YR = [
	9,
	Z,
	Wm,
	{ [B]: [
		"DELETE",
		"/?website",
		204
	] },
	() => kM,
	() => $
], XR = [
	9,
	Z,
	gh,
	{ [B]: [
		"DELETE",
		"/{Key+}?x-id=DeleteObject",
		204
	] },
	() => IM,
	() => FM
], ZR = [
	9,
	Z,
	ah,
	{ [B]: [
		"DELETE",
		"/{Key+}?annotation",
		204
	] },
	() => PM,
	() => NM
], QR = [
	9,
	Z,
	_h,
	{
		[V]: "-",
		[B]: [
			"POST",
			"/?delete",
			200
		]
	},
	() => RM,
	() => LM
], $R = [
	9,
	Z,
	fh,
	{ [B]: [
		"DELETE",
		"/{Key+}?tagging",
		204
	] },
	() => BM,
	() => zM
], ez = [
	9,
	Z,
	vh,
	{ [B]: [
		"DELETE",
		"/?publicAccessBlock",
		204
	] },
	() => VM,
	() => $
], tz = [
	9,
	Z,
	bg,
	{ [B]: [
		"GET",
		"/?abac",
		200
	] },
	() => tN,
	() => eN
], nz = [
	9,
	Z,
	xg,
	{ [B]: [
		"GET",
		"/?accelerate",
		200
	] },
	() => rN,
	() => nN
], rz = [
	9,
	Z,
	jg,
	{ [B]: [
		"GET",
		"/?acl",
		200
	] },
	() => aN,
	() => iN
], iz = [
	9,
	Z,
	Eg,
	{ [B]: [
		"GET",
		"/?analytics&x-id=GetBucketAnalyticsConfiguration",
		200
	] },
	() => sN,
	() => oN
], az = [
	9,
	Z,
	Mg,
	{ [B]: [
		"GET",
		"/?cors",
		200
	] },
	() => lN,
	() => cN
], oz = [
	9,
	Z,
	Fg,
	{ [B]: [
		"GET",
		"/?encryption",
		200
	] },
	() => dN,
	() => uN
], sz = [
	9,
	Z,
	Vg,
	{ [B]: [
		"GET",
		"/?intelligent-tiering&x-id=GetBucketIntelligentTieringConfiguration",
		200
	] },
	() => pN,
	() => fN
], cz = [
	9,
	Z,
	Rg,
	{ [B]: [
		"GET",
		"/?inventory&x-id=GetBucketInventoryConfiguration",
		200
	] },
	() => hN,
	() => mN
], lz = [
	9,
	Z,
	Gg,
	{ [B]: [
		"GET",
		"/?lifecycle",
		200
	] },
	() => _N,
	() => gN
], uz = [
	9,
	Z,
	Wg,
	{ [B]: [
		"GET",
		"/?location",
		200
	] },
	() => yN,
	() => vN
], dz = [
	9,
	Z,
	Qg,
	{ [B]: [
		"GET",
		"/?logging",
		200
	] },
	() => xN,
	() => bN
], fz = [
	9,
	Z,
	$g,
	{ [B]: [
		"GET",
		"/?metadataConfiguration",
		200
	] },
	() => CN,
	() => SN
], pz = [
	9,
	Z,
	o_,
	{ [B]: [
		"GET",
		"/?metadataTable",
		200
	] },
	() => EN,
	() => TN
], mz = [
	9,
	Z,
	a_,
	{ [B]: [
		"GET",
		"/?metrics&x-id=GetBucketMetricsConfiguration",
		200
	] },
	() => kN,
	() => ON
], hz = [
	9,
	Z,
	u_,
	{ [B]: [
		"GET",
		"/?notification",
		200
	] },
	() => AN,
	() => AF
], gz = [
	9,
	Z,
	f_,
	{ [B]: [
		"GET",
		"/?ownershipControls",
		200
	] },
	() => MN,
	() => jN
], _z = [
	9,
	Z,
	h_,
	{ [B]: [
		"GET",
		"/?policy",
		200
	] },
	() => PN,
	() => NN
], vz = [
	9,
	Z,
	v_,
	{ [B]: [
		"GET",
		"/?policyStatus",
		200
	] },
	() => IN,
	() => FN
], yz = [
	9,
	Z,
	x_,
	{ [B]: [
		"GET",
		"/?replication",
		200
	] },
	() => RN,
	() => LN
], bz = [
	9,
	Z,
	C_,
	{ [B]: [
		"GET",
		"/?requestPayment",
		200
	] },
	() => BN,
	() => zN
], xz = [
	9,
	Z,
	D_,
	{ [B]: [
		"GET",
		"/?tagging",
		200
	] },
	() => HN,
	() => VN
], Sz = [
	9,
	Z,
	A_,
	{ [B]: [
		"GET",
		"/?versioning",
		200
	] },
	() => WN,
	() => UN
], Cz = [
	9,
	Z,
	N_,
	{ [B]: [
		"GET",
		"/?website",
		200
	] },
	() => KN,
	() => GN
], wz = [
	9,
	Z,
	R_,
	{
		[V]: "-",
		[B]: [
			"GET",
			"/{Key+}?x-id=GetObject",
			200
		]
	},
	() => aP,
	() => iP
], Tz = [
	9,
	Z,
	z_,
	{ [B]: [
		"GET",
		"/{Key+}?acl",
		200
	] },
	() => JN,
	() => qN
], Ez = [
	9,
	Z,
	J_,
	{
		[V]: "-",
		[B]: [
			"GET",
			"/{Key+}?annotation&x-id=GetObjectAnnotation",
			200
		]
	},
	() => XN,
	() => YN
], Dz = [
	9,
	Z,
	Y_,
	{ [B]: [
		"GET",
		"/{Key+}?attributes",
		200
	] },
	() => $N,
	() => ZN
], Oz = [
	9,
	Z,
	$_,
	{ [B]: [
		"GET",
		"/{Key+}?legal-hold",
		200
	] },
	() => tP,
	() => eP
], kz = [
	9,
	Z,
	X_,
	{ [B]: [
		"GET",
		"/?object-lock",
		200
	] },
	() => rP,
	() => nP
], Az = [
	9,
	Z,
	ov,
	{ [B]: [
		"GET",
		"/{Key+}?retention",
		200
	] },
	() => sP,
	() => oP
], jz = [
	9,
	Z,
	sv,
	{ [B]: [
		"GET",
		"/{Key+}?tagging",
		200
	] },
	() => lP,
	() => cP
], Mz = [
	9,
	Z,
	fv,
	{ [B]: [
		"GET",
		"/{Key+}?torrent",
		200
	] },
	() => dP,
	() => uP
], Nz = [
	9,
	Z,
	pv,
	{ [B]: [
		"GET",
		"/?publicAccessBlock",
		200
	] },
	() => pP,
	() => fP
], Pz = [
	9,
	Z,
	Sv,
	{ [B]: [
		"HEAD",
		"/",
		200
	] },
	() => vP,
	() => _P
], Fz = [
	9,
	Z,
	Dv,
	{ [B]: [
		"HEAD",
		"/{Key+}",
		200
	] },
	() => bP,
	() => yP
], Iz = [
	9,
	Z,
	Hy,
	{ [B]: [
		"GET",
		"/?analytics&x-id=ListBucketAnalyticsConfigurations",
		200
	] },
	() => qP,
	() => KP
], Lz = [
	9,
	Z,
	Yy,
	{ [B]: [
		"GET",
		"/?intelligent-tiering&x-id=ListBucketIntelligentTieringConfigurations",
		200
	] },
	() => YP,
	() => JP
], Rz = [
	9,
	Z,
	Ky,
	{ [B]: [
		"GET",
		"/?inventory&x-id=ListBucketInventoryConfigurations",
		200
	] },
	() => ZP,
	() => XP
], zz = [
	9,
	Z,
	Qy,
	{ [B]: [
		"GET",
		"/?metrics&x-id=ListBucketMetricsConfigurations",
		200
	] },
	() => $P,
	() => QP
], Bz = [
	9,
	Z,
	Vy,
	{ [B]: [
		"GET",
		"/?x-id=ListBuckets",
		200
	] },
	() => tF,
	() => eF
], Vz = [
	9,
	Z,
	ob,
	{ [B]: [
		"GET",
		"/?x-id=ListDirectoryBuckets",
		200
	] },
	() => rF,
	() => nF
], Hz = [
	9,
	Z,
	xb,
	{ [B]: [
		"GET",
		"/?uploads",
		200
	] },
	() => aF,
	() => iF
], Uz = [
	9,
	Z,
	Db,
	{ [B]: [
		"GET",
		"/{Key+}?annotation&x-id=ListObjectAnnotations",
		200
	] },
	() => sF,
	() => oF
], Wz = [
	9,
	Z,
	Eb,
	{ [B]: [
		"GET",
		"/",
		200
	] },
	() => lF,
	() => cF
], Gz = [
	9,
	Z,
	Mb,
	{ [B]: [
		"GET",
		"/?list-type=2",
		200
	] },
	() => dF,
	() => uF
], Kz = [
	9,
	Z,
	Lb,
	{ [B]: [
		"GET",
		"/?versions",
		200
	] },
	() => pF,
	() => fF
], qz = [
	9,
	Z,
	Rb,
	{ [B]: [
		"GET",
		"/{Key+}?x-id=ListParts",
		200
	] },
	() => hF,
	() => mF
], Jz = [
	9,
	Z,
	MS,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/?abac",
			200
		]
	},
	() => QF,
	() => $
], Yz = [
	9,
	Z,
	NS,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/?accelerate",
			200
		]
	},
	() => $F,
	() => $
], Xz = [
	9,
	Z,
	zS,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/?acl",
			200
		]
	},
	() => eI,
	() => $
], Zz = [
	9,
	Z,
	IS,
	{ [B]: [
		"PUT",
		"/?analytics",
		200
	] },
	() => tI,
	() => $
], Qz = [
	9,
	Z,
	BS,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/?cors",
			200
		]
	},
	() => nI,
	() => $
], $z = [
	9,
	Z,
	HS,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/?encryption",
			200
		]
	},
	() => rI,
	() => $
], eB = [
	9,
	Z,
	KS,
	{ [B]: [
		"PUT",
		"/?intelligent-tiering",
		200
	] },
	() => iI,
	() => $
], tB = [
	9,
	Z,
	WS,
	{ [B]: [
		"PUT",
		"/?inventory",
		200
	] },
	() => aI,
	() => $
], nB = [
	9,
	Z,
	YS,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/?lifecycle",
			200
		]
	},
	() => sI,
	() => oI
], rB = [
	9,
	Z,
	JS,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/?logging",
			200
		]
	},
	() => cI,
	() => $
], iB = [
	9,
	Z,
	$S,
	{ [B]: [
		"PUT",
		"/?metrics",
		200
	] },
	() => lI,
	() => $
], aB = [
	9,
	Z,
	tC,
	{ [B]: [
		"PUT",
		"/?notification",
		200
	] },
	() => uI,
	() => $
], oB = [
	9,
	Z,
	rC,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/?ownershipControls",
			200
		]
	},
	() => dI,
	() => $
], sB = [
	9,
	Z,
	aC,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/?policy",
			200
		]
	},
	() => fI,
	() => $
], cB = [
	9,
	Z,
	sC,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/?replication",
			200
		]
	},
	() => pI,
	() => $
], lB = [
	9,
	Z,
	cC,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/?requestPayment",
			200
		]
	},
	() => mI,
	() => $
], uB = [
	9,
	Z,
	dC,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/?tagging",
			200
		]
	},
	() => hI,
	() => $
], dB = [
	9,
	Z,
	pC,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/?versioning",
			200
		]
	},
	() => gI,
	() => $
], fB = [
	9,
	Z,
	hC,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/?website",
			200
		]
	},
	() => _I,
	() => $
], pB = [
	9,
	Z,
	wC,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/{Key+}?x-id=PutObject",
			200
		]
	},
	() => DI,
	() => EI
], mB = [
	9,
	Z,
	TC,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/{Key+}?acl",
			200
		]
	},
	() => yI,
	() => vI
], hB = [
	9,
	Z,
	AC,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/{Key+}?annotation",
			200
		]
	},
	() => xI,
	() => bI
], gB = [
	9,
	Z,
	PC,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/{Key+}?legal-hold",
			200
		]
	},
	() => CI,
	() => SI
], _B = [
	9,
	Z,
	jC,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/?object-lock",
			200
		]
	},
	() => TI,
	() => wI
], vB = [
	9,
	Z,
	VC,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/{Key+}?retention",
			200
		]
	},
	() => kI,
	() => OI
], yB = [
	9,
	Z,
	HC,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/{Key+}?tagging",
			200
		]
	},
	() => jI,
	() => AI
], bB = [
	9,
	Z,
	KC,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/?publicAccessBlock",
			200
		]
	},
	() => MI,
	() => $
], xB = [
	9,
	Z,
	jw,
	{ [B]: [
		"PUT",
		"/{Key+}?renameObject",
		200
	] },
	() => zI,
	() => RI
], SB = [
	9,
	Z,
	Lw,
	{
		[V]: "-",
		[B]: [
			"POST",
			"/{Key+}?restore",
			200
		]
	},
	() => XI,
	() => YI
], CB = [
	9,
	Z,
	NT,
	{ [B]: [
		"POST",
		"/{Key+}?select&select-type=2",
		200
	] },
	() => oL,
	() => aL
], wB = [
	9,
	Z,
	qE,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/?metadataAnnotationTable",
			200
		]
	},
	() => kL,
	() => $
], TB = [
	9,
	Z,
	YE,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/?metadataInventoryTable",
			200
		]
	},
	() => AL,
	() => $
], EB = [
	9,
	Z,
	ZE,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/?metadataJournalTable",
			200
		]
	},
	() => jL,
	() => $
], DB = [
	9,
	Z,
	rD,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/{Key+}?encryption",
			200
		]
	},
	() => ML,
	() => NL
], OB = [
	9,
	Z,
	oD,
	{
		[V]: "-",
		[B]: [
			"PUT",
			"/{Key+}?x-id=UploadPart",
			200
		]
	},
	() => LL,
	() => IL
], kB = [
	9,
	Z,
	sD,
	{ [B]: [
		"PUT",
		"/{Key+}?x-id=UploadPartCopy",
		200
	] },
	() => FL,
	() => PL
], AB = [
	9,
	Z,
	bD,
	{
		[MD]: ["{RequestRoute}."],
		[B]: [
			"POST",
			"/WriteGetObjectResponse",
			200
		]
	},
	() => BL,
	() => $
], jB = class extends S(Au, w, "CreateSession", PR) {}, MB = {
	name: "@aws-sdk/client-s3",
	version: "3.1142.0",
	description: "AWS SDK for JavaScript S3 Client for Node.js, Browser and React Native",
	homepage: "https://github.com/aws/aws-sdk-js-v3/tree/main/clients/client-s3",
	license: "Apache-2.0",
	author: {
		name: "AWS SDK for JavaScript Team",
		url: "https://aws.amazon.com/sdk-for-javascript/"
	},
	repository: {
		type: "git",
		url: "https://github.com/aws/aws-sdk-js-v3.git",
		directory: "clients/client-s3"
	},
	files: ["dist-*/**"],
	sideEffects: !1,
	main: "./dist-cjs/index.js",
	module: "./dist-es/index.js",
	browser: { "./dist-es/runtimeConfig": "./dist-es/runtimeConfig.browser" },
	types: "./dist-types/index.d.ts",
	typesVersions: { "<4.5": { "dist-types/*": ["dist-types/ts3.4/*"] } },
	"react-native": { "./dist-es/runtimeConfig": "./dist-es/runtimeConfig.native" },
	scripts: {
		build: "concurrently 'yarn:build:types' 'yarn:build:es' && yarn build:cjs",
		"build:cjs": "node ../../scripts/compilation/inline",
		"build:es": "premove dist-es && tsc -p tsconfig.es.json",
		"build:include:deps": "yarn g:turbo run build -F=\"$npm_package_name\"",
		"build:types": "premove dist-types && tsc -p tsconfig.types.json",
		"build:types:downlevel": "downlevel-dts dist-types dist-types/ts3.4",
		clean: "premove dist-cjs dist-es dist-types",
		"extract:docs": "api-extractor run --local",
		"generate:client": "node ../../scripts/generate-clients/single-service",
		test: "yarn g:vitest run --passWithNoTests",
		"test:watch": "yarn g:vitest watch --passWithNoTests",
		"test:integration": "yarn g:vitest run --passWithNoTests -c vitest.config.integ.mts",
		"test:integration:watch": "yarn g:vitest watch --passWithNoTests -c vitest.config.integ.mts",
		"test:e2e": "yarn g:vitest run -c vitest.config.e2e.mts",
		"test:e2e:watch": "yarn g:vitest watch -c vitest.config.e2e.mts",
		"test:browser": "yarn g:vitest run -c vitest.config.browser.mts",
		"test:browser:watch": "yarn g:vitest watch -c vitest.config.browser.mts",
		"test:index": "tsc -p tsconfig.test.json && node ./test/index-objects.spec.mjs"
	},
	dependencies: {
		"@aws-sdk/checksums": "^3.1001.1",
		"@aws-sdk/core": "^3.978.1",
		"@aws-sdk/credential-provider-node": "^3.972.84",
		"@aws-sdk/middleware-sdk-s3": "^3.972.77",
		"@aws-sdk/signature-v4-multi-region": "^3.996.47",
		"@aws-sdk/types": "^3.974.6",
		"@smithy/core": "^3.35.0",
		"@smithy/fetch-http-handler": "^5.8.0",
		"@smithy/node-http-handler": "^4.12.1",
		"@smithy/types": "^4.19.0",
		tslib: "^2.6.2"
	},
	devDependencies: {
		"@aws-sdk/signature-v4-crt": "3.1142.0",
		"@smithy/snapshot-testing": "^2.3.2",
		"@tsconfig/node20": "20.1.8",
		"@types/node": "^20.14.8",
		concurrently: "7.0.0",
		"downlevel-dts": "0.10.1",
		premove: "4.0.0",
		typescript: "~7.0.2",
		vitest: "^4.0.17"
	},
	engines: { node: ">=20.0.0" }
};
function NB(e, t) {
	return new Request(e, t);
}
function PB(e = 0) {
	return new Promise((t, n) => {
		e && setTimeout(() => {
			let t = /* @__PURE__ */ Error(`Request did not complete within ${e} ms`);
			t.name = "TimeoutError", n(t);
		}, e);
	});
}
var FB = { supported: void 0 }, IB = class e {
	config;
	configProvider;
	static create(t) {
		return typeof t?.handle == "function" ? t : new e(t);
	}
	constructor(e) {
		typeof e == "function" ? this.configProvider = e().then((e) => e || {}) : (this.config = e ?? {}, this.configProvider = Promise.resolve(this.config)), FB.supported === void 0 && (FB.supported = typeof Request < "u" && "keepalive" in NB("https://[::1]"));
	}
	destroy() {}
	async handle(e, { abortSignal: t, requestTimeout: n } = {}) {
		this.config ||= await this.configProvider;
		let r = n ?? this.config.requestTimeout, i = this.config.keepAlive === !0, a = this.config.credentials, o = this.config.customFetch ?? fetch;
		if (t?.aborted) {
			let e = LB(t);
			return Promise.reject(e);
		}
		let s = e.path, c = u(e.query || {});
		c && (s += `?${c}`), e.fragment && (s += `#${e.fragment}`);
		let l = "";
		(e.username != null || e.password != null) && (l = `${e.username ?? ""}:${e.password ?? ""}@`);
		let { port: d, method: f } = e, ee = `${e.protocol}//${l}${e.hostname}${d ? `:${d}` : ""}${s}`, p = f === "GET" || f === "HEAD" ? void 0 : e.body, m = {
			body: p,
			headers: new Headers(e.headers),
			method: f,
			credentials: a
		};
		this.config?.cache && (m.cache = this.config.cache), p && (m.duplex = "half"), typeof AbortController < "u" && (m.signal = t), FB.supported && (m.keepalive = i), typeof this.config.requestInit == "function" && Object.assign(m, this.config.requestInit(e));
		let te = () => {}, ne = [o(NB(ee, m)).then((e) => {
			let t = e.headers, n = {};
			for (let e of t.entries()) n[e[0]] = e[1];
			return e.body == null ? e.blob().then((t) => ({ response: new ve({
				headers: n,
				reason: e.statusText,
				statusCode: e.status,
				body: t
			}) })) : { response: new ve({
				headers: n,
				reason: e.statusText,
				statusCode: e.status,
				body: e.body
			}) };
		}), PB(r)];
		return t && ne.push(new Promise((e, n) => {
			let r = () => {
				n(LB(t));
			};
			if (typeof t.addEventListener == "function") {
				let e = t;
				e.addEventListener("abort", r, { once: !0 }), te = () => e.removeEventListener("abort", r);
			} else t.onabort = r;
		})), Promise.race(ne).finally(te);
	}
	updateHttpClientConfig(e, t) {
		this.config = void 0, this.configProvider = this.configProvider.then((n) => (n[e] = t, n));
	}
	httpHandlerConfigs() {
		return this.config ?? {};
	}
};
function LB(e) {
	let t = e && typeof e == "object" && "reason" in e ? e.reason : void 0;
	if (t) {
		if (t instanceof Error) {
			let e = /* @__PURE__ */ Error("Request aborted");
			return e.name = "AbortError", e.cause = t, e;
		}
		let e = Error(String(t));
		return e.name = "AbortError", e;
	}
	let n = /* @__PURE__ */ Error("Request aborted");
	return n.name = "AbortError", n;
}
var RB = 64, zB = 20, BB = new Int32Array([
	1732584193,
	4023233417,
	2562383102,
	271733878,
	3285377520
]), VB = new Int32Array([
	1518500249,
	1859775393,
	2400959708,
	3395469782
]), HB = class e {
	digestLength = zB;
	state = Int32Array.from(BB);
	w;
	buffer = new Uint8Array(RB);
	bufferLength = 0;
	bytesHashed = 0;
	finished = !1;
	inner;
	outer;
	constructor(t) {
		if (t) {
			let n = e.normalizeKey(t);
			this.inner = new e(), this.outer = new e();
			let r = /* @__PURE__ */ new Uint8Array(128);
			for (let e = 0; e < RB; ++e) r[e] = 54 ^ n[e], r[e + RB] = 92 ^ n[e];
			this.inner.update(r.subarray(0, RB)), this.outer.update(r.subarray(RB));
		}
	}
	update(e) {
		if (this.finished) throw Error("Attempted to update an already finished HMAC.");
		if (this.inner) {
			this.inner.update(e);
			return;
		}
		let t = 0, { length: n } = e;
		if (this.bytesHashed += n, this.bufferLength > 0) {
			for (; n > 0 && this.bufferLength < RB;) this.buffer[this.bufferLength++] = e[t++], --n;
			this.bufferLength === RB && (this.hashBuffer(this.buffer, 0), this.bufferLength = 0);
		}
		for (; n >= RB;) this.hashBuffer(e, t), t += RB, n -= RB;
		for (; n > 0;) this.buffer[this.bufferLength++] = e[t++], --n;
	}
	async digest() {
		if (this.inner && this.outer) {
			if (this.finished) throw Error("Attempted to digest an already finished HMAC.");
			this.finished = !0;
			let e = this.inner.digestSync();
			return this.outer.update(e), this.outer.digestSync();
		}
		return this.digestSync();
	}
	reset() {
		this.state = Int32Array.from(BB), this.buffer = new Uint8Array(RB), this.bufferLength = 0, this.bytesHashed = 0;
	}
	digestSync() {
		let e = this.state.slice(), t = this.buffer.slice(), n = this.bufferLength, r = this.bytesHashed / 536870912 | 0, i = this.bytesHashed << 3;
		if (t[n++] = 128, n > 56) {
			for (let e = n; e < RB; ++e) t[e] = 0;
			this.hashBufferWith(e, t, 0), n = 0;
		}
		for (let e = n; e < 56; ++e) t[e] = 0;
		let a = new DataView(t.buffer, t.byteOffset, RB);
		a.setUint32(56, r, !1), a.setUint32(60, i, !1), this.hashBufferWith(e, t, 0);
		let o = new Uint8Array(zB);
		return o[0] = e[0] >>> 24 & 255, o[1] = e[0] >>> 16 & 255, o[2] = e[0] >>> 8 & 255, o[3] = e[0] & 255, o[4] = e[1] >>> 24 & 255, o[5] = e[1] >>> 16 & 255, o[6] = e[1] >>> 8 & 255, o[7] = e[1] & 255, o[8] = e[2] >>> 24 & 255, o[9] = e[2] >>> 16 & 255, o[10] = e[2] >>> 8 & 255, o[11] = e[2] & 255, o[12] = e[3] >>> 24 & 255, o[13] = e[3] >>> 16 & 255, o[14] = e[3] >>> 8 & 255, o[15] = e[3] & 255, o[16] = e[4] >>> 24 & 255, o[17] = e[4] >>> 16 & 255, o[18] = e[4] >>> 8 & 255, o[19] = e[4] & 255, o;
	}
	static normalizeKey(t) {
		let n = a(t);
		if (n.byteLength > RB) {
			let t = new e();
			t.update(n);
			let r = t.digestSync(), i = new Uint8Array(RB);
			return i.set(r), i;
		}
		let r = new Uint8Array(RB);
		return r.set(n), r;
	}
	hashBuffer(e, t) {
		this.hashBufferWith(this.state, e, t);
	}
	hashBufferWith(e, t, n) {
		let r = this.w ??= /* @__PURE__ */ new Int32Array(80), i = e[0], a = e[1], o = e[2], s = e[3], c = e[4];
		for (let e = 0; e < 16; ++e) r[e] = (t[n + e * 4] & 255) << 24 | (t[n + e * 4 + 1] & 255) << 16 | (t[n + e * 4 + 2] & 255) << 8 | t[n + e * 4 + 3] & 255;
		for (let e = 16; e < 80; ++e) {
			let t = r[e - 3] ^ r[e - 8] ^ r[e - 14] ^ r[e - 16];
			r[e] = t << 1 | t >>> 31;
		}
		for (let e = 0; e < 80; ++e) {
			let t = e < 20 ? 0 : e < 40 ? 1 : e < 60 ? 2 : 3, n = ((i << 5 | i >>> 27) + (t === 0 ? a & o ^ ~a & s : t === 2 ? a & o ^ a & s ^ o & s : a ^ o ^ s) | 0) + (c + (VB[t] + r[e] | 0) | 0) | 0;
			c = s, s = o, o = a << 30 | a >>> 2, a = i, i = n;
		}
		e[0] = e[0] + i | 0, e[1] = e[1] + a | 0, e[2] = e[2] + o | 0, e[3] = e[3] + s | 0, e[4] = e[4] + c | 0;
	}
}, UB = (e) => ({
	apiVersion: "2006-03-01",
	base64Decoder: e?.base64Decoder ?? St,
	base64Encoder: e?.base64Encoder ?? Ct,
	disableHostPrefix: e?.disableHostPrefix ?? !1,
	endpointProvider: e?.endpointProvider ?? bu,
	extensions: e?.extensions ?? [],
	getAwsChunkedEncodingStream: e?.getAwsChunkedEncodingStream ?? xr,
	httpAuthSchemeProvider: e?.httpAuthSchemeProvider ?? wu,
	httpAuthSchemes: e?.httpAuthSchemes ?? [{
		schemeId: "aws.auth#sigv4",
		identityProvider: (e) => e.getIdentityProvider("aws.auth#sigv4"),
		signer: new Hc()
	}, {
		schemeId: "aws.auth#sigv4a",
		identityProvider: (e) => e.getIdentityProvider("aws.auth#sigv4a"),
		signer: new Uc()
	}],
	logger: e?.logger ?? new _t(),
	md5: e?.md5 ?? ro,
	protocol: e?.protocol ?? Gs,
	protocolSettings: e?.protocolSettings ?? {
		defaultNamespace: "com.amazonaws.s3",
		errorTypeRegistries: mj,
		xmlNamespace: "http://s3.amazonaws.com/doc/2006-03-01/",
		version: "2006-03-01",
		serviceTarget: "AmazonS3"
	},
	sdkStreamMixin: e?.sdkStreamMixin ?? Er,
	serviceId: e?.serviceId ?? "S3",
	sha1: e?.sha1 ?? HB,
	sha256: e?.sha256 ?? wo,
	signerConstructor: e?.signerConstructor ?? f,
	signingEscapePath: e?.signingEscapePath ?? !1,
	urlParser: e?.urlParser ?? n,
	useArnRegion: e?.useArnRegion ?? void 0,
	utf8Decoder: e?.utf8Decoder ?? te,
	utf8Encoder: e?.utf8Encoder ?? Tt
}), WB = (e) => {
	let t = Ma(e), n = () => t().then(ct), r = UB(e);
	return {
		...r,
		...e,
		runtime: "browser",
		defaultsMode: t,
		bodyLengthChecker: e?.bodyLengthChecker ?? kn,
		credentialDefaultProvider: e?.credentialDefaultProvider ?? ((e) => () => Promise.reject(/* @__PURE__ */ Error("Credential is missing"))),
		defaultUserAgentProvider: e?.defaultUserAgentProvider ?? ya({
			serviceId: r.serviceId,
			clientVersion: MB.version
		}),
		eventStreamSerdeProvider: e?.eventStreamSerdeProvider ?? Nc,
		maxAttempts: e?.maxAttempts ?? 3,
		region: e?.region ?? Se("Region is missing"),
		requestHandler: IB.create(e?.requestHandler ?? n),
		retryMode: e?.retryMode ?? (async () => (await n()).retryMode || Si),
		streamCollector: e?.streamCollector ?? Sr,
		streamHasher: e?.streamHasher ?? no,
		useDualstackEndpoint: e?.useDualstackEndpoint ?? (() => Promise.resolve(!1)),
		useFipsEndpoint: e?.useFipsEndpoint ?? (() => Promise.resolve(!1))
	};
}, GB = (e) => {
	let t = e.httpAuthSchemes, n = e.httpAuthSchemeProvider, r = e.credentials;
	return {
		setHttpAuthScheme(e) {
			let n = t.findIndex((t) => t.schemeId === e.schemeId);
			n === -1 ? t.push(e) : t.splice(n, 1, e);
		},
		httpAuthSchemes() {
			return t;
		},
		setHttpAuthSchemeProvider(e) {
			n = e;
		},
		httpAuthSchemeProvider() {
			return n;
		},
		setCredentials(e) {
			r = e;
		},
		credentials() {
			return r;
		}
	};
}, KB = (e) => ({
	httpAuthSchemes: e.httpAuthSchemes(),
	httpAuthSchemeProvider: e.httpAuthSchemeProvider(),
	credentials: e.credentials()
}), qB = (e, t) => {
	let n = Object.assign(Pa(e), mt(e), Vr(e), GB(e));
	return t.forEach((e) => e.configure(n)), Object.assign(e, Fa(n), ht(n), Hr(n), KB(n));
}, JB = class extends Ie {
	config;
	constructor(...[e]) {
		let t = WB(e || {});
		super(t), this.initConfig = t;
		let n = ki(Aa(Ei(Bo(na(Eu(t)))))), r = qB(es(Tu(Pc(c(n))), { session: [() => this, jB] }), e?.extensions || []);
		this.config = r, this.middlewareStack.use(We(this.config)), this.middlewareStack.use(va(this.config)), this.middlewareStack.use(Di(this.config)), this.middlewareStack.use(Kr(this.config)), this.middlewareStack.use(Mi(this.config)), this.middlewareStack.use(Fi(this.config)), this.middlewareStack.use(Ii(this.config)), this.middlewareStack.use(Vi(this.config, {
			httpAuthSchemeParametersProvider: xu,
			identityProviderConfigProvider: async (e) => new Zi({
				"aws.auth#sigv4": e.credentials,
				"aws.auth#sigv4a": e.credentials
			})
		})), this.middlewareStack.use(Ki(this.config)), this.middlewareStack.use(Ts(this.config)), this.middlewareStack.use(Js(this.config)), this.middlewareStack.use(Xo(this.config)), this.middlewareStack.use(cs(this.config)), this.middlewareStack.use(ps(this.config));
	}
	destroy() {
		super.destroy();
	}
}, YB = class extends S(Du, w, "AbortMultipartUpload", DR) {}, XB = class extends S(Du, Iu, "CompleteMultipartUpload", OR) {}, ZB = class extends S(Ou, Iu, "CopyObject", kR) {}, QB = class extends S(ku, Lu, "CreateBucket", AR) {}, $B = class extends S(C, Ru, "CreateBucketMetadataConfiguration", jR) {}, eV = class extends S(C, Ru, "CreateBucketMetadataTableConfiguration", MR) {}, tV = class extends S(Du, Iu, "CreateMultipartUpload", NR) {}, nV = class extends S(C, T, "DeleteBucketAnalyticsConfiguration", IR) {}, rV = class extends S(C, T, "DeleteBucket", FR) {}, iV = class extends S(C, T, "DeleteBucketCors", LR) {}, aV = class extends S(C, T, "DeleteBucketEncryption", RR) {}, oV = class extends S(C, T, "DeleteBucketIntelligentTieringConfiguration", zR) {}, sV = class extends S(C, T, "DeleteBucketInventoryConfiguration", BR) {}, cV = class extends S(C, T, "DeleteBucketLifecycle", VR) {}, lV = class extends S(C, T, "DeleteBucketMetadataConfiguration", HR) {}, uV = class extends S(C, T, "DeleteBucketMetadataTableConfiguration", UR) {}, dV = class extends S(C, T, "DeleteBucketMetricsConfiguration", WR) {}, fV = class extends S(C, T, "DeleteBucketOwnershipControls", GR) {}, pV = class extends S(C, T, "DeleteBucketPolicy", KR) {}, mV = class extends S(C, T, "DeleteBucketReplication", qR) {}, hV = class extends S(C, T, "DeleteBucketTagging", JR) {}, gV = class extends S(C, T, "DeleteBucketWebsite", YR) {}, _V = class extends S(ju, w, "DeleteObjectAnnotation", ZR) {}, vV = class extends S(Du, w, "DeleteObject", XR) {}, yV = class extends S(ju, zu, "DeleteObjects", QR) {}, bV = class extends S(ju, w, "DeleteObjectTagging", $R) {}, xV = class extends S(C, T, "DeletePublicAccessBlock", ez) {}, SV = class extends S(ju, w, "GetBucketAbac", tz) {}, CV = class extends S(C, w, "GetBucketAccelerateConfiguration", nz) {}, wV = class extends S(C, w, "GetBucketAcl", rz) {}, TV = class extends S(C, w, "GetBucketAnalyticsConfiguration", iz) {}, EV = class extends S(C, w, "GetBucketCors", az) {}, DV = class extends S(C, w, "GetBucketEncryption", oz) {}, OV = class extends S(C, w, "GetBucketIntelligentTieringConfiguration", sz) {}, kV = class extends S(C, w, "GetBucketInventoryConfiguration", cz) {}, AV = class extends S(C, w, "GetBucketLifecycleConfiguration", lz) {}, jV = class extends S(C, w, "GetBucketLocation", uz) {}, MV = class extends S(C, w, "GetBucketLogging", dz) {}, NV = class extends S(C, w, "GetBucketMetadataConfiguration", fz) {}, PV = class extends S(C, w, "GetBucketMetadataTableConfiguration", pz) {}, FV = class extends S(C, w, "GetBucketMetricsConfiguration", mz) {}, IV = class extends S(C, w, "GetBucketNotificationConfiguration", hz) {}, LV = class extends S(C, w, "GetBucketOwnershipControls", gz) {}, RV = class extends S(C, T, "GetBucketPolicy", _z) {}, zV = class extends S(C, w, "GetBucketPolicyStatus", vz) {}, BV = class extends S(C, w, "GetBucketReplication", yz) {}, VV = class extends S(C, w, "GetBucketRequestPayment", bz) {}, HV = class extends S(C, w, "GetBucketTagging", xz) {}, UV = class extends S(C, w, "GetBucketVersioning", Sz) {}, WV = class extends S(C, w, "GetBucketWebsite", Cz) {}, GV = class extends S(Du, w, "GetObjectAcl", Tz) {}, KV = class extends S(Du, Bu, "GetObjectAnnotation", Ez) {}, qV = class extends S(ju, Iu, "GetObjectAttributes", Dz) {}, JV = class extends S(Du, Vu, "GetObject", wz) {}, YV = class extends S(ju, w, "GetObjectLegalHold", Oz) {}, XV = class extends S(ju, w, "GetObjectLockConfiguration", kz) {}, ZV = class extends S(ju, w, "GetObjectRetention", Az) {}, QV = class extends S(ju, w, "GetObjectTagging", jz) {}, $V = class extends S(ju, T, "GetObjectTorrent", Mz) {}, eH = class extends S(C, w, "GetPublicAccessBlock", Nz) {}, tH = class extends S(ju, w, "HeadBucket", Pz) {}, nH = class extends S(Du, Hu, "HeadObject", Fz) {}, rH = class extends S(C, w, "ListBucketAnalyticsConfigurations", Iz) {}, iH = class extends S(C, w, "ListBucketIntelligentTieringConfigurations", Lz) {}, aH = class extends S(C, w, "ListBucketInventoryConfigurations", Rz) {}, oH = class extends S(C, w, "ListBucketMetricsConfigurations", zz) {}, sH = class extends S(Mu, w, "ListBuckets", Bz) {}, cH = class extends S(Nu, w, "ListDirectoryBuckets", Vz) {}, lH = class extends S(Pu, w, "ListMultipartUploads", Hz) {}, uH = class extends S(ju, w, "ListObjectAnnotations", Uz) {}, dH = class extends S(Pu, w, "ListObjects", Wz) {}, fH = class extends S(Pu, w, "ListObjectsV2", Gz) {}, pH = class extends S(Pu, w, "ListObjectVersions", Kz) {}, mH = class extends S(Du, Iu, "ListParts", qz) {}, hH = class extends S(ju, Uu, "PutBucketAbac", Jz) {}, gH = class extends S(C, Uu, "PutBucketAccelerateConfiguration", Yz) {}, _H = class extends S(C, Ru, "PutBucketAcl", Xz) {}, vH = class extends S(C, T, "PutBucketAnalyticsConfiguration", Zz) {}, yH = class extends S(C, Ru, "PutBucketCors", Qz) {}, bH = class extends S(C, Ru, "PutBucketEncryption", $z) {}, xH = class extends S(C, T, "PutBucketIntelligentTieringConfiguration", eB) {}, SH = class extends S(C, T, "PutBucketInventoryConfiguration", tB) {}, CH = class extends S(C, zu, "PutBucketLifecycleConfiguration", nB) {}, wH = class extends S(C, Ru, "PutBucketLogging", rB) {}, TH = class extends S(C, T, "PutBucketMetricsConfiguration", iB) {}, EH = class extends S(C, T, "PutBucketNotificationConfiguration", aB) {}, DH = class extends S(C, Ru, "PutBucketOwnershipControls", oB) {}, OH = class extends S(C, Ru, "PutBucketPolicy", sB) {}, kH = class extends S(C, Ru, "PutBucketReplication", cB) {}, AH = class extends S(C, Ru, "PutBucketRequestPayment", lB) {}, jH = class extends S(C, Ru, "PutBucketTagging", uB) {}, MH = class extends S(C, Ru, "PutBucketVersioning", dB) {}, NH = class extends S(C, Ru, "PutBucketWebsite", fB) {}, PH = class extends S(Du, zu, "PutObjectAcl", mB) {}, FH = class extends S(Du, Wu, "PutObjectAnnotation", hB) {}, IH = class extends S(Du, Gu, "PutObject", pB) {}, LH = class extends S(ju, zu, "PutObjectLegalHold", gB) {}, RH = class extends S(ju, zu, "PutObjectLockConfiguration", _B) {}, zH = class extends S(ju, zu, "PutObjectRetention", vB) {}, BH = class extends S(ju, zu, "PutObjectTagging", yB) {}, VH = class extends S(C, Ru, "PutPublicAccessBlock", bB) {}, HH = class extends S(Du, w, "RenameObject", xB) {}, UH = class extends S(ju, Wu, "RestoreObject", SB) {}, WH = class extends S(ju, Ku, "SelectObjectContent", CB) {}, GH = class extends S(C, Ru, "UpdateBucketMetadataAnnotationTableConfiguration", wB) {}, KH = class extends S(C, Ru, "UpdateBucketMetadataInventoryTableConfiguration", TB) {}, qH = class extends S(C, Ru, "UpdateBucketMetadataJournalTableConfiguration", EB) {}, JH = class extends S(ju, zu, "UpdateObjectEncryption", DB) {}, YH = class extends S(Du, qu, "UploadPart", OB) {}, XH = class extends S(Au, Iu, "UploadPartCopy", kB) {}, ZH = class extends S(Fu, T, "WriteGetObjectResponse", AB) {}, QH = Yi(JB, sH, "ContinuationToken", "ContinuationToken", "MaxBuckets"), $H = Yi(JB, cH, "ContinuationToken", "ContinuationToken", "MaxDirectoryBuckets"), eU = Yi(JB, uH, "ContinuationToken", "NextContinuationToken", "MaxAnnotationResults"), tU = Yi(JB, fH, "ContinuationToken", "NextContinuationToken", "MaxKeys"), nU = Yi(JB, mH, "PartNumberMarker", "NextPartNumberMarker", "MaxParts"), rU = async (e, t) => {
	let n;
	try {
		return n = await e.send(new tH(t)), {
			state: Ee.SUCCESS,
			reason: n
		};
	} catch (e) {
		if (n = e, e.name === "NotFound") return {
			state: Ee.RETRY,
			reason: n
		};
	}
	return {
		state: Ee.RETRY,
		reason: n
	};
}, iU = async (e, t) => Fe({
	minDelay: 5,
	maxDelay: 120,
	...e
}, t, rU), aU = async (e, t) => De(await Fe({
	minDelay: 5,
	maxDelay: 120,
	...e
}, t, rU)), oU = async (e, t) => {
	let n;
	try {
		n = await e.send(new tH(t));
	} catch (e) {
		if (n = e, e.name === "NotFound") return {
			state: Ee.SUCCESS,
			reason: n
		};
	}
	return {
		state: Ee.RETRY,
		reason: n
	};
}, sU = async (e, t) => Fe({
	minDelay: 5,
	maxDelay: 120,
	...e
}, t, oU), cU = async (e, t) => De(await Fe({
	minDelay: 5,
	maxDelay: 120,
	...e
}, t, oU)), lU = async (e, t) => {
	let n;
	try {
		return n = await e.send(new nH(t)), {
			state: Ee.SUCCESS,
			reason: n
		};
	} catch (e) {
		if (n = e, e.name === "NotFound") return {
			state: Ee.RETRY,
			reason: n
		};
	}
	return {
		state: Ee.RETRY,
		reason: n
	};
}, uU = async (e, t) => Fe({
	minDelay: 5,
	maxDelay: 120,
	...e
}, t, lU), dU = async (e, t) => De(await Fe({
	minDelay: 5,
	maxDelay: 120,
	...e
}, t, lU)), fU = async (e, t) => {
	let n;
	try {
		n = await e.send(new nH(t));
	} catch (e) {
		if (n = e, e.name === "NotFound") return {
			state: Ee.SUCCESS,
			reason: n
		};
	}
	return {
		state: Ee.RETRY,
		reason: n
	};
}, pU = async (e, t) => Fe({
	minDelay: 5,
	maxDelay: 120,
	...e
}, t, fU), mU = async (e, t) => De(await Fe({
	minDelay: 5,
	maxDelay: 120,
	...e
}, t, fU)), hU = {
	AbortMultipartUploadCommand: YB,
	CompleteMultipartUploadCommand: XB,
	CopyObjectCommand: ZB,
	CreateBucketCommand: QB,
	CreateBucketMetadataConfigurationCommand: $B,
	CreateBucketMetadataTableConfigurationCommand: eV,
	CreateMultipartUploadCommand: tV,
	CreateSessionCommand: jB,
	DeleteBucketCommand: rV,
	DeleteBucketAnalyticsConfigurationCommand: nV,
	DeleteBucketCorsCommand: iV,
	DeleteBucketEncryptionCommand: aV,
	DeleteBucketIntelligentTieringConfigurationCommand: oV,
	DeleteBucketInventoryConfigurationCommand: sV,
	DeleteBucketLifecycleCommand: cV,
	DeleteBucketMetadataConfigurationCommand: lV,
	DeleteBucketMetadataTableConfigurationCommand: uV,
	DeleteBucketMetricsConfigurationCommand: dV,
	DeleteBucketOwnershipControlsCommand: fV,
	DeleteBucketPolicyCommand: pV,
	DeleteBucketReplicationCommand: mV,
	DeleteBucketTaggingCommand: hV,
	DeleteBucketWebsiteCommand: gV,
	DeleteObjectCommand: vV,
	DeleteObjectAnnotationCommand: _V,
	DeleteObjectsCommand: yV,
	DeleteObjectTaggingCommand: bV,
	DeletePublicAccessBlockCommand: xV,
	GetBucketAbacCommand: SV,
	GetBucketAccelerateConfigurationCommand: CV,
	GetBucketAclCommand: wV,
	GetBucketAnalyticsConfigurationCommand: TV,
	GetBucketCorsCommand: EV,
	GetBucketEncryptionCommand: DV,
	GetBucketIntelligentTieringConfigurationCommand: OV,
	GetBucketInventoryConfigurationCommand: kV,
	GetBucketLifecycleConfigurationCommand: AV,
	GetBucketLocationCommand: jV,
	GetBucketLoggingCommand: MV,
	GetBucketMetadataConfigurationCommand: NV,
	GetBucketMetadataTableConfigurationCommand: PV,
	GetBucketMetricsConfigurationCommand: FV,
	GetBucketNotificationConfigurationCommand: IV,
	GetBucketOwnershipControlsCommand: LV,
	GetBucketPolicyCommand: RV,
	GetBucketPolicyStatusCommand: zV,
	GetBucketReplicationCommand: BV,
	GetBucketRequestPaymentCommand: VV,
	GetBucketTaggingCommand: HV,
	GetBucketVersioningCommand: UV,
	GetBucketWebsiteCommand: WV,
	GetObjectCommand: JV,
	GetObjectAclCommand: GV,
	GetObjectAnnotationCommand: KV,
	GetObjectAttributesCommand: qV,
	GetObjectLegalHoldCommand: YV,
	GetObjectLockConfigurationCommand: XV,
	GetObjectRetentionCommand: ZV,
	GetObjectTaggingCommand: QV,
	GetObjectTorrentCommand: $V,
	GetPublicAccessBlockCommand: eH,
	HeadBucketCommand: tH,
	HeadObjectCommand: nH,
	ListBucketAnalyticsConfigurationsCommand: rH,
	ListBucketIntelligentTieringConfigurationsCommand: iH,
	ListBucketInventoryConfigurationsCommand: aH,
	ListBucketMetricsConfigurationsCommand: oH,
	ListBucketsCommand: sH,
	ListDirectoryBucketsCommand: cH,
	ListMultipartUploadsCommand: lH,
	ListObjectAnnotationsCommand: uH,
	ListObjectsCommand: dH,
	ListObjectsV2Command: fH,
	ListObjectVersionsCommand: pH,
	ListPartsCommand: mH,
	PutBucketAbacCommand: hH,
	PutBucketAccelerateConfigurationCommand: gH,
	PutBucketAclCommand: _H,
	PutBucketAnalyticsConfigurationCommand: vH,
	PutBucketCorsCommand: yH,
	PutBucketEncryptionCommand: bH,
	PutBucketIntelligentTieringConfigurationCommand: xH,
	PutBucketInventoryConfigurationCommand: SH,
	PutBucketLifecycleConfigurationCommand: CH,
	PutBucketLoggingCommand: wH,
	PutBucketMetricsConfigurationCommand: TH,
	PutBucketNotificationConfigurationCommand: EH,
	PutBucketOwnershipControlsCommand: DH,
	PutBucketPolicyCommand: OH,
	PutBucketReplicationCommand: kH,
	PutBucketRequestPaymentCommand: AH,
	PutBucketTaggingCommand: jH,
	PutBucketVersioningCommand: MH,
	PutBucketWebsiteCommand: NH,
	PutObjectCommand: IH,
	PutObjectAclCommand: PH,
	PutObjectAnnotationCommand: FH,
	PutObjectLegalHoldCommand: LH,
	PutObjectLockConfigurationCommand: RH,
	PutObjectRetentionCommand: zH,
	PutObjectTaggingCommand: BH,
	PutPublicAccessBlockCommand: VH,
	RenameObjectCommand: HH,
	RestoreObjectCommand: UH,
	SelectObjectContentCommand: WH,
	UpdateBucketMetadataAnnotationTableConfigurationCommand: GH,
	UpdateBucketMetadataInventoryTableConfigurationCommand: KH,
	UpdateBucketMetadataJournalTableConfigurationCommand: qH,
	UpdateObjectEncryptionCommand: JH,
	UploadPartCommand: YH,
	UploadPartCopyCommand: XH,
	WriteGetObjectResponseCommand: ZH
}, gU = {
	paginateListBuckets: QH,
	paginateListDirectoryBuckets: $H,
	paginateListObjectAnnotations: eU,
	paginateListObjectsV2: tU,
	paginateListParts: nU
}, _U = {
	waitUntilBucketExists: aU,
	waitUntilBucketNotExists: cU,
	waitUntilObjectExists: dU,
	waitUntilObjectNotExists: mU
}, vU = class extends JB {};
at(hU, vU, {
	paginators: gU,
	waiters: _U
});
var yU = {
	Disabled: "Disabled",
	Enabled: "Enabled"
}, bU = { requester: "requester" }, xU = { requester: "requester" }, SU = {
	Enabled: "Enabled",
	Suspended: "Suspended"
}, CU = {
	AmazonCustomerByEmail: "AmazonCustomerByEmail",
	CanonicalUser: "CanonicalUser",
	Group: "Group"
}, wU = {
	FULL_CONTROL: "FULL_CONTROL",
	READ: "READ",
	READ_ACP: "READ_ACP",
	WRITE: "WRITE",
	WRITE_ACP: "WRITE_ACP"
}, TU = { Destination: "Destination" }, EU = {
	COMPOSITE: "COMPOSITE",
	FULL_OBJECT: "FULL_OBJECT"
}, DU = {
	AES256: "AES256",
	aws_backup: "aws:backup",
	aws_fsx: "aws:fsx",
	aws_kms: "aws:kms",
	aws_kms_dsse: "aws:kms:dsse"
}, OU = {
	authenticated_read: "authenticated-read",
	aws_exec_read: "aws-exec-read",
	bucket_owner_full_control: "bucket-owner-full-control",
	bucket_owner_read: "bucket-owner-read",
	private: "private",
	public_read: "public-read",
	public_read_write: "public-read-write"
}, kU = {
	COPY: "COPY",
	EXCLUDE: "EXCLUDE"
}, AU = {
	CRC32: "CRC32",
	CRC32C: "CRC32C",
	CRC64NVME: "CRC64NVME",
	MD5: "MD5",
	SHA1: "SHA1",
	SHA256: "SHA256",
	SHA512: "SHA512",
	XXHASH128: "XXHASH128",
	XXHASH3: "XXHASH3",
	XXHASH64: "XXHASH64"
}, jU = {
	COPY: "COPY",
	REPLACE: "REPLACE"
}, MU = {
	OFF: "OFF",
	ON: "ON"
}, NU = {
	OFF: "OFF",
	ON: "ON"
}, PU = {
	COMPLIANCE: "COMPLIANCE",
	GOVERNANCE: "GOVERNANCE"
}, FU = {
	AWS_BACKUP_LOW_COST_WARM: "AWS_BACKUP_LOW_COST_WARM",
	AWS_BACKUP_WARM: "AWS_BACKUP_WARM",
	DEEP_ARCHIVE: "DEEP_ARCHIVE",
	EXPRESS_ONEZONE: "EXPRESS_ONEZONE",
	FSX_ONTAP: "FSX_ONTAP",
	FSX_OPENZFS: "FSX_OPENZFS",
	GLACIER: "GLACIER",
	GLACIER_IR: "GLACIER_IR",
	INTELLIGENT_TIERING: "INTELLIGENT_TIERING",
	ONEZONE_IA: "ONEZONE_IA",
	OUTPOSTS: "OUTPOSTS",
	REDUCED_REDUNDANCY: "REDUCED_REDUNDANCY",
	SNOW: "SNOW",
	STANDARD: "STANDARD",
	STANDARD_IA: "STANDARD_IA"
}, IU = {
	COPY: "COPY",
	REPLACE: "REPLACE"
}, LU = {
	authenticated_read: "authenticated-read",
	private: "private",
	public_read: "public-read",
	public_read_write: "public-read-write"
}, RU = {
	ACCOUNT_REGIONAL: "account-regional",
	GLOBAL: "global"
}, zU = {
	SingleAvailabilityZone: "SingleAvailabilityZone",
	SingleLocalZone: "SingleLocalZone"
}, BU = { Directory: "Directory" }, VU = {
	AvailabilityZone: "AvailabilityZone",
	LocalZone: "LocalZone"
}, HU = {
	EU: "EU",
	af_south_1: "af-south-1",
	ap_east_1: "ap-east-1",
	ap_east_2: "ap-east-2",
	ap_northeast_1: "ap-northeast-1",
	ap_northeast_2: "ap-northeast-2",
	ap_northeast_3: "ap-northeast-3",
	ap_south_1: "ap-south-1",
	ap_south_2: "ap-south-2",
	ap_southeast_1: "ap-southeast-1",
	ap_southeast_2: "ap-southeast-2",
	ap_southeast_3: "ap-southeast-3",
	ap_southeast_4: "ap-southeast-4",
	ap_southeast_5: "ap-southeast-5",
	ap_southeast_6: "ap-southeast-6",
	ap_southeast_7: "ap-southeast-7",
	ca_central_1: "ca-central-1",
	ca_west_1: "ca-west-1",
	cn_north_1: "cn-north-1",
	cn_northwest_1: "cn-northwest-1",
	eu_central_1: "eu-central-1",
	eu_central_2: "eu-central-2",
	eu_north_1: "eu-north-1",
	eu_south_1: "eu-south-1",
	eu_south_2: "eu-south-2",
	eu_west_1: "eu-west-1",
	eu_west_2: "eu-west-2",
	eu_west_3: "eu-west-3",
	il_central_1: "il-central-1",
	me_central_1: "me-central-1",
	me_south_1: "me-south-1",
	mx_central_1: "mx-central-1",
	sa_east_1: "sa-east-1",
	us_east_2: "us-east-2",
	us_gov_east_1: "us-gov-east-1",
	us_gov_west_1: "us-gov-west-1",
	us_west_1: "us-west-1",
	us_west_2: "us-west-2"
}, UU = {
	BucketOwnerEnforced: "BucketOwnerEnforced",
	BucketOwnerPreferred: "BucketOwnerPreferred",
	ObjectWriter: "ObjectWriter"
}, WU = {
	DISABLED: "DISABLED",
	ENABLED: "ENABLED"
}, GU = {
	AES256: "AES256",
	aws_kms: "aws:kms"
}, KU = {
	DISABLED: "DISABLED",
	ENABLED: "ENABLED"
}, qU = {
	DISABLED: "DISABLED",
	ENABLED: "ENABLED"
}, JU = {
	ReadOnly: "ReadOnly",
	ReadWrite: "ReadWrite"
}, YU = { CSV: "CSV" }, XU = { V_1: "V_1" }, ZU = {
	NONE: "NONE",
	SSE_C: "SSE-C"
}, QU = {
	Disabled: "Disabled",
	Enabled: "Enabled"
}, $U = {
	ARCHIVE_ACCESS: "ARCHIVE_ACCESS",
	DEEP_ARCHIVE_ACCESS: "DEEP_ARCHIVE_ACCESS"
}, eW = {
	CSV: "CSV",
	ORC: "ORC",
	Parquet: "Parquet"
}, tW = {
	All: "All",
	Current: "Current"
}, nW = {
	BucketKeyStatus: "BucketKeyStatus",
	ChecksumAlgorithm: "ChecksumAlgorithm",
	ETag: "ETag",
	EncryptionStatus: "EncryptionStatus",
	IntelligentTieringAccessTier: "IntelligentTieringAccessTier",
	IsMultipartUploaded: "IsMultipartUploaded",
	LastModifiedDate: "LastModifiedDate",
	LifecycleExpirationDate: "LifecycleExpirationDate",
	ObjectAccessControlList: "ObjectAccessControlList",
	ObjectLockEventHoldDuration: "ObjectLockEventHoldDuration",
	ObjectLockEventHoldStatus: "ObjectLockEventHoldStatus",
	ObjectLockLegalHoldStatus: "ObjectLockLegalHoldStatus",
	ObjectLockMode: "ObjectLockMode",
	ObjectLockRetainUntilDate: "ObjectLockRetainUntilDate",
	ObjectOwner: "ObjectOwner",
	ReplicationStatus: "ReplicationStatus",
	Size: "Size",
	StorageClass: "StorageClass"
}, rW = {
	Daily: "Daily",
	Weekly: "Weekly"
}, iW = {
	DEEP_ARCHIVE: "DEEP_ARCHIVE",
	GLACIER: "GLACIER",
	GLACIER_IR: "GLACIER_IR",
	INTELLIGENT_TIERING: "INTELLIGENT_TIERING",
	ONEZONE_IA: "ONEZONE_IA",
	STANDARD_IA: "STANDARD_IA"
}, aW = {
	Disabled: "Disabled",
	Enabled: "Enabled"
}, oW = {
	all_storage_classes_128K: "all_storage_classes_128K",
	varies_by_storage_class: "varies_by_storage_class"
}, sW = {
	FULL_CONTROL: "FULL_CONTROL",
	READ: "READ",
	WRITE: "WRITE"
}, cW = {
	DeliveryTime: "DeliveryTime",
	EventTime: "EventTime"
}, lW = {
	aws: "aws",
	customer: "customer"
}, uW = {
	s3_IntelligentTiering: "s3:IntelligentTiering",
	s3_LifecycleExpiration_: "s3:LifecycleExpiration:*",
	s3_LifecycleExpiration_Delete: "s3:LifecycleExpiration:Delete",
	s3_LifecycleExpiration_DeleteMarkerCreated: "s3:LifecycleExpiration:DeleteMarkerCreated",
	s3_LifecycleTransition: "s3:LifecycleTransition",
	s3_ObjectAcl_Put: "s3:ObjectAcl:Put",
	s3_ObjectAnnotation_: "s3:ObjectAnnotation:*",
	s3_ObjectAnnotation_Delete: "s3:ObjectAnnotation:Delete",
	s3_ObjectAnnotation_Put: "s3:ObjectAnnotation:Put",
	s3_ObjectCreated_: "s3:ObjectCreated:*",
	s3_ObjectCreated_CompleteMultipartUpload: "s3:ObjectCreated:CompleteMultipartUpload",
	s3_ObjectCreated_Copy: "s3:ObjectCreated:Copy",
	s3_ObjectCreated_Post: "s3:ObjectCreated:Post",
	s3_ObjectCreated_Put: "s3:ObjectCreated:Put",
	s3_ObjectRemoved_: "s3:ObjectRemoved:*",
	s3_ObjectRemoved_Delete: "s3:ObjectRemoved:Delete",
	s3_ObjectRemoved_DeleteMarkerCreated: "s3:ObjectRemoved:DeleteMarkerCreated",
	s3_ObjectRestore_: "s3:ObjectRestore:*",
	s3_ObjectRestore_Completed: "s3:ObjectRestore:Completed",
	s3_ObjectRestore_Delete: "s3:ObjectRestore:Delete",
	s3_ObjectRestore_Post: "s3:ObjectRestore:Post",
	s3_ObjectRetention_Put: "s3:ObjectRetention:Put",
	s3_ObjectTagging_: "s3:ObjectTagging:*",
	s3_ObjectTagging_Delete: "s3:ObjectTagging:Delete",
	s3_ObjectTagging_Put: "s3:ObjectTagging:Put",
	s3_ReducedRedundancyLostObject: "s3:ReducedRedundancyLostObject",
	s3_Replication_: "s3:Replication:*",
	s3_Replication_OperationFailedReplication: "s3:Replication:OperationFailedReplication",
	s3_Replication_OperationMissedThreshold: "s3:Replication:OperationMissedThreshold",
	s3_Replication_OperationNotTracked: "s3:Replication:OperationNotTracked",
	s3_Replication_OperationReplicatedAfterThreshold: "s3:Replication:OperationReplicatedAfterThreshold"
}, dW = {
	prefix: "prefix",
	suffix: "suffix"
}, fW = {
	Disabled: "Disabled",
	Enabled: "Enabled"
}, pW = {
	Disabled: "Disabled",
	Enabled: "Enabled"
}, mW = {
	Disabled: "Disabled",
	Enabled: "Enabled"
}, hW = {
	Disabled: "Disabled",
	Enabled: "Enabled"
}, gW = {
	Disabled: "Disabled",
	Enabled: "Enabled"
}, _W = {
	Disabled: "Disabled",
	Enabled: "Enabled"
}, vW = {
	Disabled: "Disabled",
	Enabled: "Enabled"
}, yW = {
	BucketOwner: "BucketOwner",
	Requester: "Requester"
}, bW = {
	Disabled: "Disabled",
	Enabled: "Enabled"
}, xW = {
	Enabled: "Enabled",
	Suspended: "Suspended"
}, SW = {
	http: "http",
	https: "https"
}, CW = {
	COMPLETE: "COMPLETE",
	COMPLETED: "COMPLETED",
	FAILED: "FAILED",
	PENDING: "PENDING",
	REPLICA: "REPLICA"
}, wW = { ENABLED: "ENABLED" }, TW = {
	CHECKSUM: "Checksum",
	ETAG: "ETag",
	OBJECT_PARTS: "ObjectParts",
	OBJECT_SIZE: "ObjectSize",
	STORAGE_CLASS: "StorageClass"
}, EW = { Enabled: "Enabled" }, DW = {
	COMPLIANCE: "COMPLIANCE",
	GOVERNANCE: "GOVERNANCE"
}, OW = {
	ARCHIVE_ACCESS: "ARCHIVE_ACCESS",
	DEEP_ARCHIVE_ACCESS: "DEEP_ARCHIVE_ACCESS"
}, kW = { url: "url" }, AW = {
	AWS_BACKUP_LOW_COST_WARM: "AWS_BACKUP_LOW_COST_WARM",
	AWS_BACKUP_WARM: "AWS_BACKUP_WARM",
	DEEP_ARCHIVE: "DEEP_ARCHIVE",
	EXPRESS_ONEZONE: "EXPRESS_ONEZONE",
	FSX_ONTAP: "FSX_ONTAP",
	FSX_OPENZFS: "FSX_OPENZFS",
	GLACIER: "GLACIER",
	GLACIER_IR: "GLACIER_IR",
	INTELLIGENT_TIERING: "INTELLIGENT_TIERING",
	ONEZONE_IA: "ONEZONE_IA",
	OUTPOSTS: "OUTPOSTS",
	REDUCED_REDUNDANCY: "REDUCED_REDUNDANCY",
	SNOW: "SNOW",
	STANDARD: "STANDARD",
	STANDARD_IA: "STANDARD_IA"
}, jW = { RESTORE_STATUS: "RestoreStatus" }, MW = { STANDARD: "STANDARD" }, NW = {
	Disabled: "Disabled",
	Enabled: "Enabled"
}, PW = {
	Bulk: "Bulk",
	Expedited: "Expedited",
	Standard: "Standard"
}, FW = { SQL: "SQL" }, IW = {
	BZIP2: "BZIP2",
	GZIP: "GZIP",
	NONE: "NONE"
}, LW = {
	IGNORE: "IGNORE",
	NONE: "NONE",
	USE: "USE"
}, RW = {
	DOCUMENT: "DOCUMENT",
	LINES: "LINES"
}, zW = {
	ALWAYS: "ALWAYS",
	ASNEEDED: "ASNEEDED"
}, BW = { SELECT: "SELECT" };
export { rt as $Command, Sj as AbacStatus$, Cj as AbortIncompleteMultipartUpload$, DR as AbortMultipartUpload$, YB as AbortMultipartUploadCommand, wj as AbortMultipartUploadOutput$, Tj as AbortMultipartUploadRequest$, Ej as AccelerateConfiguration$, Dj as AccessControlPolicy$, Oj as AccessControlTranslation$, Yu as AccessDenied, qA as AccessDenied$, kj as AnalyticsAndOperator$, Aj as AnalyticsConfiguration$, jj as AnalyticsExportDestination$, CR as AnalyticsFilter$, Mj as AnalyticsS3BucketDestination$, YU as AnalyticsS3ExportFileFormat, WU as AnnotationConfigurationState, kU as AnnotationDirective, Nj as AnnotationEntry$, ld as AnnotationLimitExceeded, JA as AnnotationLimitExceeded$, ud as AnnotationNameTooLong, YA as AnnotationNameTooLong$, Pj as AnnotationTableConfiguration$, Fj as AnnotationTableConfigurationResult$, Ij as AnnotationTableConfigurationUpdates$, OW as ArchiveStatus, Lj as BlockedEncryptionTypes$, Rj as Bucket$, yU as BucketAbacStatus, SU as BucketAccelerateStatus, Zu as BucketAlreadyExists, XA as BucketAlreadyExists$, Qu as BucketAlreadyOwnedByYou, ZA as BucketAlreadyOwnedByYou$, LU as BucketCannedACL, zj as BucketInfo$, Bj as BucketLifecycleConfiguration$, HU as BucketLocationConstraint, Vj as BucketLoggingStatus$, sW as BucketLogsPermission, RU as BucketNamespace, BU as BucketType, xW as BucketVersioningStatus, eM as CORSConfiguration$, tM as CORSRule$, dM as CSVInput$, fM as CSVOutput$, Hj as Checksum$, AU as ChecksumAlgorithm, wW as ChecksumMode, EU as ChecksumType, Uj as CommonPrefix$, OR as CompleteMultipartUpload$, XB as CompleteMultipartUploadCommand, Kj as CompleteMultipartUploadOutput$, qj as CompleteMultipartUploadRequest$, Wj as CompletedMultipartUpload$, Gj as CompletedPart$, IW as CompressionType, Jj as Condition$, Yj as ContinuationEvent$, kR as CopyObject$, ZB as CopyObjectCommand, Xj as CopyObjectOutput$, Zj as CopyObjectRequest$, Qj as CopyObjectResult$, $j as CopyPartResult$, AR as CreateBucket$, QB as CreateBucketCommand, nM as CreateBucketConfiguration$, jR as CreateBucketMetadataConfiguration$, $B as CreateBucketMetadataConfigurationCommand, rM as CreateBucketMetadataConfigurationRequest$, MR as CreateBucketMetadataTableConfiguration$, eV as CreateBucketMetadataTableConfigurationCommand, iM as CreateBucketMetadataTableConfigurationRequest$, aM as CreateBucketOutput$, oM as CreateBucketRequest$, NR as CreateMultipartUpload$, tV as CreateMultipartUploadCommand, sM as CreateMultipartUploadOutput$, cM as CreateMultipartUploadRequest$, PR as CreateSession$, jB as CreateSessionCommand, lM as CreateSessionOutput$, uM as CreateSessionRequest$, zU as DataRedundancy, pM as DefaultRetention$, mM as Delete$, FR as DeleteBucket$, IR as DeleteBucketAnalyticsConfiguration$, nV as DeleteBucketAnalyticsConfigurationCommand, hM as DeleteBucketAnalyticsConfigurationRequest$, rV as DeleteBucketCommand, LR as DeleteBucketCors$, iV as DeleteBucketCorsCommand, gM as DeleteBucketCorsRequest$, RR as DeleteBucketEncryption$, aV as DeleteBucketEncryptionCommand, _M as DeleteBucketEncryptionRequest$, zR as DeleteBucketIntelligentTieringConfiguration$, oV as DeleteBucketIntelligentTieringConfigurationCommand, vM as DeleteBucketIntelligentTieringConfigurationRequest$, BR as DeleteBucketInventoryConfiguration$, sV as DeleteBucketInventoryConfigurationCommand, yM as DeleteBucketInventoryConfigurationRequest$, VR as DeleteBucketLifecycle$, cV as DeleteBucketLifecycleCommand, bM as DeleteBucketLifecycleRequest$, HR as DeleteBucketMetadataConfiguration$, lV as DeleteBucketMetadataConfigurationCommand, xM as DeleteBucketMetadataConfigurationRequest$, UR as DeleteBucketMetadataTableConfiguration$, uV as DeleteBucketMetadataTableConfigurationCommand, SM as DeleteBucketMetadataTableConfigurationRequest$, WR as DeleteBucketMetricsConfiguration$, dV as DeleteBucketMetricsConfigurationCommand, CM as DeleteBucketMetricsConfigurationRequest$, GR as DeleteBucketOwnershipControls$, fV as DeleteBucketOwnershipControlsCommand, wM as DeleteBucketOwnershipControlsRequest$, KR as DeleteBucketPolicy$, pV as DeleteBucketPolicyCommand, TM as DeleteBucketPolicyRequest$, qR as DeleteBucketReplication$, mV as DeleteBucketReplicationCommand, EM as DeleteBucketReplicationRequest$, DM as DeleteBucketRequest$, JR as DeleteBucketTagging$, hV as DeleteBucketTaggingCommand, OM as DeleteBucketTaggingRequest$, YR as DeleteBucketWebsite$, gV as DeleteBucketWebsiteCommand, kM as DeleteBucketWebsiteRequest$, jM as DeleteMarkerEntry$, MM as DeleteMarkerReplication$, fW as DeleteMarkerReplicationStatus, XR as DeleteObject$, ZR as DeleteObjectAnnotation$, _V as DeleteObjectAnnotationCommand, NM as DeleteObjectAnnotationOutput$, PM as DeleteObjectAnnotationRequest$, vV as DeleteObjectCommand, FM as DeleteObjectOutput$, IM as DeleteObjectRequest$, $R as DeleteObjectTagging$, bV as DeleteObjectTaggingCommand, zM as DeleteObjectTaggingOutput$, BM as DeleteObjectTaggingRequest$, QR as DeleteObjects$, yV as DeleteObjectsCommand, LM as DeleteObjectsOutput$, RM as DeleteObjectsRequest$, ez as DeletePublicAccessBlock$, xV as DeletePublicAccessBlockCommand, VM as DeletePublicAccessBlockRequest$, AM as DeletedObject$, HM as Destination$, UM as DestinationResult$, kW as EncodingType, WM as Encryption$, GM as EncryptionConfiguration$, ZU as EncryptionType, ad as EncryptionTypeMismatch, QA as EncryptionTypeMismatch$, KM as EndEvent$, JM as ErrorDetails$, YM as ErrorDocument$, uW as Event, XM as EventBridgeConfiguration$, ZM as EventHoldDuration$, QM as ExistingObjectReplication$, hW as ExistingObjectReplicationStatus, qU as ExpirationState, aW as ExpirationStatus, FW as ExpressionType, LW as FileHeaderInfo, $M as FilterRule$, dW as FilterRuleName, tz as GetBucketAbac$, SV as GetBucketAbacCommand, eN as GetBucketAbacOutput$, tN as GetBucketAbacRequest$, nz as GetBucketAccelerateConfiguration$, CV as GetBucketAccelerateConfigurationCommand, nN as GetBucketAccelerateConfigurationOutput$, rN as GetBucketAccelerateConfigurationRequest$, rz as GetBucketAcl$, wV as GetBucketAclCommand, iN as GetBucketAclOutput$, aN as GetBucketAclRequest$, iz as GetBucketAnalyticsConfiguration$, TV as GetBucketAnalyticsConfigurationCommand, oN as GetBucketAnalyticsConfigurationOutput$, sN as GetBucketAnalyticsConfigurationRequest$, az as GetBucketCors$, EV as GetBucketCorsCommand, cN as GetBucketCorsOutput$, lN as GetBucketCorsRequest$, oz as GetBucketEncryption$, DV as GetBucketEncryptionCommand, uN as GetBucketEncryptionOutput$, dN as GetBucketEncryptionRequest$, sz as GetBucketIntelligentTieringConfiguration$, OV as GetBucketIntelligentTieringConfigurationCommand, fN as GetBucketIntelligentTieringConfigurationOutput$, pN as GetBucketIntelligentTieringConfigurationRequest$, cz as GetBucketInventoryConfiguration$, kV as GetBucketInventoryConfigurationCommand, mN as GetBucketInventoryConfigurationOutput$, hN as GetBucketInventoryConfigurationRequest$, lz as GetBucketLifecycleConfiguration$, AV as GetBucketLifecycleConfigurationCommand, gN as GetBucketLifecycleConfigurationOutput$, _N as GetBucketLifecycleConfigurationRequest$, uz as GetBucketLocation$, jV as GetBucketLocationCommand, vN as GetBucketLocationOutput$, yN as GetBucketLocationRequest$, dz as GetBucketLogging$, MV as GetBucketLoggingCommand, bN as GetBucketLoggingOutput$, xN as GetBucketLoggingRequest$, fz as GetBucketMetadataConfiguration$, NV as GetBucketMetadataConfigurationCommand, SN as GetBucketMetadataConfigurationOutput$, CN as GetBucketMetadataConfigurationRequest$, wN as GetBucketMetadataConfigurationResult$, pz as GetBucketMetadataTableConfiguration$, PV as GetBucketMetadataTableConfigurationCommand, TN as GetBucketMetadataTableConfigurationOutput$, EN as GetBucketMetadataTableConfigurationRequest$, DN as GetBucketMetadataTableConfigurationResult$, mz as GetBucketMetricsConfiguration$, FV as GetBucketMetricsConfigurationCommand, ON as GetBucketMetricsConfigurationOutput$, kN as GetBucketMetricsConfigurationRequest$, hz as GetBucketNotificationConfiguration$, IV as GetBucketNotificationConfigurationCommand, AN as GetBucketNotificationConfigurationRequest$, gz as GetBucketOwnershipControls$, LV as GetBucketOwnershipControlsCommand, jN as GetBucketOwnershipControlsOutput$, MN as GetBucketOwnershipControlsRequest$, _z as GetBucketPolicy$, RV as GetBucketPolicyCommand, NN as GetBucketPolicyOutput$, PN as GetBucketPolicyRequest$, vz as GetBucketPolicyStatus$, zV as GetBucketPolicyStatusCommand, FN as GetBucketPolicyStatusOutput$, IN as GetBucketPolicyStatusRequest$, yz as GetBucketReplication$, BV as GetBucketReplicationCommand, LN as GetBucketReplicationOutput$, RN as GetBucketReplicationRequest$, bz as GetBucketRequestPayment$, VV as GetBucketRequestPaymentCommand, zN as GetBucketRequestPaymentOutput$, BN as GetBucketRequestPaymentRequest$, xz as GetBucketTagging$, HV as GetBucketTaggingCommand, VN as GetBucketTaggingOutput$, HN as GetBucketTaggingRequest$, Sz as GetBucketVersioning$, UV as GetBucketVersioningCommand, UN as GetBucketVersioningOutput$, WN as GetBucketVersioningRequest$, Cz as GetBucketWebsite$, WV as GetBucketWebsiteCommand, GN as GetBucketWebsiteOutput$, KN as GetBucketWebsiteRequest$, wz as GetObject$, Tz as GetObjectAcl$, GV as GetObjectAclCommand, qN as GetObjectAclOutput$, JN as GetObjectAclRequest$, Ez as GetObjectAnnotation$, KV as GetObjectAnnotationCommand, YN as GetObjectAnnotationOutput$, XN as GetObjectAnnotationRequest$, Dz as GetObjectAttributes$, qV as GetObjectAttributesCommand, ZN as GetObjectAttributesOutput$, QN as GetObjectAttributesParts$, $N as GetObjectAttributesRequest$, JV as GetObjectCommand, Oz as GetObjectLegalHold$, YV as GetObjectLegalHoldCommand, eP as GetObjectLegalHoldOutput$, tP as GetObjectLegalHoldRequest$, kz as GetObjectLockConfiguration$, XV as GetObjectLockConfigurationCommand, nP as GetObjectLockConfigurationOutput$, rP as GetObjectLockConfigurationRequest$, iP as GetObjectOutput$, aP as GetObjectRequest$, Az as GetObjectRetention$, ZV as GetObjectRetentionCommand, oP as GetObjectRetentionOutput$, sP as GetObjectRetentionRequest$, jz as GetObjectTagging$, QV as GetObjectTaggingCommand, cP as GetObjectTaggingOutput$, lP as GetObjectTaggingRequest$, Mz as GetObjectTorrent$, $V as GetObjectTorrentCommand, uP as GetObjectTorrentOutput$, dP as GetObjectTorrentRequest$, Nz as GetPublicAccessBlock$, eH as GetPublicAccessBlockCommand, fP as GetPublicAccessBlockOutput$, pP as GetPublicAccessBlockRequest$, mP as GlacierJobParameters$, hP as Grant$, gP as Grantee$, Pz as HeadBucket$, tH as HeadBucketCommand, _P as HeadBucketOutput$, vP as HeadBucketRequest$, Fz as HeadObject$, nH as HeadObjectCommand, yP as HeadObjectOutput$, bP as HeadObjectRequest$, pd as IdempotencyParameterMismatch, $A as IdempotencyParameterMismatch$, xP as IndexDocument$, SP as Initiator$, CP as InputSerialization$, $U as IntelligentTieringAccessTier, wP as IntelligentTieringAndOperator$, TP as IntelligentTieringConfiguration$, EP as IntelligentTieringFilter$, QU as IntelligentTieringStatus, dd as InvalidAnnotationName, ej as InvalidAnnotationName$, td as InvalidObjectState, tj as InvalidObjectState$, id as InvalidPrefix, nj as InvalidPrefix$, od as InvalidRequest, rj as InvalidRequest$, sd as InvalidWriteOffset, ij as InvalidWriteOffset$, DP as InventoryConfiguration$, KU as InventoryConfigurationState, OP as InventoryDestination$, kP as InventoryEncryption$, AP as InventoryFilter$, eW as InventoryFormat, rW as InventoryFrequency, tW as InventoryIncludedObjectVersions, nW as InventoryOptionalField, jP as InventoryS3BucketDestination$, MP as InventorySchedule$, NP as InventoryTableConfiguration$, PP as InventoryTableConfigurationResult$, FP as InventoryTableConfigurationUpdates$, zP as JSONInput$, BP as JSONOutput$, RW as JSONType, IP as JournalTableConfiguration$, LP as JournalTableConfigurationResult$, RP as JournalTableConfigurationUpdates$, VP as LambdaFunctionConfiguration$, HP as LifecycleExpiration$, UP as LifecycleRule$, WP as LifecycleRuleAndOperator$, GP as LifecycleRuleFilter$, Iz as ListBucketAnalyticsConfigurations$, rH as ListBucketAnalyticsConfigurationsCommand, KP as ListBucketAnalyticsConfigurationsOutput$, qP as ListBucketAnalyticsConfigurationsRequest$, Lz as ListBucketIntelligentTieringConfigurations$, iH as ListBucketIntelligentTieringConfigurationsCommand, JP as ListBucketIntelligentTieringConfigurationsOutput$, YP as ListBucketIntelligentTieringConfigurationsRequest$, Rz as ListBucketInventoryConfigurations$, aH as ListBucketInventoryConfigurationsCommand, XP as ListBucketInventoryConfigurationsOutput$, ZP as ListBucketInventoryConfigurationsRequest$, zz as ListBucketMetricsConfigurations$, oH as ListBucketMetricsConfigurationsCommand, QP as ListBucketMetricsConfigurationsOutput$, $P as ListBucketMetricsConfigurationsRequest$, Bz as ListBuckets$, sH as ListBucketsCommand, eF as ListBucketsOutput$, tF as ListBucketsRequest$, Vz as ListDirectoryBuckets$, cH as ListDirectoryBucketsCommand, nF as ListDirectoryBucketsOutput$, rF as ListDirectoryBucketsRequest$, Hz as ListMultipartUploads$, lH as ListMultipartUploadsCommand, iF as ListMultipartUploadsOutput$, aF as ListMultipartUploadsRequest$, Uz as ListObjectAnnotations$, uH as ListObjectAnnotationsCommand, oF as ListObjectAnnotationsOutput$, sF as ListObjectAnnotationsRequest$, Kz as ListObjectVersions$, pH as ListObjectVersionsCommand, fF as ListObjectVersionsOutput$, pF as ListObjectVersionsRequest$, Wz as ListObjects$, dH as ListObjectsCommand, cF as ListObjectsOutput$, lF as ListObjectsRequest$, Gz as ListObjectsV2$, fH as ListObjectsV2Command, uF as ListObjectsV2Output$, dF as ListObjectsV2Request$, qz as ListParts$, mH as ListPartsCommand, mF as ListPartsOutput$, hF as ListPartsRequest$, gF as LocationInfo$, VU as LocationType, _F as LoggingEnabled$, NW as MFADelete, bW as MFADeleteStatus, vF as MetadataConfiguration$, yF as MetadataConfigurationResult$, jU as MetadataDirective, bF as MetadataEntry$, xF as MetadataTableConfiguration$, SF as MetadataTableConfigurationResult$, CF as MetadataTableEncryptionConfiguration$, wF as Metrics$, TF as MetricsAndOperator$, EF as MetricsConfiguration$, wR as MetricsFilter$, pW as MetricsStatus, DF as MultipartUpload$, nd as NoSuchAnnotation, aj as NoSuchAnnotation$, $u as NoSuchBucket, oj as NoSuchBucket$, ed as NoSuchKey, sj as NoSuchKey$, Ju as NoSuchUpload, cj as NoSuchUpload$, OF as NoncurrentVersionExpiration$, kF as NoncurrentVersionTransition$, rd as NotFound, lj as NotFound$, AF as NotificationConfiguration$, jF as NotificationConfigurationFilter$, md as ObjectAlreadyInActiveTierError, uj as ObjectAlreadyInActiveTierError$, TW as ObjectAttributes, OU as ObjectCannedACL, TR as ObjectEncryption$, NF as ObjectIdentifier$, PF as ObjectLockConfiguration$, EW as ObjectLockEnabled, MU as ObjectLockEventHold, FF as ObjectLockLegalHold$, NU as ObjectLockLegalHoldStatus, PU as ObjectLockMode, IF as ObjectLockRetention$, DW as ObjectLockRetentionMode, LF as ObjectLockRule$, Xu as ObjectNotInActiveTierError, dj as ObjectNotInActiveTierError$, UU as ObjectOwnership, RF as ObjectPart$, AW as ObjectStorageClass, zF as ObjectVersion$, MW as ObjectVersionStorageClass, jW as OptionalObjectAttributes, BF as OutputLocation$, VF as OutputSerialization$, HF as Owner$, TU as OwnerOverride, UF as OwnershipControls$, WF as OwnershipControlsRule$, GF as ParquetInput$, KF as Part$, cW as PartitionDateSource, qF as PartitionedPrefix$, yW as Payer, wU as Permission, JF as PolicyStatus$, YF as Progress$, XF as ProgressEvent$, SW as Protocol, ZF as PublicAccessBlockConfiguration$, Jz as PutBucketAbac$, hH as PutBucketAbacCommand, QF as PutBucketAbacRequest$, Yz as PutBucketAccelerateConfiguration$, gH as PutBucketAccelerateConfigurationCommand, $F as PutBucketAccelerateConfigurationRequest$, Xz as PutBucketAcl$, _H as PutBucketAclCommand, eI as PutBucketAclRequest$, Zz as PutBucketAnalyticsConfiguration$, vH as PutBucketAnalyticsConfigurationCommand, tI as PutBucketAnalyticsConfigurationRequest$, Qz as PutBucketCors$, yH as PutBucketCorsCommand, nI as PutBucketCorsRequest$, $z as PutBucketEncryption$, bH as PutBucketEncryptionCommand, rI as PutBucketEncryptionRequest$, eB as PutBucketIntelligentTieringConfiguration$, xH as PutBucketIntelligentTieringConfigurationCommand, iI as PutBucketIntelligentTieringConfigurationRequest$, tB as PutBucketInventoryConfiguration$, SH as PutBucketInventoryConfigurationCommand, aI as PutBucketInventoryConfigurationRequest$, nB as PutBucketLifecycleConfiguration$, CH as PutBucketLifecycleConfigurationCommand, oI as PutBucketLifecycleConfigurationOutput$, sI as PutBucketLifecycleConfigurationRequest$, rB as PutBucketLogging$, wH as PutBucketLoggingCommand, cI as PutBucketLoggingRequest$, iB as PutBucketMetricsConfiguration$, TH as PutBucketMetricsConfigurationCommand, lI as PutBucketMetricsConfigurationRequest$, aB as PutBucketNotificationConfiguration$, EH as PutBucketNotificationConfigurationCommand, uI as PutBucketNotificationConfigurationRequest$, oB as PutBucketOwnershipControls$, DH as PutBucketOwnershipControlsCommand, dI as PutBucketOwnershipControlsRequest$, sB as PutBucketPolicy$, OH as PutBucketPolicyCommand, fI as PutBucketPolicyRequest$, cB as PutBucketReplication$, kH as PutBucketReplicationCommand, pI as PutBucketReplicationRequest$, lB as PutBucketRequestPayment$, AH as PutBucketRequestPaymentCommand, mI as PutBucketRequestPaymentRequest$, uB as PutBucketTagging$, jH as PutBucketTaggingCommand, hI as PutBucketTaggingRequest$, dB as PutBucketVersioning$, MH as PutBucketVersioningCommand, gI as PutBucketVersioningRequest$, fB as PutBucketWebsite$, NH as PutBucketWebsiteCommand, _I as PutBucketWebsiteRequest$, pB as PutObject$, mB as PutObjectAcl$, PH as PutObjectAclCommand, vI as PutObjectAclOutput$, yI as PutObjectAclRequest$, hB as PutObjectAnnotation$, FH as PutObjectAnnotationCommand, bI as PutObjectAnnotationOutput$, xI as PutObjectAnnotationRequest$, IH as PutObjectCommand, gB as PutObjectLegalHold$, LH as PutObjectLegalHoldCommand, SI as PutObjectLegalHoldOutput$, CI as PutObjectLegalHoldRequest$, _B as PutObjectLockConfiguration$, RH as PutObjectLockConfigurationCommand, wI as PutObjectLockConfigurationOutput$, TI as PutObjectLockConfigurationRequest$, EI as PutObjectOutput$, DI as PutObjectRequest$, vB as PutObjectRetention$, zH as PutObjectRetentionCommand, OI as PutObjectRetentionOutput$, kI as PutObjectRetentionRequest$, yB as PutObjectTagging$, BH as PutObjectTaggingCommand, AI as PutObjectTaggingOutput$, jI as PutObjectTaggingRequest$, bB as PutPublicAccessBlock$, VH as PutPublicAccessBlockCommand, MI as PutPublicAccessBlockRequest$, NI as QueueConfiguration$, zW as QuoteFields, PI as RecordExpiration$, FI as RecordsEvent$, II as Redirect$, LI as RedirectAllRequestsTo$, xB as RenameObject$, HH as RenameObjectCommand, RI as RenameObjectOutput$, zI as RenameObjectRequest$, BI as ReplicaModifications$, gW as ReplicaModificationsStatus, VI as ReplicationConfiguration$, HI as ReplicationRule$, UI as ReplicationRuleAndOperator$, WI as ReplicationRuleFilter$, vW as ReplicationRuleStatus, CW as ReplicationStatus, GI as ReplicationTime$, mW as ReplicationTimeStatus, KI as ReplicationTimeValue$, bU as RequestCharged, xU as RequestPayer, qI as RequestPaymentConfiguration$, JI as RequestProgress$, SB as RestoreObject$, UH as RestoreObjectCommand, YI as RestoreObjectOutput$, XI as RestoreObjectRequest$, ZI as RestoreRequest$, BW as RestoreRequestType, QI as RestoreStatus$, $I as RoutingRule$, vU as S3, JB as S3Client, eL as S3KeyFilter$, tL as S3Location$, E as S3ServiceException, KA as S3ServiceException$, lW as S3TablesBucketType, nL as S3TablesDestination$, rL as S3TablesDestinationResult$, mL as SSEKMS$, gL as SSEKMSEncryption$, _L as SSES3$, iL as ScanRange$, CB as SelectObjectContent$, WH as SelectObjectContentCommand, ER as SelectObjectContentEventStream$, aL as SelectObjectContentOutput$, oL as SelectObjectContentRequest$, sL as SelectParameters$, DU as ServerSideEncryption, cL as ServerSideEncryptionByDefault$, lL as ServerSideEncryptionConfiguration$, uL as ServerSideEncryptionRule$, dL as SessionCredentials$, JU as SessionMode, fL as SimplePrefix$, pL as SourceSelectionCriteria$, hL as SseKmsEncryptedObjects$, _W as SseKmsEncryptedObjectsStatus, vL as Stats$, yL as StatsEvent$, FU as StorageClass, bL as StorageClassAnalysis$, xL as StorageClassAnalysisDataExport$, XU as StorageClassAnalysisSchemaVersion, GU as TableSseAlgorithm, SL as Tag$, CL as Tagging$, IU as TaggingDirective, wL as TargetGrant$, TL as TargetObjectKeyFormat$, PW as Tier, EL as Tiering$, cd as TooManyParts, fj as TooManyParts$, DL as TopicConfiguration$, OL as Transition$, oW as TransitionDefaultMinimumObjectSize, iW as TransitionStorageClass, CU as Type, fd as UnsupportedMediaType, pj as UnsupportedMediaType$, wB as UpdateBucketMetadataAnnotationTableConfiguration$, GH as UpdateBucketMetadataAnnotationTableConfigurationCommand, kL as UpdateBucketMetadataAnnotationTableConfigurationRequest$, TB as UpdateBucketMetadataInventoryTableConfiguration$, KH as UpdateBucketMetadataInventoryTableConfigurationCommand, AL as UpdateBucketMetadataInventoryTableConfigurationRequest$, EB as UpdateBucketMetadataJournalTableConfiguration$, qH as UpdateBucketMetadataJournalTableConfigurationCommand, jL as UpdateBucketMetadataJournalTableConfigurationRequest$, DB as UpdateObjectEncryption$, JH as UpdateObjectEncryptionCommand, ML as UpdateObjectEncryptionRequest$, NL as UpdateObjectEncryptionResponse$, OB as UploadPart$, YH as UploadPartCommand, kB as UploadPartCopy$, XH as UploadPartCopyCommand, PL as UploadPartCopyOutput$, FL as UploadPartCopyRequest$, IL as UploadPartOutput$, LL as UploadPartRequest$, RL as VersioningConfiguration$, zL as WebsiteConfiguration$, AB as WriteGetObjectResponse$, ZH as WriteGetObjectResponseCommand, BL as WriteGetObjectResponseRequest$, qM as _Error$, MF as _Object$, Ie as __Client, Ac as a, Dc as c, wc as d, mj as errorTypeRegistries, Cc as f, nc as g, ic as h, Nc as i, Ec as l, xc as m, Pc as n, kc as o, Sc as p, QH as paginateListBuckets, $H as paginateListDirectoryBuckets, eU as paginateListObjectAnnotations, tU as paginateListObjectsV2, nU as paginateListParts, jc as r, Oc as s, Fc as t, Tc as u, iU as waitForBucketExists, sU as waitForBucketNotExists, uU as waitForObjectExists, pU as waitForObjectNotExists, aU as waitUntilBucketExists, cU as waitUntilBucketNotExists, dU as waitUntilObjectExists, mU as waitUntilObjectNotExists };
