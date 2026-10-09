# T1110 隐藏提示与真实绑定装配修复闭合审查

2026-10-09；HEAD `b1f0cc5462285e59531a329a42340abe84c8d0ac`，包含本轮未提交工作树。范围仅为两项修复、相关源码/合成测试与已有执行日志；未改工作树/控制面、重跑测试、操作浏览器或用户库/Cookie/profile。保留前一份 `/tmp/t1110-witness-final-code-audit.md` 的问题快照，本报告记录后续闭合。

**代码结论：这两项确定性问题已闭合；所查接缝没有剩余阻断。37 worker 与 7 例正式 composition 的完成日志均已独立读取。此结论不代签真人扫码、五份平台实下载、Chrome 视觉验收或整体任务 Gate。**

1. **嵌套隐藏登录文字已修。** `ai-worker/src/runtime/platform/wechat-dom-witness.ts:116–127` 现在用 TreeWalker 逐段取实际可见文本，排除 `[hidden]`、模板/脚本/样式、visibility:hidden 与 display:none 祖先；不再以父 div 的聚合 textContent 证明登录失效。`wechat-dom-witness.test.ts:30–36` 对两平台覆盖嵌套 visibility:hidden/display:none 负例，真实可见的分段扫码提示（附隐藏旧模板）仍为 true。原午夜窗口冻结、无 frame 请求、old request/fresh click 时序及完整 source cancel/inherited 240s deadline/late response 用例仍在同套中。

2. **bind 来源登记已修，服务守卫保留。** `frontend/src/server/persistence-client.ts:4633` 仅在同一个 `wechatSource.configured` 为 true 时登记该平台 `bind` 与 `nativeReports`；:4980–4982 原 stage 仍向真实 `commitVerifiedBinding` 提交受管 reader 的身份及原 proof。`backend/src/modules/platform-collection/platform-collection.service.ts:168–176` 仍核 proof、bind adapter、真实用户/账号/平台/稳定身份，没有用 `adapterAlreadyVerified=true` 绕过当前检查。profile authority、原事务、组成员和绑定 stage 没有因本修复放宽。默认 source 缺 witness 的 configured=false 及能力不可用行为仍由 worker 测试覆盖。

公开链 `frontend/src/server/__module_integration__/local-platform-binding.persistence-client.test.ts:196–212` 对两微信平台实际执行 accounts.bind.start → 原持久任务/status → 原事务/profile 采纳 → getAccount/getGroup；仅外部浏览器读数 :73–82 为明确合成 fixture。该测试不证明真实二维码操作。完整 7 例同时覆盖原小红书/快手路径；旧断言校正为 xhs 5 / ks 10 分，与批准 SPEC :80 和 `backend/src/modules/ai-runtime/collection-bootstrap.ts:75–76` 完全一致，没有改生产调度时刻。

| 实际读取证据 | 结果与解释 |
|---|---|
| nested-login-red.log | 2 FAIL / 9 SKIP；两平台隐藏文字负例实际失败。 |
| composition-bind-harness-failed.log | Vitest4 签名错误，0 test；仅保留无效运行，不算行为 RED。 |
| composition-bind-red.log | 2 FAIL / 5 SKIP；公开任务实际终态 failed/accountId:null，是有效行为 RED。 |
| composition-bind-current.log | 5 PASS / 2 FAIL；两新微信 PASS，失败仅两旧错峰期望相反。保留失败事实。 |
| worker-complete-current.log | 3 文件 **37 PASS**（DOM11/source17/parser9），22:15:40，19.52s；SHA256 `02ec452dc3fd9fa8353d79f8a51c020420bcfadaf776fd8d7ed9589545f3b21a`。 |
| composition-bind-final.log | 1 文件 **7 PASS**，22:19:44，190.16s；SHA256 `94b74080355da3632533260dc8b6f8c693558b12823155b519c2fd2d3b973df9`。root 报告该命令 exit0。 |
| ui-logic-complete-current.log | 4 文件 **57 PASS**，22:21:15，73.98s；SHA256 `0f06fcd960b8d24d4bdc0b3ade49701d328c32e2f0e47c4e0a11caa003a61a35`。此为测试逻辑证据，不是视觉验收。 |
| current-worker-type.log / current-frontend-type.log | 已读正常 tsc / next typegen 输出，无错误；root 报告最新两命令 exit0，本代理未执行。 |
| led047-current.log | **173 PASS / 1 FAIL**，旧 run-controls 用例失败；同断言串行重跑进行中，本报告不把其写成全绿。并发负载为 root 的原因判断，本代理未据此关闭失败。 |

`__resetPersistenceForTests()` :7504–7507 是请求后台异步停止并清 singleton 的 void test hook；afterAll :88 已调用它再清合成 profile。本审不把此调用表述成独立物理 drain 成功证据。

root 已报告首次真人视频号扫码读到身份、原提交因装配缺 bind 失败，原 status 和任务历史保留；修复后正在显式新 intent 的产品扫码。本人未操作或读取该真实任务/身份，不提前声称新的真人绑定或平台导出成功。

本轮审阅源码 SHA256：

| 文件 | SHA256 |
|---|---|
| ai-worker/src/runtime/platform/wechat-dom-witness.ts | 12d5d49241bedb1cb5b59c1e80c5682751d363ee87523a96173ae96de8b774b0 |
| ai-worker/src/runtime/platform/wechat-dom-witness.test.ts | f07471b4c905c2df09d9d3a6c85048bd81d5811319041bce730b191702f76206 |
| frontend/src/server/persistence-client.ts | 0c29e928cf3adef3a0d1a6522c8ee355f0a06018d6ac8033615fd69413ff11bd |
| frontend/src/server/__module_integration__/local-platform-binding.persistence-client.test.ts | e6dc33564e80d15df75677587ba533ea37d989fee1c08feb226231c039139242 |
