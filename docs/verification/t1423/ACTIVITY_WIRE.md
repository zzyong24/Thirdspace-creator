# T-1402-AM 原授权安全绑定恢复合同

2026-10-23。版本 `license-restore-current-v1`。状态：**完整合同待独立评审，产品代码和本任务测试均未实施**。

## 1. 权威、授权与范围

本任务 ID 为 `T-1402-AM`，映射 Creator `T-1402`；基线 `a3f92b0001c062c079daeb101a550c26c6680395`，独立候选 `/Volumes/T7-MacData/CodexBuilds/Activity-T1402-20261023/source`，不混入 T250 试用候选。该 ID 在基线 BACKLOG/ID_REGISTRY 未占用；不修改 ID_REGISTRY，标识只在本合同命名空间使用。

用户已阅读 `/Users/zyongzhu/terminals/growth-credit-20261023/ACTIVITY_LEGACY_UPGRADE_SCOPE.md` 并明确答复“允许上述本地实现与测试”。只准该文精确六文件及列明控制面；不提交、推送、部署、重启、真实激活/换绑、实赠、批量迁移或解锁。Activity 仍是许可/设备事实权威；Growth 管钱包/模型履约；Creator 管本机可信许可与交互。本接口不接收金额、服务名、钱包、模型/Key、Growth ownerProof、任意待释放码列表。

普通 `/api/license/activate` 的显式换码政策不变。本合同只把已激活、当前仍合法的原 TIME/COUNT 授权恢复为当前机器绑定。旧服务忽略普通 activate 新字段会危险，因此使用全新路径；绝不借旧 activate/status 活跃结果绕过本合同。

## 2. 端点、传输与绝对预算

- 唯一路径：`POST /api/license/restore-current`；无 query、无重定向、无 alternate host。响应 `Cache-Control: no-store`；请求仅接受 `application/json`（允许 UTF-8 charset），UTF-8 JSON 对象，正文最多 4096 字节。错误方法405，正文过大413，其余格式/版本/字段错误422。禁止记录正文或长期保留原码/机器标识。
- inspect 和 restore 共用路径，`action` 是严格区分字段；只认本版本，不做兼容字段忽略、snake_case 别名或 string 强转。对象不得为 null/数组；任何额外字段拒绝。
- 原生每次 HTTP 最多120000ms，单次原生观察绝对截止370000ms，包括最初 inspect、最多一次 restore、未知后最多一次只读 inspect及收尾；每步都受剩余总预算约束，不重置总钟。网络层不自动 retry POST，不通过镜像 activate/status 补写。Creator UI 沿原730000ms观察上限，不把原生总预算续成多轮。
- Activity 单个恢复事务总上限30000ms，等连接/事务开启最多5000ms；所有 SQL/等待受总事务截止，超时/死锁/序列化冲突均整体回滚、503 `RESTORE_UNAVAILABLE`，不得内部重新观察新集合后自动再写。响应丢失仍按§9当前状态收敛。

## 3. 精确请求

### 3.1 共同字段（每一项必传）

| 字段 | 精确类型及约束 |
|---|---|
| `contractVersion` | 字面量 `license-restore-current-v1`。 |
| `action` | inspect 或 restore 字面量。 |
| `projectKey` | ASCII `[a-z][a-z0-9_-]{0,63}`，必须命中原码项目，不允许缺省项目。 |
| `code` | 非空 string，UTF-8字节长度1–256，无 U+0000–001F/U+007F、无首尾空白；不改变大小写或格式，按原码安全查找规则查找。 |
| `machineId` | 非空 string，UTF-8字节长度1–256，无 U+0000–001F/U+007F、无首尾空白；来自原生既有机器身份，不接受摘要代填/前端输入。 |
| `nonce` | 32字节随机值的无 padding canonical base64url，精确43个 `[A-Za-z0-9_-]` 字符，解码再编码必须逐字相等。每次 HTTP 新生成，不复用 proof nonce；只从正文读取，不从 header兜底。 |

inspect exact keys：`[contractVersion,action,projectKey,code,machineId,nonce]`。

restore exact keys：上述六项加 `expectedStateDigest`，值必须为 `sha256:` + 64个小写十六进制字符，长度71。该值来自同一次用户观察的已验签 inspect `ready_missing`。客户端无权提交其他码、数量、设备引用、变更版本或失效理由。

