# T1217 永久删除来源与证据父闭包只读复核

时间：2026-10-11 05:13:26 UTC。仅新增本评审；未修改产品、测试、共享控制面，未运行 Next/测试或访问真人数据库、凭据、平台。writer 尚未获准改删除策略。本记录不是实现或 GREEN 签名。

## 结论

**补齐受保护快照的最小 source/run 父闭包，目的符合既有正式保护合同；直接将 permanent 改为普通 archived 的候选不准入。** 当前普通 archived 来源仍在工作台/全部列表中，并占据真实 identity 唯一键。只改变 status 会改变删除后的公开可见性与再次创建行为，不能为限制文件数量而说成“纯内部调整”。

可以在原五产品文件内提出“业务来源已删除、仅剩不可执行证据壳”的窄候选，但必须先将下述具体字段与读取分工补入正式 SPEC/DEC，再独立准入；不由本次评审自动授权 writer 编辑。无须放宽 snapshot/source/run 的父 ID、同用户/逻辑组证明，也不得迁移用户数据。

## 原合同与真实源码证据

- `docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md:230`，FR-CR-017：停用、归档、永久删除是不同操作；转化结果不随源删除丢失来源快照。`:571`，AC-CR-022：已确认选题、Project 来源关系及最小 source snapshot 不随源删除丢失。
- `contract/src/operations/intelligence.ts:312` 的既有 delete 端点仍为 pause/archive/permanent + confirmToken，响应只含 affectedItems/preservedSnapshots/status。没有新增模式或专用证据壳参数。
- 原 HEAD `9fde2af65605fa5b3fd643290fa7bac999cc683c` 中 intelligence.service.ts SHA256 为 `3656cf91333147c2372c4d1ae9978d78cddffc3c980dfdb07a21c74703d88b81`。deleteSource permanent 从正式引用与 confirmed transform 得出 protected item/snapshot，保护相应 transform/ref，随后仍删除全部来源 runs、源 collection memberships 和 source 本体。新严格父证明要求 snapshot.sourceId/runId 指向真实父，因而留下受保护实体而删其父会使原 Project 读取失效。原版本 Project 回读没有检查 source/run 父；这不是新 snapshot 已损坏的证据。
- `backend/src/modules/intelligence/intelligence.service.test.ts:1433` 原 T665 测试明确保护共享 item、正式引用和选题，并在 `:1766` 起断言只剩 source-keep、两 protected snapshots/transforms 和一个 ref。它验证实体存在，没有真正调用 Project getSourceContexts 验证完整证据可读。它还明确断言 source-delete 物理不存在：任何保壳方案都会改变该**私有存储断言**，不可将其原样全绿或偷偷删断言。该历史测试目前不在 T1217 新测试写集，若需校准必须另列精确准入并保原失败；仅新增闭包回归不能宣布旧 T665 已通过。
- frontend 原删除确认与成功提示已承诺共享内容、正式选题/项目内容不被破坏（intelligence-workbench.tsx:780/:1081）。但 workspace get 与 listSources 当前均不排除 archived；UI 来源树也未排除 archived，故保普通归档行会在成功“已删除”后重新出现。
- 当前 sources schema **没有 configJson**，有 `adapterConfig/adapter_config` 与 `syncPolicy/sync_policy`。前者不在公开 IntelligenceSourceResource 中；后者原样公开，不能当隐蔽旗标。0050 的账号 identity 索引和 0106/0128 的组 identity 索引都不排除 archived，仅过滤业务查询不会释放唯一键。

本轮共享树第一次读取 service SHA256 `13365bb4482e7a596a73608a4370670c369720adbf47c39589a6575b1e3d88b1`，project-reference SHA256 `7bbc60f1f1a40285817dfcd8cff4c6e5ca0abb5467b5277f3bace23966fec84a`。writer 在写其他内容，判断旧策略以固定 HEAD 为锚，不能将变动中整树当冻结实现。

## 可供正式确认的最小候选

