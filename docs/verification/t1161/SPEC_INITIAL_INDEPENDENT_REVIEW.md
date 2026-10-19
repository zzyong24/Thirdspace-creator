# T1161 保留微信账号原管理入口：独立 SPEC 初审

- 评审时间：2026-10-10T03:49:43+08:00
- 实读 HEAD：`aa7de1e91183ec0236a82cd954a4f4bf9bb1aeb1`
- SPEC SHA-256：`d745f90f73856bcda7eaf794b7e8297278b2c26533a50ee24b7ab1d5369ebfe7`
- modules SHA-256：`81871dd46ea33ee4a2135bd09c1f7d6fa077b4938dde65527d4f237e06ffffd2`
- 当前 T1159 工作字节 AccountGroupManager SHA-256：`c0f3bc1a27a64ee7c4500b31d311e854e32464260b5ca50535d4ddbf653235a2`

## 结论

**CONCERNS。** 产品方向与两路径范围合理，但 SPEC 对当前代码的事实描述和“两处取消隐藏”的操作边界不准确，实施前需要一次窄修订。

## REV-001：当前 AccountRow 并未被微信条件隐藏

当前 T1159 工作字节中，微信只发生两件与管理入口有关的变化：顶层统一“转组”按钮被平台条件排除；随后在同一卡片的 details 内新增了微信专属“转组”按钮。`AccountRow` 仍位于无平台条件的 `accounts.find(...)` 分支，公众号/视频号只要真实 account 存在就照常显示，最后活跃账号保护仍由原 `isOnlyAccount` 处理。

因此，SPEC 第3行“同时隐藏……AccountRow”与当前源码不符；第5行“两处取消微信专属隐藏条件”也可能被误实现为保留内层专属按钮并另开重复入口。最小正确修订应明确：

1. 恢复顶层统一转组按钮对微信成员的显示；
2. 删除来源新增的 details 内微信专属转组按钮，避免同一动作出现两次；
3. AccountRow 运行时不改，只新增两平台仍可见且最后活跃账号仍禁用的回归断言；
4. 保留“查看数据”链接、preview-before-commit、在途任务禁转、owner/version/digest 与取消零写断言。

该修订不扩大产品或测试写集，也不触碰真人绑定、同步、导航或后端权限。modules 已覆盖 group manager、binding、native report、账号管理、T1159 Chrome、LED-047、frontend type 与 diff；在上述事实修正后足够。

## 证据边界

本轮未运行 Next、测试、真人微信、模型或数据库。当前源码是 T1159 正在移植的工作字节；本评审只指出可确定的静态入口差异，不声称 Chrome 已失败或 backend 转组存在缺陷。
