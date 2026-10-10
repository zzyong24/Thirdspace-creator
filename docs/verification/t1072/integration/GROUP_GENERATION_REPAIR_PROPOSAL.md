# 已批准组契约的实现遗漏：修复提案（待独立边界复核）

操作者在正常创建的账号组中，已有项目和生成意图，希望取得可采纳素材或整稿候选，并交给项目制作流程。准备失败沿原 attempt 恢复；已保存产物只补候选与账本，不重新调用供应商。T-1022 规范第 60/63/70 行定义共享领域按 userId+groupId、任务候选冻结组、旧账号来源兼容。母 T-915 原子子任务提交规则保持。

## 素材读写身份遗漏

真实 RED：frontend-chat-worker-group-green.log 的 material.generate 两场景（正常准备与一次准备失败恢复）在 commitResult 遭 ConflictError/HOST_PORT_REJECTED。真实供应商仅合成 loopback，PGlite、宿主、Worker、对象保存、任务账本与候选端口是真实路径。

当前 pending-generated-asset.service 使用 workspaceObjectIdentity(ctx)：旧账号/显式 grp_legacy_<accountId> 的 identity 为 accountId；新组为 group:<groupId>，workspaceStamp(scope) 将新组来源 accountId 留 null。generated-asset-candidate.service 却硬要求 accountId，并按旧 [userId,accountId,operationKey] 算键，且以 eq(accountId) 查素材，读不到真实新组持久事实。

最小 old→new：候选读键复用既有 workspaceObjectIdentity 的 identity；commits/assets 范围改用已有 workspaceFilter，加 userId 精确归属；保原 operationKey=execution-asset:<callId>、回执深相等、原文件/字节摘要、pending 状态、调用与原 execution/双向业务映射、租约/fence/deadline/版本检查。采纳和拒绝也使用同一 workspaceFilter，不以 null 扩大域。正常组写读同键；旧账号和显式 legacy 组稳定键保持逐字兼容。无 schema/endpoint/wire 或 business shape 更改，旧记录不重锚、不迁移、不新供应商调用。

验证：真实 normal group 素材提交→候选→采纳；同原调用丢回执恢复只返回原产物；跨 owner/其它 group/伪造回执/原文件变化仍拒绝；原账号路径全量保。原调用已保存时失败不删除事实，修复后同原任务恢复，不另造键。

## 整稿空目标装配遗漏

真实 RED：frontend-chat-script-group-diagnostic.log 的正常 script.draft 场景。测试临时诊断显示 OwnershipError「项目归属校验不可用」，栈为 artifacts.service.ts:196 → script-draft-target.service.ts:13 → script-draft-task-submission.ts:33 → 原子提交。不是模型来源宽松问题。

当前 script-draft-target.service.ensure 已先用 lockOwnedProjectForUpdate(tx,ctx,projectId) 核属主/工作区并持项目行锁，但新建 createArtifactsService({db:tx,...deps}) 未装配 assertProjectOwned，组入口正确拒绝空目标创建。旧 account-only fixture 遮蔽此问题。

最小 old→new：在该事务局部 service 注入 assertProjectOwned(context,id)=>lockOwnedProjectForUpdate(tx,context,id)。复用已批准 Projects 公开锁端口，同 owner/group 当前上下文、原项目、原事务/行锁；不设空回调、不取消 artifacts guard。已有稿件返回原 artifact，新稿只按现行规则建空初始版本，父回执失败仍整单回滚。不新增目标/候选 business shape，不覆盖已有正文。

验证：正常组空稿面首次提交成功；原 attempt 重投复用原 artifact/task；父回执失败回滚；其他组/owner 和无项目仍拒绝；已有稿件原正文不覆盖。所有原 14 工厂场景完整运行。

该文是精确实现缺陷提案，尚未修改以上两个生产文件；不把已有来源恢复评审充作本次独立复核。

## 素材采纳后续公开项目端口遗漏（新增同源 RED，待追加边界复核）

精确前两生产文件修复后 backend4文件82/82通过，frontend14为12通过/2失败。剩余material.generate两场景已到 awaiting_confirmation，用户confirm沿真实 generated-asset-adoption.service→MaterialLinksService，在 material-links.service.ts:121 遭 OwnershipError「项目不存在」。persistence-client.ts:2512/2567 两处事务局部 assertProjectOwned 只 await txProjects.listOutputIdsByProject 而返回 void；现组guard正确要求真实项目对象及准确groupId。主MaterialLinks组合根的同端口已有 txProjects/projectsService.getProject 正常形式。

拟最小 old→new：仅这两个事务callback改为 `(context,id)=>txProjects.getProject(context,id)`，同 transaction/真实 Projects 公开 service、同 owner/workspace。保 MaterialLinks 的项目group精确相等、素材原归属/active、原候选/成员冻结、父output校验以及完整采纳事务回滚。无需新endpoint/schema/业务shape；失败后候选仍pending/awaiting_confirmation，同原confirm重试，不供应商再调用。新增拟生产文件仅 frontend/src/server/persistence-client.ts；未实施之前不称14场景通过。
