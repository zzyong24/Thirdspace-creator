# T-506 年卡购买与低价续费跨系统服务契约

> 状态：CONTRACT Gate 与用户确认②已通过  
> 上游：`2026-07-24-annual-renewal-growth-integration.md`  
> 范围：CreatorOS × Thirdspace-growth × Thirdspace-activity  
> 协议版本：`creatoros-annual-v1`  
> 日期：2026-07-24

## 0. 结论与技术裁决

这份契约只增加年卡接入所需的跨系统能力，不复制 growth 已有商品、客户、订单、支付、退款、
佣金和结算系统。实现必须遵守：

1. `Thirdspace-growth` 是价格、资格、订单、资金、退款与 `LineageRenewalGate` 唯一写者。
2. `Thirdspace-activity` 是 grant、首次激活时间、绝对期限与 `term_version` 唯一写者。
3. CreatorOS 只消费签名状态与短时入口；不提交客户、价格、owner 或支付成功声明。
4. renew 与 revoke 共用每 lineage 单行 gate；未知资金或期限结果永不自动释放。

| 决策 | 结论 | 判据与证据 |
|---|---|---|
| 跨系统接口 | 契约优先 | `PAT-004 CF-001/003/004`：三仓、客户端/服务端/provider 跨边界且需端到端测试 |
| growth 持久化 | 复用 PostgreSQL + SQLAlchemy/Alembic | 现有 `Thirdspace-growth/SERVICE_CONTRACT.md §1/§3`；不另造账本 |
| activity 生产持久化 | **迁到 PostgreSQL，用户已确认②** | `PAT-002 RF-001..004`：期限 CAS/唯一约束、重启留存、并发写、正规迁移；现状 `prisma/schema.prisma:8-11` 为 SQLite |
| 外部副作用 | PostgreSQL outbox + worker | `PAT-003 AF-002/003/004`：支付查单、renew/revoke、退款必须重试、审计、重启恢复 |
| 支付/退款 | 复用 growth 现有官方 provider adapter | `PAT-001 T1`：现有支付、查单、退款状态机与薄 adapter 已有，不自研支付宝协议 |
| activity provider | 扩展现有 order fulfillment service | 复用 `API-001..003` 的 grant、幂等、审计，不建第二套 activation service |

### 0.1 已确认的 scope envelope

用户已于 2026-07-24 确认：

- `LineageRenewalGate`、purchase/renewal capability exchange、activity annual term/renew/revoke、
  CreatorOS 年卡状态与入口均属于 T-506；
- activity 生产存储从 SQLite 迁到 PostgreSQL；现有 beta/perpetual/COUNT 数据逐表计数和摘要
  校验后切换，不能重置或自动转成年卡；
- 价格仍由用户在 growth 后台设置，不进入代码或本契约示例。

## 1. 通用协议

### 1.1 版本、时间与字段

- 跨系统 `contractVersion` 固定 `creatoros-annual-v1`；不接受缺失或未知版本。
- HTTP JSON UTF-8；activity 外部 API 沿用 camelCase，growth 沿用 snake_case；adapter 内禁止
  猜测别名。
- 所有 instant 为 RFC3339 UTC；规则自然月时区固定取不可变规则快照中的
  `Asia/Shanghai`。
- 授权区间为 `[termStartAt, termEndAt)`；`termVersion=0` 只表示尚未首次激活，
  `termVersion>=1` 才可参与 renew/revoke CAS。
- 金额仅在 growth 内以整数分保存；CreatorOS 和 activity 的请求/响应没有价格字段。

### 1.2 关联、幂等与摘要

- 所有调用接受 `X-Correlation-ID`；缺失时入口服务生成并贯穿 response、audit、outbox。
- 会改变订单、资金、grant 或期限的写操作要求 `Idempotency-Key`，8–128 个可打印 ASCII
  字符；proof/exchange、activate/status 等已由 nonce、jti 或既有 code+machine 业务键闭合
  重放语义的操作，按各操作小节执行，不重复要求该 header。
- 同 scope+key+规范化 digest：返回首次结果；同 key 异 digest时，activity 固定返回
  `409 IDEMPOTENCY_PAYLOAD_MISMATCH`，growth 固定返回 `409 IDEMPOTENCY_MISMATCH`。
- activity provider 的 `internalKey` 固定为 8–128 位 URL path segment 安全字符
  `[A-Za-z0-9._:-]`；lookup path 使用同一原值，不接受需要猜测解码的别名。
- provider callback 使用验签后的 provider event identity 去重，不要求第三方提供
  `Idempotency-Key`。
- activity 的规范化 digest 不包含 activation code、Bearer token 或签名原文。
- growth token/capability 原文不落库，只保存 namespace 隔离的 HMAC digest。

### 1.3 凭证与最小权限

| Principal | 凭证 | 允许 |
|---|---|---|
| anonymous CreatorOS | 无身份；app/build/channel/nonce | activity purchase proof；不能读 grant 或价格 |
| licensed CreatorOS | activation code + machineId + nonce，沿用现有签名校验 | activate/status；取得仅面向 growth exchange 的短时 proof |
| growth worker | ServiceCredential，project allowlist=`creatoros` | `grant:fulfill`、`grant:term:read`、`grant:renew`、`grant:renew:revoke` |
| growth owner | growth session 或 renewal owner claim + 必要 OTP/reauth | renewal context、选择、建单、发起当前链尾退款 |
| payment/provider worker | growth 内部 service identity | gate、payment、refund、outbox、reconciliation；不得直写 activity |

activity scope 不支持通配符；production credential 不授予管理员通用 scope。CreatorOS 不能调用
activity 的 provider operation。

renew/revoke 除 ServiceCredential 外还必须带
`X-Gate-Operation-Authorization: <compact-signed-token>`。该一次性 token 由 growth 在持有
对应 `LineageRenewalGate` 后签发，claims 固定为
`iss=thirdspace-growth/aud=thirdspace-activity-annual-operations/exp<=2m/jti/lineage_id/
entitlement_id/order_id/gate_version/action/internal_key_digest`。activity 必须验签并逐字段匹配
请求，把 jti/token digest 写入 operation audit；原文不落库。过期、重放、action/lineage/
order/gate version/internal key 任一不匹配固定 `403 GATE_AUTHORIZATION_INVALID`。这使 activity
可以独立拒绝绕过 growth gate 的期限修改，不需要在本地事务中反向调用 growth。

