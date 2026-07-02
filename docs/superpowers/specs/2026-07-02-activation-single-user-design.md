# 激活码授权 + 本机单用户模式（去登录）设计

> 状态：待审（spec-review gate）。改认证架构 —— 过审（verdict≠FAIL）才准开工。
> 需求原文（用户 2026-07-02）：「这个项目不需要登录的功能。这项目是激活码去验证的。只要授权了，就安装到客户的本机上，然后他自己去设置他用户名、设置他邮箱、设置他的抖音的那个二维码去扫码。登录了可以去掉。」

## 1. 背景与目标

CreatorOS 的交付形态是**单机部署**：一套完整栈（Next.js + Postgres + MinIO）安装在客户本机，一机一个创作者。当前的 email+password 登录是多租户 SaaS 的残留，对单机产品是纯摩擦（客户不该在自己机器上"登录自己"），且真机已两次因登录页产生卡点（按钮灰、原生提交刷新）。

**目标**：
1. 去掉登录/注册流程；打开应用即用（已授权前提下）。
2. 授权 = **激活码**：安装后首次打开输入激活码 → 验证通过 → 本机永久激活。
3. 首次初始化向导：客户自设显示名、邮箱 → 引导抖音扫码绑定（复用 T-032 绑定卡）。
4. 数据模型**不动**：`user_id` 架构保留，激活后系统操作唯一本机用户。

**非目标（本 SPEC 明确不做）**：
- 不做在线授权服务器（预留接口；未来与「提示词服务端」T-040 远景一起做）。
- 不做多用户/团队模式（宪法 §2 允许小团队，但单机 v1 一机一号；未来多号是另一 SPEC）。
- 不做防破解硬化（见 §3 威胁模型）。
- 不删 identity/session 后端模块代码（保留为内部机制，见 §5 方案 A）。

## 2. 激活码设计

**离线验签**（无服务器依赖，适合单机安装）：

- 激活码 = `CROS-<base64url(payload)>.<base64url(signature)>`
- payload（JSON）：`{ licenseId, customer, issuedAt, expiresAt | null }`（null = 永久）
- 签名：**Ed25519**（Node 内置 `crypto.sign/verify`，零新依赖）
- **公钥**内置应用（env `ACTIVATION_PUBLIC_KEY`，构建时注入或部署配置）；**私钥仅签发方持有，绝不进 repo/客户机**
- 签发工具：`scripts/license/generate-license.mjs`（读私钥文件 → 出激活码）与 `generate-keypair.mjs`（一次性生成密钥对）

**激活状态**：新表 `app_activation`（单行语义）：

```sql
CREATE TABLE app_activation (
  id TEXT PRIMARY KEY,            -- 'singleton'
  license_id TEXT NOT NULL,
  customer TEXT NOT NULL,
  activation_code TEXT NOT NULL,  -- 原文（重验/展示用）
  issued_at TEXT NOT NULL,
  expires_at TEXT,                -- null = 永久
  activated_at TEXT NOT NULL,
  bound_user_id TEXT NOT NULL REFERENCES users(id)
);
```

启动/请求时判定「已激活」= 表中 singleton 行存在且（expires_at 为 null 或 > now）。**过期行为**：守卫弹回 /activate 显示「授权已过期」+ 重新输码；数据不删。

## 3. 威胁模型（诚实边界）

单机产品里，客户拥有整台机器 —— **任何本地校验都可被有能力者绕过**（改代码/改库）。激活码的目的：
- ✅ 防随意复制传播（码与客户标识绑定，泄露可追溯）
- ✅ 商务上「先授权后使用」的正式凭证
- ❌ 不防定向破解（不做加壳/混淆/机器指纹；要更强绑定是未来在线校验的事）

## 4. 用户流程

```
首次打开 → /activate 输入激活码 → 验签通过
  → /setup 初始化向导：显示名 + 邮箱（写唯一本机用户）
  → 完成页：引导去 设置→账户 抖音扫码绑定（可跳过，稍后设置）
  → 进入首页。此后打开即用，无任何登录。
```

- 已激活 + 已初始化：任何路径直接放行。
- 已激活 + 未初始化（异常中断）：弹 /setup 续走。
- 未激活：一切页面弹 /activate（API 返 401 家族错误码 `NotActivated`）。

