# CreatorOS 年卡与 growth 低价续费接入 — 独立 SPEC 评审

- 评审日期：2026-07-24
- 被评审 SPEC：
  `docs/superpowers/specs/2026-07-24-annual-renewal-growth-integration.md`
- review mode：`cross-family`
- reviewer：Codex CLI / `gpt-5.6-sol`
- 当前结论：用户裁决后的第三轮为 `CONCERNS`、无 blocker；全部意见已纳入 SPEC，按三轮
  上限以 `CONCERNS(已处理)` 结束 PLAN，可进入 CONTRACT，仍禁止直接进入 BUILD

## 第一轮

**Verdict：FAIL**

第一轮认为方向有价值，但不能进入 CONTRACT/BUILD，主要问题如下。

| # | 严重度 | 问题 | Disposition |
|---|---|---|---|
| R1-01 | blocker | “只售年卡”与产品宪章“不做变现中心”边界未对齐 | **接受并已解决**：增加 `DEC-REN-001`，更新 `docs/产品定位.md`，明确 CreatorOS 只做签名入口/状态展示，growth/activity 分别拥有交易和期限真相 |
| R1-02 | major | growth 与 activity 都像期限真相，缺少冲突规则 | **接受并已解决**：activity 是 `current_term_end_at + term_version` 唯一真相；growth 只保留带版本的可重建投影，以 CAS 写入目标绝对期限 |
| R1-03 | major | owner claim、手机号变化和 legacy 激活码认领不完整 | **原方案接受，后由用户显式收窄范围覆盖**：当前无正式付费存量，内测码不迁移、不认领；正式客户身份与订单恢复完全复用 growth，CreatorOS 不新增 OTP/owner 体系 |
| R1-04 | major | “增加 12 个月”缺少时区、月末和闰日算法 | **接受并已解决**：明确 `Asia/Shanghai` 自然月、保留本地时分秒、月末钳位、转回 UTC，并加入连续三次续费和边界测试 |
| R1-05 | major | activity 能力证据不足 | **接受并已解决**：增加 order fulfillment 的 file:line，并记录覆盖 src/schema/migration/tests 的仓根续期零命中反证 |
| R1-06 | major | 缺少在 BUILD 前验证“低价是否真的有价值”的 RAT | **由用户追加裁决覆盖**：当前没有正式付费用户，内测码不是付费续费样本；价格由用户在 growth 后台配置。用户明确接受无前置样本的商业风险并授权先接入，首批 20 个正式年卡进入续费窗口后复盘，不阻断技术 BUILD |

## 第二轮

**Verdict：CONCERNS**

评审摘要：“职责边界与价值门设计基本成立，但并发收款、历史续期撤销、复用证据和工作量
评估仍有可执行性缺口。”

| # | 严重度 | 问题 | Disposition |
|---|---|---|---|
| R2-01 | major | 两个不同 order 基于同一旧期限可能都付款，第二笔会“已收款但未发权” | **原全量方案接受，收窄后归 growth 既有交易系统**：T-506 不重做订单/支付槽位，只要求 activity provider 的 term-version CAS 和冲突 fail-closed |
| R2-02 | major | A、B 连续续费后退款 A，标量 restoreTerm 无法只撤 A 而保留 B | **原全量方案接受，收窄后归 growth 既有退款状态机**：T-506 只实现 activity 当前链尾撤期契约，非链尾请求拒绝并由 growth 处理 |
| R2-03 | major | 对 growth 可复用能力主要引用规格，生产证据不足 | **接受并已纳入 SPEC**：逐项补充 rule/lineage/order/payment/refund/audit 的生产代码、迁移和测试 file:line；明确真实 adapter、OTP、term-version 槽位和多年撤期仍未实现 |
| R2-04 | major | owner OTP/恢复仅估 1–2 天，总预算偏乐观 | **原全量方案接受，后由用户显式排除**：正式客户身份归 growth，当前无付费存量；T-506 不实现身份恢复或 legacy 认领 |

## 第三轮

**Verdict：FAIL**

评审摘要：“三系统职责方向正确，且价格等 PLAN gate 已明确阻断 BUILD；但首购年卡仍未纳入
绝对期限真相契约，另有支付槽位生命周期、自动退款、链式撤期持久化及 owner identity
复用证据缺口。”