### 1.4 错误 envelope

activity 的 `/api/v1` ServiceCredential 操作（API-REN-001/003/006..009）沿用 activity
服务接口的嵌套 envelope 与 `correlationId`：

```json
{
  "error": {
    "code": "TERM_VERSION_CONFLICT",
    "message": "授权期限版本已变化",
    "correlationId": "cor_01J..."
  }
}
```

activity 的 public/client 兼容操作（API-REN-002/004/005）沿用扁平 envelope 与
`requestId`：

```json
{
  "success": false,
  "code": "TERM_VERSION_CONFLICT",
  "message": "授权期限版本已变化",
  "requestId": "req_01J..."
}
```

growth：

```json
{
  "error": {
    "code": "RENEWAL_LINEAGE_BUSY",
    "message": "该年卡仍有一笔续费或撤期处理中",
    "correlation_id": "cor_01J...",
    "details": {"gate_state": "payment_unknown"}
  }
}
```

错误 message 可本地化，客户端只以稳定 code 分支；details 不含完整 code、token、手机号、支付
密钥或 provider secret。

## 2. 操作目录

| ID | Operation | Method/path | Owner | Source |
|---|---|---|---|---|
| `API-REN-001` | getAnnualCapabilities | `GET /api/v1/projects/creatoros/annual-capabilities` | activity | FR-REN-01/09/15；NFR-REN-12 |
| `API-REN-002` | getPurchaseEntryProof | `POST /api/v1/public/purchase-entry-proofs` | activity | FR-REN-15 |
| `API-REN-003` | provisionAnnualGrant | `POST /api/v1/projects/creatoros/annual-grants/provision` | activity | FR-REN-01/04/06 |
| `API-REN-004` | activateAnnual | `POST /api/license/activate` 增量 | activity | FR-REN-01/04/11 |
| `API-REN-005` | querySignedAnnualStatus | `POST /api/license/status` 增量 | activity | FR-REN-08/09/11/13 |
| `API-REN-006` | lookupAnnualTerm | `GET /api/v1/projects/creatoros/annual-grants/{entitlementId}` | activity | FR-REN-04/06/10 |
| `API-REN-007` | renewAnnualGrant | `POST /api/v1/projects/creatoros/annual-grants/{entitlementId}/renewals` | activity | FR-REN-04/06/14 |
| `API-REN-008` | lookupAnnualOperation | `GET /api/v1/projects/creatoros/annual-operations/{internalKey}` | activity | FR-REN-06/07/09 |
| `API-REN-009` | revokeAnnualRenewal | `POST /api/v1/projects/creatoros/annual-grants/{entitlementId}/renewal-reversals` | activity | FR-REN-07/14 |
| `API-REN-010` | exchangePurchaseEntry | `POST /api/v2/public/creatoros/purchase-entry-capabilities` | growth | FR-REN-01/03/15 |
| `API-REN-011` | exchangeRenewalEntry | `POST /api/v2/public/creatoros/renewal-entry-capabilities` | growth | FR-REN-02/08/13 |
| `API-REN-012` | getRenewalContext | 复用 `API-147 GET .../renewal-context` | growth | FR-REN-02/03/04/12 |
| `API-REN-013` | createRenewalOrder | 扩展 `API-151 POST .../renewal-orders` | growth | FR-REN-02/03/04/12/14 |
| `API-REN-014` | createRenewalPaymentIntent | internal command | growth | FR-REN-05/14 |
| `API-REN-015` | reconcileRenewalPaymentAndFulfillment | worker command | growth | FR-REN-06/09/10/14 |
| `API-REN-016` | reserveRenewalReversal | `POST /api/v2/subscription-lineages/{id}/renewal-reversals` | growth | FR-REN-07/14 |
| `API-REN-017` | reconcileLineageGate | worker/admin-read command | growth | FR-REN-07/10/14 |
| `API-REN-018` | localLicenseStatus | `activation.getStatus` | CreatorOS backend/contract | FR-REN-08/11 |
| `API-REN-019` | localPurchaseEntry | `activation.getPurchaseEntry` | CreatorOS backend/contract | FR-REN-15 |
| `API-REN-020` | localRenewalEntry | `activation.getRenewalEntry` | CreatorOS backend/contract | FR-REN-08/13 |
| `API-REN-021` | localRefreshLicense | `activation.refresh` | CreatorOS backend/contract → Tauri | FR-REN-09 |
| `API-REN-022` | consumeWebEntryCapability | `POST /api/v2/public/creatoros/entry-capabilities/consume` | growth Web/backend | FR-REN-08/13/15 |

## 3. Activity 契约

### API-REN-001 getAnnualCapabilities

- Permission：growth ServiceCredential 或公开 readiness 只读；公开响应不含 provider 地址/密钥。
- Request：无 body；ServiceCredential 版本可带 `If-None-Match`。
- Success `200`：

```json
{
  "success": true,
  "contractVersion": "creatoros-annual-v1",
  "capabilities": {
    "annualTermsV1": true,
    "renewalProviderV1": true,
    "signedLicenseV2": true,
    "purchaseEntryProofV1": true
  },
  "schemaVersion": 2,
  "checkedAt": "2026-07-24T12:00:00.000Z"
}
```

- Errors：`401 AUTHENTICATION_REQUIRED`（私有详情）；`503 CAPABILITY_DISABLED`；
  `503 MIGRATION_INCOMPLETE`。
- Repeat：GET 无副作用；ETag 相同可 `304`。
- State：任一 migration/签名键/provider scope/contract vector 不绿时对应能力必须 false，
  growth production offering gate 因此关闭。

### API-REN-002 getPurchaseEntryProof

- Permission：anonymous；每 IP 10 分钟 30 次，并有 jti/global 总量保护。请求没有可信
  installation identity，因此不得宣称按 installation 限流。
- Request：

```json
{
  "appId": "creatoros",
  "build": "1.9.0",
  "channel": "stable",
  "clientContractVersion": 2,
  "nonce": "base64url-32-bytes"
}
```

