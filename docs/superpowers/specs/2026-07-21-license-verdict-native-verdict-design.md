# 授权判定原生化 SPEC(license verdict → verdict-bound handshake token)

> 状态:**实现 SPEC**(改架构 + 改信任边界)。**已过 spec-review gate(CONCERNS 已处置,verdict≠FAIL)**——见同名 `.review.md`(2026-07-21)。评审 4 major + 4 minor 均逐条内联处置(下方 `[gate-F1]` ~ `[gate-F8]` 标记)。
> **T-447 已合并进本 SPEC**(评审 OQ-1 建议 + 用户拍板):verdict-bound token 在语义上是 T-447 magic 的严格超集,合并后一次落地不再单开 T-447 实现任务。BACKLOG T-447 标 ✅ 合并至 T-451。
> **必过 spec-review gate**(已过):授权判定的**消费点**从 JS(sidecar/前端读 `.license`)迁到 Rust(handshake token 化);sidecar 端不再能自行说"我有权跑",要么带 Rust 签的 token,要么起不来。
>
> 前置真值:产品定位 PRD([docs/产品定位.md](../产品定位.md),NFR-SECURITY/§16 诚实边界/NFR-PERFORMANCE P95 ≤ 5s/R-DESKTOP 断网条);[T-372 授权加固 SPEC](2026-07-17-license-hardening-and-dual-platform-design.md)(本 SPEC 是其 §18「不防专业逆向」与 §9「Rust 决策链」之下一层——把决策链的**消费点**也搬到 Rust);[打包与防逆向优化调研](../../research/2026-07-21-packaging-and-anti-reversing-optimization-research.md)(用户拍板 D. 全上)+ [红队复测 §2.3](../../research/2026-07-18-desktop-redteam-retest-after-t417-t419.md)(动态旁路实证)。
>
> 需求来源:用户 2026-07-21 拍板"D. 全上"。方案 B(verdict-bound handshake token)由用户 2026-07-21 二次选定,理由:方案 A(gate 改 IPC 反调)只挪了一行,sidecar 仍可 patch;方案 C(每请求同步 IPC)工程量大 ROI 差。
>
> 关系:T-372 已把**决策**搬 Rust(链验签/防重放/防回拨);本 SPEC 补**决策消费**——现在 `.license` 的 `allowed:true` 由 sidecar/前端 JS 一行 `if` 判断(bytenode 也拦不住 patch),须让 JS 层根本读不到 verdict,只能问 Rust 拿"能不能跑的凭证"。

---

## 0. 背景与驱动

**现状复盘(2026-07-21 T-451 SPEC 起手核实):**

- T-372 L2 已把**决策链**(验签/防重放/防回拨/落盘 `.license`)搬进 `license.rs`;决策链输出 `GateDecision`,加密快照 `<appDataDir>/.license`。
- **但决策的消费**仍在 JS:
  - `frontend/src/lib/activation-gate.server.ts:44`:`return verdict.allowed === true;`——一行 JS 判定,bytenode 也拦不住 patch。
  - `frontend/src/server/activation/license-file.server.ts:66-83`:sidecar 用 master key(fd/文件兜底能拿)派生 license 密钥、解密 `.license` → 完全自解自看。
  - 攻击者裸启 sidecar 时把 `.license` + master key 一起拷过去(都在 `<appDataDir>` 里可读)+ 自己 patch `activation-gate` 一行 → 白嫖。
- 红队复测 §2.3 已证:攻击者用随包 node 裸启 sidecar 就能拿运行时解密后的 prompt——handshake token 现在只挡"请求鉴权",不挡"sidecar 起不起得来"。

**方案 B 目标(用户 2026-07-21 拍板):**

- **verdict 判定的最终消费从 sidecar/前端 JS,搬进 Rust 壳**——sidecar 起 sidecar 前 Rust 自己跑决策链,**仅当 `allowed=true` 时才签**一个 verdict-bound handshake token 注入 sidecar。
- **sidecar 拿到 token 才起得来**,拿不到就 fail-closed 拒运行——它连"我有权跑"都自己说不出。
- verdict-bound token 里内嵌 `machineId + expiresAt + nonce + issued_at`,用 Rust 壳内嵌的私钥 Ed25519 签名。sidecar 只**校验签名 + 有效期**,**永不重签、永不生成、永不判定**。私钥仅存 Rust 二进制经 `obfstr` 保护。
- 攻击者绕 Rust 壳裸启 sidecar → 拿不到 verdict-bound token → sidecar fail-closed 拒 → 白嫖失败。
- 攻击者 patch sidecar 里的"校验 token"逻辑 → 已被 T-419 bytenode 保护 + 未来 T-450 完整性抽样兜底。

