# T-147 P5 桌面激活授权接入设计（接 activation-manager 一机一码）

> 状态：**实现 SPEC**（桌面化总纲 `2026-07-05-desktop-app-architecture-overview.md` P5 子项的落地细化）。
> 不改产品方向/数据归属（复用**已批准**的桌面化总纲 + **已上线**的 activation-manager），属加固实现层 → 不重过 spec-review gate。
> 前置真值：产品定位（单机部署，一机一创作者）不变；本 SPEC 只在**桌面壳**加一道激活门，web/dev 完全不受影响。
> 需求来源：用户 2026-07-06「接已上线的 activation-manager，给桌面端做一机一码激活门」。

## 1. 背景与目标

CreatorOS 桌面壳（T-147 P1 Tauri v2 + Node sidecar）交付给客户后，需要一道**商业授权门**：未激活不让进主应用；一机一码，时间型年卡到期回激活界面。授权引擎**复用已部署上线**的 `activation-manager`（`https://license.aitongban.cloud`，一机一码 TIME/COUNT + 后台管理/吊销/统计）。

**目标**：
1. **机器指纹**（machineId）：多因子硬件指纹，本机持久化，同设备稳定、跨设备唯一。
2. **激活流程**：未激活 → 激活界面（输码）→ 调 activation-manager `/api/license/activate`（`projectKey=test` + machineId + code）→ TIME 绑设备 + 记 `expiresAt` → 加密存本地激活态（复用 P2）。已激活 → 启动校验（在线校 `status` + 离线宽限）。到期/无效 → 回激活界面。
3. **门控落点**：桌面壳启动时校激活；**web/dev 环境跳过激活门**（只桌面这道门），别把 web 卡死。
4. **加固边界（诚实）**：见 §5。
5. **配置集中 + 文档 + 脚本**：projectKey / 服务地址集中可配；写「怎么测/怎么配」文档。

**非目标**：
- 不做 COUNT 次数型（CreatorOS 是时间型年卡；consume 路径不接入）。
- 不做在线授权服务器（activation-manager 已是它）。
- 不做防逆向硬化（P6）；不做自建离线 Ed25519 签发（旧 T-045 路线，已被在线服务替代；只吸收其诚实边界）。

## 2. activation-manager API 契约（源码核准，非文档猜测）

**Base URL**：`https://license.aitongban.cloud`。全部 `POST` JSON，请求字段 camelCase/snake_case 均接受。

### 2.1 请求字段（四接口共用，`license-api.ts:normalizeLicenseRequestPayload`）

| 字段 | 别名 | 必填 | CreatorOS 用途 |
|---|---|---|---|
| `code` | — | ✅ | 激活码 |
| `machineId` | `machine_id` | ✅ | 本机硬件指纹 |
| `projectKey` | `project_key` | 缺省 `default` | 固定 `test` |
| `requestId` | `request_id` | consume 幂等（不用） | — |

### 2.2 用到的两个接口

- **`POST /api/license/activate`**：首次激活。TIME 卡：绑 `usedBy=machineId`，`expiresAt = now + validDays*24h` 起算写库；成功 `{success:true, valid:!isExpired, licenseMode:"TIME", expiresAt, isActivated:true}`；同机重复激活幂等；过期 `{success:false, message:"激活码已过期", status:400}`；被他机绑 `{success:false, message:"激活码已被其他设备使用", status:400}`；码不存在 404；`projectKey=test` 项目未建/停用 → catch 成 400 `message:"项目不存在: test"`。
- **`POST /api/license/status`**：查状态**不改库**。`{success:true, valid, licenseMode, expiresAt, isActivated, remainingCount}`。TIME 的 `valid = !isUsed || !isExpired`。用于**已激活后的启动在线复校**。

响应 wire 形状（非 legacy）同时含 snake + camel 双份；HTTP status = 业务 status。**关键权威字段：`success` + `valid`（布尔）+ `expiresAt`（ISO string|null）**。

### 2.3 一机一码 & TIME 到期

- 约束：Prisma `@@unique([projectId, usedBy])`。换 machineId 默认拒（"已被其他设备使用"），除非后台给码开 `allowAutoRebind`。
- 到期字段：`expiresAt`（服务端 = `usedAt + validDays`）。客户端以 `expiresAt` 为准。

### 2.4 projectKey 前置条件

`resolveProject` 对未知/停用 projectKey **抛错 → HTTP 400**。**接入前必须在 activation-manager 后台先建 `projectKey=test` 项目并保持启用**，否则所有请求 400。（文档 §配置会写清。）

## 3. 机器指纹（machineId）

多因子硬件指纹，本机持久化，同设备稳定：