- Success `200`：

```json
{
  "success": true,
  "purchaseExchangeToken": "eyJ...",
  "expiresAt": "2026-07-24T12:05:00.000Z",
  "requestId": "req_01J..."
}
```

- Token claims：`iss=thirdspace-activity`、`aud=growth-purchase-exchange`、`exp<=5m`、`jti`、
  `app_id/build/channel/client_contract_version/nonce_hash`；不含 user、grant、price、owner。
- Errors：`400 INVALID_NONCE`；`403 APP_CHANNEL_FORBIDDEN`；`409 CLIENT_UPGRADE_REQUIRED`；
  `429 RATE_LIMITED`；`503 SIGNING_UNAVAILABLE`。
- Idempotency：同 nonce+字段在 TTL 内返回同 claims/jti；同 nonce 异字段
  `409 PROOF_REPLAY_MISMATCH`。
- State：不创建 grant/order；只写 token digest/rate-limit audit。
- Example：上述请求只能换 growth 入口，不能直接创建订单。

### API-REN-003 provisionAnnualGrant

- Permission：growth ServiceCredential +
  `grant:fulfill` + Project allowlist `creatoros`。
- Headers：`Idempotency-Key` 必填。
- Request：

```json
{
  "sourceSystem": "thirdspace-growth",
  "externalOrderId": "ord_annual_1",
  "entitlementId": "ent_annual_1",
  "projectKey": "creatoros",
  "planRef": "creatoros-annual",
  "licenseKind": "annual",
  "termMonths": 12,
  "termTimezone": "Asia/Shanghai",
  "contractVersion": "creatoros-annual-v1"
}
```

- Success `201` 首次 / `200` 重放：

```json
{
  "success": true,
  "grantId": "gr_annual_1",
  "entitlementId": "ent_annual_1",
  "lifecycle": "pending_activation",
  "termStartAt": null,
  "termEndAt": null,
  "termVersion": 0,
  "activationCode": "ONE_TIME_RETURN_ONLY",
  "idempotentReplay": false,
  "correlationId": "cor_01J..."
}
```

- Errors：`400 INVALID_ANNUAL_TERM`；`403 PROJECT_FORBIDDEN|SCOPE_FORBIDDEN`；
  `409 IDEMPOTENCY_PAYLOAD_MISMATCH|ENTITLEMENT_PAYLOAD_MISMATCH`；
  `503 ANNUAL_CAPABILITY_DISABLED`。
- Idempotency：沿用 activity 既有 `API-001 fulfillOrderGrant` 的
  `(sourceSystem,idempotencyKey)` 与 `(sourceSystem,entitlementId)` 双唯一；同摘要重放返回
  同 grant/code。
- Transaction：grant + activation code + operation + audit + response digest 原子提交。
- State：不存在→`pending_activation/version 0/null term`；禁止在 provision 计算绝对期限。

### API-REN-004 activateAnnual

- Permission：沿用 ClientLicenseProof；code、machineId、nonce 必填并受 Project 隔离。
- Request 增量：

```json
{
  "code": "REDACTED",
  "machineId": "machine-hash",
  "nonce": "base64url-32-bytes",
  "clientContractVersion": 2
}
```

- Success `200` 签名 body：

```json
{
  "licensed": true,
  "status": "active",
  "licenseKind": "annual",
  "entitlementId": "ent_annual_1",
  "grantId": "gr_annual_1",
  "termStartAt": "2026-08-23T03:00:00.000Z",
  "expiresAt": "2027-08-23T03:00:00.000Z",
  "termVersion": 1,
  "serverTime": "2026-08-23T03:00:00.000Z",
  "nonce": "base64url-32-bytes",
  "schemaVersion": 2
}
```

- Errors：现有 activate errors；新增 `409 CLIENT_UPGRADE_REQUIRED`；
  `409 ANNUAL_TERM_STATE_CONFLICT`；`503 SIGNING_UNAVAILABLE`。
- Idempotency：第一次激活事务写 `termStart/termEnd/version=1`；相同 code/machine 重放返回原
  绝对期限，永不从重放时间重算。
- Transaction：首次绑定、期限、audit 同事务；签名失败不得提交“已激活”而不返回可恢复证据。
- Compatibility：beta/perpetual/COUNT 按原逻辑；缺 `licenseKind` 的旧快照绝不推断 annual。

### API-REN-005 querySignedAnnualStatus

- Permission：现有 ClientLicenseProof；nonce 必须回显并签名。
- Request 同 status 现有字段，加 `clientContractVersion=2`。
- Success `200`：API-REN-004 的状态字段，加：

```json
{
  "entryExchangeToken": "eyJ...",
  "entryExchangeExpiresAt": "2026-07-24T12:05:00.000Z"
}
```

- `entryExchangeToken` 在 annual 已首次激活、未 revoked 且
  entitlement/grant/termVersion 完整时签发；即使 `termEndAt<=serverTime` 也返回
  `200` 的签名 `status=expired, licensed=false` snapshot 与 proof，由 growth 按权威
  RenewalRuleVersion 判定仍可续费或应新购。activity 不自行定义“grace”窗口。
  claims=`iss=thirdspace-activity/aud=growth-renewal-exchange/exp<=5m/jti/
  entitlement_id/grant_id/term_version/license_kind/machine_hash`。
- 已 revoked 的 annual 也返回 `200` 的签名 `status=revoked,licensed=false` snapshot，但不签发
  `entryExchangeToken`；客户端必须以该新快照覆盖旧 active 缓存。
- Errors：`409 NONCE_MISMATCH|CLIENT_UPGRADE_REQUIRED`；
  `503 SIGNING_UNAVAILABLE`。
- Repeat：只刷新现有在线校验时间与短时 token；不改变 term。
- Example：beta/perpetual 成功响应没有 `entryExchangeToken`。

### API-REN-006 lookupAnnualTerm

- Permission：growth ServiceCredential + `grant:term:read` + Project allowlist。
- Success `200`：

