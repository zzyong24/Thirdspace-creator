# T-1423 完整 wire 独立审查

2026-10-23。审查人：独立契约审查 agent `ci_contract`。

## 结论

**PASS：仅冻结完整规格，可进入已授权范围的隔离 RED／本地实现与测试。** 未签产品实现、真实 PG、原生落盘、跨端消费、桌面按钮、打包安装或线上验收。无未闭合的实施前合同 finding。

Activity 的六文件本地范围已获用户明确许可；本次通过不扩大写集，不许可提交／推送／部署／重启／真实激活释放／发款。根会话负责 reviewctl 真实 record 及控制面；本文不是已生成的审核收据。

## 冻结输入

Creator 基线 `9c585dd4db5f263d228bb71bb832700dfd81f64e`；Activity 基线 `a3f92b0001c062c079daeb101a550c26c6680395`。实际读取并核对下列 SHA-256；最终写审查前后再次核对全部输入未变。

| 输入 | 实际 SHA-256 |
|---|---|
| Creator `docs/verification/t1423/CLIENT_WIRE.md` | `469af49db347ded655e336e91bc01ca2ffa9f6abf829f152751b29d4af4d3984` |
| Activity `docs/contracts/T-1423-license-restore-current-contract.md` | `b586757b7cae06f2f606c99465d94eab98a6b6f3c4dcc866a115485eab50806d` |
| Creator `docs/features/t1423-legacy-license-one-click-upgrade.md` | `bc36f2a01b79136bc180a56f4b58d6d470c06f1ff39fd3a6795a08b139d18248` |
| Creator `orchestrator/context/T-1423.md` | `ffd85d86a1de0edcdade05ef75a643cbc9b6d4caaaf3d44118642456b983fee9` |
| 外部 `ACTIVITY_LEGACY_UPGRADE_SCOPE.md` | `9fd80fed2f8a74261f9bea7b3fb4325994b9b12d46b28f5e3a70cc8740e914c1` |
| Growth `docs/build/T-249-validation/FORMAL_V1_ECONOMIC_PROTOCOL.md` | `b6d5652c29879d87ca93a1f96523ff6cb811b48827c705df52ced66ff804f753` |
| Growth `formal-v1-economy-r1/CONSUMER_VECTORS.json` | `a7c9ae53ce13c955e8bfcc219085edc04e483ef6da9cc10e5863f3bccf3d069d` |

Activity 候选根：`/Volumes/T7-MacData/CodexBuilds/Activity-T1423-20261023/source`；Creator 工作树：`/Users/zyongzhu/.codex/worktrees/legacy-license-upgrade/Thirdspace-creator`。范围说明位于 `/Users/zyongzhu/terminals/growth-credit-20261023/ACTIVITY_LEGACY_UPGRADE_SCOPE.md`。Growth 工件位于 `/Users/zyongzhu/Workbase/Thirdspace-growth/` 下。

## 完整性结论与实施验收落点

