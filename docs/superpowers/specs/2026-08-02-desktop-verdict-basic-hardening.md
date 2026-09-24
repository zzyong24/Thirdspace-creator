# CreatorOS 桌面 verdict 基础加固 SPEC

> 任务：T-656  
> 用户确认：2026-08-02，用户在获知客户端内置 verdict 私钥边界后确认“先把基本的防护加上”。  
> 阶段：`4-build` 增量安全切片；不改 UI、数据库归属、Growth/Activation Manager 协议。  
> 诚实边界：本 SPEC 消除低成本通用旁路和可直接 grep 的私钥靶点，不宣称客户端私钥不可提取，也不宣称达到 VMProtect/WinLicense 强度。

## 1. 问题与目标

当前 Rust 壳根据本地授权 verdict，用 Ed25519 私钥签发短时 token；Node Sidecar 内置对应公钥，验签通过后才进入 `licensed` 或 `activation-only` 模式。方向仍保留，但存在两个已证实问题：

1. `verdict-token-gate.ts` 存在仅由两个环境变量触发的 smoke bypass，正式 Sidecar 被攻击者直接启动时也能设置，绕过整个 token 验签。
2. `CREATOROS_VERDICT_SIGNING_KEY_B64` 由 `option_env!` 作为可定位字符串编入 Rust，且用 `[T451-BOUND]` sentinel 辅助解析；这让低成本静态扫描比必要程度更容易。该私钥即便混淆后仍可被专业逆向提取，因此只能作为本地成本防线。

本任务目标：

- 正式运行时代码不存在任何 smoke bypass；生产与打包冒烟共用同一 token 验签路径。
- Rust 二进制不再包含原始 base64 私钥、`[T451-BOUND]` sentinel 或运行时读取私钥环境变量的代码。
- 打包期仍 fail-closed 校验私钥/公钥配对，最终安装包增加静态泄漏扫描。
- 已授权、未授权、坏签名、错端口、过期、缺 token 的语义保持明确且可测试。

## 2. 不在本任务范围

- 不新增或修改 Growth/Activation Manager API；现有 AM HTTP 响应签名绑定 request-target/host/date/body，不能冒充跨用途 verdict ticket。
- 不把“每次启动随机密钥”冒充信任根。Sidecar 若同时接收随机公钥和签名，攻击者也能自建一对密钥。
- 不接入 VMProtect/WinLicense，不实现 Rust 函数虚拟化。
- 不实现全量 sidecar 落盘加密、不改变本地离线授权政策。
- 不宣称防住可 patch Rust/Node、attach debugger、dump 运行时内存的本机所有者。

## 3. 方案

### 3.1 删除生产 smoke bypass

`frontend/src/server/verdict-token-gate.ts` 删除 `CREATOROS_SMOKE_BYPASS_VERDICT` 分支。保留的唯一开发豁免仍为：

```text
NODE_ENV != production && CREATOROS_DEV_MODE == 1
```

该豁免只能存在于不会进入正式 Sidecar 的开发入口或编译期开发构建中。任何可安装、可分发的正式
Sidecar 都不得根据运行时 `NODE_ENV`、`CREATOROS_DEV_MODE` 或其它调用者可控环境变量跳过 token；
即使调用者同时设置 `NODE_ENV=development` 与 `CREATOROS_DEV_MODE=1`，缺 token、坏签名、过期或
端口不符仍必须退出。

### 3.2 冒烟改走真实签名

`obfuscate.mjs --smoke-only` 不再设置 bypass。它的 **smoke 驱动进程**使用打包期已有的 verdict 私钥为本次随机端口签一个有效期不超过 5 分钟的 `licensed` 测试 token，并传入 Sidecar。签名 payload 与 Rust 生产 token 同结构：

```json
{
  "v": 1,
  "mode": "licensed",
  "machineId": "build-smoke",
  "sidecarPort": 0,
  "expiresAt": "ISO timestamp",
  "issuedAt": "ISO timestamp",
  "nonce": "random hex",
  "licenseMode": "build_smoke"
}
```

实际 `sidecarPort` 使用冒烟刚分配的端口。签名辅助函数放在桌面打包脚本目录，复用 `verdict-key-material.mjs` 的规范化解码，禁止复制第二套宽松密钥解析。

私钥只额外放行给 smoke 驱动进程和最终 Cargo/Tauri 编译子进程；Next build、混淆 worker、字节码 worker、诱饵及其它脚本继续剥离私钥。smoke 驱动完成签名后，必须从实际 Sidecar 的 child env 中显式删除 `CREATOROS_VERDICT_SIGNING_KEY_B64` 与 `CREATOROS_ALLOW_VERDICT_SIGNING_KEY`，不得通过现有 `...process.env` 继续继承。该 child env 构造提取为可单测纯函数，测试同时证明真实 token仍存在、私钥变量不存在。