```json
{
  "success": true,
  "grantId": "gr_annual_1",
  "entitlementId": "ent_annual_1",
  "lifecycle": "active",
  "termStartAt": "2026-08-23T03:00:00.000Z",
  "termEndAt": "2027-08-23T03:00:00.000Z",
  "termVersion": 1,
  "latestOperationId": "gop_1",
  "correlationId": "cor_01J..."
}
```

- Errors：`403 PROJECT_FORBIDDEN|SCOPE_FORBIDDEN`；`404 GRANT_NOT_FOUND`；
  `409 GRANT_PENDING_ACTIVATION|GRANT_REVOKED|NOT_ANNUAL`。
- Repeat：GET 无副作用；普通查询不返回 activation code。

### API-REN-007 renewAnnualGrant

- Permission：growth ServiceCredential + `grant:renew`。
- Headers：`Idempotency-Key` 必填；其原值就是 API-REN-008 path 使用的 `internalKey`。
  `sourceSystem` 不由请求 body 提供，而由通过验证的 ServicePrincipal 固定映射为
  `thirdspace-growth`。
- Request：

```json
{
  "expectedTermEndAt": "2027-08-23T03:00:00.000Z",
  "expectedTermVersion": 1,
  "targetTermEndAt": "2028-08-23T03:00:00.000Z",
  "predecessorOperationId": null,
  "contractVersion": "creatoros-annual-v1"
}
```

- Success `200`：

```json
{
  "success": true,
  "operationId": "gop_renew_1",
  "status": "renewed",
  "previousTermEndAt": "2027-08-23T03:00:00.000Z",
  "effectiveTermEndAt": "2028-08-23T03:00:00.000Z",
  "termVersion": 2,
  "idempotentReplay": false,
  "correlationId": "cor_01J..."
}
```

- Errors：`400 TARGET_TERM_INVALID`；`403 SCOPE_FORBIDDEN`；`404 GRANT_NOT_FOUND`；
  `403 GATE_AUTHORIZATION_INVALID`；
  `409 GRANT_PENDING_ACTIVATION|GRANT_REVOKED|TERM_VERSION_CONFLICT|
  PREDECESSOR_OPERATION_MISMATCH|IDEMPOTENCY_PAYLOAD_MISMATCH`；
  `503 RENEWAL_CAPABILITY_DISABLED`。
- Idempotency：同 key+digest 返回同 operation/result；不同 key 同 expected version 由 DB CAS
  只有一个成功。
- Transaction：operation + termEnd + version+1 + audit 原子提交。
- State：只允许 active annual；activity 不重算月份，不接受 target 早于或等于 current。

### API-REN-008 lookupAnnualOperation

- Permission：growth ServiceCredential + `grant:term:read`。
- Request：path `internalKey` 使用 §1.2 的原值；可选
  `X-Expected-Request-Digest: sha256:<64 lowercase hex>` 用于核对调用方持有的原请求摘要。
- Success `200`：

```json
{
  "success": true,
  "operationId": "gop_renew_1",
  "action": "renew",
  "status": "renewed",
  "effectiveTermEndAt": "2028-08-23T03:00:00.000Z",
  "termVersion": 2,
  "requestDigest": "sha256:...",
  "correlationId": "cor_01J..."
}
```

- Errors：`403 SCOPE_FORBIDDEN`；`404 OPERATION_NOT_FOUND`；
  `409 IDEMPOTENCY_PAYLOAD_MISMATCH`（调用方提供 expected digest 时）。
- Repeat：只读；provider 超时后必须先调用本操作，明确不存在才可用同 key 重试。

### API-REN-009 revokeAnnualRenewal

- Permission：growth ServiceCredential + `grant:renew:revoke`。
- Headers：`Idempotency-Key` 必填，其原值同时是 `internalKey`；`sourceSystem` 从
  ServicePrincipal 固定映射为 `thirdspace-growth`。
- Request：

```json
{
  "renewalOperationId": "gop_renew_1",
  "expectedTermEndAt": "2028-08-23T03:00:00.000Z",
  "expectedTermVersion": 2,
  "restoreTermEndAt": "2027-08-23T03:00:00.000Z",
  "growthRefundOperationId": "rfop_1",
  "contractVersion": "creatoros-annual-v1"
}
```

- Success `200`：

```json
{
  "success": true,
  "operationId": "gop_revoke_1",
  "status": "reversed",
  "effectiveTermEndAt": "2027-08-23T03:00:00.000Z",
  "termVersion": 3,
  "idempotentReplay": false,
  "correlationId": "cor_01J..."
}
```

- Errors：`400 RESTORE_TERM_INVALID`；`404 GRANT_NOT_FOUND|OPERATION_NOT_FOUND`；
  `403 GATE_AUTHORIZATION_INVALID`；
  `409 NOT_CURRENT_CHAIN_TAIL|TERM_VERSION_CONFLICT|REFUND_REFERENCE_MISMATCH|
  IDEMPOTENCY_PAYLOAD_MISMATCH`。
- Idempotency：同 growth refund operation/key/digest 返回原结果；同 renewal operation 只能有
  一次有效 reversal。`growthRefundOperationId` 是 activity 调用前由 growth 持久化生成的稳定
  内部退款操作 ID，不表示支付渠道退款已经成功。
- Transaction：reversal operation + term restore + version+1 + audit 原子提交。
- State：非链尾拒绝；不删除历史 operation。

## 4. Growth 契约

### API-REN-010 exchangePurchaseEntry

- Permission：anonymous，但必须携带 API-REN-002 的 activity token；IP 10 分钟 30 次。
- Request：

```json
{"purchase_exchange_token":"eyJ...","client_nonce":"base64url-32-bytes"}
```

- Success `200`：

```json
{
  "data": {
    "state": "available",
    "entry_url": "https://growth.example/buy#cap_opaque",
    "expires_at": "2026-07-24T12:10:00Z"
  },
  "meta": {"correlation_id":"cor_01J..."}
}
```

- Errors：`401 ENTRY_PROOF_INVALID`；`409 ENTRY_PROOF_EXPIRED|ENTRY_PROOF_REPLAY_MISMATCH|
  CLIENT_UPGRADE_REQUIRED`；`429 RATE_LIMITED`；`503 ANNUAL_OFFERING_DISABLED`。