| # | 严重度 | 问题 | Disposition |
|---|---|---|---|
| R3-01 | blocker | 首购仍是 activity 的 `expiresDays/validDays`，growth 却在发码时自行算 lineage 到期日；延迟激活会从第一年就产生两个期限真相 | **接受并已纳入 SPEC**：首年默认从第一次成功激活起算；activity 在激活事务内写绝对 term start/end/version，growth 只投影返回值；首购和续费真实 adapter 都通过前 offering 保持 disabled |
| R3-02 | major | 支付槽位没有持久状态和释放规则，可能未知支付时重复收款或永久死锁 | **原全量方案接受，收窄后归 growth 自身 Gate**：T-506 不修改 growth 支付状态机 |
| R3-03 | major | `out_request_no` 属于 Refund 而非 Payment；已有迟到 capture 退款可复用，但退款未知没有 query-first 收敛 | **原全量方案接受，收窄后归 growth 自身 Gate**：T-506 只保证 provider 冲突不错误延期 |
| R3-04 | major | 逆序退款只有描述，没有可重启的资金侧 cascade aggregate/游标 | **原全量方案接受，收窄后归 growth 自身 Gate**：activity 仅接受当前链尾撤期，拒绝中间挖段 |
| R3-05 | major | owner identity 证据不准确：已有 BootstrapClaim/ShareCredential 和续费 claim 骨架，但没有完整客户/手机号/OTP/恢复体系 | **原全量方案接受，后由用户显式排除**：CreatorOS 不实现身份/认领，内测码不迁移 |

第三轮后的跨三仓全量补齐预算曾修正为 **29–49 developer-days**。用户随后明确收窄为
“只接入 growth 已有系统”，排除价格/商品/身份/交易后台重做和付费存量迁移；新版 SPEC
接入预算为 **11–20 developer-days**，待本轮复审验证。

## 人工裁决

- 用户本次需求已确认“新系统方向是年卡，并支持低价续费”，足以记录
  `DEC-REN-001` 的方向和三系统边界。
- 用户已于 2026-07-24 确认固定首购价、固定续费价且所有连续后续年度均按续费价，也确认
  首次成功激活起算、存量永久授权保留和到期前后 30 天窗口；`DEC-REN-002` 已解决。
- 用户追加确认价格在 growth 后台另行配置，当前 published rule/具体金额不作为客户端接入
  前置；CreatorOS 不复制或硬编码示例价格。
- 当前无正式付费用户，只有内测激活码；新版 SPEC 已删除付费存量迁移和 legacy claim，
  内测码保持原样且不出现正式续费入口。
- 第三轮为 `FAIL`，所有意见均已接受并修改 SPEC，但修改后尚未重新通过独立评审。
- 无前置价格样本已由用户记录为 accepted-risk；SPEC 复审通过前，T-506 仍停留在 PLAN，
  通过后可进入 CONTRACT/BUILD。

## 收窄后第四轮

- review mode：`cross-family`
- reviewer：Codex CLI / `gpt-5.6-sol`
- Verdict：`CONCERNS`
- Summary：方向与系统边界基本符合宪法，但固定价格、逾期规则、签名授权字段及宪法级非功能
  验收存在可执行性缺口。

| # | 严重度 | Finding | Disposition |
|---|---|---|---|
| R4-01 | major | 固定首购/续费口径未落到唯一权威字段，guide/max 仍允许多价 | **接受并已处理**：CreatorOS offering 强制 `guide=max=initial_price_cents`，RenewalRuleVersion 强制 `guide=max=renewal_price_cents`；渠道佣金不改变客户价，补跨渠道快照/回放测试 |
| R4-02 | major | 超过 +30 天是规则裁定还是禁止低价，SPEC 内互相矛盾 | **接受并已处理**：第 31 天起续费资格关闭，只能按固定首购价创建新的 entitlement/lineage；人工异常流程不得覆盖价格或期限 |
| R4-03 | major | SignedLicenseSnapshot 缺 annual 类型、stable IDs、term version，客户端仍会把年卡当 trial | **接受并已处理**：补 `schema_version/license_kind/entitlement_id/grant_id/term_version` 签名字段和旧快照兼容边界 |
| R4-04 | major | 新入口缺宪法 WCAG 2.2 AA 与 axe 验收 | **接受并已处理**：新增 `NFR-REN-09/TEST-REN-15`，约束真实控件、键盘、状态播报和 axe 零 critical/serious |
| R4-05 | major | 缺跨系统 correlation/stable ID 可观测链与自动验收 | **接受并已处理**：新增 `NFR-REN-10/TEST-REN-16`，定义脱敏关联字段和三端任一点反查全链 |