1. **专用内部证据状态可用已有 adapterConfig 表达，但不能混同普通归档。** 在 permanent 的当前同组锁事务中，仅确有该 source 自己受保护 snapshot 时保留其 source 行；清成固定机械标记对象，例如 `{__creatorosProvenanceOnly:1, originalExternalKey:<原值>}`，不保留可执行 adapter 配置/session 引用或采集指令。标记只由 service 在确认删除后产生，必须是精确结构；来源 create 的公开严格 SourceConfig 不能伪造它，内部口也不能将任意用户 JSON 当标记。source 的原 id/user/account/group/createdAt 保留；status archived、monitor false、nextRunAt null、collectionId null、version 正常增加。普通 archive 继续原行为。

2. **释放业务 identity，不能只靠 WHERE 忽略壳。** 无 schema/index 改动时，可选择将壳 externalKey 替换为只由真实 source.id 派生的独立内部命名空间键，原 externalKey 存在上述不可执行标记内；保原 canonical URL/hash 等最小来源证据。该键必须与合法 SourceConfig 生成的 identity 命名空间不相交，不能解析客户端组 ID、改 group/account 或碰其它行。此项会修改已删除源的内部 identity 字段，须正式 SPEC/DEC 明确接受；若要求 externalKey 也逐字不变，则当前索引下无法同时保父和“重新添加同 identity 得到新来源”，必须重评范围，不能把 unique 冲突包装成成功或复活壳。

3. **分开业务读取与证据父读取。** 业务 requireSource、workspace.sources/health/memberships、listSources（包括未给 status 的全部及 status=archived）、来源列表计数、listRuns/getRun/events、update、create identity/collection attach、手动/重试/调度及 worker 获取执行输入均不允许该标记壳作为可用来源/运行。删除后再次访问/再次删除原 ID 延续原 OwnershipError，不改为幂等成功；重新创建相同 identity 按原正常新建语义得到新 source/run/task，旧项目仍指向旧 IDs。helper 内 snapshot/run/source 的递归父证明可读取该**同用户同逻辑组**证据父；只保这个受控只读分工，不在公共业务读取放宽 NULL 或接受缺父。

4. **只保真正的父闭包。** protectedSnapshotIds 必须与本次 source 的真实 snapshots 相交，再按各 snapshot.runId 找到对应 run，核 run.sourceId=source.id。不能因为同一个 item 在另一个来源上有 protected snapshot，就保本次源全部 runs。保对应 snapshot/item/transcript/transform/reference 与最小父 source/run；其它未保护实体、观察、membership 和原应清理任务仍按既有策略清理。是否保所引用 run 的 events/execution 必须明确：目前严格证据读取不需要它们，不可仅为方便把所有历史任务保留；任何残留执行权不能再启动来源。不得借“永久删除”把原 paused/running 等在途状态变终态或覆盖新 fence。

5. **同一事务重验。** 当前原 implementation 保护集在事务外读取。新准入必须与 reference attach/current membership/source 状态检查共享真实组锁，锁内重读所有保护关系/active run，并再决定删除集合；不能允许 concurrent attach 在保护集读取后提交而其 snapshot/source/run 被删。沿既有账号→成员→组→execution 顺序，无新锁顺序。坏父与跨组不视为有权保留/删除的真引用；缺证据应明确拒绝或按已有保护事实保全，不任选假关系。

上述候选能利用现有五文件实现，不需要假造第二任务权或改公开 schema，但“内部标记、identity 退役、公共视图隐藏”仍是本轮精确实现范围补充，必须留 DEC 与 SPEC。当前 formal 补充未到，因此仅供审阅，不签准入。

## 最小真实 RED→GREEN 族

