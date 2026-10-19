# T1167 collector pending renewal 终态：独立 SPEC 初审

- 评审时间：2026-10-10T04:05:19+08:00
- 实读 HEAD：`aa7de1e91183ec0236a82cd954a4f4bf9bb1aeb1`
- SPEC SHA-256：`0427bf8c4dd481744ea0a70dd8ac97a352fb85fe821be70efa501bca5382936a`
- modules SHA-256：`27af86a79a033c6e5a5ab9bdcca953549dacef0b9c0dadd2a39d9a5dcb60cfea`
- timeout policy SHA-256：`94385308b37926c3f1b81cf3c8bf0533983025bfc539cac7c914770c112604cf`

## 结论

**PASS（仅终态 finalization 修复准入）。** 当前 collector 的 `finally { await renewalInFlight; }` 确实允许一个不返回的续租端口无限阻塞 deadline、父取消或正常完成后的结果交付；该反例可由受控 deferred 端口确定性验证，无需真人实验。

## 安全边界核对

- `renew()` 已有完整 try/catch/finally。终态先设置 `active=false`、`acceptingReports=false`，清 timers 并移除 parent listener；晚 resolve 会在第二次 `check()` 被 `REPORT_RUN_CLOSED` 拦截，晚 reject 也被原 catch 接收，二者因 active=false 都不会abort或再排心跳，故去掉 finally 的无界 await 不产生 unhandled rejection。
- backend `renewLease` 与终页 commit/failRun 均在行锁/世代/状态约束下串行：先发生的续租完成后终态提交，或终态先完成后晚续租因非running/世代变化拒绝。collector 不凭晚回执写报表、重领或覆盖新状态。
- 资源释放语义不变。`resource.onStopped` 仍是唯一物理停止证明；browser已启动时 finally 不伪造释放，未确认继续返回 `stopUnconfirmed` 并保留 retry guard。不能取消的续租 Promise 只是不再阻塞业务终态，不等于释放profile或force退出。
- 三个 RED 家族覆盖 deadline→partial/TASK_TIMEOUT、父取消→cancelled/CANCELLED、全部报告+真停→complete；必须在续租仍pending时观察返回，再分别晚 resolve/reject并核零新增续租、报表、失败写、claim及迟到报告拒绝。原attempt、已保存报告、30分钟绝对期限、单在途心跳与owner/lease均保持。

modules 只允许 collector 与同目录测试变化，并绑定 native report service/transport、bootstrap、backend/worker type、timeout、LED-047与diff。合成端口不代签真人扫码、下载或研究family。

本轮未执行测试、模型、数据库、浏览器或真人平台；PASS不代表实际RED/GREEN、T1159、安装或全局Gate已通过。
