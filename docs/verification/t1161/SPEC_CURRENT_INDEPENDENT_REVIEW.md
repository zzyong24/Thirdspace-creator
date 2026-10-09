# T1161 当前诊断收口：独立 SPEC 初审

- 评审时间：2026-10-10T03:54:50+08:00
- 实读 HEAD：`aa7de1e91183ec0236a82cd954a4f4bf9bb1aeb1`
- 当前 SPEC SHA-256：`cde181175d0905ae6383b7a8fcd247c29adb98a9d7b2a878ec1d35b4d59fc5b4`
- 当前 modules SHA-256：`1327fc25b81acb4d978805c75604e21bd6bc7628f11725ccf264c94b5b4018af`
- 当前 T1159 工作字节 AccountGroupManager SHA-256：`c0f3bc1a27a64ee7c4500b31d311e854e32464260b5ca50535d4ddbf653235a2`

## 审计说明

此前私有 CONCERNS packet 因 `evidence_kind=source-inspection` 不在 reviewctl allowlist 而被拒绝，没有产生正式 receipt 或 review event。本轮是基于当前修订后 SPEC 的真实 **initial** 初审，不把被拒记录伪造成已发生的正式 round；原私有报告、packet 和拒绝日志继续保留。

## 结论

**PASS（诊断收口准入，无产品实现）。** 当前 SPEC 已准确还原完整源码事实：

- 微信成员的“转组”入口已位于“账号管理与能力”折叠区；
- `AccountRow` 没有微信平台隐藏条件，真实账号存在时仍渲染；
- 最后一个活跃账号的保护继续由原 `isOnlyAccount` 控制；
- 组成员行保持“查看数据”为唯一直接动作，管理操作留在折叠区，符合现有 UI_RULES；
- 不恢复重复的顶层转组按钮，也不修改 transfer/preview/归档、profile、binding、同步或研究机制。

modules 的 T1161 产品、测试和 runner 写集为空，仅允许任务文档、review、证据及审计控制文件更新。验证命令复用当前 group/binding/native-report/account-manager 组件、T1159 正式 Chrome 和 diff；Chrome 必须展开两平台管理区、确认隐藏账号保护与转组入口、打开影响对话框后取消，禁止真实转组、归档或扫码。静态存在不代签交互成功，若公共操作失败须另登记真实缺口。

本结论不代表 T1159 Chrome、真人微信、AC-LIVE、安装或全局 Gate 已通过。
