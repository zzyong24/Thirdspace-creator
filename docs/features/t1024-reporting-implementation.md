# T-1024 诊断、账号/作品/粉丝轻量上报闭环

> T-1018 用户已认可总体方向。CreatorOS、Activity、Growth 三方契约/安全/数据归属仍须独立评审。以 [T-1017](t1017-diagnostics-creator-reporting.md) 为基础，本文增加粉丝字段、Growth 接收端和 Ant Design 运营后台，并按用户最新修订明确：候选偏好默认勾选，有效授权默认关闭，页面必须显示“未开启，待确认”；历史明确关闭仍关闭。`reporting.consent.set` 的开启只由各 scope 的主动“同意并开启”触发，T-1017 的零实际出站和撤销规则仍有效。旧 PASS 不覆盖本次修订与新字段。本机自动上传在完成告知与有效授权前保持禁用。

## 产品与合同

2026-09-29 用户要求“用户无感”，先选择“完全静默、无说明和开关”，后明确修订为“放到设置里面，默认是勾选的”。设置页可把**上报偏好**预置为勾选，但预勾选不是用户授权事实，也不能令旧安装、新安装或已有关闭选择自动上报。首次展示具体字段、用途、接收方、保留期与退出方式后，用户须另行主动点击“同意并开启”才记录授权版本和时间；仅浏览或关闭设置页不激活上报。有效授权后后台自动批量发送，不弹重复确认、不阻断创作；用户可查看最近状态并撤回。未经有效授权，Growth 接收端与客户端都 fail-closed。Growth 服务端与后台可以先独立完成并保持零真实采集。此边界记录于 `orchestrator/DECISION_LOG.md`。

设置页展示两个默认勾选的**候选偏好**：结构化故障、创作数据；二者各自的有效授权默认均为无，后者还须逐平台账号选择。`effectiveUpload = confirmedConsentVersionMatches && preferenceChecked && scopeAndAccountAuthorized && receivingCapabilityValid`，四项任一不成立即零出站。明确关闭时保存关闭选择，重启和升级不可重新勾选；重新开启须主动确认。授权持续到撤销或新增字段/接收方变化。云端创作事件包含 T-1017 的匿名账号/作品别名与数值，并新增**账号级粉丝总量快照**：`metricKey=follower_count, value|availability, unit=count, source, capturedAt, observedAt`。不得把单作品 `follower_gain` 误作当前粉丝总数；缺值为 unavailable，真实 0 为 0。新增字段须在三仓共享 contract 中升级 `schemaVersion/consentVersion`，旧授权不得发送 `follower_count`；原窄范围可在旧合同仍受理时继续发送，或停发并提示重新授权，不能自动扩大。用户看到新字段清单并重新选择相应账号后，才持久记录新版本授权。若未来需昵称、标题、公开链接，同样独立升级版本与 SPEC，不借“基本信息”模糊扩权。

CreatorOS 后端在本机采集或故障事件**已经提交**后读取当前归属与真值，白名单投影进加密 outbox；作品投影覆盖经账号授权且仍公开可见的 `PlatformWork`，不只覆盖与 CreatorOS 稿件关联的 `Publication`，但绝不发送平台原始作品 ID。Worker 不上传凭据或直连 Growth。AM 发短时、独立 scope 且按安装/产品/渠道归属的上传能力；Growth 专用接收端验签、限流、schema 拒绝多余字段、幂等入库、保留/删除、按角色运营查询和告警。传输失败本机指数退避、部分回执保留未确认事件；不影响采集、创作和启动。撤销先停止新入队和后续发送、持久化删除墓碑，云端完成回执前 UI 如实显示待完成。素材字节、正文、提示词、原始日志/stack、截图、Cookie 和路径永不自动出站。

故障 taxonomy 与字段目录以 T-1018 的清单为基础，贯通 UI `referenceId`、本机事务 `operationId`、Worker/AI `attemptId` 与出站 `eventId`。采集结束后才报告成功，生成/渲染/发布的错误只用结构化阶段和稳定代码；服务端上报失败记录本机受限状态并合并告警，不能触发自身无限递归。账号与作品指标按平台来源逐项声明可用性；“所有轻量字段”仍须先进入版本化白名单、完成用途说明与用户重授权，不能通过任意 JSON 字段绕过隐私范围。

## 跨仓任务闭包

本任务交付包含三仓共享字段/权限/回执 fixture、CreatorOS 客户端与设置页、AM 上传授权、Growth 接收/告警/删除，以及运维保留期配置；不能只做客户端开关便宣称完成。三仓各自按其 AGENTS/技能流程建对应任务并审核。Growth 可在本仓架构、数据归属及 T-187 规格独立评审通过后，隔离实现可逆的 schema、服务、后台与默认禁用的接收路由；客户端真实出站、Growth 接收路由启用和 Activity 专用票据编码，必须等待三仓 exact claim、验签、撤销语义与共享 fixture 一致通过评审。T-1017 的 30/90 天建议保留期需在用户告知与接收端强制清理中定稿；运营不能遥控开启授权。