| 核验项 | 规格事实及后续必须兑现的断言 |
|---|---|
| 通用一次点击 | Client §1／4／5：固定保存原码，fresh proof／既有凭据先行；已有钱包、首赠及个人来源保留。精确 pre-fulfill 绑定问题才调用无参原生，恢复后再次 fresh proof，不按本地 TIME／perpetual 展示授予资格。异常停止后明确继续不要求查库、编号或重输码。 |
| 闭合网络合同 | Activity §2–4／8 与 Client §2 对齐 POST 新路径、固定签名 target、版本、exact 请求／响应、43字符 canonical nonce、71字符摘要、UTC24时间、正安全版本、COUNT正剩余／TIME null、HTTP与outcome/code组合。旧端点无回退，原正常 activate/status 不变。 |
| 当前合法原授权 | Activity §6：原已激活、原 usedAt 完整、当前项目／TIME或COUNT／全部grant合法；不首激、不试用、不换机、不复活禁止墓碑。当前target先验资格与精确绑定，已绑定优先 pure no-op；缺绑定才判其他有效授权冲突。 |
| 全量状态与精确 fence | Activity §5：RFC8785确定性S含project、当前/previous候选、目标生命周期与授权版本、全部受影响码／grant／设备／历史、精确releaseSet及排序；不是授权token，也不是仅数量摘要。状态变化或未知材料安全拒绝，不换新摘要静默扩大释放。 |
| 有效绑定与原子性 | Activity §6–7：缺绑定时保护所有有效其他授权；只释放精确同机同项目失效集合，其他机器不动；项目→排序码锁后重读；不调用完整activate或auto-rebind；绑定／审计／实际签名在提交前成功，任一步失败抛出回滚。与既有正常写者锁兼容需真实PG barrier证明，若不能兑现先报告准确新增写集，不能假签实现已安全。 |
| 时钟与原权益 | 原 usedAt、永久null、实际期限／COUNT总剩余已消费／渠道／maxDevices／换绑额度逐字段保持；经济原hash不变。目标 expiry必须null或严格>当前now，等值拒绝；其他待释放授权沿基线<now才过期，等值保护。锁后／末次签名前重核，不用锁前now。 |
| 强验签与落盘 | Client §2／3：新IPC不继承strict=false；固定target/host/digest/Ed25519/nonce，date与serverTime≤2000ms、serverTime与墙钟≤120000ms并保last-seen回拨门。固定原码和当前宿主、保存前同对象复核；checked替换+回读旧／新／unknown三分，服务端原usedAt不误等旧本地重激活时间。runtime gate拒绝即使已确认保存也有准确blocked+verified+confirmed元组，不报ready、不继续经济链、不改旧gate。 |
| 幂等与unknown | Activity §9、Client §3／5：最多inspect／restore一次／未知后只读inspect一次；already_bound纯零写，不作为历史执行回执。仍缺失／集合变化停止旧观察；明确新继续才new inspect/fence。不默认新增operation表或经济journal。 |
| 真实经济协议 | Client §4／5与Growth说明对齐：Growth请求只有contractVersion+fresh proof；原project+entitlement+service业务身份，epoch/nonce/随机header不创建新钱包或赠额。初次404不证明未开户，明确升级可原身份fulfill；本观察已unknown后先读，仍未知停止到明确继续。已有预约只recover且新provider POST=0；若首请求未到达且无预约，明确继续可合法首次创建，不能泛称全程POST=0。paid/冲突不抢占。 |
| DTO与部分成功 | Client §3／4列native和TS允许组合，未列拒绝；只有精确阶段白名单触发恢复，不透传任意上游action。sync/read零经济写，不以配置失败覆盖已知ready；新store屏障后真实GET结果才完整成功，旧读／换group/account/generation／关闭迟到均不污染当前状态，路由PUT偏好不改。 |
| 预算与取消 | Client §3／6：native入场即370000绝对执行deadline含chain_lock等待，HTTP=min(120000,剩余)，无旧mirror第四请求；atomic guard持到真实收尾，停止观察不撤销IPC。UI最初点击起730000绝对观察deadline，各TS阶段及join不续期；真实fetch signal可传递，不能假称撤销已发生经济或原生写。不把理论串行总和改成25分钟，也不承诺所有最坏阶段一次完成。 |
| 范围与验收 | Activity §11准确3新增source+3test无schema/普通activate改动；Creator Client §8独立license_restore.rs及注册/许可/secure-string、license.rs仅prod_points可见性、TS闭合DTO/现端口与UI/store/错误投影。现Packet仍须由root按已审准确路径启用；helper不足先报路径，不扩金额或数据库。RED→GREEN、PG、源码绑定向量及Gate都是实施后要求，不是本次已通过事实。 |

## 本轮已闭合的具体问题

1. 旧弱验签配置：新命令无条件强验签，旧许可兼容链不扩改。
2. 已绑定 no-op 优先级：只读当前合法绑定优先，不因后来出现的其他绑定触发释放；缺绑定才做有效冲突与失效集合判定。
3. 原 activatedAt：采用服务器原 usedAt，不能强等历史旧客户端可能刷新的本地值；模式、渠道及原期限仍严格核对。
4. 到期等值：目标严格大于当前now；待释放占位等值反向保守保护，不修改旧全局helper。
5. 客户端写集和预算：独立native模块、双冗余seen helper仅可见性、入场含锁等待，观察与执行截止分开。
6. exact DTO组合：包括已确认保存但runtime gate拒绝的真实返回，不伪报未保存或ready。
7. unknown消歧：原生未知先只读、停止旧观察；经济404／已有预约／无预约合法首履约分别陈述，不新增无反例持久operation。

这些修正收敛既有确认要求，没有增加新架构、金额规则、数据库或授权范围。无继续阻止隔离RED／实现的合同问题。

## 证据与结论边界

本轮静态逐节联审两份完整合同、SPEC、Packet与必要现有源码，并核Growth实际协议说明及消费者工件SHA。额外只做文档确定性检查：Activity五个公开合成JSON示例可解析，nonce均43字符／32字节且canonical。它们不是发行签名或运行互通证明。

已读取reviewctl实际校验器：输入严格为spec-review-round/v2及四个顶层字段；只读context确认T-1423尚无v2 review history，因此本轮packet为initial。review-input.json只表示本轮真实完整规格PASS，由root实际record；本审查没有运行record或写控制面。

未运行产品测试／编译／PG／网络／真实UI／打包安装，未读取真实许可／密钥／钱包，未修改产品源。Growth四场景是本机ASGI+SQLite内存/fake provider已有输出，Creator实际消费者尚待执行；不冒跨端PASS。Activity真实PG、原生错误注入和source-bound签名向量须在实施后产生。真实桌面／本机限定释放／生产部署继续分别验收。


