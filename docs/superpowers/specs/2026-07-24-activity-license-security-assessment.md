# Thirdspace-activity 卡密系统安全核查

> 核查日期：2026-07-24  
> 核查方式：源码审阅、生产端点只读探测、全量测试、npm 官方源依赖审计  
> 结论：**具备安全基础，但尚未达到正式付费年卡的 production security gate**

## 大白话结论

当前系统不是“随便猜一个码就能破”的水平。激活码由密码学随机数生成，随机猜中 128 位码在
现实中不可行；管理员密码使用 bcrypt；CreatorOS 默认强制验证 activity 的 Ed25519 响应签名；
生产 `status` 端点实测也已返回签名、摘要和 `no-store`。

但“码很难猜”不等于系统不会被攻破。现状仍存在数据库泄漏后全量卡密暴露、公开接口被刷、
依赖漏洞、配置漂移导致未签名响应继续服务等入口。因此不能对外承诺“不会被攻破”，也不能在
这些 release blocker 关闭前开放正式年卡销售。

## 已有保障

| 防线 | 证据 | 判定 |
|---|---|---|
| 卡密随机性 | `license-generation-service.ts` 使用 `crypto.randomBytes(8)`，即 128 bit | 随机暴力猜码现实不可行 |
| 管理员密码 | `Admin.password` 为 bcrypt hash；登录用 `bcrypt.compare` | 基础合格 |
| 登录限流 | Prisma 持久化失败次数，默认 15 分钟 5 次 | 基础合格，但代理 IP 信任仍需收紧 |
| 响应防伪 | activity Ed25519 签名；CreatorOS 默认 `strict_verify=true` | 生产端点实测签名存在 |
| 本地快照 | CreatorOS `.license` 使用 AES-256-GCM，含 nonce、服务端时间、回拨检测和离线宽限 | 能防普通文件篡改 |
| 撤权与幂等 | 现有 order grant revoke、consume requestId、并发约束有测试 | 363 项测试全绿 |
| 容器权限 | entrypoint 从 root 降权到指定 UID/GID 后启动 | 合格 |

## 正式商用阻断项

### BLOCKER-SEC-01 生产依赖存在 critical/high 漏洞

`package.json` 固定 `next=14.0.0`。使用 npm 官方源审计得到 1 个 critical、1 个 high
production dependency vulnerability；其中包含 Next middleware authorization bypass。
必须升级到仍受支持且审计无 high/critical 的版本，并完成后台路由与页面回归。

### BLOCKER-SEC-02 卡密明文存库并可由后台列表完整读出

`ActivationCode.code String @unique` 保存原文，后台 list/generate/cleanup 等路径也处理完整
code。数据库、备份、管理员 session 或导出链一旦泄漏，攻击者可直接取得全部有效卡密。

目标形态：

- `codeLookupDigest=HMAC-SHA256(pepper, canonicalCode)` 用于唯一查询；
- `codeCiphertext=AES-256-GCM(key outside DB)` 只为授权履约幂等重放/必要恢复；
- 新码原文只在生成或首次履约响应中显示一次；后台列表、审计、日志和导出只显示掩码；
- pepper/encryption key 放 secret manager/env，支持 `kid` 与轮换，不能与数据库一起备份。

### BLOCKER-SEC-03 公开激活接口缺少持久化反滥用门

`/api/license/activate|status|consume|verify` 直接读取 JSON 并查库，没有持久化 IP/global
限流、body 大小、字段长度和 content-type gate。128 位码能防猜中，不能防数据库/CPU/日志
DoS，也不能防拿到泄漏码后的批量试用。

必须增加可信代理解析、IP/global 令牌桶、失败摘要限流、请求体上限、字段闭集与长度限制；
429 必须稳定且不泄露码是否存在。

### BLOCKER-SEC-04 签名配置仍是 fail-open

当前 `LICENSE_SIGNING_PRIVATE_KEY` 缺失时，服务端只 warn 并返回未签名响应。虽然生产端点
2026-07-24 实测已签名，但一次错误部署仍会退回弱响应。production 必须启动失败或 capability
false；不能把安全性寄托在运维永远不犯错。

### BLOCKER-SEC-05 年卡 CAS/续费尚未在 PostgreSQL 落地

现状 SQLite 不能作为正式年卡期限 CAS、跨连接并发与迁移恢复的生产依据。用户已确认迁
PostgreSQL；迁移、行数/稳定键摘要核对及旧码回归未完成前，annual capability 必须关闭。

## 主要加固项

- 只信任指定反向代理写入的 client IP；外部 `X-Forwarded-For` 必须被覆盖或拒绝。
- JWT 增加 `iss/aud/jti`、会话撤销和密钥轮换；敏感密钥不继续以数据库明文作为常态存储。
- 管理写接口验证 `Origin/Host/Sec-Fetch-Site`，不要只依赖 SameSite cookie。
- 补 HSTS、CSP、`X-Content-Type-Options`、frame 限制与敏感页面 `no-store`。
- 数据库/备份加密、最小权限、恢复演练；日志做卡密/令牌扫描。
- Ed25519 增加 `kid` 与双钥轮换窗口；现有客户端公钥仍在使用时禁止擅自重生成替换。
- 上线前做一次独立渗透测试：认证绕过、限流绕过、重放、并发、数据库泄漏半径和客户端篡改。

## “会不会被攻破”的边界

任何卡密系统都不能保证绝对不被攻破。尤其桌面软件运行在用户控制的机器上，攻击者可以修改
二进制、hook 校验函数或窃取已激活机器的本地状态。可实现的目标是：

1. 不能靠猜码、伪造服务端响应或改本地文件轻易绕过；
2. 单点泄漏不暴露全部卡密；
3. 被盗码可发现、限速、撤权和审计；
4. 服务被打或跨系统超时时不多发权益、不多续期、不误报成功；
5. 漏洞、密钥轮换和事故都有可演练的恢复路径。

达到上述目标后可以称为“具备正式商用防护”，仍不能称为“绝对攻不破”。

## 本次验证

```text
activity npm test: 363 passed, 0 failed
production status probe: HTTP 404 + X-License-Signature/X-License-Date/X-License-Digest + no-store
npm audit --omit=dev --registry=https://registry.npmjs.org:
  critical=1, high=1, total=2
```

测试全绿只证明现有行为符合当前测试，不抵消上述安全缺口。