上述五项均是对用户既有确认的契约化与宪法发布门补齐，不扩大为 CreatorOS 重做 growth
交易系统，也不恢复付费存量迁移。待第五轮 delta 复审确认。

## 收窄后第五轮

- review mode：`cross-family`
- reviewer：Codex CLI / `gpt-5.6-sol`
- Verdict：`FAIL`
- Summary：职责边界与复用方向正确，但同一 lineage 的可支付续费槽位没有形成可追踪契约，
  可能出现两笔有效付款只延期一笔。

| # | 严重度 | Finding | Disposition |
|---|---|---|---|
| R5-01 | blocker | FLOW 提到可支付槽位，但 FR/ENT/TEST 已在收窄时删掉；activity CAS 只能防多续，不能防两笔收款 | **接受并已处理**：新增 `FR-REN-14/ENT-REN-11/TEST-REN-17`，恢复 growth 持久化唯一槽位、查单释放、迟到支付/版本冲突全额退款及重启恢复；这是资金安全接入，不是重做价格或存量 |
| R5-02 | major | FR-REN-04 同时把首购和续费期限计算属主写成 activity/growth，存在双时钟歧义 | **接受并已处理**：首次激活期限只由 activity 计算；续费 target 只由 growth 按规则计算，activity 仅做 digest/CAS/边界校验 |
| R5-03 | major | ±30 天窗口、term end 端点和权威时钟未字段级定死 | **接受并已处理**：新增 `NFR-REN-11`，期限 UTC、授权 `[start,end)`、窗口按 `Asia/Shanghai` 且 `[start,close]` 含端点；补 start/end/close 前后 1ms 测试 |

本轮 blocker 属真实资金故障，不能以“只接入”排除；整改仍遵守用户的价格后配、无付费存量和
内测码不迁移裁决。待第六轮（本次 PLAN 重做周期第 3 次、也是最后一次）复审。

## 收窄后第六轮（STOP）

- review mode：`cross-family`
- reviewer：Codex CLI / `gpt-5.6-sol`
- Verdict：`FAIL`
- Summary：职责边界正确，但范围自相矛盾，且按 term version 分槽不能保证 lineage 级只有
  一个仍可能收款的 intent。

| # | 严重度 | Finding | Disposition |
|---|---|---|---|
| R6-01 | blocker | §18 说用户排除 growth 槽位，正文却把它列为必做，形成可被缩水的冲突 | **接受并已澄清**：安全可收款方案必须包含资金门；是否授权纳入 T-506 转为 `DEC-REN-004` 用户裁决 |
| R6-02 | blocker | 仅 `(lineage_id,term_version)` 唯一，旧 intent 未收敛时新 term version 仍可再收款 | **接受并修订候选方案**：改为每 lineage 单行 `LineageRenewalGate`，所有可能收款态跨版本互斥，补旧 intent→版本变化→迟到 capture→重启测试 |
| R6-03 | major | §5.8 仍写 11–20 天，§17 已改 13–23 天 | **接受并已处理**：统一安全完整接入为 13–23 developer-days |

本次 PLAN 重做周期已达到三轮复审上限且仍有 blocker。按 reviewer STOP 规则，不再原地发起
第七轮；T-506 回 PLAN 阻塞，等待用户裁决 `DEC-REN-004` 后重新形成可审核工件。

## 用户裁决后的新审核工件（2026-07-24）

用户明确“认可”推荐方案：T-506 纳入每 lineage 单行的 `LineageRenewalGate`，按完整可收款
接入实施，接受 13–23 developer-days 的完整估算；不采用只接非收款链并保持 offering
disabled 的备选方案。`DEC-REN-004` 已解决，SPEC 的范围矛盾已消除。

