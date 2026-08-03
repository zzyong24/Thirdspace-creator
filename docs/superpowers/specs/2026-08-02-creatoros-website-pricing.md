# CreatorOS 官网定价更新 SPEC

> 任务：T-668  
> 日期：2026-08-02  
> 状态：用户已在连续对话中确认价格、设备与购买方式；进入 BUILD。

## 1. 用户要解决什么

CreatorOS 官网仍展示 1499 元永久买断、永久免费更新和 Mac/Windows 无差别支持，与当前内测共创和正式订阅规则冲突。官网必须成为可直接对外传播的价格真相，避免用户依据旧承诺购买或误判 Intel Mac 已可用。

## 2. 公开口径

### 通用购买与设备说明

- 一机一码：每个激活码仅绑定 1 台设备。
- 当前支持：Apple 芯片 Mac、Windows。
- Intel Mac：适配推进中，不得写入“当前支持”。

### 内测共创

- 价格：599 元，一次买断。
- 资格：仅限内测群用户。
- 截止：2026 年 8 月 10 日。
- 关系：参与 CreatorOS 产品共创与持续打磨。

### 正式版（内测结束后）

- 首年：899 元/年。
- 次年续费：199 元/年。
- 不再提供永久买断。
- 页面不展示“基础版 / Plus / Pro”等版本分级信息。

### 购买方式

- 有意向用户通过官网现有微信或邮箱私聊。
- 文案说明确认后进入单独的 CreatorOS 内测共创群，由作者手动发放激活码。

## 3. 页面结构

1. Hero 平台信息与价格短句先说明当前支持范围和内测截止时间。
2. 定价区先展示通用的“一机一码 / 当前支持 / Intel Mac 推进中”。
3. 下方并列展示内测共创价与正式订阅价；移动端改为单列。
4. 购买区说明私聊和单独共创群，不展示虚构支付、自动开群或自动发码按钮。

## 4. 必须删除的旧信息

- 1499 元。
- “没有订阅、没有续费”。
- “后续更新全免费”“买一次，一直新”“不用重买”。
- Intel Mac 或笼统 “Mac” 已完整支持的承诺。
- “限量”但没有真实数量的营销话术。
- “概念稿 · 待填真实联系方式 / 截图”角标。

## 5. 验收

- `website/index.html` 精确包含 599、899/年、199/年、2026 年 8 月 10 日、一机一码、Apple 芯片 Mac、Windows、Intel Mac 适配推进中、私聊与内测共创群。
- 页面不包含 1499、永久免费更新、基础版/Plus/Pro、Intel Mac 已支持等旧口径。
- 价格区在桌面双栏、窄屏单列均可读；现有导航锚点仍能到达定价和购买区。
- 静态 HTML 本地校验通过；部署后通过公开 HTTPS 页面读回同一口径。

## 6. 边界

- 本任务只更新静态官网文案与布局。
- 不修改 Activity 激活码类型、Growth 商品、支付、续费或授权迁移契约。
- 不承诺换机迁移规则、免费更新周期、退款、设备数量扩展或 Intel Mac 上线日期。

## 7. 前端旅程契约

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-668",
  "journey": "访问 CreatorOS 官网，在桌面端与窄屏确认统一设备规则、内测共创价、正式订阅价和私聊入口",
  "entry": "/#price",
  "copy_guard": { "forbid_internal_ids": true },
  "required_checks": [
    { "id": "AC-PRICE-COPY", "test_id": "WEB-PRICE-01" },
    { "id": "AC-DEVICE-COPY", "test_id": "WEB-PRICE-02" },
    { "id": "AC-CONTACT-COPY", "test_id": "WEB-PRICE-03" }
  ],
  "required_conditions": ["desktop-layout", "mobile-layout", "legacy-copy-removed", "live-readback"],
  "watched_paths": [
    "website/index.html",
    "website/deploy/deploy.sh",
    "website/pricing.test.mjs",
    "orchestrator/process/reconcile.config.json"
  ],
  "viewports": [
    { "width": 1440, "height": 1200 },
    { "width": 390, "height": 844 }
  ],
  "coherence_groups": [],
  "honesty": [
    "Intel Mac 只展示适配推进中，不冒充当前支持",
    "正式版明确为年付，不继续承诺永久买断",
    "购买入口只引导私聊，不冒充已接入支付或自动发码"
  ]
}
```
