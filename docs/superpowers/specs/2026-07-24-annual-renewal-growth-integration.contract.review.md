# T-506 年卡购买与低价续费 CONTRACT 交叉审计

> 日期：2026-07-24  
> 审计对象：CreatorOS 跨系统 canonical contract、Thirdspace-growth/Thirdspace-activity
> 本地 `SERVICE_CONTRACT.md` 增量  
> 结论：有效问题已修正；Gate 与用户确认②均已通过

## 审计结论

独立审计最初判为 fail/draft，共提出 19 项。复核后，18 项属于可直接修正的契约问题或已确认
产品规则，均已处理；1 项“本地契约只有增量而没有完整操作字段”的判断源于审计输入只截取了
增量章节，实际两仓完整 `SERVICE_CONTRACT.md` 已存在，canonical 也给出 T-506 全字段，因此
不构成 blocker。

## 已处理问题

1. renewal proof 明确 `iss=thirdspace-activity`、`aud=growth-renewal-exchange`。
2. expired annual 可进入 growth 权威资格判定；revoked 返回 signed revoked snapshot 但不发
   exchange token，覆盖客户端旧 active 缓存。
3. `licenseKind` 闭集补齐 `count`。
4. activity ServiceCredential 操作统一 `correlationId`；public/client 保持 `requestId`。
5. `Idempotency-Key` 原值即 activity `internalKey`，`sourceSystem` 从 growth
   ServicePrincipal 固定映射。
6. 撤期字段改为预先持久化的 `growthRefundOperationId`，不冒充支付渠道退款成功。
7. API-REN-014/015/017 明确内部持久业务键豁免，API-REN-016 明确要求
   `Idempotency-Key`。
8. `refreshStatus=pending` 仅用于 payment return 且预期 version 增加的场景。
9. anonymous purchase proof 删除不可实现的 installation 限流声明，只保留 IP/jti/global。
10. 新购 flow 分开 CreatorOS proof 路径与 growth 官网路径，二者都受 production offering
    gate。
11. 新增 API-REN-022：浏览器清除 URL fragment 后，same-origin 单次交换成
    HttpOnly/Secure/SameSite entry session，并禁止清除前 telemetry/第三方脚本/预取。
12. production 发布强制 `0 < renewal_price_cents < initial_price_cents`。
13. activity renew/revoke 强制校验 growth 在持有 lineage gate 时签发的一次性
    `GateOperationAuthorization`，避免绕过 gate 直接改期限。
14. 注册 API-REN-022、TEST-REN-22、DEC-REN-006 与 HARD-REN-01..09，并补齐追踪矩阵。

## 用户确认②

- `DEC-REN-005`：activity production 从 SQLite 迁 PostgreSQL；旧 beta/perpetual/COUNT
  全量迁移核对，旧 SQLite 只读封存。
- `DEC-REN-006`：把 `frontend/src-tauri` 正式归类为可信本地运行时/platform adapter；
  Web frontend 仅经 typed RPC 使用，价格/资格/资金/期限政策仍留在 growth/activity。

以上两项已由用户于 2026-07-24 明确认可。

## Gate 记录

```text
Gate: 12-service-contract-gate
Status: pass
Evidence: canonical API-REN-001..022；growth/activity SERVICE_CONTRACT 增量；本审计问题处置
Findings: request/response/error/permission/state/idempotency 均有定义；无未处理 breaking gap
Decision: 用户确认②已完成，可进入后续实现；activity 由维护方按 handoff prompt 交付
```

```text
Gate: 15b-contract-completeness
Status: pass
Evidence: 22/22 operation directory 与 heading 唯一；FR-REN-01..15 feasibility 全部有来源、存储、
读回显、冷启动和 verdict；HARD-REN-07..09 有候选解、owner、期限；orphan-scan 0 error
Findings: boundary-scan 0 新违规（5 条既有基线）；reconcile 0 error（1 条既有 BACKLOG 膨胀 warning）
Decision: CONTRACT 内容完整，DEC-REN-005/006 已确认并形成 scope envelope
```