---

## 1. 现网事实 / 仓内已有实现(带 file:line 证据)

| 断言 | 状态 | 证据 |
|---|---|---|
| Rust 决策链已在 `license.rs` | ✅ 已存在 | `license.rs:1-16 mod doc`;`run_chain_and_persist:1847`(chain_lock/落 .license/广播事件) |
| `GateDecision` 已含 licensed/status/mode/revoked | ✅ 已存在 | `license.rs:188-206` |
| 启动查决策链 | ✅ 已存在 | `lib.rs:940-978 setup 内跑 startup 查`(推断,以 handshake_token 生成位为锚) |
| 每次启动生成 32B nonce handshake token | ✅ 已存在 | `license.rs:2017-2023 gen_handshake_token`(32B hex OsRng);`lib.rs:946 handshake_token = license::gen_handshake_token()` |
| handshake token 注入 sidecar env | ✅ 已存在 | `lib.rs:1082 .env("CREATOROS_SIDECAR_HANDSHAKE_TOKEN", &handshake_token)`(mac 分支);`lib.rs:1185` 同(win/linux 分支) |
| handshake token 注入 WebView 全局 | ✅ 已存在 | `lib.rs:1289-1292 window.__CREATOROS_HANDSHAKE_TOKEN__` |
| **sidecar 侧 `.license` JS 自解自判** | **短板 H1** | `frontend/src/server/activation/license-file.server.ts:66-83 decodeLicenseVerdict`;`lib/activation-gate.server.ts:44 return verdict.allowed === true` |
| **verdict 判定与 handshake token 无绑定** | **短板 H2** | `license.rs:2017-2023 gen_handshake_token`:token 是纯 nonce,与 verdict.allowed 无关;Rust 决策链**未跑或未 allowed** 时仍会签发 token → sidecar 起得来 |
| **前端 activation-gate 有弱验签回退分支** | **短板 H3** | `activation-gate.server.ts:47-52`:strict_verify=0 时回退 `service.check()`(sidecar 状态机)——是 T-372 gate-F2 "L1s 未上线的过渡",但**同时也是攻击者可利用的绕道** |
| Rust 端已内嵌 Ed25519 依赖 | ✅ 已存在 | `Cargo.toml`:`ed25519-dalek=2`;`license.rs:24 use ed25519_dalek::{Signature, Verifier, VerifyingKey}` |
| obfstr 已在 license.rs 使用 | ✅ 已存在 | `license.rs:67 obfstr::obfbytes!(b"creatoros-license-v1")`(可复用同款保护 verdict-token 签名密钥) |

---

## 2. 现成方案调研与选型(≥2 候选 + 采纳/弃用 + ≥2 被否决形态)

**verdict 判定原生化技术方案:**

| 候选 | 采纳/弃用 | 理由 |
|---|---|---|
| **verdict-bound handshake token**(Rust 私钥签 `machineId+expiresAt+nonce+issued_at`;sidecar 只校验签名) | **采纳(用户 2026-07-21 拍板方案 B)** | 一次签名/一次校验(冷启动开销 <1ms);sidecar 自己签不出(无私钥);patch sidecar 校验逻辑受 T-419 bytenode + T-450 抽样兜底;工程 2~3 天 |
| activation-gate 改 IPC 反调 Rust(方案 A) | 弃用 | 只挪一行,sidecar 仍可 patch 把 IPC 返回值写死 true;信任边界没真变;仅收益不足 |
| 每次授权请求同步 IPC 到 Rust(方案 C) | 弃用 | 每请求成本高;需新增 loopback 双向 IPC channel;工程大;ROI 差 |
| 抽 verdict 消费点搬进 Rust 主二进制专用 Tauri command(前端只调命令拿 bool) | 弃用(被否决形态①) | 前端与 sidecar 是两个消费点;沿这条路走会把 activation-gate 拆成 gate.rs 命令 + sidecar 侧的第二套判定,信任边界不干净;方案 B 用 token 一网打尽两处 |
| 把 license 判定改为 Rust 主二进制导出的 napi-rs `.node` 插件(sidecar require 拿 bool) | 弃用(被否决形态②) | 引入 napi-rs 单点;bytenode 无法保护 native binding 接口(`require('license')` 明晃晃)、攻击者 hook binding 就能返回 true;不比 token 强,工程重 |

