# T-1434 官网下载区与更新日志维护

## 用户需求与授权

2026-11-01 用户要求更新 https://creatoros.aitongban.cloud/#changelog：移除截图中置于页面顶部的旧 Mac 验收包下载区，补齐已更新的多个版本，并更新官网。授权包含该静态官网的部署。

## 范围

- 保留官网既有设计与真实产品内容；先比对线上文件，保全线上已有更新。
- 移除顶部旧 Mac 验收包整块内容，不迁移或新增未经要求的下载入口。
- 根据 GitHub releases、发布记录和提交核对版本、日期与用户可感知变化；不把源码修复、验收包或未验收能力描述为正式发布。
- 同步首页当前版本提示、版本选择器与更新日志；保留旧版记录与交互。
- 仅维护 website/index.html、必要的官网测试、本 SPEC、任务与阶段证据；不改安装包、自动更新源、模型权益或桌面代码。

## 验收与验证

1. 官网顶部不再展示截图中的验收包下载块及其下载链接。
2. 新增版本记录可追溯真实发布来源，旧版日志可正常切换，首页版本提示一致。
3. 运行官网现有测试与本次必要回归、HTML 差异检查、桌面及窄屏浏览器检查。
4. 部署前备份线上 HTML，仅替换官网 HTML，不触碰 updates、prompts 或安装包；部署后 HTTPS 回读与本地发布文件一致。
5. 执行 pmem sync、reconcile，并如实记录既有范围外欠债。

## 实现口径

这是既有静态官网的内容维护：复用线上 CR-1.5 页面，不改版本切换脚本及数据归属。GitHub 没有公开 Release，客户端与构建记录均沿用 1.2.0，新增九月、十月两个更新批次，不虚构 1.3/1.4 等版本。源码修复说明不等于所有安装包均已更新，页面保留实际安装版本说明。来源见 `docs/research/2026-11-01-website-changelog-sources.md`。

线上已撤下本地旧页面的商业入口与 FAQ，故对应两条旧断言改为检查真实线上产品导览及本次移除的下载区；金额、联系人、二维码、假按钮等原断言保留。同步线上真实图片资源，缺失的 favicon 引用改用已有 SVG。保留已有正文默认可见回归，修复线上默认隐藏样式，避免深链接或动画异常导致正文空白。

仅静态文案与内容移除，无新增确定性业务逻辑，不制造 TDD 红测；用线上旧页面的真实失败、现有测试及真实浏览器旅程验收。不扩大为桌面产品全量验证。reconcile 使用 quick/read-only 控制面对账，完整产品 lessons 与桌面验收不在本次静态站范围，不宣称已执行。

## 官网浏览器旅程

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-1434",
  "watched_paths": ["website/index.html", "website/pricing.test.mjs", "website/assets.test.mjs", "docs/verification/t1434/verify-website.mjs", "docs/features/t1434-website-changelog-refresh.md"],
  "copy_guard": {"forbid_internal_ids": true},
  "required_checks": [
    {"id": "download-removed", "test_id": "website-public-content"},
    {"id": "versions", "test_id": "website-release-tabs"},
    {"id": "keyboard-refresh", "test_id": "website-keyboard-refresh"},
    {"id": "responsive", "test_id": "website-two-viewports"}
  ],
  "required_conditions": ["refresh", "keyboard"],
  "viewports": [{"width": 1440, "height": 1000}, {"width": 390, "height": 844}],
  "coherence_groups": []
}
```