## 4. 精确响应（所有结果同一顶层 shape）

exact keys：`[contractVersion,action,nonce,serverTime,outcome,code,expectedStateDigest,invalidBindingCount,license]`。除表列 null 不得省略字段、混旧 activate snake_case 字段或额外扩展。

| 字段 | 类型/语义 |
|---|---|
| `contractVersion` | `license-restore-current-v1`。 |
| `action` | 已解析合法 action 时原样回显；无法合法解析时 null。 |
| `nonce` | 正文中独立校验合法的 nonce原样回显；不可获得/非法时 null，绝不回显超长/未验证文本。 |
| `serverTime` | 当前真实UTC时间，精确24字符 `YYYY-MM-DDTHH:mm:ss.sssZ`。 |
| `outcome` | `ready_missing` / `already_bound` / `restored` / `denied`。 |
| `code` | 非denied一律null；denied为§8枚举，不放内部错误/SQL/秘密。 |
| `expectedStateDigest` | 仅 inspect `ready_missing` 非null；其余一律null。restore不得返回可供静默下一轮重试的新摘要。 |
| `invalidBindingCount` | 非负安全整数；ready_missing为精确待释放**不同其他授权**数；restored为本次释放的不同其他授权数；already_bound/denied固定0。不得当成钱包/设备数。 |
| `license` | ready_missing/already_bound/restored为下述闭合对象；denied固定null。 |

`license` exact keys：

| 字段 | 类型/约束 |
|---|---|
| `projectKey` | 原请求项目key。 |
| `licenseMode` | 原码真实 `TIME` 或 `COUNT`，不得客户端推断为永久/改写类型。 |
| `activatedAt` | 原 `usedAt` 精确UTC24字符时间，必须非null，不能用本次恢复时间代替。 |
| `expiresAt` | 原有效到期UTC24字符时间或null；TIME用原 `getActualExpiresAt`，COUNT固定null；null不可转新期限。 |
| `remainingCount` | COUNT原非负安全整数且须>0；TIME固定null。 |
| `channelRef` | 原数据库渠道 string或null，不把字面 `__unassigned__` 变null，不按当前包换渠道。 |
| `entitlementBindingHash` | 原 `feedbackAuthorizationRefHash`，`sha256:`+64小写hex，原经济身份不变。 |
| `authorizationVersion` | 原/恢复后当前 `feedbackAuthorizationVersion`，正安全整数；只是权限epoch，不是新经济身份。 |
| `deviceStateVersion` | 原/恢复后当前正安全整数版本。 |
| `isActivated` | 恒true，只表示该原码历史已激活；不能单独证明当前绑定有效。 |
| `bindingValid` | ready_missing为false；already_bound/restored恒true。 |

HTTP200仅上述三个非denied outcome。只有 HTTP200、action与请求匹配、nonce/签名/时间校验通过、outcome为already_bound/restored且bindingValid=true，才可 checked保存当前许可；ready_missing不可安装为有效快照。原码不回传，原生使用同一锁下自己保存的原码；channel/模式/原期限/次数须与本次已验签观察一致。activatedAt以服务器原usedAt为准，不能强等旧本地activatedAt（旧客户端可能曾错误重置本地值）；保存后保留服务器原始开始时间。不把该响应当模型证明；保存回读后再 fresh proof。

## 5. 状态摘要的确定性定义

### 5.1 算法与范围

`expectedStateDigest = 'sha256:' + hexLower(SHA256(UTF8(canonicalizeJson(S))))`。`canonicalizeJson` 必须复用现有 `src/lib/growth-integration-contract.ts` 的 RFC8785实现。下面每层 exact keys全部存在；数据库null显式null；Date为UTC24字符；整数为安全整数；bool不强转。S只存在服务器内存/隔离fixture，不作为响应/日志输出。

S exact keys：`[contractVersion,purpose,project,machineCandidates,targetId,codes,releaseSet]`：