**verdict-bound token 密码学与传递方案:**

| 候选 | 采纳/弃用 | 理由 |
|---|---|---|
| **Ed25519 签 CBOR/JSON payload,token = base64(payload + sig)** | **采纳** | 已内嵌 `ed25519-dalek`(license.rs 用同库验签服务端响应)零新增依赖;payload 明文(machineId/expiresAt/nonce/issued_at 都不是机密——机密是**签名私钥**);verify 20~50µs |
| HMAC-SHA256 + 共享密钥 | 弃用 | sidecar 需要 verify → 得知道 key → 攻击者 dump sidecar 内存/patch bytenode 可提取;Ed25519 单向,sidecar 只知公钥 |
| AES-256-GCM 加密 token(sidecar 用 master key 解) | 弃用 | 攻击者拿到 `.license` + master key 时能自解 → 又走回老路;签名(而非加密)才是"sidecar 无法伪造"的正确姿势 |
| token 经 env 注入 | 采纳(与现有 handshake_token 同款) | 简单;env 可被 `ps e` 看到,**但看到不等于能伪造**(签名不同=校验不过);机密性靠签名不靠传输 |
| token 经 fd 3 注入(第二个 fd,master key 已占 stdin) | 弃用(过度设计) | env 传"公开可读但不可伪造的字符串"完全够;fd 只对**机密数据**(master key)才需要;引 fd 3 反而增复杂度 |

**被否决的整体形态(≥2):**
- **①「让 sidecar 自己去问 activation server 判 allowed」**(每启动一次在线激活)——被否决:与买断永久离线冲突(SPEC §7/§8 内测 60min / 买断 30d cadence),破 T-372 心跳节奏;网络不通即卡启动,用户体验断崖。
- **②「把整个 sidecar 起 sidecar 前的 gate 挪到 Rust,前端不见 sidecar 直到 verdict.allowed=true」**——被否决:sidecar 承担了 UI 承载/激活页/更新页/激活 IPC 等职责,verdict=false 时前端仍需能进"激活页"这条路径。方案 B 保留 sidecar 起动,只不让"未激活状态"的 sidecar 拿到 verdict-bound token(激活页 route allowlist 免 token,由 layout 层 gate 拦其他路由)。

---

## 3. 威胁模型与边界

**防:**
- **攻击链:攻击者用你随包的 `creatoros-server` 绕 Rust 壳直接跑 sidecar**(2026-07-18 红队复测 §2.1 已实证)——本 SPEC 后 sidecar 起不来(拿不到 verdict-bound token 且 fail-closed)。
- **攻击链:攻击者拷 `.license` + master key 到别机器 + patch 一行 activation-gate 判定 → 白嫖**——本 SPEC 后 sidecar 层不再读 `.license`,gate 判定纯靠 verdict-bound token;patch 判定需先绕 T-419 bytecode + 未来 T-450 抽样。
- **攻击链:攻击者裸启后自签一个 handshake token**——本 SPEC 后 handshake token = verdict-bound(签名),自签的过不了签名校验。

**不防(诚实边界,对齐宪法 §16 line 455):**
- **运行时内存**:sidecar 进程内 verdict.allowed 校验通过后,后续逻辑仍在 JS 内存;attacker attach + dump 仍可看运行状态,但已过起动门,拿不到"未激活跑 sidecar"的能力。
- **patch Rust 壳本身**:攻击者动 `license.rs` 里 verdict 结果或私钥常量,可让所有 token 都签发 → 与 T-372 §18 声明的诚实边界一致(patch Rust 二进制可绕);兜底靠 T-450 完整性抽样把 Rust 壳自身也纳入清单。
- **专业逆向**:非目标(与 T-372/T-449 撤销归档一致)。

**与既有防线的叠加关系(纵深,不放宽):**
- T-372 L2 决策链保留,verdict-bound token 是**判定消费点**的加固,不替代决策。
- T-415 default-deny handshake proxy 保留:token 依然是每请求的 gate(handshake match);verdict-bound 加的是**启动时校验签名**这一步,不动请求层。
- T-419 bytenode 保护 sidecar 侧校验逻辑;T-450 抽样兜底签名密钥 + `.license` 完整性。
- T-425 master key 稳定性对本 SPEC **不再是关键**——master key 只用于 `.license` 加密(Rust 独占写读),sidecar 不再需要读它派生 license key(彻底解耦)。

---

## 4. verdict-bound token 密码学方案

### 4.1 密钥生成与内嵌

