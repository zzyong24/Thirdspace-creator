# 可直接转发给 Thirdspace-activity 的实施提示词

请在 `/Users/zyongzhu/Workbase/Thirdspace-activity` 完整实施 CreatorOS 正式年卡与卡密安全加固。
不要只写方案或伪接口；完成代码、迁移、测试、部署 Gate 和证据。所有用户/项目工件使用简体
中文，代码标识符保持英文。

## 先读与流程

1. 先读 activity 的 `AGENTS.md`、`BACKLOG.md`、任务 SPEC、`PROJECT_CONTEXT.md`。
2. 按 activity 自己的 product-to-code 流程登记/启动任务；不得直接手改任务状态。
3. 跨系统唯一契约：
   `../Thirdspace-creator/docs/superpowers/specs/2026-07-24-annual-renewal-growth-integration.contract.md`
4. 产品 SPEC：
   `../Thirdspace-creator/docs/superpowers/specs/2026-07-24-annual-renewal-growth-integration.md`
5. 安全核查：
   `../Thirdspace-creator/docs/superpowers/specs/2026-07-24-activity-license-security-assessment.md`
6. activity 本地属主契约：`SERVICE_CONTRACT.md` 的 T-506 增量。

用户已确认：只售 12 个月年卡；首购价和续费价都在 growth 配置；所有后续年度按固定续费价；
必须满足 `0 < renewal_price_cents < initial_price_cents`；当前只有内测激活码，没有正式付费
存量；内测码不迁成年卡。用户也确认 activity production 从 SQLite 迁 PostgreSQL。

## 必须完成的功能

完整实现 canonical `API-REN-001..009`：

- annual capabilities/readiness；
- anonymous purchase-entry proof；
- annual grant provision：`pending_activation/null term/termVersion=0`；
- 第一次 activate 才从真实激活时刻计算 12 个自然月并写 version 1；
- signed annual status：active/expired/revoked 均返回可信快照；expired 未撤权可发 renewal
  exchange proof，revoked 不发 proof；
- lookup current term/version；
- renew 的 expected term/version CAS、幂等 operation 与 lookup-first；
- 只撤当前链尾 renewal，恢复期限并 version+1；
- renew/revoke 强制验证 growth 一次性 `GateOperationAuthorization`，不能只信
  ServiceCredential。

字段、错误码、权限、幂等和状态机必须逐字服从 canonical；不要自行改价、资格窗口、owner、
订单、支付或退款逻辑，这些都属于 growth。

## PostgreSQL 迁移

- Prisma production provider 改 PostgreSQL，使用正式 migration，不用 `db push` 充当发布迁移。
- 新 schema 先兼容旧 beta/perpetual/COUNT/TRIAL；annual capability 默认 false。
- 迁移全部 Project、ActivationCode、TrialActivation、Consumption、Binding、
  OrderFulfillment、Audit、rate-limit/config 数据。
- 切换前后逐表核对 row count、PK/稳定业务键集合 digest，并回归旧码 activate/status/
  consume/rebind/revoke。
- 旧 SQLite 只读封存，不删除；任何差异都保持 capability false。
- term/version、renew/revoke operation 与 audit 必须在同一个 PostgreSQL 事务内；两个独立
  连接的并发测试必须证明只有一次成功。

## 卡密安全 release blocker

以下项目全部完成前，不得开启 annual capability 或 production offering：

1. 升级 `next=14.0.0` 到仍受支持的安全版本；使用 npm 官方源执行
   `npm audit --omit=dev`，high/critical 必须为 0，并回归所有 admin/API 路由。
2. 取消卡密明文主存储：
   - `codeLookupDigest=HMAC-SHA256(pepper, canonicalCode)` 唯一查询；
   - `codeCiphertext=AES-256-GCM`，密钥在 DB/备份之外，带 `kid` 可轮换；
   - 新码原文只在生成/首次履约响应显示一次；后台列表、搜索、审计、日志、CSV、错误只用
     掩码或 digest；
   - idempotent fulfillment 如必须重放原 code，只能在最小 scope 下解密返回；
   - 迁移用双读/回填/核对/切单写，不能重发或改变已有内测码。
3. public license API 增加持久化 IP/global/失败摘要限流；可信代理边界明确。外部伪造
   `X-Forwarded-For` 不得绕过限流/白名单。
4. 只接受 JSON；限制 body（建议 ≤16 KiB）及 `projectKey/code/machineId/nonce/requestId`
   长度与字符集；拒绝未知字段和超长输入。
5. production 缺失/解析失败 `LICENSE_SIGNING_PRIVATE_KEY` 时启动失败或 readiness/
   signedLicenseV2=false；不得继续返回未签名响应。现有 Ed25519 公钥已内嵌客户端，禁止
   擅自重新生成替换；先做 `kid` + 双钥轮换协议。
6. 管理会话补 `iss/aud/jti`、撤销与密钥轮换；敏感 secret 不以数据库明文作为长期方案。
   管理写请求校验 Origin/Host/Sec-Fetch-Site；cookie 保持 HttpOnly/Secure/SameSite。
7. 添加 HSTS、CSP、`X-Content-Type-Options`、frame 限制；后台和敏感 API `no-store`。
8. 数据库与备份加密、最小权限和恢复演练；自动扫描日志/导出/错误中不得出现完整
   activation code、JWT、签名私钥、capability token。

## 必测攻击与故障向量

- 随机猜码、有效/无效码枚举、超长 JSON、错误 content-type、分布式/伪造 XFF 限流绕过。
- DB dump/备份只得到 digest+ciphertext，拿不到密钥时不能恢复卡密。
- admin list/export/audit/error/log 全链扫描无完整卡密。
- Next middleware 绕过 header、未登录直接访问每个 admin API、CSRF、旧 JWT、密钥轮换。
- 签名私钥缺失/错误、nonce/replay/date 偏移、revoked 快照覆盖客户端旧 active 状态。
- annual provision/activate 重放；renew/revoke 各重放 10 次；两个连接 CAS 并发；
  process kill 在事务/响应前后；重启 lookup-first。
- `GateOperationAuthorization` 过期、重放、错误 audience/action/lineage/order/gate version/
  internal key digest 全部拒绝且不改 term。
- SQLite→PostgreSQL 前后旧 beta/perpetual/COUNT/TRIAL 行为一致。

## 完成定义

- `npm run quality:gate` 全绿；新增安全/迁移/annual contract tests 全绿。
- npm 官方源 production audit high=0、critical=0。
- 真实 PostgreSQL 双连接并发、迁移演练与重启恢复通过。
- staging 与打包 CreatorOS 完成：首购→激活→续费→撤期→revoked 覆盖的真实 E2E。
- production readiness 在任一 migration/key/vector 不绿时对应 capability=false。
- 输出一份安全验收报告，只写 key ID/digest，不贴任何卡密、JWT、私钥或完整 token。
- 最后回传：commit、测试命令/结果、迁移证据、staging E2E、剩余风险；不要只回复“已完成”。