- **首选（桌面 Rust 侧最稳）**：Tauri 壳启动时，Rust 取平台稳定机器标识（macOS `IOPlatformUUID` / Windows `MachineGuid`）+ 落盘一个持久 UUID（`<appDataDir>/machine-id`，首启随机生成、后续复用），二者组合 SHA-256 → 注入 sidecar env `CREATOROS_MACHINE_ID`。node 侧直接读该 env。
- **回退（Rust 未注入 / 非桌面）**：node 侧 `resolveMachineId()` 落盘一个持久文件（`<CREATOROS_DB_DIR 同级>/machine-id`）存随机 UUID；同机稳定。
- **诚实**：machineId 由客户端上报，可伪造——这是所有软件授权的固有限制（文档 §5.2 已注）；多因子 + 持久化尽力稳，不宣称防伪造。

## 4. 激活状态机 + 门控

### 4.1 状态机（`activation.service` 纯逻辑，可单测）

状态：`未激活(inactive)` / `已激活有效(active)` / `已激活离线宽限(grace)` / `到期或无效(expired)`。

- **inactive → active**：输码 → `activate` 成功（`success && valid`）→ 加密存激活态（machineId、加密 code、licenseMode、expiresAt、activatedAt、lastOnlineCheckAt）。
- **启动复校（active）**：读本地激活态 → ①先看本地 `expiresAt`，本地已过期 → `expired`（回激活界面）；②未过期 → 尝试在线 `status`：
  - 在线成功 `valid=true` → `active`，刷新 `lastOnlineCheckAt` + `expiresAt`（服务端为准）。
  - 在线成功 `valid=false`（吊销/服务端判过期） → `expired`。
  - **在线失败（网络不可达）→ 离线宽限**：本地 `expiresAt` 未过 **且** `now - lastOnlineCheckAt <= GRACE_DAYS`（默认 7 天，可配）→ `grace`（放行）；超过宽限窗 → `expired`（强制回激活界面重新联网校）。
- **any → expired**：到期/无效 → 门控弹回激活界面；本地激活态不删（展示"授权已过期"+ 重新输码）。

### 4.2 门控落点（桌面拦 / web 跳）

- **桌面运行时标记**：现无运行时信号（`CREATOROS_DESKTOP` 只在 build 期；sidecar 与 web-prod 都是 `NODE_ENV=production` 无法区分）。**新增**：Rust `lib.rs` 注入 `.env("CREATOROS_DESKTOP", "1")`；node 侧 `isDesktopRuntime()` 读它。
- **gate 挂载点**：`frontend/src/app/(creator)/layout.tsx`（现有 session guard 同层，是"进主应用前"的唯一 shell）。加前置分支：
  ```
  if (isDesktopRuntime() && !(await isActivated())) redirect("/activate");
  ```
  `isActivated()` = 走 §4.1 复校得到 active/grace 即 true。
- **web/dev 跳过**：`isDesktopRuntime()` 为 false → 分支不触发，主应用照常 → web 绝不被卡。
- **`/activate` 页**：无 gate 可达（不在 (creator) 段内或 gate 白名单它自己）；输码 + 错误态（格式/激活失败/被他机用/已过期）+ 成功后 redirect 首页。

### 4.3 存储层

新表 `activation_state`（照 `storage_configs` per-user 单例 / 或全局单行；激活按机器 → 用固定 PK `singleton` 全局单行，不带 user_id，参照 `skill_config_overrides` 非 user-scoped 模式）：

```sql
CREATE TABLE IF NOT EXISTS activation_state (
  id TEXT PRIMARY KEY,             -- 恒 'singleton'
  machine_id TEXT NOT NULL,
  code TEXT NOT NULL,              -- enc:v1: 加密（复用 P2 encryptSecret）
  license_mode TEXT NOT NULL,      -- 'TIME'
  project_key TEXT NOT NULL,
  expires_at TEXT,                 -- ISO string; null = 永久
  activated_at TEXT NOT NULL,
  last_online_check_at TEXT NOT NULL
);
```

- **加密**：`code` 列用 P2 的 `encryptSecret(code, masterKey)` 写、`decryptSecret` 读（同 master key，无新基础设施）。
- **reset 保留**：把 `activation_state` 加进 `reset-db.ts` 的 `PRESERVE` Set —— 像 AI key 一样，清库不清激活态（否则每次测试要重激活）。

## 5. Ed25519 强验签：服务端不支持 → 只校布尔（诚实标注）

**已读 activation-manager 源码坐实**：`/api/license/*` 与 `/api/verify` 的响应体（`license-api.ts:buildLicenseResponsePayload` + `license-result-service.ts:LicenseResult`）**没有任何 signature/sig/token 字段**；全仓 `grep signature/Ed25519/nacl/hmac/privateKey` 在 license 流程内**零命中**（唯一 `SignJWT`/HS256 仅用于 admin 后台登录 cookie，与授权响应无交集）。内置 `license-sdk.ts` 的唯一"校验"是 `success===true`，无验签。