- Idempotency：token jti+client nonce 同 digest 在 TTL 内返回同 capability；原文只返回给调用方，
  库中保存 digest。
- State：只创建短时 capability，不创建 Customer/Order/Payment；Web 打开后仍需 growth 登录。
  URL fragment 不会发送给服务端；growth Web boot loader 必须按 API-REN-022 先消费 fragment，
  清除地址栏后才渲染或启用 telemetry。

### API-REN-011 exchangeRenewalEntry

- Permission：anonymous bearer proof；必须是 API-REN-005 的 activity token。
- Request：

```json
{"entry_exchange_token":"eyJ...","client_nonce":"base64url-32-bytes"}
```

- Success `200`：

```json
{
  "data": {
    "state": "eligible",
    "entry_url": "https://growth.example/renew#cap_opaque",
    "expires_at": "2026-07-24T12:10:00Z",
    "term_end_at": "2027-08-23T03:00:00Z"
  },
  "meta": {"correlation_id":"cor_01J..."}
}
```

- `state` 固定 `eligible|not_yet|expired_new_purchase|blocked|unavailable`；不返回价格、手机号、
  customer_id 或 lineage_id。
- `entry_url` 仅在 `state=eligible` 时必填；其他状态必须省略。`term_end_at` 是 activity
  权威期限回显，`expires_at` 是本次状态/capability 的服务端有效期，不授权本机延长资格。
- Errors：`401 ENTRY_PROOF_INVALID`；`404 ENTITLEMENT_NOT_FOUND`；
  `409 ENTRY_PROOF_EXPIRED|ENTRY_PROOF_REPLAY_MISMATCH|TERM_PROJECTION_CONFLICT`；
  `503 RENEWAL_PROVIDER_DISABLED`。
- Idempotency：同 jti+nonce 同 digest 返回原能力；短时 URL 重放仍必须 owner 登录/OTP。
- State：growth 先 API-REN-006 读 activity 权威 term/version，再计算窗口；不信任 token 中期限
  作为资格真相。
- Web handoff：同 API-REN-010，fragment 只能由浏览器 boot loader 交给 API-REN-022，不能由
  服务端假设从 HTTP request 读取。

### API-REN-012 getRenewalContext

复用 growth `API-147` 的完整请求、权限、错误和 owner claim 规则，增量：

- 每次读取 API-REN-006；lineage projection version 不一致时同事务更新投影并重算。
- `renewal_window.open` 只由 growth 数据库时钟与 RenewalRuleVersion 计算。
- 固定价格 offering 要求 `guide=max=renewal_price_cents`，且发布时服务端校验
  `0 < renewal_price_cents < initial_price_cents`；不满足返回
  `422 RENEWAL_PRICE_NOT_LOWER_THAN_INITIAL`。
- 新增错误：`409 LINEAGE_GATE_BLOCKED`（返回脱敏 gate state）；`409 TERM_PROJECTION_CONFLICT`。
- GET 重复无副作用；响应示例沿用 API-147。

### API-REN-013 createRenewalOrder

复用 growth `API-151` 的 request/response/owner/quote/price snapshot，增量：

- 锁序第一项固定 `LineageRenewalGate`；不存在时原子创建一行 `released` 后锁定。
- 进入数据库事务前读取 API-REN-006 的权威 term/version；随后锁 gate，并校验该快照与
  quote/context、lineage 投影一致，gate `released→reserved` 并绑定 order/version。网络读取
  不持有数据库锁；activity 的生产 renew/revoke 又必须先占同一 gate，因此不会在校验与
  reserve 之间绕过 gate 改期限。Order 创建不等于创建 payment intent。
- Success 仍为 API-151 示例，新增 `gate_version` 和 `payment_state=not_created`。
- 新增错误：`409 RENEWAL_LINEAGE_BUSY|TERM_VERSION_CONFLICT|GATE_VERSION_CONFLICT`；
  `503 GATE_RECONCILIATION_UNAVAILABLE`。
- Idempotency：同 owner+key+digest 返回同 order/gate version；两个 order 并发只有一个 reserve。

### API-REN-014 createRenewalPaymentIntent

- Permission：growth payment worker；不对浏览器公开。
- Idempotency：这是仅由持久化 outbox 驱动的内部 command，不接收外部
  `Idempotency-Key`；唯一业务键固定为 `order_id:create_intent:sequence`，同键异摘要进入异常。
- Input：

```json
{"order_id":"ord_r1","expected_gate_version":4,"expected_activity_term_version":1}
```

- Success：

```json
{"order_id":"ord_r1","gate_state":"intent_created","provider_intent_ref":"pi_digest","gate_version":5}
```

- Errors：`409 GATE_NOT_RESERVED|GATE_ORDER_MISMATCH|GATE_VERSION_CONFLICT|
  TERM_VERSION_CONFLICT`；`503 PAYMENT_PROVIDER_UNAVAILABLE`。
- Rules：先在数据库事务外再次 API-REN-006 取得权威 term/version，再锁 gate；只有 gate
  仍绑定同 order/version 且权威快照与报价完全一致，才同事务写唯一 create-intent outbox。
  网络调用不持锁；timeout 转 `payment_unknown`。在 outbox 尚未提交前复核失败可 close
  order 并 release。
- Idempotency：`order+action+sequence` outbox 唯一；provider merchant order key 稳定。

### API-REN-015 reconcileRenewalPaymentAndFulfillment

- Permission：payment/fulfillment worker。
- Idempotency：这是 inbox/outbox worker command，不接收外部 `Idempotency-Key`；provider
  event identity、payment query attempt、activity `internalKey` 与 refund operation key 分域唯一。
- Input：`order_id,event_or_query_ref,expected_gate_version`；callback 先验签/inbox。
- Success 示例：

```json
{"order_id":"ord_r1","gate_state":"released","order_status":"fulfilled","term_version":2}
```

- Errors：`409 PAYMENT_AMOUNT_MISMATCH|GATE_ORDER_MISMATCH|TERM_VERSION_CONFLICT`；
  `503 PAYMENT_RESULT_UNKNOWN|ACTIVITY_RESULT_UNKNOWN|REFUND_RESULT_UNKNOWN`。
