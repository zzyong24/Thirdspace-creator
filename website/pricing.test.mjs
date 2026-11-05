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

async function publicFiles(directory, output = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "deploy" || entry.name === "buy" || entry.name.endsWith(".test.mjs")) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await publicFiles(path, output);
    else output.push(path);
  }
  return output;
}

test("官网保留线上产品导览与更新日志，不恢复已撤下的交易入口", () => {
  for (const expected of [
    "查看产品能力",
    "更新日志",
    "macOS",
    "Windows",
    "数据本机优先",
  ]) {
    assert.ok(visibleText.includes(expected), `缺少公开信息：${expected}`);
  }
  assert.doesNotMatch(html, /href=["']#(?:delivery|partner)["']/i);
});

test("官网公开用户确认的分销与二开结算，不包含私人联系方式和旧价盘", () => {
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

  assert.match(visibleText, /599/);
  assert.match(visibleText, /299\.50/);
  assert.match(visibleText, /授权与签名/);
  assert.match(html, /<video[^>]*controls[^>]*playsinline/);
  assert.doesNotMatch(html, /<video[^>]*autoplay/);
  assert.match(html, /https:\/\/buy\.aitongban\.cloud\/creatoros\//);

});

test("官网不再展示旧验收包下载及其构建说明", () => {
  assert.doesNotMatch(html, /creatoros-manual-download|本轮 Mac 验收包|下载 Apple 芯片 Mac 验收包/);
  assert.doesNotMatch(html, /href=["'][^"']+\.(?:dmg|exe|zip|tar\.gz)["']/i);
  assert.doesNotMatch(visibleText, /SHA256|ad-hoc|e3151ce89/);
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