### 三仓服务合同与授权状态机（设计候选）

CreatorOS `contract` 持有出站 envelope、字段白名单、`schemaVersion/consentVersion` 和 fixture 的规范版本；AM 持有上传能力的签发/撤销合同，Growth 持有接收、查询、删除回执合同。三仓实施任务须引用同一版本 fixture，逐仓签署服务契约、安全与数据归属评审；在此之前不得声称 T-1017 的旧 PASS 已覆盖粉丝扩展。`productId + channelId + installationAlias` 是授权、事件、日常删除与查询的复合身份边界；AM 另签同一激活授权的按机器激活单元隔离、由 Activity 专用保密 key 派生的稳定伪名 `subjectRefHash`，仅用于凭当前/历史激活绑定发起跨安装或旧渠道删除，不作普通运营展示或权限替代。Growth 授权台账存该 hash 作为仅限恢复/删除的二级索引；告知用户其可跨安装关联，旧 key 保留到对应数据清理完成，删除仍逐产品/渠道/安装/scope 提高 epoch 并清事件；删除票据不能写入或读取报告。`accountAlias/workAlias` 是 CreatorOS 本机生成并在 Growth 中只作为随机别名处理；Growth 可接收白名单内的平台枚举，但不接收平台账号/作品原始 ID、昵称或 Cookie。

| 操作 | 请求、鉴权与允许字段 | 响应、状态 | 错误与重试/幂等 |
| --- | --- | --- | --- |
| `reporting.consent.set`（CreatorOS 本机） | 已登录的本机用户，`diagnosticsEnabled` 或逐账号 `creatorEnabled`、所见字段清单版本、`consentVersion` | 持久化授权快照及审计时间；`off → on` 只影响以后入队，升级版本先回 `needsReconsent` | 账号不属当前用户拒绝；旧版本授权不得自动覆盖新字段；同 `consentChangeId` 幂等 |
| `AM.issueUploadCapability` | 已激活安装、产品/渠道一致，scope=`diagnostics.grant`、`diagnostics.write`、`creatorMetrics.grant` 或 `creatorMetrics.write`，短时有效，无平台 Cookie；另有独立的 `creatorReports.delete` / `creatorReports.deleteStatus` 可在原激活绑定可核验时签发 | 限定安装、scope、到期时间的能力凭证；删除票据另含 `deletionSubjectRefs` | scope/安装/渠道不符拒绝；撤销后续签失败；删除票据不能升格为注册或上传；重试不得放宽 scope |
| `Growth.diagnosticsGrant.upsert/query/revoke` | 本机用户开启诊断后，可信进程用 AM 限安装/渠道的 grant 能力发送 `consentVersion,consentEpoch,enabled,grantedAt,grantRequestId`；关停先本机停发并持久化撤销墓碑 | Growth 以产品+渠道+安装别名+诊断 scope 为主键记录授权世代；注册回 `grantReceiptId`，撤销先拒旧批次、删对应数据再回 `deleteReceiptId`；查询只返本安装状态 | grant 未回执前不发送诊断事件；同 `grantRequestId`/删除请求幂等，旧世代拒绝；离线撤销待联网先完成撤销，上传 token 不等于用户已同意 |
| `Growth.accountGrant.upsert/query` | 本机授权事务提交后，可信进程使用 AM 限安装/渠道的 `creatorMetrics.grant` 能力发送 `accountAlias,consentVersion,consentEpoch,enabled,grantedAt,grantRequestId`；不含真实账号 ID。查询原 grant 仅使用同一 `creatorMetrics.grant` 权限并限定本安装；`creatorReports.deleteStatus` 只查删除回执，不能读取普通 grant | Growth 以产品+渠道+安装别名+创作 scope+账号别名为主键记录授权世代与字段版本，回 `registered/duplicate`、`grantReceiptId`；查询只返本安装授权记录 | 账号归属由本机 backend 先核验；Growth 不把客户端自报当成人身身份凭据，只限制该安装可上传的别名与版本；`grantRequestId` 幂等，低世代拒绝；账号未注册、未回执时客户端不发送其指标 |
| `Growth.ingestBatch` | AM 上传能力 + 加密传输；envelope 含 `schemaVersion,consentVersion,productId,channelId,installationAlias,scope,batchId,events[]`；事件仅白名单别名、指标/可用性、来源枚举、时间、诊断代码 | 逐事件 `accepted/duplicate/rejected` 回执和 `receiptId`；只确认已持久化事件 | token 失效/渠道错/未知字段/越界账号别名拒绝；`productId+channelId+installationAlias+scope+eventId` 去重；部分接受只移除已回执项 |
| `Growth.accountGrant.revoke/deleteStatus` | 本机先停该账号新入队/发送并持久化删除墓碑；AM 另签仅限撤销/查删除状态的能力；即使激活权益已到期/撤权或渠道改绑，仍可在证明原码及机器绑定后签发含 `deletionSubjectRefs` 的删除能力，Growth 据原 grant 清旧渠道数据；请求 `accountAlias,revocationEpoch,deleteRequestId` | Growth 原子提高授权世代、拒绝旧上传并删除该别名的数据；`pending → acknowledged` 回 `deleteReceiptId`、删除范围和完成时间 | 离线重试同墓碑幂等；旧上传 token 不得继续写；失去本机队列走 T-1017 自助/人工删除路径；实际删完才回 acknowledged |
| `Growth.deleteScope` | 用户撤销整个诊断或创作 scope，先本机停发，使用独立删除能力发送 `scope,revocationEpoch,deleteRequestId`；跨安装/旧渠道删除按 `deletionSubjectRefs` 的候选值找到原 grant 后逐分区执行 | 清空该安装 scope 全部授权与事件，返回完成回执 | 同请求幂等，迟到旧世代批次拒收；上传 token 撤销不阻断删除能力 |
| `Growth.ops.read/alert` | 服务端运营角色 + 审计，只能查授权后的别名聚合与诊断分类 | 聚合/告警与查询审计回执 | 无用户授权、越权字段和跨渠道查询拒绝；运营权限不能代用户启用上报 |