- `contractVersion: 'license-restore-current-state-v1'`，`purpose: 'restore-current-only'`。
- `project` exact `{id,projectKey,isEnabled}`，锁后原项目事实。
- `machineCandidates` 为当前及previous机器摘要候选的数组，每项 exact `{kid,digest}`，按kid再digest的ASCII序排序；来自服务器原机器摘要算法、项目和请求machineId。未启用安全模式且确为legacy本地存储时，数组仅 `{kid:'legacy-plaintext',digest:machineId}`，只能用于服务器内存canonical输入，不回传或持久化。若部署安全模式要求key却不可用，直接拒绝，不能降为plaintext。候选kid轮换改变摘要。
- `targetId` 为目标本地码ID，只存服务器内存摘要输入。
- `codes` 包含目标，以及同项目legacy usedBy命中上述候选或合法明文legacy、以及 active设备machineDigest命中候选的所有其他授权；按code.id升序去重。每一code必须加载**全部**设备行、全部绑定历史、完整关联grant，不只当前机器/最后一行。不能只取第一条绑定/只查target。找不到码或历史无法一致解释直接拒绝，不截断后签ready。
- `releaseSet` 是锁内确定的其他失效绑定精确集合，数组按codeId升序；每项 exact `{codeId,reasons,legacy,deviceIds}`。`reasons` 是§6失效理由按ASCII序的非空数组；`legacy` bool说明是否命中legacy投影；`deviceIds`仅当前机器命中的active设备ID升序数组。目标从不在此集合，其他机器device从不在内。无失效占位为`[]`。

每个 `codes[]` exact字段：

```text
id, projectId, createdAt, updatedAt, licenseMode, isUsed, usedAt,
expiresAt, validDays, totalCount, remainingCount, consumedCount,
channelRef, revokedAt, authorizationRefHash, authorizationVersion,
maxDevices, deviceStateVersion, usedBy, usedByDigestKid, lastBoundAt,
lastRebindAt, rebindCount, autoRebindCount, licenseGrant,
orderFulfillmentGrant, devices, histories
```

`authorizationRefHash/authorizationVersion` 映射原feedback两个字段。其他直接映射同名列；所有可空列显式null；不把密文、原码、Key、grant外部订单正文放进S。`updatedAt`保守纳入fence，状态读回/其他合法动作导致变化时安全拒绝，不忽略变化继续写。

`licenseGrant` 为null或exact `{id,projectId,activationCodeId,channelRef,planRef,status,version,revokedAt,updatedAt}`。

`orderFulfillmentGrant` 为null或exact `{grantId,projectId,activationCodeId,planRef,status,licenseKind,lifecycle,termStartAt,termEndAt,termVersion,revokedAt,updatedAt}`。只判全部授权事实，不把有一个正常grant视作另一个撤权grant无效。

`devices` 按id升序，每项exact `{id,deviceRef,activationCodeId,projectId,machineDigest,machineDigestKid,activeMachineDigest,slot,status,boundAt,lastSeenAt,removedAt,createdAt,updatedAt}`。不省removed墓碑、不用本地行id单独替代生命周期。

`histories` 按id升序，每项exact `{id,eventType,operatorType,fromMachineId,fromMachineDigestKid,toMachineId,toMachineDigestKid,reason,createdAt}`；无对应值列为null。历史变更及人工禁止原因因此进入摘要。所有kid必须可解释为配置current/previous（已存在的真实plaintext legacy另按legacy分支），未知/损坏事实不可release。

### 5.2 有效期与权限

此摘要不是bearer token，也不授予操作权，不要求新签发密钥或新持久表；本身无独立TTL。它只在当前授权依然有效、当前事实完整、重新分类与精确状态相同的时刻匹配。每次HTTP重新验原码/项目/机器，每次提交按锁后当前真实时钟检查到期及失效集合。状态未变时旧摘要不扩大权限；目标到期、任一占位恢复有效、关联grant/epoch/设备/历史/kid变化均拒绝旧观察。响应自身有新nonce、日期与新路径签名约束，不能使用旧签名响应覆盖当前事实。

## 6. 当前权威与拒绝优先级

共同目标门：项目存在且启用；精确原码属于该项目；目标`isUsed=true`且非null原usedAt和时间/次数字段自洽；许可必须TIME/COUNT；码及任一关联grant均未撤权且归属/渠道一致。原授权身份hash/epoch、设备版本必须完整。TIME按原getActualExpiresAt判断，恢复的当前时间不启动validDays；COUNT按原剩余次数>0。annual/有term的grant本版本不提供绑定恢复，返回UNSUPPORTED_LICENSE，不调用annual激活/续期路径；若原绑定已合法且可完整只读核明原term，也不借本端点扩大为新term支持，统一拒绝该本版本目标。