- State：严格执行上游 SPEC §6.1：
  `intent_created/payment_unknown→captured→fulfillment_pending→released`；activity 冲突走
  `refund_pending`；所有未知保持阻塞或 frozen。
- Gate authorization：调用 API-REN-007 前在当前 gate version 下签发
  `action=renew` 的一次性授权；lookup-first 后若需重试，必须复用原 internal key，并在仍持有
  同一 gate 时重新签发短时授权，不能复用过期 token。
- Idempotency：provider event inbox、fulfillment internal key、refund key 各自唯一；重启先
  payment query → API-REN-008 lookup → refund query。

### API-REN-016 reserveRenewalReversal

- Permission：lineage owner + renewal OTP/reauth；资金退款最终仍走 growth 既有退款权限。
- Headers：`Idempotency-Key` 必填。
- Request：

```json
{"renewal_order_id":"ord_r1","reason_code":"customer_refund","refund_rule_ack":"rrv_1"}
```

- Success `202`：

```json
{"data":{"reversal_id":"rrvop_1","gate_state":"reversal_reserved","status":"pending"}}
```

- Errors：`401 RENEWAL_OWNER_REQUIRED`；`409 RENEWAL_LINEAGE_BUSY|NOT_CURRENT_CHAIN_TAIL|
  TERM_VERSION_CONFLICT|ORDER_NOT_REFUNDABLE`；`422 REASON_INVALID`。
- State：锁序 `gate→order/refund→outbox`；`released→reversal_reserved→reversal_pending`
  → API-REN-009 → `refund_pending→released`。任何未知保持阻塞。
- Gate authorization：调用 API-REN-009 前签发 `action=revoke_renewal` 的一次性授权，claims
  绑定当前 lineage/order/gate version 与 reversal internal key。
- Idempotency：同 owner+order+key+digest 返回原 reversal；一个 renewal operation 最多一个有效
  reversal。

### API-REN-017 reconcileLineageGate

- Permission：worker 自动；管理员只有只读查看与触发同一 reconciliation key，不能指定目标状态。
- Idempotency：worker/admin 触发都以持久化 `reconciliation_key` 为唯一业务键，不另接收
  `Idempotency-Key`；同键只能产生一次证据归并。
- Input：`lineage_id,reconciliation_key`。
- Success：

```json
{"lineage_id":"sub_1","state":"refund_pending","evidence":["payment_query:paid","refund_query:unknown"]}
```

- Errors：`404 LINEAGE_NOT_FOUND`；`409 RECONCILIATION_ALREADY_RUNNING`；
  `503 PROVIDER_UNAVAILABLE|ACTIVITY_UNAVAILABLE`。
- Repeat：同 reconciliation key 返回首次 evidence/result；不靠内存锁。
- State：只按 provider/activity 确定证据进入对应阻塞态或 released；无证据保持 frozen。

### API-REN-022 consumeWebEntryCapability

- Permission：anonymous browser；仅接受 same-origin `POST`，`Origin`/`Sec-Fetch-Site`/CSRF
  守卫必须通过。
- Request：growth Web boot loader 从 URL fragment 读取 opaque capability 后，立即调用
  `history.replaceState` 清除 fragment，再提交：

```json
{"entry_capability":"opaque","entry_kind":"purchase|renewal"}
```

- Success `204`：设置短时 `__Host-ts_entry` HttpOnly、Secure、SameSite=Lax session cookie；
  cookie 只保存服务端 session 引用，不含 capability 原文。页面随后按 session 读取新购或续费
  context。
- Errors：`401 ENTRY_CAPABILITY_INVALID`；`409 ENTRY_KIND_MISMATCH`；
  `410 ENTRY_CAPABILITY_EXPIRED|ENTRY_CAPABILITY_CONSUMED`；`429 RATE_LIMITED`。
- Idempotency：capability digest+jti 只消费一次；同一浏览器 session 对同 digest 重试返回
  `204`，其他 session 重放返回 `410 ENTRY_CAPABILITY_CONSUMED`。
- Security：页面统一 `Referrer-Policy: no-referrer`；清除 fragment 前禁止 telemetry、第三方
  script、资源预取和错误上报。capability 原文不进 access log、analytics、DB 或错误 envelope。
- State：只创建短时 Web entry session；不创建 Customer/Order/Payment，不跳过后续登录、
  owner/OTP、价格确认与 production offering gate。

## 5. CreatorOS 本地 contract

CreatorOS `contract/` 是本地 RPC 的单一 schema 真相；Web frontend 不直连 growth/activity。
现状由 Tauri Rust 承担可信本地运行时（签名验证、activation code 安全存储与受约束网络
  adapter），frontend 只经 typed RPC 使用；这一物理边界已由用户确认②并写入架构真相。

### API-REN-018 localLicenseStatus

- Permission：当前本机用户；loopback 启动令牌 + Host/Origin/Content-Type 守卫。
- Input：无。
- Success：

```json
{
  "licenseKind":"annual",
  "status":"active",
  "expiresAt":"2027-08-23T03:00:00.000Z",
  "termVersion":1,
  "lastConfirmedServerTime":"2026-07-24T12:00:00.000Z",
  "purchaseState":"hidden",
  "renewalState":"not_yet",
  "renewalStateConfirmedAt":"2026-07-24T12:00:00.000Z",
  "renewalStateExpiresAt":"2026-07-24T12:10:00.000Z"
}
```

- Closed enum：`licenseKind=beta|annual|perpetual|count`；
  `status=active|expired|revoked|unavailable`；
  `purchaseState=hidden|available|unavailable`；
  `renewalState=eligible|not_yet|expired_new_purchase|blocked|unavailable`。
- `renewalState` 只回显最近一次 API-REN-011 的服务端结果及其确认时点/有效期；从未交换或
  结果已失效时固定为 `unavailable`，不得用本机时钟把它推导为 `not_yet/eligible/
  expired_new_purchase`。
- Errors：`ACTIVATION_STATE_UNAVAILABLE`；`LICENSE_SNAPSHOT_UNTRUSTED`。
- Repeat：只读；读取失败不回退 fixture。

### API-REN-019 localPurchaseEntry

