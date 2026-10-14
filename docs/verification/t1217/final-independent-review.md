# T1217 最终实现独立评审

## 2026-10-11 稳定代码第一轮复核

本轮只读正式SPEC/DEC/Packet及五产品文件、实际相关回归日志；不启动Next、不读真实用户库/凭据、不触发采集，不重跑重型PG/PGlite。只写本评审。**当前代码存在范围内阻断，暂不能签最终实现/验收PASS。** 以下为已定位源码条件，未冒称本评审运行了负例；已当场通知root/作者补真实隔离回归。后续修复与最终哈希/结果另追加，不覆盖本轮发现。

当前SPEC SHA256 `7474ffdfeb85c7dc1c03880871d460e2272d104e2e010f51a3804f5ca1dda43d`；Packet `1c7d1d81e176dfc3b5d1bed21cc8d3d9bafcdbf2f0dcc308f455b89ebe28b62f`；DEC日志 `ec2e026223c52d1f987fe0521b001e77d2856b53ae84b8e5546ec5e91e5bb4a0`。五产品锚：

|文件|SHA256|
|---|---|
|intelligence-workspace-scope.ts|eb55f2e976cfd441b9070a0b8a68cd37f5c13f7b8c9dc2a26c7d8c7a5f3c65ef|
|intelligence.service.ts|938daa20c240dfb15d183856508ad9671384ec1a62d94a62c18acbcb708f3f78|
|transcript-execution-binding.ts|ac5990fa94e8fb9698f0fe66a0bcc3471aa0b0329b080fea692711200c097a4b|
|project-reference.service.ts|7bbc60f1f1a40285817dfcd8cff4c6e5ca0abb5467b5277f3bace23966fec84a|
|source-sync-runner.ts|6fa953a811aef4f468c18f42700fc6ae80b4f7270675678cb0537df1b92008cc|

### 范围内阻断

1. **未分类异常也会被标成确定准入拒绝。** source-sync-runner.ts:292 的getRun catch不分异常就closeRejectedSourceClaim；:246任意未abort异常都rejected=true，:263收口blocked。合法原claim若遇到临时SQL/transport/普通Error，后续tasks.get恢复成功，会被写SOURCE_SYNC_ADMISSION_REJECTED，而不是保原未知事实。runtimeStatus检查只保护已持久unknown_result，不保护这类未知执行结果。最低真实负族：原真实claim+机械读端临时普通Error，观察原ID/attempt/lease/status不被blocked；确定归属错误仍收口。已审核作者拟typed白名单：当前实际消费点shared OwnershipError、IntelligenceConflictError、platform-account ConflictError均由明确归属/租约/物理关联/重复内容或成员变化抛出，未见临时SQL包装成这些类；只能按真实instanceof及已审端口分类，不靠name/message/code或把execution模块另一同名类并入，adapter失败仍原failureEnvelope。
2. **永久删除只看run缓存状态，漏当前真实重试任务。** intelligence.service.ts:3038以runs.status判在途，未读execution真值；:5481明确承认failed/blocked原run可以对应同task新attempt running的合法显式重试。该时刻永久删除可越过在途guard并:3213删除正在执行的原task。需要同锁事务读/锁实际execution和其控制/未知/queued/running状态，拒绝且零部分删除；不能只改run状态列表或取消原任务洗绿。
3. **删除执行任务仍信内容行的单向指针。** :3151汇总run.executionTaskId、transform.aiTaskId、transcript.executionTaskId，:3213仅按ID删除execution；内容父proof不证明execution。若自有合法source/run的executionTaskId错误指向另一组/用户的无calls queued任务E，当前过滤仍接受该run并删除E。该历史写法在本次删除闭包段仍存在，不能用旧实现作为安全证明。需要同user/物理工作区及kind/owner/payload反向机械绑定，只删明确可证明属于本删除集合的真实终态任务；错指针不触碰别人记录。source_sync对应ownerType=source/ownerId及payload.sourceId；transcribe对应item；topic_preview对应item和sourceSnapshot，rewrite_only另核transformId。share_import没有source反向字段，不能从单向run指针删它。相关真实负族及策略正式补充待作者/root确认。