服务器已持有码的原生请求沿既有“持原码+machineId”许可权限，不冒称硬件远程证明或账号OTP。目标缺binding但原isUsed/usedAt完整，可在下面严格条件下恢复；缺少原激活事实不可重建/猜测。原生保存快照仅保护客户端边界，不替代服务端事实。

当前机器其他绑定的状态分为：

1. **有效**：TIME未过期/COUNT未耗尽，且码/全部关联grant合法有效。未知类型/归属或损坏字段不是“失效”，按不可核验拒绝。
2. **失效**：当前时间确认`EXPIRED`，COUNT确认`COUNT_DEPLETED`，码已撤销`CODE_REVOKED`，关联LicenseGrant撤销`LICENSE_GRANT_REVOKED`，或OrderFulfillmentGrant撤销/终止`ORDER_GRANT_REVOKED`。可并存，reasons排序并全部纳入摘要。非已知active/revoked/lifecycle枚举的值不是失效理由，不能推断释放。未识别的trial占位不据TIME规则释放，按不可核验停止。
3. **不可核验**：缺码/不完整授权或历史、未知kid、别项目投影、active/removed/legacy自相矛盾、无法证实机器归属；typed拒绝，零写。

目标当前绑定按设备行优先：只要有任何设备登记/墓碑，不得fallback裸usedBy。匹配当前机器active才有效；目标存在其他机器active即BOUND_ELSEWHERE，不能auto-rebind/踢人；removed只允许既有明确系统可恢复事件 `AUTO_REBIND`、`REUSABLE_BINDING_RELEASED`、`DEVICE_CODE_SWITCH_RELEASED` 且无更新的manual/force/revoke禁止事件，其他原因一律BINDING_NOT_RECOVERABLE。不能把本次恢复自身事件当成未来任意换机凭证。多设备目标有removed但当前slot规则不允许恢复时拒绝，不涨maxDevices。target设备行未知kid/归属错误或usedBy与active投影矛盾时拒绝。没有设备行时，legacy current-match可直接already_bound；非null他机legacy拒绝；null仅在原激活完整、没有禁止历史时视为ready_missing。

| 当前权威（按此优先顺序） | inspect | restore | 数据写 |
|---|---|---|---|
| 项目/目标/历史资格不合法或目标不可核验 | 对应denied | 对应denied | 0 |
| 目标在其他机器active或禁止墓碑 | 对应denied | 对应denied | 0 |
| 目标当前机器绑定合法 | already_bound | already_bound（摘要可旧，其他后来存在有效/失效绑定也不释放） | 0，包括不刷新lastSeen、不补legacy设备行 |
| 目标缺binding且同机同项目任一其他有效授权 | ACTIVE_BINDING_CONFLICT | ACTIVE_BINDING_CONFLICT | 0（即使混有失效占位） |
| 目标缺binding、全事实可核、其他全部已确认失效或空 | ready_missing+摘要 | 摘要相同才restored；否则STATE_CHANGED | inspect 0；restore仅精确集合+目标绑定+审计 |

本新入口的目标有效期必须严格满足原实际expiresAt为null或 `expiresAt > 当前now`；等于当前now也拒绝LICENSE_EXPIRED，签名/提交前末次重判同样如此，避免签bindingValid后客户端立刻按截止拒绝。仅对新入口加严格目标门，不修改全局helper。其他待释放授权的EXPIRED沿基线保守判定 `expiresAt < 当前now`，等值仍作为有效冲突保护，不能借新目标门扩大可释放集合。分类、fence重算及最终签名前都用当前时钟，不能用锁前now。

## 7. 原子提交和不变量

inspect只进行读取，不调用会写的`ensureLegacyDeviceBinding`、`publicDeviceAccess`或Growth设备list包装。为避免读到跨事务的混合事实，可用数据库只读一致性事务；不能写率限bucket、lastSeen、运行时快照或设备行来完成inspect。读取后分类为ready仅是建议，提交必须从头重验。

restore操作顺序固定：

