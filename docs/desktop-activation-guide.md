# CreatorOS 桌面激活授权接入指南(T-147 P5)

> 一机一码激活门,接已上线的 **activation-manager**(`https://license.aitongban.cloud`)。
> 只影响**桌面壳**(Tauri);web/dev 完全不受激活门影响。
> 设计与 API 契约详见 SPEC:`docs/superpowers/specs/2026-07-06-p5-activation-gate-design.md`。

## 1. 商品与项目身份

CreatorOS 正式商品统一在 Growth 创建，`projectKey` 固定为 **`creatoros`**；Growth 按已签名合同把
商品身份同步到 Activity。运营人员不得登录 Activity 为 CreatorOS 手工创建 `test/default` 项目，也不得
通过运行时环境变量把正式安装包切到另一个产品。

1. 在 Growth 创建或选择 CreatorOS 商品，并确认返回的 `projectKey` exact 为 `creatoros`。
2. 由 Growth 的正式流程生成和交付授权；Activity 仅作为下游授权服务，不作为运营配置入口。
3. 测试激活码绝不提交进 git，只能通过 `.env.local` 或手动输入用于本地 debug 验证。

## 2. 配置(env,均有默认)

集中读取点:`frontend/src/server/activation/activation-config.ts`。`.env.example` 已列(桌面壳里 `CREATOROS_DESKTOP=1` 由 Rust 运行时注入,无需手配):

| env | 默认 | 说明 |
|---|---|---|
| `CREATOROS_LICENSE_BASE_URL` | `https://license.aitongban.cloud` | 授权服务地址 |
| `CREATOROS_LICENSE_PROJECT_KEY` | 正式包编译期固定 `creatoros` | 仅 debug/`tauri dev` 可显式使用本地 key；可分发包运行时不可覆盖 |
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

- **正式响应严格验签**：可分发包内置受信公钥，对 Activity 返回的授权事实执行 Ed25519 严格验签；
  缺签名、坏签名、过期、请求绑定或项目身份不一致都 fail-closed，运行时环境变量不能关闭。
- **客户端边界**：本机所有者仍可能 patch 二进制、attach debugger 或 dump 运行时内存；当前签名链
  保证未持有服务端私钥的一方不能仅靠伪造 HTTP 布尔响应获得可信授权，不宣称抵抗对客户端自身的
  任意修改。
- **服务端终判**：付费模型请求仍由 Growth/中转站执行服务端授权与额度终判，本地 verdict 不替代它。
- machineId 可伪造(§3);离线宽限(§4)是可用性与防盗版的折中,窗越大越宽松。

## 8. reset 与激活态

`pnpm db:reset` **保留** `activation_state`(已加进 `backend/scripts/reset-db.ts` 的 PRESERVE Set)——清库不清激活,免每次测试重激活。要强制重激活:`DELETE FROM activation_state;` 或删本地 `machine-id` 文件换机器身份。
