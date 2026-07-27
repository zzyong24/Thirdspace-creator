# T-482 内容雷达 Contract Gate

> 日期：2026-07-23
> Artifact：`docs/superpowers/specs/2026-07-23-content-radar-service-contract.md`

## Gate: service-contract

- Status: **pass**
- Upstream: `2026-07-23-content-radar-restructure-design.md`（PLAN + RAT + delta review PASS）
- Evidence:
  - 30 个 operation 均有 request、response、专属/公共 error code 与 response shape、权限、重复行为和 concrete example。
  - 变更状态已定义：execution task、source、transform、migration；批量归属先整批校验。
  - `DEC-CR-011..013` 明确 contract-first、真实数据库/DB lease、adapter/领域分离。
  - CodeGraph：
    - `callers fetchDouyinUserPosts` → `buildPersistence`
    - `impact detectDarkhorse` → `collectDarkhorse`、`buildPersistence`
    - `callers createBrowserSessionsService` → `buildPersistence`
- Findings: none
- Decision: Gate 通过；用户已于 2026-07-23 确认 scope envelope 并授权进入 Build。

## Gate: contract-completeness

- Status: **pass**
- Executable evidence:

```text
FR=21
feasibility rows=21
API=31
registered API=31
traceability API=31
operation examples=31
missing=[]
```

- 每条 FR 判定：
  - `feasible` 或 `HARD` 均已填写。
  - 无 `cut`、无空行、无“待定/TBD”。
  - 每条 HARD 均有具体候选解、owning PKG 和验证时点。
  - 外部数据来源均有 `RAT-CR-001..007` 或明确用户交互定义。
- Policy consumption：
  - URL guard：现有 `frontend/src/server/ingestion/web-reader.ts:500-568`，Build 时迁至 adapter 并补重定向预请求防护。
  - 通用网页登录态：`backend/src/modules/browser-sessions/browser-sessions.service.ts:63-105` 与 `backend/src/schema/browser-sessions.ts:22-29`。
  - 抖音 profile：`frontend/src/server/ingestion/douyin-cdp.ts:696-900`。
  - 统一限流：现有 `douyinGateway`；Build 接入 execution claim policy。
- Traceability:
  - `node orchestrator/process/orphan-scan.mjs` → `0 error(s)`，双向链 clean。
  - `node orchestrator/process/boundary-scan.mjs` → 无新增物理架构违规。
  - `git diff --check` → clean。
- Findings: none
- Decision: `DEC-CR-011..015` 与 31-operation scope envelope 已获用户确认。

## 已确认的 scope envelope

用户已确认以下三点，Build 可在该边界内持续推进，不再为普通实现细节重复暂停：

1. 新增 `backend/src/modules/intelligence`，作为分类/来源/内容/快照/归因/迁移唯一写者。
2. 在现有 `execution` 模块补 DB-backed task lease，而不是文件队列或提前上 Redis/BullMQ。
3. 抖音/热点宝复用 account-scoped appData profile；通用网页复用现有 AES 加密 `browser-sessions`；情报与任务域只持有引用。