**结论（诚实）**：
- 服务端**当前不支持授权结果签名** → CreatorOS 客户端**只能校布尔值**（`success`/`valid`）+ HTTPS 传输安全。
- 文档 §5.2 点名的固有弱点**依然成立**：可改 hosts / 起假服务端返回 `{success:true}` 绕过（本地校验对拥有整机的攻击者不可防，这是所有单机授权的现实，非本实现缺陷）。
- **Ed25519 强验签列为 P5+**：需 activation-manager 服务端**先加签名能力**（授权结果用私钥签名，客户端内置公钥验签），客户端才能做。本 SPEC **不假装做了强验签**；客户端预留 `verifyLicenseSignature` 钩子（当前 no-op + 注释标"服务端加签后启用"），不落假实现。
- 现阶段真正的防线是**商业层**（一机一码 + 后台可吊销/统计 + 码泄露可追溯），非密码学不可绕。

## 6. 配置集中（projectKey / 服务地址）

仓内无 config 目录（env 直读惯例）。新建薄 `frontend/src/server/activation/activation-config.ts` 集中读一遍：

- `CREATOROS_LICENSE_BASE_URL`（默认 `https://license.aitongban.cloud`）
- `CREATOROS_LICENSE_PROJECT_KEY`（默认 `test`）
- `CREATOROS_ACTIVATION_GRACE_DAYS`（默认 7）
- `CREATOROS_MACHINE_ID`（Rust 注入，回退落盘）

`.env.example` 补注这些键；测试激活码 **绝不进 repo/文档**（仅本地 `.env.local` / 手动输入，经 `--code` 参数或 `CREATOROS_TEST_CODE` env）。

## 7. 脚本 + 文档（用户硬要求）

- **脚本** `frontend/scripts/desktop/activation.mjs`：`status`（打印当前激活态）/ `activate --code <code>`（本地 CLI 走一次真激活，联网测试用；code 从参数/env 读，不硬编码）/ `machine-id`（打印本机指纹）。
- **文档** `docs/desktop-activation-guide.md`：怎么在 activation-manager 后台建 `test` 项目、生成年卡码；怎么配 env；怎么本地测（CLI + 真机 Tauri）；离线宽限策略说明；Ed25519 弱点诚实标注。

## 8. TDD 测试面（不真联网）

- **状态机**（`activation.service.test`）：inactive/active/grace/expired 转移；离线宽限窗内放行、超窗拒；本地过期直接 expired；在线 valid=false → expired。用 **fake license 客户端**（注入 activate/status 桩），不真联网。
- **门控**（`(creator)/layout.guard.test`）：桌面态未激活 → redirect /activate；桌面态已激活 → 放行；**web 态（isDesktopRuntime=false）→ 永远放行**（不 redirect）。
- **指纹持久化**：`resolveMachineId` 首次落盘、二次读回同值；Rust env 优先。
- **加密存取**：激活态 code 加密写、解密读（复用 secret-crypto，master key 注入）。
- **契约映射**：activation-manager 响应（snake/camel 双份）→ 内部 `LicenseCheckResult` 归一（校 `success`/`valid`/`expiresAt`）。

## 9. 验收标准

1. web/dev（`pnpm dev`）：激活门不触发，主应用照常（`isDesktopRuntime=false`）。
2. 桌面态未激活：任意页 → /activate；输错码显式错误；输对码 → 加密存激活态 → 首页。
3. 桌面态已激活重启：在线 status 成功 → 直接进；断网 → 宽限窗内进、超窗回激活界面。
4. TIME 年卡到期（改本地 expires_at 模拟）：回激活界面"授权已过期"。
5. `pnpm verify`（相关包 typecheck + 测试）绿；不真联网。
6. **诚实存疑（真机待验）**：①真码端到端（真机 Tauri + 联网 + 后台建 test 项目 + 真年卡码）；②Ed25519 强验签取决于服务端加签（当前 no-op）；③离线宽限窗真机跨天验证。

## 10. 拆片（进 BACKLOG）

- **P5a** 激活后端纵切：`activation-config` + `activation.service`（状态机 + license 客户端 + machineId 归一）+ `activation_state` 表/DDL + 加密存取（复用 P2）+ reset PRESERVE + 单测（状态机/宽限/加密/契约映射，fake client 不联网）。
- **P5b** 门控 + 激活页 + 桌面标记：Rust 注入 `CREATOROS_DESKTOP=1` + `CREATOROS_MACHINE_ID`；node `isDesktopRuntime`/`resolveMachineId`；`(creator)/layout` gate 前置分支；`/activate` 页（输码 + 错误态 + 成功 redirect）；guard 测试（桌面拦/web 跳）。
- **P5c** 脚本 + 文档 + env：`activation.mjs`（status/activate/machine-id）+ `desktop-activation-guide.md` + `.env.example` 补注 + Ed25519 诚实标注。

（P5a→P5b→P5c 一次做完，不分阶段做减法。）