### 已核成立的边界与当前证据

- logicalGroup真实初始证明含全局account ID唯一v1、账号/组同用户、精确初始组，真实账号缺成员不能降级；withIntelligenceWrite在成员锁内再次核唯一初始history/current版本。普通组无任意NULL支路；bare支路要求全局不存在真实平台account。
- trustedIso仅服务UTC毫秒规范，CASE先regex再安全年月日integer/闰年/月长验证，不对坏日期作timestamp cast；历史截止只作用有createdAt的根，关联由真实item/source/run/snapshot等ID父关系证明。sameOldAccount只在双方NULL强制原account相同。
- source apply先取冻结membership锁再execution锁，同原worker/attempt/lease/fence/当前组及机械source/run双向校验，原runner显式传原claim fence。结果、checkpoint、run和execution终态同事务，未重置预算/ID/attempt。getRunByTask再次核真实source owner/payload，坏业务绑定不选别人的run写。
- 明确用户取消finally保持原即时ack、不无条件等挂起心跳；确定拒绝/drain路径等in-flight再收口；blocked使用原finish严格running CAS及原fence，不改execution控制模块。现ack端口仅原worker/attempt参数，正常换claim会递增attempt，不把当前task回读当新claim凭证。
- 保守transform guard只用于稿件锁、无正文workflow、删除保护；getItem/candidate/preview/Project仍完整内容父/hash证明，Project先按ref自身根列出再明确拒绝坏父，避免坏ref静默空列表。删除保护从本源已证明observation得到真实item交集，run壳只来自完整真实snapshot与同源run，不造假父。
- 壳精确两键adapterConfig与源ID退役前缀不相交合法profile/favorites/darkhorse固定前缀及web/rss64hex身份；清配置/监控/下次时间/分类，普通archive不隐藏。业务source/run/events/membership使用非壳完整proof，snapshot evidence父允许壳但不绕同用户逻辑组或ID父；同identity新建不复活旧ID。删除与attach共享组锁，保护集在锁内重读。
- T665测试diff仅已审source物理断言校准及最小必要run/业务隐藏补断言；原公共影响计数/item/shared/snapshot/transform/ref等断言保留。原T603/T622和T1073断言未改。实际旧7文件日志76/76PASS、216.09秒；真实项目完整41例日志41/41PASS、155.28秒。它们没有覆盖上述三条新负族，不能消除源码阻断。type日志及作者实际exit0、boundary无新增且5基线保留；timeout-policy旧总exit1仍在。

补充删除策略必要界线：T665裸旧fixture确实payload={}、同user/account/source_sync/source owner/终态，但原HEAD真实startRun已写payload.sourceId，不能仅凭fixture称历史真人数据必缺payload。若保裸无平台账号旧合同，至少严格实际无account、同user/account、task.group只NULL或原精确legacy表示、明确kind/owner双向关联，payload存在相反事实仍拒绝。真实账号/组不可借该例外，跨用户/跨组/坏owner/baretask负族须实际发生。share_import无法证明可删时保原终态execution而清本源业务内容，可避免扩大删除；这是确定性保原、不新增执行权，但须正式SPEC/DEC明确该保留边界，active/unknown不可被当终态跳过。

当前等待新实现hash、上述真实RED/GREEN、全部最终族及公共浏览器旅程证据；不将前置scope PASS或部分已过回归代签整体任务完成。

## 2026-10-11 正式安全收口补充范围准入

已重新读正式SPEC尾“最终复核发现的拒绝分类与删除执行绑定”及DEC补充。该精确安全修复**范围准入PASS**；本轮第一轮产品锚的三条阻断仍待实现/实测，未因此变成实现PASS。当前正式SPEC SHA256 `75b769c57bf3e1edda2507e00d3e4038e5a30f358017f470aacc0c9c84a6a419`；Packet `2f90e4b99509939fa2acf45fd3f7589567157206d86f6cb1bd09b81e26b0955e`；DEC日志 `625971f9f5a3946c2f3475291b28b5d2f35f89a6fa2abca5adb7ce8a201b3bc0`。