Windows production closure 与安装候选验收同样执行最小环境白名单：默认传给 Next/NCC/Pi bundle、
runtime 组装、setup 和普通诊断子进程的环境必须剥离 signing seed 与 allow 变量；只有专用 smoke
签名进程和 Cargo/Tauri 编译子进程可显式注入。安装后的只读泄漏扫描由已获准持有 seed 的 smoke
驱动/package controller 在本进程完成；不得再派生携带 seed 的扫描子进程，也不能把 seed 留在 setup
或诊断环境。测试枚举生产链每类子进程并断言只有获准进程含 seed。

### 3.2.1 密钥输入一次性迁移

package 前置校验、smoke 签名与 Cargo `build.rs` 三处只接受同一规范输入：**32 字节 raw seed 的 canonical base64url、无 padding、无空白、无换行、无 sentinel**。`[T451-BOUND]` 或任何带换行的旧值必须在重型构建开始前硬失败，不做静默清理。

正式构建/CI 的 `CREATOROS_VERDICT_SIGNING_KEY_B64` 必须先更新为现有 seed 去除历史 sentinel/换行后的 canonical 值；`CREATOROS_VERDICT_PUBKEY_B64` 保持对应 raw 32 字节公钥的 canonical 标准 base64。迁移只改变 secret 表示，不轮换密钥对。构建测试必须锁定：legacy sentinel 输入在 package 前置校验、smoke helper 和 Cargo 解析中得到同一种拒绝语义，不能出现前置通过、后段失败。

### 3.3 构建期封装私钥，运行时只读掩码 blob

`frontend/src-tauri/build.rs`：

1. 按 §3.2.1 的唯一 canonical 规则读取并严格解码 `CREATOROS_VERDICT_SIGNING_KEY_B64` 为 32 字节 Ed25519 seed；缺失/非法时正式打包硬失败。
2. 使用 OS 随机源生成 32 字节 mask，写入 `$OUT_DIR/verdict-signing-key.bin`：`mask[32] || (seed XOR mask)[32]`。
3. 立即清理构建期临时 seed buffer；不得把 base64、sentinel 或私钥写入日志。

`license.rs`：

- 用 `include_bytes!` 读取 64 字节 blob，运行时 XOR 重组 32 字节 seed，构造 `SigningKey` 后清零临时数组。
- 删除 `option_env!("CREATOROS_VERDICT_SIGNING_KEY_B64")`、base64 解码、换行清理和 `[T451-BOUND]` 逻辑。
- blob 长度错误时 fail-closed，不签 token。

这只能消除静态明文靶点：mask 与 masked seed 均在客户端，专业人员仍能分析重组逻辑或 dump 内存。

### 3.4 最终产物泄漏 Gate

新增独立的 `verifyPackagedVerdictHardening()`，在 **Tauri build 完成后**执行，不挂在仅 macOS 生效的 `verifyPackagedTlsRuntime()` 里面。平台路径如下：

- macOS：用现有 `findShellBinary()` 定位 `.app/Contents/MacOS/CreatorOS`；扫描 `.app/Contents/Resources/sidecar.tar.gz`，并继续要求它与本轮 canonical tar 字节相同。
- Windows：用 `findShellBinary()` 定位最终 `target/<profile>/CreatorOS.exe`；先扫描本轮 canonical `src-tauri/sidecar.tar.gz`，再由现有 Windows NSIS 安装候选 Gate 安装 setup，读取 `$INSTDIR/runtime-images/runtime-current.txt`。pointer 必须是单行、非空，且 runtimeId 只允许 `[A-Za-z0-9._-]`，禁止分隔符与 `..`；经目录边界校验后，调用同一可复用扫描器递归扫描 `$INSTDIR/runtime-images/$runtimeId/sidecar` 实体目录。缺 pointer、非法 ID、目录逃逸、目录缺失或读取失败均 fail-closed。
- tar 不扫描 gzip 压缩字节；用 Node `createGunzip()` 流式读取解压后的 tar 内容并保留跨 chunk overlap，避免整份约 1GB runtime 读入内存。Windows 已安装目录逐文件流式扫描，符号链接不跟随。

扫描规则：

- Rust shell 不得包含当前构建输入的原始 base64 私钥字节串。
- Rust shell 与 sidecar tar 不得包含 `[T451-BOUND]`。
- Sidecar tar/Windows 已安装 runtime 不得包含 `CREATOROS_SMOKE_BYPASS_VERDICT`。
- Sidecar 必须仍包含匹配的 verdict 公钥，且用同一私钥生成的测试 token可通过验签。