1. 严格解析请求和加载签名能力，生产环境签名能力不可用在任何mutation前拒绝；先检查本轮事务/观察剩余截止。
2. 事务内先锁项目行，串行化同产品包括同机器操作；查询目标/全部同机legacy及active设备对应码，按升序锁全部受影响码（复用既有`lockDeviceCodes`），再读取项目、码、grant、全设备/历史。不得沿锁前对象继续判断；提交前发现受影响集合增加须重新安全拒绝，不在旧fence补放行。
3. 共同资格门→目标绑定状态。already_bound只读no-op，其他后来存在有效/失效绑定也不释放；缺绑定才先做所有有效其他授权保护，再重算S并匹配expectedStateDigest。任何无法解释的状态拒绝。需在真实PG测试证明与原normal activate、Growth register/revoke、另一个restore采用的项目/码锁相容；若发现必要写者未遵循锁，先报精确额外写集，不冒签本合同原子PASS。
4. 仅释放releaseSet命中的同机legacy投影和同机active设备行；不能删除码、设备墓碑、历史、其他机器行。对旧占位更新既有授权epoch/设备版本并写`REUSABLE_BINDING_RELEASED`、operator SYSTEM，原有效期/次数不动。需要的绑定history不可省。
5. 按原单/多设备slot约束恢复目标当前机器，写目标binding字段及必要设备行/原投影、lastBoundAt/设备版本/权限epoch；写专用`CURRENT_BINDING_RESTORED`、operator CLIENT审计（既有字符串列，不迁移）。不得增长autoRebindCount/rebindCount，不进入auto-rebind。COUNT只补原legacy绑定及审计，不调用消费；TIME可复用安全原语，不能调用完整activate。
6. 再读取目标及当前事实，核授权有效和精确当前绑定，逐字段确认不变量；生成响应并在事务成功提交**之前**完成实际响应体签名。签名抛错、helper返回失败、唯一约束/审计/写错误一律抛出使全部回滚，不在写后仅返回denied让事务提交。route提供签名回调或等价显式结构，不把“配置存在”当成实际签名成功证明。
7. 响应签名成功后事务commit；HTTP发送前/发送时断网不撤销已commit绑定，只触发§9只读收敛。不能为了伪装网络成功补第二次写。

目标必须逐字段不变：`id/code/feedbackAuthorizationRefHash/isUsed/usedAt/validDays/expiresAt/totalCount/remainingCount/consumedCount/channelRef/projectId/maxDevices/allowAutoRebind/autoRebindCooldownMinutes/autoRebindMaxCount/rebindCount/autoRebindCount`，以及grant全部经济/期限/term身份。原永久TIME仍无到期；COUNT总/剩余/已消费次数不变；不发新code、不新增term、trial activation或operation表。usedBy及kid/masked、lastBoundAt、updatedAt、目标设备版本/授权epoch可按实际绑定一次改变；already_bound上述字段也全不变。

## 8. 安全错误与签名

| HTTP | code枚举 |
|---|---|
| 405 | `RESTORE_METHOD_NOT_ALLOWED` |
| 413 | `RESTORE_BODY_TOO_LARGE` |
| 422 | `RESTORE_REQUEST_INVALID` |
| 404 | `RESTORE_LICENSE_NOT_FOUND`（项目不存在或原码不在该项目，不暴露其他项目是否有该码） |
| 403 | `RESTORE_PROJECT_DISABLED`、`RESTORE_LICENSE_REVOKED` |
| 409 | `RESTORE_NOT_PREVIOUSLY_ACTIVATED`、`RESTORE_UNSUPPORTED_LICENSE`、`RESTORE_LICENSE_EXPIRED`、`RESTORE_COUNT_DEPLETED`、`RESTORE_SCOPE_MISMATCH`、`RESTORE_ACTIVE_BINDING_CONFLICT`、`RESTORE_TARGET_BOUND_ELSEWHERE`、`RESTORE_BINDING_NOT_RECOVERABLE`、`RESTORE_STATE_CHANGED`、`RESTORE_HISTORY_INCOMPLETE` |
| 503 | `RESTORE_BINDING_UNAVAILABLE`（摘要kid/存储能力）、`RESTORE_SIGNING_UNAVAILABLE`、`RESTORE_UNAVAILABLE`（连接/事务/未知内部错误） |