正式补充已限定三个真实typed错误类及已审机械消费者，普通SQL/transport/配置/adapter异常不依name/code误归；新增当前真实execution重试/控制/未知在途检查和逐族双向ID/owner/payload证明，错指针零部分删除；bare兼容明确全局没有真实平台账号、原user/account、NULL或精确legacy组、真实反向owner及payload无矛盾，缺真实member不降级。share_import没有反向source事实，不能从run指针删除；仅同工作区已证明确定终态且无未完成控制/未知/在途时，合法来源删除清本源内容并保无法证明可删的原execution，不新增关系或执行权。五产品/已审测试白名单、原旧失败和断言保持。

以上是在原任务安全/永久删除和引用保护授权内兑现机械边界，无新增用户确认需求。表述上须精确：保原share终态task可能让既有execution.tasks.get/list继续回读该历史任务，不能声称删除前后所有公开历史查询逐字相同；本次不新增端点/权限/复活或续期，来源列表、源run/events及旧sourceID仍保持永久删除业务语义。已通知root记录此实际可观察差别。后续必须真实验retry在途、不同user/group/owner的run/transform/transcript坏task指针、bare矛盾及合法分享源删除；之前41/76的日志不能代签后增族。

## 2026-10-11 第二轮稳定实现与历史任务父边界

只读本轮 stable-product-hashes-final-53-before.txt，对应 intelligence.service.ts SHA256 `89f4caf47bc09f95af40a448dfe3a90d6820794d8019a4ea9f4558e1556ec925`、source-sync-runner.ts `b3b8ce66ada28388bca42c2515c95979b60f06b792edc4a8743b1204ff91b0ae`，其它三个产品哈希与前表相同。当前正式 SPEC `def3e6b20714466519584ba376631b5ba1c70d5ef2ebc7a41116da00789bb405`、Packet `d9e9b09e0a9e8b2feeec49b904b32f77b466668d4666ea26e582d420a34f541c`。前轮三条已见定点修复：真实 typed 白名单、删除前真实 execution 锁及在途检查、逐族反向 owner/payload。仍有以下范围内阻断，不签最终实现/验收 PASS；这是实际源码及数据库约束推论，不冒称本评审运行了 RED。

1. **合法执行账号不等于来源历史元数据。** startRun 把 run.accountId 设为 source.accountId，同时 taskContext.accountId 取 collectorAccountId 或实际 ctx.accountId 或 NULL；删除的 `task.accountId!==run.accountId` 强等会拒绝合法组 RSS/web（历史 A、实际同组 B 或无账号）以及无账号来源根但明确 collector A 的平台采集。原组内容在 A 后续转出后仍可读，不等于用 A 执行。必须按任务本体的真实工作区、冻结历史成员和反向来源绑定核执行事实，不能从来源/运行元数据猜原调用者。作者/root 已收到反馈并安排真实合法族先 RED 再修；原 wrong-account 负族须继续限定跨组/缺正确冻结成员，不能把同组合法 B 洗成错误输入。
2. **已结算调用仍有真实外键，删任务会反杀合法永久删除。** 0071 的 execution_calls.execution_task_id、0080 的 execution_evidence.execution_task_id、0083 的 execution_stream_events.execution_task_id 都引用 execution_tasks，无删除级联。真实 topic-preview generator 经 generation bridge 建立预算和 reserve/start/settle 调用；未确认 candidate 的终态任务会进入当前删除集合，即使 unresolvedCalls 查询为空，删除 execution 仍受这些已结算引用约束。之前 confirmed/Project 保护族与 T665 裸 fixture 不覆盖该消费者。最低实际族须经真实 startTopicPreview、真实 ledger reserve/start/settle 及终态未确认 candidate，再调用 deleteSource；不得删审计/计费或把 terminal 改 active 规避。