- Permission：activation-only 本机也可调用；loopback 守卫。
- Input：`{"intent":"open","nonce":"..."}`。
- Success：`{"state":"available","url":"https://growth...#opaque","expiresAt":"..."}`。
- Errors：`PURCHASE_UNAVAILABLE|CLIENT_UPGRADE_REQUIRED|NETWORK_UNAVAILABLE|
  ENTRY_PROOF_INVALID`。
- Flow：Tauri/API adapter 调 API-REN-002→010；只允许 `https` 且 host 在签名 allowlist，使用
  OS 外部浏览器打开。URL 不写日志/DB。
- Repeat：每次点击重新交换；重复 token 由服务端幂等。

### API-REN-020 localRenewalEntry

- Permission：可信、未 revoked 且已首次激活的 annual `.license` 快照；active 或 expired 均可
  调用，由 growth 判定仍可低价续费还是只能新购。beta/perpetual/count/pending_activation/
  revoked/untrusted 固定拒绝。
- Input：`{"intent":"open","nonce":"..."}`。
- Success：业务资格是成功响应，不用异常表达；`url` 只在 `eligible` 时存在。示例：

```json
{"state":"eligible","url":"https://growth...#opaque","expiresAt":"2026-07-24T12:10:00.000Z","termEndAt":"2027-08-23T03:00:00.000Z"}
```

- Closed state：`eligible|not_yet|expired_new_purchase|blocked|unavailable`；后四种响应省略 `url`。
- Errors：`NOT_ANNUAL|LICENSE_SNAPSHOT_UNTRUSTED|NETWORK_UNAVAILABLE|
  ENTRY_PROOF_INVALID`。
- Flow：先 API-REN-005 取得 proof，再 API-REN-011；不提交 customer/price/owner。
- Routing：`expired_new_purchase` 由界面明确显示“购买新年卡”，用户点击后调用
  API-REN-019；不得把它伪装成续费成功或在本地改写为 `eligible`。
- Repeat：不持久化 URL；每次刷新/点击重新交换。

### API-REN-021 localRefreshLicense

- Permission：可信本地 activation code；loopback 守卫。
- Input：`{"reason":"payment_return|manual|startup"}`。
- Success：API-REN-018 shape + `refreshStatus=confirmed|pending`。
- Errors：`NETWORK_UNAVAILABLE|STATUS_SIGNATURE_INVALID|STATUS_NONCE_MISMATCH`。
- State：只在 activity 签名、nonce、时间与 schema 验证通过后原子替换 `.license` v2，再
  best-effort 同步 backend 展示投影。仅 `reason=payment_return` 且预期 term version 应增加
  时，可信 snapshot 的 `termVersion/expiresAt` 尚未变化才返回 `refreshStatus=pending`；
  `manual|startup` 的可信未变化 snapshot 返回 `confirmed`。growth return 本身不能把 UI
  置为 success。
- Idempotency：并发 refresh 串行化；同签名 snapshot 不重复写业务状态。

## 6. 数据模型与迁移契约

### 6.1 activity（唯一期限写者）

在现有 `OrderFulfillmentGrant` 增加：

- `licenseKind: beta|annual|perpetual|count`
- `termMonths?`、`termTimezone?`
- `termStartAt?`、`termEndAt?`
- `termVersion`（annual pending=0，激活后 ≥1）
- `lifecycle: pending_activation|active|revoked`

新增 `GrantRenewalOperation`：

- `id`、`grantId`、`sourceSystem`、`internalKey`、`action=renew|revoke_renewal`
- `predecessorOperationId?`、expected/target/restore term、expected/result version
- `requestDigest`、`status=renewed|reversed`、`growthRefundOperationId?`、timestamps

约束：

- unique `(sourceSystem,internalKey)`；
- unique active reversal per renewal operation；
- term/version 与 operation/audit 同事务；
- production 禁止进程内 Map/lock 作为唯一幂等或互斥。

SQLite→PostgreSQL 迁移：

1. schema 先建、应用双读验证但仍关闭 annual capabilities；
2. 停写窗口导出并导入全部 Project/ActivationCode/TrialActivation/Consumption/Binding/
   OrderFulfillment/Audit 表；
3. 对每表比对 row count、PK range、稳定业务键集合 digest；抽查 beta/perpetual/COUNT 激活、
   status、consume、rebind；
4. 切 PostgreSQL 单写后再跑完整回归；旧 SQLite 只读封存，不自动删除；
5. 任何差异都保持 capabilities=false。

### 6.2 growth（唯一资金与 gate 写者）

新增 `LineageRenewalGate`：

- `lineage_id` PK/FK；
- `operation_kind=renewal|reversal|null`、`order_id?`、`expected_activity_term_version?`
- `state` 使用 SPEC §6.1 enum；
- provider intent/payment/refund/reversal refs 仅存内部 ID/digest；
- `gate_version` CAS、`frozen_reason?`、`last_evidence_at`。

复用现有 `integration_inbox/outbox_job/execution_attempt/audit_event/reconciliation_issue`。
所有 gate 状态与 outbox 写入同一 PostgreSQL 事务。

### 6.3 CreatorOS 本机

`.license` v2 增加 `licenseKind/entitlementId/grantId/termVersion/termStartAt/expiresAt/
serverTime/schemaVersion`，仍由 Rust 验签后加密写。backend `activation_state` 只是脱敏展示投影；
可保存最近一次服务端 entry state 及其 confirmed/expiry 时间，不保存 entry token/URL、订单、
价格或 customer；状态过期后固定回显 `unavailable`。

旧 `.license`：

- 有 expiresAt 但无 licenseKind：按现有 beta/trial 兼容，不推断 annual；
- perpetual 保留；
- 无可信签名/schema 不产生购买/续费资格。

## 7. 状态、部署与回滚不变量

1. production offering 开启条件：
   activity 四项 capability、PostgreSQL migration evidence、growth gate unique/CAS、
   reconciliation worker、payment query/refund、provider vectors、CreatorOS v2 E2E 全绿。
2. 新销售可随时关闭；存在任一非 released gate 时，growth 查单/履约/退款/reconciliation 与
   activity lookup/renew/revoke 端点不得回滚。
