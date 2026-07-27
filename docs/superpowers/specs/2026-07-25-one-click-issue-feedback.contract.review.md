# T-518 SERVICE CONTRACT 独立评审

- review_mode: `independent`
- reviewer_role: `SERVICE CONTRACT reviewer（非作者）`
- round: `1`
- reviewed_artifact: `docs/superpowers/specs/2026-07-25-one-click-issue-feedback.contract.md`
- upstream:
  - `docs/superpowers/specs/2026-07-25-one-click-issue-feedback.md`
  - `docs/superpowers/specs/2026-07-25-one-click-issue-feedback.review.md`
  - `docs/research/2026-07-25-t518-feedback-package-rat.md`
  - `orchestrator/context/T-518.md`
  - `orchestrator/SYSTEM_ARCHITECTURE.md`
  - `../Thirdspace-growth/AGENTS.md`
  - `../Thirdspace-growth/SERVICE_CONTRACT.md`
- verdict: `FAIL`
- finding_counts: `blocker=0, major=6, minor=1`
- gate_12_internal: `FAIL`
- gate_15b_internal: `FAIL`
- confirmation_②: `未开放`
- build: `关闭`

## 1. 结论

契约已经把 9 个 Tauri operation、20 个 Growth/object/worker operation、12 个 fixture 和
45 个 TEST 全部登记出来；本地零出网、两份 `.enc` 日志、多截图、明确同意、purpose-bound
grant、presign/complete/scan fail-closed、联合 owner、客服状态、30/90 天、reasonCode 与自由
文本分离、HARD 归属和兼容边界也都有实质设计。

但 Gate 12/15b 不能通过：所有 operation 仍缺逐项具体示例，部分响应/IPC 子传输并未形成可实现
schema；Growth 管理员角色与 reauth purpose 没有接上该仓既有安全契约；逐 FR 可行性表缺强制的
来源类型 enum；policy 字段没有逐项 runtime consumer；到期后 owner digest 删除又与用户状态
接口的 `410`/同貌 `404` 互相冲突。这些缺口会迫使 BUILD 自行发明契约，因此不是 minor。

## 2. 机械检查

| 检查 | 结果 |
|---|---|
| Tauri operation | `9`：`API-FDB-001..009` |
| Growth/object/worker operation | `20`：`API-FDB-101..120` |
| fixture | `12`：`FIX-FDB-001..012` |
| TEST | `45`：`TEST-FDB-001..045` |
| FR / NFR / HARD 行 | `12 / 10 / 4` |
| `git diff --check -- docs/superpowers/specs/2026-07-25-one-click-issue-feedback.contract.md` | exit `0`；目标文件当前为 untracked，故该命令只证明 Git 未报告已跟踪 diff 的 whitespace error，不冒充内容 Gate |
| operation 具体 request/success 示例 | `0/29`；表格只有类型轮廓或占位值 |
| FR 来源类型 enum | `0/12`；§11 没有「官方API/用户录入/授权第三方/系统内生」列 |

## 3. Findings

### MAJOR-01 — 29 个 operation 没有 Gate 12/15b 要求的具体示例，且部分成功 DTO 仍未定义

- where: §4.2 `API-FDB-001..009`；§5.3 `API-FDB-101..120`
- issue:
  - operation matrix 给出了字段名轮廓，但没有任何一项同时提供一份带具体值的 request 与 success
    example；Gate 12 要求 examples，Gate 15b 要求每项 happy path 有 concrete example。
  - `API-FDB-004` 的 `prepareProgress`、`previews[].metadata`，`API-FDB-112` 的
    `ReportQueueItem`，`API-FDB-113` 的 `report/content/attachments/eventTimeline/notes`
    没有权威 schema。调用方无法知道 required/nullable/expired representation，也无法生成
    closed-schema contract test。
  - Tauri operation 只列错误 code，没有说明它们是否严格使用 §2.3 信封、`requestId` 从何而来；
    多项 operation 也没有列出长度/格式错误的确定 code。
- suggestion:
  - 为 29 项逐项补 `Request example`、`Success example` 和完整错误 `{status/code/envelope}`；
    HTTP 示例必须展示 headers，RPC 示例必须展示 command payload。
  - 在 §3 定义上述 DTO，明确 required/optional/null、枚举、长度和到期表示；matrix 只引用稳定类型。
  - 至少补齐 `API-FDB-002` 的 draft-not-found、source selector、空 items/重复 item；
    `API-FDB-003` 的 description 超长、route/tag 非法；`API-FDB-112` 的 filter/owner/limit 非法错误。

### MAJOR-02 — 多截图「选择来源 → 预览」存在未注册传输，可能形成假按钮