- **一次性**在 CI/开发者本机跑 `frontend/scripts/desktop/verdict-keygen.mjs`(新脚本),产 Ed25519 密钥对。
- **私钥**存开发者机器/CI secret,**明文私钥不进 git、不进 CI 制品、不进用户机器磁盘的独立文件**;构建期通过 `env!("CREATOROS_VERDICT_SIGNING_KEY_B64")` 注入 `license.rs`,再用 `obfstr::obfbytes!` 编译期混淆存储(与既有 `license_key_context` 同款保护)——**私钥经混淆后进 Rust 二进制的 rdata 段**,静态 grep/熵扫描扫不到明文,但 attach lldb/gdb dump 内存仍可提取。
- **公钥**内嵌 `frontend/scripts/desktop/build-sidecar.mjs`,构建期烘焙进 sidecar 常量文件 `sidecar/frontend/.next/server/verdict-verify-key.json`(经 rc4 混淆后被 bytecode 化),sidecar 校验时读它。
- **诚实边界**(gate-F2 校准):构建期烘焙常量仍可被逆——但需先脱 rc4 + 逆 bytecode 才能拿到公钥,而拿到公钥**也只是"可以校验"不是"可以签"**,攻击者仍无法伪造 token。**私钥的诚实边界与 T-372 §18/本 SPEC §8「不防专业逆向」一致**——attach + dump 是明确非目标。ac-9 验证的是"静态 grep 拿不到"这一较弱但仍有价值的门槛。

### 4.2 token 结构

```
verdict_token = base64_url(payload_bytes) + "." + base64_url(signature_bytes)

payload_bytes = CBOR({
  "v": 1,
  "machineId": string,     // 与 verdict.machineId 一致
  "expiresAt": iso8601,    // token 有效期(不是 license 有效期)
  "issuedAt": iso8601,
  "nonce": 16B hex,        // 每次启动新 nonce
  "licenseMode": "trial" | "perpetual",
  "sidecarPort": u16,      // 绑定本次 sidecar 端口,防跨端口重放
})

signature_bytes = Ed25519_Sign(privkey, payload_bytes)
```

- **有效期**:默认 24h(比 sidecar 单次进程寿命长即可);token 只用于"启动到 handshake 首次校验"这一小段窗口,不做长期凭证。
- **不含 verdict 全量**:token 说的是"这台机器上 verdict.allowed=true 且 machineId 匹配 且未过期",sidecar 拿到 token = Rust 壳已放行的凭证。
- **绑 sidecarPort**:防"攻击者用另一进程复用 token"——sidecar 校验时对比 `process.env.PORT`,不匹配即拒。

### 4.3 Rust 侧签发逻辑

- `license.rs` 新增 `sign_verdict_token(verdict: &GateDecision, port: u16) -> Option<String>`:
  - 仅当 `verdict.licensed=true` **且** `verdict.updates_blocked=false`(或 mode=trial/perpetual 各自 gate)时签;否则返回 `None`。
  - `lib.rs:946` 附近生成 handshake token 处**改为**先跑一次 verdict,拿到结果后调 `sign_verdict_token`;`None` 时:
    - **激活页路径**:仍启动 sidecar 但注入一个"only-activation-route" 的降级 token(payload.mode="activation-only");前端 layout gate 只放行 `/activate` route,其他 route 一律 redirect。
    - **licensed 路径**:注入完整 verdict-bound token。
- **[gate-F4] 离线/慢网 setup 规则**(reviewer 关切 NFR-PERFORMANCE P95 ≤ 5s + R-DESKTOP 断网):
  - **setup 阶段跑的 verdict 必须是"纯本地路径":直接读 `.license` 快照解密拿 GateDecision(不联网)**。快照存在 → 据此签 token(licensed / activation-only 二选一);快照缺失 → 签 activation-only + 提示"首次激活需联网"。
  - **联网 status 心跳**照旧走异步(既有 `license.rs:991 startup_license_task` 异步 spawn 不动);心跳跑通后更新 `.license` 快照,**下次启动生效**。当前进程持有的 token 不重签(避免"跑到半路 token 掉线"的复杂时序,与 §11 OQ-2 保守方案一致)。
  - 离线首启 + 有效 `.license` 快照 → 签 licensed token,主流程可用(**符合 R-DESKTOP 永久离线可用**)。
  - 离线首启 + 无 `.license` → activation-only(首次装机需联网,产品定位允许)。
  - **验收**:见 ac-10。
