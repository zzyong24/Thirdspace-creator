# SPEC Review — current

- Task: T-1285
- Verdict: PASS
- Round: 1/3 (initial)
- Spec receipt: f921459f6a5a
- Review receipt: 5217d3efeb58

## 当前有效问题

当前无未销账问题。

已销账：—

```spec-review-state
{
  "schema": "spec-review-state/v2",
  "task_id": "T-1285",
  "cycle": 1,
  "round": 1,
  "max_rounds": 3,
  "review_kind": "initial",
  "verdict": "PASS",
  "summary": "T1285 初次独立规格审核，审核者 /root/integration_review；与本次实现分工独立，homogeneous / inherited（同模型、继承上下文），不是异构、盲审或人工签收。本轮只读 SPEC、稳定宪法、架构、当前 panel/workbench、公开 transport/service/repository、事务包装及原 CAS 证据；未修改生产、调用模型/公共服务、运行浏览器或测试，不生成 reviewctl receipt、不更改任务状态。只输出本审核包。\n结论：findings 为空，未发现阻断该窄范围规格的缺陷。原 cas-result 确认 base4、并发 save 到5、原 apply 一次且409、原 receipt=null、文字及候选保留但 discard 禁用；cas-recover-readonly 确认恢复原 Chrome session、无手工 storage 注入，只读同原 request 后仍锁定。规格准确描述了现有 recover 在空回执处直接抛错的可用性问题。\n竞争证明：production.service.ts applyEditor 始终委托 editor repository.commit。production-editor.repository.ts:120–145 在同一 withWorkspaceWrite 数据库事务中锁工程行、先读同 request receipt、验证 actual===expectedRevision、写 actual+1 当前工程、插入对应 requestId 的不可变版本回执；hook 也在同事务内。原请求成功不可能只公开新版工程而尚未提交回执。若第一次 receipt 为空后原请求抢先成功，随后 get 读到推进版本，第二次 receipt 能读到原成功并进入既有 digest/恢复链；若推进由其它合法写产生而第二次仍空，原请求在已推进的同一 production 上不再可能通过旧 CAS。后续其它写不能让旧 expectedRevision 再成立。restoreEditor 同样经 commit 创建新递增版本，并非回退当前 revision；普通 updateProduction 剔除外部 videoEditingPlan 并保留原值，旧 confirmEditingPlan 也仅按 CAS 写 expectedRevision+1。这里依赖正式公共当前读与回执读及现有事务承诺，不泛化为单次 null、409 或任意其它 unknown 任务的结算。\n恢复边界：规格要求同 workspace/output、productionId 等于原 savedBase，revision 严格超过原 apply.expectedRevision，并在每次 await 后 assertCurrent/active；任何读取错误、同版本或身份不符仍保留 pending。有回执继续核 requestId、productionId、完整 native scene digest，再走 onRecoverReceipt；workbench 还核最新版本等于回执版本，并用原 base 与本地轨道的原有 guard 恢复，不借此次修复覆盖后续正式或本地稿。双空分支只清 pending，不调用 complete、不调用 onRecoverReceipt、不自动 apply、不换原 base/request/candidate。对应宪法 P-01/P-02/P-03/P-05 的用户选择、归属、真实状态与可恢复边界。\n可用性核对：现有 discard/backup 按 pendingAdoption 禁用；解除 pending 后二者可用。文字输入还按 requestId&&candidate.apply 禁用，故保留候选时不直接解锁编辑，用户显式丢弃候选后才可编辑，正与规格一致。备份下载仍取保留的 draft。实施时须先成功持久保留原 base/draft，再解除锁；存储失败不得把窗口状态说成已持久恢复。候选及原 request 留在当前窗口，不应为了释放 pending 替换正式工程或生成新请求。\n后验尚未发生：须实际补 panel RED/GREEN（第二次回执出现成功、双空+版本前进、同版本/错误实体/读失败、切组/卸载晚响应），并恢复原 profile/tab/sessionStorage 对原 request 做只读公共恢复；核 current5 和完整正式计划不变、原 receipt 仍空、文字与候选保留、discard 和后续编辑可用。已有未知刷新/scene digest/原ID回归保留。该审核不是这些测试、真实 UI、build 或全局 Gate 的 PASS；全局 T1204 29ERROR 仍按实际结果保留。无需扩大到新后端协议或其它 unknown 状态。\n读取绑定：docs/features/t1285-script-cas-conflict-readonly-recovery.md sha256=f921459f6a5a1d7fddbf8efec058c0fed813de220d21f834f42f58dbd2926276；docs/产品定位.md sha256=86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800；frontend/src/features/production/production-script-markdown-panel.tsx sha256=db795814d1c32fc4638fbb8eca15fec9383923f201555aa9cffc1ee12c5c729d；frontend/src/features/reference-editors/video-reference-workbench.tsx sha256=89ad5ef1b6d1998899daea5faad816084adab37bd1a937eaceb6e43d62d690a7；backend/src/modules/production/production-editor.repository.ts sha256=9c095f46c414e4908462f99a4135f5c6cbdbc7303f8f6d10f5cbbb8e1fb17ee8；backend/src/modules/production/production.service.ts sha256=8895bdeea8c848fb32a7ee16301d48973aa5583ef72e6de391893f3b2a3a5479；backend/src/modules/production/production.repository.ts sha256=9f67a8ceeccf032ba662f626a935be3a62cc2087f1e32315e5da0dcbce913918；docs/verification/t1274/final-gap-walkthrough/cas-result.json sha256=aeb4263d1208f10ffb7c9887d02e340633a649cabedd081426c5b7024378dbea；docs/verification/t1274/final-gap-walkthrough/cas-recover-readonly.json sha256=c421b7e26e50c150d1bb4791471102a1af4890f344ce74d41bc7d59b401bf905",
  "spec_path": "docs/features/t1285-script-cas-conflict-readonly-recovery.md",
  "spec_sha256": "f921459f6a5a1d7fddbf8efec058c0fed813de220d21f834f42f58dbd2926276",
  "constitution_path": "docs/产品定位.md",
  "constitution_sha256": "86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800",
  "review_path": "docs/features/t1285-script-cas-conflict-readonly-recovery.review.md",
  "review_mode": "homogeneous",
  "model": "inherited",
  "policy": "convergent-review/v2",
  "cycle_authorization": null,
  "latest_event_hash": "9ad05f2d3f0846e71ade4b2c4d2fe9b1b0cbe49cb010e3561cadefc4bfe296ef",
  "open_findings": [],
  "resolved_findings": [],
  "receipt": "5217d3efeb58"
}
```