- where: §4.1、`API-FDB-002`、`API-FDB-004`、`TEST-FDB-002/004/044`
- issue:
  - §4.1 说文件选择/拖拽先由 Tauri 生成一次性 `localSourceToken`，但 9 个 command 中没有签发
    token 的 operation，也没有定义原生 picker/drag event 如何把 token 交给 Web。
  - `API-FDB-002.items[]` 把 `localSourceToken?` 与 `candidateId?` 都做成 optional，未定义
    exactly-one；当前 schema 允许二者都有或都没有。
  - `API-FDB-004` 只返回 `previewToken`，却没有定义 token 的兑换 command/protocol、TTL、
    单 draft/attachment 绑定、Content-Type、range/大小上限、过期/重放错误。UI 因而没有契约化
    的截图字节读取路径。
- suggestion:
  - 在现有 9 项内显式定义 picker/drag/IPC stream 子传输，或新增稳定 operation；固定 token
    签发、绑定、TTL、单次/可重放语义和严格错误。
  - 把 `API-FDB-002.items[]` 改为按 kind 的 discriminated union，截图要求一个受限 source
    handle，日志要求一个 `candidateId`。
  - 为 preview 定义完整的本地只读 transport 与 TEST；在此闭合前，不能把预览控件视为可实现。

### MAJOR-03 — support 管理角色与 reauth 没有接入 Growth 现有安全契约

- where: `API-FDB-112..119`；§14；Thirdspace-growth `SERVICE_CONTRACT.md` §2.2/§2.2.1
- issue:
  - Growth 当前 principal/role 只有 `admin_operator/admin_finance/admin_security` 等；本契约新增
    `support_agent/support_manager/support_privacy_admin`，却没有定义由谁签发、如何绑定 session、
    如何迁移 role binding、与现有角色是否互斥/可组合。
  - Growth 明确要求任何 `+ reauth` 新操作先登记精确 purpose。`API-FDB-117..119` 只写
    `+ reauth`，没有 `X-Reauth-Token` header、purpose、一次消费、幂等重放和
    `REAUTH_ALREADY_USED` 规则。
  - `API-FDB-113` 允许 `support_privacy_admin` 读取完整详情，但没有说明该角色是否天然拥有内容
    阅读权；privacy hold 权限和正文访问权限被隐式捆绑。
- suggestion:
  - 在契约中定义 support role → Growth principal/session/RoleBinding 的映射和 additive migration。
  - 为下载、apply hold、release hold 分别登记固定 reauth purpose（或一个明确的不可跨组 purpose），
    补 header、TTL/一次消费、同 key replay 和换 key/body 错误。
  - 明确每个角色对 queue/detail/content/download/hold 的资源权限；若 privacy admin 不应看正文，
    拆开权限而不是依赖 UI 隐藏。

### MAJOR-04 — §11 不满足 Gate 15b 的逐 FR 数据来源判定

- where: §11 `FR-FDB-01..12`
- issue:
  - 12 行均缺 Gate 15b 强制的来源类型 enum：
    `官方API / 用户录入 / 授权第三方 / 系统内生`。
  - 多个 `FEASIBLE` 行只引用本契约自身或待实现 TEST，不是现存来源证据；例如
    `FR-FDB-01/02/03/05/12` 没有区分用户输入、本机系统内生 metadata 和 Growth API 来源。
  - `FR-FDB-03/04/06` 的未闭合项指向 `HARD-FDB-03`，但 verdict 仍写 `FEASIBLE`；必须说明
    “交互定义已可行、实现证据待 BUILD”与 HARD 的边界，不能让同一未闭合依赖同时被两个 verdict
    吸收。
- suggestion:
  - 给 §11 增加 `Source type`、`Verifiable evidence`、`storage`、`read-back` 列；
    每行至少填一个规定 enum，并引用真实交互定义、现网文件/行号、RAT 或外部 API 契约。
  - 含多来源的 FR 逐项列出；若 verdict 为 HARD，则同步引用 HARD/PKG/期限，若为 FEASIBLE 则把
    HARD 仅限于 BUILD 证据而非数据源可行性，并写清判定依据。

### MAJOR-05 — policy 字段没有 Gate 15b 要求的逐项 runtime consumer

- where: §3.1 local policy、§5.1 session/grant、§5.2 upload policy、§7 retention、
  §14 Defined-In/Consumed-By
- issue:
  - §14 只给模块级目标路径，没有逐 policy 字段的 consumer `file:line` 或稳定 symbol。
  - `maxScreenshots/maxScreenshotBytes/maxAllAttachmentBytes/allowedScreenshotContentTypes/
    maxEncryptedLogBytes`、consent network gate、grant/session TTL/scope、download TTL/one-time、
    `effectiveDeleteAt/absoluteExpiresAt` 都没有分别绑定 runtime consumer 和 test。
  - 因此“服务端只能收紧”“未同意零网络”“到期先拒读”等关键政策仍可能只停留在文档。
- suggestion:
  - 增加 Policy consumer binding 表：`policy field/invariant → Defined-In → Consumed-By
    file:line 或稳定 symbol → TEST`。
  - 尚未存在的 BUILD 文件必须诚实标 `target symbol, not implemented`；确认②前至少把唯一消费者
    和契约 test anchor 固定，BUILD 落地后再更新真实行号，不能用笼统模块名替代。

### MAJOR-06 — 到期删除 owner digest 后，`API-FDB-110` 的 `410` 与同貌 `404` 无法同时成立