3. API-REN-003/004 的 pending→active 是首次激活唯一入口。
4. renew/revoke 的 production ServiceCredential 只给 growth，且所有调用必须先取得 gate。
   activity 还必须验证与该次操作绑定的一次性 `GateOperationAuthorization`。
5. beta/perpetual/COUNT 迁移前后行为相同；内测码没有 growth entitlement 和入口 proof。

## 8. 逐 FR 数据链路可行性

来源类型 enum 只使用：`官方API|用户录入|授权第三方|系统内生`。

| FR | 来源类型 | 可验证证据 | 存储 | 读回显 | 冷启动/历史窗口 | 判定 |
|---|---|---|---|---|---|---|
| FR-REN-01 | 用户录入+系统内生 | 用户确认只售年卡；API-REN-002/003/004；activity `SERVICE_CONTRACT.md API-001/201` | growth Offering/Order；activity grant term | API-REN-004/018 | 新正式年卡起；beta 不迁移 | feasible |
| FR-REN-02 | 系统内生 | growth `SERVICE_CONTRACT.md API-146/147/151` + API-REN-006/011 | lineage/rule/order | API-REN-011/012 | 新 lineage；无付费历史回填 | feasible |
| FR-REN-03 | 用户录入 | growth 后台 API-152 交互；服务端校验 `0<renewal<initial` | immutable rule/offering/order snapshot | API-REN-012；growth 页面 | 发布后生效，历史订单保留快照 | feasible |
| FR-REN-04 | 系统内生 | API-REN-003/004/006/007 字段契约 | activity term/operation；growth projection | API-REN-005/006/018 | 首次激活起；无预填历史 | feasible |
| FR-REN-05 | 用户录入+官方API | growth 单次下单；现有支付宝 Payment contract | growth Order/Payment | growth order result | 每次人工确认，无代扣历史 | feasible |
| FR-REN-06 | 系统内生 | API-REN-007/008 + DB CAS/unique | activity operation/term | API-REN-008；growth attempt | 新 annual operation 起 | feasible |
| FR-REN-07 | 用户录入+授权第三方+官方API | API-REN-009/016/017；growth Refund query | activity reversal；growth gate/refund | growth result；API-REN-005 | 只撤当前链尾；旧 beta 不适用 | feasible |
| FR-REN-08 | 授权第三方+系统内生 | API-REN-005/011/018/020 | 短时 digest；本机展示投影 | CreatorOS 设置页 | annual v2 起 | feasible |
| FR-REN-09 | 官方API+授权第三方 | growth payment return + API-REN-005/015/021 | growth payment/gate；`.license` v2 | API-REN-018/021 | 返回后及手动刷新 | feasible |
| FR-REN-10 | 系统内生 | correlation/stable IDs；API-REN-006/008/015/017 | audit/inbox/outbox/operation | 三端 support timeline | 新操作起，留存沿各仓政策 | feasible |
| FR-REN-11 | 系统内生 | activity 旧 mode 事实；API-REN-004/005 compatibility | 原 grant/code + 新 nullable 字段 | 旧 activate/status 回归 | 全历史 beta/perpetual 保留 | feasible |
| FR-REN-12 | 系统内生 | growth `SERVICE_CONTRACT.md §15 API-148/149/151` | attribution/quote/order/ledger | growth renewal center | 复用现有规则历史 | feasible |
| FR-REN-13 | 授权第三方 | API-REN-005→011 token producer/consumer | token digest/lineage mapping | CreatorOS state + growth owner flow | token ≤5/10 分钟，无历史 | feasible |
| FR-REN-14 | 官方API+系统内生 | SPEC §6.1；API-REN-013..017；GateOperationAuthorization；growth Postgres/outbox | LineageRenewalGate/payment/refund/outbox | API-REN-012/017/admin issue | 新 gate 起；旧正式订单不存在 | feasible |
| FR-REN-15 | 系统内生 | API-REN-002→010→022 producer/consumer | proof/capability/session digest | CreatorOS 激活页 | 无授权也可短时交换；旧客户端拒绝 | feasible |

## 9. HARD 台账

| HARD | 候选解 | Owner | 核验期限 | Gate |
|---|---|---|---|---|
| HARD-REN-07 activity SQLite 不满足生产并发/迁移判据 | Prisma provider 切 PostgreSQL；全表 count+业务键 digest 迁移，旧 SQLite 只读封存 | PKG-REN-ACTIVITY | activity TDD 前完成迁移 probe；BUILD 收片前真实迁移演练 | 用户确认②已完成 + DB migration tests |
| HARD-REN-08 真实 activity/growth 网络未知结果 | 复用 growth outbox/query-first；activity operation lookup；故障注入在副作用前后 kill process | PKG-REN-ACTIVITY/GROWTH | 各片 BUILD Gate | TEST-REN-06/09/18 |
| HARD-REN-09 真实支付宝与部署凭证 | growth 现有 sandbox adapter + provider callback/query/refund；production 签约不进代码 | PKG-REN-E2E | SHIP 前 | TEST-REN-12/19 |
| HARD-REN-10 卡密系统未达正式商用安全线 | 卡密 HMAC digest + DB 外密钥 AES-GCM、依赖升级、持久限流、可信代理、签名 fail-closed、安全头与独立渗透测试 | PKG-REN-ACTIVITY-SECURITY | annual capability 开启前 | TEST-REN-23 + 安全验收报告 |

## 10. Contract completeness 自检

| Operation | Happy request/response/example | Errors | Permission | State | Idempotency |
|---|---|---|---|---|---|
| API-REN-001..009 | 完整 | 完整 | 完整 | 完整 | GET 无副作用；写操作完整 |
| API-REN-010..017 | 完整；API-147/151 复用原例并列增量 | 完整 | 完整 | 完整 | 完整 |
| API-REN-018..022 | 完整 | 完整 | 完整 | 完整 | 完整 |

无未决占位、无空 feasibility 行、无 cut。growth/activity 本地契约已回写；独立
cross-audit 的有效问题已处理；双向 orphan scan、boundary scan、reconcile 均为 0 error。
CONTRACT Gate 与用户确认②均已完成；activity 实现按 handoff prompt 由其维护方交付，并在安全
release gate 通过前保持 annual capability 与 production offering 关闭。
