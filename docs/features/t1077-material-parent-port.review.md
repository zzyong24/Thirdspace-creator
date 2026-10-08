# SPEC Review — current

- Task: T-1077
- Verdict: PASS
- Round: 1/3 (initial)
- Spec receipt: 87639fa23e75
- Review receipt: a36209c19783

## 当前有效问题

当前无未销账问题。

已销账：—

```spec-review-state
{
  "schema": "spec-review-state/v2",
  "task_id": "T-1077",
  "cycle": 1,
  "round": 1,
  "max_rounds": 3,
  "review_kind": "initial",
  "verdict": "PASS",
  "summary": "T-1077 首次独立前置审核，结论 PASS，无 finding；仅准入当前 SPEC 的三个精确产品/测试路径，不录正式状态、不代签实现、RED/GREEN、安装或全功能。审核时间 2026-10-08T10:25:23.707536+00:00。基点 5816d0d18807e5e9fd78bdeec3d311a5b8a2a529；SPEC SHA256=87639fa23e750909682698bda3909c299ac519749d87db0a348202df0205121c；宪法 docs/产品定位.md SHA256=86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800；persistence-client.ts 实施前 SHA256=fd77fece7398b7c6318c7b8275c57c3cc6966c802dbd86440f25a158ff628c6d。技能与项目均3.28.0，按已生成T-1077 context执行，主会话唯一产品writer。\n\n原始证据实际核对：t1075-b640-confirm-original-image.receipt.json SHA256=25ff96ecf9fb3b4a8a18766c8f7933a679ddbf6509f9e891fb5079dc4ea010ad，exit4/HTTP404“项目不存在”；t1075-next-original-project.stdout.json SHA256=3d4e7e314e7df422db9b7eb8130458282e7484c255fc5348dfaedabbd1aa98e8，原grp101/account null下projects.get成功读project104。公开Project DTO剥内部groupId，不能用缺字段推定真实NULL或手造归属。t1075-b640-material-candidate-read.stdout.json SHA256=624b4e1094fad3306d17d2583fd6954e3841531b563c7dfec16b742c27d77ec4，原素材available/candidate且checksum=0ccdb849e106162ef260901f93da5904872a3680417b075c42202027bf54374f；t1075-b640-original-image-task-final.stdout.json SHA256=f32e2fd3e3c25c68bd271e0254d34caa4ef61e3004e275b3f0b81020b3949f59，原401仍awaiting_confirmation，不追记确认成功，不重发生图。\n\n根因与最小范围成立：persistence-client约2695的linkAdoptedMaterial、2750的researchMaterialAdoption.linkKnowledge及3386的workSourceService MaterialLinks builder均丢弃父项目返回值；原MaterialLinks.assertParent在group入口要求真实对象及同groupId。前两处listOutputIdsByProject和拟改getProject同走原Projects repository.get的user/workspaceFilter父门；getProject返回内部ProjectRow。直接返回同txDb/store的原getProject结果即可修复，保留原素材active、知识/产出、用户/组/legacy账号、冻结成员版本、任务/执行/文件证明与事务锁。MaterialLinks原withWorkspaceParentWrite、生成采纳及研究采纳事务不变，3347等其他void端口不属于本修复。\n\n验收可执行：原Settings→Canvas→本机HTTP worker→精确文件→公共confirm→WorkMaterials attach链参数化纯组/组内账号/旧账号，核同task/原attempt、重复confirm及关联不重生成/链接、跨组/用户/account与文件拒绝。第三适配实际消费者为WorkMaterials attach→workSource.assertFile→links.list；不得虚构当前不支持的work.sources.select(asset pick)或扩schema。研究候选由原runtime.ai.createTask/recordCandidate构造明确夹具，再走公共confirm/MaterialLinks/Knowledge读回；不能声称真实模型。本机HTTP fixture也不能代签真实供应商。已有worker测试waitFor20000及it60000须在已准入测试文件内遵从SPEC至少120000观察预算，外层覆盖串行和清理；vitest --testTimeout180000不会覆盖it自身60000。独立PGLite/媒体目录、实际RED后GREEN和既有类型/owner/Gate检查由根执行，原全局红项保留。\n\n安装恢复仍待实际发生：原401沿原任务/link/attempt/精确历史文件及原幂等恢复策略保留，不能换键冒充未知成功。完成实现独评、打包、原完整新鲜备份和安装后再公共确认/读回/放画布；本审只读主源与既有脱敏公开证据，零业务/网络/App/DB操作，唯一写相邻review文件。",
  "spec_path": "docs/features/t1077-material-parent-port.md",
  "spec_sha256": "87639fa23e750909682698bda3909c299ac519749d87db0a348202df0205121c",
  "constitution_path": "docs/产品定位.md",
  "constitution_sha256": "86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800",
  "review_path": "docs/features/t1077-material-parent-port.review.md",
  "review_mode": "subagent",
  "model": "inherited-codex-model-unreported",
  "policy": "convergent-review/v2",
  "cycle_authorization": null,
  "latest_event_hash": "9063d3cd638fb9a2016a8995f7dd7f770feaa47804170978d8fc8657e6cd92f7",
  "open_findings": [],
  "resolved_findings": [],
  "receipt": "a36209c19783"
}
```