### 补充候选范围准入（不是新实现签名）

**以下精确保守方案范围准入 PASS，正式 SPEC/DEC 尚待 root 补入后再核新哈希。** 已证明任务本体 user/工作区、逐族双向 owner/payload，且确定终态、无在途/未知/未完成控制时，已有真实审计或其它受保护外键引用的原任务父保留；来源业务记录和其未保护内容照原合同清理，不删账本/计费/evidence，不新建 task、不续期、不新增访问或执行权。无引用且确可删除的任务才按原合同删除。错误 user/group/kind/owner/payload 指针仍零部分删除；active/reserved/started/unknown/control 不能被“保审计”支路跳过。原 execution.tasks.get/list 可继续读历史须明确，不能声称所有历史查询逐字不变。该方向可在五文件内查询并保原父，不要求修改 executioncore/schema。

真实 FK 清单还包括 0069 的 ai_tasks.execution_task_id，以及 0129 的 workbench_artifact_lineages.pending_task_id、workbench_artifact_lineage_versions.task_id；后者另有 operation_id 引用 execution_calls，AI result、call parent、stream/evidence 也引用 calls。本次不得删除 calls，因此不新增这些子引用的级联清理。不能用三表清单冒称全部消费者已穷尽；须覆盖所有实际 task FK 的保原判断，或对明显非本链矛盾按既有严格证明拒绝，保其他原记录。已当场告知 root/作者。

终态历史成员证明只核冻结 task.accountId 对应同 user/account/group/version 的唯一真实成员及可靠 joinedAt/leftAt 与 task.createdAt 时间关系，不要求成员当前有效、不等当前 groupVersion/当前 source collector。组无账号 task 不造成员；真实账号缺历史成员不能 bare 降级。历史证明不授权重新运行旧任务。缺证明与矛盾应区别：不能证明可删但无反向矛盾的终态父若要保原，须正式限定保守分支；明确错组/错用户/错 owner 或 payload 矛盾仍拒绝。当前真实 updateSource 公共输入只有 collectionId/displayName/monitorEnabled/syncPolicy/instruction/expectedVersion，无 config/collector 修改入口，故“公共更新 collector 后删除”尚无源码入口证明；历史配置变化测试只能明确标注隔离历史/fault-injection，不能冒称真人现用操作。

后续必要族：合法组 RSS 的历史 A/同组 B 执行及无账号执行、无账号来源根/明确 collector A、terminal 后真实成员转出仍合法删除；冻结成员跨组/错版本/重复/缺失及错误指针零变更；真实 settled 调用（含相应 evidence/stream 引用）保最小任务父、源业务不可读且原审计与 ID/计费不变；无引用合法终态原删除；active/unknown/reserved/started 控制族仍拒绝。当前 53 结果由作者报告，本评审未以其替代上述新族及全部相关 76/公共 E2E 最终证据。

## 2026-10-11 final-60-before 冻结实现复核（验收仍待终态）

当前 service SHA256 `c96cc48bc955461f8efcc9f64b7945474ac022ad2852020a0660ed7f7a3f7e4c`；其余四产品与 final-53-before 表相同；integration 测试 `d79643d53400a4a673ed050061e3174a53d2f0e836b7f817a798fb06bc3a0fee`。正式 SPEC `f1aa15df6a1ed3363f425065edfbbb4219bb540a45dfda5be160c5ec20649bae`、Packet `c37e7a3e8b56eeaa11248627c02cb5ad5e4b9cb6ef346aa5ea39a2be644fe162`、DEC `f332753a41a7e440f0a8008f379a2e81d33efaf6cbdd3ec9caec9d2fc811792d`。本轮只读实现、正式补充和测试；不跑 Next/重型测试、不修改产品/控制面。