- **正式 Project 证据完整消费**：真实旧 service + real accounts/group 创建 source/run/item/snapshot/transcript，确认 transform，通过真实项目 service 创建项目及 attach；删除前 getSourceContexts 真能读原 IDs/hash/output，public permanent 后再同一公共项目读取仍完全一致。中性 adapter/模型替身只替外部依赖，不能直接造一组 hash 不匹配的引用冒充生产链。当前新父 proof + 旧删除策略应真实 RED，保存日志；补候选后 GREEN。
- **只有 confirmed topic、无 Project ref**：保原 confirmed transform、snapshot/item/transcript 和父 source/run；删除后题目证据可读，普通内容列表仍按原 availability 隐藏项目/选题独占 item，源配置不可再次执行。
- **混合及跨来源共享**：同源有 protected 与 unprotected snapshot、多个不同 run，仅保真正引用的 run；独占无引用 item/transcript/metric/transform/snapshot 和其它 runs 原删；其它 source 的 shared item 与 snapshot 保持。特别测“protected snapshot 只属于另一源”：本次源须完全删除、不误保壳。响应 affectedItems/preservedSnapshots 沿既有影响定义，计数不得按猜测或全库 protected set 冒签。
- **删除后业务语义**：workspace/health/membership/all source 列表及 archived 列表都没有壳，源 ID 业务 get/读/改/同步/再次删除按原错误，手动/调度/内部 worker 均不进入 adapter；普通 archive 仍保历史、pause 只停采，不能将普通 archived 隐去。旧原 source 公共契约没有独立 get 端点时，使用真实已有读入口，不新增假 get API。
- **重新添加同 identity**：legacy/account 与 canonical/group-only 两入口可真实新建新 source，原证据 ids/hash 不变，无唯一冲突、无复活旧壳；PG 两事务同时创建只出现一个新业务源。壳 identity 与任何正常 RSS/web/profile/favorites/darkhorse identity 不相撞。
- **保护与删除竞争/拒绝族**：PG attach/delete 同组事务竞争，保护链不丢；错误 confirmToken、跨组/跨用户、归档后写、paused/queued/running、旧 lease/new owner/fence 拒绝均零部分删除。旧账号 NULL 内容与 canonical 真组各至少一条完整删除回读链；未知父与坏 snapshot.source/run/item 仍拒绝，不能削弱 proof。

现有原 T665 的断言/失败、当前真实 RED 和历史测试结果必须分开保存。本评审没有执行上述族，也不以实体 SELECT 仍存在冒签公开 Project 证据可用。

## 确认与授权界线

原用户已授权继续验证和修复明确 bug，正式 FR/AC 已授权来源证据保护；在**全部旧永久删除业务可见语义保持、仅最小不可执行父证据壳留存**的候选下，root 可按既有授权明确选择并记正式 SPEC/DEC，无须凭本评审增设用户确认。该记录需写清内部标记、退役 identity、最小保留集和旧物理测试冲突。若选择删除后仍公开显示 archived 源/历史 runs、复活同 ID、保全部配置/执行历史、改变再次删除或新建结果、增加 schema/索引/端点，则是额外公开行为/数据保留选择，不能由“保护引用”一语覆盖；需相应范围确认和新的独立准入。既有字段无法做到可靠区分时，应如实提出范围调整，而非滥用 archived。

## 正式补充准入复评（2026-10-11）

**结论：scope PASS，可按当前正式补充实施；不是实现/测试 GREEN。** 原“普通 archived 不准入”及历史判断保留，本次准入只覆盖正式选定的不可执行证据壳方案。

实际读取的正式 SPEC SHA256 `b00667451a229d18c801537cbe535e975e395a7709b5d9ffa14d34323348c9bf`，重新编译 Packet SHA256 `31f28f2b96f8a869258e56b52ef2611f7cac721b454eb80464c57af289620599`；DECISION_LOG 当时 SHA256 `ec2e026223c52d1f987fe0521b001e77d2856b53ae84b8e5546ec5e91e5bb4a0`。DEC-T1217-001 新增永久删除补充已明确本方案与原取消合同，Packet 精确加入 intelligence.service.test.ts，其它产品仍原五文件。

准入成立的具体闭合条件：