- 现有 `CREATOROS_SIDECAR_HANDSHAKE_TOKEN` env **仍保留**(用于 loopback per-request handshake),verdict token 用**另一个 env** `CREATOROS_SIDECAR_VERDICT_TOKEN`,两者正交:
  - handshake token = 每请求"你是不是本地 CreatorOS 前端";
  - verdict token = 启动时"Rust 壳有没有放行你跑起来"。

### 4.4 sidecar 侧校验逻辑

- **落点**:`frontend/instrumentation.ts`(或新增 `frontend/src/server/verdict-token-gate.ts`)在 Next 启动最早期读 `CREATOROS_SIDECAR_VERDICT_TOKEN` + 内嵌公钥常量 verify:
  - 签名不通过 / 过期 / machineId 不匹配 / port 不匹配 → `console.error + process.exit(1)`,**永远不 listen**。
  - `mode=activation-only` → 挂全局 flag `CREATOROS_VERDICT_MODE=activation-only`,proxy.ts 白名单只放行 `/activate/*`(其他 route 强 302 到 /activate)。
- **[gate-F1] `isDesktopRuntime` 门收紧**(reviewer 逮到的最严重绕道):
  - **旧 activation-gate.server.ts:39**:`if (!isDesktopRuntime(env)) return true;`——单看 `CREATOROS_DESKTOP` env,攻击者裸启不设该 env 就立即放行,**verdict-token 校验完全被短路**。这是本 SPEC 声称"挡裸启"的信任边界唯一致命漏。
  - **收紧规则**:sidecar 启动最早期(instrumentation.ts)判定"进入 gate 前必须**先过 verdict-token 硬门**":
    - **打包态签名判据**:`CREATOROS_DESKTOP=1` **且** `CREATOROS_SIDECAR_VERDICT_TOKEN` 存在且 verify 通过——不满足其中任一 → `process.exit(1)`,不 listen。
    - **dev 态豁免**:`NODE_ENV!=="production"` **且** `CREATOROS_DEV_MODE=1`(新 marker,只有本地 `pnpm dev` 脚本注入,不出现在打包版) → 跳过 verdict-token 校验,走 web-style。
  - **原理**:攻击者伪装 web 需要伪装 `NODE_ENV!==production` + `CREATOROS_DEV_MODE=1`——但打包版 Next `server.js` 恒设 `NODE_ENV=production`,而 `CREATOROS_DEV_MODE=1` 从来不出现在**打包产物任何文件**里(仅 `frontend/package.json` 的 dev 脚本运行时注入)。攻击者装的是打包版,他改不了 `server.js` 里 NODE_ENV 常量(它已被 bytecode 保护),即便他自己起 sidecar 也没法把这个绕道走通。
  - `activation-gate.server.ts` 改造:
    ```
    if (process.env.CREATOROS_DEV_MODE === "1" && process.env.NODE_ENV !== "production") return true;
    // 打包态一律要求 verdict-token 已在 instrumentation 校验通过
    return process.env.CREATOROS_VERDICT_MODE === "licensed";
    ```
    删掉旧 `!isDesktopRuntime(env) return true` 分支;旧 `isDesktopRuntime` 函数**保留**给设置页/图标等非 gate 逻辑用,但 gate 判定路径不用它。
  - **验收**:见 ac-1b(reviewer 建议补锚)。
- **加密 `.license` 快照仍保留**(供设置页展示 license 详情/宽限倒计时,不做放行判定),读端从 `activation-gate` 移到"展示副本 route",完全解耦。
- **[gate-F3] activation-only → licensed 过渡**(reviewer 关切,决定首启 UX 成败):
  - **决策(方案 b 优雅重启)**:用户在 /activate 输入激活码 → Tauri IPC 调 `license_activate` → Rust 决策链跑通 verdict.allowed=true → **Rust 壳发起 sidecar graceful restart**(kill 当前 sidecar,签新 verdict-token,重新 spawn),前端显示"授权成功,应用初始化中"loading。
  - **为何不选运行时刷新(方案 a)**:方案 a 需要引入运行时 mode 刷新机制(事件通道刷新 CREATOROS_VERDICT_MODE + proxy.ts 动态改 allowlist),复杂度大且引入新的信任边界模糊点(事件通道可被 patch);首启激活时用户预期本来就是"进主应用"(不像 revoked 场景是运行中扰动),graceful restart 的 loading 语义清晰。
  - 已保存的领域数据不受影响(数据库文件不在 sidecar 进程内存)。用户当前无 UI 状态(激活页本身就是白屏 loading 类)。
  - **验收**:见 ac-6b。

### 4.5 gate-F2 弱验签降级的处置