**本轮源码实现复核未见新阻断，前轮两项已定点修复；最终验收尚未签 PASS。** canonical 删除不强等来源/run 历史账号，只对 task 的真实账号核同用户、同组、同版本唯一历史成员，createdAt/joinedAt/leftAt 必须为 UTC toISOString 规范且时间范围包含原任务；不要求 current member 或当前 groupVersion/collector。bare 仍严格原账号，不能用于真实账号缺成员。execution 升序锁后重新核 raw user/group/account、kind/owner/payload；之前只读集合不会把变化后的外组任务授权删除。六类真实 FK 查询为 calls/evidence/stream/AI task/workbench pending/version，确有引用才保原父，源内容仍按原集合清理；在途 execution 与 reserved/started/unknown 等未结算检查先于保父，不删计费/审计，不改 executioncore。正式补充与已审边界一致。

生产 source runner 的 typed 白名单实际消费者也已核：frontend/src/server/persistence-client.ts 的 sourceRunnerDeps 直接绑定同进程 persistentTaskService/intelligenceService/adapter，recovery source_sync lane 直接把该 deps 传给 drain；这里不经 IPC 错误序列化，instanceof 有实际类型真值。该源文件本轮只读未纳入写集。未分类错误保 claim、确定拒绝原 blocked/fence/CAS、unknown/control 优先、明确用户取消即时 ack 的前轮判断仍成立。

当前测试真实覆盖无账号 RSS、group-only profile/真实 collector、缺/错组/错版本/坏时间历史成员拒绝、真实 reserve/start/settle 的 settled/rejected 未确认 topic、真实 stream append，以及 evidence/lineage version 的 schema FK 夹具；另外无 calls 的 AI/pending 引用独立族防止只靠 calls 一支侥幸保父。测试明确 evidence/产物私有 FK 夹具不冒充工具或工作台公共生成；不据此签其生产业务完整链。源码和测试边界准确，聚焦 PASS 不能当完整 60 PASS。

尚需补的正式正族已当场告知 root/作者：同组真实 B 执行历史 A RSS/web 来源后删除；已有真实 account task 终态后真实成员转出再删除。现 RSS 用例是先 A 转出、再创建 NULL 账号新 task，不能证明有账号历史 task 的退出成员路径。完整 60、旧相关 76 的自然终态及 3914 公共来源到项目回读/截图仍待发生；若新族追加须再绑定最终源/测试哈希。不将旧原回归或本轮源码通过代签全功能/全局 Gate。

## 2026-10-11 新真实计量未知 RED 与最小判据准入

已读 historical-execution-and-unresolved-ledger-first.log：当前66条筛选执行6条，为5 PASS/1 FAIL/60未执行，22.35秒；真实 settled、usage={}、tokens计量调用经 ledger.inspect 仍为 unknownUsage，任务随后虽确定终态，当前 deleteSource 却返回 deleted。这是新范围内真实 RED，不能用上一轮60候选代码复核或筛选GREEN抹掉。两合法账号正族以及 reserved/started/unknown 已在该聚焦实际通过，完整回归仍待最终树。

**精确最小补充范围准入 PASS，尚未签新实现。** intelligence.service.ts 的 unresolvedCalls 原状态集合另加 `status='settled' AND total_tokens IS NULL AND accounting_basis<>'requests'`，与真实 execution-call-ledger.service.ts:56 的 assertResolved 机械语义一致；保原组/执行锁、source/task双向、在途/unknown/control零删除。该计量判据仅用于拒绝尚未对账的来源删除，不重置预算/改调用状态，不修改 executioncore/schema 或扩大其它删除授权。

不能直接用 inspect 的 unknownUsage 统一拒绝：同源 totals:39 对 requests 已结算无token也返回未知，但原 ledger 单测“请求计量保留 token 未知但允许已结算 ASR 的下一片，未知请求仍阻断”明确该例合法，assertResolved 只豁免已settled requests。须增同真实 reserve/start/settle usage={}、accountingBasis=requests 的终态后合法删除正例，保原父/审计调用和原 ID；token计量缺量 RED 应拒绝且所有原数据零部分变更，原 reserved/started/unknown负族和合法已知tokens/rejected继续保持。不把 requests 解释为token=0，不修改旧账本断言。root待补正式SPEC/DEC，新最终hash与完整结果另追加。