正向 fixture：账号 A 授权旧 `consentVersion` 时仅允许旧字段；升级后首次出现 `follower_count` 的批次被客户端拒绝入队，用户看到新增字段并重授权账号 A，Growth 回新世代 grant 注册回执后才允许快照入队。账号 B 未选中既不注册 grant，也不可入队；伪造 B 的别名上传由 Growth 拒绝。诊断 scope 独立注册并获回执前，持有 `diagnostics.write` token 也不能上传诊断事件。反向 fixture：原始账号 ID、Cookie、标题、Prompt、素材路径、stack 或任意额外 JSON 键出现即拒绝整条事件并产生安全诊断；真实粉丝为 0 发送数值 0，缺来源/未采到返回 unavailable。离线撤销 A 或诊断 scope 均先本机停发并保留墓碑；联网后先发相应 grant revoke、再处理其他队列，Growth 拒写旧世代并删除后才回执；部分回执、重装恢复及迟到 public 快照均不得令 Growth 再现 A 的数据。诊断授权和创作授权互不推断，两个 scope 分别有开关、凭证与删除回执。同一 TRIAL/DEVICE_TRIAL 码的两台机器分别授权时，一台撤销只清本机；TIME/COUNT 解绑/换绑后旧机器凭历史绑定只可清旧数据。`subjectRefHash` 轮换旧 key 后仍可删除历史 grant。同一 installationAlias 在两个产品/渠道各有一个 eventId 时，两条记录与删除范围仍独立。

T-1024 交付的可执行证据至少包含合同包版本、三仓消费该版本的路径与 hash、上述逐操作请求/响应/错误 fixture、白名单和恶意字段样例、AM/Growth 真实往返及删除回执。用户审核后由三仓 owner 定稿实际接口命名与 `consentVersion` 数值，再进入代码评审；数值不能由旧版本自动继承。

Growth 复用既有官方 admin 会话，并新增 Creator Reports 专属、按产品和渠道的读权限台账；仅有 admin 角色不自动获得任何渠道报告读取权，只新增独立的诊断/创作数据域，不把报告塞进产品反馈。运营后台使用 Ant Design，提供可定位参考编号的故障列表/详情、按产品和渠道的账号健康、作品与粉丝趋势、上报水位、授权/删除状态；服务端强制分页、角色与产品/渠道读权限过滤；无授权 403，跨渠道临时访问须安全管理员显式授权并记审计，后台不得查看原始平台账号 ID、素材或提示词。允许查看已授权数据，不提供远程开启授权的控件。具体 Growth 所有权与页面合同见 Growth 仓对应任务 SPEC。

## 验收

新安装抓包零上报；仅诊断/仅账号 A 创作共享/两项均开逐项核对 Growth 实际记录。真实错误参考编号、账号绑定探测、全量作品、播放、互动和粉丝总量分别有来源/时间；账号 B 与隐藏作品不出现。千作品、断网、重复批、部分回执、撤销中在途数据、迟到快照、卸载重装及渠道切换验证幂等、隔离和删除终态。三仓合同、权限、受控 payload 扫描、Mac/Windows 安装包真机 E2E 与运营告警均需当场证据；未完成跨仓上线不标为“已可用”。