- `activation-gate.server.ts:47-52` 弱验签回退 `service.check()` 分支 **删除**——不再存在"L1s 未上线的过渡路径",attacker 可利用的绕道消失。
- **[gate-F1 关联]** 同时删除 `activation-gate.server.ts:38-41` 的 `!isDesktopRuntime(env) return true` 分支;所有判定收敛到 `process.env.CREATOROS_VERDICT_MODE`。旧 `isDesktopRuntime` 函数保留给设置页/图标/URL 拼接等**非 gate** 逻辑用。
- 弱验签仅在 Rust 壳内部影响 `verdict.signature_verified=false` 的展示;既有 UI 诚实标注"签名校验未启用"仍显示;但 `verdict.allowed` 仍由决策链的其他检查(mode/expires/revoked)决定,不再回退到 sidecar 状态机。

---

## 5. 影响面 / 改点(file:line 级)

| 落点 | 类型 | 说明 |
|---|---|---|
| `frontend/src-tauri/src/license.rs` | 新增 fn | `sign_verdict_token(&GateDecision, port) -> Option<String>` + `pub const VERDICT_SIGNING_KEY_B64_OBF` (obfstr) |
| `frontend/src-tauri/src/lib.rs:940-978` | 改 setup 顺序 | 先跑 verdict(**纯本地 .license 快照,不联网** —— gate-F4);拿到结果后决定注入哪种 token;联网 status 心跳照旧异步 |
| `frontend/src-tauri/src/lib.rs:1082 / :1185` | 加 env | `.env("CREATOROS_SIDECAR_VERDICT_TOKEN", &verdict_token)` |
| `frontend/src-tauri/src/lib.rs` | 新增 IPC 命令 | **[gate-F3]** `license_activate` 成功回调里触发 sidecar graceful restart(kill + 新签 licensed token + spawn),前端显示 loading |
| `frontend/scripts/desktop/verdict-keygen.mjs` | 新增 | 一次性生成 Ed25519 对(pnpm run desktop:verdict-keygen) |
| `frontend/scripts/desktop/build-sidecar.mjs` | 加烘焙 | 从 env `CREATOROS_VERDICT_PUBKEY_B64` 生成 sidecar 侧公钥常量文件 |
| `frontend/scripts/dev-*.mjs`(或 package.json dev 脚本) | 加 env | **[gate-F1]** 本地 dev 启动时注入 `CREATOROS_DEV_MODE=1`(打包版永不出现该 env) |
| `frontend/instrumentation.ts` 或 新增 `verdict-token-gate.ts` | 新增校验 | 启动最早期 verify;**[gate-F1]** 除 dev-mode marker + NODE_ENV≠production 组合外,一律要求 verdict-token verify 通过 |
| `frontend/src/lib/activation-gate.server.ts` | 重写 | 删 `isDesktopRuntime` 短路 + 弱验签 fallback;仅读 `process.env.CREATOROS_VERDICT_MODE`(licensed / activation-only) |
| `frontend/src/proxy.ts` | 补 allowlist | `CREATOROS_VERDICT_MODE=activation-only` 时只放 `/activate/*`,其他 302 |
| `frontend/src/server/activation/license-file.server.ts` | **保留**,用途缩小 | 仅"展示副本"读端(供设置页看激活状态);不再是放行判定源 |
| `frontend/src/app/settings/**/*.tsx` | 补 UX 提示 | **[gate-F8]** verdict 状态旁加提示"本次会话使用启动时判定,吊销状态下次启动生效" |
| `.github/workflows/desktop-release.yml` | 加 CI secret | `CREATOROS_VERDICT_SIGNING_KEY_B64` / `CREATOROS_VERDICT_PUBKEY_B64` 双 secret(私钥进 Rust env,公钥进 sidecar env) |

---

## 6. 兼容性 / 迁移

- **老装机**:旧 `.license` 快照仍能被 Rust 决策链读(格式不变),verdict-bound token 是新增机制、不破坏既有数据。
- **首启升级**:老版本用户升级到新版后,Rust 启动照跑决策链;若 verdict.allowed=true,签 verdict-bound token → sidecar 起 → 无感;若 verdict.allowed=false,签 activation-only token → 用户看到激活页(与老流程一致体验)。
- **弱验签用户群**:老 gate-F2 弱验签用户升级后,决策链仍走 Rust,但 sidecar 状态机回退分支删除。诚实边界:**若真的还有"仅靠 sidecar service.check() 才认"的存量激活**(强验签为 false 且 Rust 决策链拒),这类用户升级后需重新走一次激活。风险面小(gate-F2 是过渡开关,L1s 上线后已默认关);升级说明加提示。
- **dev / web**:`isDesktopRuntime` 判 false 时仍走 web 分支(gate 立即放行),verdict-token 校验也仅在 desktop runtime 执行——web 端零影响。

