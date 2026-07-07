# CreatorOS 桌面激活授权接入指南(T-147 P5)

> 一机一码激活门,接已上线的 **activation-manager**(`https://license.aitongban.cloud`)。
> 只影响**桌面壳**(Tauri);web/dev 完全不受激活门影响。
> 设计与 API 契约详见 SPEC:`docs/superpowers/specs/2026-07-06-p5-activation-gate-design.md`。

## 1. 一次性:在 activation-manager 后台建项目

**接入前必须先建项目**,否则所有激活/校验请求返 HTTP 400「项目不存在: test」(源码坐实:`resolveProject` 对未知/停用 projectKey 抛错)。

1. 登录后台 `https://license.aitongban.cloud/admin`(凭据见部署文档,不落此处)。
2. 新建项目,`projectKey` 填 **`test`**(CreatorOS 客户端默认认这个;可用 env 改)。
3. 为该项目生成**时间型(TIME)**激活码:设有效天数 `validDays`(年卡 = 365),`cardType` 可标「年卡」。
4. 把激活码发给最终用户。**测试激活码绝不提交进 git**(用 `.env.local` / 手动输入)。

## 2. 配置(env,均有默认)

集中读取点:`frontend/src/server/activation/activation-config.ts`。`.env.example` 已列(桌面壳里 `CREATOROS_DESKTOP=1` 由 Rust 运行时注入,无需手配):

| env | 默认 | 说明 |
|---|---|---|
| `CREATOROS_LICENSE_BASE_URL` | `https://license.aitongban.cloud` | 授权服务地址 |
| `CREATOROS_LICENSE_PROJECT_KEY` | `test` | 项目标识(须先在后台建过) |
| `CREATOROS_ACTIVATION_GRACE_DAYS` | `7` | 离线宽限天数 |
| `CREATOROS_MACHINE_ID` | (Rust 注入) | 机器指纹;桌面壳自动注入,手动测可覆盖 |
| `CREATOROS_TEST_CODE` | — | **仅 `.env.local`** 的本地测试激活码,绝不提交 |

## 3. 机器指纹(machineId)

- **桌面壳(最稳)**:Rust 侧 `resolve_machine_id`(`src-tauri/src/lib.rs`)组合**平台稳定机器标识**(`machine-uid`:macOS IOPlatformUUID / Windows MachineGuid / Linux `/etc/machine-id`)+ **本机持久 UUID**(`<appDataDir>/machine-id`,首启随机生成)→ SHA-256 前 32 位 → 注入 env `CREATOROS_MACHINE_ID`。
- **回退(web/dev / 未注入)**:node 侧 `resolveMachineId`(`frontend/src/server/activation/machine-id.ts`)落盘一个持久 UUID(`<CREATOROS_DB_DIR 父目录>/machine-id`),同机稳定。
- **诚实**:machineId 由客户端上报,可伪造 —— 所有软件授权的固有限制。多因子 + 持久化尽力稳,不宣称防伪造。

## 4. 激活流程 & 状态机

落点:`frontend/src/server/activation/activation-service.ts`(纯状态机,注入 license 客户端 + repo + clock)。

- **未激活** → `(creator)/layout` gate 弹到 `/activate` 输码 → `POST /api/v1/activate` → service.activate() → 调 activation-manager `/api/license/activate`(`projectKey` + machineId + code)→ TIME 成功则绑本机、起算 `expiresAt`、**加密存**本地激活态(`activation_state` 表,`code` 列用 P2 的 `encryptSecret` 落密文)。
- **已激活** → 启动 gate 复校:先看本地 `expiresAt`;未过期则在线 `POST /api/license/status`;在线 `valid=true` → 放行并刷新;`valid=false`(吊销/过期)→ 回激活界面。
- **离线宽限**:在线校**网络不可达**时,本地未过期 **且** 距上次在线校 ≤ `graceDays` → 放行(`grace`);超窗 → 回激活界面强制联网。
- **到期/无效** → `/activate` 显示「授权已过期」,本地激活态不删(可重输码)。

## 5. 门控:桌面拦 / web 跳

- **桌面运行时标记**:Rust `lib.rs` spawn sidecar 时注入 `.env("CREATOROS_DESKTOP", "1")`;node 侧 `isDesktopRuntime()`(`frontend/src/server/activation/is-desktop.ts`)读它。
- **gate 落点**:`frontend/src/app/(creator)/layout.tsx`,在 session 解析后 `if (!(await isActivationAllowed())) redirect("/activate")`。
- **web/dev 硬短路**:`isActivationAllowed`(`frontend/src/lib/activation-gate.server.ts`)在 `isDesktopRuntime` 为 false 时**立即返回 true**,连激活 service 都不触碰(不联网、不读激活态)—— web 绝不被卡。

## 6. 怎么测

### 6.1 单测(不联网)

```bash
pnpm -C frontend vitest run src/server/activation src/lib/activation-gate.server.test.ts
```

覆盖:license 契约映射 / 状态机四态 + 离线宽限窗 / 加密存取(真 pglite)/ 机器指纹持久化 / 门控桌面拦 web 跳。**license 客户端全注桩,零网络**。

### 6.2 本地联网 CLI(手动)

```bash
# 打印本机机器指纹(node 回退版)
pnpm -C frontend desktop:activation machine-id

# 查某码在本机的授权状态(不改库)—— code 从 --code / CREATOROS_TEST_CODE 读,绝不写死
pnpm -C frontend desktop:activation status --code <你的激活码>

# 激活(TIME 绑本机 + 起算 expiresAt)—— 真会绑定设备
pnpm -C frontend desktop:activation activate --code <你的激活码>
```

### 6.3 真机 Tauri 壳(端到端,真机待验)

1. `pnpm -C frontend desktop:package` 出桌面壳。
2. 打开桌面壳(`CREATOROS_DESKTOP=1` 自动注入)→ 未激活应弹激活界面。
3. 输入后台生成的年卡码 → 绑本机 → 进主应用。
4. 重启壳:在线 status 成功直接进;断网重启:宽限窗内进、超窗回激活界面。

## 7. 加固边界(诚实)

- **响应无密码学签名(服务端不支持)**:已读 activation-manager 源码坐实,`/api/license/*` 与 `/api/verify` 的响应体**无任何 signature/sig/token 字段**;客户端**只能校布尔值**(`success`/`valid`)+ HTTPS 传输。可改 hosts / 起假服务端返回 `{success:true}` 绕过 —— 这是所有单机授权对拥有整机的攻击者的固有弱点,非本实现缺陷。
- **Ed25519 强验签 = P5+**:需 activation-manager 服务端**先加签名能力**(授权结果私钥签名 + 客户端内置公钥验签),客户端才能做。**当前未做,不假装**;客户端未内置验签(如实标注)。
- 现阶段真正的防线是**商业层**:一机一码 + 后台可吊销/统计 + 码泄露可追溯。
- machineId 可伪造(§3);离线宽限(§4)是可用性与防盗版的折中,窗越大越宽松。

## 8. reset 与激活态

`pnpm db:reset` **保留** `activation_state`(已加进 `backend/scripts/reset-db.ts` 的 PRESERVE Set)——清库不清激活,免每次测试重激活。要强制重激活:`DELETE FROM activation_state;` 或删本地 `machine-id` 文件换机器身份。