这不是补拍前六轮为 PASS；它是人类裁决后形成的新审核工件，将重新执行一次异模型独立复审。

### 用户裁决后第一轮

**Verdict：CONCERNS**

**Summary**：产品定位、职责边界和完整收款范围已经成立，但资金并发门的状态机、验收追踪及
跨系统灰度发布契约仍不足以无歧义实施。

| # | 严重度 | 问题 | Disposition |
|---|---|---|---|
| R7-01 | major | `LineageRenewalGate` 返回 `released` 的路径、事务边界和崩溃恢复不完整，`fulfilled` 同时像终态和可释放态 | **接受并已处理**：gate 状态移除 `fulfilled`，订单保留历史结果；新增 §6.1 完整转换表，逐行定义事件、证据、同事务副作用、下一状态与重启恢复 |
| R7-02 | major | TEST-REN-17 未覆盖关闭 intent、支付未知、退款未知及 frozen 恢复 | **接受并已处理**：新增 TEST-REN-18，逐状态出边执行约束、并发和副作用前后崩溃注入 |
| R7-03 | major | 缺少三系统交错部署、capability gate 与在途资金回滚规则 | **接受并已处理**：新增 NFR-REN-12、§13.1 部署矩阵与 TEST-REN-19；新销售可关，在途查单/履约/退款组件不可回滚 |
| R7-04 | minor | “距到期提醒”触发和例外状态不明确 | **接受并已处理**：FR-REN-08 明确仅 annual + 服务端 eligible + 有效入口显示；新增 TEST-REN-20 覆盖 beta/perpetual/窗口外/失败 |

### 用户裁决后第二轮

**Verdict：CONCERNS**

**Summary**：方案整体符合产品宪法且商业、归属与幂等边界清晰，但资金门与退款并发、续费
入口签发链仍有两处可执行性缺口。

| # | 严重度 | 问题 | Disposition |
|---|---|---|---|
| R8-01 | major | payment intent 前没有二次复核 activity term/version；已履约退款/撤期未重新占用 lineage gate，可能与新续费交叉 | **接受并已处理**：renew/revoke 共用同一 gate，增加 `reversal_reserved/reversal_pending`、固定锁顺序与 ServicePrincipal 边界；create-intent outbox 前再次读取权威 term/version；TEST-REN-18 增加三组并发场景 |
| R8-02 | major | CreatorOS 从何处取得 eligibility 与签名 renewalUrl 未形成生产者—消费者链 | **接受并已处理**：确定唯一链路为 activity 短时 exchange token → growth 验签/映射/判资格 → growth 短时 Web capability；补齐字段、audience/expiry/replay、刷新与失败状态，并更新 FLOW-REN-02、ENT-REN-07、TEST-REN-14/20 |

### 用户裁决后第三轮（最终）

**Verdict：CONCERNS**

**Summary**：整体方向、资金并发门与跨系统归属已基本闭环，但新购入口能力和首次激活期限
契约仍有两处会导致不同实现者作出不同选择的关键歧义。

| # | 严重度 | 问题 | Disposition |
|---|---|---|---|
| R9-01 | major | 未激活用户没有 annual grant，现有 renewal exchange 无法提供新购入口 | **接受并已处理**：新增 FR-REN-15/ENT-REN-12/TEST-REN-21；activity 以 app/build/channel 签发无用户声明的 purchase proof，growth 验签并受 production offering gate 控制后签短时新购入口，旧客户端/禁用/篡改全部 fail-closed |
| R9-02 | major | provision “尚未起算”与“返回绝对期限”矛盾，可能在发码时提前起算 | **接受并已处理**：FR-REN-01 拆成字段级契约；provision 为 `pending_activation/null/null/version 0`，首次 activate 才写绝对期限/version 1，TEST-REN-01 增加延迟激活与重放断言 |

三轮最终没有 blocker，且两项 finding 都是对已确认范围的字段级消歧，没有引入新的产品方向、
数据属主或收费方式。按 STOP 上限不再发起第四轮；PLAN 记录为 `CONCERNS(已处理)`，下一阶段
必须先完成 CONTRACT 与逐 FR 数据链路 Gate，不能据此直接开写生产代码。