---

## 7. 验收(必测锚,非教条)

**[gate-F6] 双平台维度**:除标注 dev/单测的 ac,以下每条**都要在 mac + Windows 真机各跑一遍**。

- ac-1 攻击者裸启:`CREATOROS_SIDECAR_HANDSHAKE_TOKEN=xxx CREATOROS_DESKTOP=1 node server.js`(无 verdict-token)→ sidecar exit(1),端口不 listen。
- **ac-1b [gate-F1]** 攻击者裸启不设 `CREATOROS_DESKTOP` 试图伪装 web:`node server.js`(纯裸,无任何 env)→ sidecar exit(1)(instrumentation 门要求 dev-mode marker 或 verdict-token 二选一,两个都没就拒);同款 `CREATOROS_DESKTOP=0` 显式 web 伪装也 exit(1)。
- ac-2 伪造 verdict-token:随手编一个 base64 塞进 env → sidecar exit(1)(签名校验失败)。
- ac-3 过期 verdict-token(改 payload.expiresAt 到过去)+ 假重签 → 校验失败(签名不通过)。
- ac-4 端口不匹配:token 里 port=A,启动 sidecar PORT=B → sidecar exit(1)。
- ac-5 licensed=true 真机四主链:扫码/转录/渲染/更新 verdict-bound token 全绿。
- ac-6 verdict.allowed=false 场景:未激活装机,Rust 签 activation-only token,sidecar 起,前端只能进 /activate,其他 route 302。
- **ac-6b [gate-F3]** activate→licensed 正向过渡:未激活装机 → 在 /activate 输入合法激活码 → license_activate 成功 → **Rust 壳 kill sidecar → 重签 licensed token → 重 spawn sidecar** → 前端显示"授权成功,应用初始化中"loading → sidecar ready 后进主应用;整个流程 P95 ≤ 10s(spawn 时间从 T-372 冷启动预算内取)。
- ac-7 revoked 场景:模拟 verdict.revoked=true,壳广播 license-decision → sidecar 收到降级信号(既有 event 复用,不新增),但当前 sidecar 进程仍用旧 token 跑到自然退出(下次启动 verdict-bound token 就签不出)。
- ac-8 dev 桌面 CREATOROS_DEV_MODE=1 + NODE_ENV=development 单开发者跑真流水线一遍绿(dev sidecar 跳过 verdict-token,走 web-style)。
- **ac-8b [gate-F6]** Windows 真机装包 → 未激活 → 激活 → licensed 四主链全绿(与 mac ac-5 平行)。
- ac-9 Rust 私钥泄露自审:`strings target/release/CreatorOS` grep 不到明文私钥(obfstr 生效);但**明确接受**"attach lldb dump 内存可提取"(诚实边界)。
- **ac-10 [gate-F4]** 离线首启:
  - `.license` 快照存在(licensed) + 离线(hosts 屏 license server) → 签 licensed token,主流程可用(**R-DESKTOP 永久离线可用**符合)。
  - `.license` 快照不存在 + 离线 → 签 activation-only + 提示"首次激活需联网"。
  - `.license` 快照存在 + 在线 status 心跳失败 → 使用快照签 token 不阻塞 setup(慢网时 setup 冷启动 P95 仍 ≤ 5s,符合 NFR-PERFORMANCE)。