- **内部标记可信边界**：正式选择 `{__creatorosProvenanceOnly:1, originalExternalKey:<原值>}` 写入未公开的 adapterConfig，清可执行配置。真实公开 create endpoint 的 config 引用五个 `.strict()` 分支，不能新增上述键，且无直接写 adapterConfig 的更新参数。syncPolicy 是公开任意 JSON，正式已禁止用它藏标记。实现必须判定精确结构/类型，不以任意 JSON 的 truthy 标志当作可信证明；标记也不能替代真实 user/group/父 ID 校验，必须保留其它读写 port 不可伪造的边界。
- **identity 命名空间可闭合**：当前 sourceIdentity 完整集合为 `profile:`、`favorites:`、`darkhorse:` 三个固定前缀，以及 web/RSS canonical URL 的 64 位十六进制 SHA256。因此固定独立非上述前缀、非 64hex 的机械命名空间（例如 `__creatoros_provenance__:`）加完整真实 source.id 可与合法五类 identity 不相交。即使外部作者 ID/关键词含冒号或该字串，完整 identity 仍有其固定前缀；不能只检查用户提供值是否含保留字。实现不能截断或解析客户端 ID，不改 source/account/group；重复生成壳键依原 source.id 唯一且不会产生另一实体。仍须真实新建与 PG 并发证明旧两条索引不再挡同业务 identity。
- **最小保留集合**：只对本次 source 自身真实 snapshots 与被保护 snapshot ID 的交集保壳，并保这些 snapshot.runId 指向、且 sourceId 精确相等的 runs。其它源上的保护 snapshot 不保本源壳，不保全部 events/execution 权。无引用源原物理删除。真正引用证明仍由 item/snapshot/run/source/transform/ref 链和组归属形成，不能把缺父改成合法父。
- **旧永久删除公开语义**：正式逐项要求业务 readSource、workspace source/health/membership、全部及 archived 列表/计数、run/events、改删/attach、手动/重试/调度/worker 输入排除壳；原 ID 重访保持 OwnershipError，同 identity 正常创建新源，不复活旧 source。仅严格 provenance 递归父读可见；普通 archive/pause 原行为保留，故不会将删除冒充普通归档。具体入口接线覆盖必须在最终实际 diff 审核与真实服务链验证，不能 helper 存在就算全部完成。
- **并发与控制**：与 reference attach 共用真实组锁，锁内重读当前成员/active run/保护集合再删除；沿账号→成员→组→execution，保护 race 与旧 claim/fence/unknown 不被覆盖。需实际隔离 PG 两事务竞态，不用同事务 Promise 并行冒签锁测试。
- **旧测试校准精确性**：唯一新增既有测试写权限是 intelligence.service.test.ts 原 T665 与新最小壳相冲突的私有物理源/所需 run 断言，同时增加业务不可见验证；原共享 item、选题、snapshot/transform/ref、独占删除与错误确认断言全部保留，旧 RED 保存。不是整个测试文件自由改写权限，source-sync-runner.test.ts 仍不修改/skip。

已实际读 `protected-provenance-delete-red.log`：筛选执行一条真实删除回读测试 FAIL，Project 来源上下文不完整；其余 32 条为筛选未执行，不能冒称删除族 33 条 RED。该日志保留，由后续 GREEN 和完整回归对应。

另核原 T1073 源码：挂起首个 heartbeat 时用户 parent.abort 后，原测试在 heartbeat 释放之前要求 work 已结算及当前 task cancelled/leaseOwner=null，随后 heartbeat/adapter 释放不能再写 item。DEC 保持这个现有即时取消合同，允许在原 source-sync-runner.ts 修复无条件心跳等待；宿主 drain/确定拒绝收口仍等待在途，用户取消不被它挂住，不改原测试/预算/fence/控制归属。此次只签该精确修法的范围，不签当前 runner 已通过。

正式选择沿用户已有 bug 修复与 FR/AC 保护授权，无新增用户许可要求。任一实现实际公开展示壳、复活原 ID、扩大父/执行保留、放宽归属、改 schema/index/公共模式或删除旧断言，均超出本次 PASS，应重新审范围。当前未运行新测试、Next 或平台，未评新 helper 日期/唯一 v1 实现为最终 GREEN。
