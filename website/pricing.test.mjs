import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import test from "node:test";

const websiteRoot = new URL("./", import.meta.url);
const html = await readFile(new URL("./index.html", websiteRoot), "utf8");
const visibleText = html
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const referral = "请联系向你推荐 CreatorOS 的授权合作伙伴，了解适用方案、交付方式与当前政策。";

async function publicFiles(directory, output = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "deploy" || entry.name.endsWith(".test.mjs")) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await publicFiles(path, output);
    else output.push(path);
  }
  return output;
}

test("官网只公开产品能力、设备支持和授权伙伴获取方式", () => {
  for (const expected of [
    "适配与交付",
    "一机一码",
    "每个激活码仅绑定 1 台设备",
    "Apple 芯片 Mac",
    "Windows",
    "Intel Mac",
    "适配推进中",
    referral,
  ]) {
    assert.ok(visibleText.includes(expected), `缺少公开信息：${expected}`);
  }
});

test("官网源码不再公开任何价盘、利润或个人联系方式", () => {
  const forbiddenExact = [
    "zyong181818z",
    "R15929072019",
    "z17362936917@163.com",
    "shots/wechat-qr.png",
    "内测价",
    "续费价",
    "进货价",
    "指导价",
    "零售价",
    "单笔价差",
    "首购自动成为代理",
    "加我微信",
  ];
  for (const forbidden of forbiddenExact) {
    assert.ok(!html.includes(forbidden), `仍存在敏感公开信息：${forbidden}`);
  }

  for (const pattern of [
    /[¥￥$€£]\s*[\d,.]+/,
    /(?:RMB|CNY|USD|EUR|GBP|人民币|美元|美金|欧元|英镑)\s*[\d,.]+/i,
    /[\d,.]+\s*(?:元|块|美元|美金|欧元|英镑)/,
  ]) {
    assert.doesNotMatch(html, pattern, `仍存在金额表达：${pattern}`);
  }
});

test("价格、购买、合作和联系 FAQ 都只返回授权伙伴指引", () => {
  for (const keyword of ["价格", "购买", "代理", "联系"]) {
    assert.ok(html.includes(`\"${keyword}\"`), `FAQ 缺少关键词：${keyword}`);
  }
  assert.ok(html.split(referral).length - 1 >= 2, "页面与 FAQ 必须共用同一条授权伙伴指引");
  assert.ok((html.match(/a:REFERRAL/g) || []).length >= 3, "价格、合作、联系 FAQ 必须直接返回授权伙伴指引");
  assert.ok(html.includes('+REFERRAL'), "购买 FAQ 必须附带授权伙伴指引");
});

test("页面不存在旧价格/直营锚点或假按钮", () => {
  assert.doesNotMatch(html, /href=["']#(?:price|join)["']/i);
  assert.doesNotMatch(visibleText, /(?:咨询购买|加微信|复制联系方式|直接找我)/);
});

test("公开部署输入不包含联系人或二维码资源", async () => {
  const rootPath = websiteRoot.pathname;
  const files = await publicFiles(rootPath);
  for (const file of files) {
    const relativePath = relative(rootPath, file);
    assert.doesNotMatch(relativePath, /(?:wechat|weixin|(^|[-_])wx(?:[-_.]|$)|qr|二维码|contact)/i);
    if (![".html", ".js", ".json", ".md", ".txt", ".xml", ".svg"].includes(extname(file))) continue;
    const text = await readFile(file, "utf8");
    for (const secret of ["zyong181818z", "R15929072019", "z17362936917@163.com"]) {
      assert.ok(!text.includes(secret), `${relativePath} 仍含个人联系方式`);
    }
  }
});
