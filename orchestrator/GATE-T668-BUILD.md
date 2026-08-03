# GATE-T668-BUILD — CreatorOS 官网定价更新

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-668",
  "contract_path": "docs/superpowers/specs/2026-08-02-creatoros-website-pricing.md",
  "contract_sha": "da95575a7d99",
  "commit_sha": "b9f9aeb1623e986398360e29a5385e4c4e5e579a",
  "observed_at": "2026-08-03T04:20:15.000Z",
  "run": {
    "verify_key": "website-pricing:test",
    "command": "node --test website/pricing.test.mjs",
    "exit_code": 0,
    "output_ref": "Node test：3 passed；价格、设备范围、购买方式及旧口径删除均通过"
  },
  "environment": {
    "surface": "browser",
    "runtime": "Google Chrome stable / Playwright browser inspection",
    "viewports": [
      { "width": 1440, "height": 1200, "result": "pass" },
      { "width": 390, "height": 844, "result": "pass" }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [{ "id": "creatoros-public-site", "role": "deployed-pricing-page" }]
  },
  "levels": {
    "logic": { "status": "pass", "evidence_ref": "website/pricing.test.mjs 3/3" },
    "surface": { "status": "pass", "evidence_ref": "桌面双栏与移动单列页面截图人工检查通过" },
    "journey": { "status": "pass", "evidence_ref": "公开 HTTPS 页面进入价格区并继续到私聊入口" },
    "experience": { "status": "not-requested", "evidence_ref": "不冒充购买者主观确认" }
  },
  "checks": [
    { "id": "AC-PRICE-COPY", "test_id": "WEB-PRICE-01", "result": "pass", "evidence_ref": "599、899/年、199/年与截止时间在线可见" },
    { "id": "AC-DEVICE-COPY", "test_id": "WEB-PRICE-02", "result": "pass", "evidence_ref": "一机一码、Apple 芯片 Mac、Windows 与 Intel Mac 推进状态在线可见" },
    { "id": "AC-CONTACT-COPY", "test_id": "WEB-PRICE-03", "result": "pass", "evidence_ref": "私聊和单独内测共创群入口在线可见" }
  ],
  "coverage": [
    { "condition": "desktop-layout", "result": "pass", "evidence_ref": "1440×1200 通用规则置顶、价格双栏", "reason": "" },
    { "condition": "mobile-layout", "result": "pass", "evidence_ref": "390×844 价格卡单列且内容可读", "reason": "" },
    { "condition": "legacy-copy-removed", "result": "pass", "evidence_ref": "线上不存在 1499、永久免费与版本分级旧口径", "reason": "" },
    { "condition": "live-readback", "result": "pass", "evidence_ref": "公开 HTTPS 页面和远端静态文件读回一致", "reason": "" }
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-668-visible-copy.json",
    "artifact_sha256": "8156661d6f0ca34ee6433def2293a6a2050b1c763aeb4ff81dccedd721a36cd2"
  },
  "tdd_red_ref": "实现前价格测试 3 项全红：缺 599/899/199 新口径且仍出现 1499",
  "open_defects": [],
  "status": "pass"
}
```

## 结论

PASS。官网已按用户确认的唯一口径完成静态页面更新并发布到
<https://creatoros.aitongban.cloud/>；本任务未修改支付、激活、续费或渠道服务契约。

## 变更范围

- Hero：当前平台改为 Apple 芯片 Mac / Windows；展示内测共创价、截止日期和一机一码。
- 更新记录：以 7 月 20 日内测、7 月 26 日 v0.2、v0.3 即将推出为真实时间线，删除“买一次一直新”。
- 定价区：通用设备规则在上，599 元内测共创价与 899 元/年正式版在下；正式版次年续费 199 元/年。
- 购买区：引导有意向用户私聊，确认后进入单独的 CreatorOS 内测共创群。
- 部署：测试文件不上传，远端 `updates/` 与 `prompts/` 目录受排除规则保护。

## TDD 证据

红测（实现前）：

```text
node --test website/pricing.test.mjs
3 tests / 0 pass / 3 fail
缺少：内测共创价、购买与设备说明
仍存在：1499
```

绿测（实现后）：

```text
node --test website/pricing.test.mjs
3 tests / 3 pass / 0 fail
```

## 工程与视觉验证

```text
bash -n website/deploy/deploy.sh
PASS

node orchestrator/process/boundary-scan.mjs
剩余 5 条均在既有基线；无新增违规

Playwright：1440×1200 与 390×844
PASS：通用设备规则先于价格卡；桌面双栏；窄屏单列；价格、按钮与 Intel Mac 状态均可读
```

## 发布与线上读回

```text
bash website/deploy/deploy.sh --site-only
[deploy] ✅ 完成

GET https://creatoros.aitongban.cloud/?pricing=20260802
存在：599 / 899 / 199 / 一机一码 / Apple 芯片 Mac / Windows /
      Intel Mac / 适配推进中 / 不再提供永久买断 / 内测共创群
不存在：1499 / 永久免费更新 / 永久属于你 / 基础版 / Plus / Pro / 概念稿

remote-test-file=absent
remote-updates=preserved
remote-prompts=preserved
```

## 剩余边界

- Intel Mac 仍未上线，官网只展示“适配推进中”。
- 899 元首年与 199 元续费的真实购买、续费和授权履约不由本静态页面完成，继续由既有跨仓商业化任务承接。
