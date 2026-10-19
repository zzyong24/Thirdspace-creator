# 已批准组生成路径的最小实现修复

正常账号组中的素材在保存后无法取得/采纳候选，空稿面整稿无法提交；真实 Worker 原14场景为4失败/10通过。首次两处修复后变12通过/2失败，最后两个事务 MaterialLinks 端口修复后14/14通过。原输入族保留，测试供应商为合成loopback，宿主/Worker/数据库/对象存储/候选与采纳为真实服务。没有调用真实外部模型或安装版。

生产仅3文件：generated-asset-candidate.service 复用写入端已有workspaceObjectIdentity和owner/workspaceFilter，保持legacy键及原operation/回执深相等/原文件/状态/事务；script-draft-target.service 同事务向Artifacts注入Projects既有真实锁端口；persistence-client.ts两事务回调返回同tx Projects真实row，保素材和研究knowledge采纳的现组父对象guard。未改schema/wire/业务shape、未新增generation key、未修改guard或新增groupVersion逐值拒绝。

独立只读规范边界报告由现t173 reviewer产于Growth completion目录：creator-group-candidate-independent-review.md、creator-materiallinks-composition-independent-review.md；不把旧source/search评审当本次实现复核。3a551fb5提交后真实独立实现复核已完成，creator-group-generation-implementation-review.md明确三生产文件未发现新增具体guard blocker；不批准其它范围或正式审核。

真实日志：frontend-chat-worker-group-green.log 4/10 RED；frontend-chat-script-group-diagnostic.log明确整稿项目端口缺失；frontend-chat-worker-group-repaired-green.log 12/2（素材候选成功但采纳失败）；frontend-chat-worker-group-composition-green.log 14/14 GREEN。backend-group-generation-repaired-green.log4文件82/82，含原调用/失败恢复/并发采纳/原子回滚/原文件篡改等；backend-group-legacy-alias-boundary-green.log15/15，补正常公开组、不同owner/group拒绝、legacy别名原键。

显式legacy组的新写素材accountId=null，旧无group入口正确拒绝该新组记录，不能以NULL扩大历史范围；旧account-only持久记录仍原键可读。新增测试曾误要求新组事实无ctx可读，backend-group-legacy-alias-green.log14/15失败保留，纠正到现T1022 §70严格边界，不改生产来迁就错误测试。

研究knowledge组合根直接真实事务：frontend-materiallinks-research-composition-green.log1/1，正常公开组/项目/知识创建、相同实际callback、新组链接、跨owner/group/缺项目拒绝、写后异常知识与链接同时回滚。factory只捕获真实端口且返回原服务；这不是绕AI/admission的完整研究模型调用验收。素材完整Worker14覆盖两次confirm，不产生第二链接/任务或供应商调用；后台既有采纳并发/失败回滚保。

全前端首次最终整套实际2失败/3608通过，最后两项test装配修复后准备重跑，T1072正式安装/OS凭据journal/双机仍待验；母聊天提案未批准未实现。
