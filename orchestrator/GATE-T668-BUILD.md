# GATE-T668-BUILD — CreatorOS 官网定价更新

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