所有denied统一outcome=denied、license=null、expectedStateDigest=null、invalidBindingCount=0，不暴露其他码数/标识、机器摘要、撤权操作员、异常stack/SQL。客户端自行映射简体中文，不依赖自由文本message；没有retryAllowed等隐式授权字段。STATE_CHANGED表示停止旧观察，而非自动重新inspect再restore。

复用现有Ed25519 `withLicenseSignature` 协议，成功及可签的错误响应都签最终原始body字节。签名输入精确四行、无尾换行：

```text
post /api/license/restore-current
<已配置且原生允许的Activity host>
<X-License-Date的RFC1123原值>
SHA-256=<最终UTF-8响应体sha256的标准base64>
```

上述固定target用于本合同合法POST。非POST错误按真实请求method签名，HEAD遵HTTP空body约定；这些拒绝响应绝不能当native合法POST许可响应消费。

响应头 `X-License-Signature`、`X-License-Date`、`X-License-Digest` 及现有kid/轮换语义沿原实现；不得自创JWS包装或更换许可key。原生强制验证固定method/path/host、body digest、Ed25519签名、合法新nonce、服务器日期与serverTime差≤2000ms、服务器时间相对当前墙钟偏差≤120000ms；不继承strict_verify=false、不接受过期/缺头/错target/重定向响应。恶意/无效请求的null nonce响应不能用于成功保存。

签名材料完全缺失/损坏时无法真实签错误：返回503 `RESTORE_SIGNING_UNAVAILABLE`闭合体（action/nonce仅合法时回显），数据库写0；不伪造签名或回退旧协议。原生只能把未验证503视为服务不可验证，不信其许可状态、不保存、不调用经济链。签名在mutation后实际失败时必须回滚，再尽力输出同类失败；不能承诺此时错误一定可签。

## 9. 幂等与未知结果（与Creator SPEC六行表逐项一致）

| 当前事实 | 同次观察允许动作 | 必须停止 |
|---|---|---|
| fresh proof已确认原绑定 | 原经济查询/幂等履约→配置读回 | 当前身份变更/权威拒绝 |
| 确切缺绑定且尚未提交restore | inspect后，原fence下restore至多一次→强验签checked保存 | 无支持/有效冲突/不可恢复/STATE_CHANGED |
| restore已发送但结果未知 | 只读inspect至多一次；already_bound签名许可体checked保存，再freshproof/签名回读当前许可 | 仍缺失、变化、验签或保存无法确认 |
| unknown后仍缺绑定或集合变化 | 保留unknown/conflict；仅用户再次明确“继续核对”开启新观察和新inspect | 不在旧观察静默获取新摘要后再写；不回退activate |
| 原经济履约unknown | 用Growth既有原权益/原service查询恢复原预约 | 不新身份/替代Key/新增providerPOST |
| 权益ready而配置失败 | 只继续配置读回 | 不重新恢复许可/首赠 |

本合同幂等身份是相同原授权+当前机器的目标绑定状态，不是nonce/本地taskID。项目锁内重复请求最多一次实际恢复；already_bound零写、不再次释放失效占位、不累加换绑计数。旧expectedStateDigest在已经合法绑定时可返回当前already_bound，但仍先核目标资格和当前精确绑定，其他后来存在的绑定不被写；这不声称旧请求执行过，只说明当前可验证状态。若其他操作后来撤销/换机，不能凭旧提交强行恢复或伪造历史回执。无需通用operation表/clientjournal。客户端取消观察不撤销服务器事务；本机互斥保持到真实native收尾。

## 10. 合成wire示例（绝非真实凭据/签名）

以下所有code、machine、hash、时间、nonce均为公开合成fixture；实际header签名需本任务测试fixture Ed25519 key生成，不能把这里的placeholder当真签名。

```json
{"contractVersion":"license-restore-current-v1","action":"inspect","projectKey":"creatoros","code":"SYNTHETIC-T1402-ONLY","machineId":"fixture-machine-alpha","nonce":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}
```

```json
{"contractVersion":"license-restore-current-v1","action":"inspect","nonce":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","serverTime":"2026-10-23T10:00:00.000Z","outcome":"ready_missing","code":null,"expectedStateDigest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","invalidBindingCount":1,"license":{"projectKey":"creatoros","licenseMode":"TIME","activatedAt":"2025-01-01T00:00:00.000Z","expiresAt":null,"remainingCount":null,"channelRef":null,"entitlementBindingHash":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","authorizationVersion":3,"deviceStateVersion":1,"isActivated":true,"bindingValid":false}}
```