## 5. 技术方案：auto-session（最小刀）

现状：全部 API/dispatch 依赖 session cookie → `RequestContext(userId)`；middleware 按 session 守卫页面。

**方案 A（选定）：保留 session 机制为内部实现，middleware 自动建会话。**
- middleware（或 `/api/v1/auth/bootstrap` 内部 route）逻辑：
  1. 未激活 → redirect /activate（API：401 NotActivated）
  2. 已激活且请求无有效 session → **自动为 `bound_user_id` 创建 session 并 Set-Cookie**（auto-login），继续放行
  3. 有有效 session → 放行（现行为）
- 下游（全部 route/dispatch/RequestContext/repository 的 user_id 隔离）**零改动**。
- /login、/register 页面与入口删除；`POST /api/v1/auth/login`、`/register` route 下线（410 或直接删文件）；`/logout` 下线（单机无登出概念）；`/me` 保留（读当前用户）。
- 密码字段：users 表不动（列留着，不再用）；`/setup` 建用户走 identity service 现有创建路径，密码生成随机值弃用。

**方案 B（弃）：全面去 session** —— 每个入口改读唯一用户。动面大（几十个 route + dispatch + 测试全动），收益仅是"纯"；违背最小改动。

**dev/测试体验**：
- `ACTIVATION_MODE=dev-bypass`（dev 默认;.env.example 注明）：视为已激活并绑定 seed 用户 `user-zyongzhu`，一切照旧 —— 开发/CI/现有 336+ server 测试零破坏。
- 集成测试新增 activation 判定 + auto-session 用例；PGlite 迁移照常走 drizzle（新迁移 0015）。

## 6. 契约与模块

- 新 backend 模块 `activation`：`activation.repository`（singleton CRUD）+ `activation.service`（`verifyActivationCode` 纯函数：解析/验签/过期判定；`activate` 事务：验码 → 建/绑用户 → 写 singleton；`getStatus`）。
- contract ops：`activation.status.get`（{ activated, customer?, expiresAt?, needsSetup }）、`activation.activate`（body { code }）、`activation.setup`（body { displayName, email }，幂等完成初始化）。
- 前端：`/activate` 页（输码 + 错误态：格式错/验签失败/已过期）、`/setup` 页（两字段 + 完成引导卡）。均为无 session 可达页。

## 7. 迁移与兼容

- 既有本机数据（user-zyongzhu 的全部项目/作品/指标）：`/setup` 时若库中已存在用户（dev 升级场景），**绑定既有用户而非新建**（按 email 匹配或取唯一 user 行），数据无缝续用。
- 现有 login/register 组件测试删除；middleware 测试改写为激活态矩阵（未激活/已激活未初始化/已激活已初始化 × 页面/API）。
- 宪法补注（过审后）：§新增「交付形态：单机部署，激活码授权，一机一创作者」。

## 8. 验收标准

1. 全新库（未激活）：访问任意页 → /activate；输错码显式错误；输对码 → /setup → 填两字段 → 首页。**全程无登录页。**
2. 重启 dev server / 重开浏览器（清 cookie）：直接进首页（auto-session 生效），不再询问任何凭据。
3. 过期码：激活被拒并提示；已激活但过期（改库模拟）：弹回 /activate 过期态。
4. `pnpm verify`（tsc + 全测）绿；既有 server 测试在 dev-bypass 下零回归。
5. 激活码签发脚本：`generate-keypair` + `generate-license --customer X` 出的码能在 UI 激活成功；篡改一位后验签失败。

## 9. 拆片（过审后进 BACKLOG）

- **T-045a** activation 后端纵切：Ed25519 验签纯函数 + 迁移 0015 + repository/service + 3 个 contract op + transport/装配 + 签发脚本 + 单测（验签/过期/幂等/绑定既有用户）。
- **T-045b** 守卫与页面：middleware 激活态守卫 + auto-session + `/activate`、`/setup` 页 + dev-bypass 接线 + 组件测试。
- **T-045c** 登录下线与端到端：删 /login /register 页与 route + 测试迁移 + 验收标准 1-5 真机走查（截图）+ 宪法补注。