作者只读提出 dangling execution pointer 边界，本评审认为无需扩成新 blanket 拒绝：被指任务实际缺失不等于错指存在的他人/其它业务任务，原永久删除没有要求历史 execution 必存在。缺失行不进入可删 execution 集合、不造父/任务、不猜其归属/状态；内容完整证明、原 run 在途及最小保护闭包仍守。真实 calls/evidence/stream 外键保证合法审计引用不能对应缺失父，不能关闭 FK 绕此事实。现存任务的 user/group/kind/owner/payload 矛盾仍拒绝且零变更。已告知 root/作者仅记录边界，不扩大当前产品/测试写集或把损坏内容授予新执行权。

## 2026-10-11 final-67 稳定源码与完整隔离族实测复核

已读 final-67-before/after 两份相同产品/测试哈希、source-workspace-final-67.log 实际自然终态67/67 PASS、217.80秒及最终 type/boundary/diff 文件。当前 intelligence.service.ts SHA256 `9311ada59d258ee629ff76a2d2430116574b21f89493214e4a5c4310e14a792d`；integration 测试 `0769e7f8de6f73e7a68c71057fcf126aca184a722d915011f0efeead821a3a7b`；其余四产品沿前表。正式 SPEC `b72c6ec46c116f6b8030a17137359bcfe6f8e4e296b03edfa73f8b563615416c`；Packet `268db6505e72b14d66666c0d91729fc340bd7fd541fc68b677cebdeb7563484f`；DEC `4c1c3431c156b26b30cbea97da28a40437a03547df74be2ef75fe58e36cb02a9`。

**当前精确源码实现及新增完整隔离67族复核 PASS；整体验收仍待旧相关76与公共浏览器终态。** 最后 unresolvedCalls 查询已沿 assertResolved 增 settled+NULL tokens+非requests，仍先拦未对账再保六类审计父；真实 requests 合法不被未知token误杀。最终测试补齐有账号task终态后真实成员转出、同组真实B调用历史A来源两正族，原task/account/member及来源run元数据各自断言；同时 reserved/started/unknown/token缺量拒绝零部分变更和 requests 成功保task/calls均真实全量执行。前节两待补正族现在闭合，原1FAIL/5PASS筛选RED保留，不重写为原已全绿。

type/diff 当场exit0由作者报告与root工具见证，type日志为真实tsc命令无错误（不把空日志当再次独立运行）；boundary实际无新增，剩5原基线准确保留。67日志另有pg client在途并发查询的deprecation warning，当前结果通过，未把该警告伪成新功能故障或擅自扩改执行模块。

本评审未重跑测试/Next或访问真人库。真实 adapter/ASR 内容族为已标注隔离替身，schema evidence/产物FK夹具不代签其生成端公共链。相关-existing-regressions-final-67.log 当前仍只有RUN未终态，3914尚未提交最终证据；因此不以67数、type/boundary或模型评审替代原76及来源→项目真实公共写入/读回/截图，也不签全功能或全局reconcile。

## 2026-10-11 原相关76实际终态追加

已读 related-existing-regressions-final-67.log 自然终态7文件/76条全部PASS、213.40秒，无skip。stable-product-hashes-final-76-after.txt 与67运行前后逐项同哈希，service仍9311ada59…、integration仍0769e7f8…，五产品未混源。原T1073公共source见证在真实日志保留：模拟250000ms、调用1/峰值1，无pending，成功attempt1、明确取消attempt1、既有failure恢复attempt2；不是真人等待/模型声明。

**当前精确后端源码、新增67和原相关76回归验收 PASS；公共来源到项目浏览器链仍待执行。** 不再把旧相关76列成未完成，但尚无3914最终报告/截图/公开同ID回读，不签整体T1217完成、真人平台或全局绿色。T1226全树/config冻结与唯一Next调度由root串行维护，本评审未启动或控制。