- **ac-11 [gate-F7]** 老装机升级:
  - 老 gate-F2 弱验签存量装机升级 → 弱验签路径删除后 → verdict 决策链跑通(有合法 .license 快照)→ 无感继续。
  - 若跑不通 → 明确提示"需重新激活" + 领域数据(db/*.sqlite)hash 前后不变(数据保全,R-DESKTOP 硬约束)。
- **[gate-F8] `.license` 双数据源 UX**:settings 页面显示 verdict 状态时,追加一行提示"本次会话使用启动时判定,吊销状态下次启动生效"(避免用户看到"设置页显示已撤销但主应用仍能用"的疑惑)。

---

## 8. 诚实边界(对齐宪法 §16)

- **不假装防专业逆向**:攻击者 patch Rust 壳的 verdict 判定/签名密钥/verify 逻辑仍可绕。这与 T-372 §18 一致。兜底靠 T-450 完整性抽样把 Rust 壳自身纳入清单(拒未匹配)。
- **不假装防内存 dump**:sidecar 起来后 attacker attach 仍可读运行时状态;本 SPEC 只挡"起 sidecar"这道门,不挡门后。**[gate-F2 校准]** Rust 壳内私钥经 `obfstr` 混淆后仍在二进制 rdata 段——**attach lldb/gdb dump 可提取**,与本节其他"不防"边界口径一致。**"从不进 app 二进制"是错误表述,已改为"经混淆后进 Rust 二进制"**。
- **不假装防持有开发者私钥者**:私钥泄露 = 所有码可签 verdict-bound token = 完全失守。故私钥**只**存开发者机器/CI secret,不进包路径以外任何位置;等同 T-372 授权服务端私钥/T-408 minisign 私钥的严守边界。
- **诚实沉降**:sidecar 拿不到 verdict-bound token 时的错误提示对用户友好("授权校验失败,请重新激活或联系客服"),不泄露"签名不通过 vs 过期 vs 端口不匹配"的具体分支(减少绕道信号)。

---

## 9. 与 T-447/T-448/T-450 的合力

| 加固 | 挡什么 | 与本 SPEC 关系 |
|---|---|---|
| T-447 magic 握手(Rust 壳独有 magic) | 挡随包 node 裸启 | verdict-bound token 是更强版本的 magic;T-447 若已实施,verdict-token 可复用其传递通道(env)。**建议 T-447 收敛进本 SPEC** —— verdict-token 本身就是 T-447 想要的"随包 node 起不来"的实现。 |
| T-448 sidecar 内父进程自检 | patch 敏感的软自检 | 保留;verdict-token 是硬闸,T-448 是软纵深;两把锁 |
| T-450 完整性 hash 抽样 | patch Rust 壳/sidecar 关键文件 | 关键:让 attacker 无法 patch verdict-verify 逻辑或替换 verdict-signing 密钥常量;本 SPEC 依赖 T-450 兜底 |

---

## 10. 实施依赖顺序(**一次交付边界,非分阶段减法**)

**[gate-F5] 一次做完,不切阶段减法**(CLAUDE.md 铁律)。以下是实施拓扑依赖顺序,不是发货节奏:

1. 修 F1(收紧 isDesktopRuntime 门 + web/dev 分支绑 `CREATOROS_DEV_MODE` marker,决定信任边界)
2. 密钥生成脚本(verdict-keygen.mjs)+ CI double secret 落定(CREATOROS_VERDICT_SIGNING_KEY_B64 / CREATOROS_VERDICT_PUBKEY_B64)
3. license.rs `sign_verdict_token` + F4 离线 fallback(读 .license 快照签 token,联网心跳异步)+ lib.rs setup 顺序改造
4. sidecar 侧 `verdict-token-gate.ts` + activation-gate.server.ts 重写 + F3 graceful restart + proxy.ts allowlist
5. build-sidecar.mjs 公钥烘焙
6. 全部 ac-1~ac-11(含 F1/F3/F4/F6/F7 新增)单测 + 集成锚
7. mac + Windows 真机四主链
8. desktop-release.yml 加双 secret
9. 老装机升级验证

**任一步未绿,不算 T-451 完成**。

## 11. 待决 / 后续

- **DEC-1(SPEC 内已定):** 私钥传递 env 而非 fd,理由 §4 已述——公开可读但不可伪造,机密性靠签名。
- **DEC-2(SPEC 内已定):** verdict token 有效期 24h,理由是"覆盖单次进程寿命即可,不做长期凭证"。若用户觉得"应用连开 3 天"需要长期,提到 72h;不建议 >7d(rotate 成本升)。
- **OQ-1(gate 关闭时已定):T-447 已合并进本 SPEC 实施**——verdict-bound token 是 T-447 magic 的严格超集,BACKLOG T-447 标 ✅ 合并至 T-451。用户 2026-07-21 拍板确认。
- **OQ-2(gate-F8 已定):** revoked 强杀场景保守"下次启动拒",不做运行时强杀(避免破坏用户未保存工作);settings 页面显式 UX 提示"吊销下次启动生效"。

---

*本 SPEC 属安全/授权类,不送外部 gate(与 T-399/T-415 家族同规;送审=泄底牌);过 gate 走本地独立上下文 reviewer(cross-family MiniMax 或 Claude 独立会话代),reviewer 只喂宪法 + 本 SPEC 全文,不喂上游任务上下文防锚定。*