- where: §3.3、`API-FDB-110`、§6.2、§7.2、`TEST-FDB-022/035/041`
- issue:
  - `API-FDB-110` 要求两类 owner digest 同时匹配，同时声明到期可返回
    `410 REPORT_EXPIRED`。
  - §7.2 又要求在 `effectiveDeleteAt` 删除 owner digest 和报告到用户的关联。删除后服务端无法
    证明调用者是原 joint owner；若仅凭 `publicCode` 返回 `410`，会向攻击者泄露该 code 曾存在，
    违反“owner mismatch 与不存在同一 404/体积/延迟”。
- suggestion:
  - 选择并写死一种可测试语义：推荐 owner 关联删除后统一返回同貌 `404 REPORT_NOT_FOUND`，
    移除不可达的 `410`；若确需 90 天后仍回查状态，则必须重新确认并定义最小授权摘要的独立保留
    期限，不能与“删除 owner 关联”并存。
  - 扩展 `TEST-FDB-022/035/041` 覆盖 deadline 前一刻、deadline 后正确旧 owner、错误 owner和
    随机 publicCode 的等价响应。

### MINOR-01 — local-only 单元负测漏列附件 staging

- where: §4.4、`TEST-FDB-010`
- issue:
  - 全局规则“除 `API-FDB-007..009` 外网络拒绝”和 `TEST-FDB-038` 的离线 E2E 能覆盖完整路径，
    但 `TEST-FDB-010` 明列 `open/update/get/export/delete` 时漏了
    `API-FDB-002 stageAttachments`。Round 3 的历史缺口正是选择附件时偷拉 server policy。
- suggestion:
  - 把 `stageAttachments` 明确加入 `TEST-FDB-010`，并分别断言 support session、policy GET、
    report、presign、object storage、feedback telemetry 为 0；保留 `TEST-FDB-038` 做跨层兜底。

## 4. 已通过的重点核对

- `SupportUploadGrant` 已固定 `aud="thirdspace-growth"`、`purpose="feedback_upload"`、5 分钟上限、
  nonce、session scope/TTL，并规定原 subject 立即 HMAC、不落库；`FIX-FDB-012` /
  `TEST-FDB-013/036` 覆盖 activation code、license address 等哨兵秘密。其 issuer/verifier
  实现仍按 `HARD-FDB-01` 收证，不把它写成 BUILD PASS。
- `API-FDB-104..111` 已固定 private quarantine、source checksum/length/type、complete 后服务端
  metadata 复核、stale attempt、扫描/解码/重编码、未知/超时 fail-closed；Growth 只借
  `ObjectStoragePort` 和可靠性模式，不复用 EvidenceObject 的 owner/retention 语义。
- 两份日志被限定为 `encrypted_log_current/encrypted_log_previous`，只传 `.enc` 原字节；
  Growth 不持有解密 key。
- 30/90 天公式、first terminal anchor、legal hold 不越过 90 天、deadline 先拒读、删除 saga、
  `reasonCode` 与 `reasonBody` 分表的主干一致。
- HARD-FDB-01..04 均有 candidate、PKG、owner、期限、PASS 证据和失败处理；兼容策略保持
  `/api/v2/evidence*` 不变，remote flag 关闭时本地导出仍可用。
- AI 不参与写路径；worker 只能经 Growth application service 写 support 自有表。

## 5. Gate 裁决

```text
Gate: 12-service-contract
Status: fail
Evidence: 本文件 §2/§3；29 个 operation 已机械枚举，但具体示例、完整 DTO、IPC 预览链和
Growth admin auth/reauth 契约缺失
Findings: MAJOR-01/02/03/06，MINOR-01
Decision: revise contract；不得进入确认②或 BUILD
```

```text
Gate: 15b-contract-completeness
Status: fail
Evidence: 本文件 §2/§3；FR=12、NFR=10、HARD=4 已机械枚举
Findings: MAJOR-04/05；operation happy-path concrete example 亦未满足
Decision: revise contract and rerun independent review
```

Round 1 最终裁决：`FAIL`。当前 `0 blocker / 6 major / 1 minor`，不满足“只有
0 blocker / 0 major 才 PASS”。用户确认②仍未开放，BUILD 保持关闭；本评审不修改 contract、
manifest、BACKLOG、taskctl 或代码。

## 6. 机械检查补充

指定命令
`git diff --check -- docs/superpowers/specs/2026-07-25-one-click-issue-feedback.contract.md`
返回 `0`，但 contract 当前为 untracked，Git 没有读取其内容。只读补充命令
`git diff --no-index --check /dev/null docs/superpowers/specs/2026-07-25-one-click-issue-feedback.contract.md`
返回 `3`，报告第 `3..8`、`837..838` 行 trailing whitespace。它们是 Markdown 两空格硬换行，
不改变上述契约语义 finding 计数；作者决定是否保留该格式，本 reviewer 不越权修改 contract。
review 文件的同类 `--no-index --check` 没有报告 whitespace finding。