```json
{"contractVersion":"license-restore-current-v1","action":"restore","projectKey":"creatoros","code":"SYNTHETIC-T1402-ONLY","machineId":"fixture-machine-alpha","nonce":"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE","expectedStateDigest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
```

```json
{"contractVersion":"license-restore-current-v1","action":"restore","nonce":"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE","serverTime":"2026-10-23T10:00:01.000Z","outcome":"restored","code":null,"expectedStateDigest":null,"invalidBindingCount":1,"license":{"projectKey":"creatoros","licenseMode":"TIME","activatedAt":"2025-01-01T00:00:00.000Z","expiresAt":null,"remainingCount":null,"channelRef":null,"entitlementBindingHash":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","authorizationVersion":4,"deviceStateVersion":2,"isActivated":true,"bindingValid":true}}
```

响应未知后的inspect使用第三个新nonce；若当前已绑定，响应action=inspect、outcome=already_bound、摘要null、count0、同一原activatedAt/expiry及当前epoch、bindingValid=true。若仍ready_missing，即便返回新摘要，旧观察也只能展示需用户继续，不能自动再restore。

```json
{"contractVersion":"license-restore-current-v1","action":"restore","nonce":"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE","serverTime":"2026-10-23T10:00:01.000Z","outcome":"denied","code":"RESTORE_ACTIVE_BINDING_CONFLICT","expectedStateDigest":null,"invalidBindingCount":0,"license":null}
```

示例摘要全a只是shape占位，不是任意S的声称真实摘要。实现后由实际contract/service签发source-bound fixture，root/Creator消费实际fixture，不用手写示例当互通证据。

## 11. TDD、真实PG与交付验收

独评PASS后才写产品。先新增原断言RED，再最小实现，保留原失败。准确6文件：route、`src/lib/license-restore-current-contract.ts`、`src/lib/license-restore-current-service.ts`、`tests/license-restore-current-contract.test.ts`、`tests/license-restore-current-service.test.ts`、`tests/t1402-license-restore-current-local-pg.test.ts`。schema/迁移/旧activate不在写集；安全helper不够用时先报新增准确路径，不扩写。

必须的fixture和真实PG矩阵：

- 永久TIME原usedAt及null expiry、限时TIME原期限、COUNT原total/remaining/consumed逐字段不变；首次激活/过期/耗尽/撤权/annual/损坏生命周期拒绝。
- legacy无usedBy合法历史恢复、无失效占位也可恢复、1个及多个精确失效占位；任何有效其他授权（含有效+失效混合）整事务0写；不同项目/其他机器不触及。
- 所有设备行/墓碑/current与previouskid/未知kid、人工删除/force事件、投影矛盾、maxDevices/slot守卫。already_bound完全只读，数据库全行快照和审计数量保持。
- PG barrier：inspect后新有效占位、原码撤权/缩期/到期、码/hash生命周期变化、失效变有效、epoch/kid/设备历史变化；锁后重读拒绝旧fence。
- PG真实并发：同机不同目标、同目标不同机器、同目标双击、restore与normal activate/原Growth register或revoke、锁等跨期限/签名前最终期限，目标expiresAt===当前now必须拒绝且其他占位同值仍受保护；最终唯一active、任何原有效码不误清、全部失败回滚。
- 写目标/设备/审计/实际签名各阶段失败注入，观察旧占位也未被部分释放；缺签名前置0写；实际签名失败0提交；commit后断网只读inspect回收当前结果。
- closed JSON、方法/媒体/大小/字段/类型/nonce/digest拒绝；原生强验固定target、错host/nonce/date/body/kid签名失败不保存；旧服务404/405/旧响应不发activate。
- unknown仍missing/变化必须停到明确新继续；freshproof和原Growth幂等链不混为许可运行证据。

测试数据库由作者自行initdb创建独立端口/角色，合成fixture key标注清楚；不连接真实用户或T250/旧验收PG。聚焦 `node --import tsx --test <3files>`、类型检查、`npm run quality:gate` 与原许可/设备/proof回归都按实际结果记录；真实PG不以mock通过代签。结束仅停自己实例，保留日志/数据。独评、测试、production部署分别报告，不预签PASS或task complete。
