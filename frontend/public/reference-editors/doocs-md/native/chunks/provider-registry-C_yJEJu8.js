import { l as e } from "./storage-jiCkQUgy.js";
var t = [
	{
		id: "default",
		configKey: null
	},
	{
		id: "github",
		configKey: "githubConfig"
	},
	{
		id: "aliOSS",
		configKey: "aliOSSConfig"
	},
	{
		id: "txCOS",
		configKey: "txCOSConfig"
	},
	{
		id: "qiniu",
		configKey: "qiniuConfig"
	},
	{
		id: "minio",
		configKey: "minioConfig"
	},
	{
		id: "s3",
		configKey: "s3Config"
	},
	{
		id: "mp",
		configKey: "mpConfig"
	},
	{
		id: "r2",
		configKey: "r2Config"
	},
	{
		id: "upyun",
		configKey: "upyunConfig"
	},
	{
		id: "telegram",
		configKey: "telegramConfig"
	},
	{
		id: "cloudinary",
		configKey: "cloudinaryConfig"
	},
	{
		id: "formCustom",
		configKey: "formCustomConfig"
	}
];
function n(e) {
	return typeof e == "string" && t.some((t) => t.id === e);
}
function r(e) {
	let r = n(e) ? e : "default";
	return t.find((e) => e.id === r);
}
async function i(t) {
	let n = r(t);
	return n.configKey == null || !!await e.get(n.configKey);
}
export { i as n, r, t };
