import { i as e } from "./rolldown-runtime-WOOOH1Hs.js";
import { d as t, l as n } from "./storage-jiCkQUgy.js";
import { a as r, c as i, i as a, l as o, o as s, s as c, t as l } from "./config-CS1KboEo.js";
import { n as u } from "./translate-CUv9RhnO.js";
import { r as d } from "./provider-registry-C_yJEJu8.js";
import { t as f } from "./oauth-B-yEgkSe.js";
var p = class extends Error {
	status;
	body;
	constructor(e, t, n) {
		super(t), this.status = e, this.body = n, this.name = "UploadApiError";
	}
};
function m() {
	return !!a();
}
var h = /* @__PURE__ */ new Set([
	"blob",
	"bin",
	"octet-stream"
]);
function g(e) {
	let t = e.name?.trim() ?? "", n = t.lastIndexOf(".");
	if (n > 0 && n < t.length - 1) {
		let e = t.slice(n + 1).toLowerCase();
		if (e && !h.has(e)) return t;
	}
	let r = e.type?.split("/")[1]?.split("+")[0]?.toLowerCase();
	return r === "jpeg" || r === "jpg" ? "image.jpg" : r && r !== "octet-stream" ? `image.${r}` : "image.png";
}
async function _(e, t) {
	let n = new FormData();
	n.append("file", e, g(e));
	let r = {};
	t && (r.Authorization = `Bearer ${t}`);
	let i = await fetch(`${l}/upload`, {
		method: "POST",
		headers: r,
		body: n
	});
	if (!i.ok) {
		let e = i.statusText, t;
		try {
			t = await i.json(), typeof t.message == "string" ? e = t.message : typeof t.error == "string" && (e = t.error);
		} catch {}
		throw new p(i.status, e, t);
	}
	let a = await i.json();
	if (!a.url) throw new p(i.status, "upload_failed");
	return a.url;
}
async function v(e) {
	if (!m()) throw Error(u("store.uploader.defaultHostRequiresApi"));
	return await _(e, await n.get(f) || void 0);
}
function y(e) {
	return {
		...e,
		enc: {
			Hex: e.Hex,
			Latin1: e.Latin1,
			Utf8: e.Utf8,
			Utf16: e.Utf16,
			Utf16BE: e.Utf16BE,
			Utf16LE: e.Utf16LE,
			Base64: e.Base64,
			Base64url: e.Base64url
		},
		mode: {
			CBC: e.CBC,
			CFB: e.CFB,
			CTR: e.CTR,
			CTRGladman: e.CTRGladman,
			OFB: e.OFB,
			ECB: e.ECB
		},
		pad: {
			Pkcs7: e.Pkcs7,
			AnsiX923: e.AnsiX923,
			Iso10126: e.Iso10126,
			Iso97971: e.Iso97971,
			ZeroPadding: e.ZeroPadding,
			NoPadding: e.NoPadding
		},
		format: {
			Hex: e.HexFormatter,
			OpenSSL: e.OpenSSLFormatter
		},
		kdf: { OpenSSL: e.OpenSSLKdf },
		x64: {
			Word: e.X64Word,
			WordArray: e.X64WordArray
		},
		algo: {
			MD5: e.MD5Algo,
			SHA1: e.SHA1Algo,
			SHA224: e.SHA224Algo,
			SHA256: e.SHA256Algo,
			SHA384: e.SHA384Algo,
			SHA512: e.SHA512Algo,
			SHA3: e.SHA3Algo,
			RIPEMD160: e.RIPEMD160Algo,
			HMAC: e.HMAC,
			PBKDF2: e.PBKDF2Algo,
			EvpKDF: e.EvpKDFAlgo,
			AES: e.AESAlgo,
			DES: e.DESAlgo,
			TripleDES: e.TripleDESAlgo,
			Rabbit: e.RabbitAlgo,
			RabbitLegacy: e.RabbitLegacyAlgo,
			RC4: e.RC4Algo,
			RC4Drop: e.RC4DropAlgo,
			Blowfish: e.BlowfishAlgo
		},
		lib: {
			Base: e.Base,
			WordArray: e.WordArray,
			BufferedBlockAlgorithm: e.BufferedBlockAlgorithm,
			Hasher: e.Hasher,
			Cipher: e.Cipher,
			StreamCipher: e.StreamCipher,
			BlockCipher: e.BlockCipher,
			CipherParams: e.CipherParams,
			SerializableCipher: e.SerializableCipher,
			PasswordBasedCipher: e.PasswordBasedCipher
		}
	};
}
var b = null;
function x() {
	return b ??= import("./dist-BdHio7w4.js").then(y), b;
}
var S = null;
async function C() {
	return S ||= Promise.all([import("./dist-es-BGbb-8tE.js"), import("./dist-es-DCION3WI.js")]).then(([e, t]) => ({
		S3Client: e.S3Client,
		PutObjectCommand: e.PutObjectCommand,
		getSignedUrl: t.getSignedUrl
	})), S;
}
function w(e, t = "configuration") {
	if (!e) throw Error(`${t} is missing or empty`);
	try {
		return JSON.parse(e);
	} catch {
		throw Error(`Failed to parse ${t}: corrupted data`);
	}
}
async function T(e) {
	let t = await n.getJSON(`${e}Config`, {}) || {}, r = t.repo.replace(`https://${e}.com/`, "").replace(`http://${e}.com/`, "").replace(`${e}.com/`, "").split("/");
	return {
		username: r[0],
		repo: r[1],
		branch: t.branch || "master",
		accessToken: t.accessToken,
		useCDN: t.useCDN ?? !1
	};
}
function E() {
	let e = /* @__PURE__ */ new Date();
	return `${e.getFullYear()}/${(e.getMonth() + 1).toString().padStart(2, "0")}/${e.getDate().toString().padStart(2, "0")}`;
}
function D(e) {
	let n = Date.now(), r = e.split(".").pop();
	return `${n}-${t()}.${r}`;
}
async function O(e, t) {
	return await v(t);
}
async function k(e, t) {
	let { username: n, repo: r, branch: i, accessToken: a, useCDN: s } = await T("github"), c = `https://api.github.com/repos/${n}/${r}/contents/${E()}/`, l = D(t), u = await o({
		url: c + l,
		method: "put",
		headers: { Authorization: `token ${a}` },
		data: {
			content: e,
			branch: i,
			message: `Upload by ${window.location.href}`
		}
	}), d = `raw.githubusercontent.com/${n}/${r}/${i}/`, f = `fastly.jsdelivr.net/gh/${n}/${r}@${i}/`;
	return u.content = u.data?.content || u.content, s ? u.content.download_url.replace(d, f) : u.content.download_url;
}
async function A(e, t, n) {
	let a = await x(), o = JSON.stringify(n), c = r(i(o)), l = a.HmacSHA1(c, t).toString(a.enc.Base64);
	return `${e}:${s(l)}:${c}`;
}
async function j() {
	return import("./esm-EyeMpEWb.js");
}
async function M(e) {
	let t = await j(), { accessKey: r, secretKey: i, bucket: a, region: o, path: s, domain: c } = w(await n.get("qiniuConfig"), "qiniu config"), l = await A(r, i, {
		scope: a,
		deadline: Math.trunc(Date.now() / 1e3) + 3600
	}), u = (s ? `${s}/` : "") + D(e.name), d = o?.trim(), f = d ? { region: d } : {}, p = t.upload(e, u, l, {}, f);
	return new Promise((e, t) => {
		p.subscribe({
			next: () => {},
			error: (e) => {
				t(e.message);
			},
			complete: (t) => {
				e(`${c}/${t.key}`);
			}
		});
	});
}
async function N(e) {
	let t = D(e.name), { region: r, bucket: i, accessKeyId: a, accessKeySecret: o, useSSL: s, cdnHost: c, path: l } = await n.getJSON("aliOSSConfig", {
		region: "",
		bucket: "",
		accessKeyId: "",
		accessKeySecret: "",
		useSSL: !0,
		cdnHost: "",
		path: ""
	}) || {
		region: "",
		bucket: "",
		accessKeyId: "",
		accessKeySecret: "",
		useSSL: !0,
		cdnHost: "",
		path: ""
	}, u = s === void 0 || s ? "https" : "http", d = `${u}://${r}.aliyuncs.com`, f = {
		region: r,
		credentials: {
			accessKeyId: a,
			secretAccessKey: o
		},
		endpoint: d,
		forcePathStyle: !1
	}, { S3Client: p, PutObjectCommand: m, getSignedUrl: h } = await C(), g = new p(f), _ = (l ? `${l}/` : "") + t, v = new m({
		Bucket: i,
		Key: _,
		ContentType: e.type
	});
	try {
		let t = await h(g, v, { expiresIn: 300 }), n = await window.fetch(t, {
			method: "PUT",
			headers: { "Content-Type": e.type },
			body: e
		});
		if (!n.ok) throw Error(`Upload failed: ${n.statusText}`);
		return c ? `${c.endsWith("/") ? c.slice(0, -1) : c}/${_}` : `${u}://${i}.${r}.aliyuncs.com/${_}`;
	} catch (e) {
		return Promise.reject(e);
	}
}
async function P(e) {
	let t = D(e.name), { secretId: r, secretKey: i, bucket: a, region: o, path: s, cdnHost: c } = w(await n.get("txCOSConfig"), "txCOS config"), l = `https://cos.${o}.myqcloud.com`, u = {
		region: o,
		credentials: {
			accessKeyId: r,
			secretAccessKey: i
		},
		endpoint: l,
		forcePathStyle: !1
	}, { S3Client: d, PutObjectCommand: f, getSignedUrl: p } = await C(), m = new d(u), h = (s ? `${s}/` : "") + t, g = new f({
		Bucket: a,
		Key: h,
		ContentType: e.type
	});
	try {
		let n = await p(m, g, { expiresIn: 300 }), r = await window.fetch(n, {
			method: "PUT",
			headers: { "Content-Type": e.type },
			body: e
		});
		if (!r.ok) throw Error(`Upload failed: ${r.statusText}`);
		return c ? s === "" ? `${c}/${t}` : `${c}/${s}/${t}` : `https://${a}.cos.${o}.myqcloud.com/${h}`;
	} catch (e) {
		return Promise.reject(e);
	}
}
async function F(e) {
	let t = D(e.name), { endpoint: r, port: i, useSSL: a, bucket: o, accessKey: s, secretKey: c } = w(await n.get("minioConfig"), "minio config"), { S3Client: l, PutObjectCommand: u, getSignedUrl: d } = await C(), f = await d(new l({
		endpoint: `${a ? "https" : "http"}://${r}${i ? `:${i}` : ""}`,
		credentials: {
			accessKeyId: s,
			secretAccessKey: c
		},
		region: "auto",
		forcePathStyle: !0
	}), new u({
		Bucket: o,
		Key: t,
		ContentType: e.type
	}), { expiresIn: 300 }), p = await window.fetch(f, {
		method: "PUT",
		headers: { "Content-Type": e.type },
		body: e
	});
	if (!p.ok) throw Error(`MinIO upload failed: ${p.status} ${p.statusText}`);
	return `${a ? "https" : "http"}://${r}${i ? `:${i}` : ""}/${o}/${t}`;
}
var I = /^https?:\/\//;
async function L(e) {
	let t = D(e.name), { endpoint: r, region: i, bucket: a, accessKeyId: o, accessKeySecret: s, path: c, cdnHost: l, pathStyle: u } = await n.getJSON("s3Config", {
		endpoint: "",
		region: "",
		bucket: "",
		accessKeyId: "",
		accessKeySecret: "",
		path: "",
		cdnHost: "",
		pathStyle: !1
	}), d = r ? r.startsWith("http") ? r : `https://${r}` : void 0, f = {
		region: i,
		credentials: {
			accessKeyId: o,
			secretAccessKey: s
		},
		forcePathStyle: u,
		endpoint: d
	}, { S3Client: p, PutObjectCommand: m, getSignedUrl: h } = await C(), g = new p(f), _ = (c ? `${c}/` : "") + t, v = await h(g, new m({
		Bucket: a,
		Key: _,
		ContentType: e.type
	}), { expiresIn: 300 }), y = await window.fetch(v, {
		method: "PUT",
		headers: { "Content-Type": e.type },
		body: e
	});
	if (!y.ok) throw Error(`Upload failed: ${y.statusText}`);
	if (l) return `${l.endsWith("/") ? l.slice(0, -1) : l}/${_}`;
	if (r && d) {
		let e = d.startsWith("https") ? "https" : "http", t = d.replace(I, "");
		return u ? `${e}://${t}/${a}/${_}` : `${e}://${a}.${t}/${_}`;
	}
	return `https://${a}.s3.${i}.amazonaws.com/${_}`;
}
async function R(e, t, r) {
	let i = await n.get(`mpToken:${e}`);
	if (i) try {
		let e = JSON.parse(i);
		if (e.expire && e.expire > Date.now()) return e.access_token;
	} catch {}
	let a = {
		method: "POST",
		data: {
			grant_type: "client_credential",
			appid: e,
			secret: t
		}
	}, s = "https://api.weixin.qq.com/cgi-bin/stable_token";
	r && (s = `${r}/cgi-bin/stable_token`);
	let c = await o(s, a);
	if (c.access_token) {
		let t = {
			...c,
			expire: Date.now() + c.expires_in * 1e3
		};
		return await n.setJSON(`mpToken:${e}`, t), c.access_token;
	}
	if (c.errcode) throw Error(`${u("upload.provider.accessTokenFailed")}: [${c.errcode}] ${c.errmsg}`);
	return "";
}
async function z(e) {
	let { appID: t, appsecret: r, proxyOrigin: i } = w(await n.get("mpConfig"), "mp config"), a = await R(t, r, i);
	if (!a) throw Error(u("upload.provider.accessTokenFailed"));
	let s = new FormData();
	s.append("media", e, e.name);
	let c = {
		method: "POST",
		data: s
	}, l = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${a}&type=image`, d = e.size / 1048576, f = e.type.toLowerCase();
	d < 1 && (f === "image/jpeg" || f === "image/png") && (l = `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${a}`), i && (l = l.replace("https://api.weixin.qq.com", i));
	let p = await o(l, c);
	if (!p.url) {
		let e = p.errcode ? `: [${p.errcode}] ${p.errmsg}` : "";
		throw Error(u("upload.provider.uploadNoUrl") + e);
	}
	let m = p.url;
	return i && window.location.href.startsWith("http") && (m = `https://wsrv.nl?url=${encodeURIComponent(m)}`), m;
}
async function B(e) {
	let { accountId: t, accessKey: r, secretKey: i, bucket: a, path: o, domain: s } = w(await n.get("r2Config"), "r2 config"), c = (o ? `${o}/` : "") + D(e.name), { S3Client: l, PutObjectCommand: u, getSignedUrl: d } = await C(), f = await d(new l({
		region: "auto",
		endpoint: `https://${t}.r2.cloudflarestorage.com`,
		credentials: {
			accessKeyId: r,
			secretAccessKey: i
		}
	}), new u({
		Bucket: a,
		Key: c,
		ContentType: e.type
	}), { expiresIn: 300 }), p = await window.fetch(f, {
		method: "PUT",
		headers: { "Content-Type": e.type },
		body: e
	});
	if (!p.ok) throw Error(`R2 upload failed: ${p.status} ${p.statusText}`);
	return `${s}/${c}`;
}
async function V(e) {
	let { bucket: t, operator: r, password: i, path: a, domain: o } = w(await n.get("upyunConfig"), "upyun config"), s = `${a}/${D(e.name)}`, c = `/${t}/${s}`, l = await e.arrayBuffer(), d = (/* @__PURE__ */ new Date()).toUTCString(), f = [
		"PUT",
		c,
		d
	].join("&"), p = await x(), m = p.MD5(i).toString(), h = `UPYUN ${r}:${p.HmacSHA1(f, m).toString(p.enc.Base64)}`, g = `https://v0.api.upyun.com${c}`, _ = await window.fetch(g, {
		method: "PUT",
		headers: {
			Authorization: h,
			"X-Date": d,
			"Content-Type": e.type
		},
		body: l
	});
	if (!_.ok) throw Error(u("upload.provider.uploadFailedWithDetail", { detail: await _.text() }));
	return `${o}/${s}`;
}
async function H(e) {
	let { token: t, chatId: r } = await n.getJSON("telegramConfig", {
		token: "",
		chatId: ""
	}) || {
		token: "",
		chatId: ""
	}, i = new FormData();
	i.append("chat_id", r), i.append("photo", e, e.name);
	let a = await o({
		url: `https://api.telegram.org/bot${t}/sendPhoto`,
		method: "POST",
		data: i
	});
	if (!a.ok || !a.result.photo.length) throw Error(u("upload.provider.telegramSendPhotoFailed"));
	let s = a.result.photo[a.result.photo.length - 1].file_id, c = await o({
		url: `https://api.telegram.org/bot${t}/getFile?file_id=${s}`,
		method: "GET"
	});
	if (!c.ok) throw Error(u("upload.provider.telegramGetFileFailed"));
	return `https://api.telegram.org/file/bot${t}/${c.result.file_path}`;
}
async function U(e) {
	let { cloudName: t, apiKey: r, apiSecret: i, uploadPreset: a, folder: s = "", domain: c } = await n.getJSON("cloudinaryConfig", {
		cloudName: "",
		apiKey: "",
		apiSecret: "",
		uploadPreset: "",
		folder: "",
		domain: ""
	}) || {
		cloudName: "",
		apiKey: "",
		apiSecret: "",
		uploadPreset: "",
		folder: "",
		domain: ""
	};
	if (!t || !r) throw Error(u("upload.provider.cloudinaryMissingConfig"));
	let l = Math.floor(Date.now() / 1e3), d = new FormData();
	if (d.append("file", e), d.append("api_key", r), d.append("timestamp", `${l}`), i) {
		let e = [];
		s && e.push(`folder=${s}`), a && e.push(`upload_preset=${a}`), e.push(`timestamp=${l}`);
		let t = e.sort().join("&"), n = (await x()).SHA1(t + i).toString();
		d.append("signature", n);
	} else if (a) d.append("upload_preset", a);
	else throw Error(u("upload.provider.cloudinaryMissingPreset"));
	s && d.append("folder", s);
	let f = `https://api.cloudinary.com/v1_1/${t}/image/upload`, p = await o(f, {
		method: "POST",
		data: d
	}), m = p.secure_url || p.url;
	if (!m) throw Error(u("upload.provider.cloudinaryMissingUrl"));
	if (c) {
		let { pathname: e, search: t } = new URL(m);
		return `${c}${e}${t}`;
	}
	return m;
}
async function W(r, i) {
	let a = await n.get("formCustomConfig"), [{ S3Client: s, PutObjectCommand: l, getSignedUrl: u }, d, f, p] = await Promise.all([
		C(),
		j(),
		x(),
		import("./buffer-from-BCDylzzi.js").then((t) => /* @__PURE__ */ e(t.default, 1)).then((e) => e.default)
	]), m = `
    async (CUSTOM_ARG) => {
      ${a}
    }
  `;
	return new Promise((e, n) => {
		let a = {
			content: r,
			file: i,
			util: {
				axios: o,
				CryptoJS: f,
				Buffer: p,
				uuidv4: t,
				qiniu: d,
				tokenTools: c,
				getDir: E,
				getDateFilename: D,
				S3: {
					S3Client: s,
					PutObjectCommand: l,
					getSignedUrl: u
				}
			},
			okCb: e,
			errCb: n
		};
		Function(`return (${m})`)()(a).catch((e) => {
			n(e);
		});
	});
}
var G = {
	default: (e, t) => O(e, t),
	github: (e, t) => k(e, t.name),
	aliOSS: (e, t) => N(t),
	txCOS: (e, t) => P(t),
	qiniu: (e, t) => M(t),
	minio: (e, t) => F(t),
	s3: (e, t) => L(t),
	mp: (e, t) => z(t),
	r2: (e, t) => B(t),
	upyun: (e, t) => V(t),
	telegram: (e, t) => H(t),
	cloudinary: (e, t) => U(t),
	formCustom: (e, t) => W(e, t)
};
async function K(e, t) {
	let r = await n.get("imgHost");
	return r || await n.set("imgHost", "default"), G[d(r).id](e, t);
}
export { K as fileUpload };