任一命中即打包失败；错误只报告命中类型与相对文件，不回显私钥。路径选择、gzip 流式跨块命中、Windows 目录命中与读取失败都由纯函数/临时夹具测试覆盖。

## 4. 安全不变量

| ID | 不变量 |
| --- | --- |
| SEC-656-01 | 正式 Sidecar 不存在调用者可控的运行时环境变量旁路；缺少合法 token 必须退出。 |
| SEC-656-02 | 冒烟通过意味着真实 Ed25519 token 验签链通过，不允许测试专用生产分支。 |
| SEC-656-03 | Sidecar 只含公钥；签名 seed 只进入 smoke 驱动、Cargo 构建和 Rust shell 的掩码 blob，实际 Sidecar child env 不得继承。 |
| SEC-656-04 | 错端口、过期、坏签名、缺 token均 fail-closed。 |
| SEC-656-05 | 任何日志、错误、manifest、sidecar tar 不得回显原始私钥。 |
| SEC-656-06 | 本地 verdict 不替代 Growth/中转站对付费模型请求的服务端授权与额度终判。 |

## 5. 文件影响

| 文件 | 变更 |
| --- | --- |
| `frontend/src/server/verdict-token-gate.ts` | 删除 smoke bypass，保持生产 fail-closed。 |
| `frontend/scripts/desktop/obfuscate.mjs` | 使用真实短时签名 token 冒烟。 |
| `frontend/scripts/desktop/verdict-key-material.mjs` | 导出严格 seed 解码及 smoke token 签名辅助。 |
| `frontend/src-tauri/build.rs` | 生成随机掩码私钥 blob。 |
| `frontend/src-tauri/src/license.rs` | 从 blob 重组 seed，删除 base64/sentinel 静态靶点。 |
| `frontend/scripts/desktop/package.mjs` | 仅向 smoke 驱动与 Cargo 放行签名 seed；增加双平台最终泄漏扫描。 |
| `.github/workflows/desktop-release.yml` | Windows NSIS 候选安装后复用扫描器检查真实 runtime。 |
| `frontend/scripts/desktop/*.test.mjs`、Rust tests | 覆盖签名、fail-closed、泄漏扫描与重组。 |

## 6. 验收标准

- **AC-656-01**：正式产物设置历史 bypass 变量，或同时设置 `NODE_ENV=development` 与 `CREATOROS_DEV_MODE=1` 后，缺 token仍退出；源码及最终 sidecar tar grep 不到历史 bypass 变量名，开发豁免只在不会打入正式 Sidecar 的开发入口生效。
- **AC-656-02**：打包冒烟使用真实签名 token成功启动；删除/篡改签名后冒烟失败。
- **AC-656-03**：Rust 单测证明 64 字节 mask blob可还原原 seed，错长度拒绝，临时 key buffer离开签名路径前清零。
- **AC-656-04**：macOS 最终 shell + `.app` 内 tar、Windows 最终 shell + canonical tar + NSIS 安装后的 current runtime，均扫描不到构建输入的 base64 私钥、sentinel 与 bypass 名；目标缺失或读取失败同样阻止出包。
- **AC-656-05**：现有 licensed、activation-only、过期、错端口、坏签名测试保持通过。
- **AC-656-06**：打包脚本及 Windows production closure 的普通子进程继续拿不到私钥；只有 smoke 驱动/package controller 和 Cargo/Tauri 编译得到，smoke 实际启动的 Sidecar、Next/NCC/Pi bundle、runtime 组装、setup、普通诊断及扫描 child env 均明确不含私钥变量；安装后泄漏扫描在已获准的 controller 本进程完成。
- **AC-656-08**：带 `[T451-BOUND]`、换行、padding 或非 canonical 字符的旧 signing seed 在 package 前、smoke helper 与 Cargo 中一致硬失败；CI 更新为 canonical seed 后才允许正式构建。
- **AC-656-07**：定向 Node/Vitest、Rust license tests、desktop release workflow tests、boundary scan、orphan scan 与 reconcile均有新鲜证据；如全局既有失败不属于本任务，必须在 evidence 中明确隔离。

## 7. 决策与后续边界

本任务选择“消除通用旁路 + 消除静态明文靶点”，因为这是 CreatorOS 仓内可立即闭环、且不会伪造安全结论的最小有效范围。真正让客户端不持有 verdict 私钥，需要 Activation Manager/Growth 签发 purpose-bound、短期、可离线策略明确的 verdict ticket；该能力必须与中转站的服务端授权终判一起设计，不能把现有 AM HTTP 响应签名直接改名复用。
