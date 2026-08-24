# T-909 页面与账号切换性能旅程

大白话：用户点侧栏后立刻看到目标项变成“打开中”，旧页面保持稳定，数据准备好后一次切到新页面；
切换账号时当前账号先立即更新，同一轮只安排一次整页刷新，不再自己重拉账号列表或让页面重复刷新。

```mermaid
flowchart LR
  A["点击页面或账号"] --> B["立即显示目标状态"]
  B --> C["并行准备必要数据"]
  C --> D["一次刷新后稳定落页"]
```

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-909",
  "journey": "首页、定位中心与账号上下文切换立即反馈且不重复刷新",
  "entry": "CreatorOS 首页侧栏",
  "watched_paths": [
    "backend/src/modules/positioning/positioning.service.ts",
    "frontend/src/app/(creator)/layout.tsx",
    "frontend/src/components/shell/account-switcher.tsx",
    "frontend/src/components/shell/account-switcher.test.tsx",
    "frontend/src/components/shell/sidebar.tsx",
    "frontend/src/components/shell/shell.test.tsx",
    "frontend/src/features/automations/automations-island.tsx",
    "frontend/src/lib/account-events.ts",
    "frontend/src/lib/account-events.test.ts",
    "frontend/src/lib/session.server.ts"
  ],
  "required_checks": [
    {"id": "AC-NAV-IMMEDIATE", "test_id": "E2E-T909-01"},
    {"id": "AC-NAV-STABLE", "test_id": "E2E-T909-01"},
    {"id": "AC-ACCOUNT-COALESCED", "test_id": "E2E-T909-02"}
  ],
  "required_conditions": [
    "regular-window",
    "minimum-window",
    "repeated-route-switch",
    "account-change-broadcast"
  ],
  "viewports": [
    {"width": 1280, "height": 720},
    {"width": 900, "height": 600}
  ],
  "coherence_groups": [],
  "copy_guard": {"forbid_internal_ids": true},
  "states": [
    {"id": "home-ready", "visible": "首页"},
    {"id": "route-pending", "visible": "定位中心 · 打开中"},
    {"id": "positioning-ready", "visible": "定位中心"},
    {"id": "account-ready", "visible": "当前抖音号"}
  ],
  "actions": [
    {"from": "home-ready", "action": "点击定位中心", "to": "route-pending"},
    {"from": "route-pending", "action": "等待必要数据完成", "to": "positioning-ready"},
    {"from": "account-ready", "action": "切换抖音号", "to": "account-ready"}
  ],
  "honesty": [
    "点击反馈不冒充页面已经完成，落页仍以真实服务端数据为准",
    "账号切换保留归属校验与一次完整失效，不用缓存旧账号数据换取速度",
    "通知和渠道品牌读取失败继续安全降级，不阻断主要页面"
  ]
}
```