## R2：跨请求与原生间隙的同原对象增补

**PASS，仅增补规格。** R1正文和输入表保留历史；当前实施应采用下表的R2字节。原R1 `review-input.json` 未覆盖，原收据 `PASS[REV:874bad8f27b3]` 不冒称已自动批准本增补。根会话实际record本次recheck后推进已准范围；实现、真实字节消费及UI另验。

| 当前输入 | SHA-256 |
|---|---|
| CLIENT_WIRE.md（§3参数更正、§10全部窄协议） | `658037d750a8ae3ef671c6906452c35ef354db0cb302f977dd20e2617ae9e401` |
| 新工作树SPEC（跨窗口切码保护补充） | `9a7656816d3a147eb4e8cc9163a849c0404d3f98f644cf42e4ce52d5b0a55339` |
| Activity完整wire（不变） | `b586757b7cae06f2f606c99465d94eab98a6b6f3c4dcc866a115485eab50806d` |

**具体反例与复用判断。** 现单次`access/observationGeneration`只保护一次HTTP；`licenseDigest`未含模式/期限，已有`expectedScopeId`又含恢复可变epoch，不能替代同一次点击的跨请求身份。probe A后另窗口换B，后续独立fresh proof会合法取得B，原无参native也会固定读取B；单纯group/generation fence或native之后拦经济写不能声称守住原授权A。本增补是对既定同原对象要求的必要收紧，不引入经济领域。

**精确闭合。** 初次显式probe无header，由server读可信原快照、绑定真实user/account/group，生成唯一opaque token；其余stage必须带同值header，未知/过期/错actor不重建。Map按完整token exact索引、最多256 live条目、不驱逐live、不续730000原TTL；每stage／Growth请求前与vault/cache写前后复核，成功proof再pin原policy/modelScope/entitlementHash但允许epoch变化。per-entry inFlight禁止并发逻辑动作；fulfillSent只在实际发送点设置，同handle不二次逻辑fulfill。partial-only-sync保原handle；失效后明确重新核对，不能悄悄把原ready迁到新身份。

Token复用现有AES-256-GCM `enc:v1:`标准base64(`iv12|tag16|ct`)；key沿现有模式以SHA256(masterRaw32||固定purpose)派生，purpose为`creatoros-legacy-upgrade-fence-v1`。不新增密码算法/依赖/DB/journal；strict prefix及canonical封包验证明确禁止旧decryptSecret明文透传兼容。六字段closed明文为contractVersion/observationId/licenseIdentityHash/issuedAt/expiresAt/bootNonceHash，UUIDv4、UTC24、精确730000期限；boot复用现握手的SHA256，未增加环境材料。原码、机器及稳定hash只在密文内，JS不能指定原许可事实。

稳定hash的跨语言UTF8 JSON scalar array已精确定义，含purpose/project/code/machine/mode/channel与规范毫秒expiry或null，保`__unassigned__`字面、不把缺失expiry当永久；不纳入epoch、activatedAt和lastSeen，避免合法恢复自身误触fence。Node已有encryptSecret导出、Rust已有aes-gcm及同enc:v1封包，具体可复用来源已读。

Native只接`{observationToken}`，取chain_lock后解封、核sameboot、issued/expires/精确TTL与当前固定snapshot稳定hash再发任何HTTP；A变B时在独立Activity请求前停止。现强验Activity签名、checked回读与运行期门均不被token替代。当前启动同TTL有界used-ID集合在真正调度inspect前消费，重复不得第二次恢复；过期/重复精确blocked CONTINUE_REQUIRED元组不冒称网络unknown。

入场370000独立单调预算与token原剩余取更早截止，不重置；UI保原730000观察截止。已发restore及已开始原子保存仍收尾并按真实结果报告，不假称取消或回滚。

**无未闭合规格finding。** root明确接受此Creator窄更正，仅现21路径；不改Activity六文件范围、Growth请求体、经济身份、已有钱包或首赠。Root负责实际reviewctl记录。R2 packet使用真实`spec-review-round/v2`、`review_kind: recheck`，前轮findings为空，本轮无未决finding，不自造收据。

**验收边界。** Node真实合成master/boot/tuple经现encryptSecret产出token、Rust实际解封/摘要互通，以及跨请求换码/actor/expiry/丢Map/重放/恢复可变epoch/ISO等价期限RED→GREEN，均是作者接下来必须真实执行的实现验收，不是本次已通过。现有native两finding另已有保留RED17pass3fail→GREEN20pass0fail日志及源码增量复核，仅局部销账，不据此签token新实现或全套native通过。本轮没有运行产品测试、网络、PG或读取真实key，未修改产品/控制面。
