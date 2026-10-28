# T-1410 真实审核证据对账

用户明确要求“把官方Pi的402和没通过的验收都处理好，复验通过后再推送”。本任务只修T1427审计定位的控制面不一致，21项review错误加看板体积；不借治理修复签旧产品验收，不改产品/审核引擎，不合并含敏感历史的整条旧分支。

## FR-141001 原件恢复

依据docs/verification/t1410/canonical-repair-plan.json（审计元数据），16个错配review snapshot先将当前外链原件逐字归档，再从指定Git commit读取与当前canonical terminal event及BACKLOG receipt完全一致的原snapshot。验证源commit、snapshot内latest_event_hash/receipt与所有绑定字段、自哈希均一致才恢复；不拼接、不重写现有events，不把外链PASS冒当前PASS。原件/来源hash、旧finding及单次授权消费证据保持。

T652先归档占用的外链task-scoped snapshot，确保T707共享原件恢复，补看板当前真实SPEC链接后用现有reviewctl migrate-shared-review迁移；不覆盖未保全文件。T1072-owned-devices保原T1072来源和身份映射，使用全新task-scoped review路径，对当前身份真实初审；不是继承旧PASS。

## FR-141002 真实独评与周期授权

每项按恢复后的原context/原finding和当前SPEC/宪法真实独审。20项需新cycle时按用户本轮明确修复失败验收的授权，生成独立nonce/Max-Cycles1/精确Task-ID、前SPEC与宪法hash和实际Change-ID的typed DEC，再由现有reviewctl消费。保留来源外链已消费授权，不重用旧nonce，不重置旧轮次。T1369已有DEC136909精确用户批准，可按既有事实完成typed绑定；不声称旧production04发生。

其中T707/T694/T652原本计划沿旧cycle复审，但原finding没有当前独评JSON schema必填的threat_model_id，补空值也违反reviewctl冻结字段规则。T694的旧security/blocker还会被CLI语义校验拒绝；T707/T652仅凭缺字段不能声称CLI必拒。为同时满足正式schema与历史不可改原则，各保原recheck原件与完整finding，基于当前全文重新独立initial，精确一次新cycle；不改schema/审核程序、不伪造旧threat绑定，不只改review_kind或复制旧PASS。T1072-owned-devices仍是独立的新身份initial，不计入20项旧链新cycle。

绑定PROJECT.md的任务应在真实重审当前全部适用约束后转为稳定docs/产品定位.md；原哈希与变更理由保留，不能通过更换宪法逃避原约束。已有AGENTS/SYSTEM_ARCHITECTURE/产品定位绑定按实际适用保留。T642 open REV-002必须真实复核证据与当前SPEC是否解决；维护授权不等于接受产品争议，未解决保持open，不能批量模板PASS。

## FR-141003 看板机械整理

先修全部review，随后使用backlog-compact归档真实已完成索引，保持未完成任务ID/状态/审核/验收/文档链接；活动行长描述逐字外置BACKLOG-details.md并保链接，主表一句话准确压缩，保原始before快照供对照。不删除开放任务、不改变任务状态、不提高体积阈值。已有重复历史ID只记录，不改历史。

## 写集与验收

产品代码与reviewctl/reconcile/taskctl程序不在写集。写集为元数据列出的各review snapshot与所需task-scoped目标、BACKLOG/归档/details、审计证据、正常DEC/review-events/任务事件/progress/module/context；加下列已独评发现的两处规格引用纠偏，修订前后均正式独评，原finding完整保留，不改产品行为或验收门槛：

补充阶段对账写集 `orchestrator/ARTIFACT_MANIFEST.yaml`：真实核对全部阶段与旧阻塞后，只更新 `project.updated_at` 为本次核对日期，并向 `4-build`、`5-ship` 的 notes 追加 T-1427/1428/1410/1411 当前证据与未完成条件；保留原备注，不改变任何 stage/gate 状态、confirmation、风险接受或历史验收。先同步 module/context 精确写集并完成本条独立复审，不能仅为消除日期漂移而签全局通过。

- `docs/superpowers/specs/2026-08-16-video-direction-stage-and-caption-emphasis.md`：仅标识原竖屏人物隐藏/禁PiP/硬切及对应验收断言已由用户既定DEC-VIDEO-056与T902取代，当前竖屏遵循T902；保原文作为历史及其余方向/字幕约束，不发明新产品决定。
- `docs/superpowers/specs/2026-08-05-video-production-editing-loop.md`：仅把§3数据表旧outputs.production.put引用对齐同节已确认的唯一productions.editing-plan.confirm窄写入口，保原读回和AC/幂等/并发约束。其它SPEC发现不借本条扩写。

- 每项恢复前验证canonical元数据未被并发改写；错误停止该项，其余独立项可继续。
- 每份当前PASS必须来自真实独立审核输出，绑定当前SPEC、宪法、旧finding、元数据及工具receipt；不把迁移当新审核。
- reviewer只读任务彼此独立，主线程串行写控制面；复核所有旧错误逐项去向。
- node --test orchestrator/process/reviewctl.test.mjs、reviewctl audit、backlog-health、reconcile --profile quick --read-only真实运行；quick不冒full，真实产品/安装/UI验收由T1427继续。
